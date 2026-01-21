# 📝 Environment Variables Template - Copy & Paste

Quick reference template for Railway environment variables.

---

## 🖥️ BACKEND Service Variables

### Phase 1: Railway Default URLs (Use First)

```bash
MONGO_URL=mongodb://mongo:YOUR_PASSWORD@containers-us-west-XXX.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://YOUR-FRONTEND-NAME.up.railway.app
FRONTEND_URL=https://YOUR-FRONTEND-NAME.up.railway.app
PORT=8000
```

### Phase 2: Custom Domain kayicom.com (After Setup)

```bash
MONGO_URL=mongodb://mongo:YOUR_PASSWORD@containers-us-west-XXX.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com
FRONTEND_URL=https://kayicom.com
PORT=8000
```

---

## 🌐 FRONTEND Service Variables

### Phase 1: Railway Default URLs (Use First)

```bash
REACT_APP_BACKEND_URL=https://YOUR-BACKEND-NAME.up.railway.app
PORT=3000
NODE_ENV=production
```

### Phase 2: Custom Domain kayicom.com (After Setup)

```bash
REACT_APP_BACKEND_URL=https://api.kayicom.com
PORT=3000
NODE_ENV=production
```

---

## 🔍 How to Fill In Values

### Replace These Placeholders:

1. **`YOUR_PASSWORD`** → Get from MongoDB service → Variables → `MONGO_URL`
2. **`XXX`** → Part of MongoDB connection string
3. **`YOUR-FRONTEND-NAME`** → Your frontend Railway URL (e.g., `kayicom-app`)
4. **`YOUR-BACKEND-NAME`** → Your backend Railway URL (e.g., `kayicom-api`)

---

## ✅ Example with Real Values

### Backend (Before Custom Domain):
```
MONGO_URL=mongodb://mongo:abc123xyz@containers-us-west-123.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://kayicom-app.up.railway.app
FRONTEND_URL=https://kayicom-app.up.railway.app
PORT=8000
```

### Frontend (Before Custom Domain):
```
REACT_APP_BACKEND_URL=https://kayicom-api.up.railway.app
PORT=3000
NODE_ENV=production
```

---

### Backend (After Custom Domain):
```
MONGO_URL=mongodb://mongo:abc123xyz@containers-us-west-123.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com
FRONTEND_URL=https://kayicom.com
PORT=8000
```

### Frontend (After Custom Domain):
```
REACT_APP_BACKEND_URL=https://api.kayicom.com
PORT=3000
NODE_ENV=production
```

---

## 📋 Quick Copy Checklist

**Step 1: Copy MONGO_URL from MongoDB service**
- [ ] Go to MongoDB service → Variables
- [ ] Copy entire `MONGO_URL` value

**Step 2: Deploy Backend, get URL**
- [ ] Copy backend URL from Railway dashboard

**Step 3: Deploy Frontend, get URL**
- [ ] Copy frontend URL from Railway dashboard

**Step 4: Fill Backend variables**
- [ ] Paste MONGO_URL
- [ ] Write `kayicom` for DB_NAME
- [ ] Paste frontend URL in CORS_ORIGINS and FRONTEND_URL

**Step 5: Fill Frontend variables**
- [ ] Paste backend URL in REACT_APP_BACKEND_URL
- [ ] Write `production` for NODE_ENV

---

## ⚠️ Remember

- **No spaces** around commas in CORS_ORIGINS
- **No trailing slashes** (don't use `/` at end)
- Use **https://** (not http://) for production
- Railway URLs end with `.up.railway.app`

