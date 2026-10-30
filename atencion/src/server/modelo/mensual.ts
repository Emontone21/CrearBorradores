import { candidatosMensuales, type Candidato } from '../../shared/mensual.ts';
import { semanaISO } from '../../shared/semanas.ts';
import { esActivo, type DecisionMensual, type Proyecto } from '../../shared/tipos.ts';
import { ahora, type BaseDatos } from '../db.ts';
import {
  editarProyecto,
  listarProyectos,
  normalizarEtiquetas,
  obtenerProyecto,
  registrarEnHistorial,
} from './proyectos.ts';
import { listarRevisiones } from './revisiones.ts';

export interface CandidatoConProyecto extends Candidato {
  proyecto: Proyecto;
}

/** Última semana en la que decidiste «mantener» cada proyecto. */
function mantenidosDesde(db: BaseDatos): Map<number, string> {
  const filas = db
    .prepare(
      `SELECT proyecto_id, MAX(semana) AS semana FROM decisiones_mensuales
       WHERE decision = 'mantener' GROUP BY proyecto_id`,
    )
    .all() as Array<{ proyecto_id: number; semana: string }>;
  return new Map(filas.map((f) => [f.proyecto_id, f.semana]));
}

export function candidatos(db: BaseDatos): CandidatoConProyecto[] {
  const activos = listarProyectos(db).filter((p) => esActivo(p.etapa));
  const porId = new Map(activos.map((p) => [p.id, p]));
  return candidatosMensuales(
    activos.map((p) => p.id),
    listarRevisiones(db),
    mantenidosDesde(db),
  ).map((c) => ({ ...c, proyecto: porId.get(c.proyecto_id)! }));
}

function registrarDecision(db: BaseDatos, proyectoId: number, decision: DecisionMensual, destinoId: number | null) {
  db.prepare(
    'INSERT INTO decisiones_mensuales (fecha, semana, proyecto_id, decision, destino_id) VALUES (?, ?, ?, ?, ?)',
  ).run(ahora(), semanaISO(), proyectoId, decision, destinoId);
}

export class ErrorDecision extends Error {}

export function decidir(
  db: BaseDatos,
  d: { proyecto_id: number; decision: DecisionMensual; destino_id?: number },
): void {
  db.transaction(() => {
    const p = obtenerProyecto(db, d.proyecto_id);
    if (!p) throw new ErrorDecision('El proyecto no existe');
    if (d.decision === 'pausar') {
      editarProyecto(db, p.id, { etapa: 'pausado' });
      registrarDecision(db, p.id, 'pausar', null);
    } else if (d.decision === 'mantener') {
      registrarDecision(db, p.id, 'mantener', null);
    } else {
      if (!d.destino_id) throw new ErrorDecision('Elige con qué proyecto fusionarlo');
      fusionar(db, p.id, d.destino_id);
      registrarDecision(db, p.id, 'fusionar', d.destino_id);
    }
  })();
}

/**
 * Fusiona `origenId` dentro de `destinoId`:
 *  - el value, las keys y las etiquetas del absorbido se suman al destino como actualización incremental;
 *  - sus conexiones y notas pasan al destino;
 *  - el absorbido queda «terminado», con su «por qué» e historial intactos.
 */
export function fusionar(db: BaseDatos, origenId: number, destinoId: number): void {
  if (origenId === destinoId) throw new ErrorDecision('Un proyecto no se fusiona consigo mismo');
  db.transaction(() => {
    const origen = obtenerProyecto(db, origenId);
    const destino = obtenerProyecto(db, destinoId);
    if (!origen || !destino) throw new ErrorDecision('Alguno de los proyectos no existe');

    const anexar = (base: string, extra: string) =>
      extra.trim() ? `${base.trim() ? `${base.trim()}\n\n` : ''}De «${origen.nombre}»: ${extra.trim()}` : base;

    editarProyecto(db, destinoId, {
      value: anexar(destino.value, origen.value),
      keys_texto: anexar(destino.keys_texto, origen.keys_texto),
      etiquetas: normalizarEtiquetas([...destino.etiquetas, ...origen.etiquetas]),
    });

    // Conexiones: las que había entre ambos sobran (serían del proyecto consigo mismo); el resto se reapunta.
    db.prepare(
      'DELETE FROM conexiones WHERE (origen_id = ? AND destino_id = ?) OR (origen_id = ? AND destino_id = ?)',
    ).run(origenId, destinoId, destinoId, origenId);
    db.prepare('UPDATE conexiones SET origen_id = ? WHERE origen_id = ?').run(destinoId, origenId);
    db.prepare('UPDATE conexiones SET destino_id = ? WHERE destino_id = ?').run(destinoId, origenId);

    db.prepare('UPDATE capturas SET proyecto_id = ? WHERE proyecto_id = ?').run(destinoId, origenId);

    registrarEnHistorial(db, {
      proyecto_id: destinoId,
      tipo: 'fusion',
      descripcion: `Absorbió «${origen.nombre}» (por qué: ${origen.porque}). Se sumaron su value, keys, conexiones y notas.`,
      query_anterior: null,
      query_nuevo: null,
      porque_anterior: null,
      porque_nuevo: null,
    });
    registrarEnHistorial(db, {
      proyecto_id: origenId,
      tipo: 'fusion',
      descripcion: `Fusionado en «${destino.nombre}».`,
      query_anterior: null,
      query_nuevo: null,
      porque_anterior: null,
      porque_nuevo: null,
    });
    editarProyecto(db, origenId, { etapa: 'terminado' });
  })();
}
