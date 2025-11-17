// ============= router.js - Hono 路由 =============
const { Hono } = require('hono');
const crypto = require('crypto');

const auth = require('../auth');
const parser = require('../parser');
const icalGenerator = require('../icaal');
const db = require('../db');

const router = new Hono();

// ============= API 路由 =============

/**
 * 生成二维码
 */
router.get('/api/qr/generate', async (c) => {
    try {
        const result = await auth.generateQRCode();
        
        if (result.success) {
            return c.json({
                success: true,
                qrCodeId: result.qrCodeId,
                cookies: result.cookies, // 返回完整的 cookies（包含 SESSION）
                imageData: result.imageBuffer.toString('base64')
            });
        } else {
            return c.json({ 
                success: false, 
                error: result.error 
            }, 500);
        }
    } catch (error) {
        console.error('生成二维码失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
    }
});

/**
 * 轮询二维码状态
 */
router.post('/api/qr/status', async (c) => {
    try {
        const { qrCodeId, cookies } = await c.req.json();
        
        if (!qrCodeId) {
            return c.json({ 
                success: false, 
                error: '缺少 qrCodeId' 
            });
        }
        
        if (!cookies || !cookies.SESSION) {
            return c.json({ 
                success: false, 
                error: '缺少有效的 cookies' 
            });
        }
        
        const result = await auth.pollQRCodeStatus(qrCodeId, cookies);
        
        // 处理过期情况
        if (result.expired) {
            return c.json({
                code: 1,
                message: 'expired',
                success: false
            });
        }
        
        return c.json(result);
        
    } catch (error) {
        console.error('轮询状态失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * 完成登录
 */
router.post('/api/qr/login', async (c) => {
    try {
        const { stateKey, semester_start = '2025-09-08', cookies } = await c.req.json();
        
        if (!stateKey) {
            return c.json({ 
                success: false, 
                error: '缺少 stateKey' 
            });
        }
        
        if (!cookies || !cookies.SESSION) {
            return c.json({ 
                success: false, 
                error: '缺少 SESSION Cookie' 
            });
        }
        
        // 生成指纹ID
        const fpVisitorId = auth.generateFingerprintId();
        
        console.log('🔑 开始登录流程...');
        
        // 使用 stateKey 和 SESSION 登录获取 TGC Cookie
        const loginResult = await auth.loginWithStateKey(stateKey, fpVisitorId, cookies);
        
        if (!loginResult.success) {
            return c.json({ 
                success: false, 
                error: loginResult.error 
            });
        }
        
        console.log('📚 验证 Cookie 并获取课表...');
        
        // 验证 Cookie 有效性（获取课表）
        const scheduleResult = await auth.fetchSchedule(loginResult.cookies);
        
        if (!scheduleResult.success) {
            return c.json({ 
                success: false, 
                error: 'Cookie 验证失败: ' + scheduleResult.error 
            });
        }
        
        // 生成 token
        const token = crypto.randomBytes(32).toString('base64url');
        
        console.log('💾 保存用户信息...');
        
        // 保存用户信息
        await db.saveUser(token, loginResult.cookies, semester_start);
        
        console.log('✅ 登录成功!');
        
        return c.json({ 
            success: true, 
            // cookies:loginResult.cookies,
            token 
        });
        
    } catch (error) {
        console.error('登录失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * 课表订阅路由（ICS格式）
 */
router.get('/schedule/:token', async (c) => {
    const { token } = c.req.param();
    
    try {
        const user = await db.getUser(token);
        
        if (!user) {
            return c.text('❌ 无效的订阅Token', 404);
        }
        
        if (!user.cookieValid) {
            return c.text('❌ Cookie已过期，请重新扫码登录', 401);
        }
        
        console.log(`📅 获取课表: ${token.substring(0, 16)}...`);
        
        const result = await auth.fetchSchedule(user.cookies);
        
        if (!result.success) {
            await db.markCookieInvalid(token);
            return c.text('❌ Cookie已过期，请重新扫码登录', 401);
        }
        
        const courses = parser.parseSchedule(result.html, user.semesterStart);
        
        if (!courses.length) {
            return c.text('❌ 未找到课程信息', 404);
        }
        
        const icsData = icalGenerator.generateICS(courses);
        await db.updateLastSync(token);
        
        console.log(`✅ 成功生成课表: ${courses.length} 门课程`);
        
        // 设置响应头
        c.header('Content-Type', 'text/calendar; charset=utf-8');
        c.header('Content-Disposition', 'attachment; filename=schedule.ics');
        c.header('Cache-Control', 'no-cache, must-revalidate');
        
        return c.text(icsData);
        
    } catch (error) {
        console.error('获取课表失败:', error);
        return c.text(`❌ 服务器错误: ${error.message}`, 500);
    }
});

/**
 * 统计接口
 */
router.get('/api/stats', async (c) => {
    try {
        const sqlite3 = require('sqlite3').verbose();
        const dbInstance = new sqlite3.Database('schedule_server.db');
        
        const getCount = (query) => {
            return new Promise((resolve, reject) => {
                dbInstance.get(query, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        };
        
        const [totalResult, activeResult, validResult] = await Promise.all([
            getCount('SELECT COUNT(*) as total FROM users'),
            getCount('SELECT COUNT(*) as active FROM users WHERE last_sync IS NOT NULL'),
            getCount('SELECT COUNT(*) as valid FROM users WHERE cookie_valid = 1')
        ]);
        
        dbInstance.close();
        
        return c.json({
            total_users: totalResult.total,
            active_users: activeResult.active,
            valid_cookies: validResult.valid
        });
        
    } catch (error) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * 首页
 */
router.get('/', (c) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>课表订阅服务 - 二维码登录</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
                max-width: 800px; 
                margin: 0 auto; 
                padding: 20px;
                line-height: 1.6;
                background: #f5f5f5;
            }
            .container {
                background: white;
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
            .subtitle { color: #666; margin-bottom: 30px; }
            .qr-container {
                text-align: center;
                padding: 30px;
                background: #f6f8fa;
                border-radius: 8px;
                margin: 20px 0;
            }
            .qr-image {
                max-width: 300px;
                margin: 20px auto;
                background: white;
                padding: 20px;
                border-radius: 8px;
            }
            .status {
                margin: 15px 0;
                font-size: 18px;
                font-weight: 600;
            }
            .status.waiting { color: #666; }
            .status.scanned { color: #0366d6; }
            .status.success { color: #28a745; }
            .status.error { color: #d73a49; }
            .status.expired { color: #e36209; }
            .form-group { margin: 20px 0; }
            label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
            input { 
                width: 100%; 
                padding: 12px; 
                border: 2px solid #e1e4e8;
                border-radius: 6px;
                font-size: 14px;
            }
            button { 
                background: #0366d6;
                color: white; 
                padding: 12px 24px; 
                border: none; 
                border-radius: 6px; 
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                width: 100%;
            }
            button:hover { background: #0256c7; }
            button:disabled { background: #ccc; cursor: not-allowed; }
            .result { 
                margin-top: 20px; 
                padding: 15px; 
                background: #f6f8fa;
                border-radius: 6px;
                border-left: 4px solid #0366d6;
            }
            .result.success { color: #28a745; background: #dcffe4; border-left-color: #28a745; }
            .result.error { color: #d73a49; background: #ffeef0; border-left-color: #d73a49; }
            code { 
                background: #f6f8fa;
                padding: 3px 6px; 
                border-radius: 3px;
                font-family: 'Courier New', monospace;
                font-size: 14px;
                word-break: break-all;
            }
            .btn-copy {
                background: #28a745;
                margin-top: 10px;
                padding: 8px 16px;
                font-size: 14px;
                width: auto;
            }
            .timer {
                font-size: 14px;
                color: #666;
                margin-top: 10px;
            }
            .log {
                font-size: 12px;
                color: #888;
                margin-top: 5px;
                font-family: monospace;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📅 课表订阅服务</h1>
            <p class="subtitle">使用二维码扫码登录 (Fetch API + Hono)</p>
            
            <div class="qr-container" id="qrContainer">
                <div class="status waiting" id="status">点击下方按钮生成二维码</div>
                <div id="qrImage"></div>
                <div class="timer" id="timer"></div>
                <div class="log" id="log"></div>
                <button onclick="generateQR()" id="genBtn">生成二维码</button>
            </div>
            
            <div class="form-group" id="semesterGroup" style="display:none;">
                <label>学期开始日期 (第一周周一):</label>
                <input type="date" id="semester_start" value="2025-09-08">
            </div>
            
            <div id="result" style="display:none;"></div>
        </div>
        
        <script>
        let pollInterval = null;
        let currentQrCodeId = null;
        let currentCookies = null;
        let currentStateKey = null;
        let expiryTime = null;
        let timerInterval = null;
        
        function log(msg) {
            const logEl = document.getElementById('log');
            logEl.textContent = msg;
            console.log(msg);
        }
        
        function updateTimer() {
            if (!expiryTime) return;
            
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((expiryTime - now) / 1000));
            
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            
            const timerEl = document.getElementById('timer');
            if (remaining > 0) {
                timerEl.textContent = \`⏱️ 有效期: \${minutes}:\${seconds.toString().padStart(2, '0')}\`;
            } else {
                timerEl.textContent = '⏱️ 二维码已过期';
                timerEl.style.color = '#d73a49';
                if (pollInterval) clearInterval(pollInterval);
            }
        }
        
        async function generateQR() {
            const btn = document.getElementById('genBtn');
            const status = document.getElementById('status');
            const qrImage = document.getElementById('qrImage');
            const timer = document.getElementById('timer');
            
            btn.disabled = true;
            btn.textContent = '生成中...';
            status.className = 'status waiting';
            status.textContent = '正在生成二维码...';
            qrImage.innerHTML = '';
            timer.textContent = '';
            log('');
            
            if (timerInterval) clearInterval(timerInterval);
            if (pollInterval) clearInterval(pollInterval);
            
            try {
                log('🔄 请求生成二维码 (最多重试3次获取SESSION)...');
                
                const response = await fetch('/api/qr/generate');
                const data = await response.json();
                
                if (data.success) {
                    currentQrCodeId = data.qrCodeId;
                    currentCookies = data.cookies;
                    
                    log(\`✅ 成功获取 SESSION: \${data.cookies.SESSION?.substring(0, 16) || 'N/A'}...\`);
                    
                    const imageData = 'data:image/png;base64,' + data.imageData;
                    qrImage.innerHTML = '<img src="' + imageData + '" style="width: 100%; max-width: 250px;">';
                    status.textContent = '请使用手机扫码登录';
                    document.getElementById('semesterGroup').style.display = 'block';
                    
                    expiryTime = Date.now() + 5 * 60 * 1000;
                    timerInterval = setInterval(updateTimer, 1000);
                    updateTimer();
                    
                    startPolling();
                } else {
                    status.className = 'status error';
                    status.textContent = '生成失败: ' + data.error;
                    log('❌ ' + data.error);
                    btn.disabled = false;
                    btn.textContent = '重新生成';
                }
            } catch (error) {
                status.className = 'status error';
                status.textContent = '网络错误: ' + error.message;
                log('❌ ' + error.message);
                btn.disabled = false;
                btn.textContent = '重新生成';
            }
        }
        
        async function startPolling() {
            if (pollInterval) clearInterval(pollInterval);
            
            pollInterval = setInterval(async () => {
                try {
                    const response = await fetch('/api/qr/status', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ 
                            qrCodeId: currentQrCodeId,
                            cookies: currentCookies
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.code === 1 && data.message === 'expired') {
                        const status = document.getElementById('status');
                        status.className = 'status expired';
                        status.textContent = '⏱️ 二维码已过期，请重新生成';
                        
                        clearInterval(pollInterval);
                        if (timerInterval) clearInterval(timerInterval);
                        
                        document.getElementById('genBtn').disabled = false;
                        document.getElementById('genBtn').textContent = '重新生成二维码';
                        return;
                    }
                    
                    if (data.success) {
                        const status = document.getElementById('status');
                        
                        if (data.status === '0') {
                            status.className = 'status waiting';
                            status.textContent = '等待扫码...';
                        } else if (data.status === '2') {
                            status.className = 'status scanned';
                            status.textContent = '✅ 已扫码，请在手机上确认登录';
                            log('📱 检测到扫码');
                        } else if (data.status === '3') {
                            status.className = 'status success';
                            status.textContent = '✅ 确认成功，正在登录...';
                            log('🔑 用户已确认，开始登录');
                            
                            clearInterval(pollInterval);
                            if (timerInterval) clearInterval(timerInterval);
                            currentStateKey = data.stateKey;
                            await completeLogin();
                        }
                    }
                } catch (error) {
                    console.error('轮询失败:', error);
                }
            }, 2000);
        }
        
        async function completeLogin() {
            const semester_start = document.getElementById('semester_start').value;
            const result = document.getElementById('result');
            const status = document.getElementById('status');
            
            status.textContent = '正在获取课表...';
            log('📚 验证Cookie并获取课表...');
            
            try {
                const response = await fetch('/api/qr/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        stateKey: currentStateKey,
                        semester_start: semester_start,
                        cookies: currentCookies
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const url = window.location.origin + '/schedule/' + data.token;
                    status.className = 'status success';
                    status.textContent = '✅ 登录成功！';
                    log('🎉 订阅链接生成成功');
                    
                    result.className = 'result success';
                    result.innerHTML = \`
                        <h3 style="margin-bottom: 10px;">🎉 订阅链接生成成功！</h3>
                        <p style="margin: 10px 0;"><strong>订阅链接：</strong></p>
                        <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all;">
                            <code>\${url}</code>
                        </p>
                        <button class="btn-copy" onclick="copyToClipboard('\${url}')">📋 复制链接</button>
                        <p style="margin-top: 15px; color: #666; font-size: 14px;">
                            💡 将此链接添加到日历应用即可订阅课表
                        </p>
                    \`;
                    result.style.display = 'block';
                } else {
                    status.className = 'status error';
                    status.textContent = '❌ 登录失败';
                    result.className = 'result error';
                    result.innerHTML = '<strong>错误:</strong> ' + data.error;
                    result.style.display = 'block';
                    log('❌ ' + data.error);
                    
                    document.getElementById('genBtn').disabled = false;
                    document.getElementById('genBtn').textContent = '重新生成二维码';
                }
            } catch (error) {
                status.className = 'status error';
                status.textContent = '❌ 网络错误';
                result.className = 'result error';
                result.innerHTML = '<strong>错误:</strong> ' + error.message;
                result.style.display = 'block';
                log('❌ ' + error.message);
                
                document.getElementById('genBtn').disabled = false;
                document.getElementById('genBtn').textContent = '重新生成二维码';
            }
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('✅ 已复制到剪贴板！');
            }).catch(() => {
                alert('❌ 复制失败，请手动复制');
            });
        }
        
        window.addEventListener('beforeunload', () => {
            if (pollInterval) clearInterval(pollInterval);
            if (timerInterval) clearInterval(timerInterval);
        });
        </script>
    </body>
    </html>
    `;
    
    return c.html(html);
});

module.exports = router;    