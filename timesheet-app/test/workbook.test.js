'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/workbook');
const { buildTracker, roundTrip } = require('./fixture');

const LAST = 21; // last employee row in the fixture (Friday block)

function sub(over = {}) {
  return {
    id: `id-${Math.random().toString(36).slice(2, 12)}`,
    employee: 'sam kelly',
    date: '2026-09-15', // Tuesday, inside the fixture's week (week end 16/09/2026)
    start: '07:30',
    finish: '16:30',
    breakMins: 30,
    jobs: [{ job: 'J100', hours: 6 }, { job: 'J200', hours: 2.5 }],
    notes: 'Wet pm',
    ...over,
  };
}

async function prepared() {
  const wb = await roundTrip(buildTracker());
  return W.prepare(wb);
}

function clean(wb, body) {
  return W.validateSubmission(body, { employees: W.listEmployees(wb), today: '2026-09-18' });
}

test('prepare extends formulas, dropdowns, colours and summary to every employee row', async () => {
  const wb = await roundTrip(W.finalize(await prepared()));
  const ws = wb.getWorksheet(W.TRACKER);

  assert.equal(ws.getCell('J2').value, 'Job Number(s)');
  assert.equal(ws.getCell(`G${LAST}`).value.formula.startsWith(`IF(A${LAST}=""`), true);
  assert.equal(ws.getCell(`G${LAST}`).value.result, 'Not Sent');
  assert.deepEqual(ws.getCell(`C${LAST}`).dataValidation.formulae, ['"Yes,No"']);
  assert.deepEqual(ws.getCell(`E${LAST}`).dataValidation.formulae, ['"Yes,No"']);
  assert.equal(ws.conditionalFormattings[0].ref, `G3:H${LAST}`);
  assert.match(wb.getWorksheet('Summary').getCell('B4').value.formula, new RegExp(`C3:C${LAST}`));
  assert.ok(wb.getWorksheet('Job Log'));
  assert.ok(wb.getWorksheet('Jobs'));
});

test('formatting the date columns leaves the Day column alone', async () => {
  const wb = await roundTrip(buildTracker());
  const ws = wb.getWorksheet(W.TRACKER);
  for (const col of [2, 4, 6]) ws.getColumn(col).eachCell({ includeEmpty: true }, (c) => (c.numFmt = 'mm-dd-yy')); // like the original
  const shared = await roundTrip(wb);
  W.prepare(shared);
  const t = shared.getWorksheet(W.TRACKER);
  assert.equal(t.getCell('B8').numFmt, 'mm-dd-yy');
  assert.equal(t.getCell('D8').numFmt, 'dd/mm/yyyy hh:mm');
  assert.equal(t.getCell('F8').numFmt, 'dd/mm/yyyy');
});

test('dropdown ranges are written without overlaps (ExcelJS text-sort bug)', async () => {
  const wb = W.finalize(await prepared());
  const keys = Object.keys(wb.getWorksheet(W.TRACKER).dataValidations.model).sort();
  assert.deepEqual(keys, [`C3:C${LAST}`, `E3:E${LAST}`]);
});

test('prepare is safe to run twice', async () => {
  const wb = W.prepare(await prepared());
  assert.equal(wb.worksheets.filter((s) => s.name === 'Job Log').length, 1);
  assert.equal(wb.getWorksheet(W.TRACKER).getCell('K2').value, null);
});

test('crew list comes from column A, trimmed and de-duplicated', async () => {
  assert.deepEqual(W.listEmployees(await prepared()), ['Alex Byrne', 'Sam Kelly', 'Chris Nolan']);
});

test('week is the Monday-Sunday week containing the week-end date', async () => {
  const w = W.getWeek(await prepared());
  assert.equal(w.weekEnd, '2026-09-16');
  assert.equal(w.start, '2026-09-14');
  assert.equal(w.end, '2026-09-20');
});

test('submission fills the matching tracker row and job log', async () => {
  const wb = await prepared();
  const out = W.applySubmission(wb, clean(wb, sub()), new Date(2026, 8, 15, 17, 5));
  assert.equal(out.where, 'tracker');
  assert.equal(out.row, 8);

  const ws = wb.getWorksheet(W.TRACKER);
  assert.equal(ws.getCell('C8').value, 'Yes');
  assert.deepEqual(ws.getCell('D8').value, new Date(Date.UTC(2026, 8, 15, 17, 5)));
  assert.equal(ws.getCell('G8').value.result, 'Received - Not Entered');
  assert.equal(ws.getCell('H8').value, 8.5);
  assert.equal(ws.getCell('I8').value, 'Wet pm');
  assert.equal(ws.getCell('J8').value, 'J100 (6), J200 (2.5)');
  assert.equal(ws.getCell('E8').value, null, 'office columns are left alone');

  const log = wb.getWorksheet('Job Log');
  assert.equal(log.rowCount, 3);
  assert.equal(log.getCell('F2').value, 'J100');
  assert.equal(log.getCell('E2').value, 'Sam Kelly');
  assert.equal(log.getCell('K3').value, 8.5);

  const sum = wb.getWorksheet('Summary');
  assert.equal(sum.getCell('B4').value.result, 1); // Times Sent
  assert.equal(sum.getCell('B7').value.result, 1); // Received - Not Entered
});

test('sending the same day again replaces the earlier entry', async () => {
  const wb = await prepared();
  W.applySubmission(wb, clean(wb, sub()));
  const out = W.applySubmission(wb, clean(wb, sub({ jobs: [{ job: 'J300', hours: 8.5 }], notes: '' })));
  assert.equal(out.replaced, true);
  const log = wb.getWorksheet('Job Log');
  assert.equal(log.rowCount, 2);
  assert.equal(log.getCell('F2').value, 'J300');
  assert.equal(wb.getWorksheet(W.TRACKER).getCell('J8').value, 'J300 (8.5)');
  assert.equal(wb.getWorksheet(W.TRACKER).getCell('I8').value, null);
});

test('same job on two lines is merged in the tracker summary', async () => {
  const wb = await prepared();
  W.applySubmission(wb, clean(wb, sub({ jobs: [{ job: 'J1', hours: 4 }, { job: 'J1', hours: 4.5 }] })));
  assert.equal(wb.getWorksheet(W.TRACKER).getCell('J8').value, 'J1 (8.5)');
});

test('crew cannot change a day the office has already entered', async () => {
  const wb = await prepared();
  W.applySubmission(wb, clean(wb, sub()));
  W.setEntered(wb, 8, true, new Date(2026, 8, 16));
  assert.equal(wb.getWorksheet(W.TRACKER).getCell('G8').value.result, 'Entered');
  assert.throws(() => W.applySubmission(wb, clean(wb, sub())), (e) => e.status === 409);
});

test('weekend and other-week entries go to the job log only', async () => {
  const wb = await prepared();
  assert.equal(W.applySubmission(wb, clean(wb, sub({ date: '2026-09-19' }))).where, 'log-only');
  assert.equal(W.applySubmission(wb, clean(wb, sub({ date: '2026-09-09' }))).where, 'other-week');
  assert.equal(wb.getWorksheet(W.TRACKER).getCell('C8').value, null);
  assert.equal(wb.getWorksheet('Job Log').rowCount, 5);
});

test('validation catches the usual mistakes', async () => {
  const wb = await prepared();
  const bad = (over, re) => assert.throws(() => clean(wb, sub(over)), re);
  bad({ employee: 'Nobody' }, /Pick your name/);
  bad({ date: '2026-09-25' }, /future/);
  bad({ jobs: [{ job: 'J1', hours: 7 }] }, /add up to 7.*give 8.5/);
  bad({ jobs: [{ job: '', hours: 8.5 }] }, /job number/);
  bad({ jobs: [] }, /at least one job/);
  bad({ finish: '07:30' }, /Finish time/);
  bad({ id: '' }, /entry ID/);
  // night shift over midnight
  const night = clean(wb, sub({ start: '22:00', finish: '06:00', breakMins: 30, jobs: [{ job: 'N1', hours: 7.5 }] }));
  assert.equal(night.dayTotal, 7.5);
});

test('new week resets the tracker and fills in entries already logged for it', async () => {
  const wb = await prepared();
  W.applySubmission(wb, clean(wb, sub()));
  // Arrives before the week is rolled: only the job log gets it.
  const early = clean(wb, sub({ employee: 'Alex Byrne', date: '2026-09-18', jobs: [{ job: 'J9', hours: 8.5 }] }));
  W.applySubmission(wb, early);
  W.setEntered(wb, 8, true);

  assert.equal(W.needsNewWeek(wb, '2026-09-18', 5), null, 'still the same week');
  assert.equal(W.needsNewWeek(wb, '2026-09-22', 5), '2026-09-25');

  const out = W.startNewWeek(wb, '2026-09-25');
  assert.equal(out.title, 'SITE TIMES Week End 25/09/2026');
  const ws = wb.getWorksheet(W.TRACKER);
  for (const c of ['D8', 'F8', 'H8', 'I8', 'J8']) assert.equal(ws.getCell(c).value, null, c);
  assert.equal(ws.getCell('C8').value, 'No');
  assert.equal(ws.getCell('E8').value, 'No');
  assert.equal(out.filled, 0, '18/09 belongs to the old week');

  // A late Friday entry for the new week is replayed if the week is restarted.
  W.applySubmission(wb, clean(wb, sub({ employee: 'Alex Byrne', date: '2026-09-18', jobs: [{ job: 'J9', hours: 8.5 }] })));
  const back = W.startNewWeek(wb, '2026-09-18');
  assert.equal(back.filled, 2);
  assert.equal(ws.getCell('C19').value, 'Yes'); // Alex Byrne, Friday 18th
  assert.equal(ws.getCell('J19').value, 'J9 (8.5)');
  assert.equal(ws.getCell('H8').value, 8.5); // Sam Kelly, Tuesday 15th
});
