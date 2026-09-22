"""Preferencias del usuario (se guardan entre sesiones).

Nada crítico vive acá: si el archivo no existe o esta roto, se usan los
valores por defecto y la app arranca igual.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from . import APP_NAME

DEFAULTS: dict[str, Any] = {
    "mode": "individual",
    "include_signature": True,
    "show_cc": False,
    "last_import_dir": "",
    "last_attachment_dir": "",
    "geometry": "",
}


def config_dir() -> Path:
    """Carpeta de configuración por usuario."""
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / APP_NAME
    return Path.home() / ".config" / APP_NAME.lower()


def config_path() -> Path:
    return config_dir() / "config.json"


def load() -> dict[str, Any]:
    data = dict(DEFAULTS)
    try:
        raw = json.loads(config_path().read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            for key in DEFAULTS:
                if key in raw:
                    data[key] = raw[key]
    except Exception:
        pass
    return data


def save(data: dict[str, Any]) -> None:
    try:
        target = config_path()
        target.parent.mkdir(parents=True, exist_ok=True)
        clean = {key: data.get(key, DEFAULTS[key]) for key in DEFAULTS}
        target.write_text(
            json.dumps(clean, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    except Exception:
        # Guardar preferencias nunca debe romper la app.
        pass
