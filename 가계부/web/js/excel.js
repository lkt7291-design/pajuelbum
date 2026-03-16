/**
 * excel.js — SheetJS 기반 엑셀 내보내기 / 가져오기
 *
 * 내보내기 시트 구성:
 *   1. "{년}년{월}월"  → 인쇄용 월별 정산서
 *   2. "카테고리집계"  → 카테고리별 지출 요약
 *   3. "_백업"         → 전체 JSON 백업 (다른 기기로 가져오기 용)
 */

const CAT = {
  FOOD:      { name: '식비',       icon: '🍽️' },
  TRANSPORT: { name: '교통비',     icon: '🚌' },
  HOUSING:   { name: '주거/관리비', icon: '🏠' },
  HEALTH:    { name: '의료/건강',   icon: '💊' },
  EDUCATION: { name: '교육',       icon: '📚' },
  CULTURE:   { name: '문화/여가',   icon: '🎬' },
  SHOPPING:  { name: '쇼핑',       icon: '🛒' },
  FINANCE:   { name: '금융',       icon: '💰' },
  OTHER:     { name: '기타',       icon: '📌' },
};

const INC_CAT = {
  SALARY:    '급여/수당',
  ALLOWANCE: '용돈/지원금',
  BENEFIT:   '복지급여',
  OTHER:     '기타',
};

const Excel = {

  /* ============================================================
     월별 내역 내보내기 (인쇄용)
     ============================================================ */
  exportMonth() {
    const resident = App.state.currentResident;
    const ym = App.state.currentYearMonth; // 'YYYYMM'
    const year  = ym.slice(0, 4);
    const month = ym.slice(4, 6);
    const ymDash = `${year}-${month}`;

    const expenses  = DB.getExpensesByMonth(resident.id, ymDash)
                        .sort((a, b) => a.date.localeCompare(b.date));
    const incomeList = DB.getIncomeByMonth(resident.id, ymDash)
                         .sort((a, b) => a.date.localeCompare(b.date));

    const totalExp = expenses.reduce((s, e)  => s + Number(e.amount  || 0), 0);
    const totalInc = incomeList.reduce((s, i) => s + Number(i.amount || 0), 0);
    const balance  = totalInc - totalExp;

    const wb = XLSX.utils.book_new();

    /* ---- 시트 1: 월별 정산서 (인쇄용) ---- */
    const rows = [];

    // 제목 행
    rows.push([`가계부 — ${resident.name}  ${year}년 ${parseInt(month)}월`]);
    rows.push([`작성일: ${new Date().toLocaleDateString('ko-KR')}  |  작성자: ${DB.getUser()}`]);
    rows.push([]);

    // 요약 박스
    rows.push(['수입 합계', '', this._money(totalInc)]);
    rows.push(['지출 합계', '', this._money(totalExp)]);
    rows.push(['잔    액', '', this._money(balance)]);
    rows.push([]);

    // 지출 내역 테이블
    rows.push(['【 지출 내역 】']);
    rows.push(['날짜', '상호명', '카테고리', '금액', '결제수단', '메모', '입력자']);

    if (expenses.length > 0) {
      expenses.forEach(e => {
        rows.push([
          e.date,
          e.storeName,
          (CAT[e.category]?.name || e.category || ''),
          Number(e.amount || 0),
          e.paymentMethod || '',
          e.memo || '',
          e.createdBy || '',
        ]);
      });
      rows.push(['', '', '합계', totalExp, '', '', '']);
    } else {
      rows.push(['내역 없음']);
    }
    rows.push([]);

    // 수입 내역 테이블
    if (incomeList.length > 0) {
      rows.push(['【 수입 내역 】']);
      rows.push(['날짜', '출처', '카테고리', '금액', '메모', '입력자']);
      incomeList.forEach(i => {
        rows.push([
          i.date,
          i.source,
          (INC_CAT[i.category] || i.category || ''),
          Number(i.amount || 0),
          i.memo || '',
          i.createdBy || '',
        ]);
      });
      rows.push(['', '', '합계', totalInc, '', '']);
      rows.push([]);
    }

    // 카테고리별 소계
    rows.push(['【 카테고리별 지출 】']);
    rows.push(['카테고리', '금액', '비율']);
    const catMap = {};
    expenses.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount || 0);
    });
    Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amt]) => {
        const pct = totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) + '%' : '0%';
        rows.push([CAT[cat]?.name || cat, amt, pct]);
      });

    const ws1 = XLSX.utils.aoa_to_sheet(rows);

    // 열 너비
    ws1['!cols'] = [
      {wch: 12}, {wch: 22}, {wch: 14}, {wch: 12}, {wch: 10}, {wch: 22}, {wch: 10}
    ];
    // 제목 행 병합
    ws1['!merges'] = [
      { s:{r:0,c:0}, e:{r:0,c:6} },
      { s:{r:1,c:0}, e:{r:1,c:6} },
    ];

    XLSX.utils.book_append_sheet(wb, ws1, `${year}년${parseInt(month)}월`);

    /* ---- 시트 2: 카테고리 집계 ---- */
    const catRows = [
      [`카테고리별 지출 — ${year}년 ${parseInt(month)}월 — ${resident.name}`],
      [],
      ['카테고리', '금액', '비율', '건수'],
    ];
    const catCount = {};
    expenses.forEach(e => { catCount[e.category] = (catCount[e.category] || 0) + 1; });
    Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amt]) => {
        const pct = totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) + '%' : '0%';
        catRows.push([CAT[cat]?.name || cat, amt, pct, catCount[cat] || 0]);
      });
    catRows.push([]);
    catRows.push(['합계', totalExp, '100%', expenses.length]);

    const ws2 = XLSX.utils.aoa_to_sheet(catRows);
    ws2['!cols'] = [{wch:16},{wch:12},{wch:8},{wch:6}];
    ws2['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:3} }];
    XLSX.utils.book_append_sheet(wb, ws2, '카테고리집계');

    /* ---- 시트 3: JSON 백업 (병합 가져오기용) ---- */
    this._appendBackupSheet(wb);

    const fileName = `가계부_${resident.name}_${year}${month}.xlsx`;
    XLSX.writeFile(wb, fileName);
    App.toast(`📊 ${fileName} 저장 완료`);
  },

  /* ============================================================
     전체 데이터 내보내기 (관리자용)
     ============================================================ */
  exportAll() {
    const wb = XLSX.utils.book_new();

    // 담당 인원 시트
    const residents = DB.getResidents();
    if (residents.length > 0) {
      const ws = XLSX.utils.json_to_sheet(residents);
      XLSX.utils.book_append_sheet(wb, ws, '담당인원');
    }

    // 지출 전체
    const expenses = DB.getExpenses();
    if (expenses.length > 0) {
      const ws = XLSX.utils.json_to_sheet(expenses);
      XLSX.utils.book_append_sheet(wb, ws, '지출전체');
    }

    // 수입 전체
    const income = DB.getIncome();
    if (income.length > 0) {
      const ws = XLSX.utils.json_to_sheet(income);
      XLSX.utils.book_append_sheet(wb, ws, '수입전체');
    }

    // 백업 시트
    this._appendBackupSheet(wb);

    const fileName = `가계부_전체백업_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    App.toast(`📊 ${fileName} 저장 완료`);
  },

  /* ============================================================
     엑셀에서 데이터 가져오기 (병합)
     ============================================================ */
  importFromFile(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });

        // '_백업' 시트 찾기
        const backupName = wb.SheetNames.find(n => n === '_백업');
        if (!backupName) {
          App.toast('❌ 이 앱에서 내보낸 파일이 아닙니다', 'error');
          input.value = '';
          return;
        }

        const ws   = wb.Sheets[backupName];
        const rows = XLSX.utils.sheet_to_json(ws);
        if (!rows[0]?._json) throw new Error('백업 데이터 없음');

        const snapshot  = JSON.parse(rows[0]._json);
        const result    = DB.importData(snapshot);
        const total     = result.residents + result.expenses + result.income;

        App.toast(`✅ 가져오기 완료 (신규 ${total}건)`);
        App.renderResidentList();
      } catch (err) {
        console.error(err);
        App.toast('❌ 파일 읽기 오류: ' + err.message, 'error');
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  },

  /* ---- 내부 헬퍼 ---- */
  _appendBackupSheet(wb) {
    const snapshot = DB.exportSnapshot();
    const ws = XLSX.utils.json_to_sheet([{ _json: JSON.stringify(snapshot) }]);
    ws['!cols'] = [{wch: 200}];
    XLSX.utils.book_append_sheet(wb, ws, '_백업');
  },

  _money(n) {
    return '₩' + Number(n).toLocaleString('ko-KR');
  },
};
