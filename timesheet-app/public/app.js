'use strict';

// Crew timesheet form. Plain JS so it loads fast on a weak site signal.
// If there's no signal when they press Send, the entry is kept on the phone
// and sent automatically later.

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`ts.${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`ts.${key}`, JSON.stringify(value));
    } catch {
      /* private mode - carry on without remembering */
    }
  },
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let config = store.get('config', null);
let prefs = store.get('prefs', { breakMins: 30, start: '08:00', finish: '16:30' });
let jobs = [];
let breakMins = prefs.breakMins ?? 30;

// ---------------------------------------------------------------- dates

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function niceDate(iso) {
  const d = fromIso(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function offsetIso(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

// ---------------------------------------------------------------- hours

function minutes(t) {
  const m = /^(\d{2}):(\d{2})/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function dayTotal() {
  const s = minutes($('start').value);
  const f = minutes($('finish').value);
  if (s == null || f == null) return null;
  const span = (f - s + 1440) % 1440;
  const h = round2((span - breakMins) / 60);
  return h > 0 ? h : null;
}
function fmtHours(h) {
  return `${round2(h)} hr${h === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------- jobs ui

// The first job line is "auto": it soaks up whatever hours the other lines
// don't use, so a one-job day only needs the job number and adding a second
// job takes its hours off the first.
function addJob(job = '') {
  jobs.push({ job, hours: '', auto: !jobs.some((j) => j.auto) });
  renderJobs();
  recalc();
  const inputs = $('jobs').querySelectorAll('input[type="text"]');
  if (!job) inputs[inputs.length - 1]?.focus();
}

function renderJobs() {
  const wrap = $('jobs');
  wrap.textContent = '';
  jobs.forEach((j, i) => {
    const row = document.createElement('div');
    row.className = 'job';

    const num = document.createElement('input');
    num.type = 'text';
    num.value = j.job;
    num.placeholder = 'e.g. J1234';
    num.setAttribute('list', 'jobList');
    num.setAttribute('aria-label', `Job number ${i + 1}`);
    num.autocapitalize = 'characters';
    num.autocomplete = 'off';
    num.addEventListener('input', () => {
      // "J1234 – Smith St" picked from the suggestions -> keep just the number
      const picked = (config?.jobs || []).find((x) => num.value === `${x.number} – ${x.name}`);
      if (picked) num.value = picked.number;
      j.job = num.value.trim();
    });

    const hrs = document.createElement('input');
    hrs.type = 'number';
    hrs.inputMode = 'decimal';
    hrs.step = '0.25';
    hrs.min = '0';
    hrs.value = j.hours;
    hrs.setAttribute('aria-label', `Hours on job ${i + 1}`);
    hrs.addEventListener('input', () => {
      j.hours = hrs.value;
      j.auto = false;
      recalc();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn';
    del.textContent = '×';
    del.setAttribute('aria-label', `Remove job ${i + 1}`);
    del.disabled = jobs.length === 1;
    del.addEventListener('click', () => {
      jobs.splice(i, 1);
      if (jobs.length && !jobs.some((x) => x.auto)) jobs[0].auto = true;
      renderJobs();
      recalc();
    });

    row.append(num, hrs, del);
    wrap.append(row);
  });
}

function recalc() {
  const total = dayTotal();
  $('dayTotal').textContent = total ? fmtHours(total) : '–';

  const auto = jobs.find((j) => j.auto);
  if (auto && total) {
    const others = jobs.filter((j) => j !== auto).reduce((a, j) => a + (Number(j.hours) || 0), 0);
    const left = round2(total - others);
    auto.hours = left > 0 ? String(left) : '';
    const input = $('jobs').querySelectorAll('input[type="number"]')[jobs.indexOf(auto)];
    if (input) input.value = auto.hours;
  }

  const allocated = round2(jobs.reduce((a, j) => a + (Number(j.hours) || 0), 0));
  const el = $('allocated');
  if (!total) {
    el.textContent = '';
  } else if (Math.abs(allocated - total) < 0.01) {
    el.textContent = `✓ All ${fmtHours(total)} allocated`;
    el.className = 'allocated ok';
  } else {
    const diff = round2(total - allocated);
    el.textContent = diff > 0 ? `${fmtHours(diff)} still to allocate` : `${fmtHours(-diff)} too many – check job hours`;
    el.className = 'allocated off';
  }
}

function renderRecent() {
  const recent = store.get('recent', []);
  const box = $('recent');
  box.textContent = '';
  $('recentWrap').hidden = !recent.length;
  for (const job of recent) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip small';
    b.textContent = job;
    b.addEventListener('click', () => {
      const empty = jobs.find((j) => !j.job);
      if (empty) {
        empty.job = job;
        renderJobs();
        recalc();
      } else {
        addJob(job);
      }
    });
    box.append(b);
  }
}

function rememberJobs(list) {
  const recent = store.get('recent', []);
  const next = [...new Set([...list, ...recent])].slice(0, 6);
  store.set('recent', next);
}

// ---------------------------------------------------------------- date & break

function setDate(iso, which) {
  $('date').value = iso;
  $('dateLabel').textContent = iso ? niceDate(iso) : '';
  for (const c of $('dateChips').children) c.setAttribute('aria-pressed', String(c.dataset.offset === which));
  $('date').hidden = which !== 'pick';
}

function setBreak(m) {
  breakMins = m;
  for (const c of $('breakChips').children) c.setAttribute('aria-pressed', String(Number(c.dataset.mins) === m));
  recalc();
}

// ---------------------------------------------------------------- config

function applyConfig() {
  if (!config) return;
  $('notReady').hidden = !!config.ready;
  $('form').hidden = !config.ready || !$('done').hidden;
  if (!config.ready) {
    $('weekLabel').textContent = 'Not set up yet';
    return;
  }
  $('weekLabel').textContent = config.week?.weekEnd ? `Week ending ${niceDate(config.week.weekEnd)}` : config.week?.title || '';

  const sel = $('employee');
  const current = sel.value || prefs.employee || '';
  sel.length = 1;
  for (const name of config.employees) sel.add(new Option(name, name));
  if (config.employees.includes(current)) sel.value = current;

  $('pinWrap').hidden = !config.pinRequired;
  if (prefs.pin) $('pin').value = prefs.pin;

  const dl = $('jobList');
  dl.textContent = '';
  for (const j of config.jobs || []) {
    const o = document.createElement('option');
    o.value = j.name ? `${j.number} – ${j.name}` : j.number;
    dl.append(o);
  }
}

async function loadConfig() {
  try {
    const res = await fetch('api/config', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    config = await res.json();
    store.set('config', config);
  } catch {
    /* offline - use the copy from last time */
  }
  applyConfig();
  if (!config) $('weekLabel').textContent = 'No signal – connect once to load the crew list';
}

// ---------------------------------------------------------------- sending

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

class Offline extends Error {}

async function post(payload) {
  let res;
  try {
    res = await fetch('api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Offline();
  }
  const data = await res.json().catch(() => ({}));
  if (res.status >= 500 && res.status !== 503) throw new Offline();
  if (!res.ok) {
    const err = new Error(data.error || 'Could not send. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function pending() {
  return store.get('pending', []);
}

function renderPending(failed = []) {
  const list = pending();
  const box = $('pending');
  box.textContent = '';
  if (!list.length && !failed.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (list.length) {
    box.className = 'msg warn';
    box.append(`${list.length} timesheet${list.length > 1 ? 's' : ''} waiting for signal – will send automatically.`);
  }
  for (const f of failed) {
    box.className = 'msg bad';
    const p = document.createElement('p');
    p.textContent = `Couldn't send ${niceDate(f.date)}: ${f.error}`;
    box.append(p);
  }
}

let flushing = false;
async function flush() {
  if (flushing || !pending().length) return renderPending();
  flushing = true;
  const failed = [];
  try {
    for (const item of pending()) {
      try {
        await post(item);
      } catch (err) {
        if (err instanceof Offline) break;
        failed.push({ date: item.date, error: err.message });
      }
      store.set('pending', pending().filter((p) => p.id !== item.id));
    }
  } finally {
    flushing = false;
    renderPending(failed);
  }
}

function showError(msg) {
  const el = $('error');
  el.textContent = msg;
  el.hidden = !msg;
  if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function collect() {
  const employee = $('employee').value;
  if (!employee) throw new Error('Choose your name.');
  if (config.pinRequired && !$('pin').value.trim()) throw new Error('Enter the crew PIN.');
  const date = $('date').value;
  if (!date) throw new Error('Pick the date you worked.');
  if (date > offsetIso(0)) throw new Error("You can't enter times for a future date.");
  const total = dayTotal();
  if (!total) throw new Error('Enter your start and finish times.');
  const lines = jobs.filter((j) => j.job || Number(j.hours));
  if (!lines.length) throw new Error('Add at least one job number.');
  for (const j of lines) {
    if (!j.job) throw new Error('Every line needs a job number.');
    if (!(Number(j.hours) > 0)) throw new Error(`Enter the hours for job ${j.job}.`);
  }
  const allocated = round2(lines.reduce((a, j) => a + Number(j.hours), 0));
  if (Math.abs(allocated - total) > 0.01) {
    throw new Error(`Job hours add up to ${allocated}, but your start/finish times give ${total}. Make them match.`);
  }
  return {
    id: newId(),
    employee,
    pin: $('pin').value.trim(),
    date,
    start: $('start').value.slice(0, 5),
    finish: $('finish').value.slice(0, 5),
    breakMins,
    jobs: lines.map((j) => ({ job: j.job, hours: Number(j.hours) })),
    notes: $('notes').value.trim(),
  };
}

function showDone(payload, result) {
  const total = round2(payload.jobs.reduce((a, j) => a + j.hours, 0));
  const queued = !result;
  $('done').classList.toggle('queued', queued);
  $('doneTick').textContent = queued ? '⏳' : '✓';
  $('doneTitle').textContent = queued ? 'Saved on your phone' : 'Timesheet sent';

  let text;
  if (queued) text = "No signal right now. It'll send automatically when you're back online – keep this page open or reopen it later.";
  else if (result.duplicate) text = 'The office already has this one.';
  else if (result.where === 'tracker') text = `Added to the office timesheet for ${result.day}.`;
  else if (result.where === 'other-week') text = "Saved to the job log. It's for an earlier week, so it won't change this week's sheet.";
  else text = `Saved to the job log (${result.day} isn't on the weekly sheet).`;
  if (result?.replaced) text += ' This replaces what you sent before for that day.';
  $('doneText').textContent = text;

  const dl = $('doneSummary');
  dl.textContent = '';
  const add = (k, v) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  };
  add('Name', payload.employee);
  add('Date', niceDate(payload.date));
  add('Hours', `${payload.start}–${payload.finish}, ${payload.breakMins}m break = ${fmtHours(total)}`);
  add('Jobs', payload.jobs.map((j) => `${j.job} (${j.hours})`).join(', '));
  if (payload.notes) add('Notes', payload.notes);

  $('form').hidden = true;
  $('done').hidden = false;
  window.scrollTo({ top: 0 });
}

async function submit(e) {
  e.preventDefault();
  showError('');
  let payload;
  try {
    payload = collect();
  } catch (err) {
    return showError(err.message);
  }

  prefs = { employee: payload.employee, pin: payload.pin, start: payload.start, finish: payload.finish, breakMins };
  store.set('prefs', prefs);
  rememberJobs(payload.jobs.map((j) => j.job));

  const btn = $('submit');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const result = await post(payload);
    showDone(payload, result);
    if (result.rolled) loadConfig();
    flush();
  } catch (err) {
    if (err instanceof Offline) {
      store.set('pending', [...pending(), payload]);
      renderPending();
      showDone(payload, null);
    } else {
      if (err.status === 401) {
        prefs.pin = '';
        store.set('prefs', prefs);
      }
      showError(err.message);
      if (err.status === 503 || err.status === 400) loadConfig();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send timesheet';
  }
}

function resetForm() {
  setDate(offsetIso(0), '0');
  $('start').value = prefs.start || '08:00';
  $('finish').value = prefs.finish || '16:30';
  $('notes').value = '';
  jobs = [];
  addJob();
  setBreak(prefs.breakMins ?? 30);
  renderRecent();
  $('done').hidden = true;
  $('form').hidden = !config?.ready;
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- start

$('dateChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  if (c.dataset.offset === 'pick') {
    setDate($('date').value || offsetIso(-2), 'pick');
    $('date').focus();
    $('date').showPicker?.();
  } else {
    setDate(offsetIso(Number(c.dataset.offset)), c.dataset.offset);
  }
});
$('date').max = offsetIso(0);
$('date').addEventListener('change', () => setDate($('date').value, 'pick'));
$('breakChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (c) setBreak(Number(c.dataset.mins));
});
$('start').addEventListener('input', () => recalc());
$('finish').addEventListener('input', () => recalc());
$('addJob').addEventListener('click', () => addJob());
$('form').addEventListener('submit', submit);
$('another').addEventListener('click', resetForm);
window.addEventListener('online', flush);
setInterval(flush, 60_000);

applyConfig();
resetForm();
loadConfig().then(flush);
renderPending();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
