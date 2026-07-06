import { signalStore, type } from '@ngrx/signals';
import { entityConfig, withEntities } from '@ngrx/signals/entities';
import { withEntityAccessors, withEntityRelationship, withTransitiveRelationship } from 'signalkin';

export interface Author {
  id: string;
  name: string;
}

export interface Post {
  id: string;
  authorId: string;
  title: string;
}

export interface Comment {
  id: string;
  postId: string;
  text: string;
}

const authorConfig = entityConfig({ entity: type<Author>(), collection: 'author' });
const postConfig = entityConfig({ entity: type<Post>(), collection: 'post' });
const commentConfig = entityConfig({ entity: type<Comment>(), collection: 'comment' });

export const DemoStore = signalStore(
  { providedIn: 'root' },
  withEntityAccessors(authorConfig),
  withEntities(postConfig),
  withEntities(commentConfig),
  withEntityRelationship({ name: 'author', count: 1 }, { name: 'post', count: 'many' }),
  withEntityRelationship({ name: 'post', count: 1 }, { name: 'comment', count: 'many' }),
  withTransitiveRelationship({ from: 'author', to: 'comment', through: 'post' }),
);
