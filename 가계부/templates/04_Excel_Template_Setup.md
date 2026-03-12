# Excel 템플릿 설정 가이드 — 가계부.xlsx

> 이 가이드를 따라 OneDrive에 Excel 파일을 생성하고 테이블을 설정합니다.

---

## 1. OneDrive 폴더 생성

1. OneDrive (또는 SharePoint) 접속
2. 루트에 `가계부` 폴더 생성
3. `가계부` 폴더 안에 `receipts` 폴더 생성

```
OneDrive/
└── 가계부/
    ├── 가계부.xlsx      ← 여기 생성
    └── receipts/        ← 영수증 이미지 저장 폴더
```

---

## 2. Excel 파일 생성 및 시트 구성

### 시트 목록
| 시트명 | 테이블명 | 설명 |
|---|---|---|
| `지출내역` | `Tbl_Expenses` | 지출 데이터 |
| `수입내역` | `Tbl_Income` | 수입 데이터 |
| `예산` | `Tbl_Budget` | 월별 예산 |
| `카테고리` | `Tbl_Categories` | 카테고리 마스터 |
| `월별집계` | `Tbl_Summary` | 자동 집계 |

---

## 3. 각 시트 테이블 헤더 설정

### Tbl_Expenses (지출내역 시트)
A1부터 순서대로 입력:
```
ExpenseID | Date | StoreName | Category | SubCategory | TotalAmount | TaxAmount | PaymentMethod | CardName | ReceiptImagePath | OCRConfidence | IsOCRVerified | Memo | CreatedBy | CreatedAt | ModifiedAt | Status
```

### Tbl_Income (수입내역 시트)
```
IncomeID | Date | Source | Category | Amount | Memo | CreatedBy | CreatedAt | Status
```

### Tbl_Budget (예산 시트)
```
BudgetID | YearMonth | Category | BudgetAmount | CreatedBy | ModifiedAt
```

### Tbl_Categories (카테고리 시트)
헤더 입력 후 아래 기본 데이터 입력:
```
CategoryCode | CategoryName | SubCategories | Icon | SortOrder
FOOD         | 식비          | 식료품;외식;배달;카페 | 🍽️ | 1
TRANSPORT    | 교통비        | 대중교통;주유;주차;택시 | 🚌 | 2
HOUSING      | 주거/관리비   | 월세;관리비;공과금;인터넷/통신 | 🏠 | 3
HEALTH       | 의료/건강     | 병원;약국;운동/헬스 | 💊 | 4
EDUCATION    | 교육          | 학원;교재;온라인강의 | 📚 | 5
CULTURE      | 문화/여가     | 영화/공연;여행;취미 | 🎬 | 6
SHOPPING     | 쇼핑          | 의류;전자제품;생활용품 | 🛒 | 7
FINANCE      | 금융          | 보험;저축;대출상환 | 💰 | 8
OTHER        | 기타          | 기타 | 📌 | 9
```

### Tbl_Summary (월별집계 시트)
```
SummaryID | YearMonth | TotalIncome | TotalExpense | Balance | ExpenseByCategory | GeneratedAt
```

---

## 4. Excel 테이블 변환

각 시트에서:
1. 헤더 포함 데이터 영역 선택
2. **삽입 → 표** 클릭
3. "머리글 포함" 체크
4. 표 이름 변경: **표 디자인 탭 → 표 이름** 입력

---

## 5. 컬럼 형식 지정

### Tbl_Expenses 형식
| 컬럼 | Excel 형식 |
|---|---|
| `Date` | 날짜 (yyyy-mm-dd) |
| `TotalAmount`, `TaxAmount` | 숫자 (소수점 없음) |
| `OCRConfidence` | 숫자 (소수점 2자리) |
| `IsOCRVerified` | TRUE/FALSE |
| `CreatedAt`, `ModifiedAt` | 날짜/시간 |

---

## 6. Power Apps 데이터 소스 연결

1. Power Apps 스튜디오 열기
2. **데이터 → 데이터 추가** 클릭
3. **Excel Online (Business)** 선택
4. 위치: OneDrive for Business
5. 문서 라이브러리: OneDrive
6. 파일: `/가계부/가계부.xlsx`
7. 테이블 선택:
   - `Tbl_Expenses` ✅
   - `Tbl_Income` ✅
   - `Tbl_Budget` ✅
   - `Tbl_Categories` ✅
   - `Tbl_Summary` ✅

---

## 7. Power Automate 연결 설정

1. Power Automate 열기
2. `Flow_ReceiptOCR_Process` 플로우 생성
3. 커넥터 연결:
   - **Excel Online (Business)**: 위와 동일한 파일 경로
   - **OneDrive for Business**: `/가계부/receipts/` 경로
   - **AI Builder**: 영수증 처리 모델
4. Power Apps에서 플로우 호출 연결

---

## 8. 동시 편집 방지 설정

Excel Online에서 다수 사용자가 동시 편집할 경우 충돌 가능성이 있습니다.

### 권장 방법: Power Automate를 통한 단일 쓰기 경로
- **Power Apps에서 직접 Excel 쓰기 금지**
- **모든 쓰기 작업은 Power Automate 플로우를 통해서만** 수행
- 플로우 내 Excel 행 추가 액션에 **재시도 정책** 설정:
  - 재시도 횟수: 3
  - 재시도 간격: PT30S (30초)
  - 재시도 유형: Fixed interval

---

## 9. 백업 설정 (권장)

Power Automate 예약 플로우:
- **주기**: 매주 일요일 03:00
- **작업**: `가계부.xlsx` → `가계부_backup_{날짜}.xlsx` 복사
- **보관 경로**: `/가계부/backup/` 폴더
