# signalkin

This is a library with a set of custom, performant methods for NgRx's `signalStore`. 

_See [NgRx SignalStore entity management guide](https://ngrx.io/guide/signals/signal-store/entity-management) to learn about entity signals and how to use them!_

[![npm](https://img.shields.io/npm/v/signalkin.svg)](https://www.npmjs.com/package/signalkin)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Angular 22](https://img.shields.io/badge/Angular-22-dd0031.svg)](https://angular.dev)
[![@ngrx/signals 21](https://img.shields.io/badge/%40ngrx%2Fsignals-21-purple.svg)](https://ngrx.io/guide/signals)

## Install

```
npm install signalkin
```

Peer dependencies: `@angular/core` and `@ngrx/signals`

---

## Usage

> Any method that identifies an entity - a lookup, a count, or a mutation like `removeBook` / `addBookToAuthor` - accepts the entity or its id. Pass whichever you're holding.

### Method: `withEntityAccessors(...configs)`
- Reduces boilerplate around entity signals (no need for `patchState`).

#### 1. Add to signal store
```ts
...
import { withEntityAccessors } from 'signalkin'; // <-- import

interface Task { id: string; }

export const TaskStore = signalStore(
    ...
    withEntities(entityConfig({ entity: type<Task>(), collection: 'task'})),
    withEntityAccessors() // <--- Add this
);
```

#### 2. Receive a bunch of getters/setters
```ts
@Component({
  selector: 'app-root'
})
export class App {
  constructor(){
    store = inject(TaskStore);
    
    // <-- you get free access to these signals:
    store.tasks(); // Array<Task>
    store.taskMap(); // Record<string, Task>
    store.taskCount(); // number
    store.taskById(id); // Task | undefined (id -> entity resolver)
    store.hasTask(task); // boolean (task or id)
    
    // <-- as well as these signal setters:
    store.addTask(task);
    store.addTasks(tasks);
    store.prependTask(task);
    store.prependTasks(tasks);
    store.setTask(task);
    store.setTasks(tasks);
    store.setAllTasks(tasks);
    store.upsertTask(task);
    store.upsertTasks(tasks);
    store.updateTask(id, changes);
    store.updateTasks(ids, changes);
    store.updateAllTasks(changes)
    store.removeTask(id);
    store.removeTasks(ids);
    store.removeAllTasks();
  }
}
```

---

### Method: `withEntityRelationship(from, to, options?)`
- Lets you link two collections with primary and foreign keys - for frontend "database" management without the O(n^2) lookups

#### 1. Add to signalStore
```ts
import { withEntityRelationship } from 'signalkin'; // <-- import

interface Author { id: string; }
interface Book { id: string; authorId: string } // <-- add an id for the parent entity to the child

export const LibraryStore = signalStore(
  ...
  withEntities(entityConfig({ entity: type<Book>(), collection: 'book' })),
  withEntities(entityConfig({ entity: type<Author>(), collection: 'author' })),
  
  // <-- Add this after your entities to describe their relationship:
  withEntityRelationship(
    { collection: 'author', count: 1 }, 
    { collection: 'book', count: 'many' }
  ) // this is a one-to-many relationship (use any number or 'many' as the count to adjust)
);
```

The side shape matches an `entityConfig(...)`, so you can spread one in and just add `count`:
```ts
withEntityRelationship({ ...authorConfig, count: 1 }, { ...bookConfig, count: 'many' });
```

#### 2. Receive cross-entity signals, methods and auto-updates to ids
```ts
@Component({
  selector: 'app-root'
})
export class App {
  constructor(){
    store = inject(LibraryStore);
    
    // <-- You get free access to these getters (each argument takes the entity or its id):
    store.bookHasAuthor(book, author);
    store.authorHasBook(author, book);
    store.bookCountByAuthor(author);
    store.authorCountByBook(book); // (in a 1:many relationship this will always be 1)
    
    store.booksByAuthor(author);   // Book[]
    store.bookIdsByAuthor(author);
    store.authorByBook(book);      // Author | undefined
    store.authorIdByBook(book);

    // A side with count > 1 also gets a composite lookup keyed by its FULL id-set. Here the book
    // side is 'many', so a complete set of an author's books pins that one author:
    store.authorByBooks(...books); // Author | undefined
    store.authorIdByBooks(...books);
    
    // <-- as well as these setters, which will update foreign key values for all entities involved:
    store.addBookToAuthor(authorId, bookId);
    store.removeBookFromAuthor(authorId, bookId);
    store.moveBookToAuthor(bookId, authorId);
  }
}
```

---

### Method: `withTransitiveRelationship({ from, to, through, ... })`

- Lookups between two collections that walk through intermediary collection(s)

#### 1. Add to signalStore
```ts
...
import { ..., withTransitiveRelationship } from 'signalkin'; // <-- import

interface Team { id: string; }
interface Project { id: string; teamId: string } // <-- add an id to the child for the parent entity
interface Task {id: string; projectId: string} // <-- add an id to the child for the parent entity (no need for the "grandparent" id)

export const TaskStore = signalStore(
  ...
  withEntities(entityConfig({ entity: type<Team>(), collection: 'team' })),
  withEntities(entityConfig({ entity: type<Project>(), collection: 'project' })),
  withEntities(entityConfig({ entity: type<Task>(), collection: 'task' })),

  // Define 2 or more relationships
  withEntityRelationship({ collection: 'team', count: 1 }, { collection: 'project', count: 'many' }),
  withEntityRelationship({ collection: 'project', count: 1 }, { collection: 'task', count: 'many' }),

  withTransitiveRelationship({ from: 'team', to: 'task', through: 'project' }), // <-- Add this to get a "grandparent" relationship
);
```
#### 2. Receive grandparent-to-grandchild signals getters:
```ts
@Component({
  selector: 'app-root'
})
export class App {
  constructor(){
    store = inject(TaskStore);
    
    // <-- Now you get access to these getters (each takes the endpoint entity or its id):
    store.tasksByTeam(team);   // Task[]
    store.taskIdsByTeam(team);

    // <-- As well as the reverse direction (a walk can fan out, so these also return arrays):
    store.teamsByTask(task);   // Team[]
    store.teamIdsByTask(task);
  }
}
```

---

### Customization

#### Custom id property
- Set `selectId` / `selectForeignId` for a collection that keys on something other than `id` or `<foreignCollection>Id`. `selectId` matches `entityConfig`, so spreading a config carries it in:

```ts
withEntityRelationship(
  { collection: 'team', count: 1, selectId: 'id2' }, // <-- Bypass the default that looks for the primary key `id` on each team
  { collection: 'project', count: 'many', selectId: 'id2', selectForeignId: 'teamId2' }, // <-- Bypass the default that looks for the foreign key `teamId` (or teamIds for a 'many' relationship) on each project
)
```

- `selectForeignId` also takes a callback, but signalkin can then no longer clean up foreign keys for you:

```ts
withEntityRelationship(
  { collection: 'team', count: 1 },
  { collection: 'project', count: 'many', selectForeignId: project => project.teamId2 }, // <-- callback, so signalkin won't sync foreign keys
);
```

#### Pluralization
- Default pluralization adds an `s` to the collection name. Set `plural` / `fromPlural` / `toPlural` for an irregular noun:

```ts

withEntityAccessors({ ...libraryConfig, plural: 'libraries' }); // <-- plural
withEntityRelationship({ collection: 'library', count: 'many', plural: 'libraries' }, ...); // <-- plural
withTransitiveRelationship({from: 'library', to: 'shelf', through: ['row'], fromPlural: 'libraries', toPlural: 'shelves'}); // <-- fromPlural, toPlural
```

#### Disable auto-updates
- If you don't want signalkin to update the store on your behalf you can turn it off, one relationship at a time:
```ts
withEntityRelationship(
  { collection: 'team', count: 1},
  { collection: 'project', count: 'many'},
  {
    autoIndex: false, // <-- stop signalkin from automatically building index tables from foreign keys
    syncForeignKeys: false, // <-- stop signalkin from clearing a project's teamId when you delete its team
    compositeLookups: false // <-- skip the set-lookups (e.g. projectByTeams) for sides that relate to more than one
  }
);
```
---

## Recipes

### Many-to-many, linked by hand

Articles carry many tags; a tag applies to many articles. A pure m:n has no single foreign key, so link the two sides with the mutation methods instead of a FK.

```
Article  >───<  Tag        (many articles per tag, many tags per article)
```

```ts
interface Article { id: string; title: string; }
interface Tag { id: string; label: string; }

export const BlogStore = signalStore(
  withEntities(entityConfig({ entity: type<Article>(), collection: 'article' })),
  withEntities(entityConfig({ entity: type<Tag>(), collection: 'tag' })),
  withEntityAccessors(),
  withEntityRelationship({ collection: 'article', count: 'many' }, { collection: 'tag', count: 'many' }),
);
```

```ts
export class ArticleTags {
  private store = inject(BlogStore);
  articleId = input.required<string>();

  // computed = reactive: re-derives whenever links or entities change
  tags = computed(() => this.store.tagsByArticle(this.articleId()));    // Tag[]
  tagCount = computed(() => this.store.tagCountByArticle(this.articleId()));

  add(tagId: string) { this.store.addTagToArticle(this.articleId(), tagId); }
  remove(tagId: string) { this.store.removeTagFromArticle(this.articleId(), tagId); }
}
```

---

### A fixed set as a composite key

A direct-message thread has exactly 2 participants; a user has many threads. When a side has a fixed count of 2+, that full set of ids pins exactly one of the other side, so you get a variadic composite lookup (order doesn't matter). Here: given a pair of users, find their thread.

```
Thread  ──2──  User        (exactly 2 users per thread, many threads per user)
```

```ts
interface User { id: string; name: string; }
interface Thread { id: string; userIds: [string, string]; } // 2 participants -> auto-indexed

export const ChatStore = signalStore(
  withEntities(entityConfig({ entity: type<User>(), collection: 'user' })),
  withEntities(entityConfig({ entity: type<Thread>(), collection: 'thread' })),
  withEntityAccessors(),
  withEntityRelationship({ collection: 'user', count: 2 }, { collection: 'thread', count: 'many' }),
);
```

```ts
export class DirectMessage {
  private store = inject(ChatStore);
  me = input.required<string>();
  them = input.required<string>();

  thread = computed(() => this.store.threadByUsers(this.me(), this.them())); // Thread | undefined
  myThreads = computed(() => this.store.threadsByUser(this.me()));           // Thread[]
}
```

---

### Grandparent lookup over API data

A region has many shops; a shop has many sales. Neither region nor sale references the other, but a transitive relationship walks region → shop → sale. Load all three collections from an API with the generated setters, and the FK indexes (`regionId`, `shopId`) build themselves.

```
Region  ──1:many──>  Shop  ──1:many──>  Sale
```

```ts
interface Region { id: string; name: string; }
interface Shop { id: string; regionId: string; name: string; }
interface Sale { id: string; shopId: string; amount: number; }

export const SalesStore = signalStore(
  withEntities(entityConfig({ entity: type<Region>(), collection: 'region' })),
  withEntities(entityConfig({ entity: type<Shop>(), collection: 'shop' })),
  withEntities(entityConfig({ entity: type<Sale>(), collection: 'sale' })),
  withEntityAccessors(),
  withEntityRelationship({ collection: 'region', count: 1 }, { collection: 'shop', count: 'many' }),
  withEntityRelationship({ collection: 'shop', count: 1 }, { collection: 'sale', count: 'many' }),
  withTransitiveRelationship({ from: 'region', to: 'sale', through: 'shop' }),
);
```

```ts
export class RegionDashboard {
  private store = inject(SalesStore);
  private http = inject(HttpClient);
  regionId = input.required<string>();

  sales = computed(() => this.store.salesByRegion(this.regionId())); // Sale[], walks region -> shop -> sale
  total = computed(() => this.sales().reduce((sum, sale) => sum + sale.amount, 0));

  async load() {
    const [regions, shops, sales] = await Promise.all([
      firstValueFrom(this.http.get<Region[]>('/api/regions')),
      firstValueFrom(this.http.get<Shop[]>('/api/shops')),
      firstValueFrom(this.http.get<Sale[]>('/api/sales')),
    ]);
    this.store.setAllRegions(regions);
    this.store.setAllShops(shops);
    this.store.setAllSales(sales); // indexes auto-populate from regionId / shopId - no manual linking
  }
}
```

---
## Contributing

Contributions are welcome. The repo is an Angular workspace with two projects: `projects/signalkin` (the published library, source in `src/lib`) and `projects/sandbox` (a throwaway app whose `demo.store.typecheck.ts` asserts the generated types resolve through the built package).

```
npx ng build signalkin  # build library to dist/signalkin (build this before the sandbox)
npx ng build sandbox     # type-check the sandbox against the built package
npx ng test signalkin    # vitest suite
```

Before opening a PR, make sure all three pass, and add a sandbox type assertion for any type-level change. Work on a feature branch and open a PR rather than pushing to `main`. Agent-specific guidance (how the member names are derived, common pitfalls) lives in [`AGENTS.md`](AGENTS.md).

---

## License

MIT
