// ============= cache-manager.js - 缓存管理模块 =============
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const auth = require('./auth');
const parser = require('./parser');
const icalGenerator = require('./ical');
const db = require('./db');

// 缓存目录
const CACHE_DIR = path.join(__dirname, '../cache');
const CACHE_INDEX_FILE = path.join(CACHE_DIR, 'cache-index.json');

/**
 * 缓存配置
 * 每天的更新时间点（24小时制）
 */
const UPDATE_HOURS = [5, 13, 21]; // 每天 5:00、13:00、21:00 更新

/**
 * 初始化缓存目录
 */
async function initCacheDir() {
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        console.log('✅ 缓存目录已初始化');
    } catch (error) {
        console.error('❌ 初始化缓存目录失败:', error);
    }
}

/**
 * 获取缓存索引
 */
async function getCacheIndex() {
    try {
        const data = await fs.readFile(CACHE_INDEX_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

/**
 * 保存缓存索引
 */
async function saveCacheIndex(index) {
    await fs.writeFile(CACHE_INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * 生成缓存文件路径
 */
function getCacheFilePath(token) {
    const hash = crypto.createHash('md5').update(token).digest('hex');
    return path.join(CACHE_DIR, `${hash}.ics`);
}

/**
 * 计算下次更新时间
 */
function getNextUpdateTime() {
    const now = new Date();
    const currentHour = now.getHours();
    
    // 找到下一个更新时间点
    let nextHour = UPDATE_HOURS.find(h => h > currentHour);
    
    // 如果今天没有更新时间点了，使用明天的第一个时间点
    if (!nextHour) {
        nextHour = UPDATE_HOURS[0];
        now.setDate(now.getDate() + 1);
    }
    
    now.setHours(nextHour, 0, 0, 0);
    return now.getTime();
}

/**
 * 检查缓存是否过期
 */
function isCacheExpired(lastUpdate) {
    const now = Date.now();
    const nextUpdate = getNextUpdateTime();
    
    // 修正部分：强制把模变为正数
    let offset = (now - nextUpdate) % (24 * 60 * 60 * 1000);
    if (offset < 0) offset += (24 * 60 * 60 * 1000); 

    // 如果上次更新时间早于下一次更新时间，说明缓存已过期
    return lastUpdate < (now - offset);
}

/**
 * 生成并缓存课表
 */
async function generateAndCacheSchedule(token) {
    try {
        console.log(`🔄 生成课表缓存: ${token.substring(0, 16)}...`);
        
        // 获取用户信息
        const user = await db.getUser(token);
        
        if (!user) {
            throw new Error('用户不存在');
        }
        
        if (!user.cookieValid) {
            throw new Error('Cookie已过期');
        }
        
        // 获取课表数据
        const result = await auth.fetchSchedule(user.cookies);
        
        if (!result.success) {
            // Cookie失效，标记为无效
            await db.markCookieInvalid(token);
            throw new Error('Cookie已过期');
        }
        
        // 解析课表
        const courses = parser.parseSchedule(result.html, user.semesterStart);
        
        if (!courses.length) {
            throw new Error('未找到课程信息');
        }
        
        // 生成 ICS 文件
        const icsData = icalGenerator.generateICS(courses);
        
        // 保存到缓存文件
        const cacheFilePath = getCacheFilePath(token);
        await fs.writeFile(cacheFilePath, icsData, 'utf-8');
        
        // 更新缓存索引
        const cacheIndex = await getCacheIndex();
        cacheIndex[token] = {
            lastUpdate: Date.now(),
            nextUpdate: getNextUpdateTime(),
            courses: courses.length,
            username: user.username || user.userId || 'Unknown'
        };
        await saveCacheIndex(cacheIndex);
        
        // 更新数据库同步时间
        await db.updateLastSync(token);
        
        console.log(`✅ 缓存已更新: ${courses.length} 门课程`);
        
        return {
            success: true,
            icsData,
            courses: courses.length
        };
        
    } catch (error) {
        console.error('❌ 生成缓存失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 获取缓存的课表（如果过期则重新生成）
 */
async function getCachedSchedule(token) {
    const cacheFilePath = getCacheFilePath(token);
    const cacheIndex = await getCacheIndex();
    const cacheInfo = cacheIndex[token];
    
    // 检查缓存是否存在且有效
    if (cacheInfo && !isCacheExpired(cacheInfo.lastUpdate)) {
        try {
            const icsData = await fs.readFile(cacheFilePath, 'utf-8');
            console.log(`📦 使用缓存: ${token.substring(0, 16)}... (下次更新: ${new Date(cacheInfo.nextUpdate).toLocaleString('zh-CN')})`);
            
            return {
                success: true,
                icsData,
                fromCache: true,
                lastUpdate: cacheInfo.lastUpdate,
                nextUpdate: cacheInfo.nextUpdate
            };
        } catch {
            // 缓存文件不存在，重新生成
            console.log('⚠️  缓存文件不存在，重新生成...');
        }
    } else {
        console.log('⏰ 缓存已过期或不存在，重新生成...');
    }
    
    // 缓存不存在或已过期，重新生成
    const result = await generateAndCacheSchedule(token);
    
    if (result.success) {
        return {
            ...result,
            fromCache: false,
            lastUpdate: Date.now(),
            nextUpdate: getNextUpdateTime()
        };
    }
    
    return result;
}

/**
 * 清理所有缓存
 */
async function clearAllCache() {
    try {
        const files = await fs.readdir(CACHE_DIR);
        
        for (const file of files) {
            if (file.endsWith('.ics')) {
                await fs.unlink(path.join(CACHE_DIR, file));
            }
        }
        
        await fs.unlink(CACHE_INDEX_FILE);
        console.log('✅ 所有缓存已清理');
        
        return true;
    } catch (error) {
        console.error('❌ 清理缓存失败:', error);
        return false;
    }
}

/**
 * 清理指定用户的缓存
 */
async function clearUserCache(token) {
    try {
        const cacheFilePath = getCacheFilePath(token);
        await fs.unlink(cacheFilePath);
        
        const cacheIndex = await getCacheIndex();
        delete cacheIndex[token];
        await saveCacheIndex(cacheIndex);
        
        console.log(`✅ 用户缓存已清理: ${token.substring(0, 16)}...`);
        return true;
    } catch (error) {
        console.error('❌ 清理用户缓存失败:', error);
        return false;
    }
}

/**
 * 定时更新所有缓存
 */
async function updateAllCaches() {
    try {
        console.log('🔄 开始定时更新所有缓存...');
        
        const cacheIndex = await getCacheIndex();
        const tokens = Object.keys(cacheIndex);
        
        console.log(`📊 共 ${tokens.length} 个用户需要更新`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const token of tokens) {
            const result = await generateAndCacheSchedule(token);
            
            if (result.success) {
                successCount++;
            } else {
                failCount++;
            }
            
            // 避免请求过快，等待1秒
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`✅ 缓存更新完成: 成功 ${successCount} 个, 失败 ${failCount} 个`);
        
        return { successCount, failCount };
        
    } catch (error) {
        console.error('❌ 定时更新失败:', error);
        return { successCount: 0, failCount: 0 };
    }
}

/**
 * 启动定时任务
 */
function startScheduledUpdate() {
    // 计算距离下次更新的时间
    const now = new Date();
    const nextUpdate = getNextUpdateTime();
    const delay = nextUpdate - now.getTime();
    
    console.log(`⏰ 下次自动更新时间: ${new Date(nextUpdate).toLocaleString('zh-CN')}`);
    
    setTimeout(async () => {
        await updateAllCaches();
        
        // 递归调用，设置下一次更新
        startScheduledUpdate();
    }, delay);
}

/**
 * 获取缓存统计信息
 */
async function getCacheStats() {
    try {
        const cacheIndex = await getCacheIndex();
        const tokens = Object.keys(cacheIndex);
        
        let totalSize = 0;
        
        for (const token of tokens) {
            const cacheFilePath = getCacheFilePath(token);
            try {
                const stats = await fs.stat(cacheFilePath);
                totalSize += stats.size;
            } catch {
                // 文件不存在
            }
        }
        
        return {
            totalUsers: tokens.length,
            totalSize: (totalSize / 1024).toFixed(2) + ' KB',
            nextUpdate: getNextUpdateTime(),
            updateHours: UPDATE_HOURS
        };
    } catch (error) {
        console.error('❌ 获取缓存统计失败:', error);
        return null;
    }
}

module.exports = {
    initCacheDir,
    getCachedSchedule,
    generateAndCacheSchedule,
    clearAllCache,
    clearUserCache,
    updateAllCaches,
    startScheduledUpdate,
    getCacheStats,
    UPDATE_HOURS
};