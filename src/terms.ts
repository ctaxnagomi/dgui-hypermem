export const TERMS_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Terms of Service — DGUI-HyperMem</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&display=swap" rel="stylesheet">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--border-glass:#212327;--accent-cyan:#00f0ff;--text-primary:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--text-primary);line-height:1.7}
body{touch-action:manipulation;-webkit-text-size-adjust:100%;overscroll-behavior:none;max-width:720px;margin:0 auto;padding:32px 24px}
h1{font-size:28px;font-weight:300;margin-bottom:4px;color:var(--accent-cyan)}
h2{font-size:18px;font-weight:500;margin:28px 0 12px;color:var(--text-primary)}
h3{font-size:15px;font-weight:500;margin:20px 0 8px;color:var(--text-secondary)}
p, li{font-size:14px;color:var(--text-secondary);margin-bottom:10px}
a{color:var(--accent-cyan);text-decoration:none}
.back{display:inline-block;margin-bottom:24px;color:var(--text-muted);font-size:13px}
strong{color:var(--text-primary)}
ul{padding-left:20px;margin:8px 0 16px}
</style>
</head>
<body>
<a href="/" class="back">&larr; Back to Home</a>
<h1>Terms of Service</h1>
<p><strong>Last updated:</strong> September 2026</p>

<h2>1. Service Description</h2>
<p>DGUI-HyperMem is a self-hosted hybrid memory MCP server ("the Service"). It provides memory storage, search, and management capabilities via the Model Context Protocol (MCP). The Service runs on Cloudflare Workers infrastructure and uses a JEV reasoning layer for memory classification.</p>

<h2>2. Acceptance of Terms</h2>
<p>By clicking "Agree &amp; Continue" on the Token request page, you agree to be bound by these Terms of Service and the <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the Service.</p>

<h2>3. Account &amp; Token</h2>
<ul>
<li>You must provide a valid email address to receive an API token</li>
<li>Tokens are issued per email address (one token per email)</li>
<li>You are responsible for keeping your token confidential</li>
<li>The admin reserves the right to revoke any token for violation of these terms</li>
</ul>

<h2>4. Acceptable Use</h2>
<ul>
<li>You may use the Service for personal and commercial projects</li>
<li>You may not use the Service for any illegal purpose</li>
<li>You may not attempt to bypass rate limits, quotas, or security measures</li>
<li>You may not share, sublicense, or resell your API token</li>
<li>You may not use the Service to store or transmit any unlawful material</li>
</ul>

<h2>5. Fair Usage &amp; Quotas</h2>
<p>The Service is provided with the following limits:</p>
<ul>
<li>Maximum 100 active users globally</li>
<li>1,000 requests per token per month</li>
<li>Quota resets monthly</li>
</ul>
<p>Exceeding these limits may result in temporary suspension. Contact the admin to discuss increased limits.</p>

<h2>6. Data &amp; Privacy</h2>
<p>Your use of the Service is governed by our <a href="/privacy">Privacy Policy</a>. Memory content you store is private. Anonymized usage context may be used for service improvement unless you opt out.</p>

<h2>7. Limitation of Liability</h2>
<p>The Service is provided "as is" without warranty of any kind. In no event shall the maintainers be liable for any claim, damages, or other liability arising from the use of the Service.</p>

<h2>8. Changes to Terms</h2>
<p>We reserve the right to update these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

<h2>9. Governing Law</h2>
<p>These terms shall be governed by the laws of Malaysia.</p>

<h2>10. Contact</h2>
<p>For questions about these terms, contact the admin via <a href="https://deckergui.my">DeckerGUI</a>.</p>
</body>
</html>`;