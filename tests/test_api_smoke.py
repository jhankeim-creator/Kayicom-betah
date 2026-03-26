import asyncio
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


class _FakeCursor:
    def __init__(self, items):
        self._items = items
        self._skip = 0

    def sort(self, *_args, **_kwargs):
        # no-op for tests
        return self

    def skip(self, n):
        try:
            self._skip = max(0, int(n))
        except Exception:
            self._skip = 0
        return self

    async def to_list(self, length):
        items = list(self._items)[self._skip:]
        return items[:length]


def _match_value(doc_value, query_value):
    # equality
    if not isinstance(query_value, dict):
        return doc_value == query_value

    # $in operator
    if "$in" in query_value:
        return doc_value in query_value["$in"]

    # $ne operator
    if "$ne" in query_value:
        return doc_value != query_value["$ne"]

    # $exists operator
    if "$exists" in query_value:
        return query_value["$exists"] == (doc_value is not None)

    # regex
    if "$regex" in query_value:
        pattern = query_value.get("$regex") or ""
        flags = 0
        if (query_value.get("$options") or "").lower().find("i") >= 0:
            flags |= re.IGNORECASE
        try:
            return re.search(pattern, str(doc_value or ""), flags) is not None
        except re.error:
            return False

    return False


def _doc_matches(doc, query):
    if not query:
        return True

    # Mongo semantics: other keys AND ($or matches)
    for k, v in query.items():
        if k == "$or":
            continue
        if not _match_value(doc.get(k), v):
            return False

    if "$or" in query:
        return any(_doc_matches(doc, subq) for subq in (query.get("$or") or []))

    return True


class _FakeCollection:
    def __init__(self, initial=None):
        self._docs = list(initial or [])

    def _project(self, doc, projection):
        if not projection:
            return dict(doc)
        # handle {"_id": 0} or {"email": 1, "_id": 0}
        include = {k for k, v in projection.items() if v and k != "_id"}
        exclude_id = projection.get("_id") == 0

        if include:
            out = {k: doc.get(k) for k in include if k in doc}
            if not exclude_id and "_id" in doc:
                out["_id"] = doc["_id"]
            return out

        out = dict(doc)
        if exclude_id:
            out.pop("_id", None)
        return out

    async def find_one(self, query, projection=None):
        for d in self._docs:
            if _doc_matches(d, query):
                return self._project(d, projection)
        return None

    def find(self, query, projection=None):
        items = [self._project(d, projection) for d in self._docs if _doc_matches(d, query)]
        return _FakeCursor(items)

    async def insert_one(self, doc):
        self._docs.append(dict(doc))
        return {"inserted_id": doc.get("id")}

    async def update_one(self, query, update):
        for d in self._docs:
            if _doc_matches(d, query):
                if "$set" in update:
                    for k, v in update["$set"].items():
                        d[k] = v
                if "$inc" in update:
                    for k, v in update["$inc"].items():
                        d[k] = float(d.get(k, 0.0)) + float(v)
                return {"matched_count": 1, "modified_count": 1}
        return {"matched_count": 0, "modified_count": 0}

    async def delete_one(self, query):
        for idx, d in enumerate(self._docs):
            if _doc_matches(d, query):
                self._docs.pop(idx)
                return type("DeleteResult", (), {"deleted_count": 1})()
        return type("DeleteResult", (), {"deleted_count": 0})()

    async def count_documents(self, query):
        return sum(1 for d in self._docs if _doc_matches(d, query))


class _FakeDB:
    def __init__(self):
        self.users = _FakeCollection()
        self.products = _FakeCollection()
        self.wallet_transactions = _FakeCollection()
        self.referral_payouts = _FakeCollection()
        self.settings = _FakeCollection([{
            "id": "site_settings",
            "minutes_transfer_enabled": True,
            "minutes_transfer_fee_type": "percent",
            "minutes_transfer_fee_value": 10.0,
            "minutes_transfer_min_amount": 1.0,
            "minutes_transfer_max_amount": 500.0,
            "payment_gateways": {"paypal": {"enabled": True, "email": "x", "instructions": "pay"}},
            "plisio_api_key": "dummy"
        }])
        self.minutes_transfers = _FakeCollection()
        self.orders = _FakeCollection()
        self.blog_posts = _FakeCollection()
        self.subscription_notifications = _FakeCollection()
        self.credits_transactions = _FakeCollection()
        self.withdrawals = _FakeCollection()
        self.wallet_topups = _FakeCollection()
        self.minutes_transfers = _FakeCollection()
        self.natcash_sms_log = _FakeCollection()
        self.coupons = _FakeCollection()
        self.product_codes = _FakeCollection()


@pytest.fixture()
def app_module(monkeypatch):
    # Make backend importable
    sys.path.insert(0, "/workspace/backend")

    # Provide required env vars
    monkeypatch.setenv("MONGO_URL", os.environ.get("MONGO_URL", "mongodb://mongo:27017"))
    monkeypatch.setenv("DB_NAME", os.environ.get("DB_NAME", "test"))

    import importlib

    server = importlib.import_module("server")
    fake_db = _FakeDB()
    monkeypatch.setattr(server, "db", fake_db, raising=True)
    return server


def test_register_assigns_customer_id(app_module):
    client = TestClient(app_module.app)

    r = client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "full_name": "A", "password": "pass12345"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("customer_id", "").startswith("KC-")


def test_login_backfills_customer_id_for_legacy_user(app_module):
    # Insert a legacy user with no customer_id
    hashed = app_module.pwd_context.hash("pass12345")
    app_module.db.users._docs.append(
        {
            "id": "u-1",
            "email": "legacy@example.com",
            "full_name": "Legacy",
            "role": "customer",
            "password": hashed,
            "wallet_balance": 0.0,
            "customer_id": "",
        }
    )

    client = TestClient(app_module.app)
    r = client.post("/api/auth/login", json={"email": "legacy@example.com", "password": "pass12345"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("customer_id", "").startswith("KC-")

    # Ensure persisted
    stored = next(d for d in app_module.db.users._docs if d["id"] == "u-1")
    assert stored.get("customer_id", "").startswith("KC-")


def test_products_search_q_filters(app_module):
    app_module.db.products._docs.extend(
        [
            {"id": "p1", "name": "Steam Gift Card", "description": "Gaming", "category": "giftcard", "price": 10.0},
            {"id": "p2", "name": "Amazon Gift Card", "description": "Shopping", "category": "giftcard", "price": 25.0},
            {"id": "p3", "name": "Mobile Topup", "description": "Airtime", "category": "topup", "price": 5.0},
        ]
    )

    client = TestClient(app_module.app)
    r = client.get("/api/products?q=steam")
    assert r.status_code == 200, r.text
    items = r.json()
    assert [p["id"] for p in items] == ["p1"]


def test_admin_adjust_wallet_by_customer_id(app_module):
    app_module.db.users._docs.append(
        {
            "id": "u-2",
            "customer_id": "KC-99999999",
            "email": "cust@example.com",
            "full_name": "Cust",
            "role": "customer",
            "password": app_module.pwd_context.hash("x"),
            "wallet_balance": 1.0,
        }
    )
    client = TestClient(app_module.app)
    r = client.post(
        "/api/wallet/admin-adjust",
        json={"identifier": "KC-99999999", "amount": 4.5, "reason": "manual", "action": "credit"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user_id"] == "u-2"
    assert data["wallet_balance"] == pytest.approx(5.5)

    # transaction logged
    assert len(app_module.db.wallet_transactions._docs) == 1


def test_admin_adjust_wallet_by_email_and_debit_validation(app_module):
    app_module.db.users._docs.append(
        {
            "id": "u-3",
            "customer_id": "KC-11112222",
            "email": "x@example.com",
            "full_name": "X",
            "role": "customer",
            "password": app_module.pwd_context.hash("x"),
            "wallet_balance": 2.0,
        }
    )
    client = TestClient(app_module.app)

    # credit by email
    r = client.post("/api/wallet/admin-adjust", json={"identifier": "x@example.com", "amount": 3, "action": "credit"})
    assert r.status_code == 200, r.text
    assert r.json()["wallet_balance"] == pytest.approx(5.0)

    # debit too much should fail
    r2 = client.post("/api/wallet/admin-adjust", json={"identifier": "x@example.com", "amount": 999, "action": "debit"})
    assert r2.status_code == 400


def test_products_search_and_category_combined(app_module):
    app_module.db.products._docs.extend(
        [
            {"id": "s1", "name": "Netflix", "description": "Entertainment", "category": "giftcard", "price": 10.0},
            {"id": "s2", "name": "Netflix", "description": "Service", "category": "service", "price": 12.0},
        ]
    )
    client = TestClient(app_module.app)

    # q + category should narrow results
    r = client.get("/api/products?category=giftcard&q=netflix")
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 1
    assert items[0]["id"] == "s1"


def test_products_default_orders_count_is_above_1000(app_module):
    app_module.db.products._docs.append(
        {"id": "p-oc-1", "name": "Gift", "description": "Desc", "category": "giftcard", "price": 10.0}
    )
    client = TestClient(app_module.app)
    r = client.get("/api/products")
    assert r.status_code == 200, r.text
    data = r.json()
    product = next(p for p in data if p["id"] == "p-oc-1")
    assert int(product.get("orders_count", 0)) > 1000


def test_products_auto_generate_seo_fields(app_module):
    app_module.db.products._docs.append(
        {
            "id": "p-seo-1",
            "name": "Netflix Premium",
            "description": "Stream movies and TV shows with fast activation.",
            "category": "subscription",
            "price": 12.0,
            "currency": "USD",
        }
    )
    client = TestClient(app_module.app)
    r = client.get("/api/products")
    assert r.status_code == 200, r.text
    data = r.json()
    product = next(p for p in data if p["id"] == "p-seo-1")
    assert isinstance(product.get("seo_title"), str) and product["seo_title"].strip()
    assert isinstance(product.get("seo_description"), str) and product["seo_description"].strip()
    assert len(product["seo_description"]) <= 160


def test_products_search_q_matches_seo_fields(app_module):
    app_module.db.products._docs.append(
        {
            "id": "p-seo-q-1",
            "name": "Service Bundle",
            "description": "General service",
            "category": "service",
            "price": 8.5,
            "seo_title": "Best YouTube Premium Activation",
            "seo_description": "Fast setup for YouTube Premium accounts.",
        }
    )
    client = TestClient(app_module.app)
    r = client.get("/api/products?q=youtube")
    assert r.status_code == 200, r.text
    ids = [item["id"] for item in r.json()]
    assert "p-seo-q-1" in ids


def test_paid_order_increments_product_orders_count_idempotently(app_module):
    app_module.db.products._docs.append(
        {"id": "p-sale-1", "name": "Steam", "description": "Gaming", "category": "giftcard", "price": 10.0}
    )
    app_module.db.orders._docs.append(
        {
            "id": "o-sale-1",
            "user_id": "u-sale-1",
            "user_email": "sale@example.com",
            "items": [
                {"product_id": "p-sale-1", "product_name": "Steam", "quantity": 3, "price": 10.0}
            ],
            "total_amount": 30.0,
            "payment_method": "paypal",
            "payment_status": "pending",
            "order_status": "pending",
        }
    )
    client = TestClient(app_module.app)
    # Trigger startup jobs (backfill may set a default non-zero baseline).
    client.get("/api/products")
    baseline = float(next(p for p in app_module.db.products._docs if p["id"] == "p-sale-1").get("orders_count", 0) or 0)

    r = client.put("/api/orders/o-sale-1/complete")
    assert r.status_code == 200, r.text
    product = next(p for p in app_module.db.products._docs if p["id"] == "p-sale-1")
    assert float(product.get("orders_count", 0)) == pytest.approx(baseline + 3.0)

    # Calling the paid transition again should not increment twice.
    r2 = client.put("/api/orders/o-sale-1/complete")
    assert r2.status_code == 200, r2.text
    product_after = next(p for p in app_module.db.products._docs if p["id"] == "p-sale-1")
    assert float(product_after.get("orders_count", 0)) == pytest.approx(baseline + 3.0)


def test_new_order_increments_product_orders_count_immediately(app_module):
    app_module.db.users._docs.append(
        {
            "id": "u-order-1",
            "email": "uorder@example.com",
            "full_name": "Order User",
            "role": "customer",
            "password": app_module.pwd_context.hash("x"),
            "wallet_balance": 0.0,
            "customer_id": "KC-77778888",
            "is_blocked": False,
        }
    )
    product_seed = {
        "id": "p-order-1",
        "name": "Netflix Test",
        "description": "Subscription",
        "category": "subscription",
        "price": 12.0,
        "is_subscription": True,
        "orders_count": 0,
    }
    app_module.db.products._docs.append(product_seed)
    baseline = float(app_module._normalize_orders_count_for_product(product_seed))

    client = TestClient(app_module.app)
    r = client.post(
        "/api/orders?user_id=u-order-1&user_email=uorder@example.com",
        json={
            "items": [{"product_id": "p-order-1", "product_name": "Netflix Test", "quantity": 2, "price": 12.0}],
            "payment_method": "paypal",
        },
    )
    assert r.status_code == 200, r.text
    product = next(p for p in app_module.db.products._docs if p["id"] == "p-order-1")
    assert float(product.get("orders_count", 0)) == pytest.approx(baseline + 2.0)


def test_unpaid_orders_auto_cancel_after_15_minutes(app_module):
    app_module.db.orders._docs.append(
        {
            "id": "o-exp-1",
            "user_id": "u-exp-1",
            "user_email": "exp@example.com",
            "items": [],
            "total_amount": 15.0,
            "payment_method": "paypal",
            "payment_status": "pending",
            "order_status": "pending",
            "created_at": "2020-01-01T00:00:00+00:00",
            "updated_at": "2020-01-01T00:00:00+00:00",
        }
    )
    client = TestClient(app_module.app)
    r = client.get("/api/orders")
    assert r.status_code == 200, r.text
    order = next(o for o in r.json() if o["id"] == "o-exp-1")
    assert order["payment_status"] == "cancelled"
    assert order["order_status"] == "cancelled"


def test_crypto_buy_sell_endpoints_disabled_by_default(app_module):
    client = TestClient(app_module.app)
    r = client.get("/api/crypto/config")
    assert r.status_code == 410


def test_blog_post_publish_flow(app_module):
    client = TestClient(app_module.app)
    create = client.post(
        "/api/blog/posts",
        json={
            "title": "Service Update",
            "excerpt": "Quick update",
            "content": "We updated delivery flow.",
            "tags": ["update", "service"],
            "seo_title": "Service Update | KayiCom",
            "seo_description": "Quick update",
            "cta_label": "Browse products",
            "cta_url": "/products",
            "published": False,
        },
    )
    assert create.status_code == 200, create.text
    created = create.json()
    post_id = created["id"]
    post_slug = created.get("slug")
    assert isinstance(post_slug, str) and post_slug

    listed_before = client.get("/api/blog/posts")
    assert listed_before.status_code == 200, listed_before.text
    assert all(post["id"] != post_id for post in listed_before.json())

    publish = client.put(f"/api/blog/posts/{post_id}", json={"published": True})
    assert publish.status_code == 200, publish.text
    assert publish.json()["published"] is True

    by_slug = client.get(f"/api/blog/posts/by-slug/{post_slug}")
    assert by_slug.status_code == 200, by_slug.text
    assert by_slug.json()["id"] == post_id

    listed_after = client.get("/api/blog/posts")
    assert listed_after.status_code == 200, listed_after.text
    assert any(post["id"] == post_id for post in listed_after.json())


def test_blog_slug_is_unique_for_similar_titles(app_module):
    client = TestClient(app_module.app)
    r1 = client.post(
        "/api/blog/posts",
        json={"title": "Promo Week", "content": "First", "published": True},
    )
    assert r1.status_code == 200, r1.text
    r2 = client.post(
        "/api/blog/posts",
        json={"title": "Promo Week", "content": "Second", "published": True},
    )
    assert r2.status_code == 200, r2.text
    slug1 = r1.json().get("slug")
    slug2 = r2.json().get("slug")
    assert slug1 and slug2
    assert slug1 != slug2


def test_blog_html_content_keeps_html_and_normalizes_excerpt(app_module):
    client = TestClient(app_module.app)
    r = client.post(
        "/api/blog/posts",
        json={
            "title": "HTML Post",
            "content": "<h2>Header</h2><p>Hello <strong>world</strong></p><script>alert('x')</script>",
            "published": True,
        },
    )
    assert r.status_code == 200, r.text
    post = r.json()
    assert "<h2>Header</h2>" in post.get("content", "")
    assert "<" not in (post.get("excerpt") or "")
    assert "alert" not in (post.get("excerpt") or "").lower()
    assert "<" not in (post.get("seo_description") or "")


def test_minutes_quote_and_wallet_create(app_module):
    # Seed a user with wallet funds
    app_module.db.users._docs.append(
        {
            "id": "u-m1",
            "email": "m1@example.com",
            "full_name": "M1",
            "role": "customer",
            "password": app_module.pwd_context.hash("x"),
            "wallet_balance": 100.0,
            "customer_id": "KC-22223333",
        }
    )
    client = TestClient(app_module.app)

    r = client.get("/api/minutes/quote?amount=10&country=Haiti")
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["fee_amount"] == pytest.approx(1.0)
    assert q["total_amount"] == pytest.approx(11.0)

    r2 = client.post(
        "/api/minutes/transfers?user_id=u-m1&user_email=m1@example.com",
        json={"country": "Haiti", "phone_number": "+50912345678", "amount": 10, "payment_method": "wallet"},
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["transfer"]["payment_status"] == "paid"
    assert data["transfer"]["transfer_status"] == "processing"

    # Alias endpoints should work too
    r3 = client.get("/api/mobile-topup/quote?amount=10&country=Haiti")
    assert r3.status_code == 200, r3.text
    r4 = client.post(
        "/api/mobile-topup/requests?user_id=u-m1&user_email=m1@example.com",
        json={"country": "Haiti", "phone_number": "+50912345678", "amount": 10, "payment_method": "wallet"},
    )
    assert r4.status_code == 200, r4.text


def test_order_success_awards_credits_and_convert(app_module):
    # seed user
    app_module.db.users._docs.append(
        {
            "id": "u-c1",
            "email": "c1@example.com",
            "full_name": "C1",
            "role": "customer",
            "password": app_module.pwd_context.hash("x"),
            "wallet_balance": 0.0,
            "credits_balance": 995,
            "customer_id": "KC-33334444",
        }
    )
    # seed paid+completed order without credits_recorded
    app_module.db.orders._docs.append(
        {
            "id": "o-1",
            "user_id": "u-c1",
            "user_email": "c1@example.com",
            "items": [],
            "total_amount": 10.0,
            "payment_method": "paypal",
            "payment_status": "paid",
            "order_status": "completed",
            "credits_recorded": False,
        }
    )
    client = TestClient(app_module.app)

    # completing should award credits idempotently
    r = client.put("/api/orders/o-1/complete")
    assert r.status_code == 200, r.text
    # user should now have 1000 credits
    user = next(u for u in app_module.db.users._docs if u["id"] == "u-c1")
    assert int(user.get("credits_balance", 0)) == 1000

    # convert 1000 credits to $1
    r2 = client.post("/api/credits/convert?user_id=u-c1&user_email=c1@example.com", json={"credits": 1000})
    assert r2.status_code == 200, r2.text
    user2 = next(u for u in app_module.db.users._docs if u["id"] == "u-c1")
    assert int(user2.get("credits_balance", 0)) == 0
    assert float(user2.get("wallet_balance", 0.0)) == pytest.approx(1.0)


def test_admin_customers_list_and_search(app_module):
    app_module.db.users._docs.extend(
        [
            {"id": "cu-1", "role": "customer", "email": "john@example.com", "full_name": "John", "customer_id": "KC-10101010", "wallet_balance": 0.0, "credits_balance": 0},
            {"id": "cu-2", "role": "customer", "email": "mary@example.com", "full_name": "Mary", "customer_id": "KC-20202020", "wallet_balance": 1.0, "credits_balance": 5},
            {"id": "ad-1", "role": "admin", "email": "Info.kayicom.com@gmx.fr", "full_name": "Admin", "customer_id": "", "wallet_balance": 0.0, "credits_balance": 0},
        ]
    )
    client = TestClient(app_module.app)
    r = client.get("/api/admin/customers")
    assert r.status_code == 200, r.text
    data = r.json()
    # only customers
    assert all(u.get("role") == "customer" for u in data)

    r2 = client.get("/api/admin/customers?q=KC-2020")
    assert r2.status_code == 200, r2.text
    data2 = r2.json()
    assert len(data2) == 1
    assert data2[0]["id"] == "cu-2"


def test_admin_adjust_credits(app_module):
    app_module.db.users._docs.append(
        {"id": "cu-3", "role": "customer", "email": "c3@example.com", "full_name": "C3", "customer_id": "KC-30303030", "credits_balance": 10}
    )
    client = TestClient(app_module.app)
    r = client.post("/api/credits/admin-adjust", json={"identifier": "KC-30303030", "credits": 90, "action": "credit"})
    assert r.status_code == 200, r.text
    u = next(x for x in app_module.db.users._docs if x["id"] == "cu-3")
    assert int(u.get("credits_balance", 0)) == 100


def test_block_customer_prevents_login(app_module):
    app_module.db.users._docs.append(
        {
            "id": "blk-1",
            "role": "customer",
            "email": "blk@example.com",
            "full_name": "Blocked",
            "password": app_module.pwd_context.hash("pass12345"),
            "customer_id": "KC-90909090",
            "is_blocked": True,
        }
    )
    client = TestClient(app_module.app)
    r = client.post("/api/auth/login", json={"email": "blk@example.com", "password": "pass12345"})
    assert r.status_code == 403


def test_telegram_notification_auto_enables_when_token_and_chat_exist(app_module, monkeypatch):
    app_module.db.settings._docs[0].update(
        {
            "telegram_notifications_enabled": None,
            "telegram_bot_token": "123456:TEST",
            "telegram_admin_chat_id": "-100200300",
        }
    )

    sent = {"count": 0}

    class _Resp:
        status_code = 200
        text = '{"ok":true}'

        @staticmethod
        def json():
            return {"ok": True}

    def fake_post(url, json, timeout):
        sent["count"] += 1
        sent["url"] = url
        sent["payload"] = json
        sent["timeout"] = timeout
        return _Resp()

    monkeypatch.setattr(app_module.requests, "post", fake_post, raising=True)
    asyncio.run(app_module._notify_admin_telegram("Smoke event", ["line one"]))

    assert sent["count"] == 1
    assert sent["url"] == "https://api.telegram.org/bot123456:TEST/sendMessage"
    assert sent["payload"]["chat_id"] == "-100200300"


def test_telegram_notification_does_not_send_when_explicitly_disabled(app_module, monkeypatch):
    app_module.db.settings._docs[0].update(
        {
            "telegram_notifications_enabled": False,
            "telegram_bot_token": "123456:TEST",
            "telegram_admin_chat_id": "-100200300",
        }
    )

    sent = {"count": 0}

    class _Resp:
        status_code = 200
        text = '{"ok":true}'

        @staticmethod
        def json():
            return {"ok": True}

    def fake_post(url, json, timeout):
        sent["count"] += 1
        return _Resp()

    monkeypatch.setattr(app_module.requests, "post", fake_post, raising=True)
    asyncio.run(app_module._notify_admin_telegram("Should not send", ["line"]))

    assert sent["count"] == 0


def test_telegram_test_endpoint_uses_payload_overrides(app_module, monkeypatch):
    app_module.db.settings._docs[0].update(
        {
            "telegram_notifications_enabled": False,
            "telegram_bot_token": "111111:STORED",
            "telegram_admin_chat_id": "-100111111",
        }
    )

    sent = {"count": 0}

    class _Resp:
        status_code = 200
        text = '{"ok":true}'

        @staticmethod
        def json():
            return {"ok": True}

    def fake_post(url, json, timeout):
        sent["count"] += 1
        sent["url"] = url
        sent["payload"] = json
        sent["timeout"] = timeout
        return _Resp()

    monkeypatch.setattr(app_module.requests, "post", fake_post, raising=True)
    client = TestClient(app_module.app)
    r = client.post(
        "/api/settings/telegram/test",
        json={
            "telegram_bot_token": " 222222:OVERRIDE ",
            "telegram_admin_chat_id": " -100222222 ",
        },
    )
    assert r.status_code == 200, r.text
    assert sent["count"] == 1
    assert sent["url"] == "https://api.telegram.org/bot222222:OVERRIDE/sendMessage"
    assert sent["payload"]["chat_id"] == "-100222222"


def test_telegram_test_endpoint_returns_400_without_credentials(app_module, monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_ADMIN_CHAT_ID", raising=False)
    monkeypatch.delenv("TELEGRAM_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    app_module.db.settings._docs[0].pop("telegram_bot_token", None)
    app_module.db.settings._docs[0].pop("telegram_admin_chat_id", None)
    app_module.db.settings._docs[0]["telegram_notifications_enabled"] = True

    client = TestClient(app_module.app)
    r = client.post("/api/settings/telegram/test", json={"telegram_notifications_enabled": True})
    assert r.status_code == 400, r.text
    assert "missing bot token" in (r.json().get("detail") or "").lower()


def test_subscription_expired_sends_admin_alert_once_without_paid_renewal(app_module, monkeypatch):
    now = datetime.now(timezone.utc)
    expired_order = {
        "id": "sub-exp-1",
        "user_id": "u-sub-1",
        "user_email": "sub1@example.com",
        "payment_status": "paid",
        "order_status": "completed",
        "subscription_end_date": (now - timedelta(days=1)).isoformat(),
    }
    app_module.db.orders._docs.append(expired_order)

    alerts = []

    async def fake_notify(event, lines=None, settings_override=None, force_send=False, raise_on_error=False):
        alerts.append({"event": event, "lines": list(lines or [])})
        return True

    monkeypatch.setattr(app_module, "_notify_admin_telegram", fake_notify, raising=True)
    monkeypatch.setattr(app_module, "_send_resend_email", lambda *_args, **_kwargs: None, raising=True)

    asyncio.run(app_module._maybe_send_subscription_emails(expired_order))
    assert len(alerts) == 1
    assert alerts[0]["event"] == "Subscription expired - manual access removal"
    assert any(d.get("type") == "expired_admin_telegram" for d in app_module.db.subscription_notifications._docs)

    asyncio.run(app_module._maybe_send_subscription_emails(expired_order))
    assert len(alerts) == 1


def test_subscription_expired_skips_admin_alert_when_active_renewal_exists(app_module, monkeypatch):
    now = datetime.now(timezone.utc)
    expired_order = {
        "id": "sub-exp-2",
        "user_id": "u-sub-2",
        "user_email": "sub2@example.com",
        "payment_status": "paid",
        "order_status": "completed",
        "subscription_end_date": (now - timedelta(days=2)).isoformat(),
    }
    renewed_order = {
        "id": "sub-renewed-2",
        "user_id": "u-sub-2",
        "user_email": "sub2@example.com",
        "payment_status": "paid",
        "order_status": "completed",
        "subscription_end_date": (now + timedelta(days=20)).isoformat(),
    }
    app_module.db.orders._docs.extend([expired_order, renewed_order])

    alerts = []

    async def fake_notify(event, lines=None, settings_override=None, force_send=False, raise_on_error=False):
        alerts.append({"event": event, "lines": list(lines or [])})
        return True

    monkeypatch.setattr(app_module, "_notify_admin_telegram", fake_notify, raising=True)
    monkeypatch.setattr(app_module, "_send_resend_email", lambda *_args, **_kwargs: None, raising=True)

    asyncio.run(app_module._maybe_send_subscription_emails(expired_order))
    assert alerts == []
    assert not any(d.get("type") == "expired_admin_telegram" for d in app_module.db.subscription_notifications._docs)


# ==================== NATCASH SMS PARSING TESTS ====================


def test_parse_natcash_sms_standard_htg_format(app_module):
    """Parse a standard NatCash SMS with HTG amount and kontni reference."""
    sms = (
        "Ou resevwa 675.00 HTG nan TEST KLIYAN 50900000000 "
        "nan 14:30 25/03/2026, kontni: REF123. "
        "Balans ou: 99999.00 HTG. Transcode: 00000000000000. Mesi"
    )
    result = app_module._parse_natcash_sms(sms)
    assert result["amount_htg"] == 675.00
    assert result["reference_code"] == "REF123"


def test_parse_natcash_sms_gdes_amount(app_module):
    """Parse SMS with 'Gdes' currency format."""
    sms = "Ou resevwa Gdes 1350.50 de 50936000000. Ref: ABCD12. Balans: 5000 HTG"
    result = app_module._parse_natcash_sms(sms)
    assert result["amount_htg"] == 1350.50
    assert result["reference_code"] == "ABCD12"


def test_parse_natcash_sms_amount_before_currency(app_module):
    """Parse SMS where amount comes before the currency label."""
    sms = "Transfer resevwa: 500.00 HTG de 50900000000. Code: XYZ789"
    result = app_module._parse_natcash_sms(sms)
    assert result["amount_htg"] == 500.00
    assert result["reference_code"] == "XYZ789"


def test_parse_natcash_sms_no_reference(app_module):
    """Parse SMS that has amount but no recognizable reference."""
    sms = "Ou resevwa 200.00 HTG nan 50900000000. Balans ou: 300 HTG"
    result = app_module._parse_natcash_sms(sms)
    assert result["amount_htg"] == 200.00


def test_parse_natcash_sms_unparseable(app_module):
    """Totally unrelated text returns None for both fields."""
    result = app_module._parse_natcash_sms("Bonjou, ki jan ou ye?")
    assert result["amount_htg"] is None
    assert result["reference_code"] is None


def test_parse_natcash_sms_comma_thousands(app_module):
    """Parse SMS with comma-separated thousands in the amount."""
    sms = "Ou resevwa 1,350.00 HTG. Kontni: TEST01"
    result = app_module._parse_natcash_sms(sms)
    assert result["amount_htg"] == 1350.00
    assert result["reference_code"] == "TEST01"


# ==================== SMS FIELD EXTRACTION TESTS ====================


def test_extract_sms_fields_flat_message_key(app_module):
    """Extract SMS body from flat payload using 'message' key."""
    data = {"message": "Ou resevwa 500 HTG", "sender": "+50936000000", "timestamp": "2026-03-25T10:00:00Z"}
    result = app_module._extract_sms_fields(data)
    assert result["sms_body"] == "Ou resevwa 500 HTG"
    assert result["sms_from"] == "+50936000000"
    assert result["sms_time"] == "2026-03-25T10:00:00Z"


def test_extract_sms_fields_body_key(app_module):
    """Extract SMS body using 'body' key."""
    data = {"body": "Payment received 675 HTG", "from": "+50900000000"}
    result = app_module._extract_sms_fields(data)
    assert result["sms_body"] == "Payment received 675 HTG"
    assert result["sms_from"] == "+50900000000"


def test_extract_sms_fields_nested_sms_object(app_module):
    """Extract SMS body from nested sms.message payload."""
    data = {"sms": {"message": "Ou resevwa 1000 HTG", "from": "+509123", "receivedAt": "12:00"}}
    result = app_module._extract_sms_fields(data)
    assert result["sms_body"] == "Ou resevwa 1000 HTG"
    assert result["sms_from"] == "+509123"
    assert result["sms_time"] == "12:00"


def test_extract_sms_fields_empty_payload(app_module):
    """Empty payload returns empty strings."""
    result = app_module._extract_sms_fields({})
    assert result["sms_body"] == ""
    assert result["sms_from"] == ""


def test_extract_sms_fields_smsBody_camelCase(app_module):
    """Extract from camelCase key used by some Android forwarder apps."""
    data = {"smsBody": "Ou resevwa 300 HTG kontni: AABB11", "smsFrom": "+50900000000"}
    result = app_module._extract_sms_fields(data)
    assert result["sms_body"] == "Ou resevwa 300 HTG kontni: AABB11"
    assert result["sms_from"] == "+50900000000"


# ==================== NATCASH WEBHOOK ENDPOINT TESTS ====================


def test_webhook_natcash_matches_order_by_reference(app_module):
    """Webhook with matching reference code confirms payment on the order."""
    app_module.db.orders._docs.append({
        "id": "ord-nc-1",
        "user_id": "u-nc-1",
        "user_email": "nc1@example.com",
        "items": [{"product_id": "p-nc-1", "product_name": "Gift Card", "quantity": 1, "price": 5.0}],
        "total_amount": 5.0,
        "payment_method": "natcash",
        "payment_status": "pending",
        "order_status": "pending",
        "natcash_reference": "REF001",
    })
    app_module.db.products._docs.append({
        "id": "p-nc-1", "name": "Gift Card", "description": "Test", "category": "giftcard",
        "price": 5.0, "delivery_type": "manual",
    })

    client = TestClient(app_module.app)
    r = client.post(
        "/api/webhook/natcash",
        json={"message": "Ou resevwa 675.00 HTG nan 50900000000, kontni: REF001. Balans ou: 9999 HTG"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "success"
    assert data["matched"] is True
    assert data["order_id"] == "ord-nc-1"

    order = next(o for o in app_module.db.orders._docs if o["id"] == "ord-nc-1")
    assert order["payment_status"] == "paid"
    assert "natcash_sms_body" in order

    assert len(app_module.db.natcash_sms_log._docs) >= 1


def test_webhook_natcash_no_matching_order(app_module):
    """Webhook with unknown reference returns no_order_found."""
    client = TestClient(app_module.app)
    r = client.post(
        "/api/webhook/natcash",
        json={"message": "Ou resevwa 500.00 HTG, kontni: XXXXXX. Balans: 1000 HTG"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["matched"] is False


def test_webhook_natcash_unparseable_sms(app_module):
    """Webhook with non-NatCash SMS returns ignored status."""
    client = TestClient(app_module.app)
    r = client.post(
        "/api/webhook/natcash",
        json={"message": "Bonjou, koman ou ye jodi a?"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "ignored"


def test_webhook_natcash_no_sms_body(app_module):
    """Webhook with empty/missing SMS body returns error."""
    client = TestClient(app_module.app)
    r = client.post(
        "/api/webhook/natcash",
        json={"sender": "+50900000000"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "error"
    assert "No SMS body" in data.get("reason", "")


def test_webhook_natcash_bearer_auth_rejects_wrong_token(app_module):
    """Webhook rejects request when Bearer token doesn't match configured secret."""
    app_module.db.settings._docs[0]["natcash_callback_secret"] = "mysecret123"
    client = TestClient(app_module.app)
    r = client.post(
        "/api/webhook/natcash",
        json={"message": "Ou resevwa 500.00 HTG kontni: AAA111"},
        headers={"Authorization": "Bearer wrongtoken"},
    )
    assert r.status_code == 401


def test_webhook_natcash_bearer_auth_accepts_correct_token(app_module):
    """Webhook accepts request when Bearer token matches configured secret."""
    app_module.db.settings._docs[0]["natcash_callback_secret"] = "mysecret123"
    client = TestClient(app_module.app)
    r = client.post(
        "/api/webhook/natcash",
        json={"message": "Ou resevwa 500.00 HTG kontni: BBB222"},
        headers={"Authorization": "Bearer mysecret123"},
    )
    assert r.status_code == 200, r.text


def test_webhook_natcash_matches_order_by_amount(app_module):
    """Webhook matches order by HTG amount when reference doesn't match."""
    app_module.db.settings._docs[0]["natcash_usd_htg_rate"] = 135.0
    app_module.db.orders._docs.append({
        "id": "ord-nc-amt-1",
        "user_id": "u-nc-2",
        "user_email": "nc2@example.com",
        "items": [],
        "total_amount": 5.0,
        "payment_method": "natcash",
        "payment_status": "pending",
        "order_status": "pending",
        "natcash_reference": "NOMATCH",
    })

    client = TestClient(app_module.app)
    r = client.post(
        "/api/webhook/natcash",
        json={"message": "Ou resevwa 675.00 HTG nan 50900000000. Balans: 9999 HTG"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "success"
    assert data["matched"] is True
    assert data["order_id"] == "ord-nc-amt-1"


# ==================== NATCASH TEST-SMS ENDPOINT TESTS ====================


def test_natcash_test_sms_dry_run_with_pending_order(app_module):
    """Admin test-sms in dry_run mode generates SMS and shows match without confirming."""
    app_module.db.settings._docs[0]["natcash_usd_htg_rate"] = 135.0
    app_module.db.orders._docs.append({
        "id": "ord-test-1",
        "user_id": "u-test-1",
        "user_email": "test1@example.com",
        "items": [],
        "total_amount": 10.0,
        "payment_method": "natcash",
        "payment_status": "pending",
        "order_status": "pending",
        "natcash_reference": "TREF01",
        "created_at": "2026-03-25T10:00:00Z",
    })

    client = TestClient(app_module.app)
    r = client.post("/api/natcash/test-sms", json={"dry_run": True})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["dry_run"] is True
    assert data["matched"] is True
    assert data["parsed"]["amount_htg"] is not None

    order = next(o for o in app_module.db.orders._docs if o["id"] == "ord-test-1")
    assert order["payment_status"] == "pending"


def test_natcash_test_sms_custom_sms_body(app_module):
    """Admin test-sms with custom sms_body parses it correctly."""
    client = TestClient(app_module.app)
    r = client.post(
        "/api/natcash/test-sms",
        json={"sms_body": "Ou resevwa 1,000.00 HTG kontni: CUSTOM. Balans: 5000 HTG", "dry_run": True},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["parsed"]["amount_htg"] == 1000.00
    assert data["parsed"]["reference_code"] == "CUSTOM"


def test_natcash_test_sms_no_pending_orders(app_module):
    """Admin test-sms with no pending orders generates a demo SMS and parses it."""
    client = TestClient(app_module.app)
    r = client.post("/api/natcash/test-sms", json={"dry_run": True})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["parsed"]["amount_htg"] is not None
    assert data["parsed"]["reference_code"] == "DEMO01"
    assert data["matched"] is False


def test_natcash_test_sms_dry_run_false_confirms_payment(app_module):
    """Admin test-sms with dry_run=false actually marks order as paid."""
    app_module.db.settings._docs[0]["natcash_usd_htg_rate"] = 135.0
    app_module.db.orders._docs.append({
        "id": "ord-test-pay-1",
        "user_id": "u-test-pay-1",
        "user_email": "pay1@example.com",
        "items": [{"product_id": "p-t1", "product_name": "Test", "quantity": 1, "price": 10.0}],
        "total_amount": 10.0,
        "payment_method": "natcash",
        "payment_status": "pending",
        "order_status": "pending",
        "natcash_reference": "PAYREF",
        "created_at": "2026-03-25T10:00:00Z",
    })
    app_module.db.products._docs.append({
        "id": "p-t1", "name": "Test Product", "description": "Test", "category": "giftcard",
        "price": 10.0, "delivery_type": "manual",
    })

    client = TestClient(app_module.app)
    r = client.post("/api/natcash/test-sms", json={"dry_run": False})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["order_marked_paid"] is True

    order = next(o for o in app_module.db.orders._docs if o["id"] == "ord-test-pay-1")
    assert order["payment_status"] == "paid"


# ==================== NATCASH SMS CALLBACK (AUTOMATE APP) TESTS ====================


def test_natcash_sms_callback_post_matches_order(app_module):
    """The /natcash/sms-callback POST endpoint parses SMS and matches order."""
    app_module.db.orders._docs.append({
        "id": "ord-cb-1",
        "user_id": "u-cb-1",
        "user_email": "cb1@example.com",
        "items": [{"product_id": "p-cb-1", "product_name": "Card", "quantity": 1, "price": 5.0}],
        "total_amount": 5.0,
        "payment_method": "natcash",
        "payment_status": "pending",
        "order_status": "pending",
        "natcash_reference": "CBREF1",
    })
    app_module.db.products._docs.append({
        "id": "p-cb-1", "name": "Card", "description": "Test", "category": "giftcard",
        "price": 5.0, "delivery_type": "manual",
    })

    client = TestClient(app_module.app)
    r = client.post(
        "/api/natcash/sms-callback",
        json={"sms_body": "Ou resevwa 675.00 HTG kontni: CBREF1. Balans: 9999 HTG"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["matched"] is True

    order = next(o for o in app_module.db.orders._docs if o["id"] == "ord-cb-1")
    assert order["payment_status"] == "paid"


def test_natcash_sms_callback_get_with_query_params(app_module):
    """The /natcash/sms-callback GET endpoint works with query parameters."""
    app_module.db.orders._docs.append({
        "id": "ord-cb-get-1",
        "user_id": "u-cb-get-1",
        "user_email": "cbget@example.com",
        "items": [],
        "total_amount": 5.0,
        "payment_method": "natcash",
        "payment_status": "pending",
        "order_status": "pending",
        "natcash_reference": "GETREF",
    })

    client = TestClient(app_module.app)
    r = client.get(
        "/api/natcash/sms-callback",
        params={"sms_body": "Ou resevwa 675.00 HTG kontni: GETREF. Balans: 9999 HTG"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["matched"] is True


def test_natcash_sms_callback_rejects_wrong_secret(app_module):
    """The sms-callback rejects requests with wrong secret."""
    app_module.db.settings._docs[0]["natcash_callback_secret"] = "correctsecret"
    client = TestClient(app_module.app)
    r = client.post(
        "/api/natcash/sms-callback",
        json={"sms_body": "Ou resevwa 500 HTG", "secret": "wrongsecret"},
    )
    assert r.status_code == 403


def test_natcash_sms_callback_no_body_returns_400(app_module):
    """The sms-callback returns 400 when no SMS body provided."""
    client = TestClient(app_module.app)
    r = client.post("/api/natcash/sms-callback", json={"sms_from": "+509000"})
    assert r.status_code == 400


# ==================== NATCASH VERIFY ENDPOINT TESTS ====================


def test_natcash_verify_payment_pending(app_module):
    """Verify returns not-yet-detected when order is still pending."""
    app_module.db.orders._docs.append({
        "id": "ord-verify-1",
        "user_id": "u-v-1",
        "user_email": "v1@example.com",
        "items": [],
        "total_amount": 5.0,
        "payment_method": "natcash",
        "payment_status": "pending",
        "order_status": "pending",
        "natcash_reference": "VREF01",
    })

    client = TestClient(app_module.app)
    r = client.post("/api/natcash/verify/ord-verify-1")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["verified"] is False


def test_natcash_verify_payment_already_paid(app_module):
    """Verify returns confirmed when order is already paid."""
    app_module.db.orders._docs.append({
        "id": "ord-verify-2",
        "user_id": "u-v-2",
        "user_email": "v2@example.com",
        "items": [],
        "total_amount": 5.0,
        "payment_method": "natcash",
        "payment_status": "paid",
        "order_status": "completed",
    })

    client = TestClient(app_module.app)
    r = client.post("/api/natcash/verify/ord-verify-2")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["verified"] is True
