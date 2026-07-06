/*
 * Public API Surface of signalkin
 */

export { withEntityRelationship } from './lib/with-entity-relationship';
export { withTransitiveRelationship } from './lib/with-transitive-relationship';
export type {
  Cardinality,
  ForeignIdAccessor,
  IdAccessor,
  RelationshipOptions,
  RelationshipSide,
} from './lib/types';
