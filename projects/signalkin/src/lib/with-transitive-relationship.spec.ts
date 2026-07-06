import { TestBed } from '@angular/core/testing';
import { signalStore, type } from '@ngrx/signals';
import { entityConfig } from '@ngrx/signals/entities';
import { withEntityAccessors } from './with-entity-accessors';
import { withEntityRelationship } from './with-entity-relationship';
import { withTransitiveRelationship } from './with-transitive-relationship';

interface Author {
  id: string;
  name: string;
}

interface Post {
  id: string;
  authorId: string;
}

interface Comment {
  id: string;
  postId: string;
}

interface Reply {
  id: string;
  commentId: string;
}

const authorConfig = entityConfig({ entity: type<Author>(), collection: 'author' });
const postConfig = entityConfig({ entity: type<Post>(), collection: 'post' });
const commentConfig = entityConfig({ entity: type<Comment>(), collection: 'comment' });
const replyConfig = entityConfig({ entity: type<Reply>(), collection: 'reply' });

const BlogStore = signalStore(
  { providedIn: 'root' },
  withEntityAccessors(authorConfig),
  withEntityAccessors(postConfig),
  withEntityAccessors(commentConfig),
  withEntityAccessors(replyConfig),
  withEntityRelationship({ name: 'author', count: 1 }, { name: 'post', count: 'many' }),
  withEntityRelationship({ name: 'post', count: 1 }, { name: 'comment', count: 'many' }),
  withEntityRelationship({ name: 'comment', count: 1 }, { name: 'reply', count: 'many' }),
  withTransitiveRelationship({ from: 'author', to: 'comment', through: 'post' }),
  withTransitiveRelationship({ from: 'author', to: 'reply', through: ['post', 'comment'] }),
);

const ursula: Author = { id: 'a1', name: 'Ursula' };
const octavia: Author = { id: 'a2', name: 'Octavia' };
const posts: Post[] = [
  { id: 'p1', authorId: 'a1' },
  { id: 'p2', authorId: 'a1' },
  { id: 'p3', authorId: 'a2' },
];
const comments: Comment[] = [
  { id: 'c1', postId: 'p1' },
  { id: 'c2', postId: 'p2' },
  { id: 'c3', postId: 'p3' },
];
const replies: Reply[] = [
  { id: 'r1', commentId: 'c1' },
  { id: 'r2', commentId: 'c2' },
];

describe('withTransitiveRelationship', () => {
  let store: InstanceType<typeof BlogStore>;

  beforeEach(() => {
    store = TestBed.inject(BlogStore);
    store.setAllAuthors([ursula, octavia]);
    store.setAllPosts(posts);
    store.setAllComments(comments);
    store.setAllReplys(replies);
  });

  it('walks one intermediary in both directions', () => {
    expect(store.commentsByAuthor(ursula)).toEqual([comments[0], comments[1]]);
    expect(store.commentsByAuthorId('a2')).toEqual([comments[2]]);
    expect(store.commentIdsByAuthorId('a1')).toEqual(['c1', 'c2']);
    expect(store.authorsByComment(comments[0])).toEqual([ursula]);
    expect(store.authorsByCommentId('c3')).toEqual([octavia]);
    expect(store.authorIdsByCommentId('c1')).toEqual(['a1']);
  });

  it('walks multiple intermediaries (through as an array)', () => {
    expect(store.replysByAuthor(ursula)).toEqual(replies);
    expect(store.authorsByReplyId('r1')).toEqual([ursula]);
  });

  it('reflects entity changes reactively', () => {
    store.updatePost('p2', { authorId: 'a2' });
    expect(store.commentIdsByAuthorId('a1')).toEqual(['c1']);
    expect(store.commentIdsByAuthorId('a2')).toEqual(['c2', 'c3']);
  });

  it('dedupes when multiple paths reach the same endpoint', () => {
    store.addCommentToPost('p2', 'c1');
    const commentIds = store.commentIdsByAuthorId('a1');
    expect(commentIds.filter((id) => id === 'c1')).toEqual(['c1']);
  });

  it('returns empty arrays for unknown ids', () => {
    expect(store.commentsByAuthorId('nope')).toEqual([]);
    expect(store.authorsByCommentId('nope')).toEqual([]);
  });

  it('throws a clear error when a hop map is missing', () => {
    const BrokenStore = signalStore(
      { providedIn: 'root' },
      withEntityAccessors(authorConfig),
      withEntityAccessors(commentConfig),
      // No direct author→post / post→comment relationships registered.
      withTransitiveRelationship({ from: 'author', to: 'comment', through: 'post' }),
    );
    const broken = TestBed.inject(BrokenStore);

    expect(() => broken.commentsByAuthorId('a1')).toThrowError(/authorPostMap.*author → post → comment/s);
  });
});
