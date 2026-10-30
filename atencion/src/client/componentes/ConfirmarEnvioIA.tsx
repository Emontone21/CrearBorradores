import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type TipoIA, type VistaPreviaIA } from '../api.ts';
import { useEstadoIA } from '../datos.ts';
import { Modal } from './Modal.tsx';

interface Props<R> {
  tipo: TipoIA;
  etiqueta: string;
  enviar: (huella: string) => Promise<R>;
  alTerminar: (resultado: R) => void;
}

/**
 * Botón de IA con confirmación: antes de cada llamada muestra exactamente qué datos se envían.
 * Si la IA no está disponible o está desactivada, no se muestra.
 */
export function ConfirmarEnvioIA<R>({ tipo, etiqueta, enviar, alTerminar }: Props<R>) {
  const estado = useEstadoIA();
  const cliente = useQueryClient();
  const [previa, setPrevia] = useState<VistaPreviaIA | null>(null);
  const [cargando, setCargando] = useState<'previa' | 'envio' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!estado.data?.activada) return null;

  const abrir = async () => {
    setError(null);
    setCargando('previa');
    try {
      setPrevia(await api.iaVistaPrevia(tipo));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  };

  const confirmar = async () => {
    if (!previa) return;
    setError(null);
    setCargando('envio');
    try {
      const r = await enviar(previa.huella);
      setPrevia(null);
      alTerminar(r);
      await cliente.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  };

  return (
    <>
      <button className="boton ia" disabled={cargando !== null} onClick={abrir}>
        {cargando === 'previa' ? 'Preparando…' : etiqueta}
      </button>
      {error && !previa && <span className="aviso error">{error}</span>}

      <Modal
        abierto={previa !== null}
        alCerrar={() => cargando !== 'envio' && setPrevia(null)}
        titulo="Revisa lo que se enviará a Claude"
        ancho
        pie={
          <>
            <button className="boton" disabled={cargando === 'envio'} onClick={() => setPrevia(null)}>
              Cancelar
            </button>
            <button className="boton primario" disabled={cargando === 'envio' || (previa?.proyectos ?? 0) < 2} onClick={confirmar}>
              {cargando === 'envio' ? 'Esperando respuesta…' : 'Enviar a Claude'}
            </button>
          </>
        }
      >
        {previa && (
          <div className="pila envio-ia">
            <p className="tenue">
              Se enviarán los datos de <strong>{previa.proyectos} proyectos</strong> al modelo{' '}
              <span className="mono">{previa.modelo}</span> a través de la API de Anthropic. Nada más sale de tu equipo, y
              la respuesta no cambia ningún dato hasta que tú la aceptes.
            </p>
            {previa.proyectos < 2 && <div className="aviso">Hacen falta al menos dos proyectos.</div>}
            <details>
              <summary>Instrucciones para la IA</summary>
              <pre>{previa.sistema}</pre>
            </details>
            <details open>
              <summary>Datos de tus proyectos</summary>
              <pre>{previa.usuario}</pre>
            </details>
            {error && <div className="aviso error">{error}</div>}
          </div>
        )}
      </Modal>
    </>
  );
}
