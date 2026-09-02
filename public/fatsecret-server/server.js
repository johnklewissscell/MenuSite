const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
console.log("Starting server...");
process.on("exit", (code) => {
  console.log("PROCESS EXIT", code);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION", err.message);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION", err.message);
});

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the parent directory (MenuSite root)
app.use(express.static(path.join(__dirname, "..")));

const mappingsPath = path.join(__dirname, "mappings.json");
const offCachePath = path.join(__dirname, "off-cache.json");
const fatSecretCachePath = path.join(__dirname, "fatsecret-cache.json");
let mappings = {};
let offCache = {};
let fatSecretCache = {};

try {
  if (fs.existsSync(mappingsPath))
    mappings = JSON.parse(fs.readFileSync(mappingsPath, "utf8") || "{}");
} catch (e) {
  console.warn("load mappings failed", e.message);
}
try {
  if (fs.existsSync(offCachePath))
    offCache = JSON.parse(fs.readFileSync(offCachePath, "utf8") || "{}");
} catch (e) {
  console.warn("load off cache failed", e.message);
}
try {
  if (fs.existsSync(fatSecretCachePath)) {
    const loaded = JSON.parse(fs.readFileSync(fatSecretCachePath, "utf8") || "{}");
    fatSecretCache = loaded;
  }
} catch (e) {
  console.warn("load fatsecret cache failed", e.message);
}

function saveMappings() {
  try {
    fs.writeFileSync(mappingsPath, JSON.stringify(mappings, null, 2));
  } catch (e) {
    console.warn("saveMappings failed", e.message);
  }
}

function saveOffCache() {
  try {
    fs.writeFileSync(offCachePath, JSON.stringify(offCache, null, 2));
  } catch (e) {
    console.warn("saveOffCache failed", e.message);
  }
}

function saveFatSecretCache() {
  try {
    fs.writeFileSync(fatSecretCachePath, JSON.stringify(fatSecretCache, null, 2));
  } catch (e) {
    console.warn("saveFatSecretCache failed", e.message);
  }
}

const externalRequestCooldowns = new Map();

function getCooldownKey(source) {
  return String(source || "unknown").toLowerCase();
}

function isExternalRequestRateLimited(source, cooldownMs = 60000) {
  const key = getCooldownKey(source);
  const until = externalRequestCooldowns.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    externalRequestCooldowns.delete(key);
    return false;
  }
  return true;
}

function markExternalRequestRateLimited(source, cooldownMs = 60000) {
  const key = getCooldownKey(source);
  externalRequestCooldowns.set(key, Date.now() + cooldownMs);
}

function getCachedFatSecretAnswer(key) {
  if (!key) return null;
  const entry = fatSecretCache[key];
  if (!entry || !entry.food) return null;
  return entry;
}

function setCachedFatSecretAnswer(key, value) {
  if (!key || !value) return;
  fatSecretCache[key] = value;
  saveFatSecretCache();
}

function isSuspectFatSecretCache(cacheObject) {
  if (!cacheObject || typeof cacheObject !== "object") return false;
  const entries = Object.values(cacheObject).filter((entry) => entry && entry.food && entry.food.food_name);
  if (entries.length < 8) return false;

  const counts = new Map();
  for (const entry of entries) {
    const name = String(entry.food.food_name || "").trim().toLowerCase();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  if (counts.size === 0) return false;
  const dominant = [...counts.values()].sort((a, b) => b - a)[0] || 0;
  return dominant / entries.length > 0.7;
}

function shouldUseCachedFatSecretAnswer(entry, fallbackKey = "") {
  const food = entry?.food;
  if (!food) return false;
  const foodName = String(food.food_name || "").trim();
  if (!foodName) return false;
  if (foodName === "Unknown Product" || foodName === "Product") return false;
  return Boolean(food.servings?.serving && (food.servings.serving.calories || food.servings.serving[0]?.calories));
}

let fatSecretToken = null;
let fatSecretTokenExpiry = 0;

async function getFatSecretToken() {
  const now = Date.now();
  if (fatSecretToken && now < fatSecretTokenExpiry) return fatSecretToken;

  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const resp = await axios.post(
      "https://oauth.fatsecret.com/connect/token",
      "grant_type=client_credentials&scope=basic barcode",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    fatSecretToken = resp.data.access_token;
    fatSecretTokenExpiry = now + resp.data.expires_in * 1000 - 60000;
    return fatSecretToken;
  } catch (e) {
    console.warn("FatSecret Token Error:", e.message);
    return null;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseValue(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const cleaned = String(rawValue).replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFatSecretPageHtml(html, productName = "", foodUrl = null) {
  const baseName = String(productName || "").trim() || "Unknown Product";
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const brandMatch = html.match(/<h2[^>]*class=["']manufacturer["'][^>]*>\s*(?:<a[^>]*>)?([^<]+)<\/a>\s*<\/h2>/i);
  const parsedTitle = decodeHtmlEntities(titleMatch?.[1]).trim() || baseName;
  const parsedBrand = decodeHtmlEntities(brandMatch?.[1]).trim() || "";
  const pageText = stripHtml(html);
  const normalizedPageText = pageText.replace(/\s+/g, " ").trim();

  const fetchFactValue = (labels, units = "(?:g|mg|mcg|IU|kcal|calories?)") => {
    const labelList = Array.isArray(labels) ? labels : [labels];
    const allowedUnitPattern = units || "(?:g|mg|mcg|IU|kcal|calories?)";

    const scanTextForMatch = (text) => {
      for (const label of labelList) {
        const variants = Array.from(new Set([label, ...label.split(/\s+/).filter(Boolean)]));
        for (const variant of variants) {
          const needle = String(variant).trim();
          if (!needle) continue;
          const lower = (text || "").toLowerCase();
          const labelIndex = lower.indexOf(needle.toLowerCase());
          if (labelIndex === -1) continue;

          const afterLabel = text.slice(labelIndex + needle.length);
          const directMatch = afterLabel.match(
            new RegExp(`^\\s*[:\-]?\\s*([<>]?\\s*\\d[\\d,.]*(?:\\.\\d+)?\\s*(?:${allowedUnitPattern})?)`, "i"),
          );
          if (directMatch && directMatch[1]) {
            return directMatch[1].trim();
          }

          const fallback = afterLabel.match(
            /\d[\d,\.]*?(?:\.\d+)?\s*(?:g|mg|mcg|iu|kcal|calories?)?/i,
          );
          if (fallback && fallback[0]) {
            return fallback[0].trim();
          }
        }
      }
      return null;
    };

    const htmlPatterns = [
      /<div[^>]*class=["']factTitle["'][^>]*>(.*?)<\/div>\s*<div[^>]*class=["']factValue["'][^>]*>(.*?)<\/div>/gi,
      /<div[^>]*>\s*(.*?)\s*<\/div>\s*<div[^>]*>\s*(.*?)\s*<\/div>/gi,
      /<td[^>]*>\s*(.*?)\s*<\/td>\s*<td[^>]*>\s*(.*?)\s*<\/td>/gi,
    ];

    for (const pattern of htmlPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        if (!match[2]) continue;
        const labelSegment = match[1] || "";
        const valueSegment = match[2] || "";
        const labelText = stripHtml(labelSegment).trim();
        if (!labelText) continue;
        const normalizedLabel = labelText.replace(/\s+/g, " ").trim();
        if (!labelList.some((label) => String(label).toLowerCase() === normalizedLabel.toLowerCase() || normalizedLabel.toLowerCase().includes(String(label).toLowerCase()))) {
          continue;
        }
        const rawValue = stripHtml(valueSegment).trim();
        if (rawValue) return rawValue;
      }
    }

    const pageTextCandidate = normalizedPageText;
    const directScan = scanTextForMatch(pageTextCandidate);
    if (directScan) return directScan;

    const genericScan = scanTextForMatch(pageText);
    return genericScan;
  };

  const calories = parseValue(fetchFactValue(["Calories"], "(?:kcal|calories?)"));
  const fat = parseValue(fetchFactValue(["Fat"]));
  const carbohydrate = parseValue(fetchFactValue(["Carbs", "Carbohydrate", "Carbohydrates"]));
  const protein = parseValue(fetchFactValue(["Protein"]));
  const sodium = parseValue(fetchFactValue(["Sodium"]));
  const sugar = parseValue(fetchFactValue(["Sugar", "Sugars", "Total Sugars", "Total Sugar"]));
  const fiber = parseValue(fetchFactValue(["Fiber", "Dietary Fiber"]));
  const saturatedFat = parseValue(fetchFactValue(["Saturated Fat", "Sat Fat"]));
  const transFat = parseValue(fetchFactValue(["Trans Fat"]));
  const cholesterol = parseValue(fetchFactValue(["Cholesterol"]));
  const potassium = parseValue(fetchFactValue(["Potassium"]));
  const calcium = parseValue(fetchFactValue(["Calcium"]));
  const iron = parseValue(fetchFactValue(["Iron"]));
  const vitaminD = parseValue(fetchFactValue(["Vitamin D"]));

  const servingMatch = html.match(/There are\s+<b>(\d+)\s+calories<\/b>\s+in\s+([^<.]+?)(?:\s+of\s+.+)?\./i);
  const servingDescriptionFromText = normalizedPageText.match(/Serving\s+Size\s*([A-Za-z0-9.\-]+(?:\s+[A-Za-z0-9.\-]+){0,3})(?=\s*Amount\s+Per\s+Serving|$)/i)?.[1]?.trim();
  const servingDescription = servingMatch?.[2]
    ? servingMatch[2].replace(/<[^>]+>/g, "").trim()
    : (servingDescriptionFromText || "per serving");

  const normalizedServingDescription = servingDescription.includes(" of ")
    ? servingDescription.split(/\s+of\s+/i)[0].trim()
    : servingDescription;

  return {
    food_id: `fatsecret-scrape-${Date.now()}`,
    food_name: parsedTitle,
    food_type: "fatsecret",
    brand_name: parsedBrand,
    food_url: foodUrl || null,
    servings: {
      serving: [
        {
          serving_description: normalizedServingDescription || "per serving",
          calories: calories ?? 0,
          fat: fat ?? 0,
          saturated_fat: saturatedFat ?? 0,
          trans_fat: transFat ?? undefined,
          carbohydrate: carbohydrate ?? 0,
          sugar: sugar ?? 0,
          protein: protein ?? 0,
          sodium: sodium ?? 0,
          fiber: fiber ?? 0,
          cholesterol: cholesterol ?? undefined,
          potassium: potassium ?? undefined,
          calcium: calcium ?? undefined,
          iron: iron ?? undefined,
          vitamin_d: vitaminD ?? undefined,
          is_default: "1",
        },
      ],
    },
  };
}

function shouldUseFatSecretScrapeFallback(query) {
  const raw = String(query || "").trim();
  if (!raw) return false;
  if (/^\d{8,14}$/.test(raw)) return false;
  return /[A-Za-z]/.test(raw);
}

async function lookupFatSecretScrape(query, label = "") {
  const searchQuery = String(query || label || "").trim();
  if (!searchQuery || !shouldUseFatSecretScrapeFallback(searchQuery)) return { found: false };

  const searchUrls = [
    `https://foods.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(searchQuery)}`,
    `https://www.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(searchQuery)}`,
  ];

  for (const searchUrl of searchUrls) {
    try {
      const searchResp = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const html = searchResp.data || "";
      const hrefMatches = [...html.matchAll(/href=(['"])(\/calories-nutrition\/[^'\"]+)\1/gi)];

      for (const match of hrefMatches) {
        const href = match[2];
        if (/\/(search|meals|food|photos)\b/i.test(href)) continue;
        const pageUrl = new URL(href, "https://foods.fatsecret.com").toString();

        try {
          const pageResp = await axios.get(pageUrl, {
            timeout: 10000,
            headers: {
              "User-Agent": "Mozilla/5.0",
              Accept: "text/html,application/xhtml+xml",
            },
          });
          const pageHtml = pageResp.data || "";
          if (!pageHtml) continue;
          const parsed = parseFatSecretPageHtml(pageHtml, searchQuery, pageUrl);
          if (parsed) {
            return {
              found: true,
              food: parsed,
              foodUrl: pageUrl,
              source: "FatSecret Product Page",
            };
          }
        } catch (e) {
          console.warn("FatSecret product page scrape failed:", e.message);
        }
      }
    } catch (e) {
      console.warn("FatSecret search scrape failed:", e.message);
    }
  }

  return { found: false };
}

async function lookupFatSecretNutrition(upc) {
  const normalizedUpc = String(upc || "").trim();
  const cached = getCachedFatSecretAnswer(normalizedUpc);
  if (cached && shouldUseCachedFatSecretAnswer(cached, normalizedUpc)) {
    return { found: true, food: cached.food, source: "FatSecret Cache", foodUrl: cached.food?.food_url || null };
  }

  const token = await getFatSecretToken();
  if (!token) {
    if (shouldUseFatSecretScrapeFallback(normalizedUpc)) {
      const scraped = await lookupFatSecretScrape(normalizedUpc, normalizedUpc);
      if (scraped.found) {
        setCachedFatSecretAnswer(normalizedUpc, scraped);
        return scraped;
      }
    }
    return { found: false };
  }
  try {
    const findResp = await axios.post(
      "https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2",
      { barcode: upc },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    const food = findResp.data?.food;
    if (!food || !food.food_id) {
      console.warn(`FatSecret barcode ${upc}: no food found, status=${findResp.status}`);
      return { found: false };
    }
    
    console.log(`FatSecret barcode ${upc} found: ${food.food_name}`);

    const foodId = food.food_id || food.id || null;
    if (foodId) {
      try {
        const getResp = await axios.get(
          "https://platform.fatsecret.com/rest/server.api",
          {
            params: {
              method: "food.get.v2",
              food_id: foodId,
              format: "json",
            },
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (getResp.data?.food) {
          const detailedFood = getResp.data.food;
          if (detailedFood.food_url) {
            detailedFood.food_url = detailedFood.food_url.replace(
              "www.fatsecret.com",
              "foods.fatsecret.com",
            );
          }
          const result = {
            found: true,
            food: detailedFood,
          };
          setCachedFatSecretAnswer(normalizedUpc, result);
          return result;
        }
      } catch (e) {
        console.warn("FatSecret Detail Lookup Error:", e.message);
      }
    }

    const result = {
      found: true,
      food,
    };
    setCachedFatSecretAnswer(normalizedUpc, result);
    return result;
  } catch (e) {
    console.warn(`FatSecret Lookup Error for ${upc}:`, e.message);
    return { found: false };
  }
}

async function searchFatSecretNutrition(query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const cached = getCachedFatSecretAnswer(normalizedQuery);
  if (cached && shouldUseCachedFatSecretAnswer(cached, normalizedQuery)) {
    return { found: true, food: cached.food, source: "FatSecret Cache", foodUrl: cached.food?.food_url || null };
  }

  const token = await getFatSecretToken();
  if (!token) {
    if (shouldUseFatSecretScrapeFallback(query)) {
      const scraped = await lookupFatSecretScrape(query, query);
      if (scraped.found) {
        setCachedFatSecretAnswer(normalizedQuery, scraped);
        return scraped;
      }
    }
    return { found: false };
  }
  try {
    const searchResp = await axios.get(
      "https://platform.fatsecret.com/rest/server.api",
      {
        params: {
          method: "foods.search",
          search_expression: query,
          format: "json",
          max_results: 1,
        },
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const foodId =
      searchResp.data?.foods?.food?.food_id ||
      searchResp.data?.foods?.food?.[0]?.food_id;
    if (!foodId) {
      if (shouldUseFatSecretScrapeFallback(query)) {
        const scraped = await lookupFatSecretScrape(query, query);
        if (scraped.found) {
          setCachedFatSecretAnswer(normalizedQuery, scraped);
          return scraped;
        }
      }
      return { found: false };
    }

    const getResp = await axios.get(
      "https://platform.fatsecret.com/rest/server.api",
      {
        params: { method: "food.get.v2", food_id: foodId, format: "json" },
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (getResp.data?.food) {
      const food = getResp.data.food;
      if (food.food_url)
        food.food_url = food.food_url.replace(
          "www.fatsecret.com",
          "foods.fatsecret.com",
        );
      const result = { found: true, food };
      setCachedFatSecretAnswer(normalizedQuery, result);
      return result;
    }
    return { found: false };
  } catch (e) {
    if (shouldUseFatSecretScrapeFallback(query)) {
      const scraped = await lookupFatSecretScrape(query, query);
      if (scraped.found) {
        setCachedFatSecretAnswer(normalizedQuery, scraped);
        return scraped;
      }
    }
    return { found: false };
  }
}

function isLikelyImageUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (/(logo|icon|sprite|favicon|pixel|transparent|placeholder)/i.test(trimmed)) return false;
  return true;
}

function extractImageUrlsFromPayload(payload) {
  const urls = [];
  const seen = new Set();

  const pushValue = (value) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(pushValue);
      return;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (isLikelyImageUrl(trimmed) && !seen.has(trimmed)) {
        seen.add(trimmed);
        urls.push(trimmed);
      }
      return;
    }

    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const lowerKey = (key || "").toLowerCase();
        if (lowerKey.includes("image") || lowerKey.includes("img") || lowerKey.includes("photo")) {
          pushValue(child);
        } else if (typeof child === "object" && child) {
          pushValue(child);
        }
      }
    }
  };

  pushValue(payload);
  return urls;
}

function mergeProductMetadata(target, payload) {
  if (!target || !payload || typeof payload !== "object") return;

  const productName =
    payload.product_name ||
    payload.title ||
    payload.name ||
    payload.food_name ||
    payload.display_name ||
    "";
  if (productName && !target.product_name) {
    target.product_name = productName;
  }

  const brand =
    payload.brands ||
    payload.brand ||
    payload.brand_name ||
    payload.manufacturer ||
    payload.brandOwner ||
    payload.owner ||
    "";
  if (brand && !target.brands) {
    target.brands = brand;
  }

  const description =
    payload.description ||
    payload.generic_name ||
    payload.description_short ||
    payload.ingredients_text ||
    "";
  if (description && !target.description) {
    target.description = description;
  }

  const imageCandidates = extractImageUrlsFromPayload(payload);
  if (imageCandidates.length && (!target.images || target.images.length === 0)) {
    target.images = imageCandidates;
  }

  const directImage =
    payload.image_front_url ||
    payload.image_url ||
    payload.image ||
    payload.images?.[0] ||
    "";
  if (directImage && !target.image) {
    target.image = directImage;
  }

  if (target.images?.length && !target.image) {
    target.image = target.images[0];
  }
}

async function lookupRetailerImagesServer(upc, name) {
  const terms = Array.from(new Set([upc, name].filter(Boolean)));
  const candidateSearches = [
    `https://www.walmart.com/search/?query=${encodeURIComponent(upc)}`,
    `https://www.target.com/s?searchTerm=${encodeURIComponent(upc)}`,
    `https://www.amazon.com/s?k=${encodeURIComponent(upc)}`,
    `https://www.barcodelookup.com/${encodeURIComponent(upc)}`,
    `https://www.upcitemdb.com/upc/${encodeURIComponent(upc)}`,
    `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(upc)}`,
    ...terms.flatMap((term) => [
      `https://www.walmart.com/search/?query=${encodeURIComponent(term)}`,
      `https://www.target.com/s?searchTerm=${encodeURIComponent(term)}`,
      `https://www.amazon.com/s?k=${encodeURIComponent(term)}`,
      `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term)}`,
    ]),
  ];
  const images = [];
  for (const url of candidateSearches) {
    try {
      const r = await axios.get(url, {
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        },
        timeout: 7000,
      });
      const html = r.data || "";
      console.log(url);
      console.log(images);
      const m = html.match(
        /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      );

      if (m && m[1]) {
        console.log("OG IMAGE:", m[1]);
        images.push(m[1]);
      }
      if (m && m[1]) images.push(m[1]);
      const m2 = html.match(
        /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["'][^>]*>/i,
      );
      if (m2 && m2[1]) images.push(m2[1]);
      const jmatch = html.match(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
      );
      if (jmatch && jmatch[1]) {
        try {
          const jd = JSON.parse(jmatch[1]);
          if (jd && jd.image) {
            if (Array.isArray(jd.image)) images.push(...jd.image);
            else images.push(jd.image);
          }
        } catch (e) {}
      }
      const dynamicImages = html.matchAll(
        /data-a-dynamic-image=["']({[^"']+})["']/gi,
      );
      for (const match of dynamicImages) {
        const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
        try {
          images.push(...Object.keys(JSON.parse(decoded)));
        } catch (e) {}
      }
      const imageUrls = html.matchAll(
        /https?:\/\/[^"'\\\s>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s>]*)?/gi,
      );
      for (const match of imageUrls) {
        images.push(match[0]);
      }
    } catch (e) {}
    if (images.length) break;
  }
  console.log("ALL IMAGES FOUND:", images);
  return Array.from(new Set(images))
    .filter(Boolean)
    .filter((src) => !/sprite|logo|favicon|transparent|pixel/i.test(src))
    .slice(0, 8);
}

async function lookupUPCItemDB(upc) {
  try {
    if (isExternalRequestRateLimited("upcitemdb")) {
      return {
        found: false,
        source: "UPCItemDB",
        data: null,
        raw: null,
        error: "rate_limited",
      };
    }
    const resp = await axios.get(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`,
      { timeout: 7000 },
    );
    const raw = resp.data;
    if (raw && raw.items && raw.items.length)
      return { found: true, source: "UPCItemDB", data: raw.items[0], raw };
    return { found: false, source: "UPCItemDB", data: null, raw };
  } catch (e) {
    if (e.response && e.response.status === 429) {
      markExternalRequestRateLimited("upcitemdb");
    }
    console.warn("UPCItemDB error", e.message);
    return {
      found: false,
      source: "UPCItemDB",
      data: null,
      raw: null,
      error: e.message,
    };
  }
}

function getNutrientValue(nutrients, nutrientIds, namePattern) {
  const list = Array.isArray(nutrients) ? nutrients : [];
  const match = list.find((item) => {
    const nutrient = item.nutrient || item;
    const id = nutrient.number || nutrient.id || item.nutrientId;
    const name = nutrient.name || item.nutrientName || "";
    return nutrientIds.includes(String(id)) || namePattern.test(name);
  });

  return Math.round(Number(match?.amount || match?.value || 0));
}

function convertUSDANutrition(food) {
  const nutrients = food.foodNutrients || [];
  const servingSize = food.servingSize || food.householdServingFullText || "";
  const servingUnit = food.servingSizeUnit || "";
  const servingDescription =
    food.householdServingFullText ||
    (servingSize
      ? `${servingSize}${servingUnit ? " " + servingUnit : ""}`
      : "per serving");

  return {
    food_id: food.fdcId ? `usda-${food.fdcId}` : "usda-" + Date.now(),
    food_name: food.description || food.lowercaseDescription || "USDA Food",
    food_type: food.dataType || "USDA",
    brand_name: food.brandOwner || food.brandName || "",
    servings: {
      serving: [
        {
          serving_description: servingDescription,
          calories: getNutrientValue(
            nutrients,
            ["1008", "2047", "2048"],
            /energy|calorie/i,
          ),
          fat: getNutrientValue(nutrients, ["1004"], /\bfat\b|total lipid/i),
          saturated_fat: getNutrientValue(nutrients, ["1258"], /saturated/i),
          carbohydrate: getNutrientValue(nutrients, ["1005"], /carbohydrate/i),
          sugar: getNutrientValue(nutrients, ["2000", "1063"], /sugar/i),
          protein: getNutrientValue(nutrients, ["1003"], /protein/i),
          sodium: getNutrientValue(nutrients, ["1093"], /sodium/i),
          fiber: getNutrientValue(nutrients, ["1079"], /fiber/i),
        },
      ],
    },
  };
}

async function lookupUSDANutrition(query) {
  if (!query) return { found: false };

  try {
    const apiKey = process.env.USDA_API_KEY || "DEMO_KEY";
    const params = new URLSearchParams({
      api_key: apiKey,
      query,
      pageSize: "5",
    });
    params.append("dataType", "Branded");
    params.append("dataType", "Foundation");
    params.append("dataType", "SR Legacy");

    const resp = await axios.get(
      `https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`,
      { timeout: 8000 },
    );
    const foods = resp.data && resp.data.foods;
    const first =
      Array.isArray(foods) && foods.find((food) => food.foodNutrients?.length);
    if (!first) return { found: false, raw: resp.data };

    return {
      found: true,
      food: convertUSDANutrition(first),
      foodUrl: first.fdcId
        ? `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${first.fdcId}/nutrients`
        : null,
      raw: first,
    };
  } catch (e) {
    console.warn("USDA nutrition error", e.message);
    return { found: false, error: e.message };
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "worthington-nutrition-api", timestamp: new Date().toISOString() });
});

app.get("/product", async (req, res) => {
  try {
    const upc = (req.query.upc || "").trim();
    const debug = req.query.debug === "1" || req.query.debug === "true";
    if (!upc) return res.status(400).json({ error: "Missing UPC" });

    const variants = Array.from(
      new Set(
        [
          upc,
          upc.replace(/^0+/, ""),
          upc.slice(-12),
          "0" + upc,
          "00" + upc,
          upc.length > 1 ? upc.slice(1) : upc,
        ].filter(Boolean),
      ),
    );

    const attempts = [];
    let foundProduct = null;

    for (const v of variants) {
      const fatsecret = await lookupFatSecretNutrition(v);
      attempts.push({
        variant: v,
        source: "fatsecret",
        found: !!fatsecret?.found,
      });

      if (fatsecret?.found && fatsecret.food) {
        foundProduct = fatsecret.food;
        break;
      }
    }

    if (debug) {
      return res.json({
        found: !!foundProduct,
        attempts,
        product: foundProduct || null,
      });
    }

    if (!foundProduct) {
      return res.json({
        found: false,
        product: null,
        source: "FatSecret only: barcode lookup blocked or product not found",
      });
    }

    return res.json({
      found: true,
      source: "FatSecret Barcode API",
      product: foundProduct,
    });
  } catch (e) {
    console.error("product error", e.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// Convert Open Food Facts nutrition data to the popup's nutrition format.
function convertOFFNutrition(product, searchTerm = "") {
  if (!product) return createGenericNutrition(searchTerm);
  try {
    const nutriments = product.nutriments || {};
    const serving = {
      serving_description: product.serving_size
        ? `${product.serving_size}${product.serving_size_unit || ""}`
        : "per 100g",
      calories: Math.round(
        product.energy_kcal || nutriments["energy-kcal"] || 0,
      ),
      fat: Math.round(nutriments.fat || 0),
      saturated_fat: Math.round(nutriments["saturated-fat"] || 0),
      carbohydrate: Math.round(nutriments.carbohydrates || 0),
      sugar: Math.round(nutriments.sugars || 0),
      protein: Math.round(nutriments.proteins || 0),
      sodium: Math.round((nutriments.sodium || 0) * 1000), // convert g to mg
      fiber: Math.round(nutriments.fiber || 0),
    };
    const result = {
      food_id: product.code || "off-" + Date.now(),
      food_name: product.product_name || searchTerm || "Unknown Product",
      food_type: "user food",
      brand_name: product.brands || "",
      servings: {
        serving: [serving],
      },
    };
    console.log(
      "Converted OFF product:",
      result.food_name,
      "calories:",
      serving.calories,
    );
    return result;
  } catch (e) {
    console.error("Error converting Open Food Facts nutrition:", e.message);
    return createGenericNutrition(searchTerm);
  }
}

// Fallback generic nutrition when no data available
function createGenericNutrition(productName = "Product") {
  return {
    food_id: "generic-" + Date.now(),
    food_name: productName || "Unknown Product",
    food_type: "generic food",
    brand_name: "",
    servings: {
      serving: [
        {
          serving_description: "per serving",
          calories: 0,
          fat: 0,
          saturated_fat: 0,
          carbohydrate: 0,
          sugar: 0,
          protein: 0,
          sodium: 0,
          fiber: 0,
        },
      ],
    },
  };
}


app.get("/nutrition", async (req, res) => {
  const upc = (req.query.upc || req.query.barcode || "").trim();
  const name = (req.query.name || "").trim();
  const brand = (req.query.brand || "").trim();
  const searchTerm = `${brand} ${name}`.trim();

  try {
    const variants = Array.from(
      new Set(
        [
          upc,
          upc.replace(/^0+/, ""),
          upc.slice(-12),
          upc.padStart(12, "0"),
          upc.padStart(13, "0"),
          upc.padStart(14, "0"),
        ].filter(Boolean),
      ),
    );

    let resolvedSearchTerm = searchTerm;
    if (upc) {
      for (const v of variants) {
        try {
          const fsResult = await lookupFatSecretNutrition(v);
          if (fsResult?.found && fsResult?.food && fsResult.food.servings) {
            return res.json({
              found: true,
              food: fsResult.food,
              foodUrl: fsResult.food.food_url,
              source: "FatSecret Barcode API",
            });
          }
        } catch (e) {}
      }
    }

    if (resolvedSearchTerm) {
      const fsSearch = await searchFatSecretNutrition(resolvedSearchTerm);
      if (fsSearch?.found && fsSearch?.food) {
        return res.json({
          found: true,
          food: fsSearch.food,
          foodUrl:
            fsSearch.food.food_url ||
            `https://foods.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(resolvedSearchTerm)}`,
          source: "FatSecret (Search by Product Name)",
        });
      }
    }

    if (searchTerm) {
      const fsSearch = await searchFatSecretNutrition(searchTerm);
      if (fsSearch?.found && fsSearch?.food) {
        return res.json({
          found: true,
          food: fsSearch.food,
          foodUrl:
            fsSearch.food.food_url ||
            `https://foods.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(searchTerm)}`,
          source: "FatSecret (Search)",
        });
      }
    }

    return res.json({
      found: false,
      food: null,
      foodUrl: `https://platform.fatsecret.com/api-demo#barcode-api`,
      source: "FatSecret only: barcode lookup blocked or product not found",
    });
  } catch (e) {
    console.error("Critical nutrition endpoint error:", e.message);
    return res.json({
      found: false,
      food: null,
      foodUrl: `https://platform.fatsecret.com/api-demo#barcode-api`,
      source: "FatSecret only: barcode lookup blocked or product not found",
    });
  }
});

app.get("/mappings", (req, res) => {
  try {
    if (fs.existsSync(mappingsPath)) {
      const raw = fs.readFileSync(mappingsPath, "utf8");
      const current = raw ? JSON.parse(raw) : {};
      return res.json(current);
    }
  } catch (e) {
    console.warn("Failed to read mappings.json", e.message);
  }
  return res.json({});
});

app.post("/mappings", (req, res) => {
  const { upc, source, data } = req.body || {};
  if (!upc || !data)
    return res.status(400).json({ error: "Missing upc or data" });
  try {
    if (fs.existsSync(mappingsPath)) {
      const raw = fs.readFileSync(mappingsPath, "utf8");
      mappings = raw ? JSON.parse(raw) : {};
    }
  } catch (e) {
    console.warn("read mappings failed", e.message);
  }
  mappings[upc] = { source: source || "manual", data };
  saveMappings();
  return res.json({ ok: true, mapping: mappings[upc] });
});

app.delete("/mappings", (req, res) => {
  const upc = req.query.upc || (req.body && req.body.upc);
  if (!upc) return res.status(400).json({ error: "Missing upc" });
  try {
    if (fs.existsSync(mappingsPath)) {
      const raw = fs.readFileSync(mappingsPath, "utf8");
      mappings = raw ? JSON.parse(raw) : {};
    }
  } catch (e) {}
  if (!mappings[upc]) return res.status(404).json({ error: "Not found" });
  delete mappings[upc];
  saveMappings();
  return res.json({ ok: true });
});

let PORT = Number(process.env.PORT) || 3001;
let listeningFlag = false;
let server = null;

function startServer(port) {
  server = app.listen(port, "0.0.0.0", () => {
    listeningFlag = true;
    console.log("Server running on http://0.0.0.0:" + port);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${port} is in use, trying ${port + 1}...`);
      server.close();
      startServer(port + 1);
    } else {
      console.error("SERVER ERROR:", err.message);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  startServer(PORT);

  if (!process.env.DEBUG_NO_KEEPALIVE) {
    setInterval(() => {
      if (!listeningFlag && Date.now() % 10000 === 0) {
        console.log("[watchdog] Server listening:", listeningFlag);
      }
    }, 10000);
  }
}

module.exports = {
  app,
  createGenericNutrition,
  parseFatSecretPageHtml,
  shouldUseFatSecretScrapeFallback,
};

// Keep server alive
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server");
  if (server) {
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on("SIGINT", () => {
  console.log("SIGINT received, closing server");
  if (server) {
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
