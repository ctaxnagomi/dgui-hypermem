export const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="DGUI-HyperMem user, developer, client, REST, MCP, and self-hosting documentation.">
<title>DGUI-HyperMem Documentation</title>
<style>
:root{--bg:#080b10;--panel:#0d1219;--panel-2:#111923;--line:#1e2a38;--line-2:#2b3a4c;--text:#e8eef6;--muted:#8fa1b5;--cyan:#55e6d5;--blue:#6aa8ff;--amber:#f7c66b;--red:#ff7b8a;--shadow:0 18px 55px rgba(0,0,0,.28);--radius:16px}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:86px}
body{margin:0;background:radial-gradient(circle at 50% -20%,rgba(85,230,213,.11),transparent 34%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}
a{color:var(--cyan);text-decoration:none}
a:hover{text-decoration:underline}
code,kbd,pre{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace}
code{color:#c8f8ef;background:#101a24;border:1px solid #223242;border-radius:6px;padding:.08rem .34rem;font-size:.9em}
.topbar{height:62px;position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:rgba(8,11,16,.88);border-bottom:1px solid var(--line);backdrop-filter:blur(18px)}
.brand{display:flex;align-items:center;gap:11px;color:var(--text);font-weight:750;letter-spacing:-.02em}
.brand-mark{width:29px;height:29px;border:1px solid rgba(85,230,213,.55);border-radius:8px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(85,230,213,.18),rgba(106,168,255,.08));color:var(--cyan);font-size:13px}
.top-actions{display:flex;align-items:center;gap:10px}
.top-actions a{padding:7px 11px;border:1px solid var(--line-2);border-radius:8px;color:var(--text);font-size:13px;background:rgba(255,255,255,.02)}
.top-actions a:last-child{border-color:rgba(85,230,213,.45);color:var(--cyan)}
.shell{display:grid;grid-template-columns:246px minmax(0,1fr) 224px;max-width:1720px;margin:0 auto}
.sidebar{position:sticky;top:62px;height:calc(100vh - 62px);overflow:auto;padding:24px 18px 42px 22px;border-right:1px solid var(--line)}
.search{width:100%;height:36px;border:1px solid var(--line-2);border-radius:8px;background:#0a1017;color:var(--text);padding:0 10px;outline:none;font-size:12px}
.search:focus{border-color:rgba(85,230,213,.65);box-shadow:0 0 0 3px rgba(85,230,213,.08)}
.nav-title{margin:22px 8px 7px;color:#65798e;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.nav-link{display:block;color:#9cafc2;border-left:1px solid transparent;padding:5px 9px;font-size:12.5px;line-height:1.35}
.nav-link:hover,.nav-link.active{color:var(--text);border-left-color:var(--cyan);background:linear-gradient(90deg,rgba(85,230,213,.09),transparent);text-decoration:none}
.content{min-width:0;padding:54px clamp(28px,5vw,82px) 110px}
.content-inner{max-width:920px;margin:0 auto}
.eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font:700 11px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.15em;text-transform:uppercase}
.eyebrow:before{content:"";width:27px;height:1px;background:var(--cyan)}
h1{max-width:800px;margin:15px 0 18px;font-size:clamp(42px,6.3vw,76px);line-height:.98;letter-spacing:-.055em}
h1 span{background:linear-gradient(100deg,var(--text),#9deee4 52%,#7eb7ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{max-width:760px;color:#aab9c9;font-size:18px;line-height:1.65}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}
.pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line-2);border-radius:999px;padding:5px 9px;color:#9eb0c2;background:rgba(255,255,255,.018);font-size:11px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);box-shadow:0 0 10px rgba(85,230,213,.8)}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 14px;border:1px solid var(--line-2);border-radius:9px;color:var(--text);font-size:13px;font-weight:650}
.btn:hover{text-decoration:none;border-color:#4a6177;transform:translateY(-1px)}
.btn-primary{background:var(--cyan);border-color:var(--cyan);color:#05110f}
.btn-primary:hover{border-color:#8ff4e8}
.hero-grid,.cards,.tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin:25px 0}
.card,.tool-card{border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(145deg,rgba(17,25,35,.92),rgba(11,16,23,.94));padding:19px;box-shadow:var(--shadow)}
.card:hover,.tool-card:hover{border-color:#30465b;transform:translateY(-2px)}
.card-kicker{color:var(--cyan);font:700 10px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.12em;text-transform:uppercase}
.card h3,.tool-card h3{margin:9px 0 5px;font-size:16px;letter-spacing:-.015em}
.card p,.tool-card p{margin:0;color:var(--muted);font-size:13px}
.card a{display:inline-block;margin-top:12px;font-size:12px}
section{padding-top:56px}
section+section{border-top:1px solid rgba(30,42,56,.62)}
h2{margin:0 0 15px;font-size:30px;line-height:1.15;letter-spacing:-.035em}
h3{margin:28px 0 10px;font-size:19px;letter-spacing:-.02em}
p{margin:0 0 13px;color:#b0bfce}
ul,ol{margin:9px 0 18px;padding-left:21px;color:#b0bfce}
li{margin:5px 0}
.steps{counter-reset:step;display:grid;gap:11px;margin:22px 0}
.step{position:relative;padding:17px 18px 17px 57px;border:1px solid var(--line);border-radius:12px;background:rgba(14,21,29,.72)}
.step:before{counter-increment:step;content:counter(step);position:absolute;left:17px;top:16px;width:25px;height:25px;border:1px solid rgba(85,230,213,.4);border-radius:7px;display:grid;place-items:center;color:var(--cyan);font:700 11px/1 monospace;background:rgba(85,230,213,.06)}
.step strong{display:block;margin-bottom:4px;font-size:14px}
.step p{margin:0;font-size:13px}
.notice,.warning{border:1px solid rgba(85,230,213,.24);border-left:3px solid var(--cyan);border-radius:10px;background:rgba(85,230,213,.045);padding:13px 15px;margin:18px 0;color:#b9c9d8;font-size:13px}
.notice strong,.warning strong{color:var(--text)}
.warning{border-color:rgba(247,198,107,.25);border-left-color:var(--amber);background:rgba(247,198,107,.045)}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;margin:18px 0}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{text-align:left;vertical-align:top;padding:11px 12px;border-bottom:1px solid var(--line)}
th{color:#d7e3ef;background:#101821;font-size:11px;letter-spacing:.045em;text-transform:uppercase}
tr:last-child td{border-bottom:0}
td code{white-space:nowrap}
.method{display:inline-block;min-width:48px;margin-right:8px;border-radius:5px;padding:2px 5px;text-align:center;color:#07110f;background:var(--cyan);font:800 9px/1.5 "SFMono-Regular",Consolas,monospace}
.method.get{background:var(--blue)}
.method.post{background:var(--cyan)}
.code-shell{position:relative;margin:16px 0 28px;border:1px solid var(--line-2);border-radius:12px;background:#070b10;overflow:hidden}
.code-title{display:flex;align-items:center;justify-content:space-between;min-height:38px;padding:0 10px 0 13px;border-bottom:1px solid var(--line);background:#0d141c;color:#8fa4b8;font:700 10px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.08em;text-transform:uppercase}
.copy-btn{border:1px solid #2b3d50;border-radius:6px;padding:4px 7px;background:#111c27;color:#b8c8d6;font:700 10px/1.2 inherit;cursor:pointer}
.copy-btn:hover{border-color:rgba(85,230,213,.55);color:var(--cyan)}
.copy-btn.done{color:var(--cyan);border-color:rgba(85,230,213,.55)}
pre{margin:0;padding:17px;overflow:auto;color:#cbd8e5;font-size:12px;line-height:1.62;tab-size:2}
pre code{padding:0;border:0;background:transparent;color:inherit;border-radius:0;white-space:pre}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:18px 0}
.mini-card{border:1px solid var(--line);border-radius:12px;background:rgba(14,21,29,.68);padding:16px}
.mini-card h3{margin:0 0 5px;font-size:14px}
.mini-card p{margin:0;font-size:12px}
.tool-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.tool-card{box-shadow:none;padding:16px}
.tool-card code{font-size:11px}
.workflow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:20px 0}
.workflow div{position:relative;border:1px solid var(--line);border-radius:10px;padding:12px;background:rgba(14,21,29,.68);font-size:11px;color:#9fb1c3}
.workflow b{display:block;color:var(--text);font-size:12px;margin-bottom:4px}
.toc{position:sticky;top:62px;height:calc(100vh - 62px);overflow:auto;padding:31px 20px 42px 4px;border-left:1px solid var(--line)}
.toc-title{margin-bottom:9px;color:#667a8f;font:800 10px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.14em;text-transform:uppercase}
.toc a{display:block;color:#788da1;font-size:11.5px;line-height:1.3;padding:5px 0 5px 11px;border-left:1px solid transparent}
.toc a:hover,.toc a.active{color:var(--cyan);border-left-color:var(--cyan);text-decoration:none}
.toc .toc-sub{padding-left:20px;color:#63788b;font-size:10.5px}
.footer{margin-top:60px;padding-top:22px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:15px;color:#63778a;font-size:11px}
.search-empty{display:none;padding:14px 8px;color:#63778a;font-size:11px}
@media(max-width:1260px){.shell{grid-template-columns:235px minmax(0,1fr)}.toc{display:none}.content{padding-left:44px;padding-right:44px}}
@media(max-width:880px){.topbar{padding:0 14px}.top-actions a:first-child{display:none}.shell{display:block}.sidebar{position:relative;top:auto;height:auto;padding:14px 16px;border-right:0;border-bottom:1px solid var(--line)}.sidebar nav{display:flex;gap:6px;overflow:auto}.nav-title,.search,.search-empty{display:none}.sidebar .nav-group{display:contents}.nav-link{white-space:nowrap;border-left:0;border-bottom:1px solid transparent;padding:6px 9px}.nav-link:hover,.nav-link.active{border-left:0;border-bottom-color:var(--cyan)}.content{padding:38px 20px 80px}.hero-grid,.cards{grid-template-columns:1fr}.tool-grid,.two-col{grid-template-columns:1fr}.workflow{grid-template-columns:1fr 1fr}h1{font-size:48px}}
@media(max-width:520px){.brand span:last-child{display:none}.lede{font-size:16px}.workflow{grid-template-columns:1fr}.footer{display:block}.footer a{display:block;margin-top:8px}}
</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/"><span class="brand-mark">DH</span><span>DGUI-HyperMem Docs</span></a>
  <div class="top-actions"><a href="#copy-llm">Copy for LLM</a><a href="/">Get a token</a></div>
</header>
<div class="shell">
  <aside class="sidebar">
    <input id="nav-search" class="search" type="search" placeholder="Filter documentation" aria-label="Filter documentation">
    <div class="search-empty">No matching pages.</div>
    <nav id="page-nav">
      <div class="nav-group">
        <div class="nav-title">Start here</div>
        <a class="nav-link" href="#overview">Overview</a>
        <a class="nav-link" href="#establish">Establish yourself</a>
        <a class="nav-link" href="#user-guide">User guide</a>
        <a class="nav-link" href="#developer-guide">Developer guide</a>
        <a class="nav-link" href="#clients">Client guides</a>
      </div>
      <div class="nav-group">
        <div class="nav-title">Reference</div>
        <a class="nav-link" href="#authentication">Authentication</a>
        <a class="nav-link" href="#memory-tools">Memory tools</a>
        <a class="nav-link" href="#rest-api">REST API</a>
        <a class="nav-link" href="#scopes">Scopes</a>
        <a class="nav-link" href="#quotas">Quotas</a>
      </div>
      <div class="nav-group">
        <div class="nav-title">Operations</div>
        <a class="nav-link" href="#self-host">Self-host</a>
        <a class="nav-link" href="#security">Security</a>
        <a class="nav-link" href="#troubleshooting">Troubleshooting</a>
      </div>
      <div class="nav-group">
        <div class="nav-title">Copy for LLM</div>
        <a class="nav-link" href="#copy-markdown">Markdown brief</a>
        <a class="nav-link" href="#copy-mcp">MCP JSON</a>
        <a class="nav-link" href="#copy-json">Integration JSON</a>
        <a class="nav-link" href="#copy-vscode">VS Code</a>
        <a class="nav-link" href="#copy-claude">Claude Code</a>
        <a class="nav-link" href="#copy-cursor">Cursor</a>
        <a class="nav-link" href="#copy-jetbrains">JetBrains</a>
        <a class="nav-link" href="#copy-hermes">Hermes</a>
        <a class="nav-link" href="#copy-openclaw">OpenClaw</a>
        <a class="nav-link" href="#copy-opencode">opencode</a>
      </div>
    </nav>
  </aside>

  <main class="content">
    <div class="content-inner">
      <section id="overview" style="padding-top:0;border:0">
        <div class="eyebrow">Memory infrastructure for agents</div>
        <h1>DGUI-HyperMem <span>documentation</span></h1>
        <p class="lede">Connect an AI client to a scoped hybrid memory service with MCP, retrieve durable context with vector and keyword search, and manage the same data through REST.</p>
        <div class="meta">
          <span class="pill"><span class="dot"></span>Hosted endpoint available</span>
          <span class="pill">MCP over Streamable HTTP</span>
          <span class="pill">Cloudflare self-hostable</span>
        </div>
        <div class="actions"><a class="btn btn-primary" href="#establish">Establish your connection</a><a class="btn" href="#copy-llm">Copy client setup</a><a class="btn" href="#developer-guide">Read API reference</a></div>
        <div class="hero-grid">
          <article class="card"><div class="card-kicker">For users</div><h3>Start with a token</h3><p>Request access, store a memory, search it back, and remove it when you no longer want it retained.</p><a href="#establish">Connect in five steps</a></article>
          <article class="card"><div class="card-kicker">For developers</div><h3>Use MCP or REST</h3><p>Use the authenticated MCP endpoint for agents or the REST mirror for scripts, services, and diagnostics.</p><a href="#developer-guide">Inspect the interface</a></article>
          <article class="card"><div class="card-kicker">For operators</div><h3>Run your own</h3><p>Deploy the Worker with D1, Vectorize, Workers AI, and secrets managed by your Cloudflare account.</p><a href="#self-host">Self-host the service</a></article>
        </div>
        <div class="notice"><strong>Hosted endpoint:</strong> <code>https://dgui-hypermem.ctaxnagomi.workers.dev</code>. The MCP endpoint is <code>/mcp</code>; the service status endpoint is <code>/health</code>.</div>
      </section>

      <section id="establish">
        <h2>Establish your connection</h2>
        <p>Complete this sequence once per client or application. Keep the bearer token in an environment variable or a client secret prompt, not in source code.</p>
        <div class="steps">
          <div class="step"><strong>Request access</strong><p>Open the hosted service, accept the terms, and request a token. Store the returned token as <code>DGUI_HYPERMEM_TOKEN</code>.</p></div>
          <div class="step"><strong>Expose the token to your shell</strong><p>Use a secret manager or a local environment variable. PowerShell: <code>$env:DGUI_HYPERMEM_TOKEN = "YOUR_TOKEN"</code>. Bash: <code>export DGUI_HYPERMEM_TOKEN="YOUR_TOKEN"</code>.</p></div>
          <div class="step"><strong>Add the remote MCP server</strong><p>Copy the block for your client from <a href="#clients">Client guides</a>. Do not replace the URL with the landing-page URL; the server URL must end in <code>/mcp</code>.</p></div>
          <div class="step"><strong>Verify authentication</strong><p>Call <code>GET /api/verify-token</code> with the bearer token. A valid CRM token returns <code>valid: true</code> and its effective quota.</p></div>
          <div class="step"><strong>Run a memory smoke test</strong><p>Use the MCP <code>add</code> tool, then <code>search</code> with the same scope. Remove the test record with <code>forget</code> and its returned ID.</p></div>
        </div>
        <div class="code-shell">
          <div class="code-title"><span>REST verification</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>curl "https://dgui-hypermem.ctaxnagomi.workers.dev/api/verify-token" \\
  -H "Authorization: Bearer \${DGUI_HYPERMEM_TOKEN}"</code></pre>
        </div>
        <div class="notice"><strong>Agent instruction:</strong> “Before starting a project, search DGUI-HyperMem for relevant decisions and preferences. After a durable decision is made, add a concise memory with a stable project scope and useful tags. Never store credentials or private keys.”</div>
      </section>

      <section id="user-guide">
        <h2>User guide</h2>
        <p>DGUI-HyperMem is useful when information should survive a chat, coding session, client restart, or model switch. Use concise statements that will still make sense later.</p>
        <div class="workflow">
          <div><b>Recall</b>Search before asking the user to repeat prior context.</div>
          <div><b>Decide</b>Record durable choices, constraints, and preferences.</div>
          <div><b>Verify</b>Check the returned ID, type, tags, and source.</div>
          <div><b>Prune</b>Forget stale or incorrect records by ID.</div>
        </div>
        <div class="tool-grid">
          <article class="tool-card"><h3><code>add</code></h3><p>Stores a memory, assigns a JEV type and salience, checks nearby memories for contradictions, and may supersede an older record.</p></article>
          <article class="tool-card"><h3><code>search</code></h3><p>Combines Vectorize similarity, D1 FTS5 keyword search, reciprocal-rank fusion, and optional JEV reranking.</p></article>
          <article class="tool-card"><h3><code>list</code></h3><p>Browses active, superseded, or deleted records in one scope, newest first, with type and status filters.</p></article>
          <article class="tool-card"><h3><code>profile</code></h3><p>Summarizes counts by type, popular tags, average salience, and recent activity for a scope.</p></article>
          <article class="tool-card"><h3><code>forget</code></h3><p>Deletes exact IDs, the closest matches to a query, or an entire scope. Prefer IDs for routine cleanup.</p></article>
          <article class="tool-card"><h3><code>help</code></h3><p>Returns the server’s built-in tool summary and current JEV provider behavior.</p></article>
        </div>
        <h3>Writing useful memories</h3>
        <ul>
          <li>Use stable scopes such as <code>project:hypermem</code>, <code>user:default</code>, or <code>agent:research</code>.</li>
          <li>Write one durable fact or decision per memory instead of a transcript.</li>
          <li>Include constraints and rationale when a future agent needs to understand why.</li>
          <li>Add tags for technologies, subsystems, environments, and workflows.</li>
          <li>Set <code>source</code> to a useful provenance label without embedding secrets or personal data.</li>
        </ul>
        <div class="warning"><strong>Privacy:</strong> memories are retained until explicitly forgotten or the relevant scope is cleared. JEV analysis can queue decision examples for dataset synchronization when an AI provider and dataset export are configured. Do not store passwords, API keys, private keys, payment data, or unnecessary personal information.</div>
      </section>

      <section id="developer-guide">
        <h2>Developer guide</h2>
        <p>The Worker exposes a stateless MCP server and a small REST mirror. Both operate on the same D1 records and Vectorize index.</p>
        <h3>Retrieval pipeline</h3>
        <div class="workflow">
          <div><b>1. Embed</b><code>@cf/baai/bge-base-en-v1.5</code> produces 768 dimensions.</div>
          <div><b>2. Retrieve</b>Vectorize ANN and D1 FTS5 BM25 return independent candidates.</div>
          <div><b>3. Fuse</b>Reciprocal rank fusion merges both candidate lists.</div>
          <div><b>4. Rerank</b>JEV reorders results when its configured provider is available.</div>
        </div>
        <h3>Memory behavior</h3>
        <p><code>add</code> accepts every non-empty memory that passes the content filter. JEV assigns type, salience, confidence, and durability metadata; a durability score is not an automatic deletion rule. A nearby active record can be marked superseded when the contradiction score reaches the configured threshold.</p>
        <h3>Base URLs</h3>
        <div class="table-wrap"><table><thead><tr><th>Purpose</th><th>URL</th><th>Authentication</th></tr></thead><tbody>
          <tr><td>MCP</td><td><code>https://dgui-hypermem.ctaxnagomi.workers.dev/mcp</code></td><td>Bearer token</td></tr>
          <tr><td>REST</td><td><code>https://dgui-hypermem.ctaxnagomi.workers.dev/api/*</code></td><td>Bearer token</td></tr>
          <tr><td>Status</td><td><code>https://dgui-hypermem.ctaxnagomi.workers.dev/health</code></td><td>Public</td></tr>
        </tbody></table></div>
      </section>

      <section id="clients">
        <h2>Client guides</h2>
        <p>Each block uses the hosted endpoint and the <code>DGUI_HYPERMEM_TOKEN</code> environment variable. For self-hosting, replace the URL with your Worker URL and keep the <code>/mcp</code> suffix.</p>
        <div class="hero-grid">
          <article class="card"><div class="card-kicker">IDE</div><h3>VS Code</h3><p>Uses top-level <code>servers</code> and secret inputs with <code>${'${input:dgui_hypermem_token}'}</code> interpolation.</p><a href="#copy-vscode">Copy VS Code config</a></article>
          <article class="card"><div class="card-kicker">Terminal agent</div><h3>Claude Code</h3><p>Registers a remote HTTP MCP server and sends the token through an authorization header.</p><a href="#copy-claude">Copy Claude Code command</a></article>
          <article class="card"><div class="card-kicker">IDE</div><h3>Cursor</h3><p>Uses the widely supported <code>mcpServers</code> remote HTTP shape.</p><a href="#copy-cursor">Copy Cursor config</a></article>
          <article class="card"><div class="card-kicker">IDE</div><h3>JetBrains</h3><p>Stores the remote server in a project or user MCP JSON file with an authorization header.</p><a href="#copy-jetbrains">Copy JetBrains config</a></article>
          <article class="card"><div class="card-kicker">Agent runtime</div><h3>Hermes</h3><p>Uses Hermes’ root-level <code>mcp_servers</code> configuration.</p><a href="#copy-hermes">Copy Hermes config</a></article>
          <article class="card"><div class="card-kicker">Agent runtime</div><h3>OpenClaw</h3><p>Declares the server with <code>transport: "streamable-http"</code>.</p><a href="#copy-openclaw">Copy OpenClaw config</a></article>
        </div>
        <div class="notice"><strong>opencode:</strong> current opencode configuration places remote servers directly under <code>mcp</code>, uses <code>type: "remote"</code>, reads secrets with <code>{env:NAME}</code>, and supports bearer headers. <a href="#copy-opencode">Copy the opencode block</a>.</div>
      </section>

      <section id="authentication">
        <h2>Authentication</h2>
        <p>Hosted requests use an active CRM token in the <code>Authorization</code> header. The Worker also accepts <code>X-API-Key</code> and a <code>token</code> query parameter for compatibility, but bearer headers are preferred because query strings are commonly retained in logs and proxies.</p>
        <div class="code-shell">
          <div class="code-title"><span>Preferred authorization header</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>Authorization: Bearer \${DGUI_HYPERMEM_TOKEN}</code></pre>
        </div>
        <ul>
          <li><code>GET /api/verify-token</code> validates status, terms acceptance, and quota state.</li>
          <li><code>GET /api/check-quota</code> returns plan, usage, remaining allowance, and reset time.</li>
          <li>Do not paste a token into a prompt, URL, issue, screenshot, or tracked configuration file.</li>
          <li>Self-hosted deployments must set <code>MCP_TOKEN</code> as a Worker secret. The current authorization path fails open when it is unset, so an unset secret must be treated as a deployment error.</li>
        </ul>
      </section>

      <section id="memory-tools">
        <h2>Memory tools</h2>
        <div class="table-wrap"><table><thead><tr><th>Tool</th><th>Required input</th><th>Optional input</th><th>Result</th></tr></thead><tbody>
          <tr><td><code>add</code></td><td><code>content</code></td><td><code>scope</code>, <code>tags</code>, <code>source</code>, <code>check_contradictions</code></td><td>ID, type, salience, durability, provider, superseded IDs</td></tr>
          <tr><td><code>search</code></td><td><code>query</code></td><td><code>scope</code>, <code>limit</code>, <code>type</code>, <code>durable_only</code>, <code>use_jev</code></td><td>Hybrid-scored memory results</td></tr>
          <tr><td><code>list</code></td><td>None</td><td><code>scope</code>, <code>limit</code>, <code>type</code>, <code>status</code></td><td>Newest memories in one scope</td></tr>
          <tr><td><code>profile</code></td><td>None</td><td><code>scope</code></td><td>Counts, tags, salience, recent activity</td></tr>
          <tr><td><code>forget</code></td><td>One of <code>ids</code>, <code>query</code>, or <code>all</code></td><td><code>scope</code></td><td>Deleted count and IDs</td></tr>
          <tr><td><code>help</code></td><td>None</td><td>None</td><td>Built-in service summary</td></tr>
          <tr><td><code>sync_jev_dataset</code></td><td>None</td><td><code>limit</code>, 1–500</td><td>Dataset upload result</td></tr>
          <tr><td><code>jev_queue_stats</code></td><td>None</td><td>None</td><td>Pending, uploaded, and failed queue counts</td></tr>
        </tbody></table></div>
        <div class="warning"><strong>Deletion warning:</strong> <code>forget</code> with <code>all: true</code> clears the selected scope. Confirm the scope before invoking it and prefer exact IDs when correcting one record.</div>
      </section>

      <section id="rest-api">
        <h2>REST API</h2>
        <p>All routes below are under <code>/api</code>. Except for the public landing workflow routes, send the token as a bearer header. Mutation and search routes use <code>POST</code> with a JSON body.</p>
        <div class="table-wrap"><table><thead><tr><th>Route</th><th>Method</th><th>Body or query</th><th>Purpose</th></tr></thead><tbody>
          <tr><td><code>/add</code></td><td><span class="method post">POST</span></td><td><code>content</code>, <code>scope</code>, <code>tags</code>, <code>source</code></td><td>Add or update a scoped memory</td></tr>
          <tr><td><code>/search</code></td><td><span class="method post">POST</span></td><td><code>query</code>, <code>scope</code>, <code>limit</code>, <code>type</code>, <code>durable_only</code></td><td>Hybrid search</td></tr>
          <tr><td><code>/list</code></td><td><span class="method post">POST</span></td><td><code>scope</code>, <code>limit</code>, <code>type</code>, <code>status</code></td><td>List memories</td></tr>
          <tr><td><code>/profile</code></td><td><span class="method post">POST</span></td><td><code>scope</code></td><td>Summarize a scope</td></tr>
          <tr><td><code>/forget</code></td><td><span class="method post">POST</span></td><td><code>ids</code>, <code>query</code>, <code>scope</code>, or <code>all</code></td><td>Delete memories</td></tr>
          <tr><td><code>/verify-token</code></td><td><span class="method get">GET</span></td><td>Bearer token</td><td>Validate a token</td></tr>
          <tr><td><code>/check-quota</code></td><td><span class="method get">GET</span></td><td>Bearer token</td><td>Inspect effective usage</td></tr>
          <tr><td><code>/sync_jev</code></td><td><span class="method post">POST</span></td><td><code>limit</code></td><td>Flush queued JEV examples</td></tr>
          <tr><td><code>/jev_queue_stats</code></td><td><span class="method get">GET</span></td><td>Optional <code>scope</code> query</td><td>Inspect dataset queue state</td></tr>
        </tbody></table></div>
        <div class="code-shell">
          <div class="code-title"><span>Add and search over REST</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>curl -X POST "https://dgui-hypermem.ctaxnagomi.workers.dev/api/add" \\
  -H "Authorization: Bearer \${DGUI_HYPERMEM_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"The project uses Cloudflare Workers.","scope":"project:example","tags":["cloudflare","workers"]}'

curl -X POST "https://dgui-hypermem.ctaxnagomi.workers.dev/api/search" \\
  -H "Authorization: Bearer \${DGUI_HYPERMEM_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"What platform does the project use?","scope":"project:example","limit":5}'</code></pre>
        </div>
      </section>

      <section id="scopes">
        <h2>Scopes and tenancy</h2>
        <p>A scope is a logical namespace attached to every memory operation. Use stable names so the same client can recall the same context later.</p>
        <div class="two-col">
          <div class="mini-card"><h3>Recommended patterns</h3><p><code>project:repository-name</code><br><code>user:stable-id</code><br><code>agent:role-name</code><br><code>team:team-name</code></p></div>
          <div class="mini-card"><h3>Default behavior</h3><p>If a request omits <code>scope</code>, the Worker uses <code>DEFAULT_SCOPE</code>, then <code>default</code>.</p></div>
        </div>
        <div class="warning"><strong>Important:</strong> scopes organize data but are not authorization boundaries in the current implementation. A valid token can address any scope string. Use separate self-hosted deployments or add application-level authorization when scopes must isolate tenants.</div>
      </section>

      <section id="quotas">
        <h2>Quotas</h2>
        <p>Usage is tracked per token. The default Worker plan limits are 1,000 requests for Free, 3,500 for Median, 6,500 for Pro, and 999,999 for Enterprise. The first quota check starts a 30-day reset window; operators can override the allowance stored on a token.</p>
        <div class="code-shell">
          <div class="code-title"><span>Check effective quota</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>curl "https://dgui-hypermem.ctaxnagomi.workers.dev/api/check-quota" \\
  -H "Authorization: Bearer \${DGUI_HYPERMEM_TOKEN}"</code></pre>
        </div>
        <p>The response includes <code>plan</code>, <code>quota_monthly</code>, <code>requests_used</code>, <code>requests_remaining</code>, <code>resets_at</code>, 30-day usage, and yearly usage. Use the response as the source of truth for an account because operator overrides take precedence over plan defaults.</p>
      </section>

      <section id="self-host">
        <h2>Self-host DGUI-HyperMem</h2>
        <p>Deploy your own Worker so memory data, D1 records, Vectorize vectors, AI provider usage, and optional Hugging Face exports remain under your Cloudflare account.</p>
        <h3>1. Clone and install</h3>
        <div class="code-shell">
          <div class="code-title"><span>Repository setup</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>git clone https://github.com/ctaxnagomi/dgui-hypermem.git
cd dgui-hypermem
npm install
npx wrangler login</code></pre>
        </div>
        <h3>2. Create Cloudflare resources</h3>
        <div class="code-shell">
          <div class="code-title"><span>D1 and Vectorize</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>npx wrangler@latest d1 create dgui-hypermem
npx wrangler@latest vectorize create dgui-hypermem --dimensions=768 --metric=cosine</code></pre>
        </div>
        <p>Copy the generated D1 database ID and Vectorize index name into <code>wrangler.jsonc</code>. Keep the binding names <code>DB</code> and <code>VECTORIZE</code>, or update <code>src/types.ts</code> and all binding references consistently.</p>
        <h3>3. Apply the schema</h3>
        <div class="code-shell">
          <div class="code-title"><span>D1 migrations</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>npx wrangler@latest d1 migrations apply dgui-hypermem --remote</code></pre>
        </div>
        <div class="warning"><strong>Current repository caveat:</strong> the checked-in migration chain predates several columns and tables queried by the current Worker, including token plan/training/connection fields, CRM device logging, and <code>admin_logs</code>. Before a first production deploy, reconcile a forward migration with the schema expected by the current source. Do not treat an unmodified fresh migration run as production-ready.</div>
        <h3>4. Configure secrets and bindings</h3>
        <ul>
          <li>Set <code>MCP_TOKEN</code>, <code>ADMIN_PASSKEY</code>, and any TypeSafe AI or Hugging Face secrets with Wrangler rather than committing them.</li>
          <li>Bind D1 as <code>DB</code>, Vectorize as <code>VECTORIZE</code>, and Workers AI as <code>AI</code>.</li>
          <li>Use the 768-dimension <code>@cf/baai/bge-base-en-v1.5</code> model with a 768-dimension Vectorize index.</li>
          <li>Set <code>DEFAULT_SCOPE</code> and optional JEV mode variables to match your deployment policy.</li>
        </ul>
        <h3>5. Validate and deploy</h3>
        <div class="code-shell">
          <div class="code-title"><span>Typecheck, deploy, and verify</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>npm run typecheck
npm run deploy
curl "https://YOUR_WORKER_HOST/health"</code></pre>
        </div>
        <p>After deployment, create an initial CRM token through your approved operator workflow, call <code>/api/verify-token</code>, and complete an add/search/forget smoke test before connecting clients.</p>
      </section>

      <section id="security">
        <h2>Security and data handling</h2>
        <ul>
          <li>Set <code>MCP_TOKEN</code>; the current Worker permits unauthenticated access when it is absent.</li>
          <li>Set <code>ADMIN_PASSKEY</code> as a secret and remove passkey values from source, Wrangler variables, examples, and documentation.</li>
          <li>Prefer <code>wrangler secret put</code> over plaintext vars for tokens, passkeys, Stripe secrets, and Hugging Face credentials.</li>
          <li>Do not log authorization headers, API keys, access tokens, private dataset tokens, or passkeys.</li>
          <li>Treat memory content as retained data. Apply retention, deletion, and tenant-isolation requirements at the application layer.</li>
          <li>Disable or tightly control JEV dataset export when memory content must not leave the primary deployment.</li>
          <li>Use HTTPS-only Worker routes and restrict administrative endpoints at the network or application layer.</li>
        </ul>
        <div class="warning"><strong>Current deployment audit:</strong> the repository has known hardening gaps around fail-open authentication, source-level secret fallback, setup-token logging, and migration completeness. Review and remediate them before using a fresh self-hosted deployment for sensitive or multi-tenant data.</div>
      </section>

      <section id="troubleshooting">
        <h2>Troubleshooting</h2>
        <div class="table-wrap"><table><thead><tr><th>Symptom</th><th>Likely cause</th><th>Resolution</th></tr></thead><tbody>
          <tr><td><code>401 unauthorized</code></td><td>Missing, malformed, inactive, or incorrectly scoped token</td><td>Send <code>Authorization: Bearer TOKEN</code> and call <code>/api/verify-token</code>.</td></tr>
          <tr><td><code>429 quota exceeded</code></td><td>Token request allowance is exhausted</td><td>Inspect <code>/api/check-quota</code> and wait for <code>resets_at</code> or ask an operator to adjust the plan.</td></tr>
          <tr><td>MCP client cannot connect</td><td>Wrong URL, missing header, or client-specific schema mismatch</td><td>Use the exact client block below and confirm the URL ends in <code>/mcp</code>.</td></tr>
          <tr><td>Search returns no results</td><td>Different scope, wrong type filter, or <code>durable_only</code> filtering</td><td>Repeat with the same scope and no restrictive filter, then call <code>list</code>.</td></tr>
          <tr><td>Vector search is unavailable</td><td>AI binding, Vectorize binding, dimensions, or model configuration is wrong</td><td>Confirm <code>AI</code> and <code>VECTORIZE</code> and use a 768-dimension index.</td></tr>
          <tr><td>D1 reports a missing column or table</td><td>Fresh migration schema is behind the current Worker</td><td>Apply a reconciled forward migration before deploying the current source.</td></tr>
          <tr><td>JEV sync returns zero or fails</td><td>Provider is off, dataset secret is absent, or queue rows are empty</td><td>Call <code>jev_queue_stats</code>, inspect Worker logs, and verify Hugging Face configuration.</td></tr>
        </tbody></table></div>
      </section>

      <section id="copy-llm">
        <h2>Copy for LLM</h2>
        <p>Give an agent the Markdown brief and exactly one client block. Replace placeholders through environment variables or secret prompts. Never paste a live token into a conversation or tracked file.</p>

        <h3 id="copy-markdown">Markdown brief</h3>
        <div class="code-shell">
          <div class="code-title"><span>Markdown</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code># DGUI-HyperMem integration

Use the DGUI-HyperMem remote MCP server for durable memory.

- Endpoint: https://dgui-hypermem.ctaxnagomi.workers.dev/mcp
- Transport: MCP Streamable HTTP
- Authentication: Authorization: Bearer DGUI_HYPERMEM_TOKEN
- Default hosted scope: default
- Tools: add, search, list, profile, forget, help, sync_jev_dataset, jev_queue_stats

Before starting work:
1. Search the relevant project or user scope.
2. Use returned memories as context, but verify them against the current repository and user request.
3. Do not store credentials, private keys, payment data, or unnecessary personal information.

After a durable decision:
1. Add one concise memory with a stable scope, tags, and source.
2. Include constraints and rationale when they matter.
3. Correct stale records by forgetting the old ID and adding the replacement.

When deleting:
- Prefer forget with exact IDs.
- Use all:true only after confirming the intended scope.

Scopes organize memories but are not tenant authorization boundaries in the current hosted implementation.</code></pre>
        </div>

        <h3 id="copy-mcp">Generic MCP JSON</h3>
        <div class="code-shell">
          <div class="code-title"><span>Generic mcpServers</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>{
  "mcpServers": {
    "dgui-hypermem": {
      "type": "http",
      "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer \${DGUI_HYPERMEM_TOKEN}"
      }
    }
  }
}</code></pre>
        </div>

        <h3 id="copy-json">Portable integration JSON</h3>
        <div class="code-shell">
          <div class="code-title"><span>Integration manifest</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>{
  "name": "dgui-hypermem",
  "version": "1.0.0",
  "transport": "streamable-http",
  "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
  "authentication": {
    "type": "bearer",
    "header": "Authorization",
    "environmentVariable": "DGUI_HYPERMEM_TOKEN"
  },
  "defaultScope": "default",
  "tools": [
    "add",
    "search",
    "list",
    "profile",
    "forget",
    "help",
    "sync_jev_dataset",
    "jev_queue_stats"
  ]
}</code></pre>
        </div>

        <h3 id="copy-vscode">VS Code</h3>
        <p>Add this to <code>.vscode/mcp.json</code>. VS Code prompts for the input value instead of storing it in the file.</p>
        <div class="code-shell">
          <div class="code-title"><span>VS Code mcp.json</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>{
  "servers": {
    "dgui-hypermem": {
      "type": "http",
      "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer \${input:dgui_hypermem_token}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "dgui_hypermem_token",
      "description": "DGUI-HyperMem bearer token",
      "password": true
    }
  ]
}</code></pre>
        </div>

        <h3 id="copy-claude">Claude Code</h3>
        <div class="code-shell">
          <div class="code-title"><span>Claude Code CLI</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>claude mcp add --transport http dgui-hypermem \\
  https://dgui-hypermem.ctaxnagomi.workers.dev/mcp \\
  --header "Authorization: Bearer \${DGUI_HYPERMEM_TOKEN}"</code></pre>
        </div>

        <h3 id="copy-cursor">Cursor</h3>
        <div class="code-shell">
          <div class="code-title"><span>Cursor mcp.json</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>{
  "mcpServers": {
    "dgui-hypermem": {
      "type": "http",
      "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer \${DGUI_HYPERMEM_TOKEN}"
      }
    }
  }
}</code></pre>
        </div>

        <h3 id="copy-jetbrains">JetBrains</h3>
        <p>Use a project MCP JSON file such as <code>.junie/mcp/mcp.json</code>, or add the same server through your IDE’s MCP configuration UI.</p>
        <div class="code-shell">
          <div class="code-title"><span>JetBrains MCP JSON</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>{
  "mcpServers": {
    "dgui-hypermem": {
      "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer \${DGUI_HYPERMEM_TOKEN}"
      }
    }
  }
}</code></pre>
        </div>

        <h3 id="copy-hermes">Hermes</h3>
        <div class="code-shell">
          <div class="code-title"><span>Hermes mcp_servers</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>{
  "mcp_servers": {
    "dgui-hypermem": {
      "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer \${DGUI_HYPERMEM_TOKEN}"
      }
    }
  }
}</code></pre>
        </div>

        <h3 id="copy-openclaw">OpenClaw</h3>
        <div class="code-shell">
          <div class="code-title"><span>OpenClaw MCP config</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>{
  "mcpServers": {
    "dgui-hypermem": {
      "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer \${DGUI_HYPERMEM_TOKEN}"
      }
    }
  }
}</code></pre>
        </div>

        <h3 id="copy-opencode">opencode</h3>
        <div class="code-shell">
          <div class="code-title"><span>opencode.json</span><button class="copy-btn" type="button">Copy</button></div>
          <pre><code>{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dgui-hypermem": {
      "type": "remote",
      "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:DGUI_HYPERMEM_TOKEN}"
      },
      "oauth": false
    }
  }
}</code></pre>
        </div>
      </section>

      <footer class="footer"><span>DGUI-HyperMem documentation</span><span><a href="/">Home</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="https://github.com/ctaxnagomi/dgui-hypermem">Source</a></span></footer>
    </div>
  </main>

  <aside class="toc">
    <div class="toc-title">On this page</div>
    <a href="#overview">Overview</a>
    <a href="#establish">Establish yourself</a>
    <a href="#user-guide">User guide</a>
    <a href="#developer-guide">Developer guide</a>
    <a href="#clients">Client guides</a>
    <a href="#authentication">Authentication</a>
    <a href="#memory-tools">Memory tools</a>
    <a href="#rest-api">REST API</a>
    <a href="#scopes">Scopes</a>
    <a href="#quotas">Quotas</a>
    <a href="#self-host">Self-host</a>
    <a href="#security">Security</a>
    <a href="#troubleshooting">Troubleshooting</a>
    <a href="#copy-llm">Copy for LLM</a>
    <a class="toc-sub" href="#copy-markdown">Markdown</a>
    <a class="toc-sub" href="#copy-mcp">MCP JSON</a>
    <a class="toc-sub" href="#copy-json">Integration JSON</a>
    <a class="toc-sub" href="#copy-vscode">VS Code</a>
    <a class="toc-sub" href="#copy-claude">Claude Code</a>
    <a class="toc-sub" href="#copy-cursor">Cursor</a>
    <a class="toc-sub" href="#copy-jetbrains">JetBrains</a>
    <a class="toc-sub" href="#copy-hermes">Hermes</a>
    <a class="toc-sub" href="#copy-openclaw">OpenClaw</a>
    <a class="toc-sub" href="#copy-opencode">opencode</a>
  </aside>
</div>
<script>
const navSearch=document.getElementById('nav-search');
const navLinks=[...document.querySelectorAll('#page-nav .nav-link')];
const empty=document.querySelector('.search-empty');
navSearch.addEventListener('input',()=>{const q=navSearch.value.trim().toLowerCase();let visible=0;navLinks.forEach(link=>{const show=!q||link.textContent.toLowerCase().includes(q);link.style.display=show?'':'none';if(show)visible++});empty.style.display=visible?'none':'block'});
document.querySelectorAll('.copy-btn').forEach(button=>button.addEventListener('click',async()=>{const code=button.closest('.code-shell').querySelector('code').textContent;try{await navigator.clipboard.writeText(code)}catch{const area=document.createElement('textarea');area.value=code;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()}button.textContent='Copied';button.classList.add('done');setTimeout(()=>{button.textContent='Copy';button.classList.remove('done')},1400)}));
const observed=[...document.querySelectorAll('main section[id]')];
const tocLinks=[...document.querySelectorAll('.toc a')];
const observer=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(!visible)return;tocLinks.forEach(link=>link.classList.toggle('active',link.getAttribute('href')==='#'+visible.target.id))},{rootMargin:'-15% 0px -72% 0px',threshold:0});
observed.forEach(section=>observer.observe(section));
</script>
</body>
</html>`;
