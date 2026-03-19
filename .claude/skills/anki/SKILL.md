---
name: anki
description: Practical Anki v11 schema and import/export compatibility guide for Echoe. Use this skill whenever the user mentions Anki, .apkg/.anki2, notes/cards/revlog tables, notetype/deck JSON blobs, or fields like flds/sfld/csum/guid/usn/due. Even if the request sounds generic (for example "flashcard import" or "Anki sync issue"), consult this skill first before implementing or reviewing code.
---

# Anki Compatibility and Schema Skill

This skill packages two source documents:

- `references/anki-v11.md` (primary authoritative source, validated against upstream Anki code)
- `references/anki.md` (legacy structural overview and annotated field descriptions)

## When To Use

Use this skill when tasks involve:

- Mapping Echoe data to/from Anki `.apkg` or `.anki2`
- Reading or writing `notes`, `cards`, `revlog`, `graves`, or `col`
- Explaining or validating `flds`, `sfld`, `csum`, `guid`, `usn`, `queue`, `due`
- Diagnosing import dedupe/conflict behavior
- Designing transforms that must stay Anki-compatible

## Source Loading Order

1. Read `references/anki-v11.md` first.
2. Read `references/anki.md` second for supplementary context.
3. If any statements conflict, follow `anki-v11.md`.

## Working Protocol

1. Identify the user intent:
   - schema explanation
   - import/export implementation
   - bug diagnosis
   - compatibility review
2. Read only the relevant sections from the references.
3. Return a result that explicitly covers:
   - required columns/JSON fields
   - timestamp units and ID formats
   - matching/dedupe rules
   - side effects (`usn`, `mod`, card generation, tag cache)
4. Run the invariant checklist before finalizing the response.

## Invariant Checklist

- `id` values are epoch milliseconds; `mod` is usually epoch seconds.
- Local writes use `usn = -1`.
- `notes.tags` must be space-padded (`" tag1 tag2 "`).
- `notes.flds` is ordered by field `ord`, joined by `\x1f`.
- `sfld` is the denormalized sort-field value (text in integer-affinity column).
- `guid` is required and is the matching key for `.apkg` import.
- `due` semantics depend on `queue`.
- `.apkg` generation should not rely on importer card generation.

## Fast Lookup In `anki-v11.md`

- Table schemas and semantics: section `3`
- JSON blob structures: section `4`
- Read/write patterns: section `7`
- `.apkg` import matching logic: section `8.2`
- Common compatibility traps: section `8.1`

## Output Shape

For analysis/review tasks, prefer:

1. Assumptions
2. Relevant schema rules
3. Implementation or fix steps
4. Compatibility risks
5. Validation checklist

For code-change tasks, also state:

- exact fields touched
- why each field update is required
- why behavior remains Anki-compatible

## Echoe Notes

For this repository, combine this skill with workspace Anki compatibility constraints (especially the `fields` and `richTextFields` split, and `flds/sfld/csum` compatibility chain) so import/export behavior is not broken.
