<?php
/**
 * Plugin Name:       neoKesan Account API
 * Description:       Headless customer-account API for the neoKesan static site. JWT bearer auth, OTP + Google login, profile + orders endpoints, CORS for neokesan.com.
 * Version:           0.4.0
 * Requires PHP:      7.4
 * Author:            neoKesan
 * Text Domain:       neokesan-account-api
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'NEOKESAN_ACCOUNT_API_VERSION', '0.4.0' );
define( 'NEOKESAN_ACCOUNT_API_DIR', plugin_dir_path( __FILE__ ) );

require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-jwt.php';
require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-auth.php';
require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-cors.php';
require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-otp.php';
require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-google.php';
require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-profile.php';
require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-orders.php';
require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-dev-token.php';
require_once NEOKESAN_ACCOUNT_API_DIR . 'includes/class-quiz.php';

/**
 * Register all REST routes for the plugin.
 *
 * @return void
 */
function neokesan_register_routes() {
	Neokesan_Profile::register_routes();
	Neokesan_Orders::register_routes();
	Neokesan_OTP::register_routes();
	Neokesan_Google::register_routes();
	Neokesan_Dev_Token::register_routes();
	Neokesan_Quiz::register_routes();
}
add_action( 'rest_api_init', 'neokesan_register_routes' );
