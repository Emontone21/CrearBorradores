import { useState, type ReactNode } from 'react';
import { esActivo, type Conexion, type Proyecto } from '../../../shared/tipos.ts';
import { api } from '../../api.ts';
import { Modal } from '../../componentes/Modal.tsx';
import { useConexiones, useMutacion } from '../../datos.ts';

interface Props {
  proyectos: Proyecto[];
  activos: Proyecto[];
  /** Hueco para el botón «Sugerir cruces» cuando la IA está activada. */
  extra?: ReactNode;
}

const SIMBOLO: Record<Conexion['estado'], string> = { aceptada: '●', pendiente: '◌', descartada: '×' };

/**
 * Self-attention: cada fila es un proyecto con su query (lo que necesita);
 * cada columna, un proyecto con sus keys (lo que aporta). Una celda = «columna aporta a fila».
 */
export function PasoMatriz({ proyectos, activos, extra }: Props) {
  const conexiones = useConexiones();
  const [todasLasKeys, setTodasLasKeys] = useState(false);
  const [celda, setCelda] = useState<{ origen: Proyecto; destino: Proyecto } | null>(null);

  const columnas = todasLasKeys ? proyectos : activos;
  const hayInactivos = proyectos.some((p) => !esActivo(p.etapa));

  // Para cada par origen→destino, la conexión más relevante: aceptada > pendiente > descartada.
  const prioridad = { aceptada: 0, pendiente: 1, descartada: 2 };
  const porPar = new Map<string, Conexion>();
  for (const c of conexiones.data ?? []) {
    const clave = `${c.origen_id}-${c.destino_id}`;
    const actual = porPar.get(clave);
    if (!actual || prioridad[c.estado] < prioridad[actual.estado]) porPar.set(clave, c);
  }
  const pendientes = (conexiones.data ?? []).filter((c) => c.estado === 'pendiente');

  return (
    <>
      <p className="explicacion">
        Cada fila es un proyecto con lo que <strong>necesita</strong> (query); cada columna, uno con lo que{' '}
        <strong>aporta</strong> (keys). Toca una celda cuando la columna pueda ayudar a la fila y registra la conexión.
      </p>

      <div className="fila separar" style={{ marginBottom: 8 }}>
        <div className="leyenda">
          <span>● aceptada</span>
          <span>◌ pendiente</span>
          <span>× descartada</span>
        </div>
        <div className="fila">
          {hayInactivos && (
            <label className="fila" style={{ gap: 6, fontSize: '0.88rem' }}>
              <input type="checkbox" checked={todasLasKeys} onChange={(e) => setTodasLasKeys(e.target.checked)} />
              Incluir pausados y terminados como keys
            </label>
          )}
          {extra}
        </div>
      </div>

      <div className="matriz-contenedor">
        <table className="matriz">
          <thead>
            <tr>
              <th className="esquina">Query (fila) ↓ · Keys (columna) →</th>
              {columnas.map((col) => (
                <th key={col.id} title={col.keys_texto}>
                  {col.nombre}
                  {col.etiquetas.length > 0 && <div className="tags">{col.etiquetas.join(' · ')}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activos.map((fila) => (
              <tr key={fila.id}>
                <th>
                  {fila.nombre}
                  <span className="q">{fila.query || 'Sin query'}</span>
                </th>
                {columnas.map((col) => {
                  if (col.id === fila.id) return <td key={col.id} className="diagonal" aria-hidden />;
                  const c = porPar.get(`${col.id}-${fila.id}`);
                  return (
                    <td key={col.id} className={c?.estado}>
                      <button
                        title={c ? `${col.nombre} → ${fila.nombre}: ${c.descripcion}` : `¿${col.nombre} aporta a ${fila.nombre}?`}
                        aria-label={`${col.nombre} aporta a ${fila.nombre}${c ? ` (${c.estado})` : ''}`}
                        onClick={() => setCelda({ origen: col, destino: fila })}
                      >
                        {c ? SIMBOLO[c.estado] : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendientes.length > 0 && (
        <section className="panel" style={{ marginTop: 20 }}>
          <h2>Conexiones pendientes de revisar ({pendientes.length})</h2>
          <ListaPendientes pendientes={pendientes} />
        </section>
      )}

      {celda && (
        <DialogoCelda
          origen={celda.origen}
          destino={celda.destino}
          existentes={(conexiones.data ?? []).filter(
            (c) => c.origen_id === celda.origen.id && c.destino_id === celda.destino.id,
          )}
          alCerrar={() => setCelda(null)}
        />
      )}
    </>
  );
}

export function ListaPendientes({ pendientes }: { pendientes: Conexion[] }) {
  const cambiar = useMutacion(({ id, estado }: { id: number; estado: Conexion['estado'] }) =>
    api.cambiarConexion(id, { estado }),
  );
  return (
    <ul className="lista-conexiones">
      {pendientes.map((c) => (
        <li key={c.id} className="pendiente">
          <div className="fila separar">
            <span>
              <strong>{c.origen_nombre}</strong> <span className="flecha">→</span> <strong>{c.destino_nombre}</strong>
            </span>
            <span className="muy-tenue">{c.fuente === 'ia' ? 'sugerida por IA' : 'manual'}</span>
          </div>
          {c.descripcion && <p className="tenue">{c.descripcion}</p>}
          <div className="fila" style={{ marginTop: 6 }}>
            <button className="boton chico" onClick={() => cambiar.mutate({ id: c.id, estado: 'aceptada' })}>
              Aceptar
            </button>
            <button className="boton chico" onClick={() => cambiar.mutate({ id: c.id, estado: 'descartada' })}>
              Descartar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DialogoCelda({
  origen,
  destino,
  existentes,
  alCerrar,
}: {
  origen: Proyecto;
  destino: Proyecto;
  existentes: Conexion[];
  alCerrar: () => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const crear = useMutacion(
    () => api.crearConexion({ origen_id: origen.id, destino_id: destino.id, descripcion }),
    alCerrar,
  );
  const cambiar = useMutacion(({ id, estado }: { id: number; estado: Conexion['estado'] }) =>
    api.cambiarConexion(id, { estado }),
  );
  const borrar = useMutacion(api.borrarConexion);

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      ancho
      titulo={`${origen.nombre} → ${destino.nombre}`}
      pie={
        <>
          <button className="boton" onClick={alCerrar}>
            Cerrar
          </button>
          <button className="boton primario" disabled={crear.isPending} onClick={() => crear.mutate(undefined)}>
            Registrar conexión
          </button>
        </>
      }
    >
      <div className="comparar">
        <div>
          <span className="etiqueta-campo">{destino.nombre} necesita (query)</span>
          <p style={{ marginTop: 6 }}>{destino.query || <span className="muy-tenue">Sin query</span>}</p>
        </div>
        <div>
          <span className="etiqueta-campo">{origen.nombre} aporta (keys)</span>
          {origen.etiquetas.length > 0 && (
            <div className="fila" style={{ gap: 4, margin: '6px 0' }}>
              {origen.etiquetas.map((e) => (
                <span key={e} className="chip">
                  {e}
                </span>
              ))}
            </div>
          )}
          <p style={{ marginTop: 6 }} className="texto-pre">
            {origen.keys_texto || (origen.etiquetas.length ? '' : <span className="muy-tenue">Sin keys</span>)}
          </p>
          {origen.value && (
            <p className="muy-tenue" style={{ marginTop: 6 }}>
              Ya hecho: {origen.value}
            </p>
          )}
        </div>
      </div>

      {existentes.length > 0 && (
        <div className="pila" style={{ gap: 8 }}>
          <span className="etiqueta-campo">Ya registradas</span>
          <ul className="lista-conexiones">
            {existentes.map((c) => (
              <li key={c.id} className={c.estado}>
                <div className="fila separar">
                  <span>{c.descripcion || <span className="muy-tenue">Sin descripción</span>}</span>
                  <span className="muy-tenue">
                    {c.fuente === 'ia' ? 'IA · ' : ''}
                    {c.estado}
                  </span>
                </div>
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
                  <button className="boton chico fantasma peligro" onClick={() => borrar.mutate(c.id)}>
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="campo">
        <span>Nueva conexión: ¿qué aporta {origen.nombre}?</span>
        <textarea
          autoFocus
          rows={2}
          placeholder="Ej.: su lista de contactos de prensa resuelve la difusión"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </label>
      {crear.error && <div className="aviso error">{crear.error.message}</div>}
    </Modal>
  );
}
