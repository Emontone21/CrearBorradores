// Tipos compartidos entre el servidor y el navegador.

export const ETAPAS = ['idea', 'explorando', 'construyendo', 'pausado', 'terminado'] as const;
export type Etapa = (typeof ETAPAS)[number];

/** Etapas que reciben atención en el reparto semanal. */
export const ETAPAS_ACTIVAS: readonly Etapa[] = ['idea', 'explorando', 'construyendo'];

export const NOMBRE_ETAPA: Record<Etapa, string> = {
  idea: 'Idea',
  explorando: 'Explorando',
  construyendo: 'Construyendo',
  pausado: 'Pausado',
  terminado: 'Terminado',
};

export function esActivo(etapa: Etapa): boolean {
  return ETAPAS_ACTIVAS.includes(etapa);
}

/** Las tres "cabezas" con las que se mira cada proyecto. */
export interface Cabezas {
  impacto: number;
  energia: number;
  urgencia: number;
}

export interface Proyecto extends Cabezas {
  id: number;
  nombre: string;
  porque: string;
  etapa: Etapa;
  query: string;
  keys_texto: string;
  etiquetas: string[];
  value: string;
  ejemplo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export type TipoActualizacion = 'creacion' | 'avance' | 'porque' | 'etapa' | 'fusion';

export interface Actualizacion {
  id: number;
  proyecto_id: number;
  fecha: string;
  tipo: TipoActualizacion;
  descripcion: string;
  query_anterior: string | null;
  query_nuevo: string | null;
  porque_anterior: string | null;
  porque_nuevo: string | null;
}

export type FuenteConexion = 'manual' | 'ia';
export type EstadoConexion = 'pendiente' | 'aceptada' | 'descartada';

/** origen = el proyecto que aporta (key) · destino = el que lo necesita (query). */
export interface Conexion {
  id: number;
  origen_id: number;
  destino_id: number;
  origen_nombre: string;
  destino_nombre: string;
  descripcion: string;
  fuente: FuenteConexion;
  estado: EstadoConexion;
  creado_en: string;
}

export interface Captura {
  id: number;
  texto: string;
  creado_en: string;
  proyecto_id: number | null;
  archivada: boolean;
}

export interface FichaProyecto extends Proyecto {
  actualizaciones: Actualizacion[];
  conexiones: Conexion[];
  notas: Captura[];
}

export interface ItemReparto {
  proyecto_id: number;
  porcentaje: number;
  propuesto: number;
  puntuacion: number;
}

export interface Revision {
  id: number;
  semana: string;
  temperatura: number;
  notas: string;
  creado_en: string;
  reparto: ItemReparto[];
}

export interface Pesos {
  impacto: number;
  energia: number;
  urgencia: number;
}

export interface Ajustes {
  ia_activada: boolean;
  pesos: Pesos;
}

export interface EstadoIA {
  /** Hay ANTHROPIC_API_KEY en .env */
  disponible: boolean;
  /** El usuario la activó en Ajustes */
  activada: boolean;
  modelo: string;
}

export type DecisionMensual = 'pausar' | 'fusionar' | 'mantener';
