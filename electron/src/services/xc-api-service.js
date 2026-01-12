// xcapi.js
// Drop-in XC API caller with TTL cache + strong debug logging.
// Usage:
//   const { callXCAPI, clearXCAPICache, getXCAPICacheStats } = require("./xcapi");
//   const res = await callXCAPI({ server, username, password, action: "get_vod_categories" });
//
// Notes:
// - Works in Node/Electron main/preload. If you use ESM, see the export section at bottom.
// - By default it logs MISS -> FETCH with the full URL (password is masked in logs).

const axios = require("axios");

// ====== Config ======
const CACHE_TTL = 5 * 60 * 1000;      // 5 minutes
const API_TIMEOUT = 20 * 1000;        // 20 seconds
const DEFAULT_USER_AGENT = "ChrisFlix/1.0 (XCAPI)";

// ====== In-memory cache ======
const apiCache = new Map();

/**
 * Build a stable cache key. Normalizes server (removes trailing slashes) and
 * stabilizes extraParams key order so JSON stringify is consistent.
 */
function makeCacheKey({ server, username, action, extraParams }) {
  const normalizedServer = String(server || "").replace(/\/+$/, "");
  const stableExtraParams = stableObject(extraParams || {});
  return JSON.stringify({
    server: normalizedServer,
    username: username || "",
    action: action || "",
    extraParams: stableExtraParams,
  });
}

/** Deep-stable object (sort keys) so cache keys don't change due to insertion order. */
function stableObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stableObject);

  const out = {};
  Object.keys(obj)
    .sort()
    .forEach((k) => {
      out[k] = stableObject(obj[k]);
    });
  return out;
}

/** Mask password for logs (keeps first/last char if present). */
function maskSecret(s) {
  const str = String(s ?? "");
  if (str.length <= 2) return "*".repeat(str.length);
  return str[0] + "*".repeat(Math.min(8, str.length - 2)) + str[str.length - 1];
}

/** Build the API URL with query params. */
function buildXCUrl({ server, username, password, action, extraParams }) {
  const base = String(server || "").replace(/\/+$/, "");
  if (!base) throw new Error("XCAPI: 'server' is empty/undefined");
  if (!username) throw new Error("XCAPI: 'username' is empty/undefined");
  if (!password) throw new Error("XCAPI: 'password' is empty/undefined");
  if (!action) throw new Error("XCAPI: 'action' is empty/undefined");

  const apiUrl = new URL(`${base}/player_api.php`);
  apiUrl.searchParams.append("username", username);
  apiUrl.searchParams.append("password", password);
  apiUrl.searchParams.append("action", action);

  const params = extraParams || {};
  Object.entries(params).forEach(([key, val]) => {
    if (val === undefined || val === null) return;
    apiUrl.searchParams.append(key, String(val));
  });

  return apiUrl;
}

/**
 * Main call: caches per action/extraParams/server/username.
 * Returns: { success, data?, error?, fromCache?, url? }
 */
async function callXCAPI({
  server,
  username,
  password,
  action,
  extraParams = {},
  bypassCache = false,
  debug = true,
} = {}) {
  const now = Date.now();
  const cacheKey = makeCacheKey({ server, username, action, extraParams });

  if (bypassCache && debug) {
    console.log(`[Cache] Manual bypass for ${action}`);
  }

  // Cache check
  if (!bypassCache && apiCache.has(cacheKey)) {
    const entry = apiCache.get(cacheKey);
    const age = now - entry.timestamp;

    if (age < CACHE_TTL) {
      if (debug) {
        console.log(`[Cache] HIT: ${action} (Age: ${(age / 1000).toFixed(1)}s)`);
      }
      return { success: true, data: entry.data, fromCache: true };
    }

    if (debug) {
      console.log(`[Cache] EXPIRED: ${action} (Age: ${(age / 1000).toFixed(1)}s)`);
    }
  } else if (!bypassCache && debug) {
    console.log(`[Cache] MISS: ${action}`);
  }

  // Fetch
  try {
    const apiUrl = buildXCUrl({ server, username, password, action, extraParams });

    if (debug) {
      // Log full URL but mask password in log output
      const safeUrl = new URL(apiUrl.toString());
      safeUrl.searchParams.set("password", maskSecret(password));
      console.log(`[XCAPI] MISS->FETCH action=${action}`);
      console.log(`[XCAPI] URL: ${safeUrl.toString()}`);
      console.log(`[XCAPI] axios.get exists? ${!!axios?.get}`);
    }

    const response = await axios.get(apiUrl.toString(), {
      timeout: API_TIMEOUT,
      headers: { "User-Agent": DEFAULT_USER_AGENT },
      // If you're running in Electron renderer and need cookies/credentials,
      // uncomment the next line:
      // withCredentials: true,
    });

    if (debug) {
      console.log(`[XCAPI] OK action=${action} status=${response.status}`);
    }

    // Store in cache
    apiCache.set(cacheKey, { data: response.data, timestamp: now });

    return { success: true, data: response.data, fromCache: false };
  } catch (error) {
    // Print full error details to avoid "silent" failures
    if (debug) {
      console.error(`XC API Error (${action}) full:`, error);
      console.error(`XC API Error (${action}) message:`, error?.message);
      if (error?.response) {
        console.error(`XC API Error (${action}) status:`, error.response.status);
        console.error(`XC API Error (${action}) data:`, error.response.data);
      }
    } else {
      console.error(`XC API Error (${action}):`, error?.message || String(error));
    }

    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

/** Clears the entire cache. */
function clearXCAPICache() {
  apiCache.clear();
}

/** Optional: remove only expired entries. */
function pruneXCAPICache() {
  const now = Date.now();
  let removed = 0;

  for (const [k, v] of apiCache.entries()) {
    if (!v || !v.timestamp || now - v.timestamp >= CACHE_TTL) {
      apiCache.delete(k);
      removed += 1;
    }
  }

  return removed;
}

/** Optional stats for debugging. */
function getXCAPICacheStats() {
  const now = Date.now();
  let fresh = 0;
  let expired = 0;

  for (const v of apiCache.values()) {
    if (!v || !v.timestamp) continue;
    const age = now - v.timestamp;
    if (age < CACHE_TTL) fresh += 1;
    else expired += 1;
  }

  return {
    size: apiCache.size,
    fresh,
    expired,
    ttlMs: CACHE_TTL,
  };
}

// ====== CommonJS exports (Node/Electron default) ======
module.exports = {
  callXCAPI,
  clearXCAPICache,
  pruneXCAPICache,
  getXCAPICacheStats,
};

/*
===== If your project is ESM (type: "module"), replace exports with:

export { callXCAPI, clearXCAPICache, pruneXCAPICache, getXCAPICacheStats };

And replace the axios import with:
import axios from "axios";
*/
