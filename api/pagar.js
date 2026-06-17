/* ============================================================
   ESENCIA — /api/pagar  (Vercel serverless, Node.js)
   ------------------------------------------------------------
   Flujo:
     1. Valida el body
     2. Crea el cargo en Culqi v2
     3. Si aprueba → crea pedido en Notion (CRM) + email Resend
     4. Devuelve { ok, pedido_id } o { ok:false, error }
   Variables de entorno (NUNCA hardcodear):
     CULQI_SECRET_KEY, CULQI_PUBLIC_KEY, NOTION_API_KEY,
     NOTION_PEDIDOS_DB_ID, RESEND_API_KEY, DOMAIN
   Opcionales: EMAIL_FROM
   ============================================================ */

// ── Precios oficiales (espejo del frontend, para recalcular en
//    el servidor y NO confiar en el monto enviado por el cliente) ──
const PRECIOS = {
  nicho:     { 30: 45, 50: 70, 100: 88 },
  disenador: { 30: 42, 50: 65, 100: 84 },
  clasico:   { 30: 40, 50: 60, 100: 79 },
};
const ETIQUETA_COLECCION = { nicho: 'Nicho', disenador: 'Diseñador', clasico: 'Clásico' };

// Base de datos de Notion donde se crea cada pedido (📦 Pedidos).
// Se lee desde la variable de entorno NOTION_PEDIDOS_DB_ID.
const NOTION_VERSION = '2022-06-28';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Esencia <pedidos@esencia.pe>';

// ── Rate limiting básico en memoria (best-effort por instancia) ──
const RATE = new Map(); // ip -> [timestamps]
const RATE_MAX = 5;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hora

function normalizarTier(t) {
  if (!t) return 'disenador';
  const s = String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.startsWith('nich')) return 'nicho';
  if (s.startsWith('clas')) return 'clasico';
  return 'disenador';
}

// Mensajes en español según código de error de Culqi
const CULQI_ERRORS = {
  card_declined: 'Tu tarjeta fue rechazada por el banco.',
  insufficient_funds: 'Fondos insuficientes en la tarjeta.',
  expired_card: 'La tarjeta está vencida.',
  invalid_cvv: 'El código de seguridad (CVV) es incorrecto.',
  incorrect_cvv: 'El código de seguridad (CVV) es incorrecto.',
  invalid_expiry_month: 'La fecha de vencimiento es incorrecta.',
  invalid_expiry_year: 'La fecha de vencimiento es incorrecta.',
  processing_error: 'Hubo un error procesando la tarjeta. Intenta nuevamente.',
  fraudulent: 'La operación fue rechazada por seguridad.',
  stolen_card: 'La tarjeta fue reportada. Contacta a tu banco.',
  lost_card: 'La tarjeta fue reportada. Contacta a tu banco.',
  restricted_card: 'La tarjeta tiene restricciones. Contacta a tu banco.',
  card_not_supported: 'Esta tarjeta no está soportada.',
  issuer_not_available: 'El banco no está disponible. Intenta más tarde.',
};

function getIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
function rateLimited(ip) {
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  hits.push(now);
  RATE.set(ip, hits);
  return hits.length > RATE_MAX;
}

async function getBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
const isTel = (t) => /^\d{9}$/.test(String(t || '').replace(/\s/g, ''));

// Recalcula el total real desde los items (evita manipulación del cliente)
function calcularTotal(items) {
  let total = 0;
  for (const it of items) {
    const tier = normalizarTier(it.coleccion);
    const ml = Number(it.talla);
    const precio = (PRECIOS[tier] && PRECIOS[tier][ml]) || Number(it.precio) || 0;
    total += precio * (Number(it.cantidad) || 1);
  }
  return total;
}

function generarPedidoId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 3; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return 'ESC-' + Date.now().toString(36).toUpperCase() + '-' + r;
}

// ─────────────────────────────────────────────
//  CULQI
// ─────────────────────────────────────────────
async function crearCargoCulqi({ token, montoCents, email, descripcion }) {
  const r = await fetch('https://api.culqi.com/v2/charges', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CULQI_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: montoCents,
      currency_code: 'PEN',
      email,
      source_id: token,
      description: descripcion.slice(0, 80),
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.ok && data && data.id) {
    return { ok: true, chargeId: data.id };
  }
  // Error de tarjeta → mensaje en español
  const code = data.code || data.decline_code;
  const mensaje = data.user_message || CULQI_ERRORS[code] || 'No pudimos procesar el pago con tu tarjeta.';
  return { ok: false, error: mensaje, code };
}

// ─────────────────────────────────────────────
//  NOTION — crea cada pedido como ENTRADA en la base de datos
//  del CRM (NOTION_PEDIDOS_DB_ID). Columnas exactas de la DB.
// ─────────────────────────────────────────────
// Resumen de productos: "Nombre — Marca (50ml) x 2, Nombre2 — Marca2 (30ml) x 1"
function resumenProductos(items) {
  return (items || []).map((it) => {
    const ml = Number(it.talla);
    const cant = Number(it.cantidad) || 1;
    return `${it.nombre || ''}${it.marca ? ' — ' + it.marca : ''} (${ml}ml) x ${cant}`;
  }).join(', ');
}

async function crearPedidoNotion({ pedidoId, datos, items, total, chargeId }) {
  // Variables disponibles en el scope del bloque que escribe en Notion
  const pedido_id = pedidoId;
  const nombre = datos.nombre;
  const email = datos.email;
  const telefono = datos.telefono;
  const distrito = datos.distrito;
  const direccion = datos.direccion;
  const referencia = datos.referencia;
  const charge_id = chargeId;
  const productosResumen = resumenProductos(items);

  const notionRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_PEDIDOS_DB_ID },
      properties: {
        "Número de Pedido": {
          title: [{ text: { content: pedido_id } }]
        },
        "Estado": {
          select: { name: "🟡 Pendiente" }
        },
        "Cliente": {
          rich_text: [{ text: { content: nombre || "" } }]
        },
        "Email": {
          email: email || null
        },
        "Teléfono": {
          phone_number: telefono || null
        },
        "Distrito": {
          rich_text: [{ text: { content: distrito || "" } }]
        },
        "Dirección": {
          rich_text: [{ text: { content: direccion || "" } }]
        },
        "Referencia": {
          rich_text: [{ text: { content: referencia || "" } }]
        },
        "Total": {
          number: parseFloat(total) || 0
        },
        "Productos": {
          rich_text: [{ text: { content: productosResumen || "" } }]
        },
        "Culqi Charge ID": {
          rich_text: [{ text: { content: charge_id || "" } }]
        }
      }
    })
  });

  const notionData = await notionRes.json();
  if (!notionRes.ok) {
    console.error('[pagar] Notion falló:', JSON.stringify(notionData));
  }
  return notionData;
}

// ─────────────────────────────────────────────
//  RESEND (email de confirmación, estética luxury)
// ─────────────────────────────────────────────
function emailHtml({ pedidoId, datos, items, total }) {
  const filas = items.map((it) => {
    const tier = normalizarTier(it.coleccion);
    const ml = Number(it.talla);
    const precio = (PRECIOS[tier] && PRECIOS[tier][ml]) || Number(it.precio) || 0;
    const cant = Number(it.cantidad) || 1;
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;color:#f5f0eb;font-family:Georgia,serif;font-size:16px">
          ${it.nombre || ''} <span style="color:#5a5248;font-size:12px">· ${ml}ml</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;color:#a09888;font-size:13px;text-align:center">x${cant}</td>
        <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;color:#c9a96e;font-size:14px;text-align:right">S/ ${precio * cant}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light"></head>
<body bgcolor="#0a0a0a" style="margin:0;padding:0;background-color:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0a0a0a" style="background-color:#0a0a0a;padding:32px 16px">
    <tr><td align="center" bgcolor="#0a0a0a" style="background-color:#0a0a0a">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#050505" style="max-width:560px;background-color:#050505;border:1px solid #1a1a1a">
        <tr><td style="padding:40px 36px 28px;text-align:center;border-bottom:1px solid #1a1a1a">
          <div style="font-family:Georgia,serif;font-size:30px;letter-spacing:8px;color:#c9a96e">ESENCIA</div>
          <div style="font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#5a5248;margin-top:8px">Perfumes luxury · Lima</div>
        </td></tr>
        <tr><td style="padding:36px 36px 8px">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c9a96e;margin-bottom:14px">Pedido confirmado ✓</div>
          <div style="font-family:Georgia,serif;font-size:24px;color:#f5f0eb;line-height:1.3">Gracias, ${datos.nombre}.</div>
          <p style="color:#a09888;font-size:14px;line-height:1.7;margin:14px 0 0">
            Tu pedido <strong style="color:#c9a96e">#${pedidoId}</strong> fue confirmado. Lo preparamos con cuidado y te llega
            <strong style="color:#f5f0eb">gratis a todo Lima</strong>. Te contactaremos para coordinar la entrega.
          </p>
        </td></tr>
        <tr><td style="padding:24px 36px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}
            <tr>
              <td style="padding:18px 0 0;color:#a09888;font-size:11px;letter-spacing:2px;text-transform:uppercase">Total</td>
              <td></td>
              <td style="padding:18px 0 0;color:#f5f0eb;font-family:Georgia,serif;font-size:24px;text-align:right">S/ ${total}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 36px 36px">
          <div style="background:#0a0a0a;border:1px solid #1a1a1a;padding:18px 20px">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5a5248;margin-bottom:8px">Entrega</div>
            <div style="color:#f5f0eb;font-size:14px;line-height:1.6">${datos.direccion}</div>
            <div style="color:#a09888;font-size:13px">${datos.distrito}${datos.referencia ? ' · ' + datos.referencia : ''}</div>
            <div style="color:#a09888;font-size:13px;margin-top:4px">Tel: ${datos.telefono}</div>
          </div>
        </td></tr>
        <tr><td style="padding:24px 36px;text-align:center;border-top:1px solid #1a1a1a">
          <div style="color:#5a5248;font-size:12px;line-height:1.8">
            WhatsApp +51 901 875 125 · @somosesencia.pe<br>
            <a href="mailto:infoesencia.pe@gmail.com" style="color:#5a5248;text-decoration:none">infoesencia.pe@gmail.com</a> · Lima, Perú
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function enviarEmail({ pedidoId, datos, items, total }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: datos.email,
      subject: `Tu pedido Esencia #${pedidoId} fue confirmado ✓`,
      html: emailHtml({ pedidoId, datos, items, total }),
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Resend ${r.status}: ${err}`);
  }
  return r.json();
}

// ─────────────────────────────────────────────
//  HANDLER
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  const allowed = process.env.DOMAIN;
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', allowed || origin || '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }
  // CORS: solo aceptar desde DOMAIN (si está configurado)
  if (allowed && origin && origin !== allowed) {
    return res.status(403).json({ ok: false, error: 'Origen no permitido' });
  }
  // Rate limiting básico
  if (rateLimited(getIp(req))) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Intenta de nuevo en una hora.' });
  }

  try {
    const body = await getBody(req);
    const { token, nombre, email, telefono, distrito, direccion, referencia, items } = body || {};

    // 1. Validación
    if (!token) return res.status(400).json({ ok: false, error: 'Falta el token de pago.' });
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
    if (!isEmail(email)) return res.status(400).json({ ok: false, error: 'El email no es válido.' });
    if (!isTel(telefono)) return res.status(400).json({ ok: false, error: 'El teléfono debe tener 9 dígitos.' });
    if (!distrito) return res.status(400).json({ ok: false, error: 'Selecciona un distrito.' });
    if (!direccion || !String(direccion).trim()) return res.status(400).json({ ok: false, error: 'La dirección es obligatoria.' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ ok: false, error: 'El carrito está vacío.' });

    if (!process.env.CULQI_SECRET_KEY) {
      return res.status(503).json({ ok: false, error: 'Los pagos aún no están activos. Vuelve pronto.' });
    }

    const datos = { nombre: String(nombre).trim(), email: String(email).trim(), telefono: String(telefono).trim(), distrito, direccion: String(direccion).trim(), referencia: referencia ? String(referencia).trim() : '' };

    // Total real recalculado en el servidor
    const total = calcularTotal(items);
    const montoCents = Math.round(total * 100);
    const descripcion = `Esencia - ${items.length} producto(s)`;

    // 2. Cargo en Culqi
    const cargo = await crearCargoCulqi({ token, montoCents, email: datos.email, descripcion });
    if (!cargo.ok) {
      return res.status(402).json({ ok: false, error: cargo.error });
    }

    // 3. Pedido aprobado → ID
    const pedidoId = generarPedidoId();
    const warnings = [];

    // 3b. Notion (no bloquea el pedido si falla)
    try {
      await crearPedidoNotion({ pedidoId, datos, items, total, chargeId: cargo.chargeId });
    } catch (e) {
      console.error('[pagar] Notion falló:', e.message);
      warnings.push('notion');
    }
    // 3c. Email (no bloquea el pedido si falla)
    try {
      await enviarEmail({ pedidoId, datos, items, total });
    } catch (e) {
      console.error('[pagar] Resend falló:', e.message);
      warnings.push('email');
    }

    // 4. OK
    return res.status(200).json({ ok: true, pedido_id: pedidoId, total, warnings });
  } catch (e) {
    console.error('[pagar] Error interno:', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}
