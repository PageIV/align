# ALIGNMENT

当前生效的已确认项。由 align 维护；失效条目保留在下方以便追溯。

## 生效中

### C-001 · error-correction · 2026-10-04
断言：宿主跑的是物化后的缓存副本，不是源码目录；版本号不变时重启不会重装。开发回路是：改码 → 提升 version → codex plugin add → 重启 app。
来源：2026-10-04
状态：active

### C-002 · concept-alignment · 2026-10-04
断言：线程层落地是一次性附着：内容随下一条用户消息进入对话，之后靠对话历史承重，压缩即失效。唯一每轮自动生效的是项目层。
来源：2026-10-04
状态：active

### C-004 · error-correction · 2026-10-05
断言：侧聊可以调用工具；「不调工具」是 align 主动加的纪律，不是宿主的能力限制。
来源：2026-10-05
状态：active

### C-005 · concept-alignment · 2026-10-05
断言：侧聊里可以渲染 elicitation 原生表单，落地 UI 可以放在侧聊。
来源：2026-10-05 · 侧聊 · probe_elicit 实测
状态：active

### C-006 · direction-correction · 2026-10-05
断言：钩子注入可以替代 AGENTS.md 受注块
来源：侧聊 · 2026-10-05 · 钩子真机验证
状态：active

### C-007 · detail-completion · 2026-10-05
断言：面板那条落地路径（align_review）退役，落地统一走 align_land 的原生表单。
来源：侧聊 · 2026-10-05
状态：active

### C-012 · concept-alignment · 2026-10-06
断言：align 的落地表单每条候选三项——写进账本、带回主线说一次、不落地；由用户逐条选，模型只给建议、不替用户定。整张表单都不想决定时按自带的 skip。
来源：主线 · 2026-10-06 · 表单三项（C-011 之后的准确版）
状态：active

### C-014 · concept-alignment · 2026-10-06
断言：align 有两种呼出方式：模型自己判断该弹（align 技能），以及用户手动命令（align-now 技能，从 `/` 的技能组里选）。
来源：主线 · 2026-10-06 · align-now 手动调起
状态：active

### C-016 · error-correction · 2026-10-07
断言：Codex 的 elicitation 表单**不给选择型字段预填 default**——初始化表单状态时直接跳过 string + enum/oneOf/anyOf 的字段，default 只对文本、布尔、数字生效。这是刻意的：选择型字段不该被静默接受。所以"默认停在建议上"不能靠 schema 实现，只能靠枚举顺序、条目描述里的"建议 X"、以及空值按建议处理这三件事。
来源：主线 · 2026-10-07 · 清掉 C-015 里的试手文字
状态：active

## 已失效

### C-015 · detail-completion · 2026-10-07
断言：Codex 的 elicitation 表单**不给选择型字段预填 default**——初始化表单状态时直接跳过 string + enum/oneOf/anyOf 的字段，default 只对文本、布尔、数字生效。这是刻意的：选择型字段不该被静默接受。所以"默认停在建议上"不能靠 schema 实现，只能靠枚举顺序、条目描述里的"建议 X"、以及空值按建议处理这三件事。随便添加几个字,测试修改
来源：账本面板 · 取代 C-011
状态：retired

### C-013 · detail-completion · 2026-10-06
断言：表单里没动过的那条按模型给的建议处理——不是当成不落地；想逐条丢掉就显式选 Ignore。
来源：主线 · 2026-10-06 · align-now 手动调起
状态：retired

### C-011 · error-correction · 2026-10-06
断言：Codex 的 elicitation 表单**不给选择型字段预填 default**——初始化表单状态时直接跳过 string + enum/oneOf/anyOf 的字段，default 只对文本、布尔、数字生效。这是刻意的：选择型字段不该被静默接受。所以"默认停在建议上"不能靠 schema 实现，只能靠枚举顺序、条目描述里的"建议 X"、以及空值按建议处理这三件事。
来源：主线 · 2026-10-06 · 查 app 代码 + 真机确认
状态：superseded by C-015

### C-003 · concept-alignment · 2026-10-04
断言：我认为 Codex 比 Claude Code 好用
来源：2026-10-04
状态：retired

### C-010 · concept-alignment · 2026-10-06
断言：align 的落地表单每条候选三个选项——Align（写进账本）、Restate（带回主线说一次）、Ignore（不落地）；默认停在模型给的建议上。整张表单都不想决定时按表单自带的 skip。
来源：主线 · 2026-10-06 · 加回 Ignore（其中"默认停在建议上"那句是错的，见 C-011）
状态：superseded by C-012

### C-009 · concept-alignment · 2026-10-06
断言：align 的落地表单每条候选只有两个选项——Align（写进账本）与 Restate（带回主线说一次）；一条都不想留时按表单自带的 skip，那是整张表单不提交。候选里不该有"不值得留"的东西。
来源：主线 · 2026-10-06 · 表单改成两项
状态：superseded by C-010

### C-008 · concept-alignment · 2026-10-06
断言：align 的落地表单每条候选只问「去哪」：落地、复述、不落地；分类由模型在背后给，用户不再选类型。
来源：侧聊 · 2026-10-06 · 验表单
状态：superseded by C-009
