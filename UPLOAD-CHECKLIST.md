# 网站部署检查表

当前仓库包含八款游戏：德州扑克、卡坦岛（基础版、航海家十三张地图、城市与骑士）、桥牌、五子棋、中国象棋、真心话大冒险、百万美金、政变（Coup）。代码直接维护在本 GitHub 仓库，不再通过解压上传包更新。

大富翁的入口、联机服务、程序、图片、专用库、研究资料和测试已移除。

## 上传步骤

政变（Coup）新增入口：同步部署 `coup.html`、`coup.js`、`coup.css`、`coup-art.svg`、`coup-engine.js`、`coup-server.js`，以及首页、`club.css`、`server.js`、共享规则、存档和 `package.json` 的修改。支持 2–6 人、机器人、角色声明/质疑/反制、私密换牌、房主结束/重开确认、统一头像互动和文件存档。保存保留牌、金币和当前步骤，不保留聊天、对局记录或旧玩家身份；导入后重新认领，房主确认继续。运行 `npm run test:coup`、`npm run test:coup-ui`、`npm run test:archives`、`npm run test:archives-ui`、`npm run test:rules`、`npm run test:rules-ui`；部署重启前先保存现有对局。原界面参考和核查范围见 `COUP-REVIEW.md`。

卡坦岛机器人交易估价：同步部署 `catan-engine.js`、`catan-bot-trade-test.js` 和 `package.json`。报价同时评估多种建造/升级目标、自有产能、全场公开产能、银行库存与手牌余量；商品有需求时优先估值，满级与囤积时降值，保留临近胜利、防守缺粮和银行/港口更优兑换的拒绝判断。金矿产能仅计普通资源，回合外机器人不借用当前玩家的起重机减费。运行 `npm run test:catan-trades` 及 `node --test catan-test.js catan-cities-test.js catan-combined-test.js seafarers-test.js catan-scenario-engine-test.js`。这是服务端逻辑更新，部署后生效；重启前保存现有对局。

进步卡超限提示：同步部署 `catan-cities-ui.js` 和 `catan-engine.js`。自己的回合注明可先使用进步卡，降到最多 4 张就无需弃牌；只有结束回合时仍超限才需要弃掉多出的牌。回合外强制弃牌明确不能用牌代替。保留原有规则及后端结束回合校验，运行 `node --test catan-cities-test.js catan-graphical-choice-ui-test.js`，检查两模式桌面/手机的可选弃牌与关闭弹窗。

卡坦岛操作按钮紧凑布局：同步部署 `catan.css` 和 `catan-cities.css`。所有卡坦模式的建造、船只、骑士、升级、交易、费用及回合操作统一缩减图标和留白；保留双语字号及手机至少 44px 的按钮高度。运行 `node catan-cities-ui-test.js`，检查桌面/手机的操作、费用入口及开局造船选择。

赛后骰子来源分层：同步部署 `catan-stats-ui.js`、`catan-stats.css` 和 `catan-stats-ui-test.js`。城市与骑士的全部掷骰图按来源堆叠：蓝色随机、顶部紫色炼金术，旧记录中来源不明的次数单独显示为灰色斜纹；保留总次数及独立随机分布图。运行 `npm run test:catan-stats-ui`，检查两类城市模式、桌面/手机和旧存档来源不明的情况。

城市与骑士总分显示：同步部署 `catan.js`。独立城市与骑士及城市与骑士＋航海家模式的玩家分数直接显示总分，问号继续提供全部得分来源；基础版与单独航海家的暗分显示规则不变。运行 `npm run test:catan-score`，核对各模式得分明细、暗分隐私及桌面和手机布局。

卡坦岛待处理提示与海盗驱赶：同步部署 `catan-cities-ui.js`、`catan.js`、`catan-choice-layout-chase-ui-test.js` 和 `package.json`。炼金术、破坏等待处理提示及操作入口统一显示在进步卡栏上方；组合模式分别显示「驱赶强盗」与「驱赶海盗」，骑士说明补充两种驱赶的条件和步骤。运行 `npm run test:catan-choices`，核对桌面、320px 手机、两种驱赶同时可用时的目标，以及提示切换时手牌图标不闪烁。本次没有后端协议或存档格式变更。

城市与骑士＋航海家：一并部署 `catan-maps.js`、`catan-engine.js`、`catan-cities.js`、`catan-server.js`、`room-archive.js`、`catan.js/html/css`、`catan-cities-data.js`、`catan-cities-ui.js`、`catan-music.js`、首页与相关测试。新入口使用独立 `cities-shores-1/2`、`cities-desert-1/2` 地图 ID，分别提供三、四人默认与随机布局，目标 16 分；原有模式与存档保持原规则。本次只开放官方推荐的扬帆出海、穿越荒漠，不声称其他组合一律被官方禁止。检查海上骑士及船只连接、金矿只领普通资源和水渠先后结算、首次入侵前无强盗和海盗、外交同类型替换、进步卡免费造船、商品隐私、重连和金矿选择中途保存恢复。运行 `npm run test:combined`、`npm run test:combined-ui`、`npm run test:cities`、`npm run test:archives`、`npm run test:rules` 和 `npm run test:rules-ui`。组合模式规则使用共享阅读器与中英分条说明；同步更新全部前后端文件，重启服务前先保存已有对局。

桥牌可选叫牌提示：一并部署 `bridge-bidding.js`、`bridge.js/html/css`、`bridge-server.js`、`room-archive.js` 和对应测试及 `package.json`。创建房间时可选，默认关闭；房主可在开局前修改，开局后本场保持不变。每位玩家仅使用自己的 13 张牌与公开叫牌显示 A/K/Q/J 点数、牌型和简化自然叫牌建议；读取提示不会代叫，也不读取其他座位的暗牌。旧存档默认关闭，新存档、刷新和下一副保留选择。运行 `npm run test:bridge`、`npm run test:bridge-ui`、`npm run test:archives`、`npm run test:rules` 和 `npm run test:rules-ui`，检查桌面与 320px 手机、房主权限、存档恢复及开关关闭后的隐藏。更新服务前先保存现有对局。

独立保存与城市骑士更新：房间管理同时有「保存」和「保存并退出」。前者仅下载，不冻结房间、清空座位或中断 AI；后者保留原有下载后确认退出流程。同步上传 `room-archive.js`、`game-archives.js`、`game-ui.js`、`game-rules.js`、`truth.js`、`duel.js` 及存档测试。

城市与骑士保留独立 3–4 人模式，并另提供下述城市与骑士＋航海家组合模式；均不支持 5–6 人扩展。规则依据 CATAN 官网 2025 年说明书及 FAQ。同步上传全部 `catan-cities*` 文件、`catan-engine.js`、`catan-server.js`、`catan.js/html`、`catan-stats.js`、`catan-music.js`、`room-archive.js`，以及 `audio/peritune-strategy.mp3` 和 `audio/CREDITS.md`。新局选择城市与骑士，旧局规则不变。测试初始城市、三种商品、骑士、城墙、都会、蛮族、54 张进步卡和所有选择阶段的存档恢复；核对手机和桌面棋盘标记、规则阅读器与音乐切换。部署重启前先保存现有房间。

卡坦岛全部进步卡弹窗修复：同步更新 `catan.js`、`catan-cities-ui.js`、`catan-alchemy-ui-test.js`、`catan-progress-dialog-ui-test.js` 和 `package.json`。检查全部 25 种进步卡：23 种手动使用的进步卡（含商人）在掷骰前后均能关闭说明或取消确认；棋盘商人说明及印刷术、宪法的规则说明也可退出。重点核对掷骰前灌溉、掷骰后炼金术，以及可用卡和不可用卡快速切换时按钮状态不串用；查看和取消不耗牌、不改变回合，之后仍能正常掷骰或结束回合。运行 `npm run test:cities-ui`，包含桌面、手机触摸、键盘和完整炼金术出牌流程；本次没有后端协议或存档格式变更。

城市改良说明与升级确认更新：一并部署 `catan-cities-ui.js`、`catan-cities.css`、`catan-cities.js`、`catan-cities-test.js`、`catan-improvement-ui-test.js` 和 `package.json`。三种改良介绍使用分条说明和 0—5 级红骰对照表；确认弹窗按后端提供的等级、实际费用、起重机减费和都会归属显示本次收益，不能仅更新前端。检查免费升级、三级能力、四级没有拿到都会、五级夺取和保住都会的不同提示；阅读和取消不得发送出牌请求。运行 `npm run test:cities` 和 `npm run test:cities-ui`；更新服务前先保存现有对局。

城市与骑士全部新增机制说明改用中英配对的 bullet point：一起更新 `catan-cities-data.js`、`catan-cities-ui.js`、`catan-cities.css`、`catan.js` 与对应浏览器、规则测试。覆盖蛮族船、骑士、城墙、商人、都会、事件骰、商品、全部 25 种进步卡、保卫卡坦得分说明和完整规则页；升级条件与红骰表保持明确。检查桌面、320px 手机及横屏阅读，长内容仅在正文区域滚动，关闭按钮与出牌按钮保持可见；查看或关闭说明不消耗卡牌、不改变游戏。运行 `npm run test:rules`、`npm run test:cities-ui` 与 `node --test catan-score-info-ui-test.js`。

城市与骑士交牌提示更新：同时部署 `catan-cities.js`、`catan-cities-ui.js`、`catan-cities.css`、`catan.js`、对应测试和 `package.json`，仅更新网页不能获得新的交牌原因数据。婚礼与破坏的选择栏和顶部提示应显示出牌者、触发条件、本次总数、已交与剩余数，以及交给玩家或弃回银行；每点一次只交 1 张。商业港显示双方各交什么，进步卡超限显示本次弃牌数量。新存档保存触发时的数量和分数；旧存档缺少原始总数时，只显示可信的剩余数。运行 `npm run test:cities` 与 `node catan-give-choice-ui-test.js`，验证逐张选择、旁观玩家、掉线重连和交牌中途保存恢复；更新服务前先保存现有对局。

进步卡分类与插图更新：同步部署新增 `catan-progress-art.svg`，以及 `catan-cities-ui.js`、`catan-cities.css`、`catan.js`、相关浏览器测试和 `package.json`。清单按科学、贸易、政治分组，分别用白、黄、蓝卡面，每张卡附独立插图和类别文字；事件骰的绿色科学规则不变。手牌区显示全部未公开进步卡（包含商人），标题旁可直接打开分类清单；商人不再放在主操作按钮中。检查空手牌及暂停时仍可读清单、类别跳转、手机布局、商人确认后只消耗一张并选地放置，以及原规则和费用入口正常。运行 `node catan-progress-catalog-ui-test.js`、`node catan-merchant-ui-test.js` 与 `npm run test:cities-ui`。

百万美金 2024 与 2016 共用 `million.html`、`million.js/css` 和共享规则阅读器，不另建新版页面。同步部署 `million-2024.js`、`million-bot.js`、`million-data.js`、`million-engine.js`、`million-server.js`、`room-archive.js`、规则数据、`package.json` 及相关测试。检查版本切换后人数上限（旧版 8、新版 9）、角色列表、规则入口和角色详情均对应所选版本；新版不显示旧版威胁卡、禁止连选或暴徒不分赃选项，旧版问号帮助仍可用。

本馆沿用2016模式的赃款数值与奖励配置。2024 每轮仍随机使用 800-1200 万赃款和 100 万角色奖励，旧告密者／恶棍／谋士奖励分别映射技术员／读心者／新版谋士；没有存活匹配就不加奖励。保证金固定每角 200 万，留下的保证金和角色奖励加入中央，按新版顺序取款后向上取整平分。检查六种角色、三人双角色、全体玩家（含退出者）半数投票、最穷带头人及顺时针打破平局，不把旧版分赃方式带入新版。

机器人应按版本和角色评估选择、报价、退出、点名及偷钱，只使用该座位的私有视图与公开线索；检查机器人会虚报身份，聊天和声明标为声称而非已证实身份，不泄露他人暗牌。存档须保留 edition：2016/V2 和 2024/V3 分别恢复，旧 V2 无 edition 的存档仍按 2016 导入，版本不匹配或畸形数据必须拒绝。检查声明、投票、技术员和读心者等待阶段的恢复；重新认领前不显示暗牌，未成交提议与旧投票同意失效，坐齐后仍由房主确认继续。存档含暗牌，勿上传测试存档；部署重启前先保存现有房间。

新版回归：运行 `node --test game-rules-test.js million-rules-test.js` 和 `npm run test:million`，后者包含 `million-2024-test.js`、`million-bot-test.js`、`million-2024-network-test.js`、`million-2024-archive-test.js`，部署时不可漏掉这些新增文件。`npm run test:million-ui` 依次运行旧版 `million-ui-test.js` 和新版 `million-2024-ui-test.js`，两版均需通过；同步部署新增 UI 测试，并检查两版手机与桌面布局。继续运行 `npm run test:rules-ui` 和 `npm run test:archives-ui`。

百万美金的「暴徒参与分赃」说明：同步更新 `million.html`、`million.js`、`million.css`、`game-rules.js`、`game-rules-data.js` 和规则/浏览器测试。开局页、房主大厅设置及其他玩家的只读设置旁都有问号，点击直达勾选与取消勾选的中英介绍，不更改复选框或发送游戏操作；手机与键盘同样可用。共享规则定位使用滚动区域内的实际位置，避免显示上一节残留文字。运行 `node --test million-rules-test.js game-rules-test.js`、`node million-ui-test.js` 和 `node game-rules-ui-test.js`。

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

桥牌将牌显示与 AI 升级需同时更新 `bridge.html`、`bridge.css`、`bridge.js`、`bridge-bot.js`、`bridge-server.js`，以及新增的 `bridge-bot-worker.js`。桌面中央应持续显示将牌或无将 NT，定约应在叫牌栏目上方，320px 手机下不遮挡出牌。确认机器人能后台思考、空位暂停后不执行旧任务、补位后继续；部署后端前先保存或结束现有对局。运行 `npm run test:bridge`、`npm run test:bridge-ui`；`bridge-ai-benchmark.js` 可额外传入旧版机器人文件进行同牌换边比较。

桥牌计分明细需要新增 `bridge-score.js`，并更新 `bridge.html`、`bridge.js`、`bridge.css`、`bridge-score-test.js`、`bridge-ui-test.js` 和 `package.json`。结算页及历史计分表的分数应能点开双语明细；检查 120 分、超墩、加倍、满贯、宕约、全不叫和重连后的历史分数。手机竖屏与横屏弹窗可滚动，关闭键始终可见；查看明细不会推进对局。该功能没有后端协议或存档格式变更。

若用 GitHub 网页上传，同样需要按清单删除旧文件。即使遗漏删除，新版服务器也会拒绝访问清单中的旧文件，且不再注册其联机接口。

真心话大冒险需要同时提交新增的 `truth.html`、`truth.css`、`truth.js`、`truth-data.js`、`truth-engine.js`、`truth-server.js`、`truth-test.js`、`truth-network-test.js`、`truth-ui-test.js`，以及修改后的 `server.js`、`index.html`、`club.css`、`game-rules-data.js`、`game-rules-test.js`、`game-rules-ui-test.js`、`package.json` 与相关共享回归测试。保留共用头像、互动、音效、规则和房间管理全部资源。新协议为 `/truth-ws`，仅更新网页无法联机，须部署并重启服务器。

真心话题库共 200 道真心话、100 道大冒险，均含中英文，已取消全部分级。部署 truth-data.js、truth-engine.js、truth-server.js、truth.js、truth.html、truth.css、room-archive.js 和 game-rules-data.js。验证同一回答者本局不会重复抽到题目，换掉或跳过也计入；共同回答同时记录两人，题库用完后只能自定义，不循环洗牌。刷新、重连、下载存档及恢复须保留 seenPrompts；旧分级存档仍能恢复，旧共享抽题记录对所有座位生效。运行 npm run test:truth、npm run test:truth-ui 和存档回归。部署前先保存现有房间，再重启服务器；仅刷新网页不会更新旧服务器的题库。

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

进步卡可用状态更新：同步部署 `catan-cities-ui.js` 与 `catan-cities.css`。未满足使用条件的手牌置灰，点击仅打开卡牌说明及当前不可用原因；只有 Ready 卡能进入使用确认。运行 `node catan-progress-dialog-ui-test.js`，检查掷骰前后、回合外、目标条件不足、暂停、聊天广播及手机上的说明关闭与真实出牌。

城市卡牌整批选牌：同步部署 catan-cities.js、catan-cities-ui.js、catan-cities.css 与 catan.js。破坏、婚礼、商业港、进步卡超限、水渠、行会税和间谍均先选择／撤选，再确认；资源与商品用原有弃牌插画样式，进步卡保留类别色。后端新增 ckSelect，须更新后端并重启；只更新页面不能使用整批提交。重启前保存已有房间。运行 node --test catan-card-selection-test.js 与 node catan-give-choice-ui-test.js，检查准确数量、取消不扣牌、一次提交、旧存档、隐私及暂停／断线／重连失效。

卡坦图标闪烁修复：同步部署新增 `catan-render.js`，以及 `catan.html`、`catan.js`、`catan-board.js`、`catan-cities-ui.js`。Catan 页面在 Lucide 后先加载增量渲染工具；棋盘基础层与城市覆盖层独立保留，手牌、按钮、玩家栏、银行及选牌界面只更新变化的节点。运行 `npm run test:catan-render`，检查桌面与 320px 手机上掷骰、升级、交易、出牌、骑士移动及聊天时图标不重挂、不出现空白帧，数量、骰面、高亮与合法操作及时更新。并运行城市、组合模式及整批选牌浏览器回归。本次不改变游戏规则、后端协议或存档格式。

卡坦完整得分明细：同步部署新增 `catan-score.js` 和 `catan.html`、`catan.js`、`catan.css`。所有玩家的分数旁都有明细入口，基础版、航海家各剧本、城市与骑士和组合模式均按真实来源逐项计分。建筑从棋盘实际等级统计，都会的城市基础分与额外分分开，收复海盗要塞不重复加分；同时覆盖商人、最长道路／商路、最大骑士团、登岛、部落、布匹、保卫卡坦及可见胜利点卡。对手隐藏胜利点卡在结束前不显示。运行 `npm run test:catan-score`，检查分项合计、棋子库存与实际建筑的区别、公开／隐藏／结束公开、实时更新、桌面和手机滚动及无操作副作用。本次不改变计分规则或存档格式。

赛后骰子分布区分炼金术：同步部署 `catan-engine.js`、`catan-stats.js`、`catan-stats-ui.js`、`catan-stats.css` 与对应测试。城市与骑士及组合模式显示「全部掷骰（含炼金术）」和「随机掷骰（不含炼金术）」两图，各用自己的样本数计算理论次数及百分比；普通模式保留一图。统计 v3 新增随机、炼金术、未知来源计数，来源总和须等于全部次数。旧城市历史无法准确拆分，标为来源未记录；后续掷骰可以继续分类，旧基础版／纯航海可归随机。存档保持原格式并保留新计数。需同步更新后端，服务重启前先保存现有对局；仅更新页面无法新增来源记录。运行 `node --test catan-stats-test.js room-archive-test.js` 与 `node catan-stats-ui-test.js`，检查混合／全炼金术／零次、旧记录、随机数调用不变、赛后隐私、存档恢复、桌面及手机布局。

骑士移除原因与商品总数：同步部署 `catan-cities.js`、`catan-cities-ui.js`。叛变的移除提示显示出牌者、被指定玩家、需移除的 1 名骑士及替代骑士效果；公开原因从已有队列字段生成，旧存档无需转换。纸、布、币说明均标注全场开局各 12 张，不表示银行剩余库存。运行 `node --test catan-cities-test.js` 和 `node catan-choice-info-ui-test.js`，检查双方视角、旧队列、操作及手机布局。

骑士驱逐说明：同步更新 `catan-cities-data.js`，规则书与骑士说明共用同一组中英文要点，分别写明连续路线、等级对应（2→1、3→1/2）、移动入口的操作步骤、对手迁移及无空位移除；组合模式自动补充船。运行 `node catan-cities-ui-test.js` 检查说明滚动、手机边界及原有移动操作。

城市右侧图形选择：同步更新 `catan-cities-ui.js` 和 `catan-cities.css`。炼金术分别选择黄／红骰；防守奖励、对手、替代骑士等级、商船队、垄断、商业港发起交换和主动弃进步卡都使用图形选项、可编辑预览及一次确认。原有婚礼／破坏等整批选牌继续复用，棋盘上的移动／晋升保留直接选择及明确的完成／取消按钮。只提交已有合法 `ck` 键，不新增后端协议；暂停、断线、座位或回合版本变化使草稿失效，关闭说明不提交。运行 `npm run test:catan-choices`，检查 11 类选择在城市／组合模式、桌面／手机、聊天保持与状态失效，以及原有进步卡和整批选牌流程。
