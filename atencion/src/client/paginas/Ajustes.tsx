import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { PESOS_IGUALES } from '../../shared/atencion.ts';
import type { Pesos } from '../../shared/tipos.ts';
import { api } from '../api.ts';
import { useAjustes, useEstadoIA, useMutacion } from '../datos.ts';

export function Ajustes() {
  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Ajustes</h1>
          <p className="subtitulo">Todo se guarda en tu equipo, en data/app.db.</p>
        </div>
      </div>
      <div className="ajustes">
        <SeccionIA />
        <SeccionPesos />
        <SeccionDatos />
        <SeccionEjemplos />
      </div>
    </>
  );
}

function SeccionIA() {
  const estado = useEstadoIA();
  const guardar = useMutacion((ia_activada: boolean) => api.guardarAjustes({ ia_activada }));
  const e = estado.data;

  return (
    <section className="panel">
      <h2>Inteligencia artificial (opcional)</h2>
      <div className="pila">
        <p className="tenue">
          Con la IA activada aparecen dos botones: <strong>Sugerir cruces</strong> en el ritual semanal y{' '}
          <strong>Detectar fusiones</strong> en la revisión mensual. Antes de cada llamada verás exactamente qué datos se
          envían. Las sugerencias nunca cambian nada por sí solas: entran como pendientes para que decidas.
        </p>
        {e && !e.disponible && (
          <div className="aviso">
            Para activarla, crea un archivo <span className="mono">.env</span> en la carpeta del proyecto con{' '}
            <span className="mono">ANTHROPIC_API_KEY=tu-clave</span> y reinicia la app. La clave solo la lee el servidor
            local; nunca llega al navegador.
          </div>
        )}
        <label className="interruptor">
          <input
            type="checkbox"
            checked={guardar.isPending ? !!guardar.variables : !!e?.activada}
            disabled={!e?.disponible || guardar.isPending}
            onChange={(ev) => guardar.mutate(ev.target.checked)}
          />
          <span>
            {e?.activada ? 'IA activada' : 'IA desactivada'}
            {e?.disponible && (
              <span className="muy-tenue">
                {' '}
                · modelo <span className="mono">{e.modelo}</span> (se cambia con CLAUDE_MODEL en .env)
              </span>
            )}
          </span>
        </label>
        {guardar.error && <div className="aviso error">{guardar.error.message}</div>}
      </div>
    </section>
  );
}

const CABEZAS: Array<{ clave: keyof Pesos; nombre: string; ayuda: string }> = [
  { clave: 'impacto', nombre: 'Impacto', ayuda: 'cuánto importa el resultado' },
  { clave: 'energia', nombre: 'Energía', ayuda: 'cuánto te activa trabajar en él' },
  { clave: 'urgencia', nombre: 'Urgencia', ayuda: 'cuánto cuesta esperar' },
];

function SeccionPesos() {
  const ajustes = useAjustes();
  const [pesos, setPesos] = useState<Pesos>(PESOS_IGUALES);
  const [guardado, setGuardado] = useState(false);
  const guardar = useMutacion((p: Pesos) => api.guardarAjustes({ pesos: p }), () => setGuardado(true));

  useEffect(() => {
    if (ajustes.data) setPesos(ajustes.data.pesos);
  }, [ajustes.data]);

  const total = pesos.impacto + pesos.energia + pesos.urgencia;
  const cambiado = JSON.stringify(pesos) !== JSON.stringify(ajustes.data?.pesos);

  return (
    <section className="panel">
      <h2>Pesos de las tres cabezas</h2>
      <p className="tenue" style={{ marginBottom: 16 }}>
        La puntuación de cada proyecto es el promedio ponderado de sus cabezas. Con pesos iguales, las tres cuentan lo
        mismo.
      </p>
      <div className="pesos">
        {CABEZAS.map((c) => (
          <div key={c.clave} style={{ display: 'contents' }}>
            <span>
              <strong>{c.nombre}</strong>
              <br />
              <span className="muy-tenue">{c.ayuda}</span>
            </span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={pesos[c.clave]}
              aria-label={`Peso de ${c.nombre}`}
              onChange={(e) => {
                setPesos({ ...pesos, [c.clave]: Number(e.target.value) });
                setGuardado(false);
              }}
            />
            <span className="mono" style={{ textAlign: 'right' }}>
              {total > 0 ? `${Math.round((pesos[c.clave] / total) * 100)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
      {total === 0 && (
        <div className="aviso" style={{ marginTop: 12 }}>
          Con todos los pesos en cero, las tres cabezas cuentan igual.
        </div>
      )}
      {guardar.error && <div className="aviso error">{guardar.error.message}</div>}
      <div className="fila" style={{ marginTop: 16 }}>
        <button className="boton primario" disabled={!cambiado || guardar.isPending} onClick={() => guardar.mutate(pesos)}>
          Guardar pesos
        </button>
        <button
          className="boton"
          onClick={() => {
            setPesos(PESOS_IGUALES);
            setGuardado(false);
          }}
        >
          Pesos iguales
        </button>
        {guardado && !cambiado && <span className="muy-tenue">Guardado.</span>}
      </div>
    </section>
  );
}

function SeccionDatos() {
  const entrada = useRef<HTMLInputElement>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const importar = useMutacion(api.importar, (r) =>
    setMensaje({
      tipo: 'ok',
      texto: `Importados ${r.proyectos} proyectos.${r.copia ? ` Copia de los datos anteriores: ${r.copia}` : ''}`,
    }),
  );

  const alElegir = async (archivo: File | undefined) => {
    if (entrada.current) entrada.current.value = '';
    if (!archivo) return;
    setMensaje(null);
    let contenido: unknown;
    try {
      contenido = JSON.parse(await archivo.text());
    } catch {
      setMensaje({ tipo: 'error', texto: 'El archivo no es un JSON válido.' });
      return;
    }
    if (
      confirm(
        `¿Importar «${archivo.name}»?\n\nReemplaza TODOS tus datos actuales. Antes se guarda una copia automática en data/backups/.`,
      )
    ) {
      importar.mutate(contenido);
    }
  };

  return (
    <section className="panel">
      <h2>Tus datos</h2>
      <p className="tenue" style={{ marginBottom: 14 }}>
        Exporta todo (proyectos, historial, conexiones, revisiones, capturas y ajustes) en un archivo JSON para guardarlo
        o llevarlo a otro equipo. Importar reemplaza todo lo actual.
      </p>
      <div className="fila">
        <a className="boton" href="/api/datos/exportar" download>
          Exportar todo (JSON)
        </a>
        <button className="boton" disabled={importar.isPending} onClick={() => entrada.current?.click()}>
          Importar desde JSON…
        </button>
        <input
          ref={entrada}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => alElegir(e.target.files?.[0])}
        />
      </div>
      {(mensaje || importar.error) && (
        <div className={`aviso ${importar.error || mensaje?.tipo === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 12 }}>
          {importar.error?.message ?? mensaje?.texto}
        </div>
      )}
    </section>
  );
}

function SeccionEjemplos() {
  const ejemplos = useQuery({ queryKey: ['ejemplos'], queryFn: api.ejemplos });
  const borrar = useMutacion(api.borrarEjemplos);
  if (!ejemplos.data?.cantidad) return null;
  return (
    <section className="panel">
      <h2>Proyectos de ejemplo</h2>
      <p className="tenue" style={{ marginBottom: 14 }}>
        Hay {ejemplos.data.cantidad} proyectos de ejemplo para que veas cómo funciona el método. Cuando quieras, bórralos
        con sus conexiones e historial; tus proyectos no se tocan.
      </p>
      <button
        className="boton peligro"
        disabled={borrar.isPending}
        onClick={() => confirm('¿Borrar los proyectos de ejemplo?') && borrar.mutate(undefined)}
      >
        Borrar proyectos de ejemplo
      </button>
      {borrar.error && <div className="aviso error">{borrar.error.message}</div>}
    </section>
  );
}
