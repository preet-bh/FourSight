import { useState } from 'react';
import { Activity, Check, Radio } from 'lucide-react';
import type { Report, Team, TicketStatus } from '../../domain/types';
import { canTransition } from '../../domain/workflow';

export type AdminTicketControlsProps = {
  report: Report;
  teams: Team[];
  onAssignTeam: (teamId: string | null) => void | Promise<void>;
  onTransition: (status: TicketStatus, publicNote: string, completionPhoto: File | null) => void | Promise<void>;
  onSetVisibility: (hidden: boolean, reason: string) => void | Promise<void>;
};

const statusDetails: Record<TicketStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'red' },
  in_progress: { label: 'In progress', className: 'amber' },
  resolved: { label: 'Resolved', className: 'green' },
};

export function PublicTicketTimeline({ report }: { report: Report }) {
  return <section className="timeline" aria-label="Public ticket timeline">
    {report.timeline.map((event, index) => {
      const status = statusDetails[event.status];
      const Icon = event.status === 'resolved' ? Check : event.status === 'in_progress' ? Activity : Radio;
      return <div className="timeline-row" key={`${event.at}-${index}`}>
        <div className={`timeline-icon ${status.className}`}><Icon size={13}/></div>
        <div>
          <strong>{event.status === 'new' ? 'Report submitted' : event.status === 'in_progress' ? 'City team is on it' : 'Issue resolved'}</strong>
          <small>{new Date(event.at).toLocaleString()} {event.actor && `· ${event.actor}`}</small>
          {event.note && <p>{event.note}</p>}
        </div>
      </div>;
    })}
  </section>;
}

export function AdminTicketControls({ report, teams, onAssignTeam, onTransition, onSetVisibility, showTimeline = true }: AdminTicketControlsProps & { showTimeline?: boolean }) {
  const [note, setNote] = useState('');
  const [completionPhoto, setCompletionPhoto] = useState<File | null>(null);
  const [visibilityIntent, setVisibilityIntent] = useState<boolean | null>(null);
  const [visibilityReason, setVisibilityReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nextStatus: TicketStatus | null = report.status === 'new' ? 'in_progress'
    : report.status === 'in_progress' ? 'resolved' : null;

  const runAction = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The ticket could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const saveVisibility = () => {
    if (visibilityIntent === null || !visibilityReason.trim()) {
      setError('An audit reason is required.');
      return;
    }
    void runAction(async () => {
      await onSetVisibility(visibilityIntent, visibilityReason.trim());
      setVisibilityReason('');
      setVisibilityIntent(null);
    });
  };

  return <section className="admin-actions" aria-label="City admin controls">
    <h3>City admin controls</h3>
    <label className="field-label">Assign maintenance team
      <select disabled={busy} value={report.assignedTeamId ?? ''} onChange={event => {
        const teamId = event.target.value || null;
        void runAction(() => onAssignTeam(teamId));
      }}>
        <option value="">Unassigned</option>
        {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
    </label>
    {report.status === 'in_progress' && <>
      <label className="field-label">Public resolution note
        <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Describe the repair that was completed…"/>
      </label>
      <label className="field-label">Optional completion photo
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0] ?? null;
          if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 50 * 1024 * 1024)) {
            setError('Choose a JPEG, PNG, or WebP image no larger than 50 MB.');
            event.target.value = '';
            setCompletionPhoto(null);
            return;
          }
          setError('');
          setCompletionPhoto(file);
        }}/>
      </label>
    </>}
    <div className="admin-buttons">
      {nextStatus && canTransition(report.status, nextStatus) && <button className="primary-button full" disabled={busy || (nextStatus === 'resolved' && !note.trim())} onClick={() => {
        void runAction(async () => {
          await onTransition(nextStatus, note.trim(), nextStatus === 'resolved' ? completionPhoto : null);
          setNote('');
          setCompletionPhoto(null);
        });
      }}>{nextStatus === 'in_progress' ? 'Start work' : 'Mark resolved'}</button>}
      {visibilityIntent === null
        ? report.hiddenFromMap
          ? <button className="secondary-button" disabled={busy} onClick={() => { setError(''); setVisibilityIntent(false); }}>Restore to map</button>
          : <button className="danger-button" disabled={busy} onClick={() => { setError(''); setVisibilityIntent(true); }}>Hide from public map</button>
        : <div className="visibility-reason">
          <label className="field-label">{visibilityIntent ? 'Reason for hiding' : 'Reason for restoring'}
            <textarea autoFocus value={visibilityReason} onChange={event => setVisibilityReason(event.target.value)} placeholder="Record the moderation reason…"/>
          </label>
          <div className="admin-buttons">
            <button className="secondary-button" disabled={busy} onClick={() => { setVisibilityIntent(null); setVisibilityReason(''); }}>Cancel</button>
            <button className={visibilityIntent ? 'danger-solid' : 'primary-button'} disabled={busy || !visibilityReason.trim()} onClick={saveVisibility}>{visibilityIntent ? 'Hide report' : 'Restore report'}</button>
          </div>
        </div>}
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {report.hiddenFromMap && report.hideReason && <p className="muted-table">Current hide reason: {report.hideReason}</p>}
    {showTimeline && <><h4>Public progress timeline</h4><PublicTicketTimeline report={report}/></>}
  </section>;
}
