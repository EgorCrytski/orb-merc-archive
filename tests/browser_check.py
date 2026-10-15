"""Smoke check the offline archive with a real Chromium browser."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'syndicate-preview.html').read_text(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for name, width, height in [('desktop', 1600, 900), ('mobile', 390, 844)]:
        page = browser.new_page(viewport={'width':width, 'height':height}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(HTML, wait_until='load')
        page.wait_for_selector('.file-item')
        assert page.title() == 'C:\\ARCHIVE\\ - Архив', page.title()
        assert not page.locator('.brandline, .status-led, img, svg').count()
        assert page.locator('.file-item').count() == 4
        assert 'Личные дела' in page.locator('#tree').inner_text()
        row = page.locator('.file-item').first
        bg, color = row.evaluate('(el) => {const s = getComputedStyle(el); return [s.backgroundColor, s.color]}')
        assert bg != 'rgba(0, 0, 0, 0)' and color != bg, (bg,color)
        page.locator('#tree button').filter(has_text='Личные дела').click()
        page.wait_for_timeout(150)
        assert 'README.md' in page.locator('.file-item').all_inner_texts().__str__(), page.locator('.file-item').all_inner_texts()
        page.locator('.file-item').filter(has_text='README.md').click()
        page.wait_for_function("document.querySelector('#doc-state').textContent === '1:1'")
        assert 'личные дела' in page.locator('#document').inner_text().casefold()
        page.locator('#files').focus()
        for _ in range(page.locator('.file-item').count()):
            page.keyboard.press('ArrowUp')
        assert page.locator('.file-item.selected').inner_text().startswith('[..]')
        page.keyboard.press('ArrowDown')
        page.keyboard.press('F3')
        page.wait_for_function("document.querySelector('#doc-state').textContent === '1:1'")
        page.keyboard.press('F7')
        assert page.locator('#search-dialog').evaluate('(e) => e.open')
        page.locator('#search-input').fill('Приказы')
        assert page.locator('.search-result').count() > 0
        page.keyboard.press('Escape')
        assert not page.locator('#search-dialog').evaluate('(e) => e.open')
        page.screenshot(path=str(ROOT / f'far-{name}.png'), full_page=True)
        if width < 500:
            info=page.evaluate('({scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth})')
            assert info['scrollWidth'] <= info['innerWidth'], info
        assert not errors, errors
        print(name, 'PASS', {'files':page.locator('.file-item').count(), 'errors':errors, 'selected_colors':(bg,color)})
        page.close()
    browser.close()
