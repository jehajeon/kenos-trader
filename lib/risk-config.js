// lib/risk-config.js
// KENOS 공유 리스크 설정 — 브라우저(index.js) + 서버(auto-run.js, analyze.js) 양쪽에서 사용
// 순수 JS, React/Node 의존성 없음

// ─────────────────────────────────────────────────────────────────────
// 1) 투자 강도 프로파일 — 사용자가 선택 (UI 토글 또는 KENOS_PROFILE env var)
// ─────────────────────────────────────────────────────────────────────
export const PROFILES = {
  CONSERVATIVE: {
    label:                "🛡 보수형",
    description:          "신뢰도 높을 때만 진입, 손절 빠름, 익절도 빠름. 변동성 회피.",
    BUY_CONF_MIN:         0.70,
    SELL_PROFIT_CONF_MIN: 0.50,
    SELL_LOSS_CONF_MIN:   0.40,
    PANIC_BUY_CONF_MIN:   0.80,
    STOP_LOSS_PCT:       -0.05,
    TAKE_PROFIT_PCT:      0.15,
    TAKE_PROFIT_TRIM_PCT: 0.60,
    POSITION_CAP_PCT:     0.08,
    SECTOR_CAP_PCT:       0.25,
    CORR_GROUP_CAP_PCT:   0.15,
    CORR_GROUP_MAX_NAMES: 2,
    CASH_FLOOR_PCT:       0.25,
    LIMIT_SLIPPAGE_PCT:   0.001,
  },
  BALANCED: {
    label:                "⚖ 표준형",
    description:          "기본값. 적정 신뢰도, 적정 손익 한도. 균형 잡힌 분산.",
    BUY_CONF_MIN:         0.60,
    SELL_PROFIT_CONF_MIN: 0.55,
    SELL_LOSS_CONF_MIN:   0.45,
    PANIC_BUY_CONF_MIN:   0.75,
    STOP_LOSS_PCT:       -0.08,
    TAKE_PROFIT_PCT:      0.25,
    TAKE_PROFIT_TRIM_PCT: 0.50,
    POSITION_CAP_PCT:     0.12,
    SECTOR_CAP_PCT:       0.30,
    CORR_GROUP_CAP_PCT:   0.20,
    CORR_GROUP_MAX_NAMES: 2,
    CASH_FLOOR_PCT:       0.15,
    LIMIT_SLIPPAGE_PCT:   0.002,
  },
  AGGRESSIVE: {
    label:                "🔥 공격형",
    description:          "신뢰도 임계값 낮음, 손절·익절 폭 큼, 집중 투자 허용.",
    BUY_CONF_MIN:         0.55,
    SELL_PROFIT_CONF_MIN: 0.55,
    SELL_LOSS_CONF_MIN:   0.50,
    PANIC_BUY_CONF_MIN:   0.70,
    STOP_LOSS_PCT:       -0.12,
    TAKE_PROFIT_PCT:      0.40,
    TAKE_PROFIT_TRIM_PCT: 0.40,
    POSITION_CAP_PCT:     0.20,
    SECTOR_CAP_PCT:       0.40,
    CORR_GROUP_CAP_PCT:   0.30,
    CORR_GROUP_MAX_NAMES: 3,
    CASH_FLOOR_PCT:       0.10,
    LIMIT_SLIPPAGE_PCT:   0.003,
  },
};

// ─────────────────────────────────────────────────────────────────────
// 2) 자금 규모 티어 — 포트폴리오 가치에 따라 자동 적용
//    POSITION_CAP_OVERRIDE: 프로파일의 종목 비중 캡을 덮어씀 (null = 프로파일 값 사용)
//    MAX_POSITIONS: 동시 보유 가능한 최대 종목 수
//    MIN_DOLLAR_PER_TRADE: 이 금액 미만 거래는 자동 skip (의미 없는 잔돈 거래 방지)
// ─────────────────────────────────────────────────────────────────────
export const CAPITAL_TIERS = [
  { name:"micro",  label:"🌱 마이크로",  max:5000,
    POSITION_CAP_OVERRIDE: 0.25,  MAX_POSITIONS: 4,  MIN_DOLLAR_PER_TRADE: 50,
    note: "소액 — 분산 어려움. 집중도 ↑, 종목 수 ↓" },
  { name:"small",  label:"📈 스몰",       max:50000,
    POSITION_CAP_OVERRIDE: null,  MAX_POSITIONS: 12, MIN_DOLLAR_PER_TRADE: 200,
    note: "기본 — 프로파일 한도 그대로 적용" },
  { name:"medium", label:"🏢 미디엄",     max:500000,
    POSITION_CAP_OVERRIDE: 0.10,  MAX_POSITIONS: 20, MIN_DOLLAR_PER_TRADE: 500,
    note: "중형 — 분산 강화, 종목당 한도 ↓" },
  { name:"large",  label:"🏛 라지",        max:Infinity,
    POSITION_CAP_OVERRIDE: 0.05,  MAX_POSITIONS: 30, MIN_DOLLAR_PER_TRADE: 1000,
    note: "대형 — 호가 충격 회피, 강한 분산" },
];

export function getCapitalTier(portfolioValue) {
  return CAPITAL_TIERS.find(t => portfolioValue < t.max) || CAPITAL_TIERS[CAPITAL_TIERS.length - 1];
}

// 공통 상수 (프로파일·티어 무관)
export const COMMON = {
  PANIC_VIX:    30,
  ELEVATED_VIX: 25,
};

// ─────────────────────────────────────────────────────────────────────
// 3) 최종 리스크 설정 해결 — 프로파일 + 자금 티어 머지
// ─────────────────────────────────────────────────────────────────────
export function resolveRisk(profileName, portfolioValue) {
  const profile = PROFILES[profileName] || PROFILES.BALANCED;
  const tier = getCapitalTier(portfolioValue);
  return {
    ...profile,
    ...COMMON,
    POSITION_CAP_PCT:     tier.POSITION_CAP_OVERRIDE !== null ? tier.POSITION_CAP_OVERRIDE : profile.POSITION_CAP_PCT,
    MAX_POSITIONS:        tier.MAX_POSITIONS,
    MIN_DOLLAR_PER_TRADE: tier.MIN_DOLLAR_PER_TRADE,
    _profile_name:        profileName in PROFILES ? profileName : "BALANCED",
    _tier_name:           tier.name,
    _tier_label:          tier.label,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 4) 드로다운 킬 스위치
//    DAILY:   당일 -3% 손실   → 신규 AI 매수 정지 (SELL과 강제 매매는 허용)
//    WEEKLY:  주간 -7% 손실   → 모든 AI 매매 정지 (강제 매매만 허용)
//    MONTHLY: 월간 -15% 손실  → 시스템 정지 (강제 매매만, 스탑로스 보호 유지)
// ─────────────────────────────────────────────────────────────────────
export const KILL_SWITCH_LIMITS = {
  DAILY_LOSS_HALT:   -0.03,
  WEEKLY_LOSS_HALT:  -0.07,
  MONTHLY_LOSS_HALT: -0.15,
};

// 드로다운 계산 — currentEquity는 필수, lastEquity는 일일(어제 종가) 비교용
// history는 [{ts:ISO, v:number}, ...] 형식 (주간·월간 계산용)
export function computeDrawdowns({ currentEquity, lastEquity, history }) {
  const daily = lastEquity && lastEquity > 0
    ? (currentEquity - lastEquity) / lastEquity
    : 0;

  let weekly = 0, monthly = 0;
  if (history && history.length > 0) {
    const findAt = (msAgo) => {
      const target = Date.now() - msAgo;
      for (let i = history.length - 1; i >= 0; i--) {
        const t = new Date(history[i].ts).getTime();
        if (t <= target) return history[i].v;
      }
      return history[0].v;
    };
    const wAgo = findAt(7  * 24 * 3600 * 1000);
    const mAgo = findAt(30 * 24 * 3600 * 1000);
    weekly  = wAgo > 0 ? (currentEquity - wAgo) / wAgo : 0;
    monthly = mAgo > 0 ? (currentEquity - mAgo) / mAgo : 0;
  }
  return { daily, weekly, monthly };
}

export function evaluateKillSwitch(drawdowns) {
  const d = drawdowns || { daily:0, weekly:0, monthly:0 };
  if (d.monthly <= KILL_SWITCH_LIMITS.MONTHLY_LOSS_HALT) {
    return {
      level: "MONTHLY_HALT",
      allowAiBuy: false, allowAiSell: false, allowForced: true,
      reason: `월간 ${(d.monthly*100).toFixed(1)}% 손실 — 시스템 정지 (강제 매매만)`,
      severity: 3,
    };
  }
  if (d.weekly <= KILL_SWITCH_LIMITS.WEEKLY_LOSS_HALT) {
    return {
      level: "WEEKLY_HALT",
      allowAiBuy: false, allowAiSell: false, allowForced: true,
      reason: `주간 ${(d.weekly*100).toFixed(1)}% 손실 — 매매 정지 (강제 매매만)`,
      severity: 2,
    };
  }
  if (d.daily <= KILL_SWITCH_LIMITS.DAILY_LOSS_HALT) {
    return {
      level: "DAILY_HALT",
      allowAiBuy: false, allowAiSell: true, allowForced: true,
      reason: `당일 ${(d.daily*100).toFixed(1)}% 손실 — 신규 매수 정지`,
      severity: 1,
    };
  }
  return {
    level: "NORMAL",
    allowAiBuy: true, allowAiSell: true, allowForced: true,
    reason: null, severity: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 5) 상관관계 그룹 (분리 정의로 양쪽에서 import)
// ─────────────────────────────────────────────────────────────────────
export const CORRELATION_GROUPS = {
  semiconductors: ["NVDA","AMD","TSM","AVGO"],
  megacap_tech:   ["MSFT","GOOGL","META","AMZN","AAPL"],
  ev_battery:     ["TSLA","ALB"],
  oil_majors:     ["XOM","CVX"],
  solar:          ["ENPH","FSLR"],
  autos:          ["TM","GM"],
  speculative:    ["RKLB","IONQ","COIN","PLTR"],
};
