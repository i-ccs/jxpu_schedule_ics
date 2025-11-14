// =====================================
// 文件: scripts/test-api.js
// 用途: 测试所有API接口
// 使用: node scripts/test-api.js
// =====================================

const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const BASE_URL = 'http://localhost:3000';
let savedToken = '';

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function testRegister() {
    console.log('\n📝 测试1: 注册新用户');
    console.log('='.repeat(50));
    
    const tgc = await ask('请输入TGC Cookie: ');
    const semester = await ask('学期开始日期 (默认: 2025-09-08): ') || '2025-09-08';
    
    try {
        const res = await axios.post(`${BASE_URL}/api/register`, {
            tgc: tgc.trim(),
            semester_start: semester
        });
        
        console.log('✅ 注册成功!');
        console.log('Token:', res.data.token);
        savedToken = res.data.token;
        
        return res.data.token;
    } catch (error) {
        console.error('❌ 注册失败:', error.response?.data || error.message);
        return null;
    }
}

async function testGetSchedule(token) {
    console.log('\n📅 测试2: 获取课表');
    console.log('='.repeat(50));
    
    if (!token) {
        token = await ask('请输入Token: ');
    }
    
    try {
        const res = await axios.get(`${BASE_URL}/schedule/${token}`);
        console.log('✅ 课表获取成功!');
        console.log('大小:', Math.round(res.data.length / 1024), 'KB');
        console.log('类型:', res.headers['content-type']);
        
        // 保存到文件
        const fs = require('fs');
        fs.writeFileSync('debug_schedule.ics', res.data);
        console.log('💾 已保存到: debug_schedule.ics');
        
    } catch (error) {
        console.error('❌ 获取失败:', error.response?.data || error.message);
    }
}

async function testUpdateCookie(token) {
    console.log('\n🔄 测试3: 更新Cookie');
    console.log('='.repeat(50));
    
    if (!token) {
        token = await ask('请输入Token: ');
    }
    
    const newTgc = await ask('请输入新的TGC Cookie: ');
    
    try {
        const res = await axios.post(`${BASE_URL}/api/update-cookie`, {
            token: token.trim(),
            tgc: newTgc.trim()
        });
        
        console.log('✅ Cookie更新成功!');
        console.log('消息:', res.data.message);
        
    } catch (error) {
        console.error('❌ 更新失败:', error.response?.data || error.message);
    }
}

async function testStats() {
    console.log('\n📊 测试4: 统计信息');
    console.log('='.repeat(50));
    
    try {
        const res = await axios.get(`${BASE_URL}/api/stats`);
        console.log('✅ 统计获取成功!');
        console.log('总用户数:', res.data.total_users);
        console.log('活跃用户:', res.data.active_users);
        console.log('有效Cookie:', res.data.valid_cookies);
        
    } catch (error) {
        console.error('❌ 获取失败:', error.response?.data || error.message);
    }
}

async function testInvalidToken() {
    console.log('\n🚫 测试5: 无效Token');
    console.log('='.repeat(50));
    
    try {
        await axios.get(`${BASE_URL}/schedule/invalid-token-12345`);
        console.log('❌ 应该返回404但没有');
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('✅ 正确返回404');
        } else {
            console.error('❌ 意外错误:', error.message);
        }
    }
}

async function main() {
    console.log('🧪 API测试工具');
    console.log('='.repeat(50));
    console.log('确保服务器已在', BASE_URL, '运行');
    
    const action = await ask('\n选择操作:\n1. 完整测试\n2. 仅注册\n3. 仅获取课表\n4. 仅更新Cookie\n5. 仅统计\n6. 测试无效Token\n请选择 (1-6): ');
    
    switch (action) {
        case '1':
            const token = await testRegister();
            if (token) {
                await testGetSchedule(token);
                await testUpdateCookie(token);
            }
            await testStats();
            await testInvalidToken();
            break;
        case '2':
            await testRegister();
            break;
        case '3':
            await testGetSchedule(savedToken);
            break;
        case '4':
            await testUpdateCookie(savedToken);
            break;
        case '5':
            await testStats();
            break;
        case '6':
            await testInvalidToken();
            break;
        default:
            console.log('❌ 无效选择');
    }
    
    rl.close();
    console.log('\n✨ 测试完成!');
}

main().catch(console.error);
