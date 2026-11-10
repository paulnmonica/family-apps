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
    saveKids(list) { if (safeSet(KIDS_KEY, JSON.stringify(list))) F.sync.touch(KIDS_KEY); },
    // 이 기기가 아이 기기로 설정되어 있으면 그 아이만 보여 줌
    visibleKids() {
      const ks = F.kids(), role = F.sync.role();
      const mine = ks.filter(k => k.id === role);
      return mine.length ? mine : ks;
    },
    currentId() {
      const id = safeGet(CUR_KEY);
      const ks = F.visibleKids();
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
    setData(key, v) {
      const ok = safeSet(key, JSON.stringify(v));
      if (ok) F.sync.touch(key);
      return ok;
    },

    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; },
    ymd(d) { d = d || new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

    renderPicker(el, onChange) {
      const cur = F.currentId();
      el.innerHTML = F.visibleKids().map(k => `
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
          if (PREFIXES.some(p => k.startsWith(p)) && typeof v === 'string' && safeSet(k, v)) F.sync.touch(k);
        });
        done && done();
      };
      r.readAsText(file);
    },
  };

  // ================= 구글 시트 동기화 =================
  // 구글 시트 Apps Script 웹앱 주소 (.../exec). 비어 있으면 동기화 없이 이 기기에만 저장해요.
  const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwJNkE10zEZeYAum1pkeL7V18fdyprUci4hQ3CzGQNfHBnz5iZX2wwrSolNTdNzJZe06Q/exec';

  const S_CODE = 'sync.code';   // 가족 확인 코드 (이 기기에만 보관, 백업 파일에도 안 들어감)
  const S_ROLE = 'sync.role';   // 이 기기를 쓰는 사람: 'parent' 또는 아이 id
  const S_META = 'sync.meta';   // 항목별 { t: 마지막 수정 시각, dirty: 아직 못 보냄 }
  const S_LAST = 'sync.last';
  const syncable = k => k === KIDS_KEY || k.startsWith('allowance.') || k.startsWith('pilsa.');
  const quietSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const quietDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const readMeta = () => { try { return JSON.parse(safeGet(S_META)) || {}; } catch (e) { return {}; } };
  const writeMeta = m => quietSet(S_META, JSON.stringify(m));
  const ERR = {
    'unauthorized': '가족 확인 코드가 맞지 않아요',
    'no-family-code': '구글 시트에 가족 확인 코드가 아직 설정되지 않았어요',
  };

  const S = F.sync = {
    configured() { return !!SYNC_URL; },
    code() { return safeGet(S_CODE) || ''; },
    role() { return safeGet(S_ROLE) || ''; },
    enabled() { return !!(SYNC_URL && S.code() && S.role()); },
    lastError: '',
    lastSync() { return Number(safeGet(S_LAST)) || 0; },
    pendingCount() { const m = readMeta(); return Object.keys(m).filter(k => m[k].dirty && S.canWrite(k)).length; },

    // 아이 기기는 자기 기록만, 부모 기기는 모든 기록을 올릴 수 있음
    canWrite(key) {
      const r = S.role();
      if (r === 'parent') return true;
      if (!r) return false;
      return key === 'allowance.' + r || key === 'pilsa.' + r;
    },
    myKeys() {
      const r = S.role();
      if (r === 'parent') return [KIDS_KEY, ...F.kids().flatMap(k => ['allowance.' + k.id, 'pilsa.' + k.id])];
      return r ? [KIDS_KEY, 'allowance.' + r, 'pilsa.' + r] : [];
    },

    touch(key) {
      if (!syncable(key)) return;
      const m = readMeta();
      m[key] = { t: Date.now(), dirty: true };
      writeMeta(m);
      S.flushSoon();
    },

    async call(action, extra) {
      const res = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 구글 쪽 CORS 사전 요청을 피하는 방식
        body: JSON.stringify(Object.assign({ action, code: S.code() }, extra || {})),
        redirect: 'follow',
      });
      const j = await res.json();
      if (!j.ok) { const e = new Error(ERR[j.error] || j.error || '알 수 없는 오류'); e.code = j.error; throw e; }
      return j;
    },

    flushSoon() { clearTimeout(S._t); S._t = setTimeout(S.flush, 800); },

    // 못 보낸 기록을 시트로 보냄 (실패하면 남겨 두었다가 다음에 다시)
    async flush() {
      if (!S.enabled() || S._busy) return;
      const m = readMeta();
      const keys = Object.keys(m).filter(k => m[k].dirty && S.canWrite(k));
      if (!keys.length) return S.render();
      S._busy = true;
      try {
        const items = keys.map(k => ({ key: k, t: m[k].t, value: safeGet(k) })).filter(i => i.value != null);
        const j = await S.call('put', { items });
        const m2 = readMeta();
        items.forEach(i => {
          if ((j.saved || []).includes(i.key) && m2[i.key] && m2[i.key].t === i.t) m2[i.key].dirty = false;
          if ((j.stale || []).includes(i.key)) m2[i.key] = { t: 0, dirty: false }; // 시트가 더 최신 → 시트 것을 받음
        });
        writeMeta(m2);
        quietSet(S_LAST, String(Date.now()));
        S.lastError = '';
        if ((j.stale || []).length) await S.pull(j.stale);
      } catch (e) {
        S.lastError = e.message || '연결 안 됨';
      } finally {
        S._busy = false;
        S.render();
        if (S.pendingCount() && !S.lastError) S.flushSoon(); // 보내는 동안 새로 생긴 기록
      }
    },

    // 시트에서 더 최신 기록을 받아 옴. 바뀐 항목 목록을 돌려주고 'familysync' 이벤트를 보냄
    async pull(keys) {
      if (!S.enabled()) return [];
      const changed = [];
      try {
        const j = await S.call('get', { keys: keys || S.myKeys() });
        const m = readMeta();
        (j.items || []).forEach(it => {
          if (!syncable(it.key)) return;
          const loc = m[it.key];
          if (loc && loc.dirty) return; // 이 기기에 아직 못 보낸 기록이 있으면 덮어쓰지 않음
          if (!loc || it.t > (loc.t || 0)) {
            quietSet(it.key, it.value);
            m[it.key] = { t: it.t, dirty: false };
            changed.push(it.key);
          }
        });
        writeMeta(m);
        quietSet(S_LAST, String(Date.now()));
        S.lastError = '';
      } catch (e) {
        S.lastError = e.message || '연결 안 됨';
      }
      S.render();
      if (changed.length) window.dispatchEvent(new CustomEvent('familysync', { detail: { keys: changed } }));
      return changed;
    },

    // 처음 연결: 코드 확인 → (아이 기기) 이 기기 기록 올리기 / (부모 기기) 전체 받아 오기
    async connect(code, role) {
      if (!SYNC_URL) throw new Error('구글 시트 주소가 아직 설정되지 않았어요');
      const prevCode = S.code(), prevRole = S.role();
      quietSet(S_CODE, code); quietSet(S_ROLE, role);
      try { await S.call('ping'); }
      catch (e) {
        if (prevCode) quietSet(S_CODE, prevCode); else quietDel(S_CODE);
        if (prevRole) quietSet(S_ROLE, prevRole); else quietDel(S_ROLE);
        throw e;
      }
      if (role !== 'parent') {
        const mine = ['allowance.' + role, 'pilsa.' + role];
        const server = (await S.call('get', { keys: mine })).items || [];
        const local = mine.filter(k => safeGet(k) != null);
        let useServer = server.length > 0;
        if (server.length && local.length) {
          useServer = confirm('구글 시트에 이미 이 아이의 기록이 있어요.\n\n[확인] 시트 기록을 이 기기로 가져오기\n[취소] 이 기기 기록으로 시트를 덮어쓰기');
        }
        const m = readMeta();
        if (useServer) mine.forEach(k => { m[k] = { t: 0, dirty: false }; });
        else local.forEach(k => { m[k] = { t: Date.now(), dirty: true }; });
        writeMeta(m);
      } else {
        const m = readMeta();
        S.myKeys().forEach(k => { if (m[k]) m[k].dirty = false; });
        writeMeta(m);
      }
      F.setCurrent(role === 'parent' ? (F.kids()[0] || {}).id : role);
      await S.pull();
      await S.flush();
    },

    disconnect() { quietDel(S_CODE); quietDel(S_ROLE); S.lastError = ''; S.render(); },

    // 상단의 작은 구름 표시
    render() {
      document.querySelectorAll('.sync-badge').forEach(el => {
        if (!S.enabled()) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        const n = S.pendingCount();
        if (S.lastError) { el.textContent = '⚠️ ' + (n ? n + '건 대기' : '연결 안 됨'); el.title = S.lastError; }
        else if (n) { el.textContent = '⏳ 보내는 중'; el.title = n + '건 보내는 중'; }
        else { el.textContent = '☁️ 저장됨'; el.title = '구글 시트에 저장됨'; }
      });
    },
  };

  window.addEventListener('online', () => S.flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') S.flush(); });
  document.addEventListener('DOMContentLoaded', () => { S.render(); S.flush(); });
})();
