# 📋 DNS Records for kayicom.com Setup

## 🚀 Quick DNS Setup Reference

### Step 1: Get DNS Values from Railway

**Go to each Railway service and copy the DNS records:**

#### Backend Service (api.kayicom.com):
1. Go to Backend service → Settings → Domains
2. Click on "api.kayicom.com"
3. Copy the **CNAME value** and **TXT value**

#### Frontend Service (kayicom.com):
1. Go to Frontend service → Settings → Domains
2. Click on "kayicom.com"
3. Copy the **CNAME value** and **TXT value**

---

### Step 2: Add to GoDaddy DNS

**Login to GoDaddy** → Your domain `kayicom.com` → DNS Settings

---

## 📝 DNS Records to Add

### For Backend API (api.kayicom.com):

#### 1. CNAME Record:
```
Type: CNAME
Name: api
Value: [COPY FROM RAILWAY BACKEND CNAME]
TTL: 1 Hour (or Auto)
```

#### 2. TXT Record (for SSL):
```
Type: TXT
Name: _acme-challenge.api
Value: [COPY FROM RAILWAY BACKEND TXT]
TTL: 1 Hour (or Auto)
```

---

### For Frontend (kayicom.com):

#### 1. CNAME Record:
```
Type: CNAME
Name: @
Value: [COPY FROM RAILWAY FRONTEND CNAME]
TTL: 1 Hour (or Auto)
```

#### 2. TXT Record (for SSL):
```
Type: TXT
Name: _acme-challenge
Value: [COPY FROM RAILWAY FRONTEND TXT]
TTL: 1 Hour (or Auto)
```

---

### Optional: WWW Redirect:

#### CNAME Record:
```
Type: CNAME
Name: www
Value: kayicom.com
TTL: 1 Hour (or Auto)
```

---

## 🔍 Example (Replace with your Railway values):

### Backend (api.kayicom.com):
```
Type: CNAME
Name: api
Value: cname.railway.internal
TTL: 1 Hour

Type: TXT
Name: _acme-challenge.api
Value: railway-challenge-xyz123
TTL: 1 Hour
```

### Frontend (kayicom.com):
```
Type: CNAME
Name: @
Value: cname.railway.internal
TTL: 1 Hour

Type: TXT
Name: _acme-challenge
Value: railway-challenge-abc456
TTL: 1 Hour
```

---

## ⚡ Quick Checklist

- [ ] Get CNAME value from Railway Backend service
- [ ] Get TXT value from Railway Backend service
- [ ] Get CNAME value from Railway Frontend service
- [ ] Get TXT value from Railway Frontend service
- [ ] Add 2 DNS records for api.kayicom.com
- [ ] Add 2 DNS records for kayicom.com
- [ ] Optional: Add WWW redirect
- [ ] Save DNS changes in GoDaddy
- [ ] Wait 5-30 minutes for propagation
- [ ] Check Railway dashboard for "Connected" status
- [ ] Update environment variables in Railway
- [ ] Test https://kayicom.com

---

## 🎯 Final Test

After DNS propagation:

1. ✅ `https://kayicom.com` - Frontend loads
2. ✅ `https://api.kayicom.com` - API responds
3. ✅ SSL certificates work (padlock icon)
4. ✅ Admin login works: `Info.kayicom.com@gmx.fr` / `admin123`

---

## 🆘 DNS Not Working?

**Check these:**
1. **CNAME values match Railway exactly**
2. **TXT records added for SSL**
3. **Waited 30+ minutes for propagation**
4. **Cleared browser cache**
5. **Test with different browser**

Use [dnschecker.org](https://dnschecker.org) to verify propagation.

---

**Ready to set up your domain? Add these DNS records and you'll be live on kayicom.com! 🚀**

