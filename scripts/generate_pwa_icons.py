#!/usr/bin/env python3
"""Render the selected first AutoJournal car + checklist icon in light and dark themes."""
from base64 import b64decode
from io import BytesIO
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent.parent
dest=root/"icons"
dest.mkdir(exist_ok=True)
for theme in ("light", "dark"):
    encoded=(root/"scripts"/f"{theme}-icon.b64").read_text(encoding="utf-8").strip()
    source=Image.open(BytesIO(b64decode(encoded, validate=True))).convert("RGB")
    for px in (180, 192, 512):
        basename="apple-touch-icon" if px==180 else f"icon-{px}"
        if theme=="dark": basename+="-dark"
        path=dest/f"{basename}.png"
        source.resize((px,px),Image.Resampling.LANCZOS).save(path,format="PNG",optimize=True)
        print(f"{path.relative_to(root)}: {path.stat().st_size} bytes")
