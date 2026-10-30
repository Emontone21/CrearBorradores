import { useState } from 'react';
import type { Captura } from '../../shared/tipos.ts';
import { api } from '../api.ts';
import { useMutacion } from '../datos.ts';
import { hace } from '../util.ts';

/** Notas de un proyecto = capturas asignadas a él. */
export function PanelNotas({ proyectoId, notas }: { proyectoId: number; notas: Captura[] }) {
  const [texto, setTexto] = useState('');
  const crear = useMutacion(() => api.crearCaptura({ texto, proyecto_id: proyectoId }), () => setTexto(''));
  const cambiar = useMutacion(({ id, c }: { id: number; c: Parameters<typeof api.cambiarCaptura>[1] }) =>
    api.cambiarCaptura(id, c),
  );

  return (
    <div className="pila">
      <textarea
        rows={2}
        placeholder="Anota algo mientras trabajas… (Ctrl+Enter para guardar)"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) crear.mutate(undefined);
        }}
      />
      <div>
        <button className="boton chico" disabled={!texto.trim() || crear.isPending} onClick={() => crear.mutate(undefined)}>
          Añadir nota
        </button>
      </div>
      {notas.length === 0 ? (
        <p className="muy-tenue">Sin notas. Las capturas que asignes a este proyecto aparecen aquí.</p>
      ) : (
        <ul className="notas">
          {notas.map((n) => (
            <li key={n.id}>
              <p className="texto-pre">{n.texto}</p>
              <div className="fila separar">
                <span className="muy-tenue">{hace(n.creado_en)}</span>
                <span className="fila" style={{ gap: 4 }}>
                  <button
                    className="boton chico fantasma"
                    onClick={() => cambiar.mutate({ id: n.id, c: { proyecto_id: null } })}
                  >
                    A la bandeja
                  </button>
                  <button className="boton chico fantasma" onClick={() => cambiar.mutate({ id: n.id, c: { archivada: true } })}>
                    Archivar
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
