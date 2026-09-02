const test = require('node:test');
const assert = require('node:assert/strict');
const { getApiOriginCandidates, getApiUrls } = require('./public/api-config');
const { app, parseFatSecretPageHtml } = require('./public/fatsecret-server/server');

async function fetchJsonFromApp(pathname) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${pathname}`);
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

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

test('parseFatSecretPageHtml reads nutrition card values from the FatSecret nutrition facts layout', () => {
  const html = `
    <html>
      <body>
        <h1>Brand Item</h1>
        <div>Serving Size 1 can</div>
        <div>Amount Per Serving</div>
        <div>Calories</div><div>140</div>
        <div>% Daily Values*</div>
        <div>Total Fat</div><div>0g</div><div>0%</div>
        <div>Saturated Fat</div><div>-</div>
        <div>Cholesterol</div><div>-</div>
        <div>Sodium</div><div>65 mg</div><div>3%</div>
        <div>Total Carbohydrate</div><div>38.00g</div><div>14%</div>
        <div>Dietary Fiber</div><div>-</div>
        <div>Sugars</div><div>38.00g</div>
        <div>Includes 38.00g Added Sugars</div><div>76%</div>
        <div>Protein</div><div>0g</div>
        <div>Vitamin D</div><div>-</div>
        <div>Calcium</div><div>-</div>
        <div>Iron</div><div>-</div>
        <div>Potassium</div><div>-</div>
      </body>
    </html>
  `;

  const result = parseFatSecretPageHtml(html, 'Brand Item');
  const serving = result.servings.serving[0];

  assert.equal(serving.serving_description, '1 can');
  assert.equal(serving.calories, 140);
  assert.equal(serving.fat, 0);
  assert.equal(serving.sodium, 65);
  assert.equal(serving.carbohydrate, 38);
  assert.equal(serving.sugar, 38);
  assert.equal(serving.protein, 0);
});

test('product route does not 500 when FatSecret lookup is unavailable or returns a cached hit', async () => {
  const result = await fetchJsonFromApp('/product?upc=0030100215981');

  assert.equal(result.status, 200);
  assert.ok(typeof result.body === 'object' && result.body !== null);
  assert.ok(typeof result.body.found === 'boolean');
  assert.ok(result.body.product === undefined || result.body.product === null || result.body.product === false || typeof result.body.product === 'object');
});
