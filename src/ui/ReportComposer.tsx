import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Shield, X } from 'lucide-react';
import type { NewReportInput } from '../platform/contracts';
import MediaEvidenceEditor, { emptyDraft, type MediaEvidenceDraft } from '../features/media/MediaEvidenceEditor';
import { toReportEvidence } from './report-evidence';
import ReportLocationPicker from './ReportLocationPicker';
import { CAMPUS_MAP_CONFIG } from './campus-config';
import { isWithinRadius } from './campus-location';

type Coordinates = [number, number];
type LocationStatus = 'checking' | 'inside' | 'outside' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'poorAccuracy';

const locationMessages: Record<LocationStatus, string> = {
  checking: 'Checking your location…',
  inside: 'Your location is within the UM-Dearborn reporting area.',
  outside: 'You must be on or near the UM-Dearborn campus to report an issue.',
  denied: 'Location access was denied. Enable location access for this site in your browser settings and turn on device location services, then retry.',
  unavailable: 'Your location is unavailable. Enable location access for this site in your browser settings and turn on device location services, then retry.',
  timeout: 'The location request timed out. Enable location access for this site and check device location services, then retry.',
  unsupported: 'This browser does not support geolocation. Use a browser with location access to report an issue.',
  poorAccuracy: 'Your location accuracy is over 100 m. Move to a place with a clearer GPS signal and retry.',
};

export default function ReportComposer({ region, onClose, onSubmit, setNotice }: {
  region: string;
  onClose: () => void;
  onSubmit: (input: NewReportInput) => Promise<void>;
  setNotice: (message: string) => void;
}) {
  const [evidence, setEvidence] = useState<MediaEvidenceDraft>(emptyDraft);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Street & sidewalk');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('checking');
  const [reporterLocation, setReporterLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const locationRequest = useRef(0);

  const requestLocation = useCallback(() => {
    const requestId = ++locationRequest.current;
    setReporterLocation(null);
    setLocationStatus('checking');
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      if (requestId !== locationRequest.current) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        setLocationStatus('unavailable');
        return;
      }
      setReporterLocation({ lat: latitude, lng: longitude, accuracy });
      if (!Number.isFinite(accuracy) || accuracy <= 0
        || accuracy > CAMPUS_MAP_CONFIG.maxLocationAccuracyMeters) {
        setLocationStatus('poorAccuracy');
        return;
      }
      setLocationStatus(isWithinRadius(
        [latitude, longitude],
        CAMPUS_MAP_CONFIG.center,
        CAMPUS_MAP_CONFIG.allowedRadiusMeters,
      ) ? 'inside' : 'outside');
    }, error => {
      if (requestId !== locationRequest.current) return;
      setLocationStatus(error.code === error.PERMISSION_DENIED
        ? 'denied'
        : error.code === error.TIMEOUT ? 'timeout' : 'unavailable');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  const submit = async () => {
    if (locationStatus !== 'inside' || !reporterLocation) {
      setNotice(locationMessages[locationStatus]);
      return;
    }
    if (!evidence.mediaFile) { setNotice('Attach a photo or short video before submitting.'); return; }
    if (evidence.mediaKind === 'video' && evidence.transcriptDraft.trim() && !evidence.transcriptConfirmed) {
      setNotice('Review and confirm the transcript before submitting.'); return;
    }
    const reportEvidence = toReportEvidence(evidence);
    if (!reportEvidence) { setNotice('Add a description before submitting.'); return; }
    if (!coordinates) { setNotice('Place the pin on the issue location before submitting.'); return; }
    if (!consent) { setNotice('Please confirm the public location and media disclosure.'); return; }

    setBusy(true);
    try {
      const cleanTitle = title.trim() || reportEvidence.description.split(/[.!?\n]/)[0].slice(0, 72) || 'Community report';
      await onSubmit({
        title: cleanTitle,
        ...reportEvidence,
        category,
        region,
        location: { lat: coordinates[0], lng: coordinates[1] },
        reporterLocation,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save report.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-backdrop"><div className="report-modal">
    <div className="modal-header">
      <div><div className="eyebrow">COMMUNITY SIGNAL <span className="eyebrow-divider">/</span> {region.toUpperCase()}</div><h2>Report an issue</h2><p>Help your city see what needs attention.</p></div>
      <button className="icon-button" aria-label="Close report form" onClick={onClose}><X size={17}/></button>
    </div>
    <div className="steps">
      <div className="step active"><i>1</i><span>Capture</span></div><span className="step-line"/>
      <div className={`step ${evidence.mediaFile ? 'active' : ''}`}><i>2</i><span>Describe</span></div><span className="step-line"/>
      <div className={`step ${coordinates ? 'active' : ''}`}><i>3</i><span>Location</span></div>
    </div>
    <div className="report-form">
      <div className="evidence-editor"><MediaEvidenceEditor onChange={setEvidence} disabled={busy}/></div>
      <label className="field-label">Issue title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Large pothole at the intersection" maxLength={100}/></label>
      <label className="field-label">Category<select value={category} onChange={event => setCategory(event.target.value)}>{['Street & sidewalk', 'Trash & sanitation', 'Lighting', 'Parks', 'Water & drainage', 'Public safety', 'Other'].map(value => <option key={value}>{value}</option>)}</select></label>
      <div className="field-label"><strong>Where is the issue?</strong><ReportLocationPicker selected={coordinates} onChange={setCoordinates} userLocation={reporterLocation}/></div>
      <p className="report-location-legend">Teal circle: reporting area. Purple dot: your location.</p>
      <div className={`report-location-status ${locationStatus === 'inside' ? 'location-verified' : ''}`}>
        <span role="status" aria-live="polite">{locationMessages[locationStatus]}</span>
        <button type="button" className="secondary-button" onClick={requestLocation} disabled={busy || locationStatus === 'checking'}>
          {locationStatus === 'checking' ? 'Checking location…' : 'Retry location'}
        </button>
      </div>
      <div className="disclosure"><Shield size={16}/><span><strong>Public by design.</strong> Your report, issue location and media will be public on the map. Your email and account identity stay private.</span></div>
      <label className="checkbox-row disclosure-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/> I understand my report and attached media are public</label>
    </div>
    <div className="modal-footer"><span className="anonymous-note"><Shield size={14}/> Shared anonymously</span><div><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || locationStatus !== 'inside'} onClick={() => void submit()}>{busy ? 'Saving…' : 'Submit report'} <Send size={14}/></button></div></div>
  </div></div>;
}
