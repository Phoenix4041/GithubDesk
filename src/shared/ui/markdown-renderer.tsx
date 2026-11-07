import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSafeExternalUrl, openExternal } from "@/shared/lib/external";
import { isAllowedImageSource } from "@/shared/lib/markdown-safety";

const components: Components = {
  a({ href, children }) {
    const target = href ?? "";
    return (
      <a
        href={isSafeExternalUrl(target) ? target : undefined}
        onClick={(event) => {
          event.preventDefault();
          void openExternal(target);
        }}
        className="cursor-pointer text-accent underline-offset-2 hover:underline"
      >
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    if (typeof src === "string" && isAllowedImageSource(src)) {
      return <img src={src} alt={alt ?? ""} loading="lazy" className="max-w-full rounded-md" />;
    }
    return <span className="text-muted italic">{alt ?? ""}</span>;
  },
};

export default function MarkdownRenderer({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {source}
    </ReactMarkdown>
  );
}
