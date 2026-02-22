// 全局状态管理
const state = {
    scenes: [],
    currentSceneIndex: 0,
    currentDialogIndex: 0,
    characters: [],
    backgrounds: [],
    uploadedCharacters: [],
    animationEnabled: true,
    animationSpeed: 50,
    leftPanelFolded: false,
    rightPanelFolded: false,
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

// DOM 元素引用
const elements = {
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
    updateSceneCount();
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
    
    // 导出按钮
    elements.exportBtnLeft.addEventListener('click', exportCurrentScene);
    elements.exportBtnRight.addEventListener('click', exportCurrentScene);
    elements.exportAllBtnLeft.addEventListener('click', exportAllScenes);
    elements.exportAllBtnRight.addEventListener('click', exportAllScenes);
    elements.exportGifBtnLeft.addEventListener('click', exportAsGif);
    elements.exportGifBtnRight.addEventListener('click', exportAsGif);
    
    // 导航按钮
    elements.prevDialogLeft.addEventListener('click', nextDialog);
    elements.prevDialogRight.addEventListener('click', nextDialog);
    elements.nextSceneLeft.addEventListener('click', nextScene);
    elements.nextSceneRight.addEventListener('click', nextScene);
    
    // 撤回按钮
    elements.undoLeft.addEventListener('click', undoLastDialog);
    elements.undoRight.addEventListener('click', undoLastDialog);
    elements.undoAllLeft.addEventListener('click', clearAllScenes);
    elements.undoAllRight.addEventListener('click', clearAllScenes);
    
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
    
    if (currentScene.dialogs.length > 0 && currentScene.currentDialogIndex < currentScene.dialogs.length) {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex];
        elements.characterName.value = dialog.character || '???';
        elements.dialogInput.value = dialog.text || '';
    } else {
        elements.characterName.value = '???';
        elements.dialogInput.value = '';
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
}

// 下一句对话 - 保存当前对话，只清空文本输入框
function nextDialog() {
    // 保存当前对话
    addDialog();
    
    if (state.scenes.length === 0) return;
    
    const currentScene = state.scenes[state.currentSceneIndex];
    // 移动到下一个对话索引
    currentScene.currentDialogIndex++;
    
    // 清空文本输入框，背景和角色保持不变
    elements.dialogInput.value = '';
    // 角色名称保持不变，不清空
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

// 下一场景 - 保存当前对话，清空所有内容
function nextScene() {
    // 保存当前对话
    addDialog();
    
    // 创建新场景（新场景会重置背景和角色）
    createScene();
    updatePreview();
    
    // 更新背景列表的选中状态
    renderBackgroundList();
    
    // 清空对话框内容
    elements.characterName.value = '???';
    elements.dialogInput.value = '';
    elements.commanderText.value = '';
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

// 撤回上一句 - 撤回到上一个画面的状态
function undoLastDialog() {
    if (state.scenes.length === 0) return;
    
    const currentScene = state.scenes[state.currentSceneIndex];
    
    // 如果当前有未保存的输入，不保存直接撤回到上一句
    if (currentScene.dialogs.length > 0) {
        // 移除最后一句对话
        currentScene.dialogs.pop();
        // 更新当前对话索引
        currentScene.currentDialogIndex = Math.max(0, currentScene.dialogs.length - 1);
        updateDialogDisplay();
        
        // 如果是当前场景的第一句，也重置背景和角色
        if (currentScene.dialogs.length === 0) {
            currentScene.background = null;
            currentScene.characters = [];
            renderBackgroundList();
            updateCharacterListSelection();
            updatePreview();
        }
    } else if (state.scenes.length > 1) {
        // 如果当前场景没有对话，则撤回到上一个场景
        state.scenes.pop();
        state.currentSceneIndex = state.scenes.length - 1;
        updateSceneCount();
        updatePreview();
        updateDialogDisplay();
        renderBackgroundList();
        updateCharacterListSelection();
    } else {
        // 只有一个场景，清空当前场景
        currentScene.background = null;
        currentScene.characters = [];
        currentScene.dialogs = [];
        currentScene.currentDialogIndex = 0;
        elements.characterName.value = '???';
        elements.dialogInput.value = '';
        elements.commanderText.value = '';
        renderBackgroundList();
        updateCharacterListSelection();
        updatePreview();
        updateDialogDisplay();
    }
}

// 全部清空 - 暂存的所有画面全部清空
function clearAllScenes() {
    // 删除所有场景，只保留一个空白场景
    state.scenes = [];
    createScene();
    
    // 清空当前场景的所有内容
    const currentScene = state.scenes[0];
    currentScene.background = null;
    currentScene.characters = [];
    currentScene.dialogs = [];
    currentScene.currentDialogIndex = 0;
    currentScene.commanderText = '';
    
    // 清空UI
    elements.characterName.value = '???';
    elements.dialogInput.value = '';
    elements.commanderText.value = '';
    
    // 更新所有显示
    updateSceneCount();
    renderBackgroundList();
    updateCharacterListSelection();
    updatePreview();
    updateDialogDisplay();
}

// 面板折叠
function togglePanel(panel) {
    if (panel === 'left') {
        state.leftPanelFolded = !state.leftPanelFolded;
        elements.leftPanel.classList.toggle('folded', state.leftPanelFolded);
        elements.foldLeftBtn.textContent = state.leftPanelFolded ? '▶' : '◀';
    } else {
        state.rightPanelFolded = !state.rightPanelFolded;
        elements.rightPanel.classList.toggle('folded', state.rightPanelFolded);
        elements.foldRightBtn.textContent = state.rightPanelFolded ? '◀' : '▶';
    }
}

// 更新场景计数
function updateSceneCount() {
    const count = state.scenes.length;
    elements.sceneCountLeft.textContent = count;
    elements.sceneCountRight.textContent = count;
}

// 导出前将角色名 input 临时替换为 div，避免 html2canvas 裁切 input 文字
function replaceCharacterNameForExport() {
    const input = elements.characterName;
    const div = document.createElement('div');
    div.className = 'character-name character-name-export';
    div.textContent = input.value || input.placeholder || '';
    input.parentNode.insertBefore(div, input);
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    input.style.visibility = 'hidden';
    return () => {
        div.remove();
        input.style.position = '';
        input.style.left = '';
        input.style.visibility = '';
    };
}

// 导出当前场景
async function exportCurrentScene() {
    if (state.scenes.length === 0) {
        alert('没有可导出的场景');
        return;
    }
    
    const currentScene = state.scenes[state.currentSceneIndex];
    
    try {
        // 如果有指挥官文本，临时显示对话框
        const wasCommanderVisible = elements.commanderDialog.style.display !== 'none';
        if (currentScene.commanderText && currentScene.commanderText.trim()) {
            elements.commanderDialog.style.display = 'flex';
        }
        
        const restoreName = replaceCharacterNameForExport();
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const canvas = await html2canvas(elements.previewContainer, {
            backgroundColor: '#000',
            scale: 2,
            logging: false
        });
        
        restoreName();
        
        const link = document.createElement('a');
        link.download = `scene_${state.currentSceneIndex + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        // 恢复指挥官对话框状态
        if (!wasCommanderVisible && (!currentScene.commanderText || !currentScene.commanderText.trim())) {
            elements.commanderDialog.style.display = 'none';
        }
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败，请重试');
    }
}

// 导出所有场景
async function exportAllScenes() {
    if (state.scenes.length === 0) {
        alert('没有可导出的场景');
        return;
    }
    
    // 保存当前场景索引和指挥官对话框状态
    const savedSceneIndex = state.currentSceneIndex;
    const savedCommanderVisible = elements.commanderDialog.style.display !== 'none';
    
    for (let i = 0; i < state.scenes.length; i++) {
        // 切换到该场景
        state.currentSceneIndex = i;
        updatePreview();
        
        // 等待渲染
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const currentScene = state.scenes[i];
        
        // 如果有指挥官文本，临时显示对话框
        if (currentScene.commanderText && currentScene.commanderText.trim()) {
            elements.commanderDialog.style.display = 'flex';
        }
        
        try {
            const restoreName = replaceCharacterNameForExport();
            await new Promise(resolve => setTimeout(resolve, 50));
            const canvas = await html2canvas(elements.previewContainer, {
                backgroundColor: '#000',
                scale: 2,
                logging: false
            });
            restoreName();
            
            const link = document.createElement('a');
            link.download = `scene_${i + 1}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            // 延迟避免浏览器阻塞
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
            console.error(`导出场景 ${i + 1} 失败:`, error);
        }
    }
    
    // 恢复到原始场景
    state.currentSceneIndex = savedSceneIndex;
    updatePreview();
    
    // 恢复指挥官对话框状态
    elements.commanderDialog.style.display = savedCommanderVisible ? 'flex' : 'none';
    
    alert(`已导出 ${state.scenes.length} 个场景`);
}

// 导出为GIF
async function exportAsGif() {
    if (state.scenes.length === 0) {
        alert('没有可导出的场景');
        return;
    }
    
    const currentScene = state.scenes[state.currentSceneIndex];
    if (!currentScene.dialogs || currentScene.dialogs.length === 0) {
        alert('当前场景没有对话内容');
        return;
    }
    
    try {
        const dialog = currentScene.dialogs[currentScene.currentDialogIndex] || currentScene.dialogs[0];
        const text = dialog.text || '';
        
        // 创建GIF
        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: elements.previewContainer.offsetWidth,
            height: elements.previewContainer.offsetHeight
        });
        
        const totalDuration = 3000;
        const frameDelay = 100;
        const totalFrames = Math.floor(totalDuration / frameDelay);
        
        // 保存原始文本
        const originalText = elements.dialogInput.value;
        
        const restoreName = replaceCharacterNameForExport();
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // 生成帧
        for (let i = 0; i <= totalFrames; i++) {
            const progress = i / totalFrames;
            const textToShow = text.substring(0, Math.floor(progress * text.length));
            elements.dialogInput.value = textToShow;
            
            const canvas = await html2canvas(elements.previewContainer, {
                backgroundColor: '#000',
                scale: 1,
                logging: false
            });
            
            gif.addFrame(canvas, { delay: frameDelay });
        }
        
        restoreName();
        // 恢复原始文本
        elements.dialogInput.value = originalText;
        
        // 渲染
        gif.on('finished', (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `scene_${state.currentSceneIndex + 1}.gif`;
            link.href = url;
            link.click();
            alert('GIF导出成功！');
        });
        
        gif.render();
    } catch (error) {
        console.error('导出GIF失败:', error);
        alert('导出GIF失败，请重试');
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', init);

// 暴露全局函数
window.exportCurrentScene = exportCurrentScene;
window.exportAllScenes = exportAllScenes;
window.exportAsGif = exportAsGif;
