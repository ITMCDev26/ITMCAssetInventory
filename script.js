/* ITMC Asset Recording System - front-end
 * 1) Deploy Code.gs as a Web app (see setup notes) and paste its URL below.
 * 2) Host index.html, style.css and script.js together (or just open index.html).
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbxK0Kvyu2UyMjzsuuOajYq8HxJOVMjAGyW8DoRnWvpBCPv8QVpDnPpq0eyB5GD1mgw/exec';

function accessCode() {
  let c = localStorage.getItem('itmc_code');
  if (!c) { c = (prompt('Enter the access code') || '').trim(); if (c) localStorage.setItem('itmc_code', c); }
  return c || '';
}

/* Talks to Apps Script. POST body is plain text so the browser sends no CORS preflight. */
async function api(action, record) {
  if (API_URL.indexOf('PASTE_') === 0) throw new Error('Set API_URL in script.js first.');
  const code = accessCode();
  const res = record
    ? await fetch(API_URL, { method: 'POST', body: JSON.stringify({ code: code, record: record }) })
    : await fetch(API_URL + '?action=' + action + '&code=' + encodeURIComponent(code));
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
  assetTypes: ['Monitor', 'Keyboard', 'Mouse', 'Mousepad', 'CPU', 'Laptop', 'Charger', 'Printer', 'UPS', 'Phone']
};

  const DESKTOP_SET = ['Monitor', 'Keyboard', 'Mouse', 'Mousepad', 'CPU'];
  let LISTS = null, RECORDS = [];

  /* ---------- setup ---------- */
  function today() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function toast(msg, bad) {
    const t = $('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 3500);
  }

  function chips(id, list) {
    $(id).innerHTML = '';
    list.forEach(txt => {
      const l = document.createElement('label'); l.className = 'chip';
      const i = document.createElement('input'); i.type = 'checkbox'; i.name = id; i.value = txt;
      const s = document.createElement('span'); s.textContent = txt;
      i.addEventListener('change', updateSummary);
      l.append(i, s); $(id).appendChild(l);
    });
  }

  function fillSelect(id, arr) {
    const s = $(id), cur = s.value; s.innerHTML = '';
    [''].concat(arr).forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v || 'Select...'; s.appendChild(o); });
    if (arr.indexOf(cur) > -1) s.value = cur;
  }

  function applyLists(L) {
    L = Object.assign({}, DEFAULT_LISTS, L); LISTS = L;
    ['documents', 'items', 'actions'].forEach(k => chips(k, L[k]));
    fillSelect('from', L.companies); fillSelect('by', L.encoders);
    const old = $('typeList'); if (old) old.remove();
    const dl = document.createElement('datalist'); dl.id = 'typeList';
    L.assetTypes.forEach(t => { const o = document.createElement('option'); o.value = t; dl.appendChild(o); });
    document.body.appendChild(dl);
    $('by').value = localStorage.getItem('itmc_by') || $('by').value;
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
    const take = document.createElement('button'); take.type = 'button'; take.className = 'btn ghost small'; take.textContent = 'Take photo';
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'btn ghost small'; clear.textContent = 'Remove photo'; clear.hidden = true;
    const img = document.createElement('img'); img.className = 'shot'; img.alt = 'Photo of asset'; img.hidden = true;
    take.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try {
        card._photo = await shrink(f); img.src = card._photo;
        img.hidden = clear.hidden = false; take.textContent = 'Retake photo';
      } catch (e) { toast('Could not read that photo. Try again.', true); }
      file.value = ''; updateSummary();
    });
    clear.addEventListener('click', () => {
      card._photo = ''; img.hidden = clear.hidden = true; img.removeAttribute('src'); take.textContent = 'Take photo'; updateSummary();
    });
    wrap.append(take, clear, img, file); return wrap;
  }

  function addAsset(type) {
    const card = document.createElement('div'); card.className = 'asset';
    FIELDS.forEach(([key, label, cls, kind]) => {
      const f = document.createElement('div'); f.className = 'field ' + cls;
      const l = document.createElement('label'); l.textContent = label;
      const i = document.createElement('input'); i.type = kind; i.dataset.k = key; i.autocomplete = 'off';
      if (key === 'type') { i.setAttribute('list', 'typeList'); i.value = type || ''; }
      if (key === 'qty') { i.value = 1; i.min = 1; }
      i.addEventListener('input', updateSummary);
      f.append(l, i); card.appendChild(f);
    });
    card.appendChild(photoBlock(card));
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = 'Remove';
    del.addEventListener('click', () => { card.remove(); renderAssets(); });
    card.appendChild(del);
    $('assets').appendChild(card);
    renderAssets();
    if (!type) card.querySelector('input').focus();
  }

  function renderAssets() {
    $('assetsEmpty').hidden = $('assets').children.length > 0;
    updateSummary();
  }

  function readAssets() {
    return [...$('assets').children].map(c => {
      const o = {}; c.querySelectorAll('input[data-k]').forEach(i => o[i.dataset.k] = i.value.trim());
      o.photo = c._photo || ''; return o;
    }).filter(a => a.type || a.brand || a.model || a.serial || a.tag || a.photo);
  }

  function checked(name) { return [...document.querySelectorAll('input[name=' + name + ']:checked')].map(e => e.value); }

  function updateSummary() {
    const list = readAssets(), n = list.length, p = list.filter(a => a.photo).length;
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
    api('submit', d).then(r => {
        btn.disabled = false; btn.textContent = 'Save and create PDF';
        $('d-folder').textContent = r.folder; $('d-name').textContent = r.name; $('d-open').href = r.url;
        $('d-photos').textContent = r.photos ? r.photos + (r.photos === 1 ? ' photo' : ' photos') + ' saved in the Photos folder and linked in the Assets sheet.' : '';
        $('done').showModal();
      }).catch(e => {
        btn.disabled = false; btn.textContent = 'Save and create PDF';
        toast('Not saved: ' + e.message, true);
      });
  }

  function resetForm() {
    ['to', 'from', 'project', 'remarks'].forEach(id => { $(id).value = ''; $(id).classList.remove('invalid'); });
    $('e-to').textContent = $('e-from').textContent = '';
    $('date').value = today();
    document.querySelectorAll('.chip input').forEach(i => i.checked = false);
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
      td.appendChild(a); tr.appendChild(td); body.appendChild(tr);
    });
  }
  function loadRecords() {
    $('recEmpty').hidden = false; $('recEmpty').textContent = 'Loading records...';
    api('records')
      .then(r => { RECORDS = r; $('recEmpty').textContent = 'No records found.'; renderRecords(); })
      .catch(e => { $('recEmpty').textContent = 'No records found.'; toast('Could not load records: ' + e.message, true); });
  }

  /* ---------- events ---------- */
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    const rec = t.dataset.tab === 'records';
    $('view-new').hidden = rec; $('view-records').hidden = !rec; $('actionBar').hidden = rec;
    if (rec) loadRecords();
  }));
  $('addRow').addEventListener('click', () => addAsset());
  $('preset').addEventListener('click', () => { DESKTOP_SET.forEach(addAsset); toast('Desktop set added. Fill in brand and serial numbers.'); });
  $('submitBtn').addEventListener('click', submit);
  $('d-new').addEventListener('click', () => { $('done').close(); resetForm(); });
  $('search').addEventListener('input', renderRecords);
  ['to', 'from', 'by'].forEach(id => $(id).addEventListener('input', () => { $(id).classList.remove('invalid'); $('e-' + id).textContent = ''; }));

  init();
