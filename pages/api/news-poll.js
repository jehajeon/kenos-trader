// pages/api/news-poll.js
// Free-tier breaking news poller.
// Runs every 30 min via GitHub Actions cron during US market hours.
// Fetches RSS feeds in parallel, classifies severity by keyword regex (NO LLM),
// and triggers /api/auto-run on HIGH severity (off-cycle "breaking" analysis).
//
// Cost: $0 — pure RSS + regex classification (no LLM in this endpoint).
// LLM (Gemini 2.5 Pro) invoked only when HIGH severity detected → triggers auto-run.

const FEEDS = [
  // Markets / business
  { name: "MarketWatch",   url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { name: "CNBC",          url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { name: "Investing.com", url: "https://www.investing.com/rss/news.rss" },
];

// Watchlist tickers used for impact extraction
const TICKERS = [
  "EWY","MRNA","ABBV","REGN","XOM","CVX","NEE","TSLA","ALB",
  "NVDA","AMD","TSM","AVGO","MSFT","GOOGL","META","PLTR","AMZN",
  "ENPH","FSLR","TM","GM","RKLB","IONQ","AAPL","COIN",
];

// Severity keyword tables — regex-friendly tokens, lowercased
const HIGH_KEYWORDS = [
  // Macro shocks
  /\b(fed|fomc|powell)\s+(rate|cut|hike|emergency|surprise|hawkish|dovish)/i,
  /\bemergency\s+(rate|meeting|cut|hike)/i,
  /\b(circuit\s+breaker|market\s+halt|trading\s+halt)/i,
  /\b(cpi|ppi|nfp|payrolls?)\s+(beat|miss|shock|surprise|hot|cold)/i,
  /\b(recession|depression|crisis|crash|collapse|meltdown)/i,
  // Geopolitics
  /\b(war|invasion|missile|airstrike|attack|bombing|killed)\b/i,
  /\b(taiwan|china).{0,40}(military|invasion|sanctions|chip|semiconductor\s+ban)/i,
  /\b(iran|israel|gaza|red\s+sea).{0,40}(strike|attack|war|escalat)/i,
  /\b(north\s+korea|kim\s+jong).{0,40}(missile|nuclear|test|launch)/i,
  /\b(tariff|sanctions?)\s+(new|imposed|announced|expanded|on\s+china|on\s+russia)/i,
  /\b(opec).{0,30}(cut|surprise|emergency|production)/i,
  // Corporate / single-stock shocks
  /\b(bankrupt|chapter\s+11|delisting|going\s+private)/i,
  /\b(downgrade|cut)\s+(to\s+junk|to\s+sell)/i,
  /\b(beats?|misses?|cuts?)\s+(guidance|estimates?|forecast|outlook)/i,
  /\b(fraud|scandal|investigation|sec\s+charges|doj\s+probe)/i,
  /\b(acquisition|merger|buyout)\s+(deal|announced|approved|completed)/i,
  // Disasters
  /\b(earthquake|hurricane|tsunami|outbreak|pandemic)\b/i,
];

const MEDIUM_KEYWORDS = [
  /\b(analyst|rating)\s+(upgrade|downgrade|raised|cut|target)/i,
  /\b(guidance|outlook|forecast)\s+(raised|lowered|reiterated|withdrawn)/i,
  /\b(price\s+target|pt)\s+(raised|lowered|cut)/i,
  /\b(jobless\s+claims|retail\s+sales|gdp|pmi|consumer\s+confidence)\b/i,
  /\b(boj|ecb|boe|bank\s+of\s+japan|european\s+central\s+bank)/i,
  /\b(strike|union|labor\s+dispute)\b/i,
  /\b(dividend|buyback|stock\s+split)/i,
];

async function fetchFeed(feed) {
  try {
    const r = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KENOS-Bot/1.0)" },
      // Cap fetch time to keep total endpoint under serverless timeout
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRssItems(xml, feed.name);
  } catch (e) {
    console.warn(`[news-poll] feed ${feed.name} failed:`, e.message);
    return [];
  }
}

// Minimal RSS 2.0 / Atom XML parser — regex-based, no deps.
// Returns: [{ title, link, pubDate, description, source }]
function parseRssItems(xml, sourceName) {
  const items = [];
  // RSS 2.0 <item>...</item> blocks
  const itemMatches = xml.matchAll(/<item\b[\s\S]*?<\/item>/gi);
  for (const m of itemMatches) {
    const block = m[0];
    const title = extractTag(block, "title");
    const link  = extractTag(block, "link");
    const date  = extractTag(block, "pubDate") || extractTag(block, "dc:date");
    const desc  = extractTag(block, "description");
    if (title) items.push({ title, link, pubDate: date, description: desc, source: sourceName });
  }
  // Atom <entry>...</entry> blocks (Yahoo, Atom feeds)
  if (items.length === 0) {
    const entryMatches = xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi);
    for (const m of entryMatches) {
      const block = m[0];
      const title = extractTag(block, "title");
      const date  = extractTag(block, "updated") || extractTag(block, "published");
      const desc  = extractTag(block, "summary") || extractTag(block, "content");
      const link  = (block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1];
      if (title) items.push({ title, link, pubDate: date, description: desc, source: sourceName });
    }
  }
  return items;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  let text = m[1].trim();
  // CDATA unwrap
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) text = cdata[1].trim();
  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
             .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return text;
}

function classifySeverity(text) {
  const lower = (text || "").toLowerCase();
  for (const re of HIGH_KEYWORDS)   if (re.test(lower)) return "HIGH";
  for (const re of MEDIUM_KEYWORDS) if (re.test(lower)) return "MEDIUM";
  return "LOW";
}

function extractTickers(text) {
  if (!text) return [];
  const found = new Set();
  for (const t of TICKERS) {
    // Match $TICKER, (TICKER), or whole-word TICKER (case-sensitive to avoid common words)
    const re = new RegExp(`(?:\\$|\\(|\\b)${t}(?:\\)|\\b)`);
    if (re.test(text)) found.add(t);
  }
  return Array.from(found);
}

export default async function handler(req, res) {
  // 1) Auth
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers["x-cron-secret"] !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // 2) Fetch all feeds in parallel
  const allItems = (await Promise.all(FEEDS.map(fetchFeed))).flat();

  // 3) Filter to last 35 minutes (slight overlap with 30-min cron to avoid gaps)
  const cutoff = Date.now() - 35 * 60 * 1000;
  const recent = allItems.filter(it => {
    if (!it.pubDate) return true; // include unknowns rather than drop
    const t = new Date(it.pubDate).getTime();
    return !isNaN(t) && t >= cutoff;
  });

  // 4) Classify each headline
  const scored = recent.map(it => {
    const blob = `${it.title} ${it.description || ""}`;
    return {
      title: it.title,
      link: it.link,
      source: it.source,
      pubDate: it.pubDate,
      severity: classifySeverity(blob),
      impacted_tickers: extractTickers(blob),
    };
  });

  // 5) Sort: HIGH first, then MEDIUM, then LOW; within same severity newest first
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  scored.sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
  });

  const highEvents = scored.filter(s => s.severity === "HIGH").slice(0, 6);

  // 6) If HIGH severity found, trigger /api/auto-run with breaking context
  let triggered = false;
  let triggerStatus = null;
  if (highEvents.length > 0) {
    try {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const autoRunRes = await fetch(`${proto}://${host}/api/auto-run?reason=breaking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": expected || "",
        },
        body: JSON.stringify({
          breaking_context: {
            detected_at: new Date().toISOString(),
            headlines: highEvents.map(e => ({
              title: e.title,
              source: e.source,
              pubDate: e.pubDate,
              severity: e.severity,
              impacted_tickers: e.impacted_tickers,
            })),
          },
        }),
      });
      triggered = true;
      triggerStatus = autoRunRes.status;
    } catch (e) {
      console.warn("[news-poll] failed to trigger auto-run:", e.message);
      triggerStatus = "error: " + e.message;
    }
  }

  return res.status(200).json({
    polled_at: new Date().toISOString(),
    feeds_count: FEEDS.length,
    items_total: allItems.length,
    items_recent: recent.length,
    high_count: highEvents.length,
    medium_count: scored.filter(s => s.severity === "MEDIUM").length,
    low_count:    scored.filter(s => s.severity === "LOW").length,
    triggered,
    trigger_status: triggerStatus,
    high_events: highEvents,
    sample: scored.slice(0, 15),
  });
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
