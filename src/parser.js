// ============= parser.js - 课表解析模块 (优化版) =============
const cheerio = require('cheerio');

/**
 * 解析课表HTML
 * @param {string} html - 课表HTML
 * @param {string} semesterStart - 学期开始日期 (YYYY-MM-DD)
 * @returns {Array} 课程数组
 */
function parseSchedule(html, semesterStart) {
    const $ = cheerio.load(html);
    const courses = [];

    // 节次时间映射
    const lessonTimes = {
        1: ['08:20', '10:00'],
        2: ['10:20', '12:00'],
        3: ['14:00', '15:40'],
        4: ['16:00', '17:35'],
        5: ['17:40', '19:20'],
        6: ['19:30', '21:10']
    };

    const semesterStartDate = new Date(semesterStart);
    const table = $('table.Nsb_r_list.Nsb_table');
    if (!table.length) return courses;

    const rows = table.find('tr').slice(1); // 跳过表头

    rows.each((rowIdx, row) => {
        const cells = $(row).find('td');
        
        cells.each((weekday, cell) => {
            const courseElems = $(cell).find('.kbcontent, p[title]');
            
            courseElems.each((_, elem) => {
                const title = $(elem).attr('title') || $(elem).html();
                if (!title) return;
                    
                const info = parseCourseInfo(title);
                if (!info) return;

                const weeks = parseWeeks(info.time);
                if (!weeks.length) return;

                const lessonNum = parseLesson(info.time, rowIdx + 1);
                if (!lessonTimes[lessonNum]) return;

                const [startTimeStr, endTimeStr] = lessonTimes[lessonNum];

                // 生成每周的课程
                weeks.forEach(week => {
                    const daysOffset = (week - 1) * 7 + weekday;
                    const courseDate = new Date(semesterStartDate);
                    courseDate.setDate(courseDate.getDate() + daysOffset);

                    const [startHour, startMin] = startTimeStr.split(':');
                    const [endHour, endMin] = endTimeStr.split(':');

                    const startTime = new Date(courseDate);
                    startTime.setHours(parseInt(startHour), parseInt(startMin), 0);

                    const endTime = new Date(courseDate);
                    endTime.setHours(parseInt(endHour), parseInt(endMin), 0);

                    courses.push({
                        name: info.name,
                        location: info.location || '',
                        teacher: info.teacher || '',
                        week,
                        startTime,
                        endTime
                    });
                });
            });
        });
    });

    return courses;
}

/**
 * 解析课程信息
 * @param {string} text - 课程信息文本
 * @returns {object|null} 课程信息对象
 */
function parseCourseInfo(text) {
    const lines = text.split(/<br\s*\/?>/i)
        .map(line => line.trim())
        .filter(line => line);

    if (lines.length < 3) return null;

    const info = {};
    
    // 优化课程名称解析：先解码 HTML 实体，再移除标签
    info.name = cleanCourseName(lines[0]);

    const teacherMatch = lines[1].match(/<font[^>]*>(.*?)<\/font>/i);
    info.teacher = teacherMatch ? teacherMatch[1] : lines[1].replace(/<[^>]*>/g, '');

    const timeMatch = lines[2].match(/<font[^>]*>(.*?)<\/font>/i);
    info.time = timeMatch ? timeMatch[1] : lines[2].replace(/<[^>]*>/g, '');

    if (lines[3]) {
        const locationMatch = lines[3].match(/<font[^>]*>(.*?)<\/font>/i);
        info.location = locationMatch ? locationMatch[1] : lines[3].replace(/<[^>]*>/g, '');
    }

    return info.name ? info : null;
}

/**
 * 清理课程名称（优化版）
 * @param {string} rawName - 原始课程名称
 * @returns {string} 清理后的课程名称
 */
function cleanCourseName(rawName) {
    if (!rawName) return '';
    
    // 1. 先移除所有 HTML 标签
    let cleaned = rawName.replace(/<[^>]*>/g, '');
    
    // 2. 解码常见的 HTML 实体
    cleaned = cleaned
        .replace(/&nbsp;/gi, ' ')     // 不间断空格
        .replace(/&amp;/gi, '&')       // &
        .replace(/&lt;/gi, '<')        // <
        .replace(/&gt;/gi, '>')        // >
        .replace(/&quot;/gi, '"')      // "
        .replace(/&#39;/gi, "'")       // '
        .replace(/&apos;/gi, "'")      // '
        .replace(/&#(\d+);/gi, (match, dec) => String.fromCharCode(dec))  // 数字实体
        .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));  // 十六进制实体
    
    // 3. 去除首尾空白
    cleaned = cleaned.trim();
    
    // 4. 将多个连续空格替换为单个空格
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    return cleaned;
}

/**
 * 解析周次信息
 * @param {string} timeStr - 时间字符串
 * @returns {Array<number>} 周次数组
 */
function parseWeeks(timeStr) {
    const weeks = [];
    const weekMatch = timeStr.match(/^(.+?)\(周\)/);
    if (!weekMatch) return weeks;

    const segments = weekMatch[1].split(',');

    segments.forEach(seg => {
        seg = seg.trim();
        if (seg.includes('-')) {
            const [start, end] = seg.split('-').map(n => parseInt(n));
            for (let i = start; i <= end; i++) {
                weeks.push(i);
            }
        } else if (/^\d+$/.test(seg)) {
            weeks.push(parseInt(seg));
        }
    });

    return weeks;
}

/**
 * 解析节次信息
 * @param {string} timeStr - 时间字符串
 * @param {number} defaultValue - 默认值
 * @returns {number} 节次编号
 */
function parseLesson(timeStr, defaultValue) {
    const match = timeStr.match(/\[?(\d+)-(\d+)\]?节/);
    if (match) {
        return Math.ceil(parseInt(match[1]) / 2);
    }
    return defaultValue;
}

module.exports = {
    parseSchedule,
    cleanCourseName
};