interface Props {
  valor: number;
  alCambiar: (v: number) => void;
  etiqueta: string;
  deshabilitado?: boolean;
}

export function Nota1a5({ valor, alCambiar, etiqueta, deshabilitado }: Props) {
  return (
    <div className="notas-1a5" role="radiogroup" aria-label={etiqueta}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === valor}
          className={n === valor ? 'activa' : n < valor ? 'dentro' : ''}
          disabled={deshabilitado}
          onClick={() => alCambiar(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
