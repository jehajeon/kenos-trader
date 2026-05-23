// pages/api/auto-run.js
// GitHub Actions cron이 호출하는 무인 트레이딩 오케스트레이터
// 균형형 스케줄 + 이벤트 회피 + 프로파일/티어/킬스위치 (lib/risk-config.js와 동기화)

import {
  resolveRisk, computeDrawdowns, evaluateKillSwitch, KILL_SWITCH_LIMITS,
  CORRELATION_GROUPS, PROFILES,
} from "../../lib/risk-config";

const ALPACA_URL = "https://paper-api.alpaca.markets";

// 시간 윈도우 (ET, [시작분, 종료분] in minutes since midnight)
// 9:00 AM = 540, 10:00 AM = 600, 3:30 PM = 930, Sun 8 PM = 1200
const RUN_WINDOWS = {
  "morning_preview":  { day:"weekday", min:535, max:545, execute:true,  label:"09:00 ET" },
  "post_open":        { day:"weekday", min:595, max:605, execute:true,  label:"10:00 ET" },
  "pre_close":        { day:"weekday", min:925, max:935, execute:true,  label:"15:30 ET" },
  "weekly_review":    { day:"sunday",  min:1195,max:1205,execute:false, label:"Sun 20:00 ET" },
};

// 이벤트 블랙아웃 — 시간 기반 일괄 차단은 비활성화.
// 이유: CPI/NFP는 월 1~2회만 발생하는데 매일 8:30–9:30을 막으면 정상 9 AM 실행이 모두 차단됨.
// 대신 AI의 매크로 분석(R10 VIX, R11 FOMC, regime.fomc_within_2d)이 이벤트별로 점수·수량을 조정함.
// 구체적인 발표일을 추가하려면 [{date:"YYYY-MM-DD", min:N, max:N, name:""}, ...] 형식으로 확장.
const BLACKOUT_WINDOWS = [];

function getETParts() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return {
    weekday: p.weekday,                                  // "Mon".."Sun"
    hour: parseInt(p.hour === "24" ? "0" : p.hour, 10),  // 0..23
    minute: parseInt(p.minute, 10),
    date: `${p.year}-${p.month}-${p.day}`,
    minutesSinceMidnight: parseInt(p.hour === "24" ? "0" : p.hour, 10) * 60 + parseInt(p.minute, 10),
  };
}

function pickWindow(et) {
  const isSunday = et.weekday === "Sun";
  const isWeekday = ["Mon","Tue","Wed","Thu","Fri"].includes(et.weekday);
  for (const [key, w] of Object.entries(RUN_WINDOWS)) {
    if (w.day === "sunday"  && !isSunday)  continue;
    if (w.day === "weekday" && !isWeekday) continue;
    if (et.minutesSinceMidnight >= w.min && et.minutesSinceMidnight <= w.max) {
      return { key, ...w };
    }
  }
  return null;
}

function inBlackout(et) {
  return BLACKOUT_WINDOWS.find(b =>
    et.minutesSinceMidnight >= b.min && et.minutesSinceMidnight <= b.max
  );
}

async function alpaca(path, method="GET", body=null) {
  const r = await fetch(`${ALPACA_URL}${path}`, {
    method,
    headers: {
      "APCA-API-KEY-ID": process.env.ALPACA_KEY,
      "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET,
      "Content-Type": "application/json",
    },
    body: body && method !== "GET" ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Alpaca ${path} ${r.status}: ${JSON.stringify(data).slice(0,200)}`);
  return data;
}

// 섹터 매핑만 로컬 유지 (UI에는 노출 안 함, 가드레일에만 사용)
const SECTORS = {
  "🇰🇷 한국":["EWY"], "🔬 바이오":["MRNA","ABBV","REGN"], "⚡ 에너지":["XOM","CVX","NEE"],
  "🔋 배터리":["TSLA","ALB"], "💾 반도체":["NVDA","AMD","TSM","AVGO"],
  "🤖 AI/테크":["MSFT","GOOGL","META","PLTR","AMZN"], "🌱 환경":["ENPH","FSLR"],
  "🚗 자동차":["TM","GM"], "🚀 미래유망":["RKLB","IONQ","AAPL","COIN"],
};
const TICKER_SECTOR = {};
Object.entries(SECTORS).forEach(([s,ts]) => ts.forEach(t => TICKER_SECTOR[t]=s));

export default async function handler(req, res) {
  // 0) Cron 시크릿 검증
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers["x-cron-secret"] !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // Breaking-news trigger: called by /api/news-poll on HIGH severity.
  // Bypasses time window check (whole point of "breaking" is off-cycle execution),
  // but still respects market hours (Alpaca clock) and kill switch.
  const isBreaking = req.query.reason === "breaking";
  const breaking_context = isBreaking ? (req.body?.breaking_context || null) : null;

  // 1) ET 시간 윈도우 검증 (breaking은 우회)
  const et = getETParts();
  const win = isBreaking
    ? { key: "breaking", day: et.weekday === "Sun" ? "sunday" : "weekday", min: 0, max: 1440, execute: true, label: "🚨 BREAKING" }
    : pickWindow(et);
  if (!win) {
    return res.status(200).json({
      skipped: true, reason: "outside scheduled window",
      et_time: `${et.weekday} ${et.hour}:${String(et.minute).padStart(2,"0")} ET`,
    });
  }

  // 2) 이벤트 블랙아웃 검증 (breaking은 우회 — 속보는 블랙아웃 중에도 대응 필요)
  if (!isBreaking) {
    const blackout = inBlackout(et);
    if (blackout) {
      return res.status(200).json({
        skipped: true, reason: `blackout: ${blackout.name}`,
        window: win.label, et_time: `${et.hour}:${String(et.minute).padStart(2,"0")} ET`,
      });
    }
  }

  // 3) Alpaca 시계 확인 — 휴장일/주말 자동 회피 (단, weekly_review는 시장 닫혀도 분석만 수행)
  try {
    const clock = await alpaca("/v2/clock");
    if (!clock.is_open && win.execute) {
      return res.status(200).json({
        skipped: true, reason: "market closed (holiday or weekend)",
        next_open: clock.next_open, window: win.label,
      });
    }

    // 4) 계좌·포지션 + 포트폴리오 히스토리 (드로다운 계산용) 로드
    const account = await alpaca("/v2/account");
    const positions = await alpaca("/v2/positions");
    let alpacaHistory = { equity:[], timestamp:[] };
    try {
      alpacaHistory = await alpaca("/v2/account/portfolio/history?period=1M&timeframe=1D");
    } catch(e) {
      console.warn("portfolio history fetch failed:", e.message);
    }
    const history = (alpacaHistory.timestamp || []).map((t,i) => ({
      ts: new Date(t * 1000).toISOString(),
      v:  Number(alpacaHistory.equity?.[i] || 0),
    })).filter(h => h.v > 0);

    // 5) 프로파일 + 자금 티어 + 킬 스위치
    const pv = Number(account.portfolio_value);
    const profileName = process.env.KENOS_PROFILE in PROFILES ? process.env.KENOS_PROFILE : "BALANCED";
    const risk = resolveRisk(profileName, pv);
    const drawdowns = computeDrawdowns({
      currentEquity: pv,
      lastEquity:    Number(account.last_equity || pv),
      history,
    });
    const killSwitch = evaluateKillSwitch(drawdowns);

    // 6) Claude 분석 호출 — risk + kill_switch를 함께 전달
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const analyzeRes = await fetch(`${proto}://${host}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, positions, risk, kill_switch: killSwitch }),
    });
    if (!analyzeRes.ok) {
      const e = await analyzeRes.json();
      throw new Error(`analyze failed: ${e.error || analyzeRes.status}`);
    }
    const ai = await analyzeRes.json();

    // 7) Weekly review = 분석만, 주문 실행 안 함
    if (!win.execute) {
      return res.status(200).json({
        window: win.label, executed: [], skipped: [],
        profile: profileName, tier: risk._tier_label,
        drawdowns, kill_switch: killSwitch,
        decisions: ai.decisions || [], market: ai.market, outlook: ai.outlook,
        regime: ai.regime || null, note: "weekly review — analysis only, no orders",
      });
    }

    // 8) 가드레일 + 주문 실행
    const vix = Number(ai.regime?.vix || 0);
    const fomcSoon = !!ai.regime?.fomc_within_2d;
    const panicRegime = vix >= risk.PANIC_VIX;

    const positionMV = {}, sectorMV = {};
    positions.forEach(p => {
      const mv = Number(p.current_price) * Number(p.qty);
      positionMV[p.symbol] = mv;
      const s = TICKER_SECTOR[p.symbol] || "기타";
      sectorMV[s] = (sectorMV[s] || 0) + mv;
    });
    const groupOf = t => Object.entries(CORRELATION_GROUPS).find(([,ns]) => ns.includes(t))?.[0] || null;
    const groupExposure = (g, exclude) => CORRELATION_GROUPS[g].reduce((a,t) => {
      if (t === exclude || !positionMV[t]) return a;
      return { mv: a.mv + positionMV[t], names: a.names + 1 };
    }, { mv:0, names:0 });

    // 강제 매매 (stop-loss / take-profit / rebalance) — 킬스위치도 강제는 통과시킴
    const forced = [];
    positions.forEach(p => {
      const cost = Number(p.avg_entry_price), cur = Number(p.current_price), qty = Number(p.qty);
      const pnlPct = (cur - cost) / cost;
      const weight = (cur * qty) / pv;
      if (pnlPct <= risk.STOP_LOSS_PCT) {
        forced.push({ ticker:p.symbol, action:"SELL", qty, reasoning:`STOP-LOSS ${(pnlPct*100).toFixed(1)}%`, conf:0.99, forced:"STOP_LOSS" });
      } else if (pnlPct >= risk.TAKE_PROFIT_PCT) {
        const trim = Math.max(1, Math.floor(qty * risk.TAKE_PROFIT_TRIM_PCT));
        forced.push({ ticker:p.symbol, action:"SELL", qty:trim, reasoning:`TAKE-PROFIT +${(pnlPct*100).toFixed(1)}%`, conf:0.99, forced:"TAKE_PROFIT" });
      } else if (weight > risk.POSITION_CAP_PCT) {
        const targetMV = pv * risk.POSITION_CAP_PCT;
        const trim = Math.max(1, Math.ceil(((cur * qty) - targetMV) / cur));
        forced.push({ ticker:p.symbol, action:"SELL", qty:trim, reasoning:`REBALANCE 비중 ${(weight*100).toFixed(1)}%`, conf:0.99, forced:"POSITION_CAP" });
      }
    });

    const aiDecisions = (ai.decisions || []).filter(d => d.action !== "HOLD");
    const forcedTickers = new Set(forced.map(d => d.ticker));
    const merged = [...forced, ...aiDecisions.filter(d => !forcedTickers.has(d.ticker))];

    const executed = [], skipped = [];
    let cash = Number(account.cash);

    for (const d of merged) {
      const price = ai.prices?.[d.ticker] || 0;
      if (!price) { skipped.push({ticker:d.ticker, reason:"no price"}); continue; }
      const conf = d.conf || 0;
      const isForced = !!d.forced;

      // 킬 스위치 검증 (강제 매매는 통과)
      if (!isForced) {
        if (d.action === "BUY" && !killSwitch.allowAiBuy) {
          skipped.push({ticker:d.ticker, reason:`killswitch ${killSwitch.level}`});
          continue;
        }
        if ((d.action === "SELL" || d.action === "TRIM") && !killSwitch.allowAiSell) {
          skipped.push({ticker:d.ticker, reason:`killswitch ${killSwitch.level}`});
          continue;
        }
      }

      try {
        if (d.action === "BUY" && d.qty > 0) {
          const reqConf = panicRegime ? risk.PANIC_BUY_CONF_MIN : risk.BUY_CONF_MIN;
          if (conf < reqConf) { skipped.push({ticker:d.ticker, reason:`conf ${conf.toFixed(2)} < ${reqConf}`}); continue; }
          if (d.earnings_blackout) { skipped.push({ticker:d.ticker, reason:"earnings blackout"}); continue; }

          const adjQty = fomcSoon ? Math.max(1, Math.floor(d.qty * 0.5)) : d.qty;
          const cost = price * adjQty;

          // 최소 거래 금액 (자금 티어)
          if (cost < risk.MIN_DOLLAR_PER_TRADE) {
            skipped.push({ticker:d.ticker, reason:`trade $${cost.toFixed(0)} < min $${risk.MIN_DOLLAR_PER_TRADE}`});
            continue;
          }

          // 최대 포지션 수 (자금 티어)
          const heldTickers = Object.keys(positionMV).filter(t => positionMV[t] > 0);
          const alreadyHeld = (positionMV[d.ticker] || 0) > 0;
          if (!alreadyHeld && heldTickers.length >= risk.MAX_POSITIONS) {
            skipped.push({ticker:d.ticker, reason:`max positions ${risk.MAX_POSITIONS} reached`});
            continue;
          }

          if (cash - cost < pv * risk.CASH_FLOOR_PCT) { skipped.push({ticker:d.ticker, reason:"cash floor"}); continue; }

          const newPosMV = (positionMV[d.ticker] || 0) + cost;
          if (newPosMV / pv > risk.POSITION_CAP_PCT) { skipped.push({ticker:d.ticker, reason:"position cap"}); continue; }

          const sect = TICKER_SECTOR[d.ticker] || "기타";
          if (((sectorMV[sect] || 0) + cost) / pv > risk.SECTOR_CAP_PCT) { skipped.push({ticker:d.ticker, reason:`sector ${sect} cap`}); continue; }

          const grp = groupOf(d.ticker);
          if (grp) {
            const ge = groupExposure(grp, d.ticker);
            if ((ge.mv + newPosMV) / pv > risk.CORR_GROUP_CAP_PCT) { skipped.push({ticker:d.ticker, reason:`group ${grp} cap`}); continue; }
            if (ge.names + (alreadyHeld ? 0 : 1) > risk.CORR_GROUP_MAX_NAMES) { skipped.push({ticker:d.ticker, reason:`group ${grp} names`}); continue; }
          }

          const limitPrice = d.limit_price && d.limit_price > 0
            ? d.limit_price
            : +(price * (1 + risk.LIMIT_SLIPPAGE_PCT)).toFixed(2);
          const order = await alpaca("/v2/orders", "POST", {
            symbol:d.ticker, qty:String(adjQty), side:"buy", type:"limit",
            limit_price:String(limitPrice), time_in_force:"day",
          });
          executed.push({action:"BUY", ticker:d.ticker, qty:adjQty, price, limitPrice, orderId:order.id});
          cash -= cost;
          positionMV[d.ticker] = newPosMV;
          sectorMV[sect] = (sectorMV[sect] || 0) + cost;

        } else if (d.action === "SELL" || d.action === "TRIM") {
          const holding = positions.find(p => p.symbol === d.ticker);
          if (!holding) { skipped.push({ticker:d.ticker, reason:"not held"}); continue; }
          const heldQty = Number(holding.qty);
          const cost = Number(holding.avg_entry_price);
          const profitable = price > cost;
          const reqSellConf = isForced ? 0 : (profitable ? risk.SELL_PROFIT_CONF_MIN : risk.SELL_LOSS_CONF_MIN);
          if (conf < reqSellConf) { skipped.push({ticker:d.ticker, reason:`sell conf ${conf.toFixed(2)} < ${reqSellConf}`}); continue; }

          const sellQty = Math.min(heldQty, d.qty || heldQty);
          const limitPrice = d.limit_price && d.limit_price > 0
            ? d.limit_price
            : +(price * (1 - risk.LIMIT_SLIPPAGE_PCT)).toFixed(2);
          const order = await alpaca("/v2/orders", "POST", {
            symbol:d.ticker, qty:String(sellQty), side:"sell", type:"limit",
            limit_price:String(limitPrice), time_in_force:"day",
          });
          executed.push({
            action: sellQty < heldQty ? "TRIM" : "SELL",
            ticker:d.ticker, qty:sellQty, price, limitPrice, orderId:order.id,
            pnl:(price - cost) * sellQty, forced:d.forced || null,
          });
          cash += price * sellQty;
          positionMV[d.ticker] = Math.max(0, (positionMV[d.ticker] || 0) - price * sellQty);
        }
      } catch(oe) {
        skipped.push({ticker:d.ticker, reason:`order failed: ${oe.message}`});
      }
    }

    res.status(200).json({
      window: win.label,
      et_time: `${et.weekday} ${et.hour}:${String(et.minute).padStart(2,"0")} ET`,
      profile: profileName, tier: risk._tier_label,
      regime: ai.regime || null,
      drawdowns, kill_switch: killSwitch,
      executed, skipped,
      portfolio_value: pv, cash_after: cash,
      market: ai.market, risk_level: ai.risk, outlook: ai.outlook,
    });

  } catch (e) {
    res.status(500).json({ error: e.message, et_time: `${et.hour}:${String(et.minute).padStart(2,"0")} ET` });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
