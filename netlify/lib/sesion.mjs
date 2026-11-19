import { rpc } from "./db.mjs";
import { leerSesion, versionClave } from "./claves.mjs";

// Lee el token del panel y confirma que la cuenta sigue con la misma contraseña.
export async function autenticar(req) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const s = leerSesion(t);
  if (!s) return null;
  const cuenta = await rpc("api_sesion", { p_rol: s.r, p_id: s.i });
  if (!cuenta || !cuenta.clave_hash || versionClave(cuenta.clave_hash) !== s.v) return null;
  return { rol: s.r, id: s.i, usuario: cuenta.usuario, claveHash: cuenta.clave_hash, debeCambiar: cuenta.debe_cambiar };
}
