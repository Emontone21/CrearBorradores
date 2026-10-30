import { useState } from 'react';
import { ETAPAS, NOMBRE_ETAPA, type Etapa } from '../../shared/tipos.ts';
import { api, type DatosProyectoNuevo } from '../api.ts';
import { useEtiquetas, useMutacion } from '../datos.ts';
import { EditorEtiquetas } from './EditorEtiquetas.tsx';
import { Modal } from './Modal.tsx';
import { Nota1a5 } from './Nota1a5.tsx';

interface Props {
  abierto: boolean;
  alCerrar: () => void;
  alCrear?: (id: number) => void;
  inicial?: Partial<DatosProyectoNuevo>;
}

const VACIO: DatosProyectoNuevo = {
  nombre: '',
  porque: '',
  etapa: 'idea',
  query: '',
  keys_texto: '',
  etiquetas: [],
  value: '',
  impacto: 3,
  energia: 3,
  urgencia: 3,
};

export function FormularioProyecto({ abierto, alCerrar, alCrear, inicial }: Props) {
  const [d, setD] = useState<DatosProyectoNuevo>({ ...VACIO, ...inicial });
  const etiquetas = useEtiquetas();
  const crear = useMutacion(api.crearProyecto, (p) => {
    setD({ ...VACIO });
    alCerrar();
    alCrear?.(p.id);
  });
  const set = <K extends keyof DatosProyectoNuevo>(k: K, v: DatosProyectoNuevo[K]) => setD((x) => ({ ...x, [k]: v }));
  const valido = d.nombre.trim() && d.porque.trim();

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Nuevo proyecto"
      ancho
      pie={
        <>
          <button className="boton" onClick={alCerrar}>
            Cancelar
          </button>
          <button className="boton primario" disabled={!valido || crear.isPending} onClick={() => crear.mutate(d)}>
            Crear proyecto
          </button>
        </>
      }
    >
      {crear.error && <div className="aviso error">{crear.error.message}</div>}
      <div className="dos-columnas">
        <label className="campo">
          <span>Nombre</span>
          <input autoFocus value={d.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
        <label className="campo">
          <span>Etapa</span>
          <select value={d.etapa} onChange={(e) => set('etapa', e.target.value as Etapa)}>
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {NOMBRE_ETAPA[e]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="campo">
        <span>Por qué</span>
        <input
          value={d.porque}
          maxLength={500}
          placeholder="La intención original, en una línea"
          onChange={(e) => set('porque', e.target.value)}
        />
        <small>Quedará fija arriba de la ficha. Solo se cambia de forma explícita y deja rastro.</small>
      </label>
      <label className="campo">
        <span>Query · qué necesita ahora</span>
        <textarea rows={2} value={d.query} onChange={(e) => set('query', e.target.value)} />
      </label>
      <div className="campo">
        <span>Keys · qué puede aportar a otros</span>
        <EditorEtiquetas
          etiquetas={d.etiquetas ?? []}
          alCambiar={(e) => set('etiquetas', e)}
          sugerencias={etiquetas.data}
        />
        <textarea
          rows={2}
          placeholder="Habilidades, contactos, código, contenido…"
          value={d.keys_texto}
          onChange={(e) => set('keys_texto', e.target.value)}
        />
      </div>
      <label className="campo">
        <span>Value · lo concreto que ya está hecho</span>
        <textarea rows={2} value={d.value} onChange={(e) => set('value', e.target.value)} />
      </label>
      <div className="cabezas">
        <span className="etiqueta-campo">Impacto</span>
        <Nota1a5 etiqueta="Impacto" valor={d.impacto ?? 3} alCambiar={(v) => set('impacto', v)} />
        <span className="etiqueta-campo">Energía</span>
        <Nota1a5 etiqueta="Energía" valor={d.energia ?? 3} alCambiar={(v) => set('energia', v)} />
        <span className="etiqueta-campo">Urgencia</span>
        <Nota1a5 etiqueta="Urgencia" valor={d.urgencia ?? 3} alCambiar={(v) => set('urgencia', v)} />
      </div>
    </Modal>
  );
}
