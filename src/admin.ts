export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>SIGNAL - DGUI-HyperMem Control Board</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
:root{
  --bg:#050505;
  --panel:#0a0a0a;
  --panel-2:#101010;
  --line:rgba(255,255,255,0.08);
  --line-strong:rgba(255,255,255,0.16);
  --text:#f5f5f5;
  --text-sub:#b9b9b9;
  --text-dim:#6f6f6f;
  --accent:#d9b75b;
  --ok:#7bd88f;
  --warn:#f5b700;
  --bad:#ff5f5f;
  --cyan:#22c7dc;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100dvh;width:100vw;overflow:hidden}
body{
  background:radial-gradient(120% 120% at 50% 0%, #15130a 0%, var(--bg) 55%);
  color:var(--text);
  font-family:"Space Grotesk",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}
body::before{
  content:"";
  position:fixed;inset:0;pointer-events:none;
  background-image:repeating-linear-gradient(0deg, transparent 0px, transparent 1px, rgba(255,255,255,0.015) 1px, rgba(255,255,255,0.015) 2px);
  mix-blend-mode:soft-light;opacity:.4;
}
.grain{position:fixed;inset:0;pointer-events:none;opacity:.18;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");background-size:200px 200px}

.mono{font-family:"IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.28em;font-size:10px}

.board{
  position:relative;
  display:grid;
  grid-template-rows:auto auto 1fr auto;
  grid-template-columns:repeat(12,1fr);
  gap:10px;
  height:100dvh;
  width:100vw;
  padding:calc(10px + env(safe-area-inset-top,0px)) 10px calc(10px + env(safe-area-inset-bottom,0px));
  overflow:hidden;
}

.bar{
  grid-column:1/-1;
  display:flex;align-items:center;gap:16px;
  padding:10px 16px;
  border:1px solid var(--line);
  background:linear-gradient(180deg, rgba(217,183,91,0.12) 0%, transparent 100%), var(--panel);
  text-transform:uppercase;letter-spacing:.24em;font-size:10px;
}
.bar__brand{display:flex;align-items:center;gap:12px}
.bar .mark{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 6px rgba(217,183,91,0.12)}
.bar__tag{color:var(--text-dim);margin-left:8px}
.bar__stats{display:flex;gap:18px;margin-left:12px}
.bar__stats .stat{display:flex;gap:10px;align-items:baseline}
.bar__stats dt{color:var(--text-dim)}
.bar__stats dd{font-family:"IBM Plex Mono",monospace;letter-spacing:.16em}
.bar__spacer{flex:1}
.bar__user{display:flex;align-items:center;gap:10px}
.bar__user select{
  background:transparent;border:1px solid var(--line);color:var(--text);
  font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;
  padding:6px 10px;border-radius:0;
}
.bar__clock{display:flex;gap:10px;align-items:baseline}
.bar__clock-v{font-family:"IBM Plex Mono",monospace;letter-spacing:.18em}
.bar__live{display:flex;align-items:center;gap:8px}
.bar__live .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 6px rgba(123,216,143,0.08)}

.stats-row{grid-column:1/-1;display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.stat-card{
  border:1px solid var(--line);background:linear-gradient(180deg, rgba(255,255,255,0.01) 0%, transparent 100%), var(--panel);
  padding:10px 14px;display:flex;flex-direction:column;gap:6px;min-height:72px;
}
.stat-card .num{font-size:28px;letter-spacing:-.02em}
.stat-card .label{color:var(--text-dim);font-size:10px;text-transform:uppercase;letter-spacing:.26em}

.grid{
  grid-column:1/-1;
  display:grid;
  grid-template-columns:repeat(12,1fr);
  grid-template-rows:repeat(2, minmax(0,1fr));
  gap:10px;
  min-height:0;
}

.panel{
  border:1px solid var(--line);background:var(--panel);
  display:flex;flex-direction:column;min-height:0;overflow:hidden;
}
.panel--users{grid-column:1/9;grid-row:1/3}
.panel--services{grid-column:9/-1;grid-row:1/2}
.panel--activity{grid-column:9/-1;grid-row:2/3}

.panel__head{
  display:flex;align-items:center;justify-content:space-between;
  padding:8px 14px;border-bottom:1px solid var(--line);
  text-transform:uppercase;letter-spacing:.28em;font-size:10px;color:var(--text-dim);
}
.panel__title{display:flex;align-items:center;gap:10px;color:var(--text)}
.panel__meta{font-family:"IBM Plex Mono",monospace;letter-spacing:.18em}

.panel__body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}

.table-wrap{flex:1;min-height:0;overflow:auto}
table{width:100%;border-collapse:collapse;font-size:11px}
thead th{
  position:sticky;top:0;background:var(--panel-2);
  text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);
  color:var(--text-dim);font-weight:500;text-transform:uppercase;letter-spacing:.22em;font-size:9px
}
tbody td{
  padding:8px 12px;border-bottom:1px solid var(--line);
  font-family:"IBM Plex Mono",monospace;color:var(--text-sub);white-space:nowrap
}
tbody tr:hover{background:rgba(255,255,255,0.01)}
td.email{font-family:"Space Grotesk",sans-serif;color:var(--text)}

.status{display:inline-flex;align-items:center;gap:6px}
.status::before{content:"";width:6px;height:6px;border-radius:50%}
.status.active::before{background:var(--ok);box-shadow:0 0 0 6px rgba(123,216,143,0.06)}
.status.disabled::before{background:var(--bad);box-shadow:0 0 0 6px rgba(255,95,95,0.06)}
.status.pending::before{background:var(--warn);box-shadow:0 0 0 6px rgba(245,183,0,0.06)}

.btn-link{
  background:none;border:0;color:var(--accent);font:inherit;font-family:"IBM Plex Mono",monospace;
  font-size:10px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer
}

.services{flex:1;min-height:0;display:flex;flex-direction:column;padding:10px 14px;gap:10px}
.service-row{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--line);padding:10px 12px}
.service-name{display:flex;flex-direction:column;gap:4px}
.service-name .name{font-size:12px;text-transform:uppercase;letter-spacing:.24em}
.service-name .meta{color:var(--text-dim);font-size:10px;font-family:"IBM Plex Mono",monospace;letter-spacing:.16em}
.service-status{display:flex;align-items:center;gap:8px;font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase}
.service-status .dot{width:6px;height:6px;border-radius:50%}
.service-status.ok .dot{background:var(--ok);box-shadow:0 0 0 6px rgba(123,216,143,0.06)}
.service-status.down .dot{background:var(--bad);box-shadow:0 0 0 6px rgba(255,95,95,0.06)}
.service-status.unknown .dot{background:var(--text-dim);box-shadow:0 0 0 6px rgba(255,255,255,0.02)}

.iframe-wrap{flex:1;min-height:0;border-top:1px solid var(--line)}
.iframe-wrap iframe{width:100%;height:100%;border:0;background:transparent}

.activity{flex:1;min-height:0;position:relative}
.act-canvas{position:absolute;inset:0}
.act-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:11px;text-transform:uppercase;letter-spacing:.24em}

.login-screen{
  position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 120% at 50% 0%, #15130a 0%, var(--bg) 55%);
}
.login-box{
  border:1px solid var(--line);background:var(--panel);
  padding:28px 32px;display:flex;flex-direction:column;gap:14px;min-width:320px;text-align:center
}
.login-box h1{font-weight:400;letter-spacing:-.02em}
.login-box p{color:var(--text-dim);font-size:12px}
.login-box input{
  background:transparent;border:1px solid var(--line);color:var(--text);
  padding:10px 12px;font-family:"IBM Plex Mono",monospace;text-align:center;letter-spacing:.4em
}
.login-box button{
  background:transparent;border:1px solid var(--accent);color:var(--text);
  padding:10px 12px;text-transform:uppercase;letter-spacing:.28em;font-size:10px;cursor:pointer
}

@media(max-width:1100px){
  .grid{grid-template-rows:auto auto auto}
  .panel--users{grid-column:1/-1;grid-row:1/2}
  .panel--services{grid-column:1/7;grid-row:2/3}
  .panel--activity{grid-column:7/-1;grid-row:2/3}
}
@media(max-width:860px){
  .stats-row{grid-template-columns:repeat(3,1fr)}
  .panel--services{grid-column:1/-1;grid-row:2/3}
  .panel--activity{grid-column:1/-1;grid-row:3/4}
}
</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>

<div id="login" class="login-screen">
  <div class="login-box">
    <div class="mono">ACCESS RESTRICTED</div>
    <h1>DGUI-HyperMem</h1>
    <p>Enter master passkey to access control board</p>
    <input type="password" id="admin-passkey" placeholder="••••••••" autocomplete="off">
    <button onclick="login()">AUTHENTICATE</button>
  </div>
</div>

<div id="dashboard" class="board" style="display:none">
  <header class="bar">
    <div class="bar__brand">
      <span class="mark"></span>
      <span>SIGNAL</span>
      <span class="bar__tag mono">DGUI-HYPERMEM CONTROL BOARD</span>
    </div>
    <dl class="bar__stats">
      <div class="stat"><dt>HOST</dt><dd>dgui-hmem.deckergui.my</dd></div>
      <div class="stat"><dt>STATUS</dt><dd>LIVE</dd></div>
    </dl>
    <div class="bar__spacer"></div>
    <div class="bar__user">
      <span class="mono">USER</span>
      <select id="userSelector" onchange="selectUser(this.value)">
        <option value="all">ALL USERS</option>
      </select>
    </div>
    <div class="bar__clock">
      <span class="bar__clock-k mono">UTC</span>
      <span class="bar__clock-v" id="barClock">--:--:--</span>
    </div>
    <div class="bar__live">
      <span class="dot"></span>
      <span class="mono">CONNECTED</span>
    </div>
    <button class="btn-link" onclick="logout()">LOGOUT</button>
  </header>

  <section class="stats-row" id="stats-row"></section>

  <main class="grid">
    <section class="panel panel--users">
      <header class="panel__head">
        <div class="panel__title"><span class="mark"></span><span>TOKENS BY PLAN</span></div>
        <div class="panel__meta" id="plan-summary">-</div>
      </header>
      <div class="panel__body">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th><th>Plan</th><th>Status</th><th>MCP</th><th>T&C</th><th>Token</th><th>Quota</th><th>Train</th><th>Created</th><th>Action</th>
              </tr>
            </thead>
            <tbody id="token-rows"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="panel panel--services">
      <header class="panel__head">
        <div class="panel__title"><span class="mark"></span><span>SERVICES STATUS</span></div>
        <div class="panel__meta">IFRAME</div>
      </header>
      <div class="panel__body">
        <div class="services" id="services-list">
          <div class="service-row">
            <div class="service-name">
              <span class="name">HEALTH</span>
              <span class="meta">/health</span>
            </div>
            <div class="service-status unknown" id="svc-health"><span class="dot"></span><span>CHECKING</span></div>
          </div>
          <div class="service-row">
            <div class="service-name">
              <span class="name">MCP</span>
              <span class="meta">/mcp</span>
            </div>
            <div class="service-status unknown" id="svc-mcp"><span class="dot"></span><span>CHECKING</span></div>
          </div>
          <div class="service-row">
            <div class="service-name">
              <span class="name">API</span>
              <span class="meta">/api/*</span>
            </div>
            <div class="service-status unknown" id="svc-api"><span class="dot"></span><span>CHECKING</span></div>
          </div>
        </div>
        <div class="iframe-wrap">
          <iframe src="/health" id="statusFrame" title="Service Status"></iframe>
        </div>
      </div>
    </section>

    <section class="panel panel--activity">
      <header class="panel__head">
        <div class="panel__title"><span class="mark"></span><span>MEMORY ACTIVITY</span></div>
        <div class="panel__meta" id="activity-summary">-</div>
      </header>
      <div class="panel__body">
        <div class="activity">
          <div class="act-canvas" id="act-canvas"><div class="act-empty">NO ACTIVITY</div></div>
        </div>
      </div>
    </section>
  </main>
</div>

<script>
let cp='';
let adminSession='';
let allTokens=[];
let currentUser='all';

// Nothing on the admin surface routes by fragment, so a "#" in the address bar
// is always leftover navigation, never a route. Revoke and Quota were <a href="#">,
// which left a bare "#" behind every click; they are buttons now (see actionsHtml).
// This is the backstop for any fragment that still arrives from outside, e.g. a
// bookmark or a pasted URL. No target is looked up on purpose: an unknown
// fragment must still be removed, because the alternative is a permanent "#".
(function cleanHash(){
  if (!window.history || !history.replaceState) return;
  const strip = function () {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  };
  strip();
  // Editing the address bar of an already-open admin page is a same-document
  // navigation, so the strip above does not run again and the "#" would persist.
  // replaceState does not fire hashchange, so this cannot loop.
  window.addEventListener('hashchange', strip);
})();

function getApiHeaders(extra={}) {
  const h = {'content-type':'application/json', ...extra};
  if (adminSession) h['x-admin-session'] = adminSession;
  return h;
}

function updateClock(){
  const el=document.getElementById('barClock');
  if(!el) return;
  el.textContent=new Date().toISOString().substr(11,8);
}
setInterval(updateClock,1000); updateClock();

function logout(){
  document.getElementById('dashboard').style.display='none';
  document.getElementById('login').style.display='flex';
  adminSession=''; cp='';
}
async function login(){
  const input=document.getElementById('admin-passkey');
  cp=input?input.value:'';
  const isLocal = typeof location!=='undefined' && /^(localhost|127.0.0.1|[::1])$/.test(location.hostname);
  if(!cp && isLocal) cp='dev';
  try{
    const lr = await fetch('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({passkey:cp})});
    const ld = await lr.json();
    if(ld.error){
      if(typeof isLocal!=='undefined' && isLocal){ adminSession='dev-local'; }
      else { return alert('Unauthorized'); }
    }else{
      if(ld.session) adminSession = ld.session;
      else adminSession = '';
    }
    // Load dashboard
    const r1=await fetch('/api/admin/tokens', {headers:getApiHeaders({})});
    const d1=await r1.json();
    if(d1.error && !(typeof isLocal!=='undefined' && isLocal)){ return alert('Unauthorized'); }
    allTokens=(d1.tokens)||[];
    if(typeof isLocal!=='undefined' && isLocal && allTokens.length===0){
      allTokens=[
        {email:'demo@local',plan:'pro',status:'active',has_connected:true,tc_agreed:1,train_with_all:true,token:'devtoken123',quota_monthly:10000,requests_used:245,created_at:Date.now()},
        {email:'user@local',plan:'free',status:'active',has_connected:false,tc_agreed:1,train_with_all:false,token:'devtoken456',quota_monthly:1000,requests_used:120,created_at:Date.now()-86400000}
      ];
    }
    render(allTokens); if(typeof populateUserSelector==='function'){ try{populateUserSelector(allTokens);}catch(e){} }
    const r2=await fetch('/api/admin/stats', {headers:getApiHeaders({})});
    const d2=await r2.json();
    if(!d2.error){
      if(d2.users_by_plan){
        const plans=d2.users_by_plan;
        document.getElementById('stats-row').innerHTML=
          '<div class="stat-card"><div class="num">'+d1.tokens.length+'</div><div class="label">Total / 100</div></div>'+
          '<div class="stat-card"><div class="num">'+(d1.tokens.filter(t=>t.status==='active').length)+'</div><div class="label">Active</div></div>'+
          '<div class="stat-card"><div class="num">'+d1.tokens.filter(t=>t.has_connected).length+'</div><div class="label">Online</div></div>'+
          '<div class="stat-card"><div class="num">'+(plans.free||0)+'</div><div class="label">Free</div></div>'+
          '<div class="stat-card"><div class="num">'+(plans.median||0)+'</div><div class="label">Median</div></div>'+
          '<div class="stat-card"><div class="num">'+(plans.pro||0)+'</div><div class="label">Pro</div></div>'+
          '<div class="stat-card"><div class="num">'+(plans.enterprise||0)+'</div><div class="label">Enterprise</div></div>'+
          '<div class="stat-card"><div class="num">'+(d2.failed_logins_30d||0)+'</div><div class="label">Fails 30d</div></div>';
        document.getElementById('plan-summary').textContent=
          Object.keys(plans).map(function(k){return plans[k]+' '+k}).join(' · ');
      }
    }
    loadActivity();
    document.getElementById('login').style.display='none';
    document.getElementById('dashboard').style.display='grid';
  }catch(e){alert('Error: '+e.message)}
}
function planName(t){return t.plan||'free'}
function tcDisplay(t){
  const ok=t.tc_agreed===1||t.tc_agreed===true;
  return ok?'<span class="status active">OK</span>':'<span class="status disabled">NO</span>';
}
function trainBtn(t){
  const on=t.train_with_all===1||t.train_with_all===true;
  return '<button class="btn-link" onclick="toggleTrain(\\''+esc(t.email)+'\\','+(on?'0':'1')+')">'+(on?'ON':'OFF')+'</button>';
}
function quotaDisplay(t){
  const used=t.requests_used||0, max=t.quota_monthly||1000;
  const pct=Math.min(100,Math.round(used/max*100));
  const color=pct>=90?'var(--bad)':pct>=70?'var(--warn)':'var(--ok)';
  return {html:'<span style="color:'+color+'">'+used+'/'+max+'</span>', pct:color};
}
// Revoke and Quota are actions, not navigation, so they are buttons rather than
// <a href="#">. An anchor with an empty target still navigates: clicking it
// leaves a bare "#" in the address bar on a page that has no fragment routing,
// and it advertises a link to a screen reader where there is none. Buttons get
// the same look inline, with no layout change.
const LINK_BTN = 'background:none;border:0;padding:0;color:var(--accent);font:inherit;font-family:"IBM Plex Mono",monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer';
function actionsHtml(t){
  if(t.status!=='active') return '';
  return '<button type="button" class="btn-link" onclick="revoke(\\''+esc(t.email)+'\\')">REVOKE</button> ' +
         '<button type="button" class="btn-link" onclick="editQuota(\\''+esc(t.email)+'\\','+t.quota_monthly+',\\''+esc(t.plan||'free')+'\\')">QUOTA</button> ' +
         '<button type="button" class="btn-link" onclick="resetUsage(\\''+esc(t.email)+'\\')">RESET</button>';
}
function planDisplay(t){
  const n=planName(t);
  return '<span style="text-transform:uppercase;letter-spacing:.16em">'+esc(n)+'</span>';
}
function connectedDisplay(t){
  return t.has_connected?'<span class="status active">YES</span>':'<span class="status disabled">NO</span>';
}

function render(tokens){
  const rows=document.getElementById('token-rows');
  if(!rows) return;
  rows.innerHTML=tokens.map(t=>{
    const date=new Date(t.created_at).toLocaleDateString();
    const q=quotaDisplay(t);
    return '<tr><td class="email" title="'+esc(t.email)+'">'+esc(t.email)+'</td><td>'+planDisplay(t)+'</td>'
      +'<td><span class="status '+esc(t.status)+'">'+esc(t.status)+'</span></td>'
      +'<td>'+connectedDisplay(t)+'</td>'
      +'<td>'+tcDisplay(t)+'</td>'
      +'<td>'+(t.token?esc(t.token.substring(0,8))+'...':'-')+'</td>'
      +'<td>'+q.html+'</td><td>'+trainBtn(t)+'</td>'
      +'<td>'+date+'</td><td>'+actionsHtml(t)+'</td></tr>';
  }).join('');
}

/* --- layout --- */
document.body.dataset.view='list';

var sysTaps=0, sysTimer=null; function tapSystem(){ sysTaps++; clearTimeout(sysTimer); sysTimer=setTimeout(function(){sysTaps=0},20000); if(sysTaps>=5){ sysTaps=0; var p=document.getElementById('panel-system'); if(p){p.hidden=!p.hidden; if(!p.hidden) loadVisits();}}}

async function loadVisits(){
  var box=document.getElementById('visit-spark');
  if(!box) return;
  try{
    var r=await fetch('/api/admin/visits',{headers:getApiHeaders({})});
    var d=await r.json();
    if(d.error) return;
    var t=document.getElementById('sys-visits-today'); if(t) t.textContent=d.today;
    var tt=document.getElementById('sys-visits-total'); if(tt) tt.textContent=d.total;
    var s=document.getElementById('spark-sum'); if(s) s.textContent='last 30d: '+d.last_30;
    var days=d.days||[];
    if(!days.length){ box.innerHTML='<div class="act-empty">No visit data yet.</div>'; return; }
    var peak=Math.max.apply(null,days.map(function(x){return x.count}).concat([1]));
    box.innerHTML=days.map(function(x){ var h=Math.max(1,Math.round(x.count/peak*72)); var title=x.day+' - '+x.count+' visit'+(x.count===1?'':'s'); return '<div class="spark-bar" data-zero="'+(x.count?0:1)+'" style="height:'+h+'px" title="'+esc(title)+'"></div>'; }).join('');
  }catch(e){}
}

const ACT_COLORS={add:'#7bd88f',update:'#22c7dc',supersede:'#d9b75b',forget:'#ff5f5f',search:'#a78bfa'};
async function loadActivity(){
  var canvas=document.getElementById('act-canvas');
  if(!canvas) return;
  try{
    var r=await fetch('/api/admin/activity?limit=60',{headers:getApiHeaders({})});
    var d=await r.json();
    if(d.error){ canvas.innerHTML='<div class="act-empty">UNAVAILABLE</div>'; return; }
    var nodes=d.nodes||[];
    var counts=d.counts||{};
    var as=document.getElementById('activity-summary');
    if(as) as.textContent=Object.keys(counts).map(function(k){return k.toUpperCase()+' '+counts[k]}).join(' · ')||'-';
    if(!nodes.length){ canvas.innerHTML='<div class="act-empty">NO ACTIVITY</div>'; return; }
    var W=canvas.clientWidth||400, H=canvas.clientHeight||120;
    var ordered=nodes.slice().reverse();
    var t0=ordered[0].at, t1=ordered[ordered.length-1].at||t0+1;
    var span=Math.max(t1-t0,1);
    var pts=ordered.map(function(n){
      var x=16+((n.at-t0)/span)*(W-32);
      var jitter=n.results?Math.sin((n.at%997)/997*Math.PI*2)*12:0;
      var y=H/2+jitter;
      return {n:n,x:x,y:y};
    });
    var svg='<svg class="act-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';
    for(var i=1;i<pts.length;i++){
      var a=pts[i-1],b=pts[i];
      var stroke=(ACT_COLORS[b.n.kind]||'#22c7dc');
      svg+='<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" stroke="'+stroke+'" stroke-width="1" opacity=".25"/>';
    }
    svg+='</svg>';
    var html=svg;
    pts.forEach(function(p){
      var color=ACT_COLORS[p.n.kind]||'#22c7dc';
      var size=p.n.results?8+Math.min(6,p.n.results):6;
      html+='<div class="act-node" style="left:'+p.x+'px;top:'+p.y+'px"><div class="act-dot" style="width:'+size+'px;height:'+size+'px;background:'+color+';color:'+color+'"></div></div>';
    });
    canvas.innerHTML=html;
  }catch(e){canvas.innerHTML='<div class="act-empty">UNAVAILABLE</div>'}
}
async function toggleTrain(email,val){
  if(!cp && !adminSession) return;
  const r=await fetch('/api/admin/toggle-train',{method:'POST',headers:getApiHeaders(),body:JSON.stringify({email,passkey:cp,session:adminSession,train_with_all:val,totp:undefined})});
  const d=await r.json();
  if(d.error){
    if(d.error==='totp_required') alert('2FA required. Please re-login.');
    else alert(d.error);
    return;
  }
  await login();
}
async function revoke(email){
  if(!confirm('Revoke token for '+email+'?')) return;
  const r=await fetch('/api/disable-token',{method:'POST',headers:getApiHeaders(),body:JSON.stringify({email,passkey:cp,session:adminSession})});
  const d=await r.json();
  if(d.error) return alert(d.error);
  await login();
}
function editQuota(email,currentQuota,currentPlan){
  const quota=prompt('New quota for '+email+':',currentQuota);
  if(quota===null) return;
  const plan=prompt('Plan (free/median/pro/enterprise):',currentPlan||'free');
  if(plan===null) return;
  fetch('/api/admin/update-quota',{method:'POST',headers:getApiHeaders(),body:JSON.stringify({email,passkey:cp,session:adminSession,quota_monthly:parseInt(quota),plan})})
  .then(r=>r.json()).then(d=>{if(d.error){if(d.error==='totp_required')alert('2FA required. Please re-login.');else alert(d.error);}else alert('Updated');login()});
}
async function resetUsage(email){
  if(!confirm('Reset usage for '+email+'? Plan and wallet are unchanged.')) return;
  const r=await fetch('/api/admin/reset-usage',{method:'POST',headers:getApiHeaders(),body:JSON.stringify({email,passkey:cp,session:adminSession})});
  const d=await r.json();
  if(d.error){if(d.error==='totp_required')alert('2FA required. Please re-login.');else alert(d.error);return;}
  await login();
}
/* --- top-right user selector ------------------------------------------- */
// The board is single-screen, so the per-user view is a filter rather than a
// second page: the selector lists every token and the table narrows to one row.
function populateUserSelector(tokens){
  const sel=document.getElementById('userSelector');
  if(!sel) return;
  const keep=currentUser;
  sel.innerHTML='<option value="all">ALL USERS</option>'+tokens.map(function(t){
    return '<option value="'+esc(t.email)+'">'+esc(t.email)+'</option>';
  }).join('');
  if(keep!=='all' && tokens.some(function(t){return t.email===keep})) sel.value=keep;
  else { sel.value='all'; currentUser='all'; }
}
function selectUser(v){
  currentUser=v||'all';
  const rows=(currentUser==='all')?allTokens:allTokens.filter(function(t){return t.email===currentUser});
  render(rows);
  const meta=document.querySelector('.panel--users .panel__meta');
  if(meta) meta.textContent=(currentUser==='all'?'ALL USERS':currentUser.toUpperCase())+' / '+rows.length;
}

/* --- service status rows ----------------------------------------------- */
// Each row reports a live probe: /health (public), /mcp (reachable, any auth
// answer counts) and /api/admin/stats (admin session). The iframe underneath
// shows the raw /health JSON so the numbers are inspectable, not just a dot.
async function checkServices(){
  const set=function(id,state,text){
    const el=document.getElementById(id);
    if(!el) return;
    el.className='service-status '+state;
    const label=el.querySelector('span:last-child');
    if(label) label.textContent=text;
  };
  try{
    const r=await fetch('/health',{cache:'no-store'});
    const d=await r.json();
    const ok=r.ok && d.status==='ok';
    set('svc-health', ok?'ok':'down', ok?'ONLINE · '+String(d.jev_mode||'?').toUpperCase():'DOWN');
  }catch(e){ set('svc-health','down','DOWN'); }
  try{
    const r=await fetch('/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'{}',cache:'no-store'});
    const ok=r.status<500;
    set('svc-mcp', ok?'ok':'down', ok?'ONLINE · HTTP '+r.status:'DOWN');
  }catch(e){ set('svc-mcp','down','DOWN'); }
  try{
    const r=await fetch('/api/admin/stats',{headers:getApiHeaders({}),cache:'no-store'});
    const ok=r.status<500;
    set('svc-api', ok?'ok':'down', ok?'ONLINE · HTTP '+r.status:'DOWN');
  }catch(e){ set('svc-api','down','DOWN'); }
}
setInterval(function(){ try{ checkServices(); }catch(e){} },30000);

function esc(s){return s.replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
</script>
</body>
</html>`;