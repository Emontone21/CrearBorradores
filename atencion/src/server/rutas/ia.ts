import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { EstadoIA } from '../../shared/tipos.ts';
import type { BaseDatos } from '../db.ts';
import { validar } from '../http.ts';
import { leerAjustes } from '../modelo/ajustes.ts';
import { ErrorIA, MODELO_POR_DEFECTO, type ConfigIA } from '../ia/cliente.ts';
import { sugerirCruces, sugerirFusiones, vistaPreviaCruces, vistaPreviaFusiones } from '../ia/servicio.ts';

const esquemaConfirmacion = z.object({ huella: z.string().min(1) });

export function estadoIA(db: BaseDatos, ia: ConfigIA | null): EstadoIA {
  return {
    disponible: ia !== null,
    activada: ia !== null && leerAjustes(db).ia_activada,
    modelo: ia?.modelo ?? MODELO_POR_DEFECTO,
  };
}

export function rutasIA(db: BaseDatos, ia: ConfigIA | null) {
  const r = new Hono();

  /** La IA solo se usa si hay clave en .env y la activaste en Ajustes. */
  const exigirIA = (): ConfigIA => {
    if (!ia) throw new HTTPException(400, { message: 'La IA no está disponible: falta ANTHROPIC_API_KEY en .env.' });
    if (!leerAjustes(db).ia_activada) throw new HTTPException(400, { message: 'La IA está desactivada en Ajustes.' });
    return ia;
  };

  const responderError = (c: Context, e: unknown) => {
    if (e instanceof ErrorIA) return c.json({ error: e.message }, e.estado);
    throw e;
  };

  r.get('/estado', (c) => c.json(estadoIA(db, ia)));

  // Vista previa: exactamente lo que se enviaría, para confirmarlo antes.
  r.get('/cruces/vista-previa', (c) => c.json(vistaPreviaCruces(db, exigirIA().modelo)));
  r.get('/fusiones/vista-previa', (c) => c.json(vistaPreviaFusiones(db, exigirIA().modelo)));

  r.post('/cruces', async (c) => {
    const config = exigirIA();
    const { huella } = validar(esquemaConfirmacion, await c.req.json());
    try {
      return c.json(await sugerirCruces(db, config, huella));
    } catch (e) {
      return responderError(c, e);
    }
  });

  r.post('/fusiones', async (c) => {
    const config = exigirIA();
    const { huella } = validar(esquemaConfirmacion, await c.req.json());
    try {
      return c.json(await sugerirFusiones(db, config, huella));
    } catch (e) {
      return responderError(c, e);
    }
  });

  return r;
}
