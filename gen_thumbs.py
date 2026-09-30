# -*- coding: utf-8 -*-
"""为选择网格生成缩略图（Feature B 方案乙：仅网格使用，预览/导出始终原图）。

- 输入：backgrounds/ 与 characters/ 下的静态图片
- 输出：<目录>/thumb/<原完整文件名>.jpg（保留原名，避免 MC3.jpeg 与 MC3.png 撞名）
- 规格：最长边 1280px、JPEG 质量 72（用户拍板）
- 跳过：视频/动图文件；缩略图比原图新则跳过（增量生成）
- 依赖：Pillow（缺失时给出安装提示后退出）
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    print('[x] 缺少 Pillow，请先安装：python -m pip install --user Pillow')
    sys.exit(1)

MAX_SIDE = 1280
QUALITY = 72
# 注：characters/ 不生成缩略图——透明立绘转 JPEG 会丢失透明变白底，且角色图总量很小
DIRS = ['backgrounds']
SKIP_EXTS = {'.mp4', '.webm', '.mov', '.avi', '.mkv', '.gif', '.m4v'}


def gen_one(src_path, out_path):
    try:
        im = Image.open(src_path)
        if im.mode not in ('RGB', 'L'):
            im = im.convert('RGB')
        w, h = im.size
        longest = max(w, h)
        if longest > MAX_SIDE:
            scale = MAX_SIDE / longest
            im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
        im.save(out_path, 'JPEG', quality=QUALITY, optimize=True)
        return True
    except Exception as e:
        print('  [跳过] %s: %s' % (src_path, e))
        return False


def main():
    generated = skipped_fresh = failed = 0
    total_in = total_out = 0
    for d in DIRS:
        thumb_dir = os.path.join(d, 'thumb')
        os.makedirs(thumb_dir, exist_ok=True)
        for f in sorted(os.listdir(d)):
            src_path = os.path.join(d, f)
            if not os.path.isfile(src_path):
                continue
            if os.path.splitext(f)[1].lower() in SKIP_EXTS:
                continue
            out_path = os.path.join(thumb_dir, f + '.jpg')
            if os.path.exists(out_path) and os.path.getmtime(out_path) >= os.path.getmtime(src_path):
                skipped_fresh += 1
                continue
            src_size = os.path.getsize(src_path)
            if gen_one(src_path, out_path):
                generated += 1
                total_in += src_size
                total_out += os.path.getsize(out_path)
                print('  [生成] %s -> %s (%.0fKB -> %.0fKB)' % (
                    src_path, out_path, src_size / 1024, os.path.getsize(out_path) / 1024))
            else:
                failed += 1
    if generated:
        print('\n完成：新生成 %d 张（另有 %d 张已是最新，%d 张失败）' % (generated, skipped_fresh, failed))
        print('原图合计 %.2fMB → 缩略图合计 %.2fMB（-%.0f%%）' % (
            total_in / 1048576, total_out / 1048576,
            (1 - total_out / total_in) * 100 if total_in else 0))
    else:
        print('\n完成：所有缩略图均已是最新（%d 张），无需生成' % skipped_fresh)


if __name__ == '__main__':
    main()
