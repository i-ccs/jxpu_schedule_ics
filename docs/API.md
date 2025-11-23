## API 文档

### 1. 生成二维码

**接口**: `GET /api/qr/generate`

**响应**:
```json
{
  "success": true,
  "qrCodeId": "173226240012345",
  "imageData": "base64_encoded_image_data"
}
```

**说明**:
- 生成新的会话 ID 并通过 Set-Cookie 返回
- imageData 为 Base64 编码的 PNG 图片

### 2. 轮询二维码状态

**接口**: `POST /api/qr/status`

**请求体**:
```json
{
  "qrCodeId": "173226240012345"
}
```

**响应** (等待中):
```json
{
  "success": true,
  "status": "0",
  "expired": false
}
```

**响应** (已扫码):
```json
{
  "success": true,
  "status": "2",
  "expired": false
}
```

**响应** (已确认):
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

**响应** (已过期):
```json
{
  "code": 1,
  "message": "expired",
  "success": false
}
```

### 3. 完成登录

**接口**: `POST /api/qr/login`

**请求体**:
```json
{
  "qrCodeId": "173226240012345",
  "stateKey": "xxxxx",
  "semester_start": "2025-09-08"
}
```

**响应** (新用户):
```json
{
  "success": true,
  "token": "订阅token",
  "existing": false
}
```

**响应** (已存在用户):
```json
{
  "success": true,
  "token": "原订阅token",
  "existing": true,
  "message": "检测到您已有订阅链接,Cookie 已更新"
}
```

### 4. 会话保活

**接口**: `POST /api/keepalive`

**响应**:
```json
{
  "success": true,
  "message": "会话已刷新",
  "expiresAt": 1732270800000
}
```

### 5. 课表订阅

**接口**: `GET /schedule/:token`

**响应**: ICS 格式的日历文件

**Headers**:
```
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename=schedule.ics
```

### 6. 下载课表

**接口**: `GET /api/download/:token`

**响应**: ICS 文件下载

### 7. 删除账号

**接口**: `DELETE /api/user/:token`

**响应**:
```json
{
  "success": true,
  "message": "账号已删除,订阅链接已失效"
}
```

### 8. 统计接口

**接口**: `GET /api/stats`

**响应**:
```json
{
  "total_users": 100,
  "active_users": 80,
  "valid_cookies": 75
}
```
