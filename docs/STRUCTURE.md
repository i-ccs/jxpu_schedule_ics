# 📁 项目文件结构 - Hono + Fetch API 版

## 完整目录结构

```
schedule-subscription/
├── 📁 src/
│   ├── 📄 server.js              # Hono 主服务器
│   ├── 📄 auth.js                # 认证模块(二维码登录、Fetch API)
│   ├── 📄 db.js                  # 数据库操作模块
│   ├── 📄 parser.js              # 课表解析模块
│   ├── 📄 icaal.js               # ICS 日历生成模块
│   └── 📁 routers/
│       └── 📄 router.js          # Hono 路由配置
│
├── 📄 package.json               # 项目配置(Hono + Fetch)
├── 📄 package-lock.json          # 依赖锁定
├── 📊 schedule_server.db         # SQLite 数据库(自动创建)
│
├── 📁 docs/                      # 文档目录
│   ├── README.md                 # 项目说明(已更新)
│   ├── DEBUG.md                  # 调试指南(已更新)
│   ├── STRUCTURE.md              # 本文件(已更新)
│   └── QUICKSTART.md             # 快速开始(可选)
│
└── 📁 node_modules/              # 依赖包
    ├── hono/
    ├── @hono/node-server/
    ├── cheerio/
    ├── ical-generator/
    ├── sqlite3/
    └── ...
```

---

## 📝 文件说明

### 核心文件

#### `src/server.js` - Hono 主服务器
```javascript
// Hono 框架启动文件
const { Hono } = require('hono');
const { serve } = require('@hono/node-server');

const app = new Hono();
app.route('/', router);  // 挂载路由

serve({
    fetch: app.fetch,
    port: 3000
});
```

**主要功能**:
- ✅ 初始化 Hono 应用
- ✅ 挂载路由模块
- ✅ 启动 HTTP 服务器
- ✅ 数据库初始化

**相比 Express 的优势**:
- 更快的性能(10倍+)
- 更小的包体积
- 更现代的 API 设计

---

#### `src/auth.js` - 认证模块(Fetch API)
```javascript
// 完全基于原生 Fetch API
const https = require('https');

const httpsAgent = new https.Agent({ 
    rejectUnauthorized: false 
});

// 主要函数
- generateQRCode()          // 生成二维码(自动重试3次获取SESSION)
- pollQRCodeStatus()        // 轮询二维码状态
- loginWithStateKey()       // 使用 stateKey 登录获取 TGC
- fetchSchedule()           // 获取课表HTML
```

**核心改进**:
- ✅ 使用原生 Fetch API(Node.js 18+)
- ✅ SESSION Cookie 自动重试机制
- ✅ 完整的 Cookie 传递链
- ✅ 5分钟二维码过期
- ✅ 兼容多种 Node.js 版本的 Cookie 获取方式

---

#### `src/db.js` - 数据库模块
```javascript
// SQLite 数据库操作
const sqlite3 = require('sqlite3').verbose();

// 主要函数
- initDB()              // 初始化数据库
- saveUser()            // 保存用户信息
- getUser()             // 获取用户信息
- updateLastSync()      // 更新同步时间
- markCookieInvalid()   // 标记Cookie过期
- closeDB()             // 关闭数据库
```

**数据库表结构**:
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    cookies TEXT NOT NULL,                -- JSON格式,包含TGC、SESSION等
    semester_start TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync TIMESTAMP,
    cookie_valid INTEGER DEFAULT 1,
    cookie_expired_at TIMESTAMP
);
```

---

#### `src/parser.js` - 课表解析模块
```javascript
// Cheerio HTML 解析
const cheerio = require('cheerio');

// 主要函数
- parseSchedule()       // 解析课表HTML
- parseCourseInfo()     // 解析课程信息
- parseWeeks()          // 解析周次
- parseLesson()         // 解析节次
```

**解析逻辑**:
1. 使用 Cheerio 加载 HTML
2. 查找课表 `<table>`
3. 遍历每个单元格
4. 提取课程名、教师、地点、时间
5. 计算每周的具体日期和时间

---

#### `src/icaal.js` - ICS 生成模块
```javascript
// ICS 日历生成
const ical = require('ical-generator').default;

// 主要函数
- generateICS()         // 生成 ICS 文件
```

**生成的日历事件包含**:
- 课程名称
- 上课时间(开始/结束)
- 上课地点
- 教师姓名
- 提前35分钟提醒

---

#### `src/routers/router.js` - Hono 路由
```javascript
// Hono 路由定义
const { Hono } = require('hono');
const router = new Hono();

// API 路由
router.get('/api/qr/generate', ...)      // 生成二维码
router.post('/api/qr/status', ...)       // 轮询状态
router.post('/api/qr/login', ...)        // 完成登录
router.get('/schedule/:token', ...)      // 课表订阅
router.get('/api/stats', ...)            // 统计数据

// 页面路由
router.get('/', ...)                     // 首页(含前端JS)
```

**路由特点**:
- RESTful API 设计
- 清晰的错误处理
- 完整的前端交互页面

---

#### `package.json` - 项目配置
```json
{
  "name": "schedule-subscription-service",
  "version": "0.2",
  "description": "课表订阅服务 (Hono + Fetch API)",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "dependencies": {
    "hono": "^4.0.0",                    // 🆕 Web 框架
    "@hono/node-server": "^1.8.0",      // 🆕 Node.js 适配器
    "cheerio": "^1.0.0-rc.12",
    "ical-generator": "^4.1.0",
    "sqlite3": "^5.1.6"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  },
  "engines": {
    "node": ">=18.0.0"                   // 🆕 要求支持 Fetch API
  }
}
```

**依赖变化**:
- ❌ 移除 `express`
- ❌ 移除 `axios`
- ✅ 添加 `hono` + `@hono/node-server`
- ✅ 使用原生 Fetch API

---

## 🔄 架构对比

### v0.1 (Express + Axios)
```
┌─────────────┐
│   Express   │ Web 框架
└─────────────┘
       │
┌─────────────┐
│    Axios    │ HTTP 请求
└─────────────┘
       │
┌─────────────┐
│   Cheerio   │ HTML 解析
└─────────────┘
```

### v0.2 (Hono + Fetch API)
```
┌─────────────┐
│    Hono     │ Web 框架(更快)
└─────────────┘
       │
┌─────────────┐
│  Fetch API  │ 原生 HTTP(Node.js 18+)
└─────────────┘
       │
┌─────────────┐
│   Cheerio   │ HTML 解析
└─────────────┘
```

---

## 🚀 快速开始

### 1️⃣ 克隆或创建项目
```bash
mkdir schedule-subscription
cd schedule-subscription
```

### 2️⃣ 创建目录结构
```bash
mkdir -p src/routers
mkdir docs
```

### 3️⃣ 初始化 package.json
```bash
npm init -y
```

### 4️⃣ 安装依赖
```bash
npm install hono @hono/node-server cheerio ical-generator sqlite3
npm install --save-dev nodemon
```

### 5️⃣ 复制源代码
- 从文档中复制 `src/server.js`
- 从文档中复制 `src/auth.js`
- 从文档中复制 `src/db.js`
- 从文档中复制 `src/parser.js`
- 从文档中复制 `src/icaal.js`
- 从文档中复制 `src/routers/router.js`

### 6️⃣ 启动服务(需要自行添加src/auth.js里的COUNT_ID的值)
```bash
npm run dev  # 开发模式
# 或
npm start    # 生产模式
```

### 7️⃣ 访问服务
```
http://localhost:3000
```

---

## 📦 文件创建顺序

如果要手动创建项目,按以下顺序:

1. **项目初始化**
   ```bash
   npm init -y
   npm install hono @hono/node-server cheerio ical-generator sqlite3
   npm install --save-dev nodemon
   ```

2. **创建核心模块**(按依赖顺序)
   ```
   1. src/db.js          # 数据库(无依赖)
   2. src/parser.js      # 解析器(无依赖)
   3. src/icaal.js       # ICS生成(无依赖)
   4. src/auth.js        # 认证(无依赖)
   5. src/routers/router.js  # 路由(依赖以上模块)
   6. src/server.js      # 主服务器(依赖路由和DB)
   ```

3. **配置 package.json scripts**
   ```json
   {
     "scripts": {
       "start": "node src/server.js",
       "dev": "nodemon src/server.js"
     }
   }
   ```

4. **创建 .gitignore**
   ```
   node_modules/
   schedule_server.db
   debug_*.html
   *.log
   ```

---

## 🎯 最小可运行版本

最少需要这些文件:

```
schedule-subscription/
├── src/
│   ├── server.js       # 必需
│   ├── auth.js         # 必需
│   ├── db.js           # 必需
│   ├── parser.js       # 必需
│   ├── icaal.js        # 必需
│   └── routers/
│       └── router.js   # 必需
├── package.json        # 必需
└── node_modules/       # npm install 生成
```

运行:
```bash
npm install
npm start
```

---

## 📊 文件大小参考

```
src/server.js          ~2 KB
src/auth.js            ~15 KB    (包含完整 Fetch API 实现)
src/db.js              ~3 KB
src/parser.js          ~5 KB
src/icaal.js           ~2 KB
src/routers/router.js  ~15 KB    (包含前端 HTML)
package.json           ~1 KB
schedule_server.db     ~10 KB    (取决于用户数)
node_modules/          ~45 MB    (比 Express+Axios 小 ~5MB)
```

---

## 🆚 与 v0.1 的主要变化

| 方面 | v0.1 (Express) | v0.2 (Hono) |
|-----|---------------|------------|
| **Web 框架** | Express | Hono |
| **HTTP 请求** | Axios | Fetch API |
| **登录方式** | TGC Cookie | 二维码扫码 |
| **文件结构** | 单文件 | 模块化 |
| **性能** | 一般 | 10倍+ |
| **包体积** | ~50MB | ~45MB |
| **Node.js 要求** | >=14 | >=18 |

---

## 💡 开发提示

1. **模块化设计**: 每个文件负责单一功能
2. **错误处理**: 所有异步函数都有 try-catch
3. **日志输出**: 使用 emoji 标识不同类型的日志
4. **类型一致**: Cookie 始终以 JSON 存储
5. **向后兼容**: 支持多种 Node.js 版本的 Cookie 获取

---

## 🔧 VS Code 配置(推荐)

创建 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "启动 Hono 服务器",
      "program": "${workspaceFolder}/src/server.js",
      "restart": true,
      "runtimeExecutable": "nodemon",
      "console": "integratedTerminal"
    }
  ]
}
```

按 `F5` 即可调试运行。

---

## 🆘 常见问题

### 1. Node.js 版本不支持 Fetch API

**错误**: `ReferenceError: fetch is not defined`

**解决**: 
```bash
node --version  # 检查版本
# 升级到 Node.js 18+
```

### 2. 模块找不到

**错误**: `Cannot find module 'hono'`

**解决**:
```bash
npm install
```

### 3. 端口被占用

**错误**: `EADDRINUSE: address already in use :::3000`

**解决**:
```bash
# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

需要帮助? 查看 README.md 或 DEBUG.md!
