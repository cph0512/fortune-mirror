# 命理三鏡 — Fortune Mirror

## Overview
AI 交叉解盤工具，使用者上傳命盤截圖（八字/西洋占星/紫微斗數），呼叫 Claude API 進行三系統交叉分析。

## Stack
- **Frontend**: React 19 + Vite 8
- **API**: 直接從瀏覽器呼叫 Anthropic Messages API（BYOK 模式，API Key 存 localStorage）
- **Storage**: 全部 localStorage（知識庫、API Key、模型選擇）
- **Build**: `npm run build` → `dist/`

## Project Structure
```
src/
  App.jsx      — 主要元件（解盤、知識庫、設定三個 tab）
  App.css      — 所有樣式
  main.jsx     — React entry
  index.css    — CSS reset / variables
  assets/      — 圖片資源
public/
  favicon.svg  — 網站圖示
  icons.svg    — SVG icons
```

## Key Architecture
- **單檔架構**: 所有元件都在 `App.jsx`（KnowledgeBase, EditorModal, Settings, App）
- **知識庫系統**: 使用者可建立命理知識條目，分析時注入 system prompt
- **四大分類**: bazi(八字), astro(占星), ziwei(紫微), general(通用)
- **API 呼叫**: `fetch("https://api.anthropic.com/v1/messages")` with `anthropic-dangerous-direct-browser-access` header

## Dev Commands
```bash
npm install
npm run dev      # Vite dev server
npm run build    # Production build
npm run preview  # Preview production build
```

## Conventions
- 繁體中文 UI
- CSS custom properties 定義在 index.css
- 無後端、無資料庫、純前端 SPA
- 圖片上傳轉 base64 傳送給 API

## Security
- API Key 只存瀏覽器 localStorage，不傳到任何後端
- 不要把 API Key 硬編碼到原始碼中
