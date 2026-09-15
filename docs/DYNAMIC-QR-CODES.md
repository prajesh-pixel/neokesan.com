# Dynamic QR Codes — Technical Reference

> Status: **LIVE since 2026-09-16.** Plugin 0.8.0 installed on `shop.neokesan.com`; commit
> `63ed5a7` pushed to `master`. All three codes (`bloom`, `folix`, `ponic`) are resolvable at
> `https://neokesan.com/q/<slug>/` and were verified with an independent decoder.
> **Not yet verified: the repoint test and the physical print/scan check** — see §11.

How a QR code printed on neoKesan packaging can point somewhere new without reprinting the box.

> **This file is publicly readable.** The site deploys from the repo root, so Jekyll copies
> `docs/` verbatim and this document is served at `neokesan.com/docs/DYNAMIC-QR-CODES.md`.
> Confirmed, not assumed: `neokesan.com/docs/ACCOUNT-SYSTEM-PLAN.md` returns **200** today.
> This document contains no credentials, but it does describe the admin API surface.
>
> If that is not wanted, the safe fix is to move the file **outside the published tree** — or into
> a directory whose name starts with `_`, since Jekyll skips those. Do **not** create a
> `_config.yml` just for this: the repo deliberately has none, and adding one changes Jekyll's
> behaviour site-wide — a far larger change than the problem warrants.

---

## 1. The problem

A QR code is frozen the moment it is printed. Whatever URL it encodes is baked into the pixels,
so the obvious approach — encode the product page — means the code dies the day that URL changes,
and the only fix is reprinting the packaging.

The solution is to never encode the product URL. The code encodes a **permanent short link on our
own domain**:

```
https://neokesan.com/q/bloom/
```

That URL is a tiny static page whose only job is to forward the visitor onwards. The forwarding
destination lives in WordPress and can be changed at any time. So:

- The **printed code** never changes. It is permanent by construction.
- The **destination** is a database field, editable from the admin dashboard.
- Repointing a printed code is an edit, not a reprint.

---

## 2. How it fits together

```
   You add a product
        │
        ▼
   WordPress plugin ──► auto-creates a QR row (slug = product key)
        │
        ├──► Admin dashboard ──► renders the QR *in the browser*
        │                        instant preview + SVG/PNG download,
        │                        works the moment the product exists
        │
        └──► GitHub Action ──► every ~6 h, pulls the registry from WordPress
             (cron, no secrets)   and commits:
                                    q/<slug>/index.html   ← the redirect page
                                    q/<slug>/qr.svg       ← print-ready vector
                                    q/registry.json       ← backup / slug history
        │
        ▼
   Someone scans the printed code
        │
        ▼
   neokesan.com/q/bloom/  ──►  /product.html?key=bloom
   (the printed URL is            (this is the part you can change,
    permanent)                     any time, from the admin panel)
```

The important structural fact: **WordPress is the source of truth, and the committed files are a
one-way projection of it.** Nothing in the static site ever writes back. That keeps the whole
thing debuggable — if the live page and the database disagree, the database is right and the next
sync fixes the page.

---

## 3. Why this works on GitHub Pages

GitHub Pages has no server, so it cannot issue an HTTP redirect. A static HTML file *is* the
redirect:

```html
<meta http-equiv="refresh" content="0; url=/product.html?key=bloom">
...
window.location.replace("/product.html?key=bloom");
```

The meta refresh works with JavaScript disabled; the `replace()` call is the improvement — it
leaves no history entry, so pressing Back from the product page returns the visitor to wherever
they scanned from rather than bouncing them through the redirect page a second time.

This is the same mechanism the pre-existing `neoponic/`, `neobloom/` and `neofolix/` folders
already use, so nothing about how the site deploys had to change.

### Why the trailing slash is mandatory

`q/bloom/` is a *directory* containing an `index.html`. GitHub Pages 301-redirects a request for a
directory that lacks the trailing slash. Encoding `https://neokesan.com/q/bloom/` — **with** the
slash — means a scan resolves in a single hop. That matters when someone is holding a phone at
arm's length from a printed box.

`qrLink()` in `assets/qr-render.js` appends the slash, and it is the single place that decides
this. Both the admin preview and the sync script call it, so they can never disagree.

---

## 4. The two safety rules

The failure that actually matters is a printed code that later points at the **wrong product** —
someone scans the NeoBloom box and lands on NeoPonic. Two rules make that structurally impossible.

### Rule 1 — Slugs are never reused

The QR table is the permanent record of every slug ever issued, and `qr_slug` is `UNIQUE`. If you
delete a product called `bloom` and later create a new one also called `bloom`, the new one does
**not** get `bloom` — it gets `bloom-2`. A code printed in 2026 can never silently become a
different product in 2028.

### Rule 2 — Deleting a product retires its code, never deletes it

The row survives with `status = 'retired'`, and a retired code sends scanners to the **homepage**
rather than a dead "product not found" page. The packaging is out there in someone's hands; it
should land somewhere sensible.

This is precisely why the QR data lives in **its own table** rather than in columns on
`neokesan_products`. Deleting a product hard-deletes its row, so a column-based design could not
remember which slug that product had been printed under — and would be free to hand the slug to
the next product.

A third, quieter case: a product that is **archived or in draft** also falls back to the homepage
in the published registry. Drafts are omitted entirely — they have never shipped, so no packaging
carries their code.

---

## 5. Where everything lives

| Path | What it is |
|---|---|
| `wp-plugin/neokesan-account-api/includes/class-qr.php` | The plugin class — table, slug logic, REST routes |
| `assets/qrcode.js` | Vendored MIT QR encoder (qrcode-generator, Kazuhiko Arase) — unmodified |
| `assets/qr-render.js` | Our renderer. One file, used by browser **and** Node |
| `scripts/sync-qr.js` | Pulls the registry, writes `q/`, commits nothing itself |
| `.github/workflows/sync-qr.yml` | The ~6 h cron that runs the script and commits |
| `q/<slug>/index.html` | Generated redirect page — **this is what a printed code opens** |
| `q/<slug>/qr.svg` | Generated print-ready vector — **print from this, never the PNG** |
| `q/registry.json` | Committed snapshot. The backup if WordPress is ever lost |
| `admin.html` / `admin.js` | The **QR codes** tab — preview, edit destination, download |
| `404.html` | Branded page for unknown/mistyped slugs |

### Why the renderer is JavaScript, not PHP

The plugin has **zero Composer dependencies** and installs by dragging a folder into
`wp-content/plugins`. Adding a PHP QR library would break that install model. So QR generation
lives in JavaScript: one MIT-licensed file, loaded unchanged by both the browser and Node.

`assets/qr-render.js` is UMD-guarded, which is what lets one file serve both:

```js
// admin.html  → window.NeoKesanQR
// sync-qr.js  → require('../assets/qr-render.js')
```

Because both paths call the same `buildQrSvg()`, the code previewed in the admin panel is
**byte-identical** to the code committed and printed. There is no second implementation to drift.

---

## 6. The database table

`{wp_prefix}neokesan_qr` — created by `Neokesan_QR::maybe_create_table()` (`class-qr.php:65`).

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | |
| `qr_slug` | `VARCHAR(80)` | **UNIQUE** — the permanent slug history |
| `product_key` | `VARCHAR(60)` | **UNIQUE** — one QR per product, structurally |
| `target` | `VARCHAR(255) DEFAULT ''` | Where the code currently points |
| `status` | `VARCHAR(20) DEFAULT 'active'` | `active` or `retired` |
| `created_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | |
| `updated_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | |

**No image is stored.** The QR image is a pure function of `slug → target` and is regenerated on
demand. This matches the convention already documented in `Neokesan_Products::registry()`:
*"derived, never stored."* One source of truth, nothing to drift.

Schema changes are versioned via the `neokesan_qr_db_version` option
(`DB_VERSION = 1`, `DB_OPTION`). `maybe_upgrade()` returns immediately when the recorded version
matches, so it is cheap enough to call on every request.

### dbDelta quirks (these silently corrupt the table if ignored)

Carried over from `class-products.php:113-115`:

- **Two spaces** after `PRIMARY KEY` — one space and dbDelta re-runs the query forever.
- `KEY` / `UNIQUE KEY`, **never** `INDEX`.
- No trailing comma.
- `id` first.
- Column type strings must be **byte-identical** across runs, or dbDelta sees a change every time.

Two decisions specific to this table:

- **`target` is `VARCHAR`, not `TEXT`** — MySQL below 8.0.13 rejects `DEFAULT` on `TEXT` columns,
  and dbDelta round-trips defaults.
- **Both keys are `UNIQUE`.** `qr_slug` because it is the permanent history; `product_key` so that
  two QR rows for one product is structurally impossible.

---

## 7. The REST API

Base: `https://shop.neokesan.com/wp-json/neokesan/v1`

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `/qr-registry` | GET | **none (public)** | `slug → target` for the sync action |
| `/admin/qr` | GET | Admin token | Every slug with its product context |
| `/admin/qr/{slug}` | PUT | Admin token | **Change where a printed code points** |

"Admin token" means a bearer token whose user has the `manage_options` capability
(`Neokesan_Auth::require_admin`) — i.e. the WordPress administrator.

`/qr-registry` is public because the GitHub Action that consumes it has **no credential and must
not need one**. It leaks nothing: product keys and the URLs they resolve to are already public on
the site. `{slug}` in the admin route is constrained to `[a-z0-9_-]+`, so it can only ever match a
minted slug.

### Response shapes

```jsonc
// GET /qr-registry
{
  "ok": true,
  "count": 3,
  "generated_at": "2026-09-15 21:37:14",
  "items": [
    { "slug": "bloom", "key": "bloom", "name": "NeoBloom", "target": "/product.html?key=bloom" }
  ]
}

// GET /admin/qr  — same, plus status/product_status/created_at/updated_at per item

// PUT /admin/qr/bloom   {"target": "/product.html?key=bloom-x2"}
// 200: { "ok": true, "slug": "bloom", "items": [ /* the refreshed admin list */ ] }
```

The list comes back **with** the write, so the dashboard never has to re-fetch after an edit.

### Why `/qr-registry` returns an envelope, not a bare array

A bare `[]` cannot be distinguished from a failed request. The sync script treats an empty result
as a reason to prune — which would delete the redirect page behind every printed code. So the
endpoint returns `ok: true` with `count: 0` to mean an explicit, trustworthy *"there are genuinely
no codes"*, and the script treats anything else as an error.

### Destination validation

`target` is admin-editable and gets rendered into a redirect page, so an unrestricted value would
turn the admin panel into an open-redirect generator. `sanitize_target()` (`class-qr.php:347`)
accepts only:

- a **root-relative path** — `/product.html?key=bloom`, or
- an **`https://` URL** whose host is in `ALLOWED_HOSTS`:
  `neokesan.com`, `www.neokesan.com`, `shop.neokesan.com`.

Everything else is rejected with `400 neokesan_bad_target`: off-site links, plain `http://`,
protocol-relative `//evil.com`, `javascript:`, bare words like `product.html`, and host-prefix
spoofs such as `https://neokesan.com.evil.com/`.

### Error codes

| Code | Status | When |
|---|---|---|
| `neokesan_target_required` | 400 | PUT with no `target` key |
| `neokesan_bad_target` | 400 | Target rejected by `sanitize_target()` |
| `neokesan_not_found` | 404 | No such slug |
| `neokesan_db_error` | 500 | The write failed |

---

## 8. Day-to-day operations

### Adding a product

Nothing special to do. `Neokesan_Products::insert()` calls `Neokesan_QR::ensure( $key )`
(`class-products.php:297`), which mints a slug and writes the row with a default target of
`/product.html?key=<key>`.

The QR is available in the admin panel **immediately** — preview and download work before any
sync has run, because the image is rendered in the browser from `slug → target`, not read from a
file. You can add a product and hand a print-ready SVG to a printer the same afternoon.

### Repointing a printed code

1. Admin dashboard → **QR codes** tab.
2. Edit the destination field in the row.
3. The destination is validated client-side (`qrTargetProblem()` mirrors the PHP) before sending
   `PUT /admin/qr/<slug>`.
4. Within ~6 h the next sync rewrites `q/<slug>/index.html`. **The printed URL does not change.**

To publish immediately, run `node scripts/sync-qr.js` locally and push, or trigger the workflow
from the Actions tab.

### Deleting a product

`delete_by_key()` calls `Neokesan_QR::retire( $key )` (`class-products.php:375`) **before** the
product row is removed. The QR row survives with `status = 'retired'`, the slug stays in the
permanent history, and the published registry sends its scanners to `/`.

If you later re-create a product with the same key, `ensure()` finds the retired row and
**reactivates that same slug** rather than minting a new one — so a code already printed on the
old packaging starts working again, pointing at the new product.

### Downloading and printing

The QR tab offers **Download SVG** and **Download PNG**, both generated client-side.

**Print from the SVG, never the PNG.** Vector scales losslessly to any physical size; the PNG is
for on-screen use and small mockups.

---

## 9. The sync

`scripts/sync-qr.js` — run with `node scripts/sync-qr.js`, or automatically via
`.github/workflows/sync-qr.yml`.

```
cron: '23 */6 * * *'   every 6 hours, at :23
```

`:23` is deliberate — an off-minute, and clear of the price sync at `:17`.

### Failure philosophy: a bad run must never destroy good committed output

Every registry-level check runs **before the first write**, so an abort leaves the filesystem
untouched and the previously committed pages live. The script aborts, before touching the disk, if:

- the fetch fails (WordPress down, DNS, 5xx, timeout) — retried 3× at 3 s intervals first
- the response is not the expected `{ok, count, items}` envelope
- `ok` is not true, or `count` disagrees with `items.length`
- any slug is not a safe path segment (`/^[a-z0-9][a-z0-9_-]{0,79}$/`)
- any target would break out of an HTML attribute or a JS string
- the registry came back **empty** while `q/registry.json` still lists codes
- the run would delete **more than half** the existing pages

The last two are the ones that matter. An empty or truncated registry is indistinguishable from
"every product was deleted", and the naive reaction — prune everything not in the list — would
delete the redirect page behind every code already printed on packaging. So emptiness is treated
as an error rather than as data.

To override the prune valve deliberately (you really did delete most of the catalog):

```bash
NEOKESAN_QR_FORCE=1 node scripts/sync-qr.js
```

The slug regex is also a security control, not just tidiness: a slug becomes a **directory name**,
so without it a malicious or corrupted registry response could write anywhere on disk.

### The cache-buster is load-bearing

```js
const url = REGISTRY_URL + '?cb=' + Date.now();
```

Hostinger's CDN caches unauthenticated REST GETs for up to **7 days**. A scheduled run would
otherwise read a week-old registry and silently republish stale targets. The endpoint also calls
`nocache_headers()` on its side.

### Why runs are usually no-ops

`qr-render.js` output is deliberately deterministic — no timestamps, no "generated at" comment —
and `registry.json` deliberately carries no timestamp either. An unchanged registry produces
byte-identical files, `writeFileIfChanged()` writes nothing, `git diff` is empty, and the workflow
commits nothing. A typical run logs:

```
Registry OK: 3 code(s).
3 code(s): 0 page(s) and 0 SVG(s) changed.
Already up to date.
```

---

## 10. Local development

```bash
node scripts/sync-qr.js
```

It talks to the **live** `shop.neokesan.com` registry, so no local WordPress is needed. It writes
into `q/` in the working tree — nothing is committed or pushed by the script itself.

To preview the admin panel locally, serve the repo on **port 5500** (the CORS allowlist and the
Google OAuth allowlist are both pinned to it) and sign in with an admin account.

Note that `wp-plugin/` is gitignored — it is the editable source tree, and the committed artefact
is the versioned zip at the repo root.

---

## 11. Verification performed (2026-09-16)

Against the live site, after installing plugin 0.8.0 and pushing `63ed5a7`:

| Check | Result |
|---|---|
| `GET /qr-registry` with no auth | **200**, `ok:true`, 3 items, correct targets |
| Table backfilled on install | `bloom`, `folix`, `ponic` all present |
| `node scripts/sync-qr.js` | **0 files changed** — committed pages byte-identical to what the live server regenerates |
| `neokesan.com/q/bloom/` | **200** |
| `neokesan.com/q/bloom` (no slash) | **301** → `/q/bloom/` |
| All three shipped `qr.svg` decoded with OpenCV | each recovered its exact intended URL, trailing slash included |
| Unknown slug, e.g. `/q/no-such-slug-xyz/` | **404** serving the branded `404.html`, not GitHub's default |
| `assets/qrcode.js`, `assets/qr-render.js` | **200** |
| Both repo workflows | `sync-qr.yml` and `update-prices.yml` both reported `active` by the GitHub API — which is the only available proof that the cron YAML parses, since PyYAML is not installed locally. (The API lists a third entry, `pages-build-deployment`; that is GitHub Pages' own internal workflow, not a file in this repo.) |

The OpenCV check is the decisive one. It rasterises the **shipped SVG bytes** and hands the bitmap
to a decoder that has nothing to do with the renderer that produced them — so it proves the code
is readable, not merely that it matches what we intended to draw.

> **Not yet verified — do these.**
>
> - **The repoint test.** Change `bloom`'s destination in the admin panel, run the sync, and
>   confirm the *same* `neokesan.com/q/bloom/` URL now goes somewhere else. Everything above
>   proves the plumbing; this is the one test that proves the feature.
> - **The physical print check.** Print `q/<slug>/qr.svg` at final size and scan it on the actual
>   packaging material, in dim light, with more than one phone. A code can be verifiably correct
>   and still not scan on dark green stock.

---

## 12. Troubleshooting

| Symptom | Cause |
|---|---|
| `404` on `/qr-registry` | Plugin older than 0.8.0, or not activated |
| QR table missing after install | `admin_init` does **not** fire on REST requests. The plugin hooks `rest_api_init` as well (`neokesan-account-api.php:69`), which is why the table exists even with no wp-admin visit. If it is still missing, load any wp-admin page once |
| Repointed a code, nothing changed | The redirect page is a **committed file**. It updates on the next sync (~6 h), or immediately via `workflow_dispatch` / running the script locally and pushing. The WordPress row updates instantly; the file does not |
| Sync aborts with "refusing to prune" | Working as designed — a suspiciously large deletion. Investigate, or `NEOKESAN_QR_FORCE=1` if genuine |
| Sync aborts with "came back empty" | Same guard. If the catalog really is empty, delete `q/` and re-run |
| A slug starting with `_` behaves oddly | Jekyll skips files and directories beginning with `_`. `mint_slug()` strips leading `_` and `-` so this can never be minted |
| Cron stopped running | GitHub disables scheduled workflows on repos idle for **60 days**. A manual `workflow_dispatch` restarts it. The price workflow has the same exposure |
| Both workflows fail with non-fast-forward | They share concurrency group `site-sync` to serialise. The QR workflow also `git pull --rebase --autostash` before pushing as a second line of defence |

---

## 13. Deliberately not done

- **No scan analytics.** It would need a new public unauthenticated endpoint plus a counter. The
  existing `/product-view` pattern cannot be reused: it requires login and stores into user meta,
  and anonymous scanners have no account. Can be added later without touching the redirect pages.
- **No instant publish.** That would need a write-capable GitHub token on the WordPress host.
  Since products are registered weeks before packaging ships, a ~6 h lag is immaterial.
- **No Cloudflare Worker.** Not available, and the static pages are the primary mechanism, not a
  fallback.
- **No `.nojekyll`.** The live `neoponic/` folder proves these directories deploy fine; adding it
  would change deploy behaviour for no gain.

---

## 14. Print checklist

Before any print run:

1. Admin dashboard → **QR codes** → **Download SVG** for the product.
2. Confirm the row shows the destination you expect.
3. Print at final physical size.
4. Scan with **at least two** phones, at arm's length, in dim light.
5. Scan the **printed** code on the **actual packaging material**, not on white paper.

The white plate behind the modules is what makes this work on dark green packaging — which is why
`qr-render.js` bakes it in rather than using the library's transparent-background default. Error
correction is level **H** (30% recovery), chosen for printed surfaces that get scuffed.

---

## 15. Quick reference

```
Printed link      https://neokesan.com/q/<slug>/
Redirect page     q/<slug>/index.html      (committed, generated)
Print file        q/<slug>/qr.svg          (committed, generated)
Backup            q/registry.json          (committed, generated)
Source of truth   WordPress: {prefix}neokesan_qr
Public registry   GET  /wp-json/neokesan/v1/qr-registry
Admin list        GET  /wp-json/neokesan/v1/admin/qr
Repoint           PUT  /wp-json/neokesan/v1/admin/qr/<slug>   {"target":"..."}
Sync by hand      node scripts/sync-qr.js
Sync schedule     .github/workflows/sync-qr.yml   cron '23 */6 * * *'
Force a prune     NEOKESAN_QR_FORCE=1 node scripts/sync-qr.js
```

Related: `docs/ACCOUNT-SYSTEM-PLAN.md`, `wp-plugin/neokesan-account-api/README.md`.
