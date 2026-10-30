import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

/** Valida con zod y responde 400 con un mensaje legible si algo no cuadra. */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const detalle = r.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    throw new HTTPException(400, { message: `Datos inválidos — ${detalle}` });
  }
  return r.data;
}

export function noEncontrado(que = 'Recurso'): never {
  throw new HTTPException(404, { message: `${que} no encontrado` });
}

export function idDeRuta(valor: string): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new HTTPException(400, { message: 'Id inválido' });
  return id;
}

export const textoCorto = z.string().trim().max(500);
export const textoLargo = z.string().max(20_000);
export const nota1a5 = z.number().int().min(1).max(5);
