// study-log.js - 学习日志模块
import { db, uid, todayStr, formatTime, drawBarChart, SUBJECTS } from './utils.js';

const LOG_KEY = 'studyLogs';
const TIMER_KEY = 'timerState';

function getLogs() {
  return db.get(LOG_KEY, []);
}

function saveLogs(logs) {
  db.set(LOG_KEY, logs);
}

export function initStudyLog(container) {
  let timerInterval = null;
  let timerSeconds = 0;
  let timerRunning = false;
  let timerSubject = 'politics';

  // Restore timer state
  const savedTimer = db.get(TIMER_KEY, null);
  if (savedTimer && savedTimer.date === todayStr() && savedTimer.running) {
    timerSeconds = savedTimer.seconds + Math.floor((Date.now() - savedTimer.timestamp) / 1000);
    timerRunning = true;
    timerSubject = savedTimer.subject;
  } else if (savedTimer && savedTimer.date === todayStr()) {
    timerSeconds = savedTimer.seconds;
    timerSubject = savedTimer.subject;
  }

  function render() {
    const logs = getLogs();
    const today = todayStr();
    const todayLogs = logs.filter(l => l.date === today);
    const todayMinutes = todayLogs.reduce((sum, l) => sum + l.minutes, 0) + (timerRunning || timerSeconds > 0 ? Math.floor(timerSeconds / 60) : 0);

    // Week stats
    const weekStart = getWeekStart();
    const weekLogs = logs.filter(l => l.date >= weekStart);
    const weekMinutes = weekLogs.reduce((sum, l) => sum + l.minutes, 0) + Math.floor(timerSeconds / 60);

    // Daily data for chart (last 7 days)
    const dailyData = [];
    const dailyLabels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const dayLogs = logs.filter(l => l.date === ds);
      const mins = dayLogs.reduce((sum, l) => sum + l.minutes, 0);
      dailyData.push(mins / 60);
      dailyLabels.push(`${d.getMonth()+1}/${d.getDate()}`);
    }

    container.innerHTML = `
      <div class="card">
        <div class="timer-display">
          <div class="timer-time" id="timer-display">${formatTimer(timerSeconds)}</div>
          <div class="timer-subject" id="timer-subject-label">${SUBJECTS.find(s => s.id === timerSubject)?.name || '政治'}</div>
          <div class="filter-tabs" style="justify-content:center;margin:12px 0 0">
            ${SUBJECTS.map(s => `<button class="filter-tab ${timerSubject === s.id ? 'active' : ''}" data-subject="${s.id}">${s.name}</button>`).join('')}
          </div>
          <div class="timer-controls">
            <button class="timer-btn ${timerRunning ? 'timer-btn-pause' : 'timer-btn-start'}" id="timer-toggle">
              ${timerRunning ? svgPause() : svgPlay()}
            </button>
            ${timerSeconds > 0 ? `<button class="timer-btn timer-btn-stop" id="timer-stop">${svgStop()}</button>` : ''}
          </div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-item">
          <div class="stat-value">${(todayMinutes / 60).toFixed(1)}</div>
          <div class="stat-label">今日学时</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${(weekMinutes / 60).toFixed(1)}</div>
          <div class="stat-label">本周累计</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">近7天</div>
        <div class="chart-container">
          <canvas id="week-chart"></canvas>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div class="card-title" style="margin-bottom:0">手动记录</div>
        </div>
        <div style="display:flex;gap:8px">
          <select class="form-select" id="manual-subject" style="flex:1">
            ${SUBJECTS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <input class="form-input" id="manual-hours" type="number" step="0.5" min="0.5" max="12" placeholder="学时" style="width:70px;text-align:center" />
          <button class="btn btn-primary" id="manual-add" style="padding:10px 16px">添加</button>
        </div>
      </div>

      ${logs.length > 0 ? `
        <div class="card">
          <div class="card-title">最近记录</div>
          <div class="check-list">
            ${logs.slice(0, 10).map(l => {
              const subjectName = SUBJECTS.find(s => s.id === l.subject)?.name || l.subject;
              return `<div class="check-item" style="cursor:default"><span class="check-text">${l.date.slice(5)} · ${subjectName} · ${(l.minutes/60).toFixed(1)}h</span></div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Draw chart
    setTimeout(() => {
      const canvas = document.getElementById('week-chart');
      if (canvas) drawBarChart(canvas, dailyData, { labels: dailyLabels, height: 100 });
    }, 50);

    bindTimerEvents();
  }

  function bindTimerEvents() {
    // Subject switch
    container.querySelectorAll('[data-subject]').forEach(btn => {
      btn.onclick = () => {
        timerSubject = btn.dataset.subject;
        saveTimerState();
        render();
      };
    });

    // Toggle start/pause
    const toggleBtn = document.getElementById('timer-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        if (timerRunning) {
          pauseTimer();
        } else {
          startTimer();
        }
      };
    }

    // Stop
    const stopBtn = document.getElementById('timer-stop');
    if (stopBtn) {
      stopBtn.onclick = () => {
        if (timerSeconds >= 60) {
          saveTimerAsLog();
        }
        resetTimer();
        render();
      };
    }

    // Manual add
    const manualBtn = document.getElementById('manual-add');
    if (manualBtn) {
      manualBtn.onclick = () => {
        const hours = parseFloat(document.getElementById('manual-hours').value);
        if (!hours || hours <= 0) return;
        const subject = document.getElementById('manual-subject').value;
        const logs = getLogs();
        logs.unshift({
          id: uid(),
          date: todayStr(),
          subject,
          minutes: Math.round(hours * 60),
          createdAt: Date.now()
        });
        saveLogs(logs);
        render();
      };
    }
  }

  function startTimer() {
    timerRunning = true;
    saveTimerState();
    timerInterval = setInterval(() => {
      timerSeconds++;
      const display = document.getElementById('timer-display');
      if (display) display.textContent = formatTimer(timerSeconds);
      // Save state every 30s
      if (timerSeconds % 30 === 0) saveTimerState();
    }, 1000);
    render();
  }

  function pauseTimer() {
    timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    saveTimerState();
    render();
  }

  function resetTimer() {
    timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    timerSeconds = 0;
    db.remove(TIMER_KEY);
  }

  function saveTimerState() {
    db.set(TIMER_KEY, {
      date: todayStr(),
      seconds: timerSeconds,
      running: timerRunning,
      subject: timerSubject,
      timestamp: Date.now()
    });
  }

  function saveTimerAsLog() {
    const logs = getLogs();
    logs.unshift({
      id: uid(),
      date: todayStr(),
      subject: timerSubject,
      minutes: Math.floor(timerSeconds / 60),
      createdAt: Date.now()
    });
    saveLogs(logs);
  }

  function formatTimer(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function getWeekStart() {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // SVG icons
  function svgPlay() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>';
  }
  function svgPause() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  }
  function svgStop() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  }

  // Restore running timer
  if (timerRunning) {
    timerInterval = setInterval(() => {
      timerSeconds++;
      const display = document.getElementById('timer-display');
      if (display) display.textContent = formatTimer(timerSeconds);
      if (timerSeconds % 30 === 0) saveTimerState();
    }, 1000);
  }

  render();
}
