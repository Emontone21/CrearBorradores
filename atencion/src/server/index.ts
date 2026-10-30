import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { crearApp } from './app.ts';
import { abrirBaseDatos, RUTA_DB_POR_DEFECTO } from './db.ts';

const RAIZ = resolve(import.meta.dirname, '../..');

// .env es opcional: solo hace falta para la IA.
const rutaEnv = resolve(RAIZ, '.env');
if (existsSync(rutaEnv)) process.loadEnvFile(rutaEnv);

const HOST = '127.0.0.1'; // nunca 0.0.0.0: la app no debe verse desde la red
const PUERTO = Number(process.env.PUERTO ?? 3001);
const produccion = process.argv.includes('--produccion');

const db = abrirBaseDatos();
const app = crearApp(db);

if (produccion) {
  const cliente = resolve(RAIZ, 'dist/client');
  const raizRelativa = relative(process.cwd(), cliente);
  app.use('/*', serveStatic({ root: raizRelativa }));
  // Rutas del navegador (/proyectos/3, /ritual…) → index.html
  app.get('*', serveStatic({ root: raizRelativa, path: 'index.html' }));
}

serve({ fetch: app.fetch, hostname: HOST, port: PUERTO }, () => {
  const rutaDb = process.env.DB_PATH ?? relative(process.cwd(), RUTA_DB_POR_DEFECTO);
  if (produccion) {
    console.log(`\n  Atención lista en http://${HOST}:${PUERTO}\n  Datos: ${rutaDb}\n`);
  } else {
    console.log(`  API en http://${HOST}:${PUERTO} · datos: ${rutaDb}`);
  }
});

const cerrar = () => {
  db.close();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
