"""Estilo visual de la app.

Tkinter por defecto se ve anticuado, así que acá se define una paleta
propia, la tipografía y un puñado de controles dibujados a mano (botones
con esquinas redondeadas, selector segmentado, casilla y etiquetas de
adjuntos). Todo se dibuja sobre Canvas, sin dependencias externas.
"""

from __future__ import annotations

import sys
import tkinter as tk
import tkinter.font as tkfont
from tkinter import ttk

# --------------------------------------------------------------------- paleta

LIGHT = {
    "bg": "#F2F3F5",
    "surface": "#FFFFFF",
    "surface_alt": "#F0F1F4",
    "border": "#E2E5E9",
    "border_strong": "#CFD4DA",
    "text": "#15181C",
    "text_soft": "#5A626D",
    "text_muted": "#8B939E",
    "accent": "#0F6CBD",
    "accent_hover": "#1178CE",
    "accent_press": "#0C5698",
    "accent_soft": "#E8F1FA",
    "on_accent": "#FFFFFF",
    "select": "#CFE3F7",
    "thumb": "#C8CDD4",
    "thumb_hover": "#A7AEB8",
    "warn": "#B4690E",
    "shadow": "#E7E9EC",
}

DARK = {
    "bg": "#131518",
    "surface": "#1C1F24",
    "surface_alt": "#24282E",
    "border": "#2B3037",
    "border_strong": "#3C424B",
    "text": "#E9ECF0",
    "text_soft": "#A8B0BB",
    "text_muted": "#79818D",
    "accent": "#4CA3F5",
    "accent_hover": "#63B0F8",
    "accent_press": "#3B8AD6",
    "accent_soft": "#1E2A38",
    "on_accent": "#08121D",
    "select": "#2C4257",
    "thumb": "#3C434C",
    "thumb_hover": "#4E5661",
    "warn": "#E0A458",
    "shadow": "#0F1114",
}


def get_palette(name: str) -> dict[str, str]:
    return dict(DARK if name == "dark" else LIGHT)


def detect_system_theme() -> str:
    """Lee el modo claro/oscuro configurado en Windows."""
    if not sys.platform.startswith("win"):
        return "light"
    try:
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        )
        with key:
            value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
        return "light" if value else "dark"
    except Exception:
        return "light"


def resolve_theme(preference: str) -> str:
    """Traduce la preferencia guardada ('auto', 'light' o 'dark')."""
    if preference in ("light", "dark"):
        return preference
    return detect_system_theme()


# ----------------------------------------------------------------- tipografía

UI_FAMILIES = (
    "Segoe UI Variable Text",
    "Segoe UI",
    "Inter",
    "Helvetica Neue",
    "DejaVu Sans",
    "Arial",
)
MONO_FAMILIES = (
    "Cascadia Mono",
    "Consolas",
    "SF Mono",
    "DejaVu Sans Mono",
    "Courier New",
)


def _first_available(candidates, available, fallback):
    for name in candidates:
        if name.lower() in available:
            return name
    return fallback


class Fonts:
    """Tipografías elegidas segun lo que haya instalado en la máquina."""

    def __init__(self, root: tk.Misc) -> None:
        available = {family.lower() for family in tkfont.families(root)}
        ui = _first_available(UI_FAMILIES, available, "TkDefaultFont")
        mono = _first_available(MONO_FAMILIES, available, "TkFixedFont")

        self.title = (ui, 11, "bold")
        self.body = (ui, 10)
        self.body_medium = (ui, 10, "bold")
        self.small = (ui, 9)
        self.small_medium = (ui, 9, "bold")
        self.label = (ui, 8, "bold")
        self.button = (ui, 10, "bold")
        self.mono = (mono, 10)


# ------------------------------------------------------------------- dibujado


def round_rect(canvas: tk.Canvas, x1, y1, x2, y2, radius, **kwargs):
    """Dibuja un rectángulo con esquinas redondeadas."""
    radius = max(0, min(radius, (x2 - x1) / 2, (y2 - y1) / 2))
    points = [
        x1 + radius, y1, x2 - radius, y1, x2, y1,
        x2, y1 + radius, x2, y2 - radius, x2, y2,
        x2 - radius, y2, x1 + radius, y2, x1, y2,
        x1, y2 - radius, x1, y1 + radius, x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, **kwargs)


class Card(tk.Frame):
    """Panel blanco con un borde de 1 pixel."""

    def __init__(self, parent: tk.Misc, palette: dict, padding: int = 16, **kwargs):
        super().__init__(parent, bg=palette["border"], bd=0, highlightthickness=0, **kwargs)
        self.inner = tk.Frame(self, bg=palette["surface"], padx=padding, pady=padding)
        self.inner.pack(fill="both", expand=True, padx=1, pady=1)


class Field(tk.Frame):
    """Caja de 1 pixel alrededor de un campo, que se pinta al enfocarlo."""

    def __init__(self, parent: tk.Misc, palette: dict, **kwargs):
        super().__init__(parent, bg=palette["border_strong"], bd=0, highlightthickness=0, **kwargs)
        self.pal = palette
        self.inner = tk.Frame(self, bg=palette["surface"])
        self.inner.pack(fill="both", expand=True, padx=1, pady=1)

    def track(self, widget: tk.Widget) -> tk.Widget:
        """Hace que el borde se pinte con el color de acento al enfocar."""
        widget.bind("<FocusIn>", lambda _e: self.configure(bg=self.pal["accent"]), add="+")
        widget.bind(
            "<FocusOut>", lambda _e: self.configure(bg=self.pal["border_strong"]), add="+"
        )
        return widget


class RoundedButton(tk.Canvas):
    """Botón dibujado a mano, con estados de hover, clic y foco."""

    def __init__(
        self,
        parent: tk.Misc,
        text: str,
        command=None,
        *,
        palette: dict,
        fonts: Fonts,
        kind: str = "accent",
        width: int | None = None,
        height: int = 36,
        radius: int = 9,
        bg: str | None = None,
    ) -> None:
        self.pal = palette
        self.kind = kind
        self.text = text
        self.command = command
        self.font = fonts.button if kind == "accent" else fonts.small_medium
        self._enabled = True
        self._hover = False
        self._pressed = False
        self._focused = False
        self._radius = radius

        background = bg if bg is not None else parent.cget("bg")
        self._auto_width = width is None
        if width is None:
            width = self._measure(text)

        super().__init__(
            parent,
            width=width,
            height=height,
            bg=background,
            bd=0,
            highlightthickness=0,
            cursor="hand2",
            takefocus=1,
        )
        self.bind("<Configure>", lambda _e: self._draw())
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)
        self.bind("<ButtonPress-1>", self._on_press)
        self.bind("<ButtonRelease-1>", self._on_release)
        self.bind("<FocusIn>", lambda _e: self._set_focus(True))
        self.bind("<FocusOut>", lambda _e: self._set_focus(False))
        self.bind("<Return>", lambda _e: self._invoke())
        self.bind("<space>", lambda _e: self._invoke())

    # --- estado

    def _measure(self, text: str) -> int:
        """Ancho que necesita el botón para que entre el texto."""
        extra = 40 if self.kind == "accent" else 24
        return tkfont.Font(font=self.font).measure(text) + extra

    def configure_text(self, text: str) -> None:
        self.text = text
        if self._auto_width:
            # Sin esto, un texto más largo que el original queda cortado.
            self.configure(width=self._measure(text))
        self._draw()

    def set_enabled(self, enabled: bool) -> None:
        self._enabled = enabled
        self.configure(cursor="hand2" if enabled else "arrow")
        self._draw()

    def _set_focus(self, value: bool) -> None:
        self._focused = value
        self._draw()

    def _on_enter(self, _event) -> None:
        self._hover = True
        self._draw()

    def _on_leave(self, _event) -> None:
        self._hover = False
        self._pressed = False
        self._draw()

    def _on_press(self, _event) -> None:
        if not self._enabled:
            return
        self._pressed = True
        self.focus_set()
        self._draw()

    def _on_release(self, _event) -> None:
        was_pressed = self._pressed
        self._pressed = False
        self._draw()
        if was_pressed and self._hover:
            self._invoke()

    def _invoke(self) -> None:
        if self._enabled and self.command is not None:
            self.command()

    # --- dibujo

    def _colors(self) -> tuple[str, str | None, str]:
        pal = self.pal
        if not self._enabled:
            if self.kind == "accent":
                return pal["surface_alt"], pal["border"], pal["text_muted"]
            return self.cget("bg"), None, pal["text_muted"]

        if self.kind == "accent":
            fill = pal["accent"]
            if self._pressed:
                fill = pal["accent_press"]
            elif self._hover:
                fill = pal["accent_hover"]
            return fill, None, pal["on_accent"]

        if self.kind == "link":
            fill = pal["accent_soft"] if (self._hover or self._pressed) else self.cget("bg")
            return fill, None, pal["accent"]

        if self.kind == "secondary":
            fill = pal["surface_alt"] if (self._hover or self._pressed) else pal["surface"]
            return fill, pal["border_strong"], pal["text"]

        # ghost
        fill = pal["surface_alt"] if (self._hover or self._pressed) else self.cget("bg")
        return fill, None, pal["text_soft"]

    def _draw(self) -> None:
        self.delete("all")
        width = self.winfo_width()
        height = self.winfo_height()
        if width <= 1 or height <= 1:
            return
        fill, outline, fg = self._colors()
        round_rect(
            self, 1, 1, width - 1, height - 1, self._radius,
            fill=fill, outline=outline or fill, width=1,
        )
        if self._focused and self._enabled:
            round_rect(
                self, 1, 1, width - 1, height - 1, self._radius,
                fill="", outline=self.pal["accent"], width=2,
            )
        self.create_text(width / 2, height / 2, text=self.text, fill=fg, font=self.font)


class Segmented(tk.Canvas):
    """Selector de dos o más opciones, estilo control segmentado."""

    def __init__(
        self,
        parent: tk.Misc,
        options: list[tuple[str, str]],
        variable: tk.StringVar,
        *,
        palette: dict,
        fonts: Fonts,
        command=None,
        height: int = 34,
        radius: int = 8,
        bg: str | None = None,
    ) -> None:
        self.pal = palette
        self.options = options
        self.variable = variable
        self.command = command
        self.font = fonts.small_medium
        self._radius = radius
        self._hover_index = -1

        super().__init__(
            parent,
            height=height,
            bg=bg if bg is not None else parent.cget("bg"),
            bd=0,
            highlightthickness=0,
            cursor="hand2",
        )
        self.bind("<Configure>", lambda _e: self._draw())
        self.bind("<Button-1>", self._on_click)
        self.bind("<Motion>", self._on_motion)
        self.bind("<Leave>", self._on_leave)
        variable.trace_add("write", lambda *_a: self._draw())

    def _index_at(self, x: int) -> int:
        width = max(1, self.winfo_width())
        return min(len(self.options) - 1, max(0, int(x / (width / len(self.options)))))

    def _on_click(self, event) -> None:
        value = self.options[self._index_at(event.x)][0]
        if value != self.variable.get():
            self.variable.set(value)
            if self.command is not None:
                self.command()

    def _on_motion(self, event) -> None:
        index = self._index_at(event.x)
        if index != self._hover_index:
            self._hover_index = index
            self._draw()

    def _on_leave(self, _event) -> None:
        self._hover_index = -1
        self._draw()

    def _draw(self) -> None:
        self.delete("all")
        width = self.winfo_width()
        height = self.winfo_height()
        if width <= 1 or height <= 1:
            return

        pal = self.pal
        round_rect(
            self, 0, 0, width, height, self._radius,
            fill=pal["surface_alt"], outline=pal["border"], width=1,
        )

        step = width / len(self.options)
        selected = self.variable.get()
        for index, (value, label) in enumerate(self.options):
            x1 = index * step
            x2 = x1 + step
            if value == selected:
                round_rect(
                    self, x1 + 3, 3, x2 - 3, height - 3, self._radius - 2,
                    fill=pal["surface"], outline=pal["border_strong"], width=1,
                )
                color = pal["accent"]
            elif index == self._hover_index:
                color = pal["text"]
            else:
                color = pal["text_muted"]
            self.create_text(
                (x1 + x2) / 2, height / 2, text=label, fill=color, font=self.font
            )


class CheckBox(tk.Canvas):
    """Casilla de verificación dibujada a mano."""

    def __init__(
        self,
        parent: tk.Misc,
        text: str,
        variable: tk.BooleanVar,
        *,
        palette: dict,
        fonts: Fonts,
        bg: str | None = None,
        command=None,
    ) -> None:
        self.pal = palette
        self.text = text
        self.variable = variable
        self.command = command
        self.font = fonts.small
        self._hover = False

        width = tkfont.Font(font=self.font).measure(text) + 28
        super().__init__(
            parent,
            width=width,
            height=22,
            bg=bg if bg is not None else parent.cget("bg"),
            bd=0,
            highlightthickness=0,
            cursor="hand2",
        )
        self.bind("<Configure>", lambda _e: self._draw())
        self.bind("<Button-1>", self._toggle)
        self.bind("<Enter>", lambda _e: self._set_hover(True))
        self.bind("<Leave>", lambda _e: self._set_hover(False))
        variable.trace_add("write", lambda *_a: self._draw())

    def _set_hover(self, value: bool) -> None:
        self._hover = value
        self._draw()

    def _toggle(self, _event) -> None:
        self.variable.set(not self.variable.get())
        if self.command is not None:
            self.command()

    def _draw(self) -> None:
        self.delete("all")
        height = self.winfo_height()
        if height <= 1:
            return
        pal = self.pal
        top = (height - 16) / 2
        checked = bool(self.variable.get())
        fill = pal["accent"] if checked else pal["surface"]
        outline = pal["accent"] if checked else (
            pal["text_muted"] if self._hover else pal["border_strong"]
        )
        round_rect(self, 1, top, 17, top + 16, 5, fill=fill, outline=outline, width=1)
        if checked:
            self.create_line(
                5, top + 8.5, 8, top + 11.5, 13, top + 5,
                fill=pal["on_accent"], width=2, capstyle="round", joinstyle="round",
            )
        self.create_text(
            24, height / 2, text=self.text, anchor="w", fill=pal["text_soft"], font=self.font
        )


class Chip(tk.Canvas):
    """Etiqueta redondeada con una cruz para quitarla (para los adjuntos)."""

    def __init__(
        self,
        parent: tk.Misc,
        text: str,
        *,
        palette: dict,
        fonts: Fonts,
        on_close=None,
        bg: str | None = None,
    ) -> None:
        self.pal = palette
        self.text = text
        self.on_close = on_close
        self.font = fonts.small
        self._hover_close = False

        text_width = tkfont.Font(font=self.font).measure(text)
        super().__init__(
            parent,
            width=text_width + 42,
            height=26,
            bg=bg if bg is not None else parent.cget("bg"),
            bd=0,
            highlightthickness=0,
        )
        self.bind("<Configure>", lambda _e: self._draw())
        self.bind("<Button-1>", self._on_click)
        self.bind("<Motion>", self._on_motion)
        self.bind("<Leave>", lambda _e: self._set_hover(False))

    def _close_zone(self) -> int:
        return self.winfo_width() - 24

    def _on_click(self, event) -> None:
        if event.x >= self._close_zone() and self.on_close is not None:
            self.on_close()

    def _on_motion(self, event) -> None:
        self._set_hover(event.x >= self._close_zone())

    def _set_hover(self, value: bool) -> None:
        if value != self._hover_close:
            self._hover_close = value
            self.configure(cursor="hand2" if value else "arrow")
            self._draw()

    def _draw(self) -> None:
        self.delete("all")
        width = self.winfo_width()
        height = self.winfo_height()
        if width <= 1 or height <= 1:
            return
        pal = self.pal
        round_rect(
            self, 0, 0, width, height, height / 2,
            fill=pal["accent_soft"], outline=pal["accent_soft"],
        )
        self.create_text(
            13, height / 2, text=self.text, anchor="w", fill=pal["text"], font=self.font
        )
        cross = pal["text"] if self._hover_close else pal["text_muted"]
        cx = width - 16
        cy = height / 2
        self.create_line(cx - 4, cy - 4, cx + 4, cy + 4, fill=cross, width=1.5, capstyle="round")
        self.create_line(cx - 4, cy + 4, cx + 4, cy - 4, fill=cross, width=1.5, capstyle="round")


class AutoScrollbar(ttk.Scrollbar):
    """Barra de desplazamiento que se esconde cuando no hace falta."""

    def set(self, first, last):  # type: ignore[override]
        if float(first) <= 0.0 and float(last) >= 1.0:
            self.grid_remove()
        else:
            self.grid()
        super().set(first, last)


def style_ttk(root: tk.Misc, palette: dict) -> ttk.Style:
    """Aplica el estilo propio a los pocos widgets ttk que se usan."""
    style = ttk.Style(root)
    try:
        style.theme_use("clam")  # es el tema más moldeable de ttk
    except tk.TclError:
        pass

    style.layout(
        "App.Vertical.TScrollbar",
        [(
            "Vertical.Scrollbar.trough",
            {
                "sticky": "ns",
                "children": [("Vertical.Scrollbar.thumb", {"expand": "1", "sticky": "nswe"})],
            },
        )],
    )
    style.configure(
        "App.Vertical.TScrollbar",
        troughcolor=palette["surface"],
        background=palette["thumb"],
        bordercolor=palette["surface"],
        lightcolor=palette["surface"],
        darkcolor=palette["surface"],
        borderwidth=0,
        relief="flat",
        width=8,
        gripcount=0,
    )
    style.map("App.Vertical.TScrollbar", background=[("active", palette["thumb_hover"])])

    style.layout(
        "App.Horizontal.TScrollbar",
        [(
            "Horizontal.Scrollbar.trough",
            {
                "sticky": "ew",
                "children": [("Horizontal.Scrollbar.thumb", {"expand": "1", "sticky": "nswe"})],
            },
        )],
    )
    style.configure(
        "App.Horizontal.TScrollbar",
        troughcolor=palette["surface"],
        background=palette["thumb"],
        bordercolor=palette["surface"],
        lightcolor=palette["surface"],
        darkcolor=palette["surface"],
        borderwidth=0,
        relief="flat",
        width=8,
        gripcount=0,
    )
    style.map("App.Horizontal.TScrollbar", background=[("active", palette["thumb_hover"])])

    style.configure(
        "App.Horizontal.TProgressbar",
        troughcolor=palette["surface_alt"],
        background=palette["accent"],
        bordercolor=palette["surface_alt"],
        lightcolor=palette["accent"],
        darkcolor=palette["accent"],
        borderwidth=0,
        thickness=5,
    )
    return style
