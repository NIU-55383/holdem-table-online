# GitHub 上传清单

将这个文件夹内的全部文件上传到现有仓库的根目录，覆盖同名文件。

## 运行与部署文件（48 个）

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
| `club.js` | 大厅岛屿预览 |
| `catan.html` | 卡坦岛页面与基础版双语规则弹窗 |
| `catan.css` | 卡坦岛电脑/手机样式 |
| `catan.js` | 卡坦岛交互、选座与换座确认 |
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
- `seafarers-test.js`：航海家地图、规则与 40 局完整机器人测试。
- `seafarers-expansion-test.js`：新增：四张新地图、800 次随机生成、探索与奖励、32 局机器人对战、联机隐藏信息与重开测试。
- `seafarers-ui-test.js`：基础版规则弹窗与航海家手机/桌面操作测试。
- `avatar-test.js`：头像校验、同步、重连与可选浏览器测试。
- `social-test.js`：新增：五个游戏的房间隔离、互动权限、重连与皮肤同步测试。
- `social-ui-test.js`：新增：五个游戏双浏览器互动、手机气泡、皮肤预览与头像编辑回归。
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

本次完整包共 66 个文件，包含此前各轮更新。`vendor` 是必须上传的运行目录，不能省略，也不要把里面的文件移动到根目录。提交后需要 Render 重新部署服务器，单独刷新旧服务器页面不会启用新地图、皮肤及全游戏头像互动。

道路卡撤回更新：在第一条道路或第一艘船放下前可以取消，归还原卡并恢复发展卡使用机会，基础版和航海家都生效，手机版仍可切换道路/船。若此前完整包已上传，运行文件覆盖 `catan-engine.js`、`catan.js`、`catan.css`；同时同步 `catan-test.js`、`seafarers-test.js`、`seafarers-expansion-test.js`、`ui-test.js`、`seafarers-ui-test.js`、`README.md` 和本清单。需要 Render 重新部署后才能使用。

## 本次航海家更新

如果上一版 60 文件包已完整上传，新增 `catan-random.js` 和 `seafarers-expansion-test.js`；覆盖 `catan-maps.js`、`catan-engine.js`、`catan-server.js`、`catan.html`、`catan.css`、`catan.js`、`catan-board.js`、`catan-art.svg`、`server.js`、`package.json`、`seafarers-test.js`、`seafarers-ui-test.js`、`README.md` 和本清单。

新图为未知海域1/2与穿越荒漠1/2，八张地图均可选择默认或随机。需要等待 Render 部署成功并新建房间；旧进程中的牌局不会自动升级。已有 GitHub 仓库和 Render 服务继续使用，不需重新建服务。不确定之前上传到了哪一版时，用完整包覆盖即可。

## 之前版本记录

如果之前 49 文件版本已经完整上传，升级五游戏版本需要新增 `richman` 开头的 10 个文件和 `RICHMAN-RULES.md`，覆盖 `index.html`、`club.css`、`server.js`、`package.json`、`duel-ui-test.js`，以及下述本轮更新文件。不确定之前上传到了哪一版时，使用完整包覆盖即可。

本轮卡坦岛玩家表更新：基础版和航海家新增最长连续路线列；航海家在资源卡左侧新增登岛奖励分。如果上一个 60 文件版本已经完整上传，运行文件只需覆盖 `catan.html`、`catan.css`、`catan.js`。另同步 `catan-test.js`、`seafarers-test.js`、`seafarers-ui-test.js`、`ui-test.js`、`README.md`、`UPLOAD-CHECKLIST.md`。本轮未修改服务器规则，不需要新建服务或房间；本地页面刷新即可加载新列，线上需等待部署更新。

初始建村庄修复：离开旧房间后清理操作状态，新房间或新座位不再沿用旧阶段缓存，读完规则后可直接建设，无需为了操作再刷新。如果已经上传上述玩家表版本，运行文件仅需再次覆盖 `catan.js`，同时同步 `seafarers-ui-test.js`、`README.md` 和本清单。本地只需刷新一次加载修复后的脚本，不必重启服务器。

此前金矿资源点选更新：金矿领取不再输入数字，改为资源图标添加、已选卡牌移除、选够后确认；交易、弃牌和其他发展卡操作保持原样。已包含在本次完整包中。
