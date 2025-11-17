// ============= server.js - Hono 主服务器 =============
const { Hono } = require('hono');
const { serve } = require('@hono/node-server');

// 导入模块
const router = require('./routers/router');
const db = require('./db');

const app = new Hono();

// 挂载路由
app.route('/', router);

const PORT = 3000;

// ============= 启动服务 =============
async function start() {
    try {
        await db.initDB();
        
        console.log('='.repeat(60));
        console.log('📅 课表订阅服务启动成功 (Hono + Fetch API)');
        console.log('='.repeat(60));
        console.log(`🌐 访问地址: http://localhost:${PORT}`);
        console.log(`📊 统计接口: http://localhost:${PORT}/api/stats`);
        console.log('='.repeat(60));
        console.log('💡 功能特性:');
        console.log('   - 二维码扫码登录 (5分钟有效期)');
        console.log('   - Fetch API 替代 Axios');
        console.log('   - Hono 框架路由');
        console.log('   - SESSION Cookie 自动重试 (最多3次)');
        console.log('   - 完整 Cookie 传递链');
        console.log('='.repeat(60));
        
        serve({
            fetch: app.fetch,
            port: PORT
        });
        
    } catch (error) {
        console.error('启动失败:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 正在关闭服务...');
    // Hono 会自动处理清理
    process.exit(0);
});

start();