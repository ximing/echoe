# Amend 模板

> 使用说明：当需要对现有 ADR 进行小幅修订（不改变核心决策）时，使用此模板格式。

---

## Amend 适用场景

- 补充新的证据路径
- 增加新的 Guardrails 检查项
- 澄清模糊的描述
- 更新 Impact 分析
- 修正错别字或格式问题

---

## Amend 流程

### Step 1：识别修订内容
确认修订不会改变核心决策。如果核心决策需要改变，应使用 Supersede 流程。

### Step 2：直接修改 ADR
1. 打开目标 ADR 文件
2. 进行修订
3. 在 Change Log 中添加一条记录
4. **Status 保持不变**

### Step 3：更新索引（如有必要）
如果标题或描述需要更新，在索引表中同步修改。

---

## Change Log 记录示例

```markdown
## Change Log
| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2024-01-20 | 1.1 | 补充 Evidence 路径，增加测试文件引用 | - |
| 2024-01-10 | 1.0 | 初始创建 | - |
```

---

## Amend vs Supersede 判断

| 维度 | Amend | Supersede |
|------|-------|-----------|
| 核心决策是否改变 | 否 | 是 |
| Status 是否改变 | 否 | 旧 → `Superseded`，新 → `Accepted` |
| 是否需要新 ADR-ID | 否 | 是 |
| Change Log | 增加一条记录 | 增加一条记录 + 互相引用 |
