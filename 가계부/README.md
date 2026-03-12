# 가계부 프로그램 — 영수증 자동 인식 가계부

> Microsoft Power Platform 기반 | 모바일 + PC 동시 지원 | Excel 데이터 저장

---

## 시스템 개요

| 항목 | 내용 |
|---|---|
| **시스템명** | 영수증 자동 인식 가계부 |
| **플랫폼** | Microsoft Power Platform |
| **데이터 저장** | OneDrive Excel (`가계부.xlsx`) |
| **핵심 기능** | 영수증 사진 촬영 → AI OCR → 자동 입력 |

---

## 핵심 기능

### 1. 영수증 자동 인식
- 핸드폰 카메라로 영수증 촬영
- AI Builder(사전 빌드 영수증 모델)로 자동 추출:
  - 상호명, 날짜, 합계금액, 부가세
- 인식 신뢰도 표시 — 낮을 경우 수동 검토 요청
- 인식 결과 수정 후 저장 가능

### 2. 직접 입력
- 영수증 없는 지출/수입 직접 입력
- 카테고리, 결제 수단 선택

### 3. 내역 조회/수정
- 날짜 범위 + 카테고리 필터링
- 검색 기능
- 영수증 이미지 원본 확인

### 4. 예산 관리
- 카테고리별 월 예산 설정
- 실시간 예산 대비 지출 현황

### 5. 리포트
- 월별 수입/지출/잔액 요약
- 카테고리별 지출 분석
- 자동 월별 집계 (Power Automate 배치)

---

## 기술 구성

```
사용자 (모바일/PC)
       │
       ▼
Power Apps Canvas App
  ├── 영수증 촬영 (카메라 컨트롤)
  ├── 내역 조회 갤러리
  └── 수정/삭제 폼
       │
       ▼ (플로우 호출)
Power Automate
  ├── Flow_ReceiptOCR_Process    ← AI OCR + Excel 저장
  └── Flow_MonthlySummary_Batch ← 매월 자동 집계
       │
       ├── AI Builder (영수증 OCR)
       │
       └── OneDrive
             ├── 가계부.xlsx     ← 데이터 저장
             └── receipts/       ← 영수증 이미지 저장
```

---

## 파일 구성

```
가계부/
├── README.md                          ← 이 파일
├── docs/
│   └── 01_DataSchema.md               ← Excel 테이블 스키마 정의
├── flows/
│   └── 02_ReceiptOCR_Flow.md          ← Power Automate 플로우 설계
├── app/
│   └── 03_PowerApps_Formulas.md       ← Power Apps 화면 및 수식
└── templates/
    └── 04_Excel_Template_Setup.md     ← Excel 설정 가이드
```

---

## 설치 순서

1. **Excel 파일 생성** → `templates/04_Excel_Template_Setup.md` 참조
2. **Power Automate 플로우 생성** → `flows/02_ReceiptOCR_Flow.md` 참조
3. **Power Apps 앱 생성** → `app/03_PowerApps_Formulas.md` 참조
4. **테스트**: 영수증 촬영 → OCR 확인 → Excel 저장 확인

---

## 라이선스 요구사항

| 항목 | 필요 라이선스 |
|---|---|
| Power Apps | Microsoft 365 또는 Power Apps 단독 라이선스 |
| Power Automate | Power Automate Premium (Excel Online + AI Builder) |
| AI Builder | AI Builder 크레딧 (Power Automate Premium에 포함) |
| OneDrive | Microsoft 365 구독에 포함 |

> AI Builder 없이 저비용으로 구현하려면 Azure Form Recognizer HTTP 커넥터를 대안으로 사용 가능

---

## 데이터 규칙

- **논리적 삭제**: 데이터는 물리 삭제 없이 `Status = "Deleted"` 처리
- **단일 쓰기 경로**: 모든 Excel 쓰기는 Power Automate를 통해서만
- **재시도 정책**: Excel 잠김 오류 시 30초 간격 3회 재시도
- **영수증 이미지**: `/가계부/receipts/{연도}/{월}/` 경로로 자동 저장

---

## 업데이트 이력

| 날짜 | 내용 |
|---|---|
| 2026-03-12 | 최초 설계 완료 — 스키마, OCR 플로우, Power Apps 수식 |
