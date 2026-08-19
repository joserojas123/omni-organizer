"use client";

import type { CSSProperties } from "react";
import type { LayoutNode } from "@/lib/engine";
import { escapeHtml } from "@/lib/engine";
import type { OmniOrganizer } from "@/hooks/useOmniOrganizer";
import { ArrowRight, ChevronRight } from "./icons";

export interface NodeView {
  node: LayoutNode;
  boxStyle: CSSProperties;
  statusTint: string;
  statusTitle: string;
  isEditingName: boolean;
  showChevron: boolean;
  showResize: boolean;
  showSeqHandle: boolean;
  handleTop: number;
  nameAlign: "center" | "flex-start";
  namePadding: string;
  nameWrap: "nowrap" | "normal";
}

export function CanvasNode({ app, view }: { app: OmniOrganizer; view: NodeView }) {
  const { actions, setNameEl, state } = app;
  const {
    node: n,
    boxStyle,
    statusTint,
    statusTitle,
    isEditingName,
    showChevron,
    showResize,
    showSeqHandle,
    handleTop,
    nameAlign,
    namePadding,
    nameWrap,
  } = view;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onMouseDown={(e) => actions.onNodeMouseDown(n.id, e)}
      onDoubleClick={(e) => actions.onNodeDoubleClick(n.id, e)}
      onContextMenu={(e) => actions.openContextMenu(n.id, e)}
      onMouseEnter={(e) => {
        e.stopPropagation();
        actions.setHover(n.id);
      }}
      onMouseLeave={() => actions.setHover(null)}
      style={{
        position: "absolute",
        left: n.x,
        top: n.y,
        width: n.w,
        height: n.h,
        borderRadius: 10,
        cursor: "grab",
        zIndex: n.depth + 1,
        ...boxStyle,
      }}
    >
      <div
        title={statusTitle}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 26,
          borderRadius: "10px 0 0 10px",
          background: statusTint,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          minHeight: 34,
          display: "flex",
          alignItems: nameAlign,
          gap: 6,
          padding: namePadding,
        }}
      >
        {showChevron && (
          <ChevronRight
            size={11}
            style={{
              cursor: "pointer",
              transform: n.task.collapsed ? "rotate(0deg)" : "rotate(90deg)",
              flexShrink: 0,
            }}
            onClick={(e) => {
              e.stopPropagation();
              actions.toggleCollapse(n.id);
            }}
            onMouseDown={stop}
          />
        )}
        {isEditingName ? (
          <div
            contentEditable
            suppressContentEditableWarning
            ref={setNameEl}
            onBlur={(e) => {
              if (!state.linkDialog) actions.commitNameHtml(n.id, e.currentTarget);
            }}
            onKeyDown={(e) => actions.onNameKeyDown(n.id, e)}
            onPaste={actions.onNamePaste}
            onMouseDown={stop}
            onContextMenu={(e) => actions.onNameContextMenu(n.id, e)}
            title="Selecciona texto y presiona Ctrl/Cmd + K (o clic derecho) para enlazar"
            style={{
              fontSize: 12,
              lineHeight: "16px",
              border: "none",
              outline: "none",
              background: "transparent",
              flex: 1,
              minWidth: 0,
              whiteSpace: nameWrap,
              overflowWrap: "break-word",
              overflow: "hidden",
            }}
          />
        ) : (
          <span
            onDoubleClick={(e) => actions.onNodeDoubleClick(n.id, e)}
            title={n.task.nameHtml ? "Ctrl + clic para abrir el enlace" : undefined}
            style={{
              fontSize: 12,
              lineHeight: "16px",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              whiteSpace: nameWrap,
              overflowWrap: "break-word",
            }}
            dangerouslySetInnerHTML={{
              __html: n.task.nameHtml || escapeHtml(n.task.name),
            }}
          />
        )}
      </div>

      {showResize && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            onMouseDown={(e) => actions.onResizeMouseDown(n.id, "e", e)}
            style={{ position: "absolute", right: -3, top: 16, bottom: 12, width: 8, cursor: "ew-resize", pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => actions.onResizeMouseDown(n.id, "s", e)}
            style={{ position: "absolute", left: 12, right: 12, bottom: -3, height: 8, cursor: "ns-resize", pointerEvents: "auto" }}
          />
          <div
            onMouseDown={(e) => actions.onResizeMouseDown(n.id, "se", e)}
            style={{ position: "absolute", right: -4, bottom: -4, width: 14, height: 14, cursor: "nwse-resize", pointerEvents: "auto" }}
          />
        </div>
      )}

      {showSeqHandle && (
        <div
          onMouseDown={(e) => actions.onSeqHandleMouseDown(n.id, e)}
          style={{
            position: "absolute",
            right: -9,
            top: handleTop,
            width: 18,
            height: 18,
            marginTop: -9,
            borderRadius: "50%",
            background: "rgba(28,28,26,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "crosshair",
            zIndex: 950,
          }}
        >
          <ArrowRight />
        </div>
      )}
    </div>
  );
}
