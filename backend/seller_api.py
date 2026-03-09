"""
Seller / Multi-Vendor Marketplace API
Collections: sellers, offers, seller_orders, messages, seller_withdrawals
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

seller_router = APIRouter(prefix="/api/seller")
admin_seller_router = APIRouter(prefix="/api/admin/sellers")

# Will be set from server.py
db = None
pwd_context = None


def init(database, password_context):
    global db, pwd_context
    db = database
    pwd_context = password_context


# ==================== MODELS ====================

class Seller(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    email: str
    full_name: str
    shop_name: Optional[str] = None
    bio: Optional[str] = None
    status: str = "pending"  # pending, approved, rejected, suspended
    approved_at: Optional[str] = None
    balance: float = 0.0
    total_earnings: float = 0.0
    total_sales: int = 0
    rating: float = 0.0
    rating_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SellerRegister(BaseModel):
    shop_name: Optional[str] = None
    bio: Optional[str] = None


class Offer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    seller_id: str
    seller_name: str
    product_id: str
    product_name: str
    category: str
    title: str
    description: str
    price: float
    currency: str = "USD"
    stock_quantity: int = 1
    delivery_type: str = "manual"  # automatic or manual
    delivery_codes: Optional[List[str]] = None
    image_url: Optional[str] = None
    status: str = "pending"  # pending, approved, rejected, paused
    approved_at: Optional[str] = None
    orders_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OfferCreate(BaseModel):
    product_id: str
    category: str
    title: str
    description: str
    price: float
    stock_quantity: int = 1
    delivery_type: str = "manual"
    delivery_codes: Optional[List[str]] = None
    image_url: Optional[str] = None


class OfferUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    stock_quantity: Optional[int] = None
    delivery_type: Optional[str] = None
    delivery_codes: Optional[List[str]] = None
    image_url: Optional[str] = None
    status: Optional[str] = None


class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    sender_id: str
    sender_name: str
    sender_role: str  # customer, seller
    receiver_id: str
    offer_id: Optional[str] = None
    order_id: Optional[str] = None
    text: str
    read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MessageSend(BaseModel):
    receiver_id: str
    offer_id: Optional[str] = None
    order_id: Optional[str] = None
    text: str


class SellerWithdrawalRequest(BaseModel):
    amount: float
    payment_method: str
    payment_details: str


# ==================== SELLER REGISTRATION & PROFILE ====================

@seller_router.post("/register")
async def register_as_seller(data: SellerRegister, user_id: str = "", user_email: str = ""):
    if not user_id or not user_email:
        raise HTTPException(status_code=400, detail="User authentication required")

    existing = await db.sellers.find_one({"user_id": user_id})
    if existing:
        if existing.get("status") == "approved":
            return {"status": "already_approved", "seller": existing}
        if existing.get("status") == "pending":
            return {"status": "pending", "message": "Your seller application is pending review"}
        if existing.get("status") == "rejected":
            await db.sellers.update_one(
                {"user_id": user_id},
                {"$set": {"status": "pending", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            return {"status": "resubmitted", "message": "Application resubmitted for review"}

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    seller = Seller(
        user_id=user_id,
        email=user_email,
        full_name=user.get("full_name", ""),
        shop_name=data.shop_name or user.get("full_name", "Shop"),
        bio=data.bio or "",
    )

    await db.sellers.insert_one(seller.model_dump())
    await db.users.update_one({"id": user_id}, {"$set": {"seller_status": "pending"}})

    return {"status": "submitted", "message": "Seller application submitted! Awaiting admin approval.", "seller_id": seller.id}


@seller_router.get("/profile")
async def get_seller_profile(user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        return {"status": "not_seller", "seller": None}
    return {"status": seller.get("status", "pending"), "seller": seller}


@seller_router.put("/profile")
async def update_seller_profile(user_id: str = "", shop_name: Optional[str] = None, bio: Optional[str] = None):
    seller = await db.sellers.find_one({"user_id": user_id})
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    updates = {}
    if shop_name is not None:
        updates["shop_name"] = shop_name
    if bio is not None:
        updates["bio"] = bio
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.sellers.update_one({"user_id": user_id}, {"$set": updates})
    return {"status": "updated"}


# ==================== OFFERS ====================

@seller_router.post("/offers")
async def create_offer(data: OfferCreate, user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller or seller.get("status") != "approved":
        raise HTTPException(status_code=403, detail="You must be an approved seller")

    product = await db.products.find_one({"id": data.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    offer = Offer(
        seller_id=seller["id"],
        seller_name=seller.get("shop_name", seller.get("full_name", "")),
        product_id=data.product_id,
        product_name=product.get("name", ""),
        category=data.category,
        title=data.title,
        description=data.description,
        price=data.price,
        stock_quantity=data.stock_quantity,
        delivery_type=data.delivery_type,
        delivery_codes=data.delivery_codes,
        image_url=data.image_url or product.get("image_url"),
    )

    await db.offers.insert_one(offer.model_dump())
    return offer.model_dump()


@seller_router.get("/offers")
async def get_seller_offers(user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")
    offers = await db.offers.find({"seller_id": seller["id"]}, {"_id": 0, "delivery_codes": 0}).sort("created_at", -1).to_list(500)
    return offers


@seller_router.put("/offers/{offer_id}")
async def update_offer(offer_id: str, data: OfferUpdate, user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")

    offer = await db.offers.find_one({"id": offer_id, "seller_id": seller["id"]})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in ("paused",):
        del updates["status"]
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.offers.update_one({"id": offer_id}, {"$set": updates})

    return {"status": "updated"}


@seller_router.delete("/offers/{offer_id}")
async def delete_offer(offer_id: str, user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")

    result = await db.offers.delete_one({"id": offer_id, "seller_id": seller["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Offer not found")
    return {"status": "deleted"}


# ==================== PUBLIC OFFERS (for customers) ====================

@seller_router.get("/public/offers")
async def get_public_offers(category: Optional[str] = None, product_id: Optional[str] = None, q: Optional[str] = None):
    query = {"status": "approved"}
    if category:
        query["category"] = category
    if product_id:
        query["product_id"] = product_id
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"seller_name": {"$regex": q, "$options": "i"}},
        ]
    offers = await db.offers.find(query, {"_id": 0, "delivery_codes": 0}).sort("created_at", -1).to_list(200)
    return offers


@seller_router.get("/public/offers/{offer_id}")
async def get_public_offer(offer_id: str):
    offer = await db.offers.find_one({"id": offer_id, "status": "approved"}, {"_id": 0, "delivery_codes": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


# ==================== SELLER ORDERS ====================

@seller_router.get("/orders")
async def get_seller_orders(user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")
    orders = await db.seller_orders.find({"seller_id": seller["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders


@seller_router.put("/orders/{order_id}/deliver")
async def deliver_seller_order(order_id: str, user_id: str = "", delivery_info: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")

    order = await db.seller_orders.find_one({"id": order_id, "seller_id": seller["id"]})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await db.seller_orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "delivered",
            "delivery_info": delivery_info,
            "delivered_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {"status": "delivered"}


# ==================== SELLER EARNINGS ====================

@seller_router.get("/earnings")
async def get_seller_earnings(user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")

    transactions = await db.seller_transactions.find(
        {"seller_id": seller["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    return {
        "balance": seller.get("balance", 0.0),
        "total_earnings": seller.get("total_earnings", 0.0),
        "total_sales": seller.get("total_sales", 0),
        "transactions": transactions,
    }


@seller_router.post("/withdrawals")
async def request_withdrawal(data: SellerWithdrawalRequest, user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    if data.amount > seller.get("balance", 0):
        raise HTTPException(status_code=400, detail="Insufficient balance")

    withdrawal = {
        "id": str(uuid.uuid4()),
        "seller_id": seller["id"],
        "seller_name": seller.get("shop_name", ""),
        "seller_email": seller.get("email", ""),
        "amount": data.amount,
        "payment_method": data.payment_method,
        "payment_details": data.payment_details,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.seller_withdrawals.insert_one(withdrawal)
    await db.sellers.update_one(
        {"id": seller["id"]},
        {"$inc": {"balance": -data.amount}}
    )

    return {"status": "submitted", "withdrawal_id": withdrawal["id"]}


@seller_router.get("/withdrawals")
async def get_seller_withdrawals(user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")
    withdrawals = await db.seller_withdrawals.find(
        {"seller_id": seller["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return withdrawals


# ==================== MESSAGING ====================

def _conversation_id(user_a: str, user_b: str) -> str:
    return "-".join(sorted([user_a, user_b]))


@seller_router.post("/messages")
async def send_message(data: MessageSend, user_id: str = "", user_email: str = ""):
    if not user_id:
        raise HTTPException(status_code=400, detail="Authentication required")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    sender_role = "seller" if seller and seller.get("status") == "approved" else "customer"

    conv_id = _conversation_id(user_id, data.receiver_id)

    msg = Message(
        conversation_id=conv_id,
        sender_id=user_id,
        sender_name=user.get("full_name", "User"),
        sender_role=sender_role,
        receiver_id=data.receiver_id,
        offer_id=data.offer_id,
        order_id=data.order_id,
        text=data.text,
    )

    await db.messages.insert_one(msg.model_dump())
    return msg.model_dump()


@seller_router.get("/messages/conversations")
async def get_conversations(user_id: str = ""):
    if not user_id:
        raise HTTPException(status_code=400, detail="Authentication required")

    messages = await db.messages.find(
        {"$or": [{"sender_id": user_id}, {"receiver_id": user_id}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    convs = {}
    for msg in messages:
        cid = msg["conversation_id"]
        if cid not in convs:
            other_id = msg["receiver_id"] if msg["sender_id"] == user_id else msg["sender_id"]
            other_name = msg.get("sender_name", "") if msg["sender_id"] != user_id else ""
            convs[cid] = {
                "conversation_id": cid,
                "other_user_id": other_id,
                "other_user_name": other_name,
                "last_message": msg["text"],
                "last_message_at": msg["created_at"],
                "unread": 0,
            }
        if msg["receiver_id"] == user_id and not msg.get("read"):
            convs[cid]["unread"] += 1
        if not convs[cid]["other_user_name"] and msg["sender_id"] != user_id:
            convs[cid]["other_user_name"] = msg.get("sender_name", "")

    return list(convs.values())


@seller_router.get("/messages/{conversation_id}")
async def get_conversation_messages(conversation_id: str, user_id: str = ""):
    if not user_id:
        raise HTTPException(status_code=400, detail="Authentication required")

    messages = await db.messages.find(
        {"conversation_id": conversation_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)

    await db.messages.update_one(
        {"conversation_id": conversation_id, "receiver_id": user_id, "read": False},
        {"$set": {"read": True}},
    )

    return messages


# ==================== SELLER ANALYTICS ====================

@seller_router.get("/analytics")
async def get_seller_analytics(user_id: str = ""):
    seller = await db.sellers.find_one({"user_id": user_id}, {"_id": 0})
    if not seller:
        raise HTTPException(status_code=403, detail="Not a seller")

    offers = await db.offers.find({"seller_id": seller["id"]}, {"_id": 0, "delivery_codes": 0}).to_list(500)
    orders = await db.seller_orders.find({"seller_id": seller["id"]}, {"_id": 0}).to_list(500)

    total_offers = len(offers)
    active_offers = sum(1 for o in offers if o.get("status") == "approved")
    pending_offers = sum(1 for o in offers if o.get("status") == "pending")
    total_orders = len(orders)
    completed_orders = sum(1 for o in orders if o.get("status") in ("delivered", "completed"))
    pending_orders = sum(1 for o in orders if o.get("status") == "pending")
    total_revenue = sum(float(o.get("seller_amount", 0)) for o in orders if o.get("status") in ("delivered", "completed"))

    return {
        "total_offers": total_offers,
        "active_offers": active_offers,
        "pending_offers": pending_offers,
        "total_orders": total_orders,
        "completed_orders": completed_orders,
        "pending_orders": pending_orders,
        "total_revenue": round(total_revenue, 2),
        "balance": seller.get("balance", 0.0),
        "rating": seller.get("rating", 0.0),
        "rating_count": seller.get("rating_count", 0),
    }


# ==================== ADMIN SELLER MANAGEMENT ====================

@admin_seller_router.get("")
async def admin_list_sellers(status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    sellers = await db.sellers.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return sellers


@admin_seller_router.put("/{seller_id}/approve")
async def admin_approve_seller(seller_id: str):
    seller = await db.sellers.find_one({"id": seller_id})
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    await db.sellers.update_one(
        {"id": seller_id},
        {"$set": {
            "status": "approved",
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    await db.users.update_one(
        {"id": seller["user_id"]},
        {"$set": {"role": "seller", "seller_status": "approved"}}
    )
    return {"status": "approved"}


@admin_seller_router.put("/{seller_id}/reject")
async def admin_reject_seller(seller_id: str):
    seller = await db.sellers.find_one({"id": seller_id})
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    await db.sellers.update_one({"id": seller_id}, {"$set": {"status": "rejected"}})
    await db.users.update_one(
        {"id": seller["user_id"]},
        {"$set": {"seller_status": "rejected"}}
    )
    return {"status": "rejected"}


@admin_seller_router.put("/{seller_id}/suspend")
async def admin_suspend_seller(seller_id: str):
    await db.sellers.update_one({"id": seller_id}, {"$set": {"status": "suspended"}})
    await db.offers.update_one(
        {"seller_id": seller_id, "status": "approved"},
        {"$set": {"status": "paused"}},
    )
    return {"status": "suspended"}


# Admin offer management
@admin_seller_router.get("/offers")
async def admin_list_offers(status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    offers = await db.offers.find(query, {"_id": 0, "delivery_codes": 0}).sort("created_at", -1).to_list(500)
    return offers


@admin_seller_router.put("/offers/{offer_id}/approve")
async def admin_approve_offer(offer_id: str):
    offer = await db.offers.find_one({"id": offer_id})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    await db.offers.update_one(
        {"id": offer_id},
        {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "approved"}


@admin_seller_router.put("/offers/{offer_id}/reject")
async def admin_reject_offer(offer_id: str):
    await db.offers.update_one({"id": offer_id}, {"$set": {"status": "rejected"}})
    return {"status": "rejected"}


# Admin withdrawal management
@admin_seller_router.get("/withdrawals")
async def admin_list_seller_withdrawals(status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    withdrawals = await db.seller_withdrawals.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return withdrawals


@admin_seller_router.put("/withdrawals/{withdrawal_id}/complete")
async def admin_complete_withdrawal(withdrawal_id: str):
    w = await db.seller_withdrawals.find_one({"id": withdrawal_id})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if w.get("status") == "completed":
        return {"status": "already_completed"}

    await db.seller_withdrawals.update_one(
        {"id": withdrawal_id},
        {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}}
    )

    await db.seller_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "seller_id": w["seller_id"],
        "type": "withdrawal",
        "amount": -abs(w["amount"]),
        "description": f"Withdrawal #{withdrawal_id[:8]} - {w.get('payment_method', '')}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"status": "completed"}


@admin_seller_router.put("/withdrawals/{withdrawal_id}/reject")
async def admin_reject_withdrawal(withdrawal_id: str):
    w = await db.seller_withdrawals.find_one({"id": withdrawal_id})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")

    await db.seller_withdrawals.update_one(
        {"id": withdrawal_id},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.sellers.update_one(
        {"id": w["seller_id"]},
        {"$inc": {"balance": abs(w["amount"])}}
    )
    return {"status": "rejected"}
