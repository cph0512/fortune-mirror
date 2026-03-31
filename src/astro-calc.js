/**
 * 西洋占星排盤引擎（基於 circular-natal-horoscope-js）
 */

import CircularHoroscope from 'circular-natal-horoscope-js';
const { Origin, Horoscope } = CircularHoroscope;

const SIGN_CN = {
  Aries:"白羊座", Taurus:"金牛座", Gemini:"雙子座", Cancer:"巨蟹座",
  Leo:"獅子座", Virgo:"處女座", Libra:"天秤座", Scorpio:"天蠍座",
  Sagittarius:"射手座", Capricorn:"摩羯座", Aquarius:"水瓶座", Pisces:"雙魚座",
};

const PLANET_CN = {
  Sun:"太陽", Moon:"月亮", Mercury:"水星", Venus:"金星", Mars:"火星",
  Jupiter:"木星", Saturn:"土星", Uranus:"天王星", Neptune:"海王星",
  Pluto:"冥王星", Chiron:"凱龍", Sirius:"天狼星",
};

const ASPECT_CN = {
  conjunction:"合相(0°)", opposition:"對分(180°)", trine:"三分(120°)",
  square:"四分(90°)", sextile:"六分(60°)",
};

// 預設桃園座標
const DEFAULT_LAT = 24.9936;
const DEFAULT_LNG = 121.3130;

export function calculateAstro(solarYear, solarMonth, solarDay, hour, minute = 0, lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  const origin = new Origin({
    year: solarYear,
    month: solarMonth - 1, // 0-indexed
    date: solarDay,
    hour, minute, second: 0,
    latitude: lat,
    longitude: lng,
  });

  const horoscope = new Horoscope({
    origin,
    houseSystem: 'placidus',
    zodiac: 'tropical',
    aspectPoints: ['bodies', 'points', 'angles'],
    aspectWithPoints: ['bodies', 'points', 'angles'],
    aspectTypes: ['major'],
    language: 'en',
  });

  // 行星
  const planets = horoscope.CelestialBodies.all.map(body => {
    const deg = body.ChartPosition.Ecliptic.DecimalDegrees;
    const signDeg = Math.floor(deg % 30);
    const signMin = Math.floor((deg % 1) * 60);
    return {
      name: PLANET_CN[body.label] || body.label,
      sign: SIGN_CN[body.Sign.label] || body.Sign.label,
      degree: `${signDeg}°${signMin}'`,
      house: body.House?.id || 0,
      retrograde: body.isRetrograde || false,
    };
  });

  // 上升 / 中天
  const asc = horoscope.Ascendant;
  const mc = horoscope.Midheaven;
  const ascDeg = asc.ChartPosition.Ecliptic.DecimalDegrees;
  const mcDeg = mc.ChartPosition.Ecliptic.DecimalDegrees;

  const ascendant = {
    sign: SIGN_CN[asc.Sign.label] || asc.Sign.label,
    degree: `${Math.floor(ascDeg % 30)}°${Math.floor((ascDeg % 1) * 60)}'`,
  };
  const midheaven = {
    sign: SIGN_CN[mc.Sign.label] || mc.Sign.label,
    degree: `${Math.floor(mcDeg % 30)}°${Math.floor((mcDeg % 1) * 60)}'`,
  };

  // 宮頭
  const houses = horoscope.Houses.map(h => {
    const deg = h.ChartPosition.StartPosition.Ecliptic.DecimalDegrees;
    return {
      id: h.id,
      sign: SIGN_CN[h.Sign.label] || h.Sign.label,
      degree: `${Math.floor(deg % 30)}°${Math.floor((deg % 1) * 60)}'`,
    };
  });

  // 相位
  const aspects = (horoscope.Aspects?.all || []).map(asp => ({
    planet1: PLANET_CN[asp.point1Label] || asp.point1Label || '?',
    planet2: PLANET_CN[asp.point2Label] || asp.point2Label || '?',
    type: ASPECT_CN[asp.aspectKey] || asp.label || asp.aspectKey,
    orb: asp.orb?.toFixed(1) || '0',
  }));

  return { planets, ascendant, midheaven, houses, aspects, solarYear, solarMonth, solarDay, hour, minute };
}

export function formatAstro(chart) {
  let text = `## 西洋占星命盤\n\n`;
  text += `### 基本資料\n`;
  text += `- 日期：${chart.solarYear}年${chart.solarMonth}月${chart.solarDay}日 ${chart.hour}:${String(chart.minute).padStart(2,'0')}\n`;
  text += `- 上升點：${chart.ascendant.sign} ${chart.ascendant.degree}\n`;
  text += `- 中天(MC)：${chart.midheaven.sign} ${chart.midheaven.degree}\n\n`;

  text += `### 行星位置\n`;
  text += `| 行星 | 星座 | 度數 | 宮位 | 逆行 |\n`;
  text += `|------|------|------|------|------|\n`;
  for (const p of chart.planets) {
    text += `| ${p.name} | ${p.sign} | ${p.degree} | 第${p.house}宮 | ${p.retrograde ? "R" : "-"} |\n`;
  }

  text += `\n### 宮頭\n`;
  text += `| 宮位 | 星座 | 度數 |\n`;
  text += `|------|------|------|\n`;
  for (const h of chart.houses) {
    text += `| 第${h.id}宮 | ${h.sign} | ${h.degree} |\n`;
  }

  text += `\n### 主要相位\n`;
  text += `| 行星1 | 相位 | 行星2 | 容許度 |\n`;
  text += `|-------|------|-------|--------|\n`;
  for (const a of chart.aspects) {
    text += `| ${a.planet1} | ${a.type} | ${a.planet2} | ${a.orb}° |\n`;
  }

  return text;
}
