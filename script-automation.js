/* ============================================================
   script-automation.js — 剧本自动化（仅战双模式）
   · 入口：左侧面板「🎬 剧本模式（实验）」按钮
   · 语法：画面以 "下一幕" 分隔；画面内多行/多段「角色: 台词」；
     指令用引号包裹（英文 " 与中文 “” 均可）
   · 背景与立绘带「继承」：某幕没写指令时沿用上一次的值；运行起点=编辑区当前画面
   · 多立绘同框：同一行写多个「使用角色立绘N」即同框；跨行则后一行覆盖前一行
   · 清除：「不使用立绘」/「不使用背景」（含别名），清除后后续幕沿用「无」
   · 角色名：冒号前的文字只写入「角色名称」框，台词框仅放台词本身
   · 运行：停止按钮 + 三档速度（观察300/快速50/瞬时0ms）
   · 结束：先弹「分镜编辑」窗口；剧本「导出」指令作为预设格式，
     在分镜窗口点「全部导出」时生效
   依赖（均由 script.js 提供的全局）：state / cloneStateWithCurrentInput /
   addDialog / createScene / updatePreview / updateDialogDisplay /
   updateFormattedOverlay / adjustCharacterNamePosition / renderBackgroundList /
   toggleCharacterSelection / renderSceneToContainer / exportSelectedScenes / sleep
   ============================================================ */
(function () {
    'use strict';

    var run = {
        running: false,
        abort: false,
        speed: 300,          // 观察档
        exportPreset: null,  // 'png' | 'gif' | 'mp4' | null(按网站当前逻辑)
        startCount: 0,
        lastAdded: 0         // 上一次运行剧本实际新增的帧数（「查看当前已有分镜」的判据）
    };

    // ==================== 解析器 ====================

    // 引号指令：英文直引号或中文引号包裹
    var RE_QUOTED = /"([^"]*)"|\u201c([^\u201d]*)\u201d/g;
    var SEP = '\u0001'; // 指令占位符，防止指令内容里的冒号干扰角色切分

    function cleanText(s) {
        return s.replace(new RegExp(SEP, 'g'), ' ').replace(/\s+/g, ' ').trim();
    }

    // 把一行切成若干「角色: 内容」段（按 name: 切分，与确认的设计一致）
    function splitSegments(rest) {
        var segs = [];
        var re = /([^\s:：\u0001]+)\s*[:：]/g;
        var matches = [];
        var m;
        re.lastIndex = 0;
        while ((m = re.exec(rest)) !== null) {
            matches.push({ name: m[1], start: m.index, contentStart: re.lastIndex });
        }
        // 纯数字「名」视为普通文本（如时间 12:30、比例 3:4），不作为角色切分点
        var valid = matches.filter(function (x) { return !/^\d+$/.test(x.name); });
        for (var i = 0; i < valid.length; i++) {
            var end = (i + 1 < valid.length) ? valid[i + 1].start : rest.length;
            var content = cleanText(rest.substring(valid[i].contentStart, end));
            if (content) segs.push({ name: valid[i].name.trim(), text: content });
        }
        return segs;
    }

    function parseCommand(raw, warnings, lineNo) {
        var c = (raw || '').trim();
        var m;
        if (c === '下一幕') return { op: 'nextScene' };
        if (c === '下一句') return { op: 'nextDialog' };
        if ((m = c.match(/^使用背景\s*(\d+)$/))) return { op: 'bg', n: parseInt(m[1], 10) };
        if ((m = c.match(/^使用(?:角色)?立绘\s*(\d+)$/))) return { op: 'char', n: parseInt(m[1], 10) };
        if ((m = c.match(/^延迟\s*(\d+)$/))) return { op: 'delay', ms: Math.min(parseInt(m[1], 10), 10000) };
        if (c === '延迟') return { op: 'delay', ms: 300 };
        if (c === '不使用背景' || c === '清除背景' || c === '无背景' || c === '不使用背景图') return { op: 'nobg' };
        if (c === '不使用立绘' || c === '不使用角色立绘' || c === '清除立绘' ||
            c === '清除角色立绘' || c === '无立绘' || c === '无角色立绘') return { op: 'nochar' };
        if (c === '打开打字机动画') return { op: 'anim', on: true };
        if (c === '关闭打字机动画') return { op: 'anim', on: false };
        if (c === '导出PNG') return { op: 'export', fmt: 'png' };
        if (c === '导出GIF') return { op: 'export', fmt: 'gif' };
        if (c === '导出MP4') return { op: 'export', fmt: 'mp4' };
        if (c === '导出') return { op: 'export', fmt: 'auto' };
        warnings.push('第 ' + lineNo + ' 行：未知指令「' + c + '」，已忽略');
        return null;
    }

    function parseScript(text) {
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
            // 顺序：先应用该行的台词，再执行该行的指令（指令在台词之后生效）
            segs.forEach(function (s) {
                var isCommander = (s.name === '指挥官' || s.name === '漂泊者');
                steps.push({ type: 'dialog', name: s.name, text: s.text, isCommander: isCommander, line: lineNo });
            });
            // 同一行内连续出现的「使用角色立绘N」合并成一条「同框」指令
            // （用 lineSteps 隔离，跨行不会误合并：跨行按「后一行覆盖前一行」处理）
            var lineSteps = [];
            cmds.forEach(function (raw) {
                var cmd = parseCommand(raw, warnings, lineNo);
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

    // ==================== 背景 / 立绘 继承状态 ====================
    // 记录剧本里「最近一次提到」的背景与立绘。「下一幕」不重置，直接带入下一幕，
    // 所以某一幕没写「使用背景 / 使用角色立绘」时，会自动沿用上一次的值。
    var inherit = { bg: null, bgIsVideo: false, chars: [] };

    // 继承起点 = 运行前编辑区当前的背景 / 立绘（用户手动选好的也算「最近一次」）
    function resetInherit() {
        var scene = (typeof state !== 'undefined') ? state.scenes[state.currentSceneIndex] : null;
        inherit.bg = scene ? (scene.background || null) : null;
        inherit.bgIsVideo = scene ? !!scene.backgroundIsVideo : false;
        inherit.chars = scene ? (scene.characters || []).map(function (c) {
            return { name: c.name, url: c.image };
        }) : [];
    }

    // 把继承状态写入当前场景并刷新预览
    function writeInheritToScene() {
        var scene = state.scenes[state.currentSceneIndex];
        if (!scene) return;
        scene.background = inherit.bg;
        scene.backgroundIsVideo = inherit.bgIsVideo;
        scene.characters = inherit.chars.map(function (c, i) {
            return { name: c.name, image: c.url, id: Date.now() + i };
        });
        if (typeof renderBackgroundList === 'function') renderBackgroundList();
        if (typeof updatePreview === 'function') updatePreview();
        if (typeof updateCharacterListSelection === 'function') updateCharacterListSelection();
        if (typeof renderFrameToInputs === 'function') renderFrameToInputs();
    }

    // ==================== 帧累积（同框全显） ====================

    var frame = null;
    function resetFrame() { frame = { lines: [], commander: [] }; }
    function frameHasContent() { return frame && (frame.lines.length > 0 || frame.commander.length > 0); }

    // 把当前画面写入输入区（角色名 / 台词 / 指挥官）
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

        // 冒号前的角色名只写入「角色名称」框；台词框只放台词本身，不加「角色名：」前缀
        var text = frame.lines.map(function (l) { return l.text; }).join('\n');

        nameEl.value = frame.lines.length > 0 ? names[0] : '???';
        if (typeof adjustCharacterNamePosition === 'function') adjustCharacterNamePosition();

        inputEl.value = text;
        // 防止 updatePreview→updateDialogDisplay 在无已存对话时清空正在累积的台词
        state.isTypingUnsaved = text.length > 0;
        if (typeof updateFormattedOverlay === 'function') updateFormattedOverlay();

        // 指挥官文本：写入 state（快照数据源）与输入框，并确保对话框可见
        var cmdText = frame.commander.join('\n');
        scene.commanderText = cmdText;
        var cmdBox = document.getElementById('commander-dialog');
        var cmdInput = document.getElementById('commander-text');
        if (cmdInput) cmdInput.value = cmdText;
        if (cmdText) {
            scene.commanderDialogVisible = true;
            if (cmdBox) cmdBox.style.display = 'flex';
        } else if (!scene.commanderDialogVisible) {
            if (cmdBox) cmdBox.style.display = 'none';
        }
    }

    // ==================== 指令执行 ====================

    function applyBackground(n, log) {
        var list = state.backgrounds || [];
        if (n < 1 || n > list.length) {
            log('使用背景' + n + '：越界（共 ' + list.length + ' 个背景），已跳过', 'warn');
            return;
        }
        var bg = list[n - 1];
        inherit.bg = bg.url;
        inherit.bgIsVideo = !!bg.isVideo;
        writeInheritToScene();
        log('已应用背景 ' + n + '（' + (bg.name || bg.url) + '）');
    }

    // 一行里的多个「使用角色立绘N」同框显示（不再互相覆盖，但会覆盖本行之前的值）
    function applyCharacters(ns, log) {
        var list = state.uploadedCharacters || [];
        var picked = [];
        var bad = [];
        (ns || []).forEach(function (n) {
            if (n < 1 || n > list.length) { bad.push(n); return; }
            var c = list[n - 1];
            // 同一立绘重复指定只算一次
            if (!picked.some(function (p) { return p.url === c.url; })) {
                picked.push({ name: c.name, url: c.url });
            }
        });
        if (bad.length) log('使用角色立绘' + bad.join('/') + '：越界（共 ' + list.length + ' 个角色），已跳过', 'warn');
        if (!picked.length) return;

        inherit.chars = picked;
        writeInheritToScene();
        log('已应用角色立绘 ' + ns.join('+') + '（' + picked.map(function (c) { return c.name; }).join('、') + '）');
    }

    function clearBackground(log) {
        inherit.bg = null;
        inherit.bgIsVideo = false;
        writeInheritToScene();
        log('已清除背景（后续幕沿用「无背景」）');
    }

    function clearCharacters(log) {
        inherit.chars = [];
        writeInheritToScene();
        log('已清除角色立绘（后续幕沿用「无立绘」）');
    }

    function setTypewriter(on, log) {
        state.animationEnabled = on;
        var l = document.getElementById('animation-toggle-left');
        var r = document.getElementById('animation-toggle-right');
        if (l) l.checked = on;
        if (r) r.checked = on;
        log('已' + (on ? '打开' : '关闭') + '打字机动画');
    }

    // 下一幕：真实点击左侧按钮（与手动操作完全一致）
    function commitFrameViaButton() {
        var btn = document.getElementById('next-scene-left');
        if (btn) btn.click();
        resetFrame();
        state.isTypingUnsaved = false;
        // 新场景的背景/立绘被 createScene 重置了，这里把「最近一次提到」的重新写回（继承）
        writeInheritToScene();
    }

    // 剧本结尾的自动提交：不再新建空场景
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

    // ==================== 运行引擎 ====================

    function describeStep(st) {
        if (st.type === 'dialog') {
            return (st.isCommander ? '[指挥官] ' : st.name + '\uff1a') + st.text.slice(0, 18);
        }
        return '指令「' + st.raw + '」';
    }

    async function runScript() {
        if (run.running) return;
        if (typeof state === 'undefined' || typeof cloneStateWithCurrentInput !== 'function') {
            showToast('网站核心脚本未加载完成，请刷新页面后重试。', 'success');
            return;
        }
        if (document.body.classList.contains('ming-active')) {
            showToast('剧本自动化当前仅支持战双模式，请先切换到战双模式。', 'warn');
            return;
        }
        var input = document.getElementById('script-input');
        var text = input ? input.value : '';
        if (!text.trim()) { showToast('请先粘贴或输入剧本文本。', 'warn'); return; }

        var parsed = parseScript(text);
        if (parsed.steps.length === 0) {
            showToast('没有解析到任何台词或指令。\n' + (parsed.warnings.slice(0, 3).join('\n') || ''), 'warn');
            return;
        }

        run.running = true;
        run.abort = false;
        run.exportPreset = null;
        run.startCount = state.savedScenes.length;
        setRunningUI(true);
        clearLog();
        log('解析完成：共 ' + parsed.steps.length + ' 个步骤' +
            (parsed.warnings.length ? '，' + parsed.warnings.length + ' 条警告' : ''));
        parsed.warnings.forEach(function (w) { log(w, 'warn'); });
        log('运行开始（速度：' + speedName(run.speed) + '，从当前状态接着跑）');

        // 运行前确保至少有一个场景
        if (state.scenes.length === 0 && typeof createScene === 'function') createScene();
        resetFrame();
        resetInherit(); // 继承起点 = 运行前编辑区当前的背景 / 立绘

        try {
            for (var i = 0; i < parsed.steps.length; i++) {
                if (run.abort) { log('已停止：第 ' + (i + 1) + ' 步前中断', 'warn'); break; }
                var st = parsed.steps[i];
                setProgress(i, parsed.steps.length, describeStep(st));
                var stepDelay = run.speed;
                try {
                    if (st.type === 'dialog') {
                        if (st.isCommander) frame.commander.push(st.text);
                        else frame.lines.push({ name: st.name, text: st.text });
                        renderFrameToInputs();
                        log((st.isCommander ? '指挥官：' : st.name + '\uff1a') + st.text.slice(0, 22));
                    } else {
                        var cmd = st.cmd;
                        if (cmd.op === 'nextScene') {
                            commitFrameViaButton();
                            log('下一幕 → 画面已提交暂存（第 ' + state.savedScenes.length + ' 帧）');
                        } else if (cmd.op === 'nextDialog') {
                            log('下一句（画面内分隔，同框全显）');
                        } else if (cmd.op === 'bg') {
                            applyBackground(cmd.n, log);
                        } else if (cmd.op === 'char') {
                            applyCharacters(cmd.ns || [cmd.n], log);
                        } else if (cmd.op === 'nobg') {
                            clearBackground(log);
                        } else if (cmd.op === 'nochar') {
                            clearCharacters(log);
                        } else if (cmd.op === 'delay') {
                            log('延迟 ' + cmd.ms + 'ms');
                            stepDelay = cmd.ms; // 本步覆盖常规速度
                        } else if (cmd.op === 'anim') {
                            setTypewriter(cmd.on, log);
                        } else if (cmd.op === 'export') {
                            if (cmd.fmt === 'gif' && !state.animationEnabled) {
                                // GIF 依赖打字机动画：未开启时点「全部导出」将无法导出，此处先提醒
                                log('打字机动画未开启，无法导出GIF：请先打开打字机动画（可在「动画设置」中开启，或使用「打开打字机动画」指令）', 'warn');
                                showToast('打字机动画未开启，无法导出GIF。请先打开打字机动画后再全部导出。', 'warn');
                            }
                            run.exportPreset = cmd.fmt;
                            log('导出预设：' + (cmd.fmt === 'auto' ? '自动（开打字机动画→GIF，否则→PNG）' : cmd.fmt.toUpperCase()));
                        }
                    }
                } catch (e) {
                    log('第 ' + st.line + ' 行执行出错：' + (e && e.message ? e.message : e), 'err');
                }
                // 每步都让出 UI 线程（瞬时档 sleep(0) 也经由 setTimeout 让出，保证「停止」可响应）
                await sleep(Math.max(stepDelay, 0));
            }

            // 剧本结束：自动提交未提交的画面
            setProgress(parsed.steps.length, parsed.steps.length, '提交结尾画面');
            if (commitFrameFinal()) log('结尾画面已自动提交');
            var added = state.savedScenes.length - run.startCount;
            run.lastAdded = added;
            if (added > 0) log('运行完成：新增 ' + added + ' 帧，共 ' + state.savedScenes.length + ' 帧', 'ok');
            else log('运行结束：没有新增画面', 'warn');
            setProgress(100, 100, '完成');
        } finally {
            run.running = false;
            setRunningUI(false);
        }

        // 先弹分镜编辑，确认后再导出（已确认的顺序）
        openStoryboard(run.startCount, run.exportPreset);
    }

    function speedName(ms) {
        return ms >= 300 ? '观察' : (ms > 0 ? '快速' : '瞬时');
    }

    // ==================== 剧本弹窗 UI ====================

    // 剧本示例：语法帮助代码块 / 输入框占位提示 / 「填入示例」三处共用
    var EXAMPLE_SCRIPT =
        '阿尔法: 你好，指挥官。"使用背景1""使用角色立绘2"\n' +
        '指挥官: 收到，准备出发。"下一幕"\n' +
        '罗塞塔: 这一仗交给我。"使用角色立绘1""延迟500""下一幕"\n' +
        '阿尔法: 战斗开始！"使用背景3""使用角色立绘2""导出"';

    // 转义为 textarea placeholder 可用的形式（&quot; + &#10; 换行）
    function examplePlaceholder() {
        return EXAMPLE_SCRIPT
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/\n/g, '&#10;');
    }

    function buildScriptModal() {
        var modal = document.getElementById('script-modal');
        if (!modal || modal.dataset.built) return;
        modal.dataset.built = '1';

        var box = document.createElement('div');
        box.className = 'script-box';
        box.innerHTML =
            '<div class="script-header">' +
            '  <h3>🎬 剧本模式（实验）</h3>' +
            '  <button class="script-close" title="关闭">×</button>' +
            '</div>' +
            '<div class="script-body">' +
            '  <div class="script-intro">粘贴剧本文本，网站自动完成：写台词 → 应用背景/立绘 → 翻页，结束后弹出「分镜编辑」窗口批量修改与导出。仅战双模式。</div>' +
            '  <button class="syntax-toggle">▸ 语法帮助（指令一览）</button>' +
            '  <div class="syntax-help">' +
            '    <p>· 画面以 <code>"下一幕"</code> 分隔；两个下一幕之间为一个画面，画面内可写多行 <code>角色名: 台词</code>（含 <code>指挥官: 台词</code>）。</p>' +
            '    <p>· 指令用引号包裹（英文 " 或中文 “” 都行），写在台词后面即可；一行多段 <code>角色: 内容</code> 也可。</p>' +
            '    <p>· <b>继承</b>：某一幕没写「使用背景 / 使用角色立绘」时，自动沿用上一次的背景 / 立绘；运行起点为编辑区当前画面。</p>' +
            '    <table>' +
            '      <tr><th>指令</th><th>作用</th></tr>' +
            '      <tr><td>"下一幕"</td><td>提交当前画面，新建场景</td></tr>' +
            '      <tr><td>"下一句"</td><td>画面内分隔标记（同框全显）</td></tr>' +
            '      <tr><td>"使用背景N"</td><td>应用第 N 个背景（从 1 开始，覆盖上次的）</td></tr>' +
            '      <tr><td>"使用角色立绘N"</td><td>应用第 N 个立绘（覆盖上次）</td></tr>' +
            '      <tr><td>"使用角色立绘1""使用角色立绘2"</td><td><b>同一行写多个 → 两个立绘同框</b>（最多 3 个，位置自动排开）</td></tr>' +
            '      <tr><td>"不使用立绘" / "不使用背景"</td><td>清除立绘 / 背景，后续幕沿用「无」</td></tr>' +
            '      <tr><td>"延迟N"</td><td>本步后暂停 N 毫秒</td></tr>' +
            '      <tr><td>"打开/关闭打字机动画"</td><td>切换打字机动画</td></tr>' +
            '      <tr><td>"导出" / "导出PNG" / "导出GIF" / "导出MP4"</td><td>预设导出格式（分镜窗口中生效）</td></tr>' +
            '    </table>' +
            '    <p>示例：</p>' +
            '    <div class="help-codeblock" style="margin:6px 0"></div>' +
            '  </div>' +
            '  <textarea id="script-input" placeholder="在此粘贴剧本…&#10;&#10;' + examplePlaceholder() + '" spellcheck="false"></textarea>' +
            '  <div class="script-controls">' +
            '    <button id="script-run-btn" class="btn btn-success">▶ 运行</button>' +
            '    <button id="script-stop-btn" class="btn btn-danger">■ 停止</button>' +
            '    <button id="script-example-btn" class="btn btn-secondary">填入示例</button>' +
            '    <button id="script-clear-btn" class="btn btn-gray">清空</button>' +
            '    <button id="script-view-sb-btn" class="btn btn-primary" title="打开分镜编辑页面，查看本剧本已生成的分镜画面">🎞 查看当前已有分镜</button>' +
            '    <div class="speed-switch" title="运行速度">' +
            '      <button data-speed="300" class="active">观察</button>' +
            '      <button data-speed="50">快速</button>' +
            '      <button data-speed="0">瞬时</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="script-progress">' +
            '    <div class="script-progress-bar-outer"><div class="script-progress-bar-fill"></div></div>' +
            '    <div class="script-progress-text">准备中…</div>' +
            '  </div>' +
            '  <div class="script-log"></div>' +
            '</div>';

        modal.appendChild(box);

        // 语法帮助里的示例代码块（用 textContent 写入，保证 \n 原样换行）
        var codeBlock = box.querySelector('.help-codeblock');
        if (codeBlock) codeBlock.textContent = EXAMPLE_SCRIPT;

        var closeBtn = box.querySelector('.script-close');
        closeBtn.addEventListener('click', function () { tryClose(modal); });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) tryClose(modal);
        });

        var synToggle = box.querySelector('.syntax-toggle');
        var synHelp = box.querySelector('.syntax-help');
        synToggle.addEventListener('click', function () {
            var open = synHelp.classList.toggle('open');
            synToggle.textContent = (open ? '▾ ' : '▸ ') + '语法帮助（指令一览）';
        });

        box.querySelector('#script-run-btn').addEventListener('click', runScript);
        box.querySelector('#script-stop-btn').addEventListener('click', function () {
            if (!run.running) return;
            run.abort = true;
            this.disabled = true;
            this.textContent = '正在停止…';
            log('停止请求已发送，等待当前步骤完成…', 'warn');
        });
        box.querySelector('#script-example-btn').addEventListener('click', function () {
            document.getElementById('script-input').value = EXAMPLE_SCRIPT;
        });
        box.querySelector('#script-clear-btn').addEventListener('click', function () {
            document.getElementById('script-input').value = '';
        });
        box.querySelector('#script-view-sb-btn').addEventListener('click', viewExistingStoryboard);

        box.querySelectorAll('.speed-switch button').forEach(function (b) {
            b.addEventListener('click', function () {
                box.querySelectorAll('.speed-switch button').forEach(function (x) { x.classList.remove('active'); });
                b.classList.add('active');
                run.speed = parseInt(b.dataset.speed, 10);
            });
        });
    }

    function tryClose(modal) {
        if (run.running) {
            if (!confirm('剧本正在运行中，关闭窗口后可从「剧本模式（实验）」重新打开查看进度。确定关闭？')) return;
        }
        modal.style.display = 'none';
    }

    function setRunningUI(on) {
        var modal = document.getElementById('script-modal');
        if (!modal) return;
        var runBtn = modal.querySelector('#script-run-btn');
        var stopBtn = modal.querySelector('#script-stop-btn');
        var clearBtn = modal.querySelector('#script-clear-btn');
        var exBtn = modal.querySelector('#script-example-btn');
        var viewSbBtn = modal.querySelector('#script-view-sb-btn');
        var prog = modal.querySelector('.script-progress');
        var logBox = modal.querySelector('.script-log');
        if (runBtn) { runBtn.disabled = on; runBtn.textContent = on ? '运行中…' : '▶ 运行'; }
        if (clearBtn) clearBtn.disabled = on;
        if (exBtn) exBtn.disabled = on;
        if (viewSbBtn) viewSbBtn.disabled = on;
        if (stopBtn) {
            stopBtn.style.display = on ? 'inline-block' : 'none';
            stopBtn.disabled = false;
            stopBtn.textContent = '■ 停止';
        }
        if (prog) prog.classList.toggle('active', on);
        if (logBox) logBox.classList.add('active');
    }

    function setProgress(done, total, desc) {
        var modal = document.getElementById('script-modal');
        if (!modal) return;
        var fill = modal.querySelector('.script-progress-bar-fill');
        var txt = modal.querySelector('.script-progress-text');
        var pct = total > 0 ? Math.round(done / total * 100) : 0;
        if (fill) fill.style.width = pct + '%';
        if (txt) txt.textContent = '第 ' + Math.min(done + 1, total) + '/' + total + ' 步（' + pct + '%）：' + desc;
    }

    function clearLog() {
        var box = document.querySelector('#script-modal .script-log');
        if (box) box.innerHTML = '';
    }

    function log(msg, level) {
        var box = document.querySelector('#script-modal .script-log');
        if (!box) return;
        var line = document.createElement('div');
        if (level) line.className = 'log-' + level;
        line.textContent = '[' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '] ' + msg;
        box.appendChild(line);
        box.scrollTop = box.scrollHeight;
        while (box.children.length > 300) box.removeChild(box.firstChild);
    }

    // ==================== 分镜编辑弹窗 ====================

    var sb = { startCount: 0, sel: 0, preset: null };

    function frameScene(snap) {
        if (!snap || !snap.scenes || !snap.scenes.length) return null;
        var idx = snap.currentSceneIndex || 0;
        if (idx >= snap.scenes.length) idx = snap.scenes.length - 1;
        return snap.scenes[idx];
    }

    function frameDialogText(scene) {
        if (!scene || !scene.dialogs || !scene.dialogs.length) return '';
        var i = Math.min(scene.currentDialogIndex || 0, scene.dialogs.length - 1);
        return scene.dialogs[i] || {};
    }

    function openStoryboard(startCount, preset) {
        if (typeof state === 'undefined') return;
        var modal = document.getElementById('storyboard-modal');
        if (!modal) return;
        if (!state.savedScenes.length) {
            showToast('当前没有已暂存的画面。', 'warn');
            return;
        }
        sb.startCount = startCount || 0;
        sb.preset = preset || null;
        sb.sel = Math.max(0, state.savedScenes.length - 1);
        modal.style.display = 'flex';
        renderStoryboard();
    }

    function renderStoryboard() {
        var modal = document.getElementById('storyboard-modal');
        if (!modal) return;
        var list = modal.querySelector('.sb-list');
        var info = modal.querySelector('.sb-header-info');
        if (info) {
            var fmtName = { png: 'PNG 图片', gif: 'GIF 动画', mp4: 'MP4 视频' };
            var presetTxt = sb.preset
                ? (sb.preset === 'auto' ? '自动（开动画→GIF，否则→PNG）' : fmtName[sb.preset])
                : '网站当前逻辑（开动画→GIF，否则→PNG）';
            info.textContent = '共 ' + state.savedScenes.length + ' 帧（本剧本新增 ' +
                Math.max(0, state.savedScenes.length - sb.startCount) + ' 帧）· 导出格式：' + presetTxt;
        }
        list.innerHTML = '';
        state.savedScenes.forEach(function (snap, i) {
            var scene = frameScene(snap) || {};
            var d = frameDialogText(scene);
            var excerpt = (d.text || scene.commanderText || '（无台词）').replace(/\n/g, ' ').slice(0, 26);

            var item = document.createElement('div');
            item.className = 'sb-item' + (i === sb.sel ? ' active' : '');
            item.innerHTML =
                '<div class="sb-thumb"></div>' +
                '<div class="sb-item-info">' +
                '  <div class="sb-item-title">第 ' + (i + 1) + ' 帧' +
                (i >= sb.startCount && sb.startCount > 0 ? '<span class="sb-item-badge">本剧本</span>' : '') +
                '  </div>' +
                '  <div class="sb-item-text"></div>' +
                '</div>';
            item.querySelector('.sb-item-text').textContent = excerpt;
            item.addEventListener('click', function () {
                sb.sel = i;
                renderStoryboard();
            });
            list.appendChild(item);
        });
        renderEditor();
        renderThumbs(list);
    }

    // 缩略图：直接渲染到可见 DOM（不用 html2canvas，避免黑图且更省资源）
    function renderThumbs(list) {
        if (typeof renderSceneToContainer !== 'function') return;
        var nodes = list.querySelectorAll('.sb-item .sb-thumb');
        state.savedScenes.forEach(function (snap, i) {
            var scene = frameScene(snap);
            if (scene && nodes[i]) {
                // 内联关键样式做防御：即使样式表未加载，场景图层也被限制在缩略图框内
                nodes[i].style.position = 'relative';
                nodes[i].style.width = '108px';
                nodes[i].style.height = '61px';
                nodes[i].style.overflow = 'hidden';
                nodes[i].style.flexShrink = '0';
                nodes[i].style.borderRadius = '5px';
                nodes[i].style.background = '#000';
                Promise.resolve(renderSceneToContainer(scene, nodes[i], 108, 61))
                    .catch(function () { /* 缩略图失败不影响使用 */ });
            }
        });
    }

    function renderEditor() {
        var modal = document.getElementById('storyboard-modal');
        if (!modal) return;
        var editor = modal.querySelector('.sb-editor');
        var snap = state.savedScenes[sb.sel];
        if (!snap) {
            editor.innerHTML = '<div class="sb-empty">没有可显示的帧</div>';
            return;
        }
        var scene = frameScene(snap) || {};
        var d = frameDialogText(scene);

        var bgOptions = '<option value="">（无背景）</option>' +
            (state.backgrounds || []).map(function (bg, i) {
                var sel = scene.background === bg.url ? ' selected' : '';
                return '<option value="' + bg.url + '"' + sel + '>' + (i + 1) + '. ' + (bg.name || bg.url) + '</option>';
            }).join('');

        var charChecks = (state.uploadedCharacters || []).map(function (c, i) {
            var checked = (scene.characters || []).some(function (x) { return x.image === c.url; });
            var safeName = String(c.name || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            return '<span class="sb-char-check' + (checked ? ' checked' : '') + '" data-url="' + c.url + '" data-name="' + safeName + '">' +
                '<input type="checkbox"' + (checked ? ' checked' : '') + '><img src="' + c.url + '" alt="">' + safeName + '</span>';
        }).join('') || '<span style="color:#8888a5;font-size:12px">角色列表为空</span>';

        editor.innerHTML =
            '<div class="sb-field"><label>角色名称</label>' +
            '<input type="text" class="sb-name" value=""></div>' +
            '<div class="sb-field"><label>台词（画面文案，多行即多句）</label>' +
            '<textarea class="sb-text"></textarea></div>' +
            '<div class="sb-field"><label>指挥官文本</label>' +
            '<textarea class="sb-cmd" style="min-height:64px"></textarea></div>' +
            '<div class="sb-field"><label>背景</label>' +
            '<select class="sb-bg">' + bgOptions + '</select></div>' +
            '<div class="sb-field"><label>角色立绘（点击勾选，可多选）</label>' +
            '<div class="sb-chars">' + charChecks + '</div></div>' +
            '<div class="sb-editor-btns">' +
            '  <button class="btn btn-secondary sb-prev">◀ 上一帧</button>' +
            '  <button class="btn btn-secondary sb-next">下一帧 ▶</button>' +
            '  <button class="btn btn-warning sb-view-in-editor" title="把当前帧载入主编辑区，在编辑区查看画面效果">🖼 编辑区查看效果</button>' +
            '  <button class="btn btn-success sb-save">保存修改</button>' +
            '  <button class="btn btn-danger sb-del">删除此帧</button>' +
            '  <button class="btn btn-primary sb-export-btn">全部导出</button>' +
            '  <button class="btn btn-success sb-merge-export-btn" title="将全部暂存画面按顺序整合成一个MP4视频导出">整合导出</button>' +
            '</div>' +
            '<div class="sb-hint">「保存修改」写回该帧暂存数据（左侧缩略图随之刷新）；「编辑区查看效果」把该帧载入主编辑区看大图效果，此时左侧面板会出现「↩ 返回分镜编辑」，点它回到本窗口（编辑区里的改动会自动写回该帧）；「全部导出」按上方显示的格式导出全部暂存画面（每个画面一个文件）；「整合导出」将全部暂存画面按顺序整合成一个MP4视频导出。</div>';

        editor.querySelector('.sb-name').value = d.character || '';
        editor.querySelector('.sb-text').value = d.text || '';
        editor.querySelector('.sb-cmd').value = scene.commanderText || '';

        // 立绘勾选交互
        editor.querySelectorAll('.sb-char-check').forEach(function (chip) {
            chip.addEventListener('click', function (e) {
                e.preventDefault();
                var cb = chip.querySelector('input');
                cb.checked = !cb.checked;
                chip.classList.toggle('checked', cb.checked);
            });
        });

        editor.querySelector('.sb-prev').addEventListener('click', function () {
            if (sb.sel > 0) { sb.sel--; renderStoryboard(); }
        });
        editor.querySelector('.sb-next').addEventListener('click', function () {
            if (sb.sel < state.savedScenes.length - 1) { sb.sel++; renderStoryboard(); }
        });
        editor.querySelector('.sb-view-in-editor').addEventListener('click', viewFrameInEditor);
        editor.querySelector('.sb-save').addEventListener('click', function () { saveCurrentFrame(false); });
        editor.querySelector('.sb-del').addEventListener('click', deleteCurrentFrame);
        editor.querySelector('.sb-export-btn').addEventListener('click', exportAllFromStoryboard);
        editor.querySelector('.sb-merge-export-btn').addEventListener('click', exportMergedFromStoryboard);
    }

    // silent=true：静默写回（不弹「已保存」、不重绘列表），用于切到编辑区前的兜底保存
    function saveCurrentFrame(silent) {
        var modal = document.getElementById('storyboard-modal');
        if (!modal) return;
        var editor = modal.querySelector('.sb-editor');
        var snap = state.savedScenes[sb.sel];
        if (!snap || !editor) return;
        var scene = frameScene(snap);
        if (!scene) return;

        var name = editor.querySelector('.sb-name').value.trim();
        var text = editor.querySelector('.sb-text').value;
        var cmdText = editor.querySelector('.sb-cmd').value;
        var bgUrl = editor.querySelector('.sb-bg').value;

        // 台词写回
        if (scene.dialogs && scene.dialogs.length > 0) {
            var i = Math.min(scene.currentDialogIndex || 0, scene.dialogs.length - 1);
            scene.dialogs[i].character = name || '???';
            scene.dialogs[i].text = text;
        } else if (text.trim()) {
            scene.dialogs = scene.dialogs || [];
            scene.dialogs.push({ character: name || '???', text: text, formatRuns: [] });
            scene.currentDialogIndex = scene.dialogs.length - 1;
        }
        scene.commanderText = cmdText;
        if (cmdText) scene.commanderDialogVisible = true;

        // 背景写回
        if (!bgUrl) {
            scene.background = null;
            scene.backgroundIsVideo = false;
        } else {
            var bg = (state.backgrounds || []).find(function (b) { return b.url === bgUrl; });
            scene.background = bgUrl;
            scene.backgroundIsVideo = !!(bg && bg.isVideo);
        }

        // 立绘写回
        var checked = [];
        editor.querySelectorAll('.sb-char-check.checked').forEach(function (chip) {
            checked.push({ name: chip.dataset.name, image: chip.dataset.url, id: Date.now() + checked.length });
        });
        scene.characters = checked;

        if (!silent) {
            var btn = editor.querySelector('.sb-save');
            btn.textContent = '✓ 已保存';
            setTimeout(function () { btn.textContent = '保存修改'; }, 1200);
            renderStoryboard();
        }
    }

    function deleteCurrentFrame() {
        if (!confirm('确定删除第 ' + (sb.sel + 1) + ' 帧吗？')) return;
        state.savedScenes.splice(sb.sel, 1);
        if (typeof updateSceneCount === 'function') updateSceneCount();
        if (!state.savedScenes.length) {
            document.getElementById('storyboard-modal').style.display = 'none';
            showToast('已删除全部帧。', 'warn');
            return;
        }
        if (sb.sel >= state.savedScenes.length) sb.sel = state.savedScenes.length - 1;
        renderStoryboard();
    }

    function exportAllFromStoryboard() {
        if (typeof exportSelectedScenes !== 'function') {
            showToast('导出模块未加载，请刷新页面后重试。', 'warn');
            return;
        }
        if (!state.savedScenes.length) {
            showToast('没有可导出的画面。', 'warn');
            return;
        }
        var fmt = sb.preset && sb.preset !== 'auto' ? sb.preset
            : (state.animationEnabled ? 'gif' : 'png');
        // GIF 依赖打字机动画：未开启时无法导出，给出提醒（不影响 PNG / MP4 导出）
        if (fmt === 'gif' && !state.animationEnabled) {
            showToast('无法导出GIF：打字机动画未开启。请先在「动画设置」中打开打字机动画（或使用「打开打字机动画」指令）后重试。', 'error');
            return;
        }
        document.getElementById('storyboard-modal').style.display = 'none';
        Promise.resolve()
            .then(function () { return exportSelectedScenes(state.savedScenes.slice(), fmt); })
            .catch(function (e) { showToast('导出失败：' + (e && e.message ? e.message : e), 'error'); });
    }

    // 整合导出：把全部暂存画面按顺序整合成一个 MP4 视频（由 script.js 的 exportMergedMp4FromScenes 实现）
    function exportMergedFromStoryboard() {
        if (typeof exportMergedMp4FromScenes !== 'function') {
            showToast('整合导出模块未加载，请刷新页面后重试。', 'warn');
            return;
        }
        if (!state.savedScenes.length) {
            showToast('没有可导出的画面。', 'warn');
            return;
        }
        document.getElementById('storyboard-modal').style.display = 'none';
        Promise.resolve()
            .then(function () { return exportMergedMp4FromScenes(state.savedScenes.slice()); })
            .catch(function (e) { showToast('整合导出失败：' + (e && e.message ? e.message : e), 'error'); });
    }

    // ==================== 编辑区查看效果 ↔ 返回分镜编辑 ====================

    // 是否已从分镜跳到编辑区查看；frameIndex 记住看的是哪一帧
    var view = { active: false, frameIndex: 0 };

    function sbModalEl() { return document.getElementById('storyboard-modal'); }

    function setBackButton(on) {
        var btn = document.getElementById('sb-back-btn');
        if (btn) btn.style.display = on ? 'inline-block' : 'none';
    }

    // 编辑区当前是否有「未暂存」的画面内容（载入分镜帧会被覆盖）
    function editorHasContent() {
        if (typeof state === 'undefined') return false;
        var scene = state.scenes && state.scenes[state.currentSceneIndex];
        if (!scene) return false;
        var dialogEl = document.getElementById('dialog-input');
        var cmdEl = document.getElementById('commander-text');
        var hasText = (dialogEl && dialogEl.value.trim()) || (cmdEl && cmdEl.value.trim());
        return !!(scene.background || (scene.characters || []).length || hasText);
    }

    // 点「🖼 编辑区查看效果」：把选中帧载入主编辑区，分镜窗口让位
    function viewFrameInEditor() {
        if (typeof state === 'undefined' || typeof restoreSnapshotScene !== 'function') {
            showToast('编辑区载入功能未就绪，请刷新页面后重试。', 'warn');
            return;
        }
        if (!state.savedScenes.length) { showToast('没有可查看的帧。', 'warn'); return; }
        if (sb.sel < 0 || sb.sel >= state.savedScenes.length) sb.sel = 0;

        if (editorHasContent()) {
            if (!confirm('编辑区当前有未暂存的画面内容，载入分镜帧会覆盖它。\n确定继续吗？')) return;
        }
        // 兜底：把分镜编辑里已填但未点「保存修改」的改动静默写回该帧
        saveCurrentFrame(true);

        view.active = true;
        view.frameIndex = sb.sel;
        restoreSnapshotScene(sb.sel);
        if (sbModalEl()) sbModalEl().style.display = 'none';
        // 剧本弹窗一并让位：它是全屏遮罩，不隐藏会挡住左侧「↩ 返回分镜编辑」和编辑区
        ['script-modal', 'ming-script-modal'].forEach(function (id) {
            var m = document.getElementById(id);
            if (m && m.style.display !== 'none') m.style.display = 'none';
        });
        setBackButton(true);
        showToast('已在编辑区载入第 ' + (sb.sel + 1) + ' 帧，点左侧「↩ 返回分镜编辑」回到分镜。', 'success');
    }

    // 左侧面板「↩ 返回分镜编辑」：把编辑区当前内容写回该帧，再回到分镜窗口
    function backToStoryboard() {
        setBackButton(false);
        view.active = false;
        if (typeof state === 'undefined') return;

        if (!state.savedScenes.length) {
            showToast('分镜里已经没有帧了。', 'warn');
            return;
        }
        var i = Math.min(Math.max(view.frameIndex, 0), state.savedScenes.length - 1);
        if (typeof cloneStateWithCurrentInput === 'function') {
            var fresh = cloneStateWithCurrentInput();
            var old = state.savedScenes[i];
            // 保留原帧名称，避免「快照 N」被重新编号
            if (old && old.name) fresh.name = old.name;
            state.savedScenes[i] = fresh;
            if (typeof updateSceneCount === 'function') updateSceneCount();
        }
        sb.sel = i;
        var modal = sbModalEl();
        if (modal) {
            modal.style.display = 'flex';
            renderStoryboard();
        }
    }

    // ==================== 剧本模式「查看当前已有分镜」 ====================

    // 严格判定：本次会话跑过剧本模式且确实新增过帧，且分镜里现在还有帧
    function viewExistingStoryboard() {
        if (typeof state === 'undefined') return;
        if (!(run.lastAdded > 0) || !state.savedScenes.length) {
            showNoStoryboardDialog();
            return;
        }
        var modal = sbModalEl();
        if (!modal) return;
        if (sb.sel < 0 || sb.sel >= state.savedScenes.length) {
            sb.sel = state.savedScenes.length - 1;
        }
        modal.style.display = 'flex';
        renderStoryboard();
    }

    // 居中模态弹窗：当前分镜编辑页面中无分镜
    function showNoStoryboardDialog() {
        var modal = document.getElementById('sb-empty-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sb-empty-modal';
            modal.className = 'modal';
            modal.style.display = 'none';
            document.body.appendChild(modal);
        }
        modal.innerHTML =
            '<div class="modal-content" style="max-width:380px;text-align:center;">' +
            '  <h3 style="margin:0 0 12px;font-size:16px;">🎞 分镜编辑</h3>' +
            '  <p style="margin:0 0 18px;font-size:14px;color:#c5c5d8;line-height:1.6;">当前分镜编辑页面中无分镜</p>' +
            '  <button class="btn btn-primary" style="width:auto;padding:7px 26px;margin-bottom:0;">确定</button>' +
            '</div>';
        modal.style.display = 'flex';
        modal.querySelector('button').addEventListener('click', function () {
            modal.style.display = 'none';
        });
        modal.onclick = function (e) {
            if (e.target === modal) modal.style.display = 'none';
        };
    }

    function buildStoryboardModal() {
        var modal = document.getElementById('storyboard-modal');
        if (!modal || modal.dataset.built) return;
        modal.dataset.built = '1';

        var box = document.createElement('div');
        box.className = 'sb-box';
        box.innerHTML =
            '<div class="sb-header">' +
            '  <h3>🎞 分镜编辑</h3><span class="sb-header-info"></span>' +
            '  <button class="sb-close" title="关闭">×</button>' +
            '</div>' +
            '<div class="sb-body">' +
            '  <div class="sb-list"></div>' +
            '  <div class="sb-editor"></div>' +
            '</div>';
        modal.appendChild(box);

        box.querySelector('.sb-close').addEventListener('click', function () {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    // ==================== 入口 ====================

    function init() {
        if (typeof state === 'undefined') return; // 核心未加载时不出入口

        buildScriptModal();
        buildStoryboardModal();

        var openBtn = document.getElementById('script-open-btn');
        var scriptModal = document.getElementById('script-modal');
        if (openBtn && scriptModal) {
            openBtn.addEventListener('click', function () {
                scriptModal.style.display = 'flex';
            });
        }

        // 左侧面板「↩ 返回分镜编辑」（index.html 中位于「🎬 剧本模式（实验）」下方，默认隐藏）
        var backBtn = document.getElementById('sb-back-btn');
        if (backBtn) backBtn.addEventListener('click', backToStoryboard);

        // 提供全局接口：鸣潮剧情模式复用分镜弹窗（openStoryboard）与解析器
        window.__scriptAutomation = { parse: parseScript, runState: run, openStoryboard: openStoryboard };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
