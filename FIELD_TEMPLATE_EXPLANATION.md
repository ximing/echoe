# Echoe 字段名（Field Key）的作用详解

## 核心概念

在 Echoe（基于 Anki）中，卡片的显示是通过 **模板系统** 实现的：

```
Note (笔记) → Template (模板) → Card (卡片)
```

**字段名（Field Key）** 是连接笔记数据和模板的桥梁。

---

## 完整示例：英语单词卡片

### 1. Notetype（笔记类型）定义

```json
{
  "name": "Basic (English Vocabulary)",
  "type": 0,  // 0=标准卡片, 1=完形填空

  // 字段定义 (flds)
  "flds": [
    {"name": "Word", "ord": 0},      // 字段名: Word
    {"name": "Phonetic", "ord": 1},  // 字段名: Phonetic
    {"name": "Audio", "ord": 2},     // 字段名: Audio
    {"name": "Meaning", "ord": 3}    // 字段名: Meaning
  ],

  // 模板定义 (tmpls)
  "tmpls": [
    {
      "name": "Card 1",
      "qfmt": "<h1>{{Word}}</h1>\n<p>{{Phonetic}}</p>\n{{Audio}}",  // 正面模板
      "afmt": "{{FrontSide}}\n<hr>\n<p>{{Meaning}}</p>"              // 背面模板
    }
  ]
}
```

### 2. Note（笔记）数据

```json
// echoe_notes 表
{
  "note_id": "note_abc123",
  "mid": "notetype_xyz789",  // 关联到上面的 Notetype

  // 字段值存储
  "fields_json": {
    "Word": "unload",                                    // ← 字段名作为 key
    "Phonetic": "[ˌʌnˈləʊd]",
    "Audio": "[sound:1774112293511-40370bff.mp3]",      // ← 字段名作为 key
    "Meaning": "v. 卸货；卸下；倾销"
  }
}
```

### 3. 模板渲染过程

#### **步骤 1：获取模板**
```javascript
// 从 notetype 获取模板
const template = {
  qfmt: "<h1>{{Word}}</h1>\n<p>{{Phonetic}}</p>\n{{Audio}}"
};
```

#### **步骤 2：获取字段数据**
```javascript
// 从 note 获取字段值
const fieldMap = {
  "Word": "unload",
  "Phonetic": "[ˌʌnˈləʊd]",
  "Audio": "[sound:1774112293511-40370bff.mp3]",
  "Meaning": "v. 卸货；卸下；倾销"
};
```

#### **步骤 3：替换模板变量**
```javascript
// renderTemplate 函数
function renderTemplate(template, fieldMap) {
  let result = template;

  // 遍历字段，替换 {{FieldName}}
  for (const [key, value] of Object.entries(fieldMap)) {
    // 关键：用字段名匹配模板中的占位符
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return result;
}

// 执行替换
renderTemplate(template.qfmt, fieldMap);

// 替换过程：
// 1. {{Word}} → "unload"
// 2. {{Phonetic}} → "[ˌʌnˈləʊd]"
// 3. {{Audio}} → "[sound:1774112293511-40370bff.mp3]"
```

#### **步骤 4：最终渲染结果**
```html
<!-- card.front -->
<h1>unload</h1>
<p>[ˌʌnˈləʊd]</p>
[sound:1774112293511-40370bff.mp3]
```

#### **步骤 5：前端进一步处理**
```javascript
// 前端 processAudio() 函数
const finalHtml = processAudio(card.front);

// 结果：
<h1>unload</h1>
<p>[ˌʌnˈləʊd]</p>
<audio class="cards-audio" src="/api/v1/media/1774112293511-40370bff.mp3" controls></audio>
```

---

## 字段名的关键作用

### 1. **模板占位符匹配**

```
模板：{{Word}} {{Audio}}
       ↓         ↓
字段：Word      Audio
       ↓         ↓
值：  unload    [sound:xxx.mp3]
```

**如果字段名不匹配，模板就无法正确渲染！**

### 2. **多模板支持**

同一个笔记可以生成多张卡片：

```json
{
  "tmpls": [
    {
      "name": "Recognition (认知)",
      "qfmt": "{{Word}}\n{{Audio}}",           // 显示单词和音频
      "afmt": "{{FrontSide}}<hr>{{Meaning}}"   // 背面显示意思
    },
    {
      "name": "Production (产出)",
      "qfmt": "{{Meaning}}",                   // 只显示意思
      "afmt": "{{FrontSide}}<hr>{{Word}}\n{{Phonetic}}\n{{Audio}}"  // 背面显示单词
    }
  ]
}
```

**同一个 Note，不同的模板，生成不同的 Card！**

### 3. **字段重用**

```json
// 一个笔记
{
  "fields_json": {
    "Word": "unload",
    "Audio": "[sound:xxx.mp3]",
    "Meaning": "卸货"
  }
}

// 可以被多个模板使用
Template 1: "{{Word}} - {{Meaning}}"  → "unload - 卸货"
Template 2: "{{Word}} {{Audio}}"      → "unload [sound:xxx.mp3]"
Template 3: "{{Meaning}}"             → "卸货"
```

### 4. **类型安全和验证**

```typescript
// 字段定义
interface EnglishVocabularyFields {
  Word: string;
  Phonetic: string;
  Audio: string;
  Meaning: string;
}

// 模板可以引用这些字段
const template = "{{Word}} - {{Meaning}}";  // ✅ 正确
const template = "{{Word}} - {{Definition}}";  // ❌ 错误：字段不存在
```

---

## 实际应用场景

### 场景 1：导入 Anki 卡片

```
Anki .apkg 文件
├── collection.anki2
│   ├── notetypes 表
│   │   └── flds: [{"name": "Word"}, {"name": "Audio"}]  ← 定义字段名
│   ├── notes 表
│   │   └── flds: "unload\x1f[sound:audio.mp3]"          ← 字段值（按顺序）
│   └── cards 表
│       └── 引用 notetype 的模板
└── media/
    └── audio.mp3

导入后 → Echoe
echoe_notetypes:
  flds: [{"name": "Word"}, {"name": "Audio"}]

echoe_notes:
  fields_json: {
    "Word": "unload",           ← 根据字段定义生成 key
    "Audio": "[sound:xxx.mp3]"  ← 根据字段定义生成 key
  }
```

### 场景 2：创建新卡片

```javascript
// 用户通过表单创建卡片
const formData = {
  noteType: "Basic (English Vocabulary)",
  fields: {
    Word: "hello",                    // ← 表单字段名对应 Notetype 定义
    Phonetic: "[həˈləʊ]",
    Audio: "[sound:hello.mp3]",
    Meaning: "你好"
  }
};

// 保存到数据库
await db.insert(echoeNotes).values({
  mid: noteTypeId,
  fields_json: formData.fields  // 直接使用字段名作为 key
});
```

### 场景 3：学习时渲染

```javascript
// 获取卡片
const card = await getCard(cardId);
const note = await getNote(card.nid);
const noteType = await getNoteType(note.mid);

// 渲染
const template = noteType.tmpls[card.ord];
const fieldMap = note.fields_json;  // { Word: "unload", Audio: "[sound:xxx.mp3]" }

// 模板替换
let html = template.qfmt;  // "<h1>{{Word}}</h1> {{Audio}}"
for (const [key, value] of Object.entries(fieldMap)) {
  html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
}
// 结果: "<h1>unload</h1> [sound:xxx.mp3]"
```

---

## 为什么不直接存储渲染后的 HTML？

### 方案对比

#### ❌ 直接存储 HTML（不灵活）
```json
{
  "front_html": "<h1>unload</h1><audio src='/media/xxx.mp3'></audio>",
  "back_html": "<h1>unload</h1><hr><p>卸货</p>"
}
```

**缺点：**
- 无法修改模板样式
- 无法复用字段数据
- 无法生成多种卡片类型
- 存储冗余

#### ✅ 字段 + 模板（灵活）
```json
// 数据（可复用）
{
  "fields_json": {
    "Word": "unload",
    "Audio": "[sound:xxx.mp3]",
    "Meaning": "卸货"
  }
}

// 模板（可修改）
{
  "qfmt": "<h1>{{Word}}</h1> {{Audio}}",
  "afmt": "{{FrontSide}}<hr>{{Meaning}}"
}
```

**优点：**
- 数据与展示分离
- 一份数据，多种展示
- 修改模板不影响数据
- 支持主题切换

---

## 总结

### 字段名的三大作用

1. **模板变量占位符**
   - 模板中的 `{{FieldName}}` 需要与字段名精确匹配

2. **数据索引键**
   - `fields_json` 使用字段名作为 key 存储值

3. **类型定义标识**
   - 定义笔记类型包含哪些字段

### 数据流

```
Notetype 定义字段名
    ↓
Note 使用字段名存储值
    ↓
Template 使用字段名引用值
    ↓
渲染时替换 {{FieldName}}
    ↓
生成最终 HTML
```

### 关键代码

```typescript
// echoe-study.service.ts:1191-1193
for (const [key, value] of Object.entries(fields)) {
  result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
}
```

这就是为什么 `fields_json` 中的 key（如 `Word`、`Audio`）如此重要——它们是连接数据和模板的桥梁！🎯
