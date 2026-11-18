/* =========================================================
   model.js —— 任务数据模型、业务逻辑与本周计划（纯函数）
   ========================================================= */

(function (global) {
  "use strict";
  const App = (global.App = global.App || {});
  const U = App.utils;

  const CATEGORIES = ["课程", "社团", "生活", "其他"];
  const PRIORITIES = { high: "高", medium: "中", low: "低" };
  const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };
  const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  const REST_TYPES = [
    { key: "meal", label: "吃饭", icon: "🍚" },
    { key: "nap", label: "午睡", icon: "😴" },
    { key: "sleep", label: "晚睡", icon: "🌙" }
  ];

  const DAY_START = 7 * 60, DAY_END = 23 * 60, BUFFER_MIN = 30;

  const PRESETS = [
    { key: "all", label: "全部" },
    { key: "today", label: "今天截止" },
    { key: "week", label: "本周截止" },
    { key: "overdue", label: "已逾期" },
    { key: "important", label: "重要" },
    { key: "done", label: "已完成" },
    { key: "undone", label: "未完成" }
  ];

  const model = {
    CATEGORIES, PRIORITIES, DAYS, REST_TYPES, DAY_START, DAY_END, BUFFER_MIN, PRESETS,

    /* ============ 任务 CRUD ============ */
    createTask(data) {
      const now = Date.now();
      return {
        id: U.uid(),
        title: String(data.title || "").trim(),
        desc: String(data.desc || "").trim(),
        category: CATEGORIES.includes(data.category) ? data.category : "其他",
        priority: PRIORITIES[data.priority] ? data.priority : "medium",
        tags: parseTags(data.tags),
        due: data.due ? new Date(data.due).getTime() : null,
        done: false,
        critical: !!data.critical,
        estimate: parseInt(data.estimate, 10) || 0,
        planned: null,
        createdAt: now,
        completedAt: null,
        order: now
      };
    },

    updateTask(task, data) {
      Object.assign(task, {
        title: String(data.title).trim(),
        desc: String(data.desc || "").trim(),
        category: CATEGORIES.includes(data.category) ? data.category : "其他",
        priority: PRIORITIES[data.priority] ? data.priority : "medium",
        tags: parseTags(data.tags),
        due: data.due ? new Date(data.due).getTime() : null,
        critical: !!data.critical,
        estimate: parseInt(data.estimate, 10) || 0
      });
      return task;
    },

    toggleDone(task) {
      task.done = !task.done;
      task.completedAt = task.done ? Date.now() : null;
      return task;
    },

    isOverdue(task) { return !task.done && task.due && task.due < Date.now(); },
    isDueSoon(task) {
      if (task.done || !task.due) return false;
      const diff = task.due - Date.now();
      return diff > 0 && diff < 86400000;
    },
    isDueToday(task) {
      if (task.done || !task.due) return false;
      const t0 = U.startOfDay(Date.now());
      return task.due >= t0 && task.due < t0 + 86400000;
    },
    isDueThisWeek(task) {
      if (task.done || !task.due) return false;
      const now = Date.now();
      return task.due >= now && task.due < now + 7 * 86400000;
    },

    /* ============ 查询 ============ */
    query(tasks, filters) {
      const { view = "all", category = "all", keyword = "", sort = "due-asc" } = filters || {};
      const kw = keyword.trim().toLowerCase();

      let list = tasks.filter((t) => {
        if (view === "today" && !model.isDueToday(t)) return false;
        if (view === "week" && !model.isDueThisWeek(t)) return false;
        if (view === "overdue" && !model.isOverdue(t)) return false;
        if (view === "done" && !t.done) return false;
        if (view === "undone" && t.done) return false;
        if (view === "important" && (t.done || (!t.critical && t.priority !== "high"))) return false;
        if (view !== "all" && view !== "done" && t.done) return false;

        if (category !== "all" && t.category !== category) return false;
        if (kw) {
          const hay = (t.title + " " + t.desc + " " + t.tags.join(" ")).toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });

      const sorters = {
        "due-asc": (a, b) => (a.due || Infinity) - (b.due || Infinity),
        "due-desc": (a, b) => (b.due || -Infinity) - (a.due || -Infinity),
        priority: (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || (a.due || Infinity) - (b.due || Infinity),
        "created-desc": (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
        order: (a, b) => (a.order || 0) - (b.order || 0)
      };
      list.sort(sorters[sort] || sorters["due-asc"]);
      return list;
    },

    computeStats(tasks) {
      const total = tasks.length;
      const done = tasks.filter((t) => t.done).length;
      const overdue = tasks.filter((t) => model.isOverdue(t)).length;
      const pending = total - done;
      const rate = total ? Math.round((done / total) * 100) : 0;
      return { total, done, pending, overdue, rate };
    },

    /* ============ 时间管理 ============ */
    minToStr(min) {
      const p = (n) => String(n).padStart(2, "0");
      return `${p(Math.floor(min / 60))}:${p(min % 60)}`;
    },
    strToMin(str) {
      if (!str) return 0;
      const [h, m] = str.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    },

    /** 本周周一的零点时间戳（课程按自然周对齐时可用） */
    startOfWeek(now) {
      const d = new Date(now);
      const diff = (d.getDay() + 6) % 7;
      return U.startOfDay(now) - diff * 86400000;
    },

    /** 未来 7 天（从今天起），返回 { ts, dayIdx, label, isToday }；dayIdx 为该天对应的星期（1=周一…7=周日） */
    weekDays(now) {
      const start = U.startOfDay(now);
      const out = [];
      for (let i = 0; i < 7; i++) {
        const ts = start + i * 86400000;
        const d = new Date(ts);
        const dayIdx = ((d.getDay() + 6) % 7) + 1;
        out.push({
          ts,
          dayIdx,
          label: `${d.getMonth() + 1}/${d.getDate()} ${DAYS[dayIdx - 1]}`,
          isToday: i === 0
        });
      }
      return out;
    },

    /** 时间戳 → 当日分钟数（0~1440） */
    minutesOfDay(ts) {
      const d = new Date(ts);
      return d.getHours() * 60 + d.getMinutes();
    },

    /** 某一天的占用区间（课程 + 固定休息 + 已计划任务），分钟坐标，按开始时间排序 */
    dayBusy(now, dayIdx) {
      const day = model.weekDays(now).find((w) => w.dayIdx === dayIdx);
      const busy = [];
      App.state.schedule.classes.forEach((c) => { if (c.day === dayIdx) busy.push({ start: c.start, end: c.end, type: "class" }); });
      App.state.schedule.rests.forEach((r) => { if (r.day === dayIdx) busy.push({ start: r.start, end: r.end, type: "rest" }); });
      App.state.tasks.forEach((t) => {
        if (!t.planned) return;
        const s = t.planned.start, e = t.planned.end;
        if (!day || s < day.ts || s >= day.ts + 86400000) return;
        busy.push({ start: model.minutesOfDay(s), end: model.minutesOfDay(e), type: "task" });
      });
      busy.sort((a, b) => a.start - b.start);
      return busy;
    },

    /** 某一天的空闲区间（除去占用后剩余的 07:00~23:00 时间） */
    dayFree(now, dayIdx) {
      const busy = model.dayBusy(now, dayIdx);
      const free = [];
      let cur = DAY_START;
      busy.forEach((b) => {
        const s = Math.max(DAY_START, b.start);
        const e = Math.min(DAY_END, b.end);
        if (e <= s) return;
        if (s > cur) free.push({ start: cur, end: s });
        cur = Math.max(cur, e);
      });
      if (cur < DAY_END) free.push({ start: cur, end: DAY_END });
      return free;
    },

    /** 给空闲区间施加「任务 ↔ 课程」之间 30 分钟缓冲，返回仍可用的区间 */
    applyBuffer(free, busy) {
      return free
        .map((f) => {
          let s = f.start, e = f.end;
          if (busy.some((b) => b.type === "class" && b.end === f.start)) s += BUFFER_MIN;
          if (busy.some((b) => b.type === "class" && b.start === f.end)) e -= BUFFER_MIN;
          return { start: s, end: e };
        })
        .filter((f) => f.end - f.start > 0);
    },

    /** 单个空闲块的可用范围（已扣除与课程相邻的缓冲）；完全被缓冲占用时返回 null */
    slotUsable(now, dayIdx, start, end) {
      const busy = model.dayBusy(now, dayIdx);
      const usable = model.applyBuffer([{ start, end }], busy);
      return usable.length ? usable[0] : null;
    },

    /** 固定休息类型 → 显示名称 */
    restLabel(type) {
      const r = REST_TYPES.find((x) => x.key === type);
      return r ? r.label : "休息";
    },

    /** 为任务生成未来 7 天计划（贪心，按截止时间，周一至周五优先），供初始化预排使用 */
    generatePlan(selectedTasks, now) {
      const n = now || Date.now();
      const isWeekend = (d) => d === 6 || d === 7;
      const intervals = [];
      model.weekDays(n).forEach((w) => {
        const busy = model.dayBusy(n, w.dayIdx);
        model.applyBuffer(model.dayFree(n, w.dayIdx), busy).forEach((u) => {
          intervals.push({ dayIdx: w.dayIdx, ts: w.ts, start: u.start, end: u.end });
        });
      });
      // 周一至周五优先，其次按时间先后
      intervals.sort((a, b) =>
        (isWeekend(a.dayIdx) - isWeekend(b.dayIdx)) ||
        (a.ts + a.start * 60000) - (b.ts + b.start * 60000)
      );

      const pending = selectedTasks
        .filter((t) => !t.done && t.estimate > 0)
        .sort((a, b) => (a.due || Infinity) - (b.due || Infinity));

      const blocks = [];
      const failed = [];
      pending.forEach((t) => {
        const need = t.estimate;
        let placed = false;
        for (const it of intervals) {
          let startAbs = it.ts + it.start * 60000;
          const endAbs = it.ts + it.end * 60000;
          if (endAbs <= n) continue;                         // 整段已过去
          if (startAbs < n) {                                // 区间跨过“现在”，从当前时刻起算
            it.start = Math.round((n - it.ts) / 60000);
            startAbs = it.ts + it.start * 60000;
          }
          if (endAbs - startAbs < need * 60000) continue;    // 时段不足
          if (t.due && startAbs + need * 60000 > t.due) continue; // 超过截止
          const start = startAbs, end = startAbs + need * 60000;
          blocks.push({ taskId: t.id, start, end });
          t.planned = { start, end };
          it.start += need;                                  // 收缩区间
          placed = true;
          break;
        }
        if (!placed) failed.push({ id: t.id, title: t.title, estimate: t.estimate });
      });
      return { blocks, failed };
    }
  };

  function parseTags(str) {
    if (Array.isArray(str)) return [...new Set(str.map((s) => String(s).trim()).filter(Boolean))];
    return [...new Set(String(str || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean))];
  }

  App.model = model;
})(window);
