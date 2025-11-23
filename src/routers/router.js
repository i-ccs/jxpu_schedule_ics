// ============= router.js - Hono 路由 (支持 CDN 缓存) =============
const { Hono } = require('hono');
const crypto = require('crypto');
const { setCookie } = require('hono/cookie');

// 🆕 引入配置
const { config } = require('../config');

const auth = require('../auth');
const parser = require('../parser');
const icalGenerator = require('../ical');
const db = require('../db');
const cacheManager = require('../cache-manager'); // 🆕 缓存管理器

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
        
        // 🆕 清理缓存
        await cacheManager.clearUserCache(token);
        
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
 * 🆕 直接下载课表 ICS 文件（使用缓存）
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
        
        // 🆕 使用缓存管理器获取课表
        const result = await cacheManager.getCachedSchedule(token);
        
        if (!result.success) {
            if (result.error.includes('Cookie已过期')) {
                return c.text('❌ Cookie已过期，请重新扫码登录', 401);
            }
            return c.text(`❌ 生成课表失败: ${result.error}`, 500);
        }
        
        console.log(`✅ ${result.fromCache ? '使用缓存' : '重新生成'}`);
        
        // 设置下载响应头
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
 * 完成登录
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
        
        console.log(`👤 用户信息: ID=${userId || 'N/A'}, 用户名=${username || 'N/A'}`);
        
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
                    username
                );
                console.log('✅ Cookie 已更新为最新状态');
                
                // 🆕 清理旧缓存，强制下次生成新缓存
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
        
        await db.saveUser(token, loginResult.cookies, semester_start, userId, username);
        
        // 🆕 立即生成初始缓存
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
 * 🆕 课表订阅路由（ICS格式，支持 CDN 缓存）
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
        
        // 🆕 使用缓存管理器获取课表
        const result = await cacheManager.getCachedSchedule(token);
        
        if (!result.success) {
            if (result.error.includes('Cookie已过期')) {
                return c.text('❌ Cookie已过期，请重新扫码登录', 401);
            }
            return c.text(`❌ 生成课表失败: ${result.error}`, 500);
        }
        
        console.log(`✅ ${result.fromCache ? '使用缓存' : '重新生成'}`);
        
        // 🆕 设置 Cloudflare CDN 缓存头
        c.header('Content-Type', 'text/calendar; charset=utf-8');
        c.header('Content-Disposition', 'attachment; filename=schedule.ics');
        
        // Cloudflare CDN 缓存配置
        const cacheControl = [
            'public',                          // 允许 CDN 缓存
            'max-age=3600',                    // 浏览器缓存1小时
            's-maxage=43200',                  // CDN 缓存12小时
            'stale-while-revalidate=86400',    // 允许返回过期内容同时后台更新
            'stale-if-error=259200'            // 如果源站错误，使用3天内的旧缓存
        ].join(', ');
        
        c.header('Cache-Control', cacheControl);
        
        // 添加 ETag 支持（基于最后更新时间）
        const etag = `"${result.lastUpdate}"`;
        c.header('ETag', etag);
        
        // 添加最后修改时间
        c.header('Last-Modified', new Date(result.lastUpdate).toUTCString());
        
        // 🆕 添加自定义缓存头（用于 Cloudflare 规则）
        c.header('X-Cache-Status', result.fromCache ? 'HIT' : 'MISS');
        c.header('X-Next-Update', new Date(result.nextUpdate).toISOString());
        
        return c.text(result.icsData);
        
    } catch (error) {
        console.error('获取课表失败:', error);
        return c.text(`❌ 服务器错误: ${error.message}`, 500);
    }
});

/**
 * 🆕 手动刷新缓存接口
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
 * 🆕 缓存统计接口
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
 * 🆕 清理所有缓存接口（需要管理员密码）
 */
router.post('/api/cache/clear', async (c) => {
    try {
        const { password } = await c.req.json();
        
        // 🆕 使用配置中的管理员密码
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
        
        const [totalResult, activeResult, validResult] = await Promise.all([
            getCount('SELECT COUNT(*) as total FROM users'),
            getCount('SELECT COUNT(*) as active FROM users WHERE last_sync IS NOT NULL'),
            getCount('SELECT COUNT(*) as valid FROM users WHERE cookie_valid = 1')
        ]);
        
        dbInstance.close();
        
        // 🆕 添加缓存统计
        const cacheStats = await cacheManager.getCacheStats();
        
        return c.json({
            total_users: totalResult.total,
            active_users: activeResult.active,
            valid_cookies: validResult.valid,
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