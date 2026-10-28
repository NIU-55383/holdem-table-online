# 网站部署检查表

当前仓库包含六款游戏：德州扑克、卡坦岛（基础版及航海家十三张地图）、桥牌、五子棋、中国象棋、真心话大冒险。代码直接维护在本 GitHub 仓库，不再通过解压上传包更新。

大富翁的入口、联机服务、程序、图片、专用库、研究资料和测试已移除。

## 上传步骤

1. 在 `C:/Users/牛特/Documents/GitHub/holdem-table-online` 检查更改。新增文件与修改过的文件一起提交，不要只提交 HTML。
2. 若旧副本仍有退役游戏文件，可执行下方清理命令。它只删除 `retired-files.json` 中列出的旧文件，不删除 `.git`、其他游戏或本地配置；本仓库已移除这些文件。
3. 在 GitHub Desktop 检查修改和删除记录，Commit，然后 Push。
4. 等待 Render 重新部署成功，再刷新网页。服务器重启会清空正在进行的房间，先结束其他游戏的对局。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Remove-RetiredFiles.ps1
```

完整上传 `audio` 和 `vendor` 子目录，保留 `.gitattributes`。五子棋和象棋模型、拆分文件、源码与许可证都已包含；不要只上传根目录的网页文件。

房主五分钟断线保护需一并部署 `room-control.js`、`server.js`、`catan-server.js`、`bridge-server.js`、`duel-server.js`、`truth-server.js`，不能只更新前端。部署环境不要设置用于加速测试的 `ROOM_HOST_GRACE_MS`。重启前先结束正在进行的房间；部署后检查房主刷新不换人、连续离线五分钟后才接任、主动退出立即交接。卡坦岛分数显示同时更新 `catan.js` 和 `catan.css`，检查无加分时只显示单个分数、世外部落标记与加分卡合计在加号右侧，对手未公开的加分卡仍隐藏。

统一规则页需要同时保留 `game-rules.js`、`game-rules.css`、`game-rules-data.js` 和五个页面 `index.html`、`duel.html`、`bridge.html`、`catan.html`、`truth.html`。检查德州、桥牌、五子棋、象棋、卡坦岛及真心话大冒险的规则入口，手机能滚动至末尾。桥牌服务器还需要 `bridge-bot.js`，不要漏掉新增文件。

桥牌教学需要新增的 `bridge-lesson.js`（服务器）、`bridge-lesson-ui.js`、`bridge-lesson.css`，以及修改后的 `bridge-server.js`、`bridge.js`、`bridge.html` 一起部署。检查“新手教学”的八课双语图文、17 点开叫题、6 点红桃支持题和术语表，确认手牌在讲解上方，两道题的答案和解析互不影响；随后切换到北家 16 点练习牌，逐步出完 13 墩。机器人应等待“继续”，普通房间仍自动行动。首次部署教学后端需要重启服务器，原有房间会清空；仅更新教学图文与样式时刷新页面即可。

若用 GitHub 网页上传，同样需要按清单删除旧文件。即使遗漏删除，新版服务器也会拒绝访问清单中的旧文件，且不再注册其联机接口。

真心话大冒险需要同时提交新增的 `truth.html`、`truth.css`、`truth.js`、`truth-data.js`、`truth-engine.js`、`truth-server.js`、`truth-test.js`、`truth-network-test.js`、`truth-ui-test.js`，以及修改后的 `server.js`、`index.html`、`club.css`、`game-rules-data.js`、`game-rules-test.js`、`game-rules-ui-test.js`、`package.json` 与相关共享回归测试。保留共用头像、互动、音效、规则和房间管理全部资源。新协议为 `/truth-ws`，仅更新网页无法联机，须部署并重启服务器。

五档题库更新须同时部署 `truth-data.js`、`truth-engine.js`、`truth-server.js`、`truth.html`、`truth.css`、`truth.js` 和规则数据。检查失守／摊牌两档可以同屏及联机开局，且真心话、大冒险、混合模式都能正常抽题；每档 30 道真心话、20 道大冒险，原题 ID 保持不变。

部署后检查首页第六个游戏入口，先用同一手机两名玩家玩完一局，再用两台设备加入同一房间：确认仅真心话／仅大冒险／两种都要，全员掷骰、最高点出题、最低点接招、两端并列加赛与全员同点重掷；检查系统题／免费换题／240 字自定义题、只有最低点玩家能完成 +1 或跳过 0，以及全局 3／5／8 轮的实际获胜者和平局显示；检查手机规则滚动、头像互动、断线重连、房主转让、移除双确认、空位暂停与补位。自动托管可掷骰、选择并发送系统题，接招时只跳过不加分。此次玩法改动需重启服务器，结束旧局后重新开房。运行 `npm run test:truth`、`npm run test:truth-ui` 和 `npm run test:rules-ui`。

## 部署设置

卡坦岛赛后统计需要一起提交 `catan-stats.js`、`catan-stats-ui.js`、`catan-stats.css` 和修改后的 `catan-engine.js`、`catan-scenarios.js`、`catan.js`、`catan.html`。后端更新后需重启，从新对局开始记录，不能补回旧局数据。部署后玩完一局，检查自动弹出的分数走势、骰子分布、资源产出、建设统计和被抢次数；抢资源或布匹每次记 1 次，海盗舰队造成损失另列为袭击次数，七点弃牌、垄断和未抢到东西不计。结束前不应收到任何统计数据，重连保留本局统计，再来一局清零；旧局未记录被抢次数时应显示未记录。房间仍只存在内存中，重启前请先结束正在进行的对局。

- Build Command：`npm install`
- Start Command：`npm start`
- 沿用已有 GitHub 仓库和 Render 服务，不必新建。
- 保持单实例运行；房间数据存在内存中。
- 棋类 AI 模型沿用已确认的朋友娱乐、不收费、不放广告用途，具体许可见 `AI-ENGINES.md` 和 `THIRD-PARTY.md`。

`retired-files.json` 和 `Remove-RetiredFiles.ps1` 仅用于移除旧文件，不包含被移除游戏的实现。当前功能及测试入口见 `README.md`。
