const test = require('node:test');
const assert = require('node:assert/strict');

const { parseFatSecretPageHtml, shouldUseFatSecretScrapeFallback } = require('./server');

test('shouldUseFatSecretScrapeFallback ignores numeric UPCs', () => {
  assert.equal(shouldUseFatSecretScrapeFallback('0028400042437'), false);
  assert.equal(shouldUseFatSecretScrapeFallback('Doritos Nacho Cheese'), true);
});

test('parseFatSecretPageHtml extracts nutrition values from FatSecret HTML', () => {
  const html = `
    <html>
      <body>
        <div class="factPanel">
          <h4>Nutrition summary:</h4>
          <table class="generic spaced">
            <tr>
              <td class="fact">
                <div class="factTitle">Calories</div>
                <div class="factValue">130</div>
              </td>
              <td class="fact">
                <div class="factTitle">Fat</div>
                <div class="factValue">5g</div>
              </td>
              <td class="fact">
                <div class="factTitle">Carbs</div>
                <div class="factValue">19g</div>
              </td>
              <td class="fact">
                <div class="factTitle">Protein</div>
                <div class="factValue">2g</div>
              </td>
            </tr>
          </table>
          <table class="generic spaced">
            <tr>
              <td>There are <b>130 calories</b> in 1 bag of Demo Product.</td>
            </tr>
          </table>
        </div>
      </body>
    </html>
  `;

  const result = parseFatSecretPageHtml(html, 'Demo Product', 'https://foods.fatsecret.com/calories-nutrition/demo-product');

  assert.equal(result.food_name, 'Demo Product');
  assert.equal(result.servings.serving[0].serving_description, '1 bag');
  assert.equal(result.servings.serving[0].calories, 130);
  assert.equal(result.servings.serving[0].fat, 5);
  assert.equal(result.servings.serving[0].carbohydrate, 19);
  assert.equal(result.servings.serving[0].protein, 2);
});
