/**
 * Compile-time assertions that the features resolve REAL entity types (not `never`/`unknown`)
 * when composed through the published package. Never executed; failing any assertion fails
 * the sandbox build.
 */
import { inject } from '@angular/core';
import { Book, DemoStore, Library, LibrarySystem } from './demo.store';

const assertType = <T>(value: T): T => value;

export const typecheckProbe = (): void => {
  const store = inject(DemoStore);
  const citywide: LibrarySystem = { id: 's1', name: 'City-Wide' };
  const central: Library = { id: 'l1', librarySystemId: 's1', name: 'Central' };
  const dune: Book = { id: 'b1', libraryId: 'l1', title: 'Dune' };

  // Direct relationship, both directions, entity and id variants.
  assertType<Book[]>(store.booksByLibrary(central));
  assertType<Book[]>(store.booksByLibraryId('l1'));
  assertType<Library | undefined>(store.libraryByBook(dune));
  assertType<(string | number)[]>(store.bookIdsByLibraryId('l1'));
  assertType<boolean>(store.libraryHasBook('l1', 'b1'));
  assertType<number>(store.bookCountByLibrary('l1'));
  store.addBookToLibrary('l1', 'b1');
  store.removeBookFromLibrary('l1', 'b1');
  store.moveBookToLibrary('b1', 'l2');

  // Transitive relationship: endpoints resolve through the intermediary.
  assertType<Book[]>(store.booksByLibrarySystem(citywide));
  assertType<LibrarySystem[]>(store.librarySystemsByBook(dune));

  // Entity accessors, generated for every collection by the no-config call.
  assertType<Book[]>(store.books());
  assertType<Record<string | number, Book>>(store.bookMap());
  assertType<number>(store.bookCount());
  assertType<Book | undefined>(store.bookById('b1'));
  assertType<boolean>(store.hasBook('b1'));
  assertType<LibrarySystem[]>(store.librarySystems());

  // Custom plurals flow through generated names, type-level, from the packaged build.
  assertType<Library[]>(store.libraries());
  store.setAllLibraries([central]);
  assertType<Library[]>(store.librariesByLibrarySystem(citywide));
  assertType<Library[]>(store.librariesByLibrarySystemId('s1'));
  store.addBook(dune);
  store.addBooks([dune]);
  store.prependBook(dune);
  store.setBook(dune);
  store.setAllBooks([dune]);
  store.upsertBook(dune);
  store.updateBook('b1', { title: 'Dune Messiah' });
  store.updateBooks(['b1'], (book) => ({ title: `${book.title}!` }));
  store.updateAllBooks({ title: 'Same' });
  store.removeBook('b1');
  store.removeBooks((book) => book.title === '');
  store.removeAllBooks();

  // Wrong entity type is rejected (a Book is not a Library).
  // @ts-expect-error
  store.booksByLibrary(dune);
};
