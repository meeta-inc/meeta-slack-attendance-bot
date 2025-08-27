# 🚀 Slack Bot 배포 가이드

## 📋 배포 순서 (중요!)

### Step 1: Slack App 설정 ✅
1. [Slack API](https://api.slack.com/apps)에서 앱 생성
2. Socket Mode 활성화
3. 필요한 토큰 획득:
   - Bot User OAuth Token (`xoxb-...`)
   - Signing Secret
   - App-Level Token (`xapp-...`)

### Step 2: Notion Integration 설정 ✅
1. [Notion Integrations](https://www.notion.so/my-integrations)에서 통합 생성
2. API Key 획득 (`secret_...`)
3. 데이터베이스에 통합 연결

### Step 3: `.env.production` 파일 생성 ⚠️
```bash
cd slack-attendance-bot-standalone
cp .env.production.example .env.production
vim .env.production  # 실제 값으로 수정
```

**`.env.production` 내용:**
```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-실제-봇-토큰
SLACK_SIGNING_SECRET=실제-서명-시크릿
SLACK_APP_TOKEN=xapp-실제-앱-토큰

# Notion Configuration  
NOTION_API_KEY=secret_실제-API-키
NOTION_TASK_DATABASE_ID=24e45c9756f8800c9d64ce70dea3c762
```

### Step 4: 인프라 배포 (첫 배포) 🏗️
```bash
cd ../ai-navi-infrastructure
./scripts/deploy-slack-bot.sh dev

# 스크립트가 자동으로:
# 1. .env.production 파일 읽기
# 2. ECR 리포지토리 생성
# 3. Docker 이미지 빌드 & 푸시
# 4. Secrets Manager에 시크릿 저장
# 5. App Runner 서비스 생성
```

### Step 5: GitHub Secrets 설정 🔐
리포지토리 Settings → Secrets → Actions에서 추가:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### Step 6: 코드 푸시 & 자동 배포 🔄
```bash
git add .
git commit -m "feat: Add deployment configuration"
git push origin main  # 또는 develop
```

GitHub Actions가 자동으로:
1. Docker 이미지 빌드
2. ECR에 푸시
3. App Runner 재배포 트리거

## 🔄 업데이트 프로세스

### 코드 변경 시
```bash
git push  # GitHub Actions가 자동 배포
```

### 시크릿 변경 시
```bash
# AWS Console에서 Secrets Manager 업데이트
# 또는 CLI 사용:
aws secretsmanager update-secret \
  --secret-id ai-navi-slack-bot-secrets-dev \
  --secret-string '{"SLACK_BOT_TOKEN":"새토큰",...}'

# App Runner 재시작
aws apprunner start-deployment --service-arn <SERVICE_ARN>
```

## 🏗️ 환경별 배포

### 개발 환경 (dev)
```bash
./scripts/deploy-slack-bot.sh dev
```

### UAT 환경 (uat1)
```bash
./scripts/deploy-slack-bot.sh uat1
```

### 프로덕션 환경 (prd)
```bash
./scripts/deploy-slack-bot.sh prd  # 확인 프롬프트 표시
```

## 📊 배포 상태 확인

### App Runner 서비스 상태
```bash
aws apprunner list-services
aws apprunner describe-service --service-arn <ARN>
```

### Health Check
```bash
curl https://<APP_RUNNER_URL>/health
```

### CloudWatch 로그
```bash
aws logs tail /aws/apprunner/SlackBotStack-dev/service --follow
```

## ⚠️ 주의사항

1. **`.env.production` 파일은 절대 Git에 커밋하지 마세요**
   - `.gitignore`에 포함되어 있는지 확인

2. **첫 배포는 반드시 인프라 스크립트로**
   - GitHub Actions는 이미 존재하는 인프라에만 배포 가능

3. **환경별 분리**
   - 개발/UAT/프로덕션 환경별로 다른 `.env.production` 사용

## 🔧 문제 해결

### "ECR repository not found" 오류
```bash
# 인프라 스크립트 재실행
./scripts/deploy-slack-bot.sh dev
```

### "Secrets not found" 오류
```bash
# Secrets Manager 확인
aws secretsmanager get-secret-value \
  --secret-id ai-navi-slack-bot-secrets-dev
```

### App Runner가 시작되지 않을 때
1. CloudWatch 로그 확인
2. Health check 엔드포인트 응답 확인
3. 환경변수/시크릿 확인

## 📝 체크리스트

- [ ] Slack App 토큰 획득
- [ ] Notion API Key 획득
- [ ] `.env.production` 파일 생성
- [ ] 인프라 첫 배포 완료
- [ ] GitHub Secrets 설정
- [ ] GitHub Actions 테스트
- [ ] Health Check 확인
- [ ] Slack에서 봇 테스트