export const LANDING_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>DGUI-HyperMem — Hybrid Memory MCP Server</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<link rel="icon" type="image/png" sizes="48x48" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="DGUI-HyperMem">
<meta name="theme-color" content="#0a0a0a">
<meta name="application-name" content="DGUI-HyperMem">
<meta name="msapplication-TileColor" content="#0a0a0a">
<link rel="manifest" href="/manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--accent-cyan:#00f0ff;--accent:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187;--border-glass:#212327;--border-accent:rgba(255,255,255,0.25)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;width:100%;background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--accent);-webkit-font-smoothing:antialiased;overflow-x:hidden}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border-glass);border-radius:10px}
nav{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border-glass)}
.hero{padding:120px 24px 60px;text-align:center}
.hero .caption-mono{font-family:JetBrains Mono,monospace;font-size:14px;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent-cyan);margin-bottom:24px}
.hero h1{font-size:72px;line-height:72px;font-weight:300;letter-spacing:-1.8px;margin-bottom:24px}
.hero p{font-size:18px;line-height:28px;color:var(--text-secondary);max-width:640px;margin:0 auto 48px}
.btn-primary{background:var(--accent);color:#0a0a0a;border:none;border-radius:9999px;padding:10px 24px;font-size:15px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.btn-outline{background:transparent;color:var(--accent);border:1px solid var(--border-accent);border-radius:9999px;padding:10px 24px;font-size:15px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
.hero-actions{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:32px}
.section-header{text-align:center;margin-bottom:16px;padding:60px 24px 0}
.section-header .caption-mono{font-family:JetBrains Mono,monospace;font-size:14px;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent-cyan);margin-bottom:12px}
.section-header h2{font-size:48px;line-height:48px;font-weight:300;letter-spacing:-1.2px;margin-bottom:12px}
.section-header p{font-size:16px;color:var(--text-secondary);max-width:560px;margin:0 auto}
.arch-section{padding:30px 24px 60px}
.arch-wrapper{display:flex;justify-content:center;overflow-x:auto;margin-top:32px}
.dash-anim{animation:dash 1.2s linear infinite}@keyframes dash{to{stroke-dashoffset:-24}}
/* CRM */
.crm-section{padding:30px 24px 60px}
.crm-form-wrap{position:relative;min-height:360px}
.crm-card{max-width:520px;margin:24px auto;padding:32px;border:1px solid var(--border-glass);border-radius:12px;background:var(--bg-surface);transition:all .5s cubic-bezier(.16,1,.3,1)}
.crm-card input{width:100%;padding:12px 16px;margin-bottom:12px;background:var(--bg-primary);border:1px solid var(--border-glass);border-radius:8px;color:var(--accent);font-family:Inter,sans-serif;font-size:14px;outline:none;transition:border-color .2s}
.crm-card input:focus{border-color:var(--accent-cyan)}
.crm-card .btn-primary{width:100%;margin-top:8px}
.crm-card.phase-hidden{opacity:0;transform:translateY(30px) scale(.95);pointer-events:none;position:absolute;width:100%;max-width:520px;left:50%;margin-left:-260px}
.crm-card.phase-visible{opacity:1;transform:translateY(0) scale(1)}
.status-line{padding:12px 16px;background:var(--bg-primary);border:1px solid var(--border-glass);border-radius:8px;font-size:14px;color:var(--text-secondary);margin-bottom:16px;font-family:JetBrains Mono,monospace}
.token-display{display:block;padding:16px;background:var(--bg-primary);border:1px solid var(--accent-cyan);border-radius:8px;font-family:JetBrains Mono,monospace;font-size:13px;color:var(--accent-cyan);word-break:break-all;margin-bottom:16px}
/* Modal */
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .4s}
.modal-overlay.show{opacity:1;pointer-events:auto}
.modal-box{background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:12px;padding:32px;max-width:560px;width:90%;max-height:80vh;overflow-y:auto;transform:scale(.9);transition:transform .4s cubic-bezier(.16,1,.3,1)}
.modal-overlay.show .modal-box{transform:scale(1)}
.modal-box h2{font-size:20px;font-weight:500;margin-bottom:16px;color:var(--accent)}
.modal-box h3{font-size:14px;font-weight:500;margin:20px 0 8px;color:var(--accent)}
.modal-box p, .modal-box li{font-size:13px;line-height:1.6;color:var(--text-secondary);margin-bottom:6px}
.modal-box ul{padding-left:18px;margin:8px 0}
.modal-box label{display:flex;align-items:flex-start;gap:10px;margin:20px 0 24px;cursor:pointer;font-size:13px;color:var(--text-secondary);line-height:1.5}
.modal-box input[type=checkbox]{margin-top:3px;accent-color:var(--accent-cyan);width:16px;height:16px;flex-shrink:0}
/* Footer */
footer{border-top:1px solid var(--border-glass);padding:48px 24px;text-align:center;margin-top:60px}
footer p{font-size:14px;color:var(--text-muted)}footer a{color:var(--accent-cyan);text-decoration:none}
.footer-links{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin:16px 0}
.footer-links a{font-size:12px;color:var(--text-muted);text-decoration:none;transition:color .2s}
.footer-links a:hover{color:var(--accent-cyan)}
/* Pricing */
.pricing-section{padding:30px 24px 60px}
.pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;max-width:1000px;margin:32px auto 0;padding:0 24px}
.pricing-card{background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:12px;padding:32px;transition:border-color .2s;display:flex;flex-direction:column}
.pricing-card:hover{border-color:var(--border-accent)}
.pricing-card.featured{border-color:var(--accent-cyan)}
.pricing-card .plan-name{font-size:14px;font-weight:600;margin-bottom:4px;color:var(--accent-cyan);text-transform:uppercase;letter-spacing:1px}
.pricing-card .price{font-size:36px;font-weight:300;color:var(--accent);margin:12px 0;letter-spacing:-1px}
.pricing-card .price span{font-size:16px;color:var(--text-muted);font-weight:400}
.pricing-card .desc{font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.5;flex:1}
.pricing-card .features{list-style:none;padding:0;margin:0 0 24px}
.pricing-card .features li{font-size:13px;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.pricing-card .features li i{color:var(--accent-cyan);width:16px}
/* Enterprise form */
.enterprise-section{padding:30px 24px 60px}
.enterprise-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:900px;margin:32px auto 0;padding:0 24px}
.enterprise-info p{font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px}
.enterprise-form input,.enterprise-form textarea{width:100%;padding:12px 16px;margin-bottom:12px;background:var(--bg-primary);border:1px solid var(--border-glass);border-radius:8px;color:var(--accent);font-family:Inter,sans-serif;font-size:14px;outline:none;transition:border-color .2s}
.enterprise-form input:focus,.enterprise-form textarea:focus{border-color:var(--accent-cyan)}
.enterprise-form textarea{min-height:100px;resize:vertical}
@media(max-width:768px){
  .hero h1{font-size:36px;line-height:40px;letter-spacing:-.5px}
  .hero p{font-size:15px;line-height:24px}
  .section-header h2{font-size:28px;line-height:32px}
  .section-header p{font-size:14px}
  .crm-card.phase-hidden{left:0;margin-left:0}
  nav .nav-links a:not(.btn-accent){display:none}
  .pricing-grid{padding:0 12px}
  .enterprise-grid{grid-template-columns:1fr;padding:0 12px}
  .features-grid{padding:0 12px}
  .arch-wrapper svg{width:100%;height:auto}
  .token-display{font-size:11px;word-break:break-all}
  .config-block{font-size:10px}
}
</style>
</head>
<body>
<nav><span style="font-weight:500;font-size:16px">DECKER GUI</span>
<div style="display:flex;gap:24px;align-items:center">
<a href="#arch" style="color:var(--text-muted);text-decoration:none;font-size:14px">Architecture</a>
<a href="#pricing" style="color:var(--text-muted);text-decoration:none;font-size:14px">Plans</a>
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
<svg viewBox="0 0 780 540" xmlns="http://www.w3.org/2000/svg">
<rect x="290" y="5" width="200" height="55" rx="12" stroke="#00f0ff" stroke-width="2" fill="none" transform="rotate(-0.5 390 32)"/>
<text x="390" y="40" text-anchor="middle" fill="#fff" font-family="JetBrains Mono,monospace" font-size="13">MCP Client</text>
<line x1="390" y1="60" x2="390" y2="95" stroke="#00f0ff" stroke-width="2" stroke-dasharray="6 4" class="dash-anim"/>
<rect x="270" y="95" width="240" height="55" rx="12" stroke="#00f0ff" stroke-width="2" fill="none" transform="rotate(0.3 390 122)"/>
<text x="390" y="130" text-anchor="middle" fill="#fff" font-family="JetBrains Mono,monospace" font-size="12">dgui-hypermem.workers.dev</text>
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
<line x1="390" y1="510" x2="390" y2="530" stroke="#00f0ff" stroke-width="1.5" class="dash-anim"/>
</svg>
</div>
</section>
<section id="crm" class="crm-section">
<div class="section-header"><div class="caption-mono"><i class="fas fa-key"></i> Access</div><h2>Get your bearer token.</h2><p>Enter your email and passkey to claim one token per email.</p></div>
<div class="crm-form-wrap">
<div class="crm-card phase-visible" id="crm-phase-start">
<p style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6">Before you can get a token, you must agree to the <strong>Terms &amp; Agreement</strong> and <strong>Privacy Policy</strong>.</p>
<button class="btn-primary" onclick="showTerms()"><i class="fas fa-file-contract"></i> Review &amp; Agree</button>
</div>
<div class="crm-card phase-hidden" id="crm-form">
<input type="email" id="crm-email" placeholder="Email" autocomplete="email">
<input type="password" id="crm-passkey" placeholder="Passkey" maxlength="20" autocomplete="off">
<button class="btn-primary" onclick="requestToken()"><i class="fas fa-paper-plane"></i> Get Token</button>
</div>
<div class="crm-card phase-hidden" id="crm-status">
<div class="status-line" id="crm-status-text">⏳ Issuing token...</div>
<div id="crm-token-result" style="display:none">
<div class="status-line" style="border-color:#4ade80;color:#4ade80">🎉 Token ready!</div>
<p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Your token:</p>
<code class="token-display" id="crm-token-value"></code>
<p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">MCP config:</p>
<pre class="status-line" id="crm-config" style="white-space:pre;overflow-x:auto;font-size:12px;line-height:20px"></pre>
<button class="btn-outline" style="margin-top:16px;width:100%;text-align:center;display:block" onclick="disableToken()"><i class="fas fa-ban"></i> Revoke Token</button>
</div>
</div>
</div>
</section>
<section class="pricing-section" id="pricing">
<div class="section-header"><div class="caption-mono"><i class="fas fa-tags"></i> Plans</div><h2>Choose your plan.</h2></div>
<div class="pricing-grid">
<div class="pricing-card">
<div class="plan-name"><i class="fas fa-leaf"></i> Free</div>
<div class="price">$0 <span>/ month</span></div>
<div class="desc">For individuals and hobbyists getting started with AI agent memory.</div>
<ul class="features">
<li><i class="fas fa-check"></i> 1 token per email</li>
<li><i class="fas fa-check"></i> 1,000 requests / month</li>
<li><i class="fas fa-check"></i> MCP tools: add, search, list, profile, forget</li>
<li><i class="fas fa-check"></i> JEV reasoning layer (Choice/Noul/Score)</li>
<li><i class="fas fa-check"></i> Community support</li>
</ul>
<a href="#crm" class="btn-primary" style="text-align:center"><i class="fas fa-key"></i> Get Free Token</a>
</div>
<div class="pricing-card featured">
<div class="plan-name"><i class="fas fa-rocket"></i> Median</div>
<div class="price">$2.99 <span>/ month</span></div>
<div class="desc">For power users who need more capacity and priority support.</div>
<ul class="features">
<li><i class="fas fa-check"></i> Everything in Free</li>
<li><i class="fas fa-check"></i> 3,500 requests / month</li>
<li><i class="fas fa-check"></i> Priority queue</li>
<li><i class="fas fa-check"></i> Email support</li>
<li><i class="fas fa-check"></i> Early access to new features</li>
</ul>
<button class="btn-primary" style="text-align:center;width:100%" onclick="subscribe('median')"><i class="fas fa-credit-card"></i> Subscribe $2.99/mo</button>
</div>
<div class="pricing-card">
<div class="plan-name"><i class="fas fa-crown"></i> Pro</div>
<div class="price">$11.99 <span>/ month</span></div>
<div class="desc">For professionals and teams needing high throughput and premium support.</div>
<ul class="features">
<li><i class="fas fa-check"></i> Everything in Median</li>
<li><i class="fas fa-check"></i> 6,500 requests / month</li>
<li><i class="fas fa-check"></i> Highest priority queue</li>
<li><i class="fas fa-check"></i> Priority email & chat support</li>
<li><i class="fas fa-check"></i> Beta feature access</li>
</ul>
<button class="btn-primary" style="text-align:center;width:100%" onclick="subscribe('pro')"><i class="fas fa-credit-card"></i> Subscribe $11.99/mo</button>
</div>
</div>
</section>
<section class="enterprise-section" id="enterprise">
<div class="section-header"><div class="caption-mono"><i class="fas fa-building"></i> Enterprise</div><h2>Need more?</h2></div>
<div class="enterprise-grid">
<div class="enterprise-info">
<p>DGUI-HyperMem Enterprise is designed for organizations that need dedicated infrastructure, custom quotas, SLAs, and white-label deployment.</p>
<p><i class="fas fa-check" style="color:var(--accent-cyan)"></i> Unlimited requests &amp; users</p>
<p><i class="fas fa-check" style="color:var(--accent-cyan)"></i> Self-hosted or managed deployment</p>
<p><i class="fas fa-check" style="color:var(--accent-cyan)"></i> Dedicated support &amp; SLA</p>
<p><i class="fas fa-check" style="color:var(--accent-cyan)"></i> Custom integrations</p>
<p style="margin-top:16px;font-size:13px;color:var(--text-muted)">Send us a message and we'll get back to you within 24 hours.</p>
</div>
<div class="enterprise-form" id="enterprise-form">
<input type="text" id="ent-name" placeholder="Your name">
<input type="email" id="ent-email" placeholder="Email">
<input type="text" id="ent-company" placeholder="Company">
<textarea id="ent-message" placeholder="Tell us about your needs..."></textarea>
<button class="btn-primary" onclick="sendEnterprise()"><i class="fas fa-paper-plane"></i> Send Inquiry</button>
<div id="ent-status" style="margin-top:12px;font-size:13px;color:var(--accent-cyan);display:none"></div>
</div>
</div>
</section>
<!-- Terms & Agreement Modal -->
<div class="modal-overlay" id="terms-modal">
<div class="modal-box">
<h2><i class="fas fa-file-contract"></i> Terms &amp; Agreement</h2>
<p>By using DGUI-HyperMem, you agree to the following:</p>
<h3>1. Service Description</h3>
<p>DGUI-HyperMem is a self-hosted hybrid memory MCP server. You receive an API token to access the MCP tools (add, search, list, profile, forget). The service runs on Cloudflare Workers infrastructure.</p>
<h3>2. Acceptable Use</h3>
<ul>
<li>You may use the service for personal or commercial projects</li>
<li>You may not use the service for illegal activities</li>
<li>You may not attempt to bypass rate limits or quotas</li>
<li>You may not share your API token with unauthorized parties</li>
</ul>
<h3>3. Data &amp; Privacy</h3>
<p>Your use of the service is subject to our <a href="/privacy" target="_blank" style="color:var(--accent-cyan)">Privacy Policy</a>. Memory content you store is private to your token. Usage context (anonymized) may be used for service improvement unless you opt out via the admin dashboard.</p>
<h3>4. Limitation of Liability</h3>
<p>The service is provided "as is" without warranty. The maintainers are not liable for any damages arising from use of the service.</p>
<h3>5. Quota &amp; Rate Limits</h3>
<p>Each user receives 1,000 requests per month. The total number of active users is capped at 100. Exceeding either limit will result in a temporary suspension until the next cycle or contact with the admin.</p>
<h3>6. Termination</h3>
<p>The admin reserves the right to revoke any token for violation of these terms.</p>
<label><input type="checkbox" id="tc-checkbox"> I have read and agree to the <strong>Terms &amp; Agreement</strong> and <strong><a href="/privacy" target="_blank" style="color:var(--accent-cyan)">Privacy Policy</a></strong>.</label>
<div style="display:flex;gap:12px">
<button class="btn-outline" onclick="closeTerms()" style="flex:1">Cancel</button>
<button class="btn-primary" id="tc-accept-btn" onclick="acceptTerms()" style="flex:1" disabled>Agree &amp; Continue</button>
</div>
</div>
</div>
<footer>
<div class="container" style="max-width:1200px;margin:0 auto;padding:0 24px">
<p>DGUI-HyperMem — a <a href="https://deckergui.my">DeckerGUI</a> project</p>
<div class="footer-links">
<a href="/how-to"><i class="fas fa-book"></i> How to Use</a>
<a href="/privacy"><i class="fas fa-shield-alt"></i> Privacy Policy</a>
<a href="/terms"><i class="fas fa-file-signature"></i> Terms of Service</a>
<a href="https://github.com/ctaxnagomi/dgui-hypermem"><i class="fab fa-github"></i> Self-Host on GitHub</a>
</div>
<p style="margin-top:8px;font-size:12px">Jev / System One by <a href="https://typesafe.ai">TypeSafe AI</a></p>
<p style="margin-top:16px;font-size:11px"><a href="https://github.com/ctaxnagomi/dgui-hypermem">GitHub</a> · <a href="https://huggingface.co/datasets/ctaxnagomi/DGUI_HYPERMEM-JEV">HuggingFace</a> · <a href="https://github.com/ctaxnagomi/dgui-hypermem/blob/main/LICENSE">MIT License</a> · <a href="https://krackeddevs.com">KrackedDevs</a> · <a href="https://ctecx.com">CTECX</a></p>
</div>
</footer>
<script>
function showTerms(){document.getElementById('terms-modal').classList.add('show')}
function closeTerms(){document.getElementById('terms-modal').classList.remove('show')}
document.getElementById('tc-checkbox').addEventListener('change',function(){document.getElementById('tc-accept-btn').disabled=!this.checked});
function acceptTerms(){
  closeTerms();
  const start=document.getElementById('crm-phase-start'),form=document.getElementById('crm-form');
  start.classList.remove('phase-visible');start.classList.add('phase-hidden');
  setTimeout(()=>{form.classList.remove('phase-hidden');form.classList.add('phase-visible')},50);
}
async function requestToken(){
  const e=document.getElementById('crm-email').value.trim(),p=document.getElementById('crm-passkey').value.trim();
  if(!e||!p) return alert('All fields required');
  const form=document.getElementById('crm-form'),status=document.getElementById('crm-status');
  form.classList.remove('phase-visible');form.classList.add('phase-hidden');
  status.classList.remove('phase-hidden');status.classList.add('phase-visible');
  const tx=document.getElementById('crm-status-text');tx.textContent='⏳ Issuing token...';
  try{
    const r=await fetch('/api/request-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e,passkey:p,tc_agreed:true})});
    const d=await r.json();
    if(d.error){tx.textContent='❌ '+d.error;form.classList.remove('phase-hidden');form.classList.add('phase-visible');status.classList.remove('phase-visible');status.classList.add('phase-hidden');return}
    showToken(e,d.token);
  }catch(e){tx.textContent='❌ Error';form.classList.remove('phase-hidden');form.classList.add('phase-visible');status.classList.remove('phase-visible');status.classList.add('phase-hidden')}
}
function showToken(e,t){
  document.getElementById('crm-token-result').style.display='block';
  document.getElementById('crm-status-text').textContent='';
  document.getElementById('crm-token-value').textContent=t;
  document.getElementById('crm-config').textContent=JSON.stringify({mcp:{"dgui-hypermem":{type:"remote",url:"https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",enabled:true,headers:{Authorization:"Bearer "+t}}}},null,2);
}
async function disableToken(){const e=document.getElementById('crm-email').value.trim(),p=prompt('Passkey to revoke:');if(!p)return;const r=await fetch('/api/disable-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e,passkey:p})});const d=await r.json();if(d.error)return alert(d.error);alert('Token revoked');location.reload();}
async function sendEnterprise(){
  const n=document.getElementById('ent-name').value.trim(),e=document.getElementById('ent-email').value.trim(),c=document.getElementById('ent-company').value.trim(),m=document.getElementById('ent-message').value.trim();
  if(!n||!e||!m) return alert('Name, email and message are required');
  const btn=document.getElementById('enterprise-form').querySelector('.btn-primary');
  btn.disabled=true;btn.textContent='Sending...';
  try{
    const r=await fetch('/api/enterprise-inquiry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:n,email:e,company:c,message:m})});
    const d=await r.json();
    const st=document.getElementById('ent-status');st.style.display='block';
    if(d.ok){st.style.color='#4ade80';st.textContent='Thank you! We\'ll respond within 24 hours.';document.getElementById('ent-name').value='';document.getElementById('ent-email').value='';document.getElementById('ent-company').value='';document.getElementById('ent-message').value=''}
    else{st.style.color='#f87171';st.textContent='Error: '+d.error}
  }catch(e){const st=document.getElementById('ent-status');st.style.display='block';st.style.color='#f87171';st.textContent='Error sending message'}
  btn.disabled=false;btn.textContent='Send Inquiry';
}
</script>
</body>
</html>`;