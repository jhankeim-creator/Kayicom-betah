# 🚂 Railway Deployment Guide for KayiCom

This guide will help you deploy KayiCom on Railway in just a few steps.

---

## 📋 Prerequisites

1. GitHub account with your KayiCom code pushed to a repository
2. Railway account (sign up at [railway.app](https://railway.app))

---

## 🚀 Step-by-Step Deployment

### Step 1: Deploy MongoDB Database

1. Go to [railway.app](https://railway.app) and click **"New Project"**
2. Click **"+ New"** → **"Database"** → **"Add MongoDB"**
3. Railway will automatically provision a MongoDB instance
4. Click on the MongoDB service → Go to **"Variables"** tab
5. Copy the `MONGO_URL` value (it will look like: `mongodb://mongo:...@containers-us-west-xxx.railway.app:xxxxx/railway`)
mongodb://mongo:FWpxsduISMAnPGgoeFhJBJAzLaqYUKHG@shortline.proxy.rlwy.net:40254

### Step 2: Deploy Backend API

1. In the same Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select your KayiCom repository
3. Railway will detect it's a Python project
4. **IMPORTANT**: Set the **Root Directory** to `backend`
   - Go to service settings → **Settings** → **Source** → Set Root Directory: `backend`
5. Go to **Variables** tab and add these environment variables:

```
MONGO_URL=<paste the MONGO_URL from MongoDB service>
DB_NAME=kayicom
CORS_ORIGINS=https://your-frontend.railway.app
FRONTEND_URL=https://your-frontend.railway.app
PORT=8000
```

**📖 Detailed Guide:** See `ENVIRONMENT_VARIABLES_GUIDE.md` for complete explanation of what to write in each variable, including examples with your custom domain kayicom.com!

6. Go to **Settings** → **Deploy** and set:
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`

7. Click **"Deploy"** and wait for deployment
8. Copy the **Public URL** (it will look like: `https://your-backend.up.railway.app`)

### Step 3: Deploy Frontend

1. In the same Railway project, click **"+ New"** → **"GitHub Repo"** (same repo)
2. Set the **Root Directory** to `frontend`
   - Go to service settings → **Settings** → **Source** → Set Root Directory: `frontend`
3. Go to **Variables** tab and add:

```
REACT_APP_BACKEND_URL=https://your-backend.up.railway.app
PORT=3000
NODE_ENV=production
```

⚠️ **IMPORTANT**: Replace `your-backend.up.railway.app` with the actual backend URL from Step 2!

**📖 Detailed Guide:** See `ENVIRONMENT_VARIABLES_GUIDE.md` for complete explanation of what to write in each variable, including examples with your custom domain kayicom.com!

4. Go to **Settings** → **Deploy** and set:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx serve -s build -l $PORT`

5. Click **"Deploy"** and wait for deployment
6. Copy the **Public URL** (it will look like: `https://your-frontend.up.railway.app`)

### Step 4: Update CORS Settings

1. Go back to your **Backend** service → **Variables**
2. Update `CORS_ORIGINS` to include your frontend URL:
   ```
   CORS_ORIGINS=https://your-frontend.up.railway.app
   ```
3. Update `FRONTEND_URL`:
   ```
   FRONTEND_URL=https://your-frontend.up.railway.app
   ```
4. Railway will automatically redeploy with new variables

### Step 5: Initialize Database

After deployment, you need to create the admin user and seed products.

**Option A: Using Railway CLI (Recommended)**

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Link to your project: `railway link`
4. Run seed script:
   ```bash
   cd backend
   railway run python seed_demo_products.py
   railway run python seed_games.py
   railway run python create_admin.py
   ```

**Option B: Using Railway Dashboard**

1. Go to Backend service → **Settings** → **Connect to Shell**
2. Run commands:
   ```bash
   cd backend
   python seed_demo_products.py
   python seed_games.py
   python create_admin.py
   ```

### Step 6: Test Your Deployment

1. Visit your frontend URL: `https://your-frontend.up.railway.app`
2. Test admin login:
   - Email: `Info.kayicom.com@gmx.fr`
   - Password: `admin123`
3. Verify:
   - ✅ Frontend loads
   - ✅ Can register/login
   - ✅ Products load
   - ✅ Admin panel accessible
   - ✅ API endpoints working

---

## 🔧 Custom Domains (Optional)

### Add Custom Domain to Frontend:

1. Go to Frontend service → **Settings** → **Domains**
2. Click **"Custom Domain"**
3. Enter your domain (e.g., `kayicom.com`)
4. Railway will provide DNS records to add
5. Add the DNS records to your domain provider
6. Wait for SSL certificate (usually 5-10 minutes)

### Add Custom Domain to Backend:

1. Go to Backend service → **Settings** → **Domains**
2. Click **"Custom Domain"**
3. Enter your subdomain (e.g., `api.kayicom.com`)
4. Add DNS records
5. **Update environment variables**:
   - Update `REACT_APP_BACKEND_URL` in Frontend to use new backend domain
   - Update `CORS_ORIGINS` in Backend to include new frontend domain
   - Update `FRONTEND_URL` in Backend to use new frontend domain

---

## 🔐 Environment Variables Summary

### Backend Variables:
```
MONGO_URL=<from MongoDB service>
DB_NAME=kayicom
CORS_ORIGINS=https://your-frontend.up.railway.app
FRONTEND_URL=https://your-frontend.up.railway.app
PORT=8000
```

### Frontend Variables:
```
REACT_APP_BACKEND_URL=https://your-backend.up.railway.app
PORT=3000
NODE_ENV=production
```

---

## 📊 Railway Service Structure

Your Railway project should have 3 services:
1. **MongoDB** - Database service
2. **Backend** - FastAPI service (root: `backend`)
3. **Frontend** - React service (root: `frontend`)

---

## 🔍 Troubleshooting

### Backend not starting?
- Check that `MONGO_URL` is set correctly
- Verify Root Directory is set to `backend`
- Check logs in Railway dashboard

### Frontend can't connect to backend?
- Verify `REACT_APP_BACKEND_URL` matches your backend URL
- Check CORS settings in backend
- Ensure both services are deployed

### MongoDB connection errors?
- Verify `MONGO_URL` format
- Check that MongoDB service is running
- Ensure `DB_NAME` matches

### Build fails?
- Check that Root Directory is set correctly
- Verify all dependencies in `requirements.txt` and `package.json`
- Check build logs in Railway dashboard

---

## 💰 Pricing

Railway offers:
- **$5 free credit** per month
- Pay-as-you-go pricing after that
- Typical cost: ~$10-20/month for a small app

---

## 🎉 You're Done!

Your KayiCom marketplace should now be live on Railway! 

Visit your frontend URL and start managing your digital marketplace.

---

## 📞 Need Help?

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check Railway logs: Service → **Deployments** → Click on deployment → **View Logs**

