/**
 * @name WuWa Story Database (Global Shared)
 * @description 剧情数据的唯一真理源。修改这里的列表，所有脚本都会同步更新。
 */

// ==========================================
// 1. 数据定义区 (在此处修改剧情)
// ==========================================
const rawStoryText = `
v1.0 Part 1: 但觉今州胜旧州 (上)
v1.0 Part 2: 但觉今州胜旧州 (中)
v1.0 Part 3: 但觉今州胜旧州 (下)
v1.1 Part 1: 往岁乘霄醒惊蛰 (上)
v1.1 Part 2: 往岁乘霄醒惊蛰 (中)
v1.1 Part 3: 往岁乘霄醒惊蛰 (下)
v1.1 Part 4: 长离伴星-离火弈长生 (上)
v1.1 Part 5: 长离伴星-离火弈长生 (下)
v1.2 Part 1: 天上月华人如愿 (上)
v1.2 Part 2: 天上月华人如愿 (下)
v1.2 Part 3: 折枝伴星-自问丹青
v1.3 Part 1: 行至海岸尽头 (上)
v1.3 Part 2: 行至海岸尽头 (中)
v1.3 Part 3: 行至海岸尽头 (下)
v1.4 Part 1: 椿伴星-小径分叉的星海
v2.0 Part 1: 致缄默以欢歌 (上)
v2.0 Part 2: 致缄默以欢歌 (中)
v2.0 Part 3: 致缄默以欢歌 (下)
v2.0 Part 4: 珂莱塔伴星-如果在雨夜，一个家族 (上)
v2.0 Part 5: 珂莱塔伴星-如果在雨夜，一个家族 (下)
v2.1 Part 1: 叶落无声
v2.1 Part 2: 老人鱼海
v2.2 Part 1: 圣者，忤逆者，告死者 (上)
v2.2 Part 2: 圣者，忤逆者，告死者 (中)
v2.2 Part 3: 圣者，忤逆者，告死者 (下)
v2.2 Part 4: 坎特蕾拉伴星-幽夜幻梦 (上)
v2.2 Part 5: 坎特蕾拉伴星-幽夜幻梦 (下)
v2.3 Part 1: 唯你的长夏永不凋落 (上)
v2.3 Part 2: 唯你的长夏永不凋落 (下)
v2.3 Part 3: 赞妮伴星-夜行的焰光 (上)
v2.3 Part 4: 赞妮伴星-夜行的焰光 (下)
v2.4 Part 1: 荣耀暗面 (上)
v2.4 Part 2: 荣耀暗面 (下)
v2.5 Part 1: 捕梦于神秘园中 (上)
v2.5 Part 2: 捕梦于神秘园中 (中)
v2.5 Part 3: 捕梦于神秘园中 (下)
v2.6 Part 1: 灼我以烈阳
v2.6 Part 2: 今夜，注定属于月亮
v2.7 Part 1: 暗潮将映的黎明 (上)
v2.7 Part 2: 暗潮将映的黎明 (中)
v2.7 Part 3: 暗潮将映的黎明 (下)
v2.8 Part 1: 曙光停摆于荒地之上 (上)
v2.8 Part 2: 曙光停摆于荒地之上 (下)
v3.0 Part 1: 冰原下的星炬 (上)
v3.0 Part 2: 冰原下的星炬 (下)
v3.0 Part 3: 致第二次日出 (上)
v3.0 Part 4: 致第二次日出 (下)
v3.1 Part 1: 远航星 (上)
v3.1 Part 2: 远航星 (中)
v3.1 Part 3: 远航星 (下)
v3.1 Part 4: 日光落处 (上)
v3.1 Part 5: 日光落处 (下)
v3.2 Part 1: 影下不落的黄金 (上)
v3.2 Part 2: 影下不落的黄金 (中)
v3.2 Part 3: 影下不落的黄金 (下)
v3.2 Part 4: 影面颠倒的兔影
v3.3 Part 1: 昨夜群星 (上)
v3.3 Part 2: 昨夜群星 (中)
v3.3 Part 3: 昨夜群星 (下)
v3.3 Part 4: 春风祝颂你的旅途
v3.3 Part 5: 在熔解的夜空下 (上)
v3.3 Part 6: 在熔解的夜空下 (中)
v3.3 Part 7: 在熔解的夜空下 (下)
v3.4 Part 1: 边缘行者联动 - 边缘幻梦 (上)
v3.4 Part 2: 边缘行者联动 - 边缘幻梦 (中)
v3.4 Part 3: 边缘行者联动 - 边缘幻梦 (下)
v3.4 Part 4: 我们选择天空 (上)
v3.4 Part 5: 我们选择天空 (下)
`;

// ==========================================
// 2. 解析逻辑 (私有)
// ==========================================
const parseStory = (text) => {
    const lines = text.trim().split('\n');
    const versions = [];
    let currentVer = null;
    const regex = /v\s*(\d+\.\d+)\s+Part\s+(\d+)\s*[:：]\s*(.+)/i;
    const regexSimple = /v\s*(\d+\.\d+)\s+Part\s+(\d+)\s*$/i;
    const regexNoPart = /v\s*(\d+\.\d+)\s*[:：]\s*(.+)/i;

    lines.forEach(line => {
        if (!line.trim()) return;
        let verNum, partNum, title;
        let match = line.match(regex);
        if (match) {
            verNum = match[1]; partNum = parseInt(match[2]); title = match[3].trim();
        } else {
            match = line.match(regexSimple);
            if (match) {
                verNum = match[1]; partNum = parseInt(match[2]); title = "未知章节";
            } else {
                match = line.match(regexNoPart);
                if (match) {
                    verNum = match[1]; partNum = 1; title = match[2].trim();
                }
            }
        }
        if (match) {
            if (!currentVer || currentVer.version !== verNum) {
                currentVer = { version: verNum, parts: [] };
                versions.push(currentVer);
            }
            while (currentVer.parts.length < partNum - 1) { currentVer.parts.push("未知过渡章节"); }
            currentVer.parts.push(title);
        }
    });
    return versions;
};

// ==========================================
// 3. 全局暴露逻辑 (暴力穿透)
// ==========================================
const STORY_MAP = parseStory(rawStoryText);

const SharedData = {
    STORY_MAP: STORY_MAP,
    rawStoryText: rawStoryText, // 暴露原始文本以备不时之需
    isReady: true
};

(function exposeGlobal() {
    // 挂载目标列表
    const targets = [
        typeof globalThis !== 'undefined' ? globalThis : null,
        typeof window !== 'undefined' ? window : null,
        typeof top !== 'undefined' ? top : null,
        typeof parent !== 'undefined' ? parent : null,
    ];

    let successCount = 0;
    targets.forEach(target => {
        if (target) {
            try {
                // 核心命名空间：WuWaShared
                target.WuWaShared = SharedData;
                successCount++;
            } catch (e) { /* 忽略跨域报错 */ }
        }
    });
    
    console.log(`[剧情数据库] 已挂载到 ${successCount} 个全局对象`);
})();