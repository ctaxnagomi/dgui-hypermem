# Contributing to DGUI-HyperMem

Thanks for helping improve **DGUI-HyperMem** (DeckerGUI HyperMemory) — a self-hosted hybrid
memory MCP server on Cloudflare Workers with a JEV reasoning layer.

## Ways to contribute

- **Retrieval** — fusion weights, candidate shortlisting, FTS5/vector tuning (`src/store.ts`).
- **JEV layer** — prompts/questions, thresholds, new providers (`src/jev.ts`).
- **Dataset flywheel** — row schema and sync behaviour (`src/dataset.ts`).
- **MCP surface** — new tools, better schemas/descriptions (`src/index.ts`).
- **Docs** — README, deployment notes, examples.

## Getting set up

```bash
git clone https://github.com/ctaxnagomi/dgui-hypermem
cd dgui-hypermem
npm install

npx wrangler d1 create dgui-hypermem
npx wrangler vectorize create dgui-hypermem --dimensions=768 --metric=cosine
# put the D1 id into wrangler.jsonc, then:
npx wrangler d1 migrations apply dgui-hypermem --local   # or --remote
npx wrangler dev
```

Run the checks before opening a PR:

```bash
npm run typecheck
```

For MCP testing, clients must send `Accept: application/json, text/event-stream`.

## Rules

1. **Never commit secrets.** `MCP_TOKEN`, `TYPESAFE_API_KEY` and `HF_TOKEN` live in Worker
   secrets (or `.dev.vars`, git-ignored). Keep `.token` / `.hftoken` out of git.
2. **Migrations are append-only.** Add `migrations/000N_*.sql`; never edit an applied one.
3. **Keep the dataset row contract stable.** If you change a row shape in `src/dataset.ts`,
   document it here and in the README — the HuggingFace rows are append-only history.
4. **Attribute upstream.** TypeSafe AI attribution stays intact.
5. **One thing per pull request.**

## How to become a contributor

1. Fork the repo and branch: `git checkout -b my-change`.
2. Make the change; update docs and add a migration if the schema changed.
3. Run `npm run typecheck`.
4. Add yourself to [CONTRIBUTORS.md](CONTRIBUTORS.md) — add a row to the **Contributors**
   table with your name/handle and what you did.
5. Commit, push, open a PR: what changed, why, and how you verified it.

Your name appears in `CONTRIBUTORS.md` once merged.

## Pull request checklist

- [ ] `npm run typecheck` passes
- [ ] No secrets, tokens or `.dev.vars` committed
- [ ] Schema changes shipped as a new migration
- [ ] Docs/README updated
- [ ] `CONTRIBUTORS.md` updated (if you are a new contributor)

## Credits

See [CONTRIBUTORS.md](CONTRIBUTORS.md): **DeckerGUI** (project), **TypeSafe AI**
(Jev / System One), **KrackedDevs**, **CTECX**.

## License

By contributing you agree your contribution is licensed under the repository's
[MIT License](LICENSE).
