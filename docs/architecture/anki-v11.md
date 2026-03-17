# Anki Database Schema v11 — Semantics & Usage Reference

> **Version:** 002  
> **Schema version covered:** v11 (the universal compatibility baseline)  
> **Last validated:** February 2026  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Conventions](#2-conventions)
   - 2.1 [Timestamp Formats](#21-timestamp-formats)
   - 2.2 [Update Sequence Number (USN)](#22-update-sequence-number-usn)
   - 2.3 [ID Generation](#23-id-generation)
   - 2.4 [String Encoding](#24-string-encoding)
3. [Tables](#3-tables)
   - 3.1 [col — Collection](#31-col--collection)
   - 3.2 [notes — Notes](#32-notes--notes)
   - 3.3 [cards — Cards](#33-cards--cards)
   - 3.4 [revlog — Review Log](#34-revlog--review-log)
   - 3.5 [graves — Sync Tombstones](#35-graves--sync-tombstones)
   - 3.6 [Tags — Three Distinct Usages](#36-tags--three-distinct-usages)
4. [JSON Blobs in col](#4-json-blobs-in-col)
   - 4.1 [col.models — Notetypes](#41-colmodels--notetypes)
   - 4.2 [col.decks — Decks](#42-coldecks--decks)
   - 4.3 [col.dconf — Deck Configuration](#43-coldconf--deck-configuration)
   - 4.4 [col.conf — Global Config](#44-colconf--global-config)
   - 4.5 [col.tags — Tag Cache](#45-coltags--tag-cache)
5. [Indexes](#5-indexes)
6. [Key Relationships](#6-key-relationships)
7. [Read & Write Patterns](#7-read--write-patterns)
   - 7.1 [Reading Cards for Review](#71-reading-cards-for-review-scheduling-query)
   - 7.2 [Writing a New Note and Its Cards](#72-writing-a-new-note-and-its-cards)
   - 7.3 [Updating JSON Blobs Safely](#73-updating-json-blobs-safely)
   - 7.4 [USN Rules](#74-usn-rules)
   - 7.5 [mod Update Requirements](#75-mod-update-requirements)
   - 7.6 [Card Generation — When and How](#76-card-generation--when-and-how)
8. [Known Gotchas](#8-known-gotchas)
   - 8.1 [General Gotchas](#81-general-gotchas)
   - 8.2 [.apkg Import — Full Matching Logic](#82-apkg-import--full-matching-logic)
9. [Reference Sources](#9-reference-sources)

---

## 1. Overview

Anki stores all data for a collection in a single SQLite database file with the `.anki2` extension. This file is found inside `.apkg` package files (which are ZIP archives) and also lives directly in the user's Anki data directory as the live collection.

Schema version 11 is the **universal compatibility baseline**: it is both the minimum version all Anki clients can open (`SCHEMA_MIN_VERSION = 11`) and the version new collections are initially created with (`SCHEMA_STARTING_VERSION = 11`). Desktop Anki internally upgrades collections to v18 for performance but downgrades back to v11 before writing `.apkg` exports. This means v11 is the correct target for any tool that reads or writes Anki packages.

**Core entity types:**

| Entity | Storage | Description |
|---|---|---|
| Collection | `col` table (single row) | Global settings, all JSON configuration |
| Notetype (Model) | `col.models` JSON blob | Defines field structure and card templates |
| Deck | `col.decks` JSON blob | Groups cards; may be hierarchical |
| Deck Config | `col.dconf` JSON blob | Scheduling parameters per deck group |
| Note | `notes` table | Raw content — one or more field values |
| Card | `cards` table | A reviewable item derived from a note |
| Review | `revlog` table | Immutable log of every review ever done |
| Grave | `graves` table | Tombstones for sync deletion propagation |

For conceptual background on notes vs cards see the [Anki Key Concepts manual](https://docs.ankiweb.net/getting-started.html#key-concepts).

---

## 2. Conventions

### 2.1 Timestamp Formats

Two timestamp granularities are used throughout. The column or field name does not always make this obvious — the table below is the authoritative reference.

| Granularity | Unit | Example value | Where used |
|---|---|---|---|
| Epoch **milliseconds** | ms since Unix epoch | `1620000000000` | `cards.id`, `notes.id`, `revlog.id`, model ids, deck ids |
| Epoch **seconds** | s since Unix epoch | `1620000000` | `cards.mod`, `notes.mod`, `col.mod`, `col.crt`, `col.ls`, deck `mod`, model `mod` |

**Rule of thumb:** `id` columns use milliseconds (13 digits). `mod` columns use seconds (10 digits).

`col.crt` (collection creation time) is epoch seconds, but is only accurate to the day — the hour component reflects the configured "new day starts at" hour (default 4 AM).

### 2.2 Update Sequence Number (USN)

USN is a monotonically increasing integer used by the sync protocol to identify which records have changed since the last sync.

| Value | Meaning |
|---|---|
| `-1` | Record has local changes that need to be pushed to the server |
| `>= 0` | The server USN at the time this record was last synced |

When writing records locally (not during sync), always set `usn = -1`. The sync engine will assign real USN values during synchronisation. The `col.usn` field holds the collection's current server USN.

### 2.3 ID Generation

All primary key `id` values (notes, cards, revlog entries) must be **epoch milliseconds integers** that are unique within their table. The standard approach is to use the current timestamp in ms and increment by 1 if a collision is detected.

IDs for notetypes and decks follow the same convention (epoch ms) but are stored in JSON rather than as table rows. The default deck always has `id = 1`; the default deck config always has `id = 1`.

### 2.4 String Encoding

All text in the database is UTF-8. SQLite's `text` affinity is used throughout — there are no `varchar` or `nchar` types. Field content in notes may contain HTML.

---

## 3. Tables

### 3.1 `col` — Collection

The collection table always contains exactly one row. It holds global metadata and all configuration as JSON blobs.

```sql
CREATE TABLE col (
  id      integer PRIMARY KEY,  -- arbitrary, always 1
  crt     integer NOT NULL,     -- collection creation time, epoch seconds (day-accurate)
  mod     integer NOT NULL,     -- last modification time, epoch milliseconds
  scm     integer NOT NULL,     -- schema modification time, epoch milliseconds
  ver     integer NOT NULL,     -- schema version, always 11 for v11 collections
  dty     integer NOT NULL,     -- dirty flag, unused, always 0
  usn     integer NOT NULL,     -- server USN for sync
  ls      integer NOT NULL,     -- last sync time, epoch milliseconds
  conf    text NOT NULL,        -- JSON: global preferences (see §4.4)
  models  text NOT NULL,        -- JSON: all notetypes (see §4.1)
  decks   text NOT NULL,        -- JSON: all decks (see §4.2)
  dconf   text NOT NULL,        -- JSON: all deck configurations (see §4.3)
  tags    text NOT NULL         -- JSON: tag cache (see §4.5)
);
```

**Column reference:**

| Column | Type | Semantics |
|---|---|---|
| `id` | integer PK | Always `1`. No meaning beyond satisfying PK constraint. |
| `crt` | epoch seconds | Collection creation timestamp. Used by the scheduler to compute "days since collection creation" for the `due` field of review cards. |
| `mod` | epoch ms | Updated whenever any data in the collection changes. Used by sync to detect if a full sync is needed. |
| `scm` | epoch ms | Updated when the **schema** changes (notetype added/removed, field added, etc.). If client `scm` differs from server `scm`, a full sync is required. |
| `ver` | integer | Schema version. Always `11` in v11 collections. |
| `dty` | integer | Legacy dirty flag. Always `0`, never read. |
| `usn` | integer | The server's USN value as of the last sync. The sync protocol uses this to find records modified since last sync. |
| `ls` | epoch ms | Timestamp of last successful sync. |
| `conf` | JSON text | Global scheduler and UI preferences. See §4.4. |
| `models` | JSON text | All notetypes. Keys are string-encoded epoch ms IDs. See §4.1. |
| `decks` | JSON text | All decks. Keys are string-encoded deck IDs. See §4.2. |
| `dconf` | JSON text | All deck configurations. Keys are string-encoded config IDs. See §4.3. |
| `tags` | JSON text | Tag cache object. See §4.5. |

**Initial row (empty collection):**
```sql
INSERT INTO col VALUES (1, 0, 0, 0, 0, 0, 0, 0, '{}', '{}', '{}', '{}', '{}');
```

---

### 3.2 `notes` — Notes

A note stores the raw content from which one or more cards are generated. The structure of a note (which fields it has, how cards are generated from it) is determined by its notetype (`mid` → `col.models`).

```sql
CREATE TABLE notes (
  id      integer PRIMARY KEY,  -- epoch ms, unique
  guid    text NOT NULL,        -- globally unique ID string (for sync deduplication)
  mid     integer NOT NULL,     -- notetype (model) ID → col.models key
  mod     integer NOT NULL,     -- modification time, epoch seconds
  usn     integer NOT NULL,     -- update sequence number (see §2.2)
  tags    text NOT NULL,        -- space-separated tags with leading/trailing space
  flds    text NOT NULL,        -- field values separated by 0x1f (unit separator)
  sfld    integer NOT NULL,     -- sort field value (text stored as integer column for numeric sorting)
  csum    integer NOT NULL,     -- field checksum for duplicate detection
  flags   integer NOT NULL,     -- unused, always 0
  data    text NOT NULL         -- unused, always ''
);
```

**Column reference:**

| Column | Type | Semantics |
|---|---|---|
| `id` | epoch ms PK | Creation timestamp in milliseconds. Used as the note's primary identifier. |
| `guid` | text | Globally unique identifier string. See **guid semantics** below. |
| `mid` | integer | Foreign key into `col.models` (as integer, though the JSON key is a string). Identifies which notetype this note belongs to. |
| `mod` | epoch seconds | Last modification time. Must be updated whenever the note's content changes. |
| `usn` | integer | Set to `-1` on local writes. See §2.2. |
| `tags` | text | Space-separated list of tags with a **leading and trailing space**: `" tag1 tag2 "`. This format enables `LIKE '% tagname %'` queries. See [§3.6](#36-tags--three-distinct-usages). |
| `flds` | text | All field values concatenated with the ASCII unit separator `\x1f` (decimal 31). Values only — no field names. See **flds semantics** below. |
| `sfld` | integer | Denormalized copy of the sort field value. See **sfld semantics** below. |
| `csum` | integer | Checksum of the first field for fast duplicate detection. Computed as the integer representation of the first 8 hex digits of the SHA-1 hash of the first field's value (stripped of HTML). When writing, setting `csum = 0` is acceptable — Anki recomputes it on import. |
| `flags` | integer | Reserved, currently unused. Always write `0`. Confirmed unused in `notes.py`: `flags = 0` is a hardcoded class-level default. |
| `data` | text | Reserved, currently unused. Always write `''`. Confirmed unused in `notes.py`: `data = ""` is a hardcoded class-level default. |

**guid semantics:**

`guid` is a NOT NULL text field that serves as the stable cross-device identity of a note, used by the sync and import engines for deduplication. Two distinct strategies exist depending on who creates the note:

| Creator | Strategy | Reproducible? |
|---|---|---|
| genanki | `guid_for(*field_values)` — stable hash of all field values | ✅ Yes — same fields always produce same guid |
| Anki backend | `guid64()` — random base64 string assigned at creation | ❌ No — random, but stable after creation |

The genanki approach means re-exporting the same content produces the same guids, so Anki treats reimported notes as updates to existing ones rather than duplicates. The backend approach produces guids that are stable post-creation but not derivable from content.

**Critical:** `guid` is NOT NULL enforced at the DB level. An `.apkg` with missing guids will fail SQLite constraint on import. When writing notes programmatically, always generate a guid. For the `.apkg` import path, guid is the **sole matching key** — see [§8.2](#82-apkg-import--full-matching-logic).

**flds semantics:**

`flds` stores field **values only** — field names are stored exclusively in the notetype definition (`col.models`). The mapping between values and field names is purely positional:

```
flds value:  "Question text\x1fAnswer text\x1fHint text"
                    ↕                  ↕              ↕
notetype:   flds[0].ord=0      flds[1].ord=1   flds[2].ord=2
            name="Front"       name="Back"     name="Hint"
```

The contract: `flds.split('\x1f')[n]` maps to the field whose `ord == n` in `notetype["flds"]`. Template variables like `{{Front}}` resolve by: field name → `field["ord"]` → `flds[ord]`.

**Silent corruption risk:** if the order of values in `flds` does not match the `ord` sequence in the notetype, wrong values will render in templates with no error. This is the most common source of data corruption when building notes programmatically.

```python
# Correct: values in ord order
flds = '\x1f'.join([
    fields_by_name["Front"],   # ord 0
    fields_by_name["Back"],    # ord 1
])

# Reading: always split, then index by ord
values = flds_string.split('\x1f')
front_value = values[field_map["Front"][0]]  # field_map[name] = (ord, field_dict)
```

Cross-reference: see §4.1 for the notetype `flds` array structure.

**sfld semantics:**

`sfld` is a **denormalized copy** of one field's value, extracted from `flds` for performance. It is not an index or pointer — it is the actual text content of whichever field is designated as the sort field (`notetype["sortf"]`).

```
notetype["sortf"] = 0          →  sfld = flds.split('\x1f')[0]
notetype["sortf"] = 1          →  sfld = flds.split('\x1f')[1]
```

The column has `integer` affinity in the DDL — this is **intentional and load-bearing**. From the source comment in `schema11.sql`:
> *"The use of type integer for sfld is deliberate, because it means that integer values in this field will sort numerically."*

SQLite stores the text value faithfully regardless of affinity, but when the value is a pure integer string (e.g. `"42"`), comparisons and `ORDER BY` treat it numerically. This allows vocabulary lists with numeric indices to sort correctly without any special handling.

`sfld` is used for: browser "Sort Field" column display and sorting. It is **not** used for duplicate detection — that is `csum`.

`sfld` is computed and written by the backend on note save. When writing `.apkg` files, genanki sets it to `fields[model.sort_field_index]` directly. Do not cast to int when reading — treat as text.

**Field encoding detail:**

```python
# Writing
flds_value = '\x1f'.join(field_values)   # e.g. "Question\x1fAnswer"

# Reading
field_values = flds_value.split('\x1f')  # ["Question", "Answer"]
```

**Tag encoding detail:**

```python
# Writing
tags_value = ' ' + ' '.join(tags) + ' '   # " tag1 tag2 "

# Reading
tags = tags_value.strip().split()          # ["tag1", "tag2"]

# Querying a specific tag
cursor.execute("SELECT * FROM notes WHERE tags LIKE ?", (f'% {tag} %',))
```

**csum algorithm:**
```python
import hashlib
def field_checksum(first_field: str) -> int:
    # Strip HTML tags before hashing
    import re
    plain = re.sub(r'<[^>]+>', '', first_field)
    sha = hashlib.sha1(plain.encode('utf-8')).hexdigest()
    return int(sha[:8], 16)
```

---

### 3.3 `cards` — Cards

Cards are the reviewable units derived from notes. A note may generate one or more cards depending on its notetype's templates. Each card tracks its own scheduling state independently.

```sql
CREATE TABLE cards (
  id      integer PRIMARY KEY,  -- epoch ms, unique
  nid     integer NOT NULL,     -- note ID → notes.id
  did     integer NOT NULL,     -- deck ID → col.decks key
  ord     integer NOT NULL,     -- template index (0-based)
  mod     integer NOT NULL,     -- modification time, epoch seconds
  usn     integer NOT NULL,     -- update sequence number (see §2.2)
  type    integer NOT NULL,     -- card type (0–3)
  queue   integer NOT NULL,     -- scheduling queue (-3 to 4)
  due     integer NOT NULL,     -- due value (semantics depend on type)
  ivl     integer NOT NULL,     -- interval in days (0 for learning cards)
  factor  integer NOT NULL,     -- ease factor in permille
  reps    integer NOT NULL,     -- total number of reviews
  lapses  integer NOT NULL,     -- number of times card went from correct to incorrect
  left    integer NOT NULL,     -- remaining learning steps (encoded)
  odue    integer NOT NULL,     -- original due (for filtered decks)
  odid    integer NOT NULL,     -- original deck ID (for filtered decks)
  flags   integer NOT NULL,     -- user flag (low 3 bits) and reserved bits
  data    text NOT NULL         -- unused, always ''
);
```

**Column reference:**

| Column | Python attr | Protobuf field | Semantics |
|---|---|---|---|
| `id` | `card.id` | `card.id` | Epoch ms creation timestamp, primary key. |
| `nid` | `card.nid` | `card.note_id` | Parent note. |
| `did` | `card.did` | `card.deck_id` | Current deck. For cards in filtered decks, this points to the filtered deck — use `odid or did` for the card's "home" deck. |
| `ord` | `card.ord` | `card.template_idx` | 0-based index into `notetype["tmpls"]` for standard notetypes. For cloze notetypes, the 0-based cloze index (`{{c1::}}` = ord 0). |
| `mod` | `card.mod` | `card.mtime_secs` | Epoch seconds, updated on every scheduling change. |
| `usn` | `card.usn` | `card.usn` | Set to `-1` on local writes. |
| `type` | `card.type` | `card.ctype` | Card type enum — see below. |
| `queue` | `card.queue` | `card.queue` | Scheduling queue enum — see below. |
| `due` | `card.due` | `card.due` | Due value — semantics vary by type — see below. |
| `ivl` | `card.ivl` | `card.interval` | Review interval in days. `0` for new and intraday learning cards. For relearning cards, the interval the card will receive after graduating through all lapse steps. |
| `factor` | `card.factor` | `card.ease_factor` | Ease factor in permille. Default `2500` (= 2.5×). Valid range: `1300`–`9999`. A factor of `2500` means next interval = current interval × 2.5. |
| `reps` | `card.reps` | `card.reps` | Total number of reviews ever, including relearning. |
| `lapses` | `card.lapses` | `card.lapses` | Number of times the card transitioned from a correct state to an incorrect (Again) answer. Used for leech detection. |
| `left` | `card.left` | `card.remaining_steps` | Encoded as `a * 1000 + b` where `a` = steps remaining today, `b` = total steps remaining until graduation. Example: `2004` = 2 steps today, 4 steps total. |
| `odue` | `card.odue` | `card.original_due` | Original `due` value before the card was moved to a filtered deck. Restored when the card leaves the filtered deck. `0` when not in a filtered deck. |
| `odid` | `card.odid` | `card.original_deck_id` | Original deck ID before moving to a filtered deck. `0` when not in a filtered deck. |
| `flags` | `card.flags` | `card.flags` | Low 3 bits (`flags & 0b111`) = user flag color: 0=none, 1=red, 2=orange, 3=green, 4=blue, 5=pink, 6=turquoise, 7=purple. Upper bits reserved. |
| `data` | `card.custom_data` | `card.custom_data` | Unused in v11. Always write `''`. |

**`type` enum — Card Type:**

| Value | Constant | Meaning |
|---|---|---|
| `0` | `CARD_TYPE_NEW` | Card has never been reviewed. |
| `1` | `CARD_TYPE_LRN` | Card is in the initial learning phase. |
| `2` | `CARD_TYPE_REV` | Card has graduated to the review phase. |
| `3` | `CARD_TYPE_RELEARNING` | Card lapsed and is relearning. |

**`queue` enum — Scheduling Queue:**

| Value | Constant | Meaning |
|---|---|---|
| `-3` | `QUEUE_TYPE_MANUALLY_BURIED` | Buried by user action; unseen until next day. |
| `-2` | `QUEUE_TYPE_SIBLING_BURIED` | Auto-buried because a sibling card was reviewed; unseen until next day. |
| `-1` | `QUEUE_TYPE_SUSPENDED` | Suspended by user; excluded from all study until manually unsuspended. |
| `0` | `QUEUE_TYPE_NEW` | Waiting in the new card queue. |
| `1` | `QUEUE_TYPE_LRN` | In learning, next review due within the same day (intraday). |
| `2` | `QUEUE_TYPE_REV` | In the review queue; due on a future day. |
| `3` | `QUEUE_TYPE_DAY_LEARN_RELEARN` | In learning or relearning, but next step is due on a different day (interday learning). |
| `4` | `QUEUE_TYPE_PREVIEW` | In preview mode (filtered deck preview). |

**`due` field — Three distinct semantics by card type:**

| `queue` value | `due` meaning | Unit |
|---|---|---|
| `0` (new) | Position in the new card queue. Lower = shown sooner. Starts at 1. | integer position |
| `1` (learning intraday) | Absolute timestamp when this step is due. | epoch seconds |
| `2` (review) | Days since the collection's creation date (`col.crt`) when this card is due. | integer days |
| `3` (interday learning) | Days since `col.crt` when the next step is due. | integer days |

Computing "days since collection creation":
```python
import time
days_since_creation = int((time.time() - col_crt) / 86400)
```

Cards in filtered decks: `due` holds the card's position within the filtered deck. `odue` preserves the original due value.

**`factor` valid range:**

The default starting factor is `STARTING_FACTOR = 2500`. The minimum is `1300` (enforced by the scheduler). Values below `1300` surviving in the DB (e.g. manually set) are clamped on next review.

**`left` decoding:**
```python
steps_today = left // 1000
steps_total  = left % 1000
```

**`flags` bitmask:**
```python
# Read user flag
flag_color = card.flags & 0b111   # 0–7

# Set user flag (preserving other bits)
card.flags = (card.flags & ~0b111) | flag_color
```

**Determining a card's home deck:**
```python
home_deck_id = card.odid if card.odid else card.did
```

---

### 3.4 `revlog` — Review Log

An append-only log of every review ever performed. One row per review event. Never updated after insertion.

```sql
CREATE TABLE revlog (
  id       integer PRIMARY KEY,  -- epoch ms of the review
  cid      integer NOT NULL,     -- card ID → cards.id
  usn      integer NOT NULL,     -- update sequence number
  ease     integer NOT NULL,     -- button pressed (1–4)
  ivl      integer NOT NULL,     -- resulting interval (signed)
  lastIvl  integer NOT NULL,     -- interval before this review (signed)
  factor   integer NOT NULL,     -- ease factor after review, permille
  time     integer NOT NULL,     -- time spent answering, milliseconds (capped at 60000)
  type     integer NOT NULL      -- review type (0–4)
);
```

**Column reference:**

| Column | Semantics |
|---|---|
| `id` | Epoch milliseconds timestamp of the review. Serves as both PK and review time. |
| `cid` | The card that was reviewed. |
| `usn` | `-1` for unsynced reviews. |
| `ease` | Which answer button was pressed. Values differ by review type — see below. |
| `ivl` | The **resulting** interval after this review. Positive = days. Negative = seconds (used for intraday learning steps). |
| `lastIvl` | The interval **before** this review. Same sign convention as `ivl`. Note: this is not necessarily the elapsed time since the previous review — it is the scheduled interval value. |
| `factor` | The card's ease factor in permille immediately after this review. |
| `time` | How long the user spent looking at the card before answering, in milliseconds. Capped at `60000` (60 seconds) regardless of actual time taken. |
| `type` | The type of review event — see below. |

**`ease` values by context:**

| Review context | Button 1 | Button 2 | Button 3 | Button 4 |
|---|---|---|---|---|
| Review (`REVLOG_REV`) | Again | Hard | Good | Easy |
| Learning/Relearning | Again | Good | Easy | — |

**`type` enum — Review Type:**

| Value | Constant | Meaning |
|---|---|---|
| `0` | `REVLOG_LRN` | Initial learning phase review. |
| `1` | `REVLOG_REV` | Regular scheduled review. |
| `2` | `REVLOG_RELRN` | Relearning after a lapse. |
| `3` | `REVLOG_CRAM` | Review in a filtered (cram) deck. |
| `4` | `REVLOG_RESCHED` | Manual reschedule. |

**`ivl` sign convention:**
```
ivl > 0  →  interval in days  (review and interday learning cards)
ivl < 0  →  interval in seconds, negated  (intraday learning steps)

Example:  ivl = -600  means the card was due again in 600 seconds (10 minutes)
          ivl = 7     means the card was due again in 7 days
```

---

### 3.5 `graves` — Sync Tombstones

Records deletions so that the sync protocol can propagate them to other devices. A row is inserted here whenever a card, note, or deck is deleted locally.

```sql
CREATE TABLE graves (
  usn   integer NOT NULL,  -- -1 for unsynced tombstones
  oid   integer NOT NULL,  -- original ID of the deleted entity
  type  integer NOT NULL   -- entity type (0, 1, or 2)
);
```

**Column reference:**

| Column | Semantics |
|---|---|
| `usn` | `-1` for tombstones not yet pushed to server. Updated to the server USN after sync. |
| `oid` | The `id` of the deleted entity (card id, note id, or deck id). |
| `type` | `0 = REM_CARD`, `1 = REM_NOTE`, `2 = REM_DECK` |

**Notes on usage:** Graves are consumed and cleared by the sync engine after successfully pushing to the server. When writing tools create or import data, they do not need to write to `graves`. When deleting entities in a tool that will sync, a row must be inserted here.

---

### 3.6 Tags — Three Distinct Usages

The word "tags" appears in three separate locations in the schema, each with a different role and authority level. Conflating them is a common source of bugs.

| Location | Format | Role |
|---|---|---|
| `notes.tags` | `" tag1 tag2 "` (space-padded string) | **Source of truth.** The actual tags belonging to each note. |
| `col.tags` | `{"tag": usn, ...}` JSON object | **Derived cache.** Built by scanning `notes.tags`; used by the UI for autocomplete and by sync. May lag behind reality. Never use as the authoritative tag list. |
| `col.models[x]["tags"]` | `[]` (always empty array) | **Unused legacy.** Anki historically stored last-used tags here. Always initialize as `[]`. Never write to it; never read from it for tag logic. |

**`notes.tags` — format details:**

The string must have a leading and trailing space: `" tag1 tag2 "`. Individual tags must not contain spaces. This format is required for the `LIKE '% tagname %'` query pattern used throughout Anki's codebase:

```sql
-- Correct: finds notes with exactly 'spanish' tag (won't match 'spanish-verbs')
SELECT id FROM notes WHERE tags LIKE '% spanish %';
```

Round-trip in Python:
```python
# List → DB string
tag_list = ["spanish", "verb"]
tags_str = " " + " ".join(tag_list) + " "  # " spanish verb "

# DB string → list
tag_list = tags_str.strip().split()
```

**`col.tags` — cache maintenance:**

When writing notes programmatically, you do not need to update `col.tags` — Anki rebuilds it on open. If writing to a live collection (not `.apkg`), update it anyway for consistency:

```python
row = cursor.execute('SELECT tags FROM col').fetchone()
tag_cache = json.loads(row[0])
for tag in new_tags:
    if tag not in tag_cache:
        tag_cache[tag] = -1  # usn = -1 (unsynced)
cursor.execute('UPDATE col SET tags = ?', (json.dumps(tag_cache),))
```

Cross-reference: `col.tags` JSON structure is documented in §4.5.

---

## 4. JSON Blobs in `col`

All configuration in `col` is stored as JSON text in four blob columns: `models`, `decks`, `dconf`, and `conf`. Each must be read, modified, and written back atomically as a complete JSON string.

**Read-modify-write pattern (required for all blob updates):**
```python
import json

# Read
row = cursor.execute('SELECT models FROM col').fetchone()
models = json.loads(row[0])

# Modify
models[str(model_id)] = new_model_dict

# Write back
cursor.execute('UPDATE col SET models = ?', (json.dumps(models),))
```

---

### 4.1 `col.models` — Notetypes

A JSON object mapping string-encoded notetype IDs to notetype objects.

```json
{
  "1620000000000": { ...notetype object... },
  "1620000000001": { ...notetype object... }
}
```

**Outer dict:** keys are the notetype ID as a **string** (epoch ms). This is a common source of bugs — the key must be a string even though the `id` field inside is also stored as a string.

#### Notetype Object Fields

| Field | Type | Semantics |
|---|---|---|
| `id` | string | Notetype ID as a string (epoch ms). Must match the outer dict key. |
| `name` | string | Human-readable notetype name. Must be unique within the collection. |
| `type` | integer | `0 = MODEL_STD` (standard front/back), `1 = MODEL_CLOZE` (cloze deletion). |
| `mod` | integer | Modification time, epoch seconds. |
| `usn` | integer | `-1` for unsynced. |
| `did` | integer | Default deck ID for new notes of this type. |
| `sortf` | integer | 0-based index into `flds` indicating which field is used for sorting in the browser. |
| `flds` | array | Ordered list of field definition objects. See below. |
| `tmpls` | array | Ordered list of template objects. See below. |
| `css` | string | CSS stylesheet shared by all templates of this notetype. |
| `latexPre` | string | LaTeX preamble prepended to LaTeX expressions. |
| `latexPost` | string | LaTeX postamble appended to LaTeX expressions. Default: `\\end{document}`. |
| `latexsvg` | boolean | Whether to render LaTeX as SVG. Default: `false`. |
| `req` | array | Legacy required-field specification. See below. |
| `tags` | array | Always `[]`. Anki saves the last-used tags here; initialize as empty. |
| `vers` | array | Legacy version array. Always `[]`. |

**Default LaTeX preamble:**
```
\documentclass[12pt]{article}
\special{papersize=3in,5in}
\usepackage[utf8]{inputenc}
\usepackage{amssymb,amsmath}
\pagestyle{empty}
\setlength{\parindent}{0in}
\begin{document}
```

#### Field Object (element of `flds` array)

| Field | Type | Default | Semantics |
|---|---|---|---|
| `name` | string | required | Field name. Must be unique within the notetype. |
| `ord` | integer | assigned on save | 0-based position of this field. Assigned by Anki on save; set to `null` before adding. |
| `font` | string | `"Liberation Sans"` | Display font in the editor. |
| `size` | integer | `20` | Font size in the editor. |
| `rtl` | boolean | `false` | Whether this field uses right-to-left text direction. |
| `sticky` | boolean | `false` | If true, the field retains its value when adding a new note of the same type. |
| `media` | array | `[]` | Legacy media references. Always `[]`. |

#### Template Object (element of `tmpls` array)

| Field | Type | Default | Semantics |
|---|---|---|---|
| `name` | string | required | Template name (e.g. `"Card 1"`). |
| `ord` | integer | assigned on save | 0-based template index. Assigned by Anki on save. |
| `qfmt` | string | required | Question (front) template string using Mustache-style `{{FieldName}}` syntax. |
| `afmt` | string | required | Answer (back) template string. Use `{{FrontSide}}` to include the rendered front. |
| `bqfmt` | string | `""` | Browser question format. Empty string uses a stripped version of `qfmt`. |
| `bafmt` | string | `""` | Browser answer format. Empty string uses a stripped version of `afmt`. |
| `bfont` | string | `""` | Browser font override. Empty string uses the field's font. |
| `bsize` | integer | `0` | Browser font size override. `0` uses the field's size. |
| `did` | integer\|null | `null` | Deck override for cards of this template. `null` means use the notetype's default deck. |

#### `req` — Required Fields Specification

Legacy field used to determine which cards to generate. Format:

```json
[
  [template_ord, "all"|"any", [field_ord, field_ord, ...]], 
  ...
]
```

- `"all"` — all listed fields must be non-empty for this card to be generated
- `"any"` — at least one listed field must be non-empty
- `"none"` — no card is generated (empty field list)

This field is **written by genanki for compatibility** but is not used by modern Anki clients (deprecated as of AnkiDroid 2.15+). Modern clients recompute card generation from the templates directly. When writing, compute it or omit it — Anki will regenerate it.

---

### 4.2 `col.decks` — Decks

A JSON object mapping string-encoded deck IDs to deck objects.

```json
{
  "1": { ...default deck... },
  "1620000000000": { ...user deck... }
}
```

The default deck always has id `1`. Its key in the outer dict is the string `"1"`.

#### Normal Deck Object Fields

| Field | Type | Default | Semantics |
|---|---|---|---|
| `id` | integer | required | Deck ID (epoch ms for user decks, `1` for default). Stored as integer inside the object (unlike model `id` which is a string). |
| `name` | string | required | Deck name. Hierarchy is encoded using `::` as separator: `"Parent::Child::Grandchild"`. |
| `desc` | string | `""` | Deck description. May contain HTML. |
| `mod` | integer | required | Modification time, epoch seconds. |
| `usn` | integer | `-1` | Update sequence number. |
| `conf` | integer | `1` | ID of the deck configuration (`dconf`) that applies to this deck. |
| `dyn` | integer | `0` | `0` = normal deck, `1` = filtered (dynamic) deck. |
| `collapsed` | boolean | `false` | Whether the deck is collapsed in the deck list. |
| `browserCollapsed` | boolean | `false` | Whether the deck is collapsed in the card browser. Optional — defaults to `false` when absent. |
| `extendNew` | integer | `0` | Extended new card limit for custom study. |
| `extendRev` | integer | `50` | Extended review card limit for custom study. |
| `newToday` | array | `[0, 0]` | `[days_elapsed, new_cards_seen_today]`. `days_elapsed` is days since collection creation. |
| `revToday` | array | `[0, 0]` | `[days_elapsed, review_cards_seen_today]`. |
| `lrnToday` | array | `[0, 0]` | `[days_elapsed, learning_cards_seen_today]`. |
| `timeToday` | array | `[0, 0]` | `[days_elapsed, ms_spent_studying_today]`. |

**Deck hierarchy:** Parent decks must exist before child decks. The name `"Languages::French"` implies a parent deck named `"Languages"` must also be present in `col.decks`.

#### Filtered Deck Differences

Filtered decks have `dyn = 1` and differ in structure:
- No `conf` field (they have embedded scheduling config)
- Have a `terms` field: array of search term specifications
- `odid` on cards in this deck is non-zero; `odue` stores the pre-filter due

When a card is moved into a filtered deck:
1. `cards.odid` is set to the card's original `cards.did`
2. `cards.odue` is set to the card's original `cards.due`
3. `cards.did` is updated to the filtered deck's ID
4. `cards.due` is set to the card's position in the filtered deck

---

### 4.3 `col.dconf` — Deck Configuration

A JSON object mapping string-encoded config IDs to deck configuration objects. The default config always has id `1`.

```json
{
  "1": { ...default config... },
  "1620000000000": { ...custom config... }
}
```

#### Deck Config Object Fields

| Field | Type | Semantics |
|---|---|---|
| `id` | integer | Config ID. |
| `name` | string | Config name shown in the UI. |
| `mod` | integer | Modification time, epoch seconds. |
| `usn` | integer | Update sequence number. |
| `maxTaken` | integer | Maximum seconds before the review timer stops. Default: `60`. |
| `timer` | integer | `1` = show timer during review, `0` = hide. |
| `autoplay` | boolean | Whether to autoplay audio on the question side. |
| `replayq` | boolean | Whether to replay question audio when showing the answer. |
| `dyn` | boolean | Whether this is a dynamic deck config. Normally absent. |
| `new` | object | New card scheduling config. See below. |
| `rev` | object | Review card scheduling config. See below. |
| `lapse` | object | Lapse (relearning) config. See below. |

#### `new` Sub-object

| Field | Type | Semantics |
|---|---|---|
| `order` | integer | `0 = NEW_CARDS_RANDOM`, `1 = NEW_CARDS_DUE` (in order added). |
| `perDay` | integer | Maximum new cards to show per day. |
| `delays` | array | Learning step delays in minutes, e.g. `[1, 10]`. |
| `ints` | array | Post-learning intervals in days: `[graduating_interval, easy_interval, unused]`. |
| `initialFactor` | integer | Starting ease factor in permille. Default: `2500`. |
| `bury` | boolean | Whether to bury sibling cards when a new card is answered. |
| `separate` | boolean | Legacy, unused. |

#### `rev` Sub-object

| Field | Type | Semantics |
|---|---|---|
| `perDay` | integer | Maximum reviews to show per day. |
| `ease4` | float | Bonus added to ease factor when Easy is pressed. Default: `1.3`. |
| `fuzz` | float | Random variance multiplier applied to review intervals to prevent bunching. |
| `ivlFct` | float | Global multiplier applied to all computed review intervals. |
| `maxIvl` | integer | Maximum review interval in days. |
| `bury` | boolean | Whether to bury sibling review cards when one is answered. |
| `minSpace` | integer | Minimum days between related card reviews. Legacy, unused. |

#### `lapse` Sub-object

| Field | Type | Semantics |
|---|---|---|
| `delays` | array | Relearning step delays in minutes, e.g. `[10]`. |
| `mult` | float | Multiplier applied to the interval when a card lapses. Default: `0.0`. |
| `minInt` | integer | Minimum new interval after a lapse, in days. |
| `leechFails` | integer | Number of lapses before leech action is triggered. |
| `leechAction` | integer | `0 = LEECH_SUSPEND`, `1 = LEECH_TAGONLY`. |

---

### 4.4 `col.conf` — Global Config

A single JSON object (not a dict-of-objects like the others) holding global scheduler preferences and UI state.

| Field | Type | Semantics |
|---|---|---|
| `curDeck` | integer | ID of the currently selected deck. |
| `activeDecks` | array | List of the current deck ID and all its descendant deck IDs. |
| `newSpread` | integer | New card distribution: `0=NEW_CARDS_DISTRIBUTE` (mix with reviews), `1=NEW_CARDS_LAST`, `2=NEW_CARDS_FIRST`. |
| `collapseTime` | integer | "Learn ahead limit" in seconds. If no reviews remain but the next learning card is due within this many seconds, show it now. |
| `timeLim` | integer | Timebox time limit in seconds. `0` disables. |
| `estTimes` | boolean | Show estimated next review times above answer buttons. |
| `dueCounts` | boolean | Show remaining card count during review. |
| `curModel` | string | ID (as string) of the last-used notetype. |
| `nextPos` | integer | The highest `due` value assigned to a new card. Used to assign sequential positions to newly added cards. |
| `sortType` | string | Browser sort column identifier. |
| `sortBackwards` | boolean | Whether browser sort is descending. |
| `addToCur` | boolean | `true` = new cards go to the current deck; `false` = deck follows notetype default. |
| `dayLearnFirst` | boolean | Show interday learning cards before reviews. |
| `newBury` | boolean | Always `true`. Legacy. |

**Add-on extensibility:** `col.conf` may contain additional keys added by Anki add-ons. When modifying this object, always read the existing value first and preserve any unknown keys.

---

### 4.5 `col.tags` — Tag Cache

A JSON object mapping tag names to their USN values. Used to populate the tag list in the browser UI.

```json
{
  "vocabulary": -1,
  "grammar": -1,
  "chapter-1": -1
}
```

Values are USN integers (`-1` for unsynced). This is a cache — it is rebuilt from `notes.tags` when needed. When adding notes with new tags programmatically, add the tag names here with value `-1`.

---

## 5. Indexes

All indexes in the v11 schema and their purpose:

| Index | Columns | Purpose |
|---|---|---|
| `ix_notes_usn` | `notes(usn)` | Sync: quickly find notes modified since last sync (where `usn = -1` or `usn < server_usn`). |
| `ix_cards_usn` | `cards(usn)` | Sync: same as above for cards. |
| `ix_revlog_usn` | `revlog(usn)` | Sync: same as above for review log entries. |
| `ix_cards_nid` | `cards(nid)` | Note lookup: find all cards belonging to a note. Used when editing or deleting a note. |
| `ix_cards_sched` | `cards(did, queue, due)` | Scheduling: the primary index for the scheduler's card selection query. Covers the common `WHERE did = ? AND queue = ? ORDER BY due` pattern. |
| `ix_revlog_cid` | `revlog(cid)` | Card history: find all review history for a given card. Used in card statistics. |
| `ix_notes_csum` | `notes(csum)` | Duplicate detection: find notes with the same first-field checksum before adding a new note. |

**The scheduling query** that uses `ix_cards_sched`:
```sql
SELECT id FROM cards
WHERE did IN (active_deck_ids)
  AND queue = 2          -- review queue
ORDER BY due
LIMIT n;
```

---

## 6. Key Relationships

```
col (1 row)
 ├── col.models  (JSON) ──────────────────── notes.mid
 │    └── notetypes
 │         ├── flds[]  →  note.flds (positional)
 │         ├── tmpls[] →  cards.ord (index)
 │         └── sortf   →  notes.sfld (field value)
 │
 ├── col.decks   (JSON) ──────────────────── cards.did / cards.odid
 │    └── decks
 │         └── conf   ──────────────────────┐
 │                                          │
 ├── col.dconf   (JSON) ←───────────────────┘  (deck.conf → dconf.id)
 │    └── deck configs
 │
 └── col.tags    (JSON)  ← cache of notes.tags

notes ──────────────────────────────────────── notes.id = cards.nid
 └── 1 note → N cards (one per template, or per cloze index)

cards ──────────────────────────────────────── cards.id = revlog.cid
 └── 1 card → N revlog entries (one per review)

graves
 └── tombstones for deleted cards (type=0), notes (type=1), decks (type=2)
```

**Foreign key constraints are not enforced by SQLite** (and are not declared in the schema). Referential integrity is the responsibility of the application.

---

## 7. Read & Write Patterns

### 7.1 Reading Cards for Review (Scheduling Query)

```sql
-- Get due review cards for active decks
SELECT id FROM cards
WHERE did IN (1, 2, 3)      -- active deck IDs from col.conf.activeDecks
  AND queue = 2              -- QUEUE_TYPE_REV
ORDER BY due                 -- days since col.crt
LIMIT 100;

-- Get due learning cards (intraday)
SELECT id FROM cards
WHERE did IN (1, 2, 3)
  AND queue = 1              -- QUEUE_TYPE_LRN
  AND due <= ?               -- current epoch seconds
ORDER BY due;

-- Get new cards
SELECT id FROM cards
WHERE did IN (1, 2, 3)
  AND queue = 0              -- QUEUE_TYPE_NEW
ORDER BY due                 -- positional order
LIMIT ?;                     -- perDay limit
```

### 7.2 Writing a New Note and Its Cards

```python
import time, hashlib, re, random

def add_note_and_cards(cursor, notetype, field_values, deck_id, tags=None):
    tags = tags or []
    now_ms = int(time.time() * 1000)
    now_s  = int(time.time())

    # 1. Compute derived note fields
    flds   = '\x1f'.join(field_values)
    sfld   = field_values[notetype['sortf']]
    plain  = re.sub(r'<[^>]+>', '', field_values[0])
    csum   = int(hashlib.sha1(plain.encode()).hexdigest()[:8], 16)
    tags_s = ' ' + ' '.join(tags) + ' ' if tags else ' '
    guid   = generate_guid()  # stable unique string, e.g. base91 of random bytes

    # 2. Insert note
    note_id = now_ms  # ensure uniqueness
    cursor.execute(
        'INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        (note_id, guid, notetype['id'], now_s, -1,
         tags_s, flds, sfld, csum, 0, '')
    )

    # 3. Insert cards (one per template for standard notetypes)
    for tmpl in notetype['tmpls']:
        card_id = note_id + tmpl['ord'] + 1  # ensure uniqueness
        cursor.execute(
            'INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (card_id, note_id, deck_id, tmpl['ord'],
             now_s, -1,
             0,   # type = CARD_TYPE_NEW
             0,   # queue = QUEUE_TYPE_NEW
             0,   # due = position (set after; see nextPos)
             0,   # ivl
             2500, # factor = STARTING_FACTOR
             0,   # reps
             0,   # lapses
             0,   # left
             0,   # odue
             0,   # odid
             0,   # flags
             '')  # data
        )
```

### 7.3 Updating JSON Blobs Safely

Always use read-modify-write. Never overwrite the entire blob without reading first (other keys may exist).

```python
def add_notetype(cursor, notetype_dict):
    row = cursor.execute('SELECT models FROM col').fetchone()
    models = json.loads(row[0])
    model_id = str(notetype_dict['id'])
    models[model_id] = notetype_dict
    cursor.execute('UPDATE col SET models = ?', (json.dumps(models),))

def add_deck(cursor, deck_dict):
    row = cursor.execute('SELECT decks FROM col').fetchone()
    decks = json.loads(row[0])
    deck_id = str(deck_dict['id'])
    decks[deck_id] = deck_dict
    cursor.execute('UPDATE col SET decks = ?', (json.dumps(decks),))
```

### 7.4 USN Rules

```python
# Local write (not during sync):
record['usn'] = -1

# After sync, the sync engine sets:
record['usn'] = server_usn  # the current server USN

# Finding unsynced records:
cursor.execute('SELECT id FROM cards WHERE usn = -1')
cursor.execute('SELECT id FROM notes WHERE usn = -1')
```

### 7.5 `mod` Update Requirements

`mod` must be updated whenever a record's content changes:

```python
import time
card.mod  = int(time.time())   # epoch seconds
note.mod  = int(time.time())   # epoch seconds

# col.mod is epoch milliseconds:
cursor.execute('UPDATE col SET mod = ?', (int(time.time() * 1000),))
```

### 7.6 Card Generation — When and How

Understanding when cards are generated is critical for `.apkg` tooling.

**For `.apkg` files (genanki / custom writers):**

Cards are generated **at package creation time**, not at Anki import time. The `.apkg` archive contains a fully populated `cards` table. Anki imports these pre-generated card rows directly.

```
write time:   notes → card generation → cards table → .apkg ZIP
import time:  .apkg cards table → INSERT into collection (no regeneration)
```

**Standard notetype card generation:**

One card per template, gated by the `req` field. For each note:

```python
for tmpl in notetype["tmpls"]:
    # req is a list of [template_ord, "any"|"all", [required_field_ords]]
    # A card is generated if the required fields are non-empty
    if fields_satisfy_req(field_values, notetype["req"], tmpl["ord"]):
        generate_card(note, tmpl)
```

In practice, genanki generates one card per template unconditionally and lets Anki suppress display if fields are empty.

**Cloze notetype card generation:**

One card per unique `{{cN::}}` index found across all field values:

```python
import re

def cloze_ords(field_values):
    ords = set()
    for value in field_values:
        for m in re.finditer(r'{{c(\d+)::', value):
            # syntax is 1-indexed (c1, c2...), card ord is 0-indexed
            ords.add(int(m.group(1)) - 1)
    return sorted(ords)

# Example: "{{c1::front}} {{c2::back}}" → ords [0, 1] → two cards
```

**Anki's `generate_missing_cards` (Rust importer):**

When importing via the text/CSV path (`ForeignData.import`), Anki calls `generate_cards_for_existing_note` after inserting the note — so cards are generated server-side in that path. For `.apkg` imports, the cards table is read directly and no generation occurs unless a card is missing.

**Practical rule:** If writing `.apkg` files, always populate the `cards` table. Do not rely on Anki to generate cards at import time.

---

## 8. Known Gotchas

### 8.1 General Gotchas

**1. `id` as string vs integer in JSON blobs**
Model IDs are strings in `col.models` keys AND in the `id` field inside the model object. Deck IDs are strings in `col.decks` keys but integers inside the deck object. Mixing these up causes silent failures.

```python
# Correct: model key is string, inner id is string
models[str(model_id)] = {"id": str(model_id), ...}

# Correct: deck key is string, inner id is integer
decks[str(deck_id)] = {"id": deck_id, ...}  # int, not str
```

**2. `csum = 0` is acceptable on write**
Anki recomputes `csum` on import. Setting it to `0` is safe for tools that write `.apkg` files. For tools that write directly to a live collection, compute it properly to enable duplicate detection.

**3. `due` semantics change by card type**
The same `due` column means different things for different queue values. Always check `queue` before interpreting `due`.

**4. Use `odid or did` for a card's home deck**
`cards.did` points to the **current** deck, which may be a filtered deck. The card's original deck is `cards.odid` (when non-zero). For deck-based operations, always resolve: `home = card.odid or card.did`.

**5. Cloze `ord` is 0-indexed; cloze syntax is 1-indexed**
`{{c1::text}}` generates a card with `ord = 0`. `{{c2::text}}` generates `ord = 1`. The offset is always 1.

**6. `col.conf` may have add-on keys**
Third-party add-ons write arbitrary keys into `col.conf`. Always read the existing object first and merge your changes rather than replacing the whole object.

**7. Notetype `id` is stored as both the JSON key and an inner field, both as strings**
When reading: `models["1620000000000"]["id"]` → `"1620000000000"` (string). When using it as a DB foreign key (`notes.mid`), cast to int: `int(notetype["id"])`.

**8. `sfld` column type is integer but stores text**
SQLite's column affinity for `sfld` is `integer`, but text values are stored faithfully. This is intentional — numeric strings sort numerically. Do not cast to int when reading; treat as text.

**9. Filtered deck cards have two `did` values**
`cards.did` = filtered deck id while in the filtered deck. `cards.odid` = original deck id. Queries that count cards "in a deck" must check both: `WHERE did = ? OR odid = ?`.

**10. `tags` in `notes` requires padding**
The leading and trailing spaces in `notes.tags` are load-bearing. Without them, `LIKE '% tag %'` queries fail for tags at the start or end of the string.

**11. `flds` is positional — field names are not stored in notes**
`notes.flds` contains values only. The mapping to field names is via `notetype["flds"][n]["ord"]`. If values are inserted in the wrong order, wrong content will render in templates with no error. See §3.2 for the full positional contract and §4.1 for the notetype `flds` array structure.

---

### 8.2 `.apkg` Import — Full Matching Logic

The `.apkg` import path (Rust: `rslib/src/import_export/package/apkg/import/notes.rs`) uses **guid as the sole matching key**. This differs from the text/CSV import path (`noteimp.py`) which matches on first-field checksum. Do not conflate them.

**Decision tree for each incoming note:**

```
incoming note
    │
    ├─ guid found in existing collection?
    │       │
    │       ├─ NO  → add_note() — inserted as new (id uniquified if collision)
    │       │
    │       └─ YES → maybe_update_existing_note()
    │                   │
    │                   ├─ notetype_id differs AND merge_notetypes=false
    │                   │       → log_conflicting() — SILENTLY SKIPPED, note unchanged
    │                   │
    │                   ├─ incoming.mtime <= existing.mtime (UpdateCondition::IfNewer)
    │                   │       → log_duplicate() — SILENTLY SKIPPED, note unchanged
    │                   │
    │                   └─ otherwise → update_note() — fields, tags updated
```

**Failure mode 1 — Conflicting notetype id:**

If the incoming note's `notetype_id` does not match the existing note's `notetype_id`, the note is logged as `conflicting` and skipped. The existing note is left untouched. No error is raised to the user by default.

This happens when:
- You deleted and recreated the notetype in genanki (new timestamp → new id)
- A previous import with a schema mismatch caused Anki to duplicate the notetype with a new id
- `remapped_notetypes` maps the incoming id to a different target id

**Failure mode 2 — Stale mtime:**

With the default `UpdateCondition::IfNewer`, if the incoming note's `mod` timestamp is equal to or older than the existing note's `mod`, the note is logged as `duplicate` and skipped.

This happens when re-exporting a collection without touching notes: the `mod` timestamps are unchanged, so no updates are written.

```python
# Force mtime forward to guarantee update on reimport:
note.mod = int(time.time())
```

**The fix — `merge_notetypes=True`:**

```python
# Python API (direct collection access):
col.import_apkg(path, ImportAnkiPackageOptions(merge_notetypes=True))
```

With `merge_notetypes=True`, conflicting notetypes are merged field-by-field rather than causing a skip. Fields are remapped by `ord`, new fields are appended. After merge, the sibling notetype may be deleted if unused.

**Key architectural fact:** `noteimp.py` (first-field + checksum matching) is the **text/CSV import path only**. It is not involved in `.apkg` import. The guid path in Rust is authoritative for `.apkg`.

**Confirmed by Rust test:**
```rust
fn should_ignore_note_if_guid_already_exists_with_different_notetype() {
    note.notetype_id.0 = 42;  // changed notetype id
    // result: logged as conflicting, original note untouched
    assert_note_logged!(ctx.imports.log, conflicting, &["updated", ""]);
    assert_eq!(col.get_all_notes()[0].fields()[0], "");
}
```

**Summary table:**

| Condition | Result | Note changed? |
|---|---|---|
| guid absent in collection | Added as new | — |
| guid match + same notetype + newer mtime | Updated | ✅ |
| guid match + same notetype + same/older mtime | Duplicate (skipped) | ❌ |
| guid match + different notetype + `merge_notetypes=false` | Conflicting (skipped) | ❌ |
| guid match + different notetype + `merge_notetypes=true` | Merged and updated | ✅ |

---

## 9. Reference Sources

All sources below were directly read and validated during the preparation of this document unless marked otherwise.

### Tier 1 — Primary Sources (content directly validated)

| Source | URL | What it confirms |
|---|---|---|
| `schema11.sql` | https://github.com/ankitects/anki/blob/main/rslib/src/storage/schema11.sql | Ground-truth DDL, `sfld integer` type rationale comment |
| `upgrades/mod.rs` | https://github.com/ankitects/anki/blob/main/rslib/src/storage/upgrades/mod.rs | v11 as min/starting version, upgrade chain skips v12–v13, ease_factor roundtrip test |
| `pylib/anki/models.py` | https://github.com/ankitects/anki/blob/main/pylib/anki/models.py | Notetype dict structure, field/template operations, `scmhash` algorithm |
| `pylib/anki/decks.py` | https://github.com/ankitects/anki/blob/main/pylib/anki/decks.py | Deck dict structure, `maxTaken` as dconf discriminator, `browserCollapsed` optional default, `DEFAULT_DECK_ID=1`, `DEFAULT_DECK_CONF_ID=1` |
| `pylib/anki/cards.py` | https://github.com/ankitects/anki/blob/main/pylib/anki/cards.py | All column↔attr↔proto mappings, `flags & 0b111` bitmask, `odid or did` home deck logic, dconf key names |
| `pylib/anki/notes.py` | https://github.com/ankitects/anki/blob/main/pylib/anki/notes.py | `flds` join/split, `tags` list↔string, `flags=0` and `data=""` as permanent defaults, `sfld` as sort field value |
| `pylib/anki/consts.py` | https://github.com/ankitects/anki/blob/main/pylib/anki/consts.py | All enum values: `CardType`, `CardQueue`, `REVLOG_*`, `REM_*`, `MODEL_*`, `DECK_*`, `STARTING_FACTOR=2500` |
| `genanki/model.py` | https://github.com/kerrickstaley/genanki/blob/main/genanki/model.py | Complete notetype JSON shape, all field defaults, template `bfont`/`bsize` fields, `req` algorithm |
| `genanki/deck.py` | https://github.com/kerrickstaley/genanki/blob/main/genanki/deck.py | Complete deck JSON shape, write pattern for `col.models` and `col.decks` blobs |
| `genanki/note.py` | https://github.com/kerrickstaley/genanki/blob/main/genanki/note.py | `notes` INSERT column order, `\x1f` separator, tag space-padding, `csum=0` acceptable, cloze card ord generation |
| `genanki/apkg_schema.py` | https://github.com/kerrickstaley/genanki/blob/main/genanki/apkg_schema.py | Cross-reference DDL with column position comments, schema identity with `schema11.sql` confirmed |
| `rslib/.../text/import.rs` | https://github.com/ankitects/anki/blob/main/rslib/src/import_export/text/import.rs | Text/CSV import path: two-path deduplication (guid vs checksum+first-field), `DupeResolution` enum, field zip truncation, `conflicting` notetype handling |
| `rslib/.../apkg/import/notes.rs` | https://github.com/ankitects/anki/blob/main/rslib/src/import_export/package/apkg/import/notes.rs | `.apkg` import path: guid-only matching, `maybe_update_existing_note`, `merge_notetypes` logic, `UpdateCondition::IfNewer`, notetype schema conflict resolution, confirmed by inline Rust tests |
| `pylib/anki/importing/noteimp.py` | https://github.com/ankitects/anki/blob/main/pylib/anki/importing/noteimp.py | Text import deduplication (first field + csum, NOT guid), `UPDATE_MODE` default, field name mapping via `processFields` |

### Tier 2 — Referenced but Not Directly Read

| Source | URL | Notes |
|---|---|---|
| `genanki/card.py` | https://github.com/kerrickstaley/genanki/blob/main/genanki/card.py | Card write logic; column order inferred from `note.py` |
| `genanki/util.py` | https://github.com/kerrickstaley/genanki/blob/main/genanki/util.py | `guid_for()` implementation |

### Tier 3 — External Reference Documentation

| Source | URL |
|---|---|
| Anki Key Concepts | https://docs.ankiweb.net/getting-started.html#key-concepts |
| Anki Deck Options Manual | https://docs.ankiweb.net/deck-options.html |
| SQLite Datatypes | https://www.sqlite.org/datatype3.html |
| AnkiDroid Planned DB Changes | https://github.com/ankidroid/Anki-Android/wiki/Database-Structure-Planned-Changes.md |
