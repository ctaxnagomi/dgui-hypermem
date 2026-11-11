"""End-to-end tagID verification against the live database.

Boots nothing itself: it expects a `wrangler dev --remote` instance serving the
CURRENT source (the branch with tagID code) on BASE, then drives the OAuth
authorization-code flow as the fixture account `oauth-flow-test@demo.com`
(never a real user), adds a probe memory via REST /api/add, and asserts the
enqueued jev_examples row carries `tag_id = "u_" + first-16-hex(sha256(email))`.

Usage: python tagid_e2e_test.py [base_url]
Reads PASSKEY from .dev.vars (never printed). WRANGLER_TEST_CONFIG must point
at the target worker's config for the D1 assertions.
"""

import base64
import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8799").rstrip("/")
REDIRECT = "http://127.0.0.1:8765/callback"
EMAIL = "oauth-flow-test@demo.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0 Safari/537.36"
)
FORM = {"content-type": "application/x-www-form-urlencoded", "user-agent": UA}
JSON_HEADERS = {"content-type": "application/json", "user-agent": UA}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)
failures = []


def check(label, condition, detail=""):
    if not condition:
        failures.append(label)
    print(f"  [{'ok  ' if condition else 'FAIL'}] {label}{('  -- ' + str(detail)) if detail else ''}")


def request(url, data=None, headers=None):
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


def register(name="tagid-e2e", redirect=REDIRECT):
    payload = {
        "client_name": name,
        "redirect_uris": [redirect],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "scope": "mcp",
    }
    return request(f"{BASE}/register", json.dumps(payload).encode(), JSON_HEADERS)


def pkce():
    verifier = b64u(secrets.token_bytes(48))
    return verifier, b64u(hashlib.sha256(verifier.encode()).digest())


def authorize_params(client_id, challenge):
    return {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT,
        "scope": "mcp",
        "state": "xyz",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": f"{BASE}/mcp",
    }


def sign_in(params):
    payload = urllib.parse.urlencode({**params, "email": EMAIL, "passkey": PASSKEY})
    return request(f"{BASE}/authorize", payload.encode(), FORM)


def exchange(code, verifier, client_id):
    payload = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT,
        "client_id": client_id,
        "code_verifier": verifier,
    })
    return request(f"{BASE}/token", payload.encode(), FORM)


def d1(sql: str) -> list:
    cfg = os.environ.get("WRANGLER_TEST_CONFIG")
    db = "dgui-hypermem"
    if cfg:
        db = json.load(open(cfg, encoding="utf-8"))["d1_databases"][0]["database_name"]
    cmd = ["npx.cmd", "wrangler", "d1", "execute", db, "--remote", "--json", "--command", sql]
    if cfg:
        cmd += ["--config", cfg]
    out = subprocess.run(cmd, capture_output=True, cwd=str(Path(__file__).parent), timeout=300)
    if out.returncode != 0:
        raise SystemExit(f"d1 failed: {out.stderr.decode('utf-8', 'replace')[-400:]}")
    text = out.stdout.decode("utf-8", "replace").lstrip()
    start = text.find("[")
    if start < 0:
        raise SystemExit(f"d1 no JSON: {text[:200]}")
    return json.loads(text[start:])[0]["results"]


def ensure_fixture_account():
    ts = int(time.time() * 1000)
    d1(
        "INSERT INTO tokens (id, email, github_username, status, token, plan, quota_monthly,"
        " requests_used, requests_reset_at, train_with_all, tc_agreed, created_at, updated_at)"
        f" VALUES ('oauth-flow-test', '{EMAIL}', '{EMAIL}', 'active', NULL, 'free', 100000,"
        f" 0, {ts + 86400000}, 0, 1, {ts}, {ts})"
        " ON CONFLICT(id) DO UPDATE SET status='active', requests_used=0,"
        f" quota_monthly=100000, requests_reset_at={ts + 86400000}, token=NULL, updated_at={ts}"
    )


PASSKEY = load_passkey()

print(f"\ntagID E2E against {BASE}\nsigning in as {EMAIL}\n")

# --- fixture + token -------------------------------------------------------
ensure_fixture_account()
status, _, body = register()
client = json.loads(body)
check("client registered", status == 201 and client["client_id"].startswith("hmc_"), f"status={status}")
client_id = client["client_id"]

verifier, challenge = pkce()
params = authorize_params(client_id, challenge)
status, headers, _ = sign_in(params)
loc = location_of(headers)
code = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query).get("code", [""])[0]
check("authorization code obtained", bool(code), f"status={status}")
status, _, body = exchange(code, verifier, client_id)
tokens = json.loads(body)
access_token = tokens.get("access_token", "")
check("access token issued", bool(access_token), f"status={status}")

expected_tag = "u_" + hashlib.sha256(EMAIL.lower().encode()).hexdigest()[:16]
marker = "tagid-e2e-" + secrets.token_hex(6)
content = f"TAGID E2E verification probe {marker}. This row is a fixture test row; safe to ignore."

# --- add through the live pipeline -----------------------------------------
status, _, body = request(
    f"{BASE}/api/add",
    json.dumps({"content": content}).encode(),
    {"content-type": "application/json", "authorization": f"Bearer {access_token}", "user-agent": UA},
)
add_ok = status == 200
try:
    add_body = json.loads(body)
except Exception:
    add_body = {}
mem_id_from_resp = (add_body.get("memory") or {}).get("id")
check("api/add accepted probe memory", add_ok, f"status={status} body={body[:120]}")
check("add response has an id", bool(mem_id_from_resp), str(add_body)[:120])

# --- the enqueued JEV rows must carry the tag ------------------------------
# The row's full JevExampleRow (incl. tag_id, scope) is serialized into the
# `payload` JSON column; there is no per-field column.
rows = d1(
    "SELECT id, use_case, status,"
    " json_extract(payload, '$.tag_id') AS tag_id,"
    " json_extract(payload, '$.scope') AS scope"
    f" FROM jev_examples WHERE payload LIKE '%{marker}%'"
    " ORDER BY created_at ASC LIMIT 3"
)
check("jev_examples row(s) enqueued", len(rows) >= 1, f"rows={len(rows)}")
for i, row in enumerate(rows):
    check(f"row {i}: tag_id stamped", row.get("tag_id") == expected_tag,
          f"got={row.get('tag_id')!r} want={expected_tag!r}")
    check(f"row {i}: scope preserved", row.get("scope") == "default", row.get("scope"))
    check(f"row {i}: use_case recorded", row.get("use_case") in ("analyze", "rerank", "supersede"),
          row.get("use_case"))

# --- the memory itself is stored -------------------------------------------
mem = d1(
    "SELECT id, scope, status FROM memories"
    f" WHERE content LIKE '%{marker}%' ORDER BY created_at DESC LIMIT 1"
)
mem_id = mem[0]["id"] if mem else None
check("memory persisted", bool(mem_id), f"mem={len(mem)}")

# --- cleanup: remove the probe memory from the live store -------------------
if mem_id:
    status, _, body = request(
        f"{BASE}/api/forget",
        json.dumps({"ids": [mem_id]}).encode(),
        {"content-type": "application/json", "authorization": f"Bearer {access_token}", "user-agent": UA},
    )
    check("probe memory forgotten (store cleaned)", status == 200, f"status={status}")
    # forgetMemories soft-deletes: UPDATE memories SET status='deleted'.
    state = d1(f"SELECT id, status FROM memories WHERE id = '{mem_id}'")
    check("memory row soft-deleted in D1",
          len(state) == 0 or state[0].get("status") == "deleted",
          f"left={len(state)} status={state[0].get('status') if state else None}")

print()
if failures:
    print(f"FAILED: {len(failures)} check(s): {failures}")
    sys.exit(1)
print("ALL tagID E2E CHECKS PASSED")