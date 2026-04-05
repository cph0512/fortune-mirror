/**
 * 城市搜尋模組 — Fuse.js 模糊搜尋，支援中/英/日
 */

import Fuse from 'fuse.js';

let fuseInstance = null;
let citiesData = null;

/**
 * 載入城市資料（lazy load）
 */
async function loadCities() {
  if (citiesData) return citiesData;
  const module = await import('./cities-data.json');
  citiesData = module.default || module;
  return citiesData;
}

/**
 * 取得 Fuse 搜尋實例
 */
async function getFuse() {
  if (fuseInstance) return fuseInstance;
  const cities = await loadCities();
  fuseInstance = new Fuse(cities, {
    keys: [
      { name: 'n', weight: 0.4 },   // English name
      { name: 'zh', weight: 0.35 },  // Chinese name
      { name: 'ja', weight: 0.25 },  // Japanese name
    ],
    threshold: 0.3,
    distance: 100,
    minMatchCharLength: 2,
    includeScore: true,
  });
  return fuseInstance;
}

/**
 * 搜尋城市
 * @param {string} query - 搜尋字串（中/英/日）
 * @param {number} limit - 回傳筆數上限
 * @returns {Promise<Array>} [{ id, name, nameZh, nameJa, country, lat, lng, timezone }]
 */
export async function searchCities(query, limit = 10) {
  if (!query || query.length < 1) return [];
  const fuse = await getFuse();
  const results = fuse.search(query, { limit });
  return results.map(r => ({
    id: r.item.id,
    name: r.item.n,
    nameZh: r.item.zh || r.item.n,
    nameJa: r.item.ja || r.item.n,
    country: r.item.c,
    lat: r.item.la,
    lng: r.item.ln,
    timezone: r.item.tz,
    score: r.score,
  }));
}

/**
 * 根據 ID 查找城市
 */
export async function getCityById(id) {
  const cities = await loadCities();
  const city = cities.find(c => c.id === id);
  if (!city) return null;
  return {
    id: city.id,
    name: city.n,
    nameZh: city.zh || city.n,
    nameJa: city.ja || city.n,
    country: city.c,
    lat: city.la,
    lng: city.ln,
    timezone: city.tz,
  };
}
