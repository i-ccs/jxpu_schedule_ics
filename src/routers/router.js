// ============= router.js - Hono 路由 (完全优化版) =============
const { Hono } = require('hono');
const crypto = require('crypto');
const { setCookie } = require('hono/cookie');

const auth = require('../auth');
const parser = require('../parser');
const icalGenerator = require('../icaal');
const db = require('../db');

const router = new Hono();

// ============= 会话管理 =============

/**
 * 临时会话存储（内存中）
 * 结构: { sessionId: { cookies, userId, username, timestamp } }
 */
const sessionStorage = new Map();

/**
 * 定时清理过期会话（每10分钟执行一次）
 * 超过2小时的会话将被清理
 */
setInterval(() => {
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    
    for (const [sessionId, session] of sessionStorage.entries()) {
        if (now - session.timestamp > twoHours) {
            console.log(`🧹 清理过期会话: ${sessionId.substring(0, 8)}...`);
            sessionStorage.delete(sessionId);
        }
    }
}, 10 * 60 * 1000);

/**
 * 生成唯一会话ID
 */
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * 保存会话
 */
function saveSession(sessionId, data) {
    sessionStorage.set(sessionId, {
        ...data,
        timestamp: Date.now()
    });
}

/**
 * 获取会话
 */
function getSession(sessionId) {
    return sessionStorage.get(sessionId);
}

/**
 * 删除会话
 */
function deleteSession(sessionId) {
    sessionStorage.delete(sessionId);
}

/**
 * 更新会话时间戳（用于保活）
 */
function touchSession(sessionId) {
    const session = sessionStorage.get(sessionId);
    if (session) {
        session.timestamp = Date.now();
    }
}

// ============= API 路由 =============

/**
 * 生成二维码（使用 Set-Cookie 传递会话ID）
 */
router.get('/api/qr/generate', async (c) => {
    try {
        const result = await auth.generateQRCode();
        
        if (result.success) {
            // 生成新的会话ID（每次生成二维码都创建新会话，实现隔离）
            const sessionId = generateSessionId();
            
            // 保存会话到服务器
            saveSession(sessionId, {
                cookies: result.cookies,
                qrCodeId: result.qrCodeId
            });
            
            console.log(`🔑 创建新会话: ${sessionId.substring(0, 8)}...`);
            
            // 通过 Set-Cookie 返回会话ID（HttpOnly 防止 XSS）
            setCookie(c, 'session_id', sessionId, {
                httpOnly: true,
                secure: false, // 生产环境改为 true（需要 HTTPS）
                sameSite: 'Lax',
                maxAge: 2 * 60 * 60, // 2小时
                path: '/'
            });
            
            return c.json({
                success: true,
                qrCodeId: result.qrCodeId,
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
 * 删除用户账号和订阅
 */
router.delete('/api/user/:token', async (c) => {
    const { token } = c.req.param();
    
    try {
        const user = await db.getUser(token);
        
        if (!user) {
            return c.json({ 
                success: false, 
                error: '用户不存在或已删除' 
            }, 404);
        }
        
        console.log(`🗑️  删除用户: ${user.username || user.userId || 'Unknown'} (token: ${token.substring(0, 16)}...)`);
        
        // 从数据库中删除用户
        await db.deleteUser(token);
        
        console.log('✅ 用户已删除');
        
        return c.json({ 
            success: true,
            message: '账号已删除，订阅链接已失效'
        });
        
    } catch (error) {
        console.error('删除用户失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
    }
});

/**
 * 保活接口（前端定期调用以保持会话活跃）
 */
router.post('/api/keepalive', async (c) => {
    try {
        // 从 Cookie 中获取会话ID
        const sessionId = c.req.header('cookie')?.match(/session_id=([^;]+)/)?.[1];
        
        if (!sessionId) {
            return c.json({ 
                success: false, 
                error: '会话不存在' 
            });
        }
        
        const session = getSession(sessionId);
        
        if (!session) {
            return c.json({ 
                success: false, 
                error: '会话已过期' 
            });
        }
        
        // 更新会话时间戳
        touchSession(sessionId);
        
        return c.json({ 
            success: true,
            message: '会话已刷新',
            expiresAt: session.timestamp + (2 * 60 * 60 * 1000) // 返回过期时间
        });
        
    } catch (error) {
        console.error('保活失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * 直接下载课表 ICS 文件
 */
router.get('/api/download/:token', async (c) => {
    const { token } = c.req.param();
    
    try {
        const user = await db.getUser(token);
        
        if (!user) {
            return c.text('❌ 无效的订阅Token', 404);
        }
        
        if (!user.cookieValid) {
            return c.text('❌ Cookie已过期，请重新扫码登录', 401);
        }
        
        console.log(`📥 下载课表: ${token.substring(0, 16)}...`);
        
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
        
        console.log(`✅ 生成课表文件: ${courses.length} 门课程`);
        
        // 设置下载响应头
        c.header('Content-Type', 'text/calendar; charset=utf-8');
        c.header('Content-Disposition', 'attachment; filename=my-schedule.ics');
        
        return c.text(icsData);
        
    } catch (error) {
        console.error('下载课表失败:', error);
        return c.text(`❌ 服务器错误: ${error.message}`, 500);
    }
});

/**
 * 轮询二维码状态（从 Cookie 获取会话ID）
 */
router.post('/api/qr/status', async (c) => {
    try {
        const { qrCodeId } = await c.req.json();
        
        if (!qrCodeId) {
            return c.json({ 
                success: false, 
                error: '缺少 qrCodeId' 
            });
        }
        
        // 从 Cookie 中获取会话ID
        const sessionId = c.req.header('cookie')?.match(/session_id=([^;]+)/)?.[1];
        
        if (!sessionId) {
            return c.json({ 
                success: false, 
                error: '会话已过期，请重新生成二维码' 
            });
        }
        
        // 从服务器获取会话
        const session = getSession(sessionId);
        
        if (!session || !session.cookies || !session.cookies.SESSION) {
            return c.json({ 
                success: false, 
                error: '会话已过期，请重新生成二维码' 
            });
        }
        
        // 保活：更新会话时间戳
        touchSession(sessionId);
        
        const result = await auth.pollQRCodeStatus(qrCodeId, session.cookies);
        
        // 处理过期情况
        if (result.expired) {
            deleteSession(sessionId);
            return c.json({
                code: 1,
                message: 'expired',
                success: false
            });
        }
        
        // 如果用户已确认，保存用户信息到会话
        if (result.status === '3' && result.userId) {
            session.userId = result.userId;
            session.username = result.username;
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
 * 完成登录（从 Cookie 和会话获取所需信息）
 */
router.post('/api/qr/login', async (c) => {
    try {
        const { qrCodeId, stateKey, semester_start = '2025-09-08' } = await c.req.json();
        
        if (!qrCodeId || !stateKey) {
            return c.json({ 
                success: false, 
                error: '缺少必要参数' 
            });
        }
        
        // 从 Cookie 中获取会话ID
        const sessionId = c.req.header('cookie')?.match(/session_id=([^;]+)/)?.[1];
        
        if (!sessionId) {
            return c.json({ 
                success: false, 
                error: '会话已过期，请重新生成二维码' 
            });
        }
        
        // 从服务器获取会话
        const session = getSession(sessionId);
        
        if (!session || !session.cookies || !session.cookies.SESSION) {
            return c.json({ 
                success: false, 
                error: '会话已过期，请重新生成二维码' 
            });
        }
        
        const cookies = session.cookies;
        const userId = session.userId;
        const username = session.username;
        
        console.log(`👤 用户信息: ID=${userId || 'N/A'}, 用户名=${username || 'N/A'}`);
        
        // 🆕 检查用户是否已存在
        let existingUser = null;
        
        if (userId) {
            console.log(`🔍 检查用户ID是否已存在: ${userId}`);
            existingUser = await db.findUserByUserId(userId);
        }
        
        if (!existingUser && username) {
            console.log(`🔍 检查用户名是否已存在: ${username}`);
            existingUser = await db.findUserByUsername(username);
        }
        
        // 如果用户已存在且 Cookie 有效，更新 Cookie 并返回原链接
        if (existingUser && existingUser.cookie_valid) {
            console.log(`✅ 用户已存在，更新 Cookie 后返回原订阅链接`);
            
            // 🔄 更新数据库中的 Cookie（保持登录状态最新）
            const fpVisitorId = auth.generateFingerprintId();
            const loginResult = await auth.loginWithStateKey(stateKey, fpVisitorId, cookies);
            
            if (loginResult.success) {
                // 更新数据库中的 Cookie
                await db.saveUser(
                    existingUser.token, 
                    loginResult.cookies, 
                    existingUser.semester_start || semester_start,
                    userId,
                    username
                );
                console.log('✅ Cookie 已更新为最新状态');
            }
            
            deleteSession(sessionId); // 清理会话
            
            return c.json({ 
                success: true, 
                token: existingUser.token,
                existing: true,
                message: '检测到您已有订阅链接，Cookie 已更新'
            });
        }
        
        // 用户不存在或 Cookie 已失效，继续登录流程
        const fpVisitorId = auth.generateFingerprintId();
        
        console.log('🔑 开始登录流程...');
        
        const loginResult = await auth.loginWithStateKey(stateKey, fpVisitorId, cookies);
        
        if (!loginResult.success) {
            return c.json({ 
                success: false, 
                error: loginResult.error 
            });
        }
        
        console.log('📚 验证 Cookie 并获取课表...');
        
        const scheduleResult = await auth.fetchSchedule(loginResult.cookies);
        
        if (!scheduleResult.success) {
            return c.json({ 
                success: false, 
                error: 'Cookie 验证失败: ' + scheduleResult.error 
            });
        }
        
        // 生成新 token
        const token = crypto.randomBytes(32).toString('base64url');
        
        console.log('💾 保存用户信息...');
        
        // 保存用户信息（包含 userId 和 username）
        await db.saveUser(token, loginResult.cookies, semester_start, userId, username);
        
        // 清理会话
        deleteSession(sessionId);
        
        console.log('✅ 登录成功!');
        
        return c.json({ 
            success: true, 
            token,
            existing: false
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
        
        console.log(`📅 获取课表: ${token.substring(0, 16)}... (用户: ${user.username || user.userId || 'Unknown'})`);
        
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
 * 首页（优化：支持已存在用户提示）
 */
router.get('/login', async (c) => {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
        const htmlPath = path.join(__dirname, '../../public/login.html');
        const html = await fs.readFile(htmlPath, 'utf-8');
        return c.html(html);
    } catch (error) {
        console.error('读取 login.html 失败:', error);
        return c.text('页面加载失败，请检查 public/login.html 文件是否存在', 500);
    }
});
module.exports = router;