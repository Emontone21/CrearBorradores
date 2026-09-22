"""Punto de entrada de CrearBorradores.

Sirve para ejecutar la app desde el codigo fuente (python run.py) y como
script base al empaquetar el .exe con PyInstaller.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

from crearborradores.ui import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
