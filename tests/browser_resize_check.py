"""Check FAR pane dividers, yellow titles, and locally saved sizes."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'syndicate-preview.html').read_text(encoding='utf-8')
STORAGE = """(saved) => Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    value: saved,
    getItem(key) { return key === 'archive.panel-ratios.v1' ? this.value : null; },
    setItem(key, value) { if (key === 'archive.panel-ratios.v1') this.value = value; }
  }
})"""


def sizes(page, axis):
    return page.locator('.panel').evaluate_all(
        '(panes, axis) => panes.map(p => p.getBoundingClientRect()[axis])', axis
    )


def drag(page, divider, dx, dy):
    box = page.locator('.pane-resizer').nth(divider).bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=6)
    page.mouse.up()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height, direction, axis, delta in [
        (1600, 900, 'row', 'width', (65, 0)),
        (390, 844, 'column', 'height', (0, 30)),
    ]:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.evaluate(STORAGE, None)
        page.set_content(HTML, wait_until='load')
        page.wait_for_selector('.file-item')
        titles = [x.strip() for x in page.locator('.panel-head span:first-child').all_text_contents()]
        assert titles == ['[ Каталоги ]', '[ Файлы ]', '[ Просмотр ]'], titles
        assert page.locator('.panel-head span:first-child').first.evaluate(
            '(el) => getComputedStyle(el).color'
        ) == 'rgb(255, 255, 51)'
        # The draggable 7px hit area must be visually invisible even when focused or hovered.
        divider = page.locator('.pane-resizer').first
        assert divider.evaluate('(el) => getComputedStyle(el, "::before").content') == 'none'
        assert divider.evaluate('(el) => getComputedStyle(el).backgroundColor') == 'rgba(0, 0, 0, 0)'
        bounds = divider.bounding_box()
        page.mouse.move(bounds['x'] + bounds['width'] / 2, bounds['y'] + bounds['height'] / 2)
        divider.focus()
        assert divider.evaluate('(el) => getComputedStyle(el).outlineStyle') == 'none'
        before = sizes(page, axis)
        drag(page, 0, *delta)
        after = sizes(page, axis)
        assert after[0] > before[0] + 20 and after[1] < before[1] - 20, (before, after)
        assert abs(after[2] - before[2]) < 3, (before, after)
        assert page.locator('.pane-resizer').first.get_attribute('aria-orientation') == (
            'vertical' if direction == 'row' else 'horizontal'
        )
        handle = page.locator('.pane-resizer').nth(1)
        handle.focus()
        page.keyboard.press('ArrowRight' if direction == 'row' else 'ArrowDown')
        after_key = sizes(page, axis)
        assert after_key[1] > after[1] + 5, (after, after_key)
        stored = page.evaluate("localStorage.getItem('archive.panel-ratios.v1')")
        assert stored and direction in stored
        second = browser.new_page(viewport={'width': width, 'height': height})
        second.evaluate(STORAGE, stored)
        second.set_content(HTML, wait_until='load')
        second.wait_for_selector('.file-item')
        restored = sizes(second, axis)
        assert all(abs(a - b) < 3 for a, b in zip(restored, after_key)), (restored, after_key)
        if width < 500:
            overflow = second.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            assert overflow <= 0, overflow
        assert not errors, errors
        print(direction, 'PASS', [round(x) for x in before], '->', [round(x) for x in after_key])
        page.close()
        second.close()
    browser.close()
