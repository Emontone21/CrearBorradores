import type { Actualizacion, Etapa, FichaProyecto, Proyecto } from '../../shared/tipos.ts';
import { NOMBRE_ETAPA } from '../../shared/tipos.ts';
import { ahora, type BaseDatos } from '../db.ts';
import { listarConexiones } from './conexiones.ts';
import { notasDeProyecto } from './capturas.ts';

interface FilaProyecto extends Omit<Proyecto, 'etiquetas' | 'ejemplo'> {
  ejemplo: number;
}

export interface DatosProyecto {
  nombre: string;
  porque: string;
  etapa?: Etapa;
  query?: string;
  keys_texto?: string;
  etiquetas?: string[];
  value?: string;
  impacto?: number;
  energia?: number;
  urgencia?: number;
  ejemplo?: boolean;
}

/** Campos que se editan directamente. `porque` y `query` tienen su propio camino con historial. */
export interface CambiosProyecto {
  nombre?: string;
  etapa?: Etapa;
  keys_texto?: string;
  etiquetas?: string[];
  value?: string;
  impacto?: number;
  energia?: number;
  urgencia?: number;
}

function etiquetasPorProyecto(db: BaseDatos): Map<number, string[]> {
  const filas = db
    .prepare('SELECT proyecto_id, etiqueta FROM proyecto_etiquetas ORDER BY etiqueta COLLATE NOCASE')
    .all() as Array<{ proyecto_id: number; etiqueta: string }>;
  const mapa = new Map<number, string[]>();
  for (const f of filas) {
    const lista = mapa.get(f.proyecto_id) ?? [];
    lista.push(f.etiqueta);
    mapa.set(f.proyecto_id, lista);
  }
  return mapa;
}

function aProyecto(f: FilaProyecto, etiquetas: string[]): Proyecto {
  return { ...f, ejemplo: f.ejemplo === 1, etiquetas };
}

export function listarProyectos(db: BaseDatos): Proyecto[] {
  const filas = db.prepare('SELECT * FROM proyectos ORDER BY nombre COLLATE NOCASE').all() as FilaProyecto[];
  const etiquetas = etiquetasPorProyecto(db);
  return filas.map((f) => aProyecto(f, etiquetas.get(f.id) ?? []));
}

export function obtenerProyecto(db: BaseDatos, id: number): Proyecto | undefined {
  const fila = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(id) as FilaProyecto | undefined;
  if (!fila) return undefined;
  const etiquetas = (
    db
      .prepare('SELECT etiqueta FROM proyecto_etiquetas WHERE proyecto_id = ? ORDER BY etiqueta COLLATE NOCASE')
      .all(id) as Array<{ etiqueta: string }>
  ).map((e) => e.etiqueta);
  return aProyecto(fila, etiquetas);
}

export function actualizacionesDe(db: BaseDatos, proyectoId: number): Actualizacion[] {
  return db
    .prepare('SELECT * FROM actualizaciones WHERE proyecto_id = ? ORDER BY fecha DESC, id DESC')
    .all(proyectoId) as Actualizacion[];
}

export function fichaProyecto(db: BaseDatos, id: number): FichaProyecto | undefined {
  const p = obtenerProyecto(db, id);
  if (!p) return undefined;
  return {
    ...p,
    actualizaciones: actualizacionesDe(db, id),
    conexiones: listarConexiones(db, { proyectoId: id }),
    notas: notasDeProyecto(db, id),
  };
}

export function normalizarEtiquetas(etiquetas: string[]): string[] {
  const vistas = new Map<string, string>();
  for (const e of etiquetas) {
    const limpia = e.trim().replace(/\s+/g, ' ');
    if (limpia && !vistas.has(limpia.toLowerCase())) vistas.set(limpia.toLowerCase(), limpia);
  }
  return [...vistas.values()];
}

function guardarEtiquetas(db: BaseDatos, id: number, etiquetas: string[]) {
  db.prepare('DELETE FROM proyecto_etiquetas WHERE proyecto_id = ?').run(id);
  const insertar = db.prepare('INSERT INTO proyecto_etiquetas (proyecto_id, etiqueta) VALUES (?, ?)');
  for (const e of normalizarEtiquetas(etiquetas)) insertar.run(id, e);
}

export function registrarEnHistorial(
  db: BaseDatos,
  a: Omit<Actualizacion, 'id' | 'fecha'> & { fecha?: string },
): void {
  db.prepare(
    `INSERT INTO actualizaciones
       (proyecto_id, fecha, tipo, descripcion, query_anterior, query_nuevo, porque_anterior, porque_nuevo)
     VALUES (@proyecto_id, @fecha, @tipo, @descripcion, @query_anterior, @query_nuevo, @porque_anterior, @porque_nuevo)`,
  ).run({ ...a, fecha: a.fecha ?? ahora() });
}

export function crearProyecto(db: BaseDatos, d: DatosProyecto): Proyecto {
  return db.transaction(() => {
    const t = ahora();
    const info = db
      .prepare(
        `INSERT INTO proyectos
           (nombre, porque, etapa, query, keys_texto, value, impacto, energia, urgencia, ejemplo, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.nombre,
        d.porque,
        d.etapa ?? 'idea',
        d.query ?? '',
        d.keys_texto ?? '',
        d.value ?? '',
        d.impacto ?? 3,
        d.energia ?? 3,
        d.urgencia ?? 3,
        d.ejemplo ? 1 : 0,
        t,
        t,
      );
    const id = Number(info.lastInsertRowid);
    guardarEtiquetas(db, id, d.etiquetas ?? []);
    // La intención original queda anclada en el historial desde el primer momento.
    registrarEnHistorial(db, {
      proyecto_id: id,
      fecha: t,
      tipo: 'creacion',
      descripcion: 'Proyecto creado',
      query_anterior: null,
      query_nuevo: d.query ?? '',
      porque_anterior: null,
      porque_nuevo: d.porque,
    });
    return obtenerProyecto(db, id)!;
  })();
}

export function editarProyecto(db: BaseDatos, id: number, c: CambiosProyecto): Proyecto | undefined {
  return db.transaction(() => {
    const actual = obtenerProyecto(db, id);
    if (!actual) return undefined;
    const campos: Array<keyof CambiosProyecto> = [
      'nombre',
      'etapa',
      'keys_texto',
      'value',
      'impacto',
      'energia',
      'urgencia',
    ];
    const sets: string[] = [];
    const valores: Record<string, unknown> = { id };
    for (const campo of campos) {
      if (c[campo] !== undefined) {
        sets.push(`${campo} = @${campo}`);
        valores[campo] = c[campo];
      }
    }
    if (c.etiquetas) guardarEtiquetas(db, id, c.etiquetas);
    if (sets.length || c.etiquetas) {
      sets.push('actualizado_en = @actualizado_en');
      valores.actualizado_en = ahora();
      db.prepare(`UPDATE proyectos SET ${sets.join(', ')} WHERE id = @id`).run(valores);
    }
    if (c.etapa && c.etapa !== actual.etapa) {
      registrarEnHistorial(db, {
        proyecto_id: id,
        tipo: 'etapa',
        descripcion: `Etapa: ${NOMBRE_ETAPA[actual.etapa]} → ${NOMBRE_ETAPA[c.etapa]}`,
        query_anterior: null,
        query_nuevo: null,
        porque_anterior: null,
        porque_nuevo: null,
      });
    }
    return obtenerProyecto(db, id);
  })();
}

/** Conexión residual: se registra el cambio y el query anterior; nada se sobrescribe sin rastro. */
export function registrarActualizacion(
  db: BaseDatos,
  id: number,
  datos: { descripcion: string; query_nuevo?: string },
): Proyecto | undefined {
  return db.transaction(() => {
    const actual = obtenerProyecto(db, id);
    if (!actual) return undefined;
    const queryNuevo = datos.query_nuevo ?? actual.query;
    registrarEnHistorial(db, {
      proyecto_id: id,
      tipo: 'avance',
      descripcion: datos.descripcion,
      query_anterior: actual.query,
      query_nuevo: queryNuevo,
      porque_anterior: null,
      porque_nuevo: null,
    });
    db.prepare('UPDATE proyectos SET query = ?, actualizado_en = ? WHERE id = ?').run(queryNuevo, ahora(), id);
    return obtenerProyecto(db, id);
  })();
}

export function cambiarPorque(
  db: BaseDatos,
  id: number,
  datos: { porque: string; motivo: string },
): Proyecto | undefined {
  return db.transaction(() => {
    const actual = obtenerProyecto(db, id);
    if (!actual) return undefined;
    registrarEnHistorial(db, {
      proyecto_id: id,
      tipo: 'porque',
      descripcion: datos.motivo,
      query_anterior: null,
      query_nuevo: null,
      porque_anterior: actual.porque,
      porque_nuevo: datos.porque,
    });
    db.prepare('UPDATE proyectos SET porque = ?, actualizado_en = ? WHERE id = ?').run(datos.porque, ahora(), id);
    return obtenerProyecto(db, id);
  })();
}

export function borrarProyecto(db: BaseDatos, id: number): boolean {
  return db.prepare('DELETE FROM proyectos WHERE id = ?').run(id).changes > 0;
}

export function etiquetasEnUso(db: BaseDatos): string[] {
  return (
    db
      .prepare('SELECT DISTINCT etiqueta FROM proyecto_etiquetas ORDER BY etiqueta COLLATE NOCASE')
      .all() as Array<{ etiqueta: string }>
  ).map((f) => f.etiqueta);
}
