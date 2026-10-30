import { useId, useState } from 'react';

interface Props {
  etiquetas: string[];
  alCambiar: (e: string[]) => void;
  sugerencias?: string[];
}

export function EditorEtiquetas({ etiquetas, alCambiar, sugerencias = [] }: Props) {
  const [texto, setTexto] = useState('');
  const idLista = useId();

  const agregar = () => {
    const nueva = texto.trim().replace(/,$/, '').trim();
    if (nueva && !etiquetas.some((e) => e.toLowerCase() === nueva.toLowerCase())) alCambiar([...etiquetas, nueva]);
    setTexto('');
  };

  return (
    <div className="pila" style={{ gap: 8 }}>
      {etiquetas.length > 0 && (
        <div className="fila" style={{ gap: 6 }}>
          {etiquetas.map((e) => (
            <span key={e} className="chip">
              {e}
              <button
                type="button"
                className="quitar"
                aria-label={`Quitar ${e}`}
                onClick={() => alCambiar(etiquetas.filter((x) => x !== e))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        list={idLista}
        value={texto}
        placeholder="Añade una etiqueta y pulsa Enter (p. ej. diseño, contacto: Ana, código)"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            agregar();
          } else if (e.key === 'Backspace' && !texto && etiquetas.length) {
            alCambiar(etiquetas.slice(0, -1));
          }
        }}
        onBlur={agregar}
      />
      <datalist id={idLista}>
        {sugerencias
          .filter((s) => !etiquetas.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
