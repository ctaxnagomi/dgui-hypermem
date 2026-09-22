export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>DGUI-HyperMem Admin — Token Dashboard</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8L92 34L50 58L8 34Z' fill='%2300f0ff' stroke='%2300f0ff' stroke-width='1'/%3E%3Cpath d='M50 30L92 56L50 80L8 56Z' fill='rgba(26,26,26,0.85)' stroke='%2300f0ff' stroke-width='1'/%3E%3Cpath d='M50 52L92 78L50 92L8 78Z' fill='%231a1a1a' stroke='%2300f0ff' stroke-width='1'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--border-glass:#212327;--accent-cyan:#00f0ff;--text-primary:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;width:100%;background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--text-primary);-webkit-overflow-scrolling:touch;overscroll-behavior:none;touch-action:manipulation;-webkit-text-size-adjust:100%}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
#app{width:100%;max-width:100%;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
h1{font-size:24px;font-weight:300;margin-bottom:4px}
.sub{color:var(--text-muted);font-size:14px;margin-bottom:24px}
.login-box{width:100%;max-width:400px;margin:0 auto;padding:32px;background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:12px;text-align:center}
.login-box input{width:100%;padding:14px 16px;margin-bottom:12px;background:var(--bg-primary);border:1px solid var(--border-glass);border-radius:8px;color:var(--text-primary);font-family:Inter,sans-serif;font-size:16px;outline:none}
.login-box input:focus{border-color:var(--accent-cyan)}
.btn{background:var(--accent-cyan);color:#000;border:none;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer;width:100%}.btn:hover{opacity:.9}
.stats{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.stat-card{padding:16px;background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:8px;flex:1 1 120px;min-width:100px}
.stat-card .num{font-size:26px;font-weight:300;color:var(--accent-cyan)}
.stat-card .label{font-size:11px;color:var(--text-muted);margin-top:4px;word-break:keep-all}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border-glass);border-radius:8px;margin-top:16px}
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
@media(max-width:640px){
  body{padding:8px}
  .stat-card{flex:1 1 80px;min-width:70px;padding:12px}
  .stat-card .num{font-size:20px}
  .stat-card .label{font-size:10px}
  td,th{padding:6px 4px;font-size:10px}
  td.email{max-width:80px}
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
<button class="btn" onclick="login()">View Tokens</button>
</div>
</div>
<div id="dashboard" style="display:none">
<div class="topbar"><div><h1>Token Dashboard</h1><div class="sub">dgui-hypermem.ctaxnagomi.workers.dev</div></div><div style="text-align:right"><a class="logout" onclick="document.getElementById('dashboard').style.display='none';document.getElementById('login').style.display='block'" style="color:var(--text-muted);font-size:13px;cursor:pointer;display:block">Logout</a><a href="/privacy" class="privacy-link" style="margin-top:4px;display:inline-block;font-size:12px;color:var(--text-muted)">Privacy</a></div></div>
<div class="stats" id="stats-row"></div>
<div class="table-wrap" id="table-wrap"><table><thead><tr><th>Email</th><th>Plan</th><th>Status</th><th>MCP</th><th>T&amp;C</th><th>Token</th><th>Quota</th><th>Train</th><th>Created</th><th>Action</th></tr></thead><tbody id="token-rows"></tbody></table></div>
</div>
</div>
<script>
let cp='';
async function login(){
  cp=document.getElementById('admin-passkey').value;
  if(!cp) return alert('Enter master passkey');
  try{
    const r1=await fetch('/api/admin/tokens?passkey='+encodeURIComponent(cp));
    const d1=await r1.json();
    if(d1.error) return alert('Unauthorized');
    render(d1.tokens);
    const r2=await fetch('/api/admin/stats?passkey='+encodeURIComponent(cp));
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
      }
    }
    document.getElementById('login').style.display='none';
    document.getElementById('dashboard').style.display='block';
  }catch(e){alert('Error: '+e.message)}
}
function render(tokens){
  document.getElementById('token-rows').innerHTML=tokens.map(t=>{
    const date=new Date(t.created_at).toLocaleDateString()+' '+new Date(t.created_at).toLocaleTimeString();
    const connected=t.has_connected?'<span class="badge online"></span>Yes':'<span class="badge offline"></span>No';
    const trainOn=t.train_with_all===1||t.train_with_all===true;
    const trainBtn='<button class="toggle'+(trainOn?' on':' off')+'" onclick="toggleTrain(\\''+esc(t.email)+'\\','+(trainOn?'0':'1')+')">'+(trainOn?'ON':'OFF')+'</button>';
    const quotaUsed=t.requests_used||0;
    const quotaMax=t.quota_monthly||1000;
    const quotaPct=Math.min(100,Math.round(quotaUsed/quotaMax*100));
    const quotaColor=quotaPct>=90?'#f87171':quotaPct>=70?'#fbbf24':'#4ade80';
    const quotaDisplay='<span style="color:'+quotaColor+'">'+quotaUsed+'/'+quotaMax+'</span>';
    const actions=t.status==='active'?'<a href="#" onclick="revoke(\\''+esc(t.email)+'\\')" style="font-size:11px">Revoke</a>':'';
    const tcAgreed=t.tc_agreed===1||t.tc_agreed===true;
    const tcDisplay='<span style="color:'+(tcAgreed?'#4ade80':'#f87171')+'">'+(tcAgreed?'✓':'✗')+'</span>';
    const planName=t.plan||'free';
    const planColors={free:'#7d8187',median:'#00f0ff',pro:'#f59e0b',enterprise:'#ec4899'};
    const planDisplay='<span style="color:'+(planColors[planName]||'#7d8187')+';font-size:10px;text-transform:capitalize">'+planName+'</span>';
    return '<tr><td class="email" title="'+esc(t.email)+'">'+esc(t.email)+'</td><td>'+planDisplay+'</td><td><span class="status '+t.status+'">'+t.status+'</span></td><td style="font-size:11px">'+connected+'</td><td style="font-size:11px">'+tcDisplay+'</td><td style="max-width:80px;overflow:hidden;text-overflow:ellipsis">'+(t.token?t.token.substring(0,8)+'...':'-')+'</td><td>'+quotaDisplay+'</td><td>'+trainBtn+'</td><td style="font-size:10px">'+date+'</td><td>'+actions+'</td></tr>';
  }).join('');
}
async function toggleTrain(email,val){
  if(!cp) return;
  const r=await fetch('/api/admin/toggle-train',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,passkey:cp,train_with_all:val})});
  const d=await r.json();
  if(d.error) return alert(d.error);
  await login();
}
async function revoke(email){
  if(!confirm('Revoke token for '+email+'?')) return;
  const r=await fetch('/api/disable-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,passkey:cp})});
  const d=await r.json();
  if(d.error) return alert(d.error);
  await login();
}
function esc(s){return s.replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
</script>
</body>
</html>`;