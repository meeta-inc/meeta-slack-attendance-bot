# AWS App Runner를 이용한 Slack 출퇴근 봇 배포 가이드

이 가이드는 Slack 출퇴근 관리 봇을 AWS App Runner를 사용하여 배포하는 전체 과정을 설명합니다.

## 📋 목차
1. [아키텍처 개요](#아키텍처-개요)
2. [사전 준비사항](#사전-준비사항)
3. [Slack 앱 설정](#1-slack-앱-설정)
4. [Notion 설정](#2-notion-설정)
5. [AWS 리소스 생성](#3-aws-리소스-생성)
6. [애플리케이션 준비](#4-애플리케이션-준비)
7. [AWS App Runner 배포](#5-aws-app-runner-배포)
8. [모니터링 및 운영](#6-모니터링-및-운영)
9. [향후 확장 계획](#7-향후-확장-계획)
10. [문제 해결](#8-문제-해결)

## 아키텍처 개요

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Slack     │────▶│ App Runner   │────▶│  DynamoDB   │
│ Workspace   │     │   Service    │     │  (SQLite)   │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │   Notion     │
                    │     API      │
                    └──────────────┘
```

### 주요 AWS 리소스
- **AWS App Runner**: 컨테이너화된 애플리케이션 실행
- **Amazon DynamoDB**: 출퇴근 데이터 저장 (선택사항, 기본은 SQLite)
- **Amazon ECR**: Docker 이미지 저장소
- **AWS IAM**: 권한 관리

### 예상 비용 (월 기준)
- App Runner: ~$5 (최소 인스턴스 1개)
- DynamoDB: ~$0.25 (온디맨드 모드, 소규모 사용)
- ECR: ~$0.10 (이미지 저장)
- **총 예상 비용: 월 $5-10**

## 사전 준비사항

### 필수 도구
- AWS CLI 설치 및 구성
- Docker Desktop
- Node.js 18.x 이상
- Git

### AWS 계정 설정
```bash
# AWS CLI 설치 확인
aws --version

# AWS 자격증명 구성
aws configure
# AWS Access Key ID: [YOUR_ACCESS_KEY]
# AWS Secret Access Key: [YOUR_SECRET_KEY]
# Default region name: ap-northeast-1
# Default output format: json
```

## 1. Slack 앱 설정

### 1.1 Slack 앱 생성
1. [Slack API](https://api.slack.com/apps)에 접속
2. "Create New App" 클릭
3. "From scratch" 선택
4. 앱 이름: "출퇴근 관리 봇"
5. 워크스페이스 선택

### 1.2 Socket Mode 활성화
```
Settings > Socket Mode
- Enable Socket Mode: ON
- Token Name: "Production"
- 생성된 App-Level Token 저장 (xapp-로 시작)
```

### 1.3 OAuth & Permissions 설정
```
OAuth & Permissions > Scopes > Bot Token Scopes
필수 권한 추가:
- chat:write
- channels:history
- channels:read
- groups:history
- groups:read
- im:history
- im:write
- users:read
- commands
```

### 1.4 Event Subscriptions 설정
```
Event Subscriptions
- Enable Events: ON
- Subscribe to bot events:
  - app_mention
  - member_joined_channel
  - message.im
```

### 1.5 Interactivity & Shortcuts
```
Interactivity & Shortcuts
- Interactivity: ON
- Request URL은 Socket Mode 사용시 불필요
```

### 1.6 Slash Commands 생성
```
Slash Commands > Create New Command
- Command: /attendance
- Request URL: Socket Mode 사용시 자동
- Short Description: 출퇴근 관리
- Usage Hint: status | month | help
```

### 1.7 앱 설치 및 토큰 저장
```
OAuth & Permissions > OAuth Tokens
- Install to Workspace 클릭
- Bot User OAuth Token 저장 (xoxb-로 시작)

Basic Information
- Signing Secret 저장
```

## 2. Notion 설정

### 2.1 Notion Integration 생성
1. [Notion Developers](https://www.notion.so/my-integrations) 접속
2. "New integration" 클릭
3. 설정:
   - Name: "출퇴근 봇"
   - Associated workspace: 본인 워크스페이스
   - Capabilities: 
     - Read content ✓
     - Update content ✓
     - Insert content ✓
     - Read comments ✓
     - Create comments ✓

### 2.2 Integration Secret 저장
```
생성 후 "Internal Integration Secret" 복사
(secret_로 시작하는 토큰)
```

### 2.3 데이터베이스 연결
1. Notion에서 "sub tasks" 데이터베이스 열기
2. 우측 상단 "..." 메뉴 > "Add connections"
3. 생성한 Integration 선택
4. 데이터베이스 ID 확인:
   - URL: notion.so/workspace/24e45c9756f8800c9d64ce70dea3c762
   - ID: 24e45c9756f8800c9d64ce70dea3c762

## 3. AWS 리소스 생성

### 3.1 DynamoDB 테이블 생성 (선택사항)
```bash
# SQLite 대신 DynamoDB 사용시
aws dynamodb create-table \
  --table-name slack-attendance \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=date,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=date,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-1
```

### 3.2 ECR 리포지토리 생성
```bash
# ECR 리포지토리 생성
aws ecr create-repository \
  --repository-name slack-attendance-bot \
  --region ap-northeast-1

# 로그인
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  [YOUR_ACCOUNT_ID].dkr.ecr.ap-northeast-1.amazonaws.com
```

### 3.3 IAM 역할 생성
```bash
# App Runner 서비스 역할 생성
cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "build.apprunner.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name AppRunnerECRAccessRole \
  --assume-role-policy-document file://trust-policy.json

# ECR 접근 정책 연결
aws iam attach-role-policy \
  --role-name AppRunnerECRAccessRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
```

## 4. 애플리케이션 준비

### 4.1 환경 변수 설정
`.env.production` 파일 생성:
```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# Notion Configuration
NOTION_API_KEY=secret_your-notion-api-key
NOTION_TASK_DATABASE_ID=24e45c9756f8800c9d64ce70dea3c762

# App Configuration
PORT=3000
TZ=Asia/Seoul
DB_PATH=/data/attendance.db
NODE_ENV=production
```

### 4.2 Dockerfile 생성
```dockerfile
# Multi-stage build for optimization
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Create data directory
RUN mkdir -p /data && chown -R nodejs:nodejs /data

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
```

### 4.3 Health Check 엔드포인트 추가
`src/index.js`에 추가:
```javascript
// Health check endpoint for App Runner
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});
```

### 4.4 Docker 이미지 빌드 및 푸시
```bash
# 이미지 빌드
docker build -t slack-attendance-bot .

# 태그 지정
docker tag slack-attendance-bot:latest \
  [YOUR_ACCOUNT_ID].dkr.ecr.ap-northeast-1.amazonaws.com/slack-attendance-bot:latest

# ECR에 푸시
docker push \
  [YOUR_ACCOUNT_ID].dkr.ecr.ap-northeast-1.amazonaws.com/slack-attendance-bot:latest
```

## 5. AWS App Runner 배포

### 5.1 App Runner 서비스 구성 파일
`apprunner.yaml` 생성:
```yaml
version: 1.0
runtime: docker
build:
  commands:
    build:
      - echo "No build commands"
run:
  runtime-version: latest
  command: node src/index.js
  network:
    port: 3000
    env: PORT
  env:
    - name: NODE_ENV
      value: production
    - name: TZ
      value: Asia/Seoul
```

### 5.2 App Runner 서비스 생성
```bash
# 서비스 생성
aws apprunner create-service \
  --service-name "slack-attendance-bot" \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "[YOUR_ACCOUNT_ID].dkr.ecr.ap-northeast-1.amazonaws.com/slack-attendance-bot:latest",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "SLACK_BOT_TOKEN": "xoxb-your-token",
          "SLACK_SIGNING_SECRET": "your-secret",
          "SLACK_APP_TOKEN": "xapp-your-token",
          "NOTION_API_KEY": "secret_your-key",
          "NOTION_TASK_DATABASE_ID": "24e45c9756f8800c9d64ce70dea3c762",
          "TZ": "Asia/Seoul",
          "NODE_ENV": "production"
        }
      },
      "ImageRepositoryType": "ECR"
    },
    "AutoDeploymentsEnabled": false,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::[YOUR_ACCOUNT_ID]:role/AppRunnerECRAccessRole"
    }
  }' \
  --region ap-northeast-1
```

### 5.3 자동 배포 설정 (GitHub Actions)
`.github/workflows/deploy.yml`:
```yaml
name: Deploy to AWS App Runner

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ap-northeast-1
    
    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1
    
    - name: Build and push Docker image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: slack-attendance-bot
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
    
    - name: Deploy to App Runner
      run: |
        aws apprunner start-deployment \
          --service-arn $(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='slack-attendance-bot'].ServiceArn" --output text)
```

## 6. 모니터링 및 운영

### 6.1 CloudWatch 로그 확인
```bash
# 로그 스트림 확인
aws logs describe-log-streams \
  --log-group-name /aws/apprunner/slack-attendance-bot/service

# 로그 조회
aws logs filter-log-events \
  --log-group-name /aws/apprunner/slack-attendance-bot/service \
  --start-time $(date -u -d '1 hour ago' +%s000)
```

### 6.2 서비스 상태 확인
```bash
# 서비스 상태 조회
aws apprunner describe-service \
  --service-arn $(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='slack-attendance-bot'].ServiceArn" --output text) \
  --query "Service.Status"
```

### 6.3 알림 설정
CloudWatch 알람 생성:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name slack-bot-health \
  --alarm-description "Alert when Slack bot is unhealthy" \
  --metric-name CPUUtilization \
  --namespace AWS/AppRunner \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## 7. 향후 확장 계획

### 7.1 테스트 자동화 통합
향후 Slack을 통한 테스트 시나리오 실행 기능 추가시:

```javascript
// 예시: Playwright 테스트 실행 명령
slackApp.command('/test', async ({ command, ack, respond }) => {
  await ack();
  
  // Lambda 함수 호출하여 테스트 실행
  const lambda = new AWS.Lambda();
  const result = await lambda.invoke({
    FunctionName: 'playwright-test-runner',
    Payload: JSON.stringify({
      scenario: command.text,
      channel: command.channel_id
    })
  }).promise();
  
  await respond(`테스트 실행 중: ${command.text}`);
});
```

### 7.2 Claude API 통합
AI 기반 자동화 추가시:

```javascript
// 예시: Claude를 통한 자동 분석
const analyzeWithClaude = async (testResults) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.CLAUDE_API_KEY,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      messages: [{
        role: 'user',
        content: `테스트 결과를 분석해주세요: ${JSON.stringify(testResults)}`
      }]
    })
  });
  
  return response.json();
};
```

### 7.3 추가 AWS 서비스 통합
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   App Runner │────▶│   Lambda     │────▶│   Fargate    │
│   (Bot Core) │     │ (Test Runner)│     │ (Playwright) │
└──────────────┘     └──────────────┘     └──────────────┘
        │                    │                      │
        ▼                    ▼                      ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   DynamoDB   │     │  S3 Bucket   │     │   CloudWatch │
│   (State)    │     │  (Reports)   │     │   (Logs)     │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 7.4 비용 최적화 전략
- **Reserved Capacity**: App Runner 예약 용량으로 25% 비용 절감
- **Auto Scaling**: 사용량 기반 자동 스케일링 설정
- **S3 Lifecycle**: 오래된 로그 및 리포트 자동 삭제

## 8. 문제 해결

### 8.1 일반적인 문제

#### Socket Mode 연결 실패
```bash
# App Runner 로그 확인
aws logs tail /aws/apprunner/slack-attendance-bot/service --follow

# 환경 변수 확인
aws apprunner describe-service \
  --service-arn [SERVICE_ARN] \
  --query "Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables"
```

#### Notion API 오류
```javascript
// 디버깅 코드 추가
console.log('Notion API Key:', process.env.NOTION_API_KEY?.substring(0, 10) + '...');
console.log('Database ID:', process.env.NOTION_TASK_DATABASE_ID);
```

#### 메모리 부족
```bash
# App Runner 구성 업데이트
aws apprunner update-service \
  --service-arn [SERVICE_ARN] \
  --source-configuration '{
    "ImageRepository": {
      "ImageConfiguration": {
        "RuntimeEnvironmentVariables": {
          "NODE_OPTIONS": "--max-old-space-size=1024"
        }
      }
    }
  }'
```

### 8.2 성능 최적화

#### 캐싱 전략
```javascript
// Redis 캐싱 추가 (ElastiCache 사용시)
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST
});

const getCachedData = async (key) => {
  const cached = await client.get(key);
  if (cached) return JSON.parse(cached);
  return null;
};
```

#### 데이터베이스 최적화
```javascript
// Connection pooling for better performance
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(process.env.DB_PATH, 
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) console.error(err);
    else db.run('PRAGMA journal_mode = WAL'); // Write-Ahead Logging
  }
);
```

## 9. 보안 고려사항

### 9.1 Secrets Manager 사용
```bash
# Secret 생성
aws secretsmanager create-secret \
  --name slack-attendance-bot-secrets \
  --secret-string '{
    "SLACK_BOT_TOKEN":"xoxb-...",
    "SLACK_SIGNING_SECRET":"...",
    "SLACK_APP_TOKEN":"xapp-...",
    "NOTION_API_KEY":"secret_..."
  }'

# App Runner에서 사용
aws apprunner update-service \
  --service-arn [SERVICE_ARN] \
  --source-configuration '{
    "ImageRepository": {
      "ImageConfiguration": {
        "RuntimeEnvironmentSecrets": {
          "SLACK_BOT_TOKEN": "arn:aws:secretsmanager:ap-northeast-1:[ACCOUNT]:secret:slack-attendance-bot-secrets:SLACK_BOT_TOKEN::",
          "NOTION_API_KEY": "arn:aws:secretsmanager:ap-northeast-1:[ACCOUNT]:secret:slack-attendance-bot-secrets:NOTION_API_KEY::"
        }
      }
    }
  }'
```

### 9.2 네트워크 보안
- VPC 연결로 프라이빗 서브넷 사용
- Security Group으로 아웃바운드 트래픽 제한
- WAF 규칙으로 악의적 요청 차단

## 10. 비용 모니터링

### 월별 예산 알림 설정
```bash
aws budgets create-budget \
  --account-id [YOUR_ACCOUNT_ID] \
  --budget '{
    "BudgetName": "SlackBotMonthly",
    "BudgetLimit": {
      "Amount": "10",
      "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80
    },
    "Subscribers": [{
      "SubscriptionType": "EMAIL",
      "Address": "your-email@example.com"
    }]
  }]'
```

## 마무리

이 가이드를 따라 AWS App Runner를 사용하여 Slack 출퇴근 봇을 성공적으로 배포할 수 있습니다. 향후 테스트 자동화, AI 통합 등의 기능을 추가할 때도 이 아키텍처를 기반으로 확장 가능합니다.

### 체크리스트
- [ ] Slack 앱 생성 및 토큰 저장
- [ ] Notion Integration 생성 및 데이터베이스 연결
- [ ] AWS 계정 설정 및 CLI 구성
- [ ] ECR 리포지토리 생성
- [ ] Docker 이미지 빌드 및 푸시
- [ ] App Runner 서비스 생성
- [ ] 모니터링 설정
- [ ] 테스트 및 검증

문제 발생시 CloudWatch 로그를 확인하고, 필요시 AWS Support에 문의하세요.