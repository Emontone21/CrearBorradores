import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { BaseDatos } from '../db.ts';
import { idDeRuta, noEncontrado, textoLargo, validar } from '../http.ts';
import { bandeja, borrarCaptura, cambiarCaptura, crearCaptura } from '../modelo/capturas.ts';
import { obtenerProyecto } from '../modelo/proyectos.ts';

const proyectoId = z.number().int().positive().nullable();

const esquemaNueva = z.object({
  texto: textoLargo.trim().min(1, 'La captura está vacía'),
  proyecto_id: proyectoId.optional(),
});

const esquemaCambio = z
  .object({ texto: textoLargo.trim().min(1), proyecto_id: proyectoId, archivada: z.boolean() })
  .partial()
  .strict();

function comprobarProyecto(db: BaseDatos, id: number | null | undefined) {
  if (id && !obtenerProyecto(db, id)) throw new HTTPException(400, { message: 'El proyecto no existe' });
}

export function rutasCapturas(db: BaseDatos) {
  const r = new Hono();

  r.get('/bandeja', (c) => c.json(bandeja(db)));

  r.post('/', async (c) => {
    const d = validar(esquemaNueva, await c.req.json());
    comprobarProyecto(db, d.proyecto_id);
    return c.json(crearCaptura(db, d.texto, d.proyecto_id ?? null), 201);
  });

  r.patch('/:id', async (c) => {
    const d = validar(esquemaCambio, await c.req.json());
    comprobarProyecto(db, d.proyecto_id);
    const captura = cambiarCaptura(db, idDeRuta(c.req.param('id')), d);
    return captura ? c.json(captura) : noEncontrado('Captura');
  });

  r.delete('/:id', (c) =>
    borrarCaptura(db, idDeRuta(c.req.param('id'))) ? c.json({ ok: true }) : noEncontrado('Captura'),
  );

  return r;
}
