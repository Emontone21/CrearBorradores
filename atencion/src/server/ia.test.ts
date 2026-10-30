import { beforeEach, describe, expect, it } from 'vitest';
import type { Conexion } from '../shared/tipos.ts';
import { crearApp } from './app.ts';
import { abrirBaseDatos } from './db.ts';
import { configurarIA, ErrorIA, type ConfigIA, type LlamadorIA, type Peticion } from './ia/cliente.ts';

/** IA simulada: devuelve `respuesta` validada contra el esquema, igual que el cliente real. */
function iaFalsa(respuesta: unknown | (() => never)) {
  const enviadas: Peticion[] = [];
  const llamar: LlamadorIA = async (peticion, esquema) => {
    enviadas.push(peticion);
    if (typeof respuesta === 'function') return (respuesta as () => never)();
    const r = esquema.safeParse(respuesta);
    if (!r.success) throw new ErrorIA('La IA no devolvió un JSON válido. No se guardó nada.');
    return r.data;
  };
  return { config: { modelo: 'modelo-de-prueba', llamar } satisfies ConfigIA, enviadas };
}

let pedir: (metodo: string, ruta: string, cuerpo?: unknown) => Response | Promise<Response>;

function montar(ia: ConfigIA | null) {
  const app = crearApp(abrirBaseDatos(':memory:'), ia);
  pedir = (metodo, ruta, cuerpo) =>
    app.request(`http://127.0.0.1${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Atencion': '1' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
}

async function dosProyectos() {
  const a = await (await pedir('POST', '/api/proyectos', { nombre: 'A', porque: 'pa', query: 'Necesito diseño', etapa: 'explorando' })).json();
  const b = await (await pedir('POST', '/api/proyectos', { nombre: 'B', porque: 'pb', keys_texto: 'Sé diseñar', etapa: 'construyendo' })).json();
  return { a, b };
}

describe('sin clave', () => {
  beforeEach(() => montar(null));

  it('configurarIA devuelve null si no hay ANTHROPIC_API_KEY', () => {
    expect(configurarIA({})).toBeNull();
    expect(configurarIA({ ANTHROPIC_API_KEY: '  ' })).toBeNull();
  });

  it('por defecto el modelo es claude-sonnet-5-5 y se puede cambiar con CLAUDE_MODEL', () => {
    expect(configurarIA({ ANTHROPIC_API_KEY: 'x' })?.modelo).toBe('claude-sonnet-5-5');
    expect(configurarIA({ ANTHROPIC_API_KEY: 'x', CLAUDE_MODEL: 'claude-opus-5-5' })?.modelo).toBe('claude-opus-5-5');
  });

  it('la IA figura como no disponible y no se puede activar', async () => {
    expect(await (await pedir('GET', '/api/ia/estado')).json()).toMatchObject({ disponible: false, activada: false });
    expect((await pedir('PUT', '/api/ajustes', { ia_activada: true })).status).toBe(400);
    expect((await pedir('GET', '/api/ia/cruces/vista-previa')).status).toBe(400);
  });
});

describe('con clave', () => {
  it('desactivada por defecto: no se puede usar hasta activarla en Ajustes', async () => {
    montar(iaFalsa({ sugerencias: [] }).config);
    expect(await (await pedir('GET', '/api/ia/estado')).json()).toMatchObject({ disponible: true, activada: false });
    expect((await pedir('GET', '/api/ia/cruces/vista-previa')).status).toBe(400);
    await pedir('PUT', '/api/ajustes', { ia_activada: true });
    expect((await pedir('GET', '/api/ia/cruces/vista-previa')).status).toBe(200);
  });

  it('la vista previa muestra exactamente lo que se envía', async () => {
    const falsa = iaFalsa({ sugerencias: [] });
    montar(falsa.config);
    await pedir('PUT', '/api/ajustes', { ia_activada: true });
    await dosProyectos();
    const previa = await (await pedir('GET', '/api/ia/cruces/vista-previa')).json();
    expect(previa.usuario).toContain('"query": "Necesito diseño"');
    expect(previa.usuario).toContain('"texto": "Sé diseñar"');

    await pedir('POST', '/api/ia/cruces', { huella: previa.huella });
    expect(falsa.enviadas).toEqual([{ sistema: previa.sistema, usuario: previa.usuario }]);
  });

  it('las sugerencias entran como conexiones pendientes de la IA; descarta ids inválidos y duplicados', async () => {
    // En una base nueva, A tiene id 1 y B id 2.
    montar(
      iaFalsa({
        sugerencias: [
          { origen: 2, destino: 1, razon: 'B sabe diseñar' },
          { origen: 2, destino: 1, razon: 'repetida' },
          { origen: 999, destino: 1, razon: 'no existe' },
          { origen: 1, destino: 1, razon: 'consigo mismo' },
        ],
      }).config,
    );
    await pedir('PUT', '/api/ajustes', { ia_activada: true });
    const { a, b } = await dosProyectos();
    expect([a.id, b.id]).toEqual([1, 2]);
    const previa = await (await pedir('GET', '/api/ia/cruces/vista-previa')).json();
    const r = await (await pedir('POST', '/api/ia/cruces', { huella: previa.huella })).json();
    expect(r.creadas).toBe(1);
    expect(r.omitidas).toBe(3);

    const conexiones: Conexion[] = await (await pedir('GET', '/api/conexiones')).json();
    expect(conexiones).toHaveLength(1);
    expect(conexiones[0]).toMatchObject({ origen_id: 2, destino_id: 1, fuente: 'ia', estado: 'pendiente' });
  });

  it('si los datos cambian después de la vista previa, no se envía nada', async () => {
    const falsa = iaFalsa({ sugerencias: [] });
    montar(falsa.config);
    await pedir('PUT', '/api/ajustes', { ia_activada: true });
    const { a } = await dosProyectos();
    const previa = await (await pedir('GET', '/api/ia/cruces/vista-previa')).json();
    await pedir('POST', `/api/proyectos/${a.id}/actualizaciones`, { descripcion: 'x', query_nuevo: 'otra cosa' });
    const res = await pedir('POST', '/api/ia/cruces', { huella: previa.huella });
    expect(res.status).toBe(409);
    expect(falsa.enviadas).toHaveLength(0);
  });

  it('JSON inválido o error de la API: mensaje claro y nada guardado', async () => {
    montar(iaFalsa({ sugerencias: [{ origen: 'uno' }] }).config);
    await pedir('PUT', '/api/ajustes', { ia_activada: true });
    await dosProyectos();
    let previa = await (await pedir('GET', '/api/ia/cruces/vista-previa')).json();
    let res = await pedir('POST', '/api/ia/cruces', { huella: previa.huella });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/JSON válido/);
    expect(await (await pedir('GET', '/api/conexiones')).json()).toEqual([]);

    montar(
      iaFalsa(() => {
        throw new ErrorIA('No se pudo conectar con la API de Claude. ¿Hay conexión a internet?', 503);
      }).config,
    );
    await pedir('PUT', '/api/ajustes', { ia_activada: true });
    await dosProyectos();
    previa = await (await pedir('GET', '/api/ia/cruces/vista-previa')).json();
    res = await pedir('POST', '/api/ia/cruces', { huella: previa.huella });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/conectar/);
  });

  it('las fusiones sugeridas se devuelven sin modificar ningún dato', async () => {
    montar(
      iaFalsa({
        sugerencias: [
          { absorbido: 1, destino: 2, razon: 'Se solapan' },
          { absorbido: 50, destino: 1, razon: 'no existe' },
        ],
      }).config,
    );
    await pedir('PUT', '/api/ajustes', { ia_activada: true });
    await dosProyectos();
    const previa = await (await pedir('GET', '/api/ia/fusiones/vista-previa')).json();
    const r = await (await pedir('POST', '/api/ia/fusiones', { huella: previa.huella })).json();
    expect(r).toEqual([{ absorbido: 1, destino: 2, razon: 'Se solapan' }]);
    const etapas = (await (await pedir('GET', '/api/proyectos')).json()).map((p: { etapa: string }) => p.etapa);
    expect(etapas).not.toContain('terminado');
  });
});
