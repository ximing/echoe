# PRD: Anki-Compatible Flashcard Learning System

## Introduction

Build a full-featured, Anki-compatible flashcard learning system integrated into the echoe platform. The system uses the FSRS (Free Spaced Repetition Scheduler) algorithm for scientifically optimal card scheduling, supports the .apkg file format for full Anki compatibility, and provides a comprehensive set of features covering 95%+ of Anki's core functionality. The backend uses MySQL (no foreign keys) with a schema compatible with Anki 2.1 format.

## Goals

- Implement FSRS algorithm using `ts-fsrs` library for optimal spaced repetition scheduling
- Achieve 100% compatibility with .apkg import/export format
- Support all core Anki card types: Basic, Reverse, Cloze, Type-in-Answer
- Provide a complete card management system: decks, notes, templates, tags, media
- Deliver a mobile-friendly learning interface with gesture support and night mode
- Store all data in MySQL (no foreign keys) with Anki 2.1-compatible schema

## User Stories

---

### Phase 1: Core Learning Engine (MVP)

---

### US-001: FSRS Algorithm Implementation
**Description:** As a developer, I need to implement the FSRS spaced repetition algorithm so that cards are scheduled at scientifically optimal intervals.

**Acceptance Criteria:**
- [ ] Install and integrate `ts-fsrs` library
- [ ] Implement scheduling for all 4 rating buttons: Again (1), Hard (2), Good (3), Easy (4)
- [ ] Each rating produces a correct next review interval based on FSRS
- [ ] Support configurable parameters: learning steps (default: [1, 10] min), graduating interval (default: 1 day), easy interval multiplier (default: 1.3), interval multiplier (default: 2.5), max interval (default: 36500 days), starting ease (default: 2.5), ease adjustment factor (default: 0.15)
- [ ] Handle delayed reviews (card reviewed after due date)
- [ ] Handle relearning queue (failed review cards)
- [ ] Handle learning queue (new cards in learning steps)
- [ ] Unit tests cover: new card scheduling, review card scheduling, lapse handling, delayed review, parameter configuration
- [ ] Typecheck passes

---

### US-002: MySQL Database Schema (Anki 2.1 Compatible)
**Description:** As a developer, I need to create a MySQL database schema compatible with Anki 2.1 format so that data can be imported/exported with full fidelity.

**Acceptance Criteria:**
- [ ] Create `col` table: collection metadata (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
- [ ] Create `notes` table: id, guid, mid (notetype id), mod, usn, tags, flds (fields as \x1f-separated string), sfld (sort field), csum (checksum), flags, data
- [ ] Create `cards` table: id, nid (note id), did (deck id), ord (template index), mod, usn, type (0=new,1=learn,2=review,3=relearn), queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data
- [ ] Create `revlog` table: id (timestamp), cid (card id), usn, ease, ivl, lastIvl, factor, time, type
- [ ] Create `decks` table: id, name, conf (config id), extendNew, extendRev, usn, lim, collapsed, dyn, mod, desc, mid
- [ ] Create `deck_config` table: id, name, replayq, timer, maxTaken, autoplay, mod, usn, new (JSON), rev (JSON), lapse (JSON)
- [ ] Create `notetypes` table: id, name, mod, usn, sortf, did, tmpls (JSON array), flds (JSON array), css, type (0=standard,1=cloze), latexPre, latexPost, req
- [ ] Create `templates` table: id, ntid (notetype id), name, ord, qfmt, afmt, bqfmt, bafmt, did, mod, usn
- [ ] Create `media` table: id, filename, original_filename, size, mime_type, hash, created_at, used_in_cards
- [ ] Create `graves` table: usn, oid (original id), type (0=card,1=note,2=deck)
- [ ] Create `config` table: key, value (JSON)
- [ ] No foreign key constraints on any table
- [ ] All VARCHAR fields use 191 char limit for MySQL utf8mb4 index compatibility
- [ ] Drizzle ORM migration generated and runs successfully
- [ ] Typecheck passes

---

### US-003: Deck Management API
**Description:** As a developer, I need CRUD API endpoints for deck management so that the frontend can create, read, update, and delete decks.

**Acceptance Criteria:**
- [ ] `GET /api/v1/decks` — list all decks with today's card counts (new, learn, review) per deck
- [ ] `POST /api/v1/decks` — create deck, support `::` separator for sub-decks (e.g., "Language::Japanese")
- [ ] `PUT /api/v1/decks/:id` — rename deck, update description
- [ ] `DELETE /api/v1/decks/:id` — delete deck with option `deleteCards=true/false`
- [ ] `GET /api/v1/decks/:id/config` — get deck's learning configuration
- [ ] `PUT /api/v1/decks/:id/config` — update deck config (learning steps, graduating interval, etc.)
- [ ] Sub-deck hierarchy correctly computed from `::` in name
- [ ] Deleting parent deck optionally cascades to child decks
- [ ] Typecheck passes

---

### US-004: Card & Note Management API
**Description:** As a developer, I need CRUD API endpoints for notes and cards so that the frontend can create and manage flashcard content.

**Acceptance Criteria:**
- [ ] `GET /api/v1/notes` — list notes with filtering (deck, tags, search query, card status)
- [ ] `POST /api/v1/notes` — create note with fields, notetype id, deck id, tags; auto-generates cards from templates
- [ ] `PUT /api/v1/notes/:id` — update note fields and tags
- [ ] `DELETE /api/v1/notes/:id` — delete note and all its cards
- [ ] `GET /api/v1/cards/:id` — get single card with full note data
- [ ] `POST /api/v1/cards/bulk` — bulk operations: suspend, unsuspend, bury, forget, move to deck, add/remove tags
- [ ] `GET /api/v1/notetypes` — list all note types
- [ ] `POST /api/v1/notetypes` — create or clone note type
- [ ] `PUT /api/v1/notetypes/:id` — update note type fields and templates
- [ ] `DELETE /api/v1/notetypes/:id` — delete unused note type (reject if notes exist)
- [ ] Typecheck passes

---

### US-005: Study Session API
**Description:** As a developer, I need study session API endpoints so that the frontend can fetch cards to study and submit review ratings.

**Acceptance Criteria:**
- [ ] `GET /api/v1/study/queue?deckId=&limit=` — returns ordered queue: learning cards first, then review, then new, respecting daily limits
- [ ] `POST /api/v1/study/review` — submit card review: `{ cardId, rating (1-4), timeSpent (ms) }` — updates card schedule via FSRS, writes revlog entry
- [ ] `POST /api/v1/study/undo` — undo last review: reverts card to previous state, returns the undone card
- [ ] `POST /api/v1/study/bury` — bury card or note (all siblings) until next day
- [ ] `POST /api/v1/study/forget` — reset card to new state (interval=0, reps=0, optionally reset due position)
- [ ] `GET /api/v1/study/counts?deckId=` — returns `{ new, learn, review }` counts for today
- [ ] Daily card counts reset at configurable day boundary (default: midnight, configurable to e.g. 4am)
- [ ] Buried cards automatically unburied at day boundary
- [ ] Queue respects deck's daily new card limit
- [ ] Typecheck passes

---

### US-006: Main Deck List Screen
**Description:** As a learner, I want to see all my decks with today's card counts so I know what needs to be studied.

**Acceptance Criteria:**
- [ ] Main screen shows list of all decks
- [ ] Each deck row shows: deck name, new card count (blue), learn count (red), review count (green)
- [ ] Sub-decks shown indented under parent, collapsible/expandable
- [ ] Bottom bar shows total cards due today across all decks
- [ ] Empty state shown when no decks exist, with "Import .apkg" and "Create Deck" buttons
- [ ] Long-press on deck shows context menu: Rename, Configure, Delete
- [ ] "Add Deck" button creates new deck (supports `::` for sub-decks)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-007: Study Session Screen
**Description:** As a learner, I want to study cards in a session with smooth card display and rating buttons so I can efficiently review my flashcards.

**Acceptance Criteria:**
- [ ] Study screen shows card front (question side) initially
- [ ] Card content area occupies ~70% of screen height, scrollable for long content
- [ ] "Show Answer" button at bottom reveals card back
- [ ] After reveal: 4 rating buttons shown — Again, Hard, Good, Easy — each displaying next interval estimate (e.g., "10m", "3d", "1w")
- [ ] Card flip animation when showing answer (toggle-able in settings)
- [ ] Top status bar shows: progress (e.g., "15 / 50"), session timer, menu button
- [ ] Undo button in top bar reverts last rating and shows previous card
- [ ] Swipe left = Again, swipe right = Good (configurable gestures)
- [ ] Night mode auto-switches based on system setting
- [ ] Session complete screen shows: cards studied, time spent, breakdown by rating
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-008: Card Rendering Engine
**Description:** As a developer, I need a card template rendering engine so that cards with HTML, field substitution, and cloze formatting display correctly.

**Acceptance Criteria:**
- [ ] Render HTML subset: div, span, p, br, b, strong, i, em, u, strike, a, img, audio, ul, ol, li
- [ ] Support inline CSS styles
- [ ] Replace `{{FieldName}}` with actual field value from note
- [ ] Support conditional rendering: `{{#FieldName}}...{{/FieldName}}` (show only if field non-empty)
- [ ] Support cloze deletion: `{{c1::text}}` renders as `[...]` on front, revealed on back
- [ ] Support cloze with hint: `{{c1::text::hint}}` renders as `[hint]` on front
- [ ] Multiple cloze ordinals (c1, c2, c3) handled correctly — each ordinal generates a separate card
- [ ] LaTeX rendering via KaTeX: `\(...\)` for inline, `\[...\]` for block
- [ ] Media references `<img src="filename.jpg">` resolved to actual file URLs
- [ ] Audio `[sound:filename.mp3]` converted to `<audio>` element
- [ ] Typecheck passes

---

### Phase 2: Data Import/Export

---

### US-009: .apkg Import
**Description:** As an Anki user, I want to import my existing .apkg deck files so I can continue studying my existing content.

**Acceptance Criteria:**
- [ ] `POST /api/v1/import/apkg` accepts multipart file upload
- [ ] Unzip .apkg (it's a ZIP containing `collection.anki2` SQLite DB and media files)
- [ ] Parse SQLite `collection.anki2` and import: col metadata, notetypes, decks, notes, cards, revlog
- [ ] Import all media files to attachment storage, update media table
- [ ] Handle Anki 2.1 format (collection.anki21) and legacy format (collection.anki2)
- [ ] Update mode: match existing notes by GUID and update fields rather than duplicate
- [ ] Return import result: `{ notesAdded, notesUpdated, notesSkipped, mediaImported, errors[] }`
- [ ] Import progress via SSE or polling endpoint for large decks
- [ ] Typecheck passes

---

### US-010: .apkg Export
**Description:** As a user, I want to export decks as .apkg files for backup or sharing.

**Acceptance Criteria:**
- [ ] `GET /api/v1/export/apkg?deckId=&includeScheduling=true/false` generates and returns .apkg file
- [ ] Export includes: notes, cards, note types, templates, media files
- [ ] `includeScheduling=false` exports cards as new (no review history)
- [ ] `includeScheduling=true` includes full revlog and card scheduling state
- [ ] Output filename: `{deckName}_{YYYY-MM-DD}.apkg`
- [ ] Generated .apkg is importable by official Anki desktop client
- [ ] Typecheck passes

---

### Phase 3: Content Editing

---

### US-011: Card Editor
**Description:** As a learner, I want to add and edit cards with a rich text editor so I can create quality flashcard content.

**Acceptance Criteria:**
- [x] Add card screen: select note type, select deck, fill fields
- [x] Rich text toolbar: Bold, Italic, Underline, Strikethrough
- [x] Toggle between rich text mode and raw HTML source mode
- [x] Insert image from file picker or camera
- [ ] Insert audio from file picker or microphone recording
- [x] Tag input (autocomplete from existing tags - partial)
- [x] Save creates note and generates cards from templates
- [x] Edit mode pre-fills existing field values
- [x] Typecheck passes
- [x] Verify in browser using dev-browser skill

**Status:** passes

---

### US-012: Card Browser
**Description:** As a learner, I want to browse, search, and bulk-edit my cards so I can manage my card collection efficiently.

**Acceptance Criteria:**
- [ ] Card browser list shows: front field preview, deck name, due date, card status (new/learn/review/suspended/buried)
- [ ] Search bar with full-text search across all fields
- [ ] Filter chips: All, New, Review, Suspended, Buried, Marked
- [ ] Sort options: Added date, Due date, Modified date, Random
- [ ] Tap card to open edit modal
- [ ] Long-press to enter multi-select mode
- [ ] Multi-select bulk actions: Delete, Move to Deck, Suspend, Unsuspend, Mark, Forget, Add Tag, Remove Tag
- [ ] Card detail view shows: card metadata (IDs, added date), review history log
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-013: Cloze Card Support
**Description:** As a language learner, I want to use cloze deletion cards so I can practice fill-in-the-blank style questions.

**Acceptance Criteria:**
- [ ] Cloze note type pre-installed (uses `{{c1::text}}` syntax in Text field)
- [ ] Card browser correctly identifies cloze cards
- [ ] Study screen shows `[...]` placeholder for active cloze, visible text for inactive cloze ordinals
- [ ] Cloze with hint shows `[hint]` instead of `[...]`
- [ ] Multiple cloze ordinals (c1, c2...) each generate a separate card from one note
- [ ] Typecheck passes

---

### US-014: Type-in-Answer Card Support
**Description:** As a language learner, I want to type my answer and see a diff comparison so I can practice active recall.

**Acceptance Criteria:**
- [ ] "Basic (type in answer)" note type pre-installed
- [ ] Card front renders `{{type:FieldName}}` as a text input box
- [ ] On "Show Answer", compare typed input with correct answer character-by-character
- [ ] Diff display: correct chars in green, wrong chars in red, missing chars underlined, extra chars struck through
- [ ] Options: ignore case (default on), ignore leading/trailing whitespace (default on)
- [ ] Typecheck passes

---

### Phase 4: Statistics & Advanced Features

---

### US-015: Learning Statistics
**Description:** As a learner, I want to view my study progress and statistics so I can track my learning over time.

**Acceptance Criteria:**
- [ ] Stats screen shows today's overview: cards studied, time spent, breakdown by rating (Again/Hard/Good/Easy)
- [ ] Review history bar chart: selectable range 7 days / 30 days / 1 year
- [ ] Card maturity distribution: New / Learning / Young (review, interval < 21d) / Mature (review, interval >= 21d)
- [ ] Forecast chart: predicted daily review load for next 30 days
- [ ] Per-deck stats available by selecting a deck
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-016: Leech (Stubborn Card) Detection
**Description:** As a learner, I want the system to detect cards I repeatedly fail and handle them automatically so I don't waste time on ineffective repetition.

**Acceptance Criteria:**
- [ ] When a card's `lapses` count reaches the threshold (default: 8), automatically mark it as leech and suspend it
- [ ] Study screen shows a "Leech!" notification when a card is suspended for being a leech
- [ ] Card browser can filter by leech status (is:leech)
- [ ] Leech threshold configurable per deck config (default 8, range 1-99)
- [ ] Auto-suspend on leech behavior is configurable (on by default)
- [ ] Typecheck passes

---

### US-017: Undo/Redo System
**Description:** As a learner, I want to undo accidental ratings so I don't corrupt my scheduling data.

**Acceptance Criteria:**
- [ ] Study session maintains an undo stack of at least 5 recent ratings
- [ ] Undo button in study screen reverts last rating: restores card to previous FSRS state, removes revlog entry, returns to that card
- [ ] Visual feedback on undo (brief toast notification)
- [ ] Undo stack cleared when study session ends
- [ ] Typecheck passes

---

### US-018: Bury Card Management
**Description:** As a learner, I want to bury cards to skip them until tomorrow so I can manage sibling card interference.

**Acceptance Criteria:**
- [ ] Study screen menu has "Bury Card" and "Bury Note" options
- [ ] "Bury Card" sets card queue to -2 (manually buried), removes from today's queue
- [ ] "Bury Note" buries all sibling cards (same note, different template ordinals) — sets queue to -3 (sibling buried)
- [ ] Deck config option: "Bury siblings during review" (auto-buries siblings when a card from a note is studied)
- [ ] Card browser shows buried status, supports bulk unbury
- [ ] At day boundary, all buried cards (queue -2 and -3) are automatically unburied
- [ ] Typecheck passes

---

### US-019: Card State Reset (Forget)
**Description:** As a learner, I want to reset a card's learning progress so I can relearn it from scratch.

**Acceptance Criteria:**
- [ ] Study screen menu has "Forget" option
- [ ] Forget resets: type=0 (new), queue=0, due=next available position, ivl=0, factor=2500, reps=0, lapses incremented
- [ ] Option in forget dialog: "Restore original position" (reset due to original new card position)
- [ ] Card browser supports bulk forget on selected cards
- [ ] Typecheck passes

---

### US-020: Custom Study Session
**Description:** As a learner, I want to temporarily increase my study load or review cards ahead of schedule so I can study more intensively when needed.

**Acceptance Criteria:**
- [ ] Deck screen has "Custom Study" button
- [ ] Options: "Increase today's new card limit" (enter number), "Review ahead" (enter days), "Preview new cards" (doesn't affect scheduling)
- [ ] "Review ahead" studies cards due within N days, optionally applying scheduling (configurable)
- [ ] "Preview" mode shows cards without recording reviews
- [ ] Custom study session records are flagged in revlog with type=4
- [ ] Typecheck passes

---

### US-021: Audio Auto-play & TTS
**Description:** As a learner, I want audio to play automatically and have text-to-speech support so I can practice listening.

**Acceptance Criteria:**
- [ ] Cards with `[sound:filename.mp3]` syntax auto-play audio when card is shown (configurable: front only, back only, both, never)
- [ ] "Replay Audio" button in study screen replays all audio on current side
- [ ] TTS: deck/note type can specify `{{tts en_US:FieldName}}` to synthesize speech for a field
- [ ] TTS uses system TTS engine with configurable language and speed
- [ ] Audio controls: play/pause/replay visible when audio is present
- [ ] Typecheck passes

---

### US-022: Application Settings
**Description:** As a user, I want to configure application behavior so the app works the way I prefer.

**Acceptance Criteria:**
- [ ] Settings screen with sections: Learning, Display, Gestures, Notifications, Data
- [ ] Learning: daily new card limit (global default), daily review limit (global default), daily start time (default midnight)
- [ ] Display: font size, dark mode (auto/light/dark), card flip animation toggle
- [ ] Gestures: configure swipe left/right/up/down to: Again/Hard/Good/Easy/Bury/Skip
- [ ] Notifications: study reminder time, smart reminder (only when cards due), toggle on/off
- [ ] Data: clear cache, export all data
- [ ] Deck config presets: save current deck config as named preset, apply preset to any deck
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-023: Filtered Deck (Custom Study Deck)
**Description:** As a learner, I want to create filtered decks based on search criteria so I can focus on specific card subsets.

**Acceptance Criteria:**
- [ ] Create filtered deck with a search query (supports full search syntax from FR-012)
- [ ] Filtered deck pulls matching cards from their home decks into a temporary deck
- [ ] Option: rebuild daily (re-runs query each day)
- [ ] Preview: before creating, show count of matching cards and 5 sample cards
- [ ] Studying filtered deck updates card scheduling normally
- [ ] "Empty" action returns all cards to home decks without reviewing
- [ ] Typecheck passes

---

### US-024: Note Type Manager
**Description:** As a power user, I want to create and manage custom note types so I can define my own card structures.

**Acceptance Criteria:**
- [ ] Note type list screen shows all note types with card count
- [ ] Clone existing note type to create a new one
- [ ] Add/delete/rename fields; set field font and size
- [ ] Add/delete/edit card templates (front template, back template, CSS)
- [ ] Live preview of template rendering with sample data
- [ ] Rename note type
- [ ] Delete note type only allowed if no notes use it
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-025: Tag Manager
**Description:** As a content manager, I want to organize and clean up tags so my card collection stays tidy.

**Acceptance Criteria:**
- [ ] Tag list screen shows all tags sorted by usage count
- [ ] Rename tag: updates all notes that have the tag
- [ ] Delete unused tags (tags with 0 notes)
- [ ] Merge tag A into tag B: all notes with tag A get tag B, tag A removed
- [ ] Typecheck passes

---

### US-026: Media Manager
**Description:** As a user, I want to find and delete unused media files so I can reclaim storage space.

**Acceptance Criteria:**
- [ ] Media manager screen shows all media files with size and type
- [ ] "Check Unused" scan: identifies media files not referenced in any note field
- [ ] List of unused files shown with file size
- [ ] Bulk delete unused files with confirmation dialog
- [ ] Total media storage size displayed
- [ ] Tap a media file to see which cards reference it
- [ ] Typecheck passes

---

### US-027: CSV/TSV Bulk Import
**Description:** As a content creator, I want to import cards from spreadsheet files so I can bulk-create flashcards from existing data.

**Acceptance Criteria:**
- [ ] `POST /api/v1/import/csv` accepts CSV or TSV file upload
- [ ] Auto-detect encoding (UTF-8, GBK) and delimiter (comma, tab, semicolon)
- [ ] UI shows first 5 rows as preview
- [ ] User maps each column to a note type field
- [ ] Select target note type and deck
- [ ] Import result: `{ added, updated, skipped, errors[] }` with error row numbers
- [ ] Typecheck passes

---

### US-028: Duplicate Card Detection
**Description:** As a content manager, I want to find duplicate or near-duplicate cards so I can clean up my collection.

**Acceptance Criteria:**
- [ ] "Find Duplicates" tool: select a field to compare across all notes of a note type
- [ ] Exact duplicates (same field value) shown grouped
- [ ] Near-duplicate detection using Levenshtein distance with configurable threshold
- [ ] Side-by-side comparison view for duplicate pairs
- [ ] Actions: keep one and delete others, or mark for manual review
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** FSRS algorithm via `ts-fsrs` library; supports all 4 ratings; parameters configurable per deck
- **FR-2:** MySQL schema with 10 tables (col, notes, cards, revlog, decks, deck_config, notetypes, templates, media, graves, config); no foreign keys; VARCHAR(191) limit
- **FR-3:** Card rendering supports HTML subset, field substitution `{{Field}}`, conditionals `{{#Field}}`, cloze `{{c1::text}}`, LaTeX via KaTeX, media file resolution
- **FR-4:** Study queue order: overdue learn > due learn > due review > new cards; respects daily limits
- **FR-5:** .apkg import: unzip, parse SQLite, import all tables, handle media, update mode via GUID matching
- **FR-6:** .apkg export: generate valid SQLite, zip with media, importable by official Anki
- **FR-7:** Daily boundary configurable (default midnight); buried cards auto-unburied at boundary; daily counts reset at boundary
- **FR-8:** Undo stack: min 5 entries; reverts card FSRS state and removes revlog entry
- **FR-9:** Leech detection: auto-suspend when lapses >= threshold (default 8); configurable per deck
- **FR-10:** Filtered decks: search-query-based card pools; preview before creating; empty action returns cards
- **FR-11:** Search syntax: keyword, `field:value`, `tag:name`, `deck:name`, `is:new/review/learn/suspended/buried/marked`, `added:N`, `rated:N`, boolean `and/or/-`
- **FR-12:** Media storage: local or S3 via existing UnifiedStorageAdapterFactory; media table indexes all files
- **FR-13:** Pre-installed note types: Basic, Basic (reversed), Basic (optional reversed), Basic (type in answer), Cloze
- **FR-14:** TTS support via system TTS engine; `{{tts lang:Field}}` template syntax
- **FR-15:** CSV import: encoding auto-detection, column-to-field mapping, 5-row preview, error reporting

## Non-Goals (Out of Scope)

- AnkiWeb / AnkiDroid cloud sync (no sync protocol implementation)
- Plugin/add-on system
- Collaborative or shared deck features
- AI-generated card content
- Gamification (streaks, achievements, points)
- Multi-user/multi-account support within a single instance
- Mobile native app (iOS/Android) — web interface only
- HarmonyOS widgets (FR-022/FR-023 from original spec)

## Design Considerations

- Study screen: card content area ~70% height, bottom action area ~30%
- Deck list: hierarchical with collapse/expand, colored count badges (blue=new, red=learn, green=review)
- Card browser: list with search/filter at top, bulk action bar appears on multi-select
- Dark mode: follow system preference, full dark theme for study screen to reduce eye strain
- Reuse existing echoe UI components (Tailwind CSS, React 19)
- Card content rendered in sandboxed iframe or sanitized div to prevent XSS

## Technical Considerations

- Use `ts-fsrs` npm package for FSRS algorithm — do not reimplement
- Use `better-sqlite3` or `sql.js` for parsing .apkg SQLite files on the server
- Use `jszip` or Node.js `zlib` for .apkg ZIP handling
- Media files stored via existing `UnifiedStorageAdapterFactory` (local/S3/OSS)
- Card rendering engine runs client-side (React component with sanitized HTML)
- KaTeX for LaTeX rendering (lighter than MathJax)
- All new services decorated with `@Service()` for TypeDI injection
- New controllers in `apps/server/src/controllers/v1/` following existing patterns
- New DTOs in `packages/dto/src/` exported from index
- Drizzle ORM for all MySQL operations; build before generating migrations

## Success Metrics

- Import a 5000-card .apkg file in under 30 seconds
- Study screen card flip and rating response under 100ms
- FSRS scheduling matches ts-fsrs reference implementation for all test cases
- 100% of exported .apkg files importable by official Anki 2.1+ desktop client
- Card browser search returns results in under 500ms for collections up to 50,000 cards

## Open Questions

- Should the system support AnkiWeb sync in a future phase? (Currently out of scope)
- For the web app, how should audio recording work (MediaRecorder API)?
- Should filtered decks be a separate deck type in the decks table (dyn=1) matching Anki's format exactly?
- What is the target platform for notifications — browser push notifications or email?
- Should LaTeX rendering be server-side (pre-rendered) or client-side (KaTeX in browser)?

---

## Appendix: Terminology

| Term | English | Description |
|------|---------|-------------|
| 间隔重复 | Spaced Repetition | Learning method scheduling reviews based on forgetting curve |
| FSRS算法 | FSRS | Free Spaced Repetition Scheduler — calculates optimal review intervals |
| 牌组 | Deck | Collection of cards, can be nested using `::` separator |
| 笔记 | Note | A set of related fields that generates one or more cards |
| 卡片 | Card | The unit of study: front (question) and back (answer) |
| 笔记类型 | Note Type | Defines fields and card templates for a category of notes |
| 填空 | Cloze | Card type that hides part of a sentence for fill-in-the-blank |
| 易度 | Ease Factor | Multiplier affecting interval growth (default 2.5) |
| 间隔 | Interval | Days between reviews |
| 搁置 | Bury | Postpone card until next day |
| 暂停 | Suspend | Remove card from queue indefinitely until manually resumed |
| 兄弟卡片 | Sibling | Cards generated from the same note |
| 学习步长 | Learning Step | Intervals in minutes for new card learning phase |
| 毕业 | Graduate | New card completes learning steps and enters review phase |
| TTS | Text-to-Speech | Synthesized speech from text |
| 顽固卡片 | Leech | Card with too many lapses, auto-suspended |
| 队列位置 | Due/Position | New card's position in the new card queue |
| 失误 | Lapse | Pressing "Again" on a review card |
| 失误次数 | Lapse Count | Total number of lapses for a card |
