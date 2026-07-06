/**
 * Compile-time assertions that the relationship features resolve REAL entity types
 * (not `never`/`unknown`) when composed through the published package. Never executed;
 * failing any assertion fails the sandbox build.
 */
import { inject } from '@angular/core';
import { Author, Comment, DemoStore, Post } from './demo.store';

const assertType = <T>(value: T): T => value;

export const typecheckProbe = (): void => {
  const store = inject(DemoStore);
  const anAuthor: Author = { id: 'a1', name: 'Ursula' };
  const aPost: Post = { id: 'p1', authorId: 'a1', title: 'On Dragons' };
  const aComment: Comment = { id: 'c1', postId: 'p1', text: 'Loved this' };

  // Direct relationship, both directions, entity and id variants.
  assertType<Post[]>(store.postsByAuthor(anAuthor));
  assertType<Post[]>(store.postsByAuthorId('a1'));
  assertType<Author | undefined>(store.authorByPost(aPost));
  assertType<Comment[]>(store.commentsByPost(aPost));
  assertType<(string | number)[]>(store.commentIdsByPostId('p1'));
  assertType<boolean>(store.authorHasPost('a1', 'p1'));
  assertType<number>(store.postCountByAuthor('a1'));
  store.addPostToAuthor('a1', 'p1');
  store.removeCommentFromPost('p1', 'c1');
  store.moveCommentToPost('c1', 'p2');

  // Transitive relationship: endpoints resolve through the intermediary.
  assertType<Comment[]>(store.commentsByAuthor(anAuthor));
  assertType<Author[]>(store.authorsByComment(aComment));

  // Entity accessors (the author collection is set up via withEntityAccessors).
  assertType<Author[]>(store.authors());
  assertType<Record<string | number, Author>>(store.authorMap());
  assertType<number>(store.authorCount());
  assertType<Author | undefined>(store.authorById('a1'));
  assertType<boolean>(store.hasAuthor('a1'));
  store.addAuthor(anAuthor);
  store.addAuthors([anAuthor]);
  store.prependAuthor(anAuthor);
  store.setAuthor(anAuthor);
  store.setAllAuthors([anAuthor]);
  store.upsertAuthor(anAuthor);
  store.updateAuthor('a1', { name: 'Ursula K.' });
  store.updateAuthors(['a1'], (author) => ({ name: `${author.name}!` }));
  store.updateAllAuthors({ name: 'Everyone' });
  store.removeAuthor('a1');
  store.removeAuthors((author) => author.name === '');
  store.removeAllAuthors();

  // Wrong entity type is rejected (a Comment is not an Author).
  // @ts-expect-error
  store.postsByAuthor(aComment);
};
