import { useState } from "react";

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Fraunces:wght@600;700&display=swap";
document.head.appendChild(fontLink);

export const T = {
  bg:       "#F7F5F0",
  sidebar:  "#182F24",
  sidebarA: "#224036",
  accent:   "#D4724A",
  accentL:  "#F0E8E0",
  card:     "#FFFFFF",
  border:   "#E8E3DB",
  text:     "#1A1A1A",
  muted:    "#7A7265",
  green:    "#2E7D52",
  greenBg:  "#E8F5EE",
  amber:    "#B45309",
  amberBg:  "#FEF3C7",
  red:      "#C0392B",
  redBg:    "#FDECEA",
  blue:     "#1D4ED8",
  blueBg:   "#EFF6FF",
};

export const S = {
  app:     { display:"flex", height:"100vh", fontFamily:"'DM Sans', sans-serif", background:T.bg, color:T.text, overflow:"hidden" },
  sidebar: { width:220, background:T.sidebar, display:"flex", flexDirection:"column", flexShrink:0 },
  logo:    { padding:"28px 20px 20px", borderBottom:`1px solid ${T.sidebarA}` },
  logoT:   { fontFamily:"'Fraunces', serif", fontSize:20, fontWeight:700, color:"#FFFFFF", letterSpacing:"-0.3px" },
  logoSub: { fontSize:11, color:"#8FAB96", marginTop:2, letterSpacing:"0.5px" },
  nav:     { flex:1, padding:"16px 0", overflowY:"auto" },
  navSec:  { padding:"8px 20px 4px", fontSize:10, color:"#5A7A64", letterSpacing:"1px", textTransform:"uppercase", fontWeight:600 },
  navItem: (active) => ({
    display:"flex", alignItems:"center", gap:10, padding:"9px 20px", fontSize:13.5,
    color: active ? "#FFFFFF" : "#8FAB96", background: active ? T.sidebarA : "transparent",
    borderRight: active ? `3px solid ${T.accent}` : "3px solid transparent",
    cursor:"pointer", transition:"all 0.15s", fontWeight: active ? 600 : 400,
  }),
  main:    { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar:  { height:60, background:T.card, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px", flexShrink:0 },
  topL:    { display:"flex", alignItems:"center", gap:12 },
  pageTitle: { fontFamily:"'Fraunces', serif", fontSize:20, fontWeight:700, color:T.text },
  content: { flex:1, overflowY:"auto", padding:28 },
  card:    { background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:24 },
  cardSm:  { background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:16 },
  label:   { fontSize:11, fontWeight:600, color:T.muted, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:6 },
  h2:      { fontFamily:"'Fraunces', serif", fontSize:16, fontWeight:700, marginBottom:16, color:T.text },
  badge:   (color) => ({ display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, background: color+"20", color }),
  btn:     (variant="primary") => ({
    display:"inline-flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:8,
    fontSize:13.5, fontWeight:600, cursor:"pointer", transition:"all 0.15s",
    background: variant==="primary" ? T.accent : variant==="ghost" ? "transparent" : T.card,
    color: variant==="primary" ? "#fff" : variant==="ghost" ? T.muted : T.text,
    border: variant==="outline" ? `1px solid ${T.border}` : "none",
  }),
  input:   { width:"100%", padding:"10px 14px", borderRadius:8, border:`1px solid ${T.border}`, fontSize:13.5, background:T.card, color:T.text, outline:"none", fontFamily:"'DM Sans', sans-serif", boxSizing:"border-box" },
  select:  { width:"100%", padding:"10px 14px", borderRadius:8, border:`1px solid ${T.border}`, fontSize:13.5, background:T.card, color:T.text, outline:"none", fontFamily:"'DM Sans', sans-serif", boxSizing:"border-box" },
  grid2:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 },
  grid3:   { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 },
  grid4:   { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:16 },
  row:     { display:"flex", alignItems:"center", gap:12 },
  divider: { height:1, background:T.border, margin:"20px 0" },
  tag:     (bg, color) => ({ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600, background:bg, color }),
};

export const Icon = ({ d, size=16, color="currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
);

export const icons = {
  dash:    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  stock:   "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  sales:   "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  invoice: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  waste:   "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  costs:   "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  cat:     "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  alg:     "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  forecast:"M13 10V3L4 14h7v7l9-11h-7z",
  upload:  "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  plus:    "M12 4v16m8-8H4",
  check:   "M5 13l4 4L19 7",
  warn:    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  star:    "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  qr:      "M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z",
};

export const KpiCard = ({ label, value, target, amount, status }) => {
  const colors = { green: T.green, amber: T.amber, red: T.red };
  const bgs    = { green: T.greenBg, amber: T.amberBg, red: T.redBg };
  const col = colors[status]; const bg = bgs[status];
  const pct = Math.min((value / target) * 100, 100);
  return (
    <div style={{ ...S.card, padding:20 }}>
      <div style={{ ...S.label }}>{label}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:4 }}>
        <span style={{ fontFamily:"'Fraunces', serif", fontSize:32, fontWeight:700, color:col }}>{value}%</span>
        <span style={{ fontSize:13, color:T.muted }}>/ {target}% target</span>
      </div>
      <div style={{ fontSize:13, color:T.muted, marginBottom:12 }}>€{amount} this week</div>
      <div style={{ height:6, background:T.border, borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:col, borderRadius:3, transition:"width 1s" }}/>
      </div>
      <div style={{ marginTop:8 }}>
        <span style={{ ...S.tag(bg, col) }}>
          {status === "green" ? "✓ On track" : status === "amber" ? "⚠ Near limit" : "✗ Over target"}
        </span>
      </div>
    </div>
  );
};

export const DashboardScreen = () => (
  <div style={S.content}>
    <div style={{ ...S.row, marginBottom:24, justifyContent:"space-between" }}>
      <div>
        <div style={{ fontFamily:"'Fraunces', serif", fontSize:13, color:T.muted, marginBottom:2 }}>Week 20 — 11 to 17 May 2026</div>
        <div style={{ fontSize:13, color:T.muted }}>Net sales so far: <strong style={{ color:T.text }}>€9,842.60</strong> · Projected: €13,200</div>
      </div>
      <div style={S.row}>
        <button style={S.btn("outline")}>◀ Week 19</button>
        <button style={{ ...S.btn("outline"), background:T.accentL, color:T.accent, border:`1px solid ${T.accent}` }}>This week</button>
        <button style={S.btn("outline")}>Week 21 ▶</button>
      </div>
    </div>
    <div style={{ ...S.grid4, marginBottom:24 }}>
      <KpiCard label="Food Cost"     value={29.8} target={30} amount="2,934" status="green"/>
      <KpiCard label="Labour Cost"   value={26.1} target={25} amount="2,569" status="amber"/>
      <KpiCard label="Packaging"     value={2.3}  target={2.5} amount="226" status="green"/>
      <KpiCard label="Waste Cost"    value={1.8}  target={5}   amount="177" status="green"/>
    </div>
    <div style={S.grid2}>
      <div style={S.card}>
        <div style={S.h2}>Weekly Gross Profit</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            { label:"Net Sales",           value:"€9,842.60", color:T.text },
            { label:"Food Purchases",      value:"- €2,934.12", color:T.red },
            { label:"Packaging",           value:"- €226.38", color:T.red },
            { label:"Labour",              value:"- €2,569.00", color:T.red },
            { label:"Waste",               value:"- €177.20", color:T.red },
          ].map(r => (
            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", fontSize:13.5, padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
              <span style={{ color:T.muted }}>{r.label}</span>
              <span style={{ fontWeight:600, color:r.color }}>{r.value}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:15, padding:"10px 0", fontWeight:700 }}>
            <span>Gross Profit</span>
            <span style={{ color:T.green }}>€3,936.10 (40%)</span>
          </div>
        </div>
      </div>
      <div style={S.card}>
        <div style={S.h2}>Daily Sales — This Week</div>
        {[
          { day:"Sun 11", net:553,  gross:630  },
          { day:"Mon 12", net:1765, gross:2007 },
          { day:"Tue 13", net:2150, gross:2443 },
          { day:"Wed 14", net:2573, gross:2936 },
          { day:"Thu 15", net:2273, gross:2590 },
          { day:"Fri 16 (est.)", net:null, gross:null },
          { day:"Sat 17 (est.)", net:null, gross:null },
        ].map(r => (
          <div key={r.day} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${T.border}`, fontSize:13 }}>
            <span style={{ color:T.muted, width:120 }}>{r.day}</span>
            {r.net ? (
              <>
                <span style={{ color:T.text, fontWeight:500 }}>€{r.net.toLocaleString()}</span>
                <span style={{ color:T.muted, fontSize:12 }}>gross €{r.gross.toLocaleString()}</span>
              </>
            ) : (
              <span style={{ color:T.border, fontStyle:"italic", fontSize:12 }}>no data yet</span>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const StockTakeScreen = () => {
  const [section, setSection] = useState("Freezer");
  const sections = ["Freezer","Cold Room","Dry","Packaging","Cleaning"];
  const products = {
    Freezer: [
      { name:"Chicken Breast (raw)", unit:"KG", qty:"" },
      { name:"Pulled Pork", unit:"KG", qty:"3.2" },
      { name:"Beef Brisket", unit:"KG", qty:"" },
      { name:"Frozen Shrimp", unit:"KG", qty:"1.5" },
      { name:"Nachos Tortilla Chips", unit:"KG", qty:"8.0" },
      { name:"Ben & Jerry's (tubs)", unit:"Each", qty:"12" },
      { name:"Frozen Fries", unit:"KG", qty:"" },
    ],
    "Cold Room": [
      { name:"Salsa Verde MIX", unit:"KG", qty:"2.1" },
      { name:"Chipotle MIX", unit:"KG", qty:"1.8" },
      { name:"Lime Crema MIX", unit:"KG", qty:"1.2" },
      { name:"Cheddar Cheese", unit:"KG", qty:"4.5" },
      { name:"Sour Cream", unit:"KG", qty:"3.0" },
    ],
    Dry: [
      { name:"Long Grain Rice", unit:"KG", qty:"22" },
      { name:"Cumin (ground)", unit:"KG", qty:"0.8" },
      { name:"Chipotle Powder", unit:"KG", qty:"0.4" },
      { name:"Sunflower Oil (5L)", unit:"Each", qty:"3" },
    ],
    Packaging: [
      { name:"Kraft Bowl (32oz)", unit:"Each", qty:"180" },
      { name:"Kraft Bowl Lid", unit:"Each", qty:"160" },
      { name:"Paper Bags (medium)", unit:"Each", qty:"240" },
      { name:"Recyclable Cutlery", unit:"Each", qty:"300" },
    ],
    Cleaning: [
      { name:"Floor Cleaner (5L)", unit:"Each", qty:"2" },
      { name:"Degreaser Spray", unit:"Each", qty:"3" },
    ],
  };
  return (
    <div style={S.content}>
      <div style={{ ...S.row, justifyContent:"space-between", marginBottom:20 }}>
        <div style={{ ...S.card, padding:"12px 20px", flex:1, marginRight:16 }}>
          <div style={{ fontSize:12, color:T.muted }}>Session started</div>
          <div style={{ fontWeight:600, color:T.text }}>Today, 08:30 by Leandro</div>
        </div>
        <div style={{ ...S.card, padding:"12px 20px", flex:1, marginRight:16 }}>
          <div style={{ fontSize:12, color:T.muted }}>Total value so far</div>
          <div style={{ fontFamily:"'Fraunces', serif", fontSize:20, fontWeight:700, color:T.green }}>€ 4,218.40</div>
        </div>
        <div style={{ ...S.card, padding:"12px 20px", flex:1, marginRight:16 }}>
          <div style={{ fontSize:12, color:T.muted }}>Products counted</div>
          <div style={{ fontFamily:"'Fraunces', serif", fontSize:20, fontWeight:700, color:T.text }}>23 / 64</div>
        </div>
        <button style={{ ...S.btn("primary"), padding:"12px 20px" }}>
          ✓ Complete session
        </button>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {sections.map(s => (
          <button key={s} onClick={() => setSection(s)}
            style={{ padding:"8px 16px", borderRadius:20, border:`1px solid ${section===s ? T.accent : T.border}`, background:section===s ? T.accentL : T.card, color:section===s ? T.accent : T.muted, fontSize:13, fontWeight:section===s ? 600 : 400, cursor:"pointer" }}>
            {s}
          </button>
        ))}
      </div>
      <div style={S.card}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13.5 }}>
          <thead>
            <tr style={{ borderBottom:`2px solid ${T.border}` }}>
              <th style={{ textAlign:"left", padding:"10px 12px", color:T.muted, fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px" }}>Product</th>
              <th style={{ textAlign:"center", padding:"10px 12px", color:T.muted, fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px" }}>Unit</th>
              <th style={{ textAlign:"center", padding:"10px 12px", color:T.muted, fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px" }}>Quantity</th>
              <th style={{ textAlign:"right", padding:"10px 12px", color:T.muted, fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px" }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {(products[section]||[]).map((p, i) => (
              <tr key={p.name} style={{ borderBottom:`1px solid ${T.border}`, background: i%2===0 ? "#FAFAF8" : T.card }}>
                <td style={{ padding:"10px 12px", fontWeight:500 }}>{p.name}</td>
                <td style={{ padding:"10px 12px", textAlign:"center", color:T.muted }}>{p.unit}</td>
                <td style={{ padding:"10px 12px", textAlign:"center" }}>
                  <input defaultValue={p.qty} placeholder="0"
                    style={{ width:80, textAlign:"center", padding:"6px 10px", border:`1px solid ${p.qty ? T.green : T.border}`, borderRadius:6, fontSize:13.5, fontFamily:"'DM Sans', sans-serif", background:p.qty ? T.greenBg : T.card, color:T.text, outline:"none" }}/>
                </td>
                <td style={{ padding:"10px 12px", textAlign:"right", color:p.qty ? T.text : T.border }}>
                  {p.qty ? `€${(parseFloat(p.qty||0) * 8.5).toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const SalesScreen = () => (
  <div style={S.content}>
    <div style={{ ...S.row, marginBottom:24, gap:16 }}>
      <button style={{ ...S.btn("primary"), gap:8 }}>
        <Icon d={icons.upload} size={15}/> Upload PixelPoint Excel
      </button>
      <button style={S.btn("outline")}>+ Manual entry</button>
      <div style={{ flex:1 }}/>
      <div style={{ ...S.card, padding:"8px 16px", display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:12, color:T.muted }}>Week</span>
        <span style={{ fontWeight:600 }}>03 – 09 May 2026</span>
        <span style={{ color:T.muted }}>▼</span>
      </div>
    </div>
    <div style={S.card}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ borderBottom:`2px solid ${T.border}` }}>
            {["Day","Gross","Net","Cash","Card","Kiosk","Online","Catering","Method"].map(h => (
              <th key={h} style={{ textAlign:h==="Day"?"left":"right", padding:"10px 12px", color:T.muted, fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { day:"Sun 3 May",  gross:"630.96",  net:"553.51",  cash:"129.85", card:"398.41", kiosk:"102.70", online:"0.00",    cater:"0.00",   method:"Excel" },
            { day:"Mon 4 May",  gross:"2,007.23",net:"1,765.22",cash:"44.20",  card:"597.21", kiosk:"738.40", online:"627.42", cater:"0.00",   method:"Excel" },
            { day:"Tue 5 May",  gross:"2,443.63",net:"2,150.14",cash:"140.14", card:"382.22", kiosk:"1,676.00",online:"232.42",cater:"12.85", method:"Excel" },
            { day:"Wed 6 May",  gross:"2,936.79",net:"2,573.82",cash:"114.40", card:"857.16", kiosk:"1,750.05",online:"116.03",cater:"99.15", method:"Excel" },
            { day:"Thu 7 May",  gross:"2,590.76",net:"2,273.77",cash:"165.15", card:"1,639.33",kiosk:"334.15",online:"211.83", cater:"240.30", method:"Excel" },
            { day:"Fri 8 May",  gross:"2,869.21",net:"2,525.68",cash:"72.00",  card:"792.56", kiosk:"1,693.80",online:"310.85",cater:"0.00",  method:"Excel" },
            { day:"Sat 9 May",  gross:"2,055.08",net:"1,804.80",cash:"139.75", card:"1,005.15",kiosk:"589.05",online:"321.13", cater:"0.00",  method:"Excel" },
          ].map((r, i) => (
            <tr key={r.day} style={{ borderBottom:`1px solid ${T.border}`, background:i%2===0?"#FAFAF8":T.card }}>
              <td style={{ padding:"9px 12px", fontWeight:500 }}>{r.day}</td>
              {[r.gross,r.net,r.cash,r.card,r.kiosk,r.online,r.cater].map((v,j) => (
                <td key={j} style={{ padding:"9px 12px", textAlign:"right", color:j===1?T.green:T.text }}>€{v}</td>
              ))}
              <td style={{ padding:"9px 12px", textAlign:"right" }}>
                <span style={S.tag(T.blueBg, T.blue)}>{r.method}</span>
              </td>
            </tr>
          ))}
          <tr style={{ borderTop:`2px solid ${T.border}`, fontWeight:700, background:T.accentL }}>
            <td style={{ padding:"10px 12px" }}>TOTAL</td>
            <td style={{ padding:"10px 12px", textAlign:"right" }}>€15,533.66</td>
            <td style={{ padding:"10px 12px", textAlign:"right", color:T.green }}>€13,646.94</td>
            <td colSpan={5} style={{ padding:"10px 12px", textAlign:"right", color:T.muted, fontSize:12 }}>Week 19</td>
            <td/>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

export const InvoiceScreen = () => (
  <div style={S.content}>
    <div style={S.grid2}>
      <div style={S.card}>
        <div style={S.h2}>New Invoice</div>
        <div style={{ ...S.card, background:T.accentL, border:`1px dashed ${T.accent}`, padding:20, marginBottom:20, textAlign:"center", cursor:"pointer" }}>
          <div style={{ fontSize:28, marginBottom:8 }}>📷</div>
          <div style={{ fontWeight:600, color:T.accent, marginBottom:4 }}>Upload invoice photo or PDF</div>
          <div style={{ fontSize:12, color:T.muted }}>AI will extract the details automatically</div>
          <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>JPG, PNG, PDF supported</div>
        </div>
        <div style={{ textAlign:"center", color:T.muted, fontSize:12, marginBottom:20 }}>or enter manually</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <div style={S.label}>Supplier</div>
            <select style={S.select}>
              <option>Sysco Ireland</option>
              <option>Henderson Foodservice</option>
              <option>Deli Meats Ireland</option>
              <option>Sherpack</option>
              <option>BWG Foodservice</option>
            </select>
          </div>
          <div style={S.grid2}>
            <div>
              <div style={S.label}>Invoice Date</div>
              <input style={S.input} type="date" defaultValue="2026-05-14"/>
            </div>
            <div>
              <div style={S.label}>Category</div>
              <select style={S.select}>
                <option>Food</option>
                <option>Packaging</option>
                <option>Cleaning</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div>
            <div style={S.label}>Total Amount (€)</div>
            <input style={S.input} type="number" defaultValue="284.47"/>
          </div>
          <div>
            <div style={S.label}>Notes (optional)</div>
            <input style={S.input} placeholder="e.g. includes credit note for last week"/>
          </div>
          <button style={{ ...S.btn("primary"), justifyContent:"center", padding:"11px" }}>Save Invoice</button>
        </div>
      </div>
      <div>
        <div style={S.card}>
          <div style={S.h2}>This Week's Invoices — Food</div>
          {[
            { supplier:"Sysco", date:"Mon 11", amount:"284.47", cat:"Food" },
            { supplier:"Deli Meats", date:"Tue 12", amount:"684.00", cat:"Food" },
            { supplier:"Henderson", date:"Wed 13", amount:"152.25", cat:"Food" },
            { supplier:"Sysco", date:"Thu 14", amount:"193.09", cat:"Food" },
          ].map((inv, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${T.border}` }}>
              <div>
                <div style={{ fontWeight:600, fontSize:13.5 }}>{inv.supplier}</div>
                <div style={{ fontSize:12, color:T.muted }}>{inv.date}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontWeight:600, color:T.text }}>€{inv.amount}</div>
                <span style={S.tag(T.greenBg, T.green)}>{inv.cat}</span>
              </div>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 0", fontWeight:700, fontSize:15 }}>
            <span>Food total</span>
            <span style={{ color:T.green }}>€1,313.81</span>
          </div>
        </div>
        <div style={{ ...S.card, marginTop:16 }}>
          <div style={{ ...S.row, justifyContent:"space-between", marginBottom:12 }}>
            <div style={S.h2}>AI Price Change Detected</div>
            <span style={S.tag(T.amberBg, T.amber)}>3 changes</span>
          </div>
          {[
            { product:"Chicken Breast (raw)", old:"€8.40/kg", new:"€9.10/kg", pct:"+8.3%" },
            { product:"Cheddar Cheese", old:"€11.20/kg", new:"€11.80/kg", pct:"+5.4%" },
          ].map((c, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:"#FFFBF0", borderRadius:8, marginBottom:8, border:`1px solid #F3D97A` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>{c.product}</div>
                <div style={{ fontSize:12, color:T.muted }}>{c.old} → <strong style={{ color:T.amber }}>{c.new}</strong> <span style={{ color:T.amber }}>({c.pct})</span></div>
              </div>
              <div style={S.row}>
                <button style={{ ...S.btn("ghost"), padding:"5px 10px", fontSize:12, color:T.red }}>✗</button>
                <button style={{ ...S.btn("ghost"), padding:"5px 10px", fontSize:12, color:T.green }}>✓ Accept</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const WasteScreen = () => (
  <div style={S.content}>
    <div style={S.grid2}>
      <div style={S.card}>
        <div style={S.h2}>Log Waste</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <div style={S.label}>Date</div>
            <input style={S.input} type="date" defaultValue="2026-05-15"/>
          </div>
          <div>
            <div style={S.label}>Product</div>
            <input style={S.input} placeholder="Search product..." defaultValue="Pulled Pork"/>
          </div>
          <div style={S.grid2}>
            <div>
              <div style={S.label}>Quantity (KG)</div>
              <input style={S.input} type="number" defaultValue="0.8" step="0.1"/>
            </div>
            <div>
              <div style={S.label}>Reason</div>
              <select style={S.select}>
                <option>Overproduction</option>
                <option>Spoilage</option>
                <option>Dropped</option>
                <option>Expired</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div style={{ ...S.card, background:T.greenBg, padding:"12px 16px", border:`1px solid #A7D9B5` }}>
            <div style={{ fontSize:12, color:T.muted }}>Calculated waste value</div>
            <div style={{ fontFamily:"'Fraunces', serif", fontSize:22, fontWeight:700, color:T.green }}>€ 6.24</div>
            <div style={{ fontSize:12, color:T.muted }}>0.8 KG × €7.80/KG (Sysco preferred price)</div>
          </div>
          <button style={{ ...S.btn("primary"), justifyContent:"center", padding:11 }}>Log Waste Entry</button>
        </div>
      </div>
      <div style={S.card}>
        <div style={{ ...S.row, justifyContent:"space-between", marginBottom:16 }}>
          <div style={S.h2}>Week 19 Waste Summary</div>
          <span style={{ fontFamily:"'Fraunces', serif", fontSize:18, fontWeight:700, color:T.amber }}>€ 177.20</span>
        </div>
        <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>1.8% of net sales — below 5% target ✓</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:`2px solid ${T.border}` }}>
              {["Product","Qty","Value","Reason"].map(h => (
                <th key={h} style={{ textAlign:"left", padding:"8px 10px", color:T.muted, fontWeight:600, fontSize:11, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { p:"Pulled Pork",      qty:"2.4 KG",  val:"€18.72", r:"Overproduction" },
              { p:"Salsa Verde MIX",  qty:"1.1 KG",  val:"€8.58",  r:"Spoilage" },
              { p:"Nacho Chips",      qty:"3.5 KG",  val:"€10.15", r:"Overproduction" },
              { p:"Chicken Breast",   qty:"4.2 KG",  val:"€38.22", r:"Overproduction" },
              { p:"Guacamole MIX",    qty:"0.9 KG",  val:"€11.43", r:"Spoilage" },
              { p:"Tortilla Wraps",   qty:"18 Each", val:"€6.30",  r:"Expired" },
            ].map((r, i) => (
              <tr key={r.p} style={{ borderBottom:`1px solid ${T.border}`, background:i%2===0?"#FAFAF8":T.card }}>
                <td style={{ padding:"8px 10px", fontWeight:500 }}>{r.p}</td>
                <td style={{ padding:"8px 10px", color:T.muted }}>{r.qty}</td>
                <td style={{ padding:"8px 10px", fontWeight:600, color:T.amber }}>{r.val}</td>
                <td style={{ padding:"8px 10px" }}><span style={S.tag(T.amberBg, T.amber)}>{r.r}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export const ForecastScreen = () => {
  const events = [
    { date:"Sat 16 May",  name:"Coldplay — Music of the Spheres", demand:"HIGH",   pred:"€3,100", conf:87 },
    { date:"Sun 17 May",  name:"Coldplay — Music of the Spheres", demand:"HIGH",   pred:"€2,950", conf:84 },
    { date:"Fri 23 May",  name:"Bruce Springsteen",               demand:"HIGH",   pred:"€3,200", conf:91 },
    { date:"Sat 24 May",  name:"Bruce Springsteen",               demand:"HIGH",   pred:"€3,150", conf:89 },
    { date:"Wed 28 May",  name:"Dua Lipa",                        demand:"MEDIUM", pred:"€2,100", conf:72 },
    { date:"Sat 7 Jun",   name:"Metallica",                       demand:"HIGH",   pred:"€3,400", conf:93 },
    { date:"Tue 10 Jun",  name:"Corporate Event",                 demand:"MEDIUM", pred:"€1,800", conf:65 },
  ];
  const demandColor = { HIGH: T.accent, MEDIUM: T.amber, NORMAL: T.green };
  const demandBg    = { HIGH: T.accentL, MEDIUM: T.amberBg, NORMAL: T.greenBg };
  return (
    <div style={S.content}>
      <div style={{ ...S.card, ...S.row, padding:"14px 20px", marginBottom:24, background:"linear-gradient(135deg, #182F24 0%, #2E5540 100%)", border:"none" }}>
        <Icon d={icons.forecast} size={20} color={T.accent}/>
        <div style={{ flex:1 }}>
          <div style={{ color:"#FFFFFF", fontWeight:600, fontSize:14 }}>Point Campus — 3Arena Forecasting</div>
          <div style={{ color:"#8FAB96", fontSize:12 }}>Model trained on 18 weeks of data · Last updated 15 May 2026</div>
        </div>
        <button style={{ ...S.btn("primary"), fontSize:12 }}>
          <Icon d={icons.refresh} size={13}/> Refresh events
        </button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {events.map((e, i) => (
          <div key={i} style={{ ...S.card, display:"flex", alignItems:"center", gap:16, padding:16 }}>
            <div style={{ width:110, flexShrink:0 }}>
              <div style={{ fontSize:12, color:T.muted }}>DATE</div>
              <div style={{ fontWeight:600, fontSize:13 }}>{e.date}</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14 }}>{e.name}</div>
              <div style={{ fontSize:12, color:T.muted }}>3Arena · Expected capacity ~18,000</div>
            </div>
            <div style={{ textAlign:"right", marginRight:8 }}>
              <div style={{ fontSize:11, color:T.muted }}>Predicted Net Sales</div>
              <div style={{ fontFamily:"'Fraunces', serif", fontSize:20, fontWeight:700, color:T.text }}>{e.pred}</div>
            </div>
            <div style={{ textAlign:"center", minWidth:90 }}>
              <div style={{ ...S.tag(demandBg[e.demand], demandColor[e.demand]), fontSize:12, padding:"5px 14px" }}>{e.demand}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>{e.conf}% confidence</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginTop:24 }}>
        <div style={S.h2}>How predictions are calculated</div>
        <div style={{ fontSize:13, color:T.muted, lineHeight:1.7 }}>
          The model uses Brain.js to analyse 18 weeks of historical sales data from Point Campus,
          correlating daily net sales with 3Arena event data from the Ticketmaster API. Inputs include:
          day of week, whether an event is happening, event category, and expected attendance.
          The model generates a predicted net sales figure and classifies it as HIGH (above €2,500),
          MEDIUM (€1,500–€2,500), or NORMAL (below €1,500). Confidence reflects how consistent
          comparable past events have been with predictions.
        </div>
      </div>
    </div>
  );
};

export const AllergenScreen = () => {
  const allergens = ["Gluten","Crustaceans","Eggs","Fish","Peanuts","Soybeans","Milk","Nuts","Celery","Mustard","Sesame","Sulphites","Lupin","Molluscs"];
  const products  = [
    { name:"Chicken Burrito",     vals:["C","","","","","","M","","","M","","","",""] },
    { name:"Pulled Pork Bowl",    vals:["C","","","","","","M","","","M","","C","",""] },
    { name:"Vegan Bowl",          vals:["C","","","","","C","","","","M","","","",""] },
    { name:"Nachos & Cheese",     vals:["C","","","","","","C","C","","","","","",""] },
    { name:"Guacamole Dip",       vals:["","","","","","","","","","","","","",""] },
    { name:"Chipotle Sauce",      vals:["","","","","","","","","","M","","","",""] },
  ];
  const stateColor = (v) => v==="C" ? T.red : v==="M" ? T.amber : "transparent";
  const stateBg    = (v) => v==="C" ? T.redBg : v==="M" ? T.amberBg : "transparent";
  const stateLabel = (v) => v==="C" ? "●" : v==="M" ? "◐" : "";
  return (
    <div style={S.content}>
      <div style={{ ...S.row, justifyContent:"space-between", marginBottom:20 }}>
        <div style={S.row}>
          <span style={S.tag(T.redBg, T.red)}>● Contains</span>
          <span style={{ ...S.tag(T.amberBg, T.amber), marginLeft:8 }}>◐ May Contain</span>
          <span style={{ ...S.tag("#F3F4F6", T.muted), marginLeft:8 }}>Blank = Not Present</span>
        </div>
        <div style={S.row}>
          <button style={S.btn("outline")}><Icon d={icons.qr} size={14}/> View QR Code</button>
          <button style={{ ...S.btn("primary"), marginLeft:8 }}>+ Add Product</button>
        </div>
      </div>
      <div style={{ ...S.card, overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:`2px solid ${T.border}` }}>
              <th style={{ textAlign:"left", padding:"10px 14px", fontWeight:600, color:T.muted, fontSize:11, textTransform:"uppercase", minWidth:160 }}>Product</th>
              {allergens.map(a => (
                <th key={a} style={{ padding:"10px 6px", fontWeight:600, color:T.muted, fontSize:10, textTransform:"uppercase", textAlign:"center", minWidth:52, writingMode:"vertical-rl", transform:"rotate(180deg)", height:80, letterSpacing:"0.3px" }}>{a}</th>
              ))}
              <th style={{ padding:"10px 14px", color:T.muted, fontWeight:600, fontSize:11, textTransform:"uppercase" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.name} style={{ borderBottom:`1px solid ${T.border}`, background:i%2===0?"#FAFAF8":T.card }}>
                <td style={{ padding:"10px 14px", fontWeight:600, fontSize:13.5 }}>{p.name}</td>
                {p.vals.map((v, j) => (
                  <td key={j} style={{ padding:"8px 4px", textAlign:"center" }}>
                    <div style={{ width:36, height:28, margin:"0 auto", borderRadius:4, background:stateBg(v), display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:stateColor(v) }}>
                      {stateLabel(v)}
                    </div>
                  </td>
                ))}
                <td style={{ padding:"10px 14px" }}>
                  <button style={{ ...S.btn("ghost"), fontSize:12, color:T.blue }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const CatalogueScreen = () => (
  <div style={S.content}>
    <div style={{ ...S.row, marginBottom:20 }}>
      <input style={{ ...S.input, maxWidth:280 }} placeholder="Search products..."/>
      <select style={{ ...S.select, maxWidth:160 }}>
        <option>All sections</option>
        <option>Freezer</option>
        <option>Cold Room</option>
        <option>Dry</option>
        <option>Packaging</option>
        <option>Cleaning</option>
      </select>
      <div style={{ flex:1 }}/>
      <button style={{ ...S.btn("primary") }}>+ Add Product</button>
    </div>
    <div style={S.card}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13.5 }}>
        <thead>
          <tr style={{ borderBottom:`2px solid ${T.border}` }}>
            {["Product","Section","Unit","Preferred Supplier","Cost/Unit","Weight Loss","Type","Actions"].map(h => (
              <th key={h} style={{ textAlign:"left", padding:"10px 12px", color:T.muted, fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { name:"Chicken Breast (raw)", sec:"Freezer",   unit:"KG",   sup:"Sysco",     cost:"€9.10",  wl:"25%", type:"Purchased" },
            { name:"Pulled Pork",          sec:"Freezer",   unit:"KG",   sup:"Deli Meats", cost:"€7.80",  wl:"30%", type:"Purchased" },
            { name:"Salsa Verde MIX",      sec:"Cold Room", unit:"KG",   sup:"—",         cost:"€4.20",  wl:"0%",  type:"MIX" },
            { name:"Chipotle MIX",         sec:"Cold Room", unit:"KG",   sup:"—",         cost:"€3.85",  wl:"0%",  type:"MIX" },
            { name:"Long Grain Rice",      sec:"Dry",       unit:"KG",   sup:"Sysco",     cost:"€1.20",  wl:"0%",  type:"Purchased" },
            { name:"Kraft Bowl (32oz)",    sec:"Packaging", unit:"Each", sup:"Sherpack",  cost:"€0.38",  wl:"0%",  type:"Purchased" },
            { name:"Nacho Chips",          sec:"Freezer",   unit:"KG",   sup:"Henderson", cost:"€2.90",  wl:"0%",  type:"Purchased" },
            { name:"Cheddar Cheese",       sec:"Cold Room", unit:"KG",   sup:"Sysco",     cost:"€11.80", wl:"5%",  type:"Purchased" },
          ].map((r, i) => (
            <tr key={r.name} style={{ borderBottom:`1px solid ${T.border}`, background:i%2===0?"#FAFAF8":T.card }}>
              <td style={{ padding:"9px 12px", fontWeight:600 }}>{r.name}</td>
              <td style={{ padding:"9px 12px" }}><span style={S.tag("#EFF6FF","#1D4ED8")}>{r.sec}</span></td>
              <td style={{ padding:"9px 12px", color:T.muted }}>{r.unit}</td>
              <td style={{ padding:"9px 12px" }}>{r.sup}</td>
              <td style={{ padding:"9px 12px", fontWeight:600, color:T.green }}>{r.cost}</td>
              <td style={{ padding:"9px 12px", color:T.muted }}>{r.wl}</td>
              <td style={{ padding:"9px 12px" }}>
                <span style={r.type==="MIX" ? S.tag(T.amberBg, T.amber) : S.tag(T.greenBg, T.green)}>{r.type}</span>
              </td>
              <td style={{ padding:"9px 12px" }}>
                <div style={S.row}>
                  <button style={{ ...S.btn("ghost"), fontSize:12, color:T.blue, padding:"4px 8px" }}>Edit</button>
                  <button style={{ ...S.btn("ghost"), fontSize:12, color:T.muted, padding:"4px 8px" }}>Allergens</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);