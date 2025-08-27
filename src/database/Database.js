const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    const dbPath = process.env.DB_PATH || './data/attendance.db';
    const dbDir = path.dirname(dbPath);
    
    // 데이터베이스 디렉토리 생성
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.db = new sqlite3.Database(dbPath);
  }

  /**
   * 데이터베이스 초기화
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // 출퇴근 세션 테이블 (여러 세션 지원)
        this.db.run(`
          CREATE TABLE IF NOT EXISTS attendance_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            date TEXT NOT NULL,
            sessionNumber INTEGER NOT NULL,
            checkIn TEXT,
            checkOut TEXT,
            workMinutes INTEGER DEFAULT 0,
            status TEXT DEFAULT 'checked_in', -- 'checked_in' or 'checked_out'
            isManual BOOLEAN DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 작업 기록 테이블
        this.db.run(`
          CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            date TEXT NOT NULL,
            taskName TEXT NOT NULL,
            hours REAL NOT NULL,
            category TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 사용자 테이블
        this.db.run(`
          CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            userName TEXT,
            department TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            lastActive DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  /**
   * 출근 기록 저장
   */
  async saveCheckIn(userId, date, time) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO attendance (userId, date, checkIn) 
         VALUES (?, ?, ?)
         ON CONFLICT(userId, date) 
         DO UPDATE SET checkIn = ?, updatedAt = CURRENT_TIMESTAMP`,
        [userId, date, time, time],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * 퇴근 기록 저장
   */
  async saveCheckOut(userId, date, time, workHours) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE attendance 
         SET checkOut = ?, workHours = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE userId = ? AND date = ?`,
        [time, workHours, userId, date],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  /**
   * 수동 입력 저장
   */
  async saveManualEntry(userId, date, checkIn, checkOut, workHours) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO attendance (userId, date, checkIn, checkOut, workHours, isManual) 
         VALUES (?, ?, ?, ?, ?, 1)`,
        [userId, date, checkIn, checkOut, workHours],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * 특정 날짜 출퇴근 기록 조회
   */
  async getAttendance(userId, date) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM attendance WHERE userId = ? AND date = ?`,
        [userId, date],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * 월별 출퇴근 기록 조회 (세션 기반)
   */
  async getMonthlyAttendance(userId, startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
           date,
           MIN(checkIn) as checkIn,
           MAX(checkOut) as checkOut,
           SUM(workMinutes) as totalMinutes
         FROM attendance_sessions 
         WHERE userId = ? AND date BETWEEN ? AND ? AND status = 'checked_out'
         GROUP BY date
         ORDER BY date ASC`,
        [userId, startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * 작업 기록 저장
   */
  async saveTask(userId, date, taskName, hours, category) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO tasks (userId, date, taskName, hours, category) 
         VALUES (?, ?, ?, ?, ?)`,
        [userId, date, taskName, hours, category],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * 특정 날짜 작업 기록 조회
   */
  async getDailyTasks(userId, date) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM tasks WHERE userId = ? AND date = ?`,
        [userId, date],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  /**
   * 월별 작업 통계 조회
   */
  async getMonthlyTaskStats(userId, startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT category, SUM(hours) as totalHours, COUNT(*) as taskCount
         FROM tasks 
         WHERE userId = ? AND date BETWEEN ? AND ?
         GROUP BY category`,
        [userId, startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  /**
   * 사용자 정보 저장/업데이트
   */
  async upsertUser(userId, userName, department) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO users (userId, userName, department) 
         VALUES (?, ?, ?)
         ON CONFLICT(userId) 
         DO UPDATE SET 
           userName = COALESCE(?, userName),
           department = COALESCE(?, department),
           lastActive = CURRENT_TIMESTAMP`,
        [userId, userName, department, userName, department],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID || this.changes);
        }
      );
    });
  }

  /**
   * 모든 활성 사용자 조회
   */
  async getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT userId, userName, department 
         FROM users 
         WHERE lastActive > datetime('now', '-30 days')
         ORDER BY lastActive DESC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  /**
   * 특정 사용자 정보 조회
   */
  async getUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM users WHERE userId = ?`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * 새로운 출근 세션 시작
   */
  async startNewSession(userId, date, time) {
    return new Promise((resolve, reject) => {
      // 오늘의 다음 세션 번호 조회
      this.db.get(
        `SELECT COALESCE(MAX(sessionNumber), 0) + 1 as nextSession 
         FROM attendance_sessions 
         WHERE userId = ? AND date = ?`,
        [userId, date],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          
          const sessionNumber = row.nextSession;
          
          // 새 세션 시작
          this.db.run(
            `INSERT INTO attendance_sessions 
             (userId, date, sessionNumber, checkIn, status) 
             VALUES (?, ?, ?, ?, 'checked_in')`,
            [userId, date, sessionNumber, time],
            function(err) {
              if (err) reject(err);
              else resolve({ sessionId: this.lastID, sessionNumber });
            }
          );
        }
      );
    });
  }

  /**
   * 현재 활성 세션 조회
   */
  async getActiveSession(userId, date) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM attendance_sessions 
         WHERE userId = ? AND date = ? AND status = 'checked_in' 
         ORDER BY sessionNumber DESC LIMIT 1`,
        [userId, date],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * 세션 퇴근 처리
   */
  async endSession(sessionId, checkOutTime, workMinutes) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE attendance_sessions 
         SET checkOut = ?, workMinutes = ?, status = 'checked_out', updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [checkOutTime, workMinutes, sessionId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  /**
   * 오늘의 모든 세션 조회
   */
  async getTodaySessions(userId, date) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM attendance_sessions 
         WHERE userId = ? AND date = ? 
         ORDER BY sessionNumber ASC`,
        [userId, date],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * 오늘의 총 근무시간 계산
   */
  async getTotalWorkMinutesToday(userId, date) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT SUM(workMinutes) as totalMinutes 
         FROM attendance_sessions 
         WHERE userId = ? AND date = ? AND status = 'checked_out'`,
        [userId, date],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.totalMinutes || 0);
        }
      );
    });
  }

  /**
   * 데이터베이스 연결 종료
   */
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = Database;