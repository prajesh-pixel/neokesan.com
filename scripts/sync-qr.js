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
 * It reads two endpoints, both public:
 *
 *   /qr-registry   which codes exist, and where each one points
 *   /products      the accent colour each code is inked in
 *
 * The second one is why styling needs no plugin change: it is already
 * `__return_true` and already carries `data.accent`. It is fetched separately
 * from the registry because the QR admin payload carries no colour at all.
 *
 * WordPress is the source of truth. This script is a one-way projection of it,
 * so the entire failure philosophy is: a bad run must never destroy good
 * committed output. On any doubt it exits non-zero and writes nothing, which
 * leaves the previous good pages live.
 *
 * What that means concretely — it aborts, before touching the filesystem, if:
 *   - either fetch fails (WordPress down, DNS, 5xx, timeout)
 *   - the registry is not the expected {ok, count, items} envelope
 *   - ok is not true, or count disagrees with items.length
 *   - the products response is neither an array nor an {items[]} envelope
 *   - any slug is not a safe path segment
 *   - any target would break out of an HTML attribute or a JS string
 *   - the registry came back empty while q/registry.json still lists codes
 *   - the run would delete more than half the existing pages
 *
 * The products fetch aborts too, and that is deliberate rather than incidental:
 * with no accents every code would render black, which would rewrite every
 * qr.svg with something that looks perfectly valid and would be printed.
 *
 * The last two of the registry checks are the important ones. An empty or
 * truncated registry is indistinguishable from "every product was deleted", and
 * the naive reaction — prune everything not in the list — would delete the
 * redirect page behind every code already printed on packaging. So emptiness is
 * treated as an error rather than as data.
 *
 * To override the prune valve deliberately (you really did delete most of the
 * catalog): NEOKESAN_QR_FORCE=1 node scripts/sync-qr.js
 */
const fs = require('fs');
const path = require('path');
const NeoKesanQR = require('../assets/qr-render.js');

const REGISTRY_URL = 'https://shop.neokesan.com/wp-json/neokesan/v1/qr-registry';
const PRODUCTS_URL = 'https://shop.neokesan.com/wp-json/neokesan/v1/products';
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

async function fetchJson(url, what) {
  // The cache-buster is load-bearing, not defensive. These endpoints are fetched
  // with no credentials, and Hostinger's CDN caches unauthenticated REST GETs
  // for up to 7 days — admin.js only appends its own cb= when a token is
  // present, so a scheduled run would otherwise read a week-old response and
  // silently republish stale targets.
  const full = url + '?cb=' + Date.now();
  const headers = {
    'Accept': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(full, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      try {
        return JSON.parse(body);
      } catch (_) {
        throw new Error(`response was not JSON (${body.slice(0, 120)}...)`);
      }
    } catch (err) {
      lastErr = err;
      console.warn(`  ${what}: attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw new Error(`${what}: ${lastErr.message}`);
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

/**
 * Product slug -> accent colour, taken from the public products endpoint.
 *
 * A product with no colour — or one we cannot parse — is simply absent from the
 * map, and the caller skips its code and says so. Substituting black would
 * quietly publish a code that does not match the packaging it is printed on,
 * which is worse than not publishing one at all.
 *
 * @param {*} data Parsed response body.
 * @return {Map<string, string>} Slug -> `#rrggbb`.
 */
function accentsBySlug(data) {
  const rows = Array.isArray(data) ? data
    : (data && typeof data === 'object' && Array.isArray(data.items)) ? data.items
    : null;
  if (!rows) {
    throw new Error('products response is neither an array nor an {items[]} envelope');
  }

  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const slug = String(row.slug == null ? '' : row.slug);
    const accent = row.data && typeof row.data === 'object' ? row.data.accent : '';
    if (slug && typeof accent === 'string' && NeoKesanQR.isHexColor(accent)) {
      map.set(slug, accent.trim());
    }
  }
  return map;
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
      // Recorded so the codes are reproducible from this file alone. If
      // WordPress is ever lost, this is what lets the SVGs be rebuilt in the
      // right colours rather than black.
      accent: it.accent || null,
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
  const items = validateRegistry(await fetchJson(REGISTRY_URL, 'registry'));
  console.log(`Registry OK: ${items.length} code(s).`);

  console.log(`Fetching ${PRODUCTS_URL} ...`);
  const accents = accentsBySlug(await fetchJson(PRODUCTS_URL, 'products'));
  console.log(`Products OK: ${accents.size} coloured product(s).`);
  // `key` is the product slug and is what carries the colour; the fallback
  // covers a registry row that predates the field, where slug is the same value.
  for (const item of items) item.accent = accents.get(item.key || item.slug) || null;

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
  const skipped = [];
  for (const item of items) {
    const dir = path.join(QR_DIR, item.slug);

    // The redirect page is the permanent contract, so it is always written —
    // even for a slug we cannot ink. The code on the box points here regardless
    // of what colour it was printed in.
    if (writeFileIfChanged(path.join(dir, 'index.html'), redirectPage(item))) pages++;

    if (!item.accent) {
      // Deliberately not a black fallback. A black code would look like a
      // perfectly good result and would be printed, and it would not match the
      // packaging it is stuck to. Any qr.svg already there is left alone.
      skipped.push(item.slug);
      continue;
    }

    const ink = NeoKesanQR.resolveInk(item.accent);
    if (ink.adjusted) {
      console.warn(
        `  q/${item.slug}: accent ${item.accent} is below the ${NeoKesanQR.MIN_CONTRAST}:1 floor ` +
        `against white — inked as ${ink.color} (${ink.contrast.toFixed(2)}:1) instead.`
      );
    } else if (ink.warn) {
      console.warn(
        `  q/${item.slug}: accent ${item.accent} is only ${ink.contrast.toFixed(2)}:1 against white. ` +
        'Legible, but worth a scan test on the real print.'
      );
    }

    const svg = NeoKesanQR.buildQrSvg(NeoKesanQR.qrLink(item.slug), {
      accent: item.accent,
      label: `${item.name} — ${NeoKesanQR.qrLink(item.slug)}`,
    });
    if (writeFileIfChanged(path.join(dir, 'qr.svg'), svg)) svgs++;
  }

  for (const slug of skipped) {
    console.warn(
      `SKIPPED q/${slug}/qr.svg — product "${slug}" has no accent colour set. ` +
      'Its redirect page is live; set an accent in the admin panel and the next sync will ' +
      'generate the code.'
    );
  }

  if (writeFileIfChanged(SNAPSHOT, snapshotJson(items))) {
    console.log('Wrote q/registry.json');
  }

  for (const slug of stale) {
    fs.rmSync(path.join(QR_DIR, slug), { recursive: true, force: true });
    console.log(`Removed q/${slug}/ (no longer in the registry)`);
  }

  console.log(`\n${items.length} code(s): ${pages} page(s) and ${svgs} SVG(s) changed.`);
  if (skipped.length > 0) {
    // Named separately from the counts above, because "0 SVG(s) changed" on its
    // own reads as success — and for these slugs it is not.
    console.log(`${skipped.length} code(s) skipped for want of an accent: ${skipped.join(', ')}.`);
  }
  if (pages === 0 && svgs === 0 && stale.length === 0 && skipped.length === 0) {
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
