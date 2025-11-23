**文件说明**：调试与排错指南，帮助开发者解决常见问题。

# 🐞 调试与排错指南

## 常见报错处理
### 1. `ReferenceError: fetch is not defined`
- **原因**: Node.js 版本过低。
- **解决**: 本项目依赖 Node.js 18+ 的原生 Fetch API。请升级 Node.js：
  ```bash
  node -v # 检查版本
  ```
### 2. 二维码无法生成 / 500 错误
- **原因: 无法连接到 `sso.jxpu.edu.cn` 或 SESSION 获取失败。**
- **调试:**
    - 修改 `src/auth.js`，在 `generateQRCode` 函数中查看 `console.log` 输出。
    - 系统会自动重试 3 次获取 SESSION，如果都失败，可能是学校服务器通过 IP 限制了请求，或网络不通。

### 3. 扫码后提示 "Cookie 无效" 或 401
- **原因: 登录流程中的 Cookie 传递链断裂，或者学校 CAS 系统更新了 Ticket 机制。**
- **解决:**
    - 检查 `auth.js` 中 `loginWithStateKey` 返回的 `cookies` 是否包含 `TGC`。
    - 检查 `fetchSchedule` 中的 SSO 重定向逻辑是否正确处理了 Location 头。

## 数据库调试
### 项目使用 SQLite3 (`schedule_server.db`)。你可以使用命令行工具查看数据状态：
    ```bash
    # 进入 sqlite 命令行
    sqlite3 schedule_server.db

    # 查看所有用户状态
    sqlite> SELECT id, username, cookie_valid, last_sync FROM users;

    # 查看特定 Token 的 Cookie
    sqlite> SELECT cookies FROM users WHERE token = '你的Token';

    # 退出
    sqlite> .quit
    ```

## 日志分析
### 项目代码中已预埋关键节点的 Log：
- `📄 [QR]` - 二维码相关日志
- `👤 [User]` - 用户信息日志
- `🍪 [Cookie]` - Cookie 状态日志
- `🗑️ [Delete]` - 删除操作日志
### 启动时建议使用开发模式以查看详细输出：
```bash
npm run dev
```