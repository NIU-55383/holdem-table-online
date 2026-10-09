# 网站部署检查表

当前仓库包含五款游戏：德州扑克、卡坦岛（基础版及航海家十三张地图）、桥牌、五子棋、中国象棋。代码直接维护在本 GitHub 仓库，不再通过解压上传包更新。

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

统一规则页需要同时保留 `game-rules.js`、`game-rules.css`、`game-rules-data.js` 和四个页面 `index.html`、`duel.html`、`bridge.html`、`catan.html`。检查德州、桥牌、五子棋、象棋及卡坦岛的规则入口，手机能滚动至末尾。桥牌服务器还需要 `bridge-bot.js`，不要漏掉新增文件。

桥牌教学需要新增的 `bridge-lesson.js`（服务器）、`bridge-lesson-ui.js`、`bridge-lesson.css`，以及修改后的 `bridge-server.js`、`bridge.js`、`bridge.html` 一起部署。检查“新手教学”能从图文介绍进入叫牌，逐步出完 13 墩；机器人应等待“继续”，普通房间仍自动行动。此更新需要重启服务器，原有房间会清空。

若用 GitHub 网页上传，同样需要按清单删除旧文件。即使遗漏删除，新版服务器也会拒绝访问清单中的旧文件，且不再注册其联机接口。

## 部署设置

- Build Command：`npm install`
- Start Command：`npm start`
- 沿用已有 GitHub 仓库和 Render 服务，不必新建。
- 保持单实例运行；房间数据存在内存中。
- 棋类 AI 模型沿用已确认的朋友娱乐、不收费、不放广告用途，具体许可见 `AI-ENGINES.md` 和 `THIRD-PARTY.md`。

`retired-files.json` 和 `Remove-RetiredFiles.ps1` 仅用于移除旧文件，不包含被移除游戏的实现。当前功能及测试入口见 `README.md`。
