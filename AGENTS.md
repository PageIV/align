## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/` in this repo. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

<!-- align:begin -->
## 已确认前提（由 align 维护，勿手改）

- [C-001] error-correction：宿主跑的是物化后的缓存副本，不是源码目录；版本号不变时重启不会重装。开发回路是：改码 → 提升 version → codex plugin add → 重启 app。
- [C-002] concept-alignment：线程层落地是一次性附着：内容随下一条用户消息进入对话，之后靠对话历史承重，压缩即失效。唯一每轮自动生效的是项目层。
- [C-003] concept-alignment：我认为 Codex 比 Claude Code 好用
<!-- align:end -->
