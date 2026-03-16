# Google Apps Script 배포 가이드

## 1단계 — Google Sheets 생성

1. [Google Sheets](https://sheets.google.com) 접속
2. 빈 스프레드시트 새로 생성
3. 스프레드시트 이름: `가계부` (자유롭게 지정 가능)
4. URL에서 **스프레드시트 ID** 복사:
   ```
   https://docs.google.com/spreadsheets/d/ [여기가 ID] /edit
   ```

---

## 2단계 — Apps Script 설정

1. Google Sheets 열기 → **확장 프로그램 → Apps Script** 클릭
2. 기존 코드 전부 삭제 후 `Code.gs` 내용 **전체 붙여넣기**
3. 상단의 `SPREADSHEET_ID` 값을 1단계에서 복사한 ID로 교체:
   ```javascript
   const SPREADSHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_복사한_ID_입력';
   ```
4. 저장 (Ctrl+S)

---

## 3단계 — 웹 앱으로 배포

1. Apps Script 편집기 → **배포 → 새 배포** 클릭
2. 배포 유형: **웹 앱** 선택
3. 설정:
   | 항목 | 값 |
   |---|---|
   | 설명 | 가계부 백엔드 |
   | 다음 사용자로 실행 | **나 (내 Google 계정)** |
   | 액세스 권한 | **모든 사용자** |
4. **배포** 클릭 → Google 계정 권한 허용
5. **웹 앱 URL** 복사 (형식: `https://script.google.com/macros/s/XXXXX/exec`)

---

## 4단계 — 웹 앱에 URL 입력

1. `index.html`을 브라우저에서 열기 (또는 GitHub Pages 등에 배포)
2. 앱 첫 실행 시 설정 화면 표시
3. 복사한 **웹 앱 URL** 입력 → 저장
4. 연결 테스트 통과 시 정상 작동

---

## 스프레드시트 구조 (자동 생성)

설정 완료 후 첫 사용 시 아래 시트가 자동 생성됩니다:

```
가계부 (Google Sheets)
├── 담당인원          ← 인원 목록 (자동 생성)
├── 2026-03          ← 2026년 3월 항목 (첫 입력 시 자동 생성)
├── 2026-04          ← 2026년 4월 (자동 생성)
└── ...              ← 월별 자동 누적
```

### 월별 시트 컬럼
| 컬럼 | 설명 |
|---|---|
| EntryType | EXPENSE(지출) / INCOME(수입) |
| EntryID | 항목 고유 ID |
| ResidentID | 담당 인원 ID |
| Date | 날짜 (YYYY-MM-DD) |
| Name | 상호명(지출) 또는 출처(수입) |
| Category | 카테고리 코드 |
| Amount | 금액 |
| PaymentMethod | 결제수단 |
| Memo | 메모 |
| InputType | 입력방식 (manual/photo/qr/barcode) |
| CreatedBy | 입력자 이름 |
| CreatedAt | 생성일시 |
| ModifiedAt | 수정일시 |
| Status | Active / Deleted |

---

## 다중 사용자 공유 방법

1. Google Sheets를 공유하지 않아도 됩니다 (Apps Script가 대신 접근)
2. 웹 앱 URL만 복지사들에게 공유하면 됩니다
3. 모든 데이터는 하나의 Google Sheets에 누적 저장됩니다

---

## 재배포 (코드 수정 시)

코드 변경 후에는 반드시 **재배포** 해야 변경 사항이 적용됩니다:
1. **배포 → 배포 관리** 클릭
2. 연필 아이콘(수정) → 버전: **새 버전** 선택
3. **배포** 클릭

---

## 연결 테스트

브라우저에서 아래 URL 접속 시 `{"ok":true,"data":{"pong":true,...}}` 응답 확인:
```
https://script.google.com/macros/s/[YOUR_SCRIPT_ID]/exec?action=ping
```
