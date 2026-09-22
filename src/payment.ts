import Stripe from "stripe";
import { now, uuid } from "./util";

const PRICES: Record<string, { price_id: string; name: string; quota: number }> = {
  median: { price_id: "price_1UICicLjoFSWfKc7s3edXQzs", name: "Median", quota: 3500 },
  pro: { price_id: "price_1UICitLjoFSWfKc7PYVoJ5hj", name: "Pro", quota: 6500 },
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

export const PAYMENT_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="bright">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no">
<title>Upgrade — DGUI-HyperMem by DeckerGUI</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8L92 34L50 58L8 34Z' fill='%2300a3b3' stroke='%2300a3b3' stroke-width='1'/%3E%3Cpath d='M50 30L92 56L50 80L8 56Z' fill='rgba(200,200,200,0.8)' stroke='%2300a3b3' stroke-width='1'/%3E%3Cpath d='M50 52L92 78L50 92L8 78Z' fill='%23e0e0e0' stroke='%2300a3b3' stroke-width='1'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&display=swap" rel="stylesheet">
<style>
:root{--bg-primary:#ffffff;--bg-surface:#f8f9fb;--border:#e5e7eb;--text-primary:#000000;--text-secondary:#4a4a4a;--text-muted:#9ca3af;--accent:#00a3b3}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--text-primary);touch-action:manipulation}
body{padding:24px;padding-top:calc(24px + env(safe-area-inset-top,0px));padding-bottom:calc(24px + env(safe-area-inset-bottom,0px));max-width:900px;margin:0 auto}
h1{font-size:28px;font-weight:300;margin-bottom:4px;text-align:center}
.sub{color:var(--text-muted);font-size:13px;margin-bottom:32px;text-align:center}
.back{display:inline-block;margin-bottom:24px;color:var(--text-muted);font-size:13px;cursor:pointer;text-decoration:none}
.back:hover{color:var(--accent)}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;max-width:800px;margin:0 auto}
.plan-card{border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;transition:border-color .2s}
.plan-card:hover{border-color:var(--accent)}
.plan-card.featured{border-color:var(--accent);border-width:2px}
.plan-name{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:4px}
.plan-price{font-size:36px;font-weight:300;margin:12px 0 4px;letter-spacing:-1px}
.plan-price span{font-size:14px;color:var(--text-muted);font-weight:400}
.plan-desc{font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.5;min-height:40px}
.plan-features{list-style:none;padding:0;margin:0 0 24px;text-align:left}
.plan-features li{font-size:13px;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.plan-features li i{color:var(--accent);width:16px;flex-shrink:0}
.btn-primary{background:var(--accent);color:#fff;border:none;border-radius:9999px;padding:12px 24px;font-size:15px;cursor:pointer;width:100%;transition:background .2s;text-decoration:none;display:inline-block}
.btn-primary:hover{background:#008896}
.btn-outline{background:transparent;color:#000;border:1px solid #d0d0d0;border-radius:9999px;padding:12px 24px;font-size:15px;cursor:pointer;width:100%;text-decoration:none;display:inline-block}
.btn-outline:hover{border-color:#000}
#status{display:none;text-align:center;padding:24px;font-size:14px;color:var(--text-secondary)}
.stripe-badge{text-align:center;margin-top:20px;font-size:12px;color:var(--text-muted)}
.stripe-badge i{color:var(--accent)}
@media(max-width:640px){.plans{grid-template-columns:1fr}}
</style>
</head>
<body>
<a class="back" href="/" onclick="history.back();return false">&larr; Back</a>
<h1>Upgrade Your Plan</h1>
<div class="sub">Powered by <strong>DeckerGUI</strong> &middot; CTECX Payment Partner</div>
<div class="plans" id="plans">
<div class="plan-card">
<div class="plan-name"><i class="fas fa-leaf"></i> Free</div>
<div class="plan-price">$0 <span>/ month</span></div>
<div class="plan-desc">For individuals and hobbyists.</div>
<ul class="plan-features">
<li><i class="fas fa-check"></i> 1 token per email</li>
<li><i class="fas fa-check"></i> 1,000 requests / month</li>
<li><i class="fas fa-check"></i> All MCP tools</li>
<li><i class="fas fa-check"></i> JEV reasoning layer</li>
</ul>
<a href="/#crm" class="btn-outline"><i class="fas fa-key"></i> Start Free</a>
</div>
<div class="plan-card featured">
<div class="plan-name"><i class="fas fa-rocket"></i> Median</div>
<div class="plan-price">$2.99 <span>/ month</span></div>
<div class="plan-desc">For power users who need more capacity.</div>
<ul class="plan-features">
<li><i class="fas fa-check"></i> Everything in Free</li>
<li><i class="fas fa-check"></i> 3,500 requests / month</li>
<li><i class="fas fa-check"></i> Priority queue</li>
<li><i class="fas fa-check"></i> Email support</li>
</ul>
<button class="btn-primary" onclick="subscribe('median')"><i class="fas fa-credit-card"></i> Subscribe $2.99/mo</button>
</div>
<div class="plan-card">
<div class="plan-name"><i class="fas fa-crown"></i> Pro</div>
<div class="plan-price">$11.99 <span>/ month</span></div>
<div class="plan-desc">For professionals and teams.</div>
<ul class="plan-features">
<li><i class="fas fa-check"></i> Everything in Median</li>
<li><i class="fas fa-check"></i> 6,500 requests / month</li>
<li><i class="fas fa-check"></i> Highest priority queue</li>
<li><i class="fas fa-check"></i> Chat & email support</li>
</ul>
<button class="btn-primary" onclick="subscribe('pro')"><i class="fas fa-credit-card"></i> Subscribe $11.99/mo</button>
</div>
</div>
<div class="stripe-badge"><i class="fas fa-lock"></i> Pay with Stripe for secured checkout</div>
<div id="status"></div>
<script>
async function subscribe(plan){
  const email=prompt('Enter your email to subscribe to '+plan+':');
  if(!email) return;
  document.getElementById('plans').style.display='none';
  document.getElementById('status').style.display='block';
  document.getElementById('status').innerHTML='<i class="fas fa-spinner fa-spin"></i> Creating checkout session...';
  try{
    const r=await fetch('/api/create-checkout-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan,email,success_url:window.location.origin+'/pay/success?session_id={CHECKOUT_SESSION_ID}',cancel_url:window.location.href})});
    const d=await r.json();
    if(d.error){document.getElementById('status').innerHTML='<span style="color:#f87171">'+d.error+'</span>';document.getElementById('plans').style.display='grid';return}
    window.location.href=d.url;
  }catch(e){document.getElementById('status').innerHTML='<span style="color:#f87171">Error connecting</span>';document.getElementById('plans').style.display='grid'}
}
</script>
</body>
</html>`;