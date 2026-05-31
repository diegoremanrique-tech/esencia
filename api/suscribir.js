/* ============================================================
   ESENCIA — /api/suscribir  (Vercel serverless)
   ------------------------------------------------------------
   Captura el email del popup del home y crea una subpágina de
   contacto dentro del CRM de Notion. Best-effort: si Notion no
   está configurado, responde ok igualmente para no romper la UX.
   Env: NOTION_API_KEY, DOMAIN. Opcional: NOTION_CRM_PAGE_ID.
   ============================================================ */
const NOTION_CRM_PAGE_ID =
  process.env.NOTION_CRM_PAGE_ID || '37099375-f8fb-815e-bc62-e4262bb4012f';
const NOTION_VERSION = '2022-06-28';

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

async function getBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function rt(s) { return [{ type: 'text', text: { content: String(s == null ? '' : s) } }]; }

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
  if (allowed && origin && origin !== allowed) {
    return res.status(403).json({ ok: false, error: 'Origen no permitido' });
  }

  try {
    const { email, origen } = (await getBody(req)) || {};
    if (!isEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Email no válido.' });
    }

    // Si Notion no está configurado, no fallamos (mejor UX)
    if (!process.env.NOTION_API_KEY) {
      return res.status(200).json({ ok: true, guardado: false });
    }

    const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const body = {
      parent: { type: 'page_id', page_id: NOTION_CRM_PAGE_ID },
      properties: { title: { title: rt(`📩 Suscriptor — ${email}`) } },
      children: [
        {
          object: 'block', type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: rt(`Email: ${email}`) },
        },
        {
          object: 'block', type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: rt(`Origen: ${origen || 'popup home'}`) },
        },
        {
          object: 'block', type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: rt(`Fecha: ${fecha}`) },
        },
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
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      console.error('[suscribir] Notion falló:', r.status, err);
      // No exponemos el detalle; igual respondemos ok para la UX
      return res.status(200).json({ ok: true, guardado: false });
    }
    return res.status(200).json({ ok: true, guardado: true });
  } catch (e) {
    console.error('[suscribir] Error:', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}
