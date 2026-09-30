/* ============================================================
   tutorial.js — 网页内新手教程（图文手册弹窗）
   · 入口：顶部声明栏「❓ 使用帮助」按钮（仅手动打开）
   · 双层内容：快速上手（带「指给我看」界面高亮） + 完整手册（8 章）
   · 纯原生 JS，无依赖；内容依据《二创网站新手教程.docx》
   ============================================================ */
(function () {
    'use strict';

    // ==================== 快速上手步骤 ====================
    // target 为空表示纯说明步骤；有值时显示「指给我看」按钮
    var QUICK_STEPS = [
        {
            title: '认识界面：三栏布局',
            target: '#app',
            body: '左侧面板：背景、角色立绘、动画、导出/导航/撤回按钮；中间预览区：实时显示画面；右侧面板：角色、更多设置（分辨率/质量/文本样式等）。顶部左右有 ◀ / ▶ 折叠按钮。首屏欢迎页左右滑动可切换「战双 / 鸣潮」模式，向下滚动进入主应用。'
        },
        {
            title: '第 1 步：选一张背景',
            target: '#bg-select-subsection',
            body: '在左侧「背景设置」的图片网格里点击任意一张即应用到当前画面；点「选择文件」可上传本地图片或视频做背景。网格首个「批量应用」方块可把当前背景套用到多个场景。'
        },
        {
            title: '第 2 步：摆角色立绘',
            target: '#left-char-select-subsection',
            body: '在「角色立绘」网格点击角色图片即可加入当前画面（可多选叠加，最多三人自动排位）；「选择文件」可上传本地立绘。右侧面板的「角色设置」功能相同。'
        },
        {
            title: '第 3 步：写角色名与台词',
            target: '.dialog-area',
            body: '中间预览区下方：上面小框改「角色名称」，下面大框输入台词，预览实时刷新。文字颜色/大小/对齐在右侧「更多设置 → 文本设置」调整。'
        },
        {
            title: '（可选）指挥官台词',
            target: '#commander-dialog-btn-left',
            body: '点左侧「指挥官对话」按钮，预览区会出现独立文本框，输入指挥官台词；再点一次则隐藏并清空。'
        },
        {
            title: '（可选）打字机动画',
            target: '#animation-toggle-left',
            body: '开启后导出 GIF 时台词逐字出现；「动画速度」10–200ms，数值越小越快。不开动画时导出为静态 PNG。'
        },
        {
            title: '第 4 步：提交画面（下一句 / 下一幕）',
            target: '#next-scene-left',
            body: '<b>下一句</b>：暂存当前画面，保留背景与角色，继续写下一句；<b>下一幕</b>：暂存当前画面并新建全新场景（背景、角色重置）。每点一次都会进入「暂存」，供导出使用。'
        },
        {
            title: '查看与修改暂存画面',
            target: '#view-saved-left',
            body: '点「查看暂存」打开历史窗口：可加载到编辑区修改、重命名、复制、删除。「撤回」撤销上一步，「全部撤回」回到最初。'
        },
        {
            title: '第 5 步：导出成品',
            target: '#export-btn-left',
            body: '「导出画面」导出当前 PNG（Ctrl+E）；「全部导出 (N)」弹出预览勾选后导出全部暂存画面（开打字机动画→GIF，否则→PNG；ZIP 打包在更多设置里开启）；另有导出GIF / 快速GIF / MP4 按钮。'
        },
        {
            title: '更多设置',
            target: '#more-settings-section',
            body: '右侧「更多设置」可调：UI 风格、全部导出格式、ZIP 打包、分辨率（推荐 1920）、PNG/GIF/MP4 质量、文本颜色/大小/对齐、接下来的文本格式、指挥官文本样式、工程 JSON 导出/导入。'
        },
        {
            title: '进阶：剧本模式（实验）一键成片',
            target: '#script-open-btn',
            body: '左侧「剧本模式（实验）」按钮：粘贴一段剧本文本，网站自动演完所有画面（选背景、摆立绘、写台词、翻页），结束后弹出「分镜编辑」窗口可批量修改并一键导出。详见手册第 6 章。'
        },
        {
            title: '切换鸣潮飞讯模式',
            target: '#ming-mode-nav',
            body: '欢迎页左右滑动，或用顶部「战双模式 / 鸣潮模式」导航按钮切换。飞讯模式以聊天界面呈现剧情：联系人列表、消息气泡、漂泊者对话等。详见手册第 3 章。'
        }
    ];

    // ==================== 完整手册章节 ====================
    var CHAPTERS = [
        {
            id: 'ch0', title: '0 · 写在前面',
            html: '<h2>0. 写在前面</h2>' +
                '<p>本网站用于在浏览器里制作游戏剧情二创画面：选背景、摆角色立绘、写对话、加动画，最后导出成图片 / GIF / 视频。</p>' +
                '<p>手册面向第一次使用的新手，按「认识界面 → 逐块功能 → 导出 → 自动化」的顺序讲解。</p>' +
                '<ul><li>声明：本网站为非官方二创网站，作品请注明是非官方二创内容，请勿制作令人不适的剧情。</li>' +
                '<li>阅读建议：先照「快速上手」走一遍核心流程，遇到不会用的控件回手册对应章节。</li></ul>'
        },
        {
            id: 'ch1', title: '1 · 界面总览',
            html: '<h2>1. 界面总览</h2>' +
                '<p>网站首屏是欢迎页，左右滑动可在「战双模式」与「鸣潮模式」间切换；向下滚动进入主应用。</p>' +
                '<h3>1.1 三栏布局</h3>' +
                '<ul><li>左侧面板：背景、功能搜索、角色立绘、动画设置、剧本模式（实验）、导出日志、指挥官设置、导出/导航/撤回按钮组。</li>' +
                '<li>中间预览区：实时显示当前画面（背景 + 角色 + 对话）。</li>' +
                '<li>右侧面板：角色设置、动画设置、更多设置、字幕/视频设置、导出/导航/撤回按钮组。</li>' +
                '<li>顶部：声明栏（旁有「❓ 使用帮助」按钮，即本手册）；左右两侧有折叠按钮（◀ / ▶）可收起面板。</li></ul>' +
                '<h3>1.2 全局快捷键</h3>' +
                '<table><tr><th>快捷键</th><th>作用</th></tr>' +
                '<tr><td>Ctrl + S</td><td>自动保存</td></tr>' +
                '<tr><td>Ctrl + Z</td><td>撤回上一步</td></tr>' +
                '<tr><td>Ctrl + E</td><td>导出当前画面</td></tr>' +
                '<tr><td>Ctrl + Enter</td><td>下一句（提交当前对话）</td></tr>' +
                '<tr><td>← / →</td><td>切换上一个 / 下一个场景</td></tr></table>'
        },
        {
            id: 'ch2', title: '2 · 战双模式功能详解',
            html: '<h2>2. 战双模式功能详解</h2>' +
                '<h3>2.1 左侧面板</h3>' +
                '<p><b>背景设置</b></p>' +
                '<ul><li>选择背景：图片网格点击任一张即应用到当前画面。</li>' +
                '<li>导入背景：「选择文件」上传本地图片或视频。</li>' +
                '<li>网格首个「批量应用」方块：把当前背景批量套用到多个场景。</li></ul>' +
                '<p><b>功能搜索</b>：输入关键词定位界面上的功能按钮。</p>' +
                '<p><b>角色立绘</b>：点击角色图片加入当前画面（可多选）；「选择文件」上传本地角色。</p>' +
                '<p><b>动画设置</b>：打字机动画开关（开启后导出 GIF 文字逐字出现）；动画速度 10–200ms。</p>' +
                '<p><b>剧本模式（实验）</b>：打开剧本自动化窗口（详见第 6 章）。</p>' +
                '<p><b>导出日志</b>：下载操作日志，便于排查问题。</p>' +
                '<p><b>指挥官设置</b>：「指挥官对话」按钮显示 / 隐藏指挥官对话框。</p>' +
                '<p><b>导出按钮组</b></p>' +
                '<table><tr><th>按钮</th><th>作用</th></tr>' +
                '<tr><td>导出画面</td><td>当前画面导出为 PNG</td></tr>' +
                '<tr><td>全部导出 (N)</td><td>弹出预览勾选后一并导出，N 为暂存场景数</td></tr>' +
                '<tr><td>导出GIF动画</td><td>场景序列导出为 GIF</td></tr>' +
                '<tr><td>快速导出GIF</td><td>跳过部分预处理的 GIF 导出</td></tr>' +
                '<tr><td>导出MP4视频</td><td>场景序列导出为 MP4</td></tr></table>' +
                '<p><b>导航按钮组</b>：「下一句」提交当前对话并保留背景/角色；「下一幕」提交当前画面并新建全新场景（背景、角色重置）。</p>' +
                '<p><b>撤回按钮组</b></p>' +
                '<table><tr><th>按钮</th><th>作用</th></tr>' +
                '<tr><td>撤回</td><td>撤销上一步操作</td></tr>' +
                '<tr><td>全部撤回</td><td>清空历史，回到最初</td></tr>' +
                '<tr><td>查看暂存</td><td>打开已暂存场景历史窗口</td></tr>' +
                '<tr><td>保存修改</td><td>载入暂存并修改后保存（仅在载入暂存时显示）</td></tr></table>' +
                '<h3>2.2 右侧面板</h3>' +
                '<p><b>角色设置 / 动画设置</b>：与左侧一致（左右镜像）。</p>' +
                '<p><b>更多设置（点击展开）</b></p>' +
                '<table><tr><th>设置项</th><th>说明</th></tr>' +
                '<tr><td>UI 风格切换</td><td>「旧版 / 新版」界面风格切换</td></tr>' +
                '<tr><td>全部导出格式</td><td>GIF 分片 或 MP4 视频(合)</td></tr>' +
                '<tr><td>压缩打包导出</td><td>ZIP 打包；每包场景数 5–50</td></tr>' +
                '<tr><td>分辨率</td><td>导出宽 720–3840px（推荐 1920）</td></tr>' +
                '<tr><td>PNG 质量</td><td>0.5–1.0（推荐 0.9）</td></tr>' +
                '<tr><td>GIF 质量</td><td>1(最好)–10(最差)（推荐 2）</td></tr>' +
                '<tr><td>MP4 质量</td><td>1(低)–10(高)（推荐 5）</td></tr>' +
                '<tr><td>文本颜色 / 大小 / 对齐</td><td>对话文字样式</td></tr>' +
                '<tr><td>接下来的文本格式</td><td>与全局不同时，之后输入的文字按此输出</td></tr>' +
                '<tr><td>指挥官文本样式</td><td>指挥官对话文字的颜色/大小/对齐</td></tr>' +
                '<tr><td>工程数据 (JSON)</td><td>导出 / 导入当前工程（场景、暂存、列表与设置）</td></tr></table>' +
                '<p><b>字幕段批量编辑 / 视频显示设置</b>：仅当背景为视频时出现。</p>' +
                '<p><b>导出 / 导航 / 撤回按钮组</b>：与左侧一致（镜像）。</p>' +
                '<h3>2.3 中间预览区</h3>' +
                '<ul><li>背景层：显示当前背景（视频背景显示播放控件与进度条）。</li>' +
                '<li>角色层：显示已选角色立绘（1 人居中、2 人分立、3 人自动排位）。</li>' +
                '<li>对话区：上方改「角色名称」，下方输入台词。</li>' +
                '<li>指挥官对话框：点开「指挥官对话」后出现的独立文本框。</li>' +
                '<li>视频进度条：背景为视频时可拖动进度、播放/暂停。</li></ul>'
        },
        {
            id: 'ch3', title: '3 · 鸣潮飞讯模式',
            html: '<h2>3. 鸣潮飞讯模式功能详解</h2>' +
                '<p>在欢迎页滑到鸣潮，或用模式导航切到「鸣潮模式」。飞讯模式用聊天界面呈现剧情。</p>' +
                '<h3>3.1 模式导航与切换</h3>' +
                '<ul><li>顶部「战双模式 / 鸣潮模式」导航按钮可在两模式间切换。</li></ul>' +
                '<h3>3.2 飞讯聊天界面</h3>' +
                '<ul><li>联系人列表：左侧显示联系人；「添加联系人」可新增。</li>' +
                '<li>聊天区：右侧显示消息气泡；标题/标签可直接点击编辑。</li>' +
                '<li>添加对话：在聊天区新增一条消息。</li>' +
                '<li>漂泊者对话：开启漂泊者（对应指挥官）对话输入框。</li></ul>' +
                '<h3>3.3 联系人编辑</h3>' +
                '<ul><li>点联系人打开编辑弹窗：上传头像、改名称、保存或删除。</li></ul>' +
                '<h3>3.4 鸣潮背景与导出弹窗</h3>' +
                '<ul><li>鸣潮模式有独立的「背景设置」列表。</li>' +
                '<li>导出时弹出「导出预览」弹窗，勾选要导出的场景后确认。</li>' +
                '<li>「暂存场景」弹窗查看历史；「GIF 导出进度」弹窗显示进度。</li></ul>'
        },
        {
            id: 'ch4', title: '4 · 导出与工程管理',
            html: '<h2>4. 导出与工程管理</h2>' +
                '<h3>4.1 导出方式一览</h3>' +
                '<table><tr><th>目标</th><th>操作</th><th>产出</th></tr>' +
                '<tr><td>单帧画面</td><td>「导出画面」或 Ctrl+E</td><td>PNG 一张</td></tr>' +
                '<tr><td>全部场景（GIF）</td><td>「全部导出」并开打字机动画</td><td>GIF 序列/分片</td></tr>' +
                '<tr><td>全部场景（MP4）</td><td>「导出MP4视频」等 MP4 入口</td><td>MP4</td></tr>' +
                '<tr><td>GIF 动画</td><td>「导出GIF动画」/「快速导出GIF」</td><td>GIF</td></tr>' +
                '<tr><td>打包下载</td><td>更多设置启用 ZIP 打包</td><td>ZIP（按每包场景数分卷）</td></tr></table>' +
                '<h3>4.2 分辨率与质量</h3>' +
                '<ul><li>在「更多设置」里调：分辨率（推荐 1920）、PNG/GIF/MP4 质量。</li>' +
                '<li>质量越高文件越大；GIF 推荐质量 2，MP4 推荐 5。</li></ul>' +
                '<h3>4.3 工程数据（JSON）</h3>' +
                '<ul><li>导出 JSON：保存当前场景、暂存、角色/背景列表与格式设置，便于备份与迁移。</li>' +
                '<li>导入 JSON：用备份文件覆盖当前工程数据（会替换现有内容，操作前注意备份）。</li></ul>' +
                '<h3>4.4 暂存与查看</h3>' +
                '<ul><li>每点一次「下一句 / 下一幕」，当前画面会被暂存。</li>' +
                '<li>「查看暂存」可回看所有已暂存画面，便于检查与修改。</li></ul>'
        },
        {
            id: 'ch5', title: '5 · 快捷键与高级设置',
            html: '<h2>5. 快捷键与高级设置</h2>' +
                '<p>快捷键见第 1.2 节。以下为进阶用法。</p>' +
                '<h3>5.1 接下来的文本格式</h3>' +
                '<ul><li>在「更多设置 → 接下来的文本格式」里设置颜色/大小：之后新输入的文字按此格式输出，不影响已写好的文字。</li></ul>' +
                '<h3>5.2 视频字幕段批量编辑</h3>' +
                '<ul><li>背景为视频时，展开「字幕段批量编辑」可新增/编辑字幕段（开始/结束时间、角色、台词、指挥官文本）。</li></ul>' +
                '<h3>5.3 批量应用背景</h3>' +
                '<ul><li>在背景网格点「批量应用」，按提示把当前背景套用到指定编号或范围的场景。</li></ul>'
        },
        {
            id: 'ch6', title: '6 · 剧本自动化模式（实验）',
            html: '<h2>6. 剧本自动化模式（实验）</h2>' +
                '<div class="help-note">只需写一段剧本文本，网站会自动演完所有画面（设置台词 → 应用背景/立绘 → 翻页），最后弹出可批量修改的「分镜编辑」窗口。当前支持战双模式。</div>' +
                '<h3>6.1 入口</h3>' +
                '<ul><li>左侧面板「导出日志」下方点「🎬 剧本模式（实验）」按钮，打开剧本窗口：大文本框粘贴剧本，「运行」自动执行。</li></ul>' +
                '<h3>6.2 剧本语法</h3>' +
                '<ul><li>画面（场景）以「下一幕」指令分隔：两个“下一幕”之间的所有内容构成一个画面。</li>' +
                '<li>每个画面内可写多行「角色名: 内容」（含「指挥官: 内容」写入指挥官对话框）；一行里也可写多段，如 <code>阿尔法: 1 指挥官: 2</code>。</li>' +
                '<li>指令一律用引号包裹，例如 <code>"下一幕"</code> <code>"使用背景1"</code>。英文直引号 " 与中文引号 “” 都支持。</li>' +
                '<li>冒号前是角色名，冒号后是台词；台词里引号内的内容视为指令，其余是文案。</li></ul>' +
                '<p><b>示例剧本：</b></p>' +
                '<div class="help-codeblock">阿尔法: 你好，指挥官。"使用背景1""使用角色立绘2"\n指挥官: 收到，准备出发。\n丽芙: 这一仗交给我。"延迟500"\n"下一幕"\n阿尔法: 战斗开始！"使用背景3"\n"导出"</div>' +
                '<h3>6.3 指令集</h3>' +
                '<table><tr><th>指令</th><th>作用</th></tr>' +
                '<tr><td>下一幕</td><td>提交当前画面，新建场景（重置背景/角色）</td></tr>' +
                '<tr><td>下一句</td><td>画面内的分隔标记（不新建画面；同框全显下多句同画面显示）</td></tr>' +
                '<tr><td>使用背景N</td><td>应用第 N 个背景（按列表顺序，从 1 开始）</td></tr>' +
                '<tr><td>使用角色立绘N</td><td>应用第 N 个角色立绘（替换当前画面角色，从 1 开始）</td></tr>' +
                '<tr><td>延迟N</td><td>本步之后暂停 N 毫秒（默认 300），便于肉眼观察</td></tr>' +
                '<tr><td>打开/关闭打字机动画</td><td>切换打字机动画（影响导出默认格式）</td></tr>' +
                '<tr><td>导出</td><td>预设导出格式：默认 PNG；若已开打字机动画则 GIF</td></tr>' +
                '<tr><td>导出PNG / 导出GIF / 导出MP4</td><td>显式指定导出格式</td></tr>' +
                '<tr><td>指挥官（作为角色名）</td><td>该段文案写入指挥官对话框并开启指挥官对话</td></tr></table>' +
                '<h3>6.4 同框全显</h3>' +
                '<ul><li>一个画面内的多句台词在对话区一次性全部显示，导出亦然。</li>' +
                '<li>顶部角色名称框显示该画面第一个开口的角色；画面内只有一个角色说话时，正文直接是台词（不加前缀）；两个及以上说话人时，正文逐行加「角色名：台词」前缀区分。</li>' +
                '<li>指挥官台词单独汇入指挥官对话框。</li></ul>' +
                '<h3>6.5 运行流程</h3>' +
                '<ul><li>点「运行」后全自动逐行执行，运行条提供「停止」按钮和三档速度：观察（每步约 300ms）/ 快速（约 50ms）/ 瞬时（不停顿），默认观察档。</li>' +
                '<li>剧本从当前页面状态接着跑：不动已有场景与暂存，新画面依次追加到暂存末尾。</li>' +
                '<li>剧本结束若有未提交画面，会自动提交。</li></ul>' +
                '<h3>6.6 分镜编辑弹窗与导出</h3>' +
                '<ul><li>运行结束自动弹出「分镜编辑」窗口：左侧每帧缩略图，右侧编辑该帧的 文案 / 背景 / 角色立绘 / 指挥官文本。</li>' +
                '<li>支持上一张/下一张切换、保存修改、删除帧。</li>' +
                '<li>剧本含「导出」指令时，该指令作为预设格式；确认修改满意后点「全部导出」按该格式导出全部暂存画面（未写导出指令时按网站当前逻辑：开打字机动画→GIF，否则→PNG）。</li></ul>' +
                '<h3>6.7 常见问题</h3>' +
                '<ul><li>背景/立绘编号越界：记警告并跳过该指令，不影响其余画面。</li>' +
                '<li>未知指令：记日志忽略。</li>' +
                '<li>行内无冒号也无引号指令：视为空行/注释忽略并记日志。</li></ul>'
        },
        {
            id: 'ch7', title: '7 · 常见问题与排错',
            html: '<h2>7. 常见问题与排错</h2>' +
                '<table><tr><th>现象</th><th>排查</th></tr>' +
                '<tr><td>背景/立绘不显示</td><td>检查是否已「选择」对应项；视频背景确认文件可播放</td></tr>' +
                '<tr><td>打字机动画不动</td><td>确认已开启打字机动画开关（影响导出 GIF），并等待文字逐字出现</td></tr>' +
                '<tr><td>指挥官对话框不出现</td><td>点「指挥官对话」按钮开启；仅战双模式原生支持</td></tr>' +
                '<tr><td>剧本运行无反应</td><td>检查剧本格式：角色名后有冒号、指令用引号包裹；查看运行日志区的警告</td></tr></table>' +
                '<p style="color:#8888a5;font-size:12px">声明：本网站为非官方二创工具，请合理使用，注明非官方二创。</p>'
        }
    ];

    // ==================== 弹窗骨架 ====================
    function buildModal() {
        var modal = document.getElementById('help-modal');
        if (!modal) return;

        var box = document.createElement('div');
        box.className = 'help-box';
        box.innerHTML =
            '<div class="help-header">' +
            '  <h3>📖 使用帮助 · 新手教程</h3>' +
            '  <button class="help-close" title="关闭">×</button>' +
            '</div>' +
            '<div class="help-body">' +
            '  <div class="help-nav">' +
            '    <div class="help-nav-title">快速上手</div>' +
            '    <button class="help-nav-btn active" data-view="quick">快速上手（10 分钟）<span class="nav-tag">推荐</span></button>' +
            '    <div class="help-nav-title" style="margin-top:14px">完整手册</div>' +
            '  </div>' +
            '  <div class="help-content"></div>' +
            '</div>';

        modal.appendChild(box);

        var pill = document.createElement('button');
        pill.className = 'help-restore-pill';
        pill.textContent = '📖 教程已收起 · 点击返回';
        modal.appendChild(pill);
        pill.addEventListener('click', function () { restoreModal(modal); });

        var nav = box.querySelector('.help-nav');
        CHAPTERS.forEach(function (ch) {
            var b = document.createElement('button');
            b.className = 'help-nav-btn';
            b.dataset.view = ch.id;
            b.textContent = ch.title;
            nav.appendChild(b);
        });

        var content = box.querySelector('.help-content');

        nav.addEventListener('click', function (e) {
            var btn = e.target.closest('.help-nav-btn');
            if (!btn) return;
            nav.querySelectorAll('.help-nav-btn').forEach(function (x) { x.classList.remove('active'); });
            btn.classList.add('active');
            var view = btn.dataset.view;
            if (view === 'quick') renderQuick(modal, content);
            else {
                var ch = CHAPTERS.find(function (c) { return c.id === view; });
                if (ch) content.innerHTML = ch.html;
            }
            content.scrollTop = 0;
        });

        box.querySelector('.help-close').addEventListener('click', function () {
            restoreModal(modal);
            modal.style.display = 'none';
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) { restoreModal(modal); modal.style.display = 'none'; }
        });

        renderQuick(modal, content);
    }

    function renderQuick(modal, content) {
        var html = '<h2>快速上手 · 10 分钟做出第一张剧情画面</h2>' +
            '<p>按下面步骤走一遍，就能做出可导出的剧情画面。看不懂界面位置时，点每一步右侧的「📍 指给我看」，网页会自动高亮对应区域。</p>';
        QUICK_STEPS.forEach(function (s, i) {
            html += '<div class="help-step">' +
                '<div class="help-step-head">' +
                '<span class="help-step-title">' + (s.target ? '<span class="help-step-no">' + (i + 1) + '</span>' : '<span class="help-step-no">✦</span>') + s.title + '</span>' +
                (s.target ? '<button class="showme-btn" data-target="' + s.target + '">📍 指给我看</button>' : '') +
                '</div>' +
                '<div class="help-step-body">' + s.body + '</div>' +
                '</div>';
        });
        html += '<div class="help-note">小提示：左侧面板有「搜索功能」框，输入关键词可定位任意功能按钮。</div>';
        content.innerHTML = html;

        content.querySelectorAll('.showme-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                showMe(modal, btn.dataset.target);
            });
        });
    }

    // ==================== 指给我看：聚光灯高亮（spotlight） ====================
    // 思路：弹窗最小化时把 modal 自身黑底变透明；放一个 fixed 定位的「遮罩 + 挖洞」
    // 元素（用 box-shadow 0 0 0 9999px 黑当洞外的黑），洞里透出目标元素正常亮度；
    // 目标元素加 z-index 与描边，跟随滚动 / 缩放 实时更新位置，2.6 秒后自动关闭。
    var spotTimer = null;
    var spotEl = null;
    var spotTarget = null;
    var spotScrollHandler = null;
    var spotResizeHandler = null;

    function clearSpotlight() {
        if (spotTimer) { clearTimeout(spotTimer); spotTimer = null; }
        if (spotScrollHandler) { window.removeEventListener('scroll', spotScrollHandler, true); spotScrollHandler = null; }
        if (spotResizeHandler) { window.removeEventListener('resize', spotResizeHandler); spotResizeHandler = null; }
        if (spotEl && spotEl.parentNode) spotEl.parentNode.removeChild(spotEl);
        if (spotTarget) {
            try { spotTarget.classList.remove('tutorial-spotlight-target'); } catch (e) {}
            spotTarget = null;
        }
        spotEl = null;
    }

    function restoreModal(modal) {
        modal.classList.remove('help-minimized');
        clearSpotlight();
    }

    function positionSpotlight() {
        if (!spotEl || !spotTarget) return;
        var rect = spotTarget.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) { clearSpotlight(); return; }
        spotEl.style.left = rect.left + 'px';
        spotEl.style.top = rect.top + 'px';
        spotEl.style.width = rect.width + 'px';
        spotEl.style.height = rect.height + 'px';
    }

    function setupSpotlight(modal, target) {
        clearSpotlight();
        spotTarget = target;
        target.classList.add('tutorial-spotlight-target');

        spotEl = document.createElement('div');
        spotEl.className = 'tutorial-spotlight';
        document.body.appendChild(spotEl);
        positionSpotlight();

        spotScrollHandler = positionSpotlight;
        spotResizeHandler = positionSpotlight;
        // capture 阶段才能捕获面板内部 / #full-page-scroll 内的滚动事件
        window.addEventListener('scroll', spotScrollHandler, true);
        window.addEventListener('resize', spotResizeHandler);

        spotTimer = setTimeout(function () {
            clearSpotlight();
            modal.classList.remove('help-minimized');
        }, 2600);
    }

    function showMe(modal, selector) {
        var el = document.querySelector(selector);
        if (!el) {
            showToast('未找到对应界面元素（可能在当前模式下不可见）。', 'warn');
            return;
        }

        // 面板被折叠时先展开，保证目标可见
        try {
            if (window.state && typeof window.togglePanel === 'function') {
                if (state.leftPanelFolded && el.closest('#left-panel')) window.togglePanel('left');
                if (state.rightPanelFolded && el.closest('#right-panel')) window.togglePanel('right');
            }
        } catch (e) { /* 展开失败不影响高亮 */ }

        restoreModal(modal);
        modal.classList.add('help-minimized');

        // 等面板展开动画结束后再滚动定位；再 2600ms 隐藏
        setTimeout(function () {
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e) {
                el.scrollIntoView();
            }
            setupSpotlight(modal, el);
        }, 260);
    }

    // ==================== 入口按钮 ====================
    function init() {
        buildModal();

        var openBtn = document.getElementById('help-open-btn');
        var modal = document.getElementById('help-modal');
        if (openBtn && modal) {
            openBtn.addEventListener('click', function () {
                modal.style.display = 'flex';
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
