/**
 * Pure geometry / layout / status engine for Task designer.
 *
 * Ported faithfully from the Claude Design "Task designer" export (the `x-dc`
 * artifact's script). Everything here is deterministic and DOM-light: given the
 * flat task array it computes the recursive box layout, the status resolution,
 * and the obstacle-avoiding sequence arrows. The React layer holds state and
 * builds a fresh TaskGraph per render.
 */
import {
  STATUS_META,
  isProject as isProjectNode,
  type Task,
  type TaskStatus,
} from "@omni-organize/shared";

export { STATUS_META };
export type { Task, TaskStatus };

export const LEAF_W = 190;
export const LEAF_H = 38;
export const HEADER_H = 34;
export const PAD = 14;
/** Children start past their container's status band, with slack. */
export const BAND_W = 26;
export const INSET_X = BAND_W + 12;
export const LINE_H = 16;
export const TEXT_PAD_X = 44;
export const TEXT_PAD_Y = 11;
/** A container's header is a single line (chevron + name, never wraps), so its
 * box must always be at least this wide: left padding (34) + chevron (11) +
 * gap (6) + right padding (10). Matches CanvasNode's header row exactly. */
export const HEADER_TEXT_PAD_X = 34 + 11 + 6 + 10;

export function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let _measureCtx: CanvasRenderingContext2D | null = null;
export function measureText(s: string): number {
  if (typeof document === "undefined") return (s || "").length * 6.2;
  if (!_measureCtx) {
    _measureCtx = document.createElement("canvas").getContext("2d");
    // Match the body's actual font (Inter, via next/font) so measured widths
    // agree with what's really rendered — a generic fallback stack measures
    // narrower than Inter and lets long names clip by a few pixels.
    const family = getComputedStyle(document.body).fontFamily || "ui-sans-serif, system-ui, sans-serif";
    if (_measureCtx) _measureCtx.font = `12px ${family}`;
  }
  return _measureCtx ? _measureCtx.measureText(s || "").width : (s || "").length * 6.2;
}

/** Real line count: the browser wraps by words, not by continuous width. */
export function wrapLines(name: string, avail: number): number {
  const words = String(name || "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 1;
  let lines = 1;
  let cur = "";
  words.forEach((word) => {
    const probe = cur ? cur + " " + word : word;
    if (measureText(probe) <= avail || !cur) {
      cur = probe;
      if (!cur.includes(" ") && measureText(cur) > avail) {
        lines += Math.ceil(measureText(cur) / avail) - 1;
        cur = "";
      }
    } else {
      lines++;
      cur = word;
    }
  });
  return lines;
}

/** Fixed width like default cards: only grows in height, same margin top/bottom. */
export function leafSize(name: string): { w: number; h: number } {
  const lines = wrapLines(name, LEAF_W - TEXT_PAD_X);
  return { w: LEAF_W, h: Math.max(LEAF_H, lines * LINE_H + TEXT_PAD_Y * 2) };
}

/** Minimum width for a container's one-line header (name never wraps). A few
 * px of slack absorb canvas-vs-DOM subpixel differences — better a hair of
 * extra padding than clipping the name again. */
export function headerLineWidth(name: string): number {
  return HEADER_TEXT_PAD_X + measureText(name) + 4;
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "Justo ahora";
  if (min < 60) return `Hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Hace ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `Hace ${day} día${day > 1 ? "s" : ""}`;
  const wk = Math.round(day / 7);
  return `Hace ${wk} semana${wk > 1 ? "s" : ""}`;
}

export interface LayoutNode {
  id: string;
  task: Task;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  isContainer: boolean;
  hasKids: boolean;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  map: Record<string, LayoutNode>;
}

export interface ArrowSegment {
  d: string;
  from: string;
  to: string;
}

export interface Point {
  x: number;
  y: number;
}

interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type MaybeId = string | null;

export class TaskGraph {
  readonly tasks: Task[];
  private readonly index: Map<string, Task>;

  constructor(tasks: Task[]) {
    this.tasks = tasks;
    this.index = new Map(tasks.map((t) => [t.id, t]));
  }

  byId(id: MaybeId): Task | undefined {
    return id == null ? undefined : this.index.get(id);
  }

  getChildren(id: MaybeId): Task[] {
    return this.tasks.filter((t) => t.parentId === id);
  }

  descendantsOf(id: string): Set<string> {
    const out = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      this.tasks.forEach((t) => {
        if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
          out.add(t.id);
          grew = true;
        }
      });
    }
    return out;
  }

  matches(task: Task, q: string): boolean {
    if (!q) return true;
    if (task.name.toLowerCase().includes(q)) return true;
    return this.getChildren(task.id).some((c) => this.matches(c, q));
  }

  /* ── Sizing ──────────────────────────────────────────────────────────── */

  autoSizeOf(id: string, skipId: MaybeId): { w: number; h: number } {
    const t = this.byId(id);
    if (!t) return { w: LEAF_W, h: LEAF_H };
    const kids = this.getChildren(id).filter((k) => k.id !== skipId);
    if (!kids.length) return leafSize(t.name);
    const headerW = headerLineWidth(t.name);
    if (t.collapsed) return { w: Math.max(LEAF_W, headerW), h: HEADER_H };
    let maxR = 0;
    let maxB = 0;
    kids.forEach((k) => {
      const ks = this.sizeOfTask(k.id, skipId);
      maxR = Math.max(maxR, k.x + ks.w);
      maxB = Math.max(maxB, k.y + ks.h);
    });
    return { w: Math.max(LEAF_W, maxR + INSET_X + PAD, headerW), h: HEADER_H + maxB + PAD };
  }

  sizeOfTask(id: string, skipId: MaybeId): { w: number; h: number } {
    const t = this.byId(id);
    if (!t) return { w: LEAF_W, h: LEAF_H };
    const auto = this.autoSizeOf(id, skipId);
    const kids = this.getChildren(id);
    if (!kids.length || t.collapsed) return auto;
    return { w: Math.max(auto.w, t.minW || 0), h: Math.max(auto.h, t.minH || 0) };
  }

  /* ── Recursive layout ────────────────────────────────────────────────── */

  layout(rootId: MaybeId, skipId: MaybeId): LayoutResult {
    const nodes: LayoutNode[] = [];
    const place = (id: string, ax: number, ay: number, depth: number) => {
      const t = this.byId(id)!;
      const kids = this.getChildren(id).filter((k) => k.id !== skipId);
      const s = this.sizeOfTask(id, skipId);
      const isContainer = kids.length > 0 && !t.collapsed;
      nodes.push({
        id,
        task: t,
        x: ax,
        y: ay,
        w: s.w,
        h: s.h,
        depth,
        isContainer,
        hasKids: this.getChildren(id).length > 0,
      });
      if (isContainer)
        kids.forEach((k) =>
          place(k.id, ax + INSET_X + k.x, ay + HEADER_H + k.y, depth + 1),
        );
    };
    this.getChildren(rootId)
      .filter((k) => k.id !== skipId)
      .forEach((k) => place(k.id, k.x, k.y, 0));
    return {
      nodes,
      map: nodes.reduce<Record<string, LayoutNode>>((m, n) => {
        m[n.id] = n;
        return m;
      }, {}),
    };
  }

  originOf(parentId: string, editingTaskId: MaybeId, map: Record<string, LayoutNode>): Point {
    if (parentId === editingTaskId) return { x: 0, y: 0 };
    const n = map[parentId];
    return n ? { x: n.x + INSET_X, y: n.y + HEADER_H } : { x: 0, y: 0 };
  }

  hitTest(px: number, py: number, exclude: Set<string>, layoutRes: LayoutResult): string | null {
    const sorted = [...layoutRes.nodes].sort((a, b) => b.depth - a.depth);
    for (const n of sorted) {
      if (exclude.has(n.id)) continue;
      if (px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h) return n.id;
    }
    return null;
  }

  /** Tasks never overlap: if the drop point hits a sibling, it drops to the first free gap. */
  resolveOverlap(parentId: MaybeId, id: string, x: number, y: number): Point {
    const GAP = 16;
    const size = this.sizeOfTask(id, null);
    const sibs = this.getChildren(parentId)
      .filter((k) => k.id !== id)
      .map((k) => ({ x: k.x, y: k.y, ...this.sizeOfTask(k.id, id) }));
    let px = x;
    let py = y;
    for (let i = 0; i < 60; i++) {
      const hit = sibs.find(
        (sb) =>
          px < sb.x + sb.w + GAP &&
          px + size.w + GAP > sb.x &&
          py < sb.y + sb.h + GAP &&
          py + size.h + GAP > sb.y,
      );
      if (!hit) break;
      // Push along whichever axis needs less movement to clear the obstacle,
      // instead of always dropping down.
      const pushDown = hit.y + hit.h + GAP - py;
      const pushRight = hit.x + hit.w + GAP - px;
      if (pushRight < pushDown) px = hit.x + hit.w + GAP;
      else py = hit.y + hit.h + GAP;
    }
    return { x: px, y: py };
  }

  /**
   * After a container grows it may invade its siblings; this pass pushes the
   * overlapping ones down, at every level, until nobody overlaps. Returns a new
   * tasks array when anything moved, else null.
   */
  relaxOverlaps(): Task[] | null {
    const GAP = 16;
    const tasks = this.tasks;
    const byId: Record<string, Task> = {};
    tasks.forEach((t) => (byId[t.id] = t));
    const pos: Record<string, Point> = {};
    tasks.forEach((t) => (pos[t.id] = { x: t.x, y: t.y }));
    const kidsOf: Record<string, string[]> = {};
    tasks.forEach((t) => {
      const k = t.parentId || "__root";
      (kidsOf[k] = kidsOf[k] || []).push(t.id);
    });

    const sizeOf = (id: string): { w: number; h: number } => {
      const t = byId[id];
      const kids = kidsOf[id] || [];
      if (!kids.length) return leafSize(t.name);
      const headerW = headerLineWidth(t.name);
      if (t.collapsed) return { w: Math.max(LEAF_W, headerW), h: HEADER_H };
      let maxR = 0;
      let maxB = 0;
      kids.forEach((k) => {
        const ks = sizeOf(k);
        maxR = Math.max(maxR, pos[k].x + ks.w);
        maxB = Math.max(maxB, pos[k].y + ks.h);
      });
      return {
        w: Math.max(LEAF_W, maxR + INSET_X + PAD, headerW, t.minW || 0),
        h: Math.max(HEADER_H + maxB + PAD, t.minH || 0),
      };
    };

    let moved = false;
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      Object.values(kidsOf).forEach((ids) => {
        const items = ids
          .map((id) => ({ id, ...pos[id], ...sizeOf(id) }))
          .sort((a, b) => a.y - b.y || a.x - b.x);
        items.forEach((it, i) => {
          for (let guard = 0; guard < 60; guard++) {
            const hit = items
              .slice(0, i)
              .find(
                (sb) =>
                  it.x < sb.x + sb.w + GAP &&
                  it.x + it.w + GAP > sb.x &&
                  it.y < sb.y + sb.h + GAP &&
                  it.y + it.h + GAP > sb.y,
              );
            if (!hit) break;
            // Push along whichever axis needs less movement to clear the obstacle,
            // instead of always dropping down.
            const pushDown = hit.y + hit.h + GAP - it.y;
            const pushRight = hit.x + hit.w + GAP - it.x;
            if (pushRight < pushDown) it.x = hit.x + hit.w + GAP;
            else it.y = hit.y + hit.h + GAP;
            pos[it.id] = { x: it.x, y: it.y };
            changed = true;
            moved = true;
          }
        });
      });
      if (!changed) break;
    }
    if (!moved) return null;
    return tasks.map((t) =>
      pos[t.id] && (pos[t.id].x !== t.x || pos[t.id].y !== t.y)
        ? { ...t, x: pos[t.id].x, y: pos[t.id].y }
        : t,
    );
  }

  /* ── Status resolution ───────────────────────────────────────────────── */

  statusResolver() {
    const preds: Record<string, string[]> = {};
    this.tasks.forEach((t) =>
      (t.seqNext || []).forEach((n) => {
        (preds[n] = preds[n] || []).push(t.id);
      }),
    );
    const memo: Record<string, TaskStatus> = {};
    const visiting = new Set<string>();
    const eff = (id: string): TaskStatus => {
      if (memo[id]) return memo[id];
      const t = this.byId(id);
      if (!t) return "pendiente";
      if (visiting.has(id)) return t.status;
      visiting.add(id);
      // A root node is a Project, and the sequence between projects is order,
      // not a rule: a project placed after another is NOT blocked by it and can
      // be worked on normally. So the blocking rule is skipped here — and only
      // here. Inside a project, tasks keep blocking each other exactly as
      // before. Do not "fix" this by removing the check: `bloqueada` never
      // applies to a Project, and it is not inherited by its tasks either.
      const ps = isProjectNode(t) ? [] : preds[id] || [];
      let r: TaskStatus;
      if (ps.some((p) => eff(p) !== "completada")) {
        r = "bloqueada";
      } else {
        // A container reflects its most active child: any nested task still
        // en_progreso means the parent reads as en_progreso too, even if its
        // own stored status says otherwise (e.g. it was completed and a
        // child got reopened later).
        const hasActiveChild = this.getChildren(id).some((k) => eff(k.id) === "en_progreso");
        r = hasActiveChild ? "en_progreso" : t.status;
      }
      visiting.delete(id);
      memo[id] = r;
      return r;
    };
    const blockers = (id: string): string[] => {
      const t = this.byId(id);
      if (!t || isProjectNode(t)) return [];
      return (preds[id] || [])
        .filter((p) => eff(p) !== "completada")
        .map((p) => this.byId(p)!.name);
    };
    const canComplete = (id: string): boolean =>
      [...this.descendantsOf(id)].every((d) => d === id || eff(d) === "completada");
    const activeChildren = (id: string): string[] =>
      this.getChildren(id)
        .filter((k) => eff(k.id) === "en_progreso")
        .map((k) => k.name);
    return { eff, blockers, canComplete, activeChildren };
  }

  /* ── Sequence linking rules ──────────────────────────────────────────── */

  canReach(aId: string, bId: string): boolean {
    const seen = new Set<string>();
    const stack = [aId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === bId) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const t = this.byId(cur);
      (t && t.seqNext ? t.seqNext : []).forEach((n) => stack.push(n));
    }
    return false;
  }

  canLink(sourceId: string, targetId: MaybeId): boolean {
    if (!targetId || sourceId === targetId) return false;
    const source = this.byId(sourceId);
    const ancestors = new Set<string>();
    let cur = source;
    while (cur && cur.parentId) {
      ancestors.add(cur.parentId);
      cur = this.byId(cur.parentId);
    }
    if (ancestors.has(targetId)) return false;
    if (this.descendantsOf(sourceId).has(targetId)) return false;
    if (this.canReach(targetId, sourceId)) return false;
    return true;
  }

  handleTopOf(n: LayoutNode): number {
    return n.isContainer ? HEADER_H / 2 : n.h / 2;
  }

  /* ── Bézier / routing helpers ────────────────────────────────────────── */

  private cubicSamples(
    x1: number, y1: number, c1x: number, c1y: number,
    c2x: number, c2y: number, x2: number, y2: number, n: number,
  ): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = 1 - u;
      pts.push({
        x: v * v * v * x1 + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * x2,
        y: v * v * v * y1 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y2,
      });
    }
    return pts;
  }

  private blockedBy(samples: Point[], obstacles: Rect[]): Rect[] {
    const pad = 4;
    return obstacles.filter((o) =>
      samples.some(
        (p) => p.x > o.x - pad && p.x < o.x + o.w + pad && p.y > o.y - pad && p.y < o.y + o.h + pad,
      ),
    );
  }

  /** Two-segment bézier detour with horizontal tangents at the ends and midpoint. */
  private detour(x1: number, y1: number, x2: number, y2: number, dy: number): { d: string; samples: Point[] } {
    const back = x2 < x1 - 20;
    const near = back && x1 - x2 < 200;
    if (back && !near) {
      const mx2 = (x1 + x2) / 2;
      const k1 = Math.min(160, Math.max(60, Math.abs(mx2 - x1) / 2));
      const k2 = Math.min(160, Math.max(60, Math.abs(x2 - mx2) / 2));
      return {
        d: `M ${x1} ${y1} C ${x1 - k1} ${y1}, ${mx2 + k1} ${dy}, ${mx2} ${dy} C ${mx2 - k2} ${dy}, ${x2 + k2} ${y2}, ${x2} ${y2}`,
        samples: [
          ...this.cubicSamples(x1, y1, x1 - k1, y1, mx2 + k1, dy, mx2, dy, 20),
          ...this.cubicSamples(mx2, dy, mx2 - k2, dy, x2 + k2, y2, x2, y2, 20),
        ],
      };
    }
    const mx = near ? Math.min(x1, x2) - 58 : (x1 + x2) / 2;
    const c1 = back
      ? 32
      : Math.min(140, Math.max(24, Math.min(44, Math.abs(mx - x1)), Math.abs(mx - x1) / 2));
    const c2 = back
      ? Math.min(60, Math.max(40, Math.abs(x2 - mx) / 2))
      : Math.min(140, Math.max(24, Math.min(44, Math.abs(x2 - mx)), Math.abs(x2 - mx) / 2));
    return {
      d: `M ${x1} ${y1} C ${x1 + c1} ${y1}, ${mx - c1} ${dy}, ${mx} ${dy} C ${mx + c2} ${dy}, ${x2 - c2} ${y2}, ${x2} ${y2}`,
      samples: [
        ...this.cubicSamples(x1, y1, x1 + c1, y1, mx - c1, dy, mx, dy, 20),
        ...this.cubicSamples(mx, dy, mx + c2, dy, x2 - c2, y2, x2, y2, 20),
      ],
    };
  }

  private smoothSegments(pts: Point[]) {
    const segs: { p1: Point; p2: Point; c1: Point; c2: Point }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || pts[i + 1];
      segs.push({
        p1,
        p2,
        c1: { x: p1.x + (p2.x - p0.x) / 5, y: p1.y + (p2.y - p0.y) / 5 },
        c2: { x: p2.x - (p3.x - p1.x) / 5, y: p2.y - (p3.y - p1.y) / 5 },
      });
    }
    return segs;
  }

  private smoothPath(pts: Point[]): string {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    this.smoothSegments(pts).forEach((s) => {
      d += ` C ${s.c1.x} ${s.c1.y}, ${s.c2.x} ${s.c2.y}, ${s.p2.x} ${s.p2.y}`;
    });
    return d;
  }

  private smoothSamples(pts: Point[], per: number): Point[] {
    const out: Point[] = [];
    this.smoothSegments(pts).forEach((s) => {
      out.push(...this.cubicSamples(s.p1.x, s.p1.y, s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p2.x, s.p2.y, per));
    });
    return out;
  }

  /** Builds every sequence arrow, routing around obstacles where the direct curve is blocked. */
  arrowsFor(layoutRes: LayoutResult): ArrowSegment[] {
    const segs: ArrowSegment[] = [];
    const related = (id: string): Set<string> => {
      const set = new Set<string>();
      let cur = this.byId(id);
      while (cur && cur.parentId) {
        set.add(cur.parentId);
        cur = this.byId(cur.parentId);
      }
      return set;
    };
    this.tasks.forEach((t) => {
      (t.seqNext || []).forEach((nextId) => {
        const a = layoutRes.map[t.id];
        const b = layoutRes.map[nextId];
        if (!a || !b) return;
        const x1 = a.x + a.w;
        const y1 = a.y + this.handleTopOf(a);
        const x2 = b.x;
        const y2 = b.y + this.handleTopOf(b);
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const c = Math.min(190, Math.max(44, Math.abs(x2 - x1) / 2, dist * 0.35));
        const straight = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
        const ancA = related(t.id);
        const ancB = related(nextId);
        const ancestors = new Set<string>([...ancA, ...ancB]);
        const skip = new Set<string>([t.id, nextId, ...ancestors]);
        const obstacles: Rect[] = layoutRes.nodes
          .filter((n) => !skip.has(n.id))
          .map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
        layoutRes.nodes.forEach((n) => {
          if (ancestors.has(n.id)) obstacles.push({ id: n.id + ":h", x: n.x, y: n.y, w: n.w, h: HEADER_H });
        });
        const outer = (chain: Set<string>, other: Set<string>): LayoutNode | null => {
          let box: LayoutNode | null = null;
          chain.forEach((id) => {
            if (!other.has(id) && layoutRes.map[id]) box = layoutRes.map[id];
          });
          return box;
        };
        const boxA = outer(ancA, ancB);
        const boxB = outer(ancB, ancA);
        const directSamples = this.cubicSamples(x1, y1, x1 + c, y1, x2 - c, y2, x2, y2, 30);
        const insideRect = (p: Point, r: LayoutNode) =>
          p.x > r.x + 2 && p.x < r.x + r.w - 2 && p.y > r.y + 2 && p.y < r.y + r.h - 2;
        const midDirect = directSamples.slice(5, directSamples.length - 5);
        if (
          !this.blockedBy(directSamples, obstacles).length &&
          !midDirect.some((p) => insideRect(p, a) || insideRect(p, b))
        ) {
          segs.push({ d: straight, from: t.id, to: nextId });
          return;
        }
        if (boxA || boxB) {
          const bA = boxA as LayoutNode | null;
          const bB = boxB as LayoutNode | null;
          const ex1 = bA ? bA.x + bA.w + 24 : x1 + 26;
          const ex2 = bB ? bB.x - 24 : x2 - 26;
          const frame = [a, b, bA, bB].filter(Boolean) as LayoutNode[];
          const top = Math.min(...frame.map((o) => o.y));
          const bottom = Math.max(...frame.map((o) => o.y + o.h));
          const outsideObstacles: Rect[] = obstacles
            .filter(
              (o) =>
                !(bA && o.id.indexOf(bA.id) === 0) && !(bB && o.id.indexOf(bB.id) === 0),
            )
            .concat(
              ([bA, bB].filter(Boolean) as LayoutNode[]).map((o) => ({
                id: o.id + ":box",
                x: o.x,
                y: o.y,
                w: o.w,
                h: o.h,
              })),
            );
          const cs = Math.max(30, Math.abs(ex2 - ex1) / 2);
          const plain = this.cubicSamples(ex1, y1, ex1 + cs, y1, ex2 - cs, y2, ex2, y2, 24);
          if (!this.blockedBy(plain, outsideObstacles).length) {
            const ce = Math.min(190, Math.max(50, Math.abs(x2 - x1) / 2, Math.hypot(x2 - x1, y2 - y1) * 0.35));
            segs.push({ d: `M ${x1} ${y1} C ${x1 + ce} ${y1}, ${x2 - ce} ${y2}, ${x2} ${y2}`, from: t.id, to: nextId });
            return;
          }
          const rx = (bA ? bA.x + bA.w : x1) + 36;
          const lx = (bB ? bB.x : x2) - 36;
          let pick: { n: number; pts: Point[] } | null = null;
          for (const dy of [bottom + 34, top - 34, bottom + 80, top - 80, bottom + 140, top - 140]) {
            const pts = [
              { x: x1, y: y1 },
              { x: rx, y: dy },
              { x: lx, y: dy },
              { x: x2, y: y2 },
            ];
            const sm = this.smoothSamples(pts, 16);
            const n = this.blockedBy(sm.slice(9, sm.length - 9), outsideObstacles).length;
            if (!pick || n < pick.n) pick = { n, pts };
            if (n === 0) break;
          }
          segs.push({ d: this.smoothPath(pick!.pts), from: t.id, to: nextId });
          return;
        }
        const crossesEnds = (samples: Point[]): number => {
          const mid = samples.slice(6, samples.length - 6);
          const inside = (p: Point, r: LayoutNode) =>
            p.x > r.x + 2 && p.x < r.x + r.w - 2 && p.y > r.y + 2 && p.y < r.y + r.h - 2;
          return mid.filter((p) => inside(p, a) || inside(p, b)).length ? 1 : 0;
        };
        let d = straight;
        const straightSamples = this.cubicSamples(x1, y1, x1 + c, y1, x2 - c, y2, x2, y2, 28);
        const hits = this.blockedBy(straightSamples, obstacles);
        if (crossesEnds(straightSamples)) hits.push({ id: "ends", x: 0, y: 0, w: 0, h: 0 });
        if (hits.length) {
          const boxes = hits.filter((o) => o.h !== undefined && o.id !== "ends");
          const ends = [a, b];
          const top = Math.min(...[...boxes, ...ends].map((o) => o.y));
          const bottom = Math.max(...[...boxes, ...ends].map((o) => o.y + o.h));
          const candidates = [
            bottom + 26, top - 26, bottom + 56, top - 56,
            bottom + 96, top - 96, bottom + 150, top - 150,
          ];
          let best: { n: number; d: string } | null = null;
          for (const dy of candidates) {
            const route = this.detour(x1, y1, x2, y2, dy);
            if (crossesEnds(route.samples)) continue;
            const n = this.blockedBy(route.samples, obstacles).length;
            if (!best || n < best.n) best = { n, d: route.d };
            if (n === 0) break;
          }
          if (!best) best = { n: 0, d: this.detour(x1, y1, x2, y2, bottom + 26).d };
          d = best.d;
        }
        segs.push({ d, from: t.id, to: nextId });
      });
    });
    return segs;
  }
}
