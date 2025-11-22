// ============= auth.js - 认证模块 (完全兼容版) =============
const crypto = require('crypto');
const https = require('https');

const CAS_URL = "https://sso.jxpu.edu.cn/cas";
const JWXT_URL = "https://jiaowu.jxpu.edu.cn";
const COUNT_ID = ""; //统计ID（最好是百度的，其它的要改generateTrackingCookies方法）

// 创建自定义的 HTTPS Agent (忽略证书验证)
const httpsAgent = new https.Agent({ 
    rejectUnauthorized: false 
});

/**
 * 生成15位时间戳作为二维码ID
 */
function generateQrCodeId() {
    return Math.floor(Date.now() * 100 + Math.random() * 100);
}

/**
 * 生成随机指纹ID
 */
function generateFingerprintId() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * 生成百度统计跟踪Cookie
 */
function generateTrackingCookies() {
    const siteId = COUNT_ID;
    const timestamp = Math.round(Date.now() / 1000);
    
    return {
        [`Hm_lvt_${siteId}`]: timestamp.toString(),
        [`Hm_lpvt_${siteId}`]: timestamp.toString()
    };
}

/**
 * 从响应头中提取 Set-Cookie（兼容多种 Node.js 版本）
 */
function getSetCookieHeaders(response) {
    try {
        // 方式1: headers.getSetCookie() - Node.js 19.7+
        if (typeof response.headers.getSetCookie === 'function') {
            return response.headers.getSetCookie();
        }
        
        // 方式2: headers.raw() - Node.js 18+
        if (typeof response.headers.raw === 'function') {
            const raw = response.headers.raw();
            return raw['set-cookie'] || [];
        }
        
        // 方式3: 手动遍历所有 headers
        const setCookies = [];
        response.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') {
                setCookies.push(value);
            }
        });
        if (setCookies.length > 0) return setCookies;
        
        // 方式4: 直接获取
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
            return Array.isArray(setCookie) ? setCookie : [setCookie];
        }
        
        return [];
    } catch (error) {
        console.error('⚠️  获取 Set-Cookie 头失败:', error.message);
        return [];
    }
}

/**
 * 从 Set-Cookie 头中解析 cookies
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
 * 将 cookies 对象转换为 Cookie 字符串
 */
function buildCookieString(cookies) {
    if (!cookies) return '';
    return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

/**
 * 延迟函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成二维码图片
 */
async function generateQRCode() {
    try {
        const cookieJar = {};
        
        // 1. 生成跟踪 Cookie
        Object.assign(cookieJar, generateTrackingCookies());
        
        // 2. 访问登录页面获取初始 Cookie
        console.log('📄 访问登录页面...');
        const loginPageResponse = await fetch(`${CAS_URL}/login`, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cookie': buildCookieString(cookieJar),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
            },
            agent: httpsAgent
        });
        
        // 解析登录页面返回的 Cookie
        const loginCookies = parseCookiesFromHeaders(getSetCookieHeaders(loginPageResponse));
        Object.assign(cookieJar, loginCookies);
        console.log(`📝 初始 Cookies: ${Object.keys(cookieJar).join(', ')}`);
        
        // 3. 请求二维码图片并获取 SESSION Cookie（最多重试3次）
        const qrCodeId = generateQrCodeId();
        let sessionCookie = null;
        let imageBuffer = null;
        let lastError = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`🔄 尝试获取二维码 SESSION (第 ${attempt}/3 次)`);
                
                const qrResponse = await fetch(`${CAS_URL}/qr/qrcode?r=${qrCodeId}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Cookie': buildCookieString(cookieJar),
                        'Host': 'sso.jxpu.edu.cn',
                        'Referer': `${CAS_URL}/login?service=${encodeURIComponent(JWXT_URL + '/jsxsd/sso.jsp')}`,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                    },
                    agent: httpsAgent
                });
                
                if (!qrResponse.ok) {
                    throw new Error(`HTTP ${qrResponse.status}`);
                }
                
                // 解析返回的 Cookie
                const qrCookies = parseCookiesFromHeaders(getSetCookieHeaders(qrResponse));
                Object.assign(cookieJar, qrCookies);
                
                // 获取图片数据
                imageBuffer = Buffer.from(await qrResponse.arrayBuffer());
                
                // 检查是否获取到 SESSION
                if (cookieJar.SESSION) {
                    sessionCookie = cookieJar.SESSION;
                    console.log(`✅ 成功获取 SESSION: ${sessionCookie.substring(0, 16)}...`);
                    break;
                }
                
                console.log(`⚠️  第 ${attempt} 次未获取到 SESSION，当前 Cookies: ${Object.keys(cookieJar).join(', ')}`);
                
            } catch (error) {
                lastError = error;
                console.log(`⚠️  第 ${attempt} 次请求失败: ${error.message}`);
            }
            
            // 如果不是最后一次尝试，等待后重试
            if (attempt < 3) {
                await sleep(500);
            }
        }
        
        // 3次尝试后仍未获取到 SESSION
        if (!sessionCookie) {
            return { 
                success: false, 
                error: `获取 SESSION Cookie 失败（已重试3次）${lastError ? ': ' + lastError.message : ''}` 
            };
        }
        
        // 验证图片数据
        if (!imageBuffer || imageBuffer.length === 0) {
            return { 
                success: false, 
                error: '二维码图片数据为空' 
            };
        }
        
        return {
            success: true,
            qrCodeId: qrCodeId.toString(),
            imageBuffer: imageBuffer,
            cookies: cookieJar  // 返回包含 SESSION 的完整 Cookie
        };
        
    } catch (error) {
        console.error('❌ 生成二维码失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 轮询二维码状态
 */
async function pollQRCodeStatus(qrCodeId, cookies) {
    try {
        if (!cookies || !cookies.SESSION) {
            return { 
                success: false, 
                error: '缺少 SESSION Cookie' 
            };
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(`${CAS_URL}/qr/comet`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Content-Type': 'application/json',
                'Cookie': buildCookieString(cookies),
                'Origin': CAS_URL,
                'Referer': `${CAS_URL}/login?service=${encodeURIComponent(JWXT_URL + '/jsxsd/sso.jsp')}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({}),
            agent: httpsAgent,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        // 检查是否过期
        if (data.code === 1 && data.message === 'expired') {
            return {
                success: false,
                expired: true,
                error: '二维码已过期'
            };
        }
        
        // 成功获取状态
        if (data.code === 0 && data.data) {
            const qrCode = data.data.qrCode;
            return {
                success: true,
                status: qrCode.status,
                stateKey: data.data.stateKey,
                userId: qrCode.accounts[0].id,
                username: qrCode.accounts[0].username,
                expired: false
            };
        }
        
        return { success: false, error: '获取状态失败' };
        
    } catch (error) {
        // 超时视为等待中
        if (error.name === 'AbortError') {
            return { success: true, status: '0', expired: false };
        }
        return { success: false, error: error.message };
    }
}

/**
 * 使用 stateKey 完成登录并获取 TGC Cookie
 */
async function loginWithStateKey(stateKey, fpVisitorId, sessionCookies) {
    try {
        if (!sessionCookies || !sessionCookies.SESSION) {
            return { 
                success: false, 
                error: '缺少 SESSION Cookie' 
            };
        }
        
        const serviceUrl = `${JWXT_URL}/jsxsd/sso.jsp`;
        const loginUrl = `${CAS_URL}/login?service=${encodeURIComponent(serviceUrl)}`;
        
        // 构建登录请求参数
        const params = new URLSearchParams({
            qrCodeKey: stateKey,
            currentMenu: '3',
            geolocation: '',
            fpVisitorId: fpVisitorId,
            trustAgent: ''
        });
        
        console.log('🔐 使用 stateKey 登录，携带 SESSION:', sessionCookies.SESSION.substring(0, 16) + '...');
        
        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cookie': buildCookieString(sessionCookies),
                'Origin': CAS_URL,
                'Referer': `${CAS_URL}/login?service=${encodeURIComponent(serviceUrl)}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
            },
            body: params.toString(),
            redirect: 'manual',
            agent: httpsAgent
        });
        
        // 提取 Cookie
        const cookies = parseCookiesFromHeaders(getSetCookieHeaders(response));
        
        if (cookies.TGC) {
            console.log('✅ 成功获取 TGC:', cookies.TGC.substring(0, 16) + '...');
            return {
                success: true,
                cookies: cookies
            };
        }
        
        return { success: false, error: 'TGC Cookie 未找到' };
        
    } catch (error) {
        console.error('❌ 登录失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 获取课表HTML
 */
async function fetchSchedule(cookies) {
    try {
        const cookieJar = { ...cookies };
        
        // 辅助函数：更新 cookieJar
        const updateCookies = (response) => {
            const newCookies = parseCookiesFromHeaders(getSetCookieHeaders(response));
            Object.assign(cookieJar, newCookies);
        };
        
        // 步骤1: SSO登录验证
        let response = await fetch(
            `${CAS_URL}/login?service=${encodeURIComponent(JWXT_URL + '/jsxsd/sso.jsp')}`,
            {
                method: 'GET',
                headers: {
                    'Cookie': buildCookieString(cookieJar),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                redirect: 'manual',
                agent: httpsAgent
            }
        );
        
        updateCookies(response);
        
        // 检查是否需要重新登录
        const html = await response.text();
        if (html.includes('<title>登录 - 江西职业技术大学</title>')) {
            return { success: false, error: 'Cookie无效或已过期' };
        }
        
        // 提取 ticket
        let ticket = null;
        if (response.status === 302 || response.status === 301) {
            const location = response.headers.get('location');
            const ticketMatch = location?.match(/ticket=([^&]+)/);
            if (ticketMatch) {
                ticket = ticketMatch[1];
            }
        }
        
        // 步骤2: 访问教务系统SSO
        const ssoUrl = ticket 
            ? `${JWXT_URL}/jsxsd/sso.jsp?ticket=${ticket}`
            : `${JWXT_URL}/jsxsd/sso.jsp`;
        
        response = await fetch(ssoUrl, {
            method: 'GET',
            headers: {
                'Cookie': buildCookieString(cookieJar),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            redirect: 'manual',
            agent: httpsAgent
        });
        
        updateCookies(response);
        
        // 处理重定向
        if (response.status === 302 || response.status === 301) {
            const location = response.headers.get('location');
            const finalUrl = location?.startsWith('http') ? location : `${JWXT_URL}${location}`;
            
            response = await fetch(finalUrl, {
                method: 'GET',
                headers: {
                    'Cookie': buildCookieString(cookieJar),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                agent: httpsAgent
            });
            
            updateCookies(response);
        }
        
        // 步骤3: 访问主页
        response = await fetch(`${JWXT_URL}/jsxsd/framework/xsMain.jsp`, {
            method: 'GET',
            headers: {
                'Cookie': buildCookieString(cookieJar),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            agent: httpsAgent
        });
        
        updateCookies(response);
        
        // 步骤4: 获取课表
        response = await fetch(`${JWXT_URL}/jsxsd/xskb/xskb_list.do`, {
            method: 'GET',
            headers: {
                'Cookie': buildCookieString(cookieJar),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            agent: httpsAgent
        });
        
        const scheduleHtml = await response.text();
        
        if (response.status === 200 && scheduleHtml.includes('<title>学期理论课表</title>')) {
            return { success: true, html: scheduleHtml };
        }
        
        return { success: false, error: 'Cookie可能已过期或响应异常' };
        
    } catch (error) {
        console.error('❌ 获取课表失败:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    generateQrCodeId,
    generateFingerprintId,
    generateTrackingCookies,
    generateQRCode,
    pollQRCodeStatus,
    loginWithStateKey,
    fetchSchedule
};