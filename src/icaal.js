// ============= ical.js - ICS日历生成模块 =============
const ical = require('ical-generator').default;
const crypto = require('crypto');

/**
 * 生成ICS日历文件
 * @param {Array} courses - 课程数组
 * @returns {string} ICS文件内容
 */
function generateICS(courses) {
    const calendar = ical({
        name: '我的课程表',
        prodId: {
            company: '江西职业技术大学',
            product: '课表订阅',
            language: 'CN'
        },
        timezone: 'Asia/Shanghai',
        ttl: 3600 // 1小时刷新
    });

    courses.forEach(course => {
        const uid = `${course.startTime.getTime()}-${crypto.createHash('md5')
            .update(course.name)
            .digest('hex')
            .substring(0, 8)}@jxpu.edu.cn`;

        calendar.createEvent({
            start: course.startTime,
            end: course.endTime,
            summary: course.name,
            description: `教师: ${course.teacher}\n第${course.week}周`,
            location: course.location,
            uid: uid,
            alarms: [{
                type: 'display',
                trigger: 35 * 60, // 35分钟前提醒
                description: `${course.name} 即将开始`
            }]
        });
    });

    return calendar.toString();
}

module.exports = {
    generateICS
};
