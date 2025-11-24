// ============= server.js - Hono 主服务器 (支持缓存定时更新 + Cookie保活) =============
const { Hono } = require('hono');
const { serve } = require('@hono/node-server');

// 加载配置
const { config, showConfig } = require('./config');

// 导入模块
const router = require('./routers/router');
const db = require('./db');
const cacheManager = require('./cache-manager');
const keepalive = require('./keepalive'); // 🆕 Cookie保活模块

const app = new Hono();

// 挂载路由
app.route('/', router);

// ============= 启动服务 =============
async function start() {
    try {
        // 显示配置信息
        showConfig();
        
        // 初始化数据库
        await db.initDB();
        
        // 初始化缓存目录
        await cacheManager.initCacheDir();
        
        console.log('='.repeat(60));
        console.log('📅 课表订阅服务启动成功 (Hono + CDN 缓存 + 邮件通知)');
        console.log('='.repeat(60));
        console.log(`🌐 访问地址: http://localhost:${config.port}/login`);
        console.log(`📊 统计接口: http://localhost:${config.port}/api/stats`);
        console.log(`📦 缓存统计: http://localhost:${config.port}/api/cache/stats`);
        console.log('='.repeat(60));
        
        // 启动定时任务
        console.log('⏰ 定时更新配置:');
        console.log(`   - 缓存更新: 每天 ${cacheManager.UPDATE_HOURS.join(', ')} 点`);
        cacheManager.startScheduledUpdate();
        
        // 🆕 启动 Cookie 保活定时任务
        if (config.keepalive.enabled) {
            console.log(`   - Cookie保活: 每 ${config.keepalive.interval} 小时检查一次`);
            keepalive.startKeepaliveSchedule();
        } else {
            console.log('   - Cookie保活: ❌ 已禁用');
        }
        
        // 🆕 检查邮件配置
        if (config.smtp.user && config.smtp.pass) {
            console.log(`📧 邮件通知: ✅ 已配置 (${config.smtp.host}:${config.smtp.port})`);
        } else {
            console.log('📧 邮件通知: ⚠️  未配置，Cookie过期通知功能将无法使用');
            console.log('   请在 .env 文件中配置 SMTP_* 相关变量');
        }
        
        console.log('='.repeat(60));
        
        // 🆕 提供快捷命令提示
        console.log('\n💡 管理命令:');
        console.log('   - 查看统计: curl http://localhost:' + config.port + '/api/stats');
        console.log('   - 手动保活: curl -X POST http://localhost:' + config.port + '/api/keepalive/check-all \\');
        console.log('               -H "Content-Type: application/json" \\');
        console.log('               -d \'{"password":"' + (config.adminPassword === 'admin123' ? 'admin123' : 'your_password') + '"}\'');
        console.log('='.repeat(60));
        console.log();
        
        serve({
            fetch: app.fetch,
            port: config.port
        });
        
    } catch (error) {
        console.error('启动失败:', error);
        process.exit(1);
    }
}

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('\n👋 正在关闭服务...');
    
    try {
        await db.closeDB();
        console.log('✅ 数据库已关闭');
    } catch (error) {
        console.error('❌ 关闭数据库失败:', error);
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 收到终止信号，正在关闭服务...');
    
    try {
        await db.closeDB();
        console.log('✅ 数据库已关闭');
    } catch (error) {
        console.error('❌ 关闭数据库失败:', error);
    }
    
    process.exit(0);
});

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的 Promise 拒绝:', reason);
    console.error('   Promise:', promise);
});

start();