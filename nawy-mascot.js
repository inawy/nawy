/*!
 * nawy-mascot.js — ماسكوت ناوي: الغمزة والتعبيرات وشاشة الترحيب
 * بدون مكتبات خارجية. بيعتمد على Web Animations API (element.animate).
 *
 * الاستخدام السريع:
 *   NawyMascot.welcome();                       // شاشة الترحيب (بتتنادى تلقائيًا في آخر الملف)
 *   NawyMascot.wink(el);                        // غمزة على أي عنصر فيه رمز/ماسكوت
 *   NawyMascot.render(host, "happy");           // رسم الماسكوت بتعبير معيّن جوه عنصر
 *   NawyMascot.setExpression(host, "excited");  // تبديل التعبير بحركة صغيرة
 *
 * التعبيرات: basic, excited, relaxed, thinking, happy, bored
 * الوضع "basic" هو الشعار الرسمي (الأيقونة)، وباقي التعبيرات مساعدة.
 */
(function (global) {
  "use strict";

  // =====================================================================
  // القيم — عدّل من هنا فقط (الشخصية الحالية: "ودود")
  // =====================================================================
  var NAWY_WINK = {
    entrance: true,               // ظهور بنطّة صغيرة
    drawCheck: true,              // علامة الصح بتترسم
    delayMs: 700,                 // الانتظار قبل الغمزة
    closeMs: 160,                 // سرعة إغلاق العين
    holdMs: 380,                  // مدة تثبيت الغمزة
    tiltDeg: 6,                   // ميلان الرأس
    repeatSec: 0,                 // 0 = مرة واحدة (بيُستخدم مع loopWink)
    respectReducedMotion: true,   // لو الجهاز مفعّل "تقليل الحركة" مفيش حركة

    welcomeOncePerSession: true,  // شاشة الترحيب مرة واحدة لكل جلسة
    welcomeHoldMs: 450,           // وقفة بعد الغمزة قبل الاختفاء
    welcomeFadeMs: 350,           // مدة اختفاء الشاشة
    welcomeMaxMs: 5000,           // أقصى وقت لظهور شاشة الترحيب (أمان)
    headerWinkAfterWelcome: true  // غمزة رمز الهيدر بعد الترحيب
  };

  var SESSION_KEY = "nawyWelcomeShown";
  var EYE = "#fff";

  // ---------------------------------------------------------------------
  // أدوات مساعدة
  // ---------------------------------------------------------------------
  function reduced() {
    return !!(NAWY_WINK.respectReducedMotion && global.matchMedia &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function parts(root) {
    var p = {
      pop: root.querySelector(".pop"),
      tilt: root.querySelector(".tilt"),
      dot: root.querySelector(".dot"),
      chk: root.querySelector(".chk")
    };
    ["pop", "tilt", "dot"].forEach(function (k) {
      if (p[k]) {
        p[k].style.transformBox = "fill-box";
        p[k].style.transformOrigin = "center";
      }
    });
    return p;
  }

  function canAnimate(el) { return !!(el && typeof el.animate === "function"); }

  function cancel(root) {
    (root.__nawyAnims || []).forEach(function (a) { try { a.cancel(); } catch (e) {} });
    root.__nawyAnims = [];
  }

  // ---------------------------------------------------------------------
  // الحركات
  // ---------------------------------------------------------------------
  function enterAnim(p, list) {
    if (!p.pop) return 0;
    list.push(p.pop.animate(
      [{ transform: "scale(0.55)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }],
      { duration: 520, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "both" }
    ));
    return 520;
  }

  function drawAnim(p, list, delay) {
    if (!p.chk) return 0;
    list.push(p.chk.animate([
      { strokeDasharray: "100", strokeDashoffset: "100", opacity: 0, offset: 0 },
      { strokeDasharray: "100", strokeDashoffset: "99", opacity: 1, offset: 0.01 },
      { strokeDasharray: "100", strokeDashoffset: "0", opacity: 1, offset: 1 }
    ], { duration: 460, delay: delay, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }));
    return delay + 460;
  }

  function winkAnim(p, list, delay) {
    var c = NAWY_WINK;
    var release = Math.round(c.closeMs * 1.25);
    var total = c.closeMs + c.holdMs + release;
    var o1 = c.closeMs / total;
    var o2 = (c.closeMs + c.holdMs) / total;
    var opt = { duration: total, delay: delay, easing: "ease-in-out" };
    if (p.tilt) {
      list.push(p.tilt.animate([
        { transform: "rotate(0deg)", offset: 0 },
        { transform: "rotate(" + c.tiltDeg + "deg)", offset: o1 },
        { transform: "rotate(" + c.tiltDeg + "deg)", offset: o2 },
        { transform: "rotate(0deg)", offset: 1 }
      ], opt));
    }
    if (p.dot) {
      list.push(p.dot.animate([
        { transform: "scaleY(1)", offset: 0 },
        { transform: "scaleY(0.08)", offset: o1 },
        { transform: "scaleY(0.08)", offset: o2 },
        { transform: "scaleY(1)", offset: 1 }
      ], opt));
    }
    return delay + total;
  }

  // جدول التوقيت: الظهور ← رسم الصح ← الغمزة
  function timing(o) {
    var c = NAWY_WINK, t = 0;
    var useEnter = !(o && o.entrance === false) && c.entrance;
    var useDraw = !(o && o.drawCheck === false) && c.drawCheck;
    if (useEnter) t = 520;
    if (useDraw) t = Math.max(t, (useEnter ? 260 : 0) + 460);
    var delay = (o && o.delayMs != null) ? o.delayMs : c.delayMs;
    var start = t + delay;
    var total = c.closeMs + c.holdMs + Math.round(c.closeMs * 1.25);
    return { useEnter: useEnter, useDraw: useDraw, start: start, end: start + total };
  }

  // تسلسل كامل: ظهور + رسم الصح + غمزة. بيرجّع Promise بينتهي بعد الغمزة.
  function play(root, o) {
    if (!root) return Promise.resolve();
    cancel(root);
    var p = parts(root);
    if (reduced() || !canAnimate(p.tilt || p.pop || p.dot)) return Promise.resolve();
    var list = root.__nawyAnims = [];
    var tm = timing(o);
    if (tm.useEnter) enterAnim(p, list);
    if (tm.useDraw) drawAnim(p, list, tm.useEnter ? 260 : 0);
    winkAnim(p, list, tm.start);
    return new Promise(function (res) { setTimeout(res, tm.end); });
  }

  // غمزة فقط (من غير ظهور ولا رسم)
  function wink(root) {
    if (!root) return Promise.resolve();
    cancel(root);
    var p = parts(root);
    if (reduced() || !canAnimate(p.tilt || p.dot)) return Promise.resolve();
    var list = root.__nawyAnims = [];
    var end = winkAnim(p, list, 0);
    return new Promise(function (res) { setTimeout(res, end); });
  }

  // غمزة متكررة كل repeatSec ثانية. بترجّع دالة إيقاف.
  function loopWink(root) {
    var sec = NAWY_WINK.repeatSec;
    if (!(sec > 0)) return function () {};
    var timer = setInterval(function () { wink(root); }, sec * 1000);
    return function () { clearInterval(timer); };
  }

  // ---------------------------------------------------------------------
  // التعبيرات (رسومات ثابتة، الأجزاء بعيدة عن بعض بمسافات محسوبة)
  // ---------------------------------------------------------------------
  function line(d, w) {
    return '<path d="' + d + '" fill="none" stroke="' + EYE + '" stroke-width="' + w +
      '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function dotEl(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + EYE + '"/>'; }

  function face(name) {
    switch (name) {
      case "excited":
        return line("M-38 -3 L-27.9 7.1 L-11.1 -13.1", 11) + line("M10 -3 L20.1 7.1 L36.9 -13.1", 11) +
          '<path d="M-16 24 Q0 54 16 24" fill="' + EYE + '" stroke="' + EYE + '" stroke-width="6" stroke-linejoin="round"/>';
      case "relaxed":
        return line("M-36 -4 Q-24 8 -12 -4", 12) + line("M12 -4 Q24 8 36 -4", 12) + line("M-9 28 Q0 35 9 28", 9);
      case "thinking":
        return dotEl(-22, -8, 11) + dotEl(22, -8, 11) + line("M10 -30 L34 -38", 9) + line("M-9 26 L9 26", 9);
      case "happy":
        return line("M-38 0 L-26 -12 L-14 0", 13) + line("M14 0 L26 -12 L38 0", 13) + line("M-22 24 Q0 50 22 24", 9);
      case "bored":
        return dotEl(-22, 4, 10) + dotEl(22, 4, 10) + line("M-38 -26 L-12 -18", 9) + line("M38 -26 L12 -18", 9) +
          line("M-13 34 Q0 24 13 34", 9);
      default: // basic = الشعار الرسمي: نقطة وعلامة صح، بدون فم ولا حواجب
        return '<g transform="scale(1.2) translate(-5,3)">' +
          '<circle class="dot" cx="-22" cy="-3" r="10" fill="' + EYE + '"/>' +
          '<path class="chk" d="M4 -3 L16 9 L36 -15" pathLength="100" fill="none" stroke="' + EYE +
          '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }
  }

  var EXPRESSIONS = ["basic", "excited", "relaxed", "thinking", "happy", "bored"];

  function svg(name) {
    name = EXPRESSIONS.indexOf(name) === -1 ? "basic" : name;
    return '<svg viewBox="-80 -80 160 160" role="img" aria-label="ماسكوت ناوي"><g class="pop"><g class="tilt">' +
      '<circle r="70" fill="#3D7BFF"/>' + face(name) + '</g></g></svg>';
  }

  function render(host, name) {
    if (!host) return;
    host.innerHTML = svg(name);
    host.__nawyExpr = EXPRESSIONS.indexOf(name) === -1 ? "basic" : name;
  }

  function setExpression(host, name) {
    if (!host) return;
    name = EXPRESSIONS.indexOf(name) === -1 ? "basic" : name;
    if (host.__nawyExpr === name) return;
    render(host, name);
    var s = host.querySelector("svg");
    if (s && canAnimate(s) && !reduced()) {
      s.animate([{ transform: "scale(0.92)" }, { transform: "scale(1)" }],
        { duration: 220, easing: "cubic-bezier(.34,1.56,.64,1)" });
    }
  }

  // ---------------------------------------------------------------------
  // شاشة الترحيب (#nawyWelcome موجودة في index.html)
  // بترجّع Promise<boolean>: true لو الشاشة اتعرضت فعلًا.
  // ---------------------------------------------------------------------
  function welcome() {
    var ov = document.getElementById("nawyWelcome");
    if (!ov) return Promise.resolve(false);
    var c = NAWY_WINK;

    function removeOv() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function markShown() { try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) {} }

    if (c.welcomeOncePerSession) {
      try {
        if (sessionStorage.getItem(SESSION_KEY)) { removeOv(); return Promise.resolve(false); }
      } catch (e) {}
    }
    if (reduced() || !canAnimate(ov)) { markShown(); removeOv(); return Promise.resolve(false); }

    markShown();
    return new Promise(function (resolve) {
      var ended = false;
      function end() {
        if (ended) return;
        ended = true;
        var a = ov.animate([{ opacity: 1 }, { opacity: 0 }],
          { duration: c.welcomeFadeMs, easing: "ease-out", fill: "forwards" });
        a.onfinish = function () { removeOv(); resolve(true); };
      }
      ov.addEventListener("pointerdown", end, { once: true }); // اضغط لتخطي
      setTimeout(end, c.welcomeMaxMs);                          // أمان

      var name = ov.querySelector(".nawy-w-name");
      var tm = timing();
      if (name) {
        name.animate(
          [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 500, delay: tm.start + c.closeMs * 0.5, easing: "ease-out", fill: "both" }
        );
      }
      play(ov).then(function () { setTimeout(end, c.welcomeHoldMs); });
    });
  }

  // ---------------------------------------------------------------------
  // التشغيل التلقائي: ترحيب ← غمزة الهيدر
  // ---------------------------------------------------------------------
  function boot() {
    welcome().then(function (shown) {
      if (!shown || !NAWY_WINK.headerWinkAfterWelcome) return;
      var mark = document.querySelector(".brand-icon svg");
      if (mark) wink(mark);
    }).catch(function () {
      var ov = document.getElementById("nawyWelcome");
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    });
  }

  global.NawyMascot = {
    config: NAWY_WINK,
    expressions: EXPRESSIONS,
    svg: svg,
    render: render,
    setExpression: setExpression,
    play: play,
    wink: wink,
    loopWink: loopWink,
    welcome: welcome
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
