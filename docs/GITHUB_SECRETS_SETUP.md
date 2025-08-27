# GitHub Secrets 설정 가이드

## 📋 필수 GitHub Secrets

### 1. AWS 인증 Secrets (필수)
GitHub Actions에서 AWS 리소스에 접근하기 위해 필요합니다.

| Secret 이름 | 설명 | 예시 |
|------------|------|------|
| `AWS_ACCESS_KEY_ID` | IAM 사용자 액세스 키 | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | IAM 사용자 시크릿 키 | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_ACCOUNT_ID` | AWS 계정 ID | `123456789012` |
| `AWS_REGION` | AWS 리전 | `ap-northeast-1` |
| `DOCKER_REGISTRY` | ECR 레지스트리 URL | `{account-id}.dkr.ecr.ap-northeast-1.amazonaws.com` |

### 2. Slack/Notion Secrets (선택)
AWS Secrets Manager를 사용하는 경우 불필요합니다.
직접 환경변수로 주입하려면 설정하세요.

| Secret 이름 | 설명 | 예시 |
|------------|------|------|
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 | `xoxb-1234567890-...` |
| `SLACK_SIGNING_SECRET` | Slack 서명 시크릿 | `8f742231b10e8888abcd99yyyzzz123` |
| `SLACK_APP_TOKEN` | Slack 앱 토큰 | `xapp-1-A1234567890-...` |
| `NOTION_API_KEY` | Notion API 키 | `secret_AbCdEfGhIjKlMnOpQrStUvWxYz...` |

## 🔧 설정 방법

### Step 1: IAM 사용자 생성

1. AWS Console → IAM → Users → Create user
2. 사용자 이름: `github-actions-slack-bot`
3. Access type: Programmatic access 선택

### Step 2: IAM 정책 연결

`docs/IAM_POLICY.json` 파일의 정책을 사용하거나 아래 AWS CLI 명령어 실행:

```bash
# 정책 생성
aws iam create-policy \
  --policy-name GitHubActionsSlackBotPolicy \
  --policy-document file://docs/IAM_POLICY.json

# 사용자에 정책 연결
aws iam attach-user-policy \
  --user-name github-actions-slack-bot \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/GitHubActionsSlackBotPolicy
```

### Step 3: GitHub Repository에 Secrets 추가

1. GitHub 리포지토리 방문
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** 클릭
4. 각 시크릿 추가

### Step 4: 환경별 Secrets (고급)

프로덕션과 개발 환경을 분리하려면 GitHub Environments 사용:

1. **Settings** → **Environments** → **New environment**
2. 환경별로 다른 AWS 계정 사용:
   - `dev`: 개발 AWS 계정 credentials
   - `uat1`: 스테이징 AWS 계정 credentials
   - `prd`: 프로덕션 AWS 계정 credentials

## 🔒 보안 권장사항

### 1. 최소 권한 원칙
- IAM 사용자는 필요한 최소 권한만 부여
- 와일드카드(*) 사용 최소화

### 2. 액세스 키 정기 교체
```bash
# 90일마다 액세스 키 교체
aws iam create-access-key --user-name github-actions-slack-bot
aws iam delete-access-key --access-key-id OLD_KEY_ID --user-name github-actions-slack-bot
```

### 3. 시크릿 스캔
- GitHub의 secret scanning 기능 활성화
- 실수로 커밋된 시크릿 자동 감지

### 4. 감사 로그
- CloudTrail로 API 호출 모니터링
- 비정상적인 활동 감지 시 알림

## 📝 체크리스트

- [ ] IAM 사용자 생성 완료
- [ ] IAM 정책 연결 완료
- [ ] GitHub Secrets 추가 완료
  - [ ] AWS_ACCESS_KEY_ID
  - [ ] AWS_SECRET_ACCESS_KEY
- [ ] GitHub Actions 워크플로우 테스트
- [ ] 환경별 분리 설정 (선택)

## 🚀 테스트 방법

1. 테스트 커밋 푸시:
```bash
git add .
git commit -m "test: GitHub Actions deployment"
git push origin develop
```

2. GitHub Actions 탭에서 워크플로우 실행 확인

3. 수동 실행 (디버깅용):
```bash
# GitHub UI에서 Actions → Deploy to AWS App Runner → Run workflow
```

## ❓ 문제 해결

### "Invalid credentials" 오류
- AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY 확인
- IAM 사용자 활성화 상태 확인

### "Access denied" 오류
- IAM 정책이 올바르게 연결되었는지 확인
- ECR 리포지토리 이름이 정책과 일치하는지 확인

### "Service not found" 오류
- 인프라가 먼저 배포되었는지 확인
- App Runner 서비스 이름 확인