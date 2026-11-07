import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewComment } from "../../types";
import { buildThreads } from "../review-model";
import type { ReviewThread } from "../review-model";
import { ReviewThreadDialog } from "./review-thread-dialog";

function comment(id: number, overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id,
    user: { login: id % 2 === 0 ? "me" : "hubot", avatarUrl: "", htmlUrl: "" },
    body: `texto ${id}`,
    path: "src/a.rs",
    line: 2,
    originalLine: 2,
    side: "RIGHT",
    inReplyToId: null,
    commitId: "abc1234",
    createdAt: `2026-01-0${id}T10:00:00Z`,
    htmlUrl: "",
    ...overrides,
  };
}

const threads = buildThreads([comment(1), comment(2, { inReplyToId: 1 })]);

function setup(overrides: Partial<Parameters<typeof ReviewThreadDialog>[0]> = {}) {
  const onReply = vi.fn<(thread: ReviewThread, body: string) => Promise<boolean>>().mockResolvedValue(true);
  const onCreate = vi.fn<(body: string) => Promise<boolean>>().mockResolvedValue(true);
  const onClose = vi.fn();
  render(
    <ReviewThreadDialog
      open
      title="Linea 2"
      description="src/a.rs"
      threads={threads}
      onClose={onClose}
      onReply={onReply}
      onCreate={onCreate}
      {...overrides}
    />,
  );
  return { onReply, onCreate, onClose };
}

describe("ReviewThreadDialog", () => {
  it("shows every comment of the thread in order", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Linea 2" })).toBeTruthy();
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(articles[0]?.textContent).toContain("texto 1");
    expect(articles[1]?.textContent).toContain("texto 2");
  });

  it("sends a reply to the thread it belongs to", async () => {
    const { onReply } = setup();
    fireEvent.change(screen.getByLabelText("Tu respuesta"), { target: { value: "Gracias" } });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await waitFor(() => expect(onReply).toHaveBeenCalledTimes(1));
    expect(onReply.mock.calls[0]?.[0].id).toBe(1);
    expect(onReply.mock.calls[0]?.[1]).toBe("Gracias");
  });

  it("does not send an empty reply", () => {
    const { onReply } = setup();
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Responder" });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Tu respuesta"), { target: { value: "   " } });
    expect(button.disabled).toBe(true);
    expect(onReply).not.toHaveBeenCalled();
  });

  it("offers a new comment only when the line has no thread yet", async () => {
    const { onCreate } = setup({ threads: [] });
    expect(screen.queryByRole("article")).toBeNull();
    fireEvent.change(screen.getByLabelText("Tu comentario sobre esta línea"), { target: { value: "Revisa esto" } });
    fireEvent.click(screen.getByRole("button", { name: "Comentar" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Revisa esto"));
  });

  it("shows no new-comment box for threads that can no longer be commented on", () => {
    setup({ threads: [], onCreate: null });
    expect(screen.queryByLabelText("Tu comentario sobre esta línea")).toBeNull();
  });

  it("closes from the footer button", () => {
    const { onClose } = setup();
    const closeButtons = screen.getAllByRole("button", { name: "Cerrar" });
    fireEvent.click(closeButtons[closeButtons.length - 1] ?? document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
