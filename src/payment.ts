import Stripe from "stripe";
import { now, uuid } from "./util";

const PRICES: Record<string, { price_id: string; name: string; quota: number }> = {
  median: { price_id: "price_1QqwertyExampleMedian", name: "Median", quota: 3500 }, // TODO: Replace with actual Stripe Price ID
  pro: { price_id: "price_1QqwertyExamplePro", name: "Pro", quota: 6500 },           // TODO: Replace with actual Stripe Price ID
};

export function getStripe(env: { STRIPE_SECRET_KEY?: string }): Stripe | null {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export async function createCheckoutSession(env: any, body: Record<string, any>): Promise<Record<string, any>> {
  const { plan, email, success_url, cancel_url } = body;
  if (!plan || !email) return { error: "plan and email are required" };
  const planConfig = PRICES[plan];
  if (!planConfig) return { error: `unknown plan: ${plan}` };
  const stripe = getStripe(env);
  if (!stripe) return { error: "stripe not configured" };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: planConfig.price_id, quantity: 1 }],
      customer_email: email,
      metadata: { plan, email },
      success_url: success_url || `https://dgui-hypermem.ctaxnagomi.workers.dev/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `https://dgui-hypermem.ctaxnagomi.workers.dev/pay/cancel`,
    });
    return { url: session.url, session_id: session.id };
  } catch (e: any) {
    return { error: `stripe error: ${e.message}` };
  }
}

export async function handleStripeWebhook(env: any, request: Request): Promise<Response> {
  const stripe = getStripe(env);
  if (!stripe) return new Response(JSON.stringify({ error: "stripe not configured" }), { status: 500, headers: { "content-type": "application/json" } });
  const sig = request.headers.get("stripe-signature") || "";
  const raw = await request.text();
  try {
    const event = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET || "");
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const email = session.metadata?.email;
      const plan = session.metadata?.plan;
      if (email && plan) {
        await env.DB.prepare("UPDATE tokens SET plan = ?, quota_monthly = ? WHERE email = ?")
          .bind(plan, PRICES[plan]?.quota || 1000, email).run();
        await env.DB.prepare("INSERT INTO crm_logs (email, action, detail, ip, device, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(email, "stripe_subscription", `plan: ${plan}`, "stripe-webhook", "stripe", now()).run();
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { "content-type": "application/json" } });
  }
}

const PRICES_DISPLAY: Record<string, { price_id: string; name: string; quota: number; amount: number; currency: string }> = {
  median: { price_id: "price_median", name: "Median", quota: 3500, amount: 299, currency: "usd" },
  pro: { price_id: "price_pro", name: "Pro", quota: 6500, amount: 1199, currency: "usd" },
};

export const PAYMENT_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Upgrade — DGUI-HyperMem</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8L92 34L50 58L8 34Z' fill='%2300f0ff' stroke='%2300f0ff' stroke-width='1'/%3E%3Cpath d='M50 30L92 56L50 80L8 56Z' fill='rgba(26,26,26,0.85)' stroke='%2300f0ff' stroke-width='1'/%3E%3Cpath d='M50 52L92 78L50 92L8 78Z' fill='%231a1a1a' stroke='%2300f0ff' stroke-width='1'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap" rel="stylesheet">
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--border-glass:#212327;--accent-cyan:#00f0ff;--text-primary:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--text-primary)}
body{max-width:480px;margin:0 auto;padding:32px 24px}
h1{font-size:24px;font-weight:300;margin-bottom:24px;color:var(--accent-cyan)}
.back{display:inline-block;margin-bottom:24px;color:var(--text-muted);font-size:13px;cursor:pointer}
.back:hover{color:var(--accent-cyan)}
.card{background:var(--bg-surface);border:1px solid var(--border-glass);border-radius:12px;padding:24px;margin-bottom:16px}
.card h2{font-size:18px;font-weight:500;margin-bottom:4px;color:var(--accent)}
.card .price{font-size:32px;font-weight:300;color:var(--accent-cyan);margin:8px 0}
.card .price span{font-size:14px;color:var(--text-muted)}
.card p{font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.5}
.card ul{list-style:none;padding:0;margin:0 0 20px}
.card ul li{font-size:13px;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.btn-primary{background:var(--accent);color:#0a0a0a;border:none;border-radius:9999px;padding:12px 24px;font-size:15px;cursor:pointer;width:100%;font-weight:500;transition:all .2s}
.btn-primary:hover{opacity:.9}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
input{width:100%;padding:12px 16px;margin-bottom:12px;background:var(--bg-primary);border:1px solid var(--border-glass);border-radius:8px;color:var(--accent);font-family:Inter,sans-serif;font-size:14px;outline:none}
input:focus{border-color:var(--accent-cyan)}
.status{font-size:13px;margin-top:12px;padding:12px;border-radius:8px;display:none}
.status.error{display:block;background:rgba(248,113,113,.1);color:#f87171;border:1px solid rgba(248,113,113,.2)}
.status.success{display:block;background:rgba(74,222,128,.1);color:#4ade80;border:1px solid rgba(74,222,128,.2)}
</style>
</head>
<body>
<a class="back" onclick="history.back()">&larr; Back</a>
<h1>Upgrade Your Plan</h1>
<div id="step-email" class="card">
<h2>Enter your email</h2>
<p>We'll match your subscription to your existing token or create a new one.</p>
<input type="email" id="sub-email" placeholder="Your email address">
<div id="step-email-status" class="status" style="display:none"></div>
<button class="btn-primary" onclick="selectPlan()">Continue</button>
</div>
<div id="step-plans" style="display:none">
<div class="card" onclick="subscribePlan('median')" style="cursor:pointer">
<h2>Median</h2>
<div class="price">$2.99 <span>/ month</span></div>
<p>3,500 requests / month. Priority queue. Email support.</p>
<button class="btn-primary" style="pointer-events:none">Subscribe $2.99</button>
</div>
<div class="card" onclick="subscribePlan('pro')" style="cursor:pointer;border-color:var(--accent-cyan)">
<h2>Pro</h2>
<div class="price">$11.99 <span>/ month</span></div>
<p>6,500 requests / month. Highest priority. Chat support.</p>
<button class="btn-primary" style="pointer-events:none">Subscribe $11.99</button>
</div>
</div>
<div id="step-status" style="display:none">
<div class="card" style="text-align:center"><div id="step-status-text" style="font-size:14px;color:var(--text-secondary)">⏳ Starting payment...</div></div>
</div>
<script>
async function selectPlan(){
  const email=document.getElementById('sub-email').value.trim();
  if(!email) return showStatus('step-email-status','Please enter your email','error');
  document.getElementById('step-email').style.display='none';
  document.getElementById('step-plans').style.display='block';
}
async function subscribePlan(plan){
  const email=document.getElementById('sub-email').value.trim();
  document.getElementById('step-plans').style.display='none';
  document.getElementById('step-status').style.display='block';
  document.getElementById('step-status-text').textContent='⏳ Creating checkout session...';
  try{
    const r=await fetch('/api/create-checkout-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan,email})});
    const d=await r.json();
    if(d.error){document.getElementById('step-status-text').textContent='❌ '+d.error;return}
    window.location.href=d.url;
  }catch(e){document.getElementById('step-status-text').textContent='❌ Error connecting to payment server'}
}
function showStatus(id,msg,type){
  const el=document.getElementById(id);el.textContent=msg;el.className='status '+type;el.style.display='block';
}
</script>
</body>
</html>`;