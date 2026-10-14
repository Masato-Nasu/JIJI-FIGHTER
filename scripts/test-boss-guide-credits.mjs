import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('dist/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
function fn(name){const start=html.indexOf('  function '+name+'(');assert.ok(start>=0);const end=html.indexOf('\n  function ',start+1);return html.slice(start,end);}
const context=vm.createContext({boss:{active:true,phase:1},player:{x:3,y:-32,invuln:0},enemyShots:[],hullDifficulty:'easy',Math,sound(){},score:0,shake:0,particles(){},toast(){},hud(){},hull:50,end(){context.ended=true;}});
vm.runInContext(fn('updateBoss')+fn('bossHit'),context);
vm.runInContext('updateBoss(3.5)',context);assert.equal(context.boss.lock.x,3);assert.equal(context.enemyShots.length,0);
vm.runInContext('player.x=10;updateBoss(1.2)',context);assert.equal(context.enemyShots.length,2);
assert.ok(context.enemyShots.every(b=>Math.abs(b.x+b.vx*(78-9)/83-3)<1e-8),'aim stays locked so player can dodge');
context.boss.coreHp=1;context.boss.bridgeHp=12;vm.runInContext("bossHit('core')",context);assert.equal(context.boss.phase,2);assert.equal(context.enemyShots.length,0);assert.equal(context.hull,70);
vm.runInContext('updateBoss(9.3)',context);assert.equal(context.enemyShots.length,9);assert.ok(Math.abs(context.boss.targetX)<=8);
context.boss.bridgeHp=1;vm.runInContext("bossHit('bridge')",context);assert.equal(context.boss.won,true);assert.equal(context.ended,true);
assert.ok(html.includes("mode==='credits'){creditsAge+=dt;if(creditsAge>=26)finishEnd(true)"));
assert.ok(html.includes('drawFlightGuide();drawBossTelegraph();drawCredits();'));
assert.ok(html.includes('↓ 地面の下まで潜って回避'));
console.log('Built inline scripts parse; boss telegraph, locked aim, phase transition, recovery, fan volley and victory pass. Browser rendering remains unverified.');
