import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

import type { BagStats, ClubId } from '../../../../../shared/bag/types';
import type { XY } from '../../../../../shared/overlay/geom';
import {
  computeVectorOverlayGeometry,
  type VectorHoleModel,
} from '../../../../../shared/overlay/vector';

type VectorHoleProps = {
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

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  label: {
    fontSize: 10,
  },
});

const RING_STROKE = '#38bdf8';
const RING_FILL = 'rgba(56, 189, 248, 0.08)';
const CORRIDOR_FILL = 'rgba(59, 130, 246, 0.18)';
const CORRIDOR_STROKE = 'rgba(191, 219, 254, 0.65)';
const FAIRWAY_FILL = 'rgba(34, 197, 94, 0.28)';
const GREEN_FILL = 'rgba(74, 222, 128, 0.45)';
const BUNKER_FILL = 'rgba(250, 204, 21, 0.45)';
const WATER_FILL = 'rgba(14, 165, 233, 0.35)';
const LABEL_FILL = '#bfdbfe';

export default function VectorHole({
  holeModel,
  teeXY,
  targetXY,
  bag,
  club,
  showCorridor,
  showRing,
  labelsAllowed,
  size,
}: VectorHoleProps): JSX.Element | null {
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
    <Svg
      pointerEvents="none"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      style={styles.canvas}
    >
      <G>
        {polygons.fairways.map((path, index) => (
          <Path key={`fairway-${index}`} d={path} fill={FAIRWAY_FILL} fillRule="evenodd" />
        ))}
        {polygons.greens.map((path, index) => (
          <Path key={`green-${index}`} d={path} fill={GREEN_FILL} fillRule="evenodd" />
        ))}
        {polygons.bunkers.map((path, index) => (
          <Path key={`bunker-${index}`} d={path} fill={BUNKER_FILL} fillRule="evenodd" />
        ))}
        {polygons.waters.map((path, index) => (
          <Path key={`water-${index}`} d={path} fill={WATER_FILL} fillRule="evenodd" />
        ))}
      </G>
      {showCorridor && corridorPath ? (
        <Path
          d={corridorPath}
          fill={CORRIDOR_FILL}
          stroke={CORRIDOR_STROKE}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ) : null}
      {showRing && ringPath ? (
        <Path
          d={ringPath}
          fill={RING_FILL}
          stroke={RING_STROKE}
          strokeWidth={2}
          strokeDasharray={[6, 6]}
          strokeLinejoin="round"
        />
      ) : null}
      {labelsAllowed && showRing ? (
        <SvgText
          x={ringCenter.x}
          y={ringCenter.y}
          fill={LABEL_FILL}
          textAnchor="middle"
          alignmentBaseline="middle"
          style={styles.label}
        >
          {`${Math.round(overlay.meta.p50_m)} m`}
        </SvgText>
      ) : null}
    </Svg>
  );
}
