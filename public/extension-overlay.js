(function () {
  function getApiDefault() {
    return (typeof window !== "undefined" && window.MENU_API_URL) || "";
  }

  async function fetchJSONWithFallback(path, opts) {
    const urls = window.MenuSiteApi?.getApiUrls
      ? window.MenuSiteApi.getApiUrls(path)
      : [];
    const apiDefault = getApiDefault();
    if (apiDefault) urls.unshift(apiDefault + path);
    if (!urls.includes(path)) urls.push(path);
    for (const u of urls) {
      try {
        const res = await fetch(u, opts);
        const text = await res.text();
        if (!res.ok) throw new Error("Status " + res.status);
        const trimmed = (text || "").trim();
        if (trimmed.startsWith("<")) throw new Error("HTML response");
        try {
          return JSON.parse(trimmed);
        } catch (e) {
          throw new Error("Invalid JSON");
        }
      } catch (e) {
        /* try next */
      }
    }
    throw new Error("All fetch attempts failed");
  }

  function css() {
    return `
    /* Floating toggle button */
    #ext-overlay-btn{position:fixed;right:20px;bottom:20px;width:68px;height:68px;border-radius:14px;background:#003594;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 32px rgba(14,165,233,0.18);cursor:pointer;z-index:99999;font-size:28px}

    /* Modal */
    #ext-overlay-modal{position:fixed;right:24px;bottom:90px;width:70%;max-width:calc(100% - 48px);background:#ffffff;border-radius:12px;padding:14px;box-shadow:0 18px 60px rgba(2,6,23,0.12);z-index:99999;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;max-height:70vh;overflow:auto}
    #ext-overlay-modal h3{margin:0 0 8px 0;font-size:16px;color:#0f172a}

    /* Inputs & layout */
    #ext-overlay-modal input, #ext-overlay-modal button, #ext-overlay-modal select{box-sizing:border-box}
    #ext-overlay-modal input{padding:8px 10px;margin:6px 0;border:1px solid #e6edf3;border-radius:8px;background:#fbfdff}
    #ext-overlay-modal .row{display:flex;gap:8px;align-items:center}
    #ext-overlay-modal .row input{flex:1}
    #ext-overlay-modal .actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}

    /* Message */
    #ext-msg{font-size:13px;color:#334155;margin-top:8px;min-height:18px}

    /* Mappings list */
    #ext-mappings{margin-top:12px;max-height:46vh;overflow:auto;border-top:1px solid #f1f5f9;padding-top:10px}
    #ext-mappings table{width:100%;border-collapse:collapse;font-size:13px;background:transparent}
    #ext-mappings th, #ext-mappings td{padding:8px 10px;text-align:left;border-bottom:1px solid #f1f5f9;vertical-align:middle}
    #ext-mappings th{font-weight:700;color:#0f172a;font-size:13px}
    #ext-mappings td{color:#0f172a}

    /* Buttons */
    .ext-btn{background:#003594;color:#fff;border-radius:8px;border:0;padding:6px 10px;cursor:pointer;font-weight:600}
    .ext-btn.secondary{background:#f1f5ff;color:#0f172a;border:1px solid #e6edf3}
    .ext-btn.ghost{background:transparent;border:1px solid #e6edf3;color:#0f172a}

    /* Small helpers */
    #ext-mappings .small{font-size:12px;color:#64748b}
    #ext-assist{margin-top:10px}
    `;
  }

  function createUI() {
    if (document.getElementById("ext-overlay-btn")) return;
    const s = document.createElement("style");
    s.textContent = css();
    document.head.appendChild(s);
    const btn = document.createElement("div");
    btn.id = "ext-overlay-btn";
    btn.title = "Product Manager";
    btn.innerHTML = "+";
    document.body.appendChild(btn);
    const modal = document.createElement("div");
    modal.id = "ext-overlay-modal";
    modal.style.display = "none";
    modal.innerHTML = `
      <h3>Product Manager</h3>
      <div class="row">
        <input id="ext-upc" placeholder="UPC / Barcode" />
      </div>
      <input id="ext-name" placeholder="Product name (optional)" />
      <input id="ext-brand" placeholder="Brand (optional)" />
      
      <div class="actions">
        <button id="ext-scan" class="ext-btn secondary">Scan</button>
        <button id="ext-set-default-expiry" class="ext-btn ghost secondary">Set Expiry</button>
        <button id="ext-add" class="ext-btn">Add</button>
      </div>
      <div id="ext-msg"></div>
      <div id="ext-mappings">
        <h4 style="margin:6px 0">Saved Products</h4>
        <div id="ext-mappings-list">Loading...</div>
      </div>
      <div style="margin-top:8px;border-top:1px solid #f3f4f6;padding-top:8px">
        <div style="font-weight:700;font-size:13px">Debug</div>
        <pre id="ext-debug" style="max-height:120px;overflow:auto;font-size:12px;color:#111;margin:6px 0">No debug data</pre>
      </div>
    `;
    document.body.appendChild(modal);
    ensureDuplicatePopup();
    document
      .getElementById("ext-add")
      .addEventListener("click", (e) => addProduct(e));
    document
      .getElementById("ext-scan")
      .addEventListener("click", (e) => startScan(e));
    const topExpiryBtn = document.getElementById("ext-set-default-expiry");
    if (topExpiryBtn) {
      topExpiryBtn.addEventListener("click", async () => {
        const val = prompt(
          "Set expiry date for THIS product (YYYY-MM-DD) or re-add with no exp. date to remove the expiration",
        );
        if (val === null) return;
        const v = (val || "").trim();

        const upcEl = document.getElementById("ext-upc");
        const upc = upcEl && upcEl.value.trim();

        if (!upc) {
          alert("Enter a UPC first");
          return;
        }

        try {
          const lm = getLocalMappings();
          if (!lm[upc]) lm[upc] = { source: "local", data: {} };
          const dataObj = Object.assign({}, lm[upc].data || {});

          if (v.toUpperCase() === "NONE") {
            if (dataObj._expiresAt) delete dataObj._expiresAt;
            if (lm[upc] && lm[upc]._expiresAt) delete lm[upc]._expiresAt;
          } else {
            const d = new Date(v);
            if (isNaN(d.getTime())) {
              alert("Invalid date");
              return;
            }
            dataObj._expiresAt = d.toISOString();
          }

          // ensure insertedAt exists
          if (!dataObj._insertedAt)
            dataObj._insertedAt = new Date().toISOString();

          // try saving to server, fallback to local
          let saved = false;
          try {
            const body = await fetchJSONWithFallback("/mappings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ upc, data: dataObj }),
            });
            if (body && body.ok) saved = true;
          } catch (e) {
            saved = false;
          }

          if (!saved) {
            lm[upc].data = dataObj;
            saveLocalMappings(lm);
            alert("Expiry saved locally.");
          } else {
            alert("Expiry saved to server.");
          }

          loadMappings();
          if (v.toUpperCase() === "NONE") {
            document
              .querySelectorAll(".ext-expires-cell")
              .forEach((cell) => (cell.textContent = ""));
          }
        } catch (e) {
          alert("Invalid date");
        }
      });
    }
    ["ext-add", "ext-scan"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.type = "button";
    });
    btn.addEventListener("click", () => {
      const willOpen = modal.style.display !== "block";
      modal.style.display = willOpen ? "block" : "none";
      localStorage.setItem("ext_modal_open", willOpen ? "1" : "0");
      if (willOpen) {
        setDebug("No debug data");
        setTimeout(loadMappings, 120);
      } else {
        try {
          localStorage.removeItem("ext_debug");
          const pre = document.getElementById("ext-debug");
          if (pre) pre.textContent = "No debug data";
        } catch (e) {}
      }
    });
    try {
      const wasOpen = localStorage.getItem("ext_modal_open");
      const dbgSaved = localStorage.getItem("ext_debug");
      if (dbgSaved) {
        const pre = document.getElementById("ext-debug");
        if (pre) pre.textContent = dbgSaved;
      }
      if (wasOpen === "1") {
        modal.style.display = "block";
        setTimeout(loadMappings, 120);
      }
    } catch (e) {}
  }

  function setDebug(obj) {
    try {
      const pre = document.getElementById("ext-debug");
      const txt = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
      if (pre) pre.textContent = txt;
      localStorage.setItem("ext_debug", txt);
    } catch (e) {}
  }

  function ensureDuplicatePopup() {
    if (document.getElementById("duplicate-upc-popup")) return;

    const popup = document.createElement("div");
    popup.id = "duplicate-upc-popup";
    popup.className = "confirm-popup hidden";
    popup.innerHTML = `
      <div class="confirm-box">
        <p>This UPC is already saved. Replace it?</p>
        <div class="confirm-actions">
          <button id="dup-yes" type="button" class="ext-btn">Yes</button>
          <button id="dup-no" type="button" class="ext-btn secondary">No</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);
  }

  function askDuplicateUPC() {
  return new Promise((resolve) => {
    const popup = document.getElementById("duplicate-upc-popup");
    if (!popup) {
      resolve(confirm("This UPC is already saved. Replace it?"));
      return;
    }
    popup.classList.remove("hidden");

    document.getElementById("dup-yes").onclick = () => {
      popup.classList.add("hidden");
      resolve(true);
    };

    document.getElementById("dup-no").onclick = () => {
      popup.classList.add("hidden");
      resolve(false);
    };
  });
}

  async function mappingExists(upc) {
    const local = getLocalMappings();
    if (local[upc]) return true;

    try {
      const serverMappings = await fetchJSONWithFallback("/mappings");
      if (!serverMappings) return false;
      const variants = generateUPCVariants(upc);
      return variants.some((variant) => Boolean(serverMappings[variant]));
    } catch (e) {
      return false;
    }
  }

  async function addProduct(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();
  if (e && e.currentTarget) try { e.currentTarget.blur(); } catch (_) {}

  const upcEl = document.getElementById("ext-upc");
  const nameEl = document.getElementById("ext-name");
  const brandEl = document.getElementById("ext-brand");

  const upc = upcEl && upcEl.value.trim();
  const name = nameEl && nameEl.value.trim();
  const brand = brandEl && brandEl.value.trim();

  const msg = document.getElementById("ext-msg");
  if (!upc) {
    if (msg) msg.textContent = "Enter UPC first";
    return;
  }

  if (await mappingExists(upc)) {
    const ok = await askDuplicateUPC();
    if (!ok) return;
  }

  const expireValRaw =
    (document.getElementById("ext-expire") &&
      document.getElementById("ext-expire").value) ||
    "";

  const expireVal = String(expireValRaw).trim().toUpperCase();

  const data = {
    product_name: name || undefined,
    brands: brand || undefined,
  };

  const existing = getLocalMappings()[upc];
  if (existing && existing.data && existing.data._insertedAt) {
    data._insertedAt = existing.data._insertedAt;
  } else {
    data._insertedAt = new Date().toISOString();
  }

  if (expireVal === "NONE") {
    delete data._expiresAt;
  } else if (expireVal) {
    try {
      const d = new Date(expireVal);
      if (!isNaN(d.getTime())) {
        data._expiresAt = d.toISOString();
      }
    } catch (e) {}
  }

  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  try {
    let saved = false;
    try {
      const body = await fetchJSONWithFallback("/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upc, data }),
      });
      if (body && body.ok) saved = true;
    } catch (e) {
      saved = false;
    }

    if (!saved) {
      const lm = getLocalMappings();
      lm[upc] = { source: "local", data };
      saveLocalMappings(lm);
      if (msg) msg.textContent = "Saved mapping locally.";
    } else {
      if (msg) msg.textContent = "Saved mapping to server.";
    }

    loadMappings();

    const j = await fetchProductForUPC(upc, data);
    if (j && j.found) {
      insertProductToPageFromProduct(j.product, upc);
      if (msg) msg.textContent = "Added to page. Source: " + (j.source || "unknown");
      setDebug(j);
    } else {
      if (data && (data.product_name || (data.images && data.images.length))) {
        insertProductToPageFromProduct(
          {
            product_name: data.product_name || "",
            brands: data.brands || "",
            images: data.images || [],
          },
          upc
        );
        if (msg) msg.textContent = "Saved mapping and inserted manual data to page.";
      } else {
        if (msg)
          msg.textContent = saved
            ? "Saved mapping but product lookup returned not found."
            : "Saved locally but product lookup returned not found.";
      }
      setDebug(j || {});
    }

    try {
      const modalEl = document.getElementById("ext-overlay-modal");
      if (modalEl) {
        modalEl.style.display = "block";
        localStorage.setItem("ext_modal_open", "1");
      }
    } catch (e) {}

  } catch (e) {
    if (msg) msg.textContent = "Network error: " + (e.message || e);
    setDebug({ error: e.message || e });
  }
}

  async function loadMappings() {
    const list = document.getElementById("ext-mappings-list");
    if (list) list.textContent = "Loading...";
    try {
      let data = null;
      try {
        data = await fetchJSONWithFallback("/mappings");
      } catch (e) {
        data = null;
      }
      const local = getLocalMappings();
      const merged = Object.assign({}, data || {}, local || {});
      const now = Date.now();
      for (const upc of Object.keys(merged || {})) {
        const m = merged[upc];
        const expires = m && m.data && (m.data._expiresAt || m._expiresAt);
        if (merged[upc].data && !merged[upc].data._expiresAt) {
          if (merged[upc]._expiresAt) delete merged[upc]._expiresAt;
        }

        if (expires) {
          const t = Date.parse(expires);
          if (!isNaN(t) && t < now) {
            try {
              await fetchJSONWithFallback(
                "/mappings?upc=" + encodeURIComponent(upc),
                { method: "DELETE" },
              );
            } catch (e) {
              const lm = getLocalMappings();
              if (lm[upc]) {
                delete lm[upc];
                saveLocalMappings(lm);
              }
            }
            delete merged[upc];
          }
        }
      }
      await renderMappings(merged || {});
    } catch (e) {
      if (list)
        list.textContent = "Failed to load mappings: " + (e.message || e);
    }
  }

  async function renderMappings(obj) {
    const list = document.getElementById("ext-mappings-list");
    const rows = Object.keys(obj || {}).sort((a, b) => {
      const getTitle = (upc) => {
        const mapping = obj[upc];
        const data = mapping?.data || mapping || {};

        const name = data.product_name || data.title || data.food_name || "";

        return name.trim().toLowerCase();
      };

      return getTitle(a).localeCompare(getTitle(b));
    });
    if (!rows.length) {
      if (list)
        list.innerHTML = '<div style="color:#666">No saved products.</div>';
      return;
    }
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML =
      '<tr><th style="width:22%">UPC</th><th>Product</th><th style="width:18%">Inserted</th><th style="width:14%">Expires</th><th style="width:120px"></th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const upc of rows) {
      const mapping = obj[upc];
      const mappingObj = mapping && mapping.data ? mapping.data : mapping || {};
      let name =
        mappingObj.product_name ||
        mappingObj.title ||
        mappingObj.food_name ||
        "";
      let brand = mappingObj.brands || mappingObj.brand_name || "";
      const inserted = mappingObj._insertedAt || mapping._insertedAt || "";
      const expires = mappingObj._expiresAt || "";
      const tr = document.createElement("tr");
      const insertedShort = inserted
        ? new Date(inserted).toLocaleDateString()
        : "";
      const expiresShort = expires
        ? new Date(expires).toLocaleDateString()
        : "";
      tr.innerHTML = `<td style="font-weight:700">${upc}</td><td class="ext-prod-cell">${name}<div style="color:#666;font-size:12px">${brand}</div></td><td class="ext-inserted-cell">${insertedShort}</td><td class="ext-expires-cell">${expiresShort}</td><td style="text-align:right"></td>`;
      const actionsCell = tr.querySelector("td:last-child");

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "ext-btn";
      btnDel.style.marginLeft = "8px";
      btnDel.textContent = "Delete";
      btnDel.onclick = async () => {
        try {
          let deleted = false;
          try {
            const r = await fetchJSONWithFallback(
              "/mappings?upc=" + encodeURIComponent(upc),
              { method: "DELETE" },
            );
            if (r && r.ok) deleted = true;
          } catch (e) {
            deleted = false;
          }
          if (!deleted) {
            const lm = getLocalMappings();
            if (lm[upc]) {
              delete lm[upc];
              saveLocalMappings(lm);
              deleted = true;
            }
          }
          if (deleted) loadMappings();
          else alert("Delete failed");
        } catch (e) {
          alert("Delete failed: " + (e.message || e));
        }
      };
      actionsCell.appendChild(btnDel);
      tbody.appendChild(tr);
      if (!name) {
        (async function fill() {
          try {
            const res = await fetchJSONWithFallback(
              "/product?upc=" + encodeURIComponent(upc),
            );
            if (res && res.found && res.product) {
              const prod = res.product;
              const prodName =
                prod.product_name ||
                prod.title ||
                prod.food_name ||
                prod.name ||
                "";
              const prodBrand =
                prod.brands || prod.brand || prod.brand_name || "";
              const cell = tr.querySelector(".ext-prod-cell");
              if (cell) {
                cell.innerHTML = `${prodName}<div style="color:#666;font-size:12px">${prodBrand}</div>`;
              }
            }
          } catch (e) {
            /* ignore per-row fetch errors */
          }
        })();
      }
    }
    table.appendChild(tbody);
    if (list) {
      list.innerHTML = "";
      list.appendChild(table);
      setTimeout(() => {
  const tbody = document.querySelector("#ext-mappings table tbody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll("tr"));

  rows.sort((a, b) => {
    const aText = a.querySelector(".ext-prod-cell")?.innerText?.trim().toLowerCase() || "";
    const bText = b.querySelector(".ext-prod-cell")?.innerText?.trim().toLowerCase() || "";
    return aText.localeCompare(bText);
  });

  rows.forEach(r => tbody.appendChild(r));
}, 500);
    }
  }

  function showManualAssist(upc) {
    const existing = document.getElementById("ext-assist");
    if (existing) existing.remove();
    const modal = document.getElementById("ext-overlay-modal");
    if (!modal) return;
    const wrapper = document.createElement("div");
    wrapper.id = "ext-assist";
    wrapper.style.marginTop = "10px";
    wrapper.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px">Manual mapping assistant</div>
      <div style="display:flex;gap:8px">
        <button id="ext-search-web" class="ext-btn secondary">Search web</button>
        <button id="ext-upload-image" class="ext-btn">Upload image</button>
        <button id="ext-enter-name" class="ext-btn">Enter name</button>
      </div>
      <div id="ext-assist-msg" style="margin-top:8px;color:#333;font-size:13px"></div>
    `;
    modal.appendChild(wrapper);
    document.getElementById("ext-search-web").onclick = () => {
      window.open(
        "https://www.google.com/search?q=" + encodeURIComponent(upc),
        "_blank",
      );
    };
    document.getElementById("ext-upload-image").onclick = async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const lm = getLocalMappings();
          lm[upc] = {
            source: "local",
            data: {
              product_name: "",
              images: [dataUrl],
              _insertedAt: new Date().toISOString(),
            },
          };
          saveLocalMappings(lm);
          document.getElementById("ext-assist-msg").textContent =
            "Image saved locally.";
          loadMappings();
        };
        reader.readAsDataURL(f);
      };
      input.click();
    };
    document.getElementById("ext-enter-name").onclick = () => {
      const name = prompt("Enter product name for UPC " + upc);
      if (!name) return;
      const lm = getLocalMappings();
      lm[upc] = {
        source: "local",
        data: {
          product_name: name,
          images: [],
          _insertedAt: new Date().toISOString(),
        },
      };
      saveLocalMappings(lm);
      document.getElementById("ext-assist-msg").textContent =
        "Name saved locally.";
      loadMappings();
    };
  }

  function insertProductToPageFromProduct(product, upc) {
    const firstImage =
      (product.images &&
        product.images.length &&
        (Array.isArray(product.images) ? product.images[0] : product.images)) ||
      product.image ||
      "";
    const item = {
      UPC: upc,
      TITLE:
        product.product_name || product.food_name || product.title || "Unknown",
      BRAND: product.brands || product.brand_name || product.manufacturer || "",
      DESCRIPTION:
        product.description ||
        product.generic_name ||
        product.ingredients_text ||
        "",
      IMAGES: firstImage || "",
      name:
        product.product_name || product.food_name || product.title || "Unknown",
      brand: product.brands || product.brand_name || product.manufacturer || "",
      description:
        product.description ||
        product.generic_name ||
        product.ingredients_text ||
        "",
      productImg: firstImage || "",
    };
    if (window.allProducts && Array.isArray(window.allProducts)) {
      const exists = window.allProducts.some(
        (it) => it.upc == upc || it.UPC == upc || it.TITLE == item.TITLE,
      );
      if (!exists) {
        window.allProducts.unshift(item);
        if (typeof window.renderProducts === "function")
          window.renderProducts(window.allProducts);
      }
    } else {
      const container = document.getElementById("menu-container");
      if (!container) return;
      const card = document.createElement("div");
      card.className = "menu-item";
      card.innerHTML = `<div class="image-wrapper"><img src="${item.IMAGES || "https://placehold.jp/24/cccccc/ffffff/300x300.png?text=No+Image"}" class="product-img"></div><div class="info-tray"><div class="brand-name">${item.BRAND || "Generic"}</div><div class="product-name">${item.TITLE}</div></div>`;
      container.insertBefore(card, container.firstChild);
    }
  }

  let _videoStream = null;
  async function startScan(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.currentTarget)
      try {
        e.currentTarget.blur();
      } catch (_) {}
    const msg = document.getElementById("ext-msg");
    if (window.BarcodeDetector) {
      const formats = BarcodeDetector.getSupportedFormats().catch(() => [
        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "code_128",
      ]);
      const detector = new BarcodeDetector({ formats: await formats });
      const video = document.createElement("video");
      video.style.width = "100%";
      video.style.height = "auto";
      const modal = document.getElementById("ext-overlay-modal");
      modal.appendChild(video);
      try {
        _videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        video.srcObject = _videoStream;
        video.play();
        if (msg) msg.textContent = "Point camera at barcode...";
        const loop = async () => {
          try {
            const res = await detector.detect(video);
            if (res && res.length) {
              const code = res[0].rawValue || res[0].rawBarcode;
              const upcEl = document.getElementById("ext-upc");
              if (upcEl) upcEl.value = code;
              if (msg) msg.textContent = "Scanned: " + code;
              stopScan(video);
              return;
            }
          } catch (e) {}
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch (e) {
        if (msg) msg.textContent = "Camera error: " + (e.message || e);
        if (video.parentNode) video.parentNode.removeChild(video);
      }
    } else {
      const upc = prompt("Scan Barcode:");
      if (upc) {
        const upcEl = document.getElementById("ext-upc");
        if (upcEl) upcEl.value = upc;
      }
    }
  }
  function stopScan(video) {
    if (_videoStream) {
      _videoStream.getTracks().forEach((t) => t.stop());
      _videoStream = null;
    }
    if (video && video.parentNode) video.parentNode.removeChild(video);
  }

  function getLocalMappings() {
    try {
      const s = localStorage.getItem("ext_mappings");
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  }
  function saveLocalMappings(obj) {
    try {
      localStorage.setItem("ext_mappings", JSON.stringify(obj));
    } catch (e) {}
  }

  async function lookupUPCItemDBClient(upc) {
    const url =
      "https://api.upcitemdb.com/prod/trial/lookup?upc=" +
      encodeURIComponent(upc);
    try {
      let res = await fetch(url);
      if (!res.ok) {
        const prox =
          "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
        res = await fetch(prox);
        if (!res.ok) return { found: false, status: res.status };
      }
      const raw = await res.json();
      if (raw && raw.items && raw.items.length) {
        const it = raw.items[0];
        let images = [];
        if (Array.isArray(it.images))
          images = it.images
            .filter(Boolean)
            .map((i) => (typeof i === "string" ? i : i.u || ""))
            .filter(Boolean);
        if (!images.length && it.image) images = [it.image];
        it.images = images;
        it.title = it.title || it.name || it.title;
        return { found: true, source: "UPCItemDB", data: it, raw };
      }
      return { found: false, source: "UPCItemDB", raw };
    } catch (e) {
      try {
        const prox =
          "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
        const resp = await fetch(prox);
        if (resp && resp.ok) {
          const raw = await resp.json();
          if (raw && raw.items && raw.items.length) {
            const it = raw.items[0];
            let images = [];
            if (Array.isArray(it.images))
              images = it.images
                .filter(Boolean)
                .map((i) => (typeof i === "string" ? i : i.u || ""))
                .filter(Boolean);
            if (!images.length && it.image) images = [it.image];
            it.images = images;
            it.title = it.title || it.name || it.title;
            return { found: true, source: "UPCItemDB", data: it, raw };
          }
        }
      } catch (_) {}
      return { found: false, source: "UPCItemDB", error: e.message };
    }
  }

  async function lookupOpenFoodFactsClient(upc) {
    try {
      const res = await fetch(
        "https://world.openfoodfacts.org/api/v0/product/" +
          encodeURIComponent(upc) +
          ".json",
      );
      if (!res.ok) return { found: false };
      const raw = await res.json();
      if (raw && raw.status === 1)
        return { found: true, source: "OpenFoodFacts", data: raw.product, raw };
      return { found: false, source: "OpenFoodFacts", raw };
    } catch (e) {
      return { found: false, source: "OpenFoodFacts", error: e.message };
    }
  }

  async function fetchAllOriginsRaw(url) {
    try {
      const proxy =
        "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
      const res = await fetch(proxy);
      if (!res.ok) return null;
      return await res.text();
    } catch (e) {
      return null;
    }
  }

  async function lookupProductPages(upc) {
    const candidates = [
      `https://www.upcitemdb.com/upc/${upc}`,
      `https://www.barcodelookup.com/${upc}`,
      `https://www.gtinsearch.org/?query=${upc}`,
    ];
    for (const url of candidates) {
      try {
        const html = await fetchAllOriginsRaw(url);
        if (!html) continue;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const ogImage =
          doc.querySelector('meta[property="og:image"]') ||
          doc.querySelector('meta[name="og:image"]');
        const ogTitle =
          doc.querySelector('meta[property="og:title"]') ||
          doc.querySelector('meta[name="og:title"]');
        const title =
          (ogTitle && ogTitle.getAttribute("content")) ||
          (doc.querySelector("title") &&
            doc.querySelector("title").innerText) ||
          "";
        const image = ogImage && ogImage.getAttribute("content");
        if (title || image) {
          const product = {
            product_name: title || "",
            brands: "",
            images: image ? [image] : [],
            raw_page: { url, snippet: html.substring(0, 200) },
          };
          return { found: true, source: "page-scrape", product };
        }
      } catch (e) {}
    }
    return { found: false };
  }

  function generateUPCVariants(upc) {
    const variants = new Set();
    const s = (upc || "").trim();
    if (!s) return [];
    variants.add(s);
    variants.add(s.replace(/^0+/, ""));
    variants.add("0" + s);
    variants.add("00" + s);
    if (s.length > 1) variants.add(s.slice(1));
    variants.add(s.slice(-12));
    return Array.from(variants).filter(Boolean);
  }

  async function fetchProductForUPC(upc, mappingData) {
    try {
      const j = await fetchJSONWithFallback(
        "/product?upc=" + encodeURIComponent(upc),
      );
      if (j && j.found) return j;
    } catch (e) {}
    const attempts = [];
    const variants = generateUPCVariants(upc);
    for (const v of variants) {
      try {
        const off = await lookupOpenFoodFactsClient(v);
        attempts.push({ variant: v, result: off });
        if (off && off.found) {
          const prod = off.data;
          const images = [];
          if (prod.image_url) images.push(prod.image_url);
          if (prod.image_small_url) images.push(prod.image_small_url);
          if (prod.image_front_url) images.push(prod.image_front_url);
          const product = {
            product_name:
              prod.product_name ||
              prod.generic_name ||
              (mappingData && mappingData.product_name) ||
              "",
            brands: prod.brands || (mappingData && mappingData.brands) || "",
            images: Array.from(new Set(images)).filter(Boolean),
            raw: prod,
          };
          return { found: true, source: "OpenFoodFacts", product, attempts };
        }
      } catch (e) {
        attempts.push({ variant: v, error: e.message });
      }
    }
    for (const v of variants) {
      try {
        const page = await lookupProductPages(v);
        attempts.push({ variant: v, result: page });
        if (page && page.found)
          return {
            found: true,
            source: page.source,
            product: page.product,
            attempts,
          };
      } catch (e) {
        attempts.push({ variant: v, error: e.message });
      }
    }
    return { found: false, attempts };
  }

  createUI();
  loadMappings();
  window._extOverlay = { addProduct, startScan };
})();
