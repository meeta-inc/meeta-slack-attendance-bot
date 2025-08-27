require('dotenv').config();
const { App } = require('@slack/bolt');
const AttendanceManager = require('./services/AttendanceManager');
const NotionService = require('./services/NotionService');
const SlackUI = require('./ui/SlackUI');
const Database = require('./database/Database');
const moment = require('moment-timezone');

// 한국 시간대 설정
moment.tz.setDefault('Asia/Seoul');

// Slack 앱 초기화
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
  logLevel: 'DEBUG'
});

console.log('App initialized with Socket Mode');

// 서비스 초기화
const db = new Database();
const notionService = new NotionService();
const attendanceManager = new AttendanceManager(db, notionService);
const slackUI = new SlackUI();

// 채널에 봇이 추가될 때 환영 메시지
app.event('member_joined_channel', async ({ event, client, logger }) => {
  try {
    if (event.user === process.env.SLACK_BOT_USER_ID) {
      await client.chat.postMessage({
        channel: event.channel,
        text: '안녕하세요! 출퇴근 관리 봇입니다. 👋\n이 채널에서 출퇴근을 기록할 수 있습니다.',
        blocks: slackUI.getWelcomeMessage()
      });
    }
  } catch (error) {
    logger.error(error);
  }
});

// 채널에 /attendance 명령어 또는 멘션 시 대화형 메시지 표시
app.event('app_mention', async ({ event, client, logger }) => {
  try {
    const userId = event.user;
    const channelId = event.channel;
    const todayStatus = await attendanceManager.getTodayStatus(userId);
    
    await client.chat.postMessage({
      channel: channelId,
      blocks: slackUI.getChannelMessage(userId, todayStatus)
    });
  } catch (error) {
    logger.error(error);
  }
});

// DM에서 메시지를 받았을 때 처리
app.message(async ({ message, client, logger }) => {
  console.log('Message received:', {
    channel: message.channel,
    channel_type: message.channel_type,
    text: message.text,
    user: message.user,
    bot_id: message.bot_id,
    subtype: message.subtype
  });
  
  try {
    // DM 채널이 아니면 무시
    if (message.channel_type !== 'im') {
      console.log('Not a DM, ignoring');
      return;
    }
    
    // 봇 자신의 메시지는 무시
    if (message.bot_id || message.subtype) {
      console.log('Bot message or subtype, ignoring');
      return;
    }
    
    const userId = message.user;
    const todayStatus = await attendanceManager.getTodayStatus(userId);
    
    console.log('DM Message Event:', {
      channel: message.channel,
      channel_type: message.channel_type,
      user: userId,
      text: message.text,
      todayStatus
    });
    
    const blocks = slackUI.getChannelMessage(userId, todayStatus);
    console.log('Generated blocks:', JSON.stringify(blocks, null, 2));
    
    // DM에서 출퇴근 관리 메뉴 표시
    const result = await client.chat.postMessage({
      channel: message.channel,
      text: '출퇴근 관리 메뉴입니다.',
      blocks: blocks
    });
    
    console.log('Message sent result:', {
      ok: result.ok,
      ts: result.ts,
      channel: result.channel,
      message: result.message
    });
  } catch (error) {
    logger.error('Error handling DM message:', error);
    console.error('DM Error details:', error);
  }
});

// 출근 버튼 클릭
app.action('check_in', async ({ body, ack, client, logger }) => {
  await ack();
  
  try {
    // 채널에서는 버튼의 value에서 userId를 가져오고, DM에서는 body.user.id 사용
    const userId = body.actions?.[0]?.value || body.user.id;
    
    // Notion에서 사용자 태스크 조회
    const tasks = await notionService.getUserTasks(userId);
    
    if (tasks.length === 0) {
      // 태스크가 없으면 바로 출근 처리
      const result = await attendanceManager.checkIn(userId);
      
      // 채널 또는 DM으로 메시지 전송
      const channel = body.channel?.id || userId;
      await client.chat.postMessage({
        channel: channel,
        text: `✅ <@${userId}>님 세션 #${result.sessionNumber} 출근 완료! (${result.time})\n\n할당된 태스크가 없어 태스크 선택을 건너뛰었습니다.`
      });
      
      // 채널 메시지 업데이트 (채널인 경우)
      if (body.channel?.id) {
        const todayStatus = await attendanceManager.getTodayStatus(userId);
        await client.chat.postMessage({
          channel: body.channel.id,
          blocks: slackUI.getChannelMessage(userId, todayStatus)
        });
      }
    } else {
      // 태스크 선택 모달 표시 (채널 ID 전달)
      await client.views.open({
        trigger_id: body.trigger_id,
        view: slackUI.getTaskSelectionModal(tasks, 'checkin', body.channel?.id)
      });
    }
    
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
    // 채널에서는 버튼의 value에서 userId를 가져오고, DM에서는 body.user.id 사용
    const userId = body.actions?.[0]?.value || body.user.id;
    
    // Notion에서 사용자 태스크 조회
    const tasks = await notionService.getUserTasks(userId);
    
    if (tasks.length === 0) {
      // 태스크가 없으면 바로 퇴근 처리
      const result = await attendanceManager.checkOut(userId);
      
      // 채널 또는 DM으로 메시지 전송
      const channel = body.channel?.id || userId;
      await client.chat.postMessage({
        channel: channel,
        text: `✅ <@${userId}>님 세션 #${result.sessionNumber} 퇴근 완료! (${result.time})\n세션 근무 시간: ${result.workHours}\n오늘 총 근무 시간: ${result.totalWorkHours}\n\n할당된 태스크가 없어 작업 기록을 건너뛰었습니다.`
      });
      
      // 채널 메시지 업데이트 (채널인 경우)
      if (body.channel?.id) {
        const todayStatus = await attendanceManager.getTodayStatus(userId);
        await client.chat.postMessage({
          channel: body.channel.id,
          blocks: slackUI.getChannelMessage(userId, todayStatus)
        });
      }
    } else {
      // 태스크 선택 모달 표시 (채널 ID 전달)
      await client.views.open({
        trigger_id: body.trigger_id,
        view: slackUI.getTaskSelectionModal(tasks, 'checkout', body.channel?.id)
      });
    }
    
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

// 출근 태스크 선택 모달 제출
app.view('task_selection_checkin', async ({ ack, body, view, client, logger }) => {
  await ack();
  
  const userId = body.user.id;
  const values = view.state.values;
  const selectedTaskIds = values.selected_tasks?.task_select?.selected_options?.map(option => option.value) || [];
  
  try {
    // 출근 처리
    const result = await attendanceManager.checkIn(userId, selectedTaskIds);
    
    let message = `✅ <@${userId}>님 출근 완료! (${result.time})`;
    if (selectedTaskIds.length > 0) {
      message += `\n선택된 태스크: ${selectedTaskIds.length}개`;
    }
    
    // 현재 채널 정보를 private_metadata에서 가져오기 (채널 사용 시 저장 필요)
    const channelId = view.private_metadata || userId;
    
    await client.chat.postMessage({
      channel: channelId,
      text: message
    });
    
    // 채널인 경우 상태 메시지 업데이트
    if (channelId !== userId) {
      const todayStatus = await attendanceManager.getTodayStatus(userId);
      await client.chat.postMessage({
        channel: channelId,
        blocks: slackUI.getChannelMessage(userId, todayStatus)
      });
    }
    
  } catch (error) {
    logger.error(error);
    await client.chat.postMessage({
      channel: userId,
      text: `❌ 출근 처리 중 오류가 발생했습니다: ${error.message}`
    });
  }
});

// 퇴근 태스크 선택 모달 제출
app.view('task_selection_checkout', async ({ ack, body, view, client, logger }) => {
  await ack();
  
  const userId = body.user.id;
  const values = view.state.values;
  const selectedTaskIds = values.selected_tasks?.task_select?.selected_options?.map(option => option.value) || [];
  
  try {
    // 퇴근 처리
    const result = await attendanceManager.checkOut(userId);
    
    // 홈 뷰 업데이트
    const todayStatus = await attendanceManager.getTodayStatus(userId);
    const homeView = slackUI.getHomeView(userId, todayStatus);
    await client.views.publish({
      user_id: userId,
      view: homeView
    });
    
    // 작업 기록 모달 표시 (선택된 태스크 ID 전달)
    // 모달을 update로 변경 (trigger_id 없이)
    await client.views.update({
      view_id: body.view.id,
      view: slackUI.getTaskModal(selectedTaskIds)
    });
    
    // 성공 메시지
    let message = `✅ 퇴근 완료! (${result.time})\n오늘 근무 시간: ${result.workHours}`;
    if (selectedTaskIds.length > 0) {
      message += `\n선택된 태스크: ${selectedTaskIds.length}개`;
    }
    
    await client.chat.postMessage({
      channel: userId,
      text: message
    });
    
  } catch (error) {
    logger.error(error);
    await client.chat.postMessage({
      channel: userId,
      text: `❌ 퇴근 처리 중 오류가 발생했습니다: ${error.message}`
    });
  }
});

// 작업 기록 모달 제출
app.view('task_submission', async ({ ack, body, view, client }) => {
  await ack();
  
  const userId = body.user.id;
  const values = view.state.values;
  
  // 모달 private_metadata에서 선택된 태스크 ID 가져오기
  const selectedTaskIds = view.private_metadata ? JSON.parse(view.private_metadata) : [];
  
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
    // Notion에 작업 기록 저장 (선택된 태스크에만 코멘트 추가)
    await notionService.saveTasks(userId, tasks, selectedTaskIds);
    
    await client.chat.postMessage({
      channel: userId,
      text: '✅ 작업 내역이 선택된 Notion 태스크에 코멘트로 저장되었습니다!'
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


// Express 서버 추가 (Health Check용)
const express = require('express');
const expressApp = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
expressApp.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    service: 'slack-attendance-bot',
    timestamp: new Date().toISOString()
  });
});

// 앱 시작
(async () => {
  await db.initialize();
  
  // Slack 앱 시작 (Socket Mode)
  await app.start();
  
  // Express 서버 시작 (Health Check용)
  expressApp.listen(PORT, () => {
    console.log(`🏥 Health check server is running on port ${PORT}`);
    console.log('⚡️ Slack 출퇴근 관리 봇이 실행중입니다!');
  });
})();