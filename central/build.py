"""Gera central/index.html a partir de index.src.html, embutindo o logo (logo.b64)."""
from pathlib import Path
here = Path(__file__).parent
src = (here / "index.src.html").read_text(encoding="utf-8")
logo = (here / "logo.b64").read_text(encoding="utf-8").strip()
(here / "index.html").write_text(src.replace("__LOGO__", logo), encoding="utf-8")
print("ok", len(src))
