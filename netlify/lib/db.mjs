import { env } from "./entorno.mjs";
// Todas las consultas pasan por funciones de la base de datos (supabase/esquema.sql)
export async function rpc(funcion, args = {}) {
  const base = env("SUPABASE_URL").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, ""); // acepta la URL con o sin /rest/v1/
  const clave = env("SUPABASE_SERVICE_KEY");
  if (!base || !clave) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY");
  const res = await fetch(base + "/rest/v1/rpc/" + funcion, {
    method: "POST",
    headers: Object.assign({ apikey: clave, "Content-Type": "application/json", Accept: "application/json" },
      clave.startsWith("eyJ") ? { Authorization: "Bearer " + clave } : {}), // claves nuevas sb_secret_ van solo en apikey
    body: JSON.stringify(args)
  });
  const texto = await res.text();
  if (!res.ok) throw new Error("Base de datos " + funcion + " " + res.status + ": " + texto.slice(0, 300));
  return texto ? JSON.parse(texto) : null;
}
