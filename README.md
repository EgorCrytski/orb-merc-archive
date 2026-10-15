# Archive File Manager

Static, keyboard-friendly Markdown archive with a strict 1990s file-manager interface: monochrome green on black, yellow bracketed panel titles, Unicode box-drawing characters, inverted selection, and no decorative graphics. No backend, database, or frontend dependencies.

## Current RP material

- `content/Личные дела/`: four **unfilled** personnel dossiers (Эхо, Крюгер, Леший, Терапевт).
- `content/Операции/ЧЗО - вводные материалы/`: briefing, timeline, and groups/background for the planned ChZO deployment.
- `sources/ORB-STALKER-RP-lore.md`: verbatim source material supplied by the user. This directory is **not published** to the site. Origin/causation details from the source are not automatically assigned to the field operatives as known facts.

No operation order, personnel history, affiliations, or secret intelligence has been invented.

## Content

Everything under `content/` is published. Add or remove folders and `.md` files freely; the generated file index and site navigation update automatically with each push to `main`. Subfolders are supported. The content directory and file names may use Unicode.

Example:

```text
content/
  Личные дела/
    README.md
    001-оперативник.md
    Группа Альфа/
      002-оперативник.md
  Приказы/
    README.md
    2012-09-15.md
```

**Important:** All documents published on GitHub Pages are public. Do not put secrets or real personal data in `content/`. A hard-to-guess URL and `noindex` are not access controls.

## Standalone preview

Run `python3 scripts/build.py` and `python3 scripts/preview.py`, then open `syndicate-preview.html` without a server. This file embeds the current archive and is useful for sharing design changes.

## Local preview

```bash
python3 scripts/build.py
cd site && python3 -m http.server 8000
```

Visit http://localhost:8000. Do not open `index.html` directly as `file://`, because the archive loads its index and Markdown over HTTP.

## GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Every subsequent push rebuilds and publishes the site automatically.

GitHub Free requires a public repository for Pages. GitHub Pro and eligible paid plans support Pages from private repositories, but the deployed site is still publicly viewable.

## Keyboard controls

- ↑ / ↓ select file; Enter opens it
- Backspace navigates to parent directory
- `/` or F7 searches names; Enter opens first result
- Tab switches the folder tree, file list, and document viewer
- F1 / F10 help; F3 opens selected item; F5 refreshes index

## Resizable panels

Drag the invisible 7px hit area between panels to adjust their sizes (the resize cursor marks its position). In narrow layouts the panes stack vertically and the dividers resize their heights. Arrow keys can also move a focused divider (Shift for a larger step). The layout is saved locally in your browser and restored on the next visit, separately for wide and narrow screens. No server-side settings are needed.

## Structure

- `web/`: terminal-style HTML, CSS, JS (no icons or images)
- `content/`: Markdown source tree
- `scripts/build.py`: deterministic static-site builder
- `.github/workflows/pages.yml`: GitHub Pages deployment
- `site/`: generated output (not committed)
- `tests/browser_check.py`: optional Chromium smoke test (requires Playwright and Chromium)
- `tests/browser_column_alignment.py`: checks file-list column alignment during scroll and resizing at desktop and mobile widths
