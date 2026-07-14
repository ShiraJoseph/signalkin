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
  withEntityAccessors(
    librarySystemConfig,
    { ...libraryConfig, plural: 'libraries' },
    rowConfig,
    bookConfig,
  ),
  withEntityRelationship(
    { collection: 'librarySystem', count: 1 },
    { collection: 'library', count: 'many', plural: 'libraries' },
  ),
  withEntityRelationship({ collection: 'library', count: 1 }, { collection: 'row', count: 'many' }),
  withEntityRelationship({ collection: 'row', count: 1 }, { collection: 'book', count: 'many' }),
  withTransitiveRelationship({ from: 'librarySystem', to: 'row', through: 'library' }),
  withTransitiveRelationship({ from: 'librarySystem', to: 'book', through: ['library', 'row'] }),
  withTransitiveRelationship({ from: 'library', to: 'book', through: 'row', fromPlural: 'libraries' }),
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
    store.setAllLibraries(libraries);
    store.setAllRows(rows);
    store.setAllBooks(books);
  });

  it('walks one intermediary in both directions (entity or id)', () => {
    expect(store.rowsByLibrarySystem(cityWide)).toEqual([rows[0], rows[1]]);
    expect(store.rowsByLibrarySystem('s2')).toEqual([rows[2]]);
    expect(store.rowIdsByLibrarySystem('s1')).toEqual(['r1', 'r2']);
    expect(store.librarySystemsByRow(rows[0])).toEqual([cityWide]);
    expect(store.librarySystemsByRow('r3')).toEqual([county]);
    expect(store.librarySystemIdsByRow('r1')).toEqual(['s1']);
  });

  it('walks multiple intermediaries (through as an array)', () => {
    expect(store.booksByLibrarySystem(cityWide)).toEqual(books);
    expect(store.librarySystemsByBook('b1')).toEqual([cityWide]);
  });

  it('uses custom plurals in generated names (fromPlural / relationship plural)', () => {
    // Transitive library→book with fromPlural 'libraries'.
    expect(store.librariesByBook('b1')).toEqual([libraries[0]]);
    expect(store.booksByLibrary(libraries[0])).toEqual([books[0]]);
    // Direct librarySystem→library with the library side's plural.
    expect(store.librariesByLibrarySystem('s1')).toEqual([libraries[0], libraries[1]]);
    expect((store as any).librarysByLibrarySystem).toBeUndefined();
  });

  it('reflects entity changes reactively', () => {
    store.updateLibrary('l2', { librarySystemId: 's2' });
    expect(store.rowIdsByLibrarySystem('s1')).toEqual(['r1']);
    expect(store.rowIdsByLibrarySystem('s2')).toEqual(['r2', 'r3']);
  });

  it('dedupes when multiple paths reach the same endpoint', () => {
    store.addRowToLibrary('l2', 'r1');
    const rowIds = store.rowIdsByLibrarySystem('s1');
    expect(rowIds.filter((id) => id === 'r1')).toEqual(['r1']);
  });

  it('returns empty arrays for unknown ids', () => {
    expect(store.rowsByLibrarySystem('nope')).toEqual([]);
    expect(store.librarySystemsByRow('nope')).toEqual([]);
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

    expect(() => broken.rowsByLibrarySystem('s1')).toThrowError(
      /librarySystemLibraryMap.*librarySystem → library → row/s,
    );
  });
});
