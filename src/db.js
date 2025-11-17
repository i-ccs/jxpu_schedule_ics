// ============= db.js - 数据库操作模块 =============
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = "schedule_server.db";

// 数据库实例
const db = new sqlite3.Database(DB_FILE);

/**
 * 初始化数据库
 */
function initDB() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT UNIQUE NOT NULL,
                cookies TEXT NOT NULL,
                semester_start TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_sync TIMESTAMP,
                cookie_valid INTEGER DEFAULT 1,
                cookie_expired_at TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('❌ 数据库初始化失败:', err);
                    reject(err);
                } else {
                    console.log('✅ 数据库初始化成功');
                    resolve();
                }
            });
        });
    });
}

/**
 * 保存用户信息
 */
function saveUser(token, cookies, semesterStart) {
    return new Promise((resolve, reject) => {
        const cookiesJson = JSON.stringify(cookies);
        db.run(
            `INSERT OR REPLACE INTO users (token, cookies, semester_start, cookie_valid) 
             VALUES (?, ?, ?, 1)`,
            [token, cookiesJson, semesterStart],
            (err) => {
                if (err) {
                    console.error('❌ 保存用户失败:', err);
                    reject(err);
                } else {
                    console.log('✅ 用户信息已保存');
                    resolve();
                }
            }
        );
    });
}

/**
 * 获取用户信息
 */
function getUser(token) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT cookies, semester_start, cookie_valid FROM users WHERE token = ?',
            [token],
            (err, row) => {
                if (err) {
                    console.error('❌ 查询用户失败:', err);
                    reject(err);
                } else if (row) {
                    resolve({
                        cookies: JSON.parse(row.cookies),
                        semesterStart: row.semester_start,
                        cookieValid: row.cookie_valid
                    });
                } else {
                    resolve(null);
                }
            }
        );
    });
}

/**
 * 更新最后同步时间
 */
function updateLastSync(token) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE users SET last_sync = CURRENT_TIMESTAMP, cookie_valid = 1 WHERE token = ?',
            [token],
            (err) => {
                if (err) {
                    console.error('❌ 更新同步时间失败:', err);
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

/**
 * 标记 Cookie 为无效
 */
function markCookieInvalid(token) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE users SET cookie_valid = 0, cookie_expired_at = CURRENT_TIMESTAMP WHERE token = ?',
            [token],
            (err) => {
                if (err) {
                    console.error('❌ 标记Cookie失败:', err);
                    reject(err);
                } else {
                    console.log('⚠️  Cookie已标记为无效');
                    resolve();
                }
            }
        );
    });
}

/**
 * 关闭数据库连接
 */
function closeDB() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                console.error('❌ 关闭数据库失败:', err);
                reject(err);
            } else {
                console.log('✅ 数据库已关闭');
                resolve();
            }
        });
    });
}

module.exports = {
    db,
    initDB,
    saveUser,
    getUser,
    updateLastSync,
    markCookieInvalid,
    closeDB
};