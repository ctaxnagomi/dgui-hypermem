export const SETUP_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="bright">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>Setup Private Dataset — DGUI-HyperMem</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8L92 34L50 58L8 34Z' fill='%2300a3b3' stroke='%2300a3b3' stroke-width='1'/%3E%3Cpath d='M50 30L92 56L50 80L8 56Z' fill='rgba(200,200,200,0.8)' stroke='%2300a3b3' stroke-width='1'/%3E%3Cpath d='M50 52L92 78L50 92L8 78Z' fill='%23e0e0e0' stroke='%2300a3b3' stroke-width='1'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#fff;--surface:#f8f9fb;--border:#e5e7eb;--accent:#00a3b3;--text:#000;--muted:#9ca3af}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);font-family:'Inter',sans-serif;color:var(--text);padding:32px 24px;max-width:640px;margin:0 auto;line-height:1.6}
h1{font-size:24px;font-weight:300;margin-bottom:4px}
.sub{color:var(--muted);font-size:14px;margin-bottom:32px}
.step{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:20px}
.step h2{font-size:16px;font-weight:500;margin-bottom:12px;color:var(--accent)}
.step p{font-size:13px;color:#4a4a4a;margin-bottom:8px}
.step code{font-size:12px;background:#fff;border:1px solid var(--border);border-radius:6px;padding:12px;display:block;margin:8px 0;overflow-x:auto;white-space:pre;color:var(--text)}
input{width:100%;padding:12px 16px;margin-bottom:12px;background:#fff;border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none}
input:focus{border-color:var(--accent)}
.btn{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:12px 20px;font-size:14px;cursor:pointer;width:100%}.btn:hover{opacity:.9}
.status{padding:12px;border-radius:8px;font-size:13px;margin-top:12px;display:none}
.status.ok{display:block;background:rgba(74,222,128,.1);color:#166534;border:1px solid rgba(74,222,128,.3)}
.status.err{display:block;background:rgba(248,113,113,.1);color:#991b1b;border:1px solid rgba(248,113,113,.3)}
.back{display:inline-block;margin-bottom:24px;color:var(--muted);font-size:13px;text-decoration:none}
a{color:var(--accent);text-decoration:none}
</style>
</head>
<body>
<a href="/" class="back">&larr; Back to Home</a>
<h1>Private Dataset Setup</h1>
<div class="sub">Connect your own HuggingFace repository for private JEV training data.</div>

<div class="step">
<h2>Step 1: Create a HuggingFace Dataset</h2>
<p>Go to <a href="https://huggingface.co/new-dataset" target="_blank">huggingface.co/new-dataset</a> and create a <strong>private</strong> dataset. Name it something like <code>your-username/dgui-hypermem-private</code>.</p>
</div>

<div class="step">
<h2>Step 2: Generate a Fine-Grained Token</h2>
<p>Go to <a href="https://huggingface.co/settings/tokens" target="_blank">huggingface.co/settings/tokens</a> and create a fine-grained token with:</p>
<ul style="font-size:13px;color:#4a4a4a;padding-left:18px;margin:8px 0">
<li>✅ <strong>Read access</strong> to your dataset</li>
<li>✅ <strong>Write access</strong> to your dataset</li>
</ul>
</div>

<div class="step">
<h2>Step 3: Connect</h2>
<p>Enter your dataset name and HF fine-grained token below. The system will verify access and begin syncing your private JEV training data.</p>
<div id="form">
<input type="text" id="ds-name" placeholder="your-username/your-dataset-name">
<input type="password" id="hf-token" placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
<input type="password" id="admin-key" placeholder="Admin passkey">
<button class="btn" onclick="setup()">Connect Dataset</button>
<div id="status" class="status"></div>
</div>
</div>

<div class="step">
<h2>Staging URL</h2>
<p>Before updating the main Worker, test changes on a staging URL. Set the <code>STAGING</code> environment variable on your Worker to a URL like <code>https://staging.your-domain.com</code>. All sync operations will first POST to the staging URL for validation before committing to the main dataset.</p>
<code>npx wrangler secret put STAGING</code>
<p style="margin-top:8px">With a staging URL set, <code>/api/sync_jev</code> will first push to staging, wait for a 200 response, then push to production.</p>
</div>

<script>
async function setup(){
  const ds=document.getElementById('ds-name').value.trim();
  const tk=document.getElementById('hf-token').value.trim();
  const ak=document.getElementById('admin-key').value.trim();
  const st=document.getElementById('status');
  if(!ds||!tk||!ak){st.textContent='All fields required';st.className='status err';return}
  st.textContent='Verifying...';st.className='status err';
  try{
    const r=await fetch('/api/setup-dataset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hf_token:tk,dataset_name:ds,passkey:ak})});
    const d=await r.json();
    if(d.error){st.textContent=d.error;st.className='status err'}
    else{st.textContent='Dataset configured! Sync via /api/sync_jev';st.className='status ok'}
  }catch(e){st.textContent='Error: '+e.message;st.className='status err'}
}
</script>
</body>
</html>`;