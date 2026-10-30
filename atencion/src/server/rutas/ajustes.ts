import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
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

export function rutasAjustes(db: BaseDatos, iaDisponible: boolean) {
  const r = new Hono();
  r.get('/', (c) => c.json(leerAjustes(db)));
  r.put('/', async (c) => {
    const cambios = validar(esquemaAjustes, await c.req.json());
    if (cambios.ia_activada && !iaDisponible) {
      throw new HTTPException(400, {
        message: 'No se puede activar la IA: falta ANTHROPIC_API_KEY en el archivo .env (y reiniciar el servidor).',
      });
    }
    return c.json(guardarAjustes(db, cambios));
  });
  return r;
}
