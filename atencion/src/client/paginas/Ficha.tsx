import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ETAPAS, NOMBRE_ETAPA, esActivo, type Etapa, type FichaProyecto } from '../../shared/tipos.ts';
import { api } from '../api.ts';
import { BarraAtencion } from '../componentes/BarraAtencion.tsx';
import { EditorEtiquetas } from '../componentes/EditorEtiquetas.tsx';
import { LineaTiempo } from '../componentes/LineaTiempo.tsx';
import { Modal } from '../componentes/Modal.tsx';
import { Nota1a5 } from '../componentes/Nota1a5.tsx';
import { PanelConexiones } from '../componentes/PanelConexiones.tsx';
import { PanelNotas } from '../componentes/PanelNotas.tsx';
import { useAtencionSemana, useEtiquetas, useFicha, useMutacion, useProyectos } from '../datos.ts';
import { estiloEtapa, fechaCorta, hace } from '../util.ts';

export function Ficha() {
  const id = Number(useParams().id);
  const ficha = useFicha(id);

  if (ficha.isLoading) return <div className="cargando">Cargando…</div>;
  if (ficha.error || !ficha.data) {
    return (
      <div className="pila">
        <div className="aviso error">{ficha.error?.message ?? 'Proyecto no encontrado'}</div>
        <Link to="/">← Volver al tablero</Link>
      </div>
    );
  }
  return <ContenidoFicha key={id} p={ficha.data} />;
}

function ContenidoFicha({ p }: { p: FichaProyecto }) {
  const navegar = useNavigate();
  const proyectos = useProyectos();
  const etiquetas = useEtiquetas();
  const atencion = useAtencionSemana();
  const [editandoPorque, setEditandoPorque] = useState(false);

  const editar = useMutacion((c: Parameters<typeof api.editarProyecto>[1]) => api.editarProyecto(p.id, c));
  const borrar = useMutacion(() => api.borrarProyecto(p.id), () => navegar('/'));

  const otros = (proyectos.data ?? []).filter((o) => o.id !== p.id);
  const porcentaje = atencion.porcentajeDe(p.id);

  return (
    <>
      <div className="franja-porque">
        <p className="texto">{p.porque}</p>
        <button className="boton chico" onClick={() => setEditandoPorque(true)}>
          Editar intención
        </button>
      </div>

      <div className="cabecera">
        <div className="pila" style={{ gap: 6 }}>
          <Link to="/" className="muy-tenue">
            ← Tablero
          </Link>
          <Nombre nombre={p.nombre} alGuardar={(nombre) => editar.mutate({ nombre })} />
          <p className="muy-tenue">
            Creado el {fechaCorta(p.creado_en)} · actualizado {hace(p.actualizado_en)}
            {p.ejemplo && ' · proyecto de ejemplo'}
          </p>
        </div>
        <div className="fila">
          <select
            aria-label="Etapa"
            style={{ ...estiloEtapa(p.etapa), width: 'auto', fontWeight: 600, color: 'var(--color-etapa)' }}
            value={p.etapa}
            onChange={(e) => editar.mutate({ etapa: e.target.value as Etapa })}
          >
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {NOMBRE_ETAPA[e]}
              </option>
            ))}
          </select>
          <button
            className="boton peligro"
            onClick={() =>
              confirm(`¿Borrar «${p.nombre}» con todo su historial y conexiones? No se puede deshacer.`) &&
              borrar.mutate(undefined)
            }
          >
            Borrar
          </button>
        </div>
      </div>

      {editar.error && <div className="aviso error" style={{ marginBottom: 16 }}>{editar.error.message}</div>}

      <div className="rejilla-ficha">
        <div className="pila" style={{ gap: 20 }}>
          <PanelQuery p={p} />

          <section className="panel">
            <h2>Keys · lo que puede aportar</h2>
            <div className="pila">
              <EditorEtiquetas
                etiquetas={p.etiquetas}
                sugerencias={etiquetas.data}
                alCambiar={(e) => editar.mutate({ etiquetas: e })}
              />
              <TextoEditable
                valor={p.keys_texto}
                vacio="Describe habilidades, contactos, código o contenido que otros proyectos podrían usar."
                alGuardar={(keys_texto) => editar.mutate({ keys_texto })}
              />
            </div>
          </section>

          <section className="panel">
            <h2>Value · lo que ya está hecho</h2>
            <TextoEditable
              valor={p.value}
              vacio="Aún no hay nada concreto registrado."
              alGuardar={(value) => editar.mutate({ value })}
            />
          </section>

          <section className="panel">
            <h2>Historial</h2>
            <LineaTiempo actualizaciones={p.actualizaciones} />
          </section>
        </div>

        <div className="pila" style={{ gap: 20 }}>
          <section className="panel">
            <h2>Atención</h2>
            {esActivo(p.etapa) ? (
              <>
                <BarraAtencion porcentaje={porcentaje} />
                <p className="muy-tenue" style={{ marginTop: 6 }}>
                  {porcentaje === null
                    ? 'Sin reparto todavía. Se asigna en el ritual semanal.'
                    : atencion.esDeEstaSemana
                      ? 'Reparto de esta semana.'
                      : `Reparto de la última revisión (${atencion.revision?.semana}).`}
                </p>
              </>
            ) : (
              <p className="tenue">Los proyectos pausados o terminados no entran en el reparto.</p>
            )}
            <h3 style={{ margin: '18px 0 10px' }}>Cabezas</h3>
            <div className="cabezas">
              <span className="etiqueta-campo">Impacto</span>
              <Nota1a5 etiqueta="Impacto" valor={p.impacto} alCambiar={(impacto) => editar.mutate({ impacto })} />
              <span className="etiqueta-campo">Energía</span>
              <Nota1a5 etiqueta="Energía" valor={p.energia} alCambiar={(energia) => editar.mutate({ energia })} />
              <span className="etiqueta-campo">Urgencia</span>
              <Nota1a5 etiqueta="Urgencia" valor={p.urgencia} alCambiar={(urgencia) => editar.mutate({ urgencia })} />
            </div>
          </section>

          <section className="panel">
            <h2>Conexiones</h2>
            <PanelConexiones proyecto={p} conexiones={p.conexiones} otros={otros} />
          </section>

          <section className="panel">
            <h2>Notas</h2>
            <PanelNotas proyectoId={p.id} notas={p.notas} />
          </section>
        </div>
      </div>

      <EditarPorque p={p} abierto={editandoPorque} alCerrar={() => setEditandoPorque(false)} />
    </>
  );
}

function Nombre({ nombre, alGuardar }: { nombre: string; alGuardar: (n: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nombre);
  if (!editando) {
    return (
      <h1 onDoubleClick={() => setEditando(true)} title="Doble clic para renombrar">
        {nombre}{' '}
        <button className="boton chico fantasma" onClick={() => setEditando(true)} aria-label="Renombrar">
          ✎
        </button>
      </h1>
    );
  }
  const guardar = () => {
    if (texto.trim() && texto.trim() !== nombre) alGuardar(texto.trim());
    setEditando(false);
  };
  return (
    <input
      autoFocus
      style={{ fontSize: '1.4rem', fontWeight: 650, maxWidth: 520 }}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') guardar();
        if (e.key === 'Escape') {
          setTexto(nombre);
          setEditando(false);
        }
      }}
    />
  );
}

function TextoEditable({ valor, vacio, alGuardar }: { valor: string; vacio: string; alGuardar: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  if (!editando) {
    return (
      <div className="pila" style={{ gap: 8 }}>
        {valor ? <p className="texto-pre">{valor}</p> : <p className="muy-tenue">{vacio}</p>}
        <div>
          <button
            className="boton chico"
            onClick={() => {
              setTexto(valor);
              setEditando(true);
            }}
          >
            Editar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="pila" style={{ gap: 8 }}>
      <textarea autoFocus rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div className="fila">
        <button
          className="boton primario chico"
          onClick={() => {
            alGuardar(texto);
            setEditando(false);
          }}
        >
          Guardar
        </button>
        <button className="boton chico" onClick={() => setEditando(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** El query solo cambia registrando una actualización: el anterior queda en el historial. */
function PanelQuery({ p }: { p: FichaProyecto }) {
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [query, setQuery] = useState(p.query);
  const registrar = useMutacion(
    () => api.registrarActualizacion(p.id, { descripcion, query_nuevo: query }),
    () => {
      setDescripcion('');
      setAbierto(false);
    },
  );

  return (
    <section className="panel">
      <div className="fila separar">
        <h2>Query · lo que necesita ahora</h2>
        {!abierto && (
          <button
            className="boton chico"
            onClick={() => {
              setQuery(p.query);
              setAbierto(true);
            }}
          >
            Registrar actualización
          </button>
        )}
      </div>
      {p.query ? <p className="query-grande">{p.query}</p> : <p className="muy-tenue">Sin query definido.</p>}
      {abierto && (
        <div className="pila" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--borde)' }}>
          <label className="campo">
            <span>¿Qué cambió?</span>
            <textarea
              autoFocus
              rows={3}
              placeholder="Solo el cambio, sin reescribir el proyecto"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </label>
          <label className="campo">
            <span>Nuevo query</span>
            <textarea rows={2} value={query} onChange={(e) => setQuery(e.target.value)} />
            <small>Déjalo igual si sigue siendo la misma pregunta.</small>
          </label>
          {registrar.error && <div className="aviso error">{registrar.error.message}</div>}
          <div className="fila">
            <button
              className="boton primario"
              disabled={!descripcion.trim() || registrar.isPending}
              onClick={() => registrar.mutate(undefined)}
            >
              Guardar actualización
            </button>
            <button className="boton" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function EditarPorque({ p, abierto, alCerrar }: { p: FichaProyecto; abierto: boolean; alCerrar: () => void }) {
  const [porque, setPorque] = useState(p.porque);
  const [motivo, setMotivo] = useState('');
  const guardar = useMutacion(() => api.cambiarPorque(p.id, { porque, motivo }), () => {
    setMotivo('');
    alCerrar();
  });
  const cambia = porque.trim() && porque.trim() !== p.porque;

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Editar la intención original"
      pie={
        <>
          <button className="boton" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            className="boton primario"
            disabled={!cambia || !motivo.trim() || guardar.isPending}
            onClick={() => guardar.mutate(undefined)}
          >
            Cambiar intención
          </button>
        </>
      }
    >
      <div className="aviso">
        El «por qué» es la conexión residual del proyecto: cambiarlo es una decisión explícita. El texto actual queda
        guardado en el historial.
      </div>
      <div className="campo">
        <span>Actual</span>
        <p className="tenue" style={{ fontFamily: 'var(--fuente-serif)', fontStyle: 'italic' }}>
          {p.porque}
        </p>
      </div>
      <label className="campo">
        <span>Nuevo por qué</span>
        <input value={porque} maxLength={500} onChange={(e) => setPorque(e.target.value)} />
      </label>
      <label className="campo">
        <span>¿Por qué cambia?</span>
        <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {guardar.error && <div className="aviso error">{guardar.error.message}</div>}
    </Modal>
  );
}
