import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";
import {
  PROFILES, CAPITAL_TIERS, CORRELATION_GROUPS,
  resolveRisk, getCapitalTier,
  computeDrawdowns, evaluateKillSwitch, KILL_SWITCH_LIMITS,
} from "../lib/risk-config";
import { tokens } from "../lib/design-tokens";

const { colors: c, spacing: s, type: t, radius: r, stripe } = tokens;

// ─────────────────────────────────────────────────────────────────────
// Domain config (sectors and ticker mapping kept from original)
// ─────────────────────────────────────────────────────────────────────
const SECTORS = {
  "KOREA":    ["EWY"],
  "BIO":      ["MRNA","ABBV","REGN"],
  "ENERGY":   ["XOM","CVX","NEE"],
  "BATTERY":  ["TSLA","ALB"],
  "SEMI":     ["NVDA","AMD","TSM","AVGO"],
  "AI/TECH":  ["MSFT","GOOGL","META","PLTR","AMZN"],
  "GREEN":    ["ENPH","FSLR"],
  "AUTO":     ["TM","GM"],
  "FUTURE":   ["RKLB","IONQ","AAPL","COIN"],
};
const TICKER_SECTOR = {};
Object.entries(SECTORS).forEach(([sec, ts]) => ts.forEach(tk => TICKER_SECTOR[tk] = sec));

// ─────────────────────────────────────────────────────────────────────
// API helper
// ─────────────────────────────────────────────────────────────────────
async function alpacaCall(path, method = "GET", body = null) {
  const res = await fetch("/api/alpaca", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, method, body }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────
// Primitive UI components
// ─────────────────────────────────────────────────────────────────────
function MStripe({ height = stripe.height, margin = 0 }) {
  return <div style={{ height, backgroundImage: stripe.backgroundImage, margin }} />;
}

function SectionHeader({ kicker, title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: s.lg, gap: s.md, flexWrap: "wrap" }}>
      <div>
        {kicker && <div style={{ ...t.label, color: c.muted, marginBottom: s.xs }}>{kicker}</div>}
        <h2 style={{ ...t.displayMD, color: c.onDark, margin: 0 }}>{title}</h2>
      </div>
      {right}
    </div>
  );
}

function Button({ children, onClick, disabled, variant = "outline", size = "md", title }) {
  const heights = { sm: 36, md: 44, lg: 52 };
  const pads = { sm: "0 16px", md: "0 24px", lg: "0 32px" };
  const variants = {
    outline:  { bg: "transparent",   color: c.onDark, border: `1px solid ${c.onDark}` },
    filled:   { bg: c.onDark,        color: c.canvas, border: `1px solid ${c.onDark}` },
    ghost:    { bg: "transparent",   color: c.muted,  border: `1px solid ${c.hairline}` },
    danger:   { bg: "transparent",   color: c.mRed,   border: `1px solid ${c.mRed}` },
  };
  const v = variants[variant] || variants.outline;
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      style={{
        ...t.button,
        background: v.bg, color: disabled ? c.muted : v.color,
        border: disabled ? `1px solid ${c.hairline}` : v.border,
        borderRadius: r.none,
        padding: pads[size], height: heights[size],
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 120ms, color 120ms",
      }}>
      {children}
    </button>
  );
}

function ToggleButton({ active, accent, onClick, children, title }) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        ...t.button, fontSize: 11, letterSpacing: "1.2px",
        background: active ? c.onDark : "transparent",
        color: active ? c.canvas : c.body,
        border: `1px solid ${active ? c.onDark : c.hairline}`,
        borderRadius: r.none,
        padding: "8px 14px", height: 32,
        cursor: "pointer",
        borderTop: active && accent ? `2px solid ${accent}` : `1px solid ${active ? c.onDark : c.hairline}`,
      }}>
      {children}
    </button>
  );
}

function StatCell({ label, value, sub, valueColor, accent }) {
  return (
    <div style={{
      background: c.surfaceSoft,
      borderTop: accent ? `2px solid ${accent}` : `1px solid ${c.hairlineStrong}`,
      padding: `${s.lg}px ${s.lg}px`,
      borderRadius: r.none,
    }}>
      <div style={{ ...t.label, color: c.muted, marginBottom: s.sm }}>{label}</div>
      <div style={{ ...t.statValue, color: valueColor || c.onDark }}>{value}</div>
      {sub && <div style={{ ...t.bodySM, color: c.muted, marginTop: s.xs }}>{sub}</div>}
    </div>
  );
}

function SpecCell({ label, value, sub, valueColor }) {
  return (
    <div style={{ background: c.surfaceSoft, padding: s.md, borderRadius: r.none, border: `1px solid ${c.hairlineStrong}` }}>
      <div style={{ ...t.labelSm, color: c.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ ...t.statValueSm, color: valueColor || c.onDark }}>{value}</div>
      {sub && <div style={{ ...t.caption, color: c.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Badge({ children, tone = "default" }) {
  const tones = {
    default:  { bg: "transparent",   color: c.onDark, border: c.hairline },
    profit:   { bg: c.profitSoft,    color: c.profit, border: c.profit },
    loss:     { bg: c.lossSoft,      color: c.loss,   border: c.loss },
    warning:  { bg: c.warningSoft,   color: c.warning,border: c.warning },
    info:     { bg: "transparent",   color: c.mBlueDark, border: c.mBlueDark },
    inverted: { bg: c.onDark,        color: c.canvas, border: c.onDark },
  };
  const v = tones[tone] || tones.default;
  return (
    <span style={{
      ...t.label, fontSize: 10, letterSpacing: "1.2px",
      display: "inline-block",
      background: v.bg, color: v.color, border: `1px solid ${v.border}`,
      padding: "3px 8px", borderRadius: r.none,
    }}>{children}</span>
  );
}

function Chart({ history, lineColor }) {
  if (!history || history.length < 2) {
    return (
      <div style={{ ...t.bodySM, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: c.muted }}>
        Run analysis to populate chart
      </div>
    );
  }
  const vals = history.map(h => h.v);
  const mn = Math.min(...vals) * 0.997, mx = Math.max(...vals) * 1.003, rng = mx - mn || 1;
  const W = 600, H = 100;
  const base = H - ((history[0].v - mn) / rng) * H;
  const pts = vals.map((v, i) => `${(i / Math.max(vals.length - 1, 1)) * W},${H - ((v - mn) / rng) * H}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill="url(#chartFill)" />
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="0" y1={base} x2={W} y2={base} stroke={c.hairline} strokeWidth="1" strokeDasharray="3,3" />
    </svg>
  );
}

function ScoreBar({ val, label }) {
  const col = val > 0.15 ? c.profit : val < -0.15 ? c.loss : c.warning;
  const pct = Math.min(Math.abs(val), 1) * 50;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", ...t.labelSm, color: c.muted, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: col }}>{val > 0 ? "+" : ""}{(val * 100).toFixed(0)}</span>
      </div>
      <div style={{ height: 2, background: c.surfaceElevated, position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: `${val < 0 ? 50 - pct : 50}%`, width: `${pct}%`, height: "100%", background: col }} />
        <div style={{ position: "absolute", top: -1, left: "50%", width: 1, height: 4, background: c.hairline }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [account,   setAccount]   = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders,    setOrders]    = useState([]);
  const [log,       setLog]       = useState([]);
  const [history,   setHistory]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [step,      setStep]      = useState("");
  const [err,       setErr]       = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [autoHours, setAutoHours] = useState(null);
  const [nextRun,   setNextRun]   = useState(null);
  const [countdown, setCountdown] = useState("");
  const [profile,   setProfile]   = useState("BALANCED");
  const autoRef = useRef(null);

  useEffect(() => {
    loadAccount();
    const saved  = localStorage.getItem("kenos_log");
    const savedH = localStorage.getItem("kenos_hist");
    const savedP = localStorage.getItem("kenos_profile");
    if (saved)  setLog(JSON.parse(saved));
    if (savedH) setHistory(JSON.parse(savedH));
    if (savedP && PROFILES[savedP]) setProfile(savedP);
  }, []);

  useEffect(() => {
    localStorage.setItem("kenos_profile", profile);
  }, [profile]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!nextRun) return;
      const diff = nextRun - Date.now();
      if (diff <= 0) { setCountdown("RUNNING SOON"); return; }
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), sec = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h > 0 ? h + "h " : ""}${m}m ${sec}s`);
    }, 1000);
    return () => clearInterval(id);
  }, [nextRun]);

  const loadAccount = async () => {
    try {
      const acc = await alpacaCall("/v2/account");
      const pos = await alpacaCall("/v2/positions");
      const ord = await alpacaCall("/v2/orders?status=all&limit=20");
      setAccount(acc); setPositions(pos); setOrders(ord);
      return { acc, pos };
    } catch (e) { setErr(e.message); return null; }
  };

  const runAnalysis = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null); setStep("Fetching real-time prices and news");
    const t1 = setTimeout(() => setStep("Running ensemble AI analysis"), 5000);
    const t2 = setTimeout(() => setStep("Executing orders via Alpaca"), 12000);
    try {
      const refreshed = await loadAccount();
      if (!refreshed) throw new Error("Account load failed");
      const { acc, pos } = refreshed;

      const portfolioValue = Number(acc.portfolio_value);
      const risk = resolveRisk(profile, portfolioValue);
      const drawdowns = computeDrawdowns({
        currentEquity: portfolioValue,
        lastEquity:    Number(acc.last_equity || portfolioValue),
        history,
      });
      const killSwitch = evaluateKillSwitch(drawdowns);

      const aiResp = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: acc, positions: pos, risk, kill_switch: killSwitch }),
      });
      if (!aiResp.ok) { const e = await aiResp.json(); throw new Error(e.error); }
      const ai = await aiResp.json();

      const vix = Number(ai.regime?.vix || 0);
      const fomcSoon = !!ai.regime?.fomc_within_2d;
      const panicRegime = vix >= risk.PANIC_VIX;

      const positionMV = {}, sectorMV = {};
      pos.forEach(p => {
        const mv = Number(p.current_price) * Number(p.qty);
        positionMV[p.symbol] = mv;
        const sec = TICKER_SECTOR[p.symbol] || "OTHER";
        sectorMV[sec] = (sectorMV[sec] || 0) + mv;
      });
      const groupOf = (ticker) => Object.entries(CORRELATION_GROUPS).find(([, ns]) => ns.includes(ticker))?.[0] || null;
      const groupExposure = (group, excludeTicker) => CORRELATION_GROUPS[group].reduce((a, tk) => {
        if (tk === excludeTicker || !positionMV[tk]) return a;
        return { mv: a.mv + positionMV[tk], names: a.names + 1 };
      }, { mv: 0, names: 0 });

      // Forced trades (stop-loss / take-profit / rebalance)
      const forcedDecisions = [];
      pos.forEach(p => {
        const cost = Number(p.avg_entry_price), cur = Number(p.current_price), qty = Number(p.qty);
        const pnlPct = (cur - cost) / cost;
        const weight = (cur * qty) / portfolioValue;
        if (pnlPct <= risk.STOP_LOSS_PCT) {
          forcedDecisions.push({ ticker: p.symbol, action: "SELL", qty, reasoning: `STOP-LOSS ${(pnlPct*100).toFixed(1)}%`, conf: 0.99, forced: "STOP_LOSS" });
        } else if (pnlPct >= risk.TAKE_PROFIT_PCT) {
          const trim = Math.max(1, Math.floor(qty * risk.TAKE_PROFIT_TRIM_PCT));
          forcedDecisions.push({ ticker: p.symbol, action: "SELL", qty: trim, reasoning: `TAKE-PROFIT +${(pnlPct*100).toFixed(1)}% (${(risk.TAKE_PROFIT_TRIM_PCT*100).toFixed(0)}% trim)`, conf: 0.99, forced: "TAKE_PROFIT" });
        } else if (weight > risk.POSITION_CAP_PCT) {
          const targetMV = portfolioValue * risk.POSITION_CAP_PCT;
          const excessMV = (cur * qty) - targetMV;
          const trim = Math.max(1, Math.ceil(excessMV / cur));
          forcedDecisions.push({ ticker: p.symbol, action: "SELL", qty: trim, reasoning: `REBALANCE ${(weight*100).toFixed(1)}% → ${(risk.POSITION_CAP_PCT*100).toFixed(0)}%`, conf: 0.99, forced: "POSITION_CAP" });
        }
      });

      const aiDecisions = (ai.decisions || []).filter(d => d.action !== "HOLD");
      const forcedTickers = new Set(forcedDecisions.map(d => d.ticker));
      const merged = [...forcedDecisions, ...aiDecisions.filter(d => !forcedTickers.has(d.ticker))];

      const executed = [], skipped = [];
      let runningCash = Number(acc.cash);

      for (const d of merged) {
        const price = ai.prices?.[d.ticker] || 0;
        if (!price) { skipped.push({ ticker: d.ticker, reason: "no price" }); continue; }
        const conf = d.conf || 0;
        const earningsBlackout = !!d.earnings_blackout;
        const isForced = !!d.forced;

        if (!isForced) {
          if (d.action === "BUY" && !killSwitch.allowAiBuy)  { skipped.push({ticker:d.ticker, reason:`killswitch ${killSwitch.level}`}); continue; }
          if ((d.action === "SELL" || d.action === "TRIM") && !killSwitch.allowAiSell) { skipped.push({ticker:d.ticker, reason:`killswitch ${killSwitch.level}`}); continue; }
        }

        try {
          if (d.action === "BUY" && d.qty > 0) {
            const reqConf = panicRegime ? risk.PANIC_BUY_CONF_MIN : risk.BUY_CONF_MIN;
            if (conf < reqConf) { skipped.push({ticker:d.ticker, reason:`conf ${conf.toFixed(2)} < ${reqConf}`}); continue; }
            if (earningsBlackout) { skipped.push({ticker:d.ticker, reason:"earnings blackout"}); continue; }

            const adjQty = fomcSoon ? Math.max(1, Math.floor(d.qty * 0.5)) : d.qty;
            const cost = price * adjQty;

            if (cost < risk.MIN_DOLLAR_PER_TRADE) { skipped.push({ticker:d.ticker, reason:`trade $${cost.toFixed(0)} < min $${risk.MIN_DOLLAR_PER_TRADE}`}); continue; }

            const heldTickers = Object.keys(positionMV).filter(tk => positionMV[tk] > 0);
            const alreadyHeld = (positionMV[d.ticker] || 0) > 0;
            if (!alreadyHeld && heldTickers.length >= risk.MAX_POSITIONS) { skipped.push({ticker:d.ticker, reason:`max ${risk.MAX_POSITIONS} positions reached`}); continue; }

            if (runningCash - cost < portfolioValue * risk.CASH_FLOOR_PCT) { skipped.push({ticker:d.ticker, reason:`cash floor ${(risk.CASH_FLOOR_PCT*100).toFixed(0)}%`}); continue; }

            const newPosMV = (positionMV[d.ticker] || 0) + cost;
            if (newPosMV / portfolioValue > risk.POSITION_CAP_PCT) { skipped.push({ticker:d.ticker, reason:`position cap ${(risk.POSITION_CAP_PCT*100).toFixed(0)}%`}); continue; }

            const sect = TICKER_SECTOR[d.ticker] || "OTHER";
            const newSectMV = (sectorMV[sect] || 0) + cost;
            if (newSectMV / portfolioValue > risk.SECTOR_CAP_PCT) { skipped.push({ticker:d.ticker, reason:`sector ${sect} cap`}); continue; }

            const grp = groupOf(d.ticker);
            if (grp) {
              const { mv: gmv, names: gnames } = groupExposure(grp, d.ticker);
              const newGrpMV = gmv + newPosMV;
              const newGrpNames = gnames + (alreadyHeld ? 0 : 1);
              if (newGrpMV / portfolioValue > risk.CORR_GROUP_CAP_PCT) { skipped.push({ticker:d.ticker, reason:`group ${grp} cap`}); continue; }
              if (newGrpNames > risk.CORR_GROUP_MAX_NAMES) { skipped.push({ticker:d.ticker, reason:`group ${grp} names`}); continue; }
            }

            const limitPrice = d.limit_price && d.limit_price > 0 ? d.limit_price : +(price * (1 + risk.LIMIT_SLIPPAGE_PCT)).toFixed(2);
            const order = await alpacaCall("/v2/orders", "POST", {
              symbol: d.ticker, qty: String(adjQty), side: "buy",
              type: "limit", limit_price: String(limitPrice), time_in_force: "day",
            });
            executed.push({ action: "BUY", ticker: d.ticker, qty: adjQty, price, limitPrice, orderId: order.id, forced: d.forced || null });
            runningCash -= cost;
            positionMV[d.ticker] = newPosMV;
            sectorMV[sect] = newSectMV;

          } else if (d.action === "SELL" || d.action === "TRIM") {
            const holding = pos.find(p => p.symbol === d.ticker);
            if (!holding) { skipped.push({ticker:d.ticker, reason:"not held"}); continue; }
            const heldQty = Number(holding.qty);
            const cost = Number(holding.avg_entry_price);
            const profitable = price > cost;
            const reqSellConf = isForced ? 0 : (profitable ? risk.SELL_PROFIT_CONF_MIN : risk.SELL_LOSS_CONF_MIN);
            if (conf < reqSellConf) { skipped.push({ticker:d.ticker, reason:`sell conf ${conf.toFixed(2)} < ${reqSellConf}`}); continue; }

            const sellQty = Math.min(heldQty, d.qty || heldQty);
            const limitPrice = d.limit_price && d.limit_price > 0 ? d.limit_price : +(price * (1 - risk.LIMIT_SLIPPAGE_PCT)).toFixed(2);
            const order = await alpacaCall("/v2/orders", "POST", {
              symbol: d.ticker, qty: String(sellQty), side: "sell",
              type: "limit", limit_price: String(limitPrice), time_in_force: "day",
            });
            executed.push({
              action: sellQty < heldQty ? "TRIM" : "SELL",
              ticker: d.ticker, qty: sellQty, price, limitPrice, orderId: order.id,
              pnl: (price - cost) * sellQty, forced: d.forced || null,
            });
            runningCash += price * sellQty;
            positionMV[d.ticker] = Math.max(0, (positionMV[d.ticker] || 0) - price * sellQty);
          }
        } catch (oe) {
          console.warn(`Order failed ${d.ticker}:`, oe.message);
          skipped.push({ ticker: d.ticker, reason: `order failed: ${oe.message}` });
        }
      }

      await new Promise(rr => setTimeout(rr, 1000));
      const final = await loadAccount();
      const finalAcc = final?.acc || acc;

      const entry = {
        id: Date.now(), ts: new Date().toISOString(),
        decisions: ai.decisions || [], market: ai.market, news: ai.news || [],
        risk: ai.risk || "MEDIUM", top_sector: ai.top_sector, outlook: ai.outlook,
        executed, skipped, regime: ai.regime || null,
        portfolio_health: ai.portfolio_health || null,
        value: Number(finalAcc.portfolio_value), cash: Number(finalAcc.cash),
        prices: ai.prices || {}, profile, tier: risk._tier_name,
        tierLabel: risk._tier_label, drawdowns, killSwitch,
      };
      const newLog = [entry, ...log].slice(0, 50);
      setLog(newLog); setExpanded(entry.id);
      localStorage.setItem("kenos_log", JSON.stringify(newLog));
      const newHist = [...history, { ts: new Date().toISOString(), v: Number(finalAcc.portfolio_value) }].slice(-200);
      setHistory(newHist);
      localStorage.setItem("kenos_hist", JSON.stringify(newHist));
    } catch (e) { setErr(e.message); }
    finally { clearTimeout(t1); clearTimeout(t2); setLoading(false); setStep(""); }
  }, [loading, log, history, profile]);

  useEffect(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    if (!autoHours) { setNextRun(null); return; }
    const ms = autoHours * 3600000;
    setNextRun(new Date(Date.now() + ms));
    autoRef.current = setInterval(() => { setNextRun(new Date(Date.now() + ms)); runAnalysis(); }, ms);
    return () => clearInterval(autoRef.current);
  }, [autoHours]);

  // Derived view-state
  const pv = account ? Number(account.portfolio_value) : 0;
  const ini = history.length ? history[0].v : pv;
  const pnlD = pv - ini, pnlP = ini ? (pnlD / ini) * 100 : 0, up = pnlD >= 0;
  const accentColor = up ? c.profit : c.loss;
  const days = history.length ? Math.floor((Date.now() - new Date(history[0].ts)) / 86400000) : 0;

  const currentRisk = pv > 0 ? resolveRisk(profile, pv) : null;
  const currentTier = pv > 0 ? getCapitalTier(pv) : null;
  const currentDrawdowns = account ? computeDrawdowns({
    currentEquity: pv,
    lastEquity:    Number(account.last_equity || pv),
    history,
  }) : null;
  const currentKillSwitch = currentDrawdowns ? evaluateKillSwitch(currentDrawdowns) : null;

  const sells = log.flatMap(e => e.executed || []).filter(e => e.action === "SELL");
  const winRate = sells.length ? ((sells.filter(e => (e.pnl || 0) > 0).length / sells.length) * 100).toFixed(0) : null;

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>KENOS — AI Ensemble Paper Trading</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="κένωσις — AI ensemble paper trading on Alpaca" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='black'/><text x='50' y='72' font-size='72' fill='white' text-anchor='middle' font-family='Inter' font-weight='700'>M</text></svg>" />
      </Head>

      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: ${c.canvas}; }
        body { font-family: ${t.fontFamily}; color: ${c.onDark}; }
        button { font-family: inherit; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${c.canvas}; }
        ::-webkit-scrollbar-thumb { background: ${c.hairline}; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        @keyframes scan  { 0% { transform: translateX(-100%) } 100% { transform: translateX(500%) } }
      `}</style>

      <div style={{ background: c.canvas, minHeight: "100vh", color: c.onDark }}>

        {/* ── TOP NAV ─────────────────────────────────── */}
        <header style={{
          height: 64, background: c.canvas, borderBottom: `1px solid ${c.hairline}`,
          padding: `0 ${s.xl}px`, display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: s.lg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <div style={{ width: 4, height: 24, background: c.mBlueLight }} />
              <div style={{ width: 4, height: 24, background: c.mBlueDark }} />
              <div style={{ width: 4, height: 24, background: c.mRed }} />
              <div style={{ ...t.titleLG, marginLeft: s.sm, color: c.onDark, letterSpacing: "0.5px", fontWeight: 700, textTransform: "uppercase" }}>
                KENOS
              </div>
              <div style={{ ...t.label, color: c.muted, marginLeft: s.md }}>× ALPACA · PAPER</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: s.lg }}>
            <span style={{ ...t.navLink, color: c.muted }}>DAY {days + 1}</span>
            {winRate && <span style={{ ...t.navLink, color: Number(winRate) > 50 ? c.profit : c.loss }}>WIN {winRate}%</span>}
            {nextRun && <span style={{ ...t.navLink, color: c.warning }}>NEXT {countdown}</span>}
          </div>
        </header>

        <MStripe />

        {/* ── HERO BAND (portfolio value as the "photography") ── */}
        {account && (
          <section style={{ padding: `${s.xxl}px ${s.xl}px ${s.xl}px`, borderBottom: `1px solid ${c.hairline}` }}>
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>
              <div style={{ ...t.label, color: c.muted, marginBottom: s.md }}>Portfolio</div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: s.xl, alignItems: "end" }}>
                <div>
                  <h1 style={{ ...t.displayXL, color: c.onDark, margin: 0 }}>
                    ${Number(pv).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h1>
                  <div style={{ display: "flex", gap: s.lg, marginTop: s.md, alignItems: "baseline" }}>
                    <span style={{ ...t.titleMD, color: accentColor }}>
                      {up ? "+" : "−"}${Math.abs(pnlD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ ...t.titleMD, color: accentColor }}>
                      {up ? "▲" : "▼"} {Math.abs(pnlP).toFixed(2)}%
                    </span>
                    <span style={{ ...t.bodySM, color: c.muted }}>since inception</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: s.sm, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Button variant="ghost" size="md" onClick={loadAccount}>Refresh</Button>
                  <Button variant="outline" size="md" disabled={loading} onClick={runAnalysis}>
                    {loading ? "Running…" : "▶ Run Analysis"}
                  </Button>
                </div>
              </div>

              {/* Loading bar */}
              {loading && (
                <div style={{ marginTop: s.lg, height: 2, background: c.surfaceCard, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "30%", background: c.onDark, animation: "scan 1.8s linear infinite" }} />
                </div>
              )}
              {loading && (
                <div style={{ ...t.label, color: c.body, marginTop: s.md, display: "flex", alignItems: "center", gap: s.sm }}>
                  <span style={{ width: 6, height: 6, background: c.onDark, animation: "pulse 1s infinite" }} />
                  {step}
                </div>
              )}
              {err && (
                <div style={{ ...t.bodySM, marginTop: s.md, padding: `${s.sm}px ${s.md}px`, background: c.lossSoft, border: `1px solid ${c.loss}`, color: c.loss }}>
                  ⚠ {err}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── PROFILE + AUTO ─────────────────────────── */}
        <section style={{ background: c.surfaceSoft, padding: `${s.lg}px ${s.xl}px`, borderBottom: `1px solid ${c.hairline}` }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: s.lg, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: s.md }}>
              <span style={{ ...t.label, color: c.muted }}>Intensity</span>
              <div style={{ display: "flex", gap: s.xs }}>
                {Object.entries(PROFILES).map(([key, p]) => {
                  const accent = key === "AGGRESSIVE" ? c.mRed : key === "CONSERVATIVE" ? c.mBlueLight : c.onDark;
                  return (
                    <ToggleButton key={key} active={profile === key} accent={accent}
                      onClick={() => setProfile(key)} title={p.description}>
                      {key}
                    </ToggleButton>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: s.md }}>
              <span style={{ ...t.label, color: c.muted }}>Auto</span>
              <div style={{ display: "flex", gap: s.xs }}>
                {[null, 4, 8, 24].map(h => (
                  <ToggleButton key={String(h)} active={autoHours === h} onClick={() => setAutoHours(h === autoHours ? null : h)}>
                    {h === null ? "Off" : `${h}h`}
                  </ToggleButton>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── SPEC ROW (4-up account stats) ──────────── */}
        {account && (
          <section style={{ padding: `${s.xxl}px ${s.xl}px`, borderBottom: `1px solid ${c.hairline}` }}>
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>
              <SectionHeader kicker="Account" title="Capital Snapshot" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1, background: c.hairline, border: `1px solid ${c.hairline}` }}>
                <StatCell label="Portfolio" value={`$${Number(pv).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
                <StatCell label="Cash" value={`$${Number(account.cash).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                  sub={`${((Number(account.cash) / pv) * 100).toFixed(1)}% of portfolio`} />
                <StatCell label="Positions" value={positions.length} sub={`${orders.filter(o => o.status === "filled").length} filled orders`} />
                <StatCell label="Buying Power" value={`$${Number(account.buying_power).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
              </div>
            </div>
          </section>
        )}

        {/* ── RISK PROFILE + KILL SWITCH ─────────────── */}
        {currentRisk && currentKillSwitch && (
          <section style={{ padding: `${s.xxl}px ${s.xl}px`, borderBottom: `1px solid ${c.hairline}` }}>
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>
              <SectionHeader
                kicker="Capital Management"
                title={`${profile} · ${currentTier.label.replace(/^[^A-Za-z]+\s*/, "")}`}
                right={currentKillSwitch.level !== "NORMAL" && (
                  <Badge tone={currentKillSwitch.severity >= 2 ? "loss" : "warning"}>{currentKillSwitch.level}</Badge>
                )}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 1, background: c.hairline, border: `1px solid ${c.hairline}`, marginBottom: s.lg }}>
                <SpecCell label="Buy Conf ≥" value={currentRisk.BUY_CONF_MIN.toFixed(2)} sub={`Panic ${currentRisk.PANIC_BUY_CONF_MIN.toFixed(2)}`} />
                <SpecCell label="Stop-Loss"  value={`${(currentRisk.STOP_LOSS_PCT*100).toFixed(0)}%`}  sub="Auto full exit" valueColor={c.loss} />
                <SpecCell label="Take-Profit" value={`+${(currentRisk.TAKE_PROFIT_PCT*100).toFixed(0)}%`} sub={`${(currentRisk.TAKE_PROFIT_TRIM_PCT*100).toFixed(0)}% trim`} valueColor={c.profit} />
                <SpecCell label="Per Position" value={`${(currentRisk.POSITION_CAP_PCT*100).toFixed(0)}%`} sub={`$${(pv*currentRisk.POSITION_CAP_PCT).toLocaleString("en-US", {maximumFractionDigits:0})}`} />
                <SpecCell label="Per Sector"   value={`${(currentRisk.SECTOR_CAP_PCT*100).toFixed(0)}%`} sub={`Group ${(currentRisk.CORR_GROUP_CAP_PCT*100).toFixed(0)}%`} />
                <SpecCell label="Cash Floor ≥" value={`${(currentRisk.CASH_FLOOR_PCT*100).toFixed(0)}%`} sub={`$${(pv*currentRisk.CASH_FLOOR_PCT).toLocaleString("en-US", {maximumFractionDigits:0})}`} />
                <SpecCell label="Max Positions" value={currentRisk.MAX_POSITIONS} sub={`Min trade $${currentRisk.MIN_DOLLAR_PER_TRADE}`} />
              </div>

              <div style={{ ...t.label, color: c.muted, marginBottom: s.sm }}>Drawdown Monitor</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: c.hairline, border: `1px solid ${c.hairline}` }}>
                {[
                  ["Daily P&L",   currentDrawdowns.daily,   KILL_SWITCH_LIMITS.DAILY_LOSS_HALT],
                  ["Weekly P&L",  currentDrawdowns.weekly,  KILL_SWITCH_LIMITS.WEEKLY_LOSS_HALT],
                  ["Monthly P&L", currentDrawdowns.monthly, KILL_SWITCH_LIMITS.MONTHLY_LOSS_HALT],
                ].map(([label, val, lim], i) => {
                  const breached = val <= lim;
                  const col = breached ? c.loss : val < 0 ? c.warning : c.profit;
                  return (
                    <SpecCell key={i}
                      label={label}
                      value={`${val > 0 ? "+" : ""}${(val * 100).toFixed(2)}%`}
                      sub={`Halt at ${(lim*100).toFixed(0)}%`}
                      valueColor={col}
                    />
                  );
                })}
              </div>

              {currentKillSwitch.reason && (
                <div style={{ ...t.bodySM, marginTop: s.md, padding: `${s.sm}px ${s.md}px`, background: c.lossSoft, border: `1px solid ${c.loss}`, color: c.loss }}>
                  KILL SWITCH — {currentKillSwitch.reason}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── MACRO REGIME ─────────────────────────── */}
        {log[0]?.regime && (
          <section style={{ padding: `${s.xxl}px ${s.xl}px`, borderBottom: `1px solid ${c.hairline}` }}>
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>
              <SectionHeader kicker="Macro" title="Regime"
                right={log[0].regime.overall_risk_regime && (
                  <Badge tone={log[0].regime.overall_risk_regime === "panic" ? "loss" : log[0].regime.overall_risk_regime === "risk_on" ? "profit" : "warning"}>
                    {log[0].regime.overall_risk_regime}
                  </Badge>
                )}
              />
              {(() => {
                const g = log[0].regime;
                const items = [
                  ["VIX", g.vix?.toFixed(1), g.vix_state, g.vix > 30 ? c.loss : g.vix > 20 ? c.warning : c.profit],
                  ["US 10Y", g.us10y?.toFixed(2) + "%", `2Y ${g.us2y?.toFixed(2)}%`, c.onDark],
                  ["10Y−2Y", `${g.yield_curve_bps}bps`, g.yield_curve_bps < 0 ? "Inverted" : "Normal", g.yield_curve_bps < 0 ? c.loss : c.profit],
                  ["DXY", g.dxy?.toFixed(2), g.dxy_trend, c.onDark],
                  ["WTI", `$${g.wti?.toFixed(2)}`, `5d ${g.wti_5d_pct > 0 ? "+" : ""}${g.wti_5d_pct?.toFixed(1)}%`, c.onDark],
                  ["BTC", `$${Math.round(g.btc || 0).toLocaleString()}`, "—", c.onDark],
                  ["GOLD", `$${Math.round(g.gold || 0).toLocaleString()}`, "—", c.onDark],
                  ["FOMC", g.next_fomc_date || "—", g.fomc_within_2d ? "Within 2d" : "Clear", g.fomc_within_2d ? c.loss : c.muted],
                  ["Credit", g.credit_spreads || "—", "spreads", g.credit_spreads === "widening" ? c.loss : c.profit],
                ];
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 1, background: c.hairline, border: `1px solid ${c.hairline}` }}>
                    {items.map(([label, val, sub, col], i) => (
                      <SpecCell key={i} label={label} value={val || "—"} sub={sub} valueColor={col} />
                    ))}
                  </div>
                );
              })()}
              {log[0].portfolio_health?.correlation_warnings?.length > 0 && (
                <div style={{ marginTop: s.md, padding: `${s.sm}px ${s.md}px`, background: c.warningSoft, border: `1px solid ${c.warning}`, ...t.bodySM, color: c.warning }}>
                  ⚠ {log[0].portfolio_health.correlation_warnings.join(" · ")}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── CHART + MARKET OUTLOOK 2-UP ─────────── */}
        {(history.length > 0 || log[0]) && (
          <section style={{ padding: `${s.xxl}px ${s.xl}px`, borderBottom: `1px solid ${c.hairline}` }}>
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>
              <SectionHeader kicker="Performance" title="Trend & Outlook" />
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: s.lg }}>
                <div style={{ background: c.surfaceSoft, border: `1px solid ${c.hairlineStrong}`, padding: s.lg, height: 200 }}>
                  <div style={{ ...t.label, color: c.muted, marginBottom: s.sm }}>Equity Curve</div>
                  <div style={{ height: 140 }}><Chart history={history} lineColor={accentColor} /></div>
                </div>
                <div style={{ background: c.surfaceSoft, border: `1px solid ${c.hairlineStrong}`, padding: s.lg }}>
                  <div style={{ ...t.label, color: c.muted, marginBottom: s.sm }}>AI Market Read</div>
                  <p style={{ ...t.bodyMD, color: c.bodyStrong, margin: 0, marginBottom: s.md }}>
                    {log[0]?.market || "Run analysis to populate."}
                  </p>
                  {log[0]?.outlook && (
                    <div style={{ ...t.bodySM, color: c.body, paddingTop: s.sm, borderTop: `1px solid ${c.hairlineStrong}` }}>
                      <span style={{ ...t.label, color: c.muted, marginRight: s.sm }}>Outlook</span>
                      {log[0].outlook}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── POSITIONS ──────────────────────────── */}
        <section style={{ padding: `${s.xxl}px ${s.xl}px`, borderBottom: `1px solid ${c.hairline}` }}>
          <div style={{ maxWidth: 1440, margin: "0 auto" }}>
            <SectionHeader kicker="Holdings" title="Positions" right={<Badge>{positions.length}</Badge>} />
            {positions.length === 0 ? (
              <div style={{ ...t.bodyMD, color: c.muted, padding: `${s.xl}px 0`, textAlign: "center", border: `1px solid ${c.hairline}` }}>
                No open positions — KENOS scanning for opportunities.
              </div>
            ) : (
              <div style={{ border: `1px solid ${c.hairline}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "100px 70px 110px 110px 130px 1fr", gap: s.md, padding: `${s.sm}px ${s.md}px`, background: c.surfaceSoft, borderBottom: `1px solid ${c.hairline}` }}>
                  {["Ticker","Qty","Avg","Current","P&L","Sector"].map((h,i)=>(
                    <div key={i} style={{ ...t.label, color: c.muted }}>{h}</div>
                  ))}
                </div>
                {positions.map(pos => {
                  const cost = Number(pos.avg_entry_price), cur = Number(pos.current_price), qty = Number(pos.qty);
                  const pd = (cur - cost) * qty, pp = ((cur - cost) / cost) * 100, pu = pd >= 0;
                  return (
                    <div key={pos.symbol} style={{ display: "grid", gridTemplateColumns: "100px 70px 110px 110px 130px 1fr", gap: s.md, padding: `${s.md}px`, borderBottom: `1px solid ${c.hairlineStrong}`, alignItems: "center" }}>
                      <div style={{ ...t.titleLG, color: c.onDark, fontWeight: 700 }}>{pos.symbol}</div>
                      <div style={{ ...t.bodyMD, color: c.body, fontVariantNumeric: "tabular-nums" }}>{qty}</div>
                      <div style={{ ...t.bodyMD, color: c.muted, fontVariantNumeric: "tabular-nums" }}>${cost.toFixed(2)}</div>
                      <div style={{ ...t.bodyMD, color: c.onDark, fontVariantNumeric: "tabular-nums" }}>${cur.toFixed(2)}</div>
                      <div style={{ fontVariantNumeric: "tabular-nums" }}>
                        <div style={{ ...t.bodyMD, color: pu ? c.profit : c.loss, fontWeight: 700 }}>{pu ? "+" : ""}${pd.toFixed(2)}</div>
                        <div style={{ ...t.caption, color: pu ? c.profit : c.loss }}>{pu ? "+" : ""}{pp.toFixed(2)}%</div>
                      </div>
                      <div style={{ ...t.label, color: c.muted }}>{TICKER_SECTOR[pos.symbol] || "OTHER"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── M STRIPE BREAK ─────────────────── */}
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: `${s.lg}px ${s.xl}px` }}>
          <MStripe />
        </div>

        {/* ── AI DECISION LOG ───────────────── */}
        <section style={{ padding: `${s.lg}px ${s.xl}px ${s.xxl}px`, borderBottom: `1px solid ${c.hairline}` }}>
          <div style={{ maxWidth: 1440, margin: "0 auto" }}>
            <SectionHeader kicker="Intelligence" title="AI Decision Log" right={<Badge>{log.length}</Badge>} />
            {log.length === 0 ? (
              <div style={{ ...t.bodyMD, color: c.muted, padding: `${s.xl}px 0`, textAlign: "center", border: `1px solid ${c.hairline}` }}>
                No analyses yet.
              </div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: "auto", border: `1px solid ${c.hairline}` }}>
                {log.map(entry => (
                  <div key={entry.id} style={{ borderBottom: `1px solid ${c.hairlineStrong}`, padding: s.md, background: c.surfaceSoft }}>
                    <div onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: s.sm, flexWrap: "wrap", gap: s.sm }}>
                      <div style={{ ...t.bodySM, color: c.muted }}>{new Date(entry.ts).toLocaleString("en-US")}</div>
                      <div style={{ display: "flex", gap: s.sm, alignItems: "center", flexWrap: "wrap" }}>
                        {entry.profile && <Badge>{entry.profile}</Badge>}
                        <span style={{ ...t.bodyMD, fontWeight: 700, color: c.onDark, fontVariantNumeric: "tabular-nums" }}>
                          ${entry.value?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <Badge tone={entry.risk === "HIGH" || entry.risk === "EXTREME" ? "loss" : entry.risk === "MEDIUM" ? "warning" : "profit"}>{entry.risk}</Badge>
                        {entry.executed?.length > 0 && <Badge tone="info">{entry.executed.length} exec</Badge>}
                        <span style={{ ...t.label, color: c.muted }}>{expanded === entry.id ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: s.xs }}>
                      {(entry.decisions || []).filter(d => d.action !== "HOLD").map((d, i) => (
                        <div key={i} style={{ display: "flex", gap: s.xs, alignItems: "center", border: `1px solid ${c.hairlineStrong}`, padding: "4px 8px", ...t.bodySM }}>
                          <Badge tone={d.action === "BUY" ? "profit" : "loss"}>{d.action}</Badge>
                          <span style={{ color: c.onDark, fontWeight: 700 }}>{d.ticker}</span>
                          <span style={{ color: c.body, fontWeight: 300 }}>{d.reasoning?.slice(0, 60)}</span>
                          <span style={{ color: c.muted, fontVariantNumeric: "tabular-nums" }}>{(d.conf * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                      {!(entry.decisions || []).filter(d => d.action !== "HOLD").length && (
                        <div style={{ ...t.bodySM, color: c.muted }}>HOLD — confidence below threshold</div>
                      )}
                    </div>

                    {expanded === entry.id && (
                      <div style={{ marginTop: s.md }}>
                        {(entry.decisions || []).filter(d => d.action !== "HOLD").slice(0, 3).length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: s.sm, marginBottom: s.md }}>
                            {(entry.decisions || []).filter(d => d.action !== "HOLD").slice(0, 3).map((d, i) => (
                              <div key={i} style={{ background: c.canvas, border: `1px solid ${c.hairlineStrong}`, padding: s.sm }}>
                                <div style={{ ...t.titleLG, color: c.onDark, marginBottom: s.xs }}>{d.ticker}</div>
                                <ScoreBar val={d.tech || 0}  label="Tech 35%" />
                                <ScoreBar val={d.sent || 0}  label="Sent 30%" />
                                <ScoreBar val={d.macro || 0} label="Macro 35%" />
                                <div style={{ display: "flex", justifyContent: "space-between", ...t.labelSm, color: c.muted, marginTop: 6 }}>
                                  <span>Confidence</span>
                                  <span style={{ color: c.onDark }}>{(d.conf * 100).toFixed(0)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {entry.skipped?.length > 0 && (
                          <div style={{ marginBottom: s.sm, padding: s.sm, border: `1px solid ${c.warning}`, background: c.warningSoft }}>
                            <div style={{ ...t.label, color: c.warning, marginBottom: s.xs }}>Guardrails blocked</div>
                            {entry.skipped.map((sk, i) => (
                              <div key={i} style={{ ...t.bodySM, color: c.bodyStrong }}>
                                <span style={{ fontWeight: 700 }}>{sk.ticker}</span> — {sk.reason}
                              </div>
                            ))}
                          </div>
                        )}
                        {(entry.news || []).map((n, i) => (
                          <div key={i} style={{ ...t.bodySM, color: c.muted, padding: `${s.xs}px 0`, borderTop: `1px solid ${c.hairlineStrong}` }}>
                            {n}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── ORDER HISTORY ─────────────────── */}
        {orders.length > 0 && (
          <section style={{ padding: `${s.xxl}px ${s.xl}px`, borderBottom: `1px solid ${c.hairline}` }}>
            <div style={{ maxWidth: 1440, margin: "0 auto" }}>
              <SectionHeader kicker="Activity" title="Order History" right={<Badge>{orders.slice(0,10).length} of {orders.length}</Badge>} />
              <div style={{ border: `1px solid ${c.hairline}` }}>
                {orders.slice(0, 10).map((o, i) => {
                  const tone = o.side === "buy" ? "profit" : o.status === "canceled" ? "warning" : "loss";
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 100px 80px 120px 1fr", gap: s.md, alignItems: "center", padding: `${s.sm}px ${s.md}px`, borderBottom: `1px solid ${c.hairlineStrong}` }}>
                      <Badge tone={tone}>{o.side === "buy" ? "BUY" : "SELL"}</Badge>
                      <div style={{ ...t.bodyMD, color: c.onDark, fontWeight: 700 }}>{o.symbol}</div>
                      <div style={{ ...t.bodyMD, color: c.body, fontVariantNumeric: "tabular-nums" }}>{o.qty}</div>
                      <Badge tone={o.status === "filled" ? "profit" : o.status === "canceled" ? "warning" : "default"}>{o.status}</Badge>
                      <div style={{ ...t.bodySM, color: c.muted, textAlign: "right" }}>{new Date(o.created_at).toLocaleString("en-US")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── FOOTER ───────────────────────── */}
        <MStripe />
        <footer style={{ background: c.canvas, padding: `${s.xxl}px ${s.xl}px ${s.xl}px`, color: c.muted }}>
          <div style={{ maxWidth: 1440, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: s.xl, marginBottom: s.xl }}>
              <div>
                <div style={{ ...t.label, color: c.onDark, marginBottom: s.md }}>KENOS</div>
                <div style={{ ...t.bodySM, color: c.muted, lineHeight: 1.7 }}>
                  κένωσις — self-emptying.<br/>
                  AI ensemble paper trading.<br/>
                  Powered by Claude × Alpaca.
                </div>
              </div>
              <div>
                <div style={{ ...t.label, color: c.onDark, marginBottom: s.md }}>System</div>
                <div style={{ ...t.bodySM, color: c.muted, lineHeight: 1.8 }}>
                  Profile · {profile}<br/>
                  Tier · {currentTier?.label || "—"}<br/>
                  Day {days + 1}
                </div>
              </div>
              <div>
                <div style={{ ...t.label, color: c.onDark, marginBottom: s.md }}>Stack</div>
                <div style={{ ...t.bodySM, color: c.muted, lineHeight: 1.8 }}>
                  Next.js 14<br/>
                  Alpaca Paper Trading<br/>
                  Claude Sonnet
                </div>
              </div>
              <div>
                <div style={{ ...t.label, color: c.onDark, marginBottom: s.md }}>Disclaimer</div>
                <div style={{ ...t.bodySM, color: c.muted, lineHeight: 1.6 }}>
                  Paper trading only. No real capital at risk. Not investment advice. Educational use.
                </div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${c.hairlineStrong}`, paddingTop: s.md, display: "flex", justifyContent: "space-between", ...t.caption, color: c.muted }}>
              <span>© KENOS · κένωσις</span>
              <span>v1.0 — Paper Trading</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
