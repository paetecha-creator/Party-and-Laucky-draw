import * as XLSX from 'xlsx';
import { Employee } from '../types/event';

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: { sheetId: number; title: string; rowCount: number }[];
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `ไม่สามารถอ่านข้อมูล Spreadsheet ได้ (HTTP ${res.status})`
    );
  }
  const data = await res.json();
  return {
    spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    sheets: (data.sheets || []).map((s: { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number } } }) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title || 'Sheet1',
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
    })),
  };
}

export async function fetchSheetValues(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<unknown[][]> {
  const escapedTitle = `'${sheetTitle.replace(/'/g, "''")}'!A1:Z5000`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(escapedTitle)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `ไม่สามารถอ่านข้อมูลชีต ${sheetTitle} ได้ (HTTP ${res.status})`
    );
  }
  const data = await res.json();
  return (data.values as unknown[][]) || [];
}

function cleanStr(val: unknown, maxLen: number): string {
  return String(val ?? '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeId(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40);
}

export function formatCellDate(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return String(val).trim().slice(0, 30);
}

export function checkIsProbation(startDateStr: string): boolean {
  if (!startDateStr) return false;
  const cleaned = startDateStr.trim();
  let parsed: Date | null = null;

  const dmy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    let year = Number(dmy[3]);
    if (year > 2400) year -= 543;
    parsed = new Date(year, month, day);
  } else {
    const iso = new Date(cleaned);
    if (!isNaN(iso.getTime())) parsed = iso;
  }

  if (!parsed || isNaN(parsed.getTime())) return false;
  const diffDays = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays < 120;
}

export function parseEmployeeRows(rows: unknown[][]): Employee[] {
  if (!rows || rows.length <= 1) return [];
  const headerRow = rows[0].map((h) => String(h ?? '').trim());

  let idxInCharge = headerRow.findIndex((h) => /in\s*charge|แผนก|ฝ่าย/i.test(h));
  let idxId = headerRow.findIndex((h) => /รหัส|id|code|empid/i.test(h));
  let idxSex = headerRow.findIndex((h) => /sex|เพศ|คำนำหน้า|prefix/i.test(h));
  let idxFirstName = headerRow.findIndex((h) => /^ชื่อ$|first\s*name/i.test(h));
  let idxLastName = headerRow.findIndex((h) => /นามสกุล|last\s*name/i.test(h));
  let idxPos = headerRow.findIndex((h) => /ตำแหน่ง|position|pos/i.test(h));
  let idxTable = headerRow.findIndex((h) => /โต๊ะ|table/i.test(h));
  let idxRegStatus = headerRow.findIndex((h) => /สถานะการลงทะเบียน|สถานะ|status|registered/i.test(h));
  let idxStartDate = headerRow.findIndex((h) =>
    /วันเริ่มงาน|เริ่มงาน|start\s*date|join\s*date|ทดลองงาน|probation/i.test(h)
  );

  if (idxInCharge === -1) idxInCharge = 0;
  if (idxId === -1) idxId = 1;
  if (idxSex === -1) idxSex = 2;
  if (idxFirstName === -1) idxFirstName = 3;
  if (idxLastName === -1) idxLastName = 4;
  if (idxPos === -1) idxPos = 5;
  if (idxTable === -1) idxTable = 6;
  if (idxRegStatus === -1 && headerRow.length >= 9) idxRegStatus = 7;
  if (idxStartDate === -1) idxStartDate = headerRow.length >= 9 ? 8 : 7;

  const result: Employee[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const rawId = cleanStr(r[idxId], 40);
    if (!rawId) continue;
    const id = sanitizeId(rawId);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const inCharge = cleanStr(r[idxInCharge], 60);
    const prefix = cleanStr(r[idxSex], 30);
    const firstName = cleanStr(r[idxFirstName], 80);
    const lastName = cleanStr(r[idxLastName], 80);
    const fullName = cleanStr(
      [prefix, firstName, lastName].filter(Boolean).join(' ') || id,
      180
    );
    const pos = cleanStr(r[idxPos], 80);
    const table = cleanStr(r[idxTable], 30);
    const startDate = formatCellDate(r[idxStartDate]);
    const regRaw = idxRegStatus !== -1 ? cleanStr(r[idxRegStatus], 40) : '';
    const isRegistered = regRaw.length > 0 && regRaw !== '-' && regRaw.toLowerCase() !== 'false';

    result.push({
      id,
      inCharge,
      prefix,
      firstName,
      lastName,
      fullName,
      pos,
      table,
      startDate,
      isProbation: checkIsProbation(startDate),
      registered: isRegistered,
      regTimeStr: isRegistered ? regRaw : '',
      regTimestamp: isRegistered ? Date.now() : 0,
      checkInOrder: isRegistered ? result.filter((e) => e.registered).length + 1 : 0,
      hasPhoto: false,
    });
  }

  return result;
}

export function parseWorkbookBufferToEmployees(buffer: ArrayBuffer): Employee[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  return parseEmployeeRows(rows);
}

export function parseCsvTextToEmployees(csvText: string): Employee[] {
  const wb = XLSX.read(csvText, { type: 'string' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  return parseEmployeeRows(rows);
}

export function downloadEmployeeTemplateExcel(): void {
  const wsData = [
    ['IN CHARGE', 'รหัส', 'Sex', 'ชื่อ', 'นามสกุล', 'ตำแหน่ง', 'เลขโต๊ะ', 'สถานะการลงทะเบียน', 'วันเริ่มงาน'],
    ['INJ', '7473', 'น.ส.', 'สกุลณา', 'กลิ่นหอม', 'MONTHLY-WORKER', 'A1', '', '09/10/2002'],
    ['EE', '15113', 'นาย', 'เจริญพัฒน์', 'ชาติไทยสง', 'ASST. TECH 2', 'A4', '', '20/06/2024'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, 'employee_import_template.xlsx');
}

export function downloadWinnersExcelFile(
  winners: {
    drawnAtStr: string;
    prizeName: string;
    empId: string;
    name: string;
    inCharge: string;
    pos: string;
    table: string;
  }[]
): void {
  const wsData = [
    ['ลำดับ', 'วันเวลาที่ได้รับ', 'ของรางวัล', 'รหัสพนักงาน', 'ชื่อ - นามสกุล', 'ฝ่าย / แผนก', 'ตำแหน่ง', 'หมายเลขโต๊ะ'],
    ...winners.map((w, idx) => [
      idx + 1,
      w.drawnAtStr || '-',
      w.prizeName,
      w.empId,
      w.name,
      w.inCharge || '-',
      w.pos || '-',
      w.table || '-',
    ]),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'LuckyDrawWinners');
  XLSX.writeFile(wb, `lucky_draw_winners_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
