import { rpc } from "../lib/db.mjs";
import { json } from "../lib/entorno.mjs";
import { normalizarTelefono } from "../lib/validar.mjs";

// GET /api/mis-reservas?telefono=  → lista corta (código, casa, fechas y estado).
// Direcciones, fichas y cancelación solo se ven con el enlace privado de cada reserva.
export default async (req) => {
  try {
    const tel = normalizarTelefono(new URL(req.url).searchParams.get("telefono"));
    if (!tel) return json({ reservas: [] });
    return json({ reservas: await rpc("api_mis_reservas", { p_telefono: tel }) });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos cargar tus reservas." }, 500);
  }
};
export const config = { path: "/api/mis-reservas" };
