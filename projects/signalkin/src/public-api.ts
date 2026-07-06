/*
 * Public API Surface of signalkin
 */

export { withEntityAccessors } from './lib/with-entity-accessors';
export { withEntityRelationship } from './lib/with-entity-relationship';
export { withTransitiveRelationship } from './lib/with-transitive-relationship';
export type {
  Cardinality,
  EntityPredicate,
  ForeignIdAccessor,
  IdAccessor,
  RelationshipOptions,
  RelationshipSide,
} from './lib/types';
