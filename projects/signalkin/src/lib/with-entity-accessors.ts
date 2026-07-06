import { computed, Signal } from '@angular/core';
import {
  EmptyFeatureResult,
  patchState,
  signalStoreFeature,
  SignalStoreFeature,
  withComputed,
  withMethods,
} from '@ngrx/signals';
import {
  addEntities,
  addEntity,
  EntityChanges,
  EntityId,
  EntityMap,
  NamedEntityProps,
  NamedEntityState,
  prependEntities,
  prependEntity,
  removeAllEntities,
  removeEntities,
  removeEntity,
  SelectEntityId,
  setAllEntities,
  setEntities,
  setEntity,
  updateAllEntities,
  updateEntities,
  updateEntity,
  upsertEntities,
  upsertEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { capitalize } from './internal-helpers';
import { EntityPredicate } from './types';

/** Convenience signals added alongside ngrx's own `${collection}EntityMap` / `${collection}Ids` / `${collection}Entities`. */
type EntityAccessorProps<Entity, Collection extends string> = {
  [Key in `${Collection}s`]: Signal<Entity[]>;
} & {
  [Key in `${Collection}Map`]: Signal<EntityMap<Entity>>;
} & {
  [Key in `${Collection}Count`]: Signal<number>;
};

/** The standard collection methods, one per ngrx updater plus lookups, named by collection. */
type EntityAccessorMethods<Entity, Collection extends string> = {
  [Key in `add${Capitalize<Collection>}`]: (entity: Entity) => void;
} & {
  [Key in `add${Capitalize<Collection>}s`]: (entities: Entity[]) => void;
} & {
  [Key in `prepend${Capitalize<Collection>}`]: (entity: Entity) => void;
} & {
  [Key in `prepend${Capitalize<Collection>}s`]: (entities: Entity[]) => void;
} & {
  [Key in `set${Capitalize<Collection>}`]: (entity: Entity) => void;
} & {
  [Key in `set${Capitalize<Collection>}s`]: (entities: Entity[]) => void;
} & {
  [Key in `setAll${Capitalize<Collection>}s`]: (entities: Entity[]) => void;
} & {
  [Key in `upsert${Capitalize<Collection>}`]: (entity: Entity) => void;
} & {
  [Key in `upsert${Capitalize<Collection>}s`]: (entities: Entity[]) => void;
} & {
  [Key in `update${Capitalize<Collection>}`]: (id: EntityId, changes: EntityChanges<Entity>) => void;
} & {
  [Key in `update${Capitalize<Collection>}s`]: (
    idsOrPredicate: EntityId[] | EntityPredicate<Entity>,
    changes: EntityChanges<Entity>,
  ) => void;
} & {
  [Key in `updateAll${Capitalize<Collection>}s`]: (changes: EntityChanges<Entity>) => void;
} & {
  [Key in `remove${Capitalize<Collection>}`]: (id: EntityId) => void;
} & {
  [Key in `remove${Capitalize<Collection>}s`]: (idsOrPredicate: EntityId[] | EntityPredicate<Entity>) => void;
} & {
  [Key in `removeAll${Capitalize<Collection>}s`]: () => void;
} & {
  [Key in `${Collection}ById`]: (id: EntityId) => Entity | undefined;
} & {
  [Key in `has${Capitalize<Collection>}`]: (id: EntityId) => boolean;
};

type EntityAccessorsOutput<Entity, Collection extends string> = {
  state: NamedEntityState<Entity, Collection>;
  props: NamedEntityProps<Entity, Collection> & EntityAccessorProps<Entity, Collection>;
  methods: EntityAccessorMethods<Entity, Collection>;
};

/**
 * One call that sets up an entity collection AND its everyday operations — composes
 * `withEntities(config)` itself, then adds the standard methods (one per ngrx updater,
 * so no more `withMethods` blocks of `patchState(store, upsertEntity(...))`) plus
 * convenience signals, every member named by the collection.
 *
 * @param config the ngrx entity config: `entity` + `collection` (+ optional `selectId`);
 *   an `entityConfig(...)` result works as-is
 *
 * @example
 * const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book' });
 * export const BookStore = signalStore(withEntityAccessors(bookConfig));
 * // From withEntities: bookEntityMap() · bookIds() · bookEntities()
 * // Added signals:     books() · bookMap() · bookCount()
 * // Lookups:           bookById(id) · hasBook(id)
 * // Add/set/upsert:    addBook(book) · addBooks(books) · prependBook · prependBooks
 * //                    setBook · setBooks · setAllBooks · upsertBook · upsertBooks
 * // Update:            updateBook(id, changes) · updateBooks(ids | predicate, changes) · updateAllBooks(changes)
 * // Remove:            removeBook(id) · removeBooks(ids | predicate) · removeAllBooks()
 */
export const withEntityAccessors = <Entity, Collection extends string>(config: {
  entity: Entity;
  collection: Collection;
  selectId?: SelectEntityId<NoInfer<Entity>>;
}): SignalStoreFeature<EmptyFeatureResult, EntityAccessorsOutput<Entity, Collection>> => {
  const collection = config.collection;
  const cap = capitalize(collection);
  const entityMapKey = `${collection}EntityMap`;
  const entitiesKey = `${collection}Entities`;
  const idsKey = `${collection}Ids`;
  const updaterConfig = { collection, selectId: config.selectId } as any;

  const feature = signalStoreFeature(
    withEntities(config as { entity: Entity; collection: Collection }),
    withComputed((innerStore: any) => ({
      [`${collection}s`]: computed(() => innerStore[entitiesKey]()),
      [`${collection}Map`]: computed(() => innerStore[entityMapKey]()),
      [`${collection}Count`]: computed(() => innerStore[idsKey]().length),
    })),
    withMethods((innerStore: any) => ({
      [`add${cap}`]: (entity: Entity) => patchState(innerStore, addEntity(entity, updaterConfig)),
      [`add${cap}s`]: (entities: Entity[]) => patchState(innerStore, addEntities(entities, updaterConfig)),
      [`prepend${cap}`]: (entity: Entity) => patchState(innerStore, prependEntity(entity, updaterConfig)),
      [`prepend${cap}s`]: (entities: Entity[]) => patchState(innerStore, prependEntities(entities, updaterConfig)),
      [`set${cap}`]: (entity: Entity) => patchState(innerStore, setEntity(entity, updaterConfig)),
      [`set${cap}s`]: (entities: Entity[]) => patchState(innerStore, setEntities(entities, updaterConfig)),
      [`setAll${cap}s`]: (entities: Entity[]) => patchState(innerStore, setAllEntities(entities, updaterConfig)),
      [`upsert${cap}`]: (entity: Entity) => patchState(innerStore, upsertEntity(entity, updaterConfig)),
      [`upsert${cap}s`]: (entities: Entity[]) => patchState(innerStore, upsertEntities(entities, updaterConfig)),
      [`update${cap}`]: (id: EntityId, changes: EntityChanges<Entity>) =>
        patchState(innerStore, updateEntity({ id, changes } as any, updaterConfig)),
      [`update${cap}s`]: (idsOrPredicate: EntityId[] | EntityPredicate<Entity>, changes: EntityChanges<Entity>) =>
        patchState(
          innerStore,
          updateEntities(
            (Array.isArray(idsOrPredicate)
              ? { ids: idsOrPredicate, changes }
              : { predicate: idsOrPredicate, changes }) as any,
            updaterConfig,
          ),
        ),
      [`updateAll${cap}s`]: (changes: EntityChanges<Entity>) =>
        patchState(innerStore, updateAllEntities(changes as any, updaterConfig)),
      [`remove${cap}`]: (id: EntityId) => patchState(innerStore, removeEntity(id, updaterConfig)),
      [`remove${cap}s`]: (idsOrPredicate: EntityId[] | EntityPredicate<Entity>) =>
        patchState(innerStore, removeEntities(idsOrPredicate as any, updaterConfig)),
      [`removeAll${cap}s`]: () => patchState(innerStore, removeAllEntities(updaterConfig)),
      [`${collection}ById`]: (id: EntityId) => innerStore[entityMapKey]()[id],
      [`has${cap}`]: (id: EntityId) => innerStore[entityMapKey]()[id] !== undefined,
    })),
  );

  return feature as unknown as SignalStoreFeature<EmptyFeatureResult, EntityAccessorsOutput<Entity, Collection>>;
};
