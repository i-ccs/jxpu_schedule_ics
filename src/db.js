// ============= db.js - 数据库操作模块 (添加邮箱和保活支持) =============
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
                user_id TEXT,
                username TEXT,
                email TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_sync TIMESTAMP,
                last_keepalive TIMESTAMP,
                cookie_valid INTEGER DEFAULT 1,
                cookie_expired_at TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('❌ 数据库初始化失败:', err);
                    reject(err);
                } else {
                    console.log('✅ 数据库初始化成功');
                    
                    // 检查是否需要添加email列（兼容旧数据库）
                    db.all("PRAGMA table_info(users)", (err, columns) => {
                        if (!err) {
                            const hasEmail = columns.some(col => col.name === 'email');
                            const hasKeepalive = columns.some(col => col.name === 'last_keepalive');
                            
                            if (!hasEmail) {
                                db.run("ALTER TABLE users ADD COLUMN email TEXT", (err) => {
                                    if (!err) console.log('✅ 已添加 email 列');
                                });
                            }
                            
                            if (!hasKeepalive) {
                                db.run("ALTER TABLE users ADD COLUMN last_keepalive TIMESTAMP", (err) => {
                                    if (!err) console.log('✅ 已添加 last_keepalive 列');
                                });
                            }
                        }
                    });
                    
                    resolve();
                }
            });
        });
    });
}

/**
 * 根据用户ID查找已存在的token
 */
function findUserByUserId(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT token, semester_start, cookie_valid FROM users WHERE user_id = ? AND cookie_valid = 1',
            [userId],
            (err, row) => {
                if (err) {
                    console.error('❌ 查询用户失败:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            }
        );
    });
}

/**
 * 根据用户名查找已存在的token
 */
function findUserByUsername(username) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT token, semester_start, cookie_valid FROM users WHERE username = ? AND cookie_valid = 1',
            [username],
            (err, row) => {
                if (err) {
                    console.error('❌ 查询用户失败:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            }
        );
    });
}

/**
 * 保存用户信息（包含邮箱）
 */
function saveUser(token, cookies, semesterStart, userId = null, username = null, email = null) {
    return new Promise((resolve, reject) => {
        const cookiesJson = JSON.stringify(cookies);
        db.run(
            `INSERT OR REPLACE INTO users (token, cookies, semester_start, user_id, username, email, cookie_valid) 
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [token, cookiesJson, semesterStart, userId, username, email],
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
 * 更新用户邮箱
 */
function updateUserEmail(token, email) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE users SET email = ? WHERE token = ?',
            [email, token],
            function(err) {
                if (err) {
                    console.error('❌ 更新邮箱失败:', err);
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('用户不存在'));
                } else {
                    console.log('✅ 邮箱已更新');
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
            'SELECT cookies, semester_start, cookie_valid, user_id, username, email, last_keepalive FROM users WHERE token = ?',
            [token],
            (err, row) => {
                if (err) {
                    console.error('❌ 查询用户失败:', err);
                    reject(err);
                } else if (row) {
                    resolve({
                        cookies: JSON.parse(row.cookies),
                        semesterStart: row.semester_start,
                        cookieValid: row.cookie_valid,
                        userId: row.user_id,
                        username: row.username,
                        email: row.email,
                        lastKeepalive: row.last_keepalive
                    });
                } else {
                    resolve(null);
                }
            }
        );
    });
}

/**
 * 获取所有有效用户（用于批量保活）
 */
function getAllValidUsers() {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT token, user_id, username, email, cookies, last_keepalive FROM users WHERE cookie_valid = 1',
            (err, rows) => {
                if (err) {
                    console.error('❌ 查询用户列表失败:', err);
                    reject(err);
                } else {
                    const users = rows.map(row => ({
                        token: row.token,
                        userId: row.user_id,
                        username: row.username,
                        email: row.email,
                        cookies: JSON.parse(row.cookies),
                        lastKeepalive: row.last_keepalive
                    }));
                    resolve(users);
                }
            }
        );
    });
}

/**
 * 删除用户
 */
function deleteUser(token) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM users WHERE token = ?', [token], function(err) {
            if (err) {
                console.error('❌ 删除用户失败:', err);
                reject(err);
            } else if (this.changes === 0) {
                reject(new Error('用户不存在'));
            } else {
                console.log('✅ 用户已从数据库删除');
                resolve();
            }
        });
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
 * 更新保活时间和cookies
 */
function updateKeepaliveTime(token, cookies = null) {
    return new Promise((resolve, reject) => {
        if (cookies) {
            const cookiesJson = JSON.stringify(cookies);
            db.run(
                'UPDATE users SET last_keepalive = CURRENT_TIMESTAMP, cookies = ?, cookie_valid = 1 WHERE token = ?',
                [cookiesJson, token],
                (err) => {
                    if (err) {
                        console.error('❌ 更新保活时间失败:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        } else {
            db.run(
                'UPDATE users SET last_keepalive = CURRENT_TIMESTAMP, cookie_valid = 1 WHERE token = ?',
                [token],
                (err) => {
                    if (err) {
                        console.error('❌ 更新保活时间失败:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        }
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
    deleteUser,
    findUserByUserId,
    findUserByUsername,
    updateUserEmail,
    getAllValidUsers,
    updateLastSync,
    updateKeepaliveTime,
    markCookieInvalid,
    closeDB
};