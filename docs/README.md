# 📅 课表订阅服务 - Hono + Fetch API 版

江西职业技术大学课表自动订阅系统,支持二维码扫码登录,自动同步到各类日历应用。

## ✨ 主要特性

- 🔐 **二维码登录**: 使用手机扫码安全登录,无需手动输入密码
- 🔄 **自动同步**: 日历应用自动拉取最新课表
- ⏱️ **智能过期**: 二维码5分钟自动过期,保障安全
- 🔁 **自动重试**: SESSION Cookie 获取失败时自动重试(最多3次)
- 📱 **多平台支持**: iOS、Android、macOS、Windows、Web
- ⚡ **高性能**: 基于 Hono 框架和原生 Fetch API
- ⏰ **智能提醒**: 上课前35分钟自动提醒
- 🎯 **全学期覆盖**: 一次生成,全学期可用

## 🏗️ 技术栈

- **Web 框架**: Hono (轻量级、高性能)
- **HTTP 请求**: 原生 Fetch API (Node.js 18+)
- **HTML 解析**: Cheerio
- **日历生成**: ical-generator
- **数据库**: SQLite3

## 🚀 快速开始

### 1. 环境要求

- Node.js >= 18.0.0 (支持原生 Fetch API)

### 2. 安装依赖

```bash
npm install
```

### 3. 启动服务(需要自行添加src/auth.js里的COUNT_ID的值)

```bash
# 生产环境
npm start

# 开发环境(自动重启)
npm run dev
```

### 4. 访问服务

打开浏览器访问: `http://localhost:3000`

## 📝 使用指南

### 二维码扫码登录流程

1. **访问首页**
   - 打开 `http://localhost:3000`
   - 点击"生成二维码"按钮

2. **扫码登录**
   - 使用手机扫描显示的二维码
   - 在手机上确认登录
   - 等待服务器验证

3. **设置学期**
   - 选择学期开始日期(第一周周一)
   - 默认为 2025-09-08

4. **获取订阅链接**
   - 扫码成功后自动生成订阅链接
   - 点击"复制链接"保存

5. **添加到日历应用**
   - 将订阅链接添加到你的日历应用

### 添加到日历应用

#### iOS / iPadOS
1. 设置 → 日历 → 账户
2. 添加账户 → 其他
3. 添加已订阅的日历
4. 粘贴订阅URL

#### macOS
1. 打开日历应用
2. 文件 → 新建日历订阅
3. 粘贴订阅URL

#### Google Calendar
1. 设置 → 添加日历
2. 通过URL添加
3. 粘贴订阅URL

#### Microsoft Outlook
1. 日历 → 添加日历
2. 从Internet订阅
3. 粘贴订阅URL

## 🔧 Cookie 过期处理

### 自动检测机制

系统会在每次同步时检查 Cookie 有效性:

- ✅ **有效**: 正常返回课表数据
- ❌ **过期**: 
  - 标记 Cookie 为无效
  - 返回401错误
  - 提示用户重新扫码登录

### 过期后的操作

1. 访问首页
2. 重新扫码登录
3. 获取新的订阅链接
4. 更新日历应用中的订阅

## 🗄️ 数据库结构

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,           -- 订阅Token
    cookies TEXT NOT NULL,                -- Cookie JSON(包含TGC、SESSION等)
    semester_start TEXT NOT NULL,         -- 学期开始日期
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync TIMESTAMP,                  -- 最后同步时间
    cookie_valid INTEGER DEFAULT 1,       -- Cookie有效性
    cookie_expired_at TIMESTAMP           -- 过期时间
);
```

## 📊 API 接口

### 1. 生成二维码
```http
GET /api/qr/generate
```

**响应:**
```json
{
  "success": true,
  "qrCodeId": "1732262400123",
  "cookies": {
    "SESSION": "xxxxx...",
    "Hm_lvt_xxxxx": "timestamp"
  },
  "imageData": "base64_encoded_image"
}
```

### 2. 轮询二维码状态
```http
POST /api/qr/status
Content-Type: application/json

{
  "qrCodeId": "1732262400123",
  "cookies": {
    "SESSION": "xxxxx..."
  }
}
```

**响应(等待中):**
```json
{
  "success": true,
  "status": "0",
  "expired": false
}
```

**响应(已扫码):**
```json
{
  "success": true,
  "status": "2",
  "expired": false
}
```

**响应(已确认):**
```json
{
  "success": true,
  "status": "3",
  "stateKey": "xxxxx",
  "userId": "20231001",
  "expired": false
}
```

**响应(已过期):**
```json
{
  "code": 1,
  "message": "expired",
  "success": false
}
```

### 3. 完成登录
```http
POST /api/qr/login
Content-Type: application/json

{
  "stateKey": "xxxxx",
  "semester_start": "2025-09-08",
  "cookies": {
    "SESSION": "xxxxx..."
  }
}
```

**响应:**
```json
{
  "success": true,
  "token": "订阅token"
}
```

### 4. 课表订阅(ICS)
```http
GET /schedule/{token}
```

**响应:** ICS 格式的日历文件

### 5. 统计接口
```http
GET /api/stats
```

**响应:**
```json
{
  "total_users": 100,      // 总用户数
  "active_users": 80,      // 活跃用户数
  "valid_cookies": 75      // Cookie有效用户数
}
```

## 🔒 安全特性

1. **二维码过期**: 5分钟自动过期
2. **Cookie 验证**: 每次同步时验证有效性
3. **HTTPS 建议**: 生产环境建议使用 HTTPS
4. **Token 机制**: 使用随机 token 保护订阅链接
5. **不保存密码**: 仅保存必要的 Cookie 信息

## 🐛 常见问题

### 1. 二维码生成失败

**可能原因**: 
- 网络连接问题
- 教务系统服务器故障
- SESSION Cookie 获取失败

**解决方法**: 
- 检查网络连接
- 刷新页面重试
- 系统会自动重试3次获取 SESSION

### 2. 二维码已过期

**可能原因**: 二维码有效期为5分钟

**解决方法**: 点击"重新生成二维码"

### 3. 扫码后无响应

**可能原因**: 
- 网络延迟
- 未在手机上确认登录

**解决方法**: 
- 等待2-3秒
- 确保在手机上点击"确认登录"

### 4. 订阅无法更新

**可能原因**: Cookie 已过期

**解决方法**: 重新扫码登录获取新的订阅链接

### 5. 课程时间不准确

**可能原因**: 学期开始日期设置错误

**解决方法**: 确认第一周周一的日期,重新生成

### 6. 部分课程缺失

**可能原因**: 教务系统数据更新延迟

**解决方法**: 等待教务系统更新后,日历应用会自动同步

### 7. Node.js 版本问题

**可能原因**: Node.js < 18.0.0 不支持原生 Fetch API

**解决方法**: 
```bash
# 检查版本
node --version

# 升级到 Node.js 18 或更高版本
```

## 🚀 部署指南

### Docker 部署

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

```bash
docker build -t schedule-service .
docker run -d -p 3000:3000 -v $(pwd)/data:/app schedule-service
```

### PM2 管理

```bash
npm install -g pm2

# 启动服务
pm2 start src/server.js --name schedule-service

# 查看日志
pm2 logs schedule-service

# 开机自启
pm2 startup
pm2 save
```

### Nginx 反向代理(HTTPS)

```nginx
server {
    listen 443 ssl http2;
    server_name schedule.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📦 依赖说明

```json
{
  "dependencies": {
    "hono": "^4.0.0",                    // 轻量级 Web 框架
    "@hono/node-server": "^1.8.0",      // Hono Node.js 适配器
    "cheerio": "^1.0.0-rc.12",          // HTML 解析
    "ical-generator": "^4.1.0",         // ICS 日历生成
    "sqlite3": "^5.1.6"                 // 轻量级数据库
  },
  "devDependencies": {
    "nodemon": "^3.0.2"                 // 开发热重载
  }
}
```

## 🎯 性能优化

- **Hono 框架**: 比 Express 快10倍以上
- **原生 Fetch API**: 避免外部依赖,减少包体积
- **SQLite**: 轻量级,适合中小规模部署
- **自动重试机制**: 提高 SESSION Cookie 获取成功率

## 📄 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

## 📮 联系方式

如有问题,请提交 Issue 或联系维护者。

---

⭐ 如果这个项目对你有帮助,请给个 Star!

## 🔄 更新日志

### v0.2 (2024-11-22)
- ✨ 使用 Hono 框架替代 Express
- ✨ 使用原生 Fetch API 替代 Axios
- ✨ 实现二维码扫码登录
- ✨ 添加二维码5分钟过期机制
- ✨ SESSION Cookie 自动重试(最多3次)
- 🐛 修复 Cookie 传递链问题
- 📝 更新所有文档

### 0.1
- 🎉 初始版本
- 支持 TGC Cookie 登录
- 基于 Express + Axios
