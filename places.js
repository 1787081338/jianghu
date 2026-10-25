/* 地点系统：城镇 / 门派 / 野外 */
const LOCS = {
  changan:  { name:'长安',   type:'town',   cost:0,  desc:'天子脚下，市井繁华。可买卖、打听、接委托。' },
  luoyang:  { name:'洛阳',   type:'town',   cost:2,  desc:'漕运要冲，客栈赌坊林立。' },
  shaolin:  { name:'少林',   type:'sect',   cost:3,  desc:'武学正宗，木人巷三年一轮。此处修炼内力加成。' },
  wudang:   { name:'武当',   type:'sect',   cost:3,  desc:'云海道门，剑走轻灵。此处修炼悟性加成。' },
  emei:     { name:'峨眉',   type:'sect',   cost:4,  desc:'金顶佛光，心剑合一。此处疗伤效果加成。' },
  bloodgate:{ name:'血刀门', type:'sect',   cost:4,  desc:'黑崖凶地，以杀证道。此处战斗掉落更好。' },
  mangshan: { name:'邙山',   type:'wild',   cost:2,  desc:'荒山野岭，常有剪径之人与野兽出没。' },
  luoyan:   { name:'落雁村', type:'wild',   cost:4,  desc:'焦土与荒坟，风里有股说不清的味。' },
  yanmen:   { name:'雁门',   type:'wild',   cost:6,  desc:'关外风沙，旧营残碑。野兽与残兵游荡。' },
  swordtomb:{ name:'剑冢',   type:'wild',   cost:5,  desc:'断剑如林，雾气常年不散。' },
  ferry:    { name:'洛阳渡口', type:'wild', cost:3,  desc:'漕船往来，夜里不太平。' },
};
const MOBS_BY_LOC = {
  mangshan:  ['山贼','刀客','野狼'],
  luoyan:    ['溃兵','野狼','刺客'],
  yanmen:    ['溃兵','野狼','刀客'],
  swordtomb: ['刺客','山贼'],
  ferry:     ['地痞','刺客','山贼'],
};
/* 常驻 NPC：每个地点固定人物，不会消失 */
const RESIDENTS = {
  changan: [
    { name:'更夫老周', title:'打更人', trait:'怯懦', purpose:'巡夜', art:'w_npc_watchman',
      lines:['三更天，小心火烛……','这城里近年不太平，夜里别乱走。'] },
    { name:'城门校尉', title:'校尉', trait:'侠义', purpose:'守门', art:'w_npc_guard',
      lines:['进城出城，都要验牒。','雁门的事，我听说了。'] },
  ],
  luoyang: [
    { name:'说书先生', title:'说书人', trait:'怪癖', purpose:'开讲', art:'w_npc_storyteller',
      lines:['今日讲雁门，讲一场雪。','客官，听一段？不收钱。'] },
    { name:'客栈老板娘', title:'掌柜', trait:'贪财', purpose:'算账', art:'w_npc_innkeeper',
      lines:['住店三两，吃饭另算。','想要消息？先付茶钱。'] },
  ],
  shaolin: [
    { name:'扫地僧', title:'僧人', trait:'侠义', purpose:'扫地', art:'w_npc_monk',
      lines:['扫地也是修行。','施主，心不静，扫不完这院子。'] },
  ],
  wudang: [
    { name:'守观道人', title:'道人', trait:'侠义', purpose:'守观', art:'w_npc_monk',
      lines:['山中无岁月。','剑练慢了，才叫快。'] },
  ],
  emei: [
    { name:'药铺师太', title:'医者', trait:'侠义', purpose:'行医', art:'w_npc_herbalist',
      lines:['伤在皮肉，好治。','坐下，让我看看脉。'] },
  ],
  bloodgate: [
    { name:'铁匠', title:'锻刀人', trait:'豪爽', purpose:'打铁', art:'w_npc_smith',
      lines:['刀要常磨，人也一样。','血刀门的刀，都是死人手上取下来的。'] },
  ],
  mangshan: [
    { name:'樵夫', title:'山民', trait:'怯懦', purpose:'砍柴', art:'w_npc_watchman',
      lines:['山里……山里有东西。','你、你要进山？别往深处去。'] },
  ],
  luoyan: [
    { name:'守村老人', title:'遗民', trait:'痴情', purpose:'守坟', art:'w_npc_herbalist',
      lines:['这村里的人，都在这儿了。','你要找的人，早死了。'] },
  ],
  yanmen: [
    { name:'守关老兵', title:'老兵', trait:'豪爽', purpose:'守关', art:'w_npc_guard',
      lines:['关上的雪，一年比一年大。','当年这儿站过三千人。'] },
  ],
  swordtomb: [
    { name:'铸剑人', title:'匠人', trait:'怪癖', purpose:'守冢', art:'w_npc_smith',
      lines:['每一把剑都死过一次。','你手里那把，崩口在哪？'] },
  ],
  ferry: [
    { name:'船家', title:'渡夫', trait:'阴鸷', purpose:'撑船', art:'w_npc_watchman',
      lines:['夜里不过河。','船钱先付，人不保证送到。'] },
  ],
};
/* 野外掉落表 */
/* 常驻 NPC 往事（交谈到一定程度可听） */
const RESIDENT_LORE = {
  '更夫老周': '我打了三十年更。从前这条街夜里也有人走，现在没人了。有一年冬天，我在城隍庙前见过一个抱着孩子的男人，孩子一直哭，他拿棉袄把孩子裹了三层。后来那男人死了，孩子不见了。你问我怎么记得？因为那孩子哭的声音，跟我孙儿一样。',
  '城门校尉': '我这身甲是父亲的。他守过雁门，回来时少了半只耳朵。他说他这辈子最怕的不是死，是当年没死成。他临终前还在念“带人走”。我守这道门，守了十二年，从来没让不该进的人进过。',
  '说书先生': '我讲的不是书，是活人的嘴。三十年前我也是个跑江湖的，跟人打赌输了，断了一条腿，只能靠一张嘴吃饭。这城里的人爱听雁门，我就天天讲。讲多了，我自己都信了。',
  '客栈老板娘': '这店是我男人留下的。他说做买卖得和气，可他自己脾气最坏，跟人吵了三回架，第三回就没回来。我一个人撑了七年。这七年里，见过的人比一辈子都多，能记住的没几个。',
  '扫地僧': '我扫了四十年地。四十年里，来求过签的人用碗装都装不完。有人求富贵，有人求功名。有一个年轻人跪了三天，只求一句“我爹不是反贼”。我告诉他，佛不管这个。他没听，走了。后来听说他死在雁门。',
  '守观道人': '这山上的松树，是我师父种的。他种的时候说，松树长得慢，人也长得慢。他等不到成材，就让我等。我等了三十年，树成材了，我却不会用。',
  '药铺师太': '我原是宫里的人，后来出了事，剪了头发。在这山上开了药铺，替人看病。看了三十年，治好的没记几个，治死的倒都记得。',
  '铁匠': '血刀门的刀，十把有九把是从死人手里取下来的。我打铁打了二十五年，最怕的不是刀不好，是刀太好。刀太好，人就舍不得收。',
  '樵夫': '这山里从前有户人家，男人上山打猎，女人在家纺线。后来男人没回来，女人就天天站在山口等。等了十年，等到头发全白。我来砍柴，常看见她。',
  '守村老人': '这村子里原先有二百多口人。现在剩我一个。我不想走，走了，就没人记得这里从前有人。',
  '守关老兵': '我在这关上守了三十一年。三十一年里，关换了三回主人，我没换。有人说我傻，我说关在人在，人不在关也在，我守的是个名分。',
  '铸剑人': '这一冢的剑，没有一把是我打的。我只是替它们守着。剑是有脾气的，埋久了会记得自己杀过谁。夜里风大的时候，你听得见它们说话。',
  '船家': '这条河，我撑了四十年。四十年里，我渡活人，也渡死人。夜里我不过河，不是怕水，是怕水上有人叫我。',
};
/* NPC 个人委托：kind = visit（再来找我）/ explore（去某处探一次）/ fight（赢一场）/ pay（给钱） */
const RESIDENT_QUESTS = {
  '更夫老周': { kind:'explore', task:'替我去城西破庙看一眼，那地方夜里总有人影。', reward:{ money:40, fame:3 } },
  '城门校尉': { kind:'fight', task:'城外有伙人冒充差役，你去替我教训一顿。', reward:{ money:60, fame:6 } },
  '说书先生': { kind:'visit', task:'我有一段书，缺个结尾。你再来一次，我把后面讲给你听。', reward:{ wuxing:6, money:20 } },
  '客栈老板娘': { kind:'pay', task:'店里有笔旧账收不回来，你替我垫五两，我记你这份情。', reward:{ fame:5, money:30 }, cost:5 },
  '扫地僧': { kind:'visit', task:'明日此时，你再来一趟。有句话，我想单独同你说。', reward:{ wuxing:8 } },
  '药铺师太': { kind:'explore', task:'后山崖下有几味药，你敢不敢去采？', reward:{ money:35, hp:10 } },
  '铁匠': { kind:'fight', task:'山道上有个使刀的后生，总来找我比试。你去替我挡一回。', reward:{ money:50, neili:4 } },
  '樵夫': { kind:'explore', task:'我柴刀落山里了，你替我去找找。', reward:{ money:25, karma:4 } },
  '守村老人': { kind:'visit', task:'你下回来，帮我一起把那些坟再添一遍土。', reward:{ karma:8, fame:4 } },
  '守关老兵': { kind:'visit', task:'你明日再来，我把当年守关的名册给你看。', reward:{ wuxing:6, fame:5 } },
  '铸剑人': { kind:'fight', task:'冢里夜里有响动，你去把那东西赶走。', reward:{ money:45, neili:5 } },
  '船家': { kind:'explore', task:'河湾里沉了只箱子，你敢下水去看看么？', reward:{ money:55 } },
};
const LOOT_BY_LOC = {
  mangshan:  { items:['山货','旧兵器'], gear:['weapon'], money:[10,25] },
  luoyan:    { items:['无名毒粉','密信残页'], gear:['accessory'], money:[5,15] },
  yanmen:    { items:['破损甲片','干粮'], gear:['armor'], money:[15,35] },
  swordtomb: { items:['断剑','旧兵器'], gear:['weapon'], money:[20,45] },
  ferry:     { items:['碎银袋','干粮'], gear:['accessory'], money:[25,50] },
};
module.exports = { LOCS, MOBS_BY_LOC, RESIDENTS, LOOT_BY_LOC, RESIDENT_LORE, RESIDENT_QUESTS };
