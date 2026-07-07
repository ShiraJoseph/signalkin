# AGENTS.md

Guidance for AI coding agents working with signalkin, either **consuming** it in an app or **contributing** to this repo. Human-facing docs live in `README.md`; this file is the dense, rules-first version.

## What signalkin is

Three `signalStoreFeature`s that extend `@ngrx/signals/entities`. Every generated member is named after the collection (`book` -> `addBook`, `booksByLibrary`), fully typed, built only on public `@angular/core` + `@ngrx/signals` APIs. No effects, no watchers, no state duplication (foreign-key indexes are `computed`).

Public API (from `signalkin`):

- `withEntityAccessors(...configs)`: standard collection methods + convenience signals.
- `withEntityRelationship(from, to, options?)`: a typed relationship between two collections.
- `withTransitiveRelationship(config)`: read-only lookups that walk through intermediary collections.
- Types: `Cardinality`, `EntityPredicate`, `ForeignIdAccessor`, `IdAccessor`, `RelationshipOptions`, `RelationshipSide`, `EntityAccessorConfig`.

## Composition order (HARD RULE)

Inside `signalStore(...)`, features must appear in this order. It is enforced at compile time; getting it wrong is a type error, not a runtime bug.

1. `withEntities(config)` for every collection (ngrx).
2. `withEntityAccessors(...)` after the full `withEntities` list.
3. `withEntityRelationship(...)` for each direct relationship, after the collections it names.
4. `withTransitiveRelationship(...)` after the direct relationship for EVERY hop on its path.

A transitive relationship reads the adjacency maps that direct relationships put on the store. The two endpoints are type-checked, but intermediate hops are not (the path is variadic), so a missing hop throws a descriptive runtime error instead of failing to compile. When you add a transitive lookup, verify each hop has its own `withEntityRelationship`.

## Predicting generated member names

You do not need to look up the surface; it is derived mechanically from the collection `name` and its `count`.

**Accessors**, for `collection: 'book'` (plural `books`): `books()`, `bookMap()`, `bookCount()`, `bookById(id)`, `hasBook(id)`, `addBook`/`addBooks`, `prependBook`/`prependBooks`, `setBook`/`setBooks`/`setAllBooks`, `upsertBook`/`upsertBooks`, `updateBook(id, changes)`/`updateBooks(ids | predicate, changes)`/`updateAllBooks(changes)`, `removeBook(id)`/`removeBooks(ids | predicate)`/`removeAllBooks()`.

**Relationship**, for `{ name: 'library', count: 1 }` linked to `{ name: 'book', count: 'many' }`:
- A `count: 1` side returns a single value (`Entity | undefined`) and its noun stays singular. A `count: 'many'` or fixed-number side returns an array and uses the plural noun.
- Lookups: `<returnNoun>By<InputName>` and `<returnNoun>By<InputName>Id`, plus id-returning `<returnIdNoun>By...`. Both directions. So: `booksByLibrary`, `booksByLibraryId`, `bookIdsByLibrary`, `bookIdsByLibraryId`, `libraryByBook`, `libraryByBookId`, `libraryIdByBook`, `libraryIdByBookId`.
- Checks: `libraryHasBook`, `bookHasLibrary`, `bookCountByLibrary`, `libraryCountByBook`.
- Mutations: `addBookToLibrary(libraryId, bookId)`, `removeBookFromLibrary(libraryId, bookId)`, `moveBookToLibrary(bookId, newLibraryId)`.
- Index signals: `libraryBookMap()`, `bookLibraryMap()`.
- A side with a fixed `count` of 2+ also gets composite set-lookups: `<other>By<Plural>(...entities)`, `<other>By<Name>Ids(...ids)`, and the id variants. A `'many'` side does not.

**Transitive**, for `{ from: 'library', to: 'book', through: 'shelf' }`: `booksByLibrary`/`booksByLibraryId`/`bookIdsByLibrary`/`bookIdsByLibraryId` and the reverse four. Arrays both directions, deduped.

## Common mistakes to avoid

- **Pluralization is naive `+s`.** `library` becomes `librarys`. For any irregular noun, set `plural` on the accessors config or relationship side, and `fromPlural` / `toPlural` on a transitive config. It flows through every generated member at both the type and runtime level. Do not leave `librarys` in generated code.
- **`selectForeignId` goes ONLY on the side that actually stores the key.** A `Book` has `libraryId`, so the book side carries the foreign key; the `Library` side does not. Do not add a foreign key to a side whose entity has no reference to the other.
- **`selectId` is not visible to downstream features.** If a collection keys on something other than `id`, pass its `entityConfig` to `withEntityAccessors` and set `selectPrimaryId` on the relationship side. Otherwise ids default to the `id` property and mutations key on the wrong field.
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
