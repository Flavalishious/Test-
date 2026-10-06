'use strict';

// Builds a workbook laid out like the office's Employee Timesheet Tracker
// (same sheets, columns, formulas and quirks) with made-up names, so the real
// file with staff details never has to live in the repo.

const ExcelJS = require('exceljs');

const NAMES = ['Alex Byrne', 'Sam Kelly ', 'Chris Nolan'];
const DAYS = ['Monday ', 'Tuesday', 'Wednesday ', 'Thursday', 'Friday '];

function buildTracker() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Timesheet Tracker', { views: [{ state: 'frozen', ySplit: 2 }] });
  ws.getCell('A1').value = 'SITE TIMES Week End 16/09/2026';
  ws.mergeCells('A1:I1');
  const heads = ['Employee Name', 'Day', 'Times Sent?', 'Date Received', 'Times Entered?', 'Date Entered', 'Status', 'Total Hours', 'Notes'];
  heads.forEach((h, i) => {
    const c = ws.getCell(2, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  });

  let r = 3;
  for (const day of DAYS) {
    for (const name of NAMES) {
      ws.getCell(r, 1).value = name;
      ws.getCell(r, 2).value = day;
      r++;
    }
    r++; // blank separator row, like the real sheet
  }
  // Like the original, formulas/dropdowns/colours only reach part-way down.
  const stop = 10;
  for (let i = 3; i <= stop; i++) {
    ws.getCell(i, 7).value = { formula: `IF(A${i}="","",IF(C${i}<>"Yes","Not Sent",IF(E${i}="Yes","Entered","Received - Not Entered")))` };
    for (const c of [3, 5]) ws.getCell(i, c).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
  }
  ws.addConditionalFormatting({
    ref: `G3:H${stop}`,
    rules: [{ type: 'cellIs', operator: 'equal', formulae: ['"Entered"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } } } }],
  });

  const sum = wb.addWorksheet('Summary');
  sum.getCell('A1').value = 'Timesheet Summary';
  const rows = [
    ['Total Employees', 'A', '<>'],
    ['Times Sent', 'C', 'Yes'],
    ['Times Entered', 'E', 'Yes'],
    ['Not Sent', 'G', 'Not Sent'],
    ['Received - Not Entered', 'G', 'Received - Not Entered'],
  ];
  rows.forEach(([label, col, crit], i) => {
    sum.getCell(i + 3, 1).value = label;
    sum.getCell(i + 3, 2).value = { formula: `COUNTIF('Timesheet Tracker'!${col}3:${col}${stop},"${crit}")` };
  });
  return wb;
}

async function roundTrip(wb) {
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  return out;
}

module.exports = { buildTracker, roundTrip, NAMES };
