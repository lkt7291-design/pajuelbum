/**
 * api.js — Google Apps Script 호출 클라이언트
 *
 * 저장소: localStorage의 'gb_script_url' 키에 Apps Script 배포 URL 보관
 * 방식:  GET + URL 파라미터 (CORS 우회, redirect: follow)
 *
 * 모든 메서드는 Promise를 반환합니다.
 */

const API = {

  CONFIG_KEY: 'gb_script_url',

  /* ---- 설정 ---- */
  getUrl()        { return localStorage.getItem(this.CONFIG_KEY) || ''; },
  setUrl(url)     { localStorage.setItem(this.CONFIG_KEY, url.trim()); },
  isConfigured()  { return !!this.getUrl(); },

  /* ============================================================
     공통 요청 (GET + data 파라미터에 JSON 인코딩)
     ============================================================ */
  async _call(action, data = {}) {
    const baseUrl = this.getUrl();
    if (!baseUrl) throw new Error('Apps Script URL이 설정되지 않았습니다');

    const url = new URL(baseUrl);
    url.searchParams.set('action', action);
    if (Object.keys(data).length > 0) {
      url.searchParams.set('data', JSON.stringify(data));
    }

    let res;
    try {
      res = await fetch(url.toString(), {
        method:   'GET',
        redirect: 'follow',
      });
    } catch (e) {
      throw new Error('네트워크 오류: ' + e.message);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '서버 오류');
    return json.data;
  },

  /* ============================================================
     연결 테스트
     ============================================================ */
  ping() { return this._call('ping'); },

  /* ============================================================
     담당 인원
     ============================================================ */
  getResidents()         { return this._call('getResidents'); },
  addResident(d)         { return this._call('addResident', d); },
  updateResident(d)      { return this._call('updateResident', d); },
  deleteResident(id)     { return this._call('deleteResident', { id }); },

  /* ============================================================
     수입/지출 항목
     ============================================================ */
  /** yearMonth: 'YYYY-MM' */
  getEntries(residentId, yearMonth) {
    return this._call('getEntries', { residentId, yearMonth });
  },

  /** 해당 인원의 데이터가 있는 월 목록 (최신순) */
  getAllMonths(residentId) {
    return this._call('getAllMonths', { residentId });
  },

  /** 전체 월의 데이터를 한 번에 가져오기 (Excel 내보내기용) */
  getAll(residentId) {
    return this._call('getAll', { residentId });
  },

  /**
   * 항목 추가
   * @param {object} d - { entryType, residentId, date, name, category,
   *                       amount, paymentMethod, memo, inputType, createdBy }
   */
  addEntry(d)           { return this._call('addEntry', d); },

  /**
   * 항목 수정
   * @param {object} d - { id, yearMonth, ...수정필드들 }
   */
  updateEntry(d)        { return this._call('updateEntry', d); },

  /** 논리적 삭제 */
  deleteEntry(id, yearMonth) {
    return this._call('deleteEntry', { id, yearMonth });
  },
};
