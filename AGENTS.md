# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Tech | Port | Start command |
|---------|------|------|---------------|
| Backend | FastAPI (Python) | 8000 | `cd backend && MONGO_URL=mongodb://localhost:27017 uvicorn server:app --host 0.0.0.0 --port 8000 --reload` |
| Frontend | React (CRA/CRACO) | 3000 | `cd frontend && REACT_APP_BACKEND_URL=http://localhost:8000 yarn start` |
| MongoDB | MongoDB 7.0 | 27017 | `mongod --dbpath /data/db --fork --logpath /tmp/mongod.log` |

### Required env vars

- **Backend**: `MONGO_URL` (mandatory), `DB_NAME` (default: `kayicom`), `CORS_ORIGINS`, `FRONTEND_URL`, `PORT`
- **Frontend**: `REACT_APP_BACKEND_URL` (mandatory, point to backend), `PORT`, `BROWSER=none` (prevents opening browser)

### Starting MongoDB

MongoDB must be started before the backend:
```bash
sudo mkdir -p /data/db && sudo chown $(whoami) /data/db
mongod --dbpath /data/db --fork --logpath /tmp/mongod.log
```

### Seeding data

After MongoDB and backend are running:
```bash
cd backend && MONGO_URL=mongodb://localhost:27017 python3 create_admin.py   # admin: Info.kayicom.com@gmx.fr / admin123
cd backend && MONGO_URL=mongodb://localhost:27017 DB_NAME=kayicom python3 seed_demo_products.py  # 25 demo products
```
Note: `seed_demo_products.py` requires `DB_NAME` env var (unlike `create_admin.py` which defaults to `kayicom`).

### Production deployment

| Layer | Platform | Domain |
|-------|----------|--------|
| Frontend | Vercel | `kayicom.com` |
| Backend | Render | `api.kayicom.com` |

`frontend/vercel.json` has an external rewrite that proxies `/api/:path*` from Vercel to `https://api.kayicom.com/api/:path*` (the Render backend). This is critical for webhooks (e.g. NatCash SMS Forwarder) that hit the frontend domain.

### Running tests

- Backend smoke tests: `python3 -m pytest tests/test_api_smoke.py -v` (52 pass; 3 pre-existing mock failures in wallet adjust and order count tests)
- Frontend build check: `cd frontend && yarn build`
- Backend lint: `cd backend && flake8 server.py --max-line-length=200` (pre-existing style warnings)

### Gotchas

- `server.py` is a 9600+ line monolith — all backend logic lives in one file.
- The `email` field in `payment_gateways.binance_pay` stores the Binance Pay UID (not an email address).
- The backend requires `MONGO_URL` at import time; the module-level `AsyncIOMotorClient` will raise if the env var is missing. Tests use monkeypatch to provide it.
- Frontend uses `yarn` (lockfile: `yarn.lock`); the `packageManager` field in `package.json` pins yarn 1.22.22.
- `pip install` scripts go to `~/.local/bin` which may not be on PATH — prepend it or use `python3 -m <tool>`.
- NatCash payment flow: the Automate SMS callback (`POST /api/natcash/sms-callback`) sets `payment_status` to `paid` but `order_status` stays `pending` for products with `delivery_type: "manual"`. This is by design — admin must manually complete these orders. Only products with `delivery_type: "automatic"` and available codes in `product_codes` get auto-completed.
- To test NatCash pipeline locally, use `POST /api/natcash/test-sms` (admin tool) with `{"dry_run": false}` to simulate a full SMS → payment confirmation cycle.
