export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const ALPACA_KEY    = process.env.ALPACA_KEY;
  const ALPACA_SECRET = process.env.ALPACA_SECRET;
  const ALPACA_URL    = "https://paper-api.alpaca.markets";
  if (!ALPACA_KEY || !ALPACA_SECRET) return res.status(500).json({ error: "Alpaca API 키 없음" });
  const { path, method = "GET", body = null } = req.body;
  try {
    const opts = { method, headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET, "Content-Type": "application/json" } };
    if (body && method !== "GET") opts.body = JSON.stringify(body);
    const r = await fetch(`${ALPACA_URL}${path}`, opts);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
}
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
