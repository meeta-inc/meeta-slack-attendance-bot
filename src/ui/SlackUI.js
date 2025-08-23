const moment = require('moment-timezone');

class SlackUI {
  /**
   * 홈 탭 뷰 생성
   */
  getHomeView(userId, todayStatus) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📋 출퇴근 관리'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*오늘의 날짜:* ${todayStatus.date}\n*현재 시간:* ${moment().format('HH:mm:ss')}`
        }
      }
    ];

    // 출근 상태 표시
    if (todayStatus.checkIn) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *출근 시간:* ${todayStatus.checkIn}`
        }
      });
    } else if (!todayStatus.isWeekend) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⏰ *출근 전입니다*'
        }
      });
    }

    // 퇴근 상태 표시
    if (todayStatus.checkOut) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *퇴근 시간:* ${todayStatus.checkOut}\n*근무 시간:* ${todayStatus.workHours}`
        }
      });
    } else if (todayStatus.checkIn) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '🏢 *근무 중입니다*'
        }
      });
    }

    // 주말 메시지
    if (todayStatus.isWeekend) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '🌟 *주말입니다! 편안한 휴식 되세요.*'
        }
      });
    }

    blocks.push({ type: 'divider' });

    // 액션 버튼들
    const actionElements = [];

    if (!todayStatus.checkIn && !todayStatus.isWeekend) {
      actionElements.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '출근하기',
          emoji: true
        },
        style: 'primary',
        action_id: 'check_in'
      });
    }

    if (todayStatus.checkIn && !todayStatus.checkOut && !todayStatus.isWeekend) {
      actionElements.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '퇴근하기',
          emoji: true
        },
        style: 'danger',
        action_id: 'check_out'
      });
    }

    actionElements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '수동 입력',
        emoji: true
      },
      action_id: 'manual_entry'
    });

    actionElements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '월별 현황',
        emoji: true
      },
      action_id: 'view_monthly'
    });

    if (actionElements.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actionElements
      });
    }

    return {
      type: 'home',
      blocks
    };
  }

  /**
   * 작업 기록 모달
   */
  getTaskModal() {
    return {
      type: 'modal',
      callback_id: 'task_submission',
      title: {
        type: 'plain_text',
        text: '작업 내역 기록'
      },
      submit: {
        type: 'plain_text',
        text: '저장'
      },
      close: {
        type: 'plain_text',
        text: '취소'
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*오늘 수행한 작업을 기록해주세요*\n최대 3개까지 입력 가능합니다.'
          }
        },
        {
          type: 'divider'
        },
        // 작업 1
        {
          type: 'input',
          block_id: 'task_1',
          label: {
            type: 'plain_text',
            text: '작업 1'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'task_name_1',
            placeholder: {
              type: 'plain_text',
              text: '작업명을 입력하세요'
            }
          },
          optional: false
        },
        {
          type: 'input',
          block_id: 'task_hours_1',
          label: {
            type: 'plain_text',
            text: '소요 시간 (시간)'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'task_hours_1',
            placeholder: {
              type: 'plain_text',
              text: '예: 2.5'
            }
          },
          optional: false
        },
        // 작업 2
        {
          type: 'input',
          block_id: 'task_2',
          label: {
            type: 'plain_text',
            text: '작업 2'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'task_name_2',
            placeholder: {
              type: 'plain_text',
              text: '작업명을 입력하세요'
            }
          },
          optional: true
        },
        {
          type: 'input',
          block_id: 'task_hours_2',
          label: {
            type: 'plain_text',
            text: '소요 시간 (시간)'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'task_hours_2',
            placeholder: {
              type: 'plain_text',
              text: '예: 1.5'
            }
          },
          optional: true
        },
        // 작업 3
        {
          type: 'input',
          block_id: 'task_3',
          label: {
            type: 'plain_text',
            text: '작업 3'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'task_name_3',
            placeholder: {
              type: 'plain_text',
              text: '작업명을 입력하세요'
            }
          },
          optional: true
        },
        {
          type: 'input',
          block_id: 'task_hours_3',
          label: {
            type: 'plain_text',
            text: '소요 시간 (시간)'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'task_hours_3',
            placeholder: {
              type: 'plain_text',
              text: '예: 3.0'
            }
          },
          optional: true
        }
      ]
    };
  }

  /**
   * 수동 입력 모달
   */
  getManualEntryModal() {
    return {
      type: 'modal',
      callback_id: 'manual_entry_submission',
      title: {
        type: 'plain_text',
        text: '수동 입력'
      },
      submit: {
        type: 'plain_text',
        text: '저장'
      },
      close: {
        type: 'plain_text',
        text: '취소'
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*출퇴근 시간을 수동으로 입력합니다*'
          }
        },
        {
          type: 'input',
          block_id: 'date_block',
          label: {
            type: 'plain_text',
            text: '날짜'
          },
          element: {
            type: 'datepicker',
            action_id: 'date_picker',
            initial_date: moment().format('YYYY-MM-DD'),
            placeholder: {
              type: 'plain_text',
              text: '날짜 선택'
            }
          }
        },
        {
          type: 'input',
          block_id: 'check_in_block',
          label: {
            type: 'plain_text',
            text: '출근 시간'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'check_in_time',
            placeholder: {
              type: 'plain_text',
              text: 'HH:MM (예: 09:00)'
            }
          }
        },
        {
          type: 'input',
          block_id: 'check_out_block',
          label: {
            type: 'plain_text',
            text: '퇴근 시간'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'check_out_time',
            placeholder: {
              type: 'plain_text',
              text: 'HH:MM (예: 18:00)'
            }
          },
          optional: true
        }
      ]
    };
  }

  /**
   * 월별 리포트 모달
   */
  getMonthlyReportModal(monthlyData) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 ${monthlyData.yearMonth} 근무 현황`
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*총 근무일:*\n${monthlyData.totalWorkDays}일`
          },
          {
            type: 'mrkdwn',
            text: `*총 근무시간:*\n${monthlyData.totalWorkHours}`
          },
          {
            type: 'mrkdwn',
            text: `*평균 근무시간:*\n${monthlyData.averageWorkHours}`
          },
          {
            type: 'mrkdwn',
            text: `*지각 횟수:*\n${monthlyData.lateCount}회`
          },
          {
            type: 'mrkdwn',
            text: `*조퇴 횟수:*\n${monthlyData.earlyLeaveCount}회`
          },
          {
            type: 'mrkdwn',
            text: `*결근 일수:*\n${monthlyData.absentCount}일`
          }
        ]
      }
    ];

    // 결근일 표시
    if (monthlyData.absentDays && monthlyData.absentDays.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*결근일:* ${monthlyData.absentDays.join(', ')}`
        }
      });
    }

    blocks.push({ type: 'divider' });

    // 최근 5일 기록
    const recentRecords = monthlyData.records.slice(-5).reverse();
    if (recentRecords.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*최근 5일 기록:*'
        }
      });

      recentRecords.forEach(record => {
        const checkOut = record.checkOut || '미퇴근';
        const workHours = record.workHours || '-';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• ${record.date}: ${record.checkIn} ~ ${checkOut} (${workHours})`
          }
        });
      });
    }

    return {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: '월별 근무 현황'
      },
      close: {
        type: 'plain_text',
        text: '닫기'
      },
      blocks
    };
  }

  /**
   * 월별 리포트 포맷팅 (텍스트 버전)
   */
  formatMonthlyReport(report) {
    let text = `📊 *${report.yearMonth} 근무 현황*\n\n`;
    text += `• 총 근무일: ${report.totalWorkDays}일\n`;
    text += `• 총 근무시간: ${report.totalWorkHours}\n`;
    text += `• 평균 근무시간: ${report.averageWorkHours}\n`;
    text += `• 지각: ${report.lateCount}회\n`;
    text += `• 조퇴: ${report.earlyLeaveCount}회\n`;
    text += `• 결근: ${report.absentCount}일\n`;

    if (report.absentDays && report.absentDays.length > 0) {
      text += `\n*결근일:* ${report.absentDays.join(', ')}\n`;
    }

    return text;
  }

  /**
   * 주간 리포트 포맷팅
   */
  formatWeeklyReport(report) {
    let text = `📅 *주간 근무 현황*\n`;
    text += `기간: ${report.startDate} ~ ${report.endDate}\n\n`;

    if (report.records.length === 0) {
      text += '이번 주 근무 기록이 없습니다.';
    } else {
      report.records.forEach(record => {
        const checkOut = record.checkOut || '미퇴근';
        const workHours = record.workHours || '-';
        text += `• ${record.date}: ${record.checkIn} ~ ${checkOut} (${workHours})\n`;
      });
    }

    return text;
  }
}

module.exports = SlackUI;