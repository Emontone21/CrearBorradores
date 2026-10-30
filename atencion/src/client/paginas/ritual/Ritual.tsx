import { useState } from 'react';
import { Link } from 'react-router';
import {
  PESOS_IGUALES,
  proponerReparto,
  sliderDesdeTemperatura,
  temperaturaDesdeSlider,
} from '../../../shared/atencion.ts';
import { etiquetaSemana, semanaISO } from '../../../shared/semanas.ts';
import { esActivo } from '../../../shared/tipos.ts';
import { useAjustes, useAtencionSemana, useProyectos } from '../../datos.ts';
import { PasoActualizar } from './PasoActualizar.tsx';
import { PasoCabezas } from './PasoCabezas.tsx';
import { PasoMatriz } from './PasoMatriz.tsx';
import { PasoReparto } from './PasoReparto.tsx';
import { PasoTemperatura } from './PasoTemperatura.tsx';

const PASOS = [
  { titulo: 'Actualizar', detalle: 'Qué cambió' },
  { titulo: 'Self-attention', detalle: 'Query × keys' },
  { titulo: 'Multi-head', detalle: 'Tres cabezas' },
  { titulo: 'Temperatura', detalle: 'Foco ↔ exploración' },
  { titulo: 'Softmax', detalle: 'Repartir el 100 %' },
];

export function Ritual() {
  const semana = semanaISO();
  const proyectos = useProyectos();
  const ajustes = useAjustes();
  const atencion = useAtencionSemana();
  const [paso, setPaso] = useState(0);
  const [visitados, setVisitados] = useState(new Set([0]));
  const [slider, setSlider] = useState<number | null>(null);

  const activos = (proyectos.data ?? []).filter((p) => esActivo(p.etapa));
  const pesos = ajustes.data?.pesos ?? PESOS_IGUALES;
  const revisionSemana = atencion.esDeEstaSemana ? atencion.revision : null;
  // Si ya hiciste el ritual esta semana, se parte de la temperatura que elegiste; si no, del centro.
  const valorSlider = slider ?? (revisionSemana ? sliderDesdeTemperatura(revisionSemana.temperatura) : 0.5);
  const temperatura = temperaturaDesdeSlider(valorSlider);
  const propuesta = proponerReparto(activos, pesos, temperatura);

  const ir = (n: number) => {
    setPaso(n);
    setVisitados((v) => new Set(v).add(n));
    window.scrollTo({ top: 0 });
  };

  if (proyectos.isLoading || ajustes.isLoading || atencion.cargando) return <div className="cargando">Cargando…</div>;

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Ritual semanal</h1>
          <p className="subtitulo">
            {etiquetaSemana(semana)} · una pasada por todas las capas
            {revisionSemana && ' · ya guardaste una revisión esta semana; si guardas otra, la reemplaza'}
          </p>
        </div>
      </div>

      {activos.length === 0 ? (
        <div className="vacio">
          No hay proyectos activos (idea, explorando o construyendo). <Link to="/">Crea uno en el tablero</Link>.
        </div>
      ) : (
        <>
          <nav className="pasos" aria-label="Pasos del ritual">
            {PASOS.map((p, i) => (
              <button
                key={p.titulo}
                className={`${i === paso ? 'actual' : ''} ${visitados.has(i) && i !== paso ? 'hecho' : ''}`}
                aria-current={i === paso ? 'step' : undefined}
                onClick={() => ir(i)}
              >
                <span className="num">
                  <span>{i + 1}</span>
                </span>
                <span>
                  <strong>{p.titulo}</strong>
                  <small>{p.detalle}</small>
                </span>
              </button>
            ))}
          </nav>

          {paso === 0 && <PasoActualizar activos={activos} />}
          {paso === 1 && <PasoMatriz proyectos={proyectos.data ?? []} activos={activos} />}
          {paso === 2 && <PasoCabezas activos={activos} pesos={pesos} />}
          {paso === 3 && (
            <PasoTemperatura
              slider={valorSlider}
              alCambiar={setSlider}
              temperatura={temperatura}
              activos={activos}
              propuesta={propuesta}
            />
          )}
          {paso === 4 && (
            <PasoReparto
              semana={semana}
              activos={activos}
              propuesta={propuesta}
              temperatura={temperatura}
              revisionPrevia={revisionSemana}
            />
          )}

          <div className="navegacion-pasos">
            <button className="boton" disabled={paso === 0} onClick={() => ir(paso - 1)}>
              ← Anterior
            </button>
            {paso < PASOS.length - 1 && (
              <button className="boton primario" onClick={() => ir(paso + 1)}>
                Siguiente: {PASOS[paso + 1].titulo} →
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
