// Lambda용 HTTP 방식 Slack 봇 (Socket Mode 대신)
const { App, ExpressReceiver } = require('@slack/bolt');
const serverless = require('serverless-http');

// HTTP 방식으로 변경 (Socket Mode 제거)
const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver
});

// 기존 이벤트 핸들러들...
app.event('app_home_opened', async ({ event, client }) => {
  // 홈 탭 로직
});

app.action('check_in', async ({ body, ack, client }) => {
  await ack();
  // 출근 로직
});

// Lambda 핸들러로 export
module.exports.handler = serverless(expressReceiver.app);