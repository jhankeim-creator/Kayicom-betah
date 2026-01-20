# KayiCom - Professional Digital Marketplace

Caribbean's #1 Digital Marketplace for gift cards, game top-ups, subscriptions, and digital services.

## 🌟 Key Features

### For Customers
- **Multi-Category Marketplace**: Gift Cards, Game Top-Ups, Subscriptions (2-24 months), Digital Services
- **Multiple Payment Methods**:
  - Cryptocurrency (Automatic via Plisio): Bitcoin, Ethereum, USDT
  - Manual Payments: PayPal, Skrill, MonCash, Binance Pay, Zelle, Cash App
- **Instant Delivery**: Automatic delivery for most products
- **Subscription Auto-Check**: System monitors subscription validity automatically
- **Multi-Language**: English & French supported
- **24/7 Support**: Customer service always available

### For Administrators
- **Complete Dashboard**: Real-time statistics
- **Product Management**: Full CRUD with subscription duration options (2, 6, 12, 24 months)
- **Order Management**: Approve/reject manual payments, mark orders complete
- **Subscription Monitoring**: Auto-check system for subscription validity
- **Site Customization**: Logo, colors, API keys, all configurable

## 🎨 Design Features

- **Dark Professional Theme**: Modern dark navy with cyan/blue gradients
- **Responsive Design**: Perfect on mobile (2 columns), tablet, and desktop
- **Trustpilot Integration**: Display trust badges and ratings
- **Background Images**: Professional category images
- **Trust Badges**: 24/7 Support, 100K+ Customers, <5min Delivery, 99.9% Success Rate

## 💳 Payment Methods

### Automatic Payment
- **Cryptocurrency via Plisio**: Bitcoin, Ethereum, USDT, and 30+ cryptocurrencies

### Manual Payments (with proof verification)
- **PayPal**: Upload transaction proof
- **Skrill**: Upload transaction proof
- **MonCash**: Upload transaction proof
- **Binance Pay**: Upload transaction proof
- **Zelle**: Upload transaction proof
- **Cash App**: Upload transaction proof

## 📦 Product Categories

### 1. Gift Cards
- iTunes, Steam, Amazon, Google Play
- Instant digital delivery
- Email code delivery

### 2. Game Top-Ups
- Free Fire, Mobile Legends, PUBG Mobile
- Instant account top-up
- Player ID based delivery

### 3. Subscriptions (Auto-Monitored)
- **Netflix Premium**: 2, 6, 12, 24 months
- **Spotify Premium**: 6, 12 months
- **Auto-Check System**: Monitors subscription validity
- **Duration Options**: Choose 2, 6, 12, or 24-month plans

### 4. Digital Services
- Verified PayPal Account Creation
- Stripe Account Setup & Verification
- TextNow Premium Numbers
- Manual delivery with support

## 🔐 Admin Access

**Email**: Info.kayicom.com@gmx.fr
**Password**: admin123

⚠️ **IMPORTANT**: Change password after first login!

## ⚙️ Configuration

### API Keys Setup
Go to **Admin Panel > Settings > API Keys**:

- **Plisio API Key**: For crypto payments (get from plisio.net)
- **Resend API Key**: For email notifications
- Settings for MTCGame, GoSplit, Z2U product integrations

### Site Customization
**Admin Panel > Settings > Appearance**:
- Upload custom logo
- Change primary & secondary colors
- Configure support email

## 🌍 Language Support

- **English (EN)**: Default language
- **French (FR)**: Full translation
- Language switcher in navbar (globe icon)
- Saves preference in localStorage

## 📊 Subscription Management

### Auto-Check System
- System automatically monitors subscription validity
- Checks status daily for active subscriptions
- Notifies customers if subscription expires early
- Renewal reminders before expiration

### Duration Options
- **2 Months**: Short-term trial
- **6 Months**: Mid-term commitment
- **12 Months**: Full year (most popular)
- **24 Months**: Best value long-term

## 🚀 Getting Started

### Customer Flow
1. Browse products by category
2. Add to cart
3. Checkout
4. Choose payment method:
   - Crypto: Automatic payment via Plisio
   - Manual: Upload proof after payment
5. Track order status
6. Receive digital products instantly (or within 24h for manual)

### Admin Flow
1. Login to admin panel
2. Manage products (add subscription durations)
3. Review and approve manual payments
4. Monitor subscription auto-checks
5. Configure API keys and site settings

## 📱 Mobile Optimized

- **2 Column Layout**: Products display in 2 columns on mobile
- **Responsive Navigation**: Hamburger menu on mobile
- **Touch Optimized**: All buttons and cards touch-friendly
- **Fast Loading**: Optimized images and assets

## 🎯 Sample Products Included

- iTunes Gift Card $25
- Steam Wallet $50
- Amazon Gift Card $100
- Free Fire 1080 Diamonds
- Mobile Legends 500 Diamonds
- PUBG Mobile 1800 UC
- Netflix Premium (2, 6, 12, 24 months)
- Spotify Premium (6, 12 months)
- Verified PayPal Account Service
- Stripe Account Setup Service
- TextNow Premium Number

## 🔧 Technical Stack

**Backend:**
- FastAPI (Python)
- MongoDB with Motor (async)
- Pydantic for data validation
- PassLib for password hashing
- Requests for API calls

**Frontend:**
- React 19
- React Router for navigation
- Axios for API calls
- Shadcn/UI components
- Tailwind CSS for styling
- Sonner for toast notifications
- Lucide React for icons

## 🌐 API Endpoints

### Products
- `GET /api/products` - List all products
- `GET /api/products?category=subscription` - Filter by category
- `POST /api/products` - Create product (admin)
- `PUT /api/products/{id}` - Update product (admin)

### Orders
- `POST /api/orders` - Create order
- `GET /api/orders?user_id={id}` - Get user orders
- `PUT /api/orders/{id}/status` - Update order status (admin)

### Payments
- `POST /api/payments/manual-proof` - Submit payment proof
- `POST /api/payments/plisio-callback` - Plisio webhook
- `GET /api/payments/plisio-status/{invoice_id}` - Check payment status

### Settings
- `GET /api/settings` - Get site settings
- `PUT /api/settings` - Update settings (admin)

## 🎨 Design Inspiration

Inspired by U7BUY.com with unique KayiCom branding:
- Professional dark theme
- Caribbean-focused marketplace
- Trust-building elements (Trustpilot, badges)
- Category-based navigation
- Featured products showcase
- Multi-language support

## 📞 Support

**Email**: support@kayicom.com  
**Available**: 24/7

---

**Built with ❤️ by Emergent AI**
**Site**: KayiCom - Caribbean's #1 Digital Marketplace
