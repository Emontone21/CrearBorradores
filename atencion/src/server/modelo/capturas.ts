import type { Captura } from '../../shared/tipos.ts';
import { ahora, type BaseDatos } from '../db.ts';

interface FilaCaptura extends Omit<Captura, 'archivada'> {
  archivada: number;
}

const aCaptura = (f: FilaCaptura): Captura => ({ ...f, archivada: f.archivada === 1 });

/** Bandeja de entrada: capturas sin proyecto y sin archivar. */
export function bandeja(db: BaseDatos): Captura[] {
  return (
    db
      .prepare('SELECT * FROM capturas WHERE proyecto_id IS NULL AND archivada = 0 ORDER BY creado_en DESC, id DESC')
      .all() as FilaCaptura[]
  ).map(aCaptura);
}

/** Las capturas asignadas a un proyecto son sus notas. */
export function notasDeProyecto(db: BaseDatos, proyectoId: number): Captura[] {
  return (
    db
      .prepare('SELECT * FROM capturas WHERE proyecto_id = ? AND archivada = 0 ORDER BY creado_en DESC, id DESC')
      .all(proyectoId) as FilaCaptura[]
  ).map(aCaptura);
}

export function obtenerCaptura(db: BaseDatos, id: number): Captura | undefined {
  const f = db.prepare('SELECT * FROM capturas WHERE id = ?').get(id) as FilaCaptura | undefined;
  return f && aCaptura(f);
}

export function crearCaptura(db: BaseDatos, texto: string, proyectoId: number | null = null): Captura {
  const info = db
    .prepare('INSERT INTO capturas (texto, creado_en, proyecto_id) VALUES (?, ?, ?)')
    .run(texto, ahora(), proyectoId);
  return obtenerCaptura(db, Number(info.lastInsertRowid))!;
}

export function cambiarCaptura(
  db: BaseDatos,
  id: number,
  c: { texto?: string; proyecto_id?: number | null; archivada?: boolean },
): Captura | undefined {
  if (c.texto !== undefined) db.prepare('UPDATE capturas SET texto = ? WHERE id = ?').run(c.texto, id);
  if (c.proyecto_id !== undefined) db.prepare('UPDATE capturas SET proyecto_id = ? WHERE id = ?').run(c.proyecto_id, id);
  if (c.archivada !== undefined) db.prepare('UPDATE capturas SET archivada = ? WHERE id = ?').run(c.archivada ? 1 : 0, id);
  return obtenerCaptura(db, id);
}

export function borrarCaptura(db: BaseDatos, id: number): boolean {
  return db.prepare('DELETE FROM capturas WHERE id = ?').run(id).changes > 0;
}
