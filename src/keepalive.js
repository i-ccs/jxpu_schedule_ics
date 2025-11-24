// ============= keepalive.js - 正确的 Cookie 保活模块 =============
const https = require('https');
const db = require('./db');
const mailer = require('./mailer');

const CAS_URL = "https://sso.jxpu.edu.cn/cas";
const PORTAL_URL = "https://portal.jxpu.edu.cn";

// 创建自定义的 HTTPS Agent
const httpsAgent = new https.Agent({ 
    rejectUnauthorized: false 
});

/**
 * 保活API配置（基于真实请求）
 */
const KEEPALIVE_APIS = [
    {
        name: '天气API',
        url: `${PORTAL_URL}/portal-api/v1/weather/getWeather`,
        needJWT: true,
        needCookie: true
    },
    {
        name: '弹窗列表',
        url: `${PORTAL_URL}/portal-api/v1/popup/list`,
        needJWT: true,
        needCookie: true
    },
    {
        name: '系统访问保存',
        url: `${PORTAL_URL}/portal-api/v1/personalData/systemVisitSave`,
        needJWT: true,
        needCookie: true
    },
    {
        name: '今日课表',
        url: `${PORTAL_URL}/portal-api/v1/calendar/share/schedule/getTodaySchedule`,
        needJWT: true,
        needCookie: true
    },
    {
        name: '用户信息',
        url: `https://authx-service.jxpu.edu.cn/personal/api/v1/personal/me/user`,
        needJWT: true,
        needCookie: false
    }
];

/**
 * 从响应头中提取 Set-Cookie
 */
function getSetCookieHeaders(response) {
    try {
        if (typeof response.headers.getSetCookie === 'function') {
            return response.headers.getSetCookie();
        }
        if (typeof response.headers.raw === 'function') {
            const raw = response.headers.raw();
            return raw['set-cookie'] || [];
        }
        const setCookies = [];
        response.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') {
                setCookies.push(value);
            }
        });
        return setCookies.length > 0 ? setCookies : [];
    } catch {
        return [];
    }
}

/**
 * 解析 Cookie
 */
function parseCookiesFromHeaders(setCookieHeaders) {
    const cookies = {};
    if (!setCookieHeaders || setCookieHeaders.length === 0) return cookies;
    
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    headers.forEach(cookie => {
        const match = cookie.match(/^([^=]+)=([^;]+)/);
        if (match) {
            cookies[match[1]] = match[2];
        }
    });
    return cookies;
}

/**
 * 构建 Cookie 字符串
 */
function buildCookieString(cookies) {
    if (!cookies) return '';
    
    const parts = [];
    
    // 添加基础 Cookie
    for (const [key, value] of Object.entries(cookies)) {
        if (key !== 'jwtToken') { // jwtToken 不放在 Cookie 中
            parts.push(`${key}=${value}`);
        }
    }
    
    // 确保有 isLogin=true
    if (!parts.some(p => p.includes('isLogin='))) {
        parts.push('isLogin=true');
    }
    
    return parts.join('; ');
}

/**
 * 延迟函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取 JWT Token（通过完整登录流程）
 */
async function getJWTToken(tgcCookie) {
    try {
        console.log('🔑 开始获取 JWT Token...');
        
        // 步骤1: CAS 登录
        console.log('   1️⃣ CAS 登录验证...');
        const loginUrl = `${CAS_URL}/login?service=${encodeURIComponent(
            PORTAL_URL + '/?path=https%3A%2F%2Fportal.jxpu.edu.cn%2Fmain.html%23%2F'
        )}`;
        
        const casResponse = await fetch(loginUrl, {
            method: 'GET',
            headers: {
                'Cookie': `TGC=${tgcCookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            redirect: 'manual',
            agent: httpsAgent
        });
        
        // 检查重定向
        if (casResponse.status !== 302 && casResponse.status !== 301) {
            console.log('   ❌ CAS 登录失败，未收到重定向');
            return null;
        }
        
        const location = casResponse.headers.get('location');
        if (!location || !location.includes('ticket=')) {
            console.log('   ❌ 未获得 ticket');
            return null;
        }
        
        // 提取 ticket
        const ticketMatch = location.match(/ticket=([^&]+)/);
        if (!ticketMatch) {
            console.log('   ❌ 无法提取 ticket');
            return null;
        }
        
        const ticket = ticketMatch[1];
        console.log(`   ✅ 获得 ticket: ${ticket.substring(0, 30)}...`);
        
        // 步骤2: 使用 ticket 访问 portal
        console.log('   2️⃣ 使用 ticket 访问 Portal...');
        const portalResponse = await fetch(location, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': `${CAS_URL}/`
            },
            agent: httpsAgent
        });
        
        const html = await portalResponse.text();
        
        // 从响应中提取 JWT token
        // Portal 页面会在 JavaScript 中设置 token
        let jwtToken = null;
        
        // 方法1: 从 HTML 中查找
        const tokenMatch = html.match(/token["']?\s*[=:]\s*["']([^"']+)["']/i);
        if (tokenMatch) {
            jwtToken = tokenMatch[1];
        }
        
        // 方法2: 从 localStorage 设置语句中查找
        if (!jwtToken) {
            const localStorageMatch = html.match(/localStorage\.setItem\(['"]token['"],\s*['"]([^'"]+)['"]/);
            if (localStorageMatch) {
                jwtToken = localStorageMatch[1];
            }
        }
        
        // 方法3: 从 Cookie 中获取（有些系统会设置）
        if (!jwtToken) {
            const cookies = parseCookiesFromHeaders(getSetCookieHeaders(portalResponse));
            jwtToken = cookies.token || cookies.TOKEN || cookies.jwt;
        }
        
        if (jwtToken) {
            console.log(`   ✅ 获得 JWT Token: ${jwtToken.substring(0, 30)}...`);
            return jwtToken;
        } else {
            console.log('   ⚠️  未能从响应中提取 JWT Token，但可能已设置在浏览器中');
            // 返回 ticket 作为备用（某些API可能接受）
            return ticket;
        }
        
    } catch (error) {
        console.error('❌ 获取 JWT Token 失败:', error.message);
        return null;
    }
}

/**
 * 尝试保活 API
 */
async function tryKeepaliveAPI(api, cookies, jwtToken) {
    try {
        console.log(`🔄 尝试: ${api.name}`);
        
        // 构建请求头
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        };
        
        // 添加 Cookie
        if (api.needCookie) {
            headers['Cookie'] = buildCookieString(cookies);
        }
        
        // 添加 JWT Token
        if (api.needJWT && jwtToken) {
            headers['x-id-token'] = jwtToken;
        }
        
        // 添加其他必需的头
        if (api.url.includes('portal.jxpu.edu.cn')) {
            headers['Referer'] = `${PORTAL_URL}/main.html`;
            headers['x-device-info'] = 'PC';
            headers['x-terminal-info'] = 'PC';
            headers['sec-fetch-mode'] = 'cors';
            headers['sec-fetch-site'] = 'same-origin';
        } else if (api.url.includes('authx-service')) {
            headers['Origin'] = PORTAL_URL;
            headers['Referer'] = `${PORTAL_URL}/main.html`;
            headers['sec-fetch-mode'] = 'cors';
            headers['sec-fetch-site'] = 'same-site';
            headers['x-device-info'] = 'PC';
            headers['x-terminal-info'] = 'PC';
        }
        
        // 发送请求
        const response = await fetch(api.url, {
            method: 'GET',
            headers,
            agent: httpsAgent
        });
        
        let body = '';
        try {
            body = await response.text();
        } catch {}
        
        // 判断是否成功
        if (response.status === 200) {
            // 尝试解析 JSON
            try {
                const json = JSON.parse(body);
                
                if (json.code === 0 || json.code === '0' || json.success === true) {
                    console.log(`✅ ${api.name} 成功 (code=${json.code || 'success'})`);
                    return { success: true, api: api.name };
                } else if (json.data !== undefined) {
                    console.log(`✅ ${api.name} 成功 (有数据返回)`);
                    return { success: true, api: api.name };
                } else {
                    console.log(`⚠️  ${api.name} 响应异常: ${JSON.stringify(json).substring(0, 100)}`);
                    return { success: false, api: api.name };
                }
            } catch {
                // 不是 JSON
                if (body.includes('登录') || body.includes('login')) {
                    console.log(`❌ ${api.name} 需要登录`);
                    return { success: false, api: api.name };
                } else if (body.length > 0) {
                    console.log(`✅ ${api.name} 成功 (返回内容)`);
                    return { success: true, api: api.name };
                }
            }
        }
        
        console.log(`❌ ${api.name} 失败 (HTTP ${response.status})`);
        return { success: false, api: api.name };
        
    } catch (error) {
        console.error(`❌ ${api.name} 异常:`, error.message);
        return { success: false, api: api.name, error: error.message };
    }
}

/**
 * 执行保活
 */
async function performKeepalive(cookies) {
    console.log('🔄 开始 Cookie 保活...');
    
    // 检查是否有 TGC
    if (!cookies.TGC) {
        console.log('❌ 缺少 TGC Cookie');
        return { success: false, error: '缺少 TGC Cookie' };
    }
    
    // 步骤1: 获取 JWT Token
    const jwtToken = cookies.jwtToken || await getJWTToken(cookies.TGC);
    
    if (!jwtToken) {
        console.log('⚠️  未获取到 JWT Token，但继续尝试保活');
    }
    
    // 更新 cookies（保存 JWT Token）
    const updatedCookies = { ...cookies, jwtToken };
    
    // 步骤2: 随机选择一个 API 进行保活
    const randomAPI = KEEPALIVE_APIS[Math.floor(Math.random() * KEEPALIVE_APIS.length)];
    
    console.log(`\n📝 使用 API: ${randomAPI.name}`);
    const result = await tryKeepaliveAPI(randomAPI, updatedCookies, jwtToken);
    
    if (result.success) {
        return {
            success: true,
            api: result.api,
            cookies: updatedCookies
        };
    }
    
    // 如果随机的失败了，尝试其他的
    console.log('\n📝 随机 API 失败，尝试其他 API...');
    for (const api of KEEPALIVE_APIS) {
        if (api.name === randomAPI.name) continue; // 跳过已尝试的
        
        const result = await tryKeepaliveAPI(api, updatedCookies, jwtToken);
        if (result.success) {
            return {
                success: true,
                api: result.api,
                cookies: updatedCookies
            };
        }
        
        await sleep(1000);
    }
    
    console.log('\n❌ 所有 API 均失败');
    return { success: false, error: '所有保活 API 均失败' };
}

/**
 * 检查单个用户
 */
async function checkAndKeepaliveUser(token) {
    try {
        const user = await db.getUser(token);
        
        if (!user) {
            return { success: false, error: '用户不存在' };
        }
        
        if (!user.cookieValid) {
            return { success: false, error: 'Cookie已失效', needNotify: false };
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔍 检查用户: ${user.username || user.userId}`);
        console.log(`${'='.repeat(60)}`);
        
        // 执行保活
        const result = await performKeepalive(user.cookies);
        
        if (result.success) {
            // 保活成功，更新 cookies（包含新的 JWT Token）
            await db.updateKeepaliveTime(token, result.cookies);
            console.log(`✅ 保活成功 (${result.api})\n`);
            
            return {
                success: true,
                api: result.api,
                username: user.username || user.userId,
                email: user.email
            };
        }
        
        // 保活失败，标记 Cookie 无效
        await db.markCookieInvalid(token);
        console.log(`❌ Cookie 已失效\n`);
        
        // 发送邮件通知
        if (user.email) {
            await mailer.sendCookieExpiredNotification(user.email, user.username, user.userId);
        }
        
        return {
            success: false,
            error: 'Cookie已失效',
            username: user.username || user.userId,
            email: user.email,
            needNotify: !!user.email
        };
        
    } catch (error) {
        console.error('❌ 检查异常:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * 批量检查所有用户
 */
async function checkAllUsersCookies() {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('🔄 开始批量检查所有用户 Cookie');
        console.log('='.repeat(70));
        
        const users = await db.getAllValidUsers();
        console.log(`📊 共 ${users.length} 个有效用户需要检查\n`);
        
        const stats = {
            total: users.length,
            success: 0,
            failed: 0,
            notified: 0,
            skipped: 0,
            apis: {}
        };
        
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            console.log(`[${i + 1}/${users.length}] 处理中...`);
            
            const result = await checkAndKeepaliveUser(user.token);
            
            if (result.success) {
                stats.success++;
                stats.apis[result.api] = (stats.apis[result.api] || 0) + 1;
            } else {
                stats.failed++;
                if (result.needNotify) {
                    stats.notified++;
                }
                if (!user.email) {
                    stats.skipped++;
                }
            }
            
            // 等待3秒
            if (i < users.length - 1) {
                await sleep(3000);
            }
        }
        
        console.log('='.repeat(70));
        console.log('✅ 批量检查完成');
        console.log('='.repeat(70));
        console.log(`📊 统计结果:`);
        console.log(`   总计: ${stats.total}`);
        console.log(`   成功: ${stats.success}`);
        console.log(`   失败: ${stats.failed}`);
        console.log(`   通知: ${stats.notified}`);
        console.log(`   跳过: ${stats.skipped} (未设置邮箱)`);
        
        if (Object.keys(stats.apis).length > 0) {
            console.log(`\n   使用的 API:`);
            for (const [api, count] of Object.entries(stats.apis)) {
                console.log(`     - ${api}: ${count} 次`);
            }
        }
        
        console.log('='.repeat(70) + '\n');
        
        return stats;
        
    } catch (error) {
        console.error('❌ 批量检查失败:', error);
        return {
            total: 0,
            success: 0,
            failed: 0,
            notified: 0,
            skipped: 0
        };
    }
}

/**
 * 启动定时任务
 */
function startKeepaliveSchedule() {
    const INTERVAL = 24 * 60 * 60 * 1000; // 24小时
    
    console.log('⏰ Cookie保活定时任务已启动 (每24小时检查一次)');
    
    // 首次延迟1分钟执行
    setTimeout(async () => {
        await checkAllUsersCookies();
        
        // 然后每24小时执行一次
        setInterval(async () => {
            await checkAllUsersCookies();
        }, INTERVAL);
    }, 60 * 1000);
}

module.exports = {
    performKeepalive,
    getJWTToken,
    checkAndKeepaliveUser,
    checkAllUsersCookies,
    startKeepaliveSchedule
};