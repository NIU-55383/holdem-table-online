# GitHub 上传清单

将这个文件夹内的全部文件上传到现有仓库的根目录，覆盖同名文件。

## 运行与部署文件（50 个）

| 文件 | 用途 |
| --- | --- |
| `index.html` | 桌游大厅与原德扑页面 |
| `app.js` | 德扑单机与概率计算 |
| `online.js` | 德扑联机和回放 |
| `styles.css` | 德扑样式 |
| `club.css` | 新桌游大厅样式 |
| `game-ui.js` | 各游戏共用的头像和在线状态标记 |
| `game-ui.css` | 头像选择器、头像显示、状态点位置与颜色 |
| `avatar-data.js` | 浏览器与服务器共用的头像校验和机器人头像分配，必须上传 |
| `social-data.js` | 新增：共用互动表情、恶魔与海盗皮肤白名单，必须上传 |
| `game-social.js` | 新增：各游戏服务器的头像互动身份、校验与频率限制，必须上传 |
| `room-control.js` | 新增：五游戏共享房主转让、断线接任、暂停补位与托管提醒，必须上传 |
| `club.js` | 大厅岛屿预览 |
| `catan.html` | 卡坦岛页面与基础版双语规则弹窗 |
| `catan.css` | 卡坦岛电脑/手机样式 |
| `catan.js` | 卡坦岛交互、选座与换座确认 |
| `catan-audio.js` | 本地合成音效、音效开关记忆与事件去重，必须上传 |
| `catan-board.js` | 六角棋盘和棋子渲染 |
| `catan-art.svg` | 地形、资源、建筑图案 |
| `catan-engine.js` | 服务器卡坦岛规则与机器人 |
| `catan-maps.js` | 航海家八张地图、分区和默认/随机双语规则 |
| `catan-random.js` | 新增：各剧本随机地图约束执行器，服务器必需 |
| `catan-server.js` | 卡坦岛房间、座位权限、换座协商、重连与消息 |
| `duel.html` | 五子棋与中国象棋共用的双语对战页面 |
| `duel.css` | 棋类桌面/手机样式 |
| `duel.js` | 选难度、执子、联机、聊天与重连 |
| `duel-board.js` | 五子棋与象棋棋盘、落点及棋子 |
| `duel-art.svg` | 大厅棋类缩略图 |
| `duel-engine.js` | 两种棋的走法、胜负、悔棋与公开棋盘 |
| `duel-ai.js` | 限时后台搜索线程，三级 AI |
| `duel-server.js` | 两人房间、准备、悔棋申请、换边与消息 |
| `gomoku-adapter.js` | 五子棋开源引擎适配 |
| `richman.html` | 大富翁晴湾页面、创建与加入房间 |
| `richman.css` | 大富翁手机/桌面布局、卡片和弹窗 |
| `richman.js` | 掷骰、地图手势、金融面板、卡片、聊天和规则 |
| `richman-board.js` | 原创等距小镇、房屋、神明与角色渲染 |
| `richman-art.svg` | 原创房屋、设施、神明和大厅缩略图 |
| `richman-data.js` | 神明、卡片、地图、股票名称及双语规则数据 |
| `richman-engine.js` | 大富翁规则、股票、彩票、结算和机器人 |
| `richman-server.js` | 大富翁联机房间、隐藏信息、托管和重连 |
| `vendor/xiangqi.cjs` | 固定版本象棋规则库，必须保留子目录 |
| `vendor/xiangqi-LICENSE.txt` | 象棋库许可证 |
| `vendor/gomoku.js` | 固定版本五子棋胜负与搜索引擎 |
| `vendor/gomoku-README.md` | 原作者的 MIT 声明与项目说明 |
| `vendor/lucide.min.js` | 离线图标库 |
| `vendor/lucide-LICENSE.txt` | 图标许可证 |
| `server.js` | 所有游戏共同服务器，增加大富翁 `/richman-ws` |
| `package.json` | 依赖与启动命令，必须更新 |
| `pnpm-lock.yaml` | 固定开发安装依赖 |
| `render.yaml` | 沿用现有 Render 服务 |
| `.gitignore` | 排除本地依赖、测试图片与发布包 |

## 一并上传

- `AGENTS.md`：后续新增游戏需要遵循的共享界面规范。
- `integration-test.js`：德扑回归测试。
- `catan-test.js`：卡坦岛规则和联机测试。
- `catan-audio-test.js`：动作音效事件、隐私、交易接收对象与重复状态测试。
- `catan-feedback-ui-test.js`：交易提醒、音效开关、手机布局、双人联机与音频渲染检查。
- `seafarers-test.js`：航海家地图、规则与 40 局完整机器人测试。
- `seafarers-expansion-test.js`：新增：四张新地图、800 次随机生成、探索与奖励、32 局机器人对战、联机隐藏信息与重开测试。
- `seafarers-ui-test.js`：基础版规则弹窗与航海家手机/桌面操作测试。
- `avatar-test.js`：头像校验、同步、重连与可选浏览器测试。
- `social-test.js`：新增：五个游戏的房间隔离、互动权限、重连与皮肤同步测试。
- `social-ui-test.js`：新增：五个游戏双浏览器互动、手机气泡、皮肤预览与头像编辑回归。
- `room-control-test.js`：新增：五游戏房主管理、断线接任、空位暂停、重新加入补位与托管的服务端测试。
- `room-control-ui-test.js`：新增：五游戏双浏览器管理操作、移除后通过原表单重新加入、手机弹窗与倒计时测试。
- `ui-test.js`：可选浏览器测试。
- `duel-test.js`：五子棋、象棋、AI 与联机规则测试。
- `duel-ui-test.js`：棋类手机/桌面和双浏览器测试。
- `richman-test.js`：大富翁规则、机器人完整对局和联机测试。
- `richman-ui-test.js`：大富翁手机、双指缩放与双浏览器测试。
- `RICHMAN-RULES.md`：大富翁参考规则、本馆数值及改编范围。
- `THIRD-PARTY.md`：新增开源组件来源、固定版本和许可说明。
- `README.md`：运行和部署说明。
- `UPLOAD-CHECKLIST.md`：本清单。

不要上传 `node_modules`、`.pnpm-store`、`release` 或 `test-results`。这些均不在发布包中。

Render 的构建命令仍用 `npm install`，启动命令用 `npm start`。不用新建仓库，不用改服务名。

本次完整包共 72 个文件，包含此前各轮更新。`vendor` 是必须上传的运行目录，不能省略，也不要把里面的文件移动到根目录。提交后需要 Render 重新部署服务器，单独刷新旧服务器页面不会启用新地图、皮肤、头像互动、房间管理和动作音效。

## 本次更新

超时托管改为个人主动选择，默认关闭：覆盖 `room-control.js`、`game-ui.js`、`game-ui.css`、`catan-server.js`、`richman-server.js`、`richman.js`、`server.js`，同步 `room-control-test.js`、`room-control-ui-test.js`、`AGENTS.md`、`README.md` 与本清单。五游戏房间管理增加个人超时托管复选框和主动托管按钮；只有本人勾选后才启用 120 秒期限及最后 20 秒提醒，房主不能代开，替换者不继承。未开启托管时，断线或离开不再自动接管或弃牌。完整包仍为 72 个文件；此修改包含服务端逻辑，必须重新部署并重新开房，旧服务器只刷新页面不会生效。

五游戏移除真人／机器人统一双重确认：覆盖 `game-ui.js`、`game-ui.css`、`catan.js`、`online.js`、`richman.js`、`catan-server.js`、`server.js` 和 `richman-server.js`，同步 `room-control-test.js`、`room-control-ui-test.js`、`AGENTS.md`、`README.md` 和本清单。开局后通过房间管理可移除机器人，仍保留资产、暂停等待补位；等待室原有移除机器人入口也有两步确认，任一步可取消，并防止旧确认误删替换者。此次没有加入未获授权的商业 BGM，原有本地音效与开关保持不变。完整包仍为 72 个文件，需要重新部署服务。

卡坦岛交易提醒与音效：新增 `catan-audio.js`，覆盖 `catan.html`、`catan.css`、`catan.js`、`catan-engine.js`；同步 `catan-audio-test.js`、`catan-feedback-ui-test.js`、`package.json`、`README.md` 和本清单。新增面向接收者的醒目交易提示、16 种本地合成短音效，以及右上角带记忆的喇叭开关。没有语音或文字播报，不依赖外部音频服务器。动作声音需要新版服务器确认事件，因此要重新部署；请先结束旧对局再更新。

此前卡坦岛规则与资源操作更新也已包含：规则全部改为手动打开，进房、切地图和重连不再弹出；丰收、垄断与金矿统一使用图标添加、已选卡牌移除，不再填写资源数量；银行库存默认展开。

此前卡坦岛胜利目标标注：地图上沿右侧新增金色奖杯与双语目标分数，基础版及全部航海地图均适用，已包含在完整包中。

五个游戏都支持双方确认转让房主、按号位顺时针自动接任、开局后移除玩家并暂停、真人或机器人补位。120 秒超时托管默认关闭，仅本人主动选择后才计时并在最后 20 秒提醒。被移出者仍可重新输入房间号加入有空位的房间，不是永久封禁；全部空位补齐后沿用原棋局与资产继续。

如果上一版 66 文件包已经完整上传，新增 `room-control.js`、`room-control-test.js`、`room-control-ui-test.js`；覆盖 `server.js`、`catan-server.js`、`duel-server.js`、`richman-server.js`、`game-ui.js`、`game-ui.css`、`game-social.js`、`catan.js`、`online.js`、`duel.js`、`richman.js`、`catan.html`、`index.html`、`seafarers-ui-test.js`、`package.json`、`AGENTS.md`、`README.md` 和本清单。保留 `vendor/lucide.min.js`。需要重新部署服务器；更新会清空旧房间，请先结束正在玩的对局。不确定之前上传到了哪版时直接使用完整包覆盖。

加载与同步优化（不改变当前外观）：卡坦岛直接使用页面内嵌的原有 SVG 图案，减少图形文件请求失败导致资源卡、建筑和棋子消失的问题；棋盘无变化的聊天和在线状态同步不再重建棋盘，卡坦岛大状态消息启用 WebSocket 压缩。运行文件必须一起更新 `catan.html`、`catan-board.js`、`catan.js`、`game-ui.js`、`catan-server.js`，保留 `catan-art.svg`；测试与说明同步 `ui-test.js`、`catan-test.js`、`README.md` 和本清单。需要重新部署服务器；这不会自动修改已经在线的 Render 网站。

手机规则弹窗修复也包含在包内：基础规则、航海规则和全部地图规则随手机屏幕宽高调整，文字换行、正文独立滚动、关闭和已阅读按钮固定可见。相关运行文件为 `catan.css` 和 `catan.html`，测试为 `seafarers-ui-test.js`。若没有上传上一轮修复，这些文件也必须更新。不确定之前上传到了哪一版时，直接用本次完整包覆盖。

道路卡撤回更新：在第一条道路或第一艘船放下前可以取消，归还原卡并恢复发展卡使用机会，基础版和航海家都生效，手机版仍可切换道路/船。若此前完整包已上传，运行文件覆盖 `catan-engine.js`、`catan.js`、`catan.css`；同时同步 `catan-test.js`、`seafarers-test.js`、`seafarers-expansion-test.js`、`ui-test.js`、`seafarers-ui-test.js`、`README.md` 和本清单。需要 Render 重新部署后才能使用。

## 本次航海家更新

如果上一版 60 文件包已完整上传，新增 `catan-random.js` 和 `seafarers-expansion-test.js`；覆盖 `catan-maps.js`、`catan-engine.js`、`catan-server.js`、`catan.html`、`catan.css`、`catan.js`、`catan-board.js`、`catan-art.svg`、`server.js`、`package.json`、`seafarers-test.js`、`seafarers-ui-test.js`、`README.md` 和本清单。

新图为未知海域1/2与穿越荒漠1/2，八张地图均可选择默认或随机。需要等待 Render 部署成功并新建房间；旧进程中的牌局不会自动升级。已有 GitHub 仓库和 Render 服务继续使用，不需重新建服务。不确定之前上传到了哪一版时，用完整包覆盖即可。

## 之前版本记录

如果之前 49 文件版本已经完整上传，升级五游戏版本需要新增 `richman` 开头的 10 个文件和 `RICHMAN-RULES.md`，覆盖 `index.html`、`club.css`、`server.js`、`package.json`、`duel-ui-test.js`，以及下述本轮更新文件。不确定之前上传到了哪一版时，使用完整包覆盖即可。

本轮卡坦岛玩家表更新：基础版和航海家新增最长连续路线列；航海家在资源卡左侧新增登岛奖励分。如果上一个 60 文件版本已经完整上传，运行文件只需覆盖 `catan.html`、`catan.css`、`catan.js`。另同步 `catan-test.js`、`seafarers-test.js`、`seafarers-ui-test.js`、`ui-test.js`、`README.md`、`UPLOAD-CHECKLIST.md`。本轮未修改服务器规则，不需要新建服务或房间；本地页面刷新即可加载新列，线上需等待部署更新。

初始建村庄修复：离开旧房间后清理操作状态，新房间或新座位不再沿用旧阶段缓存，读完规则后可直接建设，无需为了操作再刷新。如果已经上传上述玩家表版本，运行文件仅需再次覆盖 `catan.js`，同时同步 `seafarers-ui-test.js`、`README.md` 和本清单。本地只需刷新一次加载修复后的脚本，不必重启服务器。

此前金矿资源点选更新已包含在完整包中；本次继续将同样的点牌操作应用到丰收和垄断，交易与弃牌保持原样。
