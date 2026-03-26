from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request

from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import os
import logging
import hashlib
import secrets
import math
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any, Tuple
import uuid
from datetime import datetime, timezone, timedelta
from html import unescape
from urllib.parse import urlencode
from passlib.context import CryptContext
import requests
import base64
from plisio_helper import PlisioHelper
import re


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)  # Don't override if already set

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
    raise ValueError("MONGO_URL environment variable is required")

db_name = os.environ.get('DB_NAME', 'kayicom')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Password hashing
# Use bcrypt directly with explicit rounds to avoid compatibility issues
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# Create the main app

import base64
from fastapi import File, UploadFile
import mimetypes

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

# User Models
class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str = Field(default_factory=lambda: "")
    role: str = "customer"  # customer, seller, or admin
    referral_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8].upper())
    referred_by: Optional[str] = None  # referral_code of referrer
    referral_balance: float = 0.0  # Balance from referrals
    wallet_balance: float = 0.0  # Store credit / refunds
    credits_balance: int = 0  # Loyalty credits (1000 credits = $1)
    is_blocked: bool = False
    blocked_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None
    # Seller fields
    seller_status: Optional[str] = None  # pending_kyc, kyc_submitted, approved, rejected
    seller_store_name: Optional[str] = None
    seller_bio: Optional[str] = None
    seller_phone: Optional[str] = None
    seller_address: Optional[str] = None
    seller_city: Optional[str] = None
    seller_country: Optional[str] = None
    seller_date_of_birth: Optional[str] = None
    seller_selling_platforms: Optional[str] = None
    seller_years_experience: Optional[int] = None
    seller_selling_proof_url: Optional[str] = None
    seller_kyc_document_url: Optional[str] = None
    seller_kyc_selfie_url: Optional[str] = None
    seller_kyc_submitted_at: Optional[datetime] = None
    seller_kyc_reviewed_at: Optional[datetime] = None
    seller_kyc_rejection_reason: Optional[str] = None
    seller_approved_categories: Optional[List[str]] = None  # categories admin approved
    seller_commission_rate: float = 10.0  # default 10% commission to platform
    seller_balance: float = 0.0  # earnings available for withdrawal
    seller_total_earned: float = 0.0
    seller_total_orders: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def _generate_unique_customer_id() -> str:
    """Generate a short, human-friendly customer id like KC-12345678."""
    import random

    for _ in range(20):
        cid = f"KC-{random.randint(10_000_000, 99_999_999)}"
        existing = await db.users.find_one({"customer_id": cid}, {"_id": 1})
        if not existing:
            return cid
    # fallback
    return f"KC-{str(uuid.uuid4())[:8].upper()}"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ==================== SELLER MODELS ====================

class SellerApplicationRequest(BaseModel):
    store_name: str
    bio: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    date_of_birth: Optional[str] = None
    selling_platforms: Optional[str] = None
    years_experience: Optional[int] = None
    selling_proof_url: Optional[str] = None


class SellerKYCSubmit(BaseModel):
    document_url: str
    selfie_url: str


class SellerCategoryAccessRequest(BaseModel):
    categories: List[str]


class AdminSellerReview(BaseModel):
    action: str  # approve or reject
    reason: Optional[str] = None
    commission_rate: Optional[float] = None


class AdminCategoryAccessReview(BaseModel):
    user_id: str
    categories: List[str]
    action: str  # approve or reject


# ==================== SELLER OFFER MODELS ====================

class SellerOfferCreate(BaseModel):
    product_id: str
    price: float
    delivery_type: str = "automatic"
    stock_available: bool = True
    custom_title: Optional[str] = None
    description: Optional[str] = None
    region: Optional[str] = None
    stock_quantity: Optional[int] = None
    notes: Optional[str] = None


# ==================== ESCROW / DISPUTE / MESSAGE MODELS ====================

class EscrowConfirmRequest(BaseModel):
    action: str  # confirm or dispute
    reason: Optional[str] = None


class DisputeMessageCreate(BaseModel):
    content: str
    evidence_url: Optional[str] = None


class AdminDisputeResolve(BaseModel):
    resolution: str  # buyer_wins or seller_wins
    reason: Optional[str] = None
    evidence_url: Optional[str] = None


class MessageCreate(BaseModel):
    order_id: str
    receiver_id: str
    content: str


class PrePurchaseInquiry(BaseModel):
    seller_id: str
    product_id: Optional[str] = None
    content: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=6)


def _email_match(value: str) -> Dict[str, Any]:
    """Build a case-insensitive exact match filter for emails."""
    normalized = value.strip()
    return {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}


DEFAULT_SUBSCRIPTION_ORDERS_BASE = 1200
DEFAULT_SUBSCRIPTION_ORDERS_SPAN = 700
DEFAULT_CATEGORY_ORDERS_BASE = {
    "giftcard": 1300,
    "topup": 1250,
    "service": 1180,
    "subscription": DEFAULT_SUBSCRIPTION_ORDERS_BASE,
    "default": 1120,
}
DEFAULT_CATEGORY_ORDERS_SPAN = 750
NETFLIX_DEFAULT_ORDERS_COUNT = 1568
ORDER_PAYMENT_TIMEOUT_MINUTES = max(1, int(os.environ.get("ORDER_PAYMENT_TIMEOUT_MINUTES", "15")))
CRYPTO_EXCHANGE_ENABLED = os.environ.get("CRYPTO_EXCHANGE_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
_order_auto_cancel_task: Optional[asyncio.Task] = None
_subscription_notification_task: Optional[asyncio.Task] = None
_escrow_release_task: Optional[asyncio.Task] = None
_dispute_deadline_task: Optional[asyncio.Task] = None
SUBSCRIPTION_NOTIFICATION_INTERVAL_SECONDS = max(
    60,
    int(os.environ.get("SUBSCRIPTION_NOTIFICATION_INTERVAL_SECONDS", "300")),
)


def _stable_bucket(value: str, size: int) -> int:
    if size <= 0:
        return 0
    key = (value or "default").encode("utf-8")
    digest = hashlib.sha256(key).hexdigest()
    return int(digest[:8], 16) % size


def _default_orders_count_for_product(product: Optional[Dict[str, Any]]) -> int:
    if not isinstance(product, dict):
        return 1200
    name = str(product.get("name") or "").strip().lower()
    category = str(product.get("category") or "").strip().lower()
    is_subscription = bool(product.get("is_subscription")) or category == "subscription"
    seed = "|".join([
        str(product.get("id") or ""),
        str(product.get("parent_product_id") or ""),
        str(product.get("variant_name") or ""),
        name,
        category,
    ])
    if "netflix" in name and is_subscription:
        return NETFLIX_DEFAULT_ORDERS_COUNT
    if is_subscription:
        offset = _stable_bucket(seed, DEFAULT_SUBSCRIPTION_ORDERS_SPAN)
        return int(DEFAULT_SUBSCRIPTION_ORDERS_BASE + offset)
    base = int(DEFAULT_CATEGORY_ORDERS_BASE.get(category) or DEFAULT_CATEGORY_ORDERS_BASE["default"])
    offset = _stable_bucket(seed, DEFAULT_CATEGORY_ORDERS_SPAN)
    return int(base + offset)


def _normalize_orders_count_for_product(product: Dict[str, Any]) -> int:
    default_value = _default_orders_count_for_product(product)
    try:
        current = int(product.get("orders_count", 0) or 0)
    except Exception:
        current = 0
    if current <= 0:
        return default_value
    return max(current, default_value)


def _parse_datetime_utc(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _matched_count(result: Any) -> int:
    if isinstance(result, dict):
        return int(result.get("matched_count", 0) or 0)
    return int(getattr(result, "matched_count", 0) or 0)


def _normalize_blog_tags(tags: Optional[List[str]]) -> List[str]:
    seen = set()
    cleaned: List[str] = []
    for value in tags or []:
        tag = str(value or "").strip()
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(tag)
    return cleaned


def _slugify_text(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return slug or "post"


def _strip_html_to_text(value: Any) -> str:
    text = str(value or "")
    # Remove script/style blocks fully before stripping other tags.
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", text)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</(p|div|li|h1|h2|h3|h4|h5|h6|section|article|blockquote|tr)>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _derive_blog_excerpt(content: str, limit: int = 180) -> str:
    text = _strip_html_to_text(content)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)].rstrip() + "..."


def _derive_blog_seo_description(explicit_value: Optional[str], excerpt: Optional[str], content: str) -> str:
    if explicit_value is not None and str(explicit_value).strip():
        explicit_clean = _strip_html_to_text(explicit_value)
        if explicit_clean:
            return explicit_clean
    if excerpt and str(excerpt).strip():
        excerpt_clean = _strip_html_to_text(excerpt)
        if excerpt_clean:
            return excerpt_clean
    return _derive_blog_excerpt(content, 160)


PRODUCT_CATEGORY_LABELS = {
    "giftcard": "Gift Cards",
    "topup": "Game Top-Ups",
    "subscription": "Subscriptions",
    "service": "Digital Services",
    "crypto": "Crypto",
}


def _compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", _strip_html_to_text(value)).strip()


def _truncate_text(value: str, limit: int) -> str:
    cleaned = _compact_text(value)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: max(0, limit - 3)].rstrip() + "..."


def _format_product_category_label(value: Any) -> str:
    key = str(value or "").strip().lower()
    if not key:
        return ""
    if key in PRODUCT_CATEGORY_LABELS:
        return PRODUCT_CATEGORY_LABELS[key]
    return str(value).strip().replace("_", " ").title()


def _derive_product_seo_title(explicit_value: Optional[str], product: Dict[str, Any]) -> str:
    explicit_clean = _compact_text(explicit_value)
    if explicit_clean:
        return _truncate_text(explicit_clean, 70)

    name = _compact_text(product.get("name") or "Digital Product")
    variant_name = _compact_text(product.get("variant_name"))
    region = _compact_text(product.get("region"))
    category_label = _format_product_category_label(product.get("category"))

    title_parts: List[str] = [name]
    if variant_name and variant_name.lower() not in name.lower():
        title_parts.append(variant_name)
    elif region and region.lower() not in name.lower():
        title_parts.append(region)
    title = " - ".join([part for part in title_parts if part])

    if category_label and category_label.lower() not in title.lower():
        title = f"{title} | {category_label}"
    return _truncate_text(f"{title} | KayiCom", 70)


def _derive_product_seo_description(explicit_value: Optional[str], product: Dict[str, Any]) -> str:
    explicit_clean = _compact_text(explicit_value)
    if explicit_clean:
        return _truncate_text(explicit_clean, 160)

    name = _compact_text(product.get("name") or "digital product")
    description = _compact_text(product.get("description") or "")
    category_label = _format_product_category_label(product.get("category"))
    currency = _compact_text(product.get("currency") or "USD") or "USD"
    delivery_type = _compact_text(product.get("delivery_type") or "")
    in_stock = bool(product.get("stock_available", True))

    try:
        price_value = float(product.get("price", 0) or 0)
    except Exception:
        price_value = 0.0

    base_line = description or f"Buy {name} at KayiCom."
    detail_parts: List[str] = []
    if category_label:
        detail_parts.append(category_label)
    if price_value > 0:
        detail_parts.append(f"Price: {currency} {price_value:.2f}")
    if delivery_type:
        detail_parts.append(f"{delivery_type.title()} delivery")
    detail_parts.append("In stock" if in_stock else "Out of stock")

    summary = base_line
    if detail_parts:
        summary = f"{summary} {' | '.join(detail_parts)}."
    summary = f"{summary} Secure checkout on KayiCom."
    return _truncate_text(summary, 160)


def _normalize_product_doc(product: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(product or {})
    normalized["seo_title"] = _derive_product_seo_title(normalized.get("seo_title"), normalized)
    normalized["seo_description"] = _derive_product_seo_description(normalized.get("seo_description"), normalized)
    if not normalized.get("slug"):
        normalized["slug"] = _slugify_text(normalized.get("name") or normalized.get("id") or "product")
    return normalized


async def _generate_unique_blog_slug(
    title: str,
    preferred_slug: Optional[str] = None,
    exclude_post_id: Optional[str] = None,
) -> str:
    base = _slugify_text(preferred_slug if preferred_slug is not None else title)
    candidate = base
    idx = 2
    while True:
        existing = await db.blog_posts.find_one({"slug": candidate}, {"_id": 0, "id": 1})
        if not existing or existing.get("id") == exclude_post_id:
            return candidate
        candidate = f"{base}-{idx}"
        idx += 1


async def _generate_unique_product_slug(
    name: str,
    preferred_slug: Optional[str] = None,
    exclude_product_id: Optional[str] = None,
) -> str:
    base = _slugify_text(preferred_slug if preferred_slug is not None else name)
    candidate = base
    idx = 2
    while True:
        existing = await db.products.find_one({"slug": candidate}, {"_id": 0, "id": 1})
        if not existing or existing.get("id") == exclude_product_id:
            return candidate
        candidate = f"{base}-{idx}"
        idx += 1


def _normalize_blog_post_doc(post: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(post or {})
    normalized["tags"] = _normalize_blog_tags(normalized.get("tags"))
    normalized["slug"] = _slugify_text(normalized.get("slug") or normalized.get("title") or normalized.get("id") or "post")
    normalized["excerpt"] = (_strip_html_to_text(normalized.get("excerpt")) if normalized.get("excerpt") is not None else None) or None
    normalized["seo_title"] = (str(normalized.get("seo_title")).strip() if normalized.get("seo_title") is not None else None) or None
    normalized["seo_description"] = _derive_blog_seo_description(
        normalized.get("seo_description"),
        normalized.get("excerpt"),
        str(normalized.get("content") or ""),
    )
    normalized["cta_label"] = (str(normalized.get("cta_label")).strip() if normalized.get("cta_label") is not None else None) or None
    normalized["cta_url"] = (str(normalized.get("cta_url")).strip() if normalized.get("cta_url") is not None else None) or None
    for field in ["created_at", "updated_at", "published_at"]:
        value = normalized.get(field)
        if isinstance(value, str):
            try:
                normalized[field] = datetime.fromisoformat(value)
            except Exception:
                normalized[field] = None
    return normalized

# Product Models
class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: Optional[str] = None
    name: str
    description: str
    category: str  # giftcard, topup, subscription, service, crypto
    price: float
    currency: str = "USD"
    image_url: Optional[str] = None
    stock_available: bool = True
    delivery_type: str = "automatic"  # automatic or manual
    delivery_time: Optional[str] = None  # "instant", "1h", "24h"
    seller_id: Optional[str] = None  # null = admin product, set = seller product
    product_status: str = "approved"  # approved, pending_review, rejected (seller products start as pending)
    seller_offer_count: int = 0  # how many sellers offer this product
    subscription_duration_months: Optional[int] = None  # For subscriptions: 1-12 months
    subscription_auto_check: bool = False  # Auto-check if subscription is still valid
    variant_name: Optional[str] = None  # For variants like "100 Diamonds", "500 UC", etc
    parent_product_id: Optional[str] = None  # Link to parent product for variants
    requires_player_id: bool = False  # For topup products that need player ID
    player_id_label: Optional[str] = None  # Custom label: UID, Character ID, etc
    requires_credentials: bool = False  # For subscription/services that need login credentials
    credential_fields: Optional[List[str]] = None  # e.g. ["email","password"]
    region: Optional[str] = None  # For gift cards: US, EU, ASIA, etc.
    giftcard_category: Optional[str] = None  # For gift cards: Shopping, Gaming, Entertainment, etc.
    giftcard_subcategory: Optional[str] = None  # For gift cards: Amazon, Steam, etc.
    g2bulk_product_id: Optional[int] = None  # G2Bulk product ID for gift card/voucher auto-delivery
    g2bulk_game_code: Optional[str] = None  # G2Bulk game code for topup (e.g. "pubgm", "mlbb", "free_fire")
    g2bulk_catalogue_id: Optional[str] = None  # G2Bulk catalogue name/id for topup denomination (e.g. "60 UC")
    is_subscription: bool = False  # Track if this triggers referral payout
    orders_count: int = 0  # Total purchased quantity for this product
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductCreate(BaseModel):
    name: str
    description: str
    category: str
    price: float
    currency: str = "USD"
    image_url: Optional[str] = None
    stock_available: bool = True
    delivery_type: str = "automatic"
    delivery_time: Optional[str] = None
    seller_id: Optional[str] = None
    subscription_duration_months: Optional[int] = None
    subscription_auto_check: bool = False
    variant_name: Optional[str] = None
    parent_product_id: Optional[str] = None
    requires_player_id: bool = False
    player_id_label: Optional[str] = None
    requires_credentials: bool = False
    credential_fields: Optional[List[str]] = None
    region: Optional[str] = None
    giftcard_category: Optional[str] = None
    giftcard_subcategory: Optional[str] = None
    g2bulk_product_id: Optional[int] = None
    g2bulk_game_code: Optional[str] = None
    g2bulk_catalogue_id: Optional[str] = None
    is_subscription: bool = False
    orders_count: int = 0
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    image_url: Optional[str] = None
    stock_available: Optional[bool] = None
    delivery_type: Optional[str] = None
    subscription_duration_months: Optional[int] = None
    subscription_auto_check: Optional[bool] = None
    variant_name: Optional[str] = None
    parent_product_id: Optional[str] = None
    requires_player_id: Optional[bool] = None
    player_id_label: Optional[str] = None
    requires_credentials: Optional[bool] = None
    credential_fields: Optional[List[str]] = None
    region: Optional[str] = None
    giftcard_category: Optional[str] = None
    giftcard_subcategory: Optional[str] = None
    g2bulk_product_id: Optional[int] = None
    g2bulk_game_code: Optional[str] = None
    g2bulk_catalogue_id: Optional[str] = None
    is_subscription: Optional[bool] = None
    orders_count: Optional[int] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

# Order Models
class OrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    player_id: Optional[str] = None  # For topup products
    credentials: Optional[Dict[str, str]] = None  # For subscription/services (email/password, etc)
    seller_id: Optional[str] = None  # Track which seller owns this item

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_email: str
    items: List[OrderItem]
    total_amount: float
    subtotal_amount: Optional[float] = None
    discount_amount: Optional[float] = None
    coupon_code: Optional[str] = None
    coupon_usage_recorded: Optional[bool] = None
    credits_awarded: Optional[int] = None
    credits_recorded: Optional[bool] = None
    currency: str = "USD"
    payment_method: str  # wallet, crypto_plisio, paypal, skrill, moncash, natcash, binance_pay, binance_pay_manual, zelle, cashapp
    payment_status: str = "pending"  # pending, paid, failed, cancelled
    order_status: str = "pending"  # pending, processing, completed, cancelled
    payment_proof_url: Optional[str] = None
    transaction_id: Optional[str] = None
    plisio_invoice_id: Optional[str] = None
    plisio_invoice_url: Optional[str] = None
    delivery_info: Optional[Dict[str, Any]] = None
    refunded_at: Optional[datetime] = None
    refunded_amount: Optional[float] = None
    subscription_start_date: Optional[datetime] = None
    subscription_end_date: Optional[datetime] = None  # For subscription orders
    # Escrow fields
    escrow_status: Optional[str] = None  # held, buyer_confirmed, released, disputed, refunded
    escrow_held_at: Optional[datetime] = None
    escrow_confirmed_at: Optional[datetime] = None
    escrow_release_at: Optional[datetime] = None  # 3 days after buyer confirms
    escrow_released_at: Optional[datetime] = None
    dispute_id: Optional[str] = None
    # Seller offer reference
    seller_offer_id: Optional[str] = None
    natcash_reference: Optional[str] = None
    auto_delivery_failed_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderCreate(BaseModel):
    items: List[OrderItem]
    payment_method: str
    coupon_code: Optional[str] = None


# ==================== COUPON MODELS ====================

class Coupon(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    discount_type: str  # percent or fixed
    discount_value: float
    max_discount_amount: Optional[float] = None
    active: bool = True
    min_order_amount: float = 0.0
    usage_limit: int = 1
    max_uses_per_user: int = 1
    used_count: int = 0
    user_usage: dict = Field(default_factory=dict)
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CouponCreate(BaseModel):
    code: str
    discount_type: str  # percent or fixed
    discount_value: float
    max_discount_amount: Optional[float] = None
    active: bool = True
    min_order_amount: float = 0.0
    usage_limit: int = 1
    max_uses_per_user: int = 1
    expires_at: Optional[datetime] = None

class CouponUpdate(BaseModel):
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    max_discount_amount: Optional[float] = None
    active: Optional[bool] = None
    min_order_amount: Optional[float] = None
    usage_limit: Optional[int] = None
    max_uses_per_user: Optional[int] = None
    expires_at: Optional[datetime] = None

# ==================== PRODUCT CODE MODELS (Auto-Delivery) ====================

class ProductCode(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    code: str
    status: str = "available"  # available, delivered, reserved
    order_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    delivered_at: Optional[datetime] = None


class ProductCodeAdd(BaseModel):
    code: str


class ProductCodeBulkAdd(BaseModel):
    codes: List[str]


# Payment Models
class ManualPaymentProof(BaseModel):
    order_id: str
    transaction_id: str
    payment_proof_url: str

# Settings Models
class SiteSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "site_settings"
    site_name: str = "KayiCom"
    logo_url: Optional[str] = None
    primary_color: str = "#3b82f6"
    secondary_color: str = "#8b5cf6"
    support_email: str = "support@kayicom.com"
    plisio_api_key: Optional[str] = None
    binance_pay_api_key: Optional[str] = None
    binance_pay_secret_key: Optional[str] = None
    binance_pay_proxy_url: Optional[str] = None
    mtcgame_api_key: Optional[str] = None
    gosplit_api_key: Optional[str] = None
    z2u_api_key: Optional[str] = None
    g2bulk_api_key: Optional[str] = None
    natcash_usd_htg_rate: Optional[float] = None  # e.g. 135.0 (1 USD = 135 HTG)
    natcash_callback_secret: Optional[str] = None  # secret key for Automate SMS callback auth
    resend_api_key: Optional[str] = None
    resend_from_email: Optional[str] = None  # e.g. "KayiCom <no-reply@yourdomain.com>"
    telegram_notifications_enabled: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_admin_chat_id: Optional[str] = None
    announcement_enabled: Optional[bool] = False
    announcement_message: Optional[str] = None
    trustpilot_enabled: Optional[bool] = False
    trustpilot_business_id: Optional[str] = None
    product_categories: Optional[List[str]] = ["giftcard", "topup", "subscription", "service"]
    category_images: Optional[Dict[str, str]] = {}
    whatsapp_support_enabled: Optional[bool] = True
    whatsapp_support_number: Optional[str] = "50939308318"
    whatsapp_support_message: Optional[str] = "Hello! I need support with KayiCom."
    crisp_enabled: Optional[bool] = False
    crisp_website_id: Optional[str] = None
    refund_policy: Optional[str] = (
        "Refund Policy\n"
        "\n"
        "Digital goods are non-refundable once delivered or redeemed.\n"
        "If you do not receive your order or receive the wrong item, contact support within 24 hours.\n"
        "Approved refunds are issued as wallet credit unless required otherwise by law.\n"
        "Chargebacks or fraudulent activity may result in account restrictions."
    )
    giftcard_taxonomy: Optional[List[Dict[str, Any]]] = [
        {"name": "Shopping", "subcategories": []},
        {"name": "Gaming", "subcategories": []},
        {"name": "Entertainment", "subcategories": []},
        {"name": "Food", "subcategories": []},
        {"name": "Travel", "subcategories": []},
        {"name": "Other", "subcategories": []},
    ]
    # Payment Gateway Settings
    payment_gateways: Optional[dict] = {
        "paypal": {"enabled": True, "email": "", "instructions": ""},
        "airtm": {"enabled": True, "email": "", "instructions": ""},
        "skrill": {"enabled": True, "email": "", "instructions": ""},
        "moncash": {"enabled": True, "email": "", "instructions": ""},
        "natcash": {"enabled": False, "phone": "", "account_name": "", "instructions": ""},
        "binance_pay": {"enabled": True, "email": "", "instructions": ""},
        "binance_pay_manual": {"enabled": True, "email": "", "instructions": ""},
        "zelle": {"enabled": True, "email": "", "instructions": ""},
        "cashapp": {"enabled": True, "email": "", "instructions": ""},
        # Legacy key kept for backwards compatibility
        "crypto_usdt": {"enabled": True, "wallet": "", "instructions": ""}
    }
    crypto_payment_gateways: Optional[dict] = {
        "paypal": {"enabled": False, "email": "", "instructions": ""},
        "airtm": {"enabled": False, "email": "", "instructions": ""},
        "skrill": {"enabled": False, "email": "", "instructions": ""},
        "moncash": {"enabled": False, "email": "", "instructions": ""},
        "binance_pay": {"enabled": False, "email": "", "instructions": ""},
        "zelle": {"enabled": False, "email": "", "instructions": ""},
        "cashapp": {"enabled": False, "email": "", "instructions": ""},
    }
    # Crypto Exchange Settings
    crypto_settings: Optional[dict] = {
        "buy_rate_usdt": 1.0,
        "sell_rate_usdt": 0.98,
        "transaction_fee_percent": 2.0,
        "min_transaction_usd": 10.0,
        "wallets": {
            "BEP20": "",
            "TRC20": "",
            "MATIC": ""
        }
    }
    # Minutes Transfer (international mobile minutes / airtime)
    minutes_transfer_enabled: Optional[bool] = False
    minutes_transfer_fee_type: Optional[str] = "percent"  # percent or fixed
    minutes_transfer_fee_value: Optional[float] = 0.0  # percent (0-100) or fixed USD
    minutes_transfer_min_amount: Optional[float] = 1.0
    minutes_transfer_max_amount: Optional[float] = 500.0
    minutes_transfer_instructions: Optional[str] = None
    # FAQ (editable from admin)
    faq_buyer: Optional[list] = [
        {"q": "How do I place an order?", "a": "Browse products, add to cart, proceed to checkout, choose your payment method, and complete your order."},
        {"q": "What payment methods are accepted?", "a": "We accept cryptocurrency (BTC, ETH, USDT), Binance Pay (auto and manual), PayPal, Skrill, MonCash, Zelle, and Cash App."},
        {"q": "How long does delivery take?", "a": "Automatic delivery products are instant. Manual delivery products are processed within 24 hours."},
        {"q": "What is escrow?", "a": "For marketplace orders, your payment is held in escrow until you confirm delivery. This protects both buyers and sellers."},
        {"q": "How do I open a dispute?", "a": "On the order tracking page, click 'Open Dispute'. Each party has 24 hours to respond. If the other party doesn't respond, you win automatically."},
        {"q": "How do refunds work?", "a": "If you win a dispute, the refund is credited to your wallet balance for future purchases."},
        {"q": "Where do I find my delivery codes?", "a": "Go to Dashboard > Purchased Orders > click the order. Codes appear in the 'Order Delivered' section."},
        {"q": "How do I contact the seller?", "a": "On the order tracking page, click 'Contact the seller'. You'll receive notifications when they reply."},
    ]
    faq_seller: Optional[list] = [
        {"q": "How do I become a seller?", "a": "Go to Dashboard > 'Become a Seller' > submit your KYC application. Once approved, you can list products."},
        {"q": "How do I deliver an order?", "a": "Go to Seller Center > Orders. Find the order and click 'Deliver'. Enter codes/credentials and a note."},
        {"q": "How does escrow work for sellers?", "a": "Payment is held in escrow after purchase. After delivery and buyer confirmation, payment releases after 3 days."},
        {"q": "What is the pending balance?", "a": "Pending balance shows earnings from orders still in escrow. Once released, it moves to your available balance."},
        {"q": "How do I withdraw my earnings?", "a": "Go to Seller Center > Earn & Withdraw. Choose a method, enter your address and amount. Fees vary by method."},
        {"q": "What are the withdrawal fees?", "a": "Each method has its own fee (% + flat). See the exact fees in the withdrawal form before submitting."},
        {"q": "What happens during a dispute?", "a": "You have 24 hours to respond with evidence. If you don't respond, the dispute auto-resolves in the buyer's favor."},
        {"q": "What commission does the platform take?", "a": "Commission is shown in your Seller Center (typically 10%). The rest is credited after escrow release."},
    ]
    # Seller withdrawal settings
    seller_withdrawal_fee_percent: Optional[float] = 0.0
    seller_withdrawal_fee_fixed: Optional[float] = 0.0
    seller_withdrawal_min_amount: Optional[float] = 5.0
    withdrawal_methods: Optional[dict] = {
        "binance_pay": {"label": "Binance Pay", "enabled": True, "fee_percent": 0.0, "fee_fixed": 0.0, "placeholder": "Binance Pay ID"},
        "usdt_bep20": {"label": "USDT (BEP20)", "enabled": True, "fee_percent": 1.0, "fee_fixed": 0.50, "placeholder": "BEP20 Wallet Address"},
        "usdt_trc20": {"label": "USDT (TRC20)", "enabled": True, "fee_percent": 1.0, "fee_fixed": 0.50, "placeholder": "TRC20 Wallet Address"},
        "paypal": {"label": "PayPal", "enabled": True, "fee_percent": 3.0, "fee_fixed": 0.30, "placeholder": "PayPal Email"},
        "moncash": {"label": "MonCash", "enabled": True, "fee_percent": 2.0, "fee_fixed": 0.0, "placeholder": "MonCash Phone Number"},
    }
    # Social links (follow buttons)
    social_links: Optional[dict] = {
        "facebook": "",
        "instagram": "",
        "tiktok": "",
        "youtube": "",
        "twitter": "",
        "telegram": "",
        "whatsapp": "",
    }
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SettingsUpdate(BaseModel):
    site_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    support_email: Optional[str] = None
    plisio_api_key: Optional[str] = None
    binance_pay_api_key: Optional[str] = None
    binance_pay_secret_key: Optional[str] = None
    binance_pay_proxy_url: Optional[str] = None
    mtcgame_api_key: Optional[str] = None
    gosplit_api_key: Optional[str] = None
    z2u_api_key: Optional[str] = None
    g2bulk_api_key: Optional[str] = None
    natcash_usd_htg_rate: Optional[float] = None
    natcash_callback_secret: Optional[str] = None
    resend_api_key: Optional[str] = None
    resend_from_email: Optional[str] = None
    telegram_notifications_enabled: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_admin_chat_id: Optional[str] = None
    announcement_enabled: Optional[bool] = None
    announcement_message: Optional[str] = None
    trustpilot_enabled: Optional[bool] = None
    trustpilot_business_id: Optional[str] = None
    product_categories: Optional[List[str]] = None
    category_images: Optional[Dict[str, str]] = None
    whatsapp_support_enabled: Optional[bool] = None
    whatsapp_support_number: Optional[str] = None
    whatsapp_support_message: Optional[str] = None
    crisp_enabled: Optional[bool] = None
    crisp_website_id: Optional[str] = None
    refund_policy: Optional[str] = None
    giftcard_taxonomy: Optional[List[Dict[str, Any]]] = None
    payment_gateways: Optional[dict] = None
    crypto_payment_gateways: Optional[dict] = None
    crypto_settings: Optional[dict] = None
    minutes_transfer_enabled: Optional[bool] = None
    minutes_transfer_fee_type: Optional[str] = None
    minutes_transfer_fee_value: Optional[float] = None
    minutes_transfer_min_amount: Optional[float] = None
    minutes_transfer_max_amount: Optional[float] = None
    minutes_transfer_instructions: Optional[str] = None
    social_links: Optional[dict] = None


class TelegramTestRequest(BaseModel):
    telegram_notifications_enabled: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_admin_chat_id: Optional[str] = None


# Bulk Email Model
class BulkEmailRequest(BaseModel):
    subject: str
    message: str
    recipient_type: str  # all, customers, specific_emails
    specific_emails: Optional[List[EmailStr]] = None


class BlogPost(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: str
    title: str
    excerpt: Optional[str] = None
    content: str
    cover_image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    cta_label: Optional[str] = None
    cta_url: Optional[str] = None
    published: bool = False
    published_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BlogPostCreate(BaseModel):
    title: str
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: str
    cover_image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    cta_label: Optional[str] = None
    cta_url: Optional[str] = None
    published: Optional[bool] = False


class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    cover_image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    cta_label: Optional[str] = None
    cta_url: Optional[str] = None
    published: Optional[bool] = None
    published_at: Optional[datetime] = None


# ==================== EMAIL HELPERS ====================

def _frontend_base_url() -> str:
    return os.environ.get("FRONTEND_URL", "https://kayicom.com").rstrip("/")


def _first_non_empty_text(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _parse_optional_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        try:
            return bool(int(value))
        except Exception:
            return None
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off", ""}:
        return False
    return None


def _resolve_telegram_runtime_config(settings: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    settings = settings or {}
    bot_token = _first_non_empty_text(
        settings.get("telegram_bot_token"),
        settings.get("telegram_token"),  # legacy alias compatibility
        os.environ.get("TELEGRAM_BOT_TOKEN"),
        os.environ.get("TELEGRAM_TOKEN"),  # legacy alias compatibility
    )
    chat_id = _first_non_empty_text(
        settings.get("telegram_admin_chat_id"),
        settings.get("telegram_chat_id"),  # legacy alias compatibility
        os.environ.get("TELEGRAM_ADMIN_CHAT_ID"),
        os.environ.get("TELEGRAM_CHAT_ID"),  # legacy alias compatibility
    )
    enabled = _parse_optional_bool(settings.get("telegram_notifications_enabled"))
    if enabled is None:
        enabled = _parse_optional_bool(os.environ.get("TELEGRAM_NOTIFICATIONS_ENABLED"))
    if enabled is None:
        # Backward compatibility: older configs only had token + chat_id and no boolean flag.
        enabled = bool(bot_token and chat_id)
    return {
        "enabled": bool(enabled),
        "bot_token": bot_token,
        "chat_id": chat_id,
    }


def _build_admin_notification_message(event: str, lines: Optional[List[str]] = None) -> str:
    message_lines = [f"[KayiCom] {event}"]
    for line in (lines or []):
        if line is None:
            continue
        value = str(line).strip()
        if value:
            message_lines.append(value)
    message_lines.append(f"Time: {datetime.now(timezone.utc).isoformat()}")
    text = "\n".join(message_lines)
    if len(text) > 3900:
        text = text[:3897] + "..."
    return text


async def _notify_admin_telegram(
    event: str,
    lines: Optional[List[str]] = None,
    settings_override: Optional[Dict[str, Any]] = None,
    force_send: bool = False,
    raise_on_error: bool = False,
) -> bool:
    """
    Send admin activity notifications to Telegram.
    Config can come from site_settings or environment:
    - TELEGRAM_NOTIFICATIONS_ENABLED
    - TELEGRAM_BOT_TOKEN
    - TELEGRAM_ADMIN_CHAT_ID
    """
    try:
        settings = settings_override or await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
        config = _resolve_telegram_runtime_config(settings)
        enabled = bool(config.get("enabled"))
        bot_token = str(config.get("bot_token") or "").strip()
        chat_id = str(config.get("chat_id") or "").strip()
        if not enabled and not force_send:
            return False

        if not bot_token or not chat_id:
            reason = "Telegram notification is not configured: missing bot token or admin chat ID"
            if raise_on_error:
                raise HTTPException(status_code=400, detail=reason)
            if enabled or force_send:
                logging.warning(reason)
            return False

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": _build_admin_notification_message(event, lines),
            "disable_web_page_preview": True,
        }
        resp = await asyncio.to_thread(requests.post, url, json=payload, timeout=10)
        if not (200 <= resp.status_code < 300):
            reason = f"Telegram notify failed ({resp.status_code}): {resp.text[:300]}"
            if raise_on_error:
                raise HTTPException(status_code=502, detail=reason)
            logging.error(reason)
            return False

        try:
            body = resp.json()
        except Exception:
            body = None
        if isinstance(body, dict) and body.get("ok") is False:
            desc = body.get("description") or "unknown Telegram API error"
            reason = f"Telegram notify rejected by API: {desc}"
            if raise_on_error:
                raise HTTPException(status_code=502, detail=reason)
            logging.error(reason)
            return False
        return True
    except HTTPException:
        raise
    except Exception as e:
        if raise_on_error:
            raise HTTPException(status_code=500, detail=f"Telegram notification error: {e}")
        logging.error(f"Telegram notification error: {e}")
        return False


async def _backfill_blog_post_fields(limit: int = 5000) -> int:
    """Ensure existing blog posts have slug + normalized SEO fields."""
    updated = 0
    try:
        posts = await db.blog_posts.find({}, {"_id": 0}).to_list(limit)
    except Exception:
        return 0

    for post in posts:
        updates: Dict[str, Any] = {}
        post_id = str(post.get("id") or "")
        if not str(post.get("slug") or "").strip():
            updates["slug"] = await _generate_unique_blog_slug(
                str(post.get("title") or post_id or "post"),
                exclude_post_id=post_id or None,
            )
        normalized_tags = _normalize_blog_tags(post.get("tags"))
        if normalized_tags != (post.get("tags") or []):
            updates["tags"] = normalized_tags
        if post.get("seo_description") in [None, ""]:
            updates["seo_description"] = _derive_blog_seo_description(
                None,
                post.get("excerpt"),
                str(post.get("content") or ""),
            )
        if updates:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.blog_posts.update_one({"id": post_id}, {"$set": updates})
            updated += 1
    return updated


def _ensure_crypto_exchange_enabled():
    if not CRYPTO_EXCHANGE_ENABLED:
        raise HTTPException(status_code=410, detail="Crypto buy/sell is disabled")


async def _backfill_default_orders_count(limit: int = 5000) -> int:
    """Ensure products always have a non-empty orders_count baseline."""
    updated = 0
    try:
        products = await db.products.find({}, {"_id": 0}).to_list(limit)
    except Exception:
        return 0

    for product in products:
        normalized = _normalize_orders_count_for_product(product)
        current = 0
        try:
            current = int(product.get("orders_count", 0) or 0)
        except Exception:
            current = 0
        if current >= normalized:
            continue
        await db.products.update_one({"id": product.get("id")}, {"$set": {"orders_count": int(normalized)}})
        updated += 1
    return updated


async def _backfill_product_seo_fields(limit: int = 5000) -> int:
    """Ensure existing products include normalized SEO title + description."""
    updated = 0
    try:
        products = await db.products.find({}, {"_id": 0}).to_list(limit)
    except Exception:
        return 0

    for product in products:
        product_id = str(product.get("id") or "").strip()
        if not product_id:
            continue

        normalized = _normalize_product_doc(product)
        current_title = (_compact_text(product.get("seo_title")) if product.get("seo_title") is not None else "") or None
        current_description = (_compact_text(product.get("seo_description")) if product.get("seo_description") is not None else "") or None

        updates: Dict[str, Any] = {}
        if normalized.get("seo_title") and normalized.get("seo_title") != current_title:
            updates["seo_title"] = normalized["seo_title"]
        if normalized.get("seo_description") and normalized.get("seo_description") != current_description:
            updates["seo_description"] = normalized["seo_description"]

        if not updates:
            continue

        await db.products.update_one({"id": product_id}, {"$set": updates})
        updated += 1

    return updated


async def _backfill_product_slugs(limit: int = 5000) -> int:
    """Ensure existing products have URL slugs."""
    updated = 0
    try:
        products = await db.products.find(
            {"$or": [{"slug": {"$exists": False}}, {"slug": None}, {"slug": ""}]},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(limit)
    except Exception:
        return 0
    for product in products:
        pid = str(product.get("id") or "").strip()
        name = str(product.get("name") or "product").strip()
        if not pid:
            continue
        slug = await _generate_unique_product_slug(name, exclude_product_id=pid)
        await db.products.update_one({"id": pid}, {"$set": {"slug": slug}})
        updated += 1
    return updated


async def _auto_cancel_unpaid_orders() -> int:
    """
    Auto-cancel unpaid orders after ORDER_PAYMENT_TIMEOUT_MINUTES.
    Unpaid statuses considered: pending, pending_verification.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=ORDER_PAYMENT_TIMEOUT_MINUTES)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    cancelled_ids: List[str] = []

    for order in orders:
        payment_status = str(order.get("payment_status") or "").lower()
        order_status = str(order.get("order_status") or "").lower()
        if payment_status not in {"pending", "pending_verification"}:
            continue
        if order_status in {"completed", "cancelled"}:
            continue

        created_at = _parse_datetime_utc(order.get("created_at"))
        if not created_at or created_at > cutoff:
            continue

        oid = order.get("id")
        if not oid:
            continue
        res = await db.orders.update_one(
            {"id": oid},
            {"$set": {
                "payment_status": "cancelled",
                "order_status": "cancelled",
                "cancellation_reason": f"Auto-cancelled after {ORDER_PAYMENT_TIMEOUT_MINUTES} minutes without payment",
                "cancelled_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }}
        )
        if _matched_count(res) > 0:
            cancelled_ids.append(oid)

    if cancelled_ids:
        preview = ", ".join(cancelled_ids[:10])
        more = "" if len(cancelled_ids) <= 10 else f" (+{len(cancelled_ids) - 10} more)"
        await _notify_admin_telegram(
            "Orders auto-cancelled",
            [
                f"Count: {len(cancelled_ids)}",
                f"Order IDs: {preview}{more}",
            ],
        )
    return len(cancelled_ids)


async def _order_auto_cancel_worker():
    while True:
        try:
            cancelled = await _auto_cancel_unpaid_orders()
            if cancelled > 0:
                logging.info(f"Auto-cancelled {cancelled} unpaid order(s)")
        except Exception as e:
            logging.error(f"Order auto-cancel worker error: {e}")
        await asyncio.sleep(60)


async def _escrow_release_worker():
    """Periodically release escrow payments that passed the 3-day hold."""
    while True:
        try:
            await _release_due_escrows()
        except Exception as e:
            logging.error(f"Escrow release worker error: {e}")
        await asyncio.sleep(300)


_DEFAULT_SITE_CRYPTO_SETTINGS = SiteSettings().crypto_settings or {}
# Initialized after CryptoConfig is defined.
_DEFAULT_CRYPTO_CONFIG: Dict[str, Any] = {}
_CRYPTO_FLOAT_TOLERANCE = 1e-9


def _crypto_value_is_explicit(raw_value: Any, default_value: float) -> bool:
    if raw_value is None:
        return False
    try:
        value = float(raw_value)
    except Exception:
        return False
    if math.isnan(value) or math.isinf(value):
        return False
    return abs(value - default_value) > _CRYPTO_FLOAT_TOLERANCE


def _resolve_crypto_value(
    crypto_settings: Dict[str, Any],
    config: Dict[str, Any],
    *,
    settings_key: str,
    config_key: str,
    settings_default: float,
    config_default: float,
) -> float:
    value, _ = _resolve_crypto_value_with_source(
        crypto_settings,
        config,
        settings_key=settings_key,
        config_key=config_key,
        settings_default=settings_default,
        config_default=config_default,
    )
    return value


def _resolve_crypto_value_with_source(
    crypto_settings: Dict[str, Any],
    config: Dict[str, Any],
    *,
    settings_key: str,
    config_key: str,
    settings_default: float,
    config_default: float,
) -> Tuple[float, str]:
    settings_raw = (crypto_settings or {}).get(settings_key)
    config_raw = (config or {}).get(config_key)

    settings_value = _safe_float(settings_raw, settings_default)
    config_value = _safe_float(config_raw, config_default)

    if _crypto_value_is_explicit(settings_raw, settings_default):
        return settings_value, "settings"
    if _crypto_value_is_explicit(config_raw, config_default):
        return config_value, "config"
    return settings_value, "default"


def _plisio_success_url(kind: str, ref_id: str) -> Optional[str]:
    base = _frontend_base_url()
    if not base:
        return None
    query = urlencode({"type": kind, "id": ref_id})
    return f"{base}/payment-success?{query}"


def _plisio_cancel_url(kind: str, ref_id: str) -> Optional[str]:
    base = _frontend_base_url()
    if not base:
        return None
    if kind == "order":
        return f"{base}/track/{ref_id}"
    if kind == "wallet_topup":
        return f"{base}/wallet"
    if kind == "minutes_transfer":
        return f"{base}/minutes"
    if kind == "crypto_sell":
        return f"{base}/crypto"
    return base


def _reset_password_base_url() -> str:
    env_url = os.environ.get("RESET_PASSWORD_BASE_URL")
    if env_url:
        return env_url.rstrip("/")
    return f"{_frontend_base_url()}/reset-password"


def _build_reset_link(token: str) -> str:
    return f"{_reset_password_base_url()}?token={token}"


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _backend_base_url() -> str:
    return (
        os.environ.get("BACKEND_URL")
        or os.environ.get("RENDER_EXTERNAL_URL")
        or ""
    ).rstrip("/")


def _plisio_callback_url() -> Optional[str]:
    explicit = os.environ.get("PLISIO_CALLBACK_URL")
    if explicit:
        return explicit
    base = _backend_base_url()
    if not base:
        return None
    return f"{base}/api/payments/plisio-callback"

def _format_dt(dt: datetime) -> str:
    try:
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        return str(dt)


def _safe_float(val: Any, default: float) -> float:
    """
    Convert to float safely, falling back to default when missing/NaN/inf.
    Prevents crashes when admin saves empty strings in crypto settings.
    """
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except Exception:
        return default

def _optional_float(val: Any) -> Optional[float]:
    """Return float value or None when invalid."""
    try:
        if val is None:
            return None
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except Exception:
        return None

def _apply_crypto_config_to_settings(settings: Optional[dict], config: Optional[dict]) -> Optional[dict]:
    if not settings or not config:
        return settings
    crypto_settings = dict(settings.get("crypto_settings") or {})
    buy_rate = _optional_float(config.get("buy_rate_bep20"))
    if buy_rate is not None:
        crypto_settings["buy_rate_usdt"] = buy_rate
    sell_rate = _optional_float(config.get("sell_rate_bep20"))
    if sell_rate is not None:
        crypto_settings["sell_rate_usdt"] = sell_rate
    fee_percent = _optional_float(config.get("buy_fee_percent", config.get("transaction_fee_percent")))
    if fee_percent is not None:
        crypto_settings["transaction_fee_percent"] = fee_percent
    min_usd = _optional_float(config.get("min_buy_usd", config.get("min_transaction_usd")))
    if min_usd is not None:
        crypto_settings["min_transaction_usd"] = min_usd
    settings["crypto_settings"] = crypto_settings
    return settings

def _send_resend_email(settings: dict, to_email: str, subject: str, html: str):
    """Send one email via Resend. Raises HTTPException on misconfig."""
    if not settings or not settings.get("resend_api_key"):
        raise HTTPException(status_code=400, detail="Resend API key not configured")

    resend_from = settings.get("resend_from_email") or settings.get("support_email")
    if not resend_from:
        raise HTTPException(status_code=400, detail="Resend from email not configured")

    headers = {
        "Authorization": f"Bearer {settings['resend_api_key']}",
        "Content-Type": "application/json",
    }
    resp = requests.post(
        "https://api.resend.com/emails",
        headers=headers,
        json={"from": resend_from, "to": [to_email], "subject": subject, "html": html},
        timeout=20,
    )
    if not (200 <= resp.status_code < 300):
        raise HTTPException(status_code=500, detail=f"Resend send failed: {resp.status_code}: {resp.text[:300]}")


# ==================== SUBSCRIPTION HELPERS ====================

def _is_subscription_product(product: Optional[dict]) -> bool:
    """Treat subscription category or flag as subscription."""
    if not product:
        return False
    return bool(product.get("is_subscription") or product.get("category") == "subscription")

def _parse_subscription_duration(product: dict) -> timedelta:
    """
    Return subscription duration as timedelta.
    Preference:
    - product.subscription_duration_months if present
    - parse product.variant_name like "1 Month", "3 Months", "12 Months", "7 Days", "1 Year"
    - fallback 30 days
    """
    months = product.get("subscription_duration_months")
    if months:
        try:
            return timedelta(days=int(months) * 30)
        except Exception:
            pass

    variant = (product.get("variant_name") or "").strip().lower()
    if variant:
        import re
        # Support English + Haitian Creole + French-ish keywords
        # - day/jou
        # - month/mwa/mois
        # - year/ane/an/ans/years
        m = re.search(r"(\d+)\s*(day|days|jou|month|months|mwa|mois|year|years|ane|an|ans)", variant)
        if m:
            n = int(m.group(1))
            unit = m.group(2)
            if unit in ["day", "days", "jou"]:
                return timedelta(days=n)
            if unit in ["month", "months", "mwa", "mois"]:
                return timedelta(days=n * 30)
            if unit in ["year", "years", "ane", "an", "ans"]:
                return timedelta(days=n * 365)

    return timedelta(days=30)

async def _set_subscription_dates_if_needed(order_id: str) -> Optional[Dict[str, Any]]:
    """If order contains subscription products, set subscription_start_date/end_date."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return None

    # Idempotent: don't overwrite if already set
    if order.get("subscription_end_date"):
        return order

    # Only if paid+completed
    if order.get("payment_status") != "paid" or order.get("order_status") != "completed":
        return None

    max_end: Optional[datetime] = None
    start = datetime.now(timezone.utc)

    for item in order.get("items", []):
        product = await db.products.find_one({"id": item.get("product_id")}, {"_id": 0})
        if _is_subscription_product(product):
            duration = _parse_subscription_duration(product)
            end = start + duration
            if (max_end is None) or (end > max_end):
                max_end = end

    if not max_end:
        return None

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "subscription_start_date": start.isoformat(),
            "subscription_end_date": max_end.isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated

async def _has_other_active_subscription(order: dict, now: datetime) -> bool:
    """Check if user has another paid+completed subscription still active."""
    if not order:
        return False
    user_id = str(order.get("user_id") or "").strip()
    user_email = str(order.get("user_email") or "").strip()
    if not user_id and not user_email:
        return False

    or_filters: List[Dict[str, Any]] = []
    if user_id:
        or_filters.append({"user_id": user_id})
    if user_email:
        or_filters.append({"user_email": _email_match(user_email)})

    query: Dict[str, Any] = {
        "$or": or_filters,
        "payment_status": "paid",
        "order_status": "completed",
    }
    candidates = await db.orders.find(query, {"_id": 0}).to_list(5000)
    current_order_id = str(order.get("id") or "").strip()
    for candidate in candidates:
        if str(candidate.get("id") or "").strip() == current_order_id:
            continue
        candidate_end = _parse_datetime_utc(candidate.get("subscription_end_date"))
        if candidate_end and candidate_end > now:
            return True
    return False


async def _maybe_send_subscription_emails(order: dict):
    """Send customer reminders and admin expiry action alert once per order."""
    if not order:
        return
    if order.get("payment_status") != "paid" or order.get("order_status") != "completed":
        return
    end_raw = order.get("subscription_end_date")
    if not end_raw:
        return
    end = end_raw
    if isinstance(end_raw, str):
        try:
            end = datetime.fromisoformat(end_raw)
        except Exception:
            return
    if not isinstance(end, datetime):
        return

    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    user_email = order.get("user_email")
    if not user_email:
        return

    now = datetime.now(timezone.utc)
    reminder_at = end - timedelta(days=5)

    # Ensure notification collection exists
    # doc: {order_id, type, sent_at}
    async def already_sent(kind: str) -> bool:
        return bool(await db.subscription_notifications.find_one({"order_id": order["id"], "type": kind}))

    def mark_sent(kind: str):
        return db.subscription_notifications.insert_one({
            "id": str(uuid.uuid4()),
            "order_id": order["id"],
            "type": kind,
            "sent_at": datetime.now(timezone.utc).isoformat()
        })

    renew_link = f"{_frontend_base_url()}/products/subscription"

    # 5-day reminder
    if now >= reminder_at and now < end and not await already_sent("reminder_5d"):
        subject = "Subscription renewal reminder"
        html = (
            f"<div style='font-family:Arial,sans-serif'>"
            f"<h2>Reminder: your subscription is ending soon</h2>"
            f"<p>Your subscription will end on <b>{_format_dt(end)}</b>.</p>"
            f"<p>Renew here: <a href='{renew_link}'>{renew_link}</a></p>"
            f"</div>"
        )
        _send_resend_email(settings, user_email, subject, html)
        await mark_sent("reminder_5d")

    # Expired notice
    if now >= end and not await already_sent("expired"):
        subject = "Subscription expired"
        html = (
            f"<div style='font-family:Arial,sans-serif'>"
            f"<h2>Your subscription has expired</h2>"
            f"<p>It ended on <b>{_format_dt(end)}</b>.</p>"
            f"<p>Renew here: <a href='{renew_link}'>{renew_link}</a></p>"
            f"</div>"
        )
        _send_resend_email(settings, user_email, subject, html)
        await mark_sent("expired")

    # Admin action alert:
    # if subscription has expired and user has no other active paid subscription,
    # notify admin to disable shared-platform access manually.
    if now >= end and not await already_sent("expired_admin_telegram"):
        has_active_renewal = await _has_other_active_subscription(order, now)
        if not has_active_renewal:
            await _notify_admin_telegram(
                "Subscription expired - manual access removal",
                [
                    f"Order ID: {order.get('id') or 'unknown'}",
                    f"Customer: {user_email}",
                    f"Expired at: {_format_dt(end)}",
                    "Renewal status: no active paid renewal found",
                    "Action required: disable access on shared external platform.",
                ],
            )
            await mark_sent("expired_admin_telegram")


async def _run_subscription_notification_checks(limit: int = 5000) -> int:
    orders = await db.orders.find(
        {"subscription_end_date": {"$ne": None}, "payment_status": "paid", "order_status": "completed"},
        {"_id": 0},
    ).to_list(limit)

    processed = 0
    for order in orders:
        try:
            await _maybe_send_subscription_emails(order)
            processed += 1
        except Exception as e:
            logging.error(f"Subscription notification error for {order.get('id')}: {e}")
    return processed


async def _subscription_notifications_worker():
    while True:
        try:
            await _run_subscription_notification_checks()
        except Exception as e:
            logging.error(f"Subscription notifications worker error: {e}")
        await asyncio.sleep(SUBSCRIPTION_NOTIFICATION_INTERVAL_SECONDS)


# Withdrawal Models
class Withdrawal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_email: str
    amount: float
    method: str  # usdt_bep20, btc, paypal
    wallet_address: Optional[str] = None  # For crypto
    paypal_email: Optional[str] = None  # For PayPal
    status: str = "pending"  # pending, approved, rejected, completed
    admin_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WithdrawalRequest(BaseModel):
    amount: float
    method: str
    wallet_address: Optional[str] = None
    paypal_email: Optional[str] = None
    moncash_phone: Optional[str] = None
    moncash_name: Optional[str] = None

# Crypto Transaction Models
class CryptoTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_email: str
    transaction_type: str  # buy or sell
    crypto_type: str = "USDT"
    chain: str  # BEP20, TRC20, MATIC
    amount_crypto: float
    amount_usd: float
    exchange_rate: float
    fee: float
    total_usd: float  # amount_usd + fee for buy, amount_usd - fee for sell
    payment_method: Optional[str] = None  # For buy: paypal, moncash, btc, usdt
    wallet_address: Optional[str] = None
    transaction_hash: Optional[str] = None
    status: str = "pending"  # pending, processing, completed, failed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CryptoBuyRequest(BaseModel):
    chain: str
    amount_usd: float
    payment_method: str
    wallet_address: str
    payer_info: Optional[str] = None
    transaction_id: Optional[str] = None
    payment_proof: Optional[str] = None

class CryptoSellRequest(BaseModel):
    chain: str
    amount_crypto: float
    payment_method: str  # paypal, moncash, usdt, btc
    receiving_info: str  # Email or wallet address for receiving payment
    transaction_id: Optional[str] = None
    payment_proof: Optional[str] = None


class CryptoProofRequest(BaseModel):
    transaction_id: Optional[str] = None
    tx_hash: Optional[str] = None
    payment_proof: Optional[str] = None

# Crypto Config Model
class CryptoConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "crypto_config"
    # Exchange rates (USD per 1 USDT)
    buy_rate_bep20: float = 1.02
    sell_rate_bep20: float = 0.98
    buy_rate_trc20: float = 1.02
    sell_rate_trc20: float = 0.98
    buy_rate_matic: float = 1.02
    sell_rate_matic: float = 0.98
    # Fees
    buy_fee_percent: float = 2.0
    sell_fee_percent: float = 2.0
    # Limits
    min_buy_usd: float = 10.0
    max_buy_usd: float = 10000.0
    min_sell_usdt: float = 10.0
    max_sell_usdt: float = 10000.0
    # Confirmations required
    bep20_confirmations: int = 15
    trc20_confirmations: int = 20
    matic_confirmations: int = 10
    # Wallets
    wallet_bep20: Optional[str] = None
    wallet_trc20: Optional[str] = None
    wallet_matic: Optional[str] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


_DEFAULT_CRYPTO_CONFIG = CryptoConfig().model_dump()


# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate):
    # Check if user exists
    email = user_data.email.strip()
    existing = await db.users.find_one({"email": _email_match(email)})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed_password = pwd_context.hash(user_data.password)
    
    # Create user
    user = User(
        email=email,
        full_name=user_data.full_name,
        role="customer"
    )
    user.customer_id = await _generate_unique_customer_id()
    
    doc = user.model_dump()
    doc['password'] = hashed_password
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    await _notify_admin_telegram(
        "New customer registered",
        [
            f"Email: {user.email}",
            f"Customer ID: {user.customer_id}",
            f"Name: {user.full_name}",
        ],
    )
    return user

@api_router.post("/auth/login")
async def login(credentials: LoginRequest):
    email = credentials.email.strip()
    user = await db.users.find_one({"email": _email_match(email)})
    if not user:
        logging.error(f"Login failed: user not found for {email}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account is blocked. Contact support.")
    
    # Support both 'password' and 'password_hash' field names
    # Try password_hash first, then password
    password_field = None
    password_value = None
    
    if 'password_hash' in user and user.get('password_hash'):
        password_field = 'password_hash'
        password_value = user['password_hash']
    elif 'password' in user and user.get('password'):
        password_field = 'password'
        password_value = user['password']
    
    if not password_field or not password_value:
        logging.error(f"Login failed: no password field found for {email}")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    logging.info(f"Login attempt for {email}, using field: {password_field}, hash preview: {password_value[:20]}...")
    
    # Verify password - try multiple methods
    password_valid = False
    try:
        # Method 1: Use passlib
        password_valid = pwd_context.verify(credentials.password, password_value)
        logging.info(f"Password verification (passlib): {password_valid}")
    except Exception as e:
        logging.error(f"Password verification error (passlib) for {email}: {str(e)}")
        # Method 2: Try bcrypt directly as fallback
        try:
            import bcrypt
            # Check if hash is valid bcrypt format
            if password_value.startswith('$2b$') or password_value.startswith('$2a$') or password_value.startswith('$2y$'):
                password_bytes = credentials.password.encode('utf-8')
                hash_bytes = password_value.encode('utf-8')
                password_valid = bcrypt.checkpw(password_bytes, hash_bytes)
                logging.info(f"Password verification (bcrypt direct): {password_valid}")
        except Exception as e2:
            logging.error(f"Password verification error (bcrypt direct) for {email}: {str(e2)}")
    
    if not password_valid:
        logging.error(f"All password verification methods failed for {credentials.email}")
    
    if not password_valid:
        # Try the other field if available
        if password_field == 'password_hash' and 'password' in user and user.get('password'):
            try:
                password_valid = pwd_context.verify(credentials.password, user['password'])
                if password_valid:
                    password_field = 'password'
                    logging.info(f"Login successful using fallback password field for {credentials.email}")
            except:
                pass
        
        if not password_valid:
            logging.error(f"Login failed: incorrect password for {credentials.email}, field: {password_field}")
            raise HTTPException(status_code=401, detail="Invalid credentials")
    
    logging.info(f"Login successful for {credentials.email}")

    # Ensure customer_id exists (for legacy users)
    if not user.get("customer_id"):
        cid = await _generate_unique_customer_id()
        await db.users.update_one({"id": user["id"]}, {"$set": {"customer_id": cid}})
        user["customer_id"] = cid

    return {
        "user_id": user['id'],
        "id": user['id'],
        "customer_id": user.get("customer_id"),
        "email": user['email'],
        "username": user.get('username', user.get('full_name', 'User')),
        "role": user['role'],
        "is_blocked": bool(user.get("is_blocked", False)),
        "seller_status": user.get("seller_status"),
        "seller_store_name": user.get("seller_store_name"),
        "seller_approved_categories": user.get("seller_approved_categories"),
    }


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    """Send password reset link if email exists."""
    email = payload.email.strip().lower()
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    # Allow environment fallback for Resend if settings not set
    if not settings.get("resend_api_key") and os.environ.get("RESEND_API_KEY"):
        settings = {
            **settings,
            "resend_api_key": os.environ.get("RESEND_API_KEY"),
            "resend_from_email": settings.get("resend_from_email") or os.environ.get("RESEND_FROM_EMAIL"),
        }
    if not settings.get("resend_api_key"):
        raise HTTPException(status_code=500, detail="Email service not configured")

    user = await db.users.find_one({"email": _email_match(email)})
    # Always return success to avoid user enumeration
    if not user:
        return {"status": "ok", "message": "If the email exists, a reset link has been sent."}

    now = datetime.now(timezone.utc)
    # Invalidate any previous tokens for this user
    await db.password_resets.update_many(
        {"user_id": user["id"], "used_at": None},
        {"$set": {"used_at": now}}
    )

    token = secrets.token_urlsafe(32)
    token_hash = _hash_reset_token(token)
    expires_at = now + timedelta(hours=1)
    await db.password_resets.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "email": user.get("email"),
        "token_hash": token_hash,
        "created_at": now,
        "expires_at": expires_at,
        "used_at": None,
    })

    reset_link = _build_reset_link(token)
    subject = "Reset your KayiCom password"
    html = (
        "<p>You requested to reset your KayiCom password.</p>"
        f"<p><a href=\"{reset_link}\">Reset your password</a></p>"
        "<p>This link expires in 60 minutes. If you did not request this, you can ignore this email.</p>"
    )
    try:
        _send_resend_email(settings, user.get("email"), subject, html)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forgot password email send failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to send reset email")

    return {"status": "ok", "message": "If the email exists, a reset link has been sent."}


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    """Reset password using a valid token."""
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Invalid token")

    now = datetime.now(timezone.utc)
    token_hash = _hash_reset_token(token)
    reset_record = await db.password_resets.find_one({
        "token_hash": token_hash,
        "used_at": None,
        "expires_at": {"$gt": now},
    })
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user = await db.users.find_one({"id": reset_record["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    hashed_password = pwd_context.hash(payload.new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password": hashed_password, "password_hash": hashed_password}}
    )
    await db.password_resets.update_one(
        {"_id": reset_record["_id"]},
        {"$set": {"used_at": now}}
    )

    return {"status": "ok", "message": "Password reset successful"}

# ==================== PRODUCT ENDPOINTS ====================

@api_router.get("/products", response_model=List[Product])
async def get_products(
    category: Optional[str] = None,
    parent_product_id: Optional[str] = None,
    q: Optional[str] = None,
):
    """
    Return all products with optional category/parent filters and text search.
    Also normalizes fields to ensure frontend compatibility.
    """
    try:
        query: Dict[str, Any] = {
            "product_status": {"$in": ["approved", None]},
            "seller_id": {"$in": [None, ""]},
        }
        if category:
            query["category"] = category
        if parent_product_id:
            query["parent_product_id"] = parent_product_id
        if q:
            q = q.strip()
            if q:
                query["$or"] = [
                    {"name": {"$regex": q, "$options": "i"}},
                    {"description": {"$regex": q, "$options": "i"}},
                    {"variant_name": {"$regex": q, "$options": "i"}},
                    {"giftcard_category": {"$regex": q, "$options": "i"}},
                    {"giftcard_subcategory": {"$regex": q, "$options": "i"}},
                    {"seo_title": {"$regex": q, "$options": "i"}},
                    {"seo_description": {"$regex": q, "$options": "i"}},
                ]

        products = await db.products.find(query, {"_id": 0}).to_list(1000)

        validated_products: List[Dict[str, Any]] = []
        for product in products:
            try:
                product = _normalize_product_doc(product)
                created_at = product.get("created_at", datetime.now(timezone.utc))
                if isinstance(created_at, str):
                    created_at = datetime.fromisoformat(created_at)
                orders_count = _normalize_orders_count_for_product(product)

                product_slug = product.get("slug") or _slugify_text(product.get("name", "product"))
                validated_product = {
                    "id": product.get("id", ""),
                    "slug": product_slug,
                    "name": product.get("name", ""),
                    "description": product.get("description", ""),
                    "category": product.get("category", ""),
                    "price": float(product.get("price", 0) or 0),
                    "currency": product.get("currency", "USD"),
                    "image_url": product.get("image_url"),
                    "stock_available": product.get("stock_available", True),
                    "delivery_type": product.get("delivery_type", "automatic"),
                    "subscription_duration_months": product.get("subscription_duration_months"),
                    "subscription_auto_check": product.get("subscription_auto_check", False),
                    "variant_name": product.get("variant_name"),
                    "parent_product_id": product.get("parent_product_id"),
                    "requires_player_id": product.get("requires_player_id", False),
                    "player_id_label": product.get("player_id_label"),
                    "requires_credentials": product.get("requires_credentials", False),
                    "credential_fields": product.get("credential_fields"),
                    "region": product.get("region"),
                    "giftcard_category": product.get("giftcard_category"),
                    "giftcard_subcategory": product.get("giftcard_subcategory"),
                    "is_subscription": product.get("is_subscription", False),
                    "orders_count": orders_count,
                    "seo_title": product.get("seo_title"),
                    "seo_description": product.get("seo_description"),
                    "metadata": product.get("metadata", {}),
                    "created_at": created_at,
                    "seller_id": product.get("seller_id"),
                    "seller_offer_count": product.get("seller_offer_count", 0),
                }

                validated_products.append(validated_product)
            except Exception as e:
                logging.error(f"Error validating product {product.get('id')}: {e}")
                continue

        return validated_products
    except Exception as e:
        logging.error(f"Error in get_products: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        product = await db.products.find_one({"slug": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product = _normalize_product_doc(product)
    if isinstance(product.get('created_at'), str):
        product['created_at'] = datetime.fromisoformat(product['created_at'])
    product["orders_count"] = _normalize_orders_count_for_product(product)
    if not product.get("slug"):
        product["slug"] = _slugify_text(product.get("name", "product"))
    return product

@api_router.get("/products/{product_id}/similar")
async def get_similar_products(product_id: str, limit: int = 8):
    """Get similar products in the same category, excluding the current product's parent group."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        product = await db.products.find_one({"slug": product_id}, {"_id": 0})
    if not product:
        return []
    category = product.get("category")
    parent_id = product.get("parent_product_id") or product.get("id")
    query: Dict[str, Any] = {
        "category": category,
        "parent_product_id": {"$nin": [parent_id, None]},
        "product_status": {"$in": ["approved", None]},
        "seller_id": {"$in": [None, ""]},
    }
    candidates = await db.products.find(query, {"_id": 0}).to_list(200)
    seen_parents: set = set()
    grouped: list = []
    for p in candidates:
        pid = p.get("parent_product_id") or p.get("id")
        if pid in seen_parents or pid == parent_id:
            continue
        seen_parents.add(pid)
        siblings = [c for c in candidates if (c.get("parent_product_id") or c.get("id")) == pid]
        rep = min(siblings, key=lambda x: x.get("price", 9999))
        rep["_variant_count"] = len(siblings)
        rep["_min_price"] = min(s.get("price", 9999) for s in siblings)
        rep["orders_count"] = _normalize_orders_count_for_product(rep)
        if not rep.get("slug"):
            rep["slug"] = _slugify_text(rep.get("name", "product"))
        offer_count = await db.seller_offers.count_documents({"product_id": {"$in": [s["id"] for s in siblings]}, "status": "active"})
        rep["seller_offer_count"] = offer_count
        grouped.append(rep)
        if len(grouped) >= limit:
            break
    if len(grouped) < limit:
        fallback_query: Dict[str, Any] = {
            "product_status": {"$in": ["approved", None]},
            "seller_id": {"$in": [None, ""]},
            "parent_product_id": {"$nin": list(seen_parents) + [parent_id, None]},
            "category": {"$ne": category},
        }
        extras = await db.products.find(fallback_query, {"_id": 0}).to_list(100)
        for p in extras:
            pid = p.get("parent_product_id") or p.get("id")
            if pid in seen_parents:
                continue
            seen_parents.add(pid)
            p["_variant_count"] = 1
            p["_min_price"] = p.get("price", 0)
            p["orders_count"] = _normalize_orders_count_for_product(p)
            if not p.get("slug"):
                p["slug"] = _slugify_text(p.get("name", "product"))
            grouped.append(p)
            if len(grouped) >= limit:
                break
    return grouped


@api_router.post("/products", response_model=Product)
async def create_product(product_data: ProductCreate):
    product = Product(**product_data.model_dump())
    product.slug = await _generate_unique_product_slug(product.name, exclude_product_id=product.id)
    product.orders_count = _normalize_orders_count_for_product(product.model_dump())
    normalized_product = _normalize_product_doc(product.model_dump())
    product.seo_title = normalized_product.get("seo_title")
    product.seo_description = normalized_product.get("seo_description")
    doc = product.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.products.insert_one(doc)
    await _notify_admin_telegram(
        "Product created",
        [
            f"Product ID: {product.id}",
            f"Name: {product.name}",
            f"Category: {product.category}",
            f"Price: ${float(product.price):.2f}",
        ],
    )
    return product

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, updates: ProductUpdate):
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if "orders_count" in update_data:
        try:
            update_data["orders_count"] = int(update_data["orders_count"])
        except Exception:
            raise HTTPException(status_code=400, detail="orders_count must be an integer")
        merged = {**existing, **update_data}
        default_count = _default_orders_count_for_product(merged)
        if update_data["orders_count"] <= 0:
            update_data["orders_count"] = default_count
        else:
            update_data["orders_count"] = max(update_data["orders_count"], default_count)

    for _seo_key in ("seo_title", "seo_description"):
        if _seo_key in update_data and not str(update_data[_seo_key] or "").strip():
            del update_data[_seo_key]

    name_changed = "name" in update_data and _compact_text(update_data["name"]) != _compact_text(existing.get("name"))
    if name_changed:
        new_name = _compact_text(update_data["name"]) or existing.get("name", "product")
        update_data["slug"] = await _generate_unique_product_slug(
            new_name, exclude_product_id=product_id
        )

    merged_product = {**existing, **update_data}
    if name_changed or "seo_title" not in update_data:
        merged_product.pop("seo_title", None)
    if name_changed or "seo_description" not in update_data:
        merged_product.pop("seo_description", None)
    normalized_merged = _normalize_product_doc(merged_product)
    update_data["seo_title"] = normalized_merged.get("seo_title")
    update_data["seo_description"] = normalized_merged.get("seo_description")
    if not existing.get("slug") and not update_data.get("slug"):
        update_data["slug"] = await _generate_unique_product_slug(
            merged_product.get("name") or "product", exclude_product_id=product_id
        )

    if update_data:
        await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    updated = _normalize_product_doc(updated)
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    updated["orders_count"] = _normalize_orders_count_for_product(updated)
    await _notify_admin_telegram(
        "Product updated",
        [
            f"Product ID: {product_id}",
            f"Name: {updated.get('name')}",
            f"Changed fields: {', '.join(sorted(update_data.keys())) or 'none'}",
        ],
    )
    return updated

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    existing = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    await _notify_admin_telegram(
        "Product deleted",
        [
            f"Product ID: {product_id}",
            f"Name: {existing.get('name')}",
            f"Category: {existing.get('category')}",
        ],
    )
    return {"message": "Product deleted successfully"}


# ==================== PRODUCT CODES ENDPOINTS (Auto-Delivery) ====================

@api_router.get("/products/{product_id}/codes")
async def get_product_codes(product_id: str, status: Optional[str] = None):
    """List codes for a product (admin). Optional filter by status."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    query: Dict[str, Any] = {"product_id": product_id}
    if status:
        query["status"] = status
    codes = await db.product_codes.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return codes


@api_router.get("/products/{product_id}/codes/stats")
async def get_product_codes_stats(product_id: str):
    """Get code stats for a product."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    total = await db.product_codes.count_documents({"product_id": product_id})
    available = await db.product_codes.count_documents({"product_id": product_id, "status": "available"})
    delivered = await db.product_codes.count_documents({"product_id": product_id, "status": "delivered"})
    reserved = await db.product_codes.count_documents({"product_id": product_id, "status": "reserved"})
    return {"total": total, "available": available, "delivered": delivered, "reserved": reserved}


@api_router.post("/products/{product_id}/codes")
async def add_product_code(product_id: str, payload: ProductCodeAdd):
    """Add a single code to a product. Rejects duplicates within the same product."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    code_text = payload.code.strip()
    if not code_text:
        raise HTTPException(status_code=400, detail="Code cannot be empty")
    existing = await db.product_codes.find_one({"product_id": product_id, "code": code_text})
    if existing:
        raise HTTPException(status_code=409, detail="Duplicate code: this code already exists for this product")
    doc = ProductCode(product_id=product_id, code=code_text).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.product_codes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.post("/products/{product_id}/codes/bulk")
async def add_product_codes_bulk(product_id: str, payload: ProductCodeBulkAdd):
    """Add multiple codes at once. Skips duplicates and returns summary."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    codes = [c.strip() for c in payload.codes if c.strip()]
    if not codes:
        raise HTTPException(status_code=400, detail="No valid codes provided")

    input_dupes = len(codes) - len(set(codes))
    unique_codes = list(dict.fromkeys(codes))

    existing_cursor = db.product_codes.find(
        {"product_id": product_id, "code": {"$in": unique_codes}},
        {"code": 1, "_id": 0}
    )
    existing_codes = {doc["code"] async for doc in existing_cursor}

    new_codes = [c for c in unique_codes if c not in existing_codes]
    skipped = len(unique_codes) - len(new_codes)

    if new_codes:
        docs = []
        for code_text in new_codes:
            doc = ProductCode(product_id=product_id, code=code_text).model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            docs.append(doc)
        await db.product_codes.insert_many(docs)

    return {
        "added": len(new_codes),
        "skipped_duplicates": skipped + input_dupes,
        "total_submitted": len(payload.codes),
    }


@api_router.delete("/products/{product_id}/codes/{code_id}")
async def delete_product_code(product_id: str, code_id: str):
    """Delete a code (only if still available, not yet delivered)."""
    code_doc = await db.product_codes.find_one({"id": code_id, "product_id": product_id})
    if not code_doc:
        raise HTTPException(status_code=404, detail="Code not found")
    if code_doc.get("status") == "delivered":
        raise HTTPException(status_code=400, detail="Cannot delete a delivered code")
    await db.product_codes.delete_one({"id": code_id, "product_id": product_id})
    return {"message": "Code deleted"}


# ==================== COUPON ENDPOINTS ====================

def _normalize_coupon_code(code: str) -> str:
    return (code or "").strip().upper()

async def _get_valid_coupon(code: str, order_amount: float, user_id: Optional[str] = None) -> Optional[dict]:
    """Return coupon doc if valid for given amount and user, else None."""
    normalized = _normalize_coupon_code(code)
    if not normalized:
        return None

    coupon = await db.coupons.find_one({"code": normalized}, {"_id": 0})
    if not coupon:
        return None
    if not coupon.get("active", True):
        return None
    expires_at = coupon.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            expires_at = None
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    if float(order_amount) < float(coupon.get("min_order_amount", 0.0)):
        return None
    usage_limit = coupon.get("usage_limit")
    if usage_limit is not None and int(coupon.get("used_count", 0)) >= int(usage_limit):
        return None
    max_per_user = coupon.get("max_uses_per_user")
    if max_per_user is not None and user_id:
        user_usage = coupon.get("user_usage", {})
        user_count = int(user_usage.get(user_id, 0))
        if user_count >= int(max_per_user):
            return None
    return coupon

def _calculate_discount(coupon: dict, subtotal: float) -> float:
    discount_type = coupon.get("discount_type")
    value = float(coupon.get("discount_value", 0.0))
    if value <= 0:
        return 0.0
    if discount_type == "percent":
        discount = max(0.0, min(subtotal, subtotal * (value / 100.0)))
    elif discount_type == "fixed":
        discount = max(0.0, min(subtotal, value))
    else:
        return 0.0
    max_discount = coupon.get("max_discount_amount")
    if max_discount is not None and float(max_discount) > 0:
        discount = min(discount, float(max_discount))
    return discount

async def _record_coupon_usage_if_needed(order_id: str):
    """Increment coupon usage (global + per-user) once per paid order."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return
    code = _normalize_coupon_code(order.get("coupon_code"))
    if not code:
        return
    if order.get("coupon_usage_recorded"):
        return
    if order.get("payment_status") != "paid":
        return

    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon:
        await db.orders.update_one({"id": order_id}, {"$set": {"coupon_usage_recorded": True}})
        return

    usage_limit = coupon.get("usage_limit")
    if usage_limit is not None and int(coupon.get("used_count", 0)) >= int(usage_limit):
        await db.orders.update_one({"id": order_id}, {"$set": {"coupon_usage_recorded": True}})
        return

    order_user_id = order.get("user_id", "")
    update_ops = {"$inc": {"used_count": 1}}
    if order_user_id:
        update_ops["$inc"][f"user_usage.{order_user_id}"] = 1
    await db.coupons.update_one({"code": code}, update_ops)
    await db.orders.update_one({"id": order_id}, {"$set": {"coupon_usage_recorded": True}})


async def _record_product_orders_if_needed(order_id: str):
    """
    Increment per-product orders_count once per order lifecycle.
    We count valid newly-created orders (not failed/cancelled) and keep it idempotent
    with a marker on the order document.
    Uses a marker on the order document to keep operation idempotent.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return
    if order.get("product_orders_recorded"):
        return
    payment_status = str(order.get("payment_status") or "").lower()
    order_status = str(order.get("order_status") or "").lower()
    if payment_status in {"failed", "cancelled"}:
        return
    if order_status in {"cancelled"}:
        return

    # Mark first so repeated webhook/admin calls don't double count.
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"product_orders_recorded": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    increments: Dict[str, int] = {}
    for item in order.get("items") or []:
        product_id = item.get("product_id")
        if not product_id:
            continue
        try:
            qty = int(item.get("quantity", 1))
        except Exception:
            qty = 1
        if qty <= 0:
            qty = 1
        increments[product_id] = increments.get(product_id, 0) + qty

    if not increments:
        return

    try:
        for product_id, qty in increments.items():
            product_doc = await db.products.find_one({"id": product_id}, {"_id": 0})
            if not product_doc:
                continue
            baseline = _normalize_orders_count_for_product(product_doc)
            try:
                current = int(product_doc.get("orders_count", 0) or 0)
            except Exception:
                current = 0
            if current < baseline:
                await db.products.update_one(
                    {"id": product_id},
                    {"$set": {"orders_count": int(baseline)}}
                )
            await db.products.update_one(
                {"id": product_id},
                {"$inc": {"orders_count": int(qty)}}
            )
    except Exception as e:
        # Allow retries if product increment fails.
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"product_orders_recorded": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise e


async def _record_loyalty_credits_if_needed(order_id: str):
    """
    Award loyalty credits once per successful order.
    Rule: each successful (paid + completed) order gives 5 credits,
    only if total_amount >= $10.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return

    # Only award when fully successful
    if order.get("payment_status") != "paid":
        return
    if order.get("order_status") != "completed":
        return

    # Minimum order amount
    try:
        total_amount = float(order.get("total_amount") or 0.0)
    except Exception:
        total_amount = 0.0
    if total_amount + 1e-9 < 10.0:
        # Mark as recorded to avoid repeatedly re-checking for old small orders
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"credits_recorded": True, "credits_awarded": 0, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return

    if order.get("credits_recorded"):
        return

    credits = 5
    await db.users.update_one({"id": order["user_id"]}, {"$inc": {"credits_balance": int(credits)}})
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"credits_recorded": True, "credits_awarded": int(credits), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.credits_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": order["user_id"],
        "user_email": order.get("user_email"),
        "order_id": order_id,
        "type": "earn",
        "credits": int(credits),
        "usd_equivalent": round(float(credits) / 1000.0, 2),
        "reason": "Order success reward",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

@api_router.get("/coupons/validate")
async def validate_coupon(code: str, amount: float, user_id: Optional[str] = None):
    coupon = await _get_valid_coupon(code, amount, user_id=user_id)
    if not coupon:
        raise HTTPException(status_code=400, detail="Invalid coupon")
    discount = _calculate_discount(coupon, float(amount))
    remaining_global = None
    if coupon.get("usage_limit") is not None:
        remaining_global = max(0, int(coupon["usage_limit"]) - int(coupon.get("used_count", 0)))
    remaining_user = None
    if coupon.get("max_uses_per_user") is not None and user_id:
        user_usage = coupon.get("user_usage", {})
        remaining_user = max(0, int(coupon["max_uses_per_user"]) - int(user_usage.get(user_id, 0)))
    return {
        "code": coupon["code"],
        "discount_amount": discount,
        "total_after_discount": float(amount) - discount,
        "remaining_uses": remaining_global,
        "remaining_user_uses": remaining_user,
        "max_discount_amount": coupon.get("max_discount_amount"),
    }

@api_router.get("/coupons", response_model=List[Coupon])
async def list_coupons():
    coupons = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for c in coupons:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"])
        if isinstance(c.get("expires_at"), str):
            try:
                c["expires_at"] = datetime.fromisoformat(c["expires_at"])
            except Exception:
                c["expires_at"] = None
    return coupons

@api_router.post("/coupons", response_model=Coupon)
async def create_coupon(data: CouponCreate):
    code = _normalize_coupon_code(data.code)
    if not code:
        raise HTTPException(status_code=400, detail="Coupon code required")
    if data.discount_type not in ["percent", "fixed"]:
        raise HTTPException(status_code=400, detail="Invalid discount_type")
    if data.discount_value <= 0:
        raise HTTPException(status_code=400, detail="discount_value must be > 0")

    existing = await db.coupons.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists")

    coupon = Coupon(
        code=code,
        discount_type=data.discount_type,
        discount_value=float(data.discount_value),
        max_discount_amount=float(data.max_discount_amount) if data.max_discount_amount is not None else None,
        active=bool(data.active),
        min_order_amount=float(data.min_order_amount or 0.0),
        usage_limit=data.usage_limit,
        max_uses_per_user=data.max_uses_per_user,
        expires_at=data.expires_at,
    )
    doc = coupon.model_dump()
    doc["created_at"] = coupon.created_at.isoformat()
    if coupon.expires_at:
        doc["expires_at"] = coupon.expires_at.isoformat()
    await db.coupons.insert_one(doc)
    await _notify_admin_telegram(
        "Coupon created",
        [
            f"Coupon ID: {coupon.id}",
            f"Code: {coupon.code}",
            f"Type: {coupon.discount_type}",
            f"Value: {float(coupon.discount_value)}",
        ],
    )
    return coupon

@api_router.put("/coupons/{coupon_id}", response_model=Coupon)
async def update_coupon(coupon_id: str, updates: CouponUpdate):
    existing = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Coupon not found")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if "discount_type" in update_data and update_data["discount_type"] not in ["percent", "fixed"]:
        raise HTTPException(status_code=400, detail="Invalid discount_type")
    if "discount_value" in update_data and float(update_data["discount_value"]) <= 0:
        raise HTTPException(status_code=400, detail="discount_value must be > 0")

    # Convert dates to isoformat for storage
    if "expires_at" in update_data and isinstance(update_data["expires_at"], datetime):
        update_data["expires_at"] = update_data["expires_at"].isoformat()

    await db.coupons.update_one({"id": coupon_id}, {"$set": update_data})
    updated = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated.get("expires_at"), str):
        try:
            updated["expires_at"] = datetime.fromisoformat(updated["expires_at"])
        except Exception:
            updated["expires_at"] = None
    await _notify_admin_telegram(
        "Coupon updated",
        [
            f"Coupon ID: {coupon_id}",
            f"Code: {updated.get('code')}",
            f"Changed fields: {', '.join(sorted(update_data.keys())) or 'none'}",
        ],
    )
    return updated

@api_router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str):
    existing = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Coupon not found")
    res = await db.coupons.delete_one({"id": coupon_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    await _notify_admin_telegram(
        "Coupon deleted",
        [
            f"Coupon ID: {coupon_id}",
            f"Code: {existing.get('code')}",
        ],
    )
    return {"message": "Coupon deleted"}

# ==================== ORDER ENDPOINTS ====================

@api_router.post("/orders", response_model=Order)
async def create_order(order_data: OrderCreate, user_id: str, user_email: str):
    await _auto_cancel_unpaid_orders()
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    if user_doc.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account is blocked")

    # Validate items & calculate total using authoritative product pricing/settings
    validated_items: List[OrderItem] = []
    subtotal = 0.0
    for item in order_data.items:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=400, detail=f"Invalid product_id: {item.product_id}")

        quantity = int(item.quantity)
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be at least 1")

        # Required fields validation
        if product.get("requires_player_id") and not (item.player_id and str(item.player_id).strip()):
            label = product.get("player_id_label") or "Player ID"
            raise HTTPException(status_code=400, detail=f"{label} is required for {product.get('name')}")

        if product.get("requires_credentials"):
            creds = item.credentials or {}
            required_fields = product.get("credential_fields") or ["email", "password"]
            missing = [f for f in required_fields if not (creds.get(f) and str(creds.get(f)).strip())]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing credentials fields for {product.get('name')}: {', '.join(missing)}"
                )

        price = float(product.get("price", item.price))
        subtotal += price * quantity

        item_seller_id = item.seller_id or product.get("seller_id") or None
        if item_seller_id:
            seller_check = await db.users.find_one({"id": item_seller_id, "seller_status": "approved"})
            if not seller_check:
                item_seller_id = None

        validated_items.append(
            OrderItem(
                product_id=product["id"],
                product_name=product.get("name", item.product_name),
                quantity=quantity,
                price=price,
                player_id=item.player_id,
                credentials=item.credentials,
                seller_id=item_seller_id,
            )
        )
    
    # Apply coupon (if any)
    coupon_code = _normalize_coupon_code(order_data.coupon_code) if order_data.coupon_code else None
    discount_amount = 0.0
    if coupon_code:
        coupon = await _get_valid_coupon(coupon_code, subtotal, user_id=user_id)
        if not coupon:
            raise HTTPException(status_code=400, detail="Invalid coupon")
        discount_amount = _calculate_discount(coupon, subtotal)

    total = max(0.0, float(subtotal) - float(discount_amount))

    order = Order(
        user_id=user_id,
        user_email=user_email,
        items=validated_items,
        subtotal_amount=subtotal,
        discount_amount=discount_amount if discount_amount > 0 else None,
        coupon_code=coupon_code,
        coupon_usage_recorded=False if coupon_code else None,
        total_amount=total,
        payment_method=order_data.payment_method
    )

    # Wallet payment: instantly mark paid and deduct balance
    if order_data.payment_method == "wallet":
        wallet_balance = float(user_doc.get("wallet_balance", 0.0))
        if wallet_balance + 1e-9 < total:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")

        await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": -float(total)}})
        await db.wallet_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "user_email": user_email,
            "order_id": order.id,
            "type": "purchase",
            "amount": -float(total),
            "reason": "Order payment (wallet)",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        order.payment_status = "paid"
        order.order_status = "processing"
    
    # If crypto payment, create Plisio invoice
    if order_data.payment_method == "crypto_plisio":
        settings = await db.settings.find_one({"id": "site_settings"})
        if settings and settings.get('plisio_api_key'):
            try:
                from plisio_helper import PlisioHelper
                plisio = PlisioHelper(settings['plisio_api_key'])
                
                callback_url = _plisio_callback_url()
                success_url = _plisio_success_url("order", order.id)
                cancel_url = _plisio_cancel_url("order", order.id)

                # Create Plisio invoice for USDT payment
                invoice_response = await plisio.create_invoice(
                    amount=total,
                    currency="USDT",
                    order_name=f"Order {order.id}",
                    order_number=order.id,
                    callback_url=callback_url,
                    email=user_email,
                    success_url=success_url,
                    cancel_url=cancel_url
                )
                
                if invoice_response.get("success"):
                    order.plisio_invoice_id = invoice_response.get("invoice_id")
                    order.plisio_invoice_url = invoice_response.get("invoice_url")
            except Exception as e:
                logging.error(f"Plisio error: {e}")

    if order_data.payment_method == "natcash":
        ref_code = secrets.token_hex(3).upper()
        order.natcash_reference = ref_code

    has_seller_items = any(item.seller_id for item in validated_items)
    if has_seller_items:
        order.escrow_status = "held"
        order.escrow_held_at = datetime.now(timezone.utc)

    doc = order.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('escrow_held_at'):
        doc['escrow_held_at'] = doc['escrow_held_at'].isoformat()
    
    await db.orders.insert_one(doc)
    await _record_product_orders_if_needed(order.id)
    await _notify_admin_telegram(
        "New order created",
        [
            f"Order ID: {order.id}",
            f"Customer: {user_email}",
            f"Items: {len(validated_items)}",
            f"Total: ${float(total):.2f}",
            f"Payment method: {order.payment_method}",
            f"Payment status: {order.payment_status}",
        ],
    )

    if order.payment_status == "paid":
        await _record_coupon_usage_if_needed(order.id)
        try:
            await _try_auto_deliver(order.id)
        except Exception as e:
            logging.error(f"Auto-delivery error on wallet payment: {e}")
        fresh = await db.orders.find_one({"id": order.id}, {"_id": 0})
        if fresh:
            for dt_field in ("created_at", "updated_at", "refunded_at",
                             "subscription_start_date", "subscription_end_date",
                             "escrow_held_at", "escrow_confirmed_at",
                             "escrow_release_at", "escrow_released_at"):
                if isinstance(fresh.get(dt_field), str):
                    fresh[dt_field] = datetime.fromisoformat(fresh[dt_field])
            return fresh

    return order

@api_router.get("/orders", response_model=List[Order])
async def get_orders(user_id: Optional[str] = None):
    await _auto_cancel_unpaid_orders()
    query = {}
    if user_id:
        query['user_id'] = user_id
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for order in orders:
        if isinstance(order.get('created_at'), str):
            order['created_at'] = datetime.fromisoformat(order['created_at'])
        if isinstance(order.get('updated_at'), str):
            order['updated_at'] = datetime.fromisoformat(order['updated_at'])
        if isinstance(order.get('refunded_at'), str):
            order['refunded_at'] = datetime.fromisoformat(order['refunded_at'])
        if isinstance(order.get('subscription_start_date'), str):
            order['subscription_start_date'] = datetime.fromisoformat(order['subscription_start_date'])
        if isinstance(order.get('subscription_end_date'), str):
            order['subscription_end_date'] = datetime.fromisoformat(order['subscription_end_date'])
    return orders

@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str):
    await _auto_cancel_unpaid_orders()
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if isinstance(order.get('created_at'), str):
        order['created_at'] = datetime.fromisoformat(order['created_at'])
    if isinstance(order.get('updated_at'), str):
        order['updated_at'] = datetime.fromisoformat(order['updated_at'])
    if isinstance(order.get('refunded_at'), str):
        order['refunded_at'] = datetime.fromisoformat(order['refunded_at'])
    if isinstance(order.get('subscription_start_date'), str):
        order['subscription_start_date'] = datetime.fromisoformat(order['subscription_start_date'])
    if isinstance(order.get('subscription_end_date'), str):
        order['subscription_end_date'] = datetime.fromisoformat(order['subscription_end_date'])
    return order

@api_router.put("/orders/{order_id}/status")
async def update_order_status(
    order_id: str,
    payment_status: Optional[str] = None,
    order_status: Optional[str] = None,
    reason: Optional[str] = None,
):
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payment_status:
        updates['payment_status'] = payment_status
    if order_status:
        updates['order_status'] = order_status
    if reason is not None:
        cleaned = reason.strip()
        if cleaned:
            updates["payment_rejection_reason"] = cleaned
            updates["payment_rejected_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.orders.update_one({"id": order_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")

    # Record coupon usage once payment is marked as paid
    if payment_status == "paid":
        await _record_coupon_usage_if_needed(order_id)
        try:
            await _try_auto_deliver(order_id)
        except Exception as e:
            logging.error(f"Auto-delivery error on manual status update: {e}")
    await _record_product_orders_if_needed(order_id)

    # If order is completed, trigger referral payout check (idempotent)
    if order_status == "completed":
        order = await db.orders.find_one({"id": order_id})
        if order:
            # Set subscription dates (if applicable) and run emails
            updated = await _set_subscription_dates_if_needed(order_id)
            try:
                await _maybe_send_subscription_emails(updated or order)
            except Exception as e:
                logging.error(f"Subscription email check error: {e}")
            await check_and_credit_referral(order)
            await _record_loyalty_credits_if_needed(order_id)
            await _credit_seller_earnings(order_id)

    await _notify_admin_telegram(
        "Order status updated",
        [
            f"Order ID: {order_id}",
            f"Payment status: {payment_status or 'unchanged'}",
            f"Order status: {order_status or 'unchanged'}",
            f"Reason: {reason.strip() if reason else 'n/a'}",
        ],
    )
    
    return {"message": "Order updated successfully"}


# ==================== G2BULK INTEGRATION (TOPUP ONLY) ====================

G2BULK_BASE_URL = "https://api.g2bulk.com/v1"


async def _get_g2bulk_api_key() -> Optional[str]:
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0})
    return (settings or {}).get("g2bulk_api_key") or os.environ.get("G2BULK_API_KEY")


async def _g2bulk_request(method: str, path: str, json_body: dict = None) -> dict:
    api_key = await _get_g2bulk_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="G2Bulk API key not configured")
    headers = {"X-API-Key": api_key, "Content-Type": "application/json", "Accept": "application/json"}
    url = f"{G2BULK_BASE_URL}{path}"
    try:
        resp = requests.request(method, url, headers=headers, json=json_body, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.HTTPError as e:
        detail = str(e)
        try:
            detail = resp.json().get("message", detail)
        except Exception:
            pass
        raise HTTPException(status_code=resp.status_code, detail=f"G2Bulk error: {detail}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"G2Bulk request failed: {str(e)}")


async def _g2bulk_purchase(product_id: int, quantity: int = 1) -> dict:
    """Purchase a product from G2Bulk. Returns order with delivery_items (codes)."""
    return await _g2bulk_request("POST", f"/products/{product_id}/purchase", {"quantity": quantity})


@api_router.get("/admin/g2bulk/balance")
async def admin_g2bulk_balance():
    """Check G2Bulk account balance."""
    return await _g2bulk_request("GET", "/getMe")


@api_router.get("/admin/g2bulk/categories")
async def admin_g2bulk_categories():
    """List G2Bulk product categories."""
    return await _g2bulk_request("GET", "/category")


@api_router.get("/admin/g2bulk/products")
async def admin_g2bulk_products(category_id: Optional[int] = None):
    """List G2Bulk products, optionally filtered by category."""
    if category_id:
        return await _g2bulk_request("GET", f"/category/{category_id}")
    return await _g2bulk_request("GET", "/products")


@api_router.get("/admin/g2bulk/products/{product_id}")
async def admin_g2bulk_product_detail(product_id: int):
    """Get G2Bulk product details."""
    return await _g2bulk_request("GET", f"/products/{product_id}")


class G2BulkImportRequest(BaseModel):
    product_ids: List[int]


@api_router.post("/admin/g2bulk/import")
async def admin_g2bulk_import(payload: G2BulkImportRequest):
    """Import selected G2Bulk products as KayiCom giftcard products."""
    imported = []
    skipped = []
    for g2_id in payload.product_ids:
        existing = await db.products.find_one({"g2bulk_product_id": g2_id}, {"_id": 0, "id": 1, "name": 1})
        if existing:
            skipped.append({"g2bulk_id": g2_id, "name": existing.get("name"), "reason": "already imported"})
            continue
        try:
            g2_product = await _g2bulk_request("GET", f"/products/{g2_id}")
            name = g2_product.get("title") or g2_product.get("name") or f"G2Bulk #{g2_id}"
            price = float(g2_product.get("unit_price") or g2_product.get("price") or 0)
            image = g2_product.get("image_url") or g2_product.get("image") or ""
            description = g2_product.get("description") or f"{name} — instant digital delivery via KayiCom."
            if len(description.strip()) < 50:
                description = f"{description} Purchase and receive your code instantly. Secure checkout on KayiCom."
            slug = await _generate_unique_product_slug(name)
            new_product = Product(
                name=name,
                slug=slug,
                description=description,
                category="giftcard",
                price=price,
                currency="USD",
                image_url=image,
                stock_available=True,
                delivery_type="automatic",
                delivery_time="instant",
                g2bulk_product_id=g2_id,
            )
            normalized = _normalize_product_doc(new_product.model_dump())
            new_product.seo_title = normalized.get("seo_title")
            new_product.seo_description = normalized.get("seo_description")
            doc = new_product.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            await db.products.insert_one(doc)
            doc.pop("_id", None)
            imported.append({"g2bulk_id": g2_id, "name": name, "id": doc["id"]})
        except Exception as e:
            skipped.append({"g2bulk_id": g2_id, "reason": str(e)})
    return {"imported": imported, "skipped": skipped, "total_imported": len(imported), "total_skipped": len(skipped)}


# ---------- G2Bulk Games / Top-up endpoints ----------

@api_router.get("/admin/g2bulk/games")
async def admin_g2bulk_games():
    """List all supported games for top-up."""
    return await _g2bulk_request("GET", "/games")


@api_router.get("/admin/g2bulk/games/{game_code}/catalogue")
async def admin_g2bulk_game_catalogue(game_code: str):
    """Get denominations/packages for a game."""
    return await _g2bulk_request("GET", f"/games/{game_code}/catalogue")


@api_router.post("/admin/g2bulk/games/fields")
async def admin_g2bulk_game_fields(game: str):
    """Get required fields for a game (e.g. userid, serverid)."""
    return await _g2bulk_request("POST", "/games/fields", {"game": game})


class G2BulkVerifyPlayerRequest(BaseModel):
    game_code: str
    player_id: str
    server_id: Optional[str] = None


@api_router.post("/verify-player-id")
async def verify_player_id(payload: G2BulkVerifyPlayerRequest):
    """Verify a player ID for a game top-up. Public endpoint for customers."""
    api_key = await _get_g2bulk_api_key()
    if not api_key:
        return {"valid": False, "message": "Verification not available"}
    try:
        body = {"game": payload.game_code, "user_id": payload.player_id}
        if payload.server_id:
            body["server_id"] = payload.server_id
        result = await _g2bulk_request("POST", "/games/checkPlayerId", body)
        if result.get("valid") == "valid":
            return {"valid": True, "name": result.get("name", ""), "message": f"Player found: {result.get('name', '')}"}
        return {"valid": False, "message": "Invalid Player ID. Please check and try again."}
    except Exception:
        return {"valid": False, "message": "Could not verify Player ID. Please check and try again."}


class G2BulkGameImportRequest(BaseModel):
    game_code: str
    game_name: str
    game_image: Optional[str] = None
    catalogues: List[Dict[str, Any]]


@api_router.post("/admin/g2bulk/games/import")
async def admin_g2bulk_game_import(payload: G2BulkGameImportRequest):
    """Import game top-up denominations as KayiCom topup products."""
    imported = []
    skipped = []
    for cat in payload.catalogues:
        cat_name = cat.get("name") or cat.get("id") or ""
        existing = await db.products.find_one({
            "g2bulk_game_code": payload.game_code,
            "g2bulk_catalogue_id": str(cat_name),
        }, {"_id": 0, "id": 1, "name": 1})
        if existing:
            skipped.append({"catalogue": cat_name, "name": existing.get("name"), "reason": "already imported"})
            continue
        try:
            name = f"{payload.game_name} {cat_name}"
            price = float(cat.get("amount") or cat.get("price") or 0)
            description = f"{name} — instant game top-up. Your account will be credited automatically after purchase."
            if len(description.strip()) < 50:
                description += " Fast and secure delivery on KayiCom."
            slug = await _generate_unique_product_slug(name)
            new_product = Product(
                name=name,
                slug=slug,
                description=description,
                category="topup",
                price=price,
                currency="USD",
                image_url=payload.game_image or "",
                stock_available=True,
                delivery_type="automatic",
                delivery_time="instant",
                g2bulk_game_code=payload.game_code,
                g2bulk_catalogue_id=str(cat_name),
                requires_player_id=True,
                player_id_label="Player ID",
            )
            normalized = _normalize_product_doc(new_product.model_dump())
            new_product.seo_title = normalized.get("seo_title")
            new_product.seo_description = normalized.get("seo_description")
            doc = new_product.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            await db.products.insert_one(doc)
            doc.pop("_id", None)
            imported.append({"catalogue": cat_name, "name": name, "id": doc["id"], "price": price})
        except Exception as e:
            skipped.append({"catalogue": cat_name, "reason": str(e)})
    return {"imported": imported, "skipped": skipped, "total_imported": len(imported), "total_skipped": len(skipped)}


@api_router.post("/g2bulk/callback")
async def g2bulk_topup_callback(request: Request):
    """Callback from G2Bulk when a game top-up order status changes."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}
    order_id_g2 = body.get("order_id")
    status = str(body.get("status") or "").upper()
    kayicom_order_id = body.get("remark") or ""
    logging.info("G2Bulk callback: g2_order=%s status=%s kayicom_order=%s", order_id_g2, status, kayicom_order_id)
    if not kayicom_order_id:
        return {"ok": True}
    order = await db.orders.find_one({"id": kayicom_order_id}, {"_id": 0})
    if not order:
        return {"ok": True}
    if status == "COMPLETED":
        if order.get("order_status") != "completed":
            now_iso = datetime.now(timezone.utc).isoformat()
            delivery_info = {
                "id": str(uuid.uuid4()),
                "details": f"G2Bulk top-up completed. Order #{order_id_g2}. {body.get('game_name', '')} {body.get('denom_id', '')} for player {body.get('player_id', '')}.",
                "items": [{"product_name": body.get("game_name", ""), "codes": [f"Top-up delivered to {body.get('player_name') or body.get('player_id', '')}"]}],
                "delivered_at": now_iso,
                "auto_delivered": True,
                "source": "g2bulk_topup",
            }
            await db.orders.update_one({"id": kayicom_order_id}, {"$set": {
                "order_status": "completed",
                "delivery_info": delivery_info,
                "updated_at": now_iso,
            }})
            await _record_product_orders_if_needed(kayicom_order_id)
            await _credit_seller_earnings(kayicom_order_id)
            logging.info("G2Bulk topup completed for order %s", kayicom_order_id)
    elif status == "FAILED":
        fail_msg = body.get("message", "Delivery failed")
        await db.orders.update_one({"id": kayicom_order_id}, {"$set": {
            "auto_delivery_failed_reason": f"Automatic delivery failed: {fail_msg}",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }})
        logging.warning("G2Bulk topup failed for order %s: %s", kayicom_order_id, fail_msg)
    return {"ok": True}


# ==================== NATCASH SMS CALLBACK ====================

import re as _natcash_re

_SMS_BODY_KEYS = ("message", "text", "body", "content", "sms_body", "smsBody", "msg")
_SMS_FROM_KEYS = ("sender", "from", "number", "phone", "sms_from", "smsFrom", "from_number")
_SMS_TIME_KEYS = ("timestamp", "receivedAt", "received_at", "sentStamp", "sms_time", "time", "date")
_SMS_SIM_KEYS = ("sim", "simNumber", "sim_number", "sim_slot", "simSlot")


def _extract_sms_fields(data: dict) -> dict:
    """Extract SMS body/sender/time/sim from various SMS Forwarder payload formats.

    Handles flat payloads, nested payloads (e.g. data["sms"]["message"]),
    and various field naming conventions across different Android SMS Forwarder apps.
    """
    def _find(d, keys):
        for k in keys:
            v = d.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return ""

    sms_body = _find(data, _SMS_BODY_KEYS)
    sms_from = _find(data, _SMS_FROM_KEYS)
    sms_time = _find(data, _SMS_TIME_KEYS)
    sim_slot = _find(data, _SMS_SIM_KEYS)

    if not sms_body:
        nested = data.get("sms") or data.get("SMS") or data.get("data") or {}
        if isinstance(nested, dict):
            sms_body = _find(nested, _SMS_BODY_KEYS)
            if not sms_from:
                sms_from = _find(nested, _SMS_FROM_KEYS)
            if not sms_time:
                sms_time = _find(nested, _SMS_TIME_KEYS)

    if not sms_body:
        device = data.get("device") or {}
        if isinstance(device, dict) and not sim_slot:
            sim_slot = _find(device, _SMS_SIM_KEYS + ("device_name",))

    return {"sms_body": sms_body, "sms_from": sms_from, "sms_time": sms_time, "sim": sim_slot}


def _parse_natcash_sms(sms_body: str) -> dict:
    """Parse a NatCash SMS to extract amount (HTG) and reference code.

    Returns {"amount_htg": float|None, "reference_code": str|None}.
    """
    amount_htg = None
    reference_code = None

    amount_match = _natcash_re.search(
        r"\b(?:HTG|Gdes?|G)\s*(\d[\d,]*(?:\.\d{1,2})?)", sms_body, _natcash_re.IGNORECASE
    )
    if not amount_match:
        amount_match = _natcash_re.search(
            r"(\d[\d,]*(?:\.\d{1,2})?)\s*(?:HTG|Gdes?|G)\b", sms_body, _natcash_re.IGNORECASE
        )
    if amount_match:
        raw = amount_match.group(1).replace(",", "")
        if raw:
            amount_htg = float(raw)

    ref_match = _natcash_re.search(
        r"\b(?:ref|code|memo|contenu|kontni)[:\s]*(\w{4,12})", sms_body, _natcash_re.IGNORECASE
    )
    if not ref_match:
        ref_match = _natcash_re.search(r"\b([A-Z0-9]{6})\b", sms_body)
    if ref_match:
        reference_code = ref_match.group(1).strip()

    return {"amount_htg": amount_htg, "reference_code": reference_code}


async def _match_natcash_order(reference_code, amount_htg, settings=None):
    """Find a pending NatCash order matching the parsed reference or amount.

    Returns (order_dict|None, match_method_str|None).
    """
    order = None
    match_method = None

    if reference_code:
        order = await db.orders.find_one({
            "payment_method": "natcash",
            "payment_status": "pending",
            "natcash_reference": reference_code,
        }, {"_id": 0})
        if order:
            match_method = "reference_code"

    if not order and amount_htg:
        if not settings:
            settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
        rate = float(settings.get("natcash_usd_htg_rate") or 135)
        tolerance = 2.0
        candidates = await db.orders.find({
            "payment_method": "natcash",
            "payment_status": "pending",
        }, {"_id": 0}).sort("created_at", -1).to_list(50)
        for c in candidates:
            expected_htg = float(c.get("total_amount", 0)) * rate
            if abs(expected_htg - amount_htg) <= tolerance:
                order = c
                match_method = "amount"
                break

    return order, match_method


async def _confirm_natcash_payment(order_id: str, sms_body: str):
    """Mark an order as paid and trigger post-payment actions."""
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one({"id": order_id}, {"$set": {
        "payment_status": "paid",
        "natcash_sms_body": sms_body,
        "natcash_confirmed_at": now_iso,
        "updated_at": now_iso,
    }})
    await _record_coupon_usage_if_needed(order_id)
    try:
        await _try_auto_deliver(order_id)
    except Exception as e:
        logging.error("Auto-delivery error on NatCash payment for order %s: %s", order_id, e)
    await _record_product_orders_if_needed(order_id)


@api_router.post("/natcash/verify/{order_id}")
async def natcash_verify_payment(order_id: str):
    """Customer checks if their NatCash payment has been detected."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_method") != "natcash":
        raise HTTPException(status_code=400, detail="Not a NatCash order")
    if order.get("payment_status") == "paid":
        return {"verified": True, "message": "Payment confirmed! Your order is being processed."}
    ref = order.get("natcash_reference")
    if ref:
        sms_match = await db.natcash_sms_log.find_one({"parsed_ref": ref, "matched_order": order_id})
        if sms_match:
            now_iso = datetime.now(timezone.utc).isoformat()
            await db.orders.update_one({"id": order_id}, {"$set": {
                "payment_status": "paid",
                "natcash_confirmed_at": now_iso,
                "updated_at": now_iso,
            }})
            await _record_coupon_usage_if_needed(order_id)
            try:
                await _try_auto_deliver(order_id)
            except Exception as e:
                logging.error("Auto-delivery error on NatCash verify: %s", e)
            await _record_product_orders_if_needed(order_id)
            return {"verified": True, "message": "Payment confirmed! Your order is being processed."}
    return {"verified": False, "message": "Peman an poko detekte. Asire w ou te voye montan egzak la ak kòd referans lan nan chan 'kontni', epi eseye ankò nan yon ti moman."}


@api_router.get("/natcash/sms-callback")
@api_router.post("/natcash/sms-callback")
async def natcash_sms_callback(
    request: Request,
    secret: Optional[str] = None,
    sms_body: Optional[str] = None,
    sms_from: Optional[str] = None,
    sms_time: Optional[str] = None,
):
    """Receive SMS data from Automate app. Accepts GET with query params or POST with JSON."""
    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            body = {}
    else:
        body = {}
    body = {
        "secret": secret or body.get("secret"),
        "sms_body": sms_body or body.get("sms_body"),
        "sms_from": sms_from or body.get("sms_from"),
        "sms_time": sms_time or body.get("sms_time"),
    }

    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    expected_secret = settings.get("natcash_callback_secret") or os.environ.get("NATCASH_CALLBACK_SECRET", "")
    if expected_secret and body.get("secret") != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid secret")

    sms_text = str(body.get("sms_body") or "")
    if not sms_text:
        raise HTTPException(status_code=400, detail="No SMS body")

    logging.info("NatCash SMS received: %s", sms_text[:200])

    parsed = _parse_natcash_sms(sms_text)
    amount_htg = parsed["amount_htg"]
    reference_code = parsed["reference_code"]

    if not amount_htg and not reference_code:
        logging.warning("NatCash SMS: could not parse amount or reference from: %s", sms_text[:200])
        await db.natcash_sms_log.insert_one({
            "sms_body": sms_text, "sms_from": body.get("sms_from"), "sms_time": body.get("sms_time"),
            "parsed_amount": None, "parsed_ref": None, "matched_order": None,
            "source": "automate",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True, "matched": False, "reason": "Could not parse SMS"}

    order, match_method = await _match_natcash_order(reference_code, amount_htg, settings)

    await db.natcash_sms_log.insert_one({
        "sms_body": sms_text, "sms_from": body.get("sms_from"), "sms_time": body.get("sms_time"),
        "parsed_amount": amount_htg, "parsed_ref": reference_code,
        "matched_order": order.get("id") if order else None,
        "match_method": match_method,
        "source": "automate",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    if not order:
        logging.info("NatCash SMS: no matching order for ref=%s amount=%s", reference_code, amount_htg)
        return {"ok": True, "matched": False, "reason": "No matching order found"}

    order_id = order["id"]
    await _confirm_natcash_payment(order_id, sms_text)
    logging.info("NatCash payment confirmed for order %s (ref=%s, amount_htg=%s)", order_id, reference_code, amount_htg)

    return {"ok": True, "matched": True, "order_id": order_id}


@api_router.get("/natcash/sms-logs")
async def natcash_sms_logs(limit: int = 50, offset: int = 0):
    """Admin tool: retrieve the latest SMS messages received by the webhook.

    Returns the raw SMS log entries stored by /api/webhook/natcash and
    /api/natcash/sms-callback so admins can see what the SMS Forwarder
    actually sent and whether each message was parsed/matched correctly.
    """
    docs = await db.natcash_sms_log.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).skip(offset).to_list(limit)
    total = await db.natcash_sms_log.count_documents({})
    return {"logs": docs, "total": total, "limit": limit, "offset": offset}


@api_router.post("/natcash/test-sms")
async def natcash_test_sms(request: Request):
    """Admin tool: simulate an SMS Forwarder webhook to test the NatCash pipeline.

    Uses the exact same parsing (_parse_natcash_sms) and matching (_match_natcash_order)
    helpers as the real /api/webhook/natcash endpoint so the test truly validates the pipeline.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    dry_run = body.get("dry_run", True)
    sms_body_input = str(body.get("sms_body") or "").strip()

    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    rate = float(settings.get("natcash_usd_htg_rate") or 135)
    callback_secret = settings.get("natcash_callback_secret") or ""

    pending_orders = await db.orders.find({
        "payment_method": "natcash",
        "payment_status": "pending",
    }, {"_id": 0}).sort("created_at", -1).to_list(10)

    # Fetch recent SMS logs received by the webhook so the admin can see them
    recent_sms_logs = await db.natcash_sms_log.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(10)

    if not sms_body_input:
        # Use the most recent real SMS from the webhook log
        if recent_sms_logs:
            latest = recent_sms_logs[0]
            sms_body_input = latest.get("sms_body") or ""
        # Fall back to auto-generating from pending orders
        if not sms_body_input and pending_orders:
            target = pending_orders[0]
            gen_amount = round(float(target.get("total_amount", 0)) * rate, 2)
            ref = target.get("natcash_reference") or "TESTRF"
            now_str = datetime.now(timezone.utc).strftime("%H:%M %d/%m/%Y")
            sms_body_input = (
                f"Ou resevwa {gen_amount:.2f} HTG nan TEST KLIYAN 50900000000 "
                f"nan {now_str}, kontni: {ref}. "
                f"Balans ou: 99999.00 HTG. Transcode: 00000000000000. Mesi"
            )
        if not sms_body_input:
            gen_amount = round(25.0 * rate, 2)
            now_str = datetime.now(timezone.utc).strftime("%H:%M %d/%m/%Y")
            sms_body_input = (
                f"Ou resevwa {gen_amount:.2f} HTG nan TEST KLIYAN 50900000000 "
                f"nan {now_str}, kontni: DEMO01. "
                f"Balans ou: 99999.00 HTG. Transcode: 00000000000000. Mesi"
            )

    parsed = _parse_natcash_sms(sms_body_input)
    amount_htg = parsed["amount_htg"]
    reference_code = parsed["reference_code"]

    matched_order, match_method = await _match_natcash_order(reference_code, amount_htg, settings)

    result = {
        "ok": True,
        "dry_run": dry_run,
        "sms_body_used": sms_body_input,
        "parsed": {
            "amount_htg": amount_htg,
            "reference_code": reference_code,
        },
        "matched": matched_order is not None,
        "match_method": match_method,
        "matched_order": {
            "id": matched_order["id"],
            "total_amount_usd": matched_order.get("total_amount"),
            "expected_htg": round(float(matched_order.get("total_amount", 0)) * rate, 2),
            "natcash_reference": matched_order.get("natcash_reference"),
            "payment_status": matched_order.get("payment_status"),
        } if matched_order else None,
        "pending_natcash_orders": [
            {
                "id": o["id"],
                "total_usd": o.get("total_amount"),
                "expected_htg": round(float(o.get("total_amount", 0)) * rate, 2),
                "ref": o.get("natcash_reference"),
                "created_at": o.get("created_at"),
            }
            for o in pending_orders[:5]
        ],
        "config": {
            "usd_htg_rate": rate,
            "callback_secret_set": bool(callback_secret),
        },
        "recent_sms_logs": [
            {
                "sms_body": log.get("sms_body", ""),
                "sms_from": log.get("sms_from", ""),
                "parsed_amount": log.get("parsed_amount"),
                "parsed_ref": log.get("parsed_ref"),
                "matched_order": log.get("matched_order"),
                "match_method": log.get("match_method"),
                "source": log.get("source", ""),
                "created_at": log.get("created_at", ""),
                "error": log.get("error"),
            }
            for log in recent_sms_logs[:5]
        ],
    }

    if not dry_run and matched_order:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.natcash_sms_log.insert_one({
            "sms_body": sms_body_input,
            "sms_from": "TEST-SMS-FORWARDER",
            "sms_time": now_iso,
            "parsed_amount": amount_htg,
            "parsed_ref": reference_code,
            "matched_order": matched_order["id"],
            "match_method": match_method,
            "source": "sms_forwarder_test",
            "is_test": True,
            "created_at": now_iso,
        })
        await _confirm_natcash_payment(matched_order["id"], sms_body_input)
        result["order_marked_paid"] = True
        logging.info("NatCash SMS Forwarder TEST: order %s marked paid (dry_run=False)", matched_order["id"])
    elif not dry_run and not matched_order:
        result["order_marked_paid"] = False

    return result


@api_router.get("/webhook/natcash")
@api_router.post("/webhook/natcash")
async def natcash_webhook_sms_forwarder(request: Request):
    """Receive NatCash SMS via SMS Forwarder apps (FKT Solutions, SMS Forwarder, etc.).

    Accepts GET (query params) or POST (JSON/form) to support various Android
    SMS Forwarder apps. Authenticates via Bearer token if configured.
    """
    auth_header = request.headers.get("Authorization", "")
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    expected_secret = (
        settings.get("natcash_callback_secret")
        or os.environ.get("NATCASH_CALLBACK_SECRET", "")
    )
    if expected_secret:
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        elif auth_header:
            token = auth_header
        if not token:
            token = request.query_params.get("secret", "")
        if token != expected_secret:
            raise HTTPException(status_code=401, detail="Invalid or missing Bearer token")

    data = {}
    if request.method == "GET":
        data = dict(request.query_params)
    else:
        content_type = request.headers.get("content-type", "")
        try:
            if "json" in content_type or not content_type:
                data = await request.json()
            elif "form" in content_type:
                form = await request.form()
                data = dict(form)
            else:
                try:
                    data = await request.json()
                except Exception:
                    form = await request.form()
                    data = dict(form)
        except Exception:
            raw_body = (await request.body()).decode("utf-8", errors="replace")
            logging.error("NatCash webhook: could not parse body (content-type=%s): %s", content_type, raw_body[:500])
            raise HTTPException(status_code=400, detail="Could not parse request body as JSON or form data")

    logging.info("NatCash webhook raw payload: %s", str(data)[:500])

    fields = _extract_sms_fields(data)
    sms_body = fields["sms_body"]
    sms_from = fields["sms_from"]
    sms_time = fields["sms_time"]
    sim_slot = fields["sim"]

    if not sms_body:
        logging.warning("NatCash webhook: no SMS body found in payload keys=%s", list(data.keys()))
        await db.natcash_sms_log.insert_one({
            "raw_payload": str(data)[:2000],
            "sms_body": "", "sms_from": sms_from, "sms_time": sms_time,
            "sim": sim_slot, "source": "sms_forwarder",
            "error": "no_sms_body_found",
            "payload_keys": list(data.keys()),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "error", "reason": "No SMS body found in payload", "received_keys": list(data.keys())}

    logging.info("NatCash SMS Forwarder received: %s", sms_body[:200])

    parsed = _parse_natcash_sms(sms_body)
    amount_htg = parsed["amount_htg"]
    reference_code = parsed["reference_code"]

    if not amount_htg and not reference_code:
        logging.warning(
            "NatCash SMS Forwarder: could not parse amount or reference from: %s",
            sms_body[:200],
        )
        await db.natcash_sms_log.insert_one({
            "sms_body": sms_body, "sms_from": sms_from, "sms_time": sms_time,
            "sim": sim_slot, "source": "sms_forwarder",
            "parsed_amount": None, "parsed_ref": None, "matched_order": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "ignored", "reason": "Could not parse SMS"}

    order, match_method = await _match_natcash_order(reference_code, amount_htg, settings)

    await db.natcash_sms_log.insert_one({
        "sms_body": sms_body, "sms_from": sms_from, "sms_time": sms_time,
        "sim": sim_slot, "source": "sms_forwarder",
        "parsed_amount": amount_htg, "parsed_ref": reference_code,
        "matched_order": order.get("id") if order else None,
        "match_method": match_method,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    if not order:
        logging.info(
            "NatCash SMS Forwarder: no matching order for ref=%s amount=%s",
            reference_code, amount_htg,
        )
        return {"status": "no_order_found", "matched": False, "reference": reference_code}

    order_id = order["id"]
    await _confirm_natcash_payment(order_id, sms_body)
    logging.info(
        "NatCash SMS Forwarder payment confirmed for order %s (ref=%s, amount_htg=%s)",
        order_id, reference_code, amount_htg,
    )

    return {
        "status": "success",
        "matched": True,
        "order_id": order_id,
        "reference": reference_code,
        "amount_htg": amount_htg,
    }


# ==================== AUTO-DELIVERY LOGIC ====================

async def _try_auto_deliver(order_id: str) -> bool:
    """Attempt automatic delivery for an order whose payment is confirmed.

    For each order item whose product has delivery_type == "automatic",
    atomically reserve an available code from the product_codes collection.
    If every automatic-delivery item gets a code, mark the order completed
    and send the delivery email.  Returns True if auto-delivery succeeded.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return False

    if order.get("order_status") == "completed":
        return False

    items = order.get("items", [])
    if not items:
        return False

    reserved_codes: List[dict] = []
    skipped_manual = []
    fail_reason = None

    for item in items:
        product = await db.products.find_one({"id": item.get("product_id")}, {"_id": 0})
        if not product:
            skipped_manual.append(item.get("product_name", item.get("product_id", "Unknown")))
            continue

        if product.get("delivery_type") != "automatic":
            skipped_manual.append(product.get("name", item.get("product_name", "Unknown")))
            continue

        qty = max(int(item.get("quantity", 1)), 1)

        g2bulk_game_code = product.get("g2bulk_game_code")
        g2bulk_catalogue_id = product.get("g2bulk_catalogue_id")
        if g2bulk_game_code and g2bulk_catalogue_id:
            player_id = item.get("player_id") or ""
            if not player_id:
                fail_reason = f"Player ID required for '{product.get('name', '')}'"
                skipped_manual.append(product.get("name", item.get("product_name", "Unknown")))
                continue
            try:
                settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
                backend_url = os.environ.get("BACKEND_URL") or settings.get("backend_url") or ""
                callback_url = f"{backend_url}/api/g2bulk/callback" if backend_url else None
                for _ in range(qty):
                    order_body = {
                        "catalogue_name": g2bulk_catalogue_id,
                        "player_id": str(player_id),
                        "remark": order_id,
                    }
                    if item.get("server_id"):
                        order_body["server_id"] = str(item["server_id"])
                    if callback_url:
                        order_body["callback_url"] = callback_url
                    g2_result = await _g2bulk_request("POST", f"/games/{g2bulk_game_code}/order", order_body)
                    g2_order = g2_result.get("order", {})
                    logging.info("G2Bulk topup order placed for %s: order_id=%s status=%s", order_id, g2_order.get("order_id"), g2_order.get("status"))
                reserved_codes.append({
                    "product_id": product["id"],
                    "product_name": item.get("product_name", product.get("name", "")),
                    "quantity": qty,
                    "codes": [{"code": f"Top-up processing for player {player_id}", "id": f"g2t-{uuid.uuid4().hex[:8]}", "source": "g2bulk_topup"}],
                })
                continue
            except Exception as e:
                logging.error("G2Bulk topup order failed for order %s: %s", order_id, str(e))
                clean_err = str(e).replace("G2Bulk error: ", "").replace("G2Bulk ", "")
                fail_reason = f"Automatic delivery failed for '{product.get('name', '')}': {clean_err}"
                skipped_manual.append(product.get("name", item.get("product_name", "Unknown")))
                continue

        g2bulk_pid = product.get("g2bulk_product_id")
        if g2bulk_pid:
            try:
                g2_result = await _g2bulk_purchase(int(g2bulk_pid), qty)
                g2_codes = g2_result.get("delivery_items") or []
                if not g2_codes:
                    raise ValueError("G2Bulk returned no delivery items")
                code_docs = [{"code": c, "id": f"g2b-{uuid.uuid4().hex[:8]}", "source": "g2bulk", "g2bulk_order_id": g2_result.get("order_id")} for c in g2_codes]
                reserved_codes.append({
                    "product_id": product["id"],
                    "product_name": item.get("product_name", product.get("name", "")),
                    "quantity": qty,
                    "codes": code_docs,
                })
                logging.info("G2Bulk voucher delivery for order %s product %s: %d codes", order_id, product.get("name"), len(g2_codes))
                continue
            except Exception as e:
                logging.error("G2Bulk purchase failed for order %s: %s", order_id, str(e))
                clean_err = str(e).replace("G2Bulk error: ", "").replace("G2Bulk ", "")
                fail_reason = f"Automatic delivery failed for '{product.get('name', '')}': {clean_err}"
                skipped_manual.append(product.get("name", item.get("product_name", "Unknown")))
                continue

        item_codes = []
        item_failed = False
        for _ in range(qty):
            code_doc = await db.product_codes.find_one_and_update(
                {"product_id": product["id"], "status": "available"},
                {"$set": {
                    "status": "reserved",
                    "order_id": order_id,
                    "delivered_at": datetime.now(timezone.utc).isoformat(),
                }},
                return_document=True,
            )
            if not code_doc:
                item_failed = True
                fail_reason = f"No available codes for product '{product.get('name', '')}' (needed {qty}, got {len(item_codes)})"
                for rollback_code in item_codes:
                    await db.product_codes.update_one(
                        {"id": rollback_code["id"], "status": "reserved", "order_id": order_id},
                        {"$set": {"status": "available", "order_id": None, "delivered_at": None}},
                    )
                break
            item_codes.append(code_doc)

        if item_failed:
            skipped_manual.append(product.get("name", item.get("product_name", "Unknown")))
            continue
        reserved_codes.append({
            "product_id": product["id"],
            "product_name": item.get("product_name", product.get("name", "")),
            "quantity": qty,
            "codes": item_codes,
        })

    if not reserved_codes:
        if fail_reason:
            logging.warning("Auto-delivery failed for order %s: %s", order_id, fail_reason)
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {"auto_delivery_failed_reason": fail_reason}},
            )
        return False

    for entry in reserved_codes:
        for code_doc in entry["codes"]:
            await db.product_codes.update_one(
                {"id": code_doc["id"]},
                {"$set": {"status": "delivered"}},
            )

    delivery_items = []
    all_details_parts = []
    for entry in reserved_codes:
        codes_text = "\n".join(c.get("code", "") for c in entry["codes"])
        delivery_items.append({
            "product_id": entry["product_id"],
            "product_name": entry["product_name"],
            "quantity": entry["quantity"],
            "details": codes_text,
        })
        all_details_parts.append(f"{entry['product_name']}:\n{codes_text}")

    has_manual_remaining = len(skipped_manual) > 0
    final_order_status = "processing" if has_manual_remaining else "completed"

    now_iso = datetime.now(timezone.utc).isoformat()
    delivery_info_data = {
        "details": "\n\n".join(all_details_parts),
        "items": delivery_items,
        "delivered_at": now_iso,
        "auto_delivered": True,
    }
    if has_manual_remaining:
        delivery_info_data["partial"] = True
        delivery_info_data["pending_manual"] = skipped_manual

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "delivery_info": delivery_info_data,
            "order_status": final_order_status,
            "payment_status": "paid",
            "updated_at": now_iso,
        }}
    )

    await _record_product_orders_if_needed(order_id)
    updated_order = await _set_subscription_dates_if_needed(order_id)
    if not updated_order:
        updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await _record_loyalty_credits_if_needed(order_id)
    await _credit_seller_earnings(order_id)
    try:
        await _maybe_send_subscription_emails(updated_order or order)
    except Exception as e:
        logging.error(f"Auto-delivery subscription email error: {e}")
    try:
        if updated_order:
            await check_and_credit_referral(updated_order)
    except Exception as e:
        logging.error(f"Auto-delivery referral error: {e}")

    try:
        settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
        user_email = order.get("user_email")
        if user_email:
            items_html = ""
            if delivery_items:
                list_rows = "".join(
                    f"<li><b>{i.get('product_name', 'Item')}:</b> "
                    f"<pre style='background:#111827;color:#D1D5DB;padding:8px;border-radius:6px;white-space:pre-wrap;margin:6px 0'>{i.get('details')}</pre></li>"
                    for i in delivery_items
                )
                items_html = f"<p><b>Your codes / credentials:</b></p><ul>{list_rows}</ul>"
            html = (
                f"<div style='font-family:Arial,sans-serif'>"
                f"<h2>Your order has been delivered automatically!</h2>"
                f"<p><b>Order:</b> {order_id}</p>"
                f"{items_html}"
                f"<p>Thank you for your purchase!</p>"
                f"</div>"
            )
            _send_resend_email(settings, user_email, "Your delivery is ready - Auto Delivery", html)
    except Exception as e:
        logging.error(f"Auto-delivery email error: {e}")

    try:
        await _notify_admin_telegram(
            "Auto-delivery completed",
            [
                f"Order: {order_id[:8]}",
                f"Items: {len(delivery_items)}",
                f"User: {order.get('user_email', 'N/A')}",
            ],
        )
    except Exception:
        pass

    logging.info("Auto-delivery completed for order %s", order_id)
    return True


# Delivery Management Models
class DeliveryItem(BaseModel):
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    quantity: Optional[int] = None
    details: str


class DeliveryInfo(BaseModel):
    delivery_details: Optional[str] = None  # Credentials, codes, or instructions
    items: Optional[List[DeliveryItem]] = None

@api_router.post("/orders/{order_id}/retry-delivery")
async def retry_auto_delivery(order_id: str):
    """Admin retries auto-delivery for an order that previously failed (e.g. after recharging API balance)."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Order is not paid")
    if order.get("order_status") == "completed":
        raise HTTPException(status_code=400, detail="Order is already completed")
    await db.orders.update_one({"id": order_id}, {"$set": {
        "auto_delivery_failed_reason": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    success = await _try_auto_deliver(order_id)
    if success:
        return {"message": "Auto-delivery completed successfully", "status": "completed"}
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    reason = updated.get("auto_delivery_failed_reason") or "Delivery still pending"
    return {"message": f"Delivery retry attempted but failed: {reason}", "status": "failed"}


@api_router.put("/orders/{order_id}/delivery")
async def update_order_delivery(order_id: str, delivery_info: DeliveryInfo):
    """Update order with delivery information and mark as completed. Admin cannot deliver seller products."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    has_seller_items = any(item.get("seller_id") for item in (order.get("items") or []))
    if has_seller_items:
        raise HTTPException(status_code=403, detail="Seller products must be delivered by the seller, not admin")

    existing_info = order.get("delivery_info") or {}
    details = delivery_info.delivery_details
    if details is None:
        details = existing_info.get("details", "")
    items = delivery_info.items
    if items is None:
        items = existing_info.get("items", [])

    normalized_items = []
    for item in items or []:
        if isinstance(item, DeliveryItem):
            data = item.model_dump()
        elif isinstance(item, dict):
            data = item
        else:
            continue
        if data.get("details") and str(data.get("details")).strip():
            normalized_items.append(data)

    if not (details and str(details).strip()) and not normalized_items:
        raise HTTPException(status_code=400, detail="Delivery details required")

    updates = {
        "delivery_info": {
            "details": details or "",
            "items": normalized_items,
            "delivered_at": datetime.now(timezone.utc).isoformat()
        },
        "order_status": "completed",
        "payment_status": "paid",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    await _record_product_orders_if_needed(order_id)

    # Set subscription dates if this order is a subscription
    order = await _set_subscription_dates_if_needed(order_id)
    if not order:
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})

    # Award loyalty credits once order is completed+paid
    await _record_loyalty_credits_if_needed(order_id)
    await _credit_seller_earnings(order_id)

    # Send delivery email (includes expiry if subscription)
    try:
        settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
        if order and order.get("user_email"):
            end = order.get("subscription_end_date")
            end_str = ""
            if end:
                if isinstance(end, str):
                    try:
                        end_dt = datetime.fromisoformat(end)
                        end_str = _format_dt(end_dt)
                    except Exception:
                        end_str = str(end)
                elif isinstance(end, datetime):
                    end_str = _format_dt(end)
            extra = f"<p><b>Subscription ends:</b> {end_str}</p>" if end_str else ""
            items_html = ""
            item_list = updates["delivery_info"].get("items") or []
            if item_list:
                list_rows = "".join(
                    f"<li><b>{i.get('product_name') or i.get('product_id') or 'Item'}:</b> "
                    f"<pre style='background:#111827;color:#D1D5DB;padding:8px;border-radius:6px;white-space:pre-wrap;margin:6px 0'>{i.get('details')}</pre></li>"
                    for i in item_list
                )
                items_html = f"<p><b>Item delivery details:</b></p><ul>{list_rows}</ul>"

            details_block = ""
            if updates["delivery_info"].get("details"):
                details_block = (
                    "<p><b>Delivery notes:</b></p>"
                    f"<pre style='background:#111827;color:#D1D5DB;padding:12px;border-radius:8px;white-space:pre-wrap'>{updates['delivery_info']['details']}</pre>"
                )

            html = (
                f"<div style='font-family:Arial,sans-serif'>"
                f"<h2>Your order has been delivered</h2>"
                f"<p><b>Order:</b> {order_id}</p>"
                f"{items_html}"
                f"{details_block}"
                f"{extra}"
                f"</div>"
            )
            _send_resend_email(settings, order["user_email"], "Your delivery is ready", html)
    except Exception as e:
        logging.error(f"Delivery email error: {e}")

    # Schedule/trigger reminder checks immediately
    if order:
        try:
            await _maybe_send_subscription_emails(order)
        except Exception as e:
            logging.error(f"Subscription email check error: {e}")

    await _notify_admin_telegram(
        "Order delivered",
        [
            f"Order ID: {order_id}",
            f"Customer: {order.get('user_email') if order else 'unknown'}",
            f"Items with delivery details: {len(normalized_items)}",
        ],
    )

    return {"message": "Order delivered successfully"}


# ==================== PAYMENT ENDPOINTS ====================

@api_router.post("/payments/manual-proof")
async def upload_payment_proof(proof_data: ManualPaymentProof):
    order = await db.orders.find_one({"id": proof_data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("payment_proof_url"):
        raise HTTPException(status_code=400, detail="Payment proof already submitted")

    if order.get("payment_status") != "pending":
        raise HTTPException(status_code=400, detail="Payment is already being processed")

    # Update order with payment proof
    await db.orders.update_one(
        {"id": proof_data.order_id},
        {"$set": {
            "payment_proof_url": proof_data.payment_proof_url,
            "transaction_id": proof_data.transaction_id,
            "payment_status": "pending_verification",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    await _notify_admin_telegram(
        "Order payment proof submitted",
        [
            f"Order ID: {proof_data.order_id}",
            f"Transaction ID: {proof_data.transaction_id}",
            f"Status: pending_verification",
        ],
    )

    return {"message": "Payment proof uploaded successfully"}

@api_router.post("/payments/plisio-callback")
async def plisio_callback(data: Dict[str, Any]):
    # Handle Plisio webhook
    order_id = data.get('order_number')
    status = data.get('status')
    
    if status == 'completed':
        # First try normal orders
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order:
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "payment_status": "paid",
                    "order_status": "processing",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            await _record_coupon_usage_if_needed(order_id)
            await _record_product_orders_if_needed(order_id)
            try:
                await _try_auto_deliver(order_id)
            except Exception as e:
                logging.error(f"Auto-delivery error on Plisio callback: {e}")
            await _notify_admin_telegram(
                "Crypto payment confirmed (order)",
                [
                    f"Order ID: {order_id}",
                    "Status: paid / processing",
                ],
            )
        else:
            # Then try wallet topups
            topup = await db.wallet_topups.find_one({"id": order_id}, {"_id": 0})
            if topup:
                await db.wallet_topups.update_one(
                    {"id": order_id},
                    {"$set": {
                        "payment_status": "paid",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                if not topup.get("credited"):
                    await db.users.update_one({"id": topup["user_id"]}, {"$inc": {"wallet_balance": float(topup["amount"])}})
                    await db.wallet_transactions.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": topup["user_id"],
                        "user_email": topup.get("user_email"),
                        "order_id": None,
                        "type": "topup",
                        "amount": float(topup["amount"]),
                        "reason": f"Wallet topup {order_id} (Plisio)",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                    await db.wallet_topups.update_one({"id": order_id}, {"$set": {"credited": True}})
            else:
                # Then try minutes transfers
                transfer = await db.minutes_transfers.find_one({"id": order_id}, {"_id": 0})
                if transfer:
                    await db.minutes_transfers.update_one(
                        {"id": order_id},
                        {"$set": {
                            "payment_status": "paid",
                            "transfer_status": "processing",
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                else:
                    # Then try crypto transactions (USDT sell)
                    tx = await db.crypto_transactions.find_one({"id": order_id})
                    if tx and tx.get("transaction_type") == "sell":
                        if tx.get("status") != "completed":
                            await db.crypto_transactions.update_one(
                                {"id": order_id},
                                {"$set": {
                                    "status": "completed",
                                    "updated_at": datetime.now(timezone.utc).isoformat()
                                }}
                            )
                            try:
                                settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
                                admin_user = await db.users.find_one({"role": "admin"}, {"email": 1, "_id": 0})
                                admin_email = (admin_user or {}).get("email") or settings.get("support_email")
                                if admin_email:
                                    html = (
                                        "<div style='font-family:Arial,sans-serif'>"
                                        "<h2>USDT Sell Deposit Confirmed</h2>"
                                        f"<p><b>Transaction:</b> {order_id}</p>"
                                        f"<p><b>User:</b> {tx.get('user_email') or tx.get('user_id')}</p>"
                                        f"<p><b>Amount:</b> {tx.get('amount_crypto')} USDT</p>"
                                        f"<p><b>Network:</b> {tx.get('chain')}</p>"
                                        f"<p><b>Pay customer via:</b> {tx.get('payment_method')}</p>"
                                        f"<p><b>Receiving info:</b> {tx.get('receiving_info')}</p>"
                                        "</div>"
                                    )
                                    _send_resend_email(settings, admin_email, "USDT Sell Deposit Confirmed", html)
                            except Exception as e:
                                logger.error(f"Failed to send admin sell notification: {e}")
    
    return {"status": "ok"}


@api_router.get("/payments/plisio-status/{invoice_id}")
async def check_plisio_status(invoice_id: str):
    settings = await db.settings.find_one({"id": "site_settings"})
    if not settings or not settings.get('plisio_api_key'):
        raise HTTPException(status_code=400, detail="Plisio not configured")
    
    try:
        response = requests.get(
            f"https://api.plisio.net/api/v1/operations/{invoice_id}",
            params={"api_key": settings['plisio_api_key']}
        )
        return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _binance_api_sign(api_secret: str, query_string: str) -> str:
    import hmac
    return hmac.new(api_secret.encode(), query_string.encode(), hashlib.sha256).hexdigest()


BINANCE_API_BASES = [
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://api4.binance.com",
]


async def _binance_api_call(api_key: str, api_secret: str, path: str, extra_params: dict = None, proxy_url: str = None) -> dict:
    import time as _time
    timestamp = str(int(_time.time() * 1000))
    params = {"timestamp": timestamp}
    if extra_params:
        params.update(extra_params)
    query = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    signature = _binance_api_sign(api_secret, query)
    full_query = f"{query}&signature={signature}"
    headers = {"X-MBX-APIKEY": api_key}

    # If proxy URL is set, use it first (Vercel/Cloudflare to bypass geo-restriction)
    if proxy_url:
        proxy_base = proxy_url.rstrip("/")
        url = f"{proxy_base}?endpoint={path}&{full_query}"
        try:
            resp = requests.get(url, headers=headers, timeout=20)
            data = resp.json()
            msg = str(data.get("msg") or data.get("message") or "")
            if "restricted location" not in msg.lower() and data.get("code") != -1:
                return data
            logging.info(f"Proxy also restricted, trying direct...")
        except Exception as e:
            logging.warning(f"Binance proxy call failed: {e}")

    for base_url in BINANCE_API_BASES:
        url = f"{base_url}{path}?{full_query}"
        try:
            resp = requests.get(url, headers=headers, timeout=15)
            data = resp.json()
            msg = str(data.get("msg") or data.get("message") or "")
            if "restricted location" in msg.lower():
                logging.info(f"Binance API restricted on {base_url}, trying next...")
                continue
            return data
        except Exception as e:
            logging.warning(f"Binance API call failed on {base_url}: {e}")
            continue

    return {"code": -1, "msg": "All Binance API endpoints returned restricted location error. Set up a Cloudflare Worker proxy."}


async def _binance_get_pay_transactions(api_key: str, api_secret: str, start_time: int = None, end_time: int = None, limit: int = 100, proxy_url: str = None) -> dict:
    params = {"limit": str(limit)}
    if start_time:
        params["startTime"] = str(start_time)
    if end_time:
        params["endTime"] = str(end_time)
    return await _binance_api_call(api_key, api_secret, "/sapi/v1/pay/transactions", params, proxy_url=proxy_url)


@api_router.get("/payments/binance-pay/debug-transactions")
async def debug_binance_transactions():
    """Admin debug: show raw Binance API responses to identify correct field names."""
    settings = await db.settings.find_one({"id": "site_settings"})
    api_key = (settings or {}).get("binance_pay_api_key", "")
    api_secret = (settings or {}).get("binance_pay_secret_key", "")
    proxy_url = (settings or {}).get("binance_pay_proxy_url", "") or ""
    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Binance API credentials not configured")

    import time as _time
    now_ms = int(_time.time() * 1000)
    one_day_ms = 7 * 24 * 3600 * 1000

    results = {"proxy_url_configured": bool(proxy_url)}

    # 1) Binance Pay transactions (last 7 days)
    try:
        pay_result = await _binance_get_pay_transactions(api_key, api_secret, start_time=now_ms - one_day_ms, end_time=now_ms, proxy_url=proxy_url)
        results["pay_transactions"] = {"raw_response": pay_result, "count": len(pay_result.get("data", []))}
    except Exception as e:
        results["pay_transactions"] = {"error": str(e)}

    # 2) Binance Pay without time filter
    try:
        pay_no_time = await _binance_get_pay_transactions(api_key, api_secret, limit=20, proxy_url=proxy_url)
        results["pay_no_time_filter"] = {"raw_response": pay_no_time, "count": len(pay_no_time.get("data", []))}
    except Exception as e:
        results["pay_no_time_filter"] = {"error": str(e)}

    # 3) C2C order history
    try:
        c2c_result = await _binance_get_c2c_orders(api_key, api_secret, proxy_url=proxy_url)
        results["c2c_orders"] = {"raw_response": c2c_result, "count": len(c2c_result.get("data", []))}
    except Exception as e:
        results["c2c_orders"] = {"error": str(e)}

    return results


async def _binance_get_c2c_orders(api_key: str, api_secret: str, trade_type: str = "BUY", proxy_url: str = None) -> dict:
    return await _binance_api_call(api_key, api_secret, "/sapi/v1/c2c/orderMatch/listUserOrderHistory", {"tradeType": trade_type}, proxy_url=proxy_url)


class BinancePayVerifyRequest(BaseModel):
    order_id: str
    binance_order_id: str


@api_router.post("/payments/binance-pay/verify")
async def verify_binance_pay(req: BinancePayVerifyRequest):
    settings = await db.settings.find_one({"id": "site_settings"})
    api_key = (settings or {}).get("binance_pay_api_key", "")
    api_secret = (settings or {}).get("binance_pay_secret_key", "")
    proxy_url = (settings or {}).get("binance_pay_proxy_url", "") or ""
    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Binance API credentials not configured. Contact admin.")

    order = await db.orders.find_one({"id": req.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") in ("paid", "cancelled"):
        return {"status": order["payment_status"], "message": "Order already processed"}

    binance_id = req.binance_order_id.strip()
    if not binance_id:
        raise HTTPException(status_code=400, detail="Binance Pay Order ID is required")

    order_amount = float(order.get("total_amount", 0))
    verified = False
    matched_tx = {}

    import time as _time
    now_ms = int(_time.time() * 1000)
    one_day_ms = 24 * 3600 * 1000

    try:
        result = await _binance_get_pay_transactions(api_key, api_secret, start_time=now_ms - one_day_ms, end_time=now_ms, proxy_url=proxy_url)
        logging.info(f"Binance Pay transactions: code={result.get('code', 'N/A')}, count={len(result.get('data', []))}")

        if result.get("code") == "000000" and result.get("data"):
            for tx in result["data"]:
                tx_status = (tx.get("orderStatus") or tx.get("status") or "").upper()
                if tx_status not in ("SUCCESS", "COMPLETED", "ACCEPTED"):
                    continue

                tx_order_id = str(tx.get("orderNumber", "")).strip()
                tx_trans_id = str(tx.get("transactionId", "")).strip()

                if binance_id in (tx_order_id, tx_trans_id):
                    tx_amount = abs(float(tx.get("amount", 0)))
                    if tx_amount >= order_amount - 0.01:
                        verified = True
                        matched_tx = tx
                        break

        elif result.get("code") and result.get("code") != "000000":
            logging.warning(f"Binance API error: {result.get('code')} - {result.get('message', '')}")
            raise HTTPException(status_code=502, detail=f"Binance API error: {result.get('message', 'Unknown error')}")
    except HTTPException:
        raise
    except Exception as e:
        logging.warning(f"Binance Pay transactions query failed: {e}")
        raise HTTPException(status_code=502, detail="Failed to connect to Binance API. Please try again.")

    # Fallback: check C2C/P2P orders if not found in Pay transactions
    if not verified:
        try:
            for trade_type in ("BUY", "SELL"):
                c2c_result = await _binance_get_c2c_orders(api_key, api_secret, trade_type=trade_type, proxy_url=proxy_url)
                logging.info(f"Binance C2C ({trade_type}): code={c2c_result.get('code', 'N/A')}, count={len(c2c_result.get('data', []))}")
                if c2c_result.get("code") == "000000" and c2c_result.get("data"):
                    for tx in c2c_result["data"]:
                        tx_status = (tx.get("orderStatus") or tx.get("status") or "").upper()
                        if tx_status not in ("COMPLETED", "TRADING", "BUYER_PAYED", "4", "5"):
                            continue
                        tx_order_no = str(tx.get("orderNumber") or tx.get("advNo") or "").strip()
                        tx_ad_no = str(tx.get("advNo") or "").strip()
                        if binance_id in (tx_order_no, tx_ad_no):
                            tx_amount = abs(float(tx.get("totalPrice") or tx.get("amount") or 0))
                            if tx_amount >= order_amount - 0.01:
                                verified = True
                                matched_tx = tx
                                matched_tx["_source"] = "c2c"
                                break
                if verified:
                    break
        except Exception as e:
            logging.warning(f"Binance C2C query failed: {e}")

    verify_source = matched_tx.get("_source", "pay")
    if verified:
        await db.orders.update_one(
            {"id": req.order_id},
            {"$set": {
                "payment_status": "paid",
                "order_status": "processing",
                "transaction_id": binance_id,
                "payment_proof_url": f"binance-{verify_source}-verified:{binance_id}",
                "binance_pay_data": matched_tx,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        try:
            await _try_auto_deliver(req.order_id)
        except Exception as e:
            logging.error(f"Auto-delivery error on Binance Pay: {e}")
        try:
            await _notify_admin_telegram(
                f"Binance {'C2C' if verify_source == 'c2c' else 'Pay'} Auto-Verified",
                [
                    f"Order: {req.order_id[:8]}",
                    f"Amount: ${order_amount:.2f}",
                    f"Binance ID: {binance_id}",
                    f"Source: {verify_source.upper()}",
                    f"User: {order.get('user_email', 'N/A')}",
                ],
            )
        except Exception:
            pass
        return {"status": "paid", "message": "Payment verified automatically!", "verified": True, "source": verify_source}
    else:
        return {
            "status": "pending",
            "message": "Payment not found yet. Make sure you entered the correct Order ID from Binance Pay or C2C, and try again in a few minutes.",
            "verified": False,
        }


# ==================== SELLER ENDPOINTS ====================

@api_router.post("/seller/apply")
async def seller_apply(payload: SellerApplicationRequest, user_id: str):
    """Customer applies to become a seller."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admins cannot apply as sellers")
    if user.get("seller_status") in ("kyc_submitted", "approved"):
        raise HTTPException(status_code=400, detail="Already applied or approved")
    await db.users.update_one({"id": user_id}, {"$set": {
        "seller_status": "pending_kyc",
        "seller_store_name": payload.store_name.strip(),
        "seller_bio": (payload.bio or "").strip() or None,
        "seller_phone": (payload.phone or "").strip() or None,
        "seller_address": (payload.address or "").strip() or None,
        "seller_city": (payload.city or "").strip() or None,
        "seller_country": (payload.country or "").strip() or None,
        "seller_date_of_birth": (payload.date_of_birth or "").strip() or None,
        "seller_selling_platforms": (payload.selling_platforms or "").strip() or None,
        "seller_years_experience": payload.years_experience,
        "seller_selling_proof_url": (payload.selling_proof_url or "").strip() or None,
    }})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "password_hash": 0})
    return updated


@api_router.post("/seller/kyc")
async def seller_kyc_submit(payload: SellerKYCSubmit, user_id: str):
    """Submit KYC documents (ID photo + selfie)."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("seller_status") not in ("pending_kyc", "rejected"):
        raise HTTPException(status_code=400, detail="KYC not expected at this stage")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user_id}, {"$set": {
        "seller_status": "kyc_submitted",
        "seller_kyc_document_url": payload.document_url.strip(),
        "seller_kyc_selfie_url": payload.selfie_url.strip(),
        "seller_kyc_submitted_at": now,
        "seller_kyc_rejection_reason": None,
    }})
    await _notify_admin_telegram("New seller KYC submission", [
        f"User: {user.get('email')}",
        f"Store: {user.get('seller_store_name', 'N/A')}",
    ])
    return {"message": "KYC submitted for review"}


@api_router.get("/seller/profile")
async def seller_profile(user_id: str):
    """Get seller profile and stats."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    product_count = await db.products.count_documents({"seller_id": user_id})
    return {**user, "product_count": product_count}


@api_router.post("/seller/category-request")
async def seller_request_categories(payload: SellerCategoryAccessRequest, user_id: str):
    """Seller requests access to sell in specific categories."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("seller_status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved sellers can request categories")
    cats = [c.strip().lower() for c in payload.categories if c.strip()]
    if not cats:
        raise HTTPException(status_code=400, detail="No categories provided")
    now = datetime.now(timezone.utc).isoformat()
    request_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_email": user.get("email"),
        "store_name": user.get("seller_store_name"),
        "requested_categories": cats,
        "status": "pending",
        "created_at": now,
    }
    await db.seller_category_requests.insert_one(request_doc)
    await _notify_admin_telegram("Seller category access request", [
        f"Seller: {user.get('email')}",
        f"Categories: {', '.join(cats)}",
    ])
    return {"message": "Category access request submitted"}


@api_router.get("/seller/products")
async def seller_get_products(user_id: str):
    """Get products owned by a seller."""
    products = await db.products.find({"seller_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return products


@api_router.post("/seller/products")
async def seller_create_product(product: ProductCreate, user_id: str):
    """Seller creates a product within their approved categories."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("seller_status") != "approved":
        raise HTTPException(status_code=403, detail="Seller not approved")
    approved = [c.lower() for c in (user.get("seller_approved_categories") or [])]
    if product.category.lower() not in approved:
        raise HTTPException(status_code=403, detail=f"Not approved to sell in category: {product.category}")
    product_slug = await _generate_unique_product_slug(product.name)
    if not product.image_url:
        raise HTTPException(status_code=400, detail="Image is required for marketplace products")
    if len((product.description or "").strip()) < 50:
        raise HTTPException(status_code=400, detail="Description must be at least 50 characters")
    new_product = Product(
        name=product.name,
        slug=product_slug,
        description=product.description,
        category=product.category,
        price=product.price,
        currency=product.currency,
        image_url=product.image_url,
        stock_available=product.stock_available,
        delivery_type=product.delivery_type,
        delivery_time=product.delivery_time,
        seller_id=user_id,
        product_status="pending_review",
        subscription_duration_months=product.subscription_duration_months,
        variant_name=product.variant_name,
        parent_product_id=product.parent_product_id,
        requires_player_id=product.requires_player_id,
        player_id_label=product.player_id_label,
        requires_credentials=product.requires_credentials,
        credential_fields=product.credential_fields,
        region=product.region,
        giftcard_category=product.giftcard_category,
        giftcard_subcategory=product.giftcard_subcategory,
        is_subscription=product.is_subscription,
    )
    normalized = _normalize_product_doc(new_product.model_dump())
    new_product.seo_title = normalized.get("seo_title")
    new_product.seo_description = normalized.get("seo_description")
    doc = new_product.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/seller/products/{product_id}")
async def seller_update_product(product_id: str, updates: ProductUpdate, user_id: str):
    """Seller updates their own product."""
    product = await db.products.find_one({"id": product_id, "seller_id": user_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or not owned by you")
    if updates.category:
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        approved = [c.lower() for c in ((user or {}).get("seller_approved_categories") or [])]
        if updates.category.lower() not in approved:
            raise HTTPException(status_code=403, detail=f"Not approved for category: {updates.category}")
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data.pop("seller_id", None)
    update_data.pop("orders_count", None)
    for _seo_key in ("seo_title", "seo_description"):
        if _seo_key in update_data and not str(update_data[_seo_key] or "").strip():
            del update_data[_seo_key]
    name_changed = "name" in update_data and _compact_text(update_data["name"]) != _compact_text(product.get("name"))
    if name_changed:
        update_data["slug"] = await _generate_unique_product_slug(
            _compact_text(update_data["name"]) or "product", exclude_product_id=product_id
        )
    merged = {**product, **update_data}
    if name_changed or "seo_title" not in update_data:
        merged.pop("seo_title", None)
    if name_changed or "seo_description" not in update_data:
        merged.pop("seo_description", None)
    normalized = _normalize_product_doc(merged)
    update_data["seo_title"] = normalized.get("seo_title")
    update_data["seo_description"] = normalized.get("seo_description")
    if not product.get("slug") and not update_data.get("slug"):
        update_data["slug"] = await _generate_unique_product_slug(
            merged.get("name") or "product", exclude_product_id=product_id
        )
    if update_data:
        await db.products.update_one({"id": product_id, "seller_id": user_id}, {"$set": update_data})
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    return updated


@api_router.delete("/seller/products/{product_id}")
async def seller_delete_product(product_id: str, user_id: str):
    """Seller deletes their own product."""
    product = await db.products.find_one({"id": product_id, "seller_id": user_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or not owned by you")
    await db.products.delete_one({"id": product_id, "seller_id": user_id})
    return {"message": "Product deleted"}


@api_router.get("/seller/orders")
async def seller_get_orders(user_id: str):
    """Get orders containing seller's products or offer-based items."""
    seller_product_ids = [
        p["id"] async for p in db.products.find({"seller_id": user_id}, {"id": 1, "_id": 0})
    ]
    query = {"payment_status": "paid", "$or": []}
    if seller_product_ids:
        query["$or"].append({"items.product_id": {"$in": seller_product_ids}})
    query["$or"].append({"items.seller_id": user_id})
    if not query["$or"]:
        return []
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    seller = await db.users.find_one({"id": user_id}, {"_id": 0})
    commission_rate = float((seller or {}).get("seller_commission_rate", 10.0))
    for order in orders:
        order["seller_items"] = [
            item for item in order.get("items", [])
            if item.get("seller_id") == user_id or item.get("product_id") in seller_product_ids
        ]
        gross = sum(
            float(item.get("price", 0)) * int(item.get("quantity", 1))
            for item in order["seller_items"]
        )
        order["seller_earnings"] = round(gross * (1.0 - commission_rate / 100.0), 2)
        order["seller_earnings_gross"] = round(gross, 2)
    return orders


@api_router.get("/seller/earnings")
async def seller_get_earnings(user_id: str):
    """Get seller earnings summary including pending balance."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    commission = float(user.get("seller_commission_rate", 10.0))
    pending_balance = 0.0
    try:
        seller_product_ids = [
            p["id"] async for p in db.products.find({"seller_id": user_id}, {"id": 1, "_id": 0})
        ]
        escrow_query = {
            "payment_status": "paid",
            "escrow_status": {"$in": ["held", "buyer_confirmed"]},
            "seller_earnings_credited": {"$ne": True},
            "$or": [{"items.seller_id": user_id}],
        }
        if seller_product_ids:
            escrow_query["$or"].append({"items.product_id": {"$in": seller_product_ids}})
        async for order in db.orders.find(escrow_query, {"_id": 0, "items": 1}):
            for item in order.get("items", []):
                if item.get("seller_id") == user_id or item.get("product_id") in seller_product_ids:
                    item_total = float(item.get("price", 0)) * int(item.get("quantity", 1))
                    pending_balance += round(item_total * (1.0 - commission / 100.0), 2)
    except Exception as e:
        logging.error(f"Pending balance calc error: {e}")
    return {
        "balance": float(user.get("seller_balance", 0.0)),
        "pending_balance": round(pending_balance, 2),
        "total_earned": float(user.get("seller_total_earned", 0.0)),
        "total_orders": int(user.get("seller_total_orders", 0)),
        "commission_rate": commission,
    }


class SellerWithdrawalRequest(BaseModel):
    amount: float
    method: str  # binance_pay, usdt_bep20, usdt_trc20
    wallet_address: str


@api_router.get("/seller/withdrawal-info")
async def seller_withdrawal_info():
    """Get withdrawal methods and fee info for sellers."""
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    configured_methods = settings.get("withdrawal_methods", {})
    methods = []
    for method_id, cfg in configured_methods.items():
        if cfg.get("enabled", True):
            methods.append({
                "id": method_id,
                "label": cfg.get("label", method_id),
                "placeholder": cfg.get("placeholder", "Address"),
                "fee_percent": float(cfg.get("fee_percent", 0)),
                "fee_fixed": float(cfg.get("fee_fixed", 0)),
            })
    if not methods:
        methods = [
            {"id": "binance_pay", "label": "Binance Pay", "placeholder": "Binance Pay ID", "fee_percent": 0, "fee_fixed": 0},
            {"id": "usdt_bep20", "label": "USDT (BEP20)", "placeholder": "BEP20 wallet address", "fee_percent": 1, "fee_fixed": 0.5},
            {"id": "usdt_trc20", "label": "USDT (TRC20)", "placeholder": "TRC20 wallet address", "fee_percent": 1, "fee_fixed": 0.5},
        ]
    return {
        "methods": methods,
        "fee_percent": float(settings.get("seller_withdrawal_fee_percent", 0)),
        "fee_fixed": float(settings.get("seller_withdrawal_fee_fixed", 0)),
        "min_amount": float(settings.get("seller_withdrawal_min_amount", 5)),
    }


@api_router.post("/seller/withdraw")
async def seller_request_withdrawal(payload: SellerWithdrawalRequest, user_id: str):
    """Seller requests a withdrawal from their balance."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("seller_status") != "approved":
        raise HTTPException(status_code=403, detail="Not an approved seller")
    if not payload.wallet_address or not payload.wallet_address.strip():
        raise HTTPException(status_code=400, detail="Wallet address / Pay ID is required")
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    configured_methods = settings.get("withdrawal_methods", {})
    method_cfg = configured_methods.get(payload.method)
    if not method_cfg or not method_cfg.get("enabled", True):
        raise HTTPException(status_code=400, detail=f"Withdrawal method '{payload.method}' is not available")
    min_amount = float(settings.get("seller_withdrawal_min_amount", 5))
    fee_pct = float(method_cfg.get("fee_percent", settings.get("seller_withdrawal_fee_percent", 0)))
    fee_fixed = float(method_cfg.get("fee_fixed", settings.get("seller_withdrawal_fee_fixed", 0)))
    amount = float(payload.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if amount < min_amount:
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is ${min_amount:.2f}")
    fee = round(amount * (fee_pct / 100.0) + fee_fixed, 2)
    net_amount = round(amount - fee, 2)
    if net_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount too low after fees")
    balance = float(user.get("seller_balance", 0.0))
    if amount > balance:
        raise HTTPException(status_code=400, detail="Insufficient seller balance")
    now = datetime.now(timezone.utc).isoformat()
    withdrawal = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_email": user.get("email"),
        "store_name": user.get("seller_store_name"),
        "amount": amount,
        "fee": fee,
        "net_amount": net_amount,
        "method": payload.method,
        "wallet_address": payload.wallet_address.strip(),
        "status": "pending",
        "type": "seller_withdrawal",
        "created_at": now,
    }
    await db.withdrawals.insert_one(withdrawal)
    await db.users.update_one({"id": user_id}, {"$inc": {"seller_balance": -amount}})
    method_labels = {"binance_pay": "Binance Pay", "usdt_bep20": "USDT BEP20", "usdt_trc20": "USDT TRC20"}
    await _notify_admin_telegram("Seller withdrawal request", [
        f"Seller: {user.get('email')}",
        f"Amount: ${amount:.2f} | Fee: ${fee:.2f} | Net: ${net_amount:.2f}",
        f"Method: {method_labels.get(payload.method, payload.method)}",
        f"Address: {payload.wallet_address.strip()}",
    ])
    return {"message": "Withdrawal request submitted", "withdrawal_id": withdrawal["id"], "fee": fee, "net_amount": net_amount}


# ==================== ADMIN SELLER MANAGEMENT ====================

@api_router.get("/admin/sellers")
async def admin_list_sellers(status: Optional[str] = None):
    """List all seller applications/profiles."""
    query: Dict[str, Any] = {"seller_status": {"$ne": None}}
    if status:
        query["seller_status"] = status
    sellers = await db.users.find(query, {"_id": 0, "password": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    for seller in sellers:
        seller["product_count"] = await db.products.count_documents({"seller_id": seller["id"]})
    return sellers


@api_router.get("/admin/sellers/{user_id}")
async def admin_get_seller(user_id: str):
    """Get detailed seller info."""
    user = await db.users.find_one({"id": user_id, "seller_status": {"$ne": None}}, {"_id": 0, "password": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Seller not found")
    user["product_count"] = await db.products.count_documents({"seller_id": user_id})
    user["products"] = await db.products.find({"seller_id": user_id}, {"_id": 0}).to_list(100)
    return user


@api_router.put("/admin/sellers/{user_id}/review")
async def admin_review_seller(user_id: str, review: AdminSellerReview):
    """Admin approve or reject a seller application."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.now(timezone.utc).isoformat()
    if review.action == "approve":
        updates: Dict[str, Any] = {
            "role": "seller",
            "seller_status": "approved",
            "seller_kyc_reviewed_at": now,
            "seller_kyc_rejection_reason": None,
        }
        if review.commission_rate is not None:
            updates["seller_commission_rate"] = review.commission_rate
        await db.users.update_one({"id": user_id}, {"$set": updates})
        await _create_notification(
            user_id, "seller_approved",
            "Congratulations! Your seller application has been approved. Start selling now!",
            {}
        )
    elif review.action == "reject":
        await db.users.update_one({"id": user_id}, {"$set": {
            "seller_status": "rejected",
            "seller_kyc_reviewed_at": now,
            "seller_kyc_rejection_reason": review.reason or "Application rejected",
        }})
        await _create_notification(
            user_id, "seller_rejected",
            f"Your seller application was rejected. Reason: {review.reason or 'Not specified'}",
            {}
        )
    else:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "password_hash": 0})
    return updated


@api_router.put("/admin/sellers/{user_id}/categories")
async def admin_update_seller_categories(user_id: str, review: AdminCategoryAccessReview):
    """Admin approve or modify seller's allowed categories."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if review.action == "approve":
        existing = [c.lower() for c in (user.get("seller_approved_categories") or [])]
        merged = list(set(existing + [c.lower() for c in review.categories]))
        await db.users.update_one({"id": user_id}, {"$set": {"seller_approved_categories": merged}})
        await db.seller_category_requests.update_many(
            {"user_id": user_id, "status": "pending"},
            {"$set": {"status": "approved", "reviewed_at": datetime.now(timezone.utc).isoformat()}}
        )
        await _create_notification(
            user_id, "category_approved",
            f"Your category request has been approved: {', '.join(review.categories)}",
            {"categories": review.categories}
        )
    elif review.action == "reject":
        await db.seller_category_requests.update_many(
            {"user_id": user_id, "status": "pending"},
            {"$set": {"status": "rejected", "reviewed_at": datetime.now(timezone.utc).isoformat()}}
        )
        await _create_notification(
            user_id, "category_rejected",
            f"Your category request was rejected: {', '.join(review.categories)}",
            {"categories": review.categories}
        )
    else:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "password_hash": 0})
    return updated


@api_router.put("/admin/sellers/{user_id}/commission")
async def admin_set_seller_commission(user_id: str, rate: float):
    """Admin sets seller's commission rate."""
    if rate < 0 or rate > 100:
        raise HTTPException(status_code=400, detail="Commission rate must be 0-100")
    await db.users.update_one({"id": user_id}, {"$set": {"seller_commission_rate": rate}})
    return {"message": f"Commission rate set to {rate}%"}


@api_router.get("/admin/seller-category-requests")
async def admin_list_category_requests(status: Optional[str] = None):
    """List pending category access requests."""
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    else:
        query["status"] = "pending"
    requests = await db.seller_category_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return requests


# ==================== SELLER CATALOG (Browse admin products to sell) ====================

@api_router.get("/seller/catalog")
async def seller_browse_catalog(user_id: str, category: Optional[str] = None):
    """Seller browses admin catalog products they can create offers for."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("seller_status") != "approved":
        raise HTTPException(status_code=403, detail="Not an approved seller")
    approved_cats = [c.lower() for c in (user.get("seller_approved_categories") or [])]
    if not approved_cats:
        return []
    query: Dict[str, Any] = {
        "product_status": {"$in": ["approved", None]},
        "seller_id": {"$in": [None, ""]},
        "category": {"$in": approved_cats},
    }
    if category:
        cat_lower = category.lower()
        if cat_lower in approved_cats:
            query["category"] = cat_lower
    products = await db.products.find(query, {"_id": 0}).to_list(500)
    existing_offers = await db.seller_offers.find(
        {"seller_id": user_id, "status": "active"}, {"product_id": 1, "_id": 0}
    ).to_list(500)
    offered_ids = {o["product_id"] for o in existing_offers}
    for p in products:
        p["already_offering"] = p.get("id") in offered_ids
    return products


# ==================== SELLER PRODUCT REQUESTS ====================

class SellerProductRequest(BaseModel):
    product_name: str
    description: str
    category: str
    giftcard_category: Optional[str] = None
    giftcard_subcategory: Optional[str] = None
    suggested_price: Optional[float] = None
    notes: Optional[str] = None


class SellerOfferUpdate(BaseModel):
    price: Optional[float] = None
    delivery_type: Optional[str] = None
    stock_available: Optional[bool] = None
    custom_title: Optional[str] = None
    description: Optional[str] = None
    region: Optional[str] = None
    stock_quantity: Optional[int] = None
    notes: Optional[str] = None


@api_router.post("/seller/product-requests")
async def seller_request_product(payload: SellerProductRequest, user_id: str):
    """Seller requests a new product to be added to the catalog."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("seller_status") != "approved":
        raise HTTPException(status_code=403, detail="Not an approved seller")
    now = datetime.now(timezone.utc).isoformat()
    req = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_email": user.get("email"),
        "store_name": user.get("seller_store_name"),
        "product_name": payload.product_name.strip(),
        "description": payload.description.strip(),
        "category": payload.category,
        "giftcard_category": (payload.giftcard_category or "").strip() or None,
        "giftcard_subcategory": (payload.giftcard_subcategory or "").strip() or None,
        "suggested_price": payload.suggested_price,
        "notes": (payload.notes or "").strip() or None,
        "status": "pending",
        "created_at": now,
    }
    await db.seller_product_requests.insert_one(req)
    await _notify_admin_telegram("New product request from seller", [
        f"Seller: {user.get('email')} ({user.get('seller_store_name')})",
        f"Product: {payload.product_name}",
        f"Category: {payload.category}",
    ])
    req.pop("_id", None)
    return req


@api_router.get("/seller/product-requests")
async def seller_list_product_requests(user_id: str):
    """List seller's own product requests."""
    reqs = await db.seller_product_requests.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return reqs


@api_router.get("/admin/product-requests")
async def admin_list_product_requests(status: Optional[str] = None):
    """Admin lists all product requests."""
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    else:
        query["status"] = "pending"
    reqs = await db.seller_product_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return reqs


@api_router.put("/admin/product-requests/{request_id}")
async def admin_review_product_request(request_id: str, action: str, reason: Optional[str] = None, auto_create: bool = True):
    """Admin approves or rejects a product request. On approve, optionally auto-creates the product."""
    req = await db.seller_product_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")
    now = datetime.now(timezone.utc).isoformat()
    updates = {"status": "approved" if action == "approve" else "rejected", "reviewed_at": now}
    if reason:
        updates["rejection_reason"] = reason
    created_product_id = None
    if action == "approve" and auto_create:
        new_product = Product(
            name=req.get("product_name", ""),
            description=req.get("description", ""),
            category=req.get("category", "giftcard"),
            price=float(req.get("suggested_price") or 0),
            giftcard_category=req.get("giftcard_category"),
            giftcard_subcategory=req.get("giftcard_subcategory"),
            product_status="approved",
        )
        doc = new_product.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc = _normalize_product_doc(doc)
        await db.products.insert_one(doc)
        created_product_id = new_product.id
        updates["created_product_id"] = created_product_id
    await db.seller_product_requests.update_one({"id": request_id}, {"$set": updates})
    result = {"message": f"Product request {action}d"}
    if created_product_id:
        result["created_product_id"] = created_product_id
    return result


# ==================== SELLER OFFERS ====================

@api_router.get("/marketplace/products")
async def get_marketplace_products(category: Optional[str] = None, q: Optional[str] = None):
    """Return all seller listings for the marketplace: seller-created products + seller offers on catalog items."""
    items = []

    seller_query: Dict[str, Any] = {
        "seller_id": {"$ne": None},
        "product_status": {"$in": ["approved", None]},
    }
    if category:
        seller_query["category"] = category
    if q and q.strip():
        seller_query["$or"] = [
            {"name": {"$regex": q.strip(), "$options": "i"}},
            {"description": {"$regex": q.strip(), "$options": "i"}},
        ]
    seller_products = await db.products.find(seller_query, {"_id": 0}).to_list(500)
    seller_cache: Dict[str, dict] = {}
    for p in seller_products:
        p = _normalize_product_doc(p)
        sid = p.get("seller_id")
        if sid and sid not in seller_cache:
            seller_cache[sid] = await db.users.find_one(
                {"id": sid},
                {"_id": 0, "seller_store_name": 1, "seller_rating": 1, "seller_total_orders": 1, "seller_review_count": 1}
            ) or {}
        seller = seller_cache.get(sid, {})
        total_orders = int(seller.get("seller_total_orders", 0))
        seller_level = "top_seller" if total_orders >= 50 and float(seller.get("seller_rating", 0)) >= 4.5 else "verified" if total_orders >= 5 else "new"
        items.append({
            **p,
            "seller_name": seller.get("seller_store_name", "Unknown"),
            "seller_rating": seller.get("seller_rating"),
            "seller_total_orders": total_orders,
            "seller_level": seller_level,
            "orders_count": _normalize_orders_count_for_product(p),
            "slug": p.get("slug") or _slugify_text(p.get("name", "product")),
            "source": "seller_product",
        })

    offers = await db.seller_offers.find({"status": "active"}, {"_id": 0}).sort("price", 1).to_list(500)
    for offer in offers:
        product = await db.products.find_one({"id": offer.get("product_id")}, {"_id": 0})
        if not product:
            continue
        cat = (product.get("category") or "").lower()
        if category and cat != category.lower():
            continue
        if q and q.strip():
            ql = q.strip().lower()
            name = (offer.get("custom_title") or product.get("name") or "").lower()
            desc = (offer.get("description") or product.get("description") or "").lower()
            if ql not in name and ql not in desc:
                continue
        sid = offer.get("seller_id")
        if sid and sid not in seller_cache:
            seller_cache[sid] = await db.users.find_one(
                {"id": sid},
                {"_id": 0, "seller_store_name": 1, "seller_rating": 1, "seller_total_orders": 1}
            ) or {}
        seller = seller_cache.get(sid, {})
        total_orders = int(seller.get("seller_total_orders", 0))
        seller_level = "top_seller" if total_orders >= 50 and float(seller.get("seller_rating", 0)) >= 4.5 else "verified" if total_orders >= 5 else "new"
        items.append({
            "id": offer.get("id"),
            "offer_id": offer.get("id"),
            "product_id": offer.get("product_id"),
            "name": (offer.get("custom_title") or product.get("name") or "").strip(),
            "description": offer.get("description") or product.get("description", ""),
            "category": product.get("category", ""),
            "price": float(offer.get("price", 0)),
            "image_url": product.get("image_url"),
            "slug": product.get("slug") or product.get("id"),
            "stock_available": offer.get("stock_available", True),
            "delivery_type": offer.get("delivery_type", "manual"),
            "delivery_time": offer.get("delivery_time"),
            "seller_id": sid,
            "seller_name": seller.get("seller_store_name", "Unknown"),
            "seller_rating": seller.get("seller_rating"),
            "seller_total_orders": total_orders,
            "seller_level": seller_level,
            "orders_count": 0,
            "source": "seller_offer",
        })
    return items


@api_router.get("/marketplace/seller-offers")
async def get_marketplace_seller_offers():
    """Return all active seller offers enriched with product and seller info for the marketplace."""
    offers = await db.seller_offers.find(
        {"status": "active"}, {"_id": 0}
    ).sort("price", 1).to_list(500)
    results = []
    for offer in offers:
        product = await db.products.find_one({"id": offer.get("product_id")}, {"_id": 0})
        if not product:
            continue
        seller = await db.users.find_one(
            {"id": offer.get("seller_id")},
            {"_id": 0, "seller_store_name": 1, "seller_rating": 1}
        )
        results.append({
            "id": offer.get("id"),
            "offer_id": offer.get("id"),
            "product_id": offer.get("product_id"),
            "name": (product.get("name") or "").strip(),
            "description": product.get("description", ""),
            "category": product.get("category", ""),
            "price": float(offer.get("price", 0)),
            "image_url": product.get("image_url"),
            "slug": product.get("slug") or product.get("id"),
            "stock_available": offer.get("stock_available", True),
            "delivery_type": offer.get("delivery_type", "manual"),
            "seller_id": offer.get("seller_id"),
            "seller_name": (seller or {}).get("seller_store_name", "Unknown"),
            "seller_rating": (seller or {}).get("seller_rating"),
            "is_seller_offer": True,
        })
    return results


@api_router.get("/products/{product_id}/offers")
async def get_product_offers(product_id: str):
    """Get all seller offers for a catalog product, sorted by price."""
    resolved_id = product_id
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        product = await db.products.find_one({"slug": product_id}, {"_id": 0})
        if product:
            resolved_id = product["id"]
    offers = await db.seller_offers.find(
        {"product_id": resolved_id, "status": "active"},
        {"_id": 0}
    ).sort("price", 1).to_list(100)
    for offer in offers:
        seller = await db.users.find_one({"id": offer.get("seller_id")}, {"_id": 0, "password": 0, "password_hash": 0})
        offer["seller_name"] = (seller or {}).get("seller_store_name", "Unknown")
        offer["seller_rating"] = (seller or {}).get("seller_rating", None)
        codes_available = await db.product_codes.count_documents({"product_id": product_id, "seller_id": offer.get("seller_id"), "status": "available"})
        offer["codes_available"] = codes_available
    return offers


@api_router.post("/seller/offers")
async def seller_create_offer(payload: SellerOfferCreate, user_id: str):
    """Seller creates an offer for an existing catalog product."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("seller_status") != "approved":
        raise HTTPException(status_code=403, detail="Not an approved seller")
    product = await db.products.find_one({"id": payload.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    approved_cats = [c.lower() for c in (user.get("seller_approved_categories") or [])]
    if (product.get("category") or "").lower() not in approved_cats:
        raise HTTPException(status_code=403, detail="Not approved for this category")
    existing = await db.seller_offers.find_one({"product_id": payload.product_id, "seller_id": user_id, "status": "active"})
    if existing:
        raise HTTPException(status_code=409, detail="You already have an active offer for this product")
    now = datetime.now(timezone.utc).isoformat()
    offer = {
        "id": str(uuid.uuid4()),
        "product_id": payload.product_id,
        "seller_id": user_id,
        "seller_store_name": user.get("seller_store_name", ""),
        "price": payload.price,
        "delivery_type": payload.delivery_type,
        "stock_available": payload.stock_available,
        "custom_title": (payload.custom_title or "").strip() or None,
        "description": (payload.description or "").strip() or None,
        "region": (payload.region or "").strip() or None,
        "stock_quantity": payload.stock_quantity,
        "notes": (payload.notes or "").strip() or None,
        "status": "active",
        "created_at": now,
    }
    await db.seller_offers.insert_one(offer)
    count = await db.seller_offers.count_documents({"product_id": payload.product_id, "status": "active"})
    await db.products.update_one({"id": payload.product_id}, {"$set": {"seller_offer_count": count}})
    offer.pop("_id", None)
    return offer


@api_router.get("/seller/offers")
async def seller_list_offers(user_id: str):
    """List seller's own active offers."""
    offers = await db.seller_offers.find(
        {"seller_id": user_id, "status": {"$ne": "removed"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    for offer in offers:
        product = await db.products.find_one({"id": offer.get("product_id")}, {"_id": 0})
        offer["product_name"] = (product or {}).get("name", "Unknown")
        offer["product_image"] = (product or {}).get("image_url")
        offer["product_category"] = (product or {}).get("category")
    return offers


@api_router.put("/seller/offers/{offer_id}")
async def seller_update_offer(offer_id: str, updates: SellerOfferUpdate, user_id: str):
    """Seller updates their offer (price, delivery, stock)."""
    offer = await db.seller_offers.find_one({"id": offer_id, "seller_id": user_id, "status": "active"})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    update_data = {}
    if updates.price is not None:
        if updates.price <= 0:
            raise HTTPException(status_code=400, detail="Price must be positive")
        update_data["price"] = float(updates.price)
    if updates.delivery_type is not None:
        if updates.delivery_type not in ("automatic", "manual"):
            raise HTTPException(status_code=400, detail="delivery_type must be automatic or manual")
        update_data["delivery_type"] = updates.delivery_type
    if updates.stock_available is not None:
        update_data["stock_available"] = bool(updates.stock_available)
    if updates.custom_title is not None:
        update_data["custom_title"] = updates.custom_title.strip() or None
    if updates.description is not None:
        update_data["description"] = updates.description.strip() or None
    if updates.region is not None:
        update_data["region"] = updates.region.strip() or None
    if updates.stock_quantity is not None:
        update_data["stock_quantity"] = updates.stock_quantity
    if updates.notes is not None:
        update_data["notes"] = updates.notes.strip() or None
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    await db.seller_offers.update_one({"id": offer_id}, {"$set": update_data})
    updated = await db.seller_offers.find_one({"id": offer_id}, {"_id": 0})
    return updated


@api_router.delete("/seller/offers/{offer_id}")
async def seller_delete_offer(offer_id: str, user_id: str):
    """Seller removes their offer."""
    offer = await db.seller_offers.find_one({"id": offer_id, "seller_id": user_id})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    await db.seller_offers.update_one({"id": offer_id}, {"$set": {"status": "removed"}})
    count = await db.seller_offers.count_documents({"product_id": offer["product_id"], "status": "active"})
    await db.products.update_one({"id": offer["product_id"]}, {"$set": {"seller_offer_count": count}})
    return {"message": "Offer removed"}


# ==================== PUBLIC SELLER STORE ====================

@api_router.get("/store/{seller_id}")
async def get_seller_store(seller_id: str):
    """Public store page for an approved seller."""
    user = await db.users.find_one({"id": seller_id}, {"_id": 0, "password": 0, "password_hash": 0})
    if not user or user.get("seller_status") != "approved":
        raise HTTPException(status_code=404, detail="Store not found")
    offers = await db.seller_offers.find(
        {"seller_id": seller_id, "status": "active"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    for offer in offers:
        product = await db.products.find_one({"id": offer.get("product_id")}, {"_id": 0})
        offer["product_name"] = (product or {}).get("name", "Unknown")
        offer["product_image"] = (product or {}).get("image_url")
        offer["product_category"] = (product or {}).get("category")
        offer["product_slug"] = (product or {}).get("slug")
    seller_products = await db.products.find(
        {"seller_id": seller_id, "product_status": {"$in": ["approved", None]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    store_name = user.get("seller_store_name", "")
    for p in seller_products:
        offers.append({
            "id": p.get("id"),
            "product_id": p.get("id"),
            "product_name": p.get("name", "Unknown"),
            "product_image": p.get("image_url"),
            "product_category": p.get("category"),
            "product_slug": p.get("slug"),
            "price": p.get("price"),
            "delivery_type": p.get("delivery_type"),
            "stock_available": p.get("stock_available"),
            "seller_id": p.get("seller_id"),
            "seller_name": store_name,
            "region": p.get("region"),
            "is_own_product": True,
        })
    total_orders = int(user.get("seller_total_orders", 0))
    reviews_data = await db.reviews.find(
        {"seller_id": seller_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {
        "seller_id": seller_id,
        "store_name": store_name,
        "bio": user.get("seller_bio"),
        "rating": float(user.get("seller_rating", 0)),
        "review_count": int(user.get("seller_review_count", 0)),
        "member_since": str(user.get("created_at", ""))[:10],
        "reviews": reviews_data,
        "categories": user.get("seller_approved_categories", []),
        "total_orders": user.get("seller_total_orders", 0),
        "offers": offers,
    }


# ==================== ESCROW SYSTEM ====================

@api_router.post("/orders/{order_id}/escrow")
async def escrow_action(order_id: str, payload: EscrowConfirmRequest, user_id: str):
    """Customer confirms delivery or opens dispute."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not your order")
    if order.get("escrow_status") not in ("held", None):
        if order.get("escrow_status") == "held":
            pass
        else:
            raise HTTPException(status_code=400, detail=f"Escrow already in state: {order.get('escrow_status')}")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    if payload.action == "confirm":
        release_at = now + timedelta(days=3)
        await db.orders.update_one({"id": order_id}, {"$set": {
            "escrow_status": "buyer_confirmed",
            "escrow_confirmed_at": now_iso,
            "escrow_release_at": release_at.isoformat(),
            "updated_at": now_iso,
        }})
        return {"message": "Delivery confirmed. Seller payment will be released in 3 days.", "release_at": release_at.isoformat()}

    elif payload.action == "dispute":
        reason = (payload.reason or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Dispute reason required")
        deadline = (now + timedelta(hours=24)).isoformat()
        dispute = {
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "buyer_id": order.get("user_id"),
            "buyer_email": order.get("user_email"),
            "seller_id": None,
            "seller_email": None,
            "reason": reason,
            "status": "open",
            "messages": [{
                "id": str(uuid.uuid4()),
                "sender_id": user_id,
                "sender_role": "buyer",
                "content": reason,
                "created_at": now_iso,
            }],
            "resolution": None,
            "waiting_for": "seller",
            "response_deadline": deadline,
            "last_message_by": "buyer",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        for item in order.get("items", []):
            if item.get("seller_id"):
                dispute["seller_id"] = item["seller_id"]
                seller = await db.users.find_one({"id": item["seller_id"]}, {"_id": 0})
                dispute["seller_email"] = (seller or {}).get("email")
                break

        await db.disputes.insert_one(dispute)
        await db.orders.update_one({"id": order_id}, {"$set": {
            "escrow_status": "disputed",
            "dispute_id": dispute["id"],
            "updated_at": now_iso,
        }})
        await _notify_admin_telegram("Dispute opened", [
            f"Order: {order_id[:8]}",
            f"Buyer: {order.get('user_email')}",
            f"Reason: {reason[:100]}",
        ])
        try:
            await _create_notification(user_id, "dispute_opened",
                f"Your dispute on order #{order_id[:8]} has been opened. We'll review it shortly.",
                {"order_id": order_id, "dispute_id": dispute["id"]})
            if dispute.get("seller_id"):
                await _create_notification(dispute["seller_id"], "dispute_opened",
                    f"A buyer opened a dispute on order #{order_id[:8]}. Please respond in the Dispute Center.",
                    {"order_id": order_id, "dispute_id": dispute["id"]})
        except Exception:
            pass
        return {"message": "Dispute opened", "dispute_id": dispute["id"]}
    else:
        raise HTTPException(status_code=400, detail="Action must be 'confirm' or 'dispute'")


async def _release_due_escrows():
    """Background: release escrow payments that have passed the 3-day hold.

    Two cases:
    1. Buyer confirmed → release after escrow_release_at (3 days post-confirm)
    2. Buyer never responded → auto-release 3 days after escrow was held
    """
    now = datetime.now(timezone.utc)
    auto_release_cutoff = (now - timedelta(days=3)).isoformat()

    cursor = db.orders.find({
        "$or": [
            {"escrow_status": "buyer_confirmed", "escrow_release_at": {"$lte": now.isoformat()}},
            {"escrow_status": "held", "escrow_held_at": {"$lte": auto_release_cutoff}},
        ]
    }, {"_id": 0})
    async for order in cursor:
        order_id = order.get("id")
        prev_status = order.get("escrow_status")
        await db.orders.update_one({"id": order_id}, {"$set": {
            "escrow_status": "released",
            "escrow_released_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }})
        await _credit_seller_earnings(order_id)
        logging.info("Escrow released for order %s (was %s)", order_id, prev_status)


async def _auto_close_expired_disputes():
    """Auto-close disputes where a party exceeded the 24h response deadline."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    cursor = db.disputes.find({
        "status": {"$in": ["open", "in_review"]},
        "response_deadline": {"$lte": now_iso},
        "waiting_for": {"$in": ["buyer", "seller"]},
    }, {"_id": 0})
    async for dispute in cursor:
        waiting_for = dispute.get("waiting_for")
        order_id = dispute.get("order_id")
        if waiting_for == "seller":
            resolution = "buyer_wins"
            reason = "Seller did not respond within 24 hours"
        else:
            resolution = "seller_wins"
            reason = "Buyer did not respond within 24 hours"

        if resolution == "buyer_wins":
            await db.orders.update_one({"id": order_id}, {"$set": {"escrow_status": "refunded", "updated_at": now_iso}})
            order = await db.orders.find_one({"id": order_id}, {"_id": 0})
            if order:
                refund_amount = float(order.get("total_amount", 0))
                await db.users.update_one({"id": order["user_id"]}, {"$inc": {"wallet_balance": refund_amount}})
        else:
            await db.orders.update_one({"id": order_id}, {"$set": {"escrow_status": "released", "escrow_released_at": now_iso, "updated_at": now_iso}})
            await _credit_seller_earnings(order_id)

        await db.disputes.update_one({"id": dispute["id"]}, {"$set": {
            "status": f"resolved_{resolution}",
            "resolution": resolution,
            "resolution_reason": reason,
            "resolved_at": now_iso,
            "updated_at": now_iso,
            "waiting_for": None,
            "response_deadline": None,
            "auto_resolved": True,
        }})
        try:
            buyer_id = dispute.get("buyer_id")
            seller_id = dispute.get("seller_id")
            if buyer_id:
                await _create_notification(buyer_id, "dispute_resolved",
                    f"Dispute on order #{order_id[:8]} auto-resolved: {reason}",
                    {"order_id": order_id, "dispute_id": dispute["id"]})
            if seller_id:
                await _create_notification(seller_id, "dispute_resolved",
                    f"Dispute on order #{order_id[:8]} auto-resolved: {reason}",
                    {"order_id": order_id, "dispute_id": dispute["id"]})
        except Exception:
            pass
        logging.info("Dispute %s auto-resolved: %s", dispute["id"][:8], resolution)


async def _dispute_deadline_worker():
    """Periodically check for expired dispute deadlines."""
    while True:
        try:
            await _auto_close_expired_disputes()
        except Exception as e:
            logging.error(f"Dispute deadline worker error: {e}")
        await asyncio.sleep(300)


# ==================== DISPUTE CENTER ====================

@api_router.get("/disputes")
async def get_disputes(user_id: Optional[str] = None, role: Optional[str] = None, status: Optional[str] = None):
    """Get disputes. For buyer, seller, or admin."""
    query: Dict[str, Any] = {}
    if user_id and role == "buyer":
        query["buyer_id"] = user_id
    elif user_id and role == "seller":
        query["seller_id"] = user_id
    if status:
        query["status"] = status
    disputes = await db.disputes.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return disputes


@api_router.get("/disputes/{dispute_id}")
async def get_dispute(dispute_id: str):
    """Get dispute details."""
    dispute = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    order = await db.orders.find_one({"id": dispute.get("order_id")}, {"_id": 0})
    dispute["order"] = order
    return dispute


@api_router.post("/disputes/{dispute_id}/message")
async def add_dispute_message(dispute_id: str, payload: DisputeMessageCreate, user_id: str):
    """Add a message to a dispute (buyer, seller, or admin)."""
    dispute = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if dispute.get("status") not in ("open", "in_review"):
        raise HTTPException(status_code=400, detail="Dispute is closed")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    sender_role = "admin" if (user or {}).get("role") == "admin" else ("seller" if user_id == dispute.get("seller_id") else "buyer")
    now_iso = datetime.now(timezone.utc).isoformat()
    message = {
        "id": str(uuid.uuid4()),
        "sender_id": user_id,
        "sender_role": sender_role,
        "sender_name": (user or {}).get("full_name", "User"),
        "content": payload.content.strip(),
        "evidence_url": payload.evidence_url if payload.evidence_url else None,
        "created_at": now_iso,
    }
    waiting_for = "seller" if sender_role == "buyer" else "buyer" if sender_role == "seller" else dispute.get("waiting_for")
    deadline = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat() if sender_role in ("buyer", "seller") else dispute.get("response_deadline")
    await db.disputes.update_one({"id": dispute_id}, {
        "$push": {"messages": message},
        "$set": {
            "updated_at": now_iso,
            "status": "in_review",
            "waiting_for": waiting_for,
            "response_deadline": deadline,
            "last_message_by": sender_role,
        },
    })
    try:
        order_id = dispute.get("order_id", "")
        sender_name = (user or {}).get("full_name", "User")
        if sender_role != "buyer" and dispute.get("buyer_id"):
            await _create_notification(dispute["buyer_id"], "dispute_message",
                f"New message in dispute for order #{order_id[:8]} from {sender_name}",
                {"order_id": order_id, "dispute_id": dispute_id})
        if sender_role != "seller" and dispute.get("seller_id"):
            await _create_notification(dispute["seller_id"], "dispute_message",
                f"New message in dispute for order #{order_id[:8]} from {sender_name}",
                {"order_id": order_id, "dispute_id": dispute_id})
    except Exception:
        pass
    return message


@api_router.post("/disputes/{dispute_id}/seller-accept")
async def seller_accept_dispute(dispute_id: str, user_id: str):
    """Seller accepts the dispute and agrees to refund the buyer (no admin needed)."""
    dispute = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if dispute.get("seller_id") != user_id:
        raise HTTPException(status_code=403, detail="Not your dispute")
    if dispute.get("status") not in ("open", "in_review"):
        raise HTTPException(status_code=400, detail="Dispute already resolved")
    now_iso = datetime.now(timezone.utc).isoformat()
    order_id = dispute.get("order_id")
    await db.orders.update_one({"id": order_id}, {"$set": {
        "escrow_status": "refunded", "updated_at": now_iso,
    }})
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if order:
        refund_amount = float(order.get("total_amount", 0))
        await db.users.update_one({"id": order["user_id"]}, {"$inc": {"wallet_balance": refund_amount}})
    await db.disputes.update_one({"id": dispute_id}, {"$set": {
        "status": "resolved_buyer_wins", "resolution": "buyer_wins",
        "resolution_reason": "Seller accepted refund", "resolved_at": now_iso,
        "updated_at": now_iso, "waiting_for": None, "response_deadline": None,
    }})
    buyer_id = dispute.get("buyer_id")
    if buyer_id:
        await _create_notification(buyer_id, "dispute_resolved",
            f"Seller accepted your dispute on order #{order_id[:8]}. Refund issued to your wallet.",
            {"order_id": order_id, "dispute_id": dispute_id})
    await _create_notification(user_id, "dispute_resolved",
        f"You accepted the dispute on order #{order_id[:8]}. Buyer has been refunded.",
        {"order_id": order_id, "dispute_id": dispute_id})
    return {"message": "Dispute resolved — buyer refunded"}


@api_router.post("/disputes/{dispute_id}/buyer-cancel")
async def buyer_cancel_dispute(dispute_id: str, user_id: str):
    """Buyer cancels the dispute (issue resolved with seller directly)."""
    dispute = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if dispute.get("buyer_id") != user_id:
        raise HTTPException(status_code=403, detail="Not your dispute")
    if dispute.get("status") not in ("open", "in_review"):
        raise HTTPException(status_code=400, detail="Dispute already resolved")
    now_iso = datetime.now(timezone.utc).isoformat()
    order_id = dispute.get("order_id")
    release_at = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    await db.orders.update_one({"id": order_id}, {"$set": {
        "escrow_status": "buyer_confirmed", "escrow_confirmed_at": now_iso,
        "escrow_release_at": release_at, "updated_at": now_iso,
    }})
    await db.disputes.update_one({"id": dispute_id}, {"$set": {
        "status": "resolved_seller_wins", "resolution": "seller_wins",
        "resolution_reason": "Buyer cancelled dispute — resolved with seller",
        "resolved_at": now_iso, "updated_at": now_iso, "waiting_for": None, "response_deadline": None,
    }})
    seller_id = dispute.get("seller_id")
    if seller_id:
        await _create_notification(seller_id, "dispute_resolved",
            f"Buyer cancelled the dispute on order #{order_id[:8]}. Payment will release in 3 days.",
            {"order_id": order_id, "dispute_id": dispute_id})
    await _create_notification(user_id, "dispute_resolved",
        f"You cancelled the dispute on order #{order_id[:8]}. Seller payment releasing in 3 days.",
        {"order_id": order_id, "dispute_id": dispute_id})
    return {"message": "Dispute cancelled — seller payment releasing in 3 days"}


@api_router.post("/disputes/{dispute_id}/escalate")
async def escalate_dispute(dispute_id: str, user_id: str):
    """Either party escalates the dispute to admin review."""
    dispute = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if user_id not in (dispute.get("buyer_id"), dispute.get("seller_id")):
        raise HTTPException(status_code=403, detail="Not your dispute")
    if dispute.get("status") not in ("open", "in_review"):
        raise HTTPException(status_code=400, detail="Dispute already resolved")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.disputes.update_one({"id": dispute_id}, {"$set": {
        "status": "escalated", "waiting_for": "admin",
        "escalated_at": now_iso, "updated_at": now_iso,
    }})
    await _notify_admin_telegram("Dispute escalated to admin", [
        f"Dispute: {dispute_id[:8]}",
        f"Order: {dispute.get('order_id', '')[:8]}",
        f"Escalated by: {'buyer' if user_id == dispute.get('buyer_id') else 'seller'}",
    ])
    buyer_id = dispute.get("buyer_id")
    seller_id = dispute.get("seller_id")
    if buyer_id:
        await _create_notification(buyer_id, "dispute_escalated",
            f"Dispute on order #{dispute.get('order_id', '')[:8]} escalated to admin. Resolution may take up to 3 days.",
            {"dispute_id": dispute_id})
    if seller_id:
        await _create_notification(seller_id, "dispute_escalated",
            f"Dispute on order #{dispute.get('order_id', '')[:8]} escalated to admin. Resolution may take up to 3 days.",
            {"dispute_id": dispute_id})
    return {"message": "Dispute escalated to admin review. Resolution may take up to 3 days."}


@api_router.put("/disputes/{dispute_id}/resolve")
async def admin_resolve_dispute(dispute_id: str, payload: AdminDisputeResolve):
    """Admin resolves a dispute."""
    dispute = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    order_id = dispute.get("order_id")

    if payload.resolution == "buyer_wins":
        await db.orders.update_one({"id": order_id}, {"$set": {
            "escrow_status": "refunded",
            "updated_at": now_iso,
        }})
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order:
            refund_amount = float(order.get("total_amount", 0))
            await db.users.update_one({"id": order["user_id"]}, {"$inc": {"wallet_balance": refund_amount}})

    elif payload.resolution == "seller_wins":
        await db.orders.update_one({"id": order_id}, {"$set": {
            "escrow_status": "released",
            "escrow_released_at": now_iso,
            "updated_at": now_iso,
        }})
        await _credit_seller_earnings(order_id)
    else:
        raise HTTPException(status_code=400, detail="Resolution must be 'buyer_wins' or 'seller_wins'")

    resolve_update = {
        "status": f"resolved_{payload.resolution}",
        "resolution": payload.resolution,
        "resolution_reason": payload.reason,
        "resolution_evidence_url": payload.evidence_url if payload.evidence_url else None,
        "resolved_at": now_iso,
        "updated_at": now_iso,
        "waiting_for": None,
        "response_deadline": None,
    }
    await db.disputes.update_one({"id": dispute_id}, {"$set": resolve_update})
    try:
        buyer_id = dispute.get("buyer_id")
        seller_id = dispute.get("seller_id")
        winner = "buyer" if payload.resolution == "buyer_wins" else "seller"
        if buyer_id:
            await _create_notification(buyer_id, "dispute_resolved",
                f"Dispute on order #{order_id[:8]} resolved: {'You won — refund issued' if winner == 'buyer' else 'Seller wins — payment released'}",
                {"order_id": order_id, "dispute_id": dispute_id})
        if seller_id:
            await _create_notification(seller_id, "dispute_resolved",
                f"Dispute on order #{order_id[:8]} resolved: {'Buyer wins — refund issued' if winner == 'buyer' else 'You won — payment released'}",
                {"order_id": order_id, "dispute_id": dispute_id})
    except Exception as e:
        logging.error(f"Dispute resolution notification error: {e}")
    return {"message": f"Dispute resolved: {payload.resolution}"}


# ==================== DIRECT MESSAGING ====================

@api_router.post("/messages")
async def send_message(payload: MessageCreate, user_id: str):
    """Send a direct message to another user (linked to an order)."""
    order = await db.orders.find_one({"id": payload.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    sender = await db.users.find_one({"id": user_id}, {"_id": 0})
    msg = {
        "id": str(uuid.uuid4()),
        "order_id": payload.order_id,
        "sender_id": user_id,
        "sender_name": (sender or {}).get("full_name", "User"),
        "sender_role": (sender or {}).get("role", "customer"),
        "receiver_id": payload.receiver_id,
        "content": payload.content.strip(),
        "read": False,
        "created_at": now_iso,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    try:
        sender_name = (sender or {}).get("full_name", "Someone")
        await _create_notification(
            payload.receiver_id, "new_message",
            f"New message from {sender_name} on order #{payload.order_id[:8]}",
            {"order_id": payload.order_id, "sender_id": user_id}
        )
    except Exception as e:
        logging.error(f"Message notification error: {e}")
    try:
        receiver = await db.users.find_one({"id": payload.receiver_id}, {"_id": 0})
        receiver_email = (receiver or {}).get("email")
        if receiver_email:
            settings_doc = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
            sender_name = (sender or {}).get("full_name", "A user")
            html = (
                f"<div style='font-family:Arial,sans-serif'>"
                f"<h2>New message on your order</h2>"
                f"<p><b>From:</b> {sender_name}</p>"
                f"<p><b>Order:</b> #{payload.order_id[:8]}</p>"
                f"<p style='background:#f3f4f6;padding:12px;border-radius:8px;margin:12px 0'>{payload.content.strip()}</p>"
                f"<p>Log in to reply.</p>"
                f"</div>"
            )
            _send_resend_email(settings_doc, receiver_email, f"New message from {sender_name}", html)
    except Exception as e:
        logging.error(f"Message email notification error: {e}")
    return msg


@api_router.get("/messages")
async def get_messages(user_id: str, order_id: Optional[str] = None):
    """Get messages for a user, optionally filtered by order."""
    query = {"$or": [{"sender_id": user_id}, {"receiver_id": user_id}]}
    if order_id:
        query["order_id"] = order_id
    messages = await db.messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(500)
    return messages


@api_router.put("/messages/{message_id}/read")
async def mark_message_read(message_id: str, user_id: str):
    """Mark a message as read."""
    await db.messages.update_one({"id": message_id, "receiver_id": user_id}, {"$set": {"read": True}})
    return {"message": "Marked as read"}


@api_router.get("/messages/unread-count")
async def get_unread_count(user_id: str):
    """Get count of unread messages."""
    count = await db.messages.count_documents({"receiver_id": user_id, "read": False})
    return {"unread": count}


@api_router.post("/messages/inquiry")
async def send_inquiry(payload: PrePurchaseInquiry, user_id: str):
    """Send a pre-purchase inquiry to a seller (no order required)."""
    sender = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not sender:
        raise HTTPException(status_code=404, detail="User not found")
    seller = await db.users.find_one({"id": payload.seller_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    inquiry_id = f"inquiry-{str(uuid.uuid4())[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    msg = {
        "id": str(uuid.uuid4()),
        "order_id": inquiry_id,
        "sender_id": user_id,
        "sender_name": sender.get("full_name", "User"),
        "sender_role": "customer",
        "receiver_id": payload.seller_id,
        "content": payload.content.strip(),
        "read": False,
        "created_at": now_iso,
        "is_inquiry": True,
        "product_id": payload.product_id,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    try:
        await _create_notification(
            payload.seller_id, "new_message",
            f"New inquiry from {sender.get('full_name', 'Buyer')}",
            {"sender_id": user_id}
        )
    except Exception:
        pass
    return msg


# ==================== PRODUCT APPROVAL ====================

@api_router.put("/admin/products/{product_id}/approve")
async def admin_approve_product(product_id: str, action: str = "approve"):
    """Admin approves or rejects a seller product."""
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    new_status = "approved" if action == "approve" else "rejected"
    await db.products.update_one({"id": product_id}, {"$set": {"product_status": new_status}})
    return {"message": f"Product {new_status}"}


@api_router.put("/admin/products/approve-all-seller")
async def admin_approve_all_seller_products():
    """Bulk-approve all non-approved seller products regardless of current status."""
    result = await db.products.update_many(
        {"seller_id": {"$ne": None}, "product_status": {"$ne": "approved"}},
        {"$set": {"product_status": "approved"}},
    )
    also = await db.products.update_many(
        {"seller_id": {"$ne": None}, "product_status": {"$exists": False}},
        {"$set": {"product_status": "approved"}},
    )
    total = result.modified_count + also.modified_count
    return {"message": f"Approved {total} seller product(s)"}


@api_router.get("/admin/products/pending")
async def admin_get_pending_products():
    """Get products awaiting approval."""
    products = await db.products.find({"product_status": "pending_review"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for p in products:
        if p.get("seller_id"):
            seller = await db.users.find_one({"id": p["seller_id"]}, {"seller_store_name": 1, "email": 1, "_id": 0})
            p["seller_store_name"] = (seller or {}).get("seller_store_name")
            p["seller_email"] = (seller or {}).get("email")
    return products


# ==================== IN-APP NOTIFICATIONS ====================

async def _create_notification(user_id: str, ntype: str, message: str, data: Optional[Dict] = None):
    """Create an in-app notification for a user."""
    now = datetime.now(timezone.utc).isoformat()
    notif = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": ntype,
        "message": message,
        "data": data or {},
        "read": False,
        "created_at": now,
    }
    await db.notifications.insert_one(notif)
    return notif


@api_router.get("/notifications")
async def get_notifications(user_id: str, limit: int = 50, offset: int = 0):
    """Get user notifications."""
    notifs = await db.notifications.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": user_id, "read": False})
    return {"notifications": notifs, "unread_count": unread}


@api_router.get("/notifications/unread-count")
async def get_unread_notification_count(user_id: str):
    """Get unread notification count."""
    count = await db.notifications.count_documents({"user_id": user_id, "read": False})
    return {"unread_count": count}


@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user_id: str):
    """Mark all notifications as read."""
    await db.notifications.update_many(
        {"user_id": user_id, "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}


@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user_id: str):
    """Mark a single notification as read."""
    await db.notifications.update_one(
        {"id": notification_id, "user_id": user_id},
        {"$set": {"read": True}}
    )
    return {"message": "Notification marked as read"}


# ==================== SELLER MANUAL DELIVERY ====================

class SellerDeliverySubmit(BaseModel):
    delivery_codes: List[str]
    delivery_note: Optional[str] = None


@api_router.post("/seller/orders/{order_id}/deliver")
async def seller_deliver_order(order_id: str, payload: SellerDeliverySubmit, user_id: str):
    """Seller submits delivery codes for a manual delivery order."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    seller_items = [
        item for item in order.get("items", [])
        if item.get("seller_id") == user_id
    ]
    if not seller_items:
        seller_product_ids = [
            p["id"] async for p in db.products.find({"seller_id": user_id}, {"id": 1, "_id": 0})
        ]
        seller_items = [
            item for item in order.get("items", [])
            if item.get("product_id") in seller_product_ids
        ]
    if not seller_items:
        raise HTTPException(status_code=403, detail="You have no items in this order")
    if not payload.delivery_codes:
        raise HTTPException(status_code=400, detail="At least one delivery code is required")
    now = datetime.now(timezone.utc).isoformat()
    delivery_record = {
        "seller_id": user_id,
        "codes": payload.delivery_codes,
        "note": payload.delivery_note,
        "delivered_at": now,
    }
    codes_text = "\n".join(payload.delivery_codes)
    seller_items_info = []
    for si in seller_items:
        seller_items_info.append({
            "product_id": si.get("product_id", ""),
            "product_name": si.get("product_name", "Item"),
            "quantity": si.get("quantity", 1),
            "details": codes_text,
        })
    details_parts = []
    for si in seller_items_info:
        details_parts.append(f"{si['product_name']}:\n{si['details']}")
    delivery_info_update = {
        "details": "\n\n".join(details_parts),
        "items": seller_items_info,
        "delivered_at": now,
        "seller_delivered": True,
    }
    if payload.delivery_note:
        delivery_info_update["details"] += f"\n\nNote: {payload.delivery_note}"
    await db.orders.update_one({"id": order_id}, {
        "$push": {"seller_deliveries": delivery_record},
        "$set": {
            "order_status": "completed",
            "delivery_info": delivery_info_update,
            "updated_at": now,
        }
    })
    buyer_id = order.get("user_id")
    if buyer_id:
        await _create_notification(
            buyer_id, "order_delivered",
            f"Your order #{order_id[:8]} has been delivered by the seller!",
            {"order_id": order_id}
        )
    try:
        settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
        user_email = order.get("user_email")
        if user_email:
            codes_html = "".join(
                f"<li><b>{si['product_name']}:</b><pre style='background:#111827;color:#D1D5DB;padding:8px;border-radius:6px;white-space:pre-wrap;margin:6px 0'>{si['details']}</pre></li>"
                for si in seller_items_info
            )
            html = (
                f"<div style='font-family:Arial,sans-serif'>"
                f"<h2>Your order has been delivered!</h2>"
                f"<p><b>Order:</b> #{order_id[:8]}</p>"
                f"<p><b>Your codes / credentials:</b></p><ul>{codes_html}</ul>"
                f"{'<p><b>Note:</b> ' + payload.delivery_note + '</p>' if payload.delivery_note else ''}"
                f"<p>Thank you for your purchase!</p>"
                f"</div>"
            )
            _send_resend_email(settings, user_email, "Your order has been delivered!", html)
    except Exception as e:
        logging.error(f"Seller delivery email error: {e}")
    return {"message": "Delivery submitted successfully"}


# ==================== SELLER RATINGS & REVIEWS ====================

class SellerReviewCreate(BaseModel):
    order_id: str
    seller_id: str
    rating: int
    comment: Optional[str] = None


@api_router.post("/reviews")
async def create_review(payload: SellerReviewCreate, user_id: str):
    """Buyer submits a review for a seller after an order."""
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    order = await db.orders.find_one({"id": payload.order_id, "user_id": user_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Order must be paid before reviewing")
    existing = await db.reviews.find_one({"order_id": payload.order_id, "reviewer_id": user_id, "seller_id": payload.seller_id})
    if existing:
        raise HTTPException(status_code=409, detail="You already reviewed this seller for this order")
    seller = await db.users.find_one({"id": payload.seller_id}, {"_id": 0})
    if not seller or seller.get("seller_status") != "approved":
        raise HTTPException(status_code=404, detail="Seller not found")
    reviewer = await db.users.find_one({"id": user_id}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    review = {
        "id": str(uuid.uuid4()),
        "order_id": payload.order_id,
        "seller_id": payload.seller_id,
        "reviewer_id": user_id,
        "reviewer_name": (reviewer or {}).get("full_name", "Customer"),
        "rating": payload.rating,
        "comment": (payload.comment or "").strip() or None,
        "created_at": now,
    }
    await db.reviews.insert_one(review)
    all_reviews = await db.reviews.find({"seller_id": payload.seller_id}, {"rating": 1, "_id": 0}).to_list(10000)
    avg = round(sum(r["rating"] for r in all_reviews) / len(all_reviews), 1) if all_reviews else 0
    await db.users.update_one({"id": payload.seller_id}, {"$set": {
        "seller_rating": avg,
        "seller_review_count": len(all_reviews),
    }})
    await _create_notification(
        payload.seller_id, "new_review",
        f"You received a {payload.rating}-star review!",
        {"order_id": payload.order_id, "rating": payload.rating}
    )
    review.pop("_id", None)
    return review


@api_router.get("/reviews/seller/{seller_id}")
async def get_seller_reviews(seller_id: str, limit: int = 50, offset: int = 0):
    """Get reviews for a seller."""
    reviews = await db.reviews.find(
        {"seller_id": seller_id}, {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    total = await db.reviews.count_documents({"seller_id": seller_id})
    return {"reviews": reviews, "total": total}


@api_router.get("/seller/analytics")
async def seller_analytics(user_id: str):
    """Get seller analytics data."""
    seller = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not seller or seller.get("seller_status") != "approved":
        raise HTTPException(status_code=403, detail="Not an approved seller")
    seller_product_ids = [
        p["id"] async for p in db.products.find({"seller_id": user_id}, {"id": 1, "_id": 0})
    ]
    orders = await db.orders.find(
        {"payment_status": "paid", "$or": [
            {"items.seller_id": user_id},
            {"items.product_id": {"$in": seller_product_ids}} if seller_product_ids else {"_never": True},
        ]},
        {"_id": 0, "items": 1, "created_at": 1, "total_amount": 1}
    ).sort("created_at", -1).to_list(1000)
    commission_rate = float(seller.get("seller_commission_rate", 10.0))
    daily_sales: Dict[str, float] = {}
    product_sales: Dict[str, Dict[str, Any]] = {}
    for order in orders:
        created = str(order.get("created_at", ""))[:10]
        for item in order.get("items", []):
            if item.get("seller_id") == user_id or item.get("product_id") in seller_product_ids:
                revenue = float(item.get("price", 0)) * int(item.get("quantity", 1))
                net = round(revenue * (1.0 - commission_rate / 100.0), 2)
                daily_sales[created] = daily_sales.get(created, 0) + net
                pid = item.get("product_id", "unknown")
                pname = item.get("product_name", "Unknown")
                if pid not in product_sales:
                    product_sales[pid] = {"name": pname, "units": 0, "revenue": 0}
                product_sales[pid]["units"] += int(item.get("quantity", 1))
                product_sales[pid]["revenue"] += net
    top_products = sorted(product_sales.values(), key=lambda x: x["revenue"], reverse=True)[:10]
    recent_days = sorted(daily_sales.items(), key=lambda x: x[0])[-30:]
    offer_count = await db.seller_offers.count_documents({"seller_id": user_id, "status": "active"})
    product_count = await db.products.count_documents({"seller_id": user_id})
    review_count = await db.reviews.count_documents({"seller_id": user_id})
    avg_rating = float(seller.get("seller_rating", 0))
    withdrawals = await db.withdrawals.find(
        {"user_id": user_id, "type": "seller_withdrawal"}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    return {
        "daily_sales": [{"date": d, "revenue": v} for d, v in recent_days],
        "top_products": top_products,
        "total_orders": len(orders),
        "offer_count": offer_count,
        "product_count": product_count,
        "review_count": review_count,
        "avg_rating": avg_rating,
        "recent_withdrawals": withdrawals,
    }


# ==================== SELLER EARNINGS CREDITING ====================

async def _credit_seller_earnings(order_id: str):
    """Credit sellers for their items. Handles both seller-owned products and offer-based sales."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("payment_status") != "paid":
        return
    if order.get("seller_earnings_credited"):
        return
    if order.get("escrow_status") and order.get("escrow_status") not in ("released", "buyer_confirmed"):
        return
    for item in order.get("items", []):
        seller_id = item.get("seller_id")
        if not seller_id:
            product = await db.products.find_one({"id": item.get("product_id")}, {"_id": 0})
            seller_id = (product or {}).get("seller_id")
        if not seller_id:
            continue
        seller = await db.users.find_one({"id": seller_id}, {"_id": 0})
        if not seller or seller.get("seller_status") != "approved":
            continue
        commission_rate = float(seller.get("seller_commission_rate", 10.0))
        item_total = float(item.get("price", 0)) * int(item.get("quantity", 1))
        seller_share = round(item_total * (1.0 - commission_rate / 100.0), 2)
        await db.users.update_one({"id": seller_id}, {"$inc": {
            "seller_balance": seller_share,
            "seller_total_earned": seller_share,
            "seller_total_orders": 1,
        }})
        await _create_notification(
            seller_id, "new_sale",
            f"New sale: {item.get('product_name', 'Product')} x{item.get('quantity', 1)} — you earned ${seller_share:.2f}",
            {"order_id": order_id, "product_name": item.get("product_name")}
        )
    await db.orders.update_one({"id": order_id}, {"$set": {"seller_earnings_credited": True}})


# ==================== SETTINGS ENDPOINTS ====================

@api_router.get("/settings", response_model=SiteSettings)
async def get_settings():
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0})
    if not settings:
        # Create default settings
        default_settings = SiteSettings()
        doc = default_settings.model_dump()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.settings.insert_one(doc)
        return default_settings
    
    if isinstance(settings.get('updated_at'), str):
        settings['updated_at'] = datetime.fromisoformat(settings['updated_at'])

    crypto_config = await db.crypto_config.find_one({"id": "crypto_config"}, {"_id": 0})
    settings = _apply_crypto_config_to_settings(settings, crypto_config)

    # Never expose secret keys to clients
    for secret_field in [
        "plisio_api_key",
        "binance_pay_api_key",
        "binance_pay_secret_key",
        "mtcgame_api_key",
        "gosplit_api_key",
        "z2u_api_key",
        "resend_api_key",
        "telegram_bot_token",
    ]:
        if secret_field in settings:
            settings[secret_field] = None
    return settings

@api_router.put("/settings", response_model=SiteSettings)
async def update_settings(updates: SettingsUpdate):
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    for key in ("telegram_bot_token", "telegram_admin_chat_id"):
        if key in update_data and isinstance(update_data[key], str):
            cleaned = update_data[key].strip()
            if cleaned:
                update_data[key] = cleaned
            else:
                update_data.pop(key, None)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.settings.update_one(
        {"id": "site_settings"},
        {"$set": update_data},
        upsert=True
    )

    crypto_settings = update_data.get("crypto_settings")
    if isinstance(crypto_settings, dict):
        config_updates: Dict[str, Any] = {}
        buy_rate = _optional_float(crypto_settings.get("buy_rate_usdt"))
        if buy_rate is not None:
            config_updates["buy_rate_bep20"] = buy_rate
            config_updates["buy_rate_trc20"] = buy_rate
            config_updates["buy_rate_matic"] = buy_rate
            config_updates["buy_rate_usdt"] = buy_rate
        sell_rate = _optional_float(crypto_settings.get("sell_rate_usdt"))
        if sell_rate is not None:
            config_updates["sell_rate_bep20"] = sell_rate
            config_updates["sell_rate_trc20"] = sell_rate
            config_updates["sell_rate_matic"] = sell_rate
            config_updates["sell_rate_usdt"] = sell_rate
        fee_percent = _optional_float(crypto_settings.get("transaction_fee_percent"))
        if fee_percent is not None:
            config_updates["buy_fee_percent"] = fee_percent
            config_updates["sell_fee_percent"] = fee_percent
            config_updates["transaction_fee_percent"] = fee_percent
        min_usd = _optional_float(crypto_settings.get("min_transaction_usd"))
        if min_usd is not None:
            config_updates["min_buy_usd"] = min_usd
            config_updates["min_transaction_usd"] = min_usd
        if config_updates:
            config_updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.crypto_config.update_one(
                {"id": "crypto_config"},
                {"$set": config_updates},
                upsert=True
            )
    
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0})
    if isinstance(settings.get('updated_at'), str):
        settings['updated_at'] = datetime.fromisoformat(settings['updated_at'])
    crypto_config = await db.crypto_config.find_one({"id": "crypto_config"}, {"_id": 0})
    settings = _apply_crypto_config_to_settings(settings, crypto_config)
    await _notify_admin_telegram(
        "Site settings updated",
        [
            f"Updated fields: {', '.join(sorted(update_data.keys()))}",
        ],
        settings_override=settings,
    )
    return settings


@api_router.post("/settings/telegram/test")
async def test_telegram_notification(payload: TelegramTestRequest):
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    settings_override = dict(settings)

    payload_data = payload.model_dump()
    enabled = payload_data.get("telegram_notifications_enabled")
    if enabled is not None:
        settings_override["telegram_notifications_enabled"] = bool(enabled)

    for key in ("telegram_bot_token", "telegram_admin_chat_id"):
        value = payload_data.get(key)
        if value is None:
            continue
        cleaned = str(value).strip()
        if cleaned:
            settings_override[key] = cleaned

    await _notify_admin_telegram(
        "Telegram test notification",
        [
            "This is a manual test from Admin Settings.",
            "If you can read this, Telegram admin notifications are working.",
        ],
        settings_override=settings_override,
        force_send=True,
        raise_on_error=True,
    )
    return {"status": "sent", "message": "Telegram test message sent successfully."}


# ==================== BLOG ENDPOINTS ====================

@api_router.get("/blog/posts", response_model=List[BlogPost])
async def list_blog_posts(published_only: bool = True, limit: int = 50):
    limit = max(1, min(int(limit), 500))
    query: Dict[str, Any] = {}
    if published_only:
        query["published"] = True

    posts = await db.blog_posts.find(query, {"_id": 0}).sort("published_at", -1).to_list(limit)
    normalized = [_normalize_blog_post_doc(post) for post in posts]

    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    normalized.sort(
        key=lambda post: post.get("published_at") or post.get("created_at") or epoch,
        reverse=True,
    )
    return normalized


@api_router.get("/blog/posts/by-slug/{slug}", response_model=BlogPost)
async def get_blog_post_by_slug(slug: str, published_only: bool = True):
    normalized_slug = _slugify_text(slug)
    query: Dict[str, Any] = {"slug": normalized_slug}
    if published_only:
        query["published"] = True
    post = await db.blog_posts.find_one(query, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return _normalize_blog_post_doc(post)


@api_router.get("/blog/posts/{post_id}", response_model=BlogPost)
async def get_blog_post(post_id: str, published_only: bool = True):
    query: Dict[str, Any] = {"id": post_id}
    if published_only:
        query["published"] = True
    post = await db.blog_posts.find_one(query, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return _normalize_blog_post_doc(post)


@api_router.post("/blog/posts", response_model=BlogPost)
async def create_blog_post(payload: BlogPostCreate):
    title = str(payload.title or "").strip()
    content = str(payload.content or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    now = datetime.now(timezone.utc)
    is_published = bool(payload.published)
    preferred_slug = str(payload.slug).strip() if payload.slug is not None else None
    slug = await _generate_unique_blog_slug(title, preferred_slug or None)
    excerpt = (_strip_html_to_text(payload.excerpt) if payload.excerpt is not None else None) or None
    seo_title = (str(payload.seo_title).strip() if payload.seo_title is not None else None) or None
    seo_description = _derive_blog_seo_description(payload.seo_description, excerpt, content)
    cta_label = (str(payload.cta_label).strip() if payload.cta_label is not None else None) or None
    cta_url = (str(payload.cta_url).strip() if payload.cta_url is not None else None) or None
    post = BlogPost(
        slug=slug,
        title=title,
        excerpt=excerpt,
        content=content,
        cover_image_url=(str(payload.cover_image_url).strip() if payload.cover_image_url is not None else None) or None,
        tags=_normalize_blog_tags(payload.tags),
        seo_title=seo_title,
        seo_description=seo_description,
        cta_label=cta_label,
        cta_url=cta_url,
        published=is_published,
        published_at=now if is_published else None,
        created_at=now,
        updated_at=now,
    )

    doc = post.model_dump()
    doc["created_at"] = post.created_at.isoformat()
    doc["updated_at"] = post.updated_at.isoformat()
    if post.published_at:
        doc["published_at"] = post.published_at.isoformat()
    else:
        doc["published_at"] = None

    await db.blog_posts.insert_one(doc)
    await _notify_admin_telegram(
        "Blog post created",
        [
            f"Post ID: {post.id}",
            f"Title: {post.title}",
            f"Slug: {post.slug}",
            f"Published: {'yes' if post.published else 'no'}",
        ],
    )
    return post


@api_router.put("/blog/posts/{post_id}", response_model=BlogPost)
async def update_blog_post(post_id: str, payload: BlogPostUpdate):
    existing = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Blog post not found")

    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    next_title = str(existing.get("title") or "")
    next_content = str(existing.get("content") or "")
    next_excerpt = (_strip_html_to_text(existing.get("excerpt")) if existing.get("excerpt") is not None else None) or None
    if "title" in update_data:
        update_data["title"] = str(update_data["title"]).strip()
        if not update_data["title"]:
            raise HTTPException(status_code=400, detail="Title is required")
        next_title = update_data["title"]
    if "slug" in update_data:
        update_data["slug"] = str(update_data["slug"]).strip() or None
    if "content" in update_data:
        update_data["content"] = str(update_data["content"]).strip()
        if not update_data["content"]:
            raise HTTPException(status_code=400, detail="Content is required")
        next_content = update_data["content"]
    if "excerpt" in update_data:
        update_data["excerpt"] = _strip_html_to_text(update_data["excerpt"]) or None
        next_excerpt = update_data["excerpt"]
    if "cover_image_url" in update_data:
        update_data["cover_image_url"] = str(update_data["cover_image_url"]).strip() or None
    if "tags" in update_data:
        update_data["tags"] = _normalize_blog_tags(update_data.get("tags"))
    if "seo_title" in update_data:
        update_data["seo_title"] = str(update_data["seo_title"]).strip() or None
    if "seo_description" in update_data:
        cleaned_seo = _strip_html_to_text(update_data["seo_description"])
        update_data["seo_description"] = cleaned_seo or None
    if "cta_label" in update_data:
        update_data["cta_label"] = str(update_data["cta_label"]).strip() or None
    if "cta_url" in update_data:
        update_data["cta_url"] = str(update_data["cta_url"]).strip() or None

    if "slug" in update_data or "title" in update_data:
        update_data["slug"] = await _generate_unique_blog_slug(
            next_title,
            preferred_slug=update_data.get("slug"),
            exclude_post_id=post_id,
        )
    if "seo_description" not in update_data:
        # Keep SEO description in sync when excerpt/content changed and explicit SEO description doesn't exist.
        existing_seo = existing.get("seo_description")
        if existing_seo in [None, ""] and ("excerpt" in update_data or "content" in update_data):
            update_data["seo_description"] = _derive_blog_seo_description(None, next_excerpt, next_content)

    if "published" in update_data:
        was_published = bool(existing.get("published"))
        now_published = bool(update_data["published"])
        if now_published and not was_published and "published_at" not in update_data:
            update_data["published_at"] = datetime.now(timezone.utc).isoformat()
        if not now_published:
            update_data["published_at"] = None

    if "published_at" in update_data and isinstance(update_data["published_at"], datetime):
        update_data["published_at"] = update_data["published_at"].isoformat()

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.blog_posts.update_one({"id": post_id}, {"$set": update_data})

    updated = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    normalized = _normalize_blog_post_doc(updated or existing)
    await _notify_admin_telegram(
        "Blog post updated",
        [
            f"Post ID: {post_id}",
            f"Title: {normalized.get('title')}",
            f"Slug: {normalized.get('slug')}",
            f"Published: {'yes' if normalized.get('published') else 'no'}",
        ],
    )
    return normalized


@api_router.delete("/blog/posts/{post_id}")
async def delete_blog_post(post_id: str):
    existing = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Blog post not found")
    result = await db.blog_posts.delete_one({"id": post_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Blog post not found")

    await _notify_admin_telegram(
        "Blog post deleted",
        [
            f"Post ID: {post_id}",
            f"Title: {existing.get('title')}",
        ],
    )
    return {"message": "Blog post deleted successfully"}


# ==================== ADMIN: CUSTOMERS ====================

@api_router.get("/admin/customers")
async def admin_list_customers(q: Optional[str] = None, limit: int = 50, skip: int = 0):
    """
    Admin: list customer users with optional search.
    Search matches email/full_name/customer_id (case-insensitive).
    (No auth implemented in this project.)
    """
    limit = max(1, min(int(limit), 500))
    skip = max(0, int(skip))
    query: Dict[str, Any] = {"role": "customer"}
    if q and q.strip():
        s = q.strip()
        query["$or"] = [
            {"email": {"$regex": s, "$options": "i"}},
            {"full_name": {"$regex": s, "$options": "i"}},
            {"customer_id": {"$regex": s, "$options": "i"}},
        ]
    users = await db.users.find(query, {"_id": 0, "password": 0, "password_hash": 0}).sort("created_at", -1).skip(skip).to_list(limit)
    return users


@api_router.get("/admin/customers/{user_id}")
async def admin_get_customer(user_id: str):
    user = await db.users.find_one({"id": user_id, "role": "customer"}, {"_id": 0, "password": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Customer not found")
    return user


class AdminBlockCustomerRequest(BaseModel):
    reason: Optional[str] = None


@api_router.post("/admin/customers/{user_id}/block")
async def admin_block_customer(user_id: str, body: AdminBlockCustomerRequest):
    user = await db.users.find_one({"id": user_id, "role": "customer"}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_blocked": True, "blocked_at": datetime.now(timezone.utc).isoformat(), "blocked_reason": body.reason}}
    )
    updated = await db.users.find_one({"id": user_id, "role": "customer"}, {"_id": 0, "password": 0, "password_hash": 0})
    await _notify_admin_telegram(
        "Customer blocked",
        [
            f"User ID: {user_id}",
            f"Email: {user.get('email')}",
            f"Reason: {body.reason or 'n/a'}",
        ],
    )
    return updated or {"message": "Blocked"}


@api_router.post("/admin/customers/{user_id}/unblock")
async def admin_unblock_customer(user_id: str):
    user = await db.users.find_one({"id": user_id, "role": "customer"}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_blocked": False, "blocked_at": None, "blocked_reason": None}}
    )
    updated = await db.users.find_one({"id": user_id, "role": "customer"}, {"_id": 0, "password": 0, "password_hash": 0})
    await _notify_admin_telegram(
        "Customer unblocked",
        [
            f"User ID: {user_id}",
            f"Email: {user.get('email')}",
        ],
    )
    return updated or {"message": "Unblocked"}

# ==================== BULK EMAIL ENDPOINTS ====================

@api_router.post("/emails/bulk-send")
async def send_bulk_email(email_data: BulkEmailRequest):
    settings = await db.settings.find_one({"id": "site_settings"})
    if not settings or not settings.get('resend_api_key'):
        raise HTTPException(status_code=400, detail="Resend API key not configured")

    resend_from = settings.get("resend_from_email") or settings.get("support_email")
    if not resend_from:
        raise HTTPException(status_code=400, detail="Resend from email not configured")
    
    # Get recipients based on type
    recipients = []
    if email_data.recipient_type == "all":
        users = await db.users.find({}, {"email": 1, "_id": 0}).to_list(10000)
        recipients = [user['email'] for user in users]
    elif email_data.recipient_type == "customers":
        users = await db.users.find({"role": "customer"}, {"email": 1, "_id": 0}).to_list(10000)
        recipients = [user['email'] for user in users]
    elif email_data.recipient_type == "specific_emails" and email_data.specific_emails:
        recipients = email_data.specific_emails
    
    if not recipients:
        raise HTTPException(status_code=400, detail="No recipients found")
    
    # Send emails via Resend API (send individually to avoid leaking recipient list)
    resend_api_key = settings["resend_api_key"]
    headers = {
        "Authorization": f"Bearer {resend_api_key}",
        "Content-Type": "application/json",
    }

    sent_count = 0
    failed: List[Dict[str, Any]] = []
    for recipient in recipients:
        try:
            resp = requests.post(
                "https://api.resend.com/emails",
                headers=headers,
                json={
                    "from": resend_from,
                    "to": [recipient],
                    "subject": email_data.subject,
                    "html": f"<div style='font-family:Arial,sans-serif;white-space:pre-wrap'>{email_data.message}</div>",
                },
                timeout=20,
            )
            if 200 <= resp.status_code < 300:
                sent_count += 1
            else:
                failed.append({"email": recipient, "status": resp.status_code, "error": resp.text[:300]})
        except Exception as e:
            failed.append({"email": recipient, "status": None, "error": str(e)[:300]})

    result = {
        "message": f"Bulk email sent to {sent_count} recipients",
        "sent_count": sent_count,
        "failed_count": len(failed),
        "failed": failed[:20],
        "recipients_preview": recipients[:10] if len(recipients) > 10 else recipients
    }
    await _notify_admin_telegram(
        "Bulk email sent",
        [
            f"Subject: {email_data.subject}",
            f"Recipient type: {email_data.recipient_type}",
            f"Sent: {sent_count}",
            f"Failed: {len(failed)}",
        ],
    )
    return result

# ==================== STATS ENDPOINTS ====================

@api_router.post("/subscriptions/run-notifications")
async def run_subscription_notifications():
    """
    Run subscription reminder checks for all paid+completed subscription orders.
    Safe to call from a cron job.
    """
    processed = await _run_subscription_notification_checks(limit=5000)
    return {"processed": processed, "timestamp": datetime.now(timezone.utc).isoformat()}

@api_router.get("/stats/dashboard")
async def get_dashboard_stats():
    await _auto_cancel_unpaid_orders()
    total_orders = await db.orders.count_documents({})
    total_products = await db.products.count_documents({})
    total_customers = await db.users.count_documents({"role": "customer"})
    
    # Revenue calculation
    pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]['total'] if revenue_result else 0
    
    # Pending payments
    pending_payments = await db.orders.count_documents({"payment_status": "pending_verification"})
    
    return {
        "total_orders": total_orders,
        "total_products": total_products,
        "total_customers": total_customers,
        "total_revenue": total_revenue,
        "pending_payments": pending_payments
    }

# CORS configuration - handle Railway deployment
cors_origins_env = os.environ.get('CORS_ORIGINS', '*')
if cors_origins_env != '*':
    cors_origins = [origin.strip() for origin in cors_origins_env.split(',') if origin.strip()]
else:
    cors_origins = ['*']

# Helper function to add CORS headers to responses
def _add_cors_headers(response: Response, origin: Optional[str] = None):
    """Helper to add CORS headers to a response"""
    use_wildcard = cors_origins == ['*']
    
    if use_wildcard:
        # Wildcard mode: use "*" (credentials=False in middleware)
        response.headers["Access-Control-Allow-Origin"] = "*"
    elif origin and origin in cors_origins:
        # Specific origin match: use the request origin (credentials=True in middleware)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    elif cors_origins and len(cors_origins) > 0:
        # Fallback to first allowed origin
        response.headers["Access-Control-Allow-Origin"] = cors_origins[0]
        response.headers["Access-Control-Allow-Credentials"] = "true"
    else:
        # Ultimate fallback
        response.headers["Access-Control-Allow-Origin"] = "*"
    
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# CORS Middleware configuration
# Note: When allow_credentials=True, we cannot use allow_origins=["*"]
# So we'll use credentials=False with wildcard, or credentials=True with specific origins
use_wildcard = cors_origins == ['*']
app.add_middleware(
    CORSMiddleware,
    allow_credentials=not use_wildcard,  # False when using "*", True when using specific origins
    allow_origins=["*"] if use_wildcard else cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Additional middleware to ensure CORS headers on ALL responses (including errors)
# This runs after CORSMiddleware to catch any responses that might have been missed
@app.middleware("http")
async def add_cors_headers_middleware(request: Request, call_next):
    """Ensure CORS headers are present on all responses"""
    origin = request.headers.get("origin")
    response = await call_next(request)
    
    # Only add if not already present (CORSMiddleware should have added them, but this is a safety net)
    if "Access-Control-Allow-Origin" not in response.headers:
        _add_cors_headers(response, origin)
    
    return response

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)



# ==================== REFERRAL ENDPOINTS ====================

@api_router.get("/referral/info")
async def get_referral_info(user_id: str):
    """Get user's referral code and balance"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Count referrals
    referral_count = await db.users.count_documents({"referred_by": user['referral_code']})
    
    return {
        "referral_code": user.get('referral_code'),
        "referral_balance": user.get('referral_balance', 0.0),
        "total_referrals": referral_count,
        "referral_link": f"{os.environ.get('FRONTEND_URL', 'https://kayicom.com')}/register?ref={user.get('referral_code')}"
    }

@api_router.post("/auth/register-with-referral")
async def register_with_referral(user_data: UserCreate, referral_code: Optional[str] = None):
    """Register user with optional referral code"""
    email = user_data.email.strip()
    existing = await db.users.find_one({"email": _email_match(email)})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = pwd_context.hash(user_data.password)
    
    user = User(
        email=email,
        full_name=user_data.full_name,
        role="customer"
    )
    user.customer_id = await _generate_unique_customer_id()
    
    doc = user.model_dump()
    doc['password'] = hashed_password
    doc['created_at'] = doc['created_at'].isoformat()
    doc['referral_balance'] = 0.0
    
    # Set referrer if valid code provided
    if referral_code:
        referrer = await db.users.find_one({"referral_code": referral_code})
        if referrer:
            doc['referred_by'] = referral_code
    
    await db.users.insert_one(doc)
    await _notify_admin_telegram(
        "New customer registered (referral)",
        [
            f"Email: {user.email}",
            f"Customer ID: {user.customer_id}",
            f"Name: {user.full_name}",
            f"Referral code used: {doc.get('referred_by') or 'none'}",
        ],
    )
    return user

# ==================== WITHDRAWAL ENDPOINTS ====================

@api_router.post("/withdrawals/request")
async def request_withdrawal(withdrawal: WithdrawalRequest, user_id: str, user_email: str):
    """User requests withdrawal"""
    # Check minimum
    if withdrawal.amount < 5.0:
        raise HTTPException(status_code=400, detail="Minimum withdrawal is $5")
    
    # Check user balance
    user = await db.users.find_one({"id": user_id})
    if user and user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account is blocked")
    if not user or user.get('referral_balance', 0.0) < withdrawal.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Validate method-specific fields
    if withdrawal.method in ['usdt_bep20', 'btc'] and not withdrawal.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address required")
    if withdrawal.method == 'paypal' and not withdrawal.paypal_email:
        raise HTTPException(status_code=400, detail="PayPal email required")
    if withdrawal.method == 'moncash' and (not withdrawal.moncash_phone or not withdrawal.moncash_name):
        raise HTTPException(status_code=400, detail="MonCash phone and name required")
    
    # Create withdrawal request
    withdrawal_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_email": user_email,
        "amount": withdrawal.amount,
        "method": withdrawal.method,
        "wallet_address": withdrawal.wallet_address,
        "paypal_email": withdrawal.paypal_email,
        "moncash_phone": withdrawal.moncash_phone if withdrawal.method == 'moncash' else None,
        "moncash_name": withdrawal.moncash_name if withdrawal.method == 'moncash' else None,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.withdrawals.insert_one(withdrawal_doc)
    
    # Deduct from balance (pending)
    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"referral_balance": -withdrawal.amount}}
    )

    await _notify_admin_telegram(
        "Withdrawal request created",
        [
            f"Withdrawal ID: {withdrawal_doc['id']}",
            f"User: {user_email}",
            f"Amount: ${float(withdrawal.amount):.2f}",
            f"Method: {withdrawal.method}",
        ],
    )
    
    return {"message": "Withdrawal request submitted", "withdrawal_id": withdrawal_doc['id']}

@api_router.get("/withdrawals/user/{user_id}")
async def get_user_withdrawals(user_id: str):
    """Get user's withdrawal history"""
    withdrawals = await db.withdrawals.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return withdrawals

@api_router.get("/withdrawals/all")
async def get_all_withdrawals():
    """Admin: Get all withdrawal requests"""
    withdrawals = await db.withdrawals.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return withdrawals

@api_router.put("/withdrawals/{withdrawal_id}/status")
async def update_withdrawal_status(withdrawal_id: str, status: str, admin_notes: Optional[str] = None):
    """Admin: Update withdrawal status"""
    if status not in ['approved', 'completed', 'rejected']:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    withdrawal = await db.withdrawals.find_one({"id": withdrawal_id})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    updates = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if admin_notes:
        updates['admin_notes'] = admin_notes
    
    # If rejected, refund balance to the correct source
    if status == 'rejected' and withdrawal['status'] == 'pending':
        if withdrawal.get('type') == 'seller_withdrawal':
            await db.users.update_one(
                {"id": withdrawal['user_id']},
                {"$inc": {"seller_balance": withdrawal['amount']}}
            )
        else:
            await db.users.update_one(
                {"id": withdrawal['user_id']},
                {"$inc": {"referral_balance": withdrawal['amount']}}
            )
    
    await db.withdrawals.update_one({"id": withdrawal_id}, {"$set": updates})
    await _notify_admin_telegram(
        "Withdrawal status updated",
        [
            f"Withdrawal ID: {withdrawal_id}",
            f"New status: {status}",
            f"Admin notes: {admin_notes or 'n/a'}",
        ],
    )
    
    return {"message": f"Withdrawal {status}"}

# ==================== CRYPTO ENDPOINTS ====================

@api_router.get("/crypto/config")
async def get_crypto_config():
    """Get crypto exchange rates and config"""
    _ensure_crypto_exchange_enabled()
    config = await db.crypto_config.find_one({"id": "crypto_config"}, {"_id": 0})
    if not config:
        # Create default config
        default_config = CryptoConfig().model_dump()
        default_config['updated_at'] = default_config['updated_at'].isoformat()
        await db.crypto_config.insert_one(default_config)
        config = default_config
    
    # Get wallet addresses from settings
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0})
    crypto_settings = (settings or {}).get('crypto_settings') or {}
    if crypto_settings:
        config['crypto_settings'] = crypto_settings

    # Compatibility fields expected by frontend (CryptoPage)
    # Prefer site_settings.crypto_settings, fallback to crypto_config defaults.
    settings_default_buy = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('buy_rate_usdt'), 1.0)
    settings_default_sell = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('sell_rate_usdt'), 0.98)
    settings_default_fee = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('transaction_fee_percent'), 2.0)
    settings_default_min = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('min_transaction_usd'), 10.0)
    config_default_buy = _safe_float(_DEFAULT_CRYPTO_CONFIG.get('buy_rate_bep20'), 1.02)
    config_default_sell = _safe_float(_DEFAULT_CRYPTO_CONFIG.get('sell_rate_bep20'), 0.98)
    config_default_fee = _safe_float(_DEFAULT_CRYPTO_CONFIG.get('buy_fee_percent'), 2.0)
    config_default_min = _safe_float(_DEFAULT_CRYPTO_CONFIG.get('min_buy_usd'), 10.0)

    buy_rate_usdt, buy_rate_source = _resolve_crypto_value_with_source(
        crypto_settings,
        config,
        settings_key='buy_rate_usdt',
        config_key='buy_rate_bep20',
        settings_default=settings_default_buy,
        config_default=config_default_buy
    )
    sell_rate_usdt, sell_rate_source = _resolve_crypto_value_with_source(
        crypto_settings,
        config,
        settings_key='sell_rate_usdt',
        config_key='sell_rate_bep20',
        settings_default=settings_default_sell,
        config_default=config_default_sell
    )
    fee_percent, fee_source = _resolve_crypto_value_with_source(
        crypto_settings,
        config,
        settings_key='transaction_fee_percent',
        config_key='buy_fee_percent',
        settings_default=settings_default_fee,
        config_default=config_default_fee
    )
    min_usd, min_source = _resolve_crypto_value_with_source(
        crypto_settings,
        config,
        settings_key='min_transaction_usd',
        config_key='min_buy_usd',
        settings_default=settings_default_min,
        config_default=config_default_min
    )

    config['buy_rate_usdt'] = buy_rate_usdt
    config['sell_rate_usdt'] = sell_rate_usdt
    config['transaction_fee_percent'] = fee_percent
    config['min_transaction_usd'] = min_usd
    config['buy_rate_source'] = buy_rate_source
    config['sell_rate_source'] = sell_rate_source
    config['transaction_fee_source'] = fee_source
    config['min_transaction_usd_source'] = min_source

    buy_rate_by_chain: Dict[str, float] = {}
    sell_rate_by_chain: Dict[str, float] = {}
    buy_rate_by_chain_source: Dict[str, str] = {}
    sell_rate_by_chain_source: Dict[str, str] = {}

    for chain in ["BEP20", "TRC20", "MATIC"]:
        chain_key = chain.lower()
        chain_buy_default = _safe_float(_DEFAULT_CRYPTO_CONFIG.get(f"buy_rate_{chain_key}"), config_default_buy)
        chain_sell_default = _safe_float(_DEFAULT_CRYPTO_CONFIG.get(f"sell_rate_{chain_key}"), config_default_sell)
        buy_rate, buy_source = _resolve_crypto_value_with_source(
            crypto_settings,
            config,
            settings_key='buy_rate_usdt',
            config_key=f"buy_rate_{chain_key}",
            settings_default=settings_default_buy,
            config_default=chain_buy_default
        )
        sell_rate, sell_source = _resolve_crypto_value_with_source(
            crypto_settings,
            config,
            settings_key='sell_rate_usdt',
            config_key=f"sell_rate_{chain_key}",
            settings_default=settings_default_sell,
            config_default=chain_sell_default
        )
        buy_rate_by_chain[chain] = buy_rate
        sell_rate_by_chain[chain] = sell_rate
        buy_rate_by_chain_source[chain] = buy_source
        sell_rate_by_chain_source[chain] = sell_source

    config['buy_rate_by_chain'] = buy_rate_by_chain
    config['sell_rate_by_chain'] = sell_rate_by_chain
    config['buy_rate_by_chain_source'] = buy_rate_by_chain_source
    config['sell_rate_by_chain_source'] = sell_rate_by_chain_source
    
    return config

@api_router.put("/crypto/config")
async def update_crypto_config(updates: Dict[str, Any]):
    """Admin: Update crypto config"""
    _ensure_crypto_exchange_enabled()
    updates['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.crypto_config.update_one(
        {"id": "crypto_config"},
        {"$set": updates},
        upsert=True
    )
    
    return {"message": "Crypto config updated"}

@api_router.post("/crypto/buy")
async def buy_crypto(request: CryptoBuyRequest, user_id: str = None, user_email: str = None):
    """User buys USDT - Generate Plisio invoice automatically"""
    _ensure_crypto_exchange_enabled()
    # Extract user info from request if not provided
    if not user_id:
        user_id = "guest"
    if not user_email:
        user_email = "guest@kayicom.com"
    # Get config
    config = await db.crypto_config.find_one({"id": "crypto_config"})
    if not config:
        raise HTTPException(status_code=500, detail="Crypto config not found")
    
    # Get Plisio API key from settings
    settings = await db.settings.find_one({"id": "site_settings"})
    crypto_settings = (settings or {}).get("crypto_settings") or {}
    
    # For BUY USDT, customer pays with FIAT (PayPal, AirTM, Skrill)
    # No need for Plisio - just show admin payment info
    
    allowed_chains = {"BEP20", "TRC20"}
    chain = request.chain.upper().strip()
    if chain not in allowed_chains:
        raise HTTPException(status_code=400, detail="Unsupported network. Use BEP20 or TRC20.")

    # Check limits (prefer site_settings.crypto_settings)
    settings_default_min = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('min_transaction_usd'), 10.0)
    config_default_min = _safe_float(_DEFAULT_CRYPTO_CONFIG.get('min_buy_usd'), 10.0)
    min_usd = _resolve_crypto_value(
        crypto_settings,
        config,
        settings_key='min_transaction_usd',
        config_key='min_buy_usd',
        settings_default=settings_default_min,
        config_default=config_default_min
    )
    max_usd = _safe_float(config.get('max_buy_usd', 10000.0), 10000.0)
    if request.amount_usd < min_usd or request.amount_usd > max_usd:
        raise HTTPException(status_code=400, detail=f"Amount must be between ${min_usd} and ${max_usd}")
    
    if not request.payment_proof:
        raise HTTPException(status_code=400, detail="Payment proof is required")
    if not (request.transaction_id and str(request.transaction_id).strip()) and not (request.payer_info and str(request.payer_info).strip()):
        raise HTTPException(status_code=400, detail="Payment reference or payer info is required")

    # Get rate
    rate_key = f"buy_rate_{chain.lower()}"
    settings_default_buy = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('buy_rate_usdt'), 1.0)
    config_default_buy = _safe_float(_DEFAULT_CRYPTO_CONFIG.get(rate_key), 1.02)
    exchange_rate = _resolve_crypto_value(
        crypto_settings,
        config,
        settings_key="buy_rate_usdt",
        config_key=rate_key,
        settings_default=settings_default_buy,
        config_default=config_default_buy
    )
    
    # Calculate
    amount_crypto = request.amount_usd / exchange_rate
    settings_default_fee = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('transaction_fee_percent'), 2.0)
    config_default_fee = _safe_float(_DEFAULT_CRYPTO_CONFIG.get('buy_fee_percent'), 2.0)
    fee_percent = _resolve_crypto_value(
        crypto_settings,
        config,
        settings_key="transaction_fee_percent",
        config_key="buy_fee_percent",
        settings_default=settings_default_fee,
        config_default=config_default_fee
    )
    fee = request.amount_usd * (fee_percent / 100)
    total_usd = request.amount_usd + fee
    
    # Get admin payment information based on selected method
    payment_info = {}
    if settings and settings.get('crypto_payment_gateways'):
        gateway = settings['crypto_payment_gateways'].get(request.payment_method, {})
        if gateway.get('enabled'):
            payment_info = {
                'method': request.payment_method,
                'email': gateway.get('email', ''),
                'instructions': gateway.get('instructions', '')
            }

    transaction_id = str(uuid.uuid4())
    invoice_id = f"INV-{transaction_id[:8].upper()}"

    # Create transaction (internal invoice)
    transaction = {
        "id": transaction_id,
        "invoice_id": invoice_id,
        "user_id": user_id,
        "user_email": user_email,
        "transaction_type": "buy",
        "crypto_type": "USDT",
        "chain": chain,
        "amount_crypto": amount_crypto,
        "amount_usd": request.amount_usd,
        "exchange_rate": exchange_rate,
        "fee": fee,
        "total_usd": total_usd,
        "payment_method": request.payment_method,
        "payment_info": payment_info,
        "wallet_address": request.wallet_address,
        "payer_info": request.payer_info,
        "transaction_id": request.transaction_id,
        "payment_proof": request.payment_proof,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.crypto_transactions.insert_one(transaction)
    
    return {
        "message": "Buy crypto order created. Use the instructions below to complete payment.",
        "transaction_id": transaction['id'],
        "invoice_id": invoice_id,
        "amount_crypto": amount_crypto,
        "total_usd": total_usd,
        "payment_method": request.payment_method,
        "payment_info": payment_info
    }

@api_router.post("/crypto/sell")
async def sell_crypto(request: CryptoSellRequest, user_id: str, user_email: str):
    """User sells USDT"""
    _ensure_crypto_exchange_enabled()
    config = await db.crypto_config.find_one({"id": "crypto_config"})
    if not config:
        raise HTTPException(status_code=500, detail="Crypto config not found")
    
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0})
    crypto_settings = (settings or {}).get("crypto_settings") or {}
    allowed_chains = {"BEP20", "TRC20"}
    chain = request.chain.upper().strip()
    if chain not in allowed_chains:
        raise HTTPException(status_code=400, detail="Unsupported network. Use BEP20 or TRC20.")
    
    # Check limits
    min_sell = _safe_float(config.get('min_sell_usdt', 10.0), 10.0)
    max_sell = _safe_float(config.get('max_sell_usdt', 10000.0), 10000.0)
    if request.amount_crypto < min_sell or request.amount_crypto > max_sell:
        raise HTTPException(status_code=400, detail=f"Amount must be between {min_sell} and {max_sell} USDT")
    
    # Get rate
    rate_key = f"sell_rate_{chain.lower()}"
    settings_default_sell = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('sell_rate_usdt'), 0.98)
    config_default_sell = _safe_float(_DEFAULT_CRYPTO_CONFIG.get(rate_key), 0.98)
    exchange_rate = _resolve_crypto_value(
        crypto_settings,
        config,
        settings_key="sell_rate_usdt",
        config_key=rate_key,
        settings_default=settings_default_sell,
        config_default=config_default_sell
    )
    
    # Calculate
    amount_usd = request.amount_crypto * exchange_rate
    settings_default_fee = _safe_float(_DEFAULT_SITE_CRYPTO_SETTINGS.get('transaction_fee_percent'), 2.0)
    config_default_fee = _safe_float(_DEFAULT_CRYPTO_CONFIG.get('sell_fee_percent'), 2.0)
    fee_percent = _resolve_crypto_value(
        crypto_settings,
        config,
        settings_key="transaction_fee_percent",
        config_key="sell_fee_percent",
        settings_default=settings_default_fee,
        config_default=config_default_fee
    )
    fee = amount_usd * (fee_percent / 100)
    total_usd = amount_usd - fee
    
    transaction_id = str(uuid.uuid4())
    invoice_id = f"INV-{transaction_id[:8].upper()}"

    # Determine fallback wallet from settings/config
    wallets = (crypto_settings.get("wallets") or {}) if isinstance(crypto_settings, dict) else {}
    manual_wallet = wallets.get(chain) or wallets.get(chain.lower())
    if not manual_wallet:
        fallback_key = f"wallet_{chain.lower()}"
        manual_wallet = config.get(fallback_key)

    processing_mode = "manual"
    wallet_address = None
    invoice_url = None
    qr_code = None
    plisio_invoice_id = None
    processing_warning = None
    if not wallet_address:
        wallet_address = manual_wallet
        if not wallet_address:
            raise HTTPException(status_code=400, detail="No admin wallet configured for this network")

    # Create transaction
    transaction = {
        "id": transaction_id,
        "invoice_id": invoice_id,
        "user_id": user_id,
        "user_email": user_email,
        "transaction_type": "sell",
        "crypto_type": "USDT",
        "chain": chain,
        "amount_crypto": request.amount_crypto,
        "amount_usd": amount_usd,
        "exchange_rate": exchange_rate,
        "fee": fee,
        "total_usd": total_usd,
        "payment_method": request.payment_method,
        "metadata": {"receiving_info": request.receiving_info},
        "receiving_info": request.receiving_info,
        "transaction_id": request.transaction_id,
        "payment_proof": request.payment_proof,
        "wallet_address": wallet_address,
        "processing_mode": processing_mode,
        "processing_note": processing_warning,
        "plisio_invoice_id": plisio_invoice_id,
        "plisio_invoice_url": invoice_url,
        "qr_code": qr_code,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.crypto_transactions.insert_one(transaction)
    
    message = "Crypto sell order created. Send USDT to the unique address below. Payment will be auto-detected."
    if processing_mode != "automatic":
        message = "Crypto sell order created. Send USDT to the wallet below and submit proof for manual review."

    response = {
        "message": message,
        "transaction_id": transaction['id'],
        "invoice_id": invoice_id,
        "total_usd_to_receive": total_usd,
        "amount_crypto": request.amount_crypto,
        "payment_method": request.payment_method,
        "wallet_address": wallet_address,
        "instructions": (crypto_settings.get("sell_instructions") or "").strip(),
        "invoice_url": invoice_url,
        "plisio_invoice_id": plisio_invoice_id,
        "qr_code": qr_code,
        "processing_mode": processing_mode,
        "warning": processing_warning
    }

    return response

@api_router.get("/crypto/transactions/user/{user_id}")
async def get_user_crypto_transactions(user_id: str):
    """Get user's crypto transactions"""
    _ensure_crypto_exchange_enabled()
    transactions = await db.crypto_transactions.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return transactions


@api_router.post("/crypto/transactions/{transaction_id}/proof")
async def submit_crypto_payment_proof(transaction_id: str, payload: CryptoProofRequest):
    """Attach payment proof/tx id for a pending crypto transaction."""
    _ensure_crypto_exchange_enabled()
    tx = await db.crypto_transactions.find_one({"id": transaction_id})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.get("status") not in ["pending", "processing"]:
        raise HTTPException(status_code=400, detail="Transaction is not pending")

    updates = {}
    if payload.transaction_id and str(payload.transaction_id).strip():
        updates["transaction_id"] = str(payload.transaction_id).strip()
    if payload.tx_hash and str(payload.tx_hash).strip():
        updates["tx_hash"] = str(payload.tx_hash).strip()
    if payload.payment_proof:
        updates["payment_proof"] = payload.payment_proof
    if not updates:
        raise HTTPException(status_code=400, detail="No proof data provided")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.crypto_transactions.update_one({"id": transaction_id}, {"$set": updates})
    return {"status": "ok", "message": "Payment proof submitted"}

@api_router.get("/crypto/transactions/all")
async def get_all_crypto_transactions():
    """Admin: Get all crypto transactions"""
    _ensure_crypto_exchange_enabled()
    transactions = await db.crypto_transactions.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return transactions

class CryptoStatusUpdate(BaseModel):
    status: str
    admin_notes: Optional[str] = None
    tx_hash: Optional[str] = None

@api_router.put("/crypto/transactions/{transaction_id}/status")
async def update_crypto_transaction_status(
    transaction_id: str,
    update_data: CryptoStatusUpdate
):
    """Admin: Update crypto transaction status"""
    _ensure_crypto_exchange_enabled()
    if update_data.status not in ['processing', 'completed', 'rejected', 'failed']:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    updates = {
        "status": update_data.status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if update_data.admin_notes:
        updates['admin_notes'] = update_data.admin_notes
    
    if update_data.tx_hash:
        updates['tx_hash'] = update_data.tx_hash
    
    result = await db.crypto_transactions.update_one(
        {"id": transaction_id},
        {"$set": updates}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return {"message": "Transaction status updated"}


# ---------- image uploads (stored in MongoDB) ----------
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

MIME_TO_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg"}


def _public_base_url(request: Request) -> str:
    """Return the public base URL, respecting reverse-proxy headers."""
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
    )
    return f"{proto}://{host}"


@api_router.get("/uploads/{filename}")
async def serve_uploaded_image(filename: str):
    """Serve an image stored in MongoDB."""
    doc = await db.uploaded_images.find_one({"filename": filename})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        content=doc["data"],
        media_type=doc.get("mime_type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


# File Upload Endpoint
@api_router.post("/upload/image")
async def upload_image(request: Request, file: UploadFile = File(...)):
    """Upload image, store in MongoDB, and return a public URL."""
    try:
        contents = await file.read()
        if len(contents) > MAX_IMAGE_SIZE:
            raise HTTPException(status_code=400, detail="Image exceeds 5 MB limit")

        mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "image/jpeg"
        if mime_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported image type: {mime_type}")

        ext = MIME_TO_EXT.get(mime_type, Path(file.filename).suffix.lower() if file.filename else ".jpg")
        filename = f"{uuid.uuid4().hex}{ext}"

        await db.uploaded_images.insert_one({
            "filename": filename,
            "data": contents,
            "mime_type": mime_type,
            "original_name": file.filename,
            "size": len(contents),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        public_url = f"{_public_base_url(request)}/api/uploads/{filename}"
        return {"url": public_url, "filename": file.filename}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# ==================== REFERRAL PAYOUT TRACKING ====================

async def check_and_credit_referral(order: dict):
    """Check if order qualifies for referral payout and credit referrer"""
    # Only for paid + completed orders
    if order.get("payment_status") != "paid" or order.get("order_status") != "completed":
        return

    # Idempotency: don't pay twice for same order
    already_paid = await db.referral_payouts.find_one({"order_id": order.get("id")})
    if already_paid:
        return

    # Check if user was referred
    user = await db.users.find_one({"id": order['user_id']})
    if not user or not user.get('referred_by'):
        return
    
    # Check if order contains subscription
    subscription_product_ids: List[str] = []
    for item in order.get('items', []):
        product = await db.products.find_one({"id": item.get('product_id')})
        if product and product.get('is_subscription'):
            subscription_product_ids.append(product.get("id"))

    if not subscription_product_ids:
        return
    
    # Check if this is the first PAID+COMPLETED subscription order for this referred user
    prior_payout = await db.referral_payouts.find_one({"referred_user_id": order['user_id']})
    if prior_payout:
        return
    
    # Credit referrer $1
    referrer_code = user['referred_by']
    await db.users.update_one(
        {"referral_code": referrer_code},
        {"$inc": {"referral_balance": 1.0}}
    )
    
    # Log referral payout
    await db.referral_payouts.insert_one({
        "id": str(uuid.uuid4()),
        "referrer_code": referrer_code,
        "referred_user_id": order['user_id'],
        "order_id": order['id'],
        "amount": 1.0,
        "created_at": datetime.now(timezone.utc).isoformat()
    })


# ==================== WALLET (STORE CREDIT) ENDPOINTS ====================

class WalletAdjustment(BaseModel):
    amount: float
    reason: Optional[str] = None

class WalletTopupCreate(BaseModel):
    amount: float
    payment_method: str  # crypto_plisio or manual gateways

class WalletTopupProof(BaseModel):
    topup_id: str
    transaction_id: str
    payment_proof_url: str

class AdminWalletAdjustRequest(BaseModel):
    identifier: str  # user_id or customer_id or email
    amount: float
    reason: Optional[str] = None
    action: str = "credit"  # credit or debit


class CreditsConvertRequest(BaseModel):
    credits: int  # must be multiple of 1000
    reason: Optional[str] = None


class AdminCreditsAdjustRequest(BaseModel):
    identifier: str  # user_id or customer_id or email
    credits: int
    reason: Optional[str] = None
    action: str = "credit"  # credit or debit

@api_router.get("/wallet/balance")
async def get_wallet_balance(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": user_id, "wallet_balance": float(user.get("wallet_balance", 0.0))}

@api_router.get("/wallet/transactions")
async def get_wallet_transactions(user_id: str):
    txs = await db.wallet_transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return txs

@api_router.post("/wallet/admin-adjust")
async def admin_adjust_wallet(req: AdminWalletAdjustRequest):
    """
    Admin: credit/debit a user's wallet balance by user_id, customer_id, or email.
    (No auth implemented in this project.)
    """
    ident = (req.identifier or "").strip()
    if not ident:
        raise HTTPException(status_code=400, detail="Identifier required")
    amt = float(req.amount)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    if req.action not in ["credit", "debit"]:
        raise HTTPException(status_code=400, detail="Invalid action")

    # Case-insensitive regex for customer_id and email
    ident_regex = {"$regex": f"^{re.escape(ident)}$", "$options": "i"}
    # Try exact match first for id (it should be case-sensitive), then case-insensitive for customer_id and email
    user = await db.users.find_one(
        {"$or": [
            {"id": ident},  # user_id should be exact match
            {"customer_id": ident_regex},  # Case-insensitive match for customer_id
            {"email": ident_regex},  # Case-insensitive match for email
        ]},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    delta = amt if req.action == "credit" else -amt
    # If debit, prevent negative balance
    current_balance = float(user.get("wallet_balance", 0.0))
    if delta < 0 and current_balance + 1e-9 < abs(delta):
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")

    # Update wallet balance using $inc (atomic operation)
    update_result = await db.users.update_one(
        {"id": user["id"]}, 
        {"$inc": {"wallet_balance": float(delta)}}
    )
    
    if update_result.matched_count == 0:
        raise HTTPException(status_code=500, detail=f"Failed to update wallet: user not found in update operation")
    
    # modified_count can be 0 if the field didn't exist and was created, or in rare edge cases
    # We'll verify by fetching the user after update
    
    # Insert transaction record
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user.get("email"),
        "order_id": None,
        "type": "admin_adjust",
        "amount": float(delta),
        "reason": req.reason or f"Admin wallet {req.action}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    logging.info(f"Admin wallet adjust: user_id={user['id']}, identifier={ident}, action={req.action}, amount={amt}, delta={delta}, old_balance={current_balance}")

    # Fetch updated user to return new balance and verify the update
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated user")
    
    new_balance = float(updated.get("wallet_balance", 0.0))
    expected_balance = current_balance + delta
    
    # Verify the balance was updated correctly (allow small floating point differences)
    if abs(new_balance - expected_balance) > 0.01:
        logging.error(f"Wallet balance mismatch! user_id={user['id']}, expected={expected_balance}, actual={new_balance}")
        # Still return the actual balance, but log the issue
    
    logging.info(f"Admin wallet adjust: user_id={user['id']}, identifier={ident}, action={req.action}, amount={amt}, delta={delta}, old_balance={current_balance}, new_balance={new_balance}")
    await _notify_admin_telegram(
        "Admin wallet adjusted",
        [
            f"User: {user.get('email') or user.get('id')}",
            f"Action: {req.action}",
            f"Amount: ${float(amt):.2f}",
            f"New balance: ${float(new_balance):.2f}",
            f"Reason: {req.reason or 'n/a'}",
        ],
    )
    
    return JSONResponse({
        "user_id": user["id"], 
        "customer_id": user.get("customer_id"), 
        "wallet_balance": new_balance
    })


@api_router.get("/credits/balance")
async def get_credits_balance(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": user_id, "credits_balance": int(user.get("credits_balance", 0)), "rate": "1000_credits = 1_USD"}


@api_router.get("/credits/transactions")
async def get_credits_transactions(user_id: str):
    txs = await db.credits_transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return txs


@api_router.post("/credits/admin-adjust")
async def admin_adjust_credits(req: AdminCreditsAdjustRequest):
    """
    Admin: credit/debit a user's credits by user_id, customer_id, or email.
    (No auth implemented in this project.)
    """
    ident = (req.identifier or "").strip()
    if not ident:
        raise HTTPException(status_code=400, detail="Identifier required")
    credits = int(req.credits)
    if credits <= 0:
        raise HTTPException(status_code=400, detail="Credits must be > 0")
    if req.action not in ["credit", "debit"]:
        raise HTTPException(status_code=400, detail="Invalid action")

    user = await db.users.find_one(
        {"$or": [{"id": ident}, {"customer_id": ident}, {"email": ident}]},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    delta = credits if req.action == "credit" else -credits
    current = int(user.get("credits_balance", 0))
    if delta < 0 and current < abs(delta):
        raise HTTPException(status_code=400, detail="Insufficient credits")

    await db.users.update_one({"id": user["id"]}, {"$inc": {"credits_balance": int(delta)}})
    await db.credits_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user.get("email"),
        "order_id": None,
        "type": "admin_adjust",
        "credits": int(delta),
        "usd_equivalent": round(float(delta) / 1000.0, 2),
        "reason": req.reason or f"Admin credits {req.action}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    await _notify_admin_telegram(
        "Admin credits adjusted",
        [
            f"User: {user.get('email') or user.get('id')}",
            f"Action: {req.action}",
            f"Credits: {int(credits)}",
            f"New balance: {int((updated or {}).get('credits_balance', 0))}",
            f"Reason: {req.reason or 'n/a'}",
        ],
    )
    return {"user_id": user["id"], "customer_id": user.get("customer_id"), "credits_balance": int(updated.get("credits_balance", 0))}


@api_router.post("/credits/convert")
async def convert_credits_to_wallet(req: CreditsConvertRequest, user_id: str, user_email: str):
    credits = int(req.credits)
    if credits <= 0:
        raise HTTPException(status_code=400, detail="Credits must be > 0")
    if credits % 1000 != 0:
        raise HTTPException(status_code=400, detail="Credits must be a multiple of 1000")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    current = int(user.get("credits_balance", 0))
    if current < credits:
        raise HTTPException(status_code=400, detail="Insufficient credits")

    usd = round(float(credits) / 1000.0, 2)
    await db.users.update_one({"id": user_id}, {"$inc": {"credits_balance": -credits, "wallet_balance": float(usd)}})

    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_email": user_email,
        "order_id": None,
        "type": "credits_convert",
        "amount": float(usd),
        "reason": req.reason or f"Converted {credits} credits to wallet",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    await db.credits_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_email": user_email,
        "order_id": None,
        "type": "convert",
        "credits": -credits,
        "usd_equivalent": float(usd),
        "reason": req.reason or "Convert credits to wallet",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    updated = await db.users.find_one({"id": user_id}, {"_id": 0})
    await _notify_admin_telegram(
        "Credits converted to wallet",
        [
            f"User: {user_email or user_id}",
            f"Credits converted: {int(credits)}",
            f"USD added: ${float(usd):.2f}",
        ],
    )
    return {"user_id": user_id, "credits_converted": credits, "usd_added": float(usd), "wallet_balance": float(updated.get("wallet_balance", 0.0)), "credits_balance": int(updated.get("credits_balance", 0))}

@api_router.post("/wallet/topups")
async def create_wallet_topup(topup: WalletTopupCreate, user_id: str, user_email: str):
    if float(topup.amount) <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    if user_doc.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account is blocked")

    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}

    topup_id = str(uuid.uuid4())
    doc = {
        "id": topup_id,
        "user_id": user_id,
        "user_email": user_email,
        "amount": float(topup.amount),
        "payment_method": topup.payment_method,
        "payment_status": "pending",
        "transaction_id": None,
        "payment_proof_url": None,
        "plisio_invoice_id": None,
        "plisio_invoice_url": None,
        "credited": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # If crypto payment, create Plisio invoice
    if topup.payment_method == "crypto_plisio" and settings.get("plisio_api_key"):
        try:
            plisio = PlisioHelper(settings["plisio_api_key"])
            callback_url = _plisio_callback_url()
            success_url = _plisio_success_url("wallet_topup", topup_id)
            cancel_url = _plisio_cancel_url("wallet_topup", topup_id)
            invoice_response = await plisio.create_invoice(
                amount=float(topup.amount),
                currency="USDT",
                order_name=f"Wallet Topup {topup_id}",
                order_number=topup_id,
                callback_url=callback_url,
                email=user_email,
                success_url=success_url,
                cancel_url=cancel_url,
            )
            if invoice_response.get("success"):
                doc["plisio_invoice_id"] = invoice_response.get("invoice_id")
                doc["plisio_invoice_url"] = invoice_response.get("invoice_url")
        except Exception as e:
            logging.error(f"Plisio topup error: {e}")

    await db.wallet_topups.insert_one(doc)
    await _notify_admin_telegram(
        "Wallet topup created",
        [
            f"Topup ID: {topup_id}",
            f"User: {user_email}",
            f"Amount: ${float(topup.amount):.2f}",
            f"Payment method: {topup.payment_method}",
            f"Payment status: {doc.get('payment_status')}",
        ],
    )

    # Attach payment instructions for manual methods (optional)
    payment_info = {}
    gateways = settings.get("payment_gateways") or {}
    gateway = gateways.get(topup.payment_method) or {}
    if gateway.get("enabled"):
        payment_info = {
            "method": topup.payment_method,
            "email": gateway.get("email", ""),
            "instructions": gateway.get("instructions", "")
        }

    # Ensure all values are JSON-serializable and return with JSONResponse for proper CORS headers
    try:
        clean_doc = {
            "id": doc.get("id"),
            "user_id": doc.get("user_id"),
            "user_email": doc.get("user_email"),
            "amount": doc.get("amount"),
            "payment_method": doc.get("payment_method"),
            "payment_status": doc.get("payment_status"),
            "transaction_id": doc.get("transaction_id"),
            "payment_proof_url": doc.get("payment_proof_url"),
            "plisio_invoice_id": doc.get("plisio_invoice_id"),
            "plisio_invoice_url": doc.get("plisio_invoice_url"),
            "credited": doc.get("credited"),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
        }
        return JSONResponse({
            "topup": clean_doc,
            "payment_info": payment_info
        })
    except Exception as e:
        logging.error(f"Error serializing wallet topup response: {e}")
        # Return minimal response if serialization fails
        return JSONResponse({
            "topup": {
                "id": topup_id,
                "user_id": user_id,
                "amount": float(topup.amount),
                "payment_status": doc.get("payment_status", "pending")
            },
            "payment_info": payment_info
        })

@api_router.get("/wallet/topups/user/{user_id}")
async def get_user_wallet_topups(user_id: str):
    topups = await db.wallet_topups.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return topups

@api_router.get("/wallet/topups/all")
async def get_all_wallet_topups():
    topups = await db.wallet_topups.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return topups

@api_router.post("/wallet/topups/proof")
async def submit_wallet_topup_proof(proof: WalletTopupProof):
    """Submit payment proof for a wallet topup"""
    update_data = {
        "transaction_id": proof.transaction_id,
        "payment_proof_url": proof.payment_proof_url,
        "payment_status": "pending_verification",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    res = await db.wallet_topups.update_one(
        {"id": proof.topup_id},
        {"$set": update_data}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Topup not found")
    
    # Return the updated topup document for confirmation
    updated = await db.wallet_topups.find_one({"id": proof.topup_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Topup not found after update")
    
    logging.info(f"Payment proof submitted for topup {proof.topup_id}, URL length: {len(proof.payment_proof_url) if proof.payment_proof_url else 0}")
    await _notify_admin_telegram(
        "Wallet topup proof submitted",
        [
            f"Topup ID: {proof.topup_id}",
            f"Transaction ID: {proof.transaction_id}",
            "Status: pending_verification",
        ],
    )
    
    return {
        "message": "Topup proof submitted",
        "topup": updated
    }

@api_router.put("/wallet/topups/{topup_id}/status")
async def update_wallet_topup_status(topup_id: str, payment_status: str):
    if payment_status not in ["paid", "failed", "rejected", "processing"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    topup = await db.wallet_topups.find_one({"id": topup_id}, {"_id": 0})
    if not topup:
        raise HTTPException(status_code=404, detail="Topup not found")

    await db.wallet_topups.update_one(
        {"id": topup_id},
        {"$set": {"payment_status": payment_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Credit wallet once when marked paid
    if payment_status == "paid" and not topup.get("credited"):
        await db.users.update_one({"id": topup["user_id"]}, {"$inc": {"wallet_balance": float(topup["amount"])}})
        await db.wallet_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": topup["user_id"],
            "user_email": topup.get("user_email"),
            "order_id": None,
            "type": "topup",
            "amount": float(topup["amount"]),
            "reason": f"Wallet topup {topup_id}",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        await db.wallet_topups.update_one({"id": topup_id}, {"$set": {"credited": True}})

    await _notify_admin_telegram(
        "Wallet topup status updated",
        [
            f"Topup ID: {topup_id}",
            f"User: {topup.get('user_email') or topup.get('user_id')}",
            f"Status: {payment_status}",
        ],
    )

    return {"message": "Topup updated"}


# ==================== MINUTES TRANSFER (INTERNATIONAL) ====================

class MinutesQuoteResponse(BaseModel):
    amount: float
    fee_amount: float
    total_amount: float
    currency: str = "USD"


class MinutesTransferCreate(BaseModel):
    country: str
    phone_number: str
    amount: float  # USD amount customer wants to send
    payment_method: str  # wallet, crypto_plisio, or manual gateways


class MinutesTransferProof(BaseModel):
    transfer_id: str
    transaction_id: str
    payment_proof_url: str


class MinutesTransferStatusUpdate(BaseModel):
    payment_status: Optional[str] = None  # pending, pending_verification, paid, failed, rejected, processing
    transfer_status: Optional[str] = None  # pending, processing, completed, cancelled


def _calc_minutes_fee(settings: dict, amount: float) -> Dict[str, float]:
    fee_type = (settings or {}).get("minutes_transfer_fee_type") or "percent"
    fee_value = float((settings or {}).get("minutes_transfer_fee_value") or 0.0)
    if fee_type not in ["percent", "fixed"]:
        fee_type = "percent"
    if fee_type == "percent":
        fee_amount = amount * max(0.0, fee_value) / 100.0
    else:
        fee_amount = max(0.0, fee_value)
    fee_amount = round(float(fee_amount), 2)
    total = round(float(amount + fee_amount), 2)
    return {"fee_amount": fee_amount, "total_amount": total}


@api_router.get("/minutes/quote", response_model=MinutesQuoteResponse)
@api_router.get("/mobile-topup/quote", response_model=MinutesQuoteResponse)
async def minutes_quote(amount: float, country: Optional[str] = None):
    """Get quote for minutes transfer. Country is optional for quote calculation."""
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    
    # Allow quotes even if feature is disabled (users can see pricing)
    # Only block actual transfers if disabled
    
    try:
        amt = float(amount)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid amount format")
    
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    
    min_amt = _safe_float(settings.get("minutes_transfer_min_amount"), 1.0)
    max_amt = _safe_float(settings.get("minutes_transfer_max_amount"), 500.0)
    
    if amt + 1e-9 < min_amt or amt - 1e-9 > max_amt:
        raise HTTPException(status_code=400, detail=f"Amount must be between ${min_amt} and ${max_amt}")

    fee = _calc_minutes_fee(settings, amt)
    return {"amount": round(amt, 2), "fee_amount": fee["fee_amount"], "total_amount": fee["total_amount"], "currency": "USD"}


@api_router.post("/minutes/transfers")
@api_router.post("/mobile-topup/requests")
async def create_minutes_transfer(payload: MinutesTransferCreate, user_id: str, user_email: str):
    settings = await db.settings.find_one({"id": "site_settings"}, {"_id": 0}) or {}
    if not settings.get("minutes_transfer_enabled"):
        raise HTTPException(status_code=400, detail="Minutes transfer is disabled")

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    if user_doc.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account is blocked")

    country = (payload.country or "").strip()
    phone = (payload.phone_number or "").strip()
    if not country:
        raise HTTPException(status_code=400, detail="Country is required")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    
    # Basic phone validation - must have at least 5 characters
    if len(phone) < 5:
        raise HTTPException(status_code=400, detail="Phone number is too short")

    amt = float(payload.amount)
    min_amt = float(settings.get("minutes_transfer_min_amount") or 1.0)
    max_amt = float(settings.get("minutes_transfer_max_amount") or 500.0)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    if amt + 1e-9 < min_amt or amt - 1e-9 > max_amt:
        raise HTTPException(status_code=400, detail=f"Amount must be between {min_amt} and {max_amt}")

    fee = _calc_minutes_fee(settings, amt)
    transfer_id = str(uuid.uuid4())
    doc = {
        "id": transfer_id,
        "user_id": user_id,
        "user_email": user_email,
        "country": country,
        "phone_number": phone,
        "amount": round(float(amt), 2),
        "fee_amount": fee["fee_amount"],
        "total_amount": fee["total_amount"],
        "payment_method": payload.payment_method,
        "payment_status": "pending",
        "transfer_status": "pending",
        "transaction_id": None,
        "payment_proof_url": None,
        "plisio_invoice_id": None,
        "plisio_invoice_url": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Payment validation
    if payload.payment_method == "wallet":
        wallet_balance = float(user_doc.get("wallet_balance", 0.0))
        if wallet_balance + 1e-9 < float(doc["total_amount"]):
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")
        await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": -float(doc["total_amount"])}})
        await db.wallet_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "user_email": user_email,
            "order_id": None,
            "type": "minutes_transfer",
            "amount": -float(doc["total_amount"]),
            "reason": f"Minutes transfer {transfer_id}",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        doc["payment_status"] = "paid"
        doc["transfer_status"] = "processing"

    elif payload.payment_method == "crypto_plisio":
        if not settings.get("plisio_api_key"):
            raise HTTPException(status_code=400, detail="Plisio not configured")
        try:
            plisio = PlisioHelper(settings["plisio_api_key"])
            callback_url = _plisio_callback_url()
            success_url = _plisio_success_url("minutes_transfer", transfer_id)
            cancel_url = _plisio_cancel_url("minutes_transfer", transfer_id)
            invoice_response = await plisio.create_invoice(
                amount=float(doc["total_amount"]),
                currency="USDT",
                order_name=f"Minutes Transfer {transfer_id}",
                order_number=transfer_id,
                callback_url=callback_url,
                email=user_email,
                success_url=success_url,
                cancel_url=cancel_url,
            )
            if invoice_response.get("success"):
                doc["plisio_invoice_id"] = invoice_response.get("invoice_id")
                doc["plisio_invoice_url"] = invoice_response.get("invoice_url")
        except Exception as e:
            logging.error(f"Plisio minutes transfer error: {e}")

    else:
        gateways = settings.get("payment_gateways") or {}
        gateway = gateways.get(payload.payment_method) or {}
        if not gateway.get("enabled"):
            raise HTTPException(status_code=400, detail="Payment method not enabled")

    await db.minutes_transfers.insert_one(doc)
    await _notify_admin_telegram(
        "Mobile topup request created",
        [
            f"Transfer ID: {transfer_id}",
            f"User: {user_email}",
            f"Country: {country}",
            f"Phone: {phone}",
            f"Total: ${float(doc['total_amount']):.2f}",
            f"Payment method: {payload.payment_method}",
            f"Payment status: {doc.get('payment_status')}",
        ],
    )

    payment_info = {}
    if payload.payment_method not in ["wallet", "crypto_plisio"]:
        gateways = settings.get("payment_gateways") or {}
        gateway = gateways.get(payload.payment_method) or {}
        if gateway.get("enabled"):
            payment_info = {
                "method": payload.payment_method,
                "email": gateway.get("email", ""),
                "instructions": gateway.get("instructions", ""),
            }
    if settings.get("minutes_transfer_instructions"):
        payment_info["service_instructions"] = settings.get("minutes_transfer_instructions")

    # Ensure all values are JSON-serializable
    try:
        # Convert doc to a clean dict (remove any MongoDB-specific fields)
        clean_doc = {
            "id": doc.get("id"),
            "user_id": doc.get("user_id"),
            "user_email": doc.get("user_email"),
            "country": doc.get("country"),
            "phone_number": doc.get("phone_number"),
            "amount": float(doc.get("amount", 0)),
            "fee_amount": float(doc.get("fee_amount", 0)),
            "total_amount": float(doc.get("total_amount", 0)),
            "payment_method": doc.get("payment_method"),
            "payment_status": doc.get("payment_status"),
            "transfer_status": doc.get("transfer_status"),
            "transaction_id": doc.get("transaction_id"),
            "payment_proof_url": doc.get("payment_proof_url"),
            "plisio_invoice_id": doc.get("plisio_invoice_id"),
            "plisio_invoice_url": doc.get("plisio_invoice_url"),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
        }
        return JSONResponse({
            "transfer": clean_doc,
            "payment_info": payment_info
        })
    except Exception as e:
        logging.error(f"Error serializing minutes transfer response: {e}")
        return JSONResponse({
            "transfer": {
                "id": transfer_id,
                "user_id": user_id,
                "payment_status": doc.get("payment_status", "pending"),
                "transfer_status": doc.get("transfer_status", "pending")
            },
            "payment_info": payment_info
        })


@api_router.get("/minutes/transfers/user/{user_id}")
@api_router.get("/mobile-topup/requests/user/{user_id}")
async def get_user_minutes_transfers(user_id: str):
    transfers = await db.minutes_transfers.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return transfers


@api_router.get("/minutes/transfers/all")
@api_router.get("/mobile-topup/requests/all")
async def get_all_minutes_transfers():
    transfers = await db.minutes_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return transfers


@api_router.post("/minutes/transfers/proof")
@api_router.post("/mobile-topup/requests/proof")
async def submit_minutes_transfer_proof(proof: MinutesTransferProof):
    res = await db.minutes_transfers.update_one(
        {"id": proof.transfer_id},
        {"$set": {
            "transaction_id": proof.transaction_id,
            "payment_proof_url": proof.payment_proof_url,
            "payment_status": "pending_verification",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transfer not found")
    await _notify_admin_telegram(
        "Mobile topup proof submitted",
        [
            f"Transfer ID: {proof.transfer_id}",
            f"Transaction ID: {proof.transaction_id}",
            "Status: pending_verification",
        ],
    )
    return {"message": "Payment proof submitted"}


@api_router.put("/minutes/transfers/{transfer_id}/status")
@api_router.put("/mobile-topup/requests/{transfer_id}/status")
async def update_minutes_transfer_status(transfer_id: str, updates: MinutesTransferStatusUpdate):
    update_data = {}
    if updates.payment_status is not None:
        if updates.payment_status not in ["pending", "pending_verification", "paid", "failed", "rejected", "processing", "cancelled"]:
            raise HTTPException(status_code=400, detail="Invalid payment_status")
        update_data["payment_status"] = updates.payment_status
    if updates.transfer_status is not None:
        if updates.transfer_status not in ["pending", "processing", "completed", "cancelled"]:
            raise HTTPException(status_code=400, detail="Invalid transfer_status")
        update_data["transfer_status"] = updates.transfer_status

    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.minutes_transfers.update_one({"id": transfer_id}, {"$set": update_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transfer not found")
    updated = await db.minutes_transfers.find_one({"id": transfer_id}, {"_id": 0})
    await _notify_admin_telegram(
        "Mobile topup status updated",
        [
            f"Transfer ID: {transfer_id}",
            f"Payment status: {update_data.get('payment_status', 'unchanged')}",
            f"Transfer status: {update_data.get('transfer_status', 'unchanged')}",
        ],
    )
    return updated or {"message": "Updated"}

@api_router.post("/orders/{order_id}/refund")
async def refund_order_to_wallet(order_id: str, adjustment: WalletAdjustment):
    """
    Refund an order to the user's wallet (store credit).
    This is intended for admin use (no auth implemented in this project).
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("refunded_at"):
        raise HTTPException(status_code=400, detail="Order already refunded")

    if float(adjustment.amount) <= 0:
        raise HTTPException(status_code=400, detail="Refund amount must be > 0")

    user_id = order.get("user_id")
    user_email = order.get("user_email")

    # Credit wallet
    await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": float(adjustment.amount)}})
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_email": user_email,
        "order_id": order_id,
        "type": "refund",
        "amount": float(adjustment.amount),
        "reason": adjustment.reason or "Order refund",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Update order
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "order_status": "cancelled",
            "payment_status": "cancelled",
            "refunded_amount": float(adjustment.amount),
            "refunded_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    await _notify_admin_telegram(
        "Order refunded to wallet",
        [
            f"Order ID: {order_id}",
            f"User: {user_email or user_id}",
            f"Amount refunded: ${float(adjustment.amount):.2f}",
            f"Reason: {adjustment.reason or 'Order refund'}",
        ],
    )

    return {"message": "Refunded to wallet", "user_id": user_id, "amount": float(adjustment.amount)}

# Modify order status endpoint to trigger referral check
@api_router.put("/orders/{order_id}/complete")
async def complete_order_with_referral_check(order_id: str):
    """Complete order and check for referral payout"""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update order status
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "order_status": "completed",
            "payment_status": "paid",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    await _record_coupon_usage_if_needed(order_id)
    await _record_product_orders_if_needed(order_id)
    await _set_subscription_dates_if_needed(order_id)
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    try:
        await _maybe_send_subscription_emails(updated or order)
    except Exception as e:
        logging.error(f"Subscription email check error: {e}")
    
    # Check and credit referral
    await check_and_credit_referral(order)

    # Award loyalty credits for successful order
    await _record_loyalty_credits_if_needed(order_id)
    await _notify_admin_telegram(
        "Order completed",
        [
            f"Order ID: {order_id}",
            f"User: {order.get('user_email') or order.get('user_id')}",
        ],
    )
    
    return {"message": "Order completed"}

# ==================== TEMPORARY INTERNAL SEEDING ENDPOINT ====================
# ⚠️  SECURITY WARNING: Remove this endpoint after initial setup!
# This endpoint is for one-time database seeding in Railway deployment

from pydantic import BaseModel
from typing import Dict, Any
import traceback

class SeedRequest(BaseModel):
    secret: str

class SeedResponse(BaseModel):
    success: bool
    message: str
    results: Dict[str, Any]

async def create_admin_internal() -> Dict[str, Any]:
    """Create admin user if doesn't exist, or update existing admin email to Info.kayicom.com@gmx.fr"""
    try:
        new_email = "Info.kayicom.com@gmx.fr"
        default_password = "admin123"

        # 1. Check if the new email already exists
        existing_new = await db.users.find_one({"email": _email_match(new_email)})
        if existing_new:
            return {"status": "skipped", "message": "Admin user with new email already exists", "user_id": str(existing_new.get("_id"))}

        # 2. Check if there's any existing admin user (by role) to update their email
        existing_admin = await db.users.find_one({"role": "admin"})
        if existing_admin:
            old_email = existing_admin.get("email")
            await db.users.update_one({"role": "admin"}, {"$set": {"email": new_email}})
            return {"status": "updated", "message": f"Updated admin email from {old_email} to {new_email} (password unchanged)", "user_id": str(existing_admin.get("_id"))}

        # 3. Create new admin user if none exists
        hashed_password = pwd_context.hash(default_password)

        admin_user = {
            "id": "admin-001",
            "email": new_email,
            "full_name": "Admin User",
            "password": hashed_password,
            "role": "admin",
            "referral_code": "ADMIN001",
            "referral_balance": 0.0,
            "wallet_balance": 0.0,
            "credits_balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        result = await db.users.insert_one(admin_user)
        return {"status": "created", "message": "Admin user created successfully", "user_id": str(result.inserted_id)}

    except Exception as e:
        return {"status": "error", "message": f"Failed to create admin: {str(e)}", "error": traceback.format_exc()}

async def seed_demo_products_internal() -> Dict[str, Any]:
    """Seed demo products if not already seeded"""
    try:
        # Check if products already exist
        existing_count = await db.products.count_documents({})
        if existing_count > 0:
            return {"status": "skipped", "message": f"Products already exist ({existing_count} products found)"}

        DEMO_PRODUCTS = [
            # Gift Cards
            {
                "name": "Amazon Gift Card",
                "description": "Amazon gift card with instant delivery. Valid in selected regions.",
                "category": "giftcard",
                "image_url": "https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?w=400",
                "delivery_type": "manual",
                "requires_player_id": False,
                "variants": [
                    {"region": "US", "value": "$25", "price": 25.00},
                    {"region": "US", "value": "$50", "price": 50.00},
                    {"region": "US", "value": "$100", "price": 100.00},
                ]
            },
            {
                "name": "iTunes Gift Card",
                "description": "Apple iTunes gift card for App Store, Apple Music, and more.",
                "category": "giftcard",
                "image_url": "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400",
                "delivery_type": "manual",
                "requires_player_id": False,
                "variants": [
                    {"region": "US", "value": "$25", "price": 25.00},
                    {"region": "US", "value": "$50", "price": 50.00},
                ]
            },
            # Game Top-ups
            {
                "name": "Free Fire Diamonds",
                "description": "Top up your Free Fire account with diamonds instantly.",
                "category": "topup",
                "image_url": "https://images.unsplash.com/photo-1556438064-2d7646166914?w=400",
                "delivery_type": "automatic",
                "requires_player_id": True,
                "player_id_label": "Free Fire Player ID",
                "variants": [
                    {"value": "100 Diamonds", "price": 5.00},
                    {"value": "310 Diamonds", "price": 15.00},
                    {"value": "520 Diamonds", "price": 25.00},
                    {"value": "1080 Diamonds", "price": 50.00},
                ]
            },
            # Subscriptions
            {
                "name": "Premium Subscription",
                "description": "1 month premium access with all features unlocked.",
                "category": "subscription",
                "image_url": "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400",
                "delivery_type": "automatic",
                "requires_player_id": False,
                "is_subscription": True,
                "variants": [
                    {"duration": "1 Month", "price": 9.99},
                    {"duration": "2 Months", "price": 16.99},
                    {"duration": "3 Months", "price": 24.99},
                    {"duration": "6 Months", "price": 44.99},
                    {"duration": "12 Months", "price": 79.99},
                ]
            },
        ]

        total_added = 0

        for product_group in DEMO_PRODUCTS:
            variants = product_group.pop("variants", [])

            if variants:
                # Create parent product
                parent_id = str(uuid.uuid4())
                parent_product = {
                    **product_group,
                    "id": parent_id,
                    "orders_count": _default_orders_count_for_product({**product_group, "id": parent_id}),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                parent_product = _normalize_product_doc(parent_product)
                await db.products.insert_one(parent_product)

                # Create variant products
                for variant in variants:
                    variant_product = {
                        **product_group,
                        "id": str(uuid.uuid4()),
                        "parent_product_id": parent_id,
                        "variant_name": variant.get("value") or variant.get("duration"),
                        "price": variant["price"],
                        "region": variant.get("region"),
                        "orders_count": 0,
                        "subscription_duration_months": None,  # Will be set if duration
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    variant_product["orders_count"] = _default_orders_count_for_product(variant_product)

                    # Handle duration for subscriptions
                    if "duration" in variant:
                        duration_map = {
                            "1 Month": 1,
                            "2 Months": 2,
                            "3 Months": 3,
                            "6 Months": 6,
                            "12 Months": 12,
                        }
                        variant_product["subscription_duration_months"] = duration_map.get(variant["duration"])

                    variant_product = _normalize_product_doc(variant_product)
                    await db.products.insert_one(variant_product)
                    total_added += 1
            else:
                # Single product without variants
                single_product = {
                    **product_group,
                    "id": str(uuid.uuid4()),
                    "orders_count": 0,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                single_product["orders_count"] = _default_orders_count_for_product(single_product)
                single_product = _normalize_product_doc(single_product)
                await db.products.insert_one(single_product)
                total_added += 1

        return {"status": "created", "message": f"Successfully seeded {total_added} demo products"}

    except Exception as e:
        return {"status": "error", "message": f"Failed to seed products: {str(e)}", "error": traceback.format_exc()}

async def seed_games_internal() -> Dict[str, Any]:
    """Seed game configurations if not already seeded"""
    try:
        # Check if games already exist
        existing_count = await db.games.count_documents({})
        if existing_count > 0:
            return {"status": "skipped", "message": f"Game configurations already exist ({existing_count} games found)"}

        GAMES_CONFIG = [
            {
                "name": "Free Fire",
                "game_id": "freefire",
                "description": "Garena Free Fire battle royale game",
                "image_url": "https://images.unsplash.com/photo-1556438064-2d7646166914?w=400",
                "regions": ["Global"],
                "currencies": ["Diamonds"],
                "is_active": True,
                "api_supported": True,
                "player_id_format": "Player ID",
                "denominations": [
                    {"amount": 100, "price": 5.00, "currency": "Diamonds"},
                    {"amount": 310, "price": 15.00, "currency": "Diamonds"},
                    {"amount": 520, "price": 25.00, "currency": "Diamonds"},
                    {"amount": 1080, "price": 50.00, "currency": "Diamonds"},
                ]
            },
            {
                "name": "Mobile Legends",
                "game_id": "mobilelegends",
                "description": "Mobile Legends: Bang Bang MOBA game",
                "image_url": "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400",
                "regions": ["Global"],
                "currencies": ["Diamonds"],
                "is_active": True,
                "api_supported": True,
                "player_id_format": "User ID",
                "denominations": [
                    {"amount": 100, "price": 5.00, "currency": "Diamonds"},
                    {"amount": 250, "price": 12.00, "currency": "Diamonds"},
                    {"amount": 500, "price": 23.00, "currency": "Diamonds"},
                    {"amount": 1000, "price": 45.00, "currency": "Diamonds"},
                ]
            },
            {
                "name": "PUBG Mobile",
                "game_id": "pubgm",
                "description": "PUBG Mobile battle royale game",
                "image_url": "https://images.unsplash.com/photo-1560419015-7c427e8ae5ba?w=400",
                "regions": ["Global"],
                "currencies": ["UC"],
                "is_active": True,
                "api_supported": True,
                "player_id_format": "Character ID",
                "denominations": [
                    {"amount": 60, "price": 5.00, "currency": "UC"},
                    {"amount": 325, "price": 25.00, "currency": "UC"},
                    {"amount": 660, "price": 50.00, "currency": "UC"},
                    {"amount": 1800, "price": 125.00, "currency": "UC"},
                ]
            }
        ]

        added_games = []
        for game_config in GAMES_CONFIG:
            game_doc = {
                **game_config,
                "id": str(uuid.uuid4()),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.games.insert_one(game_doc)
            added_games.append(game_config["name"])

        return {"status": "created", "message": f"Successfully seeded {len(added_games)} game configurations", "games": added_games}

    except Exception as e:
        return {"status": "error", "message": f"Failed to seed games: {str(e)}", "error": traceback.format_exc()}

@api_router.post("/__internal/seed", response_model=SeedResponse)
async def seed_database(request: SeedRequest):
    """
    TEMPORARY INTERNAL ENDPOINT - Remove after use!
    Seeds the database with admin user, demo products, and game configurations.
    Protected by SEED_SECRET environment variable.
    """
    # Check seed secret
    expected_secret = os.environ.get("SEED_SECRET")
    if not expected_secret:
        raise HTTPException(status_code=500, detail="SEED_SECRET environment variable not configured")

    if request.secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid seed secret")

    try:
        results = {}

        # Run seeding operations
        results["admin_user"] = await create_admin_internal()
        results["demo_products"] = await seed_demo_products_internal()
        results["game_configs"] = await seed_games_internal()

        # Check final state
        final_admin = await db.users.count_documents({"email": _email_match("Info.kayicom.com@gmx.fr")})
        final_products = await db.products.count_documents({})
        final_games = await db.games.count_documents({})

        results["summary"] = {
            "admin_users": final_admin,
            "products": final_products,
            "games": final_games,
            "total_items": final_admin + final_products + final_games
        }

        return SeedResponse(
            success=True,
            message="Database seeding completed successfully",
            results=results
        )

    except Exception as e:
        return SeedResponse(
            success=False,
            message=f"Database seeding failed: {str(e)}",
            results={"error": traceback.format_exc()}
        )

# ==================== END TEMPORARY SEEDING ENDPOINT ====================

# ==================== SITEMAP ====================

@app.get("/sitemap.xml")
async def sitemap_xml():
    """Dynamic sitemap for Google indexing."""
    from starlette.responses import Response
    frontend_url = os.environ.get("FRONTEND_URL", "https://kayicom.com").rstrip("/")
    urls = []
    urls.append(f"  <url><loc>{frontend_url}/</loc><priority>1.0</priority></url>")
    urls.append(f"  <url><loc>{frontend_url}/products</loc><priority>0.9</priority></url>")
    for cat in ("giftcard", "topup", "subscription", "service"):
        urls.append(f"  <url><loc>{frontend_url}/products/{cat}</loc><priority>0.8</priority></url>")
    urls.append(f"  <url><loc>{frontend_url}/blog</loc><priority>0.7</priority></url>")
    try:
        products = await db.products.find(
            {"product_status": {"$in": ["approved", None]}, "seller_id": {"$in": [None, ""]}},
            {"_id": 0, "id": 1, "slug": 1}
        ).to_list(5000)
        for p in products:
            slug = p.get("slug") or p.get("id")
            urls.append(f"  <url><loc>{frontend_url}/product/{slug}</loc><priority>0.7</priority></url>")
    except Exception:
        pass
    try:
        posts = await db.blog_posts.find(
            {"published": True}, {"_id": 0, "slug": 1}
        ).to_list(1000)
        for post in posts:
            if post.get("slug"):
                urls.append(f"  <url><loc>{frontend_url}/blog/{post['slug']}</loc><priority>0.6</priority></url>")
    except Exception:
        pass
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(urls) + "\n"
    xml += '</urlset>'
    return Response(content=xml, media_type="application/xml")


# Include the router (must be after all endpoints are defined)
app.include_router(api_router)

# Custom exception handler to ensure CORS headers on HTTPException errors
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Ensure CORS headers are included in error responses"""
    origin = request.headers.get("origin")
    response = JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )
    _add_cors_headers(response, origin)
    return response

# Custom exception handler for validation errors
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Ensure CORS headers are included in validation error responses"""
    origin = request.headers.get("origin")
    response = JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body}
    )
    _add_cors_headers(response, origin)
    return response

# Health check endpoint for Railway
@app.get("/")
async def root():
    return {"status": "ok", "message": "KayiCom API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

# Endpoint to update admin email (for deployment setup)
@app.post("/setup/update-admin-email")
async def update_admin_email():
    """Update existing admin email to Info.kayicom.com@gmx.fr (keeps password unchanged)"""
    try:
        new_email = "Info.kayicom.com@gmx.fr"
        existing_admin = await db.users.find_one({"role": "admin"})
        
        if not existing_admin:
            return {
                "status": "error",
                "message": "No admin user found. Please create admin first."
            }
        
        # Check if this admin already has the new email
        if (existing_admin.get("email") or "").lower() == new_email.lower():
            return {
                "status": "success",
                "message": f"Admin already has email: {new_email}",
                "email": new_email
            }
        
        # Update admin email
        old_email = existing_admin.get("email")
        admin_id = existing_admin.get("_id")
        
        # Update by _id to be more specific
        await db.users.update_one(
            {"_id": admin_id},
            {"$set": {"email": new_email}}
        )
        
        # Verify the update
        updated = await db.users.find_one({"_id": admin_id})
        
        return {
            "status": "success",
            "message": f"Admin email updated successfully",
            "old_email": old_email,
            "new_email": updated.get("email"),
            "admin_id": str(admin_id),
            "note": "Password remains unchanged. Try logging in with the new email."
        }
        
    except Exception as e:
        logger.error(f"Error updating admin email: {e}")
        return {
            "status": "error",
            "message": f"Failed to update admin email: {str(e)}"
        }

# Endpoint to check admin user status
@app.get("/setup/check-admin")
async def check_admin():
    """Check admin user status and verify password"""
    try:
        admin_email = "Info.kayicom.com@gmx.fr"
        
        # Find admin user
        admin_user = await db.users.find_one({"email": _email_match(admin_email), "role": "admin"})
        
        if not admin_user:
            # Try to find any admin
            admin_user = await db.users.find_one({"role": "admin"})
        
        if not admin_user:
            return {
                "status": "error",
                "message": "No admin user found"
            }
        
        # Check password field
        has_password = "password" in admin_user
        has_password_hash = "password_hash" in admin_user
        password_field = "password" if has_password else ("password_hash" if has_password_hash else None)
        
        # Test password verification
        test_password = "admin123"
        password_valid = False
        if password_field and admin_user.get(password_field):
            try:
                password_valid = pwd_context.verify(test_password, admin_user[password_field])
            except:
                password_valid = False
        
        return {
            "status": "success",
            "admin_found": True,
            "email": admin_user.get("email"),
            "role": admin_user.get("role"),
            "has_password_field": has_password,
            "has_password_hash_field": has_password_hash,
            "password_field_used": password_field,
            "password_valid_for_admin123": password_valid,
            "is_blocked": admin_user.get("is_blocked", False),
            "admin_id": str(admin_user.get("_id"))
        }
        
    except Exception as e:
        logger.error(f"Error checking admin: {e}")
        return {
            "status": "error",
            "message": f"Failed to check admin: {str(e)}"
        }

# Endpoint to reset admin password (for deployment setup)
# Test login endpoint for debugging
# Test password verification with different methods
@app.post("/setup/test-password-verify")
async def test_password_verify():
    """Test password verification with the stored hash"""
    try:
        admin_email = "Info.kayicom.com@gmx.fr"
        test_password = "admin123"
        
        user = await db.users.find_one({"email": _email_match(admin_email), "role": "admin"})
        if not user:
            return {"status": "error", "message": "Admin not found"}
        
        password_value = user.get("password")
        if not password_value:
            return {"status": "error", "message": "No password field found"}
        
        results = {}
        
        # Test 1: passlib verify
        try:
            results["passlib_verify"] = pwd_context.verify(test_password, password_value)
        except Exception as e:
            results["passlib_verify"] = f"Error: {str(e)}"
        
        # Test 2: bcrypt direct
        try:
            import bcrypt
            password_bytes = test_password.encode('utf-8')
            hash_bytes = password_value.encode('utf-8')
            results["bcrypt_direct"] = bcrypt.checkpw(password_bytes, hash_bytes)
        except Exception as e:
            results["bcrypt_direct"] = f"Error: {str(e)}"
        
        # Test 3: Check hash format
        results["hash_format"] = {
            "starts_with_2b": password_value.startswith('$2b$'),
            "starts_with_2a": password_value.startswith('$2a$'),
            "starts_with_2y": password_value.startswith('$2y$'),
            "length": len(password_value),
            "first_30_chars": password_value[:30]
        }
        
        return {
            "status": "success",
            "email": admin_email,
            "test_password": test_password,
            "results": results
        }
        
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc()
        }

# Diagnostic endpoint to check password hash
@app.get("/setup/debug-password")
async def debug_password():
    """Debug password hash and verification"""
    try:
        admin_email = "Info.kayicom.com@gmx.fr"
        test_password = "admin123"
        
        user = await db.users.find_one({"email": _email_match(admin_email), "role": "admin"})
        
        if not user:
            return {"status": "error", "message": "Admin not found"}
        
        password_value = user.get("password")
        password_hash_value = user.get("password_hash")
        
        # Test verification
        password_verify_result = None
        password_hash_verify_result = None
        
        if password_value:
            try:
                password_verify_result = pwd_context.verify(test_password, password_value)
            except Exception as e:
                password_verify_result = f"Error: {str(e)}"
        
        if password_hash_value:
            try:
                password_hash_verify_result = pwd_context.verify(test_password, password_hash_value)
            except Exception as e:
                password_hash_verify_result = f"Error: {str(e)}"
        
        # Generate a fresh hash for comparison
        fresh_hash = pwd_context.hash(test_password)
        fresh_verify = pwd_context.verify(test_password, fresh_hash)
        
        return {
            "status": "success",
            "email": user.get("email"),
            "has_password": bool(password_value),
            "has_password_hash": bool(password_hash_value),
            "password_length": len(password_value) if password_value else 0,
            "password_hash_length": len(password_hash_value) if password_hash_value else 0,
            "password_starts_with": password_value[:10] if password_value else None,
            "password_hash_starts_with": password_hash_value[:10] if password_hash_value else None,
            "password_verify_result": password_verify_result,
            "password_hash_verify_result": password_hash_verify_result,
            "fresh_hash_starts_with": fresh_hash[:10],
            "fresh_hash_verify": fresh_verify,
            "test_password": test_password,
            "note": "If verify fails, the hash might be corrupted"
        }
        
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc()
        }

# Direct login test endpoint
@app.post("/setup/direct-login")
async def direct_login_test():
    """Test the actual login endpoint directly"""
    try:
        from fastapi import Request
        import json
        
        # Simulate the login request
        login_data = {
            "email": "Info.kayicom.com@gmx.fr",
            "password": "admin123"
        }
        
        # Call the actual login endpoint logic
        user = await db.users.find_one({"email": _email_match(login_data["email"])})
        
        if not user:
            return {
                "status": "error",
                "message": "User not found",
                "email": login_data["email"]
            }
        
        if user.get("is_blocked"):
            return {
                "status": "error",
                "message": "Account is blocked"
            }
        
        # Use same logic as login endpoint
        password_field = 'password_hash' if 'password_hash' in user else 'password'
        
        if password_field not in user:
            return {
                "status": "error",
                "message": f"Password field '{password_field}' not found",
                "available_fields": [k for k in user.keys() if 'pass' in k.lower()]
            }
        
        password_valid = pwd_context.verify(login_data["password"], user[password_field])
        
        if not password_valid:
            return {
                "status": "error",
                "message": "Password verification failed",
                "password_field": password_field,
                "password_hash_preview": user[password_field][:30] + "..." if user.get(password_field) else None
            }
        
        return {
            "status": "success",
            "message": "Login would succeed",
            "user_id": user.get("id"),
            "email": user.get("email"),
            "role": user.get("role"),
            "password_field_used": password_field
        }
        
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "message": f"Direct login test failed: {str(e)}",
            "traceback": traceback.format_exc()
        }

@app.post("/setup/test-login")
async def test_login(email: str = "Info.kayicom.com@gmx.fr", password: str = "admin123"):
    """Test login directly to debug issues"""
    try:
        user = await db.users.find_one({"email": _email_match(email)})
        
        if not user:
            return {
                "status": "error",
                "message": f"User not found with email: {email}",
                "step": "user_lookup"
            }
        
        if user.get("is_blocked"):
            return {
                "status": "error",
                "message": "Account is blocked",
                "step": "blocked_check"
            }
        
        # Check both password fields (as booleans)
        has_password = bool('password' in user and user.get('password'))
        has_password_hash = bool('password_hash' in user and user.get('password_hash'))
        
        # Try password_hash first (as login endpoint does)
        password_field = 'password_hash' if has_password_hash else 'password'
        
        password_valid = False
        verification_error = None
        password_hash_value = None
        password_value = None
        
        # Try password_hash first (matching login endpoint logic)
        if has_password_hash:
            password_hash_value = user.get('password_hash')
            try:
                password_valid = pwd_context.verify(password, password_hash_value)
                if password_valid:
                    password_field = 'password_hash'
            except Exception as e:
                verification_error = f"password_hash verify error: {str(e)}"
        
        # If password_hash failed, try password field
        if not password_valid and has_password:
            password_value = user.get('password')
            try:
                password_valid = pwd_context.verify(password, password_value)
                if password_valid:
                    password_field = 'password'
            except Exception as e:
                if not verification_error:
                    verification_error = f"password verify error: {str(e)}"
        
        if not password_valid:
            return {
                "status": "error",
                "message": "Password verification failed",
                "step": "password_verification",
                "password_field_tried": password_field,
                "has_password": has_password,
                "has_password_hash": has_password_hash,
                "password_hash_preview": (password_value[:30] + "...") if password_value else None,
                "password_hash_field_preview": (password_hash_value[:30] + "...") if password_hash_value else None,
                "verification_error": verification_error,
                "note": "Both fields tested, verification failed for both"
            }
        
        return {
            "status": "success",
            "message": "Login test successful",
            "user_id": user.get("id"),
            "email": user.get("email"),
            "role": user.get("role"),
            "password_field_used": password_field
        }
        
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "message": f"Test login failed: {str(e)}",
            "traceback": traceback.format_exc()
        }

@app.post("/setup/reset-admin-password")
async def reset_admin_password():
    """Reset admin password to admin123"""
    try:
        admin_email = "Info.kayicom.com@gmx.fr"
        new_password = "admin123"
        
        # Find admin user
        admin_user = await db.users.find_one({"email": _email_match(admin_email), "role": "admin"})
        
        if not admin_user:
            # Try to find any admin
            admin_user = await db.users.find_one({"role": "admin"})
        
        if not admin_user:
            return {
                "status": "error",
                "message": "No admin user found"
            }
        
        # Hash the new password - generate fresh hash multiple times to ensure it's valid
        hashed_password = pwd_context.hash(new_password)
        
        # Verify the hash works before saving (test multiple times)
        test_verify = pwd_context.verify(new_password, hashed_password)
        if not test_verify:
            # Try generating again
            hashed_password = pwd_context.hash(new_password)
            test_verify = pwd_context.verify(new_password, hashed_password)
            if not test_verify:
                return {
                    "status": "error",
                    "message": "Generated password hash failed verification test - this should never happen"
                }
        
        # Update password - set both fields to the SAME hash in a single operation
        admin_id = admin_user.get("_id")
        
        # Use replace_one to ensure clean update, or update_one with $set
        # Let's use update_one with $set to update both fields
        result = await db.users.update_one(
            {"_id": admin_id},
            {"$set": {
                "password": hashed_password,
                "password_hash": hashed_password
            }}
        )
        
        if result.modified_count == 0 and result.matched_count == 0:
            return {
                "status": "error",
                "message": "Failed to update password - user not found"
            }
        
        # Re-fetch to verify
        updated = await db.users.find_one({"_id": admin_id})
        if not updated:
            return {
                "status": "error",
                "message": "Failed to retrieve updated user"
            }
        
        # Verify both fields exist and work
        password_verified_password = False
        password_verified_hash = False
        password_exists = bool(updated.get("password"))
        password_hash_exists = bool(updated.get("password_hash"))
        
        if password_exists:
            password_verified_password = pwd_context.verify(new_password, updated["password"])
        if password_hash_exists:
            password_verified_hash = pwd_context.verify(new_password, updated["password_hash"])
        
        password_verified = password_verified_password or password_verified_hash
        
        # If password_hash wasn't set, try one more time
        if not password_hash_exists:
            await db.users.update_one(
                {"_id": admin_id},
                {"$set": {"password_hash": hashed_password}}
            )
            # Re-check
            updated = await db.users.find_one({"_id": admin_id})
            if updated.get("password_hash"):
                password_verified_hash = pwd_context.verify(new_password, updated["password_hash"])
                password_verified = password_verified_password or password_verified_hash
        
        return {
            "status": "success",
            "message": "Admin password reset successfully",
            "email": updated.get("email"),
            "new_password": new_password,
            "password_verified": password_verified,
            "password_field_verified": password_verified_password,
            "password_hash_verified": password_verified_hash,
            "note": "You can now login with this password"
        }
        
    except Exception as e:
        logger.error(f"Error resetting admin password: {e}")
        import traceback
        return {
            "status": "error",
            "message": f"Failed to reset password: {str(e)}",
            "traceback": traceback.format_exc()
        }

@app.on_event("startup")
async def startup_background_jobs():
    global _order_auto_cancel_task, _subscription_notification_task
    try:
        updated_blog = await _backfill_blog_post_fields()
        if updated_blog:
            logging.info(f"Backfilled blog fields for {updated_blog} post(s)")
    except Exception as e:
        logging.error(f"Failed to backfill blog fields: {e}")

    try:
        updated = await _backfill_default_orders_count()
        if updated:
            logging.info(f"Backfilled orders_count for {updated} product(s)")
    except Exception as e:
        logging.error(f"Failed to backfill product orders_count defaults: {e}")

    try:
        updated_seo = await _backfill_product_seo_fields()
        if updated_seo:
            logging.info(f"Backfilled SEO fields for {updated_seo} product(s)")
    except Exception as e:
        logging.error(f"Failed to backfill product SEO fields: {e}")

    try:
        updated_slugs = await _backfill_product_slugs()
        if updated_slugs:
            logging.info(f"Backfilled slugs for {updated_slugs} product(s)")
    except Exception as e:
        logging.error(f"Failed to backfill product slugs: {e}")

    try:
        r2 = await db.products.update_many(
            {"seller_id": {"$ne": None}, "product_status": {"$exists": False}},
            {"$set": {"product_status": "pending_review"}},
        )
        if r2.modified_count:
            logging.info(f"Set pending_review on {r2.modified_count} seller product(s) missing status")
    except Exception as e:
        logging.error(f"Failed to set default status on seller products: {e}")

    if _order_auto_cancel_task is not None:
        try:
            task_loop = _order_auto_cancel_task.get_loop()
            if _order_auto_cancel_task.done() or task_loop.is_closed():
                _order_auto_cancel_task = None
        except Exception:
            _order_auto_cancel_task = None

    if _order_auto_cancel_task is None:
        _order_auto_cancel_task = asyncio.create_task(_order_auto_cancel_worker())

    if _subscription_notification_task is not None:
        try:
            task_loop = _subscription_notification_task.get_loop()
            if _subscription_notification_task.done() or task_loop.is_closed():
                _subscription_notification_task = None
        except Exception:
            _subscription_notification_task = None

    if _subscription_notification_task is None:
        _subscription_notification_task = asyncio.create_task(_subscription_notifications_worker())

    global _escrow_release_task
    if _escrow_release_task is None:
        _escrow_release_task = asyncio.create_task(_escrow_release_worker())

    global _dispute_deadline_task
    _dispute_deadline_task = asyncio.create_task(_dispute_deadline_worker())


@app.on_event("shutdown")
async def shutdown_db_client():
    global _order_auto_cancel_task, _subscription_notification_task
    if _order_auto_cancel_task is not None:
        _order_auto_cancel_task.cancel()
        try:
            await _order_auto_cancel_task
        except (asyncio.CancelledError, RuntimeError):
            pass
        _order_auto_cancel_task = None
    if _subscription_notification_task is not None:
        _subscription_notification_task.cancel()
        try:
            await _subscription_notification_task
        except (asyncio.CancelledError, RuntimeError):
            pass
        _subscription_notification_task = None
    client.close()
