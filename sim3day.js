const B='http://127.0.0.1:8900', GM='gm-7f3a91c2';
const j=async(p,b)=>{const r=await fetch(B+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});try{return await r.json()}catch(e){return{error:'badjson'}}};
const st=async t=>(await fetch(B+'/api/state?token='+t)).json();
const act=async(t,type,extra)=>j('/api/action',Object.assign({token:t,type},extra||{}));

(async()=>{
  const reg=await j('/api/register',{user:'long'+Math.random().toString(36).slice(2,7),pass:'abc123',nick:'长线老手'});
  const t=reg.token;
  let battles=0,deaths=0,errs=0,days=new Set(),lastDay=0,claims=0,forges=0;
  console.log('步|天|时|场景|境界|内力|气血|银两|精力|战|死');
  for(let i=1;i<=400;i++){
    const s=await st(t);
    if(s.error){errs++;break}
    days.add(s.day); lastDay=s.day;
    const a=s.me.attrs;
    let r;
    if(s.battle){ r=await act(t,'battle',{move:'attack',target:0}); battles++; }
    else if(a.hp<70){ r= a.money>=15 ? await act(t,'heal') : await act(t,'meditate'); }
    else if(s.tasks.some(x=>x.progress>=x.goal&&!x.claimed)){ const tk=s.tasks.find(x=>x.progress>=x.goal&&!x.claimed); r=await act(t,'claim',{id:tk.id}); claims++; }
    else if((s.gearBag||[]).length){ r=await act(t,'equipGear',{idx:0}); }
    else if(s.scene.choices.length>0 && Math.random()<0.75){ r=await act(t,'choose',{idx:Math.floor(Math.random()*s.scene.choices.length)}); }
    else if(!s.gear.weapon && a.money>=20){ r=await act(t,'forge',{slot:'weapon'}); forges++; }
    else if(a.neili<160 && s.locInfo.type!=='town'){ r=await act(t,'trainBatch',{times:2}); }
    else if(s.locInfo.type==='town' && s.scene.choices.length>0){ r=await act(t,'choose',{idx:Math.floor(Math.random()*s.scene.choices.length)}); }
    else if(a.money<60){ r=await act(t,'workBatch',{job:'escort',times:2}); }
    else if(s.locs.some(l=>l.type==='sect'&&l.unlocked) && Math.random()<0.5){ r=await act(t,'travel',{id:'shaolin'}); }
    else { r=await act(t,'scout'); }
    const msg=(r&&r.msgs||[]).join(' ');
    if(/你 倒下|战败|你重伤/.test(msg)) deaths++;
    if(r&&r.error) errs++;
    if(i%50===0){
      const f=await st(t);
      console.log([i,f.day,f.hour,(f.scene.title||'').slice(0,12),f.realm&&f.realm.name,f.me.attrs.neili,f.me.attrs.hp,f.me.attrs.money,f.vigor.now,battles,deaths].join('|'));
    }
  }
  const f=await st(t);
  console.log('\n=== 三天总结 ===');
  console.log('经历天数:', [...days].sort((a,b)=>a-b).join(','), '| 领取委托:', claims, '| 打造:', forges);
  console.log('最终:', f.scene.title, '|', f.realm.name, '| 内力', f.me.attrs.neili, '| 气血', f.me.attrs.hp,
    '| 银两', f.me.attrs.money, '| 名望', f.me.attrs.fame, '| 访问场景', 'n/a');
  console.log('战斗', battles, '死亡', deaths, '错误', errs);
})();
