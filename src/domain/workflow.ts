import type { PublicReport, Report, TicketStatus } from './types';

const next: Record<TicketStatus, TicketStatus[]> = {
  new: ['in_progress'], in_progress: ['resolved'], resolved: [],
};

export function publicReport(report: Report): PublicReport | null {
  if (report.hiddenFromMap) return null;
  const { reporterId: _private, ...safe } = report;
  return safe;
}

export function canTransition(from: TicketStatus, to: TicketStatus) {
  return next[from].includes(to);
}

export function transitionReport(report: Report, status: TicketStatus, note?: string, actor = 'City admin'): Report {
  if (!canTransition(report.status, status)) throw new Error(`Cannot move ticket from ${report.status} to ${status}.`);
  if (status === 'resolved' && !note?.trim()) throw new Error('A public resolution note is required.');
  const at = new Date().toISOString();
  return { ...report, status, updatedAt: at, timeline: [...report.timeline, { status, at, ...(note?.trim() ? { note: note.trim() } : {}), actor }] };
}

export function isBostonReport(report: Pick<Report, 'region'>) {
  return report.region.trim().toLowerCase().startsWith('boston');
}

export function assignTeam(report: Report, teamId: string | null): Report {
  return { ...report, assignedTeamId: teamId, updatedAt: new Date().toISOString() };
}

export function hideReport(report: Report, reason: string): Report {
  if (!reason.trim()) throw new Error('A reason is required to hide a report.');
  return { ...report, hiddenFromMap: true, hideReason: reason.trim(), updatedAt: new Date().toISOString() };
}
