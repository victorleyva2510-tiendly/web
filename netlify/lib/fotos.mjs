// Sube fotos a Supabase Storage (carpeta pública "fotos"). El navegador ya las manda comprimidas en JPG.
import crypto from "node:crypto";
import { env } from "./entorno.mjs";

const MAX = 4 * 1024 * 1024;
export async function subirFoto(dataUrl, carpeta) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw Object.assign(new Error("La foto no es una imagen válida."), { estado: 422 });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX) throw Object.assign(new Error("La foto pesa demasiado."), { estado: 422 });
  const base = env("SUPABASE_URL").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const clave = env("SUPABASE_SERVICE_KEY");
  const ruta = carpeta.replace(/[^a-z0-9/-]/gi, "") + "/" + Date.now().toString(36) + "-" + crypto.randomBytes(6).toString("hex") + "." + (m[1] === "jpeg" ? "jpg" : m[1]);
  const res = await fetch(base + "/storage/v1/object/fotos/" + ruta, {
    method: "POST",
    headers: Object.assign({ apikey: clave, "Content-Type": "image/" + m[1], "x-upsert": "true", "cache-control": "31536000" },
      clave.startsWith("eyJ") ? { Authorization: "Bearer " + clave } : {}),
    body: bytes
  });
  if (!res.ok) throw new Error("No se pudo guardar la foto (" + res.status + "): " + (await res.text()).slice(0, 200));
  return base + "/storage/v1/object/public/fotos/" + ruta;
}
