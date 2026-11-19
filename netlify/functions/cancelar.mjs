import { rpc } from "../lib/db.mjs";
import { json } from "../lib/entorno.mjs";
import { reembolsar } from "../lib/mercadopago.mjs";
import { reservaConToken, reservaPublica, infoCancelacion } from "../lib/reservas.mjs";
import { enviarCorreo, correoCancelacion, correoAdmin, esc, fechaCorta } from "../lib/correo.mjs";

// POST /api/cancelar {r, t}: cancela y devuelve el % configurado al mismo medio de pago
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const r = await reservaConToken(b.r, b.t);
    if (!r) return json({ error: "No encontramos esta reserva." }, 404);
    const info = infoCancelacion(r);
    if (!info.cancelable) return json({ error: info.motivo }, 409);
    let reembolsoId = null, pendiente = false, detalle = "";
    try { reembolsoId = String((await reembolsar(r.mp_pago, info.monto, "cancelacion-" + r.id)).id || ""); }
    catch (e) { pendiente = true; detalle = "<p><b>La devolución automática falló: devuelve S/" + info.monto + " a mano desde Mercado Pago.</b></p><p>" + esc(String(e.message).slice(0, 200)) + "</p>"; }
    const c = await rpc("api_cancelar", { p_id: r.id, p_monto: info.monto, p_reembolso: reembolsoId, p_pendiente: pendiente });
    if (!c.ok) return json({ error: "Esta reserva ya no está activa." }, 409);
    await enviarCorreo(correoCancelacion(r, info.monto, pendiente));
    await enviarCorreo({ para: r.cuidador.email, asunto: "Reserva " + r.codigo + " cancelada",
      html: "<p>La reserva " + esc(r.codigo) + " del " + fechaCorta(r.ingreso) + " al " + fechaCorta(r.salida) + " fue cancelada por el cliente. Esas plazas vuelven a estar libres.</p>" });
    await enviarCorreo(correoAdmin("Reserva cancelada", r, "<p>Devolución: S/" + info.monto + (pendiente ? " (pendiente, hazla a mano)" : " (automática)") + ".</p>" + detalle));
    return json({ ok: true, monto: info.monto, pendiente, reserva: reservaPublica(await reservaConToken(b.r, b.t)) });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos cancelar. Intenta de nuevo en un momento." }, 500);
  }
};
export const config = { path: "/api/cancelar" };
