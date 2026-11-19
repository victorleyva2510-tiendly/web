// Reglas de texto del prototipo validado: ocultar datos de contacto y revisar descripciones de perfil.
export function ocultarContacto(t) {
  let oculto = false;
  const texto = String(t || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => { oculto = true; return "[correo oculto]"; })
    .replace(/(wa\.me|whatsapp\.com|instagram\.com|facebook\.com|tiktok\.com|t\.me)\/\S*/gi, () => { oculto = true; return "[enlace oculto]"; })
    .replace(/(\+?\d[\d\s.-]{6,}\d)/g, (m) => { if (m.replace(/\D/g, "").length < 8) return m; oculto = true; return "[número oculto]"; });
  return { texto, oculto };
}
export function problemasTexto(t, nombreInterno) {
  const p = [];
  if (ocultarContacto(t).oculto) p.push("tiene un teléfono, correo o enlace");
  if (/@\w{3,}/.test(t)) p.push("tiene un usuario de redes sociales");
  if (/\b(www\.|https?:|\.com\b|\.pe\b)/i.test(t)) p.push("tiene una página web");
  if (/\b(s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|ruc)\b/i.test(t)) p.push("menciona una razón social o RUC");
  if (nombreInterno && t.toLowerCase().includes(String(nombreInterno).toLowerCase())) p.push("menciona el nombre de tu negocio");
  return p;
}
export const RASGOS = ["", "con jardín", "con terraza", "con patio", "con piscina", "con área verde"];
export const TIPOS = ["Casa de campo", "Casa", "Departamento"];
export const HORAS_REPORTE = ["12:00 pm", "2:00 pm", "4:00 pm", "5:00 pm", "6:00 pm", "6:30 pm", "7:00 pm", "7:30 pm", "8:00 pm", "9:00 pm"];
export const TAMANOS = ["pequeño", "mediano", "grande"];
export const MOTIVOS = ["Me piden pagar por fuera de Hospedoggy", "Comportamiento inadecuado", "Problema con la salud o el cuidado de la mascota", "Problema con el recojo o el regreso", "Otro"];
export const recortar = (t, n) => String(t ?? "").trim().slice(0, n);
