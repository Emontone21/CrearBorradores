import type { CSSProperties } from 'react';
import type { Etapa } from '../shared/tipos.ts';

export const estiloEtapa = (etapa: Etapa) => ({ '--color-etapa': `var(--etapa-${etapa})` }) as CSSProperties;

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function hace(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return fechaCorta(iso);
}

/** Búsqueda sin distinguir mayúsculas ni tildes. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
