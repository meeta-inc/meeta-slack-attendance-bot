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
        // 출퇴근 테이블
        this.db.run(`
          CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            date TEXT NOT NULL,
            checkIn TEXT,
            checkOut TEXT,
            workHours TEXT,
            isManual BOOLEAN DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(userId, date)
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
   * 월별 출퇴근 기록 조회
   */
  async getMonthlyAttendance(userId, startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM attendance 
         WHERE userId = ? AND date BETWEEN ? AND ?
         ORDER BY date ASC`,
        [userId, startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
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