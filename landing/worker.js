export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route MCP and API calls to the backend worker
    if (url.pathname.startsWith("/mcp") || url.pathname.startsWith("/api/")) {
      const backend = new URL("https://dgui-hypermem.ctaxnagomi.workers.dev");
      const proxyUrl = new URL(url.pathname + url.search, backend);
      const proxyReq = new Request(proxyUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return fetch(proxyReq);
    }

    // Serve the landing page
    const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>DGUI-HyperMem &mdash; Hybrid Memory MCP Server</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSJub25lIj4KICA8cGF0aCBkPSJNIDUwIDEwIEwgOTAgMzAgTCA1MCA1MCBMIDEwIDMwIFoiIGZpbGw9IiMwMGYwZmYiIHN0cm9rZT0iIzAwZjBmZiIgc3Ryb2tlLXdpZHRoPSIxIi8+CiAgPHBhdGggZD0iTSA1MCAzMCBMIDkwIDUwIEwgNTAgNzAgTCAxMCA1MCBaIiBmaWxsPSJyZ2JhKDM2LDM2LDM2LDAuOCkiIHN0cm9rZT0iIzAwZjBmZiIgc3Ryb2tlLXdpZHRoPSIxIi8+CiAgPHBhdGggZD0iTSA1MCA1MCBMIDkwIDcwIEwgNTAgOTAgTCAxMCA3MCBaIiBmaWxsPSIjMWExYTFhIiBzdHJva2U9IiMwMGYwZmYiIHN0cm9rZS13aWR0aD0iMSIvPgo8L3N2Zz4=">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--bg-elevated:#191919;--border-glass:#212327;--border-accent:rgba(255,255,255,0.25);--accent:#ffffff;--accent-dim:#dadbdf;--accent-cyan:#00f0ff;--text-primary:#ffffff;--text-secondary:#dadbdf;--text-muted:#7d8187}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;width:100%;background:var(--bg-primary);font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-weight:400;color:var(--text-primary);-webkit-font-smoothing:antialiased;overflow-x:hidden}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border-glass);border-radius:10px}
.container{max-width:1200px;margin:0 auto;padding:0 24px}
nav{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border-glass)}
.nav-brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--accent)}
.nav-brand svg{width:28px;height:28px}
.nav-brand span{font-size:16px;font-weight:500;letter-spacing:-0.3px}
.nav-links{display:flex;align-items:center;gap:24px}
.nav-links a{color:var(--text-muted);text-decoration:none;font-size:14px;transition:color .2s}
.nav-links a:hover{color:var(--accent)}
.nav-links .btn-accent{color:var(--accent);border:1px solid var(--border-accent);border-radius:9999px;padding:8px 20px;font-size:14px;font-weight:400;background:transparent;cursor:pointer;transition:all .2s;text-decoration:none}
.nav-links .btn-accent:hover{background:rgba(255,255,255,0.06);border-color:var(--accent)}
.hero{padding:120px 24px 80px;text-align:center}
.hero .caption-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;font-size:14px;font-weight:400;line-height:20px;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent-cyan);margin-bottom:24px}
.hero h1{font-size:72px;line-height:72px;font-weight:300;letter-spacing:-1.8px;margin-bottom:24px;color:var(--accent)}
.hero p{font-size:18px;line-height:28px;color:var(--text-secondary);max-width:640px;margin:0 auto 48px}
.hero-actions{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.btn-primary{background:var(--accent);color:#0a0a0a;border:none;font-weight:400;border-radius:9999px;padding:10px 24px;font-size:15px;cursor:pointer;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
.btn-primary:hover{opacity:.9}
.btn-primary:active{transform:scale(.97)}
.btn-outline{background:transparent;color:var(--accent);border:1px solid var(--border-accent);font-weight:400;border-radius:9999px;padding:10px 24px;font-size:15px;cursor:pointer;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
.btn-outline:hover{background:rgba(255,255,255,0.06);border-color:var(--accent)}
.features{padding:80px 24px}
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:48px}
.feature-card{background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:8px;padding:32px;transition:border-color .2s}
.feature-card:hover{border-color:var(--border-accent)}
.feature-card .icon{font-size:24px;margin-bottom:16px;color:var(--accent-cyan)}
.feature-card h3{font-size:18px;font-weight:500;margin-bottom:8px;color:var(--accent)}
.feature-card p{font-size:14px;line-height:22px;color:var(--text-secondary)}
.arch{padding:60px 24px 80px}
.arch-diagram{background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:8px;padding:40px;margin-top:32px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;font-size:13px;line-height:22px;color:var(--text-muted);white-space:pre;overflow-x:auto}
.arch-diagram .hl{color:var(--accent-cyan)}
.arch-diagram .hl2{color:var(--accent)}
.config{padding:40px 24px 80px}
.config-block{background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:8px;padding:32px;margin-top:24px}
.config-block code{display:block;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;font-size:13px;line-height:22px;color:var(--text-secondary);white-space:pre;overflow-x:auto}
.section-header{text-align:center;margin-bottom:16px}
.section-header .caption-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;font-size:14px;font-weight:400;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent-cyan);margin-bottom:12px}
.section-header h2{font-size:48px;line-height:48px;font-weight:300;letter-spacing:-1.2px;color:var(--accent);margin-bottom:12px}
.section-header p{font-size:16px;color:var(--text-secondary);max-width:560px;margin:0 auto}
footer{border-top:1px solid var(--border-glass);padding:48px 24px;text-align:center}
footer p{font-size:14px;color:var(--text-muted)}
footer a{color:var(--accent-cyan);text-decoration:none}
footer a:hover{text-decoration:underline}
@media(max-width:768px){.hero h1{font-size:40px;line-height:44px;letter-spacing:-1px}.hero{padding:80px 16px 60px}.section-header h2{font-size:32px;line-height:36px}nav .nav-links a:not(.btn-accent){display:none}}
</style>
</head>
<body>
<nav>
<a href="/" class="nav-brand">
<svg viewBox="0 0 100 100" fill="none"><path d="M 50 10 L 90 30 L 50 50 L 10 30 Z" fill="#00f0ff" stroke="#00f0ff" stroke-width="1"/><path d="M 50 30 L 90 50 L 50 70 L 10 50 Z" fill="rgba(36,36,36,0.8)" stroke="#00f0ff" stroke-width="1"/><path d="M 50 50 L 90 70 L 50 90 L 10 70 Z" fill="#1a1a1a" stroke="#00f0ff" stroke-width="1"/></svg>
<span>DECKER GUI</span>
</a>
<div class="nav-links">
<a href="#features">Features</a><a href="#arch">Architecture</a><a href="#connect">Connect</a>
<a href="https://github.com/ctaxnagomi/dgui-hypermem" target="_blank" class="btn-accent"><i class="fab fa-github"></i> GitHub</a>
</div>
</nav>
<section class="hero">
<div class="caption-mono"><i class="fas fa-brain"></i> DGUI-HYPERMEM</div>
<h1>Memory that<br>remembers right.</h1>
<p>A self-hosted hybrid memory MCP server for AI agents &mdash; fusing vector search, full-text search, and a JEV reasoning layer that curates what gets remembered.</p>
<div class="hero-actions">
<a href="#connect" class="btn-primary">Connect Agent <i class="fas fa-arrow-right"></i></a>
<a href="https://github.com/ctaxnagomi/dgui-hypermem#deploy" class="btn-outline"><i class="fas fa-cloud-upload-alt"></i> Self-Host</a>
</div>
</section>
<section id="features" class="features">
<div class="section-header"><div class="caption-mono"><i class="fas fa-cubes"></i> Features</div><h2>What it does.</h2></div>
<div class="container"><div class="features-grid">
<div class="feature-card"><div class="icon"><i class="fas fa-database"></i></div><h3>Hybrid Recall</h3><p>Vectorize ANN + D1 FTS5 BM25 candidates fused by reciprocal rank, then JEV re-ranked.</p></div>
<div class="feature-card"><div class="icon"><i class="fas fa-filter"></i></div><h3>JEV Reasoning</h3><p>TypeSafe System One (Choice / Noul / Score) types each memory, scores salience, drops non-durable chatter.</p></div>
<div class="feature-card"><div class="icon"><i class="fas fa-sync-alt"></i></div><h3>Self-Maintaining</h3><p>Near-duplicate and contradicting memories superseded automatically. No manual curation.</p></div>
<div class="feature-card"><div class="icon"><i class="fas fa-robot"></i></div><h3>MCP Native</h3><p>Streamable HTTP MCP protocol &mdash; works with opencode, Claude Desktop, Cursor, any MCP client.</p></div>
<div class="feature-card"><div class="icon"><i class="fas fa-chart-line"></i></div><h3>Training Brain</h3><p>Every JEV decision logged to DGUI_HYPERMEM-JEV on HuggingFace. Your AI gets better with use.</p></div>
<div class="feature-card"><div class="icon"><i class="fas fa-server"></i></div><h3>Serverless</h3><p>Built on Cloudflare Workers &mdash; D1, Vectorize, Workers AI, scheduled cron. No infrastructure.</p></div>
</div></div>
</section>
<section id="arch" class="arch">
<div class="section-header"><div class="caption-mono"><i class="fas fa-sitemap"></i> Architecture</div><h2>How it works.</h2></div>
<div class="container"><div class="arch-diagram">
<span class="hl">┌───────────────────────────────────────────────────┐</span>
<span class="hl">│               MCP Client (opencode etc.)          │</span>
<span class="hl">└──────────────────────┬────────────────────────────┘</span>
<span class="hl">                       │ POST /mcp</span>
<span class="hl">                       ▼</span>
<span class="hl">┌───────────────────────────────────────────────────┐</span>
<span class="hl">│               dguihymem.deckergui.my              │</span>
<span class="hl">│     add &middot; search &middot; list &middot; profile &middot; forget       │</span>
<span class="hl">│     sync_jev_dataset &middot; jev_queue_stats           │</span>
<span class="hl2">└──────────────────────┬────────────────────────────┘</span>
<span class="hl2">              ┌───────┴───────┐</span>
<span class="hl2">              │   JEV Layer    │</span>
<span class="hl2">              │ Choice / Noul │</span>
<span class="hl2">              │     / Score    │</span>
<span class="hl2">              └───────┬───────┘</span>
<span class="hl">         ┌──────────┼──────────┐</span>
<span class="hl">         ▼          ▼          ▼</span>
<span class="hl">   ┌────────┐ ┌──────────┐ ┌───────────┐</span>
<span class="hl">   │   D1   │ │Vectorize │ │Workers AI │</span>
<span class="hl">   │ SQLite │ │  768d    │ │ Fallback  │</span>
<span class="hl">   │ + FTS5 │ │  cosine  │ │  Model    │</span>
<span class="hl">   └────────┘ └──────────┘ └───────────┘</span>
<span class="hl2">              │ jev_examples queue │</span>
<span class="hl2">              ▼ hourly cron</span>
<span class="hl2">       🤗 ctaxnagomi/DGUI_HYPERMEM-JEV</span>
</div></div>
</section>
<section id="connect" class="config">
<div class="section-header"><div class="caption-mono"><i class="fas fa-plug"></i> Connect</div><h2>Ready to connect.</h2><p>Add this to your MCP client config to connect any AI agent to DGUI-HyperMem.</p></div>
<div class="container">
<div class="config-block">
<code style="color:var(--text-muted)">// opencode.jsonc / claude_desktop_config.json</code>
<code>{</code>
<code>  <span style="color:var(--accent-cyan)">"mcp"</span>: {</code>
<code>    <span style="color:var(--accent-cyan)">"dgui-hypermem"</span>: {</code>
<code>      <span style="color:var(--accent-cyan)">"type"</span>: <span style="color:#a5d6a5">"remote"</span>,</code>
<code>      <span style="color:var(--accent-cyan)">"url"</span>: <span style="color:#a5d6a5">"https://dguihymem.deckergui.my/mcp"</span>,</code>
<code>      <span style="color:var(--accent-cyan)">"enabled"</span>: <span style="color:#a5d6a5">true</span>,</code>
<code>      <span style="color:var(--accent-cyan)">"headers"</span>: {</code>
<code>        <span style="color:var(--accent-cyan)">"Authorization"</span>: <span style="color:#a5d6a5">"Bearer MCP_TOKEN"</span></code>
<code>      }</code>
<code>    }</code>
<code>  }</code>
<code>}</code>
</div>
<div style="text-align:center;margin-top:32px;padding:24px;background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:8px">
<p style="color:var(--text-secondary);margin-bottom:12px">Need an access token?</p>
<a href="https://deckergui.my" class="btn-outline"><i class="fas fa-envelope"></i> Contact DeckerGUI</a>
</div>
</div>
</section>
<section style="padding:40px 24px 80px">
<div class="section-header"><div class="caption-mono"><i class="fas fa-tools"></i> Tools</div><h2>Available commands.</h2></div>
<div class="container"><div class="features-grid">
<div class="feature-card" style="padding:20px 24px"><h3 style="font-size:15px"><span style="color:var(--accent-cyan)">add</span></h3><p style="font-size:13px">Store a durable memory. JEV types, scores, supersedes.</p></div>
<div class="feature-card" style="padding:20px 24px"><h3 style="font-size:15px"><span style="color:var(--accent-cyan)">search</span></h3><p style="font-size:13px">Hybrid recall: vector + keyword fused, JEV re-ranked.</p></div>
<div class="feature-card" style="padding:20px 24px"><h3 style="font-size:15px"><span style="color:var(--accent-cyan)">list</span></h3><p style="font-size:13px">Browse recent memories in a scope.</p></div>
<div class="feature-card" style="padding:20px 24px"><h3 style="font-size:15px"><span style="color:var(--accent-cyan)">profile</span></h3><p style="font-size:13px">Summarise a scope: counts, types, tags, salience.</p></div>
<div class="feature-card" style="padding:20px 24px"><h3 style="font-size:15px"><span style="color:var(--accent-cyan)">forget</span></h3><p style="font-size:13px">Delete by id, by query, or clear a scope.</p></div>
<div class="feature-card" style="padding:20px 24px"><h3 style="font-size:15px"><span style="color:var(--accent-cyan)">sync_jev_dataset</span></h3><p style="font-size:13px">Flush queued JEV decisions to the HuggingFace dataset.</p></div>
</div></div>
</section>
<footer>
<div class="container">
<a href="/" style="display:inline-block;margin-bottom:16px">
<svg viewBox="0 0 100 100" fill="none" style="width:24px;height:24px"><path d="M 50 10 L 90 30 L 50 50 L 10 30 Z" fill="#00f0ff" stroke="#00f0ff" stroke-width="1"/><path d="M 50 30 L 90 50 L 50 70 L 10 50 Z" fill="rgba(36,36,36,0.8)" stroke="#00f0ff" stroke-width="1"/><path d="M 50 50 L 90 70 L 50 90 L 10 70 Z" fill="#1a1a1a" stroke="#00f0ff" stroke-width="1"/></svg>
</a>
<p>DGUI-HyperMem &mdash; a <a href="https://deckergui.my">DeckerGUI</a> project</p>
<p style="margin-top:8px">Jev / System One by <a href="https://typesafe.ai">TypeSafe AI</a> &middot; Built on <a href="https://cloudflare.com">Cloudflare Workers</a></p>
<p style="margin-top:24px;font-size:12px"><a href="https://github.com/ctaxnagomi/dgui-hypermem">GitHub</a> &middot; <a href="https://huggingface.co/datasets/ctaxnagomi/DGUI_HYPERMEM-JEV">HuggingFace Dataset</a> &middot; <a href="https://github.com/ctaxnagomi/dgui-hypermem/blob/main/LICENSE">MIT License</a></p>
</div>
</footer>
</body>
</html>`;

    return new Response(html, {
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  },
};