# Power Automate 플로우 설계 — 바코드/QR코드 스캔 외부 입력

## 스캔 유형 2가지

| 유형 | 대상 | 처리 방법 |
|---|---|---|
| **QR코드** | 현금영수증 QR코드 (국세청) | URL 파싱 → 영수증 데이터 추출 |
| **바코드** | 상품 바코드 (EAN-13 등) | 바코드 조회 API → 상품명/가격 반환 |

---

## Flow_QRReceipt_Process — 현금영수증 QR코드 처리

### 처리 흐름

```
[Power Apps: BarcodeScanner 컨트롤로 QR 스캔]
       │
       ▼  스캔값 예시:
       │  https://현금영수증.kr/receipt?id=XXXXXXXX
       │  또는 국세청 URL 형식
       ▼
[Power Automate 호출]
       │
       ▼
[HTTP GET: QR URL 접속]
  액션: HTTP
  방법: GET
  URI:  @{triggerBody()?['QRUrl']}
       │
       ▼
[HTML 파싱: 영수증 데이터 추출]
  액션: HTML 테이블 분석
  추출 항목:
    - 상호명 (MerchantName)
    - 거래일시 (TransactionDate)
    - 공급가액 (Subtotal)
    - 부가세 (TaxAmount)
    - 합계금액 (Total)
    - 결제수단 (PaymentMethod)
       │
       ▼
[ExpenseID 생성 + Excel 행 추가]
  (OCR 플로우와 동일 로직)
       │
       ▼
[Power Apps에 결과 반환]
```

### 입력 파라미터

```json
{
  "QRUrl": "https://현금영수증.kr/receipt?id=XXXXXXXX",
  "UserName": "user@company.com",
  "ManualCategory": "FOOD"
}
```

### 출력 파라미터

```json
{
  "ExpenseID":    "EXP-202603-00005",
  "StoreName":    "GS25 강남점",
  "Date":         "2026-03-16",
  "TotalAmount":  12500,
  "TaxAmount":    1136,
  "PaymentMethod":"현금",
  "InputType":    "QR",
  "Status":       "success",
  "ErrorMessage": ""
}
```

### 국세청 현금영수증 URL 패턴 처리

```
// Power Automate: 조건 분기
URL에 "taxsave.go.kr" 포함    → 국세청 현금영수증 파서 사용
URL에 "현금영수증.kr" 포함    → 간편 현금영수증 파서 사용
그 외 URL                     → 범용 HTML 파서 사용
```

---

## Flow_Barcode_Lookup — 상품 바코드 조회

### 처리 흐름

```
[Power Apps: BarcodeScanner 컨트롤로 바코드 스캔]
       │
       ▼  스캔값 예시: 8801234567890 (EAN-13)
       ▼
[Power Automate 호출]
       │
       ▼
[바코드 조회 API 호출]
  1순위: 대한상공회의소 유통물류진흥원 GS1 API
  2순위: Open Food Facts API (식품류)
  3순위: 캐시 (Tbl_BarcodeCache 조회)

  액션: HTTP
  방법: GET
  URI:  https://www.gs1kr.org/api/product/@{triggerBody()?['Barcode']}
  헤더: Authorization: Bearer @{parameters('GS1_API_KEY')}
       │
       ▼
[상품 정보 추출]
  - ProductName (상품명)
  - Brand (브랜드)
  - Category (카테고리 추정)
  - UnitPrice (표준소비자가격, 있을 경우)
       │
       ▼
[바코드 캐시 저장 (Tbl_BarcodeCache)]
  중복 API 호출 방지용
       │
       ▼
[Power Apps에 결과 반환]
  → 사용자가 수량 및 실제 구매가격 입력 후 저장
```

### 입력 파라미터

```json
{
  "Barcode":      "8801234567890",
  "UserName":     "user@company.com"
}
```

### 출력 파라미터

```json
{
  "ProductName":  "농심 신라면 120g",
  "Brand":        "농심",
  "Category":     "FOOD",
  "UnitPrice":    1200,
  "BarcodeType":  "EAN13",
  "CacheHit":     false,
  "Status":       "success",
  "ErrorMessage": ""
}
```

### 바코드 캐시 테이블 (Tbl_BarcodeCache)

Excel `가계부.xlsx`에 시트 추가:

| 컬럼명 | 타입 | 설명 |
|---|---|---|
| `Barcode` | 텍스트 | 바코드 번호 (Primary Key) |
| `ProductName` | 텍스트 | 상품명 |
| `Brand` | 텍스트 | 브랜드 |
| `Category` | 텍스트 | 카테고리 코드 |
| `UnitPrice` | 숫자 | 단위 가격 |
| `CachedAt` | 날짜시간 | 캐시 저장 시각 |

---

## Power Apps BarcodeScanner 설정

```powerapps
// BarcodeScanner 컨트롤 설정
BarcodeScanner1.BarcodeType = BarcodeType.Any  // QR + 모든 바코드 형식

// 스캔 완료 이벤트
BarcodeScanner1.OnScan =
    Set(loc_ScannedValue, BarcodeScanner1.Value);
    Set(loc_BarcodeType,  BarcodeScanner1.BarcodeType);

    // QR코드인지 바코드인지 판별
    If(
        loc_BarcodeType = BarcodeType.QR Or
        StartsWith(loc_ScannedValue, "http"),

        // QR코드 처리 (현금영수증 URL)
        Set(loc_IsLoading, true);
        Set(
            loc_QRResult,
            Flow_QRReceipt_Process.Run(
                loc_ScannedValue,
                var_CurrentUser,
                "OTHER"
            )
        );
        Set(loc_IsLoading, false);
        If(
            loc_QRResult.Status = "success",
            Navigate(Scr_AddExpense,
                     ScreenTransition.Fade,
                     {loc_InputMode: "QR", loc_PrefilledData: loc_QRResult}),
            Notify("QR코드 처리 실패: " & loc_QRResult.ErrorMessage,
                   NotificationType.Warning)
        ),

        // 바코드 처리 (상품 바코드)
        Set(loc_IsLoading, true);
        Set(
            loc_BarcodeResult,
            Flow_Barcode_Lookup.Run(
                loc_ScannedValue,
                var_CurrentUser
            )
        );
        Set(loc_IsLoading, false);
        If(
            loc_BarcodeResult.Status = "success",
            Navigate(Scr_AddExpense,
                     ScreenTransition.Fade,
                     {loc_InputMode: "Barcode",
                      loc_PrefilledData: loc_BarcodeResult}),
            Notify("바코드 조회 실패: " & loc_BarcodeResult.ErrorMessage,
                   NotificationType.Warning)
        )
    )
```

---

## 에러 처리

| 상황 | 처리 |
|---|---|
| QR URL 접속 실패 | "영수증 URL에 접근할 수 없습니다. 직접 입력해주세요." 알림 |
| 바코드 API 키 만료 | 캐시에서 검색 → 없으면 상품명 직접 입력 화면으로 이동 |
| 미등록 바코드 | "등록되지 않은 상품입니다. 직접 입력해주세요." 알림 |
| 스캔 인식 실패 | 자동 재시도 1회 → 실패 시 수동 입력 유도 |

---

## 필요 Power Automate 커넥터

| 커넥터 | 용도 | 비용 |
|---|---|---|
| HTTP | QR URL 접속, 바코드 API 호출 | Premium |
| Excel Online (Business) | 캐시 테이블 읽기/쓰기 | Standard |
| Power Apps V2 | 앱에서 플로우 호출 | Standard |
