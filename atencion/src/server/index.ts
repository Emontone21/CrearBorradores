import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { crearApp } from './app.ts';
import { abrirBaseDatos, RUTA_DB_POR_DEFECTO } from './db.ts';
import { cargarEjemplosSiHaceFalta } from './ejemplos.ts';
import { configurarIA } from './ia/cliente.ts';

const RAIZ = resolve(import.meta.dirname, '../..');

// .env es opcional: solo hace falta para la IA.
const rutaEnv = resolve(RAIZ, '.env');
if (existsSync(rutaEnv)) process.loadEnvFile(rutaEnv);

const HOST = '127.0.0.1'; // nunca 0.0.0.0: la app no debe verse desde la red
const PUERTO = Number(process.env.PUERTO ?? 3001);
const produccion = process.argv.includes('--produccion');

const db = abrirBaseDatos();
if (cargarEjemplosSiHaceFalta(db)) console.log('  Primera vez: se cargaron 3 proyectos de ejemplo (puedes borrarlos en Ajustes).');
const ia = configurarIA(process.env);
const app = crearApp(db, ia);

if (produccion) {
  const cliente = resolve(RAIZ, 'dist/client');
  const raizRelativa = relative(process.cwd(), cliente);
  app.use('/*', serveStatic({ root: raizRelativa }));
  // Rutas del navegador (/proyectos/3, /ritual…) → index.html
  app.get('*', serveStatic({ root: raizRelativa, path: 'index.html' }));
}

const URL_APP = `http://${HOST}:${PUERTO}`;
const abrir = process.argv.includes('--abrir');

/** Abre la app en el navegador predeterminado. Si no se puede, queda la dirección impresa en la consola. */
function abrirNavegador(url: string) {
  const [comando, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const hijo = spawn(comando, args, { detached: true, stdio: 'ignore', windowsHide: true });
    hijo.on('error', () => {});
    hijo.unref();
  } catch {
    // sin navegador disponible: basta con la dirección impresa
  }
}

const servidor = serve({ fetch: app.fetch, hostname: HOST, port: PUERTO }, () => {
  const rutaDb = process.env.DB_PATH ?? relative(process.cwd(), RUTA_DB_POR_DEFECTO);
  const estadoIA = ia ? `disponible (${ia.modelo}); actívala en Ajustes` : 'sin clave en .env, desactivada';
  if (produccion) {
    console.log(`\n  Atención lista en ${URL_APP}\n  Datos: ${rutaDb}\n  IA: ${estadoIA}\n`);
  } else {
    console.log(`  API en ${URL_APP} · datos: ${rutaDb} · IA: ${estadoIA}`);
  }
  if (abrir) abrirNavegador(URL_APP);
});

servidor.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`\n  El puerto ${PUERTO} ya está en uso: probablemente la app ya está abierta en otra ventana.`);
  console.error(`  Ábrela en ${URL_APP}, o elige otro puerto con la variable PUERTO.\n`);
  if (abrir) abrirNavegador(URL_APP);
  db.close();
  process.exitCode = 1;
});

const cerrar = () => {
  db.close();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
