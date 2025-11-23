🏗️ 项目架构

## 本项目采用模块化设计，业务逻辑、路由控制与数据存储分离。

## 文件结构

```
schedule-subscription/
├── 📁 src/                        # 源代码目录
│   ├── 📄 server.js              # Hono 主服务器
│   ├── 📄 auth.js                # 认证模块
│   ├── 📄 db.js                  # 数据库操作
│   ├── 📄 parser.js              # 课表解析
│   ├── 📄 icaal.js               # ICS 生成
│   └── 📁 routers/
│       └── 📄 router.js          # 路由配置
│
├── 📁 public/                     # 静态文件
│   └── 📄 login.html             # 登录页面
│
├── 📁 docs/                       # 文档目录
│   ├── 📄 README.md              # 项目说明
│   ├── 📄 DEBUG.md               # 调试指南
│   ├── 📄 STRUCTURE.md           # 文件结构
│   └── 📄 QUICKSTART.md          # 快速开始
│
├── 📄 package.json               # 项目配置
├── 📄 package-lock.json          # 依赖锁定
├── 📊 schedule_server.db         # SQLite 数据库(自动生成)
└── 📁 node_modules/              # 依赖包(自动生成)
```

### 核心模块说明

#### server.js
- Hono 应用初始化
- 路由挂载
- 数据库初始化
- 服务启动

#### auth.js
- 二维码生成
- 状态轮询
- Cookie 管理
- 登录验证
- 课表获取

#### router.js
- API 路由定义
- 会话管理
- 请求处理
- 响应格式化

#### db.js
- 数据库操作
- 用户管理
- Cookie 状态管理

#### parser.js
- HTML 解析
- 课程提取
- 时间计算

#### ical.js
- ICS 文件生成
- 事件创建
- 提醒添加

---

## 数据库设计

### users 表结构

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,           -- 订阅 Token
    cookies TEXT NOT NULL,                -- Cookie JSON 字符串
    semester_start TEXT NOT NULL,         -- 学期开始日期
    user_id TEXT,                         -- 用户 ID
    username TEXT,                        -- 用户名
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync TIMESTAMP,                  -- 最后同步时间
    cookie_valid INTEGER DEFAULT 1,       -- Cookie 有效性
    cookie_expired_at TIMESTAMP           -- 过期时间
);
```

### 字段说明

| 字段 | 类型 | 说明 |
|-----|------|------|
| `id` | INTEGER | 主键,自增 |
| `token` | TEXT | 订阅链接的唯一标识 |
| `cookies` | TEXT | JSON 格式的 Cookie 数据 |
| `semester_start` | TEXT | 学期开始日期(YYYY-MM-DD) |
| `user_id` | TEXT | 教务系统用户ID |
| `username` | TEXT | 用户姓名 |
| `created_at` | TIMESTAMP | 创建时间 |
| `last_sync` | TIMESTAMP | 最后同步时间 |
| `cookie_valid` | INTEGER | Cookie 是否有效(1=有效, 0=无效) |
| `cookie_expired_at` | TIMESTAMP | Cookie 过期时间 |

### 查询示例

```sql
-- 查询所有有效用户
SELECT * FROM users WHERE cookie_valid = 1;

-- 查询特定用户
SELECT * FROM users WHERE token = 'xxx';

-- 更新同步时间
UPDATE users SET last_sync = CURRENT_TIMESTAMP WHERE token = 'xxx';

-- 标记 Cookie 无效
UPDATE users SET cookie_valid = 0, cookie_expired_at = CURRENT_TIMESTAMP 
WHERE token = 'xxx';
```

## 技术架构

### 技术栈

| 类型 | 技术 | 版本 | 说明 |
|-----|------|------|------|
| **Web 框架** | Hono | ^4.0.0 | 轻量级、高性能 Web 框架 |
| **Node.js 适配器** | @hono/node-server | ^1.8.0 | Hono 的 Node.js 运行时 |
| **HTTP 请求** | Fetch API | 内置 | Node.js 18+ 原生支持 |
| **HTML 解析** | Cheerio | ^1.0.0-rc.12 | 服务端 jQuery 实现 |
| **日历生成** | ical-generator | ^4.1.0 | ICS 格式日历生成 |
| **数据库** | SQLite3 | ^5.1.6 | 轻量级嵌入式数据库 |
| **开发工具** | nodemon | ^3.0.2 | 开发时自动重启 |

### 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                      前端页面                            │
│                   (login.html)                          │
│  - 二维码生成与显示                                      │
│  - 状态轮询                                              │
│  - 会话保活                                              │
│  - 订阅链接管理                                          │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ HTTP/HTTPS
                  ↓
┌─────────────────────────────────────────────────────────┐
│                  Hono Web 服务器                         │
│                   (server.js)                           │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ 路由分发
                  ↓
┌─────────────────────────────────────────────────────────┐
│                   路由层 (router.js)                     │
├─────────────────────────────────────────────────────────┤
│  /api/qr/generate      - 生成二维码                     │
│  /api/qr/status        - 轮询状态                       │
│  /api/qr/login         - 完成登录                       │
│  /api/keepalive        - 会话保活                       │
│  /schedule/:token      - 课表订阅                       │
│  /api/download/:token  - 下载ICS                        │
│  /api/user/:token      - 删除账号                       │
└─────────────────┬───────────────────────────────────────┘
                  │
         ┌────────┴────────┬────────────┬────────────┐
         ↓                 ↓            ↓            ↓
┌──────────────┐  ┌──────────────┐  ┌─────────┐  ┌─────────┐
│  认证模块     │  │  解析模块     │  │ ICS模块 │  │ DB模块  │
│ (auth.js)    │  │(parser.js)   │  │(ical.js)│  │(db.js)  │
├──────────────┤  ├──────────────┤  ├─────────┤  ├─────────┤
│- 生成二维码   │  │- 解析HTML    │  │- 生成ICS│  │- 用户管理│
│- 轮询状态     │  │- 提取课程    │  │- 添加提醒│  │- Cookie │
│- 登录验证     │  │- 计算时间    │  │         │  │  管理   │
│- 获取课表     │  │              │  │         │  │         │
└──────────────┘  └──────────────┘  └─────────┘  └─────────┘
         │                 │                           │
         └─────────────────┴───────────────────────────┘
                           │
                           ↓
                  ┌──────────────────┐
                  │  SQLite 数据库    │
                  │schedule_server.db│
                  └──────────────────┘
```

### 数据流程

1. **二维码生成**: 前端 → 后端生成二维码 → 创建会话 → 返回二维码图片
2. **状态轮询**: 前端轮询 → 后端检查状态 → 返回扫码状态
3. **完成登录**: 确认登录 → 获取 TGC → 验证 Cookie → 保存数据库
4. **课表同步**: 日历应用请求 → 验证 token → 获取课表 → 生成 ICS


