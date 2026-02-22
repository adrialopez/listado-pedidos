<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Obtener pedidos via AJAX.
 */
add_action( 'wp_ajax_lp_get_orders', 'lp_ajax_get_orders' );
function lp_ajax_get_orders() {
	check_ajax_referer( 'lp_nonce', 'nonce' );

	if ( ! current_user_can( 'manage_woocommerce' ) ) {
		wp_send_json_error( array( 'message' => 'Sin permisos' ), 403 );
	}

	$status_raw = isset( $_GET['status'] ) ? sanitize_text_field( wp_unslash( $_GET['status'] ) ) : 'pending,processing,on-hold';
	$search     = isset( $_GET['search'] ) ? sanitize_text_field( wp_unslash( $_GET['search'] ) ) : '';
	$orderby    = isset( $_GET['orderby'] ) ? sanitize_text_field( wp_unslash( $_GET['orderby'] ) ) : 'date';
	$order      = isset( $_GET['order'] ) ? sanitize_text_field( wp_unslash( $_GET['order'] ) ) : 'DESC';
	$per_page   = isset( $_GET['per_page'] ) ? absint( $_GET['per_page'] ) : 50;

	// Normalizar order
	$order = strtoupper( $order ) === 'ASC' ? 'ASC' : 'DESC';

	// Convertir status separados por coma en array
	$statuses = array();
	if ( $status_raw !== '' ) {
		foreach ( explode( ',', $status_raw ) as $s ) {
			$s = trim( $s );
			// wc_get_orders espera "wc-pending", "wc-processing", etc. o solo "pending"
			if ( $s !== '' ) {
				$statuses[] = $s;
			}
		}
	}

	$args = array(
		'limit'   => $per_page,
		'orderby' => $orderby,
		'order'   => $order,
		'return'  => 'objects',
	);

	if ( ! empty( $statuses ) ) {
		$args['status'] = $statuses;
	}

	if ( $search !== '' ) {
		$args['search'] = $search;
	}

	$wc_orders = wc_get_orders( $args );

	$orders = array();
	foreach ( $wc_orders as $order_obj ) {
		$orders[] = lp_format_order( $order_obj );
	}

	wp_send_json_success( array(
		'orders' => $orders,
		'total'  => count( $orders ),
	) );
}

/**
 * Actualizar estado de un pedido via AJAX.
 */
add_action( 'wp_ajax_lp_update_order', 'lp_ajax_update_order' );
function lp_ajax_update_order() {
	check_ajax_referer( 'lp_nonce', 'nonce' );

	if ( ! current_user_can( 'manage_woocommerce' ) ) {
		wp_send_json_error( array( 'message' => 'Sin permisos' ), 403 );
	}

	$order_id  = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
	$new_status = isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : '';

	if ( ! $order_id || ! $new_status ) {
		wp_send_json_error( array( 'message' => 'Datos incompletos' ), 400 );
	}

	$order_obj = wc_get_order( $order_id );
	if ( ! $order_obj ) {
		wp_send_json_error( array( 'message' => 'Pedido no encontrado' ), 404 );
	}

	$order_obj->update_status( $new_status, __( 'Estado actualizado desde Listado Pedidos.', 'listado-pedidos' ), true );

	wp_send_json_success( array(
		'order' => lp_format_order( wc_get_order( $order_id ) ),
	) );
}

/**
 * Formatear un objeto WC_Order en un array serializable.
 */
function lp_format_order( WC_Order $o ) {
	$billing  = $o->get_address( 'billing' );
	$shipping = $o->get_address( 'shipping' );

	$line_items = array();
	foreach ( $o->get_items() as $item ) {
		/** @var WC_Order_Item_Product $item */
		$meta = array();
		foreach ( $item->get_formatted_meta_data( '_', true ) as $meta_id => $meta_obj ) {
			$key = wp_strip_all_tags( $meta_obj->display_key );
			$val = wp_strip_all_tags( $meta_obj->display_value );
			if ( $key !== '' ) {
				$meta[] = array( 'key' => $key, 'value' => $val );
			}
		}

		$line_items[] = array(
			'id'        => $item->get_id(),
			'name'      => $item->get_name(),
			'quantity'  => $item->get_quantity(),
			'sku'       => $item->get_product() ? $item->get_product()->get_sku() : '',
			'price'     => (float) ( $item->get_total() / max( 1, $item->get_quantity() ) ),
			'subtotal'  => (float) $item->get_total(),
			'meta_data' => $meta,
		);
	}

	return array(
		'id'                   => $o->get_id(),
		'number'               => $o->get_order_number(),
		'status'               => $o->get_status(),
		'date_created'         => $o->get_date_created() ? $o->get_date_created()->date( 'c' ) : '',
		'total'                => $o->get_total(),
		'currency_symbol'      => get_woocommerce_currency_symbol( $o->get_currency() ),
		'payment_method_title' => $o->get_payment_method_title(),
		'transaction_id'       => $o->get_transaction_id(),
		'customer_note'        => $o->get_customer_note(),
		'billing'              => $billing,
		'shipping'             => $shipping,
		'line_items'           => $line_items,
	);
}
