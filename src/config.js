// ============= config.js - 配置加载模块 =============
const fs = require('fs');
const path = require('path');

/**
 * 简易的 .env 文件加载器（无需额外依赖）
 */
function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env');
    
    try {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            
            envContent.split('\n').forEach(line => {
                // 跳过空行和注释
                if (!line || line.trim().startsWith('#')) {
                    return;
                }
                
                // 解析 KEY=VALUE
                const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
                if (match) {
                    const key = match[1];
                    let value = match[2].trim();
                    
                    // 移除引号
                    value = value.replace(/^["']|["']$/g, '');
                    
                    // 只在未设置时才设置
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            });
            
            console.log('✅ 环境变量已从 .env 文件加载');
        } else {
            console.log('⚠️  .env 文件不存在，使用默认配置');
        }
    } catch (error) {
        console.error('❌ 加载 .env 文件失败:', error.message);
    }
}

// 加载环境变量
loadEnv();

/**
 * 配置对象
 */
const config = {
    // 服务器配置
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // 管理员密码
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    
    // 数据库配置
    dbPath: process.env.DB_PATH || 'schedule_server.db',
    
    // 缓存配置
    cacheDir: process.env.CACHE_DIR || 'cache',
    
    // 日志配置
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // 更新时间配置（从环境变量读取，格式: 5,13,21）
    updateHours: process.env.UPDATE_HOURS 
        ? process.env.UPDATE_HOURS.split(',').map(h => parseInt(h.trim(), 10))
        : [5, 13, 21]
};

/**
 * 验证配置
 */
function validateConfig() {
    const warnings = [];
    
    // 检查管理员密码强度
    if (config.adminPassword === 'admin123') {
        warnings.push('⚠️  使用默认管理员密码，不安全！请设置 ADMIN_PASSWORD 环境变量');
    } else if (config.adminPassword.length < 8) {
        warnings.push('⚠️  管理员密码过短，建议至少 8 位');
    }
    
    // 检查端口
    if (config.port < 1 || config.port > 65535) {
        warnings.push('❌ 端口号无效:', config.port);
    }
    
    // 显示警告
    if (warnings.length > 0) {
        console.log('\n配置警告:');
        warnings.forEach(w => console.log(w));
        console.log();
    }
    
    return warnings.length === 0;
}

/**
 * 显示配置信息
 */
function showConfig() {
    console.log('='.repeat(60));
    console.log('📋 当前配置:');
    console.log('='.repeat(60));
    console.log('端口:', config.port);
    console.log('环境:', config.nodeEnv);
    console.log('管理员密码:', config.adminPassword === 'admin123' ? '⚠️  默认密码' : '***已设置***');
    console.log('数据库路径:', config.dbPath);
    console.log('缓存目录:', config.cacheDir);
    console.log('更新时间:', config.updateHours.join(', ') + ' 点');
    console.log('='.repeat(60));
    console.log();
}

// 验证配置
validateConfig();

module.exports = {
    config,
    loadEnv,
    validateConfig,
    showConfig
};