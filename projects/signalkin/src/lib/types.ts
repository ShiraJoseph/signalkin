import { EntityId } from '@ngrx/signals/entities';

/**
 * How many entities of one side relate to a single entity of the other side.
 * A literal `1` means single; any other number (e.g. `2`) or `'many'` means multiple.
 * Pass a literal so the generated key names and return shapes resolve correctly.
 */
export type Cardinality = number | 'many';

export type IsSingle<Count extends Cardinality> = Count extends 1 ? true : false;

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

/** True when a side's count is a fixed number of 2+ — the case where a set of that side's ids forms a composite key that pins one of the other side. */
export type IsFixedMulti<Count extends Cardinality> = Count extends 'many' ? false : Count extends 1 ? false : true;

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
 * Reads the RAW state map (`Record<EntityId, Entity>`), which is what lets a caller pass only `name`.
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

/** One side of a relationship: the collection `name`, how many of it relate to one of the other side, and how its ids are read. */
export type RelationshipSide<Name extends string, Count extends Cardinality> = {
  /** The ngrx collection name; the entity type is inferred from the store by this name. */
  name: Name;
  /** How many of this side relate to a single entity of the other side. */
  count: Count;
  /** The plural of `name`, used in every generated member that pluralizes it. Default: `` `${name}s` ``. */
  plural?: string;
  /** How to read THIS entity's own id; keep it matching the collection's `selectId`. Default: the `'id'` property. */
  selectPrimaryId?: IdAccessor;
  /**
   * How to read THIS entity's foreign key to the other side — set ONLY if this entity actually stores it.
   * Default key: `` `${otherName}Id` `` when this side links to one of the other, `` `${otherName}Ids` ``
   * (an array, e.g. a book's `aisleIds`) when it links to more than one.
   */
  selectForeignId?: ForeignIdAccessor;
  /** Reserved: whether link order is meaningful (arrays already keep insertion order). */
  ordered?: boolean;
};

/** Flags to turn optional behavior on or off. */
export type RelationshipOptions = {
  /** Auto-populate the index from foreign keys as entities change. Default: `true`. Set `false` for explicit links only. */
  autoIndex?: boolean;
  /**
   * Let `remove`/`move` mutations write the entities' foreign keys, so removal sticks for
   * FK-derived links (`removeBookFromLibrary` clears the book's `libraryId`; `move` re-points it).
   * Default: `false` (entities are never written; the FK is the source of truth).
   * Only works on a side whose `selectForeignId` is a property NAME (or defaulted) — a getter
   * can't be written back, so getter sides are skipped.
   */
  syncForeignKeys?: boolean;
};
