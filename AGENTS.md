# AGENTS.md

Guidance for AI coding agents working with signalkin, either **consuming** it in an app or **contributing** to this repo. Human-facing docs live in `README.md`; this file is the dense, rules-first version.

## What signalkin is

Three `signalStoreFeature`s that extend `@ngrx/signals/entities`. Every generated member is named after the collection (`book` -> `addBook`, `booksByLibrary`), fully typed, built only on public `@angular/core` + `@ngrx/signals` APIs. No effects, no watchers, no state duplication (foreign-key indexes are `computed`).

Public API (from `signalkin`):

- `withEntityAccessors(...configs)`: standard collection methods + convenience signals.
- `withEntityRelationship(from, to, options?)`: a typed relationship between two collections.
- `withTransitiveRelationship(config)`: read-only lookups that walk through intermediary collections.
- Types: `Cardinality`, `EntityPredicate`, `ForeignIdAccessor`, `IdAccessor`, `RelationshipOptions`, `RelationshipSide`, `EntityAccessorConfig`.

**Entity-or-id (HARD RULE for the surface).** Every generated member that IDENTIFIES an existing entity — a lookup, a count, an existence check, or a mutation like `removeBook` / `addBookToLibrary` — accepts the entity OR its id (`Entity | EntityId`). There is no separate `...ById` variant. The exceptions: `bookById(id)` is id-only (it is the id -> entity resolver), and `addBook` / `setBook` / `upsertBook` / `prependBook` (and their plurals) take a whole entity because they insert a record.

**Relationship sides are entityConfig-shaped.** A side is `{ collection, count, plural?, selectId?, selectForeignId? }` — same `collection` / `selectId` keys as `entityConfig`, so `{ ...bookConfig, count: 'many' }` is valid.

## Composition order (HARD RULE)

Inside `signalStore(...)`, features must appear in this order. It is enforced at compile time; getting it wrong is a type error, not a runtime bug.

1. `withEntities(config)` for every collection (ngrx).
2. `withEntityAccessors(...)` after the full `withEntities` list.
3. `withEntityRelationship(...)` for each direct relationship, after the collections it names.
4. `withTransitiveRelationship(...)` after the direct relationship for EVERY hop on its path.

A transitive relationship reads the adjacency maps that direct relationships put on the store. The two endpoints are type-checked, but intermediate hops are not (the path is variadic), so a missing hop throws a descriptive runtime error instead of failing to compile. When you add a transitive lookup, verify each hop has its own `withEntityRelationship`.

## Predicting generated member names

You do not need to look up the surface; it is derived mechanically from the collection name and its `count`. Every identifying argument below accepts `Entity | EntityId`.

**Accessors**, for `collection: 'book'` (plural `books`): `books()`, `bookMap()`, `bookCount()`, `bookById(id)` (id-only resolver), `hasBook(book)`, `addBook`/`addBooks`, `prependBook`/`prependBooks`, `setBook`/`setBooks`/`setAllBooks`, `upsertBook`/`upsertBooks`, `updateBook(book, changes)`/`updateBooks(books | predicate, changes)`/`updateAllBooks(changes)`, `removeBook(book)`/`removeBooks(books | predicate)`/`removeAllBooks()`.

**Relationship**, for `{ collection: 'library', count: 1 }` linked to `{ collection: 'book', count: 'many' }`:
- A `count: 1` side returns a single value (`Entity | undefined`) and its noun stays singular. A `count: 'many'` or fixed-number side returns an array and uses the plural noun.
- Directional lookups are keyed by ONE of the other side (singular input noun): `<returnNoun>By<InputName>` plus id-returning `<returnIdNoun>By<InputName>`, both directions. So: `booksByLibrary`, `bookIdsByLibrary`, `libraryByBook`, `libraryIdByBook`. No `...ById` twins — the one method takes an entity or an id.
- Checks: `libraryHasBook`, `bookHasLibrary`, `bookCountByLibrary`, `libraryCountByBook`.
- Mutations: `addBookToLibrary(library, book)`, `removeBookFromLibrary(library, book)`, `moveBookToLibrary(book, newLibrary)`.
- Index signals: `libraryBookMap()`, `bookLibraryMap()`.
- Composite set-lookups (keyed by a full SET, so plural input noun): generated for EVERY side whose `count != 1`, both directions, off with `compositeLookups: false`. Result is a SINGLE entity when the keyed side has a fixed number count (candidate key) OR the returned side is `count: 1`; otherwise an ARRAY of all matches — and the return noun goes singular/plural to match. Here the book side is `'many'`, so: `libraryByBooks(...books)` -> `Library | undefined` and `libraryIdByBooks(...books)`. (In a 2:many like `row(2)`-<`book(many)`: `bookByRows(...rows)` -> `Book | undefined`; the reverse `rowsByBooks(...books)` -> `Row[]`. In m:m: both directions are arrays.)

**Transitive**, for `{ from: 'library', to: 'book', through: 'shelf' }`: `booksByLibrary`/`bookIdsByLibrary` and the reverse `librariesByBook`/`libraryIdsByBook` (entity or id in). Arrays both directions, deduped.

## Common mistakes to avoid

- **Pluralization is naive `+s`.** `library` becomes `librarys`. For any irregular noun, set `plural` on the accessors config or relationship side, and `fromPlural` / `toPlural` on a transitive config. It flows through every generated member at both the type and runtime level. Do not leave `librarys` in generated code.
- **`selectForeignId` goes ONLY on the side that actually stores the key.** A `Book` has `libraryId`, so the book side carries the foreign key; the `Library` side does not. Do not add a foreign key to a side whose entity has no reference to the other.
- **`selectId` is not visible to downstream features.** If a collection keys on something other than `id`, pass its `entityConfig` to `withEntityAccessors` and set `selectId` on the relationship side (or spread the config: `{ ...bookConfig, count: 'many' }`). Otherwise ids default to the `id` property and mutations key on the wrong field.
- **`syncForeignKeys` needs a property-name foreign key.** With the default `true`, `remove`/`move` write the entity's foreign key so the change sticks. A getter-based `selectForeignId` cannot be written back and is silently skipped; use a string key if you need those mutations to persist.
- **Do not add `withMethods` blocks that re-implement accessors.** If you find `patchState(store, upsertEntity(...))` by hand, `withEntityAccessors` already generated `upsertBook`.

## Contributing to this repo

Angular 22 workspace, two projects:

- `projects/signalkin`: the published library. Source in `src/lib`, public surface in `src/public-api.ts`.
- `projects/sandbox`: a throwaway app whose `demo.store.ts` + `demo.store.typecheck.ts` assert the features resolve real entity types through the packaged build. Not shipped.

Commands (build the library before the sandbox; the workspace maps the `signalkin` import to `dist/signalkin`):

```
npx ng build signalkin   # build library to dist/signalkin
npx ng build sandbox      # type-check the sandbox probe against dist
npx ng test signalkin     # vitest suite (src/lib/*.spec.ts)
```

Conventions:

- **Verify before claiming done:** `ng build signalkin`, `ng build sandbox`, and `ng test signalkin` all pass.
- **Type-level changes need a sandbox assertion.** Add or update `demo.store.typecheck.ts` so a regression fails the build, not just runtime.
- **Keep the surface derivable.** Member names come from `name` + `count` + `plural`; do not add one-off names that break the pattern.
- **No new runtime dependencies.** Public `@angular/core` + `@ngrx/signals` only.
- Commit format: `[type] Description` (`[src]`, `[fix]`, `[test]`, `[tech]`). Feature branch, PR, squash merge. Do not push to `main` directly.
