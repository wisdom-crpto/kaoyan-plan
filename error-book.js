// error-book.js - 错题集模块
import { db, compressImage, uid, formatDate, SUBJECTS, ERROR_REASONS, github } from './utils.js';

const STORAGE_KEY = 'errors';

function getErrors() {
  return db.get(STORAGE_KEY, []);
}

function saveErrors(errors) {
  db.set(STORAGE_KEY, errors);
}

export function initErrorBook(container) {
  let currentFilter = 'all';
  let reviewMode = false;
  let reviewIndex = 0;

  function render() {
    const errors = getErrors();
    const filtered = currentFilter === 'all' ? errors : errors.filter(e => e.subject === currentFilter);
    const unmastered = filtered.filter(e => !e.mastered);

    if (reviewMode) {
      renderReview(unmastered);
      return;
    }

    let html = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-ghost" id="sync-pull" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);flex:1">从 GitHub 拉取</button>
        <button class="btn btn-ghost" id="sync-push" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);flex:1">推送到 GitHub</button>
      </div>
      <div id="sync-status" style="font-size:11px;color:var(--text-tertiary);text-align:center;margin-bottom:8px"></div>
      <div class="filter-tabs">
        <button class="filter-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
        ${SUBJECTS.map(s => `<button class="filter-tab ${currentFilter === s.id ? 'active' : ''}" data-filter="${s.id}">${s.name}</button>`).join('')}
      </div>
    `;

    if (unmastered.length === 0) {
      html += `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <p>${currentFilter === 'all' ? '还没有错题，点击下方 + 添加' : '该科目暂无错题'}</p>
        </div>
      `;
    } else {
      html += `<div class="error-list">`;
      unmastered.forEach(err => {
        const subjectName = SUBJECTS.find(s => s.id === err.subject)?.name || err.subject;
        html += `
          <div class="error-item" data-id="${err.id}">
            <div class="error-header">
              <span class="error-subject">${subjectName}</span>
              <span class="error-source">${err.source || ''}</span>
              ${err.images && err.images.length ? `<img class="error-thumb" src="${err.images[0]}" alt="">` : ''}
            </div>
            <div class="error-preview">${err.text || '（图片题）'}</div>
          </div>
        `;
      });
      html += `</div>`;

      const mastered = filtered.filter(e => e.mastered);
      if (mastered.length > 0) {
        html += `<div class="section-label" style="margin-top:16px">已掌握 (${mastered.length})</div>`;
        html += `<div class="error-list">`;
        mastered.forEach(err => {
          const subjectName = SUBJECTS.find(s => s.id === err.subject)?.name || err.subject;
          html += `
            <div class="error-item error-mastered" data-id="${err.id}">
              <div class="error-header">
                <span class="error-subject">${subjectName}</span>
                <span class="error-source">${err.source || ''}</span>
              </div>
              <div class="error-preview">${err.text || '（图片题）'}</div>
            </div>
          `;
        });
        html += `</div>`;
      }
    }

    container.innerHTML = html;
    bindEvents();
  }

  function renderReview(items) {
    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>没有待复习的错题</p>
        </div>
        <button class="btn btn-ghost btn-block" id="exit-review">返回</button>
      `;
      document.getElementById('exit-review').onclick = () => { reviewMode = false; render(); };
      return;
    }

    const err = items[reviewIndex] || items[0];
    const subjectName = SUBJECTS.find(s => s.id === err.subject)?.name || err.subject;
    const reasonName = ERROR_REASONS.find(r => r.id === err.reason)?.name || '';

    let imgHtml = '';
    if (err.images && err.images.length) {
      imgHtml = err.images.map(src => `<img class="review-image" src="${src}" alt="">`).join('');
    }

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:13px;color:var(--text-secondary)">${reviewIndex + 1} / ${items.length}</span>
        <button class="btn btn-ghost" id="exit-review" style="font-size:13px">退出</button>
      </div>
      <div class="card">
        <div class="review-card">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">${subjectName} · ${err.source || ''} ${reasonName ? '· ' + reasonName : ''}</div>
          ${imgHtml}
          ${err.text ? `<div class="review-text">${err.text}</div>` : ''}
          ${err.answer ? `<div class="review-answer">${err.answer}</div>` : ''}
        </div>
        <div class="review-controls">
          <button class="btn btn-ghost" id="review-prev">上一题</button>
          <button class="btn btn-primary" id="review-mastered" style="background:var(--green)">已掌握</button>
          <button class="btn btn-ghost" id="review-next">下一题</button>
        </div>
      </div>
    `;

    document.getElementById('exit-review').onclick = () => { reviewMode = false; reviewIndex = 0; render(); };
    document.getElementById('review-prev').onclick = () => { reviewIndex = Math.max(0, reviewIndex - 1); renderReview(items); };
    document.getElementById('review-next').onclick = () => { reviewIndex = Math.min(items.length - 1, reviewIndex + 1); renderReview(items); };
    document.getElementById('review-mastered').onclick = () => {
      const errors = getErrors();
      const idx = errors.findIndex(e => e.id === err.id);
      if (idx >= 0) { errors[idx].mastered = true; saveErrors(errors); }
      const remaining = items.filter(e => !e.mastered);
      if (remaining.length === 0 || reviewIndex >= remaining.length) { reviewIndex = 0; }
      renderReview(remaining);
    };
  }

  function bindEvents() {
    container.querySelectorAll('.filter-tab').forEach(tab => {
      tab.onclick = () => { currentFilter = tab.dataset.filter; render(); };
    });

    container.querySelectorAll('.error-item').forEach(item => {
      item.onclick = () => showDetail(item.dataset.id);
    });

    // Sync buttons
    const pullBtn = document.getElementById('sync-pull');
    const pushBtn = document.getElementById('sync-push');
    const statusEl = document.getElementById('sync-status');

    if (!github.hasToken()) {
      if (statusEl) statusEl.textContent = '需先在"我的"页面设置 GitHub Token';
    }

    if (pullBtn) {
      pullBtn.onclick = async () => {
        if (!github.hasToken()) { alert('请先在"我的"页面设置 GitHub Token'); return; }
        pullBtn.textContent = '拉取中...';
        try {
          const remote = await github.fetchErrors();
          if (remote && Array.isArray(remote)) {
            saveErrors(remote);
            if (statusEl) statusEl.textContent = `已从 GitHub 拉取 ${remote.length} 条错题`;
            render();
          } else {
            if (statusEl) statusEl.textContent = 'GitHub 上暂无错题数据';
          }
        } catch (e) {
          if (statusEl) statusEl.textContent = '拉取失败：' + e.message;
        }
        pullBtn.textContent = '从 GitHub 拉取';
      };
    }

    if (pushBtn) {
      pushBtn.onclick = async () => {
        if (!github.hasToken()) { alert('请先在"我的"页面设置 GitHub Token'); return; }
        pushBtn.textContent = '推送中...';
        try {
          const errors = getErrors();
          await github.pushErrors(errors);
          if (statusEl) statusEl.textContent = `已推送 ${errors.length} 条错题到 GitHub`;
        } catch (e) {
          if (statusEl) statusEl.textContent = '推送失败：' + e.message;
        }
        pushBtn.textContent = '推送到 GitHub';
      };
    }
  }

  function showDetail(id) {
    const errors = getErrors();
    const err = errors.find(e => e.id === id);
    if (!err) return;

    const subjectName = SUBJECTS.find(s => s.id === err.subject)?.name || err.subject;
    const reasonName = ERROR_REASONS.find(r => r.id === err.reason)?.name || '';

    let imgHtml = '';
    if (err.images && err.images.length) {
      imgHtml = err.images.map(src => `<img style="max-width:100%;border-radius:8px;margin-bottom:8px" src="${src}" alt="">`).join('');
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header">
          <span class="modal-title">错题详情</span>
          <button class="modal-close" id="close-detail">×</button>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">
          ${subjectName} ${err.source ? '· ' + err.source : ''} ${reasonName ? '· ' + reasonName : ''}
        </div>
        ${imgHtml}
        ${err.text ? `<div style="font-size:14px;line-height:1.6;margin-bottom:12px">${err.text}</div>` : ''}
        ${err.answer ? `<div class="review-answer" style="margin-bottom:12px">${err.answer}</div>` : ''}
        <div style="font-size:12px;color:var(--text-tertiary)">添加于 ${formatDate(err.createdAt)}</div>
        <div style="display:flex;gap:12px;margin-top:16px">
          ${!err.mastered ? `<button class="btn btn-primary" id="detail-master" style="background:var(--green);flex:1">标记已掌握</button>` : `<button class="btn btn-ghost" id="detail-unmaster" style="flex:1">取消已掌握</button>`}
          <button class="btn btn-danger" id="detail-delete">删除</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); } };
    document.getElementById('close-detail').onclick = () => overlay.remove();

    const masterBtn = document.getElementById('detail-master');
    if (masterBtn) {
      masterBtn.onclick = () => {
        const errors = getErrors();
        const idx = errors.findIndex(e => e.id === id);
        if (idx >= 0) { errors[idx].mastered = true; saveErrors(errors); }
        overlay.remove();
        render();
      };
    }

    const unmasterBtn = document.getElementById('detail-unmaster');
    if (unmasterBtn) {
      unmasterBtn.onclick = () => {
        const errors = getErrors();
        const idx = errors.findIndex(e => e.id === id);
        if (idx >= 0) { errors[idx].mastered = false; saveErrors(errors); }
        overlay.remove();
        render();
      };
    }

    document.getElementById('detail-delete').onclick = () => {
      if (confirm('确定删除这条错题吗？')) {
        const errors = getErrors().filter(e => e.id !== id);
        saveErrors(errors);
        overlay.remove();
        render();
      }
    };
  }

  // Public: start review mode
  container.startReview = () => { reviewMode = true; reviewIndex = 0; render(); };

  render();
}

export function showAddError(container) {
  let images = [];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <span class="modal-title">添加错题</span>
        <button class="modal-close" id="close-add">×</button>
      </div>
      <div class="form-group">
        <label class="form-label">科目</label>
        <select class="form-select" id="err-subject">
          ${SUBJECTS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">来源</label>
        <input class="form-input" id="err-source" placeholder="如：第3套、2020真题" />
      </div>
      <div class="form-group">
        <label class="form-label">题目内容</label>
        <textarea class="form-textarea" id="err-text" placeholder="输入题目或错误原因"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">拍照 / 选图</label>
        <div class="image-upload" id="err-upload">
          <div class="image-upload-text">点击拍照或选择图片</div>
        </div>
        <input type="file" accept="image/*" capture="environment" id="err-file" style="display:none" multiple />
        <div class="image-preview" id="err-preview"></div>
      </div>
      <div class="form-group">
        <label class="form-label">错误原因</label>
        <select class="form-select" id="err-reason">
          <option value="">选择原因（可选）</option>
          ${ERROR_REASONS.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">正确思路</label>
        <textarea class="form-textarea" id="err-answer" placeholder="记录正确答案或解题思路"></textarea>
      </div>
      <button class="btn btn-primary btn-block" id="err-save">保存</button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.getElementById('close-add').onclick = () => overlay.remove();

  const uploadArea = document.getElementById('err-upload');
  const fileInput = document.getElementById('err-file');
  const previewArea = document.getElementById('err-preview');

  uploadArea.onclick = () => fileInput.click();

  fileInput.onchange = async (e) => {
    for (const file of e.target.files) {
      try {
        const compressed = await compressImage(file);
        images.push(compressed);
        renderPreviews();
      } catch (err) {
        console.error('Image compress failed:', err);
      }
    }
    fileInput.value = '';
  };

  function renderPreviews() {
    previewArea.innerHTML = images.map((src, i) => `
      <div class="image-preview-item">
        <img src="${src}" alt="">
        <button class="image-preview-remove" data-idx="${i}">×</button>
      </div>
    `).join('');
    previewArea.querySelectorAll('.image-preview-remove').forEach(btn => {
      btn.onclick = () => { images.splice(parseInt(btn.dataset.idx), 1); renderPreviews(); };
    });
  }

  document.getElementById('err-save').onclick = () => {
    const text = document.getElementById('err-text').value.trim();
    if (!text && images.length === 0) {
      alert('请输入题目内容或上传图片');
      return;
    }

    const error = {
      id: uid(),
      subject: document.getElementById('err-subject').value,
      source: document.getElementById('err-source').value.trim(),
      text,
      images,
      reason: document.getElementById('err-reason').value,
      answer: document.getElementById('err-answer').value.trim(),
      mastered: false,
      createdAt: Date.now()
    };

    const errors = getErrors();
    errors.unshift(error);
    saveErrors(errors);
    overlay.remove();

    // Re-render the error book
    const page = document.getElementById('page-errors');
    if (page) {
      page.innerHTML = '';
      initErrorBook(page);
    }
  };
}
