// ming-script-automation.js 解析器离线单元测试（加载真实源文件）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

globalThis.window = globalThis;
globalThis.document = { readyState: 'complete', getElementById: () => null, body: { classList: { contains: () => false } } };
globalThis.state = {};

vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, 'ming-script-automation.js'), 'utf8'),
  { filename: 'ming-script-automation.js' }
);

// init() 因 window.MingMode 未定义而 return，但 parseScript 也不在导出对象里 —— 模块未暴露。
// 通过源码文本提取 parseScript 上下文来测？更直接：检查模块未导出则改用源码抽取。
let parse;
if (globalThis.__mingParser) {
  parse = globalThis.__mingParser;
} else {
  // 从源码中截取解析器区块求值（与文件内实现一致）
  const src = fs.readFileSync(path.join(__dirname, 'ming-script-automation.js'), 'utf8');
  const start = src.indexOf('var RE_QUOTED');
  const end = src.indexOf('// ==================== 弹窗 UI');
  const block = src.slice(start, end) + '\nreturn parseScript;';
  parse = new Function(block)();
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); }
}

console.log('== 1. 剧情模式解析 ==');
{
  const r = parse('角色: 你好。"使用背景1"\n漂泊者: 收到。\n"下一幕"\n角色: 开战！ "导出"', 'story');
  check('6 步骤', r.steps.length === 6, String(r.steps.length));
  check('漂泊者→isCommander', r.steps[2].isCommander === true);
  check('背景指令', r.steps[1].cmd.op === 'bg');
  check('下一幕', r.steps[3].cmd.op === 'nextScene');
  check('导出 auto', r.steps[5].cmd.fmt === 'auto');
  check('无警告', r.warnings.length === 0, r.warnings.join(';'));
}
console.log('== 2. 飞讯模式解析 ==');
{
  const r = parse('联系人: 在吗？\n漂泊者: 在的。\n"切换联系人2"\n"新对话"\n联系人: 新章节。\n"下一幕"\n"导出PNG"', 'feixun');
  check('7 步骤', r.steps.length === 7, String(r.steps.length));
  check('联系人=left', r.steps[0].side === 'left');
  check('漂泊者=right', r.steps[1].side === 'right');
  check('切换联系人2', r.steps[2].cmd.op === 'switchContact' && r.steps[2].cmd.n === 2);
  check('新对话', r.steps[3].cmd.op === 'newDialogue');
  check('下一幕', r.steps[5].cmd.op === 'nextScene');
  check('导出PNG', r.steps[6].cmd.fmt === 'png');
}
console.log('== 3. 飞讯不认识的名字 ==');
{
  const r = parse('秧秧: 你好', 'feixun');
  check('忽略并警告', r.steps.length === 0 && r.warnings.length === 1 && r.warnings[0].indexOf('联系人') >= 0, r.warnings.join(';'));
}
console.log('== 4. 导出MP4 告警 ==');
{
  const r = parse('"导出MP4"', 'feixun');
  check('忽略并警告', r.steps.length === 0 && r.warnings[0].indexOf('MP4') >= 0, r.warnings.join(';'));
}
console.log('== 5. 中文引号 + 指令集 ==');
{
  const r = parse('\u201c切换联系人1\u201d\n\u201c延迟500\u201d\n\u201c打开打字机动画\u201d\n\u201c导出GIF\u201d', 'feixun');
  const ops = r.steps.map(s => s.cmd.op);
  check('全部识别', ops.join(',') === 'switchContact,delay,anim,export');
  check('延迟500', r.steps[1].cmd.ms === 500);
  check('导出GIF', r.steps[3].cmd.fmt === 'gif');
}
console.log('== 6. 剧情指令在飞讯中解析（运行期才跳过） ==');
{
  const r = parse('"使用背景1"', 'feixun');
  check('解析成功（运行期告警跳过）', r.steps.length === 1 && r.steps[0].cmd.op === 'bg');
}
console.log('== 7. 混合一行多段 + 指令 ==');
{
  const r = parse('联系人: 在吗？ "延迟100" 漂泊者: 在。', 'feixun');
  check('两段消息 + 指令（台词在前指令在后）', r.steps.length === 3 && r.steps[0].side === 'left' && r.steps[1].side === 'right' && r.steps[2].cmd.op === 'delay');
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
