<?php
/**
 * GET /neokesan/v1/orders — current user's WooCommerce orders.
 *
 * Orders go through this logged-in-only endpoint so WooCommerce REST API keys
 * never have to live in client-side JavaScript.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Orders endpoint.
 */
class Neokesan_Orders {

	/**
	 * Register the orders route.
	 *
	 * @return void
	 */
	public static function register_routes() {
		register_rest_route(
			'neokesan/v1',
			'/orders',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'get_orders' ),
				'permission_callback' => array( 'Neokesan_Auth', 'require_login' ),
				'args'                => array(
					'limit' => array(
						'type'              => 'integer',
						'minimum'           => 1,
						'maximum'           => 100,
						'default'           => 50,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * GET handler.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function get_orders( $request ) {
		$user_id = get_current_user_id();

		// Graceful degradation when WooCommerce is not installed/active.
		if ( ! function_exists( 'wc_get_orders' ) ) {
			return rest_ensure_response(
				array(
					'woocommerce' => false,
					'orders'      => array(),
					'note'        => 'WooCommerce is not active on this site.',
				)
			);
		}

		$limit = (int) $request->get_param( 'limit' );

		$wc_orders = wc_get_orders(
			array(
				'customer' => $user_id,
				'limit'    => $limit,
				'orderby'  => 'date',
				'order'    => 'DESC',
			)
		);

		$orders = array();
		foreach ( $wc_orders as $order ) {
			$items = array();
			foreach ( $order->get_items() as $item ) {
				$items[] = array(
					'name'     => $item->get_name(),
					'quantity' => $item->get_quantity(),
					'total'    => (float) $item->get_total(),
				);
			}

			$orders[] = array(
				'id'                  => $order->get_id(),
				'number'              => $order->get_order_number(),
				'status'              => $order->get_status(),
				'status_label'        => wc_get_order_status_name( $order->get_status() ),
				'date_created'        => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i:s' ) : '',
				'total'               => (float) $order->get_total(),
				'currency'            => $order->get_currency(),
				'payment_method_title' => $order->get_payment_method_title(),
				'items'               => $items,
			);
		}

		return rest_ensure_response(
			array(
				'woocommerce' => true,
				'orders'      => $orders,
			)
		);
	}
}
