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
        if (snapshotScene.currentDialogIndex < snapshotScene.dialogs.length) {
            snapshotScene.dialogs[snapshotScene.currentDialogIndex] = { character: characterName, text: dialogueText };
        } else if (dialogueText) {
            snapshotScene.dialogs.push({ character: characterName, text: dialogueText });
            snapshotScene.currentDialogIndex = snapshotScene.dialogs.length - 1;
        }
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
    dialogFontSize: 14,
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
    // 字体调整控件（右侧面板）
    dialogFontSizeSlider: document.getElementById('dialog-font-size'),
    dialogFontSizeValue: document.getElementById('dialog-font-size-value'),
    
    // 导出按钮
    exportBtnLeft: document.getElementById('export-btn-left'),
    exportAllBtnLeft: document.getElementById('export-all-btn-left'),
    exportGifBtnLeft: document.getElementById('export-gif-btn-left'),
    exportBtnRight: document.getElementById('export-btn-right'),
    exportAllBtnRight: document.getElementById('export-all-btn-right'),
    exportGifBtnRight: document.getElementById('export-gif-btn-right'),
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
    viewSavedRight: document.getElementById('view-saved-right')
    ,
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
    // 应用并同步对话框字体大小
    if (elements.dialogFontSizeSlider) elements.dialogFontSizeSlider.value = state.dialogFontSize;
    if (elements.dialogFontSizeValue) elements.dialogFontSizeValue.textContent = state.dialogFontSize;
    if (elements.dialogInput) elements.dialogInput.style.fontSize = state.dialogFontSize + 'px';
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

    // 对话框字体大小（右侧面板）
    if (elements.dialogFontSizeSlider) {
        elements.dialogFontSizeSlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            state.dialogFontSize = v;
            if (elements.dialogFontSizeValue) elements.dialogFontSizeValue.textContent = v;
            if (elements.dialogInput) elements.dialogInput.style.fontSize = v + 'px';
        });
    }
    
    // 导出按钮
    elements.exportBtnLeft.addEventListener('click', exportScene);
    elements.exportBtnRight.addEventListener('click', exportScene);
    elements.exportAllBtnLeft.addEventListener('click', exportAllScenes);
    elements.exportAllBtnRight.addEventListener('click', exportAllScenes);
    elements.exportGifBtnLeft.addEventListener('click', () => exportGIF());
    elements.exportGifBtnRight.addEventListener('click', () => exportGIF());
    
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
        }
        
        charDiv.innerHTML = `<img src="${char.image}" alt="${char.name}">`;
        elements.characterLayer.appendChild(charDiv);
    });
    
    // 更新指挥官对话框
    elements.commanderText.value = currentScene.commanderText || '';
    
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
    
    // 压入栈：保存当前画面（backgroundImage, characterImages, characterName, dialogueText 等）
    state.savedScenes.push(cloneStateWithCurrentInput());
    // 保存当前对话到当前场景
    addDialog();

    // 当前场景已包含保存的对话，接着创建一个新场景（保留背景与角色，但清空 dialogs），并切换到该场景
    const newScene = duplicateCurrentSceneForNextLine();

    // 只重置对话文本
    elements.dialogInput.value = '请输入文本。';
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
    // 先保存当前状态到历史快照栈
    state.savedScenes.push(cloneState());
    
    // 保存当前对话
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
    const isVisible = elements.commanderDialog.style.display !== 'none';
    elements.commanderDialog.style.display = isVisible ? 'none' : 'flex';
    
    // 如果显示对话框，聚焦到输入框
    if (!isVisible) {
        elements.commanderText.focus();
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

// 更新主控保存按钮（靠近“查看暂存”）的显示状态
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
    // 只有当末尾不是空白页时才追加
    if (!state.savedScenes.length || !isInitialSnapshot(state.savedScenes[state.savedScenes.length - 1])) {
        state.savedScenes.push(createInitialSnapshot());
        // 自动切换到新增的空白页
        const newIdx = state.savedScenes.length - 1;
        restoreSnapshotScene(newIdx);
        currentLoadedSnapshotIndex = newIdx;
    }

    // 更新计数
    updateSceneCount();

    // 隐藏主控保存按钮，并将加载索引切换到新增的快照
    loadedSnapshotModified = false;
    // 如果之前没有追加，则仍需更新索引为末尾（不变）
    currentLoadedSnapshotIndex = state.savedScenes.length - 1;
    updateMainSaveButtonsVisibility();

    alert('已保存修改并替换该暂存画面，同时在末尾添加了一条新的编辑记录');
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
async function exportCanvas(sceneIndex = state.currentSceneIndex, filename = null) {
    if (state.scenes.length === 0) {
        alert('没有可导出的场景');
        return;
    }

    const currentScene = state.scenes[sceneIndex];
    try {
        const wasCommanderVisible = elements.commanderDialog.style.display !== 'none';
        if (currentScene.commanderText && currentScene.commanderText.trim()) {
            elements.commanderDialog.style.display = 'flex';
        }

        const canvas = await html2canvas(elements.previewContainer, {
            backgroundColor: '#000',
            scale: 2,
            logging: false,
            useCORS: true
        });

        const link = document.createElement('a');
        link.download = filename || `scene_${sceneIndex + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        if (!wasCommanderVisible && (!currentScene.commanderText || !currentScene.commanderText.trim())) {
            elements.commanderDialog.style.display = 'none';
        }
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败，请重试');
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
async function exportAllScenes() {
    // 只导出已暂存的画面
    if (!(state.savedScenes && state.savedScenes.length > 0)) {
        alert('没有可导出的暂存画面');
        return;
    }

    const originalSnapshot = cloneState();
    const originalCommanderVisible = elements.commanderDialog.style.display !== 'none';
    for (let j = 0; j < state.savedScenes.length; j++) {
        try {
            const snap = state.savedScenes[j];
            restoreState(snap);
            updatePreview();
            await new Promise(resolve => setTimeout(resolve, 100));

            const fileBase = `saved_scene_${j + 1}`;
            if (state.animationEnabled) {
                await exportGIF(state.currentSceneIndex, `${fileBase}.gif`);
            } else {
                await exportCanvas(state.currentSceneIndex, `${fileBase}.png`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
            console.error('导出快照失败:', err);
        }
    }

    // 恢复原始状态
    restoreState(originalSnapshot);
    updatePreview();
    elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';
    updateSceneCount();
    alert(`已导出 ${state.savedScenes.length} 个暂存画面`);
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
async function exportGIF(sceneIndex = state.currentSceneIndex, filename = null) {
    if (state.scenes.length === 0) {
        alert('没有可导出的场景');
        return;
    }

    const currentScene = state.scenes[sceneIndex];
    const inputText = elements.dialogInput.value.trim();

    // 检查是否有对话内容（包括已保存的和输入框中的）
    if ((!currentScene.dialogs || currentScene.dialogs.length === 0) && !inputText) {
        alert('当前场景没有对话内容\n\n请先在对话框中输入文本！');
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

    try {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex] || currentScene.dialogs[0];
        const text = dialog.text || '';

        if (!text) {
            alert('对话文本为空！');
            return;
        }

        // 创建GIF
        // 准备 workerScript 的 blob URL，避免跨域 Worker 错误
        const workerBlobUrl = await getGifWorkerBlobUrl();
        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: elements.previewContainer.offsetWidth,
            height: elements.previewContainer.offsetHeight,
            workerScript: workerBlobUrl
        });

        // 根据文本长度和动画速度计算帧数
        const frameDelay = state.animationEnabled ? state.animationSpeed : 100;
        const totalFrames = state.animationEnabled ? text.length : 1;

        // 保存原始文本
        const originalText = elements.dialogInput.value;

        const restoreName = replaceCharacterNameForExport();
        await new Promise(resolve => setTimeout(resolve, 50));

        // 生成打字机动画帧
        for (let i = 0; i <= totalFrames; i++) {
            let textToShow = '';

            if (state.animationEnabled) {
                // 打字机效果：逐字显示
                textToShow = text.substring(0, i);
            } else {
                // 不启用动画：直接显示全文
                textToShow = text;
            }

            elements.dialogInput.value = textToShow;

            // 等待DOM更新
            await new Promise(resolve => setTimeout(resolve, state.animationEnabled ? state.animationSpeed : 100));

            const canvas = await html2canvas(elements.previewContainer, {
                backgroundColor: '#000',
                scale: 1,
                logging: false,
                useCORS: true,
                allowTaint: true
            });

            gif.addFrame(canvas, { delay: frameDelay, copy: true });
        }

        // 添加最后停留帧（显示完整文本）
        for (let i = 0; i < 5; i++) {
            const canvas = await html2canvas(elements.previewContainer, {
                backgroundColor: '#000',
                scale: 1,
                logging: false,
                useCORS: true
            });
            gif.addFrame(canvas, { delay: frameDelay });
        }

        restoreName();
        // 恢复原始文本
        elements.dialogInput.value = originalText;

        // 渲染GIF
        gif.on('finished', (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = filename || `scene_${sceneIndex + 1}.gif`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            alert('GIF导出成功！');
        });

        gif.render();

    } catch (error) {
        console.error('导出GIF失败:', error);
        alert('导出GIF失败，请重试\n错误：' + error.message);
    }
}
// 初始化
document.addEventListener('DOMContentLoaded', init);

// 暴露全局函数（供外部或调试使用）
window.exportCanvas = exportCanvas;
window.exportGIF = exportGIF;
window.exportScene = exportScene;
window.exportAllScenes = exportAllScenes;
