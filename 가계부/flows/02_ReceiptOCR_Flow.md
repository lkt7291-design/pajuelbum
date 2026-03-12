# Power Automate 플로우 설계 — 영수증 OCR 자동 처리

## 플로우 목록

| 플로우명 | 트리거 | 설명 |
|---|---|---|
| `Flow_ReceiptOCR_Process` | Power Apps에서 호출 | 영수증 이미지 → OCR → Excel 저장 |
| `Flow_MonthlySummary_Batch` | 매월 1일 00:00 (예약) | 월별 집계 자동 갱신 |

---

## Flow_ReceiptOCR_Process

### 플로우 다이어그램

```
[Power Apps 트리거]
       │
       ▼
[이미지 OneDrive 저장]
  OneDrive: receipts/{연도}/{월}/{ExpenseID}_{날짜}.jpg
       │
       ▼
[AI Builder: 영수증 분석]
  모델: AI Builder - 영수증 처리 (사전 빌드 모델)
  입력: 이미지 콘텐츠
  출력: MerchantName, TransactionDate, Total, Subtotal, Tax, Items[]
       │
       ▼
[신뢰도 조건 분기]
  ──── 신뢰도 >= 0.75 ────┐
  │                       │
  ▼                       ▼
[고신뢰도 처리]       [저신뢰도 처리]
  자동 입력 플래그 ON   검토 필요 플래그 ON
  IsOCRVerified: false  IsOCRVerified: false
  OCRConfidence: 값     OCRConfidence: 값
       │                       │
       └──────────┬────────────┘
                  ▼
         [ExpenseID 생성]
           EXP-{Text(Now(),"YYYYMM")}-{순번}
                  │
                  ▼
         [Excel 행 추가]
           파일: 가계부.xlsx
           테이블: Tbl_Expenses
                  │
                  ▼
         [Power Apps에 결과 반환]
           ExpenseID, OCRData, Confidence
```

### 입력 파라미터 (Power Apps → Flow)

```json
{
  "ImageBase64": "<base64 인코딩 이미지>",
  "ImageFileName": "receipt_20260312_143022.jpg",
  "UserName": "user@company.com",
  "ManualDate": "2026-03-12",
  "ManualCategory": "FOOD"
}
```

### 출력 파라미터 (Flow → Power Apps)

```json
{
  "ExpenseID": "EXP-202603-00001",
  "StoreName": "이마트",
  "Date": "2026-03-12",
  "TotalAmount": 35400,
  "TaxAmount": 3218,
  "OCRConfidence": 0.92,
  "IsOCRVerified": false,
  "ImagePath": "가계부/receipts/2026/03/EXP-202603-00001_20260312.jpg",
  "Status": "success",
  "ErrorMessage": ""
}
```

### 상세 액션 구성

#### 1단계 — 이미지 저장
```
액션: OneDrive for Business - 파일 만들기
경로: /가계부/receipts/@{formatDateTime(utcNow(),'yyyy')}/
      @{formatDateTime(utcNow(),'MM')}/
      @{triggerBody()?['ExpenseID']}_
      @{formatDateTime(utcNow(),'yyyyMMdd')}.jpg
콘텐츠: @{base64ToBinary(triggerBody()?['ImageBase64'])}
```

#### 2단계 — AI Builder 영수증 분석
```
액션: AI Builder - 영수증에서 정보 추출 (사전 구축 모델)
영수증 이미지: @{body('파일_만들기')?['$content']}
```

#### 3단계 — ExpenseID 생성 (현재 월 최대 순번 + 1)
```
액션: Excel Online - 행 가져오기
파일: 가계부.xlsx
테이블: Tbl_Expenses
필터: startswith(ExpenseID, 'EXP-@{formatDateTime(utcNow(),'yyyyMM')}')

변수: var_MaxSeq = length(body('행_가져오기')?['value']) + 1
변수: var_NewID = concat(
  'EXP-',
  formatDateTime(utcNow(),'yyyyMM'),
  '-',
  padLeft(string(var_MaxSeq), 5, '0')
)
```

#### 4단계 — Excel 행 추가 (Try-Catch 스코프)
```
스코프: Try
  액션: Excel Online - 테이블에 행 추가
  파일: 가계부.xlsx
  테이블: Tbl_Expenses
  행:
    ExpenseID:        @{var_NewID}
    Date:             @{body('영수증_분석')?['TransactionDate']}
    StoreName:        @{body('영수증_분석')?['MerchantName']}
    Category:         @{triggerBody()?['ManualCategory']}
    TotalAmount:      @{body('영수증_분석')?['Total']}
    TaxAmount:        @{body('영수증_분석')?['TotalTax']}
    PaymentMethod:    카드
    ReceiptImagePath: @{body('파일_만들기')?['Path']}
    OCRConfidence:    @{body('영수증_분석')?['confidence']}
    IsOCRVerified:    false
    CreatedBy:        @{triggerBody()?['UserName']}
    CreatedAt:        @{utcNow()}
    Status:           Active

스코프: Catch (실행 조건: 실패한 경우)
  액션: Office 365 Outlook - 이메일 보내기
  받는 사람: @{triggerBody()?['UserName']}
  제목: [가계부] 영수증 저장 실패 알림
  본문: |
    영수증 처리 중 오류가 발생했습니다.
    파일명: @{triggerBody()?['ImageFileName']}
    오류: @{actions('테이블에_행_추가')?['error']?['message']}
    직접 입력 후 저장해주세요.
```

#### 5단계 — 결과 반환
```
액션: Power Apps에 응답
응답 본문:
  ExpenseID:     @{var_NewID}
  StoreName:     @{body('영수증_분석')?['MerchantName']}
  TotalAmount:   @{body('영수증_분석')?['Total']}
  OCRConfidence: @{body('영수증_분석')?['confidence']}
  ImagePath:     @{body('파일_만들기')?['Path']}
  Status:        success
```

---

## Flow_MonthlySummary_Batch

> 매월 1일 새벽 2시 자동 실행 — 전월 데이터 집계

### 트리거
```
반복: 매월 1일 02:00 (KST = UTC+9)
```

### 처리 로직
```
1. 전월 YearMonth 계산
   var_YearMonth = formatDateTime(addToTime(utcNow(), -1, 'Month'), 'yyyyMM')

2. Tbl_Expenses 필터링 (전월, Status = Active)

3. 카테고리별 집계 계산

4. Tbl_Summary 행 추가 또는 업데이트

5. (선택) 월말 리포트 이메일 발송
```

---

## AI Builder 설정

### 사용 모델
- **모델명**: 영수증 처리 (Receipt processing)
- **모델 유형**: 사전 빌드된 AI 모델 (추가 학습 불필요)
- **지원 언어**: 한국어 포함 다국어 지원
- **인식 필드**:
  - `MerchantName` — 상호명
  - `MerchantAddress` — 주소
  - `TransactionDate` — 날짜
  - `TransactionTime` — 시간
  - `Subtotal` — 공급가액
  - `TotalTax` — 세액
  - `Total` — 합계금액
  - `Items[].Name` — 품목명
  - `Items[].Price` — 품목 가격
  - `Items[].Quantity` — 수량

### AI Builder 라이선스 요구사항
- Power Automate Premium 또는 AI Builder 크레딧 필요
- 무료 대안: Azure Form Recognizer (HTTP 커넥터 사용)

---

## 에러 코드 정의

| 코드 | 의미 | 처리 방법 |
|---|---|---|
| `OCR_LOW_CONFIDENCE` | 신뢰도 < 0.75 | 사용자에게 수동 검토 요청 |
| `FILE_SAVE_FAILED` | OneDrive 저장 실패 | 3회 재시도 후 이메일 알림 |
| `EXCEL_LOCKED` | Excel 파일 잠김 | 30초 후 3회 재시도 |
| `EXCEL_WRITE_FAILED` | Excel 쓰기 실패 | 이메일 알림 + 임시 저장 |

### Excel 파일 잠김 재시도 로직
```
[행 추가 시도]
    │
    ▼
[오류 발생?]──No──▶ [완료]
    │ Yes
    ▼
[오류 = FileLocked?]──No──▶ [에러 알림]
    │ Yes
    ▼
[30초 대기]
    │
    ▼
[재시도 횟수 < 3?]──No──▶ [에러 알림]
    │ Yes
    ▼
[다시 시도] ──────────────▶ (반복)
```
