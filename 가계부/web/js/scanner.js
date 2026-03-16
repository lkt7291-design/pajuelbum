/**
 * scanner.js — ZXing 기반 QR코드 / 바코드 스캐너
 *
 * 지원 형식: QR, EAN-13, EAN-8, Code128, Code39, DataMatrix
 * 스캔 완료 → onResult(text, formatName) 콜백 호출
 */

const Scanner = {
  _reader:   null,
  _active:   false,
  _callback: null,

  /* 스캐너 시작 */
  async start(callback) {
    this._callback = callback;
    this._active   = true;

    document.getElementById('modal-scanner').style.display = 'flex';
    document.getElementById('scan-result').style.display  = 'none';

    // ZXing 라이브러리 확인
    if (typeof ZXing === 'undefined') {
      App.toast('❌ 스캐너 라이브러리 로드 실패', 'error');
      this.stop();
      return;
    }

    try {
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.QR_CODE,
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

      this._reader = new ZXing.BrowserMultiFormatReader(hints);
      const videoEl = document.getElementById('scanner-video');

      this._reader.decodeFromVideoDevice(null, videoEl, (result, err) => {
        if (!this._active) return;
        if (result) {
          this._active = false;
          const text   = result.getText();
          const format = result.getBarcodeFormat();
          this._showResult(text);
          // 500ms 후 모달 닫고 콜백
          setTimeout(() => {
            this.stop();
            if (this._callback) this._callback(text, format);
          }, 600);
        }
        // 인식 실패 err는 매 프레임 발생하므로 무시
      });

    } catch (err) {
      console.error('Scanner start error:', err);
      App.toast('카메라를 사용할 수 없습니다: ' + err.message, 'error');
      this.stop();
    }
  },

  /* 스캐너 중지 및 모달 닫기 */
  stop() {
    this._active = false;
    if (this._reader) {
      try { this._reader.reset(); } catch {}
      this._reader = null;
    }
    document.getElementById('modal-scanner').style.display = 'none';
  },

  /* 인식 결과 화면 표시 */
  _showResult(text) {
    const el = document.getElementById('scan-result');
    el.style.display = 'block';
    el.textContent   = '✅ 인식됨: ' + (text.length > 60 ? text.slice(0, 60) + '...' : text);
    // 진동 피드백 (모바일)
    if (navigator.vibrate) navigator.vibrate([100]);
  },
};
