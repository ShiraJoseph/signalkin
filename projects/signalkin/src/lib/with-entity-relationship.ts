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
  IsSingle,
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

/**
 * The position of a member entity within its owner's ordered related list (as returned by the owner's
 * get-by lookup), or -1 when the member is not linked. Takes only the member — the owner is the single
 * entity the member belongs to. Generated only where the member has exactly one owner (the owner side
 * is count 1) and that owner holds many members (the member side is `'many'` or a fixed count 2+); a
 * many-to-many has no single owner to infer, so it gets none. The member is passed as the entity or its id.
 */
type IndexOfMethod<
  OwnerName extends string,
  OwnerCount extends Cardinality,
  MemberName extends string,
  MemberEntity,
  MemberCount extends Cardinality,
> = IsSingle<OwnerCount> extends true
  ? IsMulti<MemberCount> extends true
    ? {
        [Key in `indexOf${Capitalize<OwnerName>}${Capitalize<MemberName>}`]: (
          member: MemberEntity | EntityId,
        ) => number;
      }
    : {}
  : {};

/**
 * Ordering mutations for a member within its owner's related list: swap two members, set the full
 * order, or move one to an index. Generated in the same direction as {@link IndexOfMethod} — only where
 * the member has a single owner (owner side is count 1) that holds many members. `reorder` takes the
 * complete set of that owner's members and no-ops (with a warning) on an incomplete or foreign list.
 * Members are passed as the entity or its id.
 */
type OrderingMethods<
  OwnerName extends string,
  OwnerCount extends Cardinality,
  MemberName extends string,
  MemberPlural extends string,
  MemberEntity,
  MemberCount extends Cardinality,
> = IsSingle<OwnerCount> extends true
  ? IsMulti<MemberCount> extends true
    ? {
        [Key in `swap${Capitalize<OwnerName>}${Capitalize<MemberPlural>}`]: (
          memberA: MemberEntity | EntityId,
          memberB: MemberEntity | EntityId,
        ) => void;
      } & {
        [Key in `reorder${Capitalize<OwnerName>}${Capitalize<MemberPlural>}`]: (
          orderedMembers: (MemberEntity | EntityId)[],
        ) => void;
      } & {
        [Key in `move${Capitalize<OwnerName>}${Capitalize<MemberName>}ToIndex`]: (
          member: MemberEntity | EntityId,
          index: number,
        ) => void;
      }
    : {}
  : {};

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
    IndexOfMethod<FromName, FromCount, ToName, ToEntity, ToCount> &
    IndexOfMethod<ToName, ToCount, FromName, FromEntity, FromCount> &
    OrderingMethods<FromName, FromCount, ToName, ToPlural, ToEntity, ToCount> &
    OrderingMethods<ToName, ToCount, FromName, FromPlural, FromEntity, FromCount> &
    MutationMethods<FromEntity, FromName, ToEntity, ToName>;
};

/**
 * Relates two entity collections into typed cross-lookups, counts, composite set-lookups, and link mutations named by each side's `collection`; `count` (`1`, a number, or `'many'`) drives the names and shapes, and every lookup takes the entity or its id.
 *
 * @example
 * signalStore(
 *   withEntities(libraryConfig),
 *   withEntities(bookConfig),
 *   withEntityRelationship({ collection: 'library', count: 1 }, { collection: 'book', count: 'many' }),
 * );
 * // booksByLibrary(library | id) -> Book[]
 * // libraryByBook(book | id) -> Library | undefined
 * // libraryHasBook, bookCountByLibrary, addBookToLibrary, removeBookFromLibrary, moveBookToLibrary
 * // indexOfLibraryBook(book | id) -> number (the book's position in its library, -1 if absent)
 * // swapLibraryBooks(a, b), reorderLibraryBooks(orderedBooks), moveLibraryBookToIndex(book, index) reorder a library's books
 * // book side is 'many', so a set-lookup keyed by a full book-set: libraryByBooks(...books | ids) -> Library
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
    IdOf<FromSelect, EntityOf<Store, FromName>>,
    EntityOf<Store, ToName>,
    ToName,
    ToPlural,
    ToCount,
    IdOf<ToSelect, EntityOf<Store, ToName>>
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
      // JSON-encode the sorted ids so the key is collision-proof: an id that contains a plain
      // delimiter (`a|b`) can't merge with another set, since every element is quoted and escaped.
      const keyOf = (ids: EntityId[]): string => JSON.stringify(ids.map(String).sort());
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

      // indexOf<Owner><Member>(member): the member's position in its owner's ordered list, -1 if absent.
      // Takes only the member; the owner is the single entity it belongs to. Generated where the member
      // has exactly one owner (owner side is count 1) and that owner holds many members.
      if (fromIsSingle && isMulti(to.count)) {
        methods[`indexOf${fromCap}${toCap}`] = (member: any) => {
          const memberId = resolveToRef(member) as EntityId;
          return toIdsByFrom(fromIdsByTo(memberId)[0]).indexOf(memberId);
        };
      }
      if (toIsSingle && isMulti(from.count)) {
        methods[`indexOf${toCap}${fromCap}`] = (member: any) => {
          const memberId = resolveFromRef(member) as EntityId;
          return fromIdsByTo(toIdsByFrom(memberId)[0]).indexOf(memberId);
        };
      }

      // Ordering mutations for an owner's member list: swap / reorder / move-to-index. Installed in the
      // same direction as indexOf (owner side single, member side many). The owner's ordered members are
      // its entry in the manual links map; mergeLinks keeps that array's order ahead of the FK-derived
      // links, so writing it sets the order the get-by lookup returns.
      const installOrdering = (
        ownerCap: string,
        memberCap: string,
        memberPluralCap: string,
        linksKey: string,
        membersOf: (ownerId: EntityId | undefined) => EntityId[],
        ownerOf: (memberId: EntityId | undefined) => EntityId | undefined,
        resolveMember: (ref: any) => EntityId | undefined,
      ): void => {
        const writeOrder = (ownerId: EntityId, orderedIds: EntityId[]): void =>
          patchState(innerStore, { [linksKey]: { ...innerStore[linksKey](), [ownerId]: orderedIds } } as any);

        methods[`swap${ownerCap}${memberPluralCap}`] = (memberA: any, memberB: any) => {
          const aId = resolveMember(memberA);
          const bId = resolveMember(memberB);
          const ownerId = ownerOf(aId);

          if (!hasId(ownerId)) return;

          const current = [...membersOf(ownerId)];
          const indexA = current.indexOf(aId as EntityId);
          const indexB = current.indexOf(bId as EntityId);

          if (indexA === -1 || indexB === -1) {
            console.warn(`signalkin: swap${ownerCap}${memberPluralCap} — both members must belong to the same ${ownerCap.toLowerCase()}; call ignored.`);
            return;
          }

          [current[indexA], current[indexB]] = [current[indexB], current[indexA]];
          writeOrder(ownerId, current);
        };

        methods[`reorder${ownerCap}${memberPluralCap}`] = (orderedMembers: any[]) => {
          const orderedIds = (orderedMembers ?? []).map(resolveMember).filter(hasId) as EntityId[];
          const ownerId = ownerOf(orderedIds[0]);

          if (!hasId(ownerId)) return;

          const current = membersOf(ownerId);
          const isFullPermutation =
            orderedIds.length === current.length &&
            new Set(orderedIds).size === orderedIds.length &&
            orderedIds.every((id) => current.includes(id));

          if (!isFullPermutation) {
            console.warn(`signalkin: reorder${ownerCap}${memberPluralCap} — pass the complete set of the ${ownerCap.toLowerCase()}'s members exactly once; call ignored.`);
            return;
          }

          writeOrder(ownerId, orderedIds);
        };

        methods[`move${ownerCap}${memberCap}ToIndex`] = (member: any, index: number) => {
          const memberId = resolveMember(member);
          const ownerId = ownerOf(memberId);

          if (!hasId(ownerId)) return;

          const current = [...membersOf(ownerId)];
          const currentIndex = current.indexOf(memberId as EntityId);

          if (currentIndex === -1) return;

          const target = Math.max(0, Math.min(index, current.length - 1));
          current.splice(currentIndex, 1);
          current.splice(target, 0, memberId as EntityId);
          writeOrder(ownerId, current);
        };
      };

      if (fromIsSingle && isMulti(to.count)) {
        installOrdering(
          fromCap,
          toCap,
          capitalize(toPlural),
          forwardLinksKey,
          (ownerId) => toIdsByFrom(ownerId),
          (memberId) => fromIdsByTo(memberId)[0],
          resolveToRef,
        );
      }
      if (toIsSingle && isMulti(from.count)) {
        installOrdering(
          toCap,
          fromCap,
          capitalize(fromPlural),
          reverseLinksKey,
          (ownerId) => fromIdsByTo(ownerId),
          (memberId) => toIdsByFrom(memberId)[0],
          resolveFromRef,
        );
      }

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
      IdOf<FromSelect, EntityOf<Store, FromName>>,
      EntityOf<Store, ToName>,
      ToName,
      ToPlural,
      ToCount,
      IdOf<ToSelect, EntityOf<Store, ToName>>
    >
  >;
};
