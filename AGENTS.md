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
cd backend && python3 create_admin.py   # admin: Info.kayicom.com@gmx.fr / admin123
cd backend && python3 seed_demo_products.py  # 25 demo products
```

### Running tests

- Backend smoke tests: `python3 -m pytest tests/test_api_smoke.py -v` (22/25 pass; 3 pre-existing mock failures in wallet adjust and order count tests)
- Frontend build check: `cd frontend && yarn build`
- Backend lint: `cd backend && flake8 server.py --max-line-length=200` (pre-existing style warnings)

### Gotchas

- `server.py` is a 5600+ line monolith — all backend logic lives in one file.
- The `email` field in `payment_gateways.binance_pay` stores the Binance Pay UID (not an email address).
- The backend requires `MONGO_URL` at import time; the module-level `AsyncIOMotorClient` will raise if the env var is missing. Tests use monkeypatch to provide it.
- Frontend uses `yarn` (lockfile: `yarn.lock`); the `packageManager` field in `package.json` pins yarn 1.22.22.
- `pip install` scripts go to `~/.local/bin` which may not be on PATH — prepend it or use `python3 -m <tool>`.
