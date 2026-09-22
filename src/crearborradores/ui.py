"""Interfaz gráfica de CrearBorradores.

La apariencia (paleta, tipografías y controles dibujados a mano) vive en
theme.py; acá está la ventana y toda la lógica de uso.
"""

from __future__ import annotations

import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from . import APP_NAME, __version__
from . import config as config_module
from . import theme
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

GAP = 14
DEFAULT_GEOMETRY = "1060x660"
MIN_SIZE = (900, 560)
LEFT_WIDTH = 290
MAX_CHIPS = 3


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
    """Ruta a un recurso, funcione desde el código o desde el .exe."""
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
        self.theme_name = theme.resolve_theme(self.config.get("theme", "auto"))
        self.pal = theme.get_palette(self.theme_name)
        self.attachments: list[str] = []

        self._queue: "queue.Queue[tuple]" = queue.Queue()
        self._worker: threading.Thread | None = None
        self._cancel = threading.Event()
        self._counter_job: str | None = None

        self.fonts = theme.Fonts(root)
        self.style = theme.style_ttk(root, self.pal)

        self._setup_window()
        self._build_ui()
        self._restore_preferences()
        self._update_counter()

    # ------------------------------------------------------------------ setup

    def _setup_window(self) -> None:
        self.root.title(APP_NAME)
        self.root.minsize(*MIN_SIZE)
        self.root.configure(bg=self.pal["bg"])
        geometry = self.config.get("geometry") or ""
        self.root.geometry(geometry if "x" in geometry else DEFAULT_GEOMETRY)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        try:
            scaling = self.root.winfo_fpixels("1i") / 72.0
            if scaling > 0:
                self.root.tk.call("tk", "scaling", scaling)
        except Exception:
            pass

        icon = resource_path(os.path.join("assets", "icon.ico"))
        if is_windows() and os.path.isfile(icon):
            try:
                self.root.iconbitmap(icon)
            except Exception:
                pass

        self.root.bind("<Control-o>", lambda _e: self._on_import())
        self.root.bind("<Control-Return>", lambda _e: self._on_create())

    # ------------------------------------------------------------- armado

    def _eyebrow(self, parent: tk.Misc, text: str) -> tk.Label:
        """Etiqueta chiquita en mayúsculas que titula cada campo."""
        return tk.Label(
            parent,
            text=text,
            bg=parent.cget("bg"),
            fg=self.pal["text_muted"],
            font=self.fonts.label,
        )

    def _muted(self, parent: tk.Misc, textvariable=None, text="", **kwargs) -> tk.Label:
        return tk.Label(
            parent,
            text=text,
            textvariable=textvariable,
            bg=parent.cget("bg"),
            fg=self.pal["text_muted"],
            font=self.fonts.small,
            justify="left",
            anchor="w",
            **kwargs,
        )

    def _text_area(self, parent: tk.Misc, **kwargs) -> tuple[theme.Field, tk.Text]:
        """Un cuadro de texto multilínea con su borde y su barra que se esconde."""
        field = theme.Field(parent, self.pal)
        field.inner.rowconfigure(0, weight=1)
        field.inner.columnconfigure(0, weight=1)
        widget = tk.Text(
            field.inner,
            bg=self.pal["surface"],
            fg=self.pal["text"],
            insertbackground=self.pal["accent"],
            selectbackground=self.pal["select"],
            selectforeground=self.pal["text"],
            relief="flat",
            bd=0,
            highlightthickness=0,
            padx=12,
            pady=10,
            spacing1=1,
            spacing3=3,
            undo=True,
            **kwargs,
        )
        widget.grid(row=0, column=0, sticky="nsew")
        scroll = theme.AutoScrollbar(
            field.inner,
            orient="vertical",
            style="App.Vertical.TScrollbar",
            command=widget.yview,
        )
        scroll.grid(row=0, column=1, sticky="ns", padx=(0, 4), pady=6)
        widget.configure(yscrollcommand=scroll.set)
        field.track(widget)
        return field, widget

    def _build_ui(self) -> None:
        outer = tk.Frame(self.root, bg=self.pal["bg"], padx=16, pady=14)
        outer.pack(fill="both", expand=True)

        # El encabezado y la barra de abajo reservan su lugar antes que el
        # cuerpo, para que nunca queden tapados al achicar la ventana.
        self._build_header(outer)
        self._build_bottom(outer)

        body = tk.Frame(outer, bg=self.pal["bg"])
        body.pack(fill="both", expand=True, pady=(12, 0))
        body.columnconfigure(0, minsize=LEFT_WIDTH, weight=0)
        body.columnconfigure(1, weight=1)
        body.rowconfigure(0, weight=1)

        left = theme.Card(body, self.pal)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, GAP))
        right = theme.Card(body, self.pal)
        right.grid(row=0, column=1, sticky="nsew")

        self._build_left(left.inner)
        self._build_right(right.inner)

    def _build_header(self, parent: tk.Frame) -> None:
        bar = tk.Frame(parent, bg=self.pal["bg"])
        bar.pack(side="top", fill="x")

        tk.Label(
            bar,
            text="Crear borradores",
            bg=self.pal["bg"],
            fg=self.pal["text"],
            font=self.fonts.title,
        ).pack(side="left")
        tk.Label(
            bar,
            text="para Outlook",
            bg=self.pal["bg"],
            fg=self.pal["text_muted"],
            font=self.fonts.small,
        ).pack(side="left", padx=(10, 0), pady=(3, 0))

        theme.RoundedButton(
            bar, "?", self._on_about,
            palette=self.pal, fonts=self.fonts, kind="ghost", width=32, height=30,
        ).pack(side="right")
        theme.RoundedButton(
            bar, "Limpiar todo", self._on_clear_all,
            palette=self.pal, fonts=self.fonts, kind="ghost", height=30,
        ).pack(side="right", padx=(0, 4))

    def _build_left(self, parent: tk.Frame) -> None:
        parent.rowconfigure(1, weight=1)
        parent.columnconfigure(0, weight=1)

        self._eyebrow(parent, "PARA").grid(row=0, column=0, sticky="w", pady=(0, 7))

        field, self.to_text = self._text_area(
            parent, wrap="none", font=self.fonts.mono, width=24, height=6
        )
        field.grid(row=1, column=0, sticky="nsew")
        self.to_text.bind("<<Modified>>", self._on_to_modified)
        self._install_placeholder(self.to_text, "ana@empresa.com\nluis@empresa.com")

        self.counter_var = tk.StringVar(value="")
        self._muted(parent, textvariable=self.counter_var, wraplength=LEFT_WIDTH - 40).grid(
            row=2, column=0, sticky="ew", pady=(8, 0)
        )

        buttons = tk.Frame(parent, bg=self.pal["surface"])
        buttons.grid(row=3, column=0, sticky="w", pady=(10, 0))
        theme.RoundedButton(
            buttons, "Importar", self._on_import,
            palette=self.pal, fonts=self.fonts, kind="secondary", height=32,
        ).pack(side="left")
        theme.RoundedButton(
            buttons, "Limpiar", self._on_clear_recipients,
            palette=self.pal, fonts=self.fonts, kind="ghost", height=32,
        ).pack(side="left", padx=(6, 0))

        self._eyebrow(parent, "ENVÍO").grid(row=4, column=0, sticky="w", pady=(22, 7))

        self.mode_var = tk.StringVar(value=Mode.INDIVIDUAL.value)
        theme.Segmented(
            parent,
            [(Mode.INDIVIDUAL.value, "Uno a uno"), (Mode.GROUP.value, "Grupo")],
            self.mode_var,
            palette=self.pal,
            fonts=self.fonts,
            command=self._update_counter,
        ).grid(row=5, column=0, sticky="ew")

        self.mode_hint_var = tk.StringVar(value="")
        self._muted(parent, textvariable=self.mode_hint_var, wraplength=LEFT_WIDTH - 40).grid(
            row=6, column=0, sticky="ew", pady=(8, 0)
        )

    def _build_right(self, parent: tk.Frame) -> None:
        parent.rowconfigure(4, weight=1)
        parent.columnconfigure(0, weight=1)

        head = tk.Frame(parent, bg=self.pal["surface"])
        head.grid(row=0, column=0, sticky="ew", pady=(0, 7))
        self._eyebrow(head, "ASUNTO").pack(side="left", pady=(6, 0))
        self.cc_toggle_var = tk.BooleanVar(value=False)
        self.cc_button = theme.RoundedButton(
            head, "+  CC y CCO", self._on_toggle_cc,
            palette=self.pal, fonts=self.fonts, kind="link", height=28,
        )
        self.cc_button.pack(side="right")

        subject_field = theme.Field(parent, self.pal)
        subject_field.grid(row=1, column=0, sticky="ew")
        self.subject_var = tk.StringVar()
        subject_entry = tk.Entry(
            subject_field.inner,
            textvariable=self.subject_var,
            bg=self.pal["surface"],
            fg=self.pal["text"],
            insertbackground=self.pal["accent"],
            selectbackground=self.pal["select"],
            selectforeground=self.pal["text"],
            relief="flat",
            bd=0,
            highlightthickness=0,
            font=self.fonts.body,
        )
        subject_entry.pack(fill="x", padx=12, pady=10)
        subject_field.track(subject_entry)

        # CC y CCO van lado a lado, con el titulito arriba, para que el
        # borde izquierdo quede alineado con ASUNTO y MENSAJE.
        self.cc_frame = tk.Frame(parent, bg=self.pal["surface"])
        self.cc_frame.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        self.cc_frame.columnconfigure(0, weight=1, uniform="cc")
        self.cc_frame.columnconfigure(1, weight=1, uniform="cc")
        self.cc_var = tk.StringVar()
        self.bcc_var = tk.StringVar()
        for column, (text, variable) in enumerate(
            (("CC", self.cc_var), ("CCO", self.bcc_var))
        ):
            holder = tk.Frame(self.cc_frame, bg=self.pal["surface"])
            holder.grid(
                row=0,
                column=column,
                sticky="ew",
                padx=(0, 7) if column == 0 else (7, 0),
            )
            self._eyebrow(holder, text).pack(anchor="w", pady=(0, 6))
            box = theme.Field(holder, self.pal)
            box.pack(fill="x")
            entry = tk.Entry(
                box.inner,
                textvariable=variable,
                bg=self.pal["surface"],
                fg=self.pal["text"],
                insertbackground=self.pal["accent"],
                selectbackground=self.pal["select"],
                selectforeground=self.pal["text"],
                relief="flat",
                bd=0,
                highlightthickness=0,
                font=self.fonts.body,
            )
            entry.pack(fill="x", padx=12, pady=9)
            box.track(entry)
        self.cc_frame.grid_remove()

        self._eyebrow(parent, "MENSAJE").grid(row=3, column=0, sticky="w", pady=(18, 7))

        field, self.body_text = self._text_area(
            parent, wrap="word", font=self.fonts.body, height=8
        )
        field.grid(row=4, column=0, sticky="nsew")
        self._install_placeholder(self.body_text, "Escribí acá el cuerpo del correo...")

    def _build_bottom(self, parent: tk.Frame) -> None:
        bar = tk.Frame(parent, bg=self.pal["bg"])
        bar.pack(side="bottom", fill="x", pady=(GAP, 0))

        self.create_button = theme.RoundedButton(
            bar, "CREAR", self._on_create,
            palette=self.pal, fonts=self.fonts, kind="accent", width=150, height=42,
        )
        self.create_button.pack(side="right")

        holder = tk.Frame(bar, bg=self.pal["bg"], width=150, height=42)
        holder.pack(side="right", padx=(0, 14))
        holder.pack_propagate(False)
        self.progress = ttk.Progressbar(
            holder, style="App.Horizontal.TProgressbar", mode="determinate"
        )

        self.status_var = tk.StringVar(value="")
        tk.Label(
            bar,
            textvariable=self.status_var,
            bg=self.pal["bg"],
            fg=self.pal["text_soft"],
            font=self.fonts.small,
            anchor="e",
        ).pack(side="right", padx=(0, 4))

        self.signature_var = tk.BooleanVar(value=True)
        theme.CheckBox(
            bar, "Incluir mi firma", self.signature_var,
            palette=self.pal, fonts=self.fonts,
        ).pack(side="right", padx=(16, 18))

        theme.RoundedButton(
            bar, "+  Adjuntar", self._on_attach,
            palette=self.pal, fonts=self.fonts, kind="secondary", height=34,
        ).pack(side="left")
        self.chips_frame = tk.Frame(bar, bg=self.pal["bg"])
        self.chips_frame.pack(side="left", padx=(8, 0))

    def _restore_preferences(self) -> None:
        mode = self.config.get("mode", Mode.INDIVIDUAL.value)
        self.mode_var.set(mode if mode in (m.value for m in Mode) else Mode.INDIVIDUAL.value)
        self.signature_var.set(bool(self.config.get("include_signature", True)))
        self.cc_toggle_var.set(bool(self.config.get("show_cc")))
        self._apply_cc_visibility()

    # ------------------------------------------------- texto de ejemplo gris

    def _install_placeholder(self, widget: tk.Text, text: str) -> None:
        """Muestra un ejemplo gris mientras el cuadro esté vacío.

        Va como una etiqueta apoyada encima del cuadro, no como contenido,
        así no hay manera de que termine mezclado con lo que se escriba.
        """
        label = tk.Label(
            widget,
            text=text,
            bg=self.pal["surface"],
            fg=self.pal["text_muted"],
            font=widget.cget("font"),
            justify="left",
            anchor="nw",
            bd=0,
            padx=0,
            pady=0,
            highlightthickness=0,
        )
        label.bind("<Button-1>", lambda _e: widget.focus_set())

        def refresh(_event=None) -> None:
            widget.edit_modified(False)
            if widget.get("1.0", "end-1c"):
                label.place_forget()
            else:
                label.place(x=0, y=1)

        widget.bind("<<Modified>>", refresh, add="+")
        refresh()

    def _text_value(self, widget: tk.Text) -> str:
        return widget.get("1.0", "end-1c")

    def _clear_text(self, widget: tk.Text) -> None:
        widget.delete("1.0", "end")

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
        raw = self._text_value(self.to_text)
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
            repetidos = len(result.duplicates)
            parts.append(f"{repetidos} repetido" + ("" if repetidos == 1 else "s"))
        self.counter_var.set(" · ".join(parts))
        self._update_mode_hint(total)

    def _update_mode_hint(self, total: int) -> None:
        if self.mode_var.get() == Mode.GROUP.value:
            self.mode_hint_var.set("Un solo borrador con todos en Para. Cada uno ve al resto.")
        elif total:
            self.mode_hint_var.set(
                f"{total} borradores, uno por persona. Nadie ve a los demás."
            )
        else:
            self.mode_hint_var.set("Un borrador por persona. Nadie ve a los demás.")

    def _on_toggle_cc(self) -> None:
        self.cc_toggle_var.set(not self.cc_toggle_var.get())
        self._apply_cc_visibility()

    def _apply_cc_visibility(self) -> None:
        if self.cc_toggle_var.get():
            self.cc_frame.grid()
            self.cc_button.configure_text("Ocultar CC y CCO")
        else:
            self.cc_frame.grid_remove()
            self.cc_button.configure_text("+  CC y CCO")

    def _on_clear_recipients(self) -> None:
        self._clear_text(self.to_text)
        self._update_counter()

    def _on_clear_all(self) -> None:
        if not messagebox.askyesno(
            APP_NAME, "Se va a borrar todo lo cargado. ¿Continuar?", parent=self.root
        ):
            return
        self._clear_text(self.to_text)
        self._clear_text(self.body_text)
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

        current = self._text_value(self.to_text).rstrip()
        prefix = current + "\n" if current else ""
        self.to_text.delete("1.0", "end")
        self.to_text.insert("1.0", prefix + "\n".join(addresses))
        self._update_counter()
        self.status_var.set(
            f"{len(addresses)} direcciones importadas de {os.path.basename(path)}"
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

    def _remove_attachment(self, path: str) -> None:
        if path in self.attachments:
            self.attachments.remove(path)
        self._refresh_attachments()

    def _refresh_attachments(self) -> None:
        for child in self.chips_frame.winfo_children():
            child.destroy()
        for path in self.attachments[:MAX_CHIPS]:
            theme.Chip(
                self.chips_frame,
                os.path.basename(path),
                palette=self.pal,
                fonts=self.fonts,
                on_close=lambda p=path: self._remove_attachment(p),
            ).pack(side="left", padx=(0, 6))
        extra = len(self.attachments) - MAX_CHIPS
        if extra > 0:
            self._muted(self.chips_frame, text=f"+{extra} más").pack(side="left")

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

        parsed = parse_recipients(self._text_value(self.to_text))
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
        body = self._text_value(self.body_text)

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
        self.create_button.configure_text("CANCELAR")
        self.progress.configure(value=0, maximum=len(specs))
        self.progress.pack(fill="x", expand=True)
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
        self.create_button.configure_text("CREAR")
        self.progress.pack_forget()

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
