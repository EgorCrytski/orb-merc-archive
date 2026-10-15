# Archive File Manager

Static, keyboard-friendly Markdown archive with a strict 1990s file-manager interface: monochrome green on black, yellow bracketed panel titles, Unicode box-drawing characters, inverted selection, and no decorative graphics. No backend, database, or frontend dependencies.

## What the archive contains

- `content/Личные дела/`: four personnel dossiers (Эхо, Крюгер, Леший, Терапевт), one folder each, holding `dossier.md` with photographs beside it.
- `content/Операции/ЧЗО - вводные материалы/`: the briefing, the timeline, the factions note, and the group's own service document.
- `sources/`: the lore the published text is built from, kept in the working copy only. The directory is neither tracked nor published, and details from it are not automatically treated as facts the field team knows.

The mission objective, client, curator, deadlines and rules of engagement are deliberately undefined and are not invented anywhere in the published documents.

## Content

Everything under `content/` is published. Add or remove folders and `.md` files freely; the generated file index and site navigation update automatically with each push to `main`. Subfolders are supported, and names may use Unicode.

Images carry their own index entry type, so adding photographs never changes the document count.

**Important:** all documents published on GitHub Pages are public. Do not put secrets or real personal data in `content/`. A hard-to-guess URL and `noindex` are not access controls.

## Standalone preview

Run `python3 scripts/build.py` and `python3 scripts/preview.py`, then open `syndicate-preview.html` without a server. The preview embeds the documents and images as data URIs, so it stays one portable file.

## Local preview

```bash
python3 scripts/build.py
cd site && python3 -m http.server 8000
```

Visit http://localhost:8000. Do not open `index.html` directly as `file://`, because the archive loads its index and Markdown over HTTP.

## GitHub Pages

1. Push the repository to `main`.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Every subsequent push to `main` rebuilds and publishes the site.

GitHub Free requires a public repository for Pages. Paid plans support Pages from private repositories, but the deployed site is still publicly viewable.

## Keyboard controls

- ↑ / ↓ select file; Enter opens it
- Backspace navigates to parent directory
- `/` or F7 searches names; Enter opens first result
- Tab switches the folder tree, file list, and document viewer
- F1 / F10 help; F3 opens selected item; F5 refreshes index

## Resizable panels

Drag the invisible 7px hit area between panels to adjust their sizes (the resize cursor marks its position). In narrow layouts the panes stack vertically and the dividers resize their heights. Arrow keys can also move a focused divider (Shift for a larger step). The layout is saved locally in your browser and restored on the next visit, separately for wide and narrow screens. No server-side settings are needed.

## Repository layout

| Path | Tracked | Note |
|---|---|---|
| `web/` | yes | terminal HTML, CSS and JS. No icons or images |
| `content/` | yes | the Markdown tree that gets published |
| `scripts/build.py` | yes | deterministic static-site builder |
| `scripts/preview.py` | yes | builds the single-file preview |
| `tests/` | yes | content tests and optional Chromium checks |
| `sources/` | **no** | canon, kept in the working copy only; never tracked and never published |
| `.github/workflows/pages.yml` | yes | Pages deployment |
| `drafts/` | **no** | working material: the kventa skeletons, the long-form sources behind the dossiers, the style spec. Kept on disk, deliberately out of the repository |
| `REVIEW-HANDOFF.md`, `WRITER_HANDOFF.md` | **no** | briefs for reviewers and writers |
| `site/`, `syndicate-preview.html` | no | generated output |

## Checks

```bash
python3 scripts/build.py                     # expect: 12 documents, 8 images, 9 folders
python3 -m unittest tests.test_content -v    # expect: 4 tests OK
```

`tests/test_build.py` fails on Windows for a pre-existing newline reason. `tests/browser_*.py` are Linux-only and hardcode `/usr/bin/chromium`.
