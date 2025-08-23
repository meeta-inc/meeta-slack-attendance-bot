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
   * 출근 기록을 Notion에 동기화
   */
  async syncCheckIn(userId, date, time) {
    if (!this.notion || !this.attendanceDbId) return;
    
    try {
      // 기존 레코드 확인
      const existing = await this.findAttendanceRecord(userId, date);
      
      if (existing) {
        // 업데이트
        await this.notion.pages.update({
          page_id: existing.id,
          properties: {
            '출근시간': {
              rich_text: [{
                text: { content: time }
              }]
            },
            '상태': {
              select: { name: '근무중' }
            }
          }
        });
      } else {
        // 새로 생성
        await this.notion.pages.create({
          parent: { database_id: this.attendanceDbId },
          properties: {
            '날짜': {
              date: { start: date }
            },
            '사용자': {
              title: [{
                text: { content: userId }
              }]
            },
            '출근시간': {
              rich_text: [{
                text: { content: time }
              }]
            },
            '상태': {
              select: { name: '근무중' }
            }
          }
        });
      }
    } catch (error) {
      console.error('Notion sync error:', error);
    }
  }

  /**
   * 퇴근 기록을 Notion에 동기화
   */
  async syncCheckOut(userId, date, time, workHours) {
    if (!this.notion || !this.attendanceDbId) return;
    
    try {
      const existing = await this.findAttendanceRecord(userId, date);
      
      if (existing) {
        await this.notion.pages.update({
          page_id: existing.id,
          properties: {
            '퇴근시간': {
              rich_text: [{
                text: { content: time }
              }]
            },
            '근무시간': {
              rich_text: [{
                text: { content: workHours }
              }]
            },
            '상태': {
              select: { name: '퇴근완료' }
            }
          }
        });
      }
    } catch (error) {
      console.error('Notion sync error:', error);
    }
  }

  /**
   * 수동 입력 데이터를 Notion에 동기화
   */
  async syncManualEntry(userId, date, checkIn, checkOut, workHours) {
    if (!this.notion || !this.attendanceDbId) return;
    
    try {
      const properties = {
        '날짜': {
          date: { start: date }
        },
        '사용자': {
          title: [{
            text: { content: userId }
          }]
        },
        '출근시간': {
          rich_text: [{
            text: { content: checkIn }
          }]
        },
        '입력방식': {
          select: { name: '수동입력' }
        }
      };
      
      if (checkOut) {
        properties['퇴근시간'] = {
          rich_text: [{
            text: { content: checkOut }
          }]
        };
        properties['근무시간'] = {
          rich_text: [{
            text: { content: workHours }
          }]
        };
        properties['상태'] = {
          select: { name: '퇴근완료' }
        };
      } else {
        properties['상태'] = {
          select: { name: '근무중' }
        };
      }
      
      await this.notion.pages.create({
        parent: { database_id: this.attendanceDbId },
        properties
      });
    } catch (error) {
      console.error('Notion sync error:', error);
    }
  }

  /**
   * 작업 내역을 Notion에 저장
   */
  async saveTasks(userId, tasks) {
    if (!this.notion || !this.taskDbId) return;
    
    const today = moment().format('YYYY-MM-DD');
    
    try {
      for (const task of tasks) {
        await this.notion.pages.create({
          parent: { database_id: this.taskDbId },
          properties: {
            '작업명': {
              title: [{
                text: { content: task.name }
              }]
            },
            '날짜': {
              date: { start: today }
            },
            '사용자': {
              rich_text: [{
                text: { content: userId }
              }]
            },
            '소요시간': {
              number: task.hours
            },
            '카테고리': {
              select: { name: this.categorizeTask(task.name) }
            }
          }
        });
      }
    } catch (error) {
      console.error('Notion task save error:', error);
      throw error;
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
   * 특정 날짜의 출퇴근 기록 찾기
   */
  async findAttendanceRecord(userId, date) {
    if (!this.notion || !this.attendanceDbId) return null;
    
    try {
      const response = await this.notion.databases.query({
        database_id: this.attendanceDbId,
        filter: {
          and: [
            {
              property: '사용자',
              title: {
                contains: userId
              }
            },
            {
              property: '날짜',
              date: {
                equals: date
              }
            }
          ]
        }
      });
      
      return response.results[0] || null;
    } catch (error) {
      console.error('Notion query error:', error);
      return null;
    }
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