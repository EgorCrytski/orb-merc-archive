#!/usr/bin/env python3
"""Build a portable one-file preview of the static site without external assets."""
from __future__ import annotations
import base64
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
CONTENT = ROOT / 'content'
DEST = ROOT / 'syndicate-preview.html'

# The preview is one portable file, so full-size photographs would bloat it.
# Images are downscaled and re-encoded for embedding; the built site keeps the originals.
IMAGE_MAX_SIDE = 900
IMAGE_QUALITY = 82


def json_safe(value):
    # Script-context safety: Markdown containing </script> must not end our inline script.
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')


def encode_image(path: Path) -> str:
    with Image.open(path) as image:
        image = image.convert('RGB')
        image.thumbnail((IMAGE_MAX_SIDE, IMAGE_MAX_SIDE), Image.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG', quality=IMAGE_QUALITY, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')


def build():
    manifest = json.loads((ROOT / 'site/manifest.json').read_text(encoding='utf-8'))
    files = {e['path']: (CONTENT / e['path']).read_text(encoding='utf-8')
             for e in manifest['entries'] if e['type'] == 'file'}
    images = {e['path']: encode_image(CONTENT / e['path'])
              for e in manifest['entries'] if e['type'] == 'image'}
    html = (WEB / 'index.html').read_text(encoding='utf-8')
    styles = (WEB / 'styles.css').read_text(encoding='utf-8')
    app = (WEB / 'app.js').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="styles.css" />', '<style>\n' + styles + '\n</style>')
    bridge = '''<script>
const offlineIndex = ''' + json_safe(manifest) + ''';
const offlineFiles = ''' + json_safe(files) + ''';
// Assigned on window on purpose: app.js runs in its own script scope and reads
// window.offlineImages, and a top-level const would not be visible there.
window.offlineImages = ''' + json_safe(images) + ''';
window.fetch = async (resource) => {
  const path = String(resource).split('?')[0];
  if (path === 'manifest.json') return new Response(JSON.stringify(offlineIndex), {status:200});
  if (path.startsWith('content/')) {
    const name = path.slice(8).split('/').map(decodeURIComponent).join('/');
    if (Object.hasOwn(offlineFiles,name)) return new Response(offlineFiles[name], {status:200});
  }
  return new Response('Not found', {status:404});
};
</script>
<script>\n''' + app.replace('</script', '<\\/script') + '''\n</script>'''
    html = html.replace('<script src="app.js" defer></script>', bridge)
    DEST.write_text(html, encoding='utf-8')
    print(f'Built {DEST} ({len(files)} embedded documents, {len(images)} embedded images)')


if __name__ == '__main__':
    build()
