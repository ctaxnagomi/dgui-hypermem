export const LANDING_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>DGUI-HyperMem — Hybrid Memory MCP Server</title>
<!-- Brain SVG Favicon -->
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3Cpath d='M35 42c-2 0-4 2-4 4s2 4 4 4 4-2 4-4-2-4-4-4zM65 42c-2 0-4 2-4 4s2 4 4 4 4-2 4-4-2-4-4-4z' fill='%2300f0ff'/%3E%3Cpath d='M42 55c0 0 3 4 8 4s8-4 8-4' fill='none' stroke='%2300f0ff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="icon" type="image/png" sizes="48x48" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3Cpath d='M35 42c-2 0-4 2-4 4s2 4 4 4 4-2 4-4-2-4-4-4zM65 42c-2 0-4 2-4 4s2 4 4 4 4-2 4-4-2-4-4-4z' fill='%2300f0ff'/%3E%3Cpath d='M42 55c0 0 3 4 8 4s8-4 8-4' fill='none' stroke='%2300f0ff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="icon" type="image/png" sizes="192x192" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="DGUI-HyperMem">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0a0a0a">
<meta name="application-name" content="DGUI-HyperMem">
<meta name="msapplication-TileColor" content="#0a0a0a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--accent-cyan:#00f0ff;--accent:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187;--border-glass:#212327;--border-accent:rgba(255,255,255,0.25)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;width:100%;background:var(--bg-primary);font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-weight:400;color:var(--accent);-webkit-font-smoothing:antialiased;overflow-x:hidden}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border-glass);border-radius:10px}
nav{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border-glass)}
.hero{padding:120px 24px 60px;text-align:center}
.hero .caption-mono{font-family:JetBrains Mono,ui-monospace,monospace;font-size:14px;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent-cyan);margin-bottom:24px}
.hero h1{font-size:72px;line-height:72px;font-weight:300;letter-spacing:-1.8px;margin-bottom:24px}
.hero p{font-size:18px;line-height:28px;color:var(--text-secondary);max-width:640px;margin:0 auto 48px}
.btn-primary{background:var(--accent);color:#0a0a0a;border:none;border-radius:9999px;padding:10px 24px;font-size:15px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.btn-outline{background:transparent;color:var(--accent);border:1px solid var(--border-accent);border-radius:9999px;padding:10px 24px;font-size:15px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
.hero-actions{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:32px}
.section-header{text-align:center;margin-bottom:16px;padding:60px 24px 0}
.section-header .caption-mono{font-family:JetBrains Mono,ui-monospace,monospace;font-size:14px;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent-cyan);margin-bottom:12px}
.section-header h2{font-size:48px;line-height:48px;font-weight:300;letter-spacing:-1.2px;margin-bottom:12px}
.section-header p{font-size:16px;color:var(--text-secondary);max-width:560px;margin:0 auto}
.arch-section{padding:30px 24px 60px}
.arch-wrapper{display:flex;justify-content:center;overflow-x:auto;margin-top:32px}
.dash-anim{animation:dash 1.2s linear infinite}@keyframes dash{to{stroke-dashoffset:-24}}
.carousel-section{padding:30px 24px}
.carousel-wrap{overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.carousel-track{display:flex;gap:12px;width:max-content;animation:scroll 40s linear infinite}
.carousel-track:hover{animation-play-state:paused}
@keyframes scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.wallet-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:170px;padding:20px 16px;background:rgba(255,255,255,0.05);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;cursor:pointer;transition:transform .25s;user-select:none}
.wallet-card:hover{transform:scale(1.06);background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.2)}
.crm-section{padding:30px 24px 60px}
.crm-card{max-width:520px;margin:24px auto;padding:32px;border:1px solid var(--border-glass);border-radius:12px;background:var(--bg-surface)}
.crm-card input{width:100%;padding:12px 16px;margin-bottom:12px;background:var(--bg-primary);border:1px solid var(--border-glass);border-radius:8px;color:var(--accent);font-family:Inter,sans-serif;font-size:14px;outline:none;transition:border-color .2s}
.crm-card input:focus{border-color:var(--accent-cyan)}
.crm-card .btn-primary{width:100%;margin-top:4px}
.status-line{padding:12px 16px;background:var(--bg-primary);border:1px solid var(--border-glass);border-radius:8px;font-size:14px;color:var(--text-secondary);margin-bottom:16px;font-family:JetBrains Mono,monospace}
.token-display{display:block;padding:16px;background:var(--bg-primary);border:1px solid var(--accent-cyan);border-radius:8px;font-family:JetBrains Mono,monospace;font-size:13px;color:var(--accent-cyan);word-break:break-all;margin-bottom:16px}
footer{border-top:1px solid var(--border-glass);padding:48px 24px;text-align:center;margin-top:60px}
footer p{font-size:14px;color:var(--text-muted)}footer a{color:var(--accent-cyan);text-decoration:none}
@media(max-width:768px){.hero h1{font-size:40px;line-height:44px}.section-header h2{font-size:32px;line-height:36px}}
</style>
</head>
<body>
<nav><span style="font-weight:500;font-size:16px">DECKER GUI</span>
<div style="display:flex;gap:24px;align-items:center">
<a href="#arch" style="color:var(--text-muted);text-decoration:none;font-size:14px">Architecture</a>
<a href="#crm" style="color:var(--text-muted);text-decoration:none;font-size:14px">Get Token</a>
<a href="https://github.com/ctaxnagomi/dgui-hypermem" target="_blank" style="color:var(--accent);border:1px solid var(--border-accent);border-radius:9999px;padding:8px 20px;font-size:14px;text-decoration:none"><i class="fab fa-github"></i> GitHub</a>
</div></nav>
<section class="hero">
<div class="caption-mono"><i class="fas fa-brain"></i> DGUI-HYPERMEM</div>
<h1>Memory that<br>remembers right.</h1>
<p>A self-hosted hybrid memory MCP server for AI agents — fusing vector search, full-text search, and a JEV reasoning layer that curates every memory.</p>
<div class="hero-actions">
<a href="#crm" class="btn-primary"><i class="fas fa-key"></i> Get Token</a>
<a href="https://github.com/ctaxnagomi/dgui-hypermem" class="btn-outline"><i class="fab fa-github"></i> GitHub</a>
</div>
</section>
<section id="arch" class="arch-section">
<div class="section-header"><div class="caption-mono"><i class="fas fa-sitemap"></i> Architecture</div><h2>How it works.</h2></div>
<div class="arch-wrapper">
<svg viewBox="0 0 780 500" xmlns="http://www.w3.org/2000/svg">
<rect x="290" y="5" width="200" height="55" rx="12" stroke="#00f0ff" stroke-width="2" fill="none" transform="rotate(-0.5 390 32)"/>
<text x="390" y="40" text-anchor="middle" fill="#fff" font-family="JetBrains Mono,monospace" font-size="13">MCP Client</text>
<line x1="390" y1="60" x2="390" y2="95" stroke="#00f0ff" stroke-width="2" stroke-dasharray="6 4" class="dash-anim"/>
<rect x="270" y="95" width="240" height="55" rx="12" stroke="#00f0ff" stroke-width="2" fill="none" transform="rotate(0.3 390 122)"/>
<text x="390" y="130" text-anchor="middle" fill="#fff" font-family="JetBrains Mono,monospace" font-size="12">dguihymem.deckergui.my</text>
<line x1="390" y1="150" x2="390" y2="185" stroke="#00f0ff" stroke-width="2" stroke-dasharray="6 4" class="dash-anim"/>
<rect x="290" y="185" width="200" height="50" rx="12" stroke="#fff" stroke-width="2" fill="none" transform="rotate(-0.4 390 210)"/>
<text x="390" y="215" text-anchor="middle" fill="#fff" font-family="JetBrains Mono,monospace" font-size="11">JEV Layer (Choice/Noul/Score)</text>
<line x1="325" y1="235" x2="195" y2="290" stroke="#7d8187" stroke-width="2" stroke-dasharray="6 4" class="dash-anim"/>
<line x1="390" y1="235" x2="390" y2="290" stroke="#7d8187" stroke-width="2" stroke-dasharray="6 4" class="dash-anim"/>
<line x1="455" y1="235" x2="585" y2="290" stroke="#7d8187" stroke-width="2" stroke-dasharray="6 4" class="dash-anim"/>
<rect x="95" y="290" width="200" height="50" rx="12" stroke="#7d8187" stroke-width="1.5" fill="none" transform="rotate(0.5 195 315)"/>
<text x="195" y="320" text-anchor="middle" fill="#7d8187" font-family="JetBrains Mono,monospace" font-size="11">D1 (SQLite + FTS5)</text>
<rect x="290" y="290" width="200" height="50" rx="12" stroke="#7d8187" stroke-width="1.5" fill="none" transform="rotate(-0.3 390 315)"/>
<text x="390" y="320" text-anchor="middle" fill="#7d8187" font-family="JetBrains Mono,monospace" font-size="11">Vectorize (768d cosine)</text>
<rect x="485" y="290" width="200" height="50" rx="12" stroke="#7d8187" stroke-width="1.5" fill="none" transform="rotate(0.4 585 315)"/>
<text x="585" y="320" text-anchor="middle" fill="#7d8187" font-family="JetBrains Mono,monospace" font-size="11">Workers AI (fallback)</text>
<line x1="195" y1="340" x2="195" y2="375" stroke="#7d8187" stroke-width="1.5" class="dash-anim"/>
<line x1="390" y1="340" x2="390" y2="375" stroke="#7d8187" stroke-width="1.5" class="dash-anim"/>
<line x1="585" y1="340" x2="585" y2="375" stroke="#7d8187" stroke-width="1.5" class="dash-anim"/>
<line x1="195" y1="375" x2="585" y2="375" stroke="#7d8187" stroke-width="1" class="dash-anim"/>
<line x1="390" y1="375" x2="390" y2="405" stroke="#7d8187" stroke-width="1.5" class="dash-anim"/>
<rect x="285" y="405" width="210" height="40" rx="12" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.6" transform="rotate(-0.2 390 425)"/>
<text x="390" y="430" text-anchor="middle" fill="#fff" opacity="0.6" font-family="JetBrains Mono,monospace" font-size="11">jev_examples queue</text>
<line x1="390" y1="445" x2="390" y2="470" stroke="#00f0ff" stroke-width="1.5" class="dash-anim"/>
<rect x="265" y="470" width="250" height="40" rx="12" stroke="#00f0ff" stroke-width="2" fill="none" transform="rotate(0.4 390 490)"/>
<text x="390" y="495" text-anchor="middle" fill="#00f0ff" font-family="JetBrains Mono,monospace" font-size="12">🤗 DGUI_HYPERMEM-JEV</text>
<line x1="390" y1="510" x2="390" y2="520" stroke="#00f0ff" stroke-width="1.5" class="dash-anim"/>
</svg>
</div>
</section>
<section class="carousel-section">
<div class="section-header"><div class="caption-mono"><i class="fas fa-globe"></i> Ecosystem</div><h2>deckergui.my subdomains.</h2></div>
<div class="carousel-wrap"><div class="carousel-track" id="carousel-track"></div></div>
</section>
<section id="crm" class="crm-section">
<div class="section-header"><div class="caption-mono"><i class="fas fa-key"></i> Access</div><h2>Get your bearer token.</h2><p>Star the repo on GitHub, verify with passkey, get your token instantly.</p></div>
<div class="crm-card" id="crm-form">
<input type="email" id="crm-email" placeholder="Email" autocomplete="email">
<input type="text" id="crm-github" placeholder="GitHub username">
<input type="password" id="crm-passkey" placeholder="4-digit passkey" maxlength="4">
<button class="btn-primary" onclick="requestToken()"><i class="fas fa-paper-plane"></i> Request Token</button>
</div>
<div class="crm-card" id="crm-status" style="display:none">
<div class="status-line" id="crm-status-text">⏳ Processing...</div>
<div id="crm-star-prompt" style="display:none">
<div class="status-line" style="border-color:var(--accent-cyan);color:var(--accent-cyan)">⭐ Please star <a href="https://github.com/ctaxnagomi/dgui-hypermem" target="_blank" style="color:#fff">github.com/ctaxnagomi/dgui-hypermem</a> and try again.</div>
</div>
<div id="crm-token-result" style="display:none">
<div class="status-line" style="border-color:#4ade80;color:#4ade80">🎉 Token active!</div>
<p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Your token:</p>
<code class="token-display" id="crm-token-value"></code>
<p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">MCP config:</p>
<pre class="status-line" id="crm-config" style="white-space:pre;overflow-x:auto;font-size:12px;line-height:20px"></pre>
<button class="btn-outline" style="margin-top:16px;width:100%;text-align:center;display:block" onclick="disableToken()"><i class="fas fa-ban"></i> Disable Token</button>
</div>
</div>
</section>
<footer>
<div class="container" style="max-width:1200px;margin:0 auto;padding:0 24px">
<p>DGUI-HyperMem — a <a href="https://deckergui.my">DeckerGUI</a> project</p>
<p style="margin-top:8px">Jev / System One by <a href="https://typesafe.ai">TypeSafe AI</a></p>
<p style="margin-top:24px;font-size:12px"><a href="https://github.com/ctaxnagomi/dgui-hypermem">GitHub</a> · <a href="https://huggingface.co/datasets/ctaxnagomi/DGUI_HYPERMEM-JEV">HuggingFace</a> · <a href="https://github.com/ctaxnagomi/dgui-hypermem/blob/main/LICENSE">MIT</a></p>
</div>
</footer>
<script>
const SD=[{i:"🏠",d:"deckergui.my",u:"https://deckergui.my"},{i:"📊",d:"app.deckergui.my",u:"https://app.deckergui.my"},{i:"📚",d:"corpuslib-ui.deckergui.my",u:"https://corpuslib-ui.deckergui.my"},{i:"🧠",d:"dguihymem.deckergui.my",u:"https://dgui-hypermem.ctaxnagomi.workers.dev"},{i:"🔬",d:"ctecx.deckergui.my",u:"https://ctecx.deckergui.my"},{i:"🖥",d:"landing.deckergui.my",u:"https://landing.deckergui.my"}];
const t=document.getElementById('carousel-track');
t.innerHTML=SD.map(s=>'<div class="wallet-card" onclick="window.open(\\''+s.u+'\\',\\'_blank\\')"><div style="font-size:28px;margin-bottom:6px">'+s.i+'</div><div style="font-size:13px;font-family:JetBrains Mono,monospace;color:#fff">'+s.d+'</div></div>').join('')+SD.map(s=>'<div class="wallet-card" onclick="window.open(\\''+s.u+'\\',\\'_blank\\')"><div style="font-size:28px;margin-bottom:6px">'+s.i+'</div><div style="font-size:13px;font-family:JetBrains Mono,monospace;color:#fff">'+s.d+'</div></div>').join('');
let pt=null;
async function requestToken(){
  const e=document.getElementById('crm-email').value.trim(),g=document.getElementById('crm-github').value.trim(),p=document.getElementById('crm-passkey').value.trim();
  if(!e||!g||!p) return alert('All fields required');
  document.getElementById('crm-form').style.display='none';const st=document.getElementById('crm-status');st.style.display='block';
  const tx=document.getElementById('crm-status-text');tx.textContent='⏳ Verifying...';
  try{
    const r=await fetch('/api/request-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e,github_username:g,passkey:p})});
    const d=await r.json();
    if(d.error){tx.textContent='❌ '+d.error;document.getElementById('crm-form').style.display='block';return}
    if(d.has_token){showToken(e,d.token);return}
    if(d.status==='pending'){tx.textContent='✅ Passkey OK. Checking GitHub star...';document.getElementById('crm-star-prompt').style.display='block';
      pt=setInterval(async()=>{const r2=await fetch('/api/check-star',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e})});const d2=await r2.json();if(d2.starred&&d2.token){clearInterval(pt);showToken(e,d2.token)}},3000);}
  }catch(e){tx.textContent='❌ Error';document.getElementById('crm-form').style.display='block'}
}
function showToken(e,t){document.getElementById('crm-star-prompt').style.display='none';document.getElementById('crm-token-result').style.display='block';document.getElementById('crm-status-text').textContent='';document.getElementById('crm-token-value').textContent=t;document.getElementById('crm-config').textContent=JSON.stringify({mcp:{"dgui-hypermem":{type:"remote",url:"https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",enabled:true,headers:{Authorization:"Bearer "+t}}}},null,2);}
async function disableToken(){const e=document.getElementById('crm-email').value.trim(),p=prompt('Passkey to disable:');if(!p)return;const r=await fetch('/api/disable-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e,passkey:p})});const d=await r.json();if(d.error)return alert(d.error);alert('Disabled');location.reload();}
</script>
</body>
</html>`;