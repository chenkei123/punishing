/* ============================================================
   progressive-img.js — 选择网格缩略图加载（Feature B 方案乙）
   · 仅背景/角色「选择网格」用缩略图；预览区与导出始终使用原图，
     因此所有导出路径天然高清，无需任何导出钩子
   · 缩略图路径映射：backgrounds/2.png → backgrounds/thumb/2.png.jpg
     （保留原完整文件名，避免 MC3.jpeg 与 MC3.png 撞名）
   · 缩略图缺失（404）自动回退原图，零副作用
   · 精准保护：script.js 的「批量应用」会从网格 img.src 读回 URL，
     因此在触碰「批量应用」方块时先恢复该网格全部原图并冻结缩略替换，
     保证任何读取得到的都是原始 URL
   ============================================================ */
(function () {
    'use strict';

    var GRID_SELECTORS = ['#background-list', '#ming-background-list'];
    // 注：角色网格不参与缩略图替换——透明立绘转 JPEG 会丢透明变白底，
    //     且角色图总量很小（<1MB），无缩略图收益
    var frozen = new WeakSet(); // 已冻结（恢复原图、停止替换）的网格容器

    function toThumb(src) {
        if (!src) return null;
        if (src.indexOf('/thumb/') >= 0 || src.indexOf('thumb/') === 0) return null;
        if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return null;
        if (src.indexOf('characters/') === 0 || src.indexOf('/characters/') >= 0) return null;
        var m = src.match(/^(.*\/)([^\/?#]+)(\?|#|$)/);
        if (!m || !m[2]) return null;
        return m[1] + 'thumb/' + m[2] + '.jpg';
    }

    function upgradeImg(img) {
        if (!img || img.dataset.pvOrig) return; // 已处理
        var orig = img.getAttribute('src');
        var thumb = toThumb(orig);
        if (!thumb) return;
        img.dataset.pvOrig = orig;
        img.src = thumb;
        img.addEventListener('error', function () {
            // 缩略图不存在等情况：回退原图
            if (img.dataset.pvOrig) {
                img.src = img.dataset.pvOrig;
                delete img.dataset.pvOrig;
            }
        }, { once: true });
    }

    function scanContainer(container) {
        if (frozen.has(container)) return;
        var imgs = container.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) upgradeImg(imgs[i]);
    }

    function freezeContainer(container) {
        if (!container || frozen.has(container)) return;
        frozen.add(container);
        var imgs = container.querySelectorAll('img[data-pv-orig]');
        for (var i = 0; i < imgs.length; i++) {
            imgs[i].src = imgs[i].dataset.pvOrig;
            delete imgs[i].dataset.pvOrig;
        }
    }

    function watch(container) {
        if (!container || container.dataset.pvWatched) return;
        container.dataset.pvWatched = '1';
        scanContainer(container);

        var mo = new MutationObserver(function (mutations) {
            if (frozen.has(container)) return;
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.tagName === 'IMG') upgradeImg(node);
                    else if (node.querySelectorAll) {
                        var imgs = node.querySelectorAll('img');
                        for (var k = 0; k < imgs.length; k++) upgradeImg(imgs[k]);
                    }
                }
            }
        });
        mo.observe(container, { childList: true, subtree: true });

        // 精准保护：「批量应用」点击链路里站点会读 img.src（script.js 批量应用逻辑），
        // 触碰该方块前恢复原图并冻结，确保读到的永远是原始 URL
        container.addEventListener('pointerdown', function (e) {
            var target = e.target;
            if (!target || !target.closest) return;
            if (target.closest('.batch-apply-bg')) {
                freezeContainer(container);
            }
        }, true);
        container.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || !target.closest) return;
            if (target.closest('.batch-apply-bg')) {
                freezeContainer(container);
            }
        }, true);
    }

    function init() {
        for (var i = 0; i < GRID_SELECTORS.length; i++) {
            watch(document.querySelector(GRID_SELECTORS[i]));
        }
        // 鸣潮背景列表由 ming.js 动态注入：等它出现后再挂观察
        if (!document.getElementById('ming-background-list')) {
            var pending = new MutationObserver(function () {
                var el = document.getElementById('ming-background-list');
                if (el) {
                    pending.disconnect();
                    watch(el);
                }
            });
            var root = document.getElementById('ming-mode-root') || document.body;
            pending.observe(root, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
