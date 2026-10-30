import type {
  Actualizacion,
  Ajustes,
  Conexion,
  EstadoConexion,
  FichaProyecto,
  ItemReparto,
  Proyecto,
  Revision,
} from '../shared/tipos.ts';

export class ErrorApi extends Error {}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Atencion': '1' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi('No hay conexión con el servidor local. ¿Está corriendo «npm run dev»?');
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok) throw new ErrorApi(datos?.error ?? `Error ${res.status}`);
  return datos as T;
}

export type DatosProyectoNuevo = Pick<Proyecto, 'nombre' | 'porque'> &
  Partial<Pick<Proyecto, 'etapa' | 'query' | 'keys_texto' | 'etiquetas' | 'value' | 'impacto' | 'energia' | 'urgencia'>>;

export type CambiosProyecto = Partial<
  Pick<Proyecto, 'nombre' | 'etapa' | 'keys_texto' | 'etiquetas' | 'value' | 'impacto' | 'energia' | 'urgencia'>
>;

export const api = {
  proyectos: () => pedir<Proyecto[]>('GET', '/proyectos'),
  ficha: (id: number) => pedir<FichaProyecto>('GET', `/proyectos/${id}`),
  etiquetas: () => pedir<string[]>('GET', '/proyectos/etiquetas'),
  avancesDesde: (desde: Date) =>
    pedir<Actualizacion[]>('GET', `/proyectos/avances?desde=${encodeURIComponent(desde.toISOString())}`),
  crearProyecto: (d: DatosProyectoNuevo) => pedir<Proyecto>('POST', '/proyectos', d),
  editarProyecto: (id: number, c: CambiosProyecto) => pedir<Proyecto>('PATCH', `/proyectos/${id}`, c),
  registrarActualizacion: (id: number, d: { descripcion: string; query_nuevo?: string }) =>
    pedir<Proyecto>('POST', `/proyectos/${id}/actualizaciones`, d),
  cambiarPorque: (id: number, d: { porque: string; motivo: string }) =>
    pedir<Proyecto>('PUT', `/proyectos/${id}/porque`, d),
  borrarProyecto: (id: number) => pedir<{ ok: true }>('DELETE', `/proyectos/${id}`),

  conexiones: (estado?: EstadoConexion) =>
    pedir<Conexion[]>('GET', `/conexiones${estado ? `?estado=${estado}` : ''}`),
  crearConexion: (d: { origen_id: number; destino_id: number; descripcion: string }) =>
    pedir<Conexion>('POST', '/conexiones', d),
  cambiarConexion: (id: number, c: { estado?: EstadoConexion; descripcion?: string }) =>
    pedir<Conexion>('PATCH', `/conexiones/${id}`, c),
  borrarConexion: (id: number) => pedir<{ ok: true }>('DELETE', `/conexiones/${id}`),

  revisionActual: () => pedir<{ semana: string; ultima: Revision | null }>('GET', '/revisiones/actual'),
  revisiones: () => pedir<Revision[]>('GET', '/revisiones'),
  guardarRevision: (semana: string, d: { temperatura: number; notas: string; reparto: ItemReparto[] }) =>
    pedir<Revision>('PUT', `/revisiones/${semana}`, d),

  ajustes: () => pedir<Ajustes>('GET', '/ajustes'),
  guardarAjustes: (c: Partial<Ajustes>) => pedir<Ajustes>('PUT', '/ajustes', c),
};
