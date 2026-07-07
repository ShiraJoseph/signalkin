import { TestBed } from '@angular/core/testing';
import { signalStore, type } from '@ngrx/signals';
import { entityConfig, withEntities } from '@ngrx/signals/entities';
import { withEntityAccessors } from './with-entity-accessors';
import { withEntityRelationship } from './with-entity-relationship';

interface Library {
  id: string;
  name: string;
}

interface Book {
  id: string;
  title: string;
  libraryId?: string;
  rowIds?: string[];
}

interface Row {
  id: string;
}

const libraryConfig = entityConfig({ entity: type<Library>(), collection: 'library' });
const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });
const rowConfig = entityConfig({ entity: type<Row>(), collection: 'row' });

const LibraryStore = signalStore(
  { providedIn: 'root' },
  withEntities(libraryConfig),
  withEntities(bookConfig),
  withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
  withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' }),
);

const ManualStore = signalStore(
  { providedIn: 'root' },
  withEntities(libraryConfig),
  withEntities(bookConfig),
  withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
  withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' }, { autoIndex: false }),
);

const RowStore = signalStore(
  { providedIn: 'root' },
  withEntities(rowConfig),
  withEntities(bookConfig),
  withEntityAccessors(),
  withEntityRelationship({ name: 'row', count: 2 }, { name: 'book', count: 'many' }),
);

const central: Library = { id: 'l1', name: 'Central' };
const eastside: Library = { id: 'l2', name: 'Eastside' };
const dune: Book = { id: 'b1', title: 'Dune', libraryId: 'l1' };
const hobbit: Book = { id: 'b2', title: 'The Hobbit', libraryId: 'l1' };
const emma: Book = { id: 'b3', title: 'Emma', libraryId: 'l2' };
const strayBook: Book = { id: 'b4', title: 'No Library Yet' };

describe('withEntityRelationship', () => {
  describe('foreign-key auto-indexing (1:many)', () => {
    let store: InstanceType<typeof LibraryStore>;

    beforeEach(() => {
      store = TestBed.inject(LibraryStore);
      store.setAllLibraries([central, eastside]);
      store.setAllBooks([dune, hobbit, emma, strayBook]);
    });

    it('indexes entities by their foreign key, both directions', () => {
      expect(store.booksByLibrary(central)).toEqual([dune, hobbit]);
      expect(store.booksByLibraryId('l2')).toEqual([emma]);
      expect(store.bookIdsByLibraryId('l1')).toEqual(['b1', 'b2']);
      expect(store.libraryByBook(dune)).toEqual(central);
      expect(store.libraryByBookId('b3')).toEqual(eastside);
      expect(store.libraryIdByBookId('b1')).toBe('l1');
    });

    it('skips entities without the foreign key', () => {
      expect(store.libraryByBookId('b4')).toBeUndefined();
      expect(store.booksByLibraryId('l1')).not.toContain(strayBook);
    });

    it('answers has and count checks', () => {
      expect(store.libraryHasBook('l1', 'b1')).toBe(true);
      expect(store.libraryHasBook('l2', 'b1')).toBe(false);
      expect(store.bookCountByLibrary('l1')).toBe(2);
      expect(store.libraryCountByBook('b3')).toBe(1);
    });

    it('re-points when the foreign key changes', () => {
      store.updateBook('b1', { libraryId: 'l2' });
      expect(store.libraryIdByBookId('b1')).toBe('l2');
      expect(store.bookCountByLibrary('l1')).toBe(1);
    });

    it('prunes removed entities from lookups', () => {
      store.removeBook('b1');
      expect(store.booksByLibraryId('l1')).toEqual([hobbit]);

      store.removeLibrary('l2');
      expect(store.libraryByBookId('b3')).toBeUndefined();
    });

    it('links a foreign-key-less entity manually', () => {
      store.addBookToLibrary('l1', 'b4');
      expect(store.booksByLibraryId('l1')).toContain(strayBook);

      store.removeBookFromLibrary('l1', 'b4');
      expect(store.booksByLibraryId('l1')).not.toContain(strayBook);

      store.addBookToLibrary('l1', 'b4');
      store.moveBookToLibrary('b4', 'l2');
      expect(store.libraryIdByBookId('b4')).toBe('l2');
      expect(store.libraryHasBook('l1', 'b4')).toBe(false);
    });
  });

  describe('autoIndex: false', () => {
    it('ignores foreign keys and only follows manual links', () => {
      const store = TestBed.inject(ManualStore);
      store.setAllLibraries([central]);
      store.setAllBooks([dune]);

      expect(store.booksByLibraryId('l1')).toEqual([]);

      store.addBookToLibrary('l1', 'b1');
      expect(store.booksByLibraryId('l1')).toEqual([dune]);
    });
  });

  describe('syncForeignKeys (on by default)', () => {
    const SyncStore = signalStore(
      { providedIn: 'root' },
      withEntities(libraryConfig),
      withEntities(bookConfig),
      withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
      withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' }),
    );

    let store: InstanceType<typeof SyncStore>;

    beforeEach(() => {
      store = TestBed.inject(SyncStore);
      store.setAllLibraries([central, eastside]);
      store.setAllBooks([dune, hobbit]);
    });

    it('makes remove stick for an FK-derived link by clearing the foreign key', () => {
      store.removeBookFromLibrary('l1', 'b1');
      expect(store.bookById('b1')?.libraryId).toBeUndefined();
      expect(store.libraryByBookId('b1')).toBeUndefined();
      expect(store.booksByLibraryId('l1')).toEqual([hobbit]);
    });

    it('re-points the foreign key on move', () => {
      store.moveBookToLibrary('b1', 'l2');
      expect(store.bookById('b1')?.libraryId).toBe('l2');
      expect(store.libraryIdByBookId('b1')).toBe('l2');
      expect(store.booksByLibraryId('l1')).toEqual([hobbit]);
    });

    it('drops the id from an array foreign key on remove', () => {
      const ArraySyncStore = signalStore(
        { providedIn: 'root' },
        withEntities(rowConfig),
        withEntities(bookConfig),
        withEntityAccessors(),
        withEntityRelationship({ name: 'row', count: 2 }, { name: 'book', count: 'many' }),
      );
      const arrayStore = TestBed.inject(ArraySyncStore);
      arrayStore.setAllRows([{ id: 'r1' }, { id: 'r2' }]);
      arrayStore.setAllBooks([{ id: 'b9', title: 'Everywhere', rowIds: ['r1', 'r2'] }]);

      arrayStore.removeBookFromRow('r1', 'b9');
      expect(arrayStore.bookById('b9')?.rowIds).toEqual(['r2']);
      expect(arrayStore.rowsByBookId('b9')).toEqual([{ id: 'r2' }]);
    });

    it('skips a getter-based selectForeignId side instead of writing', () => {
      const GetterStore = signalStore(
        { providedIn: 'root' },
        withEntities(libraryConfig),
        withEntities(bookConfig),
        withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
        withEntityRelationship(
          { name: 'library', count: 1 },
          { name: 'book', count: 'many', selectForeignId: (book) => book.libraryId },
        ),
      );
      const getterStore = TestBed.inject(GetterStore);
      getterStore.setAllLibraries([central]);
      getterStore.setAllBooks([dune]);

      getterStore.removeBookFromLibrary('l1', 'b1');
      expect(getterStore.bookById('b1')?.libraryId).toBe('l1');
      expect(getterStore.libraryIdByBookId('b1')).toBe('l1');
    });

    it('never writes entities when syncForeignKeys is false', () => {
      const OptOutStore = signalStore(
        { providedIn: 'root' },
        withEntities(libraryConfig),
        withEntities(bookConfig),
        withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
        withEntityRelationship(
          { name: 'library', count: 1 },
          { name: 'book', count: 'many' },
          { syncForeignKeys: false },
        ),
      );
      const optOutStore = TestBed.inject(OptOutStore);
      optOutStore.setAllLibraries([central]);
      optOutStore.setAllBooks([dune]);

      optOutStore.removeBookFromLibrary('l1', 'b1');
      expect(optOutStore.bookById('b1')?.libraryId).toBe('l1');
      expect(optOutStore.libraryIdByBookId('b1')).toBe('l1');
    });
  });

  describe('composite set-lookup (fixed count 2)', () => {
    it('finds the single entity pinned by a full id-set, order-insensitively', () => {
      const store = TestBed.inject(RowStore);
      const frontRow: Row = { id: 'r1' };
      const backRow: Row = { id: 'r2' };
      const crossShelved: Book = { id: 'b9', title: 'Everywhere', rowIds: ['r1', 'r2'] };
      store.setAllRows([frontRow, backRow]);
      store.setAllBooks([crossShelved]);

      expect(store.rowsByBook(crossShelved)).toEqual([frontRow, backRow]);
      expect(store.bookByRowIds('r2', 'r1')).toEqual(crossShelved);
      expect(store.bookByRows(backRow, frontRow)).toEqual(crossShelved);
      expect(store.bookIdByRowIds('r1', 'r2')).toBe('b9');
      expect(store.bookByRowIds('r1')).toBeUndefined();
    });
  });
});
