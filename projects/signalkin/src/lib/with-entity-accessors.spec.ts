import { TestBed } from '@angular/core/testing';
import { signalStore, type } from '@ngrx/signals';
import { entityConfig } from '@ngrx/signals/entities';
import { withEntityAccessors } from './with-entity-accessors';

interface Book {
  id: string;
  title: string;
  pages: number;
}

const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });
const BookStore = signalStore({ providedIn: 'root' }, withEntityAccessors(bookConfig));

const dune: Book = { id: 'b1', title: 'Dune', pages: 412 };
const hobbit: Book = { id: 'b2', title: 'The Hobbit', pages: 310 };
const emma: Book = { id: 'b3', title: 'Emma', pages: 474 };

describe('withEntityAccessors', () => {
  let store: InstanceType<typeof BookStore>;

  beforeEach(() => {
    store = TestBed.inject(BookStore);
    store.setAllBooks([dune, hobbit]);
  });

  it('exposes the collection through books / bookMap / bookCount / bookIds', () => {
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

  it('respects a custom selectId', () => {
    interface Tag {
      key: string;
      label: string;
    }
    const TagStore = signalStore(
      { providedIn: 'root' },
      withEntityAccessors({ entity: type<Tag>(), collection: 'tag', selectId: (tag) => tag.key }),
    );
    const tagStore = TestBed.inject(TagStore);

    tagStore.addTag({ key: 't1', label: 'scifi' });
    expect(tagStore.tagById('t1')?.label).toBe('scifi');
    expect(tagStore.hasTag('t1')).toBe(true);

    tagStore.updateTag('t1', { label: 'sci-fi' });
    expect(tagStore.tagById('t1')?.label).toBe('sci-fi');
  });
});
