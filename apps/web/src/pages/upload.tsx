import {
  Button,
  buttonClass,
  Callout,
  Card,
  CardBody,
  CardHeader,
  cn,
  Field,
  Icon,
  Input,
  ProgressBar,
  Skeleton,
  useToast,
} from "@citeverify/ui";
import { type DragEvent, useRef, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../components/common.tsx";
import { ProcessingJourney } from "../components/processing/journey.tsx";
import { ApiError, api, errorMessage } from "../lib/api.ts";
import { formatBytes } from "../lib/format.ts";
import { useConfig } from "../lib/hooks.ts";
import { invalidate } from "../lib/query.ts";
import type { DocumentSummary } from "../lib/types.ts";
import { validateFile } from "../lib/upload.ts";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "done"; document: DocumentSummary }
  | { kind: "error"; message: string };

export function UploadPage() {
  const config = useConfig();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const upload = config.data?.upload;

  function choose(f: File | undefined | null) {
    if (!f || !upload) return;
    setPhase({ kind: "idle" });
    setFile(f);
    setFileError(validateFile(f, upload));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 200));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 1) {
      setFileError("Upload one document at a time.");
      return;
    }
    choose(e.dataTransfer.files[0]);
  }

  async function submit() {
    if (!file || fileError) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "uploading", progress: 0 });
    try {
      const res = await api.documents.upload(file, {
        title: title.trim() || undefined,
        onProgress: (p) => setPhase({ kind: "uploading", progress: p }),
        signal: controller.signal,
      });
      setPhase({ kind: "done", document: res.document });
      invalidate("workspace", "documents", "docdata", "allpubs");
      toast({
        tone: "success",
        title: "Upload complete",
        description: res.document.title,
      });
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "FILE_TOO_LARGE"
          ? `The server rejected the file as too large. ${err.message}`
          : errorMessage(err);
      setPhase({ kind: "error", message });
      if (!(err instanceof ApiError && err.code === "ABORTED"))
        toast({ tone: "error", title: "Upload failed", description: message });
    } finally {
      abortRef.current = null;
    }
  }

  function reset() {
    setFile(null);
    setTitle("");
    setFileError(null);
    setPhase({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  const uploading = phase.kind === "uploading";

  return (
    <>
      <PageHeader
        eyebrow="Upload"
        title="Upload a document"
        description="Add a manuscript to verify. After the upload, run the processing journey — every stage reflects the API's stored state."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Choose a file"
              description={
                upload
                  ? `${upload.extensions.join(", ")} · up to ${formatBytes(upload.maxBytes)}`
                  : "Loading upload limits…"
              }
            />
            <CardBody className="space-y-4">
              {config.error ? (
                <Callout
                  tone="danger"
                  title="Upload limits could not be loaded"
                >
                  {errorMessage(config.error)}
                </Callout>
              ) : null}
              {!upload ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-lg border-[1.5px] border-dashed px-6 py-10 text-center transition-colors",
                    dragging
                      ? "border-primary-500 bg-primary-50/70"
                      : "border-line-strong bg-paper/60 hover:border-primary-300 hover:bg-primary-50/30",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    className="sr-only"
                    accept={[...upload.extensions, ...upload.mimeTypes].join(
                      ",",
                    )}
                    onChange={(e) => choose(e.target.files?.[0])}
                    disabled={uploading}
                  />
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-surface text-primary-500 shadow-card">
                    <Icon name="upload" size={22} />
                  </span>
                  <span className="font-medium text-[14px] text-ink">
                    {dragging
                      ? "Drop to select"
                      : "Drag & drop your manuscript"}
                  </span>
                  <span className="mt-1 text-[13px] text-muted">
                    or{" "}
                    <span className="font-medium text-primary-600 underline-offset-2 hover:underline">
                      browse files
                    </span>
                  </span>
                  <span className="mt-3 text-[12px] text-subtle">
                    PDF or DOCX with selectable text. Scanned PDFs (images) are
                    not supported.
                  </span>
                </label>
              )}

              {file ? (
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3.5 py-3",
                    fileError
                      ? "border-danger-600/40 bg-danger-50"
                      : "border-line bg-surface",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-paper-deep font-semibold text-[9.5px] text-navy-600 uppercase">
                    {file.name.split(".").pop()?.slice(0, 4)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[13.5px] text-ink">
                      {file.name}
                    </div>
                    <div className="text-[12px] text-muted">
                      {formatBytes(file.size)} · {file.type || "unknown type"}
                    </div>
                    {fileError ? (
                      <div className="mt-1 text-[12.5px] text-danger-600">
                        {fileError}
                      </div>
                    ) : null}
                  </div>
                  {!uploading && phase.kind !== "done" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove file"
                      onClick={reset}
                    >
                      <Icon name="close" size={16} />
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {file && !fileError && phase.kind !== "done" ? (
                <Field
                  label="Title"
                  hint="Optional — defaults to the file name."
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      value={title}
                      maxLength={200}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={uploading}
                    />
                  )}
                </Field>
              ) : null}

              {phase.kind === "uploading" ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[12.5px] text-muted">
                    <span>
                      {phase.progress < 1
                        ? "Uploading…"
                        : "Processing upload on the server…"}
                    </span>
                    <span className="tabular">
                      {Math.round(phase.progress * 100)}%
                    </span>
                  </div>
                  <ProgressBar
                    value={phase.progress * 100}
                    label="Upload progress"
                  />
                </div>
              ) : null}

              {phase.kind === "error" ? (
                <Callout tone="danger" title="Upload failed">
                  {phase.message}
                </Callout>
              ) : null}

              {phase.kind === "done" ? (
                <Callout
                  tone="success"
                  title="Uploaded"
                  action={
                    <Button size="sm" variant="secondary" onClick={reset}>
                      Upload another
                    </Button>
                  }
                >
                  “{phase.document.title}” is stored. Continue with the
                  processing journey.
                </Callout>
              ) : (
                <div className="flex justify-end gap-2">
                  {uploading ? (
                    <Button
                      variant="secondary"
                      onClick={() => abortRef.current?.abort()}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    icon="upload"
                    onClick={submit}
                    disabled={!file || Boolean(fileError) || !upload}
                    loading={uploading}
                  >
                    Upload
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div>
          {phase.kind === "done" ? (
            <div className="space-y-3">
              <ProcessingJourney documentId={phase.document.id} />
              <div className="flex justify-end">
                <Link
                  to={`/documents/${phase.document.id}`}
                  className={buttonClass("secondary")}
                >
                  Open document analysis <Icon name="arrowRight" size={15} />
                </Link>
              </div>
            </div>
          ) : (
            <Card>
              <CardHeader
                eyebrow="What happens next"
                title="The processing journey"
              />
              <CardBody>
                <ol className="space-y-3">
                  {[
                    ["Uploaded", "The original file is stored unchanged."],
                    [
                      "Text extracted",
                      "Paragraphs, headings and pages are parsed from the PDF/DOCX.",
                    ],
                    [
                      "Claims identified",
                      "Verifiable scientific statements are detected and categorised.",
                    ],
                    [
                      "Citations mapped",
                      "In-text citations are linked to claims and to the reference list.",
                    ],
                    [
                      "Publications retrieved",
                      "References are matched to Crossref / OpenAlex records.",
                    ],
                    [
                      "Evidence extracted",
                      "Passages are read from abstracts or legally open-access full text.",
                    ],
                    [
                      "Verification completed",
                      "Each claim receives an automated, evidence-linked verdict.",
                    ],
                  ].map(([t, d], i) => (
                    <li key={t} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[11px] text-muted">
                        {i + 1}
                      </span>
                      <div>
                        <div className="font-medium text-[13.5px] text-ink">
                          {t}
                        </div>
                        <div className="text-[12.5px] text-muted">{d}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
