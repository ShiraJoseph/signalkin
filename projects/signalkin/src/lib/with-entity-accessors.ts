import { computed, Signal } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  SignalStoreFeature,
  SignalStoreFeatureResult,
  withComputed,
  withMethods,
} from '@ngrx/signals';
import {
  addEntities,
  addEntity,
  EntityChanges,
  EntityId,
  EntityMap,
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
} from '@ngrx/signals/entities';
import { capitalize } from './internal-helpers';
import { CollectionNames, EntityOf, EntityPredicate, RequiredEntityMaps } from './types';

/** What withEntityAccessors needs from a config: the collection name, and its `selectId` if not the `id` property. An `entityConfig(...)` result works as-is. */
export type EntityAccessorConfig = {
  entity?: unknown;
  collection: string;
  selectId?: SelectEntityId<any>;
};

/** The collections a call targets: the passed configs' collections, or EVERY collection on the store when none are passed. */
type TargetNames<Store extends SignalStoreFeatureResult, Configs extends readonly EntityAccessorConfig[]> =
  Configs extends readonly [] ? CollectionNames<Store['state']> : Configs[number]['collection'];

/** Convenience signals added alongside ngrx's own `${collection}EntityMap` / `${collection}Ids` / `${collection}Entities`. */
type EntityAccessorProps<Store, Names extends string> = {
  [Name in Names as `${Name}s`]: Signal<EntityOf<Store, Name>[]>;
} & {
  [Name in Names as `${Name}Map`]: Signal<EntityMap<EntityOf<Store, Name>>>;
} & {
  [Name in Names as `${Name}Count`]: Signal<number>;
};

/** The standard collection methods, one per ngrx updater plus lookups, named by collection. */
type EntityAccessorMethods<Store, Names extends string> = {
  [Name in Names as `add${Capitalize<Name>}`]: (entity: EntityOf<Store, Name>) => void;
} & {
  [Name in Names as `add${Capitalize<Name>}s`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `prepend${Capitalize<Name>}`]: (entity: EntityOf<Store, Name>) => void;
} & {
  [Name in Names as `prepend${Capitalize<Name>}s`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `set${Capitalize<Name>}`]: (entity: EntityOf<Store, Name>) => void;
} & {
  [Name in Names as `set${Capitalize<Name>}s`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `setAll${Capitalize<Name>}s`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `upsert${Capitalize<Name>}`]: (entity: EntityOf<Store, Name>) => void;
} & {
  [Name in Names as `upsert${Capitalize<Name>}s`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `update${Capitalize<Name>}`]: (id: EntityId, changes: EntityChanges<EntityOf<Store, Name>>) => void;
} & {
  [Name in Names as `update${Capitalize<Name>}s`]: (
    idsOrPredicate: EntityId[] | EntityPredicate<EntityOf<Store, Name>>,
    changes: EntityChanges<EntityOf<Store, Name>>,
  ) => void;
} & {
  [Name in Names as `updateAll${Capitalize<Name>}s`]: (changes: EntityChanges<EntityOf<Store, Name>>) => void;
} & {
  [Name in Names as `remove${Capitalize<Name>}`]: (id: EntityId) => void;
} & {
  [Name in Names as `remove${Capitalize<Name>}s`]: (
    idsOrPredicate: EntityId[] | EntityPredicate<EntityOf<Store, Name>>,
  ) => void;
} & {
  [Name in Names as `removeAll${Capitalize<Name>}s`]: () => void;
} & {
  [Name in Names as `${Name}ById`]: (id: EntityId) => EntityOf<Store, Name> | undefined;
} & {
  [Name in Names as `has${Capitalize<Name>}`]: (id: EntityId) => boolean;
};

type EntityAccessorsOutput<Store, Names extends string> = {
  state: {};
  props: EntityAccessorProps<Store, Names>;
  methods: EntityAccessorMethods<Store, Names>;
};

/**
 * Adds the everyday operations for entity collections that already exist on the store — the
 * standard methods (one per ngrx updater, so no more `withMethods` blocks of
 * `patchState(store, upsertEntity(...))`) plus convenience signals, every member named by
 * collection. Call it ONCE, after your `withEntities` list.
 *
 * With no arguments it covers EVERY collection on the store. Pass configs to cover only those
 * collections — also how a custom `selectId` gets honored, since ngrx doesn't expose it from
 * `withEntities` (an `entityConfig(...)` result works as-is; a collection without a config
 * defaults to the `id` property).
 *
 * @param configs none for all collections, or the configs of the collections to cover
 *
 * @example
 * signalStore(
 *   withEntities(libraryConfig),
 *   withEntities(bookConfig),
 *   withEntityAccessors(),           // accessors for library AND book
 * );
 * // From withEntities: bookEntityMap() · bookIds() · bookEntities()
 * // Added signals:     books() · bookMap() · bookCount()
 * // Lookups:           bookById(id) · hasBook(id)
 * // Add/set/upsert:    addBook(book) · addBooks(books) · prependBook · prependBooks
 * //                    setBook · setBooks · setAllBooks · upsertBook · upsertBooks
 * // Update:            updateBook(id, changes) · updateBooks(ids | predicate, changes) · updateAllBooks(changes)
 * // Remove:            removeBook(id) · removeBooks(ids | predicate) · removeAllBooks()
 * // ...and the same set for library.
 *
 * @example
 * // Only the book collection, with its custom selectId honored:
 * const bookConfig = entityConfig({ entity: type<Book>(), collection: 'book', selectId: (book) => book.isbn });
 * signalStore(
 *   withEntities(libraryConfig),
 *   withEntities(bookConfig),
 *   withEntityAccessors(bookConfig), // book accessors only; updates/removes key on isbn
 * );
 */
export const withEntityAccessors = <
  const Configs extends readonly EntityAccessorConfig[],
  Store extends SignalStoreFeatureResult & RequiredEntityMaps<Configs[number]['collection']>,
>(
  ...configs: Configs
): SignalStoreFeature<Store, EntityAccessorsOutput<Store, TargetNames<Store, Configs> & string>> => {
  const resolveCollections = (innerStore: any): string[] =>
    configs.length > 0
      ? configs.map((config) => {
          if (typeof innerStore[`${config.collection}EntityMap`] !== 'function') {
            throw new Error(
              `signalkin: '${config.collection}EntityMap' is not on the store — register withEntities ` +
                `for '${config.collection}' before withEntityAccessors.`,
            );
          }
          return config.collection;
        })
      : Object.keys(innerStore)
          .filter((key) => key.endsWith('EntityMap') && key !== 'EntityMap')
          .map((key) => key.slice(0, -'EntityMap'.length));

  const selectIdFor = (collection: string): SelectEntityId<any> | undefined =>
    configs.find((config) => config.collection === collection)?.selectId;

  const feature = signalStoreFeature(
    withComputed((innerStore: any) => {
      const props: Record<string, Signal<unknown>> = {};

      resolveCollections(innerStore).forEach((collection) => {
        props[`${collection}s`] = computed(() => innerStore[`${collection}Entities`]());
        props[`${collection}Map`] = computed(() => innerStore[`${collection}EntityMap`]());
        props[`${collection}Count`] = computed(() => innerStore[`${collection}Ids`]().length);
      });

      return props;
    }),
    withMethods((innerStore: any) => {
      const methods: Record<string, (...args: any[]) => unknown> = {};

      resolveCollections(innerStore).forEach((collection) => {
        const cap = capitalize(collection);
        const entityMapKey = `${collection}EntityMap`;
        const updaterConfig = { collection, selectId: selectIdFor(collection) } as any;

        methods[`add${cap}`] = (entity: unknown) => patchState(innerStore, addEntity(entity, updaterConfig));
        methods[`add${cap}s`] = (entities: unknown[]) => patchState(innerStore, addEntities(entities, updaterConfig));
        methods[`prepend${cap}`] = (entity: unknown) => patchState(innerStore, prependEntity(entity, updaterConfig));
        methods[`prepend${cap}s`] = (entities: unknown[]) =>
          patchState(innerStore, prependEntities(entities, updaterConfig));
        methods[`set${cap}`] = (entity: unknown) => patchState(innerStore, setEntity(entity, updaterConfig));
        methods[`set${cap}s`] = (entities: unknown[]) => patchState(innerStore, setEntities(entities, updaterConfig));
        methods[`setAll${cap}s`] = (entities: unknown[]) =>
          patchState(innerStore, setAllEntities(entities, updaterConfig));
        methods[`upsert${cap}`] = (entity: unknown) => patchState(innerStore, upsertEntity(entity, updaterConfig));
        methods[`upsert${cap}s`] = (entities: unknown[]) =>
          patchState(innerStore, upsertEntities(entities, updaterConfig));
        methods[`update${cap}`] = (id: EntityId, changes: unknown) =>
          patchState(innerStore, updateEntity({ id, changes } as any, updaterConfig));
        methods[`update${cap}s`] = (idsOrPredicate: EntityId[] | EntityPredicate<unknown>, changes: unknown) =>
          patchState(
            innerStore,
            updateEntities(
              (Array.isArray(idsOrPredicate)
                ? { ids: idsOrPredicate, changes }
                : { predicate: idsOrPredicate, changes }) as any,
              updaterConfig,
            ),
          );
        methods[`updateAll${cap}s`] = (changes: unknown) =>
          patchState(innerStore, updateAllEntities(changes as any, updaterConfig));
        methods[`remove${cap}`] = (id: EntityId) => patchState(innerStore, removeEntity(id, updaterConfig));
        methods[`remove${cap}s`] = (idsOrPredicate: EntityId[] | EntityPredicate<unknown>) =>
          patchState(innerStore, removeEntities(idsOrPredicate as any, updaterConfig));
        methods[`removeAll${cap}s`] = () => patchState(innerStore, removeAllEntities(updaterConfig));
        methods[`${collection}ById`] = (id: EntityId) => innerStore[entityMapKey]()[id];
        methods[`has${cap}`] = (id: EntityId) => innerStore[entityMapKey]()[id] !== undefined;
      });

      return methods;
    }),
  );

  return feature as unknown as SignalStoreFeature<
    Store,
    EntityAccessorsOutput<Store, TargetNames<Store, Configs> & string>
  >;
};
