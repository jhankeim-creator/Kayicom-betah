# 🚨 CORS Error Fix - Environment Variables Update Required

## ❌ The Problem

Your frontend is still trying to connect to the old Railway URLs instead of your custom domain:

- **Frontend calls:** `https://kayicom-beta-production.up.railway.app/api/...`
- **But your domain is:** `https://api.kayicom.com`

This causes CORS errors because the backend doesn't allow requests from `kayicom.com` to the Railway URL.

## ✅ The Solution

### Update Railway Environment Variables

#### Step 1: Update Backend Environment Variables

**Go to Railway Backend Service → Variables tab:**

**Update these variables:**

```
MONGO_URL=mongodb://mongo:FWpxsduISMAnPGgoeFhJBJAzLaqYUKHG@shortline.proxy.rlwy.net:40254
DB_NAME=kayicom
CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com
FRONTEND_URL=https://kayicom.com
PORT=8000
```

#### Step 2: Update Frontend Environment Variables

**Go to Railway Frontend Service → Variables tab:**

**Update this variable:**
```
REACT_APP_BACKEND_URL=https://api.kayicom.com
PORT=3000
NODE_ENV=production
```

## 📋 What Changed

### Before (CORS Error):
- Backend: `CORS_ORIGINS=https://kayicom-beta-production.up.railway.app`
- Frontend: `REACT_APP_BACKEND_URL=https://kayicom-beta-production.up.railway.app`

### After (Fixed):
- Backend: `CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com`
- Frontend: `REACT_APP_BACKEND_URL=https://api.kayicom.com`

## 🚀 After Updating Variables

1. **Railway will automatically redeploy** both services
2. **Wait 2-3 minutes** for redeployment
3. **Test login:**
   - Go to: `https://kayicom.com/admin`
  - Email: `Info.kayicom.com@gmx.fr`
   - Password: `admin123`

## 🧪 Verify Fix

**Test these URLs:**
- ✅ `https://kayicom.com` - Frontend loads
- ✅ `https://api.kayicom.com` - API responds
- ✅ `https://kayicom.com/admin` - Admin login works
- ✅ No CORS errors in browser console

## 🔍 Why This Happened

When you first deployed, Railway used its default URLs. After adding custom domains, you need to update the environment variables to use the new domain names.

## ⚡ Quick Checklist

- [ ] Update backend `CORS_ORIGINS` to include `https://kayicom.com`
- [ ] Update backend `FRONTEND_URL` to `https://kayicom.com`
- [ ] Update frontend `REACT_APP_BACKEND_URL` to `https://api.kayicom.com`
- [ ] Wait for Railway redeployment (2-3 minutes)
- [ ] Test admin login
- [ ] Clear browser cache if needed

---

## 🎯 Result

After updating variables:
- ✅ Frontend (`kayicom.com`) can communicate with backend (`api.kayicom.com`)
- ✅ CORS errors disappear
- ✅ Admin login works
- ✅ All API calls work properly

**Update the Railway environment variables and your CORS errors will be fixed!** 🚀

