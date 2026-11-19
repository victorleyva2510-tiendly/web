/* Hospedoggy: web del cliente (versión real).
   Mismo diseño y flujo del prototipo validado. Los precios, el cupo y el recojo gratis los decide el servidor (/api). */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const soles = (n) => "S/" + Math.round(n).toLocaleString("es-PE");
const DIA = 86400000;
function hoyISO() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const aFecha = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const aISO = (f) => f.toISOString().slice(0, 10);
const sumarDias = (iso, n) => aISO(new Date(aFecha(iso).getTime() + n * DIA));
const difDias = (a, b) => Math.round((aFecha(b) - aFecha(a)) / DIA);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fCorta = (iso) => { const f = aFecha(iso); return DIAS[f.getUTCDay()] + " " + f.getUTCDate() + " " + MESES[f.getUTCMonth()]; };
const corto = (iso) => { if (!iso) return "-"; const f = aFecha(iso); return f.getUTCDate() + " " + MESES[f.getUTCMonth()].toUpperCase(); };
const plural = (n, s, p) => n + " " + (n === 1 ? s : p);
const ultimos9 = (t) => String(t || "").replace(/\D/g, "").slice(-9);

const AVISO_FUERA = "Hospedoggy responde solo por las reservas pagadas en esta página. Lo que se acuerde directamente con un cuidador fuera de la plataforma no tiene la selección, el soporte ni las devoluciones de Hospedoggy, y Hospedoggy no se hace responsable por ese acuerdo.";
const COMPORTAMIENTOS = ["Tranquilo", "Juguetón", "Miedoso", "Ansioso", "Muy activo", "Protector"];
const ILUSTRACION_CASA = '<svg viewBox="0 0 200 200" aria-hidden="true"><path d="M36 96 C 18 108, 16 140, 30 154 C 40 164, 54 154, 56 136 L 58 104 Z" fill="currentColor" opacity=".55"/><path d="M164 96 C 182 108, 184 140, 170 154 C 160 164, 146 154, 144 136 L 142 104 Z" fill="currentColor" opacity=".55"/><path d="M100 34 L 166 94 Q 171 100 164 104 L 148 104 L 148 156 Q 148 170 134 170 L 66 170 Q 52 170 52 156 L 52 104 L 36 104 Q 29 100 34 94 Z" fill="currentColor"/></svg>';

/* ---------- Estado ---------- */
function fechasIniciales() {
  const hoy = hoyISO(), y = Number(hoy.slice(0, 4)) + (hoy.slice(5) > "12-27" ? 1 : 0);
  const ingreso = hoy <= y + "-12-20" ? y + "-12-24" : sumarDias(hoy, 7);
  return { ingreso, salida: sumarDias(ingreso, 4), perros: 1, tamano: "todos" };
}
const ui = { busqueda: fechasIniciales(), reglas: { cancelacion: "siete", reembolsoPct: 70, maxPerros: 3, minutosParaPagar: 20 },
  lista: null, error: "", casa: null, casaId: null, primera: false, telValido: false, formReserva: null,
  soloEstrella: false, soloJardin: false, orden: "recomendados", reserva: null, cancelacion: null, aviso: "", mias: null, visor: null,
  mensajes: [], reportes: [], puedeResenar: false, borradorChat: "" };

const guardarLocal = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const leerLocal = (k, d) => { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : d; } catch (e) { return d; } };
const clienteActual = () => leerLocal("hospedoggy-cliente", null);
// Enlaces privados de las reservas hechas en este dispositivo (el detalle solo se abre con su clave)
const enlaces = () => leerLocal("hospedoggy-reservas", []);
function guardarEnlace(e) { const l = enlaces().filter((x) => x.id !== e.id); l.unshift(e); guardarLocal("hospedoggy-reservas", l.slice(0, 30)); }

async function api(ruta, opciones) {
  const r = await fetch(ruta, opciones);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || "Algo salió mal. Intenta de nuevo."); e.estado = r.status; throw e; }
  return d;
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v != null)).toString();

/* ---------- Textos de reglas ---------- */
const politicaCancelacion = () => ui.reglas.cancelacion;
const textoCancelacion = () => politicaCancelacion() === "siete" ? "Puedes cancelar hasta 7 días calendario antes del ingreso y te devolvemos el " + ui.reglas.reembolsoPct + "% de lo pagado. El " + (100 - ui.reglas.reembolsoPct) + "% restante cubre los costos de gestión y no es reembolsable. Después de ese plazo, la reserva ya no se puede cancelar." : "Una vez pagada, la reserva no admite cancelaciones.";

/* ---------- Piezas visuales (las mismas del prototipo) ---------- */
function rangoNoche(q) { const ps = q.detalle.map((d) => d.precio); const min = Math.min(...ps), max = Math.max(...ps); return min === max ? soles(min) : soles(min) + " a " + soles(max); }
const portada = (c, etiqueta) => '<div class="casa-foto">' + (c.fotos.length ? '<img src="' + esc(c.fotos[0].src) + '" alt="' + esc(c.fotos[0].leyenda || c.nombrePublico) + '" onerror="this.remove()">' : "") +
  '<div class="foto-vacia" style="z-index:0">' + ILUSTRACION_CASA + "</div><span>" + esc(etiqueta) + "</span>" + (c.fotos.length > 1 ? '<span class="contador">' + plural(c.fotos.length, "foto", "fotos") + "</span>" : "") + "</div>";
function rasgosCasa(c) { const k = c.casa; return [k.jardin ? "Jardín cercado" : "", k.todoElDia ? "Alguien todo el día" : "", k.perrosResidentes ? "Tiene perros propios" : "Sin perros propios", k.ninos ? "Hay niños" : "", k.fumadores ? "" : "No se fuma"].filter(Boolean); }
const reputacion = (st) => st.resenas ? "★ " + st.nota.toFixed(1) + " · " + plural(st.resenas, "reseña", "reseñas") : "Nuevo en Hospedoggy";
const busquedaValida = (b) => b.ingreso && b.salida && b.salida > b.ingreso && b.ingreso >= hoyISO();
function filasVisibles() {
  const b = ui.busqueda;
  let filas = (ui.lista || []).filter((c) => b.tamano === "todos" || c.tamanos.includes(b.tamano));
  if (ui.soloEstrella) filas = filas.filter((c) => c.stats.estrella);
  if (ui.soloJardin) filas = filas.filter((c) => c.casa.jardin);
  const hay = (c) => (c.libres >= b.perros ? 1 : 0);
  if (ui.orden === "precio") filas.sort((x, y) => hay(y) - hay(x) || x.q.total - y.q.total);
  else if (ui.orden === "calificacion") filas.sort((x, y) => hay(y) - hay(x) || y.stats.nota - x.stats.nota);
  else filas.sort((x, y) => hay(y) - hay(x) || y.stats.estrella - x.stats.estrella || y.stats.nota - x.stats.nota);
  return filas;
}
function tarjetaCasa(c, b) {
  const q = c.q, l = c.libres, alcanza = l >= b.perros;
  const rasgos = ["Reportes a las " + c.horaReporte].concat(rasgosCasa(c)).slice(0, 4);
  return '<article class="tarjeta casa' + (alcanza ? "" : " sin-cupo") + '">' + portada(c, c.distrito.toUpperCase()) + '<div class="casa-cuerpo">' +
    '<div class="fila" style="justify-content:space-between;align-items:flex-start"><h3>' + esc(c.nombrePublico) + '</h3><div class="fila" style="gap:6px">' + (c.stats.estrella ? '<span class="insignia">★ Estrella</span>' : "") + '<span class="pastilla p-bueno">Verificado</span></div></div>' +
    '<p class="tenue">' + reputacion(c.stats) + (c.stats.repiten ? " · " + plural(c.stats.repiten, "cliente repite", "clientes repiten") : "") + "</p>" +
    '<div class="rasgos">' + rasgos.map((r) => "<span>" + esc(r) + "</span>").join("") + "</div>" +
    '<p class="suave">' + esc(c.descripcion) + "</p>" +
    '<div class="precio-fila"><div><div class="precio">' + soles(q.total) + '</div><div class="tenue">' + plural(q.noches, "noche", "noches") + (b.perros > 1 ? ", " + plural(b.perros, "perro", "perros") : "") + " con recojo · " + rangoNoche(q) + " por noche</div></div>" +
    '<div class="cupos ' + (l / c.plazas < 0.5 ? "bajo" : "") + '">' + (l ? plural(l, "plaza libre", "plazas libres") : "Sin plazas") + "</div></div>" +
    (q.descuento ? '<p class="ok">−' + q.larga.pct + "% por estadía de " + q.larga.noches + " noches o más</p>" : "") +
    (c.movilidadGratisPrimera ? '<p class="ok">Recojo gratis en tu primera estadía: ahorras ' + soles(q.movLista) + "</p>" : "") +
    '<button class="boton boton-sol" data-accion="ver-casa" data-id="' + esc(c.id) + '"' + (alcanza ? "" : " disabled") + ">" + (alcanza ? "Reservar · " + soles(q.total) : l ? "No alcanza para " + plural(b.perros, "perro", "perros") : "Sin plazas en estas fechas") + "</button></div></article>";
}
function zonaResultados() {
  const b = ui.busqueda;
  if (ui.error) return '<div class="vacio">' + esc(ui.error) + ' <button class="boton boton-chico" data-accion="reintentar">Reintentar</button></div>';
  if (!busquedaValida(b)) return '<div class="vacio">Elige una fecha de ingreso desde hoy y una salida posterior para ver precios.</div>';
  if (!ui.lista) return '<div class="resultados"><div class="cargando-tarjeta"></div><div class="cargando-tarjeta"></div></div>';
  const filas = filasVisibles();
  const conCupo = filas.filter((c) => c.libres >= b.perros).length;
  const pill = (id, on, txt) => '<label class="filtro-pill"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "><span>" + txt + "</span></label>";
  return '<div class="resultados-cabeza"><div><p class="etiqueta">Paso 1 de 3 · Elige la casa</p><h2 style="margin-top:6px">' + plural(conCupo, "casa con cupo", "casas con cupo") + '</h2><p class="tenue">' + fCorta(b.ingreso) + " → " + fCorta(b.salida) + " · " + plural(difDias(b.ingreso, b.salida), "noche", "noches") + " · " + plural(b.perros, "perro", "perros") + "</p></div>" +
    '<div class="filtros">' + pill("f-estrella", ui.soloEstrella, "★ Solo estrella") + pill("f-jardin", ui.soloJardin, "Con jardín") +
    '<label class="oculto" for="f-orden">Ordenar por</label><select id="f-orden" class="orden">' + [["recomendados", "Recomendados"], ["precio", "Precio más bajo"], ["calificacion", "Mejor calificación"]].map(([v, n]) => '<option value="' + v + '"' + (ui.orden === v ? " selected" : "") + ">" + n + "</option>").join("") + "</select></div></div>" +
    (filas.length ? '<div class="resultados">' + filas.map((c) => tarjetaCasa(c, b)).join("") + "</div>" : '<div class="vacio" style="margin-top:20px">Ninguna casa cumple esos filtros. Quita un filtro o cambia el tamaño.</div>');
}
function paseBusqueda() {
  const b = ui.busqueda, valido = busquedaValida(b) && ui.lista;
  let desde = null, conCupo = 0;
  if (valido) filasVisibles().forEach((c) => { if (c.libres < b.perros) return; conCupo++; if (desde === null || c.q.total < desde) desde = c.q.total; });
  const n = busquedaValida(b) ? difDias(b.ingreso, b.salida) : 0;
  return '<div class="pase pase-girado" role="img" aria-label="Tu pase de estadía"><div class="pase-banda"><b>Hospedoggy</b><span>Tu pase</span></div><div class="pase-cuerpo">' +
    '<div class="pase-ruta"><div><div class="codigo">CASA</div><div class="lugar">Tu casa, en Lima</div></div><svg viewBox="0 0 44 28" aria-hidden="true"><path d="M2 14h36m-8-8 8 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<div class="hacia"><div class="codigo">' + (valido ? conCupo : "-") + '</div><div class="lugar">' + (valido ? plural(conCupo, "casa con cupo", "casas con cupo") : "casas con cupo") + "</div></div></div>" +
    '<div class="campos"><div class="campo"><small>Ingreso</small><strong>' + corto(b.ingreso) + '</strong></div><div class="campo"><small>Salida</small><strong>' + corto(b.salida) + '</strong></div><div class="campo"><small>Noches</small><strong>' + (n > 0 ? n : "-") + "</strong></div>" +
    '<div class="campo"><small>Perros</small><strong>' + b.perros + '</strong></div><div class="campo campo-doble"><small>Total desde</small><strong class="total-pase">' + (desde !== null ? soles(desde) : "-") + "</strong></div></div>" +
    '<div class="sello" aria-hidden="true">Cuidador<br>verificado</div></div><div class="pase-talon"><div class="talon-hora"><small>Reportes</small><strong>CON<br>FOTOS</strong></div><div class="barras" aria-hidden="true"></div></div></div>' +
    '<p class="pase-nota">Se actualiza al cambiar fechas. Incluye recojo y regreso a tu casa.</p>';
}
const campoFecha = (id, rot, v) => '<div class="campo"><label for="' + id + '">' + rot + '</label><input type="date" id="' + id + '" value="' + esc(v) + '" min="' + hoyISO() + '"></div>';
const campoTexto = (id, rot, v, tipo, ph) => '<div class="campo"><label for="' + id + '">' + rot + '</label><input type="' + tipo + '" id="' + id + '" value="' + esc(v || "") + '" placeholder="' + esc(ph) + '"></div>';
function formularioBusqueda(grande) {
  const b = ui.busqueda;
  return '<form class="tarjeta buscador' + (grande ? " buscador-portada" : "") + '" id="form-busqueda">' + campoFecha("b-ingreso", "Ingreso", b.ingreso) + campoFecha("b-salida", "Salida", b.salida) +
    '<div class="campo"><label for="b-perros">Perros</label><select id="b-perros">' + Array.from({ length: ui.reglas.maxPerros }, (_, i) => i + 1).map((n) => '<option value="' + n + '"' + (b.perros === n ? " selected" : "") + ">" + plural(n, "perro", "perros") + "</option>").join("") + "</select></div>" +
    '<div class="campo"><label for="b-tamano">Tamaño</label><select id="b-tamano"><option value="todos">Cualquiera</option>' + ["pequeño", "mediano", "grande"].map((t) => '<option value="' + t + '"' + (b.tamano === t ? " selected" : "") + ">" + t.charAt(0).toUpperCase() + t.slice(1) + "</option>").join("") + "</select></div>" +
    '<button class="boton boton-sol" type="submit">' + (grande ? "Ver precios y reservar ↓" : "Buscar") + "</button></form>";
}
function barraCuenta() {
  const cl = clienteActual();
  if (!cl) return '<div class="cuenta-cli"><span class="tenue">¿Ya reservaste antes? Entra con tu celular y ve tus reservas.</span><button class="boton boton-chico" data-accion="abrir-cuenta">Ingresar o crear cuenta</button></div>';
  return '<div class="cuenta-cli"><span>Hola, <b>' + esc(cl.nombre.split(" ")[0]) + "</b> · " + (cl.estadias ? '<span class="pastilla p-bueno">Cliente frecuente · ' + plural(cl.estadias, "estadía", "estadías") + "</span>" : '<span class="pastilla p-aviso">Primera estadía: recojo gratis donde aplique</span>') +
    '</span><span class="fila" style="gap:8px"><button class="boton boton-chico" data-accion="ir-mis-reservas">Mis reservas</button><button class="boton boton-chico" data-accion="salir-cliente">Salir</button></span></div>';
}
function seccionMias() {
  const cl = clienteActual();
  if (!cl) return "";
  const locales = enlaces();
  const lista = ui.mias;
  const ETQ = { pagada: ["Pagada", "p-info"], en_curso: ["En curso", "p-bueno"], completada: ["Completada", "p-neutro"], cancelada: ["Cancelada", "p-critico"], reembolsada_sin_cupo: ["Devuelta", "p-neutro"] };
  return '<section class="bloque" id="mis-reservas"><p class="etiqueta">Tu cuenta</p><h2 style="margin-top:6px">Mis reservas</h2>' +
    (lista === null ? '<p class="tenue" style="margin-top:8px">Cargando…</p>' : !lista.length ? '<p class="suave" style="margin-top:8px">Todavía no tienes reservas con este celular.</p>' :
      '<div class="pila" style="margin-top:14px">' + lista.map((r) => {
        const e = locales.find((x) => x.codigo === r.codigo);
        const t = ETQ[r.estado] || ["", "p-neutro"];
        return '<div class="tarjeta fila" style="justify-content:space-between"><div><b>' + esc(r.casa) + '</b><p class="tenue">' + esc(r.codigo) + " · " + fCorta(r.ingreso) + " → " + fCorta(r.salida) + " · " + plural(r.perros, "perro", "perros") + '</p></div><div class="fila" style="gap:8px"><span class="pastilla ' + t[1] + '">' + t[0] + "</span>" +
          (e ? '<button class="boton boton-chico" data-accion="abrir-reserva" data-id="' + esc(e.id) + '">Ver detalle</button>' : '<span class="tenue">El detalle está en tu correo de confirmación</span>') + "</div></div>";
      }).join("") + "</div>") +
    '<p class="tenue" style="margin-top:10px">Por seguridad, el detalle de cada reserva (dirección, ficha y cancelación) solo se abre desde el enlace de tu correo o desde el celular donde reservaste. Ahí también están el chat con tu cuidador y los reportes con fotos.</p></section>';
}
function seccionesConfianza() {
  return '<section class="franja-cli" aria-label="Lo esencial"><div><b>Verificados</b><span>Visitamos cada casa y conocemos a cada cuidador antes de publicarlo.</span></div><div><b>Reportes con fotos</b><span>Te llegan fotos de cómo está, a la hora que indica cada cuidador.</span></div><div><b>Todo Lima</b><span>Lo recogemos y lo devolvemos en la puerta de tu casa.</span></div></section>' +
    '<section class="bloque"><p class="etiqueta">Cómo funciona</p><h2 style="margin-top:6px">Reservas en 3 pasos, sin esperar respuesta</h2><ol class="como-cli"><li><h3>Elige fechas y casa</h3><p>Solo ves casas con cupo en tus fechas, con el total que vas a pagar.</p></li><li><h3>Llena su ficha</h3><p>Cuéntanos cómo es tu perro: comida, medicamentos y carácter. El cuidador la recibe completa.</p></li><li><h3>Paga y listo</h3><p>Pagas el 100% con Yape o tarjeta en Mercado Pago y tu reserva se confirma al instante.</p></li></ol></section>' +
    '<section class="bloque"><p class="etiqueta">Cómo elegimos a cada cuidador</p><h2 style="margin-top:6px">Solo publicamos casas que nosotros dejaríamos a nuestro perro</h2>' +
    '<ol class="pasos-sel" style="margin-top:18px"><li><h3>Visitamos la casa</h3><p>Revisamos en persona los espacios, los cercos y dónde duerme cada perro.</p></li><li><h3>Conocemos al cuidador</h3><p>Su experiencia, su rutina y cuántos huéspedes puede atender bien.</p></li>' +
    '<li><h3>Revisamos su plan de emergencia</h3><p>Veterinario de referencia, aviso inmediato al dueño y reglas para medicamentos.</p></li><li><h3>Seguimos cada estadía</h3><p>Controlamos que los reportes lleguen y leemos cada reseña. Si una casa baja su nivel, sale de la red.</p></li></ol>' +
    '<p class="filtro-sel">El resultado: <mark>no cualquiera hospeda con Hospedoggy</mark>.</p></section>' +
    '<section class="bloque dos-col-cli"><div><p class="etiqueta">Su maleta</p><h2 style="margin-top:6px">Lo que necesita para ingresar</h2><ul class="maleta-cli">' +
    [["Vacunas al día", "Ten a mano la foto de su cartilla."], ["Antiparasitario vigente", "Interno y externo."], ["Su comida para todos los días", "Así no cambia de dieta y evita malestares."], ["Indicaciones por escrito", "Si toma medicamentos: cuál, cuánto y a qué hora."], ["Su correa", "Y si quieres, una manta o juguete con olor a casa para que se adapte más rápido."]].map(([t, d]) => '<li><span class="casilla-cli" aria-hidden="true"></span><span><b>' + t + "</b><small>" + d + "</small></span></li>").join("") +
    '</ul></div><div class="preguntas"><p class="etiqueta">Preguntas frecuentes</p><h2 style="margin-top:6px">Antes de reservar</h2>' +
    [["¿Cómo pago?", "Con Yape o con tarjeta a través de Mercado Pago, por el total de la estadía al reservar. No hay adelantos ni saldos pendientes."],
      ["¿Cuándo se confirma mi reserva?", "Apenas se aprueba el pago. En ese momento el cuidador recibe la ficha completa de tu perro y a ti te llega la confirmación por correo."],
      ["¿Puedo cancelar?", textoCancelacion()],
      ["¿Dónde se queda mi perro?", "En la casa del cuidador que elijas. Cada casa tiene su ubicación, sus servicios y su precio, y ves todo antes de pagar. La dirección exacta te llega cuando se confirma el pago."],
      ["¿Cómo sé que está bien?", "Durante la estadía te llegan reportes con fotos. Cada cuidador indica en su ficha a qué hora los envía."],
      ["¿Qué pasa si se enferma?", "Cada cuidador tiene un veterinario de referencia cerca. Si algo pasa, te avisamos de inmediato y decidimos contigo."],
      ["¿Puedo coordinar directo con el cuidador?", AVISO_FUERA],
      ["¿Reciben gatos?", "Por ahora solo hospedamos perros."]].map(([q, r]) => "<details><summary>" + q + "</summary><p>" + esc(r) + "</p></details>").join("") + "</div></section>" +
    '<section class="cierre-cli"><div><h2>Los cupos de Navidad son pocos.</h2><p>Cada casa recibe pocos perros para atenderlos bien. Si ya tienes fechas, revisa quién tiene cupo hoy.</p></div><button class="boton boton-sol" data-accion="ir-cotizador">Cotizar mi estadía</button></section>';
}
function pieCliente() {
  return '<footer class="pie-cli"><div><b class="pie-marca">Hospedoggy</b><p>Hospedaje para perros en casas de cuidadores verificados. Lima, Perú.</p><p class="redes-cli"><a href="https://www.instagram.com/hospedoggy/">Instagram</a><a href="https://www.tiktok.com/@hospedoggy">TikTok</a><a href="https://www.facebook.com/hospedoggy">Facebook</a></p><p>© 2026 Hospedoggy</p></div>' +
    "<div><b>Aviso de privacidad</b><p>Usamos tus datos (nombre, celular, correo, dirección y la información de tu perro) solo para gestionar tu reserva, coordinar el recojo y enviarte los reportes. Solo los compartimos con el cuidador que atiende tu reserva y con Mercado Pago para procesar el pago. Puedes pedir que los corrijamos o eliminemos escribiéndonos por Instagram a @hospedoggy. Tratamos tus datos conforme a la Ley N.° 29733, Ley de Protección de Datos Personales.</p></div></footer>";
}

/* ---------- Ficha de la casa ---------- */
// Si una foto todavía no se subió, mostramos el dibujo de la casa en su lugar
window.fotoRota = (img) => { const d = document.createElement("div"); d.className = "foto-vacia"; d.innerHTML = ILUSTRACION_CASA; img.replaceWith(d); };
function galeriaCliente(c) {
  if (!c.fotos.length) return '<div class="sin-fotos"><div class="foto-vacia">' + ILUSTRACION_CASA + "<p>Hospedoggy sube las fotos reales de esta casa después de la visita de verificación.</p></div></div>";
  const visibles = c.fotos.slice(0, 5);
  return '<div class="galeria-cliente">' + visibles.map((f, i) => '<button type="button" data-accion="ver-foto" data-i="' + i + '" aria-label="Ver foto ' + (i + 1) + " de " + c.fotos.length + '"><img src="' + esc(f.src) + '" alt="' + esc(f.leyenda || c.nombrePublico) + '" onerror="fotoRota(this)">' +
    (i === visibles.length - 1 && c.fotos.length > 5 ? '<span class="mas">+' + (c.fotos.length - 5) + " fotos</span>" : "") + "</button>").join("") + "</div>";
}
const opcionesRadio = (name, opciones, valor) => '<div class="chips">' + opciones.map((o) => '<label class="chip"><input type="radio" name="' + name + '" value="' + o + '"' + (valor === o ? " checked" : "") + "><span>" + o + "</span></label>").join("") + "</div>";
function formHuesped(c, i, h, b) {
  const t = b.perros > 1 ? "Datos del huésped " + (i + 1) : "Datos del huésped";
  const area = (id, rot, v, ph) => '<div class="campo"><label for="' + id + '">' + rot + '</label><textarea id="' + id + '" placeholder="' + esc(ph) + '">' + esc(v || "") + "</textarea></div>";
  return '<fieldset class="pila" style="border:0;border-top:1px solid var(--linea);margin:0;padding:16px 0 0;min-width:0"><legend class="oculto">' + t + "</legend><h3>" + t + '</h3><div class="rejilla-2">' +
    campoTexto("h-nombre-" + i, "Nombre del perrito", h.nombre, "text", "Ej. Luna") + campoTexto("h-edad-" + i, "Edad", h.edad, "text", "Ej. 3 años") +
    campoTexto("h-raza-" + i, "Raza", h.raza, "text", "Ej. Mestizo, Golden, Shih Tzu") +
    '<div class="campo"><label for="h-tamano-' + i + '">Tamaño</label><select id="h-tamano-' + i + '">' + c.tamanos.map((x) => "<option" + ((h.tamano || b.tamano) === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></div>" +
    '<div class="campo"><span class="rotulo">Sexo</span>' + opcionesRadio("sexo-" + i, ["Macho", "Hembra"], h.sexo) + "</div>" +
    '<div class="campo"><span class="rotulo">¿Es sociable con otros perros?</span>' + opcionesRadio("soc-" + i, ["Sí", "No", "Depende"], h.sociable) + "</div></div>" +
    '<div class="campo"><span class="rotulo">¿Toma algún medicamento o tiene alguna condición especial?</span>' + opcionesRadio("med-" + i, ["No", "Sí"], h.medicamento) + "</div>" +
    area("h-med-" + i, "Si toma: medicamento o condición, horario y frecuencia", h.medicamentoDetalle, "Ej. Apoquel 16 mg, 1 pastilla a las 8 am con comida") +
    area("h-alim-" + i, "Alimentación: marca, cantidad y horarios", h.alimentacion, "Ej. Pro Plan adulto, 1 taza a las 8 am y 1 taza a las 7 pm") +
    campoTexto("h-jug-" + i, "Juguetes o artículos que traerá", h.juguetes, "text", "Ej. su cama, una pelota, su manta") +
    '<div class="campo"><span class="rotulo">Comportamiento general</span><div class="chips">' + COMPORTAMIENTOS.map((o) => '<label class="chip"><input type="checkbox" name="comp-' + i + '" value="' + o + '"' + ((h.comportamiento || []).includes(o) ? " checked" : "") + "><span>" + o + "</span></label>").join("") + "</div></div>" +
    campoTexto("h-comp-" + i, "Algo más sobre su comportamiento (opcional)", h.comportamientoOtro, "text", "Ej. le tiene miedo a los cohetes") + "</fieldset>";
}
function vistaDetalleCasa() {
  const c = ui.casa, b = ui.busqueda;
  const cl = clienteActual();
  const f = Object.assign({}, cl ? { nombre: cl.nombre, telefono: cl.telefono } : {}, ui.formReserva || {});
  const st = c.stats, casa = c.casa;
  const datosCasa = [casa.tipo, casa.jardin ? "Jardín cercado" : "Sin jardín", casa.perrosResidentes ? "Tiene perros propios" : "Sin perros propios", casa.ninos ? "Hay niños en casa" : "Sin niños", casa.todoElDia ? "Alguien en casa todo el día" : "Sale algunas horas", casa.fumadores ? "Se fuma en casa" : "No se fuma"];
  return '<div class="fila" style="margin-top:20px;justify-content:space-between"><button class="boton boton-chico" data-accion="volver">← Ver otras casas</button><span class="tenue nota-casas">Cada casa tiene su ubicación, sus servicios y su precio</span></div>' +
    '<div class="titulo-casa"><div class="fila" style="gap:6px">' + (st.estrella ? '<span class="insignia">★ Cuidador estrella</span>' : "") + '<span class="pastilla p-bueno">Verificado por Hospedoggy</span></div><h1>' + esc(c.nombrePublico) + '</h1><p class="suave">' + esc(c.distrito) + " · " + reputacion(st) + (st.repiten ? " · " + plural(st.repiten, "cliente repite", "clientes repiten") : "") + "</p></div>" +
    '<ol class="pasos-reserva" aria-label="Pasos de la reserva"><li class="hecho"><span>1</span>Fechas y precio</li><li class="actual"><span>2</span>Ficha de tu perro</li><li><span>3</span>Pago</li></ol>' +
    '<div class="detalle" style="margin-top:16px"><div class="pila">' + galeriaCliente(c) +
    '<div class="tarjeta pila"><div class="stats"><div class="stat"><b>' + (st.resenas ? "★ " + st.nota.toFixed(1) : "Nuevo") + "</b><span>" + plural(st.resenas, "reseña", "reseñas") + '</span></div><div class="stat"><b>' + st.repiten + '</b><span>clientes que repiten</span></div><div class="stat"><b>' + esc(c.horaReporte) + '</b><span>hora de los reportes</span></div><div class="stat"><b>' + c.plazas + "</b><span>" + (c.plazas === 1 ? "perro a la vez" : "perros a la vez como máximo") + "</span></div></div>" +
    '<p class="suave">' + esc(c.descripcion) + '</p><div class="rejilla-2"><div><h4>Qué incluye</h4><ul class="lista-check" style="margin-top:8px">' + c.servicios.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul></div>" +
    '<div><h4>Sobre la casa</h4><div class="rasgos" style="margin-top:8px">' + datosCasa.map((d) => "<span>" + esc(d) + "</span>").join("") + "</div>" +
    '<p class="tenue" style="margin-top:10px">Envía reportes con fotos a las <b>' + esc(c.horaReporte) + "</b>. Acepta perros " + c.tamanos.join(", ") + ". La dirección exacta se comparte al confirmar el pago.</p></div></div></div>" +
    '<div class="tarjeta pila"><div class="fila" style="justify-content:space-between"><h3>Reseñas</h3>' + (st.resenas ? '<span class="tenue">★ ' + st.nota.toFixed(1) + " de 5</span>" : "") + "</div>" + (st.ultimas.length ? st.ultimas.map((r) => '<div class="resena"><div class="fila" style="justify-content:space-between"><span class="fila" style="gap:10px"><span class="avatar" aria-hidden="true">' + esc(String(r.cliente).charAt(0)) + "</span><b>" + esc(r.cliente) + " · " + esc(r.perro) + '</b></span><span class="tenue">' + "★".repeat(r.estrellas) + " · " + MESES[aFecha(r.salida).getUTCMonth()] + " " + aFecha(r.salida).getUTCFullYear() + "</span></div><p>" + esc(r.resena) + "</p></div>").join("") : '<p class="tenue">Todavía no tiene reseñas escritas. Las reseñas solo las pueden dejar clientes que se hospedaron aquí.</p>') + "</div>" +
    '<form class="tarjeta pila" id="form-reserva" novalidate><div><p class="etiqueta">Paso 2 de 3</p><h2 style="margin-top:6px">Ficha del viaje</h2><p class="tenue" style="margin-top:4px">El cuidador la recibe completa apenas se aprueba el pago, para el recojo y el cuidado.</p></div><h3>Datos del dueño</h3><div class="rejilla-2">' +
    campoTexto("r-nombre", "Nombre y apellido", f.nombre, "text", "Ej. Andrea Salazar") + campoTexto("r-telefono", "Celular", f.telefono, "tel", "9XX XXX XXX") +
    campoTexto("r-email", "Correo (ahí te llega la confirmación)", f.email, "email", "tu@correo.com") + campoTexto("r-direccion", "Dirección y distrito", f.direccion, "text", "Ej. Av. Primavera 123, Surco") +
    campoTexto("r-referencia", "Referencia", f.referencia, "text", "Ej. frente al parque, puerta verde") +
    "</div>" + Array.from({ length: b.perros }, (_, i) => formHuesped(c, i, (f.huespedes || [])[i] || {}, b)).join("") +
    '<label class="acepto-cli"><input type="checkbox" id="r-acepto"' + (f.acepto ? " checked" : "") + "><span>Acepto que " + AVISO_FUERA.charAt(0).toLowerCase() + AVISO_FUERA.slice(1) + " " + textoCancelacion() + "</span></label>" +
    '<p class="error" id="error-reserva" role="alert"></p><div id="pagar-final">' + botonPagar() + '</div><p class="tenue" style="text-align:center">Paso 3: pagas en la página segura de Mercado Pago con Yape o tarjeta. Tu cupo queda separado ' + ui.reglas.minutosParaPagar + " minutos mientras pagas.</p></form></div>" +
    '<aside class="tarjeta pila" id="resumen-estadia" style="position:sticky;top:84px">' + resumenEstadia() + "</aside></div>" +
    '<div class="barra-pago" id="barra-pago">' + barraPago() + "</div>";
}
const hayCupo = () => ui.casa && ui.casa.q && ui.casa.libres >= ui.busqueda.perros;
function botonPagar() {
  const q = ui.casa.q;
  return '<button type="button" class="boton boton-sol" style="width:100%;min-height:52px" data-accion="pagar"' + (hayCupo() ? "" : " disabled") + ">Pagar " + soles(q.total) + " con Mercado Pago</button>";
}
function barraPago() {
  const q = ui.casa.q;
  return '<div><span class="tenue">' + plural(q.noches, "noche", "noches") + "</span><b>" + soles(q.total) + '</b></div><button type="button" class="boton boton-sol" data-accion="pagar"' + (hayCupo() ? "" : " disabled") + ">Pagar ahora</button>";
}
function resumenEstadia() {
  const c = ui.casa, b = ui.busqueda, q = c.q, l = c.libres;
  let nota = "";
  if (c.movilidadGratisPrimera) {
    if (!ui.telValido) nota = '<p class="tenue">Escribe tu celular en la ficha: si es tu primera reserva con Hospedoggy, el recojo y regreso te sale gratis.</p>';
    else if (ui.primera) nota = '<p class="ok">No hay reservas anteriores con este celular, así que el recojo y regreso va de regalo.</p>';
    else nota = '<p class="tenue">Ya hay reservas con este celular, así que el recojo y regreso se cobra.</p>';
  }
  const opPerros = Array.from({ length: ui.reglas.maxPerros }, (_, i) => i + 1).map((n) => '<option value="' + n + '"' + (b.perros === n ? " selected" : "") + ">" + plural(n, "perro", "perros") + "</option>").join("");
  const d = Math.round(q.total * ui.reglas.reembolsoPct / 100);
  return '<div class="fila" style="justify-content:space-between"><p class="etiqueta">Paso 1 · Tu cotización</p>' + (l >= b.perros ? '<span class="pastilla p-bueno">Disponible</span>' : '<span class="pastilla p-critico">Sin cupo</span>') + "</div>" +
    '<div><div class="precio precio-total">' + soles(q.total) + '</div><p class="tenue">' + fCorta(b.ingreso) + " → " + fCorta(b.salida) + " · " + plural(q.noches, "noche", "noches") + " · " + rangoNoche(q) + " por noche · todo incluido</p></div>" +
    '<button class="boton boton-sol boton-grande" data-accion="pagar"' + (l >= b.perros ? "" : " disabled") + ">Pagar " + soles(q.total) + " con Mercado Pago</button>" +
    '<ul class="garantias"><li>Pagas con Yape o tarjeta dentro de Mercado Pago.</li><li>El cuidador recibe tu reserva apenas se aprueba.</li><li>Reportes con fotos a las ' + esc(c.horaReporte) + ".</li><li>Sin adelantos ni saldos después.</li></ul>" +
    '<details class="cambiar"' + (l >= b.perros ? "" : " open") + '><summary>Cambiar fechas o perros</summary><div class="cot-fechas">' + campoFecha("q-ingreso", "Ingreso", b.ingreso) + campoFecha("q-salida", "Salida", b.salida) + '<div class="campo"><label for="q-perros">Perros</label><select id="q-perros">' + opPerros + "</select></div></div></details>" +
    '<div class="desglose">' + q.detalle.map((x) => "<div><span>" + plural(x.noches, "noche", "noches") + (x.alta ? " de temporada alta" : "") + " × " + soles(x.precio) + "</span><span>" + soles(x.noches * x.precio) + "</span></div>").join("") +
    (q.descuento ? "<div><span>Descuento por estadía larga (" + q.larga.pct + "%)</span><span>−" + soles(q.descuento) + "</span></div>" : "") +
    "<div><span>Recojo y regreso" + (q.regalo ? " (regalo de primera estadía)" : "") + "</span><span>" + soles(q.movPublico) + "</span></div>" +
    '<div class="total"><span>Total</span><span>' + soles(q.total) + "</span></div></div>" + nota +
    '<p class="cupos ' + (l / c.plazas < 0.5 ? "bajo" : "") + '">' + (l >= b.perros ? plural(l, "plaza libre", "plazas libres") + " para estas fechas" : "No tiene cupo para " + plural(b.perros, "perro", "perros") + " en estas fechas. Prueba otras fechas.") + "</p>" +
    '<p class="politica">' + (politicaCancelacion() === "siete" ? "Si cancelas hasta el " + fCorta(sumarDias(b.ingreso, -7)) + ", te devolvemos el " + ui.reglas.reembolsoPct + "% (" + soles(d) + "). El " + (100 - ui.reglas.reembolsoPct) + "% restante cubre los costos de gestión y no es reembolsable. Después de esa fecha, la reserva ya no se puede cancelar." : textoCancelacion()) + "</p>";
}

/* ---------- Confirmación y detalle de una reserva ---------- */
function vistaReserva() {
  const r = ui.reserva, cx = ui.cancelacion;
  if (!r) return '<section class="confirmacion"><div class="cargando-circulo"></div><h1>Confirmando tu pago</h1><p class="suave">Mercado Pago nos está avisando. Esto toma unos segundos.</p></section>';
  const pase = '<div class="pase"><div class="pase-banda"><b>Hospedoggy</b><span>' + esc(r.codigo) + '</span></div><div class="pase-cuerpo"><div class="pase-ruta"><div><div class="codigo">CASA</div><div class="lugar">Tu casa</div></div><svg viewBox="0 0 44 28" aria-hidden="true"><path d="M2 14h36m-8-8 8 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="hacia"><div class="codigo">' + esc(r.casa.distrito.slice(0, 4).toUpperCase()) + '</div><div class="lugar">' + esc(r.casa.nombrePublico) + "</div></div></div>" +
    '<div class="campos"><div class="campo"><small>Huésped</small><strong>' + esc(r.perro.toUpperCase()) + '</strong></div><div class="campo"><small>Ingreso</small><strong>' + corto(r.ingreso) + '</strong></div><div class="campo"><small>Salida</small><strong>' + corto(r.salida) + '</strong></div><div class="campo"><small>Noches</small><strong>' + r.noches + '</strong></div><div class="campo"><small>Pagado</small><strong>' + soles(r.total) + '</strong></div><div class="campo"><small>Recojo</small><strong>' + (r.detalle.regalo ? "GRATIS" : "INCLUIDO") + "</strong></div></div></div></div>";
  const acciones = '<div class="fila" style="justify-content:center">' + (cx && cx.cancelable ? '<button class="boton" data-accion="pedir-cancelar">Cancelar reserva</button>' : "") + '<button class="boton boton-sol" data-accion="nueva-busqueda">Hacer otra reserva</button></div>';
  if (r.estado === "pendiente_pago" || (r.estado === "expirada" && ui.pagoRechazado)) return '<section class="confirmacion"><span class="icono-ok mal" aria-hidden="true">!</span><h1>El pago no se completó</h1><p class="suave">No se hizo ningún cobro. Puedes intentarlo otra vez con Yape u otra tarjeta.</p><button class="boton boton-sol" data-accion="reintentar-pago" data-id="' + esc(r.casa.id) + '">Volver a la casa e intentar de nuevo</button></section>';
  if (r.estado === "cancelada") return '<section class="confirmacion"><span class="icono-ok mal" aria-hidden="true">×</span><p class="etiqueta">Reserva cancelada</p><h1>Cancelamos tu reserva</h1><p class="suave">Te devolvemos ' + soles(r.reembolsoMonto || 0) + " al mismo medio con el que pagaste. Según tu banco o Yape, puede tardar unos días en verse.</p>" + pase + acciones + "</section>";
  if (r.estado === "reembolsada_sin_cupo") return '<section class="confirmacion"><span class="icono-ok mal" aria-hidden="true">!</span><h1>Te devolvimos el pago</h1><p class="suave">El tiempo para pagar venció y en ese momento otra persona tomó la última plaza. Te devolvimos el 100%.</p><button class="boton boton-sol" data-accion="nueva-busqueda">Buscar otra casa</button></section>';
  if (r.estado === "expirada") return '<section class="confirmacion"><span class="icono-ok mal" aria-hidden="true">!</span><h1>El tiempo para pagar venció</h1><p class="suave">No se hizo ningún cobro. Vuelve a buscar: si la casa sigue con cupo, puedes reservarla de nuevo.</p><button class="boton boton-sol" data-accion="nueva-busqueda">Buscar de nuevo</button></section>';
  const titulo = r.estado === "completada" ? "¡Gracias por confiar en Hospedoggy!" : r.estado === "en_curso" ? esc(r.perro) + " está de vacaciones" : "¡Listo! " + esc(r.perro) + " tiene su lugar.";
  return '<section class="confirmacion"><span class="icono-ok" aria-hidden="true">✓</span><p class="etiqueta">' + (r.estado === "pagada" ? "Pago aprobado" : r.estado === "en_curso" ? "Estadía en curso" : "Estadía completada") + "</p><h1>" + titulo + "</h1>" +
    '<p class="suave">Te enviamos la confirmación a <b>' + esc(r.email) + "</b>.</p>" + pase +
    (r.casa.direccion ? '<p><b>Dirección de la casa:</b> ' + esc(r.casa.direccion) + "</p>" : "") +
    '<ol class="siguientes"><li><b>Ya le avisamos al cuidador</b> con toda la ficha de ' + esc(r.perro) + ".</li><li><b>Coordinen el recojo</b> por el chat de abajo, sin compartir números.</li><li><b>Prepara su maleta:</b> vacunas, antiparasitario, su comida y su correa.</li><li><b>Te llegarán reportes con fotos</b> de cómo está, a las " + esc(r.casa.horaReporte) + ".</li></ol>" +
    (cx && cx.cancelable ? '<p class="tenue">Puedes cancelar hasta el ' + fCorta(cx.limite) + " y te devolvemos el " + r.reembolsoPct + "% (" + soles(cx.monto) + ").</p>" : cx && politicaCancelacion() === "siete" && r.estado === "pagada" ? '<p class="tenue">' + esc(cx.motivo) + "</p>" : "") + acciones + "</section>" +
    seccionEstadia(r);
}
function mensajeCliente(t) {
  $("#capa").innerHTML = '<div class="velo" role="alertdialog" aria-modal="true"><div class="modal"><div class="modal-cuerpo"><p>' + esc(t) + '</p><button class="boton boton-sol" data-accion="cerrar-capa">Entendido</button></div></div></div>';
  $("#capa .boton").focus();
}
/* ---------- Durante la estadía: reportes, reseña y chat con el cuidador ---------- */
const hora = (ts) => { const d = new Date(ts); return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" }) + " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }); };
function htmlReporte(rep) {
  const items = [["pis", "Hizo pis"], ["caca", "Hizo caca"], ["comida", "Comió"], ["agua", "Tomó agua"], ["juego", "Jugó"]];
  return '<div class="reporte"><div class="fila" style="justify-content:space-between"><b>' + fCorta(rep.fecha) + '</b><span class="tenue">' + hora(rep.ts) + '</span></div><div class="iconos">' +
    items.map(([k, n]) => '<span class="icono-rep ' + (rep[k] ? "si" : "no") + '">' + (rep[k] ? "✓ " : "") + n + "</span>").join("") + "</div>" +
    (rep.nota ? "<p>" + esc(rep.nota) + "</p>" : "") + (rep.fotos && rep.fotos.length ? '<div class="fotos-rep">' + rep.fotos.map((f) => '<a href="' + esc(f) + '" target="_blank" rel="noopener"><img src="' + esc(f) + '" alt="Foto del reporte" loading="lazy"></a>').join("") + "</div>" : "") + "</div>";
}
function seccionEstadia(r) {
  const activa = ["pagada", "en_curso", "completada"].includes(r.estado);
  if (!activa) return "";
  let html = '<section class="bloque" id="estadia" style="max-width:860px;margin-left:auto;margin-right:auto">';
  if (r.estado !== "pagada") {
    html += '<div class="tarjeta pila" style="margin-bottom:16px"><h2>Reportes de ' + esc(r.perro) + "</h2>" + (ui.reportes.length ? ui.reportes.map(htmlReporte).join("") : '<p class="tenue">El primer reporte te llegará a las ' + esc(r.casa.horaReporte) + ".</p>") + "</div>";
  }
  if (ui.puedeResenar) {
    html += '<form class="tarjeta pila" id="form-resena" style="margin-bottom:16px"><h2>¿Cómo le fue a ' + esc(r.perro) + '?</h2><p class="tenue">Tu reseña ayuda a otros dueños a elegir. Solo la pueden dejar quienes se hospedaron.</p><div class="chips" role="radiogroup" aria-label="Calificación">' +
      [5, 4, 3, 2, 1].map((n) => '<label class="chip"><input type="radio" name="estrellas" value="' + n + '"' + (n === 5 ? " checked" : "") + "><span>" + "★".repeat(n) + "</span></label>").join("") +
      '</div><div class="campo"><label for="resena-texto">Cuéntale a otros dueños</label><textarea id="resena-texto" maxlength="1000"></textarea></div><p class="error" id="error-resena" role="alert"></p><div><button class="boton boton-sol" type="submit">Publicar reseña</button></div></form>';
  } else if (r.estrellas) {
    html += '<div class="tarjeta pila" style="margin-bottom:16px"><h3>Tu reseña</h3><p>' + "★".repeat(r.estrellas) + (r.resena ? " · " + esc(r.resena) : "") + "</p></div>";
  }
  if (r.estado !== "completada") {
    const rapidas = ["¿A qué hora lo recogen?", "¿Cómo pasó la noche?", "¿Me envías una foto de cómo está?"];
    html += '<div class="tarjeta" style="padding:0;overflow:hidden"><div class="conv-cabeza fila" style="justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--linea)"><div><b>Chat con ' + esc(r.casa.nombrePublico) + '</b> <span class="tenue">· ' + fCorta(r.ingreso) + " → " + fCorta(r.salida) + '</span></div><div class="fila" style="gap:6px"><button class="boton boton-chico" data-accion="actualizar-chat">Actualizar</button><button class="boton boton-chico" data-accion="reportar-cliente">Reportar a Hospedoggy</button></div></div>' +
      '<div class="burbujas" style="max-height:420px;overflow-y:auto"><div class="burbuja sistema">Reserva ' + esc(r.codigo) + " confirmada. Este chat te conecta con tu cuidador. Por seguridad, su número se mantiene privado. Reserva y paga siempre por Hospedoggy: lo que se acuerde por fuera no tiene respaldo.<small>Hospedoggy</small></div>" +
      ui.mensajes.map((m) => '<div class="burbuja ' + (m.de === "cliente" ? "mia" : m.de === "sistema" ? "sistema" : "") + '">' + esc(m.texto) + "<small>" + hora(m.ts) + (m.oculto ? " · Hospedoggy ocultó un dato de contacto" : "") + "</small></div>").join("") + "</div>" +
      '<div class="respuestas-rapidas">' + rapidas.map((t) => '<button type="button" class="boton boton-chico" data-accion="rapida-cliente" data-texto="' + esc(t) + '">' + esc(t) + "</button>").join("") + "</div>" +
      '<form class="redactar" id="form-chat"><label class="oculto" for="msg-cliente">Mensaje</label><input type="text" id="msg-cliente" placeholder="Escribe un mensaje" value="' + esc(ui.borradorChat || "") + '" autocomplete="off" maxlength="1500"><button class="boton boton-tinta" type="submit">Enviar</button></form></div>';
  }
  return html + "</section>";
}
function abrirReporteCliente() {
  $("#capa").innerHTML = '<div class="velo" role="dialog" aria-modal="true" aria-labelledby="rep-titulo"><form class="modal" id="form-incidencia"><div class="modal-cuerpo"><h3 id="rep-titulo">Reportar a Hospedoggy</h3>' +
    '<div class="campo"><label for="inc-motivo">Motivo</label><select id="inc-motivo"><option>Me piden pagar por fuera de Hospedoggy</option><option>Comportamiento inadecuado</option><option>Problema con la salud o el cuidado de la mascota</option><option>Problema con el recojo o el regreso</option><option>Otro</option></select></div>' +
    '<div class="campo"><label for="inc-texto">Cuéntanos qué pasó</label><textarea id="inc-texto" maxlength="2000"></textarea></div><p class="tenue">Lo revisa el equipo de Hospedoggy. El cuidador no ve tu reporte.</p>' +
    '<p class="error" id="error-incidencia" role="alert"></p><div class="fila"><button type="button" class="boton" data-accion="cerrar-capa">Cancelar</button><button class="boton boton-sol" type="submit" style="flex:1">Enviar reporte</button></div></div></form></div>';
  $("#inc-motivo").focus();
}
async function accionReserva(cuerpo) {
  const d = await api("/api/reserva", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ r: ui.reserva.id, t: ui.token }, cuerpo)) });
  ui.reserva = d.reserva; ui.cancelacion = d.cancelacion; ui.mensajes = d.mensajes; ui.reportes = d.reportes; ui.puedeResenar = d.puedeResenar;
  pintarEstadia();
  return d;
}
function pintarEstadia() {
  const e = $("#estadia"); if (!e || !ui.reserva) return;
  const foco = document.activeElement && document.activeElement.id === "msg-cliente";
  e.outerHTML = seccionEstadia(ui.reserva);
  const b = $("#estadia .burbujas"); if (b) b.scrollTop = b.scrollHeight;
  if (foco) { const m = $("#msg-cliente"); if (m) { m.focus(); m.setSelectionRange(m.value.length, m.value.length); } }
}
async function refrescarReserva() {
  if (!ui.reserva || ui.vista !== "reserva" || document.hidden) return;
  try {
    const d = await api("/api/reserva?" + qs({ r: ui.reserva.id, t: ui.token }));
    ui.mensajes = d.mensajes; ui.reportes = d.reportes; ui.puedeResenar = d.puedeResenar;
    pintarEstadia();
  } catch (e) {}
}
setInterval(refrescarReserva, 30000);
function pedirCancelar() {
  const cx = ui.cancelacion, r = ui.reserva;
  $("#capa").innerHTML = '<div class="velo" role="dialog" aria-modal="true" aria-labelledby="can-titulo"><div class="modal"><div class="modal-cuerpo"><h3 id="can-titulo">¿Cancelar la reserva ' + esc(r.codigo) + "?</h3>" +
    '<p class="suave">Te devolvemos <b>' + soles(cx.monto) + "</b>, el " + r.reembolsoPct + "% de lo pagado, al mismo medio con el que pagaste. El resto cubre los costos de gestión. No se puede deshacer.</p>" +
    '<p class="error" id="error-cancelar" role="alert"></p><div class="fila"><button class="boton" data-accion="cerrar-capa">No, mantenerla</button><button class="boton boton-sol" data-accion="confirmar-cancelar" style="flex:1">Sí, cancelar y recibir ' + soles(cx.monto) + "</button></div></div></div></div>";
}

/* ---------- Cuenta ---------- */
function abrirCuenta() {
  const cl = clienteActual();
  $("#capa").innerHTML = '<div class="velo" role="dialog" aria-modal="true" aria-labelledby="cuenta-titulo"><form class="modal" id="form-cuenta"><div class="modal-cuerpo"><div><p class="etiqueta">Tu cuenta</p><h3 id="cuenta-titulo" style="margin-top:6px">Ingresa o crea tu cuenta</h3></div>' +
    '<p class="suave">Solo necesitas tu celular y tu nombre. Con tu celular vemos si es tu primera estadía y te mostramos tus reservas.</p>' +
    campoTexto("c-nombre", "Tu nombre", cl ? cl.nombre : "", "text", "Ej. Andrea Salazar") + campoTexto("c-telefono", "Celular", cl ? cl.telefono : "", "tel", "9XX XXX XXX") +
    '<p class="error" id="error-cuenta" role="alert"></p><div class="fila"><button type="button" class="boton" data-accion="cerrar-capa">Cancelar</button><button class="boton boton-sol" type="submit" style="flex:1">Continuar</button></div></div></form></div>';
  $("#c-nombre").focus();
}
async function cargarMias() {
  const cl = clienteActual();
  if (!cl) { ui.mias = null; return; }
  try { ui.mias = (await api("/api/mis-reservas?" + qs({ telefono: cl.telefono }))).reservas; } catch (e) { ui.mias = []; }
  // Las estadías pagadas deciden si ya eres cliente frecuente
  const est = ui.mias.filter((r) => ["pagada", "en_curso", "completada"].includes(r.estado)).length;
  if (est !== cl.estadias) { guardarLocal("hospedoggy-cliente", Object.assign({}, cl, { estadias: est })); const b = $(".cuenta-cli"); if (b) b.outerHTML = barraCuenta(); }
  const s = $("#mis-reservas"); if (s) s.outerHTML = seccionMias();
}

/* ---------- Pintar ---------- */
function render() {
  const app = $("#app");
  document.body.classList.toggle("con-barra", !!ui.casa && !ui.reserva && ui.vista === "casa");
  let html = barraCuenta() + '<p class="ok" id="aviso-global" role="status"></p>';
  if (ui.vista === "reserva") html += vistaReserva() + seccionMias();
  else if (ui.vista === "casa" && ui.casa) html += vistaDetalleCasa();
  else if (ui.vista === "casa") html += '<div class="cargando-tarjeta" style="height:420px;margin-top:24px"></div>';
  else html += '<section class="portada"><div><p class="etiqueta">Hospedaje para perros en Lima</p><h1 style="margin-top:12px">Tú te vas de viaje. Tu perro, <em>de vacaciones</em>.</h1>' +
    '<p class="bajada">Compara casas de cuidadores verificados, mira el total al instante y paga en línea con Yape o tarjeta.</p>' + formularioBusqueda(true) +
    '<ul class="sellos"><li>Cuidadores verificados</li><li>Recojo en tu casa</li><li>Pago 100% en línea</li><li>Reportes con fotos</li></ul></div>' +
    '<div class="pase-lado" id="pase-lado">' + paseBusqueda() + "</div></section>" +
    '<section class="bloque" id="resultados" tabindex="-1"><div id="zona-resultados">' + zonaResultados() + "</div></section>" + seccionMias() + seccionesConfianza();
  app.innerHTML = html + pieCliente();
  if (ui.aviso) { $("#aviso-global").textContent = ui.aviso; ui.aviso = ""; }
  const b = $("#estadia .burbujas"); if (b) b.scrollTop = b.scrollHeight;
}
function pintarBusqueda() {
  const pl = $("#pase-lado"), zr = $("#zona-resultados");
  if (pl) pl.innerHTML = paseBusqueda();
  if (zr) zr.innerHTML = zonaResultados();
}
function pintarCotizacion() {
  const a = $("#resumen-estadia"), bp = $("#barra-pago"), pf = $("#pagar-final");
  if (a) a.innerHTML = resumenEstadia(); if (bp) bp.innerHTML = barraPago(); if (pf) pf.innerHTML = botonPagar();
}

/* ---------- Datos ---------- */
let pedidoBusqueda = 0;
async function buscar() {
  const b = ui.busqueda, n = ++pedidoBusqueda;
  ui.error = "";
  if (!busquedaValida(b)) { ui.lista = []; pintarBusqueda(); return; }
  ui.lista = null; pintarBusqueda();
  try {
    const d = await api("/api/buscar?" + qs({ ingreso: b.ingreso, salida: b.salida, perros: b.perros }));
    if (n !== pedidoBusqueda) return;
    ui.reglas = d.reglas; ui.lista = d.cuidadores; ui.error = d.aviso || "";
  } catch (e) { if (n === pedidoBusqueda) { ui.error = e.message; ui.lista = []; } }
  pintarBusqueda();
}
let pedidoCasa = 0;
async function cargarCasa(soloCotizacion) {
  const b = ui.busqueda, n = ++pedidoCasa;
  const tel = ultimos9((ui.formReserva && ui.formReserva.telefono) || ($("#r-telefono") && $("#r-telefono").value) || (clienteActual() || {}).telefono || "");
  try {
    const d = await api("/api/casa?" + qs({ id: ui.casaId, ingreso: b.ingreso, salida: b.salida, perros: b.perros, telefono: tel.length === 9 ? tel : "" }));
    if (n !== pedidoCasa) return;
    if (d.aviso) { ui.aviso = d.aviso; }
    ui.reglas = d.reglas; ui.casa = d.casa; ui.primera = d.primera; ui.telValido = d.telValido;
    if (!d.casa.q) { ui.vista = "inicio"; ui.casa = null; ui.aviso = d.aviso || "Revisa las fechas."; render(); buscar(); return; }
    if (soloCotizacion) pintarCotizacion(); else render();
  } catch (e) { ui.vista = "inicio"; ui.casa = null; ui.aviso = e.message; render(); buscar(); }
}
async function abrirReserva(id, token, pagoId) {
  ui.vista = "reserva"; ui.reserva = null; ui.cancelacion = null; render(); window.scrollTo(0, 0);
  ui.pagoRechazado = !!pagoId && /rejected|failure/.test(new URLSearchParams(location.search).get("status") || "");
  let intentos = 0;
  const consultar = async () => {
    try {
      const d = await api("/api/reserva?" + qs({ r: id, t: token, payment_id: pagoId }));
      if (d.reserva.estado === "pendiente_pago" && pagoId && !/rejected|failure|null/.test(new URLSearchParams(location.search).get("status") || "") && intentos++ < 6) { setTimeout(consultar, 3000); return; }
      ui.reserva = d.reserva; ui.cancelacion = d.cancelacion; ui.token = token;
      ui.mensajes = d.mensajes || []; ui.reportes = d.reportes || []; ui.puedeResenar = !!d.puedeResenar;
      guardarEnlace({ id, token, codigo: d.reserva.codigo });
      render(); cargarMias();
    } catch (e) { ui.vista = "inicio"; ui.aviso = e.message; history.replaceState(null, "", location.pathname); render(); buscar(); }
  };
  consultar();
}

/* ---------- De dónde llegó el cliente (para el tablero) ---------- */
function canalDeOrigen() {
  const guardado = leerLocal("hospedoggy-canal", null);
  if (guardado) return guardado;
  const p = new URLSearchParams(location.search);
  const nombre = (t) => /facebook|^fb$|meta/.test(t) ? "Facebook" : /instagram|^ig$/.test(t) ? "Instagram" : /google/.test(t) ? "Google" : /tiktok/.test(t) ? "TikTok" : /whatsapp|^wa$/.test(t) ? "WhatsApp" : "";
  const u = (p.get("utm_source") || p.get("ref") || "").toLowerCase().trim();
  if (u) return nombre(u) || u.slice(0, 30);
  if (p.get("fbclid")) return "Facebook";
  if (p.get("gclid")) return "Google";
  let host = "";
  try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ""; } catch (e) {}
  if (!host || host === location.hostname) return "Directo";
  return nombre(host.replace(/^www\./, "").split(".")[0]) || "Otra página";
}
// Se guarda la primera vez que llega, así no se pierde si reserva días después
(function recordarCanal() { if (!leerLocal("hospedoggy-canal", null)) { const c = canalDeOrigen(); if (c !== "Directo") guardarLocal("hospedoggy-canal", c); } })();

/* ---------- Leer y validar la ficha (el servidor vuelve a validar todo) ---------- */
function leerFormReserva() {
  const v = (id) => { const el = $("#" + id); return el ? el.value.trim() : ""; };
  const radio = (name) => (document.querySelector('input[name="' + name + '"]:checked') || {}).value || "";
  const prev = ui.formReserva || {};
  const n = $$("[id^='h-nombre-']").length || ui.busqueda.perros;
  const huespedes = Array.from({ length: Math.max(n, ui.busqueda.perros) }, (_, i) => $("#h-nombre-" + i) ? ({ nombre: v("h-nombre-" + i), edad: v("h-edad-" + i), raza: v("h-raza-" + i), tamano: v("h-tamano-" + i), sexo: radio("sexo-" + i),
    medicamento: radio("med-" + i), medicamentoDetalle: v("h-med-" + i), alimentacion: v("h-alim-" + i), juguetes: v("h-jug-" + i),
    comportamiento: $$('input[name="comp-' + i + '"]:checked').map((x) => x.value), comportamientoOtro: v("h-comp-" + i), sociable: radio("soc-" + i) }) : (prev.huespedes || [])[i] || {});
  return { nombre: v("r-nombre"), telefono: v("r-telefono"), email: v("r-email"), direccion: v("r-direccion"), referencia: v("r-referencia"), huespedes, acepto: !!($("#r-acepto") || {}).checked };
}
function validarReserva(d) {
  if (d.nombre.split(/\s+/).filter(Boolean).length < 2) return "Escribe tu nombre y apellido.";
  if (!/^9\d{8}$/.test(ultimos9(d.telefono))) return "Escribe un celular de 9 dígitos que empiece con 9.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return "Escribe un correo válido: ahí te llega la confirmación.";
  if (!d.direccion) return "Falta la dirección y el distrito de recojo.";
  if (!d.referencia) return "Falta una referencia para encontrar tu casa.";
  for (let i = 0; i < ui.busqueda.perros; i++) {
    const h = d.huespedes[i] || {};
    const de = h.nombre ? " de " + h.nombre : ui.busqueda.perros > 1 ? " del huésped " + (i + 1) : " de tu perro";
    if (!h.nombre) return "Falta el nombre" + de + ".";
    if (!h.edad) return "Falta la edad" + de + ".";
    if (!h.raza) return "Falta la raza" + de + ".";
    if (!h.sexo) return "Elige el sexo" + de + ".";
    if (!h.sociable) return "Indica si" + (h.nombre ? " " + h.nombre : " tu perro") + " es sociable con otros perros.";
    if (!h.medicamento) return "Indica si" + (h.nombre ? " " + h.nombre : " tu perro") + " toma algún medicamento o tiene una condición especial.";
    if (h.medicamento === "Sí" && !h.medicamentoDetalle) return "Detalla el medicamento o la condición" + de + ", con horario y frecuencia.";
    if (!h.alimentacion) return "Falta la alimentación" + de + " (marca, cantidad y horarios).";
    if (!(h.comportamiento || []).length && !h.comportamientoOtro) return "Cuéntanos el comportamiento general" + de + ".";
  }
  if (!d.acepto) return "Para pagar, marca que aceptas las condiciones: responsabilidad solo por reservas pagadas aquí y la política de cancelación.";
  return "";
}
async function pagar(boton) {
  const d = leerFormReserva(); ui.formReserva = d;
  const err = $("#error-reserva");
  const falta = validarReserva(d);
  if (falta) { err.textContent = falta; err.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  err.textContent = "";
  $$("[data-accion='pagar']").forEach((x) => { x.disabled = true; x.textContent = "Separando tu cupo…"; });
  try {
    const b = ui.busqueda;
    const r = await api("/api/reservas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      cuidador: ui.casaId, ingreso: b.ingreso, salida: b.salida, perros: b.perros, acepto: d.acepto, canal: canalDeOrigen(),
      cliente: { nombre: d.nombre, telefono: d.telefono, email: d.email, direccion: d.direccion, referencia: d.referencia }, huespedes: d.huespedes.slice(0, b.perros) }) });
    guardarEnlace({ id: r.id, token: r.token, codigo: r.codigo });
    const cl = clienteActual();
    if (!cl || cl.telefono !== ultimos9(d.telefono)) guardarLocal("hospedoggy-cliente", { nombre: d.nombre, telefono: ultimos9(d.telefono), estadias: 0 });
    $$("[data-accion='pagar']").forEach((x) => { x.textContent = "Te llevamos a Mercado Pago…"; });
    location.href = r.pagarEn;
  } catch (e) {
    err.textContent = e.message; err.scrollIntoView({ behavior: "smooth", block: "center" });
    pintarCotizacion();
    if (e.estado === 409) cargarCasa(true);
  }
}

/* ---------- Visor de fotos ---------- */
function abrirVisor(i) {
  const c = ui.casa, f = c.fotos[i];
  ui.visor = i;
  $("#capa").innerHTML = '<div class="visor" role="dialog" aria-modal="true" aria-label="Fotos de ' + esc(c.nombrePublico) + '"><div class="visor-barra"><b>' + esc(c.nombrePublico) + "</b><span>" + (i + 1) + " de " + c.fotos.length + '</span><button class="boton boton-chico" data-accion="cerrar-capa">Cerrar</button></div>' +
    '<div class="visor-foto">' + (c.fotos.length > 1 ? '<button class="visor-nav izq" data-accion="visor-mover" data-paso="-1" aria-label="Foto anterior">‹</button>' : "") + '<img src="' + esc(f.src) + '" alt="' + esc(f.leyenda || c.nombrePublico) + '" onerror="fotoRota(this)">' +
    (c.fotos.length > 1 ? '<button class="visor-nav der" data-accion="visor-mover" data-paso="1" aria-label="Foto siguiente">›</button>' : "") + "</div>" +
    '<div class="visor-pie">' + esc(f.leyenda || "") + "</div></div>";
  $(".visor [data-accion='cerrar-capa']").focus();
}
function cerrarCapa() { $("#capa").innerHTML = ""; ui.visor = null; }

/* ---------- Eventos ---------- */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-accion]");
  if (!el || el.tagName === "INPUT") return;
  const a = el.dataset.accion;
  if (a === "ver-casa") { ui.casaId = el.dataset.id; ui.casa = null; ui.formReserva = null; ui.vista = "casa"; render(); window.scrollTo(0, 0); cargarCasa(false); }
  if (a === "volver") { ui.vista = "inicio"; ui.casa = null; render(); requestAnimationFrame(() => { const r = $("#resultados"); if (r) r.scrollIntoView({ block: "start" }); }); buscar(); }
  if (a === "reintentar") buscar();
  if (a === "pagar") pagar(el);
  if (a === "ver-foto") abrirVisor(Number(el.dataset.i));
  if (a === "visor-mover") abrirVisor((ui.visor + Number(el.dataset.paso) + ui.casa.fotos.length) % ui.casa.fotos.length);
  if (a === "cerrar-capa") cerrarCapa();
  if (a === "abrir-cuenta") abrirCuenta();
  if (a === "salir-cliente") { guardarLocal("hospedoggy-cliente", null); ui.mias = null; ui.formReserva = null; ui.aviso = "Saliste de tu cuenta."; render(); if (ui.vista === "inicio") buscar(); }
  if (a === "ir-mis-reservas") { const m = $("#mis-reservas"); if (m) m.scrollIntoView({ behavior: "smooth" }); }
  if (a === "ir-cotizador") { window.scrollTo({ top: 0, behavior: "smooth" }); const i = $("#b-ingreso"); if (i) i.focus({ preventScroll: true }); }
  if (a === "abrir-reserva") { const x = enlaces().find((y) => y.id === el.dataset.id); if (x) { history.pushState(null, "", "?" + qs({ reserva: x.id, t: x.token })); abrirReserva(x.id, x.token); } }
  if (a === "nueva-busqueda") { history.pushState(null, "", location.pathname); ui.vista = "inicio"; ui.reserva = null; render(); window.scrollTo(0, 0); buscar(); }
  if (a === "reintentar-pago") { history.pushState(null, "", location.pathname); ui.busqueda = Object.assign({}, ui.busqueda, { ingreso: ui.reserva.ingreso, salida: ui.reserva.salida, perros: ui.reserva.perros }); ui.casaId = el.dataset.id; ui.vista = "casa"; ui.casa = null; ui.reserva = null; render(); cargarCasa(false); }
  if (a === "pedir-cancelar") pedirCancelar();
  if (a === "actualizar-chat") refrescarReserva();
  if (a === "reportar-cliente") abrirReporteCliente();
  if (a === "rapida-cliente") { const m = $("#msg-cliente"); m.value = el.dataset.texto; ui.borradorChat = m.value; m.focus(); }
  if (a === "confirmar-cancelar") {
    el.disabled = true; el.textContent = "Cancelando…";
    try {
      const d = await api("/api/cancelar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ r: ui.reserva.id, t: ui.token }) });
      cerrarCapa(); ui.reserva = d.reserva; ui.cancelacion = { cancelable: false }; ui.aviso = "Listo, cancelamos tu reserva. Te devolvemos " + soles(d.monto) + (d.pendiente ? " en las próximas 48 horas." : "."); render(); cargarMias();
    } catch (err) { $("#error-cancelar").textContent = err.message; el.disabled = false; el.textContent = "Intentar de nuevo"; }
  }
});
function leerBusqueda() {
  let ing = $("#b-ingreso").value, sal = $("#b-salida").value;
  if (ing && (!sal || sal <= ing)) { sal = sumarDias(ing, 1); $("#b-salida").value = sal; }
  ui.busqueda = { ingreso: ing, salida: sal, tamano: $("#b-tamano").value, perros: Number($("#b-perros").value) };
}
document.addEventListener("change", (e) => {
  const t = e.target;
  if (["b-ingreso", "b-salida", "b-perros", "b-tamano"].includes(t.id)) { leerBusqueda(); if (t.id === "b-tamano") pintarBusqueda(); else buscar(); return; }
  if (["q-ingreso", "q-salida", "q-perros"].includes(t.id)) {
    ui.formReserva = leerFormReserva();
    let ing = $("#q-ingreso").value, sal = $("#q-salida").value;
    if (ing && (!sal || sal <= ing)) sal = sumarDias(ing, 1);
    const perrosAntes = ui.busqueda.perros;
    ui.busqueda = Object.assign({}, ui.busqueda, { ingreso: ing, salida: sal, perros: Number($("#q-perros").value) });
    cargarCasa(ui.busqueda.perros === perrosAntes);
    return;
  }
  if (t.id === "f-estrella") { ui.soloEstrella = t.checked; pintarBusqueda(); }
  if (t.id === "f-jardin") { ui.soloJardin = t.checked; pintarBusqueda(); }
  if (t.id === "f-orden") { ui.orden = t.value; pintarBusqueda(); }
});
let esperaTel;
document.addEventListener("input", (e) => {
  if (e.target.id === "msg-cliente") ui.borradorChat = e.target.value;
  if (e.target.id === "r-telefono" && ui.casa) {
    clearTimeout(esperaTel);
    const tel = ultimos9(e.target.value);
    if (tel.length === 9 || ui.telValido) esperaTel = setTimeout(() => { ui.formReserva = leerFormReserva(); cargarCasa(true); }, 400);
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "form-chat") {
    const m = $("#msg-cliente"); const txt = m.value.trim(); if (!txt) return;
    const btn = $("button", f); btn.disabled = true;
    ui.borradorChat = "";
    try { await accionReserva({ accion: "mensaje", texto: txt }); const n = $("#msg-cliente"); if (n) n.focus(); }
    catch (err) { ui.borradorChat = txt; btn.disabled = false; mensajeCliente(err.message); }
    return;
  }
  if (f.id === "form-resena") {
    try { await accionReserva({ accion: "resena", estrellas: Number(($("input[name=estrellas]:checked", f) || {}).value), texto: $("#resena-texto").value.trim() }); ui.aviso = ""; }
    catch (err) { $("#error-resena").textContent = err.message; }
    return;
  }
  if (f.id === "form-incidencia") {
    try { await accionReserva({ accion: "incidencia", motivo: $("#inc-motivo").value, texto: $("#inc-texto").value.trim() }); mensajeCliente("Gracias. El equipo de Hospedoggy revisa tu reporte y te escribe."); }
    catch (err) { $("#error-incidencia").textContent = err.message; }
    return;
  }
  if (f.id === "form-busqueda") {
    leerBusqueda(); ui.vista = "inicio"; ui.casa = null;
    if (!$("#zona-resultados")) render();
    await buscar();
    requestAnimationFrame(() => { const r = $("#resultados"); if (r) { r.scrollIntoView({ behavior: "smooth", block: "start" }); r.focus({ preventScroll: true }); } });
  }
  if (f.id === "form-cuenta") {
    const btn = $("button[type=submit]", f); btn.disabled = true;
    try {
      const d = await api("/api/cuenta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: $("#c-nombre").value, telefono: $("#c-telefono").value }) });
      guardarLocal("hospedoggy-cliente", { nombre: d.nombre, telefono: d.telefono, estadias: d.estadias });
      cerrarCapa();
      ui.aviso = d.estadias ? "Qué bueno verte de nuevo: tienes " + plural(d.estadias, "estadía", "estadías") + " con Hospedoggy." : d.nuevo ? "Cuenta creada. Si la casa ofrece recojo gratis en la primera estadía, se descuenta solo." : "Ingresaste a tu cuenta.";
      ui.mias = null; render(); cargarMias();
      if (ui.vista === "inicio") pintarBusqueda(); else if (ui.vista === "casa") cargarCasa(false);
    } catch (err) { $("#error-cuenta").textContent = err.message; btn.disabled = false; }
  }
});
document.addEventListener("keydown", (e) => {
  if (ui.visor !== null && ui.casa) {
    if (e.key === "Escape") cerrarCapa();
    if (e.key === "ArrowRight") abrirVisor((ui.visor + 1) % ui.casa.fotos.length);
    if (e.key === "ArrowLeft") abrirVisor((ui.visor - 1 + ui.casa.fotos.length) % ui.casa.fotos.length);
  } else if (e.key === "Escape" && $("#capa").innerHTML) cerrarCapa();
});
window.addEventListener("popstate", () => inicio());

/* ---------- Arranque ---------- */
function inicio() {
  const p = new URLSearchParams(location.search);
  if (p.get("reserva") && p.get("t")) { abrirReserva(p.get("reserva"), p.get("t"), p.get("payment_id") || p.get("collection_id")); return; }
  ui.vista = "inicio"; render(); buscar(); cargarMias();
}
inicio();
