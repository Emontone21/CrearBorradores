import { Hono } from 'hono';
import { z } from 'zod';
import { ETAPAS } from '../../shared/tipos.ts';
import type { BaseDatos } from '../db.ts';
import { idDeRuta, noEncontrado, nota1a5, textoCorto, textoLargo, validar } from '../http.ts';
import {
  avancesDesde,
  borrarProyecto,
  cambiarPorque,
  crearProyecto,
  editarProyecto,
  etiquetasEnUso,
  fichaProyecto,
  listarProyectos,
  registrarActualizacion,
} from '../modelo/proyectos.ts';

const etiquetas = z.array(z.string().trim().max(60)).max(50);

const esquemaNuevo = z.object({
  nombre: textoCorto.min(1, 'El nombre es obligatorio'),
  porque: textoCorto.min(1, 'El «por qué» es obligatorio'),
  etapa: z.enum(ETAPAS).optional(),
  query: textoLargo.optional(),
  keys_texto: textoLargo.optional(),
  etiquetas: etiquetas.optional(),
  value: textoLargo.optional(),
  impacto: nota1a5.optional(),
  energia: nota1a5.optional(),
  urgencia: nota1a5.optional(),
});

// `porque` y `query` no se aceptan aquí: tienen su propio endpoint que deja rastro en el historial.
const esquemaCambios = z
  .object({
    nombre: textoCorto.min(1),
    etapa: z.enum(ETAPAS),
    keys_texto: textoLargo,
    etiquetas,
    value: textoLargo,
    impacto: nota1a5,
    energia: nota1a5,
    urgencia: nota1a5,
  })
  .partial()
  .strict();

const esquemaActualizacion = z.object({
  descripcion: textoLargo.trim().min(1, 'Describe qué cambió'),
  query_nuevo: textoLargo.optional(),
});

const esquemaPorque = z.object({
  porque: textoCorto.min(1, 'El «por qué» no puede quedar vacío'),
  motivo: textoLargo.trim().min(1, 'Explica por qué cambia la intención'),
});

export function rutasProyectos(db: BaseDatos) {
  const r = new Hono();

  r.get('/', (c) => c.json(listarProyectos(db)));

  r.get('/etiquetas', (c) => c.json(etiquetasEnUso(db)));

  r.get('/avances', (c) => {
    const desde = validar(z.iso.datetime({ offset: true }), c.req.query('desde'));
    return c.json(avancesDesde(db, new Date(desde).toISOString()));
  });

  r.post('/', async (c) => {
    const datos = validar(esquemaNuevo, await c.req.json());
    return c.json(crearProyecto(db, datos), 201);
  });

  r.get('/:id', (c) => {
    const ficha = fichaProyecto(db, idDeRuta(c.req.param('id')));
    return ficha ? c.json(ficha) : noEncontrado('Proyecto');
  });

  r.patch('/:id', async (c) => {
    const cambios = validar(esquemaCambios, await c.req.json());
    const p = editarProyecto(db, idDeRuta(c.req.param('id')), cambios);
    return p ? c.json(p) : noEncontrado('Proyecto');
  });

  r.post('/:id/actualizaciones', async (c) => {
    const datos = validar(esquemaActualizacion, await c.req.json());
    const p = registrarActualizacion(db, idDeRuta(c.req.param('id')), datos);
    return p ? c.json(p, 201) : noEncontrado('Proyecto');
  });

  r.put('/:id/porque', async (c) => {
    const datos = validar(esquemaPorque, await c.req.json());
    const p = cambiarPorque(db, idDeRuta(c.req.param('id')), datos);
    return p ? c.json(p) : noEncontrado('Proyecto');
  });

  r.delete('/:id', (c) =>
    borrarProyecto(db, idDeRuta(c.req.param('id'))) ? c.json({ ok: true }) : noEncontrado('Proyecto'),
  );

  return r;
}
