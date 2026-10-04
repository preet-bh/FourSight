import { describe, expect, it } from 'vitest';
import { publicReport, canTransition, transitionReport, hideReport, assignTeam } from './workflow';
import type { Report } from './types';

const report: Report = {
  id: 'r1', title: 'Broken streetlight', description: 'Dark at night', category: 'Lighting',
  status: 'new', delivery: { state: 'sandbox' }, region: 'Dearborn', location: { lat: 42.3223, lng: -83.1763 },
  createdAt: '2026-10-03T12:00:00.000Z', updatedAt: '2026-10-03T12:00:00.000Z',
  media: [], transcript: '', assignedTeamId: null, reporterId: 'private-user-id',
  hiddenFromMap: false, hideReason: null, timeline: [],
};

describe('ticket workflow', () => {
  it('removes private reporter and hidden tickets from the public view', () => {
    expect(publicReport(report)).not.toHaveProperty('reporterId');
    expect(publicReport({ ...report, hiddenFromMap: true })).toBeNull();
  });

  it('requires a resolution note and enforces ordered status transitions', () => {
    expect(canTransition('new', 'in_progress')).toBe(true);
    expect(canTransition('new', 'resolved')).toBe(false);
    const active = transitionReport(report, 'in_progress');
    expect(() => transitionReport(active, 'resolved')).toThrow(/resolution note/i);
    expect(transitionReport(active, 'resolved', 'Replaced the lamp')).toMatchObject({
      status: 'resolved', timeline: [{ status: 'in_progress' }, { status: 'resolved', note: 'Replaced the lamp' }],
    });
  });

  it('keeps app status separate from city delivery state', () => {
    expect(report.status).toBe('new');
    expect(report.delivery.state).toBe('sandbox');
  });

  it('keeps hidden tickets in the staff record and requires an auditable reason', () => {
    expect(() => hideReport(report, '  ')).toThrow(/reason/i);
    const hidden = hideReport(report, 'Contains a private address');
    expect(hidden).toMatchObject({ id: 'r1', hiddenFromMap: true, hideReason: 'Contains a private address' });
    expect(publicReport(hidden)).toBeNull();
    expect(assignTeam(report, 'street').assignedTeamId).toBe('street');
  });
});
