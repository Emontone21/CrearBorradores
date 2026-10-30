import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: boolean;
}

/** Diálogo nativo: foco atrapado, Escape para cerrar y fondo inerte sin librerías. */
export function Modal({ abierto, alCerrar, titulo, children, pie, ancho }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      className={`modal${ancho ? ' ancho' : ''}`}
      onClose={alCerrar}
      onClick={(e) => e.target === ref.current && alCerrar()}
    >
      {abierto && (
        <>
          <div className="modal-cuerpo">
            <h2>{titulo}</h2>
            {children}
          </div>
          {pie && <div className="modal-pie">{pie}</div>}
        </>
      )}
    </dialog>
  );
}
