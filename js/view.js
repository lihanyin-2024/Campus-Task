/* =========================================================
   view.js —— 视图层：表格清单、批量管理、预设视图、本周时间表、计划
   ========================================================= */

(function (global) {
  "use strict";
  const App = (global.App = global.App || {});
  const U = App.utils;
  const M = App.model;

  const PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };
  const VIEW_EMPTY = {
    all: "还没有任务，点击右下角「＋」添加一条吧",
    today: "今天没有截止的任务",
    week: "未来 7 天内没有截止的任务",
    overdue: "没有逾期任务，太棒了！",
    important: "没有标记为「重要」的任务",
    done: "还没有已完成的任务",
    undone: "所有任务都已完成 🎉"
  };
  let toastTimer = null;

  const view = {
    _quoteLoaded: false,
    batchMode: false,
    selected: new Set(),

    /* ============ 顶层渲染 ============ */
    render() {
      this.renderStats();
      this.renderViews();
      this.renderTasks();
      if (App.pomodoro && App.pomodoro._render) App.pomodoro._render();
    },

    renderStats() {
      const s = M.computeStats(App.state.tasks);
      document.getElementById("stat-total").textContent = s.total;
      document.getElementById("stat-done").textContent = s.done;
      document.getElementById("stat-pending").textContent = s.pending;
      document.getElementById("stat-overdue").textContent = s.overdue;
    },

    renderViews() {
      M.PRESETS.forEach((p) => {
        const n = M.query(App.state.tasks, { view: p.key, category: "all" }).length;
        const el = document.querySelector(`[data-count="${p.key}"]`);
        if (el) el.textContent = n;
      });
      document.querySelectorAll(".view-item").forEach((b) =>
        b.classList.toggle("view-item--active", b.dataset.view === App.filters.view)
      );
    },

    /* ============ 任务表格 ============ */
    renderTasks() {
      const tbody = document.getElementById("task-list");
      const emptyEl = document.getElementById("empty-state");
      document.getElementById("th-select").hidden = !this.batchMode;

      const list = M.query(App.state.tasks, App.filters);
      tbody.innerHTML = list.map((t) => this._taskRowHTML(t)).join("");
      emptyEl.hidden = list.length !== 0;
      document.getElementById("empty-text").textContent = VIEW_EMPTY[App.filters.view] || VIEW_EMPTY.all;
      if (this.batchMode) this._updateBatchUI();
    },

    _taskRowHTML(t) {
      const selCell = this.batchMode
        ? `<td class="col-sel"><input type="checkbox" class="task-select" data-id="${t.id}" ${this.selected.has(t.id) ? "checked" : ""} /></td>`
        : "";

      let dueBadge = "";
      if (t.due) {
        let cls = "badge--due";
        let label = U.formatDateTime(t.due);
        if (!t.done) {
          if (M.isOverdue(t)) { cls = "badge--due--overdue"; label = "已逾期 " + U.relativeDue(t.due); }
          else if (M.isDueSoon(t)) { cls = "badge--due--soon"; label = "剩 " + U.relativeDue(t.due); }
        }
        dueBadge = `<span class="badge ${cls}">${label}</span>`;
      }

      const critical = t.critical ? `<span class="badge badge--critical">⚠ 严重</span>` : "";
      const estimate = t.estimate ? `<span class="badge badge--due">⏱ ${t.estimate}min</span>` : "";
      const tags = (t.tags || []).map((tag) => `<span class="badge badge--tag">#${U.escapeHtml(tag)}</span>`).join(" ");

      return `
        <tr class="task${t.done ? " task--done" : ""}" data-id="${t.id}">
          ${selCell}
          <td class="col-check">
            <button class="task__check" data-action="toggle" title="${t.done ? "标记为未完成" : "标记为完成"}">
              <svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </button>
          </td>
          <td class="col-title">
            <div class="task__title">${U.escapeHtml(t.title)}</div>
            ${t.desc ? `<div class="task__desc">${U.escapeHtml(t.desc)}</div>` : ""}
          </td>
          <td><span class="badge badge--cat">${U.escapeHtml(t.category)}</span></td>
          <td><span class="badge badge--${t.priority}">${PRIORITY_LABEL[t.priority]}</span>${critical}</td>
          <td class="col-due">${dueBadge}${estimate}</td>
          <td class="col-tags">${tags || "—"}</td>
          <td class="col-actions">
            <button class="act" data-action="edit" title="编辑">✎</button>
            <button class="act act-del" data-action="delete" title="删除">🗑</button>
          </td>
        </tr>`;
    },

    /* ============ 专注页 / 每日一言 ============ */
    renderFocus() {
      if (!this._quoteLoaded) this._loadQuote();
    },

    async _getQuotes() {
      const fallback = [
        { text: "自律给我自由。", author: "佚名" },
        { text: "把复杂的事情简单做，你就是专家。", author: "佚名" },
        { text: "今天的努力，是明天幸运的伏笔。", author: "佚名" },
        { text: "种一棵树最好的时间是十年前，其次是现在。", author: "非洲谚语" },
        { text: "循序渐进，方得始终。", author: "佚名" },
        { text: "不积跬步，无以至千里。", author: "荀子" },
        { text: "业精于勤，荒于嬉。", author: "韩愈" }
      ];
      try {
        const res = await fetch("data/quotes.json");
        if (res.ok) return await res.json();
      } catch (e) { /* file:// 环境降级 */ }
      return fallback;
    },

    async _loadQuote() {
      const textEl = document.getElementById("quote-text");
      const authorEl = document.getElementById("quote-author");
      if (!textEl) return;
      this._quoteLoaded = true;

      const quotes = await this._getQuotes();
      const today = new Date().toISOString().slice(0, 10);
      let idx;
      try {
        const raw = localStorage.getItem("campus-task:quote");
        if (raw) { const o = JSON.parse(raw); if (o.date === today) idx = o.index; }
      } catch (e) { /* ignore */ }
      if (idx == null) {
        idx = Math.floor(Math.random() * quotes.length);
        localStorage.setItem("campus-task:quote", JSON.stringify({ date: today, index: idx }));
      }
      const q = quotes[idx % quotes.length];
      textEl.textContent = "“" + q.text + "”";
      authorEl.textContent = "—— " + q.author;
    },

    /* ============ 计划页 ============ */
    renderPlan() {
      this.renderClasses();
      this.renderRests();
      this.renderTimetable();
    },

    renderClasses() {
      const listEl = document.getElementById("class-list");
      const arr = App.state.schedule.classes.slice().sort((a, b) => a.day - b.day || a.start - b.start);
      listEl.innerHTML = arr.length
        ? arr.map((c) => `<li>
            <span class="plan-item__main">${U.escapeHtml(c.name)}</span>
            <span class="plan-item__sub">${U.escapeHtml(c.location || "未填地点")} · ${U.escapeHtml(c.teacher || "未填老师")}</span>
            <span class="plan-item__time">${M.DAYS[c.day - 1]} ${M.minToStr(c.start)}-${M.minToStr(c.end)}</span>
            <button class="act act-del" data-action="del-class" data-id="${c.id}">✕</button>
          </li>`).join("")
        : `<li class="plan-empty">暂无课程，先添加课程。</li>`;
    },

    renderRests() {
      const listEl = document.getElementById("rest-list");
      const arr = App.state.schedule.rests.slice().sort((a, b) => a.day - b.day || a.start - b.start);
      listEl.innerHTML = arr.length
        ? arr.map((r) => `<li>
            <span class="plan-item__main">${U.escapeHtml(M.restLabel(r.type))}</span>
            <span class="plan-item__time">${M.DAYS[r.day - 1]} ${M.minToStr(r.start)}-${M.minToStr(r.end)}</span>
            <button class="act act-del" data-action="del-rest" data-id="${r.id}">✕</button>
          </li>`).join("")
        : `<li class="plan-empty">暂无固定休息，可添加「吃饭 / 午睡 / 晚睡」。</li>`;
    },

    renderTimetable() {
      const el = document.getElementById("timetable");
      const now = Date.now();
      const week = M.weekDays(now);
      document.getElementById("week-label").textContent = `${week[0].label} ~ ${week[6].label}`;

      const START = M.DAY_START, END = M.DAY_END, PX = 52, totalH = (END - START) / 60 * PX;
      const HEAD = 40;

      // 时间轴
      let axis = `<div class="timetable__axis" style="height:${HEAD + totalH}px">`;
      for (let h = START / 60; h <= END / 60; h++) {
        axis += `<div class="timetable__axis-label" style="top:${HEAD + (h - START / 60) * PX}px">${String(h).padStart(2, "0")}:00</div>`;
      }
      axis += "</div>";

      // 7 天
      let days = `<div class="timetable__days" style="height:${HEAD + totalH}px">`;
      week.forEach((w) => {
        days += `<div class="timetable__day${w.isToday ? " is-today" : ""}">
          <div class="timetable__day-head">${w.label}</div>
          <div class="timetable__day-body" style="height:${totalH}px">`;
        for (let h = START / 60; h <= END / 60; h++) days += `<div class="timetable__gridline" style="top:${(h - START / 60) * PX}px"></div>`;

        // 课程
        App.state.schedule.classes.forEach((c) => {
          if (c.day === w.dayIdx) days += this._blockHTML(c.name, c.start, c.end, "class", "class:" + c.id);
        });
        // 固定休息
        App.state.schedule.rests.forEach((r) => {
          if (r.day === w.dayIdx) days += this._blockHTML(M.restLabel(r.type), r.start, r.end, "rest", "rest:" + r.id);
        });
        // 已计划任务
        App.state.tasks.forEach((t) => {
          if (!t.planned) return;
          const s = t.planned.start, e = t.planned.end;
          if (s < w.ts || s >= w.ts + 86400000) return;
          days += this._blockHTML(t.title, M.minutesOfDay(s), M.minutesOfDay(e), "task", "task:" + t.id);
        });
        // 空闲 / 课程缓冲（空闲时间 = 除去课程、休息、任务之外的剩余时间）
        const busy = M.dayBusy(now, w.dayIdx);
        M.dayFree(now, w.dayIdx).forEach((f) => {
          const usable = M.applyBuffer([f], busy)[0];
          if (!usable) {
            days += this._blockHTML("缓冲", f.start, f.end, "buffer", `buffer:${w.dayIdx}:${f.start}:${f.end}`);
          } else {
            days += this._blockHTML("空闲", f.start, f.end, "free", `free:${w.dayIdx}:${f.start}:${f.end}`);
          }
        });
        // 空闲备注
        App.state.schedule.notes.forEach((n) => {
          if (n.day !== w.dayIdx) return;
          days += this._blockHTML("📝 " + n.text, n.start, n.end, "note", "note:" + n.id);
        });
        days += "</div></div>";
      });
      days += "</div>";

      el.innerHTML = axis + days;
    },

    _blockHTML(label, startMin, endMin, type, key) {
      const START = 7 * 60, PX = 52;
      const top = (startMin - START) / 60 * PX;
      const height = Math.max(18, (endMin - startMin) / 60 * PX - 3);
      return `<div class="timetable__block timetable__block--${type}" style="top:${top}px;height:${height}px" data-key="${key}" title="${U.escapeHtml(label)}">${U.escapeHtml(label)}</div>`;
    },

    /* ============ 弹窗 ============ */
    openModal(task) {
      document.getElementById("modal-title").textContent = task ? "编辑任务" : "新建任务";
      document.getElementById("f-id").value = task ? task.id : "";
      document.getElementById("f-title").value = task ? task.title : "";
      document.getElementById("f-desc").value = task ? task.desc : "";
      document.getElementById("f-category").value = task ? task.category : "课程";
      document.getElementById("f-priority").value = task ? task.priority : "medium";
      document.getElementById("f-estimate").value = task && task.estimate ? task.estimate : "";
      document.getElementById("f-critical").checked = task ? !!task.critical : false;
      document.getElementById("f-tags").value = task ? (task.tags || []).join(", ") : "";
      document.getElementById("f-due").value = task && task.due ? toLocalInput(task.due) : "";
      document.getElementById("modal").hidden = false;
      setTimeout(() => document.getElementById("f-title").focus(), 50);
    },

    closeModal() {
      document.getElementById("modal").hidden = true;
      document.getElementById("task-form").reset();
    },

    _showDetail(title, bodyHTML) {
      document.getElementById("detail-title").textContent = title;
      document.getElementById("detail-body").innerHTML = bodyHTML;
      document.getElementById("detail-modal").hidden = false;
    },
    _closeDetail() { document.getElementById("detail-modal").hidden = true; },

    _taskDetailHTML(t) {
      return `
        <div class="detail-row"><span>标题</span><b>${U.escapeHtml(t.title)}</b></div>
        ${t.desc ? `<div class="detail-row"><span>描述</span><b>${U.escapeHtml(t.desc)}</b></div>` : ""}
        <div class="detail-row"><span>分类</span><b>${U.escapeHtml(t.category)}</b></div>
        <div class="detail-row"><span>优先级</span><b>${PRIORITY_LABEL[t.priority]}</b></div>
        <div class="detail-row"><span>截止时间</span><b>${t.due ? U.formatDateTime(t.due) : "无"}</b></div>
        <div class="detail-row"><span>预计耗时</span><b>${t.estimate ? t.estimate + " 分钟" : "未设置"}</b></div>
        <div class="detail-row"><span>标签</span><b>${(t.tags || []).length ? t.tags.map((x) => U.escapeHtml(x)).join("、") : "无"}</b></div>
        <div class="detail-row"><span>后果严重</span><b>${t.critical ? "是（触发预警）" : "否"}</b></div>`;
    },

    toast(msg) {
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.classList.add("toast--show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("toast--show"), 2400);
    },

    /* ============ 事件绑定 ============ */
    bind() {
      const $ = (id) => document.getElementById(id);

      // 弹窗
      $("btn-add").addEventListener("click", () => this.openModal());
      $("modal-close").addEventListener("click", () => this.closeModal());
      $("modal-cancel").addEventListener("click", () => this.closeModal());
      $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") this.closeModal(); });
      $("task-form").addEventListener("submit", (e) => this._onSubmit(e));

      // 详情弹窗
      $("detail-close").addEventListener("click", () => this._closeDetail());
      $("detail-done").addEventListener("click", () => this._closeDetail());
      $("detail-modal").addEventListener("click", (e) => { if (e.target.id === "detail-modal") this._closeDetail(); });
      $("detail-body").addEventListener("click", (e) => this._onDetailAction(e));

      // 任务表格（事件委托）
      $("task-list").addEventListener("click", (e) => this._onTaskClick(e));

      // 预设视图
      $("view-presets").addEventListener("click", (e) => {
        const b = e.target.closest(".view-item");
        if (!b) return;
        App.filters.view = b.dataset.view;
        this.renderViews();
        this.renderTasks();
      });

      // 分类 / 排序 / 搜索
      $("filter-category").addEventListener("change", (e) => { App.filters.category = e.target.value; this.renderTasks(); });
      $("sort-select").addEventListener("change", (e) => { App.filters.sort = e.target.value; this.renderTasks(); });
      const searchInput = $("search-input");
      searchInput.addEventListener("input", U.debounce(() => { App.filters.keyword = searchInput.value; this.renderTasks(); }, 200));

      // 批量管理
      $("btn-batch").addEventListener("click", () => (this.batchMode ? this._exitBatch() : this._enterBatch()));
      $("select-all").addEventListener("change", (e) => this._onSelectAll(e));
      $("batch-all").addEventListener("click", () => this._onSelectAll(null, true));
      $("batch-done").addEventListener("click", () => this._onBatchDone());
      $("batch-delete").addEventListener("click", () => this._onBatchDelete());
      $("batch-exit").addEventListener("click", () => this._exitBatch());
      $("btn-clear-done").addEventListener("click", () => this._onClearDone());

      // 提醒设置
      $("warn-lead").addEventListener("change", (e) => {
        App.state.settings.warnLead = parseInt(e.target.value, 10);
        App.save();
        this.toast("预警时间已更新");
      });

      // 主题
      $("btn-theme").addEventListener("click", () => this._toggleTheme());

      // 课表 / 固定休息 / 时间表 / 计划
      $("class-form").addEventListener("submit", (e) => this._onClassSubmit(e));
      $("rest-form").addEventListener("submit", (e) => this._onRestSubmit(e));
      $("class-list").addEventListener("click", (e) => this._onPlanListDel(e, "del-class"));
      $("rest-list").addEventListener("click", (e) => this._onPlanListDel(e, "del-rest"));
      $("timetable").addEventListener("click", (e) => this._onTimetableClick(e));

      // 空闲时间块编辑弹窗
      $("free-modal-close").addEventListener("click", () => this._closeFreeModal());
      $("fm-cancel").addEventListener("click", () => this._closeFreeModal());
      $("free-modal").addEventListener("click", (e) => { if (e.target.id === "free-modal") this._closeFreeModal(); });
      $("fm-save-note").addEventListener("click", () => this._onFreeSaveNote());
      $("fm-fill").addEventListener("click", () => this._onFreeFill());
      $("fm-start-time").addEventListener("change", () => this._syncFreeNote());
      $("fm-end-time").addEventListener("change", () => this._syncFreeNote());

      // 移动端抽屉
      $("hamburger").addEventListener("click", () => this._toggleDrawer(true));
      $("backdrop").addEventListener("click", () => this._toggleDrawer(false));
      $("nav").addEventListener("click", () => this._toggleDrawer(false));

      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    },

    _toggleDrawer(open) {
      document.body.classList.toggle("drawer-open", open);
      document.getElementById("backdrop").hidden = !open;
    },

    /* ============ 事件处理 ============ */
    _onSubmit(e) {
      e.preventDefault();
      const id = document.getElementById("f-id").value;
      const title = document.getElementById("f-title").value.trim();
      if (!title) { this.toast("请填写任务标题"); document.getElementById("f-title").focus(); return; }

      const data = {
        title,
        desc: document.getElementById("f-desc").value,
        category: document.getElementById("f-category").value,
        priority: document.getElementById("f-priority").value,
        tags: document.getElementById("f-tags").value,
        due: document.getElementById("f-due").value,
        estimate: document.getElementById("f-estimate").value,
        critical: document.getElementById("f-critical").checked
      };

      if (id) {
        const t = App.state.tasks.find((x) => x.id === id);
        if (t) M.updateTask(t, data);
        this.toast("已更新任务");
      } else {
        App.state.tasks.push(M.createTask(data));
        this.toast("已添加任务");
      }
      this.closeModal();
      App.save();
      this.render();
    },

    _onTaskClick(e) {
      const tr = e.target.closest("tr.task");
      if (!tr) return;
      const id = tr.dataset.id;
      const t = App.state.tasks.find((x) => x.id === id);
      if (!t) return;

      if (this.batchMode) { this._toggleSelect(id); return; }

      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      switch (btn.dataset.action) {
        case "toggle":
          M.toggleDone(t);
          this.toast(t.done ? "已完成 ✅" : "已恢复为进行中");
          break;
        case "edit":
          this.openModal(t);
          return;
        case "delete":
          App.state.tasks = App.state.tasks.filter((x) => x.id !== id);
          this.toast("已删除任务");
          break;
      }
      App.save();
      this.render();
    },

    /* ---- 批量 ---- */
    _enterBatch() {
      this.batchMode = true;
      this.selected = new Set();
      document.getElementById("th-select").hidden = false;
      document.getElementById("batch-bar").hidden = false;
      document.getElementById("btn-batch").textContent = "退出批量";
      this.renderTasks();
    },
    _exitBatch() {
      this.batchMode = false;
      this.selected = new Set();
      document.getElementById("th-select").hidden = true;
      document.getElementById("batch-bar").hidden = true;
      document.getElementById("btn-batch").textContent = "批量管理";
      document.getElementById("select-all").checked = false;
      this.renderTasks();
    },
    _toggleSelect(id) {
      this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
      this._updateBatchUI();
    },
    _updateBatchUI() {
      document.getElementById("batch-count").textContent = this.selected.size;
      document.querySelectorAll("tr.task").forEach((tr) => {
        const id = tr.dataset.id;
        const on = this.selected.has(id);
        tr.classList.toggle("selected", on);
        const cb = tr.querySelector(".task-select");
        if (cb) cb.checked = on;
      });
    },
    _onSelectAll(e, forceAll) {
      const list = M.query(App.state.tasks, App.filters);
      const all = forceAll ? true : e.target.checked;
      if (all) list.forEach((t) => this.selected.add(t.id));
      else list.forEach((t) => this.selected.delete(t.id));
      this._updateBatchUI();
    },
    _onBatchDone() {
      App.state.tasks.forEach((t) => { if (this.selected.has(t.id) && !t.done) M.toggleDone(t); });
      App.save(); this._exitBatch(); this.render(); this.toast("已批量标记完成");
    },
    _onBatchDelete() {
      const n = this.selected.size;
      if (!n) { this.toast("请先勾选任务"); return; }
      if (!confirm(`确定删除选中的 ${n} 项任务？`)) return;
      App.state.tasks = App.state.tasks.filter((t) => !this.selected.has(t.id));
      App.save(); this._exitBatch(); this.render(); this.toast(`已删除 ${n} 项任务`);
    },
    _onClearDone() {
      const done = App.state.tasks.filter((t) => t.done);
      if (!done.length) { this.toast("没有已完成的任务"); return; }
      if (!confirm(`确定清除全部 ${done.length} 项已完成任务？`)) return;
      App.state.tasks = App.state.tasks.filter((t) => !t.done);
      App.save(); this.render(); this.toast(`已清除 ${done.length} 项已完成任务`);
    },

    /* ---- 课表 / 空闲 / 时间表 / 计划 ---- */
    _onClassSubmit(e) {
      e.preventDefault();
      const name = document.getElementById("cls-name").value.trim();
      const start = M.strToMin(document.getElementById("cls-start").value);
      const end = M.strToMin(document.getElementById("cls-end").value);
      if (!name) { this.toast("请输入课程名称"); return; }
      if (end <= start) { this.toast("结束时间需晚于开始时间"); return; }
      App.state.schedule.classes.push({
        id: U.uid(), name,
        day: +document.getElementById("cls-day").value,
        start, end,
        location: document.getElementById("cls-location").value.trim(),
        teacher: document.getElementById("cls-teacher").value.trim()
      });
      document.getElementById("cls-name").value = "";
      document.getElementById("cls-location").value = "";
      document.getElementById("cls-teacher").value = "";
      App.save(); this.renderPlan(); this.toast("已添加课程");
    },
    _onRestSubmit(e) {
      e.preventDefault();
      const start = M.strToMin(document.getElementById("rest-start").value);
      const end = M.strToMin(document.getElementById("rest-end").value);
      if (end <= start) { this.toast("结束时间需晚于开始时间"); return; }
      App.state.schedule.rests.push({ id: U.uid(), type: document.getElementById("rest-type").value, day: +document.getElementById("rest-day").value, start, end });
      App.save(); this.renderPlan(); this.toast("已添加固定休息");
    },
    _onPlanListDel(e, action) {
      const btn = e.target.closest(`button[data-action="${action}"]`);
      if (!btn) return;
      const key = action === "del-class" ? "classes" : action === "del-rest" ? "rests" : null;
      if (!key) return;
      App.state.schedule[key] = App.state.schedule[key].filter((x) => x.id !== btn.dataset.id);
      App.save(); this.renderPlan();
    },

    _onTimetableClick(e) {
      const block = e.target.closest(".timetable__block");
      if (!block) return;
      const parts = block.dataset.key.split(":");
      const type = parts[0];
      const id = parts[1];

      if (type === "class") {
        const c = App.state.schedule.classes.find((x) => x.id === id);
        if (c) this._showDetail("课程详情", `
          <div class="detail-row"><span>课程</span><b>${U.escapeHtml(c.name)}</b></div>
          <div class="detail-row"><span>时间</span><b>${M.DAYS[c.day - 1]} ${M.minToStr(c.start)}-${M.minToStr(c.end)}</b></div>
          <div class="detail-row"><span>地点</span><b>${U.escapeHtml(c.location || "未填写")}</b></div>
          <div class="detail-row"><span>任课老师</span><b>${U.escapeHtml(c.teacher || "未填写")}</b></div>`);
      } else if (type === "rest") {
        const r = App.state.schedule.rests.find((x) => x.id === id);
        if (r) this._showDetail("固定休息", `
          <div class="detail-row"><span>类型</span><b>${U.escapeHtml(M.restLabel(r.type))}</b></div>
          <div class="detail-row"><span>时间</span><b>${M.DAYS[r.day - 1]} ${M.minToStr(r.start)}-${M.minToStr(r.end)}</b></div>
          <div class="detail-row"><span>说明</span><b>不安排任何工作</b></div>`);
      } else if (type === "task") {
        const t = App.state.tasks.find((x) => x.id === id);
        if (t) this._showDetail("任务详情", this._taskDetailHTML(t) + `<button class="btn btn--danger" data-action="remove-plan" data-id="${t.id}" style="margin-top:14px">从计划中移除</button>`);
      } else if (type === "free") {
        this._openFreeModal(+parts[1], +parts[2], +parts[3]);
      } else if (type === "note") {
        const n = App.state.schedule.notes.find((x) => x.id === id);
        if (n) this._openFreeModal(n.day, n.start, n.end);
      } else if (type === "buffer") {
        this.toast("该时段为课程缓冲（准备/通勤），不可安排任务");
      }
    },

    _onDetailAction(e) {
      const btn = e.target.closest('button[data-action="remove-plan"]');
      if (!btn) return;
      const t = App.state.tasks.find((x) => x.id === btn.dataset.id);
      if (t) t.planned = null;
      App.save();
      this._closeDetail();
      this.renderPlan();
      this.toast("已从计划中移除");
    },

    /* ---- 空闲时间块编辑 ---- */
    _openFreeModal(dayIdx, start, end) {
      document.getElementById("free-modal-title").textContent = "空闲时间 · " + M.DAYS[dayIdx - 1];
      document.getElementById("free-modal-meta").textContent = `该空闲块 ${M.minToStr(start)} – ${M.minToStr(end)}（${end - start} 分钟），可调整起止时间`;
      document.getElementById("fm-day").value = dayIdx;
      document.getElementById("fm-start-time").value = M.minToStr(start);
      document.getElementById("fm-end-time").value = M.minToStr(end);
      const sel = document.getElementById("fm-task");
      const pending = App.state.tasks.filter((t) => !t.done && t.estimate > 0);
      sel.innerHTML = pending.length
        ? pending.map((t) => `<option value="${t.id}">${U.escapeHtml(t.title)}（${t.estimate} 分钟）</option>`).join("")
        : `<option value="">暂无可用任务（需未完成且已设耗时）</option>`;
      this._syncFreeNote();
      document.getElementById("free-modal").hidden = false;
    },

    _closeFreeModal() {
      document.getElementById("free-modal").hidden = true;
    },

    /** 起止时间变化时，联动加载对应子时段的备注 */
    _syncFreeNote() {
      const day = +document.getElementById("fm-day").value;
      const start = M.strToMin(document.getElementById("fm-start-time").value);
      const end = M.strToMin(document.getElementById("fm-end-time").value);
      const note = App.state.schedule.notes.find((n) => n.day === day && n.start === start && n.end === end);
      document.getElementById("fm-note").value = note ? note.text : "";
    },

    _onFreeSaveNote() {
      const day = +document.getElementById("fm-day").value;
      const start = M.strToMin(document.getElementById("fm-start-time").value);
      const end = M.strToMin(document.getElementById("fm-end-time").value);
      if (end <= start) { this.toast("结束时间需晚于开始时间"); return; }
      const text = document.getElementById("fm-note").value.trim();
      App.state.schedule.notes = App.state.schedule.notes.filter((n) => !(n.day === day && n.start === start && n.end === end));
      if (text) App.state.schedule.notes.push({ id: U.uid(), day, start, end, text });
      App.save();
      this._closeFreeModal();
      this.renderPlan();
      this.toast(text ? "备注已保存" : "备注已清除");
    },

    _onFreeFill() {
      const day = +document.getElementById("fm-day").value;
      const start = M.strToMin(document.getElementById("fm-start-time").value);
      const end = M.strToMin(document.getElementById("fm-end-time").value);
      if (end <= start) { this.toast("结束时间需晚于开始时间"); return; }
      const taskId = document.getElementById("fm-task").value;
      const t = App.state.tasks.find((x) => x.id === taskId);
      if (!t) { this.toast("请选择要填入的任务"); return; }
      const need = t.estimate;
      if (!need) { this.toast("该任务未设置耗时"); return; }
      if (need > end - start) { this.toast(`所选时段不足 ${need} 分钟`); return; }
      const usable = M.slotUsable(Date.now(), day, start, end);
      if (!usable || start < usable.start || start + need > usable.end) {
        this.toast("需与课程保持 30 分钟缓冲，请调整起止时间");
        return;
      }
      const dayTs = M.weekDays(Date.now()).find((w) => w.dayIdx === day).ts;
      const s = dayTs + start * 60000;
      t.planned = { start: s, end: s + need * 60000 };
      App.save();
      this._closeFreeModal();
      this.renderPlan();
      this.toast(`已将「${t.title}」填入该时段`);
    },

    /* ---- 主题 ---- */
    _toggleTheme() {
      const root = document.documentElement;
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      document.querySelector("[data-theme-icon]").textContent = next === "dark" ? "☀️" : "🌙";
      App.store.setTheme(next);
    }
  };

  function toLocalInput(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  App.view = view;
})(window);
