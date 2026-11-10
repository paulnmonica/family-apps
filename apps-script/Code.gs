/**
 * 우리 아이들 앱 – 구글 시트 동기화 (Apps Script 웹앱)
 *
 * 설정 방법
 * 1) 구글 시트 > 확장 프로그램 > Apps Script 에 이 코드를 붙여넣기
 * 2) 프로젝트 설정(⚙️) > 스크립트 속성 > 속성 추가
 *      속성: FAMILY_CODE   값: 가족만 아는 확인 코드 (8자 이상 권장)
 * 3) 배포 > 새 배포 > 웹 앱 (실행: 나 / 액세스 권한: 모든 사용자) → /exec 주소 복사
 *
 * 시트 구성 (자동 생성)
 * - 데이터 : 앱이 쓰는 원본 (직접 고치지 마세요)
 * - 요약 / 용돈 / 필사 : 부모님이 보기 쉬운 표 (기록이 들어올 때마다 새로 만들어짐)
 *
 * 이 파일에는 비밀 값이 없어요. 확인 코드는 스크립트 속성에만 저장돼요.
 */

const DATA_SHEET = '데이터';
const CHUNK = 45000;                 // 셀 하나에 5만 자까지 들어가서 나눠 저장
const TZ = 'Asia/Seoul';
const ALLOWED_KEY = /^(family\.kids|allowance\.[\w-]{1,20}|pilsa\.[\w-]{1,20})$/;

function doGet() {
  return out({ ok: true, app: 'family-apps' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad-request' }); }

  const code = PropertiesService.getScriptProperties().getProperty('FAMILY_CODE');
  if (!code) return out({ ok: false, error: 'no-family-code' });
  if (!req || typeof req.code !== 'string' || req.code !== code) {
    Utilities.sleep(1500); // 코드 맞히기 시도를 느리게
    return out({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.action === 'ping') return out({ ok: true });
    if (req.action === 'get') return out({ ok: true, items: readItems(req.keys) });
    if (req.action === 'put') return out(putItems(req.items));
    return out({ ok: false, error: 'unknown-action' });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 원본 데이터 ----------
function dataSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(DATA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DATA_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['key', 'updatedAt', 'json (직접 고치지 마세요)']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows() {
  const sh = dataSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, Math.max(3, sh.getLastColumn())).getDisplayValues();
  return vals
    .map((r, i) => ({ row: i + 2, key: String(r[0]), t: Number(r[1]) || 0, json: r.slice(2).join('') }))
    .filter(r => r.key);
}

function readItems(keys) {
  const want = Array.isArray(keys) && keys.length ? new Set(keys) : null;
  return readRows()
    .filter(r => !want || want.has(r.key))
    .map(r => ({ key: r.key, t: r.t, value: r.json }));
}

function putItems(items) {
  if (!Array.isArray(items)) return { ok: false, error: 'bad-items' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = dataSheet();
    const byKey = {};
    readRows().forEach(r => { byKey[r.key] = r; });
    const saved = [], stale = [];

    items.forEach(it => {
      if (!it || !ALLOWED_KEY.test(it.key) || typeof it.value !== 'string') return;
      JSON.parse(it.value); // 올바른 JSON인지 확인
      const t = Number(it.t) || Date.now();
      const ex = byKey[it.key];
      if (ex && ex.t > t) { stale.push(it.key); return; } // 시트 쪽이 더 최신

      const chunks = [];
      for (let i = 0; i < it.value.length; i += CHUNK) chunks.push(it.value.slice(i, i + CHUNK));
      const row = [it.key, String(t)].concat(chunks.length ? chunks : ['']);
      if (sh.getMaxColumns() < row.length) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());

      const r = ex ? ex.row : sh.getLastRow() + 1;
      if (ex) sh.getRange(r, 1, 1, sh.getMaxColumns()).clearContent();
      const range = sh.getRange(r, 1, 1, row.length);
      range.setNumberFormat('@'); // 수식으로 해석되지 않도록 글자로 저장
      range.setValues([row]);
      byKey[it.key] = { row: r, t: t };
      saved.push(it.key);
    });

    SpreadsheetApp.flush();
    if (saved.length) buildViews();
    return { ok: true, saved: saved, stale: stale };
  } finally {
    lock.releaseLock();
  }
}

// ---------- 부모님용 보기 표 ----------
function buildViews() {
  const items = {};
  readRows().forEach(r => { try { items[r.key] = JSON.parse(r.json); } catch (e) {} });
  const kids = items['family.kids'] || [
    { id: 'k1', name: '첫째' }, { id: 'k2', name: '둘째' }, { id: 'k3', name: '셋째' },
  ];
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const ym = today.slice(0, 7);
  const TYPE = { in: '받은 돈', out: '쓴 돈', save: '저금', unsave: '저금통에서 꺼냄' };
  const MODE = { paper: '공책', trace: '화면', type: '타자' };
  const signOf = t => (t.type === 'in' || t.type === 'unsave') ? 1 : -1;

  const summary = [['아이', '지갑', '저금통', '이번 달 받은 돈', '이번 달 쓴 돈', '필사 연속(일)', '이번 달 필사(일)', '전체 필사(일)', '마지막 갱신']];
  const money = [['아이', '날짜', '구분', '분류', '금액', '메모']];
  const pilsa = [['아이', '날짜', '방법', '스티커', '문장', '출처', '느낀 점', '부모 확인']];

  kids.forEach(k => {
    const a = items['allowance.' + k.id] || {};
    const tx = (a.tx || []).slice().sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.ts || 0) - (x.ts || 0));
    let wallet = 0, mi = 0, mo = 0;
    tx.forEach(t => {
      wallet += signOf(t) * (t.amount || 0);
      if ((t.date || '').indexOf(ym) === 0) {
        if (t.type === 'in') mi += t.amount || 0;
        if (t.type === 'out') mo += t.amount || 0;
      }
      money.push([k.name, t.date || '', TYPE[t.type] || t.type, t.cat || '', signOf(t) * (t.amount || 0), t.memo || '']);
    });
    const piggy = (a.goals || []).filter(g => !g.done).reduce((s, g) => s + (g.saved || 0), 0);

    const days = (items['pilsa.' + k.id] || {}).days || {};
    const done = d => !!(days[d] && days[d].done);
    const doneKeys = Object.keys(days).filter(done).sort().reverse();
    doneKeys.forEach(d => {
      const r = days[d], s = r.sentence || {};
      pilsa.push([k.name, d, MODE[r.mode] || '', r.sticker || '', s.t || '', s.s || '', r.note || '', r.parent ? '👍' : '']);
    });
    let cur = done(today) ? today : prevDay(today), streak = 0;
    while (done(cur)) { streak++; cur = prevDay(cur); }

    summary.push([k.name, wallet, piggy, mi, mo, streak, doneKeys.filter(d => d.indexOf(ym) === 0).length, doneKeys.length,
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')]);
  });

  writeView('요약', summary, 0);
  writeView('용돈', money, 1);
  writeView('필사', pilsa, 2);
}

function prevDay(s) {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function writeView(name, rows, position) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name, position);
  sh.clearContents();
  const safe = rows.map(r => r.map(v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v));
  sh.getRange(1, 1, safe.length, safe[0].length).setValues(safe);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, safe[0].length).setFontWeight('bold').setBackground('#fff1e6');
}
