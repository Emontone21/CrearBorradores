import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type BaseDatos = Database.Database;

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RUTA_DB_POR_DEFECTO = resolve(RAIZ, 'data/app.db');

// Cada migración se aplica una sola vez; PRAGMA user_version guarda por cuál vamos.
const MIGRACIONES: string[] = [
  `
  CREATE TABLE proyectos (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    porque TEXT NOT NULL,
    etapa TEXT NOT NULL DEFAULT 'idea'
      CHECK (etapa IN ('idea','explorando','construyendo','pausado','terminado')),
    query TEXT NOT NULL DEFAULT '',
    keys_texto TEXT NOT NULL DEFAULT '',
    value TEXT NOT NULL DEFAULT '',
    impacto INTEGER NOT NULL DEFAULT 3 CHECK (impacto BETWEEN 1 AND 5),
    energia INTEGER NOT NULL DEFAULT 3 CHECK (energia BETWEEN 1 AND 5),
    urgencia INTEGER NOT NULL DEFAULT 3 CHECK (urgencia BETWEEN 1 AND 5),
    ejemplo INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL,
    actualizado_en TEXT NOT NULL
  );

  CREATE TABLE proyecto_etiquetas (
    proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    etiqueta TEXT NOT NULL,
    PRIMARY KEY (proyecto_id, etiqueta)
  );

  CREATE TABLE actualizaciones (
    id INTEGER PRIMARY KEY,
    proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('creacion','avance','porque','etapa','fusion')),
    descripcion TEXT NOT NULL DEFAULT '',
    query_anterior TEXT,
    query_nuevo TEXT,
    porque_anterior TEXT,
    porque_nuevo TEXT
  );
  CREATE INDEX idx_actualizaciones_proyecto ON actualizaciones(proyecto_id, fecha);

  CREATE TABLE conexiones (
    id INTEGER PRIMARY KEY,
    origen_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    destino_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL DEFAULT '',
    fuente TEXT NOT NULL CHECK (fuente IN ('manual','ia')),
    estado TEXT NOT NULL CHECK (estado IN ('pendiente','aceptada','descartada')),
    creado_en TEXT NOT NULL,
    CHECK (origen_id <> destino_id)
  );

  CREATE TABLE revisiones (
    id INTEGER PRIMARY KEY,
    semana TEXT NOT NULL UNIQUE,
    temperatura REAL NOT NULL,
    notas TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL
  );

  CREATE TABLE revision_atencion (
    revision_id INTEGER NOT NULL REFERENCES revisiones(id) ON DELETE CASCADE,
    proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    porcentaje INTEGER NOT NULL CHECK (porcentaje BETWEEN 0 AND 100),
    propuesto INTEGER NOT NULL CHECK (propuesto BETWEEN 0 AND 100),
    puntuacion REAL NOT NULL,
    PRIMARY KEY (revision_id, proyecto_id)
  );

  CREATE TABLE capturas (
    id INTEGER PRIMARY KEY,
    texto TEXT NOT NULL,
    creado_en TEXT NOT NULL,
    proyecto_id INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
    archivada INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE decisiones_mensuales (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL,
    semana TEXT NOT NULL,
    proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('pausar','fusionar','mantener')),
    destino_id INTEGER REFERENCES proyectos(id) ON DELETE SET NULL
  );

  CREATE TABLE ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,
];

export function abrirBaseDatos(ruta: string = process.env.DB_PATH ?? RUTA_DB_POR_DEFECTO): BaseDatos {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrar(db);
  return db;
}

function migrar(db: BaseDatos) {
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let v = version; v < MIGRACIONES.length; v++) {
    db.transaction(() => {
      db.exec(MIGRACIONES[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export const ahora = () => new Date().toISOString();
