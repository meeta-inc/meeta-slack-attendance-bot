const { Client } = require('@notionhq/client');
const moment = require('moment-timezone');

class NotionService {
  constructor() {
    if (!process.env.NOTION_API_KEY) {
      console.warn('Notion API key not configured. Notion sync disabled.');
      return;
    }
    
    this.notion = new Client({
      auth: process.env.NOTION_API_KEY
    });
    
    this.attendanceDbId = process.env.NOTION_DATABASE_ID;
    this.taskDbId = process.env.NOTION_TASK_DATABASE_ID;
  }

  /**
   * 출근 기록을 Notion에 코멘트로 추가
   */
  async syncCheckIn(userId, date, time) {
    // 페이지 수정 대신 코멘트만 추가
    console.log(`출근 기록: ${userId} - ${date} ${time}`);
    // Notion 페이지 수정 기능 비활성화
  }

  /**
   * 퇴근 기록을 Notion에 코멘트로 추가
   */
  async syncCheckOut(userId, date, time, workHours) {
    // 페이지 수정 대신 코멘트만 추가
    console.log(`퇴근 기록: ${userId} - ${date} ${time} (근무시간: ${workHours})`);
    // Notion 페이지 수정 기능 비활성화
  }

  /**
   * 수동 입력 데이터를 Notion에 코멘트로 추가
   */
  async syncManualEntry(userId, date, checkIn, checkOut, workHours) {
    // 페이지 수정 대신 코멘트만 추가
    console.log(`수동 입력: ${userId} - ${date} 출근: ${checkIn} 퇴근: ${checkOut || '미입력'} (근무시간: ${workHours || '계산중'})`);
    // Notion 페이지 수정 기능 비활성화
  }

  /**
   * 오늘 작업한 태스크들에 퇴근 코멘트 추가
   */
  async saveTasks(userId, tasks) {
    if (!this.notion || !this.taskDbId) return;
    
    const today = moment().format('YYYY-MM-DD');
    const now = moment();
    const timeStr = now.format('HH:mm');
    const yearMonth = now.format('YYYY-MM');
    
    try {
      // 오늘 날짜의 작업들 조회
      const response = await this.notion.databases.query({
        database_id: this.taskDbId,
        filter: {
          property: 'Date',
          date: {
            equals: today
          }
        }
      });
      
      if (response.results.length === 0) {
        console.log('오늘 날짜의 작업이 없습니다.');
        return;
      }
      
      // 작업 시간 정보 생성
      let totalHours = 0;
      let taskDetails = [];
      
      for (const task of tasks) {
        totalHours += task.hours;
        taskDetails.push(`• ${task.name}: ${task.hours}시간`);
      }
      
      // 이번 달 누적 시간 계산
      const monthlyStats = await this.getMonthlyTaskStats(userId, yearMonth);
      const monthlyTotalHours = monthlyStats ? monthlyStats.totalHours + totalHours : totalHours;
      const workingDay = moment().diff(moment().startOf('month'), 'days') + 1;
      
      // 코멘트 내용 생성
      const commentContent = `📝 **퇴근 기록 (${timeStr})**\n` +
        `👤 작성자: ${userId}\n` +
        `📅 날짜: ${today}\n` +
        `\n⏱️ **오늘 작업 내역:**\n${taskDetails.join('\n')}\n` +
        `\n📊 **시간 통계:**\n` +
        `• 일일 작업시간: ${totalHours}시간\n` +
        `• 월 누적시간: ${monthlyTotalHours}시간\n` +
        `• 근무일수: ${workingDay}일차\n` +
        `• 일 평균: ${(monthlyTotalHours / workingDay).toFixed(1)}시간\n` +
        `\n✅ 퇴근 완료`;
      
      // 오늘 날짜의 모든 작업에 코멘트 추가
      for (const page of response.results) {
        try {
          await this.notion.comments.create({
            parent: { page_id: page.id },
            rich_text: [
              {
                type: 'text',
                text: {
                  content: commentContent
                }
              }
            ]
          });
          
          console.log(`작업 코멘트 추가 완료: ${page.id}`);
        } catch (err) {
          console.error(`코멘트 추가 실패 (${page.id}):`, err);
        }
      }
    } catch (error) {
      console.error('Notion comment save error:', error);
      // 코멘트 추가 실패해도 작업 계속 진행
    }
  }

  /**
   * 작업 카테고리 자동 분류
   */
  categorizeTask(taskName) {
    const lowerName = taskName.toLowerCase();
    
    if (lowerName.includes('회의') || lowerName.includes('미팅')) {
      return '회의';
    } else if (lowerName.includes('개발') || lowerName.includes('코딩') || lowerName.includes('구현')) {
      return '개발';
    } else if (lowerName.includes('문서') || lowerName.includes('작성') || lowerName.includes('리포트')) {
      return '문서작업';
    } else if (lowerName.includes('리뷰') || lowerName.includes('검토')) {
      return '코드리뷰';
    } else if (lowerName.includes('테스트') || lowerName.includes('QA')) {
      return '테스트';
    } else if (lowerName.includes('기획') || lowerName.includes('설계')) {
      return '기획';
    } else {
      return '기타';
    }
  }

  /**
   * 특정 날짜의 출퇴근 기록 찾기 (비활성화)
   */
  async findAttendanceRecord(userId, date) {
    // Notion 페이지 조회 비활성화 - 페이지 수정하지 않음
    return null;
  }

  /**
   * 월별 작업 통계 조회
   */
  async getMonthlyTaskStats(userId, yearMonth) {
    if (!this.notion || !this.taskDbId) return null;
    
    const startDate = moment(yearMonth).startOf('month').format('YYYY-MM-DD');
    const endDate = moment(yearMonth).endOf('month').format('YYYY-MM-DD');
    
    try {
      const response = await this.notion.databases.query({
        database_id: this.taskDbId,
        filter: {
          and: [
            {
              property: '사용자',
              rich_text: {
                contains: userId
              }
            },
            {
              property: '날짜',
              date: {
                on_or_after: startDate
              }
            },
            {
              property: '날짜',
              date: {
                on_or_before: endDate
              }
            }
          ]
        }
      });
      
      // 카테고리별 집계
      const stats = {};
      let totalHours = 0;
      
      response.results.forEach(page => {
        const category = page.properties['카테고리']?.select?.name || '기타';
        const hours = page.properties['소요시간']?.number || 0;
        
        if (!stats[category]) {
          stats[category] = 0;
        }
        stats[category] += hours;
        totalHours += hours;
      });
      
      return {
        totalHours,
        byCategory: stats,
        taskCount: response.results.length
      };
    } catch (error) {
      console.error('Notion task stats error:', error);
      return null;
    }
  }
}

module.exports = NotionService;