# Slack 출퇴근 관리 봇

Slack에서 간편하게 출퇴근을 기록하고 Notion과 연동하여 작업 내역을 관리할 수 있는 봇입니다.

## 주요 기능

### 📋 출퇴근 관리
- **원클릭 출퇴근**: 홈 탭에서 버튼 클릭으로 간편하게 출퇴근 기록
- **자동 알림**: 매일 오전 9시와 오후 6시에 출퇴근 리마인더 발송
- **수동 입력**: 깜빡한 날의 출퇴근 시간을 수동으로 입력 가능
- **근무 시간 자동 계산**: 출퇴근 시간을 기반으로 일일 근무 시간 자동 계산

### 📊 리포팅
- **월별 근무 현황**: 총 근무일, 근무 시간, 지각/조퇴/결근 통계 조회
- **주간 리포트**: 이번 주 근무 현황 한눈에 확인
- **실시간 상태 확인**: 오늘의 출퇴근 상태 즉시 확인

### 🔗 Notion 연동
- **자동 동기화**: 출퇴근 기록이 Notion 데이터베이스에 자동 저장
- **작업 내역 관리**: 퇴근 시 오늘 수행한 작업과 소요 시간 기록
- **카테고리 자동 분류**: 작업명을 기반으로 자동 카테고리 분류 (개발, 회의, 문서작업 등)
- **월별 작업 통계**: Notion에서 카테고리별 작업 시간 통계 확인

## 설치 방법

### 1. 사전 준비사항
- Node.js 14.0 이상
- Slack 워크스페이스 관리자 권한
- Notion 계정 및 API 키

### 2. 프로젝트 설정

```bash
# 저장소 클론
git clone [repository-url]
cd slack-attendance-bot

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
```

### 3. Slack 앱 설정

1. [Slack API](https://api.slack.com/apps)에서 새 앱 생성
2. Socket Mode 활성화 (Settings > Socket Mode)
3. 필요한 권한 추가:
   - **Bot Token Scopes**:
     - `chat:write` - 메시지 전송
     - `commands` - 슬래시 명령어
     - `im:history` - DM 히스토리
     - `im:write` - DM 전송
     - `users:read` - 사용자 정보 읽기
   - **Event Subscriptions**:
     - `app_home_opened` - 홈 탭 열기 이벤트

4. 앱을 워크스페이스에 설치

### 4. Notion 설정

#### 출퇴근 데이터베이스 생성
다음 속성을 가진 데이터베이스 생성:
- **사용자** (Title): 사용자 ID
- **날짜** (Date): 출퇴근 날짜
- **출근시간** (Text): 출근 시간
- **퇴근시간** (Text): 퇴근 시간
- **근무시간** (Text): 총 근무 시간
- **상태** (Select): 근무중, 퇴근완료
- **입력방식** (Select): 자동, 수동입력

#### 작업 데이터베이스 생성
다음 속성을 가진 데이터베이스 생성:
- **작업명** (Title): 작업 이름
- **날짜** (Date): 작업 수행 날짜
- **사용자** (Text): 사용자 ID
- **소요시간** (Number): 작업 소요 시간
- **카테고리** (Select): 개발, 회의, 문서작업, 코드리뷰, 테스트, 기획, 기타

### 5. 환경 변수 설정

`.env` 파일 편집:

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# Notion Configuration
NOTION_API_KEY=secret_your-notion-api-key
NOTION_DATABASE_ID=your-attendance-database-id
NOTION_TASK_DATABASE_ID=your-task-database-id

# App Configuration
PORT=3000
TZ=Asia/Seoul
DB_PATH=./data/attendance.db
```

### 6. 봇 실행

```bash
# 프로덕션 실행
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

## 사용 방법

### 홈 탭에서 사용
1. Slack 앱의 홈 탭을 엽니다
2. 현재 상태를 확인하고 필요한 버튼을 클릭:
   - **출근하기**: 출근 시간 기록
   - **퇴근하기**: 퇴근 시간 기록 및 작업 내역 입력
   - **수동 입력**: 과거 날짜의 출퇴근 기록 입력
   - **월별 현황**: 이번 달 근무 통계 조회

### 슬래시 명령어
- `/attendance status` - 오늘의 출퇴근 상태 확인
- `/attendance month` - 이번 달 근무 현황 조회
- `/attendance help` - 도움말 보기

### 자동 알림
- **오전 9시**: 출근하지 않은 사용자에게 출근 알림
- **오후 6시**: 퇴근하지 않은 사용자에게 퇴근 알림

## 프로젝트 구조

```
slack-attendance-bot/
├── src/
│   ├── index.js                 # 메인 애플리케이션
│   ├── services/
│   │   ├── AttendanceManager.js # 출퇴근 비즈니스 로직
│   │   └── NotionService.js     # Notion API 연동
│   ├── database/
│   │   └── Database.js          # SQLite 데이터베이스 관리
│   └── ui/
│       └── SlackUI.js           # Slack UI 컴포넌트
├── data/                        # SQLite 데이터베이스 파일
├── .env.example                 # 환경 변수 예제
├── package.json
└── README.md
```

## 주요 기능 상세

### 작업 카테고리 자동 분류
작업명에 포함된 키워드를 기반으로 자동 분류:
- **개발**: "개발", "코딩", "구현"
- **회의**: "회의", "미팅"
- **문서작업**: "문서", "작성", "리포트"
- **코드리뷰**: "리뷰", "검토"
- **테스트**: "테스트", "QA"
- **기획**: "기획", "설계"
- **기타**: 위 카테고리에 해당하지 않는 경우

### 근무 통계
- **지각**: 오전 9시 이후 출근
- **조퇴**: 오후 6시 이전 퇴근
- **결근**: 평일 중 출퇴근 기록이 없는 날

## 문제 해결

### 봇이 응답하지 않는 경우
1. Socket Mode가 활성화되어 있는지 확인
2. App Token이 올바른지 확인
3. 봇이 채널/DM에 초대되어 있는지 확인

### Notion 동기화가 안 되는 경우
1. Notion API 키가 올바른지 확인
2. 데이터베이스 ID가 올바른지 확인
3. Notion 데이터베이스에 필요한 속성이 모두 있는지 확인

### 데이터베이스 오류
1. `data` 디렉토리에 쓰기 권한이 있는지 확인
2. SQLite3가 올바르게 설치되어 있는지 확인

## 라이선스

MIT License