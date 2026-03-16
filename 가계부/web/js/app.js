/**
 * app.js — 가계부 웹 앱 메인 로직
 *
 * 화면 목록:
 *   setup    — 최초 이름 설정
 *   select   — 담당 인원 선택
 *   home     — 선택 인원 가계부 홈 (월 요약 + 최근 내역)
 *   expense  — 지출 추가/수정
 *   income   — 수입 추가/수정
 *   list     — 전체 내역 목록
 *   admin    — 담당 인원 관리 + 데이터 관리
 */

/* ---- 카테고리 상수 ---- */
const CATEGORIES = {
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
const INC_CATS = { SALARY:'급여/수당', ALLOWANCE:'용돈/지원금', BENEFIT:'복지급여', OTHER:'기타' };

const App = {

  state: {
    currentScreen:   null,
    currentResident: null,
    currentYearMonth: '',    // 'YYYYMM'
    screenHistory:   [],
    editingExpenseId: null,
    editingIncomeId:  null,
  },

  /* ============================================================
     초기화
     ============================================================ */
  init() {
    const now = new Date();
    this.state.currentYearMonth =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    const user = DB.getUser();
    if (!user) {
      this.showScreen('setup');
    } else {
      document.getElementById('header-user').textContent = user;
      this.showScreen('select');
    }
  },

  /* ============================================================
     화면 전환
     ============================================================ */
  showScreen(name, opts = {}) {
    // 이전 화면 기록 (replace 옵션이 없을 때만)
    if (this.state.currentScreen && !opts.replace) {
      this.state.screenHistory.push(this.state.currentScreen);
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('active');

    this.state.currentScreen = name;
    this._updateHeader(name);

    // 화면별 렌더링
    const renders = {
      select:  () => this.renderResidentList(),
      home:    () => this.renderHome(),
      list:    () => { this._initListFilters(); this.renderList(); },
      admin:   () => this.renderAdmin(),
      expense: () => this._initExpenseForm(opts),
      income:  () => this._initIncomeForm(opts),
    };
    renders[name]?.();
  },

  goBack() {
    const prev = this.state.screenHistory.pop();
    if (prev) this.showScreen(prev, { replace: true });
  },

  _updateHeader(screen) {
    const titles = {
      setup:   '가계부',
      select:  '담당 인원 선택',
      home:    this.state.currentResident?.name || '가계부',
      list:    '내역 목록',
      admin:   '관리자',
      expense: this.state.editingExpenseId ? '지출 수정' : '지출 추가',
      income:  this.state.editingIncomeId  ? '수입 수정' : '수입 추가',
    };
    document.getElementById('header-title').textContent = titles[screen] || '가계부';

    const backScreens = ['home', 'list', 'admin', 'expense', 'income'];
    document.getElementById('btn-back').style.display =
      backScreens.includes(screen) ? 'block' : 'none';
  },

  /* ============================================================
     최초 설정
     ============================================================ */
  setup() {
    const name = document.getElementById('setup-name').value.trim();
    if (!name) { this.toast('이름을 입력해주세요'); return; }
    DB.setUser(name);
    document.getElementById('header-user').textContent = name;
    this.showScreen('select');
  },

  /* ============================================================
     담당 인원 선택 화면
     ============================================================ */
  renderResidentList(filter = '') {
    const residents = DB.getActiveResidents();
    const filtered  = filter
      ? residents.filter(r => r.name.includes(filter))
      : residents;

    const listEl = document.getElementById('resident-list');
    const emptyEl = document.getElementById('no-residents');

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';

    const now   = new Date();
    const ymDash = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    listEl.innerHTML = filtered.map(r => {
      const monthlyExp = DB.getExpensesByMonth(r.id, ymDash)
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      return `
        <div class="resident-card" onclick="App.selectResident('${r.id}')">
          <div class="resident-avatar">${r.name[0]}</div>
          <div class="resident-info">
            <div class="resident-name">${r.name}</div>
            <div class="resident-meta">${r.team || ''}${r.startDate ? ' · ' + r.startDate : ''}</div>
          </div>
          ${monthlyExp > 0
            ? `<div class="resident-amount">₩${monthlyExp.toLocaleString()}</div>`
            : ''}
        </div>`;
    }).join('');
  },

  filterResidents(val) { this.renderResidentList(val); },

  selectResident(id) {
    const r = DB.getResidentById(id);
    if (!r) return;
    this.state.currentResident = r;
    this.showScreen('home');
  },

  /* ============================================================
     홈 화면
     ============================================================ */
  renderHome() {
    const res    = this.state.currentResident;
    const ym     = this.state.currentYearMonth;
    const year   = ym.slice(0, 4);
    const month  = ym.slice(4, 6);
    const ymDash = `${year}-${month}`;

    document.getElementById('home-month-label').textContent =
      `${year}년 ${parseInt(month)}월`;

    const expenses  = DB.getExpensesByMonth(res.id, ymDash);
    const incomeList = DB.getIncomeByMonth(res.id, ymDash);
    const totalExp  = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalInc  = incomeList.reduce((s, i) => s + Number(i.amount || 0), 0);
    const balance   = totalInc - totalExp;

    // 요약
    document.getElementById('home-income').textContent  = '₩' + totalInc.toLocaleString();
    document.getElementById('home-expense').textContent = '₩' + totalExp.toLocaleString();
    const balEl = document.getElementById('home-balance');
    balEl.textContent  = '₩' + Math.abs(balance).toLocaleString() + (balance < 0 ? ' 초과' : '');
    balEl.className    = 'summary-amount bold ' + (balance >= 0 ? 'income' : 'expense');

    // 카테고리별 요약
    const catMap = {};
    expenses.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount || 0);
    });
    const catEl = document.getElementById('home-categories');
    if (Object.keys(catMap).length > 0) {
      const maxAmt = Math.max(...Object.values(catMap));
      catEl.style.display = 'block';
      catEl.innerHTML = Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => {
          const pct = Math.round((amt / maxAmt) * 100);
          return `
            <div class="category-row">
              <span class="cat-icon">${CATEGORIES[cat]?.icon || '📌'}</span>
              <span class="cat-name">${CATEGORIES[cat]?.name || cat}</span>
              <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%"></div></div>
              <span class="cat-amount">₩${Number(amt).toLocaleString()}</span>
            </div>`;
        }).join('');
    } else {
      catEl.style.display = 'none';
    }

    // 최근 내역 (최대 8건)
    const allItems = [
      ...expenses.map(e => ({ ...e, _type: 'expense' })),
      ...incomeList.map(i => ({ ...i, _type: 'income' })),
    ].sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date));

    document.getElementById('home-recent').innerHTML =
      allItems.slice(0, 8).map(item => this._renderItem(item)).join('') ||
      '<div style="text-align:center;padding:24px;color:var(--text-light)">이달 내역이 없습니다</div>';
  },

  prevMonth() {
    const ym = this.state.currentYearMonth;
    const d  = new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6)) - 2, 1);
    this.state.currentYearMonth =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.renderHome();
  },

  nextMonth() {
    const ym = this.state.currentYearMonth;
    const d  = new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6)), 1);
    this.state.currentYearMonth =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.renderHome();
  },

  /* ============================================================
     내역 목록 화면
     ============================================================ */
  _initListFilters() {
    const sel = document.getElementById('list-month-filter');
    if (sel.children.length > 0) return; // 이미 초기화됨

    const months = DB.getAvailableMonths(this.state.currentResident.id);
    // 현재 월이 목록에 없으면 추가
    const curDash = this.state.currentYearMonth.slice(0,4) + '-' +
                    this.state.currentYearMonth.slice(4,6);
    if (!months.includes(curDash)) months.unshift(curDash);

    sel.innerHTML = months.map(m => {
      const val = m.replace('-', '');
      const selected = val === this.state.currentYearMonth ? 'selected' : '';
      return `<option value="${val}" ${selected}>${m.slice(0,4)}년 ${parseInt(m.slice(5,7))}월</option>`;
    }).join('');
  },

  renderList() {
    const res    = this.state.currentResident;
    const ym     = document.getElementById('list-month-filter').value || this.state.currentYearMonth;
    const year   = ym.slice(0, 4);
    const month  = ym.slice(4, 6);
    const ymDash = `${year}-${month}`;
    const catFilter = document.getElementById('list-category-filter').value;

    let expenses   = DB.getExpensesByMonth(res.id, ymDash);
    const incomeList = DB.getIncomeByMonth(res.id, ymDash);

    if (catFilter) expenses = expenses.filter(e => e.category === catFilter);

    const totalExp = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalInc = catFilter ? 0 : incomeList.reduce((s, i) => s + Number(i.amount || 0), 0);

    document.getElementById('list-summary').textContent =
      `지출 ₩${totalExp.toLocaleString()}  |  수입 ₩${totalInc.toLocaleString()}`;

    const allItems = [
      ...expenses.map(e => ({ ...e, _type: 'expense' })),
      ...(catFilter ? [] : incomeList.map(i => ({ ...i, _type: 'income' }))),
    ].sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      return dateCmp !== 0 ? dateCmp : (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    const listEl  = document.getElementById('expense-list');
    const emptyEl = document.getElementById('no-expenses');

    if (allItems.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
    } else {
      emptyEl.style.display = 'none';
      listEl.innerHTML = allItems.map(item => this._renderItem(item)).join('');
    }
  },

  /* ============================================================
     내역 아이템 렌더링 (공용)
     ============================================================ */
  _renderItem(item) {
    const isIncome = item._type === 'income';
    const icon     = isIncome ? '💵' : (CATEGORIES[item.category]?.icon || '📌');
    const name     = isIncome ? (item.source || '수입') : (item.storeName || '');
    const catName  = isIncome
      ? (INC_CATS[item.category] || item.category || '')
      : (CATEGORIES[item.category]?.name || item.category || '');
    const amtStr   = (isIncome ? '+' : '-') + '₩' + Number(item.amount || 0).toLocaleString();
    const clickFn  = isIncome
      ? `App.editIncome('${item.id}')`
      : `App.editExpense('${item.id}')`;

    return `
      <div class="item-card" onclick="${clickFn}">
        <div class="item-icon ${isIncome ? 'income-icon' : ''}">${icon}</div>
        <div class="item-info">
          <div class="item-name">${name}</div>
          <div class="item-meta">${item.date} · ${catName}${item.createdBy ? ' · ' + item.createdBy : ''}</div>
        </div>
        <div class="item-amount ${isIncome ? 'income' : ''}">${amtStr}</div>
      </div>`;
  },

  /* ============================================================
     지출 추가 / 수정
     ============================================================ */
  showAddExpense(mode = 'manual') {
    this.state.editingExpenseId = null;
    this.showScreen('expense', { mode });
  },

  editExpense(id) {
    this.state.editingExpenseId = id;
    this.showScreen('expense', { editId: id });
  },

  _initExpenseForm(opts) {
    document.getElementById('expense-form').reset();
    document.getElementById('expense-id').value = '';
    document.getElementById('receipt-preview-area').style.display = 'none';
    document.getElementById('btn-delete-expense').style.display = 'none';
    document.querySelector('input[name="payment"][value="카드"]').checked = true;

    if (opts.editId) {
      /* 수정 모드 */
      const e = DB.getExpenseById(opts.editId);
      if (!e) return;
      document.getElementById('expense-id').value        = e.id;
      document.getElementById('expense-date').value      = e.date;
      document.getElementById('expense-store').value     = e.storeName;
      document.getElementById('expense-amount').value    = e.amount;
      document.getElementById('expense-category').value  = e.category;
      document.getElementById('expense-memo').value      = e.memo || '';
      const radio = document.querySelector(`input[name="payment"][value="${e.paymentMethod}"]`);
      if (radio) radio.checked = true;
      document.getElementById('btn-delete-expense').style.display = 'block';

    } else {
      /* 신규 모드 */
      document.getElementById('expense-date').value = new Date().toISOString().slice(0, 10);

      if (opts.mode === 'photo') {
        // 카메라/파일 열기
        document.getElementById('receipt-file').click();
      }
      if (opts.scanData) {
        // QR/바코드 스캔 결과 미리 채우기
        if (opts.scanData.storeName)
          document.getElementById('expense-store').value = opts.scanData.storeName;
        if (opts.scanData.amount)
          document.getElementById('expense-amount').value = opts.scanData.amount;
        if (opts.scanData.date)
          document.getElementById('expense-date').value = opts.scanData.date;
        if (opts.scanData.memo)
          document.getElementById('expense-memo').value = opts.scanData.memo;
      }
    }
  },

  handleReceiptFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('receipt-img').src = e.target.result;
      document.getElementById('receipt-preview-area').style.display = 'block';
    };
    reader.readAsDataURL(file);
  },

  saveExpense(event) {
    event.preventDefault();
    const id            = document.getElementById('expense-id').value;
    const date          = document.getElementById('expense-date').value;
    const storeName     = document.getElementById('expense-store').value.trim();
    const amount        = Number(document.getElementById('expense-amount').value);
    const category      = document.getElementById('expense-category').value;
    const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || '카드';
    const memo          = document.getElementById('expense-memo').value.trim();

    if (!date || !storeName || !amount || !category) {
      this.toast('날짜, 상호명, 금액, 카테고리는 필수 입력입니다');
      return;
    }

    const data = {
      residentId: this.state.currentResident.id,
      date, storeName, amount, category, paymentMethod, memo,
    };

    if (id) {
      DB.updateExpense(id, data);
      this.toast('✅ 수정되었습니다');
    } else {
      DB.addExpense(data);
      this.toast('✅ 저장되었습니다');
    }
    this.goBack();
  },

  deleteExpense() {
    const id = document.getElementById('expense-id').value;
    if (!id || !confirm('이 지출 항목을 삭제하시겠습니까?')) return;
    DB.deleteExpense(id);
    this.toast('삭제되었습니다');
    this.goBack();
  },

  /* ============================================================
     수입 추가 / 수정
     ============================================================ */
  showAddIncome() {
    this.state.editingIncomeId = null;
    this.showScreen('income', {});
  },

  editIncome(id) {
    this.state.editingIncomeId = id;
    this.showScreen('income', { editId: id });
  },

  _initIncomeForm(opts) {
    document.getElementById('income-form').reset();
    document.getElementById('income-id').value    = '';
    document.getElementById('btn-delete-income').style.display = 'none';
    document.getElementById('income-date').value  = new Date().toISOString().slice(0, 10);

    if (opts.editId) {
      const i = DB.getIncomeById(opts.editId);
      if (!i) return;
      document.getElementById('income-id').value       = i.id;
      document.getElementById('income-date').value     = i.date;
      document.getElementById('income-source').value   = i.source;
      document.getElementById('income-amount').value   = i.amount;
      document.getElementById('income-category').value = i.category;
      document.getElementById('income-memo').value     = i.memo || '';
      document.getElementById('btn-delete-income').style.display = 'block';
    }
  },

  saveIncome(event) {
    event.preventDefault();
    const id       = document.getElementById('income-id').value;
    const date     = document.getElementById('income-date').value;
    const source   = document.getElementById('income-source').value.trim();
    const amount   = Number(document.getElementById('income-amount').value);
    const category = document.getElementById('income-category').value;
    const memo     = document.getElementById('income-memo').value.trim();

    if (!date || !source || !amount) {
      this.toast('날짜, 출처, 금액은 필수 입력입니다');
      return;
    }

    const data = { residentId: this.state.currentResident.id, date, source, amount, category, memo };

    if (id) { DB.updateIncome(id, data); this.toast('✅ 수정되었습니다'); }
    else    { DB.addIncome(data);        this.toast('✅ 저장되었습니다'); }
    this.goBack();
  },

  deleteIncome() {
    const id = document.getElementById('income-id').value;
    if (!id || !confirm('이 수입 항목을 삭제하시겠습니까?')) return;
    DB.deleteIncome(id);
    this.toast('삭제되었습니다');
    this.goBack();
  },

  /* ============================================================
     QR / 바코드 스캔
     ============================================================ */
  showScanner() {
    Scanner.start((text, format) => {
      // QR 또는 URL이면 현금영수증 링크로 처리
      if (text.startsWith('http') || String(format).includes('QR')) {
        this.toast('QR 인식 완료');
        this.showAddExpense('manual');
        setTimeout(() => {
          document.getElementById('expense-memo').value = 'QR: ' + text;
        }, 300);
      } else {
        // 상품 바코드
        this.toast('바코드: ' + text);
        this.showAddExpense('manual');
        setTimeout(() => {
          document.getElementById('expense-memo').value = '바코드: ' + text;
        }, 300);
      }
    });
  },

  /* ============================================================
     관리자 화면
     ============================================================ */
  renderAdmin() {
    const residents = DB.getResidents();
    const listEl    = document.getElementById('admin-resident-list');

    if (residents.length === 0) {
      listEl.innerHTML =
        '<div class="empty-state"><div class="empty-icon">👤</div><p>등록된 인원이 없습니다</p></div>';
      return;
    }

    listEl.innerHTML = residents.map(r => `
      <div class="admin-item">
        <div class="resident-avatar" style="${r.status === 'Deleted' ? 'opacity:0.4' : ''}">${r.name[0]}</div>
        <div class="admin-item-info">
          <div class="admin-item-name">${r.name} ${r.status === 'Deleted' ? '<span style="font-size:12px;color:var(--text-light)">(비활성)</span>' : ''}</div>
          <div class="admin-item-meta">${r.team || '팀 미지정'}${r.startDate ? '  ·  ' + r.startDate + ' 시작' : ''}</div>
        </div>
        <div class="admin-item-actions">
          <button class="btn btn-sm btn-outline" onclick="App.showEditResident('${r.id}')">수정</button>
          ${r.status === 'Active'
            ? `<button class="btn btn-sm btn-danger-outline" onclick="App.deactivateResident('${r.id}')">비활성</button>`
            : ''}
        </div>
      </div>`
    ).join('');
  },

  showAddResident() {
    document.getElementById('modal-resident-title').textContent = '인원 추가';
    document.getElementById('resident-edit-id').value  = '';
    document.getElementById('resident-name').value     = '';
    document.getElementById('resident-team').value     = '';
    document.getElementById('resident-start').value    = new Date().toISOString().slice(0, 10);
    document.getElementById('resident-memo').value     = '';
    document.getElementById('modal-resident').style.display = 'flex';
    document.getElementById('resident-name').focus();
  },

  showEditResident(id) {
    const r = DB.getResidentById(id);
    if (!r) return;
    document.getElementById('modal-resident-title').textContent = '인원 수정';
    document.getElementById('resident-edit-id').value  = r.id;
    document.getElementById('resident-name').value     = r.name;
    document.getElementById('resident-team').value     = r.team || '';
    document.getElementById('resident-start').value    = r.startDate || '';
    document.getElementById('resident-memo').value     = r.memo || '';
    document.getElementById('modal-resident').style.display = 'flex';
  },

  saveResident() {
    const id   = document.getElementById('resident-edit-id').value;
    const name = document.getElementById('resident-name').value.trim();
    if (!name) { this.toast('이름을 입력해주세요'); return; }

    const data = {
      name,
      team:      document.getElementById('resident-team').value.trim(),
      startDate: document.getElementById('resident-start').value,
      memo:      document.getElementById('resident-memo').value.trim(),
    };

    if (id) { DB.updateResident(id, data); this.toast('✅ 수정되었습니다'); }
    else    { DB.addResident(data);        this.toast('✅ 추가되었습니다'); }

    this.closeModal('resident');
    this.renderAdmin();
    this.renderResidentList();
  },

  deactivateResident(id) {
    if (!confirm('이 인원을 비활성 처리하시겠습니까?\n(데이터는 보존됩니다)')) return;
    DB.deleteResident(id);
    this.renderAdmin();
    this.renderResidentList();
    this.toast('비활성 처리되었습니다');
  },

  /* ============================================================
     모달
     ============================================================ */
  closeModal(name) {
    document.getElementById(`modal-${name}`).style.display = 'none';
  },

  /* ============================================================
     데이터 초기화
     ============================================================ */
  confirmClearData() {
    if (!confirm('모든 데이터를 삭제합니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    if (!confirm('⚠️ 정말로 전체 삭제하시겠습니까?')) return;
    DB.clearAll();
    this.toast('데이터가 초기화되었습니다');
    setTimeout(() => location.reload(), 1000);
  },

  /* ============================================================
     토스트 알림
     ============================================================ */
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2500);
  },
};

/* 앱 시작 */
document.addEventListener('DOMContentLoaded', () => App.init());
