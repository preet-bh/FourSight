export type TicketStatus = 'new' | 'in_progress' | 'resolved';
export type DeliveryState = 'pending' | 'submitted' | 'sandbox' | 'failed';
export type MediaKind = 'image' | 'video' | 'completion';
export type TicketEvent = { status: TicketStatus; at: string; note?: string; actor?: string };
export type ReportMedia = { id: string; kind: MediaKind; url: string; label?: string; selectedFrameSeconds?: number };
export type Report = {
  id: string; title: string; description: string; category: string; status: TicketStatus;
  delivery: { state: DeliveryState; reference?: string; message?: string };
  region: string; location: { lat: number; lng: number }; createdAt: string; updatedAt: string;
  media: ReportMedia[]; transcript: string; assignedTeamId: string | null; reporterId?: string;
  hiddenFromMap: boolean; hideReason: string | null; timeline: TicketEvent[];
};
export type PublicReport = Omit<Report, 'reporterId'>;
export type Team = { id: string; name: string; category: string };
export type ForumPost = { id: string; title: string; body: string; topic: string; region: string; author: string; at: string; comments: { id: string; body: string; author: string; at: string }[]; flags: number; hidden: boolean };
