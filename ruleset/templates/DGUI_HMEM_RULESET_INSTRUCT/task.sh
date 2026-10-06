#!/usr/bin/env bash
# owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
# DGUI_HMEM_RULESET_INSTRUCT - task.sh (template copy)
# ctecx_instruct@1 executable: setup / build / run / test stages.
set -euo pipefail

PACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULESET="${DGUI_HMEM_RULESET:-$PACK_DIR/../DGUI_HMEM_RULESET.template.md}"
MCP_URL="${DGUI_HMEM_MCP_URL:-https://dgui-hmem.deckergui.my/mcp}"
DESTRUCTIVE="${RUN_DESTRUCTIVE:-0}"

# Stages are idempotent: re-running any stage is safe.
stage_setup() {
  echo "[setup] verifying tooling"
  command -v node >/dev/null 2>&1 || { echo "node required"; exit 1; }
  command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || { echo "python required for pack build"; exit 1; }
  [ -f "$RULESET" ] || { echo "ruleset not found at $RULESET"; exit 1; }
  echo "[setup] ok"
}

stage_build() {
  echo "[build] pack inventory"
  for f in INSTRUCT.md task.sh task.sql task.json task.assembly; do
    [ -f "$PACK_DIR/$f" ] || { echo "missing $PACK_DIR/$f"; exit 1; }
  done
  echo "[build] ok"
}

stage_run() {
  if [ "${1:-}" = "placeholder" ]; then
    echo "[run] refusing JEV mode without a JEV_API_KEY - ask the owner to mint one (ruleset #2)"
    exit 3
  fi
  echo "[run] session steps are driven by INSTRUCT.md; this stage guards the harness"
  # Compliance probe: the MCP endpoint must answer a JSON-RPC initialize.
  # Replace with your transport's health check when run inside the harness.
  if [ -n "${DGUI_HMEM_PROBE:-}" ]; then
    curl -fsS -X POST "$MCP_URL" \
      -H 'content-type: application/json' \
      -H 'accept: application/json, text/event-stream' \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"dgui-hmem-ruleset","version":"1"}}}' \
      >/dev/null || { echo "[run] MCP probe failed"; exit 1; }
  fi
  echo "[run] ok"
}

stage_test() {
  local fail=0
  echo "[test] verification stages"
  # V1: ruleset present
  [ -f "$RULESET" ] || { echo "  FAIL ruleset missing"; fail=1; }
  # V2: JEV key isolation - if JEV mode is claimed, a key must exist
  if [ "${JEV_MODE:-0}" = "1" ]; then
    [ -n "${JEV_API_KEY:-}" ] || { echo "  FAIL JEV_MODE=1 without JEV_API_KEY"; fail=1; }
  fi
  # V3: pack files complete
  for f in INSTRUCT.md task.sh task.sql task.json task.assembly; do
    [ -f "$PACK_DIR/$f" ] || { echo "  FAIL missing $f"; fail=1; }
  done
  # V4: no secrets in pack (cheap shape scan; real gate is server-side redaction)
  if grep -rIlE 'sk_(live|test)_|whsec_|ghp_|hf_[A-Za-z0-9]{20,}|BEGIN (RSA |EC )?PRIVATE KEY' "$PACK_DIR" 2>/dev/null; then
    echo "  FAIL credential-shaped material in pack"; fail=1
  fi
  # V5: destructive commands stay gated
  if [ "$DESTRUCTIVE" != "1" ]; then
    echo "[test] RUN_DESTRUCTIVE=1 gates destructive work; currently off"
  fi
  [ "$fail" = "0" ] || { echo "[test] FAIL"; exit 1; }
  echo "[test] ok"
}

case "${1:-all}" in
  setup) stage_setup ;;
  build) stage_build ;;
  run)   shift 2>/dev/null || true; stage_run "${1:-}" ;;
  test)  stage_test ;;
  all)   stage_setup && stage_build && stage_run "${2:-}" && stage_test ;;
  *) echo "usage: $0 {setup|build|run|test|all}"; exit 2 ;;
esac