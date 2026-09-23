# 四款游戏完整上传包

本包共 106 个文件，包含当前最新版：德州扑克、卡坦岛（基础版及航海家十三张地图）、五子棋、中国象棋。不是回退旧版本；卡坦岛近期规则、提示、音效和地图改动，以及 Rapfi / Pikafish AI、共享头像互动和房主管理均保留。

大富翁的入口、联机服务、程序、图片、专用库、研究资料和测试已移除。

## 上传步骤

1. 将压缩包解压到 GitHub 仓库根目录，与原来的 `server.js`、`package.json` 同级，覆盖同名文件。不要多套一层目录。
2. 旧文件不会因为解压覆盖而自动消失。在仓库目录打开 PowerShell，执行下方清理命令。它只删除 `retired-files.json` 中列出的 35 个旧文件，不删除 `.git`、其他游戏或本地配置。也可以照清单手动删除。
3. 在 GitHub Desktop 检查修改和删除记录，Commit，然后 Push。
4. 等待 Render 重新部署成功，再刷新网页。服务器重启会清空正在进行的房间，先结束其他游戏的对局。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Remove-RetiredFiles.ps1
```

完整上传 `audio` 和 `vendor` 子目录，保留 `.gitattributes`。五子棋和象棋模型、拆分文件、源码与许可证都已包含；不要只上传根目录的网页文件。

若用 GitHub 网页上传，同样需要按清单删除旧文件。即使遗漏删除，新版服务器也会拒绝访问清单中的旧文件，且不再注册其联机接口。

## 部署设置

- Build Command：`npm install`
- Start Command：`npm start`
- 沿用已有 GitHub 仓库和 Render 服务，不必新建。
- 保持单实例运行；房间数据存在内存中。
- 棋类 AI 模型沿用已确认的朋友娱乐、不收费、不放广告用途，具体许可见 `AI-ENGINES.md` 和 `THIRD-PARTY.md`。

`retired-files.json` 和 `Remove-RetiredFiles.ps1` 仅用于移除旧文件，不包含被移除游戏的实现。当前功能及测试入口见 `README.md`。
