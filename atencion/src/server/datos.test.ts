import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { crearApp } from './app.ts';
import { abrirBaseDatos, type BaseDatos } from './db.ts';
import { borrarEjemplos, cargarEjemplosSiHaceFalta } from './ejemplos.ts';

const carpetas: string[] = [];
afterEach(() => {
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true });
});

function montar(db: BaseDatos = abrirBaseDatos(':memory:')) {
  const app = crearApp(db);
  const pedir = (metodo: string, ruta: string, cuerpo?: unknown) =>
    app.request(`http://127.0.0.1${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Atencion': '1' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  return { db, pedir };
}

describe('ejemplos', () => {
  it('se cargan una sola vez, con la base vacía', () => {
    const db = abrirBaseDatos(':memory:');
    expect(cargarEjemplosSiHaceFalta(db)).toBe(true);
    expect(cargarEjemplosSiHaceFalta(db)).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM proyectos WHERE ejemplo = 1').get()).toEqual({ n: 3 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM conexiones').get()).toEqual({ n: 2 });
  });

  it('borrarlos no deja rastros y no vuelven a aparecer', () => {
    const db = abrirBaseDatos(':memory:');
    cargarEjemplosSiHaceFalta(db);
    expect(borrarEjemplos(db)).toBe(3);
    for (const t of ['proyectos', 'conexiones', 'actualizaciones', 'proyecto_etiquetas']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({ n: 0 });
    }
    expect(cargarEjemplosSiHaceFalta(db)).toBe(false);
  });

  it('no se cargan si ya tienes proyectos', async () => {
    const { db, pedir } = montar();
    await pedir('POST', '/api/proyectos', { nombre: 'Mío', porque: 'x' });
    expect(cargarEjemplosSiHaceFalta(db)).toBe(false);
  });

  it('el endpoint borra solo los de ejemplo', async () => {
    const { db, pedir } = montar();
    cargarEjemplosSiHaceFalta(db);
    await pedir('POST', '/api/proyectos', { nombre: 'Mío', porque: 'x' });
    expect(await (await pedir('GET', '/api/datos/ejemplos')).json()).toEqual({ cantidad: 3 });
    expect(await (await pedir('DELETE', '/api/datos/ejemplos')).json()).toEqual({ borrados: 3 });
    const nombres = (await (await pedir('GET', '/api/proyectos')).json()).map((p: { nombre: string }) => p.nombre);
    expect(nombres).toEqual(['Mío']);
  });
});

describe('exportar e importar', () => {
  it('ida y vuelta: importar lo exportado reproduce exactamente los datos', async () => {
    const origen = montar();
    cargarEjemplosSiHaceFalta(origen.db);
    await origen.pedir('POST', '/api/capturas', { texto: 'Idea suelta' });
    await origen.pedir('PUT', '/api/revisiones/2026-W44', {
      temperatura: 1,
      reparto: [
        { proyecto_id: 1, porcentaje: 60, propuesto: 55, puntuacion: 3.67 },
        { proyecto_id: 2, porcentaje: 30, propuesto: 30, puntuacion: 3.33 },
        { proyecto_id: 3, porcentaje: 10, propuesto: 15, puntuacion: 2.33 },
      ],
    });
    await origen.pedir('PUT', '/api/ajustes', { pesos: { impacto: 2, energia: 1, urgencia: 1 } });
    const res = await origen.pedir('GET', '/api/datos/exportar');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="atencion-\d{4}-\d{2}-\d{2}\.json"/);
    const exportado = await res.json();

    const destino = montar();
    await destino.pedir('POST', '/api/proyectos', { nombre: 'Se va a reemplazar', porque: 'x' });
    const r = await destino.pedir('POST', '/api/datos/importar', exportado);
    expect(r.status).toBe(200);
    expect((await r.json()).proyectos).toBe(3);

    const reexportado = await (await destino.pedir('GET', '/api/datos/exportar')).json();
    expect(reexportado.datos).toEqual(exportado.datos);
    expect((await (await destino.pedir('GET', '/api/ajustes')).json()).pesos).toEqual({ impacto: 2, energia: 1, urgencia: 1 });
  });

  it('rechaza un archivo que no es una exportación de la app', async () => {
    const { pedir } = montar();
    const r = await pedir('POST', '/api/datos/importar', { hola: 'mundo' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/formato/);
  });

  it('si los datos son incoherentes no cambia nada', async () => {
    const { pedir } = montar();
    await pedir('POST', '/api/proyectos', { nombre: 'Intacto', porque: 'x' });
    const exportado = await (await pedir('GET', '/api/datos/exportar')).json();
    // Una conexión que apunta a un proyecto inexistente.
    exportado.datos.conexiones.push({
      id: 1, origen_id: 1, destino_id: 99, descripcion: '', fuente: 'manual', estado: 'aceptada', creado_en: 'x',
    });
    exportado.datos.proyectos[0].nombre = 'Cambiado';
    const r = await pedir('POST', '/api/datos/importar', exportado);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/No se cambió nada/);
    const nombres = (await (await pedir('GET', '/api/proyectos')).json()).map((p: { nombre: string }) => p.nombre);
    expect(nombres).toEqual(['Intacto']);
  });

  it('antes de importar guarda una copia de la base en data/backups', async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'atencion-'));
    carpetas.push(carpeta);
    const { pedir } = montar(abrirBaseDatos(join(carpeta, 'app.db')));
    const exportado = await (await pedir('GET', '/api/datos/exportar')).json();
    const r = await (await pedir('POST', '/api/datos/importar', exportado)).json();
    expect(r.copia).toContain(join(carpeta, 'backups'));
    expect(readdirSync(join(carpeta, 'backups'))).toHaveLength(1);
  });
});
