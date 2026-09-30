/* ============================================================
   updatenotice.js — 部署更新提示角标（Feature A）
   · 仅在欢迎页 #intro-page 内右下角显示（随欢迎页滚出视口）
   · localStorage 记录已读时间戳；deploy.js 的 ts 变化后首次访问再显示
   · 点击角标任意处或 × → 标记已读并隐藏
   ============================================================ */
(function () {
    'use strict';

    var STORAGE_KEY = '__lastSeenDeploy__';

    function init() {
        var dep = window.__DEPLOY__;
        if (!dep || !dep.ts) return;

        var seen = null;
        try { seen = localStorage.getItem(STORAGE_KEY); } catch (e) { /* 隐私模式等 */ }
        if (seen === dep.ts) return; // 本次更新已读

        var intro = document.getElementById('intro-page');
        if (!intro || document.getElementById('deploy-badge')) return;

        var badge = document.createElement('div');
        badge.id = 'deploy-badge';
        badge.className = 'deploy-badge';
        badge.title = '点击关闭';
        badge.innerHTML =
            '<span class="deploy-badge-text">\ud83d\udccc 网站已更新 \u00b7 ' + dep.ts.slice(0, 10) + '</span>' +
            '<button class="deploy-badge-close" title="关闭">\u00d7</button>';

        badge.addEventListener('click', function () {
            try { localStorage.setItem(STORAGE_KEY, dep.ts); } catch (e) { /* 忽略 */ }
            badge.remove();
        });

        intro.appendChild(badge);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
