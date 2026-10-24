'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freshDB, mergeDB } = require('../server-core');

test('merge mempertahankan transaksi lama dan transaksi baru', () => {
  const a=freshDB(); a.purchases=[{id:'a',createdAt:'2026-01-01',updatedAt:'2026-01-01',no:'PB-1'}];
  const b=freshDB(); b.purchases=[{id:'b',createdAt:'2026-01-02',updatedAt:'2026-01-02',no:'PB-2'}];
  const m=mergeDB(a,b); assert.deepEqual(m.purchases.map(x=>x.id).sort(),['a','b']);
});
test('merge memilih revisi terbaru pada ID sama', () => {
  const a=freshDB(); a.sales=[{id:'s1',updatedAt:'2026-01-01T00:00:00Z',total:10}];
  const b=freshDB(); b.sales=[{id:'s1',updatedAt:'2026-01-02T00:00:00Z',total:20}];
  const m=mergeDB(a,b); assert.equal(m.sales.length,1); assert.equal(m.sales[0].total,20);
});
test('merge mempertahankan tanda penghapusan', () => {
  const a=freshDB(); a.purchases=[{id:'p1',updatedAt:'2026-01-01'}];
  const b=freshDB(); b._deletedIds=['p1'];
  const m=mergeDB(a,b); assert.equal(m.purchases.length,0); assert.ok(m._deletedIds.includes('p1'));
});
test('merge menggabungkan riwayat harga tanpa ID duplikat', () => {
  const a=freshDB(); a.settings.priceHistory=[{id:'ph1',grade:'Grade A',newPrice:100}];
  const b=freshDB(); b.settings.priceHistory=[{id:'ph1',grade:'Grade A',newPrice:100},{id:'ph2',grade:'Grade B',newPrice:80}];
  const m=mergeDB(a,b); assert.equal(m.settings.priceHistory.length,2);
});
