const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({
    name: 'clipboard-data',
    defaults: {
        clipboardHistory: [],
        tags: []
    }
});
let mainWindow;
let clipboardHistory = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('src/index.html');
  
  // 从存储中加载历史记录
  clipboardHistory = store.get('clipboardHistory', []) || [];
  
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('clipboard-update', clipboardHistory);
  });
  
  // 监听剪贴板变化
  setInterval(() => {
    let hasNewContent = false;

    // 先检查文本
    const text = clipboard.readText().trim();
    if (text && !clipboardHistory.some(item => item.type === 'text' && item.content === text)) {
      clipboardHistory.unshift({
        type: 'text',
        content: text,
        timestamp: Date.now()
      });
      hasNewContent = true;
    }

    // 如果没有新本，再检查图片
    if (!hasNewContent) {
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        const imageData = image.toDataURL();
        if (!clipboardHistory.some(item => item.type === 'image' && item.content === imageData)) {
          clipboardHistory.unshift({
            type: 'image',
            content: imageData,
            timestamp: Date.now()
          });
          hasNewContent = true;
        }
      }
    }

    // 如果有新内容，更新UI和存储
    if (hasNewContent) {
      // 限制历史记录数量
      if (clipboardHistory.length > 50) {
        clipboardHistory = clipboardHistory.slice(0, 50);
      }

      mainWindow.webContents.send('clipboard-update', clipboardHistory);
      store.set('clipboardHistory', clipboardHistory);
    }
  }, 1000);
}

app.whenReady().then(() => {
  createWindow();
  
  // 注册快捷键
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    mainWindow.show();
  });
});

// IPC 通信处理
ipcMain.on('copy-to-clipboard', (event, item) => {
  try {
    if (item.type === 'image') {
      const image = nativeImage.createFromDataURL(item.content);
      clipboard.writeImage(image);
    } else {
      clipboard.writeText(item.content);
    }
  } catch (error) {
    console.error('复制到剪贴板失败:', error);
    mainWindow.webContents.send('show-message', '复制失败，请重试');
  }
});

// 修改删除处理部分
ipcMain.on('delete-item', (event, index) => {
    console.log('Attempting to delete item at index:', index);
    console.log('Before deletion:', clipboardHistory.length);
    
    if (typeof index === 'number' && index >= 0 && index < clipboardHistory.length) {
        // 删除指定索引的项目
        clipboardHistory.splice(index, 1);
        
        // 保存到存储
        store.set('clipboardHistory', clipboardHistory);
        
        console.log('After deletion:', clipboardHistory.length);
        
        // 发送更新后的数据到渲染进程
        event.reply('clipboard-update', clipboardHistory);
    } else {
        console.log('Invalid index for deletion:', index);
    }
});

// 处理重排序请求
ipcMain.on('reorder-items', (event, {fromIndex, toIndex}) => {
    // 获取要移动的项目
    const item = clipboardHistory[fromIndex];
    
    // 从原位置删除
    clipboardHistory.splice(fromIndex, 1);
    // 插入到新位置
    clipboardHistory.splice(toIndex, 0, item);
    
    // 更新存储
    store.set('clipboardHistory', clipboardHistory);
    // 通知渲染进程更新界面
    mainWindow.webContents.send('clipboard-update', clipboardHistory);
});

// 获取标签
ipcMain.on('get-tags', (event) => {
    const tags = store.get('tags', []);
    mainWindow.webContents.send('tags-updated', tags);
});

// 添加标签
ipcMain.on('add-tag', (event, tag) => {
    const tags = store.get('tags', []);
    tags.push(tag);
    store.set('tags', tags);
    mainWindow.webContents.send('tags-updated', tags);
});

// 删除标签
ipcMain.on('delete-tag', (event, tagName) => {
    let tags = store.get('tags', []);
    tags = tags.filter(t => t.name !== tagName);
    store.set('tags', tags);
    
    // 同时移除相关项目的标签
    clipboardHistory = clipboardHistory.map(item => {
        if (item.tag === tagName) {
            delete item.tag;
        }
        return item;
    });
    store.set('clipboardHistory', clipboardHistory);
    
    mainWindow.webContents.send('tags-updated', tags);
    mainWindow.webContents.send('clipboard-update', clipboardHistory);
});

// 更新项目标签
ipcMain.on('update-item-tag', (event, {index, tagName}) => {
    if (index >= 0 && index < clipboardHistory.length) {
        // 如果已经有这个标签就移除，否则添加
        if (clipboardHistory[index].tag === tagName) {
            delete clipboardHistory[index].tag;
        } else {
            clipboardHistory[index].tag = tagName;
        }
        store.set('clipboardHistory', clipboardHistory);
        mainWindow.webContents.send('clipboard-update', clipboardHistory);
    }
});

// 添加编辑标签的处理
ipcMain.on('edit-tag', (event, {oldName, newTag}) => {
    let tags = store.get('tags', []);
    const index = tags.findIndex(t => t.name === oldName);
    if (index !== -1) {
        tags[index] = newTag;
        store.set('tags', tags);
        
        // 更新使用该标签的项目
        clipboardHistory = clipboardHistory.map(item => {
            if (item.tag === oldName) {
                item.tag = newTag.name;
            }
            return item;
        });
        store.set('clipboardHistory', clipboardHistory);
        
        mainWindow.webContents.send('tags-updated', tags);
        mainWindow.webContents.send('clipboard-update', clipboardHistory);
    }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
  