// Tarea diaria (10:00 a. m. de Lima): pide la reseña a los clientes cuya estadía terminó.
import { rpc } from "../lib/db.mjs";
import { enviarCorreo, correoResena } from "../lib/correo.mjs";

export default async () => {
  try {
    const lista = await rpc("api_pedir_resenas");
    for (const r of lista) await enviarCorreo(correoResena(r));
    console.log("Reseñas pedidas:", lista.length);
  } catch (e) { console.error(e); }
  return new Response("ok");
};
export const config = { schedule: "0 15 * * *" };
