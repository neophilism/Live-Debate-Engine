import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEventRoster} from '../../packages/competition/src/roster.mjs';
const base=()=>({eventId:'event-1',tenantId:'tenant-1',entries:[
 {identityId:'person-a',role:'debater',teamId:'team-a'},
 {identityId:'person-b',role:'judge',teamId:null},
]});
test('roster preflight enforces distinct assigned identities',()=>{
 const valid=validateEventRoster(base());
 assert.equal(valid.entries.length,2);assert.ok(Object.isFrozen(valid.entries));
 assert.throws(()=>validateEventRoster({...base(),entries:[base().entries[0],base().entries[0]]}));
});
test('judges cannot join teams and debaters require a team',()=>{
 for(const entry of [{identityId:'person-b',role:'judge',teamId:'team-a'},
 {identityId:'person-a',role:'debater',teamId:null}])
 assert.throws(()=>validateEventRoster({...base(),entries:[entry,...base().entries.filter(x=>x.identityId!==entry.identityId)]}));
});
test('unknown roles and untrusted metadata rejected',()=>{
 assert.throws(()=>validateEventRoster({...base(),entries:base().entries.map((x,i)=>i?{...x,credential:'x'}:x)}));
 assert.throws(()=>validateEventRoster({...base(),entries:base().entries.map((x,i)=>i?{...x,role:'owner'}:x)}));
});
