# ⚡ 快速调试指南

## 🎯 5分钟开始调试

### 第1步：安装依赖
```bash
npm install
```

### 第2步：启动服务器
```bash
# 方式1: 开发模式（推荐）
npm run dev

# 方式2: 普通模式
npm start
```

### 第3步：测试服务
```bash
# 打开浏览器访问
http://localhost:3000
```

---

## 🐛 常用调试命令

### 1️⃣ 测试API接口
```bash
# 交互式测试工具
node scripts/test-api.js

# 快速测试注册
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"tgc":"你的TGC","semester_start":"2025-09-08"}'

# 快速测试课表
curl http://localhost:3000/schedule/你的token
```

### 2️⃣ 查看数据库
```bash
# 命令行查看
sqlite3 schedule_server.db "SELECT * FROM users;"

# 或使用脚本
node scripts/db-viewer.js
```

### 3️⃣ 检查Cookie有效性
```bash
node scripts/check-cookie.js 你的TGC值
```

### 4️⃣ 清空数据库
```bash
node scripts/reset-db.js
```

---

## 🔥 VS Code 调试（最强大）

### 配置步骤：
1. 创建 `.vscode/launch.json` 文件（已提供配置）
2. 在代码行号左侧点击设置断点
3. 按 `F5` 或点击"运行和调试"
4. 选择配置：
   - **🚀 启动服务器** - 普通调试
   - **🔄 启动服务器 (nodemon)** - 自动重启
   - **🧪 运行测试脚本** - 测试API

### 调试快捷键：
- `F5` - 开始调试
- `F10` - 单步跳过
- `F11` - 单步进入
- `Shift+F11` - 单步跳出
- `F9` - 切换断点
- `Shift+F5` - 停止调试

---

## 🔥 SSO登录问题排查

### 🔍 问题：Cookie有效但无法登录

**症状**: Cookie是正确的，但访问教务系统时仍然跳转到登录页面

**原因**: SSO单点登录需要正确的跳转流程和Cookie管理

**解决方案**:

#### 1. 使用专用测试脚本
```bash
node scripts/test-sso.js 你的TGC
```

这个脚本会：
- ✅ 详细显示每一步的状态
- ✅ 保存每个步骤的HTML响应
- ✅ 显示Cookie的变化过程
- ✅ 帮助定位具体哪一步出错

#### 2. 检查输出日志

正常流程应该是：
```
📍 步骤1: 访问CAS登录页面
   ✅ 状态码: 302
   🔄 重定向: https://jiaowu.jxpu.edu.cn/jsxsd/sso.jsp?ticket=ST-...
   🎫 Ticket: ST-xxxxx...
   → 新Cookie: JSESSIONID

📍 步骤2: 访问教务系统SSO
   ✅ 状态码: 302
   🔄 重定向: /jsxsd/framework/xsMain.jsp
   → 新Cookie: SERVERID

📍 步骤3: 访问教务系统主页
   ✅ 状态码: 200
   ✅ 成功登录到教务系统

📍 步骤4: 获取课表
   ✅ 状态码: 200
   📋 包含课表标题: true
   ✅ 成功获取课表！
```

#### 3. 常见错误模式

**错误1: 步骤1返回200而不是302**
```
📍 步骤1: 访问CAS登录页面
   ✅ 状态码: 200
   ❌ 返回了登录页面，TGC可能无效
```
**解决**: TGC已过期或无效，需要重新获取

**错误2: 未获得Ticket**
```
📍 步骤1: 访问CAS登录页面
   ✅ 状态码: 302
   🔄 重定向: https://sso.jxpu.edu.cn/cas/login?service=...
   ⚠️  未找到Ticket
```
**解决**: SSO认证失败，检查TGC是否正确

**错误3: 步骤3要求登录**
```
📍 步骤3: 访问教务系统主页
   ✅ 状态码: 200
   ❌ 页面要求登录，SSO认证失败
```
**解决**: Cookie传递有问题，查看debug_main_page.html

### 快速添加日志：

```javascript
// 在任何函数开头添加
console.log('🔍 [函数名] 参数:', 参数);

// 查看变量
console.log('📊 变量名:', 变量);

// 错误日志
console.error('❌ 错误:', error);

// 成功日志
console.log('✅ 成功:', 结果);
```

### 推荐的日志位置：

**1. 数据库操作：**
```javascript
function getUser(token) {
    console.log('📊 [DB] 查询用户:', token.substring(0, 8));
    // ... 数据库代码
}
```

**2. API请求：**
```javascript
app.post('/api/register', async (req, res) => {
    console.log('📥 [API] 注册请求:', req.body);
    // ... 处理代码
});
```

**3. 网络请求：**
```javascript
async function fetchSchedule(cookies) {
    console.log('🌐 [HTTP] 开始获取课表');
    // ... 请求代码
    console.log('✅ [HTTP] 课表获取成功');
}
```

---

## 🔍 常见问题快速诊断

### ❌ 问题1: 服务器启动失败

**检查：**
```bash
# 端口是否被占用
lsof -i :3000
# 或
netstat -an | grep 3000
```

**解决：**
```bash
# 杀死占用进程
kill -9 <PID>

# 或修改端口
PORT=3001 npm start
```

---

### ❌ 问题2: Cookie验证失败

**调试步骤：**

1. **检查Cookie格式**
```javascript
// 在 fetchSchedule 函数开头添加
console.log('🍪 Cookie内容:', cookies);
```

2. **检查网络请求**
```bash
# 使用脚本测试
node scripts/check-cookie.js 你的TGC
```

3. **查看响应内容**
```javascript
// 在获取课表后添加
console.log('📄 响应状态:', resp.status);
console.log('📄 响应长度:', resp.data.length);

// 保存到文件查看
const fs = require('fs');
fs.writeFileSync('debug_response.html', resp.data);
```

---

### ❌ 问题3: 课表解析失败

**调试步骤：**

1. **保存HTML**
```javascript
// 在 parseSchedule 函数开头
const fs = require('fs');
fs.writeFileSync('debug_schedule.html', html);
console.log('💾 HTML已保存');
```

2. **检查表格结构**
```javascript
const $ = cheerio.load(html);
const table = $('table.Nsb_r_list.Nsb_table');
console.log('📊 找到表格数:', table.length);
```

3. **使用测试脚本**
```bash
node scripts/parse-test.js debug_schedule.html
```

---

### ❌ 问题4: 数据库错误

**检查数据库：**
```bash
# 查看所有用户
sqlite3 schedule_server.db "SELECT * FROM users;"

# 检查特定用户
sqlite3 schedule_server.db "SELECT * FROM users WHERE token LIKE 'abc%';"

# 查看表结构
sqlite3 schedule_server.db ".schema users"
```

**清空数据库：**
```bash
node scripts/reset-db.js
```

---

## 🎨 推荐的调试工作流

### 工作流1: 新功能开发
```
1. 编写代码
2. 设置断点
3. F5 启动调试
4. 测试功能
5. 查看变量和调用栈
6. 修改代码（nodemon自动重启）
```

### 工作流2: Bug修复
```
1. 复现问题
2. 添加日志定位问题
3. 在可疑位置设置断点
4. 单步执行查看变量
5. 修复并验证
```

### 工作流3: API测试
```
1. npm run dev 启动服务
2. node scripts/test-api.js 运行测试
3. 查看控制台输出
4. 检查生成的文件（debug_schedule.ics等）
```

---

## 🛠️ 有用的命令行工具

### 查看日志（实时）
```bash
# 启动服务并实时查看日志
npm start | tee server.log

# 查看最后100行日志
tail -100 server.log

# 实时跟踪日志
tail -f server.log
```

### 查找代码
```bash
# 查找所有TODO
grep -r "TODO" .

# 查找某个函数
grep -r "function fetchSchedule" .
```

### 性能分析
```bash
# 启用性能分析
node --prof server.js

# 处理后生成可读报告
node --prof-process isolate-*.log > profile.txt
```

---

## 📚 更多资源

- **详细调试指南**: 查看 `DEBUG.md`
- **API文档**: 查看 `README.md`
- **示例代码**: 查看 `scripts/` 目录

---

## 💡 调试小技巧

1. **使用有意义的变量名** - 方便断点查看
2. **分步骤测试** - 不要一次写太多代码
3. **保留测试数据** - 方便复现问题
4. **使用版本控制** - 随时回退代码
5. **记录问题和解决方案** - 建立知识库

---

## 🆘 需要帮助？

1. 查看错误日志
2. 检查 `DEBUG.md` 详细指南
3. 运行测试脚本诊断
4. 提交 Issue 并附上日志

---

**快速开始调试，祝你好运！** 🚀