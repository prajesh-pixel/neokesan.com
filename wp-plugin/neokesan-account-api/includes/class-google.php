<?php
/**
 * POST /neokesan/v1/google — Google sign-in via ID token.
 *
 * The static site gets a Google ID token (Google Identity Services) and POSTs
 * it here. The server verifies the token server-side — signature, issuer,
 * audience, expiry and email verification — and only then find-or-creates the
 * user and issues a real neoKesan JWT. No Google secrets ever touch the
 * frontend.
 *
 * Verification is local-first: the RS256 signature is checked against Google's
 * public JWKS (https://www.googleapis.com/oauth2/v3/certs). The certs endpoint
 * now returns pure JWKS keys {n, e, ...} with no x5c cert chain, so the plugin
 * rebuilds the RSA public key from n/e via a hand-rolled ASN.1 SPKI DER
 * builder (x5c[0] is still accepted for legacy keys). If local verification is
 * unavailable the plugin falls back to Google's tokeninfo endpoint — a
 * "debugging" endpoint Google may throttle, so it is a fallback only, and a
 * per-IP rate limit bounds abuse.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Google sign-in endpoint.
 */
class Neokesan_Google {

	/**
	 * Google's public JWKS (cached, see CERTS_TTL).
	 *
	 * @var string
	 */
	const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

	/**
	 * tokeninfo fallback endpoint (verifies an id_token for us).
	 *
	 * @var string
	 */
	const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

	/**
	 * Transient key for the cached JWKS.
	 *
	 * @var string
	 */
	const CERTS_TRANSIENT = 'neokesan_google_certs';

	/**
	 * How long to cache the JWKS before refetching (6 hours).
	 *
	 * @var int
	 */
	const CERTS_TTL = 6 * HOUR_IN_SECONDS;

	/**
	 * Max JWKS keys cached (cache-poison defense).
	 *
	 * @var int
	 */
	const CERTS_MAX_KEYS = 25;

	/**
	 * Allowed clock skew in seconds (exp/iat leeway).
	 *
	 * @var int
	 */
	const CLOCK_SKEW = 120;

	/**
	 * Max login attempts per IP per hour.
	 *
	 * @var int
	 */
	const LIMIT_IP = 30;

	/**
	 * Upper bound on the id_token length.
	 *
	 * @var int
	 */
	const MAX_TOKEN_LEN = 16384;

	/**
	 * Register the Google route. Pre-auth, so no permission callback gate.
	 *
	 * @return void
	 */
	public static function register_routes() {
		register_rest_route(
			'neokesan/v1',
			'/google',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * POST handler — verify an id_token and issue a neoKesan JWT.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle( $request ) {
		$token = $request->get_param( 'id_token' );
		if ( ! is_string( $token ) || '' === trim( $token ) ) {
			return new WP_Error( 'neokesan_google_missing_token', 'An id_token is required.', array( 'status' => 400 ) );
		}
		$token = trim( $token );
		if ( strlen( $token ) > self::MAX_TOKEN_LEN ) {
			return new WP_Error( 'neokesan_google_bad_token', 'Token is too long.', array( 'status' => 400 ) );
		}

		// Config gate runs only when a token is presented, so the endpoint is
		// reachable (and returns a clean 503) before a Client ID is configured.
		$client_ids = self::client_ids();
		if ( empty( $client_ids ) ) {
			return new WP_Error( 'neokesan_google_not_configured', 'Google sign-in is not configured.', array( 'status' => 503 ) );
		}

		// Rate-limit every presented token (valid or not) so a forger can't
		// burn unbounded tokeninfo lookups. A real Google token is expensive to
		// mint, so this single per-IP limiter is enough.
		$ip = Neokesan_OTP::client_ip();
		if ( self::rate_limited( $ip ) ) {
			return new WP_Error( 'neokesan_google_limit', 'Too many sign-in attempts. Try again later.', array( 'status' => 429 ) );
		}

		$parsed = self::parse_token( $token );
		if ( false === $parsed ) {
			return new WP_Error( 'neokesan_google_bad_token', 'Token is not a well-formed JWT.', array( 'status' => 400 ) );
		}
		list( $header, $claims, $signing_input, $signature ) = $parsed;

		// We only ever accept RS256 ID tokens signed by Google.
		$alg = isset( $header['alg'] ) ? (string) $header['alg'] : '';
		$kid = isset( $header['kid'] ) ? (string) $header['kid'] : '';
		if ( 'RS256' !== $alg || '' === $kid ) {
			return new WP_Error( 'neokesan_google_bad_token', 'Unsupported token algorithm.', array( 'status' => 400 ) );
		}

		if ( ! self::verify_signature( $header, $signing_input, $signature ) ) {
			// Local verification failed — fall back to Google's tokeninfo.
			$claims = self::tokeninfo( $token );
			if ( false === $claims ) {
				return new WP_Error( 'neokesan_google_bad_signature', 'Could not verify the token.', array( 'status' => 400 ) );
			}
		}

		$validated = self::validate_claims( $claims, $client_ids );
		if ( is_wp_error( $validated ) ) {
			return $validated;
		}
		$email = $validated['email'];
		$sub   = $validated['sub'];

		$linked = self::find_or_create_user( $email, $sub, $claims );
		if ( is_wp_error( $linked ) ) {
			return $linked;
		}
		list( $user_id, $is_new_user ) = $linked;

		$token_out = Neokesan_JWT::issue( $user_id );
		if ( is_wp_error( $token_out ) ) {
			return $token_out;
		}

		$user = get_userdata( $user_id );
		$response = array(
			'token'       => $token_out,
			'expires_in'  => Neokesan_JWT::DEFAULT_EXPIRES_IN,
			'user_id'     => $user_id,
			'email'       => $user ? $user->user_email : $email,
			'is_new_user' => (bool) $is_new_user,
		);

		if ( self::dev_mode() ) {
			$response['dev_claims'] = array(
				'sub'   => $sub,
				'email' => $email,
				'iss'   => isset( $claims['iss'] ) ? $claims['iss'] : '',
				'aud'   => isset( $claims['aud'] ) ? $claims['aud'] : '',
			);
			$response['dev_note']   = 'DEV ONLY — never enabled in production.';
		}

		return rest_ensure_response( $response );
	}

	/**
	 * Allowed Google client IDs (audiences).
	 *
	 * Merges the optional NEOKESAN_GOOGLE_CLIENT_IDS list (comma-separated)
	 * with NEOKESAN_GOOGLE_CLIENT_ID, then the `neokesan_google_client_ids`
	 * filter. Mirrors the CORS allowlist pattern.
	 *
	 * @return string[]
	 */
	public static function client_ids() {
		$ids = array();

		if ( defined( 'NEOKESAN_GOOGLE_CLIENT_IDS' ) && NEOKESAN_GOOGLE_CLIENT_IDS ) {
			$ids = array_map( 'trim', explode( ',', (string) NEOKESAN_GOOGLE_CLIENT_IDS ) );
		}
		if ( defined( 'NEOKESAN_GOOGLE_CLIENT_ID' ) && NEOKESAN_GOOGLE_CLIENT_ID ) {
			$ids[] = (string) NEOKESAN_GOOGLE_CLIENT_ID;
		}

		$ids = apply_filters( 'neokesan_google_client_ids', $ids );
		$ids = array_map( 'trim', (array) $ids );
		$ids = array_filter( $ids );

		return array_values( array_unique( $ids ) );
	}

	/**
	 * Split a JWT into [header, payload, signing input, raw signature].
	 *
	 * @param string $token JWT string.
	 * @return array|false
	 */
	public static function parse_token( $token ) {
		if ( ! preg_match( '/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/', $token ) ) {
			return false;
		}

		$segments = explode( '.', $token );
		list( $header_enc, $payload_enc, $signature_enc ) = $segments;

		$header_raw    = Neokesan_JWT::base64url_decode( $header_enc );
		$payload_raw   = Neokesan_JWT::base64url_decode( $payload_enc );
		$signature_raw = Neokesan_JWT::base64url_decode( $signature_enc );

		if ( ! is_string( $header_raw ) || ! is_string( $payload_raw ) || ! is_string( $signature_raw ) || '' === $signature_raw ) {
			return false;
		}

		$header  = json_decode( $header_raw, true );
		$payload = json_decode( $payload_raw, true );
		if ( ! is_array( $header ) || ! is_array( $payload ) ) {
			return false;
		}

		return array( $header, $payload, $header_enc . '.' . $payload_enc, $signature_raw );
	}

	/**
	 * Verify an RS256 signature against Google's public JWKS.
	 *
	 * On a kid cache-miss the certs are refetched once (Google rotates keys)
	 * before giving up. Any local failure returns false so the caller falls
	 * back to tokeninfo.
	 *
	 * @param array  $header        JWT header (needs kid).
	 * @param string $signing_input Header + "." + payload.
	 * @param string $signature     Raw signature bytes.
	 * @return bool
	 */
	public static function verify_signature( $header, $signing_input, $signature ) {
		if ( ! function_exists( 'openssl_verify' ) ) {
			return false;
		}

		$kid = isset( $header['kid'] ) ? (string) $header['kid'] : '';
		if ( '' === $kid ) {
			return false;
		}

		$keys = self::certs();
		$pem  = self::pem_for_kid( $kid, $keys );
		if ( '' === $pem ) {
			delete_transient( self::CERTS_TRANSIENT );
			$keys = self::refresh_certs();
			$pem  = self::pem_for_kid( $kid, $keys );
		}
		if ( '' === $pem ) {
			return false;
		}

		$result = openssl_verify( $signing_input, $signature, $pem, OPENSSL_ALGO_SHA256 );
		return 1 === $result;
	}

	/**
	 * The cached JWKS, refetching on cache miss.
	 *
	 * @return array[]
	 */
	public static function certs() {
		$cached = get_transient( self::CERTS_TRANSIENT );
		if ( is_array( $cached ) && ! empty( $cached ) ) {
			return $cached;
		}
		return self::refresh_certs();
	}

	/**
	 * Fetch + sanitize + cache the JWKS. Never caches a failed/empty fetch.
	 *
	 * @return array[]
	 */
	public static function refresh_certs() {
		$raw = self::fetch_certs();
		if ( ! is_array( $raw ) || empty( $raw ) ) {
			return array();
		}
		$keys = self::sanitize_certs( $raw );
		if ( empty( $keys ) ) {
			return array();
		}
		set_transient( self::CERTS_TRANSIENT, $keys, self::CERTS_TTL );
		return $keys;
	}

	/**
	 * GET the JWKS from Google.
	 *
	 * @return array[]|false The raw "keys" array, or false on failure.
	 */
	public static function fetch_certs() {
		$response = wp_remote_get( self::CERTS_URL, array( 'timeout' => 15 ) );
		if ( is_wp_error( $response ) ) {
			return false;
		}
		$status = (int) wp_remote_retrieve_response_code( $response );
		if ( $status < 200 || $status >= 300 ) {
			return false;
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || ! isset( $data['keys'] ) || ! is_array( $data['keys'] ) ) {
			return false;
		}
		return $data['keys'];
	}

	/**
	 * Whitelist the fields we trust from the remote JWKS and cap the size
	 * (cache-poison defense: a hostile/compromised response can't smuggle in
	 * anything we don't know how to consume).
	 *
	 * Only RSA signature-verification keys are kept; alg is stored but not
	 * required (Google could stop emitting it without affecting RS256).
	 *
	 * @param array[] $raw Keys as returned by Google.
	 * @return array[]
	 */
	public static function sanitize_certs( $raw ) {
		$out = array();
		foreach ( $raw as $key ) {
			if ( count( $out ) >= self::CERTS_MAX_KEYS ) {
				break;
			}
			if ( ! is_array( $key ) ) {
				continue;
			}

			$kid = isset( $key['kid'] ) && is_string( $key['kid'] ) ? $key['kid'] : '';
			$alg = isset( $key['alg'] ) && is_string( $key['alg'] ) ? $key['alg'] : '';
			$kty = isset( $key['kty'] ) && is_string( $key['kty'] ) ? $key['kty'] : '';
			$use = isset( $key['use'] ) && is_string( $key['use'] ) ? $key['use'] : '';
			$n   = isset( $key['n'] ) && is_string( $key['n'] ) ? $key['n'] : '';
			$e   = isset( $key['e'] ) && is_string( $key['e'] ) ? $key['e'] : '';
			$x5c = isset( $key['x5c'][0] ) && is_string( $key['x5c'][0] ) ? $key['x5c'][0] : '';

			if ( 'RSA' !== $kty || 'sig' !== $use ) {
				continue;
			}
			if ( '' !== $alg && 'RS256' !== $alg ) {
				continue;
			}
			if ( '' === $kid || '' === $n || '' === $e ) {
				continue;
			}

			$out[] = array(
				'kid' => $kid,
				'n'   => $n,
				'e'   => $e,
				'x5c' => $x5c,
			);
		}
		return $out;
	}

	/**
	 * Public-key PEM for a given key id, or '' when unknown.
	 *
	 * @param string  $kid  Key id from the JWT header.
	 * @param array[] $keys Sanitized JWKS.
	 * @return string
	 */
	public static function pem_for_kid( $kid, $keys ) {
		foreach ( $keys as $key ) {
			if ( hash_equals( (string) $key['kid'], $kid ) ) {
				return self::jwk_to_pem( $key );
			}
		}
		return '';
	}

	/**
	 * Build a PEM public key from one JWKS entry.
	 *
	 * Legacy Google certs carry an x5c chain (DER certificate in entry 0);
	 * current ones are pure {n, e}, which we turn into an SPKI key by hand.
	 *
	 * @param array $key Sanitized JWKS entry.
	 * @return string PEM, or '' when the entry is unusable.
	 */
	public static function jwk_to_pem( $key ) {
		if ( ! empty( $key['x5c'] ) ) {
			$der = base64_decode( $key['x5c'], true );
			if ( is_string( $der ) && '' !== $der ) {
				return self::pem_from_der( $der );
			}
		}

		if ( ! empty( $key['n'] ) && ! empty( $key['e'] ) ) {
			$n = Neokesan_JWT::base64url_decode( $key['n'] );
			$e = Neokesan_JWT::base64url_decode( $key['e'] );
			if ( is_string( $n ) && '' !== $n && is_string( $e ) && '' !== $e ) {
				$der = self::spki_der( $n, $e );
				if ( '' !== $der ) {
					return self::pem_from_der( $der );
				}
			}
		}

		return '';
	}

	/**
	 * Wrap a DER SubjectPublicKeyInfo in PEM armour.
	 *
	 * @param string $der DER bytes.
	 * @return string
	 */
	public static function pem_from_der( $der ) {
		return "-----BEGIN PUBLIC KEY-----\n" . chunk_split( base64_encode( $der ), 64, "\n" ) . "-----END PUBLIC KEY-----\n";
	}

	/**
	 * Build the DER SubjectPublicKeyInfo for an RSA key from n/e bytes.
	 *
	 * JWKS n/e are base64url unsigned big-endian; OpenSSL's public-key parser
	 * wants a full SPKI structure. Hand-rolled ASN.1 (PHP 7.4-safe, no
	 * third-party crypto):
	 *
	 *   SPKI ::= SEQUENCE { algorithm AlgorithmIdentifier,
	 *                       subjectPublicKey BIT STRING }
	 *   AlgorithmIdentifier ::= SEQUENCE { OID rsaEncryption, NULL }
	 *   RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
	 *
	 * A DER bug here degrades to the tokeninfo fallback (availability), never
	 * to accepting a forged token.
	 *
	 * @param string $n Raw modulus bytes.
	 * @param string $e Raw exponent bytes.
	 * @return string DER bytes, or '' on invalid input.
	 */
	public static function spki_der( $n, $e ) {
		$n = ltrim( $n, "\x00" );
		$e = ltrim( $e, "\x00" );
		if ( '' === $n || '' === $e ) {
			return '';
		}

		$rsa_inner = self::der_int( $n ) . self::der_int( $e );
		$rsa       = "\x30" . self::der_len( strlen( $rsa_inner ) ) . $rsa_inner;

		// AlgorithmIdentifier: rsaEncryption OID (1.2.840.113549.1.1.1) + NULL.
		$oid       = "\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01";
		$algorithm = "\x30" . self::der_len( strlen( $oid ) + 2 ) . $oid . "\x05\x00";

		// BIT STRING with 0 unused bits wrapping the RSAPublicKey DER.
		$bitstring = "\x03" . self::der_len( strlen( $rsa ) + 1 ) . "\x00" . $rsa;

		return "\x30" . self::der_len( strlen( $algorithm ) + strlen( $bitstring ) ) . $algorithm . $bitstring;
	}

	/**
	 * ASN.1 INTEGER: tag + length + content, with a leading 0x00 when the high
	 * bit is set so the value stays positive.
	 *
	 * @param string $bytes Raw big-endian bytes.
	 * @return string
	 */
	public static function der_int( $bytes ) {
		if ( ord( $bytes[0] ) & 0x80 ) {
			$bytes = "\x00" . $bytes;
		}
		return "\x02" . self::der_len( strlen( $bytes ) ) . $bytes;
	}

	/**
	 * ASN.1 definite length encoding (short + long form).
	 *
	 * @param int $length Content length.
	 * @return string
	 */
	public static function der_len( $length ) {
		if ( $length < 128 ) {
			return chr( $length );
		}
		$bytes = '';
		$left  = $length;
		while ( $left > 0 ) {
			$bytes = chr( $left % 256 ) . $bytes;
			$left  = intdiv( $left, 256 );
		}
		return chr( 0x80 | strlen( $bytes ) ) . $bytes;
	}

	/**
	 * Fall back to Google's tokeninfo endpoint for verification.
	 *
	 * tokeninfo is a "debugging" endpoint Google may throttle, so it is used
	 * only when local signature verification fails. Returns the full claims
	 * array (email_verified is a string "true" here).
	 *
	 * @param string $token The id_token.
	 * @return array|false
	 */
	public static function tokeninfo( $token ) {
		$url      = add_query_arg( 'id_token', $token, self::TOKENINFO_URL );
		$response = wp_remote_get( $url, array( 'timeout' => 15 ) );
		if ( is_wp_error( $response ) ) {
			return false;
		}
		$status = (int) wp_remote_retrieve_response_code( $response );
		if ( $status < 200 || $status >= 300 ) {
			return false;
		}
		$claims = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $claims ) ) {
			return false;
		}
		return $claims;
	}

	/**
	 * Check every claim that makes a token acceptable, in a fixed order.
	 * Shared by the local-signature and tokeninfo paths.
	 *
	 * @param array    $claims     Decoded token claims.
	 * @param string[] $client_ids Allowed audiences.
	 * @return array|WP_Error ['email','sub'] on success, else a 400 WP_Error.
	 */
	public static function validate_claims( $claims, $client_ids ) {
		$now = time();

		if ( ! isset( $claims['exp'] ) || ! is_numeric( $claims['exp'] ) ) {
			return new WP_Error( 'neokesan_google_bad_token', 'Token is missing an expiry.', array( 'status' => 400 ) );
		}
		if ( (int) $claims['exp'] <= $now - self::CLOCK_SKEW ) {
			return new WP_Error( 'neokesan_google_expired', 'Token has expired.', array( 'status' => 400 ) );
		}
		if ( isset( $claims['iat'] ) && is_numeric( $claims['iat'] ) && (int) $claims['iat'] > $now + self::CLOCK_SKEW ) {
			return new WP_Error( 'neokesan_google_bad_token', 'Token was issued in the future.', array( 'status' => 400 ) );
		}

		$iss = isset( $claims['iss'] ) ? (string) $claims['iss'] : '';
		if ( 'https://accounts.google.com' !== $iss && 'accounts.google.com' !== $iss ) {
			return new WP_Error( 'neokesan_google_bad_issuer', 'Token was not issued by Google.', array( 'status' => 400 ) );
		}

		$aud = isset( $claims['aud'] ) ? (string) $claims['aud'] : '';
		if ( '' === $aud || ! in_array( $aud, $client_ids, true ) ) {
			return new WP_Error( 'neokesan_google_bad_audience', 'Token audience does not match this site.', array( 'status' => 400 ) );
		}

		if ( ! isset( $claims['email'] ) || ! is_string( $claims['email'] ) ) {
			return new WP_Error( 'neokesan_google_bad_token', 'Token is missing an email.', array( 'status' => 400 ) );
		}

		// tokeninfo returns email_verified as the string "true"; the local
		// payload uses a JSON boolean. Accept both (and int 1).
		$verified = isset( $claims['email_verified'] ) ? $claims['email_verified'] : false;
		if ( ! in_array( $verified, array( true, 1, '1', 'true' ), true ) ) {
			return new WP_Error( 'neokesan_google_email_unverified', 'The email address is not verified.', array( 'status' => 400 ) );
		}

		$email = Neokesan_OTP::normalize_email( $claims['email'] );
		if ( '' === $email ) {
			return new WP_Error( 'neokesan_google_bad_token', 'Token email is not valid.', array( 'status' => 400 ) );
		}

		$sub = isset( $claims['sub'] ) ? (string) $claims['sub'] : '';
		if ( '' === $sub || strlen( $sub ) > 64 ) {
			return new WP_Error( 'neokesan_google_bad_token', 'Token subject is missing.', array( 'status' => 400 ) );
		}

		return array(
			'email' => $email,
			'sub'   => $sub,
		);
	}

	/**
	 * Link an existing user or create one for a verified Google email.
	 *
	 * Returns [user_id, is_new_user]. Link order:
	 *   (a) by email — OTP-created users converge on the same account,
	 *   (b) by the neokesan_google_sub meta — covers a user who changed their
	 *       email on the OTP account and now Google-relogs with the new one,
	 *   (c) else create with profile fields from the token claims.
	 *
	 * @param string $email  Verified, normalized email.
	 * @param string $sub    Google subject identifier.
	 * @param array  $claims Token claims (given_name/family_name/name).
	 * @return array|WP_Error [int user_id, bool is_new_user] or a 500 WP_Error.
	 */
	public static function find_or_create_user( $email, $sub, $claims ) {
		// (a) Email link — never overwrite profile fields, just store the sub.
		$user_id = email_exists( $email );
		if ( $user_id ) {
			self::maybe_store_sub( (int) $user_id, $sub );
			return array( (int) $user_id, false );
		}

		// (b) Sub link — the account's email changed after an earlier login.
		$by_sub = get_users(
			array(
				'meta_key'   => 'neokesan_google_sub',
				'meta_value' => $sub,
				'number'     => 1,
				'fields'     => 'ID',
			)
		);
		if ( ! empty( $by_sub ) ) {
			$user_id = (int) $by_sub[0];
			// Google verified this email, so keep the account consistent.
			wp_update_user(
				array(
					'ID'         => $user_id,
					'user_email' => $email,
				)
			);
			return array( $user_id, false );
		}

		// (c) Create a new customer.
		$local = sanitize_user( strstr( $email, '@', true ), true );
		if ( '' === $local ) {
			$local = 'grower';
		}
		$username = $local;
		$suffix   = 0;
		while ( username_exists( $username ) ) {
			$suffix++;
			$username = $local . '_' . $suffix;
		}

		$names = self::names_from_claims( $claims );

		$user_id = wp_insert_user(
			array(
				'user_login'   => $username,
				'user_email'   => $email,
				'user_pass'    => wp_generate_password( 24, true ),
				'first_name'   => $names['first'],
				'last_name'    => $names['last'],
				'display_name' => $names['display'],
				'role'         => 'customer',
			)
		);
		if ( is_wp_error( $user_id ) ) {
			return new WP_Error( 'neokesan_google_create_failed', 'Could not create an account.', array( 'status' => 500 ) );
		}

		$user_id = (int) $user_id;
		add_user_meta( $user_id, 'neokesan_google_sub', $sub, true );

		return array( $user_id, true );
	}

	/**
	 * Store the Google subject id on a user (no-op when already present).
	 *
	 * @param int    $user_id WP user ID.
	 * @param string $sub     Google subject identifier.
	 * @return void
	 */
	public static function maybe_store_sub( $user_id, $sub ) {
		add_user_meta( $user_id, 'neokesan_google_sub', $sub, true );
	}

	/**
	 * First/last/display names from the token claims.
	 *
	 * @param array $claims Token claims.
	 * @return array ['first','last','display']
	 */
	public static function names_from_claims( $claims ) {
		$given  = isset( $claims['given_name'] ) && is_string( $claims['given_name'] ) ? sanitize_text_field( $claims['given_name'] ) : '';
		$family = isset( $claims['family_name'] ) && is_string( $claims['family_name'] ) ? sanitize_text_field( $claims['family_name'] ) : '';
		$name   = isset( $claims['name'] ) && is_string( $claims['name'] ) ? sanitize_text_field( $claims['name'] ) : '';

		$first = $given;
		$last  = $family;

		if ( '' === $first && '' !== $name ) {
			$parts = preg_split( '/\s+/', trim( $name ) );
			$parts = array_values( array_filter( $parts ) );
			if ( count( $parts ) > 1 ) {
				$first = $parts[0];
				$last  = implode( ' ', array_slice( $parts, 1 ) );
			} else {
				$first = $name;
			}
		}

		$display = trim( $first . ' ' . $last );
		if ( '' === $display && '' !== $name ) {
			$display = $name;
		}

		return array(
			'first'   => $first,
			'last'    => $last,
			'display' => $display,
		);
	}

	/**
	 * Check and increment the per-IP rate limit.
	 *
	 * @param string $ip Client IP.
	 * @return bool True when over the limit.
	 */
	public static function rate_limited( $ip ) {
		$key   = 'neokesan_google_ip_' . hash( 'sha256', $ip );
		$count = (int) get_transient( $key );
		if ( $count >= self::LIMIT_IP ) {
			return true;
		}
		set_transient( $key, $count + 1, HOUR_IN_SECONDS );
		return false;
	}

	/**
	 * Whether DEV mode is on (enables the dev_claims echo in responses).
	 *
	 * @return bool
	 */
	public static function dev_mode() {
		return defined( 'NEOKESAN_ACCOUNT_API_DEV' ) && NEOKESAN_ACCOUNT_API_DEV;
	}
}
