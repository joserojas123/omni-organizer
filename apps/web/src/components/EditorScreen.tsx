"use client";

import type { CSSProperties } from "react";
import {
  HEADER_H,
  INSET_X,
  LEAF_H,
  LEAF_W,
  STATUS_META,
  type LayoutNode,
  type LayoutResult,
} from "@/lib/engine";
import type { OmniOrganize } from "@/hooks/useOmniOrganize";
import { CanvasNode, type NodeView } from "./CanvasNode";
import { Trash } from "./icons";

export function EditorScreen({ app }: { app: OmniOrganize }) {
  const { state, graph, actions, setCanvasEl } = app;
  const { eff, blockers } = graph.statusResolver();
  const editingTaskId = state.editingTaskId;
  const editingTask = editingTaskId ? graph.byId(editingTaskId) : null;
  const drag = state.drag;

  /* Breadcrumb: `Área › Proyecto`. Opening a project is exactly what opening a
     root task always was, so nothing else about this screen changes. */
  const crumbs: string[] = [];
  if (editingTask) {
    let cur = editingTask.parentId ? graph.byId(editingTask.parentId) : null;
    let root = editingTask;
    while (cur) {
      crumbs.unshift(cur.name);
      root = cur;
      cur = cur.parentId ? graph.byId(cur.parentId) : null;
    }
    const areaName = state.areas.find((a) => a.id === root.areaId)?.name;
    if (areaName) crumbs.unshift(areaName);
  }

  const skipId = drag && drag.type === "move" ? drag.id : null;
  const l: LayoutResult = editingTaskId
    ? graph.layout(editingTaskId, skipId)
    : { nodes: [], map: {} };

  /* While moving, the dragged subtree is drawn on top at the pointer position. */
  if (skipId && drag && drag.type === "move") {
    const dl = graph.layout(editingTaskId, null);
    const push = (id: string, ax: number, ay: number, depth: number) => {
      const t = graph.byId(id)!;
      const ks = graph.getChildren(id);
      const n0 = dl.map[id];
      const isContainer = ks.length > 0 && !t.collapsed;
      const node: LayoutNode = {
        id,
        task: t,
        x: ax,
        y: ay,
        w: n0 ? n0.w : LEAF_W,
        h: n0 ? n0.h : LEAF_H,
        depth,
        isContainer,
        hasKids: ks.length > 0,
      };
      l.nodes.push(node);
      l.map[id] = node;
      if (isContainer)
        ks.forEach((k) => push(k.id, ax + INSET_X + k.x, ay + HEADER_H + k.y, depth + 1));
    };
    push(skipId, drag.absX, drag.absY, 500);
  }

  /* ── Arrow segments ── */
  const sel = state.pressedId;
  const arrowSegments = (editingTaskId ? graph.arrowsFor(l) : []).map((seg) => {
    const key = seg.from + ">" + seg.to;
    const inChain = !sel || seg.from === sel || seg.to === sel;
    const hot = state.hoverArrow === key;
    return {
      key,
      d: seg.d,
      from: seg.from,
      to: seg.to,
      stroke: hot || (sel && inChain) ? "#1c1c1a" : "#a8a8a1",
      width: hot ? 2 : 1.3,
      opacity: inChain ? 1 : 0.18,
      marker: hot || (sel && inChain) ? "arrowheadOn" : "arrowhead",
    };
  });

  /* ── Sequence drag line ── */
  const seqDragActive = !!(drag && drag.type === "seq");
  let seqDragLineD = "";
  if (seqDragActive && drag && drag.type === "seq") {
    const n = l.map[drag.sourceId];
    if (n) {
      const x1 = n.x + n.w;
      const y1 = n.y + graph.handleTopOf(n);
      const x2 = drag.mouseX;
      const y2 = drag.mouseY;
      const c = Math.max(36, Math.abs(x2 - x1) / 2);
      seqDragLineD = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
    }
  }
  const seqDragStroke = drag && drag.type === "seq" && drag.invalid ? "#ef4444" : "#a8a8a1";

  /* ── Node views ── */
  const nodeViews: NodeView[] = l.nodes.map((n) => {
    const isDropTarget = state.dropTargetId === n.id;
    const isDragging = skipId === n.id;
    const boxStyle: CSSProperties = n.isContainer
      ? { background: "#f1f1ee", border: `0.5px solid ${isDropTarget ? "#1c1c1a" : "#d9d9d4"}` }
      : { background: "#fff", border: `0.5px solid ${isDropTarget ? "#1c1c1a" : "#e2e2df"}` };
    if (isDragging) {
      boxStyle.opacity = 0.6;
      boxStyle.borderStyle = "dashed";
    }
    // Last matching shadow wins (mirrors the export's string concatenation).
    let shadow: string | undefined;
    if (state.pressedId === n.id && !isDropTarget) shadow = "0 0 0 1px #1c1c1a";
    if (seqDragActive && drag && drag.type === "seq") {
      if (drag.sourceId === n.id) shadow = "0 0 0 1.5px #1c1c1a";
      if (drag.overId === n.id) shadow = drag.invalid ? "0 0 0 1.5px #ef4444" : "0 0 0 1.5px #1c1c1a";
    }
    if (shadow) boxStyle.boxShadow = shadow;

    return {
      node: n,
      boxStyle,
      statusTint: STATUS_META[eff(n.id)].tint,
      statusTitle: blockers(n.id).length
        ? "Bloqueada por: " + blockers(n.id).join(", ")
        : STATUS_META[eff(n.id)].label,
      isEditingName: state.editingNameId === n.id,
      showChevron: n.hasKids,
      showResize: n.isContainer,
      showSeqHandle: state.hoverId === n.id && !state.drag,
      handleTop: graph.handleTopOf(n),
      nameAlign: n.hasKids ? "center" : "flex-start",
      namePadding: n.hasKids ? "0 10px 0 34px" : "11px 10px 11px 34px",
      nameWrap: n.hasKids ? "nowrap" : "normal",
    };
  });

  const editingStatusTint = editingTask
    ? STATUS_META[eff(editingTask.id)].tint
    : "#f7f7f6";
  const padEditor = state.narrow ? "12px 14px" : "14px 28px 16px";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: padEditor,
          borderBottom: "0.5px solid #e2e2df",
          flexShrink: 0,
          background: editingStatusTint,
        }}
      >
        <div
          onClick={actions.goHome}
          onMouseDown={(e) => e.stopPropagation()}
          title="Volver al inicio"
          style={{
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            color: "#8a8a83",
            padding: "8px 12px",
            margin: "-8px -12px",
            borderRadius: 8,
          }}
        >
          Omni organize
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              maxWidth: "100%",
              minWidth: 0,
            }}
          >
            {crumbs.map((c) => (
              <span
                key={c}
                style={{
                  fontSize: 12,
                  color: "#8a8a83",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {c} ›
              </span>
            ))}
            <input
              value={editingTask ? editingTask.name : ""}
              onChange={(e) => actions.onEditingNameChange(e.target.value)}
              style={{
                textAlign: crumbs.length ? "left" : "center",
                border: "none",
                background: "transparent",
                fontSize: 14,
                fontWeight: 500,
                color: "#1c1c1a",
                outline: "none",
                width: "100%",
                maxWidth: 320,
                minWidth: 120,
              }}
            />
          </div>

          {/* The project's description, right under its name. Empty shows only
              its placeholder, so it stays out of the way until it is used. */}
          <input
            value={editingTask?.description ?? ""}
            onChange={(e) => actions.onEditingDescriptionChange(e.target.value)}
            placeholder="Añade una descripción"
            title="Descripción del proyecto"
            style={{
              textAlign: "center",
              border: "none",
              background: "transparent",
              fontSize: 12,
              color: "#55554f",
              outline: "none",
              width: "100%",
              maxWidth: 420,
              minWidth: 160,
            }}
          />
          <button
            onClick={() => editingTaskId && actions.requestDelete({ kind: "task", id: editingTaskId })}
            title="Eliminar"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "0.5px solid #d8d8d4",
              background: "#fff",
              color: "#55554f",
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <Trash size={12} />
            Eliminar
          </button>
        </div>
        <div style={avatar}>A</div>
      </div>

      {/* canvas */}
      <div
        ref={setCanvasEl}
        onMouseDown={actions.onCanvasMouseDown}
        onContextMenu={actions.onCanvasContextMenu}
        style={{
          position: "relative",
          flex: 1,
          overflow: "hidden",
          backgroundColor: "#f7f7f6",
          backgroundImage: "radial-gradient(#dcdcd8 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {l.nodes.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              fontSize: 13,
              color: "#b0b0aa",
              pointerEvents: "none",
            }}
          >
            Clic derecho en el lienzo para agregar una tarea
          </div>
        )}

        <div
          data-canvas-layer="1"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translate(${state.offset.x}px, ${state.offset.y}px) scale(${state.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <svg
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 1,
              height: 1,
              overflow: "visible",
              pointerEvents: "none",
              zIndex: 900,
            }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#a8a8a1" />
              </marker>
              <marker id="arrowheadOn" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#1c1c1a" />
              </marker>
            </defs>
            {arrowSegments.map((seg) => (
              <g key={seg.key} style={{ opacity: seg.opacity, transition: "opacity .15s" }}>
                <path
                  d={seg.d}
                  fill="none"
                  stroke={seg.stroke}
                  strokeWidth={seg.width}
                  markerEnd={`url(#${seg.marker})`}
                />
                <path
                  onDoubleClick={() => actions.removeLink(seg.from, seg.to)}
                  onMouseEnter={() => actions.setHoverArrow(seg.key)}
                  onMouseLeave={() => actions.setHoverArrow(null)}
                  d={seg.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                />
              </g>
            ))}
            {seqDragActive && (
              <path
                d={seqDragLineD}
                fill="none"
                stroke={seqDragStroke}
                strokeWidth={1.3}
                strokeDasharray="4 3"
              />
            )}
          </svg>

          {nodeViews.map((view) => (
            <CanvasNode key={view.node.id} app={app} view={view} />
          ))}
        </div>
      </div>
    </div>
  );
}

const avatar: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  background: "#e2e2df",
  color: "#55554f",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 500,
  flexShrink: 0,
};
