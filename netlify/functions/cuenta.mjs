import { rpc } from "../lib/db.mjs";
import { json } from "../lib/entorno.mjs";
import { normalizarTelefono } from "../lib/validar.mjs";

// POST /api/cuenta {nombre, telefono}: crea o actualiza la cuenta del cliente. Solo celular y nombre.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const nombre = String(b.nombre || "").trim().slice(0, 80);
    const tel = normalizarTelefono(b.telefono);
    if (!nombre) return json({ error: "Escribe tu nombre." }, 422);
    if (!tel) return json({ error: "Escribe un celular de 9 dígitos que empiece con 9." }, 422);
    const r = await rpc("api_cuenta", { p_telefono: tel, p_nombre: nombre });
    return json({ ok: true, telefono: tel, nombre, nuevo: r.nuevo, estadias: Number(r.estadias) });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos entrar a tu cuenta. Intenta de nuevo." }, 500);
  }
};
export const config = { path: "/api/cuenta" };
