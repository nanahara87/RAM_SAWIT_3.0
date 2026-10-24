'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppServer, freshDB, mergeDB } = require('../server-core');

test('merge mempertahankan catatan unik dan memenangkan revisi lebih baru',()=>{
  const base=freshDB();
  base.purchases=[{id:'a',no:'PB-1',supplier:'Pemasok A',total:100,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'}];
  const other=freshDB();
  other.purchases=[{id:'b',no:'PB-2',supplier:'Pemasok B',total:200,createdAt:'2026-10-02T00:00:00.000Z',updatedAt:'2026-10-02T00:00:00.000Z'},{id:'a',no:'PB-1',supplier:'Pemasok A',total:125,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-03T00:00:00.000Z'}];
  const merged=mergeDB(base,other);
  assert.equal(merged.purchases.length,2);
  assert.equal(merged.purchases.find(x=>x.id==='a').total,125);
  assert.equal(merged.purchases.find(x=>x.id==='b').total,200);
});

test('tombstone mencegah catatan yang sudah dihapus muncul kembali saat merge',()=>{
  const a=freshDB();a._deletedIds=['tx-1'];
  const b=freshDB();b.purchases=[{id:'tx-1',no:'PB-1',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-02T00:00:00.000Z'}];
  assert.equal(mergeDB(a,b).purchases.length,0);
});

test('API server: setup admin, login, lalu merge tanpa menghapus catatan lama',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ram-sawit-test-'));
  const app=createAppServer({dataDir:dir,publicDir:path.join(__dirname,'..','public'),port:0,cloudMode:true});
  await app.listen(0,'127.0.0.1');
  const port=app.server.address().port;
  const base=`http://127.0.0.1:${port}`;
  t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
  const health=await fetch(base+'/api/health').then(r=>r.json());
  assert.equal(health.setupRequired,true);
  const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'operator',password:'ram-sawit-secure-2026',confirmPassword:'ram-sawit-secure-2026'})}).then(r=>r.json());
  assert.ok(setup.token);
  const headers={'content-type':'application/json',authorization:'Bearer '+setup.token};
  const initial=await fetch(base+'/api/db',{headers}).then(r=>r.json());
  assert.equal(initial.data.purchases.length,0);
  initial.data.purchases.push({id:'x1',no:'PB-1',supplier:'Sawit 1',total:1000,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'});
  const one=await fetch(base+'/api/db',{method:'POST',headers,body:JSON.stringify(initial.data)}).then(r=>r.json());
  assert.equal(one.data.purchases.length,1);
  const incoming=freshDB();incoming.sales.push({id:'sale1',no:'PJ-1',company:'PT Contoh',total:3000,createdAt:'2026-10-02T00:00:00.000Z',updatedAt:'2026-10-02T00:00:00.000Z'});
  const two=await fetch(base+'/api/db',{method:'POST',headers,body:JSON.stringify(incoming)}).then(r=>r.json());
  assert.equal(two.data.purchases.length,1);
  assert.equal(two.data.sales.length,1);
  assert.equal((await fetch(base+'/api/db')).status,401);
  assert.ok(fs.existsSync(path.join(dir,'history.jsonl')));
  assert.ok(fs.readFileSync(path.join(dir,'history.jsonl'),'utf8').trim().split('\n').length>=2);
});
