import { computed, Signal } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  SignalStoreFeature,
  SignalStoreFeatureResult,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { EntityId, updateEntity } from '@ngrx/signals/entities';
import {
  addUnique,
  capitalize,
  hasId,
  mergeLinks,
  projectLinks,
  toIdReader,
  toIdsReader,
  toRefResolver,
} from './internal-helpers';
import {
  Cardinality,
  CompositeIdLead,
  CompositeIdResult,
  CompositeLead,
  CompositeResult,
  EntityOf,
  ForeignIdAccessor,
  IdAccessor,
  IdLead,
  IdOf,
  IsMulti,
  Lead,
  Related,
  RelationshipOptions,
  RequiredEntityStore,
} from './types';

type LinkState<FromName extends string, ToName extends string> = {
  [Key in `_${FromName}${Capitalize<ToName>}Links`]: Record<EntityId, EntityId[]>;
} & {
  [Key in `_${ToName}${Capitalize<FromName>}Links`]: Record<EntityId, EntityId[]>;
};

type IndexProps<FromName extends string, ToName extends string> = {
  [Key in `${FromName}${Capitalize<ToName>}Map`]: Signal<Record<EntityId, EntityId[]>>;
} & {
  [Key in `${ToName}${Capitalize<FromName>}Map`]: Signal<Record<EntityId, EntityId[]>>;
};

/**
 * The two get-by lookups for one direction: return the related entity(ies) or their id(s), keyed by
 * ONE entity of the other side — passed as the entity OR its id. The returned noun pluralizes by the
 * returned side's own count; the shape is a single value for a 1-side, an array otherwise.
 */
type DirectionalLookup<
  ReturnEntity,
  ReturnName extends string,
  ReturnPlural extends string,
  ReturnCount extends Cardinality,
  ReturnId extends EntityId,
  InputEntity,
  InputName extends string,
> = {
  [Key in `${Lead<ReturnName, ReturnPlural, ReturnCount>}By${Capitalize<InputName>}`]: (
    input: InputEntity | EntityId,
  ) => Related<ReturnEntity, ReturnCount>;
} & {
  [Key in `${IdLead<ReturnName, ReturnCount>}By${Capitalize<InputName>}`]: (
    input: InputEntity | EntityId,
  ) => Related<ReturnId, ReturnCount>;
};

/** Existence checks and counts across the link, both directions. Each entity argument accepts the entity or its id. */
type HasCountMethods<FromEntity, FromName extends string, ToEntity, ToName extends string> = {
  [Key in `${FromName}Has${Capitalize<ToName>}`]: (from: FromEntity | EntityId, to: ToEntity | EntityId) => boolean;
} & {
  [Key in `${ToName}Has${Capitalize<FromName>}`]: (to: ToEntity | EntityId, from: FromEntity | EntityId) => boolean;
} & {
  [Key in `${ToName}CountBy${Capitalize<FromName>}`]: (from: FromEntity | EntityId) => number;
} & {
  [Key in `${FromName}CountBy${Capitalize<ToName>}`]: (to: ToEntity | EntityId) => number;
};

type LookupMethods<
  FromEntity,
  FromName extends string,
  FromPlural extends string,
  FromCount extends Cardinality,
  FromId extends EntityId,
  ToEntity,
  ToName extends string,
  ToPlural extends string,
  ToCount extends Cardinality,
  ToId extends EntityId,
> = DirectionalLookup<ToEntity, ToName, ToPlural, ToCount, ToId, FromEntity, FromName> &
  DirectionalLookup<FromEntity, FromName, FromPlural, FromCount, FromId, ToEntity, ToName> &
  HasCountMethods<FromEntity, FromName, ToEntity, ToName>;

/**
 * When the INPUT side relates to MORE THAN ONE of the other (count is a number 2+ or `'many'`), the
 * SET of that side's ids for a given other-side entity can be used as a key. This generates the
 * variadic set-lookups: pass those entities or ids (any order), get the matching other-side
 * entity(ies) or id(s). The result is a single value when the set is a candidate key (the keyed side
 * has a fixed count 2+) or only one of the returned side can match (returned side is a 1-side);
 * otherwise it's an array of every match. The method name goes singular / plural to match.
 */
type CompositeSetLookup<
  ReturnEntity,
  ReturnName extends string,
  ReturnPlural extends string,
  ReturnId extends EntityId,
  ReturnCount extends Cardinality,
  InputEntity,
  InputPlural extends string,
  InputCount extends Cardinality,
> = IsMulti<InputCount> extends true
  ? {
      [Key in `${CompositeLead<ReturnName, ReturnPlural, InputCount, ReturnCount>}By${Capitalize<InputPlural>}`]: (
        ...refs: (InputEntity | EntityId)[]
      ) => CompositeResult<ReturnEntity, InputCount, ReturnCount>;
    } & {
      [Key in `${CompositeIdLead<ReturnName, InputCount, ReturnCount>}By${Capitalize<InputPlural>}`]: (
        ...refs: (InputEntity | EntityId)[]
      ) => CompositeIdResult<ReturnId, InputCount, ReturnCount>;
    }
  : {};

type MutationMethods<FromEntity, FromName extends string, ToEntity, ToName extends string> = {
  [Key in `add${Capitalize<ToName>}To${Capitalize<FromName>}`]: (
    from: FromEntity | EntityId,
    to: ToEntity | EntityId,
  ) => void;
} & {
  [Key in `remove${Capitalize<ToName>}From${Capitalize<FromName>}`]: (
    from: FromEntity | EntityId,
    to: ToEntity | EntityId,
  ) => void;
} & {
  [Key in `move${Capitalize<ToName>}To${Capitalize<FromName>}`]: (
    to: ToEntity | EntityId,
    from: FromEntity | EntityId,
  ) => void;
};

type RelationshipOutput<
  FromEntity,
  FromName extends string,
  FromPlural extends string,
  FromCount extends Cardinality,
  FromId extends EntityId,
  ToEntity,
  ToName extends string,
  ToPlural extends string,
  ToCount extends Cardinality,
  ToId extends EntityId,
> = {
  state: LinkState<FromName, ToName>;
  props: IndexProps<FromName, ToName>;
  methods: LookupMethods<FromEntity, FromName, FromPlural, FromCount, FromId, ToEntity, ToName, ToPlural, ToCount, ToId> &
    // from's id-set keys the to-side; to's id-set keys the from-side.
    CompositeSetLookup<ToEntity, ToName, ToPlural, ToId, ToCount, FromEntity, FromPlural, FromCount> &
    CompositeSetLookup<FromEntity, FromName, FromPlural, FromId, FromCount, ToEntity, ToPlural, ToCount> &
    MutationMethods<FromEntity, FromName, ToEntity, ToName>;
};

/**
 * Relates two ngrx entity collections and adds typed lookups, counts, existence checks, composite
 * set-lookups, and link mutations — every member named after each side's `collection`, like ngrx's
 * own `${collection}EntityMap`. Every lookup that takes an entity also accepts its id.
 *
 * Place AFTER both collections' `withEntities`. Pass each side as `{ collection, count }`: `collection`
 * is the ngrx collection name, `count` is how many of THAT side relate to one of the other (`1`,
 * another number, or `'many'`) — it drives the names and return shapes. The side shape matches an
 * `entityConfig(...)` result, so `{ ...bookConfig, count: 'many' }` works.
 *
 * The index auto-populates from a foreign key: any entity that carries the other side's id (a book's
 * `libraryId`) is indexed automatically and stays in sync as entities are added, removed, or
 * re-pointed — no watchers, it's a `computed` over the collection. Indexing never writes entities
 * (deleting a library drops it from the index but leaves each book's `libraryId` untouched). The
 * `remove`/`move` mutations DO write the entities' foreign keys by default so they stick for
 * FK-derived links; set `syncForeignKeys: false` to never write entities. Entities with no foreign
 * key are skipped and can be linked by hand with the mutation methods (also the path for m:n).
 *
 * @param from one side: `{ collection, count, plural?, selectId?, selectForeignId? }` — entity type
 *   inferred from the store by `collection`; `plural` overrides the default `` `${collection}s` ``
 * @param to   the other side, same shape
 * @param options flags — `autoIndex` (default `true`), `syncForeignKeys` (default `true`), and
 *   `compositeLookups` (default `true`; set `false` to skip the set-lookup indexes)
 *
 * @example
 * signalStore(
 *   withEntities(libraryConfig),
 *   withEntities(bookConfig),
 *   withEntityRelationship({ collection: 'library', count: 1 }, { collection: 'book', count: 'many' }),
 * );
 * // booksByLibrary(library | id) -> Book[]   ·   bookIdsByLibrary(library | id) -> id[]
 * // libraryByBook(book | id) -> Library | undefined   ·   libraryIdByBook(book | id) -> id | undefined
 * // libraryHasBook · bookCountByLibrary · addBookToLibrary · removeBookFromLibrary · moveBookToLibrary
 * // book side is 'many', so a composite lookup keyed by a full book-set: libraryByBooks(...books | ids) -> Library
 */
export const withEntityRelationship = <
  FromName extends string,
  FromCount extends Cardinality,
  ToName extends string,
  ToCount extends Cardinality,
  Store extends SignalStoreFeatureResult & RequiredEntityStore<FromName, ToName>,
  FromSelect extends IdAccessor = IdAccessor,
  ToSelect extends IdAccessor = IdAccessor,
  FromPlural extends string = `${FromName}s`,
  ToPlural extends string = `${ToName}s`,
>(
  from: { collection: FromName; count: FromCount; plural?: FromPlural; selectId?: FromSelect; selectForeignId?: ForeignIdAccessor },
  to: { collection: ToName; count: ToCount; plural?: ToPlural; selectId?: ToSelect; selectForeignId?: ForeignIdAccessor },
  options?: RelationshipOptions,
): SignalStoreFeature<
  Store,
  RelationshipOutput<
    EntityOf<Store, FromName>,
    FromName,
    FromPlural,
    FromCount,
    IdOf<FromSelect>,
    EntityOf<Store, ToName>,
    ToName,
    ToPlural,
    ToCount,
    IdOf<ToSelect>
  >
> => {
  const fromName = from.collection;
  const toName = to.collection;
  const fromPlural = from.plural ?? `${fromName}s`;
  const toPlural = to.plural ?? `${toName}s`;
  const fromIsSingle = from.count === 1;
  const toIsSingle = to.count === 1;

  const autoIndex = options?.autoIndex ?? true;
  const syncForeignKeys = options?.syncForeignKeys ?? true;
  const compositeLookups = options?.compositeLookups ?? true;
  const readFromPrimaryId = toIdReader(from.selectId, 'id');
  const readToPrimaryId = toIdReader(to.selectId, 'id');
  // Default foreign-key name pluralizes when the side points at MORE THAN ONE of the other.
  const fromForeignKeyDefault = toIsSingle ? `${toName}Id` : `${toName}Ids`;
  const toForeignKeyDefault = fromIsSingle ? `${fromName}Id` : `${fromName}Ids`;
  const readFromForeignIds = toIdsReader(from.selectForeignId, fromForeignKeyDefault);
  const readToForeignIds = toIdsReader(to.selectForeignId, toForeignKeyDefault);
  // The WRITABLE foreign-key property per side, for syncForeignKeys — undefined when the accessor is
  // a getter, which can't be written back.
  const fromForeignKey =
    typeof from.selectForeignId === 'function' ? undefined : (from.selectForeignId ?? fromForeignKeyDefault);
  const toForeignKey =
    typeof to.selectForeignId === 'function' ? undefined : (to.selectForeignId ?? toForeignKeyDefault);

  const forwardLinksKey = `_${fromName}${capitalize(toName)}Links`;
  const reverseLinksKey = `_${toName}${capitalize(fromName)}Links`;
  const forwardMapKey = `${fromName}${capitalize(toName)}Map`;
  const reverseMapKey = `${toName}${capitalize(fromName)}Map`;
  const fromEntityMapKey = `${fromName}EntityMap`;
  const toEntityMapKey = `${toName}EntityMap`;

  const feature = signalStoreFeature(
    withState(() => ({
      [forwardLinksKey]: {} as Record<EntityId, EntityId[]>,
      [reverseLinksKey]: {} as Record<EntityId, EntityId[]>,
    })),
    withComputed((innerStore: any) => {
      // Links derived from each side's foreign key, rebuilt whenever either collection changes.
      const foreignLinks = computed(() => {
        const forward: Record<EntityId, EntityId[]> = {};
        const backward: Record<EntityId, EntityId[]> = {};

        if (!autoIndex) return { forward, backward };

        // A to-side entity naming its from-side owner(s) (e.g. book.libraryId, or a book's aisleIds).
        Object.values(innerStore[toEntityMapKey]()).forEach((entity) => {
          const toId = readToPrimaryId(entity);
          if (!hasId(toId)) return;

          readToForeignIds(entity).forEach((fromId) => {
            forward[fromId] = addUnique(forward[fromId], toId);
            backward[toId] = addUnique(backward[toId], fromId);
          });
        });

        // A from-side entity naming its to-side(s) (covers the reverse direction and m:n).
        Object.values(innerStore[fromEntityMapKey]()).forEach((entity) => {
          const fromId = readFromPrimaryId(entity);
          if (!hasId(fromId)) return;

          readFromForeignIds(entity).forEach((toId) => {
            forward[fromId] = addUnique(forward[fromId], toId);
            backward[toId] = addUnique(backward[toId], fromId);
          });
        });

        return { forward, backward };
      });

      return {
        [forwardMapKey]: computed(() =>
          projectLinks(
            mergeLinks(innerStore[forwardLinksKey](), foreignLinks().forward),
            innerStore[fromEntityMapKey](),
            innerStore[toEntityMapKey](),
          ),
        ),
        [reverseMapKey]: computed(() =>
          projectLinks(
            mergeLinks(innerStore[reverseLinksKey](), foreignLinks().backward),
            innerStore[toEntityMapKey](),
            innerStore[fromEntityMapKey](),
          ),
        ),
      };
    }),
    withMethods((innerStore: any) => {
      const resolveFromRef = toRefResolver(readFromPrimaryId);
      const resolveToRef = toRefResolver(readToPrimaryId);

      const resolveEntities = (ids: EntityId[] | undefined, entityMapKey: string): unknown[] =>
        (ids ?? []).map((id) => innerStore[entityMapKey]()[id]).filter((entity: unknown) => entity !== undefined);

      const writeLinks = (
        forward: Record<EntityId, EntityId[]>,
        backward: Record<EntityId, EntityId[]>,
      ): void => patchState(innerStore, { [forwardLinksKey]: forward, [reverseLinksKey]: backward } as any);

      const addLink = (fromId: EntityId, toId: EntityId): void => {
        const forward = { ...innerStore[forwardLinksKey]() };
        const backward = { ...innerStore[reverseLinksKey]() };
        forward[fromId] = addUnique(forward[fromId], toId);
        backward[toId] = addUnique(backward[toId], fromId);
        writeLinks(forward, backward);
      };

      const fromUpdaterConfig = { collection: fromName, selectId: (entity: any) => readFromPrimaryId(entity) } as any;
      const toUpdaterConfig = { collection: toName, selectId: (entity: any) => readToPrimaryId(entity) } as any;

      /**
       * Writes one entity's foreign key when syncForeignKeys is on and the side has a writable key:
       * the current FK ids run through `mutate`, then an array FK is replaced with the result and a
       * scalar FK with its first id (`undefined` clears it). No-ops on a missing entity or unchanged result.
       */
      const writeForeignIds = (
        entityMapKey: string,
        updaterConfig: any,
        foreignKey: string | undefined,
        isArrayForeignKey: boolean,
        entityId: EntityId,
        mutate: (currentIds: EntityId[]) => EntityId[],
      ): void => {
        if (!syncForeignKeys || foreignKey === undefined) return;
        const entity = innerStore[entityMapKey]()[entityId];

        if (entity === undefined) return;

        const current = entity[foreignKey];
        const currentIds = Array.isArray(current) ? current.filter(hasId) : hasId(current) ? [current] : [];
        const nextIds = mutate(currentIds);

        if (nextIds.length === currentIds.length && nextIds.every((id, index) => id === currentIds[index])) return;

        const nextValue = isArrayForeignKey ? nextIds : nextIds[0];
        patchState(
          innerStore,
          updateEntity({ id: entityId, changes: { [foreignKey]: nextValue } as any }, updaterConfig),
        );
      };

      // Removes the manual link, and (with syncForeignKeys) also clears the matching id from both
      // entities' foreign keys — otherwise an FK-derived link regenerates on the next read.
      const removeLink = (fromId: EntityId, toId: EntityId): void => {
        const forward = { ...innerStore[forwardLinksKey]() };
        const backward = { ...innerStore[reverseLinksKey]() };
        forward[fromId] = (forward[fromId] ?? []).filter((id: EntityId) => id !== toId);
        backward[toId] = (backward[toId] ?? []).filter((id: EntityId) => id !== fromId);
        writeLinks(forward, backward);

        writeForeignIds(toEntityMapKey, toUpdaterConfig, toForeignKey, !fromIsSingle, toId, (ids) =>
          ids.filter((id) => id !== fromId),
        );
        writeForeignIds(fromEntityMapKey, fromUpdaterConfig, fromForeignKey, !toIsSingle, fromId, (ids) =>
          ids.filter((id) => id !== toId),
        );
      };

      const moveTo = (toId: EntityId, newFromId: EntityId): void => {
        const forward = { ...innerStore[forwardLinksKey]() };
        const backward = { ...innerStore[reverseLinksKey]() };

        (backward[toId] ?? []).forEach((fromId: EntityId) => {
          forward[fromId] = (forward[fromId] ?? []).filter((id: EntityId) => id !== toId);
        });

        backward[toId] = [newFromId];
        forward[newFromId] = addUnique(forward[newFromId], toId);
        writeLinks(forward, backward);

        // With syncForeignKeys: re-point the to-entity's FK, and move the to-id from every old
        // from-entity's FK to the new one.
        writeForeignIds(toEntityMapKey, toUpdaterConfig, toForeignKey, !fromIsSingle, toId, () => [newFromId]);

        if (syncForeignKeys && fromForeignKey !== undefined) {
          Object.values(innerStore[fromEntityMapKey]()).forEach((entity: any) => {
            const fromId = readFromPrimaryId(entity);
            if (!hasId(fromId) || fromId === newFromId) return;

            writeForeignIds(fromEntityMapKey, fromUpdaterConfig, fromForeignKey, !toIsSingle, fromId, (ids) =>
              ids.filter((id) => id !== toId),
            );
          });
          writeForeignIds(fromEntityMapKey, fromUpdaterConfig, fromForeignKey, !toIsSingle, newFromId, (ids) =>
            addUnique(ids, toId),
          );
        }
      };

      const toEntityLead = toIsSingle ? toName : toPlural;
      const toIdLead = toIsSingle ? `${toName}Id` : `${toName}Ids`;
      const fromEntityLead = fromIsSingle ? fromName : fromPlural;
      const fromIdLead = fromIsSingle ? `${fromName}Id` : `${fromName}Ids`;
      const fromCap = capitalize(fromName);
      const toCap = capitalize(toName);

      const toIdsByFrom = (fromId: EntityId | undefined): EntityId[] =>
        hasId(fromId) ? innerStore[forwardMapKey]()[fromId] ?? [] : [];
      const fromIdsByTo = (toId: EntityId | undefined): EntityId[] =>
        hasId(toId) ? innerStore[reverseMapKey]()[toId] ?? [] : [];
      // The adjacency maps are already pruned (projectLinks), so their ids resolve to live entities.
      const shapeToEntities = (ids: EntityId[]): unknown =>
        toIsSingle ? resolveEntities(ids, toEntityMapKey)[0] : resolveEntities(ids, toEntityMapKey);
      const shapeFromEntities = (ids: EntityId[]): unknown =>
        fromIsSingle ? resolveEntities(ids, fromEntityMapKey)[0] : resolveEntities(ids, fromEntityMapKey);
      const shapeToIds = (ids: EntityId[]): unknown => (toIsSingle ? ids[0] : ids);
      const shapeFromIds = (ids: EntityId[]): unknown => (fromIsSingle ? ids[0] : ids);

      const methods: Record<string, (...args: any[]) => unknown> = {
        [`${toEntityLead}By${fromCap}`]: (from: any) => shapeToEntities(toIdsByFrom(resolveFromRef(from))),
        [`${toIdLead}By${fromCap}`]: (from: any) => shapeToIds(toIdsByFrom(resolveFromRef(from))),
        [`${fromEntityLead}By${toCap}`]: (to: any) => shapeFromEntities(fromIdsByTo(resolveToRef(to))),
        [`${fromIdLead}By${toCap}`]: (to: any) => shapeFromIds(fromIdsByTo(resolveToRef(to))),

        [`${fromName}Has${toCap}`]: (from: any, to: any) =>
          (innerStore[forwardMapKey]()[resolveFromRef(from) as EntityId] ?? []).includes(resolveToRef(to) as EntityId),
        [`${toName}Has${fromCap}`]: (to: any, from: any) =>
          (innerStore[reverseMapKey]()[resolveToRef(to) as EntityId] ?? []).includes(resolveFromRef(from) as EntityId),
        [`${toName}CountBy${fromCap}`]: (from: any) =>
          (innerStore[forwardMapKey]()[resolveFromRef(from) as EntityId] ?? []).length,
        [`${fromName}CountBy${toCap}`]: (to: any) =>
          (innerStore[reverseMapKey]()[resolveToRef(to) as EntityId] ?? []).length,

        [`add${toCap}To${fromCap}`]: (from: any, to: any) =>
          addLink(resolveFromRef(from) as EntityId, resolveToRef(to) as EntityId),
        [`remove${toCap}From${fromCap}`]: (from: any, to: any) =>
          removeLink(resolveFromRef(from) as EntityId, resolveToRef(to) as EntityId),
        [`move${toCap}To${fromCap}`]: (to: any, newFrom: any) =>
          moveTo(resolveToRef(to) as EntityId, resolveFromRef(newFrom) as EntityId),
      };

      // A set of the input side's ids keys the other side. Collect ALL return-entities per set so the
      // lookup can hand back every match; shape to single or array by the same rule as the type layer.
      const keyOf = (ids: EntityId[]): string => ids.map(String).sort().join('|');
      const isFixedCount = (count: Cardinality): boolean => typeof count === 'number' && count >= 2;
      const isMulti = (count: Cardinality): boolean => count !== 1;

      const addSetLookup = (
        returnName: string,
        returnPlural: string,
        returnCount: Cardinality,
        inputPlural: string,
        inputCount: Cardinality,
        sourceMapKey: string,
        returnEntityMapKey: string,
        readInputId: (entity: any) => EntityId | undefined,
      ): void => {
        const index = computed(() => {
          const built: Record<string, EntityId[]> = {};
          const source = innerStore[sourceMapKey]() as Record<EntityId, EntityId[]>;
          Object.keys(source).forEach((returnId) => {
            const key = keyOf(source[returnId]);
            built[key] = addUnique(built[key], returnId);
          });
          return built;
        });
        const resolveInputRef = toRefResolver(readInputId);
        const lookupIds = (refs: any[]): EntityId[] =>
          index()[keyOf(refs.map((ref) => resolveInputRef(ref) as EntityId))] ?? [];

        const single = isFixedCount(inputCount) || returnCount === 1;
        const entityLead = single ? returnName : returnPlural;
        const idLead = single ? `${returnName}Id` : `${returnName}Ids`;
        const inputCap = capitalize(inputPlural);

        methods[`${entityLead}By${inputCap}`] = (...refs: any[]) => {
          const entities = resolveEntities(lookupIds(refs), returnEntityMapKey);
          return single ? entities[0] : entities;
        };
        methods[`${idLead}By${inputCap}`] = (...refs: any[]) => {
          const ids = lookupIds(refs);
          return single ? ids[0] : ids;
        };
      };

      if (compositeLookups) {
        // from's id-set keys the to-side (source: to -> its froms).
        if (isMulti(from.count)) {
          addSetLookup(toName, toPlural, to.count, fromPlural, from.count, reverseMapKey, toEntityMapKey, readFromPrimaryId);
        }

        // to's id-set keys the from-side (source: from -> its tos).
        if (isMulti(to.count)) {
          addSetLookup(fromName, fromPlural, from.count, toPlural, to.count, forwardMapKey, fromEntityMapKey, readToPrimaryId);
        }
      }

      return methods;
    }),
  );

  return feature as unknown as SignalStoreFeature<
    Store,
    RelationshipOutput<
      EntityOf<Store, FromName>,
      FromName,
      FromPlural,
      FromCount,
      IdOf<FromSelect>,
      EntityOf<Store, ToName>,
      ToName,
      ToPlural,
      ToCount,
      IdOf<ToSelect>
    >
  >;
};
