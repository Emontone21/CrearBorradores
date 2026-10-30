import type { Conexion, EstadoConexion, FuenteConexion } from '../../shared/tipos.ts';
import { ahora, type BaseDatos } from '../db.ts';

const SELECT_CONEXION = `
  SELECT c.*, o.nombre AS origen_nombre, d.nombre AS destino_nombre
  FROM conexiones c
  JOIN proyectos o ON o.id = c.origen_id
  JOIN proyectos d ON d.id = c.destino_id`;

export function listarConexiones(
  db: BaseDatos,
  filtro: { proyectoId?: number; estado?: EstadoConexion } = {},
): Conexion[] {
  const condiciones: string[] = [];
  const params: Record<string, unknown> = {};
  if (filtro.proyectoId !== undefined) {
    condiciones.push('(c.origen_id = @pid OR c.destino_id = @pid)');
    params.pid = filtro.proyectoId;
  }
  if (filtro.estado) {
    condiciones.push('c.estado = @estado');
    params.estado = filtro.estado;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db.prepare(`${SELECT_CONEXION} ${where} ORDER BY c.creado_en DESC, c.id DESC`).all(params) as Conexion[];
}

export function obtenerConexion(db: BaseDatos, id: number): Conexion | undefined {
  return db.prepare(`${SELECT_CONEXION} WHERE c.id = ?`).get(id) as Conexion | undefined;
}

export function crearConexion(
  db: BaseDatos,
  d: { origen_id: number; destino_id: number; descripcion: string; fuente: FuenteConexion; estado?: EstadoConexion },
): Conexion {
  // Las conexiones manuales las decides tú: entran aceptadas. Las de la IA esperan tu revisión.
  const estado = d.estado ?? (d.fuente === 'manual' ? 'aceptada' : 'pendiente');
  const info = db
    .prepare(
      `INSERT INTO conexiones (origen_id, destino_id, descripcion, fuente, estado, creado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(d.origen_id, d.destino_id, d.descripcion, d.fuente, estado, ahora());
  return obtenerConexion(db, Number(info.lastInsertRowid))!;
}

export function cambiarConexion(
  db: BaseDatos,
  id: number,
  c: { estado?: EstadoConexion; descripcion?: string },
): Conexion | undefined {
  if (c.estado !== undefined) db.prepare('UPDATE conexiones SET estado = ? WHERE id = ?').run(c.estado, id);
  if (c.descripcion !== undefined) db.prepare('UPDATE conexiones SET descripcion = ? WHERE id = ?').run(c.descripcion, id);
  return obtenerConexion(db, id);
}

export function borrarConexion(db: BaseDatos, id: number): boolean {
  return db.prepare('DELETE FROM conexiones WHERE id = ?').run(id).changes > 0;
}
