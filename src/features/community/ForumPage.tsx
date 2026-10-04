import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Flag, MessageCircle, Plus, Send, Shield, X } from 'lucide-react';
import type { AuthState, CommunityComment, CommunityDataApi, CommunityPost, ModerationFlag } from '../../platform/contracts';
import './community.css';

export const COMMUNITY_TOPICS = [
  'All topics',
  'Report discussion',
  'Electricity & utilities',
  'Housing',
  'Cost of living',
  'Transit',
  'Safety',
  'Public services',
] as const;

type ForumTopic = (typeof COMMUNITY_TOPICS)[number];
type PostDraft = { topic: Exclude<ForumTopic, 'All topics'>; title: string; body: string; reportId: string };
type ReviewAction = 'hide' | 'restore' | 'dismiss';

export type ForumPageProps = { api: CommunityDataApi; session: AuthState; region: string };

export function canModerateCommunity(session: AuthState): boolean {
  return (session.status === 'signed_in' || session.status === 'demo')
    && (session.user?.role === 'moderator' || session.user?.role === 'city_admin');
}

export function filterCommunityPosts(posts: CommunityPost[], region: string, topic: string, includeHidden: boolean): CommunityPost[] {
  return posts.filter(post => post.region === region
    && (topic === 'All topics' || post.topic === topic)
    && (includeHidden || !post.hidden));
}

export async function submitCommunityPost(api: CommunityDataApi, region: string, draft: PostDraft): Promise<CommunityPost> {
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!title || !body) throw new Error('Add a title and message before posting.');
  const reportId = draft.reportId.trim();
  return api.createPost({ region, topic: draft.topic, title, body, ...(reportId ? { reportId } : {}) });
}

export async function submitCommunityComment(api: CommunityDataApi, postId: string, body: string): Promise<CommunityComment> {
  const trimmedBody = body.trim();
  if (!trimmedBody) throw new Error('Add a message before replying.');
  return api.addComment(postId, trimmedBody);
}

export async function flagCommunityContent(api: CommunityDataApi, target: { kind: 'post' | 'comment'; id: string }): Promise<void> {
  await api.flagContent(target);
}

export async function moderateCommunityContent(
  api: CommunityDataApi,
  session: AuthState,
  flagId: string,
  action: ReviewAction,
): Promise<void> {
  if (!canModerateCommunity(session)) throw new Error('Moderator access required.');
  await api.reviewFlag(flagId, action);
}

const emptyDraft = (): PostDraft => ({ topic: 'Cost of living', title: '', body: '', reportId: '' });

export function ForumPage({ api, session, region }: ForumPageProps) {
  const moderator = canModerateCommunity(session);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [moderationFlags, setModerationFlags] = useState<ModerationFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [topic, setTopic] = useState<string>('All topics');
  const [showComposer, setShowComposer] = useState(false);
  const [draft, setDraft] = useState<PostDraft>(emptyDraft);
  const [commenting, setCommenting] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [showModeration, setShowModeration] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextPosts, nextFlags] = await Promise.all([
        api.listPosts(region),
        moderator ? api.listModerationFlags(region) : Promise.resolve([]),
      ]);
      setPosts(nextPosts);
      setModerationFlags(nextFlags);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load neighborhood discussions.');
    } finally {
      setLoading(false);
    }
  }, [api, moderator, region]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [nextPosts, nextFlags] = await Promise.all([
          api.listPosts(region),
          moderator ? api.listModerationFlags(region) : Promise.resolve([]),
        ]);
        if (active) {
          setPosts(nextPosts);
          setModerationFlags(nextFlags);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load neighborhood discussions.');
      } finally {
        if (active) setLoading(false);
      }
    };
    const unsubscribe = api.subscribeCommunity(region, nextPosts => {
      if (active) setPosts(nextPosts);
    });
    void load();
    return () => { active = false; unsubscribe(); };
  }, [api, moderator, region]);

  const visiblePosts = useMemo(
    () => filterCommunityPosts(posts, region, topic, moderator && showModeration),
    [moderator, posts, region, showModeration, topic],
  );

  const refreshModerationFlags = async () => {
    if (moderator) setModerationFlags(await api.listModerationFlags(region));
  };

  const postDiscussion = async () => {
    setBusy(true);
    setError('');
    try {
      const created = await submitCommunityPost(api, region, draft);
      setPosts(current => [created, ...current.filter(post => post.id !== created.id)]);
      setDraft(emptyDraft());
      setShowComposer(false);
      setNotice('Your discussion is live.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post this discussion.');
    } finally {
      setBusy(false);
    }
  };

  const postComment = async (postId: string) => {
    setBusy(true);
    setError('');
    try {
      const comment = await submitCommunityComment(api, postId, commentDraft);
      setPosts(current => current.map(post => post.id === postId ? { ...post, comments: [...post.comments, comment] } : post));
      setCommentDraft('');
      setCommenting(null);
      setNotice('Reply posted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post your reply.');
    } finally {
      setBusy(false);
    }
  };

  const flagContent = async (target: { kind: 'post' | 'comment'; id: string }) => {
    setError('');
    try {
      await flagCommunityContent(api, target);
      await refreshModerationFlags();
      setNotice('Flag sent to moderators for review.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not flag this content.');
    }
  };

  const reviewFlag = async (flag: ModerationFlag, action: ReviewAction) => {
    setError('');
    try {
      await moderateCommunityContent(api, session, flag.id, action);
      await Promise.all([refresh(), refreshModerationFlags()]);
      setNotice(action === 'hide' ? 'Content hidden from the forum.' : action === 'restore' ? 'Content restored.' : 'Flag dismissed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this moderation flag.');
    }
  };

  const activeCount = posts.filter(post => post.region === region && !post.hidden).length;

  return <main className="subpage forum-page">
    <header className="page-heading">
      <div>
        <div className="eyebrow">NEIGHBORHOOD VOICES <span className="eyebrow-divider">/</span> {region.toUpperCase()}</div>
        <h1>Better, together.</h1>
        <p>Talk about the changes that make our neighborhoods work.</p>
      </div>
      <button className="primary-button" onClick={() => setShowComposer(true)}><Plus size={16}/> Start a discussion</button>
    </header>

    <section className="forum-banner" aria-label="Neighborhood forum overview">
      <div className="forum-banner-icon"><MessageCircle size={20}/></div>
      <div><strong>Local conversations lead to local change.</strong><p>Share what you’re seeing, ask questions, and find common ground with neighbors.</p></div>
      <span className="banner-count">{activeCount}<small>active topics</small></span>
    </section>

    <div className="forum-toolbar">
      <div className="filter-tabs topic-tabs" aria-label="Filter by topic">
        {COMMUNITY_TOPICS.map(item => <button key={item} className={topic === item ? 'selected' : ''} aria-pressed={topic === item} onClick={() => setTopic(item)}>{item}</button>)}
      </div>
      {moderator && <button className={`secondary-button ${showModeration ? 'selected-filter' : ''}`} aria-pressed={showModeration} onClick={() => setShowModeration(value => !value)}><Shield size={14}/>{showModeration ? 'Hide moderation queue' : 'Moderation queue'} <span className="flag-count">{moderationFlags.length}</span></button>}
    </div>

    {error && <div className="forum-error" role="alert"><span>{error}</span><button className="secondary-button" onClick={() => void refresh()}>Try again</button></div>}
    {notice && <div className="forum-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14}/></button></div>}

    {moderator && showModeration && <section className="moderation-queue" aria-label="Moderation queue">
      <h2><Shield size={16}/> Moderation queue <span>{moderationFlags.length}</span></h2>
      {moderationFlags.length === 0 ? <p className="forum-empty">No content is waiting for review.</p> : moderationFlags.map(flag => <article className="moderation-flag" key={flag.id}>
        <div><strong>{flag.target.kind === 'post' ? 'Post' : 'Comment'} flagged</strong><p>{flag.contentPreview}</p><small>{flag.reason || 'No reason provided'} · {new Date(flag.createdAt).toLocaleDateString()}</small></div>
        <div className="moderation-actions">
          <button onClick={() => void reviewFlag(flag, 'hide')}>Hide</button>
          <button onClick={() => void reviewFlag(flag, 'restore')}>Restore</button>
          <button onClick={() => void reviewFlag(flag, 'dismiss')}>Dismiss</button>
        </div>
      </article>)}
    </section>}

    <section className="forum-feed" aria-label="Neighborhood discussions" aria-busy={loading}>
      {loading ? <p className="forum-empty">Loading neighborhood discussions…</p>
        : visiblePosts.length === 0 ? <p className="forum-empty">No conversations here yet. Start one with your neighbors.</p>
          : visiblePosts.map(post => <article key={post.id} className={`forum-post ${post.hidden ? 'hidden-post' : ''}`}>
            <div className="post-vote"><button aria-label="Support this discussion"><ArrowUpRight size={15}/></button><strong>{Math.max(1, post.comments.length + 2)}</strong><small>support</small></div>
            <div className="post-content">
              <div className="post-topic">{post.topic} <span>·</span> {post.region}</div>
              <h2>{post.title}</h2>
              <p>{post.body}</p>
              {post.reportId && <a className="report-reference" href={`#report-${encodeURIComponent(post.reportId)}`}>Discussing report {post.reportId}</a>}
              <div className="post-meta"><div className="mini-avatar" aria-hidden="true">{post.author.slice(0, 1)}</div><span>{post.author}</span><span>·</span><time dateTime={post.at}>{new Date(post.at).toLocaleDateString()}</time>
                <button onClick={() => { setCommenting(commenting === post.id ? null : post.id); setCommentDraft(''); }}><MessageCircle size={14}/>{post.comments.length} replies</button>
                <button onClick={() => void flagContent({ kind: 'post', id: post.id })}><Flag size={13}/>Flag</button>
              </div>
              {commenting === post.id && <div className="comment-box"><input value={commentDraft} onChange={event => setCommentDraft(event.target.value)} placeholder="Add a thoughtful reply…" aria-label="Your reply"/><button className="primary-button" disabled={busy} onClick={() => void postComment(post.id)}>Reply <Send size={13}/></button></div>}
              {post.comments.filter(comment => !comment.hidden || (moderator && showModeration)).map(comment => <div className={`comment-item ${comment.hidden ? 'hidden-comment' : ''}`} key={comment.id}>
                <div className="mini-avatar" aria-hidden="true">{comment.author.slice(0, 1)}</div><div><strong>{comment.author}</strong><time dateTime={comment.at}>{new Date(comment.at).toLocaleDateString()}</time><p>{comment.body}</p><button className="comment-flag" onClick={() => void flagContent({ kind: 'comment', id: comment.id })}><Flag size={12}/> Flag reply</button></div>
              </div>)}
            </div>
          </article>)}
    </section>

    {showComposer && <div className="modal-backdrop"><section className="small-modal compose-modal" role="dialog" aria-modal="true" aria-labelledby="compose-heading">
      <button className="modal-close" aria-label="Close composer" onClick={() => setShowComposer(false)}><X size={16}/></button>
      <div className="eyebrow">NEIGHBORHOOD FORUM</div><h2 id="compose-heading">Start a discussion</h2><p>Share a question or an idea with your neighbors.</p>
      <label className="field-label">Topic<select value={draft.topic} onChange={event => setDraft(value => ({ ...value, topic: event.target.value as PostDraft['topic'] }))}>{COMMUNITY_TOPICS.slice(1).map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="field-label">Title<input value={draft.title} maxLength={120} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} placeholder="What’s on your mind?"/></label>
      <label className="field-label">Your message<textarea value={draft.body} maxLength={3000} onChange={event => setDraft(value => ({ ...value, body: event.target.value }))} placeholder="Add context and invite neighbors to share their perspective…"/></label>
      <label className="field-label">Optional report reference<input value={draft.reportId} maxLength={80} onChange={event => setDraft(value => ({ ...value, reportId: event.target.value }))} placeholder="For example, FS-2048"/></label>
      <div className="modal-actions"><button className="secondary-button" onClick={() => setShowComposer(false)}>Cancel</button><button className="primary-button" disabled={busy} onClick={() => void postDiscussion()}>Post discussion <Send size={13}/></button></div>
    </section></div>}
  </main>;
}
