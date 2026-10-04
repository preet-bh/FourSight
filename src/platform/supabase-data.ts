import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommunityComment, CommunityDataApi, CommunityPost, CivicDataApi, ModerationFlag, ModerationTarget, PublicReportRecord, StaffReportRecord } from './contracts';
import type { DeliveryState, ReportMedia, Team, TicketStatus } from '../domain/types';
import { supabase } from './backend';

type DbRow = Record<string, any>;
const REPORT_FIELDS = 'id,public_id,reporter_display_name,title,description,confirmed_transcript,category,region,latitude,longitude,status,assigned_team_id,created_at,updated_at';
const REPORT_PRIVATE_FIELDS = `${REPORT_FIELDS},hidden_from_map,hide_reason`;
const REPORT_MEDIA_FIELDS = 'id,report_id,storage_path,kind,label,selected_frame_seconds,created_at';
const EVENT_FIELDS = 'id,report_id,status,note,created_at';
const POST_FIELDS = 'id,region,topic,title,body,report_id,hidden,created_at,author_display_name,forum_comments(id,body,hidden,created_at,author_display_name)';

export function throwOnBackendError(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(error.message || 'The data service request failed.');
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function mapReportBase(row: DbRow, mediaRows: DbRow[] = [], eventRows: DbRow[] = []) {
  const delivery = relation<DbRow>(row.report_delivery) ?? {};
  const publicEvents = eventRows.length ? eventRows : (row.report_events ?? []);
  const publicMedia = mediaRows.length ? mediaRows : (row.report_media ?? []);
  const media: ReportMedia[] = publicMedia.map((item: DbRow) => ({
    id: String(item.id), kind: item.kind, url: item.url ?? item.storage_path ?? '',
    ...(item.label ? { label: item.label } : {}),
    ...(item.selected_frame_seconds == null ? {} : { selectedFrameSeconds: Number(item.selected_frame_seconds) }),
  }));
  const timeline = publicEvents.map((event: DbRow) => ({
    status: event.status as TicketStatus, at: event.created_at,
    ...(event.note ? { note: event.note } : {}),
    actor: event.actor_display_name || relation<DbRow>(event.profiles)?.display_name || 'Resident',
  }));
  if (!timeline.length) timeline.push({ status: row.status as TicketStatus, at: row.created_at, actor: 'Resident' });
  return {
    id: String(row.public_id), databaseId: String(row.id), reporterName: row.reporter_display_name || 'Resident',
    title: row.title, description: row.description, category: row.category, status: row.status as TicketStatus,
    delivery: {
      state: (delivery.state || 'pending') as DeliveryState,
      ...(delivery.external_reference ? { reference: delivery.external_reference } : {}),
      ...(delivery.message ? { message: delivery.message } : {}),
    },
    region: row.region, location: { lat: Number(row.latitude), lng: Number(row.longitude) },
    createdAt: row.created_at, updatedAt: row.updated_at, media,
    transcript: row.confirmed_transcript || '', assignedTeamId: row.assigned_team_id ?? null,
    hiddenFromMap: Boolean(row.hidden_from_map), hideReason: row.hide_reason ?? null, timeline,
  };
}

export function mapPublicReport(row: DbRow, mediaRows: DbRow[] = [], eventRows: DbRow[] = []): PublicReportRecord {
  const { hideReason: _hideReason, ...report } = mapReportBase(row, mediaRows, eventRows);
  return report;
}

export function mapStaffReport(row: DbRow, mediaRows: DbRow[] = [], eventRows: DbRow[] = []): StaffReportRecord {
  return mapReportBase(row, mediaRows, eventRows);
}

export function mapCommunityPost(row: DbRow, includeHiddenComments = false): CommunityPost {
  const comments: CommunityComment[] = (row.forum_comments ?? [])
    .filter((comment: DbRow) => includeHiddenComments || !comment.hidden)
    .map((comment: DbRow) => ({
      id: String(comment.id), body: comment.body, author: comment.author_display_name || relation<DbRow>(comment.profiles)?.display_name || 'Resident',
      at: comment.created_at, hidden: Boolean(comment.hidden),
    }));
  return {
    id: String(row.id), title: row.title, body: row.body, topic: row.topic, region: row.region,
    author: row.author_display_name || relation<DbRow>(row.profiles)?.display_name || 'Resident', at: row.created_at,
    comments, reportId: row.report_public_id ?? null, flags: Number(row.flag_count ?? row.forum_flags?.length ?? 0), hidden: Boolean(row.hidden),
  };
}

async function dataOrThrow<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  throwOnBackendError(error);
  if (data === null) throw new Error('The data service returned no result.');
  return data as T;
}

async function nullableDataOrThrow<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> {
  const { data, error } = await query;
  throwOnBackendError(error);
  return data;
}

async function authenticatedUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  throwOnBackendError(error);
  if (!data.user) throw new Error('Sign in to continue.');
  return data.user;
}

function displayNameForUser(user: { user_metadata?: Record<string, unknown> | null }): string {
  const metadata = user.user_metadata;
  return [metadata?.display_name, metadata?.full_name, metadata?.name]
    .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim() || 'Resident';
}

async function loadAssociations(client: SupabaseClient, rows: DbRow[]) {
  const ids = rows.map((row) => String(row.id));
  if (!ids.length) return { media: [] as DbRow[], events: [] as DbRow[], deliveries: [] as DbRow[] };
  const [media, events, deliveries] = await Promise.all([
    dataOrThrow(client.from('report_media').select(REPORT_MEDIA_FIELDS).in('report_id', ids).order('created_at')),
    dataOrThrow(client.from('report_events').select(EVENT_FIELDS).in('report_id', ids).order('created_at')),
    dataOrThrow(client.from('report_delivery').select('report_id,state,external_reference,message').in('report_id', ids)),
  ]);
  return { media, events, deliveries };
}

async function signMedia(client: SupabaseClient, rows: DbRow[]): Promise<DbRow[]> {
  return Promise.all(rows.map(async (row) => {
    const { data, error } = await client.storage.from('report-media').createSignedUrl(row.storage_path, 3600);
    throwOnBackendError(error);
    return { ...row, url: data?.signedUrl ?? '' };
  }));
}

function rowsToPublic(rows: DbRow[], associations: Awaited<ReturnType<typeof loadAssociations>>, signedMedia: DbRow[]) {
  return rows.map((row) => mapPublicReport({
    ...row,
    report_delivery: associations.deliveries.find((delivery) => delivery.report_id === row.id),
  }, signedMedia.filter((media) => media.report_id === row.id), associations.events.filter((event) => event.report_id === row.id)));
}

function rowsToStaff(rows: DbRow[], associations: Awaited<ReturnType<typeof loadAssociations>>, signedMedia: DbRow[]) {
  return rows.map((row) => mapStaffReport({
    ...row,
    report_delivery: associations.deliveries.find((delivery) => delivery.report_id === row.id),
  }, signedMedia.filter((media) => media.report_id === row.id), associations.events.filter((event) => event.report_id === row.id)));
}

function makePublicReportSubscription(client: SupabaseClient, region: string, listener: (reports: PublicReportRecord[]) => void): () => void {
  let disposed = false;
  const refresh = async () => {
    try {
      const rows = await dataOrThrow<DbRow[]>(client.from('public_reports').select(REPORT_FIELDS).eq('region', region).order('created_at', { ascending: false }));
      const associations = await loadAssociations(client, rows);
      const signedMedia = await signMedia(client, associations.media);
      if (!disposed) listener(rowsToPublic(rows, associations, signedMedia));
    } catch { /* keep the last fetched state; the next change or explicit fetch can recover */ }
  };
  void refresh();
  const channel = client.channel(`public-reports-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports', filter: `region=eq.${region}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'report_events' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'report_media' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'report_delivery' }, refresh)
    .subscribe();
  return () => { disposed = true; void client.removeChannel(channel); };
}

async function postsForRegion(client: SupabaseClient, region: string): Promise<CommunityPost[]> {
  const rows = await dataOrThrow<DbRow[]>(client.from('forum_posts').select(POST_FIELDS).eq('region', region).order('created_at', { ascending: false }));
  const reportIds = rows.map((row: DbRow) => row.report_id).filter(Boolean);
  const reports = reportIds.length
    ? await dataOrThrow<DbRow[]>(client.from('reports').select('id,public_id').in('id', reportIds))
    : [] as DbRow[];
  const byId = new Map((reports as DbRow[]).map((report) => [report.id, report.public_id]));
  const user = await client.auth.getUser();
  const profile = user.data.user
    ? await nullableDataOrThrow<DbRow>(client.from('profiles').select('role').eq('id', user.data.user.id).maybeSingle())
    : null;
  const includeHidden = profile?.role === 'moderator' || profile?.role === 'city_admin';
  return rows.map((row: DbRow) => mapCommunityPost({ ...row, report_public_id: byId.get(row.report_id) ?? null }, includeHidden));
}

function makeCommunitySubscription(client: SupabaseClient, region: string, listener: (posts: CommunityPost[]) => void): () => void {
  let disposed = false;
  const refresh = async () => {
    try { const posts = await postsForRegion(client, region); if (!disposed) listener(posts); } catch { /* retain current state and allow the next event to retry */ }
  };
  void refresh();
  const channel = client.channel(`community-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_posts', filter: `region=eq.${region}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_comments' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_flags' }, refresh)
    .subscribe();
  return () => { disposed = true; void client.removeChannel(channel); };
}

export function createSupabaseDataApis(client: SupabaseClient): { civic: CivicDataApi; community: CommunityDataApi } {
  const civic: CivicDataApi = {
    async listReports(region) {
      const rows = await dataOrThrow(client.from('public_reports').select(REPORT_FIELDS).eq('region', region).order('created_at', { ascending: false }));
      const associations = await loadAssociations(client, rows);
      return rowsToPublic(rows, associations, await signMedia(client, associations.media));
    },
    async listStaffReports(region) {
      const rows = await dataOrThrow<DbRow[]>(client.from('reports').select(REPORT_PRIVATE_FIELDS).eq('region', region).order('created_at', { ascending: false }));
      const associations = await loadAssociations(client, rows);
      return rowsToStaff(rows, associations, await signMedia(client, associations.media));
    },
    async getReport(publicId) {
      const row = await nullableDataOrThrow<DbRow>(client.from('public_reports').select(REPORT_FIELDS).eq('public_id', publicId).maybeSingle());
      if (!row) return null;
      const associations = await loadAssociations(client, [row]);
      return rowsToPublic([row], associations, await signMedia(client, associations.media)).at(0) ?? null;
    },
    async createReport(input) {
      const user = await authenticatedUser(client);
      const reporterName = displayNameForUser(user);
      const publicId = `FS-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
      const row = await dataOrThrow<DbRow>(client.from('reports').insert({
        public_id: publicId, owner_id: user.id, reporter_display_name: reporterName,
        title: input.title, description: input.description, confirmed_transcript: input.transcript || null,
        category: input.category, region: input.region, latitude: input.location.lat, longitude: input.location.lng,
      }).select(REPORT_FIELDS).single());
      const mediaRows: DbRow[] = [];
      for (const item of input.media) {
        const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
        const path = `${user.id}/${row.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await client.storage.from('report-media').upload(path, item.file, { contentType: item.file.type, upsert: false });
        throwOnBackendError(uploadError);
        const saved = await dataOrThrow<DbRow>(client.from('report_media').insert({ report_id: row.id, storage_path: path, kind: item.kind, label: item.label ?? null, selected_frame_seconds: item.selectedFrameSeconds ?? null }).select(REPORT_MEDIA_FIELDS).single());
        mediaRows.push(saved);
      }
      const signedMedia = await signMedia(client, mediaRows);
      const associations = { media: mediaRows, events: [], deliveries: [] };
      return rowsToPublic([row], associations, signedMedia)[0];
    },
    async listTeams() {
      const rows = await dataOrThrow<DbRow[]>(client.from('maintenance_teams').select('id,name,category').order('name'));
      return rows.map((row: DbRow): Team => ({ id: row.id, name: row.name, category: row.category }));
    },
    async assignTeam(databaseId, teamId) {
      throwOnBackendError((await client.rpc('admin_assign_report_team', { p_report_id: databaseId, p_team_id: teamId })).error);
    },
    async transitionReport(databaseId, status: TicketStatus, note) {
      throwOnBackendError((await client.rpc('admin_transition_report', { p_report_id: databaseId, p_status: status, p_note: note ?? null })).error);
    },
    async setReportVisibility(databaseId, hidden, reason) {
      throwOnBackendError((await client.rpc('admin_set_report_visibility', { p_report_id: databaseId, p_hidden: hidden, p_reason: reason })).error);
    },
    subscribeReports(region, listener) { return makePublicReportSubscription(client, region, listener); },
  };

  const community: CommunityDataApi = {
    async listPosts(region) { return postsForRegion(client, region); },
    async createPost(input) {
      const user = await authenticatedUser(client);
      let reportUuid: string | null = null;
      if (input.reportId) {
        const report = await nullableDataOrThrow<DbRow>(client.from('public_reports').select('id').eq('public_id', input.reportId).maybeSingle());
        if (!report) throw new Error('The linked report is unavailable.');
        reportUuid = report.id;
      }
      const authorName = displayNameForUser(user);
      const row = await dataOrThrow<DbRow>(client.from('forum_posts').insert({ region: input.region, topic: input.topic, title: input.title, body: input.body, report_id: reportUuid, author_id: user.id, author_display_name: authorName }).select(POST_FIELDS).single());
      return mapCommunityPost({ ...row, report_public_id: input.reportId ?? null });
    },
    async addComment(postId, body) {
      const user = await authenticatedUser(client);
      const authorName = displayNameForUser(user);
      const row = await dataOrThrow<DbRow>(client.from('forum_comments').insert({ post_id: postId, author_id: user.id, body, author_display_name: authorName }).select('id,post_id,body,created_at,author_display_name').single());
      return { id: row.id, body: row.body, author: row.author_display_name || 'Resident', at: row.created_at, hidden: false };
    },
    async flagContent(target: ModerationTarget, reason) {
      const user = await authenticatedUser(client);
      throwOnBackendError((await client.from('forum_flags').insert({ [target.kind === 'post' ? 'post_id' : 'comment_id']: target.id, reporter_id: user.id, reason: reason?.trim() || null })).error);
    },
    async reviewFlag(flagId, action) {
      throwOnBackendError((await client.rpc('review_forum_flag', { p_flag_id: flagId, p_action: action })).error);
    },
    async listModerationFlags(region): Promise<ModerationFlag[]> {
      const flags = await dataOrThrow(client.from('forum_flags').select('id,post_id,comment_id,reason,created_at,forum_posts!forum_flags_post_id_fkey(region,title,body),forum_comments!forum_flags_comment_id_fkey(body,forum_posts!forum_comments_post_id_fkey(region))').in('action', ['pending', 'hidden']).order('created_at', { ascending: true }));
      return flags.flatMap((flag: DbRow): ModerationFlag[] => {
        const post = relation<DbRow>(flag.forum_posts);
        const comment = relation<DbRow>(flag.forum_comments);
        const linkedPost = relation<DbRow>(comment?.forum_posts);
        const linkedRegion = post?.region ?? linkedPost?.region;
        if (linkedRegion !== region) return [];
        return [{
          id: String(flag.id), target: flag.post_id ? { kind: 'post', id: String(flag.post_id) } : { kind: 'comment', id: String(flag.comment_id) },
          region, contentPreview: String(post ? `${post.title}: ${post.body}` : comment?.body ?? ''), reason: flag.reason ?? null, createdAt: flag.created_at,
        }];
      });
    },
    subscribeCommunity(region, listener) { return makeCommunitySubscription(client, region, listener); },
  };
  return { civic, community };
}

const apis = supabase ? createSupabaseDataApis(supabase) : null;
export const civicDataApi = apis?.civic ?? null;
export const communityDataApi = apis?.community ?? null;
