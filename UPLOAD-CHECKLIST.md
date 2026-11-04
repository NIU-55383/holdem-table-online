# 网站部署检查表

当前仓库包含七款游戏：德州扑克、卡坦岛（基础版及航海家十三张地图）、桥牌、五子棋、中国象棋、真心话大冒险、百万美金。代码直接维护在本 GitHub 仓库，不再通过解压上传包更新。

大富翁的入口、联机服务、程序、图片、专用库、研究资料和测试已移除。

## 上传步骤

真心话 V3 与两款棋类同设备版：一并提交 `truth-engine.js`、`truth-server.js`、`truth.js/html/css`、`duel-local-worker.js`、`duel-engine.js`、`gomoku-adapter.js`、`duel.js/html/css`、`server.js`、`room-archive.js`、首页与规则、`truth-turns-test.js`、`party-local-ui-test.js` 和相关测试/脚本。新版真心话为 2–8 人，不逐个掷骰；验证随机/接力/两人共同回答、两次换题、每人整局跳过额度、自定义题与存档。两款棋类验证单设备双方落子、刷新恢复、悔棋确认、换边与存档；保留已有 `vendor/gomoku.js` 和 `vendor/xiangqi.cjs`。运行 `npm run test:truth`、`npm run test:truth-ui`、`npm run test:archives`、`npm run test:archives-ui`、`npm run test:rules-ui`。旧骰子存档仍可续玩；首次体验新玩法须另开新局。部署前先保存现有房间，不要重启尚未保存的对局。

本次新增七游戏文件存档：一起提交 `room-archive.js`、`game-archives.js`、`room-archive-test.js`、`room-archive-ui-test.js`，以及六个 HTML 页面、六个联机客户端、六个服务端、`room-control.js`、`game-ui.js/css`、`game-rules.js` 和测试、`package.json` 的修改。运行 `npm run test:archives`、`npm run test:archives-ui`、`npm run test:rules-ui`；检查下载后取消不中断对局、确认后全部退出、重启后导入新房间码、按位置认领资产、旧凭证不占位、坐齐仍等房主继续。导入按钮在各游戏开房页；真心话同屏存档在在线模式导入。不要上传 `test-results` 内含暗牌的测试存档。首次部署此功能前的旧服务器没有保存入口，必须先结束原对局，不能靠重启找回已丢失的房间。

1. 在 `C:/Users/牛特/Documents/GitHub/holdem-table-online` 检查更改。新增文件与修改过的文件一起提交，不要只提交 HTML。
2. 若旧副本仍有退役游戏文件，可执行下方清理命令。它只删除 `retired-files.json` 中列出的旧文件，不删除 `.git`、其他游戏或本地配置；本仓库已移除这些文件。
3. 在 GitHub Desktop 检查修改和删除记录，Commit，然后 Push。
4. 等待 Render 重新部署成功，再刷新网页。服务器重启会清空正在进行的房间，先结束其他游戏的对局。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Remove-RetiredFiles.ps1
```

完整上传 `audio` 和 `vendor` 子目录，保留 `.gitattributes`。五子棋和象棋模型、拆分文件、源码与许可证都已包含；不要只上传根目录的网页文件。

房主五分钟断线保护需一并部署 `room-control.js`、`server.js`、`catan-server.js`、`bridge-server.js`、`duel-server.js`、`truth-server.js`、`million-server.js`，不能只更新前端。部署环境不要设置用于加速测试的 `ROOM_HOST_GRACE_MS`。重启前先结束正在进行的房间；部署后检查房主刷新不换人、连续离线五分钟后才接任、主动退出立即交接。卡坦岛分数显示同时更新 `catan.js` 和 `catan.css`，检查无加分时只显示单个分数、世外部落标记与加分卡合计在加号右侧，对手未公开的加分卡仍隐藏。

统一规则页需要同时保留 `game-rules.js`、`game-rules.css`、`game-rules-data.js` 和六个页面 `index.html`、`duel.html`、`bridge.html`、`catan.html`、`truth.html`、`million.html`。检查全部七款游戏的规则入口，手机能滚动至末尾。桥牌服务器还需要 `bridge-bot.js`，不要漏掉新增文件。

卡坦岛关页恢复需一并部署 `catan.html`、`catan.js` 和 `catan-server.js`，以及 `catan-reconnect-ui-test.js`、`package.json`。运行 `npm run test:catan-reconnect-ui`；检查同浏览器重开后用原房间码返回满房、角色与资产不变、五分钟内保留房主、到期后不抢回房主、被移出后不自动入座。此功能保存的是身份凭证，不是服务器对局存档，无法找回已被重启清空的局。部署前先结束现有对局；不要为了恢复正在玩的房间而重启服务器。

桥牌教学已完整移除，只保留中英双语规则页。提交 `bridge.html`、`bridge.js`、`bridge-server.js`、`package.json`、`retired-files.json` 和对应测试的修改，并一起提交 `bridge-lesson.js`、`bridge-lesson-ui.js`、`bridge-lesson.css`、`bridge-lesson-test.js`、`bridge-lesson-ui-test.js` 的删除记录。旧教学文件已列入停用清单，即使旧部署遗留文件也不再提供访问。部署后确认入座页没有教学入口，开局前和对局中均可查看完整规则，机器人自动行动、明手操作、计分、下一副及重连正常。须重启后端，先结束已有对局；运行 `npm run test:bridge`、`npm run test:bridge-ui` 和 `npm run test:rules-ui`。

若用 GitHub 网页上传，同样需要按清单删除旧文件。即使遗漏删除，新版服务器也会拒绝访问清单中的旧文件，且不再注册其联机接口。

真心话大冒险需要同时提交新增的 `truth.html`、`truth.css`、`truth.js`、`truth-data.js`、`truth-engine.js`、`truth-server.js`、`truth-test.js`、`truth-network-test.js`、`truth-ui-test.js`，以及修改后的 `server.js`、`index.html`、`club.css`、`game-rules-data.js`、`game-rules-test.js`、`game-rules-ui-test.js`、`package.json` 与相关共享回归测试。保留共用头像、互动、音效、规则和房间管理全部资源。新协议为 `/truth-ws`，仅更新网页无法联机，须部署并重启服务器。

五档题库更新须同时部署 `truth-data.js`、`truth-engine.js`、`truth-server.js`、`truth.html`、`truth.css`、`truth.js` 和规则数据。检查失守／摊牌两档可以同屏及联机开局，且真心话、大冒险、混合模式都能正常抽题；每档 30 道真心话、20 道大冒险，原题 ID 保持不变。

真心话不限题数更新：同步部署 `truth-engine.js`、`truth-server.js`、`truth.js`、`truth.html`、`room-archive.js`、规则数据与测试。开局不再有轮数选择，联机和单设备连续玩过 3／5／8 题后都应继续下一题，不出现胜负结算；完成数字仅作记录。确认双人共同回答仍须两人回应后换题，换题额度每题重置，跳过额度不重置；旧 V3 存档（包括已结算的存档）恢复后可继续，V2 骰子旧存档保留原规则。测试主动退出、本地清除、存档及手机布局。先保存原房间再重启服务器，不要只更新前端。运行 `npm run test:truth`、`npm run test:truth-ui`、`npm run test:archives` 和 `npm run test:rules-ui`。

## 部署设置

百万美金须一并提交 `million.html`、`million.css`、`million.js`、`million-art.svg`、`million-data.js`、`million-engine.js`、`million-server.js`、`million-test.js`、`million-network-test.js`、`million-rules-test.js`、`million-ui-test.js`，以及 `server.js`、`index.html`、`club.css`、规则数据和共享回归测试的修改。新联机地址 `/million-ws`；生产环境不要设置测试加速变量 `MILLION_BOT_DELAY`。部署后检查第七个入口、五种角色颜色、3 人双角色和 4–8 人配置、交易只支付一次、退出身份仅在本轮结算后公开、威胁卡每张只查看一个角色槽、分赃明细、实际赢家和每轮回顾。再检查手机布局、中英规则、头像互动、房主保护、掉线重连和空位补齐。运行 `npm run test:million`、`npm run test:million-ui`、`npm run test:rules-ui`。服务器重启前先结束已有对局。

2016 旧版规则校正需同时更新前端、`million-data.js`、`million-engine.js` 与 `game-rules-data.js`，不能只部署规则文字。检查告密者角色卡可点击、必须点名、独存罚 300 万但与其他角色分赃不罚；破产者由储备补保证金，退款拿回整笔；交易金额为 100 万整数倍，没收款和余款退回储备。十张官方赃款牌尚未完全核实，规则页必须保留随机牌组差异说明，不能标为完整官方牌组复刻。

百万美金美术统一需同时更新 `million.css`、`million.html`、`million-art.svg` 和 `club.css`：浅灰绿页面、白色控件、深绿色按钮及牌桌；五种角色仍用原色的插画和色条。检查大厅封面、选角、结算、音量窗口与中英规则在桌面和手机上均清晰，不影响其他游戏。

卡坦岛机器人交易等待已改为 5 秒，须提交 `catan-server.js` 并等服务器重新部署；只刷新网页不会更新计时。生产环境不要设置用于加速测试的 `CATAN_BOT_DELAY`。部署后检查全员报价在第 3 秒仍可由真人接受，机器人接受或拒绝均需等待 5 秒，撤回或真人成交后不再自动交易。重启前先结束正在进行的房间。

卡坦岛赛后统计需要一起提交 `catan-stats.js`、`catan-stats-ui.js`、`catan-stats.css` 和修改后的 `catan-engine.js`、`catan-scenarios.js`、`catan.js`、`catan.html`。后端更新后需重启，从新对局开始记录，不能补回旧局数据。部署后玩完一局，检查自动弹出的分数走势、骰子分布、资源产出、建设统计和被抢次数；抢资源或布匹每次记 1 次，海盗舰队造成损失另列为袭击次数，七点弃牌、垄断和未抢到东西不计。结束前不应收到任何统计数据，重连保留本局统计，再来一局清零；旧局未记录被抢次数时应显示未记录。房间仍只存在内存中，重启前请先结束正在进行的对局。

- Build Command：`npm install`
- Start Command：`npm start`
- 沿用已有 GitHub 仓库和 Render 服务，不必新建。
- 保持单实例运行；房间数据存在内存中。
- 棋类 AI 模型沿用已确认的朋友娱乐、不收费、不放广告用途，具体许可见 `AI-ENGINES.md` 和 `THIRD-PARTY.md`。

`retired-files.json` 和 `Remove-RetiredFiles.ps1` 仅用于移除旧文件，不包含被移除游戏的实现。当前功能及测试入口见 `README.md`。
