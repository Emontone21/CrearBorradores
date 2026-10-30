import { beforeEach, describe, expect, it } from 'vitest';
import type { FichaProyecto, Proyecto } from '../shared/tipos.ts';
import { crearApp } from './app.ts';
import { abrirBaseDatos } from './db.ts';

let app: ReturnType<typeof crearApp>;

function pedir(metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}) {
  return app.request(`http://127.0.0.1${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Atencion': '1', ...cabeceras },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

async function crear(nombre: string, extra: Record<string, unknown> = {}): Promise<Proyecto> {
  const res = await pedir('POST', '/api/proyectos', { nombre, porque: `Porque ${nombre}`, ...extra });
  expect(res.status).toBe(201);
  return res.json();
}

beforeEach(() => {
  app = crearApp(abrirBaseDatos(':memory:'));
});

describe('seguridad local', () => {
  it('rechaza un Host que no es localhost', async () => {
    const res = await app.request('http://evil.example/api/proyectos');
    expect(res.status).toBe(403);
  });

  it('rechaza escrituras sin la cabecera de la app', async () => {
    const res = await app.request('http://127.0.0.1/api/proyectos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'x', porque: 'y' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('proyectos', () => {
  it('crea un proyecto y deja la intención original en el historial', async () => {
    const p = await crear('Libro', { query: '¿Editorial?', etiquetas: ['escritura', 'Escritura ', 'edición'] });
    expect(p.etapa).toBe('idea');
    expect(p.etiquetas).toEqual(['edición', 'escritura']);

    const ficha: FichaProyecto = await (await pedir('GET', `/api/proyectos/${p.id}`)).json();
    expect(ficha.actualizaciones).toHaveLength(1);
    expect(ficha.actualizaciones[0]).toMatchObject({ tipo: 'creacion', porque_nuevo: 'Porque Libro' });
  });

  it('exige nombre y por qué', async () => {
    const res = await pedir('POST', '/api/proyectos', { nombre: 'Sin porqué' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/porque/);
  });

  it('no deja cambiar el por qué ni el query por PATCH', async () => {
    const p = await crear('A');
    expect((await pedir('PATCH', `/api/proyectos/${p.id}`, { porque: 'otro' })).status).toBe(400);
    expect((await pedir('PATCH', `/api/proyectos/${p.id}`, { query: 'otro' })).status).toBe(400);
  });

  it('registra una actualización guardando el query anterior', async () => {
    const p = await crear('A', { query: 'Q1' });
    const res = await pedir('POST', `/api/proyectos/${p.id}/actualizaciones`, {
      descripcion: 'Terminé el prototipo',
      query_nuevo: 'Q2',
    });
    expect(res.status).toBe(201);
    expect((await res.json()).query).toBe('Q2');

    const ficha: FichaProyecto = await (await pedir('GET', `/api/proyectos/${p.id}`)).json();
    expect(ficha.actualizaciones[0]).toMatchObject({ tipo: 'avance', query_anterior: 'Q1', query_nuevo: 'Q2' });
  });

  it('cambiar el por qué exige motivo y queda en el historial', async () => {
    const p = await crear('A');
    expect((await pedir('PUT', `/api/proyectos/${p.id}/porque`, { porque: 'Nuevo', motivo: '' })).status).toBe(400);

    await pedir('PUT', `/api/proyectos/${p.id}/porque`, { porque: 'Nuevo', motivo: 'Aprendí algo' });
    const ficha: FichaProyecto = await (await pedir('GET', `/api/proyectos/${p.id}`)).json();
    expect(ficha.porque).toBe('Nuevo');
    expect(ficha.actualizaciones[0]).toMatchObject({
      tipo: 'porque',
      porque_anterior: 'Porque A',
      porque_nuevo: 'Nuevo',
      descripcion: 'Aprendí algo',
    });
  });

  it('el cambio de etapa queda en el historial', async () => {
    const p = await crear('A');
    await pedir('PATCH', `/api/proyectos/${p.id}`, { etapa: 'construyendo', impacto: 5 });
    const ficha: FichaProyecto = await (await pedir('GET', `/api/proyectos/${p.id}`)).json();
    expect(ficha.impacto).toBe(5);
    expect(ficha.actualizaciones[0].descripcion).toBe('Etapa: Idea → Construyendo');
  });

  it('valida las puntuaciones entre 1 y 5', async () => {
    const p = await crear('A');
    expect((await pedir('PATCH', `/api/proyectos/${p.id}`, { urgencia: 6 })).status).toBe(400);
  });
});

describe('conexiones', () => {
  it('una conexión manual entra aceptada y aparece en ambas fichas', async () => {
    const a = await crear('A');
    const b = await crear('B');
    const res = await pedir('POST', '/api/conexiones', { origen_id: a.id, destino_id: b.id, descripcion: 'A aporta código' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ estado: 'aceptada', fuente: 'manual', origen_nombre: 'A', destino_nombre: 'B' });

    const fichaB: FichaProyecto = await (await pedir('GET', `/api/proyectos/${b.id}`)).json();
    expect(fichaB.conexiones).toHaveLength(1);
  });

  it('no conecta un proyecto consigo mismo', async () => {
    const a = await crear('A');
    expect((await pedir('POST', '/api/conexiones', { origen_id: a.id, destino_id: a.id })).status).toBe(400);
  });
});

describe('revisiones', () => {
  it('rechaza un reparto que no suma 100', async () => {
    const a = await crear('A');
    const res = await pedir('PUT', '/api/revisiones/2026-W44', {
      temperatura: 1,
      reparto: [{ proyecto_id: a.id, porcentaje: 90, propuesto: 100, puntuacion: 3 }],
    });
    expect(res.status).toBe(400);
  });

  it('guarda y reemplaza la revisión de la semana', async () => {
    const a = await crear('A');
    const b = await crear('B');
    const reparto = (x: number) => [
      { proyecto_id: a.id, porcentaje: x, propuesto: 50, puntuacion: 3 },
      { proyecto_id: b.id, porcentaje: 100 - x, propuesto: 50, puntuacion: 3 },
    ];
    await pedir('PUT', '/api/revisiones/2026-W44', { temperatura: 1, reparto: reparto(70) });
    await pedir('PUT', '/api/revisiones/2026-W44', { temperatura: 2, reparto: reparto(40) });
    const lista = await (await pedir('GET', '/api/revisiones')).json();
    expect(lista).toHaveLength(1);
    expect(lista[0].temperatura).toBe(2);
    expect(lista[0].reparto[0]).toMatchObject({ proyecto_id: b.id, porcentaje: 60 });
  });
});
