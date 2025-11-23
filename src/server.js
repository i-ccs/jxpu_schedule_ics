// ============= server.js - Hono 主服务器 (支持缓存定时更新) =============
const { Hono } = require('hono');
const { serve } = require('@hono/node-server');

// 🆕 加载配置
const { config, showConfig } = require('./config');

// 导入模块
const router = require('./routers/router');
const db = require('./db');
const cacheManager = require('./cache-manager'); // 🆕 缓存管理器

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
        
        // 🆕 初始化缓存目录
        await cacheManager.initCacheDir();
        
        console.log('='.repeat(60));
        console.log('📅 课表订阅服务启动成功 (Hono + CDN 缓存)');
        console.log('='.repeat(60));
        console.log(`🌐 访问地址: http://localhost:${config.port}/login`);
        console.log(`📊 统计接口: http://localhost:${config.port}/api/stats`);
        console.log(`📦 缓存统计: http://localhost:${config.port}/api/cache/stats`);
        console.log('='.repeat(60));
        
        // 🆕 启动定时任务
        console.log(`⏰ 定时更新配置: 每天 ${cacheManager.UPDATE_HOURS.join(', ')} 点更新`);
        cacheManager.startScheduledUpdate();
        
        console.log('='.repeat(60));
        
        serve({
            fetch: app.fetch,
            port: config.port
        });
        
    } catch (error) {
        console.error('启动失败:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 正在关闭服务...');
    process.exit(0);
});

start();