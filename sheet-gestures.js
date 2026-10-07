// إيماءات النوافذ السفلية (سحب للإغلاق/سكرول) — منقولة حرفيًا من app.js. classic script بيتحمّل قبله؛ بتستخدم `$$` و`closeOverlay` من app.js وقت التشغيل بس، والاستدعاء `initSheetGestures()` فضل في app.js.
/* exported initSheetGestures */
// بنلف كل محتوى البطاقة (غير زرار الإغلاق والمقبض) جوه عنصر
// سكرول منفصل. البطاقة نفسها (.sheet) بقت ثابتة مش بتتسكرول
// ومافيهاش أي touch-action افتراضي من المتصفح — كل حاجة (سحب
// للإغلاق، سكرول المحتوى، التحويل السلس بينهم في لمسة واحدة)
// بقى متحكَّم فيه بالجافاسكريبت بالكامل، فمفيش أي "ارتداد مطاطي"
// من المتصفح يتعارض مع سحبنا.
function wrapSheetScrollArea(sheet) {
  if (sheet.querySelector(".sheet-scroll")) return sheet.querySelector(".sheet-scroll");
  const scrollArea = document.createElement("div");
  scrollArea.className = "sheet-scroll";
  const keepOutside = new Set(["sheet-close-small", "sheet-handle"]);
  const toMove = [...sheet.children].filter(child => ![...child.classList].some(c => keepOutside.has(c)));
  toMove.forEach(child => scrollArea.appendChild(child));
  sheet.appendChild(scrollArea);
  return scrollArea;
}

function initSheetGestures() {
  $$(".sheet").forEach(sheet => {
    const overlay = sheet.closest(".overlay");
    if (!overlay || sheet.dataset.gestureReady) return;

    sheet.dataset.gestureReady = "1";

    const scrollArea = wrapSheetScrollArea(sheet);

    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let sheetOffset = 0;
    let dragging = false;
    let captured = false;
    let mode = "none";

    const resetSheet = () => {
      sheet.style.transform = "";
      sheet.style.transition = "";
      sheet.classList.remove("handle-active");
      sheetOffset = 0;
    };

    sheet.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      // منمنع بدء السحب فقط من عناصر نصية ممكن يكون فيها تحديد نص
      // (تحرير المهمة، خانة البحث) — كل حاجة تانية على البطاقة،
      // حتى الأزرار والمفاتيح، تقدر تبدأ منها سحب البطاقة كلها.
      if (/** @type {Element} */ (event.target).closest("textarea, input[type='text'], input[type='search']")) return;

      startX = event.clientX;
      startY = event.clientY;
      lastY = event.clientY;
      sheetOffset = 0;
      dragging = true;
      captured = false;
      mode = "none";
      sheet.style.transition = "none";
    });

    // تتبّع الإصبع 1:1 من غير أي مقاومة، من أي نقطة على البطاقة
    // كلها، بما فيها جوه المحتوى اللي بيتسكرول. في لمسة واحدة:
    // سحب لأسفل أول حاجة يسكرل المحتوى لفوق لو لسه فيه سكرول
    // متاح، وبعد ما يوصل لآخر نقطة فيه، أي سحب زيادة يتحول لسحب
    // البطاقة نفسها للإغلاق — وبالعكس لو رجعت لفوق.
    sheet.addEventListener("pointermove", event => {
      if (!dragging) return;

      const dx = event.clientX - startX;
      const totalDy = event.clientY - startY;
      let incrementalDy = event.clientY - lastY;
      lastY = event.clientY;

      if (mode === "none" && (Math.abs(dx) > 8 || Math.abs(totalDy) > 8)) {
        mode = Math.abs(totalDy) >= Math.abs(dx) ? "vertical" : "horizontal";

        sheet.classList.add("handle-active");
        clearTimeout(sheet._handleTimer);
        sheet._handleTimer = setTimeout(() => {
          sheet.classList.remove("handle-active");
        }, 1600);
        if (!captured) {
          sheet.setPointerCapture?.(event.pointerId);
          captured = true;
        }
      }

      if (mode === "vertical") {
        if (incrementalDy > 0) {
          // الإصبع نازل: أول نستهلك أي سكرول متاح لفوق في المحتوى،
          // والباقي يتحول لسحب البطاقة لتحت.
          if (scrollArea.scrollTop > 0) {
            const consumed = Math.min(incrementalDy, scrollArea.scrollTop);
            scrollArea.scrollTop -= consumed;
            incrementalDy -= consumed;
          }
          sheetOffset = Math.max(0, sheetOffset + incrementalDy);
        } else if (incrementalDy < 0) {
          // الإصبع طالع: أول نرجّع البطاقة لوضعها لو كانت متسحوبة،
          // والباقي يتحول لسكرول المحتوى لتحت.
          if (sheetOffset > 0) {
            const consumed = Math.min(-incrementalDy, sheetOffset);
            sheetOffset -= consumed;
            incrementalDy += consumed;
          }
          if (incrementalDy < 0) {
            scrollArea.scrollTop -= incrementalDy;
          }
        }

        sheet.style.transform = `translateY(${sheetOffset}px)`;
        if (event.cancelable) event.preventDefault();
      } else if (mode === "horizontal") {
        sheet.style.transform = `translateX(${dx}px)`;
        if (event.cancelable) event.preventDefault();
      }
    });

    const finish = event => {
      if (!dragging) return;

      dragging = false;

      const dx = event.clientX - startX;

      const horizontalDismiss = mode === "horizontal" && Math.abs(dx) > 90;
      const verticalDismiss = mode === "vertical" && sheetOffset > 90;

      if (mode !== "vertical" && mode !== "horizontal") return;

      sheet.style.transition = "transform .22s ease-out";

      if (horizontalDismiss) {
        sheet.style.transform = `translateX(${dx > 0 ? 120 : -120}%)`;
      } else if (verticalDismiss) {
        sheet.style.transform = "translateY(120%)";
      } else {
        resetSheet();
        return;
      }

      setTimeout(() => {
        closeOverlay(overlay);
        sheet.classList.remove("handle-active");
      }, 220);
    };

    sheet.addEventListener("pointerup", finish);
    sheet.addEventListener("pointercancel", finish);
  });
}
