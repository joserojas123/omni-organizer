"use client";

import { useOmniOrganizer } from "@/hooks/useOmniOrganizer";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_META,
  type ObjectiveStatus,
} from "@omni-organizer/shared";
import { STATUS_META, type TaskStatus } from "@/lib/engine";
import { HomeScreen } from "./HomeScreen";
import { EditorScreen } from "./EditorScreen";
import { Plus, Trash } from "./icons";

const STATUS_ORDER: TaskStatus[] = [
  "pendiente",
  "en_progreso",
  "bloqueada",
  "completada",
];

export function OmniOrganizer() {
  const app = useOmniOrganizer();
  const { state, graph, actions } = app;

  const { eff, blockers, canComplete, activeChildren } = graph.statusResolver();
  const menu = state.contextMenu;

  const confirmName = (() => {
    const req = state.confirmDelete;
    if (!req) return "";
    if (req.kind === "objective")
      return state.objectives.find((o) => o.id === req.id)?.name ?? "";
    if (req.kind === "area") return state.areas.find((a) => a.id === req.id)?.name ?? "";
    return graph.byId(req.id)?.name ?? "";
  })();

  /* An area only reaches this dialog when it is already empty — the rule that
     refuses one with content answers before there is anything to confirm. */
  const confirmBody = {
    objective:
      "Los proyectos vinculados no se eliminan; solo se pierde el vínculo. Puedes revertirlo con Ctrl+Z.",
    area: "El área está vacía, así que no se pierde ningún proyecto ni objetivo. Puedes revertirlo con Ctrl+Z.",
    task: "Se eliminarán también todas sus tareas anidadas y desaparecerá de los objetivos que lo tenían vinculado. Puedes revertirlo con Ctrl+Z.",
  }[state.confirmDelete?.kind ?? "task"];

  const menuBlocked =
    menu?.type === "task" && menu.id ? blockers(menu.id).length > 0 : false;

  const menuAutoActive =
    menu?.type === "task" && menu.id && !menuBlocked
      ? activeChildren(menu.id).length > 0
      : false;

  /* `bloqueada` never applies to a Project, so it is not even offered there —
     otherwise setting it by hand would paint a project red, which the model
     says can never happen. Inside a project, tasks keep the full list. */
  const menuIsProject =
    menu?.type === "task" && menu.id ? graph.byId(menu.id)?.parentId === null : false;

  const statusOptions =
    menu?.type === "task" && menu.id && !menuBlocked && !menuAutoActive
      ? STATUS_ORDER.filter(
          (v) =>
            v !== eff(menu.id!) &&
            (v !== "bloqueada" || !menuIsProject) &&
            (v !== "completada" || canComplete(menu.id!)),
        )
      : [];

  /* Every transition is valid, so the menu only hides the current status. */
  const objectiveStatus =
    menu?.type === "objective" && menu.id
      ? state.objectives.find((o) => o.id === menu.id)?.status
      : undefined;
  const objectiveOptions: ObjectiveStatus[] = objectiveStatus
    ? OBJECTIVE_STATUSES.filter((v) => v !== objectiveStatus)
    : [];

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f7f7f6",
        color: "#1c1c1a",
        overflow: "hidden",
      }}
    >
      {state.screen === "home" ? <HomeScreen app={app} /> : <EditorScreen app={app} />}

      {/* No hay aviso de "Guardado": el guardado es silencioso y automático.
          El único mensaje flotante es el de abajo, que explica por qué se
          rechazó una operación. */}

      {/* ── Notice: why an operation was refused ── */}
      {state.notice && (
        <div
          onClick={actions.dismissNotice}
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 75,
            maxWidth: 460,
            background: "#fff",
            border: "0.5px solid #e2e2df",
            borderLeft: "3px solid #ef4444",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#1c1c1a",
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {state.notice}
        </div>
      )}

      {/* ── Link dialog ── */}
      {state.linkDialog && (
        <div style={overlayStyle(85)} onMouseDown={(e) => e.stopPropagation()}>
          <div style={dialogStyle(380)}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#1c1c1a" }}>
              Enlazar “{state.linkDialog.text}”
            </div>
            <input
              value={state.linkDialog.url}
              onChange={(e) => actions.onLinkUrlChange(e.target.value)}
              onKeyDown={actions.onLinkKeyDown}
              autoFocus
              placeholder="https://"
              style={{
                border: "0.5px solid #d8d8d4",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                color: "#1c1c1a",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={actions.removeLinkFromSelection} style={ghostBtn}>
                Quitar enlace
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={actions.cancelLinkDialog} style={ghostBtn}>
                  Cancelar
                </button>
                <button onClick={actions.applyLink} style={darkBtn}>
                  Enlazar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {state.confirmDelete && (
        <div style={overlayStyle(80)} onMouseDown={(e) => e.stopPropagation()}>
          <div style={dialogStyle(340)}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#1c1c1a" }}>
              Eliminar “{confirmName}”
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "#8a8a83" }}>
              {confirmBody}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={actions.cancelDelete} style={ghostBtn}>
                Cancelar
              </button>
              <button
                onClick={actions.confirmDeleteNow}
                style={{ ...darkBtn, background: "#ef4444" }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Context menu ── */}
      {menu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            zIndex: 50,
            background: "#fff",
            border: "0.5px solid #e2e2df",
            borderRadius: 8,
            padding: 4,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          {state.screen === "editor" && menu.type !== "objective" && (
            <MenuRow onClick={actions.addTaskFromMenu} icon={<Plus />}>
              {menu.type === "task" ? "Agregar tarea dentro" : "Agregar tarea"}
            </MenuRow>
          )}

          {menu.type === "task" && menu.id && (
            <>
              {menuBlocked ? (
                <div style={menuLabel}>Bloqueada por: {blockers(menu.id).join(", ")}</div>
              ) : menuAutoActive ? null : (
                <>
                  <div style={menuLabel}>Estado</div>
                  {statusOptions.map((v) => (
                    <StatusRow
                      key={v}
                      color={STATUS_META[v].color}
                      label={STATUS_META[v].label}
                      onClick={() => actions.setContextStatus(menu.id!, v)}
                    />
                  ))}
                </>
              )}
              <div style={separator} />
              {state.screen === "editor" ? (
                <MenuRow onClick={() => actions.deleteTask(menu.id!)} icon={<Trash size={12} />}>
                  Eliminar tarea
                </MenuRow>
              ) : (
                /* On the home board the same node is a Project, and deleting it
                   takes its whole canvas with it — so it asks first. */
                <MenuRow
                  onClick={() => actions.requestDelete({ kind: "task", id: menu.id! })}
                  icon={<Trash size={12} />}
                >
                  Eliminar proyecto
                </MenuRow>
              )}
            </>
          )}

          {/* An area has no status to offer — deleting it is the only thing
              its menu does. */}
          {menu.type === "area" && menu.id && (
            <MenuRow
              onClick={() => actions.requestDeleteArea(menu.id!)}
              icon={<Trash size={12} />}
            >
              Eliminar área
            </MenuRow>
          )}

          {menu.type === "objective" && menu.id && (
            <>
              <div style={menuLabel}>Estado</div>
              {objectiveOptions.map((v) => (
                <StatusRow
                  key={v}
                  color={OBJECTIVE_STATUS_META[v].color}
                  label={OBJECTIVE_STATUS_META[v].label}
                  onClick={() => actions.setObjectiveStatus(menu.id!, v)}
                />
              ))}
              <div style={separator} />
              <MenuRow
                onClick={() => actions.requestDelete({ kind: "objective", id: menu.id! })}
                icon={<Trash size={12} />}
              >
                Eliminar objetivo
              </MenuRow>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusRow({
  color,
  label,
  onClick,
}: {
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "#1c1c1a",
        padding: "6px 12px",
        borderRadius: 6,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f3f0")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {label}
    </div>
  );
}

function MenuRow({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "#1c1c1a",
        padding: "7px 12px",
        borderRadius: 6,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f3f0")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      {children}
    </div>
  );
}

const menuLabel: React.CSSProperties = {
  fontSize: 10,
  color: "#b0b0aa",
  padding: "3px 12px 5px",
};

const separator: React.CSSProperties = {
  height: "0.5px",
  background: "#ececea",
  margin: "4px 6px",
};

const overlayStyle = (z: number): React.CSSProperties => ({
  position: "fixed",
  inset: 0,
  zIndex: z,
  background: "rgba(28,28,26,0.28)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const dialogStyle = (w: number): React.CSSProperties => ({
  background: "#fff",
  borderRadius: 12,
  padding: "22px 24px",
  width: w,
  boxShadow: "0 18px 48px rgba(0,0,0,0.2)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
});

const ghostBtn: React.CSSProperties = {
  border: "0.5px solid #d8d8d4",
  background: "#fff",
  color: "#55554f",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
};

const darkBtn: React.CSSProperties = {
  border: "none",
  background: "#1c1c1a",
  color: "#fff",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
};
