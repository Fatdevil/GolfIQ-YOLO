import React, { useMemo } from 'react';

import type { BagStats, ClubId } from '../../../shared/bag/types';
import type { XY } from '../../../shared/overlay/geom';
import {
  computeVectorOverlayGeometry,
  type VectorHoleModel,
} from '../../../shared/overlay/vector';

type VectorHoleWebProps = {
  holeModel: VectorHoleModel | null;
  teeXY: XY | null;
  targetXY: XY | null;
  bag: BagStats;
  club?: ClubId;
  showCorridor: boolean;
  showRing: boolean;
  labelsAllowed: boolean;
  size: { w: number; h: number };
};

export default function VectorHoleWeb({
  holeModel,
  teeXY,
  targetXY,
  bag,
  club,
  showCorridor,
  showRing,
  labelsAllowed,
  size,
}: VectorHoleWebProps): JSX.Element | null {
  const geometry = useMemo(
    () =>
      computeVectorOverlayGeometry({
        hole: holeModel,
        tee: teeXY,
        target: targetXY,
        bag,
        club,
        size,
      }),
    [bag, club, holeModel, size, targetXY, teeXY],
  );

  if (!geometry) {
    return null;
  }

  const { polygons, ringPath, corridorPath, ringCenter, overlay } = geometry;

  return (
    <svg
      className="vector-overlay"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="vector-overlay__surfaces">
        {polygons.fairways.map((path, index) => (
          <path key={`fairway-${index}`} d={path} className="vector-overlay__fairway" fillRule="evenodd" />
        ))}
        {polygons.greens.map((path, index) => (
          <path key={`green-${index}`} d={path} className="vector-overlay__green" fillRule="evenodd" />
        ))}
        {polygons.bunkers.map((path, index) => (
          <path key={`bunker-${index}`} d={path} className="vector-overlay__bunker" fillRule="evenodd" />
        ))}
        {polygons.waters.map((path, index) => (
          <path key={`water-${index}`} d={path} className="vector-overlay__water" fillRule="evenodd" />
        ))}
      </g>
      {showCorridor && corridorPath ? (
        <path d={corridorPath} className="vector-overlay__corridor" />
      ) : null}
      {showRing && ringPath ? <path d={ringPath} className="vector-overlay__ring" /> : null}
      {labelsAllowed && showRing ? (
        <text
          x={ringCenter.x}
          y={ringCenter.y}
          className="vector-overlay__label"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {`${Math.round(overlay.meta.p50_m)} m`}
        </text>
      ) : null}
    </svg>
  );
}
