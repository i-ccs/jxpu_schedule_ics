## 调试指南

### 开发环境配置

#### 启动开发模式

```bash
npm run dev
```

使用 nodemon 自动监听文件变化并重启服务。

#### 日志输出

代码中使用 emoji 标识不同类型的日志:

- 🔄 **流程日志**: 操作步骤
- ✅ **成功日志**: 操作成功
- ❌ **错误日志**: 操作失败
- ⚠️  **警告日志**: 需要注意
- 📝 **信息日志**: 一般信息
- 🔍 **调试日志**: 调试信息

### 常见调试场景

#### 1. SESSION Cookie 获取失败

**问题**: 生成二维码时无法获取 SESSION Cookie

**调试步骤**:

1. 检查 auth.js 中的重试逻辑
2. 查看控制台输出的详细日志
3. 验证网络连接是否正常

**示例日志**:
```
🔄 尝试获取二维码 SESSION (第 1/3 次)
⚠️  第 1 次未获取到 SESSION,当前 Cookies: Hm_lvt_xxx, Hm_lpvt_xxx
🔄 尝试获取二维码 SESSION (第 2/3 次)
✅ 成功获取 SESSION: 1A2B3C4D5E6F...
```

#### 2. 二维码过期

**问题**: 扫码时提示二维码已过期

**原因**: 二维码有效期为 5 分钟

**解决**: 点击"重新生成二维码"

#### 3. Cookie 过期

**问题**: 课表同步失败,提示 Cookie 过期

**解决**: 
1. 访问首页重新扫码登录
2. 获取新的订阅链接
3. 更新日历应用中的订阅

#### 4. 数据库查询

使用 SQLite 命令行工具:

```bash
sqlite3 schedule_server.db

# 查看所有表
.tables

# 查看用户表结构
.schema users

# 查询所有用户
SELECT * FROM users;

# 退出
.quit
```

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
      "program": "${workspaceFolder}/src/server.js",
      "restart": true,
      "runtimeExecutable": "nodemon",
      "console": "integratedTerminal"
    }
  ]
}
```

按 `F5` 启动调试。

---


---

## 常见问题

### 1. Node.js 版本不支持 Fetch API

**错误**: `ReferenceError: fetch is not defined`

**原因**: Node.js 版本低于 18.0.0

**解决**:
```bash
# 检查版本
node --version

# 升级到 Node.js 18 或更高版本
# 使用 nvm
nvm install 18
nvm use 18
```

### 2. 模块找不到

**错误**: `Cannot find module 'hono'`

**解决**:
```bash
npm install
```

### 3. 端口被占用

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

### 4. 二维码生成失败

**可能原因**:
- 网络连接问题
- 教务系统服务器故障
- SESSION Cookie 获取失败

**解决**:
1. 检查网络连接
2. 刷新页面重试
3. 系统会自动重试3次

### 5. 扫码后无响应

**可能原因**:
- 网络延迟
- 未在手机上确认登录

**解决**:
1. 等待2-3秒
2. 确保在手机上点击"确认登录"

### 6. 订阅无法更新

**可能原因**: Cookie 已过期

**解决**: 重新扫码登录获取新的订阅链接

### 7. 课程时间不准确

**可能原因**: 学期开始日期设置错误

**解决**: 确认第一周周一的日期,重新生成

---

## 故障排查

### 问题排查清单

#### 服务无法启动

- [ ] 检查 Node.js 版本 >= 18.0.0
- [ ] 检查依赖是否安装 (`npm install`)
- [ ] 检查端口 3000 是否被占用
- [ ] 检查 `src/auth.js` 中的 COUNT_ID 是否设置
- [ ] 查看启动日志中的错误信息

#### 二维码无法生成

- [ ] 检查网络连接
- [ ] 检查教务系统是否正常访问
- [ ] 查看控制台日志中的详细错误
- [ ] 尝试手动访问 `https://sso.jxpu.edu.cn/cas/login`
- [ ] 检查是否被防火墙拦截

#### 扫码后无反应

- [ ] 检查是否在手机上点击"确认登录"
- [ ] 查看浏览器控制台是否有错误
- [ ] 检查网络连接是否稳定
- [ ] 查看服务器日志中的轮询记录
- [ ] 尝试重新生成二维码

#### Cookie 频繁过期

- [ ] 检查教务系统是否有登录限制
- [ ] 查看数据库中 Cookie 的有效期
- [ ] 检查是否在多个设备同时登录
- [ ] 查看服务器日志中的错误信息
- [ ] 尝试清除浏览器缓存后重新登录

#### 课表数据不完整

- [ ] 检查学期开始日期是否正确
- [ ] 查看教务系统中的课表是否完整
- [ ] 检查解析逻辑是否有误
- [ ] 保存 HTML 文件手动检查
- [ ] 查看服务器日志中的解析记录
