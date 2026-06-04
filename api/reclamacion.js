/* ============================================================
   ESENCIA — /api/reclamacion  (Vercel serverless, Node.js)
   ------------------------------------------------------------
   Libro de Reclamaciones (INDECOPI, Ley N° 29571):
     1. Valida el formulario
     2. Genera número de caso: REC-AAAAMMDD-XXXX
     3. Guarda en Notion (colección Reclamaciones)
     4. Envía email de confirmación al cliente (Resend)
     5. Devuelve { ok, caso_id } o { ok:false, error }
   Env: NOTION_API_KEY, RESEND_API_KEY, DOMAIN
   Opcionales: EMAIL_FROM, NOTION_RECLAMOS_PAGE_ID (default = CRM)
   ============================================================ */
const NOTION_PAGE_ID =
  process.env.NOTION_RECLAMOS_PAGE_ID || process.env.NOTION_CRM_PAGE_ID || '37099375-f8fb-815e-bc62-e4262bb4012f';
const NOTION_VERSION = '2022-06-28';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Esencia <pedidos@esencia.pe>';

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

async function getBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function generarCasoId() {
  const d = new Date();
  const f = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `REC-${f}-${r}`;
}

const esc = (s) => String(s == null ? '' : s);
function rt(s) { return [{ type: 'text', text: { content: esc(s) } }]; }
function tableRow(cells) { return { type: 'table_row', table_row: { cells: cells.map(rt) } }; }

async function guardarNotion({ casoId, datos }) {
  const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
  const rows = [
    tableRow(['Campo', 'Valor']),
    tableRow(['N° de caso', casoId]),
    tableRow(['Fecha', fecha]),
    tableRow(['Tipo', datos.tipo]),
    tableRow(['Nombre', datos.nombre]),
    tableRow(['DNI', datos.dni]),
    tableRow(['Email', datos.email]),
    tableRow(['Teléfono', datos.telefono]),
    tableRow(['Producto/Pedido', datos.producto || '—']),
    tableRow(['Estado', '🟡 Pendiente']),
  ];
  const body = {
    parent: { type: 'page_id', page_id: NOTION_PAGE_ID },
    properties: { title: { title: rt(`📋 ${datos.tipo} ${casoId} — ${datos.nombre}`) } },
    children: [
      { object: 'block', type: 'heading_2', heading_2: { rich_text: rt('Datos del reclamante') } },
      { object: 'block', type: 'table', table: { table_width: 2, has_column_header: true, has_row_header: false, children: rows } },
      { object: 'block', type: 'heading_2', heading_2: { rich_text: rt('Descripción del ' + datos.tipo.toLowerCase()) } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: rt(datos.descripcion) } },
      { object: 'block', type: 'heading_2', heading_2: { rich_text: rt('Solución solicitada') } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: rt(datos.solucion) } },
    ],
  };
  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Notion ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

function emailHtml({ casoId, datos }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head>
  <body style="margin:0;background:#000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#050505;border:1px solid #1a1a1a">
          <tr><td style="padding:38px 36px 24px;text-align:center;border-bottom:1px solid #1a1a1a">
            <div style="font-family:Georgia,serif;font-size:28px;letter-spacing:7px;color:#c9a96e">ESENCIA</div>
            <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#5a5248;margin-top:8px">Libro de Reclamaciones</div>
          </td></tr>
          <tr><td style="padding:34px 36px 10px">
            <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c9a96e;margin-bottom:12px">Reclamo recibido</div>
            <p style="color:#f5f0eb;font-family:Georgia,serif;font-size:22px;margin:0 0 6px">Hola, ${esc(datos.nombre)}.</p>
            <p style="color:#a09888;font-size:14px;line-height:1.7;margin:10px 0 0">
              Hemos recibido tu <strong style="color:#f5f0eb">${esc(datos.tipo).toLowerCase()}</strong>. Tu número de caso es:
            </p>
            <div style="font-family:Georgia,serif;font-size:24px;color:#c9a96e;letter-spacing:2px;margin:14px 0 4px">${casoId}</div>
          </td></tr>
          <tr><td style="padding:14px 36px 8px">
            <div style="background:#0a0a0a;border:1px solid #1a1a1a;padding:18px 20px">
              <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5a5248;margin-bottom:8px">Lo que registramos</div>
              <div style="color:#a09888;font-size:13px;line-height:1.7">${esc(datos.descripcion)}</div>
            </div>
          </td></tr>
          <tr><td style="padding:18px 36px 8px">
            <p style="color:#a09888;font-size:13.5px;line-height:1.7;margin:0">
              De acuerdo con el Código de Protección y Defensa del Consumidor (Ley N° 29571), te responderemos en un plazo máximo de
              <strong style="color:#f5f0eb">30 días calendario</strong>.
            </p>
          </td></tr>
          <tr><td style="padding:24px 36px;text-align:center;border-top:1px solid #1a1a1a">
            <div style="color:#5a5248;font-size:12px;line-height:1.8">
              WhatsApp +51 901 875 125 · infoesencia.pe@gmail.com<br>Lima, Perú
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

async function enviarEmail({ casoId, datos }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: datos.email,
      subject: `Hemos recibido tu reclamo ${casoId} — Esencia`,
      html: emailHtml({ casoId, datos }),
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  if (allowed && origin && origin !== allowed) return res.status(403).json({ ok: false, error: 'Origen no permitido' });

  try {
    const b = (await getBody(req)) || {};
    const datos = {
      nombre: String(b.nombre || '').trim(),
      dni: String(b.dni || '').replace(/\D/g, ''),
      email: String(b.email || '').trim(),
      telefono: String(b.telefono || '').trim(),
      tipo: b.tipo === 'Queja' ? 'Queja' : (b.tipo === 'Reclamo' ? 'Reclamo' : ''),
      producto: String(b.producto || '').trim(),
      descripcion: String(b.descripcion || '').trim(),
      solucion: String(b.solucion || '').trim(),
    };
    // Validación
    if (!datos.nombre) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
    if (!/^\d{8}$/.test(datos.dni)) return res.status(400).json({ ok: false, error: 'El DNI debe tener 8 dígitos.' });
    if (!isEmail(datos.email)) return res.status(400).json({ ok: false, error: 'El email no es válido.' });
    if (!datos.telefono) return res.status(400).json({ ok: false, error: 'El teléfono es obligatorio.' });
    if (!datos.tipo) return res.status(400).json({ ok: false, error: 'Selecciona Reclamo o Queja.' });
    if (datos.descripcion.length < 20) return res.status(400).json({ ok: false, error: 'La descripción debe tener al menos 20 caracteres.' });
    if (!datos.solucion) return res.status(400).json({ ok: false, error: 'Indica la solución solicitada.' });

    const casoId = generarCasoId();
    const warnings = [];

    try { await guardarNotion({ casoId, datos }); }
    catch (e) { console.error('[reclamacion] Notion falló:', e.message); warnings.push('notion'); }

    try { await enviarEmail({ casoId, datos }); }
    catch (e) { console.error('[reclamacion] Resend falló:', e.message); warnings.push('email'); }

    return res.status(200).json({ ok: true, caso_id: casoId, warnings });
  } catch (e) {
    console.error('[reclamacion] Error interno:', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}
