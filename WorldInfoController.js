/**
 * @name WuWa 世界书控制 (变量驱动+梗概版)
 * @description v4.0.3 集成角色Pro/Lite、剧情(✍️)、梗概(🎬️)控制。优化了过渡期扫描和悬浮窗显示。
 * @version 4.0.3
 */

// 尝试加载 jQuery UI Draggable (如果环境未包含)
try {
    if (typeof $.fn.draggable === 'undefined') {
        import('https://testingcf.jsdelivr.net/npm/jquery-ui/ui/widgets/draggable/+esm').then(() => console.log('JQUI Draggable Loaded'));
    }
} catch (e) { console.error('Auto-import draggable failed:', e); }

// ==================== 配置 ====================
const SWITCHER_CONFIG = {
  buttonName: '🌊 WuWa 世界书控制',
  storageKey: 'wuwa_wb_v4_0_settings',
  scanDepth: 5, 
  colors: {
    pro: '#48bb78', lite: '#4299e1', 
    storyOn: '#ed8936', storyActive: '#ecc94b', 
    summaryOn: '#9f7aea', summaryActive: '#d6bcfa', // 🎬 新增颜色
    inactive: '#4a5568',
    bg: '#1a202c', border: '#2d3748', tabActive: '#2b6cb0', tabInactive: 'transparent',     floatBg: 'rgba(0, 0, 0, 0.55)',
    virgin: '#f687b3', nonVirgin: '#9f7aea'
  }
};

let SWITCHER_STATE = { autoMode: true, floatVisible: true, floatPos: { top: '80px', left: '20px' }, simpTradMode: 'simp', floatSizeMode: 'small' };

// ==================== 核心工具 ====================

// [MODIFIED] 增强：读取更广泛的上下文变量，以覆盖过渡期
async function getFullContextVar() {
    try {
        let vars = null;
        if (window.TavernHelper && typeof TavernHelper.getVariables === 'function') {
            vars = await TavernHelper.getVariables({ type: 'message', message_id: -1 });
        } else if (typeof getAllVariables === 'function') {
            vars = getAllVariables();
        }

        if (vars && vars.stat_data) {
            const display = _.get(vars, 'stat_data.剧情显示', '');
            const next = _.get(vars, 'stat_data.即将进行的下一个事件节点', ''); // 预扫描节点
            // 只将当前章节和下一节点纳入扫描，不包含过渡提示词（避免激活旧章节）
            return `${display}\n${next}`;
        }
    } catch(e) {}
    return '';
}


function getCoreName(entryName) {
  if (!entryName) return '';
  let clean = entryName.replace(/\[\s*(pro|lite)\s*\]/gi, '');
  // 保留 (简)/(繁) 标记以便区分简繁版本词条
  clean = clean.replace(/[^\u4e00-\u9fa5a-zA-Z0-9.()（）]/g, '');
  return clean;
}

function getEntryType(entryName) {
  if (/\[\s*pro\s*\]/i.test(entryName)) return 'pro';
  if (/\[\s*lite\s*\]/i.test(entryName)) return 'lite';
  return 'other';
}

// 检测词条简繁标记
function getSimpTradType(entryName) {
  if (/[\(（]简[\)）]/.test(entryName)) return 'simp';
  if (/[\(（]繁[\)）]/.test(entryName)) return 'trad';
  return 'none';
}

// [新增] 简繁过滤：条目是否属于当前简繁模式（none 视为通用，两模式都通过）
function matchSimpTradMode(simpTrad, mode) {
  if (simpTrad === 'none') return true;
  return simpTrad === mode;
}

// 触发判断逻辑
function checkStoryActivation(entry, scanText) {

    if (!entry.enabled) return false;
    const strategy = entry.strategy;
    if (!strategy) return false;
    
    // 蓝灯（常驻）：只要启用就视为激活
    if (strategy.type === 'constant') return true;
    
    // 绿灯（关键词）：检查 scanText (包含剧情标题、过渡词、下一节点)
    if (strategy.type === 'selective') {
        const keys = strategy.keys || [];
        if (keys.length === 0) return false;
        const textLower = scanText.toLowerCase();
        return keys.some(key => {
            if (typeof key === 'string') return textLower.includes(key.toLowerCase());
            return false;
        });
    }
    return false;
}

// [新增] 自动蓝灯：只读取"剧情显示"变量，用于判定剧情/梗概条目是否被自动激活
async function getStoryDisplayText() {
    try {
        let vars = null;
        if (window.TavernHelper && typeof TavernHelper.getVariables === 'function') {
            vars = await TavernHelper.getVariables({ type: 'message', message_id: -1 });
        } else if (typeof getAllVariables === 'function') {
            vars = getAllVariables();
        }
        if (vars && vars.stat_data) {
            return _.get(vars, 'stat_data.剧情显示', '') || '';
        }
    } catch(e) {}
    return '';
}

// [新增] 自动蓝灯判定：条目已启用 + 非constant + 剧情显示文本包含其任一关键词
// 与手动蓝灯(constant)区别：自动蓝灯不修改strategy，仅作为本轮激活判定
function checkAutoBlueActivation(entry, displayText) {
    if (!entry || !entry.enabled) return false;
    const strategy = entry.strategy;
    if (!strategy) return false;
    if (strategy.type === 'constant') return false; // 手动蓝灯优先，不重复判定
    const keys = strategy.keys || [];
    if (keys.length === 0) return false;
    const textLower = (displayText || '').toLowerCase();
    return keys.some(key => {
        if (typeof key === 'string') return textLower.includes(key.toLowerCase());
        return false;
    });
}

// [新增] 综合激活判定：返回 { active, mode }
// mode: 'manualBlue'(constant) | 'autoBlue'(剧情显示命中) | 'green'(世界书扫描命中) | null
function getStoryActivationState(entry, scanText, displayText) {
    if (!entry || !entry.enabled) return { active: false, mode: null };
    const strategy = entry.strategy;
    if (strategy && strategy.type === 'constant') return { active: true, mode: 'manualBlue' };
    if (checkAutoBlueActivation(entry, displayText)) return { active: true, mode: 'autoBlue' };
    if (checkStoryActivation(entry, scanText)) return { active: true, mode: 'green' };
    return { active: false, mode: null };
}

async function scanAndPairEntries() {
  try {
    let bookNames = [];
    try {
      const charBooks = getCharWorldbookNames('current');
      if (charBooks && charBooks.primary) bookNames.push(charBooks.primary);
    } catch (e) { console.warn('无法获取角色世界书:', e); }
    if (bookNames.length === 0) return { success: false, message: '未检测到绑定世界书' };

    const targetBook = bookNames[0];
    const entries = await getWorldbook(targetBook);
    if (!entries || entries.length === 0) return { success: false, message: '世界书为空' };

    // [新增] 拉取全局置顶列表 & 手动Pro队列 & 暂时Lite名单
    let pinnedChars = [];
    let manualProChars = [];
    let tempLiteChars = [];
    try {
        const globals = await getVariables({ type: 'global' });
        if (globals && Array.isArray(globals.wuwa_pinned_chars)) {
            pinnedChars = globals.wuwa_pinned_chars;
        }
        if (globals && Array.isArray(globals.wuwa_manual_pro_chars)) {
            manualProChars = globals.wuwa_manual_pro_chars;
        }
        if (globals && Array.isArray(globals.wuwa_temp_lite_chars)) {
            tempLiteChars = globals.wuwa_temp_lite_chars;
        }
    } catch(e) {}



    const pairs = {}; 
    const stories = [];
    const summaries = [];

    entries.forEach(entry => {
      if (entry.name.includes('✍️')) {
        stories.push({ uid: entry.uid, name: entry.name, enabled: entry.enabled, bookName: targetBook, strategy: entry.strategy, simpTrad: getSimpTradType(entry.name) });
        return;
      }
      if (entry.name.includes('🎬️')) {
        summaries.push({ uid: entry.uid, name: entry.name, enabled: entry.enabled, bookName: targetBook, strategy: entry.strategy, simpTrad: getSimpTradType(entry.name) });
        return;
      }

      const type = getEntryType(entry.name);
      if (type === 'other') return;
      const coreName = getCoreName(entry.name);
      if (!coreName) return;
      
      if (!pairs[coreName]) {
        pairs[coreName] = { 
          displayName: entry.name.replace(/\[\s*(pro|lite)\s*\]/gi, '').trim(),
          coreKey: coreName, 
          bookName: targetBook,
          simpTrad: getSimpTradType(entry.name), // 🔤 简繁标记
          isPinned: pinnedChars.includes(coreName), // ⭐永久Pro
          pinIndex: pinnedChars.indexOf(coreName),  // ⭐永久Pro权重
          isManualPro: manualProChars.includes(coreName), // 🔒手动临时Pro
          manualProIndex: manualProChars.indexOf(coreName), // 🔒手动Pro权重
          isTempLite: tempLiteChars.includes(coreName), // 🔒暂时Lite（手动降级在场角色）
          _proContent: '',
          _liteContent: ''
        };
      }



      
      if (type === 'pro') { 
          pairs[coreName].proUid = entry.uid; 
          pairs[coreName].proEnabled = entry.enabled; 
          pairs[coreName]._proContent = entry.content || '';
          // 保存 Pro 条目的 strategy，以便后续取用关键词
          pairs[coreName].proStrategy = entry.strategy;
      }
      else { 
          pairs[coreName].liteUid = entry.uid; 
          pairs[coreName].liteEnabled = entry.enabled; 
          pairs[coreName]._liteContent = entry.content || '';
      }
    });

    let processedPairs = Object.values(pairs).map(pair => {
        if (pair.proUid && pair.liteUid) {
            const proHasKey = pair._proContent.includes('处女');
            const liteHasKey = pair._liteContent.includes('处女');
            if (proHasKey && liteHasKey) {
                pair.virginModifiable = true;
                const isNonVirgin = pair._proContent.includes('非处女');
                pair.isVirgin = !isNonVirgin;
            } else {
                pair.virginModifiable = false;
            }
        }
        delete pair._proContent;
        delete pair._liteContent;
        return pair;
    });

    // ========== 排序逻辑 (Z -> A 混入置顶干预) ==========
    processedPairs.sort((a, b) => {
        // 第一层：⭐永久Pro最前
        if (a.isPinned && b.isPinned) return a.pinIndex - b.pinIndex;
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        // 第二层：⭐之后，当前是Pro的角色排前面
        if (a.proEnabled && !b.proEnabled) return -1;
        if (!a.proEnabled && b.proEnabled) return 1;
        // 第三层：各组内 Z-A
        return b.displayName.localeCompare(a.displayName, 'zh-CN');
    });

    
    stories.sort((a, b) => b.name.localeCompare(a.name, 'zh-CN'));
    summaries.sort((a, b) => b.name.localeCompare(a.name, 'zh-CN'));
    // =======================================

    return { success: true, bookName: targetBook, pairs: processedPairs, stories: stories, summaries: summaries };
  } catch (error) { return { success: false, message: error.message }; }
}


// ==================== 简繁切换 ====================
async function executeSimpTradSwitch(targetMode) {
  try {
    let bookNames = [];
    try {
      const charBooks = getCharWorldbookNames('current');
      if (charBooks && charBooks.primary) bookNames.push(charBooks.primary);
    } catch (e) { console.warn('无法获取角色世界书:', e); }
    if (bookNames.length === 0) { toastr.error('未检测到绑定世界书'); return; }

    const targetBook = bookNames[0];
    const entries = await getWorldbook(targetBook);
    if (!entries || entries.length === 0) { toastr.error('世界书为空'); return; }

    const ops = [];
    const enableMarker = targetMode === 'simp' ? '(简)' : '(繁)';

    entries.forEach(entry => {
      const eSimpTrad = getSimpTradType(entry.name);
      // 非当前模式的简繁条目（含剧情/梗概）：一律关闭，不做其他改动
      if (eSimpTrad !== 'none' && eSimpTrad !== targetMode) {
        ops.push({ uid: entry.uid, enable: false });
        return;
      }
      // 当前模式或无标记的条目：
      if (eSimpTrad === targetMode || (eSimpTrad === 'none' && entry.name.includes(enableMarker))) {
        const type = getEntryType(entry.name);
        if (type === 'pro') {
          ops.push({ uid: entry.uid, enable: false });
        } else if (type === 'lite') {
          ops.push({ uid: entry.uid, enable: true });
        } else {
          // 非角色词条（剧情/梗概/其他），直接启用
          ops.push({ uid: entry.uid, enable: true });
        }
      }
    });

    // 繁体模式：额外启用"游戏术语表"
    if (targetMode === 'trad') {
      const termEntry = entries.find(e => e.name.includes('游戏术语表') || e.name.includes('術語表'));
      if (termEntry) {
        ops.push({ uid: termEntry.uid, enable: true });
        console.log('[WuWa 简繁] 🎮 已启用游戏术语表（繁体Cyberpunk术语）');
      } else {
        console.warn('[WuWa 简繁] ⚠️ 未找到"游戏术语表"条目');
      }
    } else {
      // 简体模式：关闭游戏术语表
      const termEntry = entries.find(e => e.name.includes('游戏术语表') || e.name.includes('術語表'));
      if (termEntry) {
        ops.push({ uid: termEntry.uid, enable: false });
      }
    }

    if (ops.length > 0) {
      await applyChanges(targetBook, ops, true);
      const modeLabel = targetMode === 'simp' ? '简体词条' : '繁體詞條';
      toastr.success(`🌙 已切换至：${modeLabel}`);
    } else {
      toastr.info('未找到需要切换的简繁词条');
    }

    // 刷新 UI
    setTimeout(() => {
      loadDataAndRender();
      refreshFloatingWindowContent();
    }, 400);
  } catch (e) {
    toastr.error('简繁切换失败: ' + e.message);
  }
}

async function applyChanges(bookName, targetOps, silent = false) {
  if (!targetOps || targetOps.length === 0) return;
  const uidMap = {}; targetOps.forEach(op => uidMap[op.uid] = op.enable);
  try {
    await updateWorldbookWith(bookName, (entries) => entries.map(e => uidMap.hasOwnProperty(e.uid) ? { ...e, enabled: uidMap[e.uid] } : e), { render: 'immediate' });
    setTimeout(() => { refreshFloatingWindowContent(); refreshUIIfOpen(); }, 300);
    if (!silent) toastr.info(`已更新 ${targetOps.length} 项条目状态`);
  } catch (e) { toastr.error('更新失败: ' + e.message); }
}

async function toggleStrategy(bookName, uid) {
    try {
        await updateWorldbookWith(bookName, (entries) => entries.map(e => {
            if (e.uid !== uid) return e;
            const currentType = e.strategy?.type || 'selective';
            const newType = currentType === 'constant' ? 'selective' : 'constant';
            return { ...e, strategy: { ...e.strategy, type: newType } };
        }), { render: 'immediate' });
        toastr.success('触发策略已切换');
        setTimeout(() => { loadDataAndRender(); refreshFloatingWindowContent(); }, 100);
    } catch (e) {
        toastr.error('策略切换失败: ' + e.message);
    }
}

async function applyVirginUpdate(bookName, targetPairs, setVirgin) {
    if (!targetPairs || targetPairs.length === 0) return;
    const targetUids = new Set();
    targetPairs.forEach(p => {
        if (p.proUid) targetUids.add(p.proUid);
        if (p.liteUid) targetUids.add(p.liteUid);
    });
    try {
        await updateWorldbookWith(bookName, (entries) => {
            return entries.map(entry => {
                if (!targetUids.has(entry.uid)) return entry;
                let content = entry.content || '';
                const hasNonVirgin = content.includes('非处女');
                const hasVirgin = /(?<!非)处女/.test(content);
                let newContent = content;
                if (setVirgin) {
                    if (hasNonVirgin) newContent = newContent.replace(/非处女/g, '处女');
                } else {
                    if (hasVirgin) newContent = newContent.replace(/(?<!非)处女/g, '非处女');
                }
                if (newContent !== content) return { ...entry, content: newContent };
                return entry;
            });
        }, { render: 'immediate' });
        toastr.success(setVirgin ? '已更新为：处女 🌸' : '已更新为：非处女 👠');
        loadDataAndRender();
    } catch (e) { toastr.error('设定更新失败: ' + e.message); }
}

// 【修改：⭐按钮 → 永久Pro（不占名额、永不关闭）】
async function togglePinStatus(coreKey) {
  try {
      let globals = await getVariables({ type: 'global' }) || {};
      let pinned = globals.wuwa_pinned_chars || [];
      if (!Array.isArray(pinned)) pinned = [];

      const idx = pinned.indexOf(coreKey);
      if (idx > -1) {
          // 取消永久Pro
          pinned.splice(idx, 1);
          await updateVariablesWith(v => { _.set(v, 'wuwa_pinned_chars', pinned); return v; }, { type: 'global' });
          toastr.success('已取消永久Pro ⭐');
      } else {
          // 设为永久Pro：先写入全局变量
          pinned.unshift(coreKey);
          await updateVariablesWith(v => { _.set(v, 'wuwa_pinned_chars', pinned); return v; }, { type: 'global' });
          
          // 立即强制开启该角色的Pro（不占名额）
          const res = await scanAndPairEntries();
          if (res.success) {
              const pair = res.pairs.find(p => p.coreKey === coreKey);
              if (pair && pair.proUid) {
                  await applyChanges(pair.bookName, [
                      { uid: pair.proUid, enable: true },
                      pair.liteUid ? { uid: pair.liteUid, enable: false } : null
                  ].filter(Boolean), true);
              }
          }
          toastr.success('已设为永久Pro ⭐（不占名额）');
      }
      
      // 触发界面刷新与逻辑权重计算
      await loadDataAndRender();
      if (SWITCHER_STATE.autoMode) masterLoop();
  } catch (e) {
      toastr.error('永久Pro状态更新失败: ' + e.message);
  }
}



// ==================== 逻辑层 ====================

function shouldAbortChange(localData, ops) {
  // 获取当前非永久Pro、且符合简繁模式的Pro数量
  const mode = SWITCHER_STATE.simpTradMode;
  const visiblePairs = localData.pairs.filter(p => {
    if (p.simpTrad === 'simp' && mode === 'trad') return false;
    if (p.simpTrad === 'trad' && mode === 'simp') return false;
    return true;
  });
  
  const currentNonPinnedProCount = visiblePairs.filter(p => p.proEnabled && !p.isPinned).length;
  if (currentNonPinnedProCount === 0) return false;
  
  let nextNonPinnedProCount = currentNonPinnedProCount;
  const changes = {};
  ops.forEach(op => { changes[op.uid] = op.enable; });
  
  visiblePairs.forEach(p => {
    // 永久Pro角色不参与计数，且绝不允许被关闭
    if (p.isPinned && p.proUid && changes.hasOwnProperty(p.proUid) && changes[p.proUid] === false) {
      console.log(`[WuWa Logic] 🛡️ 拦截：禁止关闭永久Pro角色 ${p.displayName}`);
      return true; // 标记需要拦截
    }
    if (p.proUid && changes.hasOwnProperty(p.proUid) && !p.isPinned) {
      const willBeEnabled = changes[p.proUid];
      const isCurrentlyEnabled = p.proEnabled;
      if (isCurrentlyEnabled && !willBeEnabled) nextNonPinnedProCount--;
      else if (!isCurrentlyEnabled && willBeEnabled) nextNonPinnedProCount++;
    }
  });
  
  // 检查是否有永久Pro被尝试关闭
  let pinnedViolation = false;
  visiblePairs.forEach(p => {
    if (p.isPinned && p.proUid && changes.hasOwnProperty(p.proUid) && changes[p.proUid] === false) {
      pinnedViolation = true;
    }
  });
  if (pinnedViolation) {
    console.log(`[WuWa Logic] 🛡️ 拦截生效：检测到尝试关闭永久Pro角色，已忽略。`);
    return true;
  }
  
  if (nextNonPinnedProCount === 0 && currentNonPinnedProCount > 0) {
    console.log(`[WuWa Logic] 🛡️ 拦截生效：检测到所有非永久Pro角色即将离场，已忽略。`);
    return true;
  }
  return false;
}



async function logicScanContext(localData) {
  if (!window.TavernHelper) return;
  try {
      // 🛡️ 飞讯活跃时禁止任何常规在场扫描
      if (feixunActive) {
          console.log('[WuWa Logic] 🛡️ 飞讯活跃中，跳过常规在场扫描');
          return;
      }
      // 🔒 如果输入覆盖活跃（5.互动角色有内容），跳过变量上下文扫描
      // 保证 5.互动角色优先级高于变量在场形态
      if (typeof inputOverrideActive !== 'undefined' && inputOverrideActive) {
          console.log('[WuWa Logic] 🛡️ 输入覆盖活跃中，跳过变量上下文扫描');
          return;
      }

      
      let maxProCount = 3;
      let tempLiteChars = [];
      let manualProSeenPresent = [];
      let tempLiteSeenPresent = []; // 记录暂时 Lite 角色是否已实际出场过
      let nextEventSeen = []; // 记录曾经被下一事件节点提及过的角色（用于降级判定）
      let nextEventEvictedAt = {}; // 记录角色变为 evictedNextEvent 的时间戳（毫秒），用于3分钟宽限期
      try {
          const globals = await getVariables({ type: 'global' });
          if (globals && globals.wuwa_max_pro_count !== undefined) {
              maxProCount = parseInt(globals.wuwa_max_pro_count, 10);
          }
          if (globals && Array.isArray(globals.wuwa_temp_lite_chars)) {
              tempLiteChars = globals.wuwa_temp_lite_chars;
          }
          if (globals && Array.isArray(globals.wuwa_manual_pro_seen_present)) {
              manualProSeenPresent = globals.wuwa_manual_pro_seen_present;
          }
          if (globals && Array.isArray(globals.wuwa_temp_lite_seen_present)) {
              tempLiteSeenPresent = globals.wuwa_temp_lite_seen_present;
          }
          if (globals && Array.isArray(globals.wuwa_next_event_seen)) {
              nextEventSeen = globals.wuwa_next_event_seen;
          }
          if (globals && globals.wuwa_next_event_evicted_at && typeof globals.wuwa_next_event_evicted_at === 'object') {
              nextEventEvictedAt = globals.wuwa_next_event_evicted_at;
          }
      } catch(e) {}


      const vars = await TavernHelper.getVariables({ type: 'message', message_id: -1 });
      const femaleChars = _.get(vars, 'stat_data.女性角色') || {};
      const nextEventText = _.get(vars, 'stat_data.即将进行的下一个事件节点', '') || '';
      const ops = [];
      const mode = SWITCHER_STATE.simpTradMode;


      // ========== 第一阶段：收集所有角色的在场状态和好感度 ==========
      const allCharInfos = []; // { char, isPresent, affinity, category }

      localData.pairs.forEach(char => {
          // 🔤 简繁过滤：非当前模式的词条跳过，并确保关闭
          if (char.simpTrad === 'simp' && mode === 'trad') {
              // 繁体模式下，简体词条保持关闭
              if (char.proEnabled && char.proUid) ops.push({ uid: char.proUid, enable: false });
              if (char.liteEnabled && char.liteUid) ops.push({ uid: char.liteUid, enable: false });
              return;
          }
          if (char.simpTrad === 'trad' && mode === 'simp') {
              // 简体模式下，繁体词条保持关闭
              if (char.proEnabled && char.proUid) ops.push({ uid: char.proUid, enable: false });
              if (char.liteEnabled && char.liteUid) ops.push({ uid: char.liteUid, enable: false });
              return;
          }

          const proKeys = (char.proStrategy && Array.isArray(char.proStrategy.keys)) ? char.proStrategy.keys : [];
          
          let isPresent = false;
          let affinity = 40; 
          
          if (proKeys.length > 0) {
              const femaleNames = Object.keys(femaleChars);
              for (let name of femaleNames) {
                  const nameLower = name.toLowerCase();
                  if (proKeys.some(key => nameLower.includes(key.toLowerCase()))) {
                      const charData = femaleChars[name];
                      let charPresent = _.get(charData, '是否在场', false);
                      if (typeof charPresent === 'string') {
                          const lower = charPresent.toLowerCase();
                          charPresent = (lower === 'true' || lower === 'yes' || lower === '1');
                      }
                      if (charPresent) {
                          isPresent = true;
                          const charAffinity = Number(_.get(charData, '好感度', 40)) || 40;
                          if (charAffinity > affinity) affinity = charAffinity;
                      }
                  }
              }
          } else {
              const charName = char.coreKey;
              let charData = femaleChars[charName];
              if (!charData) {
                 const fuzzyKey = Object.keys(femaleChars).find(key => key.includes(charName) || charName.includes(key));
                 if (fuzzyKey) charData = femaleChars[fuzzyKey];
              }
              if (charData) {
                  let present = _.get(charData, '是否在场', false);
                  if (typeof present === 'string') {
                        const lower = present.toLowerCase();
                        present = (lower === 'true' || lower === 'yes' || lower === '1');
                  }
                  isPresent = present;
                  affinity = Number(_.get(charData, '好感度', 40)) || 40;
              }
          }

          // 分类：
          // - pinned: ⭐永久Pro，不占名额
          // - manualPro: 🔒手动临时Pro，占名额，视为在场（优先级高于自动）
          // - autoCandidate: 在场但非pinned非manualPro → 自动候选
          // - tempLite: 在场但被手动锁定为Lite → 不参与Pro分配，离场后自动解除
          // - nextEventCandidate: 不在场但在"即将进行的下一个事件节点"中被提及 → 与在场候选共同竞争名额（在场优先）
          // - absentSticky: 不在场但当前是Pro（非pinned非manualPro）→ 粘性Pro
          // - evictedNextEvent: 曾被下一节点提及、本轮不再被提及、当前是Pro → 低于粘性，最易淘汰
          // - absentLite: 不在场且不是Pro
          let category = 'autoCandidate';
          if (char.isPinned) {
              category = 'pinned';
          } else if (char.isManualPro) {
              if (isPresent) {
                  // 手动Pro角色实际在场 → 记录"已见在场"，保持manualPro
                  category = 'manualPro';
                  if (!manualProSeenPresent.includes(char.coreKey)) {
                      manualProSeenPresent.push(char.coreKey);
                  }
              } else if (manualProSeenPresent.includes(char.coreKey)) {
                  // 手动Pro角色已离场（曾经在场过）→ 降级，不再视为manualPro
                  // 将在第二阶段附清理中从 wuwa_manual_pro_chars 和 seen_present 中移除
                  category = char.proEnabled ? 'absentSticky' : 'absentLite';
              } else {
                  // 手动Pro角色从未到场过 → 保持manualPro高优先级
                  category = 'manualPro';
              }
          } else if (isPresent && tempLiteChars.includes(char.coreKey)) {
              category = 'tempLite'; // 在场但被手动锁定为Lite
              // 同时标记该角色已出场，用于后续退场清理
              if (!tempLiteSeenPresent.includes(char.coreKey)) {
                  tempLiteSeenPresent.push(char.coreKey);
              }
          } else if (!isPresent) {
            // 检查是否在"即将进行的下一个事件节点"中被提及
            let mentionedInNextEvent = false;
            if (nextEventText) {
                if (proKeys.length > 0) {
                    mentionedInNextEvent = proKeys.some(key => nextEventText.includes(key));
                } else {
                    mentionedInNextEvent = nextEventText.includes(char.coreKey) || nextEventText.includes(char.displayName);
                }
                
                // [新增] 拦截：如果匹配成功，且当前词条为漂泊者，则检查 NPC漂泊者.是否存在 变量
                if (mentionedInNextEvent) {
                    let isRoverEntry = char.coreKey.includes('漂泊者') || char.displayName.includes('漂泊者') || char.displayName.includes('男漂') || char.displayName.includes('女漂');
                    if (!isRoverEntry && proKeys.length > 0) {
                        isRoverEntry = proKeys.some(key => key.includes('漂泊者') || key.includes('男漂') || key.includes('女漂'));
                    }
                    if (isRoverEntry) {
                        const npcRoverVar = _.get(vars, 'stat_data.NPC漂泊者.是否存在');
                        let isNpcRoverExist = true; // 默认假设存在，除非变量明确为 false
                        if (npcRoverVar === false || (typeof npcRoverVar === 'string' && ['false', 'no', '0'].includes(npcRoverVar.toLowerCase().trim()))) {
                            isNpcRoverExist = false;
                        }
                        if (!isNpcRoverExist) {
                            mentionedInNextEvent = false;
                            console.log(`[WuWa Logic] 🛡️ 变量显示NPC漂泊者不存在，已拒绝下一节点中的漂泊者匹配`);
                        }
                    }
                }
            }

            // evictedNextEvent 宽限期（毫秒）：被预告但未登场、预告消失后，给3分钟等它登场，到期强制 Lite
            const EVICTED_GRACE_MS = 3 * 60 * 1000;
            // 如果角色在暂时 Lite 锁定名单中，即使被下一事件节点提及也不能成为候选，强制归为 Lite
            // 同时清除其下一节点历史和降级计时（手动 Lite 即打入冷宫，不再保留预告记忆）
            if (tempLiteChars.includes(char.coreKey)) {
                category = 'absentLite';
                const _tl = nextEventSeen.indexOf(char.coreKey); if (_tl >= 0) nextEventSeen.splice(_tl, 1);
                if (nextEventEvictedAt.hasOwnProperty(char.coreKey)) delete nextEventEvictedAt[char.coreKey];
            } else if (mentionedInNextEvent) {
                category = 'nextEventCandidate'; // 不在场但被下一事件节点提及（优先于粘性）
                if (!nextEventSeen.includes(char.coreKey)) nextEventSeen.push(char.coreKey);
                // 重新被提及 → 清除降级计时（重置）
                if (nextEventEvictedAt.hasOwnProperty(char.coreKey)) delete nextEventEvictedAt[char.coreKey];
            } else if (char.proEnabled && nextEventSeen.includes(char.coreKey)) {
                // 曾被下一节点提及、本轮不再被提及、当前是Pro → 进入降级宽限期
                const now = Date.now();
                const evictedAt = nextEventEvictedAt[char.coreKey];
                if (evictedAt && (now - evictedAt) >= EVICTED_GRACE_MS) {
                    // 宽限期已过仍未登场 → 打入冷宫，强制 Lite
                    category = 'absentLite';
                    // 惩罚执行完毕，清除历史标记
                    const i1 = nextEventSeen.indexOf(char.coreKey); if (i1 >= 0) nextEventSeen.splice(i1, 1);
                    if (nextEventEvictedAt.hasOwnProperty(char.coreKey)) delete nextEventEvictedAt[char.coreKey];
                    console.log(`[WuWa Logic] ⏰ 降级宽限期到期：${char.displayName} 已强制降为 Lite`);
                } else {
                    // 宽限期内：保持 Pro 但优先级最低（易被挤），并记录开始计时
                    if (!evictedAt) nextEventEvictedAt[char.coreKey] = now;
                    category = 'evictedNextEvent';
                }
            } else if (char.proEnabled) {
                category = 'absentSticky'; // 不在场但当前是Pro（粘性保留）
            } else {
                category = 'absentLite'; // 不在场且不是Pro
            }
        }

          // 角色实际在场 → 洗白：从下一节点历史和降级计时中清除（登场即原谅）
          if (isPresent) {
              const _i = nextEventSeen.indexOf(char.coreKey); if (_i >= 0) nextEventSeen.splice(_i, 1);
              if (nextEventEvictedAt.hasOwnProperty(char.coreKey)) delete nextEventEvictedAt[char.coreKey];
          }
          // 兜底：角色当前不是 Pro（含手动 Lite、被自动踢成 Lite 等）却在下一节点历史里 → 清除历史
          // 避免"手动开 Pro 又被 evictedNextEvent 自动踢"的循环
          if (!char.proEnabled && nextEventSeen.includes(char.coreKey)) {
              const _j = nextEventSeen.indexOf(char.coreKey); if (_j >= 0) nextEventSeen.splice(_j, 1);
              if (nextEventEvictedAt.hasOwnProperty(char.coreKey)) delete nextEventEvictedAt[char.coreKey];
          }

          allCharInfos.push({ char, isPresent, affinity, category });

      });

      // ========== 第二阶段：队列式Pro分配（含淘汰机制）==========
      
      // 1. 永久Pro角色：全部Pro（不占名额）
      const pinnedChars = allCharInfos.filter(c => c.category === 'pinned');
      
      // 2. 手动Pro角色：按优先级排序后，受上限约束
      const allManualProChars = allCharInfos.filter(c => c.category === 'manualPro');
      // manualProIndex 越小 = 越晚加入 = 优先级越高 (LIFO)
      allManualProChars.sort((a, b) => a.char.manualProIndex - b.char.manualProIndex);
      // 受上限约束：最多保留 maxProCount 个手动Pro
      const manualProChars = allManualProChars.slice(0, maxProCount);
      const overflowedManualChars = allManualProChars.slice(maxProCount);
      const manualCount = manualProChars.length;
      
      // 溢出的手动Pro角色强制降级到自动候选池参与淘汰
      overflowedManualChars.forEach(c => {
        c.category = 'autoCandidate';
        c.isPresent = true; // 视为在场（本来就在队列里）
        allCharInfos.find(info => info.char.coreKey === c.char.coreKey).category = 'autoCandidate';
      });
      
      // 3. 剩余可用名额
      const remainingSlots = Math.max(0, maxProCount - manualCount);
      
      // 4. 自动候选角色（在场，非pinned非manualPro，非暂时Lite）
      //    排序规则：好感度从高到低；同好感度按名字 A→Z（淘汰时从 Z 开始淘汰）
      const autoCandidates = allCharInfos.filter(c => c.category === 'autoCandidate');
      autoCandidates.sort((a, b) => {
          if (b.affinity !== a.affinity) return b.affinity - a.affinity;
          // 同好感度：A 在前（保留），Z 在后（淘汰）
          return a.char.displayName.localeCompare(b.char.displayName, 'zh-CN');
      });
      
      // 4.5 下一事件节点候选角色（不在场但被"即将进行的下一个事件节点"提及）
      //     与在场候选共同竞争名额，但优先级低于在场角色
      const nextEventCandidates = allCharInfos.filter(c => c.category === 'nextEventCandidate');
      nextEventCandidates.sort((a, b) => {
          if (b.affinity !== a.affinity) return b.affinity - a.affinity;
          return a.char.displayName.localeCompare(b.char.displayName, 'zh-CN');
      });

      // 4.6 降级候选：曾经被下一节点提及、本轮不再被提及、当前是Pro
      //     优先级低于粘性Pro，最易被淘汰
      const evictedNextEventChars = allCharInfos.filter(c => c.category === 'evictedNextEvent');
      evictedNextEventChars.sort((a, b) => {
          if (b.affinity !== a.affinity) return b.affinity - a.affinity;
          return a.char.displayName.localeCompare(b.char.displayName, 'zh-CN');
      });

      // 5. 不在场但当前是Pro的粘性角色
      //    排序规则：好感度从高到低；同好感度按名字 A→Z（淘汰时从 Z 开始淘汰）
      const absentStickyChars = allCharInfos.filter(c => c.category === 'absentSticky');
      absentStickyChars.sort((a, b) => {
          if (b.affinity !== a.affinity) return b.affinity - a.affinity;
          return a.char.displayName.localeCompare(b.char.displayName, 'zh-CN');
      });
      
      // 6. 不在场且不是Pro的角色（必然是Lite）
      const absentLiteChars = allCharInfos.filter(c => c.category === 'absentLite');
      
      // 7. 合并候选池：在场autoCandidate + 下一节点候选，共同竞争 remainingSlots
      //    优先级：在场角色 > 下一节点候选（同好感度时在场排前）
      const mergedCandidates = [...autoCandidates, ...nextEventCandidates];
      mergedCandidates.sort((a, b) => {
          // 在场优先：isPresent true 排前
          if (a.isPresent !== b.isPresent) return a.isPresent ? -1 : 1;
          if (b.affinity !== a.affinity) return b.affinity - a.affinity;
          return a.char.displayName.localeCompare(b.char.displayName, 'zh-CN');
      });
      const mergedProChars = mergedCandidates.slice(0, remainingSlots);
      const mergedLiteCandidates = mergedCandidates.slice(remainingSlots);
      // 拆分回 auto/nextEvent 以兼容后续变量名
      const autoProChars = mergedProChars.filter(c => c.category === 'autoCandidate');
      const autoLiteCandidates = mergedLiteCandidates.filter(c => c.category === 'autoCandidate');
      let nextEventProChars = mergedProChars.filter(c => c.category === 'nextEventCandidate');
      let nextEventLiteChars = mergedLiteCandidates.filter(c => c.category === 'nextEventCandidate');

      // 8. 🔧 粘性Pro名额：合并候选填完后剩余名额给粘性，再剩余给降级候选
      const usedByMerged = mergedProChars.length;
      const stickySlots = Math.max(0, remainingSlots - usedByMerged);
      const stickyProChars = absentStickyChars.slice(0, stickySlots);
      const evictedStickyChars = absentStickyChars.slice(stickySlots); // 被淘汰的粘性角色 → 降级为Lite
      // 8.5 降级候选名额：粘性填完后仍有剩余，才保留降级候选的Pro
      const evictedNextRemainingSlots = Math.max(0, stickySlots - stickyProChars.length);
      const evictedNextProChars = evictedNextEventChars.slice(0, evictedNextRemainingSlots);
      const evictedNextLiteChars = evictedNextEventChars.slice(evictedNextRemainingSlots);
      
      // ========== 第二阶段附：清理暂时Lite名单 + 手动Pro离场降级 ==========
      
      // 1. 暂时Lite清理：仅移除已出场且已离场的角色（必须经历完整 in→out 过程）
      const tempLiteToRemove = [];
      allCharInfos.forEach(info => {
          if (tempLiteChars.includes(info.char.coreKey) && !info.isPresent && tempLiteSeenPresent.includes(info.char.coreKey)) {
              tempLiteToRemove.push(info.char.coreKey);
          }
      });
      
      // 2. 手动Pro离场降级：检测曾经在场但现在离场的手动Pro角色

      const manualProToRemove = [];
      allCharInfos.forEach(info => {
          if (info.char.isManualPro && !info.isPresent && manualProSeenPresent.includes(info.char.coreKey)) {
              manualProToRemove.push(info.char.coreKey);
          }
      });
      
      // 3. 合并写入全局变量（统一处理所有需要持久化的变更）
      const updateVars = {};
      
      // 3a. 暂时Lite清理（同时清理已出场记录）
if (tempLiteToRemove.length > 0) {
    tempLiteChars = tempLiteChars.filter(k => !tempLiteToRemove.includes(k));
    tempLiteSeenPresent = tempLiteSeenPresent.filter(k => !tempLiteToRemove.includes(k));
    updateVars.wuwa_temp_lite_chars = tempLiteChars;
    updateVars.wuwa_temp_lite_seen_present = tempLiteSeenPresent;
          console.log('[WuWa Logic] 🧹 暂时Lite清理：已移除离场角色', tempLiteToRemove);
      } else {
          // 没有要移除的角色，但仍需持久化 seen_present（可能有新增记录）
          // 此处在 3d 中无变化时不会写入，但我们仍需确保新增的 seen 记录被保存
      }
      
      // （在统一写入前）无条件检查 temp_lite_seen_present 是否需要持久化（无论清理与否）
      try {
          const gl = await getVariables({ type: 'global' });
          const existingTempLiteSeen = (gl && Array.isArray(gl.wuwa_temp_lite_seen_present)) ? gl.wuwa_temp_lite_seen_present : [];
          const hasNewTempLiteSeen = tempLiteSeenPresent.some(k => !existingTempLiteSeen.includes(k));
          const hasRemovedTempLiteSeen = existingTempLiteSeen.some(k => !tempLiteSeenPresent.includes(k));
          if (hasNewTempLiteSeen || hasRemovedTempLiteSeen) {
              updateVars.wuwa_temp_lite_seen_present = tempLiteSeenPresent;
          }
      } catch(e) {}

      
      // 3b. 手动Pro离场降级
      if (manualProToRemove.length > 0) {
          let currentManualPro = [];
          try {
              const gl = await getVariables({ type: 'global' });
              if (gl && Array.isArray(gl.wuwa_manual_pro_chars)) {
                  currentManualPro = gl.wuwa_manual_pro_chars;
              }
          } catch(e) {}
          updateVars.wuwa_manual_pro_chars = currentManualPro.filter(k => !manualProToRemove.includes(k));
          console.log('[WuWa Logic] 🔓 手动Pro离场降级：已移除', manualProToRemove);
      }
      
      // 3c. seen_present 持久化（无条件检查：新增记录或移除记录都需要写回）
      try {
          const gl = await getVariables({ type: 'global' });
          const existing = (gl && Array.isArray(gl.wuwa_manual_pro_seen_present)) ? gl.wuwa_manual_pro_seen_present : [];
          // 计算最终值：本轮累积的 seen_present 减去需要移除的
          const finalSeenPresent = manualProSeenPresent.filter(k => !manualProToRemove.includes(k));
          // 判断是否有变化（新增或移除）
          const hasNewEntries = finalSeenPresent.some(k => !existing.includes(k));
          const hasRemovedEntries = existing.some(k => !finalSeenPresent.includes(k));
          if (hasNewEntries || hasRemovedEntries) {
              updateVars.wuwa_manual_pro_seen_present = finalSeenPresent;
          }
      } catch(e) {}
      
      // 3c2. nextEventSeen / nextEventEvictedAt 持久化（用 updateVariablesWith 显式 set/unset，避免 lodash 深合并导致空对象无法清空旧键）
      try {
          await updateVariablesWith(v => {
              // nextEventSeen：以本轮内存为准整体替换
              _.set(v, 'wuwa_next_event_seen', [...nextEventSeen]);
              // nextEventEvictedAt：以本轮内存为准整体替换（空对象时用 unset 彻底删除键，否则 set）
              if (Object.keys(nextEventEvictedAt).length === 0) {
                  _.unset(v, 'wuwa_next_event_evicted_at');
              } else {
                  _.set(v, 'wuwa_next_event_evicted_at', { ...nextEventEvictedAt });
              }
              return v;
          }, { type: 'global' });
      } catch(e) { console.warn('[WuWa Logic] nextEventSeen/evictedAt 持久化失败:', e); }
      
      // 3d. 一次性写入（用 updateVariablesWith + _.set 整体替换每个键，避免深合并导致数组/对象清不干净）
      if (Object.keys(updateVars).length > 0) {
          try {
              await updateVariablesWith(v => {
                  for (const k in updateVars) {
                      if (updateVars[k] === null || (Array.isArray(updateVars[k]) && updateVars[k].length === 0)) {
                          _.unset(v, k);
                      } else {
                          _.set(v, k, updateVars[k]);
                      }
                  }
                  return v;
              }, { type: 'global' });
          } catch(e) {}
      }


      // ========== 第三阶段：生成 ops ==========
      // 需要开启Pro的角色：pinned + manualPro + autoPro + nextEventPro + stickyPro（受名额约束后）
      // 需要开启Lite的角色：autoLiteCandidates + nextEventLiteChars + absentLiteChars + evictedStickyChars + tempLite角色
      
      const shouldBePro = new Set([
          ...pinnedChars.map(c => c.char.coreKey),
          ...manualProChars.map(c => c.char.coreKey),
          ...autoProChars.map(c => c.char.coreKey),
          ...nextEventProChars.map(c => c.char.coreKey),
          ...stickyProChars.map(c => c.char.coreKey),
          ...evictedNextProChars.map(c => c.char.coreKey)
      ]);

      
      // 为所有角色生成 ops
      allCharInfos.forEach(info => {
          const char = info.char;
          const shouldPro = shouldBePro.has(char.coreKey);
          
          if (shouldPro) {
              if (!char.proEnabled && char.proUid) ops.push({ uid: char.proUid, enable: true });
              if (char.liteEnabled && char.liteUid) ops.push({ uid: char.liteUid, enable: false });
          } else {
              if (!char.liteEnabled && char.liteUid) ops.push({ uid: char.liteUid, enable: true });
              if (char.proEnabled && char.proUid) ops.push({ uid: char.proUid, enable: false });
          }
      });

      if (ops.length > 0) {
          if (shouldAbortChange(localData, ops)) return;
          console.log(`[WuWa Loop] Variable Change Detected (Context): ${ops.length} 条更新 | 永久Pro:${pinnedChars.length} 手动Pro:${manualCount} 自动Pro:${autoProChars.length} 事件节点Pro:${nextEventProChars.length} 粘性Pro:${stickyProChars.length} 降级Pro:${evictedNextProChars.length} 淘汰粘性:${evictedStickyChars.length} 暂时Lite:${allCharInfos.filter(c=>c.category==='tempLite').length} 上限:${maxProCount}`);

          await applyChanges(localData.pairs[0].bookName, ops, true); 
      }
  } catch (error) { console.error('[WuWa Logic] Variable scan error:', error); }
}



let lastInputMemory = '';
// [新增] 输入覆盖活跃标记：当5.互动角色有内容时置为 true，阻止变量上下文扫描改写Pro
let inputOverrideActive = false;
let feixunActive = false;
let feixunSavedProQueue = [];


async function logicScanInput(localData) {
    const $input = $('#send_textarea');
    const val = $input.val();
    if (!val || typeof val !== 'string' || !val.includes('[系统指令：生成开场剧情]')) {
        if (lastInputMemory !== '' && (!val || val.trim() === '')) {
            lastInputMemory = '';
            inputOverrideActive = false; // 输入已清除，释放覆盖标记
        }
        return false;
    }
    
      // [新增] 开场指令触发时，清空手动Pro队列、暂时Lite名单和已见在场记录
    try {
        await updateVariablesWith(v => {
            _.set(v, 'wuwa_manual_pro_chars', []);
            _.set(v, 'wuwa_temp_lite_chars', []);
            _.set(v, 'wuwa_manual_pro_seen_present', []);
            _.set(v, 'wuwa_temp_lite_seen_present', []);
            _.set(v, 'wuwa_next_event_seen', []);
            _.unset(v, 'wuwa_next_event_evicted_at');
            return v;
        }, { type: 'global' });
        console.log('[WuWa Logic] 🧹 开场指令触发，已清空手动Pro队列、暂时Lite名单、已见在场记录、下一节点历史和降级计时');
    } catch(e) {}



    const charMatch = val.match(/5\.\s*互动角色：(.*?)\n/);
    if (charMatch && charMatch[1]) {
        const targetStr = charMatch[1].trim();
        // 如果目标未变且非空，保持当前Pro状态，不重复操作
        if (targetStr === lastInputMemory) return true;
        // 如果互动角色为"暂无"或空，仍视为输入覆盖活跃（阻止变量扫描改写）
        if (targetStr === '暂无' || !targetStr) {
            inputOverrideActive = true;
            return true;
        }
        
        lastInputMemory = targetStr;
        inputOverrideActive = true; // 🔒 标记输入覆盖活跃，变量在场变化不改变Pro
        
        const targets = targetStr.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
        const ops = [];
        const mode = SWITCHER_STATE.simpTradMode;
        localData.pairs.forEach(p => {
            // 🔤 简繁过滤：非当前模式的词条跳过，不参与匹配
            if (p.simpTrad === 'simp' && mode === 'trad') return;
            if (p.simpTrad === 'trad' && mode === 'simp') return;

            let isTarget = false;
            // 读取 Pro 条目的关键词列表
            const proKeys = (p.proStrategy && Array.isArray(p.proStrategy.keys)) ? p.proStrategy.keys : [];
            if (proKeys.length > 0) {
                // 有关键词：检查targets中的名字是否包含任意关键词
                isTarget = targets.some(t => proKeys.some(key => t.includes(key)));
            } else {
                // 无关键词：回退到原逻辑，使用条目名称核心词或显示名匹配
                isTarget = targets.some(t => p.displayName.includes(t) || p.coreKey.includes(t));
            }
            
            if (isTarget) {
                // 🔓 5.互动角色不受Pro上限约束，直接开启Pro
                if (p.proUid) ops.push({ uid: p.proUid, enable: true });
                if (p.liteUid) ops.push({ uid: p.liteUid, enable: false });
            } else {
                if (p.liteUid) ops.push({ uid: p.liteUid, enable: true });
                if (p.proUid) ops.push({ uid: p.proUid, enable: false });
            }
        });
        if (ops.length > 0) {
            // 5.互动角色场景下跳过 shouldAbortChange 检查（不受全灭拦截）
            console.log(`[WuWa Logic] 🎯 开场指令接管：互动角色 [${targets.join(', ')}]，共${ops.length}条更新（不受Pro上限约束）`);
            await applyChanges(localData.pairs[0].bookName, ops, true); 
        }
        return true;
    }
    
    // 即使没匹配到 5.互动角色，只要命令仍在输入框就阻止变量扫描
    inputOverrideActive = true;
    return true;
}

// ==================== [新增] 飞讯全局状态扫描（快照保存/覆盖/还原） ====================
async function logicScanFeixun(localData) {
    let fxShared = null;
    // 多路探测：尝试从所有可能挂载的全局作用域中捕获 FeixunShared
    const scopes = [
        typeof globalThis !== 'undefined' ? globalThis : null,
        typeof window !== 'undefined' ? window : null,
        typeof top !== 'undefined' ? top : null,
        typeof parent !== 'undefined' ? parent : null,
        (typeof window !== 'undefined' && window.parent) ? window.parent : null
    ];
    
    for (let scope of scopes) {
        if (scope && scope.FeixunShared) {
            fxShared = scope.FeixunShared;
            break;
        }
    }

    const isActive = fxShared && fxShared.currentChat && fxShared.currentChat.trim() !== "";

    if (isActive) {
        // ── 飞讯进入／保持活跃 ──
        if (!feixunActive) {
            // 从非活跃进入活跃：保存当前所有非永久Pro角色的快照（coreKey）
            feixunSavedProQueue = [];
            localData.pairs.forEach(p => {
                if (p.proEnabled && !p.isPinned) {
                    feixunSavedProQueue.push(p.coreKey);
                }
            });
            console.log('[WuWa Logic] 📱 飞讯进入活跃，保存Pro快照:', feixunSavedProQueue);
        }
        feixunActive = true;

        // 覆盖：对飞讯目标开Pro，非目标且不在快照中的关Pro（保留快照队列，永不关闭永久Pro）
        const targetStr = fxShared.currentChat;
        const ops = [];
        const mode = SWITCHER_STATE.simpTradMode;

        localData.pairs.forEach(p => {
            // 🔤 简繁过滤：非当前模式的词条不处理
            if (p.simpTrad === 'simp' && mode === 'trad') return;
            if (p.simpTrad === 'trad' && mode === 'simp') return;
            // ⭐ 永久Pro角色不干预（飞讯不能关闭它们）
            if (p.isPinned) return;

            let isTarget = false;
            const proKeys = (p.proStrategy && Array.isArray(p.proStrategy.keys)) ? p.proStrategy.keys : [];
            if (proKeys.length > 0) {
                isTarget = proKeys.some(key => targetStr.includes(key));
            } else {
                isTarget = targetStr.includes(p.coreKey) || targetStr.includes(p.displayName);
            }

            if (isTarget) {
                if (!p.proEnabled && p.proUid) ops.push({ uid: p.proUid, enable: true });
                if (p.liteEnabled && p.liteUid) ops.push({ uid: p.liteUid, enable: false });
            } else {
                // 非目标角色：直接关闭Pro（永久Pro除外），实现绝对覆盖
                if (!p.isPinned) {
                    if (!p.liteEnabled && p.liteUid) ops.push({ uid: p.liteUid, enable: true });
                    if (p.proEnabled && p.proUid) ops.push({ uid: p.proUid, enable: false });
                }
            }

        });

        if (ops.length > 0) {
            // 飞讯覆盖不受全灭拦截，不占名额
            console.log('[WuWa Logic] 📱 飞讯终端接管控制权，目标:', targetStr);
            await applyChanges(localData.pairs[0].bookName, ops, true);
        }
        return true;
    } else {
        // ── 飞讯退出活跃 ──
        if (feixunActive) {
            // 还原快照中的Pro队列（同时也关闭不在快照中的Pro）
            console.log('[WuWa Logic] 📱 飞讯退出活跃，还原Pro快照:', feixunSavedProQueue);
            const restoreOps = [];
            const mode = SWITCHER_STATE.simpTradMode;
            localData.pairs.forEach(p => {
                if (p.isPinned) return; // 永久Pro不干预
                // 简繁过滤：只处理当前模式的词条
                if (p.simpTrad === 'simp' && mode === 'trad') return;
                if (p.simpTrad === 'trad' && mode === 'simp') return;
                const shouldPro = feixunSavedProQueue.includes(p.coreKey);
                if (shouldPro) {
                    if (!p.proEnabled && p.proUid) restoreOps.push({ uid: p.proUid, enable: true });
                    if (p.liteEnabled && p.liteUid) restoreOps.push({ uid: p.liteUid, enable: false });
                } else {
                    // 不在快照中的角色必须关闭Pro（除非是永久Pro，已跳过）
                    if (!p.liteEnabled && p.liteUid) restoreOps.push({ uid: p.liteUid, enable: true });
                    if (p.proEnabled && p.proUid) restoreOps.push({ uid: p.proUid, enable: false });
                }
            });
            if (restoreOps.length > 0) {
                await applyChanges(localData.pairs[0].bookName, restoreOps, true);
            }
            feixunSavedProQueue = [];
            feixunActive = false;
        }


        return false;
    }
}



// ==================== [新增] 楼层0强制同步 ====================
async function logicScanFloorZero(localData) {
    try {
        // 🛡️ 飞讯活跃时禁止楼层0同步（飞讯覆盖一切）
        if (feixunActive) {
            console.log('[WuWa Logic] 🛡️ 飞讯活跃中，跳过楼层0扫描');
            return;
        }
        // 检查最新楼层是否为 0 层
        const latestMessages = getChatMessages(-1);

        if (!latestMessages || latestMessages.length === 0) return false;
        
        const latestMsg = latestMessages[0];
        if (latestMsg.message_id !== 0) return false;
        
        // 最新楼层是 0 层，读取该层变量中的角色在场状态
        const floorZeroVars = latestMsg.data || {};
        const femaleChars = _.get(floorZeroVars, 'stat_data.女性角色') || {};
        
        // 检查是否有任何角色在场
        let hasPresent = false;
        for (let charName of Object.keys(femaleChars)) {
            const charData = femaleChars[charName];
            let present = _.get(charData, '是否在场', false);
            if (typeof present === 'string') {
                const lower = present.toLowerCase();
                present = (lower === 'true' || lower === 'yes' || lower === '1');
            }
            if (present) { hasPresent = true; break; }
        }
        
        if (!hasPresent) return false; // 无人在场，不需要干预
        
        // 有角色在场：清空手动Pro队列、暂时Lite名单和已见在场记录
        await updateVariablesWith(v => {
            _.set(v, 'wuwa_manual_pro_chars', []);
            _.set(v, 'wuwa_temp_lite_chars', []);
            _.set(v, 'wuwa_manual_pro_seen_present', []);
            _.set(v, 'wuwa_temp_lite_seen_present', []);
            _.set(v, 'wuwa_next_event_seen', []);
            _.unset(v, 'wuwa_next_event_evicted_at');
            return v;
        }, { type: 'global' });
        console.log('[WuWa Logic] 🏠 楼层0强制同步：已清空手动Pro队列、暂时Lite名单、已见在场记录、下一节点历史和降级计时');
        
        // 强制只开启在场角色的Pro条目，其余一律Lite
        const ops = [];
        const mode = SWITCHER_STATE.simpTradMode;
        
        localData.pairs.forEach(char => {
            // 🔤 简繁过滤
            if (char.simpTrad === 'simp' && mode === 'trad') return;
            if (char.simpTrad === 'trad' && mode === 'simp') return;
            // ⭐ 永久Pro角色不干预
            if (char.isPinned) return;
            
            const proKeys = (char.proStrategy && Array.isArray(char.proStrategy.keys)) ? char.proStrategy.keys : [];
            let isPresent = false;
            
            if (proKeys.length > 0) {
                const femaleNames = Object.keys(femaleChars);
                for (let name of femaleNames) {
                    const nameLower = name.toLowerCase();
                    if (proKeys.some(key => nameLower.includes(key.toLowerCase()))) {
                        const charData = femaleChars[name];
                        let charPresent = _.get(charData, '是否在场', false);
                        if (typeof charPresent === 'string') {
                            const lower = charPresent.toLowerCase();
                            charPresent = (lower === 'true' || lower === 'yes' || lower === '1');
                        }
                        if (charPresent) { isPresent = true; break; }
                    }
                }
            } else {
                const charName = char.coreKey;
                let charData = femaleChars[charName];
                if (!charData) {
                    const fuzzyKey = Object.keys(femaleChars).find(key => key.includes(charName) || charName.includes(key));
                    if (fuzzyKey) charData = femaleChars[fuzzyKey];
                }
                if (charData) {
                    let present = _.get(charData, '是否在场', false);
                    if (typeof present === 'string') {
                        const lower = present.toLowerCase();
                        present = (lower === 'true' || lower === 'yes' || lower === '1');
                    }
                    isPresent = present;
                }
            }
            
            if (isPresent) {
                if (!char.proEnabled && char.proUid) ops.push({ uid: char.proUid, enable: true });
                if (char.liteEnabled && char.liteUid) ops.push({ uid: char.liteUid, enable: false });
            } else {
                if (!char.liteEnabled && char.liteUid) ops.push({ uid: char.liteUid, enable: true });
                if (char.proEnabled && char.proUid) ops.push({ uid: char.proUid, enable: false });
            }
        });
        
        if (ops.length > 0) {
            console.log(`[WuWa Logic] 🏠 楼层0强制同步：${ops.length} 条更新`);
            await applyChanges(localData.pairs[0].bookName, ops, true);
        }
        return true; // 返回 true 表示已接管，无需继续常规扫描
    } catch(e) {
        console.error('[WuWa Logic] Floor zero scan error:', e);
        return false;
    }
}

// ==================== 全局心跳 (Master Loop) ====================
let masterLoopTimer = null;
let lastActiveStoryIds = '';

async function masterLoop() {
  if (!SWITCHER_STATE.autoMode) return;
  let data = currentData;
  if (!data.pairs || data.pairs.length === 0) {
      const scanRes = await scanAndPairEntries();
      if (scanRes.success) {
          currentData = { pairs: scanRes.pairs, stories: scanRes.stories, summaries: scanRes.summaries };
          data = currentData;
      } else return;
  }

  // 🔤 简繁清理：每轮心跳确保非当前模式的词条保持关闭
  const mode = SWITCHER_STATE.simpTradMode;
  const cleanupOps = [];
  data.pairs.forEach(p => {
    if (p.simpTrad === 'simp' && mode === 'trad') {
      if (p.proEnabled && p.proUid) cleanupOps.push({ uid: p.proUid, enable: false });
      if (p.liteEnabled && p.liteUid) cleanupOps.push({ uid: p.liteUid, enable: false });
    }
    if (p.simpTrad === 'trad' && mode === 'simp') {
      if (p.proEnabled && p.proUid) cleanupOps.push({ uid: p.proUid, enable: false });
      if (p.liteEnabled && p.liteUid) cleanupOps.push({ uid: p.liteUid, enable: false });
    }
  });
  if (cleanupOps.length > 0) {
    await applyChanges(data.pairs[0].bookName, cleanupOps, true);
    // 刷新 data 以反映清理后的状态
    const scanRes = await scanAndPairEntries();
    if (scanRes.success) {
      currentData = { pairs: scanRes.pairs, stories: scanRes.stories, summaries: scanRes.summaries };
      data = currentData;
    }
  }

  // 🔒 如果输入框不再包含开场指令，释放输入覆盖标记
  const $input = $('#send_textarea');
  const currentInput = $input.val();
  if (inputOverrideActive && (!currentInput || typeof currentInput !== 'string' || !currentInput.includes('[系统指令：生成开场剧情]'))) {
      inputOverrideActive = false;
      console.log('[WuWa Logic] 🔓 输入覆盖已释放，恢复变量上下文扫描');
  }

  // 优先级 1：飞讯终端强力接管（最高优先）
  const fxOverride = await logicScanFeixun(data);
  
   if (!fxOverride) {
      // 优先级 2：开场剧情指令扫描（5.互动角色 > 变量在场形态）
      // 当检测到 [系统指令：生成开场剧情] 且 5.互动角色 有内容时，
      // 强制按互动角色设定Pro，不受Pro上限约束，且变量在场变化不改变Pro
      const inputOverride = await logicScanInput(data);
      if (!inputOverride) {
          // 优先级 3：楼层0强制同步（最新楼层为0层时清空队列，仅开启在场角色Pro）
          const floorZeroOverride = await logicScanFloorZero(data);
          if (!floorZeroOverride) {
              // 优先级 4：常规在场状态扫描（含名额上限淘汰机制）
              await logicScanContext(data);
          }
      }
  }



  // 剧情和梗概的悬浮窗扫描逻辑 (含自动蓝灯)
  try {
      const scanText = await getFullContextVar();
      const displayText = await getStoryDisplayText();
      const _mode = SWITCHER_STATE.simpTradMode;
      const activeStories = data.stories.filter(s => s.enabled && matchSimpTradMode(s.simpTrad, _mode) && getStoryActivationState(s, scanText, displayText).active);
      const activeSummaries = data.summaries.filter(s => s.enabled && matchSimpTradMode(s.simpTrad, _mode) && getStoryActivationState(s, scanText, displayText).active);
      
      const currentActiveIds = [
          ...activeStories.map(s => s.uid),
          ...activeSummaries.map(s => s.uid)
      ].sort().join(',');
      
      if (currentActiveIds !== lastActiveStoryIds) {
          lastActiveStoryIds = currentActiveIds;
          refreshFloatingWindowContent();
          refreshUIIfOpen();
      }
  } catch (e) { console.error('Loop check failed', e); }
}

let floatProExpanded = false;

// ==================== UI & 悬浮窗 ====================

function createFloatingWindow() {
  $('#wb-float-monitor').remove();
  const sizeIcon = SWITCHER_STATE.floatSizeMode === 'large' ? '📏' : '📐';
  const sizeTitle = SWITCHER_STATE.floatSizeMode === 'large' ? '切换为小悬浮窗' : '切换为大悬浮窗 (1.5x)';

  // 🔤 大/小模式缩放因子（避免 zoom 导致拖拽坐标错乱）
  const sc = SWITCHER_STATE.floatSizeMode === 'large' ? 1.5 : 1;
  const floatW = Math.round(115 * sc);
  const floatFs = Math.round(10 * sc);
  const headPad = `${Math.round(3*sc)}px ${Math.round(4*sc)}px`;
  const autoFs = Math.round(11 * sc);
  const closeFs = Math.round(12 * sc);
  const listPad = Math.round(3 * sc);
  const listMaxH = Math.round(180 * sc);
  
  const html = `
    <div id='wb-float-monitor' style='position:fixed;top:${SWITCHER_STATE.floatPos.top};left:${SWITCHER_STATE.floatPos.left};width:${floatW}px;background:${SWITCHER_CONFIG.colors.floatBg};border:1px solid ${SWITCHER_CONFIG.colors.border};border-radius:6px;z-index:10001;display:${SWITCHER_STATE.floatVisible ? 'block' : 'none'};color:white;font-family:sans-serif;font-size:${floatFs}px;box-shadow:0 4px 10px rgba(0,0,0,0.5);overflow:hidden;user-select:none;cursor:move;touch-action:none;'>
      <div id='wb-float-header' style='background:rgba(0,0,0,0.5);padding:${headPad};font-weight:bold;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;'>
        <div style="display:flex;align-items:center;gap:5px;pointer-events:none;">
            <span>📡 实时监控</span>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
            <span id='wb-float-size-toggle' style='cursor:pointer;opacity:1;font-size:${autoFs}px;' title='${sizeTitle}'>${sizeIcon}</span>
            <span id='wb-float-close' style='cursor:pointer;opacity:0.8;font-size:${closeFs}px;' title='关闭'>✕</span>
        </div>
      </div>
      <div id='wb-float-list' style='padding:${listPad}px;max-height:${listMaxH}px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;'></div>
    </div>`;
  $('body').append(html);
  refreshFloatingWindowContent();
  
  const $floatWin = $('#wb-float-monitor');
  let isDragging = false;

  if (typeof $floatWin.draggable === 'function') {
      $floatWin.draggable({
          cancel: '#wb-float-size-toggle, #wb-float-close, .wb-float-toggle-expand',
          containment: 'window',
          start: function() { isDragging = true; },
          stop: function(event, ui) {
              SWITCHER_STATE.floatPos = { top: ui.position.top + 'px', left: ui.position.left + 'px' };
              saveSettings();
              setTimeout(() => { isDragging = false; }, 100);
          }
      });
  }

  $('#wb-float-size-toggle').on('click', function(e) {
      if (isDragging) return;
      e.stopPropagation(); e.preventDefault(); 
      SWITCHER_STATE.floatSizeMode = SWITCHER_STATE.floatSizeMode === 'large' ? 'small' : 'large';
      saveSettings();
      const isLarge = SWITCHER_STATE.floatSizeMode === 'large';
      $(this).text(isLarge ? '📏' : '📐');
      $(this).attr('title', isLarge ? '切换为小悬浮窗' : '切换为大悬浮窗 (1.5x)');
      createFloatingWindow();
      const sizeBtn = $('#wb-float-size');
      if(sizeBtn.length) {
          sizeBtn.css('background', isLarge ? '#e53e3e' : '#4a5568');
          sizeBtn.attr('title', isLarge ? '切换为小悬浮窗' : '切换为大悬浮窗 (1.5x)');
          sizeBtn.text(isLarge ? '📏' : '📐');
      }
      toastr.info(isLarge ? '悬浮窗已切换为大模式 (1.5x)' : '悬浮窗已切换为小模式');
      
  });

  $('#wb-float-close').on('click', function(e) {
      if (isDragging) return;
      e.stopPropagation(); e.preventDefault();
      SWITCHER_STATE.floatVisible = false;
      saveSettings();
      $('#wb-float-monitor').hide();
      $('#wb-toggle-float').text('👁️ 显示悬浮');
  });
}

// [MODIFIED] 悬浮窗显示逻辑优化
async function refreshFloatingWindowContent() {
  const res = await scanAndPairEntries();
  if (res.success) {
    currentData = { pairs: res.pairs, stories: res.stories, summaries: res.summaries };
    
    // 1. Pro 角色列表
    const proList = res.pairs.filter(p => p.proEnabled);
    
    // 2. 扫描激活项（含自动蓝灯）
    const scanText = await getFullContextVar();
    const displayText = await getStoryDisplayText();
    const _fmode = SWITCHER_STATE.simpTradMode;
    const activeStories = res.stories.filter(s => s.enabled && matchSimpTradMode(s.simpTrad, _fmode) && getStoryActivationState(s, scanText, displayText).active);
    const activeSummaries = res.summaries.filter(s => s.enabled && matchSimpTradMode(s.simpTrad, _fmode) && getStoryActivationState(s, scanText, displayText).active);

    const listEl = $('#wb-float-list').empty();
    
    // 🔤 缩放因子（与 createFloatingWindow 一致）
    const sc = SWITCHER_STATE.floatSizeMode === 'large' ? 1.5 : 1;
    const fs9 = Math.round(9 * sc);
    const fs8 = Math.round(8 * sc);
    const pad13 = `${Math.round(1*sc)}px ${Math.round(3*sc)}px`;
    
    // Pro 显示逻辑：默认显示4个，可展开显示最多8个
    if (proList.length > 0) {
        listEl.append(`<div style='font-size:${fs9}px;color:#718096;font-weight:bold;'>🟢 Pro(${proList.length})</div>`);
        const COLLAPSED_MAX = 4;
        const EXPANDED_MAX = 8;
        const maxShow = floatProExpanded ? EXPANDED_MAX : COLLAPSED_MAX;
        const showList = proList.slice(0, maxShow);
        showList.forEach(p => listEl.append(`<div style='padding:${pad13};background:rgba(72,187,120,0.2);border-radius:2px;color:#9ae6b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:1px;font-size:${fs9}px;'>${p.displayName}</div>`));
        
        if (proList.length > maxShow) {
            listEl.append(`<div style='padding:${pad13};color:#718096;font-size:${fs8}px;font-style:italic;'>+${proList.length - maxShow}</div>`);
        }
        
        if (proList.length > COLLAPSED_MAX) {
            const toggleText = floatProExpanded ? '收起 ▲' : '展开 ▼';
            listEl.append(`<div class='wb-float-toggle-expand' style='padding:${pad13};color:#63b3ed;font-size:${fs8}px;text-align:center;cursor:pointer;user-select:none;'>${toggleText}</div>`);
        }
    } else {
        listEl.append(`<div style='font-size:${fs9}px;color:#718096;text-align:center;padding:3px;'>无Pro</div>`);
    }

    // 剧情显示逻辑
    if (activeStories.length > 0) {
        listEl.append(`<div style='font-size:${fs9}px;color:#718096;font-weight:bold;margin-top:3px;'>✍️ 剧情(${activeStories.length})</div>`);
        activeStories.forEach(s => {
            const stState = getStoryActivationState(s, scanText, displayText);
            const color = stState.mode === 'manualBlue' ? '#63b3ed' : (stState.mode === 'autoBlue' ? '#4fd1e0' : '#ecc94b');
            const bg = stState.mode === 'manualBlue' ? 'rgba(99,179,237,0.2)' : (stState.mode === 'autoBlue' ? 'rgba(79,209,224,0.2)' : 'rgba(236,201,75,0.2)');
            const icon = stState.mode === 'manualBlue' ? '🔵' : (stState.mode === 'autoBlue' ? '🔷' : '⚡');
            listEl.append(`<div style='padding:${pad13};background:${bg};border-radius:2px;color:${color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:1px;font-size:${fs9}px;'>${icon}${s.name.replace('✍️','').trim()}</div>`);
        });
    }
    
    // 梗概显示逻辑
    if (activeSummaries.length > 0) {
        listEl.append(`<div style='font-size:${fs9}px;color:#718096;font-weight:bold;margin-top:3px;'>🎬 梗概(${activeSummaries.length})</div>`);
        activeSummaries.forEach(s => {
            const stState = getStoryActivationState(s, scanText, displayText);
            const color = stState.mode === 'manualBlue' ? '#63b3ed' : (stState.mode === 'autoBlue' ? '#4fd1e0' : '#d6bcfa');
            const bg = stState.mode === 'manualBlue' ? 'rgba(99,179,237,0.2)' : (stState.mode === 'autoBlue' ? 'rgba(79,209,224,0.2)' : 'rgba(159,122,234,0.2)');
            const icon = stState.mode === 'manualBlue' ? '🔵' : (stState.mode === 'autoBlue' ? '🔷' : '⚡');
            listEl.append(`<div style='padding:${pad13};background:${bg};border-radius:2px;color:${color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:1px;font-size:${fs9}px;'>${icon}${s.name.replace('🎬️','').trim()}</div>`);
        });
    }

    // Pro列表展开/收起按钮事件委托
    $('#wb-float-list').off('click.proexpand').on('click.proexpand', '.wb-float-toggle-expand', function(e) {
        e.stopPropagation();
        e.preventDefault();
        floatProExpanded = !floatProExpanded;
        refreshFloatingWindowContent();
    });

  }
}


function createSwitcherPanel() {
  $('#wb-switcher-panel').remove();
  // [修改] 精简按钮文案，应对手机屏幕
  const autoBtnText = SWITCHER_STATE.autoMode ? '🔄 自动: ON' : '🔄 自动: OFF';
  const autoBtnColor = SWITCHER_STATE.autoMode ? SWITCHER_CONFIG.colors.pro : SWITCHER_CONFIG.colors.inactive;

  const html = `
    <div id='wb-switcher-panel' style='position:fixed;top:5%;left:50%;transform:translateX(-50%);width:400px;max-width:90vw;max-height:90vh;background:${SWITCHER_CONFIG.colors.bg};border:1px solid ${SWITCHER_CONFIG.colors.border};border-radius:10px;z-index:9999;display:flex;flex-direction:column;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-family:sans-serif;color:#e2e8f0;'>
      <div style='padding:15px;border-bottom:1px solid ${SWITCHER_CONFIG.colors.border};display:flex;justify-content:space-between;align-items:center;'>
        <h3 style='margin:0;font-size:16px;font-weight:bold;'>WuWa 世界书控制</h3>
        <div style='display:flex;align-items:center;gap:8px;'>
          <button id='wb-simp-trad-toggle' style='background:rgba(159,122,234,0.3);color:#d6bcfa;border:1px solid #9f7aea;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;white-space:nowrap;'>${SWITCHER_STATE.simpTradMode === 'simp' ? '🌙赛博：简' : '🌙電馭：繁'}</button>
          <button id='wb-switcher-close' style='background:transparent;border:none;color:#a0aec0;cursor:pointer;font-size:18px;'>✕</button>
        </div>
      </div>
      <div style='display:flex;border-bottom:1px solid ${SWITCHER_CONFIG.colors.border};'>
        <button id='wb-tab-chars' style='flex:1;padding:10px;background:${SWITCHER_CONFIG.colors.tabActive};color:white;border:none;cursor:pointer;font-weight:bold;'>👥 角色版本</button>
        <button id='wb-tab-stories' style='flex:1;padding:10px;background:${SWITCHER_CONFIG.colors.tabInactive};color:#a0aec0;border:none;cursor:pointer;font-weight:bold;'>✍️ 剧情控制</button>
        <button id='wb-tab-summaries' style='flex:1;padding:10px;background:${SWITCHER_CONFIG.colors.tabInactive};color:#a0aec0;border:none;cursor:pointer;font-weight:bold;'>🎬 梗概控制</button>
      </div>
      <div style='padding:10px 15px;background:rgba(0,0,0,0.2);display:flex;flex-direction:column;gap:10px;'>
        <div style='display:flex;gap:5px;flex-wrap:nowrap;white-space:nowrap;overflow:hidden;'>
           <button id='wb-toggle-auto' style='flex:1;min-width:0;background:${autoBtnColor};color:white;border:none;padding:clamp(2px,1vw,5px);border-radius:4px;cursor:pointer;font-size:clamp(9px,2.5vw,12px);'>${autoBtnText}</button>
           <button id='wb-toggle-float' style='flex:1;min-width:0;background:#4a5568;color:white;border:none;padding:clamp(2px,1vw,5px);border-radius:4px;cursor:pointer;font-size:clamp(9px,2.5vw,12px);'>${SWITCHER_STATE.floatVisible ? '👁️ 隐藏' : '👁️ 悬浮'}</button>
           <button id='wb-float-size' style='flex:0.5;min-width:0;background:${SWITCHER_STATE.floatSizeMode === 'large' ? '#e53e3e' : '#4a5568'};color:white;border:none;padding:clamp(2px,1vw,5px);border-radius:4px;cursor:pointer;font-size:clamp(9px,2.5vw,12px);' title='${SWITCHER_STATE.floatSizeMode === 'large' ? '切换为小悬浮窗' : '切换为大悬浮窗 (1.5x)'}'>${SWITCHER_STATE.floatSizeMode === 'large' ? '📏' : '📐'}</button>
           <button id='wb-settings-btn' style='flex:0.3;min-width:0;background:#4a5568;color:white;border:none;padding:clamp(2px,1vw,5px);border-radius:4px;cursor:pointer;font-size:clamp(9px,2.5vw,12px);' title='设置 Pro 数量上限'>⚙️</button>
           <button id='wb-info-btn' style='flex:0.3;min-width:0;background:#4a5568;color:white;border:none;padding:clamp(2px,1vw,5px);border-radius:4px;cursor:pointer;font-size:clamp(9px,2.5vw,12px);' title='逻辑说明'>ℹ️</button>
        </div>
        <div id='wb-current-book-display' style='font-size:12px;color:#63b3ed;text-align:center;'>正在检测...</div>
        <input type='text' id='wb-switcher-search' placeholder='🔍 搜索...' style='width:100%;padding:8px;border-radius:5px;border:1px solid ${SWITCHER_CONFIG.colors.border};background:#2d3748;color:white;'>
        <div id='wb-global-btns' style='display:flex;gap:10px;'></div>
        <div id='wb-virgin-btns' style='display:flex;gap:10px;'></div>
      </div>
      <div id='wb-switcher-list' style='flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:5px;'><div style='text-align:center;color:#718096;padding:20px;'>加载中...</div></div>
      <div style='padding:8px;text-align:center;font-size:12px;color:#718096;border-top:1px solid ${SWITCHER_CONFIG.colors.border};'>点击按钮切换 • 自动保存</div>
    </div>`;
  
  $('body').append(html);
  $('#wb-switcher-close').on('click', () => $('#wb-switcher-panel').remove());

  // 🔤 简繁切换按钮
  $('#wb-simp-trad-toggle').on('click', async function() {
    const currentMode = SWITCHER_STATE.simpTradMode;
    const newMode = currentMode === 'simp' ? 'trad' : 'simp';
    const newLabel = newMode === 'simp' ? '🌙赛博：简' : '🌙電馭：繁';

    // 确认弹窗（允许取消）
    if (!confirm('⚠️ Cyberpunk 2077 官方简中/繁中翻译差异较大\n\n' +
          '简体模式：使用赛博朋克官方简体中文译名\n\n' +
          '繁体模式：使用電馭叛客官方繁體中文譯名\n\n' +
          '繁体模式下会同时启用游戏术语纠正提示词。\n\n' +
          `确定要切换至 ${newMode === 'simp' ? '简体模式' : '繁体模式'} 吗？`)) {
        return; // 用户取消，不执行切换
    }

    SWITCHER_STATE.simpTradMode = newMode;
    saveSettings();
    $(this).text(newLabel);

    // 执行简繁词条批量切换
    await executeSimpTradSwitch(newMode);

    // 重新渲染面板
    setTimeout(() => loadDataAndRender(), 500);
  });

  $('#wb-switcher-search').on('input', function() {
    const val = $(this).val().toLowerCase();
    $('.wb-item-row').each(function() { $(this).toggle($(this).data('name').toString().toLowerCase().includes(val)); });
  });
  $('#wb-tab-chars').on('click', () => switchTab('chars'));
  $('#wb-tab-stories').on('click', () => switchTab('stories'));
  $('#wb-tab-summaries').on('click', () => switchTab('summaries'));
  
  $('#wb-toggle-float').on('click', function() {
    SWITCHER_STATE.floatVisible = !SWITCHER_STATE.floatVisible; saveSettings();
    $('#wb-float-monitor').toggle(SWITCHER_STATE.floatVisible); 
    $(this).text(SWITCHER_STATE.floatVisible ? '👁️ 隐藏' : '👁️ 悬浮'); // [修改] 对应精简文本
  });

  $('#wb-float-size').on('click', function() {
    SWITCHER_STATE.floatSizeMode = SWITCHER_STATE.floatSizeMode === 'large' ? 'small' : 'large';
    saveSettings();
    const isLarge = SWITCHER_STATE.floatSizeMode === 'large';
    // 重新创建悬浮窗以应用新的缩放
    createFloatingWindow();
    // 更新按钮样式和文字
    $(this).css('background', isLarge ? '#e53e3e' : '#4a5568');
    $(this).attr('title', isLarge ? '切换为小悬浮窗' : '切换为大悬浮窗 (1.5x)');
    $(this).text(isLarge ? '📏' : '📐');
    toastr.info(isLarge ? '悬浮窗已切换为大模式 (1.5x)' : '悬浮窗已切换为小模式');
  });

  $('#wb-toggle-auto').on('click', function() {
    SWITCHER_STATE.floatSizeMode = SWITCHER_STATE.floatSizeMode === 'large' ? 'small' : 'large'; saveSettings();
    $(this).text(SWITCHER_STATE.autoMode ? '🔄 自动: ON' : '🔄 自动: OFF'); // [修改] 对应精简文本
    $(this).css('background', SWITCHER_STATE.autoMode ? SWITCHER_CONFIG.colors.pro : SWITCHER_CONFIG.colors.inactive);
    
    const floatBtn = $('#wb-float-auto-toggle');
    if(floatBtn.length) {
        floatBtn.text(SWITCHER_STATE.autoMode ? '🔄' : '⏸️');
        floatBtn.attr('title', SWITCHER_STATE.autoMode ? '自动模式: ON' : '自动模式: OFF');
    }

    if (SWITCHER_STATE.autoMode) { toastr.info('自动模式已开启'); masterLoop(); }
  });

  $('#wb-settings-btn').on('click', async function() {
      let currentMax = 3;
      try {
          const globals = await getVariables({ type: 'global' });
          if (globals && globals.wuwa_max_pro_count !== undefined) {
              currentMax = parseInt(globals.wuwa_max_pro_count, 10);
          }
      } catch(e) {}

      const input = prompt('⚙️ 请输入同时存在的最大 Pro 词条数量:\n(注意：⭐永久Pro不占名额；该上限仅对"环境在场"扫描生效，不会拦截飞讯和指令。)', currentMax);

      if (input !== null) {
          const parsed = parseInt(input, 10);
          if (!isNaN(parsed) && parsed >= 0) {
              try {
                  await insertOrAssignVariables({ wuwa_max_pro_count: parsed }, { type: 'global' });
                  toastr.success(`已保存最大 Pro 词条数量为: ${parsed}`);
                  if (SWITCHER_STATE.autoMode) masterLoop();
              } catch(e) {
                  toastr.error('保存配置失败: ' + e.message);
              }
          } else {
              toastr.warning('请输入有效的数字');
          }
      }
  });

  const TUTORIAL_TEXT = 
    '🌊 欢迎使用 WuWa 世界书控制！\n\n' +
    '📖 Pro 是什么？\n' +
    '→ 细节更多的世界书词条，角色描写更丰富，但占用 Token 更多。\n' +
    '→ 适合常驻在剧情中的主要角色。\n\n' +
    '📄 Lite 是什么？\n' +
    '→ 细节更少的精简词条，只保留基本人设，占用 Token 较少。\n' +
    '→ 适合短暂登场、只被提及的次要角色。\n\n' +
    '🤖 自动模式做什么？\n' +
    '→ 自动把「在场的角色」「飞讯聊天的角色」「开场互动角色」开启 Pro。\n' +
    '→ 同时只能有 3 个 Pro（默认），超出名额的角色会自动切回 Lite。\n' +
    '→ 点击 ⚙️ 设置图标可以修改上限。\n\n' +
    '⭐ 永久 Pro（五角星按钮）\n' +
    '→ 点击 ⭐ 后该角色永远保持 Pro，不占用名额，永远不会被自动关闭。\n\n' +
    '🔧 手动操作\n' +
    '→ 点击 Pro / Lite 按钮可以手动切换角色状态。\n' +
    '→ 已达上限时无法手动开 Pro，需要先把别的角色切回 Lite。';

  const DETAIL_TEXT =
    '\n\n━━━━ 📡 详细优先级说明 ━━━━\n\n' +
    '🥇 飞讯终端监控（最高优先）\n' +
    '读取"飞讯"发送消息者，匹配的角色强制开启 Pro，不影响队列。\n\n' +
    '🥈 开场指令扫描（次高优先）\n' +
    '检测输入框含 [系统指令：生成开场剧情] 时，读取"互动角色"强制开启 Pro。\n' +
    '触发开场指令时会清空手动Pro队列。\n\n' +
    '🥉 环境在场扫描（普通优先）\n' +
    '读取变量中的"是否在场"状态，采用惰性淘汰队列：\n' +
    '• 角色离场时保持 Pro 不关（粘性保留）\n' +
    '• 在场人数超过上限时，优先淘汰不在场的角色\n' +
    '• 仍不够时按好感度从低到高淘汰在场的自动 Pro 角色\n\n' +
    '🔒 手动 Pro：点击 Pro 按钮强制开启，优先于自动分配，占用名额\n' +
    '⭐ 永久 Pro：点击 ⭐ 按钮强制永久开启，不占名额，永不关闭\n' +
    '⚠️ 已达上限时禁止手动切换 Pro，请先释放名额或修改上限';

  // 首次打开：弹出新手教程
  const TUTORIAL_KEY = 'wuwa_wb_v4_0_tutorial_seen';
  if (!localStorage.getItem(TUTORIAL_KEY)) {
      setTimeout(() => {
          alert(TUTORIAL_TEXT);
          localStorage.setItem(TUTORIAL_KEY, '1');
      }, 500);
  }

  // ℹ️ 按钮：先显示教程，再显示详细原理
  $('#wb-info-btn').on('click', function() {
      alert(TUTORIAL_TEXT + DETAIL_TEXT);
  });

  loadDataAndRender();
}

let currentData = { pairs: [], stories: [], summaries: [] }, currentView = 'chars'; 
async function loadDataAndRender() {
  const result = await scanAndPairEntries();
  $('#wb-current-book-display').text(result.bookName ? `当前绑定世界书: ${result.bookName}` : '⚠️ 未检测到绑定的世界书').css('color', result.bookName ? '#63b3ed' : '#fc8181');
  if (result.success) { currentData = { pairs: result.pairs, stories: result.stories, summaries: result.summaries }; switchTab(currentView); }
  else $('#wb-switcher-list').html(`<div style='text-align:center;color:#fc8181;padding:20px;'>${result.message}</div>`);
}
function refreshUIIfOpen() { if ($('#wb-switcher-panel').is(':visible')) loadDataAndRender(); }

async function switchTab(view) {
  currentView = view;
  const active = { background: SWITCHER_CONFIG.colors.tabActive, color: 'white' };
  const inactive = { background: SWITCHER_CONFIG.colors.tabInactive, color: '#a0aec0' };
  
  $('#wb-tab-chars').css(view==='chars'?active:inactive); 
  $('#wb-tab-stories').css(view==='stories'?active:inactive);
  $('#wb-tab-summaries').css(view==='summaries'?active:inactive);

  if(view==='chars') { 
      $('#wb-virgin-btns').show();
      renderGlobalButtonsChars(); 
      renderListChars(); 
  } else if(view==='stories') { 
      $('#wb-virgin-btns').hide();
      renderGlobalButtonsStories(); 
      await renderListStories(); 
  } else { // summaries
      $('#wb-virgin-btns').hide();
      renderGlobalButtonsSummaries();
      await renderListSummaries();
  }
}

function checkAutoLock() {
  // [修改] 自动模式下允许角色级别的Pro/Lite/⭐手动操作
  // 此函数仅用于拦截"全部Pro"/"全部Lite"等全局破坏性操作
  if (SWITCHER_STATE.autoMode) {
    toastr.warning('⚠️ 自动模式下禁止全局批量操作，请使用角色单独按钮');
    return false;
  }
  return true;
}


function renderGlobalButtonsChars() {
  $('#wb-global-btns').html(`
    <button id='wb-global-pro' style='flex:1;background:${SWITCHER_CONFIG.colors.pro};color:white;border:none;padding:5px;border-radius:4px;cursor:pointer;font-weight:bold;opacity:0.9;font-size:12px;'>🚀 全部 Pro</button>
    <button id='wb-global-lite' style='flex:1;background:${SWITCHER_CONFIG.colors.lite};color:white;border:none;padding:5px;border-radius:4px;cursor:pointer;font-weight:bold;opacity:0.9;font-size:12px;'>🍃 全部 Lite</button>`);
  
  // 🔤 过滤：全局按钮仅影响当前简繁模式下可见的词条
  function getVisiblePairs() {
    const mode = SWITCHER_STATE.simpTradMode;
    return currentData.pairs.filter(p => {
      if (p.simpTrad === 'simp' && mode === 'trad') return false;
      if (p.simpTrad === 'trad' && mode === 'simp') return false;
      return true;
    });
  }

  $('#wb-global-pro').on('click', async () => {
    if(!checkAutoLock()) return;
    const visible = getVisiblePairs();
    if(!visible.length) return toastr.warning('当前模式下没有可操作的角色词条');
    const ops=[]; visible.forEach(i=>{if(i.proUid)ops.push({uid:i.proUid,enable:true});if(i.liteUid)ops.push({uid:i.liteUid,enable:false});}); await applyChanges(visible[0].bookName, ops); toastr.success('全部 Pro 模式'); loadDataAndRender(); 
  });
  $('#wb-global-lite').on('click', async () => {
    if(!checkAutoLock()) return;
    const visible = getVisiblePairs();
    if(!visible.length) return toastr.warning('当前模式下没有可操作的角色词条');
    const ops=[]; visible.forEach(i=>{if(i.liteUid)ops.push({uid:i.liteUid,enable:true});if(i.proUid)ops.push({uid:i.proUid,enable:false});}); await applyChanges(visible[0].bookName, ops); toastr.success('全部 Lite 模式'); loadDataAndRender(); 
  });

  $('#wb-virgin-btns').html(`
    <button id='wb-global-virgin' style='flex:1;background:${SWITCHER_CONFIG.colors.virgin};color:white;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;font-weight:bold;opacity:0.9;font-size:11px;'>🌸 全员处女</button>
    <button id='wb-global-nonvirgin' style='flex:1;background:${SWITCHER_CONFIG.colors.nonVirgin};color:white;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;font-weight:bold;opacity:0.9;font-size:11px;'>👠 全员非处女</button>
  `);


  $('#wb-global-virgin').on('click', async () => {
      if(!currentData.pairs.length) return;
      const modifiable = currentData.pairs.filter(p => p.virginModifiable);
      if(modifiable.length === 0) return toastr.warning('未找到包含“处女”设定的角色');
      await applyVirginUpdate(currentData.pairs[0].bookName, modifiable, true);
  });

  $('#wb-global-nonvirgin').on('click', async () => {
      if(!currentData.pairs.length) return;
      const modifiable = currentData.pairs.filter(p => p.virginModifiable);
      if(modifiable.length === 0) return toastr.warning('未找到包含“处女”设定的角色');
      await applyVirginUpdate(currentData.pairs[0].bookName, modifiable, false);
  });
}

function renderListChars() {
  const list = $('#wb-switcher-list').empty();
  if (currentData.pairs.length === 0) return list.html(`<div style='text-align:center;color:#718096;padding:20px;'>未找到 [Pro]/[Lite] 角色</div>`);
  
  // 🔤 简繁过滤：仅显示当前模式下的词条（无标记词条始终显示）
  const mode = SWITCHER_STATE.simpTradMode;
  const visiblePairs = currentData.pairs.filter(p => {
    if (p.simpTrad === 'simp' && mode === 'trad') return false;
    if (p.simpTrad === 'trad' && mode === 'simp') return false;
    return true;
  });

  visiblePairs.forEach((item, idx) => {
    const isPro = item.proEnabled && !item.liteEnabled; const isLite = !item.proEnabled && item.liteEnabled;
    let virginBtnHtml = '';
    if (item.virginModifiable) {
        const vColor = item.isVirgin ? SWITCHER_CONFIG.colors.virgin : SWITCHER_CONFIG.colors.nonVirgin;
        const vText = item.isVirgin ? '🌸 处女' : '👠 非处女';
        virginBtnHtml = `<button class='wb-btn-virgin' data-idx='${idx}' style='background:${vColor};color:white;border:none;padding:5px 8px;border-radius:3px;cursor:pointer;font-size:11px;margin-right:5px;min-width:60px;font-weight:bold;'>${vText}</button>`;
    }

    // [新增] 动态生成置顶星标图标
    const pinIcon = item.isPinned ? '⭐' : '☆';
    const pinColor = item.isPinned ? '#ecc94b' : '#718096';

    // [修改] 左侧盒子布局，包裹星标与名字
    list.append(`<div class='wb-item-row' data-name='${item.displayName}' style='display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,255,255,0.05);border-radius:6px;border-left:3px solid transparent;'>
      <div style='display:flex;align-items:center;flex:1;overflow:hidden;margin-right:10px;'><span class='wb-btn-pin' data-core='${item.coreKey}' style='cursor:pointer;color:${pinColor};margin-right:4px;font-size:14px;user-select:none;flex-shrink:0;' title='⭐永久Pro（不占名额，永不关闭）'>${pinIcon}</span><div style='font-weight:bold;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${item.displayName}</div></div>
      <div style='display:flex;align-items:center;'>
        ${virginBtnHtml}
        <div style='display:flex;gap:2px;background:#2d3748;padding:2px;border-radius:4px;'>
          <button class='wb-btn-pro' data-idx='${idx}' ${!item.proUid?'disabled':''} style='background:${isPro?SWITCHER_CONFIG.colors.pro:'transparent'};color:${isPro?'white':'#a0aec0'};border:none;padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px;transition:0.2s;'>Pro</button>
          <button class='wb-btn-lite' data-idx='${idx}' ${!item.liteUid?'disabled':''} style='background:${isLite?SWITCHER_CONFIG.colors.lite:'transparent'};color:${isLite?'white':'#a0aec0'};border:none;padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px;transition:0.2s;'>Lite</button>
        </div>
      </div></div>`);

  });
  
  // [新增] 绑定置顶图标的点击事件
  $('.wb-btn-pin').on('click', function(e) {
      e.stopPropagation();
      const coreKey = $(this).data('core');
      togglePinStatus(coreKey);
  });

   $('.wb-btn-pro').on('click', async function() {
    const i=visiblePairs[$(this).data('idx')];
    if (i.isPinned) return; // ⭐永久Pro角色禁止手动切换
    
    // 自动模式下：检查Pro名额上限，并加入手动Pro队列
    if (SWITCHER_STATE.autoMode) {
        // 如果已经是Pro，直接切换为Lite（降级操作，不受上限限制）
        if (i.proEnabled && !i.liteEnabled) {
            // 已经是Pro，执行降级为Lite
            let manualProChars = [];
            let tempLiteChars = [];
            try {
                const globals = await getVariables({ type: 'global' });
                if (globals && Array.isArray(globals.wuwa_manual_pro_chars)) {
                    manualProChars = globals.wuwa_manual_pro_chars;
                }
                if (globals && Array.isArray(globals.wuwa_temp_lite_chars)) {
                    tempLiteChars = globals.wuwa_temp_lite_chars;
                }
            } catch(e) {}
            const mIdx = manualProChars.indexOf(i.coreKey);
            if (mIdx > -1) {
                manualProChars.splice(mIdx, 1);
            }
            // 加入暂时Lite名单，防止自动扫描立即恢复Pro
            if (!tempLiteChars.includes(i.coreKey)) {
                tempLiteChars.push(i.coreKey);
            }
            await updateVariablesWith(v => { _.set(v, 'wuwa_manual_pro_chars', manualProChars); _.set(v, 'wuwa_temp_lite_chars', tempLiteChars); return v; }, { type: 'global' });
            await applyChanges(i.bookName, [{uid:i.liteUid,enable:true}, i.proUid?{uid:i.proUid,enable:false}:null].filter(Boolean)); 
            $(this).closest('.wb-item-row').find('.wb-btn-pro').css({background:'transparent',color:'#a0aec0'}); 
            $(this).closest('.wb-item-row').find('.wb-btn-lite').css({background:SWITCHER_CONFIG.colors.lite,color:'white'});
            if (SWITCHER_STATE.autoMode) masterLoop();
            return;
        }
        
        // 计算当前非永久Pro的数量
        let nonPinnedProCount = 0;
        visiblePairs.forEach(p => {
            if (p.proEnabled && !p.isPinned) nonPinnedProCount++;
        });

        
        let maxProCount = 3;
        let manualProChars = [];
        let tempLiteChars = [];
        try {
            const globals = await getVariables({ type: 'global' });
            if (globals && globals.wuwa_max_pro_count !== undefined) {
                maxProCount = parseInt(globals.wuwa_max_pro_count, 10);
            }
            if (globals && Array.isArray(globals.wuwa_manual_pro_chars)) {
                manualProChars = globals.wuwa_manual_pro_chars;
            }
            if (globals && Array.isArray(globals.wuwa_temp_lite_chars)) {
                tempLiteChars = globals.wuwa_temp_lite_chars;
            }
        } catch(e) {}
        
        // 如果已达上限，禁止切换为Pro
        if (nonPinnedProCount >= maxProCount) {
            toastr.warning(`⚠️ 已达到Pro上限(${maxProCount}个)，请先将其他角色切换为Lite，或修改设置中的最大上限`);
            return;
        }
        
        // 加入手动Pro队列（LIFO：插入头部，优先级最高）
        if (!manualProChars.includes(i.coreKey)) {
            manualProChars.unshift(i.coreKey);
        }
        // 从暂时Lite名单中移除（手动开Pro意味着取消暂时Lite锁定）
        const tIdx = tempLiteChars.indexOf(i.coreKey);
        if (tIdx > -1) {
            tempLiteChars.splice(tIdx, 1);
        }
        await updateVariablesWith(v => { _.set(v, 'wuwa_manual_pro_chars', manualProChars); _.set(v, 'wuwa_temp_lite_chars', tempLiteChars); return v; }, { type: 'global' });
    }
    
    await applyChanges(i.bookName, [{uid:i.proUid,enable:true}, i.liteUid?{uid:i.liteUid,enable:false}:null].filter(Boolean)); 
    $(this).closest('.wb-item-row').find('.wb-btn-pro').css({background:SWITCHER_CONFIG.colors.pro,color:'white'}); 
    $(this).closest('.wb-item-row').find('.wb-btn-lite').css({background:'transparent',color:'#a0aec0'});

    // 🔤 超限淘汰：Pro开启后若超出上限，立即运行一次淘汰
    if (SWITCHER_STATE.autoMode) {
      const rescan = await scanAndPairEntries();
      if (rescan.success) {
        const nonPinnedPros = rescan.pairs.filter(p => p.proEnabled && !p.isPinned);
        let maxPC = 3;
        try {
          const gb = await getVariables({ type: 'global' });
          if (gb && gb.wuwa_max_pro_count !== undefined) maxPC = parseInt(gb.wuwa_max_pro_count, 10);
        } catch(e) {}
        if (nonPinnedPros.length > maxPC) {
          console.log(`[WuWa Logic] ⚠️ 检测到Pro超限(${nonPinnedPros.length}/${maxPC})，触发淘汰...`);
          await logicScanContext({ pairs: rescan.pairs, stories: rescan.stories, summaries: rescan.summaries });
        }
      }
      masterLoop();
      loadDataAndRender();
    }
  });


  
$('.wb-btn-lite').on('click', async function() {
    const i=visiblePairs[$(this).data('idx')];
    if (i.isPinned) return; // ⭐永久Pro角色禁止手动切换
    
    // 自动模式下：从手动Pro队列中移除，并加入暂时Lite名单
    if (SWITCHER_STATE.autoMode) {
        let manualProChars = [];
        let tempLiteChars = [];
        try {
            const globals = await getVariables({ type: 'global' });
            if (globals && Array.isArray(globals.wuwa_manual_pro_chars)) {
                manualProChars = globals.wuwa_manual_pro_chars;
            }
            if (globals && Array.isArray(globals.wuwa_temp_lite_chars)) {
                tempLiteChars = globals.wuwa_temp_lite_chars;
            }
        } catch(e) {}
        const mIdx = manualProChars.indexOf(i.coreKey);
        if (mIdx > -1) {
            manualProChars.splice(mIdx, 1);
        }
        // 手动切换为 Lite 时，无条件加入暂时 Lite 名单（无论当前是否为 Pro），防止后续自动扫描将其升为 Pro
        if (!tempLiteChars.includes(i.coreKey)) {
            tempLiteChars.push(i.coreKey);
        }
        await updateVariablesWith(v => { _.set(v, 'wuwa_manual_pro_chars', manualProChars); _.set(v, 'wuwa_temp_lite_chars', tempLiteChars); return v; }, { type: 'global' });
    }
    
    await applyChanges(i.bookName, [{uid:i.liteUid,enable:true}, i.proUid?{uid:i.proUid,enable:false}:null].filter(Boolean)); 
    $(this).closest('.wb-item-row').find('.wb-btn-pro').css({background:'transparent',color:'#a0aec0'}); 
    $(this).closest('.wb-item-row').find('.wb-btn-lite').css({background:SWITCHER_CONFIG.colors.lite,color:'white'}); 
    if (SWITCHER_STATE.autoMode) masterLoop();
});


  $('.wb-btn-virgin').on('click', async function() {
      const i = visiblePairs[$(this).data('idx')];
      const targetState = !i.isVirgin;
      await applyVirginUpdate(i.bookName, [i], targetState);
  });
}

function renderGlobalButtonsStories() {
  $('#wb-global-btns').html(`
    <button id='wb-story-all-on' style='flex:1;background:${SWITCHER_CONFIG.colors.storyOn};color:white;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;opacity:0.9;'>✍️ 全部开启</button>
    <button id='wb-story-all-off' style='flex:1;background:${SWITCHER_CONFIG.colors.inactive};color:white;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;opacity:0.9;'>⛔ 全部关闭</button>`);
  const _allSMode = SWITCHER_STATE.simpTradMode;
  const _allSVisible = currentData.stories.filter(s => matchSimpTradMode(s.simpTrad, _allSMode));
  $('#wb-story-all-on').on('click', async () => { if(!_allSVisible.length)return; await applyChanges(_allSVisible[0].bookName, _allSVisible.map(s=>({uid:s.uid,enable:true}))); toastr.success('已开启当前模式所有剧情'); loadDataAndRender(); });
  $('#wb-story-all-off').on('click', async () => { if(!_allSVisible.length)return; await applyChanges(_allSVisible[0].bookName, _allSVisible.map(s=>({uid:s.uid,enable:false}))); toastr.success('已关闭当前模式所有剧情'); loadDataAndRender(); });
}

function renderGlobalButtonsSummaries() {
  $('#wb-global-btns').html(`
    <button id='wb-summary-all-on' style='flex:1;background:${SWITCHER_CONFIG.colors.summaryOn};color:white;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;opacity:0.9;'>🎬 全部开启</button>
    <button id='wb-summary-all-off' style='flex:1;background:${SWITCHER_CONFIG.colors.inactive};color:white;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;opacity:0.9;'>⛔ 全部关闭</button>`);
  const _allSumMode = SWITCHER_STATE.simpTradMode;
  const _allSumVisible = currentData.summaries.filter(s => matchSimpTradMode(s.simpTrad, _allSumMode));
  $('#wb-summary-all-on').on('click', async () => { if(!_allSumVisible.length)return; await applyChanges(_allSumVisible[0].bookName, _allSumVisible.map(s=>({uid:s.uid,enable:true}))); toastr.success('已开启当前模式所有梗概'); loadDataAndRender(); });
  $('#wb-summary-all-off').on('click', async () => { if(!_allSumVisible.length)return; await applyChanges(_allSumVisible[0].bookName, _allSumVisible.map(s=>({uid:s.uid,enable:false}))); toastr.success('已关闭当前模式所有梗概'); loadDataAndRender(); });
}

async function renderListStories() {
  const list = $('#wb-switcher-list').empty();
  const _smode = SWITCHER_STATE.simpTradMode;
  const visibleStories = currentData.stories.filter(s => matchSimpTradMode(s.simpTrad, _smode));
  if (visibleStories.length === 0) return list.html(`<div style='text-align:center;color:#718096;padding:20px;'>未找到当前模式下的剧情条目(需包含✍️)</div>`);
  
  const scanText = await getFullContextVar();
  const displayText = await getStoryDisplayText();

  visibleStories.forEach((item, idx) => {
    const type = item.strategy?.type || 'selective';
    const stState = getStoryActivationState(item, scanText, displayText);
    const isActive = stState.active;
    // 策略按钮：手动蓝灯=🔵常驻，自动蓝灯=🔷自动，绿灯=🟢触
    const strategyBtnText = stState.mode === 'manualBlue' ? '🔵常驻' : (stState.mode === 'autoBlue' ? '🔷自动' : '🟢触');
    const strategyBtnColor = stState.mode === 'manualBlue' ? 'rgba(66,153,225,0.2)' : (stState.mode === 'autoBlue' ? 'rgba(79,209,224,0.2)' : 'rgba(72,187,120,0.2)');
    const strategyBtnTextColor = stState.mode === 'manualBlue' ? '#63b3ed' : (stState.mode === 'autoBlue' ? '#4fd1e0' : '#9ae6b4');
    const activeIcon = stState.mode === 'manualBlue' ? '🔵 ' : (stState.mode === 'autoBlue' ? '🔷 ' : '⚡️ ');
    
    let displayName = item.name.replace('✍️','').trim();
    let nameStyle = 'font-weight:bold;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:10px;';
    
    if (!item.enabled) {
        nameStyle += 'color:#718096;'; 
    } else if (isActive) {
        displayName = activeIcon + displayName;
        nameStyle += 'color:white;'; 
    } else {
        nameStyle += 'color:#a0aec0;opacity:0.6;'; 
    }

    list.append(`<div class='wb-item-row' data-name='${item.name}' style='display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,255,255,0.05);border-radius:6px;border-left:3px solid transparent;'>
      <div style='${nameStyle}'>${displayName}</div>
      <div style='display:flex;align-items:center;gap:5px;'>
        <button class='wb-btn-story-strategy' data-uid='${item.uid}' style='background:${strategyBtnColor};color:${strategyBtnTextColor};border:1px solid ${strategyBtnTextColor};padding:4px 8px;border-radius:3px;cursor:pointer;font-size:11px;transition:0.2s;'>${strategyBtnText}</button>
        <button class='wb-btn-story-toggle' data-uid='${item.uid}' style='width:50px;background:${item.enabled?SWITCHER_CONFIG.colors.storyOn:SWITCHER_CONFIG.colors.inactive};color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:12px;transition:0.2s;'>${item.enabled?'ON':'OFF'}</button>
      </div></div>`);
  });
  
  $('.wb-btn-story-toggle').on('click', async function() { 
      const uid = $(this).data('uid'); 
      const i = currentData.stories.find(s => s.uid === uid); 
      if (!i) return; 
      const s=!i.enabled; 
      await applyChanges(i.bookName, [{uid:i.uid,enable:s}]); 
      i.enabled=s; 
      $(this).css('background',s?SWITCHER_CONFIG.colors.storyOn:SWITCHER_CONFIG.colors.inactive).text(s?'ON':'OFF'); 
  });

  $('.wb-btn-story-strategy').on('click', async function() {
      const uid = $(this).data('uid');
      const i = currentData.stories.find(s => s.uid === uid);
      if (!i) return;
      await toggleStrategy(i.bookName, i.uid);
  });
}

// [NEW] 梗概列表渲染 (复制自 Story 逻辑)
async function renderListSummaries() {
    const list = $('#wb-switcher-list').empty();
    const _smode2 = SWITCHER_STATE.simpTradMode;
    const visibleSummaries = currentData.summaries.filter(s => matchSimpTradMode(s.simpTrad, _smode2));
    if (visibleSummaries.length === 0) return list.html(`<div style='text-align:center;color:#718096;padding:20px;'>未找到当前模式下的梗概条目(需包含🎬️)</div>`);
    
    const scanText = await getFullContextVar();
    const displayText = await getStoryDisplayText();
  
    visibleSummaries.forEach((item, idx) => {
      const type = item.strategy?.type || 'selective';
      const stState = getStoryActivationState(item, scanText, displayText);
      const isActive = stState.active;
      const strategyBtnText = stState.mode === 'manualBlue' ? '🔵常驻' : (stState.mode === 'autoBlue' ? '🔷自动' : '🟢触');
      const strategyBtnColor = stState.mode === 'manualBlue' ? 'rgba(66,153,225,0.2)' : (stState.mode === 'autoBlue' ? 'rgba(79,209,224,0.2)' : 'rgba(72,187,120,0.2)');
      const strategyBtnTextColor = stState.mode === 'manualBlue' ? '#63b3ed' : (stState.mode === 'autoBlue' ? '#4fd1e0' : '#9ae6b4');
      const activeIcon = stState.mode === 'manualBlue' ? '🔵 ' : (stState.mode === 'autoBlue' ? '🔷 ' : '⚡️ ');
      
      let displayName = item.name.replace('🎬️','').trim();
      let nameStyle = 'font-weight:bold;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:10px;';
      
      if (!item.enabled) {
          nameStyle += 'color:#718096;'; 
      } else if (isActive) {
          displayName = activeIcon + displayName;
          nameStyle += 'color:#d6bcfa;'; // 紫色高亮
      } else {
          nameStyle += 'color:#a0aec0;opacity:0.6;'; 
      }
  
      list.append(`<div class='wb-item-row' data-name='${item.name}' style='display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,255,255,0.05);border-radius:6px;border-left:3px solid transparent;'>
        <div style='${nameStyle}'>${displayName}</div>
        <div style='display:flex;align-items:center;gap:5px;'>
          <button class='wb-btn-summary-strategy' data-uid='${item.uid}' style='background:${strategyBtnColor};color:${strategyBtnTextColor};border:1px solid ${strategyBtnTextColor};padding:4px 8px;border-radius:3px;cursor:pointer;font-size:11px;transition:0.2s;'>${strategyBtnText}</button>
          <button class='wb-btn-summary-toggle' data-uid='${item.uid}' style='width:50px;background:${item.enabled?SWITCHER_CONFIG.colors.summaryOn:SWITCHER_CONFIG.colors.inactive};color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:12px;transition:0.2s;'>${item.enabled?'ON':'OFF'}</button>
        </div></div>`);
    });
    
    $('.wb-btn-summary-toggle').on('click', async function() { 
        const uid = $(this).data('uid'); 
        const i = currentData.summaries.find(s => s.uid === uid); 
        if (!i) return; 
        const s=!i.enabled; 
        await applyChanges(i.bookName, [{uid:i.uid,enable:s}]); 
        i.enabled=s; 
        $(this).css('background',s?SWITCHER_CONFIG.colors.summaryOn:SWITCHER_CONFIG.colors.inactive).text(s?'ON':'OFF'); 
    });
  
    $('.wb-btn-summary-strategy').on('click', async function() {
        const uid = $(this).data('uid');
        const i = currentData.summaries.find(s => s.uid === uid);
        if (!i) return;
        await toggleStrategy(i.bookName, i.uid);
    });
  }

function saveSettings() { localStorage.setItem(SWITCHER_CONFIG.storageKey, JSON.stringify({ autoMode: SWITCHER_STATE.autoMode, floatVisible: SWITCHER_STATE.floatVisible, floatPos: SWITCHER_STATE.floatPos, simpTradMode: SWITCHER_STATE.simpTradMode, floatSizeMode: SWITCHER_STATE.floatSizeMode })); }
function loadSettings() { try { const s = JSON.parse(localStorage.getItem(SWITCHER_CONFIG.storageKey)); if(s) SWITCHER_STATE = { ...SWITCHER_STATE, ...s }; } catch (e) {} }

$(() => {
  loadSettings();
  if (typeof appendInexistentScriptButtons === 'function') {
    appendInexistentScriptButtons([{ name: SWITCHER_CONFIG.buttonName, visible: true }]);
    
    eventOn(getButtonEvent(SWITCHER_CONFIG.buttonName), () => {
        const panel = $('#wb-switcher-panel');
        if (panel.length > 0) {
            panel.remove();
        } else {
            createSwitcherPanel();
        }
    });
  }
  
  createFloatingWindow();
  
  // 启动 1s 心跳循环
  clearInterval(masterLoopTimer);
  masterLoopTimer = setInterval(masterLoop, 1000);

  console.log('[WuWa v4.0.3] 实时状态机(变量驱动Pro+剧情+梗概+飞讯监控)已启动');
});

// [新增] 监听脚本沙箱的卸载事件，彻底清理 UI 残留和内存
$(window).on('unload', () => {
    clearInterval(masterLoopTimer); // 停止心跳
    $('#wb-float-monitor').remove(); // 拔除悬浮窗
    $('#wb-switcher-panel').remove(); // 拔除设置面板
    console.log('[WuWa v4.0.3] 脚本已关闭，监控面板已同步销毁！');
});