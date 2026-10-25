const fs=require('fs');
const {STORY}=require('./story.js');
const {ARTS,MINDS}=require('./build.js');
const g=require('./gear.js');
let issues=[];
// 1) 场景连线与选项
for(const [id,sc] of Object.entries(STORY)){
  if(!(sc.choices||[]).length) issues.push('无选项场景: '+id);
  (sc.choices||[]).forEach((c,i)=>{
    if(c.next && !STORY[c.next]) issues.push('断链: '+id+'['+i+'] → '+c.next);
    if(c.battle){ ['win','lose'].forEach(k=>{ if(c.battle[k] && !STORY[c.battle[k]]) issues.push('战斗分支断链: '+id+' → '+c.battle[k]); }); }
  });
}
// 2) 图鉴资源
const miss=[];
[...Object.entries(g.GEAR_TYPES).flatMap(([slot,arr])=>arr.map((it,i)=>'cx_'+slot+'_'+i)),
 ...Object.keys(ARTS).map(k=>'cx_art_'+k), ...Object.keys(MINDS).map(k=>'cx_mind_'+k)]
 .forEach(k=>{ if(!fs.existsSync('public/art/png/'+k+'.png')) miss.push(k); });
if(miss.length) issues.push('图鉴缺图: '+miss.join(', '));
// 3) 场景配图
const artMiss=[];
for(const [id,sc] of Object.entries(STORY)){
  if(!sc.art) { artMiss.push(id); continue; }
  if(!fs.existsSync('public/art/png/'+sc.art+'.png')) artMiss.push(id+'('+sc.art+')');
}
if(artMiss.length) issues.push('场景缺图 '+artMiss.length+' 处: '+artMiss.slice(0,5).join(', '));
// 4) NPC 立绘
const npc=require('./npc.js');
const arts=new Set();
for(let i=0;i<30;i++){ const n=npc.genNpc('长安'); if(n.art) arts.add(n.art); }
[...arts].forEach(a=>{ if(!fs.existsSync('public/art/png/'+a+'.png')) issues.push('NPC 立绘缺: '+a); });
// 5) 统计
console.log('场景', Object.keys(STORY).length, '| 选项', Object.values(STORY).reduce((n,s)=>n+(s.choices||[]).length,0));
console.log('问题数:', issues.length);
issues.slice(0,15).forEach(x=>console.log('  -', x));
