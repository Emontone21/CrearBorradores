import { describe, expect, it } from 'vitest';
import {
  proponerReparto,
  puntuacion,
  reajustar,
  redondearA100,
  repartirEnteros,
  sliderDesdeTemperatura,
  softmax,
  suma,
  T_MAX,
  T_MIN,
  temperaturaDesdeSlider,
} from './atencion.ts';

const p = (id: number, impacto: number, energia: number, urgencia: number) => ({ id, impacto, energia, urgencia });

describe('puntuacion', () => {
  it('con pesos iguales es el promedio', () => {
    expect(puntuacion({ impacto: 5, energia: 3, urgencia: 1 })).toBe(3);
  });

  it('respeta los pesos', () => {
    expect(puntuacion({ impacto: 5, energia: 1, urgencia: 1 }, { impacto: 2, energia: 1, urgencia: 1 })).toBe(3);
    expect(puntuacion({ impacto: 5, energia: 1, urgencia: 1 }, { impacto: 1, energia: 0, urgencia: 0 })).toBe(5);
  });

  it('si todos los pesos son 0, pesan igual', () => {
    expect(puntuacion({ impacto: 4, energia: 4, urgencia: 1 }, { impacto: 0, energia: 0, urgencia: 0 })).toBe(3);
  });
});

describe('temperatura', () => {
  it('mapea el slider de foco a exploración', () => {
    expect(temperaturaDesdeSlider(0)).toBeCloseTo(T_MIN);
    expect(temperaturaDesdeSlider(1)).toBeCloseTo(T_MAX);
    expect(temperaturaDesdeSlider(0.5)).toBeCloseTo(Math.sqrt(T_MIN * T_MAX)); // centro geométrico ≈ 0.95
  });

  it('se limita al rango y es reversible', () => {
    expect(temperaturaDesdeSlider(-3)).toBeCloseTo(T_MIN);
    expect(temperaturaDesdeSlider(7)).toBeCloseTo(T_MAX);
    for (const s of [0, 0.2, 0.5, 0.9, 1]) expect(sliderDesdeTemperatura(temperaturaDesdeSlider(s))).toBeCloseTo(s);
  });
});

describe('softmax', () => {
  it('suma 1 y conserva el orden', () => {
    const r = softmax([1, 2, 3], 1);
    expect(suma(r)).toBeCloseTo(1);
    expect(r[2]).toBeGreaterThan(r[1]);
    expect(r[1]).toBeGreaterThan(r[0]);
  });

  it('no desborda con valores grandes o temperaturas mínimas', () => {
    const r = softmax([1000, 999], 0.0001);
    expect(r.every(Number.isFinite)).toBe(true);
    expect(r[0]).toBeCloseTo(1);
  });

  it('lista vacía → vacía', () => {
    expect(softmax([], 1)).toEqual([]);
  });
});

describe('repartirEnteros / redondearA100', () => {
  it('siempre suma exactamente el total', () => {
    const casos = [[1, 1, 1], [0.5, 0.3, 0.2], [0.333, 0.333, 0.334], [1, 2, 3, 4, 5, 6, 7], [1e-9, 1, 1e-9]];
    for (const c of casos) expect(suma(redondearA100(c))).toBe(100);
    expect(suma(repartirEnteros([3, 3, 3], 7))).toBe(7);
  });

  it('tres iguales → 34/33/33 (el sobrante va al primero en empate)', () => {
    expect(redondearA100([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('usa los restos mayores', () => {
    // 41.5 / 33.4 / 25.1 → 41 + 33 + 25 = 99 → el punto que falta va a quien tiene resto .5
    expect(redondearA100([0.415, 0.334, 0.251])).toEqual([42, 33, 25]);
  });

  it('todo en cero → reparto parejo', () => {
    expect(redondearA100([0, 0, 0, 0])).toEqual([25, 25, 25, 25]);
  });

  it('casos límite', () => {
    expect(redondearA100([])).toEqual([]);
    expect(redondearA100([0.2])).toEqual([100]);
    expect(repartirEnteros([1, 1], 0)).toEqual([0, 0]);
  });
});

describe('proponerReparto', () => {
  const proyectos = [p(1, 5, 5, 4), p(2, 4, 3, 3), p(3, 2, 2, 1)];

  it('suma 100 con cualquier temperatura', () => {
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const r = proponerReparto(proyectos, { impacto: 1, energia: 1, urgencia: 1 }, temperaturaDesdeSlider(s));
      expect(suma(r.map((x) => x.porcentaje))).toBe(100);
    }
  });

  it('T baja concentra casi todo en el mejor', () => {
    const r = proponerReparto(proyectos, { impacto: 1, energia: 1, urgencia: 1 }, T_MIN);
    expect(r[0].porcentaje).toBeGreaterThanOrEqual(90);
  });

  it('T alta reparte más parejo', () => {
    const rango = (t: number) => {
      const v = proponerReparto(proyectos, { impacto: 1, energia: 1, urgencia: 1 }, t).map((x) => x.porcentaje);
      return { min: Math.min(...v), dif: Math.max(...v) - Math.min(...v) };
    };
    expect(rango(T_MAX).dif).toBeLessThan(rango(1).dif);
    expect(rango(1).dif).toBeLessThan(rango(T_MIN).dif);
    expect(rango(T_MAX).min).toBeGreaterThan(15); // con T alta nadie se queda sin atención
  });

  it('puntuaciones iguales → reparto igual', () => {
    const r = proponerReparto([p(1, 3, 3, 3), p(2, 3, 3, 3)], { impacto: 1, energia: 1, urgencia: 1 }, 0.3);
    expect(r.map((x) => x.porcentaje)).toEqual([50, 50]);
  });

  it('un solo proyecto se lleva el 100 % y sin proyectos no hay reparto', () => {
    expect(proponerReparto([p(7, 1, 1, 1)], { impacto: 1, energia: 1, urgencia: 1 }, 1)).toEqual([
      { id: 7, puntuacion: 1, porcentaje: 100 },
    ]);
    expect(proponerReparto([], { impacto: 1, energia: 1, urgencia: 1 }, 1)).toEqual([]);
  });

  it('los pesos cambian el ganador', () => {
    const a = p(1, 5, 1, 1); // mucho impacto
    const b = p(2, 1, 5, 1); // mucha energía
    const porImpacto = proponerReparto([a, b], { impacto: 1, energia: 0, urgencia: 0 }, 1);
    const porEnergia = proponerReparto([a, b], { impacto: 0, energia: 1, urgencia: 0 }, 1);
    expect(porImpacto[0].porcentaje).toBeGreaterThan(porImpacto[1].porcentaje);
    expect(porEnergia[1].porcentaje).toBeGreaterThan(porEnergia[0].porcentaje);
  });
});

describe('reajustar (sliders que siempre suman 100)', () => {
  it('reparte la diferencia en proporción a lo que tenían los demás', () => {
    expect(reajustar([50, 30, 20], 0, 70)).toEqual([70, 18, 12]);
    expect(reajustar([50, 30, 20], 2, 0)).toEqual([63, 37, 0]);
  });

  it('si los demás estaban en 0, reparte a partes iguales', () => {
    expect(reajustar([100, 0, 0], 0, 40)).toEqual([40, 30, 30]);
  });

  it('extremos: 100 deja al resto en 0, y se limita a 0–100', () => {
    expect(reajustar([40, 30, 30], 1, 100)).toEqual([0, 100, 0]);
    expect(reajustar([40, 30, 30], 1, 150)).toEqual([0, 100, 0]);
    expect(reajustar([40, 30, 30], 1, -5)).toEqual([57, 0, 43]);
  });

  it('con un solo proyecto siempre es 100', () => {
    expect(reajustar([100], 0, 20)).toEqual([100]);
  });

  it('siempre suma 100 en ajustes aleatorios', () => {
    let r = [25, 25, 25, 25];
    for (let i = 0; i < 200; i++) {
      r = reajustar(r, i % 4, Math.round(Math.random() * 100));
      expect(suma(r)).toBe(100);
      expect(r.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
    }
  });
});
