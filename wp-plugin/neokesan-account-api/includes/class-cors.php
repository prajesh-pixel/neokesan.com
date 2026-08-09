<?php
/**
 * Cross-origin headers for the static site (neokesan.com) calling the WP API.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles CORS on REST responses.
 */
class Neokesan_CORS {

	/**
	 * Origins allowed to call the API.
	 *
	 * Defaults to the production site plus common localhost dev ports. Override
	 * with the NEOKESAN_CORS_ORIGINS constant (comma-separated) or the
	 * `neokesan_allowed_origins` filter.
	 *
	 * @return string[]
	 */
	public static function allowed_origins() {
		$defaults = array(
			'https://neokesan.com',
			'https://www.neokesan.com',
			'http://localhost:5500',
			'http://localhost:3000',
			'http://localhost:8080',
			'http://localhost',
		);

		$origins = $defaults;

		if ( defined( 'NEOKESAN_CORS_ORIGINS' ) && NEOKESAN_CORS_ORIGINS ) {
			$origins = array_map( 'trim', explode( ',', (string) NEOKESAN_CORS_ORIGINS ) );
		}

		$origins = apply_filters( 'neokesan_allowed_origins', $origins );

		return array_filter( array_map( 'strtolower', $origins ) );
	}

	/**
	 * Serve CORS headers on REST responses, short-circuiting OPTIONS preflight.
	 *
	 * Hooked into `rest_pre_serve_request` at priority 0. Returns the original
	 * $served value untouched for disallowed origins and non-OPTIONS requests.
	 *
	 * @param bool            $served  Whether the request was already served.
	 * @param WP_REST_Response $result Response object.
	 * @param WP_REST_Request  $request Request object.
	 * @param WP_REST_Server   $server  REST server.
	 * @return bool
	 */
	public static function serve( $served, $result, $request, $server ) {
		$origin = '';

		if ( isset( $_SERVER['HTTP_ORIGIN'] ) ) {
			$origin = strtolower( trim( (string) $_SERVER['HTTP_ORIGIN'] ) );
		}

		if ( $origin && in_array( $origin, self::allowed_origins(), true ) ) {
			header( 'Access-Control-Allow-Origin: ' . $origin );
			header( 'Access-Control-Allow-Credentials: true' );
			header( 'Vary: Origin' );
		}

		if ( isset( $_SERVER['REQUEST_METHOD'] ) && 'OPTIONS' === strtoupper( (string) $_SERVER['REQUEST_METHOD'] ) ) {
			header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
			header( 'Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With' );
			header( 'Access-Control-Max-Age: 86400' );
			status_header( 204 );
			exit;
		}

		return $served;
	}
}

add_filter( 'rest_pre_serve_request', array( 'Neokesan_CORS', 'serve' ), 0, 4 );
