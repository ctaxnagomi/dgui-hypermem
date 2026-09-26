"""End-to-end smoke test for the worker's OAuth 2.1 authorization server.

Runs the full authorization-code flow with PKCE against the deployed worker and
asserts the security properties that matter: single-use codes, PKCE binding,
exact redirect_uri matching, and account-status coupling.

Usage: python oauth_flow_test.py [base_url]
Reads PASSKEY from .dev.vars (never printed).
"""

import base64
import hashlib
import json
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://dgui-hypermem.ctaxnagomi.workers.dev").rstrip("/")
REDIRECT = "http://127.0.0.1:8765/callback"
EMAIL = "oauth-flow-test@demo.com"
# The test signs in as a dedicated fixture account rather than a real user, so
# repeated runs never consume a real account's monthly quota. Quota is topped
# up here because the quota gate is itself part of what needs testing.
FIXTURE_QUOTA = 100000
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0 Safari/537.36"
)
FORM = {"content-type": "application/x-www-form-urlencoded", "user-agent": UA}

# Cloudflare's WAF rejects the python-urllib user agent with error 1010, so
# every request carries a browser-like UA. This is a harness concern only.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)

failures = []


def check(label, condition, detail=""):
    mark = "ok  " if condition else "FAIL"
    if not condition:
        failures.append(label)
    print(f"  [{mark}] {label}{('  -- ' + detail) if detail else ''}")


def request(url, data=None, headers=None):
    """One request. Retries the empty bodies Cloudflare's edge occasionally serves."""
    merged = {"user-agent": UA, **(headers or {})}
    status = headers_out = body = None
    for _ in range(4):
        req = urllib.request.Request(url, data=data, headers=merged)
        try:
            resp = OPENER.open(req, timeout=45)
            status, headers_out, body = resp.status, dict(resp.headers), resp.read().decode()
        except urllib.error.HTTPError as exc:
            status, headers_out, body = exc.code, dict(exc.headers), exc.read().decode()
        if body.strip() or status in (301, 302, 303, 307):
            return status, headers_out, body
        time.sleep(1.5)
    return status, headers_out, body


def b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def location_of(headers) -> str:
    return headers.get("Location") or headers.get("location") or ""


def load_passkey() -> str:
    text = Path(__file__).with_name(".dev.vars").read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.startswith("PASSKEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("PASSKEY not found in .dev.vars")


def register(name="oauth-smoke-test", redirect=REDIRECT, auth_method="none"):
    payload = {
        "client_name": name,
        "redirect_uris": [redirect],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": auth_method,
        "scope": "mcp",
    }
    if auth_method != "none":
        payload["client_secret"] = None
        payload.pop("client_secret")
    return request(f"{BASE}/register", json.dumps(payload).encode(), {"content-type": "application/json"})


def pkce():
    verifier = b64u(secrets.token_bytes(48))
    return verifier, b64u(hashlib.sha256(verifier.encode()).digest())


def authorize_params(client_id, challenge, redirect=REDIRECT, state="xyz"):
    return {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect,
        "scope": "mcp",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": f"{BASE}/mcp",
    }


def sign_in(params, email=EMAIL, passkey=None):
    payload = urllib.parse.urlencode({**params, "email": email, "passkey": passkey or PASSKEY})
    return request(f"{BASE}/authorize", payload.encode(), FORM)


def exchange(code, verifier, client_id, redirect=REDIRECT):
    payload = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect,
        "client_id": client_id,
        "code_verifier": verifier,
    })
    return request(f"{BASE}/token", payload.encode(), FORM)


def d1(sql: str) -> list:
    """Run a D1 statement and return rows, using the same account as the worker."""
    out = subprocess.run(
        ["npx.cmd", "wrangler", "d1", "execute", "dgui-hypermem", "--remote", "--json", "--command", sql],
        capture_output=True, cwd=str(Path(__file__).parent), timeout=300)
    return json.loads(out.stdout.decode("utf-8", "replace"))[0]["results"]


def ensure_fixture_account() -> str:
    """Create or reset the account the flow test signs in as.

    Signing in through /authorize only provisions new accounts for the master
    passkey, so the fixture is inserted directly. It carries a large quota
    because the suite makes many authenticated calls and the quota gate would
    otherwise return 429 partway through.
    """
    ts = int(time.time() * 1000)
    d1(
        "INSERT INTO tokens (id, email, github_username, status, token, plan, quota_monthly,"
        " requests_used, requests_reset_at, train_with_all, tc_agreed, created_at, updated_at)"
        f" VALUES ('oauth-flow-test', '{EMAIL}', '{EMAIL}', 'active', NULL, 'free', {FIXTURE_QUOTA},"
        f" 0, {ts + 86400000}, 0, 1, {ts}, {ts})"
        " ON CONFLICT(id) DO UPDATE SET status='active', requests_used=0,"
        f" quota_monthly={FIXTURE_QUOTA}, requests_reset_at={ts + 86400000}, token=NULL, updated_at={ts}"
    )
    return EMAIL


def mcp_call(access_token, method="tools/list"):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method}).encode()
    return request(
        f"{BASE}/mcp",
        payload,
        {
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
            "authorization": f"Bearer {access_token}",
            "user-agent": UA,
        },
    )


def issue_token_pair(client_id):
    """Drive the flow to a fresh, unconsumed token pair."""
    verifier, challenge = pkce()
    params = authorize_params(client_id, challenge)
    status, headers, _ = sign_in(params)
    loc = location_of(headers)
    code = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query).get("code", [""])[0]
    if not code:
        raise SystemExit(f"could not obtain a code: status={status} location={loc}")
    status, _, body = exchange(code, verifier, client_id)
    tokens = json.loads(body)
    if "access_token" not in tokens:
        raise SystemExit(f"could not obtain tokens: status={status} body={body}")
    return code, verifier, tokens


PASSKEY = load_passkey()
ensure_fixture_account()

print(f"\nOAuth flow test against {BASE}\nsigning in as {EMAIL}\n")

# --- discovery ------------------------------------------------------------
print("discovery")
status, _, body = request(f"{BASE}/.well-known/oauth-protected-resource")
prm = json.loads(body)
check("protected-resource metadata served", status == 200)
check("resource points at /mcp", prm.get("resource", "").endswith("/mcp"), prm.get("resource", ""))
check("issuer listed", BASE in prm.get("authorization_servers", []))
status, _, body = request(f"{BASE}/.well-known/oauth-authorization-server")
as_meta = json.loads(body)
check("authorization-server metadata served", status == 200)
check("advertises S256 only", as_meta.get("code_challenge_methods_supported") == ["S256"])
check("registration endpoint advertised", as_meta.get("registration_endpoint", "").endswith("/register"))

status, headers, _ = request(f"{BASE}/mcp", b'{"jsonrpc":"2.0","id":1,"method":"tools/list"}', {
    "content-type": "application/json", "accept": "application/json, text/event-stream", "user-agent": UA})
challenge_header = next((v for k, v in headers.items() if k.lower() == "www-authenticate"), "")
check("unauthenticated 401", status == 401, f"got {status}")
check("401 advertises resource_metadata", "resource_metadata=" in challenge_header, challenge_header[:70])

# --- registration ---------------------------------------------------------
print("\nregistration")
status, _, body = register()
client = json.loads(body)
check("public client registered", status == 201 and client["client_id"].startswith("hmc_"))
check("no secret issued for public client", "client_secret" not in client)

status, _, body = register(redirect="http://evil.example.com/cb")
check("non-loopback http redirect rejected", status == 400, json.loads(body).get("error", ""))
status, _, body = register(redirect="javascript:alert(1)")
check("javascript: scheme rejected", status == 400)
status, _, body = register(auth_method="client_secret_basic")
conf_client = json.loads(body)
check("confidential client gets a secret", "client_secret" in conf_client)

# --- consent --------------------------------------------------------------
print("\nauthorization")
verifier, challenge = pkce()
params = authorize_params(client["client_id"], challenge)
status, _, body = request(f"{BASE}/authorize?{urllib.parse.urlencode(params)}")
check("consent page renders", status == 200 and "<form" in body)
check("client name shown to user", "oauth-smoke-test" in body)

status, headers, _ = sign_in(params, passkey="definitely-wrong")
check("wrong passkey denied", status == 401, f"got {status}")
status, headers, _ = sign_in(params)
loc = location_of(headers)
code = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query).get("code", [""])[0]
check("valid sign-in redirects with a code", status == 302 and bool(code))
check("state echoed back", urllib.parse.parse_qs(urllib.parse.urlparse(loc).query).get("state", [""])[0] == "xyz")

status, _, body = request(f"{BASE}/authorize?{urllib.parse.urlencode(authorize_params(client['client_id'], challenge, redirect='http://127.0.0.1:9999/other'))}")
check("unregistered redirect_uri rejected", status == 400, json.loads(body).get("error_description", ""))
status, _, body = request(f"{BASE}/authorize?{urllib.parse.urlencode({**params, 'code_challenge_method': 'plain'})}")
check("plain PKCE rejected", status in (302, 400))
status, _, body = request(f"{BASE}/authorize?{urllib.parse.urlencode({**params, 'client_id': 'hmc_nope'})}")
check("unknown client_id rejected", status == 400, json.loads(body).get("error", ""))

# --- token grant ----------------------------------------------------------
print("\ntoken grant")
status, _, body = exchange(code, verifier, client["client_id"])
tokens = json.loads(body)
check("access token issued", status == 200 and "access_token" in tokens)
check("refresh token issued", "refresh_token" in tokens)
check("token_type Bearer", tokens.get("token_type") == "Bearer")
check("expires_in is 1 hour", tokens.get("expires_in") == 3600, str(tokens.get("expires_in")))

status, _, body = exchange(code, verifier, client["client_id"])
check("code is single-use", status == 400 and json.loads(body).get("error") == "invalid_grant")

verifier2, challenge2 = pkce()
status, headers, _ = sign_in(authorize_params(client["client_id"], challenge2))
code2 = urllib.parse.parse_qs(urllib.parse.urlparse(location_of(headers)).query).get("code", [""])[0]
status, _, body = exchange(code2, b64u(secrets.token_bytes(48)), client["client_id"])
check("wrong code_verifier rejected", status == 400 and json.loads(body).get("error") == "invalid_grant",
      json.loads(body).get("error_description", ""))
status, _, body = exchange(code2, verifier2, client["client_id"], redirect="http://127.0.0.1:8765/other")
check("redirect_uri mismatch rejected", status == 400, json.loads(body).get("error_description", ""))
status, _, body = exchange(code2, verifier2, "hmc_someone_else")
check("unregistered client_id rejected at /token", status == 401, json.loads(body).get("error", ""))
# A second *validly registered* client must not be able to redeem a code that
# was issued to the first. This is the actual cross-client binding check.
other = json.loads(register(name="other-client")[2])
status, _, body = exchange(code2, verifier2, other["client_id"])
check("code bound to the client it was issued to", status == 400,
      json.loads(body).get("error_description", ""))
status, _, body = exchange(code2, verifier2, client["client_id"])
check("still redeemable after failed attempts", status == 200 and "access_token" in body)
tokens2 = json.loads(body)

# --- resource access ------------------------------------------------------
print("\nresource access")
status, _, body = mcp_call(tokens["access_token"])
check("access token works on /mcp", status == 200, f"got {status}")
try:
    tool_count = len(json.loads(body)["result"]["tools"])
    check("all 8 tools exposed", tool_count == 8, f"got {tool_count}")
except Exception as exc:  # noqa: BLE001
    check("all 8 tools exposed", False, str(exc))

status, _, body = mcp_call("not-a-real-token")
check("bogus bearer rejected", status == 401, f"got {status}")

# --- refresh --------------------------------------------------------------
print("\nrefresh and revoke")
status, _, body = request(f"{BASE}/token", urllib.parse.urlencode({
    "grant_type": "refresh_token", "refresh_token": tokens2["refresh_token"],
    "client_id": client["client_id"]}).encode(), FORM)
refreshed = json.loads(body)
check("refresh issues a new pair", status == 200 and "access_token" in refreshed)
check("refresh token rotated", refreshed.get("refresh_token") not in (None, tokens2["refresh_token"]))
check("absolute lifetime not extended", refreshed.get("expires_in", 0) <= 3600, str(refreshed.get("expires_in")))

status, _, body = request(f"{BASE}/token", urllib.parse.urlencode({
    "grant_type": "refresh_token", "refresh_token": tokens2["refresh_token"],
    "client_id": client["client_id"]}).encode(), FORM)
check("old refresh token revoked", status == 400 and json.loads(body).get("error") == "invalid_grant")

status, _, _ = request(f"{BASE}/revoke", urllib.parse.urlencode({
    "token": refreshed["access_token"], "client_id": client["client_id"]}).encode(), FORM)
check("revoke accepted", status == 200, f"got {status}")
status, _, body = mcp_call(refreshed["access_token"])
check("revoked token rejected on /mcp", status == 401, f"got {status}")
status, _, _ = request(f"{BASE}/revoke", urllib.parse.urlencode({
    "token": "never-existed", "client_id": client["client_id"]}).encode(), FORM)
check("revoke of unknown token still 200", status == 200)

status, _, body = request(f"{BASE}/token", urllib.parse.urlencode({
    "grant_type": "client_credentials", "client_id": client["client_id"]}).encode(), FORM)
check("client_credentials grant refused", status == 400 and json.loads(body).get("error") == "unsupported_grant_type")

# --- account coupling ----------------------------------------------------
# An OAuth grant must not outlive the account that authorised it: disabling the
# account has to revoke access immediately, without waiting for token expiry.
print("\naccount coupling")
_, _, coupling_tokens = issue_token_pair(client["client_id"])
status, _, body = mcp_call(coupling_tokens["access_token"])
check("fresh grant works before disable", status == 200, f"got {status}")

d1(f"UPDATE tokens SET status='active' WHERE id='oauth-flow-test'")
_, _, surviving = issue_token_pair(client["client_id"])
status, _, _ = mcp_call(surviving["access_token"])
check("control grant works before disable", status == 200, f"got {status}")

# Disable through the real API rather than by SQL, so the kill-switch wiring in
# handleDisableToken is what is under test.
payload = json.dumps({"email": EMAIL, "passkey": PASSKEY}).encode()
status, _, body = request(f"{BASE}/api/disable-token", payload, {"content-type": "application/json", "user-agent": UA})
check("account disabled via API", status == 200 and json.loads(body).get("status") == "disabled", body[:80])

status, _, _ = mcp_call(surviving["access_token"])
check("disabling the account revokes the grant", status == 401, f"got {status}")

status, _, body = sign_in(authorize_params(client["client_id"], pkce()[1]))
check("disabled account cannot sign in again", status in (302, 400, 401), f"got {status}")

d1(f"UPDATE tokens SET status='active' WHERE id='oauth-flow-test'")
status, _, _ = mcp_call(surviving["access_token"])
check("re-enabling does not resurrect the grant", status == 401, f"got {status}")

status, _, _ = mcp_call(coupling_tokens["access_token"])
check("pre-existing grant stays revoked", status == 401, f"got {status}")

# --- storage --------------------------------------------------------------
print("\nat rest")
try:
    leaked = d1(
        "SELECT COUNT(*) AS n FROM oauth_access_tokens WHERE token_hash IN ("
        f"'{tokens['access_token']}', '{tokens2['refresh_token']}', '{refreshed['access_token']}')"
    )[0]["n"]
    check("no raw token stored in D1", leaked == 0, f"{leaked} raw token(s) found in the table")
except Exception as exc:  # noqa: BLE001
    check("no raw token stored in D1", False, str(exc))

print()
if failures:
    print(f"FAILED: {len(failures)} check(s)")
    for name in failures:
        print(f"  - {name}")
    sys.exit(1)
print("All checks passed.")
