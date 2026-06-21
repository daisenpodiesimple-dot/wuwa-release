
  @name WuWa 剧情控制台 & 逻辑核心 (v3.4.6 - 数据解耦版)
  @description 适配了“即将进行的下一个事件节点”变量。
  @description ★ 修改：数据源已解耦，现在强制读取全局 WuWaShared 数据，不再硬编码剧情文本。
  @description ★ 新增：下拉框版本选择、后日谈快捷跳转、生命周期自动清理、后日谈推进警告。
  @version 3.4.6
 

 ==========================================
 0. 数据源获取 (带异步重试机制)
 ==========================================

 将其改为可变变量，等待异步加载
let STORY_MAP = [];

 强力异步获取全局共享数据的函数 (最多尝试 3 次)
async function ensureGlobalStoryMap() {
    if (STORY_MAP.length  0) return true;

    const targets = [
        typeof globalThis !== 'undefined'  globalThis  null,
        typeof window !== 'undefined'  window  null,
        typeof top !== 'undefined'  top  null,
        typeof parent !== 'undefined'  parent  null,
    ];

    for (let i = 0; i  3; i++) {
        for (const target of targets) {
            if (target && target.WuWaShared && Array.isArray(target.WuWaShared.STORY_MAP)) {
                console.log(`[StoryCtrl] 成功从全局对象读取到剧情数据库 (第 ${i + 1} 次尝试)。`);
                STORY_MAP = target.WuWaShared.STORY_MAP;
                return true;
            }
        }
        
        console.warn(`[StoryCtrl] 暂未读取到剧情数据库，等待 1 秒后重试... (${i + 1}3)`);
        await new Promise(resolve = setTimeout(resolve, 1000));
    }

    console.error(【严重错误】连续 3 次无法找到全局剧情数据库 (WuWaShared)！);
    if (typeof toastr !== 'undefined') toastr.error(剧情控制台启动失败：Database Missing！);
    return false;
}

 辅助函数：生成显示用的标题字符串
function getStoryDisplayString(majorVerIdx, partIdx, isPostScript) {
     安全检查：如果数据库为空，直接返回错误
    if (!STORY_MAP  STORY_MAP.length === 0) return Database Missing;

    if (majorVerIdx = STORY_MAP.length) majorVerIdx = STORY_MAP.length - 1;
    const currentVerObj = STORY_MAP[majorVerIdx];
    if (!currentVerObj) return Data Error;

    if (partIdx = currentVerObj.parts.length) partIdx = currentVerObj.parts.length - 1;
    const rawTitle = currentVerObj.parts[partIdx];
    const verStr = currentVerObj.version;
    const partVal = partIdx + 1;

    if (isPostScript) {
        const cleanTitle = rawTitle.replace(s[（(](上中下)[）)]g, '');
        return `v${verStr} 后日谈 ${cleanTitle} (已完结)`;
    } else {
    return `v${verStr} Part ${partVal} ${rawTitle}`;
    }
}

 ==========================================
 0.5 好感度 → 态度映射函数
 ==========================================
function getAttitudeByFavorability(favorability) {
    if (favorability  10) return '心怀戒备与排斥，将主角视为不受欢迎的存在，内心抵触与之有所牵扯';
    if (favorability  20) return '感到生疏，对主角尚不熟悉，内心未对其建立明确印象，谈不上喜恶';
    if (favorability  40) return '态度中立，对主角既无特别好感也无明显恶感，视为普通的相识之人';
    if (favorability  60) return '相处熟络，对主角已不再陌生，内心将其视作认识的人，相处时较为自在';
    if (favorability  70) return '心怀好感，对主角抱有正面的情感倾向，内心愿意与之建立更深的联系';
    if (favorability  80) return '情感亲近，对主角有明显的喜爱与信赖，内心将其视为值得在意的人';
    if (favorability  90) return '情意深厚，对主角怀有真切的爱慕，内心将其视为格外重要、令自己心动的存在';
    return '情根深种，对主角的爱意真挚而深沉，内心将其视为珍视至极、难以割舍的人';
}
 ==========================================
 1. 核心逻辑处理函数 (保持原样)
 ==========================================
function calculateStoryLogic(stat_data) {

    if (!stat_data) return stat_data;
    const data = _.cloneDeep(stat_data);

     ★ 自动清理已删除的变量字段（角色称号、特写、偏爱玩法）
    if (data.女性角色) {
        Object.keys(data.女性角色).forEach(key = {
            const char = data.女性角色[key];
            if (char.额外信息 && char.额外信息.角色称号 !== undefined) delete char.额外信息.角色称号;
            if (char.特写 !== undefined) delete char.特写;
            if (char.私密资料 && char.私密资料.偏爱玩法 !== undefined) delete char.私密资料.偏爱玩法;
        });
    }

    let { majorVerIdx, partIdx, isPostScript, _anchorVer } = data._storyState  { majorVerIdx 0, partIdx 0, isPostScript false };

     --- 过期清理逻辑 ---
    const currentDepth = typeof getLastMessageId === 'function'  getLastMessageId()  0;
    const triggerDepth = data._trans_depth !== undefined  data._trans_depth  -999;
    
     只有当当前楼层超过触发楼层+1时，才视为结束
    if (data._trans_prompt && currentDepth  triggerDepth + 1) {
        console.log(`[StoryLogic] 过渡期结束，清理所有临时数据。`);
        data._trans_prompt = null;
        data._trans_depth = null;
        data._backupContext = null; 
    }

     锚点校验
    if (_anchorVer) {
        const currentObj = STORY_MAP[majorVerIdx];
        if (!currentObj  currentObj.version !== _anchorVer) {
            const correctIdx = STORY_MAP.findIndex(v = v.version === _anchorVer);
            if (correctIdx !== -1) {
                majorVerIdx = correctIdx;
            }
        }
    }

    const cmd = data.指令  {};

     1. 高潮重置
    if (cmd.重置高潮计数_角色名) {
        const targetName = cmd.重置高潮计数_角色名.trim();
        if (['主角', 'user', 'me'].includes(targetName.toLowerCase())) {
            if (data.主角信息.性爱状态) data.主角信息.性爱状态.高潮计数 = 0;
        }
        else if (data.女性角色 && data.女性角色[targetName].性爱状态) {
            data.女性角色[targetName].性爱状态.高潮计数 = 0;
        }
    }

     2. 跳转版本 (支持下拉框的精准索引跳转 & 文本正则跳转保留做兼容)
if (cmd.跳转版本_选项) {
    const targetMajor = cmd.跳转版本_选项.v;
    const targetPart = cmd.跳转版本_选项.p;
    const targetPS = cmd.跳转版本_选项.ps;

    if (STORY_MAP[targetMajor]) {
        majorVerIdx = targetMajor;
        partIdx = targetPart;                ✅ 始终使用用户选择的 Part
        isPostScript = targetPS;            ✅ 直接采用用户勾选的后日谈状态
    }
}
    else if (cmd.跳转版本) {
        const jumpInput = cmd.跳转版本.trim();
        const jumpRegex = v(d+.d+)(s+Parts+(d+))i;
        const match = jumpInput.match(jumpRegex);
        if (match) {
            const targetVer = match[1];
            const targetPartNum = match[2]  parseInt(match[2])  1;
            const targetIdx = STORY_MAP.findIndex(ver = ver.version === targetVer);
            if (targetIdx !== -1) {
                majorVerIdx = targetIdx;
                const maxParts = STORY_MAP[targetIdx].parts.length;
                partIdx = Math.max(0, Math.min(targetPartNum - 1, maxParts - 1));
                
                 UI跳转强制PS=false，除非有明确指令
                if (cmd.修改后日谈模式为 !== null && cmd.修改后日谈模式为 !== undefined) {
                      isPostScript = cmd.修改后日谈模式为 === true;
                } else {
                      isPostScript = false;
                }
            }
        }
    }
     单独的后日谈修改
    else if (cmd.修改后日谈模式为 !== null && cmd.修改后日谈模式为 !== undefined) {
        isPostScript = cmd.修改后日谈模式为 === true;
    }

         3. 推进剧情（统一后日谈推进逻辑）
    if (cmd.推进剧情 === true) {
        const currentVerData = STORY_MAP[majorVerIdx];
        if (currentVerData) {
            const totalParts = currentVerData.parts.length;
            if (isPostScript) {
                 后日谈推进：区分是否为本版本最后一个 Part
                if (partIdx = totalParts - 1) {
                     当前版本最后一个 Part 的后日谈 → 跳版本
                    isPostScript = false;
                    majorVerIdx += 1;
                    partIdx = 0;
                    if (majorVerIdx = STORY_MAP.length) {
                         已经是最终版本，无法推进，回退状态并提示
                        majorVerIdx = STORY_MAP.length - 1;
                        isPostScript = true;
                        if (typeof toastr !== 'undefined') toastr.warning(已是最终版本后日谈，无法继续推进。);
                    }
                } else {
                     非最后 Part 的后日谈 → 进入下一个 Part，退出后日谈
                    isPostScript = false;
                    partIdx += 1;
                }
            } else if (partIdx = totalParts - 1) {
                 非后日谈，当前是最后 Part → 进入后日谈
                isPostScript = true;
            } else {
                 非后日谈，非最后 Part → 正常推进
                partIdx += 1;
            }
        }

        data.已完成的上一个事件 = data.当前演绎事件  '无';
        data.已完成的上一个事件节点 = data.当前演绎事件节点  '无';

        const newDisplayString = getStoryDisplayString(majorVerIdx, partIdx, isPostScript);
        data.当前演绎事件 = `【${newDisplayString}】的初始阶段，处于最新章节的第一部分，请将当前事件和当前节点更新为对应章节的“主线事件1”和其第一个节点，并根据当前所处场景，为全新的剧情进行铺垫和衔接性演绎。`;
        data.当前演绎事件节点 = `等待AI填入对应节点完整信息`;
         ★ 新增：同步初始化下一节点
        data.即将进行的下一个事件节点 = `等待AI填入对应节点完整信息`;
    }

     4. 计算显示
    let displayString = '';
    let weightValue = 0;
    
    displayString = getStoryDisplayString(majorVerIdx, partIdx, isPostScript);
    
    if (majorVerIdx = STORY_MAP.length) majorVerIdx = STORY_MAP.length - 1;
    const currentVerObj = STORY_MAP[majorVerIdx];
    const currentAnchorVer = currentVerObj  currentVerObj.version  '1.0';
    if (currentVerObj) {
        const verStr = currentVerObj.version;
        const [major, minor] = verStr.split('.').map(n = parseInt(n)  0);
        const partVal = partIdx + 1;
        const baseWeight = (major  1000) + (minor  100);
        if (isPostScript) {
            weightValue = baseWeight + 1 + partVal;
        } else {
            weightValue = baseWeight + partVal;
        }
    }

     5. 角色显隐
    const visibleCharacters = {};
     ★ 修改：不再继承旧的_已知角色名单，而是每次清空。
     这样只要角色从 [女性角色] 里被删除了，名单里也会瞬间清理干净，不会留下幽灵名字。
    const knownCharacterSet = new Set(); 

    if (data.女性角色) {
        Object.keys(data.女性角色).forEach(key = {
            const char = data.女性角色[key];
            knownCharacterSet.add(key);  只有当前真正存在的角色，才会被加入已知名单

             ★ 核心：每次逻辑循环都根据当前好感度实时计算 _对主角的态度
            const favorability = char.好感度 !== undefined  char.好感度  0;
            char._对主角的态度 = getAttitudeByFavorability(favorability);

        if (char.是否在场 === true) {
            visibleCharacters[key] = char;
        } else {
             不在场的角色：隐藏 _对主角的态度，只展示最基本信息
            visibleCharacters[key] = {
                是否在场 false,
                好感度 favorability,
                外貌特征 char.基础信息.外貌  '暂无描述',
                _提示 若需召唤，请将[是否在场]改为true
            };
        }
        });
    }


    data._storyState = { majorVerIdx, partIdx, isPostScript, _anchorVer currentAnchorVer };
     重置指令 (加入了对下拉框选项的重置)
    data.指令 = { 推进剧情 null, 跳转版本 null, 跳转版本_选项 null, 修改后日谈模式为 null, 重置高潮计数_角色名 null };
    data.是否为后日谈 = String(isPostScript);
    data.剧情显示 = displayString;
    data.剧情权重 = weightValue;
    data._现场女性角色显示 = visibleCharacters;
    data._已知角色名单 = Array.from(knownCharacterSet);

    return data;
}

 ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
 核心修复：强力穿透暴露
 我们将函数挂载到所有可能的全局对象上，确保 UI 能够访问
 ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
(function exposeLogic() {
    try {
        if (typeof globalThis !== 'undefined') globalThis.calculateStoryLogic = calculateStoryLogic;
        if (typeof window !== 'undefined') window.calculateStoryLogic = calculateStoryLogic;
        if (typeof top !== 'undefined' && top !== window) {
            try { top.calculateStoryLogic = calculateStoryLogic; } catch(e){}
        }
        console.log([StoryCtrl] 逻辑函数已强制全局暴露);
    } catch (e) {
        console.error([StoryCtrl] 暴露函数严重失败, e);
    }
})();

 ==========================================
 1.1 严格同步注入逻辑
 ==========================================
function syncInjections(data) {
    if (!data) return;
    
    const TRANS_ID = 'Story_Transition_Prompt';
    
    if (data._trans_prompt && typeof data._trans_prompt === 'string' && data._trans_prompt.length  0) {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id TRANS_ID, content data._trans_prompt, position 'in_chat', 
                depth 0, role 'system', should_scan false
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
                id TITLE_ID, content `当前激活的剧情章节：${data.剧情显示}`,
                position 'none', role 'system', should_scan true,
            }]);
        }
    }

    const LOC_ID = 'Location_Scan_Trigger';
    if (data.所在地点) {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id LOC_ID, content data.所在地点,
                position 'none', role 'system', should_scan true,
            }]);
        }
    }
     ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
     修改确认：预载下一个节点（只触发绿灯，绝对不发给AI）
     ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const NEXT_NODE_ID = 'Next_Node_Scan_Trigger';
	
     ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
     修改一：预载当前节点（只触发绿灯，绝对不发给AI）
     ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const CURRENT_NODE_ID = 'Current_Node_Scan_Trigger';
    
    if (data.当前演绎事件节点 && data.当前演绎事件节点 !== '无') {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id CURRENT_NODE_ID,
                content `[系统预扫描]当前事件节点：${data.当前演绎事件节点}`,
                position 'none',   绝对不会发给 AI，不占用 token
                depth 0,
                role 'system', 
                should_scan true,  允许酒馆根据这段文本搜索并激活世界书绿灯
            }]);
        }
    } else {
         如果当前节点为空或“无”，及时清理遗留的注入
        if (typeof uninjectPrompts === 'function') uninjectPrompts([CURRENT_NODE_ID]);
    }
     检查变量是否存在且不为空
    if (data.即将进行的下一个事件节点 && data.即将进行的下一个事件节点 !== '无') {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id NEXT_NODE_ID,
                content `[系统预扫描]即将进行的事件节点：${data.即将进行的下一个事件节点}`,
                 【核心设置】
                 position 'none' - 绝对不会发给 AI，不占用 token，不干扰 AI 理解剧情
                 should_scan true - 允许酒馆根据这段文本去搜索并激活世界书(绿灯)
                position 'none', 
                depth 0,
                role 'system', 
                should_scan true, 
            }]);
        }
    }
 ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
     新增：漂泊者身份预扫描触发（只触发绿灯，绝对不发给AI）
     ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const ROVER_IDENTITY_ID = 'Rover_Identity_Scan_Trigger';
    
     严谨校验：确保 主角信息 对象存在，且 是否是漂泊者 严格为 true
    if (data.主角信息 && data.主角信息.是否是漂泊者 === true) {
        if (typeof injectPrompts === 'function') {
            injectPrompts([{
                id ROVER_IDENTITY_ID,
                content `漂泊者`,          纯文本关键字，用于精准击中绿灯的 keys
                position 'none',         静默模式：绝对不会发给 AI，零 token 消耗
                depth 0,
                role 'system', 
                should_scan true,        允许酒馆根据这段文本去搜索并激活世界书(绿灯)
            }]);
        }
    } else {
         保持你代码的一贯风格：条件不满足时，干净地清理掉遗留的注入
        if (typeof uninjectPrompts === 'function') {
            uninjectPrompts([ROVER_IDENTITY_ID]);
        }
    }
}

 ==========================================
 2. UI 构建与交互
 ==========================================
const UI_ID = 'wuwa-story-ui';
const UI_STYLES = `
#${UI_ID} {
    position fixed; top 100px; right 20px; width 260px;
    background rgba(26, 32, 44, 0.95); color #e2e8f0;
    border 1px solid #4a5568; border-radius 8px;
    font-family 'Segoe UI', sans-serif; font-size 13px;
    box-shadow 0 4px 12px rgba(0,0,0,0.5); z-index 10000;
    display flex; flex-direction column; overflow hidden;
}
#${UI_ID} .header {
    background rgba(0,0,0,0.4); padding 8px 12px;
    border-bottom 1px solid #4a5568; font-weight bold;
    display flex; justify-content space-between; align-items center;
    cursor move; color #63b3ed;
}
#${UI_ID} .content { padding 12px; display flex; flex-direction column; gap 8px; }
#${UI_ID} .row { display flex; justify-content space-between; align-items flex-start; }
#${UI_ID} .label { color #a0aec0; flex-shrink 0; margin-top 2px; }
#${UI_ID} .value { 
    color #f7fafc; font-weight 500; text-align right; 
    white-space normal; word-break break-all;
    max-width 170px; line-height 1.4;
}
#${UI_ID} .divider { height 1px; background #4a5568; margin 4px 0; }
#${UI_ID} button {
    background #2d3748; border 1px solid #4a5568; color #cbd5e0;
    padding 5px 10px; border-radius 4px; cursor pointer; transition 0.2s;
}
#${UI_ID} buttonhover { background #4a5568; color white; }
#${UI_ID} button.primary { background #3182ce; border-color #2b6cb0; color white; }
#${UI_ID} button.primaryhover { background #2b6cb0; }
#${UI_ID} buttondisabled { opacity 0.5; cursor not-allowed; }
#${UI_ID} select {
    background #1a202c; border 1px solid #4a5568; color white;
    padding 4px; border-radius 4px; box-sizing border-box;
}
`;

let isLogicUpdating = false;

function createOrUpdateUI(data) {
    if ($(`#${UI_ID}`).length === 0) {
        $('head').append(`style${UI_STYLES}style`);
        const html = `
        div id=${UI_ID}
            div class=header
                span📖 剧情控制台span
                span style=cursorpointer;font-size16px; onclick=$('#${UI_ID}').hide()×span
            div
            div class=content
                div class=rowspan class=label当前剧情spanspan class=value id=ui-story-title style=color#f6e05e;加载中...spandiv
                div class=dividerdiv
                div class=rowspan class=label当前楼层spanspan class=value id=ui-depth--spandiv
                div class=rowspan class=label后日谈spanspan class=value id=ui-postscript-stat--spandiv
                div class=rowspan class=label过渡状态spanspan class=value id=ui-trans-stat无spandiv
                div class=dividerdiv
                
                div style=displayflex;gap5px;
                      button class=primary id=btn-advance style=flex1;▶ 推进剧情button
                      button id=btn-toggle-ps style=flex1;🔁 后日谈button
                div
                
                div style=margin-top5px;
                    div style=displayflex; gap5px; align-itemscenter;
                        select id=sel-jump style=flex1; min-width0; text-overflowellipsis; overflowhidden; white-spacenowrap;select
                        label style=color#a0aec0; font-size11px; displayflex; align-itemscenter; gap2px; flex-shrink0; white-spacenowrap; cursorpointer;
                            input type=checkbox id=chk-jump-ps style=width13px; height13px; margin0;  后日谈
                        label
                    div
                    button id=btn-jump style=width100%;margin-top4px;🚀 跳转版本button
                div
                
                div style=margin-top5px; border-top 1px dashed #4a5568; padding-top 5px;
                    button id=btn-reset style=width100%; color #fc8181;↺ 撤销重置状态button
                div
            div
        div`;
        $('body').append(html);

        const $el = $(`#${UI_ID}`);
        if (typeof $el.draggable === 'function') {
            $el.draggable({ handle '.header', containment 'window' });
        }

        $('#btn-advance').on('click', () = manualAction({ 推进剧情 true }));
        $('#btn-toggle-ps').on('click', () = {
             const isPS = $('#ui-postscript-stat').text() === '是';
             manualAction({ 修改后日谈模式为 !isPS });
        });
        $('#btn-jump').on('click', () = {
            const val = $('#sel-jump').val();
            const isPS = $('#chk-jump-ps').is('checked');
            if(val) {
                const [vIdx, pIdx] = val.split('-');
                manualAction({ 跳转版本_选项 { v parseInt(vIdx), p parseInt(pIdx), ps isPS } });
            }
        });
        $('#btn-reset').on('click', () = manualAction({ 重置状态 true }));
    }

     ★ 动态填充选择框内容
    if ($('#sel-jump').children().length === 0 && STORY_MAP && STORY_MAP.length  0) {
        let optionsHtml = '';
        STORY_MAP.forEach((ver, vIdx) = {
            ver.parts.forEach((title, pIdx) = {
                optionsHtml += `option value=${vIdx}-${pIdx}v${ver.version} P${pIdx+1} ${title}option`;
            });
        });
        $('#sel-jump').html(optionsHtml);
    }

     获取当前楼层用于 UI 判断
    const currentDepth = typeof getLastMessageId === 'function'  getLastMessageId()  0;
    const isZeroDepth = currentDepth = 0;

    if (data) {
        $('#ui-story-title').text(data.剧情显示  '初始化中...');
        $('#ui-postscript-stat').text(data.是否为后日谈 === 'true'  '是'  '否');
        
        const isLocked = !!data._trans_prompt; 

        if (isZeroDepth) {
              首层完全禁用
             $('#ui-trans-stat').text('首层禁用').css('color', '#fbbf24');
             $('#btn-advance, #btn-toggle-ps, #btn-jump, #btn-reset').prop('disabled', true);
             $('#sel-jump, #chk-jump-ps').prop('disabled', true);
        } else if (isLocked) {
              过渡期锁定
             $('#ui-trans-stat').text(`锁定 (T${data._trans_depth})`).css('color', '#48bb78');
             $('#btn-advance, #btn-toggle-ps, #btn-jump').prop('disabled', true);
             $('#sel-jump, #chk-jump-ps').prop('disabled', true);
             $('#btn-reset').prop('disabled', false).text(↺ 立即撤销 (解除锁定));
        } else {
              正常状态
             $('#ui-trans-stat').text('无').css('color', '#718096');
             $('#btn-advance, #btn-toggle-ps, #btn-jump').prop('disabled', false);
             $('#sel-jump, #chk-jump-ps').prop('disabled', false);
             $('#btn-reset').prop('disabled', true).text(↺ 撤销重置状态);
        }
    }
    
    $('#ui-depth').text(currentDepth);
}

async function manualAction(commandObj) {
    if (isLogicUpdating) return;
    isLogicUpdating = true;

    try {
        const mvuData = await Mvu.getMvuData({ type 'message', message_id -1 });
        if (!mvuData.stat_data) mvuData.stat_data = {};
        const stat = mvuData.stat_data;
        const currentDepth = typeof getLastMessageId === 'function'  getLastMessageId()  0;

         首层保护
        if (currentDepth = 0) {
            if (typeof toastr !== 'undefined') toastr.warning(开局首层无法操作剧情，请先开始对话。);
            isLogicUpdating = false;
            return;
        }

         --- 撤销重置逻辑 (深度暴力回滚) ---
        if (commandObj.重置状态 === true) {
            if (stat._backupContext) {
                 1. 回滚章节索引
                stat._storyState = _.cloneDeep(stat._backupContext.storyState);
                
                 2. 回滚文本变量 (强制覆盖)
                stat.当前演绎事件 = stat._backupContext.currentEvent  '无';
                stat.当前演绎事件节点 = stat._backupContext.currentNode  '无';
                stat.已完成的上一个事件 = stat._backupContext.prevEvent  '无';
                stat.已完成的上一个事件节点 = stat._backupContext.prevNode  '无';
                stat.即将进行的下一个事件节点 = stat._backupContext.nextNode  '无';
                stat.章节终止条件 = stat._backupContext.termCondition  '无';
                
                 3. 清理标记
                stat._trans_prompt = null;
                stat._trans_depth = null;
                stat._backupContext = null;
                
                 4. 重算并同步
                const newData = calculateStoryLogic(stat);
                mvuData.stat_data = newData;
                
                syncInjections(newData);
                await Mvu.replaceMvuData(mvuData, { type 'message', message_id -1 });
                createOrUpdateUI(newData);
                if (typeof toastr !== 'undefined') toastr.success(已完全回滚至操作前状态。);
            } else {
                if (typeof toastr !== 'undefined') toastr.warning(没有可撤销的备份状态。);
            }
            isLogicUpdating = false;
            return;
        }

         --- 防连点 ---
        if (stat._trans_prompt) {
            if (typeof toastr !== 'undefined') toastr.error(当前处于过渡状态，请先发送消息或点击撤销按钮。);
            isLogicUpdating = false;
            return;
        }

         === 核心：深度备份 ===
        stat._backupContext = {
            storyState _.cloneDeep(stat._storyState  { majorVerIdx 0, partIdx 0, isPostScript false }),
            currentEvent stat.当前演绎事件,
            currentNode stat.当前演绎事件节点,
            prevEvent stat.已完成的上一个事件,
            prevNode stat.已完成的上一个事件节点,
            nextNode stat.即将进行的下一个事件节点,
            termCondition stat.章节终止条件 
        };

        const oldTitle = getStoryDisplayString(
            stat._backupContext.storyState.majorVerIdx, 
            stat._backupContext.storyState.partIdx, 
            stat._backupContext.storyState.isPostScript
        );

         --- 1. 推进剧情 ---
        if (commandObj.推进剧情 === true) {
             手动模拟计算下一个章节标题，确保精准（新语义）
            let nextMajor = stat._storyState.majorVerIdx;
            let nextPart = stat._storyState.partIdx;
            let nextPS = stat._storyState.isPostScript;

            const currentVerData = STORY_MAP[nextMajor];
            if (currentVerData) {
                const totalParts = currentVerData.parts.length;
                if (nextPS) {
                     后日谈推进
                    if (nextPart = totalParts - 1) {
                         最后一个 Part 的后日谈 → 跳版本
                        nextPS = false;
                        nextMajor += 1;
                        nextPart = 0;
                        if (nextMajor = STORY_MAP.length) {
                            nextMajor = STORY_MAP.length - 1;
                            nextPS = true;
                            if (typeof toastr !== 'undefined') toastr.warning(已是最终版本后日谈，无法推进。);
                        }
                    } else {
                         非最后 Part 的后日谈 → 下一个 Part，退出后日谈
                        nextPS = false;
                        nextPart += 1;
                    }
                } else if (nextPart = totalParts - 1) {
                     非后日谈，最后 Part → 进入后日谈
                    nextPS = true;
                } else {
                     正常推进
                    nextPart += 1;
                }
            }
            
            const newTitle = getStoryDisplayString(nextMajor, nextPart, nextPS);

            stat._trans_depth = currentDepth;
            stat._trans_prompt = `【剧情推进指示】n上一章节（刚刚结束）：${oldTitle}n当前章节（即将开始）：${newTitle}nn检测到剧情刚刚发生推进。请基于“上一章节”的结尾与“当前章节”的初始背景，撰写一段流畅自然的过渡剧情，为新篇章进行铺垫，防止剧情割裂。`;
            
             ★ 新增：重置终止条件
            stat.章节终止条件 = （系统指令：剧情已进入新篇章，旧终止条件已失效。请根据当前新章节的剧情走向，在此处重新填写一个合理的章节终止条件）;
        }

         --- 2. 跳转版本 (UI触发) ---
        if (commandObj.跳转版本_选项  commandObj.跳转版本) {
             预计算新标题
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
            stat._trans_prompt = `【剧情跳转指示 (UI触发)】n原定剧情线：${oldTitle}n跳转目标剧情：${targetTitleFull}nn用户已通过控制台强制跳转了时间线版本。请忽略原有的线性发展，直接根据“跳转目标剧情”的完整设定（包括时间点、事件阶段），以合理的叙事手段（如回忆结束、时间跳跃、梦境醒来、或直接转场）将剧情引导至新的篇章，并做好前后设定的软衔接。`;
            
             ★ 新增：重置终止条件
            stat.章节终止条件 = （系统指令：剧情已发生时空跳转，请根据跳转后的新章节内容，在此处重新填写合理的章节终止条件）;
            
            commandObj.修改后日谈模式为 = false;  已被跳转版本选项接管，此处强防干扰
        }

         --- 3. 切换后日谈 (UI触发) ---
        if (commandObj.修改后日谈模式为 !== undefined && commandObj.修改后日谈模式为 !== null && !commandObj.跳转版本 && !commandObj.跳转版本_选项) {
             const targetState = commandObj.修改后日谈模式为 === true;
             
              预计算新标题 (只是改变PS状态)
             const newTitle = getStoryDisplayString(stat._storyState.majorVerIdx, stat._storyState.partIdx, targetState);

             stat._trans_depth = currentDepth;
             if (targetState) {
                 stat._trans_prompt = `【模式切换指示】n系统警告：用户强制开启了[后日谈日常模式]（当前对应章节：${newTitle}）。nn请立即停止当前的主线紧张剧情，转而描写一段轻松、日常、或事后的温馨场景。这可能意味着一次突然的转场、时间的快速流逝、或者一场梦境的醒来。`;
             } else {
                 stat._trans_prompt = `【模式切换指示】n系统警告：用户强制关闭了[后日谈]并返回了主线模式（当前对应章节：${newTitle}）。nn请立即结束当前的日常氛围，让紧张、严肃的主线剧情重新介入。`;
             }
        }

        if (!stat.指令) stat.指令 = {};
        Object.assign(stat.指令, commandObj);

         执行真实计算
        const newData = calculateStoryLogic(stat);
        mvuData.stat_data = newData;
        
        syncInjections(newData);
        await Mvu.replaceMvuData(mvuData, { type 'message', message_id -1 });
        createOrUpdateUI(newData);
        if (typeof toastr !== 'undefined') toastr.success(操作已应用);
    } catch (e) {
        console.error(e);
        if (typeof toastr !== 'undefined') toastr.error(操作失败  + e.message);
    } finally {
        isLogicUpdating = false;
    }
}

 ==========================================
 3. 全局监听与初始化
 ==========================================
$(async () = {
    try {
        await waitGlobalInitialized('Mvu');
    } catch (e) {
        if (typeof toastr !== 'undefined') toastr.error(MVU框架未加载，请检查！);
        console.error(MVU Framework not found.);
        return;
    }

     ★★★ 在这里插入这一行，保证在后续逻辑执行前，最多花3秒等待数据库加载 ★★★
    await ensureGlobalStoryMap();

    if (typeof uninjectPrompts === 'function') {
        uninjectPrompts(['Chapter_Transition_Guide', 'OneOff_Transition_Guide', 'Transition_Guide_Persistent']);
    }

    const BTN_NAME = 📖 剧情控制台;
    if (typeof appendInexistentScriptButtons === 'function') {
        appendInexistentScriptButtons([{ name BTN_NAME, visible true }]);
        const btnEvent = getButtonEvent(BTN_NAME);
        
        eventOn(btnEvent, async () = {
            const $ui = $(`#${UI_ID}`);
            if ($ui.length === 0) {
                createOrUpdateUI(null); 
                try {
                    const d = await Mvu.getMvuData({ type 'message', message_id -1 });
                    if (d && d.stat_data) {
                        createOrUpdateUI(d.stat_data);
                    }
                } catch (e) {
                    console.warn([StoryCtrl] UI初始化读取失败, e);
                }
            } else {
                $ui.toggle();
            }
        });
    }

     ==========================================
     3.1 AI 自动逻辑流 (含新增的跳转逻辑)
     ==========================================
    async function runLogicFlow(vars) {
        if (isLogicUpdating) return;
        let data = vars.stat_data; 
        if (!data) return;

         ★ 新增：AI 触发的剧情跳转 (初始化中途)
        if (data.指令 && (data.指令.跳转版本  data.指令.跳转版本_选项)) {
            setTimeout(async () = {
                const currentDepth = typeof getLastMessageId === 'function'  getLastMessageId()  0;
                
                 为了通用，如果AI使用选项格式也兼容处理
                const targetVer = data.指令.跳转版本_选项  `下拉列表跳转`  data.指令.跳转版本;
                const targetPS = data.指令.修改后日谈模式为;

                 --- 情况 A 开局初始化 (楼层 = 2) ---
                if (currentDepth = 2) {
                    console.log(`[StoryCtrl] 检测到开局跳转指令 ${targetVer} (楼层 ${currentDepth}) - 静默执行`);
                    try {
                        const currentMvuData = await Mvu.getMvuData({ type 'message', message_id -1 });
                        const currentStatData = currentMvuData.stat_data  {};

                        if (!currentStatData.指令) currentStatData.指令 = {};
                        if (data.指令.跳转版本_选项) {
                             currentStatData.指令.跳转版本_选项 = data.指令.跳转版本_选项;
                        } else {
                             currentStatData.指令.跳转版本 = targetVer;
                        }
                        currentStatData.指令.修改后日谈模式为 = (targetPS !== undefined && targetPS !== null)  targetPS  false;

                        const processedData = calculateStoryLogic(currentStatData);
                        
                        currentMvuData.stat_data = processedData;
                        syncInjections(processedData);
                        await Mvu.replaceMvuData(currentMvuData, { type 'message', message_id -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.success(`剧情已初始化至 ${processedData.剧情显示}`);
                    } catch (e) { console.error(e); }
                    return;
                }

                 --- 情况 B 中途跳转 (楼层  2) ---
                const userConfirmed = confirm(`【剧情跳转提示】nAI 请求跳转至剧情版本：${targetVer}nn点击 [确定] 允许跳转。n点击 [取消] 拒绝跳转。`);
                
                isLogicUpdating = true;
                try {
                    const currentMvuData = await Mvu.getMvuData({ type 'message', message_id -1 });
                    const currentStatData = currentMvuData.stat_data  {};

                    if (userConfirmed) {
                        currentStatData._backupContext = {
                            storyState _.cloneDeep(currentStatData._storyState  { majorVerIdx 0, partIdx 0, isPostScript false }),
                            currentEvent currentStatData.当前演绎事件,
                            currentNode currentStatData.当前演绎事件节点,
                            prevEvent currentStatData.已完成的上一个事件,
                            prevNode currentStatData.已完成的上一个事件节点,
                            nextNode currentStatData.即将进行的下一个事件节点,
                            termCondition currentStatData.章节终止条件
                        };

                        const oldState = currentStatData._backupContext.storyState;
                        const oldTitle = getStoryDisplayString(oldState.majorVerIdx, oldState.partIdx, oldState.isPostScript);

                        if (!currentStatData.指令) currentStatData.指令 = {};
                        if (data.指令.跳转版本_选项) {
                             currentStatData.指令.跳转版本_选项 = data.指令.跳转版本_选项;
                        } else {
                             currentStatData.指令.跳转版本 = targetVer;
                        }
                        currentStatData.指令.修改后日谈模式为 = (targetPS !== undefined && targetPS !== null)  targetPS  false;

                        const tempProcessed = calculateStoryLogic(_.cloneDeep(currentStatData));
                        const newTitle = tempProcessed.剧情显示;

                        currentStatData._trans_depth = currentDepth;
                        currentStatData._trans_prompt = `【剧情跳转指示】n原定剧情线：${oldTitle}n跳转目标剧情：${newTitle}nn用户同意了AI提出的时间线版本跳转请求。请忽略原有的线性发展，直接根据“跳转目标剧情”的完整设定，以合理的叙事手段（如回忆结束、时间跳跃、梦境醒来、或直接转场）将剧情引导至新的篇章。`;
                        currentStatData.章节终止条件 = （系统指令：剧情已发生时空跳转，请根据跳转后的新章节内容，在此处重新填写合理的章节终止条件）;

                        const processedData = calculateStoryLogic(currentStatData);
                        currentMvuData.stat_data = processedData;

                        syncInjections(processedData);
                        await Mvu.replaceMvuData(currentMvuData, { type 'message', message_id -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.success(`已跳转至 ${newTitle}`);
                    } else {
                         取消跳转
                        if (currentStatData.指令) {
                             currentStatData.指令.跳转版本 = null;
                             currentStatData.指令.跳转版本_选项 = null;
                        }
                        const processedData = calculateStoryLogic(currentStatData); 
                        currentMvuData.stat_data = processedData;
                        syncInjections(processedData);
                        await Mvu.replaceMvuData(currentMvuData, { type 'message', message_id -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.warning(剧情跳转已取消);
                    }
                } catch (e) { console.error(e); } finally { isLogicUpdating = false; }

            }, 10);
            return;
        }

         --- 原有逻辑：AI 推进剧情 ---
        if (data.指令 && data.指令.推进剧情 === true) {
            setTimeout(async () = {
                const currentDepth = typeof getLastMessageId === 'function'  getLastMessageId()  0;
                
                if (currentDepth = 0) {
                    console.warn([StoryCtrl] 拦截了首层自动推进请求);
                    return;
                }

                const reason = data.章节终止条件  （未指定原因）;
                
                 ★★★ 核心修改：预先计算好即将跳转的目标章节（新语义） ★★★
                let preNextMajor = data._storyState  data._storyState.majorVerIdx  0;
                let preNextPart = data._storyState  data._storyState.partIdx  0;
                let preNextPS = data._storyState  data._storyState.isPostScript  false;

                const preVerData = STORY_MAP[preNextMajor];
                if (preVerData) {
                    const totalParts = preVerData.parts.length;
                    if (preNextPS) {
                        if (preNextPart = totalParts - 1) {
                            preNextPS = false; 
                            preNextMajor += 1; 
                            preNextPart = 0;
                            if (preNextMajor = STORY_MAP.length) {
                                preNextMajor = STORY_MAP.length - 1; 
                                preNextPS = true;
                            }
                        } else {
                            preNextPS = false;
                            preNextPart += 1;
                        }
                    } else if (preNextPart = totalParts - 1) {
                        preNextPS = true;
                    } else {
                        preNextPart += 1;
                    }
                }
                const nextChapterTitle = getStoryDisplayString(preNextMajor, preNextPart, preNextPS);

                 ★ 新增：后日谈推进的自动预警
                let confirmMessage = `【剧情推进提示】nAI 判断已满足当前章节终止条件：n“${reason}”nn即将推进至下一章节：n👉 ${nextChapterTitle}nn`;
                if (preNextPS) {
                    confirmMessage += `⚠️ 即将进入后日谈，后日谈不主动推进主线剧情，如果自己想要推主线需要去剧情控制台手动推进，不要强行推主线，会导致剧情偏离nn`;
                }
                confirmMessage += `点击 [确定] 允许推进。n点击 [取消] 拒绝推进。`;

                const userConfirmed = confirm(confirmMessage);
                
                isLogicUpdating = true;
                try {
                    const currentMvuData = await Mvu.getMvuData({ type 'message', message_id -1 });
                    const currentStatData = currentMvuData.stat_data  {};
                    
                    if (userConfirmed) {
                        currentStatData._backupContext = {
                            storyState _.cloneDeep(currentStatData._storyState  { majorVerIdx 0, partIdx 0, isPostScript false }),
                            currentEvent currentStatData.当前演绎事件,
                            currentNode currentStatData.当前演绎事件节点,
                            prevEvent currentStatData.已完成的上一个事件,
                            prevNode currentStatData.已完成的上一个事件节点,
                            nextNode currentStatData.即将进行的下一个事件节点,
                            termCondition currentStatData.章节终止条件
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
                                if (nextPart = totalParts - 1) {
                                    nextPS = false; 
                                    nextMajor += 1; 
                                    nextPart = 0;
                                    if (nextMajor = STORY_MAP.length) { 
                                        nextMajor = STORY_MAP.length - 1; 
                                        nextPS = true;
                                        if (typeof toastr !== 'undefined') toastr.warning(已是最终版本，无法继续推进。);
                                    }
                                } else {
                                    nextPS = false;
                                    nextPart += 1;
                                }
                            } else if (nextPart = totalParts - 1) {
                                nextPS = true;
                            } else {
                                nextPart += 1;
                            }
                        }
                        const newTitle = getStoryDisplayString(nextMajor, nextPart, nextPS);
                        currentStatData._trans_depth = currentDepth;
                        currentStatData._trans_prompt = `【剧情推进指示】n上一章节：${oldTitle}n当前章节（即将开始）：${newTitle}nn检测到剧情刚刚发生推进。请基于“上一章节”的结尾与“当前章节”的初始背景，撰写一段流畅自然的过渡剧情。`;
                        currentStatData.章节终止条件 = （系统指令：剧情已进入新篇章，旧终止条件已失效。请根据当前新章节的剧情走向，在此处重新填写一个合理的章节终止条件）;

                        const processedData = calculateStoryLogic(currentStatData);
                        currentMvuData.stat_data = processedData;
                        
                        syncInjections(processedData); 
                        await Mvu.replaceMvuData(currentMvuData, { type 'message', message_id -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.info(剧情已推进);
                    } else {
                        if (currentStatData.指令) currentStatData.指令.推进剧情 = null;
                        const processedData = calculateStoryLogic(currentStatData);
                        currentMvuData.stat_data = processedData;
                        syncInjections(processedData);
                        await Mvu.replaceMvuData(currentMvuData, { type 'message', message_id -1 });
                        createOrUpdateUI(processedData);
                        if (typeof toastr !== 'undefined') toastr.warning(剧情推进已取消);
                    }
                } catch(e) { console.error(e); } finally { isLogicUpdating = false; }
            }, 10);
            return;
        }

        const processedData = calculateStoryLogic(_.cloneDeep(data)); 

        if (!_.isEqual(data, processedData)) {
            console.log([StoryCtrl] 状态变更，更新注入...);
            vars.stat_data = processedData; 
            syncInjections(processedData);
            createOrUpdateUI(processedData);
        } else {
            createOrUpdateUI(data);
            syncInjections(data);
        }
    }

eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, async (vars, oldVars) = {
        if (oldVars && oldVars.stat_data && oldVars.stat_data.女性角色 && vars.stat_data && vars.stat_data.女性角色) {
            const oldChars = oldVars.stat_data.女性角色;
            const newChars = vars.stat_data.女性角色;
            const oldNames = Object.keys(oldChars);
            Object.keys(newChars).forEach(newName = {
                const matchedOldName = oldNames.find(oldKey = 
                    oldKey === newName  oldKey.includes(newName)  newName.includes(oldKey)
                );
                if (matchedOldName) {
                    const oldCharData = oldChars[matchedOldName];
                    const wasPresent = oldCharData  (oldCharData.是否在场 === true)  false;
                    if (!wasPresent) {
                        const isBecomingPresent = newChars[newName].是否在场 === true;
                        if (isBecomingPresent) {
                            const restoredChar = _.cloneDeep(oldCharData);
                            restoredChar.是否在场 = true;
                             允许AI更新的可变字段：内心想法、当前穿着、物品
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
        await runLogicFlow(vars);
    });

    setInterval(async () = {
        if ($(`#${UI_ID}`).is('visible')) {
            try {
                const mvuData = await Mvu.getMvuData({ type 'message', message_id -1 });
                if (mvuData && mvuData.stat_data) {
                    createOrUpdateUI(mvuData.stat_data);
                }
            } catch(e) {}
        }
        try {
            const mvuData = await Mvu.getMvuData({ type 'message', message_id -1 });
            if (mvuData && mvuData.stat_data) {
                const title = mvuData.stat_data.剧情显示;
                if (!title  title === '初始化中...') {
                    if (!isLogicUpdating) {
                        await runLogicFlow(mvuData); 
                    }
                }
                syncInjections(mvuData.stat_data);
            }
        } catch(e) {}
    }, 1000);

     ==========================================
     3.2 物理清理：挂载生命周期卸载事件 (防止幽灵UI残留)
     ==========================================
    function destroyStoryUI() {
        const $ui = $(`#${UI_ID}`);
        if ($ui.length  0) {
            $ui.remove();
            console.log([StoryCtrl] 生命周期结束，剧情悬浮窗已被物理销毁。);
        }
    }
     监听脚本所在的 window 被卸载或隐藏瞬间，强制拔除 DOM
    $(window).on('unload', destroyStoryUI);
    $(window).on('pagehide', destroyStoryUI);

    console.log(【WuWa 剧情控制台 v3.4.6】已挂载 (数据源解耦版+增强防残留));
});
