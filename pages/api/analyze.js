// pages/api/analyze.js
// Claude AI 분석 API — 서버에서 실행 (API 키 안전하게 보관)

const SECTORS = {
  "🇰🇷 한국":    ["EWY"],
  "🔬 바이오":   ["MRNA","ABBV","REGN"],
  "⚡ 에너지":   ["XOM","CVX","NEE"],
  "🔋 배터리":   ["TSLA","ALB"],
  "💾 반도체":   ["NVDA","AMD","TSM","AVGO"],
  "🤖 AI/테크":  ["MSFT","GOOGL","META","PLTR","AMZN"],
  "🌱 환경":     ["ENPH","FSLR"],
  "🚗 자동차":   ["TM","GM"],
  "🚀 미래유망": ["RKLB","IONQ","AAPL","COIN"],
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
  if (!CLAUDE_KEY) return res.status(500).json({ error: "Claude API 키 없음" });

  const { account, positions } = req.body;
  const held = positions?.length
    ? positions.map(p => `${p.symbol}(${p.qty}주@$${Number(p.avg_entry_price).toFixed(2)})`).join(", ")
    : "없음";

  const prompt = `You are NEXUS, an expert AI trading strategist. Paper trading only.
Date: ${new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" })}

ALPACA ACCOUNT:
- Portfolio Value: $${Number(account.portfolio_value).toFixed(2)}
- Cash: $${Number(account.cash).toFixed(2)} (${((Number(account.cash)/Number(account.portfolio_value))*100).toFixed(1)}%)
- Holdings: ${held}

WATCHLIST:
${Object.entries(SECTORS).map(([s,ts]) => `${s}: ${ts.join(", ")}`).join("\n")}

PROTOCOL:
1. Search CURRENT real-time prices for all holdings + top 8 watchlist picks
2. Search latest market news, analyst upgrades, macro events
3. Ensemble analysis: Technical 35% + Sentiment 30% + Macro 35%
4. Only recommend if confidence ≥ 55%, max 12% per position, keep ≥15% cash

Return ONLY raw JSON:
{
  "prices": {"TICKER": 0.00},
  "decisions": [{"ticker":"NVDA","action":"BUY","qty":2,"reasoning":"<80chars","tech":0.0,"sent":0.0,"macro":0.0,"conf":0.0}],
  "market": "2-sentence overview",
  "news": ["h1","h2","h3"],
  "risk": "LOW|MEDIUM|HIGH",
  "top_sector": "sector",
  "outlook": "1-sentence forecast"
}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ error: "AI 응답 파싱 실패" });
    res.json(JSON.parse(m[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
