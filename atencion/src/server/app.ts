import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { BaseDatos } from './db.ts';
import type { ConfigIA } from './ia/cliente.ts';
import { rutasAjustes } from './rutas/ajustes.ts';
import { rutasCapturas } from './rutas/capturas.ts';
import { rutasConexiones } from './rutas/conexiones.ts';
import { rutasDatos } from './rutas/datos.ts';
import { rutasIA } from './rutas/ia.ts';
import { rutasMensual } from './rutas/mensual.ts';
import { rutasProyectos } from './rutas/proyectos.ts';
import { rutasRevisiones } from './rutas/revisiones.ts';

const HOSTS_LOCALES = new Set(['127.0.0.1', 'localhost', '[::1]']);
export const CABECERA_APP = 'x-atencion';

/** `ia` es null cuando no hay ANTHROPIC_API_KEY: la app funciona completa sin ella. */
export function crearApp(db: BaseDatos, ia: ConfigIA | null = null) {
  const app = new Hono();

  // Defensa para una API local sin login:
  //  - Host distinto de localhost → fuera (evita DNS rebinding).
  //  - Peticiones que modifican datos exigen una cabecera propia. Una web ajena no puede
  //    añadirla sin un preflight CORS que este servidor nunca aprueba.
  app.use('/api/*', async (c, next) => {
    if (!HOSTS_LOCALES.has(new URL(c.req.url).hostname)) {
      return c.json({ error: 'Host no permitido' }, 403);
    }
    if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header(CABECERA_APP) !== '1') {
      return c.json({ error: 'Petición rechazada: falta la cabecera de la app' }, 403);
    }
    await next();
  });

  app.route('/api/proyectos', rutasProyectos(db));
  app.route('/api/conexiones', rutasConexiones(db));
  app.route('/api/revisiones', rutasRevisiones(db));
  app.route('/api/capturas', rutasCapturas(db));
  app.route('/api/mensual', rutasMensual(db));
  app.route('/api/ajustes', rutasAjustes(db, ia !== null));
  app.route('/api/ia', rutasIA(db, ia));
  app.route('/api/datos', rutasDatos(db));

  app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof SyntaxError) return c.json({ error: 'El cuerpo de la petición no es JSON válido' }, 400);
    console.error(err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  });

  return app;
}
