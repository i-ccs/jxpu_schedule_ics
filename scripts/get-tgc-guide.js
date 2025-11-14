// =====================================
// 文件: scripts/get-tgc-guide.js
// 用途: 显示如何获取TGC的详细指南
// 使用: node scripts/get-tgc-guide.js
// =====================================

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    📖 获取TGC Cookie指南                        ║
╚════════════════════════════════════════════════════════════════╝

🌐 步骤1: 打开浏览器登录
   访问: https://sso.jxpu.edu.cn/cas/login
   
   输入你的学号和密码登录

📱 步骤2: 打开开发者工具
   
   Windows/Linux:
   - Chrome: 按 F12 或 Ctrl+Shift+I
   - Firefox: 按 F12 或 Ctrl+Shift+I
   
   macOS:
   - Chrome: 按 Cmd+Option+I
   - Safari: 按 Cmd+Option+C

🔍 步骤3: 查找TGC Cookie
   
   在开发者工具中:
   
   Chrome/Edge:
   1. 点击顶部 "Application" 标签
   2. 左侧展开 "Cookies"
   3. 点击 "https://sso.jxpu.edu.cn"
   4. 在右侧列表中找到 "TGC"
   5. 双击 "Value" 列的值来复制
   
   Firefox:
   1. 点击顶部 "存储" 标签
   2. 左侧展开 "Cookie"
   3. 点击 "https://sso.jxpu.edu.cn"
   4. 找到 "TGC" 行
   5. 双击 "值" 列来复制
   
   Safari:
   1. 点击顶部 "存储" 标签
   2. 左侧选择 "Cookie"
   3. 找到 "sso.jxpu.edu.cn"
   4. 在右侧找到 TGC
   5. 复制其值

📋 步骤4: 验证TGC格式
   
   正确的TGC格式应该类似:
   TGT-123456-abcdefghijklmnopqrstuvwxyz-cas
   
   长度: 通常 40-100 个字符
   包含: 字母、数字、横线(-)

✅ 步骤5: 测试TGC
   
   使用测试脚本验证:
   node scripts/test-sso.js TGT-你的TGC值

⚠️  注意事项:
   
   1. TGC有效期通常为 2-8 小时
   2. 登出后TGC立即失效
   3. 不要分享你的TGC（相当于密码）
   4. 如果失效，重新登录获取新的TGC

💡 快速技巧:
   
   - 可以用 document.cookie 在控制台查看所有Cookie
   - 在Console输入: document.cookie
   - 找到 TGC= 后面的值

🔧 常见问题:
   
   Q: 找不到TGC Cookie?
   A: 确保已经成功登录，刷新页面后再查看
   
   Q: TGC值为空?
   A: 可能是Cookie被清除了，重新登录
   
   Q: 复制的TGC不工作?
   A: 检查是否完整复制，不要包含 "TGC=" 前缀

════════════════════════════════════════════════════════════════
                       准备好了？开始测试！
════════════════════════════════════════════════════════════════
`);
