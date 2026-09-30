/**
 * Secret redaction for the training corpus.
 *
 * Why this exists: the published privacy policy promised that "training
 * extraction skips rows with detected secrets". No such check existed. The
 * promise was carried by `PRIVACY_HTML` prose and nothing else, so a memory
 * recording the admin passkey was written verbatim into `train.jsonl` and
 * published to a public HuggingFace dataset. The check has to live at the
 * enqueue boundary rather than at flush time, because a flush-time scrub still
 * leaves the secret sitting in D1 forever.
 *
 * Scope, deliberately: this guards the *training corpus* only. Memory content
 * is stored as-is, which is what the privacy policy actually promises users.
 *
 * Known limitation, stated rather than papered over: a secret of fewer than 12
 * characters that contains no digit, carries no known format prefix, and never
 * appears near a credential keyword is not detectable here -- there is nothing
 * to match on. `leakpass920`, `leakpass910` and `correcthorsebattery` are all
 * covered, the first two by the digit branch and the third by length. Closing
 * the remaining gap needs a real entropy model, not a regex.
 */

export interface RedactionResult {
  text: string;
  /** Rule names that fired, e.g. "passkey-assignment". Never the values. */
  findings: string[];
}

/**
 * Words that look value-shaped to the context rule but are ordinary prose or
 * standard names. Without this, "the token authentication" loses a word and
 * "wrapped in base64" loses a technical detail.
 */
const NOT_A_SECRET = new Set([
  "base64", "base32", "sha1", "sha256", "sha512", "md5", "utf8", "utf16",
  "ascii", "oauth", "oauth2", "ipv4", "ipv6", "2fa", "mfa", "sso", "tls",
  "ssl", "rfc3339", "iso8601", "required", "optional", "rotation", "rotate",
  "admin", "server", "worker", "example", "placeholder", "redacted",
  "changeme", "environment", "variable", "reference", "metadata", "standard",
  "production", "development", "localhost", "database", "username", "email",
]);

/**
 * Does this captured value plausibly *be* a secret?
 *
 * Two accepted shapes: it carries a digit and is long enough to not be prose,
 * or it is long enough to be a deliberate choice. Short dictionary words are
 * rejected, which is what keeps the context rule from shredding sentences.
 */
function looksSecretish(value: string): boolean {
  const v = value.trim();
  if (v.length < 6) return false;
  if (NOT_A_SECRET.has(v.toLowerCase())) return false;
  if (/^\d+$/.test(v)) return false; // bare numbers: quotas, ports, timestamps
  if (/\d/.test(v)) return v.length >= 6;
  return v.length >= 12;
}

interface Rule {
  name: string;
  re: RegExp;
  /** Capture group holding the secret. 0 means the whole match is the secret. */
  valueGroup: number;
  /** Optional gate on the captured value; falsy means "leave the match alone". */
  accept?: (value: string) => boolean;
}

const CONTEXTUAL =
  "(?:pass\\s?key|password|passwd|passphrase|api[\\s_-]?key|apikey|" +
  "access[\\s_-]?token|refresh[\\s_-]?token|auth[\\s_-]?token|api[\\s_-]?token|" +
  "bearer[\\s_-]?token|private[\\s_-]?key|client[\\s_-]?secret|secret[\\s_-]?key|" +
  "credentials?)";

/**
 * Assignment-shaped only. Requiring a delimiter or a copula between the
 * keyword and the value is what keeps "the passkey rotation" intact while still
 * catching "the admin passkey `leakpass920`" and "rotating the passkey to new
 * value `leakpass920`".
 */
/**
 * Separator between a keyword and its value.
 *
 * `[\s`'"\[]*` is a delimiter run -- a backtick or quote is the common case, as
 * in "the admin passkey `leakpass910`". The repeated copula group handles phrasings
 * where English stacks words in between, which a single optional copula misses:
 * "rotating the passkey to new value `leakpass920`" needs to cross *to*,
 * *new* and *value* to reach the secret. Bounded at four so a long clause of
 * ordinary prose cannot chain the rule across a sentence.
 */
const SEPARATOR =
  "([\\s`'\"\\[]*(?:(?:is|are|was|were|=|:|->|→|to|of|new|value|become|becomes|rotated?|set)" +
  "\\s*[\\s`'\"\\[]*){0,4})";

const RULES: readonly Rule[] = [
  // --- known provider formats: unambiguous, no context needed ---------------
  { name: "openai-key", re: /sk-(?:live-|test-)?[A-Za-z0-9_-]{16,}/gi, valueGroup: 0 },
  { name: "stripe-key", re: /sk_(?:live|test)_[A-Za-z0-9]{10,}/gi, valueGroup: 0 },
  { name: "stripe-webhook-secret", re: /whsec_[A-Za-z0-9]{16,}/gi, valueGroup: 0 },
  { name: "github-token", re: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/gi, valueGroup: 0 },
  { name: "github-pat", re: /github_pat_[A-Za-z0-9_]{20,}/gi, valueGroup: 0 },
  { name: "huggingface-token", re: /hf_[A-Za-z0-9]{20,}/gi, valueGroup: 0 },
  { name: "cloudflare-token", re: /(?:v1\.0-|cfat_)[A-Za-z0-9_-]{20,}/gi, valueGroup: 0 },
  { name: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/gi, valueGroup: 0 },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/gi, valueGroup: 0 },
  { name: "google-api-key", re: /AIza[0-9A-Za-z_-]{30,}/gi, valueGroup: 0 },
  { name: "jwt", re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{5,}/gi, valueGroup: 0 },
  { name: "authorization-header", re: /(Bearer)(\s+)([A-Za-z0-9._-]{20,})/gi, valueGroup: 3 },

  // --- contextual: keyword, then a delimiter or copula chain, then a value --
  {
    name: "credential-assignment",
    re: new RegExp(`(${CONTEXTUAL})${SEPARATOR}([A-Za-z0-9_+/.=-]{6,120})`, "gi"),
    valueGroup: 3,
    accept: looksSecretish,
  },
];

function maskFor(rule: Rule): string {
  return `[REDACTED:${rule.name}]`;
}

function applyRule(text: string, rule: Rule): RedactionResult {
  const findings: string[] = [];
  const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
  let out = "";
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1; // guard against zero-width loops
      continue;
    }
    const value = rule.valueGroup === 0 ? m[0] : (m[rule.valueGroup] ?? "");
    if (!value) continue;
    if (rule.accept && !rule.accept(value)) continue;

    const at = m[0].indexOf(value);
    if (at === -1) continue; // value not literally inside the match; leave it
    const replacement = m[0].slice(0, at) + maskFor(rule);

    out += text.slice(cursor, m.index) + replacement;
    cursor = m.index + m[0].length;
    findings.push(rule.name);
  }

  if (!findings.length) return { text, findings };
  out += text.slice(cursor);
  return { text: out, findings };
}

/** Redact every recognised secret in a free-text string. */
export function redactSecrets(text: string): RedactionResult {
  let current = text;
  const findings: string[] = [];
  for (const rule of RULES) {
    const next = applyRule(current, rule);
    current = next.text;
    findings.push(...next.findings);
  }
  const co = coRedact(current);
  current = co.text;
  findings.push(...co.findings);
  return { text: current, findings };
}

/**
 * Identifier shape: `ADMIN_PASSKEY_2`, `SECRET_NAME`, `MAX_RETRIES`.
 *
 * These are variable names, not values. They show up constantly in backticks in
 * technical memories, so they must survive even in a string that also holds a
 * real secret.
 */
function looksLikeIdentifier(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

/**
 * Second pass: once a string is *known* to hold a secret, other quoted tokens in
 * it are suspect.
 *
 * The context rule is proximity-based by necessity -- there is no way to know
 * that a token is a credential without either a format prefix or a keyword next
 * to it. That misses the common rotation phrasing, where the second value has
 * no keyword anywhere near it:
 *
 *   "the passkey is `oldpass99` and it was rotated to `newpass99`"
 *
 * The first value is caught by keyword adjacency; the second has only a
 * transfer verb in front of it and would otherwise be published in the clear.
 *
 * Gating on a placeholder already being present keeps this from firing on
 * ordinary prose -- it can only ever activate inside a string that has already
 * been proven to contain a secret. Requiring a digit keeps repo names and
 * identifiers out of it.
 */
const QUOTED_TOKEN = /([`'"])([A-Za-z0-9_+.=/@-]{6,120})\1/g;

function coRedact(text: string): RedactionResult {
  if (!text.includes("[REDACTED:")) return { text, findings: [] };
  const findings: string[] = [];
  const out = text.replace(QUOTED_TOKEN, (whole, q, value: string) => {
    if (!/\d/.test(value)) return whole;
    if (looksLikeIdentifier(value)) return whole;
    if (NOT_A_SECRET.has(value.toLowerCase())) return whole;
    findings.push("co-redacted-quoted");
    return `${q}[REDACTED:co-redacted-quoted]${q}`;
  });
  return { text: out, findings };
}

/** Walk a JSON-ish value and redact every string leaf. */
function deepRedact(value: unknown, findings: string[], depth = 0): unknown {
  if (depth > 12) return value;
  if (typeof value === "string") {
    const r = redactSecrets(value);
    if (r.findings.length) findings.push(...r.findings);
    return r.text;
  }
  if (Array.isArray(value)) return value.map((v) => deepRedact(v, findings, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepRedact(v, findings, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Fields that must survive untouched.
 *
 * `id` and `memory_id` are the dedup key in `flushJevExamples` -- redacting them
 * would republish every row forever. `scope`, `provider`, `model`, `use_case`
 * and `instruct_type` are the axes a training set is sliced by. `created_at`
 * and `source` are not user text.
 */
export const JEV_IDENTITY_FIELDS = [
  "id", "use_case", "instruct_type", "provider", "model",
  "scope", "memory_id", "source", "created_at",
] as const;

/**
 * Redact a JEV row in place, leaving identity fields intact.
 *
 * Free text lives both at the top level (`instruction`, `input`, `output` --
 * all JSON strings) and nested (`state`, `questions`, `answers`), and the row is
 * serialised whole, so both layers have to be walked.
 */
export function scrubJevRow<T extends Record<string, unknown>>(
  row: T,
): { row: T; findings: string[] } {
  const findings: string[] = [];
  const identity = new Set<string>(JEV_IDENTITY_FIELDS);
  const out: Record<string, unknown> = { ...row };

  for (const [key, value] of Object.entries(row)) {
    if (identity.has(key)) continue;
    if (typeof value === "string") {
      const r = redactSecrets(value);
      if (r.findings.length) {
        findings.push(...r.findings);
        out[key] = r.text;
      }
    } else if (value !== null && typeof value === "object") {
      out[key] = deepRedact(value, findings);
    }
  }

  return { row: out as T, findings };
}

/** Distinct rule names, for logging without leaking values. */
export function summariseFindings(findings: string[]): string {
  return [...new Set(findings)].sort().join(", ") || "none";
}
