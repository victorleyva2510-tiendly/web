import { rpc } from "../lib/db.mjs";
import { json } from "../lib/entorno.mjs";
import { claveCorrecta, crearSesion } from "../lib/claves.mjs";

// POST /api/login {usuario, clave}: ingreso a los paneles de cuidador y administrador
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const usuario = String(b.usuario || "").trim().toLowerCase().slice(0, 40);
    const clave = String(b.clave || "").slice(0, 200);
    if (!usuario || !clave) return json({ error: "Escribe tu usuario y tu contraseña." }, 422);
    const c = await rpc("api_login_datos", { p_usuario: usuario });
    if (Number(c.fallos) >= 8) return json({ error: "Demasiados intentos. Espera 15 minutos y vuelve a probar." }, 429);
    if (!c.rol || !c.clave_hash) {
      await rpc("api_login_fallo", { p_usuario: usuario });
      return json({ error: c.rol ? "Esta cuenta todavía no tiene contraseña. Pídele a Hospedoggy una contraseña temporal." : "Usuario o contraseña incorrectos." }, 401);
    }
    if (!claveCorrecta(clave, c.clave_hash)) {
      await rpc("api_login_fallo", { p_usuario: usuario });
      return json({ error: "Usuario o contraseña incorrectos." }, 401);
    }
    await rpc("api_login_ok", { p_usuario: usuario });
    return json({ token: crearSesion(c.rol, c.id, c.clave_hash), rol: c.rol, debeCambiar: c.debe_cambiar });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos iniciar sesión. Intenta de nuevo." }, 500);
  }
};
export const config = { path: "/api/login" };
