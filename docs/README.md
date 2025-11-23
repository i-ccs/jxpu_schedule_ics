# 📅 课表订阅服务 - 完整项目文档

江西职业技术大学课表自动订阅系统 v0.2.1

---

## 📚 目录

1. [项目概述](#项目概述)
2. [核心特性](#核心特性)
3. [快速开始](#快速开始)
4. [部署指南](#部署指南)
5. [安全建议](#安全建议)
6. [性能优化](#性能优化)
7. [监控与日志](#监控与日志)
8. [常见问题](#常见问题)
9. [贡献指南](#贡献指南)

---

## 项目概述

### 简介

这是一个基于 **Hono 框架**和**原生 Fetch API** 构建的课表订阅服务,支持二维码扫码登录,自动同步课表到各类日历应用。

### 主要功能

- 🔐 **二维码登录**: 安全的手机扫码登录方式
- 🔄 **自动同步**: 日历应用自动拉取最新课表
- ⏱️ **智能过期**: 二维码5分钟自动过期
- 🔁 **自动重试**: SESSION Cookie 获取失败时自动重试(最多3次)
- 📱 **多平台支持**: iOS、Android、macOS、Windows、Web
- ⚡ **高性能**: 基于 Hono 框架,性能比 Express 快10倍以上
- 🎯 **会话隔离**: 每次扫码创建独立会话,避免Cookie冲突
- ⏰ **智能提醒**: 上课前35分钟自动提醒
- 💾 **智能缓存**: 定时更新缓存,减轻服务器负担

### 技术亮点

- ✅ 使用原生 Fetch API (Node.js 18+),无需 Axios
- ✅ 完全模块化设计,代码清晰易维护
- ✅ 智能的 Cookie 传递链管理
- ✅ 会话自动保活机制
- ✅ 支持用户账号删除功能
- ✅ 智能缓存系统,支持 CDN 加速

---

## 核心特性

### 1. 二维码登录流程

```
用户访问 → 生成二维码 → 手机扫码 → 确认登录 → 获取课表 → 生成订阅链接
   ↓           ↓            ↓          ↓          ↓           ↓
 创建会话   SESSION     轮询状态   获取TGC    验证Cookie   保存数据库
```

### 2. 会话管理

- **独立会话**: 每次生成二维码创建新的独立会话
- **自动清理**: 超过2小时的会话自动清理
- **保活机制**: 前端每60秒发送保活请求
- **安全隔离**: 使用 HttpOnly Cookie 防止 XSS 攻击

### 3. Cookie 管理

- **自动重试**: SESSION Cookie 获取失败时自动重试3次
- **完整传递链**: 从登录到获取课表的完整 Cookie 传递
- **有效性检测**: 每次同步时验证 Cookie 有效性
- **过期标记**: Cookie 过期时自动标记并提示重新登录

### 4. 智能缓存机制

- **定时更新**: 每天 5:00、13:00、21:00 自动更新
- **CDN 支持**: 支持 Cloudflare CDN 加速
- **按需生成**: 缓存过期时自动重新生成
- **统计监控**: 提供缓存统计和监控接口

### 5. 用户管理

- **去重检测**: 根据 userId 或 username 检测重复用户
- **Cookie 更新**: 已存在用户扫码时自动更新 Cookie
- **账号删除**: 支持用户主动删除账号和订阅

---

## 快速开始

### 环境要求

- **Node.js**: >= 18.0.0 (支持原生 Fetch API)
- **npm**: >= 8.0.0

检查版本:
```bash
node --version  # 应该 >= v18.0.0
npm --version   # 应该 >= 8.0.0
```

### 安装步骤

#### 1. 克隆项目

```bash
git clone <repository-url>
cd schedule-subscription
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境变量

复制 `.env.example` 为 `.env`:

```bash
cp .env.example .env
```

编辑 `.env` 文件:

```env
# 管理员密码（用于清理缓存等敏感操作）
ADMIN_PASSWORD=your_secure_password_here

# 服务器端口（可选，默认 3000）
PORT=3000

# 环境（可选）
NODE_ENV=production

# 数据库文件路径（可选）
DB_PATH=schedule_server.db

# 缓存目录（可选）
CACHE_DIR=cache

# 更新时间点（小时，逗号分隔）
UPDATE_HOURS=5,13,21
```

#### 4. 配置统计ID

编辑 `src/auth.js`,设置百度统计 ID:

```javascript
const COUNT_ID = "your_baidu_tongji_id"; // 替换为你的统计ID
```

#### 5. 启动服务

**开发模式**(自动重启):
```bash
npm run dev
```

**生产模式**:
```bash
npm start
```

#### 6. 访问服务

打开浏览器访问:
```
http://localhost:3000/login
```

---

## 部署指南

### Docker 部署

#### 1. 创建 Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["npm", "start"]
```

#### 2. 构建并运行

```bash
# 构建镜像
docker build -t schedule-service .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app \
  -e ADMIN_PASSWORD=your_password \
  --name schedule-service \
  schedule-service
```

### PM2 管理

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start src/server.js --name schedule-service

# 查看日志
pm2 logs schedule-service

# 重启服务
pm2 restart schedule-service

# 停止服务
pm2 stop schedule-service

# 开机自启
pm2 startup
pm2 save
```

### Nginx 反向代理

#### HTTP 配置

```nginx
server {
    listen 80;
    server_name schedule.example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### HTTPS 配置

```nginx
server {
    listen 443 ssl http2;
    server_name schedule.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # CDN 缓存配置
    location /schedule/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # 缓存配置
        proxy_cache_bypass $http_pragma $http_authorization;
        proxy_no_cache $http_pragma $http_authorization;
        
        # 添加缓存头
        add_header X-Cache-Status $upstream_cache_status;
    }
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Cloudflare CDN 配置

#### 1. DNS 设置

- 添加 A 记录指向服务器 IP
- 启用橙色云朵（CDN 代理）

#### 2. 页面规则

创建页面规则 `schedule.example.com/schedule/*`:

```
Cache Level: Cache Everything
Edge Cache TTL: 12 hours
Browser Cache TTL: 1 hour
```

#### 3. 缓存规则

```
If URL matches: schedule.example.com/schedule/*
Then:
  - Cache eligible content
  - Respect existing headers
  - Browser TTL: 1 hour
  - Edge TTL: 12 hours
```

---

## 安全建议

### 1. 生产环境配置

#### 启用 HTTPS

- 使用 SSL/TLS 证书
- 配置 Nginx 反向代理
- 强制 HTTPS 重定向

#### Cookie 安全配置

```javascript
setCookie(c, 'session_id', sessionId, {
    httpOnly: true,
    secure: true,      // 生产环境必须开启
    sameSite: 'Strict',
    maxAge: 2 * 60 * 60
});
```

### 2. 环境变量管理

- 将敏感信息(如管理员密码)放在环境变量中
- 使用 `.env` 文件管理配置
- 不要将 `.env` 文件提交到版本控制

### 3. 日志脱敏

- 不要在日志中输出完整的 Cookie
- 不要在日志中输出用户敏感信息
- 使用日志级别控制输出内容

### 4. 定期维护

- 定期清理过期会话
- 定期清理无效用户数据
- 定期备份数据库

### 5. 管理员密码

- 设置强密码(至少8位,包含大小写字母、数字、特殊字符)
- 定期更换管理员密码
- 不要使用默认密码 `admin123`

---

## 性能优化

### 1. 数据库优化

```sql
-- 为常用查询添加索引
CREATE INDEX idx_token ON users(token);
CREATE INDEX idx_user_id ON users(user_id);
CREATE INDEX idx_cookie_valid ON users(cookie_valid);
```

### 2. 缓存策略

- 每天自动更新3次(5:00、13:00、21:00)
- 支持手动刷新缓存
- CDN 缓存12小时
- 浏览器缓存1小时

### 3. 并发控制

```javascript
// 限制并发请求数
const requestQueue = new Map();

router.post('/api/qr/status', async (c) => {
    const qrCodeId = await c.req.json().qrCodeId;
    
    // 防止重复请求
    if (requestQueue.has(qrCodeId)) {
        return c.json({ 
            success: false, 
            error: '请求进行中' 
        });
    }
    
    requestQueue.set(qrCodeId, true);
    
    try {
        // 处理请求...
    } finally {
        requestQueue.delete(qrCodeId);
    }
});
```

---

## 监控与日志

### 1. 日志记录

建议使用专业的日志库,如 `winston`:

```bash
npm install winston
```

```javascript
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ 
            filename: 'error.log', 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: 'combined.log' 
        })
    ]
});

// 使用
logger.info('用户登录', { userId: '20231001' });
logger.error('Cookie 获取失败', { error: err.message });
```

### 2. 性能监控

```javascript
// 记录请求处理时间
app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    
    if (duration > 1000) {
        console.warn(`⚠️  慢请求: ${c.req.method} ${c.req.path} - ${duration}ms`);
    }
});
```

### 3. 健康检查

```javascript
router.get('/health', (c) => {
    return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sessions: sessionStorage.size
    });
});
```

---

## 常见问题

### 1. Node.js 版本不支持 Fetch API

**错误**: `ReferenceError: fetch is not defined`

**解决**:
```bash
# 检查版本
node --version

# 升级到 Node.js 18 或更高版本
nvm install 18
nvm use 18
```

### 2. 端口被占用

**错误**: `EADDRINUSE: address already in use :::3000`

**解决**:

macOS/Linux:
```bash
lsof -i :3000
kill -9 <PID>
```

Windows:
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### 3. 二维码生成失败

**可能原因**:
- 网络连接问题
- 教务系统服务器故障
- SESSION Cookie 获取失败

**解决**:
1. 检查网络连接
2. 刷新页面重试
3. 系统会自动重试3次

### 4. Cookie 频繁过期

**可能原因**:
- 教务系统登录限制
- 多设备同时登录

**解决**:
- 重新扫码登录获取新 Cookie
- 避免在多个设备同时登录

---

## 贡献指南

欢迎提交 Issue 和 Pull Request!

### 提交 Issue

请包含以下信息:
- 问题描述
- 复现步骤
- 期望行为
- 实际行为
- 环境信息(Node.js 版本等)

### 提交 Pull Request

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 许可证

MIT License

---

## 致谢

感谢以下开源项目:

- [Hono](https://github.com/honojs/hono) - 高性能 Web 框架
- [Cheerio](https://github.com/cheeriojs/cheerio) - HTML 解析
- [ical-generator](https://github.com/sebbo2002/ical-generator) - ICS 生成
- [SQLite](https://www.sqlite.org/) - 嵌入式数据库

---

## 免责声明

本项目仅供学习和研究使用,请遵守学校相关规定。使用本项目所产生的任何问题,作者不承担责任。

---

**⭐ 如果这个项目对你有帮助,请给个 Star!**