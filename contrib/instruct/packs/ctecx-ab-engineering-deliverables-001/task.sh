#!/usr/bin/env bash
# task.sh - ctecx_instruct executable part
# owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
# format: ctecx_instruct@1 - wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
# task_id: ctecx-ab-engineering-deliverables-001
# idempotent + safe-by-default. Destructive ops require RUN_DESTRUCTIVE=1.
set -euo pipefail

TASK_ID="${TASK_ID:-ctecx-ab-engineering-deliverables-001}"
WORKDIR="${WORKDIR:-.}"
PACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${SKILL_DIR:-contrib/skills/ab-engineering-deliverables}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/.config/opencode/skills}"
RUN_DESTRUCTIVE="${RUN_DESTRUCTIVE:-0}"
DRY_RUN="${DRY_RUN:-1}"

PYTHON="${PYTHON:-python}"
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON=python3

log() { printf '[ctecx_instruct] %s\n' "$*"; }

setup() {
  log "setup: $TASK_ID"
  command -v "$PYTHON" >/dev/null 2>&1 || { log "python is required"; return 1; }
  if [ ! -d "$SKILL_DIR" ]; then
    local alt="$PACK_DIR/../../../../$SKILL_DIR"
    if [ -d "$alt" ]; then SKILL_DIR="$alt"; fi
  fi
  if [ ! -d "$SKILL_DIR" ]; then
    log "source package missing: $SKILL_DIR"
    log "extract Appendix A from INSTRUCT.md to recreate it"
    return 1
  fi
}

build() {
  log "build: $TASK_ID (documentation skill, nothing to compile)"
}

install_skill() {
  local target="$SKILLS_DIR/ab-engineering-deliverables"
  log "install: $SKILL_DIR -> $target"
  if [ "$DRY_RUN" = "1" ]; then
    log "dry run (set DRY_RUN=0 to copy)"
    return 0
  fi
  mkdir -p "$SKILLS_DIR"
  if [ -e "$target" ] && [ "$RUN_DESTRUCTIVE" != "1" ]; then
    log "target exists; set RUN_DESTRUCTIVE=1 to replace"
    return 1
  fi
  if [ -e "$target" ]; then rm -rf "$target"; fi
  cp -R "$SKILL_DIR" "$target"
}

run() {
  log "run: $TASK_ID"
  install_skill
}

verify_owner() {
  "$PYTHON" - "$PACK_DIR" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
owner = "wan mohd azizi bin wan hosen, ctaxnagomi, est 2024"
parts = ["INSTRUCT.md", "task.sh", "task.sql", "task.assembly"]
ok = True
for name in parts:
    text = (root / name).read_text(encoding="utf-8")
    if owner not in text:
        print("OWNER MISSING", name); ok = False
text = (root / "task.json").read_text(encoding="utf-8")
if owner not in text:
    print("OWNER MISSING", "task.json"); ok = False
sys.exit(0 if ok else 1)
PY
}

verify_no_placeholders() {
  "$PYTHON" - "$PACK_DIR" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
bad = []
for path in root.iterdir():
    if not path.is_file() or path.name not in ("INSTRUCT.md", "task.json", "task.sql", "task.assembly"):
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    if ("{{" in text) or ("}}" in text) or "<fill-on-pack>" in text or "YYYY-MM-DD" in text:
        bad.append(path.name)
for name in bad:
    print("PLACEHOLDER", name)
sys.exit(0 if not bad else 1)
PY
}

verify_manifest() {
  if [ -f "$PACK_DIR/task.json" ]; then
    "$PYTHON" - "$PACK_DIR" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
m = json.load(open(root / "task.json", encoding="utf-8"))
ok = True
for f in m.get("manifest", []):
    p = root / f["path"]
    if not p.is_file():
        print("MISSING", f["path"]); ok = False; continue
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    if h != f["sha256"]:
        print("HASH MISMATCH", f["path"]); ok = False
sys.exit(0 if ok else 1)
PY
  fi
}

test() {
  log "test: $TASK_ID"
  verify_owner
  verify_no_placeholders
  verify_manifest
}

main() {
  setup
  build
  run
  test
  log "closed: $TASK_ID"
}

case "${1:-all}" in
  setup) setup ;;
  build) build ;;
  run) run ;;
  test) test ;;
  all) main ;;
  *) echo "usage: $0 [setup|build|run|test|all]"; exit 2 ;;
esac
