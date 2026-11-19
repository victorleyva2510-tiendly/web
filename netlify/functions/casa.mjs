import { rpc } from "../lib/db.mjs";
import { json } from "../lib/entorno.mjs";
import { cuidadorPublico, reglas } from "../lib/publico.mjs";
import { validarFechas, normalizarTelefono } from "../lib/validar.mjs";

// GET /api/casa?id=&ingreso=&salida=&perros=&telefono=  → una casa con su cotización.
// Con el celular, el servidor decide si aplica el recojo gratis de la primera estadía.
export default async (req) => {
  try {
    const u = new URL(req.url);
    const cfg = await rpc("api_config");
    const ingreso = u.searchParams.get("ingreso") || "", salida = u.searchParams.get("salida") || "";
    const perros = Math.min(Math.max(parseInt(u.searchParams.get("perros") || "1", 10) || 1, 1), cfg.max_perros);
    const tel = normalizarTelefono(u.searchParams.get("telefono"));
    const aviso = validarFechas(ingreso, salida);
    const [c] = await rpc("api_cuidadores", { p_ingreso: aviso ? null : ingreso, p_salida: aviso ? null : salida, p_id: String(u.searchParams.get("id") || "") });
    if (!c) return json({ error: "Esta casa ya no está disponible." }, 404);
    const primera = tel ? (await rpc("api_es_primera", { p_telefono: tel })) === true : false;
    return json({ reglas: reglas(cfg), aviso, telValido: Boolean(tel), primera,
      casa: cuidadorPublico(c, cfg, aviso ? null : { ingreso, salida, perros, primera }) });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos cargar esta casa. Intenta de nuevo en un momento." }, 500);
  }
};
export const config = { path: "/api/casa" };
