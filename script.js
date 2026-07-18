// ========== 操作日志系统（用于导出排查问题）==========
(function() {
    window.__appLog = [];
    const MAX_LOG = 500;
    const _origError = console.error;
    const _origWarn = console.warn;

    function pushLog(level, msg, extra) {
        var entry = { t: new Date().toLocaleString('zh-CN'), l: level, m: msg };
        if (extra) entry.x = extra;
        window.__appLog.push(entry);
        if (window.__appLog.length > MAX_LOG) window.__appLog.shift();
    }

    console.error = function() {
        var args = Array.prototype.slice.call(arguments);
        _origError.apply(console, args);
        pushLog('ERROR', args.join(' '));
    };
    console.warn = function() {
        var args = Array.prototype.slice.call(arguments);
        _origWarn.apply(console, args);
        pushLog('WARN', args.join(' '));
    };

    // 自动捕获全局未处理错误
    window.addEventListener('error', function(e) {
        pushLog('UNCAUGHT_ERROR', e.message || String(e), { file: e.filename, line: e.lineno, col: e.colno });
    });
    window.addEventListener('unhandledrejection', function(e) {
        pushLog('UNHANDLED_REJECTION', String(e.reason));
    });

    window.logAction = function(action, detail) { pushLog('ACTION', action, detail); };
    window.getAppLog = function() { return window.__appLog.slice(); };
})();

// 深拷贝场景状态（用于历史栈）
	function cloneState() {
return {
    scenes: JSON.parse(JSON.stringify(state.scenes)),
    currentSceneIndex: state.currentSceneIndex
};
	}

// ========== 对话 formatRuns（多段「接下来的」颜色/字号）==========
// 将 hex 颜色统一 normalize：补齐 3 位缩写、去除 alpha 通道 8 位形式，统一小写
function normalizeHexColor(c) {
    if (c == null) return c;
    let s = String(c).trim().toLowerCase();
    if (s[0] === '#') s = s.slice(1);
    // 去除 alpha 通道（#RRGGBBAA → #RRGGBB）
    if (s.length === 8) s = s.slice(0, 6);
    // 补齐 3 位缩写（#RGB → #RRGGBB）
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return '#' + s;
}

function colorsEqual(a, b) {
    if (a == null || b == null) return a === b;
    return normalizeHexColor(a) === normalizeHexColor(b);
}

function nextFormatDiffersFromGlobal() {
    const gc = state.textFormatting.dialog.color;
    const gs = state.textFormatting.dialog.fontSize;
    return !colorsEqual(state.selectionFormatColor, gc) || state.selectionFormatSize !== gs;
}

function runHasEffect(r, globalColor, globalSize) {
    const cDiff = r.color && !colorsEqual(r.color, globalColor);
    const sDiff = r.fontSize && r.fontSize !== globalSize;
    return !!(cDiff || sDiff);
}

/** 全局样式 run 作为分界：终止前一段自定义格式，避免重置为全局后新输入仍继承旧样式 */
function isFormatBoundaryRun(r, prevRun, globalColor, globalSize) {
    if (!prevRun) return false;
    return !runHasEffect(r, globalColor, globalSize) && runHasEffect(prevRun, globalColor, globalSize);
}

/** 合并、约束后过滤 formatRuns：保留有实际效果的 run 以及紧跟在效果 run 之后的全局样式分界 run */
function filterFormatRunsForStorage(runs, textLen, globalColor, globalSize) {
    const merged = mergeAdjacentSameFormatRuns(clampFormatRunsForText(runs || [], textLen));
    return merged.filter((r, i) => {
        if (runHasEffect(r, globalColor, globalSize)) return true;
        if (isFormatBoundaryRun(r, merged[i - 1], globalColor, globalSize)) return true;
        return false;
    });
}

/** 更新「接下来的」格式显示（颜色/大小） */
function updateSelFormatDisplays() {
    const gc = state.textFormatting.dialog.color;
    if (elements.selFormatColorValue) {
        elements.selFormatColorValue.textContent = colorsEqual(state.selectionFormatColor, gc) ? '-' : state.selectionFormatColor;
    }
    if (elements.selFormatSizeValue) {
        elements.selFormatSizeValue.textContent = state.selectionFormatSize + 'px';
    }
}

// 单次编辑在 newText 中对应的区间 [start, end)（与 old 相比有变化的部分）
function getSingleEditRangeInNewText(oldText, newText) {
    if (oldText === newText) return null;
    let i = 0;
    const minl = Math.min(oldText.length, newText.length);
    while (i < minl && oldText[i] === newText[i]) i++;
    let o = oldText.length - 1;
    let z = newText.length - 1;
    while (o >= i && z >= i && oldText[o] === newText[z]) {
        o--;
        z--;
    }
    return { start: i, end: z + 1 };
}

// 每次输入后：若「接下来的」与全局不同，则仅为本次变更区间应用该样式；否则该区段用全局样式。区间外已有 formatRuns 不变。
function applyIncomingTextNextFormat(oldText, newText) {
    if (state.scenes.length === 0) return;
    if (oldText === newText || !newText.length) return;

    const range = getSingleEditRangeInNewText(oldText, newText);
    if (!range || range.end <= range.start) return;

    const gc = state.textFormatting.dialog.color;
    const gs = state.textFormatting.dialog.fontSize;
    const nc = state.selectionFormatColor;
    const ns = state.selectionFormatSize;
    const nextOn = !colorsEqual(nc, gc) || ns !== gs;

    let runs = [...getFormatRunsForOverlay()];
    runs = runs.filter(r => r.start < range.start || r.start >= range.end);
    if (nextOn) {
        runs.push({ start: range.start, color: nc, fontSize: ns });
    } else {
        // 全局样式作为分界 run，切断之前段的样式扩散
        runs.push({ start: range.start, color: gc, fontSize: gs });
    }
    runs = mergeAdjacentSameFormatRuns(clampFormatRunsForText(runs, newText.length));
    syncFormatRunsToStorage(runs);
}

function clampFormatRunsForText(runs, textLen) {
    // 允许 start === textLen：表示从当前文本末尾起（含空输入框时在 0）应用格式，否则无法在空框里保存「接下来的」样式
    return (runs || [])
        .filter(r => r && typeof r.start === 'number' && r.start >= 0 && r.start <= textLen)
        .sort((a, b) => a.start - b.start);
}

function mergeAdjacentSameFormatRuns(runs) {
    const sorted = [...(runs || [])].sort((a, b) => a.start - b.start);
    const out = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        if (last && colorsEqual(last.color, r.color) && last.fontSize === r.fontSize) {
            continue;
        }
        out.push({ start: r.start, color: r.color, fontSize: r.fontSize });
    }
    return out;
}

function adjustFormatRunsAfterTextEdit(oldText, newText, runs) {
    if (!runs || runs.length === 0) return [];
    if (oldText === newText) return clampFormatRunsForText(runs, newText.length);
    if (!newText.length) return [];
    // 从空串开始输入时，旧算法会把 o 置为 -1 误把区间判为「在末尾插入」从而错误地平移 start
    if (!oldText.length) {
        return mergeAdjacentSameFormatRuns(clampFormatRunsForText(runs, newText.length));
    }
    let i = 0;
    while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) i++;
    let o = oldText.length - 1;
    let n = newText.length - 1;
    while (o >= i && n >= i && oldText[o] === newText[n]) {
        o--;
        n--;
    }
    const deltaTotal = newText.length - oldText.length;
    const out = [];
    for (const r of runs) {
        const s = r.start;
        if (s < i) {
            out.push({ ...r, start: s });
        } else if (s > o) {
            out.push({ ...r, start: s + deltaTotal });
        }
    }
    return mergeAdjacentSameFormatRuns(clampFormatRunsForText(out, newText.length));
}

function migrateDialogFormatFields(dialog) {
    if (!dialog) return;
    const gc = state.textFormatting.dialog.color;
    const gs = state.textFormatting.dialog.fontSize;
    if ((!dialog.formatRuns || dialog.formatRuns.length === 0) && dialog.nextFormat && dialog.nextFormat.startIndex !== undefined) {
        const nf = dialog.nextFormat;
        if (runHasEffect(nf, gc, gs)) {
            dialog.formatRuns = [{ start: nf.startIndex, color: nf.color, fontSize: nf.fontSize }];
        } else {
            dialog.formatRuns = [];
        }
    }
    if (!dialog.formatRuns) dialog.formatRuns = [];
    delete dialog.nextFormat;
}

function migrateSceneLegacyPending(scene) {
    if (!scene || !scene.pendingNextFormat) return;
    if (!scene.pendingFormatRuns || scene.pendingFormatRuns.length === 0) {
        const nf = scene.pendingNextFormat;
        const gc = state.textFormatting.dialog.color;
        const gs = state.textFormatting.dialog.fontSize;
        if (nf && nf.startIndex !== undefined && runHasEffect(nf, gc, gs)) {
            scene.pendingFormatRuns = [{ start: nf.startIndex, color: nf.color, fontSize: nf.fontSize }];
        }
    }
    delete scene.pendingNextFormat;
}

function getFormatRunsForOverlay() {
    if (state.scenes.length === 0) return [];
    const currentScene = state.scenes[state.currentSceneIndex];
    migrateSceneLegacyPending(currentScene);
    const hasDialogSlot = currentScene.dialogs.length > 0 &&
        currentScene.currentDialogIndex < currentScene.dialogs.length;
    if (hasDialogSlot) {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex];
        migrateDialogFormatFields(dialog);
        return dialog.formatRuns || [];
    }
    return currentScene.pendingFormatRuns || [];
}

function syncFormatRunsToStorage(runs) {
    const text = elements.dialogInput ? (elements.dialogInput.value || '') : '';
    const textLen = text.length;
    const globalColor = state.textFormatting.dialog.color;
    const globalFontSize = state.textFormatting.dialog.fontSize;
    if (state.scenes.length === 0) return;
    const currentScene = state.scenes[state.currentSceneIndex];
    migrateSceneLegacyPending(currentScene);

    const merged = filterFormatRunsForStorage(runs, textLen, globalColor, globalFontSize);

    const hasDialogSlot = currentScene.dialogs.length > 0 &&
        currentScene.currentDialogIndex < currentScene.dialogs.length;
    if (hasDialogSlot) {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex];
        migrateDialogFormatFields(dialog);
        dialog.formatRuns = merged;
        delete currentScene.pendingFormatRuns;
    } else {
        if (merged.length) {
            currentScene.pendingFormatRuns = merged;
        } else {
            delete currentScene.pendingFormatRuns;
        }
    }
}

function syncFormatRunsOnTextChange(oldText, newText) {
    if (oldText === newText) return;
    if (state.scenes.length === 0) return;
    const currentScene = state.scenes[state.currentSceneIndex];
    migrateSceneLegacyPending(currentScene);
    const hasDialogSlot = currentScene.dialogs.length > 0 &&
        currentScene.currentDialogIndex < currentScene.dialogs.length;
    if (hasDialogSlot) {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex];
        migrateDialogFormatFields(dialog);
        dialog.formatRuns = adjustFormatRunsAfterTextEdit(oldText, newText, dialog.formatRuns || []);
    } else {
        const next = adjustFormatRunsAfterTextEdit(oldText, newText, currentScene.pendingFormatRuns || []);
        if (next.length) {
            currentScene.pendingFormatRuns = next;
        } else {
            delete currentScene.pendingFormatRuns;
        }
    }
}

function getDialogFormatRunsForExport(dialog) {
    if (!dialog) return [];
    migrateDialogFormatFields(dialog);
    return dialog.formatRuns || [];
}

function pushInputAsDialogIfNeeded(currentScene) {
    const inputText = elements.dialogInput.value.trim();
    if (!inputText || (currentScene.dialogs && currentScene.currentDialogIndex < currentScene.dialogs.length)) {
        return;
    }
    const name = elements.characterName.value.trim() || '???';
    migrateSceneLegacyPending(currentScene);
    const raw = elements.dialogInput.value;
    const gc = state.textFormatting.dialog.color;
    const gs = state.textFormatting.dialog.fontSize;
    const runs = mergeAdjacentSameFormatRuns(
        clampFormatRunsForText(currentScene.pendingFormatRuns || [], raw.length)
    ).filter(r => runHasEffect(r, gc, gs));
    currentScene.dialogs.push({
        character: name,
        text: inputText,
        formatRuns: runs
    });
    delete currentScene.pendingFormatRuns;
    currentScene.currentDialogIndex = currentScene.dialogs.length - 1;
}

function migrateAllProjectFormatRuns() {
    const gc = state.textFormatting.dialog.color;
    const gs = state.textFormatting.dialog.fontSize;
    const walkScene = (scene) => {
        if (!scene) return;
        migrateSceneLegacyPending(scene);
        if (scene.dialogs) {
            scene.dialogs.forEach((d) => {
                migrateDialogFormatFields(d);
                if (d.text != null && d.formatRuns) {
                    d.formatRuns = mergeAdjacentSameFormatRuns(
                        clampFormatRunsForText(d.formatRuns, d.text.length)
                    ).filter(r => runHasEffect(r, gc, gs));
                }
            });
        }
    };
    state.scenes.forEach(walkScene);
    (state.savedScenes || []).forEach((snap) => {
        (snap.scenes || []).forEach(walkScene);
    });
}

// 克隆当前状态并包含输入框中的未保存内容（用于下一句前的压栈）
function cloneStateWithCurrentInput() {
    const snapshot = cloneState();
    if (state.scenes.length > 0) {
        const scene = state.scenes[state.currentSceneIndex];
        const snapshotScene = snapshot.scenes[state.currentSceneIndex];
        const characterName = elements.characterName.value.trim() || '???';
        const dialogueText = elements.dialogInput.value.trim();
        const gc = state.textFormatting.dialog.color;
        const gs = state.textFormatting.dialog.fontSize;
        migrateSceneLegacyPending(scene);
        migrateSceneLegacyPending(snapshotScene);

        if (snapshotScene.currentDialogIndex < snapshotScene.dialogs.length) {
            if (dialogueText) {
                const prev = snapshotScene.dialogs[snapshotScene.currentDialogIndex];
                migrateDialogFormatFields(prev);
                const oldText = prev.text || '';
                let formatRuns = adjustFormatRunsAfterTextEdit(oldText, dialogueText, prev.formatRuns || []);
                formatRuns = mergeAdjacentSameFormatRuns(
                    clampFormatRunsForText(formatRuns, dialogueText.length)
                ).filter(r => runHasEffect(r, gc, gs));
                snapshotScene.dialogs[snapshotScene.currentDialogIndex] = {
                    character: characterName,
                    text: dialogueText,
                    formatRuns
                };
            }
        } else if (dialogueText) {
            const pending = scene.pendingFormatRuns
                ? JSON.parse(JSON.stringify(scene.pendingFormatRuns))
                : [];
            const raw = elements.dialogInput.value;
            const formatRuns = mergeAdjacentSameFormatRuns(
                clampFormatRunsForText(pending, raw.length)
            ).filter(r => runHasEffect(r, gc, gs));
            snapshotScene.dialogs.push({
                character: characterName,
                text: dialogueText,
                formatRuns
            });
            snapshotScene.currentDialogIndex = snapshotScene.dialogs.length - 1;
        }
        delete snapshotScene.pendingFormatRuns;
        delete snapshotScene.pendingNextFormat;
    }
    // 设置快照名称
    snapshot.name = `快照 ${state.savedScenes.length + 1}`;
    return snapshot;
}

// 从快照恢复状态
function restoreState(snapshot) {
    state.scenes = JSON.parse(JSON.stringify(snapshot.scenes));
    state.currentSceneIndex = snapshot.currentSceneIndex;
}

// 全局状态管理
const state = {
    scenes: [],
    currentSceneIndex: 0,
    currentDialogIndex: 0,
    savedScenes: [], // 历史快照栈：每一步操作前保存的状态
    characters: [],
    backgrounds: [],
    uploadedCharacters: [],
    animationEnabled: false,
    animationSpeed: 50,
    // 对话输入框字体大小（px）
    dialogFontSize: 16,
    // 接下来的文本格式初始值（同全局，默认不生效）
    selectionFormatColor: '#ffffff',
    selectionFormatSize: 16,
    // 导出分辨率设置（默认1920x1080，16:9）
    exportResolution: 1920,
    // 导出质量设置（1-10，越高越好）
    exportQuality: 1,
    // PNG质量设置（0.5-1.0，越高越好）
    exportPngQuality: 0.9,
    // MP4质量设置（1-10，越高越好）
    exportMp4Quality: 5,
    // 全部导出格式设置（'gif' | 'mp4'）
    exportAllFormat: 'gif',
    // ZIP压缩打包设置
    zipExportEnabled: false,
    zipBatchSize: 10,
    leftPanelFolded: false,
    rightPanelFolded: false,
    // 标记当前输入框是否包含未保存的文本（用于防止切换角色/背景时被重置）
    isTypingUnsaved: false,
    // 默认角色 - 指向本地 characters 文件夹
    defaultCharacters: [
        { id: 1, name: 'Rosetta', url: 'characters/Rosetta_-_Arete.webp' },
        { id: 2, name: 'Lucia', url: 'characters/Lucia_-_Crimson_Weave.webp' },
        { id: 3, name: 'Selena', url: 'characters/Selena_-_Pianissimo.webp' },
        { id: 4, name: 'Luna', url: 'characters/Luna_-_Oblivion.webp' }
    ],

    // 文本格式化状态
    textFormatting: {
        dialog: {
            color: '#ffffff',
            fontSize: 16,
            fontWeight: 400,
            textAlign: 'left'
        },
        commander: {
            color: '#000000',
            fontSize: 14,
            fontWeight: 400,
            textAlign: 'left'
        }
    },

    // 标记是否正在导出
    isExporting: false,
    // 全部导出控制
    isExportAll: false,
    shouldCancelExport: false,
    exportAllProgress: { current: 0, total: 0, failed: 0 },
    // 设备性能检测（用于动态调整批处理数量）
    devicePerformance: null,
    // 默认背景 - 指向本地 backgrounds 文件夹
    defaultBackgrounds: [
        { id: 1, name: '背景1', url: 'backgrounds/1.png' },
        { id: 2, name: '背景2', url: 'backgrounds/2.png' },
        { id: 3, name: '背景3', url: 'backgrounds/3.png' },
        { id: 4, name: '背景4', url: 'backgrounds/4.png' }
    ]
};

// 根据角色名称文字数量动态调整位置：超过三个字时，每多一字整体向左移动 1 个中文字符宽度
function adjustCharacterNamePosition() {
    var wrapperEl = elements && elements.characterNameWrapper;
    var nameEl = elements && elements.characterName;
    if (!wrapperEl || !nameEl) return;

    // 鸣潮模式下不执行偏移，保持居中
    if (document.body.classList.contains('ming-active')) {
        wrapperEl.style.marginLeft = '';
        return;
    }

    var text = nameEl.value || '';
    var len = text.length;

    // 清除上次的偏移
    wrapperEl.style.marginLeft = '';

    if (len > 3) {
        var offset = -(len - 3);
        wrapperEl.style.marginLeft = offset + 'rem';  // 1rem = 1.25rem字号 ≈ 一个中文字宽
    }
}

// 当前在模态中加载到编辑区的快照索引（用于保存修改回写快照）
let currentLoadedSnapshotIndex = null;
// 存放每个快照被替换前的备份（用于撤销保存修改）
const savedSnapshotBackups = {};

// 缓存 gif.worker 的 blob URL，避免跨域 Worker 构造错误
let _gifWorkerBlobUrl = null;

// 获取 gif.worker 的本地 blob URL（从 CDN 拉取脚本文本并创建 blob），可避免 Worker 跨域加载失败
async function getGifWorkerBlobUrl() {
    if (_gifWorkerBlobUrl) return _gifWorkerBlobUrl;
    const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js';
    try {
        const resp = await fetch(workerUrl, { mode: 'cors' });
        if (!resp.ok) throw new Error('Failed to fetch gif.worker.js: ' + resp.status);
        const text = await resp.text();
        const blob = new Blob([text], { type: 'application/javascript' });
        _gifWorkerBlobUrl = URL.createObjectURL(blob);
        return _gifWorkerBlobUrl;
    } catch (err) {
        console.error('获取 gif.worker 脚本失败:', err);
        // 如果失败，抛出以便上层处理并提示用户
        throw err;
    }
}

// DOM 元素引用
const elements = {
    app: document.getElementById('app'),
    // 左侧面板
    leftPanel: document.getElementById('left-panel'),
    foldLeftBtn: document.getElementById('fold-left'),
    backgroundList: document.getElementById('background-list'),
    leftCharacterList: document.getElementById('left-character-list'),
    uploadBackground: document.getElementById('upload-background'),
    uploadCharacterLeft: document.getElementById('upload-character-left'),
    animationToggleLeft: document.getElementById('animation-toggle-left'),
    animationSpeedLeft: document.getElementById('animation-speed-left'),
    speedValueLeft: document.getElementById('speed-value-left'),
    
    // 右侧面板
    rightPanel: document.getElementById('right-panel'),
    foldRightBtn: document.getElementById('fold-right'),
    rightCharacterList: document.getElementById('right-character-list'),
    uploadCharacterRight: document.getElementById('upload-character-right'),
    animationToggleRight: document.getElementById('animation-toggle-right'),
    animationSpeedRight: document.getElementById('animation-speed-right'),
    speedValueRight: document.getElementById('speed-value-right'),
    
    // 中间预览区
    previewContainer: document.getElementById('preview-container'),
    previewBackground: document.getElementById('preview-background'),
    characterLayer: document.getElementById('character-layer'),
    characterName: document.getElementById('character-name'),
    characterNameWrapper: document.getElementById('character-name-wrapper'),
    dialogInput: document.getElementById('dialog-input'),
    commanderDialog: document.getElementById('commander-dialog'),
    commanderText: document.getElementById('commander-text'),
    // 导出设置控件（右侧面板）
    exportResolutionSlider: document.getElementById('export-resolution'),
    exportResolutionValue: document.getElementById('export-resolution-value'),
    exportPngQualitySlider: document.getElementById('export-png-quality'),
    exportPngQualityValue: document.getElementById('export-png-quality-value'),
    exportQualitySlider: document.getElementById('export-quality'),
    exportQualityValue: document.getElementById('export-quality-value'),
    exportMp4QualitySlider: document.getElementById('export-mp4-quality'),
    exportMp4QualityValue: document.getElementById('export-mp4-quality-value'),
    // 更多设置相关
    moreSettingsSection: document.getElementById('more-settings-section'),
    moreSettingsContent: document.getElementById('more-settings-content'),
    moreSettingsArrow: document.getElementById('more-settings-arrow'),
    exportAllFormatGifBtn: document.getElementById('export-all-format-gif'),
    exportAllFormatMp4Btn: document.getElementById('export-all-format-mp4'),
    // ZIP压缩打包相关
    zipExportToggle: document.getElementById('zip-export-toggle'),
    zipBatchSizeSlider: document.getElementById('zip-batch-size'),
    zipBatchSizeValue: document.getElementById('zip-batch-size-value'),

    // 文本格式化控件（compact版本 - 在更多设置中）
    dialogColorInputCompact: document.getElementById('dialog-color-input-compact'),
    dialogSizeDecreaseCompact: document.getElementById('dialog-size-decrease-compact'),
    dialogSizeIncreaseCompact: document.getElementById('dialog-size-increase-compact'),
    dialogSizeValueCompact: document.getElementById('dialog-size-value'),
    // 文本格式化控件（完整版本 - 已删除）

    commanderColorInputCompact: document.getElementById('commander-color-input-compact'),
    commanderSizeDecreaseCompact: document.getElementById('commander-size-decrease-compact'),
    commanderSizeIncreaseCompact: document.getElementById('commander-size-increase-compact'),
    commanderSizeValueCompact: document.getElementById('commander-size-value'),
    // 选中文本格式控件
    dialogFormattedOverlay: document.getElementById('dialog-formatted-overlay'),
    selFormatColor: document.getElementById('sel-format-color'),
    selFormatColorValue: document.getElementById('sel-format-color-value'),
    selFormatSizeDecrease: document.getElementById('sel-format-size-decrease'),
    selFormatSizeIncrease: document.getElementById('sel-format-size-increase'),
    selFormatSizeValue: document.getElementById('sel-format-size-value'),

    // 指挥官格式化控件（完整版本 - 已删除）

	    // 保留对已删除元素的引用（用于避免错误）
	    dialogColorPicker: null,
	    
	    // 复制和重命名按钮
	    copySceneLeft: document.getElementById('copy-scene-left'),
	    renameSceneLeft: document.getElementById('rename-scene-left'),
	    copySceneRight: document.getElementById('copy-scene-right'),
	    renameSceneRight: document.getElementById('rename-scene-right'),
	    
	    // 导出预览模态框相关元素
	    exportPreviewModal: document.getElementById('export-preview-modal'),
	    exportPreviewList: document.getElementById('export-preview-list'),
	    confirmExportBtn: document.getElementById('confirm-export-btn'),
	    cancelExportBtn: document.getElementById('cancel-export-btn'),
	    totalScenesCount: document.getElementById('total-scenes-count'),
	    totalDuration: document.getElementById('total-duration'),
    dialogColorInput: null,
    dialogSizeDecrease: null,
    dialogSizeIncrease: null,
    dialogWeightDecrease: null,
    dialogWeightIncrease: null,
    dialogAlignLeft: null,
    dialogAlignCenter: null,
    dialogAlignRight: null,
    dialogSizeInfo: null,
    dialogWeightInfo: null,
    dialogAlignInfo: null,

    commanderColorPicker: null,
    commanderColorInput: null,
    commanderSizeDecrease: null,
    commanderSizeIncrease: null,
    commanderWeightDecrease: null,
    commanderWeightIncrease: null,
    commanderAlignLeft: null,
    commanderAlignCenter: null,
    commanderAlignRight: null,
    commanderSizeInfo: null,
    commanderWeightInfo: null,
    commanderAlignInfo: null,

    // 导出进度模态框
    exportProgressModal: document.getElementById('export-progress-modal'),
    exportProgressTitle: document.getElementById('export-progress-title'),
    exportProgressBar: document.getElementById('export-progress-bar'),
    exportProgressText: document.getElementById('export-progress-text'),
    exportAllProgressInfo: document.getElementById('export-all-progress-info'),
    exportAllProgressBar: document.getElementById('export-all-progress-bar'),
    exportAllProgressText: document.getElementById('export-all-progress-text'),
    exportCancelBtn: document.getElementById('export-cancel-btn'),
    exportCloseBtn: document.getElementById('export-close-btn'),

    // 导出按钮
    exportBtnLeft: document.getElementById('export-btn-left'),
    exportAllBtnLeft: document.getElementById('export-all-btn-left'),
    exportGifBtnLeft: document.getElementById('export-gif-btn-left'),
    exportGifFastBtnLeft: document.getElementById('export-gif-fast-btn-left'),
    exportMp4BtnLeft: document.getElementById('export-mp4-btn-left'),
    exportBtnRight: document.getElementById('export-btn-right'),
    exportAllBtnRight: document.getElementById('export-all-btn-right'),
    exportGifBtnRight: document.getElementById('export-gif-btn-right'),
    exportGifFastBtnRight: document.getElementById('export-gif-fast-btn-right'),
    exportMp4BtnRight: document.getElementById('export-mp4-btn-right'),
    sceneCountLeft: document.getElementById('scene-count-left'),
    sceneCountRight: document.getElementById('scene-count-right'),
    
    // 导航按钮
    prevDialogLeft: document.getElementById('prev-dialog-left'),
    nextSceneLeft: document.getElementById('next-scene-left'),
    undoLeft: document.getElementById('undo-left'),
    undoAllLeft: document.getElementById('undo-all-left'),
    prevDialogRight: document.getElementById('prev-dialog-right'),
    nextSceneRight: document.getElementById('next-scene-right'),
    undoRight: document.getElementById('undo-right'),
    undoAllRight: document.getElementById('undo-all-right'),
    
    // 指挥官按钮
    commanderBtnLeft: document.getElementById('commander-dialog-btn-left'),
    commanderBtnRight: document.getElementById('commander-dialog-btn-right'),
    // 查看暂存按钮
    viewSavedLeft: document.getElementById('view-saved-left'),
    viewSavedRight: document.getElementById('view-saved-right'),
    // 添加新画面按钮
    addNewSceneBtn: document.getElementById('add-new-scene-btn'),

    // 主控：保存已加载快照的修改（放在查看暂存旁）
    saveSnapshotLeft: document.getElementById('save-snapshot-left'),
    saveSnapshotRight: document.getElementById('save-snapshot-right'),

    exportProjectJsonBtn: document.getElementById('export-project-json-btn'),
    importProjectJsonBtn: document.getElementById('import-project-json-btn'),
    importProjectJsonInput: document.getElementById('import-project-json-input')
};

// 与 formatRuns 同步用的「上一次输入框全文」（用于检测编辑以平移格式区间）
let dialogInputPrevForRuns = '';

const PROJECT_JSON_VERSION = 1;

// 标记当前已加载快照是否被修改（用于控制主保存按钮显示）
let loadedSnapshotModified = false;

// 初始化应用
function init() {
    // 加载默认数据
    state.uploadedCharacters = [...state.defaultCharacters];
    state.backgrounds = [...state.defaultBackgrounds];
    
    // 创建默认场景
    if (state.scenes.length === 0) {
        createScene();
    }
    
    // 渲染列表
    renderBackgroundList();
    VideoBgManager.init();
    renderCharacterList();
    updateCharacterListSelection();
    updatePreview();
    setupEventListeners();
    // 同步 UI 动画开关与速度显示
    if (elements.animationToggleLeft) elements.animationToggleLeft.checked = state.animationEnabled;
    if (elements.animationToggleRight) elements.animationToggleRight.checked = state.animationEnabled;
    if (elements.animationSpeedLeft) elements.animationSpeedLeft.value = state.animationSpeed;
    if (elements.animationSpeedRight) elements.animationSpeedRight.value = state.animationSpeed;
    if (elements.speedValueLeft) elements.speedValueLeft.textContent = state.animationSpeed;
    if (elements.speedValueRight) elements.speedValueRight.textContent = state.animationSpeed;
    // 应用导出设置
    if (elements.exportResolutionSlider) elements.exportResolutionSlider.value = state.exportResolution;
    if (elements.exportResolutionValue) elements.exportResolutionValue.textContent = state.exportResolution;
    if (elements.exportPngQualitySlider) elements.exportPngQualitySlider.value = state.exportPngQuality;
    if (elements.exportPngQualityValue) elements.exportPngQualityValue.textContent = state.exportPngQuality.toFixed(1);
    if (elements.exportQualitySlider) elements.exportQualitySlider.value = state.exportQuality;
    if (elements.exportQualityValue) elements.exportQualityValue.textContent = state.exportQuality;
    if (elements.exportMp4QualitySlider) elements.exportMp4QualitySlider.value = state.exportMp4Quality;
    if (elements.exportMp4QualityValue) elements.exportMp4QualityValue.textContent = state.exportMp4Quality;

    // 应用文本格式化
    applyDialogFormatting();
    applyCommanderFormatting();

    // 初始化接下来的文本格式显示（同全局时显示"-"）
    if (elements.selFormatColorValue) {
        elements.selFormatColorValue.textContent = '-';
    }
    if (elements.selFormatSizeValue) {
        elements.selFormatSizeValue.textContent = state.textFormatting.dialog.fontSize + 'px';
    }

    updateSceneCount();
    updateFoldButtonTitles();
    elements.app.classList.toggle('left-panel-folded', state.leftPanelFolded);
    elements.app.classList.toggle('right-panel-folded', state.rightPanelFolded);

    dialogInputPrevForRuns = elements.dialogInput.value;

    // UI风格切换开关
    const uiStyleSwitch = document.getElementById('ui-style-switch');
    const previewContainer = document.getElementById('preview-container');
    const switchLabelOld = document.getElementById('switch-label-old');
    const switchLabelNew = document.getElementById('switch-label-new');
    if (uiStyleSwitch && previewContainer) {
        function applyUISwitchStyle() {
            const isChecked = uiStyleSwitch.checked;
            if (isChecked) {
                previewContainer.classList.remove('preview-mode-old');
                previewContainer.classList.add('preview-mode-new');
                if (switchLabelOld) { switchLabelOld.style.color = '#aaa'; switchLabelOld.style.fontWeight = 'normal'; }
                if (switchLabelNew) { switchLabelNew.style.color = '#fff'; switchLabelNew.style.fontWeight = '600'; }
            } else {
                previewContainer.classList.remove('preview-mode-new');
                previewContainer.classList.add('preview-mode-old');
                if (switchLabelOld) { switchLabelOld.style.color = '#fff'; switchLabelOld.style.fontWeight = '600'; }
                if (switchLabelNew) { switchLabelNew.style.color = '#aaa'; switchLabelNew.style.fontWeight = 'normal'; }
            }
            // 滑块视觉状态
            const track = uiStyleSwitch.nextElementSibling;
            const knob = track ? track.nextElementSibling : null;
            if (track) track.style.backgroundColor = isChecked ? '#8b5cf6' : '#3d3d5c';
            if (knob) knob.style.transform = isChecked ? 'translateX(24px)' : 'translateX(0)';
        }
        uiStyleSwitch.addEventListener('change', applyUISwitchStyle);
        applyUISwitchStyle();
    }

    // ========== 导出日志功能 ==========
    var exportLogBtn = document.getElementById('export-log-btn-left');
    if (exportLogBtn) {
        exportLogBtn.addEventListener('click', function() {
            try {
                var log = window.getAppLog ? window.getAppLog() : [];
                var lines = [];
                lines.push('=== 战双剧情二创网站 - 操作日志 ===');
                lines.push('导出时间: ' + new Date().toLocaleString('zh-CN'));
                lines.push('');
                lines.push('--- 浏览器环境 ---');
                lines.push('UA: ' + navigator.userAgent);
                lines.push('语言: ' + navigator.language);
                lines.push('平台: ' + navigator.platform);
                lines.push('屏幕: ' + screen.width + 'x' + screen.height + ' (' + window.innerWidth + 'x' + window.innerHeight + ' 可视)');
                lines.push('URL: ' + location.href);
                lines.push('');

                lines.push('--- 当前状态摘要 ---');
                lines.push('场景总数: ' + (state.scenes ? state.scenes.length : 0));
                lines.push('当前场景: ' + (state.currentSceneIndex !== undefined ? state.currentSceneIndex + 1 : '?'));
                if (state.scenes && state.scenes[state.currentSceneIndex]) {
                    var cs = state.scenes[state.currentSceneIndex];
                    lines.push('背景: ' + (cs.backgroundName || '(无)'));
                    lines.push('角色数: ' + ((cs.characters && cs.characters.length) || 0));
                    lines.push('对话文本长度: ' + (cs.dialogText ? cs.dialogText.length : 0));
                    lines.push('指挥官文本长度: ' + (cs.commanderText ? cs.commanderText.length : 0));
                    lines.push('动画启用: ' + state.animationEnabled);
                    lines.push('动画速度: ' + state.animationSpeed);
                    lines.push('UI模式: ' + (elements.previewContainer && elements.previewContainer.classList.contains('preview-mode-new') ? '新版' : '旧版'));
                }
                lines.push('');

                lines.push('--- 操作日志（最近 ' + log.length + ' 条）---');
                for (var i = 0; i < log.length; i++) {
                    var e = log[i];
                    var extra = e.x ? JSON.stringify(e.x).substring(0, 200) : '';
                    lines.push('[' + e.t + '] [' + e.l + '] ' + e.m + (extra ? ' | ' + extra : ''));
                }

                lines.push('');
                lines.push('--- 错误/警告汇总 ---');
                var errors = log.filter(function(x){ return x.l==='ERROR'||x.l==='UNCAUGHT_ERROR'||x.l==='UNHANDLED_REJECTION'; });
                if (errors.length > 0) {
                    for (var j=0;j<errors.length;j++) { lines.push(errors[j].m); }
                } else {
                    lines.push('(无错误记录)');
                }

                var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'debug_log_' + new Date().toISOString().replace(/[:.]/g,'-').substring(0,19) + '.txt';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch(err) {
                alert('导出日志失败：'+err.message);
            }
        });
    }

    // ========== 功能搜索功能 ==========
    initFeatureSearch();

    // 初始化角色名称位置（根据当前文字长度调整）
    adjustCharacterNamePosition();
}

// ========== 功能搜索系统 ==========
function initFeatureSearch() {
    var searchInput  = document.getElementById('feature-search-input');
    var searchBtn    = document.getElementById('feature-search-btn');
    var searchClear  = document.getElementById('feature-search-clear');
    var searchBar    = document.getElementById('feature-search-bar');
    var searchResults= document.getElementById('feature-search-results');

    if (!searchInput || !searchResults || !searchBar) {
        console.warn('[功能搜索] 缺少必要元素，初始化跳过', { searchInput: !!searchInput, searchResults: !!searchResults, searchBar: !!searchBar });
        return;
    }

    // ===== 功能索引 =====
    var featureIndex = [];
    function buildIndex() {
        featureIndex = [];
        // 左侧面板
        document.querySelectorAll('#left-panel .section-title').forEach(function(el) {
            var sec = el.closest('.section');
            if (sec) featureIndex.push({ title: el.textContent.trim(), el: sec, panel: '左侧' });
            sec.querySelectorAll('.subsection-label').forEach(function(lbl) {
                featureIndex.push({ title: lbl.textContent.replace(/[:：]/g,'').trim(), el: lbl, panel: '左侧' });
            });
        });
        // 右侧面板
        document.querySelectorAll('#right-panel .section-title').forEach(function(el) {
            var sec = el.closest('.section');
            if (sec) featureIndex.push({ title: el.textContent.trim(), el: sec, panel: '右侧' });
            // 右侧 panel-title 下的 subsection-label 也索引
            sec.querySelectorAll('.subsection-label').forEach(function(lbl) {
                featureIndex.push({ title: lbl.textContent.replace(/[:：]/g,'').trim(), el: lbl, panel: '右侧' });
            });
        });
        // 更多设置内的功能（无论展开/折叠状态都索引）
        var moreContent = document.getElementById('more-settings-content');
        if (moreContent) {
            // 索引"更多设置"标题本身
            var moreSec = document.getElementById('more-settings-section');
            if (moreSec) {
                var moreTitle = moreSec.querySelector('.section-title');
                if (moreTitle) featureIndex.push({ title: moreTitle.textContent.trim(), el: moreSec, panel: '右侧' });
            }
            // 索引更多设置内部的每个 subsection-label
            moreContent.querySelectorAll('.subsection-label').forEach(function(lbl) {
                featureIndex.push({ title: lbl.textContent.replace(/[:：]/g,'').trim(), el: lbl, panel: '右侧·更多设置' });
            });
            // 索引更多设置内的按钮（如指挥官对话、导出JSON等）
            moreContent.querySelectorAll('.btn').forEach(function(btn) {
                featureIndex.push({ title: btn.textContent.trim(), el: btn, panel: '右侧·更多设置' });
            });
            // 索引更多设置内的格式按钮
            moreContent.querySelectorAll('.format-btn').forEach(function(btn) {
                featureIndex.push({ title: btn.textContent.trim(), el: btn, panel: '右侧·更多设置' });
            });
        }
        // 导出按钮
        document.querySelectorAll('#left-panel .button-group .btn').forEach(function(btn) {
            featureIndex.push({ title: btn.textContent.trim(), el: btn, panel: '左侧' });
        });
    }
    buildIndex();

    function uniqueByTitle(list) { var s={}; return list.filter(function(x){ if(s[x.title]) return false; s[x.title]=true; return true; }); }

    // ===== 定位高亮 =====
    var highlightTid = null, highlightedEl = null;
    function clearHL() { if(highlightedEl){highlightedEl.classList.remove('search-targeted');highlightedEl=null;} clearTimeout(highlightTid); }
    function ensureMoreSettingsExpanded(targetEl) {
        // 检查目标是否在"更多设置"内部，如果是且处于折叠状态则展开
        var moreContent = document.getElementById('more-settings-content');
        if (!moreContent || !moreContent.classList.contains('collapsed')) return; // 已展开或不存在
        var isInMoreSettings = moreContent.contains(targetEl) ||
                               (document.getElementById('more-settings-section') && document.getElementById('more-settings-section').contains(targetEl));
        if (isInMoreSettings) {
            moreContent.classList.remove('collapsed');
            moreContent.classList.add('expanded');
            var arrow = document.getElementById('more-settings-arrow');
            if (arrow) arrow.classList.add('rotated');
            // 展开后稍等一下再滚动，确保DOM布局已更新
            return true;
        }
        return false;
    }
    function scrollToAndHighlight(targetEl) {
        clearHL();
        var needsDelay = ensureMoreSettingsExpanded(targetEl);
        targetEl.classList.add('search-targeted'); highlightedEl=targetEl;
        if (needsDelay) {
            // 等待展开动画完成后再滚动
            setTimeout(function(){
                targetEl.scrollIntoView({behavior:'smooth',block:'center'});
            }, 350);
        } else {
            targetEl.scrollIntoView({behavior:'smooth',block:'center'});
        }
        highlightTid=setTimeout(clearHL,3000);
        hide();
    }

    // ===== 显示/隐藏结果下拉（fixed定位）=====
    function positionDropdown() {
        var rect = searchBar.getBoundingClientRect();
        searchResults.style.top  = (rect.bottom + 2) + 'px';
        searchResults.style.left = rect.left + 'px';
        searchResults.style.width = Math.max(rect.width, 200) + 'px';
    }
    function show() { positionDropdown(); searchResults.classList.add('active'); }
    function hide()  { searchResults.innerHTML=''; searchResults.classList.remove('active'); searchInput.value=''; if(searchClear) searchClear.classList.remove('visible'); }

    function findExact(query) {
        query=query.toLowerCase().trim();
        for(var i=0;i<featureIndex.length;i++) if(featureIndex[i].title.toLowerCase()===query) return featureIndex[i];
        return null;
    }

    function renderResults(text, matches) {
        searchResults.innerHTML='';
        if(!text) return hide();
        if(matches.length===0) {
            var d=document.createElement('div'); d.className='search-no-results'; d.textContent='未找到 "'+text+'" 相关功能';
            searchResults.appendChild(d);
        } else {
            uniqueByTitle(matches).forEach(function(m){
                var item=document.createElement('div'); item.className='search-result-item';
                item.innerHTML='<span class="result-title">'+m.title+'</span><span class="result-panel-tag">'+m.panel+'</span>';
                item.addEventListener('click',function(){scrollToAndHighlight(m.el);});
                searchResults.appendChild(item);
            });
        }
        show();
    }

    function doSearch(q){ q=(q||'').trim(); if(!q)return[]; var l=q.toLowerCase(); return featureIndex.filter(function(f){return f.title.toLowerCase().indexOf(l)!==-1;}); }

    function executeSearch(){
        var v=searchInput.value.trim(); if(!v){hide();return;}
        var ex=findExact(v);
        if(ex){scrollToAndHighlight(ex.el);return;}
        var ms=doSearch(v);
        if(ms.length===1){scrollToAndHighlight(ms[0].el);}else{renderResults(v,ms);}
    }

    // ===== 事件绑定 =====
    // 输入即搜，无延迟
    searchInput.addEventListener('input',function(){
        var val=this.value;
        if(searchClear) searchClear.classList.toggle('visible',val.length>0);
        if(!val || val.trim().length<1){hide();return;}
        renderResults(val.trim(),doSearch(val));
    });

    // 回车 → 精准直接跳转 / 模糊显示列表或选中项跳转
    searchInput.addEventListener('keydown',function(e){
        if(e.key==='Enter'){ e.preventDefault(); executeSearch(); return; }
        var items=searchResults.querySelectorAll('.search-result-item');
        if(!items.length) return;
        var cur=searchResults.querySelector('.highlighted');
        var idx=cur?Array.prototype.indexOf.call(items,cur):-1;
        if(e.key==='ArrowDown')   {e.preventDefault();idx=Math.min(idx+1,items.length-1);}
        else if(e.key==='ArrowUp'){e.preventDefault();idx=Math.max(idx-1,0);}
        else if(e.key==='Escape') {hide();this.blur();return;}
        else return;
        items.forEach(function(it){it.classList.remove('highlighted');});
        if(items[idx]) items[idx].classList.add('highlighted');
    });

    if(searchBtn)   searchBtn.addEventListener('click',executeSearch);
    if(searchClear) searchClear.addEventListener('click',function(){hide();searchInput.focus();});

    // 点击外部关闭
    document.addEventListener('mousedown',function(e){
        if(!searchResults.contains(e.target)&&e.target!==searchInput&&!e.target.closest('#feature-search-bar')) hide();
    });

    // 滚动时重新定位下拉框位置
    window.addEventListener('scroll',function(){ if(searchResults.classList.contains('active')) positionDropdown(); },true);
}

// 导入 JSON 后刷新界面（不重置 setupEventListeners）
function refreshUIFromState() {
    renderBackgroundList();
    renderCharacterList();
    updateCharacterListSelection();
    updatePreview();
    if (elements.animationToggleLeft) elements.animationToggleLeft.checked = state.animationEnabled;
    if (elements.animationToggleRight) elements.animationToggleRight.checked = state.animationEnabled;
    if (elements.animationSpeedLeft) elements.animationSpeedLeft.value = state.animationSpeed;
    if (elements.animationSpeedRight) elements.animationSpeedRight.value = state.animationSpeed;
    if (elements.speedValueLeft) elements.speedValueLeft.textContent = state.animationSpeed;
    if (elements.speedValueRight) elements.speedValueRight.textContent = state.animationSpeed;
    if (elements.exportResolutionSlider) elements.exportResolutionSlider.value = state.exportResolution;
    if (elements.exportResolutionValue) elements.exportResolutionValue.textContent = state.exportResolution;
    if (elements.exportPngQualitySlider) elements.exportPngQualitySlider.value = state.exportPngQuality;
    if (elements.exportPngQualityValue) elements.exportPngQualityValue.textContent = state.exportPngQuality.toFixed(1);
    if (elements.exportQualitySlider) elements.exportQualitySlider.value = state.exportQuality;
    if (elements.exportQualityValue) elements.exportQualityValue.textContent = state.exportQuality;
    if (elements.exportMp4QualitySlider) elements.exportMp4QualitySlider.value = state.exportMp4Quality;
    if (elements.exportMp4QualityValue) elements.exportMp4QualityValue.textContent = state.exportMp4Quality;

    if (elements.dialogColorInputCompact) {
        elements.dialogColorInputCompact.value = state.textFormatting.dialog.color;
        const dv = document.getElementById('dialog-color-value');
        if (dv) dv.textContent = state.textFormatting.dialog.color;
    }
    if (elements.commanderColorInputCompact) {
        elements.commanderColorInputCompact.value = state.textFormatting.commander.color;
        const cv = document.getElementById('commander-color-value');
        if (cv) cv.textContent = state.textFormatting.commander.color;
    }
    if (elements.selFormatColor) {
        elements.selFormatColor.value = state.selectionFormatColor;
    }
    updateSelFormatDisplays();

    applyDialogFormatting();
    applyCommanderFormatting();
    updateDialogDisplay();
    updateSceneCount();
    updateFoldButtonTitles();
    elements.app.classList.toggle('left-panel-folded', state.leftPanelFolded);
    elements.app.classList.toggle('right-panel-folded', state.rightPanelFolded);
    dialogInputPrevForRuns = elements.dialogInput.value;
}

function exportProjectJson() {
    const payload = {
        version: PROJECT_JSON_VERSION,
        exportedAt: new Date().toISOString(),
        scenes: JSON.parse(JSON.stringify(state.scenes)),
        currentSceneIndex: state.currentSceneIndex,
        savedScenes: JSON.parse(JSON.stringify(state.savedScenes)),
        characters: JSON.parse(JSON.stringify(state.characters)),
        backgrounds: JSON.parse(JSON.stringify(state.backgrounds)),
        uploadedCharacters: JSON.parse(JSON.stringify(state.uploadedCharacters)),
        textFormatting: JSON.parse(JSON.stringify(state.textFormatting)),
        selectionFormatColor: state.selectionFormatColor,
        selectionFormatSize: state.selectionFormatSize,
        animationEnabled: state.animationEnabled,
        animationSpeed: state.animationSpeed,
        exportResolution: state.exportResolution,
        exportQuality: state.exportQuality,
        exportPngQuality: state.exportPngQuality,
        exportMp4Quality: state.exportMp4Quality,
        exportAllFormat: state.exportAllFormat,
        zipExportEnabled: state.zipExportEnabled,
        zipBatchSize: state.zipBatchSize,
        leftPanelFolded: state.leftPanelFolded,
        rightPanelFolded: state.rightPanelFolded
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erocomic-project-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function applyImportedProject(data) {
    if (!data || typeof data !== 'object') throw new Error('无效数据');
    if (!Array.isArray(data.scenes)) throw new Error('缺少场景数据');
    state.scenes = JSON.parse(JSON.stringify(data.scenes));
    if (state.scenes.length === 0) {
        createScene();
    } else {
        state.currentSceneIndex = Math.min(
            Math.max(0, data.currentSceneIndex || 0),
            state.scenes.length - 1
        );
    }
    state.savedScenes = JSON.parse(JSON.stringify(data.savedScenes || []));
    if (Array.isArray(data.characters)) state.characters = JSON.parse(JSON.stringify(data.characters));
    if (Array.isArray(data.backgrounds)) state.backgrounds = JSON.parse(JSON.stringify(data.backgrounds));
    if (Array.isArray(data.uploadedCharacters)) {
        state.uploadedCharacters = JSON.parse(JSON.stringify(data.uploadedCharacters));
    }
    if (data.textFormatting) state.textFormatting = JSON.parse(JSON.stringify(data.textFormatting));
    if (typeof data.selectionFormatColor === 'string') state.selectionFormatColor = data.selectionFormatColor;
    if (typeof data.selectionFormatSize === 'number') state.selectionFormatSize = data.selectionFormatSize;
    if (typeof data.animationEnabled === 'boolean') state.animationEnabled = data.animationEnabled;
    if (typeof data.animationSpeed === 'number') state.animationSpeed = data.animationSpeed;
    if (typeof data.exportResolution === 'number') state.exportResolution = data.exportResolution;
    if (typeof data.exportQuality === 'number') state.exportQuality = data.exportQuality;
    if (typeof data.exportPngQuality === 'number') state.exportPngQuality = data.exportPngQuality;
    if (typeof data.exportMp4Quality === 'number') state.exportMp4Quality = data.exportMp4Quality;
    if (data.exportAllFormat === 'gif' || data.exportAllFormat === 'mp4') state.exportAllFormat = data.exportAllFormat;
    if (typeof data.zipExportEnabled === 'boolean') state.zipExportEnabled = data.zipExportEnabled;
    if (typeof data.zipBatchSize === 'number') state.zipBatchSize = data.zipBatchSize;
    if (typeof data.leftPanelFolded === 'boolean') state.leftPanelFolded = data.leftPanelFolded;
    if (typeof data.rightPanelFolded === 'boolean') state.rightPanelFolded = data.rightPanelFolded;

    migrateAllProjectFormatRuns();
    currentLoadedSnapshotIndex = null;
    loadedSnapshotModified = false;
    state.isTypingUnsaved = false;
    refreshUIFromState();
}

function handleImportProjectJson(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('导入将替换当前页面的工程数据（场景、暂存、列表与设置），是否继续？')) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            applyImportedProject(data);
            alert('导入成功');
        } catch (err) {
            alert('导入失败：' + (err && err.message ? err.message : String(err)));
        }
    };
    reader.onerror = () => alert('读取文件失败');
    reader.readAsText(file, 'UTF-8');
}

// 创建新场景
function createScene() {
    const defaultBg = state.backgrounds.length > 0 ? state.backgrounds[0] : null;
    const newScene = {
        id: Date.now(),
        background: defaultBg ? defaultBg.url : null,
        backgroundIsVideo: !!(defaultBg && defaultBg.isVideo),
        characters: [],
        dialogs: [],
        currentDialogIndex: 0,
        commanderText: '',
        // 视频字幕段数组，每个元素包含：id, startTime, endTime, characterName, dialogText, commanderText, formatRuns
        videoSubtitleSegments: []
    };
    state.scenes.push(newScene);
    state.currentSceneIndex = state.scenes.length - 1;
    updateSceneCount();
    return newScene;
}

// 复制当前场景，但清空对话，用于下一句生成的新场景（保留背景与角色）
function duplicateCurrentSceneForNextLine() {
    if (state.scenes.length === 0) return createScene();

    const cur = state.scenes[state.currentSceneIndex];
    const newScene = {
        id: Date.now(),
        background: cur.background || null,
        backgroundIsVideo: !!cur.backgroundIsVideo,
        characters: JSON.parse(JSON.stringify(cur.characters || [])),
        dialogs: [],
        currentDialogIndex: 0,
        commanderText: '',
        // 复制视频字幕段数组
        videoSubtitleSegments: JSON.parse(JSON.stringify(cur.videoSubtitleSegments || []))
    };
    state.scenes.push(newScene);
    state.currentSceneIndex = state.scenes.length - 1;
    updateSceneCount();
    return newScene;
}

// 设置事件监听器
function setupEventListeners() {
    // 面板折叠
    elements.foldLeftBtn.addEventListener('click', () => togglePanel('left'));
    elements.foldRightBtn.addEventListener('click', () => togglePanel('right'));
    
    // 背景上传
    setupFileUpload(elements.uploadBackground, handleBackgroundUpload);
    
    // 角色上传
    setupFileUpload(elements.uploadCharacterLeft, handleCharacterUpload);
    setupFileUpload(elements.uploadCharacterRight, handleCharacterUpload);
    
    // 动画开关 - 同步左右
    elements.animationToggleLeft.addEventListener('change', (e) => {
        state.animationEnabled = e.target.checked;
        elements.animationToggleRight.checked = e.target.checked;
    });
    elements.animationToggleRight.addEventListener('change', (e) => {
        state.animationEnabled = e.target.checked;
        elements.animationToggleLeft.checked = e.target.checked;
    });
    
    // 动画速度 - 同步左右
    elements.animationSpeedLeft.addEventListener('input', (e) => {
        state.animationSpeed = parseInt(e.target.value);
        elements.speedValueLeft.textContent = state.animationSpeed;
        elements.animationSpeedRight.value = state.animationSpeed;
        elements.speedValueRight.textContent = state.animationSpeed;
    });
    elements.animationSpeedRight.addEventListener('input', (e) => {
        state.animationSpeed = parseInt(e.target.value);
        elements.speedValueRight.textContent = state.animationSpeed;
        elements.animationSpeedLeft.value = state.animationSpeed;
        elements.speedValueLeft.textContent = state.animationSpeed;
    });

    // 导出分辨率设置（右侧面板）
    if (elements.exportResolutionSlider) {
        elements.exportResolutionSlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            state.exportResolution = v;
            if (elements.exportResolutionValue) elements.exportResolutionValue.textContent = v;
        });
    }

    // 导出质量设置（右侧面板）
    if (elements.exportQualitySlider) {
        elements.exportQualitySlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            state.exportQuality = v;
            if (elements.exportQualityValue) elements.exportQualityValue.textContent = v;
        });
    }

    // PNG质量设置
    if (elements.exportPngQualitySlider) {
        elements.exportPngQualitySlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            state.exportPngQuality = v;
            if (elements.exportPngQualityValue) elements.exportPngQualityValue.textContent = v.toFixed(1);
        });
    }

    // MP4质量设置
    if (elements.exportMp4QualitySlider) {
        elements.exportMp4QualitySlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            state.exportMp4Quality = v;
            if (elements.exportMp4QualityValue) elements.exportMp4QualityValue.textContent = v;
        });
    }

    // ZIP压缩打包开关
    if (elements.zipExportToggle) {
        elements.zipExportToggle.addEventListener('change', (e) => {
            state.zipExportEnabled = e.target.checked;
        });
    }

    // ZIP分批大小设置
    if (elements.zipBatchSizeSlider) {
        elements.zipBatchSizeSlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            state.zipBatchSize = v;
            if (elements.zipBatchSizeValue) elements.zipBatchSizeValue.textContent = v;
        });
    }

    // 文本格式化 - 对话输入框（compact版本）
    if (elements.dialogColorInputCompact) {
elements.dialogColorInputCompact.addEventListener('input', (e) => {
const newColor = normalizeHexColor(e.target.value);
const oldColor = state.textFormatting.dialog.color;
            // 如果「接下来的」颜色与旧全局颜色相同，同步更新为新的全局颜色
            if (colorsEqual(state.selectionFormatColor, oldColor)) {
                state.selectionFormatColor = newColor;
                if (elements.selFormatColor) elements.selFormatColor.value = newColor;
                if (elements.selFormatColorValue) elements.selFormatColorValue.textContent = '-';
            }
            state.textFormatting.dialog.color = newColor;
            applyDialogFormatting();
        });
    }

    if (elements.dialogSizeDecreaseCompact) {
        elements.dialogSizeDecreaseCompact.addEventListener('click', () => {
            if (state.textFormatting.dialog.fontSize > 12) {
                state.textFormatting.dialog.fontSize -= 2;
                if (elements.dialogSizeValueCompact) {
                    elements.dialogSizeValueCompact.textContent = state.textFormatting.dialog.fontSize + 'px';
                }
                applyDialogFormatting();
            }
        });
    }

    if (elements.dialogSizeIncreaseCompact) {
        elements.dialogSizeIncreaseCompact.addEventListener('click', () => {
            if (state.textFormatting.dialog.fontSize < 36) {
                state.textFormatting.dialog.fontSize += 2;
                if (elements.dialogSizeValueCompact) {
                    elements.dialogSizeValueCompact.textContent = state.textFormatting.dialog.fontSize + 'px';
                }
                applyDialogFormatting();
            }
        });
    }

    // 接下来的文本格式控件
    if (elements.selFormatColor) {
        elements.selFormatColor.addEventListener('input', (e) => {
            state.selectionFormatColor = normalizeHexColor(e.target.value);
            updateSelFormatDisplays();
            updateNextTextFormat();
        });
    }
    if (elements.selFormatSizeDecrease) {
        elements.selFormatSizeDecrease.addEventListener('click', () => {
            if (state.selectionFormatSize > 12) {
                state.selectionFormatSize -= 2;
                updateSelFormatDisplays();
                updateNextTextFormat();
            }
        });
    }
    if (elements.selFormatSizeIncrease) {
        elements.selFormatSizeIncrease.addEventListener('click', () => {
            if (state.selectionFormatSize < 48) {
                state.selectionFormatSize += 2;
                updateSelFormatDisplays();
                updateNextTextFormat();
            }
        });
    }

    // 文本格式化 - 指挥官对话（compact版本）
    if (elements.commanderColorInputCompact) {
        elements.commanderColorInputCompact.addEventListener('input', (e) => {
            state.textFormatting.commander.color = e.target.value;
            applyCommanderFormatting();
        });
    }

    if (elements.commanderSizeDecreaseCompact) {
        elements.commanderSizeDecreaseCompact.addEventListener('click', () => {
            if (state.textFormatting.commander.fontSize > 10) {
                state.textFormatting.commander.fontSize -= 1;
                if (elements.commanderSizeValueCompact) {
                    elements.commanderSizeValueCompact.textContent = state.textFormatting.commander.fontSize + 'px';
                }
                applyCommanderFormatting();
            }
        });
    }

    if (elements.commanderSizeIncreaseCompact) {
        elements.commanderSizeIncreaseCompact.addEventListener('click', () => {
            if (state.textFormatting.commander.fontSize < 24) {
                state.textFormatting.commander.fontSize += 1;
                if (elements.commanderSizeValueCompact) {
                    elements.commanderSizeValueCompact.textContent = state.textFormatting.commander.fontSize + 'px';
                }
                applyCommanderFormatting();
            }
        });
    }

// 导出按钮
elements.exportBtnLeft.addEventListener('click', exportScene);
elements.exportBtnRight.addEventListener('click', exportScene);
// 全部导出按钮的事件在 initializeExportPreview 中设置，这里不再绑定
elements.exportGifBtnLeft.addEventListener('click', () => exportGIF());
    elements.exportGifBtnRight.addEventListener('click', () => exportGIF());
    elements.exportGifFastBtnLeft.addEventListener('click', () => exportGIFFast());
    elements.exportGifFastBtnRight.addEventListener('click', () => exportGIFFast());
    elements.exportMp4BtnLeft.addEventListener('click', () => exportMP4());
    elements.exportMp4BtnRight.addEventListener('click', () => exportMP4());

    // 全部导出取消按钮
    if (elements.exportCancelBtn) {
        elements.exportCancelBtn.addEventListener('click', () => {
            if (state.isExportAll && confirm('确定要取消导出吗?已导出的文件将保留。')) {
                state.shouldCancelExport = true;
            }
        });
    }

    // 关闭导出弹窗按钮
    if (elements.exportCloseBtn) {
        elements.exportCloseBtn.addEventListener('click', () => {
            state.isExportAll = false;
            state.shouldCancelExport = false;
            hideExportProgress();
            console.log('用户手动关闭导出弹窗');
        });
    }

    // 导航按钮
    elements.prevDialogLeft.addEventListener('click', nextDialog);
    elements.prevDialogRight.addEventListener('click', nextDialog);
    elements.nextSceneLeft.addEventListener('click', nextScene);
    elements.nextSceneRight.addEventListener('click', nextScene);
    
    // 撤回按钮
    elements.undoLeft.addEventListener('click', undoLastDialog);
    elements.undoRight.addEventListener('click', undoLastDialog);
    elements.undoAllLeft.addEventListener('click', clearHistoryStack);
    elements.undoAllRight.addEventListener('click', clearHistoryStack);

	    // 查看暂存历史按钮
	    if (elements.viewSavedLeft) elements.viewSavedLeft.addEventListener('click', showSavedScenes);
	    if (elements.viewSavedRight) elements.viewSavedRight.addEventListener('click', showSavedScenes);
	    // 主控保存修改按钮（初始隐藏）
	    if (elements.saveSnapshotLeft) elements.saveSnapshotLeft.addEventListener('click', saveLoadedSnapshot);
	    if (elements.saveSnapshotRight) elements.saveSnapshotRight.addEventListener('click', saveLoadedSnapshot);
	    

    
    // 指挥官按钮
    elements.commanderBtnLeft.addEventListener('click', toggleCommanderDialog);
    elements.commanderBtnRight.addEventListener('click', toggleCommanderDialog);

    // 更多设置面板 - 展开/折叠（仅点击标题时触发）
    if (elements.moreSettingsSection) {
        elements.moreSettingsSection.querySelector('.section-title').addEventListener('click', (e) => {
            e.stopPropagation();
            const content = elements.moreSettingsContent;
            const arrow = elements.moreSettingsArrow;
            if (content) {
                content.classList.toggle('expanded');
                content.classList.toggle('collapsed');
            }
            if (arrow) {
                arrow.classList.toggle('rotated');
            }
        });

        // 阻止内容区域的点击事件冒泡到标题
        if (elements.moreSettingsContent) {
            elements.moreSettingsContent.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    // 全部导出格式切换
    if (elements.exportAllFormatGifBtn) {
        elements.exportAllFormatGifBtn.addEventListener('click', () => {
            state.exportAllFormat = 'gif';
            elements.exportAllFormatGifBtn.classList.add('active');
            if (elements.exportAllFormatMp4Btn) {
                elements.exportAllFormatMp4Btn.classList.remove('active');
            }
        });
    }

    if (elements.exportAllFormatMp4Btn) {
        elements.exportAllFormatMp4Btn.addEventListener('click', () => {
            state.exportAllFormat = 'mp4';
            elements.exportAllFormatMp4Btn.classList.add('active');
            if (elements.exportAllFormatGifBtn) {
                elements.exportAllFormatGifBtn.classList.remove('active');
            }
        });
    }
    
    // 对话框输入
    elements.dialogInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addDialog();
        }
    });

    // 标记输入框是否有未保存文本，避免切换角色/背景时被重置
    elements.dialogInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const prev = dialogInputPrevForRuns;
        state.isTypingUnsaved = val.trim().length > 0;
        syncFormatRunsOnTextChange(prev, val);
        applyIncomingTextNextFormat(prev, val);
        dialogInputPrevForRuns = val;
        updateFormattedOverlay();
        if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
    });

    // 同步textarea滚动到覆盖层
    elements.dialogInput.addEventListener('scroll', () => {
        const overlay = elements.dialogFormattedOverlay;
        if (overlay && overlay.style.display !== 'none') {
            overlay.scrollTop = elements.dialogInput.scrollTop;
        }
    });
    // 覆盖层滚动同步回textarea
    if (elements.dialogFormattedOverlay) {
        elements.dialogFormattedOverlay.addEventListener('scroll', () => {
            if (elements.dialogFormattedOverlay.style.display !== 'none') {
                elements.dialogInput.scrollTop = elements.dialogFormattedOverlay.scrollTop;
            }
        });
    }
    
    // 角色名称输入
    elements.characterName.addEventListener('input', (e) => {
        if (state.scenes.length > 0) {
            const currentScene = state.scenes[state.currentSceneIndex];
            // 如果当前有对话，更新角色名称
            if (currentScene.dialogs.length > 0 && currentScene.currentDialogIndex < currentScene.dialogs.length) {
                currentScene.dialogs[currentScene.currentDialogIndex].character = e.target.value;
            }
            if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
        }
        adjustCharacterNamePosition();
    });
    
    // 指挥官文本输入
    elements.commanderText.addEventListener('input', (e) => {
        if (state.scenes.length > 0) {
            state.scenes[state.currentSceneIndex].commanderText = e.target.value;
            if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
        }
    });

    if (elements.exportProjectJsonBtn) {
        elements.exportProjectJsonBtn.addEventListener('click', () => exportProjectJson());
    }
    if (elements.importProjectJsonBtn && elements.importProjectJsonInput) {
        elements.importProjectJsonBtn.addEventListener('click', () => elements.importProjectJsonInput.click());
        elements.importProjectJsonInput.addEventListener('change', handleImportProjectJson);
    }

    // ============ 键盘快捷键支持 ============

// 辅助函数：判断是否有输入框聚焦
function isInputFocused() {
    const active = document.activeElement;
    return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA';
}

// 全局键盘事件监听
document.addEventListener('keydown', (e) => {
    // 忽略输入框中的快捷键（但保留 Ctrl+Enter）
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (!(e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            return;
        }
    }

    // Ctrl+S 自动保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (typeof autoSave === 'function') autoSave();
        if (typeof showToast === 'function') showToast('已自动保存');
    }
    
    // Ctrl+Z 撤回
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoLastDialog();
    }
    
    // Ctrl+E 导出
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        exportScene();
    }
    
    // Ctrl+Enter 下一句
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        nextDialog();
    }

    // 方向键切换场景
    if (e.key === 'ArrowRight' && !isInputFocused()) {
        e.preventDefault();
        state.currentSceneIndex = Math.min(state.scenes.length - 1, state.currentSceneIndex + 1);
        updatePreview();
    }
    if (e.key === 'ArrowLeft' && !isInputFocused()) {
        e.preventDefault();
        state.currentSceneIndex = Math.max(0, state.currentSceneIndex - 1);
        updatePreview();
    }
});
// ============ 键盘快捷键支持结束 ============
}

// 设置文件上传
function setupFileUpload(input, handler) {
    const wrapper = input.parentElement;
    const btn = wrapper.querySelector('.file-btn');
    const nameSpan = wrapper.querySelector('.file-name');
    
    btn.addEventListener('click', () => input.click());
    
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            nameSpan.textContent = file.name;
            handler(file);
        }
        input.value = '';
    });
}

// 处理背景上传（支持图片和视频）
function handleBackgroundUpload(file) {
    const isVideo = file.type.startsWith('video/');

    if (isVideo) {
        // ===== 视频文件限制检查 =====
        const MAX_SIZE_MB = 200;
        const MAX_DURATION_SECONDS = 300; // 5分钟
        const maxSizeBytes = MAX_SIZE_MB * 1024 * 1024;

        // 1. 文件大小检查
        if (file.size > maxSizeBytes) {
            alert('视频文件过大！\n最大支持 ' + MAX_SIZE_MB + 'MB，当前文件：' + (file.size / 1024 / 1024).toFixed(1) + 'MB');
            return;
        }

        // 2. 视频时长检查（需要创建临时 video 元素加载元数据）
        var tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.playsInline = true;

        tempVideo.addEventListener('loadedmetadata', function() {
            URL.revokeObjectURL(tempVideo.src);
            if (tempVideo.duration > MAX_DURATION_SECONDS) {
                var minutes = Math.floor(tempVideo.duration / 60);
                var seconds = Math.floor(tempVideo.duration % 60);
                alert('视频时长过长！\n最大支持 ' + Math.floor(MAX_DURATION_SECONDS / 60) + ' 分钟，当前视频：' + minutes + '分' + seconds + '秒');
                return;
            }

            // 校验通过，执行正常上传逻辑
            processVideoUpload(file);
        });

        tempVideo.addEventListener('error', function() {
            URL.revokeObjectURL(tempVideo.src);
            console.error('[视频上传] 无法读取视频元数据，尝试继续处理');
            // 元数据读取失败时仍允许上传（可能是浏览器兼容性问题）
            processVideoUpload(file);
        });

        tempVideo.src = URL.createObjectURL(file);
    } else {
        // 图片文件：保持原有逻辑
        const reader = new FileReader();
        reader.onload = (e) => {
            const background = {
                id: Date.now(),
                name: file.name,
                url: e.target.result
            };
            state.backgrounds.push(background);
            renderBackgroundList();

            if (state.scenes.length > 0) {
                state.scenes[state.currentSceneIndex].background = background.url;
                state.scenes[state.currentSceneIndex].backgroundIsVideo = false;
                updatePreview();
                if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
            }
        };
        reader.readAsDataURL(file);
    }
}

// 视频校验通过后的实际处理逻辑
function processVideoUpload(file) {
    const url = URL.createObjectURL(file);
    const background = {
        id: Date.now(),
        name: file.name,
        url: url,
        isVideo: true
    };
    state.backgrounds.push(background);
    renderBackgroundList();

    if (state.scenes.length > 0) {
        state.scenes[state.currentSceneIndex].background = background.url;
        state.scenes[state.currentSceneIndex].backgroundIsVideo = true;
        updatePreview();
        if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
    }
}

// ========== 视频背景管理器 ==========
const VideoBgManager = {
    _videoEl: null,
    _progressBar: null,
    _seekSlider: null,
    _timeCurrent: null,
    _timeDuration: null,
    _toggleBtn: null,
    _controlPanel: null,

    // 视频显示设置
    _videoSettings: {
        scale: 48,       // 缩放比例 (%) - 默认值从100改为48
        posX: 37,        // 水平位置 (%) - 默认值从50改为37
        posY: 37,        // 垂直位置 (%) - 默认值从50改为37
        opacity: 100     // 透明度 (%)
    },

    // 字幕轨数据 [{ startTime, endTime, text, id }]
    _subtitles: [],
    _currentSubtitleId: null,
    _subtitleOverlay: null,

    init() {
        this._videoEl = document.getElementById('background-video');
        this._progressBar = document.getElementById('video-progress-bar');
        this._seekSlider = document.getElementById('video-seek-slider');
        this._timeCurrent = document.getElementById('video-current-time');
        this._timeDuration = document.getElementById('video-duration');
        this._toggleBtn = document.getElementById('video-toggle-play');

        if (!this._videoEl || !this._progressBar) return;

        // 视频事件
        this._videoEl.addEventListener('loadedmetadata', () => this.onMetadata());
        this._videoEl.addEventListener('timeupdate', () => this.onTimeUpdate());
        this._videoEl.addEventListener('play', () => this.onPlayPause(true));
        this._videoEl.addEventListener('pause', () => this.onPlayPause(false));
        this._videoEl.addEventListener('ended', () => this.onEnded());

        // 滑块拖动
        if (this._seekSlider) {
            this._seekSlider.addEventListener('input', () => {
                if (this._videoEl.duration) {
                    this._videoEl.currentTime = this._seekSlider.value * this._videoEl.duration / 100;
                }
            });
        }

        // 播放/暂停按钮
        if (this._toggleBtn) {
            this._toggleBtn.addEventListener('click', () => this.togglePlay());
        }

        // 初始化控制面板
        this._initControlPanel();
        this._initSubtitleOverlay();
    },

    // 设置视频背景（由 updatePreview 调用）
    setVideoSrc(url) {
        if (!this._videoEl) return;
        this.hideVideo();
        this._videoEl.src = url;
        this._videoEl.load();
        this._videoEl.style.display = 'block';
        if (this._progressBar) this._progressBar.style.display = 'flex';

        // 显示控制面板
        this._showControlPanel();

        // 应用当前视频设置
        this._applyVideoTransform();

        // 自动播放（静音视频通常可以自动播放）
        const playPromise = this._videoEl.play().catch(() => {});
        if (playPromise) playPromise.catch(() => {});
    },

    hideVideo() {
        if (!this._videoEl) return;
        this._videoEl.pause();
        this._videoEl.removeAttribute('src');
        this._videoEl.load(); // 释放资源
        this._videoEl.style.display = 'none';
        if (this._progressBar) this._progressBar.style.display = 'none';

        // 隐藏控制面板和字幕
        this._hideControlPanel();
        if (this._subtitleOverlay) this._subtitleOverlay.style.display = 'none';

        // 重置视频变换
        this._videoEl.style.transform = '';
        this._videoEl.style.opacity = '1';
    },

    togglePlay() {
        if (!this._videoEl) return;
        if (this._videoEl.paused) {
            this._videoEl.play().catch(() => {});
        } else {
            this._videoEl.pause();
        }
    },

    onMetadata() {
        if (this._timeDuration && this._videoEl.duration)
            this._timeDuration.textContent = this.formatTime(this._videoEl.duration);
        this.updateSlider();
    },

    onTimeUpdate() {
        this.updateSlider();
        if (this._timeCurrent)
            this._timeCurrent.textContent = this.formatTime(this._videoEl.currentTime);
        // 同步对话框到视频时间
        this._syncDialogToVideoTime(this._videoEl.currentTime);
    },

    onPlayPause(playing) {
        if (this._toggleBtn)
            this._toggleBtn.innerHTML = playing ? '&#9646;&#9646;' : '&#9654;';
    },

    onEnded() {
        if (this._toggleBtn) this._toggleBtn.innerHTML = '&#9654;';
    },

    updateSlider() {
        if (this._seekSlider && this._videoEl.duration) {
            this._seekSlider.value = (this._videoEl.currentTime / this._videoEl.duration) * 100;
        }
    },

    formatTime(s) {
        if (!isFinite(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ':' + (sec < 10 ? '0' : '') + sec;
    },

    // 获取当前帧作为 dataURL（用于导出时截图）
    getCurrentFrameDataURL() {
        if (!this._videoEl || !this._videoEl.src) return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = this._videoEl.videoWidth || 1920;
            canvas.height = this._videoEl.videoHeight || 1080;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this._videoEl, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/png');
        } catch(e) { return null; }
    },

    // 判断当前是否为视频背景模式
    isActive() {
        return !!(this._videoEl && this._videoEl.style.display === 'block' && this._videoEl.src);
    },

    // ========== 视频控制面板 ==========
    _initControlPanel() {
        // 创建控制面板 DOM
        const panel = document.createElement('div');
        panel.id = 'video-control-panel';
        panel.className = 'video-control-panel';
        panel.style.cssText = 'padding:10px; background:rgba(0,0,0,0.6); border-radius:8px;';
        panel.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <label style="color:#ccc; font-size:12px; display:flex; align-items:center; justify-content:space-between;">
                    <span>缩放:</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="number" id="video-scale-num" value="48" min="10" max="200" style="width:50px; padding:4px; font-size:11px; text-align:center; background:rgba(255,255,255,0.1); color:#fff; border:1px solid #555; border-radius:3px;">
                        <span>%</span>
                        <input type="range" id="video-scale" min="10" max="200" value="48" style="width:80px;">
                    </div>
                </label>
                <label style="color:#ccc; font-size:12px; display:flex; align-items:center; justify-content:space-between;">
                    <span>水平位置:</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="number" id="video-posx-num" value="37" min="0" max="100" style="width:50px; padding:4px; font-size:11px; text-align:center; background:rgba(255,255,255,0.1); color:#fff; border:1px solid #555; border-radius:3px;">
                        <span>%</span>
                        <input type="range" id="video-posx" min="0" max="100" value="37" style="width:80px;">
                    </div>
                </label>
                <label style="color:#ccc; font-size:12px; display:flex; align-items:center; justify-content:space-between;">
                    <span>垂直位置:</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="number" id="video-posy-num" value="37" min="0" max="100" style="width:50px; padding:4px; font-size:11px; text-align:center; background:rgba(255,255,255,0.1); color:#fff; border:1px solid #555; border-radius:3px;">
                        <span>%</span>
                        <input type="range" id="video-posy" min="0" max="100" value="37" style="width:80px;">
                    </div>
                </label>
                <label style="color:#ccc; font-size:12px; display:flex; align-items:center; justify-content:space-between;">
                    <span>透明度:</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="number" id="video-opacity-num" value="100" min="0" max="100" style="width:50px; padding:4px; font-size:11px; text-align:center; background:rgba(255,255,255,0.1); color:#fff; border:1px solid #555; border-radius:3px;">
                        <span>%</span>
                        <input type="range" id="video-opacity" min="0" max="100" value="100" style="width:80px;">
                    </div>
                </label>
            </div>
            <div style="margin-top:12px; padding-top:10px; border-top:1px solid #444;">
                <div style="color:#fff; font-size:12px; margin-bottom:8px;">字幕轨时间设置</div>
                <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
                    <input type="number" id="subtitle-start" placeholder="开始(秒)" style="width:70px; padding:4px; font-size:11px;" min="0" step="0.1">
                    <span style="color:#ccc;">-</span>
                    <input type="number" id="subtitle-end" placeholder="结束(秒)" style="width:70px; padding:4px; font-size:11px;" min="0" step="0.1">
                </div>
            </div>
        `;

        // 插入到右侧面板的视频设置容器中
        const container = document.getElementById('video-control-panel-container');
        if (container) {
            container.appendChild(panel);
            this._controlPanel = panel;
            this._bindControlEvents();
            this._initSaveSegmentControls();
        }
    },

    _bindControlEvents() {
        const self = this;

        // 缩放 - 滑块和数字输入框双向同步
        const scaleInput = document.getElementById('video-scale');
        const scaleNum = document.getElementById('video-scale-num');
        if (scaleInput) {
            scaleInput.addEventListener('input', function() {
                self._videoSettings.scale = parseInt(this.value);
                if (scaleNum) scaleNum.value = this.value;
                self._applyVideoTransform();
            });
        }
        if (scaleNum) {
            scaleNum.addEventListener('change', function() {
                let val = parseInt(this.value);
                if (val < 10) val = 10;
                if (val > 200) val = 200;
                self._videoSettings.scale = val;
                this.value = val;
                if (scaleInput) scaleInput.value = val;
                self._applyVideoTransform();
            });
        }

        // 水平位置 - 滑块和数字输入框双向同步
        const posXInput = document.getElementById('video-posx');
        const posXNum = document.getElementById('video-posx-num');
        if (posXInput) {
            posXInput.addEventListener('input', function() {
                self._videoSettings.posX = parseInt(this.value);
                if (posXNum) posXNum.value = this.value;
                self._applyVideoTransform();
            });
        }
        if (posXNum) {
            posXNum.addEventListener('change', function() {
                let val = parseInt(this.value);
                if (val < 0) val = 0;
                if (val > 100) val = 100;
                self._videoSettings.posX = val;
                this.value = val;
                if (posXInput) posXInput.value = val;
                self._applyVideoTransform();
            });
        }

        // 垂直位置 - 滑块和数字输入框双向同步
        const posYInput = document.getElementById('video-posy');
        const posYNum = document.getElementById('video-posy-num');
        if (posYInput) {
            posYInput.addEventListener('input', function() {
                self._videoSettings.posY = parseInt(this.value);
                if (posYNum) posYNum.value = this.value;
                self._applyVideoTransform();
            });
        }
        if (posYNum) {
            posYNum.addEventListener('change', function() {
                let val = parseInt(this.value);
                if (val < 0) val = 0;
                if (val > 100) val = 100;
                self._videoSettings.posY = val;
                this.value = val;
                if (posYInput) posYInput.value = val;
                self._applyVideoTransform();
            });
        }

        // 透明度 - 滑块和数字输入框双向同步
        const opacityInput = document.getElementById('video-opacity');
        const opacityNum = document.getElementById('video-opacity-num');
        if (opacityInput) {
            opacityInput.addEventListener('input', function() {
                self._videoSettings.opacity = parseInt(this.value);
                if (opacityNum) opacityNum.value = this.value;
                self._applyVideoTransform();
            });
        }
        if (opacityNum) {
            opacityNum.addEventListener('change', function() {
                let val = parseInt(this.value);
                if (val < 0) val = 0;
                if (val > 100) val = 100;
                self._videoSettings.opacity = val;
                this.value = val;
                if (opacityInput) opacityInput.value = val;
                self._applyVideoTransform();
            });
        }
    },

    _applyVideoTransform() {
        if (!this._videoEl) return;
        const s = this._videoSettings;
        const scale = s.scale / 100;
        const x = (s.posX - 50) * 2;  // 转换为 -100% 到 100%
        const y = (s.posY - 50) * 2;
        this._videoEl.style.transform = `translate(${x}%, ${y}%) scale(${scale})`;
        this._videoEl.style.opacity = s.opacity / 100;
    },

    _showControlPanel() {
        const section = document.getElementById('video-settings-section');
        if (section) section.style.display = 'block';
        const batchSection = document.getElementById('subtitle-batch-edit-section');
        if (batchSection) batchSection.style.display = 'block';
        this._renderSubtitleSegmentsList();
        this._initBatchEditToggle();
    },

    _hideControlPanel() {
        const section = document.getElementById('video-settings-section');
        if (section) section.style.display = 'none';
        const batchSection = document.getElementById('subtitle-batch-edit-section');
        if (batchSection) batchSection.style.display = 'none';
    },

    // ========== 批量编辑区块折叠功能 ==========
    _initBatchEditToggle() {
        const header = document.querySelector('#subtitle-batch-edit-section .section-title');
        const content = document.getElementById('subtitle-batch-content');
        const arrow = document.getElementById('subtitle-batch-arrow');
        if (header && content && !header._toggleBound) {
            header._toggleBound = true;
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => {
                content.classList.toggle('collapsed');
                if (arrow) arrow.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
            });
        }
    },

    // ========== 渲染字幕段列表 ==========
    _renderSubtitleSegmentsList() {
        const container = document.getElementById('subtitle-segments-list');
        if (!container) return;

        if (state.scenes.length === 0) {
            container.innerHTML = '';
            return;
        }

        const currentScene = state.scenes[state.currentSceneIndex];
        if (!currentScene || !currentScene.videoSubtitleSegments) {
            container.innerHTML = '';
            return;
        }

        // 按开始时间排序
        const segments = [...currentScene.videoSubtitleSegments].sort((a, b) => a.startTime - b.startTime);

        container.innerHTML = segments.map((seg, index) => `
            <div class="subtitle-segment-item" data-id="${seg.id}" style="padding:8px; margin-bottom:8px; background:rgba(255,255,255,0.1); border-radius:4px;">
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <input type="text" class="seg-char-name" placeholder="角色名" value="${seg.characterName || ''}" style="flex:1; padding:4px; font-size:11px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid #555; border-radius:3px;">
                </div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <textarea class="seg-dialog-text" placeholder="对话文本" rows="2" style="flex:1; padding:4px; font-size:11px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid #555; border-radius:3px; resize:vertical;">${seg.dialogText || ''}</textarea>
                </div>
                <div style="display:flex; gap:5px; align-items:center;">
                    <input type="number" class="seg-start-time" placeholder="开始" value="${seg.startTime}" min="0" step="0.1" style="width:60px; padding:4px; font-size:11px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid #555; border-radius:3px;">
                    <span style="color:#ccc;">-</span>
                    <input type="number" class="seg-end-time" placeholder="结束" value="${seg.endTime}" min="0" step="0.1" style="width:60px; padding:4px; font-size:11px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid #555; border-radius:3px;">
                    <span style="color:#ccc; font-size:11px;">秒</span>
                    <button class="seg-delete-btn" style="margin-left:auto; padding:4px 8px; font-size:11px; background:#c44; color:#fff; border:none; border-radius:3px; cursor:pointer;">删除</button>
                </div>
            </div>
        `).join('');

        // 绑定事件
        this._bindSegmentEvents(container, currentScene);
    },

    // ========== 绑定字幕段编辑事件 ==========
    _bindSegmentEvents(container, currentScene) {
        const self = this;

        container.querySelectorAll('.subtitle-segment-item').forEach(item => {
            const id = parseInt(item.dataset.id);
            const seg = currentScene.videoSubtitleSegments.find(s => s.id === id);
            if (!seg) return;

            // 角色名变更
            const charNameInput = item.querySelector('.seg-char-name');
            if (charNameInput) {
                charNameInput.addEventListener('change', function() {
                    seg.characterName = this.value;
                });
            }

            // 对话文本变更
            const dialogTextInput = item.querySelector('.seg-dialog-text');
            if (dialogTextInput) {
                dialogTextInput.addEventListener('change', function() {
                    seg.dialogText = this.value;
                });
            }

            // 开始时间变更
            const startInput = item.querySelector('.seg-start-time');
            if (startInput) {
                startInput.addEventListener('change', function() {
                    const newStart = parseFloat(this.value);
                    const endTime = parseFloat(item.querySelector('.seg-end-time')?.value || seg.endTime);
                    if (isNaN(newStart) || newStart >= endTime) {
                        alert('开始时间必须小于结束时间');
                        this.value = seg.startTime;
                        return;
                    }
                    // 检查时间冲突
                    if (self._checkTimeConflict(newStart, endTime, id)) {
                        alert('该时间段与现有字幕段有重叠');
                        this.value = seg.startTime;
                        return;
                    }
                    seg.startTime = newStart;
                });
            }

            // 结束时间变更
            const endInput = item.querySelector('.seg-end-time');
            if (endInput) {
                endInput.addEventListener('change', function() {
                    const newEnd = parseFloat(this.value);
                    const startTime = parseFloat(item.querySelector('.seg-start-time')?.value || seg.startTime);
                    if (isNaN(newEnd) || newEnd <= startTime) {
                        alert('结束时间必须大于开始时间');
                        this.value = seg.endTime;
                        return;
                    }
                    // 检查时间冲突
                    if (self._checkTimeConflict(startTime, newEnd, id)) {
                        alert('该时间段与现有字幕段有重叠');
                        this.value = seg.endTime;
                        return;
                    }
                    seg.endTime = newEnd;
                });
            }

            // 删除按钮
            const deleteBtn = item.querySelector('.seg-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function() {
                    if (confirm('确定要删除这个字幕段吗？')) {
                        currentScene.videoSubtitleSegments = currentScene.videoSubtitleSegments.filter(s => s.id !== id);
                        self._renderSubtitleSegmentsList();
                    }
                });
            }
        });
    },

    // ========== 添加新字幕段 ==========
    _addNewSubtitleSegment() {
        if (state.scenes.length === 0) return;
        const currentScene = state.scenes[state.currentSceneIndex];
        if (!currentScene) return;

        // 确保数组存在
        if (!currentScene.videoSubtitleSegments) {
            currentScene.videoSubtitleSegments = [];
        }

        // 获取角色名初始值
        const initialCharName = elements.characterName ? elements.characterName.value : '???';

        const newSegment = {
            id: Date.now(),
            startTime: 0,
            endTime: 5,
            characterName: initialCharName,
            dialogText: '',
            commanderText: '',
            formatRuns: null
        };

        currentScene.videoSubtitleSegments.push(newSegment);
        this._renderSubtitleSegmentsList();
    },

    // ========== 字幕轨功能 ==========
    _initSubtitleOverlay() {
        // 创建字幕覆盖层 - 位于对话框上方，不影响角色名称输入
        const overlay = document.createElement('div');
        overlay.id = 'video-subtitle-overlay';
        overlay.className = 'video-subtitle-overlay';
        // 位置在对话框上方 (bottom: 180px)，避免与角色名称和对话输入框重叠
        overlay.style.cssText = 'position:absolute; bottom:180px; left:50%; transform:translateX(-50%); padding:8px 16px; background:rgba(0,0,0,0.7); color:#fff; font-size:16px; border-radius:4px; pointer-events:none; z-index:55; display:none; max-width:80%; text-align:center; white-space:nowrap;';

        const previewContainer = document.getElementById('preview-container');
        if (previewContainer) {
            previewContainer.appendChild(overlay);
            this._subtitleOverlay = overlay;
        }
    },

    _addSubtitle() {
        const startInput = document.getElementById('subtitle-start');
        const endInput = document.getElementById('subtitle-end');
        const textInput = document.getElementById('subtitle-text');

        const start = parseFloat(startInput?.value || 0);
        const end = parseFloat(endInput?.value || 0);
        const text = textInput?.value?.trim() || '';

        if (end <= start || !text) {
            alert('请检查时间设置（结束时间必须大于开始时间）并输入字幕内容');
            return;
        }

        const subtitle = {
            id: Date.now(),
            startTime: start,
            endTime: end,
            text: text
        };

        this._subtitles.push(subtitle);
        this._subtitles.sort((a, b) => a.startTime - b.startTime);
        this._renderSubtitleList();

        // 清空输入
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        if (textInput) textInput.value = '';
    },

    _renderSubtitleList() {
        const listEl = document.getElementById('subtitle-list');
        if (!listEl) return;

        listEl.innerHTML = this._subtitles.map((sub, index) => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:4px; background:rgba(255,255,255,0.1); margin-bottom:4px; border-radius:3px; font-size:11px; color:#fff;">
                <span>${this.formatTime(sub.startTime)} - ${this.formatTime(sub.endTime)}: ${sub.text.substring(0, 20)}${sub.text.length > 20 ? '...' : ''}</span>
                <button onclick="VideoBgManager._deleteSubtitle(${sub.id})" style="background:#c44; color:#fff; border:none; border-radius:3px; padding:2px 6px; cursor:pointer; font-size:10px;">删除</button>
            </div>
        `).join('');
    },

    _deleteSubtitle(id) {
        this._subtitles = this._subtitles.filter(s => s.id !== id);
        this._renderSubtitleList();
    },

    // ========== 同步对话框到视频时间 ==========
    _syncDialogToVideoTime(currentTime) {
        if (state.scenes.length === 0) return;
        const currentScene = state.scenes[state.currentSceneIndex];
        if (!currentScene || !currentScene.videoSubtitleSegments) return;

        // 按开始时间排序
        const segments = [...currentScene.videoSubtitleSegments].sort((a, b) => a.startTime - b.startTime);

        // 查找当前视频时间匹配的时间段
        const matchedSegment = segments.find(
            s => currentTime >= s.startTime && currentTime <= s.endTime
        );

        if (matchedSegment) {
            // 找到匹配段，设置输入框内容
            if (elements.characterName) elements.characterName.value = matchedSegment.characterName || '???';
            if (elements.dialogInput) elements.dialogInput.value = matchedSegment.dialogText || '';
            if (elements.commanderText) elements.commanderText.value = matchedSegment.commanderText || '';
            // 显示指挥官对话框
            if (elements.commanderDialog) elements.commanderDialog.style.display = 'block';
        } else {
            // 未找到匹配段，重置输入框
            if (elements.characterName) elements.characterName.value = '???';
            if (elements.dialogInput) elements.dialogInput.value = '';
            if (elements.commanderText) elements.commanderText.value = '';
            // 隐藏指挥官对话框
            if (elements.commanderDialog) elements.commanderDialog.style.display = 'none';
        }
    },

    // ========== 时间冲突检测 ==========
    _checkTimeConflict(newStart, newEnd, excludeId = null) {
        if (state.scenes.length === 0) return false;
        const currentScene = state.scenes[state.currentSceneIndex];
        if (!currentScene || !currentScene.videoSubtitleSegments) return false;

        const conflict = currentScene.videoSubtitleSegments.find(s => {
            if (excludeId && s.id === excludeId) return false;
            // 重叠判断：新段的开始时间小于现有段的结束时间，且新段的结束时间大于现有段的开始时间
            return newStart < s.endTime && newEnd > s.startTime;
        });

        return !!conflict;
    },

    // ========== 保存当前段 ==========
    _saveCurrentSegment() {
        if (state.scenes.length === 0) return;
        const currentScene = state.scenes[state.currentSceneIndex];
        if (!currentScene) return;

        // 读取当前输入框值和时间设置
        const characterName = elements.characterName ? elements.characterName.value.trim() : '???';
        const dialogText = elements.dialogInput ? elements.dialogInput.value.trim() : '';
        const commanderText = elements.commanderText ? elements.commanderText.value.trim() : '';
        const startInput = document.getElementById('subtitle-start');
        const endInput = document.getElementById('subtitle-end');

        const startTime = parseFloat(startInput?.value || 0);
        const endTime = parseFloat(endInput?.value || 0);

        // 验证时间
        if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
            alert('请设置有效的开始和结束时间（结束时间必须大于开始时间）');
            return;
        }

        // 检查时间冲突
        if (this._checkTimeConflict(startTime, endTime)) {
            alert('该时间段与现有字幕段有重叠，请调整时间');
            return;
        }

        // 确保数组存在
        if (!currentScene.videoSubtitleSegments) {
            currentScene.videoSubtitleSegments = [];
        }

        // 检查是否已存在相同时间段的段（更新现有段）
        const existingIndex = currentScene.videoSubtitleSegments.findIndex(
            s => s.startTime === startTime && s.endTime === endTime
        );

        const segment = {
            id: existingIndex >= 0 ? currentScene.videoSubtitleSegments[existingIndex].id : Date.now(),
            startTime: startTime,
            endTime: endTime,
            characterName: characterName,
            dialogText: dialogText,
            commanderText: commanderText,
            formatRuns: null // 格式记录，可后续扩展
        };

        if (existingIndex >= 0) {
            // 更新现有段
            currentScene.videoSubtitleSegments[existingIndex] = segment;
        } else {
            // 添加新段
            currentScene.videoSubtitleSegments.push(segment);
        }

        // 清空对话框准备下一段输入
        if (elements.characterName) elements.characterName.value = '???';
        if (elements.dialogInput) elements.dialogInput.value = '';
        if (elements.commanderText) elements.commanderText.value = '';
        if (elements.commanderDialog) elements.commanderDialog.style.display = 'none';

        alert('字幕段已保存');
    },

    // ========== 初始化确定按钮和回车键支持 ==========
    _initSaveSegmentControls() {
        // 创建确定按钮
        const panel = this._controlPanel;
        if (!panel) return;

        // 检查是否已存在确定按钮
        if (document.getElementById('subtitle-save-btn')) return;

        const timeSection = panel.querySelector('div[style*="border-top:1px solid #444"]');
        if (timeSection) {
            const saveBtn = document.createElement('button');
            saveBtn.id = 'subtitle-save-btn';
            saveBtn.textContent = '确定';
            saveBtn.style.cssText = 'margin-top:8px; padding:6px 16px; font-size:12px; background:#4a9; color:#fff; border:none; border-radius:4px; cursor:pointer; width:100%;';
            saveBtn.addEventListener('click', () => this._saveCurrentSegment());
            timeSection.appendChild(saveBtn);
        }

        // 为时间输入框添加回车键支持
        const startInput = document.getElementById('subtitle-start');
        const endInput = document.getElementById('subtitle-end');

        const handleEnterKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._saveCurrentSegment();
            }
        };

        if (startInput) startInput.addEventListener('keydown', handleEnterKey);
        if (endInput) endInput.addEventListener('keydown', handleEnterKey);

        // 绑定添加新段按钮事件
        const addBtn = document.getElementById('add-subtitle-segment-btn');
        if (addBtn && !addBtn._bound) {
            addBtn._bound = true;
            addBtn.addEventListener('click', () => this._addNewSubtitleSegment());
        }
    },

    // 获取字幕数据（用于保存场景）
    getSubtitles() {
        return [...this._subtitles];
    },

    // 设置字幕数据（用于加载场景）
    setSubtitles(subtitles) {
        this._subtitles = subtitles || [];
        this._renderSubtitleList();
    },

    // 获取视频设置（用于保存场景）
    getVideoSettings() {
        return { ...this._videoSettings };
    },

    // 设置视频设置（用于加载场景）
    setVideoSettings(settings) {
        if (settings) {
            this._videoSettings = { ...this._videoSettings, ...settings };
            // 更新 UI
            const scaleInput = document.getElementById('video-scale');
            const scaleNum = document.getElementById('video-scale-num');
            const posXInput = document.getElementById('video-posx');
            const posXNum = document.getElementById('video-posx-num');
            const posYInput = document.getElementById('video-posy');
            const posYNum = document.getElementById('video-posy-num');
            const opacityInput = document.getElementById('video-opacity');
            const opacityNum = document.getElementById('video-opacity-num');

            if (scaleInput) scaleInput.value = this._videoSettings.scale;
            if (scaleNum) scaleNum.value = this._videoSettings.scale;
            if (posXInput) posXInput.value = this._videoSettings.posX;
            if (posXNum) posXNum.value = this._videoSettings.posX;
            if (posYInput) posYInput.value = this._videoSettings.posY;
            if (posYNum) posYNum.value = this._videoSettings.posY;
            if (opacityInput) opacityInput.value = this._videoSettings.opacity;
            if (opacityNum) opacityNum.value = this._videoSettings.opacity;
            this._applyVideoTransform();
        }
    }
};

// 处理角色上传
function handleCharacterUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const character = {
            id: Date.now(),
            name: file.name.replace(/\.[^/.]+$/, ''),
            url: e.target.result
        };
        state.uploadedCharacters.push(character);
        renderCharacterList();
        
        // 自动添加到当前场景
        toggleCharacterSelection(character);
        if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
    };
    reader.readAsDataURL(file);
}

// 渲染背景列表
function renderBackgroundList() {
    elements.backgroundList.innerHTML = '';
	    
    // 添加批量应用按钮
    const batchApplyItem = document.createElement('div');
    batchApplyItem.className = 'image-grid-item batch-apply-bg';
    batchApplyItem.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 12px; text-align: center;">
            <span>批量<br>应用</span>
        </div>`;
    batchApplyItem.title = "将选定背景应用到多个场景";
    batchApplyItem.addEventListener('click', () => {
        // 弹出对话框让用户选择要更改哪些场景
        const sceneCount = state.scenes.length;
        if (sceneCount <= 1) {
            alert("只有一个场景，无法进行批量操作");
            return;
        }
	        
        const selectedScenesInput = prompt(
            `请输入要更改背景的场景编号（用逗号分隔，如：1,2,4）或范围（如：1-5），\n或者输入 "all" 更改所有场景的背景：`,
            ""
        );
	        
        if (!selectedScenesInput) return;
	        
        let selectedIndices = [];
        if (selectedScenesInput.toLowerCase() === 'all') {
            // 选择所有场景
            selectedIndices = Array.from({ length: sceneCount }, (_, i) => i);
        } else {
            // 解析用户输入
            try {
                selectedIndices = parseSceneRange(selectedScenesInput, sceneCount);
            } catch (e) {
                alert(e.message);
                return;
            }
        }
	        
        if (selectedIndices.length === 0) {
            alert("没有有效的场景编号");
            return;
        }
	        
        // 再次确认用户的选择
        const confirmMsg = `确定要将当前选中的背景应用到以下场景吗？\n场景: ${selectedIndices.map(i => i + 1).join(', ')}`;
        if (!confirm(confirmMsg)) return;
	        
        // 获取当前选中的背景
        const selectedBgItems = elements.backgroundList.querySelectorAll('.image-grid-item.selected:not(.batch-apply-bg)');
        if (selectedBgItems.length === 0) {
            alert("请先选择一个背景");
            return;
        }
	        
        const selectedBgUrl = selectedBgItems[0].querySelector('img').src;

        // 查找选中的背景对象以获取 isVideo 信息
        let selectedBgObj = null;
        for (const bg of state.backgrounds) {
            if (bg.url === selectedBgUrl) { selectedBgObj = bg; break; }
        }
        
        // 应用背景到所选场景
        for (const index of selectedIndices) {
            if (index >= 0 && index < state.scenes.length) {
                state.scenes[index].background = selectedBgUrl;
                state.scenes[index].backgroundIsVideo = !!(selectedBgObj && selectedBgObj.isVideo);
            }
        }
	        
        // 更新预览和界面
        updatePreview();
        renderBackgroundList();
        alert(`已成功将背景应用到 ${selectedIndices.length} 个场景`);
    });
    elements.backgroundList.appendChild(batchApplyItem);
	    
    state.backgrounds.forEach((bg) => {
        const item = document.createElement('div');
        item.className = 'image-grid-item';
	        
        const currentScene = state.scenes[state.currentSceneIndex];
        if (currentScene && currentScene.background === bg.url) {
            item.classList.add('selected');
        }
	        
        // 检查是否为默认背景，只有非默认背景才显示删除按钮
        const isDefaultBg = state.defaultBackgrounds.some(defaultBg => defaultBg.url === bg.url);
	        
        item.innerHTML = `<img src="${bg.url}" alt="${bg.name}">${!isDefaultBg ? '<button class="delete-btn" style="position:absolute;top:2px;right:2px;background:red;color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;line-height:16px;text-align:center;cursor:pointer;">×</button>' : ''}`;
	        
        // 添加删除按钮事件监听器
        if (!isDefaultBg) {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-btn')) {
                    e.stopPropagation(); // 阻止冒泡到父级点击事件
                    deleteBackground(bg, true); // 调用统一的删除函数
                } else {
                    // 原来的点击事件逻辑
                    if (state.scenes.length > 0) {
                        state.scenes[state.currentSceneIndex].background = bg.url;
                        state.scenes[state.currentSceneIndex].backgroundIsVideo = !!bg.isVideo;
                        renderBackgroundList();
                        updatePreview();
                        // 如果正在编辑已加载的快照，标记为已修改
                        if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
                    }
                }
            });
	            
            // 右键菜单事件
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault(); // 阻止默认右键菜单
                deleteBackground(bg, false); // 调用统一的删除函数，不显示删除按钮
            });
        } else {
            // 默认背景只响应选择事件
            item.addEventListener('click', () => {
                if (state.scenes.length > 0) {
                    state.scenes[state.currentSceneIndex].background = bg.url;
                    state.scenes[state.currentSceneIndex].backgroundIsVideo = !!bg.isVideo;
                    renderBackgroundList();
                    updatePreview();
                    // 如果正在编辑已加载的快照，标记为已修改
                    if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
                }
            });
        }
        elements.backgroundList.appendChild(item);
    });
}
	
// 删除背景的通用函数
function deleteBackground(bg, showConfirm) {
    const shouldDelete = showConfirm ? confirm(`确定要删除背景 "${bg.name}" 吗？`) : true;
    if (shouldDelete) {
        // 从state.backgrounds中移除该背景
        const bgIndex = state.backgrounds.findIndex(b => b.id === bg.id);
        if (bgIndex !== -1) {
            state.backgrounds.splice(bgIndex, 1);
            renderBackgroundList();
            // 如果当前场景使用的是被删除的背景，将其设为null
            if (state.scenes[state.currentSceneIndex] && 
                state.scenes[state.currentSceneIndex].background === bg.url) {
                state.scenes[state.currentSceneIndex].background = null;
            }
            updatePreview();
        }
    }
}
	
// 解析场景范围字符串，例如 "1,2,4" 或 "1-5"
function parseSceneRange(input, maxCount) {
    const indices = new Set();
    const parts = input.split(',');
	    
    for (const part of parts) {
        const trimmedPart = part.trim();
        if (trimmedPart.includes('-')) {
            // 处理范围，如 "1-5"
            const rangeParts = trimmedPart.split('-').map(p => p.trim());
            if (rangeParts.length !== 2) {
                throw new Error(`无效的范围格式: ${trimmedPart}`);
            }
	            
            const start = parseInt(rangeParts[0]) - 1; // 用户输入从1开始，内部索引从0开始
            const end = parseInt(rangeParts[1]) - 1;
	            
            if (isNaN(start) || isNaN(end) || start < 0 || end >= maxCount || start > end) {
                throw new Error(`无效的范围: ${trimmedPart} (有效范围: 1-${maxCount})`);
            }
	            
            for (let i = start; i <= end; i++) {
                indices.add(i);
            }
        } else {
            // 处理单个数字
            const num = parseInt(trimmedPart) - 1; // 用户输入从1开始，内部索引从0开始
            if (isNaN(num) || num < 0 || num >= maxCount) {
                throw new Error(`无效的场景编号: ${trimmedPart} (有效范围: 1-${maxCount})`);
            }
            indices.add(num);
        }
    }
	    
    return Array.from(indices).sort((a, b) => a - b);
}

// 渲染角色列表
function renderCharacterList() {
    const html = state.uploadedCharacters.map(char => {
        // 检查是否为默认角色，只有非默认角色才显示删除按钮
        const isDefaultChar = state.defaultCharacters.some(defaultChar => defaultChar.url === char.url);
	        
        return `
        <div class="image-grid-item" data-char-id="${char.id}">
            <img src="${char.url}" alt="${char.name}">
            ${!isDefaultChar ? '<button class="delete-btn" style="position:absolute;top:2px;right:2px;background:red;color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;line-height:16px;text-align:center;cursor:pointer;">×</button>' : ''}
        </div>`;
    }).join('');
	    
    elements.leftCharacterList.innerHTML = html;
    elements.rightCharacterList.innerHTML = html;
	    
    // 为左右两侧的角色列表添加点击事件（包括删除按钮）
    addCharacterListEventListeners(elements.leftCharacterList);
    addCharacterListEventListeners(elements.rightCharacterList);
	    
    // 更新选中状态
    updateCharacterListSelection();
}
	
// 为角色列表添加事件监听器
function addCharacterListEventListeners(listElement) {
    [...listElement.children].forEach((item, index) => {
        const char = state.uploadedCharacters[index];
        const isDefaultChar = state.defaultCharacters.some(defaultChar => defaultChar.url === char.url);
	        
        if (!isDefaultChar) {
            // 非默认角色：处理删除按钮和选择事件
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-btn')) {
                    e.stopPropagation(); // 阻止冒泡到父级点击事件
                    deleteCharacter(char, true); // 调用统一的删除函数
                } else {
                    // 原来的选择逻辑
                    toggleCharacterSelection(state.uploadedCharacters[index]);
                }
            });
	            
            // 右键菜单事件
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault(); // 阻止默认右键菜单
                deleteCharacter(char, false); // 调用统一的删除函数，不显示删除按钮
            });
        } else {
            // 默认角色：只处理选择事件
            item.addEventListener('click', () => {
                toggleCharacterSelection(state.uploadedCharacters[index]);
            });
        }
    });
}
	
// 删除角色的通用函数
function deleteCharacter(char, showConfirm) {
    const shouldDelete = showConfirm ? confirm(`确定要删除角色 "${char.name}" 吗？`) : true;
    if (shouldDelete) {
        // 从state.uploadedCharacters中移除该角色
        const charIndex = state.uploadedCharacters.findIndex(c => c.id === char.id);
        if (charIndex !== -1) {
            state.uploadedCharacters.splice(charIndex, 1);
            renderCharacterList();
            // 如果当前场景中有这个角色，也需要从场景中移除
            if (state.scenes[state.currentSceneIndex]) {
                state.scenes[state.currentSceneIndex].characters = 
                    state.scenes[state.currentSceneIndex].characters.filter(c => c.image !== char.url);
                updatePreview();
            }
        }
    }
}

// 切换角色选择状态
function toggleCharacterSelection(character) {
    if (state.scenes.length === 0) return;
    
    const currentScene = state.scenes[state.currentSceneIndex];
    const exists = currentScene.characters.find(c => c.image === character.url);
    
    if (exists) {
        // 取消选择
        currentScene.characters = currentScene.characters.filter(c => c.image !== character.url);
    } else {
        // 选择角色
        currentScene.characters.push({
            name: character.name,
            image: character.url,
            id: Date.now()
        });
    }
    
    updatePreview();
    updateCharacterListSelection();
    // 标记已修改（如果是在编辑已加载的快照）
    if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
}

// 更新角色列表的选中状态
function updateCharacterListSelection() {
    if (state.scenes.length === 0) return;
    
    const currentScene = state.scenes[state.currentSceneIndex];
    
    [...elements.leftCharacterList.children].forEach((item, index) => {
        const char = state.uploadedCharacters[index];
        const isSelected = currentScene.characters.find(c => c.image === char.url);
        if (isSelected) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    [...elements.rightCharacterList.children].forEach((item, index) => {
        const char = state.uploadedCharacters[index];
        const isSelected = currentScene.characters.find(c => c.image === char.url);
        if (isSelected) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

// 更新预览
function updatePreview() {
    if (state.scenes.length === 0) {
        elements.previewBackground.style.backgroundImage = '';
        elements.characterLayer.innerHTML = '';
        VideoBgManager.hideVideo();
        return;
    }
    
    const currentScene = state.scenes[state.currentSceneIndex];
    
    // 更新背景（支持视频和图片）
    if (currentScene.background) {
        if (currentScene.backgroundIsVideo) {
            // 视频背景：隐藏 backgroundImage，使用 <video> 元素
            elements.previewBackground.style.backgroundImage = '';
            VideoBgManager.setVideoSrc(currentScene.background);
        } else {
            // 图片背景：正常显示，关闭视频
            VideoBgManager.hideVideo();
            elements.previewBackground.style.backgroundImage = `url(${currentScene.background})`;
        }
    } else {
        elements.previewBackground.style.backgroundImage = '';
        VideoBgManager.hideVideo();
    }
    
    // 更新角色
    elements.characterLayer.innerHTML = '';
    const charCount = currentScene.characters.length;

    currentScene.characters.forEach((char, index) => {
        const charDiv = document.createElement('div');
        charDiv.className = 'character-sprite';

        // 根据角色数量设置位置
        if (charCount === 1) {
            // 单个角色居中
            charDiv.classList.add('single');
            charDiv.style.left = '50%';
            charDiv.style.transform = 'translateX(-50%)';
        } else if (charCount === 2) {
            // 两个角色分开
            if (index === 0) {
                // 第一个角色
                charDiv.classList.add('first');
                charDiv.style.left = '20%';
            } else {
                // 第二个角色
                charDiv.classList.add('second');
                charDiv.style.left = '70%';
            }
        } else if (charCount === 3) {
            // 三个角色分别设置位置
            if (index === 0) {
                // 第一个角色
                charDiv.classList.add('first');
                charDiv.style.left = '15%';
            } else if (index === 1) {
                // 第二个角色
                charDiv.classList.add('second');
                charDiv.style.left = '50%';
            } else {
                // 第三个角色
                charDiv.classList.add('third');
                charDiv.style.left = '60%';
            }
        }
        
        charDiv.innerHTML = `<img src="${char.image}" alt="${char.name}">`;
        elements.characterLayer.appendChild(charDiv);
    });
    
    // 更新指挥官对话框文本
    elements.commanderText.value = currentScene.commanderText || '';
    
    // 根据模式分别控制对话框显示
    const isMingMode = document.body.classList.contains('ming-active');
    if (isMingMode) {
        // 鸣潮模式：使用独立的显示状态
        const shouldShow = currentScene.mingCommanderDialogVisible || (currentScene.commanderText && currentScene.commanderText.trim().length > 0);
        elements.commanderDialog.style.display = shouldShow ? 'flex' : 'none';
    } else {
        // 战双模式：使用独立的显示状态
        const shouldShow = currentScene.commanderDialogVisible || (currentScene.commanderText && currentScene.commanderText.trim().length > 0);
        elements.commanderDialog.style.display = shouldShow ? 'flex' : 'none';
    }
    
    // 更新对话框
    updateDialogDisplay();
}

// 更新对话框显示
function updateDialogDisplay() {
    const currentScene = state.scenes[state.currentSceneIndex];
    const hasSavedDialog = currentScene.dialogs.length > 0 && currentScene.currentDialogIndex < currentScene.dialogs.length;

    if (hasSavedDialog) {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex];
        elements.characterName.value = dialog.character || '???';
        adjustCharacterNamePosition();
        // 显示已保存的对话文本，并清除未保存标记
        elements.dialogInput.value = dialog.text || '';
        state.isTypingUnsaved = false;
        // 恢复/刷新接下来的文本格式覆盖层（无 nextFormat 时也会正确隐藏）
        updateFormattedOverlay();
    } else {
        elements.characterName.value = '???';
        adjustCharacterNamePosition();
        // 仅在用户当前没有未保存输入时才清空输入框，避免切换角色/背景时覆盖用户正在输入的文本
        if (!state.isTypingUnsaved) {
            elements.dialogInput.value = '';
        }
        // 无已保存对话时可能仍有 scene.pendingFormatRuns，需由此统一刷新覆盖层
        updateFormattedOverlay();
    }
    dialogInputPrevForRuns = elements.dialogInput.value;
}

// 添加对话
function addDialog() {
    const text = elements.dialogInput.value.trim();
    const name = elements.characterName.value.trim();
    
    if (!text) return;
    
    if (state.scenes.length === 0) {
        createScene();
    }
    
    const currentScene = state.scenes[state.currentSceneIndex];
    migrateSceneLegacyPending(currentScene);
    const gc = state.textFormatting.dialog.color;
    const gs = state.textFormatting.dialog.fontSize;

    if (currentScene.currentDialogIndex < currentScene.dialogs.length) {
        const prev = currentScene.dialogs[currentScene.currentDialogIndex];
        migrateDialogFormatFields(prev);
        let runs = [...(prev.formatRuns || [])];
        if (currentScene.pendingFormatRuns && currentScene.pendingFormatRuns.length) {
            runs = mergeAdjacentSameFormatRuns(runs.concat(currentScene.pendingFormatRuns));
        }
        runs = mergeAdjacentSameFormatRuns(
            clampFormatRunsForText(runs, text.length)
        ).filter(r => runHasEffect(r, gc, gs));
        currentScene.dialogs[currentScene.currentDialogIndex] = {
            character: name,
            text: text,
            formatRuns: runs
        };
        delete currentScene.pendingFormatRuns;
        delete currentScene.pendingNextFormat;
    } else {
        const runs = mergeAdjacentSameFormatRuns(
            clampFormatRunsForText(currentScene.pendingFormatRuns || [], text.length)
        ).filter(r => runHasEffect(r, gc, gs));
        currentScene.dialogs.push({
            character: name,
            text: text,
            formatRuns: runs
        });
        delete currentScene.pendingFormatRuns;
        delete currentScene.pendingNextFormat;
        currentScene.currentDialogIndex = currentScene.dialogs.length - 1;
    }

    elements.dialogInput.value = '';
    dialogInputPrevForRuns = '';
    state.isTypingUnsaved = false;
    if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
}

// 下一句 - 保存当前画面到栈，仅重置对话文本（与 handleNextLine 逻辑一致）
function nextDialog() {
    if (typeof window.logAction === 'function') window.logAction('点击下一句', { 场景: state.currentSceneIndex + 1, 总场景: state.scenes.length });
    if (state.scenes.length === 0) return;

    // 记录输入框中的文本
    const inputText = elements.dialogInput.value.trim();
    console.log('nextDialog调用，输入框文本:', inputText);

    // 压入栈：保存当前画面（backgroundImage, characterImages, characterName, dialogueText 等）
    const snapshot = cloneStateWithCurrentInput();
    console.log('快照已保存，快照中的dialogs:', snapshot.scenes[snapshot.currentSceneIndex].dialogs);
    state.savedScenes.push(snapshot);

    // 保存当前对话到当前场景（如果输入框有文本）
    addDialog();

    // 当前场景已包含保存的对话，接着创建一个新场景（保留背景与角色，但清空 dialogs），并切换到该场景
    const newScene = duplicateCurrentSceneForNextLine();

    // 只重置对话文本为初始状态
    elements.dialogInput.value = '';
    updateDialogDisplay();
    updatePreview();
    // 更新计数以反映新增的暂存
    updateSceneCount();
}

// 上一句对话
function previousDialog() {
    if (state.scenes.length === 0) return;
    
    const currentScene = state.scenes[state.currentSceneIndex];
    if (currentScene.currentDialogIndex > 0) {
        currentScene.currentDialogIndex--;
        updateDialogDisplay();
    }
}

// 下一幕 - 保存到栈，重置对话+背景+角色，切换到全新场景
function nextScene() {
    if (typeof window.logAction === 'function') window.logAction('点击下一幕', { 场景: state.currentSceneIndex + 1 });
    // 先保存当前状态到历史快照栈（包含输入框中的未保存内容）
    state.savedScenes.push(cloneStateWithCurrentInput());

    // 保存当前对话到当前场景
    addDialog();
    
    // 创建新场景（重置背景和角色）
    createScene();
    
    elements.characterName.value = '???';
    adjustCharacterNamePosition();
    elements.dialogInput.value = '';
    elements.commanderText.value = '';

    updatePreview();
    renderBackgroundList();
    updateCharacterListSelection();
    updateDialogDisplay();
    // 更新计数以反映新增的暂存
    updateSceneCount();
}

// 切换指挥官/漂泊者对话框显示/隐藏
function toggleCommanderDialog() {
    const currentScene = state.scenes[state.currentSceneIndex];
    if (!currentScene) return;

    const isMingMode = document.body.classList.contains('ming-active');
    const isVisible = elements.commanderDialog.style.display !== 'none';

    if (!isVisible) {
        // 显示对话框：聚焦到输入框
        elements.commanderDialog.style.display = 'flex';
        elements.commanderText.focus();
        // 根据模式存储独立的显示状态
        if (isMingMode) {
            currentScene.mingCommanderDialogVisible = true;
        } else {
            currentScene.commanderDialogVisible = true;
        }
    } else {
        // 隐藏对话框：清空当前场景的指挥官文本
        elements.commanderDialog.style.display = 'none';
        currentScene.commanderText = '';
        elements.commanderText.value = '';
        // 根据模式存储独立的显示状态
        if (isMingMode) {
            currentScene.mingCommanderDialogVisible = false;
        } else {
            currentScene.commanderDialogVisible = false;
        }
    }
}

// 撤回 - 从历史栈弹出并恢复上一场景全部状态
function undoLastDialog() {
    if (typeof window.logAction === 'function') window.logAction('撤回操作', { 历史栈长度: state.savedScenes.length });
    if (state.savedScenes.length === 0) return;
    
    const snapshot = state.savedScenes.pop();
    restoreState(snapshot);
    
    updateSceneCount();
    updatePreview();
    updateDialogDisplay();
    renderBackgroundList();
    updateCharacterListSelection();
}

// 全部撤回 - 撤销所有历史快照并恢复到最初状态
function clearHistoryStack() {
    if (!state.savedScenes || state.savedScenes.length === 0) return;
    // 直接清空所有暂存快照与备份（不恢复任何快照）
    state.savedScenes = [];
    for (const k in savedSnapshotBackups) delete savedSnapshotBackups[k];

    // 重置当前场景的对话和指挥官文本为初始空状态
    if (state.scenes && state.scenes.length > 0) {
        const cur = state.scenes[state.currentSceneIndex] || state.scenes[0];
        if (cur) {
            cur.dialogs = [];
            cur.currentDialogIndex = 0;
            cur.commanderText = '';
        }
    } else {
        // 如果没有主场景，创建一个空场景
        createScene();
    }

    // 清空输入框和角色名，恢复初始状态
    if (elements.dialogInput) elements.dialogInput.value = '';
    if (elements.characterName) elements.characterName.value = '???';
    adjustCharacterNamePosition();
    if (elements.commanderText) elements.commanderText.value = '';
    state.isTypingUnsaved = false;

    closeModal();
    updateSceneCount();
    updatePreview();
    updateDialogDisplay();
    renderBackgroundList();
    updateCharacterListSelection();
    alert('全部撤回完成，暂存已清空并重置输入框');
}

// 显示暂存场景列表窗口
async function showSavedScenes() {
    if (state.savedScenes.length === 0) {
        alert('暂无暂存的场景');
        return;
    }
    const modal = document.getElementById('saved-scenes-modal');
    const list = modal.querySelector('.snapshot-list');
    list.innerHTML = '';

    // 备份原始状态以便多次恢复
    const original = cloneState();

    for (let idx = 0; idx < state.savedScenes.length; idx++) {
        const snapshot = state.savedScenes[idx];
        const sceneIdx = snapshot.currentSceneIndex;
        const item = document.createElement('div');
        item.className = 'snapshot-item';

        const thumb = document.createElement('img');
        thumb.className = 'snapshot-thumb';
        thumb.alt = `快照 ${idx + 1}`;
        item.appendChild(thumb);

	        const info = document.createElement('div');
	        info.className = 'snapshot-info';
	        const snapshotName = snapshot.name || `快照 ${idx + 1}`;
	        info.textContent = `${snapshotName} · 场景 ${sceneIdx + 1}`;
	        item.appendChild(info);

        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn btn-primary snapshot-load-btn';
        loadBtn.textContent = '加载到编辑区';

        // 重命名按钮
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-info snapshot-rename-btn';
        renameBtn.textContent = '重命名';
        
        // 复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-secondary snapshot-copy-btn';
        copyBtn.textContent = '复制画面';
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger snapshot-delete-btn';
        deleteBtn.textContent = '删除画面';

        // 加载快照到编辑区（模态保持打开）
        loadBtn.addEventListener('click', () => {
            restoreSnapshotScene(idx);
            currentLoadedSnapshotIndex = idx;
            // 标记尚未修改
            loadedSnapshotModified = false;
            updateMainSaveButtonsVisibility();
            // 所有加载按钮重新启用
            list.querySelectorAll('.snapshot-load-btn').forEach(b => b.disabled = false);
            loadBtn.disabled = true;
            closeModal();
        });

        // 重命名对应快照
        renameBtn.addEventListener('click', () => {
            const currentName = snapshot.name || `快照 ${idx + 1}`;
            const newName = prompt('请输入新的名称:', currentName);
            if (newName !== null && newName.trim() !== '') {
                // 确保快照对象有name属性
                if (!state.savedScenes[idx].hasOwnProperty('name')) {
                    state.savedScenes[idx].name = currentName;
                }
                state.savedScenes[idx].name = newName.trim();
                showSavedScenes(); // 刷新列表显示新名称
            }
        });

        // 复制对应快照
        copyBtn.addEventListener('click', () => {
            const snapshotToCopy = JSON.parse(JSON.stringify(state.savedScenes[idx]));
            // 给副本一个新的默认名称
            snapshotToCopy.name = `${snapshotToCopy.name || `快照 ${idx + 1}`}_副本`;
            state.savedScenes.push(snapshotToCopy);
            updateSceneCount();
            showSavedScenes();
            alert(`已复制画面 ${idx + 1}，新画面已添加至末尾`);
        });

        // 删除对应快照
        deleteBtn.addEventListener('click', () => {
            if (confirm('确定要删除该暂存画面？')) {
                state.savedScenes.splice(idx, 1);
                updateSceneCount();
                // 如果当前加载的快照就是删除的那一个，清空编辑区加载索引
                if (currentLoadedSnapshotIndex === idx) {
                    currentLoadedSnapshotIndex = null;
                    loadedSnapshotModified = false;
                    updateMainSaveButtonsVisibility();
                }
                showSavedScenes();
            }
        });

        item.appendChild(loadBtn);
        item.appendChild(renameBtn);
        item.appendChild(copyBtn);
        item.appendChild(deleteBtn);
        list.appendChild(item);

        // 生成缩略图并等待完成（恢复到 original，保持初始展示不变）
        await generateThumbnail(thumb, snapshot, original);
    }

    modal.style.display = 'flex';

    // 添加新画面按钮
    const addNewSceneBtn = document.getElementById('add-new-scene-btn');
    if (addNewSceneBtn) {
        // 移除之前的事件监听器（如果有）
        const newBtn = addNewSceneBtn.cloneNode(true);
        addNewSceneBtn.parentNode.replaceChild(newBtn, addNewSceneBtn);

        newBtn.addEventListener('click', async () => {
            // 创建初始状态的新画面
            createScene();
            const sceneIndex = state.scenes.length - 1;

            // 暂存新画面（引用state.scenes中的同一个场景对象）
            const snapshot = {
                scenes: state.scenes, // 直接引用state.scenes，确保同步
                currentSceneIndex: sceneIndex
            };
            state.savedScenes.push(snapshot);
            currentLoadedSnapshotIndex = state.savedScenes.length - 1;
            updateSceneCount();

            // 将新创建的画面加载到编辑区
            state.currentSceneIndex = sceneIndex;
            updatePreview();
            updateDialogDisplay();
            updateCharacterListSelection();
            renderBackgroundList();
            markLoadedSnapshotModified();
            updateMainSaveButtonsVisibility();

            // 刷新暂存列表
            await showSavedScenes();

            // 关闭模态框
            closeModal();

            alert('已创建并添加新画面，已加载到编辑区');
        });
    }

    // close button
    const close = modal.querySelector('.modal-close');
    close.addEventListener('click', closeModal);

    // 点击空白区域也关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// 根据快照生成预览缩略图，完成后恢复指定的原始状态
// 返回一个 Promise，以便调用方按顺序生成
function generateThumbnail(imgElement, snapshot, originalState) {
    return new Promise((resolve) => {
        // 恢复到快照状态并渲染
        restoreState(snapshot);
        updatePreview();
        // 延迟让 DOM 更新
        setTimeout(async () => {
            try {
                const canvas = await html2canvas(elements.previewContainer, { backgroundColor: '#000', scale: 0.5 });
                imgElement.src = canvas.toDataURL();
            } catch (e) {
                console.error('生成缩略图失败', e);
            }
            // 恢复传入的原始状态
            restoreState(originalState);
            updatePreview();
            resolve();
        }, 100);
    });
}

// 将指定快照中的当前场景内容应用到现有场景（不修改其它场景）并切换到该场景
function restoreSnapshotScene(index) {
    const snap = state.savedScenes[index];
    if (!snap) return;
    const sceneIdx = snap.currentSceneIndex;
    const sceneCopy = JSON.parse(JSON.stringify(snap.scenes[sceneIdx]));
    // 如果当前状态场景数量少于快照索引，则追加
    if (sceneIdx >= state.scenes.length) {
        state.scenes.push(sceneCopy);
    } else {
        state.scenes[sceneIdx] = sceneCopy;
    }
    state.currentSceneIndex = sceneIdx;
    updateSceneCount();
    updatePreview();
    updateDialogDisplay();
    renderBackgroundList();
    updateCharacterListSelection();
}

function closeModal() {
    const modal = document.getElementById('saved-scenes-modal');
    if (modal) modal.style.display = 'none';
}

// 更新主控保存按钮（靠近"查看暂存"）的显示状态
function updateMainSaveButtonsVisibility() {
    const show = currentLoadedSnapshotIndex !== null && loadedSnapshotModified;
    if (elements.saveSnapshotLeft) elements.saveSnapshotLeft.style.display = show ? 'inline-block' : 'none';
    if (elements.saveSnapshotRight) elements.saveSnapshotRight.style.display = show ? 'inline-block' : 'none';
}

// 标记当前加载的快照已被修改（由编辑操作调用）
function markLoadedSnapshotModified() {
    if (currentLoadedSnapshotIndex === null) return;
    loadedSnapshotModified = true;
    updateMainSaveButtonsVisibility();
}

// 将当前编辑区内容保存回已加载的快照并替换原快照（主控按钮操作）
async function saveLoadedSnapshot() {
    if (currentLoadedSnapshotIndex === null) {
        alert('没有加载的暂存画面可保存');
        return;
    }
    const idx = currentLoadedSnapshotIndex;
    // 备份旧快照以便回滚
    const original = JSON.parse(JSON.stringify(state.savedScenes[idx]));
    savedSnapshotBackups[idx] = original;

    // 使用当前编辑区状态（包含输入框未保存内容）生成新的快照并替换原快照位置
    const newSnap = cloneStateWithCurrentInput();
    // 保持快照中的当前场景索引为原先该快照的场景索引（如果存在）
    if (original && typeof original.currentSceneIndex === 'number') {
        newSnap.currentSceneIndex = original.currentSceneIndex;
    }
    // 替换原快照
    state.savedScenes[idx] = JSON.parse(JSON.stringify(newSnap));

    // 更新计数
    updateSceneCount();

    // 隐藏主控保存按钮
    loadedSnapshotModified = false;
    updateMainSaveButtonsVisibility();

    // 刷新暂存列表显示
    showSavedScenes();

    alert('已保存修改并替换该暂存画面');
}

// 更新折叠按钮的 title 悬停提示
function updateFoldButtonTitles() {
    elements.foldLeftBtn.title = state.leftPanelFolded ? '展开左侧面板' : '收起左侧面板';
    elements.foldRightBtn.title = state.rightPanelFolded ? '展开右侧面板' : '收起右侧面板';
}


// 生成一个初始状态的快照，用于追加新页面
function createInitialSnapshot() {
    const defaultBg = state.backgrounds.length > 0 ? state.backgrounds[0] : null;
    const newScene = {
        id: Date.now(),
        background: defaultBg ? defaultBg.url : null,
        backgroundIsVideo: !!(defaultBg && defaultBg.isVideo),
        characters: [],
        dialogs: [],
        currentDialogIndex: 0,
        commanderText: ''
    };
    return {
        scenes: [newScene],
        currentSceneIndex: 0
    };
}

// 判断给定快照是否为初始空白状态
function isInitialSnapshot(snapshot) {
    if (!snapshot || !snapshot.scenes || snapshot.scenes.length === 0) return false;
    const s = snapshot.scenes[0];
    const defaultBg = state.backgrounds.length > 0 ? state.backgrounds[0].url : null;
    const hasNoDialog = !s.dialogs || s.dialogs.length === 0;
    const hasNoChars = !s.characters || s.characters.length === 0;
    const hasNoCommander = !s.commanderText || !s.commanderText.trim();
    const bgMatches = s.background === defaultBg || s.background === null;
    return hasNoDialog && hasNoChars && hasNoCommander && bgMatches;
}

// 应用文本输入框格式化
function applyDialogFormatting() {
    const format = state.textFormatting.dialog;
    elements.dialogInput.style.color = format.color;
    elements.dialogInput.style.fontSize = format.fontSize + 'px';
    elements.dialogInput.style.fontWeight = format.fontWeight;
    elements.dialogInput.style.textAlign = format.textAlign;

    // 更新信息显示
    if (elements.dialogSizeInfo) elements.dialogSizeInfo.textContent = `大小: ${format.fontSize}px`;
    if (elements.dialogWeightInfo) elements.dialogWeightInfo.textContent = `粗细: ${format.fontWeight}`;
    if (elements.dialogAlignInfo) {
        const alignMap = { 'left': '左', 'center': '中', 'right': '右' };
        elements.dialogAlignInfo.textContent = `对齐: ${alignMap[format.textAlign]}`;
    }
    // 更新compact版本显示
    if (elements.dialogSizeValueCompact) elements.dialogSizeValueCompact.textContent = format.fontSize + 'px';

    // 更新按钮激活状态
    updateAlignButtons('dialog', format.textAlign);

    // 全局颜色变时同步更新接下来的文本显示
    updateSelFormatDisplays();

    migrateAllProjectFormatRuns();

    // 全局设置变化后重新评估覆盖层
    updateFormattedOverlay();
}

// 应用指挥官对话格式化
function applyCommanderFormatting() {
    const format = state.textFormatting.commander;
    elements.commanderText.style.color = format.color;
    elements.commanderText.style.fontSize = format.fontSize + 'px';
    elements.commanderText.style.fontWeight = format.fontWeight;
    elements.commanderText.style.textAlign = format.textAlign;

    // 更新信息显示
    if (elements.commanderSizeInfo) elements.commanderSizeInfo.textContent = `大小: ${format.fontSize}px`;
    if (elements.commanderWeightInfo) elements.commanderWeightInfo.textContent = `粗细: ${format.fontWeight}`;
    if (elements.commanderAlignInfo) {
        const alignMap = { 'left': '左', 'center': '中', 'right': '右' };
        elements.commanderAlignInfo.textContent = `对齐: ${alignMap[format.textAlign]}`;
    }
    // 更新compact版本显示
    if (elements.commanderSizeValueCompact) elements.commanderSizeValueCompact.textContent = format.fontSize + 'px';

    // 更新按钮激活状态
    updateAlignButtons('commander', format.textAlign);
}

// ============ 选中文本格式相关函数 ============

// HTML转义
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 根据 formatRuns 多段样式构建覆盖层 HTML（全局样式由 overlay 基底承担）
function buildFormattedHTMLFromRuns(text, formatRuns) {
    const gc = state.textFormatting.dialog.color;
    const gs = state.textFormatting.dialog.fontSize;
    const clamped = clampFormatRunsForText(formatRuns || [], text.length);
    const sorted = clamped.filter((r, i) => runHasEffect(r, gc, gs) || isFormatBoundaryRun(r, clamped[i - 1], gc, gs));
    if (!sorted.length) return escapeHtml(text);
    let html = '';
    let pos = 0;
    for (let k = 0; k < sorted.length; k++) {
        const r = sorted[k];
        const rangeEnd = k + 1 < sorted.length ? sorted[k + 1].start : text.length;
        if (pos < r.start) {
            html += escapeHtml(text.substring(pos, r.start));
        }
        const segEnd = Math.min(rangeEnd, text.length);
        if (r.start < segEnd) {
            const styles = [];
            if (r.color && !colorsEqual(r.color, gc)) styles.push(`color:${r.color}`);
            if (r.fontSize && r.fontSize !== gs) styles.push(`font-size:${r.fontSize}px`);
            const chunk = text.substring(r.start, segEnd);
            if (styles.length) {
                html += `<span style="${styles.join(';')}">${escapeHtml(chunk)}</span>`;
            } else {
                html += escapeHtml(chunk);
            }
        }
        pos = segEnd;
    }
    if (pos < text.length) {
        html += escapeHtml(text.substring(pos));
    }
    return html;
}

// 更新格式化预览覆盖层
function updateFormattedOverlay() {
    const overlay = elements.dialogFormattedOverlay;
    if (!overlay) return;
    const text = elements.dialogInput.value || '';
    const gc = state.textFormatting.dialog.color;
    const gs = state.textFormatting.dialog.fontSize;
    const runsAll = getFormatRunsForOverlay();
    const clampedRuns = clampFormatRunsForText(runsAll, text.length);
    const effective = clampedRuns.filter((r, i) => runHasEffect(r, gc, gs) || isFormatBoundaryRun(r, clampedRuns[i - 1], gc, gs));

    if (effective.length > 0) {
        overlay.style.color = gc;
        overlay.style.fontSize = gs + 'px';
        overlay.style.fontWeight = state.textFormatting.dialog.fontWeight;
        overlay.style.textAlign = state.textFormatting.dialog.textAlign;
        overlay.style.lineHeight = getComputedStyle(elements.dialogInput).lineHeight;
        overlay.style.fontFamily = getComputedStyle(elements.dialogInput).fontFamily;

        overlay.innerHTML = buildFormattedHTMLFromRuns(text, effective);
        overlay.style.display = 'block';

        elements.dialogInput.style.color = 'transparent';
        // 优先使用“接下来的”颜色作为插入点的光标颜色（如果与全局颜色不同且针对插入点有生效的 run）
        try {
            const selPos = (typeof elements.dialogInput.selectionStart === 'number') ? elements.dialogInput.selectionStart : text.length;
            const hasRunAtCaret = effective.some(r => typeof r.start === 'number' && r.start <= selPos);
            const useCaret = (state.selectionFormatColor && !colorsEqual(state.selectionFormatColor, gc) && hasRunAtCaret) ? state.selectionFormatColor : (gc || '#ffffff');
            elements.dialogInput.style.caretColor = useCaret;
        } catch (err) {
            elements.dialogInput.style.caretColor = gc || '#ffffff';
        }

        overlay.scrollTop = elements.dialogInput.scrollTop;
    } else {
        overlay.style.display = 'none';
        elements.dialogInput.style.color = gc;
        elements.dialogInput.style.caretColor = '';
    }
}

// 调整「接下来的」控件时：仅重置从插入点起的格式，保留此前各段的 formatRuns
function updateNextTextFormat() {
    if (state.scenes.length === 0) {
        createScene();
    }
    const currentScene = state.scenes[state.currentSceneIndex];
    if (!currentScene) return;

    const globalColor = state.textFormatting.dialog.color;
    const globalFontSize = state.textFormatting.dialog.fontSize;
    const nextColor = state.selectionFormatColor;
    const nextSize = state.selectionFormatSize;

    const isDiff = nextFormatDiffersFromGlobal();

    let splitPos = elements.dialogInput.selectionStart;
    if (document.activeElement !== elements.dialogInput) {
        splitPos = (elements.dialogInput.value || '').length;
    } else {
        splitPos = Math.max(0, Math.min(splitPos, (elements.dialogInput.value || '').length));
    }

    const text = elements.dialogInput.value || '';
    let runs = [...getFormatRunsForOverlay()];
    runs = runs.filter(r => r.start < splitPos);
    if (isDiff) {
        runs.push({ start: splitPos, color: nextColor, fontSize: nextSize });
    }
    runs = mergeAdjacentSameFormatRuns(clampFormatRunsForText(runs, text.length));

    syncFormatRunsToStorage(runs);

    updateFormattedOverlay();
    // 调整 textarea 的光标颜色以反映“接下来的”设置，确保用户在输入时看到正确的颜色
    try {
        const gc = state.textFormatting.dialog.color;
        const useCaret = (state.selectionFormatColor && !colorsEqual(state.selectionFormatColor, gc) && isDiff) ? state.selectionFormatColor : gc;
        elements.dialogInput.style.caretColor = useCaret || '';
    } catch (err) {
        // ignore
    }
    if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
}

// 导出时使用格式化div覆盖层渲染文本（解决textarea多行渲染问题）
let _exportOverlayActive = false;

// 战双新版模式和鸣潮飞讯模式导出时使用的亮度/对比度增强蒙版
let _brightnessOverlay = null;

// 添加亮度增强蒙版（战双新版模式：小幅度增强对比度；鸣潮飞讯模式：增强色彩对比度）
function _addBrightnessOverlay() {
    const isNewStyle = elements.previewContainer && elements.previewContainer.classList.contains('preview-mode-new');
    const isMingFeixunMode = document.body.classList.contains('ming-active') && elements.previewContainer && elements.previewContainer.classList.contains('feixun-mode');
    
    // 飞讯模式不添加蒙版（由 ming.js 的 exportChat 独立处理导出）
    if (isMingFeixunMode) return null;
    // 如果不是战双新版模式，则不添加蒙版
    if (!isNewStyle) return null;
    
    _brightnessOverlay = document.createElement('div');
    _brightnessOverlay.className = 'export-brightness-overlay';
    _brightnessOverlay.style.position = 'absolute';
    _brightnessOverlay.style.top = '0';
    _brightnessOverlay.style.left = '0';
    _brightnessOverlay.style.width = '100%';
    _brightnessOverlay.style.height = '100%';
    _brightnessOverlay.style.pointerEvents = 'none';
    _brightnessOverlay.style.zIndex = '9999';
    
    // 战双新版模式：小幅度增强对比度
    _brightnessOverlay.style.backdropFilter = 'contrast(1.08)';
    _brightnessOverlay.style.webkitBackdropFilter = 'contrast(1.08)';
    
    elements.previewContainer.appendChild(_brightnessOverlay);
    return _brightnessOverlay;
}

// 移除亮度增强蒙版
function _removeBrightnessOverlay() {
    if (_brightnessOverlay && _brightnessOverlay.parentNode) {
        _brightnessOverlay.parentNode.removeChild(_brightnessOverlay);
        _brightnessOverlay = null;
    }
}

// ============ Canvas 后处理滤镜工具函数 ============

/**
 * 获取当前导出模式对应的后处理滤镜字符串
 * @returns {string|null} CSS filter 字符串，如果不需要滤镜则返回 null
 */
function getExportPostFilter() {
    const isNewStyle = elements.previewContainer && elements.previewContainer.classList.contains('preview-mode-new');
    const isMingActive = document.body.classList.contains('ming-active');
    const isMingFeixunMode = isMingActive && elements.previewContainer && elements.previewContainer.classList.contains('feixun-mode');
    
    // 鸣潮飞讯模式：不添加后处理滤镜
    if (isMingFeixunMode) return null;
    
    if (isNewStyle && !isMingActive) {
        // 战双新版模式
        return 'brightness(1.18) contrast(1.08) saturate(1.04)';
    }
    // 战双旧版模式和鸣潮剧情模式：不添加滤镜
    return null;
}

/**
 * 对 Canvas 应用滤镜并返回新的 Canvas
 * @param {HTMLCanvasElement} canvas - 原始 canvas
 * @param {string} filterStr - CSS filter 字符串
 * @returns {HTMLCanvasElement} 应用滤镜后的新 canvas
 */
function applyCanvasFilter(canvas, filterStr) {
    if (!filterStr || !canvas) return canvas;
    
    const filteredCanvas = document.createElement('canvas');
    filteredCanvas.width = canvas.width;
    filteredCanvas.height = canvas.height;
    const ctx = filteredCanvas.getContext('2d');
    
    ctx.filter = filterStr;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    
    return filteredCanvas;
}

// 鸣潮剧情模式：导出时临时将角色名称 left 从 64% 移到 120%（隐藏在右侧）
let _savedCharNameLeft = null;
function _shiftCharacterNameForExport() {
    if (!document.body.classList.contains('ming-active')) return;
    const preview = elements.previewContainer;
    if (!preview || preview.classList.contains('feixun-mode')) return;
    const wrapper = elements.characterNameWrapper;
    if (!wrapper) return;
    _savedCharNameLeft = wrapper.style.left;
    wrapper.style.setProperty('left', '100%', 'important');
}
function _restoreCharacterNameAfterExport() {
    if (_savedCharNameLeft === null) return;
    const wrapper = elements.characterNameWrapper;
    if (wrapper) {
        wrapper.style.setProperty('left', _savedCharNameLeft, 'important');
    }
    _savedCharNameLeft = null;
}

function _exportUseOverlay(text, formatRuns) {
    const overlay = elements.dialogFormattedOverlay;
    if (!overlay) {
        elements.dialogInput.value = text;
        return;
    }
    if (!_exportOverlayActive) {
        elements.dialogInput.style.visibility = 'hidden';
        overlay.style.cssText = 'position:absolute;top:10px;left:10px;right:10px;bottom:10px;overflow-y:auto;pointer-events:none;z-index:2;display:block;';
        overlay.style.whiteSpace = 'pre-wrap';
        overlay.style.wordWrap = 'break-word';
        overlay.style.overflowWrap = 'break-word';
        overlay.style.color = state.textFormatting.dialog.color;
        overlay.style.fontSize = state.textFormatting.dialog.fontSize + 'px';
        overlay.style.fontWeight = state.textFormatting.dialog.fontWeight;
        overlay.style.textAlign = state.textFormatting.dialog.textAlign;
        overlay.style.lineHeight = getComputedStyle(elements.dialogInput).lineHeight;
        overlay.style.fontFamily = getComputedStyle(elements.dialogInput).fontFamily;
        _exportOverlayActive = true;
    }
    overlay.innerHTML = buildFormattedHTMLFromRuns(text, formatRuns || []);
}
function _exportRestoreOverlay() {
    if (_exportOverlayActive) {
        elements.dialogInput.style.visibility = '';
        elements.dialogInput.style.color = state.textFormatting.dialog.color;
        elements.dialogInput.style.caretColor = '';
        if (elements.dialogFormattedOverlay) elements.dialogFormattedOverlay.style.display = 'none';
        _exportOverlayActive = false;
    }
}

// ============ 选中文本格式相关函数结束 ============
function updateAlignButtons(type, textAlign) {
    const prefix = type === 'dialog' ? 'dialog' : 'commander';
    const buttons = {
        left: elements[`${prefix}AlignLeft`],
        center: elements[`${prefix}AlignCenter`],
        right: elements[`${prefix}AlignRight`]
    };

    Object.keys(buttons).forEach(key => {
        if (buttons[key]) {
            if (key === textAlign) {
                buttons[key].classList.add('active');
            } else {
                buttons[key].classList.remove('active');
            }
        }
    });
}

// 显示导出进度
function showExportProgress(title = '导出中', showCancel = false) {
    if (elements.exportProgressModal) {
        elements.exportProgressTitle.textContent = title;
        elements.exportProgressModal.style.display = 'flex';
        elements.exportAllProgressInfo.style.display = 'none';
        elements.exportCancelBtn.style.display = showCancel ? 'block' : 'none';
        if (elements.exportCloseBtn) elements.exportCloseBtn.style.display = 'none';
        updateExportProgress(0, '准备中...');
    }
}

// 更新导出进度
let startTime = null; // 用于计算预计剩余时间
	
function updateExportProgress(percent, text) {
    if (startTime === null) {
        startTime = Date.now();
    }
	    
    // 计算预计剩余时间
    const elapsedTime = Date.now() - startTime;
    let estimatedRemainingTime = '未知';
	    
    if (percent > 0 && percent < 100) {
        const totalTimeEstimate = elapsedTime / (percent / 100);
        const remainingTimeMs = totalTimeEstimate - elapsedTime;
	        
        // 转换为分钟和秒
        const minutes = Math.floor(remainingTimeMs / 60000);
        const seconds = Math.floor((remainingTimeMs % 60000) / 1000);
	        
        if (minutes > 0) {
            estimatedRemainingTime = `${minutes}分${seconds}秒`;
        } else {
            estimatedRemainingTime = `${seconds}秒`;
        }
    } else if (percent >= 100) {
        // 导出完成时重置开始时间
        startTime = null;
    }
	    
    if (elements.exportProgressBar) {
        elements.exportProgressBar.style.width = percent + '%';
    }
    if (elements.exportProgressText) {
        elements.exportProgressText.textContent = `${text} (预计剩余: ${estimatedRemainingTime})`;
    }
}

// 显示全部导出的总进度
function showAllExportProgress(current, total) {
    if (elements.exportAllProgressInfo) {
        elements.exportAllProgressInfo.style.display = 'block';
        if (elements.exportAllProgressBar) {
            const percent = Math.round((current / total) * 100);
            elements.exportAllProgressBar.style.width = percent + '%';
        }
        if (elements.exportAllProgressText) {
            elements.exportAllProgressText.textContent = `总进度: ${current}/${total} (${Math.round((current / total) * 100)}%)`;
        }
    }
}

// 隐藏导出进度
function hideExportProgress() {
    if (elements.exportProgressModal) {
        elements.exportProgressModal.style.display = 'none';
        elements.exportAllProgressInfo.style.display = 'none';
        elements.exportCancelBtn.style.display = 'none';
        if (elements.exportCloseBtn) elements.exportCloseBtn.style.display = 'none';
    }
}

// 面板折叠
function togglePanel(panel) {
    if (panel === 'left') {
        state.leftPanelFolded = !state.leftPanelFolded;
        elements.leftPanel.classList.toggle('folded', state.leftPanelFolded);
        elements.app.classList.toggle('left-panel-folded', state.leftPanelFolded);
        elements.foldLeftBtn.textContent = state.leftPanelFolded ? '▶' : '◀';
    } else {
        state.rightPanelFolded = !state.rightPanelFolded;
        elements.rightPanel.classList.toggle('folded', state.rightPanelFolded);
        elements.app.classList.toggle('right-panel-folded', state.rightPanelFolded);
        elements.foldRightBtn.textContent = state.rightPanelFolded ? '◀' : '▶';
    }
    updateFoldButtonTitles();
}

// 更新场景计数
function updateSceneCount() {
    const savedCount = state.savedScenes ? state.savedScenes.length : 0;
    elements.sceneCountLeft.textContent = savedCount;
    elements.sceneCountRight.textContent = savedCount;
}

// 判断场景是否为可导出（含对话或指挥官文本）
function isSceneExportable(s) {
    if (!s) return false;
    const hasDialog = s.dialogs && s.dialogs.length > 0;
    const hasCommander = s.commanderText && s.commanderText.trim().length > 0;
    return hasDialog || hasCommander;
}

// 更新快照（savedScenes）计数与场景计数一起显示
/** NOTE: saved-count UI removed -- keep only updateSceneCount() */

// 导出画布生成 PNG
async function exportCanvas(sceneIndex = state.currentSceneIndex, filename = null, silentMode = false) {
    if (state.scenes.length === 0) {
        if (!silentMode) alert('没有可导出的场景');
        return;
    }

    const currentScene = state.scenes[sceneIndex];
    const isInternalCall = silentMode || state.isExportAll;

    if (!isInternalCall) {
        state.isExporting = true;
        showExportProgress();
    }

    try {
        const wasCommanderVisible = elements.commanderDialog.style.display !== 'none';
        if (currentScene.commanderText && currentScene.commanderText.trim()) {
            elements.commanderDialog.style.display = 'flex';
        }

        // 计算导出scale，确保16:9分辨率
        const targetWidth = state.exportResolution;
        const targetHeight = Math.round(targetWidth / (16 / 9));
        const containerWidth = elements.previewContainer.offsetWidth;
        const containerHeight = elements.previewContainer.offsetHeight;
        const scale = Math.min(targetWidth / containerWidth, targetHeight / containerHeight);

        if (!isInternalCall) updateExportProgress(50, '正在生成画面...');

        // 如果背景是视频，在截图前将当前帧绘制到背景上
        let _videoTempRestore = null;
        if (currentScene.backgroundIsVideo && VideoBgManager.isActive()) {
            const frameDataUrl = VideoBgManager.getCurrentFrameDataURL();
            if (frameDataUrl) {
                _videoTempRestore = { bgImage: elements.previewBackground.style.backgroundImage };
                elements.previewBackground.style.backgroundImage = `url(${frameDataUrl})`;
                VideoBgManager._videoEl.style.display = 'none';
            }
        }

        // 添加亮度增强蒙版（如果是战双新版模式）
        _addBrightnessOverlay();
        _shiftCharacterNameForExport();

        const canvas = await html2canvas(elements.previewContainer, {
            backgroundColor: '#000',
            scale: scale,
            logging: false,
            useCORS: true,
            allowTaint: true
        });

        // 导出完成后移除亮度增强蒙版
        _removeBrightnessOverlay();
        _restoreCharacterNameAfterExport();

        // 导出完成后恢复视频背景状态
        if (_videoTempRestore) {
            elements.previewBackground.style.backgroundImage = _videoTempRestore.bgImage;
            VideoBgManager._videoEl.style.display = 'block';
        }

        // 应用后处理滤镜（根据当前模式）
        const postFilter = getExportPostFilter();
        const processedCanvas = postFilter ? applyCanvasFilter(canvas, postFilter) : canvas;

        // 调整画布到精确的16:9尺寸
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetWidth;
        finalCanvas.height = targetHeight;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(processedCanvas, 0, 0, targetWidth, targetHeight);

        const link = document.createElement('a');
        link.download = filename || `scene_${sceneIndex + 1}_${targetWidth}x${targetHeight}.png`;
        link.href = finalCanvas.toDataURL('image/png', state.exportPngQuality);
        link.click();

        if (!wasCommanderVisible && (!currentScene.commanderText || !currentScene.commanderText.trim())) {
            elements.commanderDialog.style.display = 'none';
        }

        if (!isInternalCall) {
            updateExportProgress(100, '导出完成！');
            setTimeout(() => {
                state.isExporting = false;
                hideExportProgress();
                alert('导出成功！');
            }, 500);
        }
    } catch (error) {
        console.error('导出失败:', error);
        if (!isInternalCall) {
            state.isExporting = false;
            hideExportProgress();
            alert('导出失败，请重试');
        }
        throw error;
    }
}

// 在导出前临时更改角色名称（如果需要），并返回恢复函数
function replaceCharacterNameForExport() {
    const original = elements.characterName.value;
    // 目前不对名称做任何变动，但占位逻辑留给未来扩展
    return function restore() {
        elements.characterName.value = original;
    };
}

// 导出所有场景，根据当前动画开关选择格式
    // 使用 requestIdleCallback 实现分批异步导出,避免页面卡顿
    async function exportAllScenes(format = 'png', fastMode = false) {
    // 只导出已暂存的画面
    if (!(state.savedScenes && state.savedScenes.length > 0)) {
        alert('没有可导出的暂存画面');
        return;
    }

    // 防止重复导出
    if (state.isExportAll) {
        alert('正在导出中,请等待完成...');
        return;
    }

    // 根据打字机动画开关决定导出格式
    // 开启打字机动画 -> 导出GIF，显示预计时长
    // 未开启打字机动画 -> 导出PNG，不显示预计时长
    const exportFormat = state.animationEnabled ? 'gif' : 'png';
    
    // 如果启用了ZIP压缩打包且导出GIF，使用打包模式
    if (state.zipExportEnabled && exportFormat === 'gif') {
        await exportAllScenesAsZip(fastMode);
        return;
    }

    // 根据导出格式决定实际导出方式
    const actualFormat = exportFormat === 'gif' ? 'gif' : 'png';

    state.isExportAll = true;
    state.shouldCancelExport = false;
    state.exportAllProgress = { current: 0, total: state.savedScenes.length, failed: 0 };

    // 保存原始状态
    const originalSnapshot = cloneState();
    const originalCommanderVisible = elements.commanderDialog.style.display !== 'none';

    // 如果是MP4合并导出,调用专门的函数
    if (actualFormat === 'mp4_merged') {
        await exportAllScenesAsMergedMP4(originalSnapshot, originalCommanderVisible);
        return;
    }

    // 根据格式决定导出文本和进度显示
    const formatText = exportFormat === 'gif' ? 'GIF动画' : 'PNG图片';
    const modeText = fastMode && exportFormat === 'gif' ? '(快速模式)' : '';
    showExportProgress(`正在导出全部${formatText}${modeText}...`, true);
    showAllExportProgress(0, state.exportAllProgress.total);

    let currentIndex = 0;
    const total = state.savedScenes.length;

    // 处理单个场景的函数
    const processSingleScene = async () => {
        if (state.shouldCancelExport) {
            handleExportCancel(originalSnapshot, originalCommanderVisible);
            return;
        }

        if (currentIndex >= total) {
            // 完成导出
            console.log('所有场景导出完成');
            handleExportComplete(originalSnapshot, originalCommanderVisible, format);
            return;
        }

        try {
            console.log(`开始导出第 ${currentIndex + 1}/${total} 个场景...`);
            const snap = state.savedScenes[currentIndex];
            console.log('恢复状态:', snap);
            restoreState(snap);
            updatePreview();

            // 确保对话框内容已正确恢复
            const currentScene = state.scenes[state.currentSceneIndex];
            console.log('当前场景:', currentScene);
            console.log('当前对话索引:', currentScene.currentDialogIndex);
            console.log('对话列表:', currentScene.dialogs);
            console.log('输入框内容:', elements.dialogInput.value);

            // 更新单个场景的进度
            updateExportProgress(
                Math.round(((currentIndex + 1) / total) * 100),
                `正在导出第 ${currentIndex + 1}/${total} 个场景...`
            );

            // 串行 await 避免内存爆炸
            const fileBase = `saved_scene_${currentIndex + 1}`;
            console.log(`导出文件: ${fileBase}`);
// 根据实际选择的导出格式决定导出方式
if (actualFormat === 'gif') {
    // GIF 动画导出
    await exportGIF(state.currentSceneIndex, `${fileBase}.gif`, true, fastMode);
} else if (actualFormat === 'png') {
    // PNG 图片导出
    await exportCanvas(state.currentSceneIndex, `${fileBase}.png`, true);
} else {
    // 默认使用 PNG 导出
    await exportCanvas(state.currentSceneIndex, `${fileBase}.png`, true);
}

            console.log(`第 ${currentIndex + 1} 个场景导出完成`);

            currentIndex++;
            state.exportAllProgress.current++;

            // 更新总进度
            showAllExportProgress(state.exportAllProgress.current, total);

            // 短暂延迟释放内存,让UI有机会更新
            setTimeout(() => {
                processSingleScene();
            }, 150);

        } catch (err) {
            console.error(`导出第 ${currentIndex + 1} 个场景失败:`, err);
            state.exportAllProgress.failed++;
            currentIndex++;

            // 继续下一个
            setTimeout(() => {
                processSingleScene();
            }, 150);
        }
    };

    // 开始处理
    try {
        console.log('开始全部导出');
        console.log(`总场景数: ${total}`);
        // 使用 setTimeout 让UI先更新
        setTimeout(() => {
            processSingleScene();
        }, 100);
    } catch (error) {
        console.error('导出过程中出错:', error);
        state.isExportAll = false;
        hideExportProgress();
        restoreState(originalSnapshot);
        updatePreview();
        elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';
        alert('导出过程出错,已中止');
    }
}

// 导出所有场景为合并的MP4视频
async function exportAllScenesAsMergedMP4(originalSnapshot, originalCommanderVisible) {
    const total = state.savedScenes.length;
    showExportProgress(`正在导出合并MP4视频...`, true);
    showAllExportProgress(0, total);

    // 检查浏览器支持
    const support = checkMP4Support();
    if (!support.supported) {
        alert('导出MP4失败：' + support.reason + '\n\n请使用最新版Chrome、Edge或Firefox浏览器。');
        state.isExportAll = false;
        hideExportProgress();
        restoreState(originalSnapshot);
        updatePreview();
        elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';
        return;
    }

    // 计算导出尺寸 - 16:9格式
    const targetWidth = state.exportResolution;
    const targetHeight = Math.round(targetWidth / (16 / 9));

    // 创建临时canvas用于录制
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    // 设置MediaRecorder
    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, {
        mimeType: support.mimeType,
        videoBitsPerSecond: state.exportMp4Quality * 1000000 // 1-10 Mbps
    });

    const recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    // 计算scale
    const containerWidth = elements.previewContainer.offsetWidth;
    const containerHeight = elements.previewContainer.offsetHeight;
    const scale = Math.min(targetWidth / containerWidth, targetHeight / containerHeight);

    let currentIndex = 0;
    let totalFrames = 0;

    // 开始录制
    mediaRecorder.start(100);

    // 处理单个场景
    const processSingleScene = async () => {
        if (state.shouldCancelExport) {
            mediaRecorder.stop();
            await new Promise(resolve => {
                mediaRecorder.onstop = resolve;
            });
            handleExportCancel(originalSnapshot, originalCommanderVisible);
            return;
        }

        if (currentIndex >= total) {
            // 完成所有场景
            console.log('所有场景录制完成，currentIndex:', currentIndex, 'total:', total);
            mediaRecorder.stop();
            await new Promise(resolve => {
                mediaRecorder.onstop = resolve;
            });
            console.log('MediaRecorder已停止');

            // 创建下载链接
            const blob = new Blob(recordedChunks, { type: support.mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const ext = support.mimeType.includes('mp4') ? 'mp4' : 'webm';
            link.download = `all_scenes_merged_${targetWidth}x${targetHeight}.${ext}`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);

            // 清理
            stream.getTracks().forEach(track => track.stop());

            // 恢复状态
            restoreState(originalSnapshot);
            updatePreview();
            elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';
            state.isExportAll = false;
            hideExportProgress();

            console.log('合并MP4导出完成');
            console.log('弹窗已关闭');
            return;
        }

        try {
            console.log(`开始录制第 ${currentIndex + 1}/${total} 个场景...`);
            const snap = state.savedScenes[currentIndex];
            restoreState(snap);
            updatePreview();

            // 更新进度
            updateExportProgress(
                Math.round(((currentIndex + 1) / total) * 100),
                `正在录制第 ${currentIndex + 1}/${total} 个场景...`
            );

            const currentScene = state.scenes[state.currentSceneIndex];
            const dialog = currentScene.dialogs[currentScene.currentDialogIndex] || currentScene.dialogs[0];
            const text = dialog.text || '';
            const hasCommanderDialog = currentScene.commanderText && currentScene.commanderText.trim().length > 0;

            // 辅助函数：捕获一帧
            async function captureFrame() {
                // 添加亮度增强蒙版（如果是战双新版模式）
                _addBrightnessOverlay();
                _shiftCharacterNameForExport();
                
                const previewCanvas = await html2canvas(elements.previewContainer, {
                    backgroundColor: '#000',
                    scale: scale,
                    logging: false,
                    useCORS: true,
                    allowTaint: true
                });
                
                // 移除亮度增强蒙版
                _removeBrightnessOverlay();
                _restoreCharacterNameAfterExport();

                // 应用后处理滤镜（根据当前模式）
                const postFilter = getExportPostFilter();
                const processedCanvas = postFilter ? applyCanvasFilter(previewCanvas, postFilter) : previewCanvas;

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, targetWidth, targetHeight);
                ctx.drawImage(processedCanvas, 0, 0, targetWidth, targetHeight);
                totalFrames++;
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            if (hasCommanderDialog) {
                // 有指挥官对话
                elements.dialogInput.value = text;
                elements.commanderDialog.style.display = 'flex';

                const slideInFrames = 15;

                // 第一帧：指挥官对话框在画面外右侧
                elements.commanderDialog.style.transform = 'translateX(150%) translateY(-50%)';
                elements.commanderDialog.style.opacity = '0';
                await new Promise(resolve => setTimeout(resolve, 50));
                await captureFrame();

                // 滑入动画帧
                for (let i = 1; i <= slideInFrames; i++) {
                    const progress = i / slideInFrames;
                    const easeProgress = 1 - Math.pow(1 - progress, 3);
                    const translateX = 150 * (1 - easeProgress);
                    const opacity = easeProgress;

                    elements.commanderDialog.style.transform = `translateX(${translateX}%) translateY(-50%)`;
                    elements.commanderDialog.style.opacity = opacity.toString();

                    await new Promise(resolve => setTimeout(resolve, 30));
                    await captureFrame();
                }

                // 添加5帧停留帧
                for (let i = 0; i < 5; i++) {
                    await new Promise(resolve => setTimeout(resolve, 30));
                    await captureFrame();
                }
            } else {
                // 没有指挥官对话
                const textFrames = state.animationEnabled ? text.length : 0;
                _exportOverlayActive = false;
                // 使用div覆盖层逐字渲染（解决多行换行问题）
                for (let i = 0; i <= textFrames; i++) {
                    const partialText = state.animationEnabled ? text.substring(0, i) : text;
                    _exportUseOverlay(partialText, getDialogFormatRunsForExport(dialog));
                    await new Promise(resolve => setTimeout(resolve, state.animationEnabled ? state.animationSpeed : 50));
                    await captureFrame();
                }
                // 恢复textarea显示完整文本，用于停留帧
                _exportRestoreOverlay();
                elements.dialogInput.value = text;
                // 添加最后停留帧
                for (let i = 0; i < 5; i++) {
                    await new Promise(resolve => setTimeout(resolve, 30));
                    await captureFrame();
                }
            }

            // 更新总进度
            state.exportAllProgress.current++;
            showAllExportProgress(state.exportAllProgress.current, total);

            currentIndex++;

            // 继续下一个场景
            setTimeout(() => {
                console.log('递归调用processSingleScene, currentIndex:', currentIndex, 'total:', total);
                processSingleScene();
            }, 100);

        } catch (err) {
            console.error(`录制第 ${currentIndex + 1} 个场景失败:`, err);
            state.exportAllProgress.failed++;
            currentIndex++;
            showAllExportProgress(state.exportAllProgress.current, total);

            // 继续下一个
            setTimeout(() => {
                processSingleScene();
            }, 100);
        }
    };

    // 开始录制
    try {
        console.log('开始录制合并MP4');
        console.log(`总场景数: ${total}`);
        setTimeout(() => {
            console.log('开始第一个场景录制');
            processSingleScene();
        }, 100);

        // 添加超时检查，防止卡住
        setTimeout(() => {
            if (state.isExportAll) {
                console.warn('导出超时，强制关闭弹窗');
                state.isExportAll = false;
                hideExportProgress();
                alert('导出已完成，但弹窗未能自动关闭');
            }
        }, 60000); // 60秒超时
    } catch (error) {
        console.error('录制过程中出错:', error);
        mediaRecorder.stop();
        await new Promise(resolve => {
            mediaRecorder.onstop = resolve;
        });
        state.isExportAll = false;
        hideExportProgress();
        restoreState(originalSnapshot);
        updatePreview();
        elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';
        alert('录制过程出错,已中止');
    }
}

// 检测设备性能
function detectDevicePerformance() {
    // 简单的性能检测:基于硬件并发数和内存估算
    const cores = navigator.hardwareConcurrency || 2;
    const memory = navigator.deviceMemory || 4; // GB

    // 评分: 1-10 (低配到高配)
    let score = 0;

    // CPU核心数评分 (2-16 cores)
    score += Math.min(5, (cores - 2) / 2);

    // 内存评分 (2-16 GB)
    score += Math.min(5, (memory - 2) / 2);

    state.devicePerformance = {
        cores,
        memory,
        score: Math.max(1, Math.min(10, Math.round(score)))
    };

    console.log('设备性能检测:', state.devicePerformance);
}

// 根据设备性能获取批次大小
function getBatchSize() {
    if (!state.devicePerformance) {
        detectDevicePerformance();
    }

    const score = state.devicePerformance.score;

    // 根据性能评分返回每批处理的场景数
    // 低配: 1个/批, 中配: 2个/批, 高配: 3个/批
    if (score <= 3) return 1;
    if (score <= 6) return 2;
    return 3;
}

// 导出所有场景为ZIP压缩包
    async function exportAllScenesAsZip(fastMode = false) {
    const totalScenes = state.savedScenes.length;
    if (totalScenes === 0) {
        alert('没有可导出的暂存画面');
        return;
    }

    state.isExportAll = true;
    state.shouldCancelExport = false;

    // 保存原始状态
    const originalSnapshot = cloneState();
    const originalCommanderVisible = elements.commanderDialog.style.display !== 'none';

    // 确定导出格式（根据打字机动画开关）
    const exportFormat = state.animationEnabled ? 'gif' : 'png';
    const formatText = exportFormat.toUpperCase();

    // 计算需要创建的ZIP包数量
    const batchSize = state.zipBatchSize;
    const totalBatches = Math.ceil(totalScenes / batchSize);

    showExportProgress(`正在打包导出${formatText}文件...`, true);

    let successCount = 0;
    let failedCount = 0;

    // 分批处理场景
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        if (state.shouldCancelExport) {
            handleExportCancel(originalSnapshot, originalCommanderVisible);
            return;
        }

        const startIdx = batchIndex * batchSize;
        const endIdx = Math.min(startIdx + batchSize, totalScenes);
        const batchScenes = state.savedScenes.slice(startIdx, endIdx);

        updateExportProgress(
            Math.round((batchIndex / totalBatches) * 100),
            `正在打包第 ${batchIndex + 1}/${totalBatches} 批 (${startIdx + 1}-${endIdx})...`
        );

        try {
            // 创建ZIP对象
            const zip = new JSZip();

            // 处理当前批次的每个场景
            for (let i = 0; i < batchScenes.length; i++) {
                if (state.shouldCancelExport) {
                    handleExportCancel(originalSnapshot, originalCommanderVisible);
                    return;
                }

                const sceneIndex = startIdx + i;
                const snap = batchScenes[i];

                // 恢复场景状态
                restoreState(snap);
                updatePreview();

                // 等待DOM更新
                await new Promise(resolve => setTimeout(resolve, 50));

                // 根据格式导出
                const fileName = `scene_${sceneIndex + 1}.${exportFormat}`;

                if (exportFormat === 'gif') {
                    // 导出GIF
                    const gifBlob = await exportGIFToBlob(state.currentSceneIndex, fastMode);
                    zip.file(fileName, gifBlob);
                } else {
                    // 导出PNG
                    const pngBlob = await exportCanvasToBlob(state.currentSceneIndex);
                    zip.file(fileName, pngBlob);
                }

                successCount++;
            }

            // 生成ZIP包并下载
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipFileName = `scenes_batch_${batchIndex + 1}_of_${totalBatches}.zip`;
            downloadBlob(zipBlob, zipFileName);

        } catch (error) {
            console.error(`打包第 ${batchIndex + 1} 批失败:`, error);
            failedCount += batchScenes.length;
        }
    }

    // 恢复原始状态
    restoreState(originalSnapshot);
    updatePreview();
    elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';

    state.isExportAll = false;
    hideExportProgress();

    // 显示完成信息
    let message = `${formatText}打包导出完成!\n成功: ${successCount}/${totalScenes}`;
    if (failedCount > 0) {
        message += `\n失败: ${failedCount}`;
    }
    message += `\n共生成 ${totalBatches} 个ZIP包`;
    alert(message);
}

// 导出GIF为Blob（用于打包）
async function exportGIFToBlob(sceneIndex, fastMode = false) {
    const currentScene = state.scenes[sceneIndex];
    const inputText = elements.dialogInput.value.trim();

    // 检查是否有对话内容
    if ((!currentScene.dialogs || currentScene.dialogs.length === 0) && !inputText) {
        throw new Error('当前场景没有对话内容');
    }

    if (inputText && (!currentScene.dialogs || currentScene.currentDialogIndex >= currentScene.dialogs.length)) {
        pushInputAsDialogIfNeeded(currentScene);
    }

    const dialog = currentScene.dialogs[currentScene.currentDialogIndex] || currentScene.dialogs[0];
    const text = dialog.text || '';

    if (!text) {
        throw new Error('对话文本为空');
    }

    // 检测是否有指挥官对话
    const hasCommanderDialog = currentScene.commanderText && currentScene.commanderText.trim().length > 0;

    // 计算导出尺寸 - 16:9格式
    const targetWidth = state.exportResolution;
    const targetHeight = Math.round(targetWidth / (16 / 9));

    // 创建GIF
    const workerBlobUrl = await getGifWorkerBlobUrl();
    const workerCount = fastMode
        ? Math.min(4, navigator.hardwareConcurrency || 2)
        : 2;
    const quality = fastMode ? Math.max(5, state.exportQuality) : state.exportQuality;

    const gif = new GIF({
        workers: workerCount,
        quality: quality,
        width: targetWidth,
        height: targetHeight,
        workerScript: workerBlobUrl,
        background: '#000',
        transparent: null,
        dither: !fastMode,
        pixelRatio: 1
    });

    // 计算scale
    const containerWidth = elements.previewContainer.offsetWidth;
    const containerHeight = elements.previewContainer.offsetHeight;
    const scale = Math.min(targetWidth / containerWidth, targetHeight / containerHeight);

    // 保存原始状态
    const originalText = elements.dialogInput.value;
    const originalCommanderDisplay = elements.commanderDialog.style.display;
    const originalCommanderTransform = elements.commanderDialog.style.transform;
    const originalCommanderOpacity = elements.commanderDialog.style.opacity;

    // 辅助函数：捕获画布并添加到GIF
    async function captureAndAddFrame() {
        // 添加亮度增强蒙版（如果是战双新版模式）
        _addBrightnessOverlay();
        _shiftCharacterNameForExport();
        
        const canvas = await html2canvas(elements.previewContainer, {
            backgroundColor: '#000',
            scale: scale,
            logging: false,
            useCORS: true,
            allowTaint: true
        });
        
        // 移除亮度增强蒙版
        _removeBrightnessOverlay();
        _restoreCharacterNameAfterExport();

        // 应用后处理滤镜（根据当前模式）
        const postFilter = getExportPostFilter();
        const processedCanvas = postFilter ? applyCanvasFilter(canvas, postFilter) : canvas;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetWidth;
        finalCanvas.height = targetHeight;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(processedCanvas, 0, 0, targetWidth, targetHeight);

        return finalCanvas;
    }

    if (hasCommanderDialog) {
        // 有指挥官对话
        elements.dialogInput.value = text;
        elements.commanderDialog.style.display = 'flex';

        const slideInFrames = 15;
        const slideInDelay = Math.max(50, Math.floor(750 / slideInFrames));

        // 第一帧
        elements.commanderDialog.style.transform = 'translateX(150%) translateY(-50%)';
        elements.commanderDialog.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, 100));
        let frame1 = await captureAndAddFrame();
        gif.addFrame(frame1, { delay: slideInDelay, copy: true });

        // 滑入动画帧
        for (let i = 1; i <= slideInFrames; i++) {
            const progress = i / slideInFrames;
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const translateX = 150 * (1 - easeProgress);
            const opacity = easeProgress;

            elements.commanderDialog.style.transform = `translateX(${translateX}%) translateY(-50%)`;
            elements.commanderDialog.style.opacity = opacity.toString();

            await new Promise(resolve => setTimeout(resolve, 30));
            let frame = await captureAndAddFrame();
            gif.addFrame(frame, { delay: slideInDelay, copy: true });
        }

        // 添加5帧停留帧
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 30));
            let frame = await captureAndAddFrame();
            gif.addFrame(frame, { delay: slideInDelay });
        }
    } else {
        // 没有指挥官对话：打字机动画逻辑
        const frameDelay = state.animationEnabled ? state.animationSpeed : 100;

        let totalFrames;
        if (state.animationEnabled) {
            if (fastMode) {
                const textLength = text.length;
                const baseDuration = textLength * state.animationSpeed;
                const targetDuration = Math.max(2000, Math.min(4000, baseDuration));
                totalFrames = Math.min(60, Math.max(20, Math.floor((targetDuration / 1000) * 30)));
            } else {
                totalFrames = text.length;
            }
        } else {
            totalFrames = 1;
        }

        const batchSize = fastMode ? Math.min(10, Math.ceil(totalFrames / 6)) : totalFrames;

        // 分批生成打字机动画帧
        for (let batchStart = 0; batchStart < totalFrames; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, totalFrames);

            for (let i = batchStart; i < batchEnd; i++) {
                let textToShow = '';

                if (state.animationEnabled) {
                    if (fastMode) {
                        const progress = i / (totalFrames - 1);
                        const charIndex = Math.floor(progress * (text.length - 1)) + 1;
                        textToShow = text.substring(0, charIndex);
                    } else {
                        textToShow = text.substring(0, i);
                    }
                } else {
                    textToShow = text;
                }

                _exportUseOverlay(textToShow, getDialogFormatRunsForExport(dialog));
                await new Promise(resolve => setTimeout(resolve, fastMode ? 10 : (state.animationEnabled ? state.animationSpeed : 100)));

                let frame = await captureAndAddFrame();
                gif.addFrame(frame, { delay: frameDelay, copy: true });
            }

            if (fastMode && batchEnd < totalFrames) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        }

        // 恢复textarea（显示完整文本用于停留帧）
        _exportRestoreOverlay();
        elements.dialogInput.value = text;

        // 添加最后停留帧
        for (let i = 0; i < 5; i++) {
            let frame = await captureAndAddFrame();
            gif.addFrame(frame, { delay: frameDelay });
        }
    }

    // 恢复原始状态
    elements.dialogInput.value = originalText;
    elements.commanderDialog.style.display = originalCommanderDisplay;
    elements.commanderDialog.style.transform = originalCommanderTransform;
    elements.commanderDialog.style.opacity = originalCommanderOpacity;

    // 渲染GIF并返回Blob
    return new Promise((resolve, reject) => {
        gif.on('finished', (blob) => {
            resolve(blob);
        });

        gif.on('error', (err) => {
            reject(err);
        });

        gif.render();
    });
}

// 导出Canvas为Blob（用于打包）
async function exportCanvasToBlob(sceneIndex) {
    const currentScene = state.scenes[sceneIndex];

    // 计算导出scale，确保16:9分辨率
    const targetWidth = state.exportResolution;
    const targetHeight = Math.round(targetWidth / (16 / 9));
    const containerWidth = elements.previewContainer.offsetWidth;
    const containerHeight = elements.previewContainer.offsetHeight;
    const scale = Math.min(targetWidth / containerWidth, targetHeight / containerHeight);

    const wasCommanderVisible = elements.commanderDialog.style.display !== 'none';
    if (currentScene.commanderText && currentScene.commanderText.trim()) {
        elements.commanderDialog.style.display = 'flex';
    }

    // 如果背景是视频，在截图前将当前帧绘制到背景上
    let _videoTempRestore = null;
    if (currentScene.backgroundIsVideo && VideoBgManager.isActive()) {
        const frameDataUrl = VideoBgManager.getCurrentFrameDataURL();
        if (frameDataUrl) {
            _videoTempRestore = { bgImage: elements.previewBackground.style.backgroundImage };
            elements.previewBackground.style.backgroundImage = `url(${frameDataUrl})`;
            VideoBgManager._videoEl.style.display = 'none';
        }
    }

    // 添加亮度增强蒙版（如果是战双新版模式）
    _addBrightnessOverlay();
    _shiftCharacterNameForExport();

    const canvas = await html2canvas(elements.previewContainer, {
        backgroundColor: '#000',
        scale: scale,
        logging: false,
        useCORS: true,
        allowTaint: true
    });

    // 移除亮度增强蒙版
    _removeBrightnessOverlay();
    _restoreCharacterNameAfterExport();

    // 导出完成后恢复视频背景状态
    if (_videoTempRestore) {
        elements.previewBackground.style.backgroundImage = _videoTempRestore.bgImage;
        VideoBgManager._videoEl.style.display = 'block';
    }

    // 应用后处理滤镜（根据当前模式）
    const postFilter = getExportPostFilter();
    const processedCanvas = postFilter ? applyCanvasFilter(canvas, postFilter) : canvas;

    // 调整画布到精确的16:9尺寸
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;
    const ctx = finalCanvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(processedCanvas, 0, 0, targetWidth, targetHeight);

    if (!wasCommanderVisible && (!currentScene.commanderText || !currentScene.commanderText.trim())) {
        elements.commanderDialog.style.display = 'none';
    }

    return new Promise((resolve) => {
        finalCanvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/png', state.exportPngQuality);
    });
}

// 下载Blob文件
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

// 处理导出取消
function handleExportCancel(originalSnapshot, originalCommanderVisible) {
    state.isExportAll = false;
    state.shouldCancelExport = false;

    hideExportProgress();
    restoreState(originalSnapshot);
    updatePreview();
    elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';

    alert('导出已取消');
}

// 处理导出完成
function handleExportComplete(originalSnapshot, originalCommanderVisible, format = 'png') {
    state.isExportAll = false;

    // 恢复原始状态
    restoreState(originalSnapshot);
    updatePreview();
    elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';
    updateSceneCount();

    // 显示完成信息
    const success = state.exportAllProgress.total - state.exportAllProgress.failed;
    const formatText = format === 'mp4' ? 'MP4视频' : (format === 'gif' ? 'GIF动画' : 'PNG图片');
    let message = `${formatText}导出完成!\n成功: ${success}/${state.exportAllProgress.total}`;
    if (state.exportAllProgress.failed > 0) {
        message += `\n失败: ${state.exportAllProgress.failed}`;
    }

    hideExportProgress();
    alert(message);
}

// 根据动画开关选择导出类型
function exportScene() {
    if (typeof window.logAction === 'function') window.logAction('点击导出画面', { 场景: state.currentSceneIndex + 1, 动画: state.animationEnabled });
    if (state.animationEnabled) {
        exportGIF();
    } else {
        exportCanvas();
    }
}

// 导出为 GIF 动画
async function exportGIF(sceneIndex = state.currentSceneIndex, filename = null, silentMode = false, fastMode = false) {
    if (typeof window.logAction === 'function') window.logAction('开始导出GIF', { 场景: sceneIndex + 1, 快速模式: fastMode });
    if (state.scenes.length === 0) {
        if (!silentMode) alert('没有可导出的场景');
        return;
    }

    const isInternalCall = silentMode || state.isExportAll;

    // 防止重复点击（仅在非内部调用时检查）
    if (!isInternalCall && state.isExporting) {
        alert('GIF导出中，请等待完成...');
        return;
    }

    const currentScene = state.scenes[sceneIndex];
    const inputText = elements.dialogInput.value.trim();

    // 检查是否有对话内容（包括已保存的和输入框中的）
    if ((!currentScene.dialogs || currentScene.dialogs.length === 0) && !inputText) {
        if (!isInternalCall) alert('当前场景没有对话内容\n\n请先在对话框中输入文本！');
        throw new Error('当前场景没有对话内容');
    }

    if (inputText && (!currentScene.dialogs || currentScene.currentDialogIndex >= currentScene.dialogs.length)) {
        pushInputAsDialogIfNeeded(currentScene);
    }

    if (!isInternalCall) {
        state.isExporting = true;
        showExportProgress();
    }

    try {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex] || currentScene.dialogs[0];
        const text = dialog.text || '';

        if (!text) {
            if (!isInternalCall) {
                alert('对话文本为空！');
                state.isExporting = false;
                hideExportProgress();
            }
            throw new Error('GIF导出：对话文本为空');
        }

        // 检测是否有指挥官对话
        const hasCommanderDialog = currentScene.commanderText && currentScene.commanderText.trim().length > 0;

        // 计算导出尺寸 - 16:9格式
        const targetWidth = state.exportResolution;
        const targetHeight = Math.round(targetWidth / (16 / 9));

        updateExportProgress(5, '正在初始化GIF...');

        // 创建GIF，使用改进的颜色质量设置
        const workerBlobUrl = await getGifWorkerBlobUrl();

        // 根据是否快速模式优化配置
        const workerCount = fastMode
            ? Math.min(4, navigator.hardwareConcurrency || 2)
            : 2;
        const quality = fastMode ? Math.max(5, state.exportQuality) : state.exportQuality;

        const gif = new GIF({
            workers: workerCount,
            quality: quality,  // 快速模式使用中等质量
            width: targetWidth,   // 16:9宽度
            height: targetHeight, // 16:9高度
            workerScript: workerBlobUrl,
            background: '#000',  // 明确背景色，避免透明问题
            transparent: null,  // 不使用透明度，提高颜色质量
            dither: !fastMode,   // 快速模式禁用抖动
            pixelRatio: 1        // 像素比设为1，确保准确尺寸
        });

        // 计算scale
        const containerWidth = elements.previewContainer.offsetWidth;
        const containerHeight = elements.previewContainer.offsetHeight;
        const scale = Math.min(targetWidth / containerWidth, targetHeight / containerHeight);

        // 保存原始状态
        const originalText = elements.dialogInput.value;
        const originalCommanderDisplay = elements.commanderDialog.style.display;
        const originalCommanderTransform = elements.commanderDialog.style.transform;
        const originalCommanderOpacity = elements.commanderDialog.style.opacity;

        const restoreName = replaceCharacterNameForExport();
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!isInternalCall) updateExportProgress(10, '正在生成动画帧...');

        // 辅助函数：捕获画布并添加到GIF
        async function captureAndAddFrame() {
            // 添加亮度增强蒙版（如果是战双新版模式）
            _addBrightnessOverlay();
            _shiftCharacterNameForExport();
            
            const canvas = await html2canvas(elements.previewContainer, {
                backgroundColor: '#000',
                scale: scale,
                logging: false,
                useCORS: true,
                allowTaint: true
            });
            
            // 移除亮度增强蒙版
            _removeBrightnessOverlay();
            _restoreCharacterNameAfterExport();

            // 应用后处理滤镜（根据当前模式）
            const postFilter = getExportPostFilter();
            const processedCanvas = postFilter ? applyCanvasFilter(canvas, postFilter) : canvas;

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = targetWidth;
            finalCanvas.height = targetHeight;
            const ctx = finalCanvas.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(processedCanvas, 0, 0, targetWidth, targetHeight);

            return finalCanvas;
        }

        if (hasCommanderDialog) {
            // 有指挥官对话：显示指挥官对话框，文本输入框不播放打字机动画
            elements.dialogInput.value = text; // 直接显示完整文本
            elements.commanderDialog.style.display = 'flex';

            // 计算滑入动画参数
            const slideInFrames = 15;
            const slideInDelay = Math.max(50, Math.floor(750 / slideInFrames)); // 约0.75-1秒
            const totalFrames = slideInFrames + 1 + 5; // 初始帧+滑入帧+停留帧

            // 第一帧：指挥官对话框在画面外右侧，完全透明
            elements.commanderDialog.style.transform = 'translateX(150%) translateY(-50%)';
            elements.commanderDialog.style.opacity = '0';
            await new Promise(resolve => setTimeout(resolve, 100));
            let frame1 = await captureAndAddFrame();
            gif.addFrame(frame1, { delay: slideInDelay, copy: true });
            if (!isInternalCall) updateExportProgress(15, `正在生成第 1/${totalFrames} 帧...`);

            // 滑入动画帧（约15帧，0.75-1秒）
            for (let i = 1; i <= slideInFrames; i++) {
                const progress = i / slideInFrames;
                // 缓动函数：easeOutCubic
                const easeProgress = 1 - Math.pow(1 - progress, 3);

                // 从150%滑到0%，透明度从0到1
                const translateX = 150 * (1 - easeProgress);
                const opacity = easeProgress;

                elements.commanderDialog.style.transform = `translateX(${translateX}%) translateY(-50%)`;
                elements.commanderDialog.style.opacity = opacity.toString();

                await new Promise(resolve => setTimeout(resolve, 30)); // 短暂等待让CSS更新
                let frame = await captureAndAddFrame();
                gif.addFrame(frame, { delay: slideInDelay, copy: true });

                if (!isInternalCall) {
                    const framePercent = 15 + Math.floor((i / totalFrames) * 60);
                    updateExportProgress(framePercent, `正在生成第 ${i + 1}/${totalFrames} 帧...`);
                }
            }

            // 添加5帧停留帧
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 30));
                let frame = await captureAndAddFrame();
                gif.addFrame(frame, { delay: slideInDelay });
            }
        } else {
            // 没有指挥官对话：打字机动画逻辑
            const frameDelay = state.animationEnabled ? state.animationSpeed : 100;

            // 快速模式：智能帧数控制
            let totalFrames;
            if (state.animationEnabled) {
                if (fastMode) {
                    // 快速模式：智能计算帧数
                    const textLength = text.length;
                    const baseDuration = textLength * state.animationSpeed; // 基础时长(ms)
                    const targetDuration = Math.max(2000, Math.min(4000, baseDuration)); // 目标2-4秒
                    totalFrames = Math.min(60, Math.max(20, Math.floor((targetDuration / 1000) * 30))); // 目标30fps
                } else {
                    // 普通模式：每个字符一帧
                    totalFrames = text.length;
                }
            } else {
                totalFrames = 1;
            }

            // 批次大小（快速模式使用分批处理）
            const batchSize = fastMode ? Math.min(10, Math.ceil(totalFrames / 6)) : totalFrames;

            // 分批生成打字机动画帧
            for (let batchStart = 0; batchStart < totalFrames; batchStart += batchSize) {
                const batchEnd = Math.min(batchStart + batchSize, totalFrames);

                for (let i = batchStart; i < batchEnd; i++) {
                    if (state.shouldCancelExport) {
                        return;
                    }

                    let textToShow = '';

                    if (state.animationEnabled) {
                        if (fastMode) {
                            // 快速模式：根据进度比例映射到文本长度
                            const progress = i / (totalFrames - 1);
                            const charIndex = Math.floor(progress * (text.length - 1)) + 1;
                            textToShow = text.substring(0, charIndex);
                        } else {
                            // 普通模式：逐字显示
                            textToShow = text.substring(0, i);
                        }
                    } else {
                        // 不启用动画：直接显示全文
                        textToShow = text;
                    }

                    _exportUseOverlay(textToShow, getDialogFormatRunsForExport(dialog));

                    // 短暂DOM等待
                    await new Promise(resolve => setTimeout(resolve, fastMode ? 10 : (state.animationEnabled ? state.animationSpeed : 100)));

                    let frame = await captureAndAddFrame();
                    gif.addFrame(frame, { delay: frameDelay, copy: true });

                    if (!isInternalCall) {
                        const framePercent = 15 + Math.floor((i / totalFrames) * 60);
                        updateExportProgress(framePercent, `正在生成第 ${i + 1}/${totalFrames} 帧...`);
                    }
                }

                // 每批次后短暂延迟，防止阻塞（快速模式）
                if (fastMode && batchEnd < totalFrames) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
            }

            // 恢复textarea（显示完整文本用于停留帧）
            _exportRestoreOverlay();
            elements.dialogInput.value = text;

            // 添加最后停留帧（显示完整文本）
            for (let i = 0; i < 5; i++) {
                if (state.shouldCancelExport) return;
                let frame = await captureAndAddFrame();
                gif.addFrame(frame, { delay: frameDelay });
            }
        }

        // 恢复原始状态
        restoreName();
        elements.dialogInput.value = originalText;
        elements.commanderDialog.style.display = originalCommanderDisplay;
        elements.commanderDialog.style.transform = originalCommanderTransform;
        elements.commanderDialog.style.opacity = originalCommanderOpacity;

        if (!isInternalCall) updateExportProgress(80, '正在渲染GIF...');

        // 渲染GIF - 返回Promise以便等待完成
        await new Promise((resolve, reject) => {
            gif.on('finished', (blob) => {
                if (!isInternalCall) updateExportProgress(100, '导出完成！');

                setTimeout(() => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = filename || `scene_${sceneIndex + 1}_${targetWidth}x${targetHeight}.gif`;
                    link.href = url;
                    link.click();
                    URL.revokeObjectURL(url);

                    if (!isInternalCall) {
                        state.isExporting = false;
                        hideExportProgress();
                        alert('GIF导出成功！');
                    }
                    resolve();
                }, 500);
            });

            gif.on('progress', (p) => {
                if (!isInternalCall) {
                    const percent = Math.round(p * 100);
                    const overallPercent = 80 + Math.floor(percent * 0.2);
                    updateExportProgress(overallPercent, `正在渲染GIF... ${percent}%`);
                }
            });

            gif.on('error', (err) => {
                console.error('GIF渲染错误:', err);
                reject(err);
            });

            gif.render();
        });

    } catch (error) {
        console.error('导出GIF失败:', error);
        if (!isInternalCall) {
            state.isExporting = false;
            hideExportProgress();
            alert('导出GIF失败，请重试\n错误：' + error.message);
        }
        throw error;
    }
}

// MP4导出功能 - 使用MediaRecorder API（更可靠）

// 检查是否支持MP4导出
function checkMP4Support() {
    // 检查MediaRecorder支持
    if (!window.MediaRecorder) {
        return { supported: false, reason: '您的浏览器不支持MediaRecorder API' };
    }
    
    // 检查是否有支持的MIME类型
    const mimeTypes = [
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
    ];
    
    for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            console.log('支持的MIME类型:', mimeType);
            return { supported: true, mimeType };
        }
    }
    
    return { supported: false, reason: '您的浏览器不支持视频录制格式' };
}

// 导出为MP4 - 使用Canvas录制方式
async function exportMP4(sceneIndex = state.currentSceneIndex, filename = null, silentMode = false) {
    if (state.scenes.length === 0) {
        if (!silentMode) alert('没有可导出的场景');
        return;
    }

    const isInternalCall = silentMode || state.isExportAll;

    // 防止重复点击（仅在非内部调用时检查）
    if (!isInternalCall && state.isExporting) {
        alert('MP4导出中，请等待完成...');
        return;
    }

    // 检查浏览器支持
    const support = checkMP4Support();
    if (!support.supported) {
        if (!isInternalCall) alert('导出MP4失败：' + support.reason + '\n\n请使用最新版Chrome、Edge或Firefox浏览器。');
        return;
    }

    const currentScene = state.scenes[sceneIndex];
    const inputText = elements.dialogInput.value.trim();

    // 检查是否有对话内容
    if ((!currentScene.dialogs || currentScene.dialogs.length === 0) && !inputText) {
        if (!isInternalCall) alert('当前场景没有对话内容\n\n请先在对话框中输入文本！');
        return;
    }

    if (inputText && (!currentScene.dialogs || currentScene.currentDialogIndex >= currentScene.dialogs.length)) {
        pushInputAsDialogIfNeeded(currentScene);
    }

    if (!isInternalCall) {
        state.isExporting = true;
        showExportProgress();
    }

    try {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex] || currentScene.dialogs[0];
        const text = dialog.text || '';

        if (!text) {
            if (!isInternalCall) {
                alert('对话文本为空！');
                state.isExporting = false;
                hideExportProgress();
            }
            return;
        }

        // 检测是否有指挥官对话
        const hasCommanderDialog = currentScene.commanderText && currentScene.commanderText.trim().length > 0;

        // 计算导出尺寸 - 16:9格式
        const targetWidth = state.exportResolution;
        const targetHeight = Math.round(targetWidth / (16 / 9));

        if (!isInternalCall) updateExportProgress(10, '正在准备录制...');

        // 使用html2canvas + MediaRecorder方式
        const fps = 30;
        const recordedChunks = [];
        
        // 创建一个临时canvas用于录制
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        // 设置MediaRecorder
        const stream = canvas.captureStream(fps);
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: support.mimeType,
            videoBitsPerSecond: state.exportMp4Quality * 1000000 // 1-10 Mbps
        });
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        // 计算scale
        const containerWidth = elements.previewContainer.offsetWidth;
        const containerHeight = elements.previewContainer.offsetHeight;
        const scale = Math.min(targetWidth / containerWidth, targetHeight / containerHeight);

        // 保存原始状态
        const originalText = elements.dialogInput.value;
        const originalCommanderDisplay = elements.commanderDialog.style.display;
        const originalCommanderTransform = elements.commanderDialog.style.transform;
        const originalCommanderOpacity = elements.commanderDialog.style.opacity;

        const restoreName = replaceCharacterNameForExport();
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!isInternalCall) updateExportProgress(20, '正在录制视频帧...');

        let frameCount = 0;
        const totalFrames = hasCommanderDialog ? 21 : (state.animationEnabled ? text.length + 6 : 6);
        
        // 开始录制
        mediaRecorder.start(100); // 每100ms收集一次数据
        
        // 辅助函数：捕获一帧并绘制到录制canvas
        async function captureFrame() {
            // 添加亮度增强蒙版（如果是战双新版模式）
            _addBrightnessOverlay();
            _shiftCharacterNameForExport();
            
            const previewCanvas = await html2canvas(elements.previewContainer, {
                backgroundColor: '#000',
                scale: scale,
                logging: false,
                useCORS: true,
                allowTaint: true
            });
            
            // 移除亮度增强蒙版
            _removeBrightnessOverlay();
            _restoreCharacterNameAfterExport();
            
            // 应用后处理滤镜（根据当前模式）
            const postFilter = getExportPostFilter();
            const processedCanvas = postFilter ? applyCanvasFilter(previewCanvas, postFilter) : previewCanvas;
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(processedCanvas, 0, 0, targetWidth, targetHeight);
            
            frameCount++;
            if (!isInternalCall) {
                const framePercent = 20 + Math.floor((frameCount / totalFrames) * 60);
                updateExportProgress(framePercent, `正在录制第 ${frameCount}/${totalFrames} 帧...`);
            }
        }
        
        if (hasCommanderDialog) {
            // 有指挥官对话：显示指挥官对话框
            elements.dialogInput.value = text;
            elements.commanderDialog.style.display = 'flex';

            const slideInFrames = 15;

            // 第一帧：指挥官对话框在画面外右侧
            elements.commanderDialog.style.transform = 'translateX(150%) translateY(-50%)';
            elements.commanderDialog.style.opacity = '0';
            await new Promise(resolve => setTimeout(resolve, 100));
            await captureFrame();

            // 滑入动画帧
            for (let i = 1; i <= slideInFrames; i++) {
                const progress = i / slideInFrames;
                const easeProgress = 1 - Math.pow(1 - progress, 3);
                const translateX = 150 * (1 - easeProgress);
                const opacity = easeProgress;

                elements.commanderDialog.style.transform = `translateX(${translateX}%) translateY(-50%)`;
                elements.commanderDialog.style.opacity = opacity.toString();

                await new Promise(resolve => setTimeout(resolve, 30));
                await captureFrame();
            }

            // 添加5帧停留帧
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 30));
                await captureFrame();
            }
        } else {
            // 没有指挥官对话：打字机动画
            const textFrames = state.animationEnabled ? text.length : 0;
            _exportOverlayActive = false;

            for (let i = 0; i <= textFrames; i++) {
                const partialText = state.animationEnabled ? text.substring(0, i) : text;
                _exportUseOverlay(partialText, getDialogFormatRunsForExport(dialog));
                await new Promise(resolve => setTimeout(resolve, state.animationEnabled ? state.animationSpeed : 100));
                await captureFrame();
            }

            // 恢复textarea显示完整文本，用于停留帧
            _exportRestoreOverlay();
            elements.dialogInput.value = text;

            // 添加最后停留帧
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 30));
                await captureFrame();
            }
        }
        
        // 停止录制
        mediaRecorder.stop();
        
        // 等待录制完成
        await new Promise((resolve) => {
            mediaRecorder.onstop = resolve;
        });

        // 恢复原始状态
        restoreName();
        elements.dialogInput.value = originalText;
        elements.commanderDialog.style.display = originalCommanderDisplay;
        elements.commanderDialog.style.transform = originalCommanderTransform;
        elements.commanderDialog.style.opacity = originalCommanderOpacity;

        if (!isInternalCall) updateExportProgress(80, '正在生成MP4文件...');
        
        // 创建下载链接
        const blob = new Blob(recordedChunks, { type: support.mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const ext = support.mimeType.includes('mp4') ? 'mp4' : 'webm';
        link.download = filename || `scene_${sceneIndex + 1}_${targetWidth}x${targetHeight}.${ext}`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        
        // 清理
        stream.getTracks().forEach(track => track.stop());

        if (!isInternalCall) {
            updateExportProgress(100, '导出完成！');
            setTimeout(() => {
                state.isExporting = false;
                hideExportProgress();
                alert(ext === 'mp4' ? 'MP4导出成功！' : '视频导出成功！(WebM格式)');
            }, 500);
        }

    } catch (error) {
        console.error('导出MP4失败:', error);
        if (!isInternalCall) {
            state.isExporting = false;
            hideExportProgress();
            alert('导出MP4失败，请重试\n错误：' + error.message);
        }
        throw error;
    }
}

// 全部导出为MP4
async function exportAllScenesAsMP4() {
    await exportAllScenes('mp4');
}

// 初始化
document.addEventListener('DOMContentLoaded', init);

// 暴露全局函数（供外部或调试使用）
window.exportCanvas = exportCanvas;
window.exportGIF = exportGIF;
window.exportScene = exportScene;
window.exportAllScenes = exportAllScenes;

// 快速导出GIF - 优化版本
function exportGIFFast(sceneIndex = state.currentSceneIndex, filename = null) {
    exportGIF(sceneIndex, filename, false, true);
}
window.exportGIFFast = exportGIFFast;

// 全部快速导出GIF
async function exportAllScenesAsGIFFast() {
    await exportAllScenes('gif', true);
}

// 整页滚动控制
const ScrollControl = {
    isScrolling: false,
    scrollDelay: 800, // 滚动延迟时间（毫秒）
    currentPage: 0,
    pages: [],
    touchStartY: 0,
    touchEndY: 0,

    init() {
        const scrollContainer = document.getElementById('full-page-scroll');
        if (!scrollContainer) return;

        this.pages = scrollContainer.querySelectorAll('.scroll-page');
        this.currentPage = 0;

        // 监听滚轮事件
        scrollContainer.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // 监听键盘事件
        document.addEventListener('keydown', (e) => this.handleKeydown(e));

        // 监听触摸事件（移动端）
        scrollContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        scrollContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: true });
        scrollContainer.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });

        // 监听滚动事件更新当前页面
        scrollContainer.addEventListener('scroll', () => this.updateCurrentPage());
    },

    handleWheel(e) {
        if (this.isScrolling) return;

        // 检查事件目标是否是侧边面板或其子元素
        const target = e.target;
        const sidePanel = target.closest('.side-panel');

        // 如果在侧边面板内滚动,允许正常滚动
        if (sidePanel) {
            return;
        }

        e.preventDefault();

        if (e.deltaY > 0) {
            // 向下滚动
            if (this.currentPage < this.pages.length - 1) {
                this.scrollToPage(this.currentPage + 1);
            }
        } else {
            // 向上滚动
            if (this.currentPage > 0) {
                this.scrollToPage(this.currentPage - 1);
            }
        }
    },

    handleKeydown(e) {
        if (this.isScrolling) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (this.currentPage < this.pages.length - 1) {
                this.scrollToPage(this.currentPage + 1);
            }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (this.currentPage > 0) {
                this.scrollToPage(this.currentPage - 1);
            }
        }
    },

    handleTouchStart(e) {
        this.touchStartY = e.touches[0].clientY;
    },

    handleTouchMove(e) {
        // 检查触摸目标是否是侧边面板或其子元素
        const target = e.target;
        const sidePanel = target.closest('.side-panel');

        // 如果在侧边面板内滑动,允许正常滚动
        if (sidePanel) {
            return;
        }

        // 阻止默认滚动行为
        const scrollContainer = document.getElementById('full-page-scroll');
        const scrollTop = scrollContainer.scrollTop;

        // 只在页面顶部或底部时阻止默认滚动
        if ((scrollTop <= 0 && e.touches[0].clientY > this.touchStartY) ||
            (scrollTop >= scrollContainer.scrollHeight - scrollContainer.clientHeight && e.touches[0].clientY < this.touchStartY)) {
            e.preventDefault();
        }
    },

    handleTouchEnd(e) {
        if (this.isScrolling) return;

        // 检查触摸目标是否是侧边面板或其子元素
        const target = e.changedTouches[0].target;
        const sidePanel = target.closest('.side-panel');

        // 如果在侧边面板内滑动,不触发页面切换
        if (sidePanel) {
            return;
        }

        this.touchEndY = e.changedTouches[0].clientY;
        const diff = this.touchStartY - this.touchEndY;

        // 滑动距离超过50px才触发页面切换
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                // 向上滑动
                if (this.currentPage < this.pages.length - 1) {
                    this.scrollToPage(this.currentPage + 1);
                }
            } else {
                // 向下滑动
                if (this.currentPage > 0) {
                    this.scrollToPage(this.currentPage - 1);
                }
            }
        }
    },

    scrollToPage(pageIndex) {
        if (pageIndex < 0 || pageIndex >= this.pages.length || pageIndex === this.currentPage) return;

        this.isScrolling = true;
        this.currentPage = pageIndex;

        const scrollContainer = document.getElementById('full-page-scroll');
        const targetPage = this.pages[pageIndex];
        const targetScrollTop = targetPage.offsetTop;

        scrollContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });

        // 滚动完成后解除锁定
        setTimeout(() => {
            this.isScrolling = false;
        }, this.scrollDelay);
    },

    updateCurrentPage() {
        const scrollContainer = document.getElementById('full-page-scroll');
        const scrollTop = scrollContainer.scrollTop;

        for (let i = 0; i < this.pages.length; i++) {
            const page = this.pages[i];
            if (scrollTop >= page.offsetTop - window.innerHeight / 2 &&
                scrollTop < page.offsetTop + page.offsetHeight - window.innerHeight / 2) {
                this.currentPage = i;
                break;
            }
        }
    }
};

// ========== 欢迎页滑动切换系统：战双 / 鸣潮 ==========
// 已迁移至 ming-mode/ming.js（IIFE 封装，核心共享 + 模式独立 + 轻量通信）
// 切换接口：window.switchToZhanMode() / window.switchToMode("ming")
// 轻量通信：CustomEvent("ming-mode-switch") + localStorage "global_export_settings"


// 在页面加载完成后初始化滚动控制和附加功能
window.addEventListener('load', () => {
    ScrollControl.init();
	    
    // 初始化导出预览功能
    initializeExportPreview();
});
	// 复制当前场景
	function copyCurrentScene() {
	    if (state.scenes.length === 0) {
	        alert('没有可复制的场景');
	        return;
	    }
	    
	    // 获取当前场景的副本
	    const currentSceneIndex = state.currentSceneIndex;
	    const currentScene = state.scenes[currentSceneIndex];
	    const sceneCopy = JSON.parse(JSON.stringify(currentScene));
	    
	    // 将副本添加到场景数组末尾
	    state.scenes.push(sceneCopy);
	    state.currentSceneIndex = state.scenes.length - 1; // 切换到新复制的场景
	    
	    updatePreview();
	    updateDialogDisplay();
	    renderBackgroundList();
	    updateCharacterListSelection();
	    updateSceneCount();
	    
	    alert(`已成功复制当前场景，新场景为第 ${state.scenes.length} 个`);
	}
	
	// 重命名当前场景（在快照中）
	function renameCurrentScene() {
	    if (state.scenes.length === 0) {
	        alert('没有可重命名的场景');
	        return;
	    }
	    
	    // 如果用户有暂存的快照，可以重命名对应的快照
	    if (state.savedScenes.length > 0) {
	        // 提供一个列表让用户选择要重命名哪个快照
	        let snapshotOptions = '';
	        state.savedScenes.forEach((snapshot, idx) => {
	            const name = snapshot.name || `快照 ${idx + 1}`;
	            snapshotOptions += `${idx + 1}. ${name}\n`;
	        });
	        
	        const input = prompt(
	            `请选择要重命名的快照编号:\n${snapshotOptions}\n\n输入快照编号:`);
	            
	        if (!input) return;
	        
	        const index = parseInt(input) - 1;
	        if (isNaN(index) || index < 0 || index >= state.savedScenes.length) {
	            alert('无效的快照编号');
	            return;
	        }
	        
	        const currentName = state.savedScenes[index].name || `快照 ${index + 1}`;
	        const newName = prompt('请输入新的名称:', currentName);
	        if (newName !== null && newName.trim() !== '') {
	            state.savedScenes[index].name = newName.trim();
	            alert(`已将快照 "${currentName}" 重命名为 "${newName}"`);
	        }
	    } else {
	        alert('暂无暂存的快照可供重命名');
	    }
	}
// ==================== 时间轴功能 ====================

// 生成场景缩略图
async function generateThumbnail(sceneData, width = 120, height = 90) {
    // 创建临时容器来渲染场景
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.visibility = 'hidden';
    tempContainer.style.width = `${width}px`;
    tempContainer.style.height = `${height}px`;
    tempContainer.style.overflow = 'hidden';
    document.body.appendChild(tempContainer);

    try {
        // 渲染场景到临时容器
        await renderSceneToContainer(sceneData, tempContainer, width, height);
        
        // 使用html2canvas生成缩略图
        const canvas = await html2canvas(tempContainer, {
            scale: 0.5, // 使用较低的缩放比例提高性能
            logging: false,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#000'
        });
        
        const thumbnail = canvas.toDataURL('image/png');
        return thumbnail;
    } finally {
        // 清理临时容器
        document.body.removeChild(tempContainer);
    }
}

// 将场景数据渲染到指定容器（支持视频背景）
async function renderSceneToContainer(sceneData, container, width, height) {
    // 设置容器样式
    container.innerHTML = '';
    container.style.backgroundColor = '#000';

    // 创建背景元素（支持视频和图片）
    if (sceneData.background) {
        const isVideoBg = !!sceneData.backgroundIsVideo;

        if (isVideoBg) {
            // 视频背景：创建隐藏的video元素，截取第一帧作为图片
            return new Promise((resolve) => {
                const video = document.createElement('video');
                video.src = sceneData.background;
                video.muted = true;
                video.playsInline = true;
                video.preload = 'auto';

                video.addEventListener('loadeddata', () => {
                    // 将当前帧绘制到canvas，再转为图片显示
                    try {
                        const vCanvas = document.createElement('canvas');
                        vCanvas.width = video.videoWidth || width || 1920;
                        vCanvas.height = video.videoHeight || height || 1080;
                        const vCtx = vCanvas.getContext('2d');
                        vCtx.drawImage(video, 0, 0, vCanvas.width, vCanvas.height);

                        const bgDiv = document.createElement('div');
                        bgDiv.style.position = 'absolute';
                        bgDiv.style.top = '0'; bgDiv.style.left = '0';
                        bgDiv.style.width = '100%'; bgDiv.style.height = '100%';
                        bgDiv.style.backgroundImage = `url(${vCanvas.toDataURL('image/png')})`;
                        bgDiv.style.backgroundSize = 'cover';
                        bgDiv.style.backgroundPosition = 'center';
                        container.appendChild(bgDiv);
                    } catch(e) {
                        // fallback：黑色背景
                    }

                    // 添加角色等后续内容...
                    _renderSceneCharacters(sceneData, container);
                    resolve();
                }, { once: true });

                video.addEventListener('error', () => {
                    _renderSceneCharacters(sceneData, container);
                    resolve();
                }, { once: true });
            });
        } else {
            // 图片背景：原有逻辑不变
            const bgDiv = document.createElement('div');
            bgDiv.style.position = 'absolute';
            bgDiv.style.top = '0';
            bgDiv.style.left = '0';
            bgDiv.style.width = '100%';
            bgDiv.style.height = '100%';
            bgDiv.style.backgroundImage = `url('${sceneData.background}')`;
            bgDiv.style.backgroundSize = 'cover';
            bgDiv.style.backgroundPosition = 'center';
            container.appendChild(bgDiv);
        }
    }

    // 渲染角色和对话框
    _renderSceneContent(sceneData, container);
}

// 辅助函数：渲染场景的角色和对话框内容
function _renderSceneContent(sceneData, container) {
    // 添加角色（简化版）
    if (sceneData.characters && sceneData.characters.length > 0) {
        for (let i = 0; i < sceneData.characters.length && i < 2; i++) {
            const char = sceneData.characters[i];
            const charImg = document.createElement('img');
            charImg.src = char.image;
            charImg.style.position = 'absolute';
            charImg.style.bottom = '0';
            charImg.style.height = '70%';

            if (sceneData.characters.length === 1) {
                charImg.style.left = '50%';
                charImg.style.transform = 'translateX(-50%)';
            } else {
                if (i === 0) {
                    charImg.style.left = '25%';
                    charImg.style.transform = 'translateX(-50%)';
                } else {
                    charImg.style.left = '75%';
                    charImg.style.transform = 'translateX(-50%)';
                }
            }

            charImg.style.maxWidth = '40%';
            charImg.style.objectFit = 'contain';
            charImg.onload = () => {};
            charImg.onerror = () => {};
            container.appendChild(charImg);
        }
    }

    // 添加对话框（简化版）
    if (sceneData.dialogs && sceneData.dialogs.length > 0) {
        const currentDialogIndex = Math.min(sceneData.currentDialogIndex || 0, sceneData.dialogs.length - 1);
        const dialog = sceneData.dialogs[currentDialogIndex];

        if (dialog) {
            const dialogBox = document.createElement('div');
            dialogBox.style.position = 'absolute';
            dialogBox.style.bottom = '0';
            dialogBox.style.left = '0';
            dialogBox.style.width = '100%';
            dialogBox.style.padding = '5px';
            dialogBox.style.background = 'rgba(0, 0, 0, 0.6)';
            dialogBox.style.color = 'white';
            dialogBox.style.fontSize = '8px';
            dialogBox.style.textAlign = 'center';
            dialogBox.style.zIndex = '10';

            dialogBox.textContent = `${dialog.character}: ${dialog.text.substring(0, 20)}${dialog.text.length > 20 ? '...' : ''}`;
            container.appendChild(dialogBox);
        }
    }
}

// 计算场景预计时长
function calculateSceneDuration(sceneData) {
    let duration = 0;
    
    // 检查是否有对话文本
    if (sceneData.dialogs && sceneData.dialogs.length > 0) {
        const currentDialogIndex = Math.min(sceneData.currentDialogIndex || 0, sceneData.dialogs.length - 1);
        const dialog = sceneData.dialogs[currentDialogIndex];
        
        if (dialog && dialog.text) {
            if (state.animationEnabled) {
                // 如果开启打字机动画，时长等于字符数乘以动画速度
                duration += dialog.text.length * (state.animationSpeed || 50);
                // 加上末尾停留时间
                duration += 3000; // 3秒停留时间
            } else {
                // 如果未开启动画，设为固定阅读时间
                duration = 3000; // 3秒
            }
        }
    }
    
    // 如果有指挥官对话，加上额外时长
    if (sceneData.commanderText && sceneData.commanderText.trim()) {
        duration += 2000; // 指挥官对话框滑入动画时长
    }
    
    return duration;
}

// 格式化时长为秒数
function formatDuration(durationMs) {
    return (durationMs / 1000).toFixed(1);
}

// 渲染时间轴
async function renderTimeline() {
    if (!elements.timelineContent) return;
    
    elements.timelineContent.innerHTML = '';
    
    // 遍历所有暂存场景
    for (let i = 0; i < state.savedScenes.length; i++) {
        const sceneData = state.savedScenes[i];
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.dataset.index = i;
        
        // 如果是当前选中的场景，添加活动类
        if (currentLoadedSnapshotIndex === i) {
            item.classList.add('active');
        }
        
        // 生成缩略图
        try {
            const thumbnail = await generateThumbnail(sceneData.scenes[sceneData.currentSceneIndex || 0]);
            const thumbImg = document.createElement('img');
            thumbImg.className = 'timeline-thumbnail';
            thumbImg.src = thumbnail;
            thumbImg.alt = `场景 ${i + 1}`;
            item.appendChild(thumbImg);
        } catch (e) {
            console.error(`生成缩略图失败 ${i}:`, e);
            // 如果生成缩略图失败，使用占位符
            const placeholder = document.createElement('div');
            placeholder.className = 'timeline-thumbnail';
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.backgroundColor = '#333';
            placeholder.style.color = '#666';
            placeholder.style.fontSize = '12px';
            placeholder.textContent = `场景 ${i + 1}`;
            item.appendChild(placeholder);
        }
        
        // 场景序号标签
        const infoDiv = document.createElement('div');
        infoDiv.className = 'timeline-info';
        const snapshotName = sceneData.name || `快照 ${i + 1}`;
        infoDiv.textContent = `${snapshotName} (${i + 1})`;
        item.appendChild(infoDiv);
        
        // 预计时长文本
        const duration = calculateSceneDuration(sceneData.scenes[sceneData.currentSceneIndex || 0]);
        const durationSpan = document.createElement('span');
        durationSpan.className = 'timeline-duration';
        durationSpan.textContent = `${formatDuration(duration)}s`;
        item.appendChild(durationSpan);
        
        // 点击事件：加载该场景到编辑区
        item.addEventListener('click', () => {
            loadSceneFromTimeline(i);
        });
        
        // 启用拖拽属性
        item.draggable = true;
        setupDragEvents(item);
        
        elements.timelineContent.appendChild(item);
    }
}

// 设置拖拽事件
function setupDragEvents(element) {
    element.addEventListener('dragstart', handleDragStart);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);
    element.addEventListener('dragend', handleDragEnd);
}

// 拖拽开始
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.index);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

// 拖拽经过
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

// 拖拽进入
function handleDragEnter(e) {
    e.preventDefault();
    e.target.closest('.timeline-item').classList.add('drag-over');
}

// 拖拽离开
function handleDragLeave(e) {
    e.target.closest('.timeline-item').classList.remove('drag-over');
}

// 拖拽放下
function handleDrop(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.timeline-item');
    if (dropTarget) {
        dropTarget.classList.remove('drag-over');
        const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const targetIndex = parseInt(dropTarget.dataset.index);
        
        if (!isNaN(draggedIndex) && !isNaN(targetIndex) && draggedIndex !== targetIndex) {
            moveSceneInTimeline(draggedIndex, targetIndex);
        }
    }
}

// 拖拽结束
function handleDragEnd(e) {
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.classList.remove('dragging');
        item.classList.remove('drag-over');
    });
}

// 从时间轴加载场景
function loadSceneFromTimeline(index) {
    if (index >= 0 && index < state.savedScenes.length) {
        restoreSnapshotScene(index);
        currentLoadedSnapshotIndex = index;
        loadedSnapshotModified = false;
        updateMainSaveButtonsVisibility();
        
        // 更新其他UI组件的选中状态
        updateTimelineSelection();
    }
}

// 更新时间轴选中状态
function updateTimelineSelection() {
    if (!elements.timelineContent) return;
    
    // 移除所有活动类
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 为当前选中的项添加活动类
    if (currentLoadedSnapshotIndex !== null) {
        const activeItem = elements.timelineContent.querySelector(`[data-index="${currentLoadedSnapshotIndex}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }
}

// 在时间轴中移动场景
function moveSceneInTimeline(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= state.savedScenes.length ||
        toIndex < 0 || toIndex >= state.savedScenes.length) {
        return;
    }
    
    // 交换数组中的位置
    const movedScene = state.savedScenes.splice(fromIndex, 1)[0];
    state.savedScenes.splice(toIndex, 0, movedScene);
    
    // 如果当前正在编辑被移动的场景，更新索引
    if (currentLoadedSnapshotIndex === fromIndex) {
        currentLoadedSnapshotIndex = toIndex;
    } else if (currentLoadedSnapshotIndex === toIndex && fromIndex < toIndex) {
        // 如果是从前面移到后面，当前索引会受到影响
        currentLoadedSnapshotIndex = currentLoadedSnapshotIndex - 1;
    } else if (currentLoadedSnapshotIndex === toIndex && fromIndex > toIndex) {
        // 如果是从后面移到前面，当前索引会受到影响
        currentLoadedSnapshotIndex = currentLoadedSnapshotIndex + 1;
    }
    
    // 重新渲染时间轴
    renderTimeline();
}

// ==================== 导出预览功能 ====================

// 拦截全部导出按钮事件
function setupExportPreview() {
    // 保存原来的全部导出按钮点击事件
    const originalExportAllLeft = elements.exportAllBtnLeft.onclick;
    const originalExportAllRight = elements.exportAllBtnRight.onclick;
    
    // 替换为预览功能
    if (elements.exportAllBtnLeft) {
        elements.exportAllBtnLeft.onclick = function(e) {
            e.preventDefault();
            showExportPreviewModal('gif'); // 默认GIF格式
        };
    }
    
    if (elements.exportAllBtnRight) {
        elements.exportAllBtnRight.onclick = function(e) {
            e.preventDefault();
            showExportPreviewModal('gif'); // 默认GIF格式
        };
    }
}

// 显示导出预览模态框
async function showExportPreviewModal(format = 'gif') {
    if (!elements.exportPreviewModal) return;
    
    // 显示模态框
    elements.exportPreviewModal.style.display = 'flex';
    
    // 渲染预览列表
    await renderExportPreviewList();
    
    // 更新总计信息
    updateExportPreviewSummary();
    
    // 设置确认导出按钮事件
    if (elements.confirmExportBtn) {
        elements.confirmExportBtn.onclick = () => {
            // 根据打字机动画开关决定导出格式，不再使用传入的参数
            performFilteredExport();
        };
    }
    
    // 设置取消按钮事件
    if (elements.cancelExportBtn) {
        elements.cancelExportBtn.onclick = closeExportPreviewModal;
    }
    
    // 设置关闭按钮事件
    if (document.querySelector('#export-preview-modal .modal-close')) {
        document.querySelector('#export-preview-modal .modal-close').onclick = closeExportPreviewModal;
    }
}

// 渲染导出预览列表
async function renderExportPreviewList() {
    if (!elements.exportPreviewList) return;
    
    elements.exportPreviewList.innerHTML = '';
    
    for (let i = 0; i < state.savedScenes.length; i++) {
        const sceneData = state.savedScenes[i];
        const item = document.createElement('div');
        item.className = 'export-preview-item';
        
        // 生成缩略图
        try {
            const thumbnail = await generateThumbnail(sceneData.scenes[sceneData.currentSceneIndex || 0], 160, 90);
            const thumbImg = document.createElement('img');
            thumbImg.className = 'export-preview-thumb';
            thumbImg.src = thumbnail;
            thumbImg.alt = `场景 ${i + 1}`;
            item.appendChild(thumbImg);
        } catch (e) {
            console.error(`生成预览缩略图失败 ${i}:`, e);
            const placeholder = document.createElement('div');
            placeholder.className = 'export-preview-thumb';
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.backgroundColor = '#333';
            placeholder.style.color = '#666';
            placeholder.style.fontSize = '12px';
            placeholder.textContent = `场景 ${i + 1}`;
            item.appendChild(placeholder);
        }
        
        // 场景信息
        const infoDiv = document.createElement('div');
        infoDiv.className = 'export-preview-info';
        const snapshotName = sceneData.name || `快照 ${i + 1}`;
        infoDiv.textContent = `${snapshotName} (${i + 1})`;
        item.appendChild(infoDiv);
        
        // 复选框容器
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'export-checkbox-container';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'export-checkbox';
        checkbox.checked = true; // 默认全选
        checkbox.dataset.index = i;
        checkboxContainer.appendChild(checkbox);
        item.appendChild(checkboxContainer);
        
        // 检查是否为空场景，显示警告图标
        if (isSceneEmpty(sceneData.scenes[sceneData.currentSceneIndex || 0])) {
            const warningIcon = document.createElement('span');
            warningIcon.className = 'warning-icon';
            warningIcon.title = '此场景内容为空，导出时可能显示为黑屏';
            warningIcon.innerHTML = '⚠';
            item.appendChild(warningIcon);
        }
        
        // 预计时长（仅在开启打字机动画时显示）
        if (state.animationEnabled) {
            const duration = calculateSceneDuration(sceneData.scenes[sceneData.currentSceneIndex || 0]);
            const durationLabel = document.createElement('div');
            durationLabel.style.fontSize = '10px';
            durationLabel.style.marginTop = '-5px';
            durationLabel.textContent = `${formatDuration(duration)}s`;
            item.appendChild(durationLabel);
        }
        
        elements.exportPreviewList.appendChild(item);
    }
}

// 检查场景是否为空
function isSceneEmpty(sceneData) {
    // 如果没有对话且没有指挥官文本，则认为是空场景
    const hasDialog = sceneData.dialogs && sceneData.dialogs.length > 0 && 
                      sceneData.dialogs.some(d => d.text && d.text.trim());
    const hasCommanderText = sceneData.commanderText && sceneData.commanderText.trim();
    
    return !hasDialog && !hasCommanderText;
}

// 更新导出预览摘要信息
function updateExportPreviewSummary() {
    if (!elements.totalScenesCount || !elements.totalDuration) return;
    
    const checkboxes = document.querySelectorAll('.export-checkbox');
    let selectedCount = 0;
    let totalDuration = 0;
    
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedCount++;
            // 仅在开启打字机动画时计算总时长
            if (state.animationEnabled) {
                const index = parseInt(checkbox.dataset.index);
                if (!isNaN(index) && index < state.savedScenes.length) {
                    const sceneData = state.savedScenes[index].scenes[state.savedScenes[index].currentSceneIndex || 0];
                    totalDuration += calculateSceneDuration(sceneData);
                }
            }
        }
    });
    
    elements.totalScenesCount.textContent = selectedCount;
    // 仅在开启打字机动画时显示总时长，否则显示"-"
    elements.totalDuration.textContent = state.animationEnabled ? formatDuration(totalDuration) : '-';
}

// 关闭导出预览模态框
function closeExportPreviewModal() {
    if (elements.exportPreviewModal) {
        elements.exportPreviewModal.style.display = 'none';
    }
}

// 执行筛选后的导出
function performFilteredExport() {
    // 获取选中的场景索引
    const checkboxes = document.querySelectorAll('.export-checkbox:checked');
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index)).filter(i => !isNaN(i));
    
    if (selectedIndices.length === 0) {
        alert('请至少选择一个要导出的场景');
        return;
    }
    
    // 创建临时场景数组用于导出
    const tempScenes = [];
    selectedIndices.forEach(index => {
        if (index >= 0 && index < state.savedScenes.length) {
            tempScenes.push(state.savedScenes[index]);
        }
    });
    
    // 根据打字机动画开关决定导出格式
    // 开启打字机动画 -> 导出GIF，未开启 -> 导出PNG
    const exportFormat = state.animationEnabled ? 'gif' : 'png';
    
    // 使用临时数组执行导出
    const originalScenes = [...state.savedScenes]; // 保存原始数据
    
    // 注意：这里我们不能直接修改state.savedScenes，因为这会影响其他功能
    // 我们需要创建一个临时环境来导出特定的场景集合
    exportSelectedScenes(tempScenes, exportFormat);
    
    // 关闭模态框
    closeExportPreviewModal();
}

// 导出选中的场景
async function exportSelectedScenes(scenesToExport, format) {
    if (scenesToExport.length === 0) return;
    
    // 根据格式执行不同的导出操作
    switch (format) {
        case 'gif':
            await exportMultipleAsGif(scenesToExport);
            break;
        case 'png':
            await exportMultipleAsPng(scenesToExport);
            break;
        case 'mp4':
            await exportMultipleAsMp4(scenesToExport);
            break;
        default:
            await exportMultipleAsPng(scenesToExport);
            break;
    }
}

// 修改现有的导出函数以接受特定场景数组
async function exportMultipleAsGif(scenesArray) {
    if (!scenesArray || scenesArray.length === 0) {
        alert('没有可导出的场景');
        return;
    }

    const gif = new GIF({
        workers: 2,
        quality: state.gifQuality || 1,
        width: state.exportResolution || 1920,
        height: Math.round((state.exportResolution || 1920) * 9 / 16),
        workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
    });

    showExportProgress('导出GIF中', true);

    let frameCount = 0;
    const totalFrames = scenesArray.reduce((total, scene) => {
        const sceneData = scene.scenes[scene.currentSceneIndex || 0];
        return total + getFrameCountForScene(sceneData);
    }, 0);

    // 存储当前状态以便恢复
    const currentState = JSON.parse(JSON.stringify(state));

    try {
        for (let i = 0; i < scenesArray.length; i++) {
            const sceneSnapshot = scenesArray[i];

            // 临时替换当前状态
            state = JSON.parse(JSON.stringify(sceneSnapshot));

            // 更新预览以匹配当前场景
            updatePreview();

            // 为当前场景生成帧
            const frames = await captureSceneFrames(state.scenes[state.currentSceneIndex || 0]);

            for (const frame of frames) {
                gif.addFrame(frame.canvas, { delay: frame.delay });
                frameCount++;

                // 更新进度
                const progress = (frameCount / totalFrames) * 100;
                const currentSceneProgress = ((i + 1) / scenesArray.length) * 100;
                
                updateExportProgress(progress, `正在导出第 ${i + 1}/${scenesArray.length} 个场景`);
                updateAllExportProgress(currentSceneProgress, i + 1, scenesArray.length);

                // 检查是否取消
                if (exportCancelled) {
                    gif.abort();
                    hideExportProgress();
                    exportCancelled = false;
                    return;
                }
            }
        }

        gif.on('finished', async (blob) => {
            hideExportProgress();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `战双剧情_${Date.now()}.gif`;
            link.click();
            URL.revokeObjectURL(url);
        });

        gif.render();
    } catch (error) {
        console.error('导出GIF时发生错误:', error);
        hideExportProgress();
        alert('导出GIF时发生错误，请重试');
    } finally {
        // 恢复原始状态
        state = JSON.parse(JSON.stringify(currentState));
        updatePreview(); // 恢复预览到原来的状态
    }
}

// 获取场景的帧数
function getFrameCountForScene(sceneData) {
    // 简化的计算方法，实际应根据动画设置更精确地计算
    return 30; // 假设每个场景30帧
}

// 捕获场景帧
async function captureSceneFrames(sceneData) {
    const frames = [];
    const canvas = document.createElement('canvas');
    canvas.width = state.exportResolution || 1920;
    canvas.height = Math.round((state.exportResolution || 1920) * 9 / 16);
    const ctx = canvas.getContext('2d');

    // 这里应该根据实际场景和动画逻辑生成多帧
    // 为了简化，我们只返回一帧
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.visibility = 'hidden';
    tempContainer.style.width = `${canvas.width}px`;
    tempContainer.style.height = `${canvas.height}px`;
    tempContainer.style.overflow = 'hidden';
    document.body.appendChild(tempContainer);

    try {
        await renderSceneToContainer(sceneData, tempContainer, canvas.width, canvas.height);
        const renderedCanvas = await html2canvas(tempContainer, {
            canvas: canvas,
            scale: 1,
            logging: false,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null
        });

        frames.push({
            canvas: renderedCanvas,
            delay: 500 // 500ms延迟
        });
    } finally {
        document.body.removeChild(tempContainer);
    }

    return frames;
}

// 导出选中的场景为MP4
async function exportMultipleAsMp4(scenesArray) {
    if (!scenesArray || scenesArray.length === 0) {
        alert('没有可导出的场景');
        return;
    }

    showExportProgress('导出MP4中', true);

    // 存储当前状态以便恢复
    const currentState = JSON.parse(JSON.stringify(state));

    try {
        // 创建临时视频元素
        const video = document.createElement('video');
        video.autoplay = false;
        video.muted = true;
        video.style.position = 'fixed';
        video.style.left = '0';
        video.style.top = '0';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        document.body.appendChild(video);

        // 创建MediaRecorder
        const stream = video.captureStream();
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: (state.mp4Quality || 5) * 2000000 // 根据质量调整比特率
        });

        const chunks = [];
        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        let recordingStartTime = Date.now();
        mediaRecorder.onstop = async () => {
            hideExportProgress();

            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `战双剧情_${Date.now()}.mp4`;
            link.click();
            URL.revokeObjectURL(url);

            document.body.removeChild(video);
        };

        mediaRecorder.start();

        for (let i = 0; i < scenesArray.length; i++) {
            const sceneSnapshot = scenesArray[i];

            // 临时替换当前状态
            state = JSON.parse(JSON.stringify(sceneSnapshot));

            // 更新预览以匹配当前场景
            updatePreview();

            // 捕获当前帧并发送到流
            const canvas = document.createElement('canvas');
            canvas.width = state.exportResolution || 1920;
            canvas.height = Math.round((state.exportResolution || 1920) * 9 / 16);
            const ctx = canvas.getContext('2d');

            // 使用html2canvas捕获当前预览内容
            const previewContainer = elements.previewContainer || document.querySelector('#preview-container');
            if (previewContainer) {
                // 添加亮度增强蒙版（如果是战双新版模式）
                _addBrightnessOverlay();
                _shiftCharacterNameForExport();
                
                const capturedCanvas = await html2canvas(previewContainer, {
                    canvas: canvas,
                    scale: 1,
                    logging: false,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                });
                
                // 移除亮度增强蒙版
                _removeBrightnessOverlay();
                _restoreCharacterNameAfterExport();

                // 将捕获的画面绘制到视频流中
                const track = stream.getVideoTracks()[0];
                if (track) {
                    const imageCapture = new ImageCapture(track);
                    // 注意：这里简化处理，实际可能需要更复杂的视频编码逻辑
                }
            }

            // 模拟每帧持续时间（基于场景时长）
            const sceneData = sceneSnapshot.scenes[sceneSnapshot.currentSceneIndex || 0];
            const duration = calculateSceneDuration(sceneData);
            
            // 更新进度
            const progress = ((i + 1) / scenesArray.length) * 100;
            updateExportProgress(progress, `正在导出第 ${i + 1}/${scenesArray.length} 个场景 (${formatDuration(duration)}s)`);

            // 检查是否取消
            if (exportCancelled) {
                mediaRecorder.stop();
                hideExportProgress();
                exportCancelled = false;
                return;
            }

            // 等待一段时间模拟动画播放
            await sleep(Math.min(duration, 5000)); // 最大等待5秒
        }

        mediaRecorder.stop();
    } catch (error) {
        console.error('导出MP4时发生错误:', error);
        hideExportProgress();
        alert('导出MP4时发生错误，请重试');
    } finally {
        // 恢复原始状态
        state = JSON.parse(JSON.stringify(currentState));
        updatePreview(); // 恢复预览到原来的状态
    }
}

// 导出多个场景为PNG格式
async function exportMultipleAsPng(scenesArray) {
    if (!scenesArray || scenesArray.length === 0) {
        alert('没有可导出的场景');
        return;
    }

    showExportProgress('导出PNG中', true);
    showAllExportProgress(0, scenesArray.length);

    const targetWidth = state.exportResolution || 1920;
    const targetHeight = Math.round(targetWidth / (16 / 9));

    try {
        for (let i = 0; i < scenesArray.length; i++) {
            if (state.shouldCancelExport) {
                hideExportProgress();
                return;
            }

            const sceneData = scenesArray[i];
            restoreState(sceneData);
            updatePreview();

            // 等待渲染完成
            await new Promise(resolve => setTimeout(resolve, 100));

            // 导出当前场景为PNG
            const canvas = await html2canvas(elements.previewContainer, {
                scale: targetWidth / elements.previewContainer.offsetWidth,
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                logging: false
            });

            // 创建最终画布
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = targetWidth;
            finalCanvas.height = targetHeight;
            const ctx = finalCanvas.getContext('2d');

            // 绘制背景色
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            // 绘制导出的内容
            ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

            // 下载文件
            const link = document.createElement('a');
            const fileName = sceneData.name ? `${sceneData.name}.png` : `scene_${i + 1}_${targetWidth}x${targetHeight}.png`;
            link.download = fileName;
            link.href = finalCanvas.toDataURL('image/png', state.exportPngQuality);
            link.click();

            // 更新进度
            updateExportProgress(
                Math.round(((i + 1) / scenesArray.length) * 100),
                `正在导出第 ${i + 1}/${scenesArray.length} 个场景...`
            );
            showAllExportProgress(i + 1, scenesArray.length);

            // 等待一小段时间避免浏览器卡顿
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // 完成导出
        updateExportProgress(100, '导出完成！');
        setTimeout(() => {
            hideExportProgress();
            alert(`成功导出 ${scenesArray.length} 个PNG文件！`);
        }, 500);

    } catch (error) {
        console.error('导出PNG时发生错误:', error);
        hideExportProgress();
        alert('导出PNG时发生错误，请重试');
    }
}

// 辅助函数：睡眠
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 初始化导出预览功能
function initializeExportPreview() {
    setupExportPreview();
    
    // 为复选框添加事件监听器以实时更新统计信息
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('export-checkbox')) {
            updateExportPreviewSummary();
        }
    }, true); // 使用事件捕获确保能监听到动态添加的元素
}

// ========== 鸣潮飞讯模式系统 ==========
// 已迁移至 ming-mode/ming.js（FeixunSystem 完整联系人数据结构与消息渲染逻辑）
// 鸣潮版不含 commander-dialog（指挥官对话）逻辑，与战双版底层相互独立
// 用户配置与工程数据通过 localStorage "global_export_settings" 互通
