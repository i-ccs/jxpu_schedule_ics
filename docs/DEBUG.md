# 调试指南

完整的开发调试和故障排查指南

---

## 目录

1. [开发环境配置](#开发环境配置)
2. [日志系统](#日志系统)
3. [常见调试场景](#常见调试场景)
4. [VS Code 调试](#vs-code-调试)
5. [数据库调试](#数据库调试)
6. [网络请求调试](#网络请求调试)
7. [故障排查清单](#故障排查清单)

---

## 开发环境配置

### 启动开发模式

```bash
npm run dev
```

使用 nodemon 自动监听文件变化并重启服务。

### 开发工具推荐

- **VS Code**: 代码编辑器
- **Postman**: API 测试
- **SQLite Browser**: 数据库查看
- **Chrome DevTools**: 前端调试

---

## 日志系统

### 日志类型

代码中使用 emoji 标识不同类型的日志:

| Emoji | 类型 | 用途 |
|-------|------|------|
| 🔄 | 流程日志 | 操作步骤 |
| ✅ | 成功日志 | 操作成功 |
| ❌ | 错误日志 | 操作失败 |
| ⚠️ | 警告日志 | 需要注意 |
| 📝 | 信息日志 | 一般信息 |
| 🔍 | 调试日志 | 调试信息 |
| 🔑 | 会话日志 | 会话相关 |
| 👤 | 用户日志 | 用户操作 |
| 📅 | 课表日志 | 课表操作 |
| 💾 | 数据库日志 | 数据库操作 |
| 📦 | 缓存日志 | 缓存操作 |

### 日志位置

```bash
# 标准输出
npm start

# PM2 日志
pm2 logs schedule

# Docker 日志
docker logs -f schedule-service

# 文件日志 (如果配置了)
tail -f logs/combined.log
tail -f logs/error.log
```

### 日志级别配置

在 `.env` 文件中设置:

```env
LOG_LEVEL=debug  # debug, info, warn, error
```

---

## 常见调试场景

### 1. SESSION Cookie 获取失败

#### 问题描述

生成二维码时无法获取 SESSION Cookie

#### 调试步骤

**1. 查看控制台输出**

```
🔄 尝试获取二维码 SESSION (第 1/3 次)
⚠️  第 1 次未获取到 SESSION,当前 Cookies: Hm_lvt_xxx, Hm_lpvt_xxx
🔄 尝试获取二维码 SESSION (第 2/3 次)
⚠️  第 2 次未获取到 SESSION,当前 Cookies: Hm_lvt_xxx, Hm_lpvt_xxx
🔄 尝试获取二维码 SESSION (第 3/3 次)
✅ 成功获取 SESSION: 1A2B3C4D5E6F...
```

**2. 检查网络连接**

```bash
# 测试教务系统连接
curl -I https://sso.jxpu.edu.cn/cas/login

# 测试二维码接口
curl -I https://sso.jxpu.edu.cn/cas/qr/qrcode
```

**3. 检查 SSL 证书**

```javascript
// src/auth.js
const httpsAgent = new https.Agent({ 
    rejectUnauthorized: false  // 已忽略证书验证
});
```

**4. 增加调试日志**

在 `src/auth.js` 的 `generateQRCode` 函数中添加:

```javascript
console.log('📝 响应状态:', qrResponse.status);
console.log('📝 响应头:', qrResponse.headers);
console.log('📝 Set-Cookie:', getSetCookieHeaders(qrResponse));
```

#### 可能原因

- 网络连接不稳定
- 教务系统服务器故障
- Cookie 解析逻辑错误
- Node.js 版本不兼容

#### 解决方案

1. 检查网络连接
2. 等待教务系统恢复
3. 更新 Node.js 到最新 18.x 版本
4. 检查 Cookie 解析逻辑

---

### 2. 二维码过期

#### 问题描述

扫码时提示二维码已过期

#### 调试信息

```javascript
// 前端控制台
{
  "code": 1,
  "message": "expired",
  "success": false
}
```

#### 原因分析

- 二维码有效期为 127 秒 (约 2 分钟)
- 会话超过 2 小时自动清理

#### 解决方案

1. 点击"重新生成二维码"
2. 加快扫码速度
3. 确保前端保活正常工作

#### 验证保活机制

```javascript
// 前端 login.html
async function startKeepalive() {
    await keepalive();
    keepaliveInterval = setInterval(async () => {
        await keepalive();
    }, 60 * 1000); // 每60秒
}
```

---

### 3. Cookie 过期

#### 问题描述

课表同步失败,提示 Cookie 过期

#### 调试步骤

**1. 检查数据库**

```bash
sqlite3 schedule_server.db

SELECT token, cookie_valid, cookie_expired_at, last_sync 
FROM users 
WHERE token = 'your_token';
```

**2. 查看服务器日志**

```
❌ 获取课表失败: Cookie可能已过期或响应异常
⚠️  Cookie已标记为无效
```

**3. 测试 Cookie 有效性**

```bash
# 使用 curl 测试
curl -X GET https://jiaowu.jxpu.edu.cn/jsxsd/xskb/xskb_list.do \
  -H "Cookie: TGC=xxx; JSESSIONID=xxx"
```

**4. 检查登录页面特征**

```javascript
// src/auth.js
if (html.includes('<title>登录 - 江西职业技术大学</title>')) {
    return { success: false, error: 'Cookie无效或已过期' };
}
```

#### 解决方案

1. 重新扫码登录获取新 Cookie
2. 更新订阅链接
3. 检查是否多设备登录导致 Cookie 失效

---

### 4. 缓存问题

#### 问题描述

缓存未更新或缓存损坏

#### 调试步骤

**1. 检查缓存统计**

```bash
curl http://localhost:3000/api/cache/stats
```

**2. 查看缓存文件**

```bash
ls -lh cache/
cat cache/cache-index.json
```

**3. 检查缓存更新日志**

```
🔄 开始定时更新所有缓存...
📊 共 100 个用户需要更新
🔄 生成课表缓存: AbCdEf123456...
✅ 缓存已更新: 15 门课程
✅ 缓存更新完成: 成功 95 个, 失败 5 个
```

**4. 手动刷新缓存**

```bash
curl -X POST http://localhost:3000/api/cache/refresh/your_token
```

**5. 清理所有缓存**

```bash
curl -X POST http://localhost:3000/api/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"password":"your_admin_password"}'
```

#### 可能原因

- 缓存文件损坏
- 磁盘空间不足
- 权限问题
- Cookie 过期导致无法更新

#### 解决方案

1. 清理并重新生成缓存
2. 检查磁盘空间
3. 检查文件权限
4. 验证 Cookie 有效性

---

### 5. 课程时间不准确

#### 问题描述

课程时间与实际不符

#### 调试步骤

**1. 检查学期开始日期**

```bash
sqlite3 schedule_server.db

SELECT token, semester_start 
FROM users 
WHERE token = 'your_token';
```

**2. 验证时间计算逻辑**

```javascript
// src/parser.js
const semesterStartDate = new Date(semesterStart);
const daysOffset = (week - 1) * 7 + weekday;
const courseDate = new Date(semesterStartDate);
courseDate.setDate(courseDate.getDate() + daysOffset);
```

**3. 检查节次时间映射**

```javascript
// src/parser.js
const lessonTimes = {
    1: ['08:20', '10:00'],  // 第1-2节
    2: ['10:20', '12:00'],  // 第3-4节
    3: ['14:00', '15:40'],  // 第5-6节
    4: ['16:00', '17:35'],  // 第7-8节
    5: ['17:40', '19:20'],  // 第9-10节
    6: ['19:30', '21:10']   // 第11-12节
};
```

**4. 查看原始 HTML**

保存课表 HTML 进行分析:

```javascript
// src/auth.js - fetchSchedule 函数
const fs = require('fs').promises;
await fs.writeFile('schedule.html', scheduleHtml);
```

#### 解决方案

1. 确认第一周周一的正确日期
2. 重新生成订阅链接
3. 检查节次时间是否与学校一致
4. 验证周次解析逻辑

---

### 6. 解析失败

#### 问题描述

课表 HTML 解析失败,未提取到课程

#### 调试步骤

**1. 保存 HTML 文件**

```javascript
// src/routers/router.js
const fs = require('fs').promises;
await fs.writeFile('debug_schedule.html', scheduleResult.html);
```

**2. 检查 HTML 结构**

```bash
# 查看 HTML 文件
open debug_schedule.html

# 或使用命令行
grep -A 5 "Nsb_r_list" debug_schedule.html
```

**3. 测试选择器**

```javascript
const cheerio = require('cheerio');
const $ = cheerio.load(html);

console.log('表格数量:', $('table.Nsb_r_list').length);
console.log('课程单元格:', $('td .kbcontent').length);
console.log('课程信息:', $('p[title]').length);
```

**4. 检查课程名称解析**

```javascript
// src/parser.js
function cleanCourseName(rawName) {
    console.log('原始名称:', rawName);
    const cleaned = rawName.replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&');
    console.log('清理后:', cleaned);
    return cleaned;
}
```

#### 可能原因

- HTML 结构变化
- 选择器不匹配
- HTML 实体未正确解码
- 课程信息格式变化

#### 解决方案

1. 更新 HTML 选择器
2. 完善课程名称清理逻辑
3. 处理新的 HTML 实体
4. 适配新的课程信息格式

---

## VS Code 调试

### 调试配置

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
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "development"
      }
    },
    {
      "type": "node",
      "request": "launch",
      "name": "调试单个模块",
      "program": "${workspaceFolder}/src/auth.js",
      "console": "integratedTerminal"
    }
  ]
}
```

### 使用断点

1. 在代码行号左侧点击设置断点
2. 按 `F5` 启动调试
3. 使用调试工具栏控制执行:
   - **继续** (F5): 继续执行
   - **单步跳过** (F10): 执行下一行
   - **单步进入** (F11): 进入函数
   - **单步跳出** (Shift+F11): 跳出函数

### 查看变量

- **变量面板**: 查看当前作用域的所有变量
- **监视**: 添加表达式进行监视
- **调用堆栈**: 查看函数调用链
- **调试控制台**: 执行表达式

---

## 数据库调试

### SQLite 命令行

```bash
# 打开数据库
sqlite3 schedule_server.db

# 查看所有表
.tables

# 查看表结构
.schema users

# 格式化输出
.mode column
.headers on

# 查询所有用户
SELECT * FROM users;

# 查询有效用户
SELECT token, user_id, username, cookie_valid 
FROM users 
WHERE cookie_valid = 1;

# 查询过期用户
SELECT token, username, cookie_expired_at 
FROM users 
WHERE cookie_valid = 0;

# 统计信息
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN cookie_valid = 1 THEN 1 ELSE 0 END) as valid,
  SUM(CASE WHEN last_sync IS NOT NULL THEN 1 ELSE 0 END) as synced
FROM users;

# 退出
.quit
```

### 数据库备份

```bash
# 备份数据库
cp schedule_server.db schedule_server.db.backup

# 或使用 SQLite 命令
sqlite3 schedule_server.db ".backup backup.db"

# 恢复数据库
cp schedule_server.db.backup schedule_server.db
```

### 数据库修复

```bash
# 检查完整性
sqlite3 schedule_server.db "PRAGMA integrity_check;"

# 重建索引
sqlite3 schedule_server.db "REINDEX;"

# 清理
sqlite3 schedule_server.db "VACUUM;"
```

---

## 网络请求调试

### 使用 curl 测试

```bash
# 生成二维码
curl -v http://localhost:3000/api/qr/generate

# 轮询状态
curl -X POST http://localhost:3000/api/qr/status \
  -H "Content-Type: application/json" \
  -H "Cookie: session_id=xxx" \
  -d '{"qrCodeId":"123456"}'

# 获取课表
curl -v http://localhost:3000/schedule/your_token

# 查看统计
curl http://localhost:3000/api/stats | jq
```

### 使用 Postman

1. 导入 API 接口
2. 设置环境变量
3. 配置 Cookie
4. 测试各个接口
5. 保存测试用例

### 抓包分析

使用 Chrome DevTools:

1. 打开开发者工具 (F12)
2. 切换到 Network 标签
3. 刷新页面
4. 查看请求详情:
   - Headers: 请求头和响应头
   - Payload: 请求体
   - Response: 响应内容
   - Timing: 时间分析

---

## 故障排查清单

### 服务无法启动

- [ ] 检查 Node.js 版本 >= 18.0.0
- [ ] 检查依赖是否安装 (`npm install`)
- [ ] 检查端口 3000 是否被占用
- [ ] 检查 `src/auth.js` 中的 COUNT_ID 是否设置
- [ ] 查看启动日志中的错误信息

### 二维码无法生成

- [ ] 检查网络连接
- [ ] 检查教务系统是否正常访问
- [ ] 查看控制台日志中的详细错误
- [ ] 尝试手动访问 `https://sso.jxpu.edu.cn/cas/login`
- [ ] 检查是否被防火墙拦截

### 扫码后无反应

- [ ] 检查是否在手机上点击"确认登录"
- [ ] 查看浏览器控制台是否有错误
- [ ] 检查网络连接是否稳定
- [ ] 查看服务器日志中的轮询记录
- [ ] 尝试重新生成二维码

### Cookie 频繁过期

- [ ] 检查教务系统是否有登录限制
- [ ] 查看数据库中 Cookie 的有效期
- [ ] 检查是否在多个设备同时登录
- [ ] 查看服务器日志中的错误信息
- [ ] 尝试清除浏览器缓存后重新登录

### 课表数据不完整

- [ ] 检查学期开始日期是否正确
- [ ] 查看教务系统中的课表是否完整
- [ ] 检查解析逻辑是否有误
- [ ] 保存 HTML 文件手动检查
- [ ] 查看服务器日志中的解析记录

### 缓存问题

- [ ] 检查缓存目录是否存在
- [ ] 查看缓存统计信息
- [ ] 检查磁盘空间是否充足
- [ ] 验证文件权限
- [ ] 尝试清理并重新生成缓存

---

## 获取帮助

### 日志收集

提交问题时,请提供:

1. **错误信息**: 完整的错误堆栈
2. **系统信息**: Node.js 版本、操作系统
3. **重现步骤**: 详细的操作步骤
4. **相关日志**: 服务器日志片段
5. **配置信息**: 环境变量配置(隐藏敏感信息)

### 提交 Issue

包含以下信息:

```markdown
## 问题描述
简要描述遇到的问题

## 环境信息
- Node.js 版本: 
- npm 版本:
- 操作系统:
- 部署方式: (标准/Docker/PM2)

## 重现步骤
1. 
2. 
3. 

## 期望行为
描述期望的结果

## 实际行为
描述实际发生的情况

## 错误日志
```
粘贴相关日志
```

## 截图
如果适用,添加截图
```

---

## 调试技巧

### 1. 逐步调试

遇到复杂问题时:
1. 从最简单的部分开始
2. 逐步添加功能
3. 每步都进行验证
4. 找到问题所在

### 2. 对比调试

- 对比正常和异常情况
- 对比不同环境的表现
- 对比代码修改前后

### 3. 隔离问题

- 注释掉部分代码
- 使用最小化测试用例
- 排除无关因素

### 4. 日志驱动

- 添加详细的日志
- 使用不同日志级别
- 记录关键变量值

### 5. 查阅文档

- 查看官方文档
- 搜索相关问题
- 查看 Issue 和 PR

---

**🔧 祝你调试顺利!**