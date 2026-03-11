// 深拷贝场景状态（用于历史栈）
function cloneState() {
    return {
        scenes: JSON.parse(JSON.stringify(state.scenes)),
        currentSceneIndex: state.currentSceneIndex
    };
}

// 克隆当前状态并包含输入框中的未保存内容（用于下一句前的压栈）
function cloneStateWithCurrentInput() {
    const snapshot = cloneState();
    if (state.scenes.length > 0) {
        const scene = state.scenes[state.currentSceneIndex];
        const snapshotScene = snapshot.scenes[state.currentSceneIndex];
        const characterName = elements.characterName.value.trim() || '???';
        const dialogueText = elements.dialogInput.value.trim();
        console.log('cloneStateWithCurrentInput - 输入框文本:', dialogueText);
        console.log('cloneStateWithCurrentInput - currentDialogIndex:', snapshotScene.currentDialogIndex, 'dialogs.length:', snapshotScene.dialogs.length);
        if (snapshotScene.currentDialogIndex < snapshotScene.dialogs.length) {
            // 更新现有对话，但仅当输入框有内容时才更新文本，避免用空文本覆盖已有内容
            if (dialogueText) {
                snapshotScene.dialogs[snapshotScene.currentDialogIndex] = { character: characterName, text: dialogueText };
                console.log('cloneStateWithCurrentInput - 更新现有对话');
            } else {
                console.log('cloneStateWithCurrentInput - 输入框为空，保留原有对话内容');
            }
        } else if (dialogueText) {
            snapshotScene.dialogs.push({ character: characterName, text: dialogueText });
            snapshotScene.currentDialogIndex = snapshotScene.dialogs.length - 1;
            console.log('cloneStateWithCurrentInput - 添加新对话');
        } else {
            console.log('cloneStateWithCurrentInput - 文本为空，未添加对话');
        }
        console.log('cloneStateWithCurrentInput - 保存后的dialogs:', JSON.parse(JSON.stringify(snapshotScene.dialogs)));
    }
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
    // 指挥官格式化控件（完整版本 - 已删除）

    // 保留对已删除元素的引用（用于避免错误）
    dialogColorPicker: null,
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
    saveSnapshotRight: document.getElementById('save-snapshot-right')
};

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

    updateSceneCount();
    updateFoldButtonTitles();
    elements.app.classList.toggle('left-panel-folded', state.leftPanelFolded);
    elements.app.classList.toggle('right-panel-folded', state.rightPanelFolded);
}

// 创建新场景
function createScene() {
    const newScene = {
        id: Date.now(),
        background: state.backgrounds.length > 0 ? state.backgrounds[0].url : null,
        characters: [],
        dialogs: [],
        currentDialogIndex: 0,
        commanderText: ''
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
        characters: JSON.parse(JSON.stringify(cur.characters || [])),
        dialogs: [],
        currentDialogIndex: 0,
        commanderText: ''
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

    // 文本格式化 - 对话输入框（compact版本）
    if (elements.dialogColorInputCompact) {
        elements.dialogColorInputCompact.addEventListener('input', (e) => {
            state.textFormatting.dialog.color = e.target.value;
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
    elements.exportAllBtnLeft.addEventListener('click', exportAllScenes);
    elements.exportAllBtnRight.addEventListener('click', exportAllScenes);
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
        state.isTypingUnsaved = val.trim().length > 0;
        if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
    });
    
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
    });
    
    // 指挥官文本输入
    elements.commanderText.addEventListener('input', (e) => {
        if (state.scenes.length > 0) {
            state.scenes[state.currentSceneIndex].commanderText = e.target.value;
            if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
        }
    });
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

// 处理背景上传
function handleBackgroundUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const background = {
            id: Date.now(),
            name: file.name,
            url: e.target.result
        };
        state.backgrounds.push(background);
        renderBackgroundList();
        
        // 自动设置为当前场景背景
        if (state.scenes.length > 0) {
            state.scenes[state.currentSceneIndex].background = background.url;
            updatePreview();
            if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
        }
    };
    reader.readAsDataURL(file);
}

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
    state.backgrounds.forEach((bg) => {
        const item = document.createElement('div');
        item.className = 'image-grid-item';
        
        const currentScene = state.scenes[state.currentSceneIndex];
        if (currentScene && currentScene.background === bg.url) {
            item.classList.add('selected');
        }
        
        item.innerHTML = `<img src="${bg.url}" alt="${bg.name}">`;
        item.addEventListener('click', () => {
            if (state.scenes.length > 0) {
                state.scenes[state.currentSceneIndex].background = bg.url;
                renderBackgroundList();
                updatePreview();
                // 如果正在编辑已加载的快照，标记为已修改
                if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
            }
        });
        elements.backgroundList.appendChild(item);
    });
}

// 渲染角色列表
function renderCharacterList() {
    const html = state.uploadedCharacters.map(char => `
        <div class="image-grid-item" data-char-id="${char.id}">
            <img src="${char.url}" alt="${char.name}">
        </div>
    `).join('');
    
    elements.leftCharacterList.innerHTML = html;
    elements.rightCharacterList.innerHTML = html;
    
    // 添加点击事件
    [...elements.leftCharacterList.children].forEach((item, index) => {
        item.addEventListener('click', () => {
            toggleCharacterSelection(state.uploadedCharacters[index]);
        });
    });
    
    [...elements.rightCharacterList.children].forEach((item, index) => {
        item.addEventListener('click', () => {
            toggleCharacterSelection(state.uploadedCharacters[index]);
        });
    });
    
    // 更新选中状态
    updateCharacterListSelection();
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
        return;
    }
    
    const currentScene = state.scenes[state.currentSceneIndex];
    
    // 更新背景
    if (currentScene.background) {
        elements.previewBackground.style.backgroundImage = `url(${currentScene.background})`;
    } else {
        elements.previewBackground.style.backgroundImage = '';
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
    
    // 根据当前场景是否有指挥官文本来显示/隐藏指挥官对话框
    const hasCommanderText = currentScene.commanderText && currentScene.commanderText.trim().length > 0;
    elements.commanderDialog.style.display = hasCommanderText ? 'flex' : 'none';
    
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
        // 显示已保存的对话文本，并清除未保存标记
        elements.dialogInput.value = dialog.text || '';
        state.isTypingUnsaved = false;
    } else {
        elements.characterName.value = '???';
        // 仅在用户当前没有未保存输入时才清空输入框，避免切换角色/背景时覆盖用户正在输入的文本
        if (!state.isTypingUnsaved) {
            elements.dialogInput.value = '';
        }
    }
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
    
    // 如果当前有对话，更新它
    if (currentScene.currentDialogIndex < currentScene.dialogs.length) {
        currentScene.dialogs[currentScene.currentDialogIndex] = {
            character: name,
            text: text
        };
    } else {
        // 添加新对话
        currentScene.dialogs.push({
            character: name,
            text: text
        });
        currentScene.currentDialogIndex = currentScene.dialogs.length - 1;
    }
    
    // 清空输入框准备下一句
    elements.dialogInput.value = '';
    state.isTypingUnsaved = false;
    if (currentLoadedSnapshotIndex !== null) markLoadedSnapshotModified();
}

// 下一句 - 保存当前画面到栈，仅重置对话文本（与 handleNextLine 逻辑一致）
function nextDialog() {
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
    // 先保存当前状态到历史快照栈（包含输入框中的未保存内容）
    state.savedScenes.push(cloneStateWithCurrentInput());

    // 保存当前对话到当前场景
    addDialog();
    
    // 创建新场景（重置背景和角色）
    createScene();
    
    elements.characterName.value = '???';
    elements.dialogInput.value = '';
    elements.commanderText.value = '';
    
    updatePreview();
    renderBackgroundList();
    updateCharacterListSelection();
    updateDialogDisplay();
    // 更新计数以反映新增的暂存
    updateSceneCount();
}

// 切换指挥官对话框显示/隐藏
function toggleCommanderDialog() {
    const currentScene = state.scenes[state.currentSceneIndex];
    if (!currentScene) return;

    const isVisible = elements.commanderDialog.style.display !== 'none';

    if (!isVisible) {
        // 显示对话框：聚焦到输入框
        elements.commanderDialog.style.display = 'flex';
        elements.commanderText.focus();
    } else {
        // 隐藏对话框：清空当前场景的指挥官文本
        elements.commanderDialog.style.display = 'none';
        currentScene.commanderText = '';
        elements.commanderText.value = '';
    }
}

// 撤回 - 从历史栈弹出并恢复上一场景全部状态
function undoLastDialog() {
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
        info.textContent = `快照 ${idx + 1} · 场景 ${sceneIdx + 1}`;
        item.appendChild(info);

        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn btn-primary snapshot-load-btn';
        loadBtn.textContent = '加载到编辑区';

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
    const newScene = {
        id: Date.now(),
        background: state.backgrounds.length > 0 ? state.backgrounds[0].url : null,
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

// 更新对齐按钮激活状态
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
function updateExportProgress(percent, text) {
    if (elements.exportProgressBar) {
        elements.exportProgressBar.style.width = percent + '%';
    }
    if (elements.exportProgressText) {
        elements.exportProgressText.textContent = text;
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

        const canvas = await html2canvas(elements.previewContainer, {
            backgroundColor: '#000',
            scale: scale,
            logging: false,
            useCORS: true,
            allowTaint: true
        });

        // 调整画布到精确的16:9尺寸
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetWidth;
        finalCanvas.height = targetHeight;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

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

    // 根据state.exportAllFormat决定导出方式
    const actualFormat = state.exportAllFormat === 'mp4' ? 'mp4_merged' : 'gif';

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

    // GIF分片导出
    const formatText = 'GIF动画';
    const modeText = fastMode ? '(快速模式)' : '';
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
// 修复：根据实际选择的导出格式 (actualFormat) 决定，而非函数参数默认值
// 注意：actualFormat 在函数开头已定义为 'gif' 或 'mp4_merged'
// 如果能执行到这里，说明 actualFormat 必然是 'gif' (因为 'mp4_merged' 已提前 return)
if (actualFormat === 'gif') {
    // 强制使用 GIF 导出，尊重 UI 上的"GIF 分片"选择
    await exportGIF(state.currentSceneIndex, `${fileBase}.gif`, true, fastMode);
} else {
    // 理论上不会执行到这里，作为 fallback 保留 PNG 导出
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
                const previewCanvas = await html2canvas(elements.previewContainer, {
                    backgroundColor: '#000',
                    scale: scale,
                    logging: false,
                    useCORS: true,
                    allowTaint: true
                });

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, targetWidth, targetHeight);
                ctx.drawImage(previewCanvas, 0, 0, targetWidth, targetHeight);
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

                for (let i = 0; i <= textFrames; i++) {
                    elements.dialogInput.value = state.animationEnabled ? text.substring(0, i) : text;
                    await new Promise(resolve => setTimeout(resolve, state.animationEnabled ? state.animationSpeed : 50));
                    await captureFrame();
                }

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
    const formatText = format === 'mp4' ? 'MP4视频' : (format === 'gif' ? 'GIF动画' : '画面');
    let message = `${formatText}导出完成!\n成功: ${success}/${state.exportAllProgress.total}`;
    if (state.exportAllProgress.failed > 0) {
        message += `\n失败: ${state.exportAllProgress.failed}`;
    }

    hideExportProgress();
    alert(message);
}

// 根据动画开关选择导出类型
function exportScene() {
    if (state.animationEnabled) {
        exportGIF();
    } else {
        exportCanvas();
    }
}

// 导出为 GIF 动画
async function exportGIF(sceneIndex = state.currentSceneIndex, filename = null, silentMode = false, fastMode = false) {
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

    // 如果输入框有文本但还未保存，先保存它
    if (inputText && (!currentScene.dialogs || currentScene.currentDialogIndex >= currentScene.dialogs.length)) {
        const name = elements.characterName.value.trim() || '???';
        currentScene.dialogs.push({
            character: name,
            text: inputText
        });
        currentScene.currentDialogIndex = currentScene.dialogs.length - 1;
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
            const canvas = await html2canvas(elements.previewContainer, {
                backgroundColor: '#000',
                scale: scale,
                logging: false,
                useCORS: true,
                allowTaint: true
            });

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = targetWidth;
            finalCanvas.height = targetHeight;
            const ctx = finalCanvas.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

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

                    elements.dialogInput.value = textToShow;

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

    // 如果输入框有文本但还未保存，先保存它
    if (inputText && (!currentScene.dialogs || currentScene.currentDialogIndex >= currentScene.dialogs.length)) {
        const name = elements.characterName.value.trim() || '???';
        currentScene.dialogs.push({
            character: name,
            text: inputText
        });
        currentScene.currentDialogIndex = currentScene.dialogs.length - 1;
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
            const previewCanvas = await html2canvas(elements.previewContainer, {
                backgroundColor: '#000',
                scale: scale,
                logging: false,
                useCORS: true,
                allowTaint: true
            });
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(previewCanvas, 0, 0, targetWidth, targetHeight);
            
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

            for (let i = 0; i <= textFrames; i++) {
                elements.dialogInput.value = state.animationEnabled ? text.substring(0, i) : text;
                await new Promise(resolve => setTimeout(resolve, state.animationEnabled ? state.animationSpeed : 100));
                await captureFrame();
            }

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

// 在页面加载完成后初始化滚动控制
window.addEventListener('load', () => {
    ScrollControl.init();
});
