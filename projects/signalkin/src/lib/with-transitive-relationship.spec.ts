import { TestBed } from '@angular/core/testing';
import { signalStore, type } from '@ngrx/signals';
import { entityConfig, withEntities } from '@ngrx/signals/entities';
import { withEntityAccessors } from './with-entity-accessors';
import { withEntityRelationship } from './with-entity-relationship';
import { withTransitiveRelationship } from './with-transitive-relationship';

interface LibrarySystem {
  id: string;
  name: string;
}

interface Library {
  id: string;
  librarySystemId: string;
}

interface Row {
  id: string;
  libraryId: string;
}

interface Book {
  id: string;
  rowId: string;
}

const librarySystemConfig = entityConfig({ entity: type<LibrarySystem>(), collection: 'librarySystem' });
const libraryConfig = entityConfig({ entity: type<Library>(), collection: 'library' });
const rowConfig = entityConfig({ entity: type<Row>(), collection: 'row' });
const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });

const CatalogStore = signalStore(
  { providedIn: 'root' },
  withEntities(librarySystemConfig),
  withEntities(libraryConfig),
  withEntities(rowConfig),
  withEntities(bookConfig),
  withEntityAccessors(),
  withEntityRelationship({ name: 'librarySystem', count: 1 }, { name: 'library', count: 'many' }),
  withEntityRelationship({ name: 'library', count: 1 }, { name: 'row', count: 'many' }),
  withEntityRelationship({ name: 'row', count: 1 }, { name: 'book', count: 'many' }),
  withTransitiveRelationship({ from: 'librarySystem', to: 'row', through: 'library' }),
  withTransitiveRelationship({ from: 'librarySystem', to: 'book', through: ['library', 'row'] }),
);

const cityWide: LibrarySystem = { id: 's1', name: 'City-Wide' };
const county: LibrarySystem = { id: 's2', name: 'County' };
const libraries: Library[] = [
  { id: 'l1', librarySystemId: 's1' },
  { id: 'l2', librarySystemId: 's1' },
  { id: 'l3', librarySystemId: 's2' },
];
const rows: Row[] = [
  { id: 'r1', libraryId: 'l1' },
  { id: 'r2', libraryId: 'l2' },
  { id: 'r3', libraryId: 'l3' },
];
const books: Book[] = [
  { id: 'b1', rowId: 'r1' },
  { id: 'b2', rowId: 'r2' },
];

describe('withTransitiveRelationship', () => {
  let store: InstanceType<typeof CatalogStore>;

  beforeEach(() => {
    store = TestBed.inject(CatalogStore);
    store.setAllLibrarySystems([cityWide, county]);
    store.setAllLibrarys(libraries);
    store.setAllRows(rows);
    store.setAllBooks(books);
  });

  it('walks one intermediary in both directions', () => {
    expect(store.rowsByLibrarySystem(cityWide)).toEqual([rows[0], rows[1]]);
    expect(store.rowsByLibrarySystemId('s2')).toEqual([rows[2]]);
    expect(store.rowIdsByLibrarySystemId('s1')).toEqual(['r1', 'r2']);
    expect(store.librarySystemsByRow(rows[0])).toEqual([cityWide]);
    expect(store.librarySystemsByRowId('r3')).toEqual([county]);
    expect(store.librarySystemIdsByRowId('r1')).toEqual(['s1']);
  });

  it('walks multiple intermediaries (through as an array)', () => {
    expect(store.booksByLibrarySystem(cityWide)).toEqual(books);
    expect(store.librarySystemsByBookId('b1')).toEqual([cityWide]);
  });

  it('reflects entity changes reactively', () => {
    store.updateLibrary('l2', { librarySystemId: 's2' });
    expect(store.rowIdsByLibrarySystemId('s1')).toEqual(['r1']);
    expect(store.rowIdsByLibrarySystemId('s2')).toEqual(['r2', 'r3']);
  });

  it('dedupes when multiple paths reach the same endpoint', () => {
    store.addRowToLibrary('l2', 'r1');
    const rowIds = store.rowIdsByLibrarySystemId('s1');
    expect(rowIds.filter((id) => id === 'r1')).toEqual(['r1']);
  });

  it('returns empty arrays for unknown ids', () => {
    expect(store.rowsByLibrarySystemId('nope')).toEqual([]);
    expect(store.librarySystemsByRowId('nope')).toEqual([]);
  });

  it('throws a clear error when a hop map is missing', () => {
    const BrokenStore = signalStore(
      { providedIn: 'root' },
      withEntities(librarySystemConfig),
      withEntities(rowConfig),
      withEntityAccessors(),
      // No direct librarySystem→library / library→row relationships registered.
      withTransitiveRelationship({ from: 'librarySystem', to: 'row', through: 'library' }),
    );
    const broken = TestBed.inject(BrokenStore);

    expect(() => broken.rowsByLibrarySystemId('s1')).toThrowError(
      /librarySystemLibraryMap.*librarySystem → library → row/s,
    );
  });
});
