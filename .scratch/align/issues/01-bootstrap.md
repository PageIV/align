# 01 — 仓库起步

Status: resolved
Resolved in: bf18930
Blocked by: 无
Type: task

## 目标

让这个目录变成一个能开工的仓库：有 git 历史、有跑测试的方式、有最基本的说明。现在它是一个空目录加上几份文档，没有 `.git`，`implement-spec` 想要的分支和 worktree 都无从谈起。

## 交付

- `git init`，加 `.gitignore`（忽略 `node_modules/`、`.DS_Store`、`.align/local/`）
- 一个 `package.json`：`"type": "module"`，`"test": "node --test"`，无依赖
- `README.md`：这个插件干什么（一句话）、当前状态（探针阶段）、怎么开发（marketplace 符号链接 + 重启 app）

## 验收标准

1. `git log` 有提交，工作区干净。
2. `npm test` 在没有任何测试的情况下也能正常退出（用 `--test` 的空集行为），后面加测试不用改脚本。
3. `README.md` 里写清了"面板资源被宿主缓存，改完要重启 app"这一条——这是开发时最容易踩的坑。

## 上下文指针

- `.scratch/align/spec.md` 的"本 repo 的开发回路"
