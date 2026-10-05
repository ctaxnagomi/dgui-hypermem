// Offline test for the quota-change notice store.
//
// A quota notice is the only channel by which a user learns that an
// administrator changed their allowance, so the properties that matter are
// about delivery, not about SQL:
//
//   - a notice is written for the account that changed, and only that account
//   - delivery hands back only UNREAD notices
//   - delivery marks them read, so a change surfaces exactly once
//   - history is still readable afterwards
//   - a malformed data blob must not hide the notice (the message is the part a
//     human reads)
//   - an id belonging to another account can never be acknowledged
//
// Runs in-process against node:sqlite, so a pass here means the same SQL passes
// on D1. No wrangler, no network, and crucially no production data touched.
//
//   node eval-notices.mjs
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const out = mkdtempSync(join(tmpdir(), "notices-"));
await build({
  entryPoints: ["src/store.ts"],
  bundle: true, format: "esm", platform: "neutral",
  outfile: join(out, "store.mjs"), logLevel: "error",
});
const { recordQuotaNotice, listQuotaNotices, ackQuotaNotices, takeUnreadQuotaNotices } =
  await import(pathToFileURL(join(out, "store.mjs")).href);

// --- D1 shim ------------------------------------------------------------------
// The store uses prepare().bind().run()/all()/first() and reads .meta.changes
// off a run() result, so the shim has to report real change counts.
function makeD1(db) {
  const wrap = (stmt) => {
    const api = {
      _args: [],
      bind: (...v) => { api._args = v; return api; },
      all: async () => ({ results: stmt.all(...api._args) }),
      first: async () => stmt.get(...api._args) ?? null,
      // run() must actually execute. It matters here specifically because the
      // lazy CREATE TABLE is the only thing that ever builds quota_notices --
      // a shim that returned without executing leaves the table missing and the
      // first INSERT fails, which looks like a store bug and is not one.
      run: async () => {
        const r = stmt.run(...api._args);
        return { success: true, meta: { changes: Number(r.changes) } };
      },
    };
    return api;
  };
  return { prepare: (sql) => wrap(db.prepare(sql)) };
}

const db = new DatabaseSync(":memory:");
const env = { DB: makeD1(db) };

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log("ok    " + name);
  else { console.log("FAIL  " + name + (detail ? "  -> " + JSON.stringify(detail) : "")); failed++; }
};

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

// --- writing -----------------------------------------------------------------
await recordQuotaNotice(env, ALICE, "quota_changed", "quota 5,600 to 10,000", {
  previous_quota_monthly: 5600, quota_monthly: 10000,
});
await recordQuotaNotice(env, BOB, "quota_changed", "quota 1,000 to 2,000", {
  previous_quota_monthly: 1000, quota_monthly: 2000,
});
const aliceAll = await listQuotaNotices(env, ALICE, 20);
const bobAll = await listQuotaNotices(env, BOB, 20);
check("notice recorded for the right account", aliceAll.length === 1 && bobAll.length === 1, {
  alice: aliceAll.length, bob: bobAll.length,
});
check("data survives the JSON round trip", aliceAll[0].data.quota_monthly === 10000, aliceAll[0].data);
check("message is intact", aliceAll[0].message === "quota 5,600 to 10,000", aliceAll[0].message);

// --- account isolation -------------------------------------------------------
// The single most important property: one account must never see another's.
const bobSeen = await listQuotaNotices(env, "carol@example.com", 20);
check("unknown account sees nothing", bobSeen.length === 0, bobSeen.length);
const idsA = new Set(aliceAll.map((n) => n.id));
const bobLeaks = bobAll.filter((n) => idsA.has(n.id));
check("no id is shared between accounts", bobLeaks.length === 0, bobLeaks);

// --- unread vs delivered -----------------------------------------------------
const unread = await listQuotaNotices(env, ALICE, 20, true);
check("new notice is unread", unread.length === 1, unread.length);
check("unread filter reports read_at null", unread[0].read_at === null, unread[0].read_at);

// --- delivery: exactly once --------------------------------------------------
const delivered = await takeUnreadQuotaNotices(env, ALICE);
check("delivery returns the pending notice", delivered.length === 1, delivered.length);
const second = await takeUnreadQuotaNotices(env, ALICE);
check("delivery does not repeat itself", second.length === 0, second.length);
const history = await listQuotaNotices(env, ALICE, 20);
check("history survives delivery", history.length === 1, history.length);
check("history now marked delivered", history[0].read_at !== null, history[0].read_at);
const deliveredIds = new Set(delivered.map((n) => n.id));
check("the delivered notice is the one in history", deliveredIds.has(history[0].id));

// Delivery must not touch the other account's pending notice.
const bobStillUnread = await listQuotaNotices(env, BOB, 20, true);
check("delivering for one account leaves the other's pending", bobStillUnread.length === 1, bobStillUnread.length);

// --- acknowledgement ---------------------------------------------------------
await recordQuotaNotice(env, BOB, "quota_changed", "quota 2,000 to 4,000", { quota_monthly: 4000 });
const acked = await ackQuotaNotices(env, BOB, [bobAll[0].id]);
check("ack reports the number of rows it changed", acked === 1, acked);
const bobAfter = await listQuotaNotices(env, BOB, 20, true);
check("only the named notice was acked", bobAfter.length === 1 && bobAfter[0].id !== bobAll[0].id, bobAfter.map((n) => n.id));

const ackAll = await ackQuotaNotices(env, BOB, []);
check("ack with no ids clears the account's undelivered", ackAll === 1, ackAll);
check("account is now clear", (await listQuotaNotices(env, BOB, 20, true)).length === 0);

// --- cross-account ack is impossible ----------------------------------------
// The id is a UUID belonging to Alice; Bob must not be able to mark it read,
// because the UPDATE is scoped by email as well as id.
const crossAck = await ackQuotaNotices(env, BOB, [aliceAll[0].id]);
const aliceStillRead = await listQuotaNotices(env, ALICE, 20);
check("cannot ack another account's notice by id", crossAck === 0 && aliceStillRead[0].read_at !== null, {
  crossAck, readAt: aliceStillRead[0].read_at,
});

// --- malformed data must not hide the notice ---------------------------------
db.prepare(
  "INSERT INTO quota_notices (id,email,kind,message,data,created_at) VALUES (?1,?2,?3,?4,?5,?6)",
).run("broken-1", ALICE, "quota_changed", "human readable message", "{not json", 1);
const withBroken = await listQuotaNotices(env, ALICE, 20);
const broken = withBroken.find((n) => n.id === "broken-1");
check("malformed data yields null, not an exception", broken !== undefined && broken.data === null, broken && broken.data);
check("the message is still returned", broken && broken.message === "human readable message", broken && broken.message);

// --- ordering and limit ------------------------------------------------------
for (let i = 0; i < 5; i++) {
  await recordQuotaNotice(env, ALICE, "quota_changed", "bulk " + i, { i });
}
const recent = await listQuotaNotices(env, ALICE, 3);
check("limit is respected", recent.length === 3, recent.length);
check("newest first", recent[0].message === "bulk 4", recent[0].message);

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILURE(S)"}`);
rmSync(out, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
