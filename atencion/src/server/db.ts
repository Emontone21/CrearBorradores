// SQLite viene incluido en Node (node:sqlite): no hay nada que compilar al instalar, en ningún sistema.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

/** Carga node:sqlite sin el aviso de «función experimental», que asusta y no aporta nada al usarla. */
function cargarSqlite(): typeof import('node:sqlite') {
  const emitir = process.emitWarning;
  process.emitWarning = (() => {}) as typeof process.emitWarning;
  try {
    const modulo = process.getBuiltinModule('node:sqlite');
    if (!modulo) throw new Error('falta node:sqlite');
    return modulo;
  } catch {
    throw new Error(`Esta app necesita Node.js 22.13 o más reciente (tienes ${process.version}). Instala la versión LTS desde https://nodejs.org`);
  } finally {
    process.emitWarning = emitir;
  }
}

class Sentencia {
  constructor(private readonly s: StatementSync) {}

  // Parámetros posicionales (?) o un objeto con nombres (@nombre), igual que en SQL.
  run(...parametros: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const r = this.s.run(...(parametros as []));
    return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
  }

  get(...parametros: unknown[]): unknown {
    return this.s.get(...(parametros as []));
  }

  all(...parametros: unknown[]): unknown[] {
    return this.s.all(...(parametros as []));
  }
}

/** Base SQLite con transacciones anidables (las internas usan SAVEPOINT). */
export class BaseDatos {
  private profundidad = 0;

  constructor(
    private readonly db: DatabaseSync,
    /** Ruta del archivo, o ':memory:'. */
    readonly name: string,
  ) {}

  get memory(): boolean {
    return this.name === ':memory:';
  }

  prepare(sql: string): Sentencia {
    return new Sentencia(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  /** Devuelve una función que ejecuta `fn` dentro de una transacción: o se aplica todo, o nada. */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A) => {
      const nivel = this.profundidad++;
      const punto = `punto_${nivel}`;
      this.db.exec(nivel === 0 ? 'BEGIN' : `SAVEPOINT ${punto}`);
      try {
        const resultado = fn(...args);
        this.db.exec(nivel === 0 ? 'COMMIT' : `RELEASE ${punto}`);
        return resultado;
      } catch (e) {
        this.db.exec(nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${punto}; RELEASE ${punto}`);
        throw e;
      } finally {
        this.profundidad--;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}

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
  const { DatabaseSync } = cargarSqlite();
  const db = new BaseDatos(new DatabaseSync(ruta), ruta);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db);
  return db;
}

function migrar(db: BaseDatos) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = version; v < MIGRACIONES.length; v++) {
    db.transaction(() => {
      db.exec(MIGRACIONES[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

export const ahora = () => new Date().toISOString();
