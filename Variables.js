// ==========================================
// 变量结构.js
// 目的：定义变量的结构、类型和默认值。
// 这是数据的“蓝图”，不包含复杂的业务逻辑。
// ==========================================

import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';


// ==========================================
// 2. 辅助图式 (Helper Schemas) - 保持不变
// ==========================================
const smartBoolean = z.preprocess((val) => {
    if (typeof val === 'string') {
        const lower = val.toLowerCase().trim();
        return lower === 'true' || lower === 'yes' || lower === '1';
    }
    if (typeof val === 'number') return val === 1;
    return val;
}, z.boolean());

const SexStatusSchema = z.object({
    是否正在性爱: smartBoolean.prefault(false),
    高潮进度: z.coerce.number().min(0).max(100).describe('0~100').prefault(0),
    高潮计数: z.coerce.number().min(0).describe('无上限，每次高潮+1').prefault(0),
    _高潮次数上限: z.coerce.number().prefault(5).describe('显示用的参考上限，可以被超过'),
}).prefault({});

const InventorySchema = z.record(
    z.string(),
    z.object({
        数量: z.coerce.number().prefault(1),
        描述: z.string().prefault(''),
        类型: z.string().prefault('杂物'),
    }).prefault({})
).prefault({});

const CharacterSchema = z.object({
    基础信息: z.object({
        身高: z.string().prefault('未知'), 罩杯: z.string().prefault('未知'),
        外貌: z.string().prefault(''), 是否为处女: smartBoolean.prefault(true),
    }).prefault({}),
    是否在场: smartBoolean.prefault(false), 声痕位置: z.string().prefault('未知'),
    当前穿着: z.object({
        上装: z.string().prefault(''), 下装: z.string().prefault(''), 饰品: z.string().prefault(''), 其它: z.string().prefault(''),
    }).prefault({}),
    好感度: z.coerce.number().min(0).max(100).prefault(40),
    _对主角的态度: z.string().readonly().describe('由逻辑控制器根据好感度自动计算，AI不可修改').prefault(''),
    额外信息: z.object({ 内心想法: z.string().prefault('') }).prefault({}),
    物品: z.string().prefault(''), 性爱状态: SexStatusSchema,
    私密资料: z.object({
        性爱经验: z.string().prefault('无'), 持久痕迹: z.string().prefault('无'),
        性爱日志: z.array(z.object({ 时间: z.string(), 内容: z.string(), 结果: z.string() })).prefault([])
    }).prefault({})
}).prefault({});

const TriggerSchema = z.object({
    事件类别: z.enum(['明线', '暗线']).prefault('明线'), 事件简述: z.string().prefault(''),
    事件计时: z.string().prefault(''), 状态: z.string().prefault('未触发')
});

const ForeshadowSchema = z.object({
    伏笔内容: z.string().prefault(''), 指向的预期结果: z.string().prefault('')
});

// ==========================================
// 3. 核心图式 (Main Schema)
// ==========================================
export const Schema = z.object({
    _storyState: z.object({
        majorVerIdx: z.number().prefault(0),
        partIdx: z.coerce.number().prefault(0),
        isPostScript: smartBoolean.prefault(false),
        _anchorVer: z.string().optional()
    }).prefault({ majorVerIdx: 0, partIdx: 0, isPostScript: false }),

    指令: z.object({
        推进剧情: smartBoolean.nullable().prefault(null),
        跳转版本: z.string().nullable().prefault(null),
        修改后日谈模式为: smartBoolean.nullable().prefault(null),
        重置高潮计数_角色名: z.string().nullable().describe('输入角色名或"主角"').prefault(null),
    }).prefault({}),
    
    // Outputs - 这些变量由逻辑控制器计算，对AI只读
    当前时间: z.string().describe('由AI维护的纯文本时间').prefault('第1年 1月1日 周一 00:00'),
    所在地点: z.string().prefault('未知地点'),
    剧情显示: z.string().readonly().prefault('初始化中...'),
    剧情权重: z.number().readonly().prefault(0),
    是否为后日谈: z.string().readonly().prefault('false'),

    // Variables - AI可以读写这些
    章节终止条件: z.string().optional(),
    已完成的上一个事件: z.string().optional(),
    已完成的上一个事件节点: z.string().optional(),
    即将进行的下一个事件节点: z.string().optional(),
    当前演绎事件: z.string().optional(),
    当前演绎事件节点: z.string().optional(),
    当前长期目标: z.string().optional(),

    主角信息: z.object({
        // 修改点：允许为null，默认值为null，以便AI初始化填写
        是否是漂泊者: smartBoolean.nullable().prefault(null),
        性别: z.enum(['男', '女', '未知']).prefault('男'),
        身份与额外设定: z.string().prefault(''),
        当前穿着: z.string().prefault(''),
        当前状态: z.string().prefault(''),
        性爱状态: SexStatusSchema,
        物品栏: InventorySchema
    }).prefault({}),

    NPC漂泊者: z.object({
        // 修改点：允许为null，默认值为null，以便AI初始化填写
        是否存在: smartBoolean.nullable().prefault(null),
        性别: z.enum(['男', '女']).prefault('女')
    }).prefault({}),

    女性角色: z.record(z.string(), CharacterSchema).prefault({}),
    剧情触发器: z.array(TriggerSchema).prefault([]),
    伏笔: z.array(ForeshadowSchema).prefault([]),

    // 私有派生变量 - 由逻辑控制器计算，对AI只读
    _现场女性角色显示: z.record(z.string(), z.any()).readonly().optional(),
    _已知角色名单: z.array(z.string()).readonly().optional(),
});

// 仅保留注册Schema的功能
$(() => {
    registerMvuSchema(Schema);
    console.log("【核心变量结构】已注册。");
});
