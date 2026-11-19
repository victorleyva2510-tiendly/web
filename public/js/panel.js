/* Hospedoggy: paneles del cuidador y del administrador (versión real).
   Mismas vistas y reglas del prototipo validado; los datos vienen de /api/panel y cada acción se guarda en el servidor. */
"use strict";
const ROL = document.body.dataset.rol; // "cuidador" o "admin"
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const soles = (n) => "S/" + Math.round(n).toLocaleString("es-PE");
const pct = (n) => (isFinite(n) ? Math.round(n * 100) : 0) + "%";
const DIA = 86400000;
function hoyISO() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date()); }
const aFecha = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const aISO = (f) => f.toISOString().slice(0, 10);
const sumarDias = (iso, n) => aISO(new Date(aFecha(iso).getTime() + n * DIA));
const difDias = (a, b) => Math.round((aFecha(b) - aFecha(a)) / DIA);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fCorta = (iso) => { const f = aFecha(iso); return DIAS[f.getUTCDay()] + " " + f.getUTCDate() + " " + MESES[f.getUTCMonth()]; };
const fMes = (ym) => { const [y, m] = ym.split("-").map(Number); return MESES[m - 1] + " " + String(y).slice(2); };
const ahora = () => new Date().toISOString();
const hora = (ts) => { if (!ts) return "-"; const d = new Date(ts); return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" }) + " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }); };
const plural = (n, s, p) => n + " " + (n === 1 ? s : p);
const ultimos9 = (t) => String(t || "").replace(/\D/g, "").slice(-9);

/* ---------- Estado ---------- */
let S = null;
const ui = { hiloCuidador: null, pestanaCuidador: "hoy", pestanaAdmin: "resumen", periodo: 90, filtroEstado: "todas", buscarTexto: "", mensajes: {},
  fotosDe: null, editarDe: null, verArchivados: false, aviso: "", tarifasBorrador: null, plazasBorrador: null, ocupado: false };
const CLAVE_SESION = "hospedoggy-panel-" + ROL;
let sesion = leerSesion();
let debeCambiar = false, usuario = "";
const graficos = {};
function leerSesion() { try { return localStorage.getItem(CLAVE_SESION) || ""; } catch (e) { return ""; } }
function guardarSesion(t) { sesion = t || ""; try { if (t) localStorage.setItem(CLAVE_SESION, t); else localStorage.removeItem(CLAVE_SESION); } catch (e) {} }

async function pedir(metodo, cuerpo) {
  const r = await fetch(metodo === "login" ? "/api/login" : "/api/panel", {
    method: metodo === "GET" ? "GET" : "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, sesion && metodo !== "login" ? { Authorization: "Bearer " + sesion } : {}),
    body: metodo === "GET" ? undefined : JSON.stringify(cuerpo)
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && metodo !== "login") { guardarSesion(""); S = null; render(); throw new Error(d.error || "Tu sesión terminó."); }
  if (!r.ok) throw new Error(d.error || "Algo salió mal. Intenta de nuevo.");
  return d;
}
// Ejecuta una acción del panel y vuelve a pintar con los datos nuevos que devuelve el servidor
async function accion(cuerpo, errorEn) {
  if (ui.ocupado) return null;
  ui.ocupado = true; document.body.classList.add("ocupado");
  try {
    const d = await pedir("POST", cuerpo);
    if (d.token) guardarSesion(d.token);
    if (cuerpo.accion === "clave") debeCambiar = false;
    S = d.S; ui.aviso = d.aviso || ""; render();
    return d;
  } catch (e) {
    const el = errorEn && $(errorEn);
    if (el) { el.textContent = e.message; el.scrollIntoView({ behavior: "smooth", block: "center" }); } else { ui.aviso = ""; mensajeModal(e.message); }
    return null;
  } finally { ui.ocupado = false; document.body.classList.remove("ocupado"); }
}
async function cargar() {
  const primera = !S;
  try {
    const d = await pedir("GET");
    S = d.S; debeCambiar = d.debeCambiar; usuario = d.usuario;
  } catch (e) {
    if (!sesion) return; // la sesión venció: ya se muestra el ingreso
    if (primera) { $("#app").innerHTML = '<div class="vacio" style="margin-top:32px">' + esc(e.message) + ' <button class="boton boton-chico" data-accion="recargar">Reintentar</button></div>'; return; }
    ui.aviso = "No se pudo actualizar: " + e.message;
  }
  // Si estás llenando un formulario, los datos nuevos se guardan sin borrar lo que escribiste
  if (!primera && ui.sucio) return;
  render();
}

/* ---------- Reglas de negocio (las mismas del prototipo) ---------- */
function precioPublico(costo, margen) { const r = S.config.redondeo || 1; return Math.ceil((costo * (1 + margen / 100)) / r - 1e-9) * r; }
function estadoDe(r, hoy = hoyISO()) {
  if (r.estado === "cancelada") return "cancelada";
  if (hoy >= r.salida) return "completada";
  if (hoy >= r.ingreso) return "en_curso";
  return "pagada";
}
const OCUPA = ["pagada", "en_curso", "completada"];
function ocupadas(cid, iso) { return S.reservas.reduce((s, r) => s + (r.cuidador === cid && iso >= r.ingreso && iso < r.salida && OCUPA.includes(estadoDe(r)) ? (r.perros || 1) : 0), 0); }
function plazasDe(c, iso) { for (const p of c.plazasEspeciales || []) if (iso >= p.desde && iso <= p.hasta) return Number(p.plazas); return c.plazas; }
const ajustado = (c, iso) => (c.plazasEspeciales || []).some((p) => iso >= p.desde && iso <= p.hasta);
const DIAS_CANCELACION = 7;
const politicaCancelacion = () => (S.config.cancelacion || "siete");
const reembolsoPct = () => (S.config.reembolsoPct ?? 70);
function parteMinimaCuidador() {
  let min = 1, donde = "";
  for (const c of S.cuidadores.filter(verificado)) {
    const tarifas = [Number(c.tarifa)].concat(c.temporadaActiva ? c.temporadas.map((t) => Number(t.tarifa)) : []);
    for (const t of tarifas) for (let n = 0; n < 3; n++) {
      const costo = t + n * Number(c.perroAdicional || 0);
      const parte = costo / precioPublico(costo, S.config.margenNoche);
      if (parte < min) { min = parte; donde = c.nombreInterno + ", noche de S/" + costo; }
    }
    if (Number(c.movilidad) > 0) { const parte = c.movilidad / precioPublico(Number(c.movilidad), S.config.margenMovilidad); if (parte < min) { min = parte; donde = c.nombreInterno + ", movilidad"; } }
  }
  return { pct: Math.floor(min * 100), donde };
}
// Pago al cuidador: se abre cuando la reserva ya no se puede cancelar y vence el día de inicio del servicio
const finDelDia = (iso) => new Date(iso + "T23:59:00-05:00").toISOString();
function disponibleDesde(r) {
  if (!r.validadoEn) return null;
  if (r.politica !== "siete") return new Date(r.validadoEn).toISOString();
  const cierre = new Date(sumarDias(r.ingreso, -DIAS_CANCELACION) + "T00:00:00-05:00").toISOString();
  const v = new Date(r.validadoEn).toISOString();
  return v > cierre ? v : cierre;
}
const venceTransferencia = (r) => finDelDia(r.ingreso);
const porTransferir = (r) => r.estado !== "cancelada" && !r.pagadoCuidador;
const listoParaTransferir = (r) => porTransferir(r) && disponibleDesde(r) <= ahora();
function horasRestantes(iso) { return Math.round((new Date(iso) - new Date()) / 3600000); }
const RASGOS = ["", "con jardín", "con terraza", "con patio", "con piscina", "con área verde"];
const HORAS_REPORTE = ["12:00 pm", "2:00 pm", "4:00 pm", "5:00 pm", "6:00 pm", "6:30 pm", "7:00 pm", "7:30 pm", "8:00 pm", "9:00 pm"];
const horaReporte = (c) => (c && c.horaReporte) || "7:00 pm";
const nombrePublicoDe = (c) => c.casa.tipo + (c.rasgo ? " " + c.rasgo : "") + " en " + c.distrito;
const verificado = (c) => c.activo && Object.values(c.verificacion).every(Boolean);
const cuidador = (id) => S.cuidadores.find((c) => c.id === id);
function problemaClave(nueva) {
  if (nueva.length < 8) return "La contraseña nueva debe tener al menos 8 caracteres.";
  if (!/\d/.test(nueva) || !/[a-záéíóúñ]/i.test(nueva)) return "Usa letras y al menos un número.";
  if (usuario && nueva.toLowerCase().includes(usuario)) return "La contraseña no puede contener tu usuario.";
  return "";
}
function statsCuidador(c) {
  const hoy = hoyISO();
  const rs = S.reservas.filter((r) => r.cuidador === c.id && r.estado !== "cancelada" && r.ingreso <= hoy);
  const resenas = rs.filter((r) => r.estrellas).sort((a, b) => b.salida.localeCompare(a.salida));
  const porCliente = {};
  rs.forEach((r) => { const k = ultimos9(r.cliente.telefono); porCliente[k] = (porCliente[k] || 0) + 1; });
  const repiten = Object.values(porCliente).filter((n) => n > 1).length;
  const seis = rs.filter((r) => r.ingreso >= sumarDias(hoy, -180));
  const porCliente6 = {};
  seis.forEach((r) => { const k = ultimos9(r.cliente.telefono); porCliente6[k] = (porCliente6[k] || 0) + 1; });
  const unicos6 = Object.keys(porCliente6).length, repiten6 = Object.values(porCliente6).filter((n) => n > 1).length;
  const nota = resenas.length ? resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length : 0;
  const conResp = rs.filter((r) => r.respuestaMin != null);
  const respuesta = conResp.length ? conResp.reduce((s, r) => s + r.respuestaMin, 0) / conResp.length : null;
  const conReporte = rs.filter((r) => estadoDe(r) === "completada" && r.ingreso >= sumarDias(hoy, -60));
  const tasaReporte = conReporte.length ? conReporte.reduce((s, r) => s + Math.min(1, (r.reportes || []).length / r.noches), 0) / conReporte.length : null;
  const estrella = unicos6 >= 5 && repiten6 >= 2 && resenas.length >= 5 && nota >= 4.8 && respuesta !== null && respuesta <= 60;
  return { resenas, nota, repiten, estadias: rs.length, respuesta, tasaReporte, estrella, unicos6, repiten6 };
}
const ETIQUETA_ESTADO = { pagada: ["Pagada", "p-info"], en_curso: ["En curso", "p-bueno"], completada: ["Completada", "p-neutro"], cancelada: ["Cancelada", "p-critico"] };
const pastillaEstado = (e) => '<span class="pastilla ' + ETIQUETA_ESTADO[e][1] + '">' + ETIQUETA_ESTADO[e][0] + "</span>";
const kpi = (n, v, nota) => '<div class="kpi"><span class="nombre">' + n + '</span><span class="valor">' + v + "</span>" + (nota ? '<span class="nota">' + nota + "</span>" : "") + "</div>";
const campoTexto = (id, rot, v, tipo, ph) => '<div class="campo"><label for="' + id + '">' + rot + '</label><input type="' + tipo + '" id="' + id + '" value="' + esc(v) + '" placeholder="' + esc(ph) + '"></div>';
const opcionesRadio = (name, opciones, valor) => '<div class="chips">' + opciones.map((o) => '<label class="chip"><input type="radio" name="' + name + '" value="' + o + '"' + (valor === o ? " checked" : "") + "><span>" + o + "</span></label>").join("") + "</div>";

/* ---------- Fotos: se comprimen en el navegador antes de subirlas ---------- */
function comprimir(archivo, max, calidad) {
  return new Promise((resolver, rechazar) => {
    if (!archivo.type.startsWith("image/")) { rechazar(new Error("tipo")); return; }
    const lector = new FileReader();
    lector.onerror = rechazar;
    lector.onload = () => {
      const img = new Image();
      img.onerror = rechazar;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(img.width * k); lienzo.height = Math.round(img.height * k);
        lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
        resolver(lienzo.toDataURL("image/jpeg", calidad));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

/* ---------- Fichas y reportes ---------- */
const huespedesDe = (r) => r.huespedes && r.huespedes.length ? r.huespedes : [{ nombre: r.perro.nombre, edad: "", raza: "", tamano: r.perro.tamano, sexo: "", medicamento: "", medicamentoDetalle: "", alimentacion: r.perro.indicaciones || "", juguetes: "", comportamiento: [], comportamientoOtro: "", sociable: "" }];
function fichaHtml(r) {
  const fila = (k, v) => '<div><span class="tenue">' + k + "</span><br>" + esc(v || "-") + "</div>";
  const cl = r.cliente;
  return '<div class="pila" style="gap:12px;margin-top:10px"><div class="casa-datos" style="grid-template-columns:repeat(2,1fr)">' + fila("Dueño", cl.nombre) + fila("Teléfono", "+51 " + ultimos9(cl.telefono)) + fila("Dirección", cl.direccion) + fila("Referencia", cl.referencia) + "</div>" +
    huespedesDe(r).map((h) => '<div class="casa-datos" style="grid-template-columns:repeat(2,1fr);border-top:1px solid var(--linea);padding-top:10px">' + fila("Perrito", h.nombre) + fila("Edad", h.edad) + fila("Raza / tamaño", h.raza + " / " + h.tamano) + fila("Sexo", h.sexo) +
      fila("Medicamento o condición", h.medicamento === "Sí" ? h.medicamentoDetalle : "No") + fila("Alimentación", h.alimentacion) + fila("Juguetes o artículos", h.juguetes || "Ninguno") + fila("Comportamiento", (h.comportamiento || []).concat(h.comportamientoOtro ? [h.comportamientoOtro] : []).join(", ")) + fila("Sociable con otros perros", h.sociable) + "</div>").join("") + "</div>";
}
function htmlReporte(rep) {
  const items = [["pis", "Hizo pis"], ["caca", "Hizo caca"], ["comida", "Comió"], ["agua", "Tomó agua"], ["juego", "Jugó"]];
  return '<div class="reporte"><div class="fila" style="justify-content:space-between"><b>' + fCorta(rep.fecha) + '</b><span class="tenue">' + hora(rep.ts) + '</span></div><div class="iconos">' +
    items.map(([k, n]) => '<span class="icono-rep ' + (rep[k] ? "si" : "no") + '">' + (rep[k] ? "✓ " : "") + n + "</span>").join("") + "</div>" +
    (rep.nota ? "<p>" + esc(rep.nota) + "</p>" : "") + (rep.fotos && rep.fotos.length ? '<div class="fotos-rep">' + rep.fotos.map((f) => '<a href="' + esc(f) + '" target="_blank" rel="noopener"><img src="' + esc(f) + '" alt="Foto del reporte" loading="lazy"></a>').join("") + "</div>" : "") + "</div>";
}

/* ---------- Ingreso ---------- */
function vistaLogin() {
  const esCuidador = ROL === "cuidador";
  return '<form class="tarjeta pila login" id="form-login"><div><p class="etiqueta">' + (esCuidador ? "Panel del cuidador" : "Panel de Hospedoggy") + '</p><h2 style="margin-top:6px">Ingresa a tu cuenta</h2></div>' +
    campoTexto("l-usuario", "Usuario", "", "text", "") + campoTexto("l-clave", "Contraseña", "", "password", "") +
    '<p class="error" id="error-login" role="alert"></p><button class="boton boton-sol" type="submit">Ingresar</button>' +
    (esCuidador ? '<p class="tenue">Las cuentas de cuidador las crea Hospedoggy después de la visita de verificación. Si quieres ser cuidador, escríbenos por Instagram a @hospedoggy. ¿Olvidaste tu contraseña? Pídele a Hospedoggy una temporal.</p>' : "") + "</form>";
}
function formClave(obligatorio) {
  const c = ROL === "cuidador" && S ? S.cuidadores[0] : null;
  return '<form class="tarjeta pila" id="form-clave" style="max-width:520px">' + (obligatorio ? '<div><p class="etiqueta">Primer ingreso</p><h2 style="margin-top:6px">Crea tu propia contraseña</h2><p class="suave" style="margin-top:6px">' +
    (ROL === "cuidador" ? "Hospedoggy te dio una contraseña temporal." : "Esta es una contraseña temporal.") + " Cámbiala para que solo tú puedas entrar a tu panel.</p></div>" : "<h3>Cambiar contraseña</h3>") +
    '<p class="tenue">Usuario: <b>' + esc(usuario) + "</b>" + (c && c.claveCambiada && !obligatorio ? " · último cambio " + hora(c.claveCambiada) : "") + "</p>" +
    campoTexto("k-actual", obligatorio ? "Contraseña temporal" : "Contraseña actual", "", "password", "") + campoTexto("k-nueva", "Contraseña nueva", "", "password", "Mínimo 8 caracteres, con letras y números") + campoTexto("k-repite", "Repite la contraseña nueva", "", "password", "") +
    '<p class="error" id="error-clave" role="alert"></p><div><button class="boton boton-sol" type="submit">Guardar contraseña</button></div>' +
    (ROL === "cuidador" ? '<p class="tenue">¿La olvidaste? Pídele a Hospedoggy una contraseña temporal nueva.</p>' : "") + "</form>";
}

/* ---------- Chat (panel del cuidador) ---------- */
const archivado = (r) => r.archivadoCuidador === true || (r.archivadoCuidador === undefined && estadoDe(r) === "completada");
function hilosCuidador(c) {
  const rs = S.reservas.filter((r) => r.cuidador === c.id && ["pagada", "en_curso", "completada"].includes(estadoDe(r)));
  const completadas = rs.filter((r) => estadoDe(r) === "completada").sort((a, b) => b.salida.localeCompare(a.salida)).slice(0, 30);
  const lista = rs.filter((r) => estadoDe(r) !== "completada").concat(completadas);
  const nom = (n) => n.split(" ")[0];
  return lista.map((r) => ({ id: r.id, codigo: r.codigo, titulo: r.perro.nombre + " · " + nom(r.cliente.nombre), sub: r.codigo + " · " + fCorta(r.ingreso), estado: estadoDe(r), otro: nom(r.cliente.nombre) + " (dueño de " + r.perro.nombre + ")", rango: fCorta(r.ingreso) + " → " + fCorta(r.salida), archivado: archivado(r) }));
}
function vistaChat(todos) {
  const nArch = todos.filter((h) => h.archivado).length;
  const hilos = todos.filter((h) => !!h.archivado === !!ui.verArchivados);
  const selector = '<div class="fila" style="justify-content:space-between;margin-bottom:10px"><div class="chips" role="tablist"><label class="chip"><input type="radio" name="bandeja" value="activos"' + (ui.verArchivados ? "" : " checked") + "><span>Activos (" + (todos.length - nArch) + ')</span></label><label class="chip"><input type="radio" name="bandeja" value="archivados"' + (ui.verArchivados ? " checked" : "") + "><span>Archivados (" + nArch + ')</span></label></div><button class="boton boton-chico" data-accion="recargar">Actualizar</button></div>';
  if (!hilos.length) return selector + '<div class="vacio">' + (ui.verArchivados ? "No tienes conversaciones archivadas." : "Todavía no hay conversaciones activas.") + "</div>";
  if (!hilos.some((h) => h.id === ui.hiloCuidador)) ui.hiloCuidador = hilos[0].id;
  const actual = hilos.find((h) => h.id === ui.hiloCuidador);
  const msgs = S.mensajes.filter((m) => m.hilo === actual.id);
  const borrador = ui.mensajes[actual.id] || "";
  const rapidas = ["¡Hola! Ya tenemos todo listo para recibirlo.", "Te confirmo el recojo entre 9 y 11 am.", "¿Tiene alguna indicación especial?"];
  const bienvenida = '<div class="burbuja sistema">Reserva ' + esc(actual.codigo) + " confirmada. Este chat conecta al dueño contigo. Por seguridad, tu número se mantiene privado: coordina aquí el recojo y todo lo de la estadía.<small>Hospedoggy</small></div>";
  return selector + '<div class="tarjeta chat"><div class="hilos" role="list">' + hilos.map((h) => {
    const ult = S.mensajes.filter((m) => m.hilo === h.id).slice(-1)[0];
    return '<button class="hilo" role="listitem" data-accion="hilo" data-id="' + h.id + '" aria-current="' + (h.id === actual.id) + '"><b>' + esc(h.titulo) + '</b><span class="fila" style="gap:6px">' + pastillaEstado(h.estado) + '<span class="tenue">' + esc(h.sub) + '</span></span><span class="tenue" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(ult ? ult.texto : "Sin mensajes") + "</span></button>";
  }).join("") + '</div><div class="conversacion"><div class="conv-cabeza fila" style="justify-content:space-between"><div><b>' + esc(actual.otro) + '</b> <span class="tenue">· ' + esc(actual.rango) + '</span></div><div class="fila" style="gap:6px"><button class="boton boton-chico" data-accion="archivar" data-id="' + actual.id + '" data-valor="' + (actual.archivado ? "0" : "1") + '">' + (actual.archivado ? "Desarchivar" : "Archivar") + '</button><button class="boton boton-chico" data-accion="reportar" data-id="' + actual.id + '">Reportar a Hospedoggy</button></div></div>' +
    '<div class="burbujas">' + bienvenida + msgs.map((m) => '<div class="burbuja ' + (m.de === "sistema" ? "sistema" : m.de === "cuidador" ? "mia" : "") + '">' + esc(m.texto) + "<small>" + hora(m.ts) + (m.oculto ? " · Hospedoggy ocultó un dato de contacto" : "") + "</small></div>").join("") + "</div>" +
    '<div class="respuestas-rapidas">' + rapidas.map((t) => '<button type="button" class="boton boton-chico" data-accion="rapida" data-texto="' + esc(t) + '">' + esc(t) + "</button>").join("") + "</div>" +
    '<form class="redactar" data-chat="1" data-id="' + actual.id + '"><label class="oculto" for="msg-chat">Mensaje</label><input type="text" id="msg-chat" placeholder="Escribe un mensaje" value="' + esc(borrador) + '" autocomplete="off" maxlength="1500"><button class="boton boton-tinta" type="submit">Enviar</button></form></div></div>';
}

/* ---------- Vista cuidador ---------- */
function vistaCuidador() {
  const c = S.cuidadores[0];
  const tabs = [["hoy", "Hoy"], ["reservas", "Reservas"], ["mensajes", "Mensajes"], ["tarifas", "Tarifas y temporadas"], ["plazas", "Plazas"], ["perfil", "Perfil"], ["pagos", "Pagos"], ["cuenta", "Cuenta"]];
  const mias = S.reservas.filter((r) => r.cuidador === c.id);
  let cuerpo = "";
  if (ui.pestanaCuidador === "hoy") cuerpo = cuidadorHoy(c, mias);
  if (ui.pestanaCuidador === "reservas") cuerpo = cuidadorReservas(c, mias);
  if (ui.pestanaCuidador === "mensajes") cuerpo = vistaChat(hilosCuidador(c));
  if (ui.pestanaCuidador === "tarifas") cuerpo = cuidadorTarifas(c);
  if (ui.pestanaCuidador === "plazas") cuerpo = cuidadorPlazas(c);
  if (ui.pestanaCuidador === "perfil") cuerpo = cuidadorPerfil(c);
  if (ui.pestanaCuidador === "pagos") cuerpo = cuidadorPagos(c, mias);
  if (ui.pestanaCuidador === "cuenta") cuerpo = formClave(false);
  const st = statsCuidador(c);
  return '<div class="cabeza-vista"><div><p class="etiqueta">Panel del cuidador</p><h1>' + esc(c.nombreInterno) + '</h1><p class="suave">En Hospedoggy apareces como «' + esc(c.nombrePublico) + "». " + (st.estrella ? '<span class="insignia">★ Cuidador estrella</span>' : "") + (verificado(c) ? "" : ' <span class="pastilla p-aviso">Todavía no visible para clientes</span>') + '</p></div><button class="boton" data-accion="salir">Cerrar sesión</button></div>' +
    '<p class="ok" id="aviso-global" role="status"></p><div class="pestanas" role="tablist">' + tabs.map(([k, n]) => '<button role="tab" aria-selected="' + (ui.pestanaCuidador === k) + '" data-accion="pestana-cuidador" data-id="' + k + '">' + n + "</button>").join("") + "</div>" + cuerpo;
}
function cuidadorHoy(c, mias) {
  const hoy = hoyISO();
  const enCasa = mias.filter((r) => estadoDe(r) === "en_curso");
  const llegan = mias.filter((r) => r.ingreso === sumarDias(hoy, 1) && r.estado !== "cancelada");
  const st = statsCuidador(c);
  const faltan = [];
  if (st.unicos6 < 5) faltan.push("clientes distintos en 6 meses: " + st.unicos6 + " de 5");
  if (st.repiten6 < 2) faltan.push("clientes que repiten en 6 meses: " + st.repiten6 + " de 2");
  if (st.nota < 4.8) faltan.push("calificación: " + st.nota.toFixed(2) + " de 4.80");
  if (st.respuesta === null || st.respuesta > 60) faltan.push("respuesta promedio: " + (st.respuesta === null ? "-" : Math.round(st.respuesta) + " min") + " de 60 min");
  return '<div class="kpis-principales" style="margin-bottom:18px">' + kpi("Perros hoy", ocupadas(c.id, hoy) + " de " + plazasDe(c, hoy), "plazas ocupadas") + kpi("Llegan mañana", llegan.length, llegan.map((r) => esc(r.perro.nombre)).join(", ") || "ninguno") +
    kpi("Reportes de hoy", enCasa.filter((r) => (r.reportes || []).some((p) => p.fecha === hoy)).length + " de " + enCasa.length, "tu hora de envío: " + horaReporte(c)) + kpi("Por cobrar", soles(mias.filter(porTransferir).reduce((s, r) => s + r.costo, 0)), "Hospedoggy te transfiere") + "</div>" +
    (st.estrella ? "" : '<div class="alerta" style="margin-bottom:16px"><span class="icono" style="background:var(--sol)" aria-hidden="true">★</span><p><b>Para ser Cuidador estrella te falta:</b> ' + faltan.join("; ") + ". Los cuidadores estrella aparecen primero en la búsqueda.</p></div>") +
    '<h3 style="margin-bottom:12px">Reportes de los que están en casa</h3>' + (enCasa.length ? '<div class="pila">' + enCasa.map((r) => {
      const hecho = (r.reportes || []).find((p) => p.fecha === hoy);
      return '<div class="tarjeta pila"><div class="fila" style="justify-content:space-between"><h4>' + esc(r.perro.nombre) + ' <span class="tenue">· ' + esc(r.perro.tamano) + " · " + r.codigo + " · sale " + fCorta(r.salida) + "</span></h4>" + (hecho ? '<span class="pastilla p-bueno">Reporte enviado</span>' : '<span class="pastilla p-aviso">Falta el reporte</span>') + "</div>" +
        (r.perro.indicaciones ? '<p class="tenue">' + esc(r.perro.indicaciones) + "</p>" : "") +
        (hecho ? htmlReporte(hecho) : '<form class="pila" data-reporte="' + r.id + '"><div class="chips">' + [["pis", "Hizo pis"], ["caca", "Hizo caca"], ["comida", "Comió"], ["agua", "Tomó agua"], ["juego", "Jugó"]].map(([k, n]) => '<label class="chip"><input type="checkbox" name="' + k + '"><span>' + n + "</span></label>").join("") + "</div>" +
          '<div class="campo"><label for="nota-' + r.id + '">Cómo estuvo hoy</label><textarea id="nota-' + r.id + '" name="nota" maxlength="1500" placeholder="Ej. Corrió en el jardín y durmió siesta al sol."></textarea></div>' +
          '<div class="campo"><label for="fotos-' + r.id + '">Fotos del día (hasta 4)</label><input type="file" id="fotos-' + r.id + '" name="fotos" accept="image/*" multiple></div>' +
          '<p class="error" role="alert"></p><div><button class="boton boton-sol" type="submit">Enviar reporte a ' + esc(r.cliente.nombre.split(" ")[0]) + "</button></div></form>") + "</div>";
    }).join("") + "</div>" : '<div class="vacio">Hoy no tienes perros en casa.</div>');
}
function cuidadorReservas(c, mias) {
  const prox = mias.filter((r) => ["pagada", "en_curso"].includes(estadoDe(r)));
  const pasadas = mias.filter((r) => estadoDe(r) === "completada").slice(-10).reverse();
  const tarjeta = (r) => '<div class="tarjeta pila" style="gap:8px"><div class="fila" style="justify-content:space-between"><h4>' + esc(r.perro.nombre) + ' <span class="tenue">· ' + esc(r.perro.tamano) + (r.perros > 1 ? " · " + r.perros + " perros" : "") + " · " + r.codigo + "</span></h4>" + pastillaEstado(estadoDe(r)) + "</div>" +
    '<div class="fila tenue"><span>' + fCorta(r.ingreso) + " → " + fCorta(r.salida) + " (" + plural(r.noches, "noche", "noches") + ")</span><span>Recojo: " + esc(r.cliente.direccion) + "</span></div>" +
    '<details><summary class="tenue" style="cursor:pointer;font-weight:600">Ver ficha completa del dueño y del perro</summary>' + fichaHtml(r) + "</details>" +
    '<div class="fila" style="justify-content:space-between"><b>Recibes ' + soles(r.costo) + '</b><button class="boton boton-chico" data-accion="ir-chat-cuidador" data-id="' + r.id + '">Escribir al dueño</button></div></div>';
  return '<div class="pila"><h3>En casa y próximas</h3>' + (prox.length ? prox.map(tarjeta).join("") : '<div class="vacio">No tienes reservas próximas.</div>') +
    (pasadas.length ? '<h3 style="margin-top:12px">Últimas estadías</h3>' + pasadas.map(tarjeta).join("") : "") + "</div>";
}
function cuidadorTarifas(c) {
  const t = ui.tarifasBorrador || (ui.tarifasBorrador = JSON.parse(JSON.stringify({ tarifa: c.tarifa, movilidad: c.movilidad, movilidadGratisPrimera: c.movilidadGratisPrimera, perroAdicional: c.perroAdicional, descuentoLarga: c.descuentoLarga, temporadaActiva: c.temporadaActiva, temporadas: c.temporadas })));
  return '<form class="tarjeta pila" id="form-tarifas" style="max-width:860px"><div><h3>Lo que cobras a Hospedoggy</h3><p class="suave" style="margin-top:4px">Estos montos son privados, es lo que le cobras a Hospedoggy por tus servicios como cuidador.</p></div>' +
    '<div class="rejilla-3"><div class="campo"><label for="t-tarifa">Por noche, temporada regular (S/)</label><input type="number" min="1" step="1" id="t-tarifa" value="' + t.tarifa + '"></div>' +
    '<div class="campo"><label for="t-adicional">Por cada perro adicional, por noche (S/)</label><input type="number" min="0" step="1" id="t-adicional" value="' + t.perroAdicional + '"></div>' +
    '<div class="campo"><label for="t-movilidad">Recojo y regreso, ida y vuelta (S/)</label><input type="number" min="0" step="1" id="t-movilidad" value="' + t.movilidad + '"></div></div>' +
    '<div class="rejilla-3"><div class="campo"><label for="t-larga-noches">Descuento desde (noches)</label><input type="number" min="0" id="t-larga-noches" value="' + t.descuentoLarga.noches + '"></div>' +
    '<div class="campo"><label for="t-larga-pct">Descuento por estadía larga (%)</label><input type="number" min="0" max="50" id="t-larga-pct" value="' + t.descuentoLarga.pct + '"></div>' +
    '<div class="campo"><span class="rotulo">Promoción</span><label class="fila" style="font-weight:500;min-height:44px"><input type="checkbox" id="t-regalo"' + (t.movilidadGratisPrimera ? " checked" : "") + "> Movilidad gratis en la primera estadía</label></div></div>" +
    '<hr style="border:0;border-top:1px solid var(--linea);width:100%"><label class="fila" style="font-weight:700"><input type="checkbox" id="t-alta"' + (t.temporadaActiva ? " checked" : "") + '> Cobro otra tarifa en temporada alta <span class="tenue" style="font-weight:500">(opcional)</span></label>' +
    '<div id="t-rangos" class="pila' + (t.temporadaActiva ? "" : " oculto") + '">' + t.temporadas.map((r, i) =>
      '<div class="rango" data-i="' + i + '"><div class="campo"><label for="t-desde-' + i + '">Desde</label><input type="date" id="t-desde-' + i + '" value="' + r.desde + '" data-campo="desde"></div><div class="campo"><label for="t-hasta-' + i + '">Hasta (incluida)</label><input type="date" id="t-hasta-' + i + '" value="' + r.hasta + '" data-campo="hasta"></div>' +
      '<div class="campo"><label for="t-precio-' + i + '">Por noche (S/)</label><input type="number" min="1" id="t-precio-' + i + '" value="' + r.tarifa + '" data-campo="tarifa"></div><button type="button" class="boton boton-chico" data-accion="quitar-rango" data-i="' + i + '" aria-label="Quitar rango ' + (i + 1) + '">Quitar</button></div>').join("") +
    '<div><button type="button" class="boton boton-chico" data-accion="agregar-rango">+ Agregar rango de fechas</button></div></div>' +
    '<p class="error" id="error-tarifas" role="alert"></p><div class="fila"><button class="boton boton-sol" type="submit">Guardar tarifas</button></div></form>';
}
function cuidadorPlazas(c) {
  const hoy = hoyISO();
  const b = ui.plazasBorrador || (ui.plazasBorrador = { plazas: c.plazas, especiales: JSON.parse(JSON.stringify(c.plazasEspeciales || [])) });
  const inicio = sumarDias(hoy, -((aFecha(hoy).getUTCDay() + 6) % 7));
  let celdas = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => '<div class="cal-cab">' + d + "</div>").join("");
  for (let i = 0; i < 56; i++) {
    const iso = sumarDias(inicio, i);
    const o = ocupadas(c.id, iso);
    const pl = plazasDe(c, iso);
    const libresDia = Math.max(0, pl - o);
    const ratio = pl ? libresDia / pl : 0;
    const color = ratio >= 0.5 ? "verde" : ratio >= 0.2 ? "amarillo" : "rojo";
    celdas += '<div class="cal-dia sem-' + color + '"' + (iso < hoy ? ' style="opacity:.45"' : "") + ' title="' + fCorta(iso) + ": " + o + " de " + pl + ' ocupadas"><b>' + aFecha(iso).getUTCDate() + " " + MESES[aFecha(iso).getUTCMonth()] + (ajustado(c, iso) ? " ◆" : "") +
      '</b><span class="ocup">' + (pl === 0 ? "Cerrado" : plural(libresDia, "libre", "libres")) + "</span></div>";
  }
  const filas = b.especiales.map((p, i) => '<div class="rango" data-i="' + i + '" style="grid-template-columns:1fr 1fr;border:1px solid var(--linea);border-radius:12px;padding:10px"><div class="campo"><label for="pe-desde-' + i + '">Desde</label><input type="date" id="pe-desde-' + i + '" value="' + p.desde + '" data-campo="desde"></div>' +
    '<div class="campo"><label for="pe-hasta-' + i + '">Hasta (incluida)</label><input type="date" id="pe-hasta-' + i + '" value="' + p.hasta + '" data-campo="hasta"></div>' +
    '<div class="campo"><label for="pe-plazas-' + i + '">Plazas</label><input type="number" min="0" max="50" id="pe-plazas-' + i + '" value="' + p.plazas + '" data-campo="plazas"></div>' +
    '<button type="button" class="boton boton-chico" data-accion="quitar-plaza-especial" data-i="' + i + '" aria-label="Quitar ajuste ' + (i + 1) + '" style="align-self:end">Quitar</button></div>').join("");
  return '<div class="graficos" style="grid-template-columns:minmax(300px,380px) 1fr;margin-top:0"><form class="tarjeta pila" id="form-plazas" style="align-self:start;min-width:0"><h3>Plazas de tu casa</h3><p class="suave">Cuántos perros puedes recibir a la vez. Cada perro de una reserva pagada ocupa una plaza en sus noches.</p>' +
    '<div class="campo"><label for="p-plazas">Plazas para todas las fechas</label><input type="number" min="0" max="50" id="p-plazas" value="' + b.plazas + '"></div>' +
    "<details" + (b.especiales.length ? " open" : "") + '><summary style="cursor:pointer;font-weight:700">Configuración avanzada: plazas por fechas</summary><div class="pila" style="margin-top:12px"><p class="tenue">Úsala si en unas fechas recibes más o menos perros, o pon 0 para cerrar esos días. Lo que pongas aquí reemplaza a las plazas generales solo en esas fechas.</p>' +
    filas + '<div><button type="button" class="boton boton-chico" data-accion="agregar-plaza-especial">+ Agregar fechas</button></div></div></details>' +
    '<p class="error" id="error-plazas" role="alert"></p><div><button class="boton boton-sol" type="submit">Guardar plazas</button></div></form>' +
    '<div class="tarjeta pila"><h3>Próximas 8 semanas</h3><div class="calendario">' + celdas + '</div><div class="leyenda-cal"><span><i class="sem-verde"></i>Muchas libres (50% o más)</span><span><i class="sem-amarillo"></i>Algunas libres (20% a 49%)</span><span><i class="sem-rojo"></i>Pocas, ninguna o cerrado</span><span>◆ Fecha con plazas ajustadas</span></div></div></div>';
}
function cuidadorPerfil(c) {
  const casa = c.casa;
  const casilla = (id, v, n) => '<label class="fila" style="font-weight:500;gap:8px"><input type="checkbox" id="' + id + '"' + (v ? " checked" : "") + ">" + n + "</label>";
  const pend = c.descripcionPendiente;
  return '<form class="tarjeta pila" id="form-perfil" style="max-width:820px"><h3>Cómo te ven los clientes</h3>' +
    '<div><span class="rotulo" style="font-weight:600;font-size:14px">Fotos de tu casa</span>' + (c.fotos.length ? '<div class="fotos-rep" style="margin-top:8px">' + c.fotos.map((f) => '<img src="' + esc(f.src) + '" alt="' + esc(f.leyenda) + '" loading="lazy">').join("") + "</div>" : "") +
    '<p class="tenue" style="margin-top:6px">Las fotos las toma y sube Hospedoggy en la visita de verificación, para que el cliente vea la casa tal como es. Si quieres cambiarlas, escríbenos.</p></div>' +
    '<div class="campo"><span class="rotulo">Nombre público</span><div class="pista" style="font-family:var(--cuerpo);font-size:16px"><b id="vista-nombre">' + esc(nombrePublicoDe(c)) + "</b></div>" +
    '<p class="tenue">Se arma solo con el tipo de vivienda, un rasgo de la casa y tu distrito. En Hospedoggy los clientes eligen casas verificadas, no marcas, así que no se usan nombres de empresas.</p></div>' +
    '<div class="rejilla-2"><div class="campo"><label for="f-tipo">Tipo de vivienda</label><select id="f-tipo">' + ["Casa de campo", "Casa", "Departamento"].map((t) => "<option" + (casa.tipo === t ? " selected" : "") + ">" + t + "</option>").join("") + "</select></div>" +
    '<div class="campo"><label for="f-rasgo">Rasgo de la casa</label><select id="f-rasgo">' + RASGOS.map((t) => '<option value="' + t + '"' + ((c.rasgo || "") === t ? " selected" : "") + ">" + (t || "Ninguno") + "</option>").join("") + "</select></div></div>" +
    '<p class="tenue">Distrito: ' + esc(c.distrito) + ". Si te mudas, avísale a Hospedoggy: el distrito se cambia después de una nueva visita.</p>" +
    '<div class="campo"><label for="f-descripcion">Descripción</label><textarea id="f-descripcion" maxlength="1500">' + esc(pend ? pend.texto : c.descripcion) + "</textarea>" +
    '<p class="tenue">' + (pend ? "Tu nueva descripción está en revisión desde el " + hora(pend.ts) + ". Mientras tanto, los clientes ven la anterior." : "Cada cambio lo revisa Hospedoggy antes de publicarse. No incluyas teléfonos, correos, redes, páginas web ni el nombre de tu negocio.") + "</p></div>" +
    '<div class="campo" style="max-width:320px"><label for="f-hora">Hora de envío de los reportes</label><select id="f-hora">' + HORAS_REPORTE.map((h) => "<option" + (horaReporte(c) === h ? " selected" : "") + ">" + h + "</option>").join("") + "</select>" +
    '<p class="tenue">Los clientes ven esta hora antes de reservar, así que cúmplela todos los días.</p></div>' +
    '<div class="campo"><span class="rotulo">Tamaños que aceptas</span><div class="chips">' + ["pequeño", "mediano", "grande"].map((t) => '<label class="chip"><input type="checkbox" name="f-tamano" value="' + t + '"' + (c.tamanos.includes(t) ? " checked" : "") + "><span>" + t + "</span></label>").join("") + "</div></div>" +
    '<div class="rejilla-2">' + casilla("f-jardin", casa.jardin, "Tiene jardín cercado") + casilla("f-residentes", casa.perrosResidentes, "Tengo perros propios") + casilla("f-ninos", casa.ninos, "Hay niños en casa") + casilla("f-todoeldia", casa.todoElDia, "Alguien está en casa todo el día") + casilla("f-fuma", casa.fumadores, "Se fuma en casa") + "</div>" +
    '<hr style="border:0;border-top:1px solid var(--linea);width:100%"><h3>Dónde te avisamos</h3>' + campoTexto("f-whatsapp", "WhatsApp de contacto con Hospedoggy", c.whatsapp ? "+" + c.whatsapp : "", "tel", "+51 9XX XXX XXX") +
    '<p class="tenue">Solo lo usa Hospedoggy. Los avisos de reservas te llegan al correo ' + esc(c.email || "que registró Hospedoggy") + '. Los clientes nunca ven tu número: hablan contigo por el chat del panel.</p>' +
    '<p class="error" id="error-perfil" role="alert"></p><div><button class="boton boton-sol" type="submit">Guardar perfil</button></div></form>';
}
function cuidadorPagos(c, mias) {
  const rs = mias.filter((r) => r.estado !== "cancelada").slice().sort((a, b) => b.ingreso.localeCompare(a.ingreso)).slice(0, 40);
  const pend = mias.filter(porTransferir).reduce((s, r) => s + r.costo, 0);
  const pag = mias.filter((r) => r.pagadoCuidador).reduce((s, r) => s + r.costo, 0);
  const p = c.pago || {};
  const estado = (r) => r.pagadoCuidador ? '<span class="pastilla p-bueno">Transferido ' + hora(r.transferidoEn) + "</span>" :
    disponibleDesde(r) > ahora() ? '<span class="pastilla p-neutro">Desde el ' + fCorta(disponibleDesde(r).slice(0, 10)) + "</span>" : '<span class="pastilla p-aviso">A más tardar el ' + fCorta(r.ingreso) + "</span>";
  return '<div class="kpis-principales" style="grid-template-columns:repeat(2,minmax(0,280px));margin-bottom:16px">' + kpi("Por cobrar", soles(pend), "de reservas pagadas por clientes") + kpi("Ya cobrado", soles(pag), "desde que te uniste") + "</div>" +
    '<p class="tenue" style="margin-bottom:10px">' + (politicaCancelacion() === "siete" ? "Hospedoggy te paga cuando la reserva ya no se puede cancelar (" + DIAS_CANCELACION + " días antes del ingreso) y, como máximo, en la fecha de inicio del servicio." : "Hospedoggy te paga entre la confirmación del pago del cliente y, como máximo, la fecha de inicio del servicio.") + "</p>" +
    '<div class="graficos" style="grid-template-columns:1.4fr 1fr;margin-top:0"><div class="tabla-env"><table><thead><tr><th>Código</th><th>Huésped</th><th>Ingreso</th><th class="num">Recibes</th><th>Pago</th></tr></thead><tbody>' +
    (rs.length ? rs.map((r) => "<tr><td>" + r.codigo + "</td><td>" + esc(r.perro.nombre) + "</td><td>" + fCorta(r.ingreso) + '</td><td class="num">' + soles(r.costo) + "</td><td>" + estado(r) + "</td></tr>").join("") : '<tr><td colspan="5" class="tenue">Todavía no tienes reservas pagadas.</td></tr>') + "</tbody></table></div>" +
    '<form class="tarjeta pila" id="form-metodo-pago" style="align-self:start"><h3>Dónde te pagamos</h3><p class="suave">Hospedoggy usa estos datos solo para transferirte. Revísalos bien: un dato errado retrasa tu pago.</p>' +
    '<div class="campo"><span class="rotulo">Método</span>' + opcionesRadio("mp-metodo", ["Yape", "Plin", "Transferencia"], p.metodo) + "</div>" +
    '<div class="pila' + (p.metodo === "Transferencia" ? " oculto" : "") + '" id="mp-celular-bloque">' + campoTexto("mp-celular", "Celular de Yape o Plin", p.celular ? "+" + p.celular : "", "tel", "+51 9XX XXX XXX") + "</div>" +
    '<div class="pila' + (p.metodo === "Transferencia" ? "" : " oculto") + '" id="mp-banco-bloque"><div class="rejilla-2"><div class="campo"><label for="mp-banco">Banco</label><select id="mp-banco">' + ["BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Banco de la Nación", "Otro"].map((x) => "<option" + (p.banco === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></div>" +
    '<div class="campo"><label for="mp-tipo">Tipo de cuenta</label><select id="mp-tipo">' + ["Ahorros", "Corriente"].map((x) => "<option" + (p.tipoCuenta === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></div></div>" +
    campoTexto("mp-numero", "Número de cuenta", p.numero || "", "text", "Solo números") + campoTexto("mp-cci", "CCI (20 dígitos)", p.cci || "", "text", "Para transferencias de otros bancos") + "</div>" +
    campoTexto("mp-titular", "Titular", p.titular || "", "text", "Nombre completo del titular") + campoTexto("mp-dni", "DNI o RUC del titular", p.dni || "", "text", "Opcional") +
    '<p class="error" id="error-metodo" role="alert"></p><div><button class="boton boton-sol" type="submit">Guardar método de pago</button></div></form></div>';
}

/* ---------- Vista administrador ---------- */
function vistaAdmin() {
  const abiertas = S.incidencias.filter((i) => !i.resuelta).length;
  const tabs = [["resumen", "Resumen"], ["reservas", "Reservas"], ["cuidadores", "Cuidadores y fotos"], ["incidencias", "Incidencias" + (abiertas ? " (" + abiertas + ")" : "")], ["pagos", "Pagos a cuidadores"], ["avisos", "Correos enviados"], ["config", "Configuración"], ["cuenta", "Cuenta"]];
  let cuerpo = "";
  if (ui.pestanaAdmin === "resumen") cuerpo = adminResumen();
  if (ui.pestanaAdmin === "reservas") cuerpo = adminReservas();
  if (ui.pestanaAdmin === "cuidadores") cuerpo = adminCuidadores();
  if (ui.pestanaAdmin === "incidencias") cuerpo = adminIncidencias();
  if (ui.pestanaAdmin === "pagos") cuerpo = adminPagos();
  if (ui.pestanaAdmin === "avisos") cuerpo = adminAvisos();
  if (ui.pestanaAdmin === "config") cuerpo = adminConfig();
  if (ui.pestanaAdmin === "cuenta") cuerpo = formClave(false);
  return '<div class="cabeza-vista"><div><p class="etiqueta">Panel de Hospedoggy</p><h1>Tablero del negocio</h1></div><button class="boton" data-accion="salir">Cerrar sesión</button></div>' +
    '<p class="ok" id="aviso-global" role="status"></p><div class="pestanas" role="tablist">' + tabs.map(([k, n]) => '<button role="tab" aria-selected="' + (ui.pestanaAdmin === k) + '" data-accion="pestana-admin" data-id="' + k + '">' + n + "</button>").join("") + "</div>" + cuerpo;
}
function metricas(dias) {
  const hoy = hoyISO();
  const desde = sumarDias(hoy, -dias);
  const enPeriodo = S.reservas.filter((r) => r.ingreso >= desde && r.ingreso <= hoy);
  const validas = enPeriodo.filter((r) => r.estado !== "cancelada");
  const gmv = validas.reduce((s, r) => s + r.total, 0);
  const retenido = enPeriodo.filter((r) => r.estado === "cancelada").reduce((s, r) => s + (r.retenido || 0), 0);
  const margen = validas.reduce((s, r) => s + r.margen, 0) + retenido;
  const noches = validas.reduce((s, r) => s + r.noches, 0);
  const activos = S.cuidadores.filter(verificado);
  let capacidad = 0, vendidas = 0;
  for (let i = 0; i < dias; i++) { const iso = sumarDias(desde, i); for (const c of activos) { if (iso >= c.desde) { capacidad += plazasDe(c, iso); vendidas += ocupadas(c.id, iso); } } }
  const porCliente = {};
  S.reservas.filter((r) => r.estado !== "cancelada" && r.ingreso <= hoy).forEach((r) => { const k = ultimos9(r.cliente.telefono); porCliente[k] = (porCliente[k] || 0) + 1; });
  const clientesPeriodo = [...new Set(validas.map((r) => ultimos9(r.cliente.telefono)))];
  const repiten = clientesPeriodo.filter((n) => porCliente[n] > 1).length;
  const resenas = validas.filter((r) => r.estrellas);
  const intentos = S.intentos.filter((i) => i.fecha >= desde && i.fecha <= hoy);
  const futuras = S.reservas.filter((r) => r.ingreso > hoy && r.estado !== "cancelada");
  const terminadas = validas.filter((r) => estadoDe(r) === "completada");
  const conResp = validas.filter((r) => r.respuestaMin != null);
  return {
    gmv, margen, retenido, tasa: gmv ? margen / gmv : 0, noches, ocupacion: capacidad ? vendidas / capacidad : 0, adr: noches ? gmv / noches : 0,
    estadia: validas.length ? noches / validas.length : 0, reservas: validas.length, repiten: clientesPeriodo.length ? repiten / clientesPeriodo.length : 0,
    estrellas: resenas.length ? resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length : 0, nResenas: resenas.length,
    cancelacion: enPeriodo.length ? (enPeriodo.length - validas.length) / enPeriodo.length : 0,
    anticipacion: validas.length ? validas.reduce((s, r) => s + difDias(r.creada, r.ingreso), 0) / validas.length : 0,
    conversion: intentos.length ? intentos.filter((i) => i.pagado).length / intentos.length : 0,
    respuesta: conResp.length ? conResp.reduce((s, r) => s + r.respuestaMin, 0) / conResp.length : null,
    reportes: terminadas.length ? terminadas.reduce((s, r) => s + Math.min(1, (r.reportes || []).length / r.noches), 0) / terminadas.length : 0,
    futuras: futuras.reduce((s, r) => s + r.total, 0), nFuturas: futuras.length,
    porPagar: S.reservas.filter(porTransferir).reduce((s, r) => s + r.costo, 0)
  };
}
function alertas() {
  const hoy = hoyISO();
  const lista = [];
  const abiertas = S.incidencias.filter((i) => !i.resuelta);
  const perfiles = S.cuidadores.filter((c) => c.descripcionPendiente).length;
  const seguro = parteMinimaCuidador();
  if (politicaCancelacion() === "siete" && reembolsoPct() > seguro.pct) lista.push(["critico", "%", "La devolución por cancelación (" + reembolsoPct() + "%) supera la parte más baja de un cuidador (" + seguro.pct + "%, " + esc(seguro.donde) + "). Bájala en Configuración para no perder tu comisión."]);
  if (perfiles) lista.push(["info", "✎", "Hay " + plural(perfiles, "cambio de perfil", "cambios de perfil") + " por aprobar en Cuidadores y fotos."]);
  if (abiertas.length) lista.push(["critico", "!", "Hay <b>" + plural(abiertas.length, "incidencia abierta", "incidencias abiertas") + "</b> en Incidencias. Revisa primero las de intento de pago por fuera."]);
  for (const c of S.cuidadores.filter(verificado)) {
    let pico = null;
    for (let i = 0; i < 60; i++) { const iso = sumarDias(hoy, i); const o = ocupadas(c.id, iso); const pl = plazasDe(c, iso); if (pl && o / pl >= 0.7 && (!pico || o > pico.o)) pico = { iso, o, pl }; }
    if (pico) lista.push(["serio", "!", "<b>" + esc(c.nombrePublico) + "</b> llega a " + pico.o + " de " + pico.pl + " plazas el " + fCorta(pico.iso) + ". Si sigue la demanda, suma un cuidador o sube la tarifa de esas fechas."]);
    if (!c.fotos.length) lista.push(["aviso", "📷", "<b>" + esc(c.nombrePublico) + "</b> no tiene fotos. Las casas con fotos reales generan más confianza; súbelas en Cuidadores y fotos."]);
    if (!c.tieneClave) lista.push(["aviso", "🔑", "<b>" + esc(c.nombreInterno) + "</b> todavía no tiene contraseña para su panel. Créale una en Cuidadores y fotos."]);
  }
  const devoluciones = S.reservas.filter((r) => r.devolucionPendiente > 0);
  if (devoluciones.length) lista.push(["critico", "↩", "Tienes <b>" + soles(devoluciones.reduce((x, r) => x + r.devolucionPendiente, 0)) + "</b> por devolver a mano a " + plural(devoluciones.length, "cliente", "clientes") + ": la devolución automática falló. Revisa Pagos a cuidadores."]);
  for (const c of S.cuidadores) {
    const rs = S.reservas.filter((r) => r.cuidador === c.id && listoParaTransferir(r));
    if (!rs.length) continue;
    const monto = rs.reduce((s, r) => s + r.costo, 0);
    const vence = rs.map(venceTransferencia).sort()[0];
    const h = horasRestantes(vence);
    if (h > 72) continue;
    lista.push([h < 0 ? "critico" : h <= 24 ? "serio" : "aviso", "S/", "Debes transferir <b>" + soles(monto) + "</b> a " + esc(c.nombreInterno) + (h < 0 ? ". <b>Venció hace " + plural(-h, "hora", "horas") + ".</b>" : ". Vence en " + plural(h, "hora", "horas") + ".") + (c.pago && c.pago.metodo ? "" : " Todavía no registró su método de pago.")]);
  }
  for (const c of S.cuidadores.filter((x) => !verificado(x) && x.activo)) {
    const hechos = Object.values(c.verificacion).filter(Boolean).length;
    lista.push(["info", hechos + "/4", "<b>" + esc(c.nombrePublico) + "</b> va " + hechos + " de 4 pasos de verificación. No aparece para los clientes hasta completarlos."]);
  }
  return lista;
}
function adminResumen() {
  const m = metricas(ui.periodo);
  const al = alertas();
  const colores = { critico: "var(--critico)", serio: "var(--serio)", aviso: "var(--aviso)", info: "var(--seq-2)" };
  const nombres = { critico: "Urgente", serio: "Atención", aviso: "Pendiente", info: "En proceso" };
  return '<div class="fila" style="justify-content:space-between;margin-bottom:14px"><p class="suave">Estadías que empezaron en el periodo elegido. Las canceladas no suman a la venta.</p><div class="chips" role="radiogroup" aria-label="Periodo">' +
    [[30, "30 días"], [90, "90 días"], [180, "6 meses"]].map(([d, n]) => '<label class="chip"><input type="radio" name="periodo" value="' + d + '"' + (ui.periodo === d ? " checked" : "") + "><span>" + n + "</span></label>").join("") + "</div></div>" +
    '<div class="kpis-principales">' + kpi("Venta total (GMV)", soles(m.gmv), plural(m.reservas, "reserva", "reservas")) + kpi("Margen Hospedoggy", soles(m.margen), "comisión efectiva " + pct(m.tasa) + (m.retenido ? " · incluye " + soles(m.retenido) + " de cancelaciones" : "")) +
    kpi("Ocupación", pct(m.ocupacion), m.noches + " noches vendidas") + kpi("Ya cobrado a futuro", soles(m.futuras), plural(m.nFuturas, "estadía por venir", "estadías por venir")) + "</div>" +
    '<div class="kpis-secundarios">' + kpi("Tarifa media por noche", soles(m.adr), "precio al público") + kpi("Estadía promedio", m.estadia.toFixed(1) + " noches", "") +
    kpi("Clientes que repiten", pct(m.repiten), "con 2 o más reservas") + kpi("Calificación", m.nResenas ? "★ " + m.estrellas.toFixed(2) : "-", plural(m.nResenas, "reseña", "reseñas")) +
    kpi("Días con reporte", pct(m.reportes), "en estadías terminadas") + kpi("Cancelaciones", pct(m.cancelacion), "de las reservas") +
    kpi("Anticipación", Math.round(m.anticipacion) + " días", "entre la reserva y el ingreso") + kpi("Conversión del pago", pct(m.conversion), "pagos iniciados que se completaron") +
    kpi("Respuesta del cuidador", m.respuesta === null ? "-" : Math.round(m.respuesta) + " min", "al primer mensaje") + kpi("Por transferir", soles(m.porPagar), "a cuidadores") + "</div>" +
    (al.length ? '<div class="alertas">' + al.map(([t, i, txt]) => '<div class="alerta"><span class="icono" style="background:' + colores[t] + '" aria-hidden="true">' + i + '</span><p><span class="pastilla p-' + (t === "info" ? "info" : t) + '" style="margin-right:6px">' + nombres[t] + "</span>" + txt + "</p></div>").join("") + "</div>" : "") +
    '<div class="graficos">' + bloqueGrafico("g-meses", "Venta y margen por mes", "Por mes de ingreso. Los meses que vienen muestran lo ya cobrado.", tablaMeses()) +
    bloqueGrafico("g-ocupacion", "Ocupación de los próximos 45 días", "Plazas ocupadas sobre el total de cuidadores verificados.", "") + "</div>" +
    '<div class="graficos" style="grid-template-columns:1fr 1fr">' + bloqueGrafico("g-canales", "Reservas por canal", "De dónde llegan los clientes en el periodo.", tablaCanales()) +
    bloqueGrafico("g-anticipacion", "Con cuánta anticipación reservan", "Días entre la reserva y el ingreso.", "") + "</div>" +
    '<div style="margin-top:14px"><h3 style="margin-bottom:10px">Rendimiento por cuidador</h3>' + tablaCuidadores(false) + "</div>";
}
const bloqueGrafico = (id, t, sub, tabla) => '<div class="grafico"><div><h3>' + t + '</h3><p class="tenue">' + sub + '</p></div><div class="lienzo"><canvas id="' + id + '" role="img" aria-label="' + esc(t) + '"></canvas></div>' + (tabla ? "<details><summary>Ver como tabla</summary>" + tabla + "</details>" : "") + "</div>";
function serieMeses() {
  const hoy = hoyISO();
  const base = aFecha(hoy.slice(0, 7) + "-01");
  const meses = [];
  for (let k = -5; k <= 2; k++) { const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, 1)); meses.push(aISO(d).slice(0, 7)); }
  return meses.map((ym) => { const rs = S.reservas.filter((r) => r.ingreso.slice(0, 7) === ym && r.estado !== "cancelada"); return { ym, venta: rs.reduce((s, r) => s + r.total, 0), margen: rs.reduce((s, r) => s + r.margen, 0), noches: rs.reduce((s, r) => s + r.noches, 0) }; });
}
const tablaMeses = () => '<table><thead><tr><th>Mes</th><th class="num">Venta</th><th class="num">Margen</th><th class="num">Noches</th></tr></thead><tbody>' + serieMeses().map((m) => "<tr><td>" + fMes(m.ym) + '</td><td class="num">' + soles(m.venta) + '</td><td class="num">' + soles(m.margen) + '</td><td class="num">' + m.noches + "</td></tr>").join("") + "</tbody></table>";
function serieCanales() {
  const desde = sumarDias(hoyISO(), -ui.periodo);
  const cuenta = {};
  S.reservas.filter((r) => r.creada >= desde && r.estado !== "cancelada").forEach((r) => { cuenta[r.canal] = (cuenta[r.canal] || 0) + 1; });
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
}
const tablaCanales = () => '<table><thead><tr><th>Canal</th><th class="num">Reservas</th></tr></thead><tbody>' + serieCanales().map(([c, n]) => "<tr><td>" + esc(c) + '</td><td class="num">' + n + "</td></tr>").join("") + "</tbody></table>";
function tablaCuidadores(gestion) {
  const hoy = hoyISO();
  const filas = S.cuidadores.map((c) => {
    const rs = S.reservas.filter((r) => r.cuidador === c.id && r.estado !== "cancelada" && r.ingreso >= sumarDias(hoy, -90) && r.ingreso <= hoy);
    let cap = 0, ven = 0; for (let i = 0; i < 90; i++) { const iso = sumarDias(hoy, -90 + i); if (iso >= c.desde) { cap += plazasDe(c, iso); ven += ocupadas(c.id, iso); } }
    const st = statsCuidador(c);
    const estado = verificado(c) ? '<span class="pastilla p-bueno">Visible</span>' : c.activo ? '<span class="pastilla p-aviso">En verificación</span>' : '<span class="pastilla p-neutro">Pausado</span>';
    const verif = gestion ? '<div class="verif">' + [["visita", "Visita"], ["entrevista", "Entrevista"], ["emergencia", "Plan de emergencia"], ["seguimiento", "Seguimiento"]].map(([k, n]) => '<label><input type="checkbox" data-accion="verif" data-id="' + c.id + '" data-paso="' + k + '"' + (c.verificacion[k] ? " checked" : "") + ">" + n + "</label>").join("") + "</div>" : "";
    return "<tr><td><b>" + esc(c.nombrePublico) + "</b>" + (st.estrella ? ' <span class="insignia">★</span>' : "") + '<br><span class="tenue">' + esc(c.nombreInterno) + " · " + esc(c.distrito) + (gestion ? " · usuario " + esc(c.usuario || "-") : "") + "</span></td><td>" + estado + (gestion ? '<br><button class="boton boton-chico" style="margin-top:6px" data-accion="pausar" data-id="' + c.id + '">' + (c.activo ? "Pausar" : "Reactivar") + "</button>" : "") + "</td>" +
      (gestion ? '<td><div class="pila" style="gap:6px"><button class="boton boton-chico" data-accion="gestionar-fotos" data-id="' + c.id + '">' + (ui.fotosDe === c.id ? "Ocultar fotos" : "Fotos (" + c.fotos.length + ")") + '</button><button class="boton boton-chico" data-accion="editar-cuidador" data-id="' + c.id + '">' + (ui.editarDe === c.id ? "Cerrar datos" : "Datos y contacto") + '</button><button class="boton boton-chico" data-accion="reset-clave" data-id="' + c.id + '">' + (c.tieneClave ? "Nueva contraseña" : "Crear contraseña") + "</button>" + (!c.tieneClave ? '<span class="tenue">Sin contraseña todavía</span>' : c.debeCambiarClave ? '<span class="tenue">Con contraseña temporal</span>' : "") + "</div></td>" : "") +
      '<td class="num">' + c.plazas + '</td><td class="num">' + (cap ? pct(ven / cap) : "-") + '</td><td class="num">' + soles(rs.reduce((s, r) => s + r.total, 0)) + '</td><td class="num">' + soles(rs.reduce((s, r) => s + r.margen, 0)) + '</td><td class="num">' + (st.resenas.length ? "★ " + st.nota.toFixed(1) : "-") + '</td><td class="num">' + st.repiten + '</td><td class="num">' + (st.respuesta !== null ? Math.round(st.respuesta) + " min" : "-") + '</td><td class="num">' + (st.tasaReporte === null ? "-" : pct(st.tasaReporte)) + "</td>" +
      '<td class="num">S/' + c.tarifa + (c.temporadaActiva && c.temporadas.length ? " · alta S/" + Math.max(...c.temporadas.map((t) => t.tarifa)) : "") + "</td>" + (gestion ? "<td>" + verif + "</td>" : "") + "</tr>";
  }).join("");
  return '<div class="tabla-env"><table><thead><tr><th>Cuidador</th><th>Estado</th>' + (gestion ? "<th>Gestión</th>" : "") + '<th class="num">Plazas</th><th class="num">Ocupación 90 d</th><th class="num">Venta 90 d</th><th class="num">Margen 90 d</th><th class="num">Calificación</th><th class="num">Repiten</th><th class="num">Respuesta</th><th class="num">Días con reporte</th><th class="num">Costo por noche</th>' + (gestion ? "<th>Verificación</th>" : "") + "</tr></thead><tbody>" + filas + "</tbody></table></div>";
}
function gestorFotos(c) {
  return '<div class="tarjeta pila" style="margin-top:16px" id="gestor-fotos"><div><h3>Fotos de ' + esc(c.nombrePublico) + '</h3><p class="suave">Solo Hospedoggy sube estas fotos, idealmente en la visita de verificación. La primera es la portada que ve el cliente en la búsqueda.</p></div>' +
    '<div class="gestor-fotos">' + c.fotos.map((f, i) => '<div class="foto-item"><img src="' + esc(f.src) + '" alt="' + esc(f.leyenda || "Foto " + (i + 1)) + '" loading="lazy"><div class="acciones"><label class="oculto" for="leyenda-' + i + '">Leyenda</label><input type="text" id="leyenda-' + i + '" data-leyenda="' + i + '" data-cuidador="' + c.id + '" value="' + esc(f.leyenda) + '" placeholder="Leyenda, ej. El jardín" maxlength="80">' +
      '<div class="fila" style="gap:6px">' + (i === 0 ? '<span class="pastilla p-bueno">Portada</span>' : '<button class="boton boton-chico" data-accion="foto-portada" data-id="' + c.id + '" data-foto="' + i + '">Hacer portada</button>') + '<button class="boton boton-chico" data-accion="foto-quitar" data-id="' + c.id + '" data-foto="' + i + '">Quitar</button></div></div></div>').join("") +
    '<label class="subir" for="subir-fotos"><span style="font-size:28px">＋</span><span>Subir fotos</span><span class="tenue">JPG o PNG, puedes elegir varias</span><input type="file" id="subir-fotos" accept="image/*" multiple data-cuidador="' + c.id + '"></label></div>' +
    '<p class="tenue" id="estado-fotos" role="status"></p></div>';
}
function editorCuidador(c) {
  return '<form class="tarjeta pila" id="form-editar" data-id="' + c.id + '" style="margin-top:16px;max-width:900px"><h3>Datos de ' + esc(c.nombreInterno) + '</h3><p class="suave">Datos privados: el cliente solo ve la dirección después de pagar, y nunca ve el correo ni el WhatsApp.</p><div class="rejilla-2">' +
    campoTexto("e-interno", "Nombre real o razón social", c.nombreInterno, "text", "") + campoTexto("e-distrito", "Distrito", c.distrito, "text", "") +
    campoTexto("e-direccion", "Dirección exacta (se comparte al pagar)", c.direccion, "text", "Ej. Calle Las Flores 123, Cieneguilla") + campoTexto("e-email", "Correo (le llegan las reservas)", c.email, "email", "cuidador@correo.com") +
    campoTexto("e-whatsapp", "WhatsApp", c.whatsapp ? "+" + c.whatsapp : "", "tel", "+51 9XX XXX XXX") + "</div>" +
    '<div class="campo"><label for="e-servicios">Qué incluye (uno por línea)</label><textarea id="e-servicios" rows="5">' + esc(c.servicios.join("\n")) + "</textarea></div>" +
    '<div class="campo"><label for="e-descripcion">Descripción publicada</label><textarea id="e-descripcion" maxlength="1500">' + esc(c.descripcion) + "</textarea></div>" +
    '<p class="error" id="error-editar" role="alert"></p><div><button class="boton boton-sol" type="submit">Guardar datos</button></div></form>';
}
function adminReservas() {
  let rs = S.reservas.slice().sort((a, b) => b.ingreso.localeCompare(a.ingreso));
  if (ui.filtroEstado !== "todas") rs = rs.filter((r) => estadoDe(r) === ui.filtroEstado);
  const q = ui.buscarTexto.toLowerCase();
  if (q) rs = rs.filter((r) => (r.codigo + " " + r.cliente.nombre + " " + r.perro.nombre).toLowerCase().includes(q));
  return '<div class="fila" style="margin-bottom:14px"><div class="campo" style="min-width:220px"><label for="f-buscar">Buscar</label><input type="text" id="f-buscar" placeholder="Código, cliente o perro" value="' + esc(ui.buscarTexto) + '"></div>' +
    '<div class="campo"><label for="f-estado">Estado</label><select id="f-estado">' + [["todas", "Todas"], ["pagada", "Pagadas"], ["en_curso", "En curso"], ["completada", "Completadas"], ["cancelada", "Canceladas"]].map(([v, n]) => '<option value="' + v + '"' + (ui.filtroEstado === v ? " selected" : "") + ">" + n + "</option>").join("") + '</select></div><p class="tenue" style="align-self:end;padding-bottom:10px">' + plural(rs.length, "reserva", "reservas") + "</p></div>" +
    '<div class="tabla-env" style="max-height:620px"><table><thead><tr><th>Código</th><th>Cliente</th><th>Perro</th><th>Cuidador</th><th>Ingreso</th><th class="num">Noches</th><th class="num">Cobrado</th><th class="num">Al cuidador</th><th class="num">Margen</th><th>Canal</th><th>Estado</th><th></th></tr></thead><tbody>' +
    (rs.length ? rs.map((r) => { const e = estadoDe(r); const c = cuidador(r.cuidador); return "<tr><td>" + r.codigo + "</td><td>" + esc(r.cliente.nombre) + '<br><span class="tenue">+51 ' + ultimos9(r.cliente.telefono) + "</span></td><td>" + esc(r.perro.nombre) + ' <span class="tenue">' + esc(r.perro.tamano) + "</span></td><td>" + esc(c ? c.nombreInterno : r.cuidador) + "</td><td>" + fCorta(r.ingreso) + '</td><td class="num">' + r.noches + '</td><td class="num">' + soles(r.total) + '</td><td class="num">' + soles(r.costo) + '</td><td class="num">' + soles(r.estado === "cancelada" ? r.retenido : r.margen) + "</td><td>" + esc(r.canal) + "</td><td>" + pastillaEstado(e) + (r.estadoReal === "reembolsada_sin_cupo" ? '<br><span class="tenue">Sin cupo, devuelta</span>' : r.canceladaPor === "hospedoggy" ? '<br><span class="tenue">Por excepción</span>' : "") + "</td><td>" + (e === "pagada" ? '<button class="boton boton-chico" data-accion="pedir-cancelar" data-id="' + r.id + '" title="Solo para casos de fuerza mayor">Cancelar por excepción</button>' : "") + "</td></tr>"; }).join("") : '<tr><td colspan="12" class="tenue">No hay reservas con ese filtro.</td></tr>') + "</tbody></table></div>";
}
function adminCuidadores() {
  const pendientes = S.cuidadores.filter((c) => c.descripcionPendiente);
  return (pendientes.length ? '<div class="tarjeta pila" style="margin-bottom:16px"><h3>Cambios de perfil por aprobar</h3><p class="suave">Cada perfil se revisa a mano antes de publicarse. El sistema ya bloqueó teléfonos, enlaces, redes y razones sociales; revisa que tampoco haya un nombre de marca.</p>' +
      pendientes.map((c) => '<div class="resena"><b>' + esc(c.nombrePublico) + ' <span class="tenue">· ' + esc(c.nombreInterno) + " · enviado " + hora(c.descripcionPendiente.ts) + '</span></b><p class="tenue">Antes: ' + esc(c.descripcion || "(vacía)") + "</p><p>Ahora: " + esc(c.descripcionPendiente.texto) + '</p><div class="fila"><button class="boton boton-chico boton-sol" data-accion="aprobar-desc" data-id="' + c.id + '">Aprobar</button><button class="boton boton-chico" data-accion="rechazar-desc" data-id="' + c.id + '">Rechazar</button></div></div>').join("") + "</div>" : "") +
    tablaCuidadores(true) + (ui.fotosDe && cuidador(ui.fotosDe) ? gestorFotos(cuidador(ui.fotosDe)) : "") + (ui.editarDe && cuidador(ui.editarDe) ? editorCuidador(cuidador(ui.editarDe)) : "") +
    '<form class="tarjeta pila" id="form-nuevo" style="margin-top:18px;max-width:900px"><h3>Crear cuenta de cuidador</h3><p class="suave">Solo Hospedoggy crea cuentas de cuidador: nadie puede registrarse por su cuenta. La casa se crea en verificación y no aparece para los clientes hasta que marques los cuatro pasos. La contraseña es temporal: el cuidador la cambia al primer ingreso en <b>' + esc(location.origin) + '/cuidador/</b>.</p><div class="rejilla-3">' +
    campoTexto("n-interno", "Nombre real", "", "text", "Ej. Rosa Díaz") + campoTexto("n-distrito", "Distrito", "", "text", "Ej. Santiago de Surco") +
    campoTexto("n-usuario", "Usuario", "", "text", "Ej. patiosurco") + campoTexto("n-clave", "Contraseña temporal", claveTemporal(), "text", "Mínimo 8 caracteres") + campoTexto("n-whatsapp", "WhatsApp", "", "tel", "+51 9XX XXX XXX") + campoTexto("n-email", "Correo (le llegan las reservas)", "", "email", "Opcional") +
    '</div><p class="error" id="error-nuevo" role="alert"></p><div><button class="boton boton-sol" type="submit">Crear cuidador</button></div></form>';
}
function claveTemporal() { const a = "abcdefghjkmnpqrstuvwxyz23456789"; const n = new Uint32Array(10); crypto.getRandomValues(n); return Array.from(n, (x) => a[x % a.length]).join(""); }
function adminIncidencias() {
  const lista = S.incidencias.slice().reverse();
  if (!lista.length) return '<div class="vacio">No hay incidencias.</div>';
  return '<p class="suave" style="margin-bottom:14px">Lo que clientes y cuidadores reportan desde el chat, más los intentos de compartir datos de contacto que el sistema detecta solo.</p><div class="pila">' + lista.map((i) => {
    const r = S.reservas.find((x) => x.id === i.hilo);
    return '<div class="tarjeta pila" style="gap:8px"><div class="fila" style="justify-content:space-between"><h4>' + esc(i.motivo) + "</h4>" + (i.resuelta ? '<span class="pastilla p-bueno">Resuelta</span>' : '<span class="pastilla p-critico">Abierta</span>') + "</div>" +
      '<p class="tenue">' + (i.auto ? "Detectada automáticamente" : "Reportada por el " + esc(i.de)) + " · " + hora(i.ts) + (r ? " · " + r.codigo + " · " + esc((cuidador(r.cuidador) || {}).nombreInterno || "") + " · cliente " + esc(r.cliente.nombre) + " (+51 " + ultimos9(r.cliente.telefono) + ")" : "") + "</p>" +
      (i.texto ? "<p>«" + esc(i.texto) + "»</p>" : "") + (i.resuelta ? "" : '<div><button class="boton boton-chico" data-accion="resolver" data-id="' + i.id + '">Marcar como resuelta</button></div>') + "</div>";
  }).join("") + "</div>";
}
function adminPagos() {
  const grupos = S.cuidadores.map((c) => {
    const todas = S.reservas.filter((r) => r.cuidador === c.id && porTransferir(r)).sort((a, b) => a.ingreso.localeCompare(b.ingreso));
    const rs = todas.filter(listoParaTransferir), espera = todas.filter((r) => !listoParaTransferir(r));
    return { c, rs, espera, monto: rs.reduce((s, r) => s + r.costo, 0), montoEspera: espera.reduce((s, r) => s + r.costo, 0) };
  }).filter((g) => g.rs.length || g.espera.length);
  const devoluciones = S.reservas.filter((r) => r.devolucionPendiente > 0);
  const datosPago = (c) => {
    const p = c.pago || {};
    if (!p.metodo) return '<p class="error">Este cuidador todavía no registró su método de pago. Pídele que lo complete en su panel, en Pagos.</p>';
    const dato = (k, v) => v ? '<div><span class="tenue">' + k + '</span><br><b style="font-variant-numeric:tabular-nums">' + esc(v) + '</b> <button class="boton boton-chico" data-accion="copiar" data-texto="' + esc(v) + '">Copiar</button></div>' : "";
    return '<div class="casa-datos" style="grid-template-columns:repeat(2,1fr)">' + dato("Método", p.metodo) + (p.metodo === "Transferencia" ? dato("Banco", p.banco + " · " + p.tipoCuenta) + dato("Cuenta", p.numero) + dato("CCI", p.cci) : dato(p.metodo, "+" + p.celular)) + dato("Titular", p.titular) + dato("DNI o RUC", p.dni) + "</div>";
  };
  return '<p class="suave" style="margin-bottom:14px">Los pagos de los clientes ya llegan confirmados por Mercado Pago. ' + (politicaCancelacion() === "siete" ? "Le pagas al cuidador cuando la reserva ya no se puede cancelar (" + DIAS_CANCELACION + " días antes del ingreso) y, como máximo, el día de inicio del servicio." : "Puedes pagarle al cuidador desde la confirmación del pago, como máximo hasta el día de inicio del servicio.") + "</p>" +
    (devoluciones.length ? '<h3 style="margin-bottom:10px">Devoluciones que debes hacer a mano</h3><p class="tenue" style="margin-bottom:8px">La devolución automática de Mercado Pago falló. Hazla desde tu cuenta de Mercado Pago (Actividad, el pago, Devolver) y márcala aquí.</p><div class="tabla-env" style="margin-bottom:22px"><table><thead><tr><th>Código</th><th>Cliente</th><th>Canceló</th><th class="num">Pagó</th><th class="num">Devolver</th><th></th></tr></thead><tbody>' +
      devoluciones.map((r) => "<tr><td>" + r.codigo + "</td><td>" + esc(r.cliente.nombre) + "</td><td>" + (r.canceladaPor === "hospedoggy" ? "Hospedoggy, por excepción" : r.estadoReal === "reembolsada_sin_cupo" ? "Sin cupo al pagar" : "El cliente, dentro del plazo") + '</td><td class="num">' + soles(r.total) + '</td><td class="num">' + soles(r.devolucionPendiente) + '</td><td><button class="boton boton-chico boton-sol" data-accion="devolucion-hecha" data-id="' + r.id + '">Ya devolví</button></td></tr>').join("") + "</tbody></table></div>" : "") +
    '<h3 style="margin-bottom:10px">Transferencias a cuidadores</h3>' + (grupos.length ? '<div class="pila">' + grupos.map((g) => {
      const h = g.rs.length ? horasRestantes(venceTransferencia(g.rs[0])) : null;
      const plazo = h === null ? '<span class="pastilla p-neutro">Nada por pagar todavía</span>' : h < 0 ? '<span class="pastilla p-critico">Vencido: el servicio ya empezó</span>' : '<span class="pastilla ' + (h <= 24 ? "p-serio" : "p-aviso") + '">Vence el ' + fCorta(g.rs[0].ingreso) + " (en " + plural(h, "hora", "horas") + ")</span>";
      return '<div class="tarjeta pila"><div class="fila" style="justify-content:space-between"><div><h3>' + esc(g.c.nombreInterno) + "</h3>" + plazo + '</div><span class="precio" style="font-size:28px">' + soles(g.monto) + "</span></div>" +
        datosPago(g.c) + (g.rs.length ? '<p class="tenue">Para pagar ahora: ' + g.rs.map((r) => r.codigo + " (" + soles(r.costo) + ", a más tardar el " + fCorta(r.ingreso) + ")").join(" · ") + "</p>" : "") +
        (g.espera.length ? '<p class="tenue">Más adelante: ' + soles(g.montoEspera) + " de " + g.espera.map((r) => r.codigo + " (desde el " + fCorta(disponibleDesde(r).slice(0, 10)) + ")").join(" · ") + ". Todavía se pueden cancelar.</p>" : "") +
        (g.rs.length ? '<div class="fila"><div class="campo" style="min-width:220px"><label for="op-' + g.c.id + '">N.° de operación (opcional)</label><input type="text" id="op-' + g.c.id + '" maxlength="40"></div><button class="boton boton-sol" style="align-self:end" data-accion="pagar-cuidador" data-id="' + g.c.id + '">Marcar ' + soles(g.monto) + " como transferido</button></div>" : "") + "</div>";
    }).join("") + "</div>" : '<div class="vacio">No hay transferencias pendientes.</div>');
}
function adminAvisos() {
  const lista = S.avisos;
  return '<p class="suave" style="margin-bottom:14px">Correos automáticos que salieron al pagarse o cancelarse una reserva, con cada mensaje del chat y con cada reporte. Mientras no verifiques tu dominio, todos te llegan a ti con «[Reenviar a ...]».</p>' +
    (lista.length ? '<div class="tabla-env" style="max-height:620px"><table><thead><tr><th>Fecha</th><th>Para</th><th>Asunto</th><th>Estado</th></tr></thead><tbody>' + lista.map((a) => "<tr><td>" + hora(a.ts) + "</td><td>" + esc(a.para) + "</td><td>" + esc(a.asunto) + "</td><td>" + (a.ok ? '<span class="pastilla p-bueno">Enviado</span>' : '<span class="pastilla p-critico">Falló</span>') + "</td></tr>").join("") + "</tbody></table></div>" : '<div class="vacio">Todavía no se envió ningún correo.</div>');
}
function adminConfig() {
  const c1 = S.cuidadores.find(verificado) || S.cuidadores[0];
  const m = parteMinimaCuidador();
  return '<form class="tarjeta pila" id="form-config" style="max-width:760px"><h3>Cómo se calcula el precio al público</h3><p class="suave">Precio al público = costo del cuidador más tu margen, redondeado hacia arriba.</p><div class="rejilla-3">' +
    '<div class="campo"><label for="c-noche">Margen sobre la noche (%)</label><input type="number" min="0" max="200" id="c-noche" value="' + S.config.margenNoche + '"></div>' +
    '<div class="campo"><label for="c-mov">Margen sobre la movilidad (%)</label><input type="number" min="0" max="200" id="c-mov" value="' + S.config.margenMovilidad + '"></div>' +
    '<div class="campo"><label for="c-red">Redondear a</label><select id="c-red">' + [1, 5, 10].map((v) => '<option value="' + v + '"' + (S.config.redondeo === v ? " selected" : "") + ">S/" + v + "</option>").join("") + "</select></div></div>" +
    (c1 ? '<p class="tenue">Ejemplo con ' + esc(c1.nombreInterno) + ": cobra S/" + c1.tarifa + " y el público ve " + soles(precioPublico(c1.tarifa, S.config.margenNoche)) + " por noche.</p>" : "") +
    '<h3 style="margin-top:8px">Cancelaciones</h3>' + opcionesRadio("c-cancelacion", ["No se admiten", "Hasta 7 días antes"], politicaCancelacion() === "siete" ? "Hasta 7 días antes" : "No se admiten") +
    '<div class="campo" style="max-width:360px"><label for="c-reembolso">Devolución si el cliente cancela a tiempo (%)</label><input type="number" min="0" max="100" id="c-reembolso" value="' + reembolsoPct() + '"></div>' +
    '<p class="tenue">Es el mismo porcentaje para todas las reservas, así el cliente no puede deducir cuánto cobra el cuidador. Máximo seguro hoy: <b>' + m.pct + "%</b>. Es la parte más baja que se lleva un cuidador sobre lo que paga el cliente (" + esc(m.donde) + "). Mientras la devolución no pase de ese número, tu comisión siempre queda cubierta.</p>" +
    '<p class="tenue">El pago al cuidador recién se abre cuando ya no se puede cancelar, así que nunca le pagas por una estadía que después se cae. Los cambios valen para las reservas nuevas.</p><p class="error" id="error-config" role="alert"></p>' +
    '<div><button class="boton boton-sol" type="submit">Guardar</button></div></form>';
}

/* ---------- Gráficos ---------- */
function dibujarGraficos() {
  Object.values(graficos).forEach((g) => g && g.destroy());
  if (!$("#g-meses")) return;
  if (!window.Chart) { $$(".lienzo").forEach((l) => { l.innerHTML = '<div class="vacio">No se pudo cargar la librería de gráficos. Revisa tu conexión.</div>'; }); return; }
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const texto = css("--tinta-suave"), grilla = css("--grilla"), s1 = css("--serie-1"), s2 = css("--serie-2"), sup = css("--superficie");
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.color = texto;
  const tip = { backgroundColor: css("--tinta"), titleColor: css("--fondo"), bodyColor: css("--fondo"), padding: 10, cornerRadius: 8, boxPadding: 4 };
  const ejeX = { grid: { display: false }, border: { color: grilla }, ticks: { color: texto } };
  const ejeY = (fmt) => ({ beginAtZero: true, grid: { color: grilla }, border: { display: false }, ticks: { color: texto, callback: fmt } });
  const barra = { borderRadius: 4, borderSkipped: "start" };
  const meses = serieMeses();
  graficos.meses = new Chart($("#g-meses"), { type: "bar", data: { labels: meses.map((m) => fMes(m.ym)), datasets: [
    { label: "Venta", data: meses.map((m) => m.venta), backgroundColor: s1, maxBarThickness: 26, ...barra },
    { label: "Margen", data: meses.map((m) => m.margen), backgroundColor: s2, maxBarThickness: 26, ...barra }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top", align: "start", labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, boxHeight: 10 } }, tooltip: { ...tip, callbacks: { label: (c) => c.dataset.label + ": " + soles(c.parsed.y) } } }, scales: { x: ejeX, y: ejeY((v) => "S/" + v.toLocaleString("es-PE")) } } });
  const hoy = hoyISO();
  const activos = S.cuidadores.filter(verificado);
  const dias = Array.from({ length: 45 }, (_, i) => sumarDias(hoy, i));
  const ocup = dias.map((iso) => { const cap = activos.reduce((s, c) => s + plazasDe(c, iso), 0); return cap ? Math.round(activos.reduce((s, c) => s + ocupadas(c.id, iso), 0) / cap * 100) : 0; });
  graficos.ocupacion = new Chart($("#g-ocupacion"), { type: "line", data: { labels: dias.map((d) => fCorta(d)), datasets: [{ label: "Ocupación", data: ocup, borderColor: s1, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: s1, pointHoverBorderColor: sup, pointHoverBorderWidth: 2, fill: true, backgroundColor: s1 + "22", tension: 0.25 }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: (c) => "Ocupación: " + c.parsed.y + "%" } } },
      scales: { x: { ...ejeX, ticks: { color: texto, maxTicksLimit: 7, maxRotation: 0 } }, y: { ...ejeY((v) => v + "%"), max: 100, ticks: { color: texto, callback: (v) => v + "%", stepSize: 25 } } } } });
  const canales = serieCanales();
  graficos.canales = new Chart($("#g-canales"), { type: "bar", data: { labels: canales.map((c) => c[0]), datasets: [{ label: "Reservas", data: canales.map((c) => c[1]), backgroundColor: s1, maxBarThickness: 22, ...barra }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: (c) => plural(c.parsed.x, "reserva", "reservas") } } }, scales: { x: { beginAtZero: true, grid: { color: grilla }, border: { display: false }, ticks: { color: texto, precision: 0 } }, y: { grid: { display: false }, border: { color: grilla }, ticks: { color: texto } } } } });
  const desde = sumarDias(hoy, -ui.periodo);
  const tramos = [["0 a 7", 0, 7], ["8 a 14", 8, 14], ["15 a 30", 15, 30], ["Más de 30", 31, 999]];
  const rs = S.reservas.filter((r) => r.creada >= desde && r.estado !== "cancelada");
  const cuentas = tramos.map(([, a, b]) => rs.filter((r) => { const d = difDias(r.creada, r.ingreso); return d >= a && d <= b; }).length);
  graficos.anticipacion = new Chart($("#g-anticipacion"), { type: "bar", data: { labels: tramos.map((t) => t[0] + " días"), datasets: [{ label: "Reservas", data: cuentas, backgroundColor: s1, maxBarThickness: 40, ...barra }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: (c) => plural(c.parsed.y, "reserva", "reservas") } } }, scales: { x: ejeX, y: { ...ejeY((v) => v), ticks: { color: texto, precision: 0 } } } } });
}

/* ---------- Ventanas ---------- */
function cerrarCapa() { $("#capa").innerHTML = ""; }
function mensajeModal(t) {
  $("#capa").innerHTML = '<div class="velo" role="alertdialog" aria-modal="true"><div class="modal"><div class="modal-cuerpo"><p>' + esc(t) + '</p><button class="boton boton-sol" data-accion="cerrar-capa">Entendido</button></div></div></div>';
  $("#capa .boton").focus();
}
function abrirReporte(hilo) {
  $("#capa").innerHTML = '<div class="velo" role="dialog" aria-modal="true" aria-labelledby="rep-titulo"><form class="modal" id="form-incidencia" data-hilo="' + hilo + '"><div class="modal-cuerpo"><h3 id="rep-titulo">Reportar a Hospedoggy</h3>' +
    '<div class="campo"><label for="inc-motivo">Motivo</label><select id="inc-motivo"><option>Me piden pagar por fuera de Hospedoggy</option><option>Comportamiento inadecuado</option><option>Problema con la salud o el cuidado de la mascota</option><option>Problema con el recojo o el regreso</option><option>Otro</option></select></div>' +
    '<div class="campo"><label for="inc-texto">Cuéntanos qué pasó</label><textarea id="inc-texto" maxlength="2000"></textarea></div><p class="tenue">Lo revisa el equipo de Hospedoggy. La otra parte no ve tu reporte.</p>' +
    '<div class="fila"><button type="button" class="boton" data-accion="cerrar-capa">Cancelar</button><button class="boton boton-sol" type="submit" style="flex:1">Enviar reporte</button></div></div></form></div>';
  $("#inc-motivo").focus();
}
function confirmarCancelacion(id) {
  const r = S.reservas.find((x) => x.id === id);
  $("#capa").innerHTML = '<div class="velo" role="dialog" aria-modal="true" aria-labelledby="can-titulo"><div class="modal"><div class="modal-cuerpo"><h3 id="can-titulo">¿Cancelar ' + esc(r.codigo) + ' por excepción?</h3>' +
    '<p class="suave">Úsalo solo por fuerza mayor (por ejemplo, el cuidador no puede recibirlo). Se devuelve el <b>100% (' + soles(r.total) + ")</b> al cliente por Mercado Pago y se avisa al cliente y al cuidador. No se puede deshacer." + (r.pagadoCuidador ? " <b>Ojo: ya le transferiste al cuidador.</b>" : "") + "</p>" +
    '<div class="fila"><button class="boton" data-accion="cerrar-capa">No, mantenerla</button><button class="boton boton-sol" data-accion="cancelar-excepcion" data-id="' + r.id + '" style="flex:1">Sí, cancelar y devolver todo</button></div></div></div></div>';
}

/* ---------- Pintar ---------- */
function render() {
  ui.sucio = false;
  const app = $("#app");
  // Si estabas escribiendo en el chat, al repintar no pierdes el foco ni la posición del cursor
  const foco = document.activeElement && document.activeElement.id === "msg-chat" ? document.activeElement.selectionStart : null;
  if (!sesion || !S) { app.innerHTML = vistaLogin(); const u = $("#l-usuario"); if (u) u.focus(); return; }
  if (debeCambiar) { app.innerHTML = '<div class="login" style="max-width:520px">' + formClave(true) + '</div><div style="text-align:center"><button class="boton boton-chico" data-accion="salir">Cerrar sesión</button></div>'; return; }
  app.innerHTML = ROL === "admin" ? vistaAdmin() : vistaCuidador();
  if (ui.aviso) { $("#aviso-global").textContent = ui.aviso; ui.aviso = ""; }
  if (ROL === "admin" && ui.pestanaAdmin === "resumen") dibujarGraficos();
  if (ROL === "cuidador" && ui.pestanaCuidador === "mensajes") { const b = $(".burbujas"); if (b) b.scrollTop = b.scrollHeight; }
  if (foco !== null) { const m = $("#msg-chat"); if (m) { m.focus(); m.setSelectionRange(foco, foco); } }
}

/* ---------- Eventos ---------- */
function leerPlazas() {
  const b = ui.plazasBorrador; const f = $("#form-plazas"); if (!b || !f) return;
  b.plazas = Number($("#p-plazas").value);
  $$(".rango", f).forEach((row) => { const i = Number(row.dataset.i); $$("input", row).forEach((inp) => { b.especiales[i][inp.dataset.campo] = inp.dataset.campo === "plazas" ? Number(inp.value) : inp.value; }); });
}
function leerRangos() {
  const b = ui.tarifasBorrador; const f = $("#form-tarifas"); if (!b || !f) return;
  b.tarifa = Number($("#t-tarifa").value); b.movilidad = Number($("#t-movilidad").value); b.movilidadGratisPrimera = $("#t-regalo").checked; b.temporadaActiva = $("#t-alta").checked;
  b.perroAdicional = Number($("#t-adicional").value); b.descuentoLarga = { noches: Number($("#t-larga-noches").value), pct: Number($("#t-larga-pct").value) };
  $$(".rango", f).forEach((row) => { const i = Number(row.dataset.i); $$("input", row).forEach((inp) => { b.temporadas[i][inp.dataset.campo] = inp.dataset.campo === "tarifa" ? Number(inp.value) : inp.value; }); });
}
const fotosDe = (id) => cuidador(id).fotos.map((f) => ({ url: f.url, leyenda: f.leyenda }));
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-accion]");
  if (!el || el.tagName === "INPUT") return;
  const a = el.dataset.accion, id = el.dataset.id;
  if (a === "cerrar-capa") cerrarCapa();
  if (a === "salir") { guardarSesion(""); S = null; debeCambiar = false; render(); }
  if (a === "recargar") { await cargar(); }
  // Al cambiar de pestaña se muestran los datos al instante y se actualizan desde el servidor
  if (a === "pestana-cuidador") { ui.pestanaCuidador = id; ui.tarifasBorrador = null; ui.plazasBorrador = null; render(); cargar(); }
  if (a === "pestana-admin") { ui.pestanaAdmin = id; render(); cargar(); }
  if (a === "hilo") { ui.hiloCuidador = id; render(); }
  if (a === "rapida") { const inp = $("#msg-chat"); inp.value = el.dataset.texto; inp.focus(); ui.mensajes[inp.closest("form").dataset.id] = inp.value; }
  if (a === "reportar") abrirReporte(id);
  if (a === "archivar") { const v = el.dataset.valor === "1"; if (v) ui.hiloCuidador = null; await accion({ accion: "archivar", reserva: id, valor: v }); }
  if (a === "ir-chat-cuidador") { ui.pestanaCuidador = "mensajes"; ui.hiloCuidador = id; ui.verArchivados = archivado(S.reservas.find((x) => x.id === id)); render(); }
  if (a === "agregar-plaza-especial") { leerPlazas(); const hoy = hoyISO(); ui.plazasBorrador.especiales.push({ desde: hoy, hasta: sumarDias(hoy, 2), plazas: S.cuidadores[0].plazas }); render(); }
  if (a === "quitar-plaza-especial") { leerPlazas(); ui.plazasBorrador.especiales.splice(Number(el.dataset.i), 1); render(); }
  if (a === "agregar-rango") { leerRangos(); const hoy = hoyISO(); ui.tarifasBorrador.temporadas.push({ desde: hoy, hasta: sumarDias(hoy, 3), tarifa: Number(ui.tarifasBorrador.tarifa) + 10 }); render(); }
  if (a === "quitar-rango") { leerRangos(); ui.tarifasBorrador.temporadas.splice(Number(el.dataset.i), 1); render(); }
  // Administrador
  if (a === "pausar") await accion({ accion: "pausar", id });
  if (a === "reset-clave") { const d = await accion({ accion: "reset-clave", id }); if (d && d.clave) mensajeModal(d.aviso); }
  if (a === "gestionar-fotos") { ui.fotosDe = ui.fotosDe === id ? null : id; ui.editarDe = null; render(); if (ui.fotosDe) $("#gestor-fotos").scrollIntoView({ behavior: "smooth" }); }
  if (a === "editar-cuidador") { ui.editarDe = ui.editarDe === id ? null : id; ui.fotosDe = null; render(); if (ui.editarDe) $("#form-editar").scrollIntoView({ behavior: "smooth" }); }
  if (a === "foto-portada") { const f = fotosDe(id); f.unshift(f.splice(Number(el.dataset.foto), 1)[0]); await accion({ accion: "fotos", id, fotos: f }); }
  if (a === "foto-quitar") { const f = fotosDe(id); f.splice(Number(el.dataset.foto), 1); await accion({ accion: "fotos", id, fotos: f }); }
  if (a === "aprobar-desc") await accion({ accion: "aprobar-desc", id });
  if (a === "rechazar-desc") await accion({ accion: "rechazar-desc", id });
  if (a === "resolver") await accion({ accion: "resolver", incidencia: id });
  if (a === "devolucion-hecha") await accion({ accion: "devuelto", reserva: id });
  if (a === "pagar-cuidador") await accion({ accion: "transferido", cuidador: id, operacion: ($("#op-" + id) || {}).value || "" });
  if (a === "pedir-cancelar") confirmarCancelacion(id);
  if (a === "cancelar-excepcion") { el.disabled = true; el.textContent = "Cancelando…"; const d = await accion({ accion: "cancelar", reserva: id }); if (d) cerrarCapa(); }
  if (a === "copiar") { const t = el.dataset.texto; try { navigator.clipboard.writeText(t).then(() => { el.textContent = "Copiado"; }, () => { el.textContent = "Selecciónalo a mano"; }); } catch (err) { el.textContent = "Selecciónalo a mano"; } }
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  marcarSucio(t);
  if (t.dataset.accion === "verif") await accion({ accion: "verif", id: t.dataset.id, paso: t.dataset.paso, valor: t.checked });
  if (t.name === "mp-metodo") { $("#mp-banco-bloque").classList.toggle("oculto", t.value !== "Transferencia"); $("#mp-celular-bloque").classList.toggle("oculto", t.value === "Transferencia"); }
  if (t.name === "bandeja") { ui.verArchivados = t.value === "archivados"; ui.hiloCuidador = null; render(); }
  if (t.name === "periodo") { ui.periodo = Number(t.value); render(); }
  if (t.id === "f-estado") { ui.filtroEstado = t.value; render(); }
  if (t.id === "t-alta") { leerRangos(); render(); }
  if (["f-tipo", "f-rasgo"].includes(t.id)) { const c = S.cuidadores[0]; $("#vista-nombre").textContent = $("#f-tipo").value + ($("#f-rasgo").value ? " " + $("#f-rasgo").value : "") + " en " + c.distrito; }
  if (t.dataset.leyenda !== undefined && t.dataset.cuidador) { const f = fotosDe(t.dataset.cuidador); f[Number(t.dataset.leyenda)].leyenda = t.value.trim(); await accion({ accion: "fotos", id: t.dataset.cuidador, fotos: f }); }
  if (t.id === "subir-fotos" && t.files.length) {
    const cid = t.dataset.cuidador;
    const archivos = Array.from(t.files);
    let ok = 0, malas = 0;
    for (const [i, f] of archivos.entries()) {
      const est = $("#estado-fotos"); if (est) est.textContent = "Subiendo foto " + (i + 1) + " de " + archivos.length + "…";
      try { const img = await comprimir(f, 1600, 0.8); if (await accion({ accion: "foto-subir", id: cid, imagen: img })) ok++; else malas++; } catch (err) { malas++; }
    }
    ui.fotosDe = cid; render();
    $("#estado-fotos").textContent = plural(ok, "foto subida", "fotos subidas") + (malas ? ". " + plural(malas, "archivo no se pudo subir", "archivos no se pudieron subir") + "." : ". Ya se ven en la vista del cliente.");
  }
});
const marcarSucio = (t) => { const f = t.closest && t.closest("form"); if (f && !f.dataset.chat && f.id !== "form-login") ui.sucio = true; };
document.addEventListener("input", (e) => {
  const t = e.target;
  marcarSucio(t);
  if (t.id === "f-buscar") { ui.buscarTexto = t.value; const pos = t.selectionStart; render(); const n = $("#f-buscar"); n.focus(); n.setSelectionRange(pos, pos); }
  if (t.id === "msg-chat") { const f = t.closest("form"); ui.mensajes[f.dataset.id] = t.value; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#capa").innerHTML) cerrarCapa(); });
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const boton = $("button[type=submit]", f);
  if (f.id === "form-login") {
    const err = $("#error-login"); err.textContent = ""; boton.disabled = true;
    try {
      const d = await pedir("login", { usuario: $("#l-usuario").value, clave: $("#l-clave").value });
      if (d.rol !== ROL) { err.textContent = d.rol === "admin" ? "Esta es una cuenta de administrador: entra en /admin/." : "Esta es una cuenta de cuidador: entra en /cuidador/."; boton.disabled = false; return; }
      guardarSesion(d.token); await cargar();
    } catch (x) { err.textContent = x.message; boton.disabled = false; }
    return;
  }
  if (f.id === "form-clave") {
    const actual = $("#k-actual").value, nueva = $("#k-nueva").value, repite = $("#k-repite").value;
    const err = $("#error-clave");
    if (nueva !== repite) { err.textContent = "Las dos contraseñas nuevas no coinciden."; return; }
    const p = problemaClave(nueva); if (p) { err.textContent = p; return; }
    await accion({ accion: "clave", actual, nueva }, "#error-clave");
    return;
  }
  if (f.dataset.chat) {
    const inp = $("input", f); const txt = inp.value.trim(); if (!txt) return;
    ui.mensajes[f.dataset.id] = "";
    const d = await accion({ accion: "mensaje", reserva: f.dataset.id, texto: txt });
    if (!d) ui.mensajes[f.dataset.id] = txt;
    const n = $("#msg-chat"); if (n) n.focus();
    return;
  }
  if (f.id === "form-incidencia") {
    const d = await accion({ accion: "incidencia", reserva: f.dataset.hilo, motivo: $("#inc-motivo").value, texto: $("#inc-texto").value.trim() });
    if (d) mensajeModal("Gracias. El equipo de Hospedoggy revisa tu reporte y te contacta.");
    return;
  }
  if (f.dataset.reporte) {
    const err = $(".error", f); err.textContent = ""; boton.disabled = true; boton.textContent = "Enviando…";
    const archivos = Array.from(f.querySelector("input[type=file]").files).slice(0, 4);
    const fotos = [];
    for (const a of archivos) { try { fotos.push(await comprimir(a, 1200, 0.72)); } catch (x) { /* ignora archivos que no son imagen */ } }
    const rep = { accion: "reporte", reserva: f.dataset.reporte, nota: f.querySelector("textarea").value.trim(), fotos };
    ["pis", "caca", "comida", "agua", "juego"].forEach((k) => { rep[k] = f.querySelector("input[name='" + k + "']").checked; });
    const d = await accion(rep);
    if (!d) { boton.disabled = false; boton.textContent = "Intentar de nuevo"; }
    return;
  }
  if (f.id === "form-tarifas") {
    leerRangos(); const b = ui.tarifasBorrador;
    const d = await accion({ accion: "tarifas", tarifa: b.tarifa, movilidad: b.movilidad, perroAdicional: b.perroAdicional, descuentoNoches: b.descuentoLarga.noches, descuentoPct: b.descuentoLarga.pct,
      movilidadGratisPrimera: b.movilidadGratisPrimera, temporadaActiva: b.temporadaActiva, temporadas: b.temporadas }, "#error-tarifas");
    if (d) { ui.tarifasBorrador = null; render(); $("#aviso-global").textContent = d.aviso; }
    return;
  }
  if (f.id === "form-plazas") {
    leerPlazas(); const b = ui.plazasBorrador;
    const d = await accion({ accion: "plazas", plazas: b.plazas, especiales: b.especiales }, "#error-plazas");
    if (d) { ui.plazasBorrador = null; render(); $("#aviso-global").textContent = d.aviso; }
    return;
  }
  if (f.id === "form-perfil") {
    await accion({ accion: "perfil", tamanos: $$("input[name='f-tamano']:checked").map((x) => x.value), whatsapp: $("#f-whatsapp").value, descripcion: $("#f-descripcion").value.trim(),
      tipo: $("#f-tipo").value, rasgo: $("#f-rasgo").value, horaReporte: $("#f-hora").value, jardin: $("#f-jardin").checked, perrosResidentes: $("#f-residentes").checked,
      ninos: $("#f-ninos").checked, todoElDia: $("#f-todoeldia").checked, fumadores: $("#f-fuma").checked }, "#error-perfil");
    return;
  }
  if (f.id === "form-metodo-pago") {
    await accion({ accion: "pago", metodo: (document.querySelector('input[name="mp-metodo"]:checked') || {}).value, titular: $("#mp-titular").value, dni: $("#mp-dni").value,
      celular: $("#mp-celular").value, banco: $("#mp-banco").value, tipoCuenta: $("#mp-tipo").value, numero: $("#mp-numero").value, cci: $("#mp-cci").value }, "#error-metodo");
    return;
  }
  if (f.id === "form-config") {
    await accion({ accion: "config", margenNoche: $("#c-noche").value, margenMovilidad: $("#c-mov").value, redondeo: $("#c-red").value,
      cancelacion: ((document.querySelector('input[name="c-cancelacion"]:checked') || {}).value === "Hasta 7 días antes") ? "siete" : "ninguna", reembolsoPct: $("#c-reembolso").value }, "#error-config");
    return;
  }
  if (f.id === "form-nuevo") {
    const v = (x) => $("#" + x).value.trim();
    const d = await accion({ accion: "crear", nombre_interno: v("n-interno"), distrito: v("n-distrito"), usuario: v("n-usuario"), clave: v("n-clave"), whatsapp: v("n-whatsapp"), email: v("n-email") }, "#error-nuevo");
    if (d) mensajeModal(d.aviso);
    return;
  }
  if (f.id === "form-editar") {
    const v = (x) => $("#" + x).value;
    const d = await accion({ accion: "editar", id: f.dataset.id, datos: { nombre_interno: v("e-interno"), distrito: v("e-distrito"), direccion: v("e-direccion"), email: v("e-email"), whatsapp: v("e-whatsapp"), servicios: v("e-servicios"), descripcion: v("e-descripcion") } }, "#error-editar");
    if (d) { ui.editarDe = null; render(); $("#aviso-global").textContent = d.aviso; }
  }
});
// El chat se actualiza solo cada 30 segundos mientras está abierto
setInterval(() => { if (S && !debeCambiar && ROL === "cuidador" && ui.pestanaCuidador === "mensajes" && !document.hidden && !ui.ocupado && !$("#capa").innerHTML) cargar(); }, 30000);

/* ---------- Arranque ---------- */
if (sesion) cargar(); else render();
