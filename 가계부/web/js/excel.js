/**
 * excel.js — SheetJS 기반 엑셀 내보내기
 *
 * exportMonth()     — 현재 월 단일 시트 내보내기 (인쇄용 정산서)
 * exportAllMonths() — 전체 월별 시트 내보내기 (월별 탭 누적)
 *
 * Google Sheets 필드명 (대문자):
 *   EntryType, EntryID, ResidentID, Date, Name, Category,
 *   Amount, PaymentMethod, Memo, InputType, CreatedBy,
 *   CreatedAt, ModifiedAt, Status
 */

const CAT = {
  FOOD:      '식비',
  TRANSPORT: '교통비',
  HOUSING:   '주거/관리비',
  HEALTH:    '의료/건강',
  EDUCATION: '교육',
  CULTURE:   '문화/여가',
  SHOPPING:  '쇼핑',
  FINANCE:   '금융',
  OTHER:     '기타',
};

const INC_CAT = {
  SALARY:    '급여/수당',
  ALLOWANCE: '용돈/지원금',
  BENEFIT:   '복지급여',
  OTHER:     '기타',
};

const Excel = {

  /* ============================================================
     현재 월 내보내기 (인쇄용 정산서)
     ============================================================ */
  async exportMonth() {
    const resident = App.state.currentResident;
    const ym = App.state.currentYearMonth;       // 'YYYYMM'
    const year  = ym.slice(0, 4);
    const month = ym.slice(4, 6);
    const ymDash = `${year}-${month}`;           // 'YYYY-MM'

    App.showLoading('엑셀 생성 중…');
    let entries;
    try {
      entries = await API.getEntries(resident.ResidentID, ymDash);
    } catch (err) {
      App.hideLoading();
      App.toast('❌ 데이터 로드 실패: ' + err.message, 'error');
      return;
    }
    App.hideLoading();

    const active   = (entries || []).filter(e => e.Status !== 'Deleted');
    const expenses = active.filter(e => e.EntryType === 'EXPENSE')
                           .sort((a, b) => a.Date.localeCompare(b.Date));
    const income   = active.filter(e => e.EntryType === 'INCOME')
                           .sort((a, b) => a.Date.localeCompare(b.Date));

    const wb = XLSX.utils.book_new();
    const sheetName = `${year}년${parseInt(month)}월`;
    const ws = this._buildMonthSheet(resident, year, month, expenses, income);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const fileName = `가계부_${resident.Name}_${year}${month}.xlsx`;
    XLSX.writeFile(wb, fileName);
    App.toast(`📊 ${fileName} 저장 완료`);
  },

  /* ============================================================
     전체 월별 내보내기 (월별 탭 누적)
     ============================================================ */
  async exportAllMonths() {
    const resident = App.state.currentResident;

    App.showLoading('전체 데이터 불러오는 중…');
    let allData;
    try {
      allData = await API.getAll(resident.ResidentID);
    } catch (err) {
      App.hideLoading();
      App.toast('❌ 데이터 로드 실패: ' + err.message, 'error');
      return;
    }
    App.hideLoading();

    // allData: { 'YYYY-MM': [...entries], ... }
    const months = Object.keys(allData).sort();
    if (months.length === 0) {
      App.toast('내보낼 데이터가 없습니다', 'error');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 요약 시트 (전체 기간)
    const summaryRows = this._buildSummaryRows(resident, months, allData);
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{wch:16},{wch:14},{wch:14},{wch:14}];
    wsSummary['!merges'] = [
      { s:{r:0,c:0}, e:{r:0,c:3} },
      { s:{r:1,c:0}, e:{r:1,c:3} },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, '전체요약');

    // 월별 시트
    for (const ymDash of months) {
      const [year, month] = ymDash.split('-');
      const active   = (allData[ymDash] || []).filter(e => e.Status !== 'Deleted');
      const expenses = active.filter(e => e.EntryType === 'EXPENSE')
                             .sort((a, b) => a.Date.localeCompare(b.Date));
      const incomeList = active.filter(e => e.EntryType === 'INCOME')
                               .sort((a, b) => a.Date.localeCompare(b.Date));

      const ws = this._buildMonthSheet(resident, year, month, expenses, incomeList);
      const sheetName = `${year}년${parseInt(month)}월`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const today = new Date().toISOString().slice(0, 10);
    const fileName = `가계부_${resident.Name}_전체_${today}.xlsx`;
    XLSX.writeFile(wb, fileName);
    App.toast(`📊 ${fileName} 저장 완료 (${months.length}개월)`);
  },

  /* ============================================================
     내부: 월별 정산서 시트 생성
     ============================================================ */
  _buildMonthSheet(resident, year, month, expenses, income) {
    const totalExp = expenses.reduce((s, e)  => s + Number(e.Amount || 0), 0);
    const totalInc = income.reduce((s, i)    => s + Number(i.Amount || 0), 0);
    const balance  = totalInc - totalExp;
    const user     = localStorage.getItem('gb_user') || '';

    const rows = [];

    // 제목
    rows.push([`가계부 — ${resident.Name}  ${year}년 ${parseInt(month)}월`]);
    rows.push([`작성일: ${new Date().toLocaleDateString('ko-KR')}  |  작성자: ${user}`]);
    rows.push([]);

    // 요약
    rows.push(['수입 합계', '', this._money(totalInc)]);
    rows.push(['지출 합계', '', this._money(totalExp)]);
    rows.push(['잔    액', '', this._money(balance)]);
    rows.push([]);

    // 지출 내역
    rows.push(['【 지출 내역 】']);
    rows.push(['날짜', '상호명', '카테고리', '금액', '결제수단', '메모', '입력자']);
    if (expenses.length > 0) {
      expenses.forEach(e => {
        rows.push([
          e.Date,
          e.Name || '',
          CAT[e.Category] || e.Category || '',
          Number(e.Amount || 0),
          e.PaymentMethod || '',
          e.Memo || '',
          e.CreatedBy || '',
        ]);
      });
      rows.push(['', '', '합계', totalExp, '', '', '']);
    } else {
      rows.push(['내역 없음']);
    }
    rows.push([]);

    // 수입 내역
    if (income.length > 0) {
      rows.push(['【 수입 내역 】']);
      rows.push(['날짜', '출처', '카테고리', '금액', '메모', '입력자']);
      income.forEach(i => {
        rows.push([
          i.Date,
          i.Name || '',
          INC_CAT[i.Category] || i.Category || '',
          Number(i.Amount || 0),
          i.Memo || '',
          i.CreatedBy || '',
        ]);
      });
      rows.push(['', '', '합계', totalInc, '', '']);
      rows.push([]);
    }

    // 카테고리별 지출 소계
    rows.push(['【 카테고리별 지출 】']);
    rows.push(['카테고리', '금액', '비율']);
    const catMap = {};
    expenses.forEach(e => {
      catMap[e.Category] = (catMap[e.Category] || 0) + Number(e.Amount || 0);
    });
    Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amt]) => {
        const pct = totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) + '%' : '0%';
        rows.push([CAT[cat] || cat, amt, pct]);
      });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      {wch:12}, {wch:22}, {wch:14}, {wch:12}, {wch:10}, {wch:22}, {wch:10}
    ];
    ws['!merges'] = [
      { s:{r:0,c:0}, e:{r:0,c:6} },
      { s:{r:1,c:0}, e:{r:1,c:6} },
    ];
    return ws;
  },

  /* ============================================================
     내부: 전체 요약 시트 생성
     ============================================================ */
  _buildSummaryRows(resident, months, allData) {
    const rows = [];
    rows.push([`가계부 전체 요약 — ${resident.Name}`]);
    rows.push([`작성일: ${new Date().toLocaleDateString('ko-KR')}`]);
    rows.push([]);
    rows.push(['월', '수입', '지출', '잔액']);

    let grandInc = 0, grandExp = 0;
    for (const ymDash of months) {
      const [year, month] = ymDash.split('-');
      const active = (allData[ymDash] || []).filter(e => e.Status !== 'Deleted');
      const totalInc = active.filter(e => e.EntryType === 'INCOME')
                             .reduce((s, i) => s + Number(i.Amount || 0), 0);
      const totalExp = active.filter(e => e.EntryType === 'EXPENSE')
                             .reduce((s, e) => s + Number(e.Amount || 0), 0);
      grandInc += totalInc;
      grandExp += totalExp;
      rows.push([`${year}년 ${parseInt(month)}월`, totalInc, totalExp, totalInc - totalExp]);
    }
    rows.push([]);
    rows.push(['합계', grandInc, grandExp, grandInc - grandExp]);
    return rows;
  },

  _money(n) {
    return '₩' + Number(n).toLocaleString('ko-KR');
  },
};
