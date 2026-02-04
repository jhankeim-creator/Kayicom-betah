from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request

from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import secrets
import math
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
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
    role: str = "customer"  # customer or admin
    referral_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8].upper())
    referred_by: Optional[str] = None  # referral_code of referrer
    referral_balance: float = 0.0  # Balance from referrals
    wallet_balance: float = 0.0  # Store credit / refunds
    credits_balance: int = 0  # Loyalty credits (1000 credits = $1)
    is_blocked: bool = False
    blocked_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None
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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=6)


def _email_match(value: str) -> Dict[str, Any]:
    """Build a case-insensitive exact match filter for emails."""
    normalized = value.strip()
    return {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}

# Product Models
class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    category: str  # giftcard, topup, subscription, service, crypto
    price: float
    currency: str = "USD"
    image_url: Optional[str] = None
    stock_available: bool = True
    delivery_type: str = "automatic"  # automatic or manual
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
    is_subscription: bool = False  # Track if this triggers referral payout
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
    is_subscription: bool = False
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
    is_subscription: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None

# Order Models
class OrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    player_id: Optional[str] = None  # For topup products
    credentials: Optional[Dict[str, str]] = None  # For subscription/services (email/password, etc)

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
    payment_method: str  # wallet, crypto_plisio, paypal, skrill, moncash, binance_pay, zelle, cashapp
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
    active: bool = True
    min_order_amount: float = 0.0
    usage_limit: Optional[int] = None
    used_count: int = 0
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CouponCreate(BaseModel):
    code: str
    discount_type: str  # percent or fixed
    discount_value: float
    active: bool = True
    min_order_amount: float = 0.0
    usage_limit: Optional[int] = None
    expires_at: Optional[datetime] = None

class CouponUpdate(BaseModel):
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    active: Optional[bool] = None
    min_order_amount: Optional[float] = None
    usage_limit: Optional[int] = None
    expires_at: Optional[datetime] = None

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
    mtcgame_api_key: Optional[str] = None
    gosplit_api_key: Optional[str] = None
    z2u_api_key: Optional[str] = None
    resend_api_key: Optional[str] = None
    resend_from_email: Optional[str] = None  # e.g. "KayiCom <no-reply@yourdomain.com>"
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
        "binance_pay": {"enabled": True, "email": "", "instructions": ""},
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
    mtcgame_api_key: Optional[str] = None
    gosplit_api_key: Optional[str] = None
    z2u_api_key: Optional[str] = None
    resend_api_key: Optional[str] = None
    resend_from_email: Optional[str] = None
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

# Bulk Email Model
class BulkEmailRequest(BaseModel):
    subject: str
    message: str
    recipient_type: str  # all, customers, specific_emails
    specific_emails: Optional[List[EmailStr]] = None


# ==================== EMAIL HELPERS ====================

def _frontend_base_url() -> str:
    return os.environ.get("FRONTEND_URL", "https://kayicom.com").rstrip("/")


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

async def _maybe_send_subscription_emails(order: dict):
    """Send reminder emails (5 days before + at expiry) once per order."""
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
        "is_blocked": bool(user.get("is_blocked", False))
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
        query: Dict[str, Any] = {}
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
                ]

        products = await db.products.find(query, {"_id": 0}).to_list(1000)

        validated_products: List[Dict[str, Any]] = []
        for product in products:
            try:
                created_at = product.get("created_at", datetime.now(timezone.utc))
                if isinstance(created_at, str):
                    created_at = datetime.fromisoformat(created_at)

                validated_product = {
                    "id": product.get("id", ""),
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
                    "metadata": product.get("metadata", {}),
                    "created_at": created_at,
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
        raise HTTPException(status_code=404, detail="Product not found")
    
    if isinstance(product.get('created_at'), str):
        product['created_at'] = datetime.fromisoformat(product['created_at'])
    return product

@api_router.post("/products", response_model=Product)
async def create_product(product_data: ProductCreate):
    product = Product(**product_data.model_dump())
    doc = product.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.products.insert_one(doc)
    return product

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, updates: ProductUpdate):
    existing = await db.products.find_one({"id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    
    if update_data:
        await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return updated

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted successfully"}


# ==================== COUPON ENDPOINTS ====================

def _normalize_coupon_code(code: str) -> str:
    return (code or "").strip().upper()

async def _get_valid_coupon(code: str, order_amount: float) -> Optional[dict]:
    """Return coupon doc if valid for given amount, else None."""
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
    return coupon

def _calculate_discount(coupon: dict, subtotal: float) -> float:
    discount_type = coupon.get("discount_type")
    value = float(coupon.get("discount_value", 0.0))
    if value <= 0:
        return 0.0
    if discount_type == "percent":
        return max(0.0, min(subtotal, subtotal * (value / 100.0)))
    if discount_type == "fixed":
        return max(0.0, min(subtotal, value))
    return 0.0

async def _record_coupon_usage_if_needed(order_id: str):
    """Increment coupon usage once per paid order."""
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
        # Still mark recorded to avoid retry loops
        await db.orders.update_one({"id": order_id}, {"$set": {"coupon_usage_recorded": True}})
        return

    usage_limit = coupon.get("usage_limit")
    if usage_limit is not None and int(coupon.get("used_count", 0)) >= int(usage_limit):
        # Coupon exhausted; keep order as-is but mark recorded to avoid retry loops
        await db.orders.update_one({"id": order_id}, {"$set": {"coupon_usage_recorded": True}})
        return

    await db.coupons.update_one({"code": code}, {"$inc": {"used_count": 1}})
    await db.orders.update_one({"id": order_id}, {"$set": {"coupon_usage_recorded": True}})


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
async def validate_coupon(code: str, amount: float):
    coupon = await _get_valid_coupon(code, amount)
    if not coupon:
        raise HTTPException(status_code=400, detail="Invalid coupon")
    discount = _calculate_discount(coupon, float(amount))
    return {
        "code": coupon["code"],
        "discount_amount": discount,
        "total_after_discount": float(amount) - discount
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
        active=bool(data.active),
        min_order_amount=float(data.min_order_amount or 0.0),
        usage_limit=data.usage_limit,
        expires_at=data.expires_at,
    )
    doc = coupon.model_dump()
    doc["created_at"] = coupon.created_at.isoformat()
    if coupon.expires_at:
        doc["expires_at"] = coupon.expires_at.isoformat()
    await db.coupons.insert_one(doc)
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
    return updated

@api_router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str):
    res = await db.coupons.delete_one({"id": coupon_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return {"message": "Coupon deleted"}

# ==================== ORDER ENDPOINTS ====================

@api_router.post("/orders", response_model=Order)
async def create_order(order_data: OrderCreate, user_id: str, user_email: str):
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

        validated_items.append(
            OrderItem(
                product_id=product["id"],
                product_name=product.get("name", item.product_name),
                quantity=quantity,
                price=price,
                player_id=item.player_id,
                credentials=item.credentials,
            )
        )
    
    # Apply coupon (if any)
    coupon_code = _normalize_coupon_code(order_data.coupon_code) if order_data.coupon_code else None
    discount_amount = 0.0
    if coupon_code:
        coupon = await _get_valid_coupon(coupon_code, subtotal)
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
                
                # Create Plisio invoice for USDT payment
                invoice_response = await plisio.create_invoice(
                    amount=total,
                    currency="USDT",
                    order_name=f"Order {order.id}",
                    order_number=order.id,
                    email=user_email
                )
                
                if invoice_response.get("success"):
                    order.plisio_invoice_id = invoice_response.get("invoice_id")
                    order.plisio_invoice_url = invoice_response.get("invoice_url")
            except Exception as e:
                logging.error(f"Plisio error: {e}")
    
    doc = order.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.orders.insert_one(doc)
    return order

@api_router.get("/orders", response_model=List[Order])
async def get_orders(user_id: Optional[str] = None):
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
    
    return {"message": "Order updated successfully"}

# Delivery Management Models
class DeliveryItem(BaseModel):
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    quantity: Optional[int] = None
    details: str


class DeliveryInfo(BaseModel):
    delivery_details: Optional[str] = None  # Credentials, codes, or instructions
    items: Optional[List[DeliveryItem]] = None

@api_router.put("/orders/{order_id}/delivery")
async def update_order_delivery(order_id: str, delivery_info: DeliveryInfo):
    """Update order with delivery information and mark as completed"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

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

    # Set subscription dates if this order is a subscription
    order = await _set_subscription_dates_if_needed(order_id)
    if not order:
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})

    # Award loyalty credits once order is completed+paid
    await _record_loyalty_credits_if_needed(order_id)

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
    for secret_field in ["plisio_api_key", "mtcgame_api_key", "gosplit_api_key", "z2u_api_key", "resend_api_key"]:
        if secret_field in settings:
            settings[secret_field] = None
    return settings

@api_router.put("/settings", response_model=SiteSettings)
async def update_settings(updates: SettingsUpdate):
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
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
    return settings


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

    return {
        "message": f"Bulk email sent to {sent_count} recipients",
        "sent_count": sent_count,
        "failed_count": len(failed),
        "failed": failed[:20],
        "recipients_preview": recipients[:10] if len(recipients) > 10 else recipients
    }

# ==================== STATS ENDPOINTS ====================

@api_router.post("/subscriptions/run-notifications")
async def run_subscription_notifications():
    """
    Run subscription reminder checks for all paid+completed subscription orders.
    Safe to call from a cron job.
    """
    now = datetime.now(timezone.utc)
    # Find orders with subscription_end_date set
    orders = await db.orders.find(
        {"subscription_end_date": {"$ne": None}, "payment_status": "paid", "order_status": "completed"},
        {"_id": 0}
    ).to_list(5000)

    processed = 0
    for order in orders:
        try:
            # Ensure dates exist (and parseable)
            await _maybe_send_subscription_emails(order)
            processed += 1
        except Exception as e:
            logging.error(f"Subscription notification error for {order.get('id')}: {e}")

    return {"processed": processed, "timestamp": now.isoformat()}

@api_router.get("/stats/dashboard")
async def get_dashboard_stats():
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
    
    # If rejected, refund balance
    if status == 'rejected' and withdrawal['status'] == 'pending':
        await db.users.update_one(
            {"id": withdrawal['user_id']},
            {"$inc": {"referral_balance": withdrawal['amount']}}
        )
    
    await db.withdrawals.update_one({"id": withdrawal_id}, {"$set": updates})
    
    return {"message": f"Withdrawal {status}"}

# ==================== CRYPTO ENDPOINTS ====================

@api_router.get("/crypto/config")
async def get_crypto_config():
    """Get crypto exchange rates and config"""
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
    config['buy_rate_usdt'] = _safe_float(
        config.get('buy_rate_bep20', config.get('buy_rate_usdt', crypto_settings.get('buy_rate_usdt'))),
        1.02
    )
    config['sell_rate_usdt'] = _safe_float(
        config.get('sell_rate_bep20', config.get('sell_rate_usdt', crypto_settings.get('sell_rate_usdt'))),
        0.98
    )
    config['transaction_fee_percent'] = _safe_float(
        config.get('buy_fee_percent', config.get('transaction_fee_percent', crypto_settings.get('transaction_fee_percent'))),
        2.0
    )
    config['min_transaction_usd'] = _safe_float(
        config.get('min_buy_usd', config.get('min_transaction_usd', crypto_settings.get('min_transaction_usd'))),
        10.0
    )
    
    return config

@api_router.put("/crypto/config")
async def update_crypto_config(updates: Dict[str, Any]):
    """Admin: Update crypto config"""
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
    min_usd = _safe_float(
        config.get('min_buy_usd', config.get('min_transaction_usd', crypto_settings.get('min_transaction_usd'))),
        10.0
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
    exchange_rate = _safe_float(
        config.get(rate_key, config.get("buy_rate_usdt", crypto_settings.get("buy_rate_usdt"))),
        1.02
    )
    
    # Calculate
    amount_crypto = request.amount_usd / exchange_rate
    fee_percent = _safe_float(
        config.get('buy_fee_percent', config.get('transaction_fee_percent', crypto_settings.get('transaction_fee_percent'))),
        2.0
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
    exchange_rate = _safe_float(
        config.get(rate_key, config.get("sell_rate_usdt", crypto_settings.get("sell_rate_usdt"))),
        0.98
    )
    
    # Calculate
    amount_usd = request.amount_crypto * exchange_rate
    fee_percent = _safe_float(
        config.get('sell_fee_percent', config.get('transaction_fee_percent', crypto_settings.get('transaction_fee_percent'))),
        2.0
    )
    fee = amount_usd * (fee_percent / 100)
    total_usd = amount_usd - fee
    
    transaction_id = str(uuid.uuid4())
    invoice_id = f"INV-{transaction_id[:8].upper()}"

    # Determine fallback wallet from settings/config
    wallets = (crypto_settings.get("wallets") or {}) if isinstance(crypto_settings, dict) else {}
    manual_wallet = wallets.get(chain)
    if not manual_wallet:
        fallback_key = f"wallet_{chain.lower()}"
        manual_wallet = config.get(fallback_key)

    processing_mode = "manual"
    wallet_address = None
    invoice_url = None
    qr_code = None
    plisio_invoice_id = None
    processing_warning = None

    if settings and settings.get('plisio_api_key'):
        callback_url = _plisio_callback_url()
        if not callback_url:
            processing_warning = "Automatic processing unavailable: BACKEND_URL not configured"
        else:
            plisio_helper = PlisioHelper(settings['plisio_api_key'])
            plisio_result = await plisio_helper.create_invoice(
                amount=request.amount_crypto,
                currency="USDT",
                order_name="Sell USDT Order",
                order_number=transaction_id,
                callback_url=callback_url,
                email=user_email,
                source_currency=None,
                source_amount=None
            )

            if plisio_result.get("success"):
                processing_mode = "automatic"
                wallet_address = plisio_result.get("wallet_address")
                invoice_url = plisio_result.get("invoice_url")
                qr_code = plisio_result.get("qr_code")
                plisio_invoice_id = plisio_result.get("invoice_id")
            else:
                processing_warning = f"Automatic processing unavailable: {plisio_result.get('error')}"
    else:
        processing_warning = "Automatic processing unavailable: Plisio not configured"

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
        "qr_code": qr_code,
        "processing_mode": processing_mode,
        "warning": processing_warning
    }

    return response

@api_router.get("/crypto/transactions/user/{user_id}")
async def get_user_crypto_transactions(user_id: str):
    """Get user's crypto transactions"""
    transactions = await db.crypto_transactions.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return transactions


@api_router.post("/crypto/transactions/{transaction_id}/proof")
async def submit_crypto_payment_proof(transaction_id: str, payload: CryptoProofRequest):
    """Attach payment proof/tx id for a pending crypto transaction."""
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


# File Upload Endpoint
@api_router.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    """Upload image and return base64 data URL"""
    try:
        # Read file content
        contents = await file.read()
        
        # Get mime type
        mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or 'image/jpeg'
        
        # Convert to base64
        base64_data = base64.b64encode(contents).decode('utf-8')
        data_url = f"data:{mime_type};base64,{base64_data}"
        
        return {"url": data_url, "filename": file.filename}
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
            invoice_response = await plisio.create_invoice(
                amount=float(topup.amount),
                currency="USDT",
                order_name=f"Wallet Topup {topup_id}",
                order_number=topup_id,
                email=user_email,
            )
            if invoice_response.get("success"):
                doc["plisio_invoice_id"] = invoice_response.get("invoice_id")
                doc["plisio_invoice_url"] = invoice_response.get("invoice_url")
        except Exception as e:
            logging.error(f"Plisio topup error: {e}")

    await db.wallet_topups.insert_one(doc)

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
            invoice_response = await plisio.create_invoice(
                amount=float(doc["total_amount"]),
                currency="USDT",
                order_name=f"Minutes Transfer {transfer_id}",
                order_number=transfer_id,
                email=user_email,
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
        # Return minimal response if serialization fails
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
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
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
                        "subscription_duration_months": None,  # Will be set if duration
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }

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

                    await db.products.insert_one(variant_product)
                    total_added += 1
            else:
                # Single product without variants
                single_product = {
                    **product_group,
                    "id": str(uuid.uuid4()),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
