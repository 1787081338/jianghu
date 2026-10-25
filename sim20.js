const B = 'http://127.0.0.1:8900';
const GM = 'gm-7f3a91c2';
const j = async (p, b) => {
  const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  try { return await r.json(); } catch (e) { return { error: 'bad json' }; }
};
const st = async (t) => (await fetch(B + '/api/state?token=' + t)).json();
const act = async (t, type, extra) => j('/api/action', Object.assign({ token: t, type }, extra || {}));
const gm = async (body) => j('/api/gm/set', Object.assign({ key: GM }, body));

const PLAYERS = [
  ['速通党', async (t, s, i) => act(t, 'choose', { idx: s.scene.choices.length - 1 })],
  ['首选项党', async (t, s) => act(t, 'choose', { idx: 0 })],
  ['中间派', async (t, s) => act(t, 'choose', { idx: Math.floor(s.scene.choices.length / 2) })],
  ['随机党', async (t, s) => act(t, 'choose', { idx: Math.floor(Math.random() * s.scene.choices.length) })],
  ['修练流', async (t, s) => (s.locInfo.type === 'town' ? act(t, 'travel', { id: 'shaolin' }) : act(t, 'train'))],
  ['刷怪流', async (t, s) => {
    if (s.locInfo.type !== 'wild') return act(t, 'travel', { id: s.locs.find(l => l.type === 'wild' && l.unlocked)?.id || 'mangshan' });
    if (s.battle) return act(t, 'battle', { move: 'attack', target: 0 });
    return act(t, 'fight');
  }],
  ['打金流', async (t, s) => (s.hour >= 6 && s.hour < 10 ? act(t, 'work', { job: 'serve' }) : act(t, 'workBatch', { job: 'herb', times: 3 }))],
  ['委托流', async (t, s) => act(t, 'board')],
  ['领赏流', async (t, s) => act(t, 'claim')],
  ['锻造流', async (t, s) => {
    if (s.me.attrs.money < 100) return act(t, 'workBatch', { job: 'escort', times: 2 });
    if (s.gearBag.length) return act(t, 'equipGear', { idx: 0 });
    return act(t, 'forge', { slot: 'weapon' });
  }],
  ['强化流', async (t, s) => {
    if (!s.gear.weapon) return a.money >= 20 ? act(t, 'forge', { slot: 'weapon' }) : act(t, 'choose', { idx: 0 });
    return act(t, 'enhanceGear', { slot: 'weapon' });
  }],
  ['心法流', async (t, s) => act(t, 'setMind', { key: s.minds[Math.floor(Math.random() * s.minds.length)].key })],
  ['社交流', async (t, s) => (s.npcsHere.length ? act(t, 'talkNpc', { id: s.npcsHere[0].id }) : act(t, 'meet'))],
  ['委托NPC流', async (t, s) => (s.npcsHere.length ? act(t, 'npcQuest', { id: s.npcsHere[0].id }) : act(t, 'meet'))],
  ['探路流', async (t, s) => {
    const locked = s.locs.filter(l => !l.unlocked);
    if (locked.length && Math.random() < 0.4) return act(t, 'travel', { id: s.locs.filter(l => l.unlocked)[Math.floor(Math.random() * s.locs.filter(l => l.unlocked).length)].id });
    return act(t, 'scout');
  }],
  ['签到流', async (t, s) => act(t, 'signIn')],
  ['邮件流', async (t, s) => act(t, 'mailClaimAll')],
  ['门派流', async (t, s) => act(t, 'sectTask')],
  ['竞技流', async (t, s) => act(t, 'pvpFight')],
  ['真人流', async (t, s) => {
    const a = s.me.attrs;
    if (s.battle) return act(t, 'battle', { move: 'attack', target: 0 });
    if (a.hp < 60) return a.money >= 15 ? act(t, 'heal') : act(t, 'meditate');
    if (s.locInfo.type === 'town' && s.scene.choices.length) return act(t, 'choose', { idx: 0 });
    if (!s.gear.weapon) return a.money >= 20 ? act(t, 'forge', { slot: 'weapon' }) : act(t, 'choose', { idx: 0 });
    if (a.neili < 120) return act(t, 'trainBatch', { times: 3 });
    return act(t, 'choose', { idx: 0 });
  }],
  ['老手流', async (t, s) => {
    const a = s.me.attrs;
    if (s.battle) return act(t, 'battle', { move: 'attack', target: 0 });
    if (a.hp < 80) return a.money >= 15 ? act(t, 'heal') : act(t, 'meditate');
    if (s.gearBag.length) return act(t, 'equipGear', { idx: 0 });
    if (s.gear.weapon && (s.gearLv.weapon || 0) < 3 && a.money > 200) return act(t, 'enhanceGear', { slot: 'weapon' });
    if (a.money < 100) return act(t, 'workBatch', { job: 'escort', times: 2 });
    if (s.tasks.some(x => x.progress >= x.goal && !x.claimed)) { const tk = s.tasks.find(x => x.progress >= x.goal && !x.claimed); return act(t, 'claim', { id: tk.id }); }
    return act(t, 'choose', { idx: Math.floor(Math.random() * s.scene.choices.length) });
  }],
  ['摆烂流', async () => ({ msgs: ['发呆'] })],
];

const N = 150;
(async () => {
  const rows = [];
  for (const [name, strat] of PLAYERS) {
    const reg = await j('/api/register', { user: 'p20' + Math.random().toString(36).slice(2, 8), pass: 'abc123', nick: name });
    if (!reg.token) { rows.push([name, '注册失败', reg.error]); continue; }
    const t = reg.token;
    let errs = 0, battles = 0, deaths = 0, stuck = 0, lastScene = '', same = 0;
    const seen = new Set();
    for (let i = 0; i < N; i++) {
      let s;
      try { s = await st(t); } catch (e) { errs++; continue; }
      if (s.error) { errs++; break; }
      seen.add(s.scene.title);
      if (s.scene.title === lastScene) { same++; stuck = Math.max(stuck, same); } else { same = 0; lastScene = s.scene.title; }
      if (s.battle) battles++;
      let r;
      if (s.battle) {
        try { r = await act(t, 'battle', { move: 'attack', target: 0 }); } catch (e) { r = { error: 'battle fail' }; }
      } else
      try { r = await strat(t, s, i); } catch (e) { errs++; continue; }
      if (!r) { errs++; continue; }
      if (r.error) errs++;
      const msg = (r.msgs || []).join(' ');
      if (/倒下|重伤|败/.test(msg)) deaths++;
    }
    const f = await st(t);
    rows.push([name, f.scene.title.slice(0, 14), (f.realm ? f.realm.name : '?'), f.me.attrs.neili, f.me.attrs.hp,
      f.me.attrs.money, f.me.attrs.fame, f.vigor.now, battles, deaths, errs, stuck, seen.size]);
  }
  const head = ['玩家', '最终场景', '境界', '内力', '气血', '银两', '名望', '精力', '战', '死', '错', '最多停留', '访问场景'];
  console.log(head.join('|'));
  rows.forEach(r => console.log(r.join('|')));
  const errTotal = rows.reduce((n, r) => n + (r[10] || 0), 0);
  const stuckMax = Math.max(...rows.map(r => r[11] || 0));
  const moneyMax = Math.max(...rows.map(r => r[5] || 0));
  const fameMax = Math.max(...rows.map(r => r[6] || 0));
  console.log('\n汇总: 错误', errTotal, '| 最长连续停留', stuckMax, '| 最高银两', moneyMax, '| 最高名望', fameMax);
})();
