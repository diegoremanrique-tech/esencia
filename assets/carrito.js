/* ============================================================
   ESENCIA — Lógica compartida del carrito (Bloque 2)
   ------------------------------------------------------------
   Se incluye en los 3 HTML con:
       <script src="/assets/carrito.js" defer></script>
   Es autocontenido: inyecta sus propios estilos y el DOM del
   mini-carrito (sidebar + overlay), así no hay que duplicar
   marcado en cada página. El estado vive en localStorage, por
   lo que persiste al navegar entre Inicio / Catálogo / Producto.
   ============================================================ */
(function () {
  'use strict';

  // ── Tabla de precios oficial (por colección y tamaño) ──
  const PRECIOS = {
    nicho:     { 30: 45, 50: 70, 100: 88 },
    disenador: { 30: 42, 50: 65, 100: 84 },
    clasico:   { 30: 40, 50: 60, 100: 79 },
  };
  // Etiqueta visible de cada colección
  const ETIQUETA_COLECCION = {
    nicho: 'Nicho',
    disenador: 'Diseñador',
    clasico: 'Clásico',
  };
  // Normaliza variantes con acento a la clave interna
  function normalizarTier(t) {
    if (!t) return 'disenador';
    const s = t.toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (s.startsWith('nich')) return 'nicho';
    if (s.startsWith('clas')) return 'clasico';
    return 'disenador';
  }

  const LS_KEY = 'esencia_cart';
  const money = (n) => 'S/ ' + Math.round(Number(n) || 0);

  // ─────────────────────────────────────────────
  //  ESTADO (localStorage)
  // ─────────────────────────────────────────────
  function getCart() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function saveCart(cart) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cart)); } catch (e) {}
    actualizarBadge();
    renderCart();
  }
  // Clave única de una línea: mismo perfume + misma talla
  const sameLine = (it, slug, talla) =>
    it.slug === slug && String(it.talla) === String(talla);

  function addToCart(item) {
    const cart = getCart();
    const existente = cart.find((it) => sameLine(it, item.slug, item.talla));
    if (existente) {
      existente.cantidad += (item.cantidad || 1);
    } else {
      cart.push({
        id: item.id || item.slug,
        slug: item.slug,
        nombre: item.nombre,
        marca: item.marca,
        coleccion: item.coleccion,
        talla: item.talla,
        precio: Number(item.precio),
        cantidad: item.cantidad || 1,
        imagen: item.imagen || '',
      });
    }
    saveCart(cart);
  }
  function removeFromCart(slug, talla) {
    saveCart(getCart().filter((it) => !sameLine(it, slug, talla)));
  }
  function updateQuantity(slug, talla, delta) {
    const cart = getCart();
    const it = cart.find((x) => sameLine(x, slug, talla));
    if (!it) return;
    it.cantidad += delta;
    if (it.cantidad < 1) {
      saveCart(cart.filter((x) => !sameLine(x, slug, talla)));
    } else {
      saveCart(cart);
    }
  }
  function getTotal() {
    return getCart().reduce((s, it) => s + it.precio * it.cantidad, 0);
  }
  function clearCart() { saveCart([]); }
  function countItems() {
    return getCart().reduce((s, it) => s + it.cantidad, 0);
  }

  // ─────────────────────────────────────────────
  //  ESTILOS DEL MINI-CARRITO (inyectados)
  //  Namespaced con #esCart / .esc- para no chocar con nada.
  // ─────────────────────────────────────────────
  const CSS = `
  #esCartOverlay{position:fixed;inset:0;background:rgba(0,0,0,.6);
    opacity:0;visibility:hidden;transition:opacity .35s cubic-bezier(.22,1,.36,1),visibility .35s;
    z-index:1000;backdrop-filter:blur(2px)}
  #esCartOverlay.open{opacity:1;visibility:visible}
  #esCartSidebar{position:fixed;top:0;right:0;height:100%;width:420px;max-width:100%;
    background:#0a0a0a;border-left:1px solid #1a1a1a;
    transform:translateX(100%);transition:transform .35s cubic-bezier(.22,1,.36,1);
    z-index:1001;display:flex;flex-direction:column;
    font-family:'Montserrat',sans-serif;color:#f5f0eb}
  #esCartSidebar.open{transform:translateX(0)}
  .esc-head{display:flex;align-items:center;justify-content:space-between;
    padding:26px 26px 20px;border-bottom:1px solid #1a1a1a}
  .esc-title{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;color:#f5f0eb;
    letter-spacing:.01em}
  .esc-close{width:34px;height:34px;display:flex;align-items:center;justify-content:center;
    background:transparent;border:1px solid #1a1a1a;color:#a09888;font-size:20px;line-height:1;
    cursor:pointer;transition:all .3s}
  .esc-close:hover{border-color:#c9a96e;color:#c9a96e}
  .esc-body{flex:1;overflow-y:auto;padding:10px 26px;-webkit-overflow-scrolling:touch}
  .esc-item{display:grid;grid-template-columns:64px 1fr auto;gap:14px;
    padding:18px 0;border-bottom:1px solid #1a1a1a;position:relative}
  .esc-item-img{width:64px;height:80px;background:#000;border:1px solid #1a1a1a;
    display:flex;align-items:center;justify-content:center;overflow:hidden}
  .esc-item-img img{max-width:100%;max-height:100%;object-fit:contain}
  .esc-item-info{min-width:0}
  .esc-item-marca{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#5a5248;margin-bottom:4px}
  .esc-item-name{font-family:'Cormorant Garamond',serif;font-size:18px;color:#f5f0eb;line-height:1.1;margin-bottom:4px}
  .esc-item-talla{font-size:10.5px;letter-spacing:.1em;color:#a09888;margin-bottom:12px}
  .esc-item-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .esc-qty{display:inline-flex;align-items:center;border:1px solid #1a1a1a}
  .esc-qty-btn{width:26px;height:26px;display:flex;align-items:center;justify-content:center;
    background:transparent;color:#a09888;font-size:14px;line-height:1;cursor:pointer;transition:color .25s}
  .esc-qty-btn:hover{color:#c9a96e}
  .esc-qty-n{min-width:26px;text-align:center;font-size:12px;color:#f5f0eb}
  .esc-item-price{font-size:13px;color:#c9a96e;font-weight:500;white-space:nowrap}
  .esc-item-remove{position:absolute;top:18px;right:0;width:22px;height:22px;
    background:transparent;border:none;color:#5a5248;font-size:16px;line-height:1;cursor:pointer;transition:color .25s}
  .esc-item-remove:hover{color:#c84545}
  .esc-empty{text-align:center;padding:70px 20px;color:#a09888}
  .esc-empty p{font-family:'Cormorant Garamond',serif;font-size:20px;margin-bottom:20px;color:#a09888}
  .esc-empty-cta{display:inline-block;padding:12px 28px;border:1px solid #c9a96e;color:#c9a96e;
    font-size:10px;letter-spacing:.24em;text-transform:uppercase;transition:all .3s}
  .esc-empty-cta:hover{background:#c9a96e;color:#000}
  .esc-foot{padding:22px 26px;border-top:1px solid #1a1a1a;background:#0a0a0a}
  .esc-total-row{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px}
  .esc-total-row span:first-child{font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:#a09888}
  .esc-total-row span:last-child{font-family:'Cormorant Garamond',serif;font-size:30px;color:#f5f0eb}
  .esc-ship{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#5a5248;margin-bottom:18px}
  .esc-checkout{width:100%;padding:16px;background:#c9a96e;color:#000;border:1px solid #c9a96e;
    font-size:11px;letter-spacing:.26em;text-transform:uppercase;font-weight:600;cursor:pointer;
    transition:all .3s}
  .esc-checkout:hover{background:#d9b878;box-shadow:0 8px 24px rgba(201,169,110,.25)}
  .esc-checkout:disabled{opacity:.35;cursor:not-allowed;box-shadow:none}
  .esc-note{margin-top:12px;font-size:10.5px;letter-spacing:.04em;color:#a09888;text-align:center;min-height:14px}
  /* Precio bajo cada botón de talla (producto.html) */
  .size-price{font-family:'Montserrat',sans-serif;font-size:12px;color:#a09888;
    margin-top:8px;letter-spacing:.04em;transition:color .3s}
  .size-opt.active .size-price{color:#c9a96e}
  @media(max-width:480px){#esCartSidebar{width:100%}}
  `;

  // ─────────────────────────────────────────────
  //  MARCADO DEL MINI-CARRITO (inyectado en <body>)
  // ─────────────────────────────────────────────
  function inyectarUI() {
    const style = document.createElement('style');
    style.id = 'esCartStyles';
    style.textContent = CSS;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="esCartOverlay"></div>
      <aside id="esCartSidebar" aria-hidden="true" aria-label="Carrito de compra">
        <div class="esc-head">
          <span class="esc-title">Tu carrito</span>
          <button class="esc-close" id="escClose" aria-label="Cerrar carrito">&times;</button>
        </div>
        <div class="esc-body" id="escBody"></div>
        <div class="esc-foot">
          <div class="esc-total-row"><span>Total</span><span id="escTotal">S/ 0</span></div>
          <div class="esc-ship">Envío gratis a todo Lima</div>
          <button class="esc-checkout" id="escCheckout">Finalizar compra</button>
          <div class="esc-note" id="escNote"></div>
        </div>
      </aside>`;
    document.body.appendChild(wrap);

    document.getElementById('esCartOverlay').addEventListener('click', closeCart);
    document.getElementById('escClose').addEventListener('click', closeCart);
    document.getElementById('escCheckout').addEventListener('click', onFinalizarCompra);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

    // El ícono de carrito del nav abre el mini-carrito (en las 3 páginas)
    document.querySelectorAll('.nav-cart').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.preventDefault(); openCart(); });
    });
  }

  // ─────────────────────────────────────────────
  //  ABRIR / CERRAR
  // ─────────────────────────────────────────────
  function openCart() {
    renderCart();
    document.getElementById('esCartOverlay').classList.add('open');
    document.getElementById('esCartSidebar').classList.add('open');
    document.getElementById('esCartSidebar').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    document.getElementById('esCartOverlay').classList.remove('open');
    document.getElementById('esCartSidebar').classList.remove('open');
    document.getElementById('esCartSidebar').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  function actualizarBadge() {
    const n = countItems();
    document.querySelectorAll('.nav-cart-count').forEach((el) => { el.textContent = n; });
  }
  function renderCart() {
    const body = document.getElementById('escBody');
    const totalEl = document.getElementById('escTotal');
    const checkoutBtn = document.getElementById('escCheckout');
    if (!body) return;
    const cart = getCart();

    if (cart.length === 0) {
      body.innerHTML = `
        <div class="esc-empty">
          <p>Tu carrito está vacío</p>
          <a href="/catalogo" class="esc-empty-cta">Ver catálogo</a>
        </div>`;
      if (totalEl) totalEl.textContent = money(0);
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    body.innerHTML = cart.map((it) => {
      const col = ETIQUETA_COLECCION[normalizarTier(it.coleccion)] || '';
      const img = it.imagen
        ? `<img src="${it.imagen}" alt="${it.nombre}">`
        : '';
      return `
        <div class="esc-item" data-slug="${it.slug}" data-talla="${it.talla}">
          <div class="esc-item-img">${img}</div>
          <div class="esc-item-info">
            <div class="esc-item-marca">Inspirado en ${it.marca || ''}</div>
            <div class="esc-item-name">${it.nombre || ''}</div>
            <div class="esc-item-talla">${it.talla}ml${col ? ' · ' + col : ''}</div>
            <div class="esc-item-bottom">
              <div class="esc-qty">
                <button class="esc-qty-btn" data-act="dec" aria-label="Restar">&minus;</button>
                <span class="esc-qty-n">${it.cantidad}</span>
                <button class="esc-qty-btn" data-act="inc" aria-label="Sumar">&plus;</button>
              </div>
              <div class="esc-item-price">${money(it.precio * it.cantidad)}</div>
            </div>
          </div>
          <button class="esc-item-remove" data-act="rm" aria-label="Quitar">&times;</button>
        </div>`;
    }).join('');

    if (totalEl) totalEl.textContent = money(getTotal());
    if (checkoutBtn) checkoutBtn.disabled = false;

    // Delegación de eventos para +/- y quitar
    body.querySelectorAll('.esc-item').forEach((row) => {
      const slug = row.dataset.slug;
      const talla = row.dataset.talla;
      row.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', () => {
          const act = b.dataset.act;
          if (act === 'inc') updateQuantity(slug, talla, +1);
          else if (act === 'dec') updateQuantity(slug, talla, -1);
          else if (act === 'rm') removeFromCart(slug, talla);
        });
      });
    });
  }

  // ─────────────────────────────────────────────
  //  FINALIZAR COMPRA → checkout (modal en Bloque 3)
  // ─────────────────────────────────────────────
  function onFinalizarCompra() {
    if (getCart().length === 0) return;
    if (typeof window.iniciarCheckout === 'function') {
      window.iniciarCheckout();
    } else {
      // Placeholder hasta el Bloque 3 (modal de pago Culqi)
      const note = document.getElementById('escNote');
      if (note) note.textContent = 'El pago se activa en el siguiente paso (Bloque 3).';
    }
  }

  // ─────────────────────────────────────────────
  //  INTEGRACIÓN CON producto.html
  //  (selector de tallas + precios por colección + añadir)
  // ─────────────────────────────────────────────
  function initProducto() {
    const prod = document.querySelector('.product[data-slug]');
    if (!prod) return; // No es la página de producto

    const tier = normalizarTier(prod.dataset.tier);
    const tabla = PRECIOS[tier];
    const base = {
      id: prod.dataset.id || prod.dataset.slug,
      slug: prod.dataset.slug,
      nombre: prod.dataset.nombre || '',
      marca: prod.dataset.marca || '',
      coleccion: tier,
      imagen: (document.querySelector('.gal-main img') || {}).src || '',
    };

    const opts = Array.from(document.querySelectorAll('.size-opt'));
    // Asigna el precio correcto de la tabla a cada talla + etiqueta de precio
    opts.forEach((opt) => {
      const ml = Number(opt.dataset.size);
      const precio = tabla[ml];
      if (precio != null) {
        opt.dataset.price = precio;
        let pl = opt.querySelector('.size-price');
        if (!pl) {
          pl = document.createElement('div');
          pl.className = 'size-price';
          opt.appendChild(pl);
        }
        pl.textContent = money(precio);
      }
    });

    // Precio total inicial = talla activa (por defecto 50ml)
    const activa = document.querySelector('.size-opt.active') || opts[0];
    const totalPrice = document.getElementById('totalPrice');
    const ctaPrice = document.getElementById('ctaPrice');
    if (activa && totalPrice) {
      totalPrice.textContent = activa.dataset.price;
      const sub = ctaPrice && ctaPrice.querySelector('sub');
      if (sub) sub.textContent = ` · ${activa.dataset.size}ml`;
    }

    function lineaSeleccionada() {
      const sel = document.querySelector('.size-opt.active') || opts[0];
      return Object.assign({}, base, {
        talla: Number(sel.dataset.size),
        precio: Number(sel.dataset.price),
        cantidad: 1,
      });
    }

    const btnAdd = document.querySelector('.cta-secondary');
    const btnBuy = document.querySelector('.cta-buy');
    if (btnAdd) btnAdd.addEventListener('click', () => {
      addToCart(lineaSeleccionada());
      openCart();
    });
    if (btnBuy) btnBuy.addEventListener('click', () => {
      addToCart(lineaSeleccionada());
      if (typeof window.iniciarCheckout === 'function') window.iniciarCheckout();
      else openCart();
    });
  }

  // ─────────────────────────────────────────────
  //  API pública (la usará el checkout del Bloque 3)
  // ─────────────────────────────────────────────
  window.EsenciaCart = {
    getCart, addToCart, removeFromCart, updateQuantity,
    getTotal, clearCart, countItems, openCart, closeCart,
    PRECIOS, ETIQUETA_COLECCION,
  };

  // ─────────────────────────────────────────────
  //  ARRANQUE
  // ─────────────────────────────────────────────
  function init() {
    inyectarUI();
    actualizarBadge();
    renderCart();
    initProducto();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
