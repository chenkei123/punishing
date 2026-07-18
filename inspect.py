import zipfile, os, sys
root = r'c:\Users\WQ383\OneDrive\Desktop\新二创网站'
zip_path = os.path.join(root, 'backup (3).zip')
print('zip exists:', os.path.exists(zip_path))
if os.path.exists(zip_path):
    with zipfile.ZipFile(zip_path, 'r') as z:
        print('files:', z.namelist())
        for name in z.namelist():
            if name.lower() in ('styles.css', 'index.html', 'script.js'):
                info = z.getinfo(name)
                print(name, info.file_size, info.compress_size)
