// pages/api/analyze.js
// KENOS — Gemini 2.5 Pro 분석 엔진 (Google AI Studio API).
// 거시·금리·환율·유가·VIX·실적일정·상관관계까지 명시적으로 평가.
//
// Google Search grounding으로 실시간 가격·뉴스·매크로 데이터 수집.
// 무료 한도: ~100 req/일 (우리 사용량 5~10 req/일 대비 10배 여유).
//
// Env var: GEMINI_API_KEY (Google AI Studio https://aistudio.google.com 에서 발급)

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

// 상관관계가 높은 종목 그룹 (한 그룹에서 과도한 동시 보유 방지)
const CORRELATION_GROUPS = {
  "semiconductors": ["NVDA","AMD","TSM","AVGO"],
  "megacap_tech":   ["MSFT","GOOGL","META","AMZN","AAPL"],
  "ev_battery":     ["TSLA","ALB"],
  "oil_majors":     ["XOM","CVX"],
  "solar":          ["ENPH","FSLR"],
  "autos":          ["TM","GM"],
  "speculative":    ["RKLB","IONQ","COIN","PLTR"],
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
  if (!CLAUDE_KEY) return res.status(500).json({ error: "Claude API 키 없음" });

  const { account, positions, risk, breaking_context } = req.body;
  const pv = Number(account.portfolio_value);
  const cash = Number(account.cash);
  const cashPct = (cash / pv) * 100;

  // 호출자(브라우저/auto-run)가 risk 객체를 보내면 그 임계값을 프롬프트에 반영
  // 없으면 기본 표준형 값으로 표시 (실제 강제는 코드가 함)
  const r = risk || {};
  const buyConfMin = r.BUY_CONF_MIN ?? 0.60;
  const sellProfitConfMin = r.SELL_PROFIT_CONF_MIN ?? 0.55;
  const sellLossConfMin = r.SELL_LOSS_CONF_MIN ?? 0.45;
  const stopLossPct = r.STOP_LOSS_PCT ?? -0.08;
  const takeProfitPct = r.TAKE_PROFIT_PCT ?? 0.25;
  const positionCapPct = r.POSITION_CAP_PCT ?? 0.12;
  const sectorCapPct = r.SECTOR_CAP_PCT ?? 0.30;
  const corrCapPct = r.CORR_GROUP_CAP_PCT ?? 0.20;
  const cashFloorPct = r.CASH_FLOOR_PCT ?? 0.15;
  const maxPositions = r.MAX_POSITIONS ?? 12;
  const profileName = r._profile_name || "BALANCED";
  const tierLabel = r._tier_label || "스몰";

  const holdingsDetail = positions?.length
    ? positions.map(p => {
        const cost = Number(p.avg_entry_price);
        const cur  = Number(p.current_price);
        const qty  = Number(p.qty);
        const mv   = cur * qty;
        const pnlPct = ((cur - cost) / cost) * 100;
        const weight = (mv / pv) * 100;
        return `${p.symbol}: ${qty}주 @ avg $${cost.toFixed(2)} → 현재 $${cur.toFixed(2)} | P&L ${pnlPct.toFixed(1)}% | 비중 ${weight.toFixed(1)}%`;
      }).join("\n  ")
    : "없음";

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday:"long", month:"long", day:"numeric", year:"numeric"
  });

  // Breaking-news context — populated by /api/news-poll when it triggers this analysis.
  // Format: { headlines: [{title, source, pubDate, severity, impacted_tickers}], detected_at }
  const breakingBlock = breaking_context && Array.isArray(breaking_context.headlines) && breaking_context.headlines.length > 0
    ? `

═══════════════════════════════════════════════════════════
BREAKING CONTEXT — these headlines triggered this off-cycle analysis.
Treat them as verified HIGH severity. INCLUDE them in your news output:
═══════════════════════════════════════════════════════════
${breaking_context.headlines.map((h, i) =>
  `${i+1}. [${(h.source||"?")}] ${h.title}${h.pubDate ? ` (${h.pubDate})` : ""}${h.impacted_tickers?.length ? ` → ${h.impacted_tickers.join(",")}` : ""}`
).join("\n")}
Detected: ${breaking_context.detected_at || "just now"}
`
    : "";

  const prompt = `You are KENOS — a disciplined, professional AI trading strategist for a US paper-trading account.
Operate with humility (κένωσις): when signals conflict, the default is HOLD. Never force trades.

DATE: ${dateStr}${breakingBlock}

ACTIVE PROFILE: ${profileName} (capital tier: ${tierLabel})
- This profile dictates how aggressively you should score and recommend.
- CONSERVATIVE → require strong multi-axis confirmation. Default to HOLD unless conviction is high.
- BALANCED    → standard scoring. Trade when edge is clear.
- AGGRESSIVE  → accept momentum trades with looser confirmation. Take more shots, accept wider stops.

ACCOUNT STATE:
- Portfolio Value: $${pv.toFixed(2)}
- Cash: $${cash.toFixed(2)} (${cashPct.toFixed(1)}%)
- Holdings:
  ${holdingsDetail}

UNIVERSE (watchlist):
${Object.entries(SECTORS).map(([s,ts]) => `${s}: ${ts.join(", ")}`).join("\n")}

═══════════════════════════════════════════════════════════
RESEARCH PROTOCOL — perform ALL of the following web searches:
═══════════════════════════════════════════════════════════

[A] MACRO REGIME (assess overall risk environment)
  1. Latest Fed funds rate, next FOMC meeting date & market-implied rate path
  2. Most recent CPI / PPI / Core PCE / Non-farm payrolls release & next scheduled release date
  3. US Treasury yields: 2Y, 10Y, 30Y — note 10Y-2Y spread (inversion = recession signal)
  4. Credit spreads: HY OAS or HYG/LQD ratio (widening = risk-off)
  5. US Dollar Index (DXY) trend
  6. WTI Crude oil price & weekly change (>5% move = energy/inflation impact)
  7. VIX level (>20 = elevated fear, >30 = panic, <15 = complacency)
  8. Gold price (safe-haven flow indicator)
  9. Bitcoin price (risk-on/off proxy, also affects COIN directly)
 10. Geopolitical headlines — search ALL of these regions/themes (last 48h):
     a) Taiwan / China — semiconductor sanctions, military exercises (impacts TSM/AVGO/NVDA/AMD)
     b) Middle East — Israel/Iran/Gaza, Red Sea shipping (impacts XOM/CVX)
     c) Ukraine / Russia — war updates, energy infrastructure
     d) Korea — North Korea provocations, US/Korea/Japan trilateral
     e) Tariffs / trade — US-China tariffs, EU tariffs, USMCA
     f) Central banks — BOJ rate decisions, ECB policy, BOE
     g) US politics — Fed nominations, debt ceiling, government shutdown risk
     h) OPEC+ — output cuts, surprise meetings
     i) EU regulation — AI Act, DMA, antitrust on US tech giants
     j) Sanctions — new designations affecting traded sectors
     k) Climate / disasters — hurricanes, earthquakes affecting supply chains
     l) Health — pandemic / outbreak alerts

[B] PER-TICKER FUNDAMENTALS (for all holdings + top watchlist candidates)
 11. Current real-time price + today's % change + 5-day, 20-day trend
 12. Next earnings date (CRITICAL: NEVER open new positions within 3 trading days before earnings)
 13. Recent analyst rating changes (upgrades/downgrades within 7 days)
 14. Unusual volume (today's volume vs 20-day avg)
 15. Recent news sentiment (last 48h)
 16. Short interest if available (>20% = squeeze risk)

[C] FX & REGIONAL (for international exposure)
 17. USD/KRW (impacts EWY directly)
 18. USD/JPY (impacts TM)
 19. USD/TWD & China PMI (impacts TSM, AVGO, AAPL supply chain)

═══════════════════════════════════════════════════════════
DECISION FRAMEWORK
═══════════════════════════════════════════════════════════

Score each candidate ticker with three axes in [-1.0, +1.0]:

▸ TECHNICAL (35%): price trend, momentum (RSI/MACD if inferable), volume confirmation,
   support/resistance proximity, 20/50-day MA position.
   Volume rule: a price move without volume confirmation gets 50% score penalty.

▸ SENTIMENT (30%): analyst actions, news tone last 48h, social/retail mood.
   Penalize heavily (-0.4) if earnings within 3 trading days.

▸ MACRO (35%): score how the current macro regime favors THIS ticker specifically.
   - Rising 10Y yields → negative for long-duration tech (MSFT, GOOGL, growth)
   - Falling DXY → positive for EWY, TM, multinational exporters
   - Rising WTI → positive for XOM/CVX, negative for airlines/consumer
   - VIX > 25 → reduce all macro scores by 0.3 (defensive bias)
   - 10Y-2Y inversion deepening → reduce cyclicals, favor staples/quality
   - BTC trending → positive for COIN

Confidence = weighted sum of the three axes, then adjusted:
  +0.05 if 3-of-3 axes agree on direction
  -0.10 if any single axis is below -0.3 (one strong negative is a veto signal)
  -0.15 if VIX > 30 (panic regime — only highest-conviction trades)

═══════════════════════════════════════════════════════════
HARD RULES (the code will also enforce these — do NOT violate)
═══════════════════════════════════════════════════════════

R1. Confidence ≥ ${buyConfMin.toFixed(2)} required for any BUY.
R2. Confidence ≥ ${sellProfitConfMin.toFixed(2)} required for SELL of a profitable position.
    Confidence ≥ ${sellLossConfMin.toFixed(2)} required for SELL of a losing position (cut losses faster).
R3. Per-position cap: no single ticker may exceed ${(positionCapPct*100).toFixed(0)}% of portfolio value.
    If a holding has grown past this cap, recommend partial SELL to trim.
R4. Cash floor: maintain ≥ ${(cashFloorPct*100).toFixed(0)}% cash. Never recommend a BUY that breaches this.
R5. Sector cap: no single sector > ${(sectorCapPct*100).toFixed(0)}% of portfolio.
R6. Correlation cap: from any CORRELATION_GROUP, max 2-3 names AND combined ≤ ${(corrCapPct*100).toFixed(0)}%.
    Groups: semiconductors, megacap_tech, ev_battery, oil_majors, solar, autos, speculative.
R7. Earnings blackout: NO new BUY if earnings within 3 trading days.
    HOLD or trim instead. Existing positions may be sold pre-earnings if conf ≥ ${sellProfitConfMin.toFixed(2)}.
R8. Stop-loss: for each holding, recommend SELL if unrealized loss ≤ ${(stopLossPct*100).toFixed(0)}%
    AND macro/technical no longer support thesis.
R9. Take-profit: for each holding, recommend partial SELL if unrealized gain ≥ +${(takeProfitPct*100).toFixed(0)}%.
R10. VIX regime: if VIX > 30, only HOLD or SELL — no new BUYs unless very high conf.
R11. Fed week: if FOMC meeting is within 2 trading days, reduce all position sizes by 50%.
R12. Diversification: prefer adding to UNDER-represented sectors over piling into winners.
R13. Position count: maximum ${maxPositions} concurrent positions (capital tier limit).
R14. Drawdown awareness: if kill_switch object is in input, respect it — no new BUYs in DAILY_HALT or worse.

═══════════════════════════════════════════════════════════
OUTPUT — return ONLY raw JSON, no markdown, no commentary:
═══════════════════════════════════════════════════════════

{
  "regime": {
    "vix": 0.0,
    "vix_state": "calm|normal|elevated|panic",
    "fed_funds_rate": 0.0,
    "next_fomc_date": "YYYY-MM-DD or null",
    "fomc_within_2d": false,
    "us10y": 0.0,
    "us2y": 0.0,
    "yield_curve_bps": 0,
    "dxy": 0.0,
    "dxy_trend": "rising|falling|flat",
    "wti": 0.0,
    "wti_5d_pct": 0.0,
    "btc": 0.0,
    "gold": 0.0,
    "usdkrw": 0.0,
    "usdjpy": 0.0,
    "credit_spreads": "tightening|stable|widening",
    "overall_risk_regime": "risk_on|neutral|risk_off|panic"
  },
  "prices": {"TICKER": 0.00},
  "earnings_calendar": {"TICKER": "YYYY-MM-DD or null"},
  "decisions": [
    {
      "ticker": "NVDA",
      "action": "BUY|SELL|TRIM|HOLD",
      "qty": 2,
      "qty_pct_of_position": 0,
      "reasoning": "<100 chars, cite the dominant driver>",
      "tech": 0.0,
      "sent": 0.0,
      "macro": 0.0,
      "conf": 0.0,
      "axes_agree": false,
      "stop_loss_price": 0.00,
      "take_profit_price": 0.00,
      "earnings_blackout": false,
      "limit_price": 0.00,
      "rule_violations": []
    }
  ],
  "portfolio_health": {
    "sector_concentration": {"sector_name": 0.0},
    "correlation_warnings": ["semiconductors: 3 names = 28% (over 20% cap)"],
    "rebalance_needed": false
  },
  "market": "2-sentence overview of regime and dominant theme",
  "news": [
    {
      "headline": "Full headline text (≤120 chars)",
      "severity": "HIGH|MEDIUM|LOW",
      "category": "geopolitical|macro|earnings|ma|regulatory|other",
      "impacted_tickers": ["NVDA", "TSM"],
      "ts_iso": "2026-05-22T14:30:00Z or null if unknown",
      "source": "Reuters|Bloomberg|... or 'web' if uncertain"
    }
  ],
  "risk": "LOW|MEDIUM|HIGH|EXTREME",
  "top_sector": "sector name",
  "outlook": "1-sentence forward view tied to upcoming catalysts"
}

NEWS RULES:
- Return 8-12 news items. NEVER less than 5.
- Order by severity (HIGH first), then by recency.
- severity HIGH = market-moving (Fed decision, war escalation, major earnings beat/miss,
  bankruptcy, surprise rate change, ≥5% index move, breaking-news ticker downgrade).
- severity MEDIUM = ticker-specific guidance, M&A talks, analyst rating change,
  regional economic data, central-bank speakers.
- severity LOW = routine market commentary, scheduled report previews.
- impacted_tickers: tickers from the watchlist that this news likely moves.
  Empty array if no direct impact. NEVER guess broad market reaction here.
- If a "BREAKING CONTEXT" section appears in this prompt, you MUST include those
  headlines (already verified breaking) with HIGH severity in your news array.`;

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
        max_tokens: 8000,   // raised from 4500 — long structured output needs room
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";

    const parsed = extractJson(text);
    if (!parsed) {
      return res.status(500).json({
        error: "AI response not parseable as JSON",
        snippet: text.slice(0, 300),
      });
    }
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Robust JSON extraction from LLM output.
// Handles common failure modes: markdown fences, trailing commas, missing commas
// between array elements, and stray text around the JSON object.
function extractJson(text) {
  if (!text) return null;

  // 1) Strip markdown code fences if Claude wraps the JSON in ```json … ```
  let s = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/g, "").trim();

  // 2) Slice from first '{' to the matching last '}' to drop any surrounding prose
  const start = s.indexOf("{");
  const end   = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  s = s.slice(start, end + 1);

  // First attempt: raw parse
  try { return JSON.parse(s); } catch (e) { /* fall through to repair */ }

  // 3) Common LLM JSON mistakes — best-effort fixes
  let repaired = s;

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");

  // Insert missing commas between array elements: }{ ][ "}{
  repaired = repaired.replace(/}\s*\n\s*{/g, "},\n{");
  repaired = repaired.replace(/]\s*\n\s*\[/g, "],\n[");
  repaired = repaired.replace(/"\s*\n\s*"/g, '",\n"');

  // Fix unescaped newlines inside strings: replace \n inside "..." with space
  // (cautious — only if the string isn't already escaped properly)
  repaired = repaired.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (m) =>
    m.replace(/\n/g, "\\n").replace(/\r/g, "\\r")
  );

  try { return JSON.parse(repaired); } catch (e) {
    console.warn("[analyze.js] JSON repair failed:", e.message);
    console.warn("[analyze.js] Snippet around failure:", repaired.slice(Math.max(0, (e.message.match(/position (\d+)/)?.[1] | 0) - 50), (e.message.match(/position (\d+)/)?.[1] | 0) + 50));
    return null;
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
