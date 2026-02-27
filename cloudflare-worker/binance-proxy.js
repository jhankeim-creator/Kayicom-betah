/**
 * Cloudflare Worker: Binance API Proxy
 * 
 * Forwards requests to Binance API from Cloudflare's global edge network,
 * bypassing geo-restrictions on the origin server.
 * 
 * Deploy this as a Cloudflare Worker and set the URL in Admin Settings.
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
    const targetPath = url.pathname.replace(/^\/proxy/, "");

    const allowed = ALLOWED_PATHS.some((p) => targetPath.startsWith(p));
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Path not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = request.headers.get("X-MBX-APIKEY") || "";

    for (const base of BINANCE_BASES) {
      const targetUrl = `${base}${targetPath}${url.search}`;
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
