import {
  signalStoreFeature,
  SignalStoreFeature,
  SignalStoreFeatureResult,
  withMethods,
} from '@ngrx/signals';
import { EntityId } from '@ngrx/signals/entities';
import { capitalize, hasId, toIdReader, toRefResolver } from './internal-helpers';
import { EntityOf, IdAccessor, RequiredEntityStore } from './types';

/**
 * The read-only lookups a transitive relationship generates, both directions, arrays throughout
 * (a chained walk can reach more than one of either endpoint). Each lookup accepts the endpoint
 * entity OR its id, and returns the far endpoint entities or their ids.
 */
type TransitiveOutput<
  FromEntity,
  FromName extends string,
  FromPlural extends string,
  FromId extends EntityId,
  ToEntity,
  ToName extends string,
  ToPlural extends string,
  ToId extends EntityId,
> = {
  state: {};
  props: {};
  methods: {
    [Key in `${ToPlural}By${Capitalize<FromName>}`]: (from: FromEntity | EntityId) => ToEntity[];
  } & {
    [Key in `${ToName}IdsBy${Capitalize<FromName>}`]: (from: FromEntity | EntityId) => ToId[];
  } & {
    [Key in `${FromPlural}By${Capitalize<ToName>}`]: (to: ToEntity | EntityId) => FromEntity[];
  } & {
    [Key in `${FromName}IdsBy${Capitalize<ToName>}`]: (to: ToEntity | EntityId) => FromId[];
  };
};

/**
 * Relates two collections that store NO foreign key to each other, by walking through the
 * intermediary collection(s) that link them — a "grandparent" lookup (e.g. a library's books
 * via its shelves). Composes the adjacency maps that {@link withEntityRelationship} already put
 * on the store (e.g. `libraryShelfMap` ∘ `shelfBookMap`), so it holds no state, no foreign key,
 * and no mutations — it purely reads.
 *
 * Place AFTER the direct relationships for every hop on the path (they provide the maps this
 * walks). Lookups return arrays both directions (a walk can fan out to more than one endpoint)
 * and are deduped. Only the two endpoint entity maps are type-checked as present; that the
 * intermediate hop maps exist is your responsibility (register each hop's direct relationship).
 *
 * @param config the endpoints, the path between them, and how to read each endpoint's id
 * @param config.from  the starting collection name; the entity type is inferred from the store
 * @param config.to    the destination collection name; the entity type is inferred from the store
 * @param config.through the intermediary between them — a single name (`'shelf'`) or an ordered list (`['aisle', 'shelf']`) for 3rd/4th-degree links
 * @param config.fromPlural the plural of `from`, used in the generated member names (default `` `${from}s` ``)
 * @param config.toPlural   the plural of `to`, used in the generated member names (default `` `${to}s` ``)
 * @param config.selectFromId how to read a `from` entity's id (default the `'id'` property; match the collection's `selectId`)
 * @param config.selectToId   how to read a `to` entity's id (default the `'id'` property; match the collection's `selectId`)
 *
 * @example
 * signalStore(
 *   withEntities(libraryConfig), withEntities(shelfConfig), withEntities(bookConfig),
 *   withEntityRelationship({ collection: 'library', count: 1, plural: 'libraries' }, { collection: 'shelf', count: 'many' }),
 *   withEntityRelationship({ collection: 'shelf', count: 1 }, { collection: 'book', count: 'many' }),
 *   withTransitiveRelationship({ from: 'library', to: 'book', through: 'shelf', fromPlural: 'libraries' }),
 * );
 * // booksByLibrary(library | id) -> Book[]     (also bookIdsByLibrary(library | id) -> id[])
 * // librariesByBook(book | id) -> Library[]    (also libraryIdsByBook(book | id) -> id[])
 */
export const withTransitiveRelationship = <
  FromName extends string,
  ToName extends string,
  Store extends SignalStoreFeatureResult & RequiredEntityStore<FromName, ToName>,
  FromId extends EntityId = EntityId,
  ToId extends EntityId = EntityId,
  FromPlural extends string = `${FromName}s`,
  ToPlural extends string = `${ToName}s`,
>(config: {
  from: FromName;
  to: ToName;
  through: string | string[];
  fromPlural?: FromPlural;
  toPlural?: ToPlural;
  selectFromId?: IdAccessor<FromId>;
  selectToId?: IdAccessor<ToId>;
}): SignalStoreFeature<
  Store,
  TransitiveOutput<
    EntityOf<Store, FromName>,
    FromName,
    FromPlural,
    FromId,
    EntityOf<Store, ToName>,
    ToName,
    ToPlural,
    ToId
  >
> => {
  const { from, to, through } = config;
  const fromPlural = config.fromPlural ?? `${from}s`;
  const toPlural = config.toPlural ?? `${to}s`;
  const path = [from, ...(Array.isArray(through) ? through : [through]), to];
  // Adjacency map keys along the path, forward (from→to) and reverse (to→from).
  const forwardMapKeys = path.slice(0, -1).map((hop, index) => `${hop}${capitalize(path[index + 1])}Map`);
  const reverseMapKeys = path.slice(1).map((hop, index) => `${hop}${capitalize(path[index])}Map`).reverse();
  const fromEntityMapKey = `${from}EntityMap`;
  const toEntityMapKey = `${to}EntityMap`;
  const readFromId = toIdReader(config.selectFromId, 'id');
  const readToId = toIdReader(config.selectToId, 'id');
  const fromCap = capitalize(from);
  const toCap = capitalize(to);

  const feature = signalStoreFeature(
    withMethods((innerStore: any) => {
      // Walk the chain of adjacency maps, flattening + deduping ids hop by hop.
      const walk = (startId: EntityId | undefined, mapKeys: string[]): EntityId[] =>
        hasId(startId)
          ? mapKeys.reduce<EntityId[]>((ids, mapKey) => {
              if (typeof innerStore[mapKey] !== 'function') {
                throw new Error(
                  `signalkin: '${mapKey}' is not on the store — a transitive relationship needs the direct ` +
                    `withEntityRelationship for every hop on its path registered before it (path: ${path.join(' → ')}).`,
                );
              }
              const map = innerStore[mapKey]() as Record<EntityId, EntityId[]>;

              return Array.from(new Set(ids.flatMap((id) => map[id] ?? [])));
            }, [startId])
          : [];
      const resolve = (ids: EntityId[], entityMapKey: string): unknown[] =>
        ids.map((id) => innerStore[entityMapKey]()[id]).filter((entity: unknown) => entity !== undefined);

      const toIdsByFrom = (fromId: EntityId | undefined): EntityId[] => walk(fromId, forwardMapKeys);
      const fromIdsByTo = (toId: EntityId | undefined): EntityId[] => walk(toId, reverseMapKeys);
      const resolveFromRef = toRefResolver(readFromId);
      const resolveToRef = toRefResolver(readToId);

      const methods: Record<string, (...args: any[]) => unknown> = {
        [`${toPlural}By${fromCap}`]: (from: any) => resolve(toIdsByFrom(resolveFromRef(from)), toEntityMapKey),
        [`${to}IdsBy${fromCap}`]: (from: any) => toIdsByFrom(resolveFromRef(from)),
        [`${fromPlural}By${toCap}`]: (to: any) => resolve(fromIdsByTo(resolveToRef(to)), fromEntityMapKey),
        [`${from}IdsBy${toCap}`]: (to: any) => fromIdsByTo(resolveToRef(to)),
      };

      return methods;
    }),
  );

  return feature as unknown as SignalStoreFeature<
    Store,
    TransitiveOutput<
      EntityOf<Store, FromName>,
      FromName,
      FromPlural,
      FromId,
      EntityOf<Store, ToName>,
      ToName,
      ToPlural,
      ToId
    >
  >;
};
