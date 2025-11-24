// ============= router.js - Hono 路由 (添加邮箱管理和保活接口) =============
const { Hono } = require('hono');
const crypto = require('crypto');
const { setCookie } = require('hono/cookie');

const { config } = require('../config');
const auth = require('../auth');
const parser = require('../parser');
const icalGenerator = require('../ical');
const db = require('../db');
const cacheManager = require('../cache-manager');
const keepalive = require('../keepalive'); // 🆕 Cookie保活模块
const mailer = require('../mailer'); // 🆕 邮件模块

const router = new Hono();

// ============= 会话管理 =============

const sessionStorage = new Map();

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

function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

function saveSession(sessionId, data) {
    sessionStorage.set(sessionId, {
        ...data,
        timestamp: Date.now()
    });
}

function getSession(sessionId) {
    return sessionStorage.get(sessionId);
}

function deleteSession(sessionId) {
    sessionStorage.delete(sessionId);
}

function touchSession(sessionId) {
    const session = sessionStorage.get(sessionId);
    if (session) {
        session.timestamp = Date.now();
    }
}

// ============= API 路由 =============

/**
 * 生成二维码
 */
router.get('/api/qr/generate', async (c) => {
    try {
        const result = await auth.generateQRCode();
        
        if (result.success) {
            const sessionId = generateSessionId();
            
            saveSession(sessionId, {
                cookies: result.cookies,
                qrCodeId: result.qrCodeId
            });
            
            console.log(`🔑 创建新会话: ${sessionId.substring(0, 8)}...`);
            
            setCookie(c, 'session_id', sessionId, {
                httpOnly: true,
                secure: false,
                sameSite: 'Lax',
                maxAge: 2 * 60 * 60,
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
 * 🆕 更新用户邮箱
 */
router.post('/api/user/:token/email', async (c) => {
    const { token } = c.req.param();
    
    try {
        const { email } = await c.req.json();
        
        if (!email) {
            return c.json({ 
                success: false, 
                error: '邮箱不能为空' 
            }, 400);
        }
        
        // 简单的邮箱格式验证
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return c.json({ 
                success: false, 
                error: '邮箱格式不正确' 
            }, 400);
        }
        
        const user = await db.getUser(token);
        
        if (!user) {
            return c.json({ 
                success: false, 
                error: '用户不存在' 
            }, 404);
        }
        
        console.log(`📧 更新邮箱: ${user.username || user.userId} -> ${email}`);
        
        await db.updateUserEmail(token, email);
        
        // 🆕 发送测试邮件（可选）
        if (config.smtp.user) {
            await mailer.sendTestEmail(email);
        }
        
        return c.json({ 
            success: true,
            message: '邮箱已更新',
            email
        });
        
    } catch (error) {
        console.error('更新邮箱失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
    }
});

/**
 * 🆕 获取用户信息（包含邮箱）
 */
router.get('/api/user/:token/info', async (c) => {
    const { token } = c.req.param();
    
    try {
        const user = await db.getUser(token);
        
        if (!user) {
            return c.json({ 
                success: false, 
                error: '用户不存在' 
            }, 404);
        }
        
        return c.json({
            success: true,
            user: {
                userId: user.userId,
                username: user.username,
                email: user.email,
                cookieValid: user.cookieValid === 1,
                lastKeepalive: user.lastKeepalive,
                semesterStart: user.semesterStart
            }
        });
        
    } catch (error) {
        console.error('获取用户信息失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
    }
});

/**
 * 🆕 手动触发单个用户Cookie保活
 */
router.post('/api/user/:token/keepalive', async (c) => {
    const { token } = c.req.param();
    
    try {
        console.log(`🔄 手动触发保活: ${token.substring(0, 16)}...`);
        
        const result = await keepalive.checkAndKeepaliveUser(token);
        
        if (result.success) {
            return c.json({
                success: true,
                message: 'Cookie保活成功',
                username: result.username,
                email: result.email
            });
        } else {
            return c.json({
                success: false,
                error: result.error,
                username: result.username,
                email: result.email
            }, 400);
        }
        
    } catch (error) {
        console.error('手动保活失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
    }
});

/**
 * 🆕 批量触发所有用户Cookie保活（需要管理员密码）
 */
router.post('/api/keepalive/check-all', async (c) => {
    try {
        const { password } = await c.req.json();
        
        if (password !== config.adminPassword) {
            return c.json({ 
                success: false, 
                error: '密码错误' 
            }, 403);
        }
        
        console.log('🔄 管理员触发批量保活检查...');
        
        const result = await keepalive.checkAllUsersCookies();
        
        return c.json({
            success: true,
            ...result
        });
        
    } catch (error) {
        console.error('批量保活失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
    }
});

/**
 * 删除用户账号和订阅（同时清理缓存）
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
        
        await cacheManager.clearUserCache(token);
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
 * 保活接口
 */
router.post('/api/keepalive', async (c) => {
    try {
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
        
        touchSession(sessionId);
        
        return c.json({ 
            success: true,
            message: '会话已刷新',
            expiresAt: session.timestamp + (2 * 60 * 60 * 1000)
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
 * 直接下载课表 ICS 文件（使用缓存）
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
        
        const result = await cacheManager.getCachedSchedule(token);
        
        if (!result.success) {
            if (result.error.includes('Cookie已过期')) {
                return c.text('❌ Cookie已过期，请重新扫码登录', 401);
            }
            return c.text(`❌ 生成课表失败: ${result.error}`, 500);
        }
        
        console.log(`✅ ${result.fromCache ? '使用缓存' : '重新生成'}`);
        
        c.header('Content-Type', 'text/calendar; charset=utf-8');
        c.header('Content-Disposition', 'attachment; filename=my-schedule.ics');
        
        return c.text(result.icsData);
        
    } catch (error) {
        console.error('下载课表失败:', error);
        return c.text(`❌ 服务器错误: ${error.message}`, 500);
    }
});

/**
 * 轮询二维码状态
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
        
        const sessionId = c.req.header('cookie')?.match(/session_id=([^;]+)/)?.[1];
        
        if (!sessionId) {
            return c.json({ 
                success: false, 
                error: '会话已过期，请重新生成二维码' 
            });
        }
        
        const session = getSession(sessionId);
        
        if (!session || !session.cookies || !session.cookies.SESSION) {
            return c.json({ 
                success: false, 
                error: '会话已过期，请重新生成二维码' 
            });
        }
        
        touchSession(sessionId);
        
        const result = await auth.pollQRCodeStatus(qrCodeId, session.cookies);
        
        if (result.expired) {
            deleteSession(sessionId);
            return c.json({
                code: 1,
                message: 'expired',
                success: false
            });
        }
        
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
 * 完成登录（🆕 支持邮箱输入）
 */
router.post('/api/qr/login', async (c) => {
    try {
        const { qrCodeId, stateKey, semester_start = '2025-09-08', email = null } = await c.req.json();
        
        if (!qrCodeId || !stateKey) {
            return c.json({ 
                success: false, 
                error: '缺少必要参数' 
            });
        }
        
        const sessionId = c.req.header('cookie')?.match(/session_id=([^;]+)/)?.[1];
        
        if (!sessionId) {
            return c.json({ 
                success: false, 
                error: '会话已过期，请重新生成二维码' 
            });
        }
        
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
        
        console.log(`👤 用户信息: ID=${userId || 'N/A'}, 用户名=${username || 'N/A'}, 邮箱=${email || 'N/A'}`);
        
        let existingUser = null;
        
        if (userId) {
            console.log(`🔍 检查用户ID是否已存在: ${userId}`);
            existingUser = await db.findUserByUserId(userId);
        }
        
        if (!existingUser && username) {
            console.log(`🔍 检查用户名是否已存在: ${username}`);
            existingUser = await db.findUserByUsername(username);
        }
        
        if (existingUser && existingUser.cookie_valid) {
            console.log(`✅ 用户已存在，更新 Cookie 后返回原订阅链接`);
            
            const fpVisitorId = auth.generateFingerprintId();
            const loginResult = await auth.loginWithStateKey(stateKey, fpVisitorId, cookies);
            
            if (loginResult.success) {
                await db.saveUser(
                    existingUser.token, 
                    loginResult.cookies, 
                    existingUser.semester_start || semester_start,
                    userId,
                    username,
                    email // 🆕 更新邮箱
                );
                console.log('✅ Cookie 已更新为最新状态');
                
                await cacheManager.clearUserCache(existingUser.token);
            }
            
            deleteSession(sessionId);
            
            return c.json({ 
                success: true, 
                token: existingUser.token,
                existing: true,
                message: '检测到您已有订阅链接，Cookie 已更新'
            });
        }
        
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
        
        const token = crypto.randomBytes(32).toString('base64url');
        
        console.log('💾 保存用户信息...');
        
        await db.saveUser(token, loginResult.cookies, semester_start, userId, username, email); // 🆕 保存邮箱
        
        console.log('📦 生成初始缓存...');
        await cacheManager.generateAndCacheSchedule(token);
        
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
 * 课表订阅路由（ICS格式，支持 CDN 缓存）
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
        
        const result = await cacheManager.getCachedSchedule(token);
        
        if (!result.success) {
            if (result.error.includes('Cookie已过期')) {
                return c.text('❌ Cookie已过期，请重新扫码登录', 401);
            }
            return c.text(`❌ 生成课表失败: ${result.error}`, 500);
        }
        
        console.log(`✅ ${result.fromCache ? '使用缓存' : '重新生成'}`);
        
        c.header('Content-Type', 'text/calendar; charset=utf-8');
        c.header('Content-Disposition', 'attachment; filename=schedule.ics');
        
        const cacheControl = [
            'public',
            'max-age=3600',
            's-maxage=43200',
            'stale-while-revalidate=86400',
            'stale-if-error=259200'
        ].join(', ');
        
        c.header('Cache-Control', cacheControl);
        c.header('ETag', `"${result.lastUpdate}"`);
        c.header('Last-Modified', new Date(result.lastUpdate).toUTCString());
        c.header('X-Cache-Status', result.fromCache ? 'HIT' : 'MISS');
        c.header('X-Next-Update', new Date(result.nextUpdate).toISOString());
        
        return c.text(result.icsData);
        
    } catch (error) {
        console.error('获取课表失败:', error);
        return c.text(`❌ 服务器错误: ${error.message}`, 500);
    }
});

/**
 * 手动刷新缓存接口
 */
router.post('/api/cache/refresh/:token', async (c) => {
    const { token } = c.req.param();
    
    try {
        const user = await db.getUser(token);
        
        if (!user) {
            return c.json({ 
                success: false, 
                error: '用户不存在' 
            }, 404);
        }
        
        console.log(`🔄 手动刷新缓存: ${token.substring(0, 16)}...`);
        
        const result = await cacheManager.generateAndCacheSchedule(token);
        
        return c.json(result);
        
    } catch (error) {
        console.error('刷新缓存失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
    }
});

/**
 * 缓存统计接口
 */
router.get('/api/cache/stats', async (c) => {
    try {
        const stats = await cacheManager.getCacheStats();
        
        return c.json({
            success: true,
            ...stats
        });
        
    } catch (error) {
        console.error('获取缓存统计失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
    }
});

/**
 * 清理所有缓存接口（需要管理员密码）
 */
router.post('/api/cache/clear', async (c) => {
    try {
        const { password } = await c.req.json();
        
        if (password !== config.adminPassword) {
            return c.json({ 
                success: false, 
                error: '密码错误' 
            }, 403);
        }
        
        await cacheManager.clearAllCache();
        
        return c.json({ 
            success: true,
            message: '所有缓存已清理'
        });
        
    } catch (error) {
        console.error('清理缓存失败:', error);
        return c.json({ 
            success: false, 
            error: error.message 
        }, 500);
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
        
        const [totalResult, activeResult, validResult, emailResult] = await Promise.all([
            getCount('SELECT COUNT(*) as total FROM users'),
            getCount('SELECT COUNT(*) as active FROM users WHERE last_sync IS NOT NULL'),
            getCount('SELECT COUNT(*) as valid FROM users WHERE cookie_valid = 1'),
            getCount('SELECT COUNT(*) as with_email FROM users WHERE email IS NOT NULL AND email != ""')
        ]);
        
        dbInstance.close();
        
        const cacheStats = await cacheManager.getCacheStats();
        
        return c.json({
            total_users: totalResult.total,
            active_users: activeResult.active,
            valid_cookies: validResult.valid,
            users_with_email: emailResult.with_email,
            cache: cacheStats
        });
        
    } catch (error) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * 首页
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