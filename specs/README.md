# specs

Specifications, PRDs, design docs, and implementation plans for the Food Diary
project live here. This is the home for **planning artifacts** — the durable
"what and why" behind a piece of work — kept in version control alongside the
code they describe.

## What belongs here

- Product requirement docs (PRDs)
- Technical design docs / architecture proposals
- Implementation plans for sizable features or ports

For operational/reference documentation (how to run a service, how an
integration works), use [`docs/`](../docs/) instead. Rule of thumb: **`specs/`
is forward-looking ("we plan to build X"); `docs/` is present-tense reference
("here is how X works").**

## Naming convention

Files are **date-prefixed** with the creation date and a short kebab-case title:

```
YYYY-MM-DD-short-title.md
```

Examples:

- `2026-06-20-ios-app.md`

The date is the document's **creation** date and does not change when the file is
edited. Track edits with a `Last updated:` line in the document header instead.

## Document header

Start each spec with a short metadata block:

```markdown
# <Title>

**Status:** Draft | Accepted | In progress | Done | Superseded
**Author:** <name>
**Last updated:** YYYY-MM-DD
**Target:** <one-line summary of what this covers>
```

## Lifecycle

- Update the `Status` field as work progresses rather than deleting the file.
- When a spec is replaced, set its status to `Superseded` and link to the
  successor; keep the old file for historical context.
- Specs are committed and reviewed like code (via PR) so changes are traceable.

## Index

| Spec | Status | Summary |
|---|---|---|
| [2026-06-20-ios-app.md](2026-06-20-ios-app.md) | Draft | Native iOS port of the web front end (Swift/SwiftUI). |
</content>
