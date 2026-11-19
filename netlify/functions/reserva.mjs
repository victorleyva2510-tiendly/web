import { json } from "../lib/entorno.mjs";
import { reservaConToken, reservaPublica, procesarPago, infoCancelacion, estadoVisible } from "../lib/reservas.mjs";
import { obtenerPago } from "../lib/mercadopago.mjs";
import { rpc } from "../lib/db.mjs";
import { enviarCorreo, correoMensajeCuidador } from "../lib/correo.mjs";
import { MOTIVOS, recortar } from "../lib/texto.mjs";
import { urlFoto } from "../lib/panel-datos.mjs";

// GET /api/reserva?r=&t=&payment_id=  → la reserva, su chat y sus reportes (solo con el enlace privado)
// POST /api/reserva {r, t, accion: "mensaje" | "resena" | "incidencia", ...}
export default async (req) => {
  try {
    if (req.method === "POST") return await accion(req);
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
    const hilo = r.estado === "pagada" ? await rpc("api_hilo_reserva", { p_id: r.id }) : { mensajes: [], reportes: [] };
    hilo.reportes.forEach((p) => { p.fotos = (p.fotos || []).map(urlFoto); });
    return json({ reserva: reservaPublica(r), cancelacion: infoCancelacion(r), mensajes: hilo.mensajes, reportes: hilo.reportes,
      puedeResenar: estadoVisible(r) === "completada" && r.estrellas == null });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos consultar tu reserva." }, 500);
  }
};
export const config = { path: "/api/reserva" };

async function accion(req) {
  const b = await req.json().catch(() => ({}));
  const r = await reservaConToken(b.r, b.t);
  if (!r) return json({ error: "No encontramos esta reserva." }, 404);
  if (r.estado !== "pagada") return json({ error: "Esta reserva ya no está activa." }, 409);
  if (b.accion === "mensaje") {
    const texto = recortar(b.texto, 1500);
    if (!texto) return json({ error: "Escribe un mensaje." }, 422);
    const m = await rpc("api_mensaje", { p_reserva: r.id, p_de: "cliente", p_texto: texto, p_oculto: false });
    if (m.avisar && r.cuidador.email) await enviarCorreo(correoMensajeCuidador(r, texto));
  } else if (b.accion === "resena") {
    const n = Number(b.estrellas);
    if (!(Number.isInteger(n) && n >= 1 && n <= 5)) return json({ error: "Elige de 1 a 5 estrellas." }, 422);
    const ok = await rpc("api_resena", { p_reserva: r.id, p_estrellas: n, p_texto: recortar(b.texto, 1000) });
    if (ok !== true) return json({ error: "Esta estadía todavía no terminó o ya tiene reseña." }, 409);
  } else if (b.accion === "incidencia") {
    await rpc("api_incidencia", { p_reserva: r.id, p_de: "cliente", p_motivo: MOTIVOS.includes(b.motivo) ? b.motivo : "Otro", p_texto: recortar(b.texto, 2000), p_auto: false });
  } else return json({ error: "Acción no reconocida." }, 400);
  const hilo = await rpc("api_hilo_reserva", { p_id: r.id });
  hilo.reportes.forEach((p) => { p.fotos = (p.fotos || []).map(urlFoto); });
  const r2 = await reservaConToken(b.r, b.t);
  return json({ ok: true, reserva: reservaPublica(r2), cancelacion: infoCancelacion(r2), mensajes: hilo.mensajes, reportes: hilo.reportes,
    puedeResenar: estadoVisible(r2) === "completada" && r2.estrellas == null });
}
