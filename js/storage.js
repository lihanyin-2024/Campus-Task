/* =========================================================
   storage.js —— 数据持久化层
   基于 localStorage 的统一存取，带版本号与数据校验/迁移能力
   ========================================================= */

(function (global) {
  "use strict";
  const App = (global.App = global.App || {});

  const STORAGE_KEY = "campus-task:v2";
  const THEME_KEY = "campus-task:theme";

  /** 默认数据结构（含 schema 版本，便于日后迁移） */
  function defaultState() {
    return {
      version: 2,
      tasks: [],
      pomodoro: {
        focusMin: 25,
        breakMin: 5,
        sessionsToday: 0,
        totalMinutes: 0,
        lastSessionDay: null
      },
      // 课表 + 固定休息 + 空闲备注（day: 1=周一 … 7=周日；start/end 为分钟数 0-1440）
      schedule: {
        classes: [],  // { id, name, day, start, end, location, teacher }
        rests: [],    // { id, type(meal|nap|sleep), day, start, end }
        notes: []     // { id, day, start, end, text }
      },
      settings: {
        warnLead: 30    // 预警提前分钟数（后果严重任务）
      }
    };
  }

  /** 数据校验：确保读取到的对象结构合法 */
  function sanitize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== "object") return base;
    const out = { ...base, ...raw };
    if (!Array.isArray(out.tasks)) out.tasks = [];
    out.tasks = out.tasks
      .filter((t) => t && typeof t.id === "string")
      .map((t) => ({
        ...t,
        critical: !!t.critical,
        estimate: typeof t.estimate === "number" ? t.estimate : 0,
        planned: t.planned && t.planned.start ? t.planned : null
      }));
    if (!out.pomodoro || typeof out.pomodoro !== "object") out.pomodoro = base.pomodoro;
    if (!out.schedule || typeof out.schedule !== "object") out.schedule = base.schedule;
    if (!Array.isArray(out.schedule.classes)) out.schedule.classes = [];
    out.schedule.classes = out.schedule.classes.map((c) => ({
      id: c.id, name: String(c.name || ""), day: c.day, start: c.start, end: c.end,
      location: String(c.location || ""), teacher: String(c.teacher || "")
    }));
    if (!Array.isArray(out.schedule.rests)) out.schedule.rests = [];
    out.schedule.rests = out.schedule.rests
      .filter((r) => r && r.day && r.start != null && r.end != null)
      .map((r) => ({ id: r.id || App.utils.uid(), type: r.type || "meal", day: r.day, start: r.start, end: r.end }));
    if (!Array.isArray(out.schedule.notes)) out.schedule.notes = [];
    out.schedule.notes = out.schedule.notes
      .filter((n) => n && n.day && n.start != null && n.end != null)
      .map((n) => ({ id: n.id || App.utils.uid(), day: n.day, start: n.start, end: n.end, text: String(n.text || "") }));
    if (!out.settings || typeof out.settings !== "object") out.settings = base.settings;
    if (typeof out.settings.warnLead !== "number") out.settings.warnLead = base.settings.warnLead;
    return out;
  }

  const store = {
    load() {
      try {
        const text = localStorage.getItem(STORAGE_KEY);
        if (!text) return defaultState();
        return sanitize(JSON.parse(text));
      } catch (e) {
        console.warn("状态解析失败，已重置为默认值", e);
        return defaultState();
      }
    },

    save(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.error("保存失败：localStorage 可能已满", e);
        return false;
      }
    },

    /* ---- 主题偏好 ---- */
    getTheme() {
      const t = localStorage.getItem(THEME_KEY);
      return t === "dark" || t === "light" ? t : "light";
    },
    setTheme(theme) {
      localStorage.setItem(THEME_KEY, theme);
    }
  };

  App.store = store;
})(window);
