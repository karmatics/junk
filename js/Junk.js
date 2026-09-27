class Junk {
  constructor() {
    this.filename = 'junk.txt';
    this.directoryHandle = null;
    this.editor = null;
    this.isEncrypted = false;
    this.isDecrypted = false;
    this.lastRawContent = '';
    this.savedPasswordKey = 'junk_saved_password';
    this.encPrefix = 'ENC::v1::';
  }

  async run(env) {
    if (!env || !env.container) {
      throw new Error('[Junk] run() requires an environment object with a valid container.');
    }
    this.env = env;
    this.container = env.container;
    this.container.innerHTML = '';
    this.container.classList.add('junk-container');

    // Ensure CodeMirror is loaded
    await this._ensureCodeMirror();

    // Setup DOM Structure
    this._buildUI();

    // Check IndexedDB for remembered password
    await this._loadSavedPassword();

    // Load initial junk.txt from current directory
    await this._loadInitialFile();

    // Fit editor
    setTimeout(() => {
      if (this.editor) this.editor.refresh();
    }, 100);

    this._onResize = () => {
      if (this.editor) this.editor.refresh();
    };
    window.addEventListener('resize', this._onResize);
  }

  async _ensureCodeMirror() {
    if (typeof CodeMirror !== 'undefined') return;

    if (!document.getElementById('cm-css-core')) {
      const link = document.createElement('link');
      link.id = 'cm-css-core';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('cm-theme-dracula')) {
      const themeLink = document.createElement('link');
      themeLink.id = 'cm-theme-dracula';
      themeLink.rel = 'stylesheet';
      themeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css';
      document.head.appendChild(themeLink);
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load CodeMirror library.'));
      document.head.appendChild(script);
    });
  }

  _buildUI() {
    // Header
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'junk-header';

    // Title Bar
    const titleBar = document.createElement('div');
    titleBar.className = 'junk-title-bar';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'junk-title-group';
    titleGroup.innerHTML = `
      <h2>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
        ${this.filename}
      </h2>
    `;

    this.formatBadge = document.createElement('span');
    this.formatBadge.className = 'junk-badge junk-badge-plain';
    this.formatBadge.textContent = 'Plaintext';
    titleGroup.appendChild(this.formatBadge);

    this.dirIndicator = document.createElement('div');
    this.dirIndicator.className = 'junk-dir-indicator';
    this.dirIndicator.innerHTML = `<span>Save target:</span> <strong id="junk-dir-name">App Origin (Prompt on save)</strong>`;

    titleBar.appendChild(titleGroup);
    titleBar.appendChild(this.dirIndicator);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'junk-toolbar';

    // Password input group
    const pwdGroup = document.createElement('div');
    pwdGroup.className = 'junk-pwd-group';

    this.pwdInput = document.createElement('input');
    this.pwdInput.type = 'password';
    this.pwdInput.className = 'junk-pwd-input';
    this.pwdInput.placeholder = 'Encryption Password';
    this.pwdInput.autocomplete = 'off';

    const toggleEyeBtn = document.createElement('button');
    toggleEyeBtn.className = 'junk-icon-btn';
    toggleEyeBtn.title = 'Show/Hide Password';
    toggleEyeBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    toggleEyeBtn.onclick = () => {
      this.pwdInput.type = this.pwdInput.type === 'password' ? 'text' : 'password';
    };

    pwdGroup.appendChild(this.pwdInput);
    pwdGroup.appendChild(toggleEyeBtn);

    // Decrypt button
    this.decryptBtn = document.createElement('button');
    this.decryptBtn.className = 'junk-btn junk-btn-blue';
    this.decryptBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
      </svg>
      Decrypt
    `;
    this.decryptBtn.onclick = () => this.decryptCurrent();

    // Save button (Uses File System API)
    this.saveBtn = document.createElement('button');
    this.saveBtn.className = 'junk-btn junk-btn-primary';
    this.saveBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      Save File
    `;
    this.saveBtn.onclick = () => this.saveToFile();

    // Select Directory button
    this.selectDirBtn = document.createElement('button');
    this.selectDirBtn.className = 'junk-btn junk-btn-secondary';
    this.selectDirBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      Select Directory
    `;
    this.selectDirBtn.onclick = () => this.pickDirectory();

    // Clear saved password button
    this.clearPwdBtn = document.createElement('button');
    this.clearPwdBtn.className = 'junk-btn junk-btn-danger';
    this.clearPwdBtn.title = 'Clear remembered password from IndexedDB';
    this.clearPwdBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      Clear Key
    `;
    this.clearPwdBtn.onclick = () => this.clearSavedPassword();

    // Remember password checkbox
    const rememberWrap = document.createElement('label');
    rememberWrap.className = 'junk-remember-label';
    this.rememberCheckbox = document.createElement('input');
    this.rememberCheckbox.type = 'checkbox';
    this.rememberCheckbox.checked = true;
    rememberWrap.appendChild(this.rememberCheckbox);
    rememberWrap.appendChild(document.createTextNode('Remember in IndexedDB'));

    toolbar.appendChild(pwdGroup);
    toolbar.appendChild(this.decryptBtn);
    toolbar.appendChild(this.saveBtn);
    toolbar.appendChild(this.selectDirBtn);
    toolbar.appendChild(this.clearPwdBtn);
    toolbar.appendChild(rememberWrap);

    this.headerEl.appendChild(titleBar);
    this.headerEl.appendChild(toolbar);
    this.container.appendChild(this.headerEl);

    // Editor Area
    this.editorWrapper = document.createElement('div');
    this.editorWrapper.className = 'junk-editor-wrapper';
    this.container.appendChild(this.editorWrapper);

    this.editor = CodeMirror(this.editorWrapper, {
      value: '// Loading junk.txt...',
      mode: 'text/plain',
      theme: 'dracula',
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
      indentWithTabs: false,
    });

    this.editor.on('change', () => {
      this._updateStats();
    });

    // Status Bar
    this.statusBar = document.createElement('div');
    this.statusBar.className = 'junk-status-bar';

    this.statusMsg = document.createElement('div');
    this.statusMsg.className = 'junk-status-msg';
    this.statusMsg.textContent = 'Ready.';

    const statusStats = document.createElement('div');
    statusStats.className = 'junk-status-stats';
    this.statsDisplay = document.createElement('span');
    this.statsDisplay.textContent = 'Lines: 0 | Chars: 0';
    statusStats.appendChild(this.statsDisplay);

    this.statusBar.appendChild(this.statusMsg);
    this.statusBar.appendChild(statusStats);
    this.container.appendChild(this.statusBar);

    this.pwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.decryptCurrent();
      }
    });
  }

  // --- IndexedDB Management ---
  async _getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('JunkEditorDB', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('credentials')) {
          db.createObjectStore('credentials');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _loadSavedPassword() {
    try {
      const db = await this._getDB();
      const pwd = await new Promise((resolve) => {
        const tx = db.transaction('credentials', 'readonly');
        const store = tx.objectStore('credentials');
        const req = store.get(this.savedPasswordKey);
        req.onsuccess = () => resolve(req.result || '');
        req.onerror = () => resolve('');
      });
      if (pwd) {
        this.pwdInput.value = pwd;
        this.notify('Restored remembered password from IndexedDB.');
      }
    } catch (e) {
      console.warn('Could not read from IndexedDB:', e);
    }
  }

  async _savePasswordToDB(pwd) {
    if (!this.rememberCheckbox.checked || !pwd) return;
    try {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('credentials', 'readwrite');
        const store = tx.objectStore('credentials');
        const req = store.put(pwd, this.savedPasswordKey);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Could not save password to IndexedDB:', e);
    }
  }

  async clearSavedPassword() {
    try {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('credentials', 'readwrite');
        const store = tx.objectStore('credentials');
        const req = store.delete(this.savedPasswordKey);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      this.pwdInput.value = '';
      this.notify('Password cleared from IndexedDB.');
      this.statusMsg.textContent = 'Stored credentials removed.';
    } catch (e) {
      this.notify('Failed to clear credentials.', true);
    }
  }

  // --- Cryptography (Web Crypto AES-GCM + PBKDF2) ---
  async _deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptContent(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this._deriveKey(password, salt);
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      enc.encode(plaintext)
    );

    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, 16);
    combined.set(new Uint8Array(ciphertext), 28);

    let binary = '';
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return this.encPrefix + btoa(binary);
  }

  async decryptContent(payload, password) {
    if (!payload.startsWith(this.encPrefix)) {
      throw new Error('Data does not have the expected encryption signature.');
    }
    const rawBase64 = payload.slice(this.encPrefix.length).trim();
    const binary = atob(rawBase64);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await this._deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  // --- Initial Reading ---
  async _loadInitialFile() {
    this.statusMsg.textContent = 'Reading junk.txt from current directory...';
    try {
      const resp = await fetch('junk.txt?t=' + Date.now());
      if (resp.ok) {
        const text = await resp.text();
        this._setLoadedContent(text, 'Loaded junk.txt from current directory.');
        return;
      }
    } catch (e) {
      console.log('fetch junk.txt notice:', e.message);
    }

    // Default template if junk.txt does not exist yet on server/directory
    const defaultTemplate = `# Welcome to Junk Editor
This file (junk.txt) will be saved using the File System API.

- Type your password in the toolbar to encrypt this file upon saving.
- If saved with a password, junk.txt is written encrypted to disk.
- You can remember or clear your password in IndexedDB.
- Decrypting an existing file unlocks the plaintext here.`;

    this._setLoadedContent(defaultTemplate, 'New junk.txt ready. Set password to encrypt on save.');
  }

  _setLoadedContent(text, statusNote) {
    this.lastRawContent = text;
    const trimmed = text.trim();
    if (trimmed.startsWith(this.encPrefix)) {
      this.isEncrypted = true;
      this.isDecrypted = false;
      this.formatBadge.className = 'junk-badge junk-badge-enc';
      this.formatBadge.textContent = 'Encrypted';

      // Auto-decrypt if password already present from IndexedDB
      if (this.pwdInput.value) {
        this.decryptCurrent(true);
      } else {
        this.editor.setValue(text);
        this.statusMsg.textContent = '🔒 File is encrypted. Enter password and click Decrypt.';
      }
    } else {
      this.isEncrypted = false;
      this.isDecrypted = true;
      this.formatBadge.className = 'junk-badge junk-badge-plain';
      this.formatBadge.textContent = 'Plaintext';
      this.editor.setValue(text);
      this.statusMsg.textContent = statusNote;
    }
    this._updateStats();
  }

  async decryptCurrent(isAuto = false) {
    const pwd = this.pwdInput.value;
    if (!pwd) {
      this.notify('Please enter a password to decrypt.', true);
      this.pwdInput.focus();
      return;
    }

    const contentToDecrypt = this.lastRawContent || this.editor.getValue();
    if (!contentToDecrypt.trim().startsWith(this.encPrefix)) {
      this.notify('Current content is already decrypted / plaintext.');
      return;
    }

    this.statusMsg.textContent = 'Decrypting...';
    try {
      const plaintext = await this.decryptContent(contentToDecrypt, pwd);
      this.editor.setValue(plaintext);
      this.isDecrypted = true;
      this.formatBadge.className = 'junk-badge junk-badge-plain';
      this.formatBadge.textContent = 'Decrypted';
      this.statusMsg.textContent = isAuto
        ? '🔓 Automatically decrypted with saved password.'
        : '🔓 Successfully decrypted.';
      this.notify('Decryption successful.');
      await this._savePasswordToDB(pwd);
    } catch (e) {
      console.error(e);
      this.statusMsg.textContent = '❌ Decryption failed: Invalid password.';
      this.notify('Decryption failed! Incorrect password.', true);
    }
    this._updateStats();
  }

  // --- Directory Selection & Saving (File System Access API) ---
  async pickDirectory() {
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support Directory Picker API. Direct file prompt will be used.');
      return;
    }
    try {
      this.directoryHandle = await window.showDirectoryPicker({
        id: 'junk-workspace-dir',
        mode: 'readwrite',
      });
      const dirEl = document.getElementById('junk-dir-name');
      if (dirEl) dirEl.textContent = this.directoryHandle.name + '/';
      this.notify(`Selected directory: ${this.directoryHandle.name}`);
      this.statusMsg.textContent = `Target directory set to ${this.directoryHandle.name}/`;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error(e);
        this.notify('Directory selection canceled or failed.', true);
      }
    }
  }

  async saveToFile() {
    const editorText = this.editor.getValue();
    const pwd = this.pwdInput.value;
    let contentToSave = editorText;

    // Encrypt if password is provided
    if (pwd) {
      this.statusMsg.textContent = 'Encrypting content...';
      try {
        contentToSave = await this.encryptContent(editorText, pwd);
        await this._savePasswordToDB(pwd);
      } catch (err) {
        this.notify('Encryption failed: ' + err.message, true);
        return;
      }
    }

    // Write file using File System Access API
    try {
      if ('showDirectoryPicker' in window) {
        if (!this.directoryHandle) {
          this.statusMsg.textContent = 'Please choose directory to save junk.txt...';
          this.directoryHandle = await window.showDirectoryPicker({
            id: 'junk-workspace-dir',
            mode: 'readwrite',
          });
          const dirEl = document.getElementById('junk-dir-name');
          if (dirEl) dirEl.textContent = this.directoryHandle.name + '/';
        }

        const fileHandle = await this.directoryHandle.getFileHandle(this.filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(contentToSave);
        await writable.close();

        this.lastRawContent = contentToSave;
        if (pwd) {
          this.formatBadge.className = 'junk-badge junk-badge-enc';
          this.formatBadge.textContent = 'Saved Encrypted';
          this.notify(`Saved ENCRYPTED to ${this.directoryHandle.name}/${this.filename}`);
          this.statusMsg.textContent = `✅ Saved encrypted ${this.filename} to ${this.directoryHandle.name}/ at ${new Date().toLocaleTimeString()}`;
        } else {
          this.formatBadge.className = 'junk-badge junk-badge-plain';
          this.formatBadge.textContent = 'Plaintext';
          this.notify(`Saved plaintext to ${this.directoryHandle.name}/${this.filename}`);
          this.statusMsg.textContent = `✅ Saved plaintext ${this.filename} to ${this.directoryHandle.name}/ at ${new Date().toLocaleTimeString()}`;
        }
        return;
      }

      // Fallback for browsers with showSaveFilePicker
      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: this.filename,
          types: [{ description: 'Text File', accept: { 'text/plain': ['.txt'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(contentToSave);
        await writable.close();
        this.notify('Saved file successfully.');
        return;
      }

      // Final fallback: download anchor
      const blob = new Blob([contentToSave], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.filename;
      a.click();
      URL.revokeObjectURL(url);
      this.notify('Downloaded junk.txt.');
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error(e);
        this.notify('Save error: ' + e.message, true);
        this.statusMsg.textContent = '❌ Save error: ' + e.message;
      } else {
        this.statusMsg.textContent = 'Save cancelled.';
      }
    }
  }

  _updateStats() {
    if (!this.editor) return;
    const lines = this.editor.lineCount();
    const chars = this.editor.getValue().length;
    this.statsDisplay.textContent = `Lines: ${lines} | Chars: ${chars}`;
  }

  notify(msg, isError = false) {
    const existing = document.querySelector('.junk-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'junk-toast';
    if (isError) {
      toast.style.borderColor = '#f85149';
      toast.style.color = '#ff7b72';
    } else {
      toast.style.borderColor = '#388bfd';
      toast.style.color = '#79c0ff';
    }
    toast.textContent = msg;
    this.container.appendChild(toast);
    setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, 3200);
  }

  destroy() {
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    if (this.editor) {
      this.editor = null;
    }
  }
}

globalThis.Junk = Junk;
if (typeof module !== 'undefined' && module.exports) module.exports = Junk;