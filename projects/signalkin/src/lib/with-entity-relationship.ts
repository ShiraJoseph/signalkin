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
import { addUnique, capitalize, hasId, mergeLinks, projectLinks, toIdReader, toIdsReader } from './internal-helpers';
import {
  Cardinality,
  EntityOf,
  ForeignIdAccessor,
  IdAccessor,
  IdLead,
  IsFixedMulti,
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
 * The four get-by variants for one direction: return the related entity(ies) or their id(s),
 * accepting either the source entity or its id. The returned noun pluralizes by the returned
 * side's own count; the shape is a single value for a 1-side, an array otherwise.
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
  [Key in `${Lead<ReturnName, ReturnPlural, ReturnCount>}By${Capitalize<InputName>}`]: (input: InputEntity) => Related<ReturnEntity, ReturnCount>;
} & {
  [Key in `${Lead<ReturnName, ReturnPlural, ReturnCount>}By${Capitalize<InputName>}Id`]: (id: EntityId) => Related<ReturnEntity, ReturnCount>;
} & {
  [Key in `${IdLead<ReturnName, ReturnCount>}By${Capitalize<InputName>}`]: (input: InputEntity) => Related<ReturnId, ReturnCount>;
} & {
  [Key in `${IdLead<ReturnName, ReturnCount>}By${Capitalize<InputName>}Id`]: (id: EntityId) => Related<ReturnId, ReturnCount>;
};

/** Existence checks and counts across the link, both directions. */
type HasCountMethods<FromName extends string, ToName extends string> = {
  [Key in `${FromName}Has${Capitalize<ToName>}`]: (fromId: EntityId, toId: EntityId) => boolean;
} & {
  [Key in `${ToName}Has${Capitalize<FromName>}`]: (toId: EntityId, fromId: EntityId) => boolean;
} & {
  [Key in `${ToName}CountBy${Capitalize<FromName>}`]: (fromId: EntityId) => number;
} & {
  [Key in `${FromName}CountBy${Capitalize<ToName>}`]: (toId: EntityId) => number;
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
  HasCountMethods<FromName, ToName>;

/**
 * When the INPUT side's count is a fixed number of 2+, a full set of that side's ids is a
 * composite key that pins exactly one of the other side. Generates variadic get-by-set methods:
 * pass the entities or their ids (any order, deduped by sorted join), get the single other-side
 * entity or its id. A `'many'` side gets none by default (kept off to bound the method/index count).
 */
type CompositeSetLookup<
  ReturnEntity,
  ReturnName extends string,
  ReturnId extends EntityId,
  InputEntity,
  InputName extends string,
  InputPlural extends string,
  InputCount extends Cardinality,
> = IsFixedMulti<InputCount> extends true
  ? {
      [Key in `${ReturnName}By${Capitalize<InputPlural>}`]: (...entities: InputEntity[]) => ReturnEntity | undefined;
    } & {
      [Key in `${ReturnName}By${Capitalize<InputName>}Ids`]: (...ids: EntityId[]) => ReturnEntity | undefined;
    } & {
      [Key in `${ReturnName}IdBy${Capitalize<InputPlural>}`]: (...entities: InputEntity[]) => ReturnId | undefined;
    } & {
      [Key in `${ReturnName}IdBy${Capitalize<InputName>}Ids`]: (...ids: EntityId[]) => ReturnId | undefined;
    }
  : {};

type MutationMethods<FromName extends string, ToName extends string> = {
  [Key in `add${Capitalize<ToName>}To${Capitalize<FromName>}`]: (fromId: EntityId, toId: EntityId) => void;
} & {
  [Key in `remove${Capitalize<ToName>}From${Capitalize<FromName>}`]: (fromId: EntityId, toId: EntityId) => void;
} & {
  [Key in `move${Capitalize<ToName>}To${Capitalize<FromName>}`]: (toId: EntityId, fromId: EntityId) => void;
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
    CompositeSetLookup<ToEntity, ToName, ToId, FromEntity, FromName, FromPlural, FromCount> &
    CompositeSetLookup<FromEntity, FromName, FromId, ToEntity, ToName, ToPlural, ToCount> &
    MutationMethods<FromName, ToName>;
};

/**
 * Relates two ngrx entity collections and adds typed lookups, counts, existence
 * checks, an optional composite set-lookup, and link mutations — every member named
 * after each side's collection `name`, like ngrx's own `${name}EntityMap`.
 *
 * Place AFTER both collections' `withEntities`. Pass each side as `{ name, count }`:
 * `name` is the collection name, `count` is how many of THAT side relate to one of the
 * other (`1`, another number, or `'many'`) — it drives the names and return shapes.
 *
 * The index auto-populates from a foreign key: any entity that carries the other side's
 * id (a book's `libraryId`) is indexed automatically and stays in sync as entities are
 * added, removed, or re-pointed — no watchers, it's a `computed` over the collection.
 * By default entities are never written; only the index reflects them (so deleting a
 * library drops it from the index but leaves each book's `libraryId` untouched, and
 * `remove`/`move` affect manual links only — an FK-derived link regenerates from the FK).
 * Set `syncForeignKeys: true` to let `remove`/`move` write the foreign keys too, so they
 * stick for FK-derived links. Entities with no foreign key are skipped and can be linked
 * by hand with the mutation methods (also the path for m:n, which has no single foreign
 * key). Each side declares how its ids are read via `selectPrimaryId` / `selectForeignId`;
 * the third arg carries on/off flags.
 *
 * Only set `selectForeignId` on the side whose entity ACTUALLY stores the key — if a `Library`
 * has no reference to its books, don't give the library side a foreign key (leave it to the
 * side that has it, or link by hand). The default key name pluralizes with cardinality: a side
 * that links to one of the other defaults to `` `${otherName}Id` `` (scalar); a side that links
 * to more than one defaults to `` `${otherName}Ids` `` (array, e.g. a book's `aisleIds`).
 *
 * @param from one side: `{ name, count, plural?, selectPrimaryId?, selectForeignId? }` — entity type inferred from
 *   the store by `name`; `plural` overrides the default `` `${name}s` `` in every generated member (e.g. `'libraries'`)
 * @param to   the other side, same shape
 * @param options flags — `autoIndex` (default `true`; set `false` for explicit links only) and
 *   `syncForeignKeys` (default `false`; `true` lets `remove`/`move` write the entities' foreign
 *   keys — needs the FK to be a property name, getter sides are skipped)
 *
 * @example
 * signalStore(
 *   withEntities(libraryConfig),
 *   withEntities(bookConfig),
 *   withEntityRelationship({ name: 'library', count: 1 }, { name: 'book', count: 'many' }),
 * );
 * // booksByLibrary(library) / booksByLibraryId(id) -> Book[]   (also bookIdsByLibrary / ...Id -> id[])
 * // libraryByBook(book) / libraryByBookId(id) -> Library | undefined   (also libraryIdByBook / ...Id -> id)
 * // libraryHasBook · bookCountByLibrary · addBookToLibrary · removeBookFromLibrary · moveBookToLibrary
 * // A side with a fixed count 2+ also gets a variadic composite lookup, e.g. a book cross-shelved
 * // in exactly 2 aisles (aisle count 2): bookByAisles(...aisles) / bookByAisleIds(...ids) -> Book | id
 *
 * @example
 * // custom id fields (ngrx selectId is `id2`, the foreign key is `libraryId2`):
 * withEntityRelationship(
 *   { name: 'library', count: 1, selectPrimaryId: 'id2' },
 *   { name: 'book', count: 'many', selectPrimaryId: 'id2', selectForeignId: 'libraryId2' },
 * );
 */
export const withEntityRelationship = <
  FromName extends string,
  FromCount extends Cardinality,
  ToName extends string,
  ToCount extends Cardinality,
  Store extends SignalStoreFeatureResult & RequiredEntityStore<FromName, ToName>,
  FromId extends EntityId = EntityId,
  ToId extends EntityId = EntityId,
  FromPlural extends string = `${FromName}s`,
  ToPlural extends string = `${ToName}s`,
>(
  from: { name: FromName; count: FromCount; plural?: FromPlural; selectPrimaryId?: IdAccessor<FromId>; selectForeignId?: ForeignIdAccessor; ordered?: boolean },
  to: { name: ToName; count: ToCount; plural?: ToPlural; selectPrimaryId?: IdAccessor<ToId>; selectForeignId?: ForeignIdAccessor; ordered?: boolean },
  options?: RelationshipOptions,
): SignalStoreFeature<
  Store,
  RelationshipOutput<
    EntityOf<Store, FromName>,
    FromName,
    FromPlural,
    FromCount,
    FromId,
    EntityOf<Store, ToName>,
    ToName,
    ToPlural,
    ToCount,
    ToId
  >
> => {
  const fromName = from.name;
  const toName = to.name;
  const fromPlural = from.plural ?? `${fromName}s`;
  const toPlural = to.plural ?? `${toName}s`;
  const fromIsSingle = from.count === 1;
  const toIsSingle = to.count === 1;

  const autoIndex = options?.autoIndex ?? true;
  const syncForeignKeys = options?.syncForeignKeys ?? false;
  const readFromPrimaryId = toIdReader(from.selectPrimaryId, 'id');
  const readToPrimaryId = toIdReader(to.selectPrimaryId, 'id');
  // Default foreign-key name pluralizes when the side points at MORE THAN ONE of the other:
  // a from-entity links to `to.count` of the to-side, a to-entity links to `from.count` of the from-side.
  const fromForeignKeyDefault = toIsSingle ? `${toName}Id` : `${toName}Ids`;
  const toForeignKeyDefault = fromIsSingle ? `${fromName}Id` : `${fromName}Ids`;
  const readFromForeignIds = toIdsReader(from.selectForeignId, fromForeignKeyDefault);
  const readToForeignIds = toIdsReader(to.selectForeignId, toForeignKeyDefault);
  // The WRITABLE foreign-key property per side, for syncForeignKeys — undefined when the
  // accessor is a getter, which can't be written back.
  // TODO: find a way to sync getter-based foreign keys too (e.g. an optional write callback
  // alongside selectForeignId) so syncForeignKeys stops skipping those sides.
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
       * Writes one entity's foreign key when syncForeignKeys is on and the side has a writable
       * key: the current FK ids run through `mutate`, then an array FK is replaced with the
       * result and a scalar FK with its first id (`undefined` clears it). No-ops on a missing
       * entity or an unchanged result.
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

      // Removes the manual link, and (with syncForeignKeys) also clears the matching id from
      // both entities' foreign keys — otherwise an FK-derived link regenerates on the next read.
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

      const toIdsByFrom = (fromId: EntityId): EntityId[] => innerStore[forwardMapKey]()[fromId] ?? [];
      const fromIdsByTo = (toId: EntityId): EntityId[] => innerStore[reverseMapKey]()[toId] ?? [];
      // The adjacency maps are already pruned (projectLinks), so their ids resolve to live entities.
      const shapeToEntities = (ids: EntityId[]): unknown =>
        toIsSingle ? resolveEntities(ids, toEntityMapKey)[0] : resolveEntities(ids, toEntityMapKey);
      const shapeFromEntities = (ids: EntityId[]): unknown =>
        fromIsSingle ? resolveEntities(ids, fromEntityMapKey)[0] : resolveEntities(ids, fromEntityMapKey);
      const shapeToIds = (ids: EntityId[]): unknown => (toIsSingle ? ids[0] : ids);
      const shapeFromIds = (ids: EntityId[]): unknown => (fromIsSingle ? ids[0] : ids);

      const methods: Record<string, (...args: any[]) => unknown> = {
        // Related entity(ies) / id(s) in each direction, accepting either the source entity or its id.
        [`${toEntityLead}By${fromCap}`]: (from: any) => shapeToEntities(toIdsByFrom(readFromPrimaryId(from) as EntityId)),
        [`${toEntityLead}By${fromCap}Id`]: (fromId: EntityId) => shapeToEntities(toIdsByFrom(fromId)),
        [`${toIdLead}By${fromCap}`]: (from: any) => shapeToIds(toIdsByFrom(readFromPrimaryId(from) as EntityId)),
        [`${toIdLead}By${fromCap}Id`]: (fromId: EntityId) => shapeToIds(toIdsByFrom(fromId)),

        [`${fromEntityLead}By${toCap}`]: (to: any) => shapeFromEntities(fromIdsByTo(readToPrimaryId(to) as EntityId)),
        [`${fromEntityLead}By${toCap}Id`]: (toId: EntityId) => shapeFromEntities(fromIdsByTo(toId)),
        [`${fromIdLead}By${toCap}`]: (to: any) => shapeFromIds(fromIdsByTo(readToPrimaryId(to) as EntityId)),
        [`${fromIdLead}By${toCap}Id`]: (toId: EntityId) => shapeFromIds(fromIdsByTo(toId)),

        [`${fromName}Has${toCap}`]: (fromId: EntityId, toId: EntityId) =>
          (innerStore[forwardMapKey]()[fromId] ?? []).includes(toId),
        [`${toName}Has${fromCap}`]: (toId: EntityId, fromId: EntityId) =>
          (innerStore[reverseMapKey]()[toId] ?? []).includes(fromId),
        [`${toName}CountBy${fromCap}`]: (fromId: EntityId) => (innerStore[forwardMapKey]()[fromId] ?? []).length,
        [`${fromName}CountBy${toCap}`]: (toId: EntityId) => (innerStore[reverseMapKey]()[toId] ?? []).length,

        [`add${toCap}To${fromCap}`]: (fromId: EntityId, toId: EntityId) => addLink(fromId, toId),
        [`remove${toCap}From${fromCap}`]: (fromId: EntityId, toId: EntityId) => removeLink(fromId, toId),
        [`move${toCap}To${fromCap}`]: (toId: EntityId, newFromId: EntityId) => moveTo(toId, newFromId),
      };

      // A fixed set (count 2+) of one side's ids is a composite key for the single other-side entity.
      const keyOf = (ids: EntityId[]): string => ids.map(String).sort().join('|');
      const addSetLookup = (
        returnName: string,
        inputName: string,
        inputPlural: string,
        sourceMapKey: string,
        returnEntityMapKey: string,
        readInputId: (entity: any) => EntityId | undefined,
      ): void => {
        const index = computed(() => {
          const built: Record<string, EntityId> = {};
          const source = innerStore[sourceMapKey]() as Record<EntityId, EntityId[]>;
          Object.keys(source).forEach((returnId) => {
            built[keyOf(source[returnId])] = returnId;
          });
          return built;
        });
        const lookupId = (ids: EntityId[]): EntityId | undefined => index()[keyOf(ids)];
        const inputCap = capitalize(inputName);
        const idsFromEntities = (entities: any[]): EntityId[] => entities.map(readInputId) as EntityId[];

        methods[`${returnName}By${capitalize(inputPlural)}`] = (...entities: any[]) =>
          innerStore[returnEntityMapKey]()[lookupId(idsFromEntities(entities)) as EntityId];
        methods[`${returnName}By${inputCap}Ids`] = (...ids: EntityId[]) =>
          innerStore[returnEntityMapKey]()[lookupId(ids) as EntityId];
        methods[`${returnName}IdBy${capitalize(inputPlural)}`] = (...entities: any[]) => lookupId(idsFromEntities(entities));
        methods[`${returnName}IdBy${inputCap}Ids`] = (...ids: EntityId[]) => lookupId(ids);
      };

      const isFixedMulti = (count: Cardinality): boolean => typeof count === 'number' && count >= 2;
      // Input side = the one whose full id-set is the key; it maps to the single other-side entity.
      if (isFixedMulti(from.count))
        addSetLookup(toName, fromName, fromPlural, reverseMapKey, toEntityMapKey, readFromPrimaryId);
      if (isFixedMulti(to.count))
        addSetLookup(fromName, toName, toPlural, forwardMapKey, fromEntityMapKey, readToPrimaryId);

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
      FromId,
      EntityOf<Store, ToName>,
      ToName,
      ToPlural,
      ToCount,
      ToId
    >
  >;
};
