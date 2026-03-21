import { useState, useEffect } from “react”;

const MAX_PAX = 12;
const WINDOW_MIN = 30;
const TRAVEL_MIN = 13;
const BUFFER_MIN = 20;
const STORAGE_KEY_ARR = “gc_arrivals_v3”;
const STORAGE_KEY_DEP = “gc_departures_v3”;
const API_KEY = import.meta.env.VITE_API_KEY;

// ─── SLSA / Aussies 2026 Brand Palette ───────────────────────────────────────
const BRAND = {
red:        “#D0021B”,   // SLSA red
redDark:    “#A30015”,
redLight:   “#FF1A35”,
yellow:     “#F5A800”,   // SLSA gold/yellow
yellowLight:”#FFD000”,
blue:       “#003087”,   // SLSA deep navy
blueMid:    “#004DB3”,
blueLight:  “#0066CC”,
white:      “#FFFFFF”,
offWhite:   “#FFF8EE”,
sand:       “#F5EDD8”,
darkBg:     “#001A4D”,   // deep ocean navy
cardBg:     “#002266”,
cardBg2:    “#002880”,
border:     “#003DA0”,
textMuted:  “#7A9CC8”,
textDim:    “#4A72A8”,
};

const RUN_COLORS = [
BRAND.red, BRAND.blueMid, BRAND.yellow, “#C0392B”, “#1565C0”,
“#E65100”, “#1A237E”, “#BF360C”, “#0D47A1”, “#F57F17”,
“#880E4F”, “#004D40”,
];

function toMinutes(t) { const [h,m]=t.split(”:”).map(Number); return h*60+m; }
function addMinutes(t,mins) {
let total=toMinutes(t)+mins;
return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
}
function fmtTime(t) { return t+” hrs”; }
function fmtDate(d) { return new Date(d+“T00:00:00”).toLocaleDateString(“en-AU”,{weekday:“short”,day:“numeric”,month:“short”}); }
function uid() { return “u”+Math.random().toString(36).slice(2,9); }
function todayStr() { return new Date().toISOString().split(“T”)[0]; }

function buildRuns(people) {
const sorted=[…people].sort((a,b)=>a.date!==b.date?a.date.localeCompare(b.date):a.time.localeCompare(b.time));
const runs=[]; let cur=[],base=null;
for (const p of sorted) {
const m=toMinutes(p.time);
if (base===null||m-base>WINDOW_MIN||cur.length>=MAX_PAX){if(cur.length)runs.push(cur);cur=[p];base=m;}
else cur.push(p);
}
if(cur.length)runs.push(cur);
return runs;
}

function StatusBadge({status,loading}) {
if (loading) return <span style={S.badge.checking}>⟳ Checking…</span>;
if (!status)  return <span style={S.badge.unknown}>— No status</span>;
const sl=status.toLowerCase();
if (sl.includes(“land”)||sl.includes(“arriv”)||sl.includes(“on time”)) return <span style={S.badge.ontime}>✓ {status}</span>;
if (sl.includes(“delay”)||sl.includes(“late”))  return <span style={S.badge.delayed}>⚠ {status}</span>;
if (sl.includes(“cancel”))                       return <span style={S.badge.cancelled}>✕ {status}</span>;
return <span style={S.badge.unknown}>● {status}</span>;
}

// Wave SVG decoration
function WaveBar() {
return (
<svg viewBox=“0 0 1200 40” style={{display:“block”,width:“100%”,height:32,marginTop:-1}} preserveAspectRatio=“none”>
<path d="M0,20 C150,40 350,0 600,20 C850,40 1050,0 1200,20 L1200,40 L0,40 Z" fill={BRAND.darkBg}/>
</svg>
);
}

export default function App() {
const [tab,setTab]              = useState(“arrivals”);
const [arrivals,setArrivals]    = useState(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY_ARR))||[];}catch{return [];}});
const [departures,setDepartures]= useState(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY_DEP))||[];}catch{return [];}});
const [view,setView]            = useState(“runs”);
const [form,setForm]            = useState({name:””,mobile:””,date:””,time:””,flight:””,note:””});
const [editId,setEditId]        = useState(null);
const [filterDate,setFilter]    = useState(“all”);
const [loadingF,setLoadingF]    = useState({});
const [toast,setToast]          = useState(null);
const [delConfirm,setDelConfirm]= useState(null);

useEffect(()=>{try{localStorage.setItem(STORAGE_KEY_ARR,JSON.stringify(arrivals));}catch{}},[arrivals]);
useEffect(()=>{try{localStorage.setItem(STORAGE_KEY_DEP,JSON.stringify(departures));}catch{}},[departures]);

const people    = tab===“arrivals”?arrivals:departures;
const setPeople = tab===“arrivals”?setArrivals:setDepartures;
const allDates  = […new Set(people.map(p=>p.date))].sort();
const filtered  = filterDate===“all”?people:people.filter(p=>p.date===filterDate);
const runs      = buildRuns(filtered);

function showToast(msg,type=“success”){setToast({msg,type});setTimeout(()=>setToast(null),3000);}
function resetForm(){setForm({name:””,mobile:””,date:””,time:””,flight:””,note:””});setEditId(null);}

function handleSubmit() {
if (!form.name.trim()||!form.date||!form.time){showToast(“Name, date and time are required”,“error”);return;}
if (editId){setPeople(prev=>prev.map(p=>p.id===editId?{…p,…form}:p));showToast(“Updated ✓”);}
else{setPeople(prev=>[…prev,{id:uid(),…form,status:null}]);showToast(“Added to schedule ✓”);}
resetForm();setView(“runs”);
}

function handleEdit(p){
setForm({name:p.name,mobile:p.mobile||””,date:p.date,time:p.time,flight:p.flight||””,note:p.note||””});
setEditId(p.id);setView(“add”);
}

function handleDelete(id){setPeople(prev=>prev.filter(p=>p.id!==id));setDelConfirm(null);showToast(“Removed”);}

async function checkFlight(person) {
if (!person.flight||person.flight===”—”||person.flight===“TRAIN”) return;
setLoadingF(p=>({…p,[person.id]:true}));
try {
const iata=person.flight.replace(/\s/g,””).toUpperCase();
const data=await fetch(`https://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${iata}&flight_date=${person.date}`).then(r=>r.json());
const f=data?.data?.[0]; let txt=“No data found”;
if(f){
const fs=f.flight_status,arr=f.arrival;
if(fs===“landed”)     txt=`Landed ${arr?.actual?new Date(arr.actual).toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"}):""}`.trim();
else if(fs===“active”)    txt=“In flight ✈”;
else if(fs===“scheduled”) txt=arr?.delay?`Delayed ~${arr.delay} min`:“On time”;
else if(fs===“cancelled”) txt=“Cancelled”;
else txt=fs||“Unknown”;
}
setPeople(prev=>prev.map(p=>p.id===person.id?{…p,status:txt}:p));
} catch {setPeople(prev=>prev.map(p=>p.id===person.id?{…p,status:“Error”}:p));}
setLoadingF(p=>({…p,[person.id]:false}));
}

async function checkRunFlights(run){for(const p of run)await checkFlight(p);}

// ── Render ────────────────────────────────────────────────────────────────
return (
<div style={S.app}>

```
  {/* ── HEADER ── */}
  <header style={S.header}>
    {/* Top accent stripe */}
    <div style={S.stripe}>
      <div style={{flex:1,background:BRAND.red}}/>
      <div style={{flex:1,background:BRAND.yellow}}/>
      <div style={{flex:1,background:BRAND.blue}}/>
    </div>

    <div style={S.hInner}>
      {/* Logo area */}
      <div style={S.logoArea}>
        <div style={S.logoCircle}>
          <div style={S.logoInner}>
            <div style={{fontSize:22}}>🏄</div>
          </div>
        </div>
        <div>
          <div style={S.eventTag}>AUSSIES 2026 · GOLD COAST</div>
          <h1 style={S.appName}>Aussies Powercraft<br/>Airport Details</h1>
          <div style={S.subTitle}>Australian Surf Life Saving Championships</div>
        </div>
      </div>

      {/* Stats */}
      <div style={S.statsRow}>
        <div style={{...S.statBox, borderColor:BRAND.red}}>
          <div style={{...S.statN, color:BRAND.red}}>{arrivals.length}</div>
          <div style={S.statL}>Arrivals</div>
        </div>
        <div style={{...S.statBox, borderColor:BRAND.yellow}}>
          <div style={{...S.statN, color:BRAND.yellow}}>{departures.length}</div>
          <div style={S.statL}>Departures</div>
        </div>
        <div style={{...S.statBox, borderColor:BRAND.blueLight}}>
          <div style={{...S.statN, color:BRAND.blueLight}}>{buildRuns(arrivals).length+buildRuns(departures).length}</div>
          <div style={S.statL}>Total Runs</div>
        </div>
      </div>
    </div>
    <WaveBar/>
  </header>

  {/* ── MODE TABS ── */}
  <div style={S.modeTabs}>
    <button style={{...S.modeTab,...(tab==="arrivals"?{...S.modeOn,borderBottomColor:BRAND.yellow,color:BRAND.yellow}:{})}}
      onClick={()=>{setTab("arrivals");setView("runs");setFilter("all");}}>
      ✈  Arrivals
    </button>
    <button style={{...S.modeTab,...(tab==="departures"?{...S.modeOn,borderBottomColor:BRAND.red,color:BRAND.red}:{})}}
      onClick={()=>{setTab("departures");setView("runs");setFilter("all");}}>
      🛫  Departures
    </button>
  </div>

  {/* ── SUB NAV ── */}
  <div style={S.subNav}>
    <div style={S.subL}>
      {["runs","list"].map(v=>(
        <button key={v} style={{...S.subBtn,...(view===v?S.subOn:{})}} onClick={()=>setView(v)}>
          {v==="runs"?"🚐 Run Schedule":"👥 All People"}
        </button>
      ))}
    </div>
    <div style={S.subR}>
      {allDates.length>1&&(
        <select style={S.sel} value={filterDate} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All dates ({people.length})</option>
          {allDates.map(d=><option key={d} value={d}>{fmtDate(d)} ({people.filter(p=>p.date===d).length})</option>)}
        </select>
      )}
      <button style={{...S.addBtn, background: tab==="arrivals"?BRAND.yellow:BRAND.red, color: tab==="arrivals"?BRAND.blue:BRAND.white}}
        onClick={()=>{resetForm();setView("add");}}>
        + Add Person
      </button>
    </div>
  </div>

  <main style={S.main}>

    {/* ── ADD / EDIT FORM ── */}
    {view==="add"&&(
      <div style={S.card}>
        <div style={{...S.cardAccent, background: tab==="arrivals"?BRAND.yellow:BRAND.red}}/>
        <h2 style={{...S.cardTitle, color: tab==="arrivals"?BRAND.yellow:BRAND.red}}>
          {editId?"✏  Edit Person":`+ Add ${tab==="arrivals"?"Arrival":"Departure"}`}
        </h2>
        <div style={S.fGrid}>
          {[
            {label:"Full Name *",          key:"name",   type:"text", ph:"e.g. Jane Smith"},
            {label:"Mobile Number",         key:"mobile", type:"text", ph:"04XX XXX XXX"},
            {label:"Date *",                key:"date",   type:"date", ph:""},
            {label: tab==="arrivals"?"Landing Time *":"Departure Time *", key:"time", type:"time", ph:""},
            {label: tab==="arrivals"?"Flight Number":"Flight Number", key:"flight", type:"text", ph:"e.g. JQ404"},
            {label:"Note",                  key:"note",   type:"text", ph:"e.g. Special drop-off"},
          ].map(f=>(
            <label key={f.key} style={S.lbl}>
              <span style={S.lblTxt}>{f.label}</span>
              <input style={S.inp} type={f.type} placeholder={f.ph}
                value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}/>
            </label>
          ))}
        </div>
        <div style={S.fActs}>
          <button style={{...S.btnP, background: tab==="arrivals"?BRAND.yellow:BRAND.red, color: tab==="arrivals"?BRAND.blue:BRAND.white}}
            onClick={handleSubmit}>{editId?"Save Changes":"Add to Schedule"}</button>
          <button style={S.btnG} onClick={()=>{resetForm();setView("runs");}}>Cancel</button>
        </div>
      </div>
    )}

    {/* ── ALL PEOPLE LIST ── */}
    {view==="list"&&(
      <div style={S.card}>
        <div style={{...S.cardAccent, background: tab==="arrivals"?BRAND.yellow:BRAND.red}}/>
        <h2 style={{...S.cardTitle, color: tab==="arrivals"?BRAND.yellow:BRAND.red}}>
          All {tab==="arrivals"?"Arrivals":"Departures"} ({filtered.length})
        </h2>
        {filtered.length===0
          ?<p style={S.empty}>No people added yet — use "+ Add Person" to get started.</p>
          :[...filtered].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).map(p=>(
            <div key={p.id} style={S.lRow}>
              <div>
                <div style={S.lName}>{p.name}</div>
                <div style={S.lMeta}>{fmtDate(p.date)} · {fmtTime(p.time)}{p.flight?` · ${p.flight}`:""}</div>
                {p.mobile&&<div style={S.lSub}>📱 {p.mobile}</div>}
                {p.note&&<div style={{...S.lNote,color:BRAND.yellow}}>📝 {p.note}</div>}
              </div>
              <div style={S.lActs}>
                <button style={S.editBtn} onClick={()=>handleEdit(p)}>Edit</button>
                <button style={S.delBtn} onClick={()=>setDelConfirm(p.id)}>✕</button>
              </div>
            </div>
          ))
        }
      </div>
    )}

    {/* ── RUNS SCHEDULE ── */}
    {view==="runs"&&(
      <>
        {runs.length===0&&(
          <div style={S.emptyState}>
            <div style={S.emptyWave}>🌊</div>
            <div style={S.emptyIcon}>{tab==="arrivals"?"✈":"🛫"}</div>
            <div style={S.emptyTitle}>No {tab==="arrivals"?"arrivals":"departures"} scheduled yet</div>
            <div style={S.emptyBody}>Add team members using the button above and the minibus run schedule will appear here automatically, grouped into runs of up to {MAX_PAX}.</div>
            <button style={{...S.btnP, background: tab==="arrivals"?BRAND.yellow:BRAND.red, color: tab==="arrivals"?BRAND.blue:BRAND.white}}
              onClick={()=>setView("add")}>+ Add First Person</button>
          </div>
        )}

        {runs.map((run,ri)=>{
          const latestTime = run.reduce((mx,p)=>p.time>mx?p.time:mx,"00:00");
          const depart     = addMinutes(latestTime,BUFFER_MIN);
          const arrive     = addMinutes(depart,TRAVEL_MIN);
          const flights    = [...new Set(run.map(p=>p.flight).filter(f=>f&&f!=="—"))];
          const color      = RUN_COLORS[ri%RUN_COLORS.length];
          const isToday    = run[0].date===todayStr();
          const noMobile   = run.some(p=>!p.mobile||p.mobile==="—"||p.mobile==="TBC");
          const pct        = Math.round((run.length/MAX_PAX)*100);
          const capColor   = pct>=90?BRAND.red:pct>=70?BRAND.yellow:BRAND.blueLight;

          return (
            <div key={ri} style={{...S.runCard,borderTopColor:color}}>
              {/* Run header */}
              <div style={S.runTop}>
                <div style={S.runTL}>
                  <span style={{...S.runNum,background:color}}>Run {ri+1}</span>
                  {isToday&&<span style={S.todayPill}>TODAY</span>}
                  <span style={S.runDt}>{fmtDate(run[0].date)}</span>
                </div>
                {tab==="arrivals"&&flights.length>0&&(
                  <button style={{...S.checkBtn,borderColor:color+"55",color}} onClick={()=>checkRunFlights(run)}>
                    ↻ Check flights
                  </button>
                )}
              </div>

              {/* Timing strip */}
              <div style={S.timing}>
                {tab==="arrivals"?(
                  <>
                    <div style={S.tBlock}>
                      <div style={S.tLbl}>Latest landing</div>
                      <div style={S.tVal}>{fmtTime(latestTime)}</div>
                    </div>
                    <div style={{...S.tArr,color}}>›</div>
                    <div style={S.tBlock}>
                      <div style={S.tLbl}>Depart airport</div>
                      <div style={{...S.tVal,color}}>{fmtTime(depart)}</div>
                    </div>
                    <div style={{...S.tArr,color}}>›</div>
                    <div style={S.tBlock}>
                      <div style={S.tLbl}>Arrive compound</div>
                      <div style={S.tVal}>{fmtTime(arrive)}</div>
                    </div>
                  </>
                ):(
                  <>
                    <div style={S.tBlock}>
                      <div style={S.tLbl}>Compound pickup</div>
                      <div style={{...S.tVal,color:BRAND.red}}>{fmtTime(latestTime)}</div>
                    </div>
                    <div style={{...S.tArr,color:BRAND.red}}>›</div>
                    <div style={S.tBlock}>
                      <div style={S.tLbl}>Arrive airport</div>
                      <div style={S.tVal}>{fmtTime(arrive)}</div>
                    </div>
                  </>
                )}
                {/* Capacity */}
                <div style={S.capWrap}>
                  <div style={{...S.capLbl,color:capColor}}>{run.length}/{MAX_PAX} pax</div>
                  <div style={S.capBar}>
                    <div style={{...S.capFill,width:`${pct}%`,background:capColor}}/>
                  </div>
                </div>
              </div>

              {/* Flight chips */}
              {flights.length>0&&(
                <div style={S.chips}>
                  {flights.map(f=><span key={f} style={{...S.chip,borderColor:color+"66",color}}>{f}</span>)}
                </div>
              )}

              {/* Warning */}
              {noMobile&&(
                <div style={{...S.warn,borderColor:BRAND.yellow+"55",color:BRAND.yellow,background:"rgba(245,168,0,0.08)"}}>
                  ⚠ Some passengers have no mobile number on file
                </div>
              )}

              {/* Passenger list */}
              <div style={S.paxList}>
                {run.map((p,pi)=>(
                  <div key={p.id} style={{...S.paxRow,borderLeft:`3px solid ${color}44`}}>
                    <div>
                      <div style={S.paxName}>{p.name}</div>
                      <div style={S.paxMeta}>
                        {p.mobile&&p.mobile!=="—"&&p.mobile!=="TBC"?`📱 ${p.mobile}`:"📵 No mobile"}
                        {p.flight&&p.flight!=="—"?` · ${p.flight}`:""}
                        {p.note?` · 📝 ${p.note}`:""}
                      </div>
                    </div>
                    <div style={S.paxR}>
                      {tab==="arrivals"&&p.flight&&p.flight!=="—"&&p.flight!=="TRAIN"&&(
                        <><StatusBadge status={p.status} loading={loadingF[p.id]}/>
                        <button style={{...S.iconBtn,borderColor:color+"44"}} onClick={()=>checkFlight(p)}>↻</button></>
                      )}
                      <button style={{...S.iconBtn,borderColor:BRAND.border}} onClick={()=>handleEdit(p)}>✎</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {runs.length>0&&(
          <div style={S.sumBar}>
            <span style={{color:BRAND.yellow}}>📋 {filtered.length} people</span>
            <span style={{color:BRAND.blueLight}}>🚐 {runs.length} runs</span>
            <span style={{color:BRAND.textMuted}}>📅 {allDates.length} day{allDates.length!==1?"s":""}</span>
          </div>
        )}
      </>
    )}
  </main>

  {/* ── DELETE CONFIRM ── */}
  {delConfirm&&(
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={{...S.stripe,height:5,borderRadius:"8px 8px 0 0",marginBottom:20}}><div style={{flex:1,background:BRAND.red}}/><div style={{flex:1,background:BRAND.yellow}}/><div style={{flex:1,background:BRAND.blue}}/></div>
        <h3 style={{margin:"0 0 10px",color:BRAND.offWhite}}>Remove this person?</h3>
        <p style={{margin:"0 0 20px",color:BRAND.textMuted,fontSize:14}}>This cannot be undone.</p>
        <div style={{display:"flex",gap:10}}>
          <button style={{...S.btnP,background:BRAND.red,color:BRAND.white}} onClick={()=>handleDelete(delConfirm)}>Remove</button>
          <button style={S.btnG} onClick={()=>setDelConfirm(null)}>Cancel</button>
        </div>
      </div>
    </div>
  )}

  {/* ── TOAST ── */}
  {toast&&(
    <div style={{...S.toast,background:toast.type==="error"?BRAND.red:BRAND.blue,border:`1px solid ${toast.type==="error"?BRAND.redLight:BRAND.blueLight}`}}>
      {toast.msg}
    </div>
  )}
</div>
```

);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
app:       {fontFamily:”‘Trebuchet MS’,‘Arial’,sans-serif”,background:BRAND.darkBg,minHeight:“100vh”,color:BRAND.offWhite,paddingBottom:60},
header:    {background:`linear-gradient(160deg, ${BRAND.blue} 0%, ${BRAND.darkBg} 100%)`,paddingBottom:0},
stripe:    {display:“flex”,height:6},
hInner:    {maxWidth:960,margin:“0 auto”,padding:“20px 24px 16px”,display:“flex”,justifyContent:“space-between”,alignItems:“center”,flexWrap:“wrap”,gap:16},
logoArea:  {display:“flex”,alignItems:“center”,gap:16},
logoCircle:{width:64,height:64,borderRadius:“50%”,background:`linear-gradient(135deg,${BRAND.red},${BRAND.yellow})`,display:“flex”,alignItems:“center”,justifyContent:“center”,flexShrink:0,boxShadow:`0 0 0 3px ${BRAND.yellow}44`},
logoInner: {width:52,height:52,borderRadius:“50%”,background:BRAND.darkBg,display:“flex”,alignItems:“center”,justifyContent:“center”},
eventTag:  {fontSize:10,letterSpacing:3,color:BRAND.yellow,fontWeight:“bold”,marginBottom:4,textTransform:“uppercase”},
appName:   {margin:0,fontSize:22,color:BRAND.white,fontWeight:“bold”,lineHeight:1.2,letterSpacing:-0.3},
subTitle:  {fontSize:11,color:BRAND.textMuted,marginTop:4,letterSpacing:0.5},
statsRow:  {display:“flex”,gap:12},
statBox:   {textAlign:“center”,background:“rgba(0,0,0,0.25)”,border:“1px solid”,borderRadius:8,padding:“8px 14px”,backdropFilter:“blur(4px)”},
statN:     {fontSize:22,fontWeight:“bold”,fontFamily:“monospace”},
statL:     {fontSize:10,color:BRAND.textMuted,letterSpacing:1,textTransform:“uppercase”,marginTop:2},
modeTabs:  {maxWidth:960,margin:“0 auto”,padding:“0 24px”,display:“flex”,background:BRAND.darkBg},
modeTab:   {flex:1,padding:“13px 0”,background:“transparent”,border:“none”,color:BRAND.textDim,cursor:“pointer”,fontSize:15,fontWeight:“bold”,borderBottom:“3px solid transparent”,transition:“all 0.2s”,letterSpacing:0.3},
modeOn:    {background:“transparent”},
subNav:    {maxWidth:960,margin:“0 auto”,padding:“12px 24px”,display:“flex”,justifyContent:“space-between”,alignItems:“center”,flexWrap:“wrap”,gap:10,background:BRAND.cardBg,borderBottom:`1px solid ${BRAND.border}`},
subL:      {display:“flex”,gap:6},
subR:      {display:“flex”,gap:8,alignItems:“center”},
subBtn:    {background:“transparent”,border:`1px solid ${BRAND.border}`,color:BRAND.textMuted,padding:“7px 14px”,borderRadius:4,cursor:“pointer”,fontSize:13},
subOn:     {background:BRAND.cardBg2,color:BRAND.offWhite,borderColor:BRAND.blueLight},
sel:       {background:BRAND.cardBg,border:`1px solid ${BRAND.border}`,color:BRAND.offWhite,padding:“7px 12px”,borderRadius:4,fontSize:13,cursor:“pointer”},
addBtn:    {border:“none”,padding:“8px 18px”,borderRadius:4,cursor:“pointer”,fontWeight:“bold”,fontSize:13},
main:      {maxWidth:960,margin:“0 auto”,padding:“16px 24px”},
card:      {background:BRAND.cardBg,borderRadius:8,padding:0,marginBottom:16,border:`1px solid ${BRAND.border}`,overflow:“hidden”},
cardAccent:{height:4},
cardTitle: {margin:“0 0 20px”,fontSize:18,fontWeight:“bold”,padding:“20px 24px 0”},
fGrid:     {display:“grid”,gridTemplateColumns:“1fr 1fr”,gap:16,padding:“0 24px”,marginBottom:22},
lbl:       {display:“flex”,flexDirection:“column”,gap:7},
lblTxt:    {fontSize:11,color:BRAND.textMuted,letterSpacing:1,textTransform:“uppercase”,fontWeight:“bold”},
inp:       {background:BRAND.darkBg,border:`1px solid ${BRAND.border}`,color:BRAND.offWhite,padding:“10px 13px”,borderRadius:4,fontSize:14,outline:“none”},
fActs:     {display:“flex”,gap:10,padding:“0 24px 24px”},
btnP:      {border:“none”,padding:“10px 24px”,borderRadius:4,cursor:“pointer”,fontWeight:“bold”,fontSize:14},
btnG:      {background:“transparent”,color:BRAND.textMuted,border:`1px solid ${BRAND.border}`,padding:“10px 20px”,borderRadius:4,cursor:“pointer”,fontSize:14},
empty:     {color:BRAND.textDim,fontStyle:“italic”,textAlign:“center”,padding:“20px 24px”,margin:0},
lRow:      {display:“flex”,justifyContent:“space-between”,alignItems:“center”,padding:“11px 24px”,borderBottom:`1px solid ${BRAND.border}`},
lName:     {fontSize:15,color:BRAND.offWhite,fontWeight:“bold”,marginBottom:3},
lMeta:     {fontSize:12,color:BRAND.textMuted,fontFamily:“monospace”},
lSub:      {fontSize:12,color:”#5db88a”,marginTop:2},
lNote:     {fontSize:12,marginTop:2},
lActs:     {display:“flex”,gap:6},
editBtn:   {background:“transparent”,border:`1px solid ${BRAND.border}`,color:BRAND.textMuted,padding:“4px 12px”,borderRadius:4,cursor:“pointer”,fontSize:12},
delBtn:    {background:“transparent”,border:“1px solid #5a2020”,color:”#cc6060”,padding:“4px 10px”,borderRadius:4,cursor:“pointer”,fontSize:12},
emptyState:{textAlign:“center”,padding:“50px 20px”,background:BRAND.cardBg,borderRadius:8,border:`1px solid ${BRAND.border}`},
emptyWave: {fontSize:40,marginBottom:4,opacity:0.4},
emptyIcon: {fontSize:44,marginBottom:12},
emptyTitle:{fontSize:20,color:BRAND.offWhite,fontWeight:“bold”,marginBottom:10},
emptyBody: {fontSize:14,color:BRAND.textMuted,marginBottom:24,lineHeight:1.7,maxWidth:420,margin:“0 auto 24px”},
runCard:   {background:BRAND.cardBg,borderRadius:8,padding:20,marginBottom:14,border:`1px solid ${BRAND.border}`,borderTop:“4px solid”},
runTop:    {display:“flex”,justifyContent:“space-between”,alignItems:“center”,marginBottom:16},
runTL:     {display:“flex”,alignItems:“center”,gap:10},
runNum:    {padding:“3px 12px”,borderRadius:20,fontSize:12,fontWeight:“bold”,color:BRAND.white,letterSpacing:1},
todayPill: {background:BRAND.yellow,color:BRAND.blue,padding:“3px 10px”,borderRadius:20,fontSize:10,fontWeight:“bold”,letterSpacing:1},
runDt:     {fontSize:14,color:BRAND.textMuted},
checkBtn:  {background:“transparent”,border:“1px solid”,padding:“5px 13px”,borderRadius:4,cursor:“pointer”,fontSize:12,fontWeight:“bold”},
timing:    {display:“flex”,alignItems:“center”,gap:10,background:BRAND.darkBg,borderRadius:6,padding:“13px 18px”,marginBottom:13,flexWrap:“wrap”},
tBlock:    {textAlign:“center”,minWidth:110},
tLbl:      {fontSize:9,color:BRAND.textDim,letterSpacing:1,textTransform:“uppercase”,marginBottom:5},
tVal:      {fontSize:19,fontWeight:“bold”,color:BRAND.offWhite,fontFamily:“monospace”},
tArr:      {fontSize:24,fontWeight:“bold”,opacity:0.7},
capWrap:   {marginLeft:“auto”,minWidth:100},
capLbl:    {fontSize:11,fontFamily:“monospace”,marginBottom:5,textAlign:“right”,fontWeight:“bold”},
capBar:    {background:BRAND.cardBg2,borderRadius:4,height:6,overflow:“hidden”},
capFill:   {height:“100%”,borderRadius:4,transition:“width 0.4s”},
chips:     {display:“flex”,gap:6,marginBottom:10,flexWrap:“wrap”},
chip:      {background:BRAND.darkBg,border:“1px solid”,padding:“3px 10px”,borderRadius:4,fontSize:12,fontFamily:“monospace”,fontWeight:“bold”},
warn:      {border:“1px solid”,borderRadius:4,padding:“6px 12px”,fontSize:12,marginBottom:10},
paxList:   {display:“flex”,flexDirection:“column”,gap:4},
paxRow:    {display:“flex”,justifyContent:“space-between”,alignItems:“center”,background:BRAND.darkBg,borderRadius:4,padding:“8px 12px”},
paxName:   {fontSize:14,color:BRAND.offWhite,fontWeight:“bold”,marginBottom:3},
paxMeta:   {fontSize:12,color:BRAND.textDim},
paxR:      {display:“flex”,alignItems:“center”,gap:6},
iconBtn:   {background:“transparent”,border:“1px solid”,color:BRAND.textDim,width:28,height:28,borderRadius:4,cursor:“pointer”,fontSize:14,padding:0,display:“flex”,alignItems:“center”,justifyContent:“center”},
sumBar:    {background:BRAND.cardBg,borderRadius:6,padding:“11px 20px”,display:“flex”,gap:28,fontSize:13,border:`1px solid ${BRAND.border}`,marginTop:4},
overlay:   {position:“fixed”,inset:0,background:“rgba(0,10,30,0.85)”,display:“flex”,alignItems:“center”,justifyContent:“center”,zIndex:100},
modal:     {background:BRAND.cardBg,border:`1px solid ${BRAND.border}`,borderRadius:8,padding:“0 28px 28px”,maxWidth:360,width:“90%”,overflow:“hidden”},
toast:     {position:“fixed”,bottom:28,left:“50%”,transform:“translateX(-50%)”,color:BRAND.white,padding:“10px 26px”,borderRadius:6,fontSize:14,fontWeight:“bold”,zIndex:200,boxShadow:“0 4px 24px rgba(0,0,0,0.6)”,letterSpacing:0.3},
badge:{
ontime:   {background:“rgba(0,180,80,0.15)”,color:”#50d890”,padding:“2px 9px”,borderRadius:4,fontSize:11,fontFamily:“monospace”,border:“1px solid rgba(0,180,80,0.3)”},
delayed:  {background:“rgba(245,168,0,0.12)”,color:BRAND.yellow,padding:“2px 9px”,borderRadius:4,fontSize:11,fontFamily:“monospace”,border:“1px solid rgba(245,168,0,0.3)”},
cancelled:{background:“rgba(208,2,27,0.12)”,color:”#ff6070”,padding:“2px 9px”,borderRadius:4,fontSize:11,fontFamily:“monospace”,border:“1px solid rgba(208,2,27,0.3)”},
checking: {background:“rgba(0,77,179,0.2)”,color:BRAND.blueLight,padding:“2px 9px”,borderRadius:4,fontSize:11,fontFamily:“monospace”},
unknown:  {background:“rgba(74,114,168,0.15)”,color:BRAND.textMuted,padding:“2px 9px”,borderRadius:4,fontSize:11,fontFamily:“monospace”},
},
};
