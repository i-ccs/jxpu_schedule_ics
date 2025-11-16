# 📅 课表订阅服务 - Node.js版

江西职业技术大学课表自动订阅系统，支持同步到各类日历应用。

## ✨ 主要特性

- 🔄 **自动同步**: 日历应用自动拉取最新课表
- 🔐 **安全可靠**: Token机制保护个人数据
- ⚠️ **Cookie过期处理**: 自动检测并提示用户更新
- 📱 **多平台支持**: iOS、Android、macOS、Windows、Web
- ⏰ **智能提醒**: 上课前35分钟自动提醒
- 🎯 **全学期覆盖**: 一次生成，全学期可用

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
# 生产环境
npm start

# 开发环境（自动重启）
npm run dev
```

### 3. 访问服务

打开浏览器访问: `http://localhost:3000`

## 📝 使用指南

### 获取TGC Cookie

1. 访问 [https://sso.jxpu.edu.cn/cas/login](https://sso.jxpu.edu.cn/cas/login)
2. 登录账号
3. 按 `F12` 打开开发者工具
4. 进入 `Application` (Chrome) 或 `存储` (Firefox) 标签
5. 左侧找到 `Cookies` → `https://sso.jxpu.edu.cn`
6. 复制 `TGC` 的 `Value` 值

### 生成订阅链接

1. 在网页中粘贴TGC值
2. 选择学期开始日期（第一周周一）
3. 点击"生成订阅链接"
4. 保存生成的订阅URL

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

## 🔧 Cookie过期处理

### 自动检测机制

系统会在每次同步时检查Cookie有效性：

- ✅ **有效**: 正常返回课表数据
- ❌ **过期**: 
  - 标记Cookie为无效
  - 返回401错误
  - 提示用户获取新的TGC Cookie

### 过期后的操作

1. 重新登录教务系统
2. 获取新的TGC Cookie
3. 访问订阅服务首页
4. 更新TGC Cooir
5. 测试链接是否有用

### 数据库字段

```sql
cookie_valid INTEGER DEFAULT 1  -- 1=有效, 0=无效
```

## 🗄️ 数据库结构

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,           -- 订阅Token
    cookies TEXT NOT NULL,                -- Cookie JSON
    semester_start TEXT NOT NULL,         -- 学期开始日期
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync TIMESTAMP,                  -- 最后同步时间
    cookie_valid INTEGER DEFAULT 1        -- Cookie有效性
);
```

## 📊 统计接口

访问 `/api/stats` 查看统计信息：

```json
{
  "total_users": 100,      // 总用户数
  "active_users": 80,      // 活跃用户数
  "valid_cookies": 75      // Cookie有效用户数
}
```

## 🔒 安全建议

1. **不要分享订阅链接**: Token可以访问你的课表数据
2. **定期检查**: 确保订阅正常更新
3. **Cookie过期后及时更新**: 避免数据不同步
4. **使用HTTPS**: 生产环境建议配置SSL证书

## 🐛 常见问题

### 1. 订阅无法更新

**可能原因**: Cookie已过期

**解决方法**: 重新获取TGC Cookie

### 2. 课程时间不准确

**可能原因**: 学期开始日期设置错误

**解决方法**: 确认第一周周一的日期，重新生成

### 3. 部分课程缺失

**可能原因**: 教务系统数据更新延迟

**解决方法**: 等待教务系统更新后，日历应用会自动同步

### 4. iOS无法订阅

**可能原因**: 
- URL格式错误
- 需要使用HTTPS

**解决方法**: 
- 检查URL完整性
- 使用反向代理配置HTTPS

## 🚀 部署指南

### Docker部署

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

### Nginx反向代理

```nginx
server {
    listen 80;
    server_name schedule.example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 使用PM2管理

```bash
npm install -g pm2

# 启动服务
pm2 start server.js --name schedule-service

# 查看日志
pm2 logs schedule-service

# 开机自启
pm2 startup
pm2 save
```

## 📦 依赖说明

- **express**: Web框架
- **axios**: HTTP客户端
- **cheerio**: HTML解析
- **ical-generator**: ICS日历生成
- **sqlite3**: 轻量级数据库

## 📄 License

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📮 联系方式

如有问题，请提交Issue或联系维护者。

---

⭐ 如果这个项目对你有帮助，请给个Star！
