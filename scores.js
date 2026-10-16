// scores.js - 模考成绩追踪
import { db, uid, formatDate, drawLineChart, SUBJECTS } from './utils.js';

const SCORES_KEY = 'scores';

function getScores() {
  return db.get(SCORES_KEY, []);
}

function saveScores(scores) {
  db.set(SCORES_KEY, scores);
}

export function initScores(container) {
  function render() {
    const scores = getScores();

    if (scores.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="card-title">记录模考成绩</div>
          <div id="score-form"></div>
          <button class="btn btn-primary btn-block" id="save-score">保存成绩</button>
        </div>
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>
          <p>还没有模考记录</p>
          <p style="font-size:12px;margin-top:4px">每次模考后记录分数，查看进步趋势</p>
        </div>
      `;
      renderForm();
      return;
    }

    // Sort by date
    scores.sort((a, b) => a.date.localeCompare(b.date));

    // Stats
    const latest = scores[scores.length - 1];
    const first = scores[0];
    const latestTotal = (latest.politics || 0) + (latest.english || 0) + (latest.prof1 || 0) + (latest.prof2 || 0);
    const firstTotal = (first.politics || 0) + (first.english || 0) + (first.prof1 || 0) + (first.prof2 || 0);
    const improvement = latestTotal - firstTotal;

    // Chart data
    const labels = scores.map((s, i) => `第${i + 1}次`);
    const datasets = SUBJECTS.map(sub => ({
      label: sub.name,
      data: scores.map(s => s[sub.id] || 0)
    }));

    container.innerHTML = `
      <div class="stat-row">
        <div class="stat-item">
          <div class="stat-value">${latestTotal}</div>
          <div class="stat-label">最近总分</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" style="color:${improvement >= 0 ? 'var(--green)' : 'var(--red)'}">${improvement >= 0 ? '+' : ''}${improvement}</div>
          <div class="stat-label">较首次变化</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${scores.length}</div>
          <div class="stat-label">模考次数</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">成绩趋势</div>
        <div class="chart-container">
          <canvas id="score-chart"></canvas>
        </div>
        <div class="filter-tabs" style="margin-top:8px">
          ${SUBJECTS.map((s, i) => `<span style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:${['#1d1d1f','#86868b','#34c759','#ff9500'][i]}"></span>${s.name}</span>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">记录新成绩</div>
        <div id="score-form"></div>
        <button class="btn btn-primary btn-block" id="save-score">保存成绩</button>
      </div>

      <div class="card">
        <div class="card-title">历史记录</div>
        <div class="check-list">
          ${scores.slice().reverse().map((s, i) => {
            const total = (s.politics || 0) + (s.english || 0) + (s.prof1 || 0) + (s.prof2 || 0);
            return `
              <div class="check-item" style="cursor:default;flex-wrap:wrap">
                <span class="check-text" style="font-weight:500">${s.date} · 总分 ${total}</span>
                <span style="font-size:12px;color:var(--text-secondary)">政${s.politics || '-'} 英${s.english || '-'} 专一${s.prof1 || '-'} 专二${s.prof2 || '-'}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Draw chart
    setTimeout(() => {
      const canvas = document.getElementById('score-chart');
      if (canvas && scores.length >= 2) {
        drawLineChart(canvas, datasets, { labels, height: 160 });
      } else if (canvas) {
        const ctx = canvas.getContext('2d');
        canvas.style.height = '60px';
        canvas.height = 60;
        ctx.fillStyle = '#86868b';
        ctx.font = '13px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('需要至少2次记录才能显示趋势', canvas.width / 2, 30);
      }
    }, 50);

    renderForm();
  }

  function renderForm() {
    const formEl = document.getElementById('score-form');
    if (!formEl) return;

    formEl.innerHTML = `
      <div class="form-group">
        <label class="form-label">模考日期</label>
        <input class="form-input" id="score-date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${SUBJECTS.map(s => `
          <div style="flex:1;min-width:calc(50% - 4px)">
            <label class="form-label">${s.name}</label>
            <input class="score-input" id="score-${s.id}" type="number" min="0" max="150" placeholder="0" style="width:100%" />
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('save-score').onclick = () => {
      const date = document.getElementById('score-date').value;
      if (!date) return;

      const entry = { id: uid(), date };
      let hasAny = false;
      SUBJECTS.forEach(s => {
        const val = parseInt(document.getElementById(`score-${s.id}`).value);
        if (val > 0) { entry[s.id] = val; hasAny = true; }
      });

      if (!hasAny) {
        alert('请至少输入一科成绩');
        return;
      }

      const scores = getScores();
      scores.push(entry);
      saveScores(scores);
      render();
    };
  }

  render();
}
