import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import { 
  Flame, 
  MapPin, 
  Users, 
  Navigation, 
  Radio, 
  ShieldAlert, 
  Compass, 
  Layers, 
  Play, 
  MessageSquare, 
  Send, 
  PhoneCall,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  Sparkles,
  X,
  Square
} from 'lucide-react';

export default function App() {
  const [scenarioData, setScenarioData] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState('largePump');
  const [roadWidth, setRoadWidth] = useState(2.2);
  const [hydrantDistance, setHydrantDistance] = useState(500);
  const [fireDistance, setFireDistance] = useState(58);
  
  // API 결과 상태
  const [routeResult, setRouteResult] = useState(null);
  const [hoseResult, setHoseResult] = useState(null);
  const [volunteerGuides, setVolunteerGuides] = useState({});
  
  // AI 챗봇 및 무전 STT 상태
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'ai', text: '안녕하십니까. 119원패스 AI 지휘 보조원입니다. 의령군 무곡마을(정곡-A-36) 주택 화재 신고가 접수되어 실시간 다기관 데이터 분석을 완료했습니다. 지휘 명령이 필요하신 사항을 질문해 주십시오.' }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  const [radioInput, setRadioInput] = useState('');
  const [radioLogs, setRadioLogs] = useState([]);
  const [isRadioLoading, setIsRadioLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary'); // summary vs logs

  // Theme State (dark vs light)
  const [theme, setTheme] = useState(() => localStorage.getItem('onepass_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('onepass_theme', theme);
  }, [theme]);

  // AI Model & API Key Configuration State
  const [modelType, setModelType] = useState(() => localStorage.getItem('onepass_model_type') || 'local');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('onepass_gemini_api_key') || '');
  const [localEndpoint, setLocalEndpoint] = useState(() => localStorage.getItem('onepass_local_endpoint') || 'http://100.98.209.0/ollama');
  const [localModel, setLocalModel] = useState(() => localStorage.getItem('onepass_local_model') || 'gemma4:e2b');
  const [ollamaStatus, setOllamaStatus] = useState('idle'); // 'idle' | 'checking' | 'running' | 'failed'
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaError, setOllamaError] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Gemini Live Voice Interface State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking'
  const [voiceUserTranscript, setVoiceUserTranscript] = useState('');
  const [voiceAiResponse, setVoiceAiResponse] = useState('');

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef(null);
  const speechTimeoutRef = useRef(null);

  // Latest Ref Pattern to prevent SpeechRecognition recreating cycle
  const modelTypeRef = useRef(modelType);
  const apiKeyRef = useRef(apiKey);
  const radioLogsRef = useRef(radioLogs);
  const localEndpointRef = useRef(localEndpoint);
  const localModelRef = useRef(localModel);

  useEffect(() => { modelTypeRef.current = modelType; }, [modelType]);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { radioLogsRef.current = radioLogs; }, [radioLogs]);
  useEffect(() => { localEndpointRef.current = localEndpoint; }, [localEndpoint]);
  useEffect(() => { localModelRef.current = localModel; }, [localModel]);

  // Speech Recognition & Text-To-Speech Setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;

    if (SpeechRecognition) {
      rec = new SpeechRecognition();
      rec.continuous = true; // 지속 리스닝
      rec.lang = 'ko-KR';
      rec.interimResults = true; // 실시간 중간 받아쓰기 활성화
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setVoiceStatus('listening');
        setVoiceUserTranscript('현장 지휘 내용을 말씀하십시오...');
        setVoiceAiResponse('');
      };

      rec.onerror = (e) => {
        console.error("음성 인식 에러: ", e);
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        setVoiceStatus('idle');
        if (e.error === 'no-speech') {
          setVoiceUserTranscript('음성이 감지되지 않았습니다. 다시 마이크를 누르고 말씀해 주십시오.');
        } else if (e.error === 'not-allowed') {
          setVoiceUserTranscript('⚠️ 마이크 권한이 차단되었습니다. 주소창 왼쪽 자물쇠 아이콘을 눌러 권한을 허용해 주십시오.');
        } else {
          setVoiceUserTranscript(`⚠️ 음성 인식 오류: ${e.error}. 다시 말씀해 보십시오.`);
        }
      };

      rec.onend = () => {
        setVoiceStatus(prev => {
          if (prev === 'listening') return 'idle';
          return prev;
        });
      };

      rec.onresult = async (event) => {
        // 기존 디바운스 타이머 리셋
        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current);
        }

        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const combinedTranscript = (finalTranscript || interimTranscript).trim();
        if (!combinedTranscript) return;

        // 지휘관 자막 박스에 타이핑 피드백 노출
        setVoiceUserTranscript(combinedTranscript);

        // 1.2초 동안 조용하면 최종 구문으로 판단하여 백엔드 분석 요청
        speechTimeoutRef.current = setTimeout(async () => {
          try {
            rec.stop(); // 캡처 종료
          } catch (e) {}
          setVoiceStatus('thinking');

          // [즉시 피드백] 말을 마치자마자 우측 Q&A 챗 일지에 유저 질문(STT 결과)을 바로 받아쓰기 표기합니다.
          setChatHistory(prev => [...prev, { sender: 'user', text: combinedTranscript }]);
          setIsChatLoading(true);

          try {
            const response = await fetch('/backend/api/llm/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                prompt: combinedTranscript,
                modelType: modelTypeRef.current,
                apiKey: apiKeyRef.current,
                radioLogs: radioLogsRef.current,
                localEndpoint: localEndpointRef.current,
                localModel: localModelRef.current
              })
            });

            if (!response.ok) {
              throw new Error("서버 통신 실패");
            }

            // 대화창에 빈 AI 메시지 공간 확보
            setChatHistory(prev => [...prev, { sender: 'ai', text: '', source: '연결 중...' }]);
            setIsChatLoading(false);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let accumulatedText = "";
            let finalSource = "AI Assistant";
            let streamBuffer = ""; // 쪼개진 chunk 조립용 버퍼

            while (!done) {
              const { value, done: doneReading } = await reader.read();
              done = doneReading;
              if (value) {
                streamBuffer += decoder.decode(value, { stream: true });
                const parts = streamBuffer.split('\n\n');
                streamBuffer = parts.pop() || ""; // 미완성 조각은 잔류

                for (const part of parts) {
                  const trimmed = part.trim();
                  if (!trimmed) continue;

                  const lines = trimmed.split('\n');
                  for (const line of lines) {
                    if (line.startsWith('data: ')) {
                      try {
                        const parsed = JSON.parse(line.slice(6));
                        if (parsed.text) {
                          accumulatedText += parsed.text;
                          finalSource = parsed.source;

                          // 화면 아래쪽 자막 실시간 업데이트
                          setVoiceAiResponse(accumulatedText);

                          // 우측 채팅 로그 실시간 업데이트
                          setChatHistory(prev => {
                            const newHistory = [...prev];
                            if (newHistory.length > 0) {
                              newHistory[newHistory.length - 1] = {
                                sender: 'ai',
                                text: accumulatedText,
                                source: finalSource
                              };
                            }
                            return newHistory;
                          });
                        }
                      } catch (e) {
                        // 조각 파싱 오류 무시
                      }
                    }
                  }
                }
              }
            }

            // 루프 종료 후 버퍼 잔류분 강제 플러시
            if (streamBuffer.trim()) {
              const lines = streamBuffer.trim().split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const parsed = JSON.parse(line.slice(6));
                    if (parsed.text) {
                      accumulatedText += parsed.text;
                      finalSource = parsed.source;
                      setVoiceAiResponse(accumulatedText);
                      setChatHistory(prev => {
                        const newHistory = [...prev];
                        if (newHistory.length > 0) {
                          newHistory[newHistory.length - 1] = {
                            sender: 'ai',
                            text: accumulatedText,
                            source: finalSource
                          };
                        }
                        return newHistory;
                      });
                    }
                  } catch (e) {}
                }
              }
            }

            // 스트리밍이 완료된 텍스트를 음성(TTS)으로 재생
            speakText(accumulatedText);

          } catch (err) {
            console.error(err);
            setIsChatLoading(false);
            setVoiceStatus('idle');
            setVoiceAiResponse(`⚠️ 연결 오류: ${err.message}`);
            
            // 통신 에러 발생 시, 챗 일지 영역에도 에러 사유를 붉게 각인하여 굳음 현상을 방지합니다.
            setChatHistory(prev => [...prev, 
              { sender: 'ai', text: `⚠️ AI 서비스 통신 실패: 로컬 LLM 서버 연결 오류. (${err.message})`, source: "System Warning" }
            ]);

            speakText("AI 서비스 연결에 실패했습니다. 모델 설정을 확인하십시오.");
          }
        }, 1200);
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
      }
      if (rec) {
        try {
          rec.abort();
        } catch (err) {
          console.error("음성 인식 정리 오류: ", err);
        }
      }
    };
  }, []);

  const speakText = (text) => {
    if (!synthRef.current) return;

    synthRef.current.cancel();

    // Clean markdown characters or prefix strings to make Speech synthesis cleaner
    const cleanedText = text
      .replace(/\[가상 AI 보조엔진 안내\]/g, '')
      .replace(/출처: [^\n]+/g, '')
      .replace(/[\*#`\-]/g, '')
      .replace(/[\d]\./g, '') // remove numbered list prefix dots
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.lang = 'ko-KR';

    // Find a good Korean voice if available
    const voices = synthRef.current.getVoices();
    const koVoice = voices.find(v => v.lang === 'ko-KR' || v.lang.startsWith('ko'));
    if (koVoice) {
      utterance.voice = koVoice;
    }

    utterance.onstart = () => {
      setVoiceStatus('speaking');
    };

    utterance.onend = () => {
      setVoiceStatus('idle');
    };

    utterance.onerror = (e) => {
      console.error("TTS 재생 오류: ", e);
      setVoiceStatus('idle');
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const startVoiceInteraction = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    if (recognitionRef.current) {
      try {
        // 이미 진행 중인 인식을 중단시켜 중복 충돌을 방지합니다.
        recognitionRef.current.abort();
      } catch (e) {}

      // 브라우저 리소스 정리 시간을 고려하여 50ms 대기 후 새로 기동합니다.
      setTimeout(() => {
        try {
          recognitionRef.current.start();
        } catch (err) {
          console.log("음성 인식 시작 실패: ", err);
        }
      }, 50);
    }
  };

  const stopVoiceInteraction = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setVoiceStatus('idle');
  };

  const deactivateVoiceMode = () => {
    stopVoiceInteraction();
    setIsVoiceActive(false);
  };

  const handleModelTypeChange = (val) => {
    setModelType(val);
    localStorage.setItem('onepass_model_type', val);
  };

  const handleApiKeyChange = (val) => {
    setApiKey(val);
    localStorage.setItem('onepass_gemini_api_key', val);
  };

  const checkOllamaStatus = async (endpointToCheck = localEndpoint) => {
    setOllamaStatus('checking');
    setOllamaError('');
    try {
      const response = await fetch('/backend/api/ollama/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpointToCheck })
      });
      const data = await response.json();
      if (data.status === 'running') {
        setOllamaStatus('running');
        setOllamaModels(data.models || []);
        if (data.models && data.models.length > 0) {
          // If the currently saved model is not in the fetched list, select the first one.
          if (!data.models.includes(localModel)) {
            const firstModel = data.models[0];
            setLocalModel(firstModel);
            localStorage.setItem('onepass_local_model', firstModel);
          }
        }
      } else {
        setOllamaStatus('failed');
        setOllamaError(data.error || '접근이 불가합니다.');
      }
    } catch (err) {
      setOllamaStatus('failed');
      setOllamaError(err.message || '네트워크 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    if (showSettings && modelType === 'local') {
      checkOllamaStatus(localEndpoint);
    }
  }, [showSettings, modelType]);

  // 3-Layer 토글 상태
  const [layersVisibility, setLayersVisibility] = useState({
    layer1: true, // 피난약자
    layer2: true, // 의용소방대
    layer3: true  // 소방 정보(소화전/장애)
  });

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersGroup = useRef({});

  // 1. 기초 데이터 로드 및 초기 분석 수행
  useEffect(() => {
    fetch('/backend/api/scenario')
      .then(res => res.json())
      .then(data => {
        setScenarioData(data);
        // 기본 알고리즘 분석 초기 가동
        triggerAnalysis('largePump', 2.2, 500, 58, data);
      })
      .catch(err => console.error("백엔드 연결 실패: ", err));
  }, []);

  // 2. 지도 초기화 및 마커 렌더링
  useEffect(() => {
    if (!mapRef.current) return;
    
    // 지도가 이미 생성되어 있다면 파괴 후 재생성
    if (mapInstance.current) {
      mapInstance.current.remove();
    }

    // 의령군 무곡마을 중심 좌표
    const center = [35.3941, 128.3248];
    const map = L.map(mapRef.current, {
      center: center,
      zoom: 17,
      zoomControl: false
    });

    // 테마에 따른 타일레이어 설정
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
      attribution: '&copy; CartoDB'
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapInstance.current = map;
    markersGroup.current = {
      fire: [],
      vulnerable: [],
      volunteers: [],
      hydrant: [],
      geometry: []
    };

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [theme]);

  // 3. 레이어 토글 및 시나리오 데이터 변경 시 마커 갱신
  useEffect(() => {
    if (!mapInstance.current || !scenarioData) return;

    const map = mapInstance.current;
    
    // 기존 마커들 전부 제거
    Object.values(markersGroup.current).forEach(group => {
      group.forEach(layer => map.removeLayer(layer));
    });
    
    markersGroup.current = {
      fire: [],
      vulnerable: [],
      volunteers: [],
      hydrant: [],
      geometry: []
    };

    const firePoint = [scenarioData.firePoint.lat, scenarioData.firePoint.lng];

    // 화재 지점 마커 (항상 표출)
    const fireIcon = L.divIcon({
      className: 'custom-marker-fire',
      iconSize: [24, 24]
    });
    const fireMarker = L.marker(firePoint, { icon: fireIcon })
      .bindPopup(`<b>🔥 화점: 무곡마을길 36</b><br/>주택 화재 전면 전개 중`)
      .addTo(map);
    markersGroup.current.fire.push(fireMarker);

    // Layer 1: 피난약자 정보
    if (layersVisibility.layer1) {
      scenarioData.vulnerableGroups.forEach(vuln => {
        // 화점 주변에 위치를 모사하여 가상의 좌표 생성
        const offsetLat = (vuln.id === 'VULN-01') ? 0.0001 : -0.0003;
        const offsetLng = (vuln.id === 'VULN-01') ? 0.0001 : 0.0003;
        const vulnPoint = [scenarioData.firePoint.lat + offsetLat, scenarioData.firePoint.lng + offsetLng];
        
        const vulnIcon = L.divIcon({
          className: 'custom-marker-vuln',
          iconSize: [18, 18]
        });

        const vulnMarker = L.marker(vulnPoint, { icon: vulnIcon })
          .bindPopup(`
            <div style="color:#0a0d14; font-family:sans-serif; padding:5px;">
              <h4 style="margin:0 0 5px 0; color:#e040fb;">♿ 피난약자 (${vuln.ageBand})</h4>
              <p style="margin:2px 0"><b>상태:</b> ${vuln.condition}</p>
              <p style="margin:2px 0"><b>독거여부:</b> ${vuln.alone ? '예 (독거)' : '아니오'}</p>
              <p style="margin:2px 0"><b>자력대피능력:</b> ${vuln.mobility === 'low' ? '대피 불가' : '제한적 대피'}</p>
            </div>
          `)
          .addTo(map);

        // 대피반경 시각화
        const vulnCircle = L.circle(vulnPoint, {
          color: '#e040fb',
          fillColor: '#e040fb',
          fillOpacity: 0.1,
          radius: vuln.distanceFromFire_m
        }).addTo(map);

        markersGroup.current.vulnerable.push(vulnMarker, vulnCircle);
      });
    }

    // Layer 2: 의용소방대원 정보
    if (layersVisibility.layer2) {
      scenarioData.volunteers.forEach(vol => {
        const volPoint = [vol.lat, vol.lng];
        
        const volIcon = L.divIcon({
          className: 'custom-marker-volunteer',
          iconSize: [18, 18]
        });

        const volMarker = L.marker(volPoint, { icon: volIcon })
          .bindPopup(`
            <div style="color:#0a0d14; font-family:sans-serif; padding:5px;">
              <h4 style="margin:0 0 5px 0; color:#ffb300;">🧑‍🚒 의용소방대원: ${vol.name}</h4>
              <p style="margin:2px 0"><b>임무:</b> ${vol.role}</p>
              <p style="margin:2px 0"><b>상태:</b> ${vol.status} (${vol.eta_sec}초 내 도착)</p>
              <p style="margin:2px 0"><b>연락처:</b> ${vol.phone}</p>
            </div>
          `)
          .addTo(map);
        
        // 의용소방대원 위치에서 화점까지 실시간 매핑 라인
        const polyline = L.polyline([volPoint, firePoint], {
          color: '#ffea00',
          weight: 2,
          dashArray: '5, 8',
          opacity: 0.7
        }).addTo(map);

        markersGroup.current.volunteers.push(volMarker, polyline);
      });
    }

    // Layer 3: 소방정보 (소화전 & 진입 장애)
    if (layersVisibility.layer3) {
      // 소화전 표시
      const hydPoint = [scenarioData.hydrant.lat, scenarioData.hydrant.lng];
      const hydIcon = L.divIcon({
        className: 'custom-marker-hydrant',
        iconSize: [20, 20]
      });

      const hydrantMarker = L.marker(hydPoint, { icon: hydIcon })
        .bindPopup(`
          <div style="color:#0a0d14; font-family:sans-serif; padding:5px;">
            <h4 style="margin:0 0 5px 0; color:#2979ff;">💧 ${scenarioData.hydrant.type}</h4>
            <p style="margin:2px 0"><b>유량:</b> ${scenarioData.hydrant.flowRate}</p>
            <p style="margin:2px 0"><b>거리:</b> 화점으로부터 약 ${scenarioData.hydrant.distance_m}m</p>
          </div>
        `)
        .addTo(map);
      
      // 소화전 ~ 화점 연결선
      const hydLine = L.polyline([hydPoint, firePoint], {
        color: '#2979ff',
        weight: 3,
        opacity: 0.6
      }).addTo(map);

      // 진입로 장애 구간 표시
      const obsPoint = [scenarioData.roadObstruction.lat, scenarioData.roadObstruction.lng];
      const obsMarker = L.circleMarker(obsPoint, {
        color: '#ff3e3e',
        radius: 10,
        fillColor: '#ff3e3e',
        fillOpacity: 0.5
      })
      .bindPopup(`<b>⚠️ 진입로 협소 지점</b><br/>도로 폭: ${scenarioData.roadObstruction.width}m<br/>${scenarioData.roadObstruction.description}`)
      .addTo(map);

      markersGroup.current.hydrant.push(hydrantMarker, hydLine, obsMarker);
    }

  }, [layersVisibility, scenarioData]);

  // 4. 분석 실행 통합 핸들러
  const triggerAnalysis = (vehicle, width, hDist, fDist, data = scenarioData) => {
    if (!data) return;
    
    // Route Analysis API 호출
    fetch('/backend/api/analyze/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roadWidth: width, vehicleType: vehicle })
    })
    .then(res => res.json())
    .then(resData => setRouteResult(resData));

    // Hose Count Analysis API 호출
    fetch('/backend/api/analyze/hose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hydrantDistance: hDist, firePointDistance: fDist })
    })
    .then(res => res.json())
    .then(resData => setHoseResult(resData));

    // 의용소방대 가이드 호출
    data.volunteers.forEach(vol => {
      fetch('/api/analyze/volunteer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volunteerId: vol.id })
      })
      .then(res => res.json())
      .then(guideData => {
        setVolunteerGuides(prev => ({ ...prev, [vol.id]: guideData }));
      });
    });
  };

  // 5. 파라미터 수동 변경 적용
  const handleApplyParams = (e) => {
    e.preventDefault();
    triggerAnalysis(selectedVehicle, roadWidth, hydrantDistance, fireDistance);
  };

  // 6. AI 챗봇 전송
  const handleChatSend = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await fetch('/backend/api/llm/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userMessage,
          modelType: modelType,
          apiKey: apiKey,
          radioLogs: radioLogs,
          localEndpoint: localEndpoint,
          localModel: localModel
        })
      });

      if (!response.ok) {
        throw new Error("서버 통신 실패");
      }

      // 대화 로그에 빈 AI 응답 슬롯 추가
      setChatHistory(prev => [...prev, { sender: 'ai', text: '', source: '연결 중...' }]);
      setIsChatLoading(false);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedText = "";
      let finalSource = "AI Assistant";
      let streamBuffer = ""; // 쪼개진 chunk 조립용 버퍼

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          streamBuffer += decoder.decode(value, { stream: true });
          const parts = streamBuffer.split('\n\n');
          streamBuffer = parts.pop() || ""; // 미완성 조각 보존

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            const lines = trimmed.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.text) {
                    accumulatedText += parsed.text;
                    finalSource = parsed.source;
                    
                    setChatHistory(prev => {
                      const newHistory = [...prev];
                      if (newHistory.length > 0) {
                        newHistory[newHistory.length - 1] = {
                          sender: 'ai',
                          text: accumulatedText,
                          source: finalSource
                        };
                      }
                      return newHistory;
                    });
                  }
                } catch (e) {
                  // 조각 파싱 에러 스킵
                }
              }
            }
          }
        }
      }

      // 최종 잔류 버퍼 처리
      if (streamBuffer.trim()) {
        const lines = streamBuffer.trim().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.text) {
                accumulatedText += parsed.text;
                finalSource = parsed.source;
                setChatHistory(prev => {
                  const newHistory = [...prev];
                  if (newHistory.length > 0) {
                    newHistory[newHistory.length - 1] = {
                      sender: 'ai',
                      text: accumulatedText,
                      source: finalSource
                    };
                  }
                  return newHistory;
                });
              }
            } catch (e) {}
          }
        }
      }

    } catch (err) {
      console.error(err);
      setIsChatLoading(false);
      setChatHistory(prev => [...prev, { sender: 'ai', text: `⚠️ AI 서비스 통신 실패: ${err.message}`, source: "Error State" }]);
    }
  };

  // 7. 무전 STT 전송
  const handleRadioSend = async (e) => {
    e.preventDefault();
    if (!radioInput.trim()) return;

    const radioText = radioInput;
    setRadioInput('');
    setIsRadioLoading(true);

    try {
      const response = await fetch('/api/radio/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          radioText,
          modelType: modelType,
          apiKey: apiKey,
          localEndpoint: localEndpoint,
          localModel: localModel
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "요약 요청 실패");
      }
      
      const newLog = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        rawText: radioText,
        summary: data.summary,
        source: data.source
      };
      
      setRadioLogs(prev => [newLog, ...prev]);
      setActiveTab('summary');
    } catch (err) {
      console.error(err);
      const errorLog = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        rawText: radioText,
        summary: `⚠️ 무전 요약 실패: ${err.message}`,
        source: "Error State"
      };
      setRadioLogs(prev => [errorLog, ...prev]);
      setActiveTab('summary');
    } finally {
      setIsRadioLoading(false);
    }
  };

  // 가상 무전 프리셋 템플릿 입력기
  const applyRadioPreset = (text) => {
    setRadioInput(text);
  };

  return (
    <div className="app-container">
      
      {/* HEADER SECTION */}
      <header className="app-header glass-panel">
        <div className="brand-section">
          <div className="brand-logo">119</div>
          <div className="brand-title">
            <h1>119원패스 AI 플랫폼</h1>
            <p>생명존중·국민안전 골든타임 확보용 지능형 현장대응 프로토타입</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* AI Settings Container */}
          <div className="settings-container">
            <button className="btn-secondary settings-btn" onClick={() => setShowSettings(!showSettings)}>
              <Settings size={16} />
              <span>AI 모델: {modelType === 'gemini' ? 'Gemini API' : modelType === 'sandbox' ? 'Sandbox' : `Local (${localModel})`}</span>
            </button>
            
            {showSettings && (
              <div className="settings-dropdown glass-panel">
                <h3>🤖 AI 모델 선택</h3>
                <div className="settings-row" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                    <input 
                      type="radio" 
                      name="modelType" 
                      value="local" 
                      checked={modelType === 'local'} 
                      onChange={() => handleModelTypeChange('local')}
                    />
                    <span>로컬 LLM (Ollama)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                    <input 
                      type="radio" 
                      name="modelType" 
                      value="gemini" 
                      checked={modelType === 'gemini'} 
                      onChange={() => handleModelTypeChange('gemini')}
                    />
                    <span>Google Gemini API</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                    <input 
                      type="radio" 
                      name="modelType" 
                      value="sandbox" 
                      checked={modelType === 'sandbox'} 
                      onChange={() => handleModelTypeChange('sandbox')}
                    />
                    <span>가상 보조 엔진 (Sandbox)</span>
                  </label>
                </div>
                
                {modelType === 'gemini' && (
                  <div className="api-key-input-container">
                    <label htmlFor="apiKeyField">Google AI Studio API Key</label>
                    <input 
                      id="apiKeyField"
                      type="password"
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      className="form-input"
                    />
                    <p className="settings-tip">입력된 API 키는 로컬 브라우저에 안전하게 저장됩니다.</p>
                  </div>
                )}

                {modelType === 'local' && (
                  <div className="local-model-settings" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label htmlFor="localEndpointField" style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: 'var(--text-sub)' }}>Ollama 엔드포인트 주소</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          id="localEndpointField"
                          type="text"
                          placeholder="http://localhost:11434"
                          value={localEndpoint}
                          onChange={(e) => {
                            setLocalEndpoint(e.target.value);
                            localStorage.setItem('onepass_local_endpoint', e.target.value);
                          }}
                          className="form-input"
                          style={{ flex: 1, fontSize: '13px', padding: '6px 8px' }}
                        />
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={() => checkOllamaStatus(localEndpoint)}
                          style={{ fontSize: '12px', padding: '0 12px', whiteSpace: 'nowrap' }}
                          disabled={ollamaStatus === 'checking'}
                        >
                          {ollamaStatus === 'checking' ? '조회중...' : '연결 확인'}
                        </button>
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '6px' }}>
                        <span style={{ color: 'var(--text-sub)' }}>Ollama 상태:</span>
                        {ollamaStatus === 'running' && (
                          <span style={{ color: '#4caf50', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4caf50', display: 'inline-block' }}></span>
                            Running
                          </span>
                        )}
                        {ollamaStatus === 'failed' && (
                          <span style={{ color: '#f44336', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f44336', display: 'inline-block' }}></span>
                            Failed
                          </span>
                        )}
                        {ollamaStatus === 'checking' && (
                          <span style={{ color: '#ff9800', fontWeight: 'bold' }}>조회 중...</span>
                        )}
                        {ollamaStatus === 'idle' && (
                          <span style={{ color: 'var(--text-sub)' }}>미조회 (연결 확인 필요)</span>
                        )}
                      </div>
                      {ollamaError && (
                        <div style={{ fontSize: '11px', color: '#ff3e3e', marginBottom: '8px', wordBreak: 'break-all' }}>
                          ⚠️ {ollamaError}
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="localModelSelect" style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: 'var(--text-sub)' }}>사용 가능 모델 선택</label>
                      {ollamaStatus === 'running' && ollamaModels.length > 0 ? (
                        <select
                          id="localModelSelect"
                          className="form-select"
                          value={localModel}
                          onChange={(e) => {
                            setLocalModel(e.target.value);
                            localStorage.setItem('onepass_local_model', e.target.value);
                          }}
                          style={{ fontSize: '13px', padding: '6px 8px', width: '100%' }}
                        >
                          {ollamaModels.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <input 
                            id="localModelSelect"
                            type="text"
                            placeholder="gemma4:e2b"
                            value={localModel}
                            onChange={(e) => {
                              setLocalModel(e.target.value);
                              localStorage.setItem('onepass_local_model', e.target.value);
                            }}
                            className="form-input"
                            style={{ fontSize: '13px', padding: '6px 8px' }}
                          />
                          <p style={{ fontSize: '11px', color: 'var(--text-sub)', margin: 0 }}>
                            {ollamaStatus === 'running' ? '조회된 모델이 없습니다. 수동으로 모델명을 입력하세요.' : '서버 연결 후 모델을 선택하거나 수동 입력하세요.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button 
            className="btn-secondary" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '8px', 
              borderRadius: '50%', 
              width: '36px', 
              height: '36px',
              border: '1px solid var(--border-color)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-main)',
              cursor: 'pointer'
            }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {theme === 'dark' ? <Sparkles size={16} style={{ color: 'var(--color-warning)' }} /> : <Flame size={16} style={{ color: 'var(--color-primary)' }} />}
          </button>

          <div className="status-badge">
            <div className="status-indicator"></div>
            <span>실시간 다기관 데이터 통합 관제 가동 중 (의령군 무곡마을 PoC)</span>
          </div>
        </div>
      </header>

      {/* LEFT SIDEBAR - CONTROL & ALGORITHMS */}
      <aside className="left-sidebar">
        
        {/* 현장 매개변수 설정 */}
        <div className="glass-panel info-card">
          <h2 className="card-title">
            <Compass size={18} /> 현장 조건 제어 시뮬레이션
          </h2>
          <form onSubmit={handleApplyParams}>
            <div className="form-group">
              <label className="form-label">차량 종류 선택</label>
              <select 
                className="form-select"
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
              >
                <option value="largePump">대형 펌프차 (폭 2.5m)</option>
                <option value="mediumPump">중형 펌프차 (폭 2.3m)</option>
                <option value="lightPump">경형 소방차 (폭 1.8m)</option>
                <option value="command">지휘차 (폭 1.9m)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">진입로 최소 도로 폭 (m)</label>
              <input 
                type="number" 
                step="0.1"
                className="form-input"
                value={roadWidth}
                onChange={(e) => setRoadWidth(Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">소화전(수리)과의 거리 (m)</label>
              <input 
                type="number" 
                className="form-input"
                value={hydrantDistance}
                onChange={(e) => setHydrantDistance(Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">부서위치 ~ 화점 거리 (m)</label>
              <input 
                type="number" 
                className="form-input"
                value={fireDistance}
                onChange={(e) => setFireDistance(Number(e.target.value))}
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              <Play size={16} /> 실시간 알고리즘 분석 재연산
            </button>
          </form>
        </div>

        {/* AI 진입 및 소방력 산출 결과 판정 */}
        <div className="glass-panel info-card" style={{ flexGrow: 1 }}>
          <h2 className="card-title">
            <ShieldAlert size={18} /> AI 현장 진입 및 소방력 판정
          </h2>
          
          {routeResult && (
            <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>🛣️ 진입로 접근성 분석</span>
                <span style={{ 
                  fontSize: '11px', 
                  padding: '2px 8px', 
                  borderRadius: '10px', 
                  fontWeight: 'bold',
                  background: routeResult.passable ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 62, 62, 0.2)',
                  color: routeResult.passable ? 'var(--color-success)' : 'var(--color-primary)' 
                }}>
                  {routeResult.passable ? '진입 가능' : '진입 불가'}
                </span>
              </div>
              <p style={{ fontSize: '12px', lineHeight: '1.4', color: 'var(--text-muted)' }}>
                {routeResult.guideMessage}
              </p>
            </div>
          )}

          {hoseResult && (
            <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>🚒 소방력 산정 (호스 본수)</span>
                <span style={{ 
                  fontSize: '11px', 
                  padding: '2px 8px', 
                  borderRadius: '10px', 
                  fontWeight: 'bold',
                  background: 'rgba(41, 121, 255, 0.2)',
                  color: 'var(--color-secondary)'
                }}>
                  총 {hoseResult.totalHoseCount}본 필요
                </span>
              </div>
              <p style={{ fontSize: '12px', lineHeight: '1.4', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {hoseResult.guideMessage}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', fontSize: '11px' }}>
                <div>방수 연장: <strong style={{ color: 'var(--color-success)' }}>{hoseResult.attackHoseCount}본</strong> ({hoseResult.attackDistanceMatched}m)</div>
                <div>수리 공급: <strong style={{ color: 'var(--color-secondary)' }}>{hoseResult.supplyHoseCount}본</strong> ({hoseResult.supplyDistanceMatched}m)</div>
              </div>
            </div>
          )}

          {/* 3-Layer 토글 레전드 */}
          <div>
            <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>🗺️ 3-Layer 지도 시각화 필터</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={layersVisibility.layer1} 
                  onChange={(e) => setLayersVisibility(prev => ({ ...prev, layer1: e.target.checked }))}
                />
                <span style={{ color: '#e040fb', fontWeight: 'bold' }}>Layer 1: 피난약자 거주 분포 (복지DB)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={layersVisibility.layer2} 
                  onChange={(e) => setLayersVisibility(prev => ({ ...prev, layer2: e.target.checked }))}
                />
                <span style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>Layer 2: 의용소방대 실시간 동원 (GPS)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={layersVisibility.layer3} 
                  onChange={(e) => setLayersVisibility(prev => ({ ...prev, layer3: e.target.checked }))}
                />
                <span style={{ color: 'var(--color-secondary)', fontWeight: 'bold' }}>Layer 3: 소방정보 (수리/진입 장애)</span>
              </label>
            </div>
          </div>

        </div>
      </aside>

      {/* CENTER - MAP PORT */}
      <main className="map-viewport glass-panel">
        <div ref={mapRef} style={{ height: '100%', width: '100%' }}></div>
        
        {/* Layer 3D Legend Map Overlay */}
        <div className="map-layers-control glass-panel">
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            계층별 활성화 제어
          </div>
          <button 
            className={`layer-toggle-btn ${layersVisibility.layer1 ? 'active' : ''}`}
            onClick={() => setLayersVisibility(prev => ({ ...prev, layer1: !prev.layer1 }))}
          >
            <Users size={14} style={{ color: '#e040fb' }} /> Layer 1: 피난약자 ({scenarioData?.vulnerableGroups.length || 0})
          </button>
          <button 
            className={`layer-toggle-btn ${layersVisibility.layer2 ? 'active' : ''}`}
            onClick={() => setLayersVisibility(prev => ({ ...prev, layer2: !prev.layer2 }))}
          >
            <Navigation size={14} style={{ color: 'var(--color-warning)' }} /> Layer 2: 의용소방대 ({scenarioData?.volunteers.length || 0})
          </button>
          <button 
            className={`layer-toggle-btn ${layersVisibility.layer3 ? 'active' : ''}`}
            onClick={() => setLayersVisibility(prev => ({ ...prev, layer3: !prev.layer3 }))}
          >
            <Layers size={14} style={{ color: 'var(--color-info)' }} /> Layer 3: 소방수리 및 장애
          </button>
        </div>
      </main>

      {/* RIGHT SIDEBAR - AI COMMANDS & VOLUNTEERS */}
      <aside className="right-sidebar">
        
        {/* 의용소방대 행동 강령 실시간 안내 */}
        <div className="glass-panel info-card">
          <h2 className="card-title">
            <Users size={18} /> 의용소방대 GPS 기반 역할가이드
          </h2>
          {scenarioData?.volunteers.map(vol => {
            const guide = volunteerGuides[vol.id];
            return (
              <div key={vol.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold' }}>🧑‍🚒 {vol.name} 대원 ({vol.role})</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-warning)' }}>ETA {vol.eta_sec}초</span>
                </div>
                {guide ? (
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-success)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <strong>지령 상태: {guide.role}</strong>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '6px' }}>
                      {guide.alertMessage}
                    </p>
                    <div style={{ fontSize: '10px', background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '4px' }}>
                      {guide.steps.map((step, idx) => (
                        <div key={idx} style={{ marginBottom: '2px' }}>{step}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>알고리즘 계산 중...</span>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <a href={`tel:${vol.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-secondary)', textDecoration: 'none' }}>
                    <PhoneCall size={12} /> {vol.phone} 무선호출
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* AI 지휘 보조 챗봇 */}
        <div className="glass-panel info-card" style={{ display: 'flex', flexDirection: 'column', flex: '2 1 380px', position: 'relative', overflow: 'hidden', minHeight: '380px' }}>
          <h2 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} /> AI 현장 지휘대응 Q&A
            </span>
            <button 
              className="btn-voice-toggle" 
              onClick={() => {
                setIsVoiceActive(true);
                startVoiceInteraction();
              }}
              title="음성 대화 모드 활성화"
            >
              <Sparkles size={14} className="sparkle-icon" />
              <span>Live 음성 모드</span>
            </button>
          </h2>

          {/* Gemini Live Voice Overlay */}
          {isVoiceActive && (
            <div className="voice-overlay">
              <div className="voice-header">
                <div className="voice-title">
                  <Sparkles size={18} style={{ color: 'var(--color-secondary)' }} />
                  <h2>119원패스 Live 에이전트</h2>
                </div>
                <button className="voice-close-btn" onClick={deactivateVoiceMode} title="음성 모드 종료">
                  <X size={16} />
                </button>
              </div>

              <div className="voice-visualizer-container">
                <div className={`voice-glow-sphere ${voiceStatus}`}></div>
                
                {/* Waveform graphic when speaking */}
                <div className={`waveform ${voiceStatus === 'speaking' ? 'active' : ''}`} style={{ opacity: voiceStatus === 'speaking' ? 1 : 0.1 }}>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                </div>
              </div>

              <div className="voice-transcript-box">
                <div>
                  <div className="transcript-label">지휘관 무전 내용 (STT)</div>
                  <div className="user-transcript">
                    {voiceUserTranscript || "마이크 버튼을 눌러 음성으로 지시하거나 상황을 물어보십시오."}
                  </div>
                </div>
                {voiceAiResponse && (
                  <div>
                    <div className="transcript-label">AI 보조원 답변</div>
                    <div className="ai-response">{voiceAiResponse}</div>
                  </div>
                )}
              </div>

              <div className="voice-controls">
                <div className={`voice-status-text ${voiceStatus}`}>
                  {voiceStatus === 'idle' && '대기 중 (마이크 클릭하여 말하기)'}
                  {voiceStatus === 'listening' && '듣고 있습니다...'}
                  {voiceStatus === 'thinking' && '분석 및 대응방안 검색 중...'}
                  {voiceStatus === 'speaking' && '조언 안내 중...'}
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {voiceStatus === 'idle' ? (
                    <button className="btn-voice-action idle" onClick={startVoiceInteraction}>
                      <Mic size={24} />
                    </button>
                  ) : voiceStatus === 'speaking' ? (
                    <button className="btn-voice-action speaking" onClick={stopVoiceInteraction}>
                      <Square size={20} />
                    </button>
                  ) : voiceStatus === 'listening' ? (
                    <button className="btn-voice-action listening" onClick={stopVoiceInteraction}>
                      <MicOff size={24} />
                    </button>
                  ) : (
                    <button className="btn-voice-action thinking" disabled>
                      <Mic size={24} style={{ opacity: 0.5 }} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="chat-container" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="chat-history">
              {chatHistory.map((chat, idx) => (
                <div key={idx} className={`chat-bubble ${chat.sender}`}>
                  {chat.text}
                  {chat.source && (
                    <div style={{ fontSize: '9px', color: 'var(--color-secondary)', marginTop: '4px', textAlign: 'right' }}>
                      출처: {chat.source}
                    </div>
                  )}
                </div>
              ))}
              {isChatLoading && <div className="chat-bubble ai" style={{ opacity: 0.6 }}>AI가 질문을 분석하고 RAG 기반 실시간 조언을 도출하는 중입니다...</div>}
            </div>
            
            <form onSubmit={handleChatSend} className="chat-input-area">
              <input 
                type="text" 
                className="form-input" 
                placeholder="지휘 관련 질문을 입력하십시오..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isChatLoading}
              />
              <button type="submit" className="btn-primary" style={{ padding: '8px' }} disabled={isChatLoading}>
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>

        {/* AI 무전 분석 & 요약 */}
        <div className="glass-panel info-card" style={{ display: 'flex', flexDirection: 'column', flex: '0 0 auto', maxHeight: '280px', overflow: 'hidden' }}>
          <h2 className="card-title">
            <Radio size={18} /> 실시간 무전 관제 (STT 상황일지)
          </h2>
          
          {/* 가상 무전 프리셋 버튼들 */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <button 
              className="btn-secondary" 
              style={{ fontSize: '10px', padding: '4px 8px' }}
              onClick={() => applyRadioPreset("119구조대 보고한다, 무곡마을 입구에 부서 후 호스 4본 연장 개시, 소형 펌프차 화점 12미터 전방까지 강행 진입하여 방수 준비 중!")}
            >
              🎤 호스전개 무전
            </button>
            <button 
              className="btn-secondary" 
              style={{ fontSize: '10px', padding: '4px 8px' }}
              onClick={() => applyRadioPreset("의용소방대 선착 보고! 화점 12미터 인근 독거 어르신 발견하여 안전하게 마을 회관 방면으로 구조 완료함!")}
            >
              🎤 피난약자 구조완료 무전
            </button>
          </div>

          <form onSubmit={handleRadioSend} className="chat-input-area" style={{ padding: '0 0 10px 0' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="무전 텍스트를 입력하거나 프리셋 선택..." 
              value={radioInput}
              onChange={(e) => setRadioInput(e.target.value)}
              disabled={isRadioLoading}
            />
            <button type="submit" className="btn-primary" style={{ padding: '8px' }} disabled={isRadioLoading}>
              <Send size={16} />
            </button>
          </form>

          {/* 무전 로그 리스트 표시 */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '8px', fontSize: '12px' }}>
            <span 
              style={{ paddingBottom: '6px', cursor: 'pointer', color: activeTab === 'summary' ? 'var(--color-secondary)' : 'var(--text-muted)', borderBottom: activeTab === 'summary' ? '2px solid var(--color-secondary)' : 'none' }}
              onClick={() => setActiveTab('summary')}
            >
              상황 일지 ({radioLogs.length})
            </span>
            <span 
              style={{ paddingBottom: '6px', cursor: 'pointer', color: activeTab === 'logs' ? 'var(--color-secondary)' : 'var(--text-muted)', borderBottom: activeTab === 'logs' ? '2px solid var(--color-secondary)' : 'none' }}
              onClick={() => setActiveTab('logs')}
            >
              원본 무전 STT
            </span>
          </div>

          <div style={{ maxHeight: '100px', overflowY: 'auto', flexGrow: 1 }}>
            {activeTab === 'summary' ? (
              radioLogs.map(log => (
                <div key={log.id} style={{ background: 'rgba(0,0,0,0.15)', padding: '8px', borderRadius: '6px', marginBottom: '8px', fontSize: '11px', borderLeft: '3px solid var(--color-primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    <span>일시: {log.timestamp}</span>
                    <span style={{ color: 'var(--color-secondary)' }}>출처: {log.source}</span>
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'var(--text-main)', lineHeight: '1.4' }}>
                    {log.summary}
                  </pre>
                </div>
              ))
            ) : (
              radioLogs.map(log => (
                <div key={log.id} style={{ background: 'rgba(255,255,255,0.01)', padding: '6px 8px', borderRadius: '4px', marginBottom: '6px', fontSize: '11px' }}>
                  <div style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>[{log.timestamp}] 무전 STT 수신:</div>
                  <div style={{ color: 'var(--text-main)', fontStyle: 'italic', marginTop: '2px' }}>"{log.rawText}"</div>
                </div>
              ))
            )}
            {radioLogs.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '20px 0' }}>
                수신된 무전 내용이 없습니다. 상단에서 무전 템플릿을 선택해 테스트해 보십시오.
              </div>
            )}
          </div>
        </div>

      </aside>
      
    </div>
  );
}
