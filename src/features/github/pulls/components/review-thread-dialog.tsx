import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { CommentComposer } from "../../components/comment-composer";
import { TimelineEntry } from "../../components/timeline";
import type { ReviewThread } from "../review-model";

interface ReviewThreadDialogProps {
  open: boolean;
  title: string;
  description: string;
  threads: readonly ReviewThread[];
  onClose: () => void;
  onReply: (thread: ReviewThread, body: string) => Promise<boolean>;
  onCreate: ((body: string) => Promise<boolean>) | null;
}

export function ReviewThreadDialog({ open, title, description, threads, onClose, onReply, onCreate }: ReviewThreadDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      width="lg"
      footer={<Button onClick={onClose}>{t("common.close")}</Button>}
    >
      <div className="flex flex-col gap-5">
        {threads.map((thread) => (
          <section
            key={thread.id}
            aria-label={t("github.pulls.inline.threadLabel", { count: thread.comments.length })}
            className="flex flex-col gap-2"
          >
            {thread.comments.map((comment) => (
              <TimelineEntry key={comment.id} user={comment.user} createdAt={comment.createdAt} body={comment.body} />
            ))}
            <CommentComposer
              label={t("github.pulls.inline.replyLabel")}
              submitLabel={t("github.pulls.inline.reply")}
              rows={2}
              onSubmit={(body) => onReply(thread, body)}
            />
          </section>
        ))}
        {onCreate && threads.length === 0 ? (
          <CommentComposer
            label={t("github.pulls.inline.newLabel")}
            submitLabel={t("github.pulls.inline.send")}
            rows={4}
            onSubmit={onCreate}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
