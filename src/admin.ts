export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DGUI-HyperMem Admin — Token Dashboard</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--border-glass:#212327;--accent-cyan:#00f0ff;--text-primary:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--text-primary)}
body{padding:24px}
h1{font-size:24px;font-weight:300;margin-bottom:4px}
.sub{color:var(--text-muted);font-size:14px;margin-bottom:24px}
.login-box{max-width:400px;margin:100px auto;padding:32px;background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:12px}
.login-box input{width:100%;padding:12px 16px;margin-bottom:12px;background:var(--bg-primary);border:1px solid var(--border-glass);border-radius:8px;color:var(--text-primary);font-family:Inter,sans-serif;font-size:14px;outline:none}
.login-box input:focus{border-color:var(--accent-cyan)}
.btn{background:var(--accent-cyan);color:#000;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;width:100%}.btn:hover{opacity:.9}
.stats{display:flex;gap:16px;margin-bottom:24px}
.stat-card{padding:16px;background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:8px;flex:1}
.stat-card .num{font-size:28px;font-weight:300;color:var(--accent-cyan)}
.stat-card .label{font-size:12px;color:var(--text-muted);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:12px 8px;border-bottom:1px solid var(--border-glass);color:var(--text-muted);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
td{padding:10px 8px;border-bottom:1px solid var(--border-glass);font-family:JetBrains Mono,monospace;font-size:12px;color:var(--text-secondary)}
td.email{font-family:Inter,sans-serif;font-size:13px}
.status{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500}
.status.active{background:rgba(74,222,128,.15);color:#4ade80}
.status.disabled{background:rgba(248,113,113,.15);color:#f87171}
.status.pending{background:rgba(251,191,36,.15);color:#fbbf24}
.toggle{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid var(--border-glass);background:transparent;color:var(--text-muted)}
.toggle.on{background:rgba(74,222,128,.15);color:#4ade80;border-color:#4ade80}
.toggle.off{background:rgba(248,113,113,.15);color:#f87171;border-color:#f87171}
a{color:var(--accent-cyan);text-decoration:none}
.badge{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.badge.online{background:#4ade80}
.badge.offline{background:var(--text-muted)}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.privacy-link{font-size:12px;color:var(--text-muted)}
.hidden-msg{display:none}
.alert-badge{display:inline-block;background:#f87171;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:6px;vertical-align:top}
</style>
</head>
<body>
<!-- Hidden DevTools message: If you are here, you know we can see you — so why need to do this? Just contact us if you need these for free. -->
<div class="hidden-msg" style="display:none" aria-hidden="true">If you are here, you know we can see you — so why need to do this? Just contact us if you need these for free.</div>
<div id="app">
<div id="login">
<div class="login-box">
<h1 style="margin-bottom:16px">Admin Login</h1>
<input type="password" id="admin-passkey" placeholder="Master passkey">
<button class="btn" onclick="login()">View Tokens</button>
</div>
</div>
<div id="dashboard" style="display:none">
<div class="topbar"><div><h1>Token Dashboard</h1><div class="sub">dgui-hypermem.ctaxnagomi.workers.dev</div></div><div style="text-align:right"><a class="logout" onclick="document.getElementById('dashboard').style.display='none';document.getElementById('login').style.display='block'" style="color:var(--text-muted);font-size:13px;cursor:pointer;display:block">Logout</a><a href="/privacy" class="privacy-link" style="margin-top:4px;display:inline-block">Privacy Policy</a></div></div>
<div class="stats"><div class="stat-card"><div class="num" id="stat-total">0</div><div class="label">Total / 100 Users</div></div><div class="stat-card"><div class="num" id="stat-active">0</div><div class="label">Active</div></div><div class="stat-card"><div class="num" id="stat-free">0</div><div class="label">Free</div></div><div class="stat-card"><div class="num" id="stat-median">0</div><div class="label">Median</div></div><div class="stat-card"><div class="num" id="stat-pro">0</div><div class="label">Pro</div></div><div class="stat-card"><div class="num" id="stat-ent">0</div><div class="label">Enterprise</div></div><div class="stat-card"><div class="num" id="stat-online">0</div><div class="label">Connected</div></div><div class="stat-card"><div class="num" id="stat-fails">0</div><div class="label">Login Fails (30d)</div></div></div>
<div style="overflow-x:auto"><table><thead><tr><th>Email</th><th>Plan</th><th>Status</th><th>MCP</th><th>T&C</th><th>Token</th><th>Quota</th><th>Train</th><th>Created</th><th>Action</th></tr></thead><tbody id="token-rows"></tbody></table></div>
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
      document.getElementById('stat-fails').textContent=d2.failed_logins_30d||0;
      if(d2.users_by_plan){
        document.getElementById('stat-free').textContent=d2.users_by_plan.free||0;
        document.getElementById('stat-median').textContent=d2.users_by_plan.median||0;
        document.getElementById('stat-pro').textContent=d2.users_by_plan.pro||0;
        document.getElementById('stat-ent').textContent=d2.users_by_plan.enterprise||0;
      }
    }
    document.getElementById('login').style.display='none';
    document.getElementById('dashboard').style.display='block';
  }catch(e){alert('Error: '+e.message)}
}
function render(tokens){
  const active=tokens.filter(t=>t.status==='active');
  const online=tokens.filter(t=>t.has_connected);
  document.getElementById('stat-total').textContent=tokens.length;
  document.getElementById('stat-active').textContent=active.length;
  if(document.getElementById('stat-disabled')) document.getElementById('stat-disabled').textContent=disabled.length;
  document.getElementById('stat-online').textContent=online.length;
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
    const actions=t.status==='active'?'<a href="#" onclick="revoke(\\''+esc(t.email)+'\\')" style="font-size:12px">Revoke</a>':'';
    const tcAgreed=t.tc_agreed===1||t.tc_agreed===true;
    const tcDisplay='<span style="color:'+(tcAgreed?'#4ade80':'#f87171')+'">'+(tcAgreed?'✓ Agreed':'✗ Pending')+'</span>';
    const planName=t.plan||'free';
    const planColors={free:'#7d8187',median:'#00f0ff',pro:'#f59e0b',enterprise:'#ec4899'};
    const planColor=planColors[planName]||'#7d8187';
    const planDisplay='<span style="color:'+planColor+';font-size:11px;text-transform:capitalize">'+planName+'</span>';
    return '<tr><td class="email">'+esc(t.email)+'</td><td>'+planDisplay+'</td><td><span class="status '+t.status+'">'+t.status+'</span></td><td style="font-size:12px">'+connected+'</td><td style="font-size:12px">'+tcDisplay+'</td><td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">'+(t.token?t.token.substring(0,12)+'...':'-')+'</td><td>'+quotaDisplay+'</td><td>'+trainBtn+'</td><td style="font-size:11px">'+date+'</td><td>'+actions+'</td></tr>';
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