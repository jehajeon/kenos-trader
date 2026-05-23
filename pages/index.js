import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";
import {
  PROFILES, CAPITAL_TIERS, CORRELATION_GROUPS,
  resolveRisk, getCapitalTier,
  computeDrawdowns, evaluateKillSwitch, KILL_SWITCH_LIMITS,
} from "../lib/risk-config";
import { tokens } from "../lib/design-tokens";

const { colors: c, spacing: s, type: t, radius: rad, shadow, meshGradient } = tokens;

// ─────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────
const SECTORS = {
  korea:    ["EWY"],
  bio:      ["MRNA","ABBV","REGN"],
  energy:   ["XOM","CVX","NEE"],
  battery:  ["TSLA","ALB"],
  semi:     ["NVDA","AMD","TSM","AVGO"],
  ai_tech:  ["MSFT","GOOGL","META","PLTR","AMZN"],
  green:    ["ENPH","FSLR"],
  auto:     ["TM","GM"],
  future:   ["RKLB","IONQ","AAPL","COIN"],
};
const TICKER_SECTOR = {};
Object.entries(SECTORS).forEach(([sec, ts]) => ts.forEach(tk => TICKER_SECTOR[tk] = sec));

async function alpacaCall(path, method = "GET", body = null) {
  const res = await fetch("/api/alpaca", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, method, body }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────
function Eyebrow({ children, color = c.body }) {
  return <div style={{ ...t.captionMono, color, marginBottom: s.sm }}>{children}</div>;
}

function H1({ children, style }) {
  return <h1 style={{ ...t.displayXL, color: c.ink, margin: 0, ...style }}>{children}</h1>;
}

function H2({ children, style }) {
  return <h2 style={{ ...t.displayLG, color: c.ink, margin: 0, ...style }}>{children}</h2>;
}

function H3({ children, style }) {
  return <h3 style={{ ...t.displayMD, color: c.ink, margin: 0, ...style }}>{children}</h3>;
}

function Body({ children, lead, color, style }) {
  const style0 = lead ? t.bodyLG : t.bodyMD;
  return <p style={{ ...style0, color: color || c.body, margin: 0, ...style }}>{children}</p>;
}

function Button({ children, onClick, disabled, variant = "primary", size = "lg", title }) {
  // Marketing CTAs are 100px pills. Nav-scale uses 6px square.
  const isMarketing = size === "lg";
  const heights = { sm: 32, md: 40, lg: 48 };
  const pads = { sm: "0 14px", md: "0 18px", lg: "0 24px" };
  const variants = {
    primary:   { bg: c.primary,    color: c.onPrimary, border: "none" },
    secondary: { bg: c.card,       color: c.ink,       border: `1px solid ${c.hairlineStrong}` },
    ghost:     { bg: "transparent", color: c.body,     border: `1px solid ${c.hairline}` },
    danger:    { bg: "transparent", color: c.error,    border: `1px solid ${c.error}` },
  };
  const v = variants[variant] || variants.primary;
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        ...(isMarketing ? t.buttonLG : t.buttonMD),
        background: disabled ? c.hairline : v.bg,
        color: disabled ? c.mute : v.color,
        border: disabled ? `1px solid ${c.hairline}` : v.border,
        borderRadius: isMarketing ? rad.pill : rad.sm,
        padding: pads[size],
        height: heights[size],
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background 120ms, color 120ms, transform 120ms",
        boxShadow: variant === "secondary" ? shadow.level1 : "none",
      }}>
      {children}
    </button>
  );
}

function Pill({ active, onClick, children, accent }) {
  return (
    <button onClick={onClick}
      style={{
        ...t.bodySM, fontWeight: 500,
        background: active ? c.primary : c.card,
        color: active ? c.onPrimary : c.body,
        border: `1px solid ${active ? c.primary : c.hairline}`,
        borderRadius: rad.pillSm,
        padding: "6px 16px",
        cursor: "pointer",
        boxShadow: active ? "none" : shadow.level1,
        transition: "background 120ms, color 120ms",
      }}>
      {children}
    </button>
  );
}

function Card({ children, padding = s.lg, elevated, featured, style }) {
  return (
    <div style={{
      background: featured ? c.primarySurface : (elevated ? c.cardElevated : c.card),
      color: featured ? c.primarySurfaceText : c.ink,
      borderRadius: rad.md,
      padding,
      boxShadow: featured ? shadow.level4 : (elevated ? shadow.level3 : shadow.level2),
      ...style,
    }}>{children}</div>
  );
}

function StatTile({ eyebrow, value, sub, color, featured }) {
  return (
    <Card padding={s.lg} featured={featured}>
      <div style={{ ...t.captionMono, color: featured ? "#555" : c.mute, marginBottom: s.sm }}>{eyebrow}</div>
      <div style={{ ...t.statValue, color: color || (featured ? c.primarySurfaceText : c.ink) }}>{value}</div>
      {sub && <div style={{ ...t.bodySM, color: featured ? "#666" : c.body, marginTop: s.xs }}>{sub}</div>}
    </Card>
  );
}

function MonoBadge({ children, tone = "default" }) {
  const tones = {
    default: { bg: c.canvasSoft2, fg: c.body,    bd: c.hairline },
    success: { bg: c.successSoft, fg: c.success, bd: c.success },
    error:   { bg: c.errorSoft,   fg: c.error,   bd: c.error },
    warning: { bg: c.warningSoft, fg: c.warning, bd: c.warning },
    info:    { bg: c.linkBgSoft,  fg: c.link,    bd: c.link },
    ink:     { bg: c.primary,     fg: c.onPrimary, bd: c.primary },
  };
  const v = tones[tone] || tones.default;
  return (
    <span style={{
      ...t.captionMono, color: v.fg,
      background: v.bg, border: `1px solid ${v.bd}`,
      padding: "3px 8px", borderRadius: rad.full,
      display: "inline-block",
    }}>{children}</span>
  );
}

function Chart({ history, color }) {
  if (!history || history.length < 2) {
    return (
      <div style={{ ...t.bodySM, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: c.mute }}>
        Run an analysis to populate the curve.
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
        <linearGradient id="cgArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill="url(#cgArea)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="0" y1={base} x2={W} y2={base} stroke={c.hairline} strokeWidth="1" strokeDasharray="3,3" />
    </svg>
  );
}

function ScoreBar({ val, label }) {
  const col = val > 0.15 ? c.success : val < -0.15 ? c.error : c.warning;
  const pct = Math.min(Math.abs(val), 1) * 50;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", ...t.captionMono, color: c.mute, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: col }}>{val > 0 ? "+" : ""}{(val * 100).toFixed(0)}</span>
      </div>
      <div style={{ height: 3, background: c.canvasSoft2, position: "relative", borderRadius: rad.xs }}>
        <div style={{ position: "absolute", top: 0, left: `${val < 0 ? 50 - pct : 50}%`, width: `${pct}%`, height: "100%", background: col, borderRadius: rad.xs }} />
        <div style={{ position: "absolute", top: -1, left: "50%", width: 1, height: 5, background: c.hairlineStrong }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
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

  useEffect(() => { localStorage.setItem("kenos_profile", profile); }, [profile]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!nextRun) return;
      const diff = nextRun - Date.now();
      if (diff <= 0) { setCountdown("running soon"); return; }
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
    setLoading(true); setErr(null); setStep("Fetching real-time prices and news.");
    const t1 = setTimeout(() => setStep("Running ensemble AI analysis."), 5000);
    const t2 = setTimeout(() => setStep("Executing orders via Alpaca."), 12000);
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
        const sec = TICKER_SECTOR[p.symbol] || "other";
        sectorMV[sec] = (sectorMV[sec] || 0) + mv;
      });
      const groupOf = (ticker) => Object.entries(CORRELATION_GROUPS).find(([, ns]) => ns.includes(ticker))?.[0] || null;
      const groupExposure = (group, excludeTicker) => CORRELATION_GROUPS[group].reduce((a, tk) => {
        if (tk === excludeTicker || !positionMV[tk]) return a;
        return { mv: a.mv + positionMV[tk], names: a.names + 1 };
      }, { mv: 0, names: 0 });

      const forcedDecisions = [];
      pos.forEach(p => {
        const cost = Number(p.avg_entry_price), cur = Number(p.current_price), qty = Number(p.qty);
        const pnlPct = (cur - cost) / cost;
        const weight = (cur * qty) / portfolioValue;
        if (pnlPct <= risk.STOP_LOSS_PCT) {
          forcedDecisions.push({ ticker: p.symbol, action: "SELL", qty, reasoning: `Stop-loss ${(pnlPct*100).toFixed(1)}%.`, conf: 0.99, forced: "STOP_LOSS" });
        } else if (pnlPct >= risk.TAKE_PROFIT_PCT) {
          const trim = Math.max(1, Math.floor(qty * risk.TAKE_PROFIT_TRIM_PCT));
          forcedDecisions.push({ ticker: p.symbol, action: "SELL", qty: trim, reasoning: `Take-profit +${(pnlPct*100).toFixed(1)}% (${(risk.TAKE_PROFIT_TRIM_PCT*100).toFixed(0)}% trim).`, conf: 0.99, forced: "TAKE_PROFIT" });
        } else if (weight > risk.POSITION_CAP_PCT) {
          const targetMV = portfolioValue * risk.POSITION_CAP_PCT;
          const excessMV = (cur * qty) - targetMV;
          const trim = Math.max(1, Math.ceil(excessMV / cur));
          forcedDecisions.push({ ticker: p.symbol, action: "SELL", qty: trim, reasoning: `Rebalance ${(weight*100).toFixed(1)}% → ${(risk.POSITION_CAP_PCT*100).toFixed(0)}%.`, conf: 0.99, forced: "POSITION_CAP" });
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
          if (d.action === "BUY"  && !killSwitch.allowAiBuy)  { skipped.push({ticker:d.ticker, reason:`killswitch ${killSwitch.level}`}); continue; }
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

            const sect = TICKER_SECTOR[d.ticker] || "other";
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

  // Derived
  const pv = account ? Number(account.portfolio_value) : 0;
  const ini = history.length ? history[0].v : pv;
  const pnlD = pv - ini, pnlP = ini ? (pnlD / ini) * 100 : 0, up = pnlD >= 0;
  const accentColor = up ? c.success : c.error;
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

  // Section padding helper
  const sectionPad = `${s["4xl"]}px ${s.lg}px`;
  const containerStyle = { maxWidth: 1400, margin: "0 auto", padding: `0 ${s.lg}px` };

  return (
    <>
      <Head>
        <title>KENOS — AI ensemble paper trading.</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="κένωσις — AI ensemble paper trading on Alpaca." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='black'/><text x='50' y='72' font-size='72' fill='%23ededed' text-anchor='middle' font-family='Inter' font-weight='600'>K</text></svg>" />
      </Head>

      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: ${c.canvasSoft}; color-scheme: dark; }
        body {
          font-family: ${t.fontFamily};
          color: ${c.ink};
          -webkit-font-smoothing: antialiased;
          font-feature-settings: "ss01", "ss02", "cv11";
        }
        button { font-family: inherit; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${c.canvasSoft}; }
        ::-webkit-scrollbar-thumb { background: ${c.hairlineStrong}; border-radius: 3px; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>

      <div style={{ minHeight: "100vh", background: c.canvasSoft, color: c.ink }}>

        {/* ── NAV ───────────────────────────────────── */}
        <nav style={{
          height: 64,
          background: c.canvasSoft,
          borderBottom: `1px solid ${c.hairline}`,
          position: "sticky", top: 0, zIndex: 50,
          backdropFilter: "blur(8px)",
        }}>
          <div style={{ ...containerStyle, height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: s.lg }}>
              <div style={{ display: "flex", alignItems: "center", gap: s.sm }}>
                <div style={{
                  width: 28, height: 28, borderRadius: rad.sm,
                  background: meshGradient.backdrop, backgroundColor: c.canvas,
                }} />
                <span style={{ ...t.bodyMDStrong, color: c.ink, letterSpacing: "-0.4px" }}>
                  KENOS
                </span>
                <MonoBadge>paper</MonoBadge>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: s.md }}>
              <span style={{ ...t.captionMono, color: c.mute }}>day {days + 1}</span>
              {winRate && <span style={{ ...t.captionMono, color: Number(winRate) > 50 ? c.success : c.error }}>win {winRate}%</span>}
              {nextRun && <span style={{ ...t.captionMono, color: c.warning }}>next {countdown}</span>}
              <Button variant="secondary" size="sm" onClick={loadAccount}>Refresh</Button>
              <Button variant="primary" size="sm" onClick={runAnalysis} disabled={loading}>
                {loading ? "Running…" : "Run analysis"}
              </Button>
            </div>
          </div>
        </nav>

        {/* ── HERO BAND with mesh gradient ────────── */}
        {account && (
          <section style={{
            position: "relative", overflow: "hidden",
            background: c.canvasSoft,
            borderBottom: `1px solid ${c.hairline}`,
          }}>
            {/* Mesh gradient backdrop — the only decoration */}
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: meshGradient.backdrop,
              backgroundColor: c.canvasSoft,
              opacity: 0.65,
              pointerEvents: "none",
            }} />
            <div style={{ ...containerStyle, position: "relative", padding: `${s["5xl"]}px ${s.lg}px ${s["4xl"]}px` }}>
              <Eyebrow>portfolio · alpaca paper</Eyebrow>
              <H1 style={{ ...t.statValueXL }}>
                ${Number(pv).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </H1>
              <div style={{ display: "flex", alignItems: "baseline", gap: s.md, marginTop: s.md, flexWrap: "wrap" }}>
                <span style={{ ...t.displaySM, color: accentColor }}>
                  {up ? "+" : "−"}${Math.abs(pnlD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{ ...t.displaySM, color: accentColor }}>
                  {up ? "▲" : "▼"} {Math.abs(pnlP).toFixed(2)}%
                </span>
                <Body color={c.body}>since inception.</Body>
              </div>
              <div style={{ display: "flex", gap: s.sm, marginTop: s["2xl"], flexWrap: "wrap" }}>
                <Button variant="primary" size="lg" onClick={runAnalysis} disabled={loading}>
                  {loading ? "Running…" : "Run analysis →"}
                </Button>
                <Button variant="secondary" size="lg" onClick={loadAccount}>
                  Refresh account
                </Button>
              </div>

              {loading && (
                <div style={{ marginTop: s.lg, display: "flex", alignItems: "center", gap: s.sm }}>
                  <span style={{ width: 6, height: 6, background: c.ink, borderRadius: rad.full, animation: "pulse 1s infinite" }} />
                  <span style={{ ...t.captionMono, color: c.body }}>{step}</span>
                </div>
              )}
              {err && (
                <div style={{ marginTop: s.md, padding: `${s.sm}px ${s.md}px`, background: c.errorSoft, border: `1px solid ${c.error}`, borderRadius: rad.md, ...t.bodySM, color: c.error }}>
                  {err}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── PROFILE + AUTO ROW ──────────────────── */}
        <section style={{ background: c.canvasSoft2, borderBottom: `1px solid ${c.hairline}` }}>
          <div style={{ ...containerStyle, padding: `${s.lg}px ${s.lg}px`, display: "flex", justifyContent: "space-between", gap: s.lg, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: s.md, flexWrap: "wrap" }}>
              <span style={{ ...t.captionMono, color: c.mute }}>intensity</span>
              <div style={{ display: "flex", gap: s.xs }}>
                {Object.entries(PROFILES).map(([key, p]) => (
                  <Pill key={key} active={profile === key} onClick={() => setProfile(key)}>
                    {key.toLowerCase()}
                  </Pill>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: s.md, flexWrap: "wrap" }}>
              <span style={{ ...t.captionMono, color: c.mute }}>auto</span>
              <div style={{ display: "flex", gap: s.xs }}>
                {[null, 4, 8, 24].map(h => (
                  <Pill key={String(h)} active={autoHours === h} onClick={() => setAutoHours(h === autoHours ? null : h)}>
                    {h === null ? "off" : `${h}h`}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── ACCOUNT 4-UP ─────────────────────────── */}
        {account && (
          <section style={{ padding: sectionPad }}>
            <div style={containerStyle}>
              <Eyebrow>account</Eyebrow>
              <H2>Capital snapshot.</H2>
              <Body color={c.body} style={{ marginTop: s.sm, marginBottom: s["2xl"] }} lead>
                Live account state from Alpaca, updated each analysis cycle.
              </Body>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: s.md }}>
                <StatTile eyebrow="portfolio value" value={`$${Number(pv).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
                <StatTile eyebrow="cash" value={`$${Number(account.cash).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                  sub={`${((Number(account.cash) / pv) * 100).toFixed(1)}% of portfolio.`} />
                <StatTile eyebrow="positions" value={positions.length} sub={`${orders.filter(o => o.status === "filled").length} filled orders.`} />
                <StatTile eyebrow="buying power" value={`$${Number(account.buying_power).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
              </div>
            </div>
          </section>
        )}

        {/* ── RISK + KILL SWITCH ─────────────────── */}
        {currentRisk && currentKillSwitch && (
          <section style={{ padding: sectionPad, borderTop: `1px solid ${c.hairline}` }}>
            <div style={containerStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: s["2xl"], flexWrap: "wrap", gap: s.md }}>
                <div>
                  <Eyebrow>capital management</Eyebrow>
                  <H2>{`${profile.charAt(0) + profile.slice(1).toLowerCase()} · ${(currentTier?.label || "").replace(/^[^A-Za-z]+\s*/, "").toLowerCase()}.`}</H2>
                  <Body color={c.body} style={{ marginTop: s.sm }}>
                    Effective risk limits derived from your selected profile and current portfolio size.
                  </Body>
                </div>
                {currentKillSwitch.level !== "NORMAL" && (
                  <MonoBadge tone={currentKillSwitch.severity >= 2 ? "error" : "warning"}>
                    {currentKillSwitch.level.replace("_", " ").toLowerCase()}
                  </MonoBadge>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: s.md, marginBottom: s["2xl"] }}>
                <StatTile eyebrow="buy conf ≥" value={currentRisk.BUY_CONF_MIN.toFixed(2)} sub={`panic ${currentRisk.PANIC_BUY_CONF_MIN.toFixed(2)}.`} />
                <StatTile eyebrow="stop-loss"  value={`${(currentRisk.STOP_LOSS_PCT*100).toFixed(0)}%`}  sub="full exit." color={c.error} />
                <StatTile eyebrow="take-profit" value={`+${(currentRisk.TAKE_PROFIT_PCT*100).toFixed(0)}%`} sub={`${(currentRisk.TAKE_PROFIT_TRIM_PCT*100).toFixed(0)}% trim.`} color={c.success} />
                <StatTile eyebrow="position cap" value={`${(currentRisk.POSITION_CAP_PCT*100).toFixed(0)}%`} sub={`≈$${(pv*currentRisk.POSITION_CAP_PCT).toLocaleString("en-US",{maximumFractionDigits:0})}.`} />
                <StatTile eyebrow="sector cap"   value={`${(currentRisk.SECTOR_CAP_PCT*100).toFixed(0)}%`} sub={`group ${(currentRisk.CORR_GROUP_CAP_PCT*100).toFixed(0)}%.`} />
                <StatTile eyebrow="cash floor ≥" value={`${(currentRisk.CASH_FLOOR_PCT*100).toFixed(0)}%`} sub={`≈$${(pv*currentRisk.CASH_FLOOR_PCT).toLocaleString("en-US",{maximumFractionDigits:0})}.`} />
                <StatTile eyebrow="max positions" value={currentRisk.MAX_POSITIONS} sub={`min trade $${currentRisk.MIN_DOLLAR_PER_TRADE}.`} />
              </div>

              <Eyebrow>drawdown monitor</Eyebrow>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: s.md }}>
                {[
                  ["daily p&l",   currentDrawdowns.daily,   KILL_SWITCH_LIMITS.DAILY_LOSS_HALT],
                  ["weekly p&l",  currentDrawdowns.weekly,  KILL_SWITCH_LIMITS.WEEKLY_LOSS_HALT],
                  ["monthly p&l", currentDrawdowns.monthly, KILL_SWITCH_LIMITS.MONTHLY_LOSS_HALT],
                ].map(([label, val, lim], i) => {
                  const breached = val <= lim;
                  const col = breached ? c.error : val < 0 ? c.warning : c.success;
                  return (
                    <StatTile key={i}
                      featured={breached}
                      eyebrow={label}
                      value={`${val > 0 ? "+" : ""}${(val * 100).toFixed(2)}%`}
                      sub={`halt at ${(lim*100).toFixed(0)}%.`}
                      color={col}
                    />
                  );
                })}
              </div>

              {currentKillSwitch.reason && (
                <div style={{ marginTop: s.lg, padding: s.lg, background: c.errorSoft, border: `1px solid ${c.error}`, borderRadius: rad.md }}>
                  <Eyebrow color={c.error}>kill switch active</Eyebrow>
                  <Body color={c.error}>{currentKillSwitch.reason}</Body>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── MACRO REGIME ───────────────────────── */}
        {log[0]?.regime && (
          <section style={{ padding: sectionPad, borderTop: `1px solid ${c.hairline}`, background: c.canvas }}>
            <div style={containerStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: s["2xl"], flexWrap: "wrap", gap: s.md }}>
                <div>
                  <Eyebrow>macro</Eyebrow>
                  <H2 style={{ color: c.ink }}>Regime.</H2>
                  <Body color={c.body} style={{ marginTop: s.sm }}>
                    Real-time risk regime — VIX, yields, FX, oil, gold, BTC, FOMC.
                  </Body>
                </div>
                {log[0].regime.overall_risk_regime && (
                  <MonoBadge tone={log[0].regime.overall_risk_regime === "panic" ? "error" : log[0].regime.overall_risk_regime === "risk_on" ? "success" : "warning"}>
                    {log[0].regime.overall_risk_regime.replace("_", " ")}
                  </MonoBadge>
                )}
              </div>
              {(() => {
                const g = log[0].regime;
                const items = [
                  ["vix", g.vix?.toFixed(1), g.vix_state, g.vix > 30 ? c.error : g.vix > 20 ? c.warning : c.success],
                  ["us 10y", `${g.us10y?.toFixed(2)}%`, `2y ${g.us2y?.toFixed(2)}%`, c.ink],
                  ["10y−2y", `${g.yield_curve_bps}bps`, g.yield_curve_bps < 0 ? "inverted" : "normal", g.yield_curve_bps < 0 ? c.error : c.success],
                  ["dxy", g.dxy?.toFixed(2), g.dxy_trend, c.ink],
                  ["wti", `$${g.wti?.toFixed(2)}`, `5d ${g.wti_5d_pct > 0 ? "+" : ""}${g.wti_5d_pct?.toFixed(1)}%`, c.ink],
                  ["btc", `$${Math.round(g.btc || 0).toLocaleString()}`, "spot", c.ink],
                  ["gold", `$${Math.round(g.gold || 0).toLocaleString()}`, "spot", c.ink],
                  ["fomc", g.next_fomc_date || "—", g.fomc_within_2d ? "within 2d" : "clear", g.fomc_within_2d ? c.error : c.mute],
                  ["credit", g.credit_spreads || "—", "spreads", g.credit_spreads === "widening" ? c.error : c.success],
                ];
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: s.md }}>
                    {items.map(([label, val, sub, col], i) => (
                      <Card key={i} padding={s.md}>
                        <div style={{ ...t.captionMono, color: c.mute, marginBottom: 6 }}>{label}</div>
                        <div style={{ ...t.statValueSm, color: col }}>{val || "—"}</div>
                        {sub && <div style={{ ...t.bodySM, color: c.body, marginTop: 2 }}>{sub}</div>}
                      </Card>
                    ))}
                  </div>
                );
              })()}
              {log[0].portfolio_health?.correlation_warnings?.length > 0 && (
                <div style={{ marginTop: s.lg, padding: s.md, background: c.warningSoft, border: `1px solid ${c.warning}`, borderRadius: rad.md, ...t.bodySM, color: c.warning }}>
                  Correlation warning — {log[0].portfolio_health.correlation_warnings.join(" · ")}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── EQUITY + AI READ ───────────────────── */}
        {(history.length > 0 || log[0]) && (
          <section style={{ padding: sectionPad, borderTop: `1px solid ${c.hairline}` }}>
            <div style={containerStyle}>
              <Eyebrow>performance</Eyebrow>
              <H2>Trend and outlook.</H2>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: s.lg, marginTop: s["2xl"] }}>
                <Card padding={s.lg} style={{ minHeight: 240 }}>
                  <Eyebrow>equity curve</Eyebrow>
                  <div style={{ height: 160 }}><Chart history={history} color={accentColor} /></div>
                </Card>
                <Card padding={s.lg}>
                  <Eyebrow>ai market read</Eyebrow>
                  <Body color={c.ink} style={{ marginBottom: s.md }} lead>
                    {log[0]?.market || "Run an analysis to populate the market read."}
                  </Body>
                  {log[0]?.outlook && (
                    <>
                      <Eyebrow color={c.mute}>outlook</Eyebrow>
                      <Body color={c.body}>{log[0].outlook}</Body>
                    </>
                  )}
                </Card>
              </div>
            </div>
          </section>
        )}

        {/* ── POSITIONS ──────────────────────────── */}
        <section style={{ padding: sectionPad, borderTop: `1px solid ${c.hairline}` }}>
          <div style={containerStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: s["2xl"], flexWrap: "wrap", gap: s.md }}>
              <div>
                <Eyebrow>holdings</Eyebrow>
                <H2>Positions.</H2>
              </div>
              <MonoBadge>{positions.length} open</MonoBadge>
            </div>
            {positions.length === 0 ? (
              <Card padding={s["2xl"]} style={{ textAlign: "center" }}>
                <Body color={c.mute}>No open positions — KENOS is scanning for opportunities.</Body>
              </Card>
            ) : (
              <Card padding={0}>
                <div style={{ display: "grid", gridTemplateColumns: "110px 80px 110px 110px 130px 1fr", gap: s.md, padding: `${s.sm}px ${s.lg}px`, borderBottom: `1px solid ${c.hairline}`, background: c.canvasSoft2 }}>
                  {["ticker","qty","avg","current","p&l","sector"].map((h, i) => (
                    <div key={i} style={{ ...t.captionMono, color: c.mute }}>{h}</div>
                  ))}
                </div>
                {positions.map(pos => {
                  const cost = Number(pos.avg_entry_price), cur = Number(pos.current_price), qty = Number(pos.qty);
                  const pd = (cur - cost) * qty, pp = ((cur - cost) / cost) * 100, pu = pd >= 0;
                  return (
                    <div key={pos.symbol} style={{ display: "grid", gridTemplateColumns: "110px 80px 110px 110px 130px 1fr", gap: s.md, padding: `${s.md}px ${s.lg}px`, borderBottom: `1px solid ${c.hairline}`, alignItems: "center" }}>
                      <div style={{ ...t.bodyMDStrong, color: c.ink }}>{pos.symbol}</div>
                      <div style={{ ...t.bodyMD, color: c.body, fontVariantNumeric: "tabular-nums" }}>{qty}</div>
                      <div style={{ ...t.bodyMD, color: c.mute, fontVariantNumeric: "tabular-nums" }}>${cost.toFixed(2)}</div>
                      <div style={{ ...t.bodyMD, color: c.ink, fontVariantNumeric: "tabular-nums" }}>${cur.toFixed(2)}</div>
                      <div style={{ fontVariantNumeric: "tabular-nums" }}>
                        <div style={{ ...t.bodyMDStrong, color: pu ? c.success : c.error }}>{pu ? "+" : ""}${pd.toFixed(2)}</div>
                        <div style={{ ...t.caption, color: pu ? c.success : c.error }}>{pu ? "+" : ""}{pp.toFixed(2)}%</div>
                      </div>
                      <div style={{ ...t.captionMono, color: c.body }}>{TICKER_SECTOR[pos.symbol] || "other"}</div>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>
        </section>

        {/* ── AI DECISION LOG ─────────────────────── */}
        <section style={{ padding: sectionPad, borderTop: `1px solid ${c.hairline}`, background: c.canvas }}>
          <div style={containerStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: s["2xl"], flexWrap: "wrap", gap: s.md }}>
              <div>
                <Eyebrow>intelligence</Eyebrow>
                <H2>Decision log.</H2>
                <Body color={c.body} style={{ marginTop: s.sm }}>
                  Every analysis cycle — ensemble scores, executed orders, guardrail blocks.
                </Body>
              </div>
              <MonoBadge>{log.length} cycles</MonoBadge>
            </div>
            {log.length === 0 ? (
              <Card padding={s["2xl"]} style={{ textAlign: "center" }}>
                <Body color={c.mute}>No analyses yet — run one to populate.</Body>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: s.md, maxHeight: 600, overflowY: "auto" }}>
                {log.map(entry => (
                  <Card key={entry.id} padding={s.lg}>
                    <div onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: s.sm, flexWrap: "wrap", gap: s.sm }}>
                      <div style={{ ...t.captionMono, color: c.mute }}>{new Date(entry.ts).toLocaleString("en-US")}</div>
                      <div style={{ display: "flex", gap: s.xs, alignItems: "center", flexWrap: "wrap" }}>
                        {entry.profile && <MonoBadge>{entry.profile.toLowerCase()}</MonoBadge>}
                        <span style={{ ...t.bodyMDStrong, color: c.ink, fontVariantNumeric: "tabular-nums" }}>
                          ${entry.value?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <MonoBadge tone={entry.risk === "HIGH" || entry.risk === "EXTREME" ? "error" : entry.risk === "MEDIUM" ? "warning" : "success"}>
                          {entry.risk.toLowerCase()}
                        </MonoBadge>
                        {entry.executed?.length > 0 && <MonoBadge tone="info">{entry.executed.length} exec</MonoBadge>}
                        <span style={{ ...t.caption, color: c.mute }}>{expanded === entry.id ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: s.xs }}>
                      {(entry.decisions || []).filter(d => d.action !== "HOLD").map((d, i) => (
                        <div key={i} style={{ display: "flex", gap: s.xs, alignItems: "center", border: `1px solid ${c.hairline}`, borderRadius: rad.full, padding: "4px 10px" }}>
                          <MonoBadge tone={d.action === "BUY" ? "success" : "error"}>{d.action.toLowerCase()}</MonoBadge>
                          <span style={{ ...t.bodySMStrong, color: c.ink }}>{d.ticker}</span>
                          <span style={{ ...t.bodySM, color: c.body }}>{d.reasoning?.slice(0, 60)}</span>
                          <span style={{ ...t.captionMono, color: c.mute }}>{(d.conf * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                      {!(entry.decisions || []).filter(d => d.action !== "HOLD").length && (
                        <span style={{ ...t.bodySM, color: c.mute }}>Hold — confidence below threshold.</span>
                      )}
                    </div>

                    {expanded === entry.id && (
                      <div style={{ marginTop: s.lg }}>
                        {(entry.decisions || []).filter(d => d.action !== "HOLD").slice(0, 3).length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: s.sm, marginBottom: s.md }}>
                            {(entry.decisions || []).filter(d => d.action !== "HOLD").slice(0, 3).map((d, i) => (
                              <Card key={i} padding={s.md} elevated>
                                <div style={{ ...t.bodyMDStrong, color: c.ink, marginBottom: s.xs }}>{d.ticker}</div>
                                <ScoreBar val={d.tech || 0}  label="tech 35%" />
                                <ScoreBar val={d.sent || 0}  label="sent 30%" />
                                <ScoreBar val={d.macro || 0} label="macro 35%" />
                                <div style={{ display: "flex", justifyContent: "space-between", ...t.captionMono, color: c.mute, marginTop: 6 }}>
                                  <span>conf</span>
                                  <span style={{ color: c.ink }}>{(d.conf * 100).toFixed(0)}%</span>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                        {entry.skipped?.length > 0 && (
                          <Card padding={s.md} style={{ background: c.warningSoft, border: `1px solid ${c.warning}`, marginBottom: s.sm }}>
                            <Eyebrow color={c.warning}>guardrails blocked</Eyebrow>
                            {entry.skipped.map((sk, i) => (
                              <div key={i} style={{ ...t.bodySM, color: c.ink }}>
                                <span style={{ fontWeight: 500 }}>{sk.ticker}</span> — {sk.reason}
                              </div>
                            ))}
                          </Card>
                        )}
                        {(entry.news || []).length > 0 && (
                          <div>
                            <Eyebrow>news</Eyebrow>
                            {entry.news.map((n, i) => (
                              <div key={i} style={{ ...t.bodySM, color: c.body, padding: `${s.xs}px 0`, borderTop: i > 0 ? `1px solid ${c.hairline}` : "none" }}>
                                {n}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── ORDER HISTORY ─────────────────────── */}
        {orders.length > 0 && (
          <section style={{ padding: sectionPad, borderTop: `1px solid ${c.hairline}` }}>
            <div style={containerStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: s["2xl"], flexWrap: "wrap", gap: s.md }}>
                <div>
                  <Eyebrow>activity</Eyebrow>
                  <H2>Order history.</H2>
                </div>
                <MonoBadge>{orders.slice(0, 10).length} of {orders.length}</MonoBadge>
              </div>
              <Card padding={0}>
                {orders.slice(0, 10).map((o, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 120px 80px 130px 1fr", gap: s.md, alignItems: "center", padding: `${s.md}px ${s.lg}px`, borderBottom: i < orders.slice(0,10).length - 1 ? `1px solid ${c.hairline}` : "none" }}>
                    <MonoBadge tone={o.side === "buy" ? "success" : o.status === "canceled" ? "warning" : "error"}>{o.side}</MonoBadge>
                    <div style={{ ...t.bodyMDStrong, color: c.ink }}>{o.symbol}</div>
                    <div style={{ ...t.bodyMD, color: c.body, fontVariantNumeric: "tabular-nums" }}>{o.qty}</div>
                    <MonoBadge tone={o.status === "filled" ? "success" : o.status === "canceled" ? "warning" : "default"}>{o.status}</MonoBadge>
                    <div style={{ ...t.bodySM, color: c.mute, textAlign: "right" }}>{new Date(o.created_at).toLocaleString("en-US")}</div>
                  </div>
                ))}
              </Card>
            </div>
          </section>
        )}

        {/* ── FOOTER ───────────────────────────── */}
        <footer style={{
          background: c.canvas,
          borderTop: `1px solid ${c.hairline}`,
          padding: `${s["4xl"]}px ${s.lg}px ${s.xl}px`,
        }}>
          <div style={containerStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: s.xl, marginBottom: s.xl }}>
              <div>
                <Eyebrow>kenos</Eyebrow>
                <Body style={{ marginBottom: s.xs }}>κένωσις — self-emptying.</Body>
                <Body>AI ensemble paper trading on Alpaca.</Body>
              </div>
              <div>
                <Eyebrow>system</Eyebrow>
                <Body style={{ marginBottom: s.xs }}>profile · {profile.toLowerCase()}</Body>
                <Body style={{ marginBottom: s.xs }}>tier · {currentTier?.label?.replace(/^[^A-Za-z]+\s*/, "").toLowerCase() || "—"}</Body>
                <Body>day {days + 1}</Body>
              </div>
              <div>
                <Eyebrow>stack</Eyebrow>
                <Body style={{ marginBottom: s.xs }}>Next.js 14</Body>
                <Body style={{ marginBottom: s.xs }}>Claude Sonnet</Body>
                <Body>Alpaca Paper</Body>
              </div>
              <div>
                <Eyebrow>disclaimer</Eyebrow>
                <Body>Paper trading only. No real capital. Not investment advice.</Body>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${c.hairline}`, paddingTop: s.md, display: "flex", justifyContent: "space-between", ...t.caption, color: c.mute }}>
              <span>© KENOS · κένωσις</span>
              <span style={{ ...t.captionMono }}>v1.0 — paper</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
