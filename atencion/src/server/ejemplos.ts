// Tres proyectos de ejemplo para estrenar la app. Se cargan una sola vez, con la base vacía,
// y se pueden borrar desde Ajustes.
import type { BaseDatos } from './db.ts';
import { crearConexion } from './modelo/conexiones.ts';
import { crearProyecto, registrarActualizacion, type DatosProyecto } from './modelo/proyectos.ts';

const MARCA = 'ejemplos_cargados';

const EJEMPLOS: DatosProyecto[] = [
  {
    nombre: 'Blog de productividad',
    porque: 'Ordenar lo que aprendo escribiéndolo y compartirlo con quien le sirva',
    etapa: 'construyendo',
    query: '¿Cómo publico con constancia sin quemarme?',
    etiquetas: ['escritura', 'audiencia'],
    keys_texto: 'Sé escribir guías paso a paso. Lista de correo con 300 lectores.',
    value: '12 artículos publicados y una plantilla de artículo que reutilizo.',
    impacto: 4,
    energia: 4,
    urgencia: 3,
  },
  {
    nombre: 'App de finanzas personales',
    porque: 'Entender en qué gasto sin depender de hojas de cálculo',
    etapa: 'explorando',
    query: '¿Quién podría probar el prototipo y darme una opinión honesta?',
    etiquetas: ['código', 'react', 'gráficos'],
    keys_texto: 'Prototipo en React; sé montar paneles con gráficos.',
    value: 'Prototipo que importa el CSV del banco y agrupa gastos por categoría.',
    impacto: 3,
    energia: 5,
    urgencia: 2,
  },
  {
    nombre: 'Curso de fotografía',
    porque: 'Recuperar la fotografía como algo creativo, no solo técnico',
    etapa: 'idea',
    query: '¿Necesito una web propia para vender el curso o basta con una lista de correo?',
    etiquetas: ['fotografía', 'contacto: Marta (estudio)'],
    keys_texto: 'Archivo de 2.000 fotos propias. Marta alquila su estudio los fines de semana.',
    value: 'Temario de cuatro sesiones esbozado.',
    impacto: 3,
    energia: 3,
    urgencia: 1,
  },
];

export function cargarEjemplosSiHaceFalta(db: BaseDatos): boolean {
  const yaCargados = db.prepare('SELECT 1 FROM ajustes WHERE clave = ?').get(MARCA);
  const hayProyectos = db.prepare('SELECT 1 FROM proyectos LIMIT 1').get();
  if (yaCargados || hayProyectos) return false;

  db.transaction(() => {
    const [blog, app, curso] = EJEMPLOS.map((e) => crearProyecto(db, { ...e, ejemplo: true }));
    registrarActualizacion(db, blog.id, {
      descripcion: 'Dejé de publicar a diario: ahora un artículo largo por semana.',
      query_nuevo: blog.query,
    });
    crearConexion(db, {
      origen_id: blog.id,
      destino_id: app.id,
      descripcion: 'Los lectores del blog pueden probar el prototipo y opinar.',
      fuente: 'manual',
    });
    crearConexion(db, {
      origen_id: blog.id,
      destino_id: curso.id,
      descripcion: 'La lista de correo del blog sirve para vender el curso sin web propia.',
      fuente: 'manual',
    });
    db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?)').run(MARCA, 'true');
  })();
  return true;
}

export function borrarEjemplos(db: BaseDatos): number {
  return db.prepare('DELETE FROM proyectos WHERE ejemplo = 1').run().changes;
}
