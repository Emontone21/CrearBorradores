// Revisión mensual: detectar proyectos que llevan varias semanas casi sin atención.
// Módulo puro (sin E/S), con tests.

export const UMBRAL_ATENCION = 10; // %
export const SEMANAS_SEGUIDAS = 3;

export interface RevisionMinima {
  semana: string;
  reparto: Array<{ proyecto_id: number; porcentaje: number }>;
}

export interface Candidato {
  proyecto_id: number;
  racha: number;
  /** Las semanas de la racha, de la más reciente a la más antigua. */
  historial: Array<{ semana: string; porcentaje: number }>;
}

/**
 * Cuántas revisiones seguidas (desde la más reciente) tiene el proyecto por debajo del umbral.
 * - Las semanas sin revisión guardada no cuentan ni cortan: se miran las revisiones que existen.
 * - Si el proyecto no aparece en una revisión (no existía o estaba pausado), la racha se corta.
 * - `despuesDe`: solo cuentan revisiones posteriores a esa semana (tras decidir «mantener»).
 */
export function rachaBaja(
  proyectoId: number,
  revisiones: RevisionMinima[],
  opciones: { umbral?: number; despuesDe?: string } = {},
): Candidato {
  const umbral = opciones.umbral ?? UMBRAL_ATENCION;
  const ordenadas = [...revisiones].sort((a, b) => b.semana.localeCompare(a.semana));
  const historial: Candidato['historial'] = [];
  for (const r of ordenadas) {
    if (opciones.despuesDe && r.semana <= opciones.despuesDe) break;
    const item = r.reparto.find((i) => i.proyecto_id === proyectoId);
    if (!item || item.porcentaje >= umbral) break;
    historial.push({ semana: r.semana, porcentaje: item.porcentaje });
  }
  return { proyecto_id: proyectoId, racha: historial.length, historial };
}

export function candidatosMensuales(
  proyectoIds: number[],
  revisiones: RevisionMinima[],
  mantenidosDesde: Map<number, string> = new Map(),
  opciones: { umbral?: number; minimo?: number } = {},
): Candidato[] {
  const minimo = opciones.minimo ?? SEMANAS_SEGUIDAS;
  return proyectoIds
    .map((id) => rachaBaja(id, revisiones, { umbral: opciones.umbral, despuesDe: mantenidosDesde.get(id) }))
    .filter((c) => c.racha >= minimo)
    .sort((a, b) => b.racha - a.racha);
}
