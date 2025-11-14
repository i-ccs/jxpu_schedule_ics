// =====================================
// 文件: scripts/test-sso.js
// 用途: 详细测试SSO登录流程
// 使用: node scripts/test-sso.js <TGC>
// =====================================

const axios = require('axios');
const https = require('https');
const fs = require('fs');

const CAS_URL = "https://sso.jxpu.edu.cn/cas";
const JWXT_URL = "https://jiaowu.jxpu.edu.cn";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testSSO(tgc) {
    console.log('🧪 测试SSO登录流程');
    console.log('='.repeat(60));
    console.log('TGC:', tgc.substring(0, 30) + '...');
    console.log('');

    const cookieJar = { TGC: tgc };
    
    const getCookieString = () => {
        return Object.entries(cookieJar)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
    };

    const parseCookies = (headers) => {
        const setCookie = headers['set-cookie'];
        if (!setCookie) return;
        
        (Array.isArray(setCookie) ? setCookie : [setCookie]).forEach(cookie => {
            const match = cookie.match(/^([^=]+)=([^;]+)/);
            if (match) {
                cookieJar[match[1]] = match[2];
                console.log(`      → 新Cookie: ${match[1]}`);
            }
        });
    };

    try {
        const axiosInstance = axios.create({
            httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Connection': 'keep-alive'
            },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            timeout: 15000
        });

        // 步骤1: CAS登录
        console.log('📍 步骤1: 访问CAS登录页面');
        console.log(`   URL: ${CAS_URL}/login?service=${encodeURIComponent(JWXT_URL + '/jsxsd/sso.jsp')}`);
        console.log(`   Cookie: ${getCookieString()}`);
        
        let response = await axiosInstance.get(
            `${CAS_URL}/login?service=${encodeURIComponent(JWXT_URL + '/jsxsd/sso.jsp')}`,
            { headers: { Cookie: getCookieString() } }
        );

        console.log(`   ✅ 状态码: ${response.status}`);
        parseCookies(response.headers);
        
        let ticket = null;
        if (response.status === 302 || response.status === 301) {
            const location = response.headers.location;
            console.log(`   🔄 重定向: ${location}`);
            
            const ticketMatch = location.match(/ticket=([^&]+)/);
            if (ticketMatch) {
                ticket = ticketMatch[1];
                console.log(`   🎫 Ticket: ${ticket.substring(0, 30)}...`);
            } else {
                console.log('   ⚠️  未找到Ticket');
            }
        } else if (response.status === 200) {
            // 检查是否已经登录
            if (response.data.includes('统一身份认证')) {
                console.log('   ❌ 返回了登录页面，TGC可能无效');
                fs.writeFileSync('debug_cas_login.html', response.data);
                console.log('   💾 页面已保存到 debug_cas_login.html');
                return false;
            }
        }

        console.log('   当前Cookies:', Object.keys(cookieJar).join(', '));
        console.log('');

        // 步骤2: 访问教务系统SSO
        console.log('📍 步骤2: 访问教务系统SSO');
        const ssoUrl = ticket 
            ? `${JWXT_URL}/jsxsd/sso.jsp?ticket=${ticket}`
            : `${JWXT_URL}/jsxsd/sso.jsp`;
        console.log(`   URL: ${ssoUrl}`);
        console.log(`   Cookie: ${getCookieString()}`);

        response = await axiosInstance.get(ssoUrl, {
            headers: { Cookie: getCookieString() }
        });

        console.log(`   ✅ 状态码: ${response.status}`);
        parseCookies(response.headers);

        if (response.status === 302 || response.status === 301) {
            const location = response.headers.location;
            console.log(`   🔄 重定向: ${location}`);
            
            const finalUrl = location.startsWith('http') ? location : `${JWXT_URL}${location}`;
            console.log(`   🔗 最终URL: ${finalUrl}`);
            
            response = await axiosInstance.get(finalUrl, {
                headers: { Cookie: getCookieString() }
            });
            
            console.log(`   ✅ 状态码: ${response.status}`);
            parseCookies(response.headers);
        }

        console.log('   当前Cookies:', Object.keys(cookieJar).join(', '));
        console.log('');

        // 步骤3: 访问主页
        console.log('📍 步骤3: 访问教务系统主页');
        console.log(`   URL: ${JWXT_URL}/jsxsd/framework/xsMain.jsp`);
        
        response = await axiosInstance.get(
            `${JWXT_URL}/jsxsd/framework/xsMain.jsp`,
            { headers: { Cookie: getCookieString() } }
        );

        console.log(`   ✅ 状态码: ${response.status}`);
        parseCookies(response.headers);
        
        // 检查登录状态
        if (response.data.includes('用户登录') || response.data.includes('login.jsp')) {
            console.log('   ❌ 页面要求登录，SSO认证失败');
            fs.writeFileSync('debug_main_page.html', response.data);
            console.log('   💾 页面已保存到 debug_main_page.html');
            return false;
        } else if (response.data.includes('退出') || response.data.includes('学生')) {
            console.log('   ✅ 成功登录到教务系统');
        }

        console.log('   当前Cookies:', Object.keys(cookieJar).join(', '));
        console.log('');

        // 步骤4: 获取课表
        console.log('📍 步骤4: 获取课表');
        console.log(`   URL: ${JWXT_URL}/jsxsd/xskb/xskb_list.do`);
        
        response = await axiosInstance.get(
            `${JWXT_URL}/jsxsd/xskb/xskb_list.do`,
            { headers: { Cookie: getCookieString() } }
        );

        console.log(`   ✅ 状态码: ${response.status}`);
        console.log(`   📄 响应长度: ${response.data.length} 字节`);
        console.log(`   📋 包含课表标题: ${response.data.includes('<title>学期理论课表</title>')}`);
        
        if (response.data.includes('<title>学期理论课表</title>')) {
            console.log('   ✅ 成功获取课表！');
            fs.writeFileSync('debug_schedule.html', response.data);
            console.log('   💾 课表已保存到 debug_schedule.html');
            
            // 简单解析课程数量
            const courseCount = (response.data.match(/kbcontent/g) || []).length;
            console.log(`   📊 估计课程数: ${courseCount}`);
            
            return true;
        } else {
            console.log('   ❌ 未获取到课表');
            fs.writeFileSync('debug_schedule_fail.html', response.data);
            console.log('   💾 响应已保存到 debug_schedule_fail.html');
            return false;
        }

    } catch (error) {
        console.error('');
        console.error('❌ 测试失败:', error.message);
        if (error.response) {
            console.error('   响应状态:', error.response.status);
            console.error('   响应头:', error.response.headers);
        }
        return false;
    }
}

const tgc = process.argv[2];
if (!tgc) {
    console.log('用法: node scripts/test-sso.js <TGC>');
    console.log('');
    console.log('示例: node scripts/test-sso.js TGT-123456-...');
    console.log('');
    console.log('获取TGC:');
    console.log('1. 登录 https://sso.jxpu.edu.cn/cas/login');
    console.log('2. F12 → Application → Cookies');
    console.log('3. 复制 TGC 的值');
    process.exit(1);
}

testSSO(tgc).then(success => {
    console.log('');
    console.log('='.repeat(60));
    if (success) {
        console.log('🎉 测试成功！TGC有效，可以正常获取课表');
    } else {
        console.log('💔 测试失败！请检查:');
        console.log('   1. TGC是否正确');
        console.log('   2. TGC是否已过期');
        console.log('   3. 查看保存的HTML文件排查问题');
    }
    console.log('='.repeat(60));
});
