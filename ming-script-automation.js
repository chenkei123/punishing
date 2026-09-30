/* ============================================================
   ming-script-automation.js — 鸣潮「剧情 / 飞讯」剧本自动化（实验）
   · 入口：复用左侧「🎬 剧本模式（实验）」按钮——鸣潮模式下按当前
     子模式（剧情 / 飞讯，以 body.feixun-mode-active 判定）打开对应弹窗
   · 剧情模式：沿用战双语法（漂泊者=指挥官同构），画面走 state.scenes，
     跑完弹战双分镜（window.__scriptAutomation.openStoryboard）；
     多立绘同框（同一行写多个「使用角色立绘N」）+ 背景/立绘「继承」与战双一致
   · 飞讯模式：联系人:消息（左） / 漂泊者:消息（右） / "切换联系人N" /
     "新对话" / "下一幕"=提交一帧；跑前快照、分镜里可一键还原；
     导出：PNG 逐帧（默认）/ GIF 轮播（导出GIF）
   · 性能：IIFE 隔离、零新增依赖、每步 sleep 让出 UI 线程（停止可响应）；
     未进入鸣潮模式时不执行任何逻辑
   依赖：window.MingMode / window.FeixunSystem / window.MingBackgroundSystem /
   战双全局 state 等（均已在页面加载）
   ============================================================ */
(function () {
    'use strict';

    var mrun = {
        running: false,
        abort: false,
        speed: 300,
        exportPreset: null, // 'png' | 'gif' | null(默认PNG)
        startCount: 0,
        mode: 'story'       // 'story' | 'feixun'
    };

    // ==================== 解析器（与战双同款 + 鸣潮扩展） ====================

    var RE_QUOTED = /"([^"]*)"|\u201c([^\u201d]*)\u201d/g;
    var SEP = '\u0001';

    function cleanText(s) {
        return s.replace(new RegExp(SEP, 'g'), ' ').replace(/\s+/g, ' ').trim();
    }

    function splitSegments(rest) {
        var segs = [];
        var re = /([^\s:：\u0001]+)\s*[:：]/g;
        var matches = [];
        var m;
        re.lastIndex = 0;
        while ((m = re.exec(rest)) !== null) {
            matches.push({ name: m[1], start: m.index, contentStart: re.lastIndex });
        }
        var valid = matches.filter(function (x) { return !/^\d+$/.test(x.name); });
        for (var i = 0; i < valid.length; i++) {
            var end = (i + 1 < valid.length) ? valid[i + 1].start : rest.length;
            var content = cleanText(rest.substring(valid[i].contentStart, end));
            if (content) segs.push({ name: valid[i].name.trim(), text: content });
        }
        return segs;
    }

    function parseCommand(raw, warnings, lineNo, mode) {
        var c = (raw || '').trim();
        var m;
        if (c === '下一幕') return { op: 'nextScene' };
        if (c === '下一句') return { op: 'nextDialog' };
        if ((m = c.match(/^使用背景\s*(\d+)$/))) return { op: 'bg', n: parseInt(m[1], 10) };
        if ((m = c.match(/^使用(?:角色)?立绘\s*(\d+)$/))) return { op: 'char', n: parseInt(m[1], 10) };
        if ((m = c.match(/^切换联系人\s*(\d+)$/))) return { op: 'switchContact', n: parseInt(m[1], 10) };
        if (c === '新对话') return { op: 'newDialogue' };
        if ((m = c.match(/^延迟\s*(\d+)$/))) return { op: 'delay', ms: Math.min(parseInt(m[1], 10), 10000) };
        if (c === '延迟') return { op: 'delay', ms: 300 };
        if (c === '不使用背景' || c === '清除背景' || c === '无背景' || c === '不使用背景图') return { op: 'nobg' };
        if (c === '不使用立绘' || c === '不使用角色立绘' || c === '清除立绘' ||
            c === '清除角色立绘' || c === '无立绘' || c === '无角色立绘') return { op: 'nochar' };
        if (c === '打开打字机动画') return { op: 'anim', on: true };
        if (c === '关闭打字机动画') return { op: 'anim', on: false };
        if (c === '导出PNG') return { op: 'export', fmt: 'png' };
        if (c === '导出GIF') return { op: 'export', fmt: 'gif' };
        if (c === '导出MP4') {
            warnings.push('第 ' + lineNo + ' 行：飞讯/剧情剧本不支持导出MP4，已忽略');
            return null;
        }
        if (c === '导出') return { op: 'export', fmt: 'auto' };
        warnings.push('第 ' + lineNo + ' 行：未知指令「' + c + '」，已忽略');
        return null;
    }

    // mode: 'story' | 'feixun'
    function parseScript(text, mode) {
        var steps = [];
        var warnings = [];
        var lines = String(text || '').split(/\r?\n/);
        lines.forEach(function (line, ln) {
            var lineNo = ln + 1;
            var cmds = [];
            var m;
            RE_QUOTED.lastIndex = 0;
            while ((m = RE_QUOTED.exec(line)) !== null) {
                cmds.push(m[1] !== undefined ? m[1] : m[2]);
            }
            var rest = line.replace(RE_QUOTED, SEP);
            var segs = splitSegments(rest);

            segs.forEach(function (s) {
                if (mode === 'feixun') {
                    if (s.name === '联系人') steps.push({ type: 'dialog', side: 'left', text: s.text, line: lineNo });
                    else if (s.name === '漂泊者') steps.push({ type: 'dialog', side: 'right', text: s.text, line: lineNo });
                    else warnings.push('第 ' + lineNo + ' 行：飞讯剧本只支持「联系人: / 漂泊者:」前缀，「' + s.name + '」已忽略');
                } else {
                    var isCommander = (s.name === '漂泊者' || s.name === '指挥官');
                    steps.push({ type: 'dialog', name: s.name, text: s.text, isCommander: isCommander, line: lineNo });
                }
            });
            // 同一行内连续出现的「使用角色立绘N」合并成一条「同框」指令（跨行不合并）
            var lineSteps = [];
            cmds.forEach(function (raw) {
                var cmd = parseCommand(raw, warnings, lineNo, mode);
                if (!cmd) return;
                if (cmd.op === 'char') {
                    var last = lineSteps[lineSteps.length - 1];
                    if (last && last.cmd.op === 'char') {
                        last.cmd.ns.push(cmd.n);
                        last.raw = last.raw + '+' + raw.trim();
                        return;
                    }
                    cmd.ns = [cmd.n];
                }
                lineSteps.push({ type: 'command', cmd: cmd, raw: raw.trim(), line: lineNo });
            });
            lineSteps.forEach(function (s) { steps.push(s); });

            if (segs.length === 0 && cmds.length === 0 && line.trim()) {
                warnings.push('第 ' + lineNo + ' 行：无「角色:」也无引号指令，已忽略 → ' + line.trim().slice(0, 24) + '…');
            }
        });
        return { steps: steps, warnings: warnings };
    }

    // ==================== 弹窗 UI ====================

    var EXAMPLE_STORY =
        '角色: 你好，漂泊者。"使用背景1""使用角色立绘2"\n' +
        '漂泊者: 收到，准备出发。"下一幕"\n' +
        '角色: 这一仗交给我。"使用角色立绘1""延迟500""下一幕"\n' +
        '角色: 战斗开始！"使用背景3""使用角色立绘2""导出"';

    var EXAMPLE_FEIXUN =
        '联系人: 在吗？\n' +
        '漂泊者: 在的，说。\n' +
        '联系人: 任务更新了，目标在城北。\n' +
        '"下一幕"\n' +
        '"切换联系人2"\n' +
        '联系人: 新的线索出现了。\n' +
        '漂泊者: 收到，马上过去。\n' +
        '"新对话"\n' +
        '联系人: 后续章节开始。\n' +
        '"下一幕"\n' +
        '漂泊者: 下一站见。 "导出PNG"';

    function modalEl() { return document.getElementById('ming-script-modal'); }

    function buildMingModal() {
        var modal = modalEl();
        if (!modal || modal.dataset.built) return;
        modal.dataset.built = '1';

        var box = document.createElement('div');
        box.className = 'mscript-box';
        box.innerHTML =
            '<div class="mscript-header">' +
            '  <h3>🎬 剧本模式（实验）</h3>' +
            '  <button class="mscript-close" title="关闭">×</button>' +
            '</div>' +
            '<div class="mscript-body">' +
            '  <div class="mscript-intro"></div>' +
            '  <button class="msyntax-toggle">▸ 语法帮助（指令一览）</button>' +
            '  <div class="msyntax-help"></div>' +
            '  <textarea id="ming-script-input" placeholder="在此粘贴剧本…" spellcheck="false"></textarea>' +
            '  <div class="mscript-controls">' +
            '    <button id="ming-script-run-btn" class="btn btn-success">▶ 运行</button>' +
            '    <button id="ming-script-stop-btn" class="btn btn-danger">■ 停止</button>' +
            '    <button id="ming-script-example-btn" class="btn btn-secondary">填入示例</button>' +
            '    <button id="ming-script-clear-btn" class="btn btn-gray">清空</button>' +
            '    <div class="mspeed-switch" title="运行速度">' +
            '      <button data-speed="300" class="active">观察</button>' +
            '      <button data-speed="50">快速</button>' +
            '      <button data-speed="0">瞬时</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="mscript-progress">' +
            '    <div class="mscript-progress-bar-outer"><div class="mscript-progress-bar-fill"></div></div>' +
            '    <div class="mscript-progress-text">准备中…</div>' +
            '  </div>' +
            '  <div class="mscript-log"></div>' +
            '</div>';
        modal.appendChild(box);

        box.querySelector('.mscript-close').addEventListener('click', function () { tryClose(); });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) tryClose();
        });

        var synToggle = box.querySelector('.msyntax-toggle');
        var synHelp = box.querySelector('.msyntax-help');
        synToggle.addEventListener('click', function () {
            var open = synHelp.classList.toggle('open');
            synToggle.textContent = (open ? '▾ ' : '▸ ') + '语法帮助（指令一览）';
        });

        box.querySelector('#ming-script-run-btn').addEventListener('click', function () {
            if (mrun.mode === 'feixun') runFeixunScript(); else runStoryScript();
        });
        box.querySelector('#ming-script-stop-btn').addEventListener('click', function () {
            if (!mrun.running) return;
            mrun.abort = true;
            this.disabled = true;
            this.textContent = '正在停止…';
            mlog('停止请求已发送，等待当前步骤完成…', 'warn');
        });
        box.querySelector('#ming-script-example-btn').addEventListener('click', function () {
            document.getElementById('ming-script-input').value = (mrun.mode === 'feixun') ? EXAMPLE_FEIXUN : EXAMPLE_STORY;
        });
        box.querySelector('#ming-script-clear-btn').addEventListener('click', function () {
            document.getElementById('ming-script-input').value = '';
        });
        box.querySelectorAll('.mspeed-switch button').forEach(function (b) {
            b.addEventListener('click', function () {
                box.querySelectorAll('.mspeed-switch button').forEach(function (x) { x.classList.remove('active'); });
                b.classList.add('active');
                mrun.speed = parseInt(b.dataset.speed, 10);
            });
        });
    }

    function syntaxHelpHtml(mode) {
        if (mode === 'feixun') {
            return '<p>· 消息：<code>联系人: 消息</code>（左侧=当前联系人）、<code>漂泊者: 消息</code>（右侧=我方）。</p>' +
                '<p>· <code>"切换联系人N"</code> 切到第 N 个联系人（从 1 开始）；<code>"新对话"</code> 当前联系人开启新对话段。</p>' +
                '<p>· <code>"下一幕"</code> 把当前聊天画面提交为一帧（分镜中的一张图）；结尾未提交的自动提交。</p>' +
                '<p>· <code>"延迟N"</code> 本步后暂停 N 毫秒；<code>"导出"</code>/<code>"导出PNG"</code>/<code>"导出GIF"</code> 预设分镜导出格式（默认 PNG）。</p>' +
                '<p>· 指令用引号包裹，中英文引号均可。运行会改动飞讯聊天数据，分镜窗口提供「还原飞讯数据」。</p>';
        }
        return '<p>· 画面以 <code>"下一幕"</code> 分隔；画面内可写多行 <code>角色名: 台词</code>（<code>漂泊者: 台词</code> 写入漂泊者对话）。</p>' +
            '<p>· <code>"使用背景N"</code> 应用第 N 个鸣潮背景（按列表顺序，从 1 开始）；<code>"使用角色立绘N"</code> 应用第 N 个已上传立绘。</p>' +
            '<p>· <b>同一行写多个</b> <code>"使用角色立绘1""使用角色立绘2"</code> → <b>两个立绘同框</b>（最多 3 个）；跨行写则后一行覆盖前一行。</p>' +
            '<p>· <b>继承</b>：某一幕没写背景/立绘指令时，自动沿用上一次的背景/立绘；<code>"不使用立绘"/"不使用背景"</code> 清除后沿用「无」。</p>' +
            '<p>· <code>"下一句"</code> 画面内分隔标记（同框全显）；<code>"延迟N"</code> 本步后暂停 N 毫秒。</p>' +
            '<p>· <code>"导出"</code> 预设格式：未开打字机动画→PNG，开了→GIF；<code>"导出PNG"</code>/<code>"导出GIF"</code> 显式指定。</p>' +
            '<p>· 指令用引号包裹，中英文引号均可。跑完弹出分镜编辑窗口（与战双共用）。</p>';
    }

    function openMingModal() {
        var modal = modalEl();
        if (!modal) return;
        var isFeixun = document.body.classList.contains('feixun-mode-active');
        mrun.mode = isFeixun ? 'feixun' : 'story';
        modal.querySelector('.mscript-header h3').textContent =
            '🎬 剧本模式（实验）· 鸣潮' + (isFeixun ? '飞讯' : '剧情');
        modal.querySelector('.mscript-intro').textContent = isFeixun
            ? '粘贴飞讯剧本文本，自动收发消息、切换联系人、逐帧提交，结束后弹出飞讯分镜（可修改、可导出、可还原聊天数据）。'
            : '粘贴剧本文本，自动完成台词/背景/立绘与翻页，结束后弹出分镜编辑窗口（与战双共用）。';
        modal.querySelector('.msyntax-help').innerHTML = syntaxHelpHtml(mrun.mode);
        modal.style.display = 'flex';
    }

    function tryClose() {
        if (mrun.running) {
            if (!confirm('剧本正在运行中，关闭窗口后可从「剧本模式（实验）」重新打开查看进度。确定关闭？')) return;
        }
        modalEl().style.display = 'none';
    }

    function setRunningUI(on) {
        var modal = modalEl();
        if (!modal) return;
        var runBtn = modal.querySelector('#ming-script-run-btn');
        var stopBtn = modal.querySelector('#ming-script-stop-btn');
        if (runBtn) { runBtn.disabled = on; runBtn.textContent = on ? '运行中…' : '▶ 运行'; }
        modal.querySelector('#ming-script-example-btn').disabled = on;
        modal.querySelector('#ming-script-clear-btn').disabled = on;
        if (stopBtn) {
            stopBtn.style.display = on ? 'inline-block' : 'none';
            stopBtn.disabled = false;
            stopBtn.textContent = '■ 停止';
        }
        modal.querySelector('.mscript-progress').classList.toggle('active', on);
        modal.querySelector('.mscript-log').classList.add('active');
    }

    function setProgress(done, total, desc) {
        var modal = modalEl();
        if (!modal) return;
        var fill = modal.querySelector('.mscript-progress-bar-fill');
        var txt = modal.querySelector('.mscript-progress-text');
        var pct = total > 0 ? Math.round(done / total * 100) : 0;
        if (fill) fill.style.width = pct + '%';
        if (txt) txt.textContent = '第 ' + Math.min(done + 1, total) + '/' + total + ' 步（' + pct + '%）：' + desc;
    }

    function clearLog() {
        var box = document.querySelector('#ming-script-modal .mscript-log');
        if (box) box.innerHTML = '';
    }

    function mlog(msg, level) {
        var box = document.querySelector('#ming-script-modal .mscript-log');
        if (!box) return;
        var line = document.createElement('div');
        if (level) line.className = 'log-' + level;
        line.textContent = '[' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '] ' + msg;
        box.appendChild(line);
        box.scrollTop = box.scrollHeight;
        while (box.children.length > 300) box.removeChild(box.firstChild);
    }

    function sleep(ms) {
        return new Promise(function (r) { setTimeout(r, Math.max(ms, 0)); });
    }

    function describeStep(st) {
        if (st.type === 'dialog') {
            if (st.side) return (st.side === 'right' ? '[漂泊者] ' : '[联系人] ') + st.text.slice(0, 18);
            return (st.isCommander ? '[漂泊者] ' : st.name + '\uff1a') + st.text.slice(0, 18);
        }
        return '指令「' + st.raw + '」';
    }

    // ==================== 子模块 A：剧情模式（复用战双通道） ====================

    var frame = null;
    function resetFrame() { frame = { lines: [], commander: [] }; }
    function frameHasContent() { return frame && (frame.lines.length > 0 || frame.commander.length > 0); }

    function renderFrameToInputs() {
        if (!frame || typeof state === 'undefined') return;
        var scene = state.scenes[state.currentSceneIndex];
        if (!scene) return;

        var nameEl = document.getElementById('character-name');
        var inputEl = document.getElementById('dialog-input');

        var names = [];
        frame.lines.forEach(function (l) {
            if (names.indexOf(l.name) < 0) names.push(l.name);
        });

        var text = '';
        if (frame.lines.length > 0) {
            if (names.length >= 2) text = frame.lines.map(function (l) { return l.name + '\uff1a' + l.text; }).join('\n');
            else text = frame.lines.map(function (l) { return l.text; }).join('\n');
        }
        nameEl.value = frame.lines.length > 0 ? names[0] : '???';
        if (typeof adjustCharacterNamePosition === 'function') adjustCharacterNamePosition();

        inputEl.value = text;
        state.isTypingUnsaved = text.length > 0;
        if (typeof updateFormattedOverlay === 'function') updateFormattedOverlay();

        var cmdText = frame.commander.join('\n');
        scene.commanderText = cmdText;
        var cmdBox = document.getElementById('commander-dialog');
        var cmdInput = document.getElementById('commander-text');
        if (cmdInput) cmdInput.value = cmdText;
        if (cmdText) {
            scene.mingCommanderDialogVisible = true;
            if (cmdBox) cmdBox.style.display = 'flex';
        } else if (!scene.mingCommanderDialogVisible) {
            if (cmdBox) cmdBox.style.display = 'none';
        }
    }

    // ==================== 背景 / 立绘 继承状态（鸣潮·剧情） ====================
    // 与战双同款：某幕没写「使用背景 / 使用角色立绘」时沿用上一次的值
    var inherit = { bg: null, bgIsVideo: false, chars: [] };

    function resetInherit() {
        var scene = state.scenes[state.currentSceneIndex];
        inherit.bg = scene ? (scene.background || null) : null;
        inherit.bgIsVideo = scene ? !!scene.backgroundIsVideo : false;
        inherit.chars = scene ? (scene.characters || []).map(function (c) {
            return { name: c.name, url: c.image };
        }) : [];
    }

    function writeInheritToScene() {
        var scene = state.scenes[state.currentSceneIndex];
        if (!scene) return;
        scene.background = inherit.bg;
        scene.backgroundIsVideo = inherit.bgIsVideo;
        scene.characters = inherit.chars.map(function (c, i) {
            return { name: c.name, image: c.url, id: Date.now() + i };
        });
        // 鸣潮背景选择器也要对齐（否则「下一幕」后 selectBackground 会拿旧值覆盖）
        if (window.MingBackgroundSystem) {
            if (inherit.bg) {
                MingBackgroundSystem.selectBackground(inherit.bg, inherit.bgIsVideo);
                if (typeof MingBackgroundSystem.renderBackgroundList === 'function') MingBackgroundSystem.renderBackgroundList();
            }
        }
        if (typeof updatePreview === 'function') updatePreview();
        if (typeof updateCharacterListSelection === 'function') updateCharacterListSelection();
    }

    function applyMingBackground(n) {
        var list = (window.MingBackgroundSystem && MingBackgroundSystem.defaultBackgrounds) || [];
        if (n < 1 || n > list.length) {
            mlog('使用背景' + n + '：越界（共 ' + list.length + ' 个鸣潮背景），已跳过', 'warn');
            return;
        }
        var bg = list[n - 1];
        inherit.bg = bg.url;
        inherit.bgIsVideo = !!bg.isVideo;
        MingBackgroundSystem.selectBackground(bg.url, !!bg.isVideo);
        if (typeof MingBackgroundSystem.renderBackgroundList === 'function') MingBackgroundSystem.renderBackgroundList();
        // 关键：同步写入当前场景，保证快照 / 分镜缩略图 / 导出与预览使用同一背景
        // （selectBackground 只改预览 DOM，不写 state.scenes）
        var scene = state.scenes[state.currentSceneIndex];
        if (scene) {
            scene.background = bg.url;
            scene.backgroundIsVideo = !!bg.isVideo;
        }
        mlog('已应用鸣潮背景 ' + n + '（' + (bg.name || bg.url) + '）');
    }

    // 一行里的多个「使用角色立绘N」同框显示（覆盖本行之前的立绘）
    function applyStoryCharacters(ns) {
        var list = state.uploadedCharacters || [];
        var picked = [];
        var bad = [];
        (ns || []).forEach(function (n) {
            if (n < 1 || n > list.length) { bad.push(n); return; }
            var c = list[n - 1];
            if (!picked.some(function (p) { return p.url === c.url; })) {
                picked.push({ name: c.name, url: c.url });
            }
        });
        if (bad.length) mlog('使用角色立绘' + bad.join('/') + '：越界或未上传（共 ' + list.length + ' 个），已跳过', 'warn');
        if (!picked.length) return;

        inherit.chars = picked;
        writeInheritToScene();
        mlog('已应用角色立绘 ' + ns.join('+') + '（' + picked.map(function (c) { return c.name; }).join('、') + '）');
    }

    function clearMingBackground() {
        inherit.bg = null;
        inherit.bgIsVideo = false;
        writeInheritToScene();
        mlog('已清除背景（后续幕沿用「无背景」）');
    }

    function clearMingCharacters() {
        inherit.chars = [];
        writeInheritToScene();
        mlog('已清除角色立绘（后续幕沿用「无立绘」）');
    }

    function commitFrameViaButton() {
        var btn = document.getElementById('next-scene-left');
        if (btn) btn.click();
        resetFrame();
        state.isTypingUnsaved = false;
        // 新场景背景/立绘被重置，写回「最近一次提到」的值（继承）
        writeInheritToScene();
    }

    function commitFrameFinal() {
        if (!frameHasContent()) return false;
        state.savedScenes.push(cloneStateWithCurrentInput());
        if (typeof addDialog === 'function') addDialog();
        state.isTypingUnsaved = false;
        if (typeof updateDialogDisplay === 'function') updateDialogDisplay();
        if (typeof updateSceneCount === 'function') updateSceneCount();
        resetFrame();
        return true;
    }

    async function runStoryScript() {
        if (mrun.running) return;
        if (typeof state === 'undefined' || typeof cloneStateWithCurrentInput !== 'function' || !window.__scriptAutomation) {
            showToast('网站核心脚本未加载完成，请刷新页面后重试。', 'success');
            return;
        }
        if (!document.body.classList.contains('ming-active') || document.body.classList.contains('feixun-mode-active')) {
            showToast('请先切换到鸣潮·剧情模式再运行（当前不是剧情模式）。', 'warn');
            return;
        }
        var input = document.getElementById('ming-script-input');
        var text = input ? input.value : '';
        if (!text.trim()) { showToast('请先粘贴或输入剧本文本。', 'warn'); return; }

        var parsed = parseScript(text, 'story');
        if (parsed.steps.length === 0) {
            showToast('没有解析到任何台词或指令。\n' + (parsed.warnings.slice(0, 3).join('\n') || ''), 'warn');
            return;
        }

        mrun.running = true;
        mrun.abort = false;
        mrun.exportPreset = null;
        mrun.startCount = state.savedScenes.length;
        setRunningUI(true);
        clearLog();
        mlog('解析完成：共 ' + parsed.steps.length + ' 个步骤' + (parsed.warnings.length ? '，' + parsed.warnings.length + ' 条警告' : ''));
        parsed.warnings.forEach(function (w) { mlog(w, 'warn'); });
        mlog('运行开始（鸣潮·剧情，速度档 ' + (mrun.speed >= 300 ? '观察' : (mrun.speed > 0 ? '快速' : '瞬时')) + '）');

        if (state.scenes.length === 0 && typeof createScene === 'function') createScene();
        resetFrame();
        // 起始场景若仍是战双遗留背景，对齐为当前鸣潮背景（避免战双图进第一帧快照）
        try {
            var sc0 = state.scenes[state.currentSceneIndex];
            var mlist = (window.MingBackgroundSystem && MingBackgroundSystem.defaultBackgrounds) || [];
            var curBg0 = window.MingBackgroundSystem && MingBackgroundSystem.currentBackground;
            var inMing = mlist.some(function (b) { return b.url === sc0.background; });
            if (sc0 && curBg0 && sc0.background && !inMing) {
                sc0.background = curBg0;
                sc0.backgroundIsVideo = false;
            }
        } catch (e) { /* 对齐失败不阻断运行 */ }
        resetInherit(); // 继承起点 = 运行前编辑区当前的背景 / 立绘

        try {
            for (var i = 0; i < parsed.steps.length; i++) {
                if (mrun.abort) { mlog('已停止：第 ' + (i + 1) + ' 步前中断', 'warn'); break; }
                var st = parsed.steps[i];
                setProgress(i, parsed.steps.length, describeStep(st));
                var stepDelay = mrun.speed;
                try {
                    if (st.type === 'dialog') {
                        if (st.isCommander) frame.commander.push(st.text);
                        else frame.lines.push({ name: st.name, text: st.text });
                        renderFrameToInputs();
                        mlog((st.isCommander ? '漂泊者：' : st.name + '\uff1a') + st.text.slice(0, 22));
                    } else {
                        var cmd = st.cmd;
                        if (cmd.op === 'nextScene') {
                            commitFrameViaButton();
                            // 「下一幕」后新场景背景被 createScene 重置，writeInheritToScene
                            // 已把「最近一次提到」的鸣潮背景写回（含 selectBackground 对齐）
                            mlog('下一幕 → 画面已提交暂存（第 ' + state.savedScenes.length + ' 帧）');
                        } else if (cmd.op === 'nextDialog') {
                            mlog('下一句（画面内分隔，同框全显）');
                        } else if (cmd.op === 'bg') {
                            applyMingBackground(cmd.n);
                        } else if (cmd.op === 'char') {
                            applyStoryCharacters(cmd.ns || [cmd.n]);
                        } else if (cmd.op === 'nobg') {
                            clearMingBackground();
                        } else if (cmd.op === 'nochar') {
                            clearMingCharacters();
                        } else if (cmd.op === 'delay') {
                            mlog('延迟 ' + cmd.ms + 'ms');
                            stepDelay = cmd.ms;
                        } else if (cmd.op === 'anim') {
                            state.animationEnabled = cmd.on;
                            var l = document.getElementById('animation-toggle-left');
                            var r2 = document.getElementById('animation-toggle-right');
                            if (l) l.checked = cmd.on;
                            if (r2) r2.checked = cmd.on;
                            mlog('已' + (cmd.on ? '打开' : '关闭') + '打字机动画');
                        } else if (cmd.op === 'export') {
                            mrun.exportPreset = cmd.fmt;
                            mlog('导出预设：' + (cmd.fmt === 'auto' ? '自动（开动画→GIF，否则→PNG）' : cmd.fmt.toUpperCase()));
                        }
                    }
                } catch (e) {
                    mlog('第 ' + st.line + ' 行执行出错：' + (e && e.message ? e.message : e), 'err');
                }
                await sleep(stepDelay);
            }
            setProgress(parsed.steps.length, parsed.steps.length, '提交结尾画面');
            if (commitFrameFinal()) mlog('结尾画面已自动提交');
            var added = state.savedScenes.length - mrun.startCount;
            if (added > 0) mlog('运行完成：新增 ' + added + ' 帧，共 ' + state.savedScenes.length + ' 帧', 'ok');
            else mlog('运行结束：没有新增画面', 'warn');
            setProgress(100, 100, '完成');
        } finally {
            mrun.running = false;
            setRunningUI(false);
        }

        modalEl().style.display = 'none'; // 收起剧本弹窗，避免遮挡分镜
        window.__scriptAutomation.openStoryboard(mrun.startCount, mrun.exportPreset);
    }

    // ==================== 子模块 B：飞讯模式（独立分镜 + 导出） ====================

    var feixunFrames = [];   // 每帧：{ contacts:克隆, ci, di }
    var feixunSnapshot = null; // 运行前快照（还原用）
    var feixunSnapshotPos = null;
    var fsb = { sel: 0, preset: null };

    function fx() { return window.FeixunSystem; }

    function commitFeixunFrame(force) {
        var F = fx();
        var contact = F.contacts[F.currentContactIndex];
        var dialogue = contact && contact.dialogues[F.currentDialogueIndex];
        var hasMsg = !!(dialogue && dialogue.messages.length > 0);
        var lastFrame = feixunFrames[feixunFrames.length - 1];
        var grew = true;
        if (lastFrame) {
            grew = countAllMessages(F.contacts) > countAllMessages(lastFrame.contacts);
        }
        if (!force && !grew) return false;
        if (!hasMsg && !grew) return false;
        feixunFrames.push({
            contacts: JSON.parse(JSON.stringify(F.contacts)),
            ci: F.currentContactIndex,
            di: F.currentDialogueIndex
        });
        return true;
    }

    function countAllMessages(contacts) {
        var n = 0;
        (contacts || []).forEach(function (c) {
            (c.dialogues || []).forEach(function (d) { n += d.messages.length; });
        });
        return n;
    }

    function feixunAddMessage(side, text) {
        var F = fx();
        var contact = F.contacts[F.currentContactIndex];
        if (!contact) { mlog('当前没有联系人，消息已跳过', 'warn'); return; }
        var dialogue = contact.dialogues[F.currentDialogueIndex];
        var before = dialogue ? dialogue.messages.length : 0;
        F.addQuickMessage(side);
        var idx = before; // addQuickMessage push 到末尾 → 新消息索引 = before
        var msg = contact.dialogues[F.currentDialogueIndex].messages[idx];
        if (msg) msg.text = text;
        // 数据与 DOM 双写（addQuickMessage 渲染的空气泡是 contenteditable）
        var container = document.getElementById('feixun-messages');
        var bubble = container && container.querySelector('.feixun-message:last-child .feixun-message-bubble');
        if (bubble) bubble.textContent = text;
        var scroller = container;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }

    function feixunSwitchContact(n) {
        var F = fx();
        if (n < 1 || n > F.contacts.length) {
            mlog('切换联系人' + n + '：越界（共 ' + F.contacts.length + ' 个），已跳过', 'warn');
            return;
        }
        F.selectContact(n - 1);
        mlog('已切换到联系人 ' + n + '（' + F.contacts[n - 1].name + '）');
    }

    function feixunNewDialogue() {
        var F = fx();
        var contact = F.contacts[F.currentContactIndex];
        if (!contact) { mlog('当前没有联系人，「新对话」已跳过', 'warn'); return; }
        contact.dialogues.push({ id: 'dlg_' + contact.id + '_' + Date.now(), title: '新对话', messages: [] });
        F.selectDialogue(F.currentContactIndex, contact.dialogues.length - 1);
        mlog('已开启新对话（' + contact.name + ' 第 ' + contact.dialogues.length + ' 段）');
    }

    async function runFeixunScript() {
        if (mrun.running) return;
        if (!window.FeixunSystem) {
            showToast('飞讯系统未加载完成，请刷新页面后重试。', 'success');
            return;
        }
        if (!document.body.classList.contains('feixun-mode-active')) {
            showToast('请先切换到鸣潮·飞讯模式再运行（当前不是飞讯模式）。', 'warn');
            return;
        }
        var input = document.getElementById('ming-script-input');
        var text = input ? input.value : '';
        if (!text.trim()) { showToast('请先粘贴或输入剧本文本。', 'warn'); return; }

        var parsed = parseScript(text, 'feixun');
        if (parsed.steps.length === 0) {
            showToast('没有解析到任何消息或指令。\n' + (parsed.warnings.slice(0, 3).join('\n') || ''), 'warn');
            return;
        }

        var F = fx();
        mrun.running = true;
        mrun.abort = false;
        mrun.exportPreset = null;
        feixunFrames = [];
        feixunSnapshot = JSON.parse(JSON.stringify(F.contacts));
        feixunSnapshotPos = { ci: F.currentContactIndex, di: F.currentDialogueIndex };
        setRunningUI(true);
        clearLog();
        mlog('解析完成：共 ' + parsed.steps.length + ' 个步骤' + (parsed.warnings.length ? '，' + parsed.warnings.length + ' 条警告' : ''));
        parsed.warnings.forEach(function (w) { mlog(w, 'warn'); });
        mlog('运行开始（鸣潮·飞讯，已快照聊天数据，分镜中可还原）');

        try {
            for (var i = 0; i < parsed.steps.length; i++) {
                if (mrun.abort) { mlog('已停止：第 ' + (i + 1) + ' 步前中断', 'warn'); break; }
                var st = parsed.steps[i];
                setProgress(i, parsed.steps.length, describeStep(st));
                var stepDelay = mrun.speed;
                try {
                    if (st.type === 'dialog') {
                        feixunAddMessage(st.side, st.text);
                        mlog((st.side === 'right' ? '漂泊者：' : '联系人：') + st.text.slice(0, 22));
                    } else {
                        var cmd = st.cmd;
                        if (cmd.op === 'nextScene') {
                            if (commitFeixunFrame(false)) mlog('下一幕 → 已提交一帧（第 ' + feixunFrames.length + ' 帧）');
                            else mlog('下一幕：没有新消息，跳过提交', 'warn');
                        } else if (cmd.op === 'switchContact') {
                            feixunSwitchContact(cmd.n);
                        } else if (cmd.op === 'newDialogue') {
                            feixunNewDialogue();
                        } else if (cmd.op === 'delay') {
                            mlog('延迟 ' + cmd.ms + 'ms');
                            stepDelay = cmd.ms;
                        } else if (cmd.op === 'anim') {
                            state.animationEnabled = cmd.on;
                            var l = document.getElementById('animation-toggle-left');
                            var r2 = document.getElementById('animation-toggle-right');
                            if (l) l.checked = cmd.on;
                            if (r2) r2.checked = cmd.on;
                            mlog('已' + (cmd.on ? '打开' : '关闭') + '打字机动画');
                        } else if (cmd.op === 'export') {
                            mrun.exportPreset = cmd.fmt === 'auto' ? 'png' : cmd.fmt;
                            mlog('导出预设：' + mrun.exportPreset.toUpperCase());
                        } else if (cmd.op === 'bg' || cmd.op === 'char' || cmd.op === 'nextDialog' ||
                                   cmd.op === 'nobg' || cmd.op === 'nochar') {
                            mlog('指令「' + st.raw + '」在飞讯模式不适用，已跳过', 'warn');
                        }
                    }
                } catch (e) {
                    mlog('第 ' + st.line + ' 行执行出错：' + (e && e.message ? e.message : e), 'err');
                }
                await sleep(stepDelay);
            }
            setProgress(parsed.steps.length, parsed.steps.length, '提交结尾帧');
            if (commitFeixunFrame(false)) mlog('结尾帧已自动提交');
            if (feixunFrames.length > 0) mlog('运行完成：共 ' + feixunFrames.length + ' 帧', 'ok');
            else mlog('运行结束：没有提交任何帧', 'warn');
            setProgress(100, 100, '完成');
        } finally {
            mrun.running = false;
            setRunningUI(false);
        }

        if (feixunFrames.length > 0) {
            modalEl().style.display = 'none'; // 收起剧本弹窗，避免遮挡分镜
            openFeixunStoryboard(mrun.exportPreset);
        }
    }

    // ---------- 飞讯分镜弹窗 ----------

    function fsbEl() { return document.getElementById('feixun-storyboard-modal'); }

    function buildFeixunStoryboard() {
        var modal = fsbEl();
        if (!modal || modal.dataset.built) return;
        modal.dataset.built = '1';

        var box = document.createElement('div');
        box.className = 'fsb-box';
        box.innerHTML =
            '<div class="fsb-header">' +
            '  <h3>💬 飞讯分镜</h3><span class="fsb-header-info"></span>' +
            '  <button class="fsb-close" title="关闭">×</button>' +
            '</div>' +
            '<div class="fsb-body">' +
            '  <div class="fsb-list"></div>' +
            '  <div class="fsb-editor"></div>' +
            '</div>';
        modal.appendChild(box);
        box.querySelector('.fsb-close').addEventListener('click', function () { modal.style.display = 'none'; });
        modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
    }

    function frameSummary(fr) {
        var c = fr.contacts[fr.ci];
        var d = c && c.dialogues[fr.di];
        var first = d && d.messages.length ? d.messages[0].text : '';
        return {
            name: c ? c.name : '（无联系人）',
            count: d ? d.messages.length : 0,
            total: countAllMessages(fr.contacts),
            preview: (first || '（无消息）').slice(0, 24)
        };
    }

    function renderFeixunStoryboard() {
        var modal = fsbEl();
        if (!modal) return;
        var list = modal.querySelector('.fsb-list');
        var info = modal.querySelector('.fsb-header-info');
        if (info) {
            info.textContent = '共 ' + feixunFrames.length + ' 帧 · 导出格式：' +
                (fsb.preset === 'gif' ? 'GIF（轮播）' : 'PNG（逐帧）');
        }
        list.innerHTML = '';
        feixunFrames.forEach(function (fr, i) {
            var s = frameSummary(fr);
            var item = document.createElement('div');
            item.className = 'fsb-item' + (i === fsb.sel ? ' active' : '');
            item.innerHTML =
                '<div class="fsb-thumb">' +
                '  <div class="fsb-thumb-name"></div>' +
                '  <div class="fsb-thumb-bubbles"></div>' +
                '</div>' +
                '<div class="fsb-item-info">' +
                '  <div class="fsb-item-title">第 ' + (i + 1) + ' 帧</div>' +
                '  <div class="fsb-item-text"></div>' +
                '</div>';
            item.querySelector('.fsb-thumb-name').textContent = s.name;
            item.querySelector('.fsb-item-text').textContent = s.count + ' 条消息 · ' + s.preview;
            var bubbles = item.querySelector('.fsb-thumb-bubbles');
            var d = fr.contacts[fr.ci] && fr.contacts[fr.ci].dialogues[fr.di];
            (d ? d.messages.slice(0, 3) : []).forEach(function (msg) {
                var b = document.createElement('div');
                b.className = 'fsb-mini-bubble ' + (msg.side === 'right' ? 'right' : 'left');
                b.textContent = (msg.text || '…').slice(0, 10);
                bubbles.appendChild(b);
            });
            if (!d || !d.messages.length) {
                var b = document.createElement('div');
                b.className = 'fsb-mini-bubble left';
                b.textContent = '（空）';
                bubbles.appendChild(b);
            }
            item.addEventListener('click', function () {
                fsb.sel = i;
                renderFeixunStoryboard();
            });
            list.appendChild(item);
        });
        renderFeixunEditor();
    }

    function renderFeixunEditor() {
        var modal = fsbEl();
        var editor = modal.querySelector('.fsb-editor');
        var fr = feixunFrames[fsb.sel];
        if (!fr) {
            editor.innerHTML = '<div class="fsb-empty">没有可显示的帧</div>';
            return;
        }
        var contact = fr.contacts[fr.ci];
        var dialogue = contact && contact.dialogues[fr.di];

        var html =
            '<div class="fsb-field"><label>联系人</label><div class="fsb-contact-name"></div></div>' +
            '<div class="fsb-field"><label>消息（左侧=联系人，右侧=漂泊者；可直接修改文本）</label><div class="fsb-msgs">';
        if (dialogue && dialogue.messages.length) {
            dialogue.messages.forEach(function (msg, mi) {
                html +=
                    '<div class="fsb-msg-row" data-mi="' + mi + '">' +
                    '  <span class="fsb-msg-side ' + msg.side + '">' + (msg.side === 'right' ? '右·漂泊者' : '左·联系人') + '</span>' +
                    '  <textarea class="fsb-msg-text"></textarea>' +
                    '  <button class="fsb-msg-del btn btn-danger" title="删除这条消息">×</button>' +
                    '</div>';
            });
        } else {
            html += '<div style="color:#8888a5;font-size:12px">该帧当前对话没有消息</div>';
        }
        html += '</div></div>' +
            '<div class="fsb-btns">' +
            '  <button class="btn btn-secondary fsb-prev">◀ 上一帧</button>' +
            '  <button class="btn btn-secondary fsb-next">下一帧 ▶</button>' +
            '  <button class="btn btn-success fsb-save">保存修改</button>' +
            '  <button class="btn btn-danger fsb-del">删除此帧</button>' +
            '  <button class="btn btn-primary fsb-export">全部导出</button>' +
            '  <button class="btn btn-gray fsb-restore">还原飞讯数据</button>' +
            '</div>' +
            '<div class="fsb-hint">「保存修改」写回该帧数据；「全部导出」按预设格式导出（PNG 逐帧 / GIF 轮播）；「还原飞讯数据」把运行前的聊天数据写回。</div>';
        editor.innerHTML = html;
        editor.querySelector('.fsb-contact-name').textContent = contact ? (contact.name + '（第 ' + (fr.di + 1) + ' 段对话）') : '（无）';

        editor.querySelectorAll('.fsb-msg-row').forEach(function (row) {
            var mi = parseInt(row.dataset.mi, 10);
            row.querySelector('.fsb-msg-text').value = dialogue.messages[mi].text || '';
            row.querySelector('.fsb-msg-del').addEventListener('click', function () {
                dialogue.messages.splice(mi, 1);
                renderFeixunStoryboard();
            });
        });

        editor.querySelector('.fsb-prev').addEventListener('click', function () {
            if (fsb.sel > 0) { fsb.sel--; renderFeixunStoryboard(); }
        });
        editor.querySelector('.fsb-next').addEventListener('click', function () {
            if (fsb.sel < feixunFrames.length - 1) { fsb.sel++; renderFeixunStoryboard(); }
        });
        editor.querySelector('.fsb-save').addEventListener('click', function () {
            editor.querySelectorAll('.fsb-msg-row').forEach(function (row) {
                var mi = parseInt(row.dataset.mi, 10);
                if (dialogue.messages[mi]) dialogue.messages[mi].text = row.querySelector('.fsb-msg-text').value;
            });
            var btn = editor.querySelector('.fsb-save');
            btn.textContent = '✓ 已保存';
            setTimeout(function () { btn.textContent = '保存修改'; }, 1200);
            renderFeixunStoryboard();
        });
        editor.querySelector('.fsb-del').addEventListener('click', function () {
            if (!confirm('确定删除第 ' + (fsb.sel + 1) + ' 帧吗？')) return;
            feixunFrames.splice(fsb.sel, 1);
            if (!feixunFrames.length) {
                fsbEl().style.display = 'none';
                showToast('已删除全部帧。', 'warn');
                return;
            }
            if (fsb.sel >= feixunFrames.length) fsb.sel = feixunFrames.length - 1;
            renderFeixunStoryboard();
        });
        editor.querySelector('.fsb-export').addEventListener('click', exportFeixunFrames);
        editor.querySelector('.fsb-restore').addEventListener('click', function () {
            if (!feixunSnapshot) { showToast('没有可还原的快照。', 'warn'); return; }
            if (!confirm('把飞讯聊天数据还原到本次运行之前的状态？当前聊天内容将被覆盖。')) return;
            var F = fx();
            F.setContactsData(feixunSnapshot);
            if (feixunSnapshotPos) F.selectDialogue(feixunSnapshotPos.ci, feixunSnapshotPos.di);
            showToast('已还原飞讯数据。', 'success');
        });
    }

    function openFeixunStoryboard(preset) {
        var modal = fsbEl();
        if (!modal || !feixunFrames.length) return;
        fsb.preset = preset === 'gif' ? 'gif' : 'png';
        fsb.sel = feixunFrames.length - 1;
        modal.style.display = 'flex';
        renderFeixunStoryboard();
    }

    // ---------- 飞讯导出（PNG 逐帧 / GIF 轮播） ----------

    async function exportFeixunFrames() {
        var F = fx();
        if (!F || !feixunFrames.length) { showToast('没有可导出的帧。', 'warn'); return; }
        var fmt = fsb.preset === 'gif' ? 'gif' : 'png';
        var container = document.getElementById('feixun-container');
        if (!container || typeof html2canvas !== 'function') {
            showToast('导出组件未加载，请刷新页面后重试。', 'warn');
            return;
        }

        // 保存导出前的实时状态，导出后恢复
        var liveContacts = JSON.parse(JSON.stringify(F.contacts));
        var liveCi = F.currentContactIndex;
        var liveDi = F.currentDialogueIndex;

        fsbEl().style.display = 'none';
        if (fmt === 'png') showProgress('正在导出飞讯 PNG…');

        var gif = null;
        if (fmt === 'gif') {
            gif = new GIF({ workers: 2, quality: state.exportQuality || 2, workerScript: (typeof getGifWorkerBlobUrl === 'function' ? await getGifWorkerBlobUrl() : undefined) });
            showProgress('正在导出飞讯 GIF…');
        }

        var failed = 0;
        try {
            for (var i = 0; i < feixunFrames.length; i++) {
                var fr = feixunFrames[i];
                F.contacts = JSON.parse(JSON.stringify(fr.contacts));
                F.currentContactIndex = fr.ci;
                F.currentDialogueIndex = fr.di;
                F.renderContacts();
                F.renderMessages();
                F.updateChatTitle();
                await sleep(180); // 等待头像/气泡渲染稳定

                setExportProgressText('正在导出第 ' + (i + 1) + '/' + feixunFrames.length + ' 帧…');
                var canvas = await html2canvas(container, {
                    backgroundColor: '#000',
                    logging: false,
                    useCORS: true,
                    allowTaint: true
                });
                if (fmt === 'png') {
                    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
                    if (blob && typeof downloadBlob === 'function') {
                        downloadBlob(blob, 'feixun_scene_' + (i + 1) + '.png');
                    }
                    await sleep(250); // 逐帧下载间隔
                } else if (gif) {
                    gif.addFrame(canvas, { delay: 1500, copy: true });
                }
            }
            if (gif) {
                setExportProgressText('正在合成 GIF，请稍候…');
                var blob2 = await new Promise(function (resolve, reject) {
                    gif.on('finished', resolve);
                    gif.on('abort', reject);
                    gif.render();
                });
                if (blob2 && typeof downloadBlob === 'function') downloadBlob(blob2, 'feixun_storyboard.gif');
            }
        } catch (e) {
            failed++;
            console.error('飞讯导出失败', e);
        } finally {
            // 恢复导出前的实时聊天状态
            F.contacts = liveContacts;
            F.currentContactIndex = liveCi;
            F.currentDialogueIndex = liveDi;
            F.renderContacts();
            F.renderMessages();
            F.updateChatTitle();
            F.persist();
            hideProgress();
        }
        showToast(failed ? '导出过程中出现错误，请重试。' : '导出完成！', 'success');
    }

    // 轻量进度提示（复用站点导出进度弹窗；不可用时静默降级）
    function showProgress(title) {
        var m = document.getElementById('export-progress-modal');
        var t = document.getElementById('export-progress-title');
        if (m) m.style.display = 'flex';
        if (t) t.textContent = title || '导出中';
        setExportProgressText('准备中…');
    }
    function setExportProgressText(txt) {
        var p = document.getElementById('export-progress-text');
        if (p) p.textContent = txt;
    }
    function hideProgress() {
        var m = document.getElementById('export-progress-modal');
        if (m) m.style.display = 'none';
    }

    // ==================== 入口 ====================

    function init() {
        if (typeof state === 'undefined') return;
        if (!window.MingMode) return; // 鸣潮模块未加载时不启用

        buildMingModal();
        buildFeixunStoryboard();

        var openBtn = document.getElementById('script-open-btn');
        if (openBtn && !openBtn.dataset.mingHooked) {
            openBtn.dataset.mingHooked = '1';
            // 捕获阶段接管：鸣潮模式下阻止战双弹窗打开，改开鸣潮弹窗
            openBtn.addEventListener('click', function (e) {
                if (!document.body.classList.contains('ming-active')) return; // 战双：不拦截
                e.stopImmediatePropagation();
                e.preventDefault();
                openMingModal();
            }, true);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
