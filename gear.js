/* 装备与每日事件 */
const GEAR_SLOTS = { weapon:'兵器', armor:'护甲', accessory:'随身' };
const GEAR_TYPES = {
  weapon:   [['铁剑',6,0],['雁翎刀',9,0],['青锋剑',13,0],['断魂枪',18,0],['玄铁重剑',26,0]],
  armor:    [['粗布衣',0,20],['皮甲',0,40],['锁子甲',0,70],['玄铁甲',0,110],['金丝软甲',0,170]],
  accessory:[['平安符',3,15],['青玉坠',6,30],['玄阴令',12,60],['龙纹佩',20,100]],
};
const DAILY = [
  { key:'blood',  name:'血雨腥风', desc:'江湖厮杀四起，敌人攻击 +25%，但战利品翻倍' },
  { key:'fair',   name:'武林盛会', desc:'八方来客，修炼所得提升 50%' },
  { key:'mist',   name:'大雾封山', desc:'视线受阻，躲避变得容易（逃跑成功率 +25%）' },
  { key:'trade',  name:'漕运开市', desc:'商会云集，疗伤与打听花费减半' },
  { key:'quiet',  name:'风平浪静', desc:'无事发生。适合静心修炼' },
];
module.exports = { GEAR_SLOTS, GEAR_TYPES, DAILY };
