import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";

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
const TICKER_SECTOR = {};
Object.entries(SECTORS).forEach(([s,ts]) => ts.forEach(t => TICKER_SECTOR[t]=s));
const SECTOR_COLORS = {
  "🇰🇷 한국":"#4d9fff","🔬 바이오":"#b44dff","⚡ 에너지":"#ffb84d",
  "🔋 배터리":"#00ff88","💾 반도체":"#ff6b6b","🤖 AI/테크":"#4dffd8",
  "🌱 환경":"#7dff4d","🚗 자동차":"#ff8c4d","🚀 미래유망":"#ff4da6",
};

async function alpacaCall(path, method="GET", body=null) {
  const r = await fetch("/api/alpaca", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({path, method, body})
  });
  if (!r.ok) { const e=await r.json(); throw new Error(e.error||`오류 ${r.status}`); }
  return r.json();
}

function Chart({ history, color }) {
  if (!history||history.length<2) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#1e3050",fontSize:11,fontFamily:"monospace"}}>
      분석 실행 후 차트 표시
    </div>
  );
  const vals=history.map(h=>h.v);
  const mn=Math.min(...vals)*0.997, mx=Math.max(...vals)*1.003, rng=mx-mn||1;
  const W=500,H=80, base=H-((history[0].v-mn)/rng)*H;
  const pts=vals.map((v,i)=>`${(i/Math.max(vals.length-1,1))*W},${H-((v-mn)/rng)*H}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:"100%",height:"100%"}}>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill="url(#cg)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round"/>
      <line x1="0" y1={base} x2={W} y2={base} stroke="#1a2e44" strokeWidth="1" strokeDasharray="4,3"/>
    </svg>
  );
}

function Bar({val,label}) {
  const col=val>0.15?"#00ff88":val<-0.15?"#ff4466":"#ffd700";
  return (
    <div style={{marginBottom:4}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#3a5570",marginBottom:2,fontFamily:"monospace"}}>
        <span>{label}</span><span style={{color:col}}>{val>0?"+":""}{(val*100).toFixed(0)}</span>
      </div>
      <div style={{height:3,background:"#0a1520",borderRadius:2,position:"relative"}}>
        <div style={{position:"absolute",top:0,left:`${val<0?50-Math.abs(val)*50:50}%`,width:`${Math.abs(val)*50}%`,height:"100%",background:col,borderRadius:2}}/>
        <div style={{position:"absolute",top:-2,left:"50%",width:1,height:7,background:"#1a2e44"}}/>
      </div>
    </div>
  );
}

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
  const autoRef = useRef(null);

  useEffect(() => {
    loadAccount();
    const saved  = localStorage.getItem("kenos_log");
    const savedH = localStorage.getItem("kenos_hist");
    if (saved)  setLog(JSON.parse(saved));
    if (savedH) setHistory(JSON.parse(savedH));
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (!nextRun) return;
      const diff = nextRun - Date.now();
      if (diff <= 0) { setCountdown("곧 실행..."); return; }
      const h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
      setCountdown(`${h>0?h+"h ":""}${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(t);
  }, [nextRun]);

  const loadAccount = async () => {
    try {
      const acc = await alpacaCall("/v2/account");
      const pos = await alpacaCall("/v2/positions");
      const ord = await alpacaCall("/v2/orders?status=all&limit=20");
      setAccount(acc); setPositions(pos); setOrders(ord);
      return { acc, pos };
    } catch(e) { setErr(e.message); return null; }
  };

  const runAnalysis = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null); setStep("🔍 실시간 주가 & 뉴스 수집 중...");
    const t1=setTimeout(()=>setStep("🧠 앙상블 AI 분석 중..."),5000);
    const t2=setTimeout(()=>setStep("⚡ Alpaca 주문 실행 중..."),12000);
    try {
      const refreshed = await loadAccount();
      if (!refreshed) throw new Error("계좌 로드 실패");
      const { acc, pos } = refreshed;

      const aiResp = await fetch("/api/analyze", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ account:acc, positions:pos }),
      });
      if (!aiResp.ok) { const e=await aiResp.json(); throw new Error(e.error); }
      const ai = await aiResp.json();

      const executed = [];
      for (const d of (ai.decisions||[])) {
        if ((d.conf||0)<0.55) continue;
        const price = ai.prices?.[d.ticker]||0;
        if (!price) continue;
        try {
          if (d.action==="BUY"&&d.qty>0) {
            const cashAvail=Number(acc.cash)-Number(acc.portfolio_value)*0.15;
            if (cashAvail<price*d.qty) continue;
            const order=await alpacaCall("/v2/orders","POST",{symbol:d.ticker,qty:String(d.qty),side:"buy",type:"market",time_in_force:"day"});
            executed.push({action:"BUY",ticker:d.ticker,qty:d.qty,price,orderId:order.id});
          } else if (d.action==="SELL") {
            const holding=pos.find(p=>p.symbol===d.ticker);
            if (!holding) continue;
            const order=await alpacaCall("/v2/orders","POST",{symbol:d.ticker,qty:String(holding.qty),side:"sell",type:"market",time_in_force:"day"});
            executed.push({action:"SELL",ticker:d.ticker,qty:Number(holding.qty),price,orderId:order.id,pnl:(price-Number(holding.avg_entry_price))*Number(holding.qty)});
          }
        } catch(oe) { console.warn(`주문 실패 ${d.ticker}:`,oe.message); }
      }

      await new Promise(r=>setTimeout(r,1000));
      const final=await loadAccount();
      const finalAcc=final?.acc||acc;

      const entry={id:Date.now(),ts:new Date().toISOString(),decisions:ai.decisions||[],market:ai.market,news:ai.news||[],risk:ai.risk||"MEDIUM",top_sector:ai.top_sector,outlook:ai.outlook,executed,value:Number(finalAcc.portfolio_value),cash:Number(finalAcc.cash),prices:ai.prices||{}};
      const newLog=[entry,...log].slice(0,50);
      setLog(newLog); setExpanded(entry.id);
      localStorage.setItem("kenos_log",JSON.stringify(newLog));
      const newHist=[...history,{ts:new Date().toISOString(),v:Number(finalAcc.portfolio_value)}].slice(-200);
      setHistory(newHist);
      localStorage.setItem("kenos_hist",JSON.stringify(newHist));
    } catch(e) { setErr(e.message); }
    finally { clearTimeout(t1); clearTimeout(t2); setLoading(false); setStep(""); }
  }, [loading, log, history]);

  useEffect(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    if (!autoHours) { setNextRun(null); return; }
    const ms=autoHours*3600000;
    setNextRun(new Date(Date.now()+ms));
    autoRef.current=setInterval(()=>{ setNextRun(new Date(Date.now()+ms)); runAnalysis(); },ms);
    return ()=>clearInterval(autoRef.current);
  }, [autoHours]);

  const pv=account?Number(account.portfolio_value):0;
  const ini=history.length?history[0].v:pv;
  const pnlD=pv-ini, pnlP=ini?(pnlD/ini)*100:0, up=pnlD>=0, aCol=up?"#00ff88":"#ff4466";
  const days=history.length?Math.floor((Date.now()-new Date(history[0].ts))/86400000):0;
  const riskCol={LOW:"#00ff88",MEDIUM:"#ffd700",HIGH:"#ff4466"};
  const lastRisk=log[0]?.risk||"—";
  const sells=log.flatMap(e=>e.executed||[]).filter(e=>e.action==="SELL");
  const wr=sells.length?((sells.filter(e=>(e.pnl||0)>0).length/sells.length)*100).toFixed(0):null;

  const mono={fontFamily:"'Courier New',monospace"};
  const card=(x={})=>({background:"#0b1726",border:"1px solid #152236",borderRadius:10,padding:"14px 16px",...x});
  const lbl={fontSize:10,color:"#304560",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:5};
  const bdg=c=>({display:"inline-block",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,background:c+"22",color:c});

  return (
    <>
      <Head>
        <title>KENOS Trader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="description" content="κένωσις — 자기를 비우고 낮아짐. AI 앙상블 페이퍼 트레이딩"/>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>"/>
      </Head>

      <div style={{background:"#04080f",minHeight:"100vh",fontFamily:"'DM Sans',system-ui,sans-serif",color:"#d8eaff",padding:"16px",boxSizing:"border-box"}}>
        <style>{`
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.2}}
          @keyframes scan{0%{transform:translateX(-200%)}100%{transform:translateX(500%)}}
          *{box-sizing:border-box}
          ::-webkit-scrollbar{width:4px}
          ::-webkit-scrollbar-track{background:#0b1726}
          ::-webkit-scrollbar-thumb{background:#1e3555;border-radius:2px}
          input,button{font-family:inherit}
        `}</style>

        {/* 헤더 */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,paddingBottom:12,borderBottom:"1px solid #152236",position:"relative",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{...mono,fontSize:22,fontWeight:900,color:"#00ff88",letterSpacing:"0.25em"}}>✦ KENOS</div>
              <div style={{...bdg("#00ff88"),fontSize:10}}>× ALPACA</div>
              <div style={{...bdg("#4d9fff"),fontSize:10}}>PAPER</div>
            </div>
            <div style={{fontSize:11,color:"#304560",marginTop:2,fontStyle:"italic"}}>κένωσις — 자기를 비우고 낮아짐 · AI 앙상블 트레이딩</div>
            <div style={{marginTop:5,display:"flex",gap:12,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#304560"}}>📅 Day {days+1}</span>
              {wr&&<span style={{fontSize:11,color:Number(wr)>50?"#00ff88":"#ff4466"}}>🏆 승률 {wr}%</span>}
              {nextRun&&<span style={{fontSize:11,color:"#ffd700"}}>⏱ {countdown}</span>}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end"}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:10,color:"#304560"}}>자동실행:</span>
              {[null,4,8,24].map(h=>(
                <button key={h} onClick={()=>setAutoHours(h===autoHours?null:h)} style={{...mono,padding:"4px 8px",borderRadius:5,fontSize:10,cursor:"pointer",border:"1px solid",borderColor:autoHours===h?"#00ff88":"#1e3555",background:autoHours===h?"#00ff8822":"transparent",color:autoHours===h?"#00ff88":"#304560"}}>
                  {h===null?"OFF":`${h}h`}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {lastRisk!=="—"&&<div style={{...bdg(riskCol[lastRisk]||"#ffd700"),padding:"4px 10px"}}>{lastRisk} RISK</div>}
              <button onClick={loadAccount} style={{background:"transparent",color:"#304560",border:"1px solid #1e3555",padding:"8px 12px",borderRadius:7,fontSize:11,cursor:"pointer"}}>새로고침</button>
              <button onClick={runAnalysis} disabled={loading} style={{...mono,background:loading?"#0a1a2a":"linear-gradient(135deg,#00ff88,#00cc6a)",color:loading?"#304560":"#03070d",border:"none",padding:"10px 20px",borderRadius:7,fontSize:13,fontWeight:800,cursor:loading?"wait":"pointer",letterSpacing:"0.05em",boxShadow:loading?"none":"0 0 22px #00ff8844",opacity:loading?0.6:1}}>
                {loading?"분석 중...":"▶ AI 분석 실행"}
              </button>
            </div>
          </div>
          {loading&&<div style={{position:"absolute",bottom:-1,left:0,right:0,height:2,background:"#0b1726",overflow:"hidden"}}><div style={{height:"100%",width:"35%",background:"#00ff88",animation:"scan 1.8s linear infinite",boxShadow:"0 0 10px #00ff88"}}/></div>}
        </div>

        {loading&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:"#00ff8808",border:"1px solid #00ff8820",borderRadius:6,marginBottom:12}}><div style={{width:7,height:7,borderRadius:"50%",background:"#00ff88",animation:"pulse 1s infinite"}}/><span style={{fontSize:12,color:"#00cc6a",...mono}}>{step}</span></div>}
        {err&&<div style={{background:"#ff446610",border:"1px solid #ff446630",borderRadius:6,padding:"8px 14px",marginBottom:12,fontSize:12,color:"#ff7799",...mono}}>⚠ {err}</div>}

        {/* 통계 */}
        {account&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:14}}>
            {[
              {label:"총 자산",val:`$${Number(account.portfolio_value).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`,sub:null,col:"#d8eaff"},
              {label:"총 손익",val:`${up?"+":""}$${Math.abs(pnlD).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`,sub:`${up?"▲":"▼"} ${Math.abs(pnlP).toFixed(2)}%`,col:aCol},
              {label:"현금",val:`$${Number(account.cash).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`,sub:`${((Number(account.cash)/Number(account.portfolio_value))*100).toFixed(1)}%`,col:"#4d9fff"},
              {label:"포지션",val:`${positions.length}개`,sub:`${orders.filter(o=>o.status==="filled").length}건 체결`,col:"#ffd700"},
              {label:"매수력",val:`$${Number(account.buying_power).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`,sub:"Buying Power",col:"#b44dff"},
            ].map((c,i)=>(
              <div key={i} style={card()}>
                <div style={lbl}>{c.label}</div>
                <div style={{...mono,fontSize:17,fontWeight:700,color:c.col,lineHeight:1.2}}>{c.val}</div>
                {c.sub&&<div style={{fontSize:11,color:c.col,marginTop:2,opacity:0.8}}>{c.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* 차트 + 분석 */}
        <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:10,marginBottom:14}}>
          <div style={{...card(),height:145}}>
            <div style={lbl}>수익률 추이</div>
            <div style={{height:105}}><Chart history={history} color={aCol}/></div>
          </div>
          <div style={card()}>
            <div style={lbl}>🌐 AI 시장 분석</div>
            <div style={{fontSize:12.5,color:"#8090a8",lineHeight:1.55,marginBottom:6}}>{log[0]?.market||"▶ AI 분석 실행 시 업데이트"}</div>
            {log[0]?.outlook&&<div style={{fontSize:11,color:"#4d9fff",background:"#4d9fff11",borderRadius:5,padding:"5px 8px"}}>📊 {log[0].outlook}</div>}
          </div>
        </div>

        {/* 포지션 */}
        <div style={{...card(),marginBottom:14}}>
          <div style={{...lbl,marginBottom:10}}>📊 Alpaca 실제 포지션</div>
          {positions.length===0
            ? <div style={{color:"#1e3555",fontSize:13,textAlign:"center",padding:"18px 0"}}>포지션 없음 — KENOS가 기회를 탐색 중</div>
            : positions.map(pos=>{
                const cost=Number(pos.avg_entry_price),cur=Number(pos.current_price),qty=Number(pos.qty);
                const pd=(cur-cost)*qty,pp=((cur-cost)/cost)*100,pu=pd>=0;
                return (
                  <div key={pos.symbol} style={{display:"grid",gridTemplateColumns:"80px 60px 90px 90px 110px 1fr",gap:8,padding:"7px 0",borderBottom:"1px solid #0d1a2e",alignItems:"center",fontSize:13}}>
                    <div style={{...mono,fontWeight:700,color:"#4d9fff"}}>{pos.symbol}</div>
                    <div style={mono}>{qty}</div>
                    <div style={{...mono,color:"#8090a8"}}>${cost.toFixed(2)}</div>
                    <div style={mono}>${cur.toFixed(2)}</div>
                    <div style={{...mono,color:pu?"#00ff88":"#ff4466",fontSize:12}}>{pu?"+":""}{pd.toFixed(2)}<br/><span style={{fontSize:10,opacity:0.8}}>({pu?"+":""}{pp.toFixed(1)}%)</span></div>
                    <div style={{fontSize:11,color:SECTOR_COLORS[TICKER_SECTOR[pos.symbol]]||"#8090a8"}}>{TICKER_SECTOR[pos.symbol]||"기타"}</div>
                  </div>
                );
              })
          }
        </div>

        {/* AI 로그 */}
        <div style={{...card(),marginBottom:14}}>
          <div style={{...lbl,marginBottom:10}}>🤖 AI 분석 로그</div>
          {log.length===0
            ? <div style={{color:"#1e3555",fontSize:13,textAlign:"center",padding:"16px 0"}}>아직 분석 없음</div>
            : <div style={{maxHeight:380,overflowY:"auto"}}>
                {log.map(entry=>(
                  <div key={entry.id} style={{borderBottom:"1px solid #0d1a2e",padding:"10px 0"}}>
                    <div onClick={()=>setExpanded(expanded===entry.id?null:entry.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",marginBottom:5}}>
                      <div style={{fontSize:11,color:"#304560",...mono}}>{new Date(entry.ts).toLocaleString("ko-KR")}</div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{...mono,fontSize:12,color:"#ffd700"}}>${entry.value?.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                        <span style={bdg(riskCol[entry.risk]||"#ffd700")}>{entry.risk}</span>
                        {entry.executed?.length>0&&<span style={bdg("#4d9fff")}>{entry.executed.length}건</span>}
                        <span style={{color:"#304560"}}>{expanded===entry.id?"▲":"▼"}</span>
                      </div>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {(entry.decisions||[]).filter(d=>d.action!=="HOLD").map((d,i)=>(
                        <div key={i} style={{display:"flex",gap:4,alignItems:"center",background:"#0a1520",borderRadius:5,padding:"3px 8px",fontSize:11}}>
                          <span style={bdg(d.action==="BUY"?"#00ff88":"#ff4466")}>{d.action}</span>
                          <span style={{...mono,color:"#4d9fff"}}>{d.ticker}</span>
                          <span style={{color:"#8090a8"}}>{d.reasoning?.slice(0,50)}</span>
                          <span style={{...mono,color:"#ffd700",fontSize:10}}>{(d.conf*100).toFixed(0)}%</span>
                        </div>
                      ))}
                      {!(entry.decisions||[]).filter(d=>d.action!=="HOLD").length&&<span style={{color:"#1e3555",fontSize:12}}>HOLD — 신뢰도 기준 미달</span>}
                    </div>
                    {expanded===entry.id&&(
                      <div style={{marginTop:8}}>
                        {(entry.decisions||[]).filter(d=>d.action!=="HOLD").slice(0,3).length>0&&(
                          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
                            {(entry.decisions||[]).filter(d=>d.action!=="HOLD").slice(0,3).map((d,i)=>(
                              <div key={i} style={{background:"#07101c",borderRadius:6,padding:"8px 10px",border:"1px solid #152236"}}>
                                <div style={{...mono,fontSize:12,color:"#4d9fff",marginBottom:5,fontWeight:700}}>{d.ticker}</div>
                                <Bar val={d.tech||0} label="기술적 35%"/>
                                <Bar val={d.sent||0} label="감성 30%"/>
                                <Bar val={d.macro||0} label="거시 35%"/>
                                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#304560",marginTop:3}}>
                                  <span>신뢰도</span><span style={{color:"#ffd700",...mono}}>{(d.conf*100).toFixed(0)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(entry.news||[]).map((n,i)=><div key={i} style={{fontSize:11,color:"#304560",padding:"3px 0",borderTop:"1px solid #0d1a2e"}}>📰 {n}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
          }
        </div>

        {/* 주문 내역 */}
        {orders.length>0&&(
          <div style={card()}>
            <div style={{...lbl,marginBottom:8}}>📋 Alpaca 주문 내역</div>
            {orders.slice(0,10).map((o,i)=>{
              const col=o.side==="buy"?"#00ff88":o.status==="canceled"?"#ff8c4d":"#ff4466";
              const sc={filled:"#00ff88",canceled:"#ff8c4d",pending_new:"#ffd700",new:"#ffd700"}[o.status]||"#8090a8";
              return (
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #0d1a2e",fontSize:12}}>
                  <span style={bdg(col)}>{o.side==="buy"?"매수":"매도"}</span>
                  <span style={{...mono,color:"#4d9fff",minWidth:50}}>{o.symbol}</span>
                  <span style={{...mono,color:"#8090a8"}}>{o.qty}주</span>
                  <span style={bdg(sc)}>{o.status}</span>
                  <span style={{fontSize:10,color:"#1e3555",...mono}}>{new Date(o.created_at).toLocaleDateString("ko-KR")}</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:14,fontSize:10,color:"#0d1a2e"}}>
          ✦ KENOS · κένωσις · AI 앙상블 페이퍼 트레이딩 · 실제 금전 거래 아님
        </div>
      </div>
    </>
  );
}
