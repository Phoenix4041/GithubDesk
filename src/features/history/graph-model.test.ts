import { describe, expect, it } from "vitest";
import { computeGraph, graphLaneCount } from "./graph-model";
import type { GraphCommit } from "./graph-model";

function commit(hash: string, ...parents: string[]): GraphCommit {
  return { hash, parents };
}

describe("computeGraph", () => {
  it("keeps a linear history on a single lane", () => {
    const { rows } = computeGraph([commit("c", "b"), commit("b", "a"), commit("a")]);
    expect(rows.map((row) => row.nodeLane)).toEqual([0, 0, 0]);
    expect(graphLaneCount(rows)).toBe(1);
    expect(rows[0]?.segments).toEqual([{ part: "bottom", toLane: 0, color: 0 }]);
    expect(rows[1]?.segments).toEqual([
      { part: "top", fromLane: 0, color: 0 },
      { part: "bottom", toLane: 0, color: 0 },
    ]);
    expect(rows[2]?.segments).toEqual([{ part: "top", fromLane: 0, color: 0 }]);
  });

  it("opens a second lane for a merge and closes it at the fork point", () => {
    const { rows, state } = computeGraph([
      commit("m", "a", "b"),
      commit("a", "base"),
      commit("b", "base"),
      commit("base"),
    ]);
    expect(rows[0]?.nodeLane).toBe(0);
    expect(rows[0]?.segments).toContainEqual({ part: "bottom", toLane: 1, color: 1 });
    expect(rows[1]?.nodeLane).toBe(0);
    expect(rows[2]?.nodeLane).toBe(1);
    expect(rows[2]?.segments).toContainEqual({ part: "bottom", toLane: 0, color: 0 });
    expect(rows[3]?.nodeLane).toBe(0);
    expect(rows[3]?.segments.filter((segment) => segment.part === "top")).toHaveLength(1);
    expect(state.lanes).toEqual([]);
  });

  it("places a commit that no lane expects on a new lane", () => {
    const { rows } = computeGraph([commit("tip-a", "p"), commit("tip-b", "p"), commit("p")]);
    expect(rows[0]?.nodeLane).toBe(0);
    expect(rows[1]?.nodeLane).toBe(1);
    expect(rows[2]?.nodeLane).toBe(0);
  });

  it("draws passing lanes as full segments", () => {
    const { rows } = computeGraph([commit("x", "z"), commit("y", "z"), commit("z")]);
    const second = rows[1];
    expect(second?.segments).toContainEqual({ part: "full", lane: 0, color: 0 });
  });

  it("draws an octopus merge with one lane per extra parent", () => {
    const { rows } = computeGraph([commit("o", "p1", "p2", "p3"), commit("p1"), commit("p2"), commit("p3")]);
    expect(rows[0]?.segments.filter((segment) => segment.part === "bottom")).toHaveLength(3);
    expect(rows[0]?.laneCount).toBe(3);
    expect(rows[1]?.nodeLane).toBe(0);
    expect(rows[2]?.nodeLane).toBe(1);
    expect(rows[3]?.nodeLane).toBe(2);
  });

  it("reuses a lane that already expects the parent instead of opening another", () => {
    const { rows } = computeGraph([commit("m", "a", "b"), commit("a", "b"), commit("b")]);
    expect(rows[0]?.nodeLane).toBe(0);
    expect(rows[1]?.segments).toContainEqual({ part: "bottom", toLane: 1, color: 1 });
    expect(rows[2]?.nodeLane).toBe(1);
  });

  it("gives the same rows when pages are processed one after another", () => {
    const history = [
      commit("m2", "m1", "f2"),
      commit("f2", "f1"),
      commit("m1", "base", "f1"),
      commit("f1", "base"),
      commit("base", "root"),
      commit("root"),
    ];
    const oneShot = computeGraph(history);
    const firstPage = computeGraph(history.slice(0, 3));
    const secondPage = computeGraph(history.slice(3), firstPage.state);
    expect([...firstPage.rows, ...secondPage.rows]).toEqual(oneShot.rows);
    expect(secondPage.state).toEqual(oneShot.state);
  });

  it("does not mutate the state that was passed in", () => {
    const first = computeGraph([commit("a", "b")]);
    const snapshot = JSON.stringify(first.state);
    computeGraph([commit("b")], first.state);
    expect(JSON.stringify(first.state)).toBe(snapshot);
  });

  it("returns no rows for an empty list", () => {
    expect(computeGraph([]).rows).toEqual([]);
  });
});
