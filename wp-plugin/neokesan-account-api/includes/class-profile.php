<?php
/**
 * GET/POST /neokesan/v1/profile — read and update the current user's profile.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Profile endpoint.
 */
class Neokesan_Profile {

	/**
	 * Grower profile meta keys (stored with the neokesan_ prefix).
	 *
	 * @var string[]
	 */
	const META = array( 'phone', 'dob', 'language', 'growing_setup', 'crops', 'garden_notes' );

	/**
	 * Allowed language values, mirroring the account.html select.
	 *
	 * @var string[]
	 */
	const LANGUAGES = array( 'English', 'Hindi', 'Bengali', 'Marathi' );

	/**
	 * Register the profile routes.
	 *
	 * @return void
	 */
	public static function register_routes() {
		register_rest_route(
			'neokesan/v1',
			'/profile',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_profile' ),
					'permission_callback' => array( 'Neokesan_Auth', 'require_login' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'update_profile' ),
					'permission_callback' => array( 'Neokesan_Auth', 'require_login' ),
				),
			)
		);
	}

	/**
	 * GET handler — full profile for the current user.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function get_profile( $request ) {
		$user = wp_get_current_user();

		$profile = array(
			'id'           => $user->ID,
			'email'        => $user->user_email,
			'first_name'   => $user->first_name,
			'last_name'    => $user->last_name,
		);

		foreach ( self::META as $key ) {
			$profile[ $key ] = get_user_meta( $user->ID, 'neokesan_' . $key, true );
		}

		return rest_ensure_response( $profile );
	}

	/**
	 * POST handler — update profile fields.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function update_profile( $request ) {
		$user = wp_get_current_user();

		$params   = $request->get_json_params();
		$params   = is_array( $params ) ? $params : array();
		$updates  = array();

		// Core WP user fields.
		if ( array_key_exists( 'first_name', $params ) ) {
			$updates['first_name'] = sanitize_text_field( $params['first_name'] );
		}
		if ( array_key_exists( 'last_name', $params ) ) {
			$updates['last_name'] = sanitize_text_field( $params['last_name'] );
		}
		if ( array_key_exists( 'email', $params ) ) {
			$email = sanitize_email( $params['email'] );
			if ( ! is_email( $email ) ) {
				return new WP_Error( 'neokesan_invalid_email', 'Invalid email address.', array( 'status' => 400 ) );
			}
			$existing = email_exists( $email );
			if ( $existing && absint( $existing ) !== absint( $user->ID ) ) {
				return new WP_Error( 'neokesan_email_in_use', 'That email address is already registered.', array( 'status' => 409 ) );
			}
			$updates['user_email'] = $email;
		}

		if ( $updates ) {
			$updates['ID'] = $user->ID;
			$result        = wp_update_user( $updates );
			if ( is_wp_error( $result ) ) {
				return $result;
			}
		}

		// Custom meta fields (only when present in the payload).
		$meta_map = array(
			'phone'         => 'sanitize_text_field',
			'growing_setup' => 'sanitize_text_field',
			'crops'         => 'sanitize_textarea_field',
			'garden_notes'  => 'sanitize_textarea_field',
			'dob'           => array( __CLASS__, 'sanitize_dob' ),
			'language'      => array( __CLASS__, 'sanitize_language' ),
		);

		foreach ( $meta_map as $key => $sanitizer ) {
			if ( ! array_key_exists( $key, $params ) ) {
				continue;
			}
			$value = call_user_func( $sanitizer, $params[ $key ] );
			update_user_meta( $user->ID, 'neokesan_' . $key, $value );
		}

		return rest_ensure_response( self::get_profile( $request )->get_data() );
	}

	/**
	 * Strict YYYY-MM-DD validation; empty string when invalid.
	 *
	 * @param mixed $value Raw value.
	 * @return string
	 */
	public static function sanitize_dob( $value ) {
		if ( ! is_string( $value ) ) {
			return '';
		}
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value, $m ) ) {
			return '';
		}
		list( $y, $mo, $d ) = array_map( 'intval', explode( '-', $value ) );
		if ( ! checkdate( $mo, $d, $y ) ) {
			return '';
		}
		return $value;
	}

	/**
	 * Whitelist a language; empty string when not allowed.
	 *
	 * @param mixed $value Raw value.
	 * @return string
	 */
	public static function sanitize_language( $value ) {
		if ( in_array( (string) $value, self::LANGUAGES, true ) ) {
			return (string) $value;
		}
		return '';
	}
}
