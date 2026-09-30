// Temporary maintenance notice, shown on every page while the service is
// being migrated or upgraded. Operator-toggled with the MAINTENANCE env var.
// Branding matches the landing page (bright, cyan accent #00a3b3).
export const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DGUI-HyperMem — Maintenance</title>
<meta name="theme-color" content="#ffffff">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8C30 8 14 24 14 44c0 8 2.5 15.5 7 21.5v16c0 3.5 3 6.5 6.5 6.5h45c3.5 0 6.5-3 6.5-6.5v-16c4.5-6 7-13.5 7-21.5C86 24 70 8 50 8z' fill='%2300f0ff' opacity='0.15'/%3E%3Cpath d='M50 14C32 14 18 28 18 46s7 20 10 23v14c0 3 2 5 5 5h34c3 0 5-2 5-5V69c3-3 10-8 10-23S68 14 50 14z' fill='none' stroke='%2300f0ff' stroke-width='2'/%3E%3Cpath d='M50 28c-8 0-15 4-18 10h5c2-3 6-5 13-5s11 2 13 5h5c-3-6-10-10-18-10z' fill='%2300f0ff' opacity='0.6'/%3E%3C/svg%3E">
<style>
:root{--accent-cyan:#00a3b3;--accent:#000000;--text-secondary:#4a4a4a;--border-glass:#e5e7eb}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;width:100%;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--accent);-webkit-font-smoothing:antialiased;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;padding:24px}
.card{max-width:520px;width:100%;text-align:center;padding:48px 32px;border:1px solid var(--border-glass);border-radius:16px;background:#f8f9fb}
.badge{display:inline-block;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:var(--accent-cyan);margin-bottom:20px;padding:6px 14px;border:1px solid var(--accent-cyan);border-radius:9999px}
h1{font-size:28px;line-height:36px;font-weight:600;letter-spacing:-0.5px;margin-bottom:14px}
p{font-size:16px;line-height:26px;color:var(--text-secondary);margin-bottom:24px}
.icon{font-size:44px;margin-bottom:16px;line-height:1}
.spinner{width:28px;height:28px;border:3px solid var(--border-glass);border-top-color:var(--accent-cyan);border-radius:50%;margin:0 auto;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="card">
  <div class="icon">🛠️</div>
  <div class="badge">DeckerGUI project</div>
  <h1>We are migrating this page under DeckerGUI project.</h1>
  <p>DGUI-HyperMem is temporarily offline while it moves to its new home. Please check back shortly — existing data and settings will be preserved.</p>
  <div class="spinner" role="status" aria-label="migration in progress"></div>
</div>
</body>
</html>`;