// Reglas de precio: las mismas del prototipo validado. Las tarifas del cuidador son privadas y solo se usan aquí.
const DIA = 86400000;
export const aFecha = (iso) => { const [a, m, d] = iso.split("-").map(Number); return Date.UTC(a, m - 1, d); };
export const aIso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const esIso = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && aIso(aFecha(v)) === v;
export const sumarDias = (iso, n) => aIso(aFecha(iso) + n * DIA);
export const difDias = (a, b) => Math.round((aFecha(b) - aFecha(a)) / DIA);

export function precioPublico(costo, margenPct, redondeo) {
  const r = Number(redondeo) || 1;
  return Math.ceil((Number(costo) * (1 + Number(margenPct) / 100)) / r - 1e-9) * r;
}
function tarifaNoche(c, iso) {
  if (c.temporada_activa) for (const t of c.temporadas || []) if (iso >= t.desde && iso <= t.hasta) return { costo: Number(t.tarifa), alta: true };
  return { costo: Number(c.tarifa), alta: false };
}
// Cotiza una estadía: precio al público, costo del cuidador y margen de Hospedoggy.
export function cotizar(c, cfg, ingreso, salida, primeraVez, perros = 1) {
  const noches = difDias(ingreso, salida);
  const extra = Math.max(0, perros - 1) * Number(c.perro_adicional || 0);
  const lineas = {};
  let publico = 0, costo = 0, altas = 0;
  for (let i = 0; i < noches; i++) {
    const n = tarifaNoche(c, sumarDias(ingreso, i));
    const costoNoche = n.costo + extra;
    const p = precioPublico(costoNoche, cfg.margen_noche, cfg.redondeo);
    publico += p; costo += costoNoche; if (n.alta) altas++;
    const k = p + "|" + n.alta; lineas[k] = (lineas[k] || 0) + 1;
  }
  let descuento = 0, descuentoCosto = 0;
  const larga = { noches: Number(c.descuento_noches || 0), pct: Number(c.descuento_pct || 0) };
  if (larga.pct > 0 && larga.noches > 0 && noches >= larga.noches) {
    descuento = Math.round(publico * larga.pct / 100);
    descuentoCosto = Math.round(costo * larga.pct / 100);
  }
  const regalo = Boolean(primeraVez && c.movilidad_gratis_primera);
  const movCosto = regalo ? 0 : Number(c.movilidad);
  const movPublico = regalo ? 0 : precioPublico(Number(c.movilidad), cfg.margen_movilidad, cfg.redondeo);
  const movLista = precioPublico(Number(c.movilidad), cfg.margen_movilidad, cfg.redondeo);
  const detalle = Object.entries(lineas).map(([k, v]) => { const [p, a] = k.split("|"); return { noches: v, precio: Number(p), alta: a === "true" }; });
  const total = publico - descuento + movPublico;
  const costoTotal = costo - descuentoCosto + movCosto;
  return { noches, altas, perros, detalle, descuento, larga, movPublico, movLista, regalo, total, costo: costoTotal, margen: total - costoTotal };
}
// Lo único de la cotización que puede ver el cliente
export const cotizacionPublica = (q) => ({ noches: q.noches, perros: q.perros, detalle: q.detalle, descuento: q.descuento, larga: q.larga,
  movPublico: q.movPublico, movLista: q.movLista, regalo: q.regalo, total: q.total });
