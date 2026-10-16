// error-book.js - 智能错题集模块
import { db, compressImage, uid, formatDate, SUBJECTS, ERROR_REASONS, github } from './utils.js';

const STORAGE_KEY = 'errors';

const QUESTION_TYPES = [
  { id: 'choice', name: '选择题', icon: 'Aa' },
  { id: 'fill', name: '填空题', icon: '___' },
  { id: 'calc', name: '计算/推导', icon: '∑' },
  { id: 'essay', name: '论述/写作', icon: '¶' }
];

const REVIEW_INTERVALS = [1, 3, 7, 15, 30]; // days

function getErrors() { return db.get(STORAGE_KEY, []); }
function saveErrors(errors) { db.set(STORAGE_KEY, errors); }

function getDueForReview(errors) {
  const now = Date.now();
  return errors.filter(e => {
    if (e.mastered) return false;
    const level = e.reviewLevel || 0;
    const interval = REVIEW_INTERVALS[Math.min(level, REVIEW_INTERVALS.length - 1)];
    const lastTime = e.lastReviewed || e.createdAt;
    return (now - lastTime) >= interval * 86400000;
  });
}

export function initErrorBook(container) {
  let currentFilter = 'all';
  let typeFilter = 'all';
  let practiceMode = false;
  let practiceItems = [];
  let practiceIndex = 0;
  let practiceAnswered = false;

  function render() {
    if (practiceMode) { renderPractice(); return; }

    const errors = getErrors();
    const dueCount = getDueForReview(errors).length;
    let filtered = errors;
    if (currentFilter !== 'all') filtered = filtered.filter(e => e.subject === currentFilter);
    if (typeFilter !== 'all') filtered = filtered.filter(e => e.qType === typeFilter);
    const unmastered = filtered.filter(e => !e.mastered);
    const mastered = filtered.filter(e => e.mastered);

    let html = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-ghost" id="sync-pull" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);flex:1">从 GitHub 拉取</button>
        <button class="btn btn-ghost" id="sync-push" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);flex:1">推送到 GitHub</button>
      </div>
      <div id="sync-status" style="font-size:11px;color:var(--text-tertiary);text-align:center;margin-bottom:8px"></div>
    `;

    if (dueCount > 0) {
      html += `
        <div class="card" style="margin-bottom:12px;cursor:pointer" id="start-practice">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--green-light);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--green)">!</div>
            <div><div style="font-size:14px;font-weight:500">${dueCount} 题待复习</div><div style="font-size:12px;color:var(--text-secondary)">点击开始练习</div></div>
          </div>
        </div>
      `;
    }

    html += `
      <div class="filter-tabs" style="margin-bottom:8px">
        <button class="filter-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
        ${SUBJECTS.map(s => `<button class="filter-tab ${currentFilter === s.id ? 'active' : ''}" data-filter="${s.id}">${s.name}</button>`).join('')}
      </div>
      <div class="filter-tabs" style="margin-bottom:12px">
        <button class="filter-tab ${typeFilter === 'all' ? 'active' : ''}" data-type-filter="all">全题型</button>
        ${QUESTION_TYPES.map(t => `<button class="filter-tab ${typeFilter === t.id ? 'active' : ''}" data-type-filter="${t.id}">${t.name}</button>`).join('')}
      </div>
    `;

    if (unmastered.length === 0) {
      html += `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg><p>${errors.length === 0 ? '还没有错题，点击下方 + 添加' : '当前筛选无结果'}</p></div>`;
    } else {
      html += `<div class="error-list">`;
      unmastered.forEach(err => {
        const sn = SUBJECTS.find(s => s.id === err.subject)?.name || err.subject;
        const tn = QUESTION_TYPES.find(t => t.id === err.qType)?.name || '';
        html += `<div class="error-item" data-id="${err.id}"><div class="error-header"><span class="error-subject">${sn}</span><span class="error-source">${err.source || ''}</span><span class="check-tag">${tn}</span>${err.images?.length ? `<img class="error-thumb" src="${err.images[0]}" alt="">` : ''}</div><div class="error-preview">${err.text || '（图片题）'}</div></div>`;
      });
      html += `</div>`;
      if (mastered.length > 0) {
        html += `<div class="section-label" style="margin-top:16px">已掌握 (${mastered.length})</div><div class="error-list">`;
        mastered.forEach(err => {
          const sn = SUBJECTS.find(s => s.id === err.subject)?.name || err.subject;
          const tn = QUESTION_TYPES.find(t => t.id === err.qType)?.name || '';
          html += `<div class="error-item error-mastered" data-id="${err.id}"><div class="error-header"><span class="error-subject">${sn}</span><span class="check-tag">${tn}</span></div><div class="error-preview">${err.text || '（图片题）'}</div></div>`;
        });
        html += `</div>`;
      }
    }

    container.innerHTML = html;
    bindEvents();
  }

  // --- Practice Mode ---
  function renderPractice() {
    if (practiceItems.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>没有待复习的题目</p></div><button class="btn btn-ghost btn-block" id="exit-practice">返回</button>`;
      document.getElementById('exit-practice').onclick = () => { practiceMode = false; render(); };
      return;
    }

    const item = practiceItems[practiceIndex];
    const tn = QUESTION_TYPES.find(t => t.id === item.qType)?.name || '';
    const sn = SUBJECTS.find(s => s.id === item.subject)?.name || '';
    practiceAnswered = false;

    let contentHtml = '';
    if (item.qType === 'choice') {
      const opts = item.options || [];
      contentHtml = `<div id="choice-options">${opts.map((o, i) => `<div class="choice-option" data-idx="${i}" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer"><div style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;flex-shrink:0">${String.fromCharCode(65+i)}</div><span style="font-size:14px;flex:1">${o.text}</span></div>`).join('')}</div><div id="choice-feedback" style="display:none;margin-top:12px"></div>`;
    } else if (item.qType === 'fill') {
      contentHtml = `<div style="margin-bottom:12px"><input class="form-input" id="fill-input" placeholder="输入你的答案" /></div><button class="btn btn-primary" id="fill-check" style="width:100%">查看答案</button><div id="fill-feedback" style="display:none;margin-top:12px"></div>`;
    } else {
      contentHtml = `<button class="btn btn-primary" id="show-answer" style="width:100%;margin-bottom:12px">显示${item.qType === 'calc' ? '解题过程' : '参考答案'}</button><div id="answer-reveal" style="display:none">${item.analysis ? `<div class="review-answer"><div style="font-size:13px;line-height:1.8;white-space:pre-wrap">${item.analysis}</div></div>` : ''}${item.correctAnswer ? `<div style="margin-top:8px;font-size:13px;color:var(--text-secondary)">答案：${item.correctAnswer}</div>` : ''}</div>`;
    }

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:13px;color:var(--text-secondary)">${practiceIndex+1} / ${practiceItems.length}</span>
        <div style="display:flex;gap:8px"><span class="check-tag">${tn}</span><span class="check-tag">${sn}</span></div>
      </div>
      <div class="card">
        ${item.images?.length ? item.images.map(src => `<img src="${src}" style="max-width:100%;border-radius:8px;margin-bottom:12px" alt="">`).join('') : ''}
        ${item.text ? `<div style="font-size:15px;line-height:1.6;margin-bottom:16px">${item.text}</div>` : ''}
        ${contentHtml}
      </div>
      <div style="display:flex;justify-content:center;gap:12px;margin-top:16px">
        <button class="btn btn-ghost" id="practice-prev" ${practiceIndex===0?'disabled style="opacity:0.3"':''}>上一题</button>
        <button class="btn btn-ghost" id="exit-practice">退出</button>
        <button class="btn btn-ghost" id="practice-next">${practiceIndex===practiceItems.length-1?'完成':'下一题'}</button>
      </div>
    `;

    document.getElementById('exit-practice').onclick = () => { practiceMode = false; render(); };
    document.getElementById('practice-prev').onclick = () => { if (practiceIndex > 0) { practiceIndex--; renderPractice(); } };
    document.getElementById('practice-next').onclick = () => {
      if (practiceIndex < practiceItems.length - 1) { practiceIndex++; renderPractice(); }
      else { practiceMode = false; render(); }
    };

    // Bind practice interactions
    if (item.qType === 'choice') {
      document.querySelectorAll('.choice-option').forEach(opt => {
        opt.onclick = () => {
          if (practiceAnswered) return;
          practiceAnswered = true;
          const idx = parseInt(opt.dataset.idx);
          const correct = idx === (item.correctAnswer || 0);
          document.querySelectorAll('.choice-option').forEach((o, i) => {
            if (i === (item.correctAnswer || 0)) { o.style.borderColor = 'var(--green)'; o.style.background = 'var(--green-light)'; }
            else if (i === idx && !correct) { o.style.borderColor = 'var(--red)'; o.style.background = '#fff5f5'; }
            o.style.cursor = 'default';
          });
          const fb = document.getElementById('choice-feedback');
          fb.style.display = 'block';
          fb.innerHTML = `<div style="font-size:13px;font-weight:500;color:${correct?'var(--green)':'var(--red)'};margin-bottom:6px">${correct?'正确':'错误，正确答案是 '+String.fromCharCode(65+(item.correctAnswer||0))}</div>${item.analysis?`<div style="font-size:13px;color:var(--text-secondary);line-height:1.6">${item.analysis}</div>`:''}`;
          markReviewed(item);
        };
      });
    } else if (item.qType === 'fill') {
      document.getElementById('fill-check').onclick = () => {
        if (practiceAnswered) return;
        practiceAnswered = true;
        const fb = document.getElementById('fill-feedback');
        fb.style.display = 'block';
        fb.innerHTML = `<div class="review-answer"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">正确答案</div><div style="font-size:14px;font-weight:500">${item.correctAnswer||'未设置'}</div></div>${item.analysis?`<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-top:8px">${item.analysis}</div>`:''}`;
        document.getElementById('fill-check').textContent = '已查看答案';
        document.getElementById('fill-check').style.opacity = '0.5';
        markReviewed(item);
      };
    } else {
      const showBtn = document.getElementById('show-answer');
      if (showBtn) showBtn.onclick = () => {
        document.getElementById('answer-reveal').style.display = 'block';
        showBtn.style.display = 'none';
        markReviewed(item);
      };
    }
  }

  function markReviewed(item) {
    const errors = getErrors();
    const idx = errors.findIndex(e => e.id === item.id);
    if (idx >= 0) {
      errors[idx].lastReviewed = Date.now();
      errors[idx].reviewLevel = Math.min((errors[idx].reviewLevel || 0) + 1, REVIEW_INTERVALS.length);
      if (errors[idx].reviewLevel >= REVIEW_INTERVALS.length) errors[idx].mastered = true;
      saveErrors(errors);
    }
  }

  function bindEvents() {
    container.querySelectorAll('[data-filter]').forEach(tab => { tab.onclick = () => { currentFilter = tab.dataset.filter; render(); }; });
    container.querySelectorAll('[data-type-filter]').forEach(tab => { tab.onclick = () => { typeFilter = tab.dataset.filter; render(); }; });
    container.querySelectorAll('.error-item').forEach(item => { item.onclick = () => showDetail(item.dataset.id); });

    const pb = document.getElementById('start-practice');
    if (pb) pb.onclick = () => { practiceItems = getDueForReview(getErrors()); practiceIndex = 0; practiceMode = true; render(); };

    const pullBtn = document.getElementById('sync-pull');
    const pushBtn = document.getElementById('sync-push');
    const statusEl = document.getElementById('sync-status');
    if (!github.hasToken() && statusEl) statusEl.textContent = '需先在"我的"页面设置 GitHub Token';
    if (pullBtn) pullBtn.onclick = async () => {
      if (!github.hasToken()) { alert('请先在"我的"页面设置 GitHub Token'); return; }
      pullBtn.textContent = '拉取中...';
      try { const r = await github.fetchErrors(); if (r?.length) { saveErrors(r); if (statusEl) statusEl.textContent = `已拉取 ${r.length} 条`; render(); } else { if (statusEl) statusEl.textContent = 'GitHub 上暂无数据'; } } catch (e) { if (statusEl) statusEl.textContent = '失败：' + e.message; }
      pullBtn.textContent = '从 GitHub 拉取';
    };
    if (pushBtn) pushBtn.onclick = async () => {
      if (!github.hasToken()) { alert('请先在"我的"页面设置 GitHub Token'); return; }
      pushBtn.textContent = '推送中...';
      try { const e = getErrors(); await github.pushErrors(e); if (statusEl) statusEl.textContent = `已推送 ${e.length} 条`; } catch (e) { if (statusEl) statusEl.textContent = '失败：' + e.message; }
      pushBtn.textContent = '推送到 GitHub';
    };
  }

  function showDetail(id) {
    const errors = getErrors();
    const err = errors.find(e => e.id === id);
    if (!err) return;
    const sn = SUBJECTS.find(s => s.id === err.subject)?.name || err.subject;
    const tn = QUESTION_TYPES.find(t => t.id === err.qType)?.name || '';
    const rn = ERROR_REASONS.find(r => r.id === err.reason)?.name || '';

    let optsHtml = '';
    if (err.qType === 'choice' && err.options) {
      optsHtml = '<div style="margin:8px 0">' + err.options.map((o,i) => `<div style="font-size:13px;padding:4px 0;${i===err.correctAnswer?'color:var(--green);font-weight:500':''}">${String.fromCharCode(65+i)}. ${o.text}</div>`).join('') + '</div>';
    }

    const ov = document.createElement('div');
    ov.className = 'modal-overlay active';
    ov.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header"><span class="modal-title">错题详情</span><button class="modal-close" id="close-detail">×</button></div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">${sn} · ${tn} ${err.source?'· '+err.source:''} ${rn?'· '+rn:''}</div>
        ${err.images?.length ? err.images.map(src => `<img style="max-width:100%;border-radius:8px;margin-bottom:8px" src="${src}" alt="">`).join('') : ''}
        ${err.text ? `<div style="font-size:14px;line-height:1.6;margin-bottom:8px">${err.text}</div>` : ''}
        ${optsHtml}
        ${err.correctAnswer ? `<div class="review-answer" style="margin-bottom:8px"><div style="font-size:12px;color:var(--text-secondary)">正确答案</div><div style="font-size:14px;font-weight:500">${err.correctAnswer}</div></div>` : ''}
        ${err.analysis ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:8px">${err.analysis}</div>` : ''}
        <div style="font-size:12px;color:var(--text-tertiary)">添加于 ${formatDate(err.createdAt)} · 复习${err.reviewLevel||0}次</div>
        <div style="display:flex;gap:12px;margin-top:16px">
          ${!err.mastered ? `<button class="btn btn-primary" id="detail-master" style="background:var(--green);flex:1">标记已掌握</button>` : `<button class="btn btn-ghost" id="detail-unmaster" style="flex:1">取消已掌握</button>`}
          <button class="btn btn-danger" id="detail-delete">删除</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    document.getElementById('close-detail').onclick = () => ov.remove();
    const mb = document.getElementById('detail-master');
    if (mb) mb.onclick = () => { const es=getErrors(); const i=es.findIndex(e=>e.id===id); if(i>=0){es[i].mastered=true;saveErrors(es);} ov.remove(); render(); };
    const ub = document.getElementById('detail-unmaster');
    if (ub) ub.onclick = () => { const es=getErrors(); const i=es.findIndex(e=>e.id===id); if(i>=0){es[i].mastered=false;es[i].reviewLevel=0;saveErrors(es);} ov.remove(); render(); };
    document.getElementById('detail-delete').onclick = () => { if(confirm('确定删除？')){saveErrors(getErrors().filter(e=>e.id!==id));ov.remove();render();} };
  }

  render();
}

// --- Add Error Form ---
export function showAddError(container) {
  let images = [];
  let selectedType = 'choice';
  let options = [{text:'',correct:false},{text:'',correct:false},{text:'',correct:false},{text:'',correct:false}];

  function buildForm() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay active';

    let typeHtml = '';
    if (selectedType === 'choice') {
      typeHtml = `<div class="form-group"><label class="form-label">选项（点击字母设为正确答案）</label>${options.map((o,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><button class="choice-correct-btn" data-idx="${i}" style="width:28px;height:28px;border-radius:50%;border:1.5px solid ${o.correct?'var(--green)':'var(--border)'};background:${o.correct?'var(--green)':'transparent'};color:${o.correct?'#fff':'var(--text)'};font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center">${String.fromCharCode(65+i)}</button><input class="form-input choice-text-input" data-idx="${i}" value="${o.text}" placeholder="选项${String.fromCharCode(65+i)}" style="flex:1" /></div>`).join('')}</div>`;
    } else if (selectedType === 'fill') {
      typeHtml = `<div class="form-group"><label class="form-label">正确答案</label><input class="form-input" id="err-correct" placeholder="填写正确答案" /></div>`;
    } else {
      typeHtml = `<div class="form-group"><label class="form-label">最终答案（可选）</label><input class="form-input" id="err-correct" placeholder="${selectedType==='calc'?'计算结果':'要点'}" /></div>`;
    }

    ov.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header"><span class="modal-title">添加错题</span><button class="modal-close" id="close-add">×</button></div>
        <div class="form-group"><label class="form-label">题型</label><div style="display:flex;gap:8px">${QUESTION_TYPES.map(t=>`<button class="filter-tab qtype-btn ${selectedType===t.id?'active':''}" data-qtype="${t.id}" style="font-size:12px">${t.name}</button>`).join('')}</div></div>
        <div class="form-group"><label class="form-label">科目</label><select class="form-select" id="err-subject">${SUBJECTS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">来源</label><input class="form-input" id="err-source" placeholder="如：第3套、2020真题" /></div>
        <div class="form-group"><label class="form-label">题目内容</label><textarea class="form-textarea" id="err-text" placeholder="输入题目"></textarea></div>
        <div class="form-group"><label class="form-label">拍照 / 选图</label><div class="image-upload" id="err-upload"><div class="image-upload-text">点击拍照或选择图片</div></div><input type="file" accept="image/*" capture="environment" id="err-file" style="display:none" multiple /><div class="image-preview" id="err-preview"></div></div>
        ${typeHtml}
        <div class="form-group"><label class="form-label">解题分析 / 思路</label><textarea class="form-textarea" id="err-analysis" placeholder="记录解题过程、关键步骤"></textarea></div>
        <div class="form-group"><label class="form-label">错误原因</label><select class="form-select" id="err-reason"><option value="">选择原因（可选）</option>${ERROR_REASONS.map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
        <button class="btn btn-primary btn-block" id="err-save">保存</button>
      </div>
    `;
    return ov;
  }

  let overlay = buildForm();
  document.body.appendChild(overlay);

  function refresh() { const p = overlay.parentNode; overlay.remove(); overlay = buildForm(); p.appendChild(overlay); bind(); }

  function bind() {
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.getElementById('close-add').onclick = () => overlay.remove();
    overlay.querySelectorAll('.qtype-btn').forEach(b => { b.onclick = () => { selectedType = b.dataset.qtype; refresh(); }; });
    overlay.querySelectorAll('.choice-correct-btn').forEach(b => { b.onclick = () => { const i=parseInt(b.dataset.idx); options.forEach((o,j)=>{o.correct=(j===i);}); refresh(); }; });
    overlay.querySelectorAll('.choice-text-input').forEach(inp => { inp.oninput = () => { options[parseInt(inp.dataset.idx)].text = inp.value; }; });

    const ua = document.getElementById('err-upload');
    const fi = document.getElementById('err-file');
    const pa = document.getElementById('err-preview');
    if (ua) {
      ua.onclick = () => fi.click();
      fi.onchange = async (e) => { for (const f of e.target.files) { try { images.push(await compressImage(f)); rp(); } catch {} } fi.value = ''; };
    }
    function rp() {
      if (!pa) return;
      pa.innerHTML = images.map((src,i) => `<div class="image-preview-item"><img src="${src}" alt=""><button class="image-preview-remove" data-idx="${i}">×</button></div>`).join('');
      pa.querySelectorAll('.image-preview-remove').forEach(b => { b.onclick = () => { images.splice(parseInt(b.dataset.idx),1); rp(); }; });
    }

    document.getElementById('err-save').onclick = () => {
      const text = document.getElementById('err-text').value.trim();
      if (!text && images.length === 0) { alert('请输入题目或上传图片'); return; }
      let correctAnswer = '';
      if (selectedType === 'choice') { const ci = options.findIndex(o=>o.correct); correctAnswer = ci >= 0 ? ci : 0; }
      else { const ci = document.getElementById('err-correct'); correctAnswer = ci ? ci.value.trim() : ''; }

      const error = {
        id: uid(), qType: selectedType,
        subject: document.getElementById('err-subject').value,
        source: document.getElementById('err-source').value.trim(),
        text, images,
        options: selectedType === 'choice' ? options.map(o=>({text:o.text})) : undefined,
        correctAnswer,
        analysis: document.getElementById('err-analysis').value.trim(),
        reason: document.getElementById('err-reason').value,
        mastered: false, reviewLevel: 0, lastReviewed: null, createdAt: Date.now()
      };
      const errors = getErrors();
      errors.unshift(error);
      saveErrors(errors);
      overlay.remove();
      const page = document.getElementById('page-errors');
      if (page) { page.innerHTML = ''; initErrorBook(page); }
    };
  }
  bind();
}
