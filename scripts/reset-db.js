// =====================================
// 文件: scripts/reset-db.js
// 用途: 清空数据库
// 使用: node scripts/reset-db.js
// =====================================


const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('⚠️  确定要清空数据库吗? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes') {
        const db = new sqlite3.Database('schedule_server.db');
        
        db.run('DELETE FROM users', (err) => {
            if (err) {
                console.error('❌ 清空失败:', err);
            } else {
                console.log('✅ 数据库已清空');
            }
            db.close();
        });
    } else {
        console.log('❌ 操作已取消');
    }
    rl.close();
});
