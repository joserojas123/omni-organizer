"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { Area } from "@omni-organize/shared";
import { isProject } from "@omni-organize/shared";
import { STATUS_META, formatRelative, type TaskStatus } from "@/lib/engine";
import type { OmniOrganize } from "@/hooks/useOmniOrganize";
import { BOARD_MIN_W, HomeBoard } from "./HomeBoard";
import { ChevronRight, Star } from "./icons";

const STATUS_ORDER: TaskStatus[] = [
  "pendiente",
  "en_progreso",
  "bloqueada",
  "completada",
];

/** The green tint of the area strip — the existing "completada" tint, reused. */
const AREA_TINT = STATUS_META.completada.tint;

export function HomeScreen({ app }: { app: OmniOrganize }) {
  const { state, graph, actions } = app;

  const padH = state.narrow ? "14px 16px" : "18px 28px";
  const padBody = state.narrow ? "16px" : "18px 28px 28px";

  const area = state.areas.find((a) => a.id === state.currentAreaId) ?? null;
  const q = state.search.trim().toLowerCase();

  /* Projects and objectives of the selected area — nothing ever crosses areas. */
  const projects = graph.tasks
    .filter((t) => isProject(t) && t.areaId === area?.id)
    .filter((t) => (!state.favoritesOnly || t.favorite) && graph.matches(t, q))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  const objectives = state.objectives
    .filter((o) => o.areaId === area?.id)
    .filter(
      (o) =>
        (!state.favoritesOnly || o.favorite) && (!q || o.name.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: padH,
          borderBottom: "0.5px solid #e2e2df",
          flexShrink: 0,
        }}
      >
        <div
          onClick={actions.goHome}
          style={{
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          Omni organize
        </div>
        <input
          value={state.search}
          onChange={(e) => actions.onSearchChange(e.target.value)}
          placeholder="Buscar en el área..."
          style={{
            flex: 1,
            minWidth: 140,
            maxWidth: 360,
            border: "0.5px solid #e2e2df",
            background: "#fff",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            color: "#1c1c1a",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <button
            onClick={actions.toggleFavoritesOnly}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: `0.5px solid ${state.favoritesOnly ? "#1c1c1a" : "#d8d8d4"}`,
              background: state.favoritesOnly ? "#1c1c1a" : "#fff",
              color: state.favoritesOnly ? "#fff" : "#55554f",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Star
              size={12}
              fill={state.favoritesOnly ? "#fff" : "none"}
              stroke={state.favoritesOnly ? "#fff" : "#8a8a83"}
            />
            Favoritos
          </button>
          <div style={avatar}>A</div>
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
        <div style={{ minWidth: BOARD_MIN_W, padding: padBody }}>
          {area ? (
            <>
              <AreaStrip app={app} area={area} />
              <div style={{ height: 20 }} />
              <HomeBoard app={app} projects={projects} objectives={objectives} />
              <div style={{ height: 28 }} />
              <ActivitiesByStatus app={app} areaName={area.name} />
            </>
          ) : (
            <EmptyAreas app={app} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Area strip ──────────────────────────────────────────────────────── */

function AreaStrip({ app, area }: { app: OmniOrganize; area: Area }) {
  const { state, actions } = app;
  const others = [...state.areas].sort((a, b) => b.modifiedAt - a.modifiedAt);
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const wantsFocus = state.editingAreaNameId === area.id;

  /* A freshly created area opens with its placeholder name selected, so typing
     replaces it in one go instead of forcing a manual select-all. */
  useEffect(() => {
    const el = nameRef.current;
    if (!wantsFocus || !el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    actions.stopEditAreaName();
  }, [wantsFocus, actions]);

  return (
    <div style={{ position: "relative" }}>
      <div style={areaStripGrid}>
        {/* Empty first grid track: it mirrors the controls on the right so the
            name lands dead center of the strip, not center of the free space. */}
        <div />
        <div style={{ minWidth: 0, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span
              ref={nameRef}
              contentEditable
              suppressContentEditableWarning
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => actions.openAreaMenu(area.id, e)}
              onBlur={(e) => actions.renameArea(area.id, e.currentTarget.innerText)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                (e.currentTarget as HTMLElement).blur();
              }}
              title="Clic derecho para eliminar el área"
              style={{ fontSize: 18, fontWeight: 500, outline: "none", cursor: "text" }}
            >
              {area.name}
            </span>
            {/* The dropdown only navigates between existing areas; it never creates. */}
            <ChevronRight
              size={16}
              style={{ cursor: "pointer", transform: state.areaMenuOpen ? "rotate(90deg)" : "none" }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                actions.toggleAreaMenu();
              }}
            />
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={(e) => actions.describeArea(area.id, e.currentTarget.innerText)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              (e.currentTarget as HTMLElement).blur();
            }}
            style={{
              fontSize: 13,
              color: "#55554f",
              marginTop: 3,
              outline: "none",
              cursor: "text",
              minHeight: 18,
            }}
          >
            {area.description ?? ""}
          </div>
        </div>

        {/* Deleting lives inside the dropdown, next to the area it removes —
            never as a loose icon that wipes whatever area happens to be open. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button onClick={actions.createArea} style={newAreaBtn}>
            Nueva área
          </button>
        </div>
      </div>

      {state.areaMenuOpen && (
        <div onMouseDown={(e) => e.stopPropagation()} style={areaMenuBox}>
          {others.map((a) => (
            <div
              key={a.id}
              onClick={() => actions.selectArea(a.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                textAlign: "center",
                color: a.id === area.id ? "#1c1c1a" : "#55554f",
                fontWeight: a.id === area.id ? 500 : 400,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f3f0")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {a.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Empty state: no areas at all ────────────────────────────────────── */

function EmptyAreas({ app }: { app: OmniOrganize }) {
  return (
    <>
      <div style={areaStripBox}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 500 }}>Aún no tienes áreas</div>
          <div style={{ fontSize: 13, color: "#55554f", marginTop: 3 }}>
            Un área es un ámbito permanente: Salud, Finanzas, AxelyaLabs. No se
            completa nunca; solo se mantiene.
          </div>
        </div>
        <button onClick={app.actions.createArea} style={newAreaBtn}>
          Nueva área
        </button>
      </div>

      {/* No dropdown and no two-column grid: there is nothing to choose between
          and nowhere for projects or objectives to live yet. */}
      <div
        style={{
          marginTop: 20,
          border: "1px dashed #d8d8d4",
          borderRadius: 12,
          padding: "48px 24px",
          textAlign: "center",
          fontSize: 13,
          lineHeight: 1.6,
          color: "#8a8a83",
        }}
      >
        Los proyectos y los objetivos viven dentro de un área.
        <br />
        Crea la primera para empezar a organizarlos.
      </div>
    </>
  );
}

/* ── Bottom section: activities by status ────────────────────────────── */

function ActivitiesByStatus({ app, areaName }: { app: OmniOrganize; areaName: string }) {
  const { state, graph, actions } = app;
  const { eff } = graph.statusResolver();
  const areaId = state.currentAreaId;

  /** Tasks of the selected area, at every level. Objectives are not tasks, so
   *  they never show up here — their only visible home is the right column. */
  const inArea = graph.tasks.filter((t) => {
    let cur = t;
    const seen = new Set<string>();
    while (cur.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const parent = graph.byId(cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    return isProject(cur) && cur.areaId === areaId;
  });

  const pathOf = (id: string): string => {
    const parts: string[] = [];
    let cur = graph.byId(id)?.parentId ? graph.byId(graph.byId(id)!.parentId!) : null;
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentId ? graph.byId(cur.parentId) : null;
    }
    // One level more than before: the area now heads the path.
    return [areaName, ...parts].join(" - ");
  };

  const rows = inArea
    .filter((t) => eff(t.id) === state.homeFilter)
    .sort((p, q) => (q.modifiedAt || 0) - (p.modifiedAt || 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#1c1c1a" }}>
          Actividades por estado
        </span>
        <span style={{ fontSize: 11, color: "#b0b0aa" }}>todos los niveles del área</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 2px 4px" }}>
        {STATUS_ORDER.map((v) => {
          const on = state.homeFilter === v;
          const count = inArea.filter((t) => eff(t.id) === v).length;
          return (
            <div
              key={v}
              onClick={() => actions.setHomeFilter(v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: `0.5px solid ${on ? "#1c1c1a" : "#d8d8d4"}`,
                background: on ? "#1c1c1a" : "#fff",
                color: on ? "#fff" : "#55554f",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: STATUS_META[v].color,
                }}
              />
              {STATUS_META[v].label} ({count})
            </div>
          );
        })}
      </div>

      <div
        style={{
          border: "0.5px solid #e2e2df",
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ ...tableRow, background: "#fafaf9", borderBottom: "0.5px solid #ececea" }}>
          <span style={{ fontSize: 11, color: "#8a8a83" }}>
            {STATUS_META[state.homeFilter].label}
          </span>
          <span style={{ fontSize: 11, color: "#8a8a83", textAlign: "right" }}>Modificada</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: "16px 14px", fontSize: 12, color: "#b0b0aa" }}>
            Sin tareas en este estado.
          </div>
        ) : (
          rows.map((t) => {
            const full = pathOf(t.id) + " - " + t.name;
            const root = (() => {
              let cur = t;
              while (cur.parentId) cur = graph.byId(cur.parentId)!;
              return cur;
            })();
            return (
              <div
                key={t.id}
                onDoubleClick={() => actions.openEditor(root.id)}
                style={{
                  ...tableRow,
                  borderBottom: "0.5px solid #f3f3f0",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: STATUS_META[eff(t.id)].color,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    title={full}
                    style={{
                      fontSize: 12,
                      color: "#1c1c1a",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {full}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "#b0b0aa", textAlign: "right" }}>
                  {formatRelative(t.modifiedAt)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const areaStripBase: CSSProperties = {
  gap: 16,
  background: AREA_TINT,
  border: "0.5px solid #cfe0cf",
  borderRadius: 12,
  padding: "14px 16px",
};

/** Empty state: nothing to center, so the text sits left and the button right. */
const areaStripBox: CSSProperties = {
  ...areaStripBase,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
};

/**
 * With an area selected the name is centered in the strip. The two `1fr` tracks
 * are what centers it: the empty one on the left balances the controls on the
 * right, so the name is centered against the whole strip rather than against
 * the space the buttons happen to leave.
 */
const areaStripGrid: CSSProperties = {
  ...areaStripBase,
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
  alignItems: "center",
};

/**
 * The list drops right under the chevron that opens it. Since the name and its
 * chevron are centered in the strip, centering the menu on the strip puts it
 * exactly under the arrow.
 */
const areaMenuBox: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: "50%",
  transform: "translateX(-50%)",
  marginTop: 4,
  zIndex: 40,
  minWidth: 200,
  background: "#fff",
  border: "0.5px solid #e2e2df",
  borderRadius: 8,
  padding: 4,
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const tableRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 90px",
  gap: 8,
  alignItems: "center",
  padding: "9px 14px",
};

const newAreaBtn: CSSProperties = {
  border: "none",
  background: "#1c1c1a",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  padding: "8px 14px",
  borderRadius: 8,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

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
};
