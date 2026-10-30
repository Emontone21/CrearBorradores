import { useState } from 'react';
import { Link } from 'react-router';
import type { Conexion, Proyecto } from '../../shared/tipos.ts';
import { api } from '../api.ts';
import { useMutacion } from '../datos.ts';

interface Props {
  proyecto: Proyecto;
  conexiones: Conexion[];
  otros: Proyecto[];
  compacto?: boolean;
}

/** Conexiones de un proyecto: lo que aporta a otros y lo que recibe de otros. */
export function PanelConexiones({ proyecto, conexiones, otros, compacto }: Props) {
  const [nueva, setNueva] = useState({ otro: '', sentido: 'recibe' as 'aporta' | 'recibe', descripcion: '' });
  const crear = useMutacion(api.crearConexion, () => setNueva({ otro: '', sentido: 'recibe', descripcion: '' }));
  const cambiar = useMutacion(({ id, estado }: { id: number; estado: Conexion['estado'] }) =>
    api.cambiarConexion(id, { estado }),
  );
  const borrar = useMutacion(api.borrarConexion);

  const visibles = compacto ? conexiones.filter((c) => c.estado !== 'descartada') : conexiones;

  const enviar = () => {
    const otro = Number(nueva.otro);
    if (!otro) return;
    crear.mutate(
      nueva.sentido === 'aporta'
        ? { origen_id: proyecto.id, destino_id: otro, descripcion: nueva.descripcion }
        : { origen_id: otro, destino_id: proyecto.id, descripcion: nueva.descripcion },
    );
  };

  return (
    <div className="pila">
      {visibles.length === 0 ? (
        <div className="vacio">Sin conexiones todavía.</div>
      ) : (
        <ul className="lista-conexiones">
          {visibles.map((c) => {
            const aporta = c.origen_id === proyecto.id;
            const otroId = aporta ? c.destino_id : c.origen_id;
            const otroNombre = aporta ? c.destino_nombre : c.origen_nombre;
            return (
              <li key={c.id} className={c.estado}>
                <div className="fila separar">
                  <span>
                    {aporta ? 'Aporta a ' : 'Recibe de '}
                    <Link to={`/proyectos/${otroId}`}>
                      <strong>{otroNombre}</strong>
                    </Link>
                  </span>
                  <span className="muy-tenue">
                    {c.fuente === 'ia' ? 'IA · ' : ''}
                    {c.estado}
                  </span>
                </div>
                {c.descripcion && <p className="tenue texto-pre">{c.descripcion}</p>}
                {!compacto && (
                  <div className="fila" style={{ marginTop: 6 }}>
                    {c.estado !== 'aceptada' && (
                      <button className="boton chico" onClick={() => cambiar.mutate({ id: c.id, estado: 'aceptada' })}>
                        Aceptar
                      </button>
                    )}
                    {c.estado !== 'descartada' && (
                      <button className="boton chico" onClick={() => cambiar.mutate({ id: c.id, estado: 'descartada' })}>
                        Descartar
                      </button>
                    )}
                    <button
                      className="boton chico fantasma peligro"
                      onClick={() => confirm('¿Borrar esta conexión?') && borrar.mutate(c.id)}
                    >
                      Borrar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!compacto && otros.length > 0 && (
        <div className="pila" style={{ gap: 8, paddingTop: 8, borderTop: '1px solid var(--borde)' }}>
          <span className="etiqueta-campo">Nueva conexión</span>
          <div className="fila">
            <select
              style={{ width: 'auto' }}
              value={nueva.sentido}
              onChange={(e) => setNueva({ ...nueva, sentido: e.target.value as 'aporta' | 'recibe' })}
            >
              <option value="recibe">Recibe de</option>
              <option value="aporta">Aporta a</option>
            </select>
            <select className="crecer" value={nueva.otro} onChange={(e) => setNueva({ ...nueva, otro: e.target.value })}>
              <option value="">Elige un proyecto…</option>
              {otros.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </div>
          <input
            placeholder="¿Qué aporta exactamente?"
            value={nueva.descripcion}
            onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && enviar()}
          />
          {crear.error && <div className="aviso error">{crear.error.message}</div>}
          <div>
            <button className="boton" disabled={!nueva.otro || crear.isPending} onClick={enviar}>
              Añadir conexión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
