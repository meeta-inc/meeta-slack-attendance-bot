const moment = require('moment-timezone');

class AttendanceManager {
  constructor(database, notionService) {
    this.db = database;
    this.notion = notionService;
  }

  /**
   * 출근 처리
   */
  async checkIn(userId) {
    const now = moment();
    const date = now.format('YYYY-MM-DD');
    const time = now.format('HH:mm:ss');
    
    // 이미 출근했는지 확인
    const existing = await this.db.getAttendance(userId, date);
    if (existing && existing.checkIn) {
      throw new Error('이미 출근 처리되었습니다.');
    }
    
    // 출근 기록 저장
    await this.db.saveCheckIn(userId, date, time);
    
    // Notion에도 동기화
    if (this.notion) {
      await this.notion.syncCheckIn(userId, date, time);
    }
    
    return {
      date,
      time,
      message: '출근이 정상적으로 처리되었습니다.'
    };
  }

  /**
   * 퇴근 처리
   */
  async checkOut(userId) {
    const now = moment();
    const date = now.format('YYYY-MM-DD');
    const time = now.format('HH:mm:ss');
    
    // 출근 기록 확인
    const attendance = await this.db.getAttendance(userId, date);
    if (!attendance || !attendance.checkIn) {
      throw new Error('출근 기록이 없습니다. 먼저 출근 처리를 해주세요.');
    }
    
    if (attendance.checkOut) {
      throw new Error('이미 퇴근 처리되었습니다.');
    }
    
    // 근무 시간 계산
    const checkInTime = moment(`${date} ${attendance.checkIn}`);
    const checkOutTime = moment(`${date} ${time}`);
    const duration = moment.duration(checkOutTime.diff(checkInTime));
    const workHours = `${Math.floor(duration.asHours())}시간 ${duration.minutes()}분`;
    
    // 퇴근 기록 저장
    await this.db.saveCheckOut(userId, date, time, workHours);
    
    // Notion에도 동기화
    if (this.notion) {
      await this.notion.syncCheckOut(userId, date, time, workHours);
    }
    
    return {
      date,
      time,
      workHours,
      message: '퇴근이 정상적으로 처리되었습니다.'
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
   * 오늘의 출퇴근 상태 조회
   */
  async getTodayStatus(userId) {
    const today = moment().format('YYYY-MM-DD');
    const attendance = await this.db.getAttendance(userId, today);
    
    return {
      date: today,
      checkIn: attendance?.checkIn || null,
      checkOut: attendance?.checkOut || null,
      workHours: attendance?.workHours || null,
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