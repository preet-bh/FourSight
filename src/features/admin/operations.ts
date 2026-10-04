import type { Report, ReportMedia, TicketStatus } from '../../domain/types';
import { transitionReport } from '../../domain/workflow';
import { supabase } from '../../platform/backend';

const MAX_COMPLETION_PHOTO_BYTES = 50 * 1024 * 1024;

function requireAdminBackend() {
  if (!supabase) throw new Error('Admin ticket operations require a configured Supabase client.');
  return supabase;
}

function requireReportId(reportId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    throw new Error('Admin database operations require the report UUID, not its public ticket number.');
  }
}

export async function assignAdminTeam(reportId: string, teamId: string | null): Promise<void> {
  requireReportId(reportId);
  const { error } = await requireAdminBackend().rpc('admin_assign_report_team', {
    p_report_id: reportId,
    p_team_id: teamId,
  });
  if (error) throw error;
}

export async function transitionAdminTicket(reportId: string, status: TicketStatus, note?: string): Promise<void> {
  requireReportId(reportId);
  if (status !== 'in_progress' && status !== 'resolved') throw new Error('Tickets can only advance to In progress or Resolved.');
  if (status === 'resolved' && !note?.trim()) throw new Error('A public resolution note is required.');
  if (status === 'resolved') {
    await resolveAdminTicket(reportId, note ?? '');
    return;
  }
  const { error } = await requireAdminBackend().rpc('admin_transition_report', {
    p_report_id: reportId,
    p_status: status,
    p_note: null,
  });
  if (error) throw error;
}

export async function setAdminTicketVisibility(reportId: string, hidden: boolean, reason: string): Promise<void> {
  requireReportId(reportId);
  if (!reason.trim()) throw new Error('An audit reason is required to hide or restore a report.');
  const { error } = await requireAdminBackend().rpc('admin_set_report_visibility', {
    p_report_id: reportId,
    p_hidden: hidden,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

async function uploadCompletionPhoto(reportId: string, file: File): Promise<string> {
  requireReportId(reportId);
  const client = requireAdminBackend();
  const extensionByMimeType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extensionByMimeType[file.type];
  if (!extension || file.size > MAX_COMPLETION_PHOTO_BYTES) {
    throw new Error('Choose a JPEG, PNG, or WebP image no larger than 50 MB.');
  }

  const storagePath = `admin/${reportId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage.from('report-media').upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;
  return storagePath;
}

export async function resolveAdminTicket(reportId: string, note: string, completionPhoto?: File | null): Promise<ReportMedia | undefined> {
  requireReportId(reportId);
  if (!note.trim()) throw new Error('A public resolution note is required.');
  const client = requireAdminBackend();
  const storagePath = completionPhoto ? await uploadCompletionPhoto(reportId, completionPhoto) : null;
  let photoUrl: string | undefined;
  if (storagePath) {
    const { data: signedUrl, error: urlError } = await client.storage.from('report-media').createSignedUrl(storagePath, 60 * 60);
    if (urlError) {
      const { error: cleanupError } = await client.storage.from('report-media').remove([storagePath]);
      if (cleanupError) {
        throw new Error(`Could not create the completion photo preview (${urlError.message}); uploaded file cleanup also failed (${cleanupError.message}).`);
      }
      throw urlError;
    }
    photoUrl = signedUrl.signedUrl;
  }
  const { data: mediaId, error } = await client.rpc('admin_resolve_report', {
    p_report_id: reportId,
    p_note: note.trim(),
    p_storage_path: storagePath,
  });
  if (error) {
    if (storagePath) {
      const { error: cleanupError } = await client.storage.from('report-media').remove([storagePath]);
      if (cleanupError) {
        throw new Error(`Could not resolve the ticket (${error.message}); uploaded file cleanup also failed (${cleanupError.message}).`);
      }
    }
    throw error;
  }
  if (!storagePath) return undefined;
  if (typeof mediaId !== 'string') throw new Error('The ticket was resolved, but the database returned no completion media ID.');
  if (!photoUrl) throw new Error('The ticket was resolved with a completion photo, but its preview URL is unavailable.');
  return { id: mediaId, kind: 'completion', url: photoUrl, label: completionPhoto?.name ?? 'Completion photo' };
}

export function applyAdminStatusLocally(report: Report, status: TicketStatus, note?: string, completionPhoto?: ReportMedia): Report {
  const withPhoto = completionPhoto ? { ...report, media: [...report.media, completionPhoto] } : report;
  return transitionReport(withPhoto, status, note?.trim());
}
