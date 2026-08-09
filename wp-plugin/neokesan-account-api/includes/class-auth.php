<?php
/**
 * Bearer-token authentication for REST requests.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads a Bearer token from the request and maps it onto the current user.
 */
class Neokesan_Auth {

	/**
	 * Extract the Bearer token from the Authorization header.
	 *
	 * Handles both the Apache/PHP-fpm `HTTP_AUTHORIZATION` server var and the
	 * `getallheaders()` variant (nginx), case-insensitively.
	 *
	 * @return string|false Token string, or false when absent.
	 */
	public static function bearer_token() {
		$raw = '';

		if ( isset( $_SERVER['HTTP_AUTHORIZATION'] ) ) {
			$raw = (string) $_SERVER['HTTP_AUTHORIZATION'];
		} elseif ( isset( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
			$raw = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
		} elseif ( function_exists( 'getallheaders' ) ) {
			foreach ( getallheaders() as $name => $value ) {
				if ( strtolower( $name ) === 'authorization' ) {
					$raw = (string) $value;
					break;
				}
			}
		}

		if ( ! $raw ) {
			return false;
		}

		if ( preg_match( '/Bearer\s+(\S+)/i', $raw, $matches ) ) {
			return $matches[1];
		}

		return false;
	}

	/**
	 * Consume the Bearer token and set the current user.
	 *
	 * Hooked into `determine_current_user`. Only acts on REST requests, and
	 * never overrides an already-authenticated user.
	 *
	 * @param int|false $user Current user ID (0/false = none yet).
	 * @return int|false
	 */
	public static function determine_current_user( $user ) {
		if ( $user ) {
			return $user;
		}
		if ( ! ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return $user;
		}

		$token = self::bearer_token();
		if ( false === $token ) {
			return $user;
		}

		$user_id = Neokesan_JWT::validate( $token );
		if ( is_wp_error( $user_id ) ) {
			return $user;
		}

		return $user_id;
	}

	/**
	 * Permission callback for routes that require a signed-in user.
	 *
	 * @return bool|WP_Error True when authenticated, else a 401 WP_Error.
	 */
	public static function require_login() {
		$user_id = get_current_user_id();
		if ( $user_id ) {
			return true;
		}
		return new WP_Error(
			'neokesan_auth_required',
			'You must be signed in to access this resource.',
			array( 'status' => 401 )
		);
	}
}

add_filter( 'determine_current_user', array( 'Neokesan_Auth', 'determine_current_user' ), 20 );
