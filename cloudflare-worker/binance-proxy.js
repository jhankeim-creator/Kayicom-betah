/**
 * Cloudflare Worker: Binance API Proxy
 * 
 * Forwards requests to Binance API from Cloudflare's global edge network,
 * bypassing geo-restrictions on the origin server.
 * 
 * Supports two formats:
 * 1. Path-based: GET /sapi/v1/pay/transactions?timestamp=...
 * 2. Query-param: GET /?endpoint=/sapi/v1/pay/transactions&timestamp=...
 * 
 * SETUP:
 * 1. Go to Cloudflare Dashboard → Workers & Pages → Create Worker
 * 2. Paste this code
 * 3. Deploy
 * 4. Copy the Worker URL (e.g. https://binance-proxy.your-account.workers.dev)
 * 5. In KayiCom Admin Settings, set the Binance Proxy URL
 */

const BINANCE_BASES = [
  "https://api.binance.me",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api.binance.com",
];
const ALLOWED_PATHS = [
  "/sapi/v1/pay/transactions",
  "/sapi/v1/c2c/orderMatch/listUserOrderHistory",
];

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-MBX-APIKEY, Authorization",
        },
      });
    }

    const url = new URL(request.url);

    // Support both formats:
    // 1. ?endpoint=/sapi/v1/... (from backend _binance_api_call)
    // 2. /sapi/v1/... (path-based)
    let targetPath = url.searchParams.get("endpoint") || "";
    let searchParams = new URLSearchParams(url.search);

    if (targetPath) {
      // Query-param format: remove "endpoint" from forwarded params
      searchParams.delete("endpoint");
    } else {
      // Path-based format
      targetPath = url.pathname.replace(/^\/proxy/, "");
      searchParams = new URLSearchParams(url.search);
    }

    const allowed = ALLOWED_PATHS.some((p) => targetPath.startsWith(p));
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Path not allowed", path: targetPath }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const apiKey = request.headers.get("X-MBX-APIKEY") || "";
    const queryString = searchParams.toString();
    const suffix = queryString ? `?${queryString}` : "";

    for (const base of BINANCE_BASES) {
      const targetUrl = `${base}${targetPath}${suffix}`;
      try {
        const resp = await fetch(targetUrl, {
          method: request.method,
          headers: {
            "X-MBX-APIKEY": apiKey,
            "Content-Type": "application/json",
          },
        });
        const body = await resp.text();
        if (body.includes("restricted location")) {
          continue;
        }
        return new Response(body, {
          status: resp.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (e) {
        continue;
      }
    }

    return new Response(JSON.stringify({ code: -1, msg: "All endpoints restricted" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  },
};
