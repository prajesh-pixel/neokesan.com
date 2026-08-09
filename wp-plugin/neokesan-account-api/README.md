# neoKesan Account API (WP plugin) — Phase 4

Headless customer-account API for the neoKesan static site. Phase 1 added JWT bearer
authentication, CORS for the static site, and `/profile`, `/orders`, `/dev-token`.
Phase 2 added **OTP login** (`/otp/send`, `/otp/verify`). Phase 3 adds **Google sign-in**
(`/google`) — the ID token is verified **server-side** (signature + aud/iss/exp/email_verified)
and only then find-or-creates the user and issues the same JWTs. Phase 4 adds the
**garden quiz** (`/quiz`, `/quiz/click`) — every completed attempt is stored with all
four answers, the product recommendation is computed server-side from the answer key,
and buy-on-Amazon clicks are logged. Later phases wire up the cart and headless checkout.

Version: 0.4.0 · Requires PHP 7.4+

---

## Install

1. Copy the `neokesan-account-api` folder into `wp-content/plugins/` on
   `shop.neokesan.com`.
2. Activate **neoKesan Account API** in the WordPress admin (Plugins → Installed Plugins).
3. Add the constants below to `wp-config.php`.

### wp-config.php constants

```php
// REQUIRED — JWT signing secret. Generate a long random string, e.g.
// `php -r "echo bin2hex(random_bytes(32));"`
define('NEOKESAN_JWT_SECRET', 'replace-with-a-long-random-secret');

// DEV ONLY — enables the /dev-token endpoint used for curl testing below.
// Remove (or set false) in production.
define('NEOKESAN_ACCOUNT_API_DEV', true);
// DEV ONLY — secret value for the X-Neokesan-Dev-Secret header.
define('NEOKESAN_DEV_SECRET', 'replace-with-a-different-long-random-secret');

// Google sign-in — your Google OAuth 2.0 Client ID (the "audience").
// Create one at https://console.cloud.google.com/apis/credentials.
// Sign-in stays disabled (endpoint returns 503) until this is set.
define('NEOKESAN_GOOGLE_CLIENT_ID', '1234567890-abc...apps.googleusercontent.com');

// Optional — additional comma-separated Client IDs if you have more than one
// (e.g. a separate one per localhost port while developing). Merged with the above.
// define('NEOKESAN_GOOGLE_CLIENT_IDS', '1111-aaaa.apps.googleusercontent.com,2222-bbbb.apps.googleusercontent.com');

// Optional — comma-separated override of the allowed origins.
// Defaults: https://neokesan.com, https://www.neokesan.com, localhost dev ports.
// define('NEOKESAN_CORS_ORIGINS', 'https://neokesan.com,http://localhost:5500');
```

If `NEOKESAN_JWT_SECRET` is not set, the plugin falls back to
`JWT_AUTH_SECRET_KEY`, then `SECURE_AUTH_KEY`, then `AUTH_KEY`, then `wp_salt('auth')`.

> **DEV echoes:** while `NEOKESAN_ACCOUNT_API_DEV` is `true`, `/otp/send` echoes the
> generated code as `dev_code` in the response (and logs it) so the flow can be tested
> before real SMTP is configured, and `/google` echoes the verified token claims as
> `dev_claims`. The plugin still attempts `wp_mail()` every time. Remove the DEV
> constants before production.

## Endpoints

All routes are namespaced `/wp-json/neokesan/v1/`. Replace `your-host` with the shop.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/otp/send` | POST | none (public) | Request a 6-digit login code by email (rate-limited) |
| `/otp/verify` | POST | none (public) | Verify a code → returns a JWT |
| `/google` | POST | none (public) | Google sign-in: verify an ID token → returns a JWT |
| `/profile` | GET | Bearer token | Fetch current user's profile + grower fields |
| `/profile` | POST | Bearer token | Update profile fields |
| `/orders` | GET | Bearer token | Current user's WooCommerce orders |
| `/quiz` | GET | Bearer token | Attempt count + the user's current recommendation (retake prompt) |
| `/quiz` | POST | Bearer token | Record an attempt (4 answers) + compute the recommendation server-side |
| `/quiz/click` | POST | Bearer token | Log a buy-on-Amazon click for a recommended product |
| `/dev-token` | POST | `X-Neokesan-Dev-Secret` | **DEV ONLY** — mint a JWT for testing |

### OTP login

```jsonc
// POST /otp/send  {"email": "you@example.com"}
// 200:
{ "status": "code_sent",
  "message": "If this email is registered, a login code has been sent.",
  "expires_in": 600 }

// DEV only — NEOKESAN_ACCOUNT_API_DEV=true adds:
//   "dev_code": "482913",

// POST /otp/verify  {"email": "you@example.com", "code": "482913"}
// 200:
{ "token": "eyJ...", "expires_in": 259200, "user_id": 5, "email": "you@example.com" }
```

- The email does not need to exist: the plugin **find-or-creates** the user
  (username = email local part, role `customer`, random unusable password).
- **Anti-enumeration:** send returns the identical body whether or not the email
  exists, so a caller can't probe which addresses are registered.
- **Rate limits:** 5 send requests per email / 10 per IP per hour (429), 5 verify
  attempts per code (429).
- Codes are stored hashed, expire after 10 minutes, and are single-use.
- The returned JWT is the same bearer token used by `/profile` and `/orders`.

### Google sign-in

The static site gets a Google **ID token** (Google Identity Services) and POSTs it
here; the server verifies it and mints the same JWT.

```jsonc
// POST /google  {"id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6...eyJpc3MiOiJodHRwczovL2FjY291..."}
// 200:
{ "token": "eyJ...", "expires_in": 259200, "user_id": 7, "email": "you@gmail.com",
  "is_new_user": true }
```

- **Verification is 100% server-side** — no Google secrets ever touch the frontend.
- The RS256 signature is checked locally against Google's public JWKS
  (`https://www.googleapis.com/oauth2/v3/certs`, cached 6h). If local verification
  is unavailable the plugin falls back to Google's `tokeninfo` endpoint (fallback
  only — Google may throttle it). Only `aud`, `iss`, `exp`, `email_verified` and the
  signature being valid are accepted.
- **Account linking by email:** an OTP-created user and a Google login with the same
  email converge on the **same** account (no duplicates). A second Google login with
  the same account returns `is_new_user: false`.
- `email_verified` must be true — an unverified email is never accepted.
- `is_new_user` is `true` only when this login created the WP user just now.
- Before a Client ID is configured the endpoint returns 503 `neokesan_google_not_configured`
  (reachable, testable, but no sign-in).

### Garden quiz & product recommendation

The static site runs a 4-question quiz (`What are you growing?`, `How large is your
growing area?`, `How are you growing your plants?`, `What is your main goal or
challenge?`). Answers are full option-label strings, e.g.
`"A mix of different plants"` or `"Farm or commercial cultivation (More than 100 sq. m)"`.

```jsonc
// GET /quiz  (Bearer token) — attempt count + current recommendation.
// 200:
{ "attempts_count": 2,
  "current": { "attempt_no": 2, "saved_at": "2026-08-09T12:00:00Z",
               "title": "NeoBloom X1, X2 & X3",
               "products": [ { "key": "bloom", "name": "NeoBloom X1, X2 & X3",
                               "asin": "B0HBWZ4G26",
                               "url": "https://www.amazon.in/dp/B0HBWZ4G26",
                               "page": "neobloom.html" } ] } }

// POST /quiz  {"answers": ["...", "...", "...", "..."]}  (Bearer token)
// 200: same summary shape as "current" above.

// POST /quiz/click  {"key": "bloom"}  (Bearer token)
// 200:
{ "saved": true, "picks_count": 1 }
```

- **The recommendation is computed server-side** from the answer key in
  `ref/quiz.txt` — the client never tells the server which product it wants:
  - Q1 `Leafy` → neoFolix; Q1 `Fruiting` → neoBloom; Q1 `Flowers` → neoPonic.
  - Q1 `A mix` → neoBloom, unless Q2 is Farm/commercial → neoBloom **+** neoPonic.
  - Q3 and Q4 are recorded with the attempt but never change the result.
- **All data lives in WP user meta** (the "database"): `neokesan_quiz_attempts`
  (array of attempts — `attempt_no`, all 4 `answers`, `title`, `products`,
  `saved_at`) and `neokesan_quiz_picks` (array of clicks — `key`, `name`, `asin`,
  `url`, `attempt_no`, `clicked_at`). Nothing touches the profile's
  `growing_setup`/`crops` fields.
- `GET /quiz` with zero attempts returns `{"attempts_count":0,"current":null}` —
  the site uses this to decide whether to show the "keep / retake" prompt.
- `POST /quiz` rejects with 400 `neokesan_quiz_incomplete` unless exactly 4
  non-empty answers are sent. `POST /quiz/click` rejects with 400
  `neokesan_quiz_bad_product` for a key outside the product list.

### Profile fields

| JSON key | Notes |
|---|---|
| `first_name`, `last_name` | WP core fields |
| `email` | WP core `user_email`; must be unique (409 if taken) |
| `phone` | meta `neokesan_phone` |
| `dob` | meta `neokesan_dob`; `YYYY-MM-DD`, strict |
| `language` | meta `neokesan_language`; one of English/Hindi/Bengali/Marathi |
| `growing_setup` | meta `neokesan_growing_setup` |
| `crops` | meta `neokesan_crops` |
| `garden_notes` | meta `neokesan_garden_notes` (future use) |

## curl test steps

These work over the command line — no WordPress nonce required, because bearer
tokens bypass cookie checks.

```bash
BASE="https://your-host"

# 1. Mint a dev token for user ID 1 (the admin user).
curl -s -X POST "$BASE/wp-json/neokesan/v1/dev-token" \
  -H "Content-Type: application/json" \
  -H "X-Neokesan-Dev-Secret: replace-with-your-dev-secret" \
  -d '{"user_id":1}'

#    → {"token":"eyJ...","expires_in":259200,"user_id":1,"email":"...","note":"DEV ONLY ..."}

# 2. Read the profile with the token.
TOKEN="paste-token-here"
curl -s "$BASE/wp-json/neokesan/v1/profile" -H "Authorization: Bearer $TOKEN"

# 3. Update a few profile fields.
curl -s -X POST "$BASE/wp-json/neokesan/v1/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Test","language":"English","growing_setup":"DWC / NFT","crops":"basil, mint"}'

# 4. Read orders (returns woocommerce:false gracefully if WC is inactive).
curl -s "$BASE/wp-json/neokesan/v1/orders" -H "Authorization: Bearer $TOKEN"

# 5. OPTIONS preflight (the static site sends this before every cross-origin call).
curl -s -i -X OPTIONS "$BASE/wp-json/neokesan/v1/profile" \
  -H "Origin: https://neokesan.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type"
#    → HTTP/1.1 204 with Access-Control-Allow-Origin: https://neokesan.com etc.
```

### OTP login test (DEV mode)

```bash
# 6. Request a login code (DEV mode echoes dev_code; same 200 body for any email).
curl -s -X POST "$BASE/wp-json/neokesan/v1/otp/send" \
  -H "Content-Type: application/json" \
  -d '{"email":"grower@example.com"}'
#    → {"status":"code_sent","message":"...","expires_in":600,"dev_code":"123456",...}

# 7. Verify with a WRONG code → 400 neokesan_otp_invalid.
curl -s -X POST "$BASE/wp-json/neokesan/v1/otp/verify" \
  -H "Content-Type: application/json" \
  -d '{"email":"grower@example.com","code":"000000"}'

# 8. Verify with the dev_code → real JWT.
curl -s -X POST "$BASE/wp-json/neokesan/v1/otp/verify" \
  -H "Content-Type: application/json" \
  -d '{"email":"grower@example.com","code":"123456"}'
#    → {"token":"eyJ...","expires_in":259200,"user_id":N,"email":"grower@example.com"}

# 9. Use that token on /profile (token was a fresh find-or-create user).
TOKEN="paste-token-here"
curl -s "$BASE/wp-json/neokesan/v1/profile" -H "Authorization: Bearer $TOKEN"
```

Expected failure checks:

```bash
# No token → 401.
curl -s "$BASE/wp-json/neokesan/v1/profile"

# Wrong dev secret → 403.
curl -s -X POST "$BASE/wp-json/neokesan/v1/dev-token" \
  -H "Content-Type: application/json" \
  -H "X-Neokesan-Dev-Secret: wrong" \
  -d '{"user_id":1}'

# Missing/invalid OTP email → 400 (same for everyone).
curl -s -X POST "$BASE/wp-json/neokesan/v1/otp/send" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email"}'

# No pending code → 400 neokesan_otp_no_code.
curl -s -X POST "$BASE/wp-json/neokesan/v1/otp/verify" \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","code":"000000"}'

# Rate limit: 5+ sends on the same email in an hour → 429 neokesan_otp_limit.
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/wp-json/neokesan/v1/otp/send" \
    -H "Content-Type: application/json" -d '{"email":"grower@example.com"}'
done
#    → 200 200 200 200 200 429
```

### Quiz test

```bash
# 20. GET /quiz with no attempts → attempts_count 0, current null.
curl -s "$BASE/wp-json/neokesan/v1/quiz" -H "Authorization: Bearer $TOKEN"

# 21. POST a completed quiz (mix + commercial → NeoBloom + NeoPonic).
curl -s -X POST "$BASE/wp-json/neokesan/v1/quiz" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"answers":["A mix of different plants",
                  "Farm or commercial cultivation (More than 100 sq. m)",
                  "Hydroponics",
                  "I want faster and healthier plant growth."]}'
#    → 200 {"attempt_no":1,"saved_at":"...","title":"NeoBloom X1, X2 & X3 + NeoPonic A & B","products":[...]}

# 22. GET /quiz again → attempts_count 1, current = the saved recommendation.
curl -s "$BASE/wp-json/neokesan/v1/quiz" -H "Authorization: Bearer $TOKEN"

# 23. Log a buy-on-Amazon click for the recommended product.
curl -s -X POST "$BASE/wp-json/neokesan/v1/quiz/click" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"bloom"}'
#    → 200 {"saved":true,"picks_count":1}

# 24. Incomplete answers → 400 neokesan_quiz_incomplete.
curl -s -X POST "$BASE/wp-json/neokesan/v1/quiz" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"answers":["A mix of different plants"]}'

# 25. Unknown product key → 400 neokesan_quiz_bad_product.
curl -s -X POST "$BASE/wp-json/neokesan/v1/quiz/click" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"nope"}'

# 26. No token → 401 (same as /profile).
curl -s "$BASE/wp-json/neokesan/v1/quiz"
```

### Google sign-in test (no real token needed)

Until a real Google token is available the endpoint is still fully testable:

```bash
# 10. Missing token → 400 neokesan_google_missing_token.
curl -s -X POST "$BASE/wp-json/neokesan/v1/google" -H "Content-Type: application/json" -d '{}'

# 11. Not configured (no NEOKESAN_GOOGLE_CLIENT_ID yet) → 503.
curl -s -X POST "$BASE/wp-json/neokesan/v1/google" \
  -H "Content-Type: application/json" -d '{"id_token":"garbage"}'

# 12. With a (placeholder) Client ID set, garbage and a.b.c → 400 bad_token,
#     because the alg/kid header gate rejects them before any network call.
curl -s -X POST "$BASE/wp-json/neokesan/v1/google" \
  -H "Content-Type: application/json" -d '{"id_token":"garbage"}'
curl -s -X POST "$BASE/wp-json/neokesan/v1/google" \
  -H "Content-Type: application/json" -d '{"id_token":"a.b.c"}'

# 13. Self-contained HS256 rejection: mint a dev token (an HS256 JWT) and POST
#     it — must be 400 bad_token (we only accept RS256 ID tokens from Google).
TOKEN=$(curl -s -X POST "$BASE/wp-json/neokesan/v1/dev-token" \
  -H "Content-Type: application/json" \
  -H "X-Neokesan-Dev-Secret: replace-with-your-dev-secret" \
  -d '{"user_id":1}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST "$BASE/wp-json/neokesan/v1/google" \
  -H "Content-Type: application/json" -d "{\"id_token\":\"$TOKEN\"}"
#    → 400 neokesan_google_bad_token (alg is HS256, not RS256)

# 14. CORS preflight on the new route → 204 with Access-Control-Allow-Origin.
curl -s -i -X OPTIONS "$BASE/wp-json/neokesan/v1/google" \
  -H "Origin: https://neokesan.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type"
```

With a real Client ID + a genuine token the happy path returns a 200 with
`{token, expires_in, user_id, email, is_new_user}` exactly like `/otp/verify`.

## Troubleshooting

- **401 on dev-token with correct secret**: confirm `NEOKESAN_ACCOUNT_API_DEV` is `true`
  and the plugin is active. If the route does not exist, WordPress returns a 404.
- **`Access-Control-Allow-Origin` missing**: the origin must be in the allowlist
  exactly (scheme + host + port, no trailing slash). Check your localhost port matches.
- **PHP fatal on plugin activation**: confirm PHP ≥ 7.4 (e.g. `php -v` on the server).
- **Token works in curl but not the browser**: the browser sends a preflight first;
  confirm step 5 passes. Also ensure the secret in `wp-config.php` did not change
  after minting tokens.
- **`dev_code` missing from `/otp/send`**: confirm `NEOKESAN_ACCOUNT_API_DEV` is
  `true` and the plugin re-activated after the update (or hard-refresh — transients
  are per-site, not per-request).
- **OTP email never arrives**: `wp_mail()` needs a working SMTP setup. Until then,
  use `dev_code` from the response / the `error_log`. The API never fails a send
  request just because the mail failed.
- **429 on `/otp/send`**: you hit the 5/hr-per-email or 10/hr-per-IP limit. Wait an
  hour or use a different email/IP; this is expected anti-spam behaviour.

## Roadmap

Phase 4 (this): garden quiz + server-side product recommendation. Phase 5:
wire the frontend `account.html` quiz + cart via Store API. Phase 6: headless
checkout (Razorpay). Phase 7: hardening (remove the DEV constants before
production). See `docs/ACCOUNT-SYSTEM-PLAN.md` at the repo root for the full
plan.
