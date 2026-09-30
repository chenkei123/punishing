# -*- coding: utf-8 -*-
"""生成《二创制作网站 · 新手使用说明书》docx（零依赖：仅用标准库 zipfile 拼 OOXML）。
输出：G:\二创网站新手教程.docx
"""
import os, zipfile, datetime

OUT = r"G:\二创网站新手教程.docx"

# ---------- XML 转义 ----------
def esc(t):
    return (str(t).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;').replace("'", '&apos;'))

# ---------- 内容块收集 ----------
blocks = []  # 每个元素 (kind, *args)
def h0(t): blocks.append(('h0', t))
def h1(t): blocks.append(('h1', t))
def h2(t): blocks.append(('h2', t))
def h3(t): blocks.append(('h3', t))
def p(t, bold=False, italic=False, size=None, color=None):
    blocks.append(('p', t, bold, italic, size, color))
def bullet(t): blocks.append(('bullet', t))
def note(t): blocks.append(('note', t))
def img(t): blocks.append(('img', t))
def code(t): blocks.append(('code', t))
def table(headers, rows, weights=None):
    blocks.append(('table', headers, rows, weights))

# ============ 内容 ============
h0('二创制作网站 · 新手使用说明书')
p('战双帕弥什 / 鸣潮 剧情二创制作网页', italic=True, size=12)
p('B站比翼苍穹制作 · 非官方二创工具', italic=True, size=10)

note('本说明书覆盖：本地运行、战双模式全部功能、鸣潮飞讯模式、导出与工程管理、快捷键与高级设置，以及「剧本自动化」模式的使用方法。')

h1('0. 写在前面')
p('本网站用于在浏览器里制作游戏剧情二创画面：选背景、摆角色立绘、写对话、加动画，最后导出成图片 / GIF / 视频。')
p('本说明书面向第一次使用的新手，按「先跑起来 → 认识界面 → 逐块功能 → 导出 → 自动化」的顺序讲解。')
bullet('声明：本网站为非官方二创网站，作品请注明是非官方二创内容，请勿制作令人不适的剧情。')
bullet('阅读建议：先照第 1 章把网站跑起来，再对照第 2 章认识界面，遇到不会用的控件回看对应章节。')

h1('1. 本地运行与打开')
p('项目是纯前端网页（HTML/CSS/JS），推荐用本地服务器打开，避免导出时图片跨域报错。')
h2('1.1 三种打开方式（任选其一）')
table(['方式', '操作', '说明'],
      [['Python 本地服务（推荐）', '在项目根目录运行：python -m http.server 8000，浏览器打开 http://localhost:8000', '最稳妥，导出功能正常'],
       ['PowerShell 脚本', '在项目根目录运行 .\\serve.ps1（可加 -port 8080 指定端口）', '自动找 python 启动服务'],
       ['一键启动', '双击 run-local.bat', 'Windows 一键起服务']],
      weights=[2.0, 4.2, 2.0])
note('必须用本地服务器（http://localhost）打开，不要直接双击 index.html 用 file:// 打开，否则 html2canvas 导出会因跨域失败。')
img('本地服务器启动后浏览器界面')

h1('2. 界面总览')
p('网站首屏是欢迎页，左右滑动可在「战双模式」与「鸣潮模式」间切换；向下滚动进入主应用。')
img('欢迎页（战双 / 鸣潮 滑动切换）')
h2('2.1 三栏布局')
bullet('左侧面板：背景、功能搜索、角色立绘、动画设置、剧本模式（实验）、导出日志、指挥官设置、导出/导航/撤回按钮组。')
bullet('中间预览区：实时显示当前画面（背景 + 角色 + 对话）。')
bullet('右侧面板：角色设置、动画设置、更多设置、字幕/视频设置、导出/导航/撤回按钮组。')
bullet('顶部：声明栏（右侧有「❓ 使用帮助」按钮，可随时打开网页内新手教程手册）；左右两侧有折叠按钮（◀ / ▶）可收起面板。')
img('主应用三栏布局')
h2('2.2 全局快捷键')
table(['快捷键', '作用'],
      [['Ctrl + S', '自动保存'],
       ['Ctrl + Z', '撤回上一步'],
       ['Ctrl + E', '导出当前画面'],
       ['Ctrl + Enter', '下一句（提交当前对话）'],
       ['← / →', '切换上一个 / 下一个场景']],
      weights=[2.2, 4.6])

h1('3. 战双模式功能详解')
img('战双模式主界面')

h2('3.1 左侧面板')
h3('背景设置')
bullet('选择背景：左侧「背景设置 → 背景」图片网格，点击任一张即应用到当前画面。')
bullet('导入背景：点「选择文件」可上传本地图片或视频作为背景。')
bullet('（网格首个「批量应用」方块用于把当前背景批量套用到多个场景，按需使用。）')
h3('功能搜索')
bullet('在「搜索功能」框输入关键词，可定位界面上的对应功能按钮。')
h3('角色立绘')
bullet('选择角色：点击角色图片即把该立绘加入到当前画面（可多选，叠加显示）。')
bullet('导入角色：点「选择文件」上传本地角色图片。')
h3('动画设置')
bullet('打字机动画：开关。开启后对话文字逐字出现。')
bullet('动画速度：10–200ms，数值越小越快。')
h3('导出日志')
bullet('点「导出日志」可下载操作日志，便于排查问题。')
h3('指挥官设置')
bullet('点「指挥官对话」按钮：显示 / 隐藏指挥官对话框（用于指挥官台词）。')
h3('导出按钮组')
table(['按钮', '作用'],
      [['导出画面', '把当前画面导出为 PNG'],
       ['全部导出 (N)', '把全部已暂存场景一并导出，N 为场景数'],
       ['导出GIF动画', '把场景序列导出为 GIF'],
       ['快速导出GIF', '快速导出 GIF（跳过部分预处理）'],
       ['导出MP4视频', '把场景序列导出为 MP4']],
      weights=[2.2, 4.6])
h3('导航按钮组')
bullet('下一句：提交当前对话并保留背景/角色，准备下一句（对话索引 +1）。')
bullet('下一幕：提交当前画面并新建一个全新场景（背景、角色重置）。')
h3('撤回按钮组')
table(['按钮', '作用'],
      [['撤回', '撤销上一步操作'],
       ['全部撤回', '清空历史，回到最初'],
       ['查看暂存', '打开已暂存场景历史窗口'],
       ['保存修改', '在载入暂存并修改后，点此保存']],
      weights=[2.2, 4.6])

h2('3.2 右侧面板')
h3('角色设置')
bullet('与左侧角色立绘功能一致（左右两侧镜像），选择/导入角色。')
h3('动画设置')
bullet('与左侧动画设置一致：打字机开关 + 速度。')
h3('更多设置（点击展开）')
table(['设置项', '说明'],
      [['UI 风格切换', '在「旧版 / 新版」界面风格间切换'],
       ['全部导出格式', '选 GIF 分片 或 MP4 视频(合)'],
       ['压缩打包导出', '启用 ZIP 打包；每包场景数 5–50'],
       ['分辨率', '导出宽 720–3840px（推荐 1920）'],
       ['PNG 质量', '0.5–1.0（推荐 0.9）'],
       ['GIF 质量', '1(最好)–10(最差)（推荐 2）'],
       ['MP4 质量', '1(低)–10(高)（推荐 5）'],
       ['文本颜色 / 大小 / 对齐', '设置对话文字的颜色、字号、对齐'],
       ['接下来的文本格式', '设置“后续输入”的文字颜色/大小；与全局不同时，之后输入的文字按此输出'],
       ['指挥官文本颜色 / 大小 / 对齐', '单独设置指挥官对话文字样式'],
       ['工程数据 (JSON)', '导出 / 导入当前工程（场景、暂存、列表与设置）']],
      weights=[2.6, 4.2])
h3('字幕段批量编辑 / 视频显示设置')
bullet('仅当背景为视频时出现：可批量编辑字幕段、调整视频显示参数。')
h3('导出 / 导航 / 撤回按钮组')
bullet('与左侧对应按钮功能一致（带 -right 后缀的镜像）。')

h2('3.3 中间预览区')
img('预览区（背景/角色/对话/指挥官框）')
bullet('背景层：显示当前背景（视频背景显示播放控件与进度条）。')
bullet('角色层：显示已选角色立绘。')
bullet('图片关联层：固定的 UI 装饰图层（如 backgrounds/5.png 屏混效果）。')
bullet('对话区：上方可改「角色名称」，下方「对话输入」框输入台词。')
bullet('指挥官对话框：点开「指挥官对话」后出现的独立文本框，用于指挥官台词。')
bullet('视频进度条：背景为视频时，可拖动进度、播放/暂停。')

h1('4. 鸣潮飞讯模式功能详解')
p('在欢迎页滑到鸣潮，或在模式导航切到「鸣潮模式」。飞讯模式用“聊天界面”呈现剧情。')
img('鸣潮飞讯模式主界面')
h2('4.1 模式导航与切换')
bullet('顶部「战双模式 / 鸣潮模式」导航按钮可在两模式间切换。')
h2('4.2 飞讯聊天界面')
bullet('联系人列表：左侧显示联系人；点「添加联系人」可新增。')
bullet('聊天区：右侧显示与该联系人的消息气泡；标题/标签可直接点击编辑。')
bullet('添加对话：点「添加对话」在聊天区新增一条消息。')
bullet('漂泊者对话：点「漂泊者对话」开启漂泊者（对应指挥官）对话输入框。')
h2('4.3 联系人编辑')
bullet('点联系人可打开编辑弹窗：上传头像、改名称、保存或删除。')
h2('4.4 鸣潮背景与导出弹窗')
bullet('鸣潮模式有独立的「背景设置」列表，选择/导入背景。')
bullet('导出时弹出「导出预览」弹窗，勾选要导出的场景后确认。')
bullet('「暂存场景」弹窗可查看已暂存画面历史；「GIF 导出进度」弹窗显示导出进度。')

h1('5. 导出与工程管理')
h2('5.1 导出方式一览')
table(['目标', '操作', '产出'],
      [['单帧画面', '点「导出画面」或 Ctrl+E', 'PNG 一张'],
       ['全部场景（GIF）', '点「全部导出」并选 GIF 分片', 'GIF 序列/分片'],
       ['全部场景（MP4）', '点「全部导出」并选 MP4 视频(合)', 'MP4 一个'],
       ['GIF 动画', '点「导出GIF动画」/「快速导出GIF」', 'GIF'],
       ['MP4 视频', '点「导出MP4视频」', 'MP4'],
       ['打包下载', '更多设置启用 ZIP 打包', 'ZIP（按每包场景数分卷）']],
      weights=[1.8, 3.6, 1.8])
h2('5.2 分辨率与质量')
bullet('在「更多设置」里调：分辨率（推荐 1920）、PNG/GIF/MP4 质量。')
bullet('质量越高文件越大；GIF 推荐质量 2，MP4 推荐 5。')
h2('5.3 工程数据（JSON）')
bullet('导出 JSON：保存当前场景、暂存、角色/背景列表与格式设置，便于备份与迁移。')
bullet('导入 JSON：用备份文件覆盖当前工程数据（会替换现有内容，操作前注意备份）。')
h2('5.4 暂存与查看')
bullet('每点一次「下一句 / 下一幕」，当前画面会被暂存。')
bullet('点「查看暂存」可回看所有已暂存画面，便于检查与修改。')

h1('6. 快捷键与高级设置')
p('快捷键见第 2.2 节。以下为进阶用法。')
h2('6.1 接下来的文本格式')
bullet('在「更多设置 → 接下来的文本格式」里设置颜色/大小：之后新输入的文字按此格式输出，不影响已写好的文字。')
h2('6.2 视频字幕段批量编辑')
bullet('背景为视频时，展开「字幕段批量编辑」可新增/编辑字幕段（开始/结束时间、角色、台词、指挥官文本）。')
h2('6.3 批量应用背景')
bullet('在背景网格点「批量应用」，按提示把当前背景套用到指定编号或范围的场景。')

h1('7. 剧本自动化模式（实验）')
note('功能已实装（仅战双模式，实验特性）。开启后，你只需写一段“剧本文本”，网站会自动演完所有画面，最后弹出可批量修改的分镜窗口。')
h2('7.1 入口')
bullet('在左侧面板「导出日志」下方点「剧本模式（实验）」按钮，打开剧本输入框与运行按钮。')
img('剧本模式（实验）弹窗（文本框 + 运行）')
h2('7.2 剧本语法')
bullet('画面（场景）以「下一幕」指令分隔：两个“下一幕”之间的所有内容构成一个画面。')
bullet('每个画面内可写多行「角色名: 内容」（含「指挥官: 内容」开启指挥官对话）；一行里也可写多段，如 阿尔法: 1 指挥官: 2。')
bullet('指令一律用引号包裹，例如 "下一幕" "使用背景1" "导出"。中英文引号都支持。')
bullet('冒号前是角色名，冒号后是台词；台词里引号内的内容视为指令，其余是文案。')
bullet('同框全显：画面内多句台词一次性全部显示；顶部角色名称框显示首个开口角色；单人画面正文不加前缀，多说话人时逐行加「角色名：台词」前缀；指挥官台词单独汇入指挥官框。')
bullet('台词中的时间等「数字:数字」写法（如 12:30）不会被误认为角色切分。')
p('示例剧本：', bold=True)
code('阿尔法: 你好，指挥官。"使用背景1""使用角色立绘2"\n'
     '指挥官: 收到，准备出发。\n'
     '丽芙: 这一仗交给我。"延迟500"\n'
     '"下一幕"\n'
     '阿尔法: 战斗开始！"使用背景3"\n'
     '"导出"')
h2('7.3 指令集')
table(['指令', '作用'],
      [['下一幕', '提交当前画面，新建场景（重置背景/角色）'],
       ['下一句', '画面内推进到下一句台词（不新建画面，仅分隔标记）'],
       ['使用背景N', '应用第 N 个背景（按背景列表顺序，从 1 开始）'],
       ['使用角色立绘N', '应用第 N 个角色立绘（从 1 开始）'],
       ['延迟N', '本步之后暂停 N 毫秒（默认 300），便于肉眼观察'],
       ['打开打字机动画 / 关闭打字机动画', '开启/关闭打字机动画（影响导出默认格式）'],
       ['导出', '运行结束自动导出：默认 PNG；若已开打字机动画则默认 GIF'],
       ['导出PNG / 导出GIF / 导出MP4', '显式指定导出格式，覆盖默认'],
       ['指挥官（作为角色名）', '该段文案写入指挥官对话框并开启指挥官对话']],
      weights=[2.6, 4.2])
h2('7.4 运行流程')
bullet('点「运行」后，网站全自动逐行解析并执行：设置角色/台词 → 应用背景/立绘 → 处理指令。')
bullet('运行条提供「停止」按钮与三档速度：观察（每步约 300ms）/ 快速（约 50ms）/ 瞬时（不停顿），默认观察档。')
bullet('剧本从当前页面状态接着跑：不动已有场景与暂存，新画面依次追加到暂存末尾。')
bullet('剧本结束若有未提交画面，会自动提交。')
h2('7.5 分镜编辑弹窗与导出')
bullet('运行结束后自动弹出「分镜编辑」窗口：左侧是每帧缩略图，右侧可编辑该帧的 文案 / 背景 / 角色立绘 / 指挥官文本。')
bullet('支持上一张/下一张切换、保存修改、删除帧。')
bullet('导出顺序：先弹分镜窗口，修改满意后再点「全部导出」；剧本中「导出」指令作为预设格式生效（未写导出指令时按网站当前逻辑：开打字机动画→GIF，否则→PNG）。')
img('分镜编辑弹窗（缩略图 + 可编辑表单）')
h2('7.6 常见问题')
bullet('背景/立绘编号越界：记警告并跳过该指令，不影响其余画面。')
bullet('未知指令：记日志忽略。')
bullet('引号兼容：英文直引号 " 与中文引号 “” 都可识别，写法更自由。')

h1('8. 常见问题与排错')
table(['现象', '排查'],
      [['导出图片空白/失败', '确认用 http://localhost 打开，而非 file:// 直接打开'],
       ['背景/立绘不显示', '检查是否已「选择」对应项；视频背景确认文件可播放'],
       ['打字机动画不动', '确认已开启打字机动画开关，并等待文字逐字出现'],
       ['指挥官对话框不出现', '点「指挥官对话」按钮开启；仅战双模式原生支持'],
       ['剧本运行无反应', '检查剧本格式：角色名后有冒号、指令用引号包裹']],
      weights=[2.6, 4.2])
p('声明：本网站为非官方二创工具，请合理使用，注明非官方二创。', italic=True, size=9)

# ============ 渲染为 OOXML ============
PAGE_W = 9360  # twips 内容区宽度

def run_xml(text, bold=False, italic=False, size=None, color=None, mono=False):
    rpr = ['<w:rPr>']
    if mono:
        rpr.append('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/>')
    else:
        rpr.append('<w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/>')
    if bold: rpr.append('<w:b/>')
    if italic: rpr.append('<w:i/>')
    if color: rpr.append('<w:color w:val="%s"/>' % color)
    if size: rpr.append('<w:sz w:val="%d"/><w:szCs w:val="%d"/>' % (size*2, size*2))
    rpr.append('</w:rPr>')
    return '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (''.join(rpr), esc(text))

def para_xml(runs_xml, style=None, align=None, spacing=None):
    ppr = ['<w:pPr>']
    if style: ppr.append('<w:pStyle w:val="%s"/>' % style)
    if align: ppr.append('<w:jc w:val="%s"/>' % align)
    if spacing: ppr.append('<w:spacing w:after="%d" w:line="%d" w:lineRule="auto"/>' % spacing)
    ppr.append('</w:pPr>')
    return '<w:p>%s%s</w:p>' % (''.join(ppr), runs_xml)

def build():
    out = []
    for b in blocks:
        k = b[0]
        if k == 'h0':
            out.append(para_xml(run_xml(b[1], bold=True, size=20), style='Title', align='center'))
        elif k == 'h1':
            out.append(para_xml(run_xml(b[1], bold=True, size=16), style='Heading1'))
        elif k == 'h2':
            out.append(para_xml(run_xml(b[1], bold=True, size=13), style='Heading2'))
        elif k == 'h3':
            out.append(para_xml(run_xml(b[1], bold=True, size=11.5), style='Heading3'))
        elif k == 'p':
            _, t, bold, italic, size, color = b
            out.append(para_xml(run_xml(t, bold=bold, italic=italic, size=size, color=color)))
        elif k == 'bullet':
            out.append(para_xml(run_xml(b[1]), style='ListBullet'))
        elif k == 'note':
            out.append(para_xml(run_xml('【提示】' + b[1], italic=True, size=9.5, color='884400')))
        elif k == 'img':
            out.append(para_xml(run_xml('[配图：' + b[1] + ']', italic=True, size=9, color='999999')))
        elif k == 'code':
            out.append(para_xml(run_xml(b[1], mono=True, size=9), style='CodeBlock'))
        elif k == 'table':
            headers, rows, weights = b[1], b[2], b[3]
            out.append(table_xml(headers, rows, weights))
    # 结尾分节
    out.append('<w:p><w:pPr><w:sectPr/></w:pPr></w:p>')
    return ''.join(out)

def table_xml(headers, rows, weights):
    n = len(headers)
    if not weights:
        weights = [1.0]*n
    total = sum(weights) or 1
    colw = [int(PAGE_W * w / total) for w in weights]
    grid = ''.join('<w:gridCol w:w="%d"/>' % w for w in colw)
    borders = ('<w:tblBorders>'
               '<w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
               '<w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
               '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
               '<w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
               '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
               '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
               '</w:tblBorders>')
    tblpr = ('<w:tblPr><w:tblW w:w="%d" w:type="dxa"/>%s'
             '<w:tblLook w:val="04A0"/></w:tblPr>' % (PAGE_W, borders))
    all_rows = [headers] + list(rows)
    trs = []
    for ri, row in enumerate(all_rows):
        is_hdr = (ri == 0)
        tcs = []
        for ci, cell in enumerate(row):
            tcpr = '<w:tcPr><w:tcW w:w="%d" w:type="dxa"/>' % colw[ci]
            if is_hdr:
                tcpr += '<w:shd w:val="clear" w:color="auto" w:fill="DCE6F1"/>'
            tcpr += '</w:tcPr>'
            r = run_xml(str(cell), bold=is_hdr, size=9)
            tcs.append('<w:tc>%s<w:p>%s</w:p></w:tc>' % (tcpr, r))
        trs.append('<w:tr>%s</w:tr>' % ''.join(tcs))
    return '<w:tbl>%s%s%s</w:tbl>' % (tblpr, grid, ''.join(trs))

# ---------- 样式 ----------
STYLES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/>
    <w:sz w:val="21"/><w:szCs w:val="21"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="100" w:after="40"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="CodeBlock"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="240"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr></w:style>
</w:styles>'''

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

DOC_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

def main():
    body = build()
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:body>%s</w:body></w:document>' % body)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', CONTENT_TYPES)
        z.writestr('_rels/.rels', RELS)
        z.writestr('word/document.xml', document)
        z.writestr('word/styles.xml', STYLES)
        z.writestr('word/_rels/document.xml.rels', DOC_RELS)
    print('SAVED', OUT, os.path.getsize(OUT), 'bytes')

if __name__ == '__main__':
    main()
