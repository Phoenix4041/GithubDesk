import { useTranslation } from "react-i18next";
import type { FileSource } from "@/features/browse/api";
import { imageDataUrl } from "@/features/browse/image-path";
import { useFileContent } from "@/features/browse/queries";
import { Skeleton } from "@/shared/ui/skeleton";
import { ImageDiffViewer } from "./image-diff-viewer";
import type { ImageVersion } from "./image-diff-viewer";

export interface ImageSide {
  source: FileSource;
  path: string;
}

export interface ImageSides {
  before: ImageSide | null;
  after: ImageSide | null;
}

interface ImageDiffSectionProps {
  repoPath: string;
  sides: ImageSides;
}

export function ImageDiffSection({ repoPath, sides }: ImageDiffSectionProps) {
  const { t } = useTranslation();
  const before = useFileContent(repoPath, sides.before?.source ?? null, sides.before?.path ?? null);
  const after = useFileContent(repoPath, sides.after?.source ?? null, sides.after?.path ?? null);

  if ((sides.before && before.isPending) || (sides.after && after.isPending)) {
    return (
      <div className="grid grid-cols-2 gap-4 p-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  function version(side: ImageSide | null, query: typeof before): ImageVersion {
    if (!side || query.isError || !query.data || !query.data.exists) {
      return { url: null, size: null, note: t("imageDiff.missing") };
    }
    const content = query.data;
    if (content.tooLarge || content.imageBase64 === null) {
      return { url: null, size: content.size, note: t("imageDiff.tooLarge") };
    }
    return { url: imageDataUrl(side.path, content.imageBase64), size: content.size, note: null };
  }

  return <ImageDiffViewer before={version(sides.before, before)} after={version(sides.after, after)} />;
}
