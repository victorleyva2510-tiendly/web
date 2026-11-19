// Convierte las filas de la base de datos a la forma que usa el panel (la misma del prototipo validado).
const num = (v) => (v == null ? 0 : Number(v));
const fechaLima = (ts) => (ts ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(ts)) : null);
export const urlFoto = (u) => (/^(https?:)?\//.test(u) ? u : "/" + String(u || "").replace(/^\.?\//, ""));

export function cuidadorPanel(c) {
  return {
    id: c.id, usuario: c.usuario, nombreInterno: c.nombre_interno, nombrePublico: c.nombre_publico, distrito: c.distrito,
    descripcion: c.descripcion, descripcionPendiente: c.descripcion_pendiente || undefined, rasgo: c.rasgo || "", pago: c.pago || {},
    plazasEspeciales: c.plazas_especiales || [], whatsapp: c.whatsapp || "", email: c.email || "", direccion: c.direccion || "",
    plazas: num(c.plazas), tarifa: num(c.tarifa), movilidad: num(c.movilidad), movilidadGratisPrimera: !!c.movilidad_gratis_primera,
    perroAdicional: num(c.perro_adicional), descuentoLarga: { noches: num(c.descuento_noches), pct: num(c.descuento_pct) },
    temporadaActiva: !!c.temporada_activa, temporadas: (c.temporadas || []).map((t) => ({ desde: t.desde, hasta: t.hasta, tarifa: num(t.tarifa) })),
    tamanos: c.tamanos || [], servicios: c.servicios || [],
    casa: { tipo: c.tipo_vivienda, jardin: !!c.jardin, perrosResidentes: !!c.perros_residentes, ninos: !!c.ninos, fumadores: !!c.fumadores, todoElDia: !!c.todo_el_dia },
    fotos: (c.fotos || []).map((f, i) => ({ id: String(i), src: urlFoto(f.url), url: f.url, leyenda: f.leyenda || "" })),
    verificacion: { visita: !!c.verif_visita, entrevista: !!c.verif_entrevista, emergencia: !!c.verif_emergencia, seguimiento: !!c.verif_seguimiento },
    activo: !!c.activo, desde: fechaLima(c.creado_en), horaReporte: c.hora_reporte, debeCambiarClave: !!c.debe_cambiar_clave,
    claveCambiada: c.clave_cambiada, tieneClave: c.tiene_clave !== false
  };
}
export const reportePanel = (p) => ({ fecha: p.fecha, pis: !!p.pis, caca: !!p.caca, comida: !!p.comida, agua: !!p.agua, juego: !!p.juego,
  nota: p.nota || "", fotos: p.fotos || [], ts: p.creado_en });

export function reservaPanel(r, reportes = []) {
  const hs = r.huespedes || [];
  const cancelada = r.estado !== "pagada";
  const total = num(r.total);
  const devuelto = r.estado === "reembolsada_sin_cupo" ? total : num(r.reembolso_monto);
  return {
    id: r.id, codigo: r.codigo, cuidador: r.cuidador_id, estadoReal: r.estado,
    cliente: { nombre: r.cliente.nombre, telefono: r.cliente.telefono, direccion: r.cliente.direccion, referencia: r.cliente.referencia, email: r.email || undefined },
    perros: r.perros, huespedes: hs,
    perro: { nombre: hs.map((h) => h.nombre).join(" y "), tamano: hs.map((h) => h.tamano).filter((x, i, a) => a.indexOf(x) === i).join(" y "),
      indicaciones: hs.map((h) => [h.medicamento === "Sí" ? "Medicamento: " + h.medicamentoDetalle : "", h.alimentacion ? "Comida: " + h.alimentacion : ""].filter(Boolean).join(". ")).filter(Boolean).join(" | ") },
    ingreso: r.ingreso, salida: r.salida, noches: r.noches, total: r.total == null ? undefined : total, costo: num(r.costo), margen: r.margen == null ? undefined : num(r.margen), primeraVez: !!r.primera_vez,
    estado: cancelada ? "cancelada" : "pagada", canal: r.canal || "Directo", creada: fechaLima(r.creada_en), pagadaEn: r.pagada_en,
    respuestaMin: r.respuesta_min, pagoValidado: true, validadoEn: r.pagada_en, pagadoCuidador: !!r.pagado_cuidador, transferidoEn: r.transferido_en,
    operacion: r.transferencia_operacion, estrellas: r.estrellas, resena: r.resena || "", reportes,
    archivadoCuidador: r.archivado_cuidador == null ? undefined : r.archivado_cuidador, canceladaPor: r.cancelada_por,
    devolucionPendiente: cancelada && r.reembolso_pendiente ? devuelto : 0, retenido: cancelada ? Math.max(0, total - devuelto) : 0,
    devuelto: cancelada ? devuelto : 0, politica: r.politica, movPublico: r.detalle ? num(r.detalle.movPublico) : 0
  };
}
const config = (x) => ({ margenNoche: x.margen_noche, margenMovilidad: x.margen_movilidad, redondeo: x.redondeo, cancelacion: x.cancelacion, reembolsoPct: x.reembolso_pct, maxPerros: x.max_perros });
const mensaje = (m) => ({ hilo: m.reserva_id, de: m.de, texto: m.texto, oculto: m.oculto, ts: m.creado_en });

export function datosCuidador(d) {
  const reps = {};
  for (const p of d.reportes) (reps[p.reserva_id] = reps[p.reserva_id] || []).push(reportePanel(p));
  return { config: config(d.config), cuidadores: [cuidadorPanel(d.cuidador)], reservas: d.reservas.map((r) => reservaPanel(r, reps[r.id] || [])),
    mensajes: d.mensajes.map(mensaje), incidencias: [], intentos: [], avisos: [] };
}
export function datosAdmin(d) {
  const reps = {};
  for (const p of d.reportes) (reps[p.reserva_id] = reps[p.reserva_id] || []).push({ fecha: p.fecha });
  return {
    config: config(d.config), cuidadores: d.cuidadores.map(cuidadorPanel), reservas: d.reservas.map((r) => reservaPanel(r, reps[r.id] || [])),
    intentos: d.intentos, mensajes: [],
    incidencias: d.incidencias.map((i) => ({ id: i.id, hilo: i.reserva_id, de: i.de, motivo: i.motivo, texto: i.texto, ts: i.creado_en, auto: i.auto, resuelta: i.resuelta })),
    avisos: d.avisos.map((a) => ({ ts: a.creado_en, para: a.para, asunto: a.asunto, ok: a.ok }))
  };
}
