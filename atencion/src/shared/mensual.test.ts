import { describe, expect, it } from 'vitest';
import { candidatosMensuales, rachaBaja, type RevisionMinima } from './mensual.ts';

const rev = (semana: string, reparto: Record<number, number>): RevisionMinima => ({
  semana,
  reparto: Object.entries(reparto).map(([id, porcentaje]) => ({ proyecto_id: Number(id), porcentaje })),
});

const revisiones = [
  rev('2026-W40', { 1: 60, 2: 30, 3: 10 }),
  rev('2026-W41', { 1: 70, 2: 25, 3: 5 }),
  rev('2026-W42', { 1: 70, 2: 5, 3: 25 }),
  // W43 sin revisión
  rev('2026-W44', { 1: 80, 2: 9, 3: 11 }),
  rev('2026-W45', { 1: 92, 2: 8, 3: 0 }),
];

describe('rachaBaja', () => {
  it('cuenta revisiones seguidas bajo el 10 % desde la más reciente', () => {
    expect(rachaBaja(2, revisiones).racha).toBe(3); // 8, 9, 5 (W43 sin revisión no corta)
    expect(rachaBaja(3, revisiones).racha).toBe(1); // 0 y luego 11 corta
    expect(rachaBaja(1, revisiones).racha).toBe(0);
  });

  it('el 10 % exacto ya no es «menos del 10 %»', () => {
    expect(rachaBaja(3, [rev('2026-W01', { 3: 10 })]).racha).toBe(0);
  });

  it('devuelve el historial de la racha, de la más reciente a la más antigua', () => {
    expect(rachaBaja(2, revisiones).historial).toEqual([
      { semana: '2026-W45', porcentaje: 8 },
      { semana: '2026-W44', porcentaje: 9 },
      { semana: '2026-W42', porcentaje: 5 },
    ]);
  });

  it('si el proyecto no estaba en una revisión, la racha se corta', () => {
    const r = [rev('2026-W01', { 5: 2 }), rev('2026-W02', { 1: 100 }), rev('2026-W03', { 5: 1 })];
    expect(rachaBaja(5, r).racha).toBe(1);
  });

  it('tras «mantener» solo cuentan las revisiones posteriores', () => {
    expect(rachaBaja(2, revisiones, { despuesDe: '2026-W44' }).racha).toBe(1);
  });

  it('acepta las revisiones en cualquier orden', () => {
    expect(rachaBaja(2, [...revisiones].reverse()).racha).toBe(3);
  });
});

describe('candidatosMensuales', () => {
  it('lista solo los que llevan 3 o más semanas bajo el umbral', () => {
    expect(candidatosMensuales([1, 2, 3], revisiones).map((c) => c.proyecto_id)).toEqual([2]);
  });

  it('respeta la decisión de mantener', () => {
    expect(candidatosMensuales([2], revisiones, new Map([[2, '2026-W44']]))).toEqual([]);
  });

  it('sin revisiones no hay candidatos', () => {
    expect(candidatosMensuales([1, 2], [])).toEqual([]);
  });
});
