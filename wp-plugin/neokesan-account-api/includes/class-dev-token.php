<?php
/**
 * POST /neokesan/v1/dev-token — DEV ONLY token minting for curl testing.
 *
 * This exists because there is no login flow yet (phases 2-3). It is only
 * registered when NEOKESAN_ACCOUNT_API_DEV is true, and only honours requests
 * carrying a X-Neokesan-Dev-Secret header matching NEOKESAN_DEV_SECRET.
 *
 * It deliberately does NOT use WordPress cookie auth: curl POSTs with a logged-in
 * cookie but no WP nonce get their user zeroed by rest_cookie_check_errors.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Dev token endpoint.
 */
class Neokesan_Dev_Token {

	/**
	 * Register the dev-token route when DEV mode is on.
	 *
	 * @return void
	 */
	public static function register_routes() {
		if ( ! ( defined( 'NEOKESAN_ACCOUNT_API_DEV' ) && NEOKESAN_ACCOUNT_API_DEV ) ) {
			return;
		}

		register_rest_route(
			'neokesan/v1',
			'/dev-token',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'issue' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'user_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_user_id' ),
					),
				),
			)
		);
	}

	/**
	 * Validate that a user exists for the given ID.
	 *
	 * @param int $value User ID.
	 * @return bool
	 */
	public static function validate_user_id( $value ) {
		return (bool) get_userdata( (int) $value );
	}

	/**
	 * POST handler — mint a JWT when the dev secret header matches.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function issue( $request ) {
		$secret = defined( 'NEOKESAN_DEV_SECRET' ) ? (string) NEOKESAN_DEV_SECRET : '';

		$provided = '';
		if ( isset( $_SERVER['HTTP_X_NEOKESAN_DEV_SECRET'] ) ) {
			$provided = (string) $_SERVER['HTTP_X_NEOKESAN_DEV_SECRET'];
		} elseif ( function_exists( 'getallheaders' ) ) {
			foreach ( getallheaders() as $name => $value ) {
				if ( strtolower( $name ) === 'x-neokesan-dev-secret' ) {
					$provided = (string) $value;
					break;
				}
			}
		}

		if ( ! $secret || ! hash_equals( $secret, $provided ) ) {
			return new WP_Error( 'neokesan_dev_secret_invalid', 'Invalid dev secret.', array( 'status' => 403 ) );
		}

		$user_id = (int) $request->get_param( 'user_id' );

		$token = Neokesan_JWT::issue( $user_id );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$user = get_userdata( $user_id );

		return rest_ensure_response(
			array(
				'token'      => $token,
				'expires_in' => Neokesan_JWT::DEFAULT_EXPIRES_IN,
				'user_id'    => $user_id,
				'email'      => $user ? $user->user_email : '',
				'note'       => 'DEV ONLY — never enable in production.',
			)
		);
	}
}
