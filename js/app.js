/* =========================================================
   app.js —— 应用入口：初始化全局状态、路由、时钟、提醒
   ========================================================= */

(function (global) {
  "use strict";
  const App = (global.App = global.App || {});

  const SEED_FLAG = "campus-task:seeded:v4";

  /* ---------- 全局状态与顶层 API ---------- */
  App.state = App.store.load();
  App.filters = { view: "all", category: "all", keyword: "", sort: "due-asc" };

  App.save = function () { return App.store.save(App.state); };
  App.render = function () { App.view.render(); };

  /* ---------- 主题初始化 ---------- */
  function initTheme() {
    const theme = App.store.getTheme();
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelector("[data-theme-icon]").textContent = theme === "dark" ? "☀️" : "🌙";
  }

  /* ---------- 番茄钟跨天清零 ---------- */
  function refreshPomodoroDay() {
    const p = App.state.pomodoro;
    const today = new Date().toDateString();
    if (p.lastSessionDay !== today) {
      p.lastSessionDay = today;
      p.sessionsToday = 0;
      App.save();
    }
  }

  /* ---------- 首次运行：植入示例数据 ---------- */
  function seedIfNeeded() {
    if (localStorage.getItem(SEED_FLAG)) return;
    const now = Date.now();
    const day = 86400000;
    const H = 3600000;
    const MIN = 60000;
    const mk = (title, desc, category, priority, tags, due, done, ago, critical, estimate) => ({
      id: App.utils.uid(),
      title, desc, category, priority, tags, due, done,
      critical, estimate, planned: null,
      createdAt: now - ago,
      completedAt: done ? now - ago + 3600000 : null,
      order: 0
    });

    App.state.tasks = [
      mk("完成 Web 程序设计大作业", "实现待办管理应用并准备 8 分钟展示", "课程", "high", ["大作业", "期末"], now + 7 * day, false, 6 * day, true, 120),
      mk("复习高等数学第三章", "重点：定积分与不定积分", "课程", "high", ["复习", "高数"], now + 3 * day, false, 5 * day, true, 60),
      mk("社团招新海报设计", "使用 Figma 完成初稿", "社团", "medium", ["设计"], now + 6 * day, false, 4 * day, false, 90),
      mk("整理宿舍与倒垃圾", "每周例行", "生活", "low", ["日常"], now + 1 * day, false, 2 * day, false, 30),
      mk("交实验报告", "已过截止时间，需尽快补交", "课程", "high", ["实验", "补交"], now - 1 * day, false, 2 * day, true, 0),
      mk("提交英语四级报名", "已提交并确认", "课程", "medium", ["报名"], now - 2 * day, true, 7 * day, false, 20),
      mk("晨跑 5 公里", "坚持锻炼", "生活", "low", ["运动"], now - 1 * day, true, 3 * day, false, 40),
      mk("数据结构实验：链表与栈", "完成实验并提交报告", "课程", "high", ["实验", "数据结构"], now + 8 * day, false, 3 * day, true, 90),
      mk("准备英语四级词汇", "每天背 50 个单词", "课程", "medium", ["四级", "英语"], now + 9 * day, false, 2 * day, false, 60),
      mk("操作系统进程调度作业", "实现 FCFS / SJF 调度模拟", "课程", "high", ["作业", "操作系统"], now + 10 * day, false, 1 * day, true, 90),
      mk("概率论习题 3.1-3.5", "独立完成并订正", "课程", "medium", ["习题"], now + 4 * day, false, 1 * day, false, 45),
      mk("社团例会材料整理", "整理上周活动总结", "社团", "low", ["例会"], now + 5 * day, false, 1 * day, false, 40)
    ];
    App.state.tasks.forEach((t, i) => (t.order = i));

    // 示例课表（周一至周五，多排几节）
    const cls = (name, d, sh, sm, eh, em, location, teacher) => ({
      id: App.utils.uid(), name, day: d, start: sh * 60 + sm, end: eh * 60 + em, location, teacher
    });
    App.state.schedule.classes = [
      cls("高等数学", 1, 8, 0, 9, 40, "教学楼 A101", "张老师"),
      cls("大学英语", 1, 10, 10, 11, 50, "教学楼 B202", "李老师"),
      cls("数据结构", 2, 8, 0, 9, 40, "教学楼 C301", "王老师"),
      cls("计算机组成原理", 2, 14, 0, 15, 40, "实验楼 D204", "赵老师"),
      cls("操作系统", 3, 10, 10, 11, 50, "教学楼 E105", "刘老师"),
      cls("概率论", 4, 8, 0, 9, 40, "教学楼 F302", "陈老师"),
      cls("Web 程序设计", 4, 14, 0, 15, 40, "机房 G303", "周老师"),
      cls("大学体育", 5, 10, 10, 11, 50, "操场", "孙老师")
    ];

    // 固定休息时间（吃饭 / 午睡 / 晚睡）
    const rest = (type, d, sh, sm, eh, em) => ({
      id: App.utils.uid(), type, day: d, start: sh * 60 + sm, end: eh * 60 + em
    });
    App.state.schedule.rests = [];
    [1, 2, 3, 4, 5].forEach((d) => {
      App.state.schedule.rests.push(rest("meal", d, 12, 0, 13, 0));
      App.state.schedule.rests.push(rest("nap", d, 13, 0, 14, 0));
    });
    [1, 2, 3, 4, 5, 6, 7].forEach((d) => {
      App.state.schedule.rests.push(rest("sleep", d, 22, 0, 23, 0));
    });

    // 空闲时间备注示例
    App.state.schedule.notes = [
      { id: App.utils.uid(), day: 3, start: 14 * 60, end: 16 * 60, text: "去图书馆自习" }
    ];

    // 为演示预排未来 7 天计划：用排课算法（工作日优先 + 30 分钟缓冲 + 截止约束）
    App.model.generatePlan(
      App.state.tasks.filter((t) => !t.done && t.estimate > 0),
      now
    );

    App.save();
    localStorage.setItem(SEED_FLAG, "1");
  }

  /* ---------- 实时时钟 ---------- */
  function initClock() {
    const el = document.getElementById("clock");
    const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const p = (n) => String(n).padStart(2, "0");
    function tick() {
      const d = new Date();
      el.textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- 预警提醒调度器 ---------- */
  function initReminders() {
    const notified = new Set();
    const warnLeadMs = () => App.state.settings.warnLead * 60000;

    function check() {
      const now = Date.now();
      const lead = warnLeadMs();

      App.state.tasks.forEach((t) => {
        if (t.done || notified.has(t.id)) return;

        // 1) 截止预警：仅"后果严重"任务，进入提前提醒窗口
        if (t.critical && t.due && t.due - now <= lead) {
          notified.add(t.id);
          const msg = `「${t.title}」即将到期（${App.utils.relativeDue(t.due)}后）`;
          App.view.toast(msg);
          notify(msg);
          return;
        }

        // 2) 计划开始提醒：任务按计划即将开始
        if (t.planned && t.planned.start - now <= lead && t.planned.start - now > -5 * 60000) {
          notified.add(t.id);
          const d = new Date(t.planned.start);
          const p = (n) => String(n).padStart(2, "0");
          const msg = `「${t.title}」计划即将开始（${p(d.getHours())}:${p(d.getMinutes())}）`;
          App.view.toast(msg);
          notify(msg);
        }
      });
    }

    function notify(msg) {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("课业待办提醒", { body: msg });
      }
    }

    check();
    setInterval(check, 30000);
  }

  /* ---------- 启动 ---------- */
  function bootstrap() {
    initTheme();
    refreshPomodoroDay();
    seedIfNeeded();
    // 同步预警时间下拉
    const warnSel = document.getElementById("warn-lead");
    if (warnSel && App.state.settings.warnLead) warnSel.value = String(App.state.settings.warnLead);
    App.view.bind();
    App.pomodoro.init();
    App.router.init();
    initClock();
    initReminders();
    App.render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})(window);
