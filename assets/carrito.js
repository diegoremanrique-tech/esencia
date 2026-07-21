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
    nicho:     { 30: 1, 50: 70, 100: 88 },
    disenador: { 30: 1, 50: 65, 100: 84 },
    clasico:   { 30: 1, 50: 60, 100: 79 },
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
  .esc-total-row span:last-child{font-family:'Cormorant Garamond',serif;font-size:34px;color:#fff}
  .esc-ship{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#c9a96e;margin-bottom:18px}
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
  /* Animación: el producto "vuela" al ícono del carrito */
  .es-fly{position:fixed;z-index:1200;pointer-events:none;object-fit:contain;
    filter:drop-shadow(0 10px 20px rgba(0,0,0,.5));
    transition:left .85s cubic-bezier(.5,-0.25,.4,1),top .85s cubic-bezier(.5,-0.25,.4,1),width .85s ease,height .85s ease,opacity .85s ease,transform .85s ease;}
  /* El ícono del carrito crece y decrece al recibir un producto */
  .nav-cart.es-bump{animation:esBump .55s cubic-bezier(.22,1,.36,1)}
  @keyframes esBump{0%{transform:scale(1)}30%{transform:scale(1.22)}55%{transform:scale(.94)}100%{transform:scale(1)}}
  .nav-cart-count.es-bump{animation:esBumpCount .55s ease}
  @keyframes esBumpCount{0%{transform:scale(1)}30%{transform:scale(1.5)}100%{transform:scale(1)}}
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

    // Página estática: bloquea el zoom por gesto (pellizco) en iOS Safari,
    // que a veces ignora maximum-scale del viewport.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
      document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

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
  //  ANIMACIÓN: el producto vuela al carrito + bump del ícono
  // ─────────────────────────────────────────────
  function bumpCart() {
    document.querySelectorAll('.nav-cart').forEach((c) => {
      c.classList.remove('es-bump'); void c.offsetWidth; c.classList.add('es-bump');
    });
    document.querySelectorAll('.nav-cart-count').forEach((c) => {
      c.classList.remove('es-bump'); void c.offsetWidth; c.classList.add('es-bump');
    });
  }
  function animarAlCarrito(srcImg) {
    const cart = document.querySelector('.nav-cart');
    if (!srcImg || !cart || !srcImg.src) { bumpCart(); return; }
    const a = srcImg.getBoundingClientRect();
    const b = cart.getBoundingClientRect();
    const fly = document.createElement('img');
    fly.src = srcImg.src;
    fly.className = 'es-fly';
    fly.style.left = a.left + 'px';
    fly.style.top = a.top + 'px';
    fly.style.width = a.width + 'px';
    fly.style.height = a.height + 'px';
    fly.style.opacity = '0.95';
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.left = (b.left + b.width / 2 - 22) + 'px';
      fly.style.top = (b.top + b.height / 2 - 22) + 'px';
      fly.style.width = '44px';
      fly.style.height = '44px';
      fly.style.opacity = '0.15';
      fly.style.transform = 'rotate(14deg)';
    });
    setTimeout(() => { fly.remove(); bumpCart(); }, 850);
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

    // Los precios y datos los puebla producto.html desde el JSON. Aquí solo
    // enganchamos los botones y leemos el estado EN VIVO al hacer clic, para
    // que el item del carrito siempre refleje el producto/talla actuales.
    function lineaSeleccionada() {
      const sel = document.querySelector('.size-opt.active') || document.querySelector('.size-opt');
      return {
        id: prod.dataset.id || prod.dataset.slug,
        slug: prod.dataset.slug,
        nombre: prod.dataset.nombre || '',
        marca: prod.dataset.marca || '',
        coleccion: normalizarTier(prod.dataset.tier),
        talla: Number(sel.dataset.size),
        precio: Number(sel.dataset.price),
        cantidad: 1,
        imagen: (document.querySelector('.gal-main img') || {}).src || '',
      };
    }

    const btnAdd = document.querySelector('.cta-secondary');
    const btnBuy = document.querySelector('.cta-buy');
    if (btnAdd) btnAdd.addEventListener('click', () => {
      animarAlCarrito(document.querySelector('.gal-main img')); // vuela al ícono
      addToCart(lineaSeleccionada());
      setTimeout(openCart, 880); // abre el mini-carrito cuando el producto "llega"
    });
    if (btnBuy) btnBuy.addEventListener('click', () => {
      addToCart(lineaSeleccionada());
      if (typeof window.iniciarCheckout === 'function') window.iniciarCheckout();
      else openCart();
    });
  }

  // ═════════════════════════════════════════════
  //  CHECKOUT (Bloque 3) — modal: datos → Culqi → resultado
  // ═════════════════════════════════════════════
  const DISTRITOS = ['Miraflores', 'San Isidro', 'Surco', 'La Molina', 'San Borja',
    'Barranco', 'Pueblo Libre', 'Jesús María', 'Lince', 'Magdalena', 'San Miguel',
    'Surquillo', 'Chorrillos', 'Ate', 'Chaclacayo', 'Chosica',
    'San Juan de Lurigancho', 'San Juan de Miraflores', 'Otro'];

  const CSS_CHECKOUT = `
  #esCoOverlay{position:fixed;inset:0;background:rgba(0,0,0,.78);opacity:0;visibility:hidden;
    transition:opacity .3s,visibility .3s;z-index:1100;backdrop-filter:blur(3px)}
  #esCoOverlay.open{opacity:1;visibility:visible}
  #esCoModal{position:fixed;top:50%;left:50%;transform:translate(-50%,-46%);opacity:0;visibility:hidden;
    width:460px;max-width:calc(100% - 32px);max-height:calc(100% - 48px);overflow-y:auto;
    background:#0a0a0a;border:1px solid #1a1a1a;z-index:1101;
    transition:opacity .3s cubic-bezier(.22,1,.36,1),transform .3s cubic-bezier(.22,1,.36,1),visibility .3s;
    font-family:'Montserrat',sans-serif;color:#f5f0eb}
  #esCoModal.open{opacity:1;visibility:visible;transform:translate(-50%,-50%)}
  .esco-x{position:absolute;top:16px;right:16px;width:32px;height:32px;display:flex;align-items:center;
    justify-content:center;background:transparent;border:1px solid #1a1a1a;color:#a09888;font-size:18px;
    cursor:pointer;transition:all .3s;z-index:2}
  .esco-x:hover{border-color:#c9a96e;color:#c9a96e}
  .esco-pad{padding:34px 32px 30px}
  .esco-steps{display:flex;gap:8px;align-items:center;font-size:9px;letter-spacing:.22em;
    text-transform:uppercase;color:#5a5248;margin-bottom:8px}
  .esco-steps b{color:#c9a96e;font-weight:600}
  .esco-title{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:400;color:#f5f0eb;
    margin-bottom:6px;line-height:1.1}
  .esco-sub{font-size:12px;color:#a09888;margin-bottom:24px}
  .esco-field{margin-bottom:14px}
  .esco-field label{display:block;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;
    color:#a09888;margin-bottom:7px}
  .esco-field input,.esco-field select{width:100%;background:#050505;border:1px solid #1a1a1a;color:#f5f0eb;
    padding:13px 14px;font-family:'Montserrat',sans-serif;font-size:13.5px;transition:border-color .25s;outline:none}
  .esco-field input:focus,.esco-field select:focus{border-color:#c9a96e}
  .esco-field input::placeholder{color:#3a342e}
  .esco-field select{appearance:none;cursor:pointer}
  .esco-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .esco-err{color:#c84545;font-size:11.5px;margin:4px 0 0;min-height:14px}
  .esco-resumen{display:flex;justify-content:space-between;align-items:baseline;
    padding:14px 0;border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a;margin:18px 0 22px}
  .esco-resumen .lbl{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#a09888}
  .esco-resumen .val{font-family:'Cormorant Garamond',serif;font-size:28px;color:#f5f0eb}
  .esco-btn{width:100%;padding:16px;background:#c9a96e;color:#000;border:1px solid #c9a96e;
    font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:600;cursor:pointer;transition:all .3s}
  .esco-btn:hover{background:#d9b878;box-shadow:0 8px 24px rgba(201,169,110,.25)}
  .esco-btn:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}
  .esco-back{width:100%;margin-top:10px;padding:13px;background:transparent;border:1px solid #1a1a1a;
    color:#a09888;font-size:10px;letter-spacing:.22em;text-transform:uppercase;cursor:pointer;transition:all .3s}
  .esco-back:hover{border-color:#5a5248;color:#f5f0eb}
  .esco-note{font-size:12px;color:#a09888;line-height:1.6;text-align:center;margin:10px 0 0}
  .esco-center{text-align:center;padding:18px 0}
  .esco-spinner{width:46px;height:46px;margin:0 auto 22px;border:2px solid #1a1a1a;border-top-color:#c9a96e;
    border-radius:50%;animation:escoSpin .9s linear infinite}
  @keyframes escoSpin{to{transform:rotate(360deg)}}
  .esco-check{width:58px;height:58px;margin:0 auto 18px;border:2px solid #c9a96e;border-radius:50%;
    display:flex;align-items:center;justify-content:center;color:#c9a96e;font-size:28px}
  .esco-pedido{font-family:'Cormorant Garamond',serif;font-size:20px;color:#c9a96e;letter-spacing:.04em;margin:6px 0 16px}
  .esco-aviso{background:#0f0f0f;border:1px solid #1a1a1a;padding:14px 16px;font-size:12px;color:#a09888;
    line-height:1.6;margin-bottom:18px}
  /* Checkout en 2 columnas (paso "Datos"): resumen visual a la izquierda */
  #esCoModal.esco-wide{width:780px}
  .esco-cols{display:grid;grid-template-columns:290px 1fr}
  .esco-sum{background:#070707;border-right:1px solid #1a1a1a;padding:30px 24px;display:flex;flex-direction:column}
  .esco-sum-head{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#a09888;margin-bottom:18px}
  .esco-sum-list{flex:1;overflow-y:auto;max-height:340px}
  .esco-sum-item{display:grid;grid-template-columns:46px 1fr auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #141414}
  .esco-sum-thumb{width:46px;height:58px;background:#000;border:1px solid #1a1a1a;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .esco-sum-thumb img{max-width:100%;max-height:100%;object-fit:contain}
  .esco-sum-name{font-family:'Cormorant Garamond',serif;font-size:15px;color:#f5f0eb;line-height:1.15}
  .esco-sum-meta{font-size:10px;color:#a09888;letter-spacing:.04em;margin-top:3px}
  .esco-sum-price{font-size:12.5px;color:#c9a96e;white-space:nowrap}
  .esco-sum-total{display:flex;justify-content:space-between;align-items:baseline;padding-top:16px;margin-top:10px;border-top:1px solid #1a1a1a}
  .esco-sum-total span:first-child{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#a09888}
  .esco-sum-total span:last-child{font-family:'Cormorant Garamond',serif;font-size:30px;color:#fff}
  .esco-sum-benefits{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}
  .esco-sum-benefits li{position:relative;padding-left:22px;font-size:11px;letter-spacing:.05em;color:#c9a96e;line-height:1.35}
  .esco-sum-benefits li::before{content:'\\2713';position:absolute;left:0;top:0;color:#c9a96e;font-weight:700}
  @media(max-width:480px){.esco-pad{padding:28px 22px 26px}.esco-row{grid-template-columns:1fr}}
  @media(max-width:680px){
    #esCoModal.esco-wide{width:460px}
    .esco-cols{grid-template-columns:1fr}
    .esco-sum{border-right:none;border-bottom:1px solid #1a1a1a;padding:24px 22px}
    .esco-sum-list{max-height:170px}
  }
  `;

  let coBuilt = false;
  let coConfig = null;     // { culqiPublicKey, pagosActivos }
  let coDatos = null;      // datos validados del cliente

  function buildCheckout() {
    if (coBuilt) return;
    const style = document.createElement('style');
    style.id = 'esCoStyles';
    style.textContent = CSS_CHECKOUT;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="esCoOverlay"></div>
      <div id="esCoModal" role="dialog" aria-modal="true" aria-label="Finalizar compra">
        <button class="esco-x" id="escoX" aria-label="Cerrar">&times;</button>
        <div id="escoBody"></div>
      </div>`;
    document.body.appendChild(wrap);
    document.getElementById('esCoOverlay').addEventListener('click', cerrarCheckout);
    document.getElementById('escoX').addEventListener('click', cerrarCheckout);
    coBuilt = true;
  }

  function abrirCheckout() {
    document.getElementById('esCoOverlay').classList.add('open');
    document.getElementById('esCoModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function cerrarCheckout() {
    if (!coBuilt) return;
    document.getElementById('esCoOverlay').classList.remove('open');
    document.getElementById('esCoModal').classList.remove('open');
    document.body.style.overflow = '';
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── Paso 1: datos del cliente ──
  function renderDatos() {
    const body = document.getElementById('escoBody');
    document.getElementById('esCoModal').classList.add('esco-wide');
    const d = coDatos || {};
    // Columna izquierda: visualización de lo que se va a comprar
    const resumen = getCart().map((it) => {
      const col = ETIQUETA_COLECCION[normalizarTier(it.coleccion)] || '';
      const img = it.imagen ? `<img src="${it.imagen}" alt="${esc(it.nombre)}">` : '';
      return `
        <div class="esco-sum-item">
          <div class="esco-sum-thumb">${img}</div>
          <div class="esco-sum-info">
            <div class="esco-sum-name">${esc(it.nombre)}</div>
            <div class="esco-sum-meta">${it.talla}ml${col ? ' · ' + col : ''} × ${it.cantidad}</div>
          </div>
          <div class="esco-sum-price">${money(it.precio * it.cantidad)}</div>
        </div>`;
    }).join('');
    body.innerHTML = `
      <div class="esco-cols">
        <aside class="esco-sum">
          <div class="esco-sum-head">Tu pedido</div>
          <div class="esco-sum-list">${resumen}</div>
          <div class="esco-sum-total"><span>Total</span><span>${money(getTotal())}</span></div>
          <ul class="esco-sum-benefits">
            <li>Envío gratis a todo Lima</li>
            <li>Pago 100% seguro vía Culqi</li>
            <li>Recíbelo en 5 días</li>
            <li>Garantía 24h</li>
          </ul>
        </aside>
        <div class="esco-formcol">
          <div class="esco-pad">
            <div class="esco-steps"><b>1 · Datos</b> <span>→</span> <span>2 · Pago</span></div>
            <div class="esco-title">Finalizar compra</div>
            <div class="esco-sub">Completa tus datos de entrega</div>
            <form id="escoForm" novalidate>
              <div class="esco-field">
                <label>Nombre completo</label>
                <input name="nombre" type="text" value="${esc(d.nombre)}" placeholder="Tu nombre y apellido">
              </div>
              <div class="esco-row">
                <div class="esco-field">
                  <label>Email</label>
                  <input name="email" type="email" value="${esc(d.email)}" placeholder="tucorreo@email.com">
                </div>
                <div class="esco-field">
                  <label>Teléfono (9 dígitos)</label>
                  <input name="telefono" type="tel" inputmode="numeric" maxlength="9" value="${esc(d.telefono)}" placeholder="9XXXXXXXX">
                </div>
              </div>
              <div class="esco-field">
                <label>Distrito</label>
                <select name="distrito">
                  <option value="">Selecciona tu distrito</option>
                  ${DISTRITOS.map((x) => `<option value="${esc(x)}"${d.distrito === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}
                </select>
              </div>
              <div class="esco-field">
                <label>Dirección completa</label>
                <input name="direccion" type="text" value="${esc(d.direccion)}" placeholder="Av. / Calle, número, dpto.">
              </div>
              <div class="esco-field">
                <label>Referencia (opcional)</label>
                <input name="referencia" type="text" value="${esc(d.referencia)}" placeholder="Cerca de…">
              </div>
              <p class="esco-err" id="escoErr"></p>
              <button class="esco-btn" type="submit">Continuar al pago</button>
            </form>
          </div>
        </div>
      </div>`;

    document.getElementById('escoForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const datos = {
        nombre: f.nombre.value.trim(),
        email: f.email.value.trim(),
        telefono: f.telefono.value.replace(/\s/g, ''),
        distrito: f.distrito.value,
        direccion: f.direccion.value.trim(),
        referencia: f.referencia.value.trim(),
      };
      const err = document.getElementById('escoErr');
      if (!datos.nombre) return (err.textContent = 'Ingresa tu nombre completo.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) return (err.textContent = 'Ingresa un email válido.');
      if (!/^\d{9}$/.test(datos.telefono)) return (err.textContent = 'El teléfono debe tener 9 dígitos.');
      if (!datos.distrito) return (err.textContent = 'Selecciona tu distrito.');
      if (!datos.direccion) return (err.textContent = 'Ingresa tu dirección.');
      err.textContent = '';
      coDatos = datos;
      renderPago();
    });
  }

  // ── Paso 2: pago con Culqi ──
  async function renderPago() {
    const body = document.getElementById('escoBody');
    document.getElementById('esCoModal').classList.remove('esco-wide');
    body.innerHTML = `
      <div class="esco-pad">
        <div class="esco-steps"><span>1 · Datos</span> <span>→</span> <b>2 · Pago</b></div>
        <div class="esco-title">Pago seguro</div>
        <div class="esco-sub">Tarjeta de crédito o débito · Culqi</div>
        <div class="esco-resumen"><span class="lbl">Total a pagar</span><span class="val">${money(getTotal())}</span></div>
        <div id="escoPagoArea"></div>
        <button class="esco-back" id="escoBack">← Volver a mis datos</button>
      </div>`;
    document.getElementById('escoBack').addEventListener('click', renderDatos);

    const area = document.getElementById('escoPagoArea');
    // Cargar config (llave pública) si aún no
    if (!coConfig) {
      try {
        coConfig = await (await fetch('/api/config', { cache: 'no-store' })).json();
      } catch (e) { coConfig = { culqiPublicKey: '', pagosActivos: false }; }
    }

    if (!coConfig.culqiPublicKey) {
      area.innerHTML = `
        <div class="esco-aviso">💳 Estamos activando los pagos con tarjeta. Tus datos quedaron listos;
        vuelve muy pronto para completar tu compra, o escríbenos por WhatsApp al
        <strong style="color:#c9a96e">+51 901 875 125</strong> para coordinarlo ahora.</div>`;
      return;
    }

    area.innerHTML = `<button class="esco-btn" id="escoPay">Pagar ${money(getTotal())} con tarjeta</button>
      <p class="esco-note" id="escoPayNote">Se abrirá la ventana segura de Culqi.</p>`;
    document.getElementById('escoPay').addEventListener('click', abrirCulqi);
  }

  function loadCulqi() {
    return new Promise((resolve, reject) => {
      if (window.Culqi) return resolve();
      const s = document.createElement('script');
      s.src = 'https://checkout.culqi.com/js/v4';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Culqi'));
      document.head.appendChild(s);
    });
  }

  async function abrirCulqi() {
    const note = document.getElementById('escoPayNote');
    try {
      if (note) note.textContent = 'Abriendo pago seguro…';
      await loadCulqi();
      window.Culqi.publicKey = coConfig.culqiPublicKey;
      window.Culqi.settings({
        title: 'Esencia',
        currency: 'PEN',
        amount: Math.round(getTotal() * 100), // en céntimos
      });
      // Callback global que Culqi invoca al cerrar su modal
      window.culqi = function () {
        if (window.Culqi.token) {
          // Cierra el modal de Culqi para que se vea de inmediato nuestra
          // pantalla de "Procesando…" y luego la confirmación del pedido.
          try { window.Culqi.close(); } catch (e) {}
          procesarPago(window.Culqi.token.id);
        } else if (window.Culqi.error) {
          const msg = window.Culqi.error.user_message || 'No se pudo procesar el pago.';
          if (note) note.textContent = msg;
        }
      };
      window.Culqi.open();
    } catch (e) {
      if (note) note.textContent = 'No se pudo iniciar el pago. Revisa tu conexión.';
    }
  }

  function renderProcesando() {
    document.getElementById('esCoModal').classList.remove('esco-wide');
    document.getElementById('escoBody').innerHTML = `
      <div class="esco-pad esco-center">
        <div class="esco-spinner"></div>
        <div class="esco-title">Procesando tu pedido…</div>
        <div class="esco-sub">No cierres esta ventana.</div>
      </div>`;
  }

  async function procesarPago(token) {
    renderProcesando();
    let resp;
    try {
      resp = await fetch('/api/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          monto: getTotal(),
          nombre: coDatos.nombre,
          email: coDatos.email,
          telefono: coDatos.telefono,
          distrito: coDatos.distrito,
          direccion: coDatos.direccion,
          referencia: coDatos.referencia,
          items: getCart(),
        }),
      });
    } catch (e) {
      return renderError('Hubo un problema de conexión. Tu tarjeta NO fue cobrada.');
    }
    let data = {};
    try { data = await resp.json(); } catch (e) {}
    if (resp.ok && data.ok) {
      renderExito(data);
    } else {
      renderError(data.error || 'No se pudo completar el pedido. Intenta nuevamente.');
    }
  }

  function renderExito(data) {
    document.getElementById('esCoModal').classList.remove('esco-wide');
    const items = getCart();
    const total = getTotal();
    const resumen = items.map((it) =>
      `<div style="display:flex;justify-content:space-between;font-size:13px;color:#a09888;padding:6px 0">
         <span>${esc(it.nombre)} · ${it.talla}ml ×${it.cantidad}</span>
         <span style="color:#c9a96e">${money(it.precio * it.cantidad)}</span>
       </div>`).join('');
    document.getElementById('escoBody').innerHTML = `
      <div class="esco-pad esco-center">
        <div class="esco-check">✓</div>
        <div class="esco-title">¡Pedido confirmado!</div>
        <div class="esco-pedido">${esc(data.pedido_id)}</div>
        <div style="text-align:left;margin:8px 0 18px">${resumen}
          <div style="display:flex;justify-content:space-between;border-top:1px solid #1a1a1a;margin-top:8px;padding-top:10px">
            <span style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#a09888">Total</span>
            <span style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#f5f0eb">${money(total)}</span>
          </div>
        </div>
        <p class="esco-note">Recibirás un email de confirmación en <strong style="color:#f5f0eb">${esc(coDatos.email)}</strong>.
        Te contactaremos para coordinar la entrega gratuita en Lima.</p>
        <button class="esco-btn" id="escoDone" style="margin-top:20px">Seguir explorando</button>
      </div>`;
    clearCart();             // vacía el carrito tras el pago exitoso
    document.getElementById('escoDone').addEventListener('click', () => {
      cerrarCheckout();
      closeCart();
    });
  }

  function renderError(mensaje) {
    document.getElementById('esCoModal').classList.remove('esco-wide');
    document.getElementById('escoBody').innerHTML = `
      <div class="esco-pad esco-center">
        <div class="esco-check" style="border-color:#c84545;color:#c84545">!</div>
        <div class="esco-title">No se completó el pago</div>
        <p class="esco-note" style="margin:10px 0 20px">${esc(mensaje)}</p>
        <button class="esco-btn" id="escoRetry">Reintentar</button>
        <button class="esco-back" id="escoCancel">Cerrar</button>
      </div>`;
    document.getElementById('escoRetry').addEventListener('click', renderPago);
    document.getElementById('escoCancel').addEventListener('click', cerrarCheckout);
  }

  // Punto de entrada (lo llama el botón "Finalizar compra" del mini-carrito)
  function iniciarCheckout() {
    if (getCart().length === 0) return;
    buildCheckout();
    closeCart();
    renderDatos();
    abrirCheckout();
  }
  window.iniciarCheckout = iniciarCheckout;

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
