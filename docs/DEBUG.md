# 🐛 调试指南 - Hono + Fetch API 版

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式启动(自动重启)

```bash
npm run dev
```

或直接使用 nodemon:

```bash
npx nodemon src/server.js
```

### 3. 普通模式启动

```bash
npm start
# 或
node src/server.js
```

---

## 🔧 开发环境配置

### 环境要求

- **Node.js**: >= 18.0.0 (支持原生 Fetch API)
- **npm**: >= 8.0.0

检查版本:
```bash
node --version  # 应该 >= v18.0.0
npm --version
```

### 安装调试工具

```bash
# 开发依赖
npm install --save-dev nodemon

# 调试工具(可选)
npm install --save-dev debug
```

---

## 📝 日志调试

### 方法1: 使用 console.log

在代码中添加日志:

```javascript
// 在关键位置添加日志
console.log('🔍 [调试] 用户信息:', user);
console.log('📊 [调试] 课表数量:', courses.length);
console.error('❌ [错误] 获取课表失败:', error);

// 二维码调试
console.log('📄 [QR] 二维码ID:', qrCodeId);
console.log('🍪 [Cookie] SESSION:', cookies.SESSION?.substring(0, 16) + '...');
```

### 方法2: 使用 debug 模块

安装并配置:

```bash
npm install debug
```

在代码中使用:

```javascript
const debug = require('debug');
const log = debug('app:server');
const logAuth = debug('app:auth');
const logDB = debug('app:db');

// 使用
log('服务器启动在端口 %d', PORT);
logAuth('生成二维码: %s', qrCodeId);
logDB('数据库查询: %s', token);
```

启动时启用日志:

```bash
DEBUG=app:* npm start
# 或只看特定模块
DEBUG=app:auth npm start
```

---

## 🔍 断点调试

### VS Code 调试配置

创建 `.vscode/launch.json`:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "启动服务器",
            "skipFiles": ["<node_internals>/**"],
            "program": "${workspaceFolder}/src/server.js",
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

使用步骤:
1. 在代码行号左侧点击设置断点(红点)
2. 按 `F5` 启动调试
3. 触发相关请求
4. 程序会在断点处暂停
5. 可以查看变量、单步执行等

### Chrome DevTools 调试

启动调试模式:

```bash
node --inspect src/server.js
# 或启动时暂停
node --inspect-brk src/server.js
```

打开 Chrome 浏览器:
1. 访问 `chrome://inspect`
2. 点击 "Open dedicated DevTools for Node"
3. 设置断点并调试

---

## 🧪 API 测试工具

### 1. 使用 curl 测试

**生成二维码:**
```bash
curl http://localhost:3000/api/qr/generate
```

**轮询二维码状态:**
```bash
curl -X POST http://localhost:3000/api/qr/status \
  -H "Content-Type: application/json" \
  -d '{
    "qrCodeId": "1732262400123",
    "cookies": {"SESSION": "your_session"}
  }'
```

**完成登录:**
```bash
curl -X POST http://localhost:3000/api/qr/login \
  -H "Content-Type: application/json" \
  -d '{
    "stateKey": "your_state_key",
    "semester_start": "2025-09-08",
    "cookies": {"SESSION": "your_session"}
  }'
```

**获取课表:**
```bash
curl http://localhost:3000/schedule/your_token
```

**统计接口:**
```bash
curl http://localhost:3000/api/stats
```

### 2. 创建测试脚本

创建 `test-api.js`:

```javascript
const BASE_URL = 'http://localhost:3000';

async function test() {
    console.log('🧪 开始测试 Hono + Fetch API...\n');

    try {
        // 测试1: 生成二维码
        console.log('1️⃣ 测试生成二维码...');
        const qrRes = await fetch(`${BASE_URL}/api/qr/generate`);
        const qrData = await qrRes.json();
        
        if (qrData.success) {
            console.log('✅ 二维码生成成功');
            console.log('   - qrCodeId:', qrData.qrCodeId);
            console.log('   - SESSION:', qrData.cookies.SESSION?.substring(0, 16) + '...');
        } else {
            console.log('❌ 二维码生成失败:', qrData.error);
        }

        // 测试2: 统计接口
        console.log('\n2️⃣ 测试统计接口...');
        const statsRes = await fetch(`${BASE_URL}/api/stats`);
        const statsData = await statsRes.json();
        console.log('✅ 统计数据:', statsData);

        console.log('\n🎉 测试完成！');
        console.log('\n💡 提示: 完整的扫码登录流程需要使用浏览器');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    }
}

test();
```

运行测试:
```bash
node test-api.js
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

### 在代码中添加数据库日志

```javascript
// 在 db.js 中添加日志
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

### 调试 Fetch API 请求

在 `auth.js` 中添加日志:

```javascript
// 请求前
console.log('🔵 [HTTP] 请求:', method, url);
console.log('   Headers:', headers);
console.log('   Cookies:', cookieString);

const response = await fetch(url, {
    method,
    headers,
    agent: httpsAgent
});

// 响应后
console.log('🟢 [HTTP] 响应:', response.status, url);
console.log('   Set-Cookie:', getSetCookieHeaders(response));
```

### 调试 Cookie 传递

```javascript
// 在关键位置打印 Cookie
console.log('🍪 [Cookie] 当前 cookieJar:', Object.keys(cookieJar));
console.log('🍪 [Cookie] Cookie 字符串:', buildCookieString(cookieJar));

// 验证 Set-Cookie 头
const setCookies = getSetCookieHeaders(response);
console.log('🍪 [Set-Cookie] 返回的 Cookies:', setCookies);
```

---

## 🐞 常见问题调试

### 1. SESSION Cookie 获取失败

**调试步骤:**

```javascript
// 在 auth.js 的 generateQRCode 函数中添加
for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`🔄 [调试] 第 ${attempt} 次尝试`);
    console.log('   - 当前 Cookies:', Object.keys(cookieJar));
    
    const qrResponse = await fetch(...);
    
    console.log('   - 响应状态:', qrResponse.status);
    console.log('   - Set-Cookie 头:', getSetCookieHeaders(qrResponse));
    
    const qrCookies = parseCookiesFromHeaders(getSetCookieHeaders(qrResponse));
    console.log('   - 解析的 Cookies:', Object.keys(qrCookies));
    
    if (qrCookies.SESSION) {
        console.log('✅ [调试] 成功获取 SESSION');
        break;
    }
}
```

### 2. 二维码过期问题

```javascript
// 在前端添加详细日志
async function startPolling() {
    console.log('🔄 [前端] 开始轮询');
    console.log('   - qrCodeId:', currentQrCodeId);
    console.log('   - SESSION:', currentCookies?.SESSION?.substring(0, 16) + '...');
    
    pollInterval = setInterval(async () => {
        console.log('📡 [前端] 轮询请求...');
        
        const response = await fetch('/api/qr/status', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                qrCodeId: currentQrCodeId,
                cookies: currentCookies
            })
        });
        
        const data = await response.json();
        console.log('📡 [前端] 轮询响应:', data);
        
        if (data.code === 1 && data.message === 'expired') {
            console.log('⏱️ [前端] 二维码已过期');
            clearInterval(pollInterval);
        }
    }, 2000);
}
```

### 3. 课表解析失败

```javascript
// 在 parser.js 中添加
function parseSchedule(html, semesterStart) {
    console.log('📝 [解析] HTML 长度:', html.length);
    console.log('📝 [解析] 学期开始:', semesterStart);
    
    const $ = cheerio.load(html);
    const table = $('table.Nsb_r_list.Nsb_table');
    console.log('📝 [解析] 找到表格:', table.length);
    
    // 保存 HTML 到文件查看
    const fs = require('fs');
    fs.writeFileSync('debug_schedule.html', html);
    console.log('📝 [解析] HTML 已保存到 debug_schedule.html');
    
    // ... 继续解析
}
```

### 4. Hono 路由问题

```javascript
// 在 router.js 中添加中间件
router.use('*', async (c, next) => {
    const start = Date.now();
    console.log(`➡️  [路由] ${c.req.method} ${c.req.path}`);
    
    await next();
    
    const duration = Date.now() - start;
    console.log(`✅ [路由] ${c.req.method} ${c.req.path} - ${duration}ms`);
});
```

---

## 📊 性能调试

### 监控请求处理时间

```javascript
// 在 server.js 中添加
app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`⏱️  ${c.req.method} ${c.req.path} - ${duration}ms`);
});
```

---

## 💡 调试技巧

1. **使用有意义的日志前缀**: `🔍 [调试]`、`✅ [成功]`、`❌ [错误]`
2. **分层日志**: 区分 DB、API、HTTP、Cookie 等不同层级
3. **保留临时文件**: 出错时保存 HTML、JSON 等用于分析
4. **使用断点而非大量 console.log**: VS Code 调试器更高效
5. **检查 Node.js 版本**: 确保 >= 18.0.0
6. **验证 Cookie 链**: 确保 SESSION 正确传递

---

## 📚 推荐工具

- **VS Code**: 代码编辑和调试
- **Chrome DevTools**: Node.js 调试
- **DB Browser for SQLite**: 数据库可视化
- **Thunder Client** (VS Code 扩展): API 测试
- **nodemon**: 自动重启

---

## 🆘 获取帮助

1. 检查 Node.js 版本 (`node --version`)
2. 查看完整错误堆栈
3. 保存调试文件 (`debug_*.html`)
4. 提交 Issue 附带日志和错误信息

---

需要帮助? 参考项目 README.md 或提交 Issue!