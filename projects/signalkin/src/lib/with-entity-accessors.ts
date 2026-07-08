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
import { capitalize, toIdReader, toRefResolver } from './internal-helpers';
import { CollectionNames, EntityOf, EntityPredicate, RequiredEntityMaps } from './types';

/** What withEntityAccessors needs from a config: the collection name, its `selectId` if not the `id` property, and its `plural` if not `+s`. An `entityConfig(...)` result works as-is. */
export type EntityAccessorConfig = {
  entity?: unknown;
  collection: string;
  selectId?: SelectEntityId<any>;
  plural?: string;
};

/** The collections a call targets: the passed configs' collections, or EVERY collection on the store when none are passed. */
type TargetNames<Store extends SignalStoreFeatureResult, Configs extends readonly EntityAccessorConfig[]> =
  Configs extends readonly [] ? CollectionNames<Store['state']> : Configs[number]['collection'];

/** A collection's plural, from its passed config if one names it, else `+s`. */
type PluralOf<Configs extends readonly EntityAccessorConfig[], Name extends string> = [
  Extract<Configs[number], { collection: Name }>,
] extends [never]
  ? `${Name}s`
  : Extract<Configs[number], { collection: Name }> extends { plural: infer Plural extends string }
    ? Plural
    : `${Name}s`;

/** Convenience signals added alongside ngrx's own `${collection}EntityMap` / `${collection}Ids` / `${collection}Entities`. */
type EntityAccessorProps<Store, Configs extends readonly EntityAccessorConfig[], Names extends string> = {
  [Name in Names as PluralOf<Configs, Name>]: Signal<EntityOf<Store, Name>[]>;
} & {
  [Name in Names as `${Name}Map`]: Signal<EntityMap<EntityOf<Store, Name>>>;
} & {
  [Name in Names as `${Name}Count`]: Signal<number>;
};

/** The standard collection methods, one per ngrx updater plus lookups, named by collection. */
type EntityAccessorMethods<Store, Configs extends readonly EntityAccessorConfig[], Names extends string> = {
  [Name in Names as `add${Capitalize<Name>}`]: (entity: EntityOf<Store, Name>) => void;
} & {
  [Name in Names as `add${Capitalize<PluralOf<Configs, Name>>}`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `prepend${Capitalize<Name>}`]: (entity: EntityOf<Store, Name>) => void;
} & {
  [Name in Names as `prepend${Capitalize<PluralOf<Configs, Name>>}`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `set${Capitalize<Name>}`]: (entity: EntityOf<Store, Name>) => void;
} & {
  [Name in Names as `set${Capitalize<PluralOf<Configs, Name>>}`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `setAll${Capitalize<PluralOf<Configs, Name>>}`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `upsert${Capitalize<Name>}`]: (entity: EntityOf<Store, Name>) => void;
} & {
  [Name in Names as `upsert${Capitalize<PluralOf<Configs, Name>>}`]: (entities: EntityOf<Store, Name>[]) => void;
} & {
  [Name in Names as `update${Capitalize<Name>}`]: (
    entity: EntityOf<Store, Name> | EntityId,
    changes: EntityChanges<EntityOf<Store, Name>>,
  ) => void;
} & {
  [Name in Names as `update${Capitalize<PluralOf<Configs, Name>>}`]: (
    entitiesOrPredicate: (EntityOf<Store, Name> | EntityId)[] | EntityPredicate<EntityOf<Store, Name>>,
    changes: EntityChanges<EntityOf<Store, Name>>,
  ) => void;
} & {
  [Name in Names as `updateAll${Capitalize<PluralOf<Configs, Name>>}`]: (
    changes: EntityChanges<EntityOf<Store, Name>>,
  ) => void;
} & {
  [Name in Names as `remove${Capitalize<Name>}`]: (entity: EntityOf<Store, Name> | EntityId) => void;
} & {
  [Name in Names as `remove${Capitalize<PluralOf<Configs, Name>>}`]: (
    entitiesOrPredicate: (EntityOf<Store, Name> | EntityId)[] | EntityPredicate<EntityOf<Store, Name>>,
  ) => void;
} & {
  [Name in Names as `removeAll${Capitalize<PluralOf<Configs, Name>>}`]: () => void;
} & {
  [Name in Names as `${Name}ById`]: (id: EntityId) => EntityOf<Store, Name> | undefined;
} & {
  [Name in Names as `has${Capitalize<Name>}`]: (entity: EntityOf<Store, Name> | EntityId) => boolean;
};

type EntityAccessorsOutput<Store, Configs extends readonly EntityAccessorConfig[], Names extends string> = {
  state: {};
  props: EntityAccessorProps<Store, Configs, Names>;
  methods: EntityAccessorMethods<Store, Configs, Names>;
};

/**
 * Standard collection methods and convenience signals for the store's entities, named by collection — no args covers every collection, or pass configs to narrow and to honor a custom `selectId` / `plural`.
 *
 * @example
 * signalStore(
 *   withEntities(bookConfig),
 *   withEntityAccessors(bookConfig),
 * );
 * // books() · bookMap() · bookCount() · bookById(id) · hasBook(book | id)
 * // addBook · addBooks · prependBook · setBook · setAllBooks · upsertBook
 * // updateBook(book | id, changes) · updateAllBooks(changes) · removeBook(book | id) · removeAllBooks()
 */
export const withEntityAccessors = <
  const Configs extends readonly EntityAccessorConfig[],
  Store extends SignalStoreFeatureResult & RequiredEntityMaps<Configs[number]['collection']>,
>(
  ...configs: Configs
): SignalStoreFeature<Store, EntityAccessorsOutput<Store, Configs, TargetNames<Store, Configs> & string>> => {
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

  const pluralFor = (collection: string): string =>
    configs.find((config) => config.collection === collection)?.plural ?? `${collection}s`;

  const feature = signalStoreFeature(
    withComputed((innerStore: any) => {
      const props: Record<string, Signal<unknown>> = {};

      resolveCollections(innerStore).forEach((collection) => {
        props[pluralFor(collection)] = computed(() => innerStore[`${collection}Entities`]());
        props[`${collection}Map`] = computed(() => innerStore[`${collection}EntityMap`]());
        props[`${collection}Count`] = computed(() => innerStore[`${collection}Ids`]().length);
      });

      return props;
    }),
    withMethods((innerStore: any) => {
      const methods: Record<string, (...args: any[]) => unknown> = {};

      resolveCollections(innerStore).forEach((collection) => {
        const cap = capitalize(collection);
        const pluralCap = capitalize(pluralFor(collection));
        const entityMapKey = `${collection}EntityMap`;
        const updaterConfig = { collection, selectId: selectIdFor(collection) } as any;
        const resolveRef = toRefResolver(toIdReader(selectIdFor(collection), 'id'));
        const resolveTargets = (entitiesOrPredicate: unknown): unknown =>
          Array.isArray(entitiesOrPredicate) ? entitiesOrPredicate.map(resolveRef) : entitiesOrPredicate;

        methods[`add${cap}`] = (entity: unknown) => patchState(innerStore, addEntity(entity, updaterConfig));
        methods[`add${pluralCap}`] = (entities: unknown[]) =>
          patchState(innerStore, addEntities(entities, updaterConfig));
        methods[`prepend${cap}`] = (entity: unknown) => patchState(innerStore, prependEntity(entity, updaterConfig));
        methods[`prepend${pluralCap}`] = (entities: unknown[]) =>
          patchState(innerStore, prependEntities(entities, updaterConfig));
        methods[`set${cap}`] = (entity: unknown) => patchState(innerStore, setEntity(entity, updaterConfig));
        methods[`set${pluralCap}`] = (entities: unknown[]) =>
          patchState(innerStore, setEntities(entities, updaterConfig));
        methods[`setAll${pluralCap}`] = (entities: unknown[]) =>
          patchState(innerStore, setAllEntities(entities, updaterConfig));
        methods[`upsert${cap}`] = (entity: unknown) => patchState(innerStore, upsertEntity(entity, updaterConfig));
        methods[`upsert${pluralCap}`] = (entities: unknown[]) =>
          patchState(innerStore, upsertEntities(entities, updaterConfig));
        methods[`update${cap}`] = (ref: unknown, changes: unknown) =>
          patchState(innerStore, updateEntity({ id: resolveRef(ref), changes } as any, updaterConfig));
        methods[`update${pluralCap}`] = (entitiesOrPredicate: unknown, changes: unknown) =>
          patchState(
            innerStore,
            updateEntities(
              (Array.isArray(entitiesOrPredicate)
                ? { ids: resolveTargets(entitiesOrPredicate), changes }
                : { predicate: entitiesOrPredicate, changes }) as any,
              updaterConfig,
            ),
          );
        methods[`updateAll${pluralCap}`] = (changes: unknown) =>
          patchState(innerStore, updateAllEntities(changes as any, updaterConfig));
        methods[`remove${cap}`] = (ref: unknown) =>
          patchState(innerStore, removeEntity(resolveRef(ref) as EntityId, updaterConfig));
        methods[`remove${pluralCap}`] = (entitiesOrPredicate: unknown) =>
          patchState(innerStore, removeEntities(resolveTargets(entitiesOrPredicate) as any, updaterConfig));
        methods[`removeAll${pluralCap}`] = () => patchState(innerStore, removeAllEntities(updaterConfig));
        methods[`${collection}ById`] = (id: EntityId) => innerStore[entityMapKey]()[id];
        methods[`has${cap}`] = (ref: unknown) => innerStore[entityMapKey]()[resolveRef(ref) as EntityId] !== undefined;
      });

      return methods;
    }),
  );

  return feature as unknown as SignalStoreFeature<
    Store,
    EntityAccessorsOutput<Store, Configs, TargetNames<Store, Configs> & string>
  >;
};
