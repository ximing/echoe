# ADR 模板

> 使用说明：复制此模板，重命名为 `<ADR-ID>-<slug>.md`（如 `ENG-0002-database-id-generation.md`），然后填写各节。

---

# <ADR-ID>: <标题>

## 元信息
| 字段 | 值 |
|------|-----|
| Status | `Proposed` \| `Accepted` \| `Superseded` \| `Deprecated` |
| Date | YYYY-MM-DD |
| Decision Makers | 相关决策人 |
| Supersedes | 被替代的 ADR-ID（如有） |
| Superseded by | 替代本 ADR 的新 ADR-ID（如有） |

---

## Context（背景）
> 为什么需要这个决策？面临什么问题或约束？

<!-- 描述决策背景、触发因素、相关上下文 -->

---

## Decision（决策）
> 我们决定做什么？核心方案是什么？

<!-- 清晰陈述决策内容 -->

---

## Constraint / Source of Truth（约束或事实）
> 此决策产生的硬约束或业务事实

### 如果是 Constraint（工程约束）：
```
<constraint>
<!-- 用一句话概括硬性规则 -->
</constraint>
```

### 如果是 Source of Truth（业务事实）：
```
<fact>
<!-- 用一句话概括业务事实 -->
</fact>
```

---

## Evidence（证据）
> 证据路径：代码文件、配置、文档、PRD 等

| 证据类型 | 路径/位置 | 说明 |
|----------|-----------|------|
| 代码 | `path/to/file.ts` | 具体实现 |
| 配置 | `path/to/config` | 相关配置 |
| 文档 | `path/to/doc.md` | 相关文档 |

---

## Impact（影响）
> 此决策对技术设计和业务需求的影响

### Tech Design Impact
<!-- 对技术架构、代码实现、性能等方面的影响 -->

### PRD Impact
<!-- 对产品功能、用户体验、业务流程等方面的影响 -->

---

## Guardrails / Acceptance Checks（守卫/验收检查）
> 如何验证此决策被正确执行？

- [ ] 守卫项 1：<!-- 如：代码审查检查点 -->
- [ ] 守卫项 2：<!-- 如：自动化测试覆盖 -->
- [ ] 守卫项 3：<!-- 如：Lint 规则 -->

---

## Change Log（变更日志）
> 此 ADR 的演进历史

| Date | Version | Change | Author |
|------|---------|--------|--------|
| YYYY-MM-DD | 1.0 | 初始创建 | - |
| | | | |

---

## References（参考）
> 相关 ADR、文档、讨论链接

- 相关 ADR：`ARCH-xxxx`, `ENG-xxxx`
- 相关文档：链接或路径
