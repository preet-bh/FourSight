import type { ForumPost, Report, Team } from '../domain/types';
import { HOME_REGION } from '../ui/regions';

const STORE_KEY = 'foursight.v1';
export const teams: Team[] = [
  { id: 'street', name: 'Street & Sidewalks', category: 'Street & sidewalk' },
  { id: 'sanitation', name: 'Sanitation Services', category: 'Trash & sanitation' },
  { id: 'lighting', name: 'Electrical & Lighting', category: 'Lighting' },
  { id: 'parks', name: 'Parks & Public Space', category: 'Parks' },
  { id: 'water', name: 'Water & Drainage', category: 'Water & drainage' },
];

const seeds: Report[] = [
  { id: 'FS-2048', title: 'Crosswalk signal is out', description: 'The walk signal at the corner has been dark for three days.', category: 'Street & sidewalk', status: 'in_progress', delivery: { state: 'sandbox', message: 'Demo report — no city delivery connection' }, region: 'Dearborn', location: { lat: 42.3234, lng: -83.1781 }, createdAt: '2026-09-29T15:20:00.000Z', updatedAt: '2026-10-02T09:10:00.000Z', media: [{ id: 'seed-1', kind: 'image', url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80', label: 'Crosswalk at dusk' }], transcript: '', assignedTeamId: 'street', hiddenFromMap: false, hideReason: null, timeline: [{ status: 'new', at: '2026-09-29T15:20:00.000Z', actor: 'Resident' }, { status: 'in_progress', at: '2026-10-02T09:10:00.000Z', note: 'Signal crew scheduled to inspect this intersection.', actor: 'City admin' }] },
  { id: 'FS-2047', title: 'Overflowing public trash bin', description: 'Bin is full and litter is blowing into the park.', category: 'Trash & sanitation', status: 'new', delivery: { state: 'sandbox', message: 'Demo report — no city delivery connection' }, region: 'Dearborn', location: { lat: 42.3197, lng: -83.1712 }, createdAt: '2026-10-02T12:40:00.000Z', updatedAt: '2026-10-02T12:40:00.000Z', media: [], transcript: '', assignedTeamId: null, hiddenFromMap: false, hideReason: null, timeline: [{ status: 'new', at: '2026-10-02T12:40:00.000Z', actor: 'Resident' }] },
  { id: 'FS-2045', title: 'Streetlight repaired near Michigan Avenue', description: 'The light is back on and the sidewalk feels safer at night.', category: 'Lighting', status: 'resolved', delivery: { state: 'sandbox', message: 'Demo report — no city delivery connection' }, region: 'Dearborn', location: { lat: 42.3262, lng: -83.1833 }, createdAt: '2026-09-24T16:05:00.000Z', updatedAt: '2026-09-30T11:30:00.000Z', media: [], transcript: '', assignedTeamId: 'lighting', hiddenFromMap: false, hideReason: null, timeline: [{ status: 'new', at: '2026-09-24T16:05:00.000Z', actor: 'Resident' }, { status: 'in_progress', at: '2026-09-26T10:00:00.000Z', note: 'Assigned to electrical crew.', actor: 'City admin' }, { status: 'resolved', at: '2026-09-30T11:30:00.000Z', note: 'Replaced the lamp and verified the circuit.', actor: 'City admin' }] },
  { id: 'FS-2042', title: 'Pothole on Michigan Avenue', description: 'Deep pothole in the right lane just past the bus stop.', category: 'Street & sidewalk', status: 'new', delivery: { state: 'sandbox', message: 'Demo report — no city delivery connection' }, region: 'Dearborn', location: { lat: 42.3169, lng: -83.1767 }, createdAt: '2026-10-01T08:18:00.000Z', updatedAt: '2026-10-01T08:18:00.000Z', media: [], transcript: '', assignedTeamId: null, hiddenFromMap: false, hideReason: null, timeline: [{ status: 'new', at: '2026-10-01T08:18:00.000Z', actor: 'Resident' }] },
];

export type AppData = { reports: Report[]; posts: ForumPost[] };
const seedPosts: ForumPost[] = [
  { id: 'p1', title: 'What would fair electricity pricing look like across neighborhoods?', body: 'I’ve noticed bills can vary quite a bit between nearby towns. What changes would make the system feel more transparent and fair?', topic: 'Cost of living', region: 'Dearborn', author: 'Jordan R.', at: '2026-10-02T14:30:00.000Z', comments: [{ id: 'c1', body: 'A public breakdown of delivery charges would be a good first step.', author: 'Maya L.', at: '2026-10-02T16:10:00.000Z' }], flags: 0, hidden: false },
  { id: 'p2', title: 'Safer crossings near the school', body: 'Could we organize a walk audit and bring a list of the most difficult crossings to the next neighborhood meeting?', topic: 'Street safety', region: 'Dearborn', author: 'Lee A.', at: '2026-10-01T10:15:00.000Z', comments: [], flags: 0, hidden: false },
  { id: 'p3', title: 'How do we make public space more welcoming?', body: 'Would love to hear what’s worked in other parts of the city.', topic: 'Public spaces', region: 'Dearborn', author: 'Chris P.', at: '2026-09-30T09:00:00.000Z', comments: [], flags: 0, hidden: false },
];

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as AppData;
      const reports = saved.reports.filter(report => report.region === HOME_REGION);
      const posts = saved.posts.filter(post => post.region === HOME_REGION);
      return { reports: reports.length ? reports : seeds, posts: posts.length ? posts : seedPosts };
    }
  } catch { /* use clean demo seed */ }
  return { reports: seeds, posts: seedPosts };
}
export function saveData(data: AppData) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

export async function putLocalMedia(file: File): Promise<string> {
  const db = await mediaDb();
  const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction('media', 'readwrite').objectStore('media').put(file, id);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  return `local-media:${id}`;
}
export async function resolveLocalMedia(ref: string): Promise<string> {
  if (!ref.startsWith('local-media:')) return ref;
  const db = await mediaDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction('media').objectStore('media').get(ref.slice('local-media:'.length));
    request.onsuccess = () => resolve(request.result as Blob | undefined); request.onerror = () => reject(request.error);
  });
  return blob ? URL.createObjectURL(blob) : '';
}
function mediaDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('foursight-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('media');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}

export { createSupabaseDataApis, civicDataApi, communityDataApi, mapPublicReport, mapStaffReport, mapCommunityPost, throwOnBackendError } from './supabase-data';
