# 🔐 Environment Variables Guide for Railway Deployment

This guide shows you exactly what to write in each environment variable for Railway deployment.

---

## 📍 Step-by-Step: Getting Your Railway URLs

### Step 1: Deploy Services First (You'll Get URLs Automatically)

After deploying each service on Railway, you'll get automatic URLs like:
- Backend: `https://your-backend-name.up.railway.app`
- Frontend: `https://your-frontend-name.up.railway.app`

**These are your temporary URLs** - you'll use these first, then update with your custom domain later.

---

## 🖥️ BACKEND Environment Variables

Go to: **Backend Service** → **Variables** tab

### Required Variables:

| Variable Name | What to Write | Example | Where to Get |
|--------------|---------------|---------|--------------|
| `MONGO_URL` | MongoDB connection string | `mongodb://mongo:password@containers-us-west-xxx.railway.app:27017/railway` | From MongoDB service → Variables → `MONGO_URL` |
| `DB_NAME` | Database name | `kayicom` | You choose this (any name you want) |
| `CORS_ORIGINS` | Frontend URLs (comma-separated) | See examples below ⬇️ | Your frontend URL(s) |
| `FRONTEND_URL` | Main frontend URL | See examples below ⬇️ | Your frontend URL |
| `PORT` | Port number (Railway sets this) | `8000` | Railway auto-sets, but you can use `8000` as default |

---

### 🔵 OPTION 1: Using Railway Default URLs (Start Here)

**After deploying both services, use these:**

```
MONGO_URL=mongodb://mongo:password@containers-us-west-xxx.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://your-frontend-name.up.railway.app
FRONTEND_URL=https://your-frontend-name.up.railway.app
PORT=8000
```

**Example with actual URLs:**
```
MONGO_URL=mongodb://mongo:abc123@containers-us-west-123.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://kayicom-frontend.up.railway.app
FRONTEND_URL=https://kayicom-frontend.up.railway.app
PORT=8000
```

---

### 🟢 OPTION 2: Using Custom Domain kayicom.com (After Setup)

**After adding custom domains:**

```
MONGO_URL=mongodb://mongo:password@containers-us-west-xxx.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com
FRONTEND_URL=https://kayicom.com
PORT=8000
```

**If backend is on subdomain (recommended):**
- Frontend: `kayicom.com` or `www.kayicom.com`
- Backend: `api.kayicom.com`

Then use:
```
MONGO_URL=mongodb://mongo:password@containers-us-west-xxx.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com
FRONTEND_URL=https://kayicom.com
PORT=8000
```

---

## 🌐 FRONTEND Environment Variables

Go to: **Frontend Service** → **Variables** tab

### Required Variables:

| Variable Name | What to Write | Example | Where to Get |
|--------------|---------------|---------|--------------|
| `REACT_APP_BACKEND_URL` | Backend API URL | See examples below ⬇️ | Your backend service URL |
| `PORT` | Port number | `3000` | Railway auto-sets, but use `3000` as default |
| `NODE_ENV` | Environment | `production` | Always use `production` |

---

### 🔵 OPTION 1: Using Railway Default URLs (Start Here)

**After deploying backend, use backend's Railway URL:**

```
REACT_APP_BACKEND_URL=https://your-backend-name.up.railway.app
PORT=3000
NODE_ENV=production
```

**Example with actual URLs:**
```
REACT_APP_BACKEND_URL=https://kayicom-backend.up.railway.app
PORT=3000
NODE_ENV=production
```

---

### 🟢 OPTION 2: Using Custom Domain kayicom.com (After Setup)

**If backend is on subdomain `api.kayicom.com`:**

```
REACT_APP_BACKEND_URL=https://api.kayicom.com
PORT=3000
NODE_ENV=production
```

**If backend is on root (not recommended):**

```
REACT_APP_BACKEND_URL=https://kayicom.com/api
PORT=3000
NODE_ENV=production
```

---

## 🔍 Where to Get Values - Step by Step

### 1. Getting MONGO_URL (Backend)

1. Go to Railway dashboard
2. Click on your **MongoDB service**
3. Go to **Variables** tab
4. Find `MONGO_URL` - **Copy this entire value**
5. Paste it in Backend service → Variables → `MONGO_URL`

**Example format:**
```
mongodb://mongo:randompassword@containers-us-west-123.railway.app:27017/railway
```

---

### 2. Getting Backend URL (For Frontend)

1. Go to Railway dashboard
2. Click on your **Backend service**
3. Go to **Settings** tab
4. Look for **"Public Domain"** or check the **Deployments** tab
5. Copy the URL (looks like: `https://something.up.railway.app`)
6. Use this in Frontend → Variables → `REACT_APP_BACKEND_URL`

**Or:**
1. After backend deploys, Railway shows the URL
2. Click on the backend service
3. The URL appears at the top
4. Copy this URL

---

### 3. Getting Frontend URL (For Backend CORS)

1. Go to Railway dashboard
2. Click on your **Frontend service**
3. Go to **Settings** tab
4. Copy the Public Domain URL
5. Use this in Backend → Variables → `CORS_ORIGINS` and `FRONTEND_URL`

---

## 📋 Complete Example Setup

### Scenario: Fresh Deployment (No Custom Domain Yet)

**Step 1: Deploy MongoDB**
- Railway gives you: `MONGO_URL=mongodb://mongo:xyz123@...`

**Step 2: Deploy Backend**
- Railway gives you: `https://kayicom-api.up.railway.app`
- Add variables:
  ```
  MONGO_URL=mongodb://mongo:xyz123@containers-us-west-123.railway.app:27017/railway
  DB_NAME=kayicom
  CORS_ORIGINS=https://kayicom-app.up.railway.app
  FRONTEND_URL=https://kayicom-app.up.railway.app
  ```

**Step 3: Deploy Frontend**
- Railway gives you: `https://kayicom-app.up.railway.app`
- Add variables:
  ```
  REACT_APP_BACKEND_URL=https://kayicom-api.up.railway.app
  PORT=3000
  NODE_ENV=production
  ```

---

### Scenario: With Custom Domain kayicom.com

**After adding custom domains:**

**Backend (api.kayicom.com):**
```
MONGO_URL=mongodb://mongo:xyz123@containers-us-west-123.railway.app:27017/railway
DB_NAME=kayicom
CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com
FRONTEND_URL=https://kayicom.com
PORT=8000
```

**Frontend (kayicom.com):**
```
REACT_APP_BACKEND_URL=https://api.kayicom.com
PORT=3000
NODE_ENV=production
```

---

## ⚠️ Important Notes

### 1. CORS_ORIGINS Format
- Use comma-separated list (no spaces around commas)
- Use only production domains in CORS_ORIGINS
- Use `https://` (not `http://`) for production
- **NO trailing slashes** (use `https://kayicom.com` not `https://kayicom.com/`)

**✅ CORRECT:**
```
CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com
```

**❌ WRONG:**
```
CORS_ORIGINS=https://kayicom.com/, https://www.kayicom.com/
```

---

### 2. REACT_APP_BACKEND_URL Format
- Use `https://` (not `http://`)
- **NO trailing slash** (use `https://api.kayicom.com` not `https://api.kayicom.com/`)
- Don't include `/api` path - React app adds it automatically

**✅ CORRECT:**
```
REACT_APP_BACKEND_URL=https://api.kayicom.com
```

**❌ WRONG:**
```
REACT_APP_BACKEND_URL=https://api.kayicom.com/
REACT_APP_BACKEND_URL=https://api.kayicom.com/api
```

---

### 3. Update Order

**IMPORTANT:** Update in this order:

1. First: Update Backend `CORS_ORIGINS` with frontend URL
2. Second: Update Frontend `REACT_APP_BACKEND_URL` with backend URL
3. Third: Update Backend `FRONTEND_URL` with frontend URL

After each update, Railway will redeploy automatically.

---

## 🎯 Quick Checklist

**Backend Variables:**
- [ ] `MONGO_URL` - From MongoDB service
- [ ] `DB_NAME` - `kayicom` (or your choice)
- [ ] `CORS_ORIGINS` - Your frontend URL(s)
- [ ] `FRONTEND_URL` - Your frontend URL
- [ ] `PORT` - `8000` (optional, Railway sets it)

**Frontend Variables:**
- [ ] `REACT_APP_BACKEND_URL` - Your backend URL
- [ ] `PORT` - `3000` (optional, Railway sets it)
- [ ] `NODE_ENV` - `production`

---

## 🔄 Updating Variables

1. Go to service → **Variables** tab
2. Click **"+ New Variable"**
3. Enter variable name and value
4. Click **"Add"**
5. Railway automatically redeploys with new variables
6. Wait 1-2 minutes for redeployment

---

## 🆘 Troubleshooting

### Frontend can't connect to backend?
- Check `REACT_APP_BACKEND_URL` is correct
- Verify backend is running (check Railway logs)
- Check CORS settings in backend

### CORS errors in browser?
- Verify `CORS_ORIGINS` includes your frontend URL
- Check URL format (no trailing slashes, use https://)
- Make sure both services are redeployed after variable changes

### Can't find MongoDB URL?
- Go to MongoDB service (not backend)
- Check Variables tab
- If not visible, check Settings → Generate new connection string

---

## 📞 Need Help?

1. Check Railway logs: Service → Deployments → Click deployment → View Logs
2. Verify all URLs are correct (no typos, correct https://)
3. Make sure both services are deployed and running
4. Check browser console for specific error messages

---

**Remember:** Start with Railway's default URLs first, then update to custom domain (kayicom.com) after everything works! 🚀

