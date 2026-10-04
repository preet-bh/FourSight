import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthState, CommunityDataApi, CommunityPost, ModerationFlag } from '../../platform/contracts';
import {
  COMMUNITY_TOPICS,
  ForumPage,
  canModerateCommunity,
  flagCommunityContent,
  filterCommunityPosts,
  submitCommunityComment,
  submitCommunityPost,
  moderateCommunityContent,
} from './ForumPage';

const makePost = (overrides: Partial<CommunityPost> = {}): CommunityPost => ({
  id: 'post-1', title: 'Street lights', body: 'The lights are out.', topic: 'Report discussion', region: 'Boston',
  author: 'Alex', at: '2026-10-01T00:00:00Z', comments: [], flags: 0, hidden: false, reportId: 'FS-2048',
  ...overrides,
});
const signedIn = (role: 'resident' | 'moderator' | 'city_admin'): AuthState => ({ status: 'signed_in', user: { id: 'u1', displayName: 'Alex', role } });
const makeFlag = (overrides: Partial<ModerationFlag> = {}): ModerationFlag => ({
  id: 'flag-1', target: { kind: 'post', id: 'post-1' }, region: 'Boston', contentPreview: 'Street lights', reason: 'Needs review', createdAt: '2026-10-01T01:00:00Z', ...overrides,
});
const apiStub = () => ({
  listPosts: vi.fn(async () => []),
  createPost: vi.fn(async (input) => makePost({ ...input, reportId: input.reportId ?? null })),
  addComment: vi.fn(async (_postId, body) => ({ id: 'c1', body, author: 'Alex', at: 'now', hidden: false })),
  flagContent: vi.fn(async () => {}),
  listModerationFlags: vi.fn(async () => [makeFlag()]),
  reviewFlag: vi.fn(async () => {}),
  subscribeCommunity: vi.fn(() => () => {}),
}) as unknown as CommunityDataApi;

describe('community forum', () => {
  it('covers report discussion and broad civic topics', () => {
    expect(COMMUNITY_TOPICS).toEqual(expect.arrayContaining([
      'Report discussion', 'Electricity & utilities', 'Housing', 'Cost of living', 'Transit', 'Safety', 'Public services',
    ]));
  });

  it('filters posts to the selected region and hides moderated content', () => {
    const posts = [makePost(), makePost({ id: 'post-2', region: 'Detroit' }), makePost({ id: 'post-3', hidden: true })];
    expect(filterCommunityPosts(posts, 'Boston', 'All topics', false).map(post => post.id)).toEqual(['post-1']);
    expect(filterCommunityPosts(posts, 'Boston', 'All topics', true).map(post => post.id)).toEqual(['post-1', 'post-3']);
  });

  it('creates a post through the API with its region and optional report reference', async () => {
    const api = apiStub();
    await submitCommunityPost(api, 'Boston', { topic: 'Report discussion', title: '  Lights out  ', body: '  Please repair them. ', reportId: ' FS-2048 ' });
    expect(api.createPost).toHaveBeenCalledWith({ region: 'Boston', topic: 'Report discussion', title: 'Lights out', body: 'Please repair them.', reportId: 'FS-2048' });
  });

  it('submits comments through the API after trimming the body', async () => {
    const api = apiStub();
    await submitCommunityComment(api, 'post-1', '  I agree.  ');
    expect(api.addComment).toHaveBeenCalledWith('post-1', 'I agree.');
  });

  it('flags both posts and comments through the API', async () => {
    const api = apiStub();
    await flagCommunityContent(api, { kind: 'post', id: 'post-1' });
    await flagCommunityContent(api, { kind: 'comment', id: 'comment-1' });
    expect(api.flagContent).toHaveBeenNthCalledWith(1, { kind: 'post', id: 'post-1' });
    expect(api.flagContent).toHaveBeenNthCalledWith(2, { kind: 'comment', id: 'comment-1' });
  });

  it('allows only moderator and city admin sessions to use moderation actions', async () => {
    const api = apiStub();
    expect(canModerateCommunity(signedIn('resident'))).toBe(false);
    expect(canModerateCommunity(signedIn('moderator'))).toBe(true);
    expect(canModerateCommunity(signedIn('city_admin'))).toBe(true);
    await expect(moderateCommunityContent(api, signedIn('resident'), 'flag-1', 'hide')).rejects.toThrow('Moderator access required.');
    await moderateCommunityContent(api, signedIn('moderator'), 'flag-1', 'hide');
    await moderateCommunityContent(api, signedIn('city_admin'), 'flag-1', 'restore');
    await moderateCommunityContent(api, signedIn('moderator'), 'flag-1', 'dismiss');
    expect(api.reviewFlag).toHaveBeenNthCalledWith(1, 'flag-1', 'hide');
    expect(api.reviewFlag).toHaveBeenNthCalledWith(2, 'flag-1', 'restore');
    expect(api.reviewFlag).toHaveBeenNthCalledWith(3, 'flag-1', 'dismiss');
  });

  it('renders the moderation queue only for moderator/admin sessions', () => {
    const api = apiStub();
    const residentHtml = renderToStaticMarkup(createElement(ForumPage, { api, session: signedIn('resident'), region: 'Boston' }));
    const moderatorHtml = renderToStaticMarkup(createElement(ForumPage, { api, session: signedIn('moderator'), region: 'Boston' }));
    expect(residentHtml).not.toContain('Moderation queue');
    expect(moderatorHtml).toContain('Moderation queue');
  });
});
