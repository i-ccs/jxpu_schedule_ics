# 快速开始指南

5分钟快速部署课表订阅服务

---

## 前置要求

### 必需环境

- ✅ **Node.js >= 18.0.0**
- ✅ **npm >= 8.0.0**

### 检查环境

```bash
node --version   # 输出: v18.0.0 或更高
npm --version    # 输出: 8.0.0 或更高
```

### 如果版本不符合

使用 nvm 安装:

```bash
# 安装 nvm (如果还没安装)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 安装 Node.js 18
nvm install 18
nvm use 18
```

---

## 快速部署

### 方式一: 标准部署 (推荐)

#### 1. 获取代码

```bash
# 克隆仓库
git clone <repository-url>
cd schedule-subscription

# 或下载 ZIP 后解压
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
nano .env  # 或使用其他编辑器
```

**必须修改的配置**:

```env
# 设置管理员密码(用于清理缓存)
ADMIN_PASSWORD=your_secure_password

# 可选: 修改端口
PORT=3000
```

#### 4. 配置统计ID (可选)

编辑 `src/auth.js`:

```javascript
const COUNT_ID = "your_baidu_tongji_id";  // 改为你的百度统计ID
```

#### 5. 启动服务

```bash
npm start
```

#### 6. 访问服务

打开浏览器访问:
```
http://localhost:3000/login
```

---

### 方式二: Docker 部署

#### 1. 构建镜像

```bash
docker build -t schedule-service .
```

#### 2. 运行容器

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_PASSWORD=your_password \
  --name schedule-service \
  schedule-service
```

#### 3. 查看日志

```bash
docker logs -f schedule-service
```

#### 4. 停止服务

```bash
docker stop schedule-service
docker rm schedule-service
```

---

### 方式三: PM2 部署 (生产推荐)

#### 1. 安装 PM2

```bash
npm install -g pm2
```

#### 2. 启动服务

```bash
pm2 start src/server.js --name schedule
```

#### 3. 查看状态

```bash
pm2 status
pm2 logs schedule
```

#### 4. 设置开机自启

```bash
pm2 startup
pm2 save
```

---

## 使用流程

### 用户端使用

#### 1. 访问登录页面

```
http://your-domain.com/login
```

#### 2. 扫码登录

- 页面自动生成二维码
- 使用手机扫码
- 在手机上确认登录

#### 3. 设置学期开始日期

- 输入第一周周一的日期
- 例如: 2025-09-08

#### 4. 获取订阅链接

- 登录成功后自动生成订阅链接
- 复制链接或下载 ICS 文件

#### 5. 添加到日历

**iOS 日历**:
```
设置 → 日历 → 账户 → 添加账户 → 其他 → 
添加已订阅的日历 → 粘贴订阅链接
```

**Google 日历**:
```
设置 → 添加日历 → 通过 URL → 粘贴订阅链接
```

**Outlook**:
```
添加日历 → 从 Internet → 粘贴订阅链接
```

---

## 验证安装

### 1. 检查服务运行

```bash
# 查看进程
ps aux | grep node

# 或使用 PM2
pm2 status
```

### 2. 测试 API

```bash
# 健康检查
curl http://localhost:3000/health

# 查看统计
curl http://localhost:3000/api/stats

# 生成二维码
curl http://localhost:3000/api/qr/generate
```

### 3. 查看日志

```bash
# 标准输出
tail -f nohup.out

# PM2 日志
pm2 logs schedule

# Docker 日志
docker logs -f schedule-service
```

---

## 常见问题

### 1. 端口被占用

**错误信息**:
```
Error: listen EADDRINUSE: address already in use :::3000
```

**解决方法**:

```bash
# 查找占用端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>

# 或修改端口
# 编辑 .env 文件
PORT=3001
```

### 2. Node.js 版本过低

**错误信息**:
```
ReferenceError: fetch is not defined
```

**解决方法**:

```bash
# 升级 Node.js 到 18+
nvm install 18
nvm use 18

# 重新安装依赖
npm install
```

### 3. 模块找不到

**错误信息**:
```
Error: Cannot find module 'hono'
```

**解决方法**:

```bash
# 重新安装依赖
npm install

# 或清除缓存后重装
rm -rf node_modules package-lock.json
npm install
```

### 4. 二维码不显示

**可能原因**:
- 网络连接问题
- 教务系统访问受限

**解决方法**:
- 检查网络连接
- 查看控制台错误信息
- 刷新页面重试

### 5. Cookie 频繁过期

**解决方法**:
- 重新扫码登录
- 避免多设备同时登录
- 检查数据库中的 Cookie 有效性

---

## 性能调优

### 1. 缓存配置

默认缓存更新时间为每天 5:00、13:00、21:00

修改更新时间:

```env
# .env 文件
UPDATE_HOURS=6,14,22
```

### 2. 数据库优化

```bash
# 进入数据库
sqlite3 schedule_server.db

# 添加索引
CREATE INDEX idx_token ON users(token);
CREATE INDEX idx_user_id ON users(user_id);
CREATE INDEX idx_cookie_valid ON users(cookie_valid);
```

### 3. 启用 CDN

如果部署到公网,建议使用 Cloudflare CDN:

1. 将域名接入 Cloudflare
2. 启用橙色云朵(CDN 代理)
3. 配置页面规则缓存

---

## 升级指南

### 从旧版本升级

#### 1. 备份数据

```bash
# 备份数据库
cp schedule_server.db schedule_server.db.backup

# 备份配置
cp .env .env.backup
```

#### 2. 获取新代码

```bash
git pull origin main
# 或下载新版本解压覆盖
```

#### 3. 更新依赖

```bash
npm install
```

#### 4. 重启服务

```bash
# 标准方式
npm start

# PM2 方式
pm2 restart schedule

# Docker 方式
docker restart schedule-service
```

---

## 下一步

- 📖 阅读 [完整文档](README.md)
- 🔧 查看 [API 文档](API.md)
- 🐛 查看 [调试指南](DEBUG.md)
- 🏗️ 了解 [项目结构](STRUCTURE.md)

---

## 获取帮助

遇到问题? 

1. 查看 [常见问题](README.md#常见问题)
2. 查看 [调试指南](DEBUG.md)
3. 提交 [Issue](https://github.com/your-repo/issues)

---

**🎉 恭喜! 你已经成功部署了课表订阅服务!**