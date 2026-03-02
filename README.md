# Mafia Wiki Page Editor

A static web-based editor for creating wiki-compatible Markdown pages for the [Mafia Wiki](https://mafiawiki.astrofare.xyz).

## Features

- **Role / Map / Custom** page types with type-specific infobox fields
- **EasyMDE** Markdown editors with toolbar and live preview
- **Live preview** panel showing both visual and raw source output
- **Image uploads** for social image, background, infobox, and inline images
- **.mwp export** — packages your page as a `.mwp` file (renamed `.zip`) containing `manifest.json`, `page.md`, and `assets/`
- **.mwp import** — re-open previously exported pages for editing
- **Custom sections & attributes** for non-standard page types
- **Dark theme** matching the wiki's visual style

## How it works

1. Visit [wikieditor.octanebula.dev](https://wikieditor.octanebula.dev)
2. Choose a page type (Role, Map, or Custom)
3. Fill in metadata, infobox fields, introduction, and content sections
4. Preview your page in real-time
5. Click **Export .mwp** to download the package
6. Submit the `.mwp` file in the Discord `#wiki-submissions` channel

## Development

This is a purely static site with no build step. Just serve the files:

```bash
# Using Python
python3 -m http.server 8000

# Using Node
npx serve .
```

Open `http://localhost:8000` in your browser.

## Deployment

Deployed automatically via GitHub Pages on push to `main`. The custom domain `wikieditor.octanebula.dev` is configured via the `CNAME` file.

## Tech Stack

- Vanilla HTML/CSS/JS (no frameworks, no build tools)
- [EasyMDE](https://github.com/Ionaru/easy-markdown-editor) — Markdown editor
- [marked.js](https://marked.js.org/) — Markdown → HTML
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML sanitization
- [JSZip](https://stuk.github.io/jszip/) — ZIP creation for .mwp export
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — File download trigger