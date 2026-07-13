# osheeep-wx

Osheeep 的原生微信小程序客户端。后端继续使用同级目录中的 `osheeep-server`。

完整的功能范围、启动方式、验收结果和上架准备事项见 [交接文档](docs/HANDOFF.md)。

## 本地验证

```bash
npm install
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
```

使用微信开发者工具导入仓库根目录。公共配置使用 `touristappid`；个人 AppID 请写入不会提交的 `project.private.config.json`。
