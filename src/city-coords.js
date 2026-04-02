/**
 * 城市經緯度對照表（占星排盤用）
 * 分區：台灣、中國大陸、東南亞、東亞、歐美、其他
 */

const CITY_COORDS = [
  // === 台灣 ===
  { name: "台北", lat: 25.0330, lng: 121.5654, group: "台灣" },
  { name: "新北", lat: 25.0170, lng: 121.4628, group: "台灣" },
  { name: "桃園", lat: 24.9936, lng: 121.3130, group: "台灣" },
  { name: "新竹", lat: 24.8138, lng: 120.9675, group: "台灣" },
  { name: "苗栗", lat: 24.5602, lng: 120.8214, group: "台灣" },
  { name: "台中", lat: 24.1477, lng: 120.6736, group: "台灣" },
  { name: "彰化", lat: 24.0518, lng: 120.5161, group: "台灣" },
  { name: "南投", lat: 23.9610, lng: 120.9718, group: "台灣" },
  { name: "雲林", lat: 23.7092, lng: 120.4313, group: "台灣" },
  { name: "嘉義", lat: 23.4801, lng: 120.4491, group: "台灣" },
  { name: "台南", lat: 22.9998, lng: 120.2270, group: "台灣" },
  { name: "高雄", lat: 22.6273, lng: 120.3014, group: "台灣" },
  { name: "屏東", lat: 22.6827, lng: 120.4866, group: "台灣" },
  { name: "宜蘭", lat: 24.7570, lng: 121.7533, group: "台灣" },
  { name: "花蓮", lat: 23.9910, lng: 121.6011, group: "台灣" },
  { name: "台東", lat: 22.7583, lng: 121.1444, group: "台灣" },
  { name: "基隆", lat: 25.1276, lng: 121.7392, group: "台灣" },
  { name: "澎湖", lat: 23.5711, lng: 119.5793, group: "台灣" },
  { name: "金門", lat: 24.4493, lng: 118.3767, group: "台灣" },

  // === 中國大陸 ===
  { name: "北京", lat: 39.9042, lng: 116.4074, group: "中國" },
  { name: "上海", lat: 31.2304, lng: 121.4737, group: "中國" },
  { name: "廣州", lat: 23.1291, lng: 113.2644, group: "中國" },
  { name: "深圳", lat: 22.5431, lng: 114.0579, group: "中國" },
  { name: "成都", lat: 30.5728, lng: 104.0668, group: "中國" },
  { name: "重慶", lat: 29.4316, lng: 106.9123, group: "中國" },
  { name: "杭州", lat: 30.2741, lng: 120.1551, group: "中國" },
  { name: "南京", lat: 32.0603, lng: 118.7969, group: "中國" },
  { name: "武漢", lat: 30.5928, lng: 114.3055, group: "中國" },
  { name: "西安", lat: 34.3416, lng: 108.9398, group: "中國" },
  { name: "長沙", lat: 28.2282, lng: 112.9388, group: "中國" },
  { name: "廈門", lat: 24.4798, lng: 118.0894, group: "中國" },
  { name: "福州", lat: 26.0745, lng: 119.2965, group: "中國" },
  { name: "天津", lat: 39.3434, lng: 117.3616, group: "中國" },
  { name: "瀋陽", lat: 41.8057, lng: 123.4315, group: "中國" },
  { name: "大連", lat: 38.9140, lng: 121.6147, group: "中國" },
  { name: "哈爾濱", lat: 45.8038, lng: 126.5350, group: "中國" },
  { name: "昆明", lat: 25.0389, lng: 102.7183, group: "中國" },

  // === 香港澳門 ===
  { name: "香港", lat: 22.3193, lng: 114.1694, group: "港澳" },
  { name: "澳門", lat: 22.1987, lng: 113.5439, group: "港澳" },

  // === 東亞 ===
  { name: "東京", lat: 35.6762, lng: 139.6503, group: "東亞" },
  { name: "大阪", lat: 34.6937, lng: 135.5023, group: "東亞" },
  { name: "首爾", lat: 37.5665, lng: 126.9780, group: "東亞" },
  { name: "釜山", lat: 35.1796, lng: 129.0756, group: "東亞" },

  // === 東南亞 ===
  { name: "新加坡", lat: 1.3521, lng: 103.8198, group: "東南亞" },
  { name: "吉隆坡", lat: 3.1390, lng: 101.6869, group: "東南亞" },
  { name: "曼谷", lat: 13.7563, lng: 100.5018, group: "東南亞" },
  { name: "胡志明市", lat: 10.8231, lng: 106.6297, group: "東南亞" },
  { name: "河內", lat: 21.0278, lng: 105.8342, group: "東南亞" },
  { name: "馬尼拉", lat: 14.5995, lng: 120.9842, group: "東南亞" },
  { name: "雅加達", lat: -6.2088, lng: 106.8456, group: "東南亞" },

  // === 北美 ===
  { name: "紐約", lat: 40.7128, lng: -74.0060, group: "北美" },
  { name: "洛杉磯", lat: 34.0522, lng: -118.2437, group: "北美" },
  { name: "舊金山", lat: 37.7749, lng: -122.4194, group: "北美" },
  { name: "溫哥華", lat: 49.2827, lng: -123.1207, group: "北美" },
  { name: "多倫多", lat: 43.6532, lng: -79.3832, group: "北美" },
  { name: "西雅圖", lat: 47.6062, lng: -122.3321, group: "北美" },
  { name: "芝加哥", lat: 41.8781, lng: -87.6298, group: "北美" },
  { name: "休士頓", lat: 29.7604, lng: -95.3698, group: "北美" },

  // === 歐洲 ===
  { name: "倫敦", lat: 51.5074, lng: -0.1278, group: "歐洲" },
  { name: "巴黎", lat: 48.8566, lng: 2.3522, group: "歐洲" },
  { name: "柏林", lat: 52.5200, lng: 13.4050, group: "歐洲" },
  { name: "阿姆斯特丹", lat: 52.3676, lng: 4.9041, group: "歐洲" },

  // === 大洋洲 ===
  { name: "雪梨", lat: -33.8688, lng: 151.2093, group: "大洋洲" },
  { name: "墨爾本", lat: -37.8136, lng: 144.9631, group: "大洋洲" },
  { name: "奧克蘭", lat: -36.8485, lng: 174.7633, group: "大洋洲" },
];

export default CITY_COORDS;

/**
 * 根據城市名查經緯度，找不到返回 null
 */
export function findCity(name) {
  if (!name) return null;
  const trimmed = name.trim();
  return CITY_COORDS.find(c => c.name === trimmed) || null;
}

/**
 * 按 group 分組
 */
export function getCityGroups() {
  const groups = {};
  for (const c of CITY_COORDS) {
    if (!groups[c.group]) groups[c.group] = [];
    groups[c.group].push(c);
  }
  return groups;
}
