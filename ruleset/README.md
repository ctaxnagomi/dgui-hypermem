# ruleset/

Training-governance artefacts for DGUI-HyperMem. **Placeholder policy:** nothing
with a real path, email, or key value is ever committed. Concrete grant files
live locally with the owner (gitignored); the committed forms are templates.

## Layout

```
ruleset/
├── README.md                          this file
├── build_instruct_pack.py             pack builder (committed, no secrets)
├── leak_check.py                      zip leak checker (committed, no secrets)
│
├── DGUI_HMEM_RULESET.md               CONCRETE - owner-only, gitignored
├── DECKERGUI_SDK_RULESET.md           CONCRETE - owner-only, gitignored
├── DGUI_HMEM_RULESET_INSTRUCT/        CONCRETE pack (5 parts), gitignored
├── DGUI_HMEM_RULESET_INSTRUCT.zip     CONCRETE zip, gitignored
│
└── templates/                         COMMIT-SAFE forms (placeholders only)
    ├── DGUI_HMEM_RULESET.template.md
    ├── DECKERGUI_SDK_RULESET.template.md
    ├── DGUI_HMEM_RULESET_INSTRUCT/    template pack (5 parts)
    └── DGUI_HMEM_RULESET_INSTRUCT.zip template zip (distributable)
```

## Placeholders

| Placeholder | Meaning |
|---|---|
| `<OWNER_CONTACT_URL>` | where users reach the owner to request SDK config |
| `<OWNER_TOKEN_FILE_PATH>` | the owner's local, gitignored secrets file (never the values) |
| `<SDK_JEV_KEY_NAME>` | name of the owner-minted JEV grant key (value injected at runtime) |

## Build

```sh
python ruleset/build_instruct_pack.py          # concrete zip (local, gitignored)
python ruleset/build_instruct_pack.py --template  # template zip (committed)
python ruleset/leak_check.py                   # asserts template zip is clean
```

Before committing anything under `ruleset/`, run `leak_check.py` and confirm the
template zip reports `NONE`. The concrete zip is expected to trip the checker —
it is owner-only and must stay gitignored.

## Policy (user instruction)

- **Do not commit the concrete rulesets unless the pipeline needs them.** The
  pipeline-form (`RULESET_TRAIN_CORPUS.md` at repo root) and the template forms
  are what git carries.
- Distribute the **template zip** to MCP users; resolve placeholders per grant
  without ever committing those values.