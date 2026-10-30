import type { ItemReparto, Revision } from '../../shared/tipos.ts';
import { ahora, type BaseDatos } from '../db.ts';

type FilaRevision = Omit<Revision, 'reparto'>;

function conReparto(db: BaseDatos, filas: FilaRevision[]): Revision[] {
  if (filas.length === 0) return [];
  const items = db
    .prepare(
      `SELECT revision_id, proyecto_id, porcentaje, propuesto, puntuacion
       FROM revision_atencion
       WHERE revision_id IN (${filas.map(() => '?').join(',')})
       ORDER BY porcentaje DESC`,
    )
    .all(...filas.map((f) => f.id)) as Array<ItemReparto & { revision_id: number }>;
  return filas.map((f) => ({
    ...f,
    reparto: items
      .filter((i) => i.revision_id === f.id)
      .map(({ proyecto_id, porcentaje, propuesto, puntuacion }) => ({ proyecto_id, porcentaje, propuesto, puntuacion })),
  }));
}

/** Revisiones de la más reciente a la más antigua. */
export function listarRevisiones(db: BaseDatos, limite = 520): Revision[] {
  const filas = db.prepare('SELECT * FROM revisiones ORDER BY semana DESC LIMIT ?').all(limite) as FilaRevision[];
  return conReparto(db, filas);
}

export function obtenerRevision(db: BaseDatos, semana: string): Revision | undefined {
  const fila = db.prepare('SELECT * FROM revisiones WHERE semana = ?').get(semana) as FilaRevision | undefined;
  return fila ? conReparto(db, [fila])[0] : undefined;
}

export function ultimaRevision(db: BaseDatos): Revision | undefined {
  return listarRevisiones(db, 1)[0];
}

export interface DatosRevision {
  semana: string;
  temperatura: number;
  notas: string;
  reparto: ItemReparto[];
}

/** Guarda la revisión de una semana. Si ya existía, la reemplaza. */
export function guardarRevision(db: BaseDatos, d: DatosRevision): Revision {
  return db.transaction(() => {
    db.prepare('DELETE FROM revisiones WHERE semana = ?').run(d.semana);
    const info = db
      .prepare('INSERT INTO revisiones (semana, temperatura, notas, creado_en) VALUES (?, ?, ?, ?)')
      .run(d.semana, d.temperatura, d.notas, ahora());
    const id = Number(info.lastInsertRowid);
    const insertar = db.prepare(
      `INSERT INTO revision_atencion (revision_id, proyecto_id, porcentaje, propuesto, puntuacion)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const r of d.reparto) insertar.run(id, r.proyecto_id, r.porcentaje, r.propuesto, r.puntuacion);
    return obtenerRevision(db, d.semana)!;
  })();
}
