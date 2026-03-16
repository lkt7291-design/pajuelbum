/**
 * db.js — localStorage 기반 데이터 레이어
 * 모든 데이터는 논리적 삭제 (status: 'Active' | 'Deleted')
 */

const DB = {

  KEYS: {
    RESIDENTS: 'gb_residents',
    EXPENSES:  'gb_expenses',
    INCOME:    'gb_income',
    USER:      'gb_user',
  },

  /* ---- 기본 읽기/쓰기 ---- */
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  },
  _set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  /* ---- 사용자 (이름만 저장) ---- */
  getUser()      { return localStorage.getItem(this.KEYS.USER) || ''; },
  setUser(name)  { localStorage.setItem(this.KEYS.USER, name); },

  /* ==============================
     RESIDENTS
     ============================== */
  getResidents()       { return this._get(this.KEYS.RESIDENTS); },
  getActiveResidents() { return this.getResidents().filter(r => r.status === 'Active'); },
  getResidentById(id)  { return this.getResidents().find(r => r.id === id); },

  addResident(data) {
    const list = this.getResidents();
    const item = {
      id:        'RES-' + Date.now(),
      status:    'Active',
      createdAt: new Date().toISOString(),
      ...data,
    };
    list.push(item);
    this._set(this.KEYS.RESIDENTS, list);
    return item;
  },

  updateResident(id, data) {
    const list = this.getResidents().map(r =>
      r.id === id ? { ...r, ...data, modifiedAt: new Date().toISOString() } : r
    );
    this._set(this.KEYS.RESIDENTS, list);
  },

  deleteResident(id) { this.updateResident(id, { status: 'Deleted' }); },

  /* ==============================
     EXPENSES (지출)
     ============================== */
  getExpenses()          { return this._get(this.KEYS.EXPENSES); },
  getExpenseById(id)     { return this.getExpenses().find(e => e.id === id); },

  getExpensesByResident(residentId) {
    return this.getExpenses().filter(e => e.residentId === residentId && e.status === 'Active');
  },

  /** yearMonth 형식: 'YYYY-MM' */
  getExpensesByMonth(residentId, yearMonth) {
    return this.getExpensesByResident(residentId)
               .filter(e => e.date && e.date.startsWith(yearMonth));
  },

  addExpense(data) {
    const list = this.getExpenses();
    const item = {
      id:        'EXP-' + Date.now(),
      status:    'Active',
      createdBy: this.getUser(),
      createdAt: new Date().toISOString(),
      ...data,
    };
    list.push(item);
    this._set(this.KEYS.EXPENSES, list);
    return item;
  },

  updateExpense(id, data) {
    const list = this.getExpenses().map(e =>
      e.id === id ? { ...e, ...data, modifiedAt: new Date().toISOString() } : e
    );
    this._set(this.KEYS.EXPENSES, list);
  },

  deleteExpense(id) { this.updateExpense(id, { status: 'Deleted' }); },

  /* ==============================
     INCOME (수입)
     ============================== */
  getIncome()           { return this._get(this.KEYS.INCOME); },
  getIncomeById(id)     { return this.getIncome().find(i => i.id === id); },

  getIncomeByResident(residentId) {
    return this.getIncome().filter(i => i.residentId === residentId && i.status === 'Active');
  },

  getIncomeByMonth(residentId, yearMonth) {
    return this.getIncomeByResident(residentId)
               .filter(i => i.date && i.date.startsWith(yearMonth));
  },

  addIncome(data) {
    const list = this.getIncome();
    const item = {
      id:        'INC-' + Date.now(),
      status:    'Active',
      createdBy: this.getUser(),
      createdAt: new Date().toISOString(),
      ...data,
    };
    list.push(item);
    this._set(this.KEYS.INCOME, list);
    return item;
  },

  updateIncome(id, data) {
    const list = this.getIncome().map(i =>
      i.id === id ? { ...i, ...data, modifiedAt: new Date().toISOString() } : i
    );
    this._set(this.KEYS.INCOME, list);
  },

  deleteIncome(id) { this.updateIncome(id, { status: 'Deleted' }); },

  /* ==============================
     IMPORT / EXPORT
     ============================== */

  /**
   * 다른 기기에서 내보낸 Excel의 백업 데이터를 병합
   * 이미 존재하는 ID는 건너뜀 (중복 방지)
   */
  importData({ residents = [], expenses = [], income = [] }) {
    const merge = (key, existing, incoming) => {
      const ids = new Set(existing.map(x => x.id));
      const added = incoming.filter(x => !ids.has(x.id));
      if (added.length > 0) this._set(key, [...existing, ...added]);
      return added.length;
    };
    const r = merge(this.KEYS.RESIDENTS, this.getResidents(), residents);
    const e = merge(this.KEYS.EXPENSES,  this.getExpenses(),  expenses);
    const i = merge(this.KEYS.INCOME,    this.getIncome(),    income);
    return { residents: r, expenses: e, income: i };
  },

  exportSnapshot() {
    return {
      residents:  this.getResidents(),
      expenses:   this.getExpenses(),
      income:     this.getIncome(),
      exportedAt: new Date().toISOString(),
      exportedBy: this.getUser(),
    };
  },

  clearAll() {
    Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
  },

  /* ==============================
     HELPERS
     ============================== */

  /** 해당 인원의 데이터가 존재하는 월 목록 (최신순) */
  getAvailableMonths(residentId) {
    const all = [
      ...this.getExpensesByResident(residentId),
      ...this.getIncomeByResident(residentId),
    ];
    const set = new Set(all.map(x => x.date ? x.date.slice(0, 7) : null).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  },
};
