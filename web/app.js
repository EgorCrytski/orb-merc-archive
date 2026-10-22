'use strict';

const state = {entries: [], directory: '', selected: 0, document: '', loading: false};
const $ = (id) => document.getElementById(id);
const collator = new Intl.Collator('ru', {numeric: true, sensitivity: 'base'});
const sortItems = (a, b) => (a.type === b.type ? collator.compare(a.name, b.name) : a.type === 'dir' ? -1 : 1);
const parentOf = (path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const urlFor = (path) => (window.offlineImages && Object.hasOwn(window.offlineImages, path))
  ? window.offlineImages[path]
  : 'content/' + path.split('/').map(encodeURIComponent).join('/');
// Page-load revision. The host serves content with a ten-minute cache. The manifest
// was already fetched with a revision while documents and images were not, so after an
// update a reader could sit on a stale dossier for ten minutes without knowing. One
// revision per page load still lets a single image be cached for that load, and the
// data URIs the offline preview hands back are left untouched.
const REV = Date.now();
const bust = (url) => url.startsWith('content/') ? url + '?rev=' + REV : url;
const encHash = (path) => '#' + path.split('/').map(encodeURIComponent).join('/');

function childrenOf(dir) {
  return state.entries.filter(item => parentOf(item.path) === dir).sort(sortItems);
}
function listItems(dir) {
  return dir ? [{type: 'parent', path: parentOf(dir), name: '[..]'}].concat(childrenOf(dir)) : childrenOf(dir);
}
function displayPath(path) { return 'C:\\ARCHIVE\\' + (path ? path.split('/').join('\\') + '\\' : ''); }

function makeButton(text, className, action) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
  if (className) el.className = className;
  el.addEventListener('click', action); return el;
}
function clearPreview() {
  cancelTyping();
  state.document = '';
  $('document-title').firstElementChild.textContent = 'Файл не выбран';
  $('document').innerHTML = '<div class="empty-doc">Файл не выбран.<br>Enter или F3 - просмотр.</div>';
  $('doc-state').textContent = '--';
}
function openDirectory(path, selectedPath) {
  state.directory = path;
  clearPreview();
  if (location.hash !== encHash(path)) history.replaceState(null, '', encHash(path));
  const items = listItems(path);
  const index = selectedPath ? items.findIndex(item => item.path === selectedPath) : -1;
  state.selected = Math.max(0, index);
  render();
}
function selectItem(index, activate = false) {
  const items = listItems(state.directory);
  if (!items.length) return;
  state.selected = Math.min(Math.max(index, 0), items.length - 1);
  renderFiles();
  if (activate) activateItem(items[state.selected]);
}
function activateItem(item) {
  if (!item) return;
  if (item.type === 'parent') navigateUp();
  else if (item.type === 'dir') {openDirectory(item.path); $('files').focus();}
  else if (item.type === 'image') openImage(item.path);
  else openDocument(item.path);
}
function navigateUp() {
  if (state.directory) {
    const previous = state.directory;
    openDirectory(parentOf(previous), previous);
    $('files').focus();
  }
}
function renderTree() {
  const tree = $('tree'); tree.replaceChildren();
  const root = makeButton('[..]', state.directory === '' ? 'active' : '', () => openDirectory(''));
  root.dataset.path = '';
  tree.append(root);
  const dirs = state.entries.filter(x => x.type === 'dir');
  function appendChildren(parent, prefix) {
    const children = dirs.filter(dir => parentOf(dir.path) === parent)
      .sort((a,b) => collator.compare(a.name,b.name));
    children.forEach((dir,i) => {
      const tail = i === children.length-1;
      const hasChildren = dirs.some(x => parentOf(x.path) === dir.path);
      const marker = hasChildren ? '[-]' : '[+]';
      const branch = prefix + (tail ? '└─ ' : '├─ ');
      const btn = makeButton(branch + marker + ' ' + dir.name,
        state.directory === dir.path ? 'active' : '', () => openDirectory(dir.path));
      btn.title = dir.path;
      btn.dataset.path = dir.path;
      tree.append(btn);
      appendChildren(dir.path, prefix + (tail ? '   ' : '│  '));
    });
  }
  appendChildren('', '');
}
function renderCrumbs() {
  const crumbs = $('breadcrumbs'); crumbs.replaceChildren();
  crumbs.append(makeButton(displayPath(state.directory), '', () => openDirectory('')));
  $('status-path').textContent = displayPath(state.directory);
}
function renderFiles() {
  const items = listItems(state.directory); const list = $('files');
  // Keep the header inside the same scroll viewport as the rows.
  // Otherwise different padding/scrollbar widths shift column borders.
  list.replaceChildren($('file-colheads'));
  if (!items.length) {
    const el = document.createElement('div'); el.className='nothing';
    el.textContent='Каталог пуст.';list.append(el);
  }
  items.forEach((item, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `file-item${i === state.selected ? ' selected' : ''}`;
    button.role = 'option'; button.setAttribute('aria-selected', String(i === state.selected));
    const name = document.createElement('span'); name.className='name'; name.textContent = item.name;
    const ext = document.createElement('span'); ext.className='ext';
    ext.textContent = item.type === 'file' ? 'md'
      : item.type === 'image' ? (item.name.split('.').pop() || 'img').toLowerCase()
      : '<DIR>';
    const size = document.createElement('span'); size.className = 'size';
    size.textContent = item.type !== 'dir' && Number.isInteger(item.size) ? item.size.toLocaleString('ru-RU') : '';
    button.append(name,ext,size);
    button.addEventListener('click', () => {state.selected = i; renderFiles(); activateItem(item);});
    list.append(button);
  });
  $('item-count').textContent = items.length + ' объектов';
  $('selection-count').textContent = items.length + ' объектов';
  $('status-counter').textContent = state.entries.filter(x => x.type === 'file').length + ' файлов';
}
function render() {renderTree();renderCrumbs();renderFiles();}

// Minimal safe Markdown subset: raw HTML is escaped, link protocols are restricted.
function escapeHtml(text) {return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function inline(text, documentPath = '') {
  const placeholders=[];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_,code) => {let id=placeholders.length; placeholders.push('<code>'+code+'</code>');return `\u0000${id}\u0000`;});
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_all, alt, url) => {
    const raw = url.replace(/&amp;/g,'&').trim();
    if (!/^(?!\/|\\|#|[a-z][a-z\d+.-]*:)[^\s]+$/i.test(raw)) return '[изображение: '+alt+']';
    const base = documentPath ? parentOf(documentPath) : '';
    const target = base ? base + '/' + raw : raw;
    return `<img class="inline-image" src="${escapeHtml(bust(urlFor(target)))}" alt="${escapeHtml(alt)}" loading="lazy">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_all,label,url) => {
    const raw = url.replace(/&amp;/g,'&');
    const isValid = /^https?:\/\//i.test(raw) || /^(?!\/|\\|#|[a-z][a-z\d+.-]*:)[^\s]+$/i.test(raw) || raw.startsWith('#');
    if (!isValid) return label;
    return `<a href="${escapeHtml(raw)}" rel="noopener noreferrer" ${/^https?:\/\//i.test(raw) ? 'target="_blank"' : ''}>${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
  return html.replace(/\u0000(\d+)\u0000/g,(_,id)=>placeholders[Number(id)]);
}
function markdown(source, documentPath = '') {
  const lines = source.replace(/\r\n/g,'\n').split('\n');
  let output='',paragraph=[],listType='',quote=[],inCode=false,code=[];
  const fmt = value => inline(value, documentPath);
  const flushParagraph=()=>{if(paragraph.length){output+='<p>'+fmt(paragraph.join(' '))+'</p>';paragraph=[];}};
  const flushList=()=>{if(listType){output+=`</${listType}>`;listType='';}};
  const flushQuote=()=>{if(quote.length){output+='<blockquote>'+fmt(quote.join(' '))+'</blockquote>';quote=[];}};
  const cells = row => row.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(s => s.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inCode && /^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i+1])) {
      flushParagraph();flushList();flushQuote();
      const headers = cells(line);
      output += '<table><thead><tr>'+headers.map(v=>'<th>'+fmt(v)+'</th>').join('')+'</tr></thead><tbody>';
      i++;
      while (i+1<lines.length && /^\s*\|/.test(lines[i+1])) {
        const row = cells(lines[++i]);
        output += '<tr>'+headers.map((_,n)=>'<td>'+fmt(row[n]||'')+'</td>').join('')+'</tr>';
      }
      output += '</tbody></table>';
      continue;
    }
    if (/^\s*```/.test(line)) {flushParagraph();flushList();flushQuote();if (inCode) {output+='<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>';code=[];inCode=false;} else inCode=true;continue;}
    if(inCode){code.push(line);continue;}
    if (!line.trim()){flushParagraph();flushList();flushQuote();continue;}
    let match;
    if ((match=line.match(/^(#{1,3})\s+(.+)$/))){flushParagraph();flushList();flushQuote();const n=match[1].length;output+=`<h${n}>${fmt(match[2])}</h${n}>`;continue;}
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)){flushParagraph();flushList();flushQuote();output+='<hr>';continue;}
    if ((match=line.match(/^>\s?(.*)$/))){flushParagraph();flushList();quote.push(match[1]);continue;}
    if ((match=line.match(/^\s*([-*]|\d+\.)\s+(.+)$/))){flushParagraph();flushQuote();const next=/\d/.test(match[1][0])?'ol':'ul';if(listType!==next){flushList();listType=next;output+=`<${next}>`;}output+='<li>'+fmt(match[2])+'</li>';continue;}
    flushList();flushQuote();paragraph.push(line.trim());
  }
  flushParagraph();flushList();flushQuote();
  if(inCode)output+='<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>';
  return output;
}
// Text is printed character by character, the way a slow terminal outputs it.
// The rate stays inside TYPE_MIN_CPS..TYPE_MAX_CPS and is chosen so that any
// text takes roughly TYPE_TARGET_SECONDS. Counting is time-based on animation
// frames rather than one timeout per character, because nested timeouts are
// clamped to about 4 ms and would cap the rate below the requested ceiling.
//
// Any keypress or click finishes the current output at once, the way a pager
// responds to a key. Long documents are printed at 100..300 characters per
// second, which can take tens of seconds, so the interruption is the point.
const TYPE_MIN_CPS = 100;
const TYPE_MAX_CPS = 300;
const TYPE_TARGET_SECONDS = 0.6;
let activeTyping = null;
function cancelTyping() { activeTyping = null; }
function finishTyping() {
  if (!activeTyping) return false;
  const finish = activeTyping;
  activeTyping = null;
  finish();
  return true;
}
function animateText(characters, paint, isCurrent) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || characters === 0) { paint(characters); return; }
  const rate = Math.min(TYPE_MAX_CPS, Math.max(TYPE_MIN_CPS, characters / TYPE_TARGET_SECONDS));
  const started = performance.now();
  const finish = () => paint(characters);
  activeTyping = finish;
  const step = () => {
    if (activeTyping !== finish) return;
    if (!isCurrent()) { activeTyping = null; return; }
    const shown = Math.min(characters, Math.floor((performance.now() - started) / 1000 * rate) + 1);
    paint(shown);
    if (shown < characters) requestAnimationFrame(step);
    else activeTyping = null;
  };
  requestAnimationFrame(step);
}
function typeText(element, text, isCurrent) {
  element.textContent = '';
  if (!text) return;
  animateText(text.length, shown => { element.textContent = text.slice(0, shown); }, isCurrent);
}
// Documents are rendered HTML, so the markup cannot be typed. Every text node is
// emptied first and then filled from one running character count, which keeps
// headings, tables and links in place and brings them in as the count reaches them.
function typeDocument(root, isCurrent) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let total = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue;
    if (!text) continue;
    nodes.push([node, text, total]);
    total += text.length;
    node.nodeValue = '';
  }
  if (!nodes.length) return;
  animateText(total, shown => {
    for (const [node, text, offset] of nodes) {
      const visible = Math.max(0, Math.min(text.length, shown - offset));
      node.nodeValue = visible >= text.length ? text : text.slice(0, visible);
    }
  }, isCurrent);
}
// The image resolves from large blocks to the native picture, the way a slow
// picture loads in an old file viewer. The whole cycle takes REVEAL_MS.
const REVEAL_MS = 250;
const REVEAL_WIDTHS = [12, 24, 48, 96, 192];
function revealImage(canvas, image, isCurrent, onDone) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const scratch = document.createElement('canvas');
  const scratchContext = scratch.getContext('2d');
  const drawNative = () => {
    context.imageSmoothingEnabled = true;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    if (onDone) onDone();
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frames = reduced ? [] : REVEAL_WIDTHS.filter(value => value < width);
  frames.push(width);
  // frames.length - 1 intervals, so the native draw lands exactly at REVEAL_MS.
  const interval = frames.length > 1 ? REVEAL_MS / (frames.length - 1) : REVEAL_MS;
  let index = 0;
  const step = () => {
    if (!isCurrent()) return;
    const resolution = frames[index];
    if (resolution >= width) { drawNative(); return; }
    const rows = Math.max(1, Math.round(height * resolution / width));
    scratch.width = resolution;
    scratch.height = rows;
    scratchContext.imageSmoothingEnabled = true;
    scratchContext.clearRect(0, 0, resolution, rows);
    scratchContext.drawImage(image, 0, 0, resolution, rows);
    // Nearest-neighbour upscaling is what makes the blocks visible.
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.drawImage(scratch, 0, 0, resolution, rows, 0, 0, width, height);
    index += 1;
    setTimeout(step, interval);
  };
  step();
}
// Images open in the same preview pane as documents, the way a file manager viewer works.
function openImage(path) {
  state.document = path;
  const name = path.split('/').pop();
  const entry = state.entries.find(x => x.path === path) || {};
  const isCurrent = () => state.document === path;
  $('document-title').firstElementChild.textContent = name;
  $('doc-state').textContent = 'Изображение';
  if (location.hash !== encHash(path)) history.replaceState(null, '', encHash(path));
  const pane = $('document');
  pane.replaceChildren();
  const figure = document.createElement('figure'); figure.className = 'image-view';
  const canvas = document.createElement('canvas');
  canvas.className = 'image-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', name);
  // Left empty on purpose: the caption is printed by typeText once the picture resolves.
  const caption = document.createElement('figcaption');
  const bytes = Number.isInteger(entry.size) ? ' · ' + entry.size.toLocaleString('ru-RU') + ' байт' : '';
  const captionText = name + bytes;
  // The image element stays out of the document: it only loads the source and
  // reports errors, while the canvas is what the viewer actually shows.
  const image = document.createElement('img');
  image.src = bust(urlFor(path));
  image.alt = name;
  image.decoding = 'async';
  image.addEventListener('load', () => {
    if (!isCurrent()) return;
    $('doc-state').textContent = image.naturalWidth + 'x' + image.naturalHeight;
    revealImage(canvas, image, isCurrent, () => typeText(caption, captionText, isCurrent));
  });
  image.addEventListener('error', () => {
    if (!isCurrent()) return;
    const failed = document.createElement('div');
    failed.className = 'nothing';
    failed.textContent = 'Не удалось открыть изображение.';
    pane.replaceChildren(failed);
    $('doc-state').textContent = 'Ошибка';
  });
  figure.append(canvas, caption);
  pane.append(figure);
  pane.scrollTop = 0;
}
async function openDocument(path) {
  state.document = path;
  $('document-title').firstElementChild.textContent=path.split('/').pop();
  $('doc-state').textContent='Чтение';
  $('document').innerHTML='<div class="nothing">Чтение документа...</div>';
  if (location.hash !== encHash(path)) history.replaceState(null, '', encHash(path));
  try {
    const response = await fetch(bust(urlFor(path)), {cache:'no-store'});
    if (!response.ok) throw new Error('HTTP '+response.status);
    const source = await response.text();
    if (state.document !== path) return;
    $('document').innerHTML='<article class="doc-content">'+markdown(source,path)+'</article>';
    $('document').scrollTop=0;$('doc-state').textContent='1:1';
    typeDocument($('document'), () => state.document === path);
  } catch (e) {
    if (state.document!==path) return;
    $('document').textContent='Не удалось загрузить документ: '+e.message;
    $('doc-state').textContent='Ошибка';
  }
}
function showHelp(){ $('help').showModal(); }
function showSearch(){ $('search-dialog').showModal();$('search-input').value='';renderSearch();$('search-input').focus(); }
function renderSearch(){
  const text=$('search-input').value.trim().toLocaleLowerCase('ru');
  const matches=state.entries.filter(x=>text && x.path.toLocaleLowerCase('ru').includes(text)).slice(0,40);
  const target=$('search-results');target.replaceChildren();
  matches.forEach(item=>{const btn=makeButton(item.name,'search-result',()=>{ $('search-dialog').close();if(item.type==='dir')openDirectory(item.path);else {openDirectory(parentOf(item.path),item.path);activateItem(item);} });
    const where=document.createElement('span'); where.textContent=item.path;btn.append(where);target.append(btn);});
  if(!matches.length){const empty=document.createElement('div');empty.className='nothing';empty.textContent=text?'Совпадений нет':'Поиск по именам всех файлов и папок.';target.append(empty);}
}
// Resolve one archive path to a directory, document or image. Used both for the
// initial deep link and for later hash changes, so pasting a link into the
// address bar keeps working after the first load.
function openByPath(path) {
  const existing = state.entries.find(x => x.path === path);
  if (!existing) return false;
  if (existing.type === 'dir') openDirectory(path);
  else {
    openDirectory(parentOf(path), path);
    if (existing.type === 'image') openImage(path);
    else openDocument(path);
  }
  return true;
}
function hashPath() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}
window.addEventListener('hashchange', () => { openByPath(hashPath()); });
async function loadIndex() {
  try{
    const response = await fetch('manifest.json?rev='+Date.now(), {cache:'no-store'});
    if (!response.ok) throw new Error('HTTP '+response.status);
    const data=await response.json();
    if (data.version !== 1 || !Array.isArray(data.entries)) throw new Error('Неподдерживаемый индекс');
    state.entries=data.entries.filter(x=>['dir','file','image'].includes(x.type)&&typeof x.path==='string'&&typeof x.name==='string');
    if (!openByPath(hashPath())) openDirectory('');
  }catch(err){$('files').textContent='Не удалось получить индекс: '+err.message+' (запусти scripts/build.py и открывай сайт через HTTP).';$('doc-state').textContent='Нет индекса';}
}
// Boot log. Runs after the index is loaded so the counts it prints are the real
// ones rather than a decoration. A terminal that mounts an encrypted volume is
// what the archive pretends to be, so this reports itself the same way.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bootSequence() {
  const boot = $('boot'), log = $('boot-log');
  if (!boot || !log) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { boot.remove(); return; }
  const documents = state.entries.filter(entry => entry.type === 'file').length;
  const images = state.entries.filter(entry => entry.type === 'image').length;
  // Prefix, text, pause in milliseconds. The pauses are hand-set rather than
  // generated: a real boot is dense at the start and stalls where it waits for
  // hardware, and uniform output reads as fake. @@INDEX@@ is replaced with the
  // counts from the manifest that was just loaded.
  const lines = [
    ["[    0.000000]", "Linux version 4.9.0-orb (build@hq) (gcc version 6.3.0 20170516) #1 SMP PREEMPT Wed Oct 14 22:41:07 UTC 2015", 6],
    ["[    0.000000]", "Command line: BOOT_IMAGE=/vmlinuz-4.9.0-orb root=/dev/mapper/archive-root ro quiet", 5],
    ["[    0.000000]", "x86/fpu: Supporting XSAVE feature 0x001: 'x87 floating point registers'", 4],
    ["[    0.000000]", "x86/fpu: Supporting XSAVE feature 0x002: 'SSE registers'", 4],
    ["[    0.000000]", "x86/fpu: Supporting XSAVE feature 0x004: 'AVX registers'", 4],
    ["[    0.000000]", "x86/fpu: Enabled xstate features 0x7, context size is 832 bytes, using 'standard' format.", 5],
    ["[    0.000000]", "e820: BIOS-provided physical RAM map:", 4],
    ["[    0.000000]", "BIOS-e820: [mem 0x0000000000000000-0x000000000009fbff] usable", 3],
    ["[    0.000000]", "BIOS-e820: [mem 0x000000000009fc00-0x000000000009ffff] reserved", 3],
    ["[    0.000000]", "BIOS-e820: [mem 0x00000000000f0000-0x00000000000fffff] reserved", 3],
    ["[    0.000000]", "BIOS-e820: [mem 0x0000000000100000-0x0000000007fdffff] usable", 3],
    ["[    0.000000]", "BIOS-e820: [mem 0x0000000007fe0000-0x0000000007ffffff] ACPI data", 4],
    ["[    0.000000]", "NX (Execute Disable) protection: active", 4],
    ["[    0.000000]", "DMI: ORB Systems Ltd. ARCHIVE-TERM/1.0, BIOS 2.4.1 10/14/2015", 6],
    ["[    0.000000]", "SMBIOS 2.5 present.", 4],
    ["[    0.000000]", "ACPI: RSDP 0x00000000000f9b40 00024 (v02 ORB)", 4],
    ["[    0.000000]", "ACPI: XSDT 0x0000000007fe0120 00044 (v01 ORB ARCHIVE 00000001 01000013)", 4],
    ["[    0.000000]", "ACPI: FACP 0x0000000007fe1000 000F4 (v04 ORB ARCHIVE 00000001 MSFT 00000097)", 4],
    ["[    0.000000]", "ACPI: DSDT 0x0000000007fe2000 004C1 (v01 ORB ARCHIVE 00000001 INTL 20051117)", 5],
    ["[    0.000000]", "Zone ranges:", 3],
    ["[    0.000000]", "  DMA      [mem 0x0000000000001000-0x0000000000ffffff]", 3],
    ["[    0.000000]", "  Normal   [mem 0x0000000001000000-0x0000000007fdffff]", 3],
    ["[    0.000000]", "Initmem setup node 0 [mem 0x0000000000001000-0x0000000007fdffff]", 4],
    ["[    0.000000]", "ACPI: PM-Timer IO Port: 0x408", 4],
    ["[    0.000000]", "IOAPIC[0]: apic_id 0, version 32, address 0xfec00000, GSI 0-23", 4],
    ["[    0.000000]", "smpboot: Allowing 2 CPUs, 1 hotplug CPUs", 4],
    ["[    0.000000]", "Built 1 zonelists in Node order, mobility grouping on.  Total pages: 32492", 5],
    ["[    0.000000]", "Kernel command line: BOOT_IMAGE=/vmlinuz-4.9.0-orb root=/dev/mapper/archive-root ro quiet", 5],
    ["[    0.000000]", "PID hash table entries: 512 (order: 0, 4096 bytes)", 4],
    ["[    0.000000]", "Memory: 120388K/131064K available (4096K kernel code, 512K rwdata, 1024K rodata, 512K init, 256K bss, 10676K reserved, 0K cma-reserved)", 7],
    ["[    0.000000]", "SLUB: HWalign=64, Order=0-3, MinObjects=0, CPUs=1, Nodes=1", 4],
    ["[    0.000000]", "NR_IRQS:2304 nr_irqs:256 16", 4],
    ["[    0.000000]", "Console: colour VGA+ 80x25", 4],
    ["[    0.000000]", "console [tty0] enabled", 4],
    ["[    0.000000]", "clocksource: hpet: mask: 0xffffffff max_cycles: 0xffffffff, max_idle_ns: 79635851949 ns", 5],
    ["[    0.000000]", "tsc: Fast TSC calibration using PIT", 4],
    ["[    0.000000]", "tsc: Detected 2394.005 MHz processor", 5],
    ["[    0.001000]", "Calibrating delay loop (skipped), value calculated using timer frequency.. 4788.01 BogoMIPS", 6],
    ["[    0.003000]", "pid_max: default: 32768 minimum: 301", 4],
    ["[    0.004000]", "Security Framework initialized", 4],
    ["[    0.005000]", "Yama: becoming mindful.", 4],
    ["[    0.006000]", "Dentry cache hash table entries: 16384 (order: 4, 65536 bytes)", 4],
    ["[    0.008000]", "Inode-cache hash table entries: 8192 (order: 3, 32768 bytes)", 4],
    ["[    0.009000]", "Mount-cache hash table entries: 2048 (order: 1, 8192 bytes)", 4],
    ["[    0.010000]", "CPU: Physical Processor ID: 0", 4],
    ["[    0.011000]", "mce: CPU supports 5 MCE banks", 4],
    ["[    0.013000]", "process: using AMD E4000 (family: 0x10, model: 0x6, stepping: 0x2)", 5],
    ["[    0.014000]", "Performance Events: AMD PMU driver.", 4],
    ["[    0.015000]", "... version:                0", 3],
    ["[    0.016000]", "... bit width:              48", 3],
    ["[    0.017000]", "... generic registers:      4", 3],
    ["[    0.018000]", "... value mask:             0000ffffffffffff", 3],
    ["[    0.019000]", "... max period:             00007fffffffffff", 3],
    ["[    0.020000]", "... fixed-purpose events:   0", 3],
    ["[    0.021000]", "... event mask:             000000000000000f", 4],
    ["[    0.023000]", "SMP alternatives: lockdep: fixing up alternatives", 5],
    ["[    0.026000]", "Booting Node   0, Processors  #1", 5],
    ["[    0.031000]", "Brought up 1 CPUs", 4],
    ["[    0.033000]", "devtmpfs: initialized", 5],
    ["[    0.038000]", "PM: Registering ACPI NVS region [mem 0x07fe0000-0x07ffffff] (131072 bytes)", 5],
    ["[    0.041000]", "clocksource: jiffies: mask: 0xffffffff max_cycles: 0xffffffff, max_idle_ns: 19112604462750000 ns", 5],
    ["[    0.044000]", "NET: Registered protocol family 16", 5],
    ["[    0.048000]", "cpuidle: using governor ladder", 5],
    ["[    0.051000]", "ACPI: bus type PCI registered", 5],
    ["[    0.054000]", "PCI: Using configuration type 1 for base access", 5],
    ["[    0.061000]", "ACPI: Added _OSI(Module Device)", 4],
    ["[    0.064000]", "ACPI: Added _OSI(Processor Device)", 4],
    ["[    0.067000]", "ACPI: Added _OSI(3.0 _SCP Extensions)", 4],
    ["[    0.071000]", "ACPI: Interpreter enabled", 5],
    ["[    0.074000]", "ACPI: (supports S0 S1 S3 S4 S5)", 4],
    ["[    0.078000]", "ACPI: Using IOAPIC for interrupt routing", 5],
    ["[    0.082000]", "PCI: CLS 64 bytes, default 64", 5],
    ["[    0.091000]", "pci 0000:00:00.0: [1022:1510] type 00 class 0x060000", 6],
    ["[    0.094000]", "pci 0000:00:01.0: [1002:9802] type 00 class 0x030000", 5],
    ["[    0.097000]", "pci 0000:00:01.0: reg 0x10: [mem 0xe0000000-0xefffffff pref]", 5],
    ["[    0.101000]", "pci 0000:00:11.0: [1002:4391] type 00 class 0x010601", 5],
    ["[    0.104000]", "pci 0000:00:11.0: reg 0x24: [io  0x4010-0x4017]", 5],
    ["[    0.108000]", "pci 0000:00:12.0: [1002:4397] type 00 class 0x0c0310", 5],
    ["[    0.111000]", "pci 0000:00:14.0: [1002:4385] type 00 class 0x0c0500", 5],
    ["[    0.115000]", "pci 0000:00:14.3: [1002:439d] type 00 class 0x060100", 5],
    ["[    0.118000]", "pci 0000:00:16.0: [1002:439c] type 00 class 0x01018a", 6],
    ["[    0.124000]", "ACPI: PCI Interrupt Link [LNKA] (IRQs 3 4 5 7 10 11) *0", 6],
    ["[    0.131000]", "vgaarb: setting as boot device: PCI:0000:00:01.0", 5],
    ["[    0.134000]", "vgaarb: device added: PCI:0000:00:01.0,decodes=io+mem,owns=io+mem,locks=none", 5],
    ["[    0.141000]", "vgaarb: bridge control possible 0000:00:01.0", 5],
    ["[    0.148000]", "SCSI subsystem initialized", 6],
    ["[    0.154000]", "libata version 3.00 loaded.", 6],
    ["[    0.161000]", "ATA: version 4.9.0-orb", 5],
    ["[    0.167000]", "ata1: PATA max UDMA/100 cmd 0x1f0 ctl 0x3f6 bmdma 0x4000 irq 14", 5],
    ["[    0.171000]", "ata2: PATA max UDMA/100 cmd 0x170 ctl 0x376 bmdma 0x4008 irq 15", 190],
    ["[    0.208000]", "usbcore: registered new interface driver usbfs", 6],
    ["[    0.211000]", "usbcore: registered new interface driver hub", 5],
    ["[    0.215000]", "usbcore: registered new device driver usb", 5],
    ["[    0.221000]", "ehci_hcd: USB 2.0 'Enhanced' Host Controller (EHCI) Driver", 5],
    ["[    0.228000]", "ohci_hcd: USB 1.1 'Open' Host Controller (OHCI) Driver", 5],
    ["[    0.234000]", "uhci_hcd: USB Universal Host Controller Interface driver", 5],
    ["[    0.251000]", "rtc_cmos 00:03: RTC can wake from S4", 6],
    ["[    0.254000]", "rtc_cmos 00:03: rtc core: registered rtc_cmos as rtc0", 5],
    ["[    0.258000]", "rtc_cmos 00:03: alarms up to one month, y3k, 114 bytes nvram, hpet irqs", 5],
    ["[    0.271000]", "NET: Registered protocol family 2", 6],
    ["[    0.278000]", "TCP established hash table entries: 2048 (order: 2, 16384 bytes)", 5],
    ["[    0.284000]", "TCP bind hash table entries: 2048 (order: 2, 16384 bytes)", 5],
    ["[    0.291000]", "TCP: Hash tables configured (established 2048 bind 2048)", 5],
    ["[    0.298000]", "UDP hash table entries: 256 (order: 1, 8192 bytes)", 5],
    ["[    0.304000]", "NET: Registered protocol family 1", 5],
    ["[    0.311000]", "audit: initializing netlink subsys (disabled)", 6],
    ["[    0.318000]", "io scheduler noop registered", 5],
    ["[    0.324000]", "io scheduler deadline registered", 5],
    ["[    0.331000]", "io scheduler cfq registered (default)", 5],
    ["[    0.338000]", "pci_hotplug: PCI Hot Plug PCI Core version: 0.5", 6],
    ["[    0.346000]", "Serial: 8250/16550 driver, 4 ports, IRQ sharing enabled", 6],
    ["[    0.354000]", "serial8250: ttyS0 at I/O 0x3f8 (irq = 4, base_baud = 115200) is a 16550A", 5],
    ["[    0.362000]", "Linux agpgart interface v0.103", 6],
    ["[    0.369000]", "loop: module loaded", 5],
    ["[    0.401000]", "ata1.00: ATA-8: ORB-STORAGE SSD 64GB, 2.4.1, max UDMA/133", 210],
    ["[    0.412000]", "ata1.00: 125045424 sectors, multi 16: LBA48 NCQ (depth 31/32)", 8],
    ["[    0.424000]", "ata1.00: configured for UDMA/100", 9],
    ["[    0.438000]", "scsi 0:0:0:0: Direct-Access     ATA      ORB-STORAGE SSD  2.4  PQ: 0 ANSI: 5", 9],
    ["[    0.451000]", "sd 0:0:0:0: [sda] 125045424 512-byte logical blocks: (64.0 GB/59.6 GiB)", 7],
    ["[    0.459000]", "sd 0:0:0:0: [sda] Write Protect is off", 5],
    ["[    0.464000]", "sd 0:0:0:0: [sda] Mode Sense: 00 3a 00 00", 5],
    ["[    0.471000]", "sd 0:0:0:0: [sda] Write cache: enabled, read cache: enabled, does not support DPO or FUA", 6],
    ["[    0.482000]", " sda: sda1 sda2 sda3", 7],
    ["[    0.491000]", "sd 0:0:0:0: [sda] Attached SCSI disk", 6],
    ["[    0.518000]", "EXT4-fs (sda1): mounted filesystem with ordered data mode. Opts: (null)", 40],
    ["[    0.562000]", "VFS: Mounted root (ext4 filesystem) readonly on device 8:1.", 8],
    ["[    0.571000]", "devtmpfs: mounted", 6],
    ["[    0.584000]", "Freeing unused kernel memory: 512K", 5],
    ["[    0.592000]", "Write protecting the kernel read-only data: 8192k", 5],
    ["[    0.603000]", "Freeing unused kernel memory: 1024K", 6],
    ["[    0.641000]", "random: systemd: uninitialized urandom read (16 bytes read)", 12],
    ["[    0.688000]", "systemd[1]: systemd 232 running in system mode. (+PAM +AUDIT +SELINUX +IMA +APPARMOR +SMACK +SYSVINIT +UTMP +LIBCRYPTSETUP +GCRYPT +GNUTLS +ACL +XZ +LZ4 +SECCOMP +BLKID +ELFUTILS +KMOD +IDN)", 14],
    ["[    0.702000]", "systemd[1]: Detected architecture x86-64.", 8],
    ["[    0.711000]", "systemd[1]: Set hostname to <archive-term>.", 9],
    ["[    0.724000]", "systemd[1]: Listening on udev Control Socket.", 7],
    ["[    0.733000]", "systemd[1]: Listening on Journal Socket.", 7],
    ["[    0.744000]", "systemd[1]: Listening on /dev/initctl Compatibility Named Pipe.", 7],
    ["[    0.758000]", "systemd[1]: Created slice System Slice.", 7],
    ["[    0.771000]", "systemd[1]: Starting Journal Service...", 8],
    ["[    0.784000]", "[  OK  ] Started Journal Service.", 9],
    ["[    0.796000]", "[  OK  ] Started Load Kernel Modules.", 8],
    ["[    0.809000]", "[  OK  ] Mounted Configuration File System.", 8],
    ["[    0.823000]", "[  OK  ] Started Apply Kernel Variables.", 8],
    ["[    0.841000]", "[  OK  ] Started Create list of required static device nodes for the current kernel.", 10],
    ["[    0.869000]", "systemd-udevd[142]: starting version 232", 11],
    ["[    0.884000]", "[  OK  ] Started udev Kernel Device Manager.", 9],
    ["[    0.901000]", "[  OK  ] Started udev Coldplug all Devices.", 12],
    ["[    0.948000]", "device-mapper: ioctl: 4.35.0-ioctl (2016-06-15) initialised", 15],
    ["[    0.962000]", "device-mapper: crypt: plain64 IV", 12],
    ["[    1.004000]", "alg: No test for gost28147-orb (gost28147-orb)", 420],
    ["[    1.118000]", "dm-crypt: key derivation complete", 26],
    ["[    1.204000]", "EXT4-fs (dm-0): mounted filesystem with ordered data mode. Opts: (null)", 34],
    ["[    1.238000]", "[  OK  ] Mounted /archive.", 11],
    ["[    1.254000]", "[  OK  ] Mounted /archive/personnel.", 11],
    ["[    1.271000]", "[  OK  ] Mounted /archive/operations.", 10],
    ["[    1.298000]", "systemd-networkd[318]: eth0: Link is Up - 100Mbps/Full - flow control rx/tx", 260],
    ["[    1.322000]", "systemd-networkd[318]: eth0: Gained IPv4 address", 14],
    ["[    1.341000]", "[  OK  ] Started Network Service.", 12],
    ["[    1.358000]", "[  OK  ] Reached target Network.", 11],
    ["[    1.376000]", "systemd-cryptsetup[402]: Set up successfully: /dev/mapper/archive-crypt", 18],
    ["[    1.394000]", "[  OK  ] Started Cryptography Setup.", 12],
    ["[    1.411000]", "[  OK  ] Reached target Local File Systems.", 11],
    ["[    1.448000]", "archive-term[511]: loading manifest", 24],
    ["[    1.472000]", "archive-term[511]: @@INDEX@@", 18],
    ["[    1.501000]", "archive-term[511]: channel: handshake HQ-7 ... accepted", 380],
    ["[    1.524000]", "archive-term[511]: cipher: GOST 28147-89 ... active", 16],
    ["[    1.541000]", "archive-term[511]: access check ... ok", 14],
    ["[    1.558000]", "archive-term[511]: group D.I.C.E.: @@PERSONNEL@@ records", 13],
    ["[    1.574000]", "archive-term[511]: last sync 16.10.2015", 12],
    ["[    1.592000]", "[  OK  ] Started ORB Archive Terminal.", 14],
    ["[    1.611000]", "[  OK  ] Reached target Multi-User System.", 12],
    ["[    1.634000]", "systemd[1]: Startup finished in 1.982s (kernel) + 1.204s (userspace) = 3.186s.", 16],
  ];
  const indexLine = state.entries.length
    ? `index: ${documents} documents, ${images} images`
    : 'index: unavailable';
  const personnel = state.entries.filter(entry => entry.type === 'dir' && parentOf(entry.path) === 'Личные дела').length;
  for (const [prefix, text, wait] of lines) {
    const row = document.createElement('div');
    row.className = 'boot-line';
    row.textContent = `${prefix} ${text.replace('@@INDEX@@', indexLine).replace('@@PERSONNEL@@', String(personnel))}`;
    log.append(row);
    // Follow the printing. Line height is uniform, so this moves the log up by
    // exactly one line per line and the newest line always sits at the bottom.
    log.scrollTop = log.scrollHeight;
    await sleep(wait + Math.random() * 8);
  }
  // A blank beat between the log and the archive. The text is dropped in one go,
  // which leaves the glass over an empty screen for a second, and only then is
  // the archive revealed underneath.
  log.replaceChildren();
  await sleep(1000);
  boot.classList.add('boot-done');
  await sleep(380);
  boot.remove();
}
// Keep the three panels user-resizable without any external dependency.
const workspace = document.querySelector('.workspace');
const panes = [document.querySelector('.folder-panel'), document.querySelector('.files-panel'), document.querySelector('.preview-panel')];
const dividers = [...document.querySelectorAll('.pane-resizer')];
const layoutStorageKey = 'archive.panel-ratios.v1';
const defaultRatios = {row: [0.27, 0.35], column: [0.27, 0.33]};
let savedRatios = {...defaultRatios};
try {
  const stored = JSON.parse(localStorage.getItem(layoutStorageKey) || '{}');
  for (const direction of ['row', 'column']) {
    if (Array.isArray(stored[direction]) && stored[direction].length === 2 &&
        stored[direction].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      savedRatios[direction] = stored[direction];
    }
  }
} catch { /* Storage can be disabled, for example in a private preview. */ }

const layoutDirection = () => window.matchMedia('(max-width: 920px)').matches ? 'column' : 'row';
const paneMinimums = direction => direction === 'row' ? [155, 180, 195] : [100, 120, 150];
const paneLength = (element, direction) => direction === 'row' ? element.getBoundingClientRect().width : element.getBoundingClientRect().height;
function availablePaneSpace(direction) {
  const whole = direction === 'row' ? workspace.clientWidth : workspace.clientHeight;
  return Math.max(1, whole - dividers.reduce((total, divider) => total + paneLength(divider, direction), 0));
}
function effectiveMinimums(direction, space) {
  const minimums = paneMinimums(direction);
  const factor = Math.min(1, space / minimums.reduce((a, b) => a + b, 0));
  return minimums.map(value => value * factor);
}
function clampSize(value, smallest, largest) {return Math.max(smallest, Math.min(value, largest));}
function applyPaneSizes(lengths) {
  panes[0].style.flex = `0 0 ${lengths[0]}px`;
  panes[1].style.flex = `0 0 ${lengths[1]}px`;
  panes[2].style.flex = '1 1 0';
  dividers.forEach((divider, index) => {
    const direction = layoutDirection();
    divider.setAttribute('aria-orientation', direction === 'row' ? 'vertical' : 'horizontal');
    divider.setAttribute('aria-valuenow', String(Math.round(100 * lengths[index] / availablePaneSpace(direction))));
  });
}
function applySavedLayout() {
  const direction = layoutDirection();
  const space = availablePaneSpace(direction);
  const min = effectiveMinimums(direction, space);
  const ratios = savedRatios[direction];
  const first = clampSize(space * ratios[0], min[0], space - min[1] - min[2]);
  const second = clampSize(space * ratios[1], min[1], space - first - min[2]);
  applyPaneSizes([first, second, space - first - second]);
}
function moveDivider(index, startSizes, displacement, direction) {
  const min = effectiveMinimums(direction, availablePaneSpace(direction));
  const sizes = [...startSizes];
  const total = sizes[index] + sizes[index + 1];
  sizes[index] = clampSize(startSizes[index] + displacement, min[index], total - min[index + 1]);
  sizes[index + 1] = total - sizes[index];
  applyPaneSizes(sizes);
}
function savePaneLayout(direction) {
  const space = availablePaneSpace(direction);
  savedRatios[direction] = [paneLength(panes[0], direction) / space, paneLength(panes[1], direction) / space];
  try { localStorage.setItem(layoutStorageKey, JSON.stringify(savedRatios)); } catch { /* Storage unavailable. */ }
}
function currentPaneLengths(direction) { return panes.map(pane => paneLength(pane, direction)); }
for (const divider of dividers) {
  const index = Number(divider.dataset.divider);
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const direction = layoutDirection();
    const start = direction === 'row' ? event.clientX : event.clientY;
    const original = currentPaneLengths(direction);
    divider.focus({preventScroll: true});
    divider.setPointerCapture(event.pointerId);
    divider.classList.add('dragging');
    document.body.classList.add('resizing');
    document.body.classList.toggle('stacked', direction === 'column');
    const onMove = move => {
      const position = direction === 'row' ? move.clientX : move.clientY;
      moveDivider(index, original, position - start, direction);
    };
    const onStop = finish => {
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onStop);
      divider.removeEventListener('pointercancel', onStop);
      divider.classList.remove('dragging');
      document.body.classList.remove('resizing', 'stacked');
      if (divider.hasPointerCapture(finish.pointerId)) divider.releasePointerCapture(finish.pointerId);
      if (finish.type === 'pointercancel') applyPaneSizes(original);
      else savePaneLayout(direction);
    };
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onStop);
    divider.addEventListener('pointercancel', onStop);
  });
  divider.addEventListener('keydown', event => {
    const direction = layoutDirection();
    const key = direction === 'row' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (!key.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    moveDivider(index, currentPaneLengths(direction), (event.key === key[0] ? -1 : 1) * (event.shiftKey ? 40 : 12), direction);
    savePaneLayout(direction);
  });
}
window.addEventListener('resize', applySavedLayout);
applySavedLayout();

// Parallax for the CRT glass. The pointer offset drives the perspective tilt of
// the scanline layer and the sheen on the shading layer, which sit at different
// amplitudes so they read as separate depths. One update per animation frame,
// and nothing at all when the user has asked for reduced motion.
if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  let parallaxQueued = false;
  let pointerX = 0.5;
  let pointerY = 0.5;
  window.addEventListener('pointermove', event => {
    pointerX = event.clientX / window.innerWidth;
    pointerY = event.clientY / window.innerHeight;
    if (parallaxQueued) return;
    parallaxQueued = true;
    requestAnimationFrame(() => {
      parallaxQueued = false;
      const root = document.documentElement.style;
      root.setProperty('--crt-x', (pointerX - 0.5).toFixed(3));
      root.setProperty('--crt-y', (pointerY - 0.5).toFixed(3));
    });
  }, {passive: true});
}

for(const button of document.querySelectorAll('[data-command]')) button.addEventListener('click',()=>{
  const command=button.dataset.command;
  if(command==='help')showHelp();else if(command==='up')navigateUp();else if(command==='refresh')loadIndex();else if(command==='search')showSearch();else if(command==='view')activateItem(listItems(state.directory)[state.selected]);
});
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
// A click on the preview pane also advances a running text output. The listener
// is captured so that the same click does not follow a link while finishing text.
$('document').addEventListener('click', event => { if (finishTyping()) event.preventDefault(); }, true);
$('search-input').addEventListener('input',renderSearch);
$('search-input').addEventListener('keydown',e=>{if(e.key==='Enter'){const first=$('search-results').querySelector('button');if(first)first.click();}});
document.addEventListener('keydown',e=>{
  const openDialog = document.querySelector('dialog[open]');
  if(openDialog){if(e.key==='Escape'){e.preventDefault();openDialog.close();}return;}
  // A key advances a running text output instead of reaching its own command.
  if(!['Shift','Control','Alt','Meta'].includes(e.key) && finishTyping()){e.preventDefault();return;}
  if(e.key==='F1'||e.key==='F10'){e.preventDefault();showHelp();}
  else if(e.key==='F7'){e.preventDefault();showSearch();}
  else if(e.key==='F5'){e.preventDefault();loadIndex();}
  else if(e.key==='F3'){e.preventDefault();activateItem(listItems(state.directory)[state.selected]);}
  else if(e.key==='/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();showSearch();}
  else if(e.key==='Backspace' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();navigateUp();}
  else if(e.key==='Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !document.activeElement.classList.contains('pane-resizer')){
    const panels = [$('tree'), $('files'), $('document')];
    const current = panels.findIndex(p => p === document.activeElement || p.contains(document.activeElement));
    e.preventDefault();panels[(current + (e.shiftKey ? 2 : 1) + 3) % 3].focus();
  }
  else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && document.activeElement.id === 'tree') {
    e.preventDefault();
    const buttons = Array.from($('tree').querySelectorAll('button'));
    const active = buttons.findIndex(b => b.dataset.path === state.directory);
    const next = buttons[Math.min(Math.max(active + (e.key === 'ArrowDown' ? 1 : -1),0), buttons.length-1)];
    if (next) next.click();
    $('tree').focus();
  }
  else if (e.key === 'Enter' && document.activeElement.id === 'tree') {
    e.preventDefault(); $('files').focus();
  }
  else if((e.key==='ArrowUp'||e.key==='ArrowDown') && (document.activeElement.id==='files' || document.activeElement.classList.contains('file-item') || document.activeElement.tagName==='BODY')){e.preventDefault();selectItem(state.selected+(e.key==='ArrowDown'?1:-1));$('files').focus();}
  else if(e.key==='Enter'&&document.activeElement.id==='files'){e.preventDefault();activateItem(listItems(state.directory)[state.selected]);}
});
setInterval(() => { $('clock').textContent=new Date().toLocaleTimeString('ru-RU',{hour12:false}); }, 1000);
$('clock').textContent=new Date().toLocaleTimeString('ru-RU',{hour12:false});
loadIndex().then(bootSequence);
