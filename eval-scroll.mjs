// Regression suite for URL fragment cleanup on the landing and admin pages.
//
//   node eval-scroll.mjs
//
// Why this exists and why it drives a real browser: the fragment-stripping
// shipped three wrong versions before it was verified against a real DOM. Each
// looked correct in the source and passed every other suite.
//
//   1. Stripping on DOMContentLeft the section 2407px below the viewport on the
//      live page, because the six carousel iframes had not loaded and the
//      document was not yet tall enough to scroll.
//   2. Re-asserting on documentElement.scrollHeight did nothing: this page
//      scrolls BODY inside a height:100% html, so that value never changes.
//   3. Re-asserting per requestAnimationFrame fought the carousel's own scroll
//      handling hard enough to peg the page; evaluate calls started timing out.
//
// None of that is visible to a unit test, and none of it is visible by reading
// the code. It only shows up when a real engine scrolls a real layout. So this
// renders the pages, loads them in headless Chrome, and reads back where #crm
// actually ended up.
//
// Requires Chrome. Set CHROME_PATH if it is not in a standard location.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log("ok    " + name);
  else {
    failed++;
    console.log("FAIL  " + name + (detail !== undefined ? "  <- " + JSON.stringify(detail) : ""));
  }
};

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean).find((p) => existsSync(p));

if (!CHROME) {
  console.log("SKIP  no Chrome found; set CHROME_PATH to run this suite");
  process.exit(0);
}

const out = mkdtempSync(join(tmpdir(), "scroll-"));
const BUILD = { bundle: true, format: "esm", platform: "node", mainFields: ["module", "main"], logLevel: "error" };

for (const [entry, name] of [["src/landing.ts", "landing"], ["src/admin.ts", "admin"]]) {
  const file = join(out, `${name}.mjs`);
  await build({ ...BUILD, entryPoints: [entry], outfile: file });
  const mod = await import(pathToFileURL(file).href);
  const html = name === "landing" ? mod.LANDING_HTML : mod.ADMIN_HTML;
  // The carousel iframes point at external origins. Left alone they make the run
  // slow and flaky, and the fragment logic never touches them.
  const trimmed = html.replace(/(<iframe[^>]*\ssrc=")[^"]*(")/gi, "$1about:blank$2");
  writeFileSync(join(out, `${name}.html`), trimmed);
}

// Reports into the DOM so `chrome --dump-dom` can read it back. Waits out the
// cold-load re-placement schedule (300/900/1800/3200ms) before reporting: an
// earlier version of this probe declared success as soon as the position stopped
// changing and so reported a pre-retry state that looked like a broken scroll.
const PROBE = `
<div id="PROBE">pending</div>
<script>
(function(){
  var t0 = Date.now(), last = null, stable = 0, MIN = 6000;
  var iv = setInterval(function(){
    var t = document.getElementById("crm");
    var s = {
      hash: location.hash,
      scrollTop: Math.round(document.body.scrollTop),
      rectTop: t ? Math.round(t.getBoundingClientRect().top) : null,
      bodyH: document.body.scrollHeight,
      clientH: document.body.clientHeight
    };
    var same = last && s.scrollTop === last.scrollTop && s.rectTop === last.rectTop && s.bodyH === last.bodyH;
    if (same) stable++; else stable = 0;
    last = s;
    var age = Date.now() - t0;
    if ((stable >= 4 && age >= MIN) || age > 15000) {
      clearInterval(iv);
      document.getElementById("PROBE").textContent = "R" + JSON.stringify(s) + "R";
    }
  }, 250);
})();
</script>
`;

const CLICK = `<script>setTimeout(function(){var a=document.querySelector('a[href^="#"]');if(a)a.click();},1200);</script>`;

// Reproduces the condition that actually broke this. In production the six
// carousel iframes load over the following second or two and push #crm down, so
// the scroll placed at parse time is pointing at the wrong place by the time the
// page settles.
//
// Blanking those iframes (above) removes exactly that condition, which is why an
// earlier version of this suite passed with the cold-load handling deleted: with
// the layout already final, a single scrollIntoView is enough and the bug cannot
// occur. So the growth is simulated explicitly instead -- a spacer inserted above
// #crm after the page's own script has run.
const GROW = `<script>
setTimeout(function(){
  var crm = document.getElementById("crm");
  if (!crm || !crm.parentNode) return;
  var s = document.createElement("div");
  s.style.height = "1200px";
  crm.parentNode.insertBefore(s, crm);
}, 700);
</script>`;

function run(page, fragment, mode) {
  const html = readFileSync(join(out, `${page}.html`), "utf8");
  const extra = mode === "click" ? CLICK : mode === "grow" ? GROW : "";
  writeFileSync(join(out, "probe.html"), html.replace("</body>", extra + PROBE + "</body>"));
  const dom = execFileSync(
    CHROME,
    [
      "--headless=new", "--disable-gpu", "--no-sandbox",
      // Forces the instant scroll path. The smooth path is the default for real
      // visitors and was verified in a headed browser, but a smooth scroll does
      // not reliably finish under --virtual-time-budget, so without this the
      // click case reports scrollTop 0 and looks like a broken click handler.
      "--force-prefers-reduced-motion",
      "--window-size=1280,900", "--virtual-time-budget=25000",
      "--run-all-compositor-stages-before-draw", "--dump-dom",
      // The fragment must survive onto the file, or the deep-link branch never
      // runs and the probe reports a scroll of 0 that looks like a bug.
      "file:///" + join(out, "probe.html").replace(/\\/g, "/") + (fragment || ""),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 },
  );
  const m = dom.match(/R(\{.*?\})R/);
  if (!m) throw new Error(`no probe result for ${page}${fragment || ""} (${mode || ""})`);
  return JSON.parse(m[1]);
}

console.log("# the page is actually scrollable, so a scroll is a meaningful assertion");
{
  const r = run("landing", "", "");
  check("landing body is scrollable", r.bodyH > r.clientH + 100, r);
  check("landing has no fragment on a plain load", r.hash === "", r);
  check("landing does not scroll on a plain load", r.scrollTop === 0, r);
}

console.log("\n# deep link to a real section");
{
  const r = run("landing", "#crm", "");
  check("fragment removed from the URL", r.hash === "", r);
  check("#crm scrolled to the top of the viewport", r.rectTop !== null && Math.abs(r.rectTop) <= 2, r);
  check("body actually scrolled", r.scrollTop > 100, r);
}

console.log("\n# click on a #crm anchor");
{
  const r = run("landing", "", "click");
  check("fragment removed from the URL", r.hash === "", r);
  check("#crm scrolled to the top of the viewport", r.rectTop !== null && Math.abs(r.rectTop) <= 2, r);
}

console.log("\n# deep link where the layout grows afterwards (the real failure mode)");
{
  // A spacer is inserted above #crm after the page's script has run, standing in
  // for the carousel iframes loading. The cold-load re-placements have to notice
  // and correct for it; a single scroll at parse time cannot.
  const r = run("landing", "#crm", "grow");
  check("fragment removed from the URL", r.hash === "", r);
  check("page really did grow under the target", r.bodyH > 5000, r);
  check("#crm still ends at the top after the layout moved", r.rectTop !== null && Math.abs(r.rectTop) <= 2, r);
}

console.log("\n# fragment naming a section that does not exist");
{
  const r = run("landing", "#nope-nothing-here", "");
  check("fragment still removed", r.hash === "", r);
  check("no scroll attempted", r.scrollTop === 0, r);
}

console.log("\n# the cold-load retry schedule exists, not just the load listener");
{
  // A behavioural test cannot cover this on its own. With the local render the
  // load event does fire, so the `load` listener re-places the target and masks
  // the deletion of the timed schedule -- verified: removing afterLayout() left
  // this suite fully green. The schedule is the mechanism that works when load
  // does NOT fire, which is the case that actually broke production (a slow or
  // blocked carousel subframe keeps readyState at "interactive" forever).
  // So it is asserted structurally, the same way the secret-leak guard is.
  const src = readFileSync("src/landing.ts", "utf8");
  const start = src.indexOf("const afterLayout");
  const end = src.indexOf("const goTo", start);
  check("afterLayout is defined", start !== -1 && end > start);
  const cold = src.slice(start, end);
  // The delays live in an array that forEach feeds to setTimeout, so match the
  // array rather than setTimeout's argument list.
  const arr = cold.match(/\[(\d+(?:\s*,\s*\d+)+)\]/);
  const delays = arr ? arr[1].split(",").map((n) => Number(n.trim())) : [];
  check("afterLayout schedules several timed re-placements", delays.length >= 3, delays);
  check("the schedule spans several seconds", delays.length > 0 && Math.max(...delays) >= 2000, delays);
  check("each delay drives a setTimeout placement", /\.forEach\(function \(ms\)[\s\S]{0,120}setTimeout\(/.test(cold));
  check("re-placements are cancelled if the visitor scrolls", /wheel[\s\S]{0,200}touchstart/.test(cold));
  check("the bail handler really sets the flag", /var bail = function \(\) \{ cancelled = true; \}/.test(cold));
  check("the cancellation is actually honoured", /if \(!cancelled\) place\(target, false\)/.test(cold));
  check("the cold path calls afterLayout", /if \(!cold\) return;[\s\S]{0,80}afterLayout\(target\)/.test(src));
  check("the click path opts out of cold handling", /goTo\(target, false\)/.test(src));
}

console.log("\n# admin");
{
  const r = run("admin", "#whatever", "");
  check("arriving fragment removed", r.hash === "", r);

  // Line comments are stripped first: the code deliberately mentions the old
  // <a href="#"> markup when explaining why it was replaced, and a naive tag
  // match counts that prose as a live anchor.
  const html = readFileSync(join(out, "admin.html"), "utf8");
  const codeOnly = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  const real = [...codeOnly.matchAll(/<a\s[^>]*href="#"/g)];
  check("no <a href=\"#\"> tags remain", real.length === 0, real.length);
  check("no hash-only href survives anywhere in the code", !/href=["']#["']/.test(codeOnly));
}

rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
