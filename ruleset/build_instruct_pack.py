#!/usr/bin/env python3
"""Build DGUI_HMEM_RULESET_INSTRUCT.zip (ctecx_instruct@1 pack).

Hashes the four content parts, writes task.json with the manifest, then zips
exactly the five files at the zip root. Idempotent; re-running regenerates.

Two layouts (only placeholders are ever committed):
  default    -> ruleset/DGUI_HMEM_RULESET_INSTRUCT/            (concrete,
               ruleset/DGUI_HMEM_RULESET_INSTRUCT.zip           gitignored)
  --template-> ruleset/templates/DGUI_HMEM_RULESET_INSTRUCT/     (commit-safe,
               ruleset/templates/DGUI_HMEM_RULESET_INSTRUCT.zip   placeholders)

Usage:  python ruleset/build_instruct_pack.py [--template]
"""

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT_PARTS = ["INSTRUCT.md", "task.sh", "task.sql", "task.assembly"]

TASK_ID = "ctecx-dgui-hmem-ruleset-001"
OWNER = "wan mohd azizi bin wan hosen, ctaxnagomi, est 2024"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", action="store_true",
                        help="build from ruleset/templates/ (placeholder form)")
    args = parser.parse_args()

    base = ROOT / "templates" if args.template else ROOT
    pack = base / "DGUI_HMEM_RULESET_INSTRUCT"
    out_zip = base / "DGUI_HMEM_RULESET_INSTRUCT.zip"
    if not pack.is_dir():
        raise SystemExit(f"pack dir missing: {pack}")

    manifest: dict[str, str] = {}
    contents: dict[str, bytes] = {}
    for part in CONTENT_PARTS:
        data = (pack / part).read_bytes()
        contents[part] = data
        manifest[part] = sha256_bytes(data)

    task_json = {
        "format_version": "ctecx_instruct@1",
        "task_id": TASK_ID,
        "owner": OWNER,
        "created": "2026-10-07",
        "status": "active",
        "variant": "template" if args.template else "concrete",
        "params": {
            "mcp_url": "https://dgui-hmem.deckergui.my/mcp",
            "ruleset": "DGUI_HMEM_RULESET.md",
            "jev_key": "JEV_API_KEY (owner-minted; never committed)",
            "sdk_consent_required": True,
        },
        "tags": ["dgui-hypermem", "mcp", "ruleset", "training-governance", "tagid"],
        "parts": ["INSTRUCT.md", "task.sh", "task.sql", "task.assembly", "task.json"],
        "manifest": manifest,  # task.json excluded from its own manifest
    }
    task_data = (json.dumps(task_json, indent=2) + "\n").encode("utf-8")

    files: list[tuple[str, bytes]] = [
        ("INSTRUCT.md", contents["INSTRUCT.md"]),
        ("task.sh", contents["task.sh"]),
        ("task.sql", contents["task.sql"]),
        ("task.json", task_data),
        ("task.assembly", contents["task.assembly"]),
    ]

    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in files:
            zf.writestr(name, data)

    print(f"wrote {out_zip} ({out_zip.stat().st_size} bytes) [variant={task_json['variant']}]")
    print("manifest:")
    for part, h in manifest.items():
        print(f"  {part}: {h}")


if __name__ == "__main__":
    main()