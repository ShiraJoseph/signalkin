import { signalStore, type } from '@ngrx/signals';
import { entityConfig, withEntities } from '@ngrx/signals/entities';
import { withEntityAccessors, withEntityRelationship, withTransitiveRelationship } from 'signalkin';

export interface LibrarySystem {
  id: string;
  name: string;
}

export interface Library {
  id: string;
  librarySystemId: string;
  name: string;
}

export interface Book {
  id: string;
  libraryId: string;
  title: string;
}

const librarySystemConfig = entityConfig({ entity: type<LibrarySystem>(), collection: 'librarySystem' });
const libraryConfig = entityConfig({ entity: type<Library>(), collection: 'library' });
const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });

export const DemoStore = signalStore(
  { providedIn: 'root' },
  withEntities(librarySystemConfig),
  withEntities(libraryConfig),
  withEntities(bookConfig),
  withEntityAccessors(),
  withEntityRelationship({ name: 'librarySystem', count: 1 }, { name: 'library', count: 'many' }),
  withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' }),
  withTransitiveRelationship({ from: 'librarySystem', to: 'book', through: 'library' }),
);
