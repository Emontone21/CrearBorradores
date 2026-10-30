import { Hono } from 'hono';
import { z } from 'zod';
import type { BaseDatos } from '../db.ts';
import { validar } from '../http.ts';
import { guardarAjustes, leerAjustes } from '../modelo/ajustes.ts';

const peso = z.number().min(0).max(10);

const esquemaAjustes = z
  .object({
    ia_activada: z.boolean(),
    pesos: z.object({ impacto: peso, energia: peso, urgencia: peso }),
  })
  .partial()
  .strict();

export function rutasAjustes(db: BaseDatos) {
  const r = new Hono();
  r.get('/', (c) => c.json(leerAjustes(db)));
  r.put('/', async (c) => c.json(guardarAjustes(db, validar(esquemaAjustes, await c.req.json()))));
  return r;
}
