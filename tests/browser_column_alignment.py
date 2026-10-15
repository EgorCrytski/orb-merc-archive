"""Regression: column borders must stay aligned when panels resize or scroll."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'syndicate-preview.html').read_text(encoding='utf-8')


def assert_aligned(page):
    header = page.locator('.file-colheads span').evaluate_all(
        'els => els.map(e => e.getBoundingClientRect().right)'
    )
    row = page.locator('.file-item').first.locator('span').evaluate_all(
        'els => els.map(e => e.getBoundingClientRect().right)'
    )
    assert len(header) == len(row) == 3
    for h, r in zip(header, row):
        assert abs(h - r) < .5, (header, row)
    assert page.locator('.file-item.selected span.ext').evaluate(
        'e => getComputedStyle(e).borderRightColor'
    ) == 'rgb(0, 21, 9)'
    return header


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(1600, 900), (1000, 720), (921, 650), (600, 900), (390, 844)]:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.set_content(HTML, wait_until='load')
        page.wait_for_selector('.file-item')
        # Add enough mock entries to trigger scrollbar; no production content changes.
        page.evaluate("""() => {
          for(let i=0;i<70;i++) state.entries.push({type:'dir', name:`TEST_${i}`, path:`TEST_${i}`});
          render();
        }""")
        assert page.locator('.file-item').count() == 74
        initial = assert_aligned(page)
        page.locator('.files').evaluate('e => e.scrollTop = 480')
        assert_aligned(page)
        position = page.locator('.file-colheads').bounding_box()
        files = page.locator('.files').bounding_box()
        assert abs(position['y'] - files['y']) < 1, (position, files)
        box = page.locator('.pane-resizer').first.bounding_box()
        x, y = box['x']+box['width']/2, box['y']+box['height']/2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x+(50 if width>920 else 0), y+(40 if width<=920 else 0), steps=5)
        page.mouse.up()
        assert_aligned(page)
        # Border positions should track panel changes, not remain stuck at old values.
        assert not errors, errors
        if width==1600:
            page.locator('.files').evaluate('e => e.scrollTop = 0')
            page.screenshot(path=str(ROOT/'fixed-columns-desktop.png'))
        print('aligned', width, [round(v,2) for v in initial])
        page.close()
    browser.close()
