// Qué se envía a la IA y qué se hace con lo que responde.
// La IA nunca modifica datos: sus cruces entran como conexiones «pendientes» y las fusiones solo se muestran.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { esActivo, type Proyecto } from '../../shared/tipos.ts';
import type { BaseDatos } from '../db.ts';
import { crearConexion, listarConexiones } from '../modelo/conexiones.ts';
import { listarProyectos } from '../modelo/proyectos.ts';
import { ErrorIA, type ConfigIA, type Peticion } from './cliente.ts';

export interface VistaPrevia {
  modelo: string;
  sistema: string;
  usuario: string;
  /** Huella de lo mostrado: si los datos cambian antes de confirmar, no se envía nada. */
  huella: string;
  proyectos: number;
}

const tarjeta = (p: Proyecto) => ({
  id: p.id,
  nombre: p.nombre,
  porque: p.porque,
  query: p.query,
  keys: { etiquetas: p.etiquetas, texto: p.keys_texto },
  value: p.value,
});

const SISTEMA_CRUCES = `Ayudas a una persona a gestionar sus proyectos personales con un método inspirado en la atención de los transformers.
Cada proyecto tiene un «query» (lo que necesita ahora) y unas «keys» (lo que puede aportar a otros: habilidades, contactos, código, contenido), además de su «porque» (intención original) y su «value» (lo ya hecho).

Tu tarea: encontrar cruces concretos en los que las keys o el value de un proyecto (origen) ayudan a resolver el query de otro proyecto (destino).
- Usa los «id» numéricos de los proyectos en «origen» y «destino». Origen y destino deben ser distintos.
- Cada «razon» debe explicar en una o dos frases, en español, qué aporta exactamente el origen al destino, basándose en los datos.
- Propón como máximo 10 cruces, los más útiles primero. Si no hay cruces claros, devuelve la lista vacía: es mejor no inventar.`;

const SISTEMA_FUSIONES = `Ayudas a una persona a revisar sus proyectos personales una vez al mes.
Tu tarea: detectar pares de proyectos que se solapan tanto (misma intención, mismo público, mismo trabajo) que tendría sentido fusionarlos en uno.
- Usa los «id» numéricos. «absorbido» es el proyecto que se integraría dentro de «destino»; deben ser distintos.
- Prefiere como destino el proyecto más avanzado o con más value.
- Cada «razon» explica en una o dos frases, en español, por qué se solapan.
- Propón como máximo 5. Si ningún par se solapa de verdad, devuelve la lista vacía.`;

const esquemaCruces = z.object({
  sugerencias: z.array(z.object({ origen: z.number().int(), destino: z.number().int(), razon: z.string() })),
});

const esquemaFusiones = z.object({
  sugerencias: z.array(z.object({ absorbido: z.number().int(), destino: z.number().int(), razon: z.string() })),
});

function vistaPrevia(modelo: string, sistema: string, datos: unknown[], intro: string): VistaPrevia {
  const usuario = `${intro}\n\n${JSON.stringify(datos, null, 2)}`;
  const huella = createHash('sha256').update(JSON.stringify([modelo, sistema, usuario])).digest('hex').slice(0, 16);
  return { modelo, sistema, usuario, huella, proyectos: datos.length };
}

export function vistaPreviaCruces(db: BaseDatos, modelo: string): VistaPrevia {
  const activos = listarProyectos(db).filter((p) => esActivo(p.etapa));
  return vistaPrevia(modelo, SISTEMA_CRUCES, activos.map(tarjeta), 'Estos son mis proyectos activos:');
}

export function vistaPreviaFusiones(db: BaseDatos, modelo: string): VistaPrevia {
  const vigentes = listarProyectos(db).filter((p) => p.etapa !== 'terminado');
  return vistaPrevia(
    modelo,
    SISTEMA_FUSIONES,
    vigentes.map((p) => ({ ...tarjeta(p), etapa: p.etapa })),
    'Estos son mis proyectos (sin los terminados):',
  );
}

function comprobarHuella(previa: VistaPrevia, huella: string) {
  if (previa.huella !== huella) {
    throw new ErrorIA('Los datos cambiaron desde que viste la vista previa. Revísala de nuevo antes de enviar.', 409);
  }
  if (previa.proyectos < 2) throw new ErrorIA('Hacen falta al menos dos proyectos.', 400);
}

const peticionDe = (p: VistaPrevia): Peticion => ({ sistema: p.sistema, usuario: p.usuario });

export interface ResultadoCruces {
  creadas: number;
  omitidas: number;
  motivo_omitidas: string[];
}

export async function sugerirCruces(db: BaseDatos, ia: ConfigIA, huella: string): Promise<ResultadoCruces> {
  const previa = vistaPreviaCruces(db, ia.modelo);
  comprobarHuella(previa, huella);
  const respuesta = await ia.llamar(peticionDe(previa), esquemaCruces);

  const ids = new Set(listarProyectos(db).filter((p) => esActivo(p.etapa)).map((p) => p.id));
  const existentes = new Set(listarConexiones(db).map((c) => `${c.origen_id}-${c.destino_id}`));
  const motivos: string[] = [];
  let creadas = 0;

  db.transaction(() => {
    for (const s of respuesta.sugerencias) {
      const par = `${s.origen}-${s.destino}`;
      if (!ids.has(s.origen) || !ids.has(s.destino)) motivos.push(`id desconocido (${par})`);
      else if (s.origen === s.destino) motivos.push(`un proyecto consigo mismo (${s.origen})`);
      else if (existentes.has(par)) motivos.push(`ya existía una conexión ${par}`);
      else if (!s.razon.trim()) motivos.push(`sin razón (${par})`);
      else {
        crearConexion(db, {
          origen_id: s.origen,
          destino_id: s.destino,
          descripcion: s.razon.trim(),
          fuente: 'ia',
          estado: 'pendiente',
        });
        existentes.add(par);
        creadas++;
      }
    }
  })();

  return { creadas, omitidas: motivos.length, motivo_omitidas: motivos };
}

export interface SugerenciaFusion {
  absorbido: number;
  destino: number;
  razon: string;
}

export async function sugerirFusiones(db: BaseDatos, ia: ConfigIA, huella: string): Promise<SugerenciaFusion[]> {
  const previa = vistaPreviaFusiones(db, ia.modelo);
  comprobarHuella(previa, huella);
  const respuesta = await ia.llamar(peticionDe(previa), esquemaFusiones);
  const ids = new Set(listarProyectos(db).filter((p) => p.etapa !== 'terminado').map((p) => p.id));
  // Se devuelven para que tú decidas; aquí no se toca ningún dato.
  return respuesta.sugerencias.filter(
    (s) => ids.has(s.absorbido) && ids.has(s.destino) && s.absorbido !== s.destino && s.razon.trim(),
  );
}
