# 📅 课表订阅服务 - 完整项目文档

江西职业技术大学课表自动订阅系统 v0.2

---

## 📚 目录

1. [项目概述](#项目概述)
2. [核心特性](#核心特性)
4. [快速开始](#快速开始)

10. [部署指南](#部署指南)

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

### 技术亮点

- ✅ 使用原生 Fetch API (Node.js 18+),无需 Axios
- ✅ 完全模块化设计,代码清晰易维护
- ✅ 智能的 Cookie 传递链管理
- ✅ 会话自动保活机制
- ✅ 支持用户账号删除功能

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

### 4. 用户管理

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

#### 3. 配置统计ID

编辑 `src/auth.js`,设置百度统计 ID:

```javascript
const COUNT_ID = "your_baidu_tongji_id"; // 替换为你的统计ID
```

#### 4. 启动服务

**开发模式**(自动重启):
```bash
npm run dev
```

**生产模式**:
```bash
npm start
```

#### 5. 访问服务

打开浏览器访问:
```
http://localhost:3000/login
```
---

## 部署指南

### Docker 部署

#### Dockerfile

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

#### 构建并运行

```bash
# 构建镜像
docker build -t schedule-service .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app \
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
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```


## 贡献指南

欢迎提交 Issue 和 Pull Request!

### 提交 Issue

请包含以下信息:
- 问题描述
- 复现步骤
- 期望行为
- 实际行为
- 环境信息(Node.js 版本等)

---

## 安全建议

### 生产环境

1. **启用 HTTPS**
   - 使用 SSL/TLS 证书
   - 配置 Nginx 反向代理

2. **Cookie 安全**
   ```javascript
   setCookie(c, 'session_id', sessionId, {
       httpOnly: true,
       secure: true,      // 生产环境必须开启
       sameSite: 'Strict',
       maxAge: 2 * 60 * 60
   });
   ```

3. **环境变量**
   - 将敏感信息(如统计ID)放在环境变量中
   - 使用 `.env` 文件管理配置

4. **日志脱敏**
   - 不要在日志中输出完整的 Cookie
   - 不要在日志中输出用户敏感信息

5. **定期清理**
   - 定期清理过期会话
   - 定期清理无效用户数据

---

## 性能优化

### 1. 数据库优化

```sql
-- 为常用查询添加索引
CREATE INDEX idx_token ON users(token);
CREATE INDEX idx_user_id ON users(user_id);
CREATE INDEX idx_cookie_valid ON users(cookie_valid);
```

### 2. 会话清理策略

```javascript
// 更激进的清理策略(生产环境)
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [sessionId, session] of sessionStorage.entries()) {
        if (now - session.timestamp > oneHour) {
            sessionStorage.delete(sessionId);
        }
    }
}, 5 * 60 * 1000); // 每5分钟清理一次
```

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


---

## 技术债务

### 当前已知问题

1. **内存存储会话**
   - 当前使用内存存储会话数据
   - 服务器重启会丢失所有会话
   - 建议: 使用 Redis 等持久化存储

2. **无速率限制**
   - 当前没有 API 请求速率限制
   - 可能被恶意请求攻击
   - 建议: 添加 rate limiting 中间件

3. **错误处理**
   - 部分错误处理不够细致
   - 建议: 完善错误分类和处理

4. **测试覆盖**
   - 当前没有自动化测试
   - 建议: 添加单元测试和集成测试


---

## 参考资源

### 官方文档

- [Hono 官方文档](https://hono.dev/)
- [Node.js Fetch API](https://nodejs.org/dist/latest-v18.x/docs/api/globals.html#fetch)
- [Cheerio 文档](https://cheerio.js.org/)
- [ical-generator 文档](https://github.com/sebbo2002/ical-generator)
- [SQLite 文档](https://www.sqlite.org/docs.html)

### 相关技术

- [ICS 文件格式规范](https://icalendar.org/)
- [HTTP Cookie](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Cookies)
- [Session 管理最佳实践](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

### 推荐阅读

- [Web 安全最佳实践](https://owasp.org/www-project-top-ten/)
- [Node.js 性能优化](https://nodejs.org/en/docs/guides/simple-profiling/)
- [RESTful API 设计指南](https://restfulapi.net/)


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