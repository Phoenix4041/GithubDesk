import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CheckRun } from "../../types";
import { ChecksBadge } from "./checks-badge";

function run(status: string, conclusion: string | null): CheckRun {
  return { id: Math.random(), name: "job", status, conclusion, htmlUrl: null, completedAt: null };
}

describe("ChecksBadge", () => {
  it("renders nothing when there are no checks", () => {
    const { container } = render(<ChecksBadge runs={[]} />);
    expect(container.textContent).toBe("");
  });

  it("says how many checks passed", () => {
    const { container } = render(
      <ChecksBadge runs={[run("completed", "success"), run("completed", "success"), run("completed", "skipped")]} />,
    );
    expect(container.textContent).toBe("3 de 3 comprobaciones pasaron");
  });

  it("says how many failed as soon as one does", () => {
    const { container } = render(<ChecksBadge runs={[run("completed", "success"), run("completed", "failure")]} />);
    expect(container.textContent).toBe("1 de 2 comprobaciones fallaron");
  });

  it("reports that checks are still running while any is pending", () => {
    const { container } = render(<ChecksBadge runs={[run("completed", "success"), run("in_progress", null)]} />);
    expect(container.textContent).toBe("Comprobaciones en curso");
  });
});
