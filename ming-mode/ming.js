/* ============================================================
 * ming.js —— 鸣潮模式独立模块（IIFE 封装，避免全局污染）
 * ------------------------------------------------------------
 * 架构：核心共享 + 模式独立 + 轻量通信
 *
 *   【核心共享】
 *     - 与战双版共用同一编辑外壳（左右面板 / 预览区）；
 *     - 通过 localStorage key = "global_export_settings" 读写共享配置；
 *     - 通过 CustomEvent("ming-mode-switch") 与主路由轻量通信。
 *
 *   【模式独立】
 *     - FeixunSystem（飞讯模式）完全独立，包含联系人数据结构与消息渲染逻辑；
 *     - 不包含战双版 commander-dialog（指挥官对话）逻辑，鸣潮版不需要该 DOM；
 *     - 所有状态封装在 IIFE 内部，仅通过 window.MingMode 暴露最小接口。
 *
 *   【轻量通信】
 *     - window.MingMode.switchToZhanMode()：触发主路由切换回战双版；
 *     - window.addEventListener("ming-mode-switch", ...)：监听主路由调度；
 *     - localStorage "global_export_settings"：用户配置与工程数据互通。
 * ============================================================ */
(function (global) {
    'use strict';

    /* ========================================================
     * 第零部分：MING_HTML_FALLBACK —— ming.html 兜底字符串
     * ------------------------------------------------------------
     * 当页面以 file:// 协议直接双击打开时，fetch('ming-mode/ming.html')
     * 会因 CORS 策略失败。此时解析此内联字符串进行 DOM 注入，
     * 保证鸣潮模式在离线双击场景下也能正常加载。
     *
     * 此内容由 sync.js 脚本自动从 ming-mode/ming.html 同步生成，
     * 请勿手动修改 —— 修改完 ming.html 后运行 `node sync.js` 即可。
     * ======================================================== */
    var MING_HTML_FALLBACK = `<!--
  ============================================================
  ming.html —— 鸣潮模式 DOM 片段
  ------------------------------------------------------------
  本文件为鸣潮模式的独立 DOM 结构，由 ming.js 在运行时注入主页面。
  设计要点：
    1. 不包含战双版 commander-dialog（指挥官对话）逻辑与 DOM；
    2. 包含飞讯模式（FeixunSystem）的联系人数据结构容器与消息渲染区域；
    3. 与战双版共享同一编辑外壳（左右面板/预览区），但飞讯容器独立；
    4. 通过 data-ming-fragment 标记各可注入片段，ming.js 按 id 取用。
  ============================================================
-->

<!-- ===== 片段 1：鸣潮欢迎页幻灯片（注入到 #intro-slider） ===== -->
<template data-ming-fragment="intro-slide">
    <div id="intro-ming" class="intro-slide" data-mode="ming">
        <div class="intro-content">
            <h1>
                <span class="title-part left">鸣潮剧情二创制作网页</span>
            </h1>
            <p class="subtitle">B站比翼苍穹制作</p>
        </div>
        <!-- 左侧引导箭头（仅在鸣潮页面显示） -->
        <div id="arrow-left" class="slide-arrow slide-arrow-left" title="左滑进入战双">
            <span class="arrow-icon">&#9668;</span>
            <span class="arrow-text">战双</span>
        </div>
    </div>
</template>

<!-- ===== 片段 2：飞讯主容器（注入到 #preview-container 内部末尾） ===== -->
<!-- 注意：鸣潮版不需要 commander-dialog，此处不包含该 DOM -->
<!-- banner 已移入容器内部，使导出时能包含图片关联区域 -->
<template data-ming-fragment="feixun-container">
    <div id="feixun-container" class="feixun-container">
        <!-- 飞讯图片关联区域（顶部横条，1200×60 比例） -->
        <div id="feixun-association-banner" class="feixun-association-banner">
            <img src="backgrounds/feixun1.png" alt="图片关联">
        </div>
        <!-- 主内容行：联系人列表 + 聊天区域 -->
        <div class="feixun-main-row">
            <!-- 左侧联系人列表 -->
            <div class="feixun-contact-list">
                <div class="feixun-contacts-scroll" id="feixun-contacts-list">
                    <!-- 联系人项将动态生成 -->
                </div>
            </div>

            <!-- 右侧聊天区域 -->
            <div class="feixun-chat-area">
                <div class="feixun-chat-header" id="feixun-chat-title">
                    <div class="feixun-chat-header-bg"></div>
                    <div class="feixun-chat-header-content">
                        <span id="feixun-chat-title-text" contenteditable="true">未知联系人</span>
                        <span id="feixun-chat-tag-text" contenteditable="true" class="feixun-chat-tag">点击编辑个性标签</span>
                    </div>
                </div>
                <div class="feixun-messages-bg"></div>
                <div class="feixun-messages" id="feixun-messages">
                    <!-- 消息将动态生成 -->
                </div>
            </div>
        </div>
    </div>
</template>

<!-- ===== 片段 3：鸣潮剧情模式背景选择（注入到左侧面板） ===== -->
<template data-ming-fragment="ming-bg-select">
    <div class="section ming-story-only" id="ming-bg-select-section">
        <h3 class="section-title">背景设置</h3>
        <div class="subsection">
            <label class="subsection-label">选择背景:</label>
            <div id="ming-background-list" class="image-grid">
                <!-- 鸣潮背景图片将动态添加 -->
            </div>
        </div>
        <div class="subsection">
            <label class="subsection-label">导入背景:</label>
            <div class="file-input-wrapper">
                <button class="file-btn" id="ming-upload-bg-btn">选择文件</button>
                <span class="file-name" id="ming-bg-file-name">未选择文件</span>
                <input type="file" id="ming-upload-background" accept="image/*,video/*" hidden>
            </div>
        </div>
    </div>
</template>

<!-- ===== 片段 4：左侧面板飞讯按钮（注入到左侧面板） ===== -->
<template data-ming-fragment="feixun-left-btn">
    <div class="section feixun-mode-only" id="feixun-add-dialog-section">
        <button id="feixun-add-dialog-btn-left" class="btn btn-primary">添加对话</button>
        <button id="feixun-add-contact-btn" class="btn btn-primary" style="margin-top: 8px;">添加联系人</button>
    </div>
</template>

<!-- ===== 片段 5：右侧面板飞讯按钮（注入到右侧面板） ===== -->
<template data-ming-fragment="feixun-right-btn">
    <div class="section feixun-mode-only" id="feixun-piaobo-section">
        <button id="feixun-piaobo-dialog-btn-right" class="btn btn-primary">漂泊者对话</button>
    </div>
</template>

<!-- ===== 片段 6：联系人编辑弹窗（注入到 body 末尾） ===== -->
<template data-ming-fragment="feixun-modal">
    <div id="feixun-contact-modal" class="feixun-contact-edit-modal">
        <div class="feixun-edit-panel">
            <h4 id="feixun-edit-title">编辑联系人</h4>
            <div class="feixun-edit-field">
                <label>头像</label>
                <div class="feixun-avatar-upload" id="feixun-avatar-upload">
                    <span class="upload-hint">点击上传头像</span>
                </div>
                <input type="file" id="feixun-avatar-input" accept="image/*" hidden>
            </div>
            <div class="feixun-edit-field">
                <label>名称</label>
                <input type="text" id="feixun-contact-name-input" placeholder="输入联系人名称">
            </div>
            <div class="feixun-edit-actions">
                <button class="btn-cancel" id="feixun-edit-cancel">取消</button>
                <button class="btn-delete" id="feixun-edit-delete" style="display:none;">删除</button>
                <button class="btn-save" id="feixun-edit-save">保存</button>
            </div>
        </div>
    </div>
</template>

<!-- ===== 片段 7：顶部模式导航栏（注入到 #app-page 顶部） ===== -->
<template data-ming-fragment="mode-nav">
    <div id="ming-mode-nav" class="ming-mode-nav">
        <button class="ming-mode-nav-btn active" data-mode="zhan">战双模式</button>
        <button class="ming-mode-nav-btn" data-mode="ming">鸣潮模式</button>
    </div>
</template>
`;

    /* ========================================================
     * 第一部分：共享配置层（localStorage global_export_settings）
     * 两套代码在底层相互独立，但在用户配置、工程数据上保持关联（可互通）。
     * ======================================================== */
    var SHARED_CONFIG_KEY = 'global_export_settings';

    var SharedConfig = {
        /** 读取共享配置（不存在时返回默认空对象） */
        read: function () {
            try {
                var raw = localStorage.getItem(SHARED_CONFIG_KEY);
                if (!raw) return { version: 1, ming: {}, zhan: {}, common: {} };
                var data = JSON.parse(raw);
                if (!data || typeof data !== 'object') data = {};
                if (!data.ming) data.ming = {};
                if (!data.zhan) data.zhan = {};
                if (!data.common) data.common = {};
                return data;
            } catch (e) {
                console.warn('[MingMode] 读取共享配置失败:', e);
                return { version: 1, ming: {}, zhan: {}, common: {} };
            }
        },

        /** 写入共享配置（深合并 ming 子键，避免覆盖战双数据） */
        write: function (mingPartial) {
            try {
                var data = this.read();
                // 仅合并 ming 子键，zhan / common 由各自模式维护，互不污染
                if (mingPartial && typeof mingPartial === 'object') {
                    for (var k in mingPartial) {
                        if (Object.prototype.hasOwnProperty.call(mingPartial, k)) {
                            data.ming[k] = mingPartial[k];
                        }
                    }
                }
                data.version = data.version || 1;
                data.updatedAt = new Date().toISOString();
                data.updatedBy = 'ming';
                localStorage.setItem(SHARED_CONFIG_KEY, JSON.stringify(data));
                // 通知其他监听者（同标签页）
                global.dispatchEvent(new CustomEvent('global-config-updated', { detail: { source: 'ming' } }));
                return true;
            } catch (e) {
                console.error('[MingMode] 写入共享配置失败:', e);
                return false;
            }
        },

        /** 读取鸣潮专属配置片段 */
        readMing: function () {
            return this.read().ming || {};
        },

        /** 监听跨标签页配置变更 */
        onExternalChange: function (cb) {
            global.addEventListener('storage', function (e) {
                if (e.key === SHARED_CONFIG_KEY && cb) cb(e);
            });
        }
    };

    /* ========================================================
     * 第二部分：鸣潮剧情模式背景选择系统（MingBackgroundSystem）
     * 仅在鸣潮剧情模式下显示，飞讯模式下隐藏。
     * ======================================================== */
    var MingBackgroundSystem = {
        // 鸣潮默认背景列表
        defaultBackgrounds: [
            { id: 'm1', name: '背景1', url: 'backgrounds/m1.jpeg' },
            { id: 'm2', name: '背景2', url: 'backgrounds/m2.jpeg' },
            { id: 'm3', name: '背景3', url: 'backgrounds/m3.jpeg' },
            { id: 'm4', name: '背景4', url: 'backgrounds/m4.jpg' }
        ],
        currentBackground: null,
        _initialized: false,

        /** 初始化背景选择系统 */
        init: function () {
            if (this._initialized) return;
            var saved = SharedConfig.readMing().currentBackground;
            if (saved) {
                this.selectBackground(saved);
            } else if (this.defaultBackgrounds.length > 3) {
                this.selectBackground(this.defaultBackgrounds[3].url);
            }
            this.renderBackgroundList();
            this.bindEvents();
            this._initialized = true;
        },

        /** 重新应用当前背景（模式切换回来时调用） */
        reapplyBackground: function () {
            // 优先使用已保存的背景，其次使用默认背景
            var saved = SharedConfig.readMing().currentBackground;
            var url = saved || (this.defaultBackgrounds.length > 3 ? this.defaultBackgrounds[3].url : null);
            if (url) {
                this.selectBackground(url);
            }
        },

        /** 渲染背景列表 */
        renderBackgroundList: function () {
            var listEl = document.getElementById('ming-background-list');
            if (!listEl) return;

            listEl.innerHTML = '';
            var self = this;

            this.defaultBackgrounds.forEach(function (bg) {
                var item = document.createElement('div');
                item.className = 'image-grid-item';
                if (self.currentBackground === bg.url) {
                    item.classList.add('selected');
                }

                item.innerHTML = '<img src="' + bg.url + '" alt="' + bg.name + '">';

                item.addEventListener('click', function () {
                    self.selectBackground(bg.url);
                    // 更新选中状态
                    var items = listEl.querySelectorAll('.image-grid-item');
                    items.forEach(function (i) { i.classList.remove('selected'); });
                    item.classList.add('selected');
                });

                listEl.appendChild(item);
            });
        },

        /** 选择背景 */
        selectBackground: function (url) {
            this.currentBackground = url;
            // 应用到鸣潮预览区背景（通过 image-association-old 全屏显示）
            var imgAssoc = document.getElementById('image-association-old');
            if (imgAssoc) {
                var img = imgAssoc.querySelector('img');
                if (img) {
                    img.src = url;
                }
            }
            // 同时更新 preview-background（保持向后兼容，防止导出时缺失）
            var previewBg = document.getElementById('preview-background');
            if (previewBg) {
                previewBg.style.backgroundImage = 'url(' + url + ')';
                previewBg.style.backgroundSize = 'cover';
                previewBg.style.backgroundPosition = 'center';
            }
            // 保存到共享配置
            SharedConfig.write({ currentBackground: url });
        },

        /** 导入自定义背景 */
        importBackground: function (file) {
            var self = this;
            var reader = new FileReader();
            reader.onload = function (e) {
                var url = e.target.result;
                var newBg = {
                    id: 'custom_' + Date.now(),
                    name: file.name,
                    url: url
                };
                self.defaultBackgrounds.push(newBg);
                self.renderBackgroundList();
                self.selectBackground(url);
            };
            reader.readAsDataURL(file);
        },

        /** 绑定事件 */
        bindEvents: function () {
            var self = this;

            // 文件上传按钮
            var uploadBtn = document.getElementById('ming-upload-bg-btn');
            var uploadInput = document.getElementById('ming-upload-background');
            var fileNameSpan = document.getElementById('ming-bg-file-name');

            if (uploadBtn && uploadInput) {
                uploadBtn.addEventListener('click', function () {
                    uploadInput.click();
                });

                uploadInput.addEventListener('change', function (e) {
                    var file = e.target.files[0];
                    if (file) {
                        fileNameSpan.textContent = file.name;
                        self.importBackground(file);
                    }
                });
            }
        },

        /** 重置背景选择 */
        reset: function () {
            this.currentBackground = null;
            var previewBg = document.getElementById('preview-background');
            if (previewBg) {
                previewBg.style.backgroundImage = '';
            }
            var imgAssoc = document.getElementById('image-association-old');
            if (imgAssoc) {
                var img = imgAssoc.querySelector('img');
                if (img) {
                    img.src = 'backgrounds/mc UI.png';
                }
            }
        }
    };

    /* ========================================================
     * 第三部分：飞讯模式系统（FeixunSystem）
     * 包含联系人数据结构与消息渲染逻辑，完全独立。
     * ======================================================== */

    /**
     * 对 Canvas 应用滤镜并返回新的 Canvas
     * @param {HTMLCanvasElement} canvas - 原始 canvas
     * @param {string} filterStr - CSS filter 字符串
     * @returns {HTMLCanvasElement} 应用滤镜后的新 canvas
     */
    function applyCanvasFilter(canvas, filterStr) {
        if (!filterStr || !canvas) return canvas;

        var filteredCanvas = document.createElement('canvas');
        filteredCanvas.width = canvas.width;
        filteredCanvas.height = canvas.height;
        var ctx = filteredCanvas.getContext('2d');

        ctx.filter = filterStr;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';

        return filteredCanvas;
    }

    var FeixunSystem = {
        // 联系人数据结构：[{ id, name, avatar, dialogues: [{ id, title, messages: [{ id, side, sender, text, avatar }] }] }]
        contacts: [],
        currentContactIndex: 0,
        currentDialogueIndex: 0,
        isEditing: false,
        editingContactIndex: null,
        tempAvatar: null,
        _initialized: false,

        /** 初始化 */
                init: function () {
            if (this._initialized) return;
            this._initialized = true;

            // 不再读取 localStorage，每次页面加载都重置为初始状态
            this.loadDefaultContacts();
            this.currentContactIndex = 0;
            this.currentDialogueIndex = 0;

            this.bindEvents();
            this.initEditableTitle();
            this.renderContacts();
            this.renderMessages();
        },

        /** 加载默认联系人 */
        loadDefaultContacts: function () {
            this.contacts = [
                { id: 'contact_1', name: '洛瑟拉', avatar: null, dialogues: [] },
                { id: 'contact_2', name: '莫宁', avatar: null, dialogues: [] },
                { id: 'contact_3', name: '未知联系人', avatar: null, dialogues: [] }
            ];
        },

        /** 将联系人数据持久化到共享配置 */
        persist: function () {
            SharedConfig.write({
                contacts: this.contacts,
                currentContactIndex: this.currentContactIndex,
                currentDialogueIndex: this.currentDialogueIndex
            });
        },

        /** 绑定事件 */
        bindEvents: function () {
            var self = this;

            var addBtn = document.getElementById('feixun-add-contact-btn');
            if (addBtn) addBtn.addEventListener('click', function () { self.openEditModal(-1); });

            // 飞讯快捷消息按钮和输入框已移除，功能由左右面板按钮承担

            var addDialogBtnLeft = document.getElementById('feixun-add-dialog-btn-left');
            if (addDialogBtnLeft) addDialogBtnLeft.addEventListener('click', function () { self.addQuickMessage('left'); });

            var piaoboBtnRight = document.getElementById('feixun-piaobo-dialog-btn-right');
            if (piaoboBtnRight) piaoboBtnRight.addEventListener('click', function () { self.addQuickMessage('right'); });

            // 监听漂泊者文本格式设置（指挥官颜色/大小），同步到飞讯右侧消息气泡
            var commanderColorInput = document.getElementById('commander-color-input-compact');
            var commanderSizeDecrease = document.getElementById('commander-size-decrease-compact');
            var commanderSizeIncrease = document.getElementById('commander-size-increase-compact');
            if (commanderColorInput) {
                commanderColorInput.addEventListener('input', function () {
                    self.applyPiaoboFormatting();
                });
            }
            if (commanderSizeDecrease) {
                commanderSizeDecrease.addEventListener('click', function () {
                    setTimeout(function () { self.applyPiaoboFormatting(); }, 20);
                });
            }
            if (commanderSizeIncrease) {
                commanderSizeIncrease.addEventListener('click', function () {
                    setTimeout(function () { self.applyPiaoboFormatting(); }, 20);
                });
            }

            var modal = document.getElementById('feixun-contact-modal');
            var cancelBtn = document.getElementById('feixun-edit-cancel');
            var saveBtn = document.getElementById('feixun-edit-save');
            var deleteBtn = document.getElementById('feixun-edit-delete');
            var avatarUpload = document.getElementById('feixun-avatar-upload');
            var avatarInput = document.getElementById('feixun-avatar-input');

            if (cancelBtn) cancelBtn.addEventListener('click', function () { self.closeEditModal(); });
            if (saveBtn) saveBtn.addEventListener('click', function () { self.saveContact(); });
            if (deleteBtn) deleteBtn.addEventListener('click', function () { self.deleteContact(); });
            if (avatarUpload && avatarInput) {
                avatarUpload.addEventListener('click', function () { avatarInput.click(); });
                avatarInput.addEventListener('change', function (e) { self.handleAvatarUpload(e); });
            }
            if (modal) {
                modal.addEventListener('click', function (e) {
                    if (e.target === modal) self.closeEditModal();
                });
            }
        },

        /** 渲染联系人列表 */
        renderContacts: function () {
            var container = document.getElementById('feixun-contacts-list');
            if (!container) return;
            container.innerHTML = '';
            var self = this;

            this.contacts.forEach(function (contact, index) {
                var item = document.createElement('div');
                item.className = 'feixun-contact-item ' + (index === self.currentContactIndex ? 'active' : '');
                item.dataset.index = index;

                var currentDlg = contact.dialogues[self.currentDialogueIndex] || contact.dialogues[0];
                var previewText = (currentDlg && currentDlg.messages.length > 0)
                    ? currentDlg.messages[currentDlg.messages.length - 1].text.substring(0, 20) + '...'
                    : '暂无消息';

                var avatarHtml = contact.avatar
                    ? '<img src="' + contact.avatar + '" alt="' + contact.name + '">'
                    : '<div class="avatar-placeholder">' + contact.name.charAt(0) + '</div>';

                // 根据联系人名称设置背景关联图片：未知联系人和指定名称均用 MC2.png
                var isUnknown = (contact.name === '未知联系人' || !contact.name || contact.name.trim() === '');
                var bgImage = 'backgrounds/MC2.png';
                item.style.backgroundImage = 'url("' + bgImage + '")';
               item.style.backgroundSize = '1200px 600px';  // 固定像素尺寸
                item.style.backgroundPosition = '49% 59%';
                item.style.backgroundRepeat = 'no-repeat';

                item.innerHTML =
                    '<div class="feixun-contact-avatar">' + avatarHtml + '</div>' +
                    '<div class="feixun-contact-info">' +
                        '<div class="feixun-contact-name">' + contact.name + '</div>' +
                        '<div class="feixun-contact-preview">' + previewText + '</div>' +
                    '</div>' +
                    '<div class="feixun-contact-arrow">▼</div>';

                item.addEventListener('click', function (e) {
                    if (e.target.closest('.feixun-contact-arrow')) {
                        item.classList.toggle('expanded');
                    } else if (e.target.closest('.feixun-contact-avatar')) {
                        e.stopPropagation();
                        self.openAvatarPicker('contact', index);
                    } else {
                        self.selectContact(index);
                    }
                });

                item.addEventListener('contextmenu', function (e) {
                    e.preventDefault();
                    self.openEditModal(index);
                });

                container.appendChild(item);

                if (contact.dialogues.length > 0) {
                    var dialoguesDiv = document.createElement('div');
                    dialoguesDiv.className = 'feixun-contact-dialogues';
                    contact.dialogues.forEach(function (dlg, dlgIndex) {
                        var summary = document.createElement('div');
                        summary.className = 'feixun-dialogue-summary ' + (dlgIndex === self.currentDialogueIndex ? 'active' : '');
                        summary.textContent = dlg.title || ('对话 ' + (dlgIndex + 1));
                        summary.addEventListener('click', function (e) {
                            e.stopPropagation();
                            self.selectDialogue(index, dlgIndex);
                        });
                        dialoguesDiv.appendChild(summary);
                    });
                    item.appendChild(dialoguesDiv);
                }
            });
        },

        /** 选择联系人 */
        selectContact: function (index) {
            this.currentContactIndex = index;
            this.currentDialogueIndex = 0;
            this.renderContacts();
            this.renderMessages();
            this.updateChatTitle();
            this.persist();
        },

        /** 选择对话 */
        selectDialogue: function (contactIndex, dialogueIndex) {
            this.currentContactIndex = contactIndex;
            this.currentDialogueIndex = dialogueIndex;
            this.renderContacts();
            this.renderMessages();
            this.persist();
        },

        /** 更新聊天标题和个性标签 */
        updateChatTitle: function () {
            var titleText = document.getElementById('feixun-chat-title-text');
            var tagText = document.getElementById('feixun-chat-tag-text');
            if (titleText && this.contacts[this.currentContactIndex]) {
                titleText.textContent = this.contacts[this.currentContactIndex].name;
            }
            if (tagText && this.contacts[this.currentContactIndex]) {
                tagText.textContent = this.contacts[this.currentContactIndex].tag || '';
            }
        },

        /** 初始化可编辑聊天标题和个性标签 */
        initEditableTitle: function () {
            var self = this;
            var titleText = document.getElementById('feixun-chat-title-text');
            if (titleText && titleText.dataset.bound !== '1') {
                titleText.dataset.bound = '1';
                titleText.addEventListener('blur', function () {
                    var newName = titleText.textContent.trim();
                    var contact = self.contacts[self.currentContactIndex];
                    if (contact) {
                        if (newName) {
                            contact.name = newName;
                        } else {
                            titleText.textContent = contact.name;
                        }
                        self.renderContacts();
                        self.persist();
                    }
                });
                titleText.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        titleText.blur();
                    }
                });
            }

            var tagText = document.getElementById('feixun-chat-tag-text');
            if (tagText && tagText.dataset.bound !== '1') {
                tagText.dataset.bound = '1';
                tagText.addEventListener('blur', function () {
                    var newTag = tagText.textContent.trim();
                    var contact = self.contacts[self.currentContactIndex];
                    if (contact) {
                        contact.tag = newTag;
                        self.persist();
                    }
                });
                tagText.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        tagText.blur();
                    }
                });
            }
        },

        /** 渲染消息列表 */
        renderMessages: function () {
            var container = document.getElementById('feixun-messages');
            if (!container) return;
            container.innerHTML = '';
            var self = this;

            var contact = this.contacts[this.currentContactIndex];
            if (!contact) return;

            var dialogue = contact.dialogues[this.currentDialogueIndex];
            if (!dialogue || !dialogue.messages) return;

            dialogue.messages.forEach(function (msg, index) {
                var msgDiv = document.createElement('div');
                msgDiv.className = 'feixun-message ' + msg.side;
                msgDiv.dataset.index = index;

                var avatarHtml;
                if (msg.side === 'right') {
                    // 漂泊者（右侧）固定使用 piaobozhe.png 头像
                    avatarHtml = '<img src="backgrounds/piaobozhe.png" alt="漂泊者">';
                } else {
                    avatarHtml = msg.avatar
                        ? '<img src="' + msg.avatar + '" alt="' + msg.sender + '">'
                        : '<div class="msg-avatar-placeholder">' + msg.sender.charAt(0) + '</div>';
                }

                               var bubbleColor = msg.side === 'right' ? 'rgb(255,255,255)' : 'rgb(42,45,49)';
                msgDiv.innerHTML =
                    '<div class="feixun-message-avatar">' + avatarHtml + '</div>' +
                    '<div class="feixun-message-content">' +
                        '<div class="feixun-message-sender">' + msg.sender + '</div>' +
                        '<div class="feixun-message-bubble" contenteditable="true" data-index="' + index + '" style="color: ' + bubbleColor + ';">' + msg.text + '</div>' +
                        '<div class="feixun-message-actions">' +
                            '<button class="feixun-msg-action-btn delete" data-action="delete" data-index="' + index + '">删除</button>' +
                        '</div>' +
                    '</div>';

                var deleteBtn = msgDiv.querySelector('[data-action="delete"]');
                if (deleteBtn) deleteBtn.addEventListener('click', function () { self.deleteMessage(index); });

                var msgAvatar = msgDiv.querySelector('.feixun-message-avatar');
                if (msgAvatar) msgAvatar.addEventListener('click', function () { self.openAvatarPicker('message', index); });

                var bubble = msgDiv.querySelector('.feixun-message-bubble');
                if (bubble) {
                    bubble.addEventListener('blur', function () {
                        self.updateMessageText(index, bubble.textContent);
                    });
                    bubble.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            bubble.blur();
                        }
                    });
                }

                container.appendChild(msgDiv);
            });

            container.scrollTop = container.scrollHeight;
            this.applyPiaoboFormatting();
        },

        /** 获取漂泊者格式设置（从战双版共享状态读取） */        getPiaoboFormat: function () {
            try {
                if (typeof state !== 'undefined' && state.textFormatting && state.textFormatting.commander) {
                    var fmt = state.textFormatting.commander;
                    var invalidValues = ['', 'null', 'undefined', 'inherit', 'initial', 'transparent'];
                    var color = fmt.color && invalidValues.indexOf(fmt.color) === -1 ? fmt.color : '#ffffff';
                    var fontSize = fmt.fontSize || 14;
                    return { color: color, fontSize: fontSize };
                }
            } catch (e) { /* 忽略跨模块访问异常 */ }
            return { color: '#ffffff', fontSize: 14 };
        },
        
        /** 应用漂泊者文本格式到右侧消息气泡（不影响其他文本样式） */
         applyPiaoboFormatting: function () {
            var format = this.getPiaoboFormat();
            var container = document.getElementById('feixun-messages');
            if (!container) return;
            var rightBubbles = container.querySelectorAll('.feixun-message.right .feixun-message-bubble');
            for (var i = 0; i < rightBubbles.length; i++) {
                var c = format.color ? format.color.toLowerCase().replace(/\s/g, '') : '';
                var isBlack = c === '#000000' || c === '#000' || c === 'rgb(0,0,0)' || c === 'black';
                var isInvalid = !c || c === 'null' || c === 'undefined' || c === 'inherit' || c === 'initial' || c === 'transparent';
                if (!isInvalid && !isBlack) {
                    rightBubbles[i].style.color = format.color;
                }
                if (format.fontSize && format.fontSize > 0) {
                    rightBubbles[i].style.fontSize = format.fontSize + 'px';
                }
            }
        },

        /** 发送消息（默认右侧 = 漂泊者） */
        sendMessage: function () {
            var input = document.getElementById('feixun-input-text');
            if (!input) return;
            var text = input.value.trim();
            if (!text) return;

            var contact = this.contacts[this.currentContactIndex];
            if (!contact) return;

            var dialogue = contact.dialogues[this.currentDialogueIndex];
            if (!dialogue) {
                dialogue = { id: 'dlg_' + contact.id + '_' + Date.now(), title: '新对话', messages: [] };
                contact.dialogues.push(dialogue);
                this.currentDialogueIndex = contact.dialogues.length - 1;
            }

            dialogue.messages.push({
                id: 'msg_' + Date.now(),
                side: 'right',
                sender: '漂泊者',
                text: text,
                avatar: null
            });

            input.value = '';
            this.renderMessages();
            this.renderContacts();
            this.persist();
        },

        /** 添加快捷消息（左侧或右侧） */
        addQuickMessage: function (side) {
            var contact = this.contacts[this.currentContactIndex];
            if (!contact) return;

            var dialogue = contact.dialogues[this.currentDialogueIndex];
            if (!dialogue) {
                dialogue = { id: 'dlg_' + contact.id + '_' + Date.now(), title: '新对话', messages: [] };
                contact.dialogues.push(dialogue);
                this.currentDialogueIndex = contact.dialogues.length - 1;
            }

            var senderName = side === 'right' ? '漂泊者' : contact.name;
            var piaoboAvatar = 'backgrounds/piaobozhe.png';
            dialogue.messages.push({
                id: 'msg_' + Date.now(),
                side: side,
                sender: senderName,
                text: '',
                avatar: side === 'right' ? piaoboAvatar : null
            });

            this.renderMessages();
            this.renderContacts();

            var self = this;
            setTimeout(function () {
                var container = document.getElementById('feixun-messages');
                var newBubble = container.querySelector('.feixun-message:last-child .feixun-message-bubble');
                if (newBubble) {
                    newBubble.focus();
                    container.scrollTop = container.scrollHeight;
                }
            }, 50);
            this.persist();
        },

        /** 更新消息文本 */
        updateMessageText: function (index, text) {
            var contact = this.contacts[this.currentContactIndex];
            if (!contact) return;
            var dialogue = contact.dialogues[this.currentDialogueIndex];
            if (!dialogue || !dialogue.messages[index]) return;
            dialogue.messages[index].text = text;
            this.renderContacts();
            this.persist();
        },

        /** 删除消息 */
        deleteMessage: function (index) {
            var contact = this.contacts[this.currentContactIndex];
            if (!contact) return;
            var dialogue = contact.dialogues[this.currentDialogueIndex];
            if (!dialogue || !dialogue.messages[index]) return;
            if (!confirm('确定要删除这条消息吗？')) return;
            dialogue.messages.splice(index, 1);
            this.renderMessages();
            this.renderContacts();
            this.persist();
        },

        /** 打开编辑弹窗 */
        openEditModal: function (index) {
            this.editingContactIndex = index;
            var modal = document.getElementById('feixun-contact-modal');
            var title = document.getElementById('feixun-edit-title');
            var nameInput = document.getElementById('feixun-contact-name-input');
            var deleteBtn = document.getElementById('feixun-edit-delete');
            var avatarUpload = document.getElementById('feixun-avatar-upload');

            this.tempAvatar = null;

            if (index >= 0 && this.contacts[index]) {
                var contact = this.contacts[index];
                title.textContent = '编辑联系人';
                nameInput.value = contact.name;
                deleteBtn.style.display = 'block';
                if (contact.avatar) {
                    avatarUpload.innerHTML = '<img src="' + contact.avatar + '" alt="' + contact.name + '">';
                    this.tempAvatar = contact.avatar;
                } else {
                    avatarUpload.innerHTML = '<span class="upload-hint">点击上传头像</span>';
                }
            } else {
                title.textContent = '添加联系人';
                nameInput.value = '';
                deleteBtn.style.display = 'none';
                avatarUpload.innerHTML = '<span class="upload-hint">点击上传头像</span>';
            }
            modal.classList.add('active');
        },

        /** 关闭编辑弹窗 */
        closeEditModal: function () {
            var modal = document.getElementById('feixun-contact-modal');
            modal.classList.remove('active');
            this.editingContactIndex = null;
            this.tempAvatar = null;
        },

        /** 保存联系人 */
        saveContact: function () {
            var nameInput = document.getElementById('feixun-contact-name-input');
            var name = nameInput.value.trim();
            if (!name) { alert('请输入联系人名称'); return; }

            if (this.editingContactIndex >= 0 && this.contacts[this.editingContactIndex]) {
                this.contacts[this.editingContactIndex].name = name;
                if (this.tempAvatar) this.contacts[this.editingContactIndex].avatar = this.tempAvatar;
            } else {
                this.contacts.push({
                    id: 'contact_' + Date.now(),
                    name: name,
                    avatar: this.tempAvatar,
                    dialogues: []
                });
                this.currentContactIndex = this.contacts.length - 1;
            }

            this.closeEditModal();
            this.renderContacts();
            this.renderMessages();
            this.updateChatTitle();
            this.persist();
        },

        /** 删除联系人 */
        deleteContact: function () {
            if (this.editingContactIndex < 0 || !this.contacts[this.editingContactIndex]) return;
            if (!confirm('确定要删除这个联系人吗？所有对话记录也将被删除。')) return;
            this.contacts.splice(this.editingContactIndex, 1);
            if (this.currentContactIndex >= this.contacts.length) {
                this.currentContactIndex = Math.max(0, this.contacts.length - 1);
            }
            this.closeEditModal();
            this.renderContacts();
            this.renderMessages();
            this.updateChatTitle();
            this.persist();
        },

        /** 处理头像上传 */
        handleAvatarUpload: function (e) {
            var self = this;
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (event) {
                self.tempAvatar = event.target.result;
                var avatarUpload = document.getElementById('feixun-avatar-upload');
                avatarUpload.innerHTML = '<img src="' + self.tempAvatar + '" alt="头像">';
            };
            reader.readAsDataURL(file);
        },

        /** 打开头像选择器（支持联系人和消息头像） */
        openAvatarPicker: function (target, index) {
            var self = this;
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.addEventListener('change', function (e) {
                var file = e.target.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function (event) {
                    var dataUrl = event.target.result;
                    if (target === 'contact') {
                        if (self.contacts[index]) {
                            self.contacts[index].avatar = dataUrl;
                            self.renderContacts();
                            self.persist();
                        }
                    } else if (target === 'message') {
                        var contact = self.contacts[self.currentContactIndex];
                        var dialogue = contact && contact.dialogues[self.currentDialogueIndex];
                        if (dialogue && dialogue.messages[index]) {
                            dialogue.messages[index].avatar = dataUrl;
                            self.renderMessages();
                            self.persist();
                        }
                    }
                };
                reader.readAsDataURL(file);
            });
            input.click();
        },

        /** 导出当前对话为图片 */
        exportChat: function () {
            var container = document.getElementById('feixun-container');
            if (!container || typeof html2canvas === 'undefined') {
                console.warn('[MingMode] html2canvas 未加载，无法导出');
                return Promise.resolve();
            }

            var previewContainer = document.getElementById('preview-container');
            var messagesEl = document.getElementById('feixun-messages');
            var chatTitle = document.getElementById('feixun-chat-title');

            // --- 1. 保存原始样式 ---
            var savedPreviewBg = previewContainer ? previewContainer.style.getPropertyValue('background') : '';
            var savedPreviewBgPri = previewContainer ? previewContainer.style.getPropertyPriority('background') : '';
            var savedContainerBg = container.style.background;

            var msgBg = messagesEl ? messagesEl.querySelector('.feixun-messages-bg') : null;
            var chatHeader = chatTitle ? chatTitle.closest('.feixun-chat-header') : null;
            var chatBg = chatHeader ? chatHeader.querySelector('.feixun-chat-header-bg') : null;

            var savedMsgBgColor = messagesEl ? messagesEl.style.backgroundColor : '';
            var savedChatBgColor = chatHeader ? chatHeader.style.backgroundColor : '';
            var savedChatArea = container.querySelector('.feixun-chat-area');
            var savedChatAreaBg = savedChatArea ? savedChatArea.style.backgroundColor : '';
            var mainRow = container.querySelector('.feixun-main-row');
            var savedMainRowBg = mainRow ? mainRow.style.background : '';

            // --- 2. 临时应用实色背景 ---
            if (previewContainer) previewContainer.style.setProperty('background', 'linear-gradient(180deg, #d5d5d5 0%, #c8c8c8 100%)', 'important');
            container.style.background = 'linear-gradient(180deg, #d5d5d5 0%, #c8c8c8 100%)';
            if (mainRow) mainRow.style.setProperty('background', 'linear-gradient(180deg, #d5d5d5 0%, #c8c8c8 100%)', 'important');

            // --- 3. 保留图片关联叠加层（MC3.png / MC4.png），html2canvas 可渲染 background-image ---
            // 不再隐藏它们，让 html2canvas 正确捕获叠加层的亮度

            // --- 4. 为底层容器设置实色背景（作为叠加层的底色） ---
            if (messagesEl) messagesEl.style.backgroundColor = 'rgb(210, 210, 210)';
            if (chatHeader) chatHeader.style.backgroundColor = 'rgb(230, 232, 235)';
            if (savedChatArea) savedChatArea.style.backgroundColor = 'rgb(230, 232, 235)';

            // --- 5. 消息气泡：高 z-index + 实色背景 + 边框 + 无阴影 + 饱和度增强 ---
            var bubbles = container.querySelectorAll('.feixun-message-bubble');
            var savedBubbleStyles = [];
            bubbles.forEach(function (bubble, i) {
                savedBubbleStyles[i] = {
                    border: bubble.style.border,
                    boxShadow: bubble.style.boxShadow,
                    background: bubble.style.background,
                    backgroundColor: bubble.style.backgroundColor,
                    zIndex: bubble.style.zIndex
                };
                var isRight = bubble.closest('.feixun-message.right');
                if (isRight) {
                    bubble.style.setProperty('background', 'rgb(37, 41, 46)', 'important');
                    bubble.style.border = '1px solid rgb(37, 41, 46)';
                } else {
                    bubble.style.setProperty('background', 'rgb(255, 255, 255)', 'important');
                    bubble.style.border = '1px solid rgb(255, 255, 255)';
                }
                bubble.style.boxShadow = 'none';
                bubble.style.zIndex = '9999';
            });

            // --- 6. 头像：高 z-index + 边框 + 饱和度增强 ---
            var avatars = container.querySelectorAll('.feixun-message-avatar');
            var savedAvatarStyles = [];
            avatars.forEach(function (avatar, i) {
                savedAvatarStyles[i] = {
                    border: avatar.style.border,
                    zIndex: avatar.style.zIndex
                };
                avatar.style.border = '2px solid rgba(0, 0, 0, 0.08)';
                avatar.style.zIndex = '9999';
            });

            // --- 7. 联系人列表项：确保实色背景 + 亮度增强 ---
            var contacts = container.querySelectorAll('.feixun-contact-item');
            var savedContactStyles = [];
            contacts.forEach(function (contact, i) {
                savedContactStyles[i] = {
                    background: contact.style.background,
                    backgroundColor: contact.style.backgroundColor,
                    zIndex: contact.style.zIndex
                };
                contact.style.setProperty('background-color', 'rgb(231, 232, 232)', 'important');
                contact.style.zIndex = '50';
            });

            // --- 7b. 消息列表和联系人列表：确保 z-index 层级正确 ---
            var savedMsgsZIndex = messagesEl ? messagesEl.style.zIndex : '';
            var contactList = container.querySelector('.feixun-contact-list');
            var savedContactListZIndex = contactList ? contactList.style.zIndex : '';
            if (messagesEl) messagesEl.style.zIndex = '10';
            if (contactList) contactList.style.zIndex = '10';


            // --- 8. 恢复函数 ---
            var restoreExportStyles = function () {
                if (previewContainer) previewContainer.style.setProperty('background', savedPreviewBg, savedPreviewBgPri);
                container.style.background = savedContainerBg;
                if (mainRow) mainRow.style.background = savedMainRowBg;
                if (messagesEl) messagesEl.style.backgroundColor = savedMsgBgColor;
                if (chatHeader) chatHeader.style.backgroundColor = savedChatBgColor;
                if (savedChatArea) savedChatArea.style.backgroundColor = savedChatAreaBg;
                bubbles.forEach(function (bubble, i) {
                    bubble.style.border = savedBubbleStyles[i].border;
                    bubble.style.boxShadow = savedBubbleStyles[i].boxShadow;
                    bubble.style.background = savedBubbleStyles[i].background;
                    bubble.style.backgroundColor = savedBubbleStyles[i].backgroundColor;
                    bubble.style.zIndex = savedBubbleStyles[i].zIndex;
                });
                avatars.forEach(function (avatar, i) {
                    avatar.style.border = savedAvatarStyles[i].border;
                    avatar.style.zIndex = savedAvatarStyles[i].zIndex;
                });
                contacts.forEach(function (contact, i) {
                    contact.style.background = savedContactStyles[i].background;
                    contact.style.backgroundColor = savedContactStyles[i].backgroundColor;
                    contact.style.zIndex = savedContactStyles[i].zIndex;
                });
                if (messagesEl) messagesEl.style.zIndex = savedMsgsZIndex;
                if (contactList) contactList.style.zIndex = savedContactListZIndex;
            };

            // --- 9. html2canvas 捕获 + 后处理滤镜 ---
            return html2canvas(container, {
                backgroundColor: '#d0d0d0',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true
            }).then(function (canvas) {
                var link = document.createElement('a');
                link.download = 'feixun_chat_' + Date.now() + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(function (err) {
                console.error('[MingMode] 导出失败:', err);
                alert('导出失败，请重试');
            }).finally(function () {
                restoreExportStyles();
            });
        },

        /** 获取联系人数据（供工程数据互通） */
        getContactsData: function () {
            return JSON.parse(JSON.stringify(this.contacts));
        },

        /** 设置联系人数据（供工程数据互通） */
        setContactsData: function (data) {
            if (Array.isArray(data)) {
                this.contacts = JSON.parse(JSON.stringify(data));
                this.currentContactIndex = 0;
                this.currentDialogueIndex = 0;
                this.renderContacts();
                this.renderMessages();
                this.updateChatTitle();
                this.persist();
                
            }
        }
    };

    /* ========================================================
     * 第三部分：飞讯模式 UI 切换
     * ======================================================== */
    function toggleFeixunMode(enable) {
        var previewContainer = document.getElementById('preview-container');
        var app = document.getElementById('app');
        var banner = document.getElementById('feixun-association-banner');
        if (enable) {
            if (previewContainer) previewContainer.classList.add('feixun-mode');
            if (app) app.classList.add('feixun-mode-active');
            document.body.classList.add('feixun-mode-active');
            if (banner) banner.classList.add('visible');
            if (!FeixunSystem._initialized) FeixunSystem.init();
        } else {
            if (previewContainer) previewContainer.classList.remove('feixun-mode');
            if (app) app.classList.remove('feixun-mode-active');
            document.body.classList.remove('feixun-mode-active');
            if (banner) banner.classList.remove('visible');
        }
    }

    /* ========================================================
     * 第四部分：DOM 片段注入（从 ming.html 加载）
     * ======================================================== */
    var MING_HTML_PATH = 'ming-mode/ming.html';

    /** 从 ming.html 提取指定片段并返回 DocumentFragment */
    function extractFragment(doc, fragmentName) {
        var templates = doc.querySelectorAll('template[data-ming-fragment]');
        for (var i = 0; i < templates.length; i++) {
            if (templates[i].getAttribute('data-ming-fragment') === fragmentName) {
                return templates[i].content.cloneNode(true);
            }
        }
        return null;
    }

    /** 所有需要提取的片段名称（feixun-banner 已合并进 feixun-container，不再单独注入） */
    var FRAGMENT_NAMES = ['intro-slide', 'feixun-container', 'ming-bg-select', 'feixun-left-btn', 'feixun-right-btn', 'feixun-modal', 'mode-nav'];

    /**
     * 解析 HTML 字符串，提取所有 data-ming-fragment 模板片段。
     * fetch 成功和 MING_HTML_FALLBACK 兜底共用此逻辑。
     */
    function parseHtmlToFragments(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var fragments = {};
        FRAGMENT_NAMES.forEach(function (n) {
            var f = extractFragment(doc, n);
            if (f) fragments[n] = f;
        });
        return fragments;
    }

    /** 注入鸣潮 DOM 片段到主页面中立挂载点（不寄生战双专属 DOM） */
    function injectFragments(fragments) {
        // 1. intro-slide → 注入到 #intro-slider（共享欢迎页滑动容器）
        if (!document.getElementById('intro-ming')) {
            var slider = document.getElementById('intro-slider');
            if (slider && fragments['intro-slide']) {
                slider.appendChild(fragments['intro-slide']);
            }
        }

        // 2. feixun-container（含内置 banner）→ 注入到中立挂载点 #ming-preview-slot（回退到 #preview-container）
        if (!document.getElementById('feixun-container')) {
            var previewSlot = document.getElementById('ming-preview-slot') || document.getElementById('preview-container');
            if (previewSlot && fragments['feixun-container']) {
                previewSlot.appendChild(fragments['feixun-container']);
            }
        }

        // 3. ming-bg-select → 注入到中立挂载点 #ming-left-slot
        if (!document.getElementById('ming-bg-select-section')) {
            var leftSlot = document.getElementById('ming-left-slot');
            if (leftSlot && fragments['ming-bg-select']) {
                leftSlot.appendChild(fragments['ming-bg-select']);
            }
        }

        // 4. feixun-left-btn → 注入到中立挂载点 #ming-left-slot
        if (!document.getElementById('feixun-add-dialog-btn-left')) {
            var leftSlot = document.getElementById('ming-left-slot');
            if (leftSlot && fragments['feixun-left-btn']) {
                leftSlot.appendChild(fragments['feixun-left-btn']);
            }
        }

        // 4. feixun-right-btn → 注入到中立挂载点 #ming-right-slot
        if (!document.getElementById('feixun-piaobo-dialog-btn-right')) {
            var rightSlot = document.getElementById('ming-right-slot');
            if (rightSlot && fragments['feixun-right-btn']) {
                rightSlot.appendChild(fragments['feixun-right-btn']);
            }
        }

        // 5. feixun-modal → 注入到 body 末尾
        if (!document.getElementById('feixun-contact-modal')) {
            if (fragments['feixun-modal']) {
                document.body.appendChild(fragments['feixun-modal']);
            }
        }

        // 6. mode-nav → 注入到中立挂载点 #ming-mode-root
        if (!document.getElementById('ming-mode-nav')) {
            var mingRoot = document.getElementById('ming-mode-root');
            if (mingRoot && fragments['mode-nav']) {
                mingRoot.appendChild(fragments['mode-nav']);
            }
        }
    }

    /**
     * 加载 ming.html 并注入片段。
     * 优先 fetch（需 http:// 本地服务器）；失败时（file:// 双击打开）解析 MING_HTML_FALLBACK 兜底。
     */
    function loadAndInject(callback) {
        function parseAndInject(html, source) {
            try {
                var fragments = parseHtmlToFragments(html);
                injectFragments(fragments);
            } catch (e) {
                console.warn('[MingMode] 解析 HTML 失败 (' + source + '):', e);
            }
            if (callback) callback();
        }

        if (global.fetch) {
            fetch(MING_HTML_PATH)
                .then(function (res) { return res.text(); })
                .then(function (html) {
                    parseAndInject(html, 'fetch ming.html');
                })
                .catch(function (err) {
                    console.warn('[MingMode] fetch ming.html 失败（可能是 file:// 协议），使用 MING_HTML_FALLBACK 兜底:', err);
                    parseAndInject(MING_HTML_FALLBACK, 'MING_HTML_FALLBACK');
                });
        } else {
            // 无 fetch 能力（极老浏览器），直接使用兜底
            parseAndInject(MING_HTML_FALLBACK, 'MING_HTML_FALLBACK (no fetch)');
        }
    }

    /* ========================================================
     * 第五部分：模式路由与切换（轻量通信）
     * --------------------------------------------------------
     * 切换方式：
     *   1. 顶部导航按钮点击
     *   2. 左右滑动手势（触摸 + 鼠标拖拽）
     *   3. 箭头点击
     * 切换时派发 CustomEvent("ming-mode-switch")，主路由据此协调。
     * ======================================================== */
    var ModeRouter = {
        currentMode: 'zhan',  // 默认战双
        _switching: false,

        /** 切换到指定模式 */
        switchTo: function (mode) {
            if (mode === this.currentMode || this._switching) return;
            this._switching = true;
            var self = this;
            var prevMode = this.currentMode;
            this.currentMode = mode;
            // 同步到 window.currentMode（向后兼容战双版遗留引用）
            global.currentMode = mode;
            var slideZhan = document.getElementById('intro-zhan');
            var slideMing = document.getElementById('intro-ming');

            if (mode === 'ming') {
                // 显示鸣潮，隐藏战双
                if (slideMing) slideMing.classList.add('intro-slide-active');
                if (slideZhan) slideZhan.classList.add('intro-slide-hidden-left');
                if (slideMing) slideMing.style.pointerEvents = 'auto';
                if (slideZhan) slideZhan.style.pointerEvents = 'none';
                document.title = '鸣潮剧情二创制作网站';
                applyMingLayout(true);
            } else {
                // 显示战双，隐藏鸣潮
                if (slideMing) slideMing.classList.remove('intro-slide-active');
                if (slideZhan) slideZhan.classList.remove('intro-slide-hidden-left');
                if (slideMing) slideMing.style.pointerEvents = 'none';
                if (slideZhan) slideZhan.style.pointerEvents = 'auto';
                document.title = '战双帕弥什剧情二创网站';
                applyMingLayout(false);
            }

            // 更新顶部导航按钮高亮
            var navBtns = document.querySelectorAll('.ming-mode-nav-btn');
            navBtns.forEach(function (btn) {
                if (btn.getAttribute('data-mode') === mode) btn.classList.add('active');
                else btn.classList.remove('active');
            });

            // 派发轻量通信事件（主路由 / 战双版可监听）
            global.dispatchEvent(new CustomEvent('ming-mode-switch', {
                detail: { from: prevMode, to: mode, source: 'ming-module' }
            }));

            // 同步到共享配置
            SharedConfig.write({ lastMode: mode });

            setTimeout(function () { self._switching = false; }, 500);
        },

        /** 切换到战双模式（对外暴露的核心接口） */
        switchToZhan: function () {
            this.switchTo('zhan');
        },

        /** 切换到鸣潮模式 */
        switchToMing: function () {
            this.switchTo('ming');
        },

        /** 初始化切换交互（箭头 + 滑动 + 顶部导航） */
        initInteractions: function () {
            var self = this;

            // ====== 箭头点击 ======
            var arrowRight = document.getElementById('arrow-right');
            var arrowLeft = document.getElementById('arrow-left');
            if (arrowRight) {
                arrowRight.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self.switchTo('ming');
                });
            }
            if (arrowLeft) {
                arrowLeft.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self.switchTo('zhan');
                });
            }

            // ====== 顶部导航按钮 ======
            document.addEventListener('click', function (e) {
                var btn = e.target.closest('.ming-mode-nav-btn');
                if (btn) {
                    var targetMode = btn.getAttribute('data-mode');
                    if (targetMode) self.switchTo(targetMode);
                }
            });

            // ====== 触摸/鼠标滑动 ======
            var slider = document.getElementById('intro-slider');
            if (!slider) return;

            var SWIPE_THRESHOLD = 60;
            var startX = 0, startY = 0, isDragging = false;

            function handleStart(x, y) { startX = x; startY = y; isDragging = true; }
            function handleEnd(x, y) {
                if (!isDragging) return;
                isDragging = false;
                var deltaX = x - startX;
                var deltaY = y - startY;
                if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                    if (deltaX > 0 && self.currentMode === 'ming') {
                        self.switchTo('zhan');
                    } else if (deltaX < 0 && self.currentMode === 'zhan') {
                        self.switchTo('ming');
                    }
                }
            }

            slider.addEventListener('touchstart', function (e) {
                handleStart(e.touches[0].clientX, e.touches[0].clientY);
            }, { passive: true });
            slider.addEventListener('touchend', function (e) {
                handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            });

            slider.addEventListener('mousedown', function (e) {
                if (e.target.closest('.slide-arrow')) return;
                handleStart(e.clientX, e.clientY);
                e.preventDefault();
            });
            document.addEventListener('mouseup', function (e) {
                if (isDragging) handleEnd(e.clientX, e.clientY);
            });

            // ====== 监听主路由 / 战双版的反向切换请求 ======
            global.addEventListener('request-mode-switch', function (e) {
                if (e.detail && e.detail.to) {
                    self.switchTo(e.detail.to);
                }
            });
        }
    };

    /** 重命名更多设置中的指挥官标签（鸣潮模式下改为“漂泊者”，战双模式恢复“指挥官”） */
    function renameCommanderLabels(name) {
        // 指挥官文本颜色标签
        var colorValue = document.getElementById('commander-color-value');
        if (colorValue && colorValue.parentNode) {
            var colorLabel = colorValue.parentNode;
            if (colorLabel.childNodes[0] && colorLabel.childNodes[0].nodeType === 3) {
                colorLabel.childNodes[0].nodeValue = name + '文本颜色: ';
            }
        }
        // 指挥官文本大小标签
        var sizeValue = document.getElementById('commander-size-value');
        if (sizeValue && sizeValue.parentNode) {
            var sizeLabel = sizeValue.parentNode;
            if (sizeLabel.childNodes[0] && sizeLabel.childNodes[0].nodeType === 3) {
                sizeLabel.childNodes[0].nodeValue = name + '文本大小: ';
            }
        }
        // 右侧面板"指挥官对话"按钮
        var btnRight = document.getElementById('commander-dialog-btn-right');
        if (btnRight) {
            btnRight.textContent = name + '对话';
        }
        // 左侧面板"指挥官设置"标题与按钮
        var cmdSectionLeft = document.getElementById('commander-section-left');
        if (cmdSectionLeft) {
            var title = cmdSectionLeft.querySelector('.section-title');
            if (title) title.textContent = name + '设置';
        }
        var cmdBtnLeft = document.getElementById('commander-dialog-btn-left');
        if (cmdBtnLeft) {
            cmdBtnLeft.textContent = name + '对话';
        }
        // 修改对话框 placeholder
        var commanderText = document.getElementById('commander-text');
        if (commanderText) {
            commanderText.placeholder = '输入' + name + '对话内容';
        }
    }

    // 输入框值缓存（用于模式切换时保存/恢复）
    var _inputCache = {
        zhan: {
            characterName: '',
            dialogInput: '',
            commanderText: ''
        },
        ming: {
            characterName: '',
            dialogInput: '',
            commanderText: ''
        }
    };

    /** 保存战双输入框值到缓存 */
    function saveZhanInputValues() {
        var characterName = document.getElementById('character-name');
        var dialogInput = document.getElementById('dialog-input');
        var commanderText = document.getElementById('commander-text');
        _inputCache.zhan.characterName = characterName ? characterName.value : '';
        _inputCache.zhan.dialogInput = dialogInput ? dialogInput.value : '';
        _inputCache.zhan.commanderText = commanderText ? commanderText.value : '';
    }

    /** 保存鸣潮输入框值到缓存 */
    function saveMingInputValues() {
        var characterName = document.getElementById('character-name');
        var dialogInput = document.getElementById('dialog-input');
        var commanderText = document.getElementById('commander-text');
        _inputCache.ming.characterName = characterName ? characterName.value : '';
        _inputCache.ming.dialogInput = dialogInput ? dialogInput.value : '';
        _inputCache.ming.commanderText = commanderText ? commanderText.value : '';
    }

    /** 恢复战双输入框值 */
    function restoreZhanInputValues() {
        var characterName = document.getElementById('character-name');
        var dialogInput = document.getElementById('dialog-input');
        var commanderText = document.getElementById('commander-text');
        if (characterName) characterName.value = _inputCache.zhan.characterName;
        if (dialogInput) dialogInput.value = _inputCache.zhan.dialogInput;
        if (commanderText) commanderText.value = _inputCache.zhan.commanderText;
    }

    /** 恢复鸣潮输入框值 */
    function restoreMingInputValues() {
        var characterName = document.getElementById('character-name');
        var dialogInput = document.getElementById('dialog-input');
        var commanderText = document.getElementById('commander-text');
        // 只在缓存有值时才恢复，避免覆盖 HTML 初始值
        if (characterName && _inputCache.ming.characterName !== '') characterName.value = _inputCache.ming.characterName;
        if (dialogInput && _inputCache.ming.dialogInput !== '') dialogInput.value = _inputCache.ming.dialogInput;
        if (commanderText && _inputCache.ming.commanderText !== '') commanderText.value = _inputCache.ming.commanderText;
    }

    /** 应用鸣潮模式布局变更（隐藏战双专属元素 + 飞讯开关） */
    function applyMingLayout(isMing) {
        // 鸣潮模式下需要隐藏的战双编辑元素
        var mingHiddenIds = [
            'bg-select-subsection',
            'left-char-select-subsection',
            'right-char-select-subsection',
            'export-gif-btn-left',
            'export-gif-fast-btn-left',
            'export-gif-btn-right',
            'export-gif-fast-btn-right'
        ];

        var switchLabelOld = document.getElementById('switch-label-old');
        var switchLabelNew = document.getElementById('switch-label-new');
        var uiStyleSwitch = document.getElementById('ui-style-switch');

        // --- 模式切换时，独立管理对话框可见性 ---
        var commanderDialog = document.getElementById('commander-dialog');
        var commanderText = document.getElementById('commander-text');

        // 先保存当前场景中对话框的可见状态到对应模式
        if (commanderDialog && typeof state !== 'undefined') {
            var curScene = state.scenes[state.currentSceneIndex];
            if (curScene) {
                var currentlyVisible = commanderDialog.style.display !== 'none';
                if (document.body.classList.contains('ming-active')) {
                    curScene.mingCommanderDialogVisible = currentlyVisible;
                } else {
                    curScene.commanderDialogVisible = currentlyVisible;
                }
            }
        }

        // 隐藏对话框，防止跨模式泄漏
        if (commanderDialog) commanderDialog.style.display = 'none';

        if (isMing) {
            // 先保存战双输入框值
            saveZhanInputValues();

            document.body.classList.add('ming-active');
            mingHiddenIds.forEach(function (id) {
                var node = document.getElementById(id);
                if (node) node.classList.add('ming-hidden');
            });
            if (switchLabelOld) switchLabelOld.textContent = '剧情';
            if (switchLabelNew) switchLabelNew.textContent = '飞讯';
            // 鸣潮默认进入剧情模式（关闭飞讯开关）
            if (uiStyleSwitch && uiStyleSwitch.checked) {
                uiStyleSwitch.checked = false;
                uiStyleSwitch.dispatchEvent(new Event('change'));
            }
            // 将"指挥官"重命名为"漂泊者"
            renameCommanderLabels('漂泊者');
            // 保存战双预览状态并清空预览区（防止战双背景/角色立绘在鸣潮模式下显示）
            // ★ 必须在 MingBackgroundSystem.init() 之前执行，否则保存的是鸣潮背景
            saveZhanPreviewState();
            clearPreviewForMing();
            // 初始化或重新应用鸣潮背景选择系统（仅在剧情模式下）
            if (MingBackgroundSystem._initialized) {
                // 已初始化过（从战双切回来），需重新应用背景
                MingBackgroundSystem.reapplyBackground();
            } else {
                MingBackgroundSystem.init();
            }

            // 恢复鸣潮输入框值（如果存在缓存）
            restoreMingInputValues();
            // 恢复鸣潮模式下对话框的可见状态
            if (commanderDialog && typeof state !== 'undefined') {
                var mingScene = state.scenes[state.currentSceneIndex];
                if (mingScene && mingScene.mingCommanderDialogVisible) {
                    commanderDialog.style.display = 'flex';
                    if (commanderText) commanderText.focus();
                }
            }
        } else {
            // 先保存鸣潮输入框值
            saveMingInputValues();

            document.body.classList.remove('ming-active');
            mingHiddenIds.forEach(function (id) {
                var node = document.getElementById(id);
                if (node) node.classList.remove('ming-hidden');
            });
            if (switchLabelOld) switchLabelOld.textContent = '旧版';
            if (switchLabelNew) switchLabelNew.textContent = '新版';
            // 确保关闭飞讯模式（清除 feixun-mode 等残留 class，防止样式叠加）
            toggleFeixunMode(false);
            // 战双默认恢复新版 UI
            if (uiStyleSwitch && !uiStyleSwitch.checked) {
                uiStyleSwitch.checked = true;
                uiStyleSwitch.dispatchEvent(new Event('change'));
            }
            // 恢复"指挥官"标签
            renameCommanderLabels('指挥官');
            // 恢复战双预览状态
            restoreZhanPreviewState();

            // 恢复战双输入框值
            restoreZhanInputValues();
            // 恢复战双模式下对话框的可见状态
            if (commanderDialog && typeof state !== 'undefined') {
                var zhanScene = state.scenes[state.currentSceneIndex];
                if (zhanScene && zhanScene.commanderDialogVisible) {
                    commanderDialog.style.display = 'flex';
                    if (commanderText) commanderText.focus();
                }
            }
        }
    }

    // 战双预览状态缓存（背景、角色立绘等）
    var _zhanPreviewCache = null;

    /** 保存战双预览状态 */
    function saveZhanPreviewState() {
        var previewBg = document.getElementById('preview-background');
        var charLayer = document.getElementById('character-layer');
        var videoEl = document.getElementById('background-video');
        var imgAssoc = document.getElementById('image-association-old');
        var imgAssocImg = imgAssoc ? imgAssoc.querySelector('img') : null;
        _zhanPreviewCache = {
            bgImage: previewBg ? previewBg.style.backgroundImage : '',
            bgSize: previewBg ? previewBg.style.backgroundSize : '',
            characters: charLayer ? charLayer.innerHTML : '',
            videoSrc: videoEl ? videoEl.src : '',
            videoDisplay: videoEl ? videoEl.style.display : '',
            imgAssocSrc: imgAssocImg ? imgAssocImg.src : ''
        };
    }

    /** 清空预览区（鸣潮模式下不显示战双背景/角色） */
    function clearPreviewForMing() {
        var previewBg = document.getElementById('preview-background');
        var charLayer = document.getElementById('character-layer');
        var videoEl = document.getElementById('background-video');
        if (previewBg) {
            previewBg.style.backgroundImage = '';
            previewBg.style.backgroundSize = '';
        }
        if (charLayer) charLayer.innerHTML = '';
        if (videoEl) {
            videoEl.src = '';
            videoEl.style.display = 'none';
        }
        // 恢复 image-association-old 为默认小图标（防止鸣潮背景残留到战双模式）
        var imgAssoc = document.getElementById('image-association-old');
        if (imgAssoc) {
            var img = imgAssoc.querySelector('img');
            if (img) {
                img.src = 'backgrounds/UI.png';
            }
        }
    }

    /** 恢复战双预览状态 */
    function restoreZhanPreviewState() {
        if (!_zhanPreviewCache) return;
        var previewBg = document.getElementById('preview-background');
        var charLayer = document.getElementById('character-layer');
        var videoEl = document.getElementById('background-video');
        var imgAssoc = document.getElementById('image-association-old');
        if (previewBg) {
            previewBg.style.backgroundImage = _zhanPreviewCache.bgImage;
            previewBg.style.backgroundSize = _zhanPreviewCache.bgSize;
        }
        if (charLayer) charLayer.innerHTML = _zhanPreviewCache.characters;
        if (videoEl) {
            videoEl.src = _zhanPreviewCache.videoSrc;
            videoEl.style.display = _zhanPreviewCache.videoDisplay;
        }
        if (imgAssoc) {
            var img = imgAssoc.querySelector('img');
            if (img) {
                img.src = _zhanPreviewCache.imgAssocSrc || 'backgrounds/UI.png';
            }
        }
    }

    /** 初始化飞讯 UI 开关（监听 ui-style-switch） */
    function initFeixunUISwitch() {
        var uiStyleSwitch = document.getElementById('ui-style-switch');
        if (!uiStyleSwitch) return;

        uiStyleSwitch.addEventListener('change', function () {
            var isChecked = this.checked;
            // 仅在鸣潮模式下，开启开关 = 飞讯模式
            if (ModeRouter.currentMode === 'ming' && isChecked) {
                toggleFeixunMode(true);
            } else {
                toggleFeixunMode(false);
            }
        });
    }

    /* ========================================================
     * 第六部分：模块入口与对外接口
     * ======================================================== */
    function init() {
        // 标记根容器，供 CSS 作用域隔离（加到 body，使所有后代元素匹配 .ming-mode-root 选择器）
        document.body.classList.add('ming-mode-root');

        // 加载并注入 DOM 片段，然后初始化交互
        loadAndInject(function () {
            ModeRouter.initInteractions();
            initFeixunUISwitch();

            // 从共享配置恢复上次的模式
            var savedConfig = SharedConfig.readMing();
            if (savedConfig.lastMode === 'ming') {
                ModeRouter.switchTo('ming');
            }

            // 若当前已在鸣潮模式且开关打开，初始化飞讯
            if (ModeRouter.currentMode === 'ming') {
                var uiStyleSwitch = document.getElementById('ui-style-switch');
                if (uiStyleSwitch && uiStyleSwitch.checked) {
                    toggleFeixunMode(true);
                }
            }
        });

        // 监听跨标签页配置变更，同步联系人数据
        SharedConfig.onExternalChange(function (e) {
            if (e.newValue) {
                try {
                    var data = JSON.parse(e.newValue);
                    if (data.ming && data.ming.contacts && FeixunSystem._initialized) {
                        FeixunSystem.setContactsData(data.ming.contacts);
                    }
                } catch (err) { /* 忽略解析错误 */ }
            }
        });
    }

    // 对外暴露的最小接口（轻量通信）
    var MingMode = {
        version: '1.0.0',
        SharedConfig: SharedConfig,
        FeixunSystem: FeixunSystem,
        ModeRouter: ModeRouter,
        /** 触发主路由切换回战双版 */
        switchToZhanMode: function () { ModeRouter.switchToZhan(); },
        /** 触发切换到鸣潮版 */
        switchToMingMode: function () { ModeRouter.switchToMing(); },
        /** 获取当前模式 */
        getCurrentMode: function () { return ModeRouter.currentMode; },
        /** 初始化（自动在 DOMContentLoaded 后调用） */
        init: init
    };

    // 注册到全局（最小暴露）
    global.MingMode = MingMode;
    // 兼容旧代码的全局引用
    global.FeixunSystem = FeixunSystem;
    global.MingBackgroundSystem = MingBackgroundSystem;
    global.toggleFeixunMode = toggleFeixunMode;
    // switchToZhanMode 全局函数（供主路由 / 战双版调用）
    global.switchToZhanMode = MingMode.switchToZhanMode;
    // switchToMode 全局函数（向后兼容战双版遗留调用）
    global.switchToMode = function (mode) { ModeRouter.switchTo(mode); };
    // currentMode 初始同步
    global.currentMode = ModeRouter.currentMode;

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(typeof window !== 'undefined' ? window : this);
