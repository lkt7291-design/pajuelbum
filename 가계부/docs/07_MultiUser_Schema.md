# 다중 사용자 / 담당자 관리 스키마 설계

## 시스템 구조 개요

```
복지사 A ─┐
복지사 B ─┤─▶ [가계부 앱] ─▶ 담당 입주자 선택 ─▶ 영수증 입력
복지사 C ─┘                  (Tbl_StaffAssignment 기반)

규칙:
  - 새 항목 추가: 동시 입력 허용 (충돌 없음)
  - 기존 항목 수정/삭제: Soft Lock (한 번에 한 명만)
  - Soft Lock 자동 해제: 1시간
```

---

## Excel 파일 구조 (전체 개정)

```
가계부.xlsx
├── Tbl_Residents        ← 담당 인원 목록 (신규)
├── Tbl_StaffAssignment  ← 복지사-인원 담당 매핑 (신규)
├── Tbl_Expenses         ← 지출 내역 (ResidentID 추가)
├── Tbl_Income           ← 수입 내역 (ResidentID 추가)
├── Tbl_Budget           ← 월별 예산 (ResidentID 추가)
├── Tbl_Categories       ← 카테고리 마스터 (공용, 변경 없음)
├── Tbl_BarcodeCache     ← 바코드 캐시 (공용, 변경 없음)
└── Tbl_Summary          ← 월별 집계 (ResidentID 추가)
```

---

## Tbl_Residents — 담당 인원 목록

| 컬럼명 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `ResidentID` | 텍스트 | ✅ | 고유 ID: `RES-{순번5자리}` (예: `RES-00001`) |
| `Name` | 텍스트 | ✅ | 이름 |
| `Team` | 텍스트 |   | 소속 팀 (예: `1팀`, `2팀`) |
| `MonthlyBudget` | 숫자 |   | 월 기본 예산 (원) |
| `StartDate` | 날짜 | ✅ | 관리 시작일 |
| `EndDate` | 날짜 |   | 관리 종료일 (종료 시 입력) |
| `Status` | 텍스트 | ✅ | `Active` / `Inactive` / `Deleted` |
| `Memo` | 텍스트 |   | 특이사항 |
| `CreatedBy` | 텍스트 | ✅ | 등록자 |
| `CreatedAt` | 날짜시간 | ✅ | 등록 일시 |
| `ModifiedAt` | 날짜시간 |   | 최종 수정 일시 |

### ResidentID 생성 규칙
```
RES-00001
     ↑↑↑ 순번 (5자리, 자동 채번)
```

---

## Tbl_StaffAssignment — 복지사-인원 담당 매핑

| 컬럼명 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `AssignmentID` | 텍스트 | ✅ | `ASN-{순번5자리}` |
| `ResidentID` | 텍스트 | ✅ | 담당 인원 ID |
| `StaffEmail` | 텍스트 | ✅ | 복지사 Office 365 이메일 |
| `StaffName` | 텍스트 | ✅ | 복지사 이름 |
| `Role` | 텍스트 | ✅ | `Primary` (주담당) / `Support` (보조담당) / `Admin` (관리자) |
| `StartDate` | 날짜 | ✅ | 담당 시작일 |
| `EndDate` | 날짜 |   | 담당 종료일 |
| `Status` | 텍스트 | ✅ | `Active` / `Inactive` |
| `CreatedBy` | 텍스트 | ✅ | 등록자 |
| `CreatedAt` | 날짜시간 | ✅ | 등록 일시 |

### 담당 규칙
- 한 인원에 복지사 여러 명 배정 가능 (Primary 1명, Support 다수)
- `Admin` 역할: 모든 인원의 가계부 접근 + 수정 가능
- `Status = Inactive`로 담당 종료 처리 (물리 삭제 금지)

---

## Tbl_Expenses 추가 필드 (ResidentID 반영)

기존 필드에 아래 3개 추가:

| 컬럼명 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `ResidentID` | 텍스트 | ✅ | 담당 인원 ID (Tbl_Residents 참조) |
| `LockedBy` | 텍스트 |   | 현재 수정 중인 복지사 이메일 (Soft Lock) |
| `LockedAt` | 날짜시간 |   | 잠금 시작 시각 (1시간 후 자동 해제) |

> Tbl_Income, Tbl_Budget, Tbl_Summary에도 동일하게 `ResidentID` 필드 추가

---

## Soft Lock 규칙 (수정/삭제 시만 적용)

| 동작 | Lock 필요 | 설명 |
|---|---|---|
| 새 항목 추가 | ❌ 불필요 | 동시 입력 허용 |
| 기존 항목 수정 | ✅ 필요 | 수정 화면 진입 시 Lock 획득 |
| 기존 항목 삭제 | ✅ 필요 | 삭제 시도 시 Lock 확인 |
| 영수증 이미지 보기 | ❌ 불필요 | 읽기 전용 |

### Lock 상태 판별 로직
```
현재 시각 - LockedAt > 60분  →  Lock 만료 (자동 해제)
LockedBy = 내 이메일          →  내가 잠근 항목 (수정 가능)
LockedBy ≠ 내 이메일 AND
  현재 시각 - LockedAt ≤ 60분 →  다른 사람이 수정 중
```

---

## 데이터 접근 권한 매트릭스

| 역할 | 내 담당 인원 추가 | 내 담당 인원 수정 | 다른 담당 인원 조회 | 다른 담당 인원 수정 | 인원 등록/삭제 |
|---|---|---|---|---|---|
| `Primary` | ✅ | ✅ (Lock) | ❌ | ❌ | ❌ |
| `Support` | ✅ | ✅ (Lock) | ❌ | ❌ | ❌ |
| `Admin` | ✅ | ✅ (Lock) | ✅ | ✅ (Lock) | ✅ |

> Power Apps 필터: `Filter(Tbl_StaffAssignment, StaffEmail = var_CurrentUser, Status = "Active")`
