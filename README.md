# 119원패스 AI 플랫폼 프로토타입 (119OnePass Prototype)

본 프로젝트는 경남 의령소방서 연구반의 **"119원패스 AI 플랫폼 구축에 관한 연구"** 논문을 토대로 제작된, 로컬 LLM 및 MCP 연동을 시험하기 위한 시각화 및 알고리즘 제어 프로토타입입니다.

---

## 1. 주요 기능
* **3-Layer 지도 시각화**: Leaflet.js를 기반으로 다크 모드 맵 상에 복지 데이터(Layer 1 - 피난약자), 의용소방대 GPS 위치(Layer 2), 소방 정보 및 진입로 장애(Layer 3)를 매핑합니다.
* **AI 자동 판정 알고리즘**:
  * 소방 차량 종류에 따른 협소 도로(무곡마을 2.2m 도로) 진입 가이드 추천.
  * 소화전(500m) 및 부서 위치(58m 전방) 기준 필요 방수/공급 호스 개수 자동 산정.
  * 의용소방대원 ETA에 따른 선착/후착 역할 가이드(4단계 지령) 생성.
* **AI 지휘 대응 Q&A**: 로컬 LLM(Ollama)과 연동하여 RAG 및 Tool Calling 기반의 자연어 질의응답을 수행합니다. (Ollama 미구동 시 Sandbox Fallback 가상 응답 제공)
* **실시간 무전 STT 및 요약**: 무전 텍스트를 실시간으로 입력/수집하여 AI가 핵심 요약, 주요 조치, 현장 위험도가 포함된 상황일지를 자동 작성합니다.

---

## 2. 프로젝트 디렉토리 구조
```
119onepass-prototype/
├── package.json         # 통합 실행 스크립트 (concurrently 사용)
├── README.md            # 본 설명서
├── backend/             # Express 백엔드 서버
│   ├── src/
│   │   ├── index.js      # API 서버 엔트리 포인트 (Ollama 연동)
│   │   ├── mockData.js   # 의령군 무곡마을 시나리오 모킹 데이터
│   │   └── algorithms.js # 진입 분석, 호스 계산, 역할가이드 로직
│   └── package.json
└── frontend/            # React/Vite 프런트엔드 웹 앱
    ├── index.html
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx       # 대시보드 메인 컴포넌트
    │   └── index.css     # Cyberpunk Rescue 테마 (바닐라 CSS)
    └── package.json
```

---

## 3. 실행 방법

### 3.1 사전 준비 (로컬 LLM - Ollama 연동 선택 사항)
실제 로컬 LLM과 연계하여 동작을 확인하려면 다음 단계를 진행하십시오. (LLM이 구동되지 않는 환경에서도 가상 AI 샌드박스 엔진이 자동 작동하여 테스트에 지장이 없습니다.)

1. [Ollama 공식 홈페이지](https://ollama.com/)에서 설치 파일을 다운로드하여 설치합니다.
2. 터미널에서 아래 명령어를 실행하여 **Gemma 2 (9B)** 모델을 다운로드합니다:
   ```bash
   ollama run gemma2:9b
   ```
3. Ollama 서버가 로컬 포트 `11434`에서 실행 중인 상태로 유지합니다.

### 3.2 프로토타입 통합 구동
통합 실행 명령어를 통해 백엔드(포트 5000)와 프런트엔드(Vite 개발 서버)를 동시에 기동합니다:

```bash
# 1. 의존성 패키지 설치 (프로젝트 루트 디렉토리)
npm run install:all
npm install

# 2. 통합 실행
npm start
```

실행이 성공하면 프런트엔드 접속 주소(예: `http://localhost:5173`)가 터미널에 출력됩니다. 해당 주소를 브라우저로 열어 프로토타입을 테스트하십시오.
