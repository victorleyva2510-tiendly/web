import { rpc } from "./db.mjs";
import { obtenerPago, reembolsar } from "./mercadopago.mjs";
import { enviarCorreo, correoCliente, correoCuidador, correoAdmin, correoSinCupo } from "./correo.mjs";
import { hoyLima, igualSeguro } from "./entorno.mjs";
import { sumarDias } from "./precios.mjs";

export async function reservaConToken(id, token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return null;
  const r = await rpc("api_reserva", { p_id: id });
  if (!r || !igualSeguro(r.token, token)) return null;
  return r;
}
export function estadoVisible(r, hoy = hoyLima()) {
  if (r.estado !== "pagada") return r.estado;
  if (hoy >= r.salida) return "completada";
  if (hoy >= r.ingreso) return "en_curso";
  return "pagada";
}
export function infoCancelacion(r, hoy = hoyLima()) {
  const limite = sumarDias(r.ingreso, -7);
  const monto = Math.round((Number(r.total) * r.reembolso_pct) / 100);
  if (estadoVisible(r, hoy) !== "pagada") return { cancelable: false, limite, monto, motivo: "Esta reserva ya no está activa para cancelar." };
  if (r.politica !== "siete") return { cancelable: false, limite, monto, motivo: "Esta reserva no admite cancelaciones." };
  if (hoy > limite) return { cancelable: false, limite, monto, motivo: "El plazo para cancelar terminó el " + limite + "." };
  return { cancelable: true, limite, monto };
}
// Vista segura para el navegador: sin costos del cuidador ni datos internos
export function reservaPublica(r) {
  const pagada = r.estado === "pagada";
  return { id: r.id, codigo: r.codigo, estado: estadoVisible(r), ingreso: r.ingreso, salida: r.salida, noches: r.noches, perros: r.perros, total: Number(r.total),
    detalle: r.detalle, primeraVez: r.primera_vez, perro: r.huespedes.map((h) => h.nombre).join(" y "), email: r.email,
    casa: { id: r.cuidador.id, nombrePublico: r.cuidador.nombre_publico, distrito: r.cuidador.distrito, horaReporte: r.cuidador.hora_reporte, direccion: pagada ? r.cuidador.direccion : null },
    politica: r.politica, reembolsoPct: r.reembolso_pct, reembolsoMonto: r.reembolso_monto != null ? Number(r.reembolso_monto) : null };
}
// Confirma un pago consultándolo directo a Mercado Pago. Se puede llamar varias veces sin duplicar nada.
export async function procesarPago(pagoId) {
  const pago = await obtenerPago(pagoId);
  const id = pago.external_reference;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { resultado: "sin_referencia" };
  if (pago.status !== "approved") return { resultado: "pago_" + pago.status };
  let r = await rpc("api_reserva", { p_id: id });
  if (!r) return { resultado: "no_existe" };
  if (pago.currency_id !== "PEN" || Math.abs(Number(pago.transaction_amount) - Number(r.total)) > 0.01) {
    await enviarCorreo(correoAdmin("Revisar: el monto pagado no coincide", r, `<p>Mercado Pago informó ${pago.currency_id} ${pago.transaction_amount}.</p>`));
    return { resultado: "monto_distinto" };
  }
  const m = await rpc("api_marcar_pagada", { p_id: id, p_pago: String(pago.id) });
  r = await rpc("api_reserva", { p_id: id });
  if (m.resultado === "ok" || m.resultado === "ya_pagada") {
    if ((await rpc("api_marcar_avisos", { p_id: id })) === true) {
      await enviarCorreo(correoCliente(r));
      await enviarCorreo(correoCuidador(r));
      await enviarCorreo(correoAdmin("Nueva reserva pagada", r));
    }
    return { resultado: "pagada" };
  }
  if (m.resultado === "sin_cupo") {
    let extra = "<p>Se devolvió el 100% automáticamente.</p>";
    try { await reembolsar(pago.id, null, "sin-cupo-" + id); }
    catch (e) { extra = "<p><b>No se pudo devolver automáticamente: hazlo a mano desde Mercado Pago.</b></p>"; }
    if ((await rpc("api_marcar_avisos", { p_id: id })) === true) {
      await enviarCorreo(correoSinCupo(r));
      await enviarCorreo(correoAdmin("Pago devuelto por falta de cupo", r, extra));
    }
    return { resultado: "sin_cupo" };
  }
  return { resultado: m.resultado };
}
