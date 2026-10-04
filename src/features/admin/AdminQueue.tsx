import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { Report, Team, TicketStatus } from '../../domain/types';

type QueueFilter = 'all' | 'open' | 'resolved';

const statusDetails: Record<TicketStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'red' },
  in_progress: { label: 'In progress', className: 'amber' },
  resolved: { label: 'Resolved', className: 'green' },
};

export type AdminQueueProps = {
  reports: Report[];
  teams: Team[];
  onSelect: (report: Report) => void;
};

export function AdminQueue({ reports, teams, onSelect }: AdminQueueProps) {
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [query, setQuery] = useState('');
  const counts = useMemo(() => ({
    all: reports.length,
    open: reports.filter(report => report.status !== 'resolved').length,
    resolved: reports.filter(report => report.status === 'resolved').length,
  }), [reports]);
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reports.filter(report => {
      const matchesFilter = filter === 'all' || (filter === 'open'
        ? report.status !== 'resolved'
        : report.status === 'resolved');
      const matchesQuery = !normalizedQuery
        || `${report.title} ${report.id} ${report.category} ${report.region}`.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, reports]);

  return <section className="subpage" aria-label="City operations queue">
    <header className="page-heading">
      <div>
        <div className="eyebrow">CITY OPERATIONS</div>
        <h1>Operations queue</h1>
        <p>Triage community reports and keep neighbors in the loop.</p>
      </div>
      <div className="queue-summary-note"><span className="demo-indicator"/> All reports, including hidden reports</div>
    </header>
    <div className="queue-summary">
      <div><strong>{counts.all}</strong><span>Total reports</span></div>
      <div><strong>{counts.open}</strong><span>Open tickets</span></div>
      <div><strong>{counts.resolved}</strong><span>Resolved</span></div>
      <div className="queue-summary-note">Hidden reports remain in this staff queue.</div>
    </div>
    <div className="queue-card">
      <div className="queue-head">
        <div className="filter-tabs" role="group" aria-label="Filter tickets">
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All tickets <small>{counts.all}</small></button>
          <button className={filter === 'open' ? 'selected' : ''} onClick={() => setFilter('open')}>Needs attention <small>{counts.open}</small></button>
          <button className={filter === 'resolved' ? 'selected' : ''} onClick={() => setFilter('resolved')}>Resolved <small>{counts.resolved}</small></button>
        </div>
        <label className="search-field">
          <Search size={15}/>
          <input aria-label="Search tickets" placeholder="Search tickets…" value={query} onChange={event => setQuery(event.target.value)}/>
        </label>
      </div>
      <div className="ticket-table">
        <div className="ticket-row ticket-header"><span>TICKET</span><span>STATUS</span><span>CATEGORY</span><span>ASSIGNED TEAM</span><span>CREATED</span><span/></div>
        {rows.map(report => {
          const status = statusDetails[report.status];
          const assignedTeam = teams.find(team => team.id === report.assignedTeamId);
          return <button key={report.id} className="ticket-row" onClick={() => onSelect(report)}>
            <span className="ticket-title">
              <i className={`table-indicator ${status.className}`}/>
              <span><strong>{report.title}</strong><small>{report.id} · {report.hiddenFromMap ? 'Hidden from map' : report.region}</small></span>
            </span>
            <span><span className={`status-pill ${status.className}`}><i/>{status.label}</span></span>
            <span className="muted-table">{report.category}</span>
            <span className="muted-table">{assignedTeam?.name ?? 'Unassigned'}</span>
            <span className="muted-table">{new Date(report.createdAt).toLocaleDateString()}</span>
            <ChevronDown className="ticket-chevron" size={15}/>
          </button>;
        })}
        {rows.length === 0 && <div className="empty-state">No tickets match this filter.</div>}
      </div>
      <footer className="queue-foot">Showing <strong>{rows.length}</strong> tickets <span>·</span> City operations workspace</footer>
    </div>
  </section>;
}
