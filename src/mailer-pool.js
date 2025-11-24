// ============= mailer-pool.js - 智能邮件池管理 =============
const nodemailer = require('nodemailer');
const { config } = require('./config');

class MailerPool {
    constructor() {
        this.pool = this.initPool();
        this.currentIndex = 0;
        this.dailyCount = new Map(); // 记录每个邮箱今日发送数
        this.hourlyCount = new Map(); // 记录每个邮箱每小时发送数
        this.lastResetDate = new Date().toDateString();
        this.lastResetHour = new Date().getHours();
        
        console.log(`📧 邮件池已初始化: ${this.pool.length} 个邮箱`);
    }
    
    /**
     * 初始化邮箱池
     */
    initPool() {
        try {
            // 尝试从环境变量解析邮箱池配置
            if (config.smtp.pool) {
                const poolConfig = JSON.parse(config.smtp.pool);
                
                if (Array.isArray(poolConfig) && poolConfig.length > 0) {
                    console.log(`✅ 使用邮箱池模式: ${poolConfig.length} 个邮箱`);
                    return poolConfig.map(cfg => ({
                        host: cfg.host,
                        port: cfg.port,
                        secure: cfg.port === 465,
                        user: cfg.user,
                        pass: cfg.pass,
                        dailyLimit: cfg.dailyLimit || 500,
                        hourlyLimit: cfg.hourlyLimit || 50
                    }));
                }
            }
            
            // 如果没有配置池，使用单一邮箱
            if (config.smtp.user && config.smtp.pass) {
                console.log('✅ 使用单一邮箱模式');
                return [{
                    host: config.smtp.host,
                    port: config.smtp.port,
                    secure: config.smtp.secure,
                    user: config.smtp.user,
                    pass: config.smtp.pass,
                    dailyLimit: 500,
                    hourlyLimit: 50
                }];
            }
            
            console.warn('⚠️  未配置邮箱，邮件功能将不可用');
            return [];
            
        } catch (error) {
            console.error('❌ 解析邮箱池配置失败:', error.message);
            
            // 降级到单一邮箱
            if (config.smtp.user) {
                return [{
                    host: config.smtp.host,
                    port: config.smtp.port,
                    secure: config.smtp.secure,
                    user: config.smtp.user,
                    pass: config.smtp.pass,
                    dailyLimit: 500,
                    hourlyLimit: 50
                }];
            }
            
            return [];
        }
    }
    
    /**
     * 重置每日计数
     */
    resetDailyCount() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.dailyCount.clear();
            this.lastResetDate = today;
            console.log('🔄 邮箱池每日计数已重置');
        }
    }
    
    /**
     * 重置每小时计数
     */
    resetHourlyCount() {
        const currentHour = new Date().getHours();
        if (currentHour !== this.lastResetHour) {
            this.hourlyCount.clear();
            this.lastResetHour = currentHour;
            console.log('🔄 邮箱池每小时计数已重置');
        }
    }
    
    /**
     * 检查邮箱是否可用
     */
    isMailerAvailable(mailConfig) {
        this.resetDailyCount();
        this.resetHourlyCount();
        
        const dailySent = this.dailyCount.get(mailConfig.user) || 0;
        const hourlySent = this.hourlyCount.get(mailConfig.user) || 0;
        
        return dailySent < mailConfig.dailyLimit && 
               hourlySent < mailConfig.hourlyLimit;
    }
    
    /**
     * 获取可用的邮箱配置
     */
    getAvailableMailer() {
        if (this.pool.length === 0) {
            return null;
        }
        
        // 轮询查找可用的邮箱
        for (let i = 0; i < this.pool.length; i++) {
            const index = (this.currentIndex + i) % this.pool.length;
            const mailConfig = this.pool[index];
            
            if (this.isMailerAvailable(mailConfig)) {
                this.currentIndex = (index + 1) % this.pool.length; // 移动到下一个
                return mailConfig;
            }
        }
        
        console.warn('⚠️  所有邮箱额度已用完');
        return null;
    }
    
    /**
     * 创建邮件传输器
     */
    createTransporter(mailConfig) {
        return nodemailer.createTransport({
            host: mailConfig.host,
            port: mailConfig.port,
            secure: mailConfig.secure,
            auth: {
                user: mailConfig.user,
                pass: mailConfig.pass
            }
        });
    }
    
    /**
     * 发送邮件
     */
    async sendMail(mailOptions) {
        const mailConfig = this.getAvailableMailer();
        
        if (!mailConfig) {
            throw new Error('没有可用的邮箱发送邮件，请稍后重试或联系管理员');
        }
        
        const transporter = this.createTransporter(mailConfig);
        
        // 设置发件人
        if (!mailOptions.from) {
            mailOptions.from = `"课表订阅服务" <${mailConfig.user}>`;
        }
        
        try {
            const info = await transporter.sendMail(mailOptions);
            
            // 更新发送计数
            const dailySent = this.dailyCount.get(mailConfig.user) || 0;
            const hourlySent = this.hourlyCount.get(mailConfig.user) || 0;
            
            this.dailyCount.set(mailConfig.user, dailySent + 1);
            this.hourlyCount.set(mailConfig.user, hourlySent + 1);
            
            console.log(
                `✅ 邮件已发送: ${mailConfig.user} → ${mailOptions.to} ` +
                `(今日: ${dailySent + 1}/${mailConfig.dailyLimit}, ` +
                `本小时: ${hourlySent + 1}/${mailConfig.hourlyLimit})`
            );
            
            return { success: true, messageId: info.messageId };
            
        } catch (error) {
            console.error(`❌ 邮件发送失败 (${mailConfig.user}):`, error.message);
            
            // 如果是认证失败，标记该邮箱不可用
            if (error.code === 'EAUTH') {
                console.error(`🚫 邮箱认证失败，已禁用: ${mailConfig.user}`);
                // 可以考虑从池中移除该邮箱
            }
            
            throw error;
        }
    }
    
    /**
     * 批量发送邮件（带延迟和重试）
     */
    async sendBatchMails(recipients, getMailOptions) {
        const results = {
            total: recipients.length,
            success: 0,
            failed: 0,
            errors: []
        };
        
        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            
            try {
                const mailOptions = getMailOptions(recipient);
                await this.sendMail(mailOptions);
                results.success++;
                
                // 添加延迟，避免被限流
                if (i < recipients.length - 1) {
                    await this.sleep(1000); // 每封邮件间隔1秒
                }
                
            } catch (error) {
                results.failed++;
                results.errors.push({
                    recipient: recipient.email || recipient,
                    error: error.message
                });
                
                console.error(`❌ 发送给 ${recipient.email || recipient} 失败:`, error.message);
            }
        }
        
        console.log(`📊 批量发送完成: 成功 ${results.success}/${results.total}`);
        
        return results;
    }
    
    /**
     * 延迟函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 获取邮箱池统计信息
     */
    getPoolStats() {
        this.resetDailyCount();
        this.resetHourlyCount();
        
        return this.pool.map(cfg => {
            const dailySent = this.dailyCount.get(cfg.user) || 0;
            const hourlySent = this.hourlyCount.get(cfg.user) || 0;
            
            return {
                email: cfg.user,
                host: cfg.host,
                dailySent,
                dailyLimit: cfg.dailyLimit,
                dailyRemaining: cfg.dailyLimit - dailySent,
                hourlySent,
                hourlyLimit: cfg.hourlyLimit,
                hourlyRemaining: cfg.hourlyLimit - hourlySent,
                available: this.isMailerAvailable(cfg)
            };
        });
    }
    
    /**
     * 获取总体统计
     */
    getTotalStats() {
        const stats = this.getPoolStats();
        
        return {
            totalMailers: stats.length,
            availableMailers: stats.filter(s => s.available).length,
            totalDailySent: stats.reduce((sum, s) => sum + s.dailySent, 0),
            totalDailyLimit: stats.reduce((sum, s) => sum + s.dailyLimit, 0),
            totalHourlySent: stats.reduce((sum, s) => sum + s.hourlySent, 0),
            totalHourlyLimit: stats.reduce((sum, s) => sum + s.hourlyLimit, 0),
            mailers: stats
        };
    }
    
    /**
     * 测试所有邮箱配置
     */
    async testAllMailers() {
        console.log('🔍 开始测试邮箱配置...');
        
        const results = [];
        
        for (const mailConfig of this.pool) {
            try {
                const transporter = this.createTransporter(mailConfig);
                await transporter.verify();
                
                console.log(`✅ ${mailConfig.user}: 配置正确`);
                results.push({
                    email: mailConfig.user,
                    status: 'success',
                    message: '配置正确'
                });
                
            } catch (error) {
                console.error(`❌ ${mailConfig.user}: ${error.message}`);
                results.push({
                    email: mailConfig.user,
                    status: 'error',
                    message: error.message
                });
            }
        }
        
        return results;
    }
}

// 单例模式
const mailerPool = new MailerPool();

module.exports = mailerPool;