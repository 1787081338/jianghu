const fs=require('fs'), path=require('path');
const payload=JSON.parse(fs.readFileSync(path.join(process.env.HOME,'tunnel/tmp/story_payload.json'),'utf8'));
const DATA=JSON.stringify(payload);
const html=`<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>江湖行 · 离线版</title>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:radial-gradient(90% 60% at 50% 0%,#141a22 0%,#0a0c10 60%,#06070a 100%);
  color:#d9cdb2;font-family:"Songti SC","Noto Serif CJK SC",serif;min-height:100vh}
.wrap{max-width:640px;margin:0 auto;padding:14px 14px 90px}
.hdr{display:flex;align-items:center;gap:10px;padding:8px 0 10px;border-bottom:1px solid #23261f}
.seal{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-size:17px;font-weight:700;
  background:linear-gradient(160deg,#7a2f24,#3a1510);border:1px solid #8a5a2e;color:#f5e3bd}
.hdr b{font-size:15px;color:#f0dfb8}.hdr span{font-family:system-ui;font-size:10.5px;color:#7d8794}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}
.stats div{background:rgba(255,255,255,.03);border:1px solid #2b2721;border-radius:9px;padding:7px 4px;text-align:center}
.stats i{display:block;font-style:normal;font-family:system-ui;font-size:9.5px;color:#8b8471}
.stats b{display:block;font-size:14px;color:#e8d9b5;margin-top:2px}
.title{font-size:17px;color:#f0dfb8;margin:16px 0 10px;letter-spacing:2px}
.text p{font-size:15px;line-height:2.05;margin:0 0 12px;color:#ddd0b4}
.ch{display:block;width:100%;text-align:left;margin:9px 0;padding:13px 14px;border-radius:11px;
  border:1px solid #3a3326;background:linear-gradient(180deg,#1b1a16,#12110d);color:#e6d8bb;
  font-family:inherit;font-size:14.5px;line-height:1.6}
.ch:active{background:#241f16;border-color:#6b5222}
.ch small{display:block;margin-top:4px;font-family:system-ui;font-size:10.5px;color:#8b8471}
.log{margin-top:14px;font-family:system-ui;font-size:11.5px;color:#8b8471;line-height:1.8}
.bar{display:flex;gap:8px;margin-top:10px}
.btn{flex:1;padding:10px;border-radius:9px;border:1px solid #4a3d2a;background:#171510;color:#d6c9a8;
  font-family:system-ui;font-size:12px}
.btn.pri{background:linear-gradient(180deg,#e6c88a,#b08a3c);color:#2a1e08;border-color:#6b5222;font-weight:700}
.over{position:fixed;inset:0;background:rgba(6,6,8,.96);display:flex;flex-direction:column;
  align-items:center;justify-content:center;padding:24px;text-align:center;z-index:50}
.over h2{font-size:22px;letter-spacing:6px;color:#f0dfb8;margin:0 0 10px}
.over p{font-family:system-ui;font-size:12px;color:#8b8471;line-height:1.9}
</style></head>
<body>
<div class="wrap">
  <div class="hdr"><div class="seal" id="seal">侠</div>
    <div><b id="who">无名侠客</b><br><span id="sub">江湖 · 离线版</span></div></div>
  <div class="stats" id="stats"></div>
  <div class="title" id="title"></div>
  <div class="text" id="text"></div>
  <div id="choices"></div>
  <div class="log" id="log"></div>
  <div class="bar"><button class="btn" id="saveBtn">保存到本地</button><button class="btn" id="resetBtn">重新开始</button></div>
</div>
<div class="over" id="over" style="display:none">
  <h2>终 章</h2><p id="overText">此局已了。</p>
  <button class="btn pri" style="margin-top:18px;padding:12px 26px" onclick="location.reload()">重入江湖</button>
</div>
<script>
const DATA=${DATA};
const STORY=DATA.story, JOBS=DATA.jobs, ARTS=DATA.arts, MINDS=DATA.minds;
const SAVEKEY='wuxia_offline_v1';
function fresh(){return{scene:'birth_start',attrs:{hp:120,neili:24,wuxing:10,fame:0,money:40,karma:0},
  items:[],flags:{},job:'swordsman',artKey:'basic_sword',mind:'hunyuan',log:[],choices:0};}
let S=JSON.parse(localStorage.getItem(SAVEKEY)||'null')||fresh();
const $=id=>document.getElementById(id);
function condOk(c){
  if(!c) return true;
  for(const k of ['hp','neili','wuxing','fame','money','karma']) if(typeof c[k]==='number'&&S.attrs[k]<c[k]) return false;
  if(c.items&&c.items.some(i=>!S.items.includes(i))) return false;
  if(c.flags&&Object.keys(c.flags).some(f=>S.flags[f]!==c.flags[f])) return false;
  if(c.notItem&&S.items.includes(c.notItem)) return false;
  return true;
}
function applyEff(e){
  if(!e) return[];
  const out=[];
  const N={hp:'气血',neili:'内力',wuxing:'悟性',fame:'名望',money:'银两',karma:'善恶'};
  for(const k in N) if(typeof e[k]==='number'&&e[k]){ S.attrs[k]+=e[k]; if(k==='hp') S.attrs.hp=Math.max(1,Math.min(1999,S.attrs.hp)); out.push(N[k]+(e[k]>0?' +':' ')+e[k]); }
  if(e.items) e.items.forEach(i=>{ if(!S.items.includes(i)) S.items.push(i); out.push('得「'+i+'」'); });
  if(e.flags) Object.assign(S.flags,e.flags);
  return out;
}
function battle(g){
  const atk=8+S.attrs.neili*0.9+S.attrs.wuxing*0.4;
  const k=1+(S.attrs.neili||0)/1500;
  const myHp=Math.round(S.attrs.hp*(1+(S.attrs.neili||0)/1200));
  const foeHp=g.hp||80, foeAtk=g.atk||14;
  const myDps=atk*k, foeDps=foeAtk*(0.78+Math.min(8,Math.floor((S.attrs.neili||20)/12))*0.07);
  const rounds=Math.ceil(foeHp/myDps), take=Math.round(rounds*foeDps*0.45);
  S.attrs.hp=Math.max(1,S.attrs.hp-take);
  const win = S.attrs.hp>take*0.15 && rounds<=6 || Math.random()<0.75-rounds*0.05;
  if(win){ S.attrs.hp=Math.min(1999,S.attrs.hp+Math.round(S.attrs.hp*0.25)); return {win:true,log:'⚔ 与 '+(g.name||'对手')+'交手 '+rounds+' 回合，你胜了（气血 -'+take+'）'}; }
  S.attrs.hp=Math.max(20,Math.round(S.attrs.hp*0.5));
  return {win:false,log:'⚔ 你不敌 '+(g.name||'对手')+'，败退（气血 -'+take+'）'};
}
function render(){
  const sc=STORY[S.scene]||{title:'终章',text:['此局已了。']};
  $('seal').textContent=(S.flags.nick||'侠').slice(0,1);
  $('who').textContent=S.flags.nick||'无名侠客';
  const J=JOBS[S.job]||{}, A=ARTS[S.artKey]||{}, M=MINDS[S.mind]||{};
  $('sub').textContent='离线版 · '+(J.name||'')+' · '+(M.name||'');
  const N={hp:'气血',neili:'内力',wuxing:'悟性',fame:'名望',money:'银两',karma:'善恶'};
  $('stats').innerHTML=Object.keys(N).map(k=>'<div><i>'+N[k]+'</i><b>'+S.attrs[k]+'</b></div>').join('');
  $('title').textContent=sc.title||'';
  $('text').innerHTML=(sc.text||[]).map(t=>'<p>'+t+'</p>').join('');
  const chs=(sc.choices||[]).map((c,i)=>({c,i})).filter(x=>condOk(x.c.cond));
  const locked=(sc.choices||[]).map((c,i)=>({c,i})).filter(x=>!condOk(x.c.cond));
  $('choices').innerHTML=chs.map(x=>'<button class="ch" data-i="'+x.i+'">'+x.c.text+'</button>').join('')
    +locked.map(x=>'<button class="ch" disabled style="opacity:.35">'+x.c.text+'<small>条件不足</small></button>').join('');
  $('log').innerHTML=(S.log||[]).slice(-6).map(t=>'<div>· '+t+'</div>').join('');
  if(sc.ending||/^结局/.test(sc.title||'')){ $('over').style.display='flex'; $('overText').textContent=sc.title; }
}
document.addEventListener('click',e=>{
  const b=e.target.closest('.ch[data-i]'); if(!b) return;
  const sc=STORY[S.scene]; const c=(sc.choices||[])[Number(b.dataset.i)]; if(!c) return;
  const lines=applyEff(c.eff);
  if(c.battle){ const r=battle(c.battle); lines.push(r.log);
    const nxt=(r.win?c.battle.win:c.battle.lose)||c.next; if(nxt&&STORY[nxt]) S.scene=nxt;
  } else if(c.next&&STORY[c.next]) S.scene=c.next;
  S.choices++; S.log=S.log.concat(lines);
  localStorage.setItem(SAVEKEY,JSON.stringify(S));
  render(); window.scrollTo({top:0,behavior:'smooth'});
});
$('saveBtn').onclick=()=>{ localStorage.setItem(SAVEKEY,JSON.stringify(S));
  const blob=new Blob([JSON.stringify({v:1,player:S})],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='jianghu-save.json'; a.click(); };
$('resetBtn').onclick=()=>{ if(!confirm('确定重新开始？当前进度会清空')) return;
  localStorage.removeItem(SAVEKEY); S=fresh(); render(); };
render();
</script>
</body></html>`;
fs.writeFileSync('public/standalone.html', html);
console.log('已生成 public/standalone.html', Math.round(html.length/1024)+'KB');
