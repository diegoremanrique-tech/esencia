/* ============================================================
   ESENCIA — /api/config  (Vercel serverless)
   ------------------------------------------------------------
   Entrega al frontend la llave PÚBLICA de Culqi (es pública por
   diseño). En un sitio estático no podemos inyectar process.env
   en el HTML, así que carrito.js pide esta config antes de abrir
   el checkout. Si la llave no está configurada todavía, devuelve
   cadena vacía y el frontend muestra "pagos en activación".
   ============================================================ */
export default function handler(req, res) {
  const allowed = process.env.DOMAIN;
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', allowed || origin || '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  return res.status(200).json({
    ok: true,
    culqiPublicKey: process.env.CULQI_PUBLIC_KEY || '',
    // true cuando Culqi ya está configurado en Vercel
    pagosActivos: Boolean(process.env.CULQI_PUBLIC_KEY && process.env.CULQI_SECRET_KEY),
  });
}
