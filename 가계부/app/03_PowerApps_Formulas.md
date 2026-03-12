# Power Apps Canvas App 설계 — 가계부

## 앱 구성 개요

```
가계부 앱 (Canvas App)
├── Scr_Home          — 홈 화면 (이달 요약 + 빠른 입력)
├── Scr_AddExpense    — 지출 추가 (영수증 촬영 포함)
├── Scr_AddIncome     — 수입 추가
├── Scr_List          — 내역 목록 (검색/필터)
├── Scr_Detail        — 상세/수정
├── Scr_Budget        — 예산 관리
└── Scr_Report        — 월별 리포트
```

---

## 데이터 소스 연결

```powerapps
// OnApp Start (App.OnStart)
Set(var_ExcelFile, "가계부.xlsx");
Set(var_OneDrivePath, "/가계부/");
Set(var_CurrentUser, User().Email);
Set(var_CurrentYearMonth, Text(Today(), "yyyymm"));

// Excel 테이블 연결 (데이터 소스에 추가 필요)
// - ExcelOnlineBusiness.가계부.Tbl_Expenses
// - ExcelOnlineBusiness.가계부.Tbl_Income
// - ExcelOnlineBusiness.가계부.Tbl_Budget
// - ExcelOnlineBusiness.가계부.Tbl_Categories

// 카테고리 목록 로드
ClearCollect(
    col_Categories,
    Filter(Tbl_Categories, true)
);

// 이번 달 지출 로드
ClearCollect(
    col_ThisMonthExpenses,
    Filter(
        Tbl_Expenses,
        Status = "Active",
        Text(Date, "yyyymm") = var_CurrentYearMonth
    )
);
```

---

## Scr_Home — 홈 화면

### 레이아웃
```
┌─────────────────────────────────┐
│  [월 선택 ◀  2026년 3월  ▶]      │
├─────────────────────────────────┤
│  수입   ₩2,500,000               │
│  지출   ₩1,234,000               │
│  잔액   ₩1,266,000  ✅           │
├─────────────────────────────────┤
│  카테고리별 지출 (도넛 차트)        │
├─────────────────────────────────┤
│  최근 내역                        │
│  • 이마트  식비  -35,400          │
│  • 카카오T 교통비 -8,500          │
├─────────────────────────────────┤
│  [📷 영수증 촬영]  [✏️ 직접 입력]   │
└─────────────────────────────────┘
```

### 주요 수식

```powerapps
// 이번 달 총 지출
lbl_TotalExpense.Text =
    Text(
        Sum(col_ThisMonthExpenses, TotalAmount),
        "₩#,##0"
    )

// 이번 달 총 수입
lbl_TotalIncome.Text =
    Text(
        Sum(
            Filter(Tbl_Income, Status="Active",
                   Text(Date,"yyyymm")=var_CurrentYearMonth),
            Amount
        ),
        "₩#,##0"
    )

// 잔액 색상 (양수 = 파란색, 음수 = 빨간색)
lbl_Balance.Color =
    If(
        Sum(col_ThisMonthExpenses, TotalAmount) <=
            Sum(Filter(Tbl_Income,...), Amount),
        RGBA(0, 120, 215, 1),   // 파란색
        RGBA(200, 0, 0, 1)      // 빨간색
    )

// 최근 내역 갤러리
gal_RecentExpenses.Items =
    FirstN(
        SortByColumns(
            Filter(col_ThisMonthExpenses, Status = "Active"),
            "Date", Descending,
            "CreatedAt", Descending
        ),
        10
    )
```

---

## Scr_AddExpense — 지출 추가 화면

### 레이아웃
```
┌─────────────────────────────────┐
│  ← 지출 추가                     │
├─────────────────────────────────┤
│                                 │
│  [  📷 영수증 촬영하기  ]         │
│  [  🖼️ 갤러리에서 선택  ]         │
│                                 │
│  ─────── 또는 직접 입력 ──────   │
│                                 │
│  날짜:   [2026-03-12      📅]   │
│  금액:   [          원]          │
│  상호명: [                    ]  │
│  카테고리: [식비            ▼]   │
│  결제수단: [카드            ▼]   │
│  메모:   [                    ]  │
│                                 │
│       [  저장  ]                 │
└─────────────────────────────────┘
```

### 영수증 촬영 로직

```powerapps
// btn_TakePhoto.OnSelect
Set(loc_IsLoading, true);
Set(loc_PhotoSource, "camera");

// 카메라 컨트롤 사용 (CameraControl.Photo)
// 또는 AddMediaButton 사용 (갤러리 선택)

// OCR 처리 (Power Automate 플로우 호출)
Set(
    loc_OCRResult,
    Flow_ReceiptOCR_Process.Run(
        JSON(CameraControl1.Photo, JSONFormat.IncludeBinaryData),
        "receipt_" & Text(Now(), "yyyyMMdd_HHmmss") & ".jpg",
        var_CurrentUser,
        Text(Today(), "yyyy-mm-dd"),
        "OTHER"
    )
);

// OCR 결과를 폼에 자동 입력
If(
    loc_OCRResult.Status = "success",
    UpdateContext({
        loc_StoreName:   loc_OCRResult.StoreName,
        loc_Date:        DateValue(loc_OCRResult.Date),
        loc_Amount:      Value(loc_OCRResult.TotalAmount),
        loc_Confidence:  loc_OCRResult.OCRConfidence,
        loc_ImagePath:   loc_OCRResult.ImagePath,
        loc_ExpenseID:   loc_OCRResult.ExpenseID
    }),
    Notify("OCR 처리 실패. 직접 입력해주세요.", NotificationType.Warning)
);

Set(loc_IsLoading, false);
```

### 저장 로직 (OCR 검증 + 수정 저장)

```powerapps
// btn_Save.OnSelect
If(
    // 필수 항목 검증
    IsBlank(txt_Amount.Text) || IsBlank(txt_StoreName.Text),
    Notify("금액과 상호명은 필수 입력 항목입니다.", NotificationType.Error),

    // 저장 처리
    If(
        IsBlank(loc_ExpenseID),

        // 신규 저장 (직접 입력 경우)
        Set(
            loc_NewExpenseID,
            "EXP-" & var_CurrentYearMonth & "-" &
            Text(CountRows(Filter(Tbl_Expenses,
                StartsWith(ExpenseID, "EXP-" & var_CurrentYearMonth))) + 1,
                "00000")
        );
        Patch(
            Tbl_Expenses,
            Defaults(Tbl_Expenses),
            {
                ExpenseID:     loc_NewExpenseID,
                Date:          DatePicker_Date.SelectedDate,
                StoreName:     txt_StoreName.Text,
                Category:      drp_Category.Selected.CategoryCode,
                TotalAmount:   Value(txt_Amount.Text),
                PaymentMethod: drp_Payment.Selected.Value,
                Memo:          txt_Memo.Text,
                IsOCRVerified: false,
                CreatedBy:     var_CurrentUser,
                CreatedAt:     Now(),
                Status:        "Active"
            }
        ),

        // OCR 결과 수정 저장 (IsOCRVerified = true로 변경)
        Patch(
            Tbl_Expenses,
            LookUp(Tbl_Expenses, ExpenseID = loc_ExpenseID),
            {
                Date:          DatePicker_Date.SelectedDate,
                StoreName:     txt_StoreName.Text,
                Category:      drp_Category.Selected.CategoryCode,
                TotalAmount:   Value(txt_Amount.Text),
                PaymentMethod: drp_Payment.Selected.Value,
                Memo:          txt_Memo.Text,
                IsOCRVerified: true,
                ModifiedAt:    Now()
            }
        )
    );

    // 저장 후 처리
    ClearCollect(col_ThisMonthExpenses,
        Filter(Tbl_Expenses, Status="Active",
               Text(Date,"yyyymm")=var_CurrentYearMonth));
    Notify("저장되었습니다.", NotificationType.Success);
    Navigate(Scr_Home, ScreenTransition.Fade)
)
```

---

## Scr_List — 내역 목록 화면

### 필터 수식

```powerapps
// 검색 + 카테고리 필터 + 기간 필터
gal_ExpenseList.Items =
    SortByColumns(
        Filter(
            Tbl_Expenses,
            Status = "Active",
            // 기간 필터
            Date >= DatePicker_Start.SelectedDate,
            Date <= DatePicker_End.SelectedDate,
            // 카테고리 필터 (전체 선택 시 무시)
            If(drp_CategoryFilter.Selected.CategoryCode = "ALL",
               true,
               Category = drp_CategoryFilter.Selected.CategoryCode),
            // 검색어 필터
            If(IsBlank(txt_Search.Text),
               true,
               Or(
                   StoreName in txt_Search.Text,
                   Memo in txt_Search.Text
               ))
        ),
        "Date", Descending
    )

// 필터된 합계
lbl_FilteredTotal.Text =
    Text(
        Sum(gal_ExpenseList.AllItems, TotalAmount),
        "합계: ₩#,##0"
    )
```

---

## Scr_Detail — 상세/수정 화면

### 논리적 삭제 수식

```powerapps
// btn_Delete.OnSelect
If(
    Confirm("정말 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다."),
    // 논리적 삭제 (Status 변경)
    Patch(
        Tbl_Expenses,
        LookUp(Tbl_Expenses, ExpenseID = var_SelectedExpense.ExpenseID),
        {
            Status:     "Deleted",
            ModifiedAt: Now()
        }
    );
    Notify("삭제되었습니다.", NotificationType.Success);
    Navigate(Scr_List, ScreenTransition.Back)
)
```

### 영수증 이미지 표시

```powerapps
// 영수증 이미지 뷰어
img_Receipt.Image =
    If(
        IsBlank(var_SelectedExpense.ReceiptImagePath),
        // 기본 이미지
        SampleImage,
        // OneDrive 이미지 로드
        // (Office365Users 또는 OneDrive 커넥터 사용)
        OneDriveForBusiness.GetFileContent(
            var_SelectedExpense.ReceiptImagePath
        )
    )
```

---

## Scr_Report — 월별 리포트 화면

### 카테고리별 지출 집계

```powerapps
// 카테고리별 집계 컬렉션
ClearCollect(
    col_CategorySummary,
    AddColumns(
        GroupBy(
            Filter(col_ThisMonthExpenses, Status = "Active"),
            "Category",
            "CategoryItems"
        ),
        "TotalAmount", Sum(CategoryItems, TotalAmount),
        "Count",       CountRows(CategoryItems)
    )
);

// 갤러리 정렬 (금액 내림차순)
gal_CategoryReport.Items =
    SortByColumns(col_CategorySummary, "TotalAmount", Descending)
```

### 예산 대비 실적 바 차트

```powerapps
// 카테고리별 예산 달성률
AddColumns(
    col_CategorySummary,
    "BudgetAmount",
        LookUp(Tbl_Budget,
               YearMonth = var_CurrentYearMonth && Category = ThisRecord.Category,
               BudgetAmount),
    "UsageRate",
        If(
            IsBlank(LookUp(Tbl_Budget, ...)),
            0,
            ThisRecord.TotalAmount /
            LookUp(Tbl_Budget, ..., BudgetAmount) * 100
        ),
    "BarColor",
        If(ThisRecord.UsageRate > 100,
           RGBA(200, 0, 0, 1),      // 초과: 빨간색
           If(ThisRecord.UsageRate > 80,
              RGBA(255, 165, 0, 1), // 주의: 주황색
              RGBA(0, 150, 0, 1)))  // 정상: 초록색
)
```

---

## 전역 변수 목록

| 변수명 | 타입 | 설명 |
|---|---|---|
| `var_ExcelFile` | 텍스트 | Excel 파일명 |
| `var_OneDrivePath` | 텍스트 | OneDrive 기본 경로 |
| `var_CurrentUser` | 텍스트 | 현재 사용자 이메일 |
| `var_CurrentYearMonth` | 텍스트 | 현재 연월 (yyyymm) |
| `var_SelectedExpense` | 레코드 | 선택된 지출 항목 |

## 지역 변수 목록

| 변수명 | 타입 | 사용 화면 | 설명 |
|---|---|---|---|
| `loc_IsLoading` | 불리언 | AddExpense | 로딩 상태 |
| `loc_OCRResult` | 레코드 | AddExpense | OCR 처리 결과 |
| `loc_ExpenseID` | 텍스트 | AddExpense | OCR로 생성된 ID |
| `loc_StoreName` | 텍스트 | AddExpense | OCR 추출 상호명 |
| `loc_Amount` | 숫자 | AddExpense | OCR 추출 금액 |
| `loc_Confidence` | 숫자 | AddExpense | OCR 신뢰도 |

## 컬렉션 목록

| 컬렉션명 | 설명 |
|---|---|
| `col_Categories` | 카테고리 마스터 목록 |
| `col_ThisMonthExpenses` | 이번 달 지출 목록 |
| `col_CategorySummary` | 카테고리별 집계 |

---

## 모바일/PC 반응형 처리

```powerapps
// App.Width, App.Height 기준 반응형 레이아웃
// 모바일: 너비 < 600
// 태블릿: 600 <= 너비 < 1024
// PC: 너비 >= 1024

// 예시: 폰트 크기 자동 조정
lbl_Title.Size =
    If(App.Width < 600, 16,
       If(App.Width < 1024, 18, 20))

// 갤러리 열 수
gal_ExpenseList.WrapCount =
    If(App.Width < 600, 1, 2)
```
