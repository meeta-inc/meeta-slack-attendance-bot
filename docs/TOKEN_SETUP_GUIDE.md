# 🔑 Slack & Notion 토큰 생성 가이드

## 1. Slack 앱 토큰 생성

### Step 1: Slack 앱 생성
1. [Slack API](https://api.slack.com/apps) 접속
2. **"Create New App"** 클릭
3. **"From scratch"** 선택
4. 앱 이름: `출퇴근 관리 봇` (또는 원하는 이름)
5. 워크스페이스 선택

### Step 2: Bot User 설정 (중요!)
1. 좌측 메뉴 **"App Home"** 클릭
2. **"Your App's Presence in Slack"** 섹션에서:
   - **"Edit"** 버튼 클릭
   - **Display Name (Bot Name)**: `출퇴근 관리 봇`
   - **Default username**: `attendance-bot` (공백 없이 소문자)
   - **"Save"** 클릭
3. **"Show Tabs"** 섹션에서:
   - **"Messages Tab"** 활성화 (Allow users to send Slash commands and messages)
   - ✅ **"Allow users to send Slash commands and messages from the messages tab"** 체크

### Step 3: Bot Token 생성 (xoxb-)
1. 좌측 메뉴 **"OAuth & Permissions"** 클릭
2. **Bot Token Scopes** 섹션에서 다음 권한 추가:
   - `chat:write` - 메시지 전송
   - `commands` - 슬래시 명령어
   - `channels:history` - 채널 히스토리
   - `channels:read` - 채널 정보 읽기
   - `groups:history` - 비공개 채널 히스토리
   - `groups:read` - 비공개 채널 정보
   - `im:history` - DM 히스토리
   - `im:write` - DM 전송
   - `users:read` - 사용자 정보 읽기

3. 페이지 상단 **"Install to Workspace"** 클릭
4. 권한 승인
5. **Bot User OAuth Token** 복사 (`xoxb-`로 시작)

### Step 4: Signing Secret 획득
1. 좌측 메뉴 **"Basic Information"** 클릭
2. **"App Credentials"** 섹션
3. **"Signing Secret"** 표시 후 복사

### Step 5: App Token 생성 (xapp-)
1. **"Basic Information"** 페이지
2. **"App-Level Tokens"** 섹션
3. **"Generate Token and Scopes"** 클릭
4. Token Name: `socket-mode` (또는 원하는 이름)
5. Scopes 추가:
   - `connections:write`
   - `authorizations:read` (선택)
6. **"Generate"** 클릭
7. 토큰 복사 (`xapp-`로 시작)

### Step 6: Socket Mode 활성화
1. 좌측 메뉴 **"Socket Mode"** 클릭
2. **"Enable Socket Mode"** 토글 ON

### Step 7: Event Subscriptions 설정
1. 좌측 메뉴 **"Event Subscriptions"** 클릭
2. **"Enable Events"** 토글 ON
3. **"Subscribe to bot events"**에 추가:
   - `app_mention` - 봇 멘션 이벤트
   - `member_joined_channel` - 채널 참가 이벤트

### Step 8: Slash Commands 설정
1. 좌측 메뉴 **"Slash Commands"** 클릭
2. **"Create New Command"** 클릭
3. 명령어 추가:
   - Command: `/attendance`
   - Short Description: 출퇴근 관리
   - Usage Hint: `status | month | help`

### Step 9: 앱 재설치
1. **"OAuth & Permissions"** → **"Reinstall to Workspace"**
2. 변경사항 적용 확인

---

## 2. Notion API 토큰 생성

### Step 1: Integration 생성
1. [Notion Integrations](https://www.notion.so/my-integrations) 접속
2. **"New integration"** 클릭
3. 설정:
   - Name: `Slack 출퇴근 봇`
   - Associated workspace: 사용할 워크스페이스 선택
   - Content Capabilities:
     - ✅ Read content
     - ✅ Update content
     - ✅ Insert content
   - Comment Capabilities:
     - ✅ Read comments
     - ✅ Create comments
   - User Capabilities:
     - ✅ Read user information (이메일 제외)

4. **"Submit"** 클릭
5. **Internal Integration Token** 복사 (`secret_`로 시작)

### Step 2: 데이터베이스에 Integration 연결
1. Notion에서 연동할 데이터베이스 페이지 열기
2. 우측 상단 **"..."** 메뉴 클릭
3. **"Connections"** 또는 **"연결"** 클릭
4. 생성한 Integration 검색 및 선택
5. **"Confirm"** 클릭

### Step 3: 데이터베이스 ID 획득
1. Notion 데이터베이스 페이지 열기
2. 브라우저 주소창에서 URL 확인:
   ```
   https://www.notion.so/workspace/데이터베이스이름-24e45c9756f8800c9d64ce70dea3c762
                                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                      이 부분이 데이터베이스 ID
   ```
3. 또는 **"Share"** → **"Copy link"**로 링크 복사 후 ID 추출

---

## 3. 토큰 정리

`.env.production` 파일에 입력할 토큰들:

| 토큰 종류 | 형식 | 획득 위치 |
|---------|------|----------|
| `SLACK_BOT_TOKEN` | `xoxb-...` | OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | 32자리 문자열 | Basic Information → Signing Secret |
| `SLACK_APP_TOKEN` | `xapp-...` | Basic Information → App-Level Tokens |
| `NOTION_API_KEY` | `secret_...` | Notion Integrations → Internal Integration Token |
| `NOTION_TASK_DATABASE_ID` | 32자리 hex | Notion 데이터베이스 URL에서 추출 |

---

## 4. 최종 확인 체크리스트

### Slack 설정
- [ ] Bot Token Scopes 9개 모두 추가됨
- [ ] Socket Mode 활성화됨
- [ ] Event Subscriptions 활성화 및 이벤트 2개 추가됨
- [ ] Slash Command `/attendance` 생성됨
- [ ] 워크스페이스에 앱 설치됨

### Notion 설정
- [ ] Integration 생성 완료
- [ ] 필요한 Capabilities 모두 체크됨
- [ ] 데이터베이스에 Integration 연결됨
- [ ] 데이터베이스 ID 확인됨

### 토큰 확인
- [ ] `xoxb-`로 시작하는 Bot Token
- [ ] 32자리 Signing Secret
- [ ] `xapp-`로 시작하는 App Token  
- [ ] `secret_`로 시작하는 Notion API Key
- [ ] 32자리 hex 형식의 Database ID

---

## 5. 트러블슈팅

### 🚨 "봇 사용자가 없습니다" 에러
**증상**: 앱 설치 시 "이 앱은 워크스페이스에 봇을 설치할 권한을 요청하지만 현재는 봇으로 구성되어 있지 않습니다" 메시지 출현

**해결 방법**:
1. **"App Home"** 페이지로 이동
2. **"Your App's Presence in Slack"** 섹션 확인
3. **Display Name**과 **Default username** 설정되어 있는지 확인
4. 설정이 없다면:
   - **"Edit"** 버튼 클릭
   - Display Name: `출퇴근 관리 봇`
   - Default username: `attendance-bot`
   - **"Save"** 클릭
5. **"Messages Tab"** 활성화 확인
6. **"OAuth & Permissions"**에서 Bot Token Scopes 최소 1개 이상 추가되어 있는지 확인
7. 앱 재설치: **"Reinstall to Workspace"**

### "not_authed" 오류
- Socket Mode가 활성화되어 있는지 확인
- App Token이 올바른지 확인

### "invalid_auth" 오류  
- Bot Token이 최신인지 확인
- 앱을 재설치해보기

### Notion "unauthorized" 오류
- Integration이 데이터베이스에 연결되어 있는지 확인
- API Key가 올바른지 확인

### 봇이 응답하지 않음
- Event Subscriptions이 활성화되어 있는지 확인
- 필요한 이벤트가 모두 추가되어 있는지 확인
- 봇이 채널에 초대되어 있는지 확인