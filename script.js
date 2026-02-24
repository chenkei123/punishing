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
    commanderBtnRight: document.getElementById('commander-dialog-btn-right')
};

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
    });
    
    // 角色名称输入
    elements.characterName.addEventListener('input', (e) => {
        if (state.scenes.length > 0) {
            const currentScene = state.scenes[state.currentSceneIndex];
            // 如果当前有对话，更新角色名称
            if (currentScene.dialogs.length > 0 && currentScene.currentDialogIndex < currentScene.dialogs.length) {
                currentScene.dialogs[currentScene.currentDialogIndex].character = e.target.value;
            }
        }
    });
    
    // 指挥官文本输入
    elements.commanderText.addEventListener('input', (e) => {
        if (state.scenes.length > 0) {
            state.scenes[state.currentSceneIndex].commanderText = e.target.value;
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

// 全部撤回 - 清空历史快照栈，无法再撤销
function clearHistoryStack() {
    state.savedScenes = [];
    // 仅清空快照栈，场景计数不变
}

// 更新折叠按钮的 title 悬停提示
function updateFoldButtonTitles() {
    elements.foldLeftBtn.title = state.leftPanelFolded ? '展开左侧面板' : '收起左侧面板';
    elements.foldRightBtn.title = state.rightPanelFolded ? '展开右侧面板' : '收起右侧面板';
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
    const count = state.scenes.length;
    elements.sceneCountLeft.textContent = count;
    elements.sceneCountRight.textContent = count;
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
    if (state.scenes.length === 0) {
        alert('没有可导出的场景');
        return;
    }

    // 保存原始状态，导出后恢复
    const originalSnapshot = cloneState();
    const originalCommanderVisible = elements.commanderDialog.style.display !== 'none';

    // 先导出当前已存在的场景
    for (let i = 0; i < state.scenes.length; i++) {
        try {
            state.currentSceneIndex = i;
            updatePreview();
            await new Promise(resolve => setTimeout(resolve, 100));

            const currentScene = state.scenes[i];
            if (currentScene.commanderText && currentScene.commanderText.trim()) {
                elements.commanderDialog.style.display = 'flex';
            }

            const restoreName = replaceCharacterNameForExport();
            await new Promise(resolve => setTimeout(resolve, 50));

            const fileBase = `scene_${i + 1}`;
            if (state.animationEnabled) {
                await exportGIF(i, `${fileBase}.gif`);
            } else {
                await exportCanvas(i, `${fileBase}.png`);
            }

            restoreName();
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error(`导出场景 ${i + 1} 失败:`, error);
        }
    }

    // 再导出已保存的快照（savedScenes）
    // 恢复原始状态
    restoreState(originalSnapshot);
    updatePreview();
    elements.commanderDialog.style.display = originalCommanderVisible ? 'flex' : 'none';

    // 恢复场景计数显示
    updateSceneCount();

    alert(`已导出 ${state.scenes.length} 个场景`);
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
