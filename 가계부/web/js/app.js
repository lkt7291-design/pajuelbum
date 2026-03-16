/**
 * app.js — 가계부 웹 앱 메인 로직 (Google Sheets 연동 버전)
 *
 * 모든 데이터 조작은 API (Google Apps Script) 경유
 * 비동기 처리: async / await + 로딩 오버레이
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
const USER_KEY = 'gb_user';

const App = {

  state: {
    currentScreen:    null,
    currentResident:  null,
    currentYearMonth: '',       // 'YYYYMM'
    currentEntries:   [],       // 현재 월 로드된 항목들
    allResidents:     [],       // 전체 인원 캐시
    availableMonths:  [],       // 해당 인원의 월 목록 캐시
    screenHistory:    [],
    editingEntry:     null,     // { id, yearMonth, type }
  },

  /* ============================================================
     초기화
     ============================================================ */
  init() {
    const now = new Date();
    this.state.currentYearMonth =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!API.isConfigured()) {
      this.showScreen('setup');
    } else {
      document.getElementById('header-title').textContent =
        localStorage.getItem(USER_KEY) || '가계부';
      this.showScreen('select');
    }
  },

  /* ============================================================
     로딩
     ============================================================ */
  showLoading(msg = '처리 중...') {
    document.getElementById('loading-msg').textContent = msg;
    document.getElementById('loading-overlay').style.display = 'flex';
  },
  hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
  },

  /* ============================================================
     화면 전환
     ============================================================ */
  showScreen(name, opts = {}) {
    if (this.state.currentScreen && !opts.replace) {
      this.state.screenHistory.push(this.state.currentScreen);
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('active');
    this.state.currentScreen = name;
    this._updateHeader(name);

    const inits = {
      select:   () => this.loadResidents(),
      home:     () => this.loadHome(),
      list:     () => this.loadList(),
      admin:    () => this.loadAdmin(),
      settings: () => this._initSettings(),
      expense:  () => this._initExpenseForm(opts),
      income:   () => this._initIncomeForm(opts),
    };
    inits[name]?.();
  },

  goBack() {
    const prev = this.state.screenHistory.pop();
    if (prev) this.showScreen(prev, { replace: true });
  },

  _updateHeader(screen) {
    const titles = {
      setup:    '가계부 설정',
      settings: '설정',
      select:   '담당 인원 선택',
      home:     this.state.currentResident?.Name || '가계부',
      list:     '내역 목록',
      admin:    '관리자',
      expense:  this.state.editingEntry ? '지출 수정' : '지출 추가',
      income:   this.state.editingEntry ? '수입 수정' : '수입 추가',
    };
    document.getElementById('header-title').textContent = titles[screen] || '가계부';
    const backScreens = ['home', 'list', 'admin', 'expense', 'income', 'settings'];
    document.getElementById('btn-back').style.display =
      backScreens.includes(screen) ? 'block' : 'none';
    document.getElementById('btn-settings').style.display =
      ['setup', 'settings'].includes(screen) ? 'none' : 'block';
  },

  /* ============================================================
     초기 설정
     ============================================================ */
  async setup() {
    const url  = document.getElementById('setup-url').value.trim();
    const name = document.getElementById('setup-name').value.trim();
    if (!url || !name) { this.toast('URL과 이름을 모두 입력해주세요'); return; }

    API.setUrl(url);
    this.showLoading('서버 연결 테스트 중...');
    try {
      await API.ping();
      localStorage.setItem(USER_KEY, name);
      document.getElementById('header-title').textContent = name;
      this.toast('✅ 연결 성공!');
      this.showScreen('select', { replace: true });
    } catch (e) {
      this.toast('❌ 연결 실패: ' + e.message, 'error');
    } finally {
      this.hideLoading();
    }
  },

  _initSettings() {
    document.getElementById('settings-url').value  = API.getUrl();
    document.getElementById('settings-name').value = localStorage.getItem(USER_KEY) || '';
  },

  saveSettings() {
    const url  = document.getElementById('settings-url').value.trim();
    const name = document.getElementById('settings-name').value.trim();
    if (!url || !name) { this.toast('URL과 이름을 입력해주세요'); return; }
    API.setUrl(url);
    localStorage.setItem(USER_KEY, name);
    this.toast('✅ 설정이 저장되었습니다');
    this.goBack();
  },

  async testConnection() {
    this.showLoading('연결 테스트 중...');
    try {
      const r = await API.ping();
      this.toast(`✅ 연결 성공 (${r.time?.slice(0,19) || ''})`);
    } catch (e) {
      this.toast('❌ 연결 실패: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  /* ============================================================
     담당 인원 선택
     ============================================================ */
  async loadResidents() {
    this.showLoading('인원 목록 로드 중...');
    try {
      const residents = await API.getResidents();
      this.state.allResidents = residents;
      this.renderResidentList();
    } catch (e) {
      this.toast('❌ 인원 로드 실패: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  renderResidentList(filter = '') {
    const active   = this.state.allResidents.filter(r => r.Status === 'Active');
    const filtered = filter ? active.filter(r => r.Name.includes(filter)) : active;
    const listEl   = document.getElementById('resident-list');
    const emptyEl  = document.getElementById('no-residents');

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';
    listEl.innerHTML = filtered.map(r => `
      <div class="resident-card" onclick="App.selectResident('${r.ResidentID}')">
        <div class="resident-avatar">${(r.Name || '?')[0]}</div>
        <div class="resident-info">
          <div class="resident-name">${r.Name}</div>
          <div class="resident-meta">${r.Team || ''}${r.StartDate ? ' · ' + r.StartDate : ''}</div>
        </div>
        <div style="font-size:20px;color:var(--text-light)">›</div>
      </div>`).join('');
  },

  filterResidents(val) { this.renderResidentList(val); },

  async selectResident(id) {
    const r = this.state.allResidents.find(x => x.ResidentID === id);
    if (!r) return;
    this.state.currentResident = r;
    this.showScreen('home');
  },

  /* ============================================================
     홈 화면
     ============================================================ */
  async loadHome() {
    const res    = this.state.currentResident;
    const ym     = this.state.currentYearMonth;
    const year   = ym.slice(0, 4);
    const month  = ym.slice(4, 6);
    const ymDash = `${year}-${month}`;

    document.getElementById('home-month-label').textContent =
      `${year}년 ${parseInt(month)}월`;

    this.showLoading('데이터 로드 중...');
    try {
      const entries = await API.getEntries(res.ResidentID, ymDash);
      this.state.currentEntries = entries;

      // 월 목록 갱신 (비동기, 기다리지 않음)
      API.getAllMonths(res.ResidentID).then(months => {
        this.state.availableMonths = months;
      }).catch(() => {});

      this._renderHomeSummary(entries);
    } catch (e) {
      this.toast('❌ 로드 실패: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  _renderHomeSummary(entries) {
    const expenses   = entries.filter(e => e.EntryType === 'EXPENSE');
    const incomeList = entries.filter(e => e.EntryType === 'INCOME');
    const totalExp   = expenses.reduce((s, e) => s + Number(e.Amount  || 0), 0);
    const totalInc   = incomeList.reduce((s, i) => s + Number(i.Amount || 0), 0);
    const balance    = totalInc - totalExp;

    document.getElementById('home-income').textContent  = '₩' + totalInc.toLocaleString();
    document.getElementById('home-expense').textContent = '₩' + totalExp.toLocaleString();
    const balEl = document.getElementById('home-balance');
    balEl.textContent = (balance < 0 ? '-₩' : '₩') + Math.abs(balance).toLocaleString();
    balEl.className   = 'summary-amount bold ' + (balance >= 0 ? 'income' : 'expense');

    // 카테고리 바 차트
    const catMap = {};
    expenses.forEach(e => { catMap[e.Category] = (catMap[e.Category] || 0) + Number(e.Amount || 0); });
    const catEl = document.getElementById('home-categories');
    if (Object.keys(catMap).length > 0) {
      const maxAmt = Math.max(...Object.values(catMap));
      catEl.style.display = 'block';
      catEl.innerHTML = Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => {
          const pct = Math.round((amt / maxAmt) * 100);
          return `<div class="category-row">
            <span class="cat-icon">${CATEGORIES[cat]?.icon || '📌'}</span>
            <span class="cat-name">${CATEGORIES[cat]?.name || cat}</span>
            <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%"></div></div>
            <span class="cat-amount">₩${Number(amt).toLocaleString()}</span>
          </div>`;
        }).join('');
    } else {
      catEl.style.display = 'none';
    }

    // 최근 내역 (최신 8건)
    const all = [...entries].sort((a, b) =>
      (b.CreatedAt || b.Date || '').localeCompare(a.CreatedAt || a.Date || ''));
    document.getElementById('home-recent').innerHTML =
      all.slice(0, 8).map(item => this._renderItem(item)).join('') ||
      '<div style="text-align:center;padding:24px;color:var(--text-light)">이달 내역이 없습니다</div>';
  },

  prevMonth() {
    const ym = this.state.currentYearMonth;
    const d  = new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6)) - 2, 1);
    this.state.currentYearMonth =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.loadHome();
  },

  nextMonth() {
    const ym = this.state.currentYearMonth;
    const d  = new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6)), 1);
    this.state.currentYearMonth =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.loadHome();
  },

  /* ============================================================
     내역 목록
     ============================================================ */
  async loadList() {
    const res = this.state.currentResident;

    // 월 필터 셀렉트 초기화
    const sel = document.getElementById('list-month-filter');
    if (sel.children.length === 0) {
      const months = this.state.availableMonths.length
        ? this.state.availableMonths
        : await API.getAllMonths(res.ResidentID);
      this.state.availableMonths = months;

      const curDash = this.state.currentYearMonth.slice(0,4) + '-' +
                      this.state.currentYearMonth.slice(4,6);
      if (!months.includes(curDash)) months.unshift(curDash);

      sel.innerHTML = months.map(m => {
        const val      = m.replace('-', '');
        const selected = val === this.state.currentYearMonth ? 'selected' : '';
        return `<option value="${val}" ${selected}>${m.slice(0,4)}년 ${parseInt(m.slice(5,7))}월</option>`;
      }).join('');
    }

    await this.renderList();
  },

  async renderList() {
    const res    = this.state.currentResident;
    const sel    = document.getElementById('list-month-filter');
    const ym     = sel.value || this.state.currentYearMonth;
    const ymDash = ym.slice(0,4) + '-' + ym.slice(4,6);
    const catFilter = document.getElementById('list-category-filter').value;

    this.showLoading('내역 로드 중...');
    try {
      let entries = await API.getEntries(res.ResidentID, ymDash);

      const expenses   = entries.filter(e => e.EntryType === 'EXPENSE' &&
                           (!catFilter || e.Category === catFilter));
      const incomeList = catFilter ? [] : entries.filter(e => e.EntryType === 'INCOME');

      const totalExp = expenses.reduce((s, e)  => s + Number(e.Amount  || 0), 0);
      const totalInc = incomeList.reduce((s, i) => s + Number(i.Amount || 0), 0);

      document.getElementById('list-summary').textContent =
        `지출 ₩${totalExp.toLocaleString()}  |  수입 ₩${totalInc.toLocaleString()}`;

      const allItems = [...expenses, ...incomeList]
        .sort((a, b) => {
          const dc = b.Date.localeCompare(a.Date);
          return dc !== 0 ? dc : (b.CreatedAt || '').localeCompare(a.CreatedAt || '');
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
    } catch (e) {
      this.toast('❌ 로드 실패: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  /* ============================================================
     아이템 렌더링 (공통)
     ============================================================ */
  _renderItem(item) {
    const isIncome = item.EntryType === 'INCOME';
    const icon     = isIncome ? '💵' : (CATEGORIES[item.Category]?.icon || '📌');
    const name     = item.Name || '';
    const catName  = isIncome
      ? (INC_CATS[item.Category] || item.Category || '')
      : (CATEGORIES[item.Category]?.name || item.Category || '');
    const amtStr   = (isIncome ? '+' : '-') + '₩' + Number(item.Amount || 0).toLocaleString();
    const clickFn  = `App.editEntry('${item.EntryID}','${item.Date?.slice(0,7)||''}','${item.EntryType}')`;
    return `
      <div class="item-card" onclick="${clickFn}">
        <div class="item-icon ${isIncome ? 'income-icon' : ''}">${icon}</div>
        <div class="item-info">
          <div class="item-name">${name}</div>
          <div class="item-meta">${item.Date || ''} · ${catName}${item.CreatedBy ? ' · ' + item.CreatedBy : ''}</div>
        </div>
        <div class="item-amount ${isIncome ? 'income' : ''}">${amtStr}</div>
      </div>`;
  },

  /* ============================================================
     지출 추가 / 수정
     ============================================================ */
  showAddExpense(mode = 'manual') {
    this.state.editingEntry = null;
    this.showScreen('expense', { mode });
  },

  editEntry(id, yearMonth, type) {
    // 현재 캐시에서 찾기
    const entry = this.state.currentEntries.find(e => e.EntryID === id);
    this.state.editingEntry = { id, yearMonth, type, data: entry };
    this.showScreen(type === 'INCOME' ? 'income' : 'expense', { editEntry: entry });
  },

  _initExpenseForm(opts) {
    document.getElementById('expense-form').reset();
    document.getElementById('expense-id').value = '';
    document.getElementById('expense-yearmonth').value = '';
    document.getElementById('receipt-preview-area').style.display = 'none';
    document.getElementById('btn-delete-expense').style.display = 'none';
    document.querySelector('input[name="payment"][value="카드"]').checked = true;

    if (opts.editEntry) {
      const e = opts.editEntry;
      document.getElementById('expense-id').value        = e.EntryID;
      document.getElementById('expense-yearmonth').value = e.Date?.slice(0,7) || '';
      document.getElementById('expense-date').value      = e.Date;
      document.getElementById('expense-store').value     = e.Name;
      document.getElementById('expense-amount').value    = e.Amount;
      document.getElementById('expense-category').value  = e.Category;
      document.getElementById('expense-memo').value      = e.Memo || '';
      const r = document.querySelector(`input[name="payment"][value="${e.PaymentMethod}"]`);
      if (r) r.checked = true;
      document.getElementById('btn-delete-expense').style.display = 'block';
    } else {
      document.getElementById('expense-date').value = new Date().toISOString().slice(0, 10);
      if (opts.mode === 'photo') document.getElementById('receipt-file').click();
      if (opts.scanData) {
        if (opts.scanData.name) document.getElementById('expense-store').value = opts.scanData.name;
        if (opts.scanData.memo) document.getElementById('expense-memo').value  = opts.scanData.memo;
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

  async saveExpense(event) {
    event.preventDefault();
    const id        = document.getElementById('expense-id').value;
    const yearMonth = document.getElementById('expense-yearmonth').value;
    const date      = document.getElementById('expense-date').value;
    const name      = document.getElementById('expense-store').value.trim();
    const amount    = Number(document.getElementById('expense-amount').value);
    const category  = document.getElementById('expense-category').value;
    const payment   = document.querySelector('input[name="payment"]:checked')?.value || '카드';
    const memo      = document.getElementById('expense-memo').value.trim();

    if (!date || !name || !amount || !category) {
      this.toast('날짜, 상호명, 금액, 카테고리는 필수입니다'); return;
    }

    this.showLoading(id ? '수정 중...' : '저장 중...');
    try {
      if (id) {
        await API.updateEntry({ id, yearMonth, date, name, category, amount,
                                paymentMethod: payment, memo });
        this.toast('✅ 수정되었습니다');
      } else {
        await API.addEntry({
          entryType: 'EXPENSE',
          residentId: this.state.currentResident.ResidentID,
          date, name, category, amount, paymentMethod: payment, memo,
          inputType: 'manual',
          createdBy: localStorage.getItem(USER_KEY) || '',
        });
        this.toast('✅ 저장되었습니다');
      }
      this.state.editingEntry = null;
      this.goBack();
      // 홈으로 돌아가면 자동 새로고침
      if (this.state.currentScreen === 'home') await this.loadHome();
    } catch (e) {
      this.toast('❌ 오류: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  async deleteExpense() {
    const id        = document.getElementById('expense-id').value;
    const yearMonth = document.getElementById('expense-yearmonth').value;
    if (!id || !confirm('이 지출 항목을 삭제하시겠습니까?')) return;
    this.showLoading('삭제 중...');
    try {
      await API.deleteEntry(id, yearMonth);
      this.toast('삭제되었습니다');
      this.state.editingEntry = null;
      this.goBack();
      if (this.state.currentScreen === 'home') await this.loadHome();
    } catch (e) {
      this.toast('❌ 오류: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  /* ============================================================
     수입 추가 / 수정
     ============================================================ */
  showAddIncome() {
    this.state.editingEntry = null;
    this.showScreen('income', {});
  },

  _initIncomeForm(opts) {
    document.getElementById('income-form').reset();
    document.getElementById('income-id').value = '';
    document.getElementById('income-yearmonth').value = '';
    document.getElementById('btn-delete-income').style.display = 'none';
    document.getElementById('income-date').value = new Date().toISOString().slice(0, 10);

    if (opts.editEntry) {
      const i = opts.editEntry;
      document.getElementById('income-id').value        = i.EntryID;
      document.getElementById('income-yearmonth').value = i.Date?.slice(0,7) || '';
      document.getElementById('income-date').value      = i.Date;
      document.getElementById('income-source').value    = i.Name;
      document.getElementById('income-amount').value    = i.Amount;
      document.getElementById('income-category').value  = i.Category;
      document.getElementById('income-memo').value      = i.Memo || '';
      document.getElementById('btn-delete-income').style.display = 'block';
    }
  },

  async saveIncome(event) {
    event.preventDefault();
    const id        = document.getElementById('income-id').value;
    const yearMonth = document.getElementById('income-yearmonth').value;
    const date      = document.getElementById('income-date').value;
    const source    = document.getElementById('income-source').value.trim();
    const amount    = Number(document.getElementById('income-amount').value);
    const category  = document.getElementById('income-category').value;
    const memo      = document.getElementById('income-memo').value.trim();

    if (!date || !source || !amount) {
      this.toast('날짜, 출처, 금액은 필수입니다'); return;
    }

    this.showLoading(id ? '수정 중...' : '저장 중...');
    try {
      if (id) {
        await API.updateEntry({ id, yearMonth, date, name: source, category, amount, memo });
        this.toast('✅ 수정되었습니다');
      } else {
        await API.addEntry({
          entryType: 'INCOME',
          residentId: this.state.currentResident.ResidentID,
          date, name: source, category, amount, memo,
          inputType: 'manual',
          createdBy: localStorage.getItem(USER_KEY) || '',
        });
        this.toast('✅ 저장되었습니다');
      }
      this.state.editingEntry = null;
      this.goBack();
      if (this.state.currentScreen === 'home') await this.loadHome();
    } catch (e) {
      this.toast('❌ 오류: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  async deleteIncome() {
    const id        = document.getElementById('income-id').value;
    const yearMonth = document.getElementById('income-yearmonth').value;
    if (!id || !confirm('이 수입 항목을 삭제하시겠습니까?')) return;
    this.showLoading('삭제 중...');
    try {
      await API.deleteEntry(id, yearMonth);
      this.toast('삭제되었습니다');
      this.state.editingEntry = null;
      this.goBack();
      if (this.state.currentScreen === 'home') await this.loadHome();
    } catch (e) {
      this.toast('❌ 오류: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  /* ============================================================
     QR / 바코드 스캔
     ============================================================ */
  showScanner() {
    Scanner.start((text, format) => {
      this.showAddExpense('manual');
      setTimeout(() => {
        const isUrl = text.startsWith('http') || String(format).includes('QR');
        document.getElementById('expense-memo').value =
          (isUrl ? 'QR: ' : '바코드: ') + text;
        this.toast(isUrl ? 'QR 인식 완료' : '바코드: ' + text);
      }, 300);
    });
  },

  /* ============================================================
     관리자
     ============================================================ */
  async loadAdmin() {
    this.showLoading('인원 목록 로드 중...');
    try {
      const residents = await API.getResidents();
      this.state.allResidents = residents;
      this._renderAdmin(residents);
    } catch (e) {
      this.toast('❌ 로드 실패: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  _renderAdmin(residents) {
    const listEl = document.getElementById('admin-resident-list');
    if (!residents.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>등록된 인원이 없습니다</p></div>';
      return;
    }
    listEl.innerHTML = residents.map(r => `
      <div class="admin-item">
        <div class="resident-avatar" style="${r.Status==='Deleted'?'opacity:0.4':''}">${(r.Name||'?')[0]}</div>
        <div class="admin-item-info">
          <div class="admin-item-name">${r.Name} ${r.Status==='Deleted'?'<small style="color:var(--text-light)">(비활성)</small>':''}</div>
          <div class="admin-item-meta">${r.Team||'팀 미지정'}${r.StartDate?' · '+r.StartDate:''}</div>
        </div>
        <div class="admin-item-actions">
          <button class="btn btn-sm btn-outline" onclick="App.showEditResident('${r.ResidentID}')">수정</button>
          ${r.Status==='Active'
            ?`<button class="btn btn-sm btn-danger-outline" onclick="App.deactivateResident('${r.ResidentID}')">비활성</button>`:''}
        </div>
      </div>`).join('');
  },

  showAddResident() {
    document.getElementById('modal-resident-title').textContent = '인원 추가';
    document.getElementById('resident-edit-id').value  = '';
    document.getElementById('resident-name').value     = '';
    document.getElementById('resident-team').value     = '';
    document.getElementById('resident-start').value    = new Date().toISOString().slice(0,10);
    document.getElementById('resident-memo').value     = '';
    document.getElementById('modal-resident').style.display = 'flex';
    document.getElementById('resident-name').focus();
  },

  showEditResident(id) {
    const r = this.state.allResidents.find(x => x.ResidentID === id);
    if (!r) return;
    document.getElementById('modal-resident-title').textContent = '인원 수정';
    document.getElementById('resident-edit-id').value  = r.ResidentID;
    document.getElementById('resident-name').value     = r.Name;
    document.getElementById('resident-team').value     = r.Team || '';
    document.getElementById('resident-start').value    = r.StartDate || '';
    document.getElementById('resident-memo').value     = r.Memo || '';
    document.getElementById('modal-resident').style.display = 'flex';
  },

  async saveResident() {
    const id   = document.getElementById('resident-edit-id').value;
    const name = document.getElementById('resident-name').value.trim();
    if (!name) { this.toast('이름을 입력해주세요'); return; }
    const data = {
      name,
      team:      document.getElementById('resident-team').value.trim(),
      startDate: document.getElementById('resident-start').value,
      memo:      document.getElementById('resident-memo').value.trim(),
      createdBy: localStorage.getItem(USER_KEY) || '',
    };
    this.showLoading('저장 중...');
    try {
      if (id) { data.id = id; await API.updateResident(data); this.toast('✅ 수정되었습니다'); }
      else    { await API.addResident(data); this.toast('✅ 추가되었습니다'); }
      this.closeModal('resident');
      await this.loadAdmin();
    } catch (e) {
      this.toast('❌ 오류: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  async deactivateResident(id) {
    if (!confirm('비활성 처리하시겠습니까?\n(데이터는 보존됩니다)')) return;
    this.showLoading('처리 중...');
    try {
      await API.deleteResident(id);
      this.toast('비활성 처리되었습니다');
      await this.loadAdmin();
    } catch (e) {
      this.toast('❌ 오류: ' + e.message);
    } finally {
      this.hideLoading();
    }
  },

  /* ============================================================
     모달 / 토스트
     ============================================================ */
  closeModal(name) {
    document.getElementById(`modal-${name}`).style.display = 'none';
  },

  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent    = msg;
    el.style.display  = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer  = setTimeout(() => { el.style.display = 'none'; }, 2800);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
