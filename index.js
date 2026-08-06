const NUTRITION_API = "http://localhost:3000/nutrition";

let allProducts = [];

async function fetchJSONWithFallback(path, opts) {
  const urls = ["http://localhost:3000" + path, path];
  for (const u of urls) {
    try {
      const res = await fetch(u, opts);
      const text = await res.text();
      if (!res.ok) throw new Error("Status " + res.status);
      const trimmed = (text || "").trim();
      if (trimmed.startsWith("<")) throw new Error("HTML response");
      return JSON.parse(trimmed || "{}");
    } catch (e) {}
  }
  throw new Error("All fetch attempts failed");
}

function toTitleCase(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadMappings() {
  const container = document.getElementById("menu-container");

  try {
    const mappings = await fetchJSONWithFallback("/mappings");
    const upcs = Object.keys(mappings || {}).reverse();
    
    const productPromises = upcs.map(async (upc) => {
      try {
        const productRes = await fetchJSONWithFallback(`/product?upc=${upc}`);
        let p = {};
        if (productRes && productRes.found && productRes.product) {
          p = productRes.product;
        } else {
          const manual = mappings[upc];
          if (manual && manual.data) {
            p = manual.data;
          } else {
            return null; // Skip this item if no data found
          }
        }
        
        const title = p.product_name || p.title || p.food_name || "Unknown";
        const brand = p.brands || p.brand_name || "";
        const desc = p.description || p.generic_name || "";
        const img = (p.images && p.images.length && p.images[0]) || p.image || "";
        
        return {
          UPC: upc,
          TITLE: title,
          BRAND: brand,
          DESCRIPTION: desc,
          IMAGES: img,
          name: toTitleCase(title),
          brand: brand,
          description: desc,
          productImg: img,
        };
      } catch (e) {
        console.error(`Failed to load product for UPC ${upc}:`, e.message);
        return null;
      }
    });
    
    const items = (await Promise.all(productPromises)).filter(Boolean).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      }),
    );
    allProducts = items;
    window.allProducts = allProducts;
    renderProducts(allProducts);
  } catch (err) {
    console.error("Failed to load mappings:", err.message);
    container.innerHTML = `<p style="color:red;">Connection error: ${err.message}</p>`;
  }
}

function renderProducts(items) {
  const container = document.getElementById("menu-container");
  const placeholder =
    "https://placehold.jp/24/cccccc/ffffff/300x300.png?text=No+Image+Available";
  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML =
      "<p style='text-align:center; padding:20px;'>No items found.</p>";
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-item";

    let finalProductImg = placeholder;
    if (item.productImg && item.productImg !== "undefined") {
      finalProductImg = item.productImg.split("^")[0].trim();
    }

    card.innerHTML = `
      <div class="image-wrapper">
        <img src="${finalProductImg}" class="product-img" onerror="this.src='${placeholder}';">
      </div>
      <div class="info-tray">
        <div class="brand-name">${item.brand || "Generic"}</div>
        <div class="product-name">${item.name}</div>
      </div>
    `;

    card.onclick = () => showPopup(item);
    container.appendChild(card);
  });
}

async function loadNutrition(item) {
  try {
    let params = new URLSearchParams({
      upc: item.UPC,
    });

    let res = await fetch(NUTRITION_API + "?" + params.toString());

    let data = null;
    if (res.ok) {
      data = await res.json();
    } else {
      data = { found: false };
    }

    if (data && data.found && data.food) {
      if (data.foodUrl) {
        data.food.food_url = data.foodUrl;
      }
      showNutritionPopup(data.food);
      return;
    }

    if (item.name || item.brand) {
      params = new URLSearchParams({
        name: item.name || "",
        brand: item.brand || "",
      });

      res = await fetch(NUTRITION_API + "?" + params.toString());
      data = res.ok ? await res.json() : { found: false };

      if (data && data.found && data.food) {
        if (data.foodUrl) {
          data.food.food_url = data.foodUrl;
        }
        showNutritionPopup(data.food);
        return;
      }
    }

    alert("Nutrition not found");
  } catch (err) {
    alert("Nutrition lookup failed: " + (err.message || "Check server"));
  }
}

document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "search-input") {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (!searchTerm) {
      renderProducts(allProducts);
      return;
    }

    const regex = new RegExp("\\b" + escapeRegExp(searchTerm), "i");

    const filteredItems = allProducts.filter((item) => {
      return regex.test(item.name);
    });

    renderProducts(filteredItems);
  }
});

function showNutritionPopup(food) {
  let serving = null;

  if (food.servings && food.servings.serving) {
    const servings = Array.isArray(food.servings.serving) ? food.servings.serving : [food.servings.serving];
    // Find the default serving size (matches the FatSecret product page)
    serving = servings.find(s => s.is_default === "1") || servings[0];
  }

  const formatVal = (val, unit = "") => {
    if (val === undefined || val === null || val === "") return "N/A";
    return val + unit;
  };

  const html = `

    <div class="nutrition-container">

      <div class="nutrition-brand">
            ${food.brand_name || food.brands || ""}
          </div>
      <div style="font-size: 10px; color: #666; margin-bottom: 5px;">
        Source: FatSecret Platform API
      </div>

      <hr>

      <div class="nutrition-row">
        <span>Serving</span>
        <span>
          ${serving?.serving_description || "N/A"}
        </span>
      </div>

      <div class="nutrition-row calories">
        <span>Calories</span>
        <span>
          ${formatVal(serving?.calories)}
        </span>
      </div>

      <hr>

      <div class="nutrition-row">
        <span>Total Fat</span>
        <span>
          ${formatVal(serving?.fat - ".00", "g")}
        </span>
      </div>

      <div class="nutrition-row">
        <span>Saturated Fat</span>
        <span>
          ${formatVal(serving?.saturated_fat - ".00", "g")}
        </span>
      </div>

      <div class="nutrition-row">
        <span>Carbohydrates</span>
        <span>
          ${formatVal(serving?.carbohydrate - ".00", "g")}
        </span>
      </div>

      <div class="nutrition-row">
        <span>Sugar</span>
        <span>
          ${formatVal(serving?.sugar - ".00", "g")}
        </span>
      </div>

      <div class="nutrition-row">
        <span>Protein</span>
        <span>
          ${formatVal(serving?.protein - ".00", "g")}
        </span>
      </div>

      <div class="nutrition-row">
        <span>Sodium</span>
        <span>
          ${formatVal(serving?.sodium, "mg")}
        </span>
      </div>

      <div class="nutrition-link">
        <a href="${food.food_url || `https://foods.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(food.brand_name || '')} ${encodeURIComponent(food.food_name || '')}`}"
           target="_blank" rel="noopener noreferrer">
          View Full Nutrition Facts
        </a>
      </div>

    </div>
  `;

  document.getElementById("popup-details").innerHTML = html;
}

function showPopup(item) {
  const popup = document.getElementById("popup");
  const details = document.getElementById("popup-details");
  const placeholder =
    "https://placehold.jp/24/cccccc/ffffff/300x300.png?text=No+Image+Available";

  const cleanProdImg =
    item.productImg && item.productImg !== "undefined"
      ? item.productImg.split("^")[0].trim()
      : placeholder;

  document.getElementById("popup-title").innerText = toTitleCase(item.name);

  details.innerHTML = `
  <div class="popup-image-container">
    <img src="${cleanProdImg}" onerror="this.src='${placeholder}';">
  </div>

  <div class="popup-brand">${item.brand || ""}</div>

  <div class="popup-description">
    <strong>Description:</strong>
    <p>${item.description || "No description available."}</p>
  </div>

  <button id="nutrition-btn" style="background-color: #002855;">
    View Nutrition
  </button>
`;

  setTimeout(() => {
    document.getElementById("nutrition-btn").addEventListener("click", () => {
      loadNutrition(item);
    });
  }, 0);

  popup.classList.remove("hidden");
}

document.getElementById("close-popup").onclick = () => {
  document.getElementById("popup").classList.add("hidden");
};

window.renderProducts = renderProducts;
window.allProducts = allProducts;
loadMappings();
