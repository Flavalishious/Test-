'use strict';

// All knowledge of the office spreadsheet layout lives here. The rest of the
// app passes plain objects in and out and never touches cells directly.

const TRACKER = 'Timesheet Tracker';
const SUMMARY = 'Summary';
const LOG = 'Job Log';
const JOBS = 'Jobs';

const FIRST_ROW = 3;
const COL = {
  name: 1, // A Employee Name
  day: 2, // B Day
  sent: 3, // C Times Sent?
  received: 4, // D Date Received
  entered: 5, // E Times Entered?
  enteredDate: 6, // F Date Entered
  status: 7, // G Status (formula)
  hours: 8, // H Total Hours
  notes: 9, // I Notes
  jobs: 10, // J Job Number(s) - added by this app
};

const LOG_HEADERS = [
  ['Entry ID', 38],
  ['Submitted', 18],
  ['Date', 12],
  ['Day', 11],
  ['Employee', 22],
  ['Job Number', 14],
  ['Hours', 8],
  ['Start', 8],
  ['Finish', 8],
  ['Break (mins)', 12],
  ['Day Total', 10],
  ['Notes', 40],
];
const LOG_COL = Object.fromEntries(LOG_HEADERS.map(([h], i) => [h, i + 1]));

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };
const DATE_FMT = 'dd/mm/yyyy';
const DATETIME_FMT = 'dd/mm/yyyy hh:mm';

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------- dates
// Dates travel through the app as 'YYYY-MM-DD' strings. Excel has no time
// zones, so cell dates are built in UTC from local wall-clock parts.

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCDate() === +m[3] ? d : null;
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

function dayName(iso) {
  return DAYS[parseIso(iso).getUTCDay()];
}

function mondayOf(iso) {
  const dow = parseIso(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

// weekEndDay: 1 = Monday ... 7 = Sunday
function weekEndFor(iso, weekEndDay) {
  return addDays(mondayOf(iso), weekEndDay - 1);
}

function excelDate(iso) {
  return parseIso(iso);
}

function excelNow(now) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()));
}

function localIso(now) {
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function cellDateIso(v) {
  if (v instanceof Date) return toIso(v);
  if (typeof v === 'string') return parseIso(v) ? v : null;
  return null;
}

function fmtDmy(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------- cell helpers

function text(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return text(v.result);
    if (v.text) return String(v.text);
  }
  return String(v);
}

function norm(v) {
  return text(v).trim().replace(/\s+/g, ' ').toLowerCase();
}

function statusFor(name, sent, entered) {
  if (!text(name).trim()) return '';
  if (text(sent) !== 'Yes') return 'Not Sent';
  return text(entered) === 'Yes' ? 'Entered' : 'Received - Not Entered';
}

function tracker(wb) {
  const ws = wb.getWorksheet(TRACKER);
  if (!ws) throw new UserError(`The spreadsheet has no "${TRACKER}" sheet.`);
  return ws;
}

function lastTrackerRow(ws) {
  let last = FIRST_ROW;
  for (let r = FIRST_ROW; r <= ws.rowCount; r++) {
    if (text(ws.getCell(r, COL.name).value).trim()) last = r;
  }
  return last;
}

// ExcelJS shares one style object between cells loaded with the same style,
// so `cell.numFmt = x` would also change every other cell sharing it (e.g.
// the Day column). Always give the cell its own copy.
function restyle(cell, patch) {
  cell.style = { ...cell.style, ...patch };
}

function setStatus(ws, r) {
  const row = ws.getRow(r);
  row.getCell(COL.status).value = {
    formula: `IF(A${r}="","",IF(C${r}<>"Yes","Not Sent",IF(E${r}="Yes","Entered","Received - Not Entered")))`,
    result: statusFor(row.getCell(COL.name).value, row.getCell(COL.sent).value, row.getCell(COL.entered).value),
  };
}

// ---------------------------------------------------------------- prepare

// Brings an uploaded tracker up to what the app needs. Safe to run repeatedly:
// - adds a "Job Number(s)" column after Notes
// - extends the Status formula, Yes/No dropdowns, status colours and Summary
//   counts to every employee row (the original file stops at row 32)
// - adds "Job Log" (one line per job per day) and "Jobs" (optional job list)
function prepare(wb) {
  const ws = tracker(wb);
  const last = lastTrackerRow(ws);

  const head = ws.getCell(2, COL.notes);
  const jobsHead = ws.getCell(2, COL.jobs);
  if (!text(jobsHead.value).trim()) {
    jobsHead.value = 'Job Number(s)';
    jobsHead.style = JSON.parse(JSON.stringify(head.style || {}));
    ws.getColumn(COL.jobs).width = 30;
  }

  const yesNo = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
  for (let r = FIRST_ROW; r <= last; r++) {
    setStatus(ws, r);
    ws.getCell(r, COL.sent).dataValidation = yesNo;
    ws.getCell(r, COL.entered).dataValidation = yesNo;
    restyle(ws.getCell(r, COL.received), { numFmt: DATETIME_FMT });
    restyle(ws.getCell(r, COL.enteredDate), { numFmt: DATE_FMT });
    restyle(ws.getCell(r, COL.jobs), { alignment: { wrapText: true, vertical: 'top' } });
  }
  for (const cf of ws.conditionalFormattings || []) {
    cf.ref = cf.ref.replace(/^(G3:[A-Z]+)\d+$/, `$1${last}`);
  }

  const sum = wb.getWorksheet(SUMMARY);
  if (sum) {
    sum.eachRow((row) =>
      row.eachCell((c) => {
        const f = c.value && c.value.formula;
        if (f && f.includes(TRACKER)) {
          c.value = { formula: f.replace(/([A-Z]+)3:([A-Z]+)\d+/g, (_, a, b) => `${a}3:${b}${last}`) };
        }
      })
    );
  }

  if (!wb.getWorksheet(LOG)) {
    const log = wb.addWorksheet(LOG, { views: [{ state: 'frozen', ySplit: 1 }] });
    log.columns = LOG_HEADERS.map(([header, width]) => ({ header, width }));
    styleHeader(log.getRow(1));
    log.autoFilter = { from: 'A1', to: { row: 1, column: LOG_HEADERS.length } };
  }
  if (!wb.getWorksheet(JOBS)) {
    const jobs = wb.addWorksheet(JOBS, { views: [{ state: 'frozen', ySplit: 1 }] });
    jobs.columns = [
      { header: 'Job Number', width: 16 },
      { header: 'Job Name / Site', width: 40 },
      { header: 'Active (Yes/No)', width: 16 },
    ];
    styleHeader(jobs.getRow(1));
    jobs.getCell('E1').value = 'List job numbers here and they appear as suggestions on the crew app. Set Active to No to hide one.';
    restyle(jobs.getCell('E1'), { font: { italic: true, color: { argb: 'FF666666' } } });
  }

  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  refreshSummary(wb);
  return wb;
}

function styleHeader(row) {
  row.eachCell((c) => restyle(c, { fill: HEADER_FILL, font: HEADER_FONT, alignment: { horizontal: 'center', vertical: 'middle' } }));
}

// Excel recalculates on open, but phone previews and other viewers show the
// cached result, so keep the Summary's cached numbers accurate too.
function refreshSummary(wb) {
  const sum = wb.getWorksheet(SUMMARY);
  if (!sum) return;
  const ws = tracker(wb);
  sum.eachRow((row) =>
    row.eachCell((c) => {
      const f = c.value && c.value.formula;
      const m = f && /^COUNTIF\('Timesheet Tracker'!([A-Z])(\d+):\1(\d+),"([^"]*)"\)$/.exec(f);
      if (!m) return;
      const col = ws.getColumn(m[1]).number;
      let n = 0;
      for (let r = +m[2]; r <= +m[3]; r++) {
        const v = text(ws.getCell(r, col).value);
        if (m[4] === '<>' ? v !== '' : v === m[4]) n++;
      }
      c.value = { formula: f, result: n };
    })
  );
}

// ---------------------------------------------------------------- reading

function getWeek(wb) {
  const title = text(tracker(wb).getCell('A1').value);
  const m = /week\s*end(?:ing)?\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i.exec(title);
  if (!m) return { title, weekEnd: null, start: null, end: null };
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const weekEnd = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (!parseIso(weekEnd)) return { title, weekEnd: null, start: null, end: null };
  // The tracker covers the Monday-Sunday week that contains its week-end date.
  const start = mondayOf(weekEnd);
  return { title, weekEnd, start, end: addDays(start, 6) };
}

function listEmployees(wb) {
  const ws = tracker(wb);
  const seen = new Map();
  for (let r = FIRST_ROW; r <= lastTrackerRow(ws); r++) {
    const name = text(ws.getCell(r, COL.name).value).trim().replace(/\s+/g, ' ');
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

function listJobs(wb) {
  const ws = wb.getWorksheet(JOBS);
  if (!ws) return [];
  const jobs = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const number = text(row.getCell(1).value).trim();
    const active = norm(row.getCell(3).value);
    if (number && active !== 'no' && active !== 'n') jobs.push({ number, name: text(row.getCell(2).value).trim() });
  });
  return jobs;
}

function findRow(ws, employee, day) {
  for (let r = FIRST_ROW; r <= lastTrackerRow(ws); r++) {
    if (norm(ws.getCell(r, COL.name).value) === norm(employee) && norm(ws.getCell(r, COL.day).value) === norm(day)) return r;
  }
  return null;
}

function weekOverview(wb) {
  const ws = tracker(wb);
  const rows = [];
  for (let r = FIRST_ROW; r <= lastTrackerRow(ws); r++) {
    const name = text(ws.getCell(r, COL.name).value).trim();
    if (!name) continue;
    const v = (c) => ws.getCell(r, c).value;
    rows.push({
      row: r,
      name,
      day: text(v(COL.day)).trim(),
      sent: text(v(COL.sent)) === 'Yes',
      received: v(COL.received) instanceof Date ? v(COL.received).toISOString() : null,
      entered: text(v(COL.entered)) === 'Yes',
      status: statusFor(name, v(COL.sent), v(COL.entered)),
      hours: typeof v(COL.hours) === 'number' ? v(COL.hours) : null,
      notes: text(v(COL.notes)),
      jobs: text(v(COL.jobs)),
    });
  }
  return { ...getWeek(wb), rows };
}

function logRows(wb) {
  const log = wb.getWorksheet(LOG);
  const out = [];
  if (!log) return out;
  log.eachRow((row, r) => {
    if (r === 1) return;
    const g = (h) => row.getCell(LOG_COL[h]).value;
    const date = cellDateIso(g('Date'));
    if (!date) return;
    out.push({
      r,
      id: text(g('Entry ID')),
      submitted: g('Submitted') instanceof Date ? g('Submitted') : null,
      date,
      employee: text(g('Employee')).trim(),
      job: text(g('Job Number')).trim(),
      hours: Number(g('Hours')) || 0,
      notes: text(g('Notes')),
    });
  });
  return out;
}

// ---------------------------------------------------------------- validation

function parseTime(t) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Checks a crew submission and returns a cleaned copy.
function validateSubmission(body, { employees, today }) {
  const s = body || {};
  const employee = employees.find((e) => norm(e) === norm(s.employee));
  if (!employee) throw new UserError('Pick your name from the list.');
  const date = parseIso(s.date) ? s.date : null;
  if (!date) throw new UserError('Pick the date you worked.');
  if (date > addDays(today, 1)) throw new UserError("You can't enter times for a future date.");
  if (date < addDays(today, -60)) throw new UserError('That date is more than 60 days ago - contact the office.');

  const start = parseTime(s.start);
  const finish = parseTime(s.finish);
  if (start == null || finish == null) throw new UserError('Enter your start and finish times.');
  const breakMins = Number(s.breakMins);
  if (!Number.isFinite(breakMins) || breakMins < 0 || breakMins > 240) throw new UserError('Break must be between 0 and 240 minutes.');
  const span = (finish - start + 1440) % 1440; // allows night shifts past midnight
  const dayTotal = round2((span - breakMins) / 60);
  if (dayTotal <= 0) throw new UserError('Finish time must be after start time (allowing for your break).');
  if (dayTotal > 18) throw new UserError(`${dayTotal} hours looks too long - check your start and finish times.`);

  const jobs = (Array.isArray(s.jobs) ? s.jobs : [])
    .map((j) => ({ job: String(j.job || '').trim().slice(0, 40), hours: round2(Number(j.hours)) }))
    .filter((j) => j.job || j.hours);
  if (!jobs.length) throw new UserError('Add at least one job number.');
  for (const j of jobs) {
    if (!j.job) throw new UserError('Every line needs a job number.');
    if (!(j.hours > 0)) throw new UserError(`Enter the hours for job ${j.job}.`);
  }
  const jobTotal = round2(jobs.reduce((a, j) => a + j.hours, 0));
  if (Math.abs(jobTotal - dayTotal) > 0.01) {
    throw new UserError(`Job hours add up to ${jobTotal}, but your start/finish times give ${dayTotal}. Make them match.`);
  }

  const id = String(s.id || '').trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new UserError('Missing entry ID - refresh the page and try again.');

  return {
    id,
    employee,
    date,
    start: s.start,
    finish: s.finish,
    breakMins,
    dayTotal,
    jobs,
    notes: String(s.notes || '').trim().slice(0, 500),
  };
}

// ---------------------------------------------------------------- writing

function jobSummary(lines) {
  // "J1234 (6), J1250 (2)" - hours merged per job number
  const byJob = new Map();
  for (const l of lines) byJob.set(l.job, round2((byJob.get(l.job) || 0) + l.hours));
  return [...byJob].map(([job, h]) => `${job} (${h})`).join(', ');
}

function writeTrackerRow(ws, r, { hours, jobs, notes, received }) {
  const row = ws.getRow(r);
  row.getCell(COL.sent).value = 'Yes';
  row.getCell(COL.received).value = received;
  row.getCell(COL.hours).value = hours;
  row.getCell(COL.notes).value = notes || null;
  row.getCell(COL.jobs).value = jobs;
  setStatus(ws, r);
}

// Has an entry with this ID already been saved? (offline retries resend.)
function hasEntry(wb, id) {
  return logRows(wb).some((l) => l.id === id);
}

// Saves one crew submission. Returns what happened so the crew member can be
// told in plain words. Call needsNewWeek() first and roll the week if needed.
function applySubmission(wb, sub, now = new Date()) {
  const ws = tracker(wb);
  const log = wb.getWorksheet(LOG);
  const day = dayName(sub.date);
  const week = getWeek(wb);
  const inWeek = !week.start || (sub.date >= week.start && sub.date <= week.end);
  const r = inWeek ? findRow(ws, sub.employee, day) : null;

  if (r && text(ws.getCell(r, COL.entered).value) === 'Yes') {
    throw new UserError(`The office has already processed your ${day} times. Contact the office to change them.`, 409);
  }

  // A resubmission for the same person and day replaces the earlier one.
  const old = logRows(wb).filter((l) => norm(l.employee) === norm(sub.employee) && l.date === sub.date);
  for (const l of old.sort((a, b) => b.r - a.r)) log.spliceRows(l.r, 1);

  const submitted = excelNow(now);
  for (const j of sub.jobs) {
    const row = log.addRow([
      sub.id, submitted, excelDate(sub.date), day, sub.employee, j.job, j.hours,
      sub.start, sub.finish, sub.breakMins, sub.dayTotal, sub.notes || null,
    ]);
    restyle(row.getCell(LOG_COL.Submitted), { numFmt: DATETIME_FMT });
    restyle(row.getCell(LOG_COL.Date), { numFmt: DATE_FMT });
  }

  if (r) {
    writeTrackerRow(ws, r, { hours: sub.dayTotal, jobs: jobSummary(sub.jobs), notes: sub.notes, received: submitted });
    refreshSummary(wb);
  }

  let where;
  if (r) where = 'tracker';
  else if (!inWeek) where = 'other-week';
  else where = 'log-only'; // e.g. a Saturday, or a name/day without a tracker row
  return { replaced: old.length > 0, where, day, row: r, week };
}

// Returns the week-end date to roll to when a submission is for a later week
// than the tracker currently shows, otherwise null.
function needsNewWeek(wb, date, weekEndDay) {
  const week = getWeek(wb);
  if (!week.start || date <= week.end) return null;
  return weekEndFor(date, weekEndDay);
}

// Clears the crew/office columns, sets the new week-end date in the title and
// fills in anything already in the Job Log for that week.
function startNewWeek(wb, weekEnd) {
  if (!parseIso(weekEnd)) throw new UserError('Pick a valid week-ending date.');
  const ws = tracker(wb);
  const title = ws.getCell('A1');
  const old = text(title.value);
  title.value = /week\s*end/i.test(old)
    ? old.replace(/(week\s*end(?:ing)?\s*:?\s*)\S*/i, `$1${fmtDmy(weekEnd)}`)
    : `SITE TIMES Week End ${fmtDmy(weekEnd)}`;

  const last = lastTrackerRow(ws);
  for (let r = FIRST_ROW; r <= last; r++) {
    if (!text(ws.getCell(r, COL.name).value).trim()) continue;
    const row = ws.getRow(r);
    row.getCell(COL.sent).value = 'No';
    row.getCell(COL.entered).value = 'No';
    for (const c of [COL.received, COL.enteredDate, COL.hours, COL.notes, COL.jobs]) row.getCell(c).value = null;
    setStatus(ws, r);
  }

  const { start, end } = getWeek(wb);
  const groups = new Map();
  for (const l of logRows(wb)) {
    if (l.date < start || l.date > end) continue;
    const key = `${norm(l.employee)}|${l.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  let filled = 0;
  for (const lines of groups.values()) {
    const r = findRow(ws, lines[0].employee, dayName(lines[0].date));
    if (!r) continue;
    writeTrackerRow(ws, r, {
      hours: round2(lines.reduce((a, l) => a + l.hours, 0)),
      jobs: jobSummary(lines),
      notes: lines[0].notes,
      received: lines[0].submitted,
    });
    filled++;
  }
  refreshSummary(wb);
  return { ...getWeek(wb), filled };
}

// ExcelJS 4.4 sorts cell addresses as text when it writes dropdown ranges
// (C10 before C3), producing overlapping validations that Excel may "repair".
// Regroup per-cell validations into clean vertical ranges before saving.
function normaliseValidations(wb) {
  wb.eachSheet((ws) => {
    const model = ws.dataValidations && ws.dataValidations.model;
    if (!model) return;
    const out = {};
    const runs = new Map();
    for (const [addr, dv] of Object.entries(model)) {
      const m = /^([A-Z]+)(\d+)$/.exec(addr);
      if (!m || !dv) {
        if (dv) out[addr] = dv;
        continue;
      }
      const key = `${m[1]}|${JSON.stringify(dv)}`;
      if (!runs.has(key)) runs.set(key, { col: m[1], dv, rows: [] });
      runs.get(key).rows.push(+m[2]);
    }
    for (const { col, dv, rows } of runs.values()) {
      rows.sort((a, b) => a - b);
      let from = rows[0];
      for (let i = 1; i <= rows.length; i++) {
        if (rows[i] === rows[i - 1] + 1) continue;
        const to = rows[i - 1];
        out[from === to ? `${col}${from}` : `${col}${from}:${col}${to}`] = dv;
        from = rows[i];
      }
    }
    ws.dataValidations.model = out;
  });
}

// Call right before writing the file.
function finalize(wb) {
  normaliseValidations(wb);
  return wb;
}

function setEntered(wb, r, entered, now = new Date()) {
  const ws = tracker(wb);
  if (!Number.isInteger(r) || r < FIRST_ROW || r > lastTrackerRow(ws) || !text(ws.getCell(r, COL.name).value).trim()) {
    throw new UserError('Unknown row.');
  }
  ws.getCell(r, COL.entered).value = entered ? 'Yes' : 'No';
  ws.getCell(r, COL.enteredDate).value = entered ? excelDate(localIso(now)) : null;
  setStatus(ws, r);
  refreshSummary(wb);
}

module.exports = {
  UserError,
  prepare,
  finalize,
  getWeek,
  listEmployees,
  listJobs,
  weekOverview,
  validateSubmission,
  applySubmission,
  hasEntry,
  needsNewWeek,
  startNewWeek,
  setEntered,
  weekEndFor,
  localIso,
  dayName,
  TRACKER,
  LOG,
};
