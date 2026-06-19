// 119원패스 AI 플랫폼 핵심 소방 대응 알고리즘

/**
 * 1. 차량 종별 도로 진입 가능 여부 판정 및 우회/부서 가이드 산출
 * @param {number} roadWidth - 도로 폭 (m)
 * @param {string} vehicleType - 차량 종별 (largePump, mediumPump, lightPump, command)
 */
export function analyzeRouteAccessibility(roadWidth, vehicleType) {
  const specs = {
    largePump: { name: "대형 펌프차", width: 2.5, requiredMargin: 0.3 },
    mediumPump: { name: "중형 펌프차", width: 2.3, requiredMargin: 0.2 },
    lightPump: { name: "경형 소방차", width: 1.8, requiredMargin: 0.2 },
    command: { name: "지휘차", width: 1.9, requiredMargin: 0.2 }
  };

  const spec = specs[vehicleType] || { name: "일반 소방차", width: 2.3, requiredMargin: 0.2 };
  const minimumPassableWidth = spec.width + spec.requiredMargin;
  const passable = roadWidth >= minimumPassableWidth;

  return {
    vehicleType,
    vehicleName: spec.name,
    vehicleWidth: spec.width,
    roadWidth,
    passable,
    guideMessage: passable
      ? `[진입 가능] 도로 폭(${roadWidth}m)이 차량 너비(${spec.width}m)보다 여유가 있어 즉시 진입 가능합니다.`
      : `[진입 불가] 진입로 협소(폭 ${roadWidth}m < 통과필요 ${minimumPassableWidth.toFixed(1)}m). ${spec.name}는 무곡마을 입구(부서위치, 화점 58m 전방)에 부서 후 호스 연장 연계가 필요합니다.`
  };
}

/**
 * 2. 수리 거리 및 부서 위치에 따른 필요 소방 호스 본수 산정 (호스 1본 = 15m)
 * @param {number} hydrantDistance - 소화전(수리)과의 거리 (m)
 * @param {number} firePointDistance - 차량 부서위치부터 화점까지의 거리 (m)
 */
export function calculateRequiredHose(hydrantDistance, firePointDistance) {
  const HOSE_LENGTH = 15; // 1본당 15미터
  
  // 부서 위치에서 화점까지 송수를 위한 호스 본수 (올림 처리 + 여유 1본)
  const attackHoseCount = Math.ceil(firePointDistance / HOSE_LENGTH) + 1;
  const attackDistanceMatched = attackHoseCount * HOSE_LENGTH;

  // 소화전(수리)에서 소방차까지 점령을 위한 호스 본수 (올림 처리)
  const supplyHoseCount = Math.ceil(hydrantDistance / HOSE_LENGTH);
  const supplyDistanceMatched = supplyHoseCount * HOSE_LENGTH;

  return {
    firePointDistance,
    attackHoseCount,
    attackDistanceMatched,
    hydrantDistance,
    supplyHoseCount,
    supplyDistanceMatched,
    totalHoseCount: attackHoseCount + supplyHoseCount,
    guideMessage: `화점 부서 위치(화점 전방 ${firePointDistance}m) 기준, 화점 방수를 위해 소방 호스 최소 ${attackHoseCount}본 연장이 필요합니다. 추가로 소화전(거리 ${hydrantDistance}m) 점령을 위해 공급 호스 ${supplyHoseCount}본 연장이 필요합니다.`
  };
}

/**
 * 3. 의용소방대원 선·후착별 자동 행동 가이드 생성
 * @param {object} volunteer - 의용소방대원 객체
 * @param {object} firePoint - 화재 발생 지점
 * @param {array} vulnerableGroups - 화재 지역 내 피난약자 정보
 */
export function generateVolunteerGuide(volunteer, firePoint, vulnerableGroups) {
  const isEarlyArrival = volunteer.eta_sec <= 180; // 3분(180초) 이내 선착 여부
  const targetVulnerable = vulnerableGroups.find(v => v.mobility === 'low') || vulnerableGroups[0];
  
  let steps = [];
  if (isEarlyArrival) {
    steps = [
      `1단계: 현장 상황 파악 및 전파 - 협소 도로 진입로 방해 차량 이동 조치 및 연소 상황 정보 무전/전화 송신`,
      `2단계: 피난약자 구조 지원 - 화점 ${targetVulnerable.distanceFromFire_m}m 인근의 피난약자(${targetVulnerable.ageBand} ${targetVulnerable.condition}) 대피 지원 최우선 실시`,
      `3단계: 소방 차량 진입 유도 - 무곡마을 입구(폭 2.2m 구간)에서 소형 펌프차 진입로 유도 및 대형차량 정차 위치 안내`
    ];
  } else {
    steps = [
      `1단계: 소방수리 점령 지원 - 화점 약 500m 인근 소화전 위치 점검 및 소방차량 수리 공급 라인(호스 연장) 대기`,
      `2단계: 소방 활동 보조 - 소방차 부서 완료 즉시 화점 방수를 위한 호스 4본 전개 및 연장 작업 지원`,
      `3단계: 외곽 통제 - 현장 주변 외부인 출입 통제 및 2차 연소 확산 감시`
    ];
  }

  return {
    volunteerId: volunteer.id,
    volunteerName: volunteer.name,
    isEarlyArrival,
    role: isEarlyArrival ? "선착 대응대" : "후착 지원대",
    eta: `${Math.round(volunteer.eta_sec / 60)}분`,
    steps,
    alertMessage: isEarlyArrival 
      ? `🚨 초긴급: 현장 인근 피난약자(${targetVulnerable.ageBand}, ${targetVulnerable.condition})가 자력대피불가 상태입니다. 안전거리 확보 하에 즉시 구조를 시도해 주십시오!`
      : `📢 소방대 도착 시 소화전 공급 및 호스 연장 작업을 즉각 지원할 수 있도록 소화전 인근에서 대기하십시오.`
  };
}
