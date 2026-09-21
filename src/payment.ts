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

const PRICES_DISPLAY: Record<string, { price_id: string; name: string; quota: number; amount: number; currency: string }> = {
  median: { price_id: "price_1UICicLjoFSWfKc7s3edXQzs", name: "Median", quota: 3500, amount: 299, currency: "usd" },
  pro: { price_id: "price_1UICitLjoFSWfKc7PYVoJ5hj", name: "Pro", quota: 6500, amount: 1199, currency: "usd" },
};

export const PAYMENT_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Upgrade — DGUI-HyperMem by DeckerGUI</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 8L92 34L50 58L8 34Z' fill='%2300f0ff' stroke='%2300f0ff' stroke-width='1'/%3E%3Cpath d='M50 30L92 56L50 80L8 56Z' fill='rgba(26,26,26,0.85)' stroke='%2300f0ff' stroke-width='1'/%3E%3Cpath d='M50 52L92 78L50 92L8 78Z' fill='%231a1a1a' stroke='%2300f0ff' stroke-width='1'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;800&display=swap" rel="stylesheet">
<script async src="https://js.stripe.com/v3/pricing-table.js"></script>
<style>
:root{--bg-primary:#0a0a0a;--bg-surface:#1a1c20;--text-primary:#fff;--text-secondary:#dadbdf;--text-muted:#7d8187}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg-primary);font-family:'Inter',sans-serif;color:var(--text-primary)}
body{padding:24px;max-width:900px;margin:0 auto}
h1{font-size:24px;font-weight:300;margin-bottom:4px;color:#00f0ff}
.sub{color:var(--text-muted);font-size:13px;margin-bottom:32px}
.back{display:inline-block;margin-bottom:24px;color:var(--text-muted);font-size:13px;cursor:pointer;text-decoration:none}
.back:hover{color:var(--accent-cyan)}
stripe-pricing-table{margin-top:20px}
</style>
</head>
<body>
<a class="back" href="/" onclick="history.back();return false">&larr; Back</a>
<h1>Upgrade Your Plan</h1>
<div class="sub">Powered by <strong>DeckerGUI</strong> &middot; CTECX Payment Partner</div>
<stripe-pricing-table pricing-table-id="prctbl_1UIEXALjoFSWfKc7SMrZpcly"
publishable-key="pk_live_51SfeRxLjoFSWfKc7v5Aao63uuiP5sCmGGDUwKcId6X147uI3NQH4ixNO00PxXWZUsZ1uzXa2QR9sbk1H1KpC7YdL0030SOmEfj">
</stripe-pricing-table>
</body>
</html>`;