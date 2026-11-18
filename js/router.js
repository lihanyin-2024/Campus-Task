/* =========================================================
   router.js —— 哈希路由（SPA 单页应用核心）
   通过 location.hash 在多个“页面”间切换，不刷新整页，
   支持浏览器前进 / 后退（hashchange 事件）。
   对应大纲：URL & JavaScript、SPA 单页应用程序
   ========================================================= */

(function (global) {
  "use strict";
  const App = (global.App = global.App || {});

  const ROUTES = ["home", "focus", "plan", "about"];

  /** 解析当前 hash 为路由名；默认 home */
  function current() {
    const name = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
    return ROUTES.includes(name) ? name : "home";
  }

  const router = {
    /** 初始化：首次渲染 + 监听 hashchange */
    init() {
      window.addEventListener("hashchange", () => this.navigate());
      if (!location.hash) {
        // 无 hash 时补一个默认路由，保证刷新/分享链接可复现
        history.replaceState(null, "", "#/");
      }
      this.navigate();
    },

    /** 切换到指定路由（供程序化跳转调用） */
    go(name) {
      if (!ROUTES.includes(name)) name = "home";
      location.hash = name === "home" ? "#/" : "#/" + name;
      // hashchange 会自动触发 navigate；若 hash 未变则手动触发
      if (current() === name && this._last === name) this.navigate();
    },

    /** 根据当前路由渲染对应页面 */
    navigate() {
      const name = current();
      this._last = name;

      // 1) 显示/隐藏页面
      document.querySelectorAll(".page").forEach((p) => {
        p.hidden = p.dataset.page !== name;
      });

      // 2) 导航高亮
      document.querySelectorAll(".nav__link").forEach((a) => {
        a.classList.toggle("active", a.dataset.route === name);
      });

      // 3) 侧栏（视图/提醒设置）仅在清单页显示
      const sidebar = document.getElementById("sidebar");
      if (sidebar) sidebar.hidden = name !== "home";

      // 3.5) 无侧栏时让主内容占满整行（修复布局错位）
      const layout = document.querySelector(".layout");
      if (layout) layout.classList.toggle("layout--single", name !== "home");

      // 4) 按需渲染对应视图
      if (name === "focus") App.view.renderFocus();
      if (name === "plan") App.view.renderPlan();

      // 关闭移动端抽屉
      this.closeDrawer();

      // 页面切换时滚动到顶部
      window.scrollTo({ top: 0 });
    },

    closeDrawer() {
      document.body.classList.remove("drawer-open");
      document.getElementById("backdrop").hidden = true;
    }
  };

  App.router = router;
})(window);
