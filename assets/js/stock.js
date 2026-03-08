/* globals lpData */
( function () {
	'use strict';

	/* ---- Referencias al DOM ---- */
	const searchInput = document.getElementById( 'lp-stock-search' );
	const btnRefresh  = document.getElementById( 'lp-stock-refresh' );
	const elLoading   = document.getElementById( 'lp-stock-loading' );
	const elEmpty     = document.getElementById( 'lp-stock-empty' );
	const elList      = document.getElementById( 'lp-stock-list' );

	/* ---- Estado local ---- */
	let allProducts  = [];
	let searchTimer  = null;
	let saveTimers   = {};   // { variationId: timeoutId }

	/* =========================================================
	   Carga de productos
	   ========================================================= */

	function fetchProducts() {
		showLoading( true );

		const params = new URLSearchParams( {
			action: 'lp_get_stock',
			nonce:  lpData.nonce,
		} );

		fetch( lpData.ajaxUrl + '?' + params.toString() )
			.then( function ( res ) { return res.json(); } )
			.then( function ( data ) {
				if ( ! data.success ) {
					throw new Error( data.data && data.data.message ? data.data.message : 'Error' );
				}
				allProducts = data.data.products || [];
				renderAll( searchInput.value.trim() );
			} )
			.catch( function ( err ) {
				showLoading( false );
				elEmpty.textContent = 'Error al cargar productos: ' + err.message;
				elEmpty.style.display = '';
			} );
	}

	/* =========================================================
	   Renderizado
	   ========================================================= */

	function renderAll( filter ) {
		const term = filter.toLowerCase();

		const filtered = term
			? allProducts.filter( function ( p ) {
				return p.name.toLowerCase().indexOf( term ) !== -1;
			  } )
			: allProducts;

		elList.innerHTML = '';

		if ( filtered.length === 0 ) {
			showLoading( false );
			elEmpty.style.display   = '';
			elEmpty.textContent = filter
				? 'No se encontraron productos para "' + filter + '".'
				: 'No se encontraron productos variables.';
			return;
		}

		filtered.forEach( function ( product ) {
			elList.appendChild( buildProductCard( product ) );
		} );

		showLoading( false );
		elEmpty.style.display = 'none';
		elList.style.display  = '';
	}

	function buildProductCard( product ) {
		const card = document.createElement( 'div' );
		card.className = 'lp-stock-card';
		card.dataset.productId = product.id;

		// Contar cuántas variaciones están sin stock
		const outOfStock = product.variations.filter( function ( v ) {
			return v.stock_quantity <= 0;
		} ).length;

		let titleHtml = '<h3 class="lp-stock-product-name">' + escHtml( product.name );
		if ( outOfStock > 0 ) {
			titleHtml += ' <span class="lp-stock-warn-badge">' + outOfStock + ' sin stock</span>';
		}
		titleHtml += '</h3>';

		let tableHtml =
			'<table class="lp-stock-table widefat">' +
			'<thead><tr>' +
			'<th>Talla / Variante</th>' +
			'<th>SKU</th>' +
			'<th>Stock</th>' +
			'<th>Ajustar</th>' +
			'</tr></thead>' +
			'<tbody>';

		product.variations.forEach( function ( v ) {
			const label      = buildAttrLabel( v.attributes );
			const zeroClass  = v.stock_quantity <= 0 ? ' lp-stock-zero' : '';
			const stockVal   = v.stock_quantity;

			tableHtml +=
				'<tr data-variation-id="' + v.id + '">' +
				'<td><span class="lp-size-chip' + ( v.stock_quantity <= 0 ? ' lp-size-chip-empty' : '' ) + '">' + escHtml( label ) + '</span></td>' +
				'<td class="lp-mono">' + escHtml( v.sku || '—' ) + '</td>' +
				'<td class="lp-stock-td">' +
					'<input type="number" class="lp-stock-input' + zeroClass + '" value="' + stockVal + '" min="0" step="1" data-variation-id="' + v.id + '" />' +
					'<span class="lp-save-status"></span>' +
				'</td>' +
				'<td class="lp-adj-td">' +
					'<button class="lp-adj" data-delta="-5" title="Restar 5">-5</button>' +
					'<button class="lp-adj" data-delta="-1" title="Restar 1">-1</button>' +
					'<button class="lp-adj lp-adj-add" data-delta="1" title="Añadir 1">+1</button>' +
					'<button class="lp-adj lp-adj-add" data-delta="5" title="Añadir 5">+5</button>' +
					'<button class="lp-adj lp-adj-add" data-delta="10" title="Añadir 10">+10</button>' +
				'</td>' +
				'</tr>';
		} );

		tableHtml += '</tbody></table>';

		card.innerHTML = titleHtml + tableHtml;
		return card;
	}

	function buildAttrLabel( attrs ) {
		return attrs.map( function ( a ) { return a.value; } ).join( ' / ' );
	}

	/* =========================================================
	   Guardar stock
	   ========================================================= */

	function saveStock( variationId, newStock, inputEl, statusEl ) {
		if ( statusEl ) {
			statusEl.className = 'lp-save-status lp-saving';
			statusEl.textContent = '…';
		}

		const body = new URLSearchParams( {
			action:       'lp_update_stock',
			nonce:        lpData.nonce,
			variation_id: variationId,
			stock:        newStock,
		} );

		fetch( lpData.ajaxUrl, { method: 'POST', body: body } )
			.then( function ( res ) { return res.json(); } )
			.then( function ( data ) {
				if ( ! data.success ) {
					throw new Error( data.data && data.data.message ? data.data.message : 'Error' );
				}

				const savedStock = data.data.stock;

				if ( inputEl ) {
					inputEl.value = savedStock;
					inputEl.classList.toggle( 'lp-stock-zero', savedStock <= 0 );
				}

				// Actualizar el chip de talla
				const row = inputEl ? inputEl.closest( 'tr' ) : null;
				if ( row ) {
					const chip = row.querySelector( '.lp-size-chip' );
					if ( chip ) {
						chip.classList.toggle( 'lp-size-chip-empty', savedStock <= 0 );
					}
				}

				// Actualizar también el dato local en memoria
				updateLocalStock( variationId, savedStock );
				// Refrescar badge de sin stock del producto
				refreshProductBadge( inputEl );

				if ( statusEl ) {
					statusEl.className   = 'lp-save-status lp-saved';
					statusEl.textContent = '✓';
					setTimeout( function () {
						statusEl.textContent = '';
						statusEl.className   = 'lp-save-status';
					}, 2000 );
				}
			} )
			.catch( function ( err ) {
				if ( statusEl ) {
					statusEl.className   = 'lp-save-status lp-save-error';
					statusEl.textContent = '✗ ' + err.message;
					setTimeout( function () {
						statusEl.textContent = '';
						statusEl.className   = 'lp-save-status';
					}, 3000 );
				}
			} );
	}

	function updateLocalStock( variationId, newStock ) {
		allProducts.forEach( function ( p ) {
			p.variations.forEach( function ( v ) {
				if ( v.id === variationId ) {
					v.stock_quantity = newStock;
					v.in_stock       = newStock > 0;
				}
			} );
		} );
	}

	function refreshProductBadge( inputEl ) {
		if ( ! inputEl ) return;
		const card = inputEl.closest( '.lp-stock-card' );
		if ( ! card ) return;

		const productId = parseInt( card.dataset.productId, 10 );
		const product   = allProducts.find( function ( p ) { return p.id === productId; } );
		if ( ! product ) return;

		const outOfStock = product.variations.filter( function ( v ) { return v.stock_quantity <= 0; } ).length;
		let badge = card.querySelector( '.lp-stock-warn-badge' );

		if ( outOfStock > 0 ) {
			if ( ! badge ) {
				badge = document.createElement( 'span' );
				badge.className = 'lp-stock-warn-badge';
				card.querySelector( '.lp-stock-product-name' ).appendChild( badge );
			}
			badge.textContent = outOfStock + ' sin stock';
		} else if ( badge ) {
			badge.remove();
		}
	}

	/* =========================================================
	   Helpers
	   ========================================================= */

	function showLoading( show ) {
		elLoading.style.display = show ? '' : 'none';
		if ( show ) {
			elEmpty.style.display = 'none';
			elList.style.display  = 'none';
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

	/* =========================================================
	   Eventos
	   ========================================================= */

	// Búsqueda con debounce (filtrado local, sin AJAX)
	searchInput.addEventListener( 'input', function () {
		clearTimeout( searchTimer );
		searchTimer = setTimeout( function () {
			renderAll( searchInput.value.trim() );
		}, 250 );
	} );

	// Botón actualizar
	btnRefresh.addEventListener( 'click', fetchProducts );

	// Delegación de eventos en la lista de productos
	elList.addEventListener( 'click', function ( e ) {
		// Botones +/- de ajuste
		const adjBtn = e.target.closest( '.lp-adj' );
		if ( adjBtn ) {
			const row       = adjBtn.closest( 'tr' );
			const varId     = parseInt( row.dataset.variationId, 10 );
			const input     = row.querySelector( '.lp-stock-input' );
			const statusEl  = row.querySelector( '.lp-save-status' );
			const delta     = parseInt( adjBtn.dataset.delta, 10 );
			const newVal    = Math.max( 0, ( parseInt( input.value, 10 ) || 0 ) + delta );

			input.value = newVal;

			clearTimeout( saveTimers[ varId ] );
			saveStock( varId, newVal, input, statusEl );
		}
	} );

	// Auto-guardar al salir del input (blur) o Enter
	elList.addEventListener( 'change', function ( e ) {
		if ( ! e.target.classList.contains( 'lp-stock-input' ) ) return;
		const row      = e.target.closest( 'tr' );
		const varId    = parseInt( row.dataset.variationId, 10 );
		const newVal   = Math.max( 0, parseInt( e.target.value, 10 ) || 0 );
		const statusEl = row.querySelector( '.lp-save-status' );

		e.target.value = newVal;

		clearTimeout( saveTimers[ varId ] );
		saveTimers[ varId ] = setTimeout( function () {
			saveStock( varId, newVal, e.target, statusEl );
		}, 400 );
	} );

	elList.addEventListener( 'keydown', function ( e ) {
		if ( e.key !== 'Enter' || ! e.target.classList.contains( 'lp-stock-input' ) ) return;
		e.preventDefault();
		e.target.blur();
	} );

	/* ---- Carga inicial ---- */
	fetchProducts();

} )();
