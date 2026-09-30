/* ============================================================
   db.js — 编辑器草稿自动保存（第 6 项，IndexedDB）
   · DraftStore.save(payload) / load() / clear()
   · 草稿数据复用「工程 JSON」的 payload 结构（恢复走 applyImportedProject）
   ============================================================ */
(function () {
    'use strict';

    var DB_NAME = 'erciyuan-drafts';
    var STORE = 'draft';

    function open() {
        return new Promise(function (resolve, reject) {
            var rq = indexedDB.open(DB_NAME, 1);
            rq.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
            };
            rq.onsuccess = function (e) { resolve(e.target.result); };
            rq.onerror = function () { reject(rq.error); };
        });
    }

    window.DraftStore = {
        /** 保存草稿（payload 为可 JSON 化对象） */
        save: function (payload) {
            return open().then(function (db) {
                return new Promise(function (resolve, reject) {
                    var tx = db.transaction(STORE, 'readwrite');
                    tx.objectStore(STORE).put({ id: 'current', ts: Date.now(), data: payload });
                    tx.oncomplete = function () { resolve(true); };
                    tx.onerror = function () { reject(tx.error); };
                });
            }).catch(function (e) {
                console.warn('[草稿] 保存失败:', e);
            });
        },
        /** 读取草稿：{id, ts, data} 或 null */
        load: function () {
            return open().then(function (db) {
                return new Promise(function (resolve, reject) {
                    var rq = db.transaction(STORE, 'readonly').objectStore(STORE).get('current');
                    rq.onsuccess = function () { resolve(rq.result || null); };
                    rq.onerror = function () { reject(rq.error); };
                });
            }).catch(function (e) {
                console.warn('[草稿] 读取失败:', e);
                return null;
            });
        },
        clear: function () {
            return open().then(function (db) {
                return new Promise(function (resolve, reject) {
                    var tx = db.transaction(STORE, 'readwrite');
                    tx.objectStore(STORE).delete('current');
                    tx.oncomplete = function () { resolve(true); };
                    tx.onerror = function () { reject(tx.error); };
                });
            }).catch(function () { });
        }
    };
})();
