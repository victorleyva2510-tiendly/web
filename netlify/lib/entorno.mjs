export function env(nombre, porDefecto = "") {
  const v = (globalThis.Netlify && globalThis.Netlify.env && globalThis.Netlify.env.get(nombre)) || process.env[nombre];
  return v == null || v === "" ? porDefecto : v;
}
export function sitio() {
  return env("SITIO_URL", env("URL", "http://localhost:8888")).replace(/\/$/, "");
}
export function json(datos, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
export function hoyLima(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}
export function igualSeguro(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length || !a) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
