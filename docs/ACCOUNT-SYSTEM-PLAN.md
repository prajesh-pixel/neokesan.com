# neoKesan Account System — Technical Plan

> Status: **Phases 1–3 verified live; Phase B (quiz → product recommendation) code complete in 0.4.0, NOT yet deployed/tested live.** Real Google-token happy path still deferred — needs a genuine `NEOKESAN_GOOGLE_CLIENT_ID` + real Google token. Nothing pushed to GitHub until the user has tested the full flow.

A headless customer-account system for the static neoKesan site. The static frontend (`neokesan.com`, GitHub Pages) talks to WordPress/WooCommerce (`shop.neokesan.com`) over the REST API using JWT bearer tokens. WordPress user meta is the database — managed through WordPress admin, no separate DB.

---

## 1. Why JWT instead of cookies

WP session cookies are scoped to `shop.neokesan.com` and do **not** cross over to the static site. So the static site authenticates with a **JWT** obtained from our own backend. The JWT is issued and validated entirely inside our plugin (hand-rolled HS256 — no third-party dependency, avoids plugin-version incompatibility). `JWT_AUTH_SECRET_KEY` is honored as a fallback secret if defined.

## 2. Confirmed decisions

| Decision | Choice |
|---|---|
| Checkout | **Full headless checkout** — `wc/store/v1/checkout` + Razorpay Checkout JS, server-side signature verification, webhook backup. Tradeoff accepted: login is mandatory to buy. Fallback: flip checkout back to `shop.neokesan.com` at any time (cart/orders stay in WooCommerce). |
| Login method 1 | **OTP via email** (SMS later) |
| Login method 2 | **Google sign-in** (ID token verified server-side only) |
| Login UI | **Existing `#auth-modal` popup** on the homepage — no separate login page |
| Cart | **WooCommerce Store API** (`wc/store/v1/cart/*`) — same underlying `WC()->cart` the shop uses; keyed to logged-in customer ID, so the cart carries across subdomains |
| Data store | WP user meta (`neokesan_*` prefix), managed through WordPress |

## 3. Endpoints

All under `/wp-json/neokesan/v1/`, cross-origin enabled for the static site's origin.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/otp/send` | POST | none (public) | Request a 6-digit login code by email (rate-limited, anti-enumeration) |
| `/otp/verify` | POST | none (public) | Verify a code → returns a JWT |
| `/google` | POST | none (public) | Google sign-in: verify an ID token server-side → returns a JWT |
| `/profile` | GET | Bearer | Fetch current user's profile + grower fields |
| `/profile` | POST | Bearer | Update profile fields (email/names/phone/dob/language/growing setup/crops) |
| `/orders` | GET | Bearer | Current user's WooCommerce orders (no WC API keys in the client) |
| `/quiz` | GET | Bearer | Attempt count + current recommendation (retake prompt) |
| `/quiz` | POST | Bearer | Record an attempt (4 answers) + compute the recommendation server-side |
| `/quiz/click` | POST | Bearer | Log a buy-on-Amazon click for a recommended product |
| `/dev-token` | POST | `X-Neokesan-Dev-Secret` | **DEV ONLY** — mint a JWT for curl testing while there is no login flow yet |

When WooCommerce is not active, `/orders` returns `{ "woocommerce": false, "orders": [], "note": "..." }` instead of erroring.

## 4. Data model (WP user meta)

WP core fields store the identity (`user_email`, `first_name`, `last_name`, `user_pass` reserved for future password login). Everything else is user meta prefixed `neokesan_`:

| Meta key | Source (account.html) | Type / validation |
|---|---|---|
| `neokesan_phone` | `#profile-phone` | text |
| `neokesan_dob` | `#profile-age` (date input) | `YYYY-MM-DD`, strict regex + `checkdate`, blank on invalid |
| `neokesan_language` | `#profile-language` | whitelist: English, Hindi, Bengali, Marathi |
| `neokesan_growing_setup` | Garden details `<select>` | text |
| `neokesan_crops` | "What do you grow?" input | textarea |

Quiz data lives in its own meta keys (Phase B — **never** written to the garden
fields above):

| Meta key | Source | Type / validation |
|---|---|---|
| `neokesan_quiz_attempts` | `POST /quiz` `{answers:[4]}` | array of `{attempt_no, answers, title, products, saved_at}` |
| `neokesan_quiz_picks` | `POST /quiz/click` `{key}` | array of `{key, name, asin, url, attempt_no, clicked_at}` |

Future: `neokesan_garden_notes`.

## 5. Auth flows (later phases)

**OTP (email → SMS):** ✅ implemented, Phase 2
1. Client POSTs email to `/neokesan/v1/otp/send`.
2. Server find-or-creates user, generates 6-digit code, stores **hash** with expiry + rate limit.
3. Client submits code to `/neokesan/v1/otp/verify`; server validates → issues JWT.
4. Anti-enumeration: identical response whether or not the email exists.

Details (`includes/class-otp.php`):
- Code stored as `hash_hmac('sha256', $code, wp_salt('auth'))` in a 600s transient, max 5 verify attempts (429 on exhaustion).
- Send rate limits: 5/hr per email + 10/hr per IP (`HOUR_IN_SECONDS` transients), 429 `neokesan_otp_limit` — same for known/unknown emails.
- Find-or-create: username = sanitized email local part (+ `_1`/`_2` suffix if taken), random unusable password, role `customer`.
- Delivery: always attempts `wp_mail()` (never fails the request on failure); while `NEOKESAN_ACCOUNT_API_DEV` is true, echoes the code as `dev_code` in the response + `error_log` for testing.
- `/otp/verify` consumes the code, then issues a normal JWT via `Neokesan_JWT::issue()`.

**Google:** ✅ implemented, Phase 3 (backend; frontend button still a stub until Phase 4)
1. Client gets Google ID token (Google Identity Services).
2. Client POSTs token to `/neokesan/v1/google`; server verifies signature + `aud`/`iss`/`exp`/`email_verified`, then find-or-create user → issues JWT.
3. Account linking by email (and by `neokesan_google_sub` meta for email-changed relinks) — OTP and Google converge on the same user, no duplicates.

Details (`includes/class-google.php`):
- RS256 signature verified **locally** against Google's public JWKS (`https://www.googleapis.com/oauth2/v3/certs`, cached 6h). The certs endpoint returns pure JWKS `{n, e}` with **no `x5c`**, so the plugin rebuilds the RSA public key from n/e with a hand-rolled ASN.1 SPKI DER builder (`x5c[0]` still accepted for legacy keys).
- `tokeninfo` (`https://oauth2.googleapis.com/tokeninfo`) is a **fallback only** — Google may throttle it; returns `email_verified` as the string `"true"` (truthiness check covers both shapes).
- Config gate: empty client-ID allowlist → 503 `neokesan_google_not_configured` (endpoint testable before any Client ID exists).
- Rate limit: 30 per IP per hour (429 `neokesan_google_limit`), bounding the per-unverifiable-token `tokeninfo` lookups.
- find-or-create: by email → by `neokesan_google_sub` meta → create (profile fields from claims, role `customer`, sets sub meta); `wp_insert_user` failure → 500 `neokesan_google_create_failed`.
- Only `id_token` is accepted (no `token` alias). When `NEOKESAN_ACCOUNT_API_DEV`, the response echoes the verified claims as `dev_claims`.

**CORS:** allowlist (defaults include `https://neokesan.com`, `www.neokesan.com`, localhost dev ports) with `Access-Control-Allow-Credentials: true`, OPTIONS preflight short-circuited.

## 6. Build order

| Phase | Scope | Status |
|---|---|---|
| 1 | Plugin skeleton: JWT issue/validate, bearer auth, CORS, profile + orders + dev-token endpoints, README | ✅ complete + verified live |
| 2 | OTP send/verify (email, SMS later) | ✅ complete + verified live |
| 3 | Google sign-in backend | ✅ **verified live** — all no-token checks pass (route, missing_token 400, config gate, a.b.c → 400 bad_token, HS256 dev-token rejection, CORS preflight, regressions). Placeholder Client ID in wp-config. Real-token happy path deferred until a genuine Client ID exists |
| 4 | Frontend: wire `account.html` to the API (fetch/save profile, logout) | ✅ complete + verified live; browser test pending user |
| 4b (Phase B) | Garden quiz → product recommendation (`/quiz`, `/quiz/click`) | ✅ **code complete in 0.4.0 — not yet deployed/tested live** |
| 5 | Cart integration on the static site (Store API) | pending |
| 6 | Headless checkout: Razorpay + webhook | pending |
| 7 | Hardening: rate limits, audit, nonces where needed | pending |

## 7. Configuration (wp-config.php on shop.neokesan.com)

```php
// REQUIRED — JWT signing secret (long random string)
define('NEOKESAN_JWT_SECRET', 'replace-with-a-long-random-secret');

// DEV ONLY — enables the /dev-token endpoint, the OTP dev_code echo + log, and frontend test helpers
define('NEOKESAN_ACCOUNT_API_DEV', true);
// DEV ONLY — secret header value for minting a dev token
define('NEOKESAN_DEV_SECRET', 'replace-with-a-different-long-random-secret');

// Google sign-in — the OAuth 2.0 Client ID (the token's "audience"). Until this is set,
// /google returns 503 not_configured. Create one at https://console.cloud.google.com/apis/credentials
define('NEOKESAN_GOOGLE_CLIENT_ID', '1234567890-abc...apps.googleusercontent.com');
// Optional — extra comma-separated Client IDs, merged with the above
// define('NEOKESAN_GOOGLE_CLIENT_IDS', '1111-aaaa.apps.googleusercontent.com');

// Optional — override the CORS allowlist (comma-separated)
// define('NEOKESAN_CORS_ORIGINS', 'https://neokesan.com,http://localhost:5500');
```

## 8. Known gotchas

- `rest_cookie_check_errors` zeroes the current user when a logged-in cookie is present without a WP nonce — so curl-with-admin-cookie does **not** work for testing. The `/dev-token` endpoint therefore gates on a `X-Neokesan-Dev-Secret` header instead.
- PHP class constants are not allowed as default parameter values in older PHP — resolve inside the method (`$expires_in = null`).
- The third-party "JWT Authentication for WP REST API" plugin was considered and dropped: its password-based token endpoint doesn't fit a password-less OTP/Google flow, and its internal API is not stable enough to rely on.
- Google's JWKS (`oauth2/v3/certs`) returns pure `{n, e}` keys with **no `x5c`** — the plugin rebuilds the RSA key from n/e via a hand-rolled ASN.1 SPKI DER builder; a DER bug degrades to the `tokeninfo` fallback (availability), never to accepting a forged token.
- `tokeninfo` is a debugging endpoint Google may throttle — it is a **fallback only**, and the 30/hr per-IP rate limit bounds how often it can be hit with unverifiable tokens.
