<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renderizar la página de gestión de stock.
 */
function lp_render_stock_page() {
	?>
	<div class="wrap lp-stock-wrap">
		<h1 class="wp-heading-inline"><?php esc_html_e( 'Stock de Productos', 'listado-pedidos' ); ?></h1>

		<div class="lp-toolbar">
			<div class="lp-toolbar-left">
				<input
					type="search"
					id="lp-stock-search"
					placeholder="<?php esc_attr_e( 'Buscar producto…', 'listado-pedidos' ); ?>"
				/>
			</div>
			<div class="lp-toolbar-right">
				<button type="button" id="lp-stock-refresh" class="button">
					<span class="dashicons dashicons-update"></span>
					<?php esc_html_e( 'Actualizar', 'listado-pedidos' ); ?>
				</button>
			</div>
		</div>

		<div id="lp-stock-loading" class="lp-state">
			<span class="spinner is-active"></span>
			<?php esc_html_e( 'Cargando productos…', 'listado-pedidos' ); ?>
		</div>

		<div id="lp-stock-empty" class="lp-state" style="display:none;">
			<?php esc_html_e( 'No se encontraron productos variables.', 'listado-pedidos' ); ?>
		</div>

		<div id="lp-stock-list"></div>
	</div>
	<?php
}
