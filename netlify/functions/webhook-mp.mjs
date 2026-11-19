import { json, env } from "../lib/entorno.mjs";
import { firmaValida } from "../lib/mercadopago.mjs";
import { procesarPago } from "../lib/reservas.mjs";

// POST /api/webhook-mp: Mercado Pago avisa aquí cada pago
export default async (req) => {
  const u = new URL(req.url);
  let cuerpo = {};
  try { cuerpo = await req.json(); } catch {}
  const tipo = u.searchParams.get("type") || u.searchParams.get("topic") || cuerpo.type || cuerpo.topic;
  const dataId = u.searchParams.get("data.id") || u.searchParams.get("id") || (cuerpo.data && cuerpo.data.id);
  if (!firmaValida(req.headers.get("x-signature"), req.headers.get("x-request-id"), u.searchParams.get("data.id") || dataId, env("MP_WEBHOOK_SECRET"))) {
    return json({ error: "firma inválida" }, 401);
  }
  if (tipo !== "payment" || !dataId) return json({ ok: true, ignorado: true });
  try {
    const r = await procesarPago(String(dataId));
    return json({ ok: true, ...r });
  } catch (e) {
    // Pago inexistente (por ejemplo, el botón "Simular" del panel de Mercado Pago): no hay nada que reintentar
    if (e.estado === 404) return json({ ok: true, ignorado: "pago no encontrado" });
    console.error(e);
    return json({ error: "reintentar" }, 500); // Mercado Pago reintenta si no respondemos 200
  }
};
export const config = { path: "/api/webhook-mp" };
