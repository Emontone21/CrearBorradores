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
from . import variables as vars_mod
from .drafts import (
    DraftSpec,
    Mode,
    build_merge_rows,
    build_merge_specs,
    build_specs,
)
from .emails import parse_recipients, parse_rows
from .importers import (
    FILE_TYPES,
    FileImportError,
    Table,
    import_addresses,
    read_table,
)
from .variables import Kind, Variable
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
VARS_WIDTH = 260
WIDE_GEOMETRY = 1300
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
        self.variables: list[Variable] = []
        self._var_widgets: dict[str, dict] = {}
        self._widened = False

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

    def _text_area(
        self, parent: tk.Misc, horizontal: bool = False, **kwargs
    ) -> tuple[theme.Field, tk.Text]:
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

        if horizontal:
            # Sin esto, un valor largo queda cortado y no hay forma de verlo.
            scroll_x = theme.AutoScrollbar(
                field.inner,
                orient="horizontal",
                style="App.Horizontal.TScrollbar",
                command=widget.xview,
            )
            scroll_x.grid(row=1, column=0, sticky="ew", padx=6, pady=(0, 4))
            widget.configure(xscrollcommand=scroll_x.set)

        field.track(widget)
        return field, widget

    def _build_ui(self) -> None:
        outer = tk.Frame(self.root, bg=self.pal["bg"], padx=16, pady=14)
        outer.pack(fill="both", expand=True)

        # El encabezado y la barra de abajo reservan su lugar antes que el
        # cuerpo, para que nunca queden tapados al achicar la ventana.
        self._build_header(outer)
        self._build_bottom(outer)

        self.body = tk.Frame(outer, bg=self.pal["bg"])
        self.body.pack(fill="both", expand=True, pady=(12, 0))
        self.body.columnconfigure(0, minsize=LEFT_WIDTH, weight=0)
        self.body.columnconfigure(1, minsize=0, weight=0)
        self.body.columnconfigure(2, weight=1)
        self.body.rowconfigure(0, weight=1)

        left = theme.Card(self.body, self.pal)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, GAP))

        self.vars_card = theme.Card(self.body, self.pal)
        self.vars_card.grid(row=0, column=1, sticky="nsew", padx=(0, GAP))
        self.vars_card.grid_remove()

        right = theme.Card(self.body, self.pal)
        right.grid(row=0, column=2, sticky="nsew")

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
            parent, horizontal=True, wrap="none", font=self.fonts.mono, width=24, height=6
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

        theme.RoundedButton(
            parent, "+  Variable", self._on_add_variable,
            palette=self.pal, fonts=self.fonts, kind="link", height=30,
        ).grid(row=7, column=0, sticky="w", pady=(16, 0))

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

        theme.RoundedButton(
            bar, "Vista previa", self._on_preview,
            palette=self.pal, fonts=self.fonts, kind="secondary", height=38,
        ).pack(side="right", padx=(0, 10))

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

    # ------------------------------------------------------------ variables

    def _has_row_variables(self) -> bool:
        return any(v.kind is Kind.ROW for v in self.variables)

    def _row_total(self) -> int:
        """Cantidad de filas del cuadro PARA (con las que se alinean los valores)."""
        return len(parse_rows(self._text_value(self.to_text)))

    def _sync_variables(self) -> None:
        """Pasa lo que hay escrito en el panel a los objetos Variable."""
        for variable in self.variables:
            widgets = self._var_widgets.get(variable.name)
            if not widgets:
                continue
            if widgets["kind"] is Kind.ROW:
                variable.values = vars_mod.split_values(
                    widgets["text"].get("1.0", "end-1c")
                )
            else:
                variable.value = widgets["entry"].get().strip()

    def _widen_once(self) -> None:
        """Al abrirse el panel por primera vez, agranda la ventana si entra."""
        if self._widened:
            return
        self._widened = True
        try:
            actual = self.root.winfo_width()
            objetivo = min(WIDE_GEOMETRY, self.root.winfo_screenwidth() - 40)
            if objetivo > actual:
                alto = max(self.root.winfo_height(), 680)
                self.root.geometry(f"{objetivo}x{alto}")
        except Exception:
            pass

    def _rebuild_variables(self) -> None:
        """Rearma el panel entero. Se llama al agregar, quitar o importar."""
        parent = self.vars_card.inner
        for child in parent.winfo_children():
            child.destroy()
        self._var_widgets.clear()

        if not self.variables:
            self.vars_card.grid_remove()
            self.body.columnconfigure(1, minsize=0)
            return

        self.vars_card.grid()
        self.body.columnconfigure(1, minsize=VARS_WIDTH)
        self._widen_once()

        parent.columnconfigure(0, weight=1)
        head = tk.Frame(parent, bg=self.pal["surface"])
        head.grid(row=0, column=0, sticky="ew", pady=(0, 8))
        head.columnconfigure(0, weight=1)
        self._eyebrow(head, "VARIABLES").grid(row=0, column=0, sticky="w", pady=(6, 0))
        theme.RoundedButton(
            head, "+", self._on_add_variable,
            palette=self.pal, fonts=self.fonts, kind="ghost", width=28, height=26,
        ).grid(row=0, column=1, sticky="e")

        index = 1
        for variable in [v for v in self.variables if v.kind is Kind.ROW]:
            block = self._build_row_variable(parent, variable)
            block.grid(row=index, column=0, sticky="nsew", pady=(0, 12))
            parent.rowconfigure(index, weight=1)
            index += 1

        fijas = [v for v in self.variables if v.kind is Kind.FIXED]
        if fijas:
            self._eyebrow(parent, "FIJAS").grid(row=index, column=0, sticky="w", pady=(0, 7))
            index += 1
            for variable in fijas:
                block = self._build_fixed_variable(parent, variable)
                block.grid(row=index, column=0, sticky="ew", pady=(0, 7))
                index += 1

        self._update_variable_badges()

    def _variable_header(self, parent: tk.Frame, variable: Variable) -> tuple[tk.Frame, tk.Label]:
        head = tk.Frame(parent, bg=self.pal["surface"])
        head.columnconfigure(1, weight=1)

        name = tk.Label(
            head,
            text=variable.token,
            bg=self.pal["surface"],
            fg=self.pal["accent"],
            font=self.fonts.small_medium,
            cursor="hand2",
        )
        name.grid(row=0, column=0, sticky="w")
        name.bind("<Button-1>", lambda _e, n=variable.name: self._insert_token(n))

        badge = tk.Label(
            head,
            text="",
            bg=self.pal["surface"],
            fg=self.pal["text_muted"],
            font=self.fonts.small,
        )
        badge.grid(row=0, column=1, sticky="e", padx=(6, 2))

        theme.RoundedButton(
            head, "\u00d7", lambda n=variable.name: self._remove_variable(n),
            palette=self.pal, fonts=self.fonts, kind="ghost", width=24, height=22,
        ).grid(row=0, column=2, sticky="e")
        return head, badge

    def _build_row_variable(self, parent: tk.Frame, variable: Variable) -> tk.Frame:
        block = tk.Frame(parent, bg=self.pal["surface"])
        block.rowconfigure(1, weight=1)
        block.columnconfigure(0, weight=1)

        head, badge = self._variable_header(block, variable)
        head.grid(row=0, column=0, sticky="ew", pady=(0, 5))

        field, text = self._text_area(
            block, horizontal=True, wrap="none", font=self.fonts.mono, height=4, width=16
        )
        field.grid(row=1, column=0, sticky="nsew")
        if variable.values:
            text.insert("1.0", "\n".join(variable.values))
        # Tk avisa de "modificado" solo al pasar de limpio a sucio: si no se
        # reinicia acá, la primera edición del usuario pasaría desapercibida.
        text.edit_modified(False)
        text.bind("<<Modified>>", lambda _e, w=text: self._on_values_modified(w), add="+")

        self._var_widgets[variable.name] = {"kind": Kind.ROW, "text": text, "badge": badge}
        return block

    def _build_fixed_variable(self, parent: tk.Frame, variable: Variable) -> tk.Frame:
        block = tk.Frame(parent, bg=self.pal["surface"])
        block.columnconfigure(0, weight=1)

        head, _badge = self._variable_header(block, variable)
        head.grid(row=0, column=0, sticky="ew", pady=(0, 5))

        box = theme.Field(block, self.pal)
        box.grid(row=1, column=0, sticky="ew")
        entry = tk.Entry(
            box.inner,
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
        entry.pack(fill="x", padx=12, pady=8)
        entry.insert(0, variable.value)
        box.track(entry)

        self._var_widgets[variable.name] = {"kind": Kind.FIXED, "entry": entry}
        return block

    def _on_values_modified(self, widget: tk.Text) -> None:
        widget.edit_modified(False)
        self._schedule_counter()

    def _update_variable_badges(self) -> None:
        """Muestra cuántos valores tiene cada variable contra cuántas filas hay."""
        total_filas = self._row_total()
        for variable in self.variables:
            widgets = self._var_widgets.get(variable.name)
            if not widgets or widgets["kind"] is not Kind.ROW:
                continue
            cantidad = len(vars_mod.split_values(widgets["text"].get("1.0", "end-1c")))
            widgets["badge"].configure(
                text=f"{cantidad}/{total_filas}",
                fg=self.pal["text_muted"] if cantidad == total_filas else self.pal["warn"],
            )

    def _insert_token(self, name: str) -> None:
        """Pone [NOMBRE] en el mensaje, donde esté el cursor."""
        self.body_text.insert("insert", f"[{name}]")
        self.body_text.focus_set()

    def _on_add_variable(self) -> None:
        elegido = self._ask_variable()
        if elegido is None:
            return
        name, kind = elegido
        self._sync_variables()
        self.variables.append(Variable(name=name, kind=kind))
        self._rebuild_variables()

    def _remove_variable(self, name: str) -> None:
        self._sync_variables()
        variable = next((v for v in self.variables if v.name == name), None)
        if variable is None:
            return
        tiene_datos = bool(variable.values) or bool(variable.value.strip())
        if tiene_datos and not messagebox.askyesno(
            APP_NAME,
            f"¿Quitar la variable [{name}] y los valores que cargaste?",
            parent=self.root,
        ):
            return
        self.variables = [v for v in self.variables if v.name != name]
        self._rebuild_variables()
        self._update_counter()

    def _ask_variable(self) -> tuple[str, Kind] | None:
        """Ventanita para crear una variable: nombre y de qué tipo es."""
        win = tk.Toplevel(self.root)
        win.title("Nueva variable")
        win.configure(bg=self.pal["bg"])
        win.transient(self.root)
        win.resizable(False, False)

        frame = tk.Frame(win, bg=self.pal["bg"], padx=18, pady=16)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(0, weight=1)

        self._eyebrow(frame, "NOMBRE").grid(row=0, column=0, sticky="w", pady=(0, 6))
        box = theme.Field(frame, self.pal)
        box.grid(row=1, column=0, sticky="ew")
        entry = tk.Entry(
            box.inner,
            bg=self.pal["surface"],
            fg=self.pal["text"],
            insertbackground=self.pal["accent"],
            selectbackground=self.pal["select"],
            relief="flat",
            bd=0,
            highlightthickness=0,
            font=self.fonts.body,
            width=26,
        )
        entry.pack(fill="x", padx=12, pady=9)
        box.track(entry)

        self._muted(
            frame, text="En el mensaje se escribe entre corchetes: [NOMBRE]", wraplength=300
        ).grid(row=2, column=0, sticky="ew", pady=(6, 0))

        self._eyebrow(frame, "TIPO").grid(row=3, column=0, sticky="w", pady=(16, 6))
        kind_var = tk.StringVar(value=Kind.ROW.value)
        theme.Segmented(
            frame,
            [(Kind.ROW.value, "Cambia por fila"), (Kind.FIXED.value, "Fija")],
            kind_var,
            palette=self.pal,
            fonts=self.fonts,
        ).grid(row=4, column=0, sticky="ew")

        elegido: dict[str, tuple[str, Kind]] = {}

        def aceptar() -> None:
            name = vars_mod.normalize_name(entry.get())
            if not vars_mod.is_valid_name(name):
                messagebox.showerror(
                    APP_NAME,
                    "El nombre no sirve.\n\nUsá letras, números, espacios, guiones o "
                    "guiones bajos, sin corchetes.",
                    parent=win,
                )
                return
            if any(v.name == name for v in self.variables):
                messagebox.showerror(
                    APP_NAME, f"Ya existe una variable [{name}].", parent=win
                )
                return
            elegido["value"] = (name, Kind(kind_var.get()))
            win.destroy()

        buttons = tk.Frame(frame, bg=self.pal["bg"])
        buttons.grid(row=5, column=0, sticky="e", pady=(20, 0))
        theme.RoundedButton(
            buttons, "Cancelar", win.destroy,
            palette=self.pal, fonts=self.fonts, kind="ghost", height=34,
        ).pack(side="left", padx=(0, 8))
        theme.RoundedButton(
            buttons, "Agregar", aceptar,
            palette=self.pal, fonts=self.fonts, kind="accent", height=34,
        ).pack(side="left")

        entry.focus_set()
        entry.bind("<Return>", lambda _e: aceptar())
        win.bind("<Escape>", lambda _e: win.destroy())
        self._center_on_parent(win)
        win.grab_set()
        self.root.wait_window(win)
        return elegido.get("value")

    def _center_on_parent(self, win: tk.Toplevel) -> None:
        win.update_idletasks()
        try:
            x = self.root.winfo_rootx() + (self.root.winfo_width() - win.winfo_width()) // 2
            y = self.root.winfo_rooty() + (self.root.winfo_height() - win.winfo_height()) // 3
            win.geometry(f"+{max(0, x)}+{max(0, y)}")
        except Exception:
            pass

    def _ask_table_columns(self, table: Table, filename: str) -> list[str] | None:
        """Muestra lo que trae la planilla y deja elegir qué columnas usar.

        Devuelve la lista de columnas elegidas, o None si se cancela.
        """
        win = tk.Toplevel(self.root)
        win.title("Importar planilla")
        win.configure(bg=self.pal["bg"])
        win.transient(self.root)
        win.resizable(False, False)

        frame = tk.Frame(win, bg=self.pal["bg"], padx=18, pady=16)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(0, weight=1)

        filas = len(table.rows)
        origen = f'columna "{table.email_header}"' if table.email_header else "el archivo"
        tk.Label(
            frame,
            text=f"{filas} fila{'' if filas == 1 else 's'} en {filename}",
            bg=self.pal["bg"],
            fg=self.pal["text"],
            font=self.fonts.body_medium,
            anchor="w",
        ).grid(row=0, column=0, sticky="ew")
        self._muted(frame, text=f"Los correos salen de {origen}.", wraplength=360).grid(
            row=1, column=0, sticky="ew", pady=(2, 0)
        )

        self._eyebrow(frame, "COLUMNAS A USAR COMO VARIABLES").grid(
            row=2, column=0, sticky="w", pady=(18, 8)
        )
        elegidas = {name: tk.BooleanVar(value=True) for name in table.columns}
        for index, name in enumerate(table.columns):
            theme.CheckBox(
                frame, f"[{name}]", elegidas[name], palette=self.pal, fonts=self.fonts
            ).grid(row=3 + index, column=0, sticky="w", pady=1)

        fila = 3 + len(table.columns)
        if self._text_value(self.to_text).strip() or self._has_row_variables():
            self._muted(
                frame,
                text="Se reemplaza lo que ya está cargado en PARA y en las "
                "variables por fila, para que las filas queden alineadas.",
                wraplength=360,
            ).grid(row=fila, column=0, sticky="ew", pady=(14, 0))
            fila += 1

        resultado: dict[str, list[str]] = {}

        def importar() -> None:
            resultado["value"] = [n for n in table.columns if elegidas[n].get()]
            win.destroy()

        buttons = tk.Frame(frame, bg=self.pal["bg"])
        buttons.grid(row=fila, column=0, sticky="e", pady=(20, 0))
        theme.RoundedButton(
            buttons, "Cancelar", win.destroy,
            palette=self.pal, fonts=self.fonts, kind="ghost", height=34,
        ).pack(side="left", padx=(0, 8))
        theme.RoundedButton(
            buttons, "Importar", importar,
            palette=self.pal, fonts=self.fonts, kind="accent", height=34,
        ).pack(side="left")

        win.bind("<Escape>", lambda _e: win.destroy())
        win.bind("<Return>", lambda _e: importar())
        self._center_on_parent(win)
        win.grab_set()
        self.root.wait_window(win)
        return resultado.get("value")

    def _apply_table(self, table: Table, filename: str, columns: list[str]) -> None:
        """Carga una planilla con columnas: correos + una variable por columna."""
        self._sync_variables()
        self.to_text.delete("1.0", "end")
        self.to_text.insert("1.0", "\n".join(table.emails))

        for name in columns:
            variable = next((v for v in self.variables if v.name == name), None)
            if variable is None:
                variable = Variable(name=name, kind=Kind.ROW)
                self.variables.append(variable)
            variable.kind = Kind.ROW
            variable.values = table.column_values(name)

        self._rebuild_variables()
        self._update_counter()
        if columns:
            columnas = ", ".join(f"[{name}]" for name in columns)
            self.status_var.set(f"{len(table.rows)} filas de {filename} · {columnas}")
        else:
            self.status_var.set(f"{len(table.rows)} direcciones importadas de {filename}")

    # --------------------------------------------------------------- acciones

    def _on_to_modified(self, _event=None) -> None:
        self.to_text.edit_modified(False)
        self._schedule_counter()

    def _schedule_counter(self) -> None:
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
            self._update_variable_badges()
            return

        if self._has_row_variables():
            # Con variables por fila lo que importa es la cantidad de filas,
            # no de destinatarios distintos: un supervisor puede repetirse.
            rows = parse_rows(raw)
            sin_correo = sum(1 for row in rows if not row.is_usable)
            parts = [f"{len(rows)} fila" + ("" if len(rows) == 1 else "s")]
            if sin_correo:
                parts.append(f"{sin_correo} sin correo")
            self.counter_var.set(" · ".join(parts))
            self._update_mode_hint(len(rows) - sin_correo)
            self._update_variable_badges()
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
        self._update_variable_badges()

    def _update_mode_hint(self, total: int) -> None:
        if self.mode_var.get() == Mode.GROUP.value:
            self.mode_hint_var.set("Un solo borrador con todos en Para. Cada uno ve al resto.")
        elif self._has_row_variables():
            self.mode_hint_var.set(
                f"{total} borradores, uno por fila, cada uno con sus valores."
            )
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
        self.variables.clear()
        self._rebuild_variables()
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
        nombre = os.path.basename(path)

        # Primero se intenta leer como tabla: si tiene encabezados y más de
        # una columna, cada columna extra pasa a ser una variable por fila.
        try:
            table = read_table(path)
        except FileImportError:
            table = None

        if table is not None and table.columns:
            elegidas = self._ask_table_columns(table, nombre)
            if elegidas is None:
                return
            self._apply_table(table, nombre, elegidas)
            return

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
        self.status_var.set(f"{len(addresses)} direcciones importadas de {nombre}")

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

    def _error(self, message: str) -> None:
        messagebox.showerror(APP_NAME, message, parent=self.root)

    def _on_create(self) -> None:
        if self._worker is not None and self._worker.is_alive():
            self._cancel.set()
            self.status_var.set("Cancelando...")
            return

        resultado = self._gather()
        if resultado is None:
            return
        specs, avisos = resultado
        if not self._confirm_create(specs, avisos):
            return
        self._start_worker(specs)

    def _on_preview(self) -> None:
        resultado = self._gather()
        if resultado is None:
            return
        specs, avisos = resultado
        self._show_preview(specs, avisos)

    def _gather(self) -> tuple[list[DraftSpec], list[str]] | None:
        """Revisa todo y arma los borradores.

        Devuelve None si hay algo que impide seguir (y ya avisó por pantalla).
        Lo que solo merece una advertencia se devuelve como lista de avisos.
        """
        self._sync_variables()
        raw = self._text_value(self.to_text)
        subject = self.subject_var.get().strip()
        body = self._text_value(self.body_text)
        mode = Mode(self.mode_var.get())
        avisos: list[str] = []

        faltantes = [p for p in self.attachments if not os.path.isfile(p)]
        if faltantes:
            self._error(
                "No se encuentran estos archivos adjuntos:\n\n" + "\n".join(faltantes)
            )
            return None

        cc = parse_recipients(self.cc_var.get())
        bcc = parse_recipients(self.bcc_var.get())
        for campo, parsed in (("CC", cc), ("CCO", bcc)):
            if parsed.invalid:
                avisos.append(
                    f"En {campo} hay {len(parsed.invalid)} entradas que no son "
                    "correos válidos y se ignoran."
                )

        sin_definir = vars_mod.undefined_names(self.variables, subject, body)
        if sin_definir:
            avisos.append(
                "Estas variables se usan pero no están definidas, así que van a "
                "quedar tal cual en el texto: "
                + ", ".join(f"[{name}]" for name in sin_definir)
                + "."
            )
        sin_usar = vars_mod.unused_names(self.variables, subject, body)
        if sin_usar:
            avisos.append(
                "Estas variables están definidas pero no aparecen en el asunto ni "
                "en el mensaje: " + ", ".join(f"[{name}]" for name in sin_usar) + "."
            )

        if self._has_row_variables():
            if mode is Mode.GROUP:
                self._error(
                    "Las variables por fila solo sirven en modo «Uno a uno».\n\n"
                    "En modo grupo se arma un único borrador, así que no hay una "
                    "fila por destinatario.\n\n"
                    "Cambiá el modo, o dejá solamente variables fijas."
                )
                return None

            rows = parse_rows(raw)
            if not any(row.is_usable for row in rows):
                self._error("No hay ninguna fila con un destinatario válido en PARA.")
                return None

            problemas = vars_mod.count_problems(self.variables, len(rows))
            if problemas:
                self._error(
                    "Las cantidades no coinciden, así que no se puede saber qué "
                    "valor le corresponde a cada destinatario:\n\n"
                    + "\n".join(problemas)
                    + "\n\nCorregilo antes de crear los borradores."
                )
                return None

            sin_correo = [row for row in rows if not row.is_usable]
            if sin_correo:
                detalle = ", ".join(f"línea {row.number}" for row in sin_correo[:6])
                extra = "" if len(sin_correo) <= 6 else ", ..."
                avisos.append(
                    f"{len(sin_correo)} filas no tienen un correo válido y se "
                    f"saltean ({detalle}{extra})."
                )

            incompletas = vars_mod.missing_values(self.variables, len(rows))
            if incompletas:
                avisos.append(
                    "Hay valores vacíos en: "
                    + ", ".join(f"[{name}]" for name in incompletas)
                    + "."
                )

            specs = build_merge_specs(
                build_merge_rows(rows, self.variables),
                subject,
                body,
                cc=cc.recipients,
                bcc=bcc.recipients,
                attachments=self.attachments,
            )
        else:
            parsed = parse_recipients(raw)
            if not parsed.recipients:
                self._error("No hay ningún destinatario válido cargado en PARA.")
                return None
            if parsed.invalid:
                muestra = ", ".join(parsed.invalid[:5])
                avisos.append(
                    f"En PARA hay {len(parsed.invalid)} entradas que no son correos "
                    f"válidos y se ignoran ({muestra})."
                )
            fijas = {
                variable.name: variable.value
                for variable in self.variables
                if variable.kind is Kind.FIXED
            }
            specs = build_specs(
                recipients=parsed.recipients,
                subject=subject,
                body=body,
                mode=mode,
                cc=cc.recipients,
                bcc=bcc.recipients,
                attachments=self.attachments,
                values=fijas,
            )

        if not subject:
            avisos.append("El asunto está vacío.")
        if not body.strip():
            avisos.append("El mensaje está vacío.")
        return specs, avisos

    def _confirm_create(self, specs: list[DraftSpec], avisos: list[str]) -> bool:
        total = len(specs)
        mode = Mode(self.mode_var.get())
        if mode is Mode.GROUP:
            destinatarios = len(specs[0].to) if specs else 0
            detalle = [
                f"Se va a crear 1 borrador con {destinatarios} destinatarios en Para."
            ]
        elif self._has_row_variables():
            detalle = [f"Se van a crear {total} borradores, uno por fila."]
        else:
            detalle = [f"Se van a crear {total} borradores, uno por destinatario."]

        detalle.append("")
        if specs:
            detalle.append(f"Asunto del primero: {specs[0].subject or '(vacío)'}")
        if self.variables:
            detalle.append(
                "Variables: "
                + ", ".join(variable.token for variable in self.variables)
            )
        cc_count = len(specs[0].cc) if specs else 0
        bcc_count = len(specs[0].bcc) if specs else 0
        if cc_count or bcc_count:
            copia = f"CC: {cc_count} | CCO: {bcc_count}"
            if mode is Mode.INDIVIDUAL and total > 1:
                copia += f"  (se repiten en cada uno de los {total} borradores)"
            detalle.append(copia)
        if self.attachments:
            detalle.append(f"Adjuntos: {len(self.attachments)}")

        if avisos:
            detalle.append("")
            detalle.extend(f"- {aviso}" for aviso in avisos)

        detalle.append("")
        detalle.append("Quedan en Borradores. No se envía nada.")
        return messagebox.askyesno(APP_NAME, "\n".join(detalle), parent=self.root)

    def _show_preview(self, specs: list[DraftSpec], avisos: list[str]) -> None:
        """Muestra cómo queda cada borrador, ya con las variables reemplazadas."""
        win = tk.Toplevel(self.root)
        win.title("Vista previa")
        win.configure(bg=self.pal["bg"])
        win.transient(self.root)
        win.geometry("660x540")
        win.minsize(520, 420)

        frame = tk.Frame(win, bg=self.pal["bg"], padx=18, pady=16)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(6, weight=1)

        posicion = tk.StringVar()
        nav = tk.Frame(frame, bg=self.pal["bg"])
        nav.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        nav.columnconfigure(1, weight=1)
        anterior = theme.RoundedButton(
            nav, "Anterior", None,
            palette=self.pal, fonts=self.fonts, kind="secondary", height=30,
        )
        anterior.grid(row=0, column=0, sticky="w")
        tk.Label(
            nav, textvariable=posicion, bg=self.pal["bg"], fg=self.pal["text"],
            font=self.fonts.body_medium,
        ).grid(row=0, column=1)
        siguiente = theme.RoundedButton(
            nav, "Siguiente", None,
            palette=self.pal, fonts=self.fonts, kind="secondary", height=30,
        )
        siguiente.grid(row=0, column=2, sticky="e")

        para_var = tk.StringVar()
        asunto_var = tk.StringVar()
        self._eyebrow(frame, "PARA").grid(row=1, column=0, sticky="w")
        tk.Label(
            frame, textvariable=para_var, bg=self.pal["bg"], fg=self.pal["text"],
            font=self.fonts.body, anchor="w", justify="left", wraplength=600,
        ).grid(row=2, column=0, sticky="ew", pady=(2, 10))
        self._eyebrow(frame, "ASUNTO").grid(row=3, column=0, sticky="w")
        tk.Label(
            frame, textvariable=asunto_var, bg=self.pal["bg"], fg=self.pal["text"],
            font=self.fonts.body, anchor="w", justify="left", wraplength=600,
        ).grid(row=4, column=0, sticky="ew", pady=(2, 10))
        self._eyebrow(frame, "MENSAJE").grid(row=5, column=0, sticky="w", pady=(0, 6))

        field, cuerpo = self._text_area(frame, wrap="word", font=self.fonts.body)
        field.grid(row=6, column=0, sticky="nsew")

        if avisos:
            self._muted(
                frame, text="Avisos: " + " ".join(avisos), wraplength=600
            ).grid(row=7, column=0, sticky="ew", pady=(10, 0))

        indice = [0]

        def mostrar() -> None:
            spec = specs[indice[0]]
            posicion.set(f"Borrador {indice[0] + 1} de {len(specs)}")
            para_var.set("; ".join(spec.to) or "(sin destinatario)")
            asunto_var.set(spec.subject or "(vacío)")
            cuerpo.configure(state="normal")
            cuerpo.delete("1.0", "end")
            cuerpo.insert("1.0", spec.body)
            cuerpo.configure(state="disabled")
            anterior.set_enabled(indice[0] > 0)
            siguiente.set_enabled(indice[0] < len(specs) - 1)

        def mover(paso: int) -> None:
            indice[0] = max(0, min(len(specs) - 1, indice[0] + paso))
            mostrar()

        anterior.command = lambda: mover(-1)
        siguiente.command = lambda: mover(1)
        win.bind("<Left>", lambda _e: mover(-1))
        win.bind("<Right>", lambda _e: mover(1))
        win.bind("<Escape>", lambda _e: win.destroy())

        theme.RoundedButton(
            frame, "Cerrar", win.destroy,
            palette=self.pal, fonts=self.fonts, kind="accent", height=34,
        ).grid(row=8, column=0, sticky="e", pady=(14, 0))

        mostrar()
        self._center_on_parent(win)

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
