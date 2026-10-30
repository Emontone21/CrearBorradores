import { PESOS_IGUALES } from '../../shared/atencion.ts';
import type { Ajustes } from '../../shared/tipos.ts';
import type { BaseDatos } from '../db.ts';

export const AJUSTES_POR_DEFECTO: Ajustes = {
  ia_activada: false,
  pesos: { ...PESOS_IGUALES },
};

export function leerAjustes(db: BaseDatos): Ajustes {
  const filas = db.prepare('SELECT clave, valor FROM ajustes').all() as Array<{ clave: string; valor: string }>;
  const guardados: Partial<Record<keyof Ajustes, unknown>> = {};
  for (const f of filas) {
    try {
      guardados[f.clave as keyof Ajustes] = JSON.parse(f.valor);
    } catch {
      // Un valor corrupto no debe impedir arrancar: se usa el valor por defecto.
    }
  }
  return {
    ia_activada: typeof guardados.ia_activada === 'boolean' ? guardados.ia_activada : AJUSTES_POR_DEFECTO.ia_activada,
    pesos: { ...AJUSTES_POR_DEFECTO.pesos, ...(guardados.pesos as object | undefined) },
  };
}

export function guardarAjustes(db: BaseDatos, cambios: Partial<Ajustes>): Ajustes {
  const upsert = db.prepare(
    'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
  );
  db.transaction(() => {
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor !== undefined) upsert.run(clave, JSON.stringify(valor));
    }
  })();
  return leerAjustes(db);
}
