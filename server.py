#!/usr/bin/env python3
"""
课表订阅服务器 - Flask版
提供ICS日历订阅源
URL: http://your-server:5000/schedule/<token>
"""

from flask import Flask, Response, request, jsonify, render_template_string
import requests
from bs4 import BeautifulSoup
from icalendar import Calendar, Event, Alarm
from datetime import datetime, timedelta
import json
import re
import secrets
import sqlite3
from pathlib import Path
import hashlib


app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(32)

# 配置
CAS_URL = "HTTPS://sso.jxpu.edu.cn/cas"
JWXT_URL = "https://jiaowu.jxpu.edu.cn"
DB_FILE = "schedule_server.db"


# ============= 数据库初始化 =============
def init_db():
    """初始化数据库"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 用户表
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  token TEXT UNIQUE NOT NULL,
                  cookies TEXT NOT NULL,
                  semester_start TEXT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  last_sync TIMESTAMP)''')
    
    conn.commit()
    conn.close()


def save_user(token, cookies, semester_start):
    """保存用户信息"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    cookies_json = json.dumps(cookies)
    
    c.execute('''INSERT OR REPLACE INTO users (token, cookies, semester_start)
                 VALUES (?, ?, ?)''', (token, cookies_json, semester_start))
    
    conn.commit()
    conn.close()


def get_user(token):
    """获取用户信息"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('SELECT cookies, semester_start FROM users WHERE token = ?', (token,))
    result = c.fetchone()
    
    conn.close()
    
    if result:
        return {
            'cookies': json.loads(result[0]),
            'semester_start': result[1]
        }
    return None


def update_last_sync(token):
    """更新最后同步时间"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('UPDATE users SET last_sync = CURRENT_TIMESTAMP WHERE token = ?', (token,))
    
    conn.commit()
    conn.close()


# ============= 课表获取逻辑 =============
def fetch_schedule(cookies):
    """获取课表数据（全学期）"""
    session = requests.Session()
    session.verify = False
    
    # 设置Cookie
    for key, value in cookies.items():
        session.cookies.set(key, value)
    
    try:
        # SSO跳转
        print("   → SSO跳转...")
        session.get(
            f"{CAS_URL}/login?service={JWXT_URL}/jsxsd/sso.jsp",
            allow_redirects=True,
            timeout=10
        )
        
        # 访问主页
        session.get(f"{JWXT_URL}/jsxsd/framework/xsMain.jsp", timeout=10)
        # 访问课表接口（无参数 = 全学期）
        resp = session.get(
            f"{JWXT_URL}/jsxsd/xskb/xskb_list.do",
            timeout=15
        )


        if resp.status_code == 200 and '<title>学期理论课表</title>' in resp.text:
            return resp.text
        
        return None
    except Exception as e:
        print(f"获取课表失败: {e}")
        return None


def parse_schedule(html, semester_start):
    """解析课表"""
    soup = BeautifulSoup(html, 'html.parser')
    courses = []
    
    # 节次时间
    lesson_times = {
        1: ('08:20', '10:00'),
        2: ('10:20', '12:00'),
        3: ('14:00', '15:40'),
        4: ('16:00', '17:35'),
        5: ('17:40', '19:20'),
        6: ('19:30', '21:10'),
    }
    
    semester_start_date = datetime.fromisoformat(semester_start)
    
    table = soup.find('table', class_='Nsb_r_list Nsb_table')
    if not table:
        return courses
    
    tr = table.find('tr')
    if not tr:
        return courses
    
    rows = table.find_all('tr')
    rows = rows[1:]  # 跳过第一个tr
    
    for row_idx, row in enumerate(rows, start=1):
        cells = row.find_all('td')
        
        for weekday, cell in enumerate(cells, start=1):
            # 查找课程（可能是<p>或<div>标签）
            course_elems = cell.find_all(['p', 'div'], class_=['kbcontent'])
            if not course_elems:
                course_elems = cell.find_all('p', title=True)
            
            for elem in course_elems:
                # 获取课程信息
                title = elem.get('title', '') or elem.decode_contents()
                if not title:
                    continue
                
                info = parse_course_info(title)
                if not info:
                    continue
                
                # 解析周次
                weeks = parse_weeks(info.get('time', ''))
                if not weeks:
                    continue
                
                # 解析节次
                lesson_num = parse_lesson(info.get('time', ''), row_idx)
                if lesson_num not in lesson_times:
                    continue
                
                start_time_str, end_time_str = lesson_times[lesson_num]
                
                # 生成每周的课程
                for week in weeks:
                    days_offset = (week - 1) * 7 + (weekday - 1)
                    course_date = semester_start_date + timedelta(days=days_offset)
                    print(course_date)

                    start_time = datetime.combine(
                        course_date,
                        datetime.strptime(start_time_str, '%H:%M').time()
                    )
                    end_time = datetime.combine(
                        course_date,
                        datetime.strptime(end_time_str, '%H:%M').time()
                    )
                    
                    courses.append({
                        'name': info['name'],
                        'location': info.get('location', ''),
                        'teacher': info.get('teacher', ''),
                        'week': week,
                        'start_time': start_time,
                        'end_time': end_time,
                    })
    
    return courses


def parse_course_info(text):
    """解析课程信息"""
    info = {}
    
    # 分割行
    lines = re.split(r'<br\s*/?>', text)
    lines = [line.strip() for line in lines if line.strip()]
    
    if len(lines) >= 3:
        # 新格式: 课程名<br>教师<br>(周次)<br>地点
        lines[0]=lines[0].split('<')[0]
        info['name'] = lines[0]
        print(f"info['naem] 类型: {type(info['name'])}")
        
        # 提取教师（去除<font>标签）
        pattern = r'<font.*?>(.*?)</font>'
        teacher_match = re.findall(pattern, lines[1], re.IGNORECASE)
        info['teacher'] = teacher_match[0] if teacher_match else lines[1]
        
        # 提取周次（去除<font>标签）
        match = re.match(r'<font[^>]*>(.*?)</font>', lines[2])
        info['time'] = match.group(1) if match else lines[2]

        # 提取地点
        location_match=re.findall(pattern,lines[3],re.IGNORECASE)
        info['location'] = location_match[0] if len(lines) >= 4 else ''
    
    return info if 'name' in info else None

def parse_weeks(time_str):
    """解析周次范围"""
    weeks = []
    print(f"time_str 内容: {repr(time_str)}")

    # 处理多个周次段: 1-4,6-12,14,16周
    week_match = re.search(r'^(.+?)\(周\)', time_str)
    if week_match:
        time_str = week_match.group(1)  # 这将得到 "1-3,6-9,11-17"

    segments = time_str.split(',')
    
    for seg in segments:
        seg = seg.strip()
        if '-' in seg:
            # 范围: 1-4
            start, end = seg.split('-')
            weeks.extend(range(int(start), int(end) + 1))
        elif seg.isdigit():
            # 单周: 14
            weeks.append(int(seg))
    
    return weeks


def parse_lesson(time_str, default):
    """解析节次"""
    match = re.search(r'\[?(\d+)-(\d+)\]?节', time_str)
    if match:
        return (int(match.group(1)) + 1) // 2
    return default


def generate_ics(courses):
    """生成ICS日历"""
    cal = Calendar()
    cal.add('prodid', '-//课表订阅//江西职业技术大学//CN')
    cal.add('version', '2.0')
    cal.add('X-WR-CALNAME', '我的课程表')
    cal.add('X-WR-TIMEZONE', 'Asia/Shanghai')
    cal.add('X-PUBLISHED-TTL', 'PT1H')  # 1小时刷新
    
    for course in courses:
        event = Event()
        event.add('summary', course['name'])
        event.add('location', course['location'])
        event.add('description', f"教师: {course['teacher']}\n第{course['week']}周")
        event.add('dtstart', course['start_time'])
        event.add('dtend', course['end_time'])
        
        # 生成唯一ID
        uid = f"{course['start_time'].timestamp()}-{hashlib.md5(course['name'].encode()).hexdigest()[:8]}@jxpu.edu.cn"
        event.add('uid', uid)
        
        # 提醒
        alarm = Alarm()
        alarm.add('action', 'DISPLAY')
        alarm.add('description', f"{course['name']} 即将开始")
        alarm.add('trigger', timedelta(minutes=-35))
        event.add_component(alarm)
        
        cal.add_component(event)
    
    return cal.to_ical()


# ============= Web路由 =============
@app.route('/')
def index():
    """首页"""
    html = '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>课表订阅服务</title>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
            .form-group { margin: 20px 0; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
            button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background: #0056b3; }
            .result { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 4px; }
            .error { color: red; }
            code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; }
        </style>
    </head>
    <body>
        <h1>📅 课表订阅服务</h1>
        <p>生成你的专属课表订阅链接</p>
        
        <div class="form-group">
            <label>1. TGC Cookie:</label>
            <input type="text" id="tgc" placeholder="从浏览器复制TGC的值">
        </div>
        
        <div class="form-group">
            <label>2. 学期开始日期 (第一周周一):</label>
            <input type="date" id="semester_start" value="2025-09-08">
        </div>
        
        <button onclick="generateToken()">生成订阅链接</button>
        
        <div id="result" class="result" style="display:none;"></div>
        
        <hr style="margin: 40px 0;">
        
        <h2>📖 使用说明</h2>
        <ol>
            <li>浏览器登录 <a href="https://sso.jxpu.edu.cn/cas/login" target="_blank">https://sso.jxpu.edu.cn/cas/login</a></li>
            <li>F12 → Application → Cookies → 复制 TGC 的 Value</li>
            <li>粘贴到上方输入框，点击生成</li>
            <li>将订阅链接添加到日历应用：
                <ul>
                    <li>iOS: 设置 → 日历 → 账户 → 添加账户 → 其他 → 订阅日历</li>
                    <li>macOS: 日历 → 文件 → 新建日历订阅</li>
                    <li>Google Calendar: 其他日历 → 通过URL添加</li>
                </ul>
            </li>
        </ol>
        
        <script>
        async function generateToken() {
            const tgc = document.getElementById('tgc').value.trim();
            const semester_start = document.getElementById('semester_start').value;
            const result = document.getElementById('result');
            
            if (!tgc) {
                result.innerHTML = '<span class="error">请输入TGC</span>';
                result.style.display = 'block';
                return;
            }
            
            result.innerHTML = '正在验证...';
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
                    result.innerHTML = `
                        <h3>✅ 生成成功！</h3>
                        <p>你的订阅链接：</p>
                        <p><code>${url}</code></p>
                        <p><button onclick="navigator.clipboard.writeText('${url}')">复制链接</button></p>
                        <p><small>提示: 保存好此链接，不要分享给他人</small></p>
                    `;
                } else {
                    result.innerHTML = '<span class="error">❌ ' + data.error + '</span>';
                }
            } catch (error) {
                result.innerHTML = '<span class="error">❌ 网络错误: ' + error + '</span>';
            }
        }
        </script>
    </body>
    </html>
    '''
    return html


@app.route('/api/register', methods=['POST'])
def register():
    """注册新用户，生成token"""
    data = request.json
    tgc = data.get('tgc', '').strip()
    semester_start = data.get('semester_start', '2025-09-08')
    
    if not tgc:
        return jsonify({'success': False, 'error': '请提供TGC'})
    
    # 验证Cookie有效性
    session = requests.Session()
    session.verify = False
    session.cookies.set('TGC', tgc, domain='.jxpu.edu.cn')
    
    try:
        # SSO跳转
        print("   → SSO跳转...")
        session.get(
            f"{CAS_URL}/login?service={JWXT_URL}/jsxsd/sso.jsp",
            allow_redirects=True,
            timeout=10
        )
        
        # 访问主页
        session.get(f"{JWXT_URL}/jsxsd/framework/xsMain.jsp", timeout=10)
        # 测试访问教务系统
        resp = session.post(f"{JWXT_URL}/jsxsd/xskb/xskb_list.do", timeout=10)

        
        if resp.status_code != 200 or '<title>学期理论课表</title>' not in resp.text:
            return jsonify({'success': False, 'error': 'Cookie无效或已过期'})
        
        # 生成token
        token = secrets.token_urlsafe(32)
        
        # 保存用户信息
        cookies = {'TGC': tgc}
        save_user(token, cookies, semester_start)
        
        return jsonify({'success': True, 'token': token})
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'验证失败: {str(e)}'})


@app.route('/schedule/<token>')
def get_schedule(token):
    """获取课表ICS（订阅接口）"""
    # 获取用户信息
    user = get_user(token)
    if not user:
        return "Invalid token", 404
    
    try:
        # 获取课表
        html = fetch_schedule(user['cookies'])
        if not html:
            return "Failed to fetch schedule", 500
        
        # 解析课表
        courses = parse_schedule(html, user['semester_start'])
        if not courses:
            return "No courses found", 404
        
        # 生成ICS
        ics_data = generate_ics(courses)
        
        # 更新同步时间
        update_last_sync(token)
        
        # 返回ICS文件
        response = Response(ics_data, mimetype='text/calendar')
        response.headers['Content-Disposition'] = 'attachment; filename=schedule.ics'
        response.headers['Cache-Control'] = 'no-cache, must-revalidate'
        
        return response
        
    except Exception as e:
        return f"Error: {str(e)}", 500


@app.route('/api/stats')
def stats():
    """统计信息"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('SELECT COUNT(*) FROM users')
    total_users = c.fetchone()[0]
    
    c.execute('SELECT COUNT(*) FROM users WHERE last_sync IS NOT NULL')
    active_users = c.fetchone()[0]
    
    conn.close()
    
    return jsonify({
        'total_users': total_users,
        'active_users': active_users
    })


# ============= 启动服务 =============
if __name__ == '__main__':
    import urllib3
    urllib3.disable_warnings()
    
    # 初始化数据库
    init_db()
    
    print("="*60)
    print("📅 课表订阅服务启动")
    print("="*60)
    print("访问: http://localhost:5000")
    print("="*60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)