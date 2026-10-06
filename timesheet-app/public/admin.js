'use strict';

const $ = (id) => document.getElementById(id);
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
let password = sessionStorage.getItem('ts.admin') || '';
let week = null;
let filter = 'all';

async function api(path, opts = {}) {
  const res = await fetch(`api/admin/${path}`, {
    ...opts,
    headers: { 'x-admin-password': encodeURIComponent(password), ...(opts.body && !opts.raw ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
    body: opts.raw || (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401) {
    signOut();
    throw new Error('Wrong password.');
  }
  if (opts.blob && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function flash(text, kind = 'ok') {
  const el = $('flash');
  el.textContent = text;
  el.className = `msg ${kind}`;
  el.hidden = false;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => (el.hidden = true), 6000);
}

function signOut() {
  password = '';
  sessionStorage.removeItem('ts.admin');
  $('app').hidden = true;
  $('login').hidden = false;
}

function niceDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function pillClass(status) {
  return status === 'Entered' ? 'entered' : status === 'Not Sent' ? 'not-sent' : 'received';
}

function render() {
  $('setup').hidden = !!week;
  $('overview').hidden = !week;
  $('weekCard').hidden = !week;
  if (!week) {
    $('weekLabel').textContent = 'No spreadsheet uploaded yet';
    return;
  }
  $('weekLabel').textContent = week.weekEnd ? `Week ending ${niceDate(week.weekEnd)}` : week.title;

  const count = (s) => week.rows.filter((r) => r.status === s).length;
  $('nNotSent').textContent = count('Not Sent');
  $('nReceived').textContent = count('Received - Not Entered');
  $('nEntered').textContent = count('Entered');

  const byDay = new Map();
  for (const r of week.rows) {
    if (filter !== 'all' && r.status !== filter) continue;
    const key = r.day || 'Other';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }
  const days = [...byDay.keys()].sort((a, b) => DAY_ORDER.indexOf(a.toLowerCase()) - DAY_ORDER.indexOf(b.toLowerCase()));

  const box = $('days');
  box.textContent = '';
  if (!days.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Nothing to show.';
    box.append(p);
  }
  for (const day of days) {
    const sec = document.createElement('div');
    sec.className = 'day';
    const h = document.createElement('h3');
    h.textContent = day;
    sec.append(h);
    for (const r of byDay.get(day)) sec.append(person(r));
    box.append(sec);
  }
}

function person(r) {
  const el = document.createElement('div');
  el.className = 'person';

  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = r.name;
  const pill = document.createElement('span');
  pill.className = `pill ${pillClass(r.status)}`;
  pill.textContent = r.status === 'Received - Not Entered' ? 'To enter' : r.status;
  who.append(pill);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const bits = [];
  if (r.hours != null) bits.push(`${r.hours} hrs`);
  if (r.jobs) bits.push(r.jobs);
  if (r.notes) bits.push(`“${r.notes}”`);
  meta.textContent = bits.join(' · ');
  meta.hidden = !bits.length;

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (r.sent) {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = `toggle${r.entered ? ' on' : ''}`;
    t.textContent = r.entered ? '✓ Entered' : 'Mark entered';
    t.setAttribute('aria-pressed', String(r.entered));
    t.addEventListener('click', async () => {
      t.disabled = true;
      try {
        await api('entered', { method: 'POST', body: { row: r.row, entered: !r.entered } });
        await refresh();
      } catch (err) {
        flash(err.message, 'bad');
        t.disabled = false;
      }
    });
    actions.append(t);
  }
  el.append(who, actions, meta);
  return el;
}

async function refresh() {
  try {
    week = await api('week');
  } catch (err) {
    if (err.status !== 503) throw err;
    week = null;
  }
  render();
  const files = await api('archives');
  $('archiveCard').hidden = !files.length;
  const ul = $('archives');
  ul.textContent = '';
  for (const f of files) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = f.replace('Timesheets_WE_', 'Week ending ').replace('.xlsx', '');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      download(`archives/${encodeURIComponent(f)}`, f);
    });
    li.append(a);
    ul.append(li);
  }
}

async function download(path, name) {
  try {
    const res = await api(path, { blob: true });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (err) {
    flash(err.message, 'bad');
  }
}

async function start() {
  $('login').hidden = true;
  $('app').hidden = false;
  $('crewLink').href = new URL('./', location.href).href;
  $('crewLink').textContent = new URL('./', location.href).href;
  await refresh();
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  password = $('password').value.trim();
  try {
    await api('login', { method: 'POST' });
    sessionStorage.setItem('ts.admin', password);
    $('loginError').hidden = true;
    await start();
  } catch (err) {
    $('loginError').textContent = err.message;
    $('loginError').hidden = false;
  }
});

$('filters').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  filter = c.dataset.f;
  for (const x of $('filters').children) x.setAttribute('aria-pressed', String(x === c));
  render();
});

$('download').addEventListener('click', () => download('download', 'Employee_Timesheet_Tracker.xlsx'));

$('upload').addEventListener('change', async () => {
  const file = $('upload').files[0];
  if (!file) return;
  if (week && !confirm('Replace the live spreadsheet with this file? A backup of the current one is kept.')) {
    $('upload').value = '';
    return;
  }
  try {
    const out = await api('workbook', { method: 'PUT', raw: file, headers: { 'Content-Type': 'application/octet-stream' } });
    flash(`Uploaded. ${out.employees} crew members found.`);
    await refresh();
  } catch (err) {
    flash(err.message, 'bad');
  } finally {
    $('upload').value = '';
  }
});

$('newWeek').addEventListener('click', async () => {
  const weekEnd = $('weekEnd').value;
  if (!weekEnd) return flash('Pick the week-ending date first.', 'bad');
  if (!confirm(`Archive the current week and start the week ending ${niceDate(weekEnd)}?`)) return;
  try {
    const out = await api('new-week', { method: 'POST', body: { weekEnd } });
    flash(`New week started. Previous week saved as ${out.archived}.${out.filled ? ` ${out.filled} timesheets already in for this week were filled in.` : ''}`);
    await refresh();
  } catch (err) {
    flash(err.message, 'bad');
  }
});

setInterval(() => {
  if (password && !document.hidden) refresh().catch(() => {});
}, 30_000);

if (password) start().catch(() => signOut());
