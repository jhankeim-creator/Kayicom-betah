const DEFAULT_SUBSCRIPTION_ORDERS_BASE = 1200;
const DEFAULT_SUBSCRIPTION_ORDERS_SPAN = 700;
const DEFAULT_CATEGORY_ORDERS_BASE = {
  giftcard: 1300,
  topup: 1250,
  service: 1180,
  subscription: DEFAULT_SUBSCRIPTION_ORDERS_BASE,
  default: 1120,
};
const DEFAULT_CATEGORY_ORDERS_SPAN = 750;
const NETFLIX_DEFAULT_ORDERS_COUNT = 1568;

const stableBucket = (value = '', size = 0) => {
  const max = Number(size) || 0;
  if (max <= 0) return 0;
  const source = String(value || 'default');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % max;
};

export const defaultOrdersCountForProduct = (product) => {
  if (!product || typeof product !== 'object') return 1200;
  const name = String(product.name || '').trim().toLowerCase();
  const category = String(product.category || '').trim().toLowerCase();
  const isSubscription = Boolean(product.is_subscription) || category === 'subscription';
  const seed = [
    String(product.id || ''),
    String(product.parent_product_id || ''),
    String(product.variant_name || ''),
    name,
    category,
  ].join('|');

  if (isSubscription && name.includes('netflix')) {
    return NETFLIX_DEFAULT_ORDERS_COUNT;
  }
  if (isSubscription) {
    return DEFAULT_SUBSCRIPTION_ORDERS_BASE + stableBucket(seed, DEFAULT_SUBSCRIPTION_ORDERS_SPAN);
  }
  const base = DEFAULT_CATEGORY_ORDERS_BASE[category] || DEFAULT_CATEGORY_ORDERS_BASE.default;
  return base + stableBucket(seed, DEFAULT_CATEGORY_ORDERS_SPAN);
};

export const normalizeOrdersCount = (product) => {
  const defaultValue = defaultOrdersCountForProduct(product);
  const parsed = Number(product?.orders_count);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.max(Math.floor(parsed), defaultValue);
};

