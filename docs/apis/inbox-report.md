# Inbox Report API

收件箱报告管理

## Base URL

`/api/v1/inbox/reports`

## Endpoints

### List Reports - 获取报告列表

```http
GET /api/v1/inbox/reports
```

**查询参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | 否 | 指定日期（YYYY-MM-DD） |
| startDate | string | 否 | 开始日期 |
| endDate | string | 否 | 结束日期 |
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 20） |
| sortBy | string | 否 | 排序字段：`date` \| `createdAt` |
| order | string | 否 | 排序方向：`asc` \| `desc` |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "items": [
      {
        "inboxReportId": "ir_xxx",
        "date": "2024-01-01",
        "summary": "今日共处理 10 条笔记...",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### Get Report - 获取单个报告

```http
GET /api/v1/inbox/reports/:reportId
```

**参数**

| 字段 | 类型 | 说明 |
|------|------|------|
| reportId | string | 报告ID |

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "inboxReportId": "ir_xxx",
    "uid": "user_xxx",
    "date": "2024-01-01",
    "content": "...",
    "summary": "...",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

---

### Generate Report - 生成报告

```http
POST /api/v1/inbox/reports/generate
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | 是 | 日期（YYYY-MM-DD） |
| timezone | string | 否 | 时区（如 `Asia/Shanghai`） |
| async | boolean | 否 | 是否异步执行（默认 false） |

**响应示例（同步）**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "inboxReportId": "ir_xxx",
    "date": "2024-01-01",
    "content": "...",
    "summary": "...",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**响应示例（已存在）**

```json
{
  "code": 409,
  "msg": "Report already exists for this date",
  "data": {
    "inboxReportId": "ir_xxx",
    "date": "2024-01-01"
  }
}
```
