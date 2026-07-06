import { EntityId } from '@ngrx/signals/entities';
import { ForeignIdAccessor, IdAccessor } from './types';

export const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const addUnique = (list: EntityId[] | undefined, id: EntityId): EntityId[] =>
  list?.includes(id) ? list : [...(list ?? []), id];

/** Whether an accessor returned a usable id (keeps `0` and `''`, drops `undefined` / `null`). */
export const hasId = (id: EntityId | undefined | null): id is EntityId => id !== undefined && id !== null;

/** Turns a primary-id key-or-getter accessor into a getter; a string is read as a property name off the entity. */
export const toIdReader = (
  accessor: IdAccessor | undefined,
  defaultKey: string,
): ((entity: any) => EntityId | undefined) => {
  const resolved = accessor ?? defaultKey;

  return typeof resolved === 'function' ? resolved : (entity: any) => entity?.[resolved];
};

/**
 * A foreign-key reader that always yields an array of usable ids: a scalar id becomes a one-item
 * array, an array (a plural FK like `aisleIds`) passes through, and a missing/empty key yields `[]`.
 * This lets a `>1` side carry an array foreign key without the caller normalizing.
 */
export const toIdsReader = (
  accessor: ForeignIdAccessor | undefined,
  defaultKey: string,
): ((entity: any) => EntityId[]) => {
  const read: (entity: any) => EntityId | EntityId[] | undefined =
    typeof accessor === 'function' ? accessor : (entity: any) => entity?.[accessor ?? defaultKey];

  return (entity: any) => {
    const value = read(entity);

    return Array.isArray(value) ? value.filter(hasId) : hasId(value) ? [value] : [];
  };
};

/** Unions two adjacency maps, deduping ids per key. */
export const mergeLinks = (
  base: Record<EntityId, EntityId[]>,
  extra: Record<EntityId, EntityId[]>,
): Record<EntityId, EntityId[]> => {
  const merged: Record<EntityId, EntityId[]> = {};

  [base, extra].forEach((source) =>
    Object.keys(source).forEach((keyId) => {
      merged[keyId] = source[keyId].reduce((ids, id) => addUnique(ids, id), merged[keyId] ?? []);
    }),
  );

  return merged;
};

/**
 * Drops links whose source or target entity no longer exists, so lookups never
 * return ids for entities that were removed from their collection.
 */
export const projectLinks = (
  links: Record<EntityId, EntityId[]>,
  keyEntityMap: Record<EntityId, unknown>,
  valueEntityMap: Record<EntityId, unknown>,
): Record<EntityId, EntityId[]> => {
  const projected: Record<EntityId, EntityId[]> = {};

  Object.keys(links).forEach((keyId) => {
    if (keyEntityMap[keyId] === undefined) return;

    projected[keyId] = links[keyId].filter((valueId) => valueEntityMap[valueId] !== undefined);
  });

  return projected;
};
