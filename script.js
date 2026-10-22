/* ITMC Asset Recording System - front-end
 * 1) Deploy Code.gs as a Web app (see setup notes) and paste its URL below.
 * 2) Host index.html, style.css and script.js together (or just open index.html).
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbzd7DHTKCcByWf2ta6Y-fmFD3i6EbtcRN3AUme_nTC6ZUTaMZmY5R8Xn4vDiUaok5_J/exec';

function accessCode() {
  let c = localStorage.getItem('itmc_code');
  if (!c) { c = (prompt('Enter the access code') || '').trim(); if (c) localStorage.setItem('itmc_code', c); }
  return c || '';
}

/* Talks to Apps Script. POST body is plain text so the browser sends no CORS preflight. */
const POSTS = ['submit', 'update', 'lap_submit', 'lap_update'];
async function api(action, arg) {
  if (API_URL.indexOf('PASTE_') === 0) throw new Error('Set API_URL in script.js first.');
  const code = accessCode();
  const res = POSTS.indexOf(action) > -1
    ? await fetch(API_URL, { method: 'POST', body: JSON.stringify({ code: code, action: action, record: arg }) })
    : await fetch(API_URL + '?action=' + action + '&code=' + encodeURIComponent(code) + (arg ? '&id=' + encodeURIComponent(arg) : ''));
  const j = await res.json();
  if (!j.ok) {
    if (j.error === 'Unauthorized') { localStorage.removeItem('itmc_code'); throw new Error('Wrong access code. Reload the page and try again.'); }
    throw new Error(j.error);
  }
  return j.data;
}

const $ = id => document.getElementById(id);
const DEFAULT_LISTS = {
  documents: ['Memo', 'Contract', 'Minutes', 'Letter', "Secretary's Certificate", 'Certification'],
  items: ['Laptop', 'Charger', 'Desktop'],
  actions: ['For your signature', 'For your review', 'For your information', 'For your comment', 'For your notarize', 'For your action', 'For your reply', 'Per your request'],
  companies: [
    'Arcovia City Estate Association, Inc.',
    'Boracay New Coast Estate Association',
    'Capital Town Association, Inc.',
    'Citylink Coach Services, Inc.',
    'Davao Park District Association, Inc.',
    'Global-Estate Resort, Inc.',
    'Iloilo Business Park Estate Association',
    'Integrated Town Management Corp.',
    'Lourdes T. Gutierrez-Alfonso',
    'Maple Grove Estate Association',
    'Mckinley Town Center Estate Association',
    'Mckinley West Estate Association',
    'Megawide Construction Corp.',
    'Megaworld Corporation',
    'Newport City Estate Association',
    'Northill Gateway Estate Association',
    'Southwoods City Estate Association',
    'The Mactan Newtown Estate Association',
    'The Upper East Estate Association',
    'Twin Lakes Estate Association',
    'Uptown Bonifacio Estate Association',
    'Westside City Estate Association'],
  encoders: ['Mc Genrev Egar', 'Jenelyn Relano'],
  assetTypes: ['Monitor', 'Keyboard', 'Mouse', 'Mousepad', 'CPU', 'Bag', 'Laptop', 'Charger', 'Printer', 'UPS', 'Phone']
};

  const DESKTOP_SET = ['Monitor', 'Keyboard', 'Mouse', 'Mousepad', 'CPU'];
  const LAPTOP_SET = ['Laptop', 'Charger', 'Mouse', 'Bag'];
  let LISTS = null, RECORDS = [], EDIT = null;   // EDIT = code of the record being edited

  /* ---------- setup ---------- */
  function today() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function toast(msg, bad) {
    const t = $('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 3500);
  }

  function addChip(id, txt, on) {
    const box = [...document.querySelectorAll('input[name=' + id + ']')].find(x => x.value.toLowerCase() === txt.toLowerCase());
    if (box) { if (on) box.checked = true; return box; }      // already there, just tick it
    const l = document.createElement('label'); l.className = 'chip';
    const i = document.createElement('input'); i.type = 'checkbox'; i.name = id; i.value = txt; i.checked = !!on;
    const s = document.createElement('span'); s.textContent = txt;
    i.addEventListener('change', updateSummary);
    l.append(i, s); $(id).appendChild(l);
    return i;
  }

  function chips(id, list) {
    $(id).innerHTML = '';
    list.forEach(txt => addChip(id, txt, false));
  }

  function fillSelect(id, arr) {
    const s = $(id), cur = s.value; s.innerHTML = '';
    [''].concat(arr).forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v || 'Select...'; s.appendChild(o); });
    if (arr.indexOf(cur) > -1) s.value = cur;
  }

  function applyLists(L) {
    L = Object.assign({}, DEFAULT_LISTS, L); LISTS = L;
    ['documents', 'items', 'actions'].forEach(k => chips(k, L[k]));
    fillSelect('from', L.companies); fillSelect('by', L.encoders); fillSelect('l-by', L.encoders);
    const old = $('typeList'); if (old) old.remove();
    const dl = document.createElement('datalist'); dl.id = 'typeList';
    L.assetTypes.forEach(t => { const o = document.createElement('option'); o.value = t; dl.appendChild(o); });
    document.body.appendChild(dl);
    $('by').value = localStorage.getItem('itmc_by') || $('by').value;
    $('l-by').value = localStorage.getItem('itmc_by') || $('l-by').value;
  }

  function init() {
    $('date').value = today();
    applyLists({});                                   // show everything right away
    api('lists').then(applyLists)                     // then refresh from the sheet backend
      .catch(e => toast('Using built-in options. ' + e.message, true));
    renderAssets();
  }

  /* ---------- assets ---------- */
  const FIELDS = [
    ['type', 'Type', 'f-type', 'text'], ['brand', 'Brand', 'f-brand', 'text'], ['model', 'Model', 'f-model', 'text'],
    ['serial', 'Serial no.', 'f-serial', 'text'], ['tag', 'Asset tag', 'f-tag', 'text'],
    ['qty', 'Qty', 'f-qty', 'number'], ['remarks', 'Remarks', 'f-remarks', 'text']
  ];

  /* Resize photo to max 1280px JPEG so uploads stay small and fast */
  function shrink(file, max = 1280, q = 0.7) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
      };
      im.onerror = rej; im.src = url;
    });
  }

  function photoBlock(card) {
    const wrap = document.createElement('div'); wrap.className = 'photo';
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    file.setAttribute('capture', 'environment');           // opens the rear camera on phones/tablets
    const take = document.createElement('button'); take.type = 'button'; take.className = 'btn ghost small';
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'btn ghost small'; clear.textContent = 'Remove photo';
    const img = document.createElement('img'); img.className = 'shot'; img.alt = 'Photo of asset';
    const view = document.createElement('a'); view.className = 'savedlink'; view.textContent = 'View saved photo'; view.target = '_blank'; view.rel = 'noopener'; view.href = card._link || '#';
    const refresh = () => {
      const has = !!(card._photo || card._link);
      img.hidden = !card._photo; view.hidden = !(card._link && !card._photo); clear.hidden = !has;
      take.textContent = has ? 'Retake photo' : 'Take photo';
      updateSummary();
    };
    take.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try { card._photo = await shrink(f); img.src = card._photo; }
      catch (e) { toast('Could not read that photo. Try again.', true); }
      file.value = ''; refresh();
    });
    clear.addEventListener('click', () => { card._photo = ''; card._link = ''; img.removeAttribute('src'); refresh(); });
    wrap.append(take, clear, img, view, file); refresh(); return wrap;
  }

  function addAsset(type, data) {
    data = (data && typeof data === 'object') ? data : {};
    const card = document.createElement('div'); card.className = 'asset';
    card._link = data.photoLink || '';
    FIELDS.forEach(([key, label, cls, kind]) => {
      const f = document.createElement('div'); f.className = 'field ' + cls;
      const l = document.createElement('label'); l.textContent = label;
      const i = document.createElement('input'); i.type = kind; i.dataset.k = key; i.autocomplete = 'off';
      if (key === 'type') { i.setAttribute('list', 'typeList'); i.value = (typeof type === 'string' ? type : '') || data.type || ''; }
      else if (key === 'qty') { i.value = data.qty || 1; i.min = 1; }
      else i.value = (data[key] == null || data[key] === '-') ? '' : data[key];
      i.addEventListener('input', updateSummary);
      f.append(l, i); card.appendChild(f);
    });
    card.appendChild(photoBlock(card));
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = 'Remove';
    del.addEventListener('click', () => { card.remove(); renderAssets(); });
    card.appendChild(del);
    $('assets').appendChild(card);
    renderAssets();
    if (!type && !data.type) card.querySelector('input').focus();
  }

  function renderAssets() {
    $('assetsEmpty').hidden = $('assets').children.length > 0;
    updateSummary();
  }

  function readAssets() {
    return [...$('assets').children].map(c => {
      const o = {}; c.querySelectorAll('input[data-k]').forEach(i => o[i.dataset.k] = i.value.trim());
      o.photo = c._photo || ''; o.photoLink = c._link || ''; return o;
    }).filter(a => a.type || a.brand || a.model || a.serial || a.tag || a.photo || a.photoLink);
  }

  function checked(name) { return [...document.querySelectorAll('input[name=' + name + ']:checked')].map(e => e.value); }

  function updateSummary() {
    const list = readAssets(), n = list.length, p = list.filter(a => a.photo || a.photoLink).length;
    $('summary').textContent = n + (n === 1 ? ' item' : ' items') + ' to record' + (p ? ', ' + p + (p === 1 ? ' photo' : ' photos') : '');
  }

  /* ---------- submit ---------- */
  function validate() {
    let ok = true;
    [['to', 'Enter the assigned owner.'], ['from', 'Select who it is from.'], ['by', 'Select who is encoding.']].forEach(([id, msg]) => {
      const bad = !$(id).value.trim();
      $(id).classList.toggle('invalid', bad); $('e-' + id).textContent = bad ? msg : '';
      if (bad && ok) { $(id).focus(); ok = false; } else if (bad) ok = false;
    });
    if (ok && !readAssets().length) { toast('Add at least one asset.', true); ok = false; }
    return ok;
  }

  function submit() {
    if (!validate()) return;
    const d = {
      to: $('to').value.trim(), from: $('from').value.trim(), date: $('date').value || today(), project: $('project').value.trim(),
      documents: checked('documents'), items: checked('items'), actions: checked('actions'),
      assets: readAssets(), remarks: $('remarks').value.trim(), encodedBy: $('by').value.trim()
    };
    const btn = $('submitBtn'); btn.disabled = true; btn.textContent = d.assets.some(a => a.photo) ? 'Uploading photos and creating PDF...' : 'Creating PDF...';
    localStorage.setItem('itmc_by', d.encodedBy);
    if (EDIT) d.code = EDIT;
    const wasEdit = !!EDIT;
    api(wasEdit ? 'update' : 'submit', d).then(r => {
        btn.disabled = false; btn.textContent = btnLabel();
        $('d-title').textContent = wasEdit ? 'Record updated' : 'Record saved';
        $('d-folder').textContent = r.folder; $('d-name').textContent = r.name; $('d-open').href = r.url; $('d-folder-open').href = r.folderUrl || '#';
        $('d-photos').textContent = r.photos ? r.photos + (r.photos === 1 ? ' photo' : ' photos') + ' saved in the Photos folder and linked in the Assets sheet.' : '';
        $('done').showModal();
        if (r.pages > 1) toast('Warning: too many items to fit on one page. Please check the PDF.', true);
      }).catch(e => {
        btn.disabled = false; btn.textContent = btnLabel();
        toast('Not saved: ' + e.message, true);
      });
  }

  function resetForm() {
    ['to', 'from', 'project', 'remarks'].forEach(id => { $(id).value = ''; $(id).classList.remove('invalid'); });
    $('e-to').textContent = $('e-from').textContent = '';
    $('date').value = today();
    document.querySelectorAll('.chip input').forEach(i => i.checked = false);
    $('customItem').value = '';
    $('assets').innerHTML = ''; renderAssets();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- records tab ---------- */
  function renderRecords() {
    const q = $('search').value.trim().toLowerCase(), body = $('recBody'); body.innerHTML = '';
    const rows = RECORDS.filter(r => (r.code + ' ' + r.owner + ' ' + r.project).toLowerCase().includes(q));
    $('recEmpty').hidden = rows.length > 0;
    rows.forEach(r => {
      const tr = document.createElement('tr');
      [r.code, r.date, r.owner, r.project].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      const td = document.createElement('td'), a = document.createElement('a');
      a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open PDF';
      const e = document.createElement('button'); e.type = 'button'; e.className = 'btn ghost small'; e.textContent = 'Edit';
      e.addEventListener('click', () => startEdit(r.code));
      td.append(a, document.createTextNode('  '), e); tr.appendChild(td); body.appendChild(tr);
    });
  }
  function loadRecords() {
    $('recEmpty').hidden = false; $('recEmpty').textContent = 'Loading records...';
    api('records')
      .then(r => { RECORDS = r; $('recEmpty').textContent = 'No records found.'; renderRecords(); })
      .catch(e => { $('recEmpty').textContent = 'No records found.'; toast('Could not load records: ' + e.message, true); });
  }

  /* ---------- edit mode ---------- */
  function btnLabel() { return EDIT ? 'Save changes and update PDF' : 'Save and create PDF'; }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    $('view-new').hidden = name !== 'new'; $('view-records').hidden = name !== 'records'; $('view-laptop').hidden = name !== 'laptop';
    $('actionBar').hidden = name !== 'new';
    if (name === 'records') loadRecords();
    if (name === 'laptop') { loadLaptops(); drawLabel(); }
  }

  function setSelect(id, val) {
    const s = $(id);
    if (val && ![...s.options].some(o => o.value === val)) { const o = document.createElement('option'); o.value = o.textContent = val; s.appendChild(o); }
    s.value = val || '';
  }
  function setChecks(name, arr) {
    arr = arr || [];
    arr.forEach(v => addChip(name, v, false));                // recreate custom entries saved earlier
    document.querySelectorAll('input[name=' + name + ']').forEach(i => i.checked = arr.indexOf(i.value) > -1);
  }

  function startEdit(code) {
    toast('Loading ' + code + '...');
    api('record', code).then(r => {
      resetForm();
      EDIT = code;
      $('to').value = r.to; $('date').value = r.date; $('project').value = r.project; $('remarks').value = r.remarks;
      setSelect('from', r.from);
      setChecks('documents', r.documents); setChecks('items', r.items); setChecks('actions', r.actions);
      r.assets.forEach(a => addAsset(a.type, a));
      $('editText').textContent = 'Editing ' + code + '. Saving will regenerate the PDF and replace the old one.';
      $('editBar').hidden = false;
      document.querySelector('label[for=by]').textContent = 'Edited by';
      $('submitBtn').textContent = btnLabel();
      showTab('new'); updateSummary();
      window.scrollTo({ top: 0 });
    }).catch(e => toast('Could not open record: ' + e.message, true));
  }

  function exitEdit() {
    EDIT = null; $('editBar').hidden = true;
    document.querySelector('label[for=by]').textContent = 'Encoded by';
    $('submitBtn').textContent = btnLabel();
  }

  /* ---------- events ---------- */
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    if (t.dataset.tab === 'new' && EDIT) { exitEdit(); resetForm(); }   // "New record" always starts blank
    showTab(t.dataset.tab);
  }));
  $('editCancel').addEventListener('click', () => { exitEdit(); resetForm(); showTab('records'); });
  $('d-back').addEventListener('click', () => { $('done').close(); exitEdit(); resetForm(); showTab('records'); });
  $('addRow').addEventListener('click', () => addAsset());
  $('preset').addEventListener('click', () => { DESKTOP_SET.forEach(addAsset); toast('Desktop set added. Fill in brand and serial numbers.'); });
  $('preset-laptop').addEventListener('click', () => { LAPTOP_SET.forEach(addAsset); toast('Laptop set added. Fill in brand and serial numbers.'); });
  function addCustomItem() {
    const v = $('customItem').value.trim(); if (!v) return;
    addChip('items', v, true); $('customItem').value = ''; updateSummary();
  }
  $('addCustomItem').addEventListener('click', addCustomItem);
  $('customItem').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustomItem(); } });
  $('submitBtn').addEventListener('click', submit);
  $('d-new').addEventListener('click', () => { $('done').close(); exitEdit(); resetForm(); });
  $('search').addEventListener('input', renderRecords);
  ['to', 'from', 'by'].forEach(id => $(id).addEventListener('input', () => { $(id).classList.remove('invalid'); $('e-' + id).textContent = ''; }));

  /* ---------- laptop endorsement ---------- */
  const TAGS = {
    'For Turn Over': { cls: 't-turn', badge: 'FOR TURN OVER', pill: '' },
    'For Safe Keep': { cls: 't-safe', badge: 'FOR SAFE KEEP', pill: 'safe' },
    'Defective': { cls: 't-def', badge: 'DEFECTIVE', pill: 'def' }
  };
  const LAPSVG = '<svg viewBox="0 0 64 44"><path d="M10 2h44a3 3 0 013 3v28H7V5a3 3 0 013-3zm3 5v22h38V7z" fill-rule="evenodd"/><path d="M2 36h60v2a4 4 0 01-4 4H6a4 4 0 01-4-4z"/></svg>';
  let LTAG = 'For Turn Over', LEDIT = null, LPHOTO = '', LLINK = '';
  const lv = k => $('l-' + k).value.trim();
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function niceDate(v) { return v ? new Date(v + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }

  function labelHTML() {
    const t = TAGS[LTAG], row = (l, v) => '<div class="lrow"><b>' + l + '</b><span>' + esc(v) + '</span></div>';
    return '<div class="label ' + t.cls + '"><div class="lhead"><div class="lbrand"><span class="lmark"></span><span class="lname">MEGAWORLD</span></div>' +
      '<div class="ltown">INTEGRATED TOWN<br>MANAGEMENT CORPORATION</div><div class="llap">' + LAPSVG + '<span>LAPTOP<br>MANAGEMENT</span></div></div>' +
      '<div class="lbody">' + row('Serial Number:', lv('serial')) + row('Brand &amp; Model:', lv('brand')) + row('Accounted to:', lv('to')) + row('Returned by:', lv('ret')) +
      (LTAG === 'For Turn Over' ? row('For turn over to:', lv('turn')) : '') +
      '<div class="ldet"><div class="ldh"><b>DETAILS:</b><em>' + t.badge + '</em></div><div class="ldc">' +
      '<div><small>Date:</small><span>' + esc(niceDate($('l-date').value)) + '</span></div>' +
      '<div><small>Action:</small><span>' + esc(lv('action')) + '</span></div>' +
      '<div><small>Received by:</small><span>' + esc(lv('recv')) + '</span></div></div></div></div></div>';
  }
  function drawLabel() { $('labelPreview').innerHTML = labelHTML(); }

  function setTag(tag) {
    LTAG = tag;
    document.querySelectorAll('.tagbtn').forEach(b => b.classList.toggle('active', b.dataset.tag === tag));
    $('l-turn-wrap').hidden = tag !== 'For Turn Over';
    drawLabel();
  }

  function lapPhotoUI() {
    const has = !!(LPHOTO || LLINK);
    $('l-img').hidden = !LPHOTO; $('l-view').hidden = !(LLINK && !LPHOTO); $('l-view').href = LLINK || '#';
    $('l-clear').hidden = !has; $('l-take').textContent = has ? 'Retake photo' : 'Take photo';
  }

  function lapReset() {
    ['serial', 'brand', 'to', 'ret', 'turn', 'action', 'recv', 'remarks'].forEach(k => { $('l-' + k).value = ''; $('l-' + k).classList.remove('invalid'); });
    ['serial', 'to', 'turn', 'by'].forEach(k => $('e-l-' + k).textContent = '');
    $('l-date').value = today(); LPHOTO = ''; LLINK = ''; LEDIT = null; $('lapEditBar').hidden = true;
    $('l-img').removeAttribute('src'); lapPhotoUI(); setTag('For Turn Over');
  }

  function lapValidate() {
    let ok = true;
    const need = [['serial', 'Enter the serial number.'], ['to', 'Enter who the laptop is accounted to.'], ['by', 'Select who is encoding.']];
    if (LTAG === 'For Turn Over') need.push(['turn', 'Enter who it will be turned over to.']);
    need.forEach(([k, msg]) => {
      const bad = !lv(k); $('l-' + k).classList.toggle('invalid', bad); $('e-l-' + k).textContent = bad ? msg : '';
      if (bad && ok) $('l-' + k).focus(); if (bad) ok = false;
    });
    return ok;
  }

  function lapSave() {
    if (!lapValidate()) return;
    const d = { tag: LTAG, serial: lv('serial'), model: lv('brand'), to: lv('to'), returnedBy: lv('ret'), turnTo: LTAG === 'For Turn Over' ? lv('turn') : '',
      date: $('l-date').value || today(), action: lv('action'), receivedBy: lv('recv'), remarks: lv('remarks'), encodedBy: lv('by'),
      photo: LPHOTO, photoLink: LLINK };
    if (LEDIT) d.code = LEDIT;
    const btn = $('l-save'), was = !!LEDIT; btn.disabled = true; btn.textContent = 'Saving...';
    localStorage.setItem('itmc_by', d.encodedBy);
    api(was ? 'lap_update' : 'lap_submit', d).then(r => {
      btn.disabled = false; btn.textContent = 'Save to sheet';
      LEDIT = r.code; LLINK = r.photoLink || ''; LPHOTO = ''; lapPhotoUI();
      $('lapEditText').textContent = (was ? 'Updated ' : 'Saved as ') + r.code + '. Saving again will update this entry.'; $('lapEditBar').hidden = false;
      toast(was ? 'Record updated.' : 'Saved to the Laptops sheet.'); loadLaptops();
    }).catch(e => { btn.disabled = false; btn.textContent = 'Save to sheet'; toast('Not saved: ' + e.message, true); });
  }

  function renderLaptops(rows) {
    const body = $('lapBody'); body.innerHTML = ''; $('lapEmpty').hidden = rows.length > 0;
    rows.forEach(r => {
      const tr = document.createElement('tr');
      [r.code, r.date].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      const tg = document.createElement('td'), pill = document.createElement('span');
      pill.className = 'tag-pill ' + ((TAGS[r.tag] || {}).pill || ''); pill.textContent = r.tag; tg.appendChild(pill); tr.appendChild(tg);
      [r.serial, r.owner].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      const td = document.createElement('td');
      if (r.photo) { const a = document.createElement('a'); a.href = r.photo; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Photo'; td.append(a, document.createTextNode('  ')); }
      const e = document.createElement('button'); e.type = 'button'; e.className = 'btn ghost small'; e.textContent = 'Edit';
      e.addEventListener('click', () => lapEdit(r.code)); td.appendChild(e); tr.appendChild(td); body.appendChild(tr);
    });
  }
  function loadLaptops() { api('lap_list').then(renderLaptops).catch(e => toast('Could not load laptop records: ' + e.message, true)); }

  function lapEdit(code) {
    toast('Loading ' + code + '...');
    api('lap_get', code).then(r => {
      lapReset(); LEDIT = code; setSelect('l-by', r.encodedBy);
      $('l-serial').value = r.serial; $('l-brand').value = r.model; $('l-to').value = r.to; $('l-ret').value = r.returnedBy; $('l-turn').value = r.turnTo;
      $('l-date').value = r.date; $('l-action').value = r.action; $('l-recv').value = r.receivedBy; $('l-remarks').value = r.remarks;
      LLINK = r.photoLink || ''; lapPhotoUI(); setTag(r.tag);
      $('lapEditText').textContent = 'Editing ' + code + '. Saving will update the same row in the sheet.'; $('lapEditBar').hidden = false;
      window.scrollTo({ top: 0 });
    }).catch(e => toast('Could not open record: ' + e.message, true));
  }

  document.querySelectorAll('.tagbtn').forEach(b => b.addEventListener('click', () => setTag(b.dataset.tag)));
  ['serial', 'brand', 'to', 'ret', 'turn', 'date', 'action', 'recv'].forEach(k => $('l-' + k).addEventListener('input', () => { $('l-' + k).classList.remove('invalid'); if ($('e-l-' + k)) $('e-l-' + k).textContent = ''; drawLabel(); }));
  $('l-take').addEventListener('click', () => $('l-file').click());
  $('l-file').addEventListener('change', async () => {
    const f = $('l-file').files[0]; if (!f) return;
    try { LPHOTO = await shrink(f); $('l-img').src = LPHOTO; } catch (e) { toast('Could not read that photo. Try again.', true); }
    $('l-file').value = ''; lapPhotoUI();
  });
  $('l-clear').addEventListener('click', () => { LPHOTO = ''; LLINK = ''; $('l-img').removeAttribute('src'); lapPhotoUI(); });
  $('l-save').addEventListener('click', lapSave);
  $('l-print').addEventListener('click', () => { $('printArea').innerHTML = labelHTML(); window.print(); });
  $('lapNew').addEventListener('click', lapReset);
  $('l-date').value = today(); setTag('For Turn Over');

  init();
