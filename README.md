# osheeep-wx

Osheeep 的原生微信小程序客户端。后端继续使用同级目录中的 `osheeep-server`。

## 本地验证

```bash
npm install
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
```

使用微信开发者工具导入仓库根目录。公共配置使用 `touristappid`；个人 AppID 请写入不会提交的 `project.private.config.json`。
