import { Link } from 'react-router';
import type { Proyecto } from '../../shared/tipos.ts';
import { estiloEtapa } from '../util.ts';
import { BarraAtencion } from './BarraAtencion.tsx';

interface Props {
  proyecto: Proyecto;
  porcentaje: number | null;
  semana?: string | null;
  enlace?: boolean;
}

export function TarjetaProyecto({ proyecto: p, porcentaje, semana, enlace = true }: Props) {
  const contenido = (
    <>
      <div className="fila separar">
        <h3>{p.nombre}</h3>
        {p.ejemplo && <span className="ejemplo">ejemplo</span>}
      </div>
      <p className="porque">{p.porque}</p>
      {p.query && (
        <div className="query">
          <b>?</b>
          <span>{p.query}</span>
        </div>
      )}
      <BarraAtencion
        porcentaje={porcentaje}
        titulo={porcentaje === null ? 'Sin atención asignada todavía' : `Atención ${semana ?? ''}`}
      />
    </>
  );
  return enlace ? (
    <Link to={`/proyectos/${p.id}`} className="tarjeta" style={estiloEtapa(p.etapa)}>
      {contenido}
    </Link>
  ) : (
    <div className="tarjeta" style={estiloEtapa(p.etapa)}>
      {contenido}
    </div>
  );
}
