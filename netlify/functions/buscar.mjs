import { rpc } from "../lib/db.mjs";
import { json } from "../lib/entorno.mjs";
import { cuidadorPublico, reglas } from "../lib/publico.mjs";
import { validarFechas } from "../lib/validar.mjs";


// GET /api/buscar?ingreso=&salida=&perros=  → casas verificadas con su total para esas fechas
export default async (req) => {
  try {
    const u = new URL(req.url);
    const cfg = await rpc("api_config");
    const ingreso = u.searchParams.get("ingreso") || "", salida = u.searchParams.get("salida") || "";
    const perros = Math.min(Math.max(parseInt(u.searchParams.get("perros") || "1", 10) || 1, 1), cfg.max_perros);
    const aviso = validarFechas(ingreso, salida);
    const lista = await rpc("api_cuidadores", { p_ingreso: aviso ? null : ingreso, p_salida: aviso ? null : salida, p_id: null });
    const b = aviso ? null : { ingreso, salida, perros, primera: false };
    return json({ reglas: reglas(cfg), aviso, cuidadores: lista.map((c) => cuidadorPublico(c, cfg, b)) });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos cargar las casas. Intenta de nuevo en un momento." }, 500);
  }
};
export const config = { path: "/api/buscar" };
