<?php
/**
 * Plugin Name: Listado Pedidos
 * Plugin URI:  https://adria-lopez.com
 * Description: Panel de gestión de pedidos WooCommerce integrado en el admin de WordPress.
 * Version:     1.0.0
 * Author:      Adrià López
 * Author URI:  https://adria-lopez.com
 * License:     GPL-2.0+
 * Text Domain: listado-pedidos
 * Requires Plugins: woocommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'LP_VERSION', '1.0.0' );
define( 'LP_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'LP_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once LP_PLUGIN_DIR . 'includes/ajax-handlers.php';

/**
 * Registrar la página de administración bajo el menú de WooCommerce.
 */
add_action( 'admin_menu', function () {
	add_submenu_page(
		'woocommerce',
		__( 'Listado Pedidos', 'listado-pedidos' ),
		__( 'Listado Pedidos', 'listado-pedidos' ),
		'manage_woocommerce',
		'listado-pedidos',
		'lp_render_page'
	);
} );

/**
 * Cargar assets solo en nuestra página.
 */
add_action( 'admin_enqueue_scripts', function ( $hook ) {
	if ( 'woocommerce_page_listado-pedidos' !== $hook ) {
		return;
	}

	wp_enqueue_style(
		'lp-admin',
		LP_PLUGIN_URL . 'assets/css/admin.css',
		array(),
		LP_VERSION
	);

	wp_enqueue_script(
		'lp-admin',
		LP_PLUGIN_URL . 'assets/js/admin.js',
		array(),
		LP_VERSION,
		true
	);

	wp_localize_script( 'lp-admin', 'lpData', array(
		'ajaxUrl' => admin_url( 'admin-ajax.php' ),
		'nonce'   => wp_create_nonce( 'lp_nonce' ),
	) );
} );

/**
 * Renderizar la página del plugin.
 */
function lp_render_page() {
	?>
	<div class="wrap lp-wrap">
		<h1 class="wp-heading-inline"><?php esc_html_e( 'Listado Pedidos', 'listado-pedidos' ); ?></h1>

		<div class="lp-toolbar">
			<div class="lp-toolbar-left">
				<select id="lp-filter-status">
					<option value="pending,processing,on-hold"><?php esc_html_e( 'Pendientes', 'listado-pedidos' ); ?></option>
					<option value=""><?php esc_html_e( 'Todos los estados', 'listado-pedidos' ); ?></option>
					<option value="pending"><?php esc_html_e( 'Solo pendientes', 'listado-pedidos' ); ?></option>
					<option value="processing"><?php esc_html_e( 'Solo procesando', 'listado-pedidos' ); ?></option>
					<option value="on-hold"><?php esc_html_e( 'Solo en espera', 'listado-pedidos' ); ?></option>
					<option value="completed"><?php esc_html_e( 'Completados', 'listado-pedidos' ); ?></option>
					<option value="cancelled"><?php esc_html_e( 'Cancelados', 'listado-pedidos' ); ?></option>
				</select>

				<select id="lp-filter-orderby">
					<option value="date-desc"><?php esc_html_e( 'Fecha (más reciente)', 'listado-pedidos' ); ?></option>
					<option value="date-asc"><?php esc_html_e( 'Fecha (más antigua)', 'listado-pedidos' ); ?></option>
					<option value="ID-desc"><?php esc_html_e( 'Nº pedido (mayor)', 'listado-pedidos' ); ?></option>
					<option value="ID-asc"><?php esc_html_e( 'Nº pedido (menor)', 'listado-pedidos' ); ?></option>
				</select>

				<input type="search" id="lp-search" placeholder="<?php esc_attr_e( 'Buscar por número o cliente…', 'listado-pedidos' ); ?>" />
			</div>

			<div class="lp-toolbar-right">
				<button type="button" id="lp-btn-refresh" class="button">
					<span class="dashicons dashicons-update"></span>
					<?php esc_html_e( 'Actualizar', 'listado-pedidos' ); ?>
				</button>
			</div>
		</div>

		<div id="lp-table-wrap">
			<div id="lp-loading" class="lp-state">
				<span class="spinner is-active"></span>
				<?php esc_html_e( 'Cargando pedidos…', 'listado-pedidos' ); ?>
			</div>
			<div id="lp-error" class="lp-state lp-error" style="display:none;"></div>
			<div id="lp-empty" class="lp-state" style="display:none;">
				<?php esc_html_e( 'No hay pedidos con los filtros seleccionados.', 'listado-pedidos' ); ?>
			</div>

			<table id="lp-table" class="wp-list-table widefat fixed striped" style="display:none;">
				<thead>
					<tr>
						<th class="lp-col-toggle"></th>
						<th><?php esc_html_e( 'Nº Pedido', 'listado-pedidos' ); ?></th>
						<th><?php esc_html_e( 'Fecha', 'listado-pedidos' ); ?></th>
						<th><?php esc_html_e( 'Cliente', 'listado-pedidos' ); ?></th>
						<th><?php esc_html_e( 'Estado', 'listado-pedidos' ); ?></th>
						<th><?php esc_html_e( 'Método de pago', 'listado-pedidos' ); ?></th>
						<th><?php esc_html_e( 'Total', 'listado-pedidos' ); ?></th>
						<th class="lp-col-actions"><?php esc_html_e( 'Acciones', 'listado-pedidos' ); ?></th>
					</tr>
				</thead>
				<tbody id="lp-tbody"></tbody>
			</table>
		</div>
	</div>

	<!-- Modal de detalles del pedido -->
	<div id="lp-modal-overlay" style="display:none;">
		<div id="lp-modal">
			<div id="lp-modal-header">
				<h2 id="lp-modal-title"></h2>
				<button type="button" id="lp-modal-close" class="button-link">
					<span class="dashicons dashicons-no-alt"></span>
				</button>
			</div>
			<div id="lp-modal-body"></div>
		</div>
	</div>
	<?php
}
