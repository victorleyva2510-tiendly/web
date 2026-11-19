import { rpc } from "./db.mjs";
import { env, sitio } from "./entorno.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","set","oct","nov","dic"];
export const fechaCorta = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number); return d + " " + MESES[m - 1] + " " + a; };
export const soles = (n) => "S/" + Math.round(Number(n)).toLocaleString("es-PE");
const nombres = (r) => r.huespedes.map((h) => h.nombre).join(" y ");

export async function enviarCorreo({ para, asunto, html }) {
  const clave = env("RESEND_API_KEY");
  const de = env("EMAIL_REMITENTE", "Hospedoggy <onboarding@resend.dev>");
  if (!clave || !para) { console.log("[correo no enviado: falta clave o destinatario]", asunto, "->", para); return { omitido: true }; }
  // Mientras no verifiques tu dominio en Resend, solo se puede enviar a tu propio correo:
  // te llega a ti con el destinatario real en el asunto, para que lo reenvíes.
  const admin = env("EMAIL_ADMIN");
  let destino = [].concat(para);
  if (/resend\.dev/i.test(de) && admin && destino.some((d) => d.toLowerCase() !== admin.toLowerCase())) {
    asunto = "[Reenviar a " + destino.join(", ") + "] " + asunto; destino = [admin];
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + clave, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: destino, subject: asunto, html })
    });
    if (!res.ok) console.error("Error al enviar correo", res.status, await res.text());
    await registrar(destino.join(", "), asunto, res.ok);
    return { ok: res.ok };
  } catch (e) { console.error("Error al enviar correo", e.message); await registrar(destino.join(", "), asunto, false); return { ok: false }; }
}
// Registro para la pestaña "Avisos enviados" del panel (si falla, el correo igual se envió)
async function registrar(para, asunto, ok) { try { await rpc("api_aviso", { p_para: para, p_asunto: asunto, p_ok: ok }); } catch (e) {} }
function marco(titulo, cuerpo) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f7f4ec;font-family:Arial,Helvetica,sans-serif;color:#1b2a4a">
<div style="max-width:560px;margin:0 auto;padding:24px"><div style="font-weight:800;font-size:22px;margin-bottom:16px">Hospedoggy</div>
<div style="background:#ffffff;border:1px solid #e4dfd2;border-radius:16px;padding:24px"><h1 style="font-size:22px;margin:0 0 12px">${esc(titulo)}</h1>${cuerpo}</div>
<p style="font-size:12px;color:#4b5670;margin-top:16px">Hospedaje para perros con cuidadores verificados. Lima, Perú.</p></div></body></html>`;
}
const fila = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#4b5670;vertical-align:top">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`;
const tabla = (f) => `<table style="border-collapse:collapse;font-size:15px;margin:8px 0 16px">${f.join("")}</table>`;
const comportamiento = (h) => h.comportamiento.concat(h.comportamientoOtro ? [h.comportamientoOtro] : []).join(", ");
function fichaPerros(r) {
  return r.huespedes.map((h) => `<div style="border-top:1px solid #e4dfd2;padding-top:10px;margin-top:10px"><b style="font-size:16px">${esc(h.nombre)}</b>${tabla([
    fila("Edad", h.edad), fila("Raza / tamaño", h.raza + " / " + h.tamano), fila("Sexo", h.sexo),
    fila("Medicamento o condición", h.medicamento === "Sí" ? h.medicamentoDetalle : "No"), fila("Alimentación", h.alimentacion),
    fila("Juguetes o artículos", h.juguetes || "Ninguno"), fila("Comportamiento", comportamiento(h)), fila("Sociable con otros perros", h.sociable)])}</div>`).join("");
}
function desglose(r) {
  const d = r.detalle;
  const f = d.detalle.map((x) => fila(x.noches + (x.noches === 1 ? " noche" : " noches") + (x.alta ? " de temporada alta" : "") + " × " + soles(x.precio), soles(x.noches * x.precio)));
  if (d.descuento) f.push(fila("Descuento por estadía larga (" + d.larga.pct + "%)", "−" + soles(d.descuento)));
  f.push(fila("Recojo y regreso" + (d.regalo ? " (regalo de primera estadía)" : ""), soles(d.movPublico)));
  f.push(fila("Total pagado", soles(r.total)));
  return tabla(f);
}
export function correoCliente(r) {
  const cancelar = `${sitio()}/?reserva=${r.id}&t=${r.token}`;
  const condicion = r.politica === "siete"
    ? `<p style="font-size:14px;color:#4b5670">Puedes cancelar hasta 7 días calendario antes del ingreso y te devolvemos el ${r.reembolso_pct}% de lo pagado. Desde <a href="${cancelar}">tu reserva</a> puedes cancelar.</p>`
    : `<p style="font-size:14px;color:#4b5670">Esta reserva no admite cancelaciones.</p>`;
  return { para: r.email, asunto: `Reserva confirmada ${r.codigo}: ${nombres(r)} tiene su lugar`, html: marco("¡Tu reserva está confirmada!", `
<p>Hola ${esc(r.cliente.nombre.split(" ")[0])}, recibimos tu pago. Este es el pase de estadía de ${esc(nombres(r))}.</p>
${tabla([fila("Código", r.codigo), fila("Casa", r.cuidador.nombre_publico), fila("Dirección", r.cuidador.direccion || "Te la enviamos antes del ingreso"),
  fila("Ingreso", fechaCorta(r.ingreso)), fila("Salida", fechaCorta(r.salida)), fila("Recojo en", r.cliente.direccion)])}
${desglose(r)}
<p>El cuidador ya recibió la ficha de ${esc(nombres(r))}. Coordinen la hora de recojo por el chat de tu reserva, sin compartir números. Te llegarán reportes con fotos de cómo está, a las ${esc(r.cuidador.hora_reporte)}.</p>
<p style="font-size:14px"><b>Prepara su maleta:</b> cartilla de vacunas al día, antiparasitario vigente, su comida para todos los días, indicaciones por escrito si toma medicamentos y su correa.</p>
<p><a href="${cancelar}" style="display:inline-block;background:#f5b82e;color:#1b2a4a;padding:12px 18px;border-radius:999px;font-weight:700;text-decoration:none">Ver mi reserva</a></p>
${condicion}`) };
}
export function correoCuidador(r) {
  return { para: r.cuidador.email, asunto: `Nueva reserva ${r.codigo}: ${fechaCorta(r.ingreso)} al ${fechaCorta(r.salida)}`, html: marco("Tienes una nueva reserva pagada", `
${tabla([fila("Código", r.codigo), fila("Ingreso", fechaCorta(r.ingreso)), fila("Salida", fechaCorta(r.salida)), fila("Noches", r.noches), fila("Perros", r.perros),
  fila("Hospedoggy te paga", soles(r.costo)), fila("Recojo y regreso", r.detalle.regalo ? "Incluido (primera estadía del cliente)" : "Incluido")])}
<h2 style="font-size:17px;margin:16px 0 4px">Datos del dueño</h2>
${tabla([fila("Nombre y apellido", r.cliente.nombre), fila("Teléfono", "+51 " + r.cliente.telefono), fila("Dirección", r.cliente.direccion), fila("Referencia", r.cliente.referencia)])}
<h2 style="font-size:17px;margin:16px 0 4px">Datos del huésped</h2>${fichaPerros(r)}
<p>Escríbele al dueño desde el chat de tu panel para coordinar el recojo: <a href="${sitio()}/cuidador/">${sitio()}/cuidador/</a></p>
<p style="font-size:13px;color:#4b5670">Recuerda enviar los reportes con fotos a las ${esc(r.cuidador.hora_reporte)} desde tu panel. Todo acuerdo y cobro con este cliente pasa por Hospedoggy, según la cláusula de no captación.</p>`) };
}
export function correoAdmin(asunto, r, extra = "") {
  return { para: env("EMAIL_ADMIN"), asunto: asunto + " " + r.codigo, html: marco(asunto, tabla([
    fila("Código", r.codigo), fila("Cuidador", r.cuidador.nombre_interno + " · " + r.cuidador.nombre_publico), fila("Fechas", fechaCorta(r.ingreso) + " al " + fechaCorta(r.salida)),
    fila("Cliente", r.cliente.nombre + " · +51 " + r.cliente.telefono + " · " + r.email), fila("Cobrado", soles(r.total)), fila("Pagar al cuidador", soles(r.costo)),
    fila("Margen", soles(r.margen)), fila("Pago en Mercado Pago", r.mp_pago || "-")]) + extra) };
}
export function correoCancelacion(r, monto, pendiente) {
  return { para: r.email, asunto: `Reserva ${r.codigo} cancelada`, html: marco("Cancelamos tu reserva", `<p>Hola ${esc(r.cliente.nombre.split(" ")[0])}, tu reserva ${esc(r.codigo)} del ${fechaCorta(r.ingreso)} quedó cancelada.</p>
<p>Te devolvemos <b>${soles(monto)}</b> (el ${r.reembolso_pct}% de lo pagado) al mismo medio con el que pagaste. ${pendiente ? "Lo procesamos en las próximas 48 horas." : "Según tu banco o Yape, puede tardar unos días en verse."}</p>`) };
}
export function correoSinCupo(r) {
  return { para: r.email, asunto: `No pudimos confirmar tu reserva ${r.codigo}`, html: marco("Te devolvimos el pago completo", `<p>Hola ${esc(r.cliente.nombre.split(" ")[0])}, el tiempo para pagar venció y en ese momento otra persona tomó la última plaza de esa casa.</p>
<p>Por eso te devolvimos el 100% (${soles(r.total)}) al mismo medio de pago. <a href="${sitio()}">Busca otra casa con cupo</a>.</p>`) };
}

const boton = (url, texto) => `<p><a href="${url}" style="display:inline-block;background:#f5b82e;color:#1b2a4a;padding:12px 18px;border-radius:999px;font-weight:700;text-decoration:none">${esc(texto)}</a></p>`;
export const enlaceReserva = (r) => `${sitio()}/?reserva=${r.id}&t=${r.token}`;
// Chat: aviso a la otra parte (máximo uno cada 15 minutos por reserva)
export function correoMensajeCliente(r, texto) {
  return { para: r.email, asunto: `Nuevo mensaje sobre ${nombres(r)} (${r.codigo})`, html: marco("Te escribió tu cuidador", `<p>${esc(r.cuidador.nombre_publico)} te escribió:</p>
<blockquote style="margin:0 0 12px;padding:10px 14px;background:#f7f4ec;border-radius:12px">${esc(texto)}</blockquote>${boton(enlaceReserva(r), "Responder en el chat")}`) };
}
export function correoMensajeCuidador(r, texto) {
  return { para: r.cuidador.email, asunto: `Mensaje del dueño de ${nombres(r)} (${r.codigo})`, html: marco("Te escribió un cliente", `<p>${esc(r.cliente.nombre.split(" ")[0])}, dueño de ${esc(nombres(r))}, te escribió:</p>
<blockquote style="margin:0 0 12px;padding:10px 14px;background:#f7f4ec;border-radius:12px">${esc(texto)}</blockquote>${boton(sitio() + "/cuidador/", "Responder desde mi panel")}`) };
}
export function correoReporte(r, rep) {
  return { para: r.email, asunto: `Llegó el reporte de hoy de ${nombres(r)} 🐾`, html: marco(`Así le fue hoy a ${nombres(r)}`, `
${rep.nota ? `<p>${esc(rep.nota)}</p>` : ""}${(rep.fotos || []).slice(0, 2).map((f) => `<img src="${f}" alt="Foto del reporte" style="width:100%;border-radius:12px;margin:6px 0">`).join("")}
${boton(enlaceReserva(r), "Ver el reporte completo")}`) };
}
export function correoResena(r) {
  return { para: r.email, asunto: `¿Cómo le fue a ${nombres(r)}?`, html: marco(`¿Cómo le fue a ${nombres(r)}?`, `<p>Hola ${esc(r.cliente.nombre.split(" ")[0])}, gracias por confiar en Hospedoggy. Tu opinión ayuda a otros dueños a elegir y a que los mejores cuidadores sigan en la red.</p>
${boton(enlaceReserva(r), "Dejar mi reseña")}`) };
}
export function correoTransferencia(c, monto, codigos, operacion) {
  return { para: c.email, asunto: `Te transferimos ${soles(monto)}`, html: marco("Te transferimos tu pago", `<p>Hola, Hospedoggy te transfirió <b>${soles(monto)}</b> por ${esc(codigos.join(", "))}${operacion ? " (operación " + esc(operacion) + ")" : ""}.</p>
<p>Puedes ver el detalle en la pestaña Pagos de <a href="${sitio()}/cuidador/">tu panel</a>.</p>`) };
}
export function correoCanceladaPorHospedoggy(r) {
  return { para: r.email, asunto: `Tu reserva ${r.codigo} fue cancelada`, html: marco("Tuvimos que cancelar tu reserva", `<p>Hola ${esc(r.cliente.nombre.split(" ")[0])}, por un motivo de fuerza mayor tuvimos que cancelar tu reserva ${esc(r.codigo)} del ${fechaCorta(r.ingreso)}. Lo sentimos mucho.</p>
<p>Te devolvemos el <b>100% (${soles(r.total)})</b> al mismo medio con el que pagaste. Te escribiremos para ayudarte a encontrar otra casa.</p>`) };
}
