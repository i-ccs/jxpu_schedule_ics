🏗️ 项目架构与文件结构

## 本项目采用模块化设计，业务逻辑、路由控制与数据存储分离。

📂 目录结构
```plaintext
jxpu_schedule_ics/
├── 📁 docs/                  # 项目文档
├── 📁 public/
│   └── login.html            # 前端登录/扫码页面 (含轮询逻辑)
├── 📁 src/
│   ├── 📁 routers/
│   │   └── router.js         # Hono 路由定义 & 会话控制
│   ├── auth.js               # 核心认证模块 (CAS 交互/爬虫)
│   ├── db.js                 # SQLite 数据库操作层
│   ├── icaal.js              # ICS 日历生成逻辑
│   ├── parser.js             # 课表 HTML 解析器
│   └── server.js             # 程序入口 & Hono App 初始化
├── package.json              # 依赖定义
└── schedule_server.db        # SQLite 数据库文件 (自动生成)
```

## 🧩 核心模块说明
### 1. **src/server.js**
- 使用 @hono/node-server 适配器运行 Hono 应用。
- 负责数据库初始化 (db.initDB()) 和全局错误捕获。

### 2. **src/auth.js (核心)**

- HTTPS Agent: 配置了 rejectUnauthorized: false 以绕过部分教务系统的证书问题。

- Cookie 处理: 实现了兼容 Node.js 不同版本的 Set-Cookie 解析逻辑。

- 流程:

  1. generateQRCode(): 获取 CAS 登录页 Cookie -> 请求二维码 -> 获取 SESSION。

  2. pollQRCodeStatus(): 轮询二维码状态 (使用 Comet 长轮询接口)。

  3. loginWithStateKey(): 扫码确认后，使用 stateKey 换取 TGC (Ticket Granting Cookie)。

  4. fetchSchedule(): 携带 TGC 访问教务系统，自动处理 SSO 重定向，最终获取课表 HTML。

### 3. **src/routers/router.js**
- Session 管理: 使用内存 **Map** 存储临时的扫码会话 (**session_id**)，实现用户扫码过程的隔离。
- 保活机制: 提供 **/api/keepalive** 接口，防止二维码在等待扫码期间过期。

### 4. **src/parser.js**
- 使用 Cheerio 解析 HTML 表格。
- 智能识别课程周次（如 "1-16周" 或 "1,3,5周"）。
- 节次映射：将教务系统的 1-12 节转换为具体的上课时间（如 08:20-10:00）。


