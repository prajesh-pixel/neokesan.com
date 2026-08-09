<?php
/**
 * GET/POST /neokesan/v1/quiz + POST /neokesan/v1/quiz/click — quiz attempts,
 * the product recommendation computed from the answers, and buy-on-Amazon clicks.
 *
 * @package neokesan-account-api
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Quiz endpoints.
 */
class Neokesan_Quiz {

	/**
	 * Products that can be recommended, keyed by slug. The ASIN + URL are the
	 * canonical Amazon.in buy links (mirrors scripts/fetch-prices.js).
	 *
	 * @var array
	 */
	const PRODUCTS = array(
		'folix' => array(
			'name'  => 'NeoFolix X1 & X2',
			'asin'  => 'B0HBXB8TQ9',
			'url'   => 'https://www.amazon.in/dp/B0HBXB8TQ9',
			'page'  => 'neofolix.html',
		),
		'bloom' => array(
			'name'  => 'NeoBloom X1, X2 & X3',
			'asin'  => 'B0HBWZ4G26',
			'url'   => 'https://www.amazon.in/dp/B0HBWZ4G26',
			'page'  => 'neobloom.html',
		),
		'ponic' => array(
			'name'  => 'NeoPonic A & B',
			'asin'  => 'B0HBX6WPTL',
			'url'   => 'https://www.amazon.in/dp/B0HBX6WPTL',
			'page'  => 'neoponic.html',
		),
	);

	/**
	 * User-meta keys for the quiz log.
	 *
	 * @var string
	 */
	const META_ATTEMPTS = 'neokesan_quiz_attempts';
	const META_PICKS    = 'neokesan_quiz_picks';

	/**
	 * Register the quiz routes.
	 *
	 * @return void
	 */
	public static function register_routes() {
		register_rest_route(
			'neokesan/v1',
			'/quiz',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_quiz' ),
					'permission_callback' => array( 'Neokesan_Auth', 'require_login' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'submit_quiz' ),
					'permission_callback' => array( 'Neokesan_Auth', 'require_login' ),
				),
			)
		);

		register_rest_route(
			'neokesan/v1',
			'/quiz/click',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'record_click' ),
					'permission_callback' => array( 'Neokesan_Auth', 'require_login' ),
				),
			)
		);
	}

	/**
	 * GET handler — how many attempts the user has made and their current
	 * recommendation (used by the retake prompt on the site).
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function get_quiz( $request ) {
		$user_id  = get_current_user_id();
		$attempts = self::attempts( $user_id );

		return rest_ensure_response(
			array(
				'attempts_count' => count( $attempts ),
				'current'        => $attempts ? self::summary( end( $attempts ) ) : null,
			)
		);
	}

	/**
	 * POST handler — record a completed quiz attempt and compute its product
	 * recommendation server-side (the client never tells us the product).
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function submit_quiz( $request ) {
		$user_id = get_current_user_id();

		$params  = $request->get_json_params();
		$params  = is_array( $params ) ? $params : array();
		$answers = isset( $params['answers'] ) && is_array( $params['answers'] )
			? array_map( 'sanitize_text_field', array_map( 'strval', array_values( $params['answers'] ) ) )
			: array();
		$answers = array_slice( $answers, 0, 4 );

		// All four questions must be answered.
		if ( 4 !== count( $answers ) || in_array( '', $answers, true ) ) {
			return new WP_Error(
				'neokesan_quiz_incomplete',
				'Please answer all four questions.',
				array( 'status' => 400 )
			);
		}

		$recommendation = self::recommend( $answers );

		$attempts            = self::attempts( $user_id );
		$attempt_no          = count( $attempts ) + 1;
		$attempts[]          = array(
			'attempt_no' => $attempt_no,
			'answers'    => $answers,
			'title'      => $recommendation['title'],
			'products'   => $recommendation['products'],
			'saved_at'   => gmdate( 'Y-m-d\TH:i:s\Z' ),
		);
		update_user_meta( $user_id, self::META_ATTEMPTS, $attempts );

		return rest_ensure_response( self::summary( end( $attempts ) ) );
	}

	/**
	 * POST /quiz/click handler — log the product the user chose to buy on
	 * Amazon, tied to their latest attempt.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function record_click( $request ) {
		$user_id = get_current_user_id();

		$params = $request->get_json_params();
		$params = is_array( $params ) ? $params : array();
		$key    = isset( $params['key'] ) ? sanitize_key( $params['key'] ) : '';

		if ( ! isset( self::PRODUCTS[ $key ] ) ) {
			return new WP_Error(
				'neokesan_quiz_bad_product',
				'Unknown product.',
				array( 'status' => 400 )
			);
		}

		$product    = self::PRODUCTS[ $key ];
		$attempt_no = count( self::attempts( $user_id ) );

		$picks   = get_user_meta( $user_id, self::META_PICKS, true );
		$picks   = is_array( $picks ) ? $picks : array();
		$picks[] = array(
			'key'        => $key,
			'name'       => $product['name'],
			'asin'       => $product['asin'],
			'url'        => $product['url'],
			'attempt_no' => $attempt_no,
			'clicked_at' => gmdate( 'Y-m-d\TH:i:s\Z' ),
		);
		update_user_meta( $user_id, self::META_PICKS, $picks );

		return rest_ensure_response(
			array(
				'saved'       => true,
				'picks_count' => count( $picks ),
			)
		);
	}

	/**
	 * Read a user's stored quiz attempts (always an array).
	 *
	 * @param int $user_id User ID.
	 * @return array
	 */
	private static function attempts( $user_id ) {
		$attempts = get_user_meta( $user_id, self::META_ATTEMPTS, true );
		return is_array( $attempts ) ? $attempts : array();
	}

	/**
	 * Compact summary of one attempt for API responses (drops the answers log).
	 *
	 * @param array $attempt Attempt row.
	 * @return array
	 */
	private static function summary( $attempt ) {
		return array(
			'attempt_no' => (int) $attempt['attempt_no'],
			'saved_at'   => $attempt['saved_at'],
			'title'      => $attempt['title'],
			'products'   => $attempt['products'],
		);
	}

	/**
	 * Compute the product recommendation from the answer key in ref/quiz.txt.
	 *
	 * Q1 decides the product; when Q1 is "a mix of different plants", Q2 decides
	 * whether it's neoBloom alone (Small/Medium/Large) or neoBloom + neoPonic
	 * (Farm/commercial). Q3 and Q4 are recorded but don't change the result.
	 *
	 * @param string[] $answers Four chosen option labels.
	 * @return array{title:string, products:array}
	 */
	private static function recommend( $answers ) {
		$q1 = strtolower( $answers[0] );
		$q2 = strtolower( $answers[1] );

		if ( false !== strpos( $q1, 'leafy' ) ) {
			$keys = array( 'folix' );
		} elseif ( false !== strpos( $q1, 'fruiting' ) ) {
			$keys = array( 'bloom' );
		} elseif ( false !== strpos( $q1, 'flower' ) ) {
			$keys = array( 'ponic' );
		} elseif ( false !== strpos( $q1, 'mix' ) ) {
			// Mix: farm/commercial growers get the blooming system + base nutrients.
			$keys = ( false !== strpos( $q2, 'farm' ) || false !== strpos( $q2, 'commercial' ) )
				? array( 'bloom', 'ponic' )
				: array( 'bloom' );
		} else {
			$keys = array( 'bloom' ); // Fallback for an unrecognised answer.
		}

		$products = array();
		foreach ( $keys as $key ) {
			$products[] = array_merge( array( 'key' => $key ), self::PRODUCTS[ $key ] );
		}

		$names = array();
		foreach ( $products as $product ) {
			$names[] = $product['name'];
		}

		return array(
			'title'    => implode( ' + ', $names ),
			'products' => $products,
		);
	}
}
