const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'public/fatsecret-server/.env') });

async function testFatSecret() {
  try {
    const clientId = process.env.FATSECRET_CLIENT_ID;
    const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.log('ERROR: Missing FatSecret credentials');
      return;
    }

    // Get token
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResp = await axios.post(
      'https://oauth.fatsecret.com/connect/token',
      'grant_type=client_credentials&scope=basic barcode',
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    const token = tokenResp.data.access_token;
    console.log('✓ Got FatSecret token');

    // Test multiple UPCs from your list
    const testUPCs = [
      '0030100215981',
      '0028400243063',
      '0016571940355',
      '0853004004952',
      '0025293001398',
    ];

    for (const upc of testUPCs) {
      try {
        const barcodeResp = await axios.post(
          'https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2',
          { barcode: upc },
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000,
          }
        );
        
        const food = barcodeResp.data?.food;
        if (food) {
          console.log(`✓ UPC ${upc}: ${food.food_name}`);
          if (food.servings?.serving?.[0]) {
            const s = food.servings.serving[0];
            console.log(`  → ${s.calories} cal, ${s.protein}g protein, ${s.fat}g fat`);
          }
        } else {
          console.log(`✗ UPC ${upc}: No food data`);
        }
      } catch (e) {
        console.log(`✗ UPC ${upc}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('Fatal error:', e.message);
    if (e.response?.data) {
      console.error('Response:', JSON.stringify(e.response.data).slice(0, 300));
    }
  }
}

testFatSecret();
