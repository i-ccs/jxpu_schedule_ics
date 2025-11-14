// =====================================
// 文件: scripts/db-viewer.js
// 用途: 查看数据库内容
// 使用: node scripts/db-viewer.js
// =====================================


const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('schedule_server.db');

console.log('📊 数据库查看器');
console.log('='.repeat(60));

db.all('SELECT * FROM users', (err, rows) => {
    if (err) {
        console.error('❌ 查询失败:', err);
        return;
    }
    
    if (rows.length === 0) {
        console.log('📭 数据库为空');
        db.close();
        return;
    }
    
    console.log(`找到 ${rows.length} 个用户:\n`);
    
    rows.forEach((row, idx) => {
        console.log(`用户 ${idx + 1}:`);
        console.log('  ID:', row.id);
        console.log('  Token:', row.token.substring(0, 20) + '...');
        console.log('  学期开始:', row.semester_start);
        console.log('  创建时间:', row.created_at);
        console.log('  最后同步:', row.last_sync || '未同步');
        console.log('  Cookie状态:', row.cookie_valid ? '✅ 有效' : '❌ 无效');
        if (row.cookie_expired_at) {
            console.log('  过期时间:', row.cookie_expired_at);
        }
        
        const cookies = JSON.parse(row.cookies);
        console.log('  TGC:', cookies.TGC.substring(0, 20) + '...');
        console.log('-'.repeat(60));
    });
    
    db.close();
});
