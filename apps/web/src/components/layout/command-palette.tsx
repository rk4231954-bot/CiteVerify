import { cn, Icon, type IconName, Kbd } from "@citeverify/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { formatDate } from "../../lib/format.ts";
import { useAllDocuments } from "../../lib/hooks.ts";
import { NAV_FOOTER, NAV_MAIN } from "./nav.ts";

interface Entry {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  to: string;
  group: "Pages" | "Documents";
}

/** ⌘K / Ctrl+K search over pages and the user's documents (titles and file names). */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const docs = useAllDocuments();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    if (!open && el.open) el.close();
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const pages: Entry[] = [...NAV_MAIN, ...NAV_FOOTER].map((n) => ({
      id: `page:${n.to}`,
      label: n.label,
      hint: n.description,
      icon: n.icon,
      to: n.to,
      group: "Pages",
    }));
    const documents: Entry[] = (docs.data?.items ?? []).map((d) => ({
      id: `doc:${d.id}`,
      label: d.title,
      hint: `${d.originalFilename} · ${formatDate(d.createdAt)}`,
      icon: "file",
      to: `/documents/${d.id}`,
      group: "Documents",
    }));
    const all = [...pages, ...documents];
    if (!q) return [...pages, ...documents.slice(0, 6)];
    return all
      .filter(
        (e) =>
          e.label.toLowerCase().includes(q) || e.hint.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [query, docs.data]);

  function go(e: Entry | undefined) {
    if (!e) return;
    onClose();
    navigate(e.to);
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click mirrors the native Escape-to-close.
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label="Search"
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-lg border border-line bg-surface p-0 shadow-overlay open:animate-fade-up"
    >
      {open ? (
        <div>
          <div className="flex items-center gap-3 border-line border-b px-4">
            <Icon name="search" size={18} className="text-subtle" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, entries.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(entries[active]);
                }
              }}
              placeholder="Search documents and pages…"
              className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-subtle"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={
                entries[active] ? `cmd-${entries[active].id}` : undefined
              }
              aria-label="Search documents and pages"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div
            id="command-results"
            role="listbox"
            className="scrollbar-thin max-h-[50vh] overflow-y-auto p-2"
          >
            {entries.length === 0 ? (
              <div className="px-3 py-8 text-center text-[13px] text-muted">
                No documents or pages match “{query}”.
              </div>
            ) : (
              entries.map((e, i) => {
                const prev = entries[i - 1];
                return (
                  <div key={e.id}>
                    {!prev || prev.group !== e.group ? (
                      <div className="px-3 pt-2 pb-1 font-medium text-[11px] text-subtle uppercase tracking-[0.08em]">
                        {e.group}
                      </div>
                    ) : null}
                    <div
                      id={`cmd-${e.id}`}
                      role="option"
                      tabIndex={-1}
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(e)}
                      onKeyDown={(ev) => ev.key === "Enter" && go(e)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2",
                        i === active ? "bg-primary-50" : "hover:bg-paper",
                      )}
                    >
                      <Icon
                        name={e.icon}
                        size={16}
                        className={
                          i === active ? "text-primary-600" : "text-subtle"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] text-ink">
                          {e.label}
                        </div>
                        <div className="truncate text-[12px] text-muted">
                          {e.hint}
                        </div>
                      </div>
                      {i === active ? (
                        <Icon
                          name="arrowRight"
                          size={14}
                          className="text-primary-500"
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
