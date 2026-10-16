// utils.js - localStorage wrapper, image compression, Canvas charts

const DB_KEY = 'kaoyan-v2';

export const db = {
  _data: null,

  load() {
    if (this._data) return this._data;
    try {
      this._data = JSON.parse(localStorage.getItem(DB_KEY)) || {};
    } catch {
      this._data = {};
    }
    return this._data;
  },

  save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this._data));
  },

  get(key, fallback) {
    const d = this.load();
    return d[key] !== undefined ? d[key] : fallback;
  },

  set(key, value) {
    const d = this.load();
    d[key] = value;
    this.save();
  },

  remove(key) {
    const d = this.load();
    delete d[key];
    this.save();
  },

  exportAll() {
    return JSON.stringify(this.load(), null, 2);
  },

  importAll(json) {
    this._data = JSON.parse(json);
    this.save();
  },

  usageBytes() {
    return new Blob([localStorage.getItem(DB_KEY) || '']).size;
  }
};

// Image compression via Canvas
export function compressImage(file, maxWidth = 800, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Generate unique ID
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Format date
export function formatDate(d) {
  const date = new Date(d);
  const m = date.getMonth() + 1;
  const day = date.getDate();
  return `${m}月${day}日`;
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Canvas bar chart
export function drawBarChart(canvas, data, options = {}) {
  const { labels, color = '#34c759', bgColor = '#e5e5e5', max = null, height = 120 } = options;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = height;
  const padding = { top: 8, bottom: 20, left: 4, right: 4 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const barCount = data.length;
  const gap = 6;
  const barW = Math.min(24, (chartW - gap * (barCount - 1)) / barCount);
  const totalBarSpace = barW * barCount + gap * (barCount - 1);
  const offsetX = padding.left + (chartW - totalBarSpace) / 2;
  const maxVal = max || Math.max(...data, 1);

  ctx.clearRect(0, 0, w, h);

  data.forEach((val, i) => {
    const barH = (val / maxVal) * chartH;
    const x = offsetX + i * (barW + gap);
    const y = padding.top + chartH - barH;
    ctx.fillStyle = val > 0 ? color : bgColor;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 3);
    ctx.fill();

    if (labels && labels[i]) {
      ctx.fillStyle = '#86868b';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barW / 2, h - 4);
    }
  });
}

// Canvas line chart
export function drawLineChart(canvas, datasets, options = {}) {
  const { labels, colors = ['#1d1d1f', '#86868b', '#34c759', '#ff9500'], height = 160, yMin, yMax } = options;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = height;
  const padding = { top: 12, bottom: 24, left: 32, right: 12 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  let allVals = [];
  datasets.forEach(ds => allVals.push(...ds.data));
  const minV = yMin !== undefined ? yMin : Math.min(...allVals) * 0.9;
  const maxV = yMax !== undefined ? yMax : Math.max(...allVals) * 1.1;
  const range = maxV - minV || 1;

  ctx.clearRect(0, 0, w, h);

  // Y axis labels
  ctx.fillStyle = '#86868b';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = minV + (range * i / 4);
    const y = padding.top + chartH - (chartH * i / 4);
    ctx.fillText(Math.round(val), padding.left - 6, y + 3);
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
  }

  // X axis labels
  if (labels) {
    ctx.textAlign = 'center';
    labels.forEach((label, i) => {
      const x = padding.left + (chartW / (labels.length - 1 || 1)) * i;
      ctx.fillText(label, x, h - 6);
    });
  }

  // Lines
  datasets.forEach((ds, di) => {
    const color = colors[di % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ds.data.forEach((val, i) => {
      const x = padding.left + (chartW / (ds.data.length - 1 || 1)) * i;
      const y = padding.top + chartH - ((val - minV) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = color;
    ds.data.forEach((val, i) => {
      const x = padding.left + (chartW / (ds.data.length - 1 || 1)) * i;
      const y = padding.top + chartH - ((val - minV) / range) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

// Subjects config
export const SUBJECTS = [
  { id: 'guanzzong', name: '199管综' },
  { id: 'english', name: '204英语' }
];

// Error reasons
export const ERROR_REASONS = [
  { id: 'concept', name: '概念混淆' },
  { id: 'careless', name: '粗心' },
  { id: 'blind', name: '知识盲区' },
  { id: 'method', name: '方法不对' }
];
