<?php
/**
 * POST /neokesan/v1/otp/send + /otp/verify — passwordless email login.
 *
 * The user enters an email, receives a 6-digit code, and verifies it to get a
 * real JWT (the same bearer flow /profile and /orders already use). Codes are
 * stored hashed with a 10-minute expiry, send + verify are rate-limited, and
 * responses are identical whether or not the email exists (anti-enumeration).
 *
 * When NEOKESAN_ACCOUNT_API_DEV is true the code is also echoed in the
 * response (dev_code) and logged, mirroring the dev-token DEV-ONLY pattern.
 * Real email delivery goes through wp_mail() and never fails the request.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * OTP login endpoints.
 */
class Neokesan_OTP {

	/**
	 * Code lifetime in seconds (10 minutes).
	 *
	 * @var int
	 */
	const CODE_TTL = 600;

	/**
	 * Max verify attempts per code before it is invalidated.
	 *
	 * @var int
	 */
	const MAX_ATTEMPTS = 5;

	/**
	 * Max send requests per email per hour.
	 *
	 * @var int
	 */
	const SEND_LIMIT_EMAIL = 5;

	/**
	 * Max send requests per IP per hour.
	 *
	 * @var int
	 */
	const SEND_LIMIT_IP = 10;

	/**
	 * Register the OTP routes. Pre-auth, so no permission callback gate.
	 *
	 * @return void
	 */
	public static function register_routes() {
		register_rest_route(
			'neokesan/v1',
			'/otp/send',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'send' ),
				'permission_callback' => '__return_true',
			)
		);
		register_rest_route(
			'neokesan/v1',
			'/otp/verify',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'verify' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * POST handler — generate, store and (attempt to) send a login code.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function send( $request ) {
		$email = self::normalize_email( $request->get_param( 'email' ) );
		if ( '' === $email ) {
			return new WP_Error( 'neokesan_invalid_email', 'Enter a valid email address.', array( 'status' => 400 ) );
		}

		// Rate-limit before doing any work; over the limit is the same for
		// known and unknown emails, so it never reveals whether one exists.
		$ip = self::client_ip();
		if ( self::rate_limited( $email, $ip ) ) {
			return new WP_Error( 'neokesan_otp_limit', 'Too many code requests. Try again later.', array( 'status' => 429 ) );
		}

		$user_id = self::find_or_create_user( $email );
		if ( ! $user_id ) {
			return new WP_Error( 'neokesan_otp_create_failed', 'Could not create an account.', array( 'status' => 500 ) );
		}

		// Store only the hash of the code; the plain value is never persisted.
		$code   = str_pad( (string) wp_rand( 0, 999999 ), 6, '0', STR_PAD_LEFT );
		$stored = array(
			'hash'     => hash_hmac( 'sha256', $code, wp_salt( 'auth' ) ),
			'user_id'  => $user_id,
			'attempts' => 0,
		);
		set_transient( self::code_key( $email ), $stored, self::CODE_TTL );

		$sent = self::send_email( $email, $code );

		$response = array(
			'status'     => 'code_sent',
			'message'    => 'If this email is registered, a login code has been sent.',
			'expires_in' => self::CODE_TTL,
		);

		if ( self::dev_mode() ) {
			error_log( 'neoKesan OTP for ' . $email . ': ' . $code );
			$response['dev_code'] = $code;
			$response['dev_note'] = 'DEV ONLY — never enabled in production.';
		}

		if ( ! $sent ) {
			error_log( 'neoKesan OTP: wp_mail failed for ' . $email );
		}

		return rest_ensure_response( $response );
	}

	/**
	 * POST handler — validate a code and issue a JWT.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function verify( $request ) {
		$email = self::normalize_email( $request->get_param( 'email' ) );
		$code  = trim( (string) $request->get_param( 'code' ) );

		if ( '' === $email || '' === $code ) {
			return new WP_Error( 'neokesan_otp_missing', 'Email and code are required.', array( 'status' => 400 ) );
		}
		if ( ! preg_match( '/^\d{6}$/', $code ) ) {
			return new WP_Error( 'neokesan_otp_invalid', 'That code is not valid.', array( 'status' => 400 ) );
		}

		$stored = get_transient( self::code_key( $email ) );
		if ( ! is_array( $stored ) || empty( $stored['hash'] ) ) {
			return new WP_Error( 'neokesan_otp_no_code', 'No login code is pending for this email.', array( 'status' => 400 ) );
		}

		if ( (int) $stored['attempts'] >= self::MAX_ATTEMPTS ) {
			delete_transient( self::code_key( $email ) );
			return new WP_Error( 'neokesan_otp_too_many_attempts', 'Too many attempts. Request a new code.', array( 'status' => 429 ) );
		}

		$valid = hash_equals( (string) $stored['hash'], hash_hmac( 'sha256', $code, wp_salt( 'auth' ) ) );
		if ( ! $valid ) {
			$stored['attempts'] = (int) $stored['attempts'] + 1;
			set_transient( self::code_key( $email ), $stored, self::CODE_TTL );
			return new WP_Error( 'neokesan_otp_invalid', 'That code is not valid.', array( 'status' => 400 ) );
		}

		// Valid code — consume it, then issue a real token.
		delete_transient( self::code_key( $email ) );

		$user_id = absint( $stored['user_id'] );
		$user    = get_userdata( $user_id );
		if ( ! $user ) {
			return new WP_Error( 'neokesan_otp_no_user', 'No account matches this code.', array( 'status' => 400 ) );
		}

		$token = Neokesan_JWT::issue( $user_id );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		return rest_ensure_response(
			array(
				'token'      => $token,
				'expires_in' => Neokesan_JWT::DEFAULT_EXPIRES_IN,
				'user_id'    => $user_id,
				'email'      => $user->user_email,
			)
		);
	}

	/**
	 * Normalize an email address; empty string when invalid.
	 *
	 * @param mixed $value Raw value.
	 * @return string
	 */
	public static function normalize_email( $value ) {
		if ( ! is_string( $value ) ) {
			return '';
		}
		$email = sanitize_email( $value );
		if ( ! is_email( $email ) ) {
			return '';
		}
		return strtolower( $email );
	}

	/**
	 * Find a user by email or create one (passwordless self-registration).
	 *
	 * @param string $email Normalized email.
	 * @return int User ID, or 0 on failure.
	 */
	public static function find_or_create_user( $email ) {
		$existing = email_exists( $email );
		if ( $existing ) {
			return (int) $existing;
		}

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

		$user_id = wp_insert_user(
			array(
				'user_login'   => $username,
				'user_email'   => $email,
				'user_pass'    => wp_generate_password( 24, true ),
				'display_name' => $local,
				'role'         => 'customer',
			)
		);

		return is_wp_error( $user_id ) ? 0 : (int) $user_id;
	}

	/**
	 * Check and increment the per-email / per-IP send rate limits.
	 *
	 * The per-IP count is best-effort (the site sits behind a CDN, so the
	 * forwarded IP is used); the per-email and per-code attempt limits are the
	 * primary defences.
	 *
	 * @param string $email Normalized email.
	 * @param string $ip    Client IP.
	 * @return bool True when over the limit.
	 */
	public static function rate_limited( $email, $ip ) {
		$email_key = 'neokesan_otp_send_' . hash( 'sha256', $email );
		$ip_key    = 'neokesan_otp_ip_' . hash( 'sha256', $ip );

		$email_count = (int) get_transient( $email_key );
		if ( $email_count >= self::SEND_LIMIT_EMAIL ) {
			return true;
		}
		$ip_count = (int) get_transient( $ip_key );
		if ( $ip_count >= self::SEND_LIMIT_IP ) {
			return true;
		}

		// Increment only when this request is allowed to proceed.
		set_transient( $email_key, $email_count + 1, HOUR_IN_SECONDS );
		set_transient( $ip_key, $ip_count + 1, HOUR_IN_SECONDS );
		return false;
	}

	/**
	 * Transient key for a pending code for an email.
	 *
	 * @param string $email Normalized email.
	 * @return string
	 */
	public static function code_key( $email ) {
		return 'neokesan_otp_code_' . hash( 'sha256', $email );
	}

	/**
	 * Attempt real email delivery via wp_mail(); returns whether it succeeded.
	 *
	 * @param string $email Recipient.
	 * @param string $code  6-digit code.
	 * @return bool
	 */
	public static function send_email( $email, $code ) {
		$subject = apply_filters(
			'neokesan_otp_subject',
			'Your neoKesan login code'
		);
		$message = apply_filters(
			'neokesan_otp_message',
			'Your neoKesan login code is ' . $code . ".\n\nIt expires in 10 minutes.\n\nIf you didn't request this, ignore this email."
		);

		return wp_mail( $email, $subject, $message );
	}

	/**
	 * Client IP, using the CDN-forwarded value when present (right-most entry,
	 * which the proxy appended and an attacker cannot spoof from the client).
	 *
	 * @return string
	 */
	public static function client_ip() {
		$ip = '';
		if ( isset( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
			$parts = explode( ',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'] );
			$ip    = trim( (string) end( $parts ) );
		}
		if ( '' === $ip && isset( $_SERVER['REMOTE_ADDR'] ) ) {
			$ip = (string) $_SERVER['REMOTE_ADDR'];
		}
		return $ip ? $ip : '0.0.0.0';
	}

	/**
	 * Whether DEV mode is on (enables the code echo in responses).
	 *
	 * @return bool
	 */
	public static function dev_mode() {
		return defined( 'NEOKESAN_ACCOUNT_API_DEV' ) && NEOKESAN_ACCOUNT_API_DEV;
	}
}
