/**
 * @name WuWa 剧情控制台 & 逻辑核心 (v3.5.0 - UI 紧凑化+大小切换版)
 * @description 适配了“即将进行的下一个事件节点”变量。
 * @description ★ 修改：数据源已解耦，现在强制读取全局 WuWaShared 数据，不再硬编码剧情文本。
 * @description ★ 新增：下拉框版本选择、后日谈快捷跳转、生命周期自动清理、后日谈推进警告。
 * @description ★ v3.5.0：UI 重设计(小模式174px/毛玻璃透明底/剧情区块+图标按钮+网格信息卡，参照StoryUI_Draft)；大小切换按钮(📐/📏,1.5x，参照WorldInfoController逐值缩放避免拖拽坐标错乱)；额外信息栏(楼层/后日谈/过渡/剧情权重)默认折叠；按钮文字改为"推进至下一章节"/"强制切换后日谈"。
 * @version 3.5.0
 */

// ==========================================
// 0. 数据源获取 (带异步重试机制)
// ==========================================

// 将其改为可变变量，等待异步加载
let STORY_MAP = [];

// 强力异步获取全局共享数据的函数 (最多尝试 3 次)
async function ensureGlobalStoryMap() {
    if (STORY_MAP.length > 0) return true;

    const targets = [
        typeof globalThis !== 'undefined' ? globalThis : null,
        typeof window !== 'undefined' ? window : null,
        typeof top !== 'undefined' ? top : null,
        typeof parent !== 'undefined' ? parent : null,
    ];

    for (let i = 0; i < 3; i++) {
        for (const target of targets) {
            if (target && target.WuWaShared && Array.isArray(target.WuWaShared.STORY_MAP)) {
                console.log(`[StoryCtrl] 成功从全局对象读取到剧情数据库 (第 ${i + 1} 次尝试)。`);
                STORY_MAP = target.WuWaShared.STORY_MAP;
                return true;
            }
        }
        
        console.warn(`[StoryCtrl] 暂未读取到剧情数据库，等待 1 秒后重试... (${i + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.error("【严重错误】连续 3 次无法找到全局剧情数据库 (WuWaShared)！");
    if (typeof toastr !== 'undefined') toastr.error("剧情控制台启动失败：Database Missing！");
    return false;
}

// 辅助函数：生成显示用的标题字符串
function getStoryDisplayString(majorVerIdx, partIdx, isPostScript) {
    // 安全检查：如果数据库为空，直接返回错误
    if (!STORY_MAP || STORY_MAP.length === 0) return "Database Missing";

    if (majorVerIdx >= STORY_MAP.length) majorVerIdx = STORY_MAP.length - 1;
    const currentVerObj = STORY_MAP[majorVerIdx];
    if (!currentVerObj) return "Data Error";

    if (partIdx >= currentVerObj.parts.length) partIdx = currentVerObj.parts.length - 1;
    const rawTitle = currentVerObj.parts[partIdx];
    const verStr = currentVerObj.version;
    const partVal = partIdx + 1;

    if (isPostScript) {
        const cleanTitle = rawTitle.replace(/\s*[（\(](上|中|下)[）\)]/g, '');
        return `v${verStr} 后日谈: ${cleanTitle} (已完结)`;
    } else {
    return `v${verStr} Part ${partVal}: ${rawTitle}`;
    }
}

// ==========================================
// 0.5 好感度 → 态度映射函数
// ==========================================
function getAttitudeByFavorability(favorability) {
    if (favorability < 10) return '对主角心怀戒备与排斥，将其视为不受欢迎的存在，本能地抵触与之有所牵扯';
    if (favorability < 20) return '对主角尚不熟悉，内心未建立明确印象，彼此间谈不上喜恶';
    if (favorability < 30) return '对主角既无特别好感也无明显恶感，视为普通的相识之人';
    if (favorability < 40) return '与主角有过一些往来，算得上脸熟，但还称不上了解，相处仍带客套';
    if (favorability < 50) return '与主角已不再陌生，内心将其视作认识的人，相处时较为自在';
    if (favorability < 60) return '对主角抱有正面的情感倾向，内心愿意与之建立更深的联系';
    if (favorability < 70) return '对主角的在意已超出寻常好感，内心格外留心对方的一举一动';
    if (favorability < 80) return '对主角有明显的喜爱与信赖，内心将其视为值得在意的人';
    if (favorability < 90) return '对主角怀有真切的爱慕，内心将其视为格外重要、令自己心动的人';
    if (favorability < 100) return '对主角的爱意真挚而笃定，内心已将其视作不可替代的存在';
    return '对主角的爱意真挚而深沉，内心将其视为珍视至极、难以割舍的人';
}
// ==========================================
// 1. 核心逻辑处理函数 (保持原样)
// ==========================================
function calculateStoryLogic(stat_data) {

    if (!stat_data) return stat_data;
    const data = _.cloneDeep(stat_data);

    // ★ 自动清理已删除的变量字段（角色称号、特写、偏爱玩法）
    if (data.女性角色) {
        Object.keys(data.女性角色).forEach(key => {
            const char = data.女性角色[key];
            if (char.额外信息 && char.额外信息.角色称号 !== undefined) delete char.额外信息.角色称号;
            if (char.特写 !== undefined) delete char.特写;
            if (char.私密资料 && char.私密资料.偏爱玩法 !== undefined) delete char.私密资料.偏爱玩法;
        });
    }

    let { majorVerIdx, partIdx, isPostScript, _anchorVer } = data._storyState || { majorVerIdx: 0, partIdx: 0, isPostScript: false };

    // --- 过期清理逻辑 ---
    const currentDepth = typeof getLastMessageId === 'function' ? getLastMessageId() : 0;
    const triggerDepth = data._trans_depth !== undefined ? data._trans_depth : -999;
    
    // 只有当当前楼层超过触发楼层+1时，才视为结束
    if (data._trans_prompt && currentDepth > triggerDepth + 1) {
        console.log(`[StoryLogic] 过渡期结束，清理所有临时数据。`);
        data._trans_prompt = null;
        data._trans_depth = null;
        data._backupContext = null; 
    }

    // 锚点校验
    if (_anchorVer) {
        const currentObj = STORY_MAP[majorVerIdx];
        if (!currentObj || currentObj.version !== _anchorVer) {
            const correctIdx = STORY_MAP.findIndex(v => v.version === _anchorVer);
            if (correctIdx !== -1) {
                majorVerIdx = correctIdx;
            }
        }
    }

    const cmd = data.指令 || {};

    // 1. 高潮重置
    if (cmd.重置高潮计数_角色名) {
        const targetName = cmd.重置高潮计数_角色名.trim();
        if (['主角', 'user', 'me'].includes(targetName.toLowerCase())) {
            if (data.主角信息?.性爱状态) data.主角信息.性爱状态.高潮计数 = 0;
        }
        else if (data.女性角色 && data.女性角色[targetName]?.性爱状态) {
            data.女性角色[targetName].性爱状态.高潮计数 = 0;
        }
    }

    // 2. 跳转版本 (支持下拉框的精准索引跳转 & 文本正则跳转保留做兼容)
if (cmd.跳转版本_选项) {
    const targetMajor = cmd.跳转版本_选项.v;
    const targetPart = cmd.跳转版本_选项.p;
    const targetPS = cmd.跳转版本_选项.ps;

    if (STORY_MAP[targetMajor]) {
        majorVerIdx = targetMajor;
        partIdx = targetPart;               // ✅ 始终使用用户选择的 Part
        isPostScript = targetPS;           // ✅ 直接采用用户勾选的后日谈状态
    }
}
    else if (cmd.跳转版本) {
        const jumpInput = cmd.跳转版本.trim();
        const jumpRegex = /v?(\d+\.\d+)(?:\s+Part\s+(\d+))?/i;
        const match = jumpInput.match(jumpRegex);
        if (match) {
            const targetVer = match[1];
            const targetPartNum = match[2] ? parseInt(match[2]) : 1;
            const targetIdx = STORY_MAP.findIndex(ver => ver.version === targetVer);
            if (targetIdx !== -1) {
                majorVerIdx = targetIdx;
                const maxParts = STORY_MAP[targetIdx].parts.length;
                partIdx = Math.max(0, Math.min(targetPartNum - 1, maxParts - 1));
                
                // UI跳转强制PS=false，除非有明确指令
                if (cmd.修改后日谈模式为 !== null && cmd.修改后日谈模式为 !== undefined) {
                      isPostScript = cmd.修改后日谈模式为 === true;
                } else {
                      isPostScript = false;
                }
            }
        }
    }
    // 单独的后日谈修改
    else if (cmd.修改后日谈模式为 !== null && cmd.修改后日谈模式为 !== undefined) {
        isPostScript = cmd.修改后日谈模式为 === true;
    }

        // 3. 推进剧情（统一后日谈推进逻辑）
    if (cmd.推进剧情 === true) {
        const currentVerData = STORY_MAP[majorVerIdx];
        if (currentVerData) {
            const totalParts = currentVerData.parts.length;
            if (isPostScript) {
                // 后日谈推进：区分是否为本版本最后一个 Part
                if (partIdx >= totalParts - 1) {
                    // 当前版本最后一个 Part 的后日谈 → 跳版本
                    isPostScript = false;
                    majorVerIdx += 1;
                    partIdx = 0;
                    if (majorVerIdx >= STORY_MAP.length) {
                        // 已经是最终版本，无法推进，回退状态并提示
                        majorVerIdx = STORY_MAP.length - 1;
                        isPostScript = true;
                        if (typeof toastr !== 'undefined') toastr.warning("已是最终版本后日谈，无法继续推进。");
                    }
                } else {
                    // 非最后 Part 的后日谈 → 进入下一个 Part，退出后日谈
                    isPostScript = false;
                    partIdx += 1;
                }
            } else if (partIdx >= totalParts - 1) {
                // 非后日谈，当前是最后 Part → 进入后日谈
                isPostScript = true;
            } else {
                // 非后日谈，非最后 Part → 正常推进
                partIdx += 1;
            }
        }

        data.已完成的上一个事件 = data.当前演绎事件 || '无';
        data.已完成的上一个事件节点 = data.当前演绎事件节点 || '无';

        const newDisplayString = getStoryDisplayString(majorVerIdx, partIdx, isPostScript);
        data.当前演绎事件 = `【${newDisplayString}】的初始阶段，处于最新章节的第一部分，请将当前事件和当前节点更新为对应章节的“主线事件1”和其第一个节点，并根据当前所处场景，为全新的剧情进行铺垫和衔接性演绎。`;
        data.当前演绎事件节点 = `等待AI填入对应节点完整信息`;
        // ★ 新增：同步初始化下一节点
        data.即将进行的下一个事件节点 = `等待AI填入对应节点完整信息`;
    }

    // 4. 计算显示
    let displayString = '';
    let weightValue = 0;
    
    displayString = getStoryDisplayString(majorVerIdx, partIdx, isPostScript);
    
    if (majorVerIdx >= STORY_MAP.length) majorVerIdx = STORY_MAP.length - 1;
    const currentVerObj = STORY_MAP[majorVerIdx];
    const currentAnchorVer = currentVerObj ? currentVerObj.version : '1.0';
    if (currentVerObj) {
        const verStr = currentVerObj.version;
        const [major, minor] = verStr.split('.').map(n => parseInt(n) || 0);
        const partVal = partIdx + 1;
        const baseWeight = (major * 1000) + (minor * 100);
        if (isPostScript) {
            weightValue = baseWeight + 1 + partVal;
        } else {
            weightValue = baseWeight + partVal;
        }
    }

    // 5. 角色显隐
    const visibleCharacters = {};
    // ★ 修改：不再继承旧的_已知角色名单，而是每次清空。
    // 这样只要角色从 [女性角色] 里被删除了，名单里也会瞬间清理干净，不会留下幽灵名字。
    const knownCharacterSet = new Set(); 

    if (data.女性角色) {
        Object.keys(data.女性角色).forEach(key => {
            const char = data.女性角色[key];
            knownCharacterSet.add(key); // 只有当前真正存在的角色，才会被加入已知名单

            // ★ 核心：每次逻辑循环都根据当前好感度实时计算 _对主角的态度
            const favorability = char.好感度 !== undefined ? char.好感度 : 0;
            char._对主角的态度 = getAttitudeByFavorability(favorability);

        if (char.是否在场 === true) {
            visibleCharacters[key] = char;
        } else {
            // 不在场的角色：隐藏 _对主角的态度，只展示最基本信息
            visibleCharacters[key] = {
                是否在场: false,
                好感度: favorability,
                外貌特征: char.基础信息?.外貌 || '暂无描述',
                _提示: "若需召唤，请将[是否在场]改为true"
            };
        }
        });
    }

    // 5b. 精简模式展示键（与 _现场女性角色显示 平行计算，互不干扰；仅在精简模式条目里被读取）
    const minimalChars = {};
    if (data.女性角色) {
        Object.keys(data.女性角色).forEach(key => {
            const char = data.女性角色[key];
            if (char.是否在场 === true) {
                // 在场：只保留现场可见字段（声痕位置不保留，属界面隐藏项）
                minimalChars[key] = {
                    是否在场: true,
                    性爱状态: char.性爱状态,
                };
            } else {
                minimalChars[key] = { 是否在场: false };
            }
        });
    }
    let minimalPlayer = null;
    if (data.主角信息) {
        const p = data.主角信息;
        minimalPlayer = {
            是否是漂泊者: p.是否是漂泊者,
            性别: p.性别,
            身份与额外设定: p.身份与额外设定 || '',
            性爱状态: p.性爱状态,
        };
    }


    data._storyState = { majorVerIdx, partIdx, isPostScript, _anchorVer: currentAnchorVer };
    // 重置指令 (加入了对下拉框选项的重置)
    data.指令 = { 推进剧情: null, 跳转版本: null, 跳转版本_选项: null, 修改后日谈模式为: null, 重置高潮计数_角色名: null };
    data.是否为后日谈 = String(isPostScript);
    data.剧情显示 = displayString;
    data.剧情权重 = weightValue;
    data._现场女性角色显示 = visibleCharacters;
    data._精简模式女性角色显示 = minimalChars;
    data._精简模式主角信息显示 = minimalPlayer;
    data._已知角色名单 = Array.from(knownCharacterSet);

    return data;
}

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// 核心修复：强力穿透暴露
// 我们将函数挂载到所有可能的全局对象上，确保 UI 能够访问
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
(function exposeLogic() {
    try {
        if (typeof globalThis !== 'undefined') globalThis.calculateStoryLogic = calculateStoryLogic;
        if (typeof window !== 'undefined') window.calculateStoryLogic = calculateStoryLogic;
        if (typeof top !== 'undefined' && top !== window) {
            try { top.calculateStoryLogic = calculateStoryLogic; } catch(e){}
        }
        console.log("[StoryCtrl] 逻辑函数已强制全局暴露");
    } catch (e) {
        console.error("[StoryCtrl] 暴露函数严重失败:", e);
    }
})();

// ==========================================
// 1.1 严格同步注入逻辑
// ==========================================
function syncInjections(data) {
    if (!data) return;
    
    const TRANS_ID = 'Story_Transition_Prompt';
    
    if (data._trans_prompt && typeof data._trans_prompt === 'string' && data._trans_prompt.length > 0) {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id: TRANS_ID, content: data._trans_prompt, position: 'in_chat', 
                depth: 0, role: 'system', should_scan: false
            }]);
        }
    } else {
        if (typeof uninjectPrompts === 'function') {
            uninjectPrompts([TRANS_ID, 'Chapter_Transition_Guide', 'OneOff_Transition_Guide']); 
        }
    }

    const TITLE_ID = 'Plot_Title_Trigger';
    if (data.剧情显示 && data.剧情显示 !== 'Data Error') {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id: TITLE_ID, content: `当前激活的剧情章节：${data.剧情显示}`,
                position: 'none', role: 'system', should_scan: true,
            }]);
        }
    }

    const LOC_ID = 'Location_Scan_Trigger';
    if (data.所在地点) {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id: LOC_ID, content: data.所在地点,
                position: 'none', role: 'system', should_scan: true,
            }]);
        }
    }
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // 修改确认：预载下一个节点（只触发绿灯，绝对不发给AI）
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const NEXT_NODE_ID = 'Next_Node_Scan_Trigger';
	
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // 修改一：预载当前节点（只触发绿灯，绝对不发给AI）
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const CURRENT_NODE_ID = 'Current_Node_Scan_Trigger';
    
    if (data.当前演绎事件节点 && data.当前演绎事件节点 !== '无') {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id: CURRENT_NODE_ID,
                content: `[系统预扫描]当前事件节点：${data.当前演绎事件节点}`,
                position: 'none',  // 绝对不会发给 AI，不占用 token
                depth: 0,
                role: 'system', 
                should_scan: true, // 允许酒馆根据这段文本搜索并激活世界书绿灯
            }]);
        }
    } else {
        // 如果当前节点为空或“无”，及时清理遗留的注入
        if (typeof uninjectPrompts === 'function') uninjectPrompts([CURRENT_NODE_ID]);
    }
    // 检查变量是否存在且不为空
    if (data.即将进行的下一个事件节点 && data.即将进行的下一个事件节点 !== '无') {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id: NEXT_NODE_ID,
                content: `[系统预扫描]即将进行的事件节点：${data.即将进行的下一个事件节点}`,
                // 【核心设置】
                // position: 'none' -> 绝对不会发给 AI，不占用 token，不干扰 AI 理解剧情
                // should_scan: true -> 允许酒馆根据这段文本去搜索并激活世界书(绿灯)
                position: 'none', 
                depth: 0,
                role: 'system', 
                should_scan: true, 
            }]);
        }
    }
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // 新增：漂泊者身份预扫描触发（只触发绿灯，绝对不发给AI）
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const ROVER_IDENTITY_ID = 'Rover_Identity_Scan_Trigger';
    
    // 严谨校验：确保 主角信息 对象存在，且 是否是漂泊者 严格为 true
    if (data.主角信息 && data.主角信息.是否是漂泊者 === true) {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id: ROVER_IDENTITY_ID,
                content: `漂泊者`,         // 纯文本关键字，用于精准击中绿灯的 keys
                position: 'none',        // 静默模式：绝对不会发给 AI，零 token 消耗
                depth: 0,
                role: 'system', 
                should_scan: true,       // 允许酒馆根据这段文本去搜索并激活世界书(绿灯)
            }]);
        }
    } else {
        // 保持你代码的一贯风格：条件不满足时，干净地清理掉遗留的注入
        if (typeof uninjectPrompts === 'function') {
            uninjectPrompts([ROVER_IDENTITY_ID]);
        }
    }
}

// ==========================================
// 2. UI 构建与交互
// ==========================================
// 大小模式状态（参照 WorldInfoController.js 的 floatSizeMode 机制）
// 缩放采用 JS 逐值计算尺寸，避免 CSS zoom/transform:scale 导致 jQuery UI draggable 坐标错乱
let UI_SIZE_MODE = 'large';        // 'small' | 'large' (large = 1.5x)
let UI_POS = { top: '100px', right: '20px' };  // 悬浮窗位置状态（拖动后持久化）
let UI_EXTRA_EXPANDED = false;     // 额外信息栏展开状态
let UI_DARK_MODE = true;          // 深色/浅色模式 (true=深色 / false=浅色)，存全局变量 wuwa_story_ui_dark

// 读取深浅色模式（global 变量，跨会话持久）
async function loadUiDarkMode() {
    try {
        const g = await getVariables({ type: 'global' });
        if (g && g.wuwa_story_ui_dark !== undefined) {
            UI_DARK_MODE = g.wuwa_story_ui_dark === true;
        }
    } catch(e) {}
}
// 写入深浅色模式
async function saveUiDarkMode() {
    try {
        await updateVariablesWith(v => { _.set(v, 'wuwa_story_ui_dark', UI_DARK_MODE); return v; }, { type: 'global' });
    } catch(e) {}
}

// 读取大小模式（global 变量 wuwa_story_ui_size，跨会话持久）
async function loadUiSizeMode() {
    try {
        const g = await getVariables({ type: 'global' });
        if (g && g.wuwa_story_ui_size !== undefined) {
            UI_SIZE_MODE = g.wuwa_story_ui_size === 'large' ? 'large' : 'small';
        }
    } catch(e) {}
}
// 写入大小模式
async function saveUiSizeMode() {
    try {
        await updateVariablesWith(v => { _.set(v, 'wuwa_story_ui_size', UI_SIZE_MODE); return v; }, { type: 'global' });
    } catch(e) {}
}

const UI_ID = 'wuwa-story-ui';

// 根据缩放因子生成样式；sc=1 小模式, sc=1.5 大模式
// 基准（小模式）已整体缩小：字体 11px、宽度 220px，使界面更紧凑
// 根据缩放因子生成样式；sc=1 小模式(174px), sc=1.5 大模式(261px)
// 设计参照 StoryUI_Draft.html：毛玻璃透明底 + 左竖条剧情区块 + 图标按钮 + 网格信息卡
// 根据缩放因子生成样式；sc=1 小模式(170px), sc=1.5 大模式(255px)
// 设计参照 StoryUI_Draft.html：简约毛玻璃风（半透明+backdrop-blur，无渐变拟物）
function buildUiStyles(sc) {
    // 配色：根据 UI_DARK_MODE 选深/浅色
    const C = UI_DARK_MODE ? {
        bg: 'rgba(13, 17, 23, 0.55)', border: 'rgba(56, 139, 253, 0.18)', text: '#c9d1d9',
        title: '#58a6ff', storyTag: '#58a6ff', storyName: '#f0cc5f',
        boxBg: 'rgba(56, 139, 253, 0.06)', boxBorder: 'rgba(88, 166, 255, 0.4)', tagBg: 'rgba(88,166,255,0.12)',
        btnBg: 'rgba(88, 166, 255, 0.09)', btnBorder: 'rgba(88, 166, 255, 0.14)', btnHoverBg: 'rgba(88, 166, 255, 0.2)', btnHoverBorder: 'rgba(88, 166, 255, 0.35)', btnHoverText: '#fff',
        dangerText: '#ff8b82', dangerBg: 'rgba(255, 123, 114, 0.1)', dangerBorder: 'rgba(255, 123, 114, 0.15)', dangerHoverBg: 'rgba(255, 123, 114, 0.2)', dangerHoverText: '#ffb4ad',
        lockedBg: 'rgba(63, 185, 80, 0.1)', lockedBorder: 'rgba(63, 185, 80, 0.2)', lockedText: '#7ee787',
        foldText: '#9aa4b2', foldHover: '#58a6ff', foldHoverBg: 'rgba(56,139,253,0.05)',
        cellBg: 'rgba(255, 255, 255, 0.05)', cellK: '#9aa4b2',
        valY: '#f0cc5f', valG: '#7ee787', valO: '#ffa657', valR: '#ff7b72', valD: '#9aa4b2',
        selectBg: 'rgba(13,17,23,0.7)', selectBorder: 'rgba(139,148,158,0.2)', labelText: '#9aa4b2',
        headBg: 'rgba(255, 255, 255, 0.03)'
    } : {
        bg: 'rgba(245, 247, 250, 0.55)', border: 'rgba(56, 139, 253, 0.4)', text: '#1e293b',
        title: '#0284c7', storyTag: '#0284c7', storyName: '#b45309',
        boxBg: 'rgba(56, 139, 253, 0.1)', boxBorder: 'rgba(2, 132, 199, 0.5)', tagBg: 'rgba(2,132,199,0.15)',
        btnBg: 'rgba(56, 139, 253, 0.12)', btnBorder: 'rgba(56, 139, 253, 0.3)', btnHoverBg: 'rgba(56, 139, 253, 0.25)', btnHoverBorder: 'rgba(56, 139, 253, 0.5)', btnHoverText: '#0c4a6e',
        dangerText: '#b91c1c', dangerBg: 'rgba(220, 38, 38, 0.1)', dangerBorder: 'rgba(220, 38, 38, 0.25)', dangerHoverBg: 'rgba(220, 38, 38, 0.2)', dangerHoverText: '#7f1d1d',
        lockedBg: 'rgba(5, 150, 105, 0.12)', lockedBorder: 'rgba(5, 150, 105, 0.3)', lockedText: '#047857',
        foldText: '#475569', foldHover: '#0284c7', foldHoverBg: 'rgba(56,139,253,0.1)',
        cellBg: 'rgba(15, 23, 42, 0.06)', cellK: '#475569',
        valY: '#b45309', valG: '#047857', valO: '#c2410c', valR: '#b91c1c', valD: '#475569',
        selectBg: 'rgba(255,255,255,0.85)', selectBorder: 'rgba(15,23,42,0.2)', labelText: '#475569',
        headBg: 'rgba(255, 255, 255, 0.4)'
    };
    return `
#${UI_ID} {
    position: fixed; width:${Math.round(170*sc)}px;
    background: ${C.bg};
    backdrop-filter: blur(8px) saturate(1.2);
    -webkit-backdrop-filter: blur(8px) saturate(1.2);
    border: 1px solid ${C.border};
    border-radius: ${Math.round(10*sc)}px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.35);
    color: ${C.text}; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
    font-size: ${Math.round(11*sc)}px; line-height: 1.4;
    overflow: hidden; cursor: move; user-select: none; z-index: 10000;
    display: flex; flex-direction: column;
}
#${UI_ID} .head {
    display: flex; align-items: center; justify-content: space-between;
    padding: ${Math.round(4*sc)}px ${Math.round(8*sc)}px;
    background: ${C.headBg};
    border-bottom: 1px solid ${C.border};
}
#${UI_ID} .head .title {
    font-size: ${Math.round(10*sc)}px; font-weight: 600; color: ${C.title}; letter-spacing: 0.5px;
}
#${UI_ID} .head .acts { display: flex; gap: ${Math.round(6*sc)}px; align-items: center; }
#${UI_ID} .head .acts span {
    cursor: pointer; opacity: 0.5; font-size: ${Math.round(12*sc)}px; line-height: 1;
    transition: opacity 0.15s, transform 0.15s;
}
#${UI_ID} .head .acts span:hover { opacity: 1; transform: scale(1.15); }

#${UI_ID} .body { padding: ${Math.round(6*sc)}px ${Math.round(8*sc)}px; display: flex; flex-direction: column; gap: ${Math.round(5*sc)}px; }

#${UI_ID} .story-box {
    background: ${C.boxBg};
    border-left: ${Math.round(1.5*sc)}px solid ${C.boxBorder};
    border-radius: 0 ${Math.round(4*sc)}px ${Math.round(4*sc)}px 0;
    padding: ${Math.round(3*sc)}px ${Math.round(6*sc)}px;
    display: flex; align-items: baseline; gap: ${Math.round(4*sc)}px;
}
#${UI_ID} .story-box .tag {     font-size: ${Math.round(8*sc)}px; color: ${C.storyTag}; flex-shrink: 0; font-weight: 600;     background: ${C.tagBg}; padding: ${Math.round(1*sc)}px ${Math.round(4*sc)}px; border-radius: ${Math.round(3*sc)}px; }
#${UI_ID} .story-box .name {
    font-size: ${Math.round(10*sc)}px; color: ${C.storyName}; font-weight: 600;
    word-break: break-all; line-height: 1.25;
}

#${UI_ID} .btns { display: flex; flex-direction: column; gap: ${Math.round(3*sc)}px; }
#${UI_ID} .btns .row { display: flex; gap: ${Math.round(3*sc)}px; }
#${UI_ID} .btn {
    flex: 1; min-width: 0;
    background: ${C.btnBg};
    border: 1px solid ${C.btnBorder};
    color: ${C.text}; border-radius: ${Math.round(6*sc)}px; cursor: pointer;
    font-size: ${Math.round(10*sc)}px; font-weight: 500; line-height: 1.2;
    padding: ${Math.round(4*sc)}px ${Math.round(4*sc)}px;
    white-space: normal; word-break: break-word;
    transition: all 0.18s ease;
    display: flex; align-items: center; gap: ${Math.round(3*sc)}px;
    justify-content: center;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
#${UI_ID} .btn .bi { flex-shrink: 0; font-size: ${Math.round(11*sc)}px; line-height: 1; opacity: 0.75; }
#${UI_ID} .btn .bt { flex: 1; text-align: center; line-height: 1.2; }
#${UI_ID} .btn:hover {
    background: ${C.btnHoverBg}; border-color: ${C.btnHoverBorder}; color: ${C.btnHoverText};
}
#${UI_ID} .btn.danger { color: ${C.dangerText}; background: ${C.dangerBg}; border-color: ${C.dangerBorder}; }
#${UI_ID} .btn.danger:hover { background: ${C.dangerHoverBg}; color: ${C.dangerHoverText}; }
#${UI_ID} .btn.locked { background: ${C.lockedBg}; border-color: ${C.lockedBorder}; color: ${C.lockedText}; }
#${UI_ID} .btn:disabled { opacity: 0.4; cursor: not-allowed; }
#${UI_ID} .btn-full { width: 100%; }

#${UI_ID} .fold {
    display: flex; align-items: center; justify-content: center; gap: ${Math.round(4*sc)}px;
    padding: ${Math.round(3*sc)}px; margin-top: ${Math.round(1*sc)}px;
    border-top: 1px solid ${C.border};
    color: ${C.foldText}; font-size: ${Math.round(9*sc)}px; cursor: pointer;
    transition: color 0.15s, background 0.15s;
}
#${UI_ID} .fold:hover { color: ${C.foldHover}; background: ${C.foldHoverBg}; }
#${UI_ID} .fold .arrow { transition: transform 0.2s; }
#${UI_ID} .fold.open .arrow { transform: rotate(180deg); }
#${UI_ID} .extra { max-height: 0; overflow: hidden; transition: max-height 0.25s ease; }
#${UI_ID} .extra.open { max-height: ${Math.round(250*sc)}px; }
#${UI_ID} .extra-inner {
    padding: ${Math.round(5*sc)}px ${Math.round(8*sc)}px ${Math.round(6*sc)}px;
    display: flex; flex-direction: column; gap: ${Math.round(4*sc)}px;
    border-top: 1px solid ${C.border};
}
#${UI_ID} .grid { display: grid; grid-template-columns: 1fr 1fr; gap: ${Math.round(3*sc)}px; }
#${UI_ID} .cell {
    background: ${C.cellBg}; border-radius: ${Math.round(6*sc)}px;
    padding: ${Math.round(3*sc)}px ${Math.round(5*sc)}px;
    display: flex; flex-direction: column; gap: ${Math.round(1*sc)}px;
}
#${UI_ID} .cell .k { font-size: ${Math.round(8*sc)}px; color: ${C.cellK}; }
#${UI_ID} .cell .v { font-size: ${Math.round(10*sc)}px; font-weight: 600; }
#${UI_ID} .cell .v.y { color: ${C.valY}; } #${UI_ID} .cell .v.g { color: ${C.valG}; }
#${UI_ID} .cell .v.o { color: ${C.valO}; } #${UI_ID} .cell .v.r { color: ${C.valR}; } #${UI_ID} .cell .v.d { color: ${C.valD}; }
#${UI_ID} .jump { display: flex; flex-direction: column; gap: ${Math.round(3*sc)}px; }
#${UI_ID} .jump .pick { display: flex; gap: ${Math.round(3*sc)}px; align-items: center; }
#${UI_ID} .jump select {
    flex: 1; min-width: 0;
    background: ${C.selectBg}; border: 1px solid ${C.selectBorder};
    color: ${C.text}; font-size: ${Math.round(9*sc)}px; padding: ${Math.round(3*sc)}px ${Math.round(4*sc)}px;
    border-radius: ${Math.round(4*sc)}px; cursor: pointer;
}
#${UI_ID} .jump select option { background: ${C.selectBg}; color: ${C.text}; }
#${UI_ID} .jump label {
    display: flex; align-items: center; gap: ${Math.round(2*sc)}px;
    font-size: ${Math.round(8*sc)}px; color: ${C.labelText}; white-space: nowrap; cursor: pointer;
}
#${UI_ID} .jump label input { width: ${Math.round(10*sc)}px; height: ${Math.round(10*sc)}px; margin: 0; accent-color: ${C.title}; }
`;
}

let isLogicUpdating = false;
let _lastUiData = null;  // 缓存最近 UI 数据，大小切换时复用

// 创建/更新 UI；data 为 null 时仅初始化骨架
// ★ 沿用“创建一次 + 只更新字段”模式，心跳循环只更新字段不重建 DOM
// 大小切换请用 rebuildStoryUI()
function createOrUpdateUI(data) {
    if ($(`#${UI_ID}`).length === 0) {
        const sc = UI_SIZE_MODE === 'large' ? 1.5 : 1;
        $('head').append(`<style id="style_${UI_ID}">${buildUiStyles(sc)}</style>`);
        const sizeIcon = UI_SIZE_MODE === 'large' ? '📏' : '📐';
        const sizeTitle = UI_SIZE_MODE === 'large' ? '切换为小模式' : '切换为大模式 (1.5x)';
        const posStyle = UI_POS.left
            ? `top:${UI_POS.top};left:${UI_POS.left};right:auto;`
            : `top:${UI_POS.top};right:${UI_POS.right};`;
        const extraOpen = UI_EXTRA_EXPANDED ? ' open' : '';

        const html = `
        <div id="${UI_ID}" style="${posStyle}">
            <div class="head">
                <span class="title">📖 剧情控制台</span>
                <span class="acts">
                    <span id="btn-dark-toggle" title="${UI_DARK_MODE ? '切换为浅色模式' : '切换为深色模式'}">${UI_DARK_MODE ? '🌙' : '☀️'}</span>
                    <span id="btn-size-toggle" title="${sizeTitle}">${sizeIcon}</span>
                    <span id="btn-ui-close" title="关闭">✕</span>
                </span>
            </div>
            <div class="body">
                <div class="story-box"><span class="tag">章节</span><span class="name" id="ui-story-title">加载中...</span></div>
                <div class="btns">
                    <div class="row">
                        <button class="btn" id="btn-advance"><span class="bi">▶</span><span class="bt">推进至<br>下一章节</span></button>
                        <button class="btn" id="btn-toggle-ps"><span class="bi">🔁</span><span class="bt">强制切换<br>后日谈</span></button>
                    </div>
                    <button class="btn danger btn-full" id="btn-reset">↺ 撤销/重置状态</button>
                </div>
            </div>
            <div class="fold${extraOpen}" id="btn-toggle-extra"><span>额外信息与功能</span><span class="arrow">▾</span></div>
            <div class="extra${extraOpen}" id="extra-panel">
                <div class="extra-inner">
                    <div class="grid">
                        <div class="cell"><span class="k">当前楼层</span><span class="v" id="ui-depth">--</span></div>
                        <div class="cell"><span class="k">后日谈</span><span class="v d" id="ui-postscript-stat">--</span></div>
                        <div class="cell"><span class="k">过渡状态</span><span class="v" id="ui-trans-stat">无</span></div>
                        <div class="cell"><span class="k">剧情权重</span><span class="v o" id="ui-weight">--</span></div>
                    </div>
                    <div class="jump">
                        <div class="pick">
                            <select id="sel-jump"></select>
                            <label><input type="checkbox" id="chk-jump-ps" />后日谈</label>
                        </div>
                        <button class="btn btn-full" id="btn-jump">🚀 跳转版本</button>
                    </div>
                </div>
            </div>
        </div>`;
        $('body').append(html);

        const $el = $(`#${UI_ID}`);
        let isDragging = false;
        if (typeof $el.draggable === 'function') {
            $el.draggable({
                handle: '.head, .body, .fold, .extra',
                cancel: '#btn-size-toggle, #btn-ui-close, #btn-dark-toggle, .btn, select, input',
                containment: 'window',
                start: function() { isDragging = true; },
                stop: function(event, ui) {
                    UI_POS = { top: ui.position.top + 'px', left: ui.position.left + 'px', right: 'auto' };
                    isDragging = false;
                }
            });
        }

        $('#btn-ui-close').on('click', function(e) {
            if (isDragging) return;
            e.stopPropagation(); e.preventDefault();
            $(`#${UI_ID}`).hide();
        });
        $('#btn-dark-toggle').on('click', async function(e) {
            if (isDragging) return;
            e.stopPropagation(); e.preventDefault();
            UI_DARK_MODE = !UI_DARK_MODE;
            await saveUiDarkMode();
            // 销毁重建以应用新配色
            $(`#${UI_ID}`).remove();
            $(`#style_${UI_ID}`).remove();
            createOrUpdateUI(_lastUiData);
            if (typeof toastr !== 'undefined') {
                toastr.info(UI_DARK_MODE ? '已切换为深色模式' : '已切换为浅色模式');
            }
        });
        $('#btn-size-toggle').on('click', function(e) {
            if (isDragging) return;
            e.stopPropagation(); e.preventDefault();
            rebuildStoryUI();
            if (typeof toastr !== 'undefined') {
                toastr.info(UI_SIZE_MODE === 'large' ? '已切换为大模式 (1.5x)' : '已切换为小模式');
            }
        });
        $('#btn-toggle-extra').on('click', function(e) {
            if (isDragging) return;
            e.stopPropagation(); e.preventDefault();
            UI_EXTRA_EXPANDED = !UI_EXTRA_EXPANDED;
            $('#extra-panel').toggleClass('open', UI_EXTRA_EXPANDED);
            $('#btn-toggle-extra').toggleClass('open', UI_EXTRA_EXPANDED);
        });

        $('#btn-advance').on('click', () => manualAction({ 推进剧情: true }));
        $('#btn-toggle-ps').on('click', () => {
             const isPS = $('#ui-postscript-stat').text() === '是';
             manualAction({ 修改后日谈模式为: !isPS });
        });
        $('#btn-jump').on('click', () => {
            const val = $('#sel-jump').val();
            const isPS = $('#chk-jump-ps').is(':checked');
            if(val) {
                const [vIdx, pIdx] = val.split('-');
                manualAction({ 跳转版本_选项: { v: parseInt(vIdx), p: parseInt(pIdx), ps: isPS } });
            }
        });
        $('#btn-reset').on('click', () => manualAction({ 重置状态: true }));
    }

    // ★ 动态填充选择框内容（仅首次）
    if ($('#sel-jump').children().length === 0 && STORY_MAP && STORY_MAP.length > 0) {
        let optionsHtml = '';
        STORY_MAP.forEach((ver, vIdx) => {
            ver.parts.forEach((title, pIdx) => {
                optionsHtml += `<option value="${vIdx}-${pIdx}">v${ver.version} P${pIdx+1}: ${title}</option>`;
            });
        });
        $('#sel-jump').html(optionsHtml);
    }

    // 获取当前楼层用于 UI 判断
    const currentDepth = typeof getLastMessageId === 'function' ? getLastMessageId() : 0;
    const isZeroDepth = currentDepth <= 0;

    if (data) { _lastUiData = data;
        $('#ui-story-title').text(data.剧情显示 || '初始化中...');
        $('#ui-postscript-stat').text(data.是否为后日谈 === 'true' ? '是' : '否').toggleClass('d', data.是否为后日谈 !== 'true');
        $('#ui-weight').text(data.剧情权重 !== undefined ? data.剧情权重 : '--');

        const isLocked = !!data._trans_prompt;
        const $trans = $('#ui-trans-stat');

        if (isZeroDepth) {
             $trans.text('首层禁用').removeClass('g d').addClass('o');
             $('#btn-advance, #btn-toggle-ps, #btn-jump, #btn-reset').prop('disabled', true);
             $('#sel-jump, #chk-jump-ps').prop('disabled', true);
        } else if (isLocked) {
             $trans.text('锁定 T:' + data._trans_depth).removeClass('o d').addClass('g');
             $('#btn-advance, #btn-toggle-ps, #btn-jump').prop('disabled', true);
             $('#sel-jump, #chk-jump-ps').prop('disabled', true);
             $('#btn-reset').prop('disabled', false).removeClass('danger').addClass('locked').html('↺ 立即撤销（解除锁定）');
        } else {
             $trans.text('无').removeClass('g o').addClass('d');
             $('#btn-advance, #btn-toggle-ps, #btn-jump').prop('disabled', false);
             $('#sel-jump, #chk-jump-ps').prop('disabled', false);
             $('#btn-reset').prop('disabled', true).removeClass('locked').addClass('danger').html('↺ 撤销/重置状态');
        }
    }

    $('#ui-depth').text(currentDepth);
}

// 大小切换：销毁旧 DOM 并重新创建（位置/展开状态从全局变量恢复）
function rebuildStoryUI() {
    UI_SIZE_MODE = UI_SIZE_MODE === 'large' ? 'small' : 'large';
    saveUiSizeMode();
    $(`#${UI_ID}`).remove();
    $(`#style_${UI_ID}`).remove();
    // 用缓存数据直接填充，避免切换时显示“加载中”和重新拉取
    createOrUpdateUI(_lastUiData);
}

async function manualAction(commandObj) {
    if (isLogicUpdating) return;
    isLogicUpdating = true;

    try {
        const mvuData = await Mvu.getMvuData({ type: 'message', message_id: -1 });
        if (!mvuData.stat_data) mvuData.stat_data = {};
        const stat = mvuData.stat_data;
        const currentDepth = typeof getLastMessageId === 'function' ? getLastMessageId() : 0;

        // 首层保护
        if (currentDepth <= 0) {
            if (typeof toastr !== 'undefined') toastr.warning("开局首层无法操作剧情，请先开始对话。");
            isLogicUpdating = false;
            return;
        }

        // --- 撤销/重置逻辑 (深度暴力回滚) ---
        if (commandObj.重置状态 === true) {
            if (stat._backupContext) {
                // 1. 回滚章节索引
                stat._storyState = _.cloneDeep(stat._backupContext.storyState);
                
                // 2. 回滚文本变量 (强制覆盖)
                stat.当前演绎事件 = stat._backupContext.currentEvent || '无';
                stat.当前演绎事件节点 = stat._backupContext.currentNode || '无';
                stat.已完成的上一个事件 = stat._backupContext.prevEvent || '无';
                stat.已完成的上一个事件节点 = stat._backupContext.prevNode || '无';
                stat.即将进行的下一个事件节点 = stat._backupContext.nextNode || '无';
                stat.章节终止条件 = stat._backupContext.termCondition || '无';
                
                // 3. 清理标记
                stat._trans_prompt = null;
                stat._trans_depth = null;
                stat._backupContext = null;
                
                // 4. 重算并同步
                const newData = calculateStoryLogic(stat);
                mvuData.stat_data = newData;
                
                syncInjections(newData);
                await Mvu.replaceMvuData(mvuData, { type: 'message', message_id: -1 });
                createOrUpdateUI(newData);
                if (typeof toastr !== 'undefined') toastr.success("已完全回滚至操作前状态。");
            } else {
                if (typeof toastr !== 'undefined') toastr.warning("没有可撤销的备份状态。");
            }
            isLogicUpdating = false;
            return;
        }

        // --- 防连点 ---
        if (stat._trans_prompt) {
            if (typeof toastr !== 'undefined') toastr.error("当前处于过渡状态，请先发送消息或点击撤销按钮。");
            isLogicUpdating = false;
            return;
        }

        // === 核心：深度备份 ===
        stat._backupContext = {
            storyState: _.cloneDeep(stat._storyState || { majorVerIdx: 0, partIdx: 0, isPostScript: false }),
            currentEvent: stat.当前演绎事件,
            currentNode: stat.当前演绎事件节点,
            prevEvent: stat.已完成的上一个事件,
            prevNode: stat.已完成的上一个事件节点,
            nextNode: stat.即将进行的下一个事件节点,
            termCondition: stat.章节终止条件 
        };

        const oldTitle = getStoryDisplayString(
            stat._backupContext.storyState.majorVerIdx, 
            stat._backupContext.storyState.partIdx, 
            stat._backupContext.storyState.isPostScript
        );

        // --- 1. 推进剧情 ---
        if (commandObj.推进剧情 === true) {
            // 手动模拟计算下一个章节标题，确保精准（新语义）
            let nextMajor = stat._storyState.majorVerIdx;
            let nextPart = stat._storyState.partIdx;
            let nextPS = stat._storyState.isPostScript;

            const currentVerData = STORY_MAP[nextMajor];
            if (currentVerData) {
                const totalParts = currentVerData.parts.length;
                if (nextPS) {
                    // 后日谈推进
                    if (nextPart >= totalParts - 1) {
                        // 最后一个 Part 的后日谈 → 跳版本
                        nextPS = false;
                        nextMajor += 1;
                        nextPart = 0;
                        if (nextMajor >= STORY_MAP.length) {
                            nextMajor = STORY_MAP.length - 1;
                            nextPS = true;
                            if (typeof toastr !== 'undefined') toastr.warning("已是最终版本后日谈，无法推进。");
                        }
                    } else {
                        // 非最后 Part 的后日谈 → 下一个 Part，退出后日谈
                        nextPS = false;
                        nextPart += 1;
                    }
                } else if (nextPart >= totalParts - 1) {
                    // 非后日谈，最后 Part → 进入后日谈
                    nextPS = true;
                } else {
                    // 正常推进
                    nextPart += 1;
                }
            }
            
            const newTitle = getStoryDisplayString(nextMajor, nextPart, nextPS);

            stat._trans_depth = currentDepth;
            stat._trans_prompt = `【剧情推进指示】\n上一章节（刚刚结束）：${oldTitle}\n当前章节（即将开始）：${newTitle}\n\n检测到剧情刚刚发生推进。请基于“上一章节”的结尾与“当前章节”的初始背景，撰写一段流畅自然的过渡剧情，为新篇章进行铺垫，防止剧情割裂。`;
            
            // ★ 新增：重置终止条件
            stat.章节终止条件 = "（系统指令：剧情已进入新篇章，旧终止条件已失效。请根据当前新章节的剧情走向，在此处重新填写一个合理的章节终止条件）";
        }

        // --- 2. 跳转版本 (UI触发) ---
        if (commandObj.跳转版本_选项 || commandObj.跳转版本) {
            // 预计算新标题
            const tempStat = _.cloneDeep(stat);
            if (!tempStat.指令) tempStat.指令 = {};
            if (commandObj.跳转版本_选项) {
                tempStat.指令.跳转版本_选项 = commandObj.跳转版本_选项;
            } else {
                tempStat.指令.跳转版本 = commandObj.跳转版本;
                tempStat.指令.修改后日谈模式为 = false;
            }
            
            const tempResult = calculateStoryLogic(tempStat);
            const targetTitleFull = tempResult.剧情显示;

            stat._trans_depth = currentDepth;
            stat._trans_prompt = `【剧情跳转指示 (UI触发)】\n原定剧情线：${oldTitle}\n跳转目标剧情：${targetTitleFull}\n\n用户已通过控制台强制跳转了时间线/版本。请忽略原有的线性发展，直接根据“跳转目标剧情”的完整设定（包括时间点、事件阶段），以合理的叙事手段（如回忆结束、时间跳跃、梦境醒来、或直接转场）将剧情引导至新的篇章，并做好前后设定的软衔接。`;
            
            // ★ 新增：重置终止条件
            stat.章节终止条件 = "（系统指令：剧情已发生时空跳转，请根据跳转后的新章节内容，在此处重新填写合理的章节终止条件）";
            
            commandObj.修改后日谈模式为 = false; // 已被跳转版本选项接管，此处强防干扰
        }

        // --- 3. 切换后日谈 (UI触发) ---
        if (commandObj.修改后日谈模式为 !== undefined && commandObj.修改后日谈模式为 !== null && !commandObj.跳转版本 && !commandObj.跳转版本_选项) {
             const targetState = commandObj.修改后日谈模式为 === true;
             
             // 预计算新标题 (只是改变PS状态)
             const newTitle = getStoryDisplayString(stat._storyState.majorVerIdx, stat._storyState.partIdx, targetState);

             stat._trans_depth = currentDepth;
             if (targetState) {
                 stat._trans_prompt = `【模式切换指示】\n系统警告：用户强制开启了[后日谈/日常模式]（当前对应章节：${newTitle}）。\n\n请立即停止当前的主线紧张剧情，转而描写一段轻松、日常、或事后的温馨场景。这可能意味着一次突然的转场、时间的快速流逝、或者一场梦境的醒来。`;
             } else {
                 stat._trans_prompt = `【模式切换指示】\n系统警告：用户强制关闭了[后日谈]并返回了主线模式（当前对应章节：${newTitle}）。\n\n请立即结束当前的日常氛围，让紧张、严肃的主线剧情重新介入。`;
             }
        }

        if (!stat.指令) stat.指令 = {};
        Object.assign(stat.指令, commandObj);

        // 执行真实计算
        const newData = calculateStoryLogic(stat);
        mvuData.stat_data = newData;
        
        syncInjections(newData);
        await Mvu.replaceMvuData(mvuData, { type: 'message', message_id: -1 });
        createOrUpdateUI(newData);
        if (typeof toastr !== 'undefined') toastr.success("操作已应用");
    } catch (e) {
        console.error(e);
        if (typeof toastr !== 'undefined') toastr.error("操作失败: " + e.message);
    } finally {
        isLogicUpdating = false;
    }
}

// ==========================================
// 3. 全局监听与初始化
// ==========================================
$(async () => {
    try {
        await waitGlobalInitialized('Mvu');
    } catch (e) {
        if (typeof toastr !== 'undefined') toastr.error("MVU框架未加载，请检查！");
        console.error("MVU Framework not found.");
        return;
    }

    // ★★★ 在这里插入这一行，保证在后续逻辑执行前，最多花3秒等待数据库加载 ★★★
    await ensureGlobalStoryMap();

    if (typeof uninjectPrompts === 'function') {
        uninjectPrompts(['Chapter_Transition_Guide', 'OneOff_Transition_Guide', 'Transition_Guide_Persistent']);
    }

    const BTN_NAME = "📖 剧情控制台";
    if (typeof appendInexistentScriptButtons === 'function') {
        appendInexistentScriptButtons([{ name: BTN_NAME, visible: true }]);
        const btnEvent = getButtonEvent(BTN_NAME);
        
        eventOn(btnEvent, async () => {
            await loadUiDarkMode();
            await loadUiSizeMode();
            const $ui = $(`#${UI_ID}`);
            if ($ui.length === 0) {
                createOrUpdateUI(null); 
                try {
                    const d = await Mvu.getMvuData({ type: 'message', message_id: -1 });
                    if (d && d.stat_data) {
                        createOrUpdateUI(d.stat_data);
                    }
                } catch (e) {
                    console.warn("[StoryCtrl] UI初始化读取失败", e);
                }
            } else {
                $ui.toggle();
            }
        });
    }

    // ==========================================
    // 3.1 AI 自动逻辑流 (含新增的跳转逻辑)
    // ==========================================
    async function runLogicFlow(vars) {
        if (isLogicUpdating) return;
        let data = vars.stat_data; 
        if (!data) return;

        // ★ 新增：AI 触发的剧情跳转 (初始化/中途)
        if (data.指令 && (data.指令.跳转版本 || data.指令.跳转版本_选项)) {
            setTimeout(async () => {
                const currentDepth = typeof getLastMessageId === 'function' ? getLastMessageId() : 0;
                
                // 为了通用，如果AI使用选项格式也兼容处理
                const targetVer = data.指令.跳转版本_选项 ? `下拉列表跳转` : data.指令.跳转版本;
                const targetPS = data.指令.修改后日谈模式为;

                // --- 情况 A: 开局初始化 (楼层 <= 2) ---
                if (currentDepth <= 2) {
                    console.log(`[StoryCtrl] 检测到开局跳转指令: ${targetVer} (楼层: ${currentDepth}) - 静默执行`);
                    try {
                        const currentMvuData = await Mvu.getMvuData({ type: 'message', message_id: -1 });
                        const currentStatData = currentMvuData.stat_data || {};

                        if (!currentStatData.指令) currentStatData.指令 = {};
                        if (data.指令.跳转版本_选项) {
                             currentStatData.指令.跳转版本_选项 = data.指令.跳转版本_选项;
                        } else {
                             currentStatData.指令.跳转版本 = targetVer;
                        }
                        currentStatData.指令.修改后日谈模式为 = (targetPS !== undefined && targetPS !== null) ? targetPS : false;

                        const processedData = calculateStoryLogic(currentStatData);
                        
                        currentMvuData.stat_data = processedData;
                        syncInjections(processedData);
                        await Mvu.replaceMvuData(currentMvuData, { type: 'message', message_id: -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.success(`剧情已初始化至: ${processedData.剧情显示}`);
                    } catch (e) { console.error(e); }
                    return;
                }

                // --- 情况 B: 中途跳转 (楼层 > 2) ---
                const userConfirmed = confirm(`【剧情跳转提示】\nAI 请求跳转至剧情版本：${targetVer}\n\n点击 [确定] 允许跳转。\n点击 [取消] 拒绝跳转。`);
                
                isLogicUpdating = true;
                try {
                    const currentMvuData = await Mvu.getMvuData({ type: 'message', message_id: -1 });
                    const currentStatData = currentMvuData.stat_data || {};

                    if (userConfirmed) {
                        currentStatData._backupContext = {
                            storyState: _.cloneDeep(currentStatData._storyState || { majorVerIdx: 0, partIdx: 0, isPostScript: false }),
                            currentEvent: currentStatData.当前演绎事件,
                            currentNode: currentStatData.当前演绎事件节点,
                            prevEvent: currentStatData.已完成的上一个事件,
                            prevNode: currentStatData.已完成的上一个事件节点,
                            nextNode: currentStatData.即将进行的下一个事件节点,
                            termCondition: currentStatData.章节终止条件
                        };

                        const oldState = currentStatData._backupContext.storyState;
                        const oldTitle = getStoryDisplayString(oldState.majorVerIdx, oldState.partIdx, oldState.isPostScript);

                        if (!currentStatData.指令) currentStatData.指令 = {};
                        if (data.指令.跳转版本_选项) {
                             currentStatData.指令.跳转版本_选项 = data.指令.跳转版本_选项;
                        } else {
                             currentStatData.指令.跳转版本 = targetVer;
                        }
                        currentStatData.指令.修改后日谈模式为 = (targetPS !== undefined && targetPS !== null) ? targetPS : false;

                        const tempProcessed = calculateStoryLogic(_.cloneDeep(currentStatData));
                        const newTitle = tempProcessed.剧情显示;

                        currentStatData._trans_depth = currentDepth;
                        currentStatData._trans_prompt = `【剧情跳转指示】\n原定剧情线：${oldTitle}\n跳转目标剧情：${newTitle}\n\n用户同意了AI提出的时间线/版本跳转请求。请忽略原有的线性发展，直接根据“跳转目标剧情”的完整设定，以合理的叙事手段（如回忆结束、时间跳跃、梦境醒来、或直接转场）将剧情引导至新的篇章。`;
                        currentStatData.章节终止条件 = "（系统指令：剧情已发生时空跳转，请根据跳转后的新章节内容，在此处重新填写合理的章节终止条件）";

                        const processedData = calculateStoryLogic(currentStatData);
                        currentMvuData.stat_data = processedData;

                        syncInjections(processedData);
                        await Mvu.replaceMvuData(currentMvuData, { type: 'message', message_id: -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.success(`已跳转至: ${newTitle}`);
                    } else {
                        // 取消跳转
                        if (currentStatData.指令) {
                             currentStatData.指令.跳转版本 = null;
                             currentStatData.指令.跳转版本_选项 = null;
                        }
                        const processedData = calculateStoryLogic(currentStatData); 
                        currentMvuData.stat_data = processedData;
                        syncInjections(processedData);
                        await Mvu.replaceMvuData(currentMvuData, { type: 'message', message_id: -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.warning("剧情跳转已取消");
                    }
                } catch (e) { console.error(e); } finally { isLogicUpdating = false; }

            }, 10);
            return;
        }

        // --- 原有逻辑：AI 推进剧情 ---
        if (data.指令 && data.指令.推进剧情 === true) {
            setTimeout(async () => {
                const currentDepth = typeof getLastMessageId === 'function' ? getLastMessageId() : 0;
                
                if (currentDepth <= 0) {
                    console.warn("[StoryCtrl] 拦截了首层自动推进请求");
                    return;
                }

                const reason = data.章节终止条件 || "（未指定原因）";
                
                // ★★★ 核心修改：预先计算好即将跳转的目标章节（新语义） ★★★
                let preNextMajor = data._storyState ? data._storyState.majorVerIdx : 0;
                let preNextPart = data._storyState ? data._storyState.partIdx : 0;
                let preNextPS = data._storyState ? data._storyState.isPostScript : false;

                const preVerData = STORY_MAP[preNextMajor];
                if (preVerData) {
                    const totalParts = preVerData.parts.length;
                    if (preNextPS) {
                        if (preNextPart >= totalParts - 1) {
                            preNextPS = false; 
                            preNextMajor += 1; 
                            preNextPart = 0;
                            if (preNextMajor >= STORY_MAP.length) {
                                preNextMajor = STORY_MAP.length - 1; 
                                preNextPS = true;
                            }
                        } else {
                            preNextPS = false;
                            preNextPart += 1;
                        }
                    } else if (preNextPart >= totalParts - 1) {
                        preNextPS = true;
                    } else {
                        preNextPart += 1;
                    }
                }
                const nextChapterTitle = getStoryDisplayString(preNextMajor, preNextPart, preNextPS);

                // ★ 新增：后日谈推进的自动预警
                let confirmMessage = `【剧情推进提示】\nAI 判断已满足当前章节终止条件：\n“${reason}”\n\n即将推进至下一章节：\n👉 ${nextChapterTitle}\n\n`;
                if (preNextPS) {
                    confirmMessage += `⚠️ 即将进入后日谈，后日谈不主动推进主线剧情，如果自己想要推主线需要去剧情控制台手动推进，不要强行推主线，会导致剧情偏离\n\n`;
                }
                confirmMessage += `点击 [确定] 允许推进。\n点击 [取消] 拒绝推进。`;

                const userConfirmed = confirm(confirmMessage);
                
                isLogicUpdating = true;
                try {
                    const currentMvuData = await Mvu.getMvuData({ type: 'message', message_id: -1 });
                    const currentStatData = currentMvuData.stat_data || {};
                    
                    if (userConfirmed) {
                        currentStatData._backupContext = {
                            storyState: _.cloneDeep(currentStatData._storyState || { majorVerIdx: 0, partIdx: 0, isPostScript: false }),
                            currentEvent: currentStatData.当前演绎事件,
                            currentNode: currentStatData.当前演绎事件节点,
                            prevEvent: currentStatData.已完成的上一个事件,
                            prevNode: currentStatData.已完成的上一个事件节点,
                            nextNode: currentStatData.即将进行的下一个事件节点,
                            termCondition: currentStatData.章节终止条件
                        };

                        const oldState = currentStatData._backupContext.storyState;
                        const oldTitle = getStoryDisplayString(oldState.majorVerIdx, oldState.partIdx, oldState.isPostScript);
                        
                        let nextMajor = oldState.majorVerIdx;
                        let nextPart = oldState.partIdx;
                        let nextPS = oldState.isPostScript;
                        const currentVerData = STORY_MAP[nextMajor];
                        if (currentVerData) {
                            const totalParts = currentVerData.parts.length;
                            if (nextPS) {
                                if (nextPart >= totalParts - 1) {
                                    nextPS = false; 
                                    nextMajor += 1; 
                                    nextPart = 0;
                                    if (nextMajor >= STORY_MAP.length) { 
                                        nextMajor = STORY_MAP.length - 1; 
                                        nextPS = true;
                                        if (typeof toastr !== 'undefined') toastr.warning("已是最终版本，无法继续推进。");
                                    }
                                } else {
                                    nextPS = false;
                                    nextPart += 1;
                                }
                            } else if (nextPart >= totalParts - 1) {
                                nextPS = true;
                            } else {
                                nextPart += 1;
                            }
                        }
                        const newTitle = getStoryDisplayString(nextMajor, nextPart, nextPS);
                        currentStatData._trans_depth = currentDepth;
                        currentStatData._trans_prompt = `【剧情推进指示】\n上一章节：${oldTitle}\n当前章节（即将开始）：${newTitle}\n\n检测到剧情刚刚发生推进。请基于“上一章节”的结尾与“当前章节”的初始背景，撰写一段流畅自然的过渡剧情。`;
                        currentStatData.章节终止条件 = "（系统指令：剧情已进入新篇章，旧终止条件已失效。请根据当前新章节的剧情走向，在此处重新填写一个合理的章节终止条件）";

                        const processedData = calculateStoryLogic(currentStatData);
                        currentMvuData.stat_data = processedData;
                        
                        syncInjections(processedData); 
                        await Mvu.replaceMvuData(currentMvuData, { type: 'message', message_id: -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.info("剧情已推进");
                    } else {
                        if (currentStatData.指令) currentStatData.指令.推进剧情 = null;
                        const processedData = calculateStoryLogic(currentStatData);
                        currentMvuData.stat_data = processedData;
                        syncInjections(processedData);
                        await Mvu.replaceMvuData(currentMvuData, { type: 'message', message_id: -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.warning("剧情推进已取消");
                    }
                } catch(e) { console.error(e); } finally { isLogicUpdating = false; }
            }, 10);
            return;
        }

        const processedData = calculateStoryLogic(_.cloneDeep(data)); 

        if (!_.isEqual(data, processedData)) {
            console.log("[StoryCtrl] 状态变更，更新注入...");
            vars.stat_data = processedData; 
            syncInjections(processedData);
            createOrUpdateUI(processedData);
        } else {
            createOrUpdateUI(data);
            syncInjections(data);
        }
    }

eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, async (vars, oldVars) => {
        if (oldVars && oldVars.stat_data && oldVars.stat_data.女性角色 && vars.stat_data && vars.stat_data.女性角色) {
            const oldChars = oldVars.stat_data.女性角色;
            const newChars = vars.stat_data.女性角色;
            const oldNames = Object.keys(oldChars);
            Object.keys(newChars).forEach(newName => {
                const matchedOldName = oldNames.find(oldKey => 
                    oldKey === newName || oldKey.includes(newName) || newName.includes(oldKey)
                );
                if (matchedOldName) {
                    const oldCharData = oldChars[matchedOldName];
                    const wasPresent = oldCharData ? (oldCharData.是否在场 === true) : false;
                    if (!wasPresent) {
                        const isBecomingPresent = newChars[newName].是否在场 === true;
                        if (isBecomingPresent) {
                            const restoredChar = _.cloneDeep(oldCharData);
                            restoredChar.是否在场 = true;
                            // 允许AI更新的可变字段：内心想法、当前穿着、物品
                            const newCharData = newChars[newName];
                            if (newCharData) {
                                if (newCharData.额外信息 && newCharData.额外信息.内心想法 !== undefined) {
                                    _.set(restoredChar, '额外信息.内心想法', newCharData.额外信息.内心想法);
                                }
                                if (newCharData.当前穿着) {
                                    restoredChar.当前穿着 = _.cloneDeep(newCharData.当前穿着);
                                }
                                if (newCharData.物品 !== undefined) {
                                    restoredChar.物品 = newCharData.物品;
                                }
                            }
                            vars.stat_data.女性角色[newName] = restoredChar;
                        } else {
                            vars.stat_data.女性角色[newName] = _.cloneDeep(oldCharData);
                        }
                    }
                }
            });
        }

        // 【NPC漂泊者保护】拦截 AI 对 stat_data.NPC漂泊者 的擅自修改。
        // '是否存在'是世界设定（有无此NPC），不是'是否在场'。用户选定后不得改。
        // 仅拦 AI：状态栏 editNPCRover 改前会设 window.__fxUserNpcEdit 时间窗标记，标记有效则放行。
        try {
            const oldNpc = oldVars?.stat_data?.NPC漂泊者;
            const newNpc = vars?.stat_data?.NPC漂泊者;
            if (oldNpc && newNpc && JSON.stringify(oldNpc) !== JSON.stringify(newNpc)) {
                const userEditTs = (typeof window !== 'undefined') ? window.__fxUserNpcEdit : 0;
                const isUserEdit = userEditTs && (Date.now() - userEditTs < 3000);
                if (!isUserEdit) {
                    console.warn('[StoryCtrl] 拦截 AI 修改 NPC漂泊者，已还原:', newNpc, '->', oldNpc);
                    vars.stat_data.NPC漂泊者 = _.cloneDeep(oldNpc);
                }
            }
        } catch (e) { console.warn('[StoryCtrl] NPC漂泊者拦截异常', e); }

        await runLogicFlow(vars);
    });

    setInterval(async () => {
        if ($(`#${UI_ID}`).is(':visible')) {
            try {
                const mvuData = await Mvu.getMvuData({ type: 'message', message_id: -1 });
                if (mvuData && mvuData.stat_data) {
                    createOrUpdateUI(mvuData.stat_data);
                }
            } catch(e) {}
        }
        try {
            const mvuData = await Mvu.getMvuData({ type: 'message', message_id: -1 });
            if (mvuData && mvuData.stat_data) {
                const title = mvuData.stat_data.剧情显示;
                if (!title || title === '初始化中...') {
                    if (!isLogicUpdating) {
                        await runLogicFlow(mvuData); 
                    }
                }
                syncInjections(mvuData.stat_data);
            }
        } catch(e) {}
    }, 1000);

    // ==========================================
    // 3.2 物理清理：挂载生命周期卸载事件 (防止幽灵UI残留)
    // ==========================================
    function destroyStoryUI() {
        const $ui = $(`#${UI_ID}`);
        if ($ui.length > 0) {
            $ui.remove();
            console.log("[StoryCtrl] 生命周期结束，剧情悬浮窗已被物理销毁。");
        }
        // 同步清理注入的缩放样式标签
        $(`#style_${UI_ID}`).remove();
    }
    // 监听脚本所在的 window 被卸载或隐藏瞬间，强制拔除 DOM
    $(window).on('unload', destroyStoryUI);
    $(window).on('pagehide', destroyStoryUI);

    console.log("【WuWa 剧情控制台 v3.4.6】已挂载 (数据源解耦版+增强防残留)");
});
