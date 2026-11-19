// GET /api/panel → datos del panel (cuidador o administrador, según la sesión)
// POST /api/panel {accion, ...} → acciones del panel. Devuelve los datos actualizados.
import { rpc } from "../lib/db.mjs";
import { json, hoyLima, sitio } from "../lib/entorno.mjs";
import { autenticar } from "../lib/sesion.mjs";
import { claveCorrecta, hashClave, claveTemporal, problemaClave, crearSesion } from "../lib/claves.mjs";
import { datosCuidador, datosAdmin } from "../lib/panel-datos.mjs";
import { ocultarContacto, problemasTexto, RASGOS, TIPOS, HORAS_REPORTE, TAMANOS, MOTIVOS, recortar } from "../lib/texto.mjs";
import { subirFoto } from "../lib/fotos.mjs";
import { esIso, sumarDias, precioPublico } from "../lib/precios.mjs";
import { reembolsar } from "../lib/mercadopago.mjs";
import { enviarCorreo, correoMensajeCliente, correoReporte, correoTransferencia, correoCanceladaPorHospedoggy, esc, fechaCorta, soles } from "../lib/correo.mjs";

class Aviso extends Error { constructor(m, estado = 422) { super(m); this.estado = estado; } }
const falla = (m, estado) => { throw new Aviso(m, estado); };
const entero = (v) => Number.isInteger(Number(v)) && String(v).trim() !== "" ? Number(v) : NaN;

async function datos(s) {
  return s.rol === "admin" ? datosAdmin(await rpc("api_datos_admin")) : datosCuidador(await rpc("api_datos_cuidador", { p_id: s.id }));
}

export default async (req) => {
  try {
    const s = await autenticar(req);
    if (!s) return json({ error: "Tu sesión terminó. Vuelve a ingresar." }, 401);
    if (req.method === "GET") return json({ rol: s.rol, usuario: s.usuario, debeCambiar: s.debeCambiar, S: await datos(s) });
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
    const b = await req.json().catch(() => ({}));
    if (s.debeCambiar && b.accion !== "clave") falla("Primero crea tu propia contraseña.", 403);
    const r = b.accion === "clave" ? await cambiarClave(s, b)
      : s.rol === "cuidador" ? await accionCuidador(s, b)
      : await accionAdmin(s, b);
    return json(Object.assign({ ok: true }, r, { S: await datos(s) }));
  } catch (e) {
    if (e instanceof Aviso) return json({ error: e.message }, e.estado);
    console.error(e);
    return json({ error: "Algo salió mal. Intenta de nuevo en un momento." }, 500);
  }
};
export const config = { path: "/api/panel" };

/* ---------- Contraseña (cuidador y administrador) ---------- */
async function cambiarClave(s, b) {
  if (!claveCorrecta(String(b.actual || ""), s.claveHash)) falla("La contraseña actual no es correcta.");
  const p = problemaClave(b.nueva, s.usuario, b.actual);
  if (p) falla(p);
  const h = hashClave(b.nueva);
  await rpc("api_cambiar_clave", { p_rol: s.rol, p_id: s.id, p_hash: h, p_temporal: false });
  s.claveHash = h; s.debeCambiar = false;
  return { aviso: "Listo, cambiaste tu contraseña.", token: crearSesion(s.rol, s.id, h) };
}

/* ---------- Reglas compartidas ---------- */
const ocupadasEn = (reservas, iso) => reservas.reduce((t, r) => t + (r.estado === "pagada" && iso >= r.ingreso && iso < r.salida ? r.perros : 0), 0);
function validarRangos(lista, campo, etiqueta) {
  const orden = lista.slice().sort((x, y) => String(x.desde).localeCompare(String(y.desde)));
  for (let i = 0; i < orden.length; i++) {
    const r = orden[i];
    if (!esIso(r.desde) || !esIso(r.hasta)) falla("Completa las fechas de " + etiqueta + ".");
    if (r.hasta < r.desde) falla("En " + etiqueta + ", la fecha final es anterior a la inicial (" + fechaCorta(r.desde) + ").");
    if (!(Number(r[campo]) >= (campo === "plazas" ? 0 : 1)) || (campo === "plazas" && !Number.isInteger(Number(r[campo])))) falla(campo === "plazas" ? "Las plazas de cada ajuste deben ser un número entero." : "Pon una tarifa mayor a cero en cada rango.");
    if (i > 0 && r.desde <= orden[i - 1].hasta) falla("Dos rangos se cruzan: " + fechaCorta(orden[i - 1].desde) + " y " + fechaCorta(r.desde) + ".");
  }
  return orden.map((r) => ({ desde: r.desde, hasta: r.hasta, [campo]: Number(r[campo]) }));
}
// La parte del cuidador más baja posible: la devolución por cancelación no puede superarla
function parteMinima(cuidadores, cfg) {
  let min = 1, donde = "";
  for (const c of cuidadores.filter((c) => c.activo && c.verif_visita && c.verif_entrevista && c.verif_emergencia && c.verif_seguimiento)) {
    const tarifas = [Number(c.tarifa)].concat(c.temporada_activa ? (c.temporadas || []).map((t) => Number(t.tarifa)) : []);
    for (const t of tarifas) for (let n = 0; n < 3; n++) {
      const costo = t + n * Number(c.perro_adicional || 0);
      const parte = costo / precioPublico(costo, cfg.margen_noche, cfg.redondeo);
      if (parte < min) { min = parte; donde = c.nombre_interno + ", noche de S/" + costo; }
    }
    if (Number(c.movilidad) > 0) { const parte = c.movilidad / precioPublico(Number(c.movilidad), cfg.margen_movilidad, cfg.redondeo); if (parte < min) { min = parte; donde = c.nombre_interno + ", movilidad"; } }
  }
  return { pct: Math.floor(min * 100), donde };
}
const disponibleDesde = (r) => {
  const pagada = new Date(r.pagada_en).getTime();
  if (r.politica !== "siete") return pagada;
  return Math.max(pagada, new Date(sumarDias(r.ingreso, -7) + "T00:00:00-05:00").getTime());
};

/* ---------- Cuidador ---------- */
async function reservaPropia(s, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) falla("Reserva no encontrada.", 404);
  const r = await rpc("api_reserva", { p_id: id });
  if (!r || r.cuidador_id !== s.id) falla("Reserva no encontrada.", 404);
  return r;
}
async function accionCuidador(s, b) {
  const a = b.accion;
  if (a === "mensaje") {
    const r = await reservaPropia(s, b.reserva);
    if (r.estado !== "pagada") falla("Esta reserva ya no está activa.");
    const txt = recortar(b.texto, 1500);
    if (!txt) falla("Escribe un mensaje.");
    // El cuidador ya recibe los datos del dueño; lo que se protege es el contacto del cuidador
    const o = ocultarContacto(txt);
    const m = await rpc("api_mensaje", { p_reserva: r.id, p_de: "cuidador", p_texto: o.texto, p_oculto: o.oculto });
    if (o.oculto) await rpc("api_incidencia", { p_reserva: r.id, p_de: "cuidador", p_motivo: "Intento de compartir datos de contacto", p_texto: o.texto, p_auto: true });
    if (m.avisar) await enviarCorreo(correoMensajeCliente(r, o.texto));
    return { aviso: o.oculto ? "Enviado. Hospedoggy ocultó un dato de contacto: todo se coordina por aquí." : "" };
  }
  if (a === "reporte") {
    const r = await reservaPropia(s, b.reserva);
    const hoy = hoyLima();
    if (r.estado !== "pagada" || hoy < r.ingreso || hoy >= r.salida) falla("Solo puedes enviar reportes de perros que están en tu casa hoy.");
    const fotos = [];
    for (const f of (Array.isArray(b.fotos) ? b.fotos : []).slice(0, 4)) fotos.push(await subirFoto(f, "reportes/" + r.id));
    const rep = { fecha: hoy, pis: !!b.pis, caca: !!b.caca, comida: !!b.comida, agua: !!b.agua, juego: !!b.juego, nota: recortar(ocultarContacto(b.nota || "").texto, 1500), fotos };
    await rpc("api_reporte", { p_reserva: r.id, p: rep });
    await enviarCorreo(correoReporte(r, rep));
    return { aviso: "Reporte enviado. " + r.cliente.nombre.split(" ")[0] + " recibió el aviso por correo." };
  }
  if (a === "incidencia") {
    const r = await reservaPropia(s, b.reserva);
    await rpc("api_incidencia", { p_reserva: r.id, p_de: "cuidador", p_motivo: MOTIVOS.includes(b.motivo) ? b.motivo : "Otro", p_texto: recortar(b.texto, 2000), p_auto: false });
    return { aviso: "Gracias. El equipo de Hospedoggy revisa tu reporte." };
  }
  if (a === "archivar") {
    const r = await reservaPropia(s, b.reserva);
    await rpc("api_archivar", { p_reserva: r.id, p_valor: !!b.valor });
    return { aviso: b.valor ? "Conversación archivada. Si el cliente escribe, vuelve sola a Activos." : "Conversación movida a Activos." };
  }
  const d = await rpc("api_datos_cuidador", { p_id: s.id });
  const c = d.cuidador;
  if (a === "tarifas") {
    const t = { tarifa: Number(b.tarifa), movilidad: Number(b.movilidad), perro_adicional: Number(b.perroAdicional),
      descuento_noches: entero(b.descuentoNoches || 0), descuento_pct: entero(b.descuentoPct || 0), movilidad_gratis_primera: !!b.movilidadGratisPrimera, temporada_activa: !!b.temporadaActiva };
    if (!(t.tarifa > 0)) falla("La tarifa regular tiene que ser mayor a cero.");
    if (!(t.movilidad >= 0) || !(t.perro_adicional >= 0)) falla("Los montos no pueden ser negativos.");
    if (!(t.descuento_pct >= 0 && t.descuento_pct <= 50)) falla("El descuento por estadía larga debe estar entre 0% y 50%.");
    if (t.descuento_pct > 0 && !(t.descuento_noches >= 2)) falla("Indica desde cuántas noches aplica el descuento (2 o más).");
    t.temporadas = t.temporada_activa ? validarRangos(Array.isArray(b.temporadas) ? b.temporadas : [], "tarifa", "los rangos de temporada") : (c.temporadas || []);
    await rpc("api_guardar_tarifas", { p_id: s.id, p: t });
    return { aviso: "Tarifas guardadas. Se aplican a las próximas reservas." };
  }
  if (a === "plazas") {
    const n = entero(b.plazas);
    if (!(n >= 0 && n <= 50)) falla("Escribe un número entero de plazas.");
    const orden = validarRangos(Array.isArray(b.especiales) ? b.especiales : [], "plazas", "cada ajuste");
    const pagadas = d.reservas.filter((r) => r.estado === "pagada");
    for (const p of orden) for (let x = p.desde; x <= p.hasta; x = sumarDias(x, 1)) {
      const o = ocupadasEn(pagadas, x);
      if (o > p.plazas) falla("El " + fechaCorta(x) + " ya tienes " + o + (o === 1 ? " perro reservado" : " perros reservados") + ". En ese ajuste no puedes poner menos de " + o + ".");
    }
    let max = 0, dia = null;
    for (let i = 0; i < 400; i++) {
      const x = sumarDias(hoyLima(), i);
      if (orden.some((p) => x >= p.desde && x <= p.hasta)) continue;
      const o = ocupadasEn(pagadas, x); if (o > max) { max = o; dia = x; }
    }
    if (n < max) falla("El " + fechaCorta(dia) + " ya tienes " + max + (max === 1 ? " perro reservado" : " perros reservados") + ". No puedes bajar de " + max + (max === 1 ? " plaza general." : " plazas generales."));
    await rpc("api_guardar_plazas", { p_id: s.id, p_plazas: n, p_especiales: orden });
    return { aviso: "Plazas guardadas." };
  }
  if (a === "perfil") {
    const tam = (Array.isArray(b.tamanos) ? b.tamanos : []).filter((x) => TAMANOS.includes(x));
    const wa = String(b.whatsapp || "").replace(/\D/g, "");
    const desc = recortar(b.descripcion, 1500);
    if (!tam.length) falla("Elige al menos un tamaño.");
    if (wa.length < 11) falla("Escribe el WhatsApp con 51 adelante, por ejemplo +51 987 654 321.");
    if (!TIPOS.includes(b.tipo) || !RASGOS.includes(b.rasgo || "") || !HORAS_REPORTE.includes(b.horaReporte)) falla("Revisa las opciones del perfil.");
    const prob = problemasTexto(desc, c.nombre_interno);
    if (prob.length) falla("La descripción " + prob.join(", ") + ". Quítalo para poder enviarla a revisión.");
    const email = b.email === undefined ? c.email || "" : recortar(b.email, 120).trim().toLowerCase();
    if (b.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) falla("Escribe un correo válido para recibir los avisos de reservas, por ejemplo nombre@gmail.com.");
    const nuevoCorreo = email !== (c.email || "");
    const cambio = desc !== c.descripcion;
    await rpc("api_guardar_perfil", { p_id: s.id, p: { tamanos: tam, rasgo: b.rasgo || "", hora_reporte: b.horaReporte, tipo_vivienda: b.tipo,
      jardin: !!b.jardin, perros_residentes: !!b.perrosResidentes, ninos: !!b.ninos, todo_el_dia: !!b.todoElDia, fumadores: !!b.fumadores, whatsapp: wa,
      descripcion_pendiente: cambio ? { texto: desc, ts: new Date().toISOString() } : null } });
    if (nuevoCorreo) {
      await rpc("api_admin_cuidador", { p_id: s.id, p: { email } });
      await enviarCorreo({ para: email, asunto: "Este es tu correo de avisos en Hospedoggy",
        html: "<p>Hola, " + esc(c.nombre_interno || "") + ". Desde ahora los avisos de reservas, mensajes del chat y pagos de Hospedoggy te llegan a este correo.</p><p>Si no hiciste este cambio, entra a tu panel y corrígelo, o escríbenos a ventas@hospedoggy.com.</p>" });
    }
    return { aviso: (cambio ? "Perfil guardado. La descripción nueva se publica cuando Hospedoggy la apruebe." : "Perfil guardado.") + (nuevoCorreo ? " Te enviamos un correo de prueba a " + email + ": revisa que te haya llegado (mira también en Spam)." : "") };
  }
  if (a === "pago") {
    const metodo = b.metodo;
    const titular = recortar(b.titular, 120);
    if (!["Yape", "Plin", "Transferencia"].includes(metodo)) falla("Elige cómo quieres que te paguemos.");
    if (titular.split(/\s+/).filter(Boolean).length < 2) falla("Escribe el nombre completo del titular.");
    const p = { metodo, titular, dni: String(b.dni || "").replace(/\D/g, "").slice(0, 11) };
    if (metodo === "Transferencia") {
      const numero = String(b.numero || "").replace(/\D/g, ""), cci = String(b.cci || "").replace(/\D/g, "");
      if (numero.length < 10) falla("El número de cuenta parece incompleto.");
      if (cci.length !== 20) falla("El CCI debe tener 20 dígitos.");
      Object.assign(p, { banco: recortar(b.banco, 40), tipoCuenta: b.tipoCuenta === "Corriente" ? "Corriente" : "Ahorros", numero, cci });
    } else {
      const cel = String(b.celular || "").replace(/\D/g, "").slice(-9);
      if (!/^9\d{8}$/.test(cel)) falla("Escribe el celular de " + metodo + " con 9 dígitos.");
      p.celular = "51" + cel;
    }
    await rpc("api_guardar_pago", { p_id: s.id, p });
    return { aviso: "Método de pago guardado. Hospedoggy ya lo ve para tus transferencias." };
  }
  falla("Acción no reconocida.", 400);
}

/* ---------- Administrador ---------- */
async function accionAdmin(s, b) {
  const a = b.accion;
  const d = await rpc("api_datos_admin");
  const c = b.id ? d.cuidadores.find((x) => x.id === b.id) : null;
  if (["verif", "pausar", "editar", "reset-clave", "foto-subir", "fotos", "aprobar-desc", "rechazar-desc"].includes(a) && !c) falla("Cuidador no encontrado.", 404);
  const cambiar = (p) => rpc("api_admin_cuidador", { p_id: c.id, p });
  if (a === "verif") {
    if (!["visita", "entrevista", "emergencia", "seguimiento"].includes(b.paso)) falla("Paso no válido.");
    await cambiar({ ["verif_" + b.paso]: !!b.valor });
    return {};
  }
  if (a === "pausar") { await cambiar({ activo: !c.activo }); return { aviso: c.activo ? "Casa pausada: ya no aparece para los clientes. Sus reservas siguen vigentes." : "Casa reactivada." }; }
  if (a === "editar") {
    const v = b.datos || {};
    const wa = String(v.whatsapp || "").replace(/\D/g, "");
    const email = recortar(v.email, 120);
    if (!recortar(v.nombre_interno, 120) || !recortar(v.distrito, 60)) falla("Completa nombre real y distrito.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) falla("El correo no es válido.");
    if (wa && wa.length < 11) falla("Escribe el WhatsApp con 51 adelante.");
    const servicios = String(v.servicios || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12).map((x) => x.slice(0, 80));
    await cambiar({ nombre_interno: recortar(v.nombre_interno, 120), distrito: recortar(v.distrito, 60), direccion: recortar(v.direccion, 200),
      email, whatsapp: wa, servicios, descripcion: recortar(v.descripcion, 1500) });
    return { aviso: "Datos de " + recortar(v.nombre_interno, 120) + " guardados." };
  }
  if (a === "reset-clave") {
    const t = claveTemporal();
    await rpc("api_cambiar_clave", { p_rol: "cuidador", p_id: c.id, p_hash: hashClave(t), p_temporal: true });
    return { aviso: "Contraseña temporal de " + c.nombre_interno + " (usuario " + c.usuario + "): " + t + ". Compártela con el cuidador; la cambiará al ingresar.", clave: t };
  }
  if (a === "crear") {
    const v = (k) => recortar(b[k], 120);
    const usuario = v("usuario").toLowerCase();
    const wa = String(b.whatsapp || "").replace(/\D/g, "");
    if (!v("nombre_interno") || !v("distrito") || !usuario) falla("Completa nombre real, distrito y usuario.");
    if (!/^[a-z0-9]{4,20}$/.test(usuario)) falla("El usuario va en minúsculas y sin espacios, de 4 a 20 letras o números.");
    if (String(b.clave || "").length < 8) falla("La contraseña temporal debe tener al menos 8 caracteres.");
    if (wa.length < 11) falla("Escribe el WhatsApp con 51 adelante.");
    const email = v("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) falla("El correo no es válido.");
    const r = await rpc("api_admin_crear", { p: { id: usuario, usuario, nombre_interno: v("nombre_interno"), distrito: v("distrito"), whatsapp: wa, email, clave_hash: hashClave(String(b.clave)) } });
    if (!r.ok) falla("Ese usuario ya existe.");
    return { aviso: "Cuidador creado. Usuario: " + usuario + " · contraseña temporal: " + b.clave + ". Compártelos con él: la primera vez que entre en " + sitio() + "/cuidador/ el sistema le pedirá crear su propia contraseña." };
  }
  if (a === "foto-subir") {
    if ((c.fotos || []).length >= 15) falla("Máximo 15 fotos por casa.");
    const url = await subirFoto(b.imagen, "casas/" + c.id);
    await cambiar({ fotos: (c.fotos || []).concat([{ url, leyenda: "" }]) });
    return {};
  }
  if (a === "fotos") {
    const lista = (Array.isArray(b.fotos) ? b.fotos : []).filter((f) => (c.fotos || []).some((x) => x.url === f.url)).map((f) => ({ url: f.url, leyenda: recortar(f.leyenda, 80) }));
    await cambiar({ fotos: lista });
    return {};
  }
  if (a === "aprobar-desc") {
    if (!c.descripcion_pendiente) falla("No hay cambios por aprobar.");
    await cambiar({ descripcion: c.descripcion_pendiente.texto, descripcion_pendiente: null });
    return { aviso: "Descripción publicada." };
  }
  if (a === "rechazar-desc") { await cambiar({ descripcion_pendiente: null }); return { aviso: "Cambio rechazado. El cuidador mantiene su descripción anterior." }; }
  if (a === "config") {
    const cfg = { margen_noche: entero(b.margenNoche), margen_movilidad: entero(b.margenMovilidad), redondeo: entero(b.redondeo),
      cancelacion: b.cancelacion === "siete" ? "siete" : "ninguna", reembolso_pct: entero(b.reembolsoPct) };
    if (!(cfg.margen_noche >= 0 && cfg.margen_noche <= 200) || !(cfg.margen_movilidad >= 0 && cfg.margen_movilidad <= 200)) falla("Los márgenes deben ser números enteros entre 0 y 200.");
    if (![1, 5, 10].includes(cfg.redondeo)) falla("Elige un redondeo válido.");
    if (!(cfg.reembolso_pct >= 0 && cfg.reembolso_pct <= 100)) falla("La devolución debe ser un número entero entre 0 y 100.");
    const seguro = parteMinima(d.cuidadores, cfg).pct;
    if (cfg.cancelacion === "siete" && cfg.reembolso_pct > seguro) falla("Con " + cfg.reembolso_pct + "% devolverías más de lo que cobra el cuidador en algunas reservas y perderías tu comisión. Usa " + seguro + "% o menos.");
    await rpc("api_admin_config", { p: cfg });
    return { aviso: "Guardado. Los clientes ya ven los nuevos precios y la política de cancelación." };
  }
  if (a === "resolver") { await rpc("api_admin_resolver", { p_id: Number(b.incidencia) }); return {}; }
  if (a === "devuelto") { await rpc("api_admin_devuelto", { p_id: b.reserva }); return { aviso: "Devolución registrada." }; }
  if (a === "transferido") {
    const cu = d.cuidadores.find((x) => x.id === b.cuidador);
    if (!cu) falla("Cuidador no encontrado.", 404);
    const listos = d.reservas.filter((r) => r.cuidador_id === cu.id && r.estado === "pagada" && !r.pagado_cuidador && disponibleDesde(r) <= Date.now());
    if (!listos.length) falla("No hay pagos listos para transferir a este cuidador.");
    const op = recortar(b.operacion, 40);
    const monto = await rpc("api_admin_transferido", { p_cuidador: cu.id, p_ids: listos.map((r) => r.id), p_operacion: op });
    if (cu.email) await enviarCorreo(correoTransferencia(cu, monto, listos.map((r) => r.codigo), op));
    return { aviso: "Transferencia de " + soles(monto) + " registrada." + (cu.email ? " Se le avisó al cuidador por correo." : "") };
  }
  if (a === "cancelar") {
    if (!/^[0-9a-f-]{36}$/i.test(String(b.reserva || ""))) falla("Reserva no encontrada.", 404);
    const r = await rpc("api_reserva", { p_id: b.reserva });
    if (!r || r.estado !== "pagada") falla("Esta reserva ya no está activa.");
    let id = null, pendiente = false;
    try { id = String((await reembolsar(r.mp_pago, null, "excepcion-" + r.id)).id || ""); } catch (e) { pendiente = true; console.error(e); }
    const c2 = await rpc("api_cancelar", { p_id: r.id, p_monto: Number(r.total), p_reembolso: id, p_pendiente: pendiente, p_por: "hospedoggy" });
    if (!c2.ok) falla("Esta reserva ya no está activa.");
    await enviarCorreo(correoCanceladaPorHospedoggy(r));
    if (r.cuidador.email) await enviarCorreo({ para: r.cuidador.email, asunto: "Reserva " + r.codigo + " cancelada",
      html: "<p>Hospedoggy canceló la reserva " + esc(r.codigo) + " del " + fechaCorta(r.ingreso) + " al " + fechaCorta(r.salida) + ". Esas plazas vuelven a estar libres.</p>" });
    return { aviso: "Reserva " + r.codigo + " cancelada como excepción. " + (pendiente ? "La devolución automática falló: devuelve " + soles(r.total) + " a mano desde Mercado Pago y márcala en Pagos." : "Se devolvió el 100% (" + soles(r.total) + ") automáticamente.") + (r.pagado_cuidador ? " Ojo: ya le habías transferido al cuidador." : "") };
  }
  falla("Acción no reconocida.", 400);
}
