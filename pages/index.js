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

const fmtUSD0 = (n) => `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtUSD2 = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDay  = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────
function Eyebrow({ children, color = c.mute, style }) {
  return <div style={{ ...t.captionMono, color, ...style }}>{children}</div>;
}

function Button({ children, onClick, disabled, variant = "primary", size = "md", style }) {
  const isMarketing = size === "lg";
  const heights = { sm: 32, md: 36, lg: 44 };
  const pads = { sm: "0 14px", md: "0 16px", lg: "0 22px" };
  const variants = {
    primary:   { bg: c.primary,    color: c.onPrimary, border: "none" },
    secondary: { bg: c.card,       color: c.ink,       border: `1px solid ${c.hairlineStrong}` },
    ghost:     { bg: "transparent", color: c.body,     border: `1px solid ${c.hairline}` },
  };
  const v = variants[variant] || variants.primary;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        ...(isMarketing ? t.buttonLG : t.buttonMD),
        background: disabled ? c.hairline : v.bg,
        color: disabled ? c.mute : v.color,
        border: disabled ? `1px solid ${c.hairline}` : v.border,
        borderRadius: isMarketing ? rad.pill : rad.sm,
        padding: pads[size], height: heights[size],
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background 120ms, transform 80ms",
        boxShadow: variant === "secondary" ? shadow.level1 : "none",
        ...style,
      }}>
      {children}
    </button>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        ...t.bodySM, fontWeight: 500,
        background: active ? c.primary : c.card,
        color: active ? c.onPrimary : c.body,
        border: `1px solid ${active ? c.primary : c.hairline}`,
        borderRadius: rad.pillSm,
        padding: "5px 14px",
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

function MonoBadge({ children, tone = "default" }) {
  const tones = {
    default: { bg: c.canvasSoft2, fg: c.body,    bd: c.hairline },
    success: { bg: c.successSoft, fg: c.success, bd: c.success },
    error:   { bg: c.errorSoft,   fg: c.error,   bd: c.error },
    warning: { bg: c.warningSoft, fg: c.warning, bd: c.warning },
    info:    { bg: c.linkBgSoft,  fg: c.link,    bd: c.link },
  };
  const v = tones[tone] || tones.default;
  return (
    <span style={{
      ...t.captionMono, color: v.fg,
      background: v.bg, border: `1px solid ${v.bd}`,
      padding: "2px 8px", borderRadius: rad.full,
      display: "inline-block", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function SectionTitle({ children, right, style }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: s.md, ...style }}>
      <h3 style={{ ...t.displaySM, color: c.ink, margin: 0 }}>{children}</h3>
      {right}
    </div>
  );
}

function Chart({ history, color, height = 180 }) {
  if (!history || history.length < 2) {
    return (
      <div style={{ ...t.bodySM, display: "flex", alignItems: "center", justifyContent: "center", height, color: c.mute }}>
        Run an analysis to populate the equity curve.
      </div>
    );
  }
  const vals = history.map(h => h.v);
  const mn = Math.min(...vals) * 0.997, mx = Math.max(...vals) * 1.003, rng = mx - mn || 1;
  const W = 1000, H = 200;
  const base = H - ((history[0].v - mn) / rng) * H;
  const pts = vals.map((v, i) => `${(i / Math.max(vals.length - 1, 1)) * W},${H - ((v - mn) / rng) * H}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <defs>
        <linearGradient id="cgArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill="url(#cgArea)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <line x1="0" y1={base} x2={W} y2={base} stroke={c.hairlineStrong} strokeWidth="1" strokeDasharray="3,3" />
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

// Compact sidebar card with title + tightly packed key-value rows
function SidebarCard({ title, right, children }) {
  return (
    <Card padding={s.md} style={{ marginBottom: s.md }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s.sm }}>
        <Eyebrow>{title}</Eyebrow>
        {right}
      </div>
      {children}
    </Card>
  );
}

function KV({ k, v, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", ...t.bodySM }}>
      <span style={{ color: c.body }}>{k}</span>
      <span style={{ color: color || c.ink, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{v}</span>
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
  const [showOrders, setShowOrders] = useState(false);
  const autoRef = useRef(null);

  useEffect(() => {
    loadAccount();
    const safeParse = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.warn(`localStorage ${key} corrupted — resetting.`, e.message);
        localStorage.removeItem(key);
        return fallback;
      }
    };
    setLog(safeParse("kenos_log", []));
    setHistory(safeParse("kenos_hist", []));
    const savedP = localStorage.getItem("kenos_profile");
    if (savedP && PROFILES[savedP]) setProfile(savedP);
  }, []);

  useEffect(() => { localStorage.setItem("kenos_profile", profile); }, [profile]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!nextRun) return;
      const diff = nextRun - Date.now();
      if (diff <= 0) { setCountdown("soon"); return; }
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), sec = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h > 0 ? h + "h " : ""}${m}m ${sec}s`);
    }, 1000);
    return () => clearInterval(id);
  }, [nextRun]);

  const loadAccount = async () => {
    try {
      const acc = await alpacaCall("/v2/account");
      const pos = await alpacaCall("/v2/positions");
      const ord = await alpacaCall("/v2/orders?status=all&limit=50");
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
          forcedDecisions.push({ ticker: p.symbol, action: "SELL", qty: trim, reasoning: `Take-profit +${(pnlPct*100).toFixed(1)}%.`, conf: 0.99, forced: "TAKE_PROFIT" });
        } else if (weight > risk.POSITION_CAP_PCT) {
          const targetMV = portfolioValue * risk.POSITION_CAP_PCT;
          const excessMV = (cur * qty) - targetMV;
          const trim = Math.max(1, Math.ceil(excessMV / cur));
          forcedDecisions.push({ ticker: p.symbol, action: "SELL", qty: trim, reasoning: `Rebalance ${(weight*100).toFixed(1)}%.`, conf: 0.99, forced: "POSITION_CAP" });
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
        breaking: false,  // browser-initiated; news-poll path sets this in server response
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
  const lastEquity = account ? Number(account.last_equity || pv) : pv;
  const ini = history.length ? history[0].v : pv;
  const pnlD = pv - ini, pnlP = ini ? (pnlD / ini) * 100 : 0, up = pnlD >= 0;
  const dailyD = pv - lastEquity, dailyP = lastEquity ? (dailyD / lastEquity) * 100 : 0, dayUp = dailyD >= 0;
  const accentColor = up ? c.success : c.error;
  const days = history.length ? Math.floor((Date.now() - new Date(history[0].ts)) / 86400000) : 0;

  const currentRisk = pv > 0 ? resolveRisk(profile, pv) : null;
  const currentTier = pv > 0 ? getCapitalTier(pv) : null;
  const currentDrawdowns = account ? computeDrawdowns({
    currentEquity: pv, lastEquity, history,
  }) : null;
  const currentKillSwitch = currentDrawdowns ? evaluateKillSwitch(currentDrawdowns) : null;

  const sells = log.flatMap(e => e.executed || []).filter(e => e.action === "SELL");
  const winRate = sells.length ? ((sells.filter(e => (e.pnl || 0) > 0).length / sells.length) * 100).toFixed(0) : null;

  // Build unified activity feed from executed orders + skipped (last 20 events)
  const activityFeed = log.flatMap(entry =>
    (entry.executed || []).map(e => ({ ...e, ts: entry.ts, kind: "executed" }))
      .concat((entry.skipped || []).map(sk => ({ ...sk, ts: entry.ts, kind: "skipped" })))
  ).slice(0, 20);

  // Sort positions by P&L % descending (best performers on top)
  const sortedPositions = [...positions].sort((a, b) => {
    const ap = (Number(a.current_price) - Number(a.avg_entry_price)) / Number(a.avg_entry_price);
    const bp = (Number(b.current_price) - Number(b.avg_entry_price)) / Number(b.avg_entry_price);
    return bp - ap;
  });

  const containerStyle = { maxWidth: 1400, margin: "0 auto", padding: `0 ${s.lg}px` };

  return (
    <>
      <Head>
        <title>KENOS — Paper trading dashboard.</title>
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
        .row-hover:hover { background: ${c.canvasSoft2}; }
        @media (max-width: 900px) {
          .main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: c.canvasSoft, color: c.ink }}>

        {/* ── NAV ───────────────────────────────────── */}
        <nav style={{
          height: 60,
          background: c.canvasSoft + "ee",
          borderBottom: `1px solid ${c.hairline}`,
          position: "sticky", top: 0, zIndex: 50,
          backdropFilter: "blur(12px)",
        }}>
          <div style={{ ...containerStyle, height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: s.sm }}>
              <div style={{
                width: 26, height: 26, borderRadius: rad.sm,
                background: meshGradient.backdrop, backgroundColor: c.canvas,
              }} />
              <span style={{ ...t.bodyMDStrong, color: c.ink, letterSpacing: "-0.4px" }}>KENOS</span>
              <MonoBadge>paper</MonoBadge>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: s.md }}>
              <span style={{ ...t.captionMono, color: c.mute }}>day {days + 1}</span>
              {winRate && <span style={{ ...t.captionMono, color: Number(winRate) > 50 ? c.success : c.error }}>win {winRate}%</span>}
              {nextRun && <span style={{ ...t.captionMono, color: c.warning }}>{countdown}</span>}
              <Button variant="secondary" size="sm" onClick={loadAccount}>Refresh</Button>
              <Button variant="primary" size="md" onClick={runAnalysis} disabled={loading}>
                {loading ? "Running…" : "Run analysis"}
              </Button>
            </div>
          </div>
        </nav>

        {/* ── KILL SWITCH BANNER (only when not normal) ─ */}
        {currentKillSwitch && currentKillSwitch.level !== "NORMAL" && (
          <div style={{
            background: currentKillSwitch.severity >= 2 ? c.errorSoft : c.warningSoft,
            borderBottom: `1px solid ${currentKillSwitch.severity >= 2 ? c.error : c.warning}`,
          }}>
            <div style={{ ...containerStyle, padding: `${s.sm}px ${s.lg}px`, display: "flex", alignItems: "center", gap: s.sm, flexWrap: "wrap" }}>
              <MonoBadge tone={currentKillSwitch.severity >= 2 ? "error" : "warning"}>
                {currentKillSwitch.level.replace("_", " ").toLowerCase()}
              </MonoBadge>
              <span style={{ ...t.bodySM, color: currentKillSwitch.severity >= 2 ? c.error : c.warning }}>
                {currentKillSwitch.reason}
              </span>
            </div>
          </div>
        )}

        {/* ── HERO: portfolio + equity + controls ───── */}
        {account && (
          <section style={{ position: "relative", overflow: "hidden", borderBottom: `1px solid ${c.hairline}` }}>
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: meshGradient.backdrop,
              backgroundColor: c.canvasSoft,
              opacity: 0.55, pointerEvents: "none",
            }} />
            <div style={{ ...containerStyle, position: "relative", padding: `${s.xl}px ${s.lg}px ${s.lg}px` }}>
              {/* Portfolio value + day change */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: s.md, flexWrap: "wrap", gap: s.md }}>
                <div>
                  <Eyebrow style={{ marginBottom: s.xs }}>portfolio</Eyebrow>
                  <div style={{ ...t.statValueXL, color: c.ink }}>
                    {fmtUSD2(pv)}
                  </div>
                  <div style={{ display: "flex", gap: s.md, marginTop: s.xs, alignItems: "baseline", flexWrap: "wrap" }}>
                    {Math.abs(dailyD) > 0.01 && (
                      <span style={{ ...t.bodyMDStrong, color: dayUp ? c.success : c.error, fontVariantNumeric: "tabular-nums" }}>
                        {dayUp ? "▲" : "▼"} {fmtUSD2(Math.abs(dailyD))} ({dayUp ? "+" : "−"}{Math.abs(dailyP).toFixed(2)}%) today
                      </span>
                    )}
                    <span style={{ ...t.bodySM, color: up ? c.success : c.error, fontVariantNumeric: "tabular-nums" }}>
                      {up ? "+" : "−"}{fmtUSD2(Math.abs(pnlD))} ({up ? "+" : "−"}{Math.abs(pnlP).toFixed(2)}%) all time
                    </span>
                  </div>
                </div>
                {/* Compact KPIs to the right */}
                <div style={{ display: "flex", gap: s.lg, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ textAlign: "right" }}>
                    <Eyebrow style={{ marginBottom: 2 }}>cash</Eyebrow>
                    <div style={{ ...t.statValueSm, color: c.ink }}>{fmtUSD0(account.cash)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Eyebrow style={{ marginBottom: 2 }}>buying power</Eyebrow>
                    <div style={{ ...t.statValueSm, color: c.ink }}>{fmtUSD0(account.buying_power)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Eyebrow style={{ marginBottom: 2 }}>positions</Eyebrow>
                    <div style={{ ...t.statValueSm, color: c.ink }}>{positions.length}</div>
                  </div>
                </div>
              </div>

              {/* Equity chart */}
              <div style={{ marginTop: s.md }}>
                <Chart history={history} color={accentColor} height={200} />
              </div>

              {/* Controls row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: s.md, flexWrap: "wrap", gap: s.md }}>
                <div style={{ display: "flex", alignItems: "center", gap: s.sm, flexWrap: "wrap" }}>
                  <Eyebrow>intensity</Eyebrow>
                  {Object.entries(PROFILES).map(([key, p]) => (
                    <Pill key={key} active={profile === key} onClick={() => setProfile(key)}>
                      {key.toLowerCase()}
                    </Pill>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: s.sm, flexWrap: "wrap" }}>
                  <Eyebrow>auto</Eyebrow>
                  {[null, 4, 8, 24].map(h => (
                    <Pill key={String(h)} active={autoHours === h} onClick={() => setAutoHours(h === autoHours ? null : h)}>
                      {h === null ? "off" : `${h}h`}
                    </Pill>
                  ))}
                </div>
              </div>

              {loading && (
                <div style={{ marginTop: s.md, display: "flex", alignItems: "center", gap: s.sm }}>
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

        {/* ── MAIN 2-COL GRID ───────────────────────── */}
        <section style={{ padding: `${s.xl}px ${s.lg}px` }}>
          <div style={containerStyle}>
            <div className="main-grid" style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 340px",
              gap: s.lg,
            }}>

              {/* ─── LEFT MAIN ─── */}
              <div style={{ minWidth: 0 }}>

                {/* HOLDINGS */}
                <SectionTitle right={<MonoBadge>{positions.length} open</MonoBadge>}>Holdings</SectionTitle>
                {positions.length === 0 ? (
                  <Card padding={s["2xl"]} style={{ textAlign: "center", marginBottom: s.xl }}>
                    <span style={{ ...t.bodyMD, color: c.mute }}>No open positions yet — KENOS is scanning.</span>
                  </Card>
                ) : (
                  <Card padding={0} style={{ marginBottom: s.xl, overflow: "hidden" }}>
                    {/* Column headers */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 100px 100px 130px 80px",
                      gap: s.md, padding: `${s.sm}px ${s.lg}px`,
                      background: c.canvasSoft2, borderBottom: `1px solid ${c.hairline}`,
                    }}>
                      {["ticker", "qty", "avg", "current", "p&l", "sector"].map((h, i) => (
                        <div key={i} style={{ ...t.captionMono, color: c.mute, textAlign: i >= 1 && i <= 4 ? "right" : "left" }}>{h}</div>
                      ))}
                    </div>
                    {sortedPositions.map(pos => {
                      const cost = Number(pos.avg_entry_price), cur = Number(pos.current_price), qty = Number(pos.qty);
                      const pd = (cur - cost) * qty, pp = ((cur - cost) / cost) * 100, pu = pd >= 0;
                      return (
                        <div key={pos.symbol} className="row-hover" style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 80px 100px 100px 130px 80px",
                          gap: s.md, padding: `${s.md}px ${s.lg}px`,
                          borderBottom: `1px solid ${c.hairline}`, alignItems: "center",
                          transition: "background 100ms",
                        }}>
                          <div>
                            <div style={{ ...t.bodyMDStrong, color: c.ink }}>{pos.symbol}</div>
                            <div style={{ ...t.caption, color: c.mute, marginTop: 2 }}>
                              {fmtUSD2(cur * qty)} value
                            </div>
                          </div>
                          <div style={{ ...t.bodyMD, color: c.body, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{qty}</div>
                          <div style={{ ...t.bodyMD, color: c.mute, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${cost.toFixed(2)}</div>
                          <div style={{ ...t.bodyMD, color: c.ink, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${cur.toFixed(2)}</div>
                          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            <div style={{ ...t.bodyMDStrong, color: pu ? c.success : c.error }}>{pu ? "+" : "−"}${Math.abs(pd).toFixed(2)}</div>
                            <div style={{ ...t.caption, color: pu ? c.success : c.error, marginTop: 2 }}>{pu ? "+" : "−"}{Math.abs(pp).toFixed(2)}%</div>
                          </div>
                          <div style={{ ...t.captionMono, color: c.body }}>{TICKER_SECTOR[pos.symbol] || "other"}</div>
                        </div>
                      );
                    })}
                  </Card>
                )}

                {/* AI MARKET READ */}
                {log[0] && (
                  <>
                    <SectionTitle
                      right={log[0].regime?.overall_risk_regime && (
                        <MonoBadge tone={log[0].regime.overall_risk_regime === "panic" ? "error" : log[0].regime.overall_risk_regime === "risk_on" ? "success" : "warning"}>
                          {log[0].regime.overall_risk_regime.replace("_", " ")}
                        </MonoBadge>
                      )}
                    >AI market read</SectionTitle>
                    <Card padding={s.lg} style={{ marginBottom: s.xl }}>
                      <p style={{ ...t.bodyLG, color: c.ink, margin: 0, marginBottom: log[0].outlook ? s.md : 0 }}>
                        {log[0].market || "Run an analysis to see KENOS's market read."}
                      </p>
                      {log[0].outlook && (
                        <div style={{ paddingTop: s.md, borderTop: `1px solid ${c.hairline}` }}>
                          <Eyebrow style={{ marginBottom: s.xs }}>outlook</Eyebrow>
                          <p style={{ ...t.bodyMD, color: c.body, margin: 0 }}>{log[0].outlook}</p>
                        </div>
                      )}
                      {log[0].news?.length > 0 && (
                        <div style={{ paddingTop: s.md, marginTop: s.md, borderTop: `1px solid ${c.hairline}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s.xs }}>
                            <Eyebrow>news</Eyebrow>
                            {log[0].breaking && <MonoBadge tone="error">🚨 breaking</MonoBadge>}
                          </div>
                          {log[0].news.slice(0, 10).map((n, i) => {
                            // Support both old format (string) and new format (object)
                            const isObj = typeof n === "object" && n !== null;
                            const headline = isObj ? n.headline : n;
                            const sev = isObj ? n.severity : null;
                            const tickers = isObj ? n.impacted_tickers : null;
                            const cat = isObj ? n.category : null;
                            const sevTone = sev === "HIGH" ? "error" : sev === "MEDIUM" ? "warning" : null;
                            return (
                              <div key={i} style={{ ...t.bodySM, color: c.body, padding: "5px 0", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", display: "flex", gap: s.xs, alignItems: "flex-start", flexWrap: "wrap" }}>
                                {sev && <MonoBadge tone={sevTone || "default"}>{sev.toLowerCase()}</MonoBadge>}
                                <span style={{ flex: "1 1 200px", minWidth: 0, color: c.ink }}>{headline}</span>
                                {tickers?.length > 0 && (
                                  <span style={{ ...t.captionMono, color: c.link }}>{tickers.join(" ")}</span>
                                )}
                                {cat && <span style={{ ...t.captionMono, color: c.mute }}>{cat}</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  </>
                )}

                {/* ACTIVITY FEED */}
                {activityFeed.length > 0 && (
                  <>
                    <SectionTitle right={<MonoBadge>{activityFeed.length} recent</MonoBadge>}>Activity</SectionTitle>
                    <Card padding={0} style={{ marginBottom: s.xl, overflow: "hidden" }}>
                      {activityFeed.map((act, i) => {
                        const isExec = act.kind === "executed";
                        return (
                          <div key={i} className="row-hover" style={{
                            display: "grid",
                            gridTemplateColumns: "80px 80px 1fr 100px",
                            gap: s.md, padding: `${s.sm}px ${s.lg}px`,
                            borderBottom: i < activityFeed.length - 1 ? `1px solid ${c.hairline}` : "none",
                            alignItems: "center",
                          }}>
                            <span style={{ ...t.captionMono, color: c.mute }}>{fmtTime(act.ts)}</span>
                            {isExec ? (
                              <MonoBadge tone={act.action === "BUY" ? "success" : "error"}>{act.action.toLowerCase()}</MonoBadge>
                            ) : (
                              <MonoBadge tone="warning">skip</MonoBadge>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <span style={{ ...t.bodySMStrong, color: c.ink }}>{act.ticker}</span>
                              {isExec && <span style={{ ...t.bodySM, color: c.body, marginLeft: s.sm }}>
                                {act.qty} @ ${Number(act.price || 0).toFixed(2)}
                                {act.forced && <span style={{ color: c.warning, marginLeft: s.xs }}>· {act.forced.toLowerCase().replace("_", " ")}</span>}
                              </span>}
                              {!isExec && <span style={{ ...t.bodySM, color: c.mute, marginLeft: s.sm }}>{act.reason}</span>}
                            </div>
                            <span style={{ ...t.captionMono, color: c.mute, textAlign: "right" }}>
                              {isExec && act.pnl !== undefined && (
                                <span style={{ color: act.pnl > 0 ? c.success : c.error }}>
                                  {act.pnl > 0 ? "+" : ""}${act.pnl.toFixed(2)}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </Card>
                  </>
                )}

              </div>

              {/* ─── RIGHT SIDEBAR ─── */}
              <aside style={{ minWidth: 0 }}>

                {/* Risk card */}
                {currentRisk && (
                  <SidebarCard
                    title="risk profile"
                    right={<MonoBadge>{currentTier?.label?.replace(/^[^A-Za-z]+\s*/, "").toLowerCase()}</MonoBadge>}
                  >
                    <div style={{ ...t.bodyMDStrong, color: c.ink, marginBottom: s.sm }}>
                      {profile.charAt(0) + profile.slice(1).toLowerCase()}
                    </div>
                    <KV k="buy conf ≥" v={currentRisk.BUY_CONF_MIN.toFixed(2)} />
                    <KV k="stop-loss" v={`${(currentRisk.STOP_LOSS_PCT*100).toFixed(0)}%`} color={c.error} />
                    <KV k="take-profit" v={`+${(currentRisk.TAKE_PROFIT_PCT*100).toFixed(0)}%`} color={c.success} />
                    <KV k="position cap" v={`${(currentRisk.POSITION_CAP_PCT*100).toFixed(0)}%`} />
                    <KV k="cash floor" v={`${(currentRisk.CASH_FLOOR_PCT*100).toFixed(0)}%`} />
                    <KV k="max positions" v={currentRisk.MAX_POSITIONS} />
                  </SidebarCard>
                )}

                {/* Drawdown card */}
                {currentDrawdowns && (
                  <SidebarCard
                    title="drawdown"
                    right={currentKillSwitch?.level !== "NORMAL" && (
                      <MonoBadge tone={currentKillSwitch.severity >= 2 ? "error" : "warning"}>{currentKillSwitch.level.replace("_", " ").toLowerCase()}</MonoBadge>
                    )}
                  >
                    {[
                      ["daily",   currentDrawdowns.daily,   KILL_SWITCH_LIMITS.DAILY_LOSS_HALT],
                      ["weekly",  currentDrawdowns.weekly,  KILL_SWITCH_LIMITS.WEEKLY_LOSS_HALT],
                      ["monthly", currentDrawdowns.monthly, KILL_SWITCH_LIMITS.MONTHLY_LOSS_HALT],
                    ].map(([label, val, lim], i) => {
                      const breached = val <= lim;
                      const col = breached ? c.error : val < 0 ? c.warning : c.success;
                      return (
                        <KV key={i}
                          k={label}
                          v={`${val > 0 ? "+" : ""}${(val * 100).toFixed(2)}%`}
                          color={col}
                        />
                      );
                    })}
                  </SidebarCard>
                )}

                {/* Macro card */}
                {log[0]?.regime && (
                  <SidebarCard
                    title="macro regime"
                    right={log[0].regime.fomc_within_2d && <MonoBadge tone="error">fomc 2d</MonoBadge>}
                  >
                    {(() => {
                      const g = log[0].regime;
                      const items = [
                        ["vix", `${g.vix?.toFixed(1)} · ${g.vix_state || "—"}`, g.vix > 30 ? c.error : g.vix > 20 ? c.warning : c.success],
                        ["10y / 2y", `${g.us10y?.toFixed(2)}% / ${g.us2y?.toFixed(2)}%`, null],
                        ["curve", `${g.yield_curve_bps}bps · ${g.yield_curve_bps < 0 ? "inverted" : "normal"}`, g.yield_curve_bps < 0 ? c.error : c.success],
                        ["dxy", g.dxy?.toFixed(2), null],
                        ["wti", `$${g.wti?.toFixed(2)}`, null],
                        ["btc", `$${Math.round(g.btc || 0).toLocaleString()}`, null],
                        ["fomc", g.next_fomc_date || "—", g.fomc_within_2d ? c.error : null],
                      ];
                      return items.map(([k, v, col], i) => <KV key={i} k={k} v={v} color={col} />);
                    })()}
                  </SidebarCard>
                )}

                {/* Account additional */}
                {account && (
                  <SidebarCard title="account">
                    <KV k="portfolio" v={fmtUSD0(pv)} />
                    <KV k="cash" v={fmtUSD0(account.cash)} />
                    <KV k="buying power" v={fmtUSD0(account.buying_power)} />
                    <KV k="positions" v={positions.length} />
                    <KV k="filled orders" v={orders.filter(o => o.status === "filled").length} />
                    {winRate && <KV k="win rate" v={`${winRate}%`} color={Number(winRate) > 50 ? c.success : c.error} />}
                  </SidebarCard>
                )}

              </aside>

            </div>
          </div>
        </section>

        {/* ── DECISION LOG (full width below) ─────── */}
        {log.length > 0 && (
          <section style={{ padding: `${s.xl}px ${s.lg}px`, borderTop: `1px solid ${c.hairline}`, background: c.canvas }}>
            <div style={containerStyle}>
              <SectionTitle right={<MonoBadge>{log.length} cycles</MonoBadge>}>Decision log</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: s.sm, maxHeight: 500, overflowY: "auto" }}>
                {log.map(entry => (
                  <Card key={entry.id} padding={s.md}>
                    <div onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", flexWrap: "wrap", gap: s.sm }}>
                      <div style={{ display: "flex", gap: s.sm, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ ...t.captionMono, color: c.mute }}>{fmtDay(entry.ts)} {fmtTime(entry.ts)}</span>
                        {entry.profile && <MonoBadge>{entry.profile.toLowerCase()}</MonoBadge>}
                        <MonoBadge tone={entry.risk === "HIGH" || entry.risk === "EXTREME" ? "error" : entry.risk === "MEDIUM" ? "warning" : "success"}>
                          {entry.risk.toLowerCase()}
                        </MonoBadge>
                        {entry.executed?.length > 0 && <MonoBadge tone="info">{entry.executed.length} exec</MonoBadge>}
                        {entry.skipped?.length > 0 && <MonoBadge tone="warning">{entry.skipped.length} skip</MonoBadge>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: s.sm }}>
                        <span style={{ ...t.bodyMDStrong, color: c.ink, fontVariantNumeric: "tabular-nums" }}>
                          {fmtUSD2(entry.value)}
                        </span>
                        <span style={{ ...t.caption, color: c.mute }}>{expanded === entry.id ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {expanded === entry.id && (
                      <div style={{ marginTop: s.md }}>
                        {(entry.decisions || []).filter(d => d.action !== "HOLD").slice(0, 3).length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: s.sm, marginBottom: s.md }}>
                            {(entry.decisions || []).filter(d => d.action !== "HOLD").slice(0, 3).map((d, i) => (
                              <Card key={i} padding={s.md} elevated>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: s.xs }}>
                                  <span style={{ ...t.bodyMDStrong, color: c.ink }}>{d.ticker}</span>
                                  <MonoBadge tone={d.action === "BUY" ? "success" : "error"}>{d.action.toLowerCase()}</MonoBadge>
                                </div>
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
                        {(entry.decisions || []).filter(d => d.action === "HOLD").length > 0 && (
                          <div style={{ marginTop: s.xs, ...t.bodySM, color: c.mute }}>
                            + {(entry.decisions || []).filter(d => d.action === "HOLD").length} more analyzed (hold).
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── ORDER HISTORY (collapsible at the bottom) ─ */}
        {orders.length > 0 && (
          <section style={{ padding: `${s.xl}px ${s.lg}px`, borderTop: `1px solid ${c.hairline}` }}>
            <div style={containerStyle}>
              <SectionTitle
                right={
                  <button onClick={() => setShowOrders(s => !s)} style={{
                    ...t.bodySM, color: c.body, background: "transparent",
                    border: "none", cursor: "pointer", padding: 0,
                  }}>
                    {showOrders ? "Collapse ▲" : `Show all ${orders.length} ▼`}
                  </button>
                }
              >Order history</SectionTitle>
              <Card padding={0} style={{ overflow: "hidden" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 80px 110px 1fr",
                  gap: s.md, padding: `${s.sm}px ${s.lg}px`,
                  background: c.canvasSoft2, borderBottom: `1px solid ${c.hairline}`,
                }}>
                  {["side", "ticker", "qty", "status", "time"].map((h, i) => (
                    <div key={i} style={{ ...t.captionMono, color: c.mute, textAlign: i === 4 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>
                {orders.slice(0, showOrders ? orders.length : 5).map((o, i, arr) => (
                  <div key={i} className="row-hover" style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr 80px 110px 1fr",
                    gap: s.md, padding: `${s.sm}px ${s.lg}px`,
                    borderBottom: i < arr.length - 1 ? `1px solid ${c.hairline}` : "none",
                    alignItems: "center",
                  }}>
                    <MonoBadge tone={o.side === "buy" ? "success" : "error"}>{o.side}</MonoBadge>
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
        <footer style={{ background: c.canvas, borderTop: `1px solid ${c.hairline}`, padding: `${s.xl}px ${s.lg}px ${s.lg}px` }}>
          <div style={containerStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: s.md }}>
              <div style={{ display: "flex", alignItems: "center", gap: s.sm }}>
                <div style={{
                  width: 18, height: 18, borderRadius: rad.sm,
                  background: meshGradient.backdrop, backgroundColor: c.canvas,
                }} />
                <span style={{ ...t.bodySM, color: c.body }}>KENOS · κένωσις · paper trading on Alpaca.</span>
              </div>
              <div style={{ ...t.captionMono, color: c.mute }}>
                v1.0 · not investment advice · day {days + 1}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
