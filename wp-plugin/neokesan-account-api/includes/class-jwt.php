<?php
/**
 * Hand-rolled HS256 JSON Web Tokens — issue and validate.
 *
 * Self-contained on purpose: no third-party library, so no dependency or
 * PHP/WP version drift. The signing secret is a WP config constant.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * JWT issue/validation.
 */
class Neokesan_JWT {

	/**
	 * Default token lifetime in seconds (72 hours).
	 *
	 * @var int
	 */
	const DEFAULT_EXPIRES_IN = 259200;

	/**
	 * Resolve the signing secret.
	 *
	 * Priority: NEOKESAN_JWT_SECRET > JWT_AUTH_SECRET_KEY > SECURE_AUTH_KEY > AUTH_KEY > wp_salt('auth').
	 *
	 * @return string
	 */
	public static function secret() {
		if ( defined( 'NEOKESAN_JWT_SECRET' ) && NEOKESAN_JWT_SECRET ) {
			return NEOKESAN_JWT_SECRET;
		}
		if ( defined( 'JWT_AUTH_SECRET_KEY' ) && JWT_AUTH_SECRET_KEY ) {
			return JWT_AUTH_SECRET_KEY;
		}
		if ( defined( 'SECURE_AUTH_KEY' ) && SECURE_AUTH_KEY ) {
			return SECURE_AUTH_KEY;
		}
		if ( defined( 'AUTH_KEY' ) && AUTH_KEY ) {
			return AUTH_KEY;
		}
		return wp_salt( 'auth' );
	}

	/**
	 * Base64url encode (URL-safe, unpadded).
	 *
	 * @param string $data Raw bytes.
	 * @return string
	 */
	public static function base64url_encode( $data ) {
		return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
	}

	/**
	 * Base64url decode.
	 *
	 * @param string $data URL-safe encoded string.
	 * @return string|false
	 */
	public static function base64url_decode( $data ) {
		$remainder = strlen( $data ) % 4;
		if ( $remainder ) {
			$data .= str_repeat( '=', 4 - $remainder );
		}
		return base64_decode( strtr( $data, '-_', '+/' ), true );
	}

	/**
	 * Issue a JWT for a user.
	 *
	 * @param int|null $user_id    User ID.
	 * @param int|null $expires_in Lifetime in seconds. Null resolves to the default.
	 * @return string|WP_Error Token string on success, WP_Error on invalid user.
	 */
	public static function issue( $user_id, $expires_in = null ) {
		$user_id = absint( $user_id );
		if ( ! get_userdata( $user_id ) ) {
			return new WP_Error( 'neokesan_invalid_user', 'User does not exist.', array( 'status' => 400 ) );
		}

		if ( null === $expires_in ) {
			$expires_in = self::DEFAULT_EXPIRES_IN;
		}
		$expires_in = max( 60, absint( $expires_in ) );

		$now = time();
		$payload = array(
			'iss' => home_url(),
			'iat' => $now,
			'nbf' => $now,
			'exp' => $now + $expires_in,
			'data' => array(
				'user' => array(
					'id' => $user_id,
				),
			),
		);

		$header = array(
			'alg' => 'HS256',
			'typ' => 'JWT',
		);

		$segments = array(
			self::base64url_encode( wp_json_encode( $header ) ),
			self::base64url_encode( wp_json_encode( $payload ) ),
		);

		$signature = hash_hmac( 'sha256', implode( '.', $segments ), self::secret(), true );
		$segments[] = self::base64url_encode( $signature );

		return implode( '.', $segments );
	}

	/**
	 * Validate a token and return the authenticated user ID.
	 *
	 * @param string $token JWT string.
	 * @return int|WP_Error User ID on success, WP_Error (status 401) on any failure.
	 */
	public static function validate( $token ) {
		if ( ! is_string( $token ) || '' === $token ) {
			return new WP_Error( 'neokesan_missing_token', 'No token provided.', array( 'status' => 401 ) );
		}

		$parts = explode( '.', $token );
		if ( 3 !== count( $parts ) ) {
			return new WP_Error( 'neokesan_bad_token', 'Malformed token.', array( 'status' => 401 ) );
		}

		list( $header_enc, $payload_enc, $signature_enc ) = $parts;

		// Verify signature before trusting anything else.
		$expected = hash_hmac( 'sha256', $header_enc . '.' . $payload_enc, self::secret(), true );
		$actual   = self::base64url_decode( $signature_enc );
		if ( ! is_string( $actual ) || ! hash_equals( $expected, $actual ) ) {
			return new WP_Error( 'neokesan_bad_signature', 'Invalid token signature.', array( 'status' => 401 ) );
		}

		$payload = json_decode( base64_decode( $payload_enc, true ), true );
		if ( ! is_array( $payload ) ) {
			return new WP_Error( 'neokesan_bad_payload', 'Invalid token payload.', array( 'status' => 401 ) );
		}

		$now = time();

		if ( isset( $payload['exp'] ) && (int) $payload['exp'] <= $now ) {
			return new WP_Error( 'neokesan_token_expired', 'Token has expired.', array( 'status' => 401 ) );
		}
		if ( isset( $payload['nbf'] ) && (int) $payload['nbf'] > $now ) {
			return new WP_Error( 'neokesan_token_not_active', 'Token is not active yet.', array( 'status' => 401 ) );
		}
		if ( isset( $payload['iat'] ) && (int) $payload['iat'] > $now + 60 ) {
			return new WP_Error( 'neokesan_token_issued_in_future', 'Token issue time is in the future.', array( 'status' => 401 ) );
		}

		$user_id = isset( $payload['data']['user']['id'] ) ? absint( $payload['data']['user']['id'] ) : 0;
		if ( ! $user_id || ! get_userdata( $user_id ) ) {
			return new WP_Error( 'neokesan_user_not_found', 'Token user does not exist.', array( 'status' => 401 ) );
		}

		return $user_id;
	}
}
