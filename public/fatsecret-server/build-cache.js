const axios = require('axios');
const fs = require('fs');
const path = require('path');

const cacheDir = __dirname;
const cachePath = path.join(cacheDir, 'fatsecret-cache.json');

const UPCs = [
  '0030100215981', '0028400243063', '0016571940355', '0853004004952',
  '0025293001398', '0076183003145', '0016571954369', '0041900072827',
  '0028400239349', '0028400042437', '0000006827465', '0016571959203'
];

async function fetchProductData(upc) {
  try {
    const resp = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`, { timeout: 5000 });
    if (resp.data && resp.data.product) {
      const p = resp.data.product;
      console.log(`✓ Found ${upc}: ${p.product_name}`);
      
      const nutriments = p.nutriments || {};
      return {
        found: true,
        food: {
          brand_name: p.brands || "Unknown Brand",
          food_id: `off-${upc}`,
          food_name: p.product_name || `Product ${upc}`,
          food_type: "Brand",
          food_url: p.url || "",
          servings: {
            serving: [
              {
                calories: Math.round(nutriments['energy-kcal'] || nutriments['energy'] || 0),
                carbohydrate: Math.round(nutriments.carbohydrates || 0),
                fat: Math.round(nutriments.fat || 0),
                saturated_fat: Math.round(nutriments['saturated-fat'] || 0),
                protein: Math.round(nutriments.proteins || 0),
                sodium: Math.round(nutriments.sodium || 0),
                fiber: Math.round(nutriments.fiber || 0),
                sugar: Math.round(nutriments.sugars || 0),
                serving_description: p.serving_size ? `${p.serving_size}${p.serving_size_unit || ''}` : "per 100g",
                serving_id: upc,
              }
            ]
          }
        }
      };
    }
  } catch (e) {
    console.log(`✗ ${upc}: ${e.message}`);
  }
  return { found: false };
}

async function buildCache() {
  console.log("Building FatSecret cache from Open Food Facts...\n");
  const cache = {};
  
  for (const upc of UPCs) {
    const data = await fetchProductData(upc);
    if (data.found) {
      cache[upc] = data;
    }
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }
  
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  console.log(`\nCache saved: ${Object.keys(cache).length}/${UPCs.length} products`);
}

buildCache().catch(console.error);
