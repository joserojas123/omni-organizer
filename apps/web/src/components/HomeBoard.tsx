"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Objective, Task, TaskStatus } from "@omni-organize/shared";
import { OBJECTIVE_STATUS_META } from "@omni-organize/shared";
import { STATUS_META, escapeHtml, formatRelative } from "@/lib/engine";
import type { CardKind, OmniOrganize } from "@/hooks/useOmniOrganize";
import { Star } from "./icons";

/**
 * The home board: four CSS columns, two of them channels for the relation
 * curves.
 *
 *   ┌──────┬───────────────┬──────┬───────────────┐
 *   │ 44px │  Proyectos    │ 56px │  Objetivos    │
 *   │ seq  │  1fr          │ link │  1fr          │
 *   └──────┴───────────────┴──────┴───────────────┘
 *
 * Cards share a minimum height, but a long name wraps instead of being cut —
 * a project or objective always shows its full name. That makes heights vary,
 * so the curve anchors are measured from the laid-out cards rather than
 * computed from an index. Curves are always béziers — never right angles or
 * steps — the same rule the canvas follows.
 */
export const SEQ_CHANNEL = 44;
export const LINK_CHANNEL = 56;
/** Minimum card height; a card grows when its name needs more lines. */
export const CARD_H = 92;
export const CARD_GAP = 12;
/** Below this the columns would collapse, so the board scrolls sideways instead. */
export const BOARD_MIN_W = 900;

const GRID_COLUMNS = `${SEQ_CHANNEL}px minmax(0,1fr) ${LINK_CHANNEL}px minmax(0,1fr)`;

/** Where the card at index `i` would sit if every card were the minimum
 *  height. Used only for the very first paint, before anything is measured. */
function fallbackY(i: number): number {
  return i * (CARD_H + CARD_GAP) + CARD_H / 2;
}

export function HomeBoard({
  app,
  projects,
  objectives,
}: {
  app: OmniOrganize;
  projects: Task[];
  objectives: Objective[];
}) {
  const { state, graph, actions, setBoardEl } = app;
  const { eff } = graph.statusResolver();
  const elRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<(HTMLDivElement | null)[]>([]);
  const cardEls = useRef<Map<string, HTMLElement>>(new Map());
  const [width, setWidth] = useState(0);
  /** Measured vertical center of each card, in board coordinates. */
  const [anchors, setAnchors] = useState<Record<string, number>>({});
  const [measuredH, setMeasuredH] = useState(0);

  const registerCard = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardEls.current.set(id, el);
    else cardEls.current.delete(id);
  }, []);

  const attachBoard = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      setBoardEl(el);
      if (el) setWidth(el.clientWidth);
    },
    [setBoardEl],
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Re-measure after every render: a name that rewraps changes a card's height
     and therefore where its curve has to attach. Both setters bail out when
     nothing moved, so this settles in one pass instead of looping. */
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    let bottom = 0;
    cardEls.current.forEach((el, id) => {
      if (!el.isConnected) return;
      next[id] = el.offsetTop + el.offsetHeight / 2;
      bottom = Math.max(bottom, el.offsetTop + el.offsetHeight);
    });
    setAnchors((prev) => {
      const keys = Object.keys(next);
      const same =
        keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k]);
      return same ? prev : next;
    });
    setMeasuredH((prev) => (prev === bottom ? prev : bottom));
  });

  /* Fonts landing late rewrap a name without any re-render, so watch the two
     columns: their height changes whenever a card does. */
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth((w) => w));
    colsRef.current.forEach((c) => c && ro.observe(c));
    return () => ro.disconnect();
  }, []);

  const colW = Math.max(120, (width - SEQ_CHANNEL - LINK_CHANNEL) / 2);
  const projectIndex = new Map(projects.map((p, i) => [p.id, i]));
  const objectiveIndex = new Map(objectives.map((o, i) => [o.id, i]));
  const rows = Math.max(projects.length, objectives.length);
  const boardH = measuredH || (rows ? rows * (CARD_H + CARD_GAP) - CARD_GAP : 0);

  /* Anchors: the round connection points on the card edges. */
  const yOf = (id: string, index: number) => anchors[id] ?? fallbackY(index);

  const seqAnchor = (id: string) => ({
    x: SEQ_CHANNEL,
    y: yOf(id, projectIndex.get(id) ?? 0),
  });
  const projectLinkAnchor = (id: string) => ({
    x: SEQ_CHANNEL + colW,
    y: yOf(id, projectIndex.get(id) ?? 0),
  });
  const objectiveAnchor = (id: string) => ({
    x: SEQ_CHANNEL + colW + LINK_CHANNEL,
    y: yOf(id, objectiveIndex.get(id) ?? 0),
  });

  /* ── Curves ────────────────────────────────────────────────────────── */

  /** Sequence, left channel: it bulges out into the channel and comes back. */
  const seqPath = (fromId: string, toId: string): string => {
    const a = seqAnchor(fromId);
    const b = seqAnchor(toId);
    const span = Math.abs(
      (projectIndex.get(fromId) ?? 0) - (projectIndex.get(toId) ?? 0),
    );
    const k = Math.min(SEQ_CHANNEL - 6, 14 + span * 8);
    return `M ${a.x} ${a.y} C ${a.x - k} ${a.y}, ${b.x - k} ${b.y}, ${b.x} ${b.y}`;
  };

  /** Link, middle channel: a plain S with horizontal tangents at both ends. */
  const linkPath = (projectId: string, objectiveId: string): string => {
    const a = projectLinkAnchor(projectId);
    const b = objectiveAnchor(objectiveId);
    const k = LINK_CHANNEL * 0.55;
    return `M ${a.x} ${a.y} C ${a.x + k} ${a.y}, ${b.x - k} ${b.y}, ${b.x} ${b.y}`;
  };

  interface Curve {
    key: string;
    d: string;
    arrow: boolean;
    ends: string[];
    onRemove: () => void;
  }

  const curves: Curve[] = [];
  projects.forEach((p) => {
    (p.seqNext || []).forEach((nextId) => {
      if (!projectIndex.has(nextId)) return;
      curves.push({
        key: `seq:${p.id}>${nextId}`,
        d: seqPath(p.id, nextId),
        // Order matters here, so the sequence curve carries an arrowhead.
        arrow: true,
        ends: [p.id, nextId],
        onRemove: () => actions.unlinkProjects(p.id, nextId),
      });
    });
  });
  objectives.forEach((o) => {
    (o.linkedProjectIds || []).forEach((projectId) => {
      if (!projectIndex.has(projectId)) return;
      curves.push({
        key: `link:${projectId}~${o.id}`,
        d: linkPath(projectId, o.id),
        // No direction of execution, so no arrowhead.
        arrow: false,
        ends: [projectId, o.id],
        onRemove: () => actions.toggleObjectiveLink(o.id, projectId),
      });
    });
  });

  /* Hovering or holding a card highlights its curves and dims the rest. */
  const focusId = state.homeDrag?.fromId ?? state.hoverCard?.id ?? null;

  const drag = state.homeDrag;
  let dragPath = "";
  if (drag) {
    const from =
      drag.type === "seq"
        ? seqAnchor(drag.fromId)
        : drag.fromKind === "objective"
          ? objectiveAnchor(drag.fromId)
          : projectLinkAnchor(drag.fromId);
    const dir = drag.type === "seq" ? -1 : drag.fromKind === "objective" ? -1 : 1;
    const k = Math.max(24, Math.abs(drag.x - from.x) / 2);
    dragPath = `M ${from.x} ${from.y} C ${from.x + dir * k} ${from.y}, ${
      drag.x - dir * k
    } ${drag.y}, ${drag.x} ${drag.y}`;
  }

  const hasSeq = (id: string) =>
    projects.some(
      (p) =>
        (p.id === id && (p.seqNext || []).some((n) => projectIndex.has(n))) ||
        (p.seqNext || []).includes(id),
    );
  const linkedProjectIds = new Set(
    objectives.flatMap((o) => o.linkedProjectIds || []),
  );

  return (
    <div>
      {/* column headers */}
      <div style={{ display: "grid", gridTemplateColumns: GRID_COLUMNS }}>
        <div />
        <ColumnHeader
          label={`Proyectos (${projects.length})`}
          action="Nuevo proyecto"
          onAction={actions.createProject}
        />
        <div />
        <ColumnHeader
          label={`Objetivos (${objectives.length})`}
          action="Nuevo objetivo"
          onAction={actions.createObjective}
        />
      </div>

      {/* cards + curves */}
      <div ref={attachBoard} style={{ position: "relative", minHeight: boardH }}>
        <svg
          width="100%"
          height={Math.max(boardH, 1)}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          <defs>
            <marker id="homeArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#a8a8a1" />
            </marker>
            <marker id="homeArrowOn" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#1c1c1a" />
            </marker>
          </defs>

          {curves.map((c) => {
            const lit = !focusId || c.ends.includes(focusId);
            const hot = state.hoverCurve === c.key;
            const on = hot || (focusId && lit);
            return (
              <g key={c.key} style={{ opacity: lit ? 1 : 0.18, transition: "opacity .15s" }}>
                <path
                  d={c.d}
                  fill="none"
                  stroke={on ? "#1c1c1a" : "#a8a8a1"}
                  strokeWidth={hot ? 2 : 1.3}
                  markerEnd={c.arrow ? `url(#${on ? "homeArrowOn" : "homeArrow"})` : undefined}
                />
                {/* 14 px of invisible stroke make the curve comfortable to hit. */}
                <path
                  d={c.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  onDoubleClick={c.onRemove}
                  onMouseEnter={() => actions.setHoverCurve(c.key)}
                  onMouseLeave={() => actions.setHoverCurve(null)}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                />
              </g>
            );
          })}

          {drag && (
            <path
              d={dragPath}
              fill="none"
              stroke={drag.invalid ? "#ef4444" : "#a8a8a1"}
              strokeWidth={1.3}
              strokeDasharray="4 3"
            />
          )}

          {/* connection points — filled when the card already has links */}
          {projects.map((p) => {
            const a = seqAnchor(p.id);
            const b = projectLinkAnchor(p.id);
            return (
              <g key={"pt:" + p.id}>
                <ConnectionPoint
                  x={a.x}
                  y={a.y}
                  filled={hasSeq(p.id)}
                  title="Arrastra hasta otro proyecto para ordenarlos"
                  onMouseDown={(e) =>
                    actions.onHomeHandleMouseDown("seq", { kind: "project", id: p.id }, e)
                  }
                />
                <ConnectionPoint
                  x={b.x}
                  y={b.y}
                  filled={linkedProjectIds.has(p.id)}
                  title="Arrastra hasta un objetivo para vincularlos"
                  onMouseDown={(e) =>
                    actions.onHomeHandleMouseDown("link", { kind: "project", id: p.id }, e)
                  }
                />
              </g>
            );
          })}
          {objectives.map((o) => {
            const a = objectiveAnchor(o.id);
            return (
              <ConnectionPoint
                key={"pt:" + o.id}
                x={a.x}
                y={a.y}
                filled={(o.linkedProjectIds || []).length > 0}
                title="Arrastra hasta un proyecto para vincularlos"
                onMouseDown={(e) =>
                  actions.onHomeHandleMouseDown("link", { kind: "objective", id: o.id }, e)
                }
              />
            );
          })}
        </svg>

        <div style={{ display: "grid", gridTemplateColumns: GRID_COLUMNS }}>
          <div />
          <div
            ref={(el) => {
              colsRef.current[0] = el;
            }}
            style={{ display: "flex", flexDirection: "column", gap: CARD_GAP }}
          >
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                app={app}
                project={p}
                status={eff(p.id)}
                register={registerCard}
              />
            ))}
          </div>
          <div />
          <div
            ref={(el) => {
              colsRef.current[1] = el;
            }}
            style={{ display: "flex", flexDirection: "column", gap: CARD_GAP }}
          >
            {objectives.map((o) => (
              <ObjectiveCard
                key={o.id}
                app={app}
                objective={o}
                register={registerCard}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({
  label,
  action,
  onAction,
}: {
  label: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "0 2px 10px",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: "#1c1c1a" }}>{label}</span>
      {/* Smaller than "Nueva área" so the hierarchy reads on its own. */}
      <button onClick={onAction} style={columnBtn}>
        {action}
      </button>
    </div>
  );
}

function ConnectionPoint({
  x,
  y,
  filled,
  title,
  onMouseDown,
}: {
  x: number;
  y: number;
  filled: boolean;
  title: string;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <circle
      cx={x}
      cy={y}
      r={4.5}
      fill={filled ? "#8a8a83" : "#fff"}
      stroke="#8a8a83"
      strokeWidth={1}
      onMouseDown={onMouseDown}
      style={{ pointerEvents: "all", cursor: "crosshair" }}
    >
      <title>{title}</title>
    </circle>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────── */

function cardShell(highlight: "none" | "on" | "invalid"): CSSProperties {
  return {
    position: "relative",
    // Minimum, not fixed: the name wraps to as many lines as it needs and the
    // card grows with it, so a name is never cut short.
    minHeight: CARD_H,
    boxSizing: "border-box",
    background: "#fff",
    borderRadius: 12,
    border: `0.5px solid ${highlight === "invalid" ? "#ef4444" : "#e2e2df"}`,
    boxShadow:
      highlight === "invalid"
        ? "0 0 0 1.5px #ef4444"
        : highlight === "on"
          ? "0 0 0 1.5px #1c1c1a"
          : undefined,
    padding: "13px 14px 13px 24px",
    cursor: "pointer",
    overflow: "hidden",
    // A relation drag that starts a few pixels off the connection point would
    // otherwise select the card's text instead of doing nothing.
    userSelect: "none",
  };
}

/** 3 px inner bar, not a border-left, so the card keeps its rounded corners. */
function statusBand(color: string): CSSProperties {
  return {
    position: "absolute",
    left: 11,
    top: 13,
    bottom: 13,
    width: 3,
    borderRadius: 2,
    background: color,
  };
}

function highlightOf(app: OmniOrganize, kind: CardKind, id: string) {
  const drag = app.state.homeDrag;
  if (drag?.over && drag.over.id === id && drag.over.kind === kind)
    return drag.invalid ? "invalid" : "on";
  if (drag && drag.fromId === id && drag.fromKind === kind) return "on";
  return "none";
}

function ProjectCard({
  app,
  project,
  status,
  register,
}: {
  app: OmniOrganize;
  project: Task;
  status: TaskStatus;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const { state, graph, actions, setNameEl } = app;
  const { eff } = graph.statusResolver();
  const children = graph.getChildren(project.id);
  const done = children.filter((c) => eff(c.id) === "completada").length;
  const pct = children.length ? Math.round((done / children.length) * 100) : 0;
  // Red never shows up in this column: a project is never `bloqueada`.
  const meta = STATUS_META[status];
  const editing = state.editingNameId === project.id;

  return (
    <div
      ref={(el) => register(project.id, el)}
      data-card-kind="project"
      data-card-id={project.id}
      onContextMenu={(e) => actions.openHomeMenu(project.id, e)}
      onDoubleClick={() => actions.openEditor(project.id)}
      onMouseEnter={() => actions.setHoverCard({ kind: "project", id: project.id })}
      onMouseLeave={() => actions.setHoverCard(null)}
      style={cardShell(highlightOf(app, "project", project.id))}
    >
      <div style={statusBand(meta.color)} />
      <div style={rowTop}>
        {editing ? (
          <div
            contentEditable
            suppressContentEditableWarning
            ref={setNameEl}
            onBlur={(e) => {
              if (!state.linkDialog) actions.commitNameHtml(project.id, e.currentTarget);
            }}
            onKeyDown={(e) => actions.onNameKeyDown(project.id, e)}
            onPaste={actions.onNamePaste}
            onMouseDown={(e) => e.stopPropagation()}
            // Double clicking to select a word must not open the editor.
            onDoubleClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => actions.onNameContextMenu(project.id, e)}
            title="Selecciona texto y presiona Ctrl/Cmd + K (o clic derecho) para enlazar"
            style={{ ...cardName, outline: "none", userSelect: "text" }}
          />
        ) : (
          <span
            title={project.name}
            style={cardName}
            dangerouslySetInnerHTML={{
              __html: project.nameHtml || escapeHtml(project.name),
            }}
          />
        )}
        <Star
          size={15}
          fill={project.favorite ? "#1c1c1a" : "none"}
          stroke={project.favorite ? "#1c1c1a" : "#8a8a83"}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleFavorite(project.id);
          }}
        />
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "#ecece8",
          overflow: "hidden",
          marginTop: 12,
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: meta.color }} />
      </div>
      <div style={cardMeta}>
        {children.length
          ? `${done} de ${children.length} tarea${children.length > 1 ? "s" : ""}`
          : "Sin tareas"}{" "}
        · {formatRelative(project.modifiedAt).toLowerCase()}
      </div>
    </div>
  );
}

function ObjectiveCard({
  app,
  objective,
  register,
}: {
  app: OmniOrganize;
  objective: Objective;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const { state, graph, actions, setNameEl } = app;
  const { eff } = graph.statusResolver();
  const meta = OBJECTIVE_STATUS_META[objective.status];
  const linked = objective.linkedProjectIds || [];
  const done = linked.filter((id) => eff(id) === "completada").length;
  const editing = state.editingObjectiveNameId === objective.id;

  return (
    <div
      ref={(el) => register(objective.id, el)}
      data-card-kind="objective"
      data-card-id={objective.id}
      onContextMenu={(e) => actions.openObjectiveMenu(objective.id, e)}
      onDoubleClick={() => actions.startEditObjectiveName(objective.id)}
      onMouseEnter={() => actions.setHoverCard({ kind: "objective", id: objective.id })}
      onMouseLeave={() => actions.setHoverCard(null)}
      style={cardShell(highlightOf(app, "objective", objective.id))}
    >
      <div style={statusBand(meta.color)} />
      <div style={rowTop}>
        {editing ? (
          <div
            contentEditable
            suppressContentEditableWarning
            ref={setNameEl}
            onBlur={(e) => {
              if (!state.linkDialog) actions.commitObjectiveName(objective.id, e.currentTarget);
            }}
            onKeyDown={(e) => actions.onNameKeyDown(objective.id, e)}
            onPaste={actions.onNamePaste}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => actions.onNameContextMenu(objective.id, e)}
            title="Selecciona texto y presiona Ctrl/Cmd + K (o clic derecho) para enlazar"
            // The card blocks selection so a stray drag does nothing; the name
            // being edited has to allow it again.
            style={{ ...cardName, outline: "none", userSelect: "text" }}
          />
        ) : (
          <span
            title={objective.name}
            style={cardName}
            dangerouslySetInnerHTML={{
              __html: objective.nameHtml || escapeHtml(objective.name),
            }}
          />
        )}
        <Star
          size={15}
          fill={objective.favorite ? "#1c1c1a" : "none"}
          stroke={objective.favorite ? "#1c1c1a" : "#8a8a83"}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleObjectiveFavorite(objective.id);
          }}
        />
      </div>
      {/* No progress bar: an objective's status is never derived. */}
      <div style={{ ...cardMeta, marginTop: 10, color: "#55554f" }}>
        {meta.label} ·{" "}
        {linked.length
          ? `${linked.length} proyecto${linked.length > 1 ? "s" : ""} vinculado${
              linked.length > 1 ? "s" : ""
            }`
          : "sin proyectos vinculados"}
      </div>
      <div style={{ ...cardMeta, marginTop: 4 }}>
        {done} de {linked.length} completado{linked.length === 1 ? "" : "s"} ·{" "}
        {formatRelative(objective.modifiedAt).toLowerCase()}
      </div>
    </div>
  );
}

const rowTop: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
};

const cardName: CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  color: "#1c1c1a",
  flex: 1,
  minWidth: 0,
  // Wraps instead of truncating: a project or objective always shows its full
  // name, however long it is.
  whiteSpace: "normal",
  overflowWrap: "break-word",
};

const cardMeta: CSSProperties = {
  fontSize: 13,
  color: "#b0b0aa",
  marginTop: 8,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const columnBtn: CSSProperties = {
  border: "0.5px solid #d8d8d4",
  background: "#fff",
  color: "#55554f",
  fontSize: 13,
  height: 26,
  padding: "0 12px",
  borderRadius: 999,
  cursor: "pointer",
};
