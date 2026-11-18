import type { DefectKind, DefectView } from '@cs/shared/vocabulary';
import type { MouseEvent } from 'react';
import { useT } from '../i18n';

export interface Marker {
  x: number;
  y: number;
  kind: DefectKind;
}

/** The car's outline from one side, drawn with simple shapes (design A2, BodySchema). */
function Outline({ view }: { view: DefectView }) {
  switch (view) {
    case 'top':
      return (
        <g className="body__shape">
          <rect x="105" y="30" width="190" height="160" rx="62" />
          <rect x="135" y="62" width="130" height="30" rx="8" />
          <rect x="135" y="128" width="130" height="30" rx="8" />
          <rect x="150" y="96" width="100" height="28" rx="6" />
          <rect x="88" y="52" width="18" height="38" rx="5" />
          <rect x="294" y="52" width="18" height="38" rx="5" />
          <rect x="88" y="130" width="18" height="38" rx="5" />
          <rect x="294" y="130" width="18" height="38" rx="5" />
        </g>
      );
    case 'left':
    case 'right':
      return (
        <g
          className="body__shape"
          transform={view === 'right' ? 'translate(400 0) scale(-1 1)' : undefined}
        >
          <path d="M40 150 L40 122 Q40 104 66 100 L112 66 Q124 54 146 54 L254 54 Q272 54 284 68 L318 100 Q360 104 360 124 L360 150 Z" />
          <path d="M120 100 L150 68 L196 68 L196 100 Z" />
          <path d="M206 100 L206 68 L254 68 L288 100 Z" />
          <circle cx="112" cy="152" r="26" />
          <circle cx="288" cy="152" r="26" />
        </g>
      );
    case 'front':
    case 'back':
      return (
        <g className="body__shape">
          <path d="M86 150 L86 108 Q86 96 100 92 L130 58 Q136 50 150 50 L250 50 Q264 50 270 58 L300 92 Q314 96 314 108 L314 150 Z" />
          <path d="M142 90 L160 62 L240 62 L258 90 Z" />
          <rect x="94" y="112" width="42" height="18" rx="6" />
          <rect x="264" y="112" width="42" height="18" rx="6" />
          <rect x="160" y="124" width="80" height="16" rx="4" />
          <rect x="74" y="140" width="26" height="46" rx="6" />
          <rect x="300" y="140" width="26" height="46" rx="6" />
        </g>
      );
    case 'interior':
      return (
        <g className="body__shape">
          <rect x="110" y="24" width="180" height="172" rx="40" />
          <rect x="124" y="36" width="152" height="26" rx="8" />
          <circle cx="158" cy="76" r="14" />
          <rect x="130" y="96" width="56" height="52" rx="12" />
          <rect x="214" y="96" width="56" height="52" rx="12" />
          <rect x="130" y="156" width="140" height="30" rx="10" />
        </g>
      );
  }
}

/**
 * A view of the car on which defects are marked by a tap. Each mark is numbered, in the order of
 * the list below it, and coloured by the kind of defect. Read-only, it only shows them.
 */
export function BodySchema({
  view,
  markers,
  selected,
  onAdd,
  onSelect,
}: {
  view: DefectView;
  /** Every defect with its number in the whole list; only those of this view are drawn. */
  markers: readonly (Marker & { number: number; view: DefectView })[];
  selected?: number | null;
  /** Absent: the schema is read-only. */
  onAdd?: (point: { x: number; y: number }) => void;
  onSelect?: (number: number) => void;
}) {
  const t = useT();
  const place = (event: MouseEvent<SVGSVGElement>) => {
    if (!onAdd) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    onAdd({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  };
  return (
    <svg
      className={onAdd ? 'body is-editable' : 'body'}
      viewBox="0 0 400 220"
      role="img"
      aria-label={t.reception.views[view]}
      onClick={place}
    >
      <Outline view={view} />
      {markers
        .filter((marker) => marker.view === view)
        .map((marker) => (
          <g
            key={marker.number}
            className={`body__mark body__mark--${marker.kind}${selected === marker.number ? ' is-selected' : ''}`}
            transform={`translate(${marker.x * 400} ${marker.y * 220})`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(marker.number);
            }}
          >
            <circle r="13" />
            <text textAnchor="middle" dy="5">
              {marker.number}
            </text>
          </g>
        ))}
    </svg>
  );
}
