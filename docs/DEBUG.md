# 🐛 调试指南

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式启动（自动重启）

```bash
npm run dev
```

或直接使用 nodemon：

```bash
npx nodemon server.js
```

### 3. 普通模式启动

```bash
npm start
# 或
node server.js
```

---

## 🔧 开发环境配置

### 配置环境变量（可选）

创建 `.env` 文件：

```bash
# .env
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug

# 数据库
DB_FILE=schedule_server.db

# 教务系统
CAS_URL=https://sso.jxpu.edu.cn/cas
JWXT_URL=https://jiaowu.jxpu.edu.cn
```

### 安装调试工具

```bash
# 开发依赖
npm install --save-dev nodemon dotenv morgan

# 调试工具
npm install --save-dev debug
```

---

## 📝 日志调试

### 方法1：使用 console.log

在代码中添加日志：

```javascript
// 在关键位置添加日志
console.log('🔍 [调试] 用户信息:', user);
console.log('📊 [调试] 课表数量:', courses.length);
console.error('❌ [错误] 获取课表失败:', error);
```

### 方法2：使用 debug 模块

安装并配置：

```bash
npm install debug
```

在 `server.js` 顶部添加：

```javascript
const debug = require('debug');
const log = debug('app:server');
const logDB = debug('app:db');
const logAPI = debug('app:api');

// 使用
log('服务器启动在端口 %d', PORT);
logDB('数据库查询: %s', token);
logAPI('API请求: %s', req.path);
```

启动时启用日志：

```bash
DEBUG=app:* npm start
# 或只看特定模块
DEBUG=app:api npm start
```

### 方法3：使用 morgan（HTTP日志）

```javascript
const morgan = require('morgan');

// 开发环境详细日志
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}
```

---

## 🔍 断点调试

### 方法1：VS Code 调试

创建 `.vscode/launch.json`：

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "启动服务器",
            "skipFiles": ["<node_internals>/**"],
            "program": "${workspaceFolder}/server.js",
            "restart": true,
            "runtimeExecutable": "nodemon",
            "console": "integratedTerminal"
        },
        {
            "type": "node",
            "request": "attach",
            "name": "附加到进程",
            "port": 9229
        }
    ]
}
```

使用步骤：
1. 在代码行号左侧点击设置断点（红点）
2. 按 `F5` 启动调试
3. 触发相关请求
4. 程序会在断点处暂停
5. 可以查看变量、单步执行等

### 方法2：Chrome DevTools

启动调试模式：

```bash
node --inspect server.js
# 或
node --inspect-brk server.js  # 启动时即暂停
```

打开 Chrome 浏览器：
1. 访问 `chrome://inspect`
2. 点击 "Open dedicated DevTools for Node"
3. 设置断点并调试

### 方法3：命令行调试

```bash
node inspect server.js
```

调试命令：
- `c` 或 `cont`: 继续执行
- `n` 或 `next`: 下一步
- `s` 或 `step`: 进入函数
- `o` 或 `out`: 跳出函数
- `repl`: 进入交互模式
- `watch('变量名')`: 监视变量

---

## 🧪 测试工具

### 1. 使用 curl 测试API

**测试注册接口：**

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "tgc": "你的TGC值",
    "semester_start": "2025-09-08"
  }'
```

**测试更新Cookie：**

```bash
curl -X POST http://localhost:3000/api/update-cookie \
  -H "Content-Type: application/json" \
  -d '{
    "token": "你的token",
    "tgc": "新的TGC值"
  }'
```

**测试获取课表：**

```bash
curl http://localhost:3000/schedule/你的token
```

**测试统计接口：**

```bash
curl http://localhost:3000/api/stats
```

### 2. 使用 Postman

导入以下集合：

```json
{
  "info": {
    "name": "课表订阅API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "注册新用户",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"tgc\": \"{{tgc}}\",\n  \"semester_start\": \"2025-09-08\"\n}"
        },
        "url": "{{base_url}}/api/register"
      }
    },
    {
      "name": "更新Cookie",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"token\": \"{{token}}\",\n  \"tgc\": \"{{new_tgc}}\"\n}"
        },
        "url": "{{base_url}}/api/update-cookie"
      }
    }
  ],
  "variable": [
    {"key": "base_url", "value": "http://localhost:3000"}
  ]
}
```

### 3. 创建测试脚本

创建 `test.js`：

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_TGC = '你的测试TGC';

async function test() {
    console.log('🧪 开始测试...\n');

    try {
        // 测试1: 注册
        console.log('1️⃣ 测试注册接口...');
        const registerRes = await axios.post(`${BASE_URL}/api/register`, {
            tgc: TEST_TGC,
            semester_start: '2025-09-08'
        });
        console.log('✅ 注册成功:', registerRes.data);
        const token = registerRes.data.token;

        // 测试2: 获取课表
        console.log('\n2️⃣ 测试获取课表...');
        const scheduleRes = await axios.get(`${BASE_URL}/schedule/${token}`);
        console.log('✅ 课表获取成功, 长度:', scheduleRes.data.length);

        // 测试3: 统计
        console.log('\n3️⃣ 测试统计接口...');
        const statsRes = await axios.get(`${BASE_URL}/api/stats`);
        console.log('✅ 统计:', statsRes.data);

        // 测试4: 更新Cookie
        console.log('\n4️⃣ 测试更新Cookie...');
        const updateRes = await axios.post(`${BASE_URL}/api/update-cookie`, {
            token: token,
            tgc: TEST_TGC
        });
        console.log('✅ Cookie更新:', updateRes.data);

        console.log('\n🎉 所有测试通过！');
    } catch (error) {
        console.error('❌ 测试失败:', error.response?.data || error.message);
    }
}

test();
```

运行测试：

```bash
node test.js
```

---

## 🔎 数据库调试

### 查看数据库内容

```bash
# 安装 sqlite3 命令行工具
# macOS: brew install sqlite3
# Ubuntu: apt install sqlite3

# 打开数据库
sqlite3 schedule_server.db

# 查看所有表
.tables

# 查看用户表结构
.schema users

# 查询所有用户
SELECT * FROM users;

# 查询特定用户
SELECT * FROM users WHERE token LIKE 'abc%';

# 查看Cookie状态
SELECT token, cookie_valid, last_sync FROM users;

# 退出
.quit
```

### 使用 DB Browser for SQLite

下载：https://sqlitebrowser.org/

图形化界面查看和编辑数据库。

### 在代码中添加数据库日志

```javascript
// 在数据库操作前后添加日志
function getUser(token) {
    console.log(`📊 [DB] 查询用户: ${token.substring(0, 8)}...`);
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT cookies, semester_start, cookie_valid FROM users WHERE token = ?',
            [token],
            (err, row) => {
                if (err) {
                    console.error('❌ [DB] 查询失败:', err);
                    reject(err);
                } else {
                    console.log('✅ [DB] 查询结果:', row ? '找到' : '未找到');
                    resolve(row ? {
                        cookies: JSON.parse(row.cookies),
                        semesterStart: row.semester_start,
                        cookieValid: row.cookie_valid
                    } : null);
                }
            }
        );
    });
}
```

---

## 🌐 网络请求调试

### 使用 axios 拦截器

在 `server.js` 中添加：

```javascript
const axios = require('axios');

// 请求拦截器
axios.interceptors.request.use(request => {
    console.log('🔵 [HTTP] 请求:', request.method, request.url);
    console.log('   Headers:', request.headers);
    return request;
});

// 响应拦截器
axios.interceptors.response.use(
    response => {
        console.log('🟢 [HTTP] 响应:', response.status, response.config.url);
        return response;
    },
    error => {
        console.error('🔴 [HTTP] 错误:', error.message);
        return Promise.reject(error);
    }
);
```

### 使用 Charles 或 Fiddler

抓包工具可以查看所有HTTP/HTTPS请求：
1. 启动 Charles/Fiddler
2. 配置代理（如需要）
3. 运行应用
4. 查看所有网络请求详情

---

## 🐞 常见问题调试

### 1. Cookie验证失败

**调试步骤：**

```javascript
async function fetchSchedule(cookies) {
    try {
        console.log('🍪 [调试] Cookies:', cookies);
        
        const cookieStr = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        console.log('🍪 [调试] Cookie字符串:', cookieStr);
        
        // ... 其他代码
        
        console.log('📄 [调试] 响应状态:', resp.status);
        console.log('📄 [调试] 响应包含标题:', resp.data.includes('<title>学期理论课表</title>'));
        
    } catch (error) {
        console.error('❌ [调试] 详细错误:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
    }
}
```

### 2. 课表解析失败

```javascript
function parseSchedule(html, semesterStart) {
    console.log('📝 [调试] HTML长度:', html.length);
    console.log('📝 [调试] 学期开始:', semesterStart);
    
    const $ = cheerio.load(html);
    const table = $('table.Nsb_r_list.Nsb_table');
    console.log('📝 [调试] 找到表格:', table.length);
    
    // 保存HTML到文件查看
    const fs = require('fs');
    fs.writeFileSync('debug_schedule.html', html);
    console.log('📝 [调试] HTML已保存到 debug_schedule.html');
    
    // ... 其他代码
}
```

### 3. 数据库锁定

```bash
# 检查是否有其他进程占用数据库
lsof schedule_server.db

# 或使用
fuser schedule_server.db
```

### 4. 端口被占用

```bash
# 查看端口占用
lsof -i :3000
# 或
netstat -an | grep 3000

# 杀死占用进程
kill -9 <PID>
```

---

## 📊 性能调试

### 添加性能监控

```javascript
// 记录请求处理时间
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`⏱️  ${req.method} ${req.path} - ${duration}ms`);
    });
    next();
});
```

### 使用 Node.js 性能工具

```bash
# 启用性能分析
node --prof server.js

# 生成报告
node --prof-process isolate-*.log > profile.txt
```

---

## 📱 移动端调试

### iOS Safari 调试

1. iPhone 设置 → Safari → 高级 → 网页检查器（开启）
2. Mac Safari → 开发 → 选择设备
3. 查看控制台和网络请求

### Android Chrome 调试

1. Android 开发者选项 → USB调试（开启）
2. Chrome 访问 `chrome://inspect`
3. 选择设备调试

---

## 🔧 有用的脚本

### 清空数据库

创建 `scripts/reset-db.js`：

```javascript
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('schedule_server.db');

db.serialize(() => {
    db.run('DELETE FROM users', (err) => {
        if (err) console.error('❌ 清空失败:', err);
        else console.log('✅ 数据库已清空');
        db.close();
    });
});
```

运行：`node scripts/reset-db.js`

### 生成测试数据

创建 `scripts/seed-db.js`：

```javascript
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const db = new sqlite3.Database('schedule_server.db');

const testUsers = [
    { tgc: 'TEST_TGC_1', semester: '2025-09-08' },
    { tgc: 'TEST_TGC_2', semester: '2025-09-08' }
];

db.serialize(() => {
    testUsers.forEach(user => {
        const token = crypto.randomBytes(32).toString('base64url');
        const cookies = JSON.stringify({ TGC: user.tgc });
        
        db.run(
            'INSERT INTO users (token, cookies, semester_start) VALUES (?, ?, ?)',
            [token, cookies, user.semester],
            (err) => {
                if (err) console.error('❌ 插入失败:', err);
                else console.log('✅ 插入成功, token:', token.substring(0, 16));
            }
        );
    });
    
    setTimeout(() => db.close(), 1000);
});
```

---

## 💡 调试技巧

1. **使用有意义的日志前缀**：`🔍 [调试]`、`✅ [成功]`、`❌ [错误]`
2. **分层日志**：区分 DB、API、HTTP 等不同层级
3. **保留临时文件**：出错时保存HTML、JSON等用于分析
4. **使用断点而非大量console.log**：VS Code调试器更高效
5. **编写可复现的测试用例**：方便快速定位问题
6. **检查边界条件**：空数据、错误Cookie、过期Token等

---

## 📚 推荐工具

- **Postman**: API测试
- **VS Code**: 代码编辑和调试
- **Chrome DevTools**: 前端和Node调试
- **DB Browser for SQLite**: 数据库可视化
- **Charles/Fiddler**: 网络抓包
- **nodemon**: 自动重启

---

需要帮助？参考项目 README.md 或提交 Issue！