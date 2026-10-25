/* 回合制战斗引擎 v2：每轮按速度排定顺序，逐位行动 */
const MOBS = [
  { key:'bandit',  name:'山贼',   art:'w_villain',   hp:52, atk:10, def:2, spd:92 },
  { key:'thug',    name:'地痞',   art:'w_villain',   hp:44, atk:8,  def:1, spd:96 },
  { key:'blade',   name:'刀客',   art:'w_swordsman', hp:66, atk:13, def:3, spd:100 },
  { key:'monk_evil',name:'邪僧',  art:'w_monk',      hp:62, atk:11, def:3, spd:88 },
  { key:'wolf',    name:'野狼',   art:'w_wolf',      hp:38, atk:9,  def:1, spd:112 },
  { key:'assassin',name:'刺客',   art:'w_villain',   hp:56, atk:15, def:2, spd:118 },
  { key:'soldier', name:'溃兵',   art:'w_sect_blood',hp:78, atk:12, def:4, spd:94 },
];
const COMPANIONS = [
  { id:'su',      name:'苏凝',   art:'w_heroine',    flag:'romance',      hp:68, atk:15, def:3, spd:110 },
  { id:'manman',  name:'殷小满', art:'w_heroine',    flag:'met_manman',   hp:62, atk:12, def:2, spd:104 },
  { id:'veteran', name:'老卒',   art:'w_sect_blood', flag:'buried_camp',  hp:88, atk:11, def:5, spd:86 },
];
const rnd = (n) => Math.floor(Math.random() * n);
const pickN = (arr, n) => arr.slice().sort(() => Math.random() - .5).slice(0, n);

function mkUnit(spec, side) {
  return { uid: side + '_' + spec.name + '_' + rnd(9999), side, key: spec.key || '',
    name: spec.name, art: spec.art || '', hp: spec.hp, maxHp: spec.hp,
    atk: spec.atk, def: spec.def || 2, spd: spec.spd || 100, alive: true, energy: 0 };
}

function newBattle(player, flags, opts) {
  opts = opts || {};
  const lvl = Math.floor((player.attrs.neili || 20) / 12);
  let foes;
  if (opts.foes && opts.foes.length) {
    foes = opts.foes.map((f) => mkUnit({ key: f.key, name: f.name, art: f.art,
      hp: f.hp, atk: f.atk, def: f.def || 2, spd: f.spd || 100 }, 'foe'));
  } else {
    const count = lvl >= 3 ? 3 : 2;
    const lv = Math.min(8, lvl);
    foes = pickN(MOBS, count).map((m) => mkUnit({ ...m,
      hp: Math.round(m.hp * (1 + lv * 0.10)),
      atk: Math.round(m.atk * (0.78 + lv * 0.07)) }, 'foe'));
  }
  const nei = player.attrs.neili || 20;
  const allies = [mkUnit({ key:'player', name:'你', art:'',
    hp: Math.round(player.attrs.hp * (1 + nei / 1200)),
    atk: Math.round((opts.playerAtk || 20) * (1 + nei / 1500)),
    def: 4 + Math.floor(nei / 80), spd: 100 }, 'ally')];
  (opts.companions || []).forEach((c) => allies.push(mkUnit({ ...c }, 'ally')));
  const b = { units: allies.concat(foes), log: (opts.log || []).slice(),
    round: 1, order: [], pos: 0, waiting: false, result: null,
    win: opts.win || null, lose: opts.lose || null, oppUid: opts.oppUid || null,
    reward: opts.reward || {}, combo: 0, fled: false };
  startRound(b);
  return b;
}

function startRound(b) {
  b.order = b.units.filter((u) => u.alive).sort((x, y) => y.spd - x.spd);
  b.pos = 0;
}

function aliveOf(b, side) { return b.units.filter((u) => u.side === side && u.alive); }
function playerUnit(b) { return b.units.find((u) => u.key === 'player'); }

function hit(b, atk, tgt, mult) {
  if (!tgt || !tgt.alive) return 0;
  const base = atk.atk * (mult || 1) * (0.9 + Math.random() * 0.2);
  const dmg = Math.max(1, Math.round(base - (tgt.def || 0) * 0.6));
  tgt.hp = Math.max(0, tgt.hp - dmg);
  if (tgt.hp <= 0) { tgt.alive = false; }
  return dmg;
}

/* 推进直到轮到玩家，或战斗结束。返回日志行 */
function advance(b, opts) {
  opts = opts || {};
  const out = [];
  let guard = 0;
  while (guard++ < 60) {
    const foes = aliveOf(b, 'foe'), allies = aliveOf(b, 'ally');
    if (!foes.length) { finish(b, true, out); return out; }
    if (!allies.length) { finish(b, false, out); return out; }
    if (b.pos >= b.order.length) {
      b.round++;
      startRound(b);
      if (b._roundNoted !== b.round) { b._roundNoted = b.round; out.push('— 第 ' + b.round + ' 回合 —'); }
      continue;
    }
    const u = b.order[b.pos];
    if (!u || !u.alive) { b.pos++; continue; }
    if (u.key === 'player' && !opts.force) { b.waiting = true; return out; }
    // 自动行动
    const targets = u.side === 'ally' ? aliveOf(b, 'foe') : aliveOf(b, 'ally');
    if (!targets.length) { b.pos++; continue; }
    const tgt = targets[rnd(targets.length)];
    const d = hit(b, u, tgt, 1);
    const line = (u.side === 'foe' ? '🗡 ' : '🤝 ') + u.name + ' → ' + tgt.name + '  ' + d;
    b.log.push(line); out.push(line);
    if (!tgt.alive) { const dl = '💀 ' + tgt.name + ' 倒下'; b.log.push(dl); out.push(dl); }
    b.pos++;
  }
  return out;
}

function finish(b, win, out) {
  b.result = win ? 'win' : 'lose';
  const line = win ? '✅ 战斗胜利' : '☠ 你战败了……';
  b.log.push(line); out.push(line);
}

module.exports = { MOBS, COMPANIONS, newBattle, advance, aliveOf, hit, playerUnit, startRound };
