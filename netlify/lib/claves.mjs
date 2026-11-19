// Contraseñas (scrypt) y sesiones firmadas para los paneles de cuidador y administrador.
import crypto from "node:crypto";
import { env } from "./entorno.mjs";

export function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(clave), sal, 32, { N: 16384, r: 8, p: 1 });
  return "scrypt$" + sal.toString("base64") + "$" + h.toString("base64");
}
export function claveCorrecta(clave, guardado) {
  if (!guardado || !String(guardado).startsWith("scrypt$")) return false;
  const [, s, h] = String(guardado).split("$");
  const esperado = Buffer.from(h, "base64");
  const calc = crypto.scryptSync(String(clave), Buffer.from(s, "base64"), esperado.length, { N: 16384, r: 8, p: 1 });
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}
export function claveTemporal() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let t = "";
  for (const b of crypto.randomBytes(10)) t += a[b % a.length];
  return t;
}
// Mismas reglas del prototipo validado
export function problemaClave(nueva, usuario, actual) {
  nueva = String(nueva || "");
  if (nueva.length < 8) return "La contraseña nueva debe tener al menos 8 caracteres.";
  if (!/\d/.test(nueva) || !/[a-záéíóúñ]/i.test(nueva)) return "Usa letras y al menos un número.";
  if (usuario && nueva.toLowerCase().includes(String(usuario).toLowerCase())) return "La contraseña no puede contener tu usuario.";
  if (actual && nueva === actual) return "La contraseña nueva tiene que ser distinta a la actual.";
  return "";
}

// La sesión dura 30 días y se invalida sola si cambia la contraseña.
const secreto = () => crypto.createHash("sha256").update("hospedoggy-sesiones|" + (env("SESION_SECRETO") || env("SUPABASE_SERVICE_KEY"))).digest();
const huella = (hash) => crypto.createHash("sha256").update(String(hash || "")).digest("base64url").slice(0, 12);
const firmar = (datos) => crypto.createHmac("sha256", secreto()).update(datos).digest("base64url");

export function crearSesion(rol, id, claveHash) {
  const datos = Buffer.from(JSON.stringify({ r: rol, i: id, v: huella(claveHash), e: Date.now() + 30 * 86400000 })).toString("base64url");
  return datos + "." + firmar(datos);
}
export function leerSesion(token) {
  const [datos, firma] = String(token || "").split(".");
  if (!datos || !firma) return null;
  const esperado = firmar(datos);
  if (esperado.length !== firma.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(firma))) return null;
  try {
    const s = JSON.parse(Buffer.from(datos, "base64url").toString());
    return s.e > Date.now() ? s : null;
  } catch { return null; }
}
export const versionClave = huella;
