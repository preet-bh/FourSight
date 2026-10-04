import type { ForumPost, Report, ReportMedia, Team, TicketStatus } from '../domain/types';

export type AuthRole = 'resident' | 'city_admin' | 'moderator';

export type AuthUser = {
  id: string;
  displayName: string;
  role: AuthRole;
};

export type AuthState = {
  status: 'loading' | 'signed_out' | 'signed_in' | 'demo';
  user: AuthUser | null;
};

/** Public map/report shape: no account identifiers, email, or staff-only hide reason. */
export type PublicReportRecord = Omit<Report, 'reporterId' | 'hideReason'> & {
  databaseId: string;
  reporterName: string;
};

/** Staff queue shape carries the private hide reason but never account email. */
export type StaffReportRecord = Omit<Report, 'reporterId'> & {
  databaseId: string;
  reporterName: string;
};

export type ReportMediaUpload = {
  file: File;
  kind: ReportMedia['kind'];
  label?: string;
  selectedFrameSeconds?: number;
};

export type NewReportInput = Pick<Report, 'title' | 'description' | 'category' | 'region' | 'location'> & {
  transcript?: string;
  media: ReportMediaUpload[];
};

export type CommunityComment = {
  id: string;
  body: string;
  author: string;
  at: string;
  hidden: boolean;
};

export type CommunityPost = Omit<ForumPost, 'comments'> & {
  reportId: string | null;
  comments: CommunityComment[];
};

export type ModerationTarget = { kind: 'post' | 'comment'; id: string };

export type ModerationFlag = {
  id: string;
  target: ModerationTarget;
  region: string;
  contentPreview: string;
  reason: string | null;
  createdAt: string;
};

export interface AuthApi {
  getState(): Promise<AuthState>;
  getEmail(): Promise<string | null>;
  subscribe(listener: (state: AuthState) => void): () => void;
  signUp(input: { displayName: string; email: string; password: string }): Promise<{ confirmationRequired: true }>;
  signIn(input: { email: string; password: string }): Promise<void>;
  updateEmail(email: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

export interface CivicDataApi {
  listReports(region: string): Promise<PublicReportRecord[]>;
  listStaffReports(region: string): Promise<StaffReportRecord[]>;
  getReport(publicId: string): Promise<PublicReportRecord | null>;
  createReport(input: NewReportInput): Promise<PublicReportRecord>;
  listTeams(): Promise<Team[]>;
  assignTeam(databaseId: string, teamId: string | null): Promise<void>;
  transitionReport(databaseId: string, status: TicketStatus, note?: string): Promise<void>;
  setReportVisibility(databaseId: string, hidden: boolean, reason: string): Promise<void>;
  subscribeReports(region: string, listener: (reports: PublicReportRecord[]) => void): () => void;
}

export interface CommunityDataApi {
  listPosts(region: string): Promise<CommunityPost[]>;
  createPost(input: { region: string; topic: string; title: string; body: string; reportId?: string }): Promise<CommunityPost>;
  addComment(postId: string, body: string): Promise<CommunityComment>;
  flagContent(target: ModerationTarget, reason?: string): Promise<void>;
  listModerationFlags(region: string): Promise<ModerationFlag[]>;
  reviewFlag(flagId: string, action: 'hide' | 'restore' | 'dismiss'): Promise<void>;
  subscribeCommunity(region: string, listener: (posts: CommunityPost[]) => void): () => void;
}
