/**
 * Code.gs — 가계부 Google Apps Script 백엔드
 *
 * ▶ 배포: 웹 앱으로 배포 (Execute as: Me / Anyone can access)
 * ▶ 모든 요청은 GET (URL 파라미터) 방식 사용 — CORS 우회
 *
 * Google Sheets 구조:
 *   ├── 담당인원          ← 복지사 담당 인원 목록
 *   ├── 2026-03          ← 2026년 3월 수입/지출 통합
 *   ├── 2026-04          ← 2026년 4월 (자동 생성)
 *   └── ...              ← 월별 자동 누적
 */

// ── 설정 ──────────────────────────────────────────────────
const SPREADSHEET_ID   = 'YOUR_SPREADSHEET_ID_HERE'; // ← Google Sheet ID 입력
const RESIDENT_SHEET   = '담당인원';
const MONTH_PATTERN    = /^\d{4}-\d{2}$/;

// ── 월별 시트 헤더 ─────────────────────────────────────────
const ENTRY_HEADERS = [
  'EntryType',    // EXPENSE | INCOME
  'EntryID',      // EXP-xxx | INC-xxx
  'ResidentID',   // RES-xxx
  'Date',         // YYYY-MM-DD
  'Name',         // 상호명(지출) 또는 출처(수입)
  'Category',     // 카테고리 코드
  'Amount',       // 금액 (숫자)
  'PaymentMethod',// 결제수단 (지출만)
  'Memo',         // 메모
  'InputType',    // manual | photo | qr | barcode
  'CreatedBy',    // 입력자 이름
  'CreatedAt',    // ISO 날짜시간
  'ModifiedAt',   // ISO 날짜시간
  'Status',       // Active | Deleted
];

const RESIDENT_HEADERS = [
  'ResidentID', 'Name', 'Team', 'StartDate',
  'Status', 'Memo', 'CreatedBy', 'CreatedAt', 'ModifiedAt',
];

// ============================================================
// HTTP 진입점
// ============================================================

function doGet(e) {
  try {
    const p      = e.parameter || {};
    const action = p.action;
    const data   = p.data ? JSON.parse(decodeURIComponent(p.data)) : {};
    const result = _route(action, data);
    return _ok(result);
  } catch (err) {
    return _err(err.message);
  }
}

// POST도 지원 (모바일 환경 대비)
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents || '{}');
    const result = _route(body.action, body);
    return _ok(result);
  } catch (err) {
    return _err(err.message);
  }
}

function _route(action, d) {
  switch (action) {
    // ── 담당 인원 ──
    case 'getResidents':   return getResidents();
    case 'addResident':    return addResident(d);
    case 'updateResident': return updateResident(d);
    case 'deleteResident': return deleteResident(d.id);

    // ── 수입/지출 항목 ──
    case 'getEntries':     return getEntries(d.residentId, d.yearMonth);
    case 'getAllMonths':    return getAllMonths(d.residentId);
    case 'getAll':         return getAll(d.residentId);   // 전체 월 데이터
    case 'addEntry':       return addEntry(d);
    case 'updateEntry':    return updateEntry(d);
    case 'deleteEntry':    return deleteEntry(d.id, d.yearMonth);

    // ── 설정 확인 ──
    case 'ping':           return { pong: true, time: new Date().toISOString() };

    default: throw new Error('Unknown action: ' + action);
  }
}

// ============================================================
// 응답 헬퍼
// ============================================================

function _ok(data) {
  const out = ContentService.createTextOutput(JSON.stringify({ ok: true, data }));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
function _err(msg) {
  const out = ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg }));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// ============================================================
// Spreadsheet 유틸
// ============================================================

function _ss()  { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function _getOrCreateSheet(name) {
  const ss    = _ss();
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = (name === RESIDENT_SHEET) ? RESIDENT_HEADERS : ENTRY_HEADERS;
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    // 헤더 행 스타일
    const hRange = sheet.getRange(1, 1, 1, headers.length);
    hRange.setBackground('#4A90D9').setFontColor('white').setFontWeight('bold');
    sheet.setColumnWidth(1, 100);
    if (name !== RESIDENT_SHEET) {
      sheet.setColumnWidth(5, 180); // Name 컬럼
      sheet.setColumnWidth(9, 180); // Memo
    }
  }
  return sheet;
}

/** 시트 → 객체 배열 (헤더 행 기준) */
function _sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[String(h)] = row[i]; });
    return obj;
  });
}

/** 행 번호 찾기 (1-based, 헤더 포함) */
function _findRowByField(sheet, fieldName, value) {
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const col     = headers.indexOf(fieldName);
  if (col < 0) return -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col]) === String(value)) return i + 1; // 1-based
  }
  return -1;
}

/** 특정 행의 여러 필드 업데이트 */
function _updateRowFields(sheet, rowNum, updates) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Object.entries(updates).forEach(([field, val]) => {
    const col = headers.indexOf(field);
    if (col >= 0) sheet.getRange(rowNum, col + 1).setValue(val);
  });
}

// ============================================================
// 담당 인원 CRUD
// ============================================================

function getResidents() {
  const sheet = _getOrCreateSheet(RESIDENT_SHEET);
  return _sheetToObjects(sheet);
}

function addResident(d) {
  const sheet = _getOrCreateSheet(RESIDENT_SHEET);
  const id    = 'RES-' + Date.now();
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, d.name || '', d.team || '', d.startDate || '',
    'Active', d.memo || '', d.createdBy || '', now, '',
  ]);
  return { id };
}

function updateResident(d) {
  const sheet  = _getOrCreateSheet(RESIDENT_SHEET);
  const rowNum = _findRowByField(sheet, 'ResidentID', d.id);
  if (rowNum < 0) throw new Error('Resident not found: ' + d.id);
  _updateRowFields(sheet, rowNum, {
    Name:       d.name,
    Team:       d.team,
    StartDate:  d.startDate,
    Status:     d.status,
    Memo:       d.memo,
    ModifiedAt: new Date().toISOString(),
  });
  return { updated: true };
}

function deleteResident(id) {
  return updateResident({ id, status: 'Deleted' });
}

// ============================================================
// 수입/지출 항목 CRUD
// ============================================================

/** 특정 월의 항목 조회 */
function getEntries(residentId, yearMonth) {
  const sheet = _ss().getSheetByName(yearMonth);
  if (!sheet) return [];
  const all = _sheetToObjects(sheet);
  return residentId
    ? all.filter(e => e.ResidentID === residentId && e.Status !== 'Deleted')
    : all.filter(e => e.Status !== 'Deleted');
}

/** 해당 인원의 데이터가 있는 월 목록 (최신순) */
function getAllMonths(residentId) {
  const sheets  = _ss().getSheets();
  const months  = [];
  sheets.forEach(s => {
    const name = s.getName();
    if (!MONTH_PATTERN.test(name)) return;
    if (residentId) {
      const rows = _sheetToObjects(s);
      if (rows.some(r => r.ResidentID === residentId && r.Status !== 'Deleted')) {
        months.push(name);
      }
    } else {
      months.push(name);
    }
  });
  return months.sort((a, b) => b.localeCompare(a)); // 최신순
}

/** 해당 인원의 전체 월 데이터 한 번에 조회 */
function getAll(residentId) {
  const months = getAllMonths(residentId);
  const result = {};
  months.forEach(ym => {
    result[ym] = getEntries(residentId, ym);
  });
  return result;
}

/** 항목 추가 — 날짜에서 월 탭 자동 결정 */
function addEntry(d) {
  if (!d.date) throw new Error('date is required');
  const yearMonth = d.date.slice(0, 7);          // 'YYYY-MM'
  const sheet     = _getOrCreateSheet(yearMonth); // 없으면 자동 생성
  const id        = (d.entryType === 'INCOME' ? 'INC-' : 'EXP-') + Date.now();
  const now       = new Date().toISOString();

  sheet.appendRow([
    d.entryType     || 'EXPENSE',
    id,
    d.residentId    || '',
    d.date,
    d.name          || '',  // 상호명 or 출처
    d.category      || '',
    Number(d.amount || 0),
    d.paymentMethod || '',
    d.memo          || '',
    d.inputType     || 'manual',
    d.createdBy     || '',
    now,
    '',
    'Active',
  ]);

  return { id, yearMonth };
}

/** 항목 수정 */
function updateEntry(d) {
  const yearMonth = d.yearMonth || (d.date ? d.date.slice(0, 7) : null);
  if (!yearMonth) throw new Error('yearMonth is required for update');

  const sheet  = _ss().getSheetByName(yearMonth);
  if (!sheet) throw new Error('Sheet not found: ' + yearMonth);

  const rowNum = _findRowByField(sheet, 'EntryID', d.id);
  if (rowNum < 0) throw new Error('Entry not found: ' + d.id);

  const updates = { ModifiedAt: new Date().toISOString() };
  if (d.date          !== undefined) updates.Date          = d.date;
  if (d.name          !== undefined) updates.Name          = d.name;
  if (d.category      !== undefined) updates.Category      = d.category;
  if (d.amount        !== undefined) updates.Amount        = Number(d.amount);
  if (d.paymentMethod !== undefined) updates.PaymentMethod = d.paymentMethod;
  if (d.memo          !== undefined) updates.Memo          = d.memo;
  if (d.status        !== undefined) updates.Status        = d.status;

  _updateRowFields(sheet, rowNum, updates);
  return { updated: true };
}

/** 논리적 삭제 */
function deleteEntry(id, yearMonth) {
  return updateEntry({ id, yearMonth, status: 'Deleted' });
}
