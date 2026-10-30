import type { Actualizacion } from '../../shared/tipos.ts';
import { fechaHora } from '../util.ts';

const TITULO: Record<Actualizacion['tipo'], string> = {
  creacion: 'Inicio',
  avance: 'Actualización',
  porque: 'Cambio de intención',
  etapa: 'Cambio de etapa',
  fusion: 'Fusión',
};

export function LineaTiempo({ actualizaciones }: { actualizaciones: Actualizacion[] }) {
  if (actualizaciones.length === 0) return <div className="vacio">Sin historial todavía.</div>;
  return (
    <ol className="linea-tiempo">
      {actualizaciones.map((a) => (
        <li key={a.id} className={a.tipo}>
          <div className="fila separar">
            <strong>{TITULO[a.tipo]}</strong>
            <span className="fecha">{fechaHora(a.fecha)}</span>
          </div>
          {a.descripcion && a.tipo !== 'creacion' && <p className="texto-pre">{a.descripcion}</p>}
          {a.tipo === 'creacion' && (
            <dl className="cambio-query">
              <dt>Por qué</dt>
              <dd>{a.porque_nuevo}</dd>
              {a.query_nuevo && (
                <>
                  <dt>Query</dt>
                  <dd>{a.query_nuevo}</dd>
                </>
              )}
            </dl>
          )}
          {a.tipo === 'avance' && (
            <dl className="cambio-query">
              {a.query_anterior === a.query_nuevo ? (
                <>
                  <dt>Query</dt>
                  <dd className="muy-tenue">sin cambios</dd>
                </>
              ) : (
                <>
                  <dt>Antes</dt>
                  <dd className="anterior">{a.query_anterior || '—'}</dd>
                  <dt>Ahora</dt>
                  <dd>{a.query_nuevo || '—'}</dd>
                </>
              )}
            </dl>
          )}
          {a.tipo === 'porque' && (
            <dl className="cambio-query">
              <dt>Antes</dt>
              <dd className="anterior">{a.porque_anterior}</dd>
              <dt>Ahora</dt>
              <dd>{a.porque_nuevo}</dd>
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}
