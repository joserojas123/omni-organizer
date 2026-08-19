"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  canDeleteArea,
  canLinkObjective,
  canLinkProjects,
  detachProjects,
  sanitizeNameHtml,
  type Area,
  type Objective,
  type ObjectiveStatus,
  type Task,
  type TaskStatus,
} from "@omni-organizer/shared";
import { HEADER_H, INSET_X, TaskGraph } from "@/lib/engine";
import { buildSeed } from "@/lib/seed";
import { loadAll, saveAll, type Snapshot } from "@/lib/api";

export type Screen = "home" | "editor";

/** What a home card is, for hover / delete / drag purposes. */
export type CardKind = "project" | "objective";

export interface CardRef {
  kind: CardKind;
  id: string;
}

export type Drag =
  | { type: "pan"; mouseX: number; mouseY: number; offX: number; offY: number }
  | {
      type: "move";
      id: string;
      mouseX: number;
      mouseY: number;
      absX: number;
      absY: number;
      origAbsX: number;
      origAbsY: number;
      moved?: boolean;
    }
  | {
      type: "resize";
      id: string;
      edge: "e" | "s" | "se";
      mouseX: number;
      mouseY: number;
      startW: number;
      startH: number;
      minW: number;
      minH: number;
    }
  | {
      type: "seq";
      sourceId: string;
      mouseX: number;
      mouseY: number;
      overId?: string | null;
      invalid?: boolean;
    };

/**
 * Dragging a relation on the home screen. `seq` runs in the left channel
 * (project → project, it has direction) and `link` in the middle one
 * (project ↔ objective, it has none). Coordinates are board-local, so the SVG
 * overlay can draw the line without converting anything.
 */
export interface HomeDrag {
  type: "seq" | "link";
  fromKind: CardKind;
  fromId: string;
  x: number;
  y: number;
  over: CardRef | null;
  invalid: boolean;
}

export interface ContextMenu {
  type: "task" | "canvas" | "objective" | "area";
  id?: string;
  x: number;
  y: number;
  parentId: string | null;
  localX: number;
  localY: number;
}

export interface LinkDialog {
  taskId: string;
  /** Objectives edit their name in the card too, so the dialog serves both. */
  kind: "task" | "objective";
  text: string;
  url: string;
}

export interface DeleteRequest {
  kind: "task" | "objective" | "area";
  id: string;
}

export interface State {
  screen: Screen;
  editingTaskId: string | null;
  areas: Area[];
  tasks: Task[];
  objectives: Objective[];
  /** The home screen always shows one concrete area — there is no "all areas". */
  currentAreaId: string | null;
  areaMenuOpen: boolean;
  /**
   * One-shot trigger: the id of an area whose name should grab focus with its
   * text selected. Set when the area is created so the placeholder can be typed
   * straight over; the strip clears it as soon as it has focused the field.
   */
  editingAreaNameId: string | null;
  search: string;
  favoritesOnly: boolean;
  offset: { x: number; y: number };
  zoom: number;
  drag: Drag | null;
  homeDrag: HomeDrag | null;
  hoverId: string | null;
  hoverCard: CardRef | null;
  hoverCurve: string | null;
  editingNameId: string | null;
  editingObjectiveNameId: string | null;
  contextMenu: ContextMenu | null;
  dropTargetId: string | null;
  notice: string | null;
  confirmDelete: DeleteRequest | null;
  homeFilter: TaskStatus;
  linkDialog: LinkDialog | null;
  narrow: boolean;
  pressedId: string | null;
  hoverArrow: string | null;
}

/** One undo step covers the three collections at once. */
type HistoryEntry = Pick<State, "areas" | "tasks" | "objectives">;

interface Ext {
  history: HistoryEntry[];
  future: HistoryEntry[];
  lastTag: string | null;
  idCounter: number;
  canvasEl: HTMLElement | null;
  boardEl: HTMLElement | null;
  nameEl: HTMLElement | null;
  linkRange: Range | null;
  saved: Snapshot | null;
  savedRef: HistoryEntry | null;
  loaded: boolean;
  lastClickId: string | null;
  lastClickAt: number;
  panned: boolean;
  expandFor: string | null;
  expandTimer: ReturnType<typeof setTimeout> | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
  noticeTimer: ReturnType<typeof setTimeout> | null;
  panTimer: ReturnType<typeof setInterval> | null;
  panVec: { x: number; y: number } | null;
}

function initialState(): State {
  const seed = buildSeed();
  return {
    screen: "home",
    editingTaskId: null,
    areas: seed.areas,
    tasks: seed.tasks,
    objectives: seed.objectives,
    currentAreaId: null,
    areaMenuOpen: false,
    editingAreaNameId: null,
    search: "",
    favoritesOnly: false,
    offset: { x: 0, y: 0 },
    zoom: 1,
    drag: null,
    homeDrag: null,
    hoverId: null,
    hoverCard: null,
    hoverCurve: null,
    editingNameId: null,
    editingObjectiveNameId: null,
    contextMenu: null,
    dropTargetId: null,
    notice: null,
    confirmDelete: null,
    homeFilter: "en_progreso",
    linkDialog: null,
    narrow: typeof window !== "undefined" && window.innerWidth < 900,
    pressedId: null,
    hoverArrow: null,
  };
}

function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface OmniOrganizer {
  state: State;
  graph: TaskGraph;
  setCanvasEl: (el: HTMLElement | null) => void;
  setBoardEl: (el: HTMLElement | null) => void;
  setNameEl: (el: HTMLElement | null) => void;
  actions: Actions;
}

export interface Actions {
  goHome: () => void;
  openEditor: (id: string) => void;
  onSearchChange: (v: string) => void;
  toggleFavoritesOnly: () => void;
  toggleFavorite: (id: string) => void;
  toggleCollapse: (id: string) => void;
  setHomeFilter: (v: TaskStatus) => void;
  setStatus: (id: string, status: TaskStatus) => boolean;
  setHover: (id: string | null) => void;
  setHoverCard: (card: CardRef | null) => void;
  setHoverCurve: (key: string | null) => void;
  /* areas */
  createArea: () => void;
  selectArea: (id: string) => void;
  toggleAreaMenu: () => void;
  closeAreaMenu: () => void;
  renameArea: (id: string, name: string) => void;
  describeArea: (id: string, description: string) => void;
  stopEditAreaName: () => void;
  requestDeleteArea: (id: string) => void;
  /* projects */
  createProject: () => void;
  linkProjects: (fromId: string, toId: string) => void;
  unlinkProjects: (fromId: string, toId: string) => void;
  /* objectives */
  createObjective: () => void;
  setObjectiveStatus: (id: string, status: ObjectiveStatus) => void;
  toggleObjectiveFavorite: (id: string) => void;
  startEditObjectiveName: (id: string) => void;
  commitObjectiveName: (id: string, el: HTMLElement) => void;
  toggleObjectiveLink: (objectiveId: string, projectId: string) => void;
  /* home relations */
  onHomeHandleMouseDown: (type: "seq" | "link", card: CardRef, e: React.MouseEvent) => void;
  /* deletion */
  requestDelete: (req: DeleteRequest) => void;
  cancelDelete: () => void;
  confirmDeleteNow: () => void;
  deleteTask: (id: string) => void;
  dismissNotice: () => void;
  /* names + links */
  onEditingNameChange: (v: string) => void;
  onEditingDescriptionChange: (v: string) => void;
  startEditName: (id: string) => void;
  stopEditName: () => void;
  commitNameHtml: (id: string, el: HTMLElement) => void;
  onNameContextMenu: (id: string, e: React.MouseEvent) => void;
  onNameKeyDown: (id: string, e: React.KeyboardEvent) => void;
  onNamePaste: (e: React.ClipboardEvent) => void;
  applyLink: () => void;
  removeLinkFromSelection: () => void;
  cancelLinkDialog: () => void;
  onLinkUrlChange: (v: string) => void;
  onLinkKeyDown: (e: React.KeyboardEvent) => void;
  /* canvas */
  openContextMenu: (id: string, e: React.MouseEvent) => void;
  openHomeMenu: (id: string, e: React.MouseEvent) => void;
  openAreaMenu: (id: string, e: React.MouseEvent) => void;
  openObjectiveMenu: (id: string, e: React.MouseEvent) => void;
  onCanvasContextMenu: (e: React.MouseEvent) => void;
  onCanvasMouseDown: (e: React.MouseEvent) => void;
  addTaskFromMenu: () => void;
  setContextStatus: (id: string, status: TaskStatus) => void;
  closeContextMenu: () => void;
  onNodeMouseDown: (id: string, e: React.MouseEvent) => void;
  onResizeMouseDown: (id: string, edge: "e" | "s" | "se", e: React.MouseEvent) => void;
  onSeqHandleMouseDown: (id: string, e: React.MouseEvent) => void;
  onNodeDoubleClick: (id: string, e: React.MouseEvent) => void;
  removeLink: (fromId: string, toId: string) => void;
  setHoverArrow: (key: string | null) => void;
}

export function useOmniOrganizer(): OmniOrganizer {
  const [state, setStateRaw] = useState<State>(initialState);
  const stateRef = useRef<State>(state);
  stateRef.current = state;

  const extRef = useRef<Ext>({
    history: [],
    future: [],
    lastTag: null,
    idCounter: 1,
    canvasEl: null,
    boardEl: null,
    nameEl: null,
    linkRange: null,
    saved: null,
    savedRef: null,
    loaded: false,
    lastClickId: null,
    lastClickAt: 0,
    panned: false,
    expandFor: null,
    expandTimer: null,
    saveTimer: null,
    noticeTimer: null,
    panTimer: null,
    panVec: null,
  });

  /** Synchronous, class-like setState: updates the ref eagerly, then re-renders. */
  const setState = useCallback(
    (patch: Partial<State> | ((s: State) => Partial<State> | null)) => {
      const p = typeof patch === "function" ? patch(stateRef.current) : patch;
      if (p == null) return;
      stateRef.current = { ...stateRef.current, ...p };
      setStateRaw(stateRef.current);
    },
    [],
  );

  const graphOf = (tasks: Task[]) => new TaskGraph(tasks);
  const g = () => graphOf(stateRef.current.tasks);

  const genId = () => {
    const ext = extRef.current;
    return "n" + Date.now() + "_" + ext.idCounter++;
  };

  /** Non-blocking explanation for a rejected operation (e.g. deleting an area). */
  const notify = useCallback(
    (message: string) => {
      const ext = extRef.current;
      setState({ notice: message });
      if (ext.noticeTimer) clearTimeout(ext.noticeTimer);
      ext.noticeTimer = setTimeout(() => setState({ notice: null }), 6000);
    },
    [setState],
  );

  /* ── history ───────────────────────────────────────────────────────── */
  const snapshot = useCallback((tag?: string) => {
    const ext = extRef.current;
    if (tag && ext.lastTag === tag) return;
    ext.lastTag = tag ?? null;
    const s = stateRef.current;
    ext.history.push({ areas: s.areas, tasks: s.tasks, objectives: s.objectives });
    if (ext.history.length > 80) ext.history.shift();
    ext.future = [];
  }, []);

  const undo = useCallback(() => {
    const ext = extRef.current;
    if (!ext.history.length) return;
    ext.lastTag = null;
    const s = stateRef.current;
    ext.future.push({ areas: s.areas, tasks: s.tasks, objectives: s.objectives });
    setState({
      ...ext.history.pop()!,
      drag: null,
      homeDrag: null,
      contextMenu: null,
      editingNameId: null,
      editingObjectiveNameId: null,
    });
  }, [setState]);

  const redo = useCallback(() => {
    const ext = extRef.current;
    if (!ext.future.length) return;
    ext.lastTag = null;
    const s = stateRef.current;
    ext.history.push({ areas: s.areas, tasks: s.tasks, objectives: s.objectives });
    setState({
      ...ext.future.pop()!,
      drag: null,
      homeDrag: null,
      contextMenu: null,
      editingNameId: null,
      editingObjectiveNameId: null,
    });
  }, [setState]);

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      setState((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
    },
    [setState],
  );

  const updateObjective = useCallback(
    (id: string, patch: Partial<Objective>) => {
      setState((s) => ({
        objectives: s.objectives.map((o) =>
          o.id === id ? { ...o, ...patch, modifiedAt: Date.now() } : o,
        ),
      }));
    },
    [setState],
  );

  /* ── geometry helpers on the live state ────────────────────────────── */
  const pointerLocal = (e: { clientX: number; clientY: number }) => {
    const el = extRef.current.canvasEl!;
    const cr = el.getBoundingClientRect();
    const s = stateRef.current;
    const z = s.zoom;
    return {
      x: (e.clientX - cr.left - s.offset.x) / z,
      y: (e.clientY - cr.top - s.offset.y) / z,
    };
  };

  /** Pointer in board coordinates, so the home SVG overlay can draw straight. */
  const pointerBoard = (e: { clientX: number; clientY: number }) => {
    const el = extRef.current.boardEl;
    if (!el) return { x: 0, y: 0 };
    const cr = el.getBoundingClientRect();
    return { x: e.clientX - cr.left, y: e.clientY - cr.top };
  };

  /** Which home card is under the pointer, read straight from the DOM. */
  const cardAt = (e: { clientX: number; clientY: number }): CardRef | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const card = el?.closest?.("[data-card-kind]") as HTMLElement | null;
    if (!card || !card.dataset.cardId) return null;
    return { kind: card.dataset.cardKind as CardKind, id: card.dataset.cardId };
  };

  const originOf = (
    parentId: string,
    map: Record<string, { x: number; y: number }>,
  ) => {
    if (parentId === stateRef.current.editingTaskId) return { x: 0, y: 0 };
    const n = map[parentId];
    return n ? { x: n.x + INSET_X, y: n.y + HEADER_H } : { x: 0, y: 0 };
  };

  /* ── navigation ────────────────────────────────────────────────────── */
  const goHome = useCallback(() => {
    setState({
      screen: "home",
      drag: null,
      homeDrag: null,
      hoverId: null,
      hoverCard: null,
      contextMenu: null,
      // The status filter always comes back to "en progreso" on entering.
      homeFilter: "en_progreso",
    });
  }, [setState]);

  const fitToContent = useCallback(() => {
    const ext = extRef.current;
    if (!ext.canvasEl) return;
    const l = g().layout(stateRef.current.editingTaskId, null);
    if (!l.nodes.length) return;
    const minX = Math.min(...l.nodes.map((n) => n.x));
    const minY = Math.min(...l.nodes.map((n) => n.y));
    const maxX = Math.max(...l.nodes.map((n) => n.x + n.w));
    const maxY = Math.max(...l.nodes.map((n) => n.y + n.h));
    const cr = ext.canvasEl.getBoundingClientRect();
    const m = 48;
    const z = Math.min(
      1,
      Math.max(
        0.3,
        Math.min((cr.width - m * 2) / (maxX - minX), (cr.height - m * 2) / (maxY - minY)),
      ),
    );
    setState({
      zoom: z,
      offset: {
        x: (cr.width - (maxX - minX) * z) / 2 - minX * z,
        y: (cr.height - (maxY - minY) * z) / 2 - minY * z,
      },
    });
  }, [setState]);

  const openEditor = useCallback(
    (id: string) => {
      setState({
        screen: "editor",
        editingTaskId: id,
        offset: { x: 0, y: 0 },
        zoom: 1,
        contextMenu: null,
      });
      setTimeout(() => fitToContent(), 0);
    },
    [setState, fitToContent],
  );

  /* ── areas ─────────────────────────────────────────────────────────── */
  const createArea = useCallback(() => {
    const id = genId();
    const area: Area = {
      id,
      name: "Área sin nombre",
      description: null,
      modifiedAt: Date.now(),
    };
    snapshot();
    // Creating an area jumps straight to it, with both columns empty, and hands
    // the name the caret with its placeholder selected — the first thing anyone
    // does with a new area is name it.
    setState((s) => ({
      areas: [...s.areas, area],
      currentAreaId: id,
      areaMenuOpen: false,
      editingAreaNameId: id,
    }));
  }, [snapshot, setState]);

  const stopEditAreaName = useCallback(() => {
    if (stateRef.current.editingAreaNameId) setState({ editingAreaNameId: null });
  }, [setState]);

  const selectArea = useCallback(
    (id: string) => setState({ currentAreaId: id, areaMenuOpen: false }),
    [setState],
  );
  const toggleAreaMenu = useCallback(
    () => setState((s) => ({ areaMenuOpen: !s.areaMenuOpen })),
    [setState],
  );
  const closeAreaMenu = useCallback(() => {
    if (stateRef.current.areaMenuOpen) setState({ areaMenuOpen: false });
  }, [setState]);

  const updateArea = useCallback(
    (id: string, patch: Partial<Area>) => {
      setState((s) => ({
        areas: s.areas.map((a) =>
          a.id === id ? { ...a, ...patch, modifiedAt: Date.now() } : a,
        ),
      }));
    },
    [setState],
  );

  const renameArea = useCallback(
    (id: string, name: string) => {
      snapshot("area-name:" + id);
      updateArea(id, { name: name.trim() || "Área sin nombre" });
    },
    [snapshot, updateArea],
  );

  const describeArea = useCallback(
    (id: string, description: string) => {
      snapshot("area-desc:" + id);
      updateArea(id, { description: description.trim() || null });
    },
    [snapshot, updateArea],
  );

  /**
   * Asks before removing an area — but only when removing it is possible at
   * all. An area with content is refused outright, so there is nothing to
   * confirm: the reason is shown instead.
   */
  const requestDeleteArea = useCallback(
    (id: string) => {
      const s = stateRef.current;
      const reason = canDeleteArea(id, s.tasks, s.objectives);
      setState({ areaMenuOpen: false, contextMenu: null });
      if (reason) {
        notify(reason);
        return;
      }
      setState({ confirmDelete: { kind: "area", id } });
    },
    [notify, setState],
  );

  /**
   * An area with content is never deleted — no cascade, no reassignment. The
   * check lives in the domain layer and is repeated here on purpose: this runs
   * after the confirmation dialog, and the graph may have changed meanwhile.
   */
  const deleteArea = useCallback(
    (id: string) => {
      const s = stateRef.current;
      const reason = canDeleteArea(id, s.tasks, s.objectives);
      if (reason) {
        notify(reason);
        setState({ areaMenuOpen: false });
        return;
      }
      snapshot();
      const rest = s.areas.filter((a) => a.id !== id);
      setState({
        areas: rest,
        currentAreaId:
          s.currentAreaId === id
            ? [...rest].sort((a, b) => b.modifiedAt - a.modifiedAt)[0]?.id ?? null
            : s.currentAreaId,
        areaMenuOpen: false,
      });
    },
    [notify, snapshot, setState],
  );

  /* ── projects ──────────────────────────────────────────────────────── */
  const createProject = useCallback(() => {
    const areaId = stateRef.current.currentAreaId;
    // A project without an area is not a valid state, so there is no path here
    // that creates one — the button does not even render without an area.
    if (!areaId) return;
    const id = genId();
    const t: Task = {
      id,
      name: "Sin nombre",
      status: "pendiente",
      favorite: false,
      modifiedAt: Date.now(),
      parentId: null,
      areaId,
      seqNext: [],
      x: 60,
      y: 60,
      collapsed: false,
    };
    snapshot();
    // Creating a project does NOT jump into the canvas: the card appears in the
    // column with its name ready to type, exactly like a new objective. The
    // editor is still one double click away.
    setState((s) => ({ tasks: [...s.tasks, t], editingNameId: id }));
  }, [snapshot, setState]);

  const linkProjects = useCallback(
    (fromId: string, toId: string) => {
      const s = stateRef.current;
      const reason = canLinkProjects(s.tasks, fromId, toId);
      if (reason) {
        notify(reason);
        return;
      }
      const source = s.tasks.find((t) => t.id === fromId)!;
      if ((source.seqNext || []).includes(toId)) return;
      snapshot();
      updateTask(fromId, { seqNext: [...(source.seqNext || []), toId] });
    },
    [notify, snapshot, updateTask],
  );

  const unlinkProjects = useCallback(
    (fromId: string, toId: string) => {
      const source = stateRef.current.tasks.find((t) => t.id === fromId);
      if (!source) return;
      snapshot();
      updateTask(fromId, {
        seqNext: (source.seqNext || []).filter((n) => n !== toId),
      });
    },
    [snapshot, updateTask],
  );

  /* ── objectives ────────────────────────────────────────────────────── */
  const createObjective = useCallback(() => {
    const areaId = stateRef.current.currentAreaId;
    if (!areaId) return;
    const id = genId();
    const objective: Objective = {
      id,
      name: "Sin nombre",
      nameHtml: null,
      areaId,
      // An objective with no projects yet is perfectly valid: it was defined
      // before anyone knew how to reach it.
      status: "activo",
      linkedProjectIds: [],
      favorite: false,
      modifiedAt: Date.now(),
    };
    snapshot();
    setState((s) => ({
      objectives: [...s.objectives, objective],
      editingObjectiveNameId: id,
    }));
  }, [snapshot, setState]);

  /** Any of the three statuses, from any other: an objective can be reopened. */
  const setObjectiveStatus = useCallback(
    (id: string, status: ObjectiveStatus) => {
      snapshot();
      updateObjective(id, { status });
      setState({ contextMenu: null });
    },
    [snapshot, updateObjective, setState],
  );

  const toggleObjectiveFavorite = useCallback(
    (id: string) => {
      const o = stateRef.current.objectives.find((x) => x.id === id);
      if (!o) return;
      snapshot();
      updateObjective(id, { favorite: !o.favorite });
    },
    [snapshot, updateObjective],
  );

  const startEditObjectiveName = useCallback(
    (id: string) => setState({ editingObjectiveNameId: id, contextMenu: null }),
    [setState],
  );

  const commitObjectiveName = useCallback(
    (id: string, el: HTMLElement) => {
      const html = el.innerHTML.trim();
      const text = (el.innerText || "").trim();
      snapshot("obj-name:" + id);
      updateObjective(id, {
        name: text || "Sin nombre",
        nameHtml: sanitizeNameHtml(html),
      });
      setState({ editingObjectiveNameId: null });
    },
    [snapshot, updateObjective, setState],
  );

  const toggleObjectiveLink = useCallback(
    (objectiveId: string, projectId: string) => {
      const s = stateRef.current;
      const objective = s.objectives.find((o) => o.id === objectiveId);
      if (!objective) return;
      const linked = objective.linkedProjectIds || [];
      if (linked.includes(projectId)) {
        snapshot();
        updateObjective(objectiveId, {
          linkedProjectIds: linked.filter((id) => id !== projectId),
        });
        return;
      }
      const reason = canLinkObjective(
        objective,
        s.tasks.find((t) => t.id === projectId),
      );
      if (reason) {
        notify(reason);
        return;
      }
      snapshot();
      updateObjective(objectiveId, { linkedProjectIds: [...linked, projectId] });
    },
    [notify, snapshot, updateObjective],
  );

  const deleteObjective = useCallback(
    (id: string) => {
      snapshot();
      setState((s) => ({
        objectives: s.objectives.filter((o) => o.id !== id),
        contextMenu: null,
        hoverCard: null,
      }));
    },
    [snapshot, setState],
  );

  /* ── home relation dragging ────────────────────────────────────────── */
  const onHomeHandleMouseDown = useCallback(
    (type: "seq" | "link", card: CardRef, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button !== 0) return;
      const p = pointerBoard(e);
      setState({
        homeDrag: {
          type,
          fromKind: card.kind,
          fromId: card.id,
          x: p.x,
          y: p.y,
          over: null,
          invalid: false,
        },
        contextMenu: null,
      });
    },
    [setState],
  );

  /** Why a home drag would be rejected, or null when it is fine. */
  const homeDragReason = (drag: HomeDrag, over: CardRef | null): string | null => {
    if (!over) return null;
    const s = stateRef.current;
    if (drag.type === "seq") {
      if (over.kind !== "project") return "La secuencia solo enlaza proyectos.";
      return canLinkProjects(s.tasks, drag.fromId, over.id);
    }
    const objectiveId = drag.fromKind === "objective" ? drag.fromId : over.id;
    const projectId = drag.fromKind === "objective" ? over.id : drag.fromId;
    if (over.kind === drag.fromKind)
      return "Un vínculo va siempre de un proyecto a un objetivo.";
    const objective = s.objectives.find((o) => o.id === objectiveId);
    if (!objective) return "El objetivo no existe.";
    return canLinkObjective(
      objective,
      s.tasks.find((t) => t.id === projectId),
    );
  };

  /* ── simple mutations ──────────────────────────────────────────────── */
  const onSearchChange = useCallback((v: string) => setState({ search: v }), [setState]);
  const toggleFavoritesOnly = useCallback(
    () => setState((s) => ({ favoritesOnly: !s.favoritesOnly })),
    [setState],
  );
  const toggleFavorite = useCallback(
    (id: string) => {
      snapshot();
      updateTask(id, { favorite: !g().byId(id)!.favorite });
    },
    [snapshot, updateTask],
  );
  const setHomeFilter = useCallback((v: TaskStatus) => setState({ homeFilter: v }), [setState]);
  const toggleCollapse = useCallback(
    (id: string) => updateTask(id, { collapsed: !g().byId(id)!.collapsed }),
    [updateTask],
  );
  const setHover = useCallback((id: string | null) => setState({ hoverId: id }), [setState]);
  const setHoverCard = useCallback(
    (card: CardRef | null) => setState({ hoverCard: card }),
    [setState],
  );
  const setHoverCurve = useCallback(
    (key: string | null) => setState({ hoverCurve: key }),
    [setState],
  );
  const setHoverArrow = useCallback(
    (key: string | null) => setState({ hoverArrow: key }),
    [setState],
  );
  const dismissNotice = useCallback(() => setState({ notice: null }), [setState]);

  const setStatus = useCallback(
    (id: string, status: TaskStatus): boolean => {
      const graph = g();
      const { blockers, activeChildren, eff } = graph.statusResolver();
      // `blockers` already returns nothing for a project, so this check keeps
      // applying to tasks and stops applying to projects, as it should.
      if (blockers(id).length > 0) return false;
      if (activeChildren(id).length > 0) return false;
      if (
        status === "completada" &&
        [...graph.descendantsOf(id)].some((d) => d !== id && eff(d) !== "completada")
      )
        return false;
      snapshot();
      updateTask(id, { status, modifiedAt: Date.now() });
      return true;
    },
    [snapshot, updateTask],
  );

  /* ── delete ────────────────────────────────────────────────────────── */
  const deleteTask = useCallback(
    (id: string) => {
      snapshot();
      const doomed = g().descendantsOf(id);
      setState((s) => ({
        tasks: s.tasks
          .filter((t) => !doomed.has(t.id))
          .map((t) => ({
            ...t,
            seqNext: (t.seqNext || []).filter((n) => !doomed.has(n)),
          })),
        // Same cleanup `seqNext` gets: a deleted project disappears from every
        // objective that pointed at it.
        objectives: detachProjects(s.objectives, doomed),
        contextMenu: null,
        hoverId: null,
        hoverCard: null,
      }));
    },
    [snapshot, setState],
  );

  const requestDelete = useCallback(
    (req: DeleteRequest) => setState({ confirmDelete: req, contextMenu: null }),
    [setState],
  );
  const cancelDelete = useCallback(() => setState({ confirmDelete: null }), [setState]);
  const confirmDeleteNow = useCallback(() => {
    const req = stateRef.current.confirmDelete;
    if (!req) return;
    const fromEditor =
      stateRef.current.screen === "editor" && req.id === stateRef.current.editingTaskId;
    if (req.kind === "objective") deleteObjective(req.id);
    else if (req.kind === "area") deleteArea(req.id);
    else deleteTask(req.id);
    setState({ confirmDelete: null });
    if (fromEditor) goHome();
  }, [deleteTask, deleteObjective, deleteArea, setState, goHome]);

  /* ── name editing (contentEditable + link dialog) ──────────────────── */
  const onEditingNameChange = useCallback(
    (v: string) => {
      snapshot("name:" + stateRef.current.editingTaskId);
      updateTask(stateRef.current.editingTaskId!, { name: v, modifiedAt: Date.now() });
    },
    [snapshot, updateTask],
  );

  /**
   * The description of whatever the editor has open — always a Project, since
   * that is the only thing openable. Empty collapses to null so "no
   * description" has a single representation.
   */
  const onEditingDescriptionChange = useCallback(
    (v: string) => {
      const id = stateRef.current.editingTaskId;
      if (!id) return;
      snapshot("desc:" + id);
      updateTask(id, { description: v === "" ? null : v, modifiedAt: Date.now() });
    },
    [snapshot, updateTask],
  );

  const startEditName = useCallback(
    (id: string) => setState({ editingNameId: id, contextMenu: null }),
    [setState],
  );
  const stopEditName = useCallback(() => setState({ editingNameId: null }), [setState]);

  const commitNameHtml = useCallback(
    (id: string, el: HTMLElement) => {
      const html = el.innerHTML.trim();
      const text = (el.innerText || "").trim();
      snapshot("name:" + id);
      updateTask(id, {
        name: text || "Sin nombre",
        nameHtml: sanitizeNameHtml(html),
        modifiedAt: Date.now(),
      });
      stopEditName();
    },
    [snapshot, updateTask, stopEditName],
  );

  const openLinkDialogForSelection = useCallback(
    (id: string, kind: "task" | "objective") => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      extRef.current.linkRange = sel.getRangeAt(0).cloneRange();
      let node: Node | null = sel.anchorNode;
      let existing = "";
      while (node && node !== document.body) {
        if ((node as HTMLElement).tagName === "A") {
          existing = (node as HTMLElement).getAttribute("href") || "";
          break;
        }
        node = node.parentNode;
      }
      setState({ linkDialog: { taskId: id, kind, text: sel.toString(), url: existing } });
    },
    [setState],
  );

  // The name field only ever gets a hyperlink through the explicit Ctrl+K /
  // right-click dialog. Left to the browser's default paste, rich clipboard
  // content (spans, <br>, inline styles from copied web text) lands in the
  // contentEditable as real markup that sanitizeNameHtml then has to escape,
  // showing the raw tags as visible text. Forcing plain text on paste avoids
  // that class of bug entirely.
  const onNamePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }, []);

  const commitEditable = (id: string, el: HTMLElement) => {
    if (stateRef.current.editingObjectiveNameId === id) commitObjectiveName(id, el);
    else commitNameHtml(id, el);
  };

  const onNameKeyDown = useCallback(
    (id: string, e: React.KeyboardEvent) => {
      const kind =
        stateRef.current.editingObjectiveNameId === id ? "objective" : "task";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.stopPropagation();
        e.preventDefault();
        openLinkDialogForSelection(id, kind);
        return;
      }
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      if (el && el.isContentEditable) commitEditable(id, el);
      else if (kind === "objective") setState({ editingObjectiveNameId: null });
      else stopEditName();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitNameHtml, commitObjectiveName, stopEditName, openLinkDialogForSelection, setState],
  );

  const onNameContextMenu = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openLinkDialogForSelection(
        id,
        stateRef.current.editingObjectiveNameId === id ? "objective" : "task",
      );
    },
    [openLinkDialogForSelection],
  );

  const restoreLinkRange = () => {
    const range = extRef.current.linkRange;
    if (!range) return null;
    const sel = window.getSelection();
    if (!sel) return null;
    sel.removeAllRanges();
    sel.addRange(range);
    return sel;
  };

  const applyLink = useCallback(() => {
    const d = stateRef.current.linkDialog;
    if (!d) return;
    let url = (d.url || "").trim();
    if (!url) return;
    if (!/^[a-z]+:/i.test(url)) url = "https://" + url;
    restoreLinkRange();
    document.execCommand("createLink", false, url);
    const el = extRef.current.nameEl;
    if (el) {
      el.querySelectorAll("a").forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noreferrer");
        (a as HTMLElement).style.color = "#2563eb";
      });
      if (d.kind === "objective") commitObjectiveName(d.taskId, el);
      else commitNameHtml(d.taskId, el);
    }
    setState({ linkDialog: null });
  }, [commitNameHtml, commitObjectiveName, setState]);

  const removeLinkFromSelection = useCallback(() => {
    const d = stateRef.current.linkDialog;
    if (!d) return;
    restoreLinkRange();
    document.execCommand("unlink");
    const el = extRef.current.nameEl;
    if (el) {
      if (d.kind === "objective") commitObjectiveName(d.taskId, el);
      else commitNameHtml(d.taskId, el);
    }
    setState({ linkDialog: null });
  }, [commitNameHtml, commitObjectiveName, setState]);

  const cancelLinkDialog = useCallback(() => setState({ linkDialog: null }), [setState]);
  const onLinkUrlChange = useCallback(
    (v: string) =>
      setState((s) => ({ linkDialog: s.linkDialog ? { ...s.linkDialog, url: v } : null })),
    [setState],
  );
  const onLinkKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") applyLink();
      if (e.key === "Escape") cancelLinkDialog();
    },
    [applyLink, cancelLinkDialog],
  );

  /* ── context menu + create ─────────────────────────────────────────── */
  const closeContextMenu = useCallback(() => {
    if (stateRef.current.contextMenu) setState({ contextMenu: null });
  }, [setState]);

  const focusNameInput = () => {
    setTimeout(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.tagName === "INPUT") (el as HTMLInputElement).select();
    }, 0);
  };

  const createTaskAt = useCallback(
    (parentId: string, localX: number, localY: number) => {
      const id = genId();
      const spot = g().resolveOverlap(parentId, id, localX, localY);
      snapshot();
      const t: Task = {
        id,
        name: "Sin nombre",
        status: "pendiente",
        favorite: false,
        modifiedAt: Date.now(),
        parentId,
        // A task never carries an area: it inherits the one of its project.
        areaId: null,
        seqNext: [],
        x: spot.x,
        y: spot.y,
        collapsed: false,
      };
      setState((s) => ({
        tasks: [
          ...s.tasks.map((x) => (x.id === parentId ? { ...x, collapsed: false } : x)),
          t,
        ],
        editingNameId: id,
        contextMenu: null,
      }));
      focusNameInput();
    },
    [snapshot, setState],
  );

  const openContextMenu = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const p = pointerLocal(e);
      const l = g().layout(stateRef.current.editingTaskId, null);
      const origin = originOf(id, l.map);
      setState({
        contextMenu: {
          type: "task",
          id,
          x: e.clientX,
          y: e.clientY,
          parentId: id,
          localX: Math.max(0, p.x - origin.x),
          localY: Math.max(0, p.y - origin.y),
        },
      });
    },
    [setState],
  );

  const openHomeMenu = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setState({
        contextMenu: {
          type: "task",
          id,
          x: e.clientX,
          y: e.clientY,
          parentId: id,
          localX: 20,
          localY: 20,
        },
      });
    },
    [setState],
  );

  /** Right-clicking the area name — the only place an area can be deleted. */
  const openAreaMenu = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setState({
        contextMenu: {
          type: "area",
          id,
          x: e.clientX,
          y: e.clientY,
          parentId: null,
          localX: 0,
          localY: 0,
        },
        areaMenuOpen: false,
      });
    },
    [setState],
  );

  const openObjectiveMenu = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setState({
        contextMenu: {
          type: "objective",
          id,
          x: e.clientX,
          y: e.clientY,
          parentId: null,
          localX: 0,
          localY: 0,
        },
      });
    },
    [setState],
  );

  const onCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (extRef.current.panned) {
        extRef.current.panned = false;
        return;
      }
      const target = e.target as HTMLElement;
      if (e.target !== e.currentTarget && !(target.dataset && target.dataset.canvasLayer))
        return;
      const p = pointerLocal(e);
      setState({
        contextMenu: {
          type: "canvas",
          x: e.clientX,
          y: e.clientY,
          parentId: stateRef.current.editingTaskId,
          localX: p.x - 90,
          localY: p.y - 19,
        },
      });
    },
    [setState],
  );

  const addTaskFromMenu = useCallback(() => {
    const m = stateRef.current.contextMenu;
    if (!m || m.parentId == null) return;
    createTaskAt(m.parentId, m.localX, m.localY);
  }, [createTaskAt]);

  const setContextStatus = useCallback(
    (id: string, status: TaskStatus) => {
      setStatus(id, status);
      setState({ contextMenu: null });
    },
    [setStatus, setState],
  );

  /* ── second-click detection (edit name / create) ───────────────────── */
  const isSecondClick = (id: string) => {
    const ext = extRef.current;
    const t = Date.now();
    const hit = ext.lastClickId === id && t - ext.lastClickAt < 400;
    ext.lastClickId = id;
    ext.lastClickAt = t;
    return hit;
  };

  /* ── dragging ──────────────────────────────────────────────────────── */
  const onCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      closeContextMenu();
      const target = e.target as HTMLElement;
      const onFree =
        e.target === e.currentTarget || (target.dataset && target.dataset.canvasLayer === "1");
      if (e.button === 2) {
        if (!onFree) return;
        e.preventDefault();
        extRef.current.panned = false;
        setState({
          drag: {
            type: "pan",
            mouseX: e.clientX,
            mouseY: e.clientY,
            offX: stateRef.current.offset.x,
            offY: stateRef.current.offset.y,
          },
        });
        return;
      }
      if (e.button !== 0) return;
      if (!onFree) return;
      if (isSecondClick("__canvas")) {
        // Stop the browser from moving focus to the canvas on this click; the
        // node being created wants it for its name field.
        e.preventDefault();
        const p = pointerLocal(e);
        createTaskAt(stateRef.current.editingTaskId!, p.x - 90, p.y - 19);
      }
    },
    [closeContextMenu, setState, createTaskAt],
  );

  const onNodeMouseDown = useCallback(
    (id: string, e: React.MouseEvent) => {
      const anchor =
        e.target && (e.target as HTMLElement).closest
          ? (e.target as HTMLElement).closest("a[href]")
          : null;
      if (anchor && (e.metaKey || e.ctrlKey)) {
        e.stopPropagation();
        e.preventDefault();
        window.open(anchor.getAttribute("href")!, "_blank", "noreferrer");
        return;
      }
      e.stopPropagation();
      closeContextMenu();
      if (e.button !== 0) return;
      if (isSecondClick(id)) {
        e.preventDefault();
        startEditName(id);
        focusNameInput();
        return;
      }
      const l = g().layout(stateRef.current.editingTaskId, null);
      const n = l.map[id];
      if (!n) return;
      // Stop the browser's native link-drag/text-selection so dragging a card
      // that has a hyperlink in its name always moves the card, not the link.
      e.preventDefault();
      setState({
        drag: {
          type: "move",
          id,
          mouseX: e.clientX,
          mouseY: e.clientY,
          absX: n.x,
          absY: n.y,
          origAbsX: n.x,
          origAbsY: n.y,
        },
        dropTargetId: null,
        hoverId: id,
        pressedId: id,
      });
    },
    [closeContextMenu, setState, startEditName],
  );

  const onNodeDoubleClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e && e.stopPropagation) e.stopPropagation();
      startEditName(id);
      focusNameInput();
    },
    [startEditName],
  );

  const onResizeMouseDown = useCallback(
    (id: string, edge: "e" | "s" | "se", e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      closeContextMenu();
      if (e.button !== 0) return;
      snapshot();
      const graph = g();
      const size = graph.sizeOfTask(id, null);
      const auto = graph.autoSizeOf(id, null);
      setState({
        drag: {
          type: "resize",
          id,
          edge,
          mouseX: e.clientX,
          mouseY: e.clientY,
          startW: size.w,
          startH: size.h,
          minW: auto.w,
          minH: auto.h,
        },
      });
    },
    [closeContextMenu, snapshot, setState],
  );

  const onSeqHandleMouseDown = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      closeContextMenu();
      const p = pointerLocal(e);
      setState({ drag: { type: "seq", sourceId: id, mouseX: p.x, mouseY: p.y } });
    },
    [closeContextMenu, setState],
  );

  const removeLink = useCallback(
    (fromId: string, toId: string) => {
      snapshot();
      updateTask(fromId, {
        seqNext: (g().byId(fromId)!.seqNext || []).filter((n) => n !== toId),
      });
    },
    [snapshot, updateTask],
  );

  /* ── auto-expand / auto-pan while dragging ─────────────────────────── */
  const stopAutoPan = () => {
    const ext = extRef.current;
    if (ext.panTimer) clearInterval(ext.panTimer);
    ext.panTimer = null;
    ext.panVec = null;
  };

  const autoExpand = (targetId: string | null) => {
    const ext = extRef.current;
    if (ext.expandFor === targetId) return;
    if (ext.expandTimer) clearTimeout(ext.expandTimer);
    ext.expandFor = targetId;
    const t = targetId ? g().byId(targetId) : null;
    if (!t || !t.collapsed) return;
    ext.expandTimer = setTimeout(() => {
      const st = stateRef.current;
      if (st.drag && st.dropTargetId === targetId && g().byId(targetId!)?.collapsed) {
        updateTask(targetId!, { collapsed: false });
      }
    }, 600);
  };

  const autoPan = (e: { clientX: number; clientY: number }) => {
    const ext = extRef.current;
    const cr = ext.canvasEl!.getBoundingClientRect();
    const m = 48;
    const step = 12;
    let dx = 0;
    let dy = 0;
    if (e.clientX - cr.left < m) dx = step;
    else if (cr.right - e.clientX < m) dx = -step;
    if (e.clientY - cr.top < m) dy = step;
    else if (cr.bottom - e.clientY < m) dy = -step;
    if (!dx && !dy) {
      stopAutoPan();
      return;
    }
    if (ext.panVec && ext.panVec.x === dx && ext.panVec.y === dy) return;
    ext.panVec = { x: dx, y: dy };
    if (ext.panTimer) clearInterval(ext.panTimer);
    ext.panTimer = setInterval(() => {
      if (!stateRef.current.drag) {
        stopAutoPan();
        return;
      }
      setState((s) => ({ offset: { x: s.offset.x + dx, y: s.offset.y + dy } }));
      const d = stateRef.current.drag;
      if (d && d.type === "move")
        setState({
          drag: {
            ...d,
            origAbsX: d.origAbsX - dx / stateRef.current.zoom,
            origAbsY: d.origAbsY - dy / stateRef.current.zoom,
          },
        });
    }, 16);
  };

  /* ── window-level drag handlers ────────────────────────────────────── */
  const onWindowMouseMove = useCallback((e: MouseEvent) => {
    const st = stateRef.current;
    if (st.homeDrag) {
      const p = pointerBoard(e);
      const over = cardAt(e);
      const self =
        over && over.id === st.homeDrag.fromId && over.kind === st.homeDrag.fromKind;
      const target = self ? null : over;
      setState({
        homeDrag: {
          ...st.homeDrag,
          x: p.x,
          y: p.y,
          over: target,
          invalid: !!target && homeDragReason(st.homeDrag, target) !== null,
        },
      });
      return;
    }
    const drag = st.drag;
    if (!drag || !extRef.current.canvasEl) return;
    if (drag.type === "pan") {
      const dx = e.clientX - drag.mouseX;
      const dy = e.clientY - drag.mouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) extRef.current.panned = true;
      setState({ offset: { x: drag.offX + dx, y: drag.offY + dy } });
    } else if (drag.type === "move") {
      const z = stateRef.current.zoom;
      const dx = (e.clientX - drag.mouseX) / z;
      const dy = (e.clientY - drag.mouseY) / z;
      const moved = drag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
      const absX = drag.origAbsX + dx;
      const absY = drag.origAbsY + dy;
      const p = pointerLocal(e);
      const graph = g();
      const l = graph.layout(stateRef.current.editingTaskId, drag.id);
      const target = moved ? graph.hitTest(p.x, p.y, graph.descendantsOf(drag.id), l) : null;
      autoExpand(target);
      autoPan(e);
      setState({ drag: { ...drag, absX, absY, moved }, dropTargetId: target });
    } else if (drag.type === "resize") {
      const z = stateRef.current.zoom;
      const dx = (e.clientX - drag.mouseX) / z;
      const dy = (e.clientY - drag.mouseY) / z;
      const patch: Partial<Task> = {};
      if (drag.edge !== "s") patch.minW = Math.max(drag.minW, drag.startW + dx);
      if (drag.edge !== "e") patch.minH = Math.max(drag.minH, drag.startH + dy);
      updateTask(drag.id, patch);
    } else if (drag.type === "seq") {
      const p = pointerLocal(e);
      const graph = g();
      const l = graph.layout(stateRef.current.editingTaskId, null);
      const over = graph.hitTest(p.x, p.y, new Set([drag.sourceId]), l);
      setState({
        drag: {
          ...drag,
          mouseX: p.x,
          mouseY: p.y,
          overId: over,
          invalid: !!over && !graph.canLink(drag.sourceId, over),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState, updateTask]);

  const onWindowMouseUp = useCallback((e: MouseEvent) => {
    const st = stateRef.current;
    if (st.homeDrag) {
      const drag = st.homeDrag;
      const over = cardAt(e);
      const self = over && over.id === drag.fromId && over.kind === drag.fromKind;
      // Dropping on empty space creates nothing at all.
      if (over && !self) {
        const reason = homeDragReason(drag, over);
        if (reason) notify(reason);
        else if (drag.type === "seq") linkProjects(drag.fromId, over.id);
        else if (drag.fromKind === "objective")
          toggleObjectiveLink(drag.fromId, over.id);
        else toggleObjectiveLink(over.id, drag.fromId);
      }
      setState({ homeDrag: null });
      return;
    }
    const drag = st.drag;
    stopAutoPan();
    if (extRef.current.expandTimer) clearTimeout(extRef.current.expandTimer);
    extRef.current.expandFor = null;
    if (!drag) return;
    if (drag.type === "move") {
      if (!drag.moved) {
        setState({ drag: null, dropTargetId: null, pressedId: null });
        return;
      }
      const graph = g();
      const l = graph.layout(stateRef.current.editingTaskId, drag.id);
      const newParent = stateRef.current.dropTargetId || stateRef.current.editingTaskId!;
      const origin = originOf(newParent, l.map);
      const isRoot = newParent === stateRef.current.editingTaskId;
      const rawX = drag.absX - origin.x;
      const rawY = drag.absY - origin.y;
      const spot = graph.resolveOverlap(
        newParent,
        drag.id,
        isRoot ? rawX : Math.max(0, rawX),
        isRoot ? rawY : Math.max(0, rawY),
      );
      const nx = spot.x;
      const ny = spot.y;
      const movedSet = graph.descendantsOf(drag.id);
      const chain = new Set<string>();
      let up: string | null = newParent;
      while (up && up !== stateRef.current.editingTaskId) {
        chain.add(up);
        const p = graph.byId(up);
        up = p ? p.parentId : null;
      }
      snapshot();
      const prune = (t: Task): Task => {
        const links = t.seqNext || [];
        const keep = links.filter(
          (n) => !((movedSet.has(t.id) && chain.has(n)) || (chain.has(t.id) && movedSet.has(n))),
        );
        return keep.length === links.length ? t : { ...t, seqNext: keep };
      };
      setState((s) => ({
        tasks: s.tasks.map((t0) => {
          const t = prune(t0);
          if (t.id === drag.id) return { ...t, parentId: newParent, x: nx, y: ny };
          if (t.id === newParent && t.collapsed) return { ...t, collapsed: false };
          return t;
        }),
        drag: null,
        dropTargetId: null,
        pressedId: null,
      }));
    } else if (drag.type === "seq") {
      const graph = g();
      const l = graph.layout(stateRef.current.editingTaskId, null);
      const source = graph.byId(drag.sourceId)!;
      const targetId = graph.hitTest(drag.mouseX, drag.mouseY, new Set([drag.sourceId]), l);
      const target = targetId ? graph.byId(targetId) : null;
      if (target && graph.canLink(source.id, target.id)) {
        const links = source.seqNext || [];
        if (!links.includes(target.id)) {
          snapshot();
          updateTask(source.id, { seqNext: [...links, target.id] });
        }
      }
      setState({ drag: null });
    } else if (drag.type === "resize") {
      const relaxed = g().relaxOverlaps();
      setState(relaxed ? { tasks: relaxed, drag: null } : { drag: null });
    } else {
      setState({ drag: null, pressedId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState, snapshot, updateTask, notify, linkProjects, toggleObjectiveLink]);

  /* ── keyboard + wheel + resize (window) ────────────────────────────── */
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement)?.tagName || "";
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const st = stateRef.current;
        if (st.confirmDelete || st.drag || st.homeDrag) return;
        if ((e.target as HTMLElement)?.isContentEditable) return;
        if (st.screen === "home") {
          if (!st.hoverCard) return;
          e.preventDefault();
          setState({
            confirmDelete: {
              kind: st.hoverCard.kind === "objective" ? "objective" : "task",
              id: st.hoverCard.id,
            },
          });
          return;
        }
        if (!st.hoverId) return;
        e.preventDefault();
        deleteTask(st.hoverId);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      e.preventDefault();
      if (k === "y" || e.shiftKey) redo();
      else undo();
    },
    [setState, deleteTask, redo, undo],
  );

  const onWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const ext = extRef.current;
    if (stateRef.current.screen !== "editor" || !ext.canvasEl) return;
    e.preventDefault();
    const cr = ext.canvasEl.getBoundingClientRect();
    const cx = e.clientX - cr.left;
    const cy = e.clientY - cr.top;
    setState((s) => {
      const z = Math.min(2.5, Math.max(0.3, s.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const r = z / s.zoom;
      return { zoom: z, offset: { x: cx - (cx - s.offset.x) * r, y: cy - (cy - s.offset.y) * r } };
    });
  }, [setState]);

  const onResize = useCallback(() => {
    const narrow = window.innerWidth < 900;
    if (narrow !== stateRef.current.narrow) setState({ narrow });
  }, [setState]);

  /* ── mount: load + listeners ───────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    loadAll().then((snap) => {
      if (!alive) return;
      extRef.current.loaded = true;
      extRef.current.saved = snap;
      // Leave savedRef unset so the persistence effect relaxes overlaps on the
      // freshly loaded graph (matches the export's load behavior).
      setState({
        areas: snap.areas,
        tasks: snap.tasks,
        objectives: snap.objectives,
        currentAreaId:
          [...snap.areas].sort((a, b) => b.modifiedAt - a.modifiedAt)[0]?.id ?? null,
      });
    });
    const closeMenus = () => {
      const s = stateRef.current;
      if (s.contextMenu) setState({ contextMenu: null });
      if (s.areaMenuOpen) setState({ areaMenuOpen: false });
    };
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("mousedown", closeMenus);
    return () => {
      alive = false;
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousedown", closeMenus);
      stopAutoPan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── keep the selected area pointing at something that exists ──────── */
  useEffect(() => {
    const s = stateRef.current;
    if (!s.areas.length) {
      if (s.currentAreaId !== null) setState({ currentAreaId: null });
      return;
    }
    if (!s.currentAreaId || !s.areas.some((a) => a.id === s.currentAreaId))
      setState({
        currentAreaId: [...s.areas].sort((a, b) => b.modifiedAt - a.modifiedAt)[0].id,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.areas]);

  /* ── persistence: relax overlaps, then debounce-save ───────────────── */
  useEffect(() => {
    const ext = extRef.current;
    if (!ext.loaded) return;
    const current: HistoryEntry = {
      areas: state.areas,
      tasks: state.tasks,
      objectives: state.objectives,
    };
    if (
      ext.savedRef &&
      ext.savedRef.areas === current.areas &&
      ext.savedRef.tasks === current.tasks &&
      ext.savedRef.objectives === current.objectives
    )
      return;
    ext.savedRef = current;
    if (!stateRef.current.drag) {
      const relaxed = graphOf(state.tasks).relaxOverlaps();
      if (relaxed) {
        setState({ tasks: relaxed });
        return;
      }
    }
    if (ext.saveTimer) clearTimeout(ext.saveTimer);
    ext.saveTimer = setTimeout(() => {
      const s = stateRef.current;
      const snap: Snapshot = {
        areas: s.areas,
        tasks: s.tasks,
        objectives: s.objectives,
      };
      // Saving is silent on purpose: every change keeps syncing on its own, but
      // it does not announce itself. Only a *refused* operation speaks up, via
      // `notice`.
      void saveAll(snap, ext.saved);
      ext.saved = snap;
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.areas, state.tasks, state.objectives]);

  const setCanvasEl = useCallback((el: HTMLElement | null) => {
    extRef.current.canvasEl = el;
  }, []);
  const setBoardEl = useCallback((el: HTMLElement | null) => {
    extRef.current.boardEl = el;
  }, []);
  const setNameEl = useCallback((el: HTMLElement | null) => {
    extRef.current.nameEl = el;
    if (el) {
      // Fill the contentEditable name once and select all of it, so the
      // placeholder can be typed straight over. Serves canvas tasks and
      // objective cards alike.
      const s = stateRef.current;
      const id = s.editingNameId ?? s.editingObjectiveNameId;
      const source = s.editingObjectiveNameId
        ? s.objectives.find((o) => o.id === s.editingObjectiveNameId)
        : id
          ? graphOf(s.tasks).byId(id)
          : null;
      if (source && el.dataset.filled !== id) {
        el.dataset.filled = id!;
        el.innerHTML = source.nameHtml ? source.nameHtml : escapeHtml(source.name);
        // Focus AFTER the current event finishes. This ref runs while the click
        // that created the node is still being dispatched: focusing now lets the
        // browser hand focus back to the canvas a moment later, and that blur
        // commits the name and closes the editor before a single key is pressed.
        setTimeout(() => {
          if (!el.isConnected) return;
          el.focus();
          const r = document.createRange();
          r.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(r);
        }, 0);
      }
    }
  }, []);

  const actions: Actions = {
    goHome,
    openEditor,
    onSearchChange,
    toggleFavoritesOnly,
    toggleFavorite,
    toggleCollapse,
    setHomeFilter,
    setStatus,
    setHover,
    setHoverCard,
    setHoverCurve,
    createArea,
    selectArea,
    toggleAreaMenu,
    closeAreaMenu,
    renameArea,
    describeArea,
    stopEditAreaName,
    requestDeleteArea,
    createProject,
    linkProjects,
    unlinkProjects,
    createObjective,
    setObjectiveStatus,
    toggleObjectiveFavorite,
    startEditObjectiveName,
    commitObjectiveName,
    toggleObjectiveLink,
    onHomeHandleMouseDown,
    requestDelete,
    cancelDelete,
    confirmDeleteNow,
    deleteTask,
    dismissNotice,
    onEditingNameChange,
    onEditingDescriptionChange,
    startEditName,
    stopEditName,
    commitNameHtml,
    onNameContextMenu,
    onNameKeyDown,
    onNamePaste,
    applyLink,
    removeLinkFromSelection,
    cancelLinkDialog,
    onLinkUrlChange,
    onLinkKeyDown,
    openContextMenu,
    openHomeMenu,
    openAreaMenu,
    openObjectiveMenu,
    onCanvasContextMenu,
    onCanvasMouseDown,
    addTaskFromMenu,
    setContextStatus,
    closeContextMenu,
    onNodeMouseDown,
    onResizeMouseDown,
    onSeqHandleMouseDown,
    onNodeDoubleClick,
    removeLink,
    setHoverArrow,
  };

  return {
    state,
    graph: graphOf(state.tasks),
    setCanvasEl,
    setBoardEl,
    setNameEl,
    actions,
  };
}
