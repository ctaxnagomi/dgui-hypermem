export const HOWTO_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>How to Use — DGUI-HyperMem</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--border-glass:#212327;--accent-cyan:#00f0ff;--text-primary:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--text-primary);line-height:1.7}
body{max-width:720px;margin:0 auto;padding:32px 24px}
h1{font-size:28px;font-weight:300;margin-bottom:4px;color:var(--accent-cyan)}
h2{font-size:18px;font-weight:500;margin:28px 0 12px;color:var(--text-primary)}
h3{font-size:15px;font-weight:500;margin:20px 0 8px;color:var(--text-secondary)}
p, li{font-size:14px;color:var(--text-secondary);margin-bottom:10px}
a{color:var(--accent-cyan);text-decoration:none}
code{background:var(--bg-surface);padding:2px 6px;border-radius:4px;font-family:JetBrains Mono,monospace;font-size:13px;color:var(--accent-cyan)}
pre{background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:8px;padding:16px;overflow-x:auto;margin:12px 0;font-family:JetBrains Mono,monospace;font-size:12px;color:var(--text-secondary);line-height:1.5}
.back{display:inline-block;margin-bottom:24px;color:var(--text-muted);font-size:13px}
strong{color:var(--text-primary)}
</style>
</head>
<body>
<a href="/" class="back">&larr; Back to Home</a>
<h1>How to Use DGUI-HyperMem</h1>
<p><strong>DGUI-HyperMem</strong> is a hybrid memory MCP server for AI agents. Store, search, and manage memories with a JEV reasoning layer.</p>

<h2>Quick Start</h2>
<h3>1. Get a Token</h3>
<p>Go to the <a href="/#crm">landing page</a>, review and agree to the Terms &amp; Agreement, then enter your email and passkey (<code>0866</code> for regular users, or the master key for admins). You'll receive a bearer token immediately.</p>

<h3>2. Connect Your MCP Client</h3>
<p>Add this configuration to your MCP client (opencode, Claude Desktop, etc.):</p>
<pre>{
  "mcp": {
    "dgui-hypermem": {
      "type": "remote",
      "url": "https://dgui-hypermem.ctaxnagomi.workers.dev/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}</pre>

<h3>3. Available Tools</h3>
<ul>
<li><strong>add</strong> — Store a memory. JEV assigns type, scores salience, and checks for contradictions.</li>
<li><strong>search</strong> — Hybrid recall (vectors + keywords) then JEV re-ranked.</li>
<li><strong>list</strong> — Browse recent memories in a scope.</li>
<li><strong>profile</strong> — Summarise a scope: counts, types, tags, salience.</li>
<li><strong>forget</strong> — Delete by id, query, or clear a scope.</li>
<li><strong>sync_jev_dataset</strong> — Flush JEV decisions to the HuggingFace dataset.</li>
<li><strong>jev_queue_stats</strong> — Check queue status.</li>
</ul>

<h2>Managing Your Token</h2>
<ul>
<li>You can <strong>revoke</strong> your token anytime from the landing page by clicking "Revoke Token"</li>
<li>Each email gets <strong>one token</strong> — requesting again returns the same token</li>
<li>If revoked, requesting a new token will issue a fresh one</li>
<li>Monthly quota: <strong>1,000 requests</strong> per token</li>
<li>Check your remaining quota via <code>curl -H "authorization: Bearer YOUR_TOKEN" https://dgui-hypermem.ctaxnagomi.workers.dev/api/check-quota</code></li>
</ul>

<h2>Admin Features</h2>
<p>If you have the master passkey, visit <a href="/admin">the admin dashboard</a> to:</p>
<ul>
<li>View all tokens, emails, and statuses</li>
<li>Toggle "Train with Everyone" per user</li>
<li>Revoke any token</li>
<li>View usage stats and login attempt logs</li>
<li>Monitor failed login attempts with device info</li>
</ul>

<h2>Self-Hosting</h2>
<p>DGUI-HyperMem is open source under MIT license. To self-host:</p>
<pre>git clone https://github.com/ctaxnagomi/dgui-hypermem
cd dgui-hypermem
npm install
# Create D1 database and Vectorize index
npx wrangler d1 create dgui-hypermem
npx wrangler vectorize create dgui-hypermem --dimensions=768 --metric=cosine
# Update wrangler.jsonc with database IDs
npx wrangler d1 migrations apply dgui-hypermem --remote
npx wrangler secret put MCP_TOKEN
npx wrangler deploy</pre>
<p>Full documentation on <a href="https://github.com/ctaxnagomi/dgui-hypermem">GitHub</a>.</p>

<h2>Support</h2>
<p>For questions, visit the <a href="https://deckergui.my">DeckerGUI</a> project page.</p>
</body>
</html>`;