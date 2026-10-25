const B='http://127.0.0.1:8900';
const KEY='gm-7f3a91c2';
async function post(p,b){const r=await fetch(B+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});return r.json();}
async function state(t){const r=await fetch(B+'/api/state?token='+t);return r.json();}

const TYPES=[
 {k:'剧情党', mode:'story'},
 {k:'硬拼党', mode:'story', aggressive:true},
 {k:'刷怪党', mode:'fight'},
 {k:'打工人', mode:'work'},
 {k:'修炼党', mode:'train'},
 {k:'探索党', mode:'explore'},
 {k:'社交党', mode:'social'},
 {k:'氪金党', mode:'rich'},
 {k:'新手党', mode:'random'},
 {k:'收集党', mode:'collect'},
 {k:'门派党', mode:'sect'},
 {k:'咸鱼党', mode:'idle'},
];

(async()=>{
  const results=[];
  const accounts=[];
  for(const t of TYPES){
    const user='sim_'+Math.random().toString(36).slice(2,7);
    const reg=await post('/api/register',{user,pass:'abc123',nick:t.k});
    const tok=reg.token;
    if(t.mode==='rich') await post('/api/gm/set?key='+KEY,{token:tok,uid:reg.state.me.uid,attr:'money',value:5000});
    if(t.mode==='sect') await post('/api/gm/set?key='+KEY,{uid:reg.state.me.uid,flags:{sect:true}});
    accounts.push({t,tok,uid:reg.state.me.uid});
  }

  const log=(o)=>results.push(o);

  for(const a of accounts){
    const {t,tok}=a;
    let st=await state(tok);
    let steps=0, deaths=0, errors=0, battles=0, ended=false;
    const start=Date.now();
    const maxSteps = 120;
    while(steps<maxSteps){
      steps++;
      // 各玩法的行动选择
      let r;
      if(t.mode==='story'||t.mode==='rich'){
        if(st.battle){ r=await post('/api/action',{token:tok,type:'battle',move:'attack',target:0}); battles++; }
        else if(st.scene.choices && st.scene.choices.length){
          const pick = t.aggressive ? st.scene.choices.length-1 : 0;
          r=await post('/api/action',{token:tok,type:'choose',idx:pick});
        } else break;
      } else if(t.mode==='fight'){
        if(st.battle){ r=await post('/api/action',{token:tok,type:'battle',move:'skill',target:0}); battles++; }
        else r=await post('/api/action',{token:tok,type:'fight'});
      } else if(t.mode==='work'){
        const hour=st.hour||6;
        const kind = hour<11?'herb': hour<17?'serve':'watch';
        r=await post('/api/action',{token:tok,type:'work',kind});
      } else if(t.mode==='train'){
        r=await post('/api/action',{token:tok,type:'train'});
        if(st.me.attrs.hp<40) r=await post('/api/action',{token:tok,type:'heal'});
      } else if(t.mode==='explore'){
        if(st.battle){ r=await post('/api/action',{token:tok,type:'battle',move:'attack',target:0}); battles++; }
        else r=await post('/api/action',{token:tok,type:'explore'});
      } else if(t.mode==='social'){
        if(steps===1) r=await post('/api/action',{token:tok,type:'friendAdd',key:'剧情党'});
        else if(steps===2) r=await post('/api/action',{token:tok,type:'chat',text:'有人吗'});
        else r=await post('/api/action',{token:tok,type:'meet'});
      } else if(t.mode==='collect'){
        r=await post('/api/action',{token:tok,type:'meet'});
      } else if(t.mode==='sect'){
        r=await post('/api/action',{token:tok,type:'sectTask'});
      } else if(t.mode==='idle'){
        r=await post('/api/action',{token:tok,type:'signIn'});
      } else {
        r=await post('/api/action',{token:tok,type:'explore'});
      }
      if(r && r.error){ errors++; }
      st=await state(tok);
      if(st.aftermath && !st.battle){ await post('/api/action',{token:tok,type:'clearAftermath'}); }
      if(st.ending || (st.scene&&st.scene.ending)){ ended=true; break; }
      if(st.me.attrs.hp<=1){ deaths++; await post('/api/action',{token:tok,type:'heal'}); }
    }
    log({ type:t.k, steps, battles, deaths, errors, ended,
      sec:Math.round((Date.now()-start)/1000),
      realm: st.realm.name, neili: st.realm.neili,
      hp: st.me.attrs.hp, money: st.me.attrs.money, fame: st.me.attrs.fame,
      scene: st.scene.title });
  }
  console.log('type|steps|battle|death|err|end|sec|realm|neili|hp|money|fame|scene');
  results.forEach(r=>console.log([r.type,r.steps,r.battles,r.deaths,r.errors,r.ended,r.sec,r.realm,r.neili,r.hp,r.money,r.fame,r.scene].join('|')));
  process.exit(0);
})();
