# 🌐 Custom Domain Setup Guide for KayiCom

## 📋 Current Status

✅ **Backend**: Deployed and running on Railway  
✅ **Frontend**: Deployed and running on Railway  
✅ **Database**: MongoDB connected  
✅ **Environment Variables**: Configured for Railway URLs  

---

## 🎯 Step-by-Step Domain Setup

### Step 1: Add Custom Domain to Railway (Backend API)

1. **Go to Railway Dashboard:**
   - Open [railway.app](https://railway.app)
   - Select your **Backend service** (the one with Kayicom-beta)

2. **Add Custom Domain:**
   - Click **"Settings"** tab
   - Scroll down to **"Domains"** section
   - Click **"Add Domain"** button
   - Enter: `api.kayicom.com`
   - Click **"Add Domain"**

3. **Get DNS Records:**
   - Railway will show DNS records to add to your domain
   - **Copy these DNS records** (you'll need them in Step 2)

---

### Step 2: Add Custom Domain to Railway (Frontend)

1. **Go to Frontend Service:**
   - In Railway dashboard, select your **Frontend service**

2. **Add Custom Domain:**
   - Click **"Settings"** tab
   - Scroll down to **"Domains"** section
   - Click **"Add Domain"** button
   - Enter: `kayicom.com`
   - Click **"Add Domain"**

3. **Get DNS Records:**
   - Railway will show DNS records for `kayicom.com`
   - **Copy these DNS records** (different from backend)

---

### Step 3: Configure DNS Records in GoDaddy

1. **Login to GoDaddy:**
   - Go to [godaddy.com](https://godaddy.com)
   - Login to your account
   - Find your domain: `kayicom.com`

2. **Access DNS Settings:**
   - Click on your domain `kayicom.com`
   - Go to **"DNS"** section
   - Click **"Manage DNS"** or **"Add Record"**

3. **Add DNS Records for Backend (api.kayicom.com):**

   **For CNAME Record:**
   ```
   Type: CNAME
   Name: api
   Value: [RAILWAY_BACKEND_CNAME_VALUE]
   TTL: Auto or 1 Hour
   ```

   **For TXT Record (if required):**
   ```
   Type: TXT
   Name: _acme-challenge.api
   Value: [RAILWAY_TXT_VALUE]
   TTL: Auto or 1 Hour
   ```

4. **Add DNS Records for Frontend (kayicom.com):**

   **For CNAME Record:**
   ```
   Type: CNAME
   Name: api
   Value: 097uoczq.up.railway.app 
   TTL: Auto or 1 Hour,

   Second record:
    Type: CNAME
   Name: @
   Value:5ceqbpgp.up.railway.app 
   TTL: Auto or 1 Hour
   ```

   **For TXT Record (if required):**
   ```
   Type: TXT
   Name: _acme-challenge
   Value: [RAILWAY_TXT_VALUE]
   TTL: Auto or 1 Hour
   ```

   **For WWW Redirect (Optional):**
   ```
   Type: CNAME
   Name: www
   Value: kayicom.com
   TTL: Auto or 1 Hour
   ```

5. **Save DNS Changes:**
   - Click **"Save"** in GoDaddy
   - DNS changes can take **5-30 minutes** to propagate globally

---

### Step 4: Verify Domain Setup

1. **Check Railway Dashboard:**
   - Go back to each Railway service
   - Under **"Domains"** section, you should see:
     - ✅ **api.kayicom.com** - Connected (green)
     - ✅ **kayicom.com** - Connected (green)

2. **Test Domains:**
   - Open browser and go to: `https://kayicom.com`
     - Should load your frontend
   - Open browser and go to: `https://api.kayicom.com`
     - Should return: `{"status":"ok","message":"KayiCom API is running"}`

---

### Step 5: Update Environment Variables

**⚠️ IMPORTANT:** After domains are verified, update environment variables!

#### Backend Environment Variables:

Go to **Backend Service** → **Variables** tab:

**Update these variables:**
```
CORS_ORIGINS=https://kayicom.com,https://www.kayicom.com,http://localhost:3000
FRONTEND_URL=https://kayicom.com
```

#### Frontend Environment Variables:

Go to **Frontend Service** → **Variables** tab:

**Update this variable:**
```
REACT_APP_BACKEND_URL=https://api.kayicom.com
```

**Railway will automatically redeploy both services with new variables.**

---

## 🔍 DNS Troubleshooting

### If Domains Don't Connect:

1. **Check DNS Records:**
   - Go to [dnschecker.org](https://dnschecker.org)
   - Enter: `kayicom.com` and `api.kayicom.com`
   - Check if records are propagated globally

2. **Common Issues:**
   - **Wrong CNAME value**: Double-check Railway's CNAME value
   - **Missing TXT record**: Add the TXT record for SSL
   - **DNS not propagated**: Wait 24-48 hours
   - **GoDaddy caching**: Try clearing browser cache

3. **Test Commands:**
   ```bash
   # Test frontend
   curl https://kayicom.com

   # Test backend
   curl https://api.kayicom.com
   ```

---

## 🔐 SSL Certificate

Railway automatically provides **free SSL certificates** for all domains:
- ✅ `kayicom.com` - SSL enabled
- ✅ `api.kayicom.com` - SSL enabled
- ✅ `www.kayicom.com` - SSL enabled (if you add it)

---

## 📝 Domain Structure

Your final setup will be:

```
Main Site:    https://kayicom.com          (Frontend)
API:          https://api.kayicom.com       (Backend)
Optional:     https://www.kayicom.com      (Redirect to kayicom.com)
```

---

## ⚙️ Optional: WWW Redirect

If you want `www.kayicom.com` to redirect to `kayicom.com`:

1. **In GoDaddy DNS:**
   ```
   Type: CNAME
   Name: www
   Value: kayicom.com
   ```

2. **In Railway (Frontend):**
   - Add domain: `www.kayicom.com`
   - Railway will automatically redirect it

---

## 🧪 Testing Your Domain

After setup, test these features:

1. ✅ **Frontend Access:** `https://kayicom.com`
   - Homepage loads
   - Can browse products
   - Login/register works

2. ✅ **API Access:** `https://api.kayicom.com`
   - Returns API status
   - Frontend can communicate with backend

3. ✅ **SSL Certificate:** Padlock icon in browser

4. ✅ **Admin Panel:** `https://kayicom.com/admin`
   - Login with Info.kayicom.com@gmx.fr / admin123
   - All admin features work

5. ✅ **Mobile:** Test on phone/tablet

---

## 🆘 If Something Goes Wrong

### Domain Not Working:
1. Check Railway service status (green = connected)
2. Verify DNS records in GoDaddy
3. Use dnschecker.org to verify propagation
4. Clear browser cache

### API Not Responding:
1. Check `REACT_APP_BACKEND_URL` in frontend variables
2. Check `CORS_ORIGINS` in backend variables
3. Test API directly: `https://api.kayicom.com/api/stats/dashboard`

### SSL Issues:
1. Wait for SSL certificate (can take up to 24 hours)
2. Check if TXT records are added correctly

---

## 🎉 Final Result

After completion, your KayiCom will be live at:

🌟 **https://kayicom.com** - Your professional digital marketplace! 🚀

---

## 📞 Need Help?

- **Railway Support:** Check Railway docs or Discord
- **GoDaddy Support:** Contact GoDaddy if DNS issues
- **SSL Issues:** Usually resolves automatically in 24 hours

---

**Ready to go live? Follow these steps and your KayiCom will be running on your custom domain!** 🎊
