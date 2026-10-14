import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('dist/index.html','utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
function fn(name){const start=html.indexOf('  function '+name+'(');assert.ok(start>=0);let end=html.indexOf('\n  function ',start+1);const close=html.indexOf('\n  }',start)+4;if(close>start&&close<end)end=close;return html.slice(start,end);}
const c=vm.createContext({boss:{active:true,phase:1,coreHp:24,bridgeHp:36,finalHp:32},player:{x:3,y:-32,invuln:0},enemyShots:[],hullDifficulty:'normal',Math,sound(){},score:0,shake:0,particles(){},toast(){},hud(){},hull:50,end(){c.ended=true;}});
vm.runInContext(['bossLower','bossOpen','updateBoss','bossHit'].map(fn).join('\n'),c);
vm.runInContext("bossHit('core')",c);assert.equal(c.boss.coreHp,24,'closed armor rejects damage');
vm.runInContext('updateBoss(1.6)',c);assert.equal(c.boss.lock.x,3);assert.equal(c.enemyShots.length,0);
vm.runInContext('player.x=10;updateBoss(.95)',c);assert.equal(c.enemyShots.length,6);
assert.ok(c.enemyShots.every(b=>[ -2,3,8 ].some(x=>Math.abs(b.x+b.vx*69/83-x)<1e-8)),'locked aim is dodgeable');
vm.runInContext("bossHit('bridge');bossHit('core');bossHit('core')",c);assert.equal(c.boss.coreHp,23,'correct weapon and hit cooldown');
// An ideal pilot firing continuously must play through all three forms.
let seconds=2.55,phases=new Set([1]),lower=false,upper=false;
while(!c.ended&&seconds<180){
 vm.runInContext("updateBoss(.05);bossHit(bossLower()?'core':'bridge')",c);
 seconds+=.05;phases.add(c.boss.phase);
 if(c.boss.phase===3){const l=vm.runInContext('bossLower()',c);lower ||= l;upper ||= !l;}
 c.enemyShots=[];
}
assert.ok(c.ended);assert.deepEqual([...phases],[1,2,3,4]);assert.ok(lower&&upper);
assert.ok(seconds>40&&seconds<150,'no instant win or excessively long ideal fight');
const guide=vm.createContext({guideWallAt:null,guideFinished:false,travel:0,BARRIERS:[{at:100,realm:'upper'},{at:300,realm:'lower'}]});
vm.runInContext(fn('firstWallGuide'),guide);assert.equal(vm.runInContext('firstWallGuide().at',guide),100);
guide.travel=120;assert.equal(vm.runInContext('firstWallGuide()',guide),null);
guide.travel=250;assert.equal(vm.runInContext('firstWallGuide()',guide),null,'second wall has no guidance');
let rotated=false,drawn=false;
const screen=vm.createContext({DPR:2,viewRoll:Math.PI,ctx:{save(){},restore(){},setTransform(...args){assert.deepEqual(args,[2,0,0,2,0,0]);},rotate(){rotated=true;},fillText(){drawn=true;}}});
vm.runInContext(fn('screenText'),screen);vm.runInContext("screenText('案内',100,100)",screen);assert.ok(drawn&&!rotated,'screen labels do not inherit mirror rotation');
console.log(`PASS: syntax, first-wall-only guidance, upright text, armor windows, weapon/cooldown, locked aim, 3 forms, realm switching, victory. Ideal continuous-hit boss duration: ${seconds.toFixed(1)}s. Browser feel remains unverified.`);

for(let stage=1;stage<=6;stage++)for(const lower of [false,true]){
 const wall={at:1000,stage,first:true,realmLocked:false,realm:'upper'};
 const c=vm.createContext({mode:'playing',wave:stage,travel:780,underground:lower,BARRIERS:[wall]});
 vm.runInContext(fn('lockFirstWallRealm'),c);
 vm.runInContext('lockFirstWallRealm()',c);assert.equal(wall.realmLocked,false,'not visible yet');
 c.travel=790;vm.runInContext('lockFirstWallRealm()',c);
 assert.equal(wall.realm,lower?'lower':'upper');assert.equal(wall.realmLocked,true);
 c.underground=!lower;vm.runInContext('lockFirstWallRealm()',c);
 assert.equal(wall.realm,lower?'lower':'upper','wall stays fixed after appearance');
}
console.log('PASS: all six stages, both realms, first wall follows player at appearance and never follows evasive movement.');
