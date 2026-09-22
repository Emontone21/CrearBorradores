# CrearBorradores

App de ventana para Windows que arma **borradores de correo en Outlook**:
cargás los destinatarios, el asunto y el cuerpo, apretás **CREAR** y los
mensajes quedan en la carpeta *Borradores* de Outlook, listos para revisar
y enviar cuando quieras.

```
┌──────────┬────────────────────────────────────┐
│  PARA    │  ASUNTO                            │
│          ├────────────────────────────────────┤
│ ana@x.com│                                    │
│ luis@y.co│  BODY                              │
│ eva@z.com│                                    │
│          │                                    │
│ ○ únicos │                                    │
│ ● grupo  │                          ┌────────┐│
│          │                          │ CREAR  ││
└──────────┴──────────────────────────┴────────┘
```

## Lo importante en tres líneas

- **Nunca envía nada.** La app solo guarda borradores; el envío lo hacés vos
  desde Outlook, mensaje por mensaje.
- **No pide usuario ni contraseña.** Usa la sesión de Outlook que ya tenés
  abierta en tu computadora. No guarda credenciales en ningún lado.
- **No necesita instalación.** Es un único `.exe`: se copia y se abre con
  doble clic, sin permisos de administrador.

## Requisitos

| | |
|---|---|
| Sistema | Windows 10 u 11 |
| Correo | **Outlook clásico de escritorio** (el de Microsoft 365 / Office 2016 o superior) con tu cuenta ya configurada |

> **Atención:** no funciona con el **"nuevo Outlook"** ni con **Outlook en el
> navegador**. Esas versiones no permiten que otros programas creen
> borradores. Si en tu Outlook ves arriba a la derecha un interruptor que
> dice *"Nuevo Outlook"* y está **activado**, desactivalo para volver al
> clásico. Si tu empresa solo tiene el nuevo Outlook, avisame y armamos la
> variante que usa Microsoft Graph (requiere registrar una app en Azure).

## Cómo se usa

1. Abrí Outlook (podés dejarlo abierto de fondo).
2. Abrí `CrearBorradores.exe`.
3. **PARA**: pegá o escribí los destinatarios, **uno por línea**. También
   acepta listas separadas por coma o punto y coma, y el formato
   `Nombre <correo@ejemplo.com>`. Abajo del cuadro se va actualizando un
   contador con cuántos destinatarios válidos hay.
4. Elegí **cómo se envía**:
   - **Correos únicos** → se crea **un borrador por persona**. Si cargaste
     30 direcciones, quedan 30 borradores separados y **nadie ve a los
     demás destinatarios**.
   - **Grupo (un solo correo)** → se crea **un solo borrador** con todos en
     el campo *Para*. Todos ven a todos.
5. Completá **ASUNTO** y **BODY**.
6. Apretá **CREAR** (o `Ctrl + Enter`). Te muestra un resumen de lo que va a
   pasar antes de hacer nada.
7. Andá a Outlook → **Borradores**. Revisá y enviá.

### Funciones extra

- **Importar…**: carga los destinatarios desde un archivo `.xlsx`, `.csv`,
  `.tsv` o `.txt`. Busca direcciones de correo en **todas las hojas y
  columnas**, saca los repetidos y los vuelca en el cuadro PARA para que los
  revises antes de crear nada. No importa en qué columna estén.
- **CC / CCO**: el tildado al lado de ASUNTO despliega los dos campos. En
  modo *correos únicos* la copia se repite en **cada** borrador (si son 30
  destinatarios, quien esté en CC recibe 30 correos cuando los envíes).
- **Adjuntar…**: los archivos elegidos se adjuntan a **todos** los
  borradores que se creen.
- **Incluir mi firma**: agrega tu firma de Outlook debajo del cuerpo. Si lo
  destildás, el cuerpo se escribe como texto plano y sin firma.
- La app recuerda tus preferencias (modo, firma, tamaño de la ventana) en
  `%APPDATA%\CrearBorradores\config.json`.

## Cómo generar el `.exe` para repartir

### Opción A — en tu computadora

Necesitás [Python 3.10 o superior](https://www.python.org/downloads/)
instalado (tildá *"Add Python to PATH"* durante la instalación). Después:

```
build.bat
```

Doble clic al archivo y listo. Instala las dependencias, corre los tests y
deja el programa terminado en:

```
dist\CrearBorradores.exe
```

Ese **único archivo** es el que le pasás a cada persona (por mail, carpeta
compartida, OneDrive, lo que uses). No necesitan Python ni nada más.

### Opción B — que lo compile GitHub

El repositorio trae un flujo de GitHub Actions
(`.github/workflows/build.yml`) que corre los tests y compila el `.exe` en
una máquina Windows cada vez que se sube un cambio.

Para bajarlo: pestaña **Actions** → última ejecución → sección
**Artifacts** → `CrearBorradores-exe`.

## Problemas frecuentes

**"No se encontró Outlook de escritorio en esta computadora"**
No está instalado el Outlook clásico, o solo está el nuevo Outlook / la
versión web. Ver la nota de *Requisitos*.

**"Windows no pudo iniciar Outlook"**
Pasa cuando Outlook corre con permisos distintos a los de la app. Abrí
Outlook normalmente (sin *"Ejecutar como administrador"*) y probá de nuevo.

**"Outlook está ocupado y rechazó el pedido"**
Outlook tiene un cuadro de diálogo abierto esperando respuesta. Cerralo y
volvé a intentar.

**El antivirus bloquea el `.exe`**
Es un falso positivo típico de los ejecutables de un solo archivo. Si pasa
en tu empresa, pedile a IT que lo agregue a la lista de permitidos, o
generá la versión en carpeta cambiando `--onefile` por `--onedir` en
`build.bat` y repartí la carpeta comprimida.

**Tarda con muchos destinatarios**
Cada borrador es un pedido a Outlook. Con la firma activada tarda bastante
más, porque Outlook tiene que armar el HTML de la firma en cada mensaje. Si
vas a crear cientos, destildá *Incluir mi firma*. La ventana no se congela y
el botón CREAR se transforma en **CANCELAR** mientras trabaja.

## Para desarrolladores

```
CrearBorradores/
├── run.py                      punto de entrada
├── build.bat                   genera el .exe
├── src/crearborradores/
│   ├── ui.py                   la ventana (Tkinter)
│   ├── outlook.py              puente con Outlook por COM (pywin32)
│   ├── drafts.py               arma los mensajes y el HTML del cuerpo
│   ├── emails.py               parseo y validación de direcciones
│   ├── importers.py            importación desde Excel / CSV / TXT
│   └── config.py               preferencias del usuario
└── tests/                      tests (unittest, sin dependencias extra)
```

Correr desde el código fuente:

```bash
pip install -r requirements.txt
python run.py
```

Correr los tests:

```bash
python -m unittest discover -s tests -v
```

Los módulos `emails`, `importers` y `drafts` no dependen de Windows ni de
Tkinter, así que los tests corren en cualquier sistema operativo. Fuera de
Windows la app se abre igual, en **modo prueba**: simula la creación de los
borradores sin tocar Outlook.
