import { Hono } from 'hono';
import { isAbsolute, relative } from 'node:path';
import { HTTPException } from 'hono/http-exception';
import type { BaseDatos } from '../db.ts';
import { borrarEjemplos } from '../ejemplos.ts';
import { ErrorImportacion, exportar, importar } from '../modelo/datos.ts';

export function rutasDatos(db: BaseDatos) {
  const r = new Hono();

  r.get('/exportar', (c) => {
    const fecha = new Date().toISOString().slice(0, 10);
    c.header('Content-Disposition', `attachment; filename="atencion-${fecha}.json"`);
    return c.json(exportar(db));
  });

  r.post('/importar', async (c) => {
    try {
      const r = importar(db, await c.req.json());
      // Dentro de la carpeta de la app se muestra relativa (data/backups/…), que es más legible.
      const rel = r.copia && relative(process.cwd(), r.copia);
      return c.json({ ...r, copia: rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : r.copia });
    } catch (e) {
      if (e instanceof ErrorImportacion) throw new HTTPException(400, { message: e.message });
      throw e;
    }
  });

  r.get('/ejemplos', (c) =>
    c.json({ cantidad: (db.prepare('SELECT COUNT(*) AS n FROM proyectos WHERE ejemplo = 1').get() as { n: number }).n }),
  );

  r.delete('/ejemplos', (c) => c.json({ borrados: borrarEjemplos(db) }));

  return r;
}
