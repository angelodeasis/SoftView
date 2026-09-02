import type { MediaFacts } from '../../core/media/types';
import { largeFileAdvisory } from '../../core/media/largeFileAdvisory';

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function FileFactsPanel({ facts }: { facts: MediaFacts }) {
  const advisory = largeFileAdvisory({
    sizeBytes: facts.sizeBytes,
    durationSec: facts.durationSec,
  });

  return (
    <div className="facts" role="status">
      <dl className="facts__list">
        <div>
          <dt>Name</dt>
          <dd>{facts.name}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>
            {(facts.mimeType || 'unknown') + ' '}({facts.kind})
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatSize(facts.sizeBytes)}</dd>
        </div>
        {facts.durationSec !== undefined && (
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(facts.durationSec)}</dd>
          </div>
        )}
        {facts.width !== undefined && facts.height !== undefined && (
          <div>
            <dt>Resolution</dt>
            <dd>
              {facts.width}&times;{facts.height}
            </dd>
          </div>
        )}
      </dl>

      {advisory && <p className={`advisory advisory--${advisory.level}`}>{advisory.message}</p>}
    </div>
  );
}
