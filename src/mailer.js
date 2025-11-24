// ============= mailer.js - 邮件通知模块 (使用邮件池) =============
const mailerPool = require('./mailer-pool');
const { config } = require('./config');

/**
 * 发送Cookie过期通知
 */
async function sendCookieExpiredNotification(email, username, userId) {
    try {
        await mailerPool.sendMail({
            to: email,
            subject: '⚠️ 课表订阅 - Cookie已过期',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #d73a49;">⚠️ Cookie已过期</h2>
                    <p>您好，${username || userId}：</p>
                    <p>您的课表订阅Cookie已过期，课表将无法更新。</p>
                    
                    <div style="background: #f6f8fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">如何重新激活订阅？</h3>
                        <ol>
                            <li>访问登录页面: <a href="${config.baseUrl}/login">${config.baseUrl}/login</a></li>
                            <li>使用手机扫码重新登录</li>
                            <li>系统将自动更新您的Cookie</li>
                        </ol>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        提示：重新登录后，您的原订阅链接仍然有效，无需重新配置日历应用。
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #e1e4e8; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">
                        这是一封自动发送的邮件，请勿直接回复。
                    </p>
                </div>
            `
        });
        console.log(`✅ Cookie过期通知已发送至: ${email}`);
        return true;
        
    } catch (error) {
        console.error('❌ 发送邮件失败:', error);
        return false;
    }
}

/**
 * 发送Cookie保活成功通知
 */
async function sendKeepaliveSuccessNotification(email, username, userId) {
    try {
        await mailerPool.sendMail({
            to: email,
            subject: '✅ 课表订阅 - Cookie保活成功',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #28a745;">✅ Cookie保活成功</h2>
                    <p>您好，${username || userId}：</p>
                    <p>您的课表订阅Cookie已成功保活，服务将继续正常运行。</p>
                    
                    <div style="background: #dcffe4; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0; color: #28a745;">
                            <strong>✓</strong> Cookie状态: 有效<br>
                            <strong>✓</strong> 保活时间: ${new Date().toLocaleString('zh-CN')}<br>
                            <strong>✓</strong> 下次检测: 24小时后
                        </p>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        您的课表数据将继续自动更新，无需任何操作。
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #e1e4e8; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">
                        这是一封自动发送的邮件，请勿直接回复。
                    </p>
                </div>
            `
        });
        console.log(`✅ 保活成功通知已发送至: ${email}`);
        return true;
        
    } catch (error) {
        console.error('❌ 发送邮件失败:', error);
        return false;
    }
}

/**
 * 发送测试邮件
 */
async function sendTestEmail(email) {
    try {
        await mailerPool.sendMail({
            to: email,
            subject: '📧 测试邮件 - 课表订阅服务',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>📧 邮件服务测试</h2>
                    <p>如果您收到这封邮件，说明邮件服务配置正确！</p>
                    <p style="color: #666; font-size: 14px;">
                        发送时间: ${new Date().toLocaleString('zh-CN')}
                    </p>
                </div>
            `
        });
        console.log(`✅ 测试邮件已发送至: ${email}`);
        return true;
        
    } catch (error) {
        console.error('❌ 发送测试邮件失败:', error);
        return false;
    }
}

module.exports = {
    sendCookieExpiredNotification,
    sendKeepaliveSuccessNotification,
    sendTestEmail
};