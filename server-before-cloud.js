/* 武侠文字模拟器 · 服务端（零依赖） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { STORY } = require('./story.js');
const { JOBS, ARTS, MINDS, PLACES } = require('./build.js');
const { GEAR_SLOTS, GEAR_TYPES, DAILY } = require('./gear.js');
const NPC = require('./npc.js');
const B2 = require('./battle2.js');
const { LOCS, MOBS_BY_LOC, RESIDENTS, LOOT_BY_LOC, RESIDENT_LORE, RESIDENT_QUESTS } = require('./places.js');

const PORT = Number(process.env.PORT || 8900);
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data.json');
const ADMIN_KEY = process.env.GM_KEY || 'gm-7f3a91c2';

const now = () => Date.now();
const hashPass = (p, s) => crypto.createHash('sha256').update(s + '::' + p).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

let db = { players: {}, accounts: {}, log: [], guilds: {}, npcs: {}, chat: [], dm: {}, world: { notice: '', noticeAt: 0, lastEvent: null, events: [], daily: null } };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DATA, 'utf8'))); } catch (e) {}
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(DATA, JSON.stringify(db)); } catch (e) {} }, 400); };
const log = (t) => { db.log.unshift({ t: now(), text: t }); db.log = db.log.slice(0, 200); };

function newPlayer(nick) {
  return {
    token: crypto.randomBytes(9).toString('hex'),
    account: null, nick: nick || '无名侠客',
    uid: String(100000 + Math.floor(Math.random() * 900000)),
    scene: 'birth_start', ending: null,
    attrs: { hp: 120, neili: 24, wuxing: 10, fame: 0, money: 40, karma: 0 },
    items: [], flags: {}, log: [], choicesMade: 0,
    injected: null, frozen: false, notices: [],
    lastSeen: now(), created: now(),
    // 社交
    met: [], friends: [], chatAt: 0, party: null, mail: [],
    // 成长
    job: 'swordsman', artKey: 'basic_sword', mind: 'hunyuan', realmIdx: 0,
    legacy: 0, legacyBonus: 0, sectRank: 0, sectExp: 0,
    pvp: { wins: 0, losses: 0, points: 100 }, seasonPoints: 0,
    // 装备
    gear: { weapon: null, armor: null, accessory: null }, gearBag: [],
    // 生活
    hour: 6, day: 1, tasks: [], tasksDate: '', npcRel: {},
    home: { owned: false, level: 0 }, mount: null,
    sign: { last: '', streak: 0 }, firstBattleDay: '', battleWins: { day: '', n: 0 },
    exploreGold: { date: '', sum: 0 },
    // 地点与精力
    loc: 'changan', locs: ['changan', 'mangshan', 'shaolin'], pills: 0,
    vigor: 60, vigorMax: 60, vigorAt: now(),
    // 图鉴与统计
    codex: { npcs: [], scenes: [], items: [] }, codexClaimed: {},
    kills: 0, battles: 0, donate: 0, tideVote: '',
    battle: null, aftermath: null,
  };
}

function applyEff(p, eff) {
  if (!eff) return;
  const a = p.attrs;
  for (const k of ['hp', 'neili', 'wuxing', 'fame', 'money', 'karma']) {
    if (typeof eff[k] === 'number') {
      a[k] = Math.round((a[k] || 0) + eff[k]);
      if (k === 'hp') a[k] = Math.max(1, Math.min(999, a[k]));
      else a[k] = Math.max(-999, Math.min(999, a[k]));
    }
  }
  if (Array.isArray(eff.items)) for (const it of eff.items) if (!p.items.includes(it)) p.items.push(it);
  if (eff.flags) Object.assign(p.flags, eff.flags);
  if (eff.note) p.log.push(eff.note);
}

function condOk(p, cond) {
  if (!cond) return true;
  // 物品需求：cond.items = ['残帛心法','沈氏剑谱']
  if (Array.isArray(cond.items)) {
    for (const it of cond.items) if (!(p.items || []).includes(it)) return false;
  }
  // flag 需求：cond.flags = { trust_su: true }
  if (cond.flags && typeof cond.flags === 'object') {
    for (const [k, v] of Object.entries(cond.flags)) {
      if (!!(p.flags || {})[k] !== !!v) return false;
    }
  }
  // 属性阈值（负数表示 <=）
  for (const [k, v] of Object.entries(cond)) {
    if (k === 'items' || k === 'flags') continue;
    const cur = p.attrs[k] || 0;
    if (v < 0 ? cur > v : cur < v) return false;
  }
  return true;
}

function sceneView(p) {
  const sc = STORY[p.scene] || STORY.start;
  const choices = (sc.choices || []).map((c, i) => ({ i, text: c.text, ok: condOk(p, c.cond) }));
  return {
    id: p.scene, title: sc.title, art: sc.art, text: sc.text || [],
    choices: choices.filter((c) => c.ok), locked: choices.filter((c) => !c.ok),
    ending: /^结局/.test(sc.title || ''),
  };
}

function publicState(p) {
  return {
    me: { nick: p.nick, uid: p.uid, attrs: p.attrs, items: p.items, flags: p.flags },
    scene: sceneView(p), ending: p.ending || (/^结局/.test((STORY[p.scene] || {}).title || '') ? p.scene : null),
    log: p.log.slice(-14), choices: p.choicesMade,
    isGuest: !p.account,
    frozen: !!p.frozen,
    job: p.job, artKey: p.artKey, mind: p.mind,
    pvp: p.pvp || { wins: 0, losses: 0, points: 100 },
    gear: p.gear || {}, gearBag: p.gearBag || [],
    gearBonus: gearBonus(p),
    daily: dailyEvent(),
    hour: p.hour == null ? 6 : p.hour, day: p.day || 1, phase: phaseOf(p.hour == null ? 6 : p.hour),
    home: p.home || { owned: false, level: 0 }, mount: p.mount || null,
    sectRank: p.sectRank || 0, sectExp: p.sectExp || 0,
    sectRankName: ['记名弟子', '正式弟子', '执事', '长老'][p.sectRank || 0],
    codex: p.codex || { npcs: [], scenes: [], items: [] },
    festival: festivalOf(),
    origin: (p.flags || {}).family || '', growth: (p.flags || {}).growth || '',
    originName: ({ scholar:'书香门第', general:'将门之后', merchant:'商贾之家', doctor:'医家', jianghu:'江湖人家', orphan:'无父无母' })[(p.flags || {}).family] || '',
    growthName: ({ literati:'读书', martial:'练武', merchant:'经商', healer:'学医', street:'市井' })[(p.flags || {}).growth] || '',
    tasks: ensureTasks(p), npcRel: p.npcRel || {},
    guild: p.guild && db.guilds[p.guild] ? {
      id: p.guild, name: db.guilds[p.guild].name, level: db.guilds[p.guild].level,
      exp: db.guilds[p.guild].exp, notice: db.guilds[p.guild].notice,
      members: db.guilds[p.guild].members.length, founder: db.guilds[p.guild].founder,
    } : null,
    guilds: Object.values(db.guilds).map((g) => ({ id: g.id, name: g.name, level: g.level, members: g.members.length, founder: g.founder })).slice(0, 30),
    event: (db.world && db.world.lastEvent) || null,
    place: PLACES[p.scene] || '江湖',
    jobs: Object.entries(JOBS).map(([k, j]) => ({ key: k, ...j })),
    arts: unlockedArts(p), minds: unlockedMinds(p),
    allArts: Object.entries(ARTS).map(([k, a]) => ({ key: k, ...a })),
    aftermath: p.aftermath || null,
    sign: { last: (p.sign || {}).last || '', streak: (p.sign || {}).streak || 0,
      canSign: (p.sign || {}).last !== new Date().toISOString().slice(0, 10) },
    party: (function () {
      const g = db.parties && p.party && db.parties[p.party];
      if (g) return { id: g.id, leader: g.leader, members: g.members.map((uid) => {
        const m = Object.values(db.players).find((x) => x.uid === uid);
        return { uid, nick: m ? m.nick : '?', me: uid === p.uid, online: m && now() - (m.lastSeen || 0) < 5 * 60 * 1000 };
      }) };
      if (p.pendingParty) return { pending: p.pendingParty };
      return null;
    })(),
    season: (function () {
      const se = checkSeason();
      const board = Object.entries(se.points || {}).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([uid, pts], i) => { const m = Object.values(db.players).find((x) => x.uid === uid);
          return { rank: i + 1, nick: m ? m.nick : '?', points: pts }; });
      return { id: se.id, week: se.week, board, mine: se.points[p.uid] || 0,
        rewards: [300, 180, 100] };
    })(),
    codexClaimed: p.codexClaimed || {},
    mail: { unread: (p.mail || []).filter((m) => !m.read).length,
      canClaim: (p.mail || []).filter((m) => !m.claimed && (m.money || (m.items || []).length)).length,
      list: (p.mail || []).slice(0, 20).map((m) => ({ id: m.id, from: m.from, subject: m.subject,
        body: m.body, money: m.money, items: m.items, claimed: !!m.claimed, read: !!m.read, at: m.at })) },
    legacy: p.legacy || 0, legacyBonus: p.legacyBonus || 0,
    canReincarnate: realmOf(p).idx >= 9,
    sectCanChallenge: !!(p.flags || {}).sect && (p.sectRank || 0) === 3 && (p.sectExp || 0) >= 1500,
    tide: (function () { const t = ensureTide();
      return { a: t.a, b: t.b, aPts: t.aPts, bPts: t.bPts, end: t.end, mine: p.tideVote || '' }; })(),
    firstBattleToday: p.firstBattleDay === new Date().toISOString().slice(0, 10),
    realm: (function () { const r = realmOf(p); return { idx: r.idx, name: r.n, bonus: r.bonus,
      need: r.need, nextNeed: r.next ? r.next.need : null, nextName: r.next ? r.next.n : null, neili: p.attrs.neili }; })(),
    loc: p.loc || 'changan',
    locInfo: (function () { const L = LOCS[p.loc || 'changan'] || LOCS.changan;
      return { id: p.loc, name: L.name, type: L.type, desc: L.desc,
        mobs: (MOBS_BY_LOC[p.loc] || []).length > 0 }; })(),
    locs: Object.entries(LOCS).map(([id, L]) => ({ id, name: L.name, type: L.type, cost: L.cost || 0,
      desc: L.desc, here: id === (p.loc || 'changan'), unlocked: (p.locs || []).includes(id) || id === 'changan' })),
    pills: p.pills || 0,
    npcsHere: npcsAt(p.loc || 'changan').map((n) => ({ id: n.id, name: n.name, title: n.title, trait: n.trait, art: n.art || '', resident: !!n.resident,
      purpose: n.purpose, att: n.att, met: n.met || 0 })),
    vigor: (function () { syncVigor(p); return { now: p.vigor, max: p.vigorMax,
      nextMs: Math.max(0, VIGOR_MS - (now() - (p.vigorAt || now()))) }; })(),
    chapter: (function () {
      const t = ((STORY[p.scene] || {}).title || '');
      const mm = t.match(/^第([一二三四五六七八九十]+)章/);
      return mm ? ('第' + mm[1] + '章') : (/^前传/.test(t) ? '前传' : (/^结局/.test(t) ? '结局' : '序章'));
    })(),
    objective: (function () {
      const sc = p.scene || '';
      const map = [
        [/^birth_/, '前传：走完你的童年，长到十六岁'],
        [/^origin_/, '序章：交代你的来历'],
        [/^ch1_/, '第一章 · 血夜：活下来，找出仇人'],
        [/^ch2_/, '第二章 · 江湖：走一趟镖，摸清玄阴教'],
        [/^ch3_/, '第三章 · 嵩山：论剑、背叛、真相'],
        [/^ch4_/, '第四章 · 六派：把名单摊开'],
        [/^ch5_/, '第五章 · 血战：渡口、落雁村、破庙'],
        [/^ch6_/, '第六章 · 雁门：找守令营的旧账'],
        [/^ch7_/, '第七章 · 长安：查兵符，看清三派'],
        [/^ch8_/, '第八章 · 黑崖：血刀门的内乱'],
        [/^ch9_/, '第九章 · 玄阴：见你叔父'],
        [/^ch10_/, '第十章 · 漕运：无旗船上的甲'],
        [/^ch11_/, '第十一章 · 六派裂痕：让他们认'],
        [/^ch12_/, '第十二章 · 北境：让七千人进关'],
        [/^court_/, '朝堂线：把十七年前的案子翻出来'],
        [/^sect_/, '门派线：入门、学艺、试炼'],
        [/^romance_/, '感情线：和苏凝的事'],
        [/^manual_/, '秘籍线：参悟残卷'],
        [/^merchant_/, '商会线：盘下洛阳的盘口'],
        [/^daily_|^free_roam/, '自由江湖：过日子，等风起'],
      ];
      for (const [re, txt] of map) if (re.test(sc)) return txt;
      return '继续你的江湖路';
    })(),
    battle: p.battle ? {
      units: p.battle.units.map((u, i) => ({ i, side: u.side, key: u.key, name: u.name, art: u.art,
        hp: u.hp, maxHp: u.maxHp, alive: u.alive, spd: u.spd, energy: u.energy || 0 })),
      order: (p.battle.order || []).map((u) => u.name),
      round: p.battle.round, waiting: p.battle.waiting,
      combo: p.battle.combo || 0, canFlee: p.battle.canFlee !== false,
      log: (p.battle.log || []).slice(-6), result: p.battle.result || null,
    } : null,
    inject: p.injected || null,
    notice: db.world && db.world.notice ? { text: db.world.notice, at: db.world.noticeAt } : null,
    notices: (p.notices || []).slice(-5),
  };
}

function atkOf(p) {
  const j = JOBS[p.job] || JOBS.swordsman;
  const m = MINDS[p.mind] || MINDS.hunyuan;
  const g = (p.flags || {}).growth;
  const gBonus = g === 'martial' ? 1.12 : g === 'street' ? 1.05 : 1;
  const base = (8 + p.attrs.neili * 0.9 + p.attrs.wuxing * 0.4 + gearBonus(p).atk) * gBonus;
  return Math.round(base * (j.atk || 1) * (m.atk || 1));
}
function artOf(p) {
  const a = ARTS[p.artKey];
  if (a && (!a.job || a.job === p.job)) return a;
  return ARTS['basic_sword'];
}
function unlockedArts(p) {
  return Object.entries(ARTS)
    .filter(([, a]) => (!a.job || a.job === p.job) && (!a.need || p.items.includes(a.need) || p.flags[a.need]))
    .map(([k, a]) => ({ key: k, ...a }));
}
function unlockedMinds(p) {
  return Object.entries(MINDS)
    .filter(([, m]) => !m.need || p.items.includes(m.need) || p.flags[m.need])
    .map(([k, m]) => ({ key: k, ...m }));
}
function defOf(p) { return Math.round(4 + p.attrs.wuxing * 0.5 + p.attrs.neili * 0.2); }

function gearBonus(p) {
  let atk = 0, hp = 0;
  for (const slot of ['weapon', 'armor', 'accessory']) {
    const g = (p.gear || {})[slot];
    if (g) { atk += g.atk || 0; hp += g.hp || 0; }
  }
  return { atk, hp };
}
const REALMS = [
  { n:'凡体', need:0,   bonus:0 },   { n:'炼气', need:48,  bonus:4 },
  { n:'凝真', need:110, bonus:10 },  { n:'化劲', need:195, bonus:18 },
  { n:'通脉', need:300, bonus:28 },  { n:'开府', need:430, bonus:40 },
  { n:'宗师', need:600, bonus:56 },  { n:'大宗师', need:820, bonus:76 },
  { n:'返虚', need:1080, bonus:100 }, { n:'归一', need:1450, bonus:130 },
];
function realmOf(p) {
  const nei = p.attrs.neili || 0;
  let i = 0;
  for (let k = 0; k < REALMS.length; k++) if (nei >= REALMS[k].need) i = k;
  return { idx: i, ...REALMS[i], next: REALMS[i + 1] || null };
}
function checkRealm(p) {
  const r = realmOf(p);
  if (p.realmIdx == null) {
    p.realmIdx = r.idx;
    if (r.idx > 0) {
      p.notices.push('🎉 境界突破：' + r.n);
      p.log.push('【境界】突破至 ' + r.n);
      return r;
    }
    return null;
  }
  if (r.idx > p.realmIdx) {
    p.realmIdx = r.idx;
    p.attrs.hp = Math.min(999, p.attrs.hp + 20);
    p.attrs.fame += 10;
    p.vigor = Math.min(p.vigorMax || 60, (p.vigor || 0) + 8);
    p.notices.push('🎉 境界突破：' + r.n + '（气血上限 +20，名望 +10）');
    p.log.push('【境界】突破至 ' + r.n);
    save();
    return r;
  }
  return null;
}
const FESTIVALS = [
  { key:'spring', name:'上元灯节', desc:'长安满城花灯，赏钱与名望加成 +50%' },
  { key:'qingming', name:'清明', desc:'寒食三日，练功所得 +30%' },
  { key:'dragon', name:'端午', desc:'百舸争流，押镖与巡夜收入 +40%' },
  { key:'midautumn', name:'中秋', desc:'月圆，全属性小幅提升' },
  { key:'newyear', name:'岁除', desc:'守岁，善恶结算' },
];
function festivalOf() {
  if (db.world && db.world.festival) return db.world.festival;
  const d = new Date();
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return FESTIVALS[doy % FESTIVALS.length];
}
const VIGOR_MS = 2 * 60 * 1000;   // 2 分钟回复 1 点精力
function syncVigor(p) {
  if (typeof p.vigor !== 'number') { p.vigor = 60; p.vigorMax = 60; p.vigorAt = now(); }
  const gain = Math.floor((now() - (p.vigorAt || now())) / VIGOR_MS);
  if (gain > 0 && p.vigor < p.vigorMax) {
    p.vigor = Math.min(p.vigorMax, p.vigor + gain);
    p.vigorAt = now();
  } else if (p.vigor >= p.vigorMax) p.vigorAt = now();
  return p.vigor;
}
function phaseOf(h) {
  if (h >= 5 && h < 11) return { key: 'morning', name: '晨' };
  if (h >= 11 && h < 17) return { key: 'noon', name: '午' };
  if (h >= 17 && h < 22) return { key: 'dusk', name: '暮' };
  return { key: 'night', name: '夜' };
}
function advanceTime(p, hours) {
  let h = (p.hour == null ? 6 : p.hour) + hours;
  while (h >= 24) { h -= 24; p.day = (p.day || 1) + 1; p.tasksDate = ''; }
  p.hour = h;
  ensureTasks(p);
}
const TASK_POOL = [
  { type: 'meet',   name: '与人交谈', goal: 1, reward: { money: 25, fame: 3 } },
  { type: 'fight',  name: '赢下一场交手', goal: 1, reward: { money: 50, fame: 6 } },
  { type: 'train',  name: '修炼两次', goal: 2, reward: { neili: 6, money: 20 } },
  { type: 'scout',  name: '打探一次消息', goal: 1, reward: { money: 20, wuxing: 3 } },
  { type: 'work',   name: '打工一次', goal: 1, reward: { money: 40 } },
  { type: 'spend',  name: '花掉 50 两', goal: 50, reward: { money: 60, fame: 5 } },
  { type: 'story',  name: '推进一段剧情', goal: 1, reward: { money: 30, wuxing: 4 } },
];
function ensureTasks(p) {
  const d = new Date().toISOString().slice(0, 10) + '#' + (p.day || 1);
  if (p.tasksDate === d && (p.tasks || []).length) return p.tasks;
  const pool = TASK_POOL.slice().sort(() => Math.random() - .5).slice(0, 4);
  p.tasks = pool.map((t, i) => ({ id: 't' + i + '_' + Date.now(), type: t.type, name: t.name,
    goal: t.goal, reward: t.reward, progress: 0, claimed: false }));
  p.tasksDate = d;
  save();
  return p.tasks;
}
function bumpTask(p, type, amount) {
  ensureTasks(p);
  (p.tasks || []).forEach((t) => { if (t.type === type && !t.claimed) t.progress = Math.min(t.goal, t.progress + (amount || 1)); });
}
function codexAdd(p, kind, val) {
  p.codex = p.codex || { npcs: [], scenes: [], items: [] };
  const arr = p.codex[kind];
  if (arr && val && !arr.includes(val)) { arr.push(val); save(); }
}
function dailyEvent() {
  const d = new Date().toISOString().slice(0, 10);
  if (!db.world.daily || db.world.daily.date !== d) {
    const pick = DAILY[Math.floor(Math.random() * DAILY.length)];
    db.world.daily = { date: d, key: pick.key, name: pick.name, desc: pick.desc };
    save();
  }
  return db.world.daily;
}
function npcsAt(place) {
  db.npcs = db.npcs || {};
  const ids = Object.keys(db.npcs);
  if (ids.length > 300) { ids.slice(0, ids.length - 300).forEach((k) => delete db.npcs[k]); }
  let list = Object.values(db.npcs).filter((n) => n.place === place);
  // 常驻 NPC（固定，不随流动消失）
  (RESIDENTS[place] || []).forEach((r, i) => {
    const rid = 'res_' + place + '_' + i;
    if (!db.npcs[rid]) {
      db.npcs[rid] = { id: rid, name: r.name, title: r.title, trait: r.trait, purpose: r.purpose,
        purposeText: (r.lines || [])[0] || '', place, art: r.art, att: 0.6, met: 0, resident: true,
        hp: 80, atk: 12 };
    }
    if (!list.find((x) => x.id === rid)) list.push(db.npcs[rid]);
  });
  const allSeen = list.length > 0 && list.every((x) => (x.met || 0) > 0);
  const need = allSeen ? 2 : Math.max(0, 3 - list.length);
  for (let i = 0; i < need; i++) {
    const n = NPC.genNpc(place);
    db.npcs[n.id] = n;
    list.push(n);
  }
  if (need > 0) save();
  return list;
}
function npcMove() {
  db.npcs = db.npcs || {};
  const all = Object.values(db.npcs);
  if (!all.length) return;
  if (Math.random() < 0.35) {
    const n = all[Math.floor(Math.random() * all.length)];
    const places = Object.values(PLACES);
    n.place = places[Math.floor(Math.random() * places.length)];
    save();
  }
}

function companionsOf(p) {
  const list = B2.COMPANIONS.filter((c) => (p.flags || {})[c.flag]).slice(0, 2);
  const g = db.parties && p.party && db.parties[p.party];
  if (g) {
    g.members.filter((uid) => uid !== p.uid).forEach((uid) => {
      const m = Object.values(db.players).find((x) => x.uid === uid);
      if (m && list.length < 3) list.push({ id: 'ally_' + m.uid, name: m.nick, art: 'w_heroine',
        hp: Math.max(40, m.attrs.hp), atk: Math.round(10 + m.attrs.neili * 0.6), def: 3, spd: 100 });
    });
  }
  return list;
}
function playerAtkOf(p) { return atkOf(p); }

function startBattle(p, spec) {
  if (p.attrs.hp < 50) p.attrs.hp = Math.min(999, p.attrs.hp + 25);
  const foes = spec.foes || [{ key: spec.key || 'bandit', name: spec.name || '蒙面人',
    art: spec.art || 'w_villain', hp: Math.round((spec.hp || 80) * 0.8), atk: Math.round((spec.atk || 14) * 0.8),
    def: spec.def || 3, spd: spec.spd || 100 }];
  p.battle = B2.newBattle(p, p.flags, {
    foes, playerAtk: atkOf(p), companions: companionsOf(p).map((c) => ({ ...c })),
    log: ['⚔ 你遇上了 ' + foes.map((f) => f.name).join('、')],
    win: spec.win || null, lose: spec.lose || null, oppUid: spec.oppUid || null,
    reward: spec.reward || {},
  });
  p.battle.canFlee = !!spec.fleeOk;
  p.log.push('【交手】' + foes.map((f) => f.name).join('、'));
  save();
}

const LOOT_ITEMS = ['金疮药', '无名毒粉', '旧兵器', '碎银袋', '干粮', '密信残页'];
function settleBattle(p, b, out) {
  if (!b.result || b.settled) return out;
  b.settled = true;
  const win = b.result === 'win';
  const rw = b.reward || {};
  if (win) {
    if (rw.money) p.attrs.money += rw.money;
    if (rw.fame) p.attrs.fame += Math.max(1, Math.round(rw.fame * 0.5));
    if (rw.neili) p.attrs.neili += rw.neili;
    if (rw.wuxing) p.attrs.wuxing += rw.wuxing;
    const tday = new Date().toISOString().slice(0, 10);
    if (!p.battleWins || p.battleWins.day !== tday) p.battleWins = { day: tday, n: 0 };
    p.battleWins.n++;
    if (p.battleWins.n <= 10) p.attrs.money += 10 + Math.floor(Math.random() * 20);
    p.kills = (p.kills || 0) + 1;
    if (p.npcQuest && p.npcQuest.kind === 'fight') p.npcQuest.progress = 1;
    bumpTask(p, 'fight', 1);
    if (b.oppUid) {
      const o = Object.values(db.players).find((x) => x.uid === b.oppUid);
      p.pvp = p.pvp || { wins: 0, losses: 0, points: 100 };
      p.pvp.wins++; p.pvp.points += 20;
      checkSeason();
      db.season.points[p.uid] = (db.season.points[p.uid] || 0) + 20;
      p.seasonPoints = (p.seasonPoints || 0) + 20;
      if (o) { o.pvp = o.pvp || { wins: 0, losses: 0, points: 100 }; o.pvp.losses++; o.pvp.points = Math.max(0, o.pvp.points - 12); }
      out.push('🏆 切磋胜出（积分 +20）');
    }
    if (b.sectChallenge) {
      if (win) {
        p.sectRank = 4;
        p.items = p.items || [];
        if (!p.items.includes('掌门令')) p.items.push('掌门令');
        p.attrs.fame += 30;
        p.notices.push('🏯 你成为新一任掌门');
      } else {
        p.notices.push('🏯 挑战掌门失败，仍是长老');
      }
    }
    const plx = B2.playerUnit(b);
    if (plx && plx.alive) p.attrs.hp = Math.min(999, p.attrs.hp + Math.round(plx.maxHp * 0.1));
    if (b.win && STORY[b.win]) { p.scene = b.win; if (/^结局/.test(STORY[b.win].title || '')) p.ending = b.win; }
  } else {
    p.attrs.hp = Math.max(1, Math.round(p.attrs.hp * 0.3));
    p.attrs.money = Math.max(0, p.attrs.money - 20);
    if (b.oppUid) {
      p.pvp = p.pvp || { wins: 0, losses: 0, points: 100 };
      p.pvp.losses++; p.pvp.points = Math.max(0, p.pvp.points - 12);
    }
    if (b.lose && STORY[b.lose]) p.scene = b.lose;
  }
  const pl = B2.playerUnit(b);
  if (pl && win) p.attrs.hp = Math.max(1, Math.round(pl.hp));
  // 战果
  const loot = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstToday = p.firstBattleDay !== todayStr;
  if (win && firstToday) { p.firstBattleDay = todayStr; loot.push('✨ 今日首战·双倍收益'); }
  if (win) {
    const money2 = (22 + Math.floor(Math.random() * 33)) * (firstToday ? 2 : 1);
    p.attrs.money += money2; loot.push('银两 +' + money2);
    const localLoot = LOOT_BY_LOC[p.loc];
    if (Math.random() < 0.6) {
      const pool = localLoot ? localLoot.items : LOOT_ITEMS;
      const it = pool[Math.floor(Math.random() * pool.length)];
      p.items = p.items || [];
      if (!p.items.includes(it)) { p.items.push(it); loot.push('物品：' + it); }
      else loot.push('（' + it + ' 又一件）');
    }
    if (Math.random() < 0.28) {
      const gpool = localLoot && localLoot.gear ? localLoot.gear : ['weapon', 'armor', 'accessory'];
      const slot = gpool[Math.floor(Math.random() * gpool.length)];
      const g = { slot, name: { weapon: '缴获的刀', armor: '破损甲片', accessory: '战利品饰物' }[slot],
        atk: slot === 'weapon' ? 4 + Math.floor(Math.random() * 6) : 0,
        hp: slot === 'armor' ? 10 + Math.floor(Math.random() * 20) : 0 };
      p.gearBag = p.gearBag || []; p.gearBag.push(g);
      loot.push('装备：' + g.name);
    }
    const nei = 3 + Math.floor(Math.random() * 5);
    p.attrs.neili += nei; loot.push('内力 +' + nei);
    const br = checkRealm(p); if (br) loot.push('🎉 突破：' + br.n);
  }
  p.aftermath = {
    win, loot, at: now(),
    text: win ? '你收拾了一下场地，把能带走的都带走了。' : '你被人从血泊里拖了出来，醒来时天已经黑了。',
    foes: (b.units || []).filter((u) => u.side === 'foe').map((u) => u.name),
  };
  p.log.push('【交手】' + (win ? '胜利' : '战败'));
  p.battle = null;
  save();
  return out;
}

function runAmbush(p, place) {
  p.battle = B2.newBattle(p, p.flags, { playerAtk: atkOf(p),
    companions: companionsOf(p).map((c) => ({ ...c })),
    log: ['⚠ ' + place + '不是安稳地方——有人从暗处冲出来'] });
  p.battle.canFlee = true;
  p.log.push('【遭遇】' + place + '遇袭');
  save();
  B2.advance(p.battle, {});
  if (p.battle.result) { const o = []; settleBattle(p, p.battle, o); }
}
const DANGER_PLACES = ['洛阳渡口', '邙山', '破庙', '黑崖', '落雁村', '雁门', '关外三堡', '剑冢'];
function isoWeek() {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
function checkSeason() {
  const wk = isoWeek();
  if (!db.season) db.season = { id: 1, week: wk, start: now(), points: {} };
  if (db.season.week === wk) return db.season;
  // 结算上一周
  const board = Object.entries(db.season.points || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  board.forEach(([uid, pts], i) => {
    const t = Object.values(db.players).find((x) => x.uid === uid);
    if (!t) return;
    const bonus = [300, 180, 100][i] || 0;
    t.attrs.money += bonus;
    t.attrs.fame += [15, 10, 5][i] || 0;
    t.notices.push('🏅 上周切磋榜第 ' + (i + 1) + ' 名，奖励 ' + bonus + ' 两');
  });
  db.season = { id: (db.season.id || 1) + 1, week: wk, start: now(), points: {} };
  Object.values(db.players).forEach((t) => { t.seasonPoints = 0; });
  save();
  return db.season;
}
function partyOf(p) {
  if (!p.party) return null;
  const g = db.parties && db.parties[p.party];
  if (!g) { p.party = null; return null; }
  return g;
}

function ensureTide() {
  if (db.world.tide && db.world.tide.end > now()) return db.world.tide;
  const tides = [
    { key: 'cult_vs_six', a: '玄阴余党', b: '六派联盟' },
    { key: 'court_vs_jianghu', a: '朝廷', b: '江湖' },
    { key: 'north_vs_south', a: '北境旧部', b: '关内守军' },
  ];
  const pick = tides[Math.floor(Math.random() * tides.length)];
  db.world.tide = { ...pick, aPts: 0, bPts: 0, start: now(), end: now() + 3 * 86400000 };
  save();
  return db.world.tide;
}
function tideResolve() {
  const t = ensureTide();
  if (t.aPts >= 100 || t.bPts >= 100) {
    const winner = t.aPts >= t.bPts ? t.a : t.b;
    db.world.tide = null;
    db.world.notice = '⚔ 江湖大势已定：' + winner + ' 胜出';
    db.world.noticeAt = now();
    Object.values(db.players).forEach((p) => p.notices.push('🌊 江湖大势：' + winner + ' 胜出'));
    log('大势结算：' + winner);
    save();
    return winner;
  }
  return null;
}

let mailSeq = 1;
function sendMail(p, m) {
  p.mail = p.mail || [];
  p.mail.unshift({ id: 'm' + (mailSeq++) + '_' + Date.now(), at: now(),
    from: m.from || '系统', subject: String(m.subject || '无题').slice(0, 40),
    body: String(m.body || '').slice(0, 500),
    money: Number(m.money) || 0, items: Array.isArray(m.items) ? m.items.slice(0, 6) : [],
    claimed: false });
  p.mail = p.mail.slice(0, 50);
  p.notices.push('✉ 新邮件：' + (m.subject || ''));
  save();
}

const PLACE_TO_LOC = { '长安':'changan','洛阳':'luoyang','少林':'shaolin','武当':'wudang','峨眉':'emei',
  '血刀门':'bloodgate','邙山':'mangshan','落雁村':'luoyan','雁门':'yanmen','剑冢':'swordtomb','洛阳渡口':'ferry' };
function syncLocFromScene(p) {
  const place = PLACES[p.scene] || '江湖';
  const id = PLACE_TO_LOC[place];
  if (id) {
    p.locs = p.locs || ['changan'];
    if (!p.locs.includes(id)) p.locs.push(id);
    p.loc = id;
  }
}

const ACTIONS = {
  npcQuest(p, b) {
    const list = npcsAt(p.loc || 'changan');
    const n = list.find((x) => x.id === b.id) || list.find((x) => x.name === b.name);
    if (!n) return ['这个人已经不在原处了'];
    const q = RESIDENT_QUESTS[n.name];
    if (!q) return [n.name + ' 摆摆手：“没什么事，你去忙吧。”'];
    const cur = p.npcQuest;
    if (!cur || cur.npc !== n.name) {
      if (q.kind === 'pay') {
        const cost = q.cost || 5;
        if (p.attrs.money < cost) return ['你身上钱不够（需 ' + cost + ' 两）'];
        p.attrs.money -= cost;
        p.attrs.fame += (q.reward.fame || 0);
        p.attrs.money += (q.reward.money || 0);
        p.log.push('【委托】' + n.name);
        save();
        return ['🤝 ' + n.name + '：“这份情我记下了。”'];
      }
      p.npcQuest = { npc: n.name, kind: q.kind, task: q.task, progress: 0, reward: q.reward };
      save();
      return ['📜 ' + n.name + '：“' + q.task + '”'];
    }
    const need = 1;
    if (cur.progress < need) return ['还差一点：' + cur.task];
    const r = cur.reward || {};
    if (r.money) p.attrs.money += r.money;
    if (r.fame) p.attrs.fame += r.fame;
    if (r.wuxing) p.attrs.wuxing += r.wuxing;
    if (r.karma) p.attrs.karma += r.karma;
    if (r.neili) p.attrs.neili += r.neili;
    if (r.hp) p.attrs.hp = Math.min(999, p.attrs.hp + r.hp);
    p.npcQuest = null;
    n.att = Math.min(1, (n.att || .5) + 0.2);
    p.npcRel = p.npcRel || {};
    p.npcRel[n.id] = (p.npcRel[n.id] || 0) + 15;
    checkRealm(p); save();
    return ['✅ 委托完成：' + n.name + ' 谢过你。'];
  },

  npcLore(p, b) {
    const list = npcsAt(p.loc || 'changan');
    const n = list.find((x) => x.id === b.id) || list.find((x) => x.name === b.name);
    if (!n) return ['这个人已经不在原处了'];
    const lore = RESIDENT_LORE[n.name];
    if (!lore) return ['' + n.name + ' 只是笑了笑，不肯说。'];
    const rel = (p.npcRel || {})[n.id] || 0;
    if (rel < 10 && (n.met || 0) < 3) return ['他还信不过你。多聊几次再来。'];
    p.attrs.wuxing += 3;
    p.npcRel[n.id] = rel + 5;
    n.att = Math.min(1, (n.att || .5) + 0.1);
    p.log.push('【旧事】' + n.name);
    save();
    return ['📖 ' + n.name + '：' + lore + '（悟性 +3）'];
  },

  travel(p, b) {
    const id = String(b.id || '');
    const L = LOCS[id];
    if (!L) return ['没有这个去处'];
    if (!(p.locs || []).includes(id)) return ['这条路由你还没摸清（多走走剧情会解锁）'];
    if (id === p.loc) return ['你已经在这里了'];
    syncVigor(p);
    if (p.vigor < 1) return ['精力不足，走不动道'];
    p.vigor -= 1;
    advanceTime(p, L.cost || 2);
    p.loc = id;
    p.log.push('【赶路】到了' + L.name);
    save();
    return ['🚶 你走了' + (L.cost || 2) + ' 个时辰，到了「' + L.name + '」。' + L.desc];
  },
  takePill(p) {
    if (p.pills > 0) {
      p.pills--; p.attrs.neili += 12; p.vigor = Math.min(p.vigorMax, (p.vigor || 0) + 15);
      checkRealm(p); save();
      return ['💊 你服下一枚聚气丹：内力 +12，精力 +15'];
    }
    if (p.attrs.money < 40) return ['没有聚气丹，药铺卖 40 两一枚'];
    p.attrs.money -= 40;
    p.attrs.neili += 8; p.vigor = Math.min(p.vigorMax, (p.vigor || 0) + 5);
    checkRealm(p); save();
    return ['💊 你在药铺买了一枚聚气丹服下：内力 +12，精力 +15（花费 40 两）'];
  },
  attackNpc(p, b) {
    const list = npcsAt(p.loc);
    const n = list.find((x) => x.id === b.id) || list.find((x) => x.name === b.name) || list[Number(b.idx)];
    if (!n) return ['这个人已经不在原处了'];
    p.battle = B2.newBattle(p, p.flags, { playerAtk: atkOf(p),
      companions: companionsOf(p).map((c) => ({ ...c })),
      foes: [{ key: 'npc', name: n.name, art: n.art || 'w_villain', hp: 60 + (n.atk || 10) * 3, atk: (n.atk || 10) + 4, def: 3, spd: 100 }],
      log: ['⚔ 你向 ' + n.name + ' 动了手'] });
    p.battle.npcId = n.id;
    n.att = Math.max(0, (n.att || .5) - 0.4);
    p.attrs.karma -= 3;
    p.log.push('【交手】对 ' + n.name + ' 出手');
    save();
    const out = [];
    B2.advance(p.battle, {}).forEach((l) => out.push(l));
    if (p.battle.result) settleBattle(p, p.battle, out);
    return ['⚔ 你出手了'].concat(out);
  },
  talkNpc(p, b) {
    const list = npcsAt(p.loc);
    const n = list.find((x) => x.id === b.id) || list.find((x) => x.name === b.name) || list[Number(b.idx)];
    if (!n) return ['这个人已经不在原处了'];
    n.att = Math.min(1, (n.att || .5) + 0.15);
    n.met = (n.met || 0) + 1;
    if (p.npcQuest && p.npcQuest.kind === 'visit' && p.npcQuest.npc === n.name) p.npcQuest.progress = 1;
    p.npcRel = p.npcRel || {};
    p.npcRel[n.id] = (p.npcRel[n.id] || 0) + 5;
    const lines = {
      '豪爽': ['他大笑起来，拉你喝了一碗。', '“痛快！改日再会。”'],
      '阴鸷': ['他盯着你看了很久，才慢慢点头。', '“你这个人，有点意思。”'],
      '痴情': ['他低声说了几句旧事，眼圈红了。', '“这些话，我只跟你说过。”'],
      '贪财': ['他搓着手笑：“有话好说，有事好商量。”', '“买卖不成仁义在嘛。”'],
      '怪癖': ['他忽然问你一个古怪的问题，自己先笑了。', '“世人皆醉，你也醉了。”'],
      '侠义': ['他抱拳还礼，站得笔直。', '“江湖路远，兄台保重。”'],
      '怯懦': ['他小声说了几句，不停往身后看。', '“你……你别声张。”'],
    }[n.trait] || ['你们聊了几句。'];
    const gain = Math.random() < 0.3 ? 2 : 1;
    p.attrs.wuxing += gain;
    bumpTask(p, 'meet', 1);
    codexAdd(p, 'npcs', n.name);
    save();
    return ['💬 ' + n.name + '：' + lines.join(' ') + '（悟性 +' + gain + '）'];
  },

  mailClaim(p, b) {
    p.mail = p.mail || [];
    const m = p.mail.find((x) => x.id === b.id);
    if (!m) return ['没有这封邮件'];
    if (m.claimed) return ['附件已领取'];
    let msg = [];
    if (m.money) { p.attrs.money += m.money; msg.push('银两 +' + m.money); }
    if (m.items && m.items.length) {
      p.items = p.items || [];
      m.items.forEach((it) => { if (!p.items.includes(it)) p.items.push(it); });
      msg.push('物品：' + m.items.join('、'));
    }
    if (!m.money && !(m.items && m.items.length)) return ['这封邮件没有附件'];
    m.claimed = true;
    p.log.push('【邮件】领取 ' + m.subject);
    checkRealm(p); save();
    return ['📦 ' + m.subject + '：' + msg.join('｜')];
  },
  mailClaimAll(p) {
    p.mail = p.mail || [];
    const list = p.mail.filter((m) => !m.claimed && (m.money || (m.items && m.items.length)));
    if (!list.length) return ['没有可领取的附件'];
    let money = 0, items = [];
    list.forEach((m) => { money += m.money || 0; (m.items || []).forEach((i) => items.push(i)); m.claimed = true; });
    p.attrs.money += money;
    p.items = p.items || [];
    items.forEach((it) => { if (!p.items.includes(it)) p.items.push(it); });
    save();
    return ['📦 一键领取：银两 +' + money + (items.length ? ('｜物品 ' + items.length + ' 件') : '')];
  },
  mailRead(p, b) {
    p.mail = p.mail || [];
    p.mail.forEach((m) => { if (m.id === b.id) m.read = true; });
    if (b.all) p.mail.forEach((m) => { m.read = true; });
    save();
    return ['已读'];
  },

  tideVote(p, b) {
    const t = ensureTide();
    if (t.aPts >= 100 || t.bPts >= 100) return ['大势已定，等下一轮'];
    const side = b.side === 'b' ? 'b' : 'a';
    const cost = 20;
    if (p.attrs.money < cost) return ['需要 ' + cost + ' 两'];
    p.attrs.money -= cost;
    const gain = 5 + Math.floor((p.attrs.fame || 0) / 10);
    if (side === 'a') t.aPts += gain; else t.bPts += gain;
    p.tideVote = side;
    p.log.push('【大势】支持 ' + (side === 'a' ? t.a : t.b));
    const win = tideResolve();
    save();
    return ['🌊 你支持了 ' + (side === 'a' ? t.a : t.b) + '（+' + gain + ' 声势）' + (win ? '，大势已定：' + win : '')];
  },
  reincarnate(p) {
    const r = realmOf(p);
    if (r.idx < 9) return ['需达到「归一」境界才能转世（当前 ' + r.n + '）'];
    p.legacy = (p.legacy || 0) + 1;
    p.legacyBonus = (p.legacyBonus || 0) + 6;
    const keep = { legacy: p.legacy, legacyBonus: p.legacyBonus, codex: p.codex,
      codexClaimed: p.codexClaimed, friends: p.friends, account: p.account, nick: p.nick };
    Object.assign(p, {
      scene: 'birth_start', ending: null, flags: { legacyBorn: p.legacy },
      attrs: { hp: 100 + p.legacyBonus * 2, neili: 20 + p.legacyBonus, wuxing: 10 + p.legacyBonus,
        fame: 0, money: 20, karma: 0 },
      items: [], gear: { weapon: null, armor: null, accessory: null }, gearBag: [],
      log: ['【转世】第 ' + p.legacy + ' 世'], choicesMade: 0, kills: 0, battles: 0,
      job: 'swordsman', artKey: 'basic_sword', mind: 'hunyuan', sectRank: 0, sectExp: 0,
      home: { owned: false, level: 0 }, mount: null, realmIdx: 0,
    });
    p.legacy = keep.legacy; p.legacyBonus = keep.legacyBonus;
    save();
    return ['🌀 转世第 ' + p.legacy + ' 世：永久加成 +' + p.legacyBonus + '（攻击/气血/内力/悟性）'];
  },
  sectChallenge(p) {
    if (!(p.flags || {}).sect) return ['你还没有门派'];
    if ((p.sectRank || 0) < 3) return ['需先做到长老'];
    if ((p.sectExp || 0) < 1500) return ['贡献不足（需 1500）'];
    if (p.battle) return ['战斗未结束'];
    const master = { name: '现任掌门', hp: 220, atk: 26, def: 6, spd: 104, art: 'w_taoist' };
    startBattle(p, { name: master.name, art: master.art, hp: master.hp, atk: master.atk, def: master.def,
      spd: master.spd, fleeOk: false, reward: { fame: 40, money: 100 } });
    p.battle.sectChallenge = true;
    save();
    return ['⚔ 你向掌门提出挑战'];
  },

  signIn(p) {
    const d = new Date().toISOString().slice(0, 10);
    if (p.sign && p.sign.last === d) return ['今天已经签到过了'];
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak = p.sign && p.sign.last === y ? (p.sign.streak || 1) + 1 : 1;
    p.sign = { last: d, streak };
    const day = ((streak - 1) % 7) + 1;
    const rewards = { 1: { money: 60 }, 2: { fame: 5 }, 3: { neili: 10 }, 4: { money: 120 },
      5: { wuxing: 6 }, 6: { money: 180 }, 7: { money: 300, fame: 15 } };
    const r = rewards[day];
    for (const [k, v] of Object.entries(r)) p.attrs[k] = (p.attrs[k] || 0) + v;
    if (day === 7) { p.items = p.items || []; if (!p.items.includes('七日彩头')) p.items.push('七日彩头'); }
    p.log.push('【签到】连续 ' + streak + ' 天');
    checkRealm(p);
    save();
    return ['📅 签到成功（连续 ' + streak + ' 天）' + JSON.stringify(r)];
  },
  partyInvite(p, b) {
    const t = Object.values(db.players).find((x) => x.uid === b.uid);
    if (!t) return ['找不到这个玩家'];
    if (t.uid === p.uid) return ['不能邀请自己'];
    if (!(p.friends || []).includes(t.uid)) return ['只能邀请好友'];
    if (p.party) return ['你已经在一个队伍里了'];
    db.parties = db.parties || {};
    const id = 'p' + p.uid;
    db.parties[id] = { id, leader: p.uid, members: [p.uid], created: now() };
    p.party = id;
    t.pendingParty = id;
    t.notices.push('🤝 ' + p.nick + ' 邀请你结伴同行（在社交里接受）');
    save();
    return ['已建立队伍，等对方接受'];
  },
  partyAccept(p) {
    if (!p.pendingParty) return ['没有待接受的邀请'];
    const g = db.parties && db.parties[p.pendingParty];
    if (!g) { p.pendingParty = null; return ['队伍已解散']; }
    if (g.members.length >= 3) return ['队伍已满'];
    g.members.push(p.uid);
    p.party = g.id; p.pendingParty = null;
    g.members.forEach((uid) => { const m = Object.values(db.players).find((x) => x.uid === uid); if (m) m.notices.push('✅ 队伍成立了'); });
    save();
    return ['你加入了队伍'];
  },
  partyLeave(p) {
    const g = partyOf(p);
    if (g) {
      g.members = g.members.filter((x) => x !== p.uid);
      if (!g.members.length || g.leader === p.uid) delete db.parties[g.id];
    }
    p.party = null; save();
    return ['你离开了队伍'];
  },
  workBatch(p, b) {
    if (p.frozen) return ['你被封住了'];
    const times = Math.min(5, Math.max(1, Number(b.times) || 3));
    const out = [];
    for (let i = 0; i < times; i++) {
      const r = ACTIONS.work(p, { kind: b.kind });
      if (r[0] && (r[0].includes('得在') || r[0].includes('不足') || r[0].includes('撑不住'))) { out.push(r[0]); break; }
      out.push(r[0]);
    }
    return out;
  },
  codexClaim(p, b) {
    const kind = b.kind, level = Number(b.level);
    const milestones = { npcs: [5, 10, 20], scenes: [20, 50, 90], items: [3, 6, 10] };
    const need = (milestones[kind] || [])[level];
    if (!need) return ['没有这个奖励'];
    const got = ((p.codex || {})[kind] || []).length;
    if (got < need) return ['还差 ' + (need - got) + ' 个'];
    p.codexClaimed = p.codexClaimed || {};
    const key = kind + level;
    if (p.codexClaimed[key]) return ['已经领过了'];
    p.codexClaimed[key] = 1;
    p.attrs.fame += 10 + level * 10;
    p.attrs.wuxing += 3 + level * 2;
    if (level === 2) { p.items = p.items || []; const title = { npcs: '识人无数', scenes: '踏遍江湖', items: '博览群书' }[kind]; if (!p.items.includes(title)) p.items.push(title); }
    checkRealm(p); save();
    return ['🏅 图鉴奖励已领'];
  },

  clearAftermath(p) {
    p.aftermath = null; save();
    return ['继续赶路'];
  },
  meditate(p) {
    const cost = 10;
    if (p.attrs.money < cost) return ['银两不足（需 10）'];
    p.attrs.money -= cost;
    syncVigor(p);
    p.vigor = Math.min(p.vigorMax, p.vigor + 10);
    advanceTime(p, 2);
    save();
    return ['🧘 你在客栈歇了两个时辰，精力 +10'];
  },
  explore(p) {
    if (p.battle) return ['战斗还没结束'];
    syncVigor(p);
    if (p.vigor < 1) return ['精力不足，歇一会儿再来（每 3 分钟回复 1 点）'];
    p.vigor -= 1;
    const here = PLACES[p.scene] || '江湖';
    const dangerous = DANGER_PLACES.includes(here);
    advanceTime(p, 2);
    const roll = Math.random();
    if (p.npcQuest && p.npcQuest.kind === 'explore') p.npcQuest.progress = 1;
    if (dangerous && roll < 0.55) {
      p.battle = B2.newBattle(p, p.flags, { playerAtk: atkOf(p),
        companions: companionsOf(p).map((c) => ({ ...c })),
        log: ['⚔ 你在' + here + '的暗处，被人盯上了'] });
      p.battle.canFlee = true;
      p.log.push('【探索】' + here + '遇敌');
      save();
      const out = [];
      B2.advance(p.battle, {}).forEach((l) => out.push(l));
      if (p.battle.result) settleBattle(p, p.battle, out);
      return ['⚔ 遭遇战'].concat(out);
    }
    if (roll < 0.8) {
      const today2 = new Date().toISOString().slice(0, 10);
      if (!p.exploreGold || p.exploreGold.date !== today2) p.exploreGold = { date: today2, sum: 0 };
      let money = 4 + Math.floor(Math.random() * 12);
      if (p.exploreGold.sum + money > 260) money = Math.max(0, 260 - p.exploreGold.sum);
      p.exploreGold.sum += money;
      p.attrs.money += money;
      p.log.push('【探索】在' + here + '拾得财物');
      save();
      return ['🔍 你在' + here + '转了一圈，' + (dangerous ? '没碰上人，' : '') + '捡到 ' + money + ' 两碎银。'];
    }
    if (roll < 0.92) {
      p.attrs.wuxing += 1;
      bumpTask(p, 'scout', 1);
      save();
      return ['🔍 你在' + here + '看了一阵地形，似有所悟（悟性 +2）。'];
    }
    p.attrs.neili += 2;
    save();
    return ['🔍 你什么也没找到，只在原地坐了一会儿（内力 +2）。'];
  },

  fight(p) {
    if (p.battle) return ['战斗还没结束'];
    if ((LOCS[p.loc || 'changan'] || {}).type !== 'wild') return ['这里人来人往，不好动手。去野外转转吧'];
    syncVigor(p);
    if (p.vigor < 1) return ['精力不足，歇一会儿再来（每 3 分钟回复 1 点）'];
    p.vigor -= 1;
    if (p.attrs.hp < 20) return ['气血太低，先疗伤'];
    p.battle = B2.newBattle(p, p.flags, {
      playerAtk: atkOf(p), companions: companionsOf(p).map((c) => ({ ...c })),
      log: ['⚔ 你在' + (PLACES[p.scene] || '江湖') + '遇上一伙人'],
    });
    p.battle.canFlee = false;
    p.log.push('【交手】野外遭遇');
    save();
    const out = [];
    B2.advance(p.battle, {}).forEach((l) => out.push(l));
    if (p.battle.result) settleBattle(p, p.battle, out);
    return ['⚔ 遭遇战开始'].concat(out);
  },
  chat(p, b) {
    const text = String(b.text || '').trim().slice(0, 120);
    if (!text) return ['说点什么'];
    if (now() - (p.chatAt || 0) < 1500) return ['说太快了，缓一缓'];
    p.chatAt = now();
    const msg = { at: now(), from: p.nick, uid: p.uid, text };
    if (b.to) {
      const t = Object.values(db.players).find((x) => x.uid === b.to);
      if (!t) return ['找不到这个玩家'];
      if (!(p.friends || []).includes(t.uid)) return ['只能私聊好友'];
      const k = dmKey(p.uid, t.uid);
      db.dm[k] = (db.dm[k] || []).concat([msg]).slice(-200);
      t.notices.push('💬 ' + p.nick + '：' + text);
    } else {
      db.chat = (db.chat || []).concat([msg]).slice(-200);
    }
    save();
    return ['已发送'];
  },
  friendAdd(p, b) {
    const key = String(b.key || '').trim();
    if (!key) return ['输入对方 UID 或昵称'];
    const t = Object.values(db.players).find((x) => x.uid === key || x.nick === key);
    if (!t) return ['找不到这个玩家'];
    if (t.uid === p.uid) return ['不能加自己'];
    p.friends = p.friends || [];
    if (p.friends.includes(t.uid)) return ['已经是好友了'];
    p.friends.push(t.uid);
    t.notices.push('🤝 ' + p.nick + ' 加你为好友');
    save();
    return ['已加 ' + t.nick + ' 为好友'];
  },
  friendRemove(p, b) {
    p.friends = (p.friends || []).filter((x) => x !== b.uid);
    save();
    return ['已删除好友'];
  },

  buyHome(p) {
    if (p.home && p.home.owned) return ['你已经有宅子了'];
    if (p.attrs.money < 500) return ['买宅子要 500 两'];
    p.attrs.money -= 500;
    p.home = { owned: true, level: 1 };
    p.log.push('【安家】在长安买下宅子');
    save();
    return ['🏠 你在长安买下一处小院。从此有个落脚的地方。'];
  },
  upgradeHome(p) {
    if (!p.home || !p.home.owned) return ['先买宅子'];
    if (p.home.level >= 3) return ['已经是最大的院子了'];
    const cost = 300 * p.home.level;
    if (p.attrs.money < cost) return ['扩建要 ' + cost + ' 两'];
    p.attrs.money -= cost;
    p.home.level++;
    save();
    return ['🏠 院子扩到 ' + p.home.level + ' 进'];
  },
  restHome(p) {
    if (!p.home || !p.home.owned) return ['你还没有宅子'];
    advanceTime(p, 6);
    const heal = 30 + p.home.level * 20;
    p.attrs.hp = Math.min(999, p.attrs.hp + heal);
    const rent = 10 * p.home.level;
    p.attrs.money += rent;
    p.log.push('【安家】在家歇了半日');
    save();
    return ['🛏 你在自家院里睡了半日，气血 +' + heal + '，收房租 ' + rent + ' 两'];
  },
  buyMount(p, b) {
    const mounts = { horse: { name: '黄骠马', price: 300 }, ox: { name: '青牛', price: 150 } };
    const m = mounts[b.kind];
    if (!m) return ['没有这种坐骑'];
    if (p.attrs.money < m.price) return ['要 ' + m.price + ' 两'];
    p.attrs.money -= m.price;
    p.mount = { key: b.kind, name: m.name };
    save();
    return ['🐎 你买下一匹' + m.name + '。赶路与打工省时。'];
  },
  sectTask(p) {
    if (!p.flags || !p.flags.sect) return ['你还没有入门派'];
    if (p.frozen) return ['你被封住了'];
    const gain = 20 + Math.floor(Math.random() * 20);
    p.sectExp = (p.sectExp || 0) + gain;
    p.attrs.money += 10;
    advanceTime(p, 3);
    const ranks = ['记名弟子', '正式弟子', '执事', '长老'];
    let msg = '🧾 门派差事做完，贡献 +' + gain;
    const need = [0, 100, 300, 700];
    let r = p.sectRank || 0;
    while (r < 3 && p.sectExp >= need[r + 1]) { r++; msg += '｜晋升为' + ranks[r]; }
    p.sectRank = r;
    save();
    return [msg];
  },
  buyCodex(p, b) {
    if (p.attrs.money < 30) return ['要 30 两'];
    p.attrs.money -= 30;
    const pool = ['旧兵器谱', '江湖人物志', '奇遇录', '药材图鉴'];
    const it = pool[Math.floor(Math.random() * pool.length)];
    codexAdd(p, 'items', it);
    p.attrs.wuxing += 3;
    save();
    return ['📖 你买到一本《' + it + '》，悟性 +3'];
  },

  board(p) {
    ensureTasks(p);
    return ['今日委托：' + p.tasks.filter((t) => !t.claimed).length + ' 条待办'];
  },
  claim(p, b) {
    ensureTasks(p);
    const t = (p.tasks || []).find((x) => x.id === b.id);
    if (!t) return ['没有这条委托'];
    if (t.claimed) return ['已经领过了'];
    if (t.progress < t.goal) return ['还没完成（' + t.progress + '/' + t.goal + '）'];
    t.claimed = true;
    const r = t.reward || {};
    if (r.money) p.attrs.money += r.money;
    if (r.fame) p.attrs.fame += r.fame;
    if (r.neili) p.attrs.neili += r.neili;
    if (r.wuxing) p.attrs.wuxing += r.wuxing;
    p.log.push('【委托】' + t.name + ' 完成');
    save();
    return ['📋 委托完成：' + t.name];
  },
  work(p, b) {
    const ph = phaseOf(p.hour == null ? 6 : p.hour);
    const kind = b.kind || 'escort';
    const NEEDS = { escort: 'morning', serve: 'noon', herb: 'morning', teach: 'noon', watch: 'night' };
    if (NEEDS[kind] && NEEDS[kind] !== ph.key) {
      const nm = { morning: '晨', noon: '午', dusk: '暮', night: '夜' }[NEEDS[kind]] || '';
      return ['这活儿得在' + nm + '时做（现在是' + ph.name + '）'];
    }
    const jobs = {
      escort: { name: '押镖', pay: 55, need: 'morning', risk: .3 },
      serve:  { name: '跑堂', pay: 22, need: 'noon', risk: .05 },
      herb:   { name: '抓药', pay: 28, need: 'morning', risk: .1 },
      teach:  { name: '代馆', pay: 42, need: 'noon', risk: .05 },
      watch:  { name: '巡夜', pay: 35, need: 'night', risk: .35 },
    };
    const j = jobs[kind];
    if (!j) return ['没有这份差事'];
    if (p.attrs.hp < 15) return ['身子撑不住，先养伤'];
    const fest = festivalOf();
    let pay = j.pay;
    if (fest.key === 'dragon' && (kind === 'escort' || kind === 'watch')) pay = Math.round(pay * 1.4);
    if (fest.key === 'spring') pay = Math.round(pay * 1.5);
    if ((p.flags || {}).growth === 'merchant') pay = Math.round(pay * 1.2);
    p.attrs.money += pay;
    p.attrs.hp = Math.max(1, p.attrs.hp - 6);
    advanceTime(p, kind === 'watch' ? 4 : 3);
    bumpTask(p, 'work', 1);
    let msg = '💼 ' + j.name + '做完了，得银 ' + j.pay + ' 两';
    if (Math.random() < j.risk) {
      const ev = [
        ['路上遇到抢镖的，你护住了货', { fame: 6, hp: -12 }],
        ['客人多给了赏钱', { money: 20 }],
        ['掌柜的看你身手好，多留你一日', { money: 10, fame: 2 }],
        ['遇上熟客闹事，你出手摆平', { fame: 4, karma: 3 }],
        ['干到一半下雨，活儿砸了', { money: -10 }],
      ][Math.floor(Math.random() * 5)];
      for (const [k, v] of Object.entries(ev[1])) p.attrs[k] = (p.attrs[k] || 0) + v;
      msg += '｜' + ev[0];
    }
    p.log.push('【生计】' + j.name);
    save();
    return [msg];
  },
  gift(p, b) {
    const n = db.npcs && db.npcs[b.npcId];
    if (!n) return ['没有这个人'];
    if (p.attrs.money < 20) return ['银两不足（需 20）'];
    p.attrs.money -= 20;
    p.npcRel = p.npcRel || {};
    p.npcRel[n.id] = (p.npcRel[n.id] || 0) + 10;
    n.att = Math.min(1, (n.att || .5) + 0.15);
    if (p.npcRel[n.id] >= 30 && !p.npcRel[n.id + '_gift']) {
      p.npcRel[n.id + '_gift'] = 1;
      p.attrs.wuxing += 6;
      p.log.push('【交情】' + n.name + ' 教了你一点东西');
      save();
      return ['🎁 ' + n.name + ' 收下了礼，还教你一点心得（悟性 +6）'];
    }
    save();
    return ['🎁 你送了 ' + n.name + ' 一份礼，他脸色和缓了些'];
  },

  toDaily(p) {
    if (p.battle) return ['战斗还没结束'];
    syncVigor(p);
    if (p.vigor < 1) return ['精力不足，歇一会儿再来（每 3 分钟回复 1 点）'];
    p.vigor -= 1;
    if (p.scene !== 'free_roam') p.savedScene = p.scene;
    p.scene = 'free_roam';
    save();
    return ['你暂且放下手头的事，回到市井里去。'];
  },
  backStory(p) {
    if (!p.savedScene || !STORY[p.savedScene]) return ['没有未了的事'];
    p.scene = p.savedScene;
    save();
    return ['你回到刚才的地方。'];
  },

  forge(p, body) {
    if (p.attrs.money < 60) return ['银两不足（需 60）'];
    p.attrs.money -= 60;
    bumpTask(p, 'spend', 60);
    const slot = (body && body.slot) || 'weapon';
    const list = GEAR_TYPES[slot] || GEAR_TYPES.weapon;
    const lvl = Math.min(list.length - 1, Math.floor(p.attrs.neili / 25));
    const base = list[Math.max(0, lvl - 1 + (Math.random() < 0.25 ? 1 : 0))];
    const quality = 0.9 + Math.random() * 0.4;
    const g = { slot, name: base[0], atk: Math.round(base[1] * quality), hp: Math.round(base[2] * quality) };
    p.gearBag = p.gearBag || []; p.gearBag.push(g);
    p.log.push('【打造】' + g.name + '（攻+' + g.atk + ' 血+' + g.hp + '）');
    save();
    return ['🔨 打造出「' + g.name + '」：攻击 +' + g.atk + '，气血 +' + g.hp];
  },
  equipGear(p, b3) {
    const idx = Number(b3.idx);
    const bag = p.gearBag || [];
    const g = bag[idx];
    if (!g) return ['没有这件装备'];
    const old = (p.gear || {})[g.slot] || null;
    p.gear = p.gear || {}; p.gear[g.slot] = g;
    bag.splice(idx, 1);
    if (old) bag.push(old);
    p.log.push('【装备】' + g.name);
    save();
    return ['你装备了「' + g.name + '」'];
  },
  sellGear(p, b4) {
    const idx = Number(b4.idx);
    const g = (p.gearBag || [])[idx];
    if (!g) return ['没有这件装备'];
    const price = 15 + g.atk * 2 + g.hp / 2 | 0;
    p.gearBag.splice(idx, 1);
    p.attrs.money += price;
    save();
    return ['卖出「' + g.name + '」，得银 ' + price + ' 两'];
  },
  guildCreate(p, b5) {
    const name = String(b5.name || '').trim().slice(0, 8);
    if (!name) return ['帮派名不能为空'];
    if (Object.values(db.guilds).some((g) => g.name === name)) return ['这个帮派名已存在'];
    if (p.attrs.money < 200) return ['建帮需要 200 两'];
    if (p.guild) return ['你已经在一个帮派里了'];
    p.attrs.money -= 200;
    const id = 'g' + (Object.keys(db.guilds).length + 1) + '_' + Math.floor(Math.random() * 900);
    db.guilds[id] = { id, name, founder: p.nick, members: [p.uid], level: 1, exp: 0, notice: '新帮初立，广纳豪杰。', created: now() };
    p.guild = id;
    p.log.push('【创立帮派】' + name);
    save();
    return ['🏯 你创立了「' + name + '」'];
  },
  guildJoin(p, b6) {
    const g = db.guilds[b6.id];
    if (!g) return ['没有这个帮派'];
    if (p.guild) return ['你已经在一个帮派里了'];
    if (g.members.length >= 30) return ['帮派人数已满'];
    g.members.push(p.uid); p.guild = g.id;
    p.log.push('【入帮】' + g.name);
    save();
    return ['你加入了「' + g.name + '」'];
  },
  guildLeave(p) {
    const g = db.guilds[p.guild];
    if (g) { g.members = g.members.filter((x) => x !== p.uid); if (!g.members.length) delete db.guilds[g.id]; }
    p.guild = null; save();
    return ['你离开了帮派'];
  },
  guildDonate(p) {
    const g = db.guilds[p.guild];
    if (!g) return ['你还没有帮派'];
    if (p.attrs.money < 50) return ['银两不足（需 50）'];
    p.attrs.money -= 50; g.exp += 50; p.donate = (p.donate || 0) + 50;
    if (g.exp >= g.level * 300) { g.exp = 0; g.level++; p.log.push('【帮派升级】' + g.name + ' 升到 ' + g.level + ' 级'); return ['帮派升级到 ' + g.level + ' 级！']; }
    save();
    return ['你为「' + g.name + '」捐了 50 两（经验 ' + g.exp + '/' + g.level * 300 + '）'];
  },

  setJob(p, body) {
    const j = JOBS[body.job];
    if (!j) return ['没有这个职业'];
    p.job = body.job;
    p.artKey = Object.keys(ARTS).find((k) => ARTS[k].job === body.job) || 'basic_sword';
    p.mind = p.mind || 'hunyuan';
    p.log.push('【转职】' + j.name);
    save();
    return ['你选择了「' + j.name + '」：' + j.desc];
  },
  setArt(p, body) {
    const list = unlockedArts(p).map((a) => a.key);
    if (!list.includes(body.key)) return ['这门武学你还没学会'];
    p.artKey = body.key;
    p.log.push('【武学】改练 ' + ARTS[body.key].name);
    save();
    return ['你现在使用「' + ARTS[body.key].name + '」'];
  },
  setMind(p, body) {
    const list = unlockedMinds(p).map((m) => m.key);
    if (!list.includes(body.key)) return ['这门心法你还没得到'];
    p.mind = body.key;
    p.log.push('【心法】改修 ' + MINDS[body.key].name);
    save();
    return ['你现在修习「' + MINDS[body.key].name + '」'];
  },
  meet(p) {
    const here = PLACES[p.scene] || '江湖';
    npcMove();
    const same = Object.values(db.players).filter((o) => o.token !== p.token
      && (PLACES[o.scene] || '江湖') === here && now() - (o.lastSeen || 0) < 10 * 60 * 1000);
    // 有玩家时 45% 概率遇到玩家，否则遇到本地 NPC
    if (!same.length || Math.random() > 0.45) {
      const list = npcsAt(here);
      // 优先遇见还没见过的 NPC，保证每次的人不一样
      const fresh = list.filter((x) => !(x.met > 0));
      const pool = fresh.length ? fresh : list.slice().sort((a, b) => (a.met || 0) - (b.met || 0)).slice(0, 2);
      const n = pool[Math.floor(Math.random() * pool.length)];
      const enc = NPC.encounterFor(n, p);
      n.met = (n.met || 0) + 1;
      bumpTask(p, 'meet', 1);
      codexAdd(p, 'npcs', n.name);
      p.injected = {
        npcId: n.id, title: enc.title, text: enc.text,
        options: enc.options.map((o) => ({
          text: o.text, eff: o.eff || {},
          battle: o.battle ? Object.assign({ name: n.name, art: 'w_swordsman', win: null, lose: null, reward: { fame: 2, money: 8 } }, o.battle) : undefined,
        })),
      };
      save();
      return ['你遇见了 ' + n.name + '（' + n.trait + '）'];
    }
    const o = same[Math.floor(Math.random() * same.length)];
    p.met = p.met || [];
    if (!p.met.includes(o.uid)) p.met.push(o.uid);
    const oAtk = atkOf(o), oHp = 60 + Math.round(o.attrs.neili * 2 + o.attrs.wuxing);
    p.injected = {
      title: '偶遇 · ' + o.nick, text: [
        '在' + here + '，你遇见了一个同样在赶路的人。',
        '他叫' + o.nick + '，' + (JOBS[o.job] ? JOBS[o.job].name : '江湖人') + '，看起来不好惹。',
      ],
      options: [
        { text: '抱拳行礼，互通姓名', eff: { fame: 4, note: '名望 +4 · 结识了 ' + o.nick }, flags: {} },
        { text: '邀他切磋一场', eff: {}, battle: { name: o.nick, oppUid: o.uid, art: 'w_swordsman', hp: oHp, atk: oAtk, def: 4, fleeOk: true,
            win: null, lose: null, reward: { fame: 8 } } },
        { text: '拔剑，抢他身上的东西', eff: { karma: -6, money: 20, note: '善恶 -6 · 银两 +20' } },
      ],
    };
    save();
    return ['你在' + here + '遇见了 ' + o.nick];
  },
  online(p) {
    const list = Object.values(db.players)
      .filter((o) => now() - (o.lastSeen || 0) < 10 * 60 * 1000)
      .map((o) => ({ nick: o.nick, uid: o.uid, place: PLACES[o.scene] || '江湖',
        job: (JOBS[o.job] || {}).name || '江湖人', neili: o.attrs.neili, fame: o.attrs.fame,
        scene: STORY[o.scene] ? STORY[o.scene].title : o.scene }));
    return list;
  },

  battle(p, body) {
    const b = p.battle;
    if (!b) return ['现在没有战斗'];
    if (b.result) { const out = []; settleBattle(p, b, out); return ['战斗已结束'].concat(out); }
    if (p.frozen) return ['你被封住了'];
    const pl = B2.playerUnit(b);
    if (!pl || !pl.alive) {
      const out = B2.advance(b, { force: true });
      settleBattle(p, b, out);
      return ['你已经倒下'].concat(out);
    }
    const move = body.move || 'attack';
    const out = [];
    const art = artOf(p);
    if (move === 'flee') {
      if (b.canFlee === false) return ['对方堵住了去路，逃不掉'];
      if (Math.random() < 0.6) {
        p.battle = null; save();
        return ['你脱身了'];
      }
      out.push('❌ 逃跑失败');
    } else if (move === 'guard') {
      b.combo = 0;
      pl.guard = true;
      out.push('🛡 你稳住下盘，准备硬接');
    } else {
      const isSkill = move === 'skill';
      const cost = isSkill ? (art.cost || 10) : 0;
      if (isSkill && p.attrs.neili < cost) return ['内力不足（需 ' + cost + '）'];
      if (isSkill) p.attrs.neili -= cost;
      b.combo = Math.min(8, (b.combo || 0) + 1);
      const mult = (isSkill ? (art.mult || 1.8) : 1) * (1 + (b.combo - 1) * 0.06);
      const allFoes = b.units.filter((u) => u.side === 'foe');
      let tgt = allFoes[Number(body.target)];
      if (!tgt || !tgt.alive) tgt = B2.aliveOf(b, 'foe')[0];
      const d = B2.hit(b, pl, tgt, mult);
      pl.energy = Math.min(999, (pl.energy || 0) + (isSkill ? 30 : 20));
      out.push((isSkill ? '⚡ ' + art.name + '：' : '🗡 你出招：') + tgt.name + '  -' + d
        + (b.combo > 1 ? '（连招 ×' + b.combo + '）' : ''));
      if (!tgt.alive) out.push('💀 ' + tgt.name + ' 倒下');
      b.log.push(...out);
    }
    b.pos++;
    B2.advance(b, {}).forEach((l) => out.push(l));
    if (b.result) settleBattle(p, b, out);
    save();
    return out;
  },
  setJob(p, body) {
    const j = JOBS[body.job];
    if (!j) return ['没有这个职业'];
    p.job = body.job;
    p.artKey = Object.keys(ARTS).find((k) => ARTS[k].job === body.job) || 'basic_sword';
    p.mind = p.mind || 'hunyuan';
    p.log.push('【转职】' + j.name);
    save();
    return ['你选择了「' + j.name + '」：' + j.desc];
  },
  setArt(p, body) {
    const list = unlockedArts(p).map((a) => a.key);
    if (!list.includes(body.key)) return ['这门武学你还没学会'];
    p.artKey = body.key;
    p.log.push('【武学】改练 ' + ARTS[body.key].name);
    save();
    return ['你现在使用「' + ARTS[body.key].name + '」'];
  },
  setMind(p, body) {
    const list = unlockedMinds(p).map((m) => m.key);
    if (!list.includes(body.key)) return ['这门心法你还没得到'];
    p.mind = body.key;
    p.log.push('【心法】改修 ' + MINDS[body.key].name);
    save();
    return ['你现在修习「' + MINDS[body.key].name + '」'];
  },
  meet(p) {
    const here = PLACES[p.scene] || '江湖';
    npcMove();
    const same = Object.values(db.players).filter((o) => o.token !== p.token
      && (PLACES[o.scene] || '江湖') === here && now() - (o.lastSeen || 0) < 10 * 60 * 1000);
    // 有玩家时 45% 概率遇到玩家，否则遇到本地 NPC
    if (!same.length || Math.random() > 0.45) {
      const list = npcsAt(here);
      // 优先遇见还没见过的 NPC，保证每次的人不一样
      const fresh = list.filter((x) => !(x.met > 0));
      const pool = fresh.length ? fresh : list.slice().sort((a, b) => (a.met || 0) - (b.met || 0)).slice(0, 2);
      const n = pool[Math.floor(Math.random() * pool.length)];
      const enc = NPC.encounterFor(n, p);
      n.met = (n.met || 0) + 1;
      bumpTask(p, 'meet', 1);
      codexAdd(p, 'npcs', n.name);
      p.injected = {
        npcId: n.id, title: enc.title, text: enc.text,
        options: enc.options.map((o) => ({
          text: o.text, eff: o.eff || {},
          battle: o.battle ? Object.assign({ name: n.name, art: 'w_swordsman', win: null, lose: null, reward: { fame: 2, money: 8 } }, o.battle) : undefined,
        })),
      };
      save();
      return ['你遇见了 ' + n.name + '（' + n.trait + '）'];
    }
    const o = same[Math.floor(Math.random() * same.length)];
    p.met = p.met || [];
    if (!p.met.includes(o.uid)) p.met.push(o.uid);
    const oAtk = atkOf(o), oHp = 60 + Math.round(o.attrs.neili * 2 + o.attrs.wuxing);
    p.injected = {
      title: '偶遇 · ' + o.nick, text: [
        '在' + here + '，你遇见了一个同样在赶路的人。',
        '他叫' + o.nick + '，' + (JOBS[o.job] ? JOBS[o.job].name : '江湖人') + '，看起来不好惹。',
      ],
      options: [
        { text: '抱拳行礼，互通姓名', eff: { fame: 4, note: '名望 +4 · 结识了 ' + o.nick }, flags: {} },
        { text: '邀他切磋一场', eff: {}, battle: { name: o.nick, oppUid: o.uid, art: 'w_swordsman', hp: oHp, atk: oAtk, def: 4, fleeOk: true,
            win: null, lose: null, reward: { fame: 8 } } },
        { text: '拔剑，抢他身上的东西', eff: { karma: -6, money: 20, note: '善恶 -6 · 银两 +20' } },
      ],
    };
    save();
    return ['你在' + here + '遇见了 ' + o.nick];
  },
  online(p) {
    const list = Object.values(db.players)
      .filter((o) => now() - (o.lastSeen || 0) < 10 * 60 * 1000)
      .map((o) => ({ nick: o.nick, uid: o.uid, place: PLACES[o.scene] || '江湖',
        job: (JOBS[o.job] || {}).name || '江湖人', neili: o.attrs.neili, fame: o.attrs.fame,
        scene: STORY[o.scene] ? STORY[o.scene].title : o.scene }));
    return list;
  },

  train(p) {
    if (p.frozen) return ['你被封住了'];
    const L = LOCS[p.loc || 'changan'] || LOCS.changan;
    if (L.type === 'town') return ['城镇里人来人往，静不下心。点「地图」去邙山（野外）或少林（门派）修炼，或服聚气丹。'];
    if (!(p.locs || []).includes(p.loc)) return ['此处不宜修炼'];
    const d = dailyEvent();
    let gain = 3 + Math.floor(Math.random() * 5);
    if (d.key === 'fair') gain = Math.round(gain * 1.5);
    const f = festivalOf();
    if (f.key === 'qingming') gain = Math.round(gain * 1.3);
    const BONUS = {
      shaolin:   { nei: 1.45, hp: -4, note: '（少林内功精纯）' },
      wudang:    { wux: 2,    hp: -3, note: '（武当悟性通明）' },
      emei:      { heal: 8,   hp: -3, note: '（峨眉心气得养）' },
      bloodgate: { nei: 1.3,  hp: -2, note: '（血刀门以杀养气）' },
    }[p.loc] || { hp: -4, note: '' };
    if (BONUS.nei) gain = Math.round(gain * BONUS.nei);
    if (BONUS.wux) p.attrs.wuxing += BONUS.wux;
    if (BONUS.heal) p.attrs.hp = Math.min(999, p.attrs.hp + BONUS.heal);
    p.attrs.neili += gain;
    if (p.attrs.hp > 20) p.attrs.hp = Math.max(1, p.attrs.hp + Math.round((BONUS.hp || -4) * 0.6));
    else gain = Math.max(1, Math.round(gain / 2));
    bumpTask(p, 'train', 1);
    p.log.push('【修炼】内力 +' + gain);
    checkRealm(p);
    save();
    return ['🧘 你在' + L.name + '静坐一夜，内力 +' + gain + BONUS.note
      + (BONUS.wux ? '，悟性 +' + BONUS.wux : '')
      + (BONUS.heal ? '，气血 +' + BONUS.heal : '')];
  },
  trainBatch(p, b) {
    if (p.frozen) return ['你被封住了'];
    const times = Math.min(5, Math.max(1, Number(b.times) || 3));
    const out = [];
    for (let i = 0; i < times; i++) {
      const r = ACTIONS.train(p);
      if (r[0] && (r[0].includes('静不下心') || r[0].includes('不宜'))) { out.push(r[0]); break; }
      out.push(r[0]);
      if (p.attrs.hp < 25) { out.push('气血不足，先歇一歇'); break; }
    }
    return out;
  },
  heal(p) {
    const d0 = dailyEvent();
    const cost = d0.key === 'trade' ? 8 : (p.attrs.hp < 40 ? 8 : 15);
    if (p.attrs.money < cost) return ['银两不足（需 ' + cost + '）'];
    p.attrs.money -= cost;
    bumpTask(p, 'spend', cost);
    const gh = ((p.flags || {}).growth === 'healer') ? 160 : 120;
    p.attrs.hp = Math.min(999, p.attrs.hp + gh);
    p.log.push('【疗伤】气血 +80');
    save();
    return ['💊 你抓了药，气血恢复 ' + gh + ''];
  },
  scout(p) {
    const d1 = dailyEvent();
    const cost2 = d1.key === 'trade' ? 5 : 10;
    if (p.attrs.money < cost2) return ['银两不足（需 ' + cost2 + '）'];
    p.attrs.money -= cost2;
    const hints = {
      romance: '听说有位白衣女侠在洛阳断桥等一个人。',
      sect_champion: '少林木人巷今年又开了。',
      grandmaster: '有人说三卷残卷合在一起，能通神。',
      demonic_qi: '最近夜里，有人看见红眼睛的影子。',
      merchant: '洛阳的漕运盘口空着，等着人接。',
    };
    const missing = Object.keys(hints).filter((k) => !(p.flags || {})[k]);
    const pick = missing.length ? hints[missing[Math.floor(Math.random() * missing.length)]] : '江湖上暂时没什么新消息。';
    bumpTask(p, 'scout', 1);
    p.log.push('【打听】' + pick);
    save();
    return ['👂 ' + pick];
  },
  battleCheck(p) {
    return [p.battle ? '战斗未结束' : '无战斗'];
  },

  choose(p, body) {
    if (p.frozen) return ['你的命数已被封住，暂时无法行动。'];
    if (p.injected) {
      const ins = p.injected;
      const opt = (ins.options || [])[Number(body.idx)];
      if (!opt) return ['无效的选择'];
      if (opt.battle) {
        applyEff(p, opt.eff);
        p.injected = null;
        p.log.push('【' + (ins.title || '插曲') + '】' + opt.text);
        startBattle(p, opt.battle);
        save();
        return ['⚔ 交手开始：' + (opt.battle.name || '对手')];
      }
      applyEff(p, opt.eff);
      p.log.push('【' + (ins.title || '插曲') + '】' + opt.text);
      if (ins.npcId && db.npcs && db.npcs[ins.npcId]) {
        const n = db.npcs[ins.npcId];
        n.att = Math.max(0, Math.min(1, (n.att || .5) + (opt.battle ? -0.2 : 0.1)));
        n.met = (n.met || 0) + 0;
        n.lastSeenBy = p.uid;
      }
      p.injected = null; p.lastSeen = now(); save();
      return [opt.eff && opt.eff.note ? opt.eff.note : '此事已了'];
    }
    if (p.battle) return ['战斗还没结束'];
    syncVigor(p);
    if (p.vigor < 1) return ['精力不足，歇一会儿再来（每 3 分钟回复 1 点）'];
    p.vigor -= 1;
    const sc = STORY[p.scene];
    if (!sc || sc.ending) return ['故事已经结束，请重新开始'];
    const list = (sc.choices || []).filter((c) => condOk(p, c.cond));
    const c = list[Number(body.idx)];
    if (!c) return ['无效的选择'];
    if (c.backStory) { const saved = p.savedScene; if (saved && STORY[saved]) { p.scene = saved; save(); return ['你回到刚才的地方。']; } return ['没有未了的事']; }
    applyEff(p, c.eff);
    p.choicesMade++;
    bumpTask(p, 'story', 1);
    codexAdd(p, 'scenes', sc.title);
    if (c.battle) {
      p.log.push('【' + (sc.title || '') + '】' + c.text);
      startBattle(p, c.battle);
      return ['⚔ 战斗开始：' + (c.battle.name || '敌人')];
    }
    p.log.push('【' + (sc.title || '') + '】' + c.text);
    if (c.event) {
      const ev = { text: (p.nick + '：' + c.event), by: p.nick, at: now() };
      db.world.lastEvent = ev;
      db.world.events = [ev, ...(db.world.events || [])].slice(0, 20);
      // 给同地点其他在线玩家投放旁观插曲
      const here = PLACES[p.scene] || '江湖';
      Object.values(db.players).forEach((o) => {
        if (o.token === p.token) return;
        if ((PLACES[o.scene] || '江湖') !== here) return;
        if (now() - (o.lastSeen || 0) > 10 * 60 * 1000) return;
        o.notices.push(ev.text);
        if (!o.injected) o.injected = {
          title: '江湖传闻 · ' + p.nick, text: ['同一处江湖上，出了件大事。', c.event],
          options: [{ text: '记下这件事，继续赶路', eff: { wuxing: 2, note: '悟性 +2' } }],
        };
      });
      log('事件：' + ev.text);
    }
    if (c.next && STORY[c.next]) {
      p.scene = c.next;
      const np = PLACES[c.next] || '江湖';
      // 走过某地即解锁
      syncLocFromScene(p);
      if (DANGER_PLACES.includes(np) && Math.random() < 0.10 && !p.battle) {
        runAmbush(p, np);
      }
      if (/^结局/.test(STORY[c.next].title || '')) p.ending = c.next;
    }
    p.lastSeen = now();
    save();
    return [c.eff && c.eff.note ? c.eff.note : '选择已记录'];
  },
  restart(p) {
    const fresh = newPlayer(p.nick);
    Object.assign(p, { scene: 'birth_start', ending: null, attrs: fresh.attrs, items: [], flags: {}, log: [], choicesMade: 0, lastSeen: now() });
    save();
    return ['江湖路远，重新来过。'];
  },
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = req.method === 'POST' ? await readBody(req) : {};

  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    const p = path.join(ROOT, 'public', path.normalize(file).replace(/^(\.\.[\/\\])+/, ''));
    return fs.readFile(p, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  }

  if (url.pathname === '/api/health') return json(res, 200, { ok: true, players: Object.keys(db.players).length });

  if (url.pathname.startsWith('/api/gm/')) {
    const key = body.key || url.searchParams.get('key');
    if (key !== ADMIN_KEY) return json(res, 403, { error: 'GM 密码不对' });
    const op = url.pathname.replace('/api/gm/', '');
    if (op === 'players') return json(res, 200, Object.values(db.players).map((p) => ({
      uid: p.uid, nick: p.nick, scene: p.scene, attrs: p.attrs, account: p.account, choices: p.choicesMade, ending: p.ending,
    })));
    if (op === 'set') {
      const t = body.uid ? Object.values(db.players).find((x) => x.uid === body.uid) : db.players[body.token];
      if (!t) return json(res, 404, { error: '没这个玩家' });
      if (body.attr && body.attr === 'vigor') { t.vigor = Math.max(0, Math.min(t.vigorMax || 30, body.value)); }
      else if (body.attr && typeof body.value === 'number') t.attrs[body.attr] = body.value;
      if (body.scene && STORY[body.scene]) { t.scene = body.scene; t.ending = /^结局/.test(STORY[body.scene].title || '') ? body.scene : null; syncLocFromScene(t); }
      if (body.flags && typeof body.flags === 'object') Object.assign(t.flags, body.flags);
      if (body.items && Array.isArray(body.items)) t.items = Array.from(new Set([...(t.items || []), ...body.items]));
      if (body.logText) t.log.push('【天机】' + body.logText);
      if (body.forceEnding && STORY[body.forceEnding]) {
        t.scene = body.forceEnding; t.ending = body.forceEnding;
        t.log.push('【天机】命数已定：' + STORY[body.forceEnding].title);
      }
      log('GM 干预了 ' + t.nick + (body.scene ? ' 的走向 → ' + body.scene : ''));
      save();
      return json(res, 200, { ok: true, state: publicState(t) });
    }
    if (op === 'freeze') {
      const t = body.uid ? Object.values(db.players).find((x) => x.uid === body.uid) : db.players[body.token];
      if (!t) return json(res, 404, { error: '没这个玩家' });
      t.frozen = !!body.on;
      t.log.push('【天机】' + (body.on ? '你的手脚忽然不听使唤了。' : '那股束缚消失了。'));
      log('GM ' + (body.on ? '冻结' : '解冻') + '了 ' + t.nick); save();
      return json(res, 200, { ok: true, frozen: t.frozen });
    }
    if (op === 'mail') {
      const targets = body.all ? Object.values(db.players)
        : [body.uid ? Object.values(db.players).find((x) => x.uid === body.uid) : null].filter(Boolean);
      if (!targets.length) return json(res, 404, { error: '没有目标玩家' });
      targets.forEach((t) => sendMail(t, { from: body.from || '江湖令', subject: body.subject,
        body: body.body, money: body.money, items: body.items }));
      log('GM 发邮件给 ' + targets.length + ' 人：' + (body.subject || ''));
      save();
      return json(res, 200, { ok: true, count: targets.length });
    }
    if (op === 'notice') {
      db.world.notice = String(body.text || '').slice(0, 120);
      db.world.noticeAt = now();
      Object.values(db.players).forEach((t) => sendMail(t, { from: '江湖公告', subject: '全服公告', body: db.world.notice }));
      log('全服公告：' + db.world.notice); save();
      return json(res, 200, { ok: true });
    }
    if (op === 'inject') {
      const t = body.uid ? Object.values(db.players).find((x) => x.uid === body.uid) : db.players[body.token];
      if (!t) return json(res, 404, { error: '没这个玩家' });
      const opts = (body.options || []).map((o) => ({ text: String(o.text || '……'), eff: o.eff || {} })).slice(0, 4);
      if (!opts.length) return json(res, 400, { error: '至少一个选项' });
      t.injected = { title: String(body.title || '插曲').slice(0, 40), text: (body.text || []).slice(0, 6), options: opts, at: now() };
      log('GM 给 ' + t.nick + ' 投放了插曲：' + t.injected.title); save();
      return json(res, 200, { ok: true });
    }
    if (op === 'mkplayer') {
      const nick = String(body.nick || '测试侠客').slice(0, 12);
      const p = newPlayer(nick + '·' + Math.floor(Math.random() * 90 + 10));
      db.players[p.token] = p;
      log('GM 生成了测试玩家 ' + p.nick); save();
      return json(res, 200, { ok: true, uid: p.uid, nick: p.nick, token: p.token });
    }
    if (op === 'delplayer') {
      const t = body.uid ? Object.values(db.players).find((x) => x.uid === body.uid) : null;
      if (!t) return json(res, 404, { error: '没这个玩家' });
      delete db.players[t.token];
      if (t.account && db.accounts[t.account]) delete db.accounts[t.account];
      log('GM 删除了 ' + t.nick); save();
      return json(res, 200, { ok: true });
    }
    if (op === 'world') {
      return json(res, 200, { notice: db.world.notice || '', at: db.world.noticeAt || 0 });
    }
    if (op === 'detail') {
      const t = body.uid ? Object.values(db.players).find((x) => x.uid === body.uid) : null;
      if (!t) return json(res, 404, { error: '没这个玩家' });
      const sc = STORY[t.scene] || {};
      const choices = (sc.choices || []).map((c) => ({ text: c.text, ok: condOk(t, c.cond),
        cond: c.cond || null, battle: c.battle ? c.battle.name : null }));
      return json(res, 200, {
        nick: t.nick, uid: t.uid, scene: t.scene, title: sc.title || '', art: sc.art || '',
        text: sc.text || [], choices, ending: /^结局/.test(sc.title || ''),
        attrs: t.attrs, items: t.items, flags: t.flags,
        job: (JOBS[t.job] || {}).name || '', artKey: (ARTS[t.artKey] || {}).name || '',
        mind: (MINDS[t.mind] || {}).name || '',
        battle: t.battle ? { name: (t.battle.units || []).filter((u) => u.side === 'foe').map((u) => u.name).join('、'),
          hp: (t.battle.units || []).filter((u) => u.side === 'foe').reduce((n, u) => n + u.hp, 0),
          maxHp: (t.battle.units || []).filter((u) => u.side === 'foe').reduce((n, u) => n + u.maxHp, 0) } : null,
        inject: t.injected ? { title: t.injected.title, options: t.injected.options.map((o) => o.text) } : null,
        frozen: !!t.frozen, place: PLACES[t.scene] || '江湖', log: t.log.slice(-8), choicesMade: t.choicesMade,
      });
    }
    if (op === 'guilds') {
      return json(res, 200, Object.values(db.guilds));
    }
    if (op === 'festival') {
      const f = FESTIVALS.find((x) => x.key === body.festKey);
      if (!f) return json(res, 400, { error: '没有这个节庆' });
      db.world.festival = f; save();
      log('GM 设置了节庆：' + f.name);
      return json(res, 200, { ok: true, festival: f });
    }
    if (op === 'daily') {
      const d = DAILY.find((x) => x.key === body.dailyKey) || DAILY[0];
      db.world.daily = { date: new Date().toISOString().slice(0, 10), key: d.key, name: d.name, desc: d.desc };
      log('GM 设置了今日事件：' + d.name); save();
      return json(res, 200, { ok: true, daily: db.world.daily });
    }
    if (op === 'scenes') {
      return json(res, 200, Object.entries(STORY).map(([id, sc]) => ({ id, title: sc.title, ending: /^结局/.test(sc.title || '') })));
    }
    if (op === 'reset') {
      const t = body.uid ? Object.values(db.players).find((x) => x.uid === body.uid) : db.players[body.token];
      if (!t) return json(res, 404, { error: '没这个玩家' });
      Object.assign(t, { scene: 'birth_start', ending: null, attrs: { hp: 100, neili: 20, wuxing: 10, fame: 0, money: 20, karma: 0 },
        items: [], flags: {}, log: [], choicesMade: 0 });
      log('GM 重置了 ' + t.nick); save();
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'unknown' });
  }

  if (url.pathname === '/api/register') {
    const user = String(body.user || '').trim().toLowerCase();
    const pass = String(body.pass || '');
    const nick = String(body.nick || '').trim().slice(0, 12);
    if (!/^[a-z0-9_]{3,16}$/.test(user)) return json(res, 400, { error: '账号需 3-16 位字母/数字/下划线' });
    if (pass.length < 6) return json(res, 400, { error: '密码至少 6 位' });
    if (db.accounts[user]) return json(res, 400, { error: '该账号已被注册' });
    const salt = crypto.randomBytes(8).toString('hex');
    const p = newPlayer(nick || user);
    p.account = user;
    db.accounts[user] = { user, salt, hash: hashPass(pass, salt), nick: p.nick, token: p.token, created: now() };
    db.players[p.token] = p;
    syncLocFromScene(p);
    sendMail(p, { from:'江湖令', subject:'初入江湖', body:'路远，保重。附薄礼一份，够你在城里吃几顿热饭。',
      money: 80, items: ['金疮药'] });
    log(p.nick + ' 踏入江湖'); save();
    return json(res, 200, { token: p.token, state: publicState(p) });
  }

  if (url.pathname === '/api/login') {
    const user = String(body.user || '').trim().toLowerCase();
    const acc = db.accounts[user];
    if (!acc || acc.hash !== hashPass(String(body.pass || ''), acc.salt)) return json(res, 401, { error: '账号或密码错误' });
    let p = db.players[acc.token];
    if (!p) { p = newPlayer(acc.nick); p.account = user; p.token = acc.token; db.players[p.token] = p; }
    p.lastSeen = now(); save();
    return json(res, 200, { token: p.token, state: publicState(p) });
  }

  const token = url.searchParams.get('token') || body.token;
  const p = db.players[token];

  if (url.pathname === '/api/state') {
    if (!p) return json(res, 401, { error: 'token 无效' });
    p.lastSeen = now();
    return json(res, 200, publicState(p));
  }

  if (url.pathname === '/api/npcs') {
    const place = url.searchParams.get('place') || (p ? PLACES[p.scene] : '江湖');
    return json(res, 200, npcsAt(place).map((n) => ({
      name: n.name, title: n.title, trait: n.trait, purpose: n.purpose,
      purposeText: n.purposeText, met: n.met || 0, mood: n.att < .35 ? '敌视' : n.att > .7 ? '友善' : '平常',
    })));
  }

  if (url.pathname === '/api/guilds') {
    return json(res, 200, Object.values(db.guilds).map((g) => ({
      id: g.id, name: g.name, level: g.level, exp: g.exp, founder: g.founder,
      members: g.members.length, notice: g.notice })));
  }

  if (url.pathname === '/api/rank') {
    const list = Object.values(db.players)
      .map((o) => ({ nick: o.nick, uid: o.uid, pvp: o.pvp || { wins: 0, losses: 0, points: 100 },
        job: (JOBS[o.job] || {}).name || '江湖人', place: PLACES[o.scene] || '江湖' }))
      .sort((x, y) => y.pvp.points - x.pvp.points).slice(0, 20);
    return json(res, 200, list);
  }

  if (url.pathname === '/api/chat') {
    if (!p) return json(res, 401, { error: 'token 无效' });
    const since = Number(url.searchParams.get('since') || 0);
    const to = url.searchParams.get('to') || '';
    let list;
    if (to) {
      const k = dmKey(p.uid, to);
      list = (db.dm[k] || []).filter((m) => m.at > since);
    } else {
      list = (db.chat || []).filter((m) => m.at > since);
    }
    return json(res, 200, { now: now(), msgs: list.slice(-60) });
  }

  if (url.pathname === '/api/friends') {
    if (!p) return json(res, 401, { error: 'token 无效' });
    const list = (p.friends || []).map((uid) => Object.values(db.players).find((x) => x.uid === uid))
      .filter(Boolean).map((f) => ({
        uid: f.uid, nick: f.nick, online: now() - (f.lastSeen || 0) < 5 * 60 * 1000,
        place: PLACES[f.scene] || '江湖', scene: STORY[f.scene] ? STORY[f.scene].title : '',
      }));
    return json(res, 200, list);
  }

  if (url.pathname === '/api/online') {
    if (!p) return json(res, 401, { error: 'token 无效' });
    const list = Object.values(db.players)
      .filter((o) => now() - (o.lastSeen || 0) < 10 * 60 * 1000)
      .map((o) => ({ nick: o.nick, uid: o.uid, place: PLACES[o.scene] || '江湖',
        job: (JOBS[o.job] || {}).name || '江湖人', neili: o.attrs.neili, fame: o.attrs.fame,
        scene: STORY[o.scene] ? STORY[o.scene].title : o.scene, self: o.token === p.token }));
    return json(res, 200, list);
  }

  if (url.pathname === '/api/action') {
    if (!p) return json(res, 401, { error: 'token 无效' });
    const fn = ACTIONS[body.type];
    if (!fn) return json(res, 400, { error: 'unknown action' });
    let msgs;
    try { msgs = fn(p, body) || []; }
    catch (err) { console.error('action error', body.type, err); return json(res, 500, { error: '动作执行失败：' + err.message }); }
    return json(res, 200, { ok: true, msgs, state: publicState(p) });
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => console.log('wuxia up on ' + PORT));
