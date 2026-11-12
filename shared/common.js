// 우리 아이들 앱 공통 기능: 아이 프로필, 저장, 백업, 알림, 설정 화면
// 용돈기입장과 필사 달력은 따로 설치되는 앱이에요. 각 앱은 <html data-app="allowance|pilsa">로 자기를 알려 줘요.
(function () {
  const APP = document.documentElement.dataset.app;

  // 휴대폰 앱처럼 설치·오프라인 사용 (https 또는 localhost에서만 동작)
  const ROOT = new URL('../', document.currentScript.src);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(new URL('sw.js', location.href)).catch(() => {});
      // 두 앱이 하나였던 시절의 서비스 워커(사이트 맨 위)는 정리
      navigator.serviceWorker.getRegistrations()
        .then(rs => rs.filter(r => r.scope === ROOT.href).forEach(r => r.unregister()))
        .catch(() => {});
    });
  }

  const KIDS_KEY = 'family.kids';
  const CUR_KEY = 'family.current';
  // 이 앱의 기록 + 두 앱이 함께 쓰는 아이 정보
  const PREFIXES = ['family.', APP + '.'];

  // 가족 모두의 정보는 family.kids 하나에 저장하고, 앱마다 쓰는 사람만 골라 보여 줘요.
  // 필사 달력은 온 가족이, 용돈기입장은 초등학생 두 명만 써요. (기존 기록이 맞게 이어지도록 id는 그대로)
  // 아이콘은 각자의 띠
  const DEFAULT_KIDS = [
    { id: 'p1', name: '아빠', birthYear: 1980, emoji: '🐲', color: '#0ea5e9' },
    { id: 'p2', name: '엄마', birthYear: 1980, emoji: '🐑', color: '#f97316' },
    { id: 'k1', name: '첫째', birthYear: 2011, emoji: '🐰', color: '#f59e0b' },
    { id: 'k2', name: '둘째', birthYear: 2016, emoji: '🐑', color: '#ec4899' },
    { id: 'k3', name: '셋째', birthYear: 2017, emoji: '🐔', color: '#3b82f6' },
  ];
  // 예전 기본 아이콘을 그대로 쓰던 사람은 띠 아이콘으로 바꿔 줌 (직접 고른 아이콘은 그대로)
  const OLD_EMOJI = { p1: '🐯', p2: '🦊', k1: '🦁', k2: '🐰', k3: '🐻' };
  const ORDER = DEFAULT_KIDS.map(k => k.id);
  const APP_MEMBERS = { allowance: ['k2', 'k3'], pilsa: ORDER };
  // 필사 달력: 각자 제안한 가족 문장 (가족 모두가 읽고, 제안한 사람만 고칠 수 있음)
  const wordsKey = id => 'pilsa.words-' + id;

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) {
    try { localStorage.setItem(k, v); return true; }
    catch (e) { alert('저장하지 못했어요. 저장 공간이 부족하거나 브라우저가 저장을 막고 있어요.'); return false; }
  }
  const pad = n => String(n).padStart(2, '0');
  const APP_NAME = { allowance: '용돈기입장', pilsa: '필사달력' };

  const F = window.Family = {
    // 가족 전체 (저장된 정보 + 아직 저장 안 된 기본 식구)
    allMembers() {
      let saved = [];
      try { const v = JSON.parse(safeGet(KIDS_KEY)); if (Array.isArray(v)) saved = v; } catch (e) {}
      return DEFAULT_KIDS.map(d => {
        const k = { ...d, ...(saved.find(s => s.id === d.id) || {}) };
        if (k.emoji === OLD_EMOJI[d.id]) k.emoji = d.emoji;
        return k;
      });
    },
    // 이 앱을 쓰는 사람만
    kids() { return F.allMembers().filter(k => (APP_MEMBERS[APP] || ORDER).includes(k.id)); },
    // 이 앱에서 고친 사람만 바꾸고 나머지 식구 정보는 그대로 둠
    saveKids(list) {
      const all = F.allMembers().map(k => list.find(n => n.id === k.id) || k);
      if (safeSet(KIDS_KEY, JSON.stringify(all))) F.sync.touch(KIDS_KEY);
    },
    isParent(id) { return /^p\d$/.test(id); },
    wordsKey,
    // 아이 기기로 설정되어 있으면 그 아이만, 아빠·엄마(관리자) 기기면 모두 보여 줌
    visibleKids() {
      const ks = F.kids(), role = F.sync.role();
      const mine = F.sync.isAdmin() ? [] : ks.filter(k => k.id === role);
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
      // 한 사람의 기기로 설정하면 고를 사람이 한 명뿐이라 줄 자체를 숨김 (부모님 기기에서는 모두 보임)
      el.classList.toggle('hidden', F.visibleKids().length < 2);
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
      a.download = `${APP_NAME[APP] || '우리아이들앱'}-백업-${F.ymd()}.json`;
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
  const S_ROLE = 'sync.role';   // 이 기기를 쓰는 사람의 id (아빠·엄마는 관리자). 예전 'parent'도 관리자
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
    isAdmin(r) { r = r === undefined ? S.role() : r; return r === 'parent' || F.isParent(r); },
    enabled() { return !!(SYNC_URL && S.code() && S.role()); },
    lastError: '',
    lastSync() { return Number(safeGet(S_LAST)) || 0; },
    pendingCount() { const m = readMeta(); return Object.keys(m).filter(k => m[k].dirty && S.canWrite(k)).length; },

    // 개인 기기는 자기 기록(과 자기가 제안한 가족 문장)만, 부모 기기는 가족 정보와 모두의 기록을 올릴 수 있음 (이 앱의 기록만)
    canWrite(key) {
      const r = S.role();
      if (S.isAdmin(r)) return key === KIDS_KEY || key.startsWith(APP + '.');
      if (!r) return false;
      return S.ownKeys(r).includes(key);
    },
    ownKeys(id) { return APP === 'pilsa' ? [APP + '.' + id, wordsKey(id)] : [APP + '.' + id]; },
    // 가족 문장은 누구나 읽음
    sharedKeys() { return APP === 'pilsa' ? F.kids().map(k => wordsKey(k.id)) : []; },
    myKeys() {
      const r = S.role();
      if (S.isAdmin(r)) return [KIDS_KEY, ...F.kids().map(k => APP + '.' + k.id), ...S.sharedKeys()];
      return r ? [...new Set([KIDS_KEY, APP + '.' + r, ...S.sharedKeys()])] : [];
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
      if (!S.isAdmin(role)) {
        const mine = S.ownKeys(role);
        const server = (await S.call('get', { keys: mine })).items || [];
        const local = mine.filter(k => safeGet(k) != null);
        let useServer = server.length > 0;
        if (server.length && local.length) {
          useServer = confirm('구글 시트에 이미 이 사람의 기록이 있어요.\n\n[확인] 시트 기록을 이 기기로 가져오기\n[취소] 이 기기 기록으로 시트를 덮어쓰기');
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
      // 아빠·엄마 기기는 처음에 자기 자신이 골라져 있게 (용돈기입장처럼 본인이 없는 앱은 첫 아이)
      F.setCurrent(F.kids().some(k => k.id === role) ? role : (F.kids()[0] || {}).id);
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

  // ================= 설정 화면 (기기 연결 · 아이 정보 · 백업) =================
  // 두 앱이 똑같이 씀. 아이 기기나 연결이 바뀌면 onChange()로 앱 화면을 다시 그리게 해요.
  F.mountSettings = (el, onChange) => {
    const esc = F.esc;
    const family = APP === 'pilsa'; // 필사 달력은 온 가족, 용돈기입장은 아이들
    el.innerHTML = `
      <div class="card">
        <h2>📱 이 기기 설정 (구글 시트 연결)</h2>
        <div data-set="device"></div>
      </div>
      <div class="card" data-set="kidCard">
        <h2>${family ? '👨‍👩‍👧‍👦 가족 정보' : '👧👦 아이 정보'} (부모님용)</h2>
        <p class="muted" style="margin-top:0">이름, 동물 아이콘, 태어난 해, 색깔을 바꿀 수 있어요.${family ? ' 태어난 해에 맞춰 필사 문장 난이도가 정해져요.' : ''}</p>
        <form data-set="kidForm">
          <div data-set="kids"></div>
          <button class="btn primary" type="submit" style="margin-top:6px">저장</button>
        </form>
      </div>
      <div class="card">
        <h2>💾 백업 · 복원</h2>
        <p class="muted" style="margin-top:0">기록은 이 기기(브라우저)에 저장되고, 구글 시트에 연결하면 시트에도 함께 저장돼요. 가끔 백업 파일로 내려받아 두면 더 안전해요.</p>
        <div class="row wrap-row">
          <button class="btn" type="button" data-set="export">⬇️ 백업 파일 내려받기</button>
          <button class="btn" type="button" data-set="import">⬆️ 백업 파일로 복원</button>
          <input type="file" data-set="file" accept=".json,application/json" class="hidden">
        </div>
      </div>`;
    const $s = n => el.querySelector(`[data-set="${n}"]`);
    const changed = () => { render(); onChange && onChange(); };

    function renderDevice() {
      const box = $s('device');
      if (!S.configured()) {
        box.innerHTML = `<p class="muted" style="margin:0">아직 구글 시트가 연결되지 않았어요. 지금은 기록이 이 기기에만 저장돼요.</p>`;
        return;
      }
      const role = S.role();
      const me = F.allMembers().find(k => k.id === role);
      const who = role === 'parent' ? '👨‍👩‍👧 부모님' : me ? me.name + (S.isAdmin(role) ? ' (관리자)' : '') : '';
      if (S.enabled()) {
        const last = S.lastSync() ? new Date(S.lastSync()).toLocaleString('ko-KR') : '아직 없음';
        box.innerHTML = `
          <p style="margin:0">이 기기는 <b>${esc(who || '')}</b> 기기로 연결되어 있어요.</p>
          <p class="muted" style="margin:4px 0 12px;font-size:14px">마지막 동기화: ${esc(last)}${S.pendingCount() ? ` · 보낼 기록 ${S.pendingCount()}건` : ''}${S.lastError ? `<br>⚠️ ${esc(S.lastError)}` : ''}</p>
          <div class="row wrap-row">
            <button class="btn" type="button" data-act="syncNow">🔄 지금 동기화</button>
            <button class="btn" type="button" data-act="disconnect" style="color:var(--muted)">연결 끊기</button>
          </div>`;
        return;
      }
      box.innerHTML = `
        <p class="muted" style="margin-top:0">기기마다 처음 한 번만 설정하면 돼요. 아이 기기는 그 아이의 기록만 보이고,
          <b>아빠·엄마 기기는 자동으로 관리자</b>가 되어 ${family ? '온 가족' : '두 아이'}의 기록을 보고 확인 도장을 찍을 수 있어요.
          ${family ? '가족 정보(이름·태어난 해)는' : '아이 정보는'} 관리자 기기로 연결한 뒤에 고칠 수 있어요.</p>
        <form data-set="connect" autocomplete="off">
          <label class="f" for="setRole">이 기기는 누가 쓰나요?</label>
          <select id="setRole" data-set="role">
            ${F.allMembers().filter(k => F.isParent(k.id) || F.kids().some(x => x.id === k.id))
              .map(k => `<option value="${esc(k.id)}">${esc(k.emoji)} ${esc(k.name)}${F.isParent(k.id) ? ' (관리자)' : ''}</option>`).join('')}
          </select>
          <label class="f" for="setCode">가족 확인 코드</label>
          <input id="setCode" data-set="code" type="password" autocomplete="off" placeholder="부모님께 물어보세요">
          <div style="margin-top:12px"><button class="btn primary big" type="submit">연결하기</button></div>
        </form>`;
    }

    function renderKids() {
      const role = S.role();
      // 시트에 올릴 수 있는 관리자 기기에서만 고칠 수 있음 (연결 전에 고친 내용은 관리자 기기로 연결할 때 시트 값으로 바뀌어서)
      $s('kidCard').classList.toggle('hidden', S.configured() ? !S.isAdmin(role) : false);
      const thisYear = new Date().getFullYear();
      const years = []; for (let y = thisYear; y >= thisYear - (family ? 80 : 20); y--) years.push(y);
      $s('kids').innerHTML = F.kids().map(k => `
        <div class="edit-grid" data-id="${esc(k.id)}">
          <input class="emo" maxlength="4" value="${esc(k.emoji)}" aria-label="아이콘">
          <input class="nm" maxlength="10" value="${esc(k.name)}" aria-label="이름">
          <select class="by" aria-label="태어난 해">${years.map(y => `<option ${y === k.birthYear ? 'selected' : ''}>${y}</option>`).join('')}</select>
          <input type="color" class="co" value="${esc(k.color)}" aria-label="색깔">
        </div>`).join('');
    }

    function render() { renderDevice(); renderKids(); S.render(); }

    el.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target.closest('[data-set]');
      if (!form) return;
      if (form.dataset.set === 'connect') {
        const code = $s('code').value.trim(), role = $s('role').value;
        if (!code) return F.toast('가족 확인 코드를 입력해 주세요');
        const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '연결하는 중…';
        try {
          await S.connect(code, role);
          F.toast('☁️ 연결됐어요!');
        } catch (err) {
          alert('연결하지 못했어요: ' + err.message);
        }
        changed();
      } else if (form.dataset.set === 'kidForm') {
        const list = [...form.querySelectorAll('.edit-grid')].map(r => ({
          id: r.dataset.id,
          emoji: r.querySelector('.emo').value.trim() || '🙂',
          name: r.querySelector('.nm').value.trim() || '아이',
          birthYear: Number(r.querySelector('.by').value),
          color: r.querySelector('.co').value,
        }));
        F.saveKids(list);
        F.toast('저장했어요!');
        changed();
      }
    });

    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-act], [data-set="export"], [data-set="import"]');
      if (!a) return;
      if (a.dataset.set === 'export') return F.exportAll();
      if (a.dataset.set === 'import') return $s('file').click();
      if (a.dataset.act === 'syncNow') {
        a.disabled = true; a.textContent = '동기화하는 중…';
        await S.flush();
        const ch = await S.pull();
        F.toast(S.lastError ? '⚠️ ' + S.lastError : ch.length ? `새 기록 ${ch.length}건을 불러왔어요` : '이미 최신 기록이에요');
        render();
      }
      if (a.dataset.act === 'disconnect') {
        if (!confirm('이 기기의 구글 시트 연결을 끊을까요?\n(이 기기에 있는 기록은 그대로 남아요)')) return;
        S.disconnect(); changed();
      }
    });

    $s('file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      F.importAll(f, () => { F.toast('복원했어요!'); changed(); });
      e.target.value = '';
    };

    window.addEventListener('familysync', render);
    render();
  };

  // ================= PC에서 휴대폰 화면 미리 보기 =================
  // PC(마우스, 넓은 화면)에서만 버튼이 생겨요. 같은 앱을 휴대폰 크기 틀 안에 띄워서 기록도 그대로 함께 써요.
  const VIEW_KEY = 'ui.mobileView'; // 이 PC에서만 기억 (구글 시트로 안 감)
  function setupViewToggle() {
    // 휴대폰 틀 안의 화면: 진짜 휴대폰처럼 스크롤 막대가 자리를 차지하지 않게
    if (window.top !== window) { document.documentElement.classList.add('in-phone'); return; }
    if (!matchMedia('(pointer: fine)').matches || window.innerWidth < 700) return; // 휴대폰·태블릿
    const btn = document.createElement('button');
    btn.className = 'view-toggle';
    btn.textContent = '📱 모바일로 보기';
    btn.onclick = () => { quietSet(VIEW_KEY, '1'); openPhone(); };
    document.body.appendChild(btn);

    function openPhone() {
      const box = document.createElement('div');
      box.className = 'phone-view';
      box.innerHTML = `
        <div class="phone-bar"><span>📱 휴대폰 화면</span><button type="button">🖥️ 데스크탑으로</button></div>
        <iframe title="휴대폰 화면" src="${F.esc(location.href)}"></iframe>`;
      // 휴대폰 틀에서 쓴 기록이 PC 화면에도 보이도록 돌아올 때 새로 읽어 옴
      box.querySelector('button').onclick = () => { quietDel(VIEW_KEY); location.reload(); };
      document.body.appendChild(box);
      document.body.classList.add('phone-open');
    }
    if (safeGet(VIEW_KEY)) openPhone();
  }

  window.addEventListener('online', () => S.flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') S.flush(); });
  document.addEventListener('DOMContentLoaded', async () => {
    setupViewToggle();
    S.render(); S.flush();
    // 부모님 기기에서는 새로 생긴 식구(아빠·엄마·첫째)와 띠 아이콘까지 담은 가족 목록을 구글 시트에도 저장.
    // 시트의 최신 가족 정보(태어난 해 등)를 먼저 받아 온 뒤에 해야 예전 값으로 덮어쓰지 않아요.
    if (S.isAdmin()) {
      await S.pull([KIDS_KEY]);
      if (S.lastError) return;
      const raw = F.getData(KIDS_KEY, null);
      if (!Array.isArray(raw) || ORDER.some(id => !raw.some(k => k.id === id))
        || raw.some(k => k.emoji === OLD_EMOJI[k.id])) F.saveKids(F.allMembers());
    }
  });
})();
