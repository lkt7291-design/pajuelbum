# 가계부 데이터 스키마 설계

> 파일: `가계부.xlsx` (OneDrive 또는 SharePoint Document Library에 저장)
> 접근 방식: Power Apps + Excel Online 커넥터

---

## Excel 파일 구조

```
가계부.xlsx
├── Tbl_Expenses       ← 지출 내역 (메인)
├── Tbl_Income         ← 수입 내역
├── Tbl_Budget         ← 월별 예산 설정
├── Tbl_Categories     ← 카테고리 마스터
├── Tbl_BarcodeCache   ← 바코드 조회 결과 캐시 (신규)
└── Tbl_Summary        ← 월별 집계 (Power Automate 배치 갱신)
```

---

## Tbl_Expenses — 지출 내역

| 컬럼명 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `ExpenseID` | 텍스트 | ✅ | 고유 ID: `EXP-{연도}{월}{순번5자리}` |
| `ResidentID` | 텍스트 | ✅ | 담당 인원 ID (Tbl_Residents 참조) |
| `Date` | 날짜 | ✅ | 지출 날짜 |
| `StoreName` | 텍스트 | ✅ | 상호명 (OCR 추출) |
| `Category` | 텍스트 | ✅ | 카테고리 (아래 Tbl_Categories 참조) |
| `SubCategory` | 텍스트 |   | 세부 카테고리 |
| `TotalAmount` | 숫자 | ✅ | 합계 금액 (원) |
| `TaxAmount` | 숫자 |   | 부가세 금액 |
| `PaymentMethod` | 텍스트 | ✅ | 결제 수단: `현금`, `카드`, `계좌이체`, `기타` |
| `CardName` | 텍스트 |   | 카드사명 (결제 수단이 카드일 경우) |
| `ReceiptImagePath` | 텍스트 |   | OneDrive 내 영수증 이미지 경로 |
| `OCRConfidence` | 숫자 |   | AI Builder 인식 신뢰도 (0.00~1.00) |
| `IsOCRVerified` | 불리언 |   | 사용자 수동 검증 여부 |
| `InputType` | 텍스트 |   | 입력 방식: `OCR`, `QR`, `Barcode`, `Manual` |
| `Barcode` | 텍스트 |   | 스캔된 바코드 번호 (바코드 입력 시) |
| `Memo` | 텍스트 |   | 메모 |
| `CreatedBy` | 텍스트 | ✅ | 작성자 (Office 365 사용자명) |
| `CreatedAt` | 날짜시간 | ✅ | 생성 일시 |
| `ModifiedAt` | 날짜시간 |   | 최종 수정 일시 |
| `LockedBy` | 텍스트 |   | 현재 수정 중인 복지사 이메일 (Soft Lock) |
| `LockedAt` | 날짜시간 |   | 잠금 시작 시각 (60분 후 자동 만료) |
| `Status` | 텍스트 | ✅ | `Active` / `Deleted` (논리적 삭제) |

### ExpenseID 생성 규칙
```
EXP-202603-00001
     ↑연도↑↑월↑ ↑↑순번(5자리)↑↑
```

---

## Tbl_Income — 수입 내역

| 컬럼명 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `IncomeID` | 텍스트 | ✅ | 고유 ID: `INC-{연도}{월}{순번5자리}` |
| `Date` | 날짜 | ✅ | 수입 날짜 |
| `Source` | 텍스트 | ✅ | 수입 출처 (예: 급여, 부수입) |
| `Category` | 텍스트 | ✅ | 수입 카테고리 |
| `Amount` | 숫자 | ✅ | 금액 (원) |
| `Memo` | 텍스트 |   | 메모 |
| `CreatedBy` | 텍스트 | ✅ | 작성자 |
| `CreatedAt` | 날짜시간 | ✅ | 생성 일시 |
| `Status` | 텍스트 | ✅ | `Active` / `Deleted` |

---

## Tbl_Budget — 월별 예산

| 컬럼명 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `BudgetID` | 텍스트 | ✅ | `BDG-{연도}{월}-{카테고리코드}` |
| `YearMonth` | 텍스트 | ✅ | `202603` 형식 |
| `Category` | 텍스트 | ✅ | 카테고리명 |
| `BudgetAmount` | 숫자 | ✅ | 예산 금액 |
| `CreatedBy` | 텍스트 | ✅ | 작성자 |
| `ModifiedAt` | 날짜시간 |   | 최종 수정 일시 |

---

## Tbl_Categories — 카테고리 마스터

| 컬럼명 | 타입 | 설명 |
|---|---|---|
| `CategoryCode` | 텍스트 | 코드 (예: `FOOD`) |
| `CategoryName` | 텍스트 | 표시명 (예: `식비`) |
| `SubCategories` | 텍스트 | 세부 카테고리 목록 (`;` 구분) |
| `Icon` | 텍스트 | 이모지 아이콘 |
| `SortOrder` | 숫자 | 정렬 순서 |

### 기본 카테고리 목록

| 코드 | 명칭 | 세부 카테고리 |
|---|---|---|
| `FOOD` | 식비 | 식료품;외식;배달;카페 |
| `TRANSPORT` | 교통비 | 대중교통;주유;주차;택시 |
| `HOUSING` | 주거/관리비 | 월세;관리비;공과금;인터넷/통신 |
| `HEALTH` | 의료/건강 | 병원;약국;운동/헬스 |
| `EDUCATION` | 교육 | 학원;교재;온라인강의 |
| `CULTURE` | 문화/여가 | 영화/공연;여행;취미 |
| `SHOPPING` | 쇼핑 | 의류;전자제품;생활용품 |
| `FINANCE` | 금융 | 보험;저축;대출상환 |
| `OTHER` | 기타 | 기타 |

---

## Tbl_Summary — 월별 집계 (자동 생성)

| 컬럼명 | 타입 | 설명 |
|---|---|---|
| `SummaryID` | 텍스트 | `SUM-{연도}{월}` |
| `YearMonth` | 텍스트 | `202603` |
| `TotalIncome` | 숫자 | 총 수입 |
| `TotalExpense` | 숫자 | 총 지출 |
| `Balance` | 숫자 | 잔액 (수입 - 지출) |
| `ExpenseByCategory` | 텍스트 | JSON 형식 카테고리별 집계 |
| `GeneratedAt` | 날짜시간 | 집계 생성 시각 |

---

## Tbl_BarcodeCache — 바코드 조회 캐시 (신규)

> API 중복 호출 방지용. 동일 바코드는 캐시에서 즉시 반환.

| 컬럼명 | 타입 | 설명 |
|---|---|---|
| `Barcode` | 텍스트 | 바코드 번호 (EAN-13 등) |
| `ProductName` | 텍스트 | 상품명 |
| `Brand` | 텍스트 | 브랜드 |
| `Category` | 텍스트 | 카테고리 코드 |
| `UnitPrice` | 숫자 | 단위 가격 (있을 경우) |
| `CachedAt` | 날짜시간 | 캐시 저장 시각 |

---

## 입력 방식별 필드 활용

| 필드 | OCR (촬영) | QR (현금영수증) | Barcode (상품) | Manual (직접) |
|---|---|---|---|---|
| `StoreName` | OCR 자동 | QR 파싱 | 사용자 입력 | 사용자 입력 |
| `TotalAmount` | OCR 자동 | QR 파싱 | 수량×단가 계산 | 사용자 입력 |
| `TaxAmount` | OCR 자동 | QR 파싱 | 미입력 | 사용자 입력 |
| `PaymentMethod` | 기본값 | QR 파싱 | 기본값 | 사용자 선택 |
| `ReceiptImagePath` | 저장됨 | 미저장 | 미저장 | 미저장 |
| `OCRConfidence` | AI 반환값 | 1.00 | 1.00 | 1.00 |
| `IsOCRVerified` | 저장 시 true | 저장 시 true | 저장 시 true | 저장 시 true |
| `InputType` | `OCR` | `QR` | `Barcode` | `Manual` |
| `Barcode` | 미저장 | 미저장 | 저장됨 | 미저장 |

---

## OneDrive 폴더 구조

```
OneDrive/
└── 가계부/
    ├── 가계부.xlsx                  ← 메인 데이터 파일
    └── receipts/
        └── {연도}/{월}/
            └── {ExpenseID}_{날짜}.jpg   ← 영수증 이미지
```
