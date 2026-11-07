export const GRAPH_COLOR_COUNT = 8;

export interface GraphCommit {
  hash: string;
  parents: readonly string[];
}

export type GraphSegment =
  | { part: "full"; lane: number; color: number }
  | { part: "top"; fromLane: number; color: number }
  | { part: "bottom"; toLane: number; color: number };

export interface GraphRow {
  nodeLane: number;
  nodeColor: number;
  laneCount: number;
  segments: GraphSegment[];
}

export interface GraphState {
  lanes: (string | null)[];
  colors: number[];
  nextColor: number;
}

export interface GraphResult {
  rows: GraphRow[];
  state: GraphState;
}

export function emptyGraphState(): GraphState {
  return { lanes: [], colors: [], nextColor: 0 };
}

function firstFreeLane(lanes: (string | null)[]): number {
  const free = lanes.indexOf(null);
  return free === -1 ? lanes.length : free;
}

function trimTrailingEmptyLanes(state: GraphState): void {
  while (state.lanes.length > 0 && state.lanes[state.lanes.length - 1] === null) {
    state.lanes.pop();
    state.colors.pop();
  }
}

export function computeGraph(commits: readonly GraphCommit[], previous?: GraphState): GraphResult {
  const state: GraphState = previous
    ? { lanes: [...previous.lanes], colors: [...previous.colors], nextColor: previous.nextColor }
    : emptyGraphState();
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    const before = [...state.lanes];
    const beforeColors = [...state.colors];

    const matching: number[] = [];
    before.forEach((expected, lane) => {
      if (expected === commit.hash) {
        matching.push(lane);
      }
    });

    let nodeLane: number;
    let nodeColor: number;
    if (matching.length > 0) {
      nodeLane = matching[0] ?? 0;
      nodeColor = beforeColors[nodeLane] ?? 0;
    } else {
      nodeLane = firstFreeLane(state.lanes);
      nodeColor = state.nextColor % GRAPH_COLOR_COUNT;
      state.nextColor += 1;
      state.lanes[nodeLane] = commit.hash;
      state.colors[nodeLane] = nodeColor;
    }

    const segments: GraphSegment[] = [];

    before.forEach((expected, lane) => {
      if (expected === null || expected === commit.hash) {
        return;
      }
      segments.push({ part: "full", lane, color: beforeColors[lane] ?? 0 });
    });

    for (const lane of matching) {
      segments.push({ part: "top", fromLane: lane, color: beforeColors[lane] ?? 0 });
    }

    for (const lane of matching) {
      state.lanes[lane] = null;
    }

    const [firstParent, ...otherParents] = commit.parents;
    if (firstParent !== undefined) {
      const existing = state.lanes.indexOf(firstParent);
      if (existing === -1) {
        state.lanes[nodeLane] = firstParent;
        state.colors[nodeLane] = nodeColor;
        segments.push({ part: "bottom", toLane: nodeLane, color: nodeColor });
      } else {
        segments.push({ part: "bottom", toLane: existing, color: state.colors[existing] ?? nodeColor });
      }
    } else {
      state.lanes[nodeLane] = null;
    }

    for (const parent of otherParents) {
      const existing = state.lanes.indexOf(parent);
      if (existing !== -1) {
        segments.push({ part: "bottom", toLane: existing, color: state.colors[existing] ?? nodeColor });
        continue;
      }
      const lane = firstFreeLane(state.lanes);
      const color = state.nextColor % GRAPH_COLOR_COUNT;
      state.nextColor += 1;
      state.lanes[lane] = parent;
      state.colors[lane] = color;
      segments.push({ part: "bottom", toLane: lane, color });
    }

    trimTrailingEmptyLanes(state);

    const laneCount = Math.max(before.length, state.lanes.length, nodeLane + 1);
    rows.push({ nodeLane, nodeColor, laneCount, segments });
  }

  return { rows, state };
}

export function graphLaneCount(rows: readonly GraphRow[]): number {
  let widest = 1;
  for (const row of rows) {
    widest = Math.max(widest, row.laneCount);
  }
  return widest;
}
