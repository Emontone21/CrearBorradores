// Semanas ISO 8601 (lunes a domingo), en formato "2026-W44".

export function semanaISO(fecha: Date = new Date()): string {
  // Se trabaja en UTC con la fecha local para que la hora del día no influya.
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7; // lunes = 1 … domingo = 7
  // El jueves de esta semana decide a qué año pertenece.
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

/** Lunes de una semana ISO, como fecha local. */
export function lunesDeSemana(semana: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(semana);
  if (!m) throw new Error(`Semana inválida: ${semana}`);
  const anio = Number(m[1]);
  const num = Number(m[2]);
  // El 4 de enero siempre cae en la semana 1.
  const cuatroEnero = new Date(anio, 0, 4);
  const dia = cuatroEnero.getDay() || 7;
  return new Date(anio, 0, 4 - (dia - 1) + (num - 1) * 7);
}

export function etiquetaSemana(semana: string): string {
  const lunes = lunesDeSemana(semana);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return `Semana ${Number(semana.slice(6))} · ${f(lunes)} – ${f(domingo)}`;
}
