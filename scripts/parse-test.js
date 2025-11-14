// =====================================
// 文件: scripts/parse-test.js
// 用途: 测试课表解析
// 使用: node scripts/parse-test.js <html文件路径>
// =====================================


const fs = require('fs');
const cheerio = require('cheerio');

function parseSchedule(html, semesterStart) {
    const $ = cheerio.load(html);
    const courses = [];

    const lessonTimes = {
        1: ['08:20', '10:00'],
        2: ['10:20', '12:00'],
        3: ['14:00', '15:40'],
        4: ['16:00', '17:35'],
        5: ['17:40', '19:20'],
        6: ['19:30', '21:10']
    };

    const table = $('table.Nsb_r_list.Nsb_table');
    console.log('找到表格:', table.length);
    
    if (!table.length) {
        console.log('❌ 未找到课表表格');
        return courses;
    }

    const rows = table.find('tr').slice(1);
    console.log('行数:', rows.length);

    rows.each((rowIdx, row) => {
        const cells = $(row).find('td');
        console.log(`第${rowIdx + 1}行，单元格数:`, cells.length);
        
        cells.each((weekday, cell) => {
            const courseElems = $(cell).find('.kbcontent, p[title]');
            if (courseElems.length > 0) {
                console.log(`  周${weekday + 1} 找到课程:`, courseElems.length);
                courseElems.each((_, elem) => {
                    const title = $(elem).attr('title') || $(elem).html();
                    console.log('    课程信息:', title.substring(0, 50) + '...');
                });
            }
        });
    });

    return courses;
}

const htmlFile = process.argv[2];
if (!htmlFile) {
    console.log('用法: node scripts/parse-test.js <html文件路径>');
    process.exit(1);
}

const html = fs.readFileSync(htmlFile, 'utf-8');
console.log('HTML长度:', html.length);
parseSchedule(html, '2025-09-08');
*/