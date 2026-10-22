# INSTRUCT conversion - ctecx_instruct@1

Every skill contributed through an MCP agent is converted into the CTECX five-part
instruction pack. The pack is the reproducible form of the skill: another agent can read it
and rebuild the skill almost exactly as the original owner wrote it, while the owner keeps
ownership inside the artifact.

Upstream format: <https://github.com/ctaxnagomi/ctecx-instruct>

## The five parts

| Part | Kind | Purpose |
|---|---|---|
| `INSTRUCT.md` | document | Task log: objective, details, work state, steps, deliverables, verification, owner, full original skill text as appendices |
| `task.sh` | executable | Idempotent setup/install/run/test script, plus owner, placeholder and manifest checks |
| `task.sql` | schema | `agent_memory`, `task_meta`, `task_audit` so task state lives in the database an ADE or IDE attaches to |
| `task.json` | metadata | `task_id`, owner, dates, params, tags, file manifest with sha256 |
| `task.assembly` | plan | The steps as labelled segments with opcode-style mnemonics |

The zip contains exactly the five files at its root and is named
`ctecx_instruct_<task_id>.zip`.

## Ownership is embedded, not implied

Two owners appear in every part:

| Field | Who | Example |
|---|---|---|
| `owner` | the original skill owner, exactly as the contributor supplied | `Jane Doe (@jane), 2026` |
| `format_owner` | the formatter author | `wan mohd azizi bin wan hosen, ctaxnagomi, est 2024` |

- `INSTRUCT.md` carries both in its header comments and in the `## Owner` block.
- `task.json` carries both as fields, and repeats the skill owner under `params`.
- `task.sh`, `task.sql` and `task.assembly` carry both in their header comments.
- `task.sql` stores the owner in `task_meta.owner` and the format owner in `params`.

The converter never invents an owner. It reads `owner:` from `SKILL.md` frontmatter or takes
`--owner`, and stops if neither is present.

## Usage

```bash
python contrib/instruct/convert_skill.py \
  --skill contrib/skills/<slug> \
  --out contrib/instruct/packs
```

Override the owner or task id when needed:

```bash
python contrib/instruct/convert_skill.py \
  --skill contrib/skills/<slug> \
  --owner "Jane Doe (@jane), 2026" \
  --task-id ctecx-<topic>-002 \
  --out contrib/instruct/packs
```

Output:

```
contrib/instruct/packs/
  <task_id>/
    INSTRUCT.md
    task.sh
    task.sql
    task.json
    task.assembly
  ctecx_instruct_<task_id>.zip
```

## What the converter preserves

- The full original `SKILL.md` and `README.md` as Appendix A and Appendix B. Fidelity is the
  point: the appendix wins if the structured summary is ambiguous.
- The execution steps verbatim from the skill's `## Steps` section.
- Constraints from `When to use`, `Inputs`, `Contracts` and `Pitfalls`.
- The skill's own verification steps, on top of the pack checks.
- A manifest with sha256 for the four content parts. `task.json` is excluded from its own
  manifest, as the format requires.

## When the skill has runnable steps

The generated `task.sh` installs the skill and validates the pack. If the skill ships code,
extend `setup`, `build`, `run` and `test` with the real commands. Keep it idempotent and
safe by default. Destructive operations stay behind `RUN_DESTRUCTIVE=1`.

## Verify a pack

```bash
bash contrib/instruct/packs/<task_id>/task.sh test
unzip -l contrib/instruct/packs/ctecx_instruct_<task_id>.zip
```

`task.sh test` proves three things: the owner line is in every part, no unresolved
placeholder remains, and every manifest hash matches.

## Contribution checklist

- [ ] `owner` is the exact name and handle the contributor supplied
- [ ] Both owner lines are present in all five parts
- [ ] `task.sh test` returns 0
- [ ] Appendix A matches the owner's `SKILL.md`
- [ ] The zip holds exactly five files at its root
- [ ] The contributor row is added to CONTRIBUTORS.md

## Credits

Developer ctaxnagomi, Contribute by ctaxnagomi, Show some love by visit his Github Repo https://github.com/ctaxnagomi/dgui-hypermem give some star
