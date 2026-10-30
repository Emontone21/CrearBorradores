import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { SEMANAS_SEGUIDAS, UMBRAL_ATENCION } from '../../shared/mensual.ts';
import type { BaseDatos } from '../db.ts';
import { validar } from '../http.ts';
import { candidatos, decidir, ErrorDecision } from '../modelo/mensual.ts';

const esquemaDecision = z.object({
  proyecto_id: z.number().int().positive(),
  decision: z.enum(['pausar', 'fusionar', 'mantener']),
  destino_id: z.number().int().positive().optional(),
});

export function rutasMensual(db: BaseDatos) {
  const r = new Hono();

  r.get('/', (c) =>
    c.json({ umbral: UMBRAL_ATENCION, semanas: SEMANAS_SEGUIDAS, candidatos: candidatos(db) }),
  );

  r.post('/decisiones', async (c) => {
    const d = validar(esquemaDecision, await c.req.json());
    try {
      decidir(db, d);
    } catch (e) {
      if (e instanceof ErrorDecision) throw new HTTPException(400, { message: e.message });
      throw e;
    }
    return c.json({ ok: true });
  });

  return r;
}
