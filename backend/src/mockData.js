// 의령군 정곡면 무곡마을(정곡-A-36) 화재 POC 가상 데이터
export const mockScenario = {
  incidentId: "INC-2026-0611",
  title: "의령군 정곡면 무곡마을 주택 화재",
  firePoint: {
    lat: 35.3941,
    lng: 128.3248,
    address: "경상남도 의령군 정곡면 무곡마을길 36"
  },
  roadObstruction: {
    lat: 35.3938,
    lng: 128.3244,
    description: "진입로 협소 (폭 2.2m) - 대형 소방차 진입 불가",
    width: 2.2
  },
  hydrant: {
    lat: 35.3912,
    lng: 128.3210,
    distance_m: 500,
    type: "지상식 소화전",
    flowRate: "1500 L/min"
  },
  // Layer 1: 피난약자 정보 (비식별 처리)
  vulnerableGroups: [
    {
      id: "VULN-01",
      gridId: "GRID-JG-3601",
      ageBand: "80대",
      gender: "여성",
      mobility: "low", // 자력대피불가
      condition: "치매 및 거동불편",
      alone: true,
      distanceFromFire_m: 12 // 화점과의 거리
    },
    {
      id: "VULN-02",
      gridId: "GRID-JG-3605",
      ageBand: "70대",
      gender: "남성",
      mobility: "mid", // 부축 대피 필요
      condition: "만성 호흡기 질환",
      alone: false,
      distanceFromFire_m: 45
    }
  ],
  // Layer 2: 의용소방대 실시간 위치 및 정보
  volunteers: [
    {
      id: "VOL-01",
      name: "박의용",
      lat: 35.3965,
      lng: 128.3262,
      distance_m: 350,
      status: "출동중", // Standby -> Responding -> Arrived
      role: "선착대원",
      eta_sec: 120,
      phone: "010-XXXX-1119"
    },
    {
      id: "VOL-02",
      name: "이소방",
      lat: 35.4012,
      lng: 128.3298,
      distance_m: 1100,
      status: "동원수락",
      role: "후착대원",
      eta_sec: 300,
      phone: "010-XXXX-1120"
    }
  ]
};
