/* 多单位回合制战斗：每人一个头像块 */
const MOBS = [
  { key:'bandit',  name:'山贼',   art:'w_villain',  hp:55,  atk:11, def:2, spd:92 },
  { key:'thug',    name:'地痞',   art:'w_villain',  hp:45,  atk:9,  def:1, spd:96 },
  { key:'blade',   name:'刀客',   art:'w_swordsman',hp:70,  atk:14, def:3, spd:100 },
  { key:'monk_evil',name:'邪僧',  art:'w_monk',     hp:65,  atk:12, def:3, spd:88 },
  { key:'wolf',    name:'野狼',   art:'w_wolf',     hp:40,  atk:10, def:1, spd:112 },
  { key:'assassin',name:'刺客',   art:'w_villain',  hp:60,  atk:16, def:2, spd:118 },
  { key:'soldier', name:'溃兵',   art:'w_sect_blood',hp:80, atk:13, def:4, spd:94 },
];
const COMPANIONS = [
  { id:'su',     name:'苏凝',   art:'w_heroine', flag:'romance',      hp:70, atk:16, def:3, spd:110 },
  { id:'manman', name:'殷小满', art:'w_heroine', flag:'met_manman',   hp:65, atk:13, def:2, spd:104 },
  { id:'veteran',name:'老卒',   art:'w_sect_blood', flag:'buried_camp', hp:90, atk:12, def:5, spd:86 },
];

const rnd = (n) => Math.floor(Math.random() * n);
const pickN = (arr, n) => arr.slice().sort(() => Math.random() - .5).slice(0, n);

function makeUnit(spec, side, idx) {
  return { idx, side, key: spec.key || '', name: spec.name, art: spec.art || '',
    hp: spec.hp, maxHp: spec.hp, atk: spec.atk, def: spec.def, spd: spec.spd,
    av: 10000 / spec.spd, alive: true, energy: 0 };
}

function newBattle(player, flags, opts) {
  const lvl = Math.floor((player.attrs.neili || 20) / 12);
  const count = lvl >= 3 ? 3 : 2;
  const foes = pickN(MOBS, count).map((m, i) => makeUnit({
    ...m, hp: Math.round(m.hp * (1 + lvl * 0.10)), atk: Math.round(m.atk * (0.75 + lvl * 0.08)),
  }, 'foe', i));
  const allies = [makeUnit({ key:'player', name:'你', art: opts && opts.playerArt, hp: player.attrs.hp,
    atk: opts && opts.playerAtk ? opts.playerAtk : 20, def: 4, spd: 100 }, 'ally', 0)];
  (opts && opts.companions || []).forEach((c, i) => allies.push(makeUnit({ ...c }, 'ally', i + 1)));
  return {
    units: allies.concat(foes), log: (opts && opts.log) || ['⚔ 交手开始'],
    round: 1, turn: null, combo: 0, result: null,
    win: opts && opts.win, lose: opts && opts.lose, oppUid: opts && opts.oppUid,
    reward: (opts && opts.reward) || {},
  };
}

function aliveList(b, side) { return b.units.filter((u) => u.side === side && u.alive); }
function pickTurn(b) {
  const alive = b.units.filter((u) => u.alive);
  if (!alive.length) return null;
  alive.sort((a, b2) => a.av - b2.av);
  return alive[0];
}
function advanceAV(b) { b.units.forEach((u) => { if (u.alive) u.av -= 0.0001; }); }

function hit(b, atk, tgt, mult) {
  if (!tgt || !tgt.alive) return 0;
  const base = atk.atk * (mult || 1) * (0.9 + Math.random() * 0.25);
  const dmg = Math.max(1, Math.round(base - (tgt.def || 0) * 0.5));
  tgt.hp = Math.max(0, tgt.hp - dmg);
  if (tgt.hp <= 0) { tgt.alive = false; b.log.push('💀 ' + tgt.name + ' 倒下了'); }
  return dmg;
}

module.exports = { MOBS, COMPANIONS, newBattle, aliveList, pickTurn, hit, makeUnit };
