import crypto from "node:crypto";
import { env } from "./entorno.mjs";
const API = "https://api.mercadopago.com";

async function llamar(ruta, opciones = {}) {
  const token = env("MP_ACCESS_TOKEN");
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN");
  const res = await fetch(API + ruta, {
    ...opciones,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opciones.headers || {}) }
  });
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : {};
  if (!res.ok) { const e = new Error("Mercado Pago " + ruta + " " + res.status + ": " + texto.slice(0, 300)); e.estado = res.status; e.datos = datos; throw e; }
  return datos;
}

export function crearPreferencia(cuerpo, idempotencia) {
  return llamar("/checkout/preferences", { method: "POST", body: JSON.stringify(cuerpo), headers: { "X-Idempotency-Key": idempotencia } });
}
export function obtenerPago(id) {
  return llamar("/v1/payments/" + encodeURIComponent(id));
}
// Sin monto = devolución total. Con monto = devolución parcial.
export function reembolsar(pagoId, monto, idempotencia) {
  return llamar("/v1/payments/" + encodeURIComponent(pagoId) + "/refunds", {
    method: "POST", body: JSON.stringify(monto == null ? {} : { amount: monto }), headers: { "X-Idempotency-Key": idempotencia }
  });
}

// Firma de la notificación: HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
export function firmaValida(xSignature, xRequestId, dataId, secreto) {
  if (!secreto) return true; // sin secreto configurado: igual se confirma cada pago consultando a Mercado Pago
  if (!xSignature) return false;
  let ts = "", v1 = "";
  for (const parte of String(xSignature).split(",")) {
    const [k, v] = parte.split("=").map((s) => (s || "").trim());
    if (k === "ts") ts = v; if (k === "v1") v1 = v;
  }
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId || "") ? String(dataId).toLowerCase() : dataId;
  let manifiesto = "";
  if (id) manifiesto += "id:" + id + ";";
  if (xRequestId) manifiesto += "request-id:" + xRequestId + ";";
  manifiesto += "ts:" + ts + ";";
  const esperado = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  return esperado.length === v1.length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
}
