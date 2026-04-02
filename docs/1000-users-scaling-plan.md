# 命理三鏡 — 千人同時在線規格與規劃書

> 版本: 1.0 | 日期: 2026-04-02
> 目標: 支撐 1,000 人同時算命、10,000 MAU

---

## 一、現況分析

### 1.1 現有架構

```
使用者瀏覽器 (React SPA)
    │
    ├── fortune-wizard-test (GitHub Pages)    ← 靜態前端
    │
    └── POST /api/fortune ──→ bot.velopulse.io:8787
                                  │
                                  ├── scheduler.py (aiohttp, 單進程)
                                  ├── Claude CLI subprocess (600s timeout)
                                  ├── fortune_users.json (純文字密碼)
                                  ├── fortune_history.json (2.7MB, 持續增長)
                                  └── Mac mini 4核 / 8GB RAM
```

### 1.2 現有瓶頸

| 瓶頸 | 影響 | 嚴重度 |
|------|------|--------|
| 單進程 Claude CLI | 每個分析 10 分鐘 timeout，最多同時 6 個 | 🔴 致命 |
| JSON 檔案當資料庫 | 併發寫入會損壞資料 | 🔴 致命 |
| 無密碼雜湊 | 明文密碼存 JSON | 🔴 致命 |
| CORS 全開 (`*`) | 任何網站都能呼叫 API | 🔴 致命 |
| 無 Rate Limiting | 可無限灌爆 API | 🟠 高 |
| 無 HTTPS（直連） | 密碼明文傳輸 | 🟠 高 |
| Mac mini 4核/8GB | 不適合生產環境 | 🟠 高 |
| 無監控 | 掛了不知道 | 🟡 中 |

### 1.3 容量估算（現況）

- 最大同時在線: **5-10 人**
- 每小時處理: **~6 次分析**
- 資料庫上限: **~15,000 筆後開始卡頓**

---

## 二、目標架構

### 2.1 架構圖

```
                    ┌──────────────────┐
                    │   Cloudflare     │
                    │   CDN + WAF      │
                    │   DDoS 防護      │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───┐  ┌──────▼─────┐  ┌─────▼──────┐
     │  靜態前端   │  │  API 閘道   │  │  圖片 CDN   │
     │  Cloudflare │  │  Cloud Run  │  │  R2/S3     │
     │  Pages     │  │  (自動擴展)  │  │            │
     └────────────┘  └──────┬──────┘  └────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
     ┌────────▼───┐  ┌─────▼─────┐  ┌───▼──────┐
     │ Anthropic   │  │ PostgreSQL │  │  Redis   │
     │ API 直連    │  │ (Supabase) │  │ (Upstash)│
     │ SDK 呼叫    │  │            │  │          │
     └────────────┘  └───────────┘  └──────────┘
```

### 2.2 關鍵改動

| 層級 | 現有 | 目標 | 原因 |
|------|------|------|------|
| **前端** | GitHub Pages | Cloudflare Pages | 全球 CDN、免費無限頻寬 |
| **API** | Mac mini + aiohttp | GCP Cloud Run (容器) | 自動擴展 0→100 實例 |
| **AI** | Claude CLI subprocess | Anthropic SDK 直連 | 支援串流、prompt cache、併發 |
| **資料庫** | JSON 檔案 | PostgreSQL (Supabase) | ACID 交易、併發安全 |
| **快取** | 無 | Redis (Upstash) | Session、Rate Limit、結果快取 |
| **圖片** | 本地磁碟 | Cloudflare R2 / S3 | CDN 加速、自動清理 |
| **安全** | 無 | Cloudflare WAF + 應用層防護 | DDoS、SQL 注入、XSS |

---

## 三、伺服器規格

### 3.1 API 伺服器 (Cloud Run)

```yaml
# 每個容器實例
vCPU:    2
Memory:  2 GB
Max Instances:  50   # 自動擴展上限
Min Instances:  2    # 保持 warm，避免冷啟動
Concurrency:    20   # 每個實例同時處理 20 請求
Timeout:        900s # 算命需要較長時間

# 計算
# 1000 同時 × 平均 60 秒/請求 = 需要 50 個實例
# 尖峰: 50 實例 × 2 vCPU = 100 vCPU
# 離峰: 2 實例 × 2 vCPU = 4 vCPU
```

### 3.2 資料庫 (PostgreSQL)

```yaml
# Supabase Pro + Compute Add-on
Compute:   Large (4 vCPU / 8 GB RAM)
Storage:   100 GB (自動擴展)
連線數:    200 (透過 connection pooler)
備份:      每日自動 + PITR (Point-in-Time Recovery)
```

**Schema 設計:**

```sql
-- 使用者表
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    password    VARCHAR(255) NOT NULL,  -- bcrypt 雜湊
    role        VARCHAR(20) DEFAULT 'user',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ,
    activity_count INT DEFAULT 0
);

-- 算命歷史
CREATE TABLE readings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    systems     TEXT[],        -- {'bazi', 'astro', 'ziwei'}
    prompt      TEXT,
    result      TEXT,
    tokens_in   INT,
    tokens_out  INT,
    model       VARCHAR(50),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_readings_user ON readings(user_id, created_at DESC);

-- 追問對話
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id  UUID REFERENCES readings(id),
    role        VARCHAR(20),   -- 'user' or 'assistant'
    content     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 活動紀錄
CREATE TABLE activity_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id),
    action      VARCHAR(50),
    detail      JSONB,
    ip          INET,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
```

### 3.3 Redis (Upstash)

```yaml
用途:
  - Session 管理 (JWT refresh token)
  - Rate Limiting (滑動視窗)
  - 排盤結果快取 (相同生辰 = 相同排盤)
  - 任務佇列 (分析工作排程)

規格:
  Max Memory:   10 GB
  Max Commands:  10,000/s
  區域:          Asia (東京 or 新加坡)
```

### 3.4 前端 CDN

```yaml
Cloudflare Pages:
  頻寬:    無限
  Build:   自動 (GitHub push 觸發)
  邊緣節點: 全球 300+
  
自訂域名:  fortune.velopulse.io
```

---

## 四、資安防護規劃

### 4.1 防護層級

```
第一層: Cloudflare (邊緣防護)
├── DDoS 防護 (L3/L4/L7 自動)
├── WAF 規則 (OWASP Top 10)
├── Bot 管理 (Challenge 頁面)
├── Rate Limiting (邊緣限流)
└── IP 黑名單 / 地理封鎖

第二層: API 閘道 (應用層)
├── JWT 驗證 (每個請求)
├── 請求驗證 (Schema 檢查)
├── CORS 白名單
├── Rate Limiting (Per-User)
└── Input 消毒 (防 Prompt Injection)

第三層: 資料層
├── 密碼雜湊 (bcrypt, cost=12)
├── 資料庫連線加密 (SSL)
├── 敏感欄位加密 (AES-256)
├── 最小權限原則
└── 審計日誌
```

### 4.2 具體防護措施

#### DDoS 防護
```
Cloudflare 方案:
- L3/L4: 自動緩解，所有方案均含
- L7: WAF 規則 + Rate Limiting
- Challenge 模式: 可疑流量顯示驗證頁

Rate Limiting 規則:
- 全域:   300 req/min per IP
- 登入:   10 req/min per IP (防暴力破解)
- 算命:   5 req/min per user (控成本)
- 註冊:   3 req/hour per IP (防灌帳號)
```

#### 認證與授權
```python
# JWT 架構
Access Token:  15 分鐘有效，存 memory
Refresh Token: 7 天有效，存 httpOnly cookie + Redis

# 密碼策略
最低 8 字元
bcrypt cost factor = 12
失敗 5 次鎖定 15 分鐘

# 角色權限
guest:  免費排盤 1 次/天
user:   不限排盤，10 次追問/天
premium: 不限排盤，不限追問，進階分析
admin:  完整管理權限
```

#### Prompt Injection 防護
```python
# 系統指令注入防護
def sanitize_system_prompt(user_prompt):
    """防止使用者透過 system prompt 注入指令"""
    blocked = [
        "ignore previous",
        "ignore above",
        "disregard",
        "new instructions",
        "system:",
        "assistant:",
    ]
    lower = user_prompt.lower()
    for phrase in blocked:
        if phrase in lower:
            raise ValueError("Invalid prompt content")
    
    # 長度限制
    if len(user_prompt) > 10000:
        raise ValueError("Prompt too long")
    
    return user_prompt
```

#### CORS 配置
```python
ALLOWED_ORIGINS = [
    "https://fortune.velopulse.io",
    "https://cph0512.github.io",
]

# 只允許白名單網域
if origin not in ALLOWED_ORIGINS:
    return Response(status=403)
```

#### 資料保護
```
個資處理:
- 生辰資料: AES-256 加密儲存
- Email: 雜湊索引（查詢用）+ 加密儲存
- IP: 只保留 30 天，之後匿名化
- 算命結果: 使用者可要求刪除（GDPR/個資法）

備份:
- 每日自動備份 → 異地儲存
- 保留 30 天歷史備份
- 每季災難恢復演練
```

### 4.3 監控與告警

```yaml
監控項目:
  - API 回應時間 (P50/P95/P99)
  - 錯誤率 (5xx / 4xx)
  - Claude API 延遲和費用
  - 資料庫連線數 / 查詢延遲
  - DDoS 攻擊偵測
  - 異常登入行為

告警管道:
  - Telegram 推播 (即時)
  - Email 通知 (摘要)
  
工具:
  - Cloud Run 內建 metrics
  - Uptime Robot (外部監控)
  - Sentry (錯誤追蹤)
```

---

## 五、API 架構改造

### 5.1 從 CLI 改為 SDK 直連

```python
# 現有: 每次 fork 一個 Claude CLI 進程 (600s timeout)
cmd = [CLAUDE_BIN, "-p", prompt, "--output-format", "text"]
result = subprocess.run(cmd, timeout=600)

# 目標: 使用 Anthropic SDK 直連 (支援串流、prompt cache)
import anthropic
client = anthropic.Anthropic()

async def analyze_fortune(system_prompt, user_prompt, images):
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",  # 成本導向
        max_tokens=4096,
        system=[{
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"}  # Prompt Cache!
        }],
        messages=[{
            "role": "user",
            "content": [
                *[{"type": "image", "source": {"type": "base64", ...}} for img in images],
                {"type": "text", "text": user_prompt}
            ]
        }],
        stream=True  # 串流回應
    )
    return response
```

### 5.2 任務佇列

```
使用者送出 → Redis Queue → Worker 取出 → 呼叫 Anthropic API → 結果存 DB → 通知前端

好處:
- 控制併發數 (不會同時灌爆 API)
- 失敗自動重試
- 公平排隊 (先到先處理)
- 成本可控 (限制 worker 數量)
```

### 5.3 API 端點設計

```
POST   /api/v2/auth/register     # 註冊
POST   /api/v2/auth/login        # 登入
POST   /api/v2/auth/refresh      # 刷新 token

POST   /api/v2/readings          # 送出算命請求
GET    /api/v2/readings/:id      # 查詢結果 (含 SSE 串流)
GET    /api/v2/readings          # 我的歷史
DELETE /api/v2/readings/:id      # 刪除紀錄

POST   /api/v2/readings/:id/chat # 追問
GET    /api/v2/readings/:id/chat # 對話紀錄

GET    /api/v2/usage             # 我的用量
GET    /api/v2/admin/stats       # 管理後台統計 (admin)
GET    /api/v2/admin/users       # 使用者管理 (admin)
```

---

## 六、成本估算

### 6.1 使用情境假設

```
月活躍用戶 (MAU):     10,000 人
同時在線尖峰:         1,000 人
尖峰時段:             每天 8 小時
每用戶每月 session:    2 次
每 session API 呼叫:   5 次 (1 排盤 + 4 追問)
每次呼叫 tokens:       6,000 input + 4,000 output
系統 prompt (可快取):   2,000 tokens
```

### 6.2 方案比較

#### 方案 A: 經濟型 (Haiku 為主)

| 項目 | 月費 (USD) | 說明 |
|------|-----------|------|
| Anthropic API (Haiku) | $1,800 | 含 prompt cache 優化 |
| GCP Cloud Run | $300 | 自動擴展 2-50 實例 |
| Supabase Pro | $150 | PostgreSQL + Auth |
| Upstash Redis | $50 | Session + 快取 |
| Cloudflare Pro | $20 | CDN + WAF |
| 監控 (Sentry) | $26 | 錯誤追蹤 |
| 網域 + 雜項 | $30 | |
| **合計** | **~$2,376/月** | **~NT$73,700** |

#### 方案 B: 品質型 (Sonnet 為主)

| 項目 | 月費 (USD) | 說明 |
|------|-----------|------|
| Anthropic API (Sonnet) | $6,500 | 含 prompt cache 優化 |
| GCP Cloud Run | $300 | |
| Supabase Pro | $150 | |
| Upstash Redis | $50 | |
| Cloudflare Pro | $20 | |
| 監控 (Sentry) | $26 | |
| 網域 + 雜項 | $30 | |
| **合計** | **~$7,076/月** | **~NT$219,400** |

#### 方案 C: 混合型 (推薦)

| 項目 | 月費 (USD) | 說明 |
|------|-----------|------|
| Anthropic API (混合) | $3,200 | Haiku 初步 + Sonnet 深度 |
| GCP Cloud Run | $300 | |
| Supabase Pro | $150 | |
| Upstash Redis | $50 | |
| Cloudflare Pro | $20 | |
| 監控 (Sentry) | $26 | |
| 網域 + 雜項 | $30 | |
| **合計** | **~$3,776/月** | **~NT$117,000** |

混合策略:
- **免費/一般用戶**: Haiku (快速、便宜)
- **付費/深度分析**: Sonnet (精準、詳細)
- **相同生辰快取**: Redis 存結果，重複命盤不重算

### 6.3 成本優化策略

| 策略 | 節省幅度 | 實作難度 |
|------|---------|---------|
| Prompt Caching (系統指令快取) | 80-90% input | 低 |
| 相同命盤結果快取 | 10-30% 整體 | 中 |
| Haiku/Sonnet 分級 | 50% vs 全 Sonnet | 低 |
| Batch API (每日運勢預生成) | 50% 該部分 | 中 |
| 串流 + 提前中斷 | 5-15% output | 低 |
| 限制追問次數 | 控制上限 | 低 |

---

## 七、實施時程

### Phase 1: 安全加固 (第 1-2 週)

```
□ 密碼改 bcrypt 雜湊
□ CORS 白名單
□ Rate Limiting (IP + User)
□ HTTPS 強制 (Cloudflare Proxy)
□ Input 驗證與消毒
□ 移除明文密碼
```

**完成後: 可安全對外開放，但容量仍 ~50 人**

### Phase 2: 資料庫遷移 (第 3-4 週)

```
□ Supabase 建表 (users, readings, conversations, activity_log)
□ 資料遷移腳本 (JSON → PostgreSQL)
□ API 端點改寫 (JSON → SQL)
□ 連線池設定
□ 備份策略
```

**完成後: 併發安全，容量 ~200 人**

### Phase 3: API 改造 (第 5-7 週)

```
□ Claude CLI → Anthropic SDK 直連
□ 串流回應 (SSE)
□ Prompt Caching 實作
□ 任務佇列 (Redis Queue)
□ JWT 認證
□ v2 API 端點
```

**完成後: 可串流、可快取，容量 ~500 人**

### Phase 4: 容器化部署 (第 8-9 週)

```
□ Dockerfile 撰寫
□ Cloud Run 部署
□ 自動擴展設定
□ Cloudflare DNS 切換
□ CI/CD (GitHub Actions)
□ 負載測試 (k6 or locust)
```

**完成後: 自動擴展，容量 1,000+ 人**

### Phase 5: 監控與優化 (第 10-12 週)

```
□ Sentry 錯誤追蹤
□ 自訂 metrics dashboard
□ 告警規則 (Telegram 通知)
□ 成本監控
□ 效能調優
□ 壓力測試與容量驗證
```

**完成後: 生產就緒，可持續監控**

---

## 八、負載測試計畫

### 測試工具: k6 或 Locust

```javascript
// k6 測試腳本範例
export const options = {
    stages: [
        { duration: '2m',  target: 100  },  // 暖機
        { duration: '5m',  target: 500  },  // 升壓
        { duration: '10m', target: 1000 },  // 尖峰
        { duration: '5m',  target: 1000 },  // 持續尖峰
        { duration: '2m',  target: 0    },  // 降壓
    ],
};
```

### 驗收標準

| 指標 | 目標 |
|------|------|
| 回應時間 P95 | < 2 秒 (非 AI 端點) |
| AI 分析完成時間 | < 60 秒 (串流首 token < 3 秒) |
| 錯誤率 | < 0.1% |
| 同時在線 | 1,000 人穩定 |
| CPU 使用率 | < 80% (每實例) |
| 資料庫延遲 | < 50ms P95 |

---

## 九、災難恢復

```
RPO (Recovery Point Objective): 1 小時
RTO (Recovery Time Objective): 15 分鐘

備份:
- PostgreSQL: 每日全備 + 即時 WAL (PITR)
- Redis: AOF 持久化
- 程式碼: GitHub (多重備份)
- 設定: 版本控制

恢復流程:
1. Cloud Run 自動重啟 (容器健康檢查)
2. 資料庫: Supabase 一鍵恢復
3. DNS: Cloudflare 自動 failover
4. 完全重建: < 30 分鐘 (IaC)
```

---

## 十、總結

| 面向 | 現況 | 目標 |
|------|------|------|
| 同時在線 | 5-10 人 | 1,000 人 |
| 資料安全 | 明文 JSON | 加密 PostgreSQL |
| DDoS 防護 | 無 | Cloudflare L3-L7 |
| 自動擴展 | 無 | Cloud Run 0→50 實例 |
| 監控 | 無 | Sentry + 自訂 Dashboard |
| 月費 | ~$0 (Mac mini) | ~$3,776 (混合方案) |
| 實施時間 | - | 12 週 |

**核心結論: 90% 的月費是 Anthropic API 費用。**
基礎設施 (Cloud Run + DB + Redis + CDN) 只佔 ~$576/月。
成本優化的重點在 AI 呼叫策略，不在伺服器。
