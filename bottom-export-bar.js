/**
 * bottom-export-bar.js — 底部「导出 / 全部导出」按键 + 导出格式选择弹窗
 *
 * 设计要点（对应任务清单 bottom-export-tasklist.md）：
 * - IIFE 封装，零全局污染，仅暴露 window.BottomExportBar 调试入口；
 * - 按钮由本文件运行时注入 #ming-mode-nav（不改 ming.html / ming.js 两份模板），
 *   因此 file:// 双击打开与 http:// 本地服务器行为完全一致；
 * - 挂载用 MutationObserver（导航栏出现即注入并断开），无轮询、无常驻定时器；
 * - GIF/MP4 仅在打字机动画开启时可选（每次打开弹窗时刷新一次可用性，不监听开关）；
 * - 「全部导出」的 GIF/MP4 走逐幕串行导出（复用成熟的单幕 exportGIF / exportMP4），
 *   通过 window.__bebAllFormat 与 script.js 中 performFilteredExport 的单点补丁衔接；
 * - 导出进行中：点击弹 toast 拒绝 + MutationObserver 感知进度弹窗后置灰按钮。
 */
(function () {
    'use strict';

    var VERSION = '20260929';
    var currentMode = 'single'; // 'single' | 'all'
    var wired = false;
    var btnExport = null;
    var btnAll = null;

    var FORMAT_HINT = '需先开启打字机动画（「动画设置 → 打字机动画」）';

    /* ============ 低耦合取值：优先读 DOM，state 兜底 ============ */

    function readAnimationEnabled() {
        var t = document.getElementById('animation-toggle-left') ||
                document.getElementById('animation-toggle-right');
        if (t) return !!t.checked;
        try {
            return !!(typeof state !== 'undefined' && state.animationEnabled);
        } catch (e) { return false; }
    }

    function readBusy() {
        var m = document.getElementById('export-progress-modal');
        if (m && m.style && m.style.display && m.style.display !== 'none') return true;
        try {
            return !!(typeof state !== 'undefined' && (state.isExporting || state.isExportAll));
        } catch (e) { return false; }
    }

    function readExportResolution() {
        var label = document.getElementById('export-resolution-value');
        var v = parseInt(label && label.textContent, 10);
        if (!v) {
            try { v = (typeof state !== 'undefined' && state.exportResolution) || 1920; } catch (e) { v = 1920; }
        }
        return v;
    }

    function readAnimationSpeed() {
        var label = document.getElementById('speed-value-left') || document.getElementById('speed-value-right');
        var v = parseInt(label && label.textContent, 10);
        if (isNaN(v)) {
            try { v = (typeof state !== 'undefined' && state.animationSpeed) || 50; } catch (e) { v = 50; }
        }
        return v;
    }

    function toast(msg, type) {
        try {
            if (typeof showToast === 'function') { showToast(msg, type || 'info'); return; }
        } catch (e) { /* fall through */ }
        console.log('[BottomExportBar]', msg);
    }

    /* ============ 底栏按钮注入 ============ */

    function createButtons() {
        btnExport = document.createElement('button');
        btnExport.type = 'button';
        btnExport.id = 'beb-export-btn';
        btnExport.className = 'beb-btn beb-btn-success';
        btnExport.textContent = '导出';
        btnExport.title = '导出当前画面（PNG / GIF / MP4）';
        btnExport.addEventListener('click', function () { openFormatModal('single'); });

        btnAll = document.createElement('button');
        btnAll.type = 'button';
        btnAll.id = 'beb-export-all-btn';
        btnAll.className = 'beb-btn beb-btn-secondary';
        btnAll.textContent = '全部导出';
        btnAll.title = '导出全部暂存画面（可勾选，PNG / GIF / MP4）';
        btnAll.addEventListener('click', function () { openFormatModal('all'); });
    }

    function mountIntoNav(nav) {
        if (!nav || !btnExport) return false;
        if (!document.getElementById('beb-export-btn')) nav.insertBefore(btnExport, nav.firstChild);
        if (!document.getElementById('beb-export-all-btn')) nav.appendChild(btnAll);
        return true;
    }

    function watchNav() {
        if (mountIntoNav(document.getElementById('ming-mode-nav'))) return;
        // 导航栏由 ming.js 异步注入（http:// 走 fetch，file:// 走内置兜底模板），监听到出现即挂载
        var root = document.getElementById('ming-mode-root') || document.body;
        var obs = new MutationObserver(function () {
            if (mountIntoNav(document.getElementById('ming-mode-nav'))) obs.disconnect();
        });
        obs.observe(root, { childList: true, subtree: true });
    }

    /* ============ 格式选择弹窗 ============ */

    // 弹窗 DOM 静态写在 index.html；此处兜底：若缺失（如脚本被单独复用）则自动补建
    function ensureModalDom() {
        var modal = document.getElementById('beb-format-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'beb-format-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML =
            '<div class="modal-content beb-modal-content">' +
                '<span class="beb-modal-close" id="beb-modal-close" title="关闭">×</span>' +
                '<h3 id="beb-modal-title">选择导出格式</h3>' +
                '<p id="beb-modal-subtitle" class="beb-subtitle"></p>' +
                '<p id="beb-modal-meta" class="beb-meta"></p>' +
                '<div class="beb-format-grid">' +
                    '<button type="button" class="beb-card" data-format="png">' +
                        '<span class="beb-card-title">PNG</span>' +
                        '<span class="beb-card-desc">静态图 · 单帧</span>' +
                    '</button>' +
                    '<button type="button" class="beb-card" data-format="gif" data-need-anim="1">' +
                        '<span class="beb-card-title">GIF</span>' +
                        '<span class="beb-card-desc">动画图 · 打字机效果</span>' +
                    '</button>' +
                    '<button type="button" class="beb-card" data-format="mp4" data-need-anim="1">' +
                        '<span class="beb-card-title">MP4</span>' +
                        '<span class="beb-card-desc">视频 · 打字机效果</span>' +
                    '</button>' +
                '</div>' +
                '<p class="beb-gate-tip" id="beb-gate-tip">GIF / MP4 需先在「动画设置」中开启打字机动画</p>' +
                '<div class="modal-footer">' +
                    '<button type="button" id="beb-cancel-btn" class="btn btn-secondary">取消</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        return modal;
    }

    function refreshCards() {
        var modal = document.getElementById('beb-format-modal');
        if (!modal) return;
        var animOn = readAnimationEnabled();
        var cards = modal.querySelectorAll('.beb-card');
        for (var i = 0; i < cards.length; i++) {
            var c = cards[i];
            var disabled = c.getAttribute('data-need-anim') === '1' && !animOn;
            c.classList.toggle('beb-disabled', disabled);
            c.disabled = disabled;
            c.title = disabled ? FORMAT_HINT : '';
        }
        var tip = document.getElementById('beb-gate-tip');
        if (tip) tip.style.display = animOn ? 'none' : 'block';
    }

    function updateMeta() {
        var meta = document.getElementById('beb-modal-meta');
        if (!meta) return;
        var res = readExportResolution();
        meta.textContent = '导出尺寸 ' + res + '×' + Math.round(res * 9 / 16) +
            ' · 动画速度 ' + readAnimationSpeed() + 'ms';
    }

    function openFormatModal(mode) {
        if (readBusy()) { toast('导出进行中，请等待完成…', 'warn'); return; }
        currentMode = mode === 'all' ? 'all' : 'single';
        var modal = ensureModalDom();
        var title = document.getElementById('beb-modal-title');
        var subtitle = document.getElementById('beb-modal-subtitle');
        if (title) title.textContent = currentMode === 'all' ? '全部导出 · 选择格式' : '导出当前画面 · 选择格式';
        if (subtitle) {
            subtitle.textContent = currentMode === 'all'
                ? '下一步可勾选要导出的暂存画面'
                : '仅导出当前正在编辑的这一幕';
        }
        refreshCards();
        updateMeta();
        modal.style.display = 'flex';
    }

    function closeFormatModal() {
        var modal = document.getElementById('beb-format-modal');
        if (modal) modal.style.display = 'none';
    }

    function handleFormatChoice(fmt) {
        closeFormatModal();
        if (currentMode === 'all') {
            if (typeof showExportPreviewModal === 'function') {
                window.__bebAllFormat = fmt; // 由 script.js 的 performFilteredExport 读取（用完即清）
                showExportPreviewModal(fmt);
            } else {
                toast('导出预览组件未就绪，请刷新页面重试', 'error');
            }
            return;
        }
        try {
            if (fmt === 'png' && typeof exportCanvas === 'function') { exportCanvas(); return; }
            if (fmt === 'gif' && typeof exportGIF === 'function') { exportGIF(); return; }
            if (fmt === 'mp4' && typeof exportMP4 === 'function') { exportMP4(); return; }
            toast('导出功能未就绪，请刷新页面重试', 'error');
        } catch (e) {
            console.error('[BottomExportBar] 单幕导出失败:', e);
        }
    }

    function wireModal(modal) {
        if (wired || !modal) return;
        wired = true;
        modal.addEventListener('click', function (e) {
            if (e.target === modal) { closeFormatModal(); return; } // 点遮罩空白处关闭
            if (e.target.id === 'beb-modal-close' || e.target.id === 'beb-cancel-btn') {
                closeFormatModal();
                return;
            }
            var card = e.target.closest ? e.target.closest('.beb-card') : null;
            if (card && !card.disabled && !card.classList.contains('beb-disabled')) {
                handleFormatChoice(card.getAttribute('data-format'));
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.style.display !== 'none') closeFormatModal();
        });
    }

    /* ============ 逐幕串行导出（GIF / MP4，供 script.js 补丁调用） ============ */

    async function runSeriesExport(scenesArray, kind) {
        if (!scenesArray || !scenesArray.length) { toast('没有可导出的场景', 'warn'); return; }
        if (typeof restoreState !== 'function' || typeof updatePreview !== 'function' ||
            typeof showExportProgress !== 'function') {
            toast('导出组件未就绪，请刷新页面重试', 'error');
            return;
        }
        if (readBusy()) { toast('正在导出中,请等待完成...', 'warn'); return; }

        // 完整保存现场（script.js 的 cloneState 只含 scenes/currentSceneIndex，不够还原输入框等）
        var originalScenes = JSON.parse(JSON.stringify(state.scenes));
        var originalSceneIndex = state.currentSceneIndex;
        var originalDialogValue = '';
        try { originalDialogValue = elements.dialogInput.value; } catch (e) { /* ignore */ }

        state.isExportAll = true;
        state.shouldCancelExport = false;
        state.exportAllProgress = { current: 0, total: scenesArray.length, failed: 0 };

        showExportProgress(kind === 'mp4' ? '正在导出全部MP4...' : '正在导出全部GIF...', true);
        showAllExportProgress(0, scenesArray.length);

        var w = readExportResolution();
        var h = Math.round(w * 9 / 16);
        var done = 0, ok = 0, failed = 0;

        for (var i = 0; i < scenesArray.length; i++) {
            if (state.shouldCancelExport) break;
            try {
                restoreState(scenesArray[i]);
                updatePreview();
                await new Promise(function (r) { setTimeout(r, 120); }); // 等待渲染，同 exportMultipleAsPng
                if (kind === 'gif') {
                    await exportGIF(state.currentSceneIndex, 'scene_' + (i + 1) + '_' + w + 'x' + h + '.gif', true, false);
                } else {
                    var ext = 'mp4';
                    try {
                        if (typeof checkMP4Support === 'function') {
                            var s = checkMP4Support();
                            if (s.supported && s.mimeType && s.mimeType.indexOf('mp4') === -1) ext = 'webm';
                        }
                    } catch (e) { /* ignore */ }
                    await exportMP4(state.currentSceneIndex, 'scene_' + (i + 1) + '_' + w + 'x' + h + '.' + ext, true);
                }
                ok++;
            } catch (err) {
                failed++;
                console.error('[BottomExportBar] 第 ' + (i + 1) + ' 幕 ' + kind.toUpperCase() + ' 导出失败:', err);
            }
            done++;
            state.exportAllProgress.current = done;
            showAllExportProgress(done, scenesArray.length);
            updateExportProgress(Math.round((done / scenesArray.length) * 100),
                '已完成 ' + done + '/' + scenesArray.length + ' 个画面');
        }

        var cancelled = !!state.shouldCancelExport;

        // 恢复现场（含取消路径下 exportGIF 提前 return 遗留的打字机覆盖层）
        try {
            restoreState({ scenes: originalScenes, currentSceneIndex: originalSceneIndex });
            if (typeof _exportRestoreOverlay === 'function') _exportRestoreOverlay();
            try { if (elements.dialogInput) elements.dialogInput.value = originalDialogValue; } catch (e) { /* ignore */ }
            updatePreview();
        } catch (e) {
            console.error('[BottomExportBar] 恢复现场失败:', e);
        }

        state.isExportAll = false;
        hideExportProgress();

        if (cancelled) toast('导出已取消（成功 ' + ok + '/' + scenesArray.length + '）', 'warn');
        else if (failed > 0) toast('导出完成，' + failed + ' 个画面失败', 'warn');
        else toast('全部' + (kind === 'mp4' ? 'MP4' : 'GIF') + '导出完成！', 'success');
    }

    // 供 script.js 的 performFilteredExport 补丁调用的入口（逐幕串行导出 GIF / MP4）
    window.__bebExportScenesAsGifSeries = function (arr) { return runSeriesExport(arr, 'gif'); };
    window.__bebExportScenesAsMp4Series = function (arr) { return runSeriesExport(arr, 'mp4'); };

    /* ============ 导出中置灰按钮（事件驱动，无轮询） ============ */
    function setButtonsDisabled(busy) {
        [btnExport, btnAll].forEach(function (b) {
            if (!b) return;
            b.classList.toggle('beb-disabled', busy);
            b.disabled = busy;
            if (busy) {
                b.title = '导出中…';
            } else {
                b.title = (b === btnExport) ? '导出当前画面（PNG / GIF / MP4）'
                                            : '导出全部暂存画面（可勾选，PNG / GIF / MP4）';
            }
        });
    }

    function watchBusyFlag() {
        var m = document.getElementById('export-progress-modal');
        if (!m) return;
        new MutationObserver(function () { setButtonsDisabled(readBusy()); })
            .observe(m, { attributes: true, attributeFilter: ['style'] });
    }

    // 预览弹窗关闭时清理未消费的格式标记（用户取消勾选导出的情况），避免残留影响旧按钮
    function watchPreviewModalCleanup() {
        var pm = document.getElementById('export-preview-modal');
        if (!pm) return;
        new MutationObserver(function () {
            if (!pm.style || pm.style.display === 'none') window.__bebAllFormat = null;
        }).observe(pm, { attributes: true, attributeFilter: ['style'] });
    }

    /* ============ 初始化 ============ */

    function init() {
        createButtons();
        wireModal(ensureModalDom());
        watchNav();
        watchBusyFlag();
        watchPreviewModalCleanup();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 调试入口
    window.BottomExportBar = {
        version: VERSION,
        open: function (mode) { openFormatModal(mode === 'all' ? 'all' : 'single'); },
        close: closeFormatModal,
        refresh: refreshCards
    };
})();
