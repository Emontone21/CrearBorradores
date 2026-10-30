// Reparto de atención: puntuación multi-cabeza + softmax con temperatura.
// Módulo puro (sin E/S): lo usan el navegador y los tests.

import type { Cabezas, Pesos } from './tipos.ts';

export const T_MIN = 0.3; // foco: casi todo a un proyecto
export const T_MAX = 3; // exploración: reparto parejo

export const PESOS_IGUALES: Pesos = { impacto: 1, energia: 1, urgencia: 1 };

const limitar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/**
 * Slider 0 (foco) … 1 (exploración) → temperatura entre T_MIN y T_MAX.
 * Escala logarítmica: el centro del slider (≈0.95) se siente intermedio.
 */
export function temperaturaDesdeSlider(s: number): number {
  return T_MIN * Math.pow(T_MAX / T_MIN, limitar(s, 0, 1));
}

export function sliderDesdeTemperatura(t: number): number {
  return limitar(Math.log(t / T_MIN) / Math.log(T_MAX / T_MIN), 0, 1);
}

/** Promedio ponderado de impacto, energía y urgencia. Si todos los pesos son 0, pesan igual. */
export function puntuacion(c: Cabezas, pesos: Pesos = PESOS_IGUALES): number {
  const w = {
    impacto: Math.max(0, pesos.impacto),
    energia: Math.max(0, pesos.energia),
    urgencia: Math.max(0, pesos.urgencia),
  };
  const total = w.impacto + w.energia + w.urgencia;
  if (total <= 0) return (c.impacto + c.energia + c.urgencia) / 3;
  return (w.impacto * c.impacto + w.energia * c.energia + w.urgencia * c.urgencia) / total;
}

/** softmax(x / T). Resta el máximo antes de exponenciar para no desbordar. */
export function softmax(valores: number[], temperatura: number): number[] {
  if (valores.length === 0) return [];
  const t = Math.max(temperatura, 1e-6);
  const max = Math.max(...valores);
  const exps = valores.map((v) => Math.exp((v - max) / t));
  const suma = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / suma);
}

/**
 * Convierte pesos no negativos en enteros que suman exactamente `total`
 * (método de los restos mayores). Empates: gana el de mayor peso y luego el primero.
 * Si todos los pesos son 0, reparte lo más parejo posible.
 */
export function repartirEnteros(pesos: number[], total: number): number[] {
  const n = pesos.length;
  if (n === 0) return [];
  const limpios = pesos.map((p) => (Number.isFinite(p) && p > 0 ? p : 0));
  const suma = limpios.reduce((a, b) => a + b, 0);
  const base = suma > 0 ? limpios : limpios.map(() => 1);
  const sumaBase = suma > 0 ? suma : n;

  const exactos = base.map((p) => (p / sumaBase) * total);
  const enteros = exactos.map((x) => Math.floor(x));
  let faltan = total - enteros.reduce((a, b) => a + b, 0);

  const orden = exactos
    .map((x, i) => ({ i, resto: x - Math.floor(x), x }))
    .sort((a, b) => b.resto - a.resto || b.x - a.x || a.i - b.i);
  for (let k = 0; faltan > 0; k = (k + 1) % n, faltan--) enteros[orden[k].i]++;
  return enteros;
}

export function redondearA100(fracciones: number[]): number[] {
  return repartirEnteros(fracciones, 100);
}

export interface PropuestaReparto {
  id: number;
  puntuacion: number;
  porcentaje: number;
}

/** Propuesta completa: puntuación → softmax → enteros que suman 100. */
export function proponerReparto(
  proyectos: Array<Cabezas & { id: number }>,
  pesos: Pesos,
  temperatura: number,
): PropuestaReparto[] {
  const puntos = proyectos.map((p) => puntuacion(p, pesos));
  const porcentajes = redondearA100(softmax(puntos, temperatura));
  return proyectos.map((p, i) => ({ id: p.id, puntuacion: puntos[i], porcentaje: porcentajes[i] }));
}

/**
 * Ajuste manual de un slider: fija `reparto[indice]` en `nuevo` y reparte la diferencia
 * entre los demás en proporción a lo que ya tenían. El total sigue siendo 100.
 */
export function reajustar(reparto: number[], indice: number, nuevo: number): number[] {
  const n = reparto.length;
  if (n === 0) return [];
  if (n === 1) return [100];
  const fijo = Math.round(limitar(nuevo, 0, 100));
  const otros = reparto.filter((_, i) => i !== indice);
  const repartidos = repartirEnteros(otros, 100 - fijo);
  const resultado: number[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) resultado.push(i === indice ? fijo : repartidos[k++]);
  return resultado;
}

export function suma(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0);
}
