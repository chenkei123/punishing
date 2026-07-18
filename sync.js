#!/usr/bin/env node
/**
 * ============================================================
 * sync.js —— 鸣潮模式 HTML 兜底同步脚本
 * ------------------------------------------------------------
 * 功能：
 *   读取 ming-mode/ming.html 的完整内容，将其转义为合法的
 *   JS 模板字符串，然后自动替换 ming-mode/ming.js 中
 *   MING_HTML_FALLBACK = `...`; 里的内容。
 *
 * 用法：
 *   node sync.js
 *
 * 使用场景：
 *   每次修改完 ming.html 后运行此脚本，保证双击 index.html
 *   （file:// 协议）时兜底逻辑是最新的。
 * ============================================================
 */

'use strict';

var fs = require('fs');
var path = require('path');

// 文件路径（相对于项目根目录，即 sync.js 所在目录）
var ROOT = __dirname;
var MING_HTML_PATH = path.join(ROOT, 'ming-mode', 'ming.html');
var MING_JS_PATH = path.join(ROOT, 'ming-mode', 'ming.js');

/**
 * 将 HTML 内容转义为合法的 JS 模板字符串内容。
 * 需要转义的字符：
 *   1. 反引号 ` → \`
 *   2. 反斜杠 \ → \\
 *   3. ${ → \${
 * 注意：转义反斜杠必须在最前面，否则会双重转义后面插入的 \。
 */
function escapeForTemplateLiteral(str) {
    return str
        .replace(/\\/g, '\\\\')   // 反斜杠先转义
        .replace(/`/g, '\\`')     // 反引号转义
        .replace(/\$\{/g, '\\${'); // 模板插值标记转义
}

/**
 * 主流程
 */
function main() {
    // 1. 读取 ming.html
    var htmlContent;
    try {
        htmlContent = fs.readFileSync(MING_HTML_PATH, 'utf8');
    } catch (e) {
        console.error('[sync.js] 读取 ming.html 失败:', e.message);
        process.exit(1);
    }

    // 2. 转义为合法的 JS 模板字符串内容
    var escaped = escapeForTemplateLiteral(htmlContent);

    // 3. 读取 ming.js
    var jsContent;
    try {
        jsContent = fs.readFileSync(MING_JS_PATH, 'utf8');
    } catch (e) {
        console.error('[sync.js] 读取 ming.js 失败:', e.message);
        process.exit(1);
    }

    // 4. 替换 MING_HTML_FALLBACK 模板字符串内容
    //    匹配模式：MING_HTML_FALLBACK = `...`;
    //    使用 [\s\S] 匹配任意字符（包括换行），非贪婪匹配
    var pattern = /(var\s+MING_HTML_FALLBACK\s*=\s*`)([\s\S]*?)(`;)/;
    var match = jsContent.match(pattern);

    if (!match) {
        console.error('[sync.js] 在 ming.js 中未找到 MING_HTML_FALLBACK = `...`; 模板字符串');
        console.error('[sync.js] 请确保 ming.js 中存在以下格式的声明：');
        console.error('         var MING_HTML_FALLBACK = `...`;');
        process.exit(1);
    }

    var prefix = match[1];  // var MING_HTML_FALLBACK = `
    var suffix = match[3];  // `;
    var newJsContent = jsContent.replace(pattern, prefix + escaped + suffix);

    // 5. 写回 ming.js
    try {
        fs.writeFileSync(MING_JS_PATH, newJsContent, 'utf8');
    } catch (e) {
        console.error('[sync.js] 写入 ming.js 失败:', e.message);
        process.exit(1);
    }

    // 6. 输出成功信息
    var htmlLines = htmlContent.split('\n').length;
    var escapedLength = escaped.length;
    console.log('[sync.js] 同步成功！');
    console.log('  源文件: ming-mode/ming.html (' + htmlLines + ' 行, ' + htmlContent.length + ' 字符)');
    console.log('  目标:   ming-mode/ming.js → MING_HTML_FALLBACK (' + escapedLength + ' 字符, 已转义)');
    console.log('');
    console.log('  现在可以双击 index.html 在 file:// 协议下使用鸣潮模式了。');
}

main();
