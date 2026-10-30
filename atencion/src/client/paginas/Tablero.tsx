import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { etiquetaSemana } from '../../shared/semanas.ts';
import { ETAPAS, NOMBRE_ETAPA, type Etapa, type Proyecto } from '../../shared/tipos.ts';
import { FormularioProyecto } from '../componentes/FormularioProyecto.tsx';
import { TarjetaProyecto } from '../componentes/TarjetaProyecto.tsx';
import { useAtencionSemana, useProyectos } from '../datos.ts';
import { estiloEtapa, normalizar } from '../util.ts';

function coincide(p: Proyecto, busqueda: string): boolean {
  if (!busqueda) return true;
  const texto = normalizar([p.nombre, p.porque, p.query, p.keys_texto, p.value, ...p.etiquetas].join(' '));
  return normalizar(busqueda)
    .split(/\s+/)
    .every((palabra) => texto.includes(palabra));
}

export function Tablero() {
  const proyectos = useProyectos();
  const atencion = useAtencionSemana();
  const navegar = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [etapasVisibles, setEtapasVisibles] = useState<Set<Etapa>>(
    new Set(['idea', 'explorando', 'construyendo', 'pausado']),
  );
  const [etiqueta, setEtiqueta] = useState('');
  const [creando, setCreando] = useState(false);

  const todas = proyectos.data ?? [];
  const etiquetasDisponibles = useMemo(() => [...new Set(todas.flatMap((p) => p.etiquetas))].sort(), [todas]);
  const filtrados = todas.filter((p) => coincide(p, busqueda) && (!etiqueta || p.etiquetas.includes(etiqueta)));

  // Dentro de cada columna, primero los que más atención tienen.
  const ordenar = (lista: Proyecto[]) =>
    [...lista].sort((a, b) => (atencion.porcentajeDe(b.id) ?? -1) - (atencion.porcentajeDe(a.id) ?? -1));

  const alternarEtapa = (e: Etapa) =>
    setEtapasVisibles((s) => {
      const n = new Set(s);
      if (n.has(e)) n.delete(e);
      else n.add(e);
      return n;
    });

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Tablero</h1>
          <p className="subtitulo">
            {atencion.revision ? (
              atencion.esDeEstaSemana ? (
                <>Atención de esta semana · {etiquetaSemana(atencion.revision.semana)}</>
              ) : (
                <>
                  Mostrando la última revisión ({etiquetaSemana(atencion.revision.semana)}).{' '}
                  <Link to="/ritual">Haz el ritual de esta semana →</Link>
                </>
              )
            ) : (
              <>
                Aún no repartiste tu atención. <Link to="/ritual">Empieza el ritual semanal →</Link>
              </>
            )}
          </p>
        </div>
        <button className="boton primario" onClick={() => setCreando(true)}>
          + Nuevo proyecto
        </button>
      </div>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar en nombre, por qué, query, keys…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div className="fila" style={{ gap: 6 }}>
          {ETAPAS.map((e) => (
            <button
              key={e}
              className={`chip${etapasVisibles.has(e) ? ' activo' : ''}`}
              aria-pressed={etapasVisibles.has(e)}
              onClick={() => alternarEtapa(e)}
            >
              {NOMBRE_ETAPA[e]}
            </button>
          ))}
        </div>
        {etiquetasDisponibles.length > 0 && (
          <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
            <option value="">Todas las etiquetas</option>
            {etiquetasDisponibles.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        )}
      </div>

      {proyectos.isLoading ? (
        <div className="cargando">Cargando…</div>
      ) : proyectos.error ? (
        <div className="aviso error">{proyectos.error.message}</div>
      ) : todas.length === 0 ? (
        <div className="vacio">
          <p>Todavía no hay proyectos. Cada proyecto es un «token»: créalo con su intención original.</p>
          <p style={{ marginTop: 12 }}>
            <button className="boton primario" onClick={() => setCreando(true)}>
              Crear el primero
            </button>
          </p>
        </div>
      ) : (
        <div className="columnas">
          {ETAPAS.filter((e) => etapasVisibles.has(e)).map((e) => {
            const enEtapa = ordenar(filtrados.filter((p) => p.etapa === e));
            return (
              <section key={e} className="columna" style={estiloEtapa(e)}>
                <header>
                  <span className="etapa">{NOMBRE_ETAPA[e]}</span>
                  <span className="cuenta">{enEtapa.length}</span>
                </header>
                {enEtapa.map((p) => (
                  <TarjetaProyecto
                    key={p.id}
                    proyecto={p}
                    porcentaje={atencion.porcentajeDe(p.id)}
                    semana={atencion.revision?.semana}
                  />
                ))}
                {enEtapa.length === 0 && <p className="muy-tenue" style={{ padding: '4px' }}>Nada aquí.</p>}
              </section>
            );
          })}
        </div>
      )}

      <FormularioProyecto
        abierto={creando}
        alCerrar={() => setCreando(false)}
        alCrear={(id) => navegar(`/proyectos/${id}`)}
      />
    </>
  );
}
