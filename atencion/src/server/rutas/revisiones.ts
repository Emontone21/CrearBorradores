import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { suma } from '../../shared/atencion.ts';
import { semanaISO } from '../../shared/semanas.ts';
import type { BaseDatos } from '../db.ts';
import { noEncontrado, textoLargo, validar } from '../http.ts';
import { obtenerProyecto } from '../modelo/proyectos.ts';
import { guardarRevision, listarRevisiones, obtenerRevision, ultimaRevision } from '../modelo/revisiones.ts';

const semana = z.string().regex(/^\d{4}-W\d{2}$/, 'Formato de semana: 2026-W44');
const porcentaje = z.number().int().min(0).max(100);

const esquemaRevision = z.object({
  temperatura: z.number().positive().max(100),
  notas: textoLargo.default(''),
  reparto: z
    .array(
      z.object({
        proyecto_id: z.number().int().positive(),
        porcentaje,
        propuesto: porcentaje,
        puntuacion: z.number().min(0).max(5),
      }),
    )
    .refine((r) => r.length === 0 || suma(r.map((i) => i.porcentaje)) === 100, 'El reparto debe sumar 100 %')
    .refine((r) => new Set(r.map((i) => i.proyecto_id)).size === r.length, 'Hay proyectos repetidos'),
});

export function rutasRevisiones(db: BaseDatos) {
  const r = new Hono();

  r.get('/', (c) => c.json(listarRevisiones(db)));

  /** Semana en curso según el reloj del equipo, y la revisión más reciente (sea de esta semana o no). */
  r.get('/actual', (c) =>
    c.json({ semana: semanaISO(), ultima: ultimaRevision(db) ?? null }),
  );

  r.get('/:semana', (c) => {
    const rev = obtenerRevision(db, validar(semana, c.req.param('semana')));
    return rev ? c.json(rev) : noEncontrado('Revisión');
  });

  r.put('/:semana', async (c) => {
    const s = validar(semana, c.req.param('semana'));
    const d = validar(esquemaRevision, await c.req.json());
    for (const item of d.reparto) {
      if (!obtenerProyecto(db, item.proyecto_id)) {
        throw new HTTPException(400, { message: `El proyecto ${item.proyecto_id} no existe` });
      }
    }
    return c.json(guardarRevision(db, { semana: s, ...d }));
  });

  return r;
}
