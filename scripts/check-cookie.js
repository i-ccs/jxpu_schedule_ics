// =====================================
// 文件: scripts/check-cookie.js
// 用途: 检查Cookie有效性
// 使用: node scripts/check-cookie.js <TGC>
// =====================================


const axios = require('axios');
const https = require('https');

const CAS_URL = "https://sso.jxpu.edu.cn/cas";
const JWXT_URL = "https://jiaowu.jxpu.edu.cn";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function checkCookie(tgc) {
    console.log('🔍 检查Cookie有效性...');
    console.log('TGC:', tgc.substring(0, 20) + '...');
    
    try {
        const axiosInstance = axios.create({
            httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `TGC=${tgc}`
            },
            withCredentials: true,
            maxRedirects: 5,
            timeout: 15000
        });

        console.log('\n1️⃣ SSO跳转...');
        await axiosInstance.get(`${CAS_URL}/login?service=${JWXT_URL}/jsxsd/sso.jsp`);
        console.log('   ✅ SSO通过');

        console.log('\n2️⃣ 访问主页...');
        await axiosInstance.get(`${JWXT_URL}/jsxsd/framework/xsMain.jsp`);
        console.log('   ✅ 主页访问成功');

        console.log('\n3️⃣ 获取课表...');
        const resp = await axiosInstance.get(`${JWXT_URL}/jsxsd/xskb/xskb_list.do`);
        
        if (resp.status === 200 && resp.data.includes('<title>学期理论课表</title>')) {
            console.log('   ✅ 课表获取成功');
            console.log('\n✨ Cookie有效！');
            return true;
        } else {
            console.log('   ❌ 响应异常');
            console.log('\n❌ Cookie可能无效');
            return false;
        }
    } catch (error) {
        console.error('\n❌ 检查失败:', error.message);
        return false;
    }
}

const tgc = process.argv[2];
if (!tgc) {
    console.log('用法: node scripts/check-cookie.js <TGC>');
    process.exit(1);
}

checkCookie(tgc);


