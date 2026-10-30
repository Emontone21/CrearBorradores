import { useState } from 'react';
import { Link } from 'react-router';
import { reajustar, repartirEnteros, suma, type PropuestaReparto } from '../../../shared/atencion.ts';
import type { Proyecto, Revision } from '../../../shared/tipos.ts';
import { api } from '../../api.ts';
import { useMutacion } from '../../datos.ts';

interface Props {
  semana: string;
  activos: Proyecto[];
  propuesta: PropuestaReparto[];
  temperatura: number;
  revisionPrevia: Revision | null;
}

export function PasoReparto({ semana, activos, propuesta, temperatura, revisionPrevia }: Props) {
  // Los ajustes manuales se descartan si cambia la propuesta (otra temperatura, otras puntuaciones).
  const firma = propuesta.map((p) => `${p.id}:${p.porcentaje}`).join(',');
  const [ajuste, setAjuste] = useState<{ firma: string; valores: number[] } | null>(null);
  const [notas, setNotas] = useState(revisionPrevia?.notas ?? '');
  const [guardada, setGuardada] = useState(false);

  const valores = ajuste?.firma === firma ? ajuste.valores : propuesta.map((p) => p.porcentaje);
  const nombre = new Map(activos.map((p) => [p.id, p.nombre]));

  const mover = (i: number, v: number) => {
    setAjuste({ firma, valores: reajustar(valores, i, v) });
    setGuardada(false);
  };

  const guardar = useMutacion(
    () =>
      api.guardarRevision(semana, {
        temperatura,
        notas,
        reparto: propuesta.map((p, i) => ({
          proyecto_id: p.id,
          porcentaje: valores[i],
          propuesto: p.porcentaje,
          puntuacion: Math.round(p.puntuacion * 100) / 100,
        })),
      }),
    () => setGuardada(true),
  );

  const cargarPrevia = () => {
    if (!revisionPrevia) return;
    const previos = new Map(revisionPrevia.reparto.map((r) => [r.proyecto_id, r.porcentaje]));
    const base = propuesta.map((p) => previos.get(p.id) ?? 0);
    // Si cambió la lista de proyectos, se reescala en proporción para volver a sumar 100.
    setAjuste({ firma, valores: suma(base) === 100 ? base : repartirEnteros(base, 100) });
  };

  return (
    <>
      <p className="explicacion">
        Softmax: la app propone un reparto a partir de las puntuaciones y la temperatura. Ajústalo con los sliders; el
        total siempre es 100 % porque la atención es un presupuesto. Al mover uno, los demás se reajustan en proporción.
      </p>

      <section className="panel">
        <div className="reparto">
          <div className="fila-reparto encabezado">
            <span>Proyecto</span>
            <span style={{ textAlign: 'right' }}>Puntos</span>
            <span style={{ textAlign: 'right' }}>Propuesto</span>
            <span>Tu reparto</span>
            <span style={{ textAlign: 'right' }}>%</span>
          </div>
          {propuesta.map((p, i) => (
            <div key={p.id} className="fila-reparto">
              <strong>{nombre.get(p.id)}</strong>
              <span className="mono tenue" style={{ textAlign: 'right' }}>
                {p.puntuacion.toFixed(2)}
              </span>
              <span className="mono tenue" style={{ textAlign: 'right' }}>
                {p.porcentaje}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={valores[i]}
                aria-label={`Atención para ${nombre.get(p.id)}`}
                onChange={(e) => mover(i, Number(e.target.value))}
              />
              <input
                type="number"
                min={0}
                max={100}
                value={valores[i]}
                aria-label={`Porcentaje para ${nombre.get(p.id)}`}
                onChange={(e) => mover(i, Number(e.target.value))}
              />
            </div>
          ))}
          <div className="total">
            <span>Total</span>
            <span className="mono">{suma(valores)}%</span>
          </div>
        </div>
        <div className="fila" style={{ marginTop: 12 }}>
          <button className="boton chico" onClick={() => setAjuste(null)}>
            Volver a la propuesta
          </button>
          {revisionPrevia && (
            <button className="boton chico" onClick={cargarPrevia}>
              Cargar el reparto guardado esta semana
            </button>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <label className="campo">
          <span>Notas de la semana</span>
          <textarea
            rows={3}
            placeholder="Qué decidiste y por qué, qué vas a dejar de lado…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </label>
        {guardar.error && (
          <div className="aviso error" style={{ marginTop: 12 }}>
            {guardar.error.message}
          </div>
        )}
        {guardada ? (
          <div className="aviso ok" style={{ marginTop: 12 }}>
            ✓ Revisión de la semana guardada. <Link to="/">Ver el tablero</Link> · <Link to="/hoy">Ir a Hoy</Link>
          </div>
        ) : (
          <div className="fila" style={{ marginTop: 12 }}>
            <button
              className="boton primario"
              disabled={guardar.isPending || suma(valores) !== 100}
              onClick={() => {
                if (!revisionPrevia || confirm('Ya hay una revisión guardada esta semana. ¿Reemplazarla?')) {
                  guardar.mutate(undefined);
                }
              }}
            >
              Guardar revisión
            </button>
            <span className="muy-tenue">Temperatura {temperatura.toFixed(2)}</span>
          </div>
        )}
      </section>
    </>
  );
}
