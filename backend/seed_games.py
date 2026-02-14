import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
import uuid
from datetime import datetime, timezone
import re

load_dotenv('.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


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

# Popular games with their common top-up amounts and market prices
GAME_PRODUCTS = [
    {
        "name": "Free Fire",
        "description": "Garena Free Fire diamonds top-up. Instant delivery after payment confirmation.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "100 Diamonds", "price": 1.20},
            {"amount": "310 Diamonds", "price": 3.50},
            {"amount": "520 Diamonds", "price": 5.80},
            {"amount": "1060 Diamonds", "price": 11.50},
            {"amount": "2180 Diamonds", "price": 23.00},
            {"amount": "5600 Diamonds", "price": 58.00},
        ]
    },
    {
        "name": "PUBG Mobile",
        "description": "PUBG Mobile UC (Unknown Cash) top-up. Fast and secure delivery.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "60 UC", "price": 0.99},
            {"amount": "325 UC", "price": 4.99},
            {"amount": "660 UC", "price": 9.99},
            {"amount": "1800 UC", "price": 24.99},
            {"amount": "3850 UC", "price": 49.99},
            {"amount": "8100 UC", "price": 99.99},
        ]
    },
    {
        "name": "Mobile Legends",
        "description": "Mobile Legends Bang Bang diamonds. Instant top-up service.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "86 Diamonds", "price": 1.20},
            {"amount": "172 Diamonds", "price": 2.40},
            {"amount": "257 Diamonds", "price": 3.60},
            {"amount": "344 Diamonds", "price": 4.80},
            {"amount": "429 Diamonds", "price": 6.00},
            {"amount": "706 Diamonds", "price": 9.90},
            {"amount": "1412 Diamonds", "price": 19.80},
            {"amount": "2195 Diamonds", "price": 29.90},
            {"amount": "3688 Diamonds", "price": 49.90},
            {"amount": "5532 Diamonds", "price": 74.90},
        ]
    },
    {
        "name": "Call of Duty Mobile",
        "description": "COD Mobile CP (COD Points) top-up. Official and instant delivery.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "80 CP", "price": 0.99},
            {"amount": "400 CP", "price": 4.99},
            {"amount": "800 CP", "price": 9.99},
            {"amount": "2000 CP", "price": 24.99},
            {"amount": "4000 CP", "price": 49.99},
            {"amount": "10000 CP", "price": 99.99},
        ]
    },
    {
        "name": "Genshin Impact",
        "description": "Genshin Impact Genesis Crystals. Secure and fast top-up.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "60 Genesis Crystals", "price": 0.99},
            {"amount": "300 Genesis Crystals", "price": 4.99},
            {"amount": "980 Genesis Crystals", "price": 14.99},
            {"amount": "1980 Genesis Crystals", "price": 29.99},
            {"amount": "3280 Genesis Crystals", "price": 49.99},
            {"amount": "6480 Genesis Crystals", "price": 99.99},
        ]
    },
    {
        "name": "Roblox",
        "description": "Roblox Robux top-up. Instant delivery to your account.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "400 Robux", "price": 4.99},
            {"amount": "800 Robux", "price": 9.99},
            {"amount": "1700 Robux", "price": 19.99},
            {"amount": "4500 Robux", "price": 49.99},
            {"amount": "10000 Robux", "price": 99.99},
        ]
    },
    {
        "name": "Brawl Stars",
        "description": "Brawl Stars Gems. Fast and reliable top-up service.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "30 Gems", "price": 1.99},
            {"amount": "80 Gems", "price": 4.99},
            {"amount": "170 Gems", "price": 9.99},
            {"amount": "360 Gems", "price": 19.99},
            {"amount": "950 Gems", "price": 49.99},
            {"amount": "2000 Gems", "price": 99.99},
        ]
    },
    {
        "name": "Clash of Clans",
        "description": "Clash of Clans Gems top-up. Secure payment and instant delivery.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "80 Gems", "price": 0.99},
            {"amount": "500 Gems", "price": 4.99},
            {"amount": "1200 Gems", "price": 9.99},
            {"amount": "2500 Gems", "price": 19.99},
            {"amount": "6500 Gems", "price": 49.99},
            {"amount": "14000 Gems", "price": 99.99},
        ]
    },
    {
        "name": "Garena Shells",
        "description": "Garena Shells for all Garena games. Universal currency top-up.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "33 Shells", "price": 1.00},
            {"amount": "66 Shells", "price": 2.00},
            {"amount": "165 Shells", "price": 5.00},
            {"amount": "330 Shells", "price": 10.00},
            {"amount": "660 Shells", "price": 20.00},
            {"amount": "1650 Shells", "price": 50.00},
        ]
    },
    {
        "name": "Arena of Valor",
        "description": "Arena of Valor Vouchers top-up. Quick and easy service.",
        "category": "topup",
        "image_url": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400",
        "requires_player_id": True,
        "variants": [
            {"amount": "60 Vouchers", "price": 0.99},
            {"amount": "300 Vouchers", "price": 4.99},
            {"amount": "600 Vouchers", "price": 9.99},
            {"amount": "1500 Vouchers", "price": 24.99},
            {"amount": "3000 Vouchers", "price": 49.99},
        ]
    },
]

async def seed_games():
    print("Starting to seed game products...\n")
    
    # Clear existing topup products (optional - comment out if you want to keep existing)
    # await db.products.delete_many({"category": "topup"})
    # print("Cleared existing topup products\n")
    
    total_added = 0
    
    for game in GAME_PRODUCTS:
        parent_id = str(uuid.uuid4())
        game_name = game["name"]
        
        print(f"Adding {game_name}...")
        
        for variant in game["variants"]:
            product = {
                "id": str(uuid.uuid4()),
                "name": f"{game_name} - {variant['amount']}",
                "description": game["description"],
                "category": game["category"],
                "price": variant["price"],
                "currency": "USD",
                "image_url": game["image_url"],
                "stock_available": True,
                "delivery_type": "manual",  # Admin will deliver codes/credentials
                "subscription_duration_months": None,
                "subscription_auto_check": False,
                "variant_name": variant["amount"],
                "parent_product_id": parent_id,
                "requires_player_id": game["requires_player_id"],
                "metadata": {
                    "game_name": game_name,
                    "amount": variant["amount"]
                },
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            product = _apply_seo_fields(product)
            
            await db.products.insert_one(product)
            total_added += 1
        
        print(f"  ✓ Added {len(game['variants'])} variants for {game_name}")
    
    print(f"\n✅ Successfully added {total_added} game products!")
    print(f"📊 Total games: {len(GAME_PRODUCTS)}")

if __name__ == "__main__":
    asyncio.run(seed_games())
