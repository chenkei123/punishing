/* ============================================================
   toast.js — 统一轻量提示层（第 7 项）
   · window.showToast(msg, type, duration)：type = info | success | error | warn
   · 顶部中央堆叠、自动消失、悬停暂停、可点 × 关闭
   · 补全 script.js 中已有但未定义的 showToast 调用
   ============================================================ */
(function () {
    'use strict';

    var container = null;
    var timers = new WeakMap();

    function ensureContainer() {
        if (container && document.body.contains(container)) return container;
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    function showToast(msg, type, duration) {
        type = type || 'info';
        duration = duration || 3200;
        try {
            var box = ensureContainer();

            // 同文案去重：5 秒内相同消息不重复弹
            var existing = box.querySelectorAll('.toast-item');
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].dataset.msg === String(msg)) {
                    restart(existing[i]);
                    return;
                }
            }

            var item = document.createElement('div');
            item.className = 'toast-item toast-' + type;
            item.dataset.msg = String(msg);
            var icon = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' }[type] || 'ℹ️';
            item.innerHTML = '<span class="toast-icon"></span><span class="toast-text"></span><button class="toast-close">×</button>';
            item.querySelector('.toast-icon').textContent = icon;
            item.querySelector('.toast-text').textContent = msg;
            item.querySelector('.toast-close').addEventListener('click', function () {
                dismiss(item);
            });
            box.appendChild(item);

            requestAnimationFrame(function () { item.classList.add('show'); });
            start(item, duration);
            while (box.children.length > 5) dismiss(box.firstElementChild);
        } catch (e) {
            console.log('[toast]', msg);
        }
    }

    function start(item, duration) {
        var t = setTimeout(function () { dismiss(item); }, duration);
        timers.set(item, t);
        item.onmouseenter = function () { clearTimeout(timers.get(item)); };
        item.onmouseleave = function () { restart(item); };
    }
    function restart(item) {
        clearTimeout(timers.get(item));
        var t = setTimeout(function () { dismiss(item); }, 3200);
        timers.set(item, t);
    }
    function dismiss(item) {
        if (!item || !item.parentNode) return;
        clearTimeout(timers.get(item));
        item.classList.remove('show');
        setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 250);
    }

    window.showToast = showToast;
})();
