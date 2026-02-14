import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
import uuid
import hashlib
from datetime import datetime, timezone
import re

load_dotenv('.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

DURATION_MONTHS_MAP = {
    "1 Month": 1,
    "2 Months": 2,
    "3 Months": 3,
    "6 Months": 6,
    "12 Months": 12,
    "1 Year": 12,
}

DEFAULT_SUBSCRIPTION_BASE = 1200
DEFAULT_SUBSCRIPTION_SPAN = 700
DEFAULT_CATEGORY_BASE = {
    "giftcard": 1300,
    "topup": 1250,
    "service": 1180,
    "default": 1120,
}
DEFAULT_CATEGORY_SPAN = 750


def _stable_bucket(value: str, size: int) -> int:
    if size <= 0:
        return 0
    digest = hashlib.sha256((value or "default").encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % size


def _default_orders_count(product: dict) -> int:
    name = str(product.get("name") or "").lower()
    category = str(product.get("category") or "").lower()
    seed = "|".join([
        str(product.get("id") or ""),
        str(product.get("parent_product_id") or ""),
        str(product.get("variant_name") or ""),
        name,
        category,
    ])
    if "netflix" in name and category == "subscription":
        return 1568
    if category == "subscription":
        return DEFAULT_SUBSCRIPTION_BASE + _stable_bucket(seed, DEFAULT_SUBSCRIPTION_SPAN)
    base = DEFAULT_CATEGORY_BASE.get(category) or DEFAULT_CATEGORY_BASE["default"]
    return base + _stable_bucket(seed, DEFAULT_CATEGORY_SPAN)


def _strip_html(value: str) -> str:
    text = str(value or "")
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _truncate_text(value: str, limit: int) -> str:
    clean = _strip_html(value)
    if len(clean) <= limit:
        return clean
    return clean[: max(0, limit - 3)].rstrip() + "..."


def _apply_seo_fields(product: dict) -> dict:
    name = _strip_html(product.get("name") or "Digital Product")
    description = _strip_html(product.get("description") or "")
    product["seo_title"] = _truncate_text(f"{name} | KayiCom", 70)
    product["seo_description"] = _truncate_text(
        description or f"Buy {name} securely on KayiCom.",
        160,
    )
    return product

DEMO_PRODUCTS = [
    # GIFT CARDS
    {
        "name": "Amazon Gift Card",
        "description": "Amazon gift card with instant delivery. Valid in selected regions.",
        "category": "giftcard",
        "giftcard_category": "Shopping",
        "image_url": "https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?w=400",
        "delivery_type": "manual",
        "requires_player_id": False,
        "variants": [
            {"region": "US", "value": "$25", "price": 25.00},
            {"region": "US", "value": "$50", "price": 50.00},
            {"region": "US", "value": "$100", "price": 100.00},
            {"region": "EU", "value": "€25", "price": 28.00},
            {"region": "EU", "value": "€50", "price": 55.00},
        ]
    },
    {
        "name": "iTunes Gift Card",
        "description": "Apple iTunes gift card for App Store, Apple Music, and more.",
        "category": "giftcard",
        "giftcard_category": "Entertainment",
        "image_url": "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400",
        "delivery_type": "manual",
        "requires_player_id": False,
        "variants": [
            {"region": "US", "value": "$15", "price": 15.00},
            {"region": "US", "value": "$25", "price": 25.00},
            {"region": "US", "value": "$50", "price": 50.00},
            {"region": "UK", "value": "£15", "price": 19.00},
            {"region": "UK", "value": "£25", "price": 31.00},
        ]
    },
    {
        "name": "Google Play Gift Card",
        "description": "Google Play gift card for apps, games, and digital content.",
        "category": "giftcard",
        "giftcard_category": "Gaming",
        "image_url": "https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=400",
        "delivery_type": "manual",
        "requires_player_id": False,
        "variants": [
            {"region": "US", "value": "$10", "price": 10.00},
            {"region": "US", "value": "$25", "price": 25.00},
            {"region": "US", "value": "$50", "price": 50.00},
            {"region": "ASIA", "value": "$15", "price": 15.00},
            {"region": "ASIA", "value": "$30", "price": 30.00},
        ]
    },
    
    # SUBSCRIPTIONS (is_subscription=True for referral tracking)
    {
        "name": "Premium Subscription - Basic",
        "description": "1 month premium access. Includes priority support and exclusive features.",
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
    {
        "name": "Premium Subscription - Pro",
        "description": "Professional tier with advanced features and dedicated support.",
        "category": "subscription",
        "image_url": "https://images.unsplash.com/photo-1579621970588-a35d0e7ab9b6?w=400",
        "delivery_type": "automatic",
        "requires_player_id": False,
        "is_subscription": True,
        "variants": [
            {"duration": "1 Month", "price": 19.99},
            {"duration": "2 Months", "price": 34.99},
            {"duration": "3 Months", "price": 49.99},
            {"duration": "6 Months", "price": 89.99},
            {"duration": "12 Months", "price": 149.99},
        ]
    },
]

async def seed_demo():
    print("Adding demo gift cards and subscriptions...\n")
    
    total_added = 0
    
    for product_group in DEMO_PRODUCTS:
        parent_id = str(uuid.uuid4())
        product_name = product_group["name"]
        
        print(f"Adding {product_name}...")
        
        for variant in product_group["variants"]:
            if "region" in variant:
                # Gift card
                variant_name = f"{variant['region']} - {variant['value']}"
                region = variant['region']
                duration_months = None
            else:
                # Subscription
                variant_name = variant['duration']
                region = None
                duration_months = DURATION_MONTHS_MAP.get(variant_name)
            
            product = {
                "id": str(uuid.uuid4()),
                "name": f"{product_name} ({variant_name})",
                "description": product_group["description"],
                "category": product_group["category"],
                "price": variant["price"],
                "currency": "USD",
                "image_url": product_group["image_url"],
                "stock_available": True,
                "delivery_type": product_group["delivery_type"],
                "subscription_duration_months": duration_months,
                "subscription_auto_check": False,
                "variant_name": variant_name,
                "parent_product_id": parent_id,
                "requires_player_id": product_group["requires_player_id"],
                "region": region,
                "giftcard_category": product_group.get("giftcard_category"),
                "is_subscription": product_group.get("is_subscription", False),
                "orders_count": 0,
                "metadata": {
                    "product_type": product_group["category"]
                },
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            product["orders_count"] = _default_orders_count(product)
            product = _apply_seo_fields(product)
            
            await db.products.insert_one(product)
            total_added += 1
        
        print(f"  ✓ Added {len(product_group['variants'])} variants")
    
    print(f"\n✅ Successfully added {total_added} demo products!")

if __name__ == "__main__":
    asyncio.run(seed_demo())
