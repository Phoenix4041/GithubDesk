import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentButton } from "./comment-button";

describe("CommentButton", () => {
  it("is reachable by its label and calls back when pressed", () => {
    const onClick = vi.fn();
    render(<CommentButton count={0} label="Comentar esta linea" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Comentar esta linea" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stays hidden until the row is hovered or focused when there are no comments", () => {
    render(<CommentButton count={0} label="Comentar" onClick={() => undefined} />);
    const button = screen.getByRole("button", { name: "Comentar" });
    expect(button.className).toContain("opacity-0");
    expect(button.className).toContain("focus-visible:opacity-100");
  });

  it("shows the number of comments and is always visible once there are some", () => {
    render(<CommentButton count={3} label="Ver 3 comentarios" onClick={() => undefined} />);
    const button = screen.getByRole("button", { name: "Ver 3 comentarios" });
    expect(button.textContent).toBe("3");
    expect(button.className).not.toContain("opacity-0");
  });
});
