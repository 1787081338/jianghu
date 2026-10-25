/* 职业 / 武学 / 心法 / 地点 */
const JOBS = {
  swordsman: { name:'剑客', desc:'招式轻灵，出手快，内力消耗低', atk:1.15, hp:1.0, nei:1.0, skill:'疾风三连' },
  blade:     { name:'刀客', desc:'大开大合，攻高血厚', atk:1.3, hp:1.15, nei:0.9, skill:'裂山斩' },
  fist:      { name:'拳师', desc:'外家硬功，防御极高', atk:0.95, hp:1.35, nei:1.1, skill:'崩山拳' },
  poison:    { name:'毒师', desc:'以毒攻心，附带持续伤害', atk:1.05, hp:0.9, nei:1.15, skill:'七草散' },
  assassin:  { name:'刺客', desc:'身法极快，暴击率高', atk:1.25, hp:0.85, nei:1.0, skill:'影袭' },
  monk:      { name:'僧人', desc:'内力深厚，可自愈', atk:1.0, hp:1.2, nei:1.3, skill:'金刚掌' },
};
const ARTS = {
  basic_sword:   { name:'基础剑法', job:'swordsman', mult:1.8, cost:10, desc:'一剑直取咽喉' },
  liemei:        { name:'裂山斩',   job:'blade',     mult:2.2, cost:14, desc:'刀势如裂山' },
  bengshan:      { name:'崩山拳',   job:'fist',      mult:1.9, cost:12, desc:'拳出如山崩' },
  qicao:         { name:'七草散',   job:'poison',    mult:1.6, cost:10, desc:'以毒伤敌，气血持续流失' },
  yingxi:        { name:'影袭',     job:'assassin',  mult:2.4, cost:14, desc:'从影中出手' },
  jingang:       { name:'金刚掌',   job:'monk',      mult:1.7, cost:12, desc:'掌风沉猛' },
  taiji:         { name:'太极剑理', job:'swordsman', mult:2.0, cost:12, desc:'以柔克刚，后发先至', need:'太极剑理' },
  xinjian:       { name:'心剑诀',   job:'swordsman', mult:2.3, cost:16, desc:'剑在心中，念动即至', need:'心剑诀' },
  xuedao:        { name:'血刀刀法', job:'blade',     mult:2.6, cost:18, desc:'伤人先伤己', need:'血刀' },
  shenshi:       { name:'沈氏剑谱', job:'swordsman', mult:2.5, cost:18, desc:'师门最后一剑', need:'沈氏剑谱' },
};
const MINDS = {
  hunyuan: { name:'混元功',   desc:'内力上限与恢复提升', hpMax:30, atk:1.0, need:null },
  ziyang:  { name:'紫阳心法', desc:'气血精纯，攻击更稳', hpMax:60, atk:1.1, need:'残帛心法' },
  taiji_m: { name:'太极心法', desc:'以柔化力，减伤',     hpMax:40, atk:1.05, need:'太极剑理' },
  moqi:    { name:'魔气诀',   desc:'攻击暴涨，反噬气血', hpMax:-30, atk:1.35, need:'魔气' },
};
const PLACES = {
  start:'长安', origin_scholar:'长安', origin_street:'长安', origin_general:'雁门', origin_unknown:'长安',
  ch1_blood:'破庙', ch1_flee:'城外', ch1_fight:'破庙', ch1_teach_sword:'终南山', ch1_teach_poison:'终南山',
  ch2_inn:'洛阳', ch2_escort:'官道', ch2_checkpoint:'关隘', ch2_mountain:'邙山', ch2_ally:'洛阳',
  ch2_cult:'邙山', ch2_inner:'邙山', ch3_tournament:'嵩山', ch3_betray:'洛阳', ch3_truth:'邙山',
  ch4_six:'洛阳', ch4_final:'长安',
  ch5_road:'洛阳渡口', ch5_village:'落雁村', ch5_clue:'落雁村', ch5_hunt:'江湖', ch5_night:'古寺',
  ch5_confront:'破庙', ch5_after:'破庙', ch5_defeat:'雪地', ch5_sect_war:'嵩山',
  sect_choose:'嵩山', sect_shaolin:'少林', sect_wudang:'武当', sect_emei:'峨眉', sect_blood:'血刀门',
  romance_1:'洛阳', romance_2:'剑冢', romance_3:'长亭', manual_1:'终南山', manual_2:'终南山',
  merchant_1:'洛阳', merchant_2:'洛阳',
};
module.exports = { JOBS, ARTS, MINDS, PLACES };
