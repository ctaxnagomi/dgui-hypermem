# Contributing through an MCP agent

This document is for an AI agent connected to the DGUI-HyperMem MCP server, helping a user
prepare a contribution. It also applies when the user contributes by hand and just wants the
checklist.

## Golden rule

Prepare, show, ask. The agent may create files and edit docs. The agent must not commit,
push, open a pull request or merge without explicit permission for that operation.

## 1. Interview

Ask three things before writing anything:

1. **What is being contributed?** A skill, a tool, a case study, a docs fix or a bug fix.
2. **What name and handle should appear in CONTRIBUTORS.md?** Use the exact spelling the
   contributor gives. Never invent or abbreviate a name.
3. **Does the work contain client data, secrets, tokens or third-party material?** If yes,
   anonymise it or get written permission before it enters the repository.

If the contributor does not have a clone of the repository, prepare the files plus a patch
instead of a branch. The contribution is still valid.

## 2. Prepare the package

### Skills

Create `contrib/skills/<slug>/` from `contrib/skills/_template/`:

```
contrib/skills/<slug>/
  SKILL.md                 frontmatter: name, description; steps, contracts, pitfalls
  README.md                what it is, why it belongs here, install, credits
  CASE_STUDY.md            optional, when the skill comes from a real run
  references/              optional, long recipes and snippets
```

Rules for a skill:

- `name` is lowercase and hyphenated, and matches the folder.
- `description` says what it does and when to use it, in one or two sentences.
- The steps must run without the author present: commands, paths, expected output.
- Put the print, deploy or safety gotchas in the skill. That is the value.
- If a case study uses a client name, confirm the contributor has permission.

### Code

- Branch from the current default branch, one thing per pull request.
- Add tests where the repository has them, and run `npm run typecheck`.
- Schema changes ship as a new migration, never an edit to an applied one.
- Update the README and any affected docs in the same change.

## 3. Safety scan

Before showing the diff:

- Search for secrets: `token`, `key`, `bearer`, `password`, `.dev.vars`, `.token`, `.hftoken`.
- Remove personal data that the contributor has not agreed to publish.
- Resolve every placeholder. A credit line with `{{...}}` left in it is not finished.
- Confirm the contribution can be licensed under the repository MIT license.
- Keep third-party attribution intact.

## 4. Add the contributor row (mandatory)

Every contribution adds a row to the **Contributors** table in
[CONTRIBUTORS.md](../CONTRIBUTORS.md), in the **same change** as the contribution:

```markdown
| **Name** (@handle) | One line: what they contributed | this change |
```

Rules:

- Add the row before you show the diff or ask about committing.
- The name must be the one the contributor supplied.
- If they are already listed, update their row instead of adding a duplicate.
- Never add a row for someone who did not author the change. Reporting an issue counts only
  when the row says so and links the issue.
- When the pull request exists, replace `this change` with the PR link.

## 5. Show the diff and ask

Run and show:

```bash
git status --short
git diff --stat
git diff
```

Then summarise in plain language: what was added, where it lives, and what was checked.
Ask explicitly which of these the contributor wants:

1. commit and push,
2. commit only,
3. leave the files uncommitted.

Merging is always a separate question, asked immediately before the merge.

## 6. If the contributor cannot push

Produce a patch they can attach to an issue or email:

```bash
git format-patch -1 --stdout > contrib-<slug>.patch
```

Also give them the file list and the exact branch name. Do not create a pull request on
their behalf unless they ask for it.

## Copy-paste prompt

A user can paste this into any MCP client connected to DGUI-HyperMem:

> Help me contribute <thing> to DGUI-HyperMem. Prepare it under `contrib/skills/<slug>/`
> from the template, run the safety checks, add my name <name> (@handle) to
> CONTRIBUTORS.md, show me the diff, and ask before any commit or push.

## Checklist

- [ ] Package is complete and runnable without the author present
- [ ] No secrets, tokens or unapproved client data
- [ ] Placeholders resolved, including the credit line
- [ ] Contributor row added to CONTRIBUTORS.md with the exact name
- [ ] Diff shown to the contributor
- [ ] Permission asked before commit, push or merge

## Credits

Developer ctaxnagomi, Contribute by ctaxnagomi, Show some love by visit his Github Repo https://github.com/ctaxnagomi/dgui-hypermem give some star
