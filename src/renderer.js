const { ipcRenderer, contextBridge } = require('electron');

// 在文件开头添加标签相关变量
let tags = [];

// 添加选中的标签数组
let selectedTags = [];

// 显示剪贴板列表
function displayClipboardHistory(history) {
    const clipboardList = document.getElementById('clipboard-list');
    clipboardList.innerHTML = '';
    
    history.forEach((item, index) => {
        const itemElement = document.createElement('div');
        itemElement.className = 'clipboard-item';
        itemElement.draggable = true;
        itemElement.setAttribute('data-index', index.toString());
        
        // 创建标签容器
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'tags';
        
        // 显示标签
        if (item.tag) {
            const tagInfo = tags.find(t => t.name === item.tag);
            if (tagInfo) {
                const tagElement = document.createElement('div');
                tagElement.className = 'tag-badge';
                tagElement.style.backgroundColor = tagInfo.color;
                tagElement.textContent = item.tag;
                tagsContainer.appendChild(tagElement);
            }
        }
        
        const content = document.createElement('div');
        content.className = 'clipboard-content';

        if (item.type === 'image') {
            const img = document.createElement('img');
            img.src = item.content;
            img.className = 'clipboard-image';
            img.draggable = false;
            content.appendChild(img);
        } else {
            content.textContent = item.content;
        }
        
        const time = document.createElement('div');
        time.className = 'clipboard-time';
        time.textContent = new Date(item.timestamp).toLocaleString();
        
        itemElement.appendChild(tagsContainer);
        itemElement.appendChild(content);
        itemElement.appendChild(time);
        
        // 左键点击复制
        itemElement.addEventListener('click', () => {
            ipcRenderer.send('copy-to-clipboard', item);
            displayCopiedMessage(item.type === 'image' ? '已复制图片到剪贴板' : '已复制文本到剪贴板');
        });

        // 右键菜单
        itemElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(itemElement, index);
        });

        // 拖拽相关事件
        itemElement.addEventListener('dragstart', handleDragStart);
        itemElement.addEventListener('dragend', handleDragEnd);
        itemElement.addEventListener('dragover', handleDragOver);
        itemElement.addEventListener('drop', handleDrop);
        
        clipboardList.appendChild(itemElement);
    });
    
    // 应用当前的筛选条件
    filterClipboardItems();
}

// 拖拽状态变量
let draggedItem = null;
let draggedIndex = null;

// 处理拖拽开始
function handleDragStart(e) {
    draggedItem = this;
    draggedIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    
    // 设置拖拽效果
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // 必须调用 setData 来启用拖放
}

// 处理拖拽结束
function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedItem = null;
    draggedIndex = null;
    
    // 移除所有拖拽相关的临时样式
    document.querySelectorAll('.clipboard-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

// 处理拖拽经过
function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault(); // 允许放置
    }
    
    if (this !== draggedItem) {
        this.classList.add('drag-over');
    }
    
    return false;
}

// 处理放置
function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    
    if (this !== draggedItem) {
        const dropIndex = parseInt(this.dataset.index);
        this.classList.remove('drag-over');
        
        // 发送重排序请求到主进程
        ipcRenderer.send('reorder-items', {
            fromIndex: draggedIndex,
            toIndex: dropIndex
        });
    }
    
    return false;
}

// 显示删除确认菜单
function showContextMenu(element, index) {
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    
    const rect = element.getBoundingClientRect();
    contextMenu.style.top = `${rect.top}px`;
    contextMenu.style.left = `${rect.left}px`;
    
    // 添加标签选项
    const addTagOption = document.createElement('div');
    addTagOption.className = 'menu-item';
    addTagOption.innerHTML = `
        <span>添加标签</span>
        <div class="submenu">
            ${tags.map(tag => `
                <div class="submenu-item" data-tag="${tag.name}" style="color: ${tag.color}">
                    <span class="tag-indicator" style="background-color: ${tag.color}"></span>
                    ${tag.name}
                </div>
            `).join('')}
        </div>
    `;
    
    // 修改删除选项的处理
    const deleteOption = document.createElement('div');
    deleteOption.className = 'menu-item delete';
    deleteOption.textContent = '删除';
    deleteOption.onclick = () => {
        const currentIndex = parseInt(element.dataset.index);
        console.log('Attempting to delete item at index:', currentIndex);
        
        if (!isNaN(currentIndex)) {
            // 发送删除请求到主进程
            ipcRenderer.send('delete-item', currentIndex);
            
            // 移除右键菜单
            contextMenu.remove();
            
            // 移除元素
            element.remove();
        }
    };
    
    contextMenu.appendChild(addTagOption);
    contextMenu.appendChild(deleteOption);
    document.body.appendChild(contextMenu);

    // 添加标签点击事件
    contextMenu.querySelectorAll('.submenu-item').forEach(item => {
        item.addEventListener('click', () => {
            const tagName = item.dataset.tag;
            ipcRenderer.send('update-item-tag', { index, tagName });
            contextMenu.remove();
            displayCopiedMessage(`已添加标签: ${tagName}`);
        });
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', function closeMenu(e) {
        if (!contextMenu.contains(e.target)) {
            contextMenu.remove();
            document.removeEventListener('click', closeMenu);
        }
    });
}

// 监听剪贴板更新
ipcRenderer.on('clipboard-update', (event, history) => {
    console.log('Received clipboard update, new length:', history.length);
    displayClipboardHistory(history);
});

// 显示复制成功的卡片提示
function displayCopiedMessage(message) {
    const messageCard = document.createElement('div');
    messageCard.className = 'message-card';
    messageCard.textContent = message;
    
    document.body.appendChild(messageCard);

    setTimeout(() => {
        messageCard.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(messageCard);
        }, 300);
    }, 3000);
}

// 初始化标签功能
function initializeTags() {
    // 从存储中加载标签
    ipcRenderer.send('get-tags');
    
    // 添加新标签按钮事件
    const addTagBtn = document.getElementById('add-tag-btn');
    if (addTagBtn) {
        addTagBtn.addEventListener('click', () => showTagInput());
    }
    
    // 标签容器的拖拽事件
    const tagsContainer = document.getElementById('tags-container');
    if (tagsContainer) {
        tagsContainer.addEventListener('dragover', handleTagDragOver);
        tagsContainer.addEventListener('drop', handleTagDrop);
    }
}

// 显示标签输入框
function showTagInput(existingTag = null) {
    const colors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'];
    
    const container = document.createElement('div');
    container.className = 'tag-input-container';
    
    container.innerHTML = `
        <h3>${existingTag ? '编辑标签' : '新建标签'}</h3>
        <input type="text" placeholder="输入标签名称" value="${existingTag ? existingTag.name : ''}" />
        <div class="color-picker">
            ${colors.map(color => `
                <div class="color-option ${existingTag && existingTag.color === color ? 'selected' : ''}" 
                     style="background-color: ${color}" 
                     data-color="${color}"></div>
            `).join('')}
        </div>
        <div class="tag-input-buttons">
            <button class="cancel">取消</button>
            <button class="confirm">${existingTag ? '保存' : '确定'}</button>
        </div>
    `;
    
    document.body.appendChild(container);

    // 默认选中第一个颜色
    if (!existingTag) {
        container.querySelector('.color-option').classList.add('selected');
    }
    
    // 颜色选择
    let selectedColor = existingTag ? existingTag.color : colors[0];
    container.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            container.querySelector('.color-option.selected')?.classList.remove('selected');
            option.classList.add('selected');
            selectedColor = option.dataset.color;
        });
    });
    
    // 按钮事件
    container.querySelector('.cancel').addEventListener('click', () => container.remove());
    container.querySelector('.confirm').addEventListener('click', () => {
        const name = container.querySelector('input').value.trim();
        if (name) {
            const tagData = { name, color: selectedColor };
            if (existingTag) {
                ipcRenderer.send('edit-tag', { oldName: existingTag.name, newTag: tagData });
            } else {
                ipcRenderer.send('add-tag', tagData);
            }
            container.remove();
        }
    });

    // 聚焦输入框
    container.querySelector('input').focus();

    // 添加回车键确认功能
    container.querySelector('input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            container.querySelector('.confirm').click();
        }
    });
}

// 显示标签列表
function displayTags(tagsList) {
    tags = tagsList;
    const container = document.getElementById('tags-container');
    const activeTagsContainer = document.querySelector('.active-tags');
    
    // 显示活动标签
    if (selectedTags.length > 0) {
        activeTagsContainer.innerHTML = selectedTags.map(tagName => {
            const tag = tags.find(t => t.name === tagName);
            return `
                <div class="active-tag" style="background-color: ${tag.color}">
                    ${tag.name}
                    <span class="remove" data-tag="${tag.name}">×</span>
                </div>
            `;
        }).join('');

        // 添加单个标签移除事件
        activeTagsContainer.querySelectorAll('.remove').forEach(removeBtn => {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagName = removeBtn.dataset.tag;
                selectedTags = selectedTags.filter(t => t !== tagName);
                displayTags(tags);
                filterClipboardItems();
            });
        });
    } else {
        activeTagsContainer.innerHTML = ''; // 没有选中的标签时清空
    }
    
    // 显示可选标签
    container.innerHTML = tags.map(tag => `
        <div class="tag-item ${selectedTags.includes(tag.name) ? 'selected' : ''}"
             style="color: ${tag.color}; border-color: ${tag.color}"
             data-tag="${tag.name}">
            <span class="tag-name">${tag.name}</span>
            <div class="tag-actions">
                <span class="tag-edit" title="编辑">✎</span>
                <span class="tag-delete" title="删除">×</span>
            </div>
        </div>
    `).join('');
    
    // 添加标签点击事件
    container.querySelectorAll('.tag-item').forEach(tagElement => {
        // 标签选择事件
        tagElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tag-actions')) {
                const tagName = tagElement.dataset.tag;
                if (selectedTags.includes(tagName)) {
                    selectedTags = selectedTags.filter(t => t !== tagName);
                } else {
                    selectedTags.push(tagName);
                }
                displayTags(tags);
                filterClipboardItems();
            }
        });

        // 编辑按钮事件
        tagElement.querySelector('.tag-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            const tagName = tagElement.dataset.tag;
            const tag = tags.find(t => t.name === tagName);
            showTagInput(tag); // 传入现有标签进行编辑
        });

        // 删除按钮事件
        tagElement.querySelector('.tag-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            const tagName = tagElement.dataset.tag;
            showDeleteTagConfirm(tagName);
        });
    });
}

// 处理拖拽到标签的事件
function handleTagDragOver(e) {
    e.preventDefault();
    const tagItem = e.target.closest('.tag-item');
    if (tagItem) {
        tagItem.classList.add('drag-over');
    }
}

function handleTagDrop(e) {
    e.preventDefault();
    const tagItem = e.target.closest('.tag-item');
    if (tagItem && draggedIndex !== null) {
        tagItem.classList.remove('drag-over');
        const tagName = tagItem.dataset.tag;
        
        ipcRenderer.send('update-item-tag', { 
            index: draggedIndex, 
            tagName 
        });
        displayCopiedMessage(`已添加标签: ${tagName}`);
    }
}

// 监听标签相关的IPC消息
ipcRenderer.on('tags-updated', (event, tagsList) => {
    displayTags(tagsList);
});

// 添加筛选功能
function filterClipboardItems() {
    const items = document.querySelectorAll('.clipboard-item');
    if (selectedTags.length === 0) {
        items.forEach(item => item.style.display = '');
        return;
    }
    
    items.forEach(item => {
        const itemTags = Array.from(item.querySelectorAll('.tag-badge'))
            .map(badge => badge.textContent);
        const hasSelectedTag = selectedTags.some(tag => itemTags.includes(tag));
        item.style.display = hasSelectedTag ? '' : 'none';
    });
}

// 添加删除标签确认对话框
function showDeleteTagConfirm(tagName) {
    const container = document.createElement('div');
    container.className = 'delete-tag-confirm';
    
    container.innerHTML = `
        <div class="delete-tag-content">
            <h3>除标签</h3>
            <p>确定要删除标签 "${tagName}" 吗？</p>
            <div class="delete-tag-buttons">
                <button class="cancel">取消</button>
                <button class="confirm">删除</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(container);
    
    container.querySelector('.cancel').addEventListener('click', () => container.remove());
    container.querySelector('.confirm').addEventListener('click', () => {
        ipcRenderer.send('delete-tag', tagName);
        container.remove();
    });
}

// 确保在 DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeTags();
}); 