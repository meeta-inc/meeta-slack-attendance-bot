require('dotenv').config();
const { App } = require('@slack/bolt');
const AttendanceManager = require('./services/AttendanceManager');
const NotionService = require('./services/NotionService');
const SlackUI = require('./ui/SlackUI');
const Database = require('./database/Database');
const cron = require('node-cron');
const moment = require('moment-timezone');

// 한국 시간대 설정
moment.tz.setDefault('Asia/Seoul');

// Slack 앱 초기화
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});

// 서비스 초기화
const db = new Database();
const notionService = new NotionService();
const attendanceManager = new AttendanceManager(db, notionService);
const slackUI = new SlackUI();

// 홈 탭 열기 이벤트
app.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    const userId = event.user;
    const todayStatus = await attendanceManager.getTodayStatus(userId);
    const homeView = slackUI.getHomeView(userId, todayStatus);
    
    await client.views.publish({
      user_id: userId,
      view: homeView
    });
  } catch (error) {
    logger.error(error);
  }
});

// 출근 버튼 클릭
app.action('check_in', async ({ body, ack, client, logger }) => {
  await ack();
  
  try {
    const userId = body.user.id;
    const result = await attendanceManager.checkIn(userId);
    
    // 홈 뷰 업데이트
    const todayStatus = await attendanceManager.getTodayStatus(userId);
    const homeView = slackUI.getHomeView(userId, todayStatus);
    
    await client.views.publish({
      user_id: userId,
      view: homeView
    });
    
    // 성공 메시지
    await client.chat.postMessage({
      channel: userId,
      text: `✅ 출근 완료! (${result.time})`
    });
    
  } catch (error) {
    logger.error(error);
    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ 출근 처리 중 오류가 발생했습니다: ${error.message}`
    });
  }
});

// 퇴근 버튼 클릭
app.action('check_out', async ({ body, ack, client, logger }) => {
  await ack();
  
  try {
    const userId = body.user.id;
    const result = await attendanceManager.checkOut(userId);
    
    // 홈 뷰 업데이트
    const todayStatus = await attendanceManager.getTodayStatus(userId);
    const homeView = slackUI.getHomeView(userId, todayStatus);
    
    await client.views.publish({
      user_id: userId,
      view: homeView
    });
    
    // 작업 기록 요청
    await client.views.open({
      trigger_id: body.trigger_id,
      view: slackUI.getTaskModal()
    });
    
    // 성공 메시지
    await client.chat.postMessage({
      channel: userId,
      text: `✅ 퇴근 완료! (${result.time})\n오늘 근무 시간: ${result.workHours}`
    });
    
  } catch (error) {
    logger.error(error);
    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ 퇴근 처리 중 오류가 발생했습니다: ${error.message}`
    });
  }
});

// 수동 입력 버튼 클릭
app.action('manual_entry', async ({ body, ack, client }) => {
  await ack();
  
  await client.views.open({
    trigger_id: body.trigger_id,
    view: slackUI.getManualEntryModal()
  });
});

// 월별 현황 조회
app.action('view_monthly', async ({ body, ack, client, logger }) => {
  await ack();
  
  try {
    const userId = body.user.id;
    const currentMonth = moment().format('YYYY-MM');
    const monthlyData = await attendanceManager.getMonthlyReport(userId, currentMonth);
    
    await client.views.open({
      trigger_id: body.trigger_id,
      view: slackUI.getMonthlyReportModal(monthlyData)
    });
    
  } catch (error) {
    logger.error(error);
  }
});

// 작업 기록 모달 제출
app.view('task_submission', async ({ ack, body, view, client }) => {
  await ack();
  
  const userId = body.user.id;
  const values = view.state.values;
  
  const tasks = [];
  for (let i = 1; i <= 3; i++) {
    const taskName = values[`task_${i}`]?.[`task_name_${i}`]?.value;
    const taskHours = values[`task_${i}`]?.[`task_hours_${i}`]?.value;
    
    if (taskName && taskHours) {
      tasks.push({
        name: taskName,
        hours: parseFloat(taskHours)
      });
    }
  }
  
  try {
    // Notion에 작업 기록 저장
    await notionService.saveTasks(userId, tasks);
    
    await client.chat.postMessage({
      channel: userId,
      text: '✅ 작업 내역이 Notion에 저장되었습니다!'
    });
  } catch (error) {
    console.error('Error saving tasks:', error);
  }
});

// 수동 입력 모달 제출
app.view('manual_entry_submission', async ({ ack, body, view, client }) => {
  await ack();
  
  const userId = body.user.id;
  const values = view.state.values;
  
  const date = values.date_block.date_picker.selected_date;
  const checkInTime = values.check_in_block.check_in_time.value;
  const checkOutTime = values.check_out_block?.check_out_time?.value;
  
  try {
    await attendanceManager.manualEntry(userId, {
      date,
      checkIn: checkInTime,
      checkOut: checkOutTime
    });
    
    await client.chat.postMessage({
      channel: userId,
      text: `✅ ${date}의 출퇴근 기록이 수동으로 입력되었습니다.`
    });
    
  } catch (error) {
    await client.chat.postMessage({
      channel: userId,
      text: `❌ 수동 입력 중 오류가 발생했습니다: ${error.message}`
    });
  }
});

// 슬래시 명령어: /attendance
app.command('/attendance', async ({ command, ack, respond }) => {
  await ack();
  
  const subcommand = command.text.trim().split(' ')[0];
  
  switch (subcommand) {
    case 'status':
      const status = await attendanceManager.getTodayStatus(command.user_id);
      await respond({
        text: `오늘의 출퇴근 상태:\n출근: ${status.checkIn || '미등록'}\n퇴근: ${status.checkOut || '미등록'}`
      });
      break;
      
    case 'month':
      const currentMonth = moment().format('YYYY-MM');
      const report = await attendanceManager.getMonthlyReport(command.user_id, currentMonth);
      await respond({
        text: slackUI.formatMonthlyReport(report)
      });
      break;
      
    case 'help':
    default:
      await respond({
        text: `*출퇴근 관리 봇 명령어*
• \`/attendance status\` - 오늘의 출퇴근 상태 확인
• \`/attendance month\` - 이번 달 근무 현황 조회
• 홈 탭에서 버튼으로 간편하게 출퇴근 기록 가능`
      });
  }
});

// 매일 오전 9시 리마인더
cron.schedule('0 9 * * 1-5', async () => {
  const users = await db.getAllUsers();
  
  for (const user of users) {
    const todayStatus = await attendanceManager.getTodayStatus(user.userId);
    
    if (!todayStatus.checkIn) {
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: user.userId,
        text: '👋 좋은 아침입니다! 출근 버튼을 눌러 오늘의 근무를 시작해주세요.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '👋 *좋은 아침입니다!*\n출근 버튼을 눌러 오늘의 근무를 시작해주세요.'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '출근하기'
                },
                style: 'primary',
                action_id: 'check_in'
              }
            ]
          }
        ]
      });
    }
  }
});

// 매일 오후 6시 퇴근 리마인더
cron.schedule('0 18 * * 1-5', async () => {
  const users = await db.getAllUsers();
  
  for (const user of users) {
    const todayStatus = await attendanceManager.getTodayStatus(user.userId);
    
    if (todayStatus.checkIn && !todayStatus.checkOut) {
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: user.userId,
        text: '🌆 퇴근 시간입니다! 오늘 하루도 수고하셨습니다.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🌆 *퇴근 시간입니다!*\n오늘 하루도 수고하셨습니다.'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '퇴근하기'
                },
                style: 'danger',
                action_id: 'check_out'
              }
            ]
          }
        ]
      });
    }
  }
});

// 앱 시작
(async () => {
  await db.initialize();
  await app.start();
  console.log('⚡️ Slack 출퇴근 관리 봇이 실행중입니다!');
})();