# MenuSite - Product Nutrition & Mapping

This workspace provides a small static frontend and a lightweight Node/Express lookup server to retrieve product metadata, images, and nutrition. Nutrition is sourced from USDA FoodData Central first, with Open Food Facts as the fallback. It also includes an in-page overlay UI for adding/deleting UPC mappings and inserting products into the page.

**Repository layout**
- [index.html](index.html) - static frontend shell that loads `index.js`, the duplicate-UPC prompt, and the overlay.
- [index.js](index.js) - frontend renderer: loads mappings and displays product cards; calls `/product` and `/nutrition` on the server.
- [styles.css](styles.css) - basic styles for the page and popup UI.
- [extension-overlay.js](extension-overlay.js) - in-page overlay for managing mappings, scanning barcodes, and inserting products into the page.
- [fatsecret-server/server.js](fatsecret-server/server.js) - Express server exposing `/product`, `/nutrition`, and `/mappings` endpoints.
- [fatsecret-server/mappings.json](fatsecret-server/mappings.json) - persisted manual mappings.
- [fatsecret-server/package.json](fatsecret-server/package.json) - server dependencies.

**High-level flow**
- The page and overlay request product metadata from `/product?upc=...`.
- The server attempts a product/image cascade: manual mappings, Open Food Facts, retailer/page scraping including Amazon, Walmart, Target, barcode pages, Google image/shopping pages, and optional UPCItemDB.
- Nutrition is sourced from USDA FoodData Central via `/nutrition?name=...&brand=...&upc=...`, then Open Food Facts if USDA does not return useful data.
- If the server is unavailable, the overlay falls back to client-side Open Food Facts API requests and page-scraping via AllOrigins.

**Endpoints**
- `GET /product?upc=<UPC>&debug=1` returns `{ found, source, product }` when found. With `debug=1`, it also returns lookup attempts and the final merged product object.
- `GET /nutrition?name=<name>&brand=<brand>&upc=<upc>` returns USDA or Open Food Facts nutrition details as `{ found, food, foodUrl, source }`.
- `GET /mappings` returns saved manual mappings from `mappings.json`.
- `POST /mappings` saves a mapping with body `{ upc, data }`.
- `DELETE /mappings?upc=<UPC>` deletes a mapping.

**Admin overlay login**
- The Product Manager overlay requires a successful `POST /admin/login` before opening.
- Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and a long random `ADMIN_TOKEN_SECRET` in the Render service environment. Never put these values in frontend files or commit them.
- Login tokens expire after eight hours. `POST /mappings` and `DELETE /mappings` require the issued bearer token; mapping reads remain public for displaying the product menu.

**Duplicate UPC behavior**
- The duplicate UPC prompt is defined in `index.html`.
- The overlay checks both server mappings and `localStorage` before replacing an existing UPC.
- Choosing `No` cancels the add. Choosing `Yes` replaces the saved product data.

**How to run the server**
1. Install dependencies in the server folder:
```bash
cd fatsecret-server
npm install
```
2. Optional: set a USDA API key in your shell if you have one. Otherwise the server uses `DEMO_KEY`:
```bash
set USDA_API_KEY=your_usda_key
```
3. Start the server:
```bash
node server.js
```
4. Open the static site with a local static server or VS Code Live Server.

**Quick tests**
```bash
curl "http://localhost:3000/product?upc=041196910014&debug=1"
curl "http://localhost:3000/nutrition?upc=041196910014"
```

**Troubleshooting**
- Open Food Facts, USDA, retailer scraping, and AllOrigins all require outbound internet access.
- USDA `DEMO_KEY` is fine for light testing, but use `USDA_API_KEY` for heavier use.
- UPCItemDB is optional and unreliable; the app prefers Open Food Facts and retailer/page scraping.
