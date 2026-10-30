import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Candidato } from '../../shared/mensual.ts';
import { esActivo, type Proyecto } from '../../shared/tipos.ts';
import { api } from '../api.ts';
import { ConfirmarEnvioIA } from '../componentes/ConfirmarEnvioIA.tsx';
import { useEstadoIA, useMutacion, useProyectos } from '../datos.ts';

export function Mensual() {
  const mensual = useQuery({ queryKey: ['mensual'], queryFn: api.mensual });
  const proyectos = useProyectos();
  const estadoIA = useEstadoIA();
  const [fusionesIA, setFusionesIA] = useState<Array<{ absorbido: number; destino: number; razon: string }> | null>(null);

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Revisión mensual</h1>
          <p className="subtitulo">
            Una pasada más profunda: ¿qué proyectos llevan semanas casi sin atención? Decide si pausarlos, fusionarlos
            con otro o mantenerlos.
          </p>
        </div>
      </div>

      {mensual.isLoading ? (
        <div className="cargando">Cargando…</div>
      ) : mensual.error ? (
        <div className="aviso error">{mensual.error.message}</div>
      ) : (
        <div className="pila" style={{ gap: 16 }}>
          <div className="fila separar">
            <h2>
              Con menos del {mensual.data!.umbral} % durante {mensual.data!.semanas} revisiones seguidas o más
            </h2>
          </div>
          {mensual.data!.candidatos.length === 0 ? (
            <div className="vacio">
              Ningún proyecto activo está en esa situación. Tu atención está donde dijiste que estaría.
            </div>
          ) : (
            mensual.data!.candidatos.map((c) => (
              <TarjetaCandidato key={c.proyecto_id} c={c} proyectos={proyectos.data ?? []} />
            ))
          )}

          {estadoIA.data?.activada && (
          <section className="panel">
            <div className="fila separar">
              <div>
                <h2>Posibles fusiones</h2>
                <p className="muy-tenue">Proyectos que se solapan tanto que podrían ser uno solo.</p>
              </div>
              <ConfirmarEnvioIA tipo="fusiones" etiqueta="Detectar fusiones" enviar={api.iaFusiones} alTerminar={setFusionesIA} />
            </div>
            {fusionesIA && (
              <div style={{ marginTop: 14 }}>
                {fusionesIA.length === 0 ? (
                  <div className="aviso ok">La IA no ve proyectos que convenga fusionar.</div>
                ) : (
                  <ul className="lista-conexiones">
                    {fusionesIA.map((f) => (
                      <SugerenciaFusion
                        key={`${f.absorbido}-${f.destino}`}
                        f={f}
                        proyectos={proyectos.data ?? []}
                        alDecidir={() => setFusionesIA((l) => l?.filter((x) => x !== f) ?? null)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
          )}

          <HistorialAtencion proyectos={proyectos.data ?? []} />
        </div>
      )}
    </>
  );
}

function TarjetaCandidato({ c, proyectos }: { c: Candidato & { proyecto: Proyecto }; proyectos: Proyecto[] }) {
  const [destino, setDestino] = useState('');
  const decidir = useMutacion(api.decidir);
  const p = c.proyecto;
  const otros = proyectos.filter((o) => o.id !== p.id && o.etapa !== 'terminado');
  const nombreDestino = otros.find((o) => String(o.id) === destino)?.nombre;

  return (
    <section className="panel candidato">
      <div>
        <h3>
          <Link to={`/proyectos/${p.id}`}>{p.nombre}</Link>
        </h3>
        <p className="tenue" style={{ fontFamily: 'var(--fuente-serif)', fontStyle: 'italic', margin: '4px 0' }}>
          {p.porque}
        </p>
        <p className="muy-tenue">
          {c.racha} revisiones seguidas con poca atención:{' '}
          {[...c.historial]
            .reverse()
            .map((h) => `${h.semana.slice(5)} ${h.porcentaje}%`)
            .join(' · ')}
        </p>
        <div className="mini-historial" aria-hidden>
          {[...c.historial].reverse().map((h) => (
            <span key={h.semana} style={{ height: `${Math.max(5, h.porcentaje * 4)}%` }} title={`${h.semana}: ${h.porcentaje}%`} />
          ))}
        </div>
        {decidir.error && (
          <div className="aviso error" style={{ marginTop: 10 }}>
            {decidir.error.message}
          </div>
        )}
      </div>
      <div className="pila" style={{ gap: 8, minWidth: 300 }}>
        <button
          className="boton"
          onClick={() => decidir.mutate({ proyecto_id: p.id, decision: 'pausar' })}
          disabled={decidir.isPending}
        >
          Pausar
        </button>
        <div className="fila" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Fusionar con">
            <option value="">Fusionar con…</option>
            {otros.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
          <button
            className="boton"
            disabled={!destino || decidir.isPending}
            onClick={() =>
              confirm(
                `¿Fusionar «${p.nombre}» en «${nombreDestino}»?\n\n` +
                  `Su value, keys, etiquetas, conexiones y notas pasan a «${nombreDestino}». ` +
                  `«${p.nombre}» queda como terminado, con su «por qué» e historial intactos.`,
              ) && decidir.mutate({ proyecto_id: p.id, decision: 'fusionar', destino_id: Number(destino) })
            }
          >
            Fusionar
          </button>
        </div>
        <button
          className="boton fantasma"
          onClick={() => decidir.mutate({ proyecto_id: p.id, decision: 'mantener' })}
          disabled={decidir.isPending}
          title="No volverá a aparecer hasta acumular otra racha de semanas con poca atención"
        >
          Mantener
        </button>
      </div>
    </section>
  );
}

function SugerenciaFusion({
  f,
  proyectos,
  alDecidir,
}: {
  f: { absorbido: number; destino: number; razon: string };
  proyectos: Proyecto[];
  alDecidir: () => void;
}) {
  const fusionar = useMutacion(api.decidir, alDecidir);
  const absorbido = proyectos.find((p) => p.id === f.absorbido);
  const destino = proyectos.find((p) => p.id === f.destino);
  if (!absorbido || !destino) return null;
  return (
    <li className="pendiente">
      <div>
        <strong>{absorbido.nombre}</strong> <span className="flecha">→</span> <strong>{destino.nombre}</strong>
        <span className="muy-tenue"> · sugerido por IA</span>
      </div>
      <p className="tenue">{f.razon}</p>
      {fusionar.error && <div className="aviso error">{fusionar.error.message}</div>}
      <div className="fila" style={{ marginTop: 6 }}>
        <button
          className="boton chico"
          disabled={fusionar.isPending}
          onClick={() =>
            confirm(
              `¿Fusionar «${absorbido.nombre}» en «${destino.nombre}»?\n\n` +
                `Su value, keys, etiquetas, conexiones y notas pasan a «${destino.nombre}». ` +
                `«${absorbido.nombre}» queda como terminado, con su «por qué» e historial intactos.`,
            ) && fusionar.mutate({ proyecto_id: absorbido.id, decision: 'fusionar', destino_id: destino.id })
          }
        >
          Fusionar
        </button>
        <button className="boton chico fantasma" onClick={alDecidir}>
          Ignorar
        </button>
      </div>
    </li>
  );
}

/** Mapa de las últimas 8 revisiones: de un vistazo, adónde fue tu atención. */
function HistorialAtencion({ proyectos }: { proyectos: Proyecto[] }) {
  const revisiones = useQuery({ queryKey: ['revisiones'], queryFn: api.revisiones });
  const ultimas = (revisiones.data ?? []).slice(0, 8).reverse();
  if (ultimas.length === 0) return null;

  const enAlguna = new Set(ultimas.flatMap((r) => r.reparto.map((i) => i.proyecto_id)));
  const filas = proyectos.filter((p) => enAlguna.has(p.id) || esActivo(p.etapa));

  return (
    <section className="panel" style={{ marginTop: 12 }}>
      <h2>Atención de las últimas {ultimas.length} revisiones</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="tabla mapa-calor">
          <thead>
            <tr>
              <th>Proyecto</th>
              {ultimas.map((r) => (
                <th key={r.semana} style={{ textAlign: 'center' }}>
                  {r.semana.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/proyectos/${p.id}`}>{p.nombre}</Link>
                </td>
                {ultimas.map((r) => {
                  const v = r.reparto.find((i) => i.proyecto_id === p.id)?.porcentaje;
                  return (
                    <td
                      key={r.semana}
                      className="celda"
                      style={{
                        background:
                          v === undefined
                            ? undefined
                            : `color-mix(in srgb, var(--acento) ${Math.round(v * 0.85)}%, var(--superficie))`,
                        color: v !== undefined && v > 55 ? '#fff' : undefined,
                      }}
                    >
                      {v === undefined ? <span className="muy-tenue">—</span> : `${v}%`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
