import Stripe from "stripe";
import { logCrmAction, now } from "./util";
import { CREDIT_PACKS, PAYG_MICRO_PER_REQUEST, PLANS, TRIAL_DAYS, centsToMicro, planQuota } from "./billing";
import { creditAccount, debitAccount } from "./billing_api";

/**
 * Stripe price ids for the self-serve plans.
 *
 * Quotas are no longer duplicated here. They used to live in a local PRICES map
 * alongside the price id, which is how the pricing page ended up advertising
 * numbers that did not match what the gate enforced; quotas now come from
 * billing.PLANS and this table only maps a plan to its Stripe price.
 */
const PLAN_PRICE_IDS: Record<string, string> = {
  median: "price_1UICicLjoFSWfKc7s3edXQzs",
  pro: "price_1UICitLjoFSWfKc7PYVoJ5hj",
};

/**
 * One-time price ids for pay-as-you-go credit packs.
 *
 * These must exist in Stripe as one-off prices. Empty until they are created --
 * /api/buy-credits then refuses rather than silently accepting a payment it
 * cannot deliver credit for.
 */
const CREDIT_PRICE_IDS: Record<string, string> = {};

export function getStripe(env: { STRIPE_SECRET_KEY?: string }): Stripe | null {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

/** Resolve the plan from the price Stripe actually charged, not from metadata. */
function planForPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [plan, id] of Object.entries(PLAN_PRICE_IDS)) {
    if (id === priceId) return plan;
  }
  return null;
}

const CHECKOUT_BASE = "https://dgui-hypermem.ctaxnagomi.workers.dev";

/**
 * Subscription checkout for a paid plan.
 *
 * The plan name goes in metadata for auditing only. The webhook re-derives the
 * plan from the price Stripe actually charged, so a forged metadata value
 * cannot grant a plan that was not paid for.
 */
export async function createCheckoutSession(env: any, body: Record<string, any>): Promise<Record<string, any>> {
  const { plan, email, success_url, cancel_url } = body;
  if (!plan || !email) return { error: "plan and email are required" };
  const key = String(plan).toLowerCase();
  const priceId = PLAN_PRICE_IDS[key];
  if (!priceId) return { error: `plan not available for self-serve purchase: ${plan}` };
  const stripe = getStripe(env);
  if (!stripe) return { error: "stripe not configured" };
  const account = await env.DB.prepare("SELECT id FROM tokens WHERE email = ?").bind(email).first();
  if (!account) return { error: "no account for that email -- request a token before upgrading" };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      metadata: { plan: key, email, user_id: account.id },
      success_url: success_url || `${CHECKOUT_BASE}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${CHECKOUT_BASE}/pay/cancel`,
    });
    return { url: session.url, session_id: session.id, plan: key, quota_monthly: planQuota(key) };
  } catch (e: any) {
    return { error: `stripe error: ${e.message}` };
  }
}

/**
 * One-time purchase of pay-as-you-go credit.
 *
 * Refuses outright until a Stripe price id exists for the pack. An earlier
 * draft would have accepted the payment and then failed to deliver credit,
 * which is the worst possible outcome: the customer pays and gets nothing, and
 * the failure is only visible to them later.
 */
export async function createCreditCheckout(env: any, body: Record<string, any>): Promise<Record<string, any>> {
  const { pack, email, success_url, cancel_url } = body;
  if (!pack || !email) return { error: "pack and email are required" };
  const packConfig = CREDIT_PACKS[String(pack).toLowerCase()];
  if (!packConfig) return { error: `unknown credit pack: ${pack}` };
  const priceId = CREDIT_PRICE_IDS[String(pack).toLowerCase()];
  if (!priceId) {
    return {
      error: "credit packs are not yet on sale",
      detail: "No Stripe price is configured for this pack, so a payment could not be delivered as credit.",
    };
  }
  const stripe = getStripe(env);
  if (!stripe) return { error: "stripe not configured" };
  const account = await env.DB.prepare("SELECT id FROM tokens WHERE email = ?").bind(email).first();
  if (!account) return { error: "no account for that email -- request a token before buying credit" };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      // amount_cents is echoed here so the webhook credits exactly what was
      // charged, cross-checked against the price id rather than the metadata.
      metadata: { pack: String(pack).toLowerCase(), email, user_id: account.id, amount_cents: String(packConfig.priceCents) },
      success_url: success_url || `${CHECKOUT_BASE}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${CHECKOUT_BASE}/pay/cancel`,
    });
    return {
      url: session.url,
      session_id: session.id,
      credits_usd: packConfig.priceCents / 100,
      // What that buys at the current rate, so the buyer knows before paying.
      requests: Math.floor(centsToMicro(packConfig.priceCents) / 2000),
    };
  } catch (e: any) {
    return { error: `stripe error: ${e.message}` };
  }
}

/**
 * Claim a Stripe event for processing, or report that it was already handled.
 *
 * The INSERT is the lock. Stripe delivers at-least-once, so without this a
 * retried credit purchase would mint the credit a second time. Recorded before
 * the effects are applied: a crash mid-apply loses an update, which support can
 * reconcile, whereas double-crediting is silent and much harder to unwind.
 */
async function claimStripeEvent(env: any, eventId: string, type: string): Promise<boolean> {
  const claimed = await env.DB.prepare(
    "INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)",
  ).bind(eventId, type, now()).run();
  return Number(claimed?.meta?.changes ?? 0) === 1;
}

/** The amount actually charged, in cents, from the session total. */
function chargedAmountCents(session: any): number {
  const total = session?.amount_total;
  return typeof total === "number" && Number.isInteger(total) && total > 0 ? total : 0;
}

export async function handleStripeWebhook(env: any, request: Request): Promise<Response> {
  const stripe = getStripe(env);
  if (!stripe) return jsonResponse({ error: "stripe not configured" }, 500);
  // Verified before anything else. With no secret configured every event fails
  // here, which is why no purchase had ever completed: the endpoint was live and
  // returning 400 to Stripe rather than 500, so the failure looked permanent.
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error("stripe webhook: STRIPE_WEBHOOK_SECRET is not set, cannot verify signatures");
    return jsonResponse({ error: "webhook secret not configured" }, 500);
  }
  const sig = request.headers.get("stripe-signature") || "";
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    return jsonResponse({ error: `signature verification failed: ${e.message}` }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const email: string | undefined = session.metadata?.email;

      if (await claimStripeEvent(env, event.id, event.type)) {
        if (session.mode === "payment") {
          const amountCents = chargedAmountCents(session);
          if (email && amountCents > 0) {
            await creditAccount(env, email, amountCents, `stripe:${session.id}`, request);
          } else {
            console.error(`credit purchase ${session.id}: missing email or amount`, { email, amountCents });
          }
        } else if (session.mode === "subscription") {
          // Derived from the price charged, never from metadata.
          const priceId = session.line_items?.data?.[0]?.price?.id ?? null;
          const plan = planForPriceId(priceId);
          if (email && plan) {
            // Clear any custom cap: a subscriber should be on the plan's
            // allowance, and quota_override is for exceptions granted manually.
            await env.DB.prepare(
              "UPDATE tokens SET plan = ?, quota_monthly = ?, quota_override = NULL, requests_used = 0, requests_reset_at = ?, updated_at = ? WHERE email = ?",
            ).bind(plan, planQuota(plan), now() + 30 * 86400 * 1000, now(), email).run();
            await logCrmAction(env, email, "stripe_subscription", `plan: ${plan} via ${session.id}`, request).run();
          } else {
            console.error(`subscription ${session.id}: unmapped price ${priceId}`, { email, priceId });
          }
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as any;
      const email: string | undefined = charge.metadata?.email;
      const amountCents = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
      if (email && amountCents > 0 && (await claimStripeEvent(env, event.id, event.type))) {
        await debitAccount(env, email, amountCents, `stripe-refund:${charge.id}`, request);
      }
    }

    return jsonResponse({ received: true });
  } catch (e: any) {
    // 500, not 400: a 4xx tells Stripe the event is permanently bad and stops
    // retrying, which for a transient database error means a lost payment.
    console.error("stripe webhook handler failed:", String(e));
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ICONS: Record<string, string> = {
  free: "fa-leaf",
  median: "fa-rocket",
  pro: "fa-crown",
  enterprise: "fa-building",
};

const BLURBS: Record<string, string> = {
  free: "For individuals and hobbyists getting a feel for persistent memory.",
  median: "For power users who need real capacity every month.",
  pro: "For professionals and teams running agents all day.",
  enterprise: "Dedicated capacity, SLAs and a managed or self-hosted deployment.",
};

/**
 * Render the plan cards from PLANS rather than hardcoding them.
 *
 * The page used to carry its own copy of every quota, which is how it came to
 * advertise Free as 1,000 requests while the gate enforced 5,600. Generating the
 * markup from the same table the gate reads makes that class of drift
 * impossible rather than merely fixed once.
 */
function renderPlanCards(): string {
  const order = ["free", "median", "pro", "enterprise"];
  return order
    .map((key) => {
      const plan = PLANS[key];
      if (!plan) return "";
      const price = plan.priceCents === 0 ? "$0" : `$${(plan.priceCents / 100).toFixed(2)}`;
      const featured = key === "median" ? " featured" : "";
      const buyable = Boolean(PLAN_PRICE_IDS[key]);
      const features = [
        `<li><i class="fas fa-check"></i> ${plan.quota.toLocaleString("en-US")} requests / month</li>`,
        `<li><i class="fas fa-check"></i> All MCP tools</li>`,
        `<li><i class="fas fa-check"></i> JEV reasoning layer</li>`,
        `<li><i class="fas fa-check"></i> OAuth 2.1 &amp; bearer token</li>`,
      ];
      let action: string;
      if (!buyable) {
        action = `<a href="/#enterprise" class="btn-outline"><i class="fas fa-envelope"></i> Contact sales</a>`;
      } else if (key === "pro") {
        // Pro is the trial plan, so it carries both paths.
        action =
          `<button class="btn-primary" onclick="subscribe('${key}')"><i class="fas fa-credit-card"></i> Subscribe ${price}/mo</button>` +
          `<button class="btn-outline" style="margin-top:8px" onclick="startTrial()"><i class="fas fa-flask"></i> Try ${TRIAL_DAYS} days free</button>`;
      } else {
        action = `<button class="btn-primary" onclick="subscribe('${key}')"><i class="fas fa-credit-card"></i> Subscribe ${price}/mo</button>`;
      }
      return `<div class="plan-card${featured}">
<div class="plan-name"><i class="fas ${ICONS[key]}"></i> ${plan.name}</div>
<div class="plan-price">${price} <span>/ month</span></div>
<div class="plan-desc">${BLURBS[key] ?? ""}</div>
<ul class="plan-features">
${features.map((f) => `  <li>${f}</li>`).join("\n")}
</ul>
${action}
</div>`;
    })
    .join("\n");
}

/** Credit packs, with what each buys at the current per-request rate. */
function renderCreditPacks(): string {
  return Object.entries(CREDIT_PACKS)
    .map(([key, pack]) => {
      const price = `$${(pack.priceCents / 100).toFixed(2)}`;
      const requests = Math.floor(centsToMicro(pack.priceCents) / PAYG_MICRO_PER_REQUEST).toLocaleString("en-US");
      return `<div class="pack">
<div class="pack-price">${price}</div>
<div class="pack-requests">${requests} requests</div>
<button class="btn-outline" onclick="buyCredits('${key}')"><i class="fas fa-bolt"></i> Top up</button>
</div>`;
    })
    .join("\n");
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
.account-panel{border:1px solid var(--border);border-radius:12px;padding:20px;margin:0 auto 24px;max-width:800px;background:var(--bg-surface)}
.account-row{display:flex;gap:8px;flex-wrap:wrap}
.account-row input{flex:1 1 180px;min-width:0;border:1px solid var(--border);border-radius:9999px;padding:11px 18px;font-size:14px;font-family:inherit;background:var(--bg-primary);color:var(--text-primary)}
.account-row input:focus{outline:2px solid var(--accent);outline-offset:-1px}
.account-row .btn-outline{flex:0 0 auto;width:auto}
.account-state{font-size:13px;color:var(--text-secondary);line-height:1.7;margin-top:14px;display:none}
.account-state:not(:empty){display:block}
.payg{border:1px solid var(--border);border-radius:12px;padding:28px;margin:24px auto 0;max-width:800px}
.payg h2{font-size:18px;font-weight:500;margin:0 0 8px}
.payg p{font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 20px}
.packs{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.pack{border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center}
.pack-price{font-size:28px;font-weight:300;letter-spacing:-1px}
.pack-requests{font-size:12px;color:var(--text-muted);margin:4px 0 16px}
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
<a class="back" href="/">&larr; Back to Home</a>
<h1>Plans &amp; Pricing</h1>
<div class="sub">Powered by <strong>DeckerGUI</strong> &middot; CTECX Payment Partner</div>

<div class="account-panel" id="account-panel">
  <div class="account-row">
    <input id="email" type="email" placeholder="you@example.com" autocomplete="username" spellcheck="false">
    <input id="passkey" type="password" placeholder="passkey" autocomplete="current-password" maxlength="128">
    <button class="btn-outline" onclick="loadAccount()"><i class="fas fa-id-card"></i> Check my plan</button>
  </div>
  <div id="account-state" class="account-state"></div>
</div>

<div class="plans" id="plans">
${renderPlanCards()}
</div>

<div class="payg">
  <div class="payg-head">
    <h2><i class="fas fa-bolt"></i> Pay as you go</h2>
    <p>No subscription. Credit never expires and is only spent when you exceed your plan allowance. <b>$${(PAYG_MICRO_PER_REQUEST / 1_000_000).toFixed(3)}</b> per request &mdash; about <b>${Math.floor(1_000_000 / PAYG_MICRO_PER_REQUEST).toLocaleString("en-US")}</b> requests per $1.</p>
  </div>
  <div class="packs" id="packs">${renderCreditPacks()}</div>
</div>

<div class="stripe-badge"><i class="fas fa-lock"></i> Pay with Stripe for secured checkout</div>
<div id="status"></div>
<script>
const $=id=>document.getElementById(id);
let CREDS_READY=false;

function credentials(){
  const email=$('email').value.trim();
  const passkey=$('passkey').value;
  if(!email||!passkey){alert('Enter your email and passkey first.');return null}
  return {email,passkey};
}

function busy(on,msg){
  $('status').style.display='block';
  $('status').innerHTML=on?'<i class="fas fa-spinner fa-spin"></i> '+msg:'';
}
function failed(msg){$('status').innerHTML='<span style="color:#f87171">'+msg+'</span>'}
function done(msg){$('status').innerHTML='<span style="color:#059669">'+msg+'</span>'}

async function loadAccount(){
  const c=credentials(); if(!c)return;
  busy(true,'Loading your plan...');
  try{
    const r=await fetch('/api/billing-summary',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c)});
    const d=await r.json();
    if(d.error){failed(d.error);return}
    const t=d.trial&&d.trial.active
      ? ' &middot; <b>'+d.trial.days+'-day '+d.trial.plan+' trial active</b>'
      : '';
    $('account-state').innerHTML=
      'Plan <b>'+d.plan+'</b> &middot; '+d.requests_remaining.toLocaleString('en-US')+
      ' of '+d.quota_monthly.toLocaleString('en-US')+' requests left this month'+t+
      '<br>Wallet <b>$'+d.payg.credits_usd.toFixed(2)+'</b> ('+d.payg.requests_remaining.toLocaleString('en-US')+' requests) &middot; $'+d.payg.spent_usd.toFixed(2)+' spent';
    CREDS_READY=true;
    done('Plan loaded.');
  }catch(e){failed('Error connecting')}
}

async function subscribe(plan){
  const c=credentials(); if(!c)return;
  busy(true,'Creating checkout session...');
  try{
    const r=await fetch('/api/create-checkout-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan,email:c.email,success_url:window.location.origin+'/pay/success?session_id={CHECKOUT_SESSION_ID}',cancel_url:window.location.href})});
    const d=await r.json();
    if(d.error){failed(d.error);return}
    window.location.href=d.url;
  }catch(e){failed('Error connecting')}
}

async function startTrial(){
  const c=credentials(); if(!c)return;
  busy(true,'Starting your trial...');
  try{
    const r=await fetch('/api/start-trial',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c)});
    const d=await r.json();
    if(d.error){failed(d.error);return}
    done('Trial active &mdash; '+d.quota_monthly.toLocaleString('en-US')+' requests/month on '+d.plan+'.');
    $('account-state').innerHTML='Plan <b>'+d.plan+'</b> (trial) &middot; '+d.quota_monthly.toLocaleString('en-US')+' requests/month';
  }catch(e){failed('Error connecting')}
}

async function buyCredits(pack){
  const c=credentials(); if(!c)return;
  busy(true,'Creating checkout session...');
  try{
    const r=await fetch('/api/buy-credits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pack,email:c.email,success_url:window.location.origin+'/pay/success?session_id={CHECKOUT_SESSION_ID}',cancel_url:window.location.href})});
    const d=await r.json();
    if(d.error){failed(d.error);return}
    window.location.href=d.url;
  }catch(e){failed('Error connecting')}
}
</script>
</body>
</html>`;