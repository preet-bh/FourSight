import { describe, expect, it, vi } from 'vitest';
import { createSupabaseDataApis, mapPublicReport, mapStaffReport, mapCommunityPost, throwOnBackendError } from './data';
import type { SupabaseClient } from '@supabase/supabase-js';

const reportRow = {
  id: 'db-uuid', public_id: 'FS-2048', reporter_display_name: 'Jordan R.',
  title: 'Broken signal', description: 'Signal is dark.', category: 'Street & sidewalk',
  status: 'in_progress', region: 'Boston', latitude: 42.35, longitude: -71.06,
  created_at: '2026-09-29T15:20:00.000Z', updated_at: '2026-10-02T09:10:00.000Z',
  assigned_team_id: 'team-1', hidden_from_map: false, hide_reason: null,
  owner_id: 'private-account-uuid', confirmed_transcript: 'Turn left.',
  report_delivery: [{ state: 'submitted', external_reference: '311-1', message: 'Sent' }],
  report_media: [{ id: 'media-1', storage_path: 'owner/db-uuid/photo.png', kind: 'image', label: 'Corner', selected_frame_seconds: null }],
  report_events: [{ status: 'new', note: null, created_at: '2026-09-29T15:20:00.000Z', profiles: { display_name: 'Resident' } }],
};

describe('Supabase row mapping', () => {
  it('maps public report labels separately from database UUIDs and strips private fields', () => {
    const report = mapPublicReport(reportRow, []);
    expect(report.id).toBe('FS-2048');
    expect(report.databaseId).toBe('db-uuid');
    expect(report.reporterName).toBe('Jordan R.');
    expect(report.timeline[0]?.actor).toBe('Resident');
    expect(report).not.toHaveProperty('reporterId');
    expect(report).not.toHaveProperty('hideReason');
    expect(report).not.toHaveProperty('owner_id');
    expect(report.transcript).toBe('Turn left.');
  });

  it('maps the staff projection with hide reason while keeping account identifiers private', () => {
    const report = mapStaffReport({ ...reportRow, hidden_from_map: true, hide_reason: 'Contains personal information' }, []);
    expect(report.databaseId).toBe('db-uuid');
    expect(report.hideReason).toBe('Contains personal information');
    expect(report).not.toHaveProperty('reporterId');
    expect(report).not.toHaveProperty('owner_id');
  });

  it('omits hidden comments from the public forum projection', () => {
    const row = {
      id: 'post-1', title: 'Update', body: 'Hello', topic: 'Street safety', region: 'Boston',
      created_at: '2026-10-02T14:30:00.000Z', profiles: { display_name: 'Jordan R.' },
      report_public_id: 'FS-2048', hidden: false,
      forum_comments: [
        { id: 'comment-1', body: 'Visible', created_at: '2026-10-02T15:00:00.000Z', hidden: false, profiles: { display_name: 'Maya L.' } },
        { id: 'comment-2', body: 'Staff hidden', created_at: '2026-10-02T15:10:00.000Z', hidden: true, profiles: { display_name: 'Lee A.' } },
      ],
      forum_flags: [{ id: 'flag-1', action: 'pending' }],
    };
    const post = mapCommunityPost(row);
    expect(post.reportId).toBe('FS-2048');
    expect(post.author).toBe('Jordan R.');
    expect(post.comments).toHaveLength(1);
    expect(post.comments[0]).toMatchObject({ body: 'Visible', hidden: false });
    expect(post.flags).toBe(1);
    expect(post).not.toHaveProperty('forum_flags');
    const moderatorPost = mapCommunityPost(row, true);
    expect(moderatorPost.comments[1]).toMatchObject({ body: 'Staff hidden', hidden: true });
  });

  it('surfaces Supabase query errors instead of treating them as empty data', () => {
    expect(() => throwOnBackendError({ message: 'denied', code: '42501' })).toThrow('denied');
    expect(() => throwOnBackendError(null)).not.toThrow();
  });

  it('keeps hidden flags in the active moderation query for later restoration', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;
    const { community } = createSupabaseDataApis(client);
    await community.listModerationFlags('Boston');
    expect(query.in).toHaveBeenCalledWith('action', ['pending', 'hidden']);
  });

  it('routes moderation hide, restore, and dismiss through the guarded database RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const { community } = createSupabaseDataApis(client);
    await community.reviewFlag('flag-1', 'hide');
    await community.reviewFlag('flag-1', 'restore');
    await community.reviewFlag('flag-1', 'dismiss');
    expect(rpc).toHaveBeenNthCalledWith(1, 'review_forum_flag', { p_flag_id: 'flag-1', p_action: 'hide' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'review_forum_flag', { p_flag_id: 'flag-1', p_action: 'restore' });
    expect(rpc).toHaveBeenNthCalledWith(3, 'review_forum_flag', { p_flag_id: 'flag-1', p_action: 'dismiss' });
  });
});
