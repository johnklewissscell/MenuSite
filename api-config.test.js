const test = require('node:test');
const assert = require('node:assert/strict');
const { getApiOriginCandidates, getApiUrls } = require('./api-config');

test('getApiOriginCandidates includes localhost ports in order', () => {
  const origins = getApiOriginCandidates([3000, 3002]);

  assert.deepEqual(origins, [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
  ]);
});

test('getApiUrls includes the active port and a relative fallback', () => {
  const urls = getApiUrls('/nutrition', [3000, 3002]);

  assert.ok(urls.includes('http://localhost:3002/nutrition'));
  assert.ok(urls.includes('/nutrition'));
  assert.ok(urls.includes('http://localhost:3000/nutrition'));
});
