// script-automation.js 解析器离线单元测试（加载真实源文件，非副本）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// DOM/全局 shim：让 IIFE 完成加载并暴露 window.__scriptAutomation
globalThis.window = globalThis;
globalThis.document = { readyState: 'complete', getElementById: () => null };
globalThis.state = {};

vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, 'script-automation.js'), 'utf8'),
  { filename: 'script-automation.js' }
);

const parse = window.__scriptAutomation.parse;
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); }
}
function run(script) {
  const r = parse(script);
  return { steps: r.steps, warns: r.warnings.map(w => w.replace(/^第 \d+ 行：/, '')) };
}
const isCmd = (s, op) => s.type === 'command' && s.cmd.op === op;
const isDlg = (s, name, isCommander) => s.type === 'dialog' && s.name === name &&
  (isCommander === undefined || s.isCommander === isCommander);

console.log('== 1. 中文引号与英文引号 ==');
{
  const { steps, warns } = run('\u201c使用背景99\u201d\n"使用背景1"');
  check('中文引号指令解析为 bg', isCmd(steps[0], 'bg') && steps[0].cmd.n === 99, JSON.stringify(steps[0]));
  check('英文引号指令解析为 bg', isCmd(steps[1], 'bg') && steps[1].cmd.n === 1, JSON.stringify(steps[1]));
  check('无警告', warns.length === 0, warns.join(';'));
}
console.log('== 2. 未知指令 ==');
{
  const { steps, warns } = run('\u201c这是什么指令\u201d');
  check('未知指令被忽略', steps.length === 0);
  check('产生警告', warns.length === 1 && warns[0].indexOf('未知指令') >= 0, warns.join(';'));
}
console.log('== 3. 台词+指令混排（一行多段） ==');
{
  const { steps } = run('阿尔法: 1 指挥官: 2 "使用背景2"');
  check('段1 阿尔法', isDlg(steps[0], '阿尔法', false) && steps[0].text === '1');
  check('段2 指挥官', isDlg(steps[1], '指挥官', true) && steps[1].text === '2');
  check('段3 背景指令', isCmd(steps[2], 'bg') && steps[2].cmd.n === 2);
  check('顺序：台词在前指令在后', steps[0].type === 'dialog' && steps[2].type === 'command');
}
console.log('== 4. 指令集全覆盖 ==');
{
  const { steps } = run('"下一幕"\n"下一句"\n"使用角色立绘3"\n"使用立绘2"\n"延迟500"\n"延迟"\n"打开打字机动画"\n"关闭打字机动画"\n"导出"\n"导出PNG"\n"导出GIF"\n"导出MP4"');
  const ops = steps.map(s => s.cmd.op + (s.cmd.n !== undefined ? ':' + s.cmd.n : '') + (s.cmd.ms !== undefined ? ':' + s.cmd.ms : '') + (s.cmd.fmt ? ':' + s.cmd.fmt : ''));
  check('下一幕', isCmd(steps[0], 'nextScene'));
  check('下一句', isCmd(steps[1], 'nextDialog'));
  check('使用角色立绘3', isCmd(steps[2], 'char') && steps[2].cmd.n === 3, ops[2]);
  check('使用立绘2 别名', isCmd(steps[3], 'char') && steps[3].cmd.n === 2, ops[3]);
  check('延迟500', isCmd(steps[4], 'delay') && steps[4].cmd.ms === 500, ops[4]);
  check('延迟默认300', isCmd(steps[5], 'delay') && steps[5].cmd.ms === 300, ops[5]);
  check('打开动画', isCmd(steps[6], 'anim') && steps[6].cmd.on === true);
  check('关闭动画', isCmd(steps[7], 'anim') && steps[7].cmd.on === false);
  check('导出 auto', isCmd(steps[8], 'export') && steps[8].cmd.fmt === 'auto');
  check('导出PNG', isCmd(steps[9], 'export') && steps[9].cmd.fmt === 'png');
  check('导出GIF', isCmd(steps[10], 'export') && steps[10].cmd.fmt === 'gif');
  check('导出MP4', isCmd(steps[11], 'export') && steps[11].cmd.fmt === 'mp4');
}
console.log('== 5. 无冒号无指令行 ==');
{
  const { steps, warns } = run('这是普通文字行\n\n');
  check('忽略并警告', steps.length === 0 && warns.length === 1 && warns[0].indexOf('已忽略') >= 0, warns.join(';'));
}
console.log('== 6. 指令内容含冒号（不干扰角色切分） ==');
{
  const { steps } = run('甲: 时间是 "导出PNG" 12:30 结束');
  check('台词完整保留', isDlg(steps[0], '甲') && steps[0].text.indexOf('12:30') >= 0, JSON.stringify(steps[0]));
  check('指令仍被抽取', isCmd(steps[1], 'export') && steps[1].cmd.fmt === 'png');
}
console.log('== 7. 多行多角色剧本 ==');
{
  const { steps, warns } = run('阿尔法: 你好，指挥官。"使用背景1""使用角色立绘2"\n指挥官: 收到，准备出发。\n丽芙: 这一仗交给我。"延迟500"\n"下一幕"\n阿尔法: 战斗开始！"使用背景3"\n"导出"');
  check('步骤总数 10', steps.length === 10, String(steps.length));
  check('无警告', warns.length === 0, warns.join(';'));
  check('首步为阿尔法台词', isDlg(steps[0], '阿尔法'));
  check('第二步背景', isCmd(steps[1], 'bg') && steps[1].cmd.n === 1);
  check('第三步立绘', isCmd(steps[2], 'char') && steps[2].cmd.n === 2);
  check('指挥官段', isDlg(steps[3], '指挥官', true));
  check('丽芙段+延迟', isDlg(steps[4], '丽芙') && isCmd(steps[5], 'delay'));
  check('下一幕后新画面', isCmd(steps[6], 'nextScene'));
  check('导出预设', isCmd(steps[9], 'export'));
}
console.log('== 8. 空内容 ==');
{
  const { steps } = run('');
  check('空剧本零步骤', steps.length === 0);
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
