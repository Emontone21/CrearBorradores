import { T_MAX, T_MIN, type PropuestaReparto } from '../../../shared/atencion.ts';
import type { Proyecto } from '../../../shared/tipos.ts';

interface Props {
  slider: number;
  alCambiar: (s: number) => void;
  temperatura: number;
  activos: Proyecto[];
  propuesta: PropuestaReparto[];
}

export function PasoTemperatura({ slider, alCambiar, temperatura, activos, propuesta }: Props) {
  const nombre = new Map(activos.map((p) => [p.id, p.nombre]));
  const ordenada = [...propuesta].sort((a, b) => b.porcentaje - a.porcentaje);
  const modo = slider < 0.34 ? 'Foco' : slider > 0.66 ? 'Exploración' : 'Equilibrio';

  return (
    <>
      <p className="explicacion">
        La temperatura decide cuán concentrada estará tu atención. Con <strong>T baja</strong> casi todo va al proyecto
        mejor puntuado; con <strong>T alta</strong> se reparte parejo para explorar. Mira cómo cambia la propuesta.
      </p>
      <section className="panel termometro">
        <div className="extremos">
          <span>
            Foco<small>T = {T_MIN}</small>
          </span>
          <span style={{ textAlign: 'right' }}>
            Exploración<small>T = {T_MAX}</small>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={slider}
          aria-label="Temperatura, de foco a exploración"
          onChange={(e) => alCambiar(Number(e.target.value))}
        />
        <p className="valor-t">
          <strong>{modo}</strong> · T = <span className="mono">{temperatura.toFixed(2)}</span>
        </p>

        <div className="vista-previa" aria-label="Vista previa del reparto">
          {ordenada.map((r) => (
            <div key={r.id} className="fila-barra">
              <span>{nombre.get(r.id)}</span>
              <div className="barra">
                <i style={{ width: `${r.porcentaje}%` }} />
              </div>
              <span className="mono" style={{ textAlign: 'right' }}>
                {r.porcentaje}%
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
