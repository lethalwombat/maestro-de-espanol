"use client";

import { type SubmitEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Message } from "@/components/ui/message";
import { Skeleton } from "@/components/ui/skeleton";
import { TextArea } from "@/components/ui/text-area";
import {
  type AdminState,
  AdminResponseSchema,
  MAX_PROMPT_LENGTH,
  PromptTextSchema,
} from "./schema";

const NETWORK_ERROR = "Couldn't reach the server. Your text hasn't been saved; try again.";

type Load = { status: "loading" } | { status: "ready" } | { status: "failed"; message: string };
type Notice = { tone: "success" | "danger"; text: string } | null;
type Result = { ok: true; state: AdminState } | { ok: false; message: string };

async function call(url: string, body?: unknown): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(
      url,
      body === undefined
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    return { ok: false, message: NETWORK_ERROR };
  }
  const parsed = AdminResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { ok: false, message: NETWORK_ERROR };
  if ("error" in parsed.data) return { ok: false, message: parsed.data.message };
  return { ok: true, state: parsed.data };
}

function SavedAt({ iso }: { iso: string }) {
  const shown = new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
  return <time dateTime={iso}>{shown}</time>;
}

/** Edit the exercise prompt, keep every save as a version, and restore any of them. */
export function AdminPanel() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [state, setState] = useState<AdminState | null>(null);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  function show(next: AdminState) {
    setState(next);
    setText(next.active.text);
    setInvalid(null);
  }

  useEffect(() => {
    let live = true;
    void call("/api/admin/prompts").then((result) => {
      if (!live) return;
      if (!result.ok) {
        setLoad({ status: "failed", message: result.message });
        return;
      }
      show(result.state);
      setLoad({ status: "ready" });
    });
    return () => {
      live = false;
    };
  }, []);

  /** Runs one change. On failure the editor keeps whatever is in it. */
  async function act(url: string, body: unknown, success: string) {
    setBusy(true);
    setNotice(null);
    const result = await call(url, body);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: "danger", text: result.message });
      return;
    }
    show(result.state);
    setNotice({ tone: "success", text: success });
  }

  function onSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = PromptTextSchema.safeParse(text);
    if (!checked.success) {
      setInvalid(checked.error.issues[0]?.message ?? "Check the prompt.");
      setNotice(null);
      return;
    }
    void act("/api/admin/prompts", { text: checked.data }, "Saved.");
  }

  if (load.status === "loading") return <Skeleton className="mt-8" />;
  if (load.status === "failed") {
    return (
      <Message tone="danger" className="mt-8">
        {load.message}
      </Message>
    );
  }
  if (state === null) return null;
  const { active, versions } = state;

  return (
    <div className="mt-8 grid gap-8">
      <form className="grid gap-3" noValidate onSubmit={onSave}>
        <label htmlFor="prompt" className="font-medium">
          Exercise prompt
        </label>
        <p className="text-sm text-fg-muted">
          {active.source === "default" ? (
            "Active: the default prompt from code."
          ) : (
            <>
              Active: a saved version from <SavedAt iso={active.savedAt} />.
            </>
          )}
        </p>
        <TextArea
          id="prompt"
          name="prompt"
          rows={16}
          className="text-sm"
          value={text}
          aria-invalid={invalid === null ? undefined : true}
          aria-describedby={invalid === null ? undefined : "prompt-error"}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        {invalid !== null && (
          <p id="prompt-error" className="text-sm text-danger">
            {invalid}
          </p>
        )}
        <p className="text-sm text-fg-muted">
          {text.length.toLocaleString("en-AU")} of {MAX_PROMPT_LENGTH.toLocaleString("en-AU")}{" "}
          characters. The learner&apos;s topic always arrives in the user message, inside
          &lt;topic&gt; tags.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy}>
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void act("/api/admin/prompts/restore-default", {}, "Restored the default.")
            }
          >
            Restore default
          </Button>
        </div>
        {notice && (
          <Message tone={notice.tone} className="animate-rise">
            {notice.text}
          </Message>
        )}
      </form>

      <section aria-labelledby="versions-heading">
        <h2 id="versions-heading" className="text-lg font-semibold">
          Saved versions
        </h2>
        {versions.length === 0 ? (
          <p className="mt-2 text-fg-muted">No saved versions yet.</p>
        ) : (
          <ol aria-label="Saved versions" className="mt-3 grid gap-3">
            {versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-fg-muted">
                    <SavedAt iso={version.savedAt} />
                    {active.source === "saved" && active.id === version.id && " · active"}
                  </p>
                  <p className="truncate">{version.firstLine || "(blank first line)"}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act("/api/admin/prompts/restore", { id: version.id }, "Restored.")
                  }
                >
                  Restore
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
