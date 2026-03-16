# 가계부 프로그램 — 영수증 자동 인식 가계부

> Microsoft Power Platform 기반 | 모바일 + PC 동시 지원 | Excel 데이터 저장
> 다중 복지사 → 담당 인원별 가계부 관리

---

## 시스템 개요

| 항목 | 내용 |
|---|---|
| **시스템명** | 영수증 자동 인식 가계부 |
| **플랫폼** | Microsoft Power Platform |
| **데이터 저장** | OneDrive Excel (`가계부.xlsx`) |
| **사용자** | 복지사 다수 — 담당 인원별로 분리 접근 |
| **핵심 기능** | 담당 인원 선택 → 영수증(촬영/QR/바코드/직접) 입력 |

---

## 핵심 기능

### 1. 다중 복지사 / 담당 인원 관리
- 복지사가 앱 접속 시 자신의 담당 인원 목록 자동 표시
- 담당 인원 선택 후 해당 인원의 가계부만 접근
- 관리자(Admin)는 전체 인원 조회 및 담당 배정 가능

### 2. 영수증 3가지 입력 방식
| 방식 | 설명 |
|---|---|
| 📷 **사진 촬영** | 카메라 촬영 → AI OCR → 상호명·금액 자동 입력 |
| 📱 **QR/바코드 스캔** | 현금영수증 QR → 자동 파싱 / 상품 바코드 → 상품명 조회 |
| ✏️ **직접 입력** | 날짜·상호명·금액·카테고리 수동 입력 |

### 3. 동시 입력 처리 (Soft Lock)
- **새 항목 추가**: 복지사 여러 명 동시 입력 가능
- **기존 항목 수정**: Soft Lock — 한 번에 한 명만, 1시간 자동 해제

### 4. 내역 조회 / 수정 / 삭제
- 날짜·카테고리·금액 필터링 및 검색
- 기존 항목 수정 (입력 오류 정정)
- 논리적 삭제 (`Status = "Deleted"`)

### 5. 예산 및 리포트
- 카테고리별 월 예산 설정
- 월별 수입/지출/잔액 자동 집계
- 카테고리별 지출 분석 차트

---

## 기술 구성

```
복지사 A/B/C (모바일/PC)
       │
       ▼
Power Apps Canvas App
  ├── Scr_ResidentSelect  ← 담당 인원 선택
  ├── Scr_ResidentHome    ← 선택된 인원 가계부 홈
  ├── Scr_ScanInput       ← QR/바코드 스캔
  ├── Scr_AddExpense      ← 입력/수정 통합 (5가지 모드)
  ├── Scr_List            ← 내역 목록 (ResidentID 필터)
  └── Scr_Admin           ← 관리자: 인원 등록/담당 배정
       │
       ▼ (플로우 호출)
Power Automate
  ├── Flow_ReceiptOCR_Process    ← AI OCR + Excel 저장
  ├── Flow_QRReceipt_Process     ← QR 현금영수증 파싱
  ├── Flow_Barcode_Lookup        ← GS1 상품 바코드 조회
  └── Flow_MonthlySummary_Batch ← 매월 자동 집계
       │
       ├── AI Builder (영수증 OCR)
       ├── HTTP (GS1 바코드 API, QR URL 파싱)
       │
       └── OneDrive
             ├── 가계부.xlsx     ← 데이터 저장
             └── receipts/       ← 영수증 이미지 저장
```

---

## 파일 구성

```
가계부/
├── README.md
├── docs/
│   ├── 01_DataSchema.md          ← Excel 테이블 스키마
│   └── 07_MultiUser_Schema.md    ← 다중 사용자/담당자 스키마
├── flows/
│   ├── 02_ReceiptOCR_Flow.md     ← OCR 플로우
│   └── 05_BarcodeQR_Flow.md      ← 바코드/QR 플로우
├── app/
│   ├── 03_PowerApps_Formulas.md  ← 기본 화면 수식
│   ├── 06_InputEdit_Screens.md   ← 입력/수정 화면 상세
│   └── 08_MultiUser_Screens.md   ← 다중 사용자 화면 상세
└── templates/
    └── 04_Excel_Template_Setup.md ← Excel 설정 가이드
```

---

## 설치 순서

1. **Excel 파일 생성** → `templates/04_Excel_Template_Setup.md`
   - `Tbl_Residents`, `Tbl_StaffAssignment` 시트 추가 포함
2. **Power Automate 플로우 생성** → `flows/` 폴더 문서 참조
3. **Power Apps 앱 생성** → `app/` 폴더 문서 참조
4. **초기 데이터 입력**:
   - `Tbl_Residents`: 담당 인원 등록
   - `Tbl_StaffAssignment`: 복지사-인원 담당 매핑
5. **테스트**: 복지사 계정 접속 → 담당 인원 선택 → 영수증 입력 확인

---

## 라이선스 요구사항

| 항목 | 필요 라이선스 |
|---|---|
| Power Apps | Microsoft 365 또는 Power Apps 단독 라이선스 |
| Power Automate | Power Automate Premium (HTTP 커넥터 포함) |
| AI Builder | AI Builder 크레딧 (Power Automate Premium에 포함) |
| OneDrive | Microsoft 365 구독에 포함 |

---

## 데이터 규칙

- **논리적 삭제**: 모든 삭제는 `Status = "Deleted"` 처리, 물리 삭제 없음
- **단일 쓰기 경로**: 모든 Excel 쓰기는 Power Automate를 통해서만
- **재시도 정책**: Excel 잠김 오류 시 30초 간격 3회 재시도
- **Soft Lock**: 수정/삭제 시만 적용, 1시간 자동 해제
- **ResidentID 격리**: 각 인원의 데이터는 ResidentID로 완전히 분리

---

## 업데이트 이력

| 날짜 | 내용 |
|---|---|
| 2026-03-12 | 최초 설계 완료 — 스키마, OCR 플로우, Power Apps 수식 |
| 2026-03-16 | 다중 사용자 설계 추가 — 담당 인원 관리, Soft Lock, QR/바코드 외부 입력 |
