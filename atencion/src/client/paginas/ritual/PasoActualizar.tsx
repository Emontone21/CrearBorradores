import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { lunesDeSemana, semanaISO } from '../../../shared/semanas.ts';
import { NOMBRE_ETAPA, type Actualizacion, type Proyecto } from '../../../shared/tipos.ts';
import { api } from '../../api.ts';
import { useMutacion } from '../../datos.ts';
import { estiloEtapa, hace } from '../../util.ts';

export function PasoActualizar({ activos }: { activos: Proyecto[] }) {
  const lunes = lunesDeSemana(semanaISO());
  const avances = useQuery({ queryKey: ['avances', lunes.toISOString()], queryFn: () => api.avancesDesde(lunes) });
  const porProyecto = new Map<number, Actualizacion[]>();
  for (const a of avances.data ?? []) porProyecto.set(a.proyecto_id, [...(porProyecto.get(a.proyecto_id) ?? []), a]);

  return (
    <>
      <p className="explicacion">
        Conexión residual: por cada proyecto activo registra <strong>solo lo que cambió</strong> y su nuevo query. Nada se
        reescribe; lo anterior queda en el historial. Si un proyecto no se movió, sáltalo.
      </p>
      <div className="lista-actualizar">
        {activos.map((p) => (
          <TarjetaActualizar key={p.id} p={p} estaSemana={porProyecto.get(p.id) ?? []} />
        ))}
      </div>
    </>
  );
}

function TarjetaActualizar({ p, estaSemana }: { p: Proyecto; estaSemana: Actualizacion[] }) {
  const [descripcion, setDescripcion] = useState('');
  const [query, setQuery] = useState(p.query);
  const registrar = useMutacion(
    () => api.registrarActualizacion(p.id, { descripcion, query_nuevo: query }),
    (actualizado) => {
      setDescripcion('');
      setQuery(actualizado.query);
    },
  );

  return (
    <section className={`panel${estaSemana.length ? ' hecho' : ''}`} style={estiloEtapa(p.etapa)}>
      <div className="fila separar" style={{ marginBottom: 6 }}>
        <h3>{p.nombre}</h3>
        <span className="etapa">{NOMBRE_ETAPA[p.etapa]}</span>
      </div>
      <p className="tenue" style={{ fontFamily: 'var(--fuente-serif)', fontStyle: 'italic', marginBottom: 12 }}>
        {p.porque}
      </p>

      {estaSemana.length > 0 && (
        <div className="aviso ok" style={{ marginBottom: 12 }}>
          ✓ {estaSemana.length === 1 ? 'Actualizado' : `${estaSemana.length} actualizaciones`} esta semana · último{' '}
          {hace(estaSemana[0].fecha)}: «{estaSemana[0].descripcion}»
        </div>
      )}

      <div className="pila">
        <label className="campo">
          <span>¿Qué cambió?</span>
          <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <label className="campo">
          <span>Query {query === p.query ? '(sin cambios)' : '(nuevo)'}</span>
          <textarea rows={2} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {registrar.error && <div className="aviso error">{registrar.error.message}</div>}
        <div>
          <button
            className="boton primario chico"
            disabled={!descripcion.trim() || registrar.isPending}
            onClick={() => registrar.mutate(undefined)}
          >
            Registrar cambio
          </button>
        </div>
      </div>
    </section>
  );
}
