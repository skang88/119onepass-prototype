import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { mockScenario } from './mockData.js';
import { 
  analyzeRouteAccessibility, 
  calculateRequiredHose, 
  generateVolunteerGuide 
} from './algorithms.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 기본 상태 확인
app.get('/api/health', (req, res) => {
  res.json({ status: "ok", message: "119원패스 AI 플랫폼 백엔드 구동 중" });
});

// 시나리오 데이터 반환 (3-Layer 데이터)
app.get('/api/scenario', (req, res) => {
  res.json(mockScenario);
});

// 1. 차량 종별 진입로 분석 API
app.post('/api/analyze/route', (req, res) => {
  const { roadWidth, vehicleType } = req.body;
  if (roadWidth === undefined || !vehicleType) {
    return res.status(400).json({ error: "roadWidth와 vehicleType은 필수 파라미터입니다." });
  }
  const result = analyzeRouteAccessibility(Number(roadWidth), vehicleType);
  res.json(result);
});

// 2. 소방 호스 필요 본수 산정 API
app.post('/api/analyze/hose', (req, res) => {
  const { hydrantDistance, firePointDistance } = req.body;
  if (hydrantDistance === undefined || firePointDistance === undefined) {
    return res.status(400).json({ error: "hydrantDistance와 firePointDistance는 필수 파라미터입니다." });
  }
  const result = calculateRequiredHose(Number(hydrantDistance), Number(firePointDistance));
  res.json(result);
});

// 3. 의용소방대원 행동 가이드 생성 API
app.post('/api/analyze/volunteer', (req, res) => {
  const { volunteerId } = req.body;
  const volunteer = mockScenario.volunteers.find(v => v.id === volunteerId);
  if (!volunteer) {
    return res.status(404).json({ error: "해당 의용소방대원을 찾을 수 없습니다." });
  }
  const result = generateVolunteerGuide(volunteer, mockScenario.firePoint, mockScenario.vulnerableGroups);
  res.json(result);
});

// 4. 로컬 LLM (Ollama) 및 RAG 질의 API
app.post('/api/llm/query', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt는 필수 입력 항목입니다." });
  }

  const systemMessage = `당신은 119원패스 AI 소방지휘 보조원입니다. 
경남 의령군 무곡마을(정곡-A-36) 화재 상황을 관제하며 지휘관에게 사실에 기반한 정밀 지침을 제안해야 합니다.
현장 제원: 진입로 폭 2.2m (대형차 불가, 경형/소형만 진입 가능), 화점 전방 58m 전력/가스 차단 구역, 소화전 500m 위치.
피난약자: 80대 자력대피불가 치매 어르신 거주(화점 12m 거리).
의용소방대: 박의용(350m 거리, 선착 대응대, 2분 내 도착 예정), 이소방(1100m 거리, 후착 지원대).
반드시 제공된 팩트만을 사용하여 질문에 성실하게 답변하고, 추측이나 환각(할루시네이션)을 방지하십시오. 모르는 내용은 '확인 불가'를 명시하십시오.`;

  try {
    // 로컬 Ollama 서버에 비동기 요청 시도
    const response = await fetch('http://192.168.1.197:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma:2b', // 기본적으로 llama3.2:1b 타겟
        prompt: `${systemMessage}\n\n질문: ${prompt}\n\n답변:`,
        stream: false
      }),
      signal: AbortSignal.timeout(5000) // 5초 타임아웃
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({ source: "Ollama (Local LLM)", response: data.response });
    } else {
      throw new Error(`Ollama responded with status ${response.status}`);
    }
  } catch (err) {
    // Ollama 미구동 혹은 타임아웃 시 모킹된 AI 응답(Fallback) 반환
    console.log("로컬 Ollama 연결 실패 또는 타임아웃. 가상 AI 보조 엔진으로 대체 응답합니다.");
    
    let simulatedResponse = "";
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes("피난약자") || lowerPrompt.includes("어르신") || lowerPrompt.includes("구조")) {
      simulatedResponse = `[가상 AI 보조엔진 안내]\n현재 화점 12m 인근에 80대 치매 및 거동불편 독거 어르신(자력대피불가)이 계십니다. 즉시 진입 중인 선착 의용소방대원(박의용 대원, 2분 내 도착 예정)에게 무곡마을길 36 주택으로 접근하여 대피를 지원하도록 긴급 명령을 발송하십시오.`;
    } else if (lowerPrompt.includes("소방차") || lowerPrompt.includes("진입") || lowerPrompt.includes("경로")) {
      simulatedResponse = `[가상 AI 보조엔진 안내]\n무곡마을 진입로는 도로 폭이 2.2m로 매우 협소합니다. 대형 펌프차는 진입할 수 없으므로 무곡마을 입구(화점 58m 전방)에 부서하십시오. 경형 소방차 또는 순찰차만 진입이 가능합니다. 대형차는 입구 부서 후 호스 4본 이상을 연장하여 송수 작업을 진행하십시오.`;
    } else if (lowerPrompt.includes("의용소방대") || lowerPrompt.includes("임무")) {
      simulatedResponse = `[가상 AI 보조엔진 안내]\n현재 동원 가능한 의용소방대원은 2명입니다.\n1. 박의용 대원: 선착 대응대(ETA 2분)로 배정되어 피난약자 대피 지원 및 진입 장애 유도 임무를 수행합니다.\n2. 이소방 대원: 후착 지원대(ETA 5분)로 배정되어 소방 차량 수리(소화전 500m 거리) 연장 및 소방 활동 보조 임무를 수행합니다.`;
    } else {
      simulatedResponse = `[가상 AI 보조엔진 안내]\n요청하신 내용을 접수했습니다. 의령군 무곡마을 현장 제원상 진입로 폭 2.2m, 소화전 거리 500m, 피난약자 80대 치매 독거 어르신 정보가 매핑되어 있습니다. 질문에 대한 구체적 매칭 정보를 확인해 주십시오. (로컬 Ollama 구동 시 실제 모델 분석 결과가 표시됩니다.)`;
    }

    res.json({ 
      source: "AI Sandbox engine (Fallback)", 
      response: simulatedResponse 
    });
  }
});

// 5. 무전 내용 STT 및 AI 자동 요약/상황일지 작성 API
app.post('/api/radio/summarize', async (req, res) => {
  const { radioText } = req.body;
  if (!radioText) {
    return res.status(400).json({ error: "radioText는 필수 입력 항목입니다." });
  }

  const prompt = `다음은 화재 현장에서 수신된 무전 내용(STT 변환본)입니다.
수신된 무전 내용을 바탕으로 상황을 분석하여 [핵심 요약 1줄], [조치 사항], [현장 위험도]를 깔끔하게 일지 형식으로 요약해 주십시오.

[무전 내용]: "${radioText}"

[출력 형식]:
핵심 요약: (내용)
주요 조치: (내용)
현장 위험도: (상/중/하 및 이유)`;

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma2:9b',
        prompt,
        stream: false
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({ source: "Ollama (Local LLM)", summary: data.response });
    } else {
      throw new Error("Ollama failure");
    }
  } catch (err) {
    // Fallback 요약 처리
    console.log("로컬 Ollama 연결 실패 또는 타임아웃. 기본 규칙 기반 요약 엔진으로 대체 응답합니다.");
    
    let summaryText = "";
    if (radioText.includes("구조") || radioText.includes("확보")) {
      summaryText = `핵심 요약: 현장 진입 피난약자 구조 작업 진행 및 안전 확보 완료
주요 조치: 화점 인근(12m) 80대 피난약자 구조하여 임시 구급지점으로 이동 완료
현장 위험도: 중 (피난약자는 안전하게 확보되었으나 건물 연소 계속 진행 중)`;
    } else if (radioText.includes("호스") || radioText.includes("방수") || radioText.includes("소화전")) {
      summaryText = `핵심 요약: 소화전 공급 라인 구축 및 화점 방수 개시
주요 조치: 500m 인근 소화전 점령 후 공급 호스 및 화점 공격용 호스 4본 연장 연계 완료
현장 위험도: 상 (가스 밸브 차단 여부 미확인 및 건물 화재 전면 확산 중)`;
    } else {
      summaryText = `핵심 요약: 현장 진입대원 상황 보고 수신
주요 조치: 무전 상황 전파 및 본부 지령 대기
현장 위험도: 중 (현장 상황 수시 모니터링 필요)`;
    }

    res.json({
      source: "AI Sandbox engine (Fallback)",
      summary: summaryText
    });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 119원패스 AI 플랫폼 백엔드 서버 구동 시작`);
  console.log(`📍 로컬 주소: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
