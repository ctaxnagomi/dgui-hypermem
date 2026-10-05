export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>DGUI-HyperMem Admin — Token Dashboard</title>
<link rel="apple-touch-icon" sizes="180x180" href="/admin-180.png">
<link rel="apple-touch-icon" sizes="152x152" href="/admin-152.png">
<link rel="apple-touch-icon" sizes="120x120" href="/admin-120.png">
<link rel="icon" type="image/png" sizes="192x192" href="/admin-192.png">
<link rel="icon" type="image/png" sizes="48x48" href="/admin-48.png">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8L92 34L50 58L8 34Z' fill='%2300f0ff' stroke='%2300f0ff' stroke-width='1'/%3E%3Cpath d='M50 30L92 56L50 80L8 56Z' fill='rgba(200,200,200,0.7)' stroke='%2300f0ff' stroke-width='1'/%3E%3Cpath d='M50 52L92 78L50 92L8 78Z' fill='rgba(255,255,255,0.8)' stroke='%2300f0ff' stroke-width='1'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
<style>
:root{--bg-deep:#080d18;--bg-primary:#0e1526;--bg-surface:#151f35;--bg-surface-2:#1c2942;--border-glass:rgba(255,255,255,.10);--border:rgba(255,255,255,.12);--accent-cyan:#22c7dc;--accent-cyan-deep:#00a3b3;--text-primary:#f4f8fc;--text-secondary:#b7c4d6;--text-muted:#9aadc6;--glass:rgba(21,31,53,.62);--shadow:0 18px 50px -12px rgba(0,0,0,.65)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg-deep);background-image:linear-gradient(165deg,#0a1020 0%,#101a30 42%,#0c1424 100%);background-attachment:fixed}html,body{height:100%;width:100%;font-family:'Inter',sans-serif;color:var(--text-primary);-webkit-overflow-scrolling:touch;overscroll-behavior:none;touch-action:manipulation;-webkit-text-size-adjust:100%}body{background:transparent}
/* Atmospheric background, matching the landing page. Alphas are halved
   because this is a dense operational surface, not a marketing page. */
body::before,body::after{content:'';position:fixed;inset:-22%;z-index:-1;pointer-events:none;will-change:transform}
body::before{background:radial-gradient(38% 38% at 28% 28%,rgba(62,127,189,.22),transparent 70%),radial-gradient(34% 34% at 72% 64%,rgba(29,95,150,.18),transparent 70%);animation:drift-right 58s linear infinite}
body::after{background:radial-gradient(42% 42% at 74% 22%,rgba(34,199,220,.08),transparent 70%),radial-gradient(36% 36% at 22% 78%,rgba(91,135,172,.12),transparent 70%);animation:drift-left 74s linear infinite}
@keyframes drift-right{0%{transform:translate3d(-6%,0,0) scale(1)}100%{transform:translate3d(6%,0,0) scale(1.08)}}
@keyframes drift-left{0%{transform:translate3d(6%,-2%,0) scale(1.06)}100%{transform:translate3d(-6%,2%,0) scale(1)}}
@media(prefers-reduced-motion:reduce){body::before,body::after{animation:none}}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
#app{width:100%;max-width:100%;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
h1{font-size:24px;font-weight:300;letter-spacing:-.6px;margin-bottom:4px}
.sub{color:var(--text-muted);font-size:14px;margin-bottom:24px}
.login-box{background:rgba(21,31,53,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:var(--shadow);width:100%;max-width:400px;margin:0 auto;padding:32px;border:1px solid var(--border-glass);border-radius:12px;text-align:center}
.login-box input{width:100%;padding:14px 16px;margin-bottom:12px;background:rgba(8,13,24,.55);border:1px solid var(--border-glass);border-radius:8px;color:var(--text-primary);font-family:Inter,sans-serif;font-size:16px;outline:none}
.login-box input:focus{border-color:var(--accent-cyan)}
.btn{background:var(--accent-cyan);color:#04121a;border:none;border-radius:9999px;padding:12px 20px;font-size:15px;font-weight:500;cursor:pointer;width:100%;box-shadow:0 8px 24px -10px rgba(34,199,220,.85);transition:background .2s,box-shadow .2s}.btn:hover{background:var(--accent-cyan-deep);box-shadow:0 10px 28px -10px rgba(34,199,220,.95)}
.stats{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.stat-card{background:rgba(21,31,53,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:var(--shadow);padding:16px;border:1px solid var(--border-glass);border-radius:8px;flex:1 1 120px;min-width:100px}
.stat-card .num{font-size:26px;font-weight:300;color:var(--accent-cyan)}
.stat-card .label{font-size:11px;color:var(--text-muted);margin-top:4px;word-break:keep-all}
.table-wrap{background:rgba(21,31,53,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:var(--shadow);overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border-glass);border-radius:8px;margin-top:16px}
table{width:100%;border-collapse:collapse;font-size:12px;min-width:650px}
th{text-align:left;padding:10px 6px;border-bottom:1px solid var(--border-glass);color:var(--text-muted);font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
td{padding:8px 6px;border-bottom:1px solid var(--border-glass);font-family:JetBrains Mono,monospace;font-size:11px;color:var(--text-secondary);white-space:nowrap}
td.email{font-family:Inter,sans-serif;font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis}
.status{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:500}
.status.active{background:rgba(74,222,128,.15);color:#4ade80}
.status.disabled{background:rgba(248,113,113,.15);color:#f87171}
.status.pending{background:rgba(251,191,36,.15);color:#fbbf24}
.toggle{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;cursor:pointer;border:1px solid var(--border-glass);background:transparent;color:var(--text-muted)}
.toggle.on{background:rgba(74,222,128,.15);color:#4ade80;border-color:#4ade80}
.toggle.off{background:rgba(248,113,113,.15);color:#f87171;border-color:#f87171}
a{color:var(--accent-cyan);text-decoration:none}
.badge{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:3px;vertical-align:middle}
.badge.online{background:#4ade80}
.badge.offline{background:var(--text-muted)}
.topbar{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px}
.hidden-msg{display:none}

/* --- panels --- */
.panel{background:rgba(21,31,53,.62);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:var(--shadow);border:1px solid var(--border-glass);border-radius:10px;margin-bottom:16px;overflow:hidden}
.panel[hidden]{display:none}
.panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;border-bottom:1px solid var(--border-glass);flex-wrap:wrap}
.panel-head.static{cursor:default}
.panel-head:hover .panel-title{color:var(--accent-cyan)}
.panel-title{font-size:13px;font-weight:500;color:var(--text-primary);display:flex;align-items:center;gap:8px;transition:color .2s}
.panel-meta{font-size:11px;color:var(--text-muted);font-family:JetBrains Mono,monospace}
.panel-body{padding:16px}
/* Suppress the tap ripple entirely; the gate gives no feedback by design. */
.panel-head:active{background:transparent}

/* --- view toggle --- */
.view-toggle{display:inline-flex;gap:0;margin-bottom:16px;border:1px solid var(--border-glass);border-radius:9999px;overflow:hidden;background:rgba(21,31,53,.72)}
.vt-btn{background:transparent;border:none;color:var(--text-muted);font-family:Inter,sans-serif;font-size:12px;padding:8px 16px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background .2s,color .2s}
.vt-btn[aria-pressed="true"]{background:var(--accent-cyan);color:#04121a}
.vt-btn:hover:not([aria-pressed="true"]){color:var(--text-primary)}

/* --- grid view --- */
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:16px}
body[data-view="grid"] .table-wrap{display:none}
body[data-view="grid"] .card-grid{display:grid}
body[data-view="list"] .card-grid{display:none}
body[data-view="list"] .table-wrap{display:block}
.tcard{background:rgba(8,13,24,.42);border:1px solid var(--border-glass);border-radius:8px;padding:14px}
.tcard-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px}
.tcard-email{font-size:13px;color:var(--text-primary);word-break:break-all;line-height:1.35}
.tcard-grid{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;font-size:11px;margin-bottom:12px}
.tcard-k{color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.4px}
.tcard-v{font-family:JetBrains Mono,monospace;color:var(--text-secondary)}
.tcard-actions{display:flex;gap:10px;font-size:11px;padding-top:10px;border-top:1px solid var(--border-glass)}

/* --- sparkline --- */
.spark-wrap{margin-top:4px}
.spark-head{display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:10px;gap:8px;flex-wrap:wrap}
.spark{display:flex;align-items:flex-end;gap:2px;height:72px;padding:0 2px}
.spark-bar{flex:1 1 0;min-width:2px;background:linear-gradient(180deg,var(--accent-cyan),var(--accent-cyan-deep));border-radius:2px 2px 0 0;opacity:.75;transition:opacity .2s;min-height:1px}
.spark-bar:hover{opacity:1}
.spark-bar[data-zero="1"]{background:var(--border-glass);opacity:.5}

/* --- activity visualiser --- */
.act-legend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;font-size:11px;color:var(--text-muted)}
.act-legend span{display:flex;align-items:center;gap:6px}
.act-legend i{width:8px;height:8px;border-radius:50%;display:inline-block}
.act-canvas{position:relative;height:220px;overflow:hidden;border-radius:8px;background:rgba(8,13,24,.34);border:1px solid var(--border-glass)}
.act-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted)}
.act-svg{position:absolute;inset:0;width:100%;height:100%}
.act-node{position:absolute;transform:translate(-50%,-50%);cursor:default}
.act-dot{border-radius:50%;box-shadow:0 0 10px currentColor}
.act-tip{position:absolute;left:50%;transform:translate(-50%,-140%);white-space:nowrap;background:rgba(8,13,24,.96);border:1px solid var(--border-glass);border-radius:4px;padding:4px 8px;font-size:10px;font-family:JetBrains Mono,monospace;color:var(--text-primary);opacity:0;pointer-events:none;transition:opacity .15s;z-index:5}
.act-node:hover .act-tip{opacity:1}

@media(max-width:640px){
  body{padding:8px}
  .stat-card{flex:1 1 80px;min-width:70px;padding:12px}
  .stat-card .num{font-size:20px}
  .stat-card .label{font-size:10px}
  td,th{padding:6px 4px;font-size:10px}
  td.email{max-width:80px}
  .panel-body{padding:12px}
  .card-grid{grid-template-columns:1fr}
  .spark{height:56px}
}
</style>
</head>
<body>
<div class="hidden-msg" aria-hidden="true" style="display:none">If you are here, you know we can see you — so why need to do this? Just contact us if you need these for free.</div>
<div id="app">
<div id="login">
<div class="login-box">
<h1 style="margin-bottom:16px">Admin Login</h1>
<p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Enter the master passkey to access the token dashboard.</p>
  <input type="password" id="admin-passkey" placeholder="Master passkey" autocomplete="off">
  <button class="btn" onclick="login()">Sign In</button>
</div>
</div>
<div id="dashboard" style="display:none">
<div class="topbar"><div><h1>Token Dashboard</h1><div class="sub">dgui-hmem.deckergui.my</div></div><div style="text-align:right"><a class="logout" onclick="document.getElementById('dashboard').style.display='none';document.getElementById('login').style.display='block'" style="color:var(--text-muted);font-size:13px;cursor:pointer;display:block">Logout</a><a href="/privacy" class="privacy-link" style="margin-top:4px;display:inline-block;font-size:12px;color:var(--text-muted)">Privacy</a></div></div>
<div class="stats" id="stats-row"></div>

<!-- View toggle. Persisted so the operator does not re-pick every reload. -->
<div class="view-toggle" role="group" aria-label="Token view">
<button class="vt-btn" id="vt-grid" onclick="setView('grid')" aria-pressed="true" title="Grid view"><i class="fas fa-th"></i> Grid</button>
<button class="vt-btn" id="vt-list" onclick="setView('list')" aria-pressed="false" title="List view"><i class="fas fa-list"></i> List</button>
</div>

<!--
  Panels. The system panel (DGUI-HyperMem core) is gated behind five taps on its
  header with no visible affordance, per operator request. This is a UI
  convenience gate, NOT a security boundary: every endpoint behind it is already
  adminGate()-authorised server-side, and the visit sparkline reads only aggregate
  counts. Tapping is counted on the header element and the counter resets after a
  20s idle window so an accidental burst does not leave it permanently armed.
-->
<div class="panel" id="panel-system" hidden>
<div class="panel-head" onclick="tapSystem()">
<div class="panel-title"><i class="fas fa-memory"></i> DGUI-HyperMem Core</div>
<div class="panel-meta"><span id="sys-visits-today">-</span> today &middot; <span id="sys-visits-total">-</span> all time</div>
</div>
<div class="panel-body">
<div class="spark-wrap"><div class="spark-head"><span>Page visits &mdash; last 30 days</span><span id="spark-sum"></span></div><div class="spark" id="visit-spark"></div></div>
</div>
</div>

<div class="panel" id="panel-tokens">
<div class="panel-head static"><div class="panel-title"><i class="fas fa-users"></i> Tokens by plan</div><div class="panel-meta" id="plan-summary"></div></div>
<div class="panel-body">
<div class="table-wrap" id="table-wrap"><table><thead><tr><th>Email</th><th>Plan</th><th>Status</th><th>MCP</th><th>T&amp;C</th><th>Token</th><th>Quota</th><th>Train</th><th>Created</th><th>Action</th></tr></thead><tbody id="token-rows"></tbody></table></div>
<div class="card-grid" id="card-grid"></div>
</div>
</div>

<!-- Activity visualiser: dot-and-connector graph of memory activity, fed by /api/admin/activity. -->
<div class="panel" id="panel-activity">
<div class="panel-head static"><div class="panel-title"><i class="fas fa-project-diagram"></i> Memory activity</div><div class="panel-meta" id="activity-summary"></div></div>
<div class="panel-body">
<div class="act-legend" id="act-legend"></div>
<div class="act-canvas" id="act-canvas"><div class="act-empty">No memory activity recorded in the last 7 days.</div></div>
</div>
</div>
<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border-glass);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
<div style="font-size:13px;color:var(--text-muted)"><i class="fas fa-clock"></i> <span id="clock-status">--</span></div>
<div style="display:flex;gap:8px">
<button class="btn" id="btn-clock-in" onclick="clockIn()" style="width:auto;padding:8px 16px;font-size:12px"><i class="fas fa-sign-in-alt"></i> Clock In</button>
<button class="btn" id="btn-clock-out" onclick="clockOut()" style="width:auto;padding:8px 16px;font-size:12px;background:rgba(248,113,113,1);display:none"><i class="fas fa-sign-out-alt"></i> Clock Out</button>
</div>
</div>
</div>
</div>
<script>
let cp='';
let adminSession='';
let clockState=null;

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

async function clockIn(){
  if(!cp && !adminSession) return;
  const r=await fetch('/api/admin/clock',{method:'POST',headers:getApiHeaders(),body:JSON.stringify({action:'in',passkey:cp,session:adminSession})});
  const d=await r.json();
  if(d.error){ alert(d.error); return; }
  clockState='in';
  updateClockUI(d.at);
}
async function clockOut(){
  if(!cp && !adminSession) return;
  const r=await fetch('/api/admin/clock',{method:'POST',headers:getApiHeaders(),body:JSON.stringify({action:'out',passkey:cp,session:adminSession})});
  const d=await r.json();
  if(d.error){ alert(d.error); return; }
  clockState='out';
  updateClockUI(null,d.duration_minutes);
}
function updateClockUI(at,duration){
  const st=document.getElementById('clock-status');
  if(clockState==='in'){
    const d2=new Date(at);
    st.innerHTML='Clocked in at <strong>'+d2.toLocaleTimeString()+'</strong>';
    document.getElementById('btn-clock-in').style.display='none';
    document.getElementById('btn-clock-out').style.display='inline-block';
  }else{
    st.innerHTML='Last session: <strong>'+(duration||0)+' min</strong>';
    document.getElementById('btn-clock-in').style.display='inline-block';
    document.getElementById('btn-clock-out').style.display='none';
  }
}
async function login(){
  cp=document.getElementById('admin-passkey').value;
  if(!cp) return alert('Enter master passkey');
  try{
    const lr = await fetch('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({passkey:cp})});
    const ld = await lr.json();
    if(ld.error){ return alert('Unauthorized'); }

    if(ld.session) adminSession = ld.session;
    else adminSession = '';
    // Load dashboard
    const r1=await fetch('/api/admin/tokens', {headers:getApiHeaders({})});
    const d1=await r1.json();
    if(d1.error){ return alert('Unauthorized'); }
    render(d1.tokens);
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
    document.getElementById('dashboard').style.display='block';
  }catch(e){alert('Error: '+e.message)}
}
function planName(t){return t.plan||'free'}
function tcDisplay(t){
  const ok=t.tc_agreed===1||t.tc_agreed===true;
  return '<span style="color:'+(ok?'#4ade80':'#f87171')+'">'+(ok?'✓':'✗')+'</span>';
}
function trainBtn(t){
  const on=t.train_with_all===1||t.train_with_all===true;
  return '<button class="toggle'+(on?' on':' off')+'" onclick="toggleTrain(\\''+esc(t.email)+'\\','+(on?'0':'1')+')">'+(on?'ON':'OFF')+'</button>';
}
function quotaDisplay(t){
  const used=t.requests_used||0, max=t.quota_monthly||1000;
  const pct=Math.min(100,Math.round(used/max*100));
  const color=pct>=90?'#f87171':pct>=70?'#fbbf24':'#4ade80';
  return {html:'<span style="color:'+color+'">'+used+'/'+max+'</span>', pct:color};
}
// Revoke and Quota are actions, not navigation, so they are buttons rather than
// <a href="#">. An anchor with an empty target still navigates: clicking it
// leaves a bare "#" in the address bar on a page that has no fragment routing,
// and it advertises a link to a screen reader where there is none. Buttons get
// the same look inline, with no layout change.
const LINK_BTN = 'background:none;border:0;padding:0;color:var(--accent-cyan);font:inherit;font-size:11px;cursor:pointer;text-decoration:underline';
function actionsHtml(t){
  if(t.status!=='active') return '';
  return '<button type="button" style="'+LINK_BTN+'" onclick="revoke(\\''+esc(t.email)+'\\')">Revoke</button>' +
         '<button type="button" style="'+LINK_BTN+';margin-left:6px" onclick="editQuota(\\''+esc(t.email)+'\\','+t.quota_monthly+',\\''+esc(t.plan||'free')+'\\')">Quota</button>';
}
const PLAN_COLORS={free:'#7d8187',median:'#00f0ff',pro:'#f59e0b',enterprise:'#ec4899'};
function planDisplay(t){
  const n=planName(t);
  return '<span style="color:'+(PLAN_COLORS[n]||'#7d8187')+';font-size:10px;text-transform:capitalize">'+esc(n)+'</span>';
}
function connectedDisplay(t){
  return t.has_connected?'<span class="badge online"></span>Yes':'<span class="badge offline"></span>No';
}

function render(tokens){
  // Shared escape hatch: row HTML and card HTML both interpolate the same
  // caller-controlled strings, so both go through esc() at the point of use.
  document.getElementById('token-rows').innerHTML=tokens.map(t=>{
    const date=new Date(t.created_at).toLocaleDateString()+' '+new Date(t.created_at).toLocaleTimeString();
    const q=quotaDisplay(t);
    return '<tr><td class="email" title="'+esc(t.email)+'">'+esc(t.email)+'</td><td>'+planDisplay(t)+'</td>'
      +'<td><span class="status '+esc(t.status)+'">'+esc(t.status)+'</span></td>'
      +'<td style="font-size:11px">'+connectedDisplay(t)+'</td>'
      +'<td style="font-size:11px">'+tcDisplay(t)+'</td>'
      +'<td style="max-width:80px;overflow:hidden;text-overflow:ellipsis">'+(t.token?esc(t.token.substring(0,8))+'...':'-')+'</td>'
      +'<td>'+q.html+'</td><td>'+trainBtn(t)+'</td>'
      +'<td style="font-size:10px">'+date+'</td><td>'+actionsHtml(t)+'</td></tr>';
  }).join('');

  document.getElementById('card-grid').innerHTML=tokens.map(t=>{
    const date=new Date(t.created_at).toLocaleDateString();
    const q=quotaDisplay(t);
    return '<div class="tcard">'
      +'<div class="tcard-top"><div class="tcard-email">'+esc(t.email)+'</div><span class="status '+esc(t.status)+'">'+esc(t.status)+'</span></div>'
      +'<div class="tcard-grid">'
        +'<div class="tcard-k">Plan</div><div class="tcard-v">'+planDisplay(t)+'</div>'
        +'<div class="tcard-k">Quota</div><div class="tcard-v">'+q.html+'</div>'
        +'<div class="tcard-k">MCP</div><div class="tcard-v" style="font-size:11px">'+connectedDisplay(t)+'</div>'
        +'<div class="tcard-k">T&amp;C</div><div class="tcard-v">'+tcDisplay(t)+'</div>'
        +'<div class="tcard-k">Train</div><div class="tcard-v">'+trainBtn(t)+'</div>'
        +'<div class="tcard-k">Token</div><div class="tcard-v">'+(t.token?esc(t.token.substring(0,8))+'...':'-')+'</div>'
        +'<div class="tcard-k">Created</div><div class="tcard-v">'+date+'</div>'
      +'</div>'
      +'<div class="tcard-actions">'+actionsHtml(t)+'</div>'
      +'</div>';
  }).join('');
}

/* --- grid / list toggle --- */
function setView(v){
  document.body.dataset.view=v;
  document.getElementById('vt-grid').setAttribute('aria-pressed', String(v==='grid'));
  document.getElementById('vt-list').setAttribute('aria-pressed', String(v==='list'));
  try{localStorage.setItem('dgui-admin-view',v)}catch(e){}
}
// Default to grid. localStorage can throw in private mode, so the default stands.
try{
  var savedView=localStorage.getItem('dgui-admin-view');
  if(savedView==='list'||savedView==='grid') document.body.dataset.view=savedView;
  else document.body.dataset.view='grid';
}catch(e){document.body.dataset.view='grid'}
(function(){
  var v=document.body.dataset.view;
  var g=document.getElementById('vt-grid'), l=document.getElementById('vt-list');
  if(g) g.setAttribute('aria-pressed',String(v==='grid'));
  if(l) l.setAttribute('aria-pressed',String(v==='list'));
})();

/* --- five-tap gate for the system panel ---
   UI convenience only. The data behind it is already adminGate()-protected and is
   aggregate-only, so this gates attention, not access. */
var sysTaps=0, sysTimer=null;
function tapSystem(){
  sysTaps++;
  clearTimeout(sysTimer);
  // Idle window: five deliberate taps, not five stray ones.
  sysTimer=setTimeout(function(){sysTaps=0},20000);
  if(sysTaps>=5){
    sysTaps=0;
    var p=document.getElementById('panel-system');
    p.hidden=!p.hidden;
    if(!p.hidden) loadVisits();
  }
}

/* --- page-visit sparkline --- */
async function loadVisits(){
  var box=document.getElementById('visit-spark');
  try{
    var r=await fetch('/api/admin/visits',{headers:getApiHeaders({})});
    var d=await r.json();
    if(d.error) return;
    document.getElementById('sys-visits-today').textContent=d.today;
    document.getElementById('sys-visits-total').textContent=d.total;
    document.getElementById('spark-sum').textContent='last 30d: '+d.last_30;
    var days=d.days||[];
    // The server always emits a dense 30-day series, so this is unreachable in
    // practice. Draw the same kind of explanation the activity panel does rather
    // than leaving a silent blank chart if the response shape ever changes.
    if(!days.length){
      box.innerHTML='<div class="act-empty">No visit data yet.</div>';
      return;
    }
    var peak=Math.max.apply(null,days.map(function(x){return x.count}).concat([1]));
    box.innerHTML=days.map(function(x){
      var h=Math.max(1,Math.round(x.count/peak*72));
      var title=x.day+' - '+x.count+' visit'+(x.count===1?'':'s');
      return '<div class="spark-bar" data-zero="'+(x.count?0:1)+'" style="height:'+h+'px" title="'+title+'"></div>';
    }).join('');
  }catch(e){/* fail open: the panel just shows nothing */}
}

/* --- activity dot-and-connector visualiser --- */
const ACT_COLORS={add:'#4ade80',update:'#22c7dc',supersede:'#f59e0b',forget:'#f87171',search:'#a78bfa'};
async function loadActivity(){
  var canvas=document.getElementById('act-canvas');
  try{
    var r=await fetch('/api/admin/activity?limit=60',{headers:getApiHeaders({})});
    var d=await r.json();
    if(d.error) return;
    var nodes=d.nodes||[];
    var counts=d.counts||{};
    document.getElementById('activity-summary').textContent=
      Object.keys(counts).map(function(k){return k+' '+counts[k]}).join(' · ')||'none';
    document.getElementById('act-legend').innerHTML=Object.keys(ACT_COLORS).map(function(k){
      return '<span><i style="background:'+ACT_COLORS[k]+'"></i>'+k+(counts[k]?' ('+counts[k]+')':'')+'</span>';
    }).join('');
    if(!nodes.length){
      canvas.innerHTML='<div class="act-empty">No memory activity recorded in the last 7 days.</div>';
      return;
    }
    var W=canvas.clientWidth||600, H=canvas.clientHeight||220;
    // Oldest left -> newest right, so the connectors read as a timeline.
    var ordered=nodes.slice().reverse();
    var t0=ordered[0].at, t1=ordered[ordered.length-1].at||t0+1;
    var span=Math.max(t1-t0,1);
    var pts=ordered.map(function(n){
      var x=24+((n.at-t0)/span)*(W-48);
      // search events carry a result count; stack them on a sine so overlapping
      // dots at the same instant stay individually visible.
      var jitter=n.results?Math.sin((n.at%997)/997*Math.PI*2)*34:0;
      var y=H/2+jitter;
      return {n:n,x:x,y:y};
    });
    var svg='<svg class="act-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';
    for(var i=1;i<pts.length;i++){
      var a=pts[i-1],b=pts[i];
      var stroke=(ACT_COLORS[b.n.kind]||'#22c7dc');
      svg+='<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" stroke="'+stroke+'" stroke-width="1" opacity=".35"/>';
    }
    svg+='</svg>';
    var html=svg;
    pts.forEach(function(p){
      var color=ACT_COLORS[p.n.kind]||'#22c7dc';
      var size=p.n.results?10+Math.min(10,p.n.results):8;
      var when=new Date(p.n.at).toLocaleString();
      var tip=p.n.kind+' · '+when+(p.n.results?' · '+p.n.results+' results':'');
      html+='<div class="act-node" style="left:'+p.x+'px;top:'+p.y+'px">'
        +'<div class="act-dot" style="width:'+size+'px;height:'+size+'px;background:'+color+';color:'+color+'"></div>'
        +'<div class="act-tip">'+esc(tip)+'</div></div>';
    });
    canvas.innerHTML=html;
  }catch(e){canvas.innerHTML='<div class="act-empty">Activity unavailable.</div>'}
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
function esc(s){return s.replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
</script>
</body>
</html>`;