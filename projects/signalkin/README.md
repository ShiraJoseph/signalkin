# signalkin

Relationships and everyday collection methods for [`@ngrx/signals`](https://ngrx.io/guide/signals) entities.

`@ngrx/signals/entities` gives you normalized collections; signalkin adds what you usually hand-write on top of them:

- **`withEntityAccessors`** — one call, after your `withEntities` list, that adds every collection's standard methods (add/set/upsert/update/remove families, lookups, counts), all named by collection.
- **`withEntityRelationship`** — relate two collections (1:many, N:many, m:n) with typed lookups in both directions, auto-indexed from foreign keys, plus link mutations.
- **`withTransitiveRelationship`** — "grandparent" lookups that walk through intermediary collections, composing the direct relationships you already registered.

Everything is a plain `signalStoreFeature` built only on public `@angular/core` + `@ngrx/signals` APIs, with no state duplication for FK-derived links (indexes are `computed`) and no effects or watchers.

## Install

```
npm install signalkin
```

Peer dependencies: `@angular/core` and `@ngrx/signals` (which provides `@ngrx/signals/entities`).

## Quickstart

```ts
import { signalStore, type } from '@ngrx/signals';
import { entityConfig, withEntities } from '@ngrx/signals/entities';
import { withEntityAccessors, withEntityRelationship, withTransitiveRelationship } from 'signalkin';

interface Library { id: string; name: string; }
interface Shelf   { id: string; libraryId: string; }
interface Book    { id: string; shelfId: string; title: string; }

const libraryConfig = entityConfig({ entity: type<Library>(), collection: 'library' });
const shelfConfig = entityConfig({ entity: type<Shelf>(), collection: 'shelf' });
const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });

export const CatalogStore = signalStore(
  { providedIn: 'root' },
  withEntities(libraryConfig),
  withEntities(shelfConfig),
  withEntities(bookConfig),
  withEntityAccessors(),
  withEntityRelationship({ name: 'library', count: 1 }, { name: 'shelf', count: 'many' }),
  withEntityRelationship({ name: 'shelf', count: 1 }, { name: 'book', count: 'many' }),
  withTransitiveRelationship({ from: 'library', to: 'book', through: 'shelf' }),
);
```

```ts
const store = inject(CatalogStore);

store.addBook({ id: 'b1', shelfId: 's1', title: 'Dune' });   // withEntityAccessors
store.booksByShelfId('s1');                                  // -> Book[]        (FK-indexed, reactive)
store.shelfByBook(book);                                     // -> Shelf | undefined
store.booksByLibrary(library);                               // -> Book[]        (walks library → shelf → book)
```

## `withEntityAccessors(...configs)`

One call, placed AFTER your `withEntities` list. With no arguments it covers EVERY collection on the store. Pass configs to cover only those collections — that's also how a custom `selectId` gets honored, since ngrx doesn't expose it from `withEntities` (an `entityConfig(...)` result works as-is; a collection without a config defaults to the `id` property):

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

`changes` follows ngrx's `EntityChanges`: a `Partial<Book>` or an `(book) => Partial<Book>` updater. The bulk update/remove methods accept an id array or an `(entity) => boolean` predicate.

## `withEntityRelationship(from, to, options?)`

Each side is `{ name, count, selectPrimaryId?, selectForeignId? }`:

- `name` — the collection name; the entity type is inferred from the store by this name.
- `count` — how many of THAT side relate to one of the other: `1`, a fixed number (e.g. `2`), or `'many'`. Drives generated names and return shapes (single value vs array).
- `selectPrimaryId` — how to read this entity's own id (default the `id` property; keep it matching the collection's `selectId`). A typed getter lets branded id types flow through id-returning methods.
- `selectForeignId` — how to read this entity's foreign key to the other side. Set it ONLY on a side whose entity actually stores the key. Defaults: `` `${otherName}Id` `` when the side links to one of the other, `` `${otherName}Ids` `` (an array) when it links to more than one.

`options`:

- `autoIndex` — default `true`; set `false` to index only explicit `add`/`remove`/`move` links.
- `syncForeignKeys` — default `false`. When `true`, `remove` clears the matching id from the entities' foreign keys and `move` re-points them, so those mutations stick for FK-derived links. Needs the FK to be a property name (the default, or a string `selectForeignId`); a getter-based side can't be written back and is skipped.

For `withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' })`:

| Kind | Members |
|---|---|
| Index signals | `libraryBookMap()`, `bookLibraryMap()` (pruned id adjacency) |
| Lookups | `booksByLibrary(library)`, `booksByLibraryId(id)`, `bookIdsByLibrary(library)`, `bookIdsByLibraryId(id)` and the reverse four (`libraryByBook`, ...) |
| Checks | `libraryHasBook(libraryId, bookId)`, `bookHasLibrary(bookId, libraryId)`, `bookCountByLibrary(id)`, `libraryCountByBook(id)` |
| Mutations | `addBookToLibrary(libraryId, bookId)`, `removeBookFromLibrary(libraryId, bookId)`, `moveBookToLibrary(bookId, newLibraryId)` |

A side whose `count` is a fixed number of 2 or more also gets a variadic **composite set-lookup** — its full id-set pins exactly one of the other side. E.g. with `{ name: 'aisle', count: 2 }` ↔ `{ name: 'book', count: 'many' }`: `bookByAisles(...aisles)`, `bookByAisleIds(...ids)`, `bookIdByAisles(...aisles)`, `bookIdByAisleIds(...ids)` (order-insensitive).

### How linking works

- **Auto-indexing:** any entity carrying the other side's id is indexed automatically and stays in sync as entities are added, removed, or re-pointed. It's a `computed` over the collections — no watchers, no stored duplicates.
- **Entities are never written.** Deleting a library drops it from the index but leaves each book's `libraryId` untouched.
- **Manual links** (`addBookToLibrary` etc.) cover entities without a foreign key, and m:n relationships that have no single FK.
- **Ordering is enforced at compile time:** placing a relationship before its two `withEntities`/`withEntityAccessors` collections is a type error.

## `withTransitiveRelationship({ from, to, through, selectFromId?, selectToId? })`

Read-only lookups between two collections with no FK to each other, by walking the adjacency maps of the direct relationships along the path. `through` is a single collection name or an ordered list for 3rd/4th-degree links.

For `{ from: 'author', to: 'comment', through: 'post' }`: `commentsByAuthor(author)`, `commentsByAuthorId(id)`, `commentIdsByAuthor(author)`, `commentIdsByAuthorId(id)` plus the reverse four. Results are arrays in both directions (a walk can fan out) and are deduped.

Register the direct relationship for every hop BEFORE the transitive one. The two endpoint collections are type-checked; the intermediate hop maps can't be (variadic path), so a missing hop throws a descriptive error at call time instead.

## Known limitations

- **Default pluralization is naive `+s`** (`book` → `books`, but `library` → `librarys`). Give an irregular noun its real plural where it's used: `plural` on an accessors config (`{ ...libraryConfig, plural: 'libraries' }`) or a relationship side (`{ name: 'library', count: 'many', plural: 'libraries' }`), and `fromPlural` / `toPlural` on a transitive config. It flows through every generated member, type-level and runtime.
- **By default, `removeXFromY` / `moveXToY` affect only manual links** — an FK-derived link regenerates from the entity's foreign key on the next read (the FK is the source of truth). Turn on `syncForeignKeys` to have them write the FKs too. Getter-based `selectForeignId` sides can't be written back yet (planned: a write callback so they can).
- **A `'many'` side gets no composite set-lookup** (kept off to bound the generated surface).
- **`ordered` on a relationship side is reserved** and currently a no-op (arrays already keep insertion order).
- **Coupled to ngrx naming:** the runtime reads the merged store by ngrx's `${collection}EntityMap` convention.

## License

MIT
