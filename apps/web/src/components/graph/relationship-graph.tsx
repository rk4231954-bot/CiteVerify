/**
 * Claim → Citation → Publication → Evidence → Result graph for one document,
 * built only from stored data (claims, citation links, reference→publication
 * matches and the latest verification run). Pan by dragging, zoom with the
 * wheel or buttons; nodes are keyboard-focusable.
 */
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  CardHeader,
  cn,
  EmptyState,
  Icon,
  type IconName,
  IconTile,
  type TileTone,
} from "@citeverify/ui";
import {
  type PointerEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { Link } from "react-router";
import { categoryLabel, verdictMeta } from "../../lib/domain.ts";
import { humanize, plural, truncate } from "../../lib/format.ts";
import {
  useCitations,
  useClaims,
  usePublications,
  useVerification,
} from "../../lib/hooks.ts";
import { ErrorState, KeyValue, LoadingRows, VerdictBadge } from "../common.tsx";

type Kind = "claim" | "citation" | "publication" | "evidence" | "result";
interface GraphNode {
  id: string;
  kind: Kind;
  label: string;
  sub?: string;
  color?: string;
  verdict?: string;
  details: Array<{ label: string; value: string }>;
  href?: string;
}
interface GraphEdge {
  from: string;
  to: string;
}

const COLUMNS: Array<{ kind: Kind; title: string }> = [
  { kind: "claim", title: "Claims" },
  { kind: "citation", title: "Citations" },
  { kind: "publication", title: "Publications" },
  { kind: "evidence", title: "Evidence" },
  { kind: "result", title: "Results" },
];
/** Identity colour per stage; results use their verdict colour instead. */
const KIND: Record<
  Kind,
  { label: string; color: string; icon: IconName; tone: TileTone }
> = {
  claim: { label: "Claim", color: "#6f95f5", icon: "claims", tone: "primary" },
  citation: {
    label: "Citation",
    color: "#a993ff",
    icon: "quote",
    tone: "violet",
  },
  publication: {
    label: "Publication",
    color: "#3fb6a8",
    icon: "book",
    tone: "success",
  },
  evidence: {
    label: "Evidence",
    color: "#9d9da6",
    icon: "search",
    tone: "neutral",
  },
  result: {
    label: "Verdict",
    color: "#ededef",
    icon: "verification",
    tone: "warning",
  },
};
const COL_W = 232;
const NODE_W = 196;
const NODE_H = 46;
const ROW_H = 60;
const TOP = 44;

export function RelationshipGraph({ documentId }: { documentId: string }) {
  const claims = useClaims(documentId);
  const citations = useCitations(documentId);
  const pubs = usePublications(documentId);
  const verification = useVerification(documentId);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const uid = useId().replace(/:/g, "");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  );

  const graph = useMemo(() => {
    if (!claims.data || !citations.data || !pubs.data || !verification.data)
      return null;
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const has = new Set<string>();
    const add = (n: GraphNode) => {
      if (!has.has(n.id)) {
        has.add(n.id);
        nodes.push(n);
      }
    };
    const pubByRef = new Map(
      pubs.data.references
        .filter((r) => r.publication)
        .map((r) => [r.reference.id, r.publication]),
    );

    for (const c of claims.data)
      add({
        id: `claim:${c.id}`,
        kind: "claim",
        label: truncate(c.originalText, 60),
        sub: categoryLabel(c.category),
        details: [
          { label: "Claim", value: c.originalText },
          { label: "Category", value: categoryLabel(c.category) },
          {
            label: "Location",
            value:
              [c.section, c.pageNumber ? `page ${c.pageNumber}` : null]
                .filter(Boolean)
                .join(" · ") || "—",
          },
        ],
        href: `/documents/${documentId}/workspace?claim=${c.id}`,
      });
    for (const ci of citations.data) {
      if (ci.claims.length === 0) continue;
      add({
        id: `cit:${ci.id}`,
        kind: "citation",
        label: ci.citationText,
        sub: humanize(ci.matchStatus),
        details: [
          { label: "Citation", value: ci.citationText },
          { label: "Reference match", value: humanize(ci.matchStatus) },
          {
            label: "Reference",
            value: ci.reference?.rawText ?? "No reference matched",
          },
        ],
      });
      for (const l of ci.claims)
        edges.push({ from: `claim:${l.claimId}`, to: `cit:${ci.id}` });
      const pub = ci.referenceId ? pubByRef.get(ci.referenceId) : undefined;
      if (pub) {
        add({
          id: `pub:${pub.id}`,
          kind: "publication",
          label: truncate(pub.title, 60),
          sub: [pub.year, pub.journal].filter(Boolean).join(" · ") || undefined,
          details: [
            { label: "Title", value: pub.title },
            {
              label: "Year · venue",
              value: [pub.year, pub.journal].filter(Boolean).join(" · ") || "—",
            },
            { label: "DOI", value: pub.doi ?? "—" },
          ],
          href: `/publications/${pub.id}`,
        });
        edges.push({ from: `cit:${ci.id}`, to: `pub:${pub.id}` });
      }
    }
    for (const r of verification.data.results) {
      const m = verdictMeta(r.verdict);
      add({
        id: `res:${r.id}`,
        kind: "result",
        label: m.label,
        sub: `${r.confidence}% assessment confidence`,
        color: m.color,
        verdict: r.verdict,
        details: [
          { label: "Verdict", value: m.label },
          {
            label: "Assessment confidence",
            value: `${r.confidence}% (not a guarantee)`,
          },
          { label: "Explanation", value: r.explanation },
        ],
        href: `/documents/${documentId}/workspace?claim=${r.claimId}`,
      });
      const passages = [
        ...r.supportingEvidence,
        ...r.contradictingEvidence,
        ...r.contextEvidence,
      ];
      const pubsWithEvidence = new Set<string>();
      for (const p of r.publications) {
        const own = passages.filter((e) => e.publicationId === p.id);
        if (own.length === 0) continue;
        pubsWithEvidence.add(p.id);
        const eid = `ev:${r.id}:${p.id}`;
        const sup = own.filter((e) => e.role === "SUPPORTING").length;
        const con = own.filter((e) => e.role === "CONTRADICTING").length;
        add({
          id: eid,
          kind: "evidence",
          label: plural(own.length, "passage"),
          sub:
            [
              sup ? `${sup} supporting` : null,
              con ? `${con} contradicting` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "context only",
          details: [
            { label: "Publication", value: p.title },
            { label: "Source", value: humanize(p.evidenceSource) },
            {
              label: "Passages used",
              value: `${own.length} (${sup} supporting, ${con} contradicting)`,
            },
            {
              label: "First passage",
              value: truncate(own[0]?.sourceText ?? "", 220),
            },
          ],
        });
        if (!has.has(`pub:${p.id}`))
          add({
            id: `pub:${p.id}`,
            kind: "publication",
            label: truncate(p.title, 60),
            sub: [p.year, p.journal].filter(Boolean).join(" · ") || undefined,
            details: [{ label: "Title", value: p.title }],
            href: `/publications/${p.id}`,
          });
        edges.push(
          { from: `pub:${p.id}`, to: eid },
          { from: eid, to: `res:${r.id}` },
        );
      }
      // A result reached without evidence still belongs to its claim.
      if (pubsWithEvidence.size === 0)
        edges.push({ from: `claim:${r.claimId}`, to: `res:${r.id}` });
    }
    const valid = edges.filter((e) => has.has(e.from) && has.has(e.to));
    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    COLUMNS.forEach((col, ci) => {
      const inCol = nodes.filter((n) => n.kind === col.kind);
      maxRows = Math.max(maxRows, inCol.length);
      inCol.forEach((n, ri) => {
        pos.set(n.id, { x: 16 + ci * COL_W, y: TOP + ri * ROW_H });
      });
    });
    return {
      nodes,
      edges: valid,
      pos,
      width: 16 + COLUMNS.length * COL_W,
      height: TOP + Math.max(maxRows, 1) * ROW_H + 16,
    };
  }, [claims.data, citations.data, pubs.data, verification.data, documentId]);

  const connected = useMemo(() => {
    if (!selected || !graph) return null;
    const set = new Set([selected]);
    const walk = (dir: "from" | "to") => {
      const queue = [selected];
      while (queue.length) {
        const cur = queue.shift() as string;
        for (const e of graph.edges) {
          const [a, b] = dir === "to" ? [e.from, e.to] : [e.to, e.from];
          if (a === cur && !set.has(b)) {
            set.add(b);
            queue.push(b);
          }
        }
      }
    };
    walk("to");
    walk("from");
    return set;
  }, [selected, graph]);

  const error =
    claims.error ?? citations.error ?? pubs.error ?? verification.error;
  if (error)
    return (
      <Card>
        <ErrorState
          error={error}
          onRetry={() => {
            for (const q of [claims, citations, pubs, verification])
              q.refetch();
          }}
        />
      </Card>
    );
  if (!graph) return <LoadingRows rows={5} />;
  if (graph.nodes.length === 0)
    return (
      <Card>
        <EmptyState
          icon="graph"
          title="Nothing to connect yet"
          description="Identify claims and map citations in this document to build its citation network."
        />
      </Card>
    );

  const node = selected
    ? graph.nodes.find((n) => n.id === selected)
    : undefined;
  const q = query.trim().toLowerCase();
  const matches = q
    ? new Set(
        graph.nodes
          .filter((n) =>
            [n.label, n.sub ?? "", ...n.details.map((d) => d.value)]
              .join(" ")
              .toLowerCase()
              .includes(q),
          )
          .map((n) => n.id),
      )
    : null;
  // Selection wins over search; search wins over hover.
  const focus = connected ?? matches;
  const counts = Object.fromEntries(
    COLUMNS.map((c) => [
      c.kind,
      graph.nodes.filter((n) => n.kind === c.kind).length,
    ]),
  ) as Record<Kind, number>;
  const zoom = (f: number) =>
    setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.35, v.k * f)) }));
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && !e.altKey) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[data-node]")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    // Screen pixels → viewBox units (the SVG scales to its container).
    const ratio = graph.width / (e.currentTarget.clientWidth || graph.width);
    setView((v) => ({
      ...v,
      x: d.vx + (e.clientX - d.x) * ratio,
      y: d.vy + (e.clientY - d.y) * ratio,
    }));
  };
  const canvasH = Math.max(graph.height, 360);
  const connectedByKind = connected
    ? COLUMNS.map((c) => ({
        ...c,
        n: graph.nodes.filter(
          (x) => x.kind === c.kind && x.id !== selected && connected.has(x.id),
        ).length,
      })).filter((c) => c.n > 0)
    : [];

  return (
    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="overflow-hidden">
        {/* Legend: one chip per stage of the chain, with its node count. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-line border-b px-4 py-3">
          {COLUMNS.map((c, i) => (
            <span
              key={c.kind}
              className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft"
            >
              <span
                className="h-2 w-2 rounded-[3px]"
                style={{ background: KIND[c.kind].color }}
                aria-hidden="true"
              />
              {c.title}
              <span className="tabular text-subtle">{counts[c.kind]}</span>
              {i < COLUMNS.length - 1 ? (
                <Icon
                  name="chevronRight"
                  size={12}
                  className="ml-1.5 text-subtle"
                />
              ) : null}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-line border-b px-4 py-2">
          <label className="relative flex min-w-[200px] flex-1 items-center sm:max-w-[280px]">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute left-2.5 text-subtle"
            />
            <span className="sr-only">Find a node</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches && matches.size > 0) {
                  e.preventDefault();
                  setSelected([...matches][0] ?? null);
                }
              }}
              placeholder="Find a claim, citation, DOI…"
              className="h-8 w-full rounded-[7px] border border-line bg-[#121214] pr-2 pl-8 text-[12.5px] text-ink shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] outline-none transition-colors placeholder:text-subtle focus:border-[#5b86ff]/60"
            />
          </label>
          <div className="flex items-center gap-1">
            {matches ? (
              <span className="mr-2 text-[12px] text-muted" aria-live="polite">
                {plural(matches.size, "match", "matches")}
              </span>
            ) : null}
            {selected ? (
              <Button
                size="sm"
                variant="ghost"
                icon="x"
                onClick={() => setSelected(null)}
              >
                Clear
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              icon="zoomOut"
              aria-label="Zoom out"
              onClick={() => zoom(1 / 1.2)}
            />
            <span className="tabular w-11 text-center text-[12px] text-muted">
              {Math.round(view.k * 100)}%
            </span>
            <Button
              size="icon"
              variant="ghost"
              icon="zoomIn"
              aria-label="Zoom in"
              onClick={() => zoom(1.2)}
            />
            <Button
              size="icon"
              variant="ghost"
              icon="maximize"
              aria-label="Reset view"
              onClick={() => setView({ x: 0, y: 0, k: 1 })}
            />
          </div>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <svg
            role="img"
            aria-label={`Citation network with ${graph.nodes.length} nodes and ${graph.edges.length} links`}
            viewBox={`0 0 ${graph.width} ${canvasH}`}
            preserveAspectRatio="xMinYMin meet"
            style={{
              aspectRatio: `${graph.width} / ${Math.min(canvasH, 900)}`,
              // Keep node text legible: below ~80% scale the graph scrolls
              // sideways instead of shrinking further.
              minWidth: Math.round(graph.width * 0.8),
            }}
            className="block max-h-[72vh] w-full cursor-grab touch-none select-none bg-[#0c0c0e] active:cursor-grabbing"
            onWheel={onWheel}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
            <defs>
              <pattern
                id={`${uid}-dots`}
                width="18"
                height="18"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="0.9" fill="#ffffff" opacity="0.06" />
              </pattern>
              <linearGradient id={`${uid}-node`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#222226" />
                <stop offset="1" stopColor="#18181b" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${uid}-dots)`} />
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {/* Column lanes */}
              {COLUMNS.map((c, i) => (
                <g key={c.kind}>
                  <rect
                    x={8 + i * COL_W}
                    y={6}
                    width={NODE_W + 16}
                    height={canvasH - 12}
                    rx={10}
                    fill="#ffffff"
                    opacity={0.018}
                  />
                  <circle
                    cx={20 + i * COL_W}
                    cy={21}
                    r={3.5}
                    fill={KIND[c.kind].color}
                  />
                  <text
                    x={30 + i * COL_W}
                    y={25}
                    className="fill-ink-soft font-medium text-[11px] uppercase tracking-[0.08em]"
                  >
                    {c.title} · {counts[c.kind]}
                  </text>
                </g>
              ))}
              {graph.edges.map((e) => {
                const a = graph.pos.get(e.from);
                const b = graph.pos.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x;
                const y2 = b.y + NODE_H / 2;
                const mx = (x1 + x2) / 2;
                const on = focus?.has(e.from) && focus.has(e.to);
                const hot =
                  !focus &&
                  hover !== null &&
                  (e.from === hover || e.to === hover);
                const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
                return (
                  <g key={`${e.from}>${e.to}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={on || hot ? "#5b86ff" : "#2e2e34"}
                      strokeWidth={on ? 2 : hot ? 1.6 : 1.2}
                      opacity={focus && !on ? 0.25 : 1}
                      className="transition-[stroke,opacity] duration-200"
                    />
                    {on && connected ? (
                      <path
                        d={d}
                        fill="none"
                        stroke="#c7d6ff"
                        strokeWidth={2}
                        strokeDasharray="4 16"
                        strokeLinecap="round"
                        className="animate-dash-flow"
                      />
                    ) : null}
                  </g>
                );
              })}
              {graph.nodes.map((n) => {
                const p = graph.pos.get(n.id);
                if (!p) return null;
                const active = n.id === selected;
                const dim = focus && !focus.has(n.id);
                const col = COLUMNS.findIndex((c) => c.kind === n.kind);
                const row = Math.round((p.y - TOP) / ROW_H);
                const accent = n.color ?? KIND[n.kind].color;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements.
                  <g
                    key={n.id}
                    data-node
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    aria-label={`${KIND[n.kind].label}: ${n.label}`}
                    transform={`translate(${p.x} ${p.y})`}
                    className="group/node cursor-pointer outline-none"
                    opacity={dim ? 0.3 : 1}
                    style={{ transition: "opacity 200ms ease-out" }}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setSelected(active ? null : n.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(active ? null : n.id);
                      } else if (e.key === "Escape") setSelected(null);
                    }}
                  >
                    <g
                      className="animate-fade-in"
                      style={{
                        animationDelay: `${col * 90 + Math.min(row, 12) * 18}ms`,
                      }}
                    >
                      {active ? (
                        <rect
                          x={-3}
                          y={-3}
                          width={NODE_W + 6}
                          height={NODE_H + 6}
                          rx={9}
                          fill="none"
                          stroke="#5b86ff"
                          strokeOpacity={0.35}
                          strokeWidth={4}
                        />
                      ) : null}
                      <rect
                        width={NODE_W}
                        height={NODE_H}
                        rx={7}
                        fill={`url(#${uid}-node)`}
                        stroke={active ? "#8aa9ff" : "#34343a"}
                        strokeWidth={active ? 1.5 : 1}
                        className="transition-[stroke] duration-150 group-hover/node:stroke-[#5a5a63] group-focus-visible/node:stroke-[#8aa9ff]"
                      />
                      <rect
                        x={0.5}
                        y={8}
                        width={3}
                        height={NODE_H - 16}
                        rx={1.5}
                        fill={accent}
                      />
                      <text x={13} y={19} className="fill-ink text-[11.5px]">
                        {truncate(n.label, 27)}
                      </text>
                      {n.sub ? (
                        <text
                          x={13}
                          y={35}
                          className="fill-muted text-[10.5px]"
                        >
                          {truncate(n.sub, 31)}
                        </text>
                      ) : null}
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <p className="border-line border-t px-4 py-2 text-[11.5px] text-subtle">
          Drag to pan · <kbd className="font-mono">Ctrl</kbd> + scroll or the
          buttons to zoom · select a node to trace its path · Esc clears
        </p>
      </Card>

      <Card className="self-start 2xl:sticky 2xl:top-4">
        <CardHeader
          title={node ? KIND[node.kind].label : "Node details"}
          description={
            node
              ? "Highlighted path through the network"
              : `${plural(graph.nodes.length, "node")} · ${plural(graph.edges.length, "link")}`
          }
        />
        <CardBody>
          {node ? (
            <div key={node.id} className="animate-fade-up space-y-4">
              <div className="flex items-center gap-2.5">
                <IconTile
                  icon={KIND[node.kind].icon}
                  tone={KIND[node.kind].tone}
                />
                {node.verdict ? (
                  <VerdictBadge verdict={node.verdict} />
                ) : (
                  <Badge>{KIND[node.kind].label}</Badge>
                )}
              </div>
              <KeyValue items={node.details} className="2xl:grid-cols-1" />
              {connectedByKind.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {connectedByKind.map((c) => (
                    <span
                      key={c.kind}
                      className="inline-flex items-center gap-1.5 rounded-[6px] border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[11.5px] text-ink-soft"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: KIND[c.kind].color }}
                        aria-hidden="true"
                      />
                      {c.n}{" "}
                      {c.n === 1 || c.kind === "evidence"
                        ? KIND[c.kind].label.toLowerCase()
                        : `${KIND[c.kind].label.toLowerCase()}s`}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted">No linked nodes.</p>
              )}
              {node.href ? (
                <Link
                  to={node.href}
                  className={cn(buttonClass("secondary", "sm"), "w-full")}
                >
                  Open {KIND[node.kind].label.toLowerCase()}
                  <Icon name="arrowRight" size={13} />
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-muted leading-relaxed">
                Select a node to see its details and trace the path from claim
                to verdict. Use search to find a claim, citation marker or DOI.
              </p>
              <ul className="space-y-1.5">
                {COLUMNS.map((c) => (
                  <li
                    key={c.kind}
                    className="flex items-center justify-between text-[12.5px]"
                  >
                    <span className="flex items-center gap-2 text-ink-soft">
                      <span
                        className="h-2 w-2 rounded-[3px]"
                        style={{ background: KIND[c.kind].color }}
                        aria-hidden="true"
                      />
                      {c.title}
                    </span>
                    <span className="tabular text-ink">{counts[c.kind]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
