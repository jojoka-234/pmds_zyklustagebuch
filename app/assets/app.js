'use strict';

const SYMPTOMS = [
  { name: 'Stimmungsschwankungen', short: 'Stimmungsschw.' },
  { name: 'Reizbarkeit, Wut', short: 'Reizbarkeit' },
  { name: 'Depressive Verstimmung', short: 'Depressiv' },
  { name: 'Angst, Anspannung', short: 'Angst' },
  { name: 'Konzentrationsschwierigkeiten, Vergesslichkeit', short: 'Konzentration' },
  { name: 'Lethargie, Ermüdbarkeit, Energieverlust', short: 'Lethargie' },
  { name: 'Appetitveränderungen, Heißhunger', short: 'Appetit' },
  { name: 'Schlafstörungen', short: 'Schlaf' },
  { name: 'Körperliche Symptome', short: 'Körperlich',
    hint: 'z. B. Brustspannen, Blähungen, Kopf-, Gelenk- oder Muskelschmerzen, Wassereinlagerungen' },
  { name: 'Andere Symptome', short: 'Andere' },
];
const N = SYMPTOMS.length;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// ---------- Native bridge (falls back to localStorage in a normal browser) ----------
const Native = window.Android || {
  load: () => localStorage.getItem('data') || '',
  save: (s) => { localStorage.setItem('data', s); return true; },
  getReminder: () => localStorage.getItem('reminder') ||
    JSON.stringify({ enabled: false, hour: 20, minute: 0, exact: true, notifAllowed: true }),
  setReminder: (enabled, hour, minute) => localStorage.setItem('reminder',
    JSON.stringify({ enabled, hour, minute, exact: true, notifAllowed: true })),
  testNotification: () => toast('(Browser) Test-Benachrichtigung'),
  openNotificationSettings: () => {},
  saveFile: (b64, name, mime) => {
    const a = document.createElement('a');
    a.href = 'data:' + mime + ';base64,' + b64;
    a.download = name;
    a.click();
  },
  shareFile: (b64, name, mime) => Native.saveFile(b64, name, mime),
  openBackup: () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = () => inp.files[0].text().then(t => app.onBackupImported(t));
    inp.click();
  },
  toast: (m) => toast(m),
};

// ---------- Dates (all as 'YYYY-MM-DD' strings in local time) ----------
const pad = (n) => String(n).padStart(2, '0');
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function toUTC(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function fromUTC(t) { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function addDays(s, n) { return fromUTC(toUTC(s) + n * 86400000); }
function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
function weekday(s) { return new Date(toUTC(s)).getUTCDay(); }
function fmtDate(s) { const [y, m, d] = s.split('-'); return d + '.' + m + '.' + y; }
function fmtShort(s) { const [, m, d] = s.split('-'); return d + '.' + m + '.'; }

// ---------- Data ----------
let data = { version: 1, cycles: [], entries: {} };

function loadData() {
  try {
    const raw = Native.load();
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.cycles) && d.entries) data = d;
    }
  } catch (e) { /* start fresh */ }
  sortCycles();
}
function persist() {
  const ok = Native.save(JSON.stringify(data));
  if (ok === false) toast('Speichern fehlgeschlagen!');
}
function sortCycles() { data.cycles.sort((a, b) => a.start.localeCompare(b.start)); }

/** Returns {start, end|null, index} of the cycle containing date, or null. */
function cycleFor(date) {
  let idx = -1;
  data.cycles.forEach((c, i) => { if (c.start <= date) idx = i; });
  if (idx < 0) return null;
  return cycleAt(idx);
}
function cycleAt(i) {
  const c = data.cycles[i];
  const next = data.cycles[i + 1];
  return { start: c.start, end: next ? addDays(next.start, -1) : null, index: i };
}
/** Days shown for a cycle: start .. end (closed) or start .. today (ongoing). */
function cycleDays(cyc) {
  const last = cyc.end || (todayStr() >= cyc.start ? todayStr() : cyc.start);
  const out = [];
  for (let d = cyc.start; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}
function getEntry(date) { return data.entries[date] || null; }
function ensureEntry(date) {
  if (!data.entries[date]) data.entries[date] = { r: new Array(N).fill(null), work: '', events: '' };
  return data.entries[date];
}
function cleanupEntry(date) {
  const e = data.entries[date];
  if (e && e.r.every(v => v === null) && !e.work && !e.events) delete data.entries[date];
}
function ratedCount(e) { return e ? e.r.filter(v => v !== null).length : 0; }

// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}
let dialogResolve = null;
function dialog(text, { date = null, okText = 'OK', cancel = true } = {}) {
  $('dialogText').textContent = text;
  $('dialogDate').classList.toggle('hidden', date === null);
  if (date !== null) { $('dialogDate').value = date; $('dialogDate').max = todayStr(); }
  $('dialogOk').textContent = okText;
  $('dialogCancel').classList.toggle('hidden', !cancel);
  $('dialog').classList.remove('hidden');
  return new Promise((res) => { dialogResolve = res; });
}
function closeDialog(ok) {
  $('dialog').classList.add('hidden');
  const r = dialogResolve;
  dialogResolve = null;
  if (r) r(ok ? (($('dialogDate').classList.contains('hidden')) ? true : $('dialogDate').value) : false);
}

// ---------- Entry view ----------
let current = todayStr();
let followToday = true;

function buildSymptomCards() {
  const wrap = $('symptoms');
  wrap.innerHTML = '';
  SYMPTOMS.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'sym';
    card.innerHTML = '<div class="name">' + (i + 1) + '. ' + s.name + '</div>' +
      (s.hint ? '<div class="hint">' + s.hint + '</div>' : '') +
      '<div class="scale">' + [0, 1, 2, 3, 4].map(v =>
        '<button data-s="' + i + '" data-v="' + v + '" class="v' + v + '">' + v + '</button>').join('') + '</div>' +
      (i === 0 ? '<div class="scalelegend"><span>gar nicht</span><span>extrem</span></div>' : '');
    wrap.appendChild(card);
  });
  wrap.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-s]');
    if (!b) return;
    const s = +b.dataset.s, v = +b.dataset.v;
    const e = ensureEntry(current);
    e.r[s] = e.r[s] === v ? null : v;
    cleanupEntry(current);
    persist();
    renderEntry();
  });
}

function renderEntry() {
  const today = todayStr();
  const wd = WEEKDAYS_LONG[weekday(current)];
  $('dateLabel').textContent = wd + ', ' + fmtDate(current);
  $('dateInput').value = current;
  $('dateInput').max = today;
  $('nextDay').disabled = current >= today;
  $('todayBtn').classList.toggle('hidden', current === today);

  const cyc = cycleFor(current);
  const future = current > today;
  $('futureNote').classList.toggle('hidden', !future);
  $('noCycle').classList.toggle('hidden', !!cyc || future);
  $('entryForm').classList.toggle('hidden', !cyc || future);
  $('cycleDayChip').textContent = cyc ? 'Zyklustag ' + (diffDays(cyc.start, current) + 1) : '';

  const e = getEntry(current);
  $('progress').textContent = cyc ? ratedCount(e) + ' / ' + N + ' bewertet' : '';
  document.querySelectorAll('#symptoms button[data-s]').forEach(b => {
    const val = e ? e.r[+b.dataset.s] : null;
    b.classList.toggle('sel', val === +b.dataset.v);
  });
  if (document.activeElement !== $('workText')) $('workText').value = e ? e.work : '';
  if (document.activeElement !== $('eventsText')) $('eventsText').value = e ? e.events : '';

  const isStart = cyc && cyc.start === current;
  $('newCycleBtn').classList.toggle('hidden', !!isStart);
  $('cycleStartNote').classList.toggle('hidden', !isStart);
}

function setCurrent(d) {
  current = d;
  followToday = d === todayStr();
  renderEntry();
}

function onText(field, el) {
  const e = ensureEntry(current);
  e[field] = el.value;
  cleanupEntry(current);
  persist();
}

async function startCycleOn(date, ask) {
  if (data.cycles.some(c => c.start === date)) return;
  if (ask && !(await dialog('Neuen Zyklus am ' + fmtDate(date) + ' beginnen? Dieser Tag wird zum 1. Zyklustag, ' +
      'der vorherige Zyklus endet am Vortag.', { okText: 'Neuer Zyklus' }))) return;
  data.cycles.push({ start: date });
  sortCycles();
  persist();
  renderAll();
  toast('Zyklus ab ' + fmtDate(date) + ' angelegt');
}

async function removeCycle(start) {
  const i = data.cycles.findIndex(c => c.start === start);
  if (i < 0) return;
  const msg = i === 0 && data.cycles.length === 1
    ? 'Zyklusbeginn ' + fmtDate(start) + ' entfernen? Die Einträge bleiben gespeichert, sind aber keinem Zyklus mehr zugeordnet.'
    : 'Zyklusbeginn ' + fmtDate(start) + ' entfernen? Die Tage werden dem vorherigen Zyklus zugeordnet. Einträge bleiben erhalten.';
  if (!(await dialog(msg, { okText: 'Entfernen' }))) return;
  data.cycles.splice(i, 1);
  persist();
  renderAll();
}

async function moveCycle(start) {
  const d = await dialog('Neues Datum für den 1. Zyklustag:', { date: start, okText: 'Ändern' });
  if (!d || d === start) return;
  if (data.cycles.some(c => c.start === d)) { toast('An diesem Tag beginnt bereits ein Zyklus'); return; }
  data.cycles.find(c => c.start === start).start = d;
  sortCycles();
  persist();
  renderAll();
}

// ---------- Overview ----------
let overviewIndex = null;

function renderOverview() {
  const sel = $('cycleSelect');
  const has = data.cycles.length > 0;
  $('overviewEmpty').classList.toggle('hidden', has);
  $('tableWrap').classList.toggle('hidden', !has);
  $('sharePdfBtn').disabled = $('savePdfBtn').disabled = !has;
  sel.innerHTML = '';
  if (!has) return;
  if (overviewIndex === null || overviewIndex >= data.cycles.length) {
    const c = cycleFor(todayStr());
    overviewIndex = c ? c.index : data.cycles.length - 1;
  }
  for (let i = data.cycles.length - 1; i >= 0; i--) {
    const c = cycleAt(i);
    const o = document.createElement('option');
    o.value = i;
    o.textContent = fmtDate(c.start) + ' – ' + (c.end ? fmtDate(c.end) + ' (' + (diffDays(c.start, c.end) + 1) + ' Tage)' : 'laufend');
    sel.appendChild(o);
  }
  sel.value = overviewIndex;

  const cyc = cycleAt(overviewIndex);
  const today = todayStr();
  let html = '<thead><tr><th class="sticky">Tag / Datum</th>' +
    SYMPTOMS.map(s => '<th><span class="rot">' + s.short + '</span></th>').join('') +
    '<th><span class="rot">Notiz</span></th></tr></thead><tbody>';
  cycleDays(cyc).forEach((d, i) => {
    const e = getEntry(d);
    const cls = [d === today ? 'today' : '', d > today ? 'future' : '', i > 0 && i % 5 === 0 ? 'sep5' : ''].join(' ');
    html += '<tr data-d="' + d + '" class="' + cls + '"><td class="sticky"><span class="dnum">' + (i + 1) + '</span>' +
      WEEKDAYS[weekday(d)] + ' ' + fmtShort(d) + '</td>';
    for (let s = 0; s < N; s++) {
      const v = e ? e.r[s] : null;
      html += v === null ? '<td class="v"></td>' : '<td class="v v' + v + '">' + v + '</td>';
    }
    html += '<td class="note">' + (e && (e.work || e.events) ? '✎' : '') + '</td></tr>';
  });
  $('grid').innerHTML = html + '</tbody>';
}

// ---------- Settings ----------
function renderSettings() {
  refreshReminderStatus();
  const list = $('cycleList');
  if (!data.cycles.length) {
    list.innerHTML = '<p class="muted small">Noch keine Zyklen.</p>';
    return;
  }
  list.innerHTML = '';
  for (let i = data.cycles.length - 1; i >= 0; i--) {
    const c = cycleAt(i);
    const row = document.createElement('div');
    row.className = 'cyc';
    row.innerHTML = '<div class="info"><b>' + fmtDate(c.start) + '</b><br><span class="muted small">' +
      (c.end ? 'bis ' + fmtDate(c.end) + ' · ' + (diffDays(c.start, c.end) + 1) + ' Tage' : 'laufend') + '</span></div>';
    const mv = document.createElement('button');
    mv.className = 'btn'; mv.textContent = 'Datum ändern';
    mv.onclick = () => moveCycle(c.start);
    const rm = document.createElement('button');
    rm.className = 'btn danger'; rm.textContent = 'Entfernen';
    rm.onclick = () => removeCycle(c.start);
    row.append(mv, rm);
    list.appendChild(row);
  }
}

function refreshReminderStatus() {
  let r;
  try { r = JSON.parse(Native.getReminder()); } catch (e) { r = { enabled: false, hour: 20, minute: 0 }; }
  $('remEnabled').checked = !!r.enabled;
  $('remTime').value = pad(r.hour) + ':' + pad(r.minute);
  let status = r.enabled ? 'Du wirst täglich um ' + pad(r.hour) + ':' + pad(r.minute) + ' Uhr erinnert.' : 'Erinnerung ist aus.';
  const blocked = r.enabled && r.notifAllowed === false;
  if (blocked) status += ' ⚠ Benachrichtigungen sind für die App blockiert.';
  if (r.enabled && r.exact === false) status += ' (Genaue Wecker nicht erlaubt – die Erinnerung kann sich etwas verspäten.)';
  $('remStatus').textContent = status;
  $('notifSettingsBtn').classList.toggle('hidden', !blocked);
}

function saveReminder() {
  const [h, m] = ($('remTime').value || '20:00').split(':').map(Number);
  Native.setReminder($('remEnabled').checked, h, m);
  setTimeout(refreshReminderStatus, 300);
}

// ---------- PDF & backup ----------
function pdfFor(index) {
  const cyc = cycleAt(index);
  const doc = buildDiaryPdf(cyc, cycleDays(cyc), data.entries, SYMPTOMS);
  return { b64: doc.output('datauristring').split(',')[1], name: 'PMDS-Zyklustagebuch_' + cyc.start + '.pdf' };
}
function exportPdf(share) {
  if (!data.cycles.length) return;
  try {
    const p = pdfFor(overviewIndex);
    (share ? Native.shareFile : Native.saveFile).call(Native, p.b64, p.name, 'application/pdf');
  } catch (e) {
    toast('PDF-Fehler: ' + e.message);
  }
}
function exportBackup() {
  const json = JSON.stringify(data, null, 1);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  Native.saveFile(b64, 'zyklustagebuch-sicherung-' + todayStr() + '.json', 'application/json');
}

// ---------- Navigation ----------
let view = 'entry';
function show(v) {
  view = v;
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + v));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'overview') renderOverview();
  if (v === 'settings') renderSettings();
  if (v === 'entry') renderEntry();
  window.scrollTo(0, 0);
}
function renderAll() {
  renderEntry();
  if (view === 'overview') renderOverview();
  if (view === 'settings') renderSettings();
}

const app = {
  goToday() { setCurrent(todayStr()); show('entry'); },
  onResume() {
    if (followToday && current !== todayStr()) setCurrent(todayStr());
    if (view === 'settings') refreshReminderStatus();
    if (view === 'overview') renderOverview();
  },
  handleBack() {
    if (!$('dialog').classList.contains('hidden')) { closeDialog(false); return true; }
    if (view !== 'entry') { show('entry'); return true; }
    return false;
  },
  refreshReminderStatus,
  async onBackupImported(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { toast('Keine gültige Sicherungsdatei'); return; }
    if (!d || !Array.isArray(d.cycles) || typeof d.entries !== 'object') { toast('Keine gültige Sicherungsdatei'); return; }
    const ok = await dialog('Sicherung mit ' + d.cycles.length + ' Zyklen und ' + Object.keys(d.entries).length +
      ' Einträgen importieren? Die aktuellen Daten werden ersetzt.', { okText: 'Importieren' });
    if (!ok) return;
    data = d;
    sortCycles();
    persist();
    overviewIndex = null;
    renderAll();
    toast('Sicherung importiert');
  },
};
window.app = app;

// ---------- Wire up ----------
function init() {
  loadData();
  buildSymptomCards();

  $('prevDay').onclick = () => setCurrent(addDays(current, -1));
  $('nextDay').onclick = () => { if (current < todayStr()) setCurrent(addDays(current, 1)); };
  $('todayBtn').onclick = () => setCurrent(todayStr());
  $('dateInput').onchange = (e) => { if (e.target.value) setCurrent(e.target.value); };
  $('startHereBtn').onclick = () => startCycleOn(current, false);
  $('newCycleBtn').onclick = () => startCycleOn(current, true);
  $('removeStartBtn').onclick = () => removeCycle(current);
  $('workText').oninput = (e) => onText('work', e.target);
  $('eventsText').oninput = (e) => onText('events', e.target);
  $('workText').onblur = $('eventsText').onblur = () => renderEntry();

  $('cycleSelect').onchange = (e) => { overviewIndex = +e.target.value; renderOverview(); };
  $('grid').onclick = (e) => {
    const tr = e.target.closest('tr[data-d]');
    if (tr && tr.dataset.d <= todayStr()) { setCurrent(tr.dataset.d); show('entry'); }
  };
  $('sharePdfBtn').onclick = () => exportPdf(true);
  $('savePdfBtn').onclick = () => exportPdf(false);

  $('remEnabled').onchange = saveReminder;
  $('remTime').onchange = saveReminder;
  $('testNotifBtn').onclick = () => Native.testNotification();
  $('notifSettingsBtn').onclick = () => Native.openNotificationSettings();
  $('exportBackupBtn').onclick = exportBackup;
  $('importBackupBtn').onclick = () => Native.openBackup();

  $('dialogOk').onclick = () => closeDialog(true);
  $('dialogCancel').onclick = () => closeDialog(false);
  document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => show(b.dataset.view); });

  setCurrent(todayStr());
}
init();
