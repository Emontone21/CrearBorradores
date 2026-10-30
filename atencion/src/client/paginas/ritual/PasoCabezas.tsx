import { Link } from 'react-router';
import { puntuacion } from '../../../shared/atencion.ts';
import type { Cabezas, Pesos, Proyecto } from '../../../shared/tipos.ts';
import { api } from '../../api.ts';
import { Nota1a5 } from '../../componentes/Nota1a5.tsx';
import { useMutacion } from '../../datos.ts';

export function PasoCabezas({ activos, pesos }: { activos: Proyecto[]; pesos: Pesos }) {
  const editar = useMutacion(({ id, c }: { id: number; c: Partial<Cabezas> }) => api.editarProyecto(id, c));

  return (
    <>
      <p className="explicacion">
        Multi-head: mira cada proyecto desde tres perspectivas. <strong>Impacto</strong> (cuánto importa el resultado),{' '}
        <strong>energía</strong> (cuánto te activa trabajar en él) y <strong>urgencia</strong> (cuánto cuesta esperar).
        Pesos actuales: impacto {pesos.impacto} · energía {pesos.energia} · urgencia {pesos.urgencia} (
        <Link to="/ajustes">cambiar</Link>).
      </p>
      {editar.error && <div className="aviso error">{editar.error.message}</div>}
      <section className="panel" style={{ padding: '6px 8px' }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>Impacto</th>
              <th>Energía</th>
              <th>Urgencia</th>
              <th style={{ textAlign: 'right' }}>Puntuación</th>
            </tr>
          </thead>
          <tbody>
            {activos.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.nombre}</strong>
                  <div className="muy-tenue">{p.query}</div>
                </td>
                {(['impacto', 'energia', 'urgencia'] as const).map((cabeza) => (
                  <td key={cabeza}>
                    <Nota1a5
                      etiqueta={`${cabeza} de ${p.nombre}`}
                      valor={p[cabeza]}
                      alCambiar={(v) => editar.mutate({ id: p.id, c: { [cabeza]: v } })}
                    />
                  </td>
                ))}
                <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                  {puntuacion(p, pesos).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
