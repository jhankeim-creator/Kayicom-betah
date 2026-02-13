import os
import re
import sys

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
        self.credits_transactions = _FakeCollection()
        self.withdrawals = _FakeCollection()
        self.wallet_topups = _FakeCollection()
        self.minutes_transfers = _FakeCollection()


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
