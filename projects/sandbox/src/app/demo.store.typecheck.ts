/**
 * Compile-time assertions that the features resolve REAL entity types (not `never`/`unknown`)
 * when composed through the published package. Never executed; failing any assertion fails
 * the sandbox build.
 */
import { inject } from '@angular/core';
import { signalStore, type } from '@ngrx/signals';
import { entityConfig, withEntities } from '@ngrx/signals/entities';
import { withEntityRelationship, withTransitiveRelationship } from 'signalkin';
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
