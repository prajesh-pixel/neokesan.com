/*
 * sync-qr.js — pulls the neoKesan QR registry out of WordPress and writes the
 * static redirect pages + print-ready SVGs into q/.
 *
 * Run: node scripts/sync-qr.js
 * Runs on a schedule via .github/workflows/sync-qr.yml (and manually).
 *
 * For each registry entry it writes:
 *
 *   q/<slug>/index.html   the redirect page — this is what a printed code opens
 *   q/<slug>/qr.svg       the print-ready vector for that code
 *   q/registry.json       committed snapshot; the backup if WordPress is lost
 *
 * WordPress is the source of truth. This script is a one-way projection of it,
 * so the entire failure philosophy is: a bad run must never destroy good
 * committed output. On any doubt it exits non-zero and writes nothing, which
 * leaves the previous good pages live.
 *
 * What that means concretely — it aborts, before touching the filesystem, if:
 *   - the fetch fails (WordPress down, DNS, 5xx, timeout)
 *   - the response is not the expected {ok, count, items} envelope
 *   - ok is not true, or count disagrees with items.length
 *   - any slug is not a safe path segment
 *   - any target would break out of an HTML attribute or a JS string
 *   - the registry came back empty while q/registry.json still lists codes
 *   - the run would delete more than half the existing pages
 *
 * The last two are the important ones. An empty or truncated registry is
 * indistinguishable from "every product was deleted", and the naive reaction —
 * prune everything not in the list — would delete the redirect page behind
 * every code already printed on packaging. So emptiness is treated as an error
 * rather than as data.
 *
 * To override the prune valve deliberately (you really did delete most of the
 * catalog): NEOKESAN_QR_FORCE=1 node scripts/sync-qr.js
 */
const fs = require('fs');
const path = require('path');
const NeoKesanQR = require('../assets/qr-render.js');

const REGISTRY_URL = 'https://shop.neokesan.com/wp-json/neokesan/v1/qr-registry';
const ROOT = path.join(__dirname, '..');
const QR_DIR = path.join(ROOT, 'q');
const SNAPSHOT = path.join(QR_DIR, 'registry.json');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

// A slug becomes a directory name, so it is validated rather than trusted.
// This is the guard that makes "..", "/" and "\" impossible — without it a
// malicious or corrupted registry response could write anywhere on disk.
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

// Characters that have no business in a product URL and would let a target
// break out of the href="" attribute or the location.replace('' ) argument.
const UNSAFE_TARGET_RE = /[<>"'`\\\s]/;

const FORCE = process.env.NEOKESAN_QR_FORCE === '1';

function html(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* -------------------------------------------------------------------------
 * Fetch
 * ---------------------------------------------------------------------- */

async function fetchRegistry() {
  // The cache-buster is load-bearing, not defensive. This endpoint is fetched
  // with no credentials, and Hostinger's CDN caches unauthenticated REST GETs
  // for up to 7 days — admin.js only appends its own cb= when a token is
  // present, so a scheduled run would otherwise read a week-old registry and
  // silently republish stale targets.
  const url = REGISTRY_URL + '?cb=' + Date.now();
  const headers = {
    'Accept': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      let data;
      try {
        data = JSON.parse(body);
      } catch (_) {
        throw new Error(`response was not JSON (${body.slice(0, 120)}...)`);
      }
      return data;
    } catch (err) {
      lastErr = err;
      console.warn(`  attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastErr;
}

function validateRegistry(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('registry is not an object — expected an {ok, count, items} envelope');
  }
  if (data.ok !== true) {
    throw new Error(`registry did not report ok:true (got ${JSON.stringify(data.ok)})`);
  }
  if (!Array.isArray(data.items)) {
    throw new Error('registry has no items array');
  }
  if (data.count !== data.items.length) {
    throw new Error(`count (${data.count}) disagrees with items.length (${data.items.length})`);
  }

  const items = [];
  for (const raw of data.items) {
    if (!raw || typeof raw !== 'object') throw new Error('registry contains a non-object item');

    const slug = String(raw.slug == null ? '' : raw.slug);
    if (!SLUG_RE.test(slug)) {
      throw new Error(`unsafe slug ${JSON.stringify(slug)} — refusing to use it as a path`);
    }

    const target = String(raw.target == null ? '' : raw.target);
    if (!target) throw new Error(`slug ${slug} has an empty target`);
    if (UNSAFE_TARGET_RE.test(target)) {
      throw new Error(`slug ${slug} has a target that cannot be embedded safely: ${JSON.stringify(target)}`);
    }
    if (target[0] !== '/' && !/^https:\/\/(www\.|shop\.)?neokesan\.com(\/|$)/.test(target)) {
      throw new Error(`slug ${slug} targets somewhere we do not own: ${JSON.stringify(target)}`);
    }

    items.push({
      slug: slug,
      key: String(raw.key == null ? '' : raw.key),
      name: String(raw.name == null ? slug : raw.name),
      target: target,
    });
  }

  // Deterministic order — the committed snapshot must not churn just because
  // MySQL returned rows in a different order this time.
  items.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return items;
}

/* -------------------------------------------------------------------------
 * Render
 * ---------------------------------------------------------------------- */

function redirectPage(item) {
  const url = NeoKesanQR.qrLink(item.slug);
  const target = item.target;

  // Styles are inline rather than pulling in the versioned /styles.css. The
  // header of those pages is generated once per product; if they linked the
  // shared stylesheet, every cache-bump of styles.css would need every QR page
  // regenerated just to stay consistent.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${html(item.name)} | neoKesan</title>
  <link rel="icon" type="image/png" href="/assets/logo.png">
  <link rel="canonical" href="${html(target)}">
  <meta http-equiv="refresh" content="0; url=${html(target)}">
  <style>
    body{margin:0;font-family:Aleo,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    .redirect-panel{min-height:100vh;display:grid;place-items:center;background:#f7faf9;padding:24px}
    .redirect-card{max-width:420px;text-align:center;background:#fff;border:1px solid #d9e9e2;border-radius:14px;padding:40px 30px;box-shadow:0 18px 40px #00000008}
    .redirect-card h1{font-size:26px;letter-spacing:-.04em;margin:0 0 8px;color:#043b31}
    .redirect-card p{font-size:14px;color:#617d74;margin:0 0 22px}
    .redirect-card a{display:inline-block;background:#0d7a5f;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:999px}
  </style>
</head>
<body>
  <div class="redirect-panel">
    <div class="redirect-card">
      <h1>${html(item.name)}</h1>
      <p>Taking you to the right page&hellip;</p>
      <a href="${html(target)}">Continue</a>
    </div>
  </div>
  <script>
    // The meta refresh alone works without JS, but it leaves a history entry;
    // replace() does not, so Back from the product page returns to wherever the
    // visitor scanned from rather than bouncing through here again.
    window.location.replace(${JSON.stringify(target)});
  </script>
</body>
</html>
`;
}

function snapshotJson(items) {
  const payload = {
    note:
      'Committed snapshot of the neoKesan QR registry, generated by scripts/sync-qr.js. ' +
      'Do not edit by hand. WordPress is the source of truth; this file is the backup and ' +
      'the record of which slugs have ever been issued. Deliberately contains no timestamp, ' +
      'so an unchanged registry produces an unchanged file and no commit.',
    items: items.map((it) => ({
      slug: it.slug,
      key: it.key,
      name: it.name,
      target: it.target,
      url: NeoKesanQR.qrLink(it.slug),
    })),
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

/* -------------------------------------------------------------------------
 * Plan + write
 * ---------------------------------------------------------------------- */

function existingSlugs() {
  let entries;
  try {
    entries = fs.readdirSync(QR_DIR, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && SLUG_RE.test(e.name))
    .map((e) => e.name);
}

function readSnapshotItems() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (_) {
    return [];
  }
}

function writeFileIfChanged(file, contents) {
  try {
    if (fs.readFileSync(file, 'utf8') === contents) return false;
  } catch (_) {
    // not there yet
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return true;
}

async function main() {
  console.log(`Fetching ${REGISTRY_URL} ...`);
  const raw = await fetchRegistry();
  const items = validateRegistry(raw);
  console.log(`Registry OK: ${items.length} code(s).`);

  if (items.length === 0) {
    // A genuinely empty catalog is possible, but it is far more likely to mean
    // "the table is missing" or "the query broke". Either way the correct
    // action is the same: change nothing and make noise.
    const known = readSnapshotItems().length;
    if (known > 0) {
      throw new Error(
        `registry came back empty but q/registry.json still lists ${known} code(s) — refusing to prune. ` +
        'If the catalog really is empty now, delete q/ and re-run.'
      );
    }
    console.log('Nothing to publish; q/ is already empty.');
    return;
  }

  const wanted = new Set(items.map((it) => it.slug));
  const have = existingSlugs();
  const stale = have.filter((slug) => !wanted.has(slug));

  if (stale.length > 0 && !FORCE && stale.length * 2 > have.length) {
    throw new Error(
      `refusing to delete ${stale.length} of ${have.length} pages (more than half) — ` +
      'that is the shape of a truncated registry, not of a real cleanup. ' +
      'Re-run with NEOKESAN_QR_FORCE=1 if it is intentional.'
    );
  }

  let pages = 0;
  let svgs = 0;
  for (const item of items) {
    const dir = path.join(QR_DIR, item.slug);
    if (writeFileIfChanged(path.join(dir, 'index.html'), redirectPage(item))) pages++;
    const svg = NeoKesanQR.buildQrSvg(NeoKesanQR.qrLink(item.slug), {
      label: `${item.name} — ${NeoKesanQR.qrLink(item.slug)}`,
    });
    if (writeFileIfChanged(path.join(dir, 'qr.svg'), svg)) svgs++;
  }

  if (writeFileIfChanged(SNAPSHOT, snapshotJson(items))) {
    console.log('Wrote q/registry.json');
  }

  for (const slug of stale) {
    fs.rmSync(path.join(QR_DIR, slug), { recursive: true, force: true });
    console.log(`Removed q/${slug}/ (no longer in the registry)`);
  }

  console.log(`\n${items.length} code(s): ${pages} page(s) and ${svgs} SVG(s) changed.`);
  if (pages === 0 && svgs === 0 && stale.length === 0) {
    console.log('Already up to date.');
  }
}

main().catch((err) => {
  // Every registry-level check runs before the first write, so an abort here
  // means the filesystem is untouched and the previously committed pages stay
  // live. Exit non-zero so the workflow goes red instead of failing quietly.
  console.error(`\nABORTED — nothing written: ${err.message}`);
  process.exit(1);
});
