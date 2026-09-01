const test = require('node:test');
const assert = require('node:assert/strict');
const { getApiOriginCandidates, getApiUrls } = require('./public/api-config');

test('uses a configured public backend host instead of localhost', () => {
  globalThis.MENU_API_URL = 'https://example-glitch-app.glitch.me';
  const origins = getApiOriginCandidates();

  assert.deepEqual(origins, [
    'https://example-glitch-app.glitch.me',
  ]);
});

test('getApiUrls uses the configured public backend host and relative fallback only', () => {
  globalThis.MENU_API_URL = 'https://example-glitch-app.glitch.me';
  const urls = getApiUrls('/nutrition');

  assert.ok(urls.includes('https://example-glitch-app.glitch.me/nutrition'));
  assert.ok(urls.includes('/nutrition'));
  assert.ok(!urls.some((url) => url.includes('localhost')));
});
