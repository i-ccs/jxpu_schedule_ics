# 📁 项目文件结构

## 完整目录结构

```
schedule-subscription/
├── 📁 src/
│    └── 📄 server.js               # 主服务器文件（Node.js + Express）
├── 📄 package.json                 # 项目配置和依赖
├── 📄 package-lock.json            # 依赖锁定文件
├── 📊 schedule_server.db           # SQLite 数据库（自动创建）
│
├── 📁 scripts/                     # 测试和工具脚本
│   ├── test-ics.js                # 测试ICS日历生成
│   ├── test-sso.js                # 测试SSO登录流程
│   ├── test-api.js                # 测试所有API接口
│   ├── db-viewer.js               # 查看数据库内容
│   ├── reset-db.js                # 清空数据库
│   └── get-tgc-guide.js           # TGC获取指南
│
├── 📁 .vscode/                     # VS Code 配置（可选）
│   └── launch.json                # 调试配置
│
├── 📁 docs/                        # 文档目录
│   ├── README.md                  # 项目说明
│   ├── DEBUG.md                   # 调试指南
│   ├── QUICKSTART.md              # 快速开始
│   ├── STRUCTURE.md               # 本文件
│   └── CLOUDFLARE.md              # Cloudflare部署指南
│
└── 📁 node_modules/                # 依赖包（npm install后生成）
    ├── express/
    ├── axios/
    ├── cheerio/
    ├── ical-generator/
    └── ...
```

## 📝 文件说明

### 核心文件

#### `server.js` - 主服务器
```javascript
// 包含所有的服务器逻辑
- Web路由（首页、注册、更新Cookie等）
- 数据库操作
- SSO登录逻辑
- 课表解析
- ICS生成
```

**主要功能**:
- ✅ 提供Web界面
- ✅ 处理用户注册和Cookie更新
- ✅ 获取和解析课表
- ✅ 生成ICS订阅文件
- ✅ SQLite数据存储

#### `package.json` - 项目配置
```json
{
  "name": "schedule-subscription-service",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/server.js",          // 启动服务
    "dev": "nodemon src/server.js",         // 开发模式
    "test:ics": "node scripts/test-ics.js",  // 测试ICS
    "test:sso": "node scripts/test-sso.js"   // 测试SSO
  },
  "dependencies": {
    "express": "^4.18.2",              // Web框架
    "axios": "^1.6.2",                 // HTTP客户端
    "cheerio": "^1.0.0-rc.12",         // HTML解析
    "ical-generator": "^4.1.0",        // ICS生成
    "sqlite3": "^5.1.6"                // 数据库
  }
}
```

### 测试脚本目录 `scripts/`

#### `test-ics.js` - ICS测试
```bash
npm run test:ics
```
**功能**:
- ✅ 测试日历生成功能
- ✅ 创建示例课程
- ✅ 生成 test-schedule.ics
- ✅ 验证格式是否正确

**输出**:
```
✅ 日历对象创建成功
✅ 课程1: 高等数学
✅ 课程2: 大学英语
✅ 课程3: 计算机基础
✅ ICS文件已保存到: test-schedule.ics
```

#### `test-sso.js` - SSO测试
```bash
npm run test:sso TGT-你的TGC
```
**功能**:
- ✅ 测试完整SSO登录流程
- ✅ 显示每一步的详细信息
- ✅ 保存调试HTML文件
- ✅ 验证Cookie有效性

**输出**:
```
📍 步骤1: 访问CAS登录页面
   ✅ 状态码: 302
   🎫 Ticket: ST-xxxxx...

📍 步骤2: 访问教务系统SSO
   ✅ 状态码: 302

📍 步骤3: 访问教务系统主页
   ✅ 成功登录到教务系统

📍 步骤4: 获取课表
   ✅ 成功获取课表！
```

#### `test-api.js` - API测试
```bash
npm run test
# 或
node scripts/test-api.js
```
**功能**:
- ✅ 交互式测试所有API
- ✅ 测试注册、获取课表、更新Cookie
- ✅ 验证完整工作流程

#### `db-viewer.js` - 数据库查看
```bash
node scripts/db-viewer.js
```
**功能**:
- ✅ 显示所有用户信息
- ✅ 查看Cookie状态
- ✅ 检查同步时间

#### `reset-db.js` - 清空数据库
```bash
node scripts/reset-db.js
```
**功能**:
- ⚠️ 清空所有用户数据
- ✅ 用于测试和重置

#### `get-tgc-guide.js` - TGC指南
```bash
node scripts/get-tgc-guide.js
```
**功能**:
- ✅ 显示详细的TGC获取步骤
- ✅ 适合新手参考

### 数据库文件

#### `schedule_server.db` - SQLite数据库
**自动创建**，无需手动创建

**表结构**:
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,           -- 订阅Token
    cookies TEXT NOT NULL,                -- Cookie JSON
    semester_start TEXT NOT NULL,         -- 学期开始日期
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync TIMESTAMP,                  -- 最后同步时间
    cookie_valid INTEGER DEFAULT 1,       -- Cookie有效性
    cookie_expired_at TIMESTAMP           -- 过期时间
);
```

**查看数据**:
```bash
# 方式1: 使用脚本
node scripts/db-viewer.js

# 方式2: SQLite命令行
sqlite3 schedule_server.db "SELECT * FROM users;"

# 方式3: DB Browser for SQLite (GUI)
# 下载: https://sqlitebrowser.org/
```

### 调试文件（自动生成）

测试时会自动生成这些文件：

```
debug_cas_login.html      # CAS登录页面（如果失败）
debug_main_page.html      # 教务系统主页
debug_schedule.html       # 成功获取的课表
debug_schedule_fail.html  # 失败时的响应
test-schedule.ics         # 测试生成的日历文件
```

## 🚀 快速开始

### 1️⃣ 初始化项目
```bash
# 创建项目目录
mkdir schedule-subscription
cd schedule-subscription
# 创建目录
mkdir src
cd src

# 创建必要文件
touch server.js
cd ..
touch package.json

# 创建脚本目录
mkdir scripts
touch scripts/test-ics.js
touch scripts/test-sso.js
```

### 2️⃣ 安装依赖
```bash
npm install
```

### 3️⃣ 测试功能
```bash
# 测试ICS生成
npm run test:ics

# 测试SSO（需要真实TGC）
npm run test:sso TGT-你的TGC
```

### 4️⃣ 启动服务
```bash
# 开发模式（推荐）
npm run dev

# 生产模式
npm start
```

### 5️⃣ 访问服务
```
浏览器打开: http://localhost:3000
```

## 📦 文件创建顺序

如果要手动创建项目，按以下顺序：

1. **创建目录结构**
   ```bash
   mkdir schedule-subscription
   cd schedule-subscription
   mkdir src
   mkdir scripts
   mkdir .vscode
   ```

2. **创建核心文件**
   ```bash
   # 1. package.json
   npm init -y
   
   # 2. server.js
   # 复制主服务器代码
   
   # 3. .gitignore
   echo "node_modules/" > .gitignore
   echo "schedule_server.db" >> .gitignore
   echo "debug_*.html" >> .gitignore
   echo "test-*.ics" >> .gitignore
   ```

3. **创建测试脚本**
   ```bash
   # 复制各个测试脚本到 scripts/ 目录
   touch scripts/test-ics.js
   touch scripts/test-sso.js
   touch scripts/test-api.js
   ```

4. **安装依赖**
   ```bash
   npm install express axios cheerio ical-generator sqlite3
   npm install --save-dev nodemon
   ```

5. **测试运行**
   ```bash
   npm run test:ics
   npm run dev
   ```

## 🎯 最小可运行版本

最少只需要这3个文件：

```
schedule-subscription/
├── src
│    └── server.js     # 主服务器（必需）
├── package.json       # 项目配置（必需）
└── node_modules/      # 依赖包（npm install）
```

运行：
```bash
npm install
npm start
```

## 📊 文件大小参考

```
server.js              ~15 KB
package.json           ~1 KB
package-lock.json      ~200 KB
schedule_server.db     ~10 KB (取决于用户数)
node_modules/          ~50 MB (所有依赖)
```

## 🔧 VS Code 配置（可选）

如果使用 VS Code，创建 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "启动服务器",
      "program": "${workspaceFolder}/server.js",
      "console": "integratedTerminal"
    }
  ]
}
```

按 `F5` 即可调试运行。

## 💡 提示

1. **不要提交这些文件到Git**:
   ```
   node_modules/
   schedule_server.db
   debug_*.html
   test-*.ics
   ```

2. **必须包含的文件**:
   ```
   server.js
   package.json
   README.md
   scripts/*.js
   ```

3. **建议创建的文档**:
   ```
   README.md          - 项目说明
   DEBUG.md           - 调试指南
   .env.example       - 环境变量示例
   ```

## 🆘 遇到问题？

1. **缺少文件**: 参考本文档的文件列表
2. **依赖问题**: 运行 `npm install`
3. **数据库问题**: 删除 `schedule_server.db` 重新生成
4. **测试失败**: 查看 `DEBUG.md` 调试指南

---

需要帮助? 查看其他文档或提交 Issue!