'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const ExcelJS = require('exceljs');
const W = require('./lib/workbook');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const WORKBOOK = path.join(DATA_DIR, 'Employee_Timesheet_Tracker.xlsx');
const BACKUPS = path.join(DATA_DIR, 'backups');
const ARCHIVE = path.join(DATA_DIR, 'archive');
const KEEP_BACKUPS = Number(process.env.KEEP_BACKUPS) || 50;
// Forgive the usual slips when pasting a setting into a host's dashboard:
// surrounding spaces, or quotes copied from an example like ADMIN_PASSWORD='x'.
function cleanSecret(v) {
  const s = String(v || '').trim();
  const m = /^(['"])(.*)\1$/.exec(s);
  return (m ? m[2] : s).trim();
}
const CREW_PIN = cleanSecret(process.env.CREW_PIN);
// 1 = Monday ... 7 = Sunday. Used when a new week starts automatically.
const WEEK_END_DAY = Number(process.env.WEEK_END_DAY) || 5;
const AUTO_NEW_WEEK = process.env.AUTO_NEW_WEEK !== 'false';
let ADMIN_PASSWORD = cleanSecret(process.env.ADMIN_PASSWORD);

if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = crypto.randomBytes(6).toString('hex');
  console.warn(`ADMIN_PASSWORD is not set. Using a temporary one for this run: ${ADMIN_PASSWORD}`);
} else {
  console.log(`Office password set from ADMIN_PASSWORD (${[...ADMIN_PASSWORD].length} characters).`);
}
for (const d of [DATA_DIR, BACKUPS, ARCHIVE]) fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------- workbook io

// Every read-modify-write goes through this queue so two crew members
// submitting at the same moment can't overwrite each other.
let queue = Promise.resolve();
function locked(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

async function load() {
  if (!fs.existsSync(WORKBOOK)) throw new W.UserError('The office has not uploaded the timesheet spreadsheet yet.', 503);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(WORKBOOK);
  return wb;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function backup() {
  if (!fs.existsSync(WORKBOOK)) return;
  fs.copyFileSync(WORKBOOK, path.join(BACKUPS, `${stamp()}.xlsx`));
  const old = fs.readdirSync(BACKUPS).filter((f) => f.endsWith('.xlsx')).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) fs.unlinkSync(path.join(BACKUPS, f));
}

// Write to a temp file and rename, so a crash mid-write never leaves a
// half-written spreadsheet behind.
async function save(wb) {
  backup();
  const tmp = `${WORKBOOK}.tmp`;
  await W.finalize(wb).xlsx.writeFile(tmp);
  fs.renameSync(tmp, WORKBOOK);
}

function archive(wb) {
  const { weekEnd } = W.getWeek(wb);
  const name = `Timesheets_WE_${weekEnd || stamp()}.xlsx`;
  let dest = path.join(ARCHIVE, name);
  if (fs.existsSync(dest)) dest = path.join(ARCHIVE, name.replace('.xlsx', `_${stamp()}.xlsx`));
  fs.copyFileSync(WORKBOOK, dest);
  return path.basename(dest);
}

// ---------------------------------------------------------------- app

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// The office page URI-encodes the password so accented letters or symbols like
// £ survive the trip in a header (browsers reject them raw).
function headerSecret(req) {
  try {
    return decodeURIComponent(req.get('x-admin-password') || '').trim();
  } catch {
    return '';
  }
}

function admin(req, res, next) {
  if (safeEqual(headerSecret(req), ADMIN_PASSWORD)) return next();
  res.status(401).json({ error: 'Wrong admin password.' });
}

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    if (err instanceof W.UserError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong saving to the spreadsheet. Please try again.' });
  });

// --- crew

app.get('/api/config', wrap(async (req, res) => {
  if (!fs.existsSync(WORKBOOK)) return res.json({ ready: false, pinRequired: !!CREW_PIN });
  const wb = await load();
  res.json({
    ready: true,
    pinRequired: !!CREW_PIN,
    employees: W.listEmployees(wb),
    jobs: W.listJobs(wb),
    week: W.getWeek(wb),
    today: W.localIso(new Date()),
  });
}));

app.post('/api/submit', wrap(async (req, res) => {
  if (CREW_PIN && !safeEqual(String(req.body?.pin || '').trim(), CREW_PIN)) {
    throw new W.UserError('Wrong crew PIN. Ask the office for the current PIN.', 401);
  }
  const result = await locked(async () => {
    const wb = await load();
    const sub = W.validateSubmission(req.body, { employees: W.listEmployees(wb), today: W.localIso(new Date()) });
    if (W.hasEntry(wb, sub.id)) return { duplicate: true, where: 'tracker', day: W.dayName(sub.date) };

    let rolled = null;
    const nextWeekEnd = AUTO_NEW_WEEK && W.needsNewWeek(wb, sub.date, WEEK_END_DAY);
    if (nextWeekEnd) {
      const archived = archive(wb);
      W.startNewWeek(wb, nextWeekEnd);
      rolled = { archived, weekEnd: nextWeekEnd };
      console.log(`New week started (week end ${nextWeekEnd}); previous week archived as ${archived}`);
    }
    const out = W.applySubmission(wb, sub);
    await save(wb);
    return { ...out, rolled, dayTotal: sub.dayTotal };
  });
  res.json({ ok: true, ...result });
}));

// --- office

app.post('/api/admin/login', admin, (req, res) => res.json({ ok: true }));

app.get('/api/admin/week', admin, wrap(async (req, res) => {
  const wb = await load();
  res.json(W.weekOverview(wb));
}));

app.post('/api/admin/entered', admin, wrap(async (req, res) => {
  await locked(async () => {
    const wb = await load();
    W.setEntered(wb, Number(req.body?.row), !!req.body?.entered);
    await save(wb);
  });
  res.json({ ok: true });
}));

app.post('/api/admin/new-week', admin, wrap(async (req, res) => {
  const out = await locked(async () => {
    const wb = await load();
    const archived = archive(wb);
    const week = W.startNewWeek(wb, String(req.body?.weekEnd || ''));
    await save(wb);
    return { archived, ...week };
  });
  res.json({ ok: true, ...out });
}));

app.get('/api/admin/download', admin, wrap(async (req, res) => {
  await locked(() => {}); // wait for any write in progress
  if (!fs.existsSync(WORKBOOK)) throw new W.UserError('No spreadsheet uploaded yet.', 404);
  res.download(WORKBOOK, 'Employee_Timesheet_Tracker.xlsx');
}));

app.get('/api/admin/archives', admin, (req, res) => {
  res.json(fs.readdirSync(ARCHIVE).filter((f) => f.endsWith('.xlsx')).sort().reverse());
});

app.get('/api/admin/archives/:name', admin, (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(ARCHIVE, name);
  if (!name.endsWith('.xlsx') || !fs.existsSync(file)) return res.status(404).json({ error: 'Not found.' });
  res.download(file, name);
});

// Upload the office's tracker (first-time setup, or after editing it in Excel).
app.put(
  '/api/admin/workbook',
  admin,
  express.raw({ type: () => true, limit: '20mb' }),
  wrap(async (req, res) => {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(req.body);
    } catch {
      throw new W.UserError('That file is not a valid .xlsx spreadsheet.');
    }
    W.prepare(wb);
    const employees = W.listEmployees(wb);
    if (!employees.length) throw new W.UserError('No employee names found in column A of the tracker.');
    await locked(() => save(wb));
    res.json({ ok: true, employees: employees.length, week: W.getWeek(wb) });
  })
);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Optional: bootstrap from a file placed in the data folder or given by path.
async function bootstrap() {
  if (fs.existsSync(WORKBOOK)) return;
  const src = process.env.TEMPLATE_PATH;
  if (!src) return;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(src);
  W.prepare(wb);
  await save(wb);
  console.log(`Imported ${src}`);
}

if (require.main === module) {
  bootstrap()
    .then(() =>
      app.listen(PORT, () => {
        console.log(`Site timesheets running on http://localhost:${PORT}`);
        console.log(`Office page: http://localhost:${PORT}/admin`);
        if (!fs.existsSync(WORKBOOK)) console.log('No spreadsheet yet - upload it from the office page.');
      })
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = app;
