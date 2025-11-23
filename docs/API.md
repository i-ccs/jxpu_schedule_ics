# API 文档

完整的 API 接口说明文档

---

## 目录

1. [认证相关](#认证相关)
2. [课表相关](#课表相关)
3. [用户管理](#用户管理)
4. [缓存管理](#缓存管理)
5. [系统监控](#系统监控)

---

## 认证相关

### 1. 生成二维码

**接口**: `GET /api/qr/generate`

**描述**: 生成登录二维码并创建会话

**请求参数**: 无

**响应示例**:

```json
{
  "success": true,
  "qrCodeId": "173226240012345",
  "imageData": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否成功 |
| qrCodeId | string | 二维码唯一标识 |
| imageData | string | Base64 编码的 PNG 图片 |

**Cookie 设置**:
- `session_id`: 会话ID (HttpOnly, 有效期2小时)

**错误响应**:

```json
{
  "success": false,
  "error": "获取 SESSION Cookie 失败"
}
```

---

### 2. 轮询二维码状态

**接口**: `POST /api/qr/status`

**描述**: 轮询二维码扫码状态

**请求头**:
```
Cookie: session_id=xxx
Content-Type: application/json
```

**请求体**:

```json
{
  "qrCodeId": "173226240012345"
}
```

**响应示例 (等待中)**:

```json
{
  "success": true,
  "status": "0",
  "expired": false
}
```

**响应示例 (已扫码)**:

```json
{
  "success": true,
  "status": "2",
  "expired": false
}
```

**响应示例 (已确认)**:

```json
{
  "success": true,
  "status": "3",
  "stateKey": "xxxxx",
  "userId": "20231001",
  "username": "张三",
  "expired": false
}
```

**响应示例 (已过期)**:

```json
{
  "code": 1,
  "message": "expired",
  "success": false
}
```

**状态码说明**:

| status | 说明 |
|--------|------|
| 0 | 等待扫码 |
| 2 | 已扫码,等待确认 |
| 3 | 已确认登录 |
| 4 | 已取消 |

---

### 3. 完成登录

**接口**: `POST /api/qr/login`

**描述**: 使用 stateKey 完成登录并生成订阅链接

**请求头**:
```
Cookie: session_id=xxx
Content-Type: application/json
```

**请求体**:

```json
{
  "qrCodeId": "173226240012345",
  "stateKey": "xxxxx",
  "semester_start": "2025-09-08"
}
```

**请求字段**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| qrCodeId | string | 是 | 二维码ID |
| stateKey | string | 是 | 状态密钥 |
| semester_start | string | 否 | 学期开始日期 (YYYY-MM-DD) |

**响应示例 (新用户)**:

```json
{
  "success": true,
  "token": "订阅token字符串",
  "existing": false
}
```

**响应示例 (已存在用户)**:

```json
{
  "success": true,
  "token": "原订阅token",
  "existing": true,
  "message": "检测到您已有订阅链接,Cookie 已更新"
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "Cookie 验证失败: Cookie已过期"
}
```

---

### 4. 会话保活

**接口**: `POST /api/keepalive`

**描述**: 刷新会话,防止过期

**请求头**:
```
Cookie: session_id=xxx
```

**请求参数**: 无

**响应示例**:

```json
{
  "success": true,
  "message": "会话已刷新",
  "expiresAt": 1732270800000
}
```

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否成功 |
| message | string | 响应消息 |
| expiresAt | number | 会话过期时间戳 (毫秒) |

**建议**:
- 前端每60秒调用一次
- 在用户扫码过程中保持会话活跃

---

## 课表相关

### 5. 课表订阅

**接口**: `GET /schedule/:token`

**描述**: 获取 ICS 格式的课表文件 (支持 CDN 缓存)

**请求参数**:

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| token | path | string | 订阅 token |

**请求示例**:
```
GET /schedule/AbCdEf123456789...
```

**响应头**:
```
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename=schedule.ics
Cache-Control: public, max-age=3600, s-maxage=43200
ETag: "1732262400000"
Last-Modified: Fri, 22 Nov 2024 13:00:00 GMT
X-Cache-Status: HIT
X-Next-Update: 2024-11-22T21:00:00.000Z
```

**响应体**:
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//江西职业技术大学//课表订阅//CN
...
END:VCALENDAR
```

**缓存机制**:
- 浏览器缓存: 1小时
- CDN 缓存: 12小时
- 自动更新: 每天 5:00、13:00、21:00

**错误响应**:
```
❌ 无效的订阅Token
```
```
❌ Cookie已过期，请重新扫码登录
```

---

### 6. 下载课表

**接口**: `GET /api/download/:token`

**描述**: 直接下载 ICS 文件 (支持缓存)

**请求参数**:

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| token | path | string | 订阅 token |

**请求示例**:
```
GET /api/download/AbCdEf123456789...
```

**响应头**:
```
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename=my-schedule.ics
```

**响应**: ICS 文件内容

**与订阅接口的区别**:
- 订阅接口用于日历应用自动同步
- 下载接口用于一次性下载导入

---

## 用户管理

### 7. 删除账号

**接口**: `DELETE /api/user/:token`

**描述**: 删除用户账号和订阅链接

**请求参数**:

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| token | path | string | 订阅 token |

**请求示例**:
```
DELETE /api/user/AbCdEf123456789...
```

**响应示例**:

```json
{
  "success": true,
  "message": "账号已删除,订阅链接已失效"
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "用户不存在或已删除"
}
```

**注意事项**:
- 此操作不可恢复
- 订阅链接将立即失效
- 缓存数据将被清理
- 数据库记录将被删除

---

## 缓存管理

### 8. 手动刷新缓存

**接口**: `POST /api/cache/refresh/:token`

**描述**: 手动刷新指定用户的课表缓存

**请求参数**:

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| token | path | string | 订阅 token |

**请求示例**:
```
POST /api/cache/refresh/AbCdEf123456789...
```

**响应示例**:

```json
{
  "success": true,
  "icsData": "BEGIN:VCALENDAR...",
  "courses": 15
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "Cookie已过期"
}
```

---

### 9. 缓存统计

**接口**: `GET /api/cache/stats`

**描述**: 获取缓存系统的统计信息

**请求参数**: 无

**响应示例**:

```json
{
  "success": true,
  "totalUsers": 100,
  "totalSize": "256.50 KB",
  "nextUpdate": 1732270800000,
  "updateHours": [5, 13, 21]
}
```

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| totalUsers | number | 缓存的用户总数 |
| totalSize | string | 缓存总大小 |
| nextUpdate | number | 下次更新时间戳 |
| updateHours | array | 每天的更新时间点 |

---

### 10. 清理所有缓存

**接口**: `POST /api/cache/clear`

**描述**: 清理所有用户的缓存 (需要管理员密码)

**请求头**:
```
Content-Type: application/json
```

**请求体**:

```json
{
  "password": "管理员密码"
}
```

**响应示例**:

```json
{
  "success": true,
  "message": "所有缓存已清理"
}
```

**错误响应**:

```json
{
  "success": false,
  "error": "密码错误"
}
```

**注意事项**:
- 需要提供 `.env` 文件中设置的 `ADMIN_PASSWORD`
- 此操作会清理所有用户的缓存
- 下次访问时会自动重新生成缓存

---

## 系统监控

### 11. 统计接口

**接口**: `GET /api/stats`

**描述**: 获取系统统计信息

**请求参数**: 无

**响应示例**:

```json
{
  "total_users": 100,
  "active_users": 80,
  "valid_cookies": 75,
  "cache": {
    "totalUsers": 75,
    "totalSize": "256.50 KB",
    "nextUpdate": 1732270800000,
    "updateHours": [5, 13, 21]
  }
}
```

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| total_users | number | 总用户数 |
| active_users | number | 活跃用户数 (有同步记录) |
| valid_cookies | number | Cookie 有效的用户数 |
| cache | object | 缓存统计信息 |

---

### 12. 健康检查

**接口**: `GET /health`

**描述**: 服务健康检查接口

**请求参数**: 无

**响应示例**:

```json
{
  "status": "healthy",
  "timestamp": "2024-11-22T13:00:00.000Z",
  "uptime": 86400,
  "sessions": 5
}
```

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 服务状态 |
| timestamp | string | 当前时间 |
| uptime | number | 运行时长 (秒) |
| sessions | number | 当前会话数 |

---

## 错误码说明

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 401 | Cookie 已过期,需要重新登录 |
| 403 | 权限不足 (如管理员密码错误) |
| 404 | 资源不存在 (如用户不存在) |
| 500 | 服务器内部错误 |

### 业务错误码

| code | message | 说明 |
|------|---------|------|
| 1 | expired | 二维码已过期 |
| 0 | - | 操作成功 |

---

## 使用示例

### JavaScript/Fetch

```javascript
// 1. 生成二维码
const qrResponse = await fetch('/api/qr/generate');
const qrData = await qrResponse.json();

// 2. 轮询状态
const pollResponse = await fetch('/api/qr/status', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ qrCodeId: qrData.qrCodeId })
});
const statusData = await pollResponse.json();

// 3. 完成登录
if (statusData.status === '3') {
  const loginResponse = await fetch('/api/qr/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qrCodeId: qrData.qrCodeId,
      stateKey: statusData.stateKey,
      semester_start: '2025-09-08'
    })
  });
  const loginData = await loginResponse.json();
  console.log('订阅链接:', `/schedule/${loginData.token}`);
}
```

### cURL

```bash
# 生成二维码
curl -X GET http://localhost:3000/api/qr/generate

# 轮询状态
curl -X POST http://localhost:3000/api/qr/status \
  -H "Content-Type: application/json" \
  -d '{"qrCodeId":"173226240012345"}'

# 获取统计
curl -X GET http://localhost:3000/api/stats

# 清理缓存
curl -X POST http://localhost:3000/api/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"password":"your_password"}'
```

---

## 速率限制

目前系统**未实施**速率限制,建议在生产环境中添加:

- 二维码生成: 每IP每分钟最多10次
- 状态轮询: 每会话每秒最多1次
- API 调用: 每IP每分钟最多100次

可以使用中间件如 `express-rate-limit` 或在 Nginx 层面实现。

---

## 注意事项

1. **会话管理**: 所有需要会话的接口必须包含 `session_id` Cookie
2. **缓存机制**: 课表订阅接口支持 CDN 缓存,修改后需清理缓存
3. **错误处理**: 所有接口都应进行适当的错误处理
4. **安全性**: 生产环境必须启用 HTTPS
5. **管理员操作**: 需要管理员密码的接口应谨慎使用