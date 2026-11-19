/**
 * Claim → Citation → Publication → Evidence → Result graph for one document,
 * built only from stored data (claims, citation links, reference→publication
 * matches and the latest verification run). Pan by dragging, zoom with the
 * wheel or buttons; nodes are keyboard-focusable.
 */
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  cn,
  EmptyState,
  Icon,
} from "@citeverify/ui";
import {
  type PointerEvent,
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
          description="Identify claims and map citations to build the relationship graph."
        />
      </Card>
    );

  const node = selected
    ? graph.nodes.find((n) => n.id === selected)
    : undefined;
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

  return (
    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-line border-b px-4 py-2.5">
          <p className="text-[12.5px] text-muted">
            Drag to pan · <kbd className="font-mono">Ctrl</kbd> + scroll or the
            buttons to zoom · select a node to trace its path
          </p>
          <div className="flex items-center gap-1">
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
        <svg
          role="img"
          aria-label={`Relationship graph with ${graph.nodes.length} nodes`}
          viewBox={`0 0 ${graph.width} ${Math.max(graph.height, 360)}`}
          preserveAspectRatio="xMinYMin meet"
          style={{
            aspectRatio: `${graph.width} / ${Math.min(Math.max(graph.height, 360), 900)}`,
          }}
          className="block max-h-[70vh] w-full cursor-grab touch-none select-none bg-paper active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {COLUMNS.map((c, i) => (
              <text
                key={c.kind}
                x={16 + i * COL_W}
                y={22}
                className="fill-muted font-medium text-[11px] uppercase tracking-[0.08em]"
              >
                {c.title} ·{" "}
                {graph.nodes.filter((n) => n.kind === c.kind).length}
              </text>
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
              const on = connected?.has(e.from) && connected.has(e.to);
              return (
                <path
                  key={`${e.from}>${e.to}`}
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={on ? "#5b86ff" : "#34343a"}
                  strokeWidth={on ? 2 : 1.25}
                  opacity={connected && !on ? 0.35 : 1}
                />
              );
            })}
            {graph.nodes.map((n) => {
              const p = graph.pos.get(n.id);
              if (!p) return null;
              const active = n.id === selected;
              const dim = connected && !connected.has(n.id);
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements.
                <g
                  key={n.id}
                  data-node
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${n.kind}: ${n.label}`}
                  transform={`translate(${p.x} ${p.y})`}
                  className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-electric"
                  opacity={dim ? 0.35 : 1}
                  onClick={() => setSelected(active ? null : n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(active ? null : n.id);
                    }
                  }}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={4}
                    fill="#1b1b1e"
                    stroke={active ? "#8aa9ff" : "#34343a"}
                    strokeWidth={active ? 2 : 1}
                  />
                  {n.color ? (
                    <rect width={4} height={NODE_H} rx={2} fill={n.color} />
                  ) : null}
                  <text x={12} y={19} className="fill-ink text-[11.5px]">
                    {truncate(n.label, 27)}
                  </text>
                  {n.sub ? (
                    <text x={12} y={35} className="fill-muted text-[10.5px]">
                      {truncate(n.sub, 31)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </Card>
      <Card className="self-start">
        <CardHeader title={node ? humanize(node.kind) : "Node details"} />
        <CardBody>
          {node ? (
            <div className="space-y-4">
              {node.verdict ? (
                <VerdictBadge verdict={node.verdict} />
              ) : (
                <Badge>{humanize(node.kind)}</Badge>
              )}
              <KeyValue items={node.details} />
              <p className="text-[12px] text-muted">
                {plural((connected?.size ?? 1) - 1, "connected node")}{" "}
                highlighted
              </p>
              {node.href ? (
                <Link
                  to={node.href}
                  className="inline-flex items-center gap-1 text-[13px] text-primary-600 hover:underline"
                >
                  Open <Icon name="arrowRight" size={13} />
                </Link>
              ) : null}
            </div>
          ) : (
            <p className={cn("text-[13px] text-muted")}>
              Select a node to see its details and trace the path from claim to
              result.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
