import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { esActivo, type Captura, type Proyecto } from '../../shared/tipos.ts';
import { api } from '../api.ts';
import { FormularioProyecto } from '../componentes/FormularioProyecto.tsx';
import { PanelConexiones } from '../componentes/PanelConexiones.tsx';
import { PanelNotas } from '../componentes/PanelNotas.tsx';
import { TarjetaProyecto } from '../componentes/TarjetaProyecto.tsx';
import { useAtencionSemana, useFicha, useMutacion, useProyectos } from '../datos.ts';
import { hace } from '../util.ts';

type Modo = 'procesar' | 'producir';

function leerModo(): Modo {
  try {
    return localStorage.getItem('hoy.modo') === 'producir' ? 'producir' : 'procesar';
  } catch {
    return 'procesar';
  }
}

export function Hoy() {
  const [modo, setModoEstado] = useState<Modo>(leerModo);
  const setModo = (m: Modo) => {
    setModoEstado(m);
    try {
      localStorage.setItem('hoy.modo', m);
    } catch {
      // sin almacenamiento local: el modo simplemente no se recuerda
    }
  };

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Hoy</h1>
          <p className="subtitulo">
            {modo === 'procesar'
              ? 'Encoder: absorber información. Captura ideas y ordena la bandeja.'
              : 'Decoder: producir. Un proyecto delante, todo lo demás al costado.'}
          </p>
        </div>
        <div className="modos" role="tablist" aria-label="Modo">
          <button role="tab" aria-selected={modo === 'procesar'} className={modo === 'procesar' ? 'activo' : ''} onClick={() => setModo('procesar')}>
            Procesar
            <small>capturar y ordenar</small>
          </button>
          <button role="tab" aria-selected={modo === 'producir'} className={modo === 'producir' ? 'activo' : ''} onClick={() => setModo('producir')}>
            Producir
            <small>trabajar en uno</small>
          </button>
        </div>
      </div>
      {modo === 'procesar' ? <Procesar /> : <Producir />}
    </>
  );
}

function Procesar() {
  const [texto, setTexto] = useState('');
  const bandeja = useQuery({ queryKey: ['bandeja'], queryFn: api.bandeja });
  const proyectos = useProyectos();
  const capturar = useMutacion(() => api.crearCaptura({ texto }), () => setTexto(''));
  const asignables = (proyectos.data ?? []).filter((p) => p.etapa !== 'terminado');

  return (
    <div className="rejilla-ficha">
      <div className="pila" style={{ gap: 20 }}>
        <section className="panel captura-rapida">
          <h2>Captura rápida</h2>
          <textarea
            autoFocus
            placeholder="Lo que se te ocurra. Enter para guardar, Shift+Enter para otra línea."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (texto.trim()) capturar.mutate(undefined);
              }
            }}
          />
          {capturar.error && <div className="aviso error">{capturar.error.message}</div>}
          <div style={{ marginTop: 10 }}>
            <button className="boton primario" disabled={!texto.trim() || capturar.isPending} onClick={() => capturar.mutate(undefined)}>
              Guardar en la bandeja
            </button>
          </div>
        </section>

        <section>
          <div className="fila separar" style={{ marginBottom: 12 }}>
            <h2>Bandeja de entrada</h2>
            <span className="muy-tenue">{bandeja.data?.length ?? 0} sin asignar</span>
          </div>
          {bandeja.isLoading ? (
            <div className="cargando">Cargando…</div>
          ) : (bandeja.data ?? []).length === 0 ? (
            <div className="vacio">Bandeja vacía. Todo tiene su lugar.</div>
          ) : (
            <ul className="bandeja">
              {bandeja.data!.map((c) => (
                <ItemBandeja key={c.id} captura={c} proyectos={asignables} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="panel">
        <h2>Cómo usar la bandeja</h2>
        <div className="pila tenue" style={{ fontSize: '0.92rem' }}>
          <p>Captura sin pensar dónde va. Después, en una pasada, decide para cada idea:</p>
          <p>
            <strong>Asignar</strong> a un proyecto: pasa a ser una nota suya y la verás al producir.
          </p>
          <p>
            <strong>Nuevo proyecto</strong> si la idea merece su propio token.
          </p>
          <p>
            <strong>Archivar</strong> si ya no aporta.
          </p>
        </div>
      </aside>
    </div>
  );
}

function ItemBandeja({ captura, proyectos }: { captura: Captura; proyectos: Proyecto[] }) {
  const [destino, setDestino] = useState('');
  const [creando, setCreando] = useState(false);
  const asignar = useMutacion((proyecto_id: number) => api.cambiarCaptura(captura.id, { proyecto_id }));
  const archivar = useMutacion(() => api.cambiarCaptura(captura.id, { archivada: true }));
  const borrar = useMutacion(() => api.borrarCaptura(captura.id));
  const primeraLinea = captura.texto.split('\n')[0].slice(0, 80);

  return (
    <li>
      <p className="texto-pre">{captura.texto}</p>
      <div className="fila separar">
        <span className="muy-tenue">{hace(captura.creado_en)}</span>
        <div className="fila" style={{ gap: 6 }}>
          <select
            style={{ width: 220 }}
            value={destino}
            aria-label="Asignar a proyecto"
            onChange={(e) => setDestino(e.target.value)}
          >
            <option value="">Asignar a…</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <button className="boton chico" disabled={!destino || asignar.isPending} onClick={() => asignar.mutate(Number(destino))}>
            Asignar
          </button>
          <button className="boton chico" onClick={() => setCreando(true)}>
            Nuevo proyecto
          </button>
          <button className="boton chico fantasma" onClick={() => archivar.mutate(undefined)}>
            Archivar
          </button>
          <button
            className="boton chico fantasma peligro"
            aria-label="Borrar captura"
            onClick={() => confirm('¿Borrar esta captura?') && borrar.mutate(undefined)}
          >
            ×
          </button>
        </div>
      </div>
      {creando && (
        <FormularioProyecto
          abierto
          inicial={{ nombre: primeraLinea, query: captura.texto }}
          alCerrar={() => setCreando(false)}
          alCrear={(id) => asignar.mutate(id)}
        />
      )}
    </li>
  );
}

function Producir() {
  const proyectos = useProyectos();
  const atencion = useAtencionSemana();
  const [elegido, setElegido] = useState<number | null>(null);

  const activos = (proyectos.data ?? []).filter((p) => esActivo(p.etapa));
  // Por defecto, el proyecto con más atención esta semana.
  const porDefecto = [...activos].sort(
    (a, b) => (atencion.porcentajeDe(b.id) ?? -1) - (atencion.porcentajeDe(a.id) ?? -1),
  )[0];
  const id = elegido ?? porDefecto?.id ?? null;

  if (proyectos.isLoading || atencion.cargando) return <div className="cargando">Cargando…</div>;
  if (!id) return <div className="vacio">No hay proyectos activos para producir.</div>;

  return (
    <>
      <div className="fila" style={{ marginBottom: 16 }}>
        <span className="etiqueta-campo">Trabajando en</span>
        <select style={{ width: 320 }} value={id} onChange={(e) => setElegido(Number(e.target.value))}>
          {activos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {atencion.porcentajeDe(p.id) !== null ? ` · ${atencion.porcentajeDe(p.id)}%` : ''}
            </option>
          ))}
        </select>
      </div>
      <EspacioProducir key={id} id={id} proyectos={proyectos.data ?? []} porcentaje={atencion.porcentajeDe(id)} />
    </>
  );
}

function EspacioProducir({ id, proyectos, porcentaje }: { id: number; proyectos: Proyecto[]; porcentaje: number | null }) {
  const ficha = useFicha(id);
  if (ficha.isLoading) return <div className="cargando">Cargando…</div>;
  if (!ficha.data) return <div className="aviso error">{ficha.error?.message ?? 'Proyecto no encontrado'}</div>;
  const p = ficha.data;

  return (
    <div className="rejilla-producir">
      <div className="pila" style={{ gap: 16 }}>
        <TarjetaProyecto proyecto={p} porcentaje={porcentaje} enlace={false} />
        <section className="panel">
          <h3 style={{ marginBottom: 8 }}>Value · ya hecho</h3>
          {p.value ? <p className="texto-pre">{p.value}</p> : <p className="muy-tenue">Nada registrado todavía.</p>}
        </section>
        <Link to={`/proyectos/${p.id}`} className="boton">
          Abrir ficha completa
        </Link>
      </div>
      <section className="panel">
        <h2>Notas</h2>
        <PanelNotas proyectoId={p.id} notas={p.notas} />
      </section>
      <section className="panel">
        <h2>Conexiones</h2>
        <PanelConexiones
          proyecto={p}
          conexiones={p.conexiones}
          otros={proyectos.filter((o) => o.id !== p.id)}
          compacto
        />
      </section>
    </div>
  );
}
