const moment = require('moment-timezone');

class AttendanceManager {
  constructor(database, notionService) {
    this.db = database;
    this.notion = notionService;
  }

  /**
   * 출근 처리 (새 세션 시작)
   */
  async checkIn(userId, selectedTaskIds = []) {
    const now = moment();
    const date = now.format('YYYY-MM-DD');
    const time = now.format('HH:mm:ss');
    
    // 이미 활성 세션이 있는지 확인
    const activeSession = await this.db.getActiveSession(userId, date);
    if (activeSession) {
      throw new Error(`이미 세션 #${activeSession.sessionNumber}이(가) 진행 중입니다. 먼저 퇴근 처리를 해주세요.`);
    }
    
    // 새 세션 시작
    const session = await this.db.startNewSession(userId, date, time);
    
    // Notion에도 동기화 (기존 방식과 호환)
    if (this.notion) {
      await this.notion.syncCheckIn(userId, date, time);
    }
    
    return {
      date,
      time,
      sessionNumber: session.sessionNumber,
      message: `세션 #${session.sessionNumber} 출근이 정상적으로 처리되었습니다.`,
      selectedTasks: selectedTaskIds.length
    };
  }

  /**
   * 퇴근 처리 (현재 세션 종료)
   */
  async checkOut(userId) {
    const now = moment();
    const date = now.format('YYYY-MM-DD');
    const time = now.format('HH:mm:ss');
    
    // 활성 세션 확인
    const activeSession = await this.db.getActiveSession(userId, date);
    if (!activeSession) {
      throw new Error('진행 중인 세션이 없습니다. 먼저 출근 처리를 해주세요.');
    }
    
    // 근무 시간 계산
    const checkInTime = moment(`${date} ${activeSession.checkIn}`);
    const checkOutTime = moment(`${date} ${time}`);
    const durationMinutes = Math.round(checkOutTime.diff(checkInTime, 'minutes'));
    const workHours = `${Math.floor(durationMinutes / 60)}시간 ${durationMinutes % 60}분`;
    
    // 세션 종료
    await this.db.endSession(activeSession.id, time, durationMinutes);
    
    // 오늘의 총 근무시간 계산
    const totalMinutes = await this.db.getTotalWorkMinutesToday(userId, date);
    const totalHours = `${Math.floor(totalMinutes / 60)}시간 ${totalMinutes % 60}분`;
    
    // Notion에도 동기화 (기존 방식과 호환)
    if (this.notion) {
      await this.notion.syncCheckOut(userId, date, time, totalHours);
    }
    
    return {
      date,
      time,
      sessionNumber: activeSession.sessionNumber,
      workHours,
      totalWorkHours: totalHours,
      message: `세션 #${activeSession.sessionNumber} 퇴근이 정상적으로 처리되었습니다.`
    };
  }

  /**
   * 수동 입력
   */
  async manualEntry(userId, data) {
    const { date, checkIn, checkOut } = data;
    
    // 날짜 유효성 검사
    if (moment(date).isAfter(moment())) {
      throw new Error('미래 날짜는 입력할 수 없습니다.');
    }
    
    // 기존 기록 확인
    const existing = await this.db.getAttendance(userId, date);
    if (existing) {
      throw new Error('해당 날짜에 이미 기록이 존재합니다.');
    }
    
    // 근무 시간 계산 (퇴근 시간이 있는 경우)
    let workHours = null;
    if (checkOut) {
      const checkInTime = moment(`${date} ${checkIn}`);
      const checkOutTime = moment(`${date} ${checkOut}`);
      
      if (checkOutTime.isBefore(checkInTime)) {
        throw new Error('퇴근 시간이 출근 시간보다 빠를 수 없습니다.');
      }
      
      const duration = moment.duration(checkOutTime.diff(checkInTime));
      workHours = `${Math.floor(duration.asHours())}시간 ${duration.minutes()}분`;
    }
    
    // 데이터베이스에 저장
    await this.db.saveManualEntry(userId, date, checkIn, checkOut, workHours);
    
    // Notion 동기화
    if (this.notion) {
      await this.notion.syncManualEntry(userId, date, checkIn, checkOut, workHours);
    }
    
    return {
      date,
      checkIn,
      checkOut,
      workHours,
      message: '수동 입력이 완료되었습니다.'
    };
  }

  /**
   * 오늘의 출퇴근 상태 조회 (세션 기반)
   */
  async getTodayStatus(userId) {
    const today = moment().format('YYYY-MM-DD');
    const sessions = await this.db.getTodaySessions(userId, today);
    const activeSession = await this.db.getActiveSession(userId, today);
    const totalMinutes = await this.db.getTotalWorkMinutesToday(userId, today);
    
    // 총 근무시간
    const totalHours = totalMinutes > 0 ? `${Math.floor(totalMinutes / 60)}시간 ${totalMinutes % 60}분` : null;
    
    // 첫 출근 시간과 마지막 퇴근 시간
    const firstSession = sessions[0];
    const lastCompletedSession = sessions.filter(s => s.status === 'checked_out').pop();
    
    return {
      date: today,
      checkIn: firstSession?.checkIn || null,
      checkOut: lastCompletedSession?.checkOut || null,
      workHours: totalHours,
      activeSession: activeSession ? {
        sessionNumber: activeSession.sessionNumber,
        checkIn: activeSession.checkIn
      } : null,
      totalSessions: sessions.length,
      completedSessions: sessions.filter(s => s.status === 'checked_out').length,
      isWeekend: moment().day() === 0 || moment().day() === 6
    };
  }

  /**
   * 월별 근무 현황 조회
   */
  async getMonthlyReport(userId, yearMonth) {
    const startDate = moment(yearMonth).startOf('month').format('YYYY-MM-DD');
    const endDate = moment(yearMonth).endOf('month').format('YYYY-MM-DD');
    
    const records = await this.db.getMonthlyAttendance(userId, startDate, endDate);
    
    // 통계 계산
    let totalWorkDays = 0;
    let totalWorkHours = 0;
    let totalWorkMinutes = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;
    let absentDays = [];
    
    // 평일 계산
    const workDays = [];
    const current = moment(startDate);
    while (current.isSameOrBefore(endDate)) {
      if (current.day() !== 0 && current.day() !== 6) { // 주말 제외
        workDays.push(current.format('YYYY-MM-DD'));
      }
      current.add(1, 'day');
    }
    
    // 기록 분석
    records.forEach(record => {
      totalWorkDays++;
      
      // 근무 시간 계산
      if (record.checkIn && record.checkOut) {
        const checkIn = moment(`${record.date} ${record.checkIn}`);
        const checkOut = moment(`${record.date} ${record.checkOut}`);
        const duration = moment.duration(checkOut.diff(checkIn));
        
        totalWorkHours += Math.floor(duration.asHours());
        totalWorkMinutes += duration.minutes();
        
        // 지각 체크 (9시 이후)
        if (checkIn.format('HH:mm') > '09:00') {
          lateCount++;
        }
        
        // 조퇴 체크 (18시 이전)
        if (checkOut.format('HH:mm') < '18:00') {
          earlyLeaveCount++;
        }
      }
    });
    
    // 결근일 계산
    const recordDates = records.map(r => r.date);
    absentDays = workDays.filter(day => 
      !recordDates.includes(day) && moment(day).isSameOrBefore(moment())
    );
    
    // 총 근무 시간 정리
    totalWorkHours += Math.floor(totalWorkMinutes / 60);
    totalWorkMinutes = totalWorkMinutes % 60;
    
    return {
      yearMonth,
      totalWorkDays,
      totalWorkHours: `${totalWorkHours}시간 ${totalWorkMinutes}분`,
      averageWorkHours: totalWorkDays > 0 
        ? `${Math.floor(totalWorkHours / totalWorkDays)}시간 ${Math.floor(totalWorkMinutes / totalWorkDays)}분`
        : '0시간',
      lateCount,
      earlyLeaveCount,
      absentCount: absentDays.length,
      absentDays,
      records
    };
  }

  /**
   * 주간 근무 현황 조회
   */
  async getWeeklyReport(userId) {
    const startOfWeek = moment().startOf('week').add(1, 'day'); // 월요일 시작
    const endOfWeek = moment().endOf('week').add(1, 'day'); // 일요일 끝
    
    const records = await this.db.getMonthlyAttendance(
      userId,
      startOfWeek.format('YYYY-MM-DD'),
      endOfWeek.format('YYYY-MM-DD')
    );
    
    return {
      startDate: startOfWeek.format('YYYY-MM-DD'),
      endDate: endOfWeek.format('YYYY-MM-DD'),
      records
    };
  }
}
module.exports = AttendanceManager;
