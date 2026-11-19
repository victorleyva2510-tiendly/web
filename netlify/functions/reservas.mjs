import { rpc } from "../lib/db.mjs";
import { json, sitio } from "../lib/entorno.mjs";
import { cotizar, cotizacionPublica } from "../lib/precios.mjs";
import { validarReserva } from "../lib/validar.mjs";
import { crearPreferencia } from "../lib/mercadopago.mjs";

// POST /api/reservas: valida la ficha, calcula el precio en el servidor, separa el cupo y crea el pago en Mercado Pago
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const b = await req.json().catch(() => null);
  if (!b) return json({ error: "Datos inválidos." }, 400);
  try {
    const cfg = await rpc("api_config");
    const [c] = await rpc("api_cuidadores", { p_ingreso: null, p_salida: null, p_id: String(b.cuidador || "") });
    if (!c) return json({ error: "Esta casa ya no está disponible." }, 404);
    const v = validarReserva(b, c, cfg);
    if (v.error) return json({ error: v.error }, 422);
    const primera = (await rpc("api_es_primera", { p_telefono: v.cliente.telefono })) === true;
    const q = cotizar(c, cfg, b.ingreso, b.salida, primera, v.perros);
    const creada = await rpc("api_crear_reserva", { p: {
      cuidador_id: c.id, ingreso: b.ingreso, salida: b.salida, noches: q.noches, perros: v.perros, cliente: v.cliente, huespedes: v.huespedes,
      telefono: v.cliente.telefono, email: v.cliente.email, primera_vez: primera, total: q.total, costo: q.costo, detalle: cotizacionPublica(q),
      canal: String(b.canal || "Directo").replace(/[^\p{L}\p{N} .-]/gu, "").slice(0, 40) } });
    if (!creada.ok) {
      if (creada.error === "sin_cupo") return json({ error: "Otra persona acaba de tomar la última plaza en esas fechas. Prueba otras fechas u otra casa." }, 409);
      return json({ error: "Esta casa ya no está disponible." }, 409);
    }
    const base = sitio();
    const vuelta = `${base}/?reserva=${creada.id}&t=${creada.token}`;
    const [nombre, ...apellidos] = v.cliente.nombre.split(" ");
    const pref = await crearPreferencia({
      items: [{ id: creada.codigo, title: `Hospedaje ${q.noches} noche${q.noches > 1 ? "s" : ""}: ${c.nombre_publico}`, description: `Hospedaje para ${v.perros} perro${v.perros > 1 ? "s" : ""} del ${b.ingreso} al ${b.salida} en ${c.distrito}`, category_id: "services", quantity: 1, currency_id: "PEN", unit_price: q.total }],
      payer: { name: nombre, surname: apellidos.join(" "), email: v.cliente.email, phone: { area_code: "51", number: v.cliente.telefono } },
      external_reference: creada.id,
      back_urls: { success: vuelta, failure: vuelta, pending: vuelta },
      auto_return: "approved",
      notification_url: `${base}/api/webhook-mp`,
      statement_descriptor: "HOSPEDOGGY",
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(creada.expira_en).toISOString(),
      payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }], installments: 1 }
    }, "pref-" + creada.id, /^[\w:.-]{8,200}$/.test(String(b.dispositivo || "")) ? String(b.dispositivo) : "");
    await rpc("api_guardar_preferencia", { p_id: creada.id, p_preferencia: pref.id });
    return json({ ok: true, id: creada.id, token: creada.token, codigo: creada.codigo, total: q.total, primera, pagarEn: pref.init_point });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos crear tu reserva. Intenta de nuevo en un momento." }, 500);
  }
};
export const config = { path: "/api/reservas" };
