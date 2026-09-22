"""Interfaz grafica de CrearBorradores (Tkinter)."""

from __future__ import annotations

import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from . import APP_NAME, __version__
from . import config as config_module
from .drafts import DraftSpec, Mode, build_specs
from .emails import ParseResult, parse_recipients
from .importers import FILE_TYPES, FileImportError, import_addresses
from .outlook import (
    DryRunBackend,
    OutlookError,
    com_initialize,
    create_backend,
    is_windows,
    open_drafts_folder,
)

PAD = 8
DEFAULT_GEOMETRY = "1020x640"
MIN_SIZE = (860, 540)


def _enable_dpi_awareness() -> None:
    """Evita que la ventana se vea borrosa en pantallas con escalado."""
    if not is_windows():
        return
    try:
        import ctypes

        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def resource_path(relative: str) -> str:
    """Ruta a un recurso, funcione desde el codigo o desde el .exe."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return os.path.join(base, relative)
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, relative)


class App:
    """Ventana principal."""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.config = config_module.load()
        self.attachments: list[str] = []

        self._queue: "queue.Queue[tuple]" = queue.Queue()
        self._worker: threading.Thread | None = None
        self._cancel = threading.Event()
        self._counter_job: str | None = None

        self._setup_window()
        self._setup_style()
        self._build_menu()
        self._build_ui()
        self._restore_preferences()
        self._update_counter()

    # ------------------------------------------------------------------ setup

    def _setup_window(self) -> None:
        self.root.title(APP_NAME)
        self.root.minsize(*MIN_SIZE)
        geometry = self.config.get("geometry") or ""
        self.root.geometry(geometry if "x" in geometry else DEFAULT_GEOMETRY)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        icon = resource_path(os.path.join("assets", "icon.ico"))
        if is_windows() and os.path.isfile(icon):
            try:
                self.root.iconbitmap(icon)
            except Exception:
                pass

    def _setup_style(self) -> None:
        style = ttk.Style(self.root)
        if "vista" in style.theme_names():
            style.theme_use("vista")
        elif "clam" in style.theme_names():
            style.theme_use("clam")

        family = "Segoe UI" if is_windows() else "TkDefaultFont"
        try:
            import tkinter.font as tkfont

            for name in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont"):
                font = tkfont.nametofont(name)
                if is_windows():
                    font.configure(family=family, size=10)
            scaling = self.root.winfo_fpixels("1i") / 72.0
            if scaling > 0:
                self.root.tk.call("tk", "scaling", scaling)
        except Exception:
            pass

        style.configure("Field.TLabel", font=(family, 10, "bold"))
        style.configure("Hint.TLabel", foreground="#666666")
        style.configure("Create.TButton", font=(family, 11, "bold"), padding=(18, 8))

        self.text_font = (family if is_windows() else "TkTextFont", 10)
        self.mono_font = ("Consolas" if is_windows() else "TkFixedFont", 10)

    def _build_menu(self) -> None:
        menubar = tk.Menu(self.root)

        archivo = tk.Menu(menubar, tearoff=0)
        archivo.add_command(
            label="Importar destinatarios...", command=self._on_import, accelerator="Ctrl+O"
        )
        archivo.add_command(label="Adjuntar archivo...", command=self._on_attach)
        archivo.add_separator()
        archivo.add_command(label="Limpiar todo", command=self._on_clear_all)
        archivo.add_separator()
        archivo.add_command(label="Salir", command=self._on_close)
        menubar.add_cascade(label="Archivo", menu=archivo)

        ayuda = tk.Menu(menubar, tearoff=0)
        ayuda.add_command(label="Acerca de", command=self._on_about)
        menubar.add_cascade(label="Ayuda", menu=ayuda)

        self.root.config(menu=menubar)
        self.root.bind("<Control-o>", lambda _e: self._on_import())
        self.root.bind("<Control-Return>", lambda _e: self._on_create())

    def _build_ui(self) -> None:
        container = ttk.Frame(self.root, padding=PAD)
        container.pack(fill="both", expand=True)

        # Ojo con el orden: la barra de abajo se empaqueta primero para que
        # siempre tenga lugar reservado y el boton CREAR nunca quede tapado.
        self._build_bottom(container)

        paned = ttk.PanedWindow(container, orient="horizontal")
        paned.pack(fill="both", expand=True)
        paned.add(self._build_left(paned), weight=1)
        paned.add(self._build_right(paned), weight=3)

    def _build_left(self, parent: ttk.PanedWindow) -> ttk.Frame:
        frame = ttk.Frame(parent, padding=(0, 0, PAD, 0))
        frame.rowconfigure(1, weight=1)
        frame.columnconfigure(0, weight=1)

        ttk.Label(frame, text="PARA", style="Field.TLabel").grid(
            row=0, column=0, sticky="w", pady=(0, 4)
        )
        self.counter_var = tk.StringVar(value="")

        box = ttk.Frame(frame)
        box.grid(row=1, column=0, sticky="nsew")
        box.rowconfigure(0, weight=1)
        box.columnconfigure(0, weight=1)
        self.to_text = tk.Text(box, wrap="none", undo=True, font=self.mono_font, width=28)
        self.to_text.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(box, orient="vertical", command=self.to_text.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.to_text.configure(yscrollcommand=scroll.set)
        self.to_text.bind("<<Modified>>", self._on_to_modified)

        ttk.Label(
            frame, textvariable=self.counter_var, style="Hint.TLabel", wraplength=230
        ).grid(row=2, column=0, sticky="w", pady=(4, 0))

        buttons = ttk.Frame(frame)
        buttons.grid(row=3, column=0, sticky="ew", pady=(6, 0))
        buttons.columnconfigure(0, weight=1)
        buttons.columnconfigure(1, weight=1)
        ttk.Button(buttons, text="Importar...", command=self._on_import).grid(
            row=0, column=0, sticky="ew", padx=(0, 3)
        )
        ttk.Button(buttons, text="Limpiar", command=self._on_clear_recipients).grid(
            row=0, column=1, sticky="ew", padx=(3, 0)
        )

        mode_box = ttk.LabelFrame(frame, text="Cómo se envía", padding=6)
        mode_box.grid(row=4, column=0, sticky="ew", pady=(PAD, 0))
        mode_box.columnconfigure(0, weight=1)
        self.mode_var = tk.StringVar(value=Mode.INDIVIDUAL.value)
        ttk.Radiobutton(
            mode_box,
            text="Correos únicos",
            value=Mode.INDIVIDUAL.value,
            variable=self.mode_var,
            command=self._update_counter,
        ).grid(row=0, column=0, sticky="w")
        ttk.Radiobutton(
            mode_box,
            text="Grupo (un solo correo)",
            value=Mode.GROUP.value,
            variable=self.mode_var,
            command=self._update_counter,
        ).grid(row=1, column=0, sticky="w")
        self.mode_hint_var = tk.StringVar(value="")
        ttk.Label(
            mode_box, textvariable=self.mode_hint_var, style="Hint.TLabel", wraplength=220
        ).grid(row=2, column=0, sticky="w", pady=(4, 0))

        return frame

    def _build_right(self, parent: ttk.PanedWindow) -> ttk.Frame:
        frame = ttk.Frame(parent)
        frame.rowconfigure(3, weight=1)
        frame.columnconfigure(0, weight=1)

        subject_row = ttk.Frame(frame)
        subject_row.grid(row=0, column=0, sticky="ew")
        subject_row.columnconfigure(1, weight=1)
        ttk.Label(subject_row, text="ASUNTO", style="Field.TLabel").grid(
            row=0, column=0, sticky="w", padx=(0, PAD)
        )
        self.subject_var = tk.StringVar()
        self.subject_entry = ttk.Entry(subject_row, textvariable=self.subject_var)
        self.subject_entry.grid(row=0, column=1, sticky="ew")
        self.cc_toggle_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            subject_row,
            text="CC / CCO",
            variable=self.cc_toggle_var,
            command=self._on_toggle_cc,
        ).grid(row=0, column=2, sticky="e", padx=(PAD, 0))

        self.cc_frame = ttk.Frame(frame)
        self.cc_frame.grid(row=1, column=0, sticky="ew", pady=(6, 0))
        self.cc_frame.columnconfigure(1, weight=1)
        ttk.Label(self.cc_frame, text="CC").grid(row=0, column=0, sticky="w", padx=(0, PAD))
        self.cc_var = tk.StringVar()
        ttk.Entry(self.cc_frame, textvariable=self.cc_var).grid(row=0, column=1, sticky="ew")
        ttk.Label(self.cc_frame, text="CCO").grid(
            row=1, column=0, sticky="w", padx=(0, PAD), pady=(4, 0)
        )
        self.bcc_var = tk.StringVar()
        ttk.Entry(self.cc_frame, textvariable=self.bcc_var).grid(
            row=1, column=1, sticky="ew", pady=(4, 0)
        )
        self.cc_frame.grid_remove()

        ttk.Label(frame, text="BODY", style="Field.TLabel").grid(
            row=2, column=0, sticky="w", pady=(PAD, 4)
        )

        body_box = ttk.Frame(frame)
        body_box.grid(row=3, column=0, sticky="nsew")
        body_box.rowconfigure(0, weight=1)
        body_box.columnconfigure(0, weight=1)
        self.body_text = tk.Text(body_box, wrap="word", undo=True, font=self.text_font)
        self.body_text.grid(row=0, column=0, sticky="nsew")
        body_scroll = ttk.Scrollbar(body_box, orient="vertical", command=self.body_text.yview)
        body_scroll.grid(row=0, column=1, sticky="ns")
        self.body_text.configure(yscrollcommand=body_scroll.set)

        self.attach_frame = ttk.Frame(frame)
        self.attach_frame.grid(row=4, column=0, sticky="ew", pady=(6, 0))
        self.attach_frame.columnconfigure(0, weight=1)
        self.attach_list = tk.Listbox(
            self.attach_frame,
            height=2,
            font=self.text_font,
            selectmode="extended",
            exportselection=False,
        )
        self.attach_list.grid(row=0, column=0, sticky="ew")
        ttk.Button(self.attach_frame, text="Quitar", command=self._on_remove_attachment).grid(
            row=0, column=1, sticky="n", padx=(6, 0)
        )
        self.attach_frame.grid_remove()

        return frame

    def _build_bottom(self, container: ttk.Frame) -> None:
        bar = ttk.Frame(container)
        bar.pack(side="bottom", fill="x", pady=(PAD, 0))
        bar.columnconfigure(2, weight=1)

        ttk.Button(bar, text="Adjuntar...", command=self._on_attach).grid(
            row=0, column=0, sticky="w"
        )
        self.signature_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(bar, text="Incluir mi firma", variable=self.signature_var).grid(
            row=0, column=1, sticky="w", padx=(PAD, 0)
        )

        self.status_var = tk.StringVar(value="")
        ttk.Label(bar, textvariable=self.status_var, style="Hint.TLabel", anchor="e").grid(
            row=0, column=2, sticky="ew", padx=PAD
        )

        self.progress = ttk.Progressbar(bar, mode="determinate", length=160)
        self.progress.grid(row=0, column=3, sticky="e", padx=(0, PAD))
        self.progress.grid_remove()

        self.create_button = ttk.Button(
            bar, text="CREAR", style="Create.TButton", command=self._on_create
        )
        self.create_button.grid(row=0, column=4, sticky="e")

    def _restore_preferences(self) -> None:
        mode = self.config.get("mode", Mode.INDIVIDUAL.value)
        self.mode_var.set(mode if mode in (m.value for m in Mode) else Mode.INDIVIDUAL.value)
        self.signature_var.set(bool(self.config.get("include_signature", True)))
        if self.config.get("show_cc"):
            self.cc_toggle_var.set(True)
            self.cc_frame.grid()

    # --------------------------------------------------------------- acciones

    def _on_to_modified(self, _event=None) -> None:
        self.to_text.edit_modified(False)
        if self._counter_job is not None:
            try:
                self.root.after_cancel(self._counter_job)
            except Exception:
                pass
        self._counter_job = self.root.after(250, self._update_counter)

    def _update_counter(self) -> None:
        self._counter_job = None
        raw = self.to_text.get("1.0", "end-1c")
        if not raw.strip():
            self.counter_var.set("Una dirección por línea.")
            self._update_mode_hint(0)
            return

        result = parse_recipients(raw)
        total = len(result.recipients)
        parts = [f"{total} destinatario" + ("" if total == 1 else "s")]
        if result.invalid:
            parts.append(f"{len(result.invalid)} con error")
        if result.duplicates:
            parts.append(f"{len(result.duplicates)} repetido" + ("" if len(result.duplicates) == 1 else "s"))
        self.counter_var.set(" | ".join(parts))
        self._update_mode_hint(total)

    def _update_mode_hint(self, total: int) -> None:
        if self.mode_var.get() == Mode.GROUP.value:
            self.mode_hint_var.set(
                "Se crea 1 borrador con todos en Para. Cada uno ve al resto."
            )
        else:
            self.mode_hint_var.set(
                f"Se crean {total} borradores, uno por persona. Nadie ve a los demás."
            )

    def _on_toggle_cc(self) -> None:
        if self.cc_toggle_var.get():
            self.cc_frame.grid()
        else:
            self.cc_frame.grid_remove()

    def _on_clear_recipients(self) -> None:
        self.to_text.delete("1.0", "end")
        self._update_counter()

    def _on_clear_all(self) -> None:
        if not messagebox.askyesno(
            APP_NAME, "Se va a borrar todo lo cargado. ¿Continuar?", parent=self.root
        ):
            return
        self.to_text.delete("1.0", "end")
        self.body_text.delete("1.0", "end")
        self.subject_var.set("")
        self.cc_var.set("")
        self.bcc_var.set("")
        self.attachments.clear()
        self._refresh_attachments()
        self.status_var.set("")
        self._update_counter()

    def _on_import(self) -> None:
        initial = self.config.get("last_import_dir") or os.path.expanduser("~")
        path = filedialog.askopenfilename(
            parent=self.root,
            title="Importar destinatarios",
            filetypes=FILE_TYPES,
            initialdir=initial if os.path.isdir(initial) else os.path.expanduser("~"),
        )
        if not path:
            return
        self.config["last_import_dir"] = os.path.dirname(path)
        try:
            addresses = import_addresses(path)
        except FileImportError as exc:
            messagebox.showerror(APP_NAME, str(exc), parent=self.root)
            return

        current = self.to_text.get("1.0", "end-1c").rstrip()
        prefix = current + "\n" if current else ""
        self.to_text.delete("1.0", "end")
        self.to_text.insert("1.0", prefix + "\n".join(addresses))
        self._update_counter()
        self.status_var.set(
            f"Se importaron {len(addresses)} direcciones de {os.path.basename(path)}"
        )

    def _on_attach(self) -> None:
        initial = self.config.get("last_attachment_dir") or os.path.expanduser("~")
        paths = filedialog.askopenfilenames(
            parent=self.root,
            title="Adjuntar archivos",
            initialdir=initial if os.path.isdir(initial) else os.path.expanduser("~"),
        )
        if not paths:
            return
        self.config["last_attachment_dir"] = os.path.dirname(paths[0])
        for path in paths:
            if path not in self.attachments:
                self.attachments.append(path)
        self._refresh_attachments()

    def _on_remove_attachment(self) -> None:
        selection = list(self.attach_list.curselection())
        if not selection:
            self.attachments.clear()
        else:
            for index in reversed(selection):
                del self.attachments[index]
        self._refresh_attachments()

    def _refresh_attachments(self) -> None:
        self.attach_list.delete(0, "end")
        for path in self.attachments:
            self.attach_list.insert("end", os.path.basename(path))
        if self.attachments:
            self.attach_list.configure(height=min(4, max(2, len(self.attachments))))
            self.attach_frame.grid()
        else:
            self.attach_frame.grid_remove()

    def _on_about(self) -> None:
        messagebox.showinfo(
            f"Acerca de {APP_NAME}",
            f"{APP_NAME} {__version__}\n\n"
            "Crea borradores en Outlook de escritorio.\n"
            "Nunca envía correos: solo los deja en la carpeta Borradores.\n"
            "No guarda usuarios ni contraseñas.",
            parent=self.root,
        )

    # ----------------------------------------------------------------- crear

    def _on_create(self) -> None:
        if self._worker is not None and self._worker.is_alive():
            self._cancel.set()
            self.status_var.set("Cancelando...")
            return

        parsed = parse_recipients(self.to_text.get("1.0", "end-1c"))
        if not parsed.recipients:
            messagebox.showerror(
                APP_NAME,
                "No hay ningún destinatario válido cargado en PARA.",
                parent=self.root,
            )
            return

        if not self._confirm_invalid(parsed, "PARA"):
            return

        cc = parse_recipients(self.cc_var.get())
        bcc = parse_recipients(self.bcc_var.get())
        if not self._confirm_invalid(cc, "CC") or not self._confirm_invalid(bcc, "CCO"):
            return

        subject = self.subject_var.get().strip()
        body = self.body_text.get("1.0", "end-1c")

        if not subject and not messagebox.askyesno(
            APP_NAME, "El asunto está vacío. ¿Crear los borradores igual?", parent=self.root
        ):
            return
        if not body.strip() and not messagebox.askyesno(
            APP_NAME, "El cuerpo está vacío. ¿Crear los borradores igual?", parent=self.root
        ):
            return

        faltantes = [p for p in self.attachments if not os.path.isfile(p)]
        if faltantes:
            messagebox.showerror(
                APP_NAME,
                "No se encuentran estos archivos adjuntos:\n\n" + "\n".join(faltantes),
                parent=self.root,
            )
            return

        mode = Mode(self.mode_var.get())
        specs = build_specs(
            recipients=parsed.recipients,
            subject=subject,
            body=body,
            mode=mode,
            cc=cc.recipients,
            bcc=bcc.recipients,
            attachments=self.attachments,
        )

        if not self._confirm_create(specs, parsed, mode, cc, bcc):
            return

        self._start_worker(specs)

    def _confirm_invalid(self, parsed: ParseResult, field: str) -> bool:
        if not parsed.invalid:
            return True
        muestra = "\n".join(parsed.invalid[:10])
        extra = "" if len(parsed.invalid) <= 10 else f"\n(+{len(parsed.invalid) - 10} más)"
        return messagebox.askyesno(
            APP_NAME,
            f"En {field} hay {len(parsed.invalid)} entradas que no parecen "
            f"correos válidos y se van a ignorar:\n\n{muestra}{extra}\n\n¿Continuar?",
            parent=self.root,
        )

    def _confirm_create(
        self,
        specs: list[DraftSpec],
        parsed: ParseResult,
        mode: Mode,
        cc: ParseResult,
        bcc: ParseResult,
    ) -> bool:
        total = len(specs)
        if mode is Mode.GROUP:
            resumen = (
                f"Se va a crear 1 borrador con {len(parsed.recipients)} "
                "destinatarios en Para."
            )
        else:
            resumen = f"Se van a crear {total} borradores, uno por destinatario."

        detalle = [resumen, ""]
        detalle.append(f"Asunto: {self.subject_var.get().strip() or '(vacío)'}")
        if cc.recipients or bcc.recipients:
            copia = f"CC: {len(cc.recipients)} | CCO: {len(bcc.recipients)}"
            if mode is Mode.INDIVIDUAL and total > 1:
                copia += f"  (se repiten en cada uno de los {total} borradores)"
            detalle.append(copia)
        if self.attachments:
            detalle.append(f"Adjuntos: {len(self.attachments)}")
        detalle.append("")
        detalle.append("Quedan en Borradores. No se envía nada.")

        return messagebox.askyesno(APP_NAME, "\n".join(detalle), parent=self.root)

    def _start_worker(self, specs: list[DraftSpec]) -> None:
        self._cancel.clear()
        self.create_button.configure(text="CANCELAR")
        self.progress.configure(value=0, maximum=len(specs))
        self.progress.grid()
        self.status_var.set(f"Creando 0 de {len(specs)}...")

        include_signature = bool(self.signature_var.get())
        self._worker = threading.Thread(
            target=self._work, args=(specs, include_signature), daemon=True
        )
        self._worker.start()
        self.root.after(80, self._poll_queue)

    def _work(self, specs: list[DraftSpec], include_signature: bool) -> None:
        """Se ejecuta en un hilo aparte para no congelar la ventana."""
        release = com_initialize()
        backend = None
        created = 0
        errors: list[str] = []
        try:
            try:
                backend = create_backend()
            except OutlookError as exc:
                self._queue.put(("fatal", str(exc)))
                return
            except Exception as exc:  # pragma: no cover - defensivo
                self._queue.put(
                    ("fatal", f"No se pudo iniciar Outlook.\n\nDetalle: {exc}")
                )
                return

            for index, spec in enumerate(specs, start=1):
                if self._cancel.is_set():
                    break
                try:
                    backend.create_draft(spec, include_signature=include_signature)
                    created += 1
                except OutlookError as exc:
                    errors.append(f"{spec.label}: {exc}")
                except Exception as exc:  # pragma: no cover - defensivo
                    errors.append(f"{spec.label}: {exc}")
                self._queue.put(("progress", index, len(specs)))

            self._queue.put(
                (
                    "done",
                    created,
                    errors,
                    self._cancel.is_set(),
                    isinstance(backend, DryRunBackend),
                )
            )
        finally:
            if backend is not None:
                backend.close()
            release()

    def _poll_queue(self) -> None:
        try:
            while True:
                message = self._queue.get_nowait()
                kind = message[0]
                if kind == "progress":
                    _, index, total = message
                    self.progress.configure(value=index)
                    self.status_var.set(f"Creando {index} de {total}...")
                elif kind == "fatal":
                    self._finish()
                    messagebox.showerror(APP_NAME, message[1], parent=self.root)
                    self.status_var.set("No se pudo conectar con Outlook.")
                    return
                elif kind == "done":
                    _, created, errors, cancelled, dry_run = message
                    self._finish()
                    self._report(created, errors, cancelled, dry_run)
                    return
        except queue.Empty:
            pass

        if self._worker is not None and self._worker.is_alive():
            self.root.after(80, self._poll_queue)
        else:
            self._finish()

    def _finish(self) -> None:
        self._worker = None
        self._cancel.clear()
        self.create_button.configure(text="CREAR")
        self.progress.grid_remove()

    def _report(self, created: int, errors: list[str], cancelled: bool, dry_run: bool) -> None:
        palabra = "borrador" if created == 1 else "borradores"
        sufijo = "" if created == 1 else "s"
        if dry_run:
            self.status_var.set(f"Modo prueba: {created} {palabra} simulado{sufijo}.")
            messagebox.showinfo(
                APP_NAME,
                f"Modo prueba (no hay Outlook de escritorio en este sistema).\n\n"
                f"Se habrían creado {created} {palabra}.",
                parent=self.root,
            )
            return

        if errors:
            muestra = "\n".join(errors[:5])
            extra = "" if len(errors) <= 5 else f"\n(+{len(errors) - 5} más)"
            self.status_var.set(f"{created} creados, {len(errors)} con error.")
            messagebox.showwarning(
                APP_NAME,
                f"Se crearon {created} {palabra}, pero {len(errors)} fallaron:\n\n"
                f"{muestra}{extra}",
                parent=self.root,
            )
            return

        if cancelled:
            self.status_var.set(f"Cancelado. Se alcanzaron a crear {created}.")
            messagebox.showinfo(
                APP_NAME,
                f"Cancelado.\n\nSe crearon {created} {palabra} antes de parar.",
                parent=self.root,
            )
            return

        self.status_var.set(f"Listo: {created} {palabra} en Outlook.")
        if messagebox.askyesno(
            APP_NAME,
            f"Listo. Se crearon {created} {palabra} en Outlook.\n\n"
            "¿Abrir la carpeta Borradores?",
            parent=self.root,
        ):
            open_drafts_folder()

    # ----------------------------------------------------------------- cierre

    def _on_close(self) -> None:
        if self._worker is not None and self._worker.is_alive():
            if not messagebox.askyesno(
                APP_NAME,
                "Se están creando borradores. ¿Cerrar igual?",
                parent=self.root,
            ):
                return
            self._cancel.set()

        if self._counter_job is not None:
            try:
                self.root.after_cancel(self._counter_job)
            except Exception:
                pass
            self._counter_job = None

        self.config["mode"] = self.mode_var.get()
        self.config["include_signature"] = bool(self.signature_var.get())
        self.config["show_cc"] = bool(self.cc_toggle_var.get())
        try:
            self.config["geometry"] = self.root.winfo_geometry()
        except Exception:
            pass
        config_module.save(self.config)
        self.root.destroy()


def main() -> int:
    _enable_dpi_awareness()
    root = tk.Tk()
    App(root)
    root.mainloop()
    return 0
