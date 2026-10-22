#!/usr/bin/env python3
"""Convert a skill package into a ctecx_instruct@1 five-part pack.

The pack follows the CTECX format:
  INSTRUCT.md, task.sh, task.sql, task.json, task.assembly
zipped as ctecx_instruct_<task_id>.zip.

Ownership is embedded twice in every part:
  owner        the original skill owner, exactly as supplied
  format_owner wan mohd azizi bin wan hosen, ctaxnagomi, est 2024

Usage:
  python contrib/instruct/convert_skill.py \
    --skill contrib/skills/ab-engineering-deliverables \
    --out contrib/instruct/packs

The skill's SKILL.md frontmatter may carry:
  name, description, owner, license

--owner overrides the frontmatter owner. The converter never invents one.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import zipfile
from datetime import date

FORMAT_VERSION = "ctecx_instruct@1"
FORMAT_OWNER = "wan mohd azizi bin wan hosen, ctaxnagomi, est 2024"
PARTS = ["INSTRUCT.md", "task.sh", "task.sql", "task.json", "task.assembly"]


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    lines = text.splitlines()
    if lines[0].strip() != "---":
        return {}, text
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return {}, text
    meta = {}
    for line in lines[1:end]:
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip().strip('"').strip("'")
    return meta, "\n".join(lines[end + 1:]).lstrip("\n")


def find_title(body: str) -> str:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return "Untitled Skill"


def split_sections(body: str) -> tuple[str, dict]:
    intro: list[str] = []
    sections: dict[str, str] = {}
    current = None
    buf: list[str] = []
    for line in body.splitlines():
        if line.startswith("## "):
            if current is None:
                intro = buf
            else:
                sections[current] = "\n".join(buf).strip()
            current = line[3:].strip()
            buf = []
        elif line.startswith("# "):
            continue
        else:
            buf.append(line)
    if current is None:
        intro = buf
    else:
        sections[current] = "\n".join(buf).strip()
    return "\n".join(intro).strip(), sections


def numbered_steps(text: str) -> list[str]:
    steps = []
    for line in text.splitlines():
        match = re.match(r"^\s{0,3}\d+\.\s+(.*\S)\s*$", line)
        if match:
            steps.append(match.group(1))
    return steps


def list_files(skill_dir: str) -> list[str]:
    found = []
    for root, dirs, files in os.walk(skill_dir):
        dirs[:] = sorted(d for d in dirs if d not in (".git", "__pycache__", ".venv"))
        for name in sorted(files):
            full = os.path.join(root, name)
            found.append(os.path.relpath(full, skill_dir).replace("\\", "/"))
    return sorted(found)


def fence_for(text: str) -> str:
    longest = max((len(m) for m in re.findall(r"`+", text)), default=0)
    return "`" * max(3, longest + 1)


def build_instruct(*, meta: dict, title: str, intro: str, sections: dict,
                   owner: str, task_id: str, skill_rel: str, files: list[str],
                   today: str, zip_name: str) -> str:
    name = meta.get("name", title.lower().replace(" ", "-"))
    description = meta.get("description") or intro.split("\n\n")[0].strip() or title
    license_name = meta.get("license", "MIT")

    details = [
        f"- **Skill:** `{name}` - {description}",
        f"- **Original owner:** {owner}",
        f"- **Format owner:** {FORMAT_OWNER}",
        f"- **Format:** `{FORMAT_VERSION}`",
        f"- **Source package:** `{skill_rel}`",
        f"- **License:** {license_name}",
        "- **Fidelity rule:** Appendix A carries the full original SKILL.md. If this pack and "
        "the appendix disagree, the appendix wins until the owner updates it.",
        "- **Ownership rule:** the owner line must remain in all five parts. Removing it breaks "
        "the pack and the owner's attribution.",
    ]

    constraint_keys = ["When to use", "Inputs", "Contracts", "Pitfalls"]
    constraint_blocks = [(key, sections[key]) for key in constraint_keys if sections.get(key)]
    if constraint_blocks:
        details.append("")
        details.append("### Constraints from the skill")
        for key, body in constraint_blocks:
            details.append("")
            details.append(f"**{key}**")
            details.append("")
            details.append(body)

    steps_text = sections.get("Steps") or sections.get("Execution Steps")
    if steps_text:
        execution = (
            "The steps below are copied from the owner's SKILL.md. Run them exactly. "
            "Appendix A is authoritative if anything here is ambiguous.\n\n" + steps_text
        )
    else:
        headings = [h for h in sections if h not in ("Credits", "Owner")]
        execution = "\n".join(f"{i + 1}. {h}" for i, h in enumerate(headings))

    deliverables = ["- Skill package files:"]
    deliverables += [f"  - `{path}`" for path in files]
    deliverables += ["- Pack files:"]
    deliverables += [f"  - `{part}`" for part in PARTS]
    deliverables += [f"- Zip: `{zip_name}`"]

    verification = [
        "1. `bash task.sh test` returns 0.",
        "2. `task.json` manifest hashes match the four content parts.",
        "3. Every part contains the original owner line.",
        "4. Appendix A matches the owner's SKILL.md byte for byte.",
        "5. Install the skill and run its own verification steps.",
    ]
    if sections.get("Verification"):
        verification += ["", "Owner verification:", "", sections["Verification"]]

    skill_text = None
    skill_md_path = os.path.join(skill_rel, "SKILL.md")
    if os.path.exists(skill_md_path):
        with open(skill_md_path, encoding="utf-8") as fh:
            skill_text = fh.read()
    readme_text = None
    if os.path.exists(os.path.join(skill_rel, "README.md")):
        with open(os.path.join(skill_rel, "README.md"), encoding="utf-8") as fh:
            readme_text = fh.read()

    out = []
    out.append(f"<!-- owner: {owner} -->")
    out.append(f"<!-- format: {FORMAT_VERSION} - {FORMAT_OWNER} -->")
    out.append("")
    out.append("# CTECX Task Log - INSTRUCT")
    out.append("")
    out.append(f"- **task_id**: `{task_id}`")
    out.append(f"- **owner**: {owner}")
    out.append(f"- **format_owner**: {FORMAT_OWNER}")
    out.append(f"- **created**: `{today}`")
    out.append("- **status**: `open`")
    out.append(f"- **format_version**: `{FORMAT_VERSION}`")
    out.append("")
    out.append("## Objective")
    out.append("")
    out.append(f"> {description}")
    out.append("")
    out.append("## Important Details")
    out.append("")
    out.append("\n".join(details))
    out.append("")
    out.append("## Work State")
    out.append("")
    out.append("### Completed")
    out.append("")
    out.append(f"- `{name}` authored by {owner}.")
    out.append(f"- Source package: `{skill_rel}` ({len(files)} files).")
    out.append("")
    out.append("### Active")
    out.append("")
    out.append(f"- `{FORMAT_VERSION}` pack generated on {today}. Awaiting contributor review and merge.")
    out.append("")
    out.append("### Blocked")
    out.append("")
    out.append("- None.")
    out.append("")
    out.append("## Execution Steps")
    out.append("")
    out.append(execution)
    out.append("")
    out.append("## Deliverables")
    out.append("")
    out.append("\n".join(deliverables))
    out.append("")
    out.append("## Verification")
    out.append("")
    out.append("\n".join(verification))
    out.append("")
    out.append("## Owner")
    out.append("")
    out.append("```")
    out.append(owner)
    out.append(f"Format: {FORMAT_VERSION} - {FORMAT_OWNER}")
    out.append("```")
    out.append("")
    out.append("## Appendix A - Original SKILL.md")
    out.append("")
    if skill_text is not None:
        fence = fence_for(skill_text)
        out.append(fence + "markdown")
        out.append(skill_text.rstrip())
        out.append(fence)
    else:
        out.append("_SKILL.md was not present in the source package._")
    out.append("")
    out.append("## Appendix B - Original README.md")
    out.append("")
    if readme_text is not None:
        fence = fence_for(readme_text)
        out.append(fence + "markdown")
        out.append(readme_text.rstrip())
        out.append(fence)
    else:
        out.append("_README.md was not present in the source package._")
    out.append("")
    return "\n".join(out)


def build_task_sh(*, owner: str, task_id: str, skill_rel: str, slug: str) -> str:
    owner_q = json.dumps(owner)
    return f"""#!/usr/bin/env bash
# task.sh - ctecx_instruct executable part
# owner: {owner}
# format: {FORMAT_VERSION} - {FORMAT_OWNER}
# task_id: {task_id}
# idempotent + safe-by-default. Destructive ops require RUN_DESTRUCTIVE=1.
set -euo pipefail

TASK_ID="${{TASK_ID:-{task_id}}}"
WORKDIR="${{WORKDIR:-.}}"
PACK_DIR="$(cd "$(dirname "${{BASH_SOURCE[0]}}")" && pwd)"
SKILL_DIR="${{SKILL_DIR:-{skill_rel}}}"
SKILLS_DIR="${{SKILLS_DIR:-$HOME/.config/opencode/skills}}"
RUN_DESTRUCTIVE="${{RUN_DESTRUCTIVE:-0}}"
DRY_RUN="${{DRY_RUN:-1}}"

PYTHON="${{PYTHON:-python}}"
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON=python3

log() {{ printf '[ctecx_instruct] %s\\n' "$*"; }}

setup() {{
  log "setup: $TASK_ID"
  command -v "$PYTHON" >/dev/null 2>&1 || {{ log "python is required"; return 1; }}
  if [ ! -d "$SKILL_DIR" ]; then
    local alt="$PACK_DIR/../../../../$SKILL_DIR"
    if [ -d "$alt" ]; then SKILL_DIR="$alt"; fi
  fi
  if [ ! -d "$SKILL_DIR" ]; then
    log "source package missing: $SKILL_DIR"
    log "extract Appendix A from INSTRUCT.md to recreate it"
    return 1
  fi
}}

build() {{
  log "build: $TASK_ID (documentation skill, nothing to compile)"
}}

install_skill() {{
  local target="$SKILLS_DIR/{slug}"
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
}}

run() {{
  log "run: $TASK_ID"
  install_skill
}}

verify_owner() {{
  "$PYTHON" - "$PACK_DIR" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
owner = {owner_q}
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
}}

verify_no_placeholders() {{
  "$PYTHON" - "$PACK_DIR" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
bad = []
for path in root.iterdir():
    if not path.is_file() or path.name not in ("INSTRUCT.md", "task.json", "task.sql", "task.assembly"):
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    if ("{{{{" in text) or ("}}}}" in text) or "<fill-on-pack>" in text or "YYYY-MM-DD" in text:
        bad.append(path.name)
for name in bad:
    print("PLACEHOLDER", name)
sys.exit(0 if not bad else 1)
PY
}}

verify_manifest() {{
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
}}

test() {{
  log "test: $TASK_ID"
  verify_owner
  verify_no_placeholders
  verify_manifest
}}

main() {{
  setup
  build
  run
  test
  log "closed: $TASK_ID"
}}

case "${{1:-all}}" in
  setup) setup ;;
  build) build ;;
  run) run ;;
  test) test ;;
  all) main ;;
  *) echo "usage: $0 [setup|build|run|test|all]"; exit 2 ;;
esac
"""


def build_task_sql(*, owner: str, task_id: str, slug: str) -> str:
    owner_sql = owner.replace("'", "''")
    params = json.dumps({"skill": slug, "format_owner": FORMAT_OWNER})
    params_sql = params.replace("'", "''")
    return f"""-- task.sql - ctecx_instruct persistence part
-- owner: {owner}
-- format: {FORMAT_VERSION} - {FORMAT_OWNER}
-- task_id: {task_id}
-- Flavour: SQLite (portable). PostgreSQL variant: swap JSONB for JSON, add COLLATE none.

PRAGMA journal_mode = WAL;

-- Agent memory: the conversation/decision store an ADE or IDE attaches to.
CREATE TABLE IF NOT EXISTS agent_memory (
  msg_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT    NOT NULL,
  sender     TEXT    NOT NULL,            -- 'human' | 'agent' | 'tool'
  role       TEXT    NOT NULL,            -- 'think' | 'act' | 'observe' | 'verify'
  payload    TEXT    NOT NULL,            -- JSON-encoded message
  embedding  TEXT,                        -- JSON-encoded float vector (model-agnostic)
  ts         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_task ON agent_memory (task_id, ts);

-- Task metadata + audit trail.
CREATE TABLE IF NOT EXISTS task_meta (
  task_id    TEXT PRIMARY KEY,
  owner      TEXT NOT NULL DEFAULT '{owner_sql}',
  status     TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | blocked | closed
  params     TEXT NOT NULL DEFAULT '{{}}',     -- JSON
  started_at TEXT,
  closed_at  TEXT
);

CREATE TABLE IF NOT EXISTS task_audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  action  TEXT NOT NULL,                     -- e.g. 'opened' | 'step_done' | 'closed'
  detail  TEXT NOT NULL DEFAULT '{{}}'
);
CREATE INDEX IF NOT EXISTS idx_task_audit ON task_audit (task_id, at);

-- Convenience: open a task. params records the skill and the format owner.
INSERT OR IGNORE INTO task_meta (task_id, owner, status, params, started_at)
VALUES ('{task_id}',
        '{owner_sql}',
        'open', '{params_sql}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
"""


def build_assembly(*, owner: str, task_id: str, steps: list[str]) -> str:
    lines = [
        "; task.assembly - ctecx_instruct plan part",
        f"; owner: {owner}",
        f"; format: {FORMAT_VERSION} - {FORMAT_OWNER}",
        f"; task_id: {task_id}",
        "; The build written as a program listing. Mnemonics:",
        ";   MOV  assign/place           CALL invoke (command, function, tool)",
        ";   PUSH record/append          CMP  compare/assert",
        ";   JZ   branch on condition    JMP  unconditional next",
        ";   HLT  halt stage             RET  finish / return state",
        ";",
        "; :SEGMENTS   labelled stages that mirror INSTRUCT.md steps",
        "; :REGISTERS  current task state, tracked like machine registers",
        "",
        "; ---------------- SEGMENT .stage.init ----------------",
        '    MOV    status,        "open"',
        '    PUSH   task_audit,    { action: "opened" }',
        "    CALL   task.sql       ; ensure agent_memory + task_meta exist",
        "; verify: task_meta row exists",
        "    CMP    EXISTS(task_meta), 1",
        "    JZ     .fail_missing_task_meta",
        "",
    ]
    if not steps:
        steps = ["Follow the Execution Steps in INSTRUCT.md"]
    for i, step in enumerate(steps, start=1):
        clean = re.sub(r"\s+", " ", step).strip()
        lines += [
            f"; ---------------- SEGMENT .stage.step_{i} ----------------",
            f"    ; INSTRUCT step {i}: {clean}",
            f"    CALL   step_{i}",
            f'    PUSH   task_audit,    {{ action: "step_done", step: {i} }}',
            f"    CMP    exit_code, 0",
            f"    JZ     .fail_step_{i}",
            "",
        ]
    lines += [
        "; ---------------- SEGMENT .stage.verify ----------------",
        "    CALL   task.sh test",
        "    CMP    hash(manifest), task.json.manifest",
        "    JZ     .fail_manifest",
        "",
        "; ---------------- SEGMENT .stage.close ----------------",
        '    MOV    status,        "closed"',
        '    PUSH   task_audit,    { action: "closed" }',
        '    RET    { task_id, status: "closed" }',
        "",
        "; ---------------- HANDLERS ----------------",
        ".fail_missing_task_meta:",
        '    HLT   "agent_memory/task_meta missing"',
    ]
    for i in range(1, len(steps) + 1):
        lines += [f".fail_step_{i}:", f'    HLT   "step {i} failed"']
    lines += [
        ".fail_manifest:",
        '    HLT   "manifest hash mismatch"',
        "",
    ]
    return "\n".join(lines)


def sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert a skill into a ctecx_instruct@1 pack")
    ap.add_argument("--skill", required=True, help="skill directory containing SKILL.md")
    ap.add_argument("--out", default=os.path.join("contrib", "instruct", "packs"))
    ap.add_argument("--owner", default=None, help="skill owner; defaults to SKILL.md frontmatter")
    ap.add_argument("--task-id", default=None, help="defaults to ctecx-<slug>-001")
    ap.add_argument("--no-zip", action="store_true")
    args = ap.parse_args()

    skill_dir = os.path.abspath(args.skill)
    skill_md = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(skill_md):
        print(f"error: missing {skill_md}", file=sys.stderr)
        return 2

    with open(skill_md, encoding="utf-8") as fh:
        raw = fh.read()
    meta, body = parse_frontmatter(raw)
    title = find_title(body)
    intro, sections = split_sections(body)

    slug = meta.get("name") or os.path.basename(skill_dir)
    owner = args.owner or meta.get("owner")
    if not owner:
        print("error: no owner. Pass --owner or set owner: in SKILL.md frontmatter.", file=sys.stderr)
        return 2
    task_id = args.task_id or f"ctecx-{slug}-001"
    today = date.today().isoformat()
    zip_name = f"ctecx_instruct_{task_id}.zip"

    skill_rel = os.path.relpath(skill_dir, os.getcwd()).replace("\\", "/")
    files = list_files(skill_dir)
    steps = numbered_steps(sections.get("Steps") or sections.get("Execution Steps") or "")

    out_dir = os.path.abspath(args.out)
    pack_dir = os.path.join(out_dir, task_id)
    os.makedirs(pack_dir, exist_ok=True)

    instruct = build_instruct(
        meta=meta, title=title, intro=intro, sections=sections, owner=owner,
        task_id=task_id, skill_rel=skill_rel, files=files, today=today, zip_name=zip_name,
    )
    task_sh = build_task_sh(owner=owner, task_id=task_id, skill_rel=skill_rel, slug=slug)
    task_sql = build_task_sql(owner=owner, task_id=task_id, slug=slug)
    assembly = build_assembly(owner=owner, task_id=task_id, steps=steps)

    payloads = {
        "INSTRUCT.md": instruct,
        "task.sh": task_sh,
        "task.sql": task_sql,
        "task.assembly": assembly,
    }
    for name, text in payloads.items():
        path = os.path.join(pack_dir, name)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        if name == "task.sh":
            os.chmod(path, 0o755)

    manifest = [{"path": name, "sha256": sha256(os.path.join(pack_dir, name))}
                for name in ("INSTRUCT.md", "task.sh", "task.sql", "task.assembly")]
    task_json = {
        "format_version": FORMAT_VERSION,
        "task_id": task_id,
        "owner": owner,
        "format_owner": FORMAT_OWNER,
        "created": today,
        "status": "open",
        "params": {"skill": slug, "source": skill_rel, "license": meta.get("license", "MIT")},
        "tags": ["skill", "contribution", slug],
        "parts": PARTS,
        "manifest": manifest,
        "_note": "task.json is excluded from its own manifest (a file cannot hash itself).",
    }
    with open(os.path.join(pack_dir, "task.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(task_json, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    zip_path = os.path.join(out_dir, zip_name)
    if not args.no_zip:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for name in PARTS:
                path = os.path.join(pack_dir, name)
                info = zipfile.ZipInfo.from_file(path, arcname=name)
                info.create_system = 3  # Unix, so the exec bit survives extraction
                info.external_attr = (0o755 if name == "task.sh" else 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(path, "rb") as fh:
                    zf.writestr(info, fh.read())

    print(f"pack:  {pack_dir}")
    if not args.no_zip:
        print(f"zip:   {zip_path}")
    print(f"owner: {owner}")
    print(f"parts: {', '.join(PARTS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
