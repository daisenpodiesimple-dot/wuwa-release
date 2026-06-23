# GitGud 库 AI 入库指引

> 本仓库 (`C:\SillyTavern\WuwaWorks`) 对应 gitgud 远程仓库。
> 用于存放鸣潮角色卡的脚本、素材图片等核心文件。

## 仓库信息

- 远程地址：`https://gitgud.io/akagishigeru/wuwa-images.git`
- 分支：`master`（**受保护分支，禁止 force push**）
- Git 身份：`akagishigeru` / `daisenpodiesimple@gmail.com`

## 入库流程（标准）

```powershell
cd C:\SillyTavern\WuwaWorks
git add <具体文件>      # 只 add 需要入库的文件，不要盲目 git add -A
git commit -m "提交说明"
git push
```

> **网络推送可能需要用户在本地终端手动执行**（沙箱可能拦截网络）。
> 如果沙箱内 push 成功则无需手动。

## 入库流程（如果 push 被拒绝）

```powershell
# 远程有新提交时，先拉取再推送（不要 force！分支受保护）
git pull origin master --rebase
git push
```

## 如果遇到 dubious ownership 报错

```powershell
git config --global --add safe.directory C:/SillyTavern/WuwaWorks
```

## 文件结构说明

### 入库的文件（gitgud 库）

| 路径 | 说明 |
|------|------|
| `WorldInfoController.js` | 世界书控制脚本 |
| `StoryLogic.js` | 剧情控制台脚本 |
| `StoryDatabase.js` | 剧情数据库脚本 |
| `Variables.js` | 变量定义脚本 |
| `Feixun.js` | 飞讯脚本 |
| `StatusBar.html` | 状态栏 HTML |
| `Opening.html` | 开场白 HTML |
| `Abby/` | Abby 表情包素材 |
| `Avatars/` | 角色头像素材 |
| `OpeningLogos/` | 开场 Logo 素材 |
| `StandingIllus/` | 角色立绘素材 |
| `README.md` | 本说明文件 |
| `.gitignore` | Git 忽略规则 |

### 不入库的文件（.gitignore 排除）

| 路径 | 说明 |
|------|------|
| `function/` | SillyTavern 插件 d.ts 参考文件（仅供 AI 阅读，不需要入库） |
| `tavern_resource-main/` | 酒馆助手参考文档（仅供 AI 阅读，不需要入库） |
| `float_preview.html` | UI 预览临时文件 |
| `ST_Prompt_Template/` | ST 提示词模板参考（仅供 AI 阅读，不需要入库） |
| `GitHub_Release/` | GitHub 库文件（单独管理，见下方） |

### 单独管理：GitHub Release 库

角色卡和更新日志存放在单独的 GitHub 仓库 `daisenpodiesimple-dot/wuwa-release`，
相关文件和推送指引在 `GitHub_Release/AI_PUSH_GUIDE.md` 中。

- **不通过 git push 推送 GitHub**（沙箱网络 SSL 会失败）
- **必须用 GitHub REST API 上传**（流程见 `GitHub_Release/AI_PUSH_GUIDE.md`）

## 重要注意事项

1. `master` 在 gitgud 上是 protected branch，`git push --force` 会被远端拒绝，**永远不要用 force**。
2. 用户要求"只入库某某文件"时，务必只 `git add` 指定文件，**不要碰其他文件**。
3. `Character/` 文件夹不入库 gitgud。里面有角色卡 PNG（本地备份 / 给 GitHub Release 用的源文件）和角色卡 JSON（仅供 AI 参考的角色卡结构导出，不需要入库）。
4. `changelog.md`（根目录）是 GitHub Release 的更新日志副本，不入库 gitgud。
