// 우리 가족 앱 공통 기능: 아이 프로필, 저장, 백업, 알림
(function () {
  // 휴대폰 앱처럼 설치·오프라인 사용 (https 또는 localhost에서만 동작)
  const ROOT = new URL('../', document.currentScript.src);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register(new URL('sw.js', ROOT)).catch(() => {}));
  }

  const KIDS_KEY = 'family.kids';
  const CUR_KEY = 'family.current';
  const PREFIXES = ['family.', 'allowance.', 'pilsa.'];

  const DEFAULT_KIDS = [
    { id: 'k1', name: '첫째', birthYear: 2011, emoji: '🦁', color: '#f59e0b' },
    { id: 'k2', name: '둘째', birthYear: 2016, emoji: '🐰', color: '#ec4899' },
    { id: 'k3', name: '셋째', birthYear: 2017, emoji: '🐻', color: '#3b82f6' },
  ];

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) {
    try { localStorage.setItem(k, v); return true; }
    catch (e) { alert('저장하지 못했어요. 저장 공간이 부족하거나 브라우저가 저장을 막고 있어요.'); return false; }
  }
  const pad = n => String(n).padStart(2, '0');

  const F = window.Family = {
    kids() {
      try {
        const v = JSON.parse(safeGet(KIDS_KEY));
        if (Array.isArray(v) && v.length) return v;
      } catch (e) {}
      return DEFAULT_KIDS.map(k => ({ ...k }));
    },
    saveKids(list) { safeSet(KIDS_KEY, JSON.stringify(list)); },
    currentId() {
      const id = safeGet(CUR_KEY);
      const ks = F.kids();
      return ks.some(k => k.id === id) ? id : ks[0].id;
    },
    current() { return F.kids().find(k => k.id === F.currentId()); },
    setCurrent(id) { safeSet(CUR_KEY, id); },

    // 한국 학년 계산 (만 6세가 되는 해의 다음 해 3월 입학 기준)
    grade(by) { return new Date().getFullYear() - by - 6; },
    gradeLabel(by) {
      const g = F.grade(by);
      if (g < 1) return '미취학';
      if (g <= 6) return '초' + g;
      if (g <= 9) return '중' + (g - 6);
      if (g <= 12) return '고' + (g - 9);
      return '성인';
    },
    // young: 초1~3, mid: 초4~6, teen: 중학생 이상
    level(by) { const g = F.grade(by); return g >= 7 ? 'teen' : g >= 4 ? 'mid' : 'young'; },

    getData(key, def) {
      try { const v = JSON.parse(safeGet(key)); return v == null ? def : v; } catch (e) { return def; }
    },
    setData(key, v) { return safeSet(key, JSON.stringify(v)); },

    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; },
    ymd(d) { d = d || new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

    renderPicker(el, onChange) {
      const cur = F.currentId();
      el.innerHTML = F.kids().map(k => `
        <button class="kid ${k.id === cur ? 'on' : ''}" style="--kc:${F.esc(k.color)}" data-id="${F.esc(k.id)}">
          <span class="kid-emoji">${F.esc(k.emoji)}</span>
          <span>${F.esc(k.name)} <small>${F.gradeLabel(k.birthYear)}</small></span>
        </button>`).join('');
      el.onclick = e => {
        const b = e.target.closest('.kid');
        if (!b || b.dataset.id === F.currentId()) return;
        F.setCurrent(b.dataset.id);
        F.renderPicker(el, onChange);
        onChange && onChange(F.current());
      };
    },

    toast(msg) {
      let t = document.querySelector('.toast');
      if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._h);
      t._h = setTimeout(() => t.classList.remove('show'), 2200);
    },

    celebrate(emojis) {
      const set = emojis || ['🎉', '⭐', '🌈', '✨', '💖', '🎈'];
      for (let i = 0; i < 24; i++) {
        const s = document.createElement('div');
        s.className = 'confetti';
        s.textContent = set[i % set.length];
        s.style.left = Math.random() * 100 + 'vw';
        s.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
        s.style.animationDelay = (Math.random() * .5) + 's';
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 4000);
      }
    },

    // 모든 기록을 JSON 파일로 내려받기
    exportAll() {
      const out = { app: 'our-family-apps', version: 1, exportedAt: new Date().toISOString(), data: {} };
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (PREFIXES.some(p => k.startsWith(p))) out.data[k] = localStorage.getItem(k);
        }
      } catch (e) { alert('기록을 읽을 수 없어요.'); return; }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `우리가족앱-백업-${F.ymd()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },

    importAll(file, done) {
      const r = new FileReader();
      r.onload = () => {
        let obj;
        try { obj = JSON.parse(r.result); } catch (e) { alert('백업 파일을 읽을 수 없어요.'); return; }
        if (!obj || obj.app !== 'our-family-apps' || typeof obj.data !== 'object') { alert('우리 가족 앱 백업 파일이 아니에요.'); return; }
        if (!confirm('지금 기록을 백업 파일 내용으로 바꿀까요?\n(지금 기록은 사라져요)')) return;
        Object.entries(obj.data).forEach(([k, v]) => {
          if (PREFIXES.some(p => k.startsWith(p)) && typeof v === 'string') safeSet(k, v);
        });
        done && done();
      };
      r.readAsText(file);
    },
  };
})();
