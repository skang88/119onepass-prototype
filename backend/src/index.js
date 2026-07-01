import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Readable } from 'node:stream';
import { mockScenario } from './mockData.js';
import { 
  analyzeRouteAccessibility, 
  calculateRequiredHose, 
  generateVolunteerGuide 
} from './algorithms.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://100.98.209.0/ollama';

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

// Ollama URL 포맷 정제 헬퍼 함수 (공백 및 끝 슬래시 제거)
function sanitizeOllamaUrl(url, defaultUrl) {
  const target = url || defaultUrl;
  let clean = target.trim();
  if (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

// 4. 로컬 LLM (Ollama) 및 Google AI Studio (Gemini) 질의 API
app.post('/api/ollama/status', async (req, res) => {
  let { endpoint } = req.body;
  const cleanEndpoint = sanitizeOllamaUrl(endpoint, OLLAMA_URL);

  try {
    const tagsResponse = await fetch(`${cleanEndpoint}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (tagsResponse.ok) {
      const data = await tagsResponse.json();
      const models = (data.models || []).map(m => m.name);
      return res.json({ status: "running", models });
    }

    const rootResponse = await fetch(cleanEndpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    if (rootResponse.ok) {
      const text = await rootResponse.text();
      if (text.includes("Ollama is running")) {
        return res.json({ status: "running", models: [] });
      }
    }
    
    throw new Error(`Status ${tagsResponse.status}`);
  } catch (err) {
    console.error("Ollama 상태 확인 오류: ", err.message);
    return res.json({ status: "failed", error: err.message });
  }
});

// Sandbox 모의 응답 도출 헬퍼 함수
function getSandboxResponse(prompt, radioLogs) {
  let simulatedResponse = "";
  const lowerPrompt = prompt.toLowerCase();
  const cleanPrompt = lowerPrompt.replace(/\s+/g, ''); // 공백 제거 처리로 밀착 단어 판정 강화
  
  if (
    cleanPrompt.includes("보고") || 
    cleanPrompt.includes("상황") || 
    cleanPrompt.includes("브리핑") || 
    cleanPrompt.includes("현황") || 
    cleanPrompt.includes("현장") || 
    cleanPrompt.includes("알려줘") || 
    cleanPrompt.includes("어때") || 
    cleanPrompt.includes("어떻게") || 
    cleanPrompt.includes("상태")
  ) {
    const hasVulnerableSaved = radioLogs && radioLogs.some(l => l.rawText.includes("구조 완료") || l.summary.includes("구조 완료"));
    if (hasVulnerableSaved) {
      simulatedResponse = `[가상 AI 보조엔진 상황 브리핑]\n지휘관님, 박의용 대원에 의해 피난약자(80대 어르신) 구조 및 대피는 안전하게 완료되었습니다. 현재 소화 용수 라인 연계 및 방수 개시 단계입니다.\n\n추가로 소화 용수 공급 상태나 의용소방대원의 다음 지원 임무에 대해 보고해 드릴까요?`;
    } else {
      simulatedResponse = `[가상 AI 보조엔진 상황 브리핑]\n지휘관님, 무곡마을 화재는 현재 진입로(2.2m 협소) 극복 및 최우선 구조대상자(80대 어르신) 구조 우선순위 단계입니다. 아직 어르신의 구조 보고는 접수되지 않았습니다.\n\n추가로 피난약자 세부 대피 지령이나 선착한 박의용 대원의 현재 위치에 대해 안내해 드릴까요?`;
    }
  } 
  else if (cleanPrompt.includes("피난약자") || cleanPrompt.includes("어르신") || cleanPrompt.includes("구조") || cleanPrompt.includes("거동") || cleanPrompt.includes("노인")) {
    simulatedResponse = `[가상 AI 보조엔진 안내]\n현재 화점 12m 인근에 80대 치매 및 거동불편 독거 어르신(자력대피불가)이 계십니다. 즉시 진입 중인 선착 의용소방대원(박의용 대원, 2분 내 도착 예정)에게 무곡마을길 36 주택으로 접근하여 대피를 지원하도록 긴급 명령을 발송하십시오.`;
  } 
  else if (cleanPrompt.includes("소방차") || cleanPrompt.includes("진입") || cleanPrompt.includes("경로") || cleanPrompt.includes("거리") || cleanPrompt.includes("협소") || cleanPrompt.includes("차량")) {
    simulatedResponse = `[g가상 AI 보조엔진 안내]\n무곡마을 진입로는 도로 폭이 2.2m로 매우 협소합니다. 대형 펌프차는 진입할 수 없으므로 무곡마을 입구(화점 58m 전방)에 부서하십시오. 경형 소방차 또는 순찰차만 진입이 가능합니다. 대형차는 입구 부서 후 호스 4본 이상을 연장하여 송수 작업을 진행하십시오.`;
  } 
  else if (cleanPrompt.includes("의용소방대") || cleanPrompt.includes("임무") || cleanPrompt.includes("요원")) {
    simulatedResponse = `[가상 AI 보조엔진 안내]\n현재 동원 가능한 의용소방대원은 2명입니다.\n1. 박의용 대원: 선착 대응대(ETA 2분)로 배정되어 피난약자 대피 지원 및 진입 장애 유도 임무를 수행합니다.\n2. 이소방 대원: 후착 지원대(ETA 5분)로 배정되어 소방 차량 수리(소화전 500m 거리) 연장 및 소방 활동 보조 임무를 수행합니다.`;
  } 
  else {
    simulatedResponse = `[가상 AI 보조엔진 안내]\n요청하신 내용을 접수했습니다. 의령군 무곡마을 현장 제원상 진입로 폭 2.2m, 소화전 거리 500m, 피난약자 80대 치매 독거 어르신 정보가 매핑되어 있습니다. 질문에 대한 구체적 매칭 정보를 확인해 주십시오.`;
  }
  return simulatedResponse;
}

// Sandbox 무전 요약 도출 헬퍼 함수
function getSandboxRadioSummary(radioText) {
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
  return summaryText;
}

app.post('/api/llm/query', async (req, res) => {
  const { prompt, modelType, apiKey, radioLogs, localEndpoint, localModel } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt는 필수 입력 항목입니다." });
  }

  // SSE 스트리밍 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx 버퍼링 차단

  // 무전 기록 포맷팅
  let radioLogsContext = "수신된 무전 기록 없음 (현재 무전 통신 대기 중)";
  if (radioLogs && radioLogs.length > 0) {
    radioLogsContext = radioLogs.map((log, idx) => 
      `[${log.timestamp} / 출처: ${log.source}] ${log.summary || log.rawText}`
    ).join('\n');
  }

  const selectedModel = modelType || 'local';
  const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;

  // 헬퍼: 클라이언트에 스트림 데이터를 쏘는 함수
  const sendChunk = (source, text, isDone = false) => {
    res.write(`data: ${JSON.stringify({ source, text, isDone })}\n\n`);
  };

  // 모델 종류에 따른 시스템 프롬프트 이원화 (로컬 초소형 LLM용 프롬프트 다이어트)
  let systemMessage = "";
  if (selectedModel === 'gemini') {
    systemMessage = `당신은 119원패스 AI 소방지휘 보조원입니다. 
경남 의령군 무곡마을(정곡-A-36) 화재 상황을 관제하며 지휘관에게 사실에 기반한 정밀 지침을 제안해야 합니다.

[현장 기본 제원 & 대시보드 데이터]:
- 화재 위치: 경남 의령군 정곡면 무곡마을길 36 주택 (목조 단독주택)
- 진입로 상태: 도로 폭 2.2m로 극히 협소함. 대형 펌프차/화학차 등 대형 소방 차량은 진입 불가! (경형 소방차 또는 순찰차만 진입 가능)
- 소방 용수: 가장 가까운 지상식 소화전이 화점으로부터 500m 이격되어 있음.
- 가스/전력: 화점 전방 58m 전력/가스 차단 차단 밸브 구역 존재.
- 피난약자 존재: 화점 12m 거리에 자력대피가 절대 불가한 80대 치매 어르신 1명 거주 중. (최우선 구조 필요)
- 동원 소방력(의용소방대원):
  1) 박의용 대원: 선착 대응대 (350m 거리, 도보/오토바이 ETA 2분 내 현장 진입 예정)
  2) 이소방 대원: 후착 지원대 (1100m 거리, 소방차 유도 및 소수 공급 보조, ETA 5분 내 현장 진입 예정)

[실시간 상황 무전 일지 (STT)]:
${radioLogsContext}

[답변 원칙]:
1. 지휘관이 상황 문의를 하거나 현재 보고를 요구할 시(예: "현재 상황 보고해줘"), 한 번에 구구절절 길게 말하지 말고 **핵심 요약 2~3문장**으로 최대한 간단명료하게 브리핑하십시오.
2. 브리핑 후에는 대화를 매끄럽게 이어가고 지휘관의 의사결정을 돕기 위해 **"추가로 어떤 부분(예: 피난약자 안전 확보 상태, 소방 차량 우회 경로, 의용소방대 투입 현황 등)을 더 설명해 드릴까요?"**라고 반드시 지휘관에게 친근하게 반문하며 후속 유도 질문을 덧붙이십시오.
3. 세부 정보(정밀 미터 수치, 소화전 거리 등)는 지휘관이 콕 찝어서 구체적으로 질문했을 때에만 짧고 핵심만 답변하십시오.
4. 반드시 제공된 팩트만을 사용하여 지휘관에게 사실만을 조언하고, 추측이나 거짓 정보는 생성하지 마십시오. 모르는 내용은 '확인 불가'를 명시하십시오.`;
  } else {
    // 로컬 LLM (Qwen, Gemma 등) 용 다이어트된 경량화 시스템 프롬프트
    systemMessage = `당신은 119원패스 소방지휘 보조 AI입니다. 팩트 데이터에만 의존해 답변을 아주 짧게 요약해 조언하세요. 거짓을 지어내지 마세요.

[현장데이터]
-위치:의령군 정곡면 무곡마을길 36 (목조건물)
-도로:폭 2.2m (대형펌프차 진입불가, 경형소방차/순찰차만 진입가능)
-용수:소화전 500m 거리 이격
-가스/전력:차단기 화점 58m 전방
-피난약자:화점 12m 거리 80대 거동불편 치매 노인 (최우선 구조구조대상)
-의소대원:박의용(선착, ETA 2분, 피난약자 대피지원), 이소방(후착, ETA 5분, 소방차 유도)

[무전일지]
${radioLogsContext}

[답변원칙]
1. 상황 브리핑 요구 시 현황을 핵심만 2~3문장으로 브리핑한 뒤, 문장 끝에 반드시 "추가로 피난약자 안전 확보 상태, 소방 차량 우회 경로, 의용소방대 투입 현황 중 더 설명해 드릴까요?"라고 덧붙이십시오.
2. 모르는 팩트는 "확인 불가"를 명시하세요.`;
  }

  // 1. 가상 보조 엔진 (Sandbox / Dummy LLM) 명시적 선택 시
  if (selectedModel === 'sandbox') {
    const simulatedResponse = getSandboxResponse(prompt, radioLogs);
    sendChunk("AI Sandbox engine (Dummy LLM)", simulatedResponse, true);
    return res.end();
  }

  // 2. Google AI Studio (Gemini 2.5 Flash)
  if (selectedModel === 'gemini') {
    if (!apiKeyValue) {
      sendChunk("System Error", "Gemini API 키가 설정되지 않았습니다. 프론트엔드 AI 설정 창에서 API 키를 먼저 기입하십시오.", true);
      return res.end();
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyValue}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemMessage }]
          },
          contents: [
            { parts: [{ text: prompt }] }
          ],
          generationConfig: {
            temperature: 0.2
          }
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (response.ok) {
        const data = await response.json();
        const geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (geminiText) {
          sendChunk("Google Gemini 2.5 Flash", geminiText, true);
          return res.end();
        }
      }
      throw new Error(`Status ${response.status} - ${response.statusText}`);
    } catch (err) {
      console.warn("Gemini API 호출 오류로 인한 Sandbox Fallback 작동: ", err.message);
      const simulatedResponse = getSandboxResponse(prompt, radioLogs);
      sendChunk("AI Sandbox engine (Gemini Fallback Backup)", `⚠️ [알림: Gemini API 호출 실패로 백업 가상 엔진으로 작동 중]\n\n${simulatedResponse}`, true);
      return res.end();
    }
  }

  // 3. 로컬 LLM (Ollama) - 실시간 스트리밍
  const currentOllamaUrl = sanitizeOllamaUrl(localEndpoint, OLLAMA_URL);
  const currentOllamaModel = localModel || 'gemma4:e2b';

  console.log(`\n📢 [디버그] 로컬 LLM API 호출 개시!`);
  console.log(`🔗 대상 URL : ${currentOllamaUrl}/api/generate`);
  console.log(`🤖 적용 모델 : ${currentOllamaModel}`);

  // 즉시 스트림을 개방하고 브라우저 대기 락을 해제하기 위해 초기 청크 송출
  sendChunk(`Ollama (${currentOllamaModel})`, "🤖 로컬 모델 연산 지휘 보조 분석 개시 중... (잠시만 기다려 주십시오)\n\n");

  try {
    const response = await fetch(`${currentOllamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: currentOllamaModel,
        prompt: `${systemMessage}\n\n질문: ${prompt}\n\n답변:`,
        stream: true // 스트리밍 활성화
      }),
      signal: AbortSignal.timeout(120000)
    });

    console.log(`[디버그] Ollama HTTP Response Status: ${response.status}`);
    console.log(`[디버그] Headers Content-Type: ${response.headers.get('content-type')}`);
    console.log(`[디버그] Headers Transfer-Encoding: ${response.headers.get('transfer-encoding')}`);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama Server Status ${response.status}: ${errText}`);
    }

    // response.body (Web Stream) -> Node.js Readable Stream 변환하여 backpressure 교착 상태 예방
    const reader = Readable.fromWeb(response.body);
    console.log(`\n💬 [실시간 토큰 생성 로그 시작]`);
    
    let streamBuffer = ""; // chunk 조립용 버퍼
    
    for await (const chunk of reader) {
      streamBuffer += chunk.toString();
      const lines = streamBuffer.split('\n');
      
      // 마지막 줄은 불완전하게 잘렸을 수 있으므로 버퍼에 보존하고 순회에서 제외
      streamBuffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          
          // Ollama 서버 내부 에러 핸들링 (예: VRAM 부족, 프롬프트 한계 에러 등)
          if (parsed.error) {
            console.error(`\n❌ [Ollama 내부 에러 발생]: ${parsed.error}`);
            sendChunk(`Ollama (${currentOllamaModel})`, `⚠️ [Ollama 서버 에러]: ${parsed.error}`, true);
            continue;
          }
          
          if (parsed.response) {
            // 백엔드 터미널 콘솔에 개별 토큰 실시간 출력
            process.stdout.write(parsed.response);
            
            sendChunk(`Ollama (${currentOllamaModel})`, parsed.response, parsed.done || false);
          }
        } catch (e) {
          // JSON 파싱 에러 방지
        }
      }
    }
    
    // 루프가 끝난 뒤 버퍼에 남아있는 잔여 문자열 처리
    if (streamBuffer.trim()) {
      try {
        const parsed = JSON.parse(streamBuffer);
        if (parsed.error) {
          console.error(`\n❌ [Ollama 내부 에러 발생]: ${parsed.error}`);
          sendChunk(`Ollama (${currentOllamaModel})`, `⚠️ [Ollama 서버 에러]: ${parsed.error}`, true);
        } else if (parsed.response) {
          process.stdout.write(parsed.response);
          sendChunk(`Ollama (${currentOllamaModel})`, parsed.response, parsed.done || false);
        }
      } catch (e) {
        // 파싱 예외 스킵
      }
    }
    
    console.log(`\n🏁 [실시간 토큰 생성 로그 종료]\n`);
    res.end();

  } catch (err) {
    console.error("❌ 로컬 Ollama 연결 실패 상세 에러 로그:");
    console.error(err);
    
    const simulatedResponse = getSandboxResponse(prompt, radioLogs);
    sendChunk(
      `AI Sandbox engine (Ollama Fallback Backup)`, 
      `⚠️ [알림: 로컬 LLM 서버 연결 실패로 백업 가상 엔진으로 작동 중]\n(오류 사유: ${err.message})\n\n${simulatedResponse}`,
      true
    );
  }
});

// 5. 무전 내용 STT 및 AI 자동 요약/상황일지 작성 API
app.post('/api/radio/summarize', async (req, res) => {
  const { radioText, modelType, apiKey, localEndpoint, localModel } = req.body;
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

  const selectedModel = modelType || 'local';
  const apiKeyValue = apiKey || process.env.GEMINI_API_KEY;

  // 1. 가상 보조 엔진 (Sandbox / Dummy LLM)
  if (selectedModel === 'sandbox') {
    const summaryText = getSandboxRadioSummary(radioText);
    return res.json({
      source: "AI Sandbox engine (Dummy LLM)",
      summary: summaryText
    });
  }

  // 2. Google AI Studio (Gemini 2.5 Flash)
  if (selectedModel === 'gemini') {
    if (!apiKeyValue) {
      return res.status(400).json({ 
        error: "Gemini API 키가 설정되지 않았습니다. 프론트엔드 AI 설정 창에서 API 키를 먼저 기입하십시오." 
      });
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyValue}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: prompt }] }
          ],
          generationConfig: {
            temperature: 0.2
          }
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (response.ok) {
        const data = await response.json();
        const geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (geminiText) {
          return res.json({ source: "Google Gemini 2.5 Flash", summary: geminiText });
        }
      }
      throw new Error(`Status ${response.status}`);
    } catch (err) {
      console.warn("Gemini API 호출 요약 오류로 인한 Sandbox Fallback 작동: ", err.message);
      const summaryText = getSandboxRadioSummary(radioText);
      return res.json({ 
        source: "AI Sandbox engine (Gemini Fallback Backup)", 
        summary: `⚠️ [알림: 요약 서비스 장애로 백업 엔진이 작동했습니다]\n\n${summaryText}` 
      });
    }
  }

  // 3. 로컬 LLM (Ollama)
  const currentOllamaUrl = sanitizeOllamaUrl(localEndpoint, OLLAMA_URL);
  const currentOllamaModel = localModel || 'gemma4:e2b';

  try {
    const response = await fetch(`${currentOllamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: currentOllamaModel,
        prompt,
        stream: false
      }),
      signal: AbortSignal.timeout(120000) // 120초로 연장
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({ source: `Ollama (${currentOllamaModel})`, summary: data.response });
    } else {
      const errText = await response.text();
      throw new Error(`Ollama Server Status ${response.status}: ${errText}`);
    }
  } catch (err) {
    console.error("❌ 로컬 Ollama 요약 실패 상세 에러 로그:");
    console.error(err);
    
    const summaryText = getSandboxRadioSummary(radioText);
    return res.json({ 
      source: "AI Sandbox engine (Ollama Fallback Backup)", 
      summary: `⚠️ [알림: 로컬 LLM 요약 실패로 백업 엔진이 작동했습니다]\n(오류 사유: ${err.message})\n\n${summaryText}` 
    });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 119원패스 AI 플랫폼 백엔드 서버 구동 시작`);
  console.log(`📍 로컬 주소: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
