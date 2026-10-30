// Única pieza que habla con la API de Claude. La clave vive solo aquí, en el servidor.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';

export const MODELO_POR_DEFECTO = 'claude-sonnet-5-5';

// Modelos que aceptan el reintento automático en otro modelo si este declina la petición.
const ADMITEN_FALLBACK = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** Error con un mensaje pensado para mostrarse tal cual en la interfaz. */
export class ErrorIA extends Error {
  constructor(
    mensaje: string,
    readonly estado: 400 | 409 | 502 | 503 = 502,
  ) {
    super(mensaje);
  }
}

export interface Peticion {
  sistema: string;
  usuario: string;
}

/** Envía la petición y devuelve la respuesta ya validada contra el esquema. */
export type LlamadorIA = <T extends z.ZodType>(peticion: Peticion, esquema: T) => Promise<z.infer<T>>;

export interface ConfigIA {
  modelo: string;
  llamar: LlamadorIA;
}

/** Devuelve null si no hay ANTHROPIC_API_KEY: la app funciona igual, sin IA. */
export function configurarIA(env: NodeJS.ProcessEnv): ConfigIA | null {
  const clave = env.ANTHROPIC_API_KEY?.trim();
  if (!clave) return null;
  const modelo = env.CLAUDE_MODEL?.trim() || MODELO_POR_DEFECTO;
  const cliente = new Anthropic({ apiKey: clave, maxRetries: 2, timeout: 120_000 });

  const llamar: LlamadorIA = async (peticion, esquema) => {
    let respuesta;
    try {
      respuesta = await cliente.beta.messages.parse({
        model: modelo,
        max_tokens: 16000,
        system: peticion.sistema,
        messages: [{ role: 'user', content: peticion.usuario }],
        output_config: { effort: 'medium', format: betaZodOutputFormat(esquema) },
        ...(ADMITEN_FALLBACK.has(modelo)
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      });
    } catch (e) {
      throw traducirError(e, modelo);
    }
    if (respuesta.stop_reason === 'refusal') {
      throw new ErrorIA('La IA declinó responder a esta petición. No se guardó nada.');
    }
    if (respuesta.stop_reason === 'max_tokens') {
      throw new ErrorIA('La respuesta de la IA quedó cortada. Inténtalo de nuevo con menos proyectos.');
    }
    if (respuesta.parsed_output == null) {
      throw new ErrorIA('La IA no devolvió un JSON válido. No se guardó nada.');
    }
    return respuesta.parsed_output as z.infer<typeof esquema>;
  };

  return { modelo, llamar };
}

function traducirError(e: unknown, modelo: string): ErrorIA {
  // De lo más específico a lo más general (APIConnectionError hereda de APIError).
  if (e instanceof Anthropic.AuthenticationError) {
    return new ErrorIA('La clave ANTHROPIC_API_KEY no es válida. Revisa el archivo .env.');
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return new ErrorIA('La clave no tiene permiso para usar este modelo.');
  }
  if (e instanceof Anthropic.NotFoundError) {
    return new ErrorIA(`El modelo «${modelo}» no existe o no está disponible. Revisa CLAUDE_MODEL en .env.`);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new ErrorIA('Demasiadas peticiones a la API. Espera un momento y vuelve a intentarlo.');
  }
  if (e instanceof Anthropic.BadRequestError) {
    return new ErrorIA(`La API rechazó la petición: ${e.message}`);
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new ErrorIA('No se pudo conectar con la API de Claude. ¿Hay conexión a internet?', 503);
  }
  if (e instanceof Anthropic.APIError) {
    return new ErrorIA(`Error de la API de Claude (${e.status ?? 'sin código'}): ${e.message}`);
  }
  // Fallos al interpretar la respuesta (JSON roto o fuera del esquema).
  return new ErrorIA('La respuesta de la IA no es un JSON válido. No se guardó nada.');
}
