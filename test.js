const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const script = fs.readFileSync('script.js', 'utf8');

    const dom = new JSDOM(html, { runScripts: 'outside-only', resources: 'usable' });
    const window = dom.window;

    // Mocks
    window.html2canvas = async (el, opts) => ({ toDataURL: () => 'data:image/png;base64,FAKE' });
    window.GIF = function () { this.addFrame = () => {}; this.on = () => {}; this.render = () => {}; };
    window.alert = (msg) => console.log('[ALERT]', msg);

    // expose console
    window.console = console;

    // Execute app script
    window.eval(script);

    // Initialize app
    if (typeof window.init === 'function') window.init();

    // Ensure we have at least one scene
    console.log('initial scenes:', window.state.scenes.length);

    // Simulate entering a dialog and creating a saved snapshot
    window.elements.dialogInput.value = '第一句测试';
    if (typeof window.addDialog === 'function') window.addDialog();

    // push a snapshot (simulate nextDialog behaviour)
    window.state.savedScenes.push(window.cloneStateWithCurrentInput());
    console.log('savedScenes after push:', window.state.savedScenes.length);

    // Open saved scenes modal
    await window.showSavedScenes();
    const modal = window.document.getElementById('saved-scenes-modal');
    console.log('modal display after showSavedScenes:', modal.style.display);

    // Find the first load button and click it
    const loadBtn = modal.querySelector('.snapshot-load-btn');
    if (!loadBtn) {
        console.error('No load button found');
        process.exit(2);
    }
    loadBtn.click();
    console.log('Clicked load button. Modal display:', modal.style.display);
    console.log('currentLoadedSnapshotIndex:', window.currentLoadedSnapshotIndex);

    // Modify content in the editor
    window.elements.dialogInput.value = '修改后的文本';
    window.elements.dialogInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    // Check that main save button becomes visible
    console.log('saveSnapshotLeft display:', window.elements.saveSnapshotLeft ? window.elements.saveSnapshotLeft.style.display : 'MISSING');

    // Click main save button
    if (typeof window.saveLoadedSnapshot === 'function') {
        await window.saveLoadedSnapshot();
    }

    const idx = window.currentLoadedSnapshotIndex;
    const savedSnap = window.state.savedScenes[idx];
    const scene = savedSnap.scenes[savedSnap.currentSceneIndex];
    const dialogText = (scene.dialogs && scene.dialogs[0] && scene.dialogs[0].text) || '(no dialog)';
    console.log('Saved snapshot dialog text:', dialogText);

    // Check backup exists
    console.log('backup exists for idx:', !!(window.savedSnapshotBackups && window.savedSnapshotBackups[idx]));

    console.log('TEST COMPLETE');
    process.exit(0);
})();
