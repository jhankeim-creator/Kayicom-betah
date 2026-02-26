const BINANCE_BASES = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
];

const ALLOWED_PATHS = [
  "/sapi/v1/pay/transactions",
  "/sapi/v1/c2c/orderMatch/listUserOrderHistory",
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-MBX-APIKEY");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { path, ...queryParams } = req.query;
  if (!path) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  const targetPath = "/" + (Array.isArray(path) ? path.join("/") : path);
  const allowed = ALLOWED_PATHS.some((p) => targetPath.startsWith(p));
  if (!allowed) {
    return res.status(403).json({ error: "Path not allowed" });
  }

  const qs = new URLSearchParams(queryParams).toString();
  const apiKey = req.headers["x-mbx-apikey"] || "";

  for (const base of BINANCE_BASES) {
    const url = `${base}${targetPath}${qs ? "?" + qs : ""}`;
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "X-MBX-APIKEY": apiKey,
          "Content-Type": "application/json",
        },
      });
      const data = await resp.json();
      const msg = String(data.msg || data.message || "").toLowerCase();
      if (msg.includes("restricted location")) {
        continue;
      }
      return res.status(200).json(data);
    } catch (e) {
      continue;
    }
  }

  return res.status(502).json({
    code: -1,
    msg: "All Binance API endpoints returned restricted location error",
  });
}
