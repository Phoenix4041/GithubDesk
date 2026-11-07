import { memo } from "react";
import { GRAPH_COLOR_COUNT } from "../graph-model";
import type { GraphRow, GraphSegment } from "../graph-model";

export const GRAPH_LANE_WIDTH = 14;
export const GRAPH_MAX_LANES = 10;
const NODE_RADIUS = 4;

function laneX(lane: number): number {
  return lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2;
}

function colorOf(index: number): string {
  return `var(--graph-${index % GRAPH_COLOR_COUNT})`;
}

function curve(fromX: number, fromY: number, toX: number, toY: number): string {
  if (fromX === toX) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }
  const middle = fromY + (toY - fromY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${middle}, ${toX} ${middle}, ${toX} ${toY}`;
}

function pathFor(segment: GraphSegment, nodeLane: number, height: number): string {
  const middle = height / 2;
  switch (segment.part) {
    case "full":
      return curve(laneX(segment.lane), 0, laneX(segment.lane), height);
    case "top":
      return curve(laneX(segment.fromLane), 0, laneX(nodeLane), middle);
    case "bottom":
      return curve(laneX(nodeLane), middle, laneX(segment.toLane), height);
  }
}

interface GraphCellProps {
  row: GraphRow;
  width: number;
  height: number;
}

export const GraphCell = memo(function GraphCell({ row, width, height }: GraphCellProps) {
  return (
    <svg width={width} height={height} className="shrink-0 overflow-hidden" aria-hidden="true">
      {row.segments.map((segment, index) => (
        <path
          key={index}
          d={pathFor(segment, row.nodeLane, height)}
          stroke={colorOf(segment.color)}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      <circle
        cx={laneX(row.nodeLane)}
        cy={height / 2}
        r={NODE_RADIUS}
        fill={colorOf(row.nodeColor)}
        stroke="var(--surface)"
        strokeWidth={1.5}
      />
    </svg>
  );
});
