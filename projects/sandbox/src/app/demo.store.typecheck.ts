/**
 * Compile-time assertions that the features resolve REAL entity types (not `never`/`unknown`)
 * when composed through the published package. Never executed; failing any assertion fails
 * the sandbox build.
 */
import { inject } from '@angular/core';
import { signalStore, type } from '@ngrx/signals';
import { entityConfig, withEntities } from '@ngrx/signals/entities';
import { withEntityRelationship } from 'signalkin';
import { Book, DemoStore, Library, LibrarySystem } from './demo.store';

const assertType = <T>(value: T): T => value;

// Branded ids must survive: a `selectId` getter that returns a branded id makes the id-returning
// lookups return that brand, not a widened `EntityId`.
type WidgetId = `w-${string}`;
type GadgetId = `g-${string}`;
interface Widget {
  wid: WidgetId;
}
interface Gadget {
  gid: GadgetId;
  widgetRef: WidgetId;
}

const widgetConfig = entityConfig({ entity: type<Widget>(), collection: 'widget', selectId: (widget) => widget.wid });
const gadgetConfig = entityConfig({ entity: type<Gadget>(), collection: 'gadget', selectId: (gadget) => gadget.gid });

const BrandedStore = signalStore(
  withEntities(widgetConfig),
  withEntities(gadgetConfig),
  withEntityRelationship(
    { collection: 'widget', count: 1, selectId: (widget: Widget) => widget.wid },
    { collection: 'gadget', count: 'many', selectId: (gadget: Gadget) => gadget.gid, selectForeignId: (gadget: Gadget) => gadget.widgetRef },
  ),
);

export const brandedProbe = (): void => {
  const store = inject(BrandedStore);
  // Id-returning lookups keep the brand (GadgetId[] / WidgetId), not EntityId.
  assertType<GadgetId[]>(store.gadgetIdsByWidget('w-1'));
  assertType<WidgetId | undefined>(store.widgetIdByGadget('g-1'));
};

// A string-key selectId keeps the brand even when the side is spread from an entityConfig: ngrx widens
// the config's getter to EntityId, but naming the property ('wid'/'gid') re-reads its branded type.
const StringKeyStore = signalStore(
  withEntities(widgetConfig),
  withEntities(gadgetConfig),
  withEntityRelationship(
    { ...widgetConfig, count: 1, selectId: 'wid' },
    { ...gadgetConfig, count: 'many', selectId: 'gid' },
  ),
);

export const stringKeyProbe = (): void => {
  const store = inject(StringKeyStore);
  assertType<GadgetId[]>(store.gadgetIdsByWidget('w-1'));
  assertType<WidgetId | undefined>(store.widgetIdByGadget('g-1'));
};

// By-family: where a member has more than one owner (owner side not count 1) and the member side is
// 'many', index/ordering name the owner explicitly as the last argument.
interface Shelf {
  id: string;
}
interface Tome {
  id: string;
  shelfIds: [string, string];
}
const shelfConfig = entityConfig({ entity: type<Shelf>(), collection: 'shelf' });
const tomeConfig = entityConfig({ entity: type<Tome>(), collection: 'tome' });
const ByStore = signalStore(
  withEntities(shelfConfig),
  withEntities(tomeConfig),
  withEntityRelationship({ collection: 'shelf', count: 2 }, { collection: 'tome', count: 'many' }),
);

export const byProbe = (): void => {
  const store = inject(ByStore);
  assertType<number>(store.indexOfTomeByShelf('t1', 's1'));
  store.swapTomesByShelf('t1', 't2', 's1');
  store.reorderTomesByShelf(['t1', 't2'], 's1');
  store.moveTomeByShelfToIndex('t1', 0, 's1');
  // mirror direction, both sides multi: a tome owns its fixed pair of shelfIds, so shelves order too.
  assertType<number>(store.indexOfShelfByTome('s1', 't1'));
  store.swapShelfsByTome('s1', 's2', 't1');
  store.reorderShelfsByTome(['s1', 's2'], 't1');
  store.moveShelfByTomeToIndex('s1', 0, 't1');
  // filtered directional lookup, both sides multi so both directions exist (entity + id forms).
  assertType<Shelf[]>(store.shelfsByTomeAtIndex('t1', 0));
  assertType<(string | number)[]>(store.shelfIdsByTomeAtIndex('t1', 0));
  // the fixed-count owner (a tome holds an ordered pair of shelfIds) gets it too.
  assertType<Tome[]>(store.tomesByShelfAtIndex('s1', 0));
  assertType<(string | number)[]>(store.tomeIdsByShelfAtIndex('s1', 0));
};

export const typecheckProbe = (): void => {
  const store = inject(DemoStore);
  const citywide: LibrarySystem = { id: 's1', name: 'City-Wide' };
  const central: Library = { id: 'l1', librarySystemId: 's1', name: 'Central' };
  const dune: Book = { id: 'b1', libraryId: 'l1', title: 'Dune' };

  // Direct relationship, both directions, entity or id accepted by the same method.
  assertType<Book[]>(store.booksByLibrary(central));
  assertType<Book[]>(store.booksByLibrary('l1'));
  assertType<Library | undefined>(store.libraryByBook(dune));
  assertType<Library | undefined>(store.libraryByBook('b1'));
  assertType<(string | number)[]>(store.bookIdsByLibrary('l1'));
  assertType<boolean>(store.libraryHasBook('l1', 'b1'));
  assertType<boolean>(store.libraryHasBook(central, dune));
  assertType<number>(store.bookCountByLibrary('l1'));
  store.addBookToLibrary('l1', 'b1');
  store.addBookToLibrary(central, dune); // entities accepted too
  store.removeBookFromLibrary('l1', 'b1');
  store.moveBookToLibrary('b1', 'l2');
  store.moveBookToLibrary(dune, central);

  // indexOf + ordering, generated in the single-owner direction (a book has one library).
  assertType<number>(store.indexOfLibraryBook('b1'));
  assertType<number>(store.indexOfLibraryBook(dune));
  store.swapLibraryBooks('b1', 'b2');
  store.swapLibraryBooks(dune, dune);
  store.reorderLibraryBooks(['b1', 'b2']);
  store.reorderLibraryBooks([dune]);
  store.moveLibraryBookToIndex('b1', 0);
  store.moveLibraryBookToIndex(dune, 1);

  // Collection-order ordering from the accessors, on any collection.
  store.swapBooks('b1', 'b2');
  store.reorderBooks([dune]);
  store.moveBookToIndex(dune, 0);

  // Transitive relationship: endpoints resolve through the intermediary.
  assertType<Book[]>(store.booksByLibrarySystem(citywide));
  assertType<LibrarySystem[]>(store.librarySystemsByBook(dune));

  // Entity accessors, generated for every collection by the no-config call.
  assertType<Book[]>(store.books());
  assertType<Record<string | number, Book>>(store.bookMap());
  assertType<number>(store.bookCount());
  assertType<Book | undefined>(store.bookById('b1'));
  assertType<boolean>(store.hasBook('b1'));
  assertType<boolean>(store.hasBook(dune));
  assertType<LibrarySystem[]>(store.librarySystems());

  // Custom plurals flow through generated names, type-level, from the packaged build.
  assertType<Library[]>(store.libraries());
  store.setAllLibraries([central]);
  assertType<Library[]>(store.librariesByLibrarySystem(citywide));
  assertType<Library[]>(store.librariesByLibrarySystem('s1'));
  store.addBook(dune);
  store.addBooks([dune]);
  store.prependBook(dune);
  store.setBook(dune);
  store.setAllBooks([dune]);
  store.upsertBook(dune);
  store.updateBook('b1', { title: 'Dune Messiah' });
  store.updateBook(dune, { title: 'Dune Messiah' }); // entity or id
  store.updateBooks(['b1'], (book) => ({ title: `${book.title}!` }));
  store.updateBooks([dune], (book) => ({ title: `${book.title}!` }));
  store.updateAllBooks({ title: 'Same' });
  store.removeBook('b1');
  store.removeBook(dune); // entity or id
  store.removeBooks(['b1']);
  store.removeBooks([dune]);
  store.removeBooks((book) => book.title === '');
  store.removeAllBooks();

  // Wrong entity type is rejected (a Book is not a Library).
  // @ts-expect-error
  store.booksByLibrary(dune);
};
