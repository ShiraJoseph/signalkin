import { EntityId } from '@ngrx/signals/entities';

/**
 * How many entities of one side relate to a single entity of the other side.
 * A literal `1` means single; any other number (e.g. `2`) or `'many'` means multiple.
 * Pass a literal so the generated key names and return shapes resolve correctly.
 */
export type Cardinality = number | 'many';

export type IsSingle<Count extends Cardinality> = Count extends 1 ? true : false;

/** True when a side relates to MORE THAN ONE of the other (any number >= 2, or `'many'`) — i.e. not `1`. */
export type IsMulti<Count extends Cardinality> = IsSingle<Count> extends true ? false : true;

/**
 * True when a side's count is a FIXED number of 2+ (not `1`, not `'many'`). A fixed-size set of that
 * side's ids acts as a composite key that pins one of the other side, so a lookup keyed by it is single.
 */
export type IsFixedCount<Count extends Cardinality> = Count extends 'many' ? false : Count extends 1 ? false : true;

/** A single entity for a 1-side (or `undefined` when the link is missing), an array for a many-side. */
export type Related<Entity, Count extends Cardinality> = IsSingle<Count> extends true
  ? Entity | undefined
  : Entity[];

/** Leading noun of a generated key: the bare name for a 1-side, the (given or default `+s`) plural for a many-side. */
export type Lead<Name extends string, Plural extends string, Count extends Cardinality> = IsSingle<Count> extends true
  ? Name
  : Plural;

/** The id-returning noun for a side: `${Name}Id` for a 1-side, `${Name}Ids` for a many/number-side. */
export type IdLead<Name extends string, Count extends Cardinality> = IsSingle<Count> extends true
  ? `${Name}Id`
  : `${Name}Ids`;

/**
 * Whether a composite lookup keyed by a SET of one side's ids returns a single entity. It does when the
 * set is a candidate key — the keyed (input) side has a fixed count of 2+ — OR when only one of the
 * returned side can ever match (the returned side is a 1-side). Otherwise more than one may match, so
 * the lookup returns an array.
 */
export type CompositeSingle<InputCount extends Cardinality, ReturnCount extends Cardinality> =
  IsFixedCount<InputCount> extends true ? true : IsSingle<ReturnCount>;

/** A single entity when the composite lookup is single, else an array of all matches. */
export type CompositeResult<Entity, InputCount extends Cardinality, ReturnCount extends Cardinality> =
  CompositeSingle<InputCount, ReturnCount> extends true ? Entity | undefined : Entity[];

/** A single id when the composite lookup is single, else an array of all matching ids. */
export type CompositeIdResult<Id extends EntityId, InputCount extends Cardinality, ReturnCount extends Cardinality> =
  CompositeSingle<InputCount, ReturnCount> extends true ? Id | undefined : Id[];

/** The leading noun of a composite lookup's name: singular when it returns one, plural when it returns an array. */
export type CompositeLead<
  Name extends string,
  Plural extends string,
  InputCount extends Cardinality,
  ReturnCount extends Cardinality,
> = CompositeSingle<InputCount, ReturnCount> extends true ? Name : Plural;

/** The id-returning noun of a composite lookup's name: `${Name}Id` when single, `${Name}Ids` when an array. */
export type CompositeIdLead<
  Name extends string,
  InputCount extends Cardinality,
  ReturnCount extends Cardinality,
> = CompositeSingle<InputCount, ReturnCount> extends true ? `${Name}Id` : `${Name}Ids`;

/**
 * The state a feature REQUIRES: the named collections' entity maps must already exist. Intersected
 * into a feature's `Input` so `signalStore` refuses to compile it unless placed AFTER those
 * `withEntities` calls (ordering enforcement), and so the real entity types can be read back out.
 */
export type RequiredEntityMaps<Names extends string> = {
  state: Record<`${Names}EntityMap`, Record<EntityId, unknown>>;
};

/** {@link RequiredEntityMaps} for a relationship's two sides. */
export type RequiredEntityStore<FromName extends string, ToName extends string> = RequiredEntityMaps<
  FromName | ToName
>;

/** The collection names present on a store's state, read off its `${name}EntityMap` keys. */
export type CollectionNames<State> = {
  [Key in keyof State & string]: Key extends `${infer Name}EntityMap` ? Name : never;
}[keyof State & string];

/**
 * Extracts a collection's entity type from the inferred input store, by collection name — e.g.
 * `EntityOf<Store, 'book'>` reads `Store['state']['bookEntityMap']` and yields `Book`.
 * Reads the RAW state map (`Record<EntityId, Entity>`), which is what lets a caller pass only the name.
 */
export type EntityOf<Store, Name extends string> = Store extends { state: infer State }
  ? State extends Record<`${Name}EntityMap`, Record<EntityId, infer Entity>>
    ? Entity
    : never
  : never;

/** A test an entity either passes or fails — used to pick which entities a bulk update/remove touches. */
export type EntityPredicate<Entity> = (entity: Entity) => boolean;

/**
 * A property name to read, or a getter that returns an id — mirrors ngrx `selectId`, but a key string
 * also works. A typed getter (e.g. `(entity) => entity.id2`) lets the id type be inferred (branded ids
 * like `OptionId` flow through the return types); a string key or omitting it falls back to `EntityId`.
 */
export type IdAccessor<Id extends EntityId = EntityId> = string | ((entity: any) => Id);

/**
 * Like {@link IdAccessor}, but for a foreign key that may be absent or plural — a getter may return a
 * single id, an array of ids (for a side that links to more than one of the other), or `undefined`.
 */
export type ForeignIdAccessor = string | ((entity: any) => EntityId | EntityId[] | undefined);

/**
 * One side of a relationship: the `collection` name, how many of it relate to one of the other side,
 * and how its ids are read. The shape matches an `entityConfig(...)` result (`collection`, `selectId`),
 * so `{ ...bookConfig, count: 'many' }` works — you only add the relationship-specific `count` (and
 * optionally `plural` / `selectForeignId`).
 */
export type RelationshipSide<Name extends string, Count extends Cardinality> = {
  /** The ngrx collection name; the entity type is inferred from the store by this name. */
  collection: Name;
  /** How many of this side relate to a single entity of the other side. */
  count: Count;
  /** The plural of `collection`, used in every generated member that pluralizes it. Default: `` `${collection}s` ``. */
  plural?: string;
  /** How to read THIS entity's own id; keep it matching the collection's `selectId`. Default: the `'id'` property. */
  selectId?: IdAccessor;
  /**
   * How to read THIS entity's foreign key to the other side — set ONLY if this entity actually stores it.
   * Default key: `` `${otherName}Id` `` when this side links to one of the other, `` `${otherName}Ids` ``
   * (an array, e.g. a book's `aisleIds`) when it links to more than one.
   */
  selectForeignId?: ForeignIdAccessor;
};

/** Flags to turn optional behavior on or off. */
export type RelationshipOptions = {
  /** Auto-populate the index from foreign keys as entities change. Default: `true`. Set `false` for explicit links only. */
  autoIndex?: boolean;
  /**
   * Let `remove`/`move` mutations write the entities' foreign keys, so removal sticks for
   * FK-derived links (`removeBookFromLibrary` clears the book's `libraryId`; `move` re-points it).
   * Default: `true`. Set `false` to never write entities (the FK stays the source of truth and
   * those mutations affect manual links only). Only works on a side whose `selectForeignId` is
   * a property NAME (or defaulted) — a getter can't be written back, so getter sides are skipped.
   */
  syncForeignKeys?: boolean;
  /**
   * Generate the composite set-lookups (`bookByRows(...)` / `authorByBooks(...)`) for each side that
   * relates to more than one of the other. Default: `true`. Set `false` to skip building those indexes.
   */
  compositeLookups?: boolean;
};
