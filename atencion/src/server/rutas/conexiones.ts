import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { BaseDatos } from '../db.ts';
import { idDeRuta, noEncontrado, textoLargo, validar } from '../http.ts';
import { borrarConexion, cambiarConexion, crearConexion, listarConexiones } from '../modelo/conexiones.ts';
import { obtenerProyecto } from '../modelo/proyectos.ts';

const ESTADOS = ['pendiente', 'aceptada', 'descartada'] as const;

const esquemaNueva = z
  .object({
    origen_id: z.number().int().positive(),
    destino_id: z.number().int().positive(),
    descripcion: textoLargo.trim().default(''),
  })
  .refine((d) => d.origen_id !== d.destino_id, 'Un proyecto no se conecta consigo mismo');

const esquemaCambio = z
  .object({ estado: z.enum(ESTADOS), descripcion: textoLargo })
  .partial()
  .strict();

export function rutasConexiones(db: BaseDatos) {
  const r = new Hono();

  r.get('/', (c) => {
    const estado = c.req.query('estado');
    const filtro = estado ? { estado: validar(z.enum(ESTADOS), estado) } : {};
    return c.json(listarConexiones(db, filtro));
  });

  r.post('/', async (c) => {
    const d = validar(esquemaNueva, await c.req.json());
    if (!obtenerProyecto(db, d.origen_id) || !obtenerProyecto(db, d.destino_id)) {
      throw new HTTPException(400, { message: 'Alguno de los proyectos no existe' });
    }
    return c.json(crearConexion(db, { ...d, fuente: 'manual' }), 201);
  });

  r.patch('/:id', async (c) => {
    const cambios = validar(esquemaCambio, await c.req.json());
    const con = cambiarConexion(db, idDeRuta(c.req.param('id')), cambios);
    return con ? c.json(con) : noEncontrado('Conexión');
  });

  r.delete('/:id', (c) =>
    borrarConexion(db, idDeRuta(c.req.param('id'))) ? c.json({ ok: true }) : noEncontrado('Conexión'),
  );

  return r;
}
