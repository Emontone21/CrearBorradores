import { describe, expect, it } from 'vitest';
import { lunesDeSemana, semanaISO } from './semanas.ts';

describe('semanaISO', () => {
  it.each([
    [new Date(2026, 9, 30), '2026-W44'],
    [new Date(2026, 0, 1), '2026-W01'], // jueves: la semana 1 es la del primer jueves
    [new Date(2021, 0, 1), '2020-W53'], // viernes: pertenece a la última semana de 2020
    [new Date(2024, 11, 30), '2025-W01'], // lunes que ya es semana 1 del año siguiente
    [new Date(2026, 9, 26), '2026-W44'], // lunes
    [new Date(2026, 10, 1), '2026-W44'], // domingo
  ])('%s → %s', (fecha, esperado) => {
    expect(semanaISO(fecha)).toBe(esperado);
  });
});

describe('lunesDeSemana', () => {
  it('devuelve el lunes y es inversa de semanaISO', () => {
    const lunes = lunesDeSemana('2026-W44');
    expect(lunes.getDay()).toBe(1);
    expect(lunes.getDate()).toBe(26);
    expect(semanaISO(lunes)).toBe('2026-W44');
    expect(semanaISO(lunesDeSemana('2020-W53'))).toBe('2020-W53');
  });
});
