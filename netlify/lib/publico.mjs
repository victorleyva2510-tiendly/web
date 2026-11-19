import { cotizar, cotizacionPublica } from "./precios.mjs";
import { urlFoto } from "./panel-datos.mjs";
// Lo que el navegador puede ver de un cuidador: nunca tarifas, nombre real, correo, teléfono ni dirección.
export function cuidadorPublico(c, cfg, b) {
  const st = c.stats || {};
  const estrella = st.unicos6 >= 5 && st.repiten6 >= 2 && st.resenas >= 5 && Number(st.nota) >= 4.8 && st.respuesta != null && Number(st.respuesta) <= 60;
  const out = {
    id: c.id, nombrePublico: c.nombre_publico, distrito: c.distrito, descripcion: c.descripcion, servicios: c.servicios,
    casa: { tipo: c.tipo_vivienda, jardin: c.jardin, perrosResidentes: c.perros_residentes, ninos: c.ninos, fumadores: c.fumadores, todoElDia: c.todo_el_dia },
    tamanos: c.tamanos, plazas: c.plazas, horaReporte: c.hora_reporte, fotos: (c.fotos || []).map((f) => ({ src: urlFoto(f.url), leyenda: f.leyenda || "" })),
    movilidadGratisPrimera: c.movilidad_gratis_primera,
    stats: { resenas: Number(st.resenas || 0), nota: Number(st.nota || 0), repiten: Number(st.repiten || 0), respuesta: st.respuesta == null ? null : Number(st.respuesta), estrella, ultimas: st.ultimas || [] }
  };
  if (b) {
    out.libres = c.libres;
    out.q = cotizacionPublica(cotizar(c, cfg, b.ingreso, b.salida, b.primera, b.perros));
  }
  return out;
}
// Reglas que el navegador necesita para mostrar textos (no incluye márgenes)
export const reglas = (cfg) => ({ cancelacion: cfg.cancelacion, reembolsoPct: cfg.reembolso_pct, maxPerros: cfg.max_perros, minutosParaPagar: cfg.minutos_para_pagar });
