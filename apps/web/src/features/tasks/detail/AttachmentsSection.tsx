import type {
  AttachmentSummary,
  AttachmentUpload,
  AttachmentUrl,
  TaskDetail,
} from "@nexusflow/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, File, FileImage, FileVideo, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { apiDelete, apiGet, apiPost, ApiError, errorMessage } from "../../../lib/api";
import { formatBytes } from "../../organizations/labels";
import { tasksKey } from "../hooks";

// Files on a task (PRD §11.11): the browser uploads straight to the storage
// service with a one-time signature, then asks the API to check the file.
// Links to files are fetched only when needed and work for 15 minutes.

const MAX_AT_ONCE = 10;
const org = (orgSlug: string) => `/api/v1/orgs/${encodeURIComponent(orgSlug)}`;

/** Sends the file with the signed fields, reporting progress (fetch cannot). */
function uploadFile(target: AttachmentUpload, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(target.fields)) form.append(key, value);
    form.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", target.url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status < 300 ? resolve() : reject(new Error("The upload was refused"));
    request.onerror = () => reject(new Error("The upload failed. Check your connection."));
    request.send(form);
  });
}

function Preview({ orgSlug, file }: { orgSlug: string; file: AttachmentSummary }) {
  const link = useQuery({
    queryKey: ["org", orgSlug, "attachment-url", file.id],
    queryFn: () => apiGet<AttachmentUrl>(`${org(orgSlug)}/attachments/${file.id}/url`),
    enabled: file.kind === "IMAGE" && file.mimeType.startsWith("image/"),
    // Links expire after 15 minutes; ask again a little before.
    staleTime: 10 * 60_000,
  });
  if (!link.data) return <FileImage className="size-5 text-muted-foreground" aria-hidden="true" />;
  return (
    <img
      src={link.data.url}
      alt=""
      loading="lazy"
      className="size-10 rounded-[5px] border object-cover"
    />
  );
}

export function AttachmentsSection({ orgSlug, task }: { orgSlug: string; task: TaskDetail }) {
  const queryClient = useQueryClient();
  const key = ["org", orgSlug, "task-attachments", task.id];
  const files = useQuery({
    queryKey: key,
    queryFn: () => apiGet<AttachmentSummary[]>(`${org(orgSlug)}/tasks/${task.id}/attachments`),
  });
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<{ name: string; percent: number }[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: tasksKey(orgSlug, task.projectId) });
  };

  const addFiles = async (chosen: FileList | null) => {
    setProblem(null);
    const list = [...(chosen ?? [])].slice(0, MAX_AT_ONCE);
    for (const file of list) {
      setUploads((current) => [...current, { name: file.name, percent: 0 }]);
      const progress = (percent: number) =>
        setUploads((current) =>
          current.map((upload) => (upload.name === file.name ? { ...upload, percent } : upload)),
        );
      try {
        const target = await apiPost<AttachmentUpload>(`${org(orgSlug)}/attachments/sign`, {
          taskId: task.id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });
        await uploadFile(target, file, progress);
        await apiPost(`${org(orgSlug)}/attachments/${target.attachmentId}/confirm`);
      } catch (error) {
        setProblem(
          error instanceof ApiError
            ? `${file.name}: ${error.message}`
            : `${file.name}: ${errorMessage(error)}`,
        );
      } finally {
        setUploads((current) => current.filter((upload) => upload.name !== file.name));
        refresh();
      }
    }
    if (input.current) input.current.value = "";
  };

  const open = async (file: AttachmentSummary) => {
    try {
      const link = await apiGet<AttachmentUrl>(`${org(orgSlug)}/attachments/${file.id}/url`);
      window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };

  const remove = async (file: AttachmentSummary) => {
    try {
      await apiDelete(`${org(orgSlug)}/attachments/${file.id}`);
      refresh();
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };

  return (
    <div className="space-y-2">
      {files.isPending ? (
        <Skeleton className="h-12" />
      ) : files.data && files.data.length > 0 ? (
        <ul className="divide-y rounded-control border">
          {files.data.map((file) => {
            const Icon = file.kind === "VIDEO" ? FileVideo : File;
            return (
              <li key={file.id} className="flex items-center gap-3 px-2 py-1.5 text-sm">
                {file.mimeType.startsWith("image/") ? (
                  <Preview orgSlug={orgSlug} file={file} />
                ) : (
                  <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() => void open(file)}
                >
                  {file.originalName}
                </button>
                <span className="text-xs text-muted-foreground">{formatBytes(file.bytes)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  aria-label={`Open ${file.originalName}`}
                  onClick={() => void open(file)}
                >
                  <Download />
                </Button>
                {file.canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7"
                    aria-label={`Remove ${file.originalName}`}
                    onClick={() => void remove(file)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      )}
      {uploads.map((upload) => (
        <div key={upload.name} className="space-y-1 text-xs text-muted-foreground">
          <span>
            Uploading {upload.name}… {upload.percent}%
          </span>
          <div className="h-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full bg-primary" style={{ width: `${upload.percent}%` }} />
          </div>
        </div>
      ))}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      {task.canEdit && (
        <>
          <input
            ref={input}
            type="file"
            multiple
            className="sr-only"
            aria-label="Choose files to attach"
            onChange={(event) => void addFiles(event.target.files)}
          />
          <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
            <Paperclip /> Attach files
          </Button>
        </>
      )}
    </div>
  );
}
