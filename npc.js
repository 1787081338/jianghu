/* 程序化江湖 NPC：每个都有自己的性格、目的、记忆 */
const SUR = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'.split('');
const GIVEN = ['无咎','长风','孤鸿','雪衣','青山','十三','不悔','问天','听风','寒山','如是','三千','拂衣','落雁','听雨','残阳','秋声','渡舟','半城','惊蛰'];
const TITLES = ['刀客','剑客','游侠','货郎','琴师','账房','镖师','捕快','道人','医者','说书人','盗贼','掌柜','书生','刺客'];
const TRAITS = [
  { k:'豪爽', a:.9, d:'大笑起来，拍着你的肩膀' },
  { k:'阴鸷', a:.2, d:'眼神在你身上停了很久' },
  { k:'痴情', a:.6, d:'说话时总望着远处' },
  { k:'贪财', a:.4, d:'目光在你腰间钱袋上转了转' },
  { k:'怪癖', a:.5, d:'忽然自顾自地笑了一声' },
  { k:'侠义', a:.95, d:'拱手行礼，站得笔直' },
  { k:'怯懦', a:.35, d:'说话时不停往身后看' },
];
const PURPOSES = [
  { k:'寻仇', d:'找一个姓沈的人' },
  { k:'押镖', d:'护一批货去洛阳' },
  { k:'访友', d:'去终南山会一位故人' },
  { k:'夺宝', d:'听说某处埋着一件兵器' },
  { k:'求医', d:'身上中了毒，想找个郎中' },
  { k:'寻人', d:'找一个十六年前失散的孩子' },
  { k:'赶考', d:'进京赴一场会试' },
  { k:'逃命', d:'身后有人在追' },
];
const MALE_ART = ['w_npc_m1','w_npc_m2','w_npc_m3','w_npc_m4','w_npc_m5','w_npc_m6'];
const FEMALE_ART = ['w_npc_f1','w_npc_f2','w_npc_f3','w_npc_f4','w_npc_f5','w_npc_f6'];
const FEMALE_TITLES = ['琴师','医者','女侠','道姑','村女','掌柜'];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (n) => Math.floor(Math.random() * n);

function genNpc(place) {
  const trait = rnd(TRAITS);
  const purpose = rnd(PURPOSES);
  const title = rnd(TITLES);
  const female = FEMALE_TITLES.includes(title) || Math.random() < 0.28;
  const art = female ? rnd(FEMALE_ART) : rnd(MALE_ART);
  return {
    id: 'n' + Date.now().toString(36) + ri(999),
    name: rnd(SUR) + rnd(GIVEN),
    title: title, female, art,
    trait: trait.k, att: trait.a,
    purpose: purpose.k, purposeText: purpose.d,
    place, hp: 50 + ri(60), atk: 8 + ri(14),
    met: 0, mood: 'neutral', created: Date.now(),
  };
}

/* 依据性格/目的/记忆，生成一次独一无二的相遇 */
function encounterFor(n, p) {
  const mood = n.met === 0 ? 'first' : (n.att < .35 ? 'hostile' : 'familiar');
  const opts = [];
  const intro = [
    '在' + n.place + '，你碰上一个' + n.title + '。',
    '他自称' + n.name + '，' + (n.met ? '你们似乎见过' : '看你的眼神带着几分打量') + '。',
    '“' + (n.trait === '阴鸷' ? '……让开。' : n.trait === '豪爽' ? '哈哈，这位朋友面善！' : '兄台，借问一句。') + '”',
  ];
  if (mood === 'hostile') {
    intro.push('他的手下意识地按在了兵器上——上次的账，还没算。');
    opts.push({ text: '先下手为强', battle: { name: n.name, hp: n.hp, atk: n.atk, def: 2, fleeOk: true } });
    opts.push({ text: '抱拳致歉，转身走开', eff: { karma: 4 } });
    return { title: '旧怨 · ' + n.name, text: intro, options: opts, mood };
  }
  // 按性格给 2~3 个不同选项
  const t = n.trait;
  if (t === '豪爽' || t === '侠义') {
    intro.push('“相逢即是有缘，' + (n.purpose === '押镖' ? '我这趟镖缺个帮手' : '一起喝一碗？') + '”');
    opts.push({ text: '与他同饮一碗', eff: { hp: 12, fame: 4, note: '气血 +12 · 名望 +4' } });
    opts.push({ text: '问他要办什么事', eff: { wuxing: 6, note: '悟性 +6' }, next: 'npc_errand' });
    opts.push({ text: '道谢后告辞', eff: {} });
  } else if (t === '贪财') {
    intro.push('“这位爷，' + (n.purpose === '逃命' ? '借二十两救命钱' : '有桩买卖，稳赚') + '。”');
    opts.push({ text: '给他 20 两', eff: { money: -20, fame: 6, note: '银两 -20 · 名望 +6' } });
    opts.push({ text: '把他的手拨开', eff: { karma: -3 }, battle: { name: n.name, hp: n.hp, atk: n.atk, def: 1, fleeOk: true } });
    opts.push({ text: '反过来打听他的底细', eff: { wuxing: 8, money: 15, note: '悟性 +8 · 银两 +15' } });
  } else if (t === '阴鸷') {
    intro.push('他往阴影里退了半步，你听见极轻的机括声。');
    opts.push({ text: '抢在他出手前动手', battle: { name: n.name, hp: n.hp + 20, atk: n.atk + 4, def: 3, fleeOk: false } });
    opts.push({ text: '缓缓后退，离开此处', eff: { wuxing: 5 } });
    opts.push({ text: '开口：“你是玄阴教的人？”', eff: { wuxing: 10, karma: -2, note: '悟性 +10' } });
  } else if (t === '痴情') {
    intro.push('他怀里揣着一封没送出去的信。');
    opts.push({ text: '听他把话说完', eff: { karma: 8, wuxing: 6, note: '善恶 +8 · 悟性 +6' } });
    opts.push({ text: '替他把信送出去', eff: { fame: 6, money: -10, note: '名望 +6 · 银两 -10' } });
    opts.push({ text: '劝他放下', eff: { karma: 3 } });
  } else if (t === '怪癖') {
    intro.push('他忽然问你：“你说，雪落下来的时候，是先白山头还是先白坟头？”');
    opts.push({ text: '认真答他', eff: { wuxing: 10, note: '悟性 +10' } });
    opts.push({ text: '反问他是谁', eff: { wuxing: 6 } });
    opts.push({ text: '不理会，走开', eff: {} });
  } else { // 怯懦
    intro.push('他看你一眼就低下头，手里攥着半张皱掉的纸。');
    opts.push({ text: '问他出了什么事', eff: { karma: 6, wuxing: 4 } });
    opts.push({ text: '给他一点干粮', eff: { karma: 8, money: -5 } });
    opts.push({ text: '抢过那张纸看看', eff: { karma: -8, wuxing: 8, items: ['半张图纸'] } });
  }
  return { title: '偶遇 · ' + n.name, text: intro, options: opts, mood };
}

module.exports = { genNpc, encounterFor, TRAITS, PURPOSES };
