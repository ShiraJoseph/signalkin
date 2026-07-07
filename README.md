# signalkin

Relationships and everyday collection methods for [`@ngrx/signals`](https://ngrx.io/guide/signals) entities.

[![npm](https://img.shields.io/npm/v/signalkin.svg)](https://www.npmjs.com/package/signalkin)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Angular 22](https://img.shields.io/badge/Angular-22-dd0031.svg)](https://angular.dev)
[![@ngrx/signals 21](https://img.shields.io/badge/%40ngrx%2Fsignals-21-purple.svg)](https://ngrx.io/guide/signals)

`@ngrx/signals/entities` gives you normalized collections. signalkin adds the parts you usually hand-write on top of them, every member named after your collection and fully typed:

- **`withEntityAccessors`** adds every collection's standard methods (add / set / upsert / update / remove families, lookups, counts) in one call, so no more `withMethods` blocks full of `patchState(store, upsertEntity(...))`.
- **`withEntityRelationship`** relates two collections (1:many, N:many, m:n) with typed lookups in both directions, auto-indexed from foreign keys, plus link mutations.
- **`withTransitiveRelationship`** adds "grandparent" lookups that walk through intermediary collections, composing the direct relationships you already registered.

Everything is a plain `signalStoreFeature` built only on public `@angular/core` and `@ngrx/signals` APIs. No state duplication for foreign-key-derived links (indexes are `computed`), no effects, no watchers.

---

## Install

```
npm install signalkin
```

Peer dependencies: `@angular/core` and `@ngrx/signals` (which provides `@ngrx/signals/entities`).

---

## Quick start

Four steps. Here a `Library` has many `Shelf`s and a `Shelf` has many `Book`s:

### 1. Describe your entities and their configs

```ts
import { entityConfig, type } from '@ngrx/signals/entities';

interface Library { id: string; name: string; }
interface Shelf   { id: string; libraryId: string; }
interface Book    { id: string; shelfId: string; title: string; }

const libraryConfig = entityConfig({ entity: type<Library>(), collection: 'library' });
const shelfConfig   = entityConfig({ entity: type<Shelf>(),   collection: 'shelf' });
const bookConfig    = entityConfig({ entity: type<Book>(),    collection: 'book' });
```

### 2. Register the collections with ngrx

```ts
import { signalStore } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';

signalStore(
  { providedIn: 'root' },
  withEntities(libraryConfig),
  withEntities(shelfConfig),
  withEntities(bookConfig),
);
```

### 3. Add signalkin's features, in order

Accessors first, then each direct relationship, then any transitive one. The order is enforced at compile time, so a misplaced feature is a type error, not a runtime surprise.

```ts
import { withEntityAccessors, withEntityRelationship, withTransitiveRelationship } from 'signalkin';

export const CatalogStore = signalStore(
  { providedIn: 'root' },
  withEntities(libraryConfig),
  withEntities(shelfConfig),
  withEntities(bookConfig),

  withEntityAccessors(),                                                     // methods for every collection
  withEntityRelationship({ name: 'library', count: 1 }, { name: 'shelf', count: 'many' }),
  withEntityRelationship({ name: 'shelf',   count: 1 }, { name: 'book',  count: 'many' }),
  withTransitiveRelationship({ from: 'library', to: 'book', through: 'shelf' }),
);
```

### 4. Inject and use it

Every method is named after your collections, so the API reads like the domain:

```ts
const store = inject(CatalogStore);

store.addBook({ id: 'b1', shelfId: 's1', title: 'Dune' });   // from withEntityAccessors
store.booksByShelfId('s1');                                  // -> Book[]         (foreign-key indexed, reactive)
store.shelfByBook(book);                                     // -> Shelf | undefined
store.booksByLibrary(library);                               // -> Book[]         (walks library -> shelf -> book)
```

That is the whole loop: describe the entities, register them, add the features in order, call the generated methods. The rest of this README is reference detail for each feature.

---

## What you get, at a glance

For a `book` collection, `withEntityAccessors` alone adds:

```
books()   bookMap()   bookCount()                    // signals
bookById(id)   hasBook(id)                             // lookups
addBook   addBooks   prependBook   prependBooks         // add
setBook   setBooks   setAllBooks                        // set
upsertBook   upsertBooks                                // upsert
updateBook   updateBooks   updateAllBooks               // update
removeBook   removeBooks   removeAllBooks               // remove
```

A `library` 1:many `book` relationship adds `booksByLibrary`, `libraryByBook`, `libraryHasBook`, `bookCountByLibrary`, `addBookToLibrary`, `moveBookToLibrary`, and their id-based variants. A transitive `library -> book` link adds `booksByLibrary` / `librariesByBook` that walk the intermediary. Full tables are below.

---

## `withEntityAccessors(...configs)`

One call, placed AFTER your `withEntities` list. With no arguments it covers EVERY collection on the store. Pass configs to cover only those collections. That is also how a custom `selectId` gets honored, since ngrx does not expose it from `withEntities` (an `entityConfig(...)` result works as-is; a collection without a config defaults to the `id` property):

```ts
withEntityAccessors()                       // all collections, ids read from `id`
withEntityAccessors(bookConfig)             // only book; bookConfig's selectId is honored
withEntityAccessors(bookConfig, shelfConfig)
```

Adds, for `collection: 'book'`:

| Kind | Members |
|---|---|
| Signals | `books()`, `bookMap()`, `bookCount()` |
| Lookups | `bookById(id)`, `hasBook(id)` |
| Add | `addBook(book)`, `addBooks(books)`, `prependBook(book)`, `prependBooks(books)` |
| Set | `setBook(book)`, `setBooks(books)`, `setAllBooks(books)` |
| Upsert | `upsertBook(book)`, `upsertBooks(books)` |
| Update | `updateBook(id, changes)`, `updateBooks(ids \| predicate, changes)`, `updateAllBooks(changes)` |
| Remove | `removeBook(id)`, `removeBooks(ids \| predicate)`, `removeAllBooks()` |

`changes` follows ngrx's `EntityChanges`: a `Partial<Book>` or an `(book) => Partial<Book>` updater. The bulk update / remove methods accept an id array or an `(entity) => boolean` predicate.

---

## `withEntityRelationship(from, to, options?)`

Each side is `{ name, count, plural?, selectPrimaryId?, selectForeignId? }`:

- **`name`** is the collection name; the entity type is inferred from the store by this name.
- **`count`** is how many of THAT side relate to one of the other: `1`, a fixed number (e.g. `2`), or `'many'`. It drives the generated names and return shapes (single value vs array).
- **`selectPrimaryId`** is how to read this entity's own id (default the `id` property; keep it matching the collection's `selectId`). A typed getter lets branded id types flow through the id-returning methods.
- **`selectForeignId`** is how to read this entity's foreign key to the other side. Set it ONLY on a side whose entity actually stores the key. Defaults: `` `${otherName}Id` `` when the side links to one of the other, `` `${otherName}Ids` `` (an array) when it links to more than one.

`options`:

- **`autoIndex`** (default `true`) set `false` to index only explicit `add` / `remove` / `move` links.
- **`syncForeignKeys`** (default `true`) `remove` clears the matching id from the entities' foreign keys and `move` re-points them, so those mutations stick for foreign-key-derived links. Needs the foreign key to be a property name (the default, or a string `selectForeignId`); a getter-based side cannot be written back and is skipped. Set `false` to never write entities (mutations then affect manual links only).

For `withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' })`:

| Kind | Members |
|---|---|
| Index signals | `libraryBookMap()`, `bookLibraryMap()` (pruned id adjacency) |
| Lookups | `booksByLibrary(library)`, `booksByLibraryId(id)`, `bookIdsByLibrary(library)`, `bookIdsByLibraryId(id)` and the reverse four (`libraryByBook`, ...) |
| Checks | `libraryHasBook(libraryId, bookId)`, `bookHasLibrary(bookId, libraryId)`, `bookCountByLibrary(id)`, `libraryCountByBook(id)` |
| Mutations | `addBookToLibrary(libraryId, bookId)`, `removeBookFromLibrary(libraryId, bookId)`, `moveBookToLibrary(bookId, newLibraryId)` |

A side whose `count` is a fixed number of 2 or more also gets a variadic **composite set-lookup**: its full id-set pins exactly one of the other side. For example with `{ name: 'aisle', count: 2 }` linked to `{ name: 'book', count: 'many' }`: `bookByAisles(...aisles)`, `bookByAisleIds(...ids)`, `bookIdByAisles(...aisles)`, `bookIdByAisleIds(...ids)` (order-insensitive).

### How linking works

- **Auto-indexing:** any entity carrying the other side's id is indexed automatically and stays in sync as entities are added, removed, or re-pointed. It is a `computed` over the collections, so there are no watchers and no stored duplicates. Indexing itself never writes entities (deleting a library leaves each book's `libraryId` untouched).
- **`remove` / `move` write foreign keys by default** (`syncForeignKeys`), so `removeBookFromLibrary` clears the book's `libraryId` and `move` re-points it. Set `syncForeignKeys: false` to never write entities.
- **Manual links** (`addBookToLibrary` etc.) cover entities without a foreign key, and m:n relationships that have no single foreign key.
- **Ordering is enforced at compile time:** placing a relationship before its two `withEntities` / `withEntityAccessors` collections is a type error.

---

## `withTransitiveRelationship({ from, to, through, ... })`

Read-only lookups between two collections with no foreign key to each other, by walking the adjacency maps of the direct relationships along the path. `through` is a single collection name or an ordered list for 3rd / 4th-degree links.

Config: `{ from, to, through, fromPlural?, toPlural?, selectFromId?, selectToId? }`.

For `{ from: 'author', to: 'comment', through: 'post' }`: `commentsByAuthor(author)`, `commentsByAuthorId(id)`, `commentIdsByAuthor(author)`, `commentIdsByAuthorId(id)` plus the reverse four. Results are arrays in both directions (a walk can fan out) and are deduped.

Register the direct relationship for every hop BEFORE the transitive one. The two endpoint collections are type-checked; the intermediate hops cannot be (the path is variadic), so a missing hop throws a descriptive error at call time instead.

---

## Custom ids and pluralization

**Custom ids.** ngrx does not surface `selectId` to downstream features, so pass a config or a `selectPrimaryId` / `selectForeignId` where a collection keys on something other than `id`:

```ts
withEntityAccessors(bookConfig)   // bookConfig.selectId honored
withEntityRelationship(
  { name: 'library', count: 1, selectPrimaryId: 'id2' },
  { name: 'book', count: 'many', selectPrimaryId: 'id2', selectForeignId: 'libraryId2' },
);
```

A typed getter (`(entity) => entity.isbn`) also lets a branded id type flow through the id-returning methods.

**Pluralization** defaults to naive `+s` (`book` -> `books`, but `library` -> `librarys`). Give an irregular noun its real plural where it is used and it flows through every generated member, at the type level and at runtime:

```ts
withEntityAccessors({ ...libraryConfig, plural: 'libraries' })
withEntityRelationship({ name: 'library', count: 'many', plural: 'libraries' }, ...)
withTransitiveRelationship({ from: 'library', to: 'book', through: 'shelf', fromPlural: 'libraries' })
```

---

## Known limitations

- **Default pluralization is naive `+s`.** Set `plural` / `fromPlural` / `toPlural` for irregular nouns (see above).
- **Getter-based `selectForeignId` sides cannot be written back** by `syncForeignKeys` yet, so on those sides `remove` / `move` affect manual links only (planned: a write callback so getters work too).
- **A `'many'` side gets no composite set-lookup** (kept off to bound the generated surface).
- **Coupled to ngrx naming:** the runtime reads the merged store by ngrx's `${collection}EntityMap` convention.

---

## Working in this repo

This is an Angular workspace with two projects:

- `projects/signalkin` is the published library.
- `projects/sandbox` is a throwaway app that verifies the library's types against the packaged build.

```
npx ng build signalkin   # build the library to dist/signalkin
npx ng build sandbox      # type-check the sandbox probe against dist
npx ng test signalkin     # vitest suite
```

Build the library before the sandbox: the workspace maps the `signalkin` import to `dist/signalkin`.

Publishing (only on explicit go-ahead):

```
ng build signalkin
cd dist/signalkin
npm publish --access public
```

---

## License

MIT
