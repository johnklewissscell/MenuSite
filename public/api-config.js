(function (root, factory) {
  const apiConfig = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = apiConfig;
  }

  root.MenuSiteApi = apiConfig;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function getProductionOrigin() {
    return (typeof globalThis !== "undefined" && globalThis.MENU_API_URL) || "";
  }

  function getApiOriginCandidates() {
    const origin = getProductionOrigin();
    return origin ? [origin] : [];
  }

  function getApiUrls(path) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const origins = getApiOriginCandidates();

    return [...origins.map((origin) => `${origin}${normalizedPath}`), normalizedPath];
  }

  return {
    getProductionOrigin,
    getApiOriginCandidates,
    getApiUrls,
  };
});
