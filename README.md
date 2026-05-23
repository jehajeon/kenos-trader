# ✦ KENOS Trader

> *κένωσις — 자기를 비우고 낮아짐 (빌립보서 2:7)*

AI 앙상블 페이퍼 트레이딩 시스템
- **Gemini 2.5 Pro** (Google Search grounding으로 실시간 가격·뉴스·매크로 수집)
- 기술적 35% + 감성 30% + 거시 35% 앙상블 분석
- Alpaca Paper Trading 계좌 실시간 연동
- 코드 레벨 가드레일: 스탑로스 / 익절 / 12% 캡 / 킬 스위치
- 30분 단위 RSS 속보 폴링 → 심각도 HIGH 감지 시 자동 분석 트리거
- 겸손한 자세로, 데이터가 말하게 한다

---

## 🚀 배포 방법

### 1. GitHub Repository 생성
```
github.com → New Repository
이름: kenos-trader
Public → Create
파일 전체 업로드 → Commit
```

### 2. Vercel 연결
```
vercel.com → New Project
GitHub에서 kenos-trader 선택 → Import
```

### 3. 환경변수 설정
```
Vercel → Settings → Environment Variables

ALPACA_KEY      = your_alpaca_paper_key
ALPACA_SECRET   = your_alpaca_paper_secret
GEMINI_API_KEY  = your_gemini_api_key      # https://aistudio.google.com 에서 발급
CRON_SECRET     = $(openssl rand -hex 32)   # GitHub과 동일 값
KENOS_PROFILE   = BALANCED                  # CONSERVATIVE | BALANCED | AGGRESSIVE
```

### 4. GitHub Secrets (자동 cron 활성화)
```
GitHub → Settings → Secrets and variables → Actions

VERCEL_URL      = https://kenos-trader.vercel.app
CRON_SECRET     = (위 Vercel과 동일한 값)
```

### 5. Deploy → 완성!
```
kenos-trader.vercel.app 접속
```

---

## 자동 스케줄 (보스턴 시간 / ET)

| 시간 | 동작 |
|---|---|
| 평일 09:00 AM | 정기 분석 + 주문 (프리마켓 정리) |
| 평일 10:00 AM | 정기 분석 + 주문 (개장 후 안정화) |
| 평일 03:30 PM | 정기 분석 + 주문 (마감 전) |
| 일요일 08:00 PM | 주간 리뷰 (분석만, 주문 없음) |
| 평일 09:00 ~ 17:30 | **30분마다 RSS 속보 폴링** — HIGH 발견 시 즉시 분석·주문 |

---

## 비용

| 항목 | 비용 |
|---|---|
| Vercel 호스팅 | 무료 |
| GitHub Actions | 무료 (public repo 무제한) |
| Alpaca 페이퍼 | 무료 |
| **Gemini 2.5 Pro API** | **무료** (1,000+ req/일 무료 한도, 사용량 5~10 req/일) |
| **합계** | **$0/월** |

---

## 투자 강도 프로파일

| 프로파일 | BUY conf | 스탑로스 | 익절 | 종목 캡 | 현금 플로어 |
|---|---|---|---|---|---|
| 🛡 CONSERVATIVE | ≥ 0.70 | -5% | +15% | 8% | 25% |
| ⚖ BALANCED | ≥ 0.60 | -8% | +25% | 12% | 15% |
| 🔥 AGGRESSIVE | ≥ 0.55 | -12% | +40% | 20% | 10% |

자금 규모 티어(마이크로/스몰/미디엄/라지)에 따라 자동 미세조정.

---

## 킬 스위치

| 조건 | 동작 |
|---|---|
| 일일 ≤ -3% | 신규 AI 매수 정지 (강제 매매는 작동) |
| 주간 ≤ -7% | 모든 AI 매매 정지 |
| 월간 ≤ -15% | 시스템 정지 (스탑로스 보호만 유지) |

---

*KENOS — 자기를 비울 때 비로소 채워진다*
