/* globals lpData */
( function () {
	'use strict';

	/* ---- Referencias al DOM ---- */
	const filterStatus  = document.getElementById( 'lp-filter-status' );
	const filterOrderBy = document.getElementById( 'lp-filter-orderby' );
	const searchInput   = document.getElementById( 'lp-search' );
	const btnRefresh    = document.getElementById( 'lp-btn-refresh' );

	const elLoading = document.getElementById( 'lp-loading' );
	const elError   = document.getElementById( 'lp-error' );
	const elEmpty   = document.getElementById( 'lp-empty' );
	const elTable   = document.getElementById( 'lp-table' );
	const tbody     = document.getElementById( 'lp-tbody' );

	const modalOverlay = document.getElementById( 'lp-modal-overlay' );
	const modalTitle   = document.getElementById( 'lp-modal-title' );
	const modalBody    = document.getElementById( 'lp-modal-body' );
	const modalClose   = document.getElementById( 'lp-modal-close' );

	/* ---- Estado ---- */
	let expandedRows = {};
	let searchTimer  = null;

	/* ---- Traducciones inline (estado) ---- */
	const STATUS_LABELS = {
		pending:    'Pendiente',
		processing: 'Procesando',
		'on-hold':  'En espera',
		completed:  'Completado',
		cancelled:  'Cancelado',
		refunded:   'Reembolsado',
		failed:     'Fallido',
	};

	/* =========================================================
	   Carga de pedidos
	   ========================================================= */

	function fetchOrders() {
		const orderByVal = filterOrderBy.value;           // e.g. "date-desc"
		const parts      = orderByVal.split( '-' );
		const orderby    = parts[0];                      // "date" / "ID"
		const order      = parts[1] === 'asc' ? 'asc' : 'desc';

		const params = new URLSearchParams( {
			action:  'lp_get_orders',
			nonce:   lpData.nonce,
			status:  filterStatus.value,
			orderby: orderby,
			order:   order,
			search:  searchInput.value.trim(),
		} );

		showState( 'loading' );

		fetch( lpData.ajaxUrl + '?' + params.toString(), { method: 'GET' } )
			.then( function ( res ) {
				if ( ! res.ok ) {
					throw new Error( 'HTTP ' + res.status );
				}
				return res.json();
			} )
			.then( function ( data ) {
				if ( ! data.success ) {
					throw new Error( data.data && data.data.message ? data.data.message : 'Error desconocido' );
				}
				renderOrders( data.data.orders );
			} )
			.catch( function ( err ) {
				showState( 'error', 'No se pudieron cargar los pedidos: ' + err.message );
			} );
	}

	/* =========================================================
	   Actualizar estado de un pedido
	   ========================================================= */

	function updateOrderStatus( orderId, newStatus, btnEl ) {
		if ( btnEl ) {
			btnEl.disabled = true;
		}

		const body = new URLSearchParams( {
			action:   'lp_update_order',
			nonce:    lpData.nonce,
			order_id: orderId,
			status:   newStatus,
		} );

		fetch( lpData.ajaxUrl, { method: 'POST', body: body } )
			.then( function ( res ) { return res.json(); } )
			.then( function ( data ) {
				if ( ! data.success ) {
					throw new Error( data.data && data.data.message ? data.data.message : 'Error' );
				}
				fetchOrders();
				closeModal();
			} )
			.catch( function ( err ) {
				alert( 'No se pudo actualizar el pedido: ' + err.message );
				if ( btnEl ) {
					btnEl.disabled = false;
				}
			} );
	}

	/* =========================================================
	   Renderizado de la tabla
	   ========================================================= */

	function renderOrders( orders ) {
		if ( ! orders || orders.length === 0 ) {
			showState( 'empty' );
			return;
		}

		tbody.innerHTML = '';
		expandedRows    = {};

		orders.forEach( function ( order ) {
			tbody.appendChild( buildMainRow( order ) );
			tbody.appendChild( buildExpandedRow( order ) );
		} );

		showState( 'table' );
	}

	function buildMainRow( order ) {
		const tr = document.createElement( 'tr' );
		tr.dataset.orderId = order.id;

		const customer = trim( ( order.billing.first_name || '' ) + ' ' + ( order.billing.last_name || '' ) );

		tr.innerHTML =
			'<td class="lp-col-toggle">' +
				'<button type="button" class="lp-row-toggle" title="Ver productos" data-id="' + order.id + '">' +
					'<span class="dashicons dashicons-arrow-down-alt2"></span>' +
				'</button>' +
			'</td>' +
			'<td><strong>#' + escHtml( order.number || order.id ) + '</strong></td>' +
			'<td>' + escHtml( formatDate( order.date_created ) ) + '</td>' +
			'<td>' + escHtml( customer ) + '</td>' +
			'<td>' + buildBadge( order.status ) + '</td>' +
			'<td>' + escHtml( order.payment_method_title || '—' ) + '</td>' +
			'<td>' + escHtml( order.currency_symbol ) + escHtml( order.total ) + '</td>' +
			'<td class="lp-col-actions">' +
				'<div class="lp-row-actions">' +
					'<button type="button" class="lp-action-btn lp-btn-view" data-id="' + order.id + '" title="Ver detalles">' +
						'<span class="dashicons dashicons-visibility"></span>' +
					'</button>' +
					'<button type="button" class="lp-action-btn lp-btn-complete" data-id="' + order.id + '" title="Marcar como completado"' +
						( order.status === 'completed' ? ' disabled' : '' ) + '>' +
						'<span class="dashicons dashicons-yes-alt"></span>' +
					'</button>' +
				'</div>' +
			'</td>';

		return tr;
	}

	function buildExpandedRow( order ) {
		const tr = document.createElement( 'tr' );
		tr.classList.add( 'lp-expanded-row' );
		tr.dataset.expandId = order.id;
		tr.style.display = 'none';

		const td = document.createElement( 'td' );
		td.colSpan = 8;
		td.innerHTML = buildProductsContent( order );
		tr.appendChild( td );

		return tr;
	}

	function buildProductsContent( order ) {
		let html = '<div class="lp-expanded-content">' +
			'<h4><span class="dashicons dashicons-cart"></span> Productos a preparar</h4>' +
			'<div class="lp-products-grid">';

		if ( order.line_items && order.line_items.length > 0 ) {
			order.line_items.forEach( function ( item ) {
				html += '<div class="lp-product-card">' +
					'<span class="lp-product-badge">' + escHtml( item.quantity ) + '</span>' +
					'<p class="lp-product-name">' + escHtml( item.name ) + '</p>' +
					'<p class="lp-product-sku">' + escHtml( item.sku || 'Sin SKU' ) + '</p>';

				if ( item.meta_data && item.meta_data.length > 0 ) {
					html += '<div class="lp-product-meta">';
					item.meta_data.forEach( function ( m ) {
						html += '<div class="lp-product-meta-row">' +
							'<span>' + escHtml( m.key ) + ':</span>' +
							'<span>' + escHtml( m.value ) + '</span>' +
						'</div>';
					} );
					html += '</div>';
				}

				html += '</div>';
			} );
		} else {
			html += '<p>No hay productos en este pedido.</p>';
		}

		html += '</div>';

		if ( order.customer_note ) {
			html += '<div class="lp-customer-note">' +
				'<strong>Nota del cliente:</strong> ' + escHtml( order.customer_note ) +
			'</div>';
		}

		html += '</div>';
		return html;
	}

	/* =========================================================
	   Modal de detalles
	   ========================================================= */

	function openModal( order ) {
		modalTitle.textContent = 'Pedido #' + ( order.number || order.id );
		modalBody.innerHTML    = buildModalContent( order );

		// Botón preparar pedido
		const btnPrepare = modalBody.querySelector( '.lp-btn-prepare' );
		if ( btnPrepare ) {
			btnPrepare.addEventListener( 'click', function () {
				updateOrderStatus( order.id, 'processing', btnPrepare );
			} );
		}

		modalOverlay.style.display = 'flex';
		document.body.style.overflow = 'hidden';
	}

	function closeModal() {
		modalOverlay.style.display = 'none';
		document.body.style.overflow = '';
	}

	function buildModalContent( order ) {
		const customer = trim( ( order.billing.first_name || '' ) + ' ' + ( order.billing.last_name || '' ) );
		const canPrepare = order.status !== 'processing' && order.status !== 'completed';

		let html =
			'<div class="lp-modal-meta">' + buildBadge( order.status ) + '</div>' +
			'<div class="lp-modal-meta">Fecha: ' + escHtml( formatDate( order.date_created ) ) + '</div>' +
			'<div class="lp-modal-meta">Cliente: ' + escHtml( customer ) + '</div>' +
			'<div class="lp-modal-actions">' +
				'<button type="button" class="button button-primary lp-btn-prepare"' + ( ! canPrepare ? ' disabled' : '' ) + '>' +
					'<span class="dashicons dashicons-cart"></span> Preparar pedido' +
				'</button>' +
			'</div>';

		// Productos
		html += '<div class="lp-modal-section"><h3>Productos</h3>' +
			'<table class="lp-modal-table">' +
			'<thead><tr>' +
				'<th>SKU</th>' +
				'<th>Producto</th>' +
				'<th class="lp-text-center">Cant.</th>' +
				'<th class="lp-text-right">Precio</th>' +
				'<th class="lp-text-right">Subtotal</th>' +
			'</tr></thead>' +
			'<tbody>';

		( order.line_items || [] ).forEach( function ( item ) {
			html += '<tr>' +
				'<td><code>' + escHtml( item.sku || 'N/A' ) + '</code></td>' +
				'<td>' + escHtml( item.name ) + '</td>' +
				'<td class="lp-text-center">' + escHtml( item.quantity ) + '</td>' +
				'<td class="lp-text-right">' + escHtml( order.currency_symbol ) + parseFloat( item.price ).toFixed( 2 ) + '</td>' +
				'<td class="lp-text-right">' + escHtml( order.currency_symbol ) + parseFloat( item.subtotal ).toFixed( 2 ) + '</td>' +
			'</tr>';
		} );

		html += '</tbody></table></div>';

		// Info pago + envío
		html += '<div class="lp-modal-section"><div class="lp-modal-grid">';

		// Pago
		html += '<div><h3>Información de Pago</h3><div class="lp-info-box">' +
			'<p>Método: ' + escHtml( order.payment_method_title || '—' ) + '</p>' +
			'<p>Total: ' + escHtml( order.currency_symbol ) + escHtml( order.total ) + '</p>' +
			( order.transaction_id ? '<p>ID Transacción: ' + escHtml( order.transaction_id ) + '</p>' : '' ) +
		'</div></div>';

		// Envío
		const s = order.shipping || {};
		const hasShipping = s.first_name || s.address_1 || s.city;
		html += '<div><h3>Dirección de Envío</h3><div class="lp-info-box">';
		if ( hasShipping ) {
			html +=
				( s.first_name || s.last_name ? '<p>' + escHtml( ( s.first_name || '' ) + ' ' + ( s.last_name || '' ) ) + '</p>' : '' ) +
				( s.company ? '<p>' + escHtml( s.company ) + '</p>' : '' ) +
				( s.address_1 ? '<p>' + escHtml( s.address_1 ) + '</p>' : '' ) +
				( s.address_2 ? '<p>' + escHtml( s.address_2 ) + '</p>' : '' ) +
				( ( s.postcode || s.city ) ? '<p>' + escHtml( ( s.postcode || '' ) + ' ' + ( s.city || '' ) ) + '</p>' : '' ) +
				( s.country ? '<p>' + escHtml( s.country ) + '</p>' : '' );
		} else {
			html += '<p><em>Sin información de envío.</em></p>';
		}
		html += '</div></div>';

		html += '</div></div>';

		// Notas del cliente
		if ( order.customer_note ) {
			html += '<div class="lp-modal-section"><h3>Notas del Cliente</h3>' +
				'<div class="lp-info-box"><p>' + escHtml( order.customer_note ) + '</p></div></div>';
		}

		return html;
	}

	/* =========================================================
	   Helpers de UI
	   ========================================================= */

	function showState( state, msg ) {
		elLoading.style.display = state === 'loading' ? '' : 'none';
		elError.style.display   = state === 'error'   ? '' : 'none';
		elEmpty.style.display   = state === 'empty'   ? '' : 'none';
		elTable.style.display   = state === 'table'   ? '' : 'none';

		if ( state === 'error' && msg ) {
			elError.textContent = msg;
		}
	}

	function buildBadge( status ) {
		const label = STATUS_LABELS[ status ] || status;
		const cls   = 'lp-badge lp-badge-' + ( STATUS_LABELS[ status ] ? status : 'default' );
		return '<span class="' + cls + '">' + escHtml( label ) + '</span>';
	}

	function formatDate( iso ) {
		if ( ! iso ) return '—';
		try {
			const d = new Date( iso );
			return new Intl.DateTimeFormat( 'es-ES', {
				year: 'numeric', month: '2-digit', day: '2-digit',
				hour: '2-digit', minute: '2-digit',
			} ).format( d );
		} catch ( e ) {
			return iso;
		}
	}

	function escHtml( str ) {
		if ( str === null || str === undefined ) return '';
		return String( str )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&#039;' );
	}

	function trim( str ) {
		return str.replace( /\s+/g, ' ' ).trim();
	}

	/* =========================================================
	   Event listeners
	   ========================================================= */

	// Cambio de filtros → recargar
	filterStatus.addEventListener( 'change', fetchOrders );
	filterOrderBy.addEventListener( 'change', fetchOrders );

	// Búsqueda con debounce
	searchInput.addEventListener( 'input', function () {
		clearTimeout( searchTimer );
		searchTimer = setTimeout( fetchOrders, 400 );
	} );

	// Botón actualizar
	btnRefresh.addEventListener( 'click', fetchOrders );

	// Click en tbody (delegación de eventos)
	tbody.addEventListener( 'click', function ( e ) {
		// Toggle fila expandida
		const toggleBtn = e.target.closest( '.lp-row-toggle' );
		if ( toggleBtn ) {
			const id  = toggleBtn.dataset.id;
			const row = tbody.querySelector( '[data-expand-id="' + id + '"]' );
			const icon = toggleBtn.querySelector( '.dashicons' );

			if ( row ) {
				const isOpen = row.style.display !== 'none';
				row.style.display   = isOpen ? 'none' : '';
				expandedRows[ id ]  = ! isOpen;
				icon.className = isOpen
					? 'dashicons dashicons-arrow-down-alt2'
					: 'dashicons dashicons-arrow-up-alt2';
			}
			return;
		}

		// Ver detalles (modal)
		const viewBtn = e.target.closest( '.lp-btn-view' );
		if ( viewBtn ) {
			const orderId = parseInt( viewBtn.dataset.id, 10 );
			loadAndOpenModal( orderId );
			return;
		}

		// Completar pedido
		const completeBtn = e.target.closest( '.lp-btn-complete' );
		if ( completeBtn && ! completeBtn.disabled ) {
			const orderId = parseInt( completeBtn.dataset.id, 10 );
			if ( window.confirm( '¿Marcar el pedido #' + orderId + ' como completado?' ) ) {
				updateOrderStatus( orderId, 'completed', completeBtn );
			}
		}
	} );

	// Cerrar modal
	modalClose.addEventListener( 'click', closeModal );
	modalOverlay.addEventListener( 'click', function ( e ) {
		if ( e.target === modalOverlay ) {
			closeModal();
		}
	} );
	document.addEventListener( 'keydown', function ( e ) {
		if ( e.key === 'Escape' ) {
			closeModal();
		}
	} );

	/* =========================================================
	   Cargar orden individual para el modal
	   ========================================================= */

	function loadAndOpenModal( orderId ) {
		// Primero intentamos encontrarla en el DOM (ya cargada)
		// buscando en los datos actuales via AJAX de una sola orden
		const params = new URLSearchParams( {
			action:   'lp_get_orders',
			nonce:    lpData.nonce,
			status:   '',         // todos los estados para encontrarla
			search:   String( orderId ),
		} );

		fetch( lpData.ajaxUrl + '?' + params.toString() )
			.then( function ( res ) { return res.json(); } )
			.then( function ( data ) {
				if ( data.success && data.data.orders.length > 0 ) {
					// Buscar la orden exacta por id
					const order = data.data.orders.find( function ( o ) {
						return String( o.id ) === String( orderId );
					} ) || data.data.orders[0];
					openModal( order );
				}
			} )
			.catch( function () {} );
	}

	/* ---- Carga inicial ---- */
	fetchOrders();

} )();
