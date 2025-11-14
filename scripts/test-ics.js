#!/usr/bin/env node
/**
 * 测试ICS日历生成
 * 使用: node scripts/test-ics.js
 */

const ical = require('ical-generator').default;
const fs = require('fs');

console.log('🧪 测试ICS日历生成');
console.log('='.repeat(60));

try {
    // 创建日历
    const calendar = ical({
        name: '我的课程表',
        prodId: {
            company: '江西职业技术大学',
            product: '课表订阅',
            language: 'CN'
        },
        timezone: 'Asia/Shanghai',
        ttl: 3600
    });

    console.log('✅ 日历对象创建成功');

    // 添加测试课程1
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 20, 0, 0);

    const endTime1 = new Date(tomorrow);
    endTime1.setHours(10, 0, 0, 0);

    const event1 = calendar.createEvent({
        start: tomorrow,
        end: endTime1,
        summary: '高等数学',
        description: '教师: 张老师\n第1周',
        location: '教学楼A101',
        uid: `test-math-${Date.now()}@jxpu.edu.cn`
    });

    // 添加提醒
    event1.createAlarm({
        type: 'display',
        trigger: 35 * 60, // 35分钟前
        description: '高等数学 即将开始'
    });

    console.log('✅ 课程1: 高等数学');

    // 添加测试课程2
    const afternoon = new Date(tomorrow);
    afternoon.setHours(14, 0, 0, 0);
    
    const endTime2 = new Date(afternoon);
    endTime2.setHours(15, 40, 0, 0);

    const event2 = calendar.createEvent({
        start: afternoon,
        end: endTime2,
        summary: '大学英语',
        description: '教师: 李老师\n第1周',
        location: '教学楼B203',
        uid: `test-english-${Date.now()}@jxpu.edu.cn`
    });

    event2.createAlarm({
        type: 'display',
        trigger: 35 * 60,
        description: '大学英语 即将开始'
    });

    console.log('✅ 课程2: 大学英语');

    // 添加测试课程3
    const nextWeek = new Date(tomorrow);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(10, 20, 0, 0);

    const endTime3 = new Date(nextWeek);
    endTime3.setHours(12, 0, 0, 0);

    const event3 = calendar.createEvent({
        start: nextWeek,
        end: endTime3,
        summary: '计算机基础',
        description: '教师: 王老师\n第2周',
        location: '实验楼C301',
        uid: `test-computer-${Date.now()}@jxpu.edu.cn`
    });

    event3.createAlarm({
        type: 'display',
        trigger: 35 * 60,
        description: '计算机基础 即将开始'
    });

    console.log('✅ 课程3: 计算机基础');
    console.log('');

    // 生成ICS
    const icsData = calendar.toString();
    console.log('✅ ICS数据生成成功');
    console.log(`   大小: ${icsData.length} 字节`);
    console.log('');

    // 显示ICS预览
    console.log('📄 ICS内容预览:');
    console.log('-'.repeat(60));
    const lines = icsData.split('\n');
    lines.slice(0, 30).forEach(line => console.log(line));
    if (lines.length > 30) {
        console.log('...');
        console.log(`(共 ${lines.length} 行)`);
    }
    console.log('-'.repeat(60));
    console.log('');

    // 保存到文件
    fs.writeFileSync('test-schedule.ics', icsData);
    console.log('✅ ICS文件已保存到: test-schedule.ics');
    console.log('');

    // 使用说明
    console.log('📱 如何使用这个测试文件:');
    console.log('');
    console.log('  方法1: 直接打开');
    console.log('    • Windows: 双击 test-schedule.ics (用Outlook打开)');
    console.log('    • Mac: 双击 test-schedule.ics (用日历打开)');
    console.log('    • Linux: 用 Thunderbird/Evolution 打开');
    console.log('');
    console.log('  方法2: 导入到在线日历');
    console.log('    • Google Calendar: 设置 → 导入/导出 → 导入');
    console.log('    • Outlook.com: 日历 → 添加日历 → 从文件上传');
    console.log('    • iCloud Calendar: 文件 → 导入');
    console.log('');
    console.log('  方法3: 通过URL订阅 (需要先部署服务器)');
    console.log('    • 启动服务: npm run dev');
    console.log('    • 生成订阅链接');
    console.log('    • 添加到日历应用');
    console.log('');

    // 验证检查
    console.log('✅ 验证检查:');
    console.log('');
    console.log('  打开文件后应该看到:');
    console.log('    ✓ 3个课程事件');
    console.log('    ✓ 课程名称、时间、地点正确显示');
    console.log('    ✓ 每个课程有35分钟前的提醒');
    console.log('    ✓ 课程描述包含教师和周次信息');
    console.log('');

    console.log('🎉 测试完成！');
    console.log('');
    console.log('💡 下一步:');
    console.log('   1. 打开 test-schedule.ics 验证格式');
    console.log('   2. 测试SSO登录: npm run test:sso 你的TGC');
    console.log('   3. 启动服务器: npm run dev');
    console.log('');

} catch (error) {
    console.error('');
    console.error('❌ 测试失败:', error.message);
    console.error('');
    console.error('错误详情:');
    console.error(error);
    console.error('');
    console.error('💡 可能的原因:');
    console.error('   1. ical-generator 未安装: npm install ical-generator');
    console.error('   2. Node.js 版本过低: 需要 >= 16.0.0');
    console.error('   3. 权限问题: 无法写入文件');
    console.error('');
    process.exit(1);
}