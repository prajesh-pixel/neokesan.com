#!/usr/bin/env bash
# neoKesan Phase 3 — Google sign-in endpoint verification.
# Run from Git Bash. Quoting lives in the file, so nothing to mangle on paste.
# Every check is ONE request (double-sending burns rate-limit slots: OTP is
# 10/IP/hr and google is 30/IP/hr).
#
# Usage:
#   bash verify-google.sh                             # pre-Client-ID checks + regressions
#   bash verify-google.sh "" "your-dev-secret"        # + HS256 dev-token rejection test
#   bash verify-google.sh "" "your-dev-secret" --hammer   # + rate-limit hammer (burns 30/hr on your IP)
set -u

BASE="${1:-https://shop.neokesan.com}"
DEV_SECRET="${2:-}"
HAMMER="${3:-}"

PASS=0; FAIL=0
TMP=$(mktemp)

say()  { echo "  PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL  $1  $2"; FAIL=$((FAIL+1)); }

# One request, capture the status code into $CODE and the body into $BODY.
# Usage: req <curl-args...>   (defaults to a plain GET if no -X given)
req() {
  CODE=$(curl -s -o "$TMP" -w "%{http_code}" "$@")
  BODY=$(cat "$TMP")
}

echo "== neoKesan Account API — Phase 3 Google sign-in =="
echo "Target: $BASE"
echo

# ---------------------------------------------------------------- 1. Route registered
# Hostinger's CDN caches GET responses for 7 days, so bust the cache with a fresh
# query param (POSTs below are never cached).
echo "-- 1. Route registered --"
routes=$(curl -s "$BASE/wp-json/neokesan/v1?cb=$(date +%s)")
if echo "$routes" | grep -q 'google'; then
  say "GET /wp-json/neokesan/v1 lists /google"
else
  fail "GET /wp-json/neokesan/v1 lists /google" "(route missing — the live server is still running the old plugin)"
  echo
  echo "INSTALL FIRST (the /profile 401 you saw proves the old plugin is still active):"
  echo "  1. shop.neokesan.com/wp-admin  ->  Hostinger panel  ->  File Manager"
  echo "  2. Replace  wp-content/plugins/neokesan-account-api/  with the contents of"
  echo "     neokesan-account-api-0.3.0.zip  (same folder name)"
  echo "  3. Re-activate the plugin (Plugins -> Installed Plugins)."
  echo "  4. Re-run this script."
  exit 1
fi

# ---------------------------------------------------------------- 2. Missing token
echo "-- 2. Missing token -> 400 --"
req -X POST "$BASE/wp-json/neokesan/v1/google" -H "Content-Type: application/json" -d '{}'
if [ "$CODE" = "400" ] && echo "$BODY" | grep -q 'neokesan_google_missing_token'; then
  say "POST /google {} -> 400 neokesan_google_missing_token"
else
  fail "POST /google {} -> 400 missing_token" "HTTP $CODE: $BODY"
fi

# ---------------------------------------------------------------- 3. Config gate
echo "-- 3. Config gate (garbage token) --"
req -X POST "$BASE/wp-json/neokesan/v1/google" -H "Content-Type: application/json" -d '{"id_token":"garbage"}'
CONFIGURED=0
if [ "$CODE" = "503" ] && echo "$BODY" | grep -q 'neokesan_google_not_configured'; then
  say "POST /google garbage -> 503 neokesan_google_not_configured (no Client ID set yet)"
elif [ "$CODE" = "400" ] && echo "$BODY" | grep -q 'neokesan_google_bad_token'; then
  say "POST /google garbage -> 400 bad_token (a Client ID IS set — negatives unlocked)"
  CONFIGURED=1
else
  fail "config gate" "HTTP $CODE: $BODY"
fi

# ---------------------------------------------------------------- 4. Negative tokens
echo "-- 4. Negative tokens --"
if [ "$CONFIGURED" = "1" ]; then
  req -X POST "$BASE/wp-json/neokesan/v1/google" -H "Content-Type: application/json" -d '{"id_token":"a.b.c"}'
  if [ "$CODE" = "400" ] && echo "$BODY" | grep -q 'neokesan_google_bad_token'; then
    say "POST /google a.b.c -> 400 bad_token (malformed JWT)"
  else
    fail "POST /google a.b.c" "HTTP $CODE: $BODY"
  fi

  if [ -n "$DEV_SECRET" ]; then
    req -X POST "$BASE/wp-json/neokesan/v1/dev-token" \
      -H "Content-Type: application/json" \
      -H "X-Neokesan-Dev-Secret: $DEV_SECRET" \
      -d '{"user_id":1}'
    TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    req -X POST "$BASE/wp-json/neokesan/v1/google" -H "Content-Type: application/json" -d "{\"id_token\":\"$TOKEN\"}"
    if [ "$CODE" = "400" ] && echo "$BODY" | grep -q 'neokesan_google_bad_token'; then
      say "dev-token (HS256 JWT) -> 400 bad_token (alg check rejects it)"
    else
      fail "HS256 rejection" "HTTP $CODE: $BODY"
    fi
  else
    echo "  SKIP  HS256 dev-token rejection (pass your DEV secret as arg 2)"
  fi
else
  echo "  SKIP  (set NEOKESAN_GOOGLE_CLIENT_ID in wp-config to unlock; then re-run)"
fi

# ---------------------------------------------------------------- 5. Regressions
echo "-- 5. Regressions --"
req "$BASE/wp-json/neokesan/v1/profile?cb=$(date +%s)"
if [ "$CODE" = "401" ]; then
  say "GET /profile (no token) -> 401"
else
  fail "GET /profile (no token) -> 401" "HTTP $CODE"
fi

EMAIL="grower-$(date +%s)@example.com"
req -X POST "$BASE/wp-json/neokesan/v1/otp/send" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\"}"
if [ "$CODE" = "200" ] && echo "$BODY" | grep -q 'dev_code'; then
  say "POST /otp/send ($EMAIL) -> 200 with dev_code"
elif [ "$CODE" = "429" ]; then
  fail "POST /otp/send ($EMAIL)" "HTTP 429 — IP send quota exhausted (10/hr). Wait for the hour to roll, or run from another IP."
else
  fail "otp/send regression" "HTTP $CODE: $BODY"
fi

HEADERS=$(curl -s -D - -o /dev/null -X OPTIONS "$BASE/wp-json/neokesan/v1/google" \
  -H "Origin: https://neokesan.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type")
if echo "$HEADERS" | grep -qi 'HTTP/1.1 204' && echo "$HEADERS" | grep -qi 'Access-Control-Allow-Origin: https://neokesan.com'; then
  say "OPTIONS /google preflight -> 204 + ACAO: https://neokesan.com"
else
  fail "CORS preflight on /google" "$(echo "$HEADERS" | grep -i '^HTTP/' | head -1)"
fi

# ---------------------------------------------------------------- 6. Optional hammer
if [ "$HAMMER" = "--hammer" ]; then
  echo "-- 6. Rate limit (30/hr per IP) --"
  if [ "$CONFIGURED" = "1" ]; then
    LAST=0
    for i in $(seq 1 31); do
      LAST=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/wp-json/neokesan/v1/google" \
        -H "Content-Type: application/json" -d '{"id_token":"garbage"}')
    done
    if [ "$LAST" = "429" ]; then
      say "hammer 31x -> 429 neokesan_google_limit"
    else
      fail "rate limit" "last request was HTTP $LAST (not 429)"
    fi
    echo "  NOTE  your IP is now rate-limited for up to an hour (Google login will 429)."
  else
    echo "  SKIP  hammer needs a configured Client ID (config gate 503s before rate limit)"
  fi
fi

echo
echo "== Result: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ] || exit 1
