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

interface Student {
  id: string;
  groupIds: string[];
}

interface Group {
  id: string;
}

const libraryConfig = entityConfig({ entity: type<Library>(), collection: 'library' });
const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });
const rowConfig = entityConfig({ entity: type<Row>(), collection: 'row' });
const studentConfig = entityConfig({ entity: type<Student>(), collection: 'student' });
const groupConfig = entityConfig({ entity: type<Group>(), collection: 'group' });

const LibraryStore = signalStore(
  { providedIn: 'root' },
  withEntities(libraryConfig),
  withEntities(bookConfig),
  withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
  // Spreading the entityConfig works now that a side keys on `collection`.
  withEntityRelationship({ ...libraryConfig, count: 1 }, { collection: 'book', count: 'many' }),
);

const ManualStore = signalStore(
  { providedIn: 'root' },
  withEntities(libraryConfig),
  withEntities(bookConfig),
  withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
  withEntityRelationship({ collection: 'library', count: 1 }, { collection: 'book', count: 'many' }, { autoIndex: false }),
);

const RowStore = signalStore(
  { providedIn: 'root' },
  withEntities(rowConfig),
  withEntities(bookConfig),
  withEntityAccessors(),
  withEntityRelationship({ collection: 'row', count: 2 }, { collection: 'book', count: 'many' }),
);

const GroupStore = signalStore(
  { providedIn: 'root' },
  withEntities(studentConfig),
  withEntities(groupConfig),
  withEntityAccessors(),
  withEntityRelationship({ collection: 'student', count: 'many' }, { collection: 'group', count: 'many' }),
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
      expect(store.booksByLibrary('l2')).toEqual([emma]);
      expect(store.bookIdsByLibrary('l1')).toEqual(['b1', 'b2']);
      expect(store.libraryByBook(dune)).toEqual(central);
      expect(store.libraryByBook('b3')).toEqual(eastside);
      expect(store.libraryIdByBook('b1')).toBe('l1');
    });

    it('accepts an entity or its id in the same lookup', () => {
      expect(store.booksByLibrary('l1')).toEqual(store.booksByLibrary(central));
      expect(store.libraryByBook('b1')).toEqual(store.libraryByBook(dune));
    });

    it('skips entities without the foreign key', () => {
      expect(store.libraryByBook('b4')).toBeUndefined();
      expect(store.booksByLibrary('l1')).not.toContain(strayBook);
    });

    it('answers has and count checks (entity or id)', () => {
      expect(store.libraryHasBook('l1', 'b1')).toBe(true);
      expect(store.libraryHasBook(central, dune)).toBe(true);
      expect(store.libraryHasBook('l2', 'b1')).toBe(false);
      expect(store.bookCountByLibrary('l1')).toBe(2);
      expect(store.libraryCountByBook('b3')).toBe(1);
    });

    it('reports a book position within its library from the book alone (entity or id, -1 if absent)', () => {
      expect(store.indexOfLibraryBook('b1')).toBe(0);
      expect(store.indexOfLibraryBook(hobbit)).toBe(1);
      expect(store.indexOfLibraryBook('b4')).toBe(-1); // strayBook has no library
      // only the direction with a single owner is generated; a book has one library, so no reverse.
      expect((store as unknown as Record<string, unknown>)['indexOfBookLibrary']).toBeUndefined();
    });

    it('reorders a library books via swap, full reorder, and move-to-index', () => {
      expect(store.bookIdsByLibrary('l1')).toEqual(['b1', 'b2']);

      store.swapLibraryBooks('b1', 'b2');
      expect(store.bookIdsByLibrary('l1')).toEqual(['b2', 'b1']);

      store.moveLibraryBookToIndex('b1', 0);
      expect(store.bookIdsByLibrary('l1')).toEqual(['b1', 'b2']);

      store.reorderLibraryBooks([hobbit, dune]); // full set as entities
      expect(store.bookIdsByLibrary('l1')).toEqual(['b2', 'b1']);
    });

    it('ignores an incomplete reorder (strict full set)', () => {
      store.reorderLibraryBooks(['b1']); // missing b2
      expect(store.bookIdsByLibrary('l1')).toEqual(['b1', 'b2']);
    });

    it('finds the single parent from a full child-set (composite keyed by the many side)', () => {
      expect(store.libraryByBooks('b1', 'b2')).toEqual(central);
      expect(store.libraryByBooks(dune, hobbit)).toEqual(central);
      expect(store.libraryByBooks('b3')).toEqual(eastside);
      expect(store.libraryIdByBooks('b2', 'b1')).toBe('l1');
      // A partial set is not the key.
      expect(store.libraryByBooks('b1')).toBeUndefined();
    });

    it('re-points when the foreign key changes', () => {
      store.updateBook('b1', { libraryId: 'l2' });
      expect(store.libraryIdByBook('b1')).toBe('l2');
      expect(store.bookCountByLibrary('l1')).toBe(1);
    });

    it('prunes removed entities from lookups', () => {
      store.removeBook('b1');
      expect(store.booksByLibrary('l1')).toEqual([hobbit]);

      store.removeLibrary('l2');
      expect(store.libraryByBook('b3')).toBeUndefined();
    });

    it('links a foreign-key-less entity manually', () => {
      store.addBookToLibrary('l1', 'b4');
      expect(store.booksByLibrary('l1')).toContain(strayBook);

      store.removeBookFromLibrary('l1', 'b4');
      expect(store.booksByLibrary('l1')).not.toContain(strayBook);

      store.addBookToLibrary('l1', 'b4');
      store.moveBookToLibrary('b4', 'l2');
      expect(store.libraryIdByBook('b4')).toBe('l2');
      expect(store.libraryHasBook('l1', 'b4')).toBe(false);
    });

    it('accepts entities (not just ids) in the mutations', () => {
      store.addBookToLibrary(eastside, strayBook);
      expect(store.libraryHasBook(eastside, strayBook)).toBe(true);

      store.moveBookToLibrary(strayBook, central);
      expect(store.libraryIdByBook('b4')).toBe('l1');
    });
  });

  describe('autoIndex: false', () => {
    it('ignores foreign keys and only follows manual links', () => {
      const store = TestBed.inject(ManualStore);
      store.setAllLibraries([central]);
      store.setAllBooks([dune]);

      expect(store.booksByLibrary('l1')).toEqual([]);

      store.addBookToLibrary('l1', 'b1');
      expect(store.booksByLibrary('l1')).toEqual([dune]);
    });
  });

  describe('syncForeignKeys (on by default)', () => {
    const SyncStore = signalStore(
      { providedIn: 'root' },
      withEntities(libraryConfig),
      withEntities(bookConfig),
      withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
      withEntityRelationship({ collection: 'library', count: 1 }, { collection: 'book', count: 'many' }),
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
      expect(store.libraryByBook('b1')).toBeUndefined();
      expect(store.booksByLibrary('l1')).toEqual([hobbit]);
    });

    it('re-points the foreign key on move', () => {
      store.moveBookToLibrary('b1', 'l2');
      expect(store.bookById('b1')?.libraryId).toBe('l2');
      expect(store.libraryIdByBook('b1')).toBe('l2');
      expect(store.booksByLibrary('l1')).toEqual([hobbit]);
    });

    it('drops the id from an array foreign key on remove', () => {
      const ArraySyncStore = signalStore(
        { providedIn: 'root' },
        withEntities(rowConfig),
        withEntities(bookConfig),
        withEntityAccessors(),
        withEntityRelationship({ collection: 'row', count: 2 }, { collection: 'book', count: 'many' }),
      );
      const arrayStore = TestBed.inject(ArraySyncStore);
      arrayStore.setAllRows([{ id: 'r1' }, { id: 'r2' }]);
      arrayStore.setAllBooks([{ id: 'b9', title: 'Everywhere', rowIds: ['r1', 'r2'] }]);

      arrayStore.removeBookFromRow('r1', 'b9');
      expect(arrayStore.bookById('b9')?.rowIds).toEqual(['r2']);
      expect(arrayStore.rowsByBook('b9')).toEqual([{ id: 'r2' }]);
    });

    it('skips a getter-based selectForeignId side instead of writing', () => {
      const GetterStore = signalStore(
        { providedIn: 'root' },
        withEntities(libraryConfig),
        withEntities(bookConfig),
        withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
        withEntityRelationship(
          { collection: 'library', count: 1 },
          { collection: 'book', count: 'many', selectForeignId: (book) => book.libraryId },
        ),
      );
      const getterStore = TestBed.inject(GetterStore);
      getterStore.setAllLibraries([central]);
      getterStore.setAllBooks([dune]);

      getterStore.removeBookFromLibrary('l1', 'b1');
      expect(getterStore.bookById('b1')?.libraryId).toBe('l1');
      expect(getterStore.libraryIdByBook('b1')).toBe('l1');
    });

    it('never writes entities when syncForeignKeys is false', () => {
      const OptOutStore = signalStore(
        { providedIn: 'root' },
        withEntities(libraryConfig),
        withEntities(bookConfig),
        withEntityAccessors({ ...libraryConfig, plural: 'libraries' }, bookConfig),
        withEntityRelationship(
          { collection: 'library', count: 1 },
          { collection: 'book', count: 'many' },
          { syncForeignKeys: false },
        ),
      );
      const optOutStore = TestBed.inject(OptOutStore);
      optOutStore.setAllLibraries([central]);
      optOutStore.setAllBooks([dune]);

      optOutStore.removeBookFromLibrary('l1', 'b1');
      expect(optOutStore.bookById('b1')?.libraryId).toBe('l1');
      expect(optOutStore.libraryIdByBook('b1')).toBe('l1');
    });
  });

  describe('composite set-lookup (fixed count 2 -> single)', () => {
    it('finds the single entity pinned by a full id-set, order-insensitively', () => {
      const store = TestBed.inject(RowStore);
      const frontRow: Row = { id: 'r1' };
      const backRow: Row = { id: 'r2' };
      const crossShelved: Book = { id: 'b9', title: 'Everywhere', rowIds: ['r1', 'r2'] };
      store.setAllRows([frontRow, backRow]);
      store.setAllBooks([crossShelved]);

      expect(store.rowsByBook(crossShelved)).toEqual([frontRow, backRow]);
      expect(store.bookByRows('r2', 'r1')).toEqual(crossShelved);
      expect(store.bookByRows(backRow, frontRow)).toEqual(crossShelved);
      expect(store.bookIdByRows('r1', 'r2')).toBe('b9');
      expect(store.bookByRows('r1')).toBeUndefined();
    });

    it('exposes the other direction as an array (books keyed by row set)', () => {
      const store = TestBed.inject(RowStore);
      store.setAllRows([{ id: 'r1' }, { id: 'r2' }]);
      store.setAllBooks([{ id: 'b9', title: 'Everywhere', rowIds: ['r1', 'r2'] }]);

      // rowsByBooks keys by a full book-set and returns every matching row.
      expect(store.rowsByBooks('b9')).toEqual([{ id: 'r1' }, { id: 'r2' }]);
      expect(store.rowIdsByBooks('b9')).toEqual(['r1', 'r2']);
    });

    it('indexes and reorders a row books via the By-family (owner named explicitly)', () => {
      const store = TestBed.inject(RowStore);
      store.setAllRows([{ id: 'r1' }, { id: 'r2' }]);
      store.setAllBooks([
        { id: 'b1', title: 'A', rowIds: ['r1'] },
        { id: 'b2', title: 'B', rowIds: ['r1'] },
        { id: 'b3', title: 'C', rowIds: ['r1', 'r2'] },
      ]);

      expect(store.bookIdsByRow('r1')).toEqual(['b1', 'b2', 'b3']);
      expect(store.indexOfBookByRow('b3', 'r1')).toBe(2);
      expect(store.indexOfBookByRow('b3', 'r2')).toBe(0); // b3 is first (only) in r2

      store.swapBooksByRow('b1', 'b3', 'r1');
      expect(store.bookIdsByRow('r1')).toEqual(['b3', 'b2', 'b1']);

      store.moveBookByRowToIndex('b3', 2, 'r1');
      expect(store.bookIdsByRow('r1')).toEqual(['b2', 'b1', 'b3']);

      store.reorderBooksByRow(['b1', 'b2', 'b3'], 'r1');
      expect(store.bookIdsByRow('r1')).toEqual(['b1', 'b2', 'b3']);

      // the one-arg (single-owner) form is not generated for a 2:many relationship
      expect((store as unknown as Record<string, unknown>)['indexOfRowBook']).toBeUndefined();
    });
  });

  describe('composite set-lookup (many:many -> array of every match)', () => {
    it('returns ALL entities sharing the exact id-set', () => {
      const store = TestBed.inject(GroupStore);
      store.setAllGroups([{ id: 'g1' }, { id: 'g2' }]);
      store.setAllStudents([
        { id: 's1', groupIds: ['g1', 'g2'] },
        { id: 's2', groupIds: ['g1', 'g2'] },
        { id: 's3', groupIds: ['g1'] },
      ]);

      expect(store.studentsByGroups('g1', 'g2')).toEqual([
        { id: 's1', groupIds: ['g1', 'g2'] },
        { id: 's2', groupIds: ['g1', 'g2'] },
      ]);
      expect(store.studentIdsByGroups('g2', 'g1')).toEqual(['s1', 's2']);
      expect(store.studentsByGroups('g1')).toEqual([{ id: 's3', groupIds: ['g1'] }]);
      expect(store.groupsByStudents('s1', 's2', 's3')).toEqual([{ id: 'g1' }]);
    });

    it('generates the By-family for many-to-many, not the one-arg form', () => {
      const store = TestBed.inject(GroupStore) as unknown as Record<string, unknown>;
      // no single owner to infer, so no one-arg indexOf
      expect(store['indexOfStudentGroup']).toBeUndefined();
      expect(store['indexOfGroupStudent']).toBeUndefined();
      // but the explicit-owner By-form is generated in both directions
      expect(typeof store['indexOfGroupByStudent']).toBe('function');
      expect(typeof store['indexOfStudentByGroup']).toBe('function');
      expect(typeof store['reorderGroupsByStudent']).toBe('function');
    });

    it('does not collide when an id contains the delimiter character', () => {
      const store = TestBed.inject(GroupStore);
      // Under a naive join('|') these two sets both key to "a|b"; JSON keys keep them distinct.
      store.setAllGroups([{ id: 'a|b' }, { id: 'a' }, { id: 'b' }]);
      store.setAllStudents([
        { id: 's1', groupIds: ['a|b'] },
        { id: 's2', groupIds: ['a', 'b'] },
      ]);

      expect(store.studentsByGroups('a|b')).toEqual([{ id: 's1', groupIds: ['a|b'] }]);
      expect(store.studentsByGroups('a', 'b')).toEqual([{ id: 's2', groupIds: ['a', 'b'] }]);
    });
  });

  describe('compositeLookups: false', () => {
    it('does not generate the set-lookups', () => {
      const NoCompositeStore = signalStore(
        { providedIn: 'root' },
        withEntities(rowConfig),
        withEntities(bookConfig),
        withEntityAccessors(),
        withEntityRelationship({ collection: 'row', count: 2 }, { collection: 'book', count: 'many' }, { compositeLookups: false }),
      );
      const store = TestBed.inject(NoCompositeStore);

      expect((store as any).bookByRows).toBeUndefined();
      expect((store as any).rowsByBooks).toBeUndefined();
    });
  });
});
