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
  withEntityAccessors(librarySystemConfig, { ...libraryConfig, plural: 'libraries' }, bookConfig),
  withEntityRelationship(
    { collection: 'librarySystem', count: 1 },
    { collection: 'library', count: 'many', plural: 'libraries' },
  ),
  withEntityRelationship({ collection: 'library', count: 1 }, { collection: 'book', count: 'many' }),
  withTransitiveRelationship({ from: 'librarySystem', to: 'book', through: 'library' }),
);
