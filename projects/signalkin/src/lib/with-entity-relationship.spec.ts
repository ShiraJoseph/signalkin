import { TestBed } from '@angular/core/testing';
import { signalStore, type } from '@ngrx/signals';
import { entityConfig } from '@ngrx/signals/entities';
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
  aisleIds?: string[];
}

interface Aisle {
  id: string;
}

const libraryConfig = entityConfig({ entity: type<Library>(), collection: 'library' });
const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });
const aisleConfig = entityConfig({ entity: type<Aisle>(), collection: 'aisle' });

const LibraryStore = signalStore(
  { providedIn: 'root' },
  withEntityAccessors(libraryConfig),
  withEntityAccessors(bookConfig),
  withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' }),
);

const ManualStore = signalStore(
  { providedIn: 'root' },
  withEntityAccessors(libraryConfig),
  withEntityAccessors(bookConfig),
  withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' }, { autoIndex: false }),
);

const AisleStore = signalStore(
  { providedIn: 'root' },
  withEntityAccessors(aisleConfig),
  withEntityAccessors(bookConfig),
  withEntityRelationship({ name: 'aisle', count: 2 }, { name: 'book', count: 'many' }),
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
      store.setAllLibrarys([central, eastside]);
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
      store.setAllLibrarys([central]);
      store.setAllBooks([dune]);

      expect(store.booksByLibraryId('l1')).toEqual([]);

      store.addBookToLibrary('l1', 'b1');
      expect(store.booksByLibraryId('l1')).toEqual([dune]);
    });
  });

  describe('composite set-lookup (fixed count 2)', () => {
    it('finds the single entity pinned by a full id-set, order-insensitively', () => {
      const store = TestBed.inject(AisleStore);
      const aisleA: Aisle = { id: 'a1' };
      const aisleB: Aisle = { id: 'a2' };
      const crossShelved: Book = { id: 'b9', title: 'Everywhere', aisleIds: ['a1', 'a2'] };
      store.setAllAisles([aisleA, aisleB]);
      store.setAllBooks([crossShelved]);

      expect(store.aislesByBook(crossShelved)).toEqual([aisleA, aisleB]);
      expect(store.bookByAisleIds('a2', 'a1')).toEqual(crossShelved);
      expect(store.bookByAisles(aisleB, aisleA)).toEqual(crossShelved);
      expect(store.bookIdByAisleIds('a1', 'a2')).toBe('b9');
      expect(store.bookByAisleIds('a1')).toBeUndefined();
    });
  });
});
