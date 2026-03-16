# Power Apps — 다중 사용자 화면 설계

## 전체 화면 흐름

```
앱 시작 (Scr_Loading)
    │
    ▼
[내 담당 인원 조회]
    │
    ├── 담당 인원 1명  →  Scr_ResidentHome (바로 진입)
    └── 담당 인원 여러 명 → Scr_ResidentSelect (인원 선택)
                                    │
                                    ▼
                            Scr_ResidentHome  ← 선택된 인원의 가계부 홈
                                    │
                    ┌───────────────┼──────────────────┐
                    ▼               ▼                  ▼
             Scr_AddExpense   Scr_List          Scr_Report
             (입력/수정)      (내역 목록)        (리포트)
```

---

## Scr_Loading — 앱 시작 / 사용자 초기화

```powerapps
// App.OnStart
Set(var_CurrentUser,  User().Email);
Set(var_CurrentName,  User().FullName);
Set(var_IsAdmin, false);

// 내 담당 인원 목록 로드
ClearCollect(
    col_MyResidents,
    AddColumns(
        Filter(
            Tbl_StaffAssignment,
            StaffEmail = var_CurrentUser,
            Status     = "Active"
        ),
        // 인원 이름·팀 합류
        "ResidentName",
            LookUp(Tbl_Residents, ResidentID = ThisRecord.ResidentID, Name),
        "ResidentTeam",
            LookUp(Tbl_Residents, ResidentID = ThisRecord.ResidentID, Team),
        "ResidentStatus",
            LookUp(Tbl_Residents, ResidentID = ThisRecord.ResidentID, Status)
    )
);

// 관리자 여부 확인
Set(
    var_IsAdmin,
    !IsBlank(
        LookUp(col_MyResidents, Role = "Admin")
    )
);

// 화면 분기
If(
    CountRows(col_MyResidents) = 0,
        Navigate(Scr_NoAccess, ScreenTransition.None),
    CountRows(col_MyResidents) = 1,
        Set(var_SelectedResident,
            LookUp(Tbl_Residents,
                   ResidentID = First(col_MyResidents).ResidentID));
        Navigate(Scr_ResidentHome, ScreenTransition.None),
    // 여러 명
        Navigate(Scr_ResidentSelect, ScreenTransition.None)
)
```

---

## Scr_ResidentSelect — 담당 인원 선택 화면

### 레이아웃

```
┌──────────────────────────────────┐
│  안녕하세요, 김복지님  👤          │
│  담당 인원을 선택해주세요          │
├──────────────────────────────────┤
│  🔍 [이름 검색...              ]  │
├──────────────────────────────────┤
│ ┌────────────────────────────┐  │
│ │ 홍길동          1팀  주담당  │  │
│ │ 이번 달 지출 ₩234,000       │  │
│ └────────────────────────────┘  │
│ ┌────────────────────────────┐  │
│ │ 김영희          2팀  보조   │  │
│ │ 이번 달 지출 ₩178,000       │  │
│ └────────────────────────────┘  │
│          ... (스크롤)             │
├──────────────────────────────────┤
│  [관리자: 전체 인원 보기]          │  ← Admin만 표시
└──────────────────────────────────┘
```

### 주요 수식

```powerapps
// 갤러리 항목: 검색 필터 적용
gal_Residents.Items =
    SortByColumns(
        Filter(
            col_MyResidents,
            ResidentStatus = "Active",
            If(IsBlank(txt_Search.Text),
               true,
               ResidentName in txt_Search.Text)
        ),
        "ResidentName", Ascending
    )

// 갤러리 항목 탭 → 인원 선택
gal_Residents.OnSelect =
    Set(
        var_SelectedResident,
        LookUp(Tbl_Residents, ResidentID = ThisItem.ResidentID)
    );
    // 이번 달 지출 로드
    ClearCollect(
        col_ResidentExpenses,
        Filter(
            Tbl_Expenses,
            ResidentID = var_SelectedResident.ResidentID,
            Status     = "Active",
            Text(Date, "yyyymm") = var_CurrentYearMonth
        )
    );
    Navigate(Scr_ResidentHome, ScreenTransition.Fade)

// 각 항목의 이번 달 지출 표시
lbl_MonthlyTotal.Text =
    Text(
        Sum(
            Filter(Tbl_Expenses,
                   ResidentID = ThisItem.ResidentID,
                   Status = "Active",
                   Text(Date,"yyyymm") = var_CurrentYearMonth),
            TotalAmount
        ),
        "이번 달 지출 ₩#,##0"
    )

// 관리자 전체 인원 보기 버튼
btn_AdminView.Visible = var_IsAdmin
btn_AdminView.OnSelect =
    ClearCollect(
        col_MyResidents,
        AddColumns(
            Filter(Tbl_StaffAssignment, Status = "Active"),
            "ResidentName",
                LookUp(Tbl_Residents, ResidentID = ThisRecord.ResidentID, Name),
            "ResidentTeam",
                LookUp(Tbl_Residents, ResidentID = ThisRecord.ResidentID, Team),
            "ResidentStatus",
                LookUp(Tbl_Residents, ResidentID = ThisRecord.ResidentID, Status)
        )
    )
```

---

## Scr_ResidentHome — 선택된 인원의 가계부 홈

### 레이아웃

```
┌──────────────────────────────────┐
│ ← 인원 선택    홍길동 (1팀)  👤   │
├──────────────────────────────────┤
│  [◀  2026년 3월  ▶]              │
├──────────────────────────────────┤
│  수입   ₩800,000                  │
│  지출   ₩234,000                  │
│  잔액   ₩566,000  ✅              │
├──────────────────────────────────┤
│  카테고리별 지출 (도넛 차트)        │
├──────────────────────────────────┤
│  최근 내역                         │
│  • 이마트  식비  -35,400  김복지   │  ← 입력자 표시
│  • 카카오T 교통비 -8,500  이담당   │
├──────────────────────────────────┤
│  [📷 촬영]  [📱 스캔]  [✏️ 직접]   │
└──────────────────────────────────┘
```

### 주요 수식

```powerapps
// 화면 제목
lbl_ResidentName.Text =
    var_SelectedResident.Name & " (" & var_SelectedResident.Team & ")"

// 뒤로 가기: 담당 인원이 1명이면 버튼 숨김
btn_Back.Visible = CountRows(col_MyResidents) > 1

// 이번 달 지출 (선택된 인원만)
lbl_TotalExpense.Text =
    Text(
        Sum(col_ResidentExpenses, TotalAmount),
        "₩#,##0"
    )

// 최근 내역 갤러리 (입력자 표시 포함)
gal_Recent.Items =
    FirstN(
        SortByColumns(col_ResidentExpenses, "CreatedAt", Descending),
        10
    )
lbl_CreatedBy.Text =
    // 이메일에서 이름만 추출 (예: kim@org.com → kim)
    Left(ThisItem.CreatedBy, Find("@", ThisItem.CreatedBy) - 1)

// 입력 버튼 → 담당 인원 컨텍스트 유지하며 이동
btn_Camera.OnSelect =
    UpdateContext({loc_InputMode: "OCR"});
    Navigate(Scr_AddExpense, ScreenTransition.Fade)

btn_Scan.OnSelect =
    UpdateContext({loc_InputMode: "Scan"});  // BarcodeScanner 화면으로
    Navigate(Scr_ScanInput, ScreenTransition.Fade)

btn_Manual.OnSelect =
    UpdateContext({loc_InputMode: "Manual"});
    Navigate(Scr_AddExpense, ScreenTransition.Fade)
```

---

## Scr_AddExpense — 입력/수정 화면 (ResidentID 반영)

### 저장 수식 업데이트

```powerapps
// 신규 저장 시 ResidentID 추가
Patch(
    Tbl_Expenses,
    Defaults(Tbl_Expenses),
    {
        ResidentID:    var_SelectedResident.ResidentID,  // ← 추가
        ExpenseID:     loc_NewID,
        Date:          loc_FormDate,
        StoreName:     txt_Store.Text,
        Category:      loc_CategoryCode,
        TotalAmount:   loc_FormAmount,
        PaymentMethod: drp_Payment.Selected.Value,
        InputType:     loc_InputMode,
        IsOCRVerified: true,
        CreatedBy:     var_CurrentUser,
        CreatedAt:     Now(),
        Status:        "Active",
        LockedBy:      "",  // ← 신규는 Lock 없음
        LockedAt:      ""
    }
)
```

---

## Scr_ScanInput — 스캔 전용 화면

```powerapps
// BarcodeScanner 컨트롤 (전체 화면 카메라 뷰)
// 스캔 완료 시 자동 처리 후 Scr_AddExpense로 이동

BarcodeScanner1.OnScan =
    Set(loc_ScannedValue, BarcodeScanner1.Value);
    Set(loc_BarcodeType,  BarcodeScanner1.BarcodeType);
    Set(loc_IsLoading,    true);

    If(
        loc_BarcodeType = BarcodeType.QR Or
        StartsWith(loc_ScannedValue, "http"),

        Set(loc_QRResult,
            Flow_QRReceipt_Process.Run(
                loc_ScannedValue, var_CurrentUser, "OTHER"
            ));
        UpdateContext({
            loc_InputMode:      "QR",
            loc_PrefilledData:  loc_QRResult
        }),

        Set(loc_BarcodeResult,
            Flow_Barcode_Lookup.Run(
                loc_ScannedValue, var_CurrentUser
            ));
        UpdateContext({
            loc_InputMode:      "Barcode",
            loc_PrefilledData:  loc_BarcodeResult
        })
    );

    Set(loc_IsLoading, false);
    Navigate(Scr_AddExpense, ScreenTransition.Fade)
```

---

## Soft Lock — 수정 시 진입 로직

```powerapps
// 목록에서 항목 탭 시 (수정 모드 진입)
gal_ExpenseList.OnSelect =
    Set(var_SelectedExpense, ThisItem);

    // Lock 상태 확인
    If(
        // 1. Lock 없음 → 바로 수정
        IsBlank(ThisItem.LockedBy),
        Patch(Tbl_Expenses,
              LookUp(Tbl_Expenses, ExpenseID = ThisItem.ExpenseID),
              {LockedBy: var_CurrentUser, LockedAt: Now()});
        UpdateContext({loc_InputMode: "Edit"});
        Navigate(Scr_AddExpense, ScreenTransition.Fade),

        // 2. 내가 잠근 항목 → 바로 수정
        ThisItem.LockedBy = var_CurrentUser,
        UpdateContext({loc_InputMode: "Edit"});
        Navigate(Scr_AddExpense, ScreenTransition.Fade),

        // 3. Lock 만료 (1시간 초과) → 강제 획득
        DateDiff(ThisItem.LockedAt, Now(), TimeUnit.Minutes) > 60,
        Patch(Tbl_Expenses,
              LookUp(Tbl_Expenses, ExpenseID = ThisItem.ExpenseID),
              {LockedBy: var_CurrentUser, LockedAt: Now()});
        UpdateContext({loc_InputMode: "Edit"});
        Navigate(Scr_AddExpense, ScreenTransition.Fade),

        // 4. 다른 사람이 수정 중 → 알림
        Notify(
            ThisItem.LockedBy & "님이 현재 수정 중입니다." &
            Char(10) &
            "잠금 해제까지 약 " &
            Text(60 - DateDiff(ThisItem.LockedAt, Now(), TimeUnit.Minutes)) &
            "분 남았습니다.",
            NotificationType.Warning,
            5000
        )
    )

// 수정 저장 완료 / 취소 시 Lock 해제
// btn_Save.OnSelect 마지막에:
Patch(Tbl_Expenses,
      LookUp(Tbl_Expenses, ExpenseID = loc_ExpenseID),
      {LockedBy: "", LockedAt: Blank()});

// btn_Cancel.OnSelect:
Patch(Tbl_Expenses,
      LookUp(Tbl_Expenses, ExpenseID = loc_ExpenseID),
      {LockedBy: "", LockedAt: Blank()});
Navigate(Scr_List, ScreenTransition.Back)
```

---

## 전역 변수 업데이트 (다중 사용자 추가분)

| 변수명 | 타입 | 설명 |
|---|---|---|
| `var_CurrentUser` | 텍스트 | 현재 복지사 이메일 |
| `var_CurrentName` | 텍스트 | 현재 복지사 이름 |
| `var_IsAdmin` | 불리언 | 관리자 여부 |
| `var_SelectedResident` | 레코드 | 현재 선택된 담당 인원 |

## 컬렉션 업데이트

| 컬렉션명 | 설명 |
|---|---|
| `col_MyResidents` | 내 담당 인원 목록 |
| `col_ResidentExpenses` | 선택된 인원의 이번 달 지출 |

---

## 화면 전체 목록 (최종)

| 화면명 | 설명 |
|---|---|
| `Scr_Loading` | 앱 시작, 사용자 초기화, 화면 분기 |
| `Scr_NoAccess` | 담당 인원 없음 안내 |
| `Scr_ResidentSelect` | 담당 인원 선택 |
| `Scr_ResidentHome` | 선택된 인원 가계부 홈 |
| `Scr_ScanInput` | QR/바코드 스캔 전용 |
| `Scr_AddExpense` | 통합 입력/수정 (OCR·QR·바코드·직접·수정) |
| `Scr_AddIncome` | 수입 추가 |
| `Scr_List` | 지출 내역 목록 |
| `Scr_Budget` | 예산 관리 |
| `Scr_Report` | 월별 리포트 |
| `Scr_Admin` | 관리자 전용: 인원 등록/담당 배정 |
