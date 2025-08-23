# 🚀 빠른 시작 가이드

## GitHub 저장소 생성 및 연결

1. **GitHub에서 새 저장소 생성**:
   - Repository name: `slack-attendance-bot`
   - Description: `Slack attendance management bot with Notion integration`
   - Public 또는 Private 선택
   - README, .gitignore, license 체크 해제 (이미 있음)

2. **원격 저장소 연결**:
```bash
# 현재 디렉토리에서 실행
git remote add origin https://github.com/[YOUR_USERNAME]/slack-attendance-bot.git
git branch -M main
git push -u origin main
```

## Railway 배포를 위한 다음 단계

1. Railway 계정 생성: https://railway.app
2. "Deploy from GitHub repo" 선택
3. 방금 생성한 저장소 선택
4. 환경 변수 설정 (README.md 참조)
5. 볼륨 설정: `/app/data`

## 상세한 배포 가이드

전체 배포 절차는 다음 Notion 문서를 참고하세요:
https://www.notion.so/25845c9756f88002b510cef6039c33f6

---

**주의사항**: 
- `.env.example`을 참고하여 환경 변수를 설정하세요
- Slack 앱과 Notion 데이터베이스가 사전에 준비되어야 합니다