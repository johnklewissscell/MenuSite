(function (root, factory) {
  const apiConfig = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = apiConfig;
  }

  root.MenuSiteApi = apiConfig;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_PORTS = [3000, 3001, 3002, 3003, 3004, 3005];

  function getApiOriginCandidates(ports = DEFAULT_PORTS) {
    const origins = [];
    const seen = new Set();

    function add(origin) {
      if (origin && !seen.has(origin)) {
        origins.push(origin);
        seen.add(origin);
      }
    }

    for (const port of ports) {
      add(`http://localhost:${port}`);
      add(`http://127.0.0.1:${port}`);
    }

    return origins;
  }

  function getApiUrls(path, ports = DEFAULT_PORTS) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const origins = getApiOriginCandidates(ports);

    return [...origins.map((origin) => `${origin}${normalizedPath}`), normalizedPath];
  }

  return {
    DEFAULT_PORTS,
    getApiOriginCandidates,
    getApiUrls,
  };
});
