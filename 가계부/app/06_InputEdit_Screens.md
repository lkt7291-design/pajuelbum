# Power Apps — 입력 및 수정 화면 상세 설계

> 3가지 입력 경로와 수정 흐름을 통합한 단일 `Scr_AddExpense` 화면으로 구현

---

## 입력 경로 통합 구조

```
입력 진입점
├── [📷 영수증 촬영]   → OCR 처리 → Scr_AddExpense (loc_InputMode = "OCR")
├── [📱 QR/바코드 스캔] → 스캔 처리 → Scr_AddExpense (loc_InputMode = "QR" | "Barcode")
├── [✏️ 직접 입력]     → 빈 폼    → Scr_AddExpense (loc_InputMode = "Manual")
└── [목록에서 항목 탭] → 기존 데이터 → Scr_AddExpense (loc_InputMode = "Edit")
```

모든 경로가 **하나의 화면(Scr_AddExpense)** 으로 진입하며,
`loc_InputMode` 값에 따라 폼 초기값과 저장 동작이 달라집니다.

---

## Scr_AddExpense — 통합 입력/수정 화면

### 레이아웃

```
┌──────────────────────────────────────┐
│ ←   [지출 추가 | 지출 수정]           │  ← 제목은 InputMode에 따라 변경
├──────────────────────────────────────┤
│  입력 방법 선택 (신규 입력 시만 표시)  │
│  [📷 촬영]  [📱 스캔]  [✏️ 직접입력]  │
├──────────────────────────────────────┤
│  ┌──────────────────────────────┐   │
│  │ 영수증 이미지 미리보기          │   │  ← 이미지 있을 때만 표시
│  │ (OCR 결과 / QR 원본)          │   │
│  └──────────────────────────────┘   │
│                                      │
│  ⚠ OCR 신뢰도: 68% — 내용을 확인하세요  │  ← 신뢰도 낮을 때만 표시
│                                      │
│  날짜   [2026-03-16           📅]   │
│  상호명  [이마트 강남점            ]  │
│  금액   [         35,400      원]   │
│  카테고리 [식비                  ▼]  │
│  세부    [식료품                 ▼]  │
│  결제수단 [카드                  ▼]  │
│  카드사  [신한카드               ▼]  │  ← 결제수단 = 카드일 때만 표시
│  수량   [    1    ]  (바코드 시만)   │  ← 바코드 입력 시만 표시
│  메모   [                        ]  │
│                                      │
│  [삭제] (수정 모드일 때만)   [저장]   │
└──────────────────────────────────────┘
```

---

## 화면 진입 시 초기화 수식 (OnVisible)

```powerapps
// Scr_AddExpense.OnVisible
Switch(
    loc_InputMode,

    // 1. OCR 모드 — 영수증 촬영 결과
    "OCR",
    UpdateContext({
        loc_FormDate:      DateValue(loc_PrefilledData.Date),
        loc_FormStore:     loc_PrefilledData.StoreName,
        loc_FormAmount:    loc_PrefilledData.TotalAmount,
        loc_FormTax:       loc_PrefilledData.TaxAmount,
        loc_FormPayment:   "카드",
        loc_FormMemo:      "",
        loc_FormImagePath: loc_PrefilledData.ImagePath,
        loc_ExpenseID:     loc_PrefilledData.ExpenseID,
        loc_Confidence:    loc_PrefilledData.OCRConfidence,
        loc_IsEdit:        false,
        loc_Quantity:      1
    }),

    // 2. QR 모드 — 현금영수증 QR
    "QR",
    UpdateContext({
        loc_FormDate:      DateValue(loc_PrefilledData.Date),
        loc_FormStore:     loc_PrefilledData.StoreName,
        loc_FormAmount:    loc_PrefilledData.TotalAmount,
        loc_FormTax:       loc_PrefilledData.TaxAmount,
        loc_FormPayment:   loc_PrefilledData.PaymentMethod,
        loc_FormMemo:      "",
        loc_FormImagePath: "",
        loc_ExpenseID:     loc_PrefilledData.ExpenseID,
        loc_Confidence:    1,
        loc_IsEdit:        false,
        loc_Quantity:      1
    }),

    // 3. 바코드 모드 — 상품 바코드
    "Barcode",
    UpdateContext({
        loc_FormDate:      Today(),
        loc_FormStore:     "",
        loc_FormAmount:    loc_PrefilledData.UnitPrice,
        loc_FormTax:       0,
        loc_FormPayment:   "카드",
        loc_FormMemo:      loc_PrefilledData.ProductName,
        loc_FormImagePath: "",
        loc_ExpenseID:     "",
        loc_Confidence:    1,
        loc_IsEdit:        false,
        loc_Quantity:      1
    }),

    // 4. 직접 입력 모드
    "Manual",
    UpdateContext({
        loc_FormDate:      Today(),
        loc_FormStore:     "",
        loc_FormAmount:    0,
        loc_FormTax:       0,
        loc_FormPayment:   "카드",
        loc_FormMemo:      "",
        loc_FormImagePath: "",
        loc_ExpenseID:     "",
        loc_Confidence:    1,
        loc_IsEdit:        false,
        loc_Quantity:      1
    }),

    // 5. 수정 모드 — 기존 항목 수정
    "Edit",
    UpdateContext({
        loc_FormDate:      var_SelectedExpense.Date,
        loc_FormStore:     var_SelectedExpense.StoreName,
        loc_FormAmount:    var_SelectedExpense.TotalAmount,
        loc_FormTax:       var_SelectedExpense.TaxAmount,
        loc_FormPayment:   var_SelectedExpense.PaymentMethod,
        loc_FormMemo:      var_SelectedExpense.Memo,
        loc_FormImagePath: var_SelectedExpense.ReceiptImagePath,
        loc_ExpenseID:     var_SelectedExpense.ExpenseID,
        loc_Confidence:    var_SelectedExpense.OCRConfidence,
        loc_IsEdit:        true,
        loc_Quantity:      1
    })
)
```

---

## 입력값 유효성 검사 수식

```powerapps
// 저장 버튼 활성화 조건
btn_Save.DisplayMode =
    If(
        And(
            loc_FormAmount > 0,
            !IsBlank(loc_FormStore),
            !IsBlank(loc_FormDate)
        ),
        DisplayMode.Edit,
        DisplayMode.Disabled
    )

// 실시간 금액 형식 표시
txt_Amount.HintText = "0"
lbl_AmountFormatted.Text =
    If(
        IsBlank(txt_Amount.Text) || Value(txt_Amount.Text) = 0,
        "",
        Text(Value(txt_Amount.Text), "#,##0") & " 원"
    )

// 바코드 모드: 수량 × 단가 자동 계산
lbl_TotalCalc.Visible = loc_InputMode = "Barcode"
lbl_TotalCalc.Text =
    Text(Value(txt_Quantity.Text) * loc_PrefilledData.UnitPrice, "#,##0") & " 원"
```

---

## 저장 버튼 수식 (신규 / 수정 통합)

```powerapps
// btn_Save.OnSelect
Set(loc_IsSaving, true);

// 바코드 모드: 금액 = 수량 × 단가
If(
    loc_InputMode = "Barcode",
    UpdateContext({loc_FormAmount: Value(txt_Quantity.Text) * loc_PrefilledData.UnitPrice})
);

// 카테고리 코드 결정
Set(
    loc_CategoryCode,
    drp_Category.Selected.CategoryCode
);

If(
    loc_IsEdit,

    // ── 수정 모드: 기존 행 업데이트 ──
    Patch(
        Tbl_Expenses,
        LookUp(Tbl_Expenses, ExpenseID = loc_ExpenseID),
        {
            Date:          loc_FormDate,
            StoreName:     txt_Store.Text,
            Category:      loc_CategoryCode,
            SubCategory:   drp_SubCategory.Selected.Value,
            TotalAmount:   Value(txt_Amount.Text),
            TaxAmount:     Value(txt_Tax.Text),
            PaymentMethod: drp_Payment.Selected.Value,
            CardName:      If(drp_Payment.Selected.Value = "카드",
                              drp_Card.Selected.Value, ""),
            Memo:          txt_Memo.Text,
            IsOCRVerified: true,
            ModifiedAt:    Now()
        }
    );
    Notify("수정되었습니다.", NotificationType.Success),

    // ── 신규 모드: 새 행 추가 ──
    If(
        // OCR/QR 모드: 플로우에서 이미 저장된 경우 → 업데이트만
        Or(loc_InputMode = "OCR", loc_InputMode = "QR") && !IsBlank(loc_ExpenseID),
        Patch(
            Tbl_Expenses,
            LookUp(Tbl_Expenses, ExpenseID = loc_ExpenseID),
            {
                Date:          loc_FormDate,
                StoreName:     txt_Store.Text,
                Category:      loc_CategoryCode,
                SubCategory:   drp_SubCategory.Selected.Value,
                TotalAmount:   Value(txt_Amount.Text),
                PaymentMethod: drp_Payment.Selected.Value,
                CardName:      If(drp_Payment.Selected.Value = "카드",
                                  drp_Card.Selected.Value, ""),
                Memo:          txt_Memo.Text,
                IsOCRVerified: true,
                ModifiedAt:    Now()
            }
        ),

        // 직접 입력 / 바코드: 새 행 생성
        Set(
            loc_NewID,
            "EXP-" & var_CurrentYearMonth & "-" &
            Text(
                CountRows(Filter(Tbl_Expenses,
                    StartsWith(ExpenseID, "EXP-" & var_CurrentYearMonth))) + 1,
                "00000"
            )
        );
        Patch(
            Tbl_Expenses,
            Defaults(Tbl_Expenses),
            {
                ExpenseID:       loc_NewID,
                Date:            loc_FormDate,
                StoreName:       txt_Store.Text,
                Category:        loc_CategoryCode,
                SubCategory:     drp_SubCategory.Selected.Value,
                TotalAmount:     loc_FormAmount,
                TaxAmount:       Value(txt_Tax.Text),
                PaymentMethod:   drp_Payment.Selected.Value,
                CardName:        If(drp_Payment.Selected.Value = "카드",
                                    drp_Card.Selected.Value, ""),
                ReceiptImagePath: loc_FormImagePath,
                OCRConfidence:   loc_Confidence,
                IsOCRVerified:   true,
                Memo:            txt_Memo.Text,
                CreatedBy:       var_CurrentUser,
                CreatedAt:       Now(),
                Status:          "Active"
            }
        )
    );
    Notify("저장되었습니다.", NotificationType.Success)
);

// 저장 후 목록 갱신 및 이동
ClearCollect(
    col_ThisMonthExpenses,
    Filter(Tbl_Expenses, Status = "Active",
           Text(Date, "yyyymm") = var_CurrentYearMonth)
);
Set(loc_IsSaving, false);
Navigate(Scr_Home, ScreenTransition.Fade)
```

---

## Scr_List → Scr_AddExpense 수정 진입

```powerapps
// 목록 갤러리 항목 탭 시 (gal_ExpenseList.OnSelect)
Set(var_SelectedExpense, ThisItem);
UpdateContext({loc_InputMode: "Edit"});
Navigate(Scr_AddExpense, ScreenTransition.Fade)
```

---

## 삭제 버튼 (수정 모드 전용)

```powerapps
// btn_Delete.Visible
loc_IsEdit = true

// btn_Delete.OnSelect
If(
    Confirm(
        "'" & var_SelectedExpense.StoreName & "' 항목을 삭제할까요?" &
        Char(10) & "삭제된 항목은 관리자만 복구할 수 있습니다.",
        {ConfirmButton: "삭제", CancelButton: "취소"}
    ),
    // 논리적 삭제: Status 변경
    Patch(
        Tbl_Expenses,
        LookUp(Tbl_Expenses, ExpenseID = loc_ExpenseID),
        {
            Status:     "Deleted",
            ModifiedAt: Now()
        }
    );
    ClearCollect(
        col_ThisMonthExpenses,
        Filter(Tbl_Expenses, Status = "Active",
               Text(Date, "yyyymm") = var_CurrentYearMonth)
    );
    Notify("삭제되었습니다.", NotificationType.Success);
    Navigate(Scr_List, ScreenTransition.Back)
)
```

---

## 입력 화면 컨트롤 조건부 표시

| 컨트롤 | 표시 조건 |
|---|---|
| 입력 방법 선택 버튼 3개 | `loc_IsEdit = false` |
| 영수증 이미지 미리보기 | `!IsBlank(loc_FormImagePath)` |
| OCR 신뢰도 경고 | `loc_Confidence < 0.75 && loc_InputMode = "OCR"` |
| 카드사 선택 드롭다운 | `drp_Payment.Selected.Value = "카드"` |
| 수량 입력 | `loc_InputMode = "Barcode"` |
| 수량 × 단가 계산 레이블 | `loc_InputMode = "Barcode"` |
| 삭제 버튼 | `loc_IsEdit = true` |

---

## 지역 변수 전체 목록 (Scr_AddExpense)

| 변수명 | 타입 | 설명 |
|---|---|---|
| `loc_InputMode` | 텍스트 | `OCR` / `QR` / `Barcode` / `Manual` / `Edit` |
| `loc_IsEdit` | 불리언 | 수정 모드 여부 |
| `loc_IsSaving` | 불리언 | 저장 중 로딩 상태 |
| `loc_FormDate` | 날짜 | 폼 날짜 값 |
| `loc_FormStore` | 텍스트 | 폼 상호명 값 |
| `loc_FormAmount` | 숫자 | 폼 금액 값 |
| `loc_FormTax` | 숫자 | 폼 세액 값 |
| `loc_FormPayment` | 텍스트 | 폼 결제수단 값 |
| `loc_FormMemo` | 텍스트 | 폼 메모 값 |
| `loc_FormImagePath` | 텍스트 | 영수증 이미지 경로 |
| `loc_ExpenseID` | 텍스트 | 기존 레코드 ID (신규 시 빈값) |
| `loc_Confidence` | 숫자 | OCR 신뢰도 |
| `loc_NewID` | 텍스트 | 신규 생성 ExpenseID |
| `loc_Quantity` | 숫자 | 수량 (바코드 모드) |
| `loc_PrefilledData` | 레코드 | OCR/QR/바코드 자동입력 데이터 |
