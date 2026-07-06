import { TestBed } from '@angular/core/testing';
import { signalStore, type } from '@ngrx/signals';
import { entityConfig, withEntities } from '@ngrx/signals/entities';
import { withEntityAccessors } from './with-entity-accessors';

interface Book {
  id: string;
  title: string;
  pages: number;
}

interface Genre {
  code: string;
  label: string;
}

interface Library {
  id: string;
  name: string;
}

const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });
const genreConfig = entityConfig({ entity: type<Genre>(), collection: 'genre', selectId: (genre) => genre.code });
const libraryConfig = entityConfig({ entity: type<Library>(), collection: 'library' });

const BookStore = signalStore(
  { providedIn: 'root' },
  withEntities(bookConfig),
  withEntities(genreConfig),
  withEntityAccessors(bookConfig, genreConfig),
);

const AllStore = signalStore(
  { providedIn: 'root' },
  withEntities(bookConfig),
  withEntities(libraryConfig),
  withEntityAccessors(),
);

const OnlyBooksStore = signalStore(
  { providedIn: 'root' },
  withEntities(bookConfig),
  withEntities(genreConfig),
  withEntityAccessors(bookConfig),
);

const dune: Book = { id: 'b1', title: 'Dune', pages: 412 };
const hobbit: Book = { id: 'b2', title: 'The Hobbit', pages: 310 };
const emma: Book = { id: 'b3', title: 'Emma', pages: 474 };

describe('withEntityAccessors', () => {
  let store: InstanceType<typeof BookStore>;

  beforeEach(() => {
    store = TestBed.inject(BookStore);
    store.setAllBooks([dune, hobbit]);
  });

  it('covers every collection on the store when called with no configs', () => {
    const allStore = TestBed.inject(AllStore);
    allStore.addBook(dune);
    allStore.addLibrary({ id: 'l1', name: 'Central' });
    expect(allStore.books()).toEqual([dune]);
    expect(allStore.librarys()).toEqual([{ id: 'l1', name: 'Central' }]);
    expect(allStore.libraryCount()).toBe(1);
  });

  it('covers only the passed configs’ collections when configs are given', () => {
    const onlyBooks = TestBed.inject(OnlyBooksStore);
    onlyBooks.addBook(dune);
    expect(onlyBooks.books()).toEqual([dune]);
    expect((onlyBooks as any).genres).toBeUndefined();
    expect((onlyBooks as any).addGenre).toBeUndefined();
  });

  it('exposes the collection through books / bookMap / bookCount alongside ngrx’s own bookIds', () => {
    expect(store.books()).toEqual([dune, hobbit]);
    expect(store.bookMap()).toEqual({ b1: dune, b2: hobbit });
    expect(store.bookCount()).toBe(2);
    expect(store.bookIds()).toEqual(['b1', 'b2']);
  });

  it('looks up by id with bookById and hasBook', () => {
    expect(store.bookById('b2')).toEqual(hobbit);
    expect(store.bookById('nope')).toBeUndefined();
    expect(store.hasBook('b1')).toBe(true);
    expect(store.hasBook('nope')).toBe(false);
  });

  it('adds with addBook / addBooks, ignoring an already-present id', () => {
    store.addBook(emma);
    expect(store.bookCount()).toBe(3);

    store.addBook({ ...dune, title: 'Not Dune' });
    expect(store.bookById('b1')?.title).toBe('Dune');

    store.addBooks([{ id: 'b4', title: 'Piranesi', pages: 245 }]);
    expect(store.hasBook('b4')).toBe(true);
  });

  it('prepends at the front of the id order', () => {
    store.prependBook(emma);
    expect(store.bookIds()[0]).toBe('b3');

    store.prependBooks([{ id: 'b4', title: 'Piranesi', pages: 245 }]);
    expect(store.bookIds()[0]).toBe('b4');
  });

  it('replaces with setBook and the whole collection with setAllBooks', () => {
    store.setBook({ id: 'b1', title: 'Dune Messiah', pages: 256 });
    expect(store.bookById('b1')?.title).toBe('Dune Messiah');

    store.setAllBooks([emma]);
    expect(store.books()).toEqual([emma]);
  });

  it('upserts new and existing entities', () => {
    store.upsertBook(emma);
    expect(store.bookCount()).toBe(3);

    store.upsertBook({ ...hobbit, pages: 320 });
    expect(store.bookById('b2')?.pages).toBe(320);

    store.upsertBooks([dune, { id: 'b4', title: 'Piranesi', pages: 245 }]);
    expect(store.bookCount()).toBe(4);
  });

  it('updates one, many (by ids or predicate), or all', () => {
    store.updateBook('b1', { pages: 500 });
    expect(store.bookById('b1')?.pages).toBe(500);

    store.updateBook('b2', (book) => ({ title: `${book.title}!` }));
    expect(store.bookById('b2')?.title).toBe('The Hobbit!');

    store.updateBooks(['b1', 'b2'], { pages: 100 });
    expect(store.books().map((book) => book.pages)).toEqual([100, 100]);

    store.updateBooks((book) => book.id === 'b1', { pages: 7 });
    expect(store.bookById('b1')?.pages).toBe(7);
    expect(store.bookById('b2')?.pages).toBe(100);

    store.updateAllBooks({ pages: 1 });
    expect(store.books().every((book) => book.pages === 1)).toBe(true);
  });

  it('removes one, many (by ids or predicate), or all', () => {
    store.addBook(emma);

    store.removeBook('b1');
    expect(store.hasBook('b1')).toBe(false);

    store.removeBooks(['b2']);
    expect(store.books()).toEqual([emma]);

    store.setAllBooks([dune, hobbit, emma]);
    store.removeBooks((book) => book.pages > 400);
    expect(store.bookIds()).toEqual(['b2']);

    store.removeAllBooks();
    expect(store.bookCount()).toBe(0);
  });

  it('honors a custom selectId from a passed config', () => {
    store.addGenre({ code: 'g1', label: 'scifi' });
    expect(store.genreById('g1')?.label).toBe('scifi');
    expect(store.hasGenre('g1')).toBe(true);

    store.updateGenre('g1', { label: 'sci-fi' });
    expect(store.genreById('g1')?.label).toBe('sci-fi');
  });

  it('throws a clear error when a passed config’s collection is missing from the store', () => {
    const BrokenStore = signalStore(
      { providedIn: 'root' },
      withEntities(bookConfig),
      withEntityAccessors(genreConfig as any),
    );

    expect(() => TestBed.inject(BrokenStore)).toThrowError(/genreEntityMap.*register withEntities/s);
  });
});
