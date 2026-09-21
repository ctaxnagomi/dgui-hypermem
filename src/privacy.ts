export const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy — DGUI-HyperMem</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&display=swap" rel="stylesheet">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--border-glass:#212327;--accent-cyan:#00f0ff;--text-primary:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--text-primary);line-height:1.7}
body{max-width:720px;margin:0 auto;padding:32px 24px}
h1{font-size:28px;font-weight:300;margin-bottom:4px;color:var(--accent-cyan)}
h2{font-size:18px;font-weight:500;margin:28px 0 12px;color:var(--text-primary)}
h3{font-size:15px;font-weight:500;margin:20px 0 8px;color:var(--text-secondary)}
p{margin-bottom:12px;font-size:14px;color:var(--text-secondary)}
a{color:var(--accent-cyan);text-decoration:none}
a:hover{text-decoration:underline}
.back{display:inline-block;margin-bottom:24px;color:var(--text-muted);font-size:13px}
hr{border:none;border-top:1px solid var(--border-glass);margin:32px 0}
ul{margin-bottom:12px;padding-left:20px}
li{font-size:14px;color:var(--text-secondary);margin-bottom:6px}
strong{color:var(--text-primary)}
</style>
</head>
<body>
<a href="/" class="back">&larr; Back to Home</a>
<h1>Privacy Policy &amp; Data Usage</h1>
<p><strong>Last updated:</strong> September 2026</p>

<h2>1. What We Collect</h2>
<p>DGUI-HyperMem collects only the minimum data needed to operate the memory service:</p>
<ul>
<li><strong>Email address</strong> — used to issue and manage your API token</li>
<li><strong>Usage data</strong> — anonymized context categories (e.g., "memory_add", "memory_search") for quota tracking and service improvement</li>
<li><strong>Memory content</strong> — the memories you explicitly store via the MCP <code>add</code> tool. This data is stored in your D1 database and is never shared externally.</li>
</ul>

<h2>2. Training &amp; Data Sharing</h2>
<p>By default, your usage context (not your memory content) may be aggregated for model improvement. You can control this:</p>
<ul>
<li><strong>Train with everyone ON (default)</strong> — anonymized usage patterns are used to improve the JEV reasoning layer</li>
<li><strong>Train with everyone OFF</strong> — no data from your token is used for training. All processing stays local.</li>
</ul>
<p>Toggle this setting anytime via the <a href="/admin">Admin Dashboard</a> — your admin can view and change your preference.</p>

<h2>3. Secrets &amp; Content Safety</h2>
<p>Memory content is scanned before storage. If potential secrets (API keys, tokens, passwords) are detected, they are redacted from training data. The memory itself is stored as-is for your use, but training extraction skips rows with detected secrets.</p>

<h2>4. Data Storage &amp; Retention</h2>
<ul>
<li>Memories are stored until you explicitly delete them via the <code>forget</code> tool</li>
<li>Usage logs are retained for 90 days, then aggregated and anonymized</li>
<li>You can request full data deletion by contacting the admin</li>
</ul>

<h2>5. Third-Party Services</h2>
<p>DGUI-HyperMem uses:</p>
<ul>
<li><strong>Cloudflare Workers</strong> — serverless compute (D1 database, Vectorize, Workers AI)</li>
<li><strong>TypeSafe AI</strong> — Jev / System One model for memory classification (only memory type/salience data, never raw content without your consent)</li>
<li><strong>HuggingFace</strong> — optional dataset sync (only if <code>train_with_all</code> is enabled)</li>
</ul>

<h2>6. Self-Hosting</h2>
<p>All data stays within your Cloudflare account. DGUI-HyperMem is open-source under MIT license. You can self-host at any time — see <a href="https://github.com/ctaxnagomi/dgui-hypermem">github.com/ctaxnagomi/dgui-hypermem</a> for deployment instructions.</p>

<h2>7. Contact</h2>
<p>For privacy inquiries, reach out via the <a href="https://deckergui.my">DeckerGUI</a> project page.</p>

<hr>
<p style="font-size:11px;color:var(--text-muted)">DGUI-HyperMem — DeckerGUI Project. MIT License.</p>
</body>
</html>`;