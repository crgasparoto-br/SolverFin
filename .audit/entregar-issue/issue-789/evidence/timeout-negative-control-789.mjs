import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const text=fs.readFileSync('scripts/statement-visual/issue-662-card-installment-purchase.mjs','utf8');
const f=text.slice(text.indexOf('async function waitFor(selector) {'),text.indexOf('\nfunction fixtureExpression()',text.indexOf('async function waitFor(selector) {')));
let count=0;
const context={evaluate:async()=>{count++;return false;},browser:{cdp:null},sleep:async()=>{}};
const waitFor=vm.runInNewContext('('+f.replace(/^async function waitFor/,'async function')+')', context);
let rejected=false;try{await waitFor('.missing-assistive-text');}catch(err){rejected=/Issue 662 selector did not render/.test(String(err));}
assert.equal(count,80);assert.equal(rejected,true);console.log('PASS: absent accessible reason rejected after exactly 80 readiness checks');
