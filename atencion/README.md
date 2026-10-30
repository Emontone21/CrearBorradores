# Atención

Gestor personal de proyectos inspirado en el paper *Attention Is All You Need*.
Cada proyecto es un **token**: ninguno se gestiona aislado, todos se comparan entre sí para encontrar
conexiones, y tu atención semanal es un presupuesto que suma **100 %**.

- Funciona en tu navegador, en local. Un solo usuario, sin login.
- Los datos viven solo en tu equipo, en `data/app.db` (SQLite incluido en Node). Nada se sube a la nube.
- El servidor escucha únicamente en `127.0.0.1`: no se ve desde la red.
- La IA (Claude) es opcional y está desactivada por defecto.

## Instalación en Windows (doble clic)

1. Instala **Node.js** versión LTS (22.13 o más reciente) desde [nodejs.org](https://nodejs.org).
   Solo una vez.
2. Descarga la carpeta `atencion/` y déjala donde quieras (por ejemplo, en Documentos).
3. Haz doble clic en **`iniciar.bat`**.

La primera vez instala las dependencias (un par de minutos, necesita internet). Después arranca la app
y la abre en el navegador en **http://127.0.0.1:3001**. Deja la ventana negra abierta mientras la uses;
para cerrar la app, cierra esa ventana. Tus datos se guardan en `atencion/data/`.

No hace falta instalar Visual Studio ni nada más: la base de datos usa el SQLite que ya viene incluido
en Node.js.

## Instalación con terminal (Windows, Mac o Linux)

La app vive en la carpeta `atencion/` de este repositorio, separada del resto. Todos los comandos se
ejecutan dentro de esa carpeta:

```bash
git clone https://github.com/emontone21/crearborradores.git
cd crearborradores/atencion
npm install
```

## Uso

### Uso diario

```bash
npm run iniciar   # compila, arranca y abre el navegador
npm start         # lo mismo, sin abrir el navegador
```

Todo queda en un solo puerto: **http://127.0.0.1:3001**. Para cerrarla, `Ctrl + C` en la terminal.

Para actualizar la app a una versión nueva, reemplaza los archivos pero **conserva la carpeta
`data/`**: ahí están tus proyectos.

### Modo desarrollo

```bash
npm run dev
```

Interfaz en **http://127.0.0.1:5173** con recarga automática al editar el código (la API corre en el
puerto 3001).

La primera vez que arranca con la base vacía se cargan **3 proyectos de ejemplo** con dos conexiones
entre ellos. Bórralos cuando quieras desde **Ajustes → Proyectos de ejemplo**; no vuelven a aparecer.

## El método en la app

| Idea del paper | En la app |
|---|---|
| **Embedding** | Cada proyecto es una tarjeta con campos fijos: nombre, por qué, etapa, query, keys, value y tres puntuaciones. |
| **Self-attention** | Paso 2 del ritual: matriz proyectos × proyectos. Las filas son lo que cada uno **necesita** (query) y las columnas lo que cada uno **aporta** (keys). Tocar una celda registra una conexión «columna aporta a fila». |
| **Multi-head** | Cada proyecto se puntúa de 1 a 5 desde tres cabezas: **impacto**, **energía** y **urgencia**. Los pesos se ajustan en Ajustes. |
| **Softmax + temperatura** | El reparto de atención semanal: `atención_i = exp(p_i / T) / Σ exp(p_j / T)` sobre los proyectos activos. T baja (0,3) = foco; T alta (3) = exploración. Se redondea a enteros que suman exactamente 100. |
| **Conexión residual** | El «por qué» original siempre está visible y solo cambia de forma explícita, con motivo. El query solo cambia registrando una actualización; lo anterior queda en la línea de tiempo. |
| **Encoder / decoder** | Pantalla **Hoy**: modo **Procesar** (capturar ideas y vaciar la bandeja) o **Producir** (un proyecto delante, con sus notas y conexiones al lado). |
| **Capas** | **Ritual semanal** (una pasada por todas las capas) y **revisión mensual** (una pasada más profunda). |

### Pantallas

1. **Tablero:** tarjetas por etapa (idea, explorando, construyendo, pausado, terminado) con búsqueda y
   filtros. Cada tarjeta muestra el por qué, el query actual y la atención de la semana.
2. **Ficha de proyecto:** el por qué fijo arriba, todos los campos, el historial como línea de tiempo,
   sus conexiones y sus notas.
3. **Ritual semanal**, en 5 pasos:
   1. *Actualizar:* por cada proyecto activo, qué cambió y el nuevo query.
   2. *Self-attention:* la matriz query × keys.
   3. *Multi-head:* puntuar impacto, energía y urgencia.
   4. *Temperatura:* de foco a exploración, con vista previa del reparto.
   5. *Softmax:* la propuesta, ajustable con sliders que siempre suman 100 %. Guardar la revisión.
4. **Hoy:** Procesar o Producir.
5. **Revisión mensual:** proyectos con menos del 10 % de atención durante 3 revisiones seguidas o más,
   con la opción de pausarlos, fusionarlos con otro o mantenerlos.
6. **Ajustes:** IA, pesos de las cabezas, exportar e importar en JSON y borrar los ejemplos.

### Reglas que conviene conocer

- Una revisión por **semana ISO** (de lunes a domingo). Si repites el ritual, reemplaza la de esa semana.
- Los proyectos **activos** son los que están en idea, explorando o construyendo; los pausados y
  terminados no reciben atención.
- Revisión mensual: se cuentan tus **últimas revisiones guardadas**, aunque alguna semana no hayas
  hecho el ritual. Si un proyecto no estaba en una revisión, la racha se corta. Si eliges **mantener**,
  no vuelve a aparecer hasta sumar otras 3 revisiones seguidas por debajo del 10 %.
- **Fusionar** un proyecto en otro le pasa su value, keys, etiquetas, conexiones y notas al destino (como
  una actualización del destino). El absorbido queda como terminado, con su por qué e historial intactos.
- Las conexiones se guardan como **origen → destino**: el origen aporta, el destino lo necesita. Las que
  creas tú entran aceptadas; las de la IA, pendientes.

## IA opcional (Claude)

La app funciona completa sin IA. Para activarla:

1. Copia `.env.example` como `.env` y pon tu clave de la API de Anthropic:

   ```
   ANTHROPIC_API_KEY=tu-clave
   CLAUDE_MODEL=claude-sonnet-5-5
   ```

2. Reinicia la app y actívala en **Ajustes**.

Aparecen dos botones:

- **Sugerir cruces** (ritual, paso 2): envía las tarjetas de los proyectos activos (id, nombre, por qué,
  query, keys y value) y pide una lista de cruces. Entran como **conexiones pendientes** que aceptas o
  descartas.
- **Detectar fusiones** (revisión mensual): propone pares de proyectos que se solapan. Solo propone; la
  fusión la haces tú.

Antes de cada llamada ves **exactamente** qué se envía y tienes que confirmarlo. Si los datos cambian
entre la vista previa y la confirmación, no se envía nada. La IA nunca modifica datos por su cuenta. Si
la llamada falla o la respuesta no es un JSON válido, verás un mensaje de error y no se guarda nada.

La clave solo la lee el servidor local y nunca llega al navegador. `.env` está en `.gitignore`.

## Tus datos

- Todo está en `atencion/data/app.db` (fuera de git). Para hacer una copia basta con copiar esa carpeta con la app
  cerrada, o usar **Ajustes → Exportar todo (JSON)**.
- **Importar** reemplaza todos los datos actuales. Antes guarda una copia automática en `data/backups/`.
  Si el archivo no es válido o es incoherente, no cambia nada.
- Para usar otra base (por ejemplo, para probar), arranca con la variable `DB_PATH=/ruta/a/otra.db`.
- Para cambiar el puerto, usa la variable `PUERTO`.

## Desarrollo

```bash
npm test          # tests (Vitest): reparto softmax, semanas, revisión mensual, API, IA simulada, importación
npm run typecheck # comprobación de tipos
```

```
src/
├── shared/      Lógica pura y tipos, compartidos por servidor y navegador (con tests)
│   ├── atencion.ts   puntuación, softmax, temperatura, redondeo a 100, ajuste de sliders
│   ├── mensual.ts    rachas por debajo del 10 %
│   └── semanas.ts    semanas ISO
├── server/      Hono + node:sqlite
│   ├── db.ts         conexión y migraciones
│   ├── modelo/       acceso a datos
│   ├── rutas/        API REST bajo /api
│   ├── ia/           cliente de Claude y qué se le envía
│   └── ejemplos.ts   los 3 proyectos de ejemplo
└── client/      React + TypeScript + Vite
    ├── componentes/
    └── paginas/
```

Stack: React 19, React Router, TanStack Query, Vite, Hono, `node:sqlite`, zod, `@anthropic-ai/sdk`, Vitest.

Se usa el SQLite incluido en Node (`node:sqlite`) en lugar de `better-sqlite3` porque este último es
una librería nativa: en Windows, si no hay una versión ya compilada para tu versión de Node, intenta
compilarla y exige tener Visual Studio instalado.

### Seguridad local

Además de escuchar solo en `127.0.0.1`, la API rechaza peticiones cuyo `Host` no sea local y exige una
cabecera propia (`X-Atencion`) en todo lo que modifica datos. Así, una web cualquiera abierta en tu
navegador no puede leer ni borrar tus datos ni gastar tu clave de la IA.
