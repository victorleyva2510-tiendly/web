import { esIso, difDias } from "./precios.mjs";
import { hoyLima } from "./entorno.mjs";

const limpio = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const COMPORTAMIENTOS = ["Tranquilo", "Juguetón", "Miedoso", "Ansioso", "Muy activo", "Protector"];
export function normalizarTelefono(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("51")) d = d.slice(2);
  return /^9\d{8}$/.test(d) ? d : "";
}
export function validarFechas(ingreso, salida, hoy = hoyLima()) {
  if (!esIso(ingreso) || !esIso(salida)) return "Elige las fechas de ingreso y salida.";
  if (ingreso < hoy) return "La fecha de ingreso ya pasó.";
  if (salida <= ingreso) return "La salida tiene que ser al menos un día después del ingreso.";
  if (difDias(ingreso, salida) > 60) return "Por ahora reservamos hasta 60 noches seguidas.";
  return "";
}
// Mismas validaciones del prototipo, ahora en el servidor (el navegador no es confiable)
export function validarReserva(d, c, cfg) {
  const perros = Number(d.perros);
  const fechas = validarFechas(d.ingreso, d.salida);
  if (fechas) return { error: fechas };
  if (!Number.isInteger(perros) || perros < 1 || perros > cfg.max_perros) return { error: "Puedes reservar de 1 a " + cfg.max_perros + " perros." };
  const cl = d.cliente || {};
  const cliente = { nombre: limpio(cl.nombre, 80), telefono: normalizarTelefono(cl.telefono), email: limpio(cl.email, 120).toLowerCase(),
    direccion: limpio(cl.direccion, 160), referencia: limpio(cl.referencia, 160) };
  if (cliente.nombre.split(" ").filter(Boolean).length < 2) return { error: "Escribe tu nombre y apellido." };
  if (!cliente.telefono) return { error: "Escribe un celular de 9 dígitos que empiece con 9." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cliente.email)) return { error: "Escribe un correo válido: ahí te llega la confirmación." };
  if (!cliente.direccion) return { error: "Falta la dirección y el distrito de recojo." };
  if (!cliente.referencia) return { error: "Falta una referencia para encontrar tu casa." };
  const lista = Array.isArray(d.huespedes) ? d.huespedes.slice(0, perros) : [];
  if (lista.length !== perros) return { error: "Llena la ficha de cada perro." };
  const huespedes = [];
  for (let i = 0; i < lista.length; i++) {
    const h = lista[i] || {};
    const x = { nombre: limpio(h.nombre, 40), edad: limpio(h.edad, 30), raza: limpio(h.raza, 60), tamano: limpio(h.tamano, 20), sexo: limpio(h.sexo, 10),
      medicamento: limpio(h.medicamento, 3), medicamentoDetalle: limpio(h.medicamentoDetalle, 400), alimentacion: limpio(h.alimentacion, 400),
      juguetes: limpio(h.juguetes, 200), comportamiento: (Array.isArray(h.comportamiento) ? h.comportamiento : []).filter((v) => COMPORTAMIENTOS.includes(v)),
      comportamientoOtro: limpio(h.comportamientoOtro, 200), sociable: limpio(h.sociable, 10) };
    const de = x.nombre ? " de " + x.nombre : perros > 1 ? " del huésped " + (i + 1) : " de tu perro";
    if (!x.nombre) return { error: "Falta el nombre" + de + "." };
    if (!x.edad) return { error: "Falta la edad" + de + "." };
    if (!x.raza) return { error: "Falta la raza" + de + "." };
    if (!c.tamanos.includes(x.tamano)) return { error: "Esta casa no recibe perros de tamaño " + (x.tamano || "sin indicar") + "." };
    if (!["Macho", "Hembra"].includes(x.sexo)) return { error: "Elige el sexo" + de + "." };
    if (!["Sí", "No", "Depende"].includes(x.sociable)) return { error: "Indica si" + (x.nombre ? " " + x.nombre : " tu perro") + " es sociable con otros perros." };
    if (!["Sí", "No"].includes(x.medicamento)) return { error: "Indica si" + (x.nombre ? " " + x.nombre : " tu perro") + " toma algún medicamento o tiene una condición especial." };
    if (x.medicamento === "Sí" && !x.medicamentoDetalle) return { error: "Detalla el medicamento o la condición" + de + ", con horario y frecuencia." };
    if (!x.alimentacion) return { error: "Falta la alimentación" + de + " (marca, cantidad y horarios)." };
    if (!x.comportamiento.length && !x.comportamientoOtro) return { error: "Cuéntanos el comportamiento general" + de + "." };
    huespedes.push(x);
  }
  if (d.acepto !== true) return { error: "Para pagar, marca que aceptas las condiciones: responsabilidad solo por reservas pagadas aquí y la política de cancelación." };
  return { perros, cliente, huespedes };
}
