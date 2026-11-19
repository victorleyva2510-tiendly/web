import { json } from "../lib/entorno.mjs";
import { reservaConToken, reservaPublica, procesarPago, infoCancelacion } from "../lib/reservas.mjs";
import { obtenerPago } from "../lib/mercadopago.mjs";
import { rpc } from "../lib/db.mjs";

// GET /api/reserva?r=&t=&payment_id=  (la vuelta desde Mercado Pago y "Mis reservas" consultan aquí)
export default async (req) => {
  try {
    const u = new URL(req.url);
    const id = u.searchParams.get("r"), token = u.searchParams.get("t");
    let r = await reservaConToken(id, token);
    if (!r) return json({ error: "No encontramos esta reserva." }, 404);
    const pagoId = u.searchParams.get("payment_id");
    // Respaldo por si el aviso de Mercado Pago tarda: confirmamos con el pago que trae la URL de vuelta
    if (r.estado === "pendiente_pago" && pagoId && /^\d+$/.test(pagoId)) {
      try {
        const p = await procesarPago(pagoId);
        // Pago rechazado: soltamos el cupo para que el cliente pueda reintentar sin esperar los minutos de reserva
        if (p.resultado === "pago_rejected" && (await obtenerPago(pagoId)).external_reference === r.id) await rpc("api_liberar", { p_id: r.id });
      } catch (e) { console.error(e); }
      r = await reservaConToken(id, token);
    }
    return json({ reserva: reservaPublica(r), cancelacion: infoCancelacion(r) });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos consultar tu reserva." }, 500);
  }
};
export const config = { path: "/api/reserva" };
