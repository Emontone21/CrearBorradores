import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';

// Datos pequeños y locales: tras cualquier cambio se refresca todo. Simple y sin datos viejos.
export function useMutacion<A, R>(fn: (args: A) => Promise<R>, alTerminar?: (r: R) => void) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      // Primero la reacción (cerrar, navegar) y luego el refresco: así no se recarga una ficha recién borrada.
      alTerminar?.(r);
      await cliente.invalidateQueries();
    },
  });
}

export const useProyectos = () => useQuery({ queryKey: ['proyectos'], queryFn: api.proyectos });
export const useFicha = (id: number) => useQuery({ queryKey: ['ficha', id], queryFn: () => api.ficha(id) });
export const useEtiquetas = () => useQuery({ queryKey: ['etiquetas'], queryFn: api.etiquetas });
export const useConexiones = () => useQuery({ queryKey: ['conexiones'], queryFn: () => api.conexiones() });
export const useAjustes = () => useQuery({ queryKey: ['ajustes'], queryFn: api.ajustes });
export const useEstadoIA = () => useQuery({ queryKey: ['ia-estado'], queryFn: api.iaEstado });

/** Atención de la semana: la revisión de esta semana o, si aún no existe, la última guardada. */
export function useAtencionSemana() {
  const q = useQuery({ queryKey: ['revision-actual'], queryFn: api.revisionActual });
  const ultima = q.data?.ultima ?? null;
  const porProyecto = new Map(ultima?.reparto.map((r) => [r.proyecto_id, r.porcentaje]) ?? []);
  return {
    cargando: q.isLoading,
    semanaActual: q.data?.semana ?? null,
    revision: ultima,
    esDeEstaSemana: !!ultima && ultima.semana === q.data?.semana,
    porcentajeDe: (id: number): number | null => porProyecto.get(id) ?? null,
  };
}
