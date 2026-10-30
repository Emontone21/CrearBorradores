// Exportar e importar todo en un JSON. El formato es un volcado de cada tabla, con los ids,
// para que las referencias (conexiones, historial, revisiones) sigan valiendo al importar.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { ETAPAS } from '../../shared/tipos.ts';
import type { BaseDatos } from '../db.ts';

export const FORMATO = 'atencion';
export const VERSION_FORMATO = 1;

// Orden de inserción: primero lo que otros referencian.
const TABLAS = [
  'proyectos',
  'proyecto_etiquetas',
  'actualizaciones',
  'conexiones',
  'revisiones',
  'revision_atencion',
  'capturas',
  'decisiones_mensuales',
  'ajustes',
] as const;

const id = z.number().int().positive();
const texto = z.string();
const nulo = <T extends z.ZodType>(t: T) => t.nullable();
const nota = z.number().int().min(1).max(5);

const esquemaExportacion = z.object({
  formato: z.literal(FORMATO, { message: 'No es una exportación de esta app' }),
  version: z.number().int().max(VERSION_FORMATO, { message: 'La exportación es de una versión más nueva de la app' }),
  exportado_en: texto,
  datos: z.object({
    proyectos: z.array(
      z.object({
        id,
        nombre: texto,
        porque: texto,
        etapa: z.enum(ETAPAS),
        query: texto,
        keys_texto: texto,
        value: texto,
        impacto: nota,
        energia: nota,
        urgencia: nota,
        ejemplo: z.number().int(),
        creado_en: texto,
        actualizado_en: texto,
      }),
    ),
    proyecto_etiquetas: z.array(z.object({ proyecto_id: id, etiqueta: texto })),
    actualizaciones: z.array(
      z.object({
        id,
        proyecto_id: id,
        fecha: texto,
        tipo: z.enum(['creacion', 'avance', 'porque', 'etapa', 'fusion']),
        descripcion: texto,
        query_anterior: nulo(texto),
        query_nuevo: nulo(texto),
        porque_anterior: nulo(texto),
        porque_nuevo: nulo(texto),
      }),
    ),
    conexiones: z.array(
      z.object({
        id,
        origen_id: id,
        destino_id: id,
        descripcion: texto,
        fuente: z.enum(['manual', 'ia']),
        estado: z.enum(['pendiente', 'aceptada', 'descartada']),
        creado_en: texto,
      }),
    ),
    revisiones: z.array(z.object({ id, semana: texto, temperatura: z.number(), notas: texto, creado_en: texto })),
    revision_atencion: z.array(
      z.object({
        revision_id: id,
        proyecto_id: id,
        porcentaje: z.number().int(),
        propuesto: z.number().int(),
        puntuacion: z.number(),
      }),
    ),
    capturas: z.array(
      z.object({ id, texto, creado_en: texto, proyecto_id: nulo(id), archivada: z.number().int() }),
    ),
    decisiones_mensuales: z.array(
      z.object({
        id,
        fecha: texto,
        semana: texto,
        proyecto_id: id,
        decision: z.enum(['pausar', 'fusionar', 'mantener']),
        destino_id: nulo(id),
      }),
    ),
    ajustes: z.array(z.object({ clave: texto, valor: texto })),
  }),
});

export type Exportacion = z.infer<typeof esquemaExportacion>;

export function exportar(db: BaseDatos): Exportacion {
  const datos = Object.fromEntries(
    TABLAS.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()]),
  ) as Exportacion['datos'];
  return { formato: FORMATO, version: VERSION_FORMATO, exportado_en: new Date().toISOString(), datos };
}

export class ErrorImportacion extends Error {}

export function validarExportacion(contenido: unknown): Exportacion {
  const r = esquemaExportacion.safeParse(contenido);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ErrorImportacion(
      `El archivo no tiene el formato esperado${i.path.length ? ` (${i.path.join('.')})` : ''}: ${i.message}`,
    );
  }
  return r.data;
}

/** Copia de seguridad de la base actual en data/backups/. Devuelve la ruta, o null si la base está en memoria. */
export function copiaDeSeguridad(db: BaseDatos): string | null {
  if (db.memory) return null;
  const carpeta = join(dirname(db.name), 'backups');
  mkdirSync(carpeta, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ruta = join(carpeta, `app-${sello}.db`);
  db.prepare('VACUUM INTO ?').run(ruta);
  return ruta;
}

/** Reemplaza todos los datos por los del archivo. Si algo falla, no cambia nada. */
export function importar(db: BaseDatos, contenido: unknown): { copia: string | null; proyectos: number } {
  const e = validarExportacion(contenido);
  const copia = copiaDeSeguridad(db);
  try {
    db.transaction(() => {
      for (const t of [...TABLAS].reverse()) db.prepare(`DELETE FROM ${t}`).run();
      for (const t of TABLAS) {
        const filas = e.datos[t] as Array<Record<string, unknown>>;
        if (filas.length === 0) continue;
        const columnas = Object.keys(filas[0]);
        const insertar = db.prepare(
          `INSERT INTO ${t} (${columnas.join(', ')}) VALUES (${columnas.map((c) => `@${c}`).join(', ')})`,
        );
        for (const f of filas) insertar.run(f);
      }
    })();
  } catch (err) {
    throw new ErrorImportacion(
      `Los datos del archivo no son coherentes (${(err as Error).message}). No se cambió nada.`,
    );
  }
  return { copia, proyectos: e.datos.proyectos.length };
}
