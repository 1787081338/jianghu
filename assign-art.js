/* 按内容分配插图：规则优先 + 使用次数均衡 + 避免相邻重复 */
const fs = require('fs');
const path = require('path');
const { STORY } = require('./story.js');

const POOL = [
  'w_sc_winter_road','w_sc_temple_night','w_sc_forest_path','w_sc_river_dock',
  'w_sc_sect_hall','w_sc_court_hall','w_sc_city_wall','w_sc_prison',
  'w_sc_cliff','w_sc_grave','w_sc_inn_room','w_sc_market',
  'w_sc_mountain_pass','w_sc_battlefield','w_sc_snow_village','w_sc_sword_forest',
  'w_loc_changan','w_loc_luoyang','w_loc_mangshan','w_loc_luoyan','w_loc_yanmen','w_loc_swordtomb',
  'w_sect_shaolin','w_sect_wudang','w_sect_emei','w_sect_blood',
  'w_snow_city','w_river_port','w_ruined_temple','w_bamboo_hut','w_inn','w_songshan',
  'w_cult_hall','w_sword_grave','w_villain','w_heroine','w_swordsman','w_monk','w_taoist',
];
const exists = (a) => fs.existsSync(path.join('public/art/png', a + '.png'));
const valid = POOL.filter(exists);

const RULES = [
  [/少林/, ['w_sect_shaolin','w_sc_sect_hall','w_monk']],
  [/武当/, ['w_sect_wudang','w_sc_sect_hall','w_taoist']],
  [/峨眉/, ['w_sect_emei','w_sc_sect_hall','w_heroine']],
  [/血刀/, ['w_sect_blood','w_sc_cliff']],
  [/门派|入门|试炼|早课|对练|门户|掌教|差事/, ['w_sc_sect_hall','w_sc_forest_path']],
  [/雁门|关外|三堡|烽燧|北境|边军|旧部/, ['w_loc_yanmen','w_sc_mountain_pass','w_sc_battlefield']],
  [/渡口|码头|漕运|船|江边|河|水/, ['w_sc_river_dock','w_loc_luoyang']],
  [/剑冢|冢|铸剑/, ['w_sc_sword_forest','w_sword_grave']],
  [/坟|碑|墓地|埋/, ['w_sc_grave','w_loc_yanmen']],
  [/牢|狱|囚|柴房/, ['w_sc_prison','w_sc_temple_night']],
  [/宫|殿|朝堂|遗诏|帘|御/, ['w_sc_court_hall','w_loc_changan']],
  [/庙|观|寺|僧|道观|香/, ['w_sc_temple_night','w_ruined_temple','w_monk']],
  [/客栈|酒|醉|客房|住店|半壶/, ['w_sc_inn_room','w_inn']],
  [/市集|西市|赌|当铺|药铺|摊|鬼市/, ['w_sc_market','w_sc_inn_room']],
  [/崖|绝壁|栈道/, ['w_sc_cliff','w_sc_mountain_pass']],
  [/战|交手|血|厮杀|夜袭|伏击|杀|追兵/, ['w_sc_battlefield','w_villain']],
  [/村|乡|落雁/, ['w_sc_snow_village','w_loc_luoyan']],
  [/夜|星|月/, ['w_sc_temple_night','w_snow_city']],
  [/山|林|竹|径|峰/, ['w_sc_forest_path','w_bamboo_hut']],
  [/城|街|长安|洛阳|城门|坊|关/, ['w_sc_city_wall','w_loc_changan','w_loc_luoyang']],
  [/雪|冬|寒|冷/, ['w_sc_winter_road','w_snow_city']],
  [/她|姑娘|苏凝|殷小满|女/, ['w_heroine']],
  [/教主|魔|邪|阴/, ['w_villain','w_cult_hall']],
  [/序|前传|出生|童年|少年/, ['w_sc_inn_room','w_loc_changan']],
];

const OVERRIDES = {
  start: 'w_sc_winter_road', birth_start: 'w_sc_winter_road', birth_child: 'w_bamboo_hut',
  birth_youth: 'w_sc_market', birth_teen: 'w_bamboo_hut', birth_sixteen: 'w_sc_winter_road',
  origin_scholar: 'w_sc_inn_room', origin_street: 'w_sc_market', origin_general: 'w_sc_mountain_pass',
  origin_unknown: 'w_sc_temple_night', free_roam: 'w_loc_luoyang',
  daily_inn: 'w_inn', daily_inn_talk: 'w_inn', daily_teahouse: 'w_sc_inn_room', daily_tale: 'w_sc_inn_room',
  daily_market: 'w_sc_market', daily_girl: 'w_sc_city_wall', daily_gamble: 'w_sc_market',
  daily_teahouse_gamble: 'w_sc_market', daily_river: 'w_sc_river_dock', daily_river_talk: 'w_sc_river_dock',
  daily_temple: 'w_sc_temple_night', daily_monk: 'w_monk', daily_pawnshop: 'w_sc_market',
  daily_clinic: 'w_sc_market', daily_night: 'w_loc_changan', daily_nightmarket: 'w_sc_market',
  daily_armory: 'w_sc_sect_hall', daily_brothel: 'w_sc_inn_room', daily_singer: 'w_sc_inn_room',
  daily_sect: 'w_sc_sect_hall', daily_sect_drill: 'w_sc_sect_hall',
  ch17_start: 'w_loc_yanmen', ch17_stone: 'w_sc_grave', ch17_build: 'w_sc_grave',
  end_king: 'w_songshan', end_hermit: 'w_bamboo_hut', end_love: 'w_sc_river_dock',
  end_merchant: 'w_loc_luoyang', end_martyr: 'w_sc_battlefield', end_official: 'w_sc_court_hall',
};
const used = {};
const assign = {};
let prev = null;
Object.keys(STORY).forEach((id) => {
  const sc = STORY[id];
  const text = (sc.title || '') + ' ' + (sc.text || []).join(' ');
  let cands = OVERRIDES[id] ? [OVERRIDES[id]].filter(exists) : null;
  for (const [re, list] of (cands ? [] : RULES)) {
    if (re.test(text)) { cands = list.filter(exists); break; }
  }
  if (!cands || !cands.length) cands = valid;
  // 在候选里挑用得最少的，且不与上一个相同
  const pool2 = cands.filter((a) => a !== prev);
  const list = pool2.length ? pool2 : cands;
  list.sort((a, b) => (used[a] || 0) - (used[b] || 0));
  const pick = list[0];
  assign[id] = pick;
  used[pick] = (used[pick] || 0) + 1;
  prev = pick;
});

let src = fs.readFileSync('story.js', 'utf8');
let changed = 0;
Object.entries(assign).forEach(([id, art]) => {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp("(\\n  " + esc + ": \\{[\\s\\S]*?art: ')([^']+)(')");
  src = src.replace(re, (m, p1, old, p3) => { if (old !== art) { changed++; return p1 + art + p3; } return m; });
});
fs.writeFileSync('story.js', src);
const dist = {};
Object.values(assign).forEach((a) => (dist[a] = (dist[a] || 0) + 1));
console.log('图池', valid.length, '| 场景', Object.keys(STORY).length, '| 改动', changed);
console.log('用到种类', Object.keys(dist).length, '| 最多 5 种:', Object.entries(dist).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x.join(':')).join(' '));
