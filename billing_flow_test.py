"""End-to-end test for the billing path: plan ladder, trial, and pay-as-you-go.

Exercises the parts that decide whether the service can charge anyone money, so
the assertions are about balances and funding source rather than just status
codes: a request must be funded by the plan first, fall through to the wallet
only once the plan is spent, debit the wallet by exactly one request's price,
and be refused once neither can pay.

Runs against a dedicated fixture account, never a real user.

Usage: python billing_flow_test.py [base_url]
Reads PASSKEY from .dev.vars (never printed).
"""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://dgui-hypermem.ctaxnagomi.workers.dev").rstrip("/")
EMAIL = "billing-flow-test@demo.com"
FIXTURE_ID = "billing-flow-test"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0 Safari/537.36"
)
JSON_HEADERS = {"content-type": "application/json", "user-agent": UA}
MCP_HEADERS = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    "user-agent": UA,
}

# Mirrors PAYG_MICRO_PER_REQUEST in src/billing.ts ($0.002).
PAYG_MICRO = 2000
MICRO = 1_000_000
MONTH_MS = 30 * 86400 * 1000

failures = []


def check(label, condition, detail=""):
    if not condition:
        failures.append(label)
    print(f"  [{'ok  ' if condition else 'FAIL'}] {label}{('  -- ' + str(detail)) if detail else ''}")


def request(url, data=None, headers=None):
    merged = {"user-agent": UA, **(headers or {})}
    for _ in range(4):
        req = urllib.request.Request(url, data=data, headers=merged)
        try:
            resp = urllib.request.urlopen(req, timeout=45)
            status, hdrs, body = resp.status, dict(resp.headers), resp.read().decode()
        except urllib.error.HTTPError as exc:
            status, hdrs, body = exc.code, dict(exc.headers), exc.read().decode()
        if body.strip():
            return status, hdrs, body
        time.sleep(1.5)
    return status, hdrs, body


def post(path, payload, headers=None):
    return request(f"{BASE}{path}", json.dumps(payload).encode(), headers or JSON_HEADERS)


def d1(sql: str) -> list:
    out = subprocess.run(
        ["npx.cmd", "wrangler", "d1", "execute", "dgui-hypermem", "--remote", "--json", "--command", sql],
        capture_output=True, cwd=str(Path(__file__).parent), timeout=300)
    return json.loads(out.stdout.decode("utf-8", "replace"))[0]["results"]


def load_passkey() -> str:
    text = Path(__file__).with_name(".dev.vars").read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.startswith("PASSKEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("PASSKEY not found in .dev.vars")


def reset_fixture(plan="free", credits_micro=0, spent_micro=0, used=0, override="NULL", trial="NULL"):
    """Put the fixture account into a known state.

    Written as one statement so there is no window where a partially reset
    account could be billed against, and so the test is repeatable.
    """
    ts = int(time.time() * 1000)
    d1(
        "INSERT INTO tokens (id, email, github_username, status, token, plan, quota_monthly,"
        " quota_override, requests_used, requests_reset_at, payg_credits_micro, payg_spent_micro,"
        " trial_ends_at, trial_started_at, train_with_all, tc_agreed, has_connected, created_at, updated_at)"
        f" VALUES ('{FIXTURE_ID}', '{EMAIL}', '{EMAIL}', 'active', NULL, '{plan}', 2000,"
        f" {override}, {used}, {ts + MONTH_MS}, {credits_micro}, {spent_micro}, {trial}, NULL, 0, 1, 0, {ts}, {ts})"
        " ON CONFLICT(id) DO UPDATE SET status='active', plan=excluded.plan, quota_monthly=excluded.quota_monthly,"
        " quota_override=excluded.quota_override, requests_used=excluded.requests_used,"
        " requests_reset_at=excluded.requests_reset_at, payg_credits_micro=excluded.payg_credits_micro,"
        " payg_spent_micro=excluded.payg_spent_micro, trial_ends_at=excluded.trial_ends_at,"
        " trial_started_at=NULL, updated_at=excluded.updated_at"
    )


def issue_token(email=EMAIL, passkey=None):
    """Mint a bearer token for the fixture by driving the token form."""
    status, _, body = post("/api/request-token", {"email": email, "passkey": passkey or PASSKEY, "tc_agreed": True})
    token = json.loads(body).get("token")
    if not token:
        raise SystemExit(f"could not issue a token: {status} {body[:200]}")
    return token


def mcp(token, expect_json=True):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).encode()
    status, _, body = request(f"{BASE}/mcp", payload, {**MCP_HEADERS, "authorization": f"Bearer {token}"})
    if not expect_json:
        return status, body
    try:
        return status, json.loads(body)
    except Exception:  # noqa: BLE001
        return status, body


def quota_of(token):
    _, _, body = request(f"{BASE}/api/check-quota", None, {**MCP_HEADERS, "authorization": f"Bearer {token}"})
    return json.loads(body)


def row():
    return d1(
        f"SELECT plan, requests_used, quota_override, payg_credits_micro, payg_spent_micro,"
        f" trial_ends_at, trial_started_at FROM tokens WHERE id='{FIXTURE_ID}'"
    )[0]


def payg_event_total():
    """Total pay-as-you-go cost in the append-only event ledger, in micro-dollars."""
    return d1("SELECT COALESCE(SUM(cost_micro),0) AS n FROM usage_events WHERE funding='payg'")[0]["n"]


PASSKEY = load_passkey()
print(f"\nBilling test against {BASE}\nfixture account: {EMAIL}\n")

# --- plan ladder ---------------------------------------------------------
print("plan ladder")
reset_fixture(plan="free")
token = issue_token()
q = quota_of(token)
check("free plan allowance is 2,000", q["quota_monthly"] == 2000, q["quota_monthly"])
check("reported plan is free", q["plan"] == "free", q["plan"])
check("payg block present", isinstance(q.get("payg"), dict) and q["payg"]["price_per_request_usd"] == 0.002, q.get("payg"))
check("no upgrade block while not exhausted", "upgrade" not in q)

for plan, expected in (("median", 8500), ("pro", 15000), ("enterprise", 25000)):
    reset_fixture(plan=plan)
    got = quota_of(issue_token())["quota_monthly"]
    check(f"{plan} allowance is {expected:,}", got == expected, got)

# A capitalised plan must not silently fall through to the free allowance.
reset_fixture(plan="enterprise")
d1(f"UPDATE tokens SET plan='Enterprise' WHERE id='{FIXTURE_ID}'")
got = quota_of(issue_token())["quota_monthly"]
check("capitalised plan name still resolves", got == 25000, got)

# An admin override still wins over the plan.
reset_fixture(plan="pro", override=123)
got = quota_of(issue_token())["quota_monthly"]
check("quota_override beats the plan", got == 123, got)

# --- exhaustion and the 429 upgrade block --------------------------------
print("\nexhaustion")
reset_fixture(plan="free", used=1999)
token = issue_token()
status, body = mcp(token)
check("last plan request is allowed", status == 200, f"got {status}")
check("that request was funded by the plan", row()["requests_used"] == 2000, row()["requests_used"])
check("wallet untouched while the plan holds", row()["payg_credits_micro"] == 0)

status, body = mcp(token)
check("request past the plan is refused", status == 429, f"got {status}")
check("refusal carries a machine-readable code", body.get("code") == "quota_exceeded", body.get("code"))
upgrade = body.get("upgrade") or {}
check("refusal names the next plan", upgrade.get("plan") == "median", upgrade.get("plan"))
check("refusal quotes the next plan's price", upgrade.get("planPriceUsd") == "2.99", upgrade.get("planPriceUsd"))
check("refusal quotes the enterprise price", upgrade.get("enterprisePriceUsd") == "29.99", upgrade.get("enterprisePriceUsd"))
check("refusal quotes pay-as-you-go", upgrade.get("paygPriceUsd") == "0.002", upgrade.get("paygPriceUsd"))
check("refusal message names all three options",
      all(s in (upgrade.get("message") or "") for s in ("Median", "Enterprise", "pay-as-you-go")),
      upgrade.get("message"))
# The message is one sentence built from the plan names, so a capital mid-sentence
# would mean the copy and the table have drifted apart again.
check("refusal message reads as clean prose",
      "You can upgrade to" in (upgrade.get("message") or "") and " can Upgrade" not in (upgrade.get("message") or ""),
      upgrade.get("message"))
status_hdr = None
st, hdrs, _ = request(f"{BASE}/mcp", b'{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
                      {**MCP_HEADERS, "authorization": f"Bearer {token}"})
status_hdr = next((v for k, v in hdrs.items() if k.lower() == "retry-after"), None)
check("429 sends retry-after", status_hdr == "3600", status_hdr)

q = quota_of(token)
check("check-quota flags exhaustion", q.get("exhausted") is True)
check("check-quota includes upgrade options", bool(q.get("upgrade", {}).get("message")))

# --- pay-as-you-go -------------------------------------------------------
print("\npay as you go")
reset_fixture(plan="free", used=2000, credits_micro=5 * MICRO, spent_micro=0)
token = issue_token()
before = row()["payg_credits_micro"]
# The per-token lifetime counter and the per-request event ledger are written in
# the same request and must agree. Compared as a delta across this one request:
# the fixture's counters are zeroed between phases while usage_events is
# append-only, so neither a whole-table total nor an absolute figure is meaningful.
events_before = payg_event_total()
status, body = mcp(token)
events_after = payg_event_total()
after = row()["payg_credits_micro"]
check("wallet funds the request past the plan", status == 200, f"got {status}")
check("wallet debited by exactly one request", before - after == PAYG_MICRO, f"{before} -> {after}")
check("lifetime spend accumulated", row()["payg_spent_micro"] == PAYG_MICRO, row()["payg_spent_micro"])
check("plan usage did not move past the cap", row()["requests_used"] == 2000, row()["requests_used"])
check("ledger gained exactly one request's cost", events_after - events_before == PAYG_MICRO,
      f"{events_before} -> {events_after} (+{events_after - events_before} micro)")
check("wallet counter reconciles with the event ledger",
      events_after - events_before == row()["payg_spent_micro"],
      f"ledger +{events_after - events_before} vs wallet {row()['payg_spent_micro']}")

# Exactly one request of credit must buy exactly one request, not zero or two.
reset_fixture(plan="free", used=2000, credits_micro=PAYG_MICRO, spent_micro=0)
token = issue_token()
status, _ = mcp(token)
check("one request of credit buys one request", status == 200, f"got {status}")
check("wallet now empty", row()["payg_credits_micro"] == 0, row()["payg_credits_micro"])
status, body = mcp(token)
check("request refused once the wallet is empty", status == 429, f"got {status}")
check("refusal is still the quota code, not a payment error", body.get("code") == "quota_exceeded", body.get("code"))

# Just under the price: must not be allowed to slip through.
reset_fixture(plan="free", used=2000, credits_micro=PAYG_MICRO - 1, spent_micro=0)
token = issue_token()
status, _ = mcp(token)
check("a balance one micro-unit short is refused", status == 429, f"got {status}")

# Zero balance must not be treated as truthy.
reset_fixture(plan="free", used=2000, credits_micro=0)
token = issue_token()
status, _ = mcp(token)
check("zero balance does not admit the request", status == 429, f"got {status}")

# Overdraft must be impossible.
reset_fixture(plan="free", used=2000, credits_micro=3 * PAYG_MICRO, spent_micro=0)
token = issue_token()
for _ in range(3):
    mcp(token)
status, _ = mcp(token)
check("wallet cannot be overdrawn", status == 429, f"got {status}")
check("balance never goes negative", row()["payg_credits_micro"] == 0, row()["payg_credits_micro"])

# A disabled account must not be able to spend the wallet.
# The token is fetched *before* disabling, because the token form reactivates a
# disabled account -- that is correct product behaviour, but it would silently
# undo the fixture setup and make this check vacuous.
reset_fixture(plan="free", used=2000, credits_micro=5 * MICRO)
disabled_token = issue_token()
d1(f"UPDATE tokens SET status='disabled' WHERE id='{FIXTURE_ID}'")
status, _ = mcp(disabled_token)
check("disabled account cannot draw on the wallet", status == 401, f"got {status}")
check("disabled account's wallet is intact", row()["payg_credits_micro"] == 5 * MICRO, row()["payg_credits_micro"])

# --- trial ---------------------------------------------------------------
print("\npro trial")
reset_fixture(plan="free")
ts = int(time.time() * 1000)
status, _, body = post("/api/start-trial", {"email": EMAIL, "passkey": PASSKEY})
trial = json.loads(body)
check("trial granted", status == 200 and trial.get("plan") == "pro", body[:120])
check("trial lasts 15 days", trial.get("trial_days") == 15, trial.get("trial_days"))
check("trial grants the pro allowance", trial.get("quota_monthly") == 15000, trial.get("quota_monthly"))
check("trial end persisted", bool(row()["trial_ends_at"]))
span_days = (row()["trial_ends_at"] - ts) / 86400_000
check("trial end is 15 days out", 14.9 < span_days < 15.1, f"{span_days:.2f} days")

status, _, body = post("/api/start-trial", {"email": EMAIL, "passkey": PASSKEY})
check("trial cannot be claimed twice", status == 409, f"got {status}")
check("second attempt explains why", "already used" in body, body[:80])

status, _, body = post("/api/start-trial", {"email": EMAIL, "passkey": "wrong-key"})
check("trial needs the passkey", status == 401, f"got {status}")

status, _, body = post("/api/start-trial", {"email": "nobody@nowhere.test", "passkey": PASSKEY})
check("trial needs an existing account", status == 404, f"got {status}")

# A running trial must supply the pro allowance.
token = issue_token()
check("trial account is on pro", quota_of(token)["plan"] == "pro", quota_of(token)["plan"])
check("trial account has pro quota", quota_of(token)["quota_monthly"] == 15000)

# Lapsed trial must revert, and must not keep the pro allowance.
reset_fixture(plan="pro", used=14999)
d1(f"UPDATE tokens SET trial_ends_at={ts - 1000} WHERE id='{FIXTURE_ID}'")
token = issue_token()
q = quota_of(token)
check("lapsed trial reports free", q["plan"] == "free", q["plan"])
check("lapsed trial reports free quota", q["quota_monthly"] == 2000, q["quota_monthly"])
status, _ = mcp(token)
check("a lapsed trial is measured at the free allowance, not pro", status == 429, f"got {status}")
check("lapsed trial reverts the stored plan too", row()["plan"] == "free", row()["plan"])
check("lapsed trial clears trial_ends_at", row()["trial_ends_at"] is None, row()["trial_ends_at"])

# --- credit pack and checkout guards ------------------------------------
print("\ncheckout guards")
status, _, body = post("/api/buy-credits", {"pack": "small", "email": EMAIL})
check("credit packs refuse until priced", status == 200 and "error" in json.loads(body), body[:120])
check("the refusal says it is not yet on sale", "not yet on sale" in body, body[:120])

status, _, body = post("/api/buy-credits", {"pack": "gigantic", "email": EMAIL})
check("unknown pack rejected", "unknown credit pack" in body, body[:100])

status, _, body = post("/api/create-checkout-session", {"plan": "enterprise", "email": EMAIL})
check("enterprise is not self-serve purchasable", "not available for self-serve" in body, body[:120])

status, _, body = post("/api/create-checkout-session", {"plan": "pro", "email": "nobody@nowhere.test"})
check("checkout needs an existing account", "no account for that email" in body, body[:120])

status, _, body = post("/api/billing-summary", {"email": EMAIL, "passkey": PASSKEY})
summary = json.loads(body)
check("billing summary works before holding a token", status == 200 and "plan" in summary, body[:120])
check("summary reports the wallet", summary["payg"]["price_per_request_usd"] == 0.002, summary.get("payg"))
check("summary always offers the upgrade paths", bool(summary["upgrade"]["message"]))

status, _, body = post("/api/billing-summary", {"email": EMAIL, "passkey": "wrong"})
check("billing summary needs the passkey", "error" in json.loads(body), body[:100])

# --- webhook -------------------------------------------------------------
print("\nstripe webhook")
st, _, body = request(f"{BASE}/api/stripe-webhook", b'{"id":"evt_1","type":"checkout.session.completed"}',
                      {"stripe-signature": "t=1,v1=deadbeef", "user-agent": UA})
parsed = json.loads(body)
# STRIPE_WEBHOOK_SECRET is unset in this environment, so the endpoint must
# refuse before touching any data. 5xx rather than 4xx is the important part: a
# 4xx tells Stripe the event is permanently bad and stops retrying, so a
# transient operator mistake would silently discard a real payment.
check("webhook refuses to process with no secret configured", "error" in parsed, body[:120])
check("unconfigured webhook returns 5xx so Stripe keeps retrying", 500 <= st < 600, f"got {st}")
check("refusal names the missing secret", "webhook secret not configured" in body, body[:120])
check("no event was recorded from an unverified request",
      d1("SELECT COUNT(*) AS n FROM stripe_events")[0]["n"] == 0)

# --- cleanup -------------------------------------------------------------
reset_fixture()
print()
if failures:
    print(f"FAILED: {len(failures)} check(s)")
    for name in failures:
        print(f"  - {name}")
    sys.exit(1)
print("All checks passed.")
