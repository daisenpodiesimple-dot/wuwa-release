# WuwaWorks — 鸣潮 SillyTavern 角色卡工作区

鸣潮（Wuthering Waves）SillyTavern 角色卡 **WuWa Solaris-3 MVU Edition** 的开发工作区。

角色卡的脚本、世界书、正则、界面、素材通过 [tavern_sync](tavern_sync/tutorial.md) 映射为本地文件，支持实时同步到酒馆。

## 目录结构

```
WuwaWorks/
├── tavern_sync/               # 角色卡同步工作区（核心）
│   ├── tavern_sync.mjs        # 同步脚本
│   ├── tavern_sync.yaml       # 配置
│   ├── tutorial.md            # 使用教程
│   ├── dist/                  # schema 定义文件
│   └── Character/             # 角色卡 pull 副本（实际编辑入口）
│       └── WuWa Solaris-3 MVU Edition/
│           ├── index.yaml             # 角色卡主配置（条目元数据）
│           ├── 头像.png               # 角色卡头像
│           ├── 第一条消息/            # 开场白内容
│           ├── 世界书/                # 世界书条目内容
│           ├── 脚本/                  # 角色卡内嵌脚本（飞讯、剧情逻辑等）
│           └── 正则/                  # 正则脚本（状态栏、开场白 HTML 等）
│
├── Abby/                      # Abby 表情包（15 张）
├── Avatars/                   # 角色头像（53 张）
├── StandingIllus/             # 角色立绘（41 张）
├── OpeningLogos/              # 开场 Logo（3 张）
└── README.md
```

## 角色卡脚本

| 脚本 | 文件位置 |
|------|---------|
| 飞讯终端 | tavern_sync/Character/.../脚本/飞讯_0703.js |
| 剧情控制台 | tavern_sync/Character/.../脚本/剧情逻辑_0703.js |
| 剧情数据库 | tavern_sync/Character/.../脚本/剧情数据库_0613.js |
| 变量结构 | tavern_sync/Character/.../脚本/变量结构_0628.js |
| 世界书控制 | tavern_sync/Character/.../脚本/世界书控制_0708.js |

## 角色卡界面（正则注入）

| 界面 | 文件位置 |
|------|---------|
| MVU 状态栏 | tavern_sync/Character/.../正则/[状态栏]MVU浪潮状态栏_0705.txt |
| 开场白 | tavern_sync/Character/.../正则/[开场白]鸣潮开场_0629.txt |

## 作者

akagishigeru / daisenpodiesimple@gmail.com
