'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { buildTracker } = require('./fixture');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'timesheets-'));
process.env.DATA_DIR = DATA_DIR;
// Quotes and spaces as they'd arrive if pasted from the README into a dashboard.
process.env.ADMIN_PASSWORD = " 'office-secret' ";
process.env.CREW_PIN = '"4321" ';
const app = require('../server');

let base;
let server;
const today = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

const admin = (p, opts = {}) =>
  fetch(`${base}/api/admin/${p}`, { ...opts, headers: { 'x-admin-password': 'office-secret', ...opts.headers } });
const submit = (body) =>
  fetch(`${base}/api/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function entry(over = {}) {
  return {
    id: `e-${Math.random().toString(36).slice(2, 12)}`,
    pin: '4321',
    employee: 'Alex Byrne',
    date: iso(today),
    start: '08:00',
    finish: '16:30',
    breakMins: 30,
    jobs: [{ job: 'J777', hours: 8 }],
    ...over,
  };
}

test('before upload the crew page reports not ready', async () => {
  const cfg = await (await fetch(`${base}/api/config`)).json();
  assert.equal(cfg.ready, false);
});

test('admin endpoints need the password', async () => {
  const res = await fetch(`${base}/api/admin/week`, { headers: { 'x-admin-password': 'nope' } });
  assert.equal(res.status, 401);
});

test('admin password ignores pasted quotes and accepts the URI-encoded header', async () => {
  const login = (pw) => fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'x-admin-password': pw } });
  assert.equal((await login('office-secret')).status, 200);
  assert.equal((await login(encodeURIComponent(' office-secret '))).status, 200);
  assert.equal((await login('%6Fffice-secret')).status, 200); // %6F = "o"
  assert.equal((await login("'office-secret'")).status, 401);
  assert.equal((await login('%E0%A4%A')).status, 401); // malformed encoding
});

test('upload, submit, auto new week, mark entered, download', async () => {
  const buf = await buildTracker().xlsx.writeBuffer();
  const up = await admin('workbook', { method: 'PUT', body: buf, headers: { 'Content-Type': 'application/octet-stream' } });
  assert.equal(up.status, 200, await up.clone().text());

  const cfg = await (await fetch(`${base}/api/config`)).json();
  assert.equal(cfg.ready, true);
  assert.equal(cfg.pinRequired, true);
  assert.deepEqual(cfg.employees, ['Alex Byrne', 'Sam Kelly', 'Chris Nolan']);

  assert.equal((await submit(entry({ pin: '0000' }))).status, 401);

  // The fixture's week (Sept 2026) is in the past, so today's entry starts a new week.
  const e = entry();
  const res = await submit(e);
  const out = await res.json();
  assert.equal(res.status, 200, JSON.stringify(out));
  assert.ok(out.rolled, 'new week started automatically');
  assert.match(out.rolled.archived, /^Timesheets_WE_2026-09-16/);
  const weekday = today.getDay();
  assert.equal(out.where, weekday >= 1 && weekday <= 5 ? 'tracker' : 'log-only');

  // An offline retry of the same entry is not saved twice.
  const again = await (await submit(e)).json();
  assert.equal(again.duplicate, true);

  const archives = await (await admin('archives')).json();
  assert.equal(archives.length, 1);

  const week = await (await admin('week')).json();
  const row = week.rows.find((r) => r.name === 'Alex Byrne' && r.sent);
  if (out.where === 'tracker') {
    assert.equal(row.hours, 8);
    assert.equal(row.jobs, 'J777 (8)');
    const mark = await admin('entered', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row: row.row, entered: true }) });
    assert.equal(mark.status, 200);
    const locked = await submit(entry());
    assert.equal(locked.status, 409);
  }

  const dl = await admin('download');
  assert.equal(dl.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await dl.arrayBuffer()));
  assert.equal(wb.getWorksheet('Job Log').getCell('F2').value, 'J777');
  assert.equal(wb.getWorksheet('Job Log').rowCount, 2);
  assert.ok(fs.readdirSync(path.join(DATA_DIR, 'backups')).length >= 1);
});

test('parallel submissions are all saved', async () => {
  const names = ['Alex Byrne', 'Sam Kelly', 'Chris Nolan'];
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const results = await Promise.all(names.map((employee) => submit(entry({ employee, date: iso(yesterday), pin: '4321' }))));
  for (const r of results) assert.equal(r.status, 200);
  const dl = await admin('download');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await dl.arrayBuffer()));
  const logged = [];
  wb.getWorksheet('Job Log').eachRow((row, i) => i > 1 && logged.push(row.getCell(5).value));
  for (const n of names) assert.ok(logged.includes(n), n);
});
