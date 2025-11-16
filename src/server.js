#!/usr/bin/env node
/**
 * 课表订阅服务器 - Node.js版
 * 提供ICS日历订阅源
 * URL: http://your-server:3000/schedule/<token>
 */

const express = require('express');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const ical = require('ical-generator').default;
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 配置
const CAS_URL = "https://sso.jxpu.edu.cn/cas";
const JWXT_URL = "https://jiaowu.jxpu.edu.cn";
const DB_FILE = "schedule_server.db";
const PORT = 3000;

// 忽略SSL证书验证
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ============= 数据库初始化 =============
const db = new sqlite3.Database(DB_FILE);

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
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

function saveUser(token, cookies, semesterStart) {
    return new Promise((resolve, reject) => {
        const cookiesJson = JSON.stringify(cookies);
        db.run(
            `INSERT OR REPLACE INTO users (token, cookies, semester_start, cookie_valid) 
             VALUES (?, ?, ?, 1)`,
            [token, cookiesJson, semesterStart],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function getUser(token) {
    // console.log(token);
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT cookies, semester_start, cookie_valid FROM users WHERE token = ?',
            [token],
            (err, row) => {
                if (err) reject(err);
                else if (row) {
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

function updateLastSync(token) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE users SET last_sync = CURRENT_TIMESTAMP, cookie_valid = 1 WHERE token = ?',
            [token],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function markCookieInvalid(token) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE users SET cookie_valid = 0, cookie_expired_at = CURRENT_TIMESTAMP WHERE token = ?',
            [token],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function updateCookies(token, cookies) {
    return new Promise((resolve, reject) => {
        const cookiesJson = JSON.stringify(cookies);
        db.run(
            'UPDATE users SET cookies = ?, cookie_valid = 1, cookie_expired_at = NULL WHERE token = ?',
            [cookiesJson, token],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// ============= 课表获取逻辑 =============
async function fetchSchedule(cookies) {
    try {
        // 创建一个 cookie jar 来自动管理 cookies
        const cookieJar = {};
        
        // 添加初始 TGC cookie
        Object.assign(cookieJar, cookies);
        
        // console.log('🔍 [调试] 开始Cookie:', cookieJar);

        // 构建Cookie字符串的函数
        const getCookieString = () => {
            return Object.entries(cookieJar)
                .map(([key, value]) => `${key}=${value}`)
                .join('; ');
        };

        // 解析响应头中的 Set-Cookie
        const parseCookies = (headers) => {
            const setCookie = headers['set-cookie'];
            if (!setCookie) return;
            
            (Array.isArray(setCookie) ? setCookie : [setCookie]).forEach(cookie => {
                const match = cookie.match(/^([^=]+)=([^;]+)/);
                if (match) {
                    cookieJar[match[1]] = match[2];
                }
            });
        };

        const axiosInstance = axios.create({
            httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Connection': 'keep-alive'
            },
            maxRedirects: 0, // 手动处理重定向
            validateStatus: (status) => status >= 200 && status < 400,
            timeout: 15000
        });

        // console.log('   → 步骤1: SSO登录验证...');
        // 步骤1: 访问CAS登录，携带TGC
        let response = await axiosInstance.get(
            `${CAS_URL}/login?service=${encodeURIComponent(JWXT_URL + '/jsxsd/sso.jsp')}`,
            { 
                headers: { Cookie: getCookieString() },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            }
        );

        // console.log('      状态:', response.status);
        parseCookies(response.headers);
        // console.log('      Cookies更新:', Object.keys(cookieJar));

        if (response.data.includes('<title>登录 - 江西职业技术大学</title>') || response.data.includes('login')) {
            // console.log('      ❌ 未成功登录到教务系统');
            return { success: false, error: 'Cookie无效或已过期，未能登录教务系统' };
        }
        // 如果返回302跳转，获取ticket
        let ticket = null;
        if (response.status === 302 || response.status === 301) {
            const location = response.headers.location;
            // console.log('      重定向到:', location);
            
            // 提取ticket
            const ticketMatch = location.match(/ticket=([^&]+)/);
            if (ticketMatch) {
                ticket = ticketMatch[1];
                // console.log('      获得Ticket:', ticket.substring(0, 20) + '...');
            }
        }

        // console.log('   → 步骤2: 访问教务系统SSO...');
        // 步骤2: 使用ticket访问教务系统
        const ssoUrl = ticket 
            ? `${JWXT_URL}/jsxsd/sso.jsp?ticket=${ticket}`
            : `${JWXT_URL}/jsxsd/sso.jsp`;
        
        response = await axiosInstance.get(ssoUrl, {
            headers: { Cookie: getCookieString() },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });

        // console.log('      状态:', response.status);
        parseCookies(response.headers);
        // console.log('      Cookies更新:', Object.keys(cookieJar));

        // 处理可能的再次重定向
        if (response.status === 302 || response.status === 301) {
            const location = response.headers.location;
            // console.log('      再次重定向到:', location);
            
            const finalUrl = location.startsWith('http') ? location : `${JWXT_URL}${location}`;
            response = await axiosInstance.get(finalUrl, {
                headers: { Cookie: getCookieString() }
            });
            
            parseCookies(response.headers);
        }

        // console.log('   → 步骤3: 访问主页建立会话...');
        // 步骤3: 访问主页
        response = await axiosInstance.get(
            `${JWXT_URL}/jsxsd/framework/xsMain.jsp`,
            { headers: { Cookie: getCookieString() } }
        );

        // console.log('      状态:', response.status);
        parseCookies(response.headers);
        
        // 检查是否成功登录（查找常见的登录页面特征）
        

        // console.log('   → 步骤4: 获取课表数据...');
        // 步骤4: 获取课表
        response = await axiosInstance.get(
            `${JWXT_URL}/jsxsd/xskb/xskb_list.do`,
            { headers: { Cookie: getCookieString() } }
        );

        // console.log('      状态:', response.status);
        // console.log('      响应长度:', response.data.length);
        // console.log('      包含课表标题:', response.data.includes('<title>学期理论课表</title>'));

        if (response.status === 200 && response.data.includes('<title>学期理论课表</title>')) {
            // conole.log('   ✅ 课表获取成功！');
            return { success: true, html: response.data };
        }

        // 保存HTML用于调试
        if (process.env.NODE_ENV === 'development') {
            const fs = require('fs');
            fs.writeFileSync('debug_response.html', response.data);
            // conole.log.log('   💾 响应已保存到 debug_response.html');
        }

        return { success: false, error: 'Cookie可能已过期或响应异常' };
    } catch (error) {
        // conole.log.error(`❌ 获取课表失败: ${error.message}`);
        if (error.response) {
            // conole.log.error(`   响应状态: ${error.response.status}`);
            // conole.log.error(`   响应数据长度: ${error.response.data?.length || 0}`);
        }
        return { success: false, error: error.message };
    }
}

function parseSchedule(html, semesterStart) {
    const $ = cheerio.load(html);
    const courses = [];

    // 节次时间
    const lessonTimes = {
        1: ['08:20', '10:00'],
        2: ['10:20', '12:00'],
        3: ['14:00', '15:40'],
        4: ['16:00', '17:35'],
        5: ['17:40', '19:20'],
        6: ['19:30', '21:10']
    };

    const semesterStartDate = new Date(semesterStart);

    const table = $('table.Nsb_r_list.Nsb_table');
    if (!table.length) return courses;

    const rows = table.find('tr').slice(1); // 跳过表头

    rows.each((rowIdx, row) => {
        const cells = $(row).find('td');
        
        cells.each((weekday, cell) => {
            const courseElems = $(cell).find('.kbcontent, p[title]');
            
            courseElems.each((_, elem) => {
                const title = $(elem).attr('title') || $(elem).html();
                if (!title) return;

                const info = parseCourseInfo(title);
                if (!info) return;

                const weeks = parseWeeks(info.time);
                if (!weeks.length) return;

                const lessonNum = parseLesson(info.time, rowIdx + 1);
                if (!lessonTimes[lessonNum]) return;

                const [startTimeStr, endTimeStr] = lessonTimes[lessonNum];

                // 生成每周的课程
                weeks.forEach(week => {
                    const daysOffset = (week - 1) * 7 + weekday;
                    const courseDate = new Date(semesterStartDate);
                    courseDate.setDate(courseDate.getDate() + daysOffset);

                    const [startHour, startMin] = startTimeStr.split(':');
                    const [endHour, endMin] = endTimeStr.split(':');

                    const startTime = new Date(courseDate);
                    startTime.setHours(parseInt(startHour), parseInt(startMin), 0);

                    const endTime = new Date(courseDate);
                    endTime.setHours(parseInt(endHour), parseInt(endMin), 0);

                    courses.push({
                        name: info.name,
                        location: info.location || '',
                        teacher: info.teacher || '',
                        week,
                        startTime,
                        endTime
                    });
                });
            });
        });
    });

    return courses;
}

function parseCourseInfo(text) {
    const lines = text.split(/<br\s*\/?>/i)
        .map(line => line.trim())
        .filter(line => line);

    if (lines.length < 3) return null;

    const info = {};

    // 课程名（去除HTML标签）
    info.name = lines[0].replace(/<[^>]*>/g, '');

    // 教师（提取font标签内容）
    const teacherMatch = lines[1].match(/<font[^>]*>(.*?)<\/font>/i);
    info.teacher = teacherMatch ? teacherMatch[1] : lines[1].replace(/<[^>]*>/g, '');

    // 周次时间（提取font标签内容）
    const timeMatch = lines[2].match(/<font[^>]*>(.*?)<\/font>/i);
    info.time = timeMatch ? timeMatch[1] : lines[2].replace(/<[^>]*>/g, '');

    // 地点
    if (lines[3]) {
        const locationMatch = lines[3].match(/<font[^>]*>(.*?)<\/font>/i);
        info.location = locationMatch ? locationMatch[1] : lines[3].replace(/<[^>]*>/g, '');
    }

    return info.name ? info : null;
}

function parseWeeks(timeStr) {
    const weeks = [];
    
    // 提取周次部分: "1-3,6-9,11-17(周)"
    const weekMatch = timeStr.match(/^(.+?)\(周\)/);
    if (!weekMatch) return weeks;

    const segments = weekMatch[1].split(',');

    segments.forEach(seg => {
        seg = seg.trim();
        if (seg.includes('-')) {
            const [start, end] = seg.split('-').map(n => parseInt(n));
            for (let i = start; i <= end; i++) {
                weeks.push(i);
            }
        } else if (/^\d+$/.test(seg)) {
            weeks.push(parseInt(seg));
        }
    });

    return weeks;
}

function parseLesson(timeStr, defaultValue) {
    const match = timeStr.match(/\[?(\d+)-(\d+)\]?节/);
    if (match) {
        return Math.ceil(parseInt(match[1]) / 2);
    }
    return defaultValue;
}

function generateICS(courses) {
    const calendar = ical({
        name: '我的课程表',
        prodId: {
            company: '江西职业技术大学',
            product: '课表订阅',
            language: 'CN'
        },
        timezone: 'Asia/Shanghai',
        ttl: 3600 // 1小时刷新
    });

    courses.forEach(course => {
        const uid = `${course.startTime.getTime()}-${crypto.createHash('md5')
            .update(course.name)
            .digest('hex')
            .substring(0, 8)}@jxpu.edu.cn`;

        calendar.createEvent({
            start: course.startTime,
            end: course.endTime,
            summary: course.name,
            description: `教师: ${course.teacher}\n第${course.week}周`,
            location: course.location,
            uid: uid,
            alarms: [{
                type: 'display',
                trigger: 35 * 60, // 35分钟前提醒
                description: `${course.name} 即将开始`
            }]
        });
    });

    return calendar.toString();
}

// ============= Web路由 =============
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>课表订阅服务</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
                max-width: 800px; 
                margin: 0 auto; 
                padding: 20px;
                line-height: 1.6;
                background: #f5f5f5;
            }
            .container {
                background: white;
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            h1 { 
                color: #333; 
                margin-bottom: 10px;
                font-size: 28px;
            }
            .subtitle {
                color: #666;
                margin-bottom: 30px;
            }
            .tabs {
                display: flex;
                gap: 10px;
                margin-bottom: 30px;
                border-bottom: 2px solid #e1e4e8;
            }
            .tab {
                padding: 10px 20px;
                cursor: pointer;
                border: none;
                background: none;
                font-size: 16px;
                color: #666;
                transition: all 0.2s;
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
            }
            .tab.active {
                color: #0366d6;
                border-bottom-color: #0366d6;
                font-weight: 600;
            }
            .tab:hover {
                color: #0366d6;
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            .form-group { 
                margin: 20px 0; 
            }
            label { 
                display: block; 
                margin-bottom: 8px; 
                font-weight: 600;
                color: #333;
            }
            input, textarea { 
                width: 100%; 
                padding: 12px; 
                border: 2px solid #e1e4e8;
                border-radius: 6px;
                font-size: 14px;
                transition: border-color 0.2s;
            }
            input:focus, textarea:focus {
                outline: none;
                border-color: #0366d6;
            }
            button { 
                background: #0366d6;
                color: white; 
                padding: 12px 24px; 
                border: none; 
                border-radius: 6px; 
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                transition: background 0.2s;
            }
            button:hover { 
                background: #0256c7;
            }
            button:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            .result { 
                margin-top: 20px; 
                padding: 15px; 
                background: #f6f8fa;
                border-radius: 6px;
                border-left: 4px solid #0366d6;
            }
            .error { 
                color: #d73a49;
                background: #ffeef0;
                border-left-color: #d73a49;
            }
            .warning {
                color: #b08800;
                background: #fffbdd;
                border-left-color: #dbab09;
                padding: 12px;
                margin: 15px 0;
                border-radius: 6px;
                border-left: 4px solid #dbab09;
            }
            .success {
                color: #28a745;
                background: #dcffe4;
                border-left-color: #28a745;
            }
            code { 
                background: #f6f8fa;
                padding: 3px 6px; 
                border-radius: 3px;
                font-family: 'Courier New', monospace;
                font-size: 14px;
                word-break: break-all;
            }
            .btn-copy {
                background: #28a745;
                margin-left: 10px;
                padding: 8px 16px;
                font-size: 14px;
            }
            .btn-copy:hover {
                background: #218838;
            }
            .btn-update {
                background: #ffa500;
            }
            .btn-update:hover {
                background: #ff8c00;
            }
            hr {
                margin: 40px 0;
                border: none;
                border-top: 2px solid #e1e4e8;
            }
            .instructions {
                background: #f6f8fa;
                padding: 20px;
                border-radius: 6px;
                margin-top: 20px;
            }
            .instructions h2 {
                color: #24292e;
                margin-bottom: 15px;
                font-size: 20px;
            }
            .instructions ol {
                margin-left: 20px;
            }
            .instructions li {
                margin: 10px 0;
            }
            .instructions ul {
                margin-left: 20px;
                margin-top: 5px;
            }
            .instructions a {
                color: #0366d6;
                text-decoration: none;
            }
            .instructions a:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📅 课表订阅服务</h1>
            <p class="subtitle">生成和管理你的专属课表订阅链接</p>
            
            <div class="tabs">
                <button class="tab active" onclick="switchTab('new')">🆕 新建订阅</button>
                <button class="tab" onclick="switchTab('update')">🔄 更新Cookie</button>
            </div>
            
            <!-- 新建订阅 -->
            <div id="tab-new" class="tab-content active">
                <div class="warning">
                    💡 <strong>提示:</strong> 订阅链接永久有效！Cookie过期后只需更新Cookie，无需更改订阅链接。
                </div>
                
                <div class="form-group">
                    <label>1. TGC Cookie:</label>
                    <input type="text" id="tgc" placeholder="从浏览器复制TGC的值">
                    <small style="color: #666; display: block; margin-top: 5px;">
                        登录后从浏览器开发者工具获取
                    </small>
                </div>
                
                <div class="form-group">
                    <label>2. 学期开始日期 (第一周周一):</label>
                    <input type="date" id="semester_start" value="2025-09-08">
                </div>
                
                <button onclick="generateToken()" id="genBtn">生成订阅链接</button>
                
                <div id="result" style="display:none;"></div>
            </div>
            
            <!-- 更新Cookie -->
            <div id="tab-update" class="tab-content">
                <div class="warning">
                    ⚠️ <strong>Cookie过期处理:</strong> 如果订阅失效，在这里更新Cookie即可恢复，无需修改日历应用中的订阅链接！
                </div>
                
                <div class="form-group">
                    <label>1. 订阅Token:</label>
                    <input type="text" id="update_token" placeholder="从订阅链接中提取 /schedule/ 后面的部分">
                    <small style="color: #666; display: block; margin-top: 5px;">
                        例如: https://xxx.com/schedule/<strong>abc123...</strong>
                    </small>
                </div>
                
                <div class="form-group">
                    <label>2. 新的TGC Cookie:</label>
                    <input type="text" id="update_tgc" placeholder="重新登录后获取的TGC值">
                </div>
                
                <button onclick="updateCookie()" id="updateBtn" class="btn-update">更新Cookie</button>
                
                <div id="update_result" style="display:none;"></div>
            </div>
            
            <hr>
            
            <div class="instructions">
                <h2>📖 使用说明</h2>
                
                <h3 style="margin-top: 15px;">首次使用:</h3>
                <ol>
                    <li>浏览器登录 <a href="https://sso.jxpu.edu.cn/cas/login" target="_blank">https://sso.jxpu.edu.cn/cas/login</a></li>
                    <li>按 F12 打开开发者工具 → Application (或存储) → Cookies → 找到 <code>sso.jxpu.edu.cn</code></li>
                    <li>复制 <code>TGC</code> 的 Value 值</li>
                    <li>在"新建订阅"标签页中粘贴TGC，选择学期开始日期</li>
                    <li>点击"生成订阅链接"，保存生成的Token和订阅URL</li>
                    <li>将订阅URL添加到日历应用</li>
                </ol>
                
                <h3 style="margin-top: 20px;">Cookie过期后:</h3>
                <ol>
                    <li>重新登录教务系统，获取新的TGC Cookie</li>
                    <li>切换到"更新Cookie"标签页</li>
                    <li>输入你的订阅Token（从订阅链接中获取）</li>
                    <li>粘贴新的TGC Cookie</li>
                    <li>点击"更新Cookie" - 日历应用会自动同步，无需任何操作！</li>
                </ol>
                
                <h3 style="margin-top: 20px;">支持的日历应用:</h3>
                <ul>
                    <li><strong>iOS/iPadOS:</strong> 设置 → 日历 → 账户 → 添加账户 → 其他 → 订阅日历</li>
                    <li><strong>macOS:</strong> 日历 → 文件 → 新建日历订阅</li>
                    <li><strong>Google Calendar:</strong> 其他日历 → 通过URL添加</li>
                    <li><strong>Outlook:</strong> 日历 → 添加日历 → 从Internet订阅</li>
                </ul>
            </div>
        </div>
        
        <script>
        function switchTab(tab) {
            // 切换标签
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById('tab-' + tab).classList.add('active');
        }
        
        async function generateToken() {
            const tgc = document.getElementById('tgc').value.trim();
            const semester_start = document.getElementById('semester_start').value;
            const result = document.getElementById('result');
            const btn = document.getElementById('genBtn');
            
            if (!tgc) {
                result.className = 'result error';
                result.innerHTML = '<strong>❌ 错误:</strong> 请输入TGC Cookie';
                result.style.display = 'block';
                return;
            }
            
            btn.disabled = true;
            btn.textContent = '验证中...';
            result.className = 'result';
            result.innerHTML = '⏳ 正在验证Cookie并获取课表...';
            result.style.display = 'block';
            
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({tgc, semester_start})
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const url = window.location.origin + '/schedule/' + data.token;
                    result.className = 'result success';
                    result.innerHTML = \`
                        <h3 style="color: #28a745; margin-bottom: 10px;">✅ 生成成功！</h3>
                        <p style="margin: 10px 0;"><strong>你的订阅链接：</strong></p>
                        <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all;">
                            <code>\${url}</code>
                            <button class="btn-copy" onclick="copyToClipboard('\${url}')">📋 复制链接</button>
                        </p>
                        <p style="margin: 15px 0;"><strong>你的Token（请保存）：</strong></p>
                        <p style="background: white; padding: 10px; border-radius: 4px; word-break: break-all;">
                            <code>\${data.token}</code>
                            <button class="btn-copy" onclick="copyToClipboard('\${data.token}')">📋 复制Token</button>
                        </p>
                        <p style="margin-top: 15px; color: #666; font-size: 14px;">
                            ⚠️ <strong>重要提示:</strong>
                        </p>
                        <ul style="margin-left: 20px; color: #666; font-size: 14px;">
                            <li>请妥善保管Token，Cookie过期时需要用它来更新</li>
                            <li>订阅链接永久有效，添加到日历后无需再次修改</li>
                            <li>不要分享你的链接和Token给他人</li>
                        </ul>
                    \`;
                } else {
                    result.className = 'result error';
                    result.innerHTML = '<strong>❌ 失败:</strong> ' + data.error;
                }
            } catch (error) {
                result.className = 'result error';
                result.innerHTML = '<strong>❌ 网络错误:</strong> ' + error.message;
            } finally {
                btn.disabled = false;
                btn.textContent = '生成订阅链接';
            }
        }
        
        async function updateCookie() {
            const token = document.getElementById('update_token').value.trim();
            const tgc = document.getElementById('update_tgc').value.trim();
            const result = document.getElementById('update_result');
            const btn = document.getElementById('updateBtn');
            
            if (!token || !tgc) {
                result.className = 'result error';
                result.innerHTML = '<strong>❌ 错误:</strong> 请输入Token和新的TGC Cookie';
                result.style.display = 'block';
                return;
            }
            
            btn.disabled = true;
            btn.textContent = '更新中...';
            result.className = 'result';
            result.innerHTML = '⏳ 正在验证新的Cookie...';
            result.style.display = 'block';
            
            try {
                const response = await fetch('/api/update-cookie', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({token, tgc})
                });
                
                const data = await response.json();
                
                if (data.success) {
                    result.className = 'result success';
                    result.innerHTML = \`
                        <h3 style="color: #28a745; margin-bottom: 10px;">✅ 更新成功！</h3>
                        <p>Cookie已更新，订阅链接保持不变。日历应用会在下次刷新时自动同步最新课表。</p>
                        <p style="margin-top: 10px; color: #666; font-size: 14px;">
                            💡 提示: 你的日历应用中的订阅链接无需任何修改
                        </p>
                    \`;
                } else {
                    result.className = 'result error';
                    result.innerHTML = '<strong>❌ 失败:</strong> ' + data.error;
                }
            } catch (error) {
                result.className = 'result error';
                result.innerHTML = '<strong>❌ 网络错误:</strong> ' + error.message;
            } finally {
                btn.disabled = false;
                btn.textContent = '更新Cookie';
            }
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('✅ 已复制到剪贴板！');
            }).catch(() => {
                alert('❌ 复制失败，请手动复制');
            });
        }
        
        // 回车触发操作
        document.getElementById('tgc').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') generateToken();
        });
        document.getElementById('update_tgc').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') updateCookie();
        });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/api/register', async (req, res) => {
    const { tgc, semester_start = '2025-09-08' } = req.body;

    if (!tgc || !tgc.trim()) {
        return res.json({ success: false, error: '请提供TGC Cookie' });
    }

    try {
        // 验证Cookie有效性
        const cookies = { TGC: tgc.trim() };
        const result = await fetchSchedule(cookies);

        if (!result.success) {
            return res.json({ 
                success: false, 
                error: 'Cookie无效或已过期，请重新登录获取' 
            });
        }

        // 生成token
        const token = crypto.randomBytes(32).toString('base64url');

        // 保存用户信息
        await saveUser(token, cookies, semester_start);

        // conole.log.log(`✅ 新用户注册成功: ${token.substring(0, 8)}...`);

        res.json({ success: true, token });
    } catch (error) {
        // conole.log.error('注册失败:', error);
        res.json({ success: false, error: `验证失败: ${error.message}` });
    }
});

// 新增：更新Cookie接口
app.post('/api/update-cookie', async (req, res) => {
    const { token, tgc } = req.body;

    if (!token || !tgc) {
        return res.json({ success: false, error: '请提供Token和TGC Cookie' });
    }

    try {
        // 验证用户是否存在
        const user = await getUser(token);
        if (!user) {
            return res.json({ success: false, error: '无效的Token' });
        }

        // 验证新Cookie有效性
        const cookies = { TGC: tgc.trim() };
        const result = await fetchSchedule(cookies);

        if (!result.success) {
            return res.json({ 
                success: false, 
                error: '新Cookie无效或已过期，请确认后重试' 
            });
        }

        // 更新Cookie
        await updateCookies(token, cookies);

        // conole.log.log(`✅ Cookie更新成功: ${token.substring(0, 8)}...`);

        res.json({ 
            success: true, 
            message: 'Cookie已更新，订阅链接保持不变' 
        });
    } catch (error) {
        // conole.log.error('更新Cookie失败:', error);
        res.json({ success: false, error: `更新失败: ${error.message}` });
    }
});

app.get('/schedule/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // 获取用户信息
        const user = await getUser(token);
        if (!user) {
            return res.status(404).send('❌ 无效的订阅Token，请重新生成');
        }

        // 检查Cookie是否被标记为无效
        if (!user.cookieValid) {
            return res.status(401).send(`❌ Cookie已过期

请按以下步骤更新Cookie（订阅链接保持不变）：

1. 重新登录教务系统获取新的TGC Cookie
2. 访问 ${req.protocol}://${req.get('host')}
3. 切换到"更新Cookie"标签页
4. 输入你的Token和新的TGC
5. 点击"更新Cookie"

更新后，日历应用会自动同步，无需修改订阅链接！`);
        }

        // 获取课表
        const result = await fetchSchedule(user.cookies);
        
        if (!result.success) {
            // 标记Cookie为无效
            await markCookieInvalid(token);
            // conole.log.log(`⚠️  Cookie过期: ${token.substring(0, 8)}...`);
            return res.status(401).send(`❌ Cookie已过期

请按以下步骤更新Cookie（订阅链接保持不变）：

1. 重新登录教务系统获取新的TGC Cookie
2. 访问 ${req.protocol}://${req.get('host')}
3. 切换到"更新Cookie"标签页
4. 输入你的Token: ${token.substring(0, 16)}...
5. 输入新的TGC并点击"更新Cookie"

更新后，日历应用会自动同步，无需修改订阅链接！`);
        }

        // 解析课表
        const courses = parseSchedule(result.html, user.semesterStart);
        if (!courses.length) {
            return res.status(404).send('❌ 未找到课程信息');
        }

        // 生成ICS
        const icsData = generateICS(courses);

        // 更新同步时间
        await updateLastSync(token);

        // conole.log.log(`✅ 课表同步成功: ${token.substring(0, 8)}... (${courses.length}门课程)`);

        // 返回ICS文件
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=schedule.ics');
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.send(icsData);

    } catch (error) {
        // conole.log.error('获取课表错误:', error);
        res.status(500).send(`❌ 服务器错误: ${error.message}`);
    }
});

app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as total FROM users', (err, row1) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.get('SELECT COUNT(*) as active FROM users WHERE last_sync IS NOT NULL', (err, row2) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.get('SELECT COUNT(*) as valid FROM users WHERE cookie_valid = 1', (err, row3) => {
                if (err) return res.status(500).json({ error: err.message });
                
                res.json({
                    total_users: row1.total,
                    active_users: row2.active,
                    valid_cookies: row3.valid
                });
            });
        });
    });
});

// ============= 启动服务 =============
async function start() {
    try {
        await initDB();
        
        app.listen(PORT, '0.0.0.0', () => {
            // console.log('='.repeat(60));
            // console.log('📅 课表订阅服务启动成功');
            // console.log('='.repeat(60));
            // console.log(`🌐 访问地址: http://localhost:${PORT}`);
            // console.log(`📊 统计接口: http://localhost:${PORT}/api/stats`);
            // console.log('='.repeat(60));
            // console.log('💡 功能特性:');
            // console.log('   - 订阅链接永久有效');
            // console.log('   - Cookie过期可在线更新');
            // console.log('   - 无需修改日历订阅');
            // console.log('='.repeat(60));
        });
    } catch (error) {
        // console.error('启动失败:', error);
        process.exit(1);
    }
}

// 优雅关闭
process.on('SIGINT', () => {
    // console.log('\n👋 正在关闭服务...');
    db.close(() => {
        // console.log('✅ 数据库已关闭');
        process.exit(0);
    });
});

start();