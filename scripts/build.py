#!/usr/bin/env python3
"""Build a self-contained static archive without third-party dependencies."""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
OUTPUT = ROOT / "site"
WEB = ROOT / "web"

# Images are indexed as their own entry type. The document counter, which the
# content tests assert, therefore keeps counting documents only.
#
# Adding a folder with Markdown and images under content/ needs no code change:
# this scan is recursive and extension-driven. Adding a *new image format* is
# the one case that touches this file, so the list is kept wide on purpose.
IMAGE_SUFFIXES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".jfif": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
}


def remove_output():
    """Remove the previous build, tolerating files held open by another process.

    On Windows a viewer, an indexer or an antivirus scan holding a file open makes
    rmtree fail with WinError 5, which used to abort the whole build and leave a
    stale index behind. Retry briefly; if a file is still held, delete everything
    else and carry on. Any file left behind is harmless: the manifest is rewritten
    from the content tree, so a stale file is simply no longer referenced.
    """
    if not OUTPUT.exists():
        return []
    for attempt in range(6):
        try:
            shutil.rmtree(OUTPUT)
            return []
        except PermissionError:
            time.sleep(0.5 * (attempt + 1))
    blocked = []
    for path in sorted(OUTPUT.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        try:
            path.unlink() if path.is_file() else path.rmdir()
        except OSError:
            blocked.append(path)
    return blocked


def copy_tree(source: Path, destination: Path) -> list[Path]:
    """Copy a tree, tolerating destinations held open by another process.

    On Windows an indexer, a viewer or a scan can hold a file open, so even
    shutil.copytree with dirs_exist_ok fails and aborts the build. Skipping such
    a file keeps the build and the manifest correct; the destination is usually
    an identical copy from the previous run, and the caller reports what was
    skipped so it can be retried after the holding program is closed.
    """
    blocked = []
    for path in sorted(source.rglob("*"), key=lambda p: str(p).casefold()):
        target = destination / path.relative_to(source)
        try:
            if path.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
        except OSError:
            blocked.append(target)
    return blocked


def build():
    blocked = remove_output()
    blocked += copy_tree(WEB, OUTPUT)
    blocked += copy_tree(CONTENT, OUTPUT / "content")
    entries = []
    for path in sorted(CONTENT.rglob("*"), key=lambda p: str(p).casefold()):
        if path.name.startswith("."):
            continue
        relative = path.relative_to(CONTENT).as_posix()
        if path.is_dir():
            entries.append({"type": "dir", "path": relative, "name": path.name})
        elif path.is_file() and path.suffix.lower() == ".md":
            entries.append({"type": "file", "path": relative, "name": path.name, "size": path.stat().st_size})
        elif path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            entries.append({
                "type": "image",
                "path": relative,
                "name": path.name,
                "size": path.stat().st_size,
                "mime": IMAGE_SUFFIXES[path.suffix.lower()],
            })
    (OUTPUT / "manifest.json").write_text(
        json.dumps({"version": 1, "entries": entries}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    documents = sum(e["type"] == "file" for e in entries)
    images = sum(e["type"] == "image" for e in entries)
    folders = sum(e["type"] == "dir" for e in entries)
    print(f"Built {OUTPUT} ({documents} documents, {images} images, {folders} folders)")
    if blocked:
        unique = sorted({path.relative_to(ROOT).as_posix() for path in blocked})
        print(f"Предупреждение: {len(unique)} путь(ей) остались от прошлой сборки и заняты другим процессом:")
        for path in unique:
            print(f"  {path}")
        print("В индекс они не попали: манифест собран заново. Удалить их можно после закрытия держащей программы.")


if __name__ == "__main__":
    build()
