let referenceImageBase64 = null;
let referenceImageFile = null;
let generatedImageBase64 = null;
let generatedImageFormat = 'png';
let isGenerating = false;
let pendingClearAction = null;

function getStoredTheme() {
    try {
        return localStorage.getItem('gpt_image_theme') || 'auto';
    } catch (e) {
        return 'auto';
    }
}

function applyTheme() {
    const stored = getStoredTheme();
    const effective = stored === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : stored;
    document.documentElement.setAttribute('data-theme', effective);
    const select = document.getElementById('themeSelect');
    if (select) select.value = stored;
}

function setTheme(theme) {
    try {
        localStorage.setItem('gpt_image_theme', theme);
    } catch (e) {}
    applyTheme();
}

const darkModeMq = window.matchMedia('(prefers-color-scheme: dark)');
const darkModeListener = () => {
    if (getStoredTheme() === 'auto') applyTheme();
};
if (darkModeMq.addEventListener) {
    darkModeMq.addEventListener('change', darkModeListener);
} else if (darkModeMq.addListener) {
    darkModeMq.addListener(darkModeListener);
}

function toggleAdvanced() {
    const toggle = document.querySelector('.advanced-toggle');
    const panel = document.getElementById('advancedPanel');
    const clip = panel.querySelector('.advanced-panel-clip');
    const willOpen = !panel.classList.contains('open');
    toggle.classList.toggle('open', willOpen);
    panel.classList.toggle('open', willOpen);
    clearTimeout(panel._ovfTimer);
    if (willOpen) {
        // 展开动画结束后放开溢出，让 tooltip 能显示在面板之外
        panel._ovfTimer = setTimeout(() => {
            if (panel.classList.contains('open')) clip.style.overflow = 'visible';
        }, 260);
    } else {
        // 收起前立即恢复裁剪，保证收回动画平滑
        clip.style.overflow = '';
    }
}

const resolutionMap = {
    '1:1': [
        { value: '1024x1024', label: '1K · 1024×1024' },
        { value: '2048x2048', label: '2K · 2048×2048 (实验性)' }
    ],
    '3:2': [
        { value: '1536x1024', label: '1K · 1536×1024' },
        { value: '3072x2048', label: '2K · 3072×2048 (实验性)' },
        { value: '3456x2304', label: '4K · 3456×2304 (实验性)' }
    ],
    '2:3': [
        { value: '1024x1536', label: '1K · 1024×1536' },
        { value: '2048x3072', label: '2K · 2048×3072 (实验性)' },
        { value: '2304x3456', label: '4K · 2304×3456 (实验性)' }
    ],
    '16:9': [
        { value: '1280x720', label: '1K · 1280×720' },
        { value: '2048x1152', label: '2K · 2048×1152' },
        { value: '3840x2160', label: '4K · 3840×2160 (实验性)' }
    ],
    '9:16': [
        { value: '720x1280', label: '1K · 720×1280' },
        { value: '1152x2048', label: '2K · 1152×2048' },
        { value: '2160x3840', label: '4K · 2160×3840 (实验性)' }
    ],
    'auto': [
        { value: 'auto', label: '自动' }
    ]
};

function updateResolutions() {
    const aspect = document.getElementById('aspectSelect').value;
    const sizeSelect = document.getElementById('sizeSelect');
    const options = resolutionMap[aspect];
    sizeSelect.innerHTML = '';
    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        sizeSelect.appendChild(el);
    });
}

function getAdvancedParams() {
    const outputFormat = document.getElementById('outputFormat').value;
    return {
        model: document.getElementById('modelSelect').value,
        size: document.getElementById('sizeSelect').value,
        quality: document.getElementById('qualitySelect').value,
        output_format: outputFormat,
        output_compression: outputFormat === 'png'
            ? null
            : Number(document.getElementById('outputCompression').value),
        moderation: document.getElementById('moderationSelect').value,
        background: document.getElementById('backgroundSelect').value
    };
}

function updateCompressionControl() {
    syncTransparentFormat();
    const enabled = document.getElementById('outputFormat').value !== 'png';
    const control = document.getElementById('compressionControl');
    document.getElementById('outputCompression').disabled = !enabled;
    control.classList.toggle('is-disabled', !enabled);
}

// Transparency is only produced with an alpha-capable container (PNG/WebP).
function syncTransparentFormat() {
    const transparent = document.getElementById('backgroundSelect').value === 'transparent';
    const formatSelect = document.getElementById('outputFormat');
    formatSelect.querySelector('option[value="jpeg"]').disabled = transparent;
    if (transparent && formatSelect.value === 'jpeg') {
        formatSelect.value = 'png';
    }
}

function updateBackgroundControl() {
    updateCompressionControl();
}

function loadSettings() {
    let url = '', token = '';
    try {
        url = localStorage.getItem('gpt_image_api_url') || '';
        token = localStorage.getItem('gpt_image_api_token') || '';
    } catch (e) {}
    document.getElementById('apiUrl').value = url;
    document.getElementById('apiToken').value = token;
}

function openSettings() {
    loadSettings();
    document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function saveSettings() {
    const url = document.getElementById('apiUrl').value.trim();
    const token = document.getElementById('apiToken').value.trim();
    localStorage.setItem('gpt_image_api_url', url);
    localStorage.setItem('gpt_image_api_token', token);
    closeSettings();
}

function uploadReference() {
    if (isGenerating) return;
    document.getElementById('fileInput').click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    loadImageFile(file);
    event.target.value = '';
}

function loadImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    referenceImageFile = file;
    const reader = new FileReader();
    reader.onload = function(e) {
        referenceImageBase64 = e.target.result.split(',')[1];
        document.getElementById('refBadge').style.display = 'block';

        const img = document.getElementById('resultImage');
        img.src = e.target.result;
        img.style.display = 'block';
        document.getElementById('placeholder').style.display = 'none';
        document.getElementById('clearBtn').disabled = false;
    };
    reader.readAsDataURL(file);
}

async function copyImageToClipboard() {
    const img = document.getElementById('resultImage');
    if (!img.src || img.style.display === 'none') return;
    try {
        const resp = await fetch(img.src);
        let blob = await resp.blob();
        if (blob.type !== 'image/png') {
            blob = await convertToPng(blob);
        }
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]);
    } catch (err) {
        console.error('复制失败:', err);
    }
}

function convertToPng(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            canvas.getContext('2d').drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('转换失败')), 'image/png');
        };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
        image.src = url;
    });
}

function setupImageViewerEvents() {
    const viewer = document.getElementById('imageViewer');
    let mouseInside = false;

    viewer.addEventListener('mouseenter', () => { mouseInside = true; });
    viewer.addEventListener('mouseleave', () => { mouseInside = false; });

    document.addEventListener('paste', (e) => {
        if (!mouseInside || isGenerating) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    loadImageFile(file);
                    return;
                }
            }
        }
    });

    document.addEventListener('copy', (e) => {
        if (!mouseInside) return;
        const img = document.getElementById('resultImage');
        if (!img.src || img.style.display === 'none') return;
        e.preventDefault();
        copyImageToClipboard();
    });

    viewer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isGenerating) return;
        viewer.classList.add('drag-over');
    });

    viewer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === viewer) {
            viewer.classList.remove('drag-over');
        }
    });

    viewer.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        viewer.classList.remove('drag-over');
        if (isGenerating) return;
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            loadImageFile(files[0]);
        }
    });
}

function removeReference(event) {
    event.stopPropagation();
    referenceImageBase64 = null;
    referenceImageFile = null;
    document.getElementById('refBadge').style.display = 'none';

    if (!generatedImageBase64) {
        document.getElementById('resultImage').style.display = 'none';
        document.getElementById('placeholder').style.display = 'block';
    } else {
        const img = document.getElementById('resultImage');
        img.src = 'data:' + getImageMime(generatedImageFormat) + ';base64,' + generatedImageBase64;
    }
}

function getImageMime(format) {
    return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
}

// 加载动画配置
const loadingAnimations = [
    {
        name: 'particles',
        html: '<div class="particle"></div>'.repeat(8)
    },
    {
        name: 'neon',
        html: '<div class="neon-ring"></div>'.repeat(3)
    },
    {
        name: 'dna',
        html: '<div class="dna-strand"></div>'.repeat(6)
    },
    {
        name: 'geometry',
        html: '<div class="geo-shape"></div>'.repeat(3)
    },
    {
        name: 'quantum',
        html: '<div class="quantum-dot"></div>'.repeat(5)
    },
    {
        name: 'vortex',
        html: '<div class="vortex-star"></div>'.repeat(8)
    }
];

function setRandomLoadingAnimation() {
    const animContainer = document.getElementById('generationAnimation');
    const randomAnim = loadingAnimations[Math.floor(Math.random() * loadingAnimations.length)];
    animContainer.className = 'generation-animation anim-' + randomAnim.name;
    animContainer.innerHTML = randomAnim.html;
}

async function generate() {
    const baseUrl = localStorage.getItem('gpt_image_api_url');
    const token = localStorage.getItem('gpt_image_api_token');

    if (!baseUrl || !token) {
        openSettings();
        alert('请先设置 API URL 和 Token');
        return;
    }

    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
        alert('请输入提示词');
        return;
    }

    const params = getAdvancedParams();
    const sendBtn = document.getElementById('sendBtn');
    const loading = document.getElementById('loading');
    const img = document.getElementById('resultImage');
    const previousImageState = {
        src: img.src,
        display: img.style.display,
        placeholderDisplay: document.getElementById('placeholder').style.display
    };

    isGenerating = true;
    sendBtn.disabled = true;
    setRandomLoadingAnimation();
    loading.classList.add('active');
    const startTime = Date.now();

    try {
        let response;
        const hasReference = referenceImageBase64 || generatedImageBase64;

        if (hasReference) {
            response = await callImageEdit(baseUrl, token, prompt, params);
        } else {
            response = await callImageGeneration(baseUrl, token, prompt, params);
        }

        const elapsedMs = Date.now() - startTime;
        const result = response && response.data && response.data[0] && response.data[0].b64_json;
        if (!result) throw new Error('接口未返回图像数据');

        generatedImageBase64 = result;
        generatedImageFormat = params.output_format;
        img.src = 'data:' + getImageMime(generatedImageFormat) + ';base64,' + result;
        img.style.display = 'block';
        document.getElementById('placeholder').style.display = 'none';
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('clearBtn').disabled = false;

        referenceImageBase64 = null;
        referenceImageFile = null;
        document.getElementById('refBadge').style.display = 'none';

        showInfoModal(elapsedMs);

    } catch (err) {
        img.src = previousImageState.src;
        img.style.display = previousImageState.display;
        document.getElementById('placeholder').style.display = previousImageState.placeholderDisplay;
        alert('生成失败: ' + err.message);
    } finally {
        isGenerating = false;
        sendBtn.disabled = false;
        loading.classList.remove('active');
    }
}

function formatElapsed(ms) {
    const totalTenths = Math.round(ms / 100);
    const minutes = Math.floor(totalTenths / 600);
    const remainingTenths = totalTenths - minutes * 600;
    const seconds = Math.floor(remainingTenths / 10);
    const tenths = remainingTenths % 10;
    const secStr = seconds + '.' + tenths + '秒';
    return minutes > 0 ? minutes + '分' + secStr : secStr;
}

function showInfoModal(elapsedMs) {
    document.getElementById('infoTime').innerHTML =
        '这张图片花了 <strong>' + formatElapsed(elapsedMs) + '</strong> 生成';
    document.getElementById('infoModal').classList.add('active');
}

function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('active');
}

function appendOptionalImageParams(target, params) {
    if (params.output_compression !== null) {
        target.output_compression = params.output_compression;
    }
    if (params.background && params.background !== 'auto') {
        target.background = params.background;
    }
    return target;
}

async function fetchImageRequest(url, token, init) {
    const resp = await fetch(url, init);
    if (!resp.ok) throw new Error(await resp.text());
    return await resp.json();
}

async function callImageGeneration(baseUrl, token, prompt, params) {
    const url = baseUrl.replace(/\/$/, '') + '/images/generations';
    const body = appendOptionalImageParams({
        model: params.model,
        prompt: prompt,
        n: 1,
        size: params.size,
        quality: params.quality,
        output_format: params.output_format,
        moderation: params.moderation
    }, params);

    return await fetchImageRequest(url, token, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(body)
    });
}

async function callImageEdit(baseUrl, token, prompt, params) {
    const url = baseUrl.replace(/\/$/, '') + '/images/edits';

    const formData = new FormData();
    formData.append('model', params.model);
    formData.append('prompt', prompt);
    formData.append('n', '1');
    formData.append('size', params.size);
    formData.append('quality', params.quality);
    formData.append('output_format', params.output_format);
    formData.append('moderation', params.moderation);
    if (params.output_compression !== null) {
        formData.append('output_compression', String(params.output_compression));
    }
    if (params.background && params.background !== 'auto') {
        formData.append('background', params.background);
    }

    let imageToSend;
    if (referenceImageFile) {
        imageToSend = referenceImageFile;
    } else if (referenceImageBase64) {
        imageToSend = base64ToFile(referenceImageBase64, 'reference.png');
    } else if (generatedImageBase64) {
        imageToSend = base64ToFile(generatedImageBase64, 'generated.png');
    }

    if (imageToSend) {
        formData.append('image[]', imageToSend);
    }

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        body: formData
    });

    if (!resp.ok) throw new Error(await resp.text());
    return await resp.json();
}

function base64ToFile(base64, filename) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new File([byteArray], filename, { type: 'image/png' });
}

function clearPrompt() {
    const promptInput = document.getElementById('promptInput');
    if (!promptInput.value) return;
    openClearConfirm('清除提示词', '确定要清除当前提示词吗？此操作无法撤销。', () => {
        promptInput.value = '';
        promptInput.focus();
    });
}

function confirmClearImage() {
    openClearConfirm('清除图片', '确定要清除当前图片和参考图吗？此操作无法撤销。', clearImage);
}

function openClearConfirm(title, msg, action) {
    pendingClearAction = action;
    document.getElementById('clearConfirmTitle').textContent = title;
    document.getElementById('clearConfirmMsg').textContent = msg;
    document.getElementById('clearConfirmModal').classList.add('active');
}

function closeClearConfirm() {
    pendingClearAction = null;
    document.getElementById('clearConfirmModal').classList.remove('active');
}

function confirmClearAction() {
    const action = pendingClearAction;
    closeClearConfirm();
    if (typeof action === 'function') action();
}

function clearImage() {
    referenceImageBase64 = null;
    referenceImageFile = null;
    generatedImageBase64 = null;
    generatedImageFormat = 'png';
    const img = document.getElementById('resultImage');
    img.src = '';
    img.style.display = 'none';
    document.getElementById('placeholder').style.display = 'block';
    document.getElementById('refBadge').style.display = 'none';
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('clearBtn').disabled = true;
}

function base64ToBlob(base64, mime) {
    const byteChars = atob(base64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    return new Blob([byteArray], { type: mime });
}

async function downloadImage() {
    if (!generatedImageBase64) return;
    const fmt = generatedImageFormat || document.getElementById('outputFormat').value;
    const mime = getImageMime(fmt);
    const ext = fmt === 'jpeg' ? 'jpg' : fmt;
    const filename = 'gpt-image-2.5-' + Date.now() + '.' + ext;
    const blob = base64ToBlob(generatedImageBase64, mime);

    // iOS Safari/Chrome do not reliably honor `download` on data URLs.
    // The native share sheet provides the system Save Image action.
    if (navigator.share && navigator.canShare) {
        try {
            const file = new File([blob], filename, { type: mime });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: filename });
                return;
            }
        } catch (err) {
            if (err && err.name === 'AbortError') return;
        }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Keep the object URL alive long enough for iOS and desktop download managers.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ---------- 收藏夹 ---------- */
const FAV_KEY = 'gpt_image_favorites';
let favorites = [];
let favSortMode = false;
let favDragEl = null;
let favDragGhost = null;
let favDragPointerId = null;
let favDragOffsetX = 0;
let favDragOffsetY = 0;
let favDragLastY = 0;
let favDragHandle = null;
let favAutoScrollRAF = null;
let pendingImport = null;
let pendingDeleteIndex = null;

function loadFavorites() {
    try {
        const raw = localStorage.getItem(FAV_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        favorites = Array.isArray(parsed) ? parsed.filter(isValidFav) : [];
    } catch (e) {
        favorites = [];
    }
}

function isValidFav(item) {
    return item && typeof item === 'object'
        && typeof item.title === 'string'
        && typeof item.prompt === 'string';
}

function saveFavorites() {
    try {
        localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
    } catch (e) {
        favAlert('保存失败', '收藏保存失败：' + escapeHtml(e.message));
    }
}

function favAlert(title, msgHtml) {
    document.getElementById('favAlertTitle').textContent = title;
    document.getElementById('favAlertMsg').innerHTML = msgHtml;
    document.getElementById('favAlertModal').classList.add('active');
}

function closeFavAlert() {
    document.getElementById('favAlertModal').classList.remove('active');
}

function openFavorites() {
    favSortMode = false;
    document.getElementById('favSortBtn').classList.remove('active');
    document.getElementById('favSearch').value = '';
    document.getElementById('favModal').classList.add('active');
    renderFavorites();
}

function closeFavorites() {
    finishFavDrag(true);
    document.getElementById('favModal').classList.remove('active');
}

function toggleSortMode() {
    finishFavDrag(true);
    favSortMode = !favSortMode;
    document.getElementById('favSortBtn').classList.toggle('active', favSortMode);
    renderFavorites();
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let result = '';
    let pos = 0;
    let idx;
    while ((idx = lower.indexOf(q, pos)) !== -1) {
        result += escapeHtml(text.slice(pos, idx));
        result += '<span class="fav-hl">' + escapeHtml(text.slice(idx, idx + query.length)) + '</span>';
        pos = idx + query.length;
    }
    result += escapeHtml(text.slice(pos));
    return result;
}

function makePreview(prompt) {
    const flat = prompt.replace(/\s+/g, ' ').trim();
    return flat.length > 50 ? flat.slice(0, 50) + '…' : flat;
}

function renderFavorites() {
    finishFavDrag(false);
    const list = document.getElementById('favList');
    const box = document.querySelector('.fav-modal-box');
    const query = document.getElementById('favSearch').value.trim();
    const q = query.toLowerCase();

    box.classList.toggle('is-sorting', favSortMode);

    const matches = favorites
        .map((fav, index) => ({ fav, index }))
        .filter(({ fav }) => !q
            || fav.title.toLowerCase().includes(q)
            || fav.prompt.toLowerCase().includes(q));

    if (matches.length === 0) {
        list.innerHTML = '<div class="fav-empty">' +
            (favorites.length === 0 ? '还没有收藏，点击下方「创建」保存当前提示词。' : '没有匹配的收藏。') +
            '</div>';
        updateFavFade();
        return;
    }

    list.innerHTML = '';
    matches.forEach(({ fav, index }) => {
        const item = document.createElement('div');
        item.className = 'fav-item';
        item.dataset.index = index;

        const main = document.createElement('div');
        main.className = 'fav-item-main';
        main.innerHTML =
            '<div class="fav-item-title">' + highlight(fav.title, query) + '</div>' +
            '<div class="fav-item-preview">' + highlight(makePreview(fav.prompt), query) + '</div>';
        if (!favSortMode) main.onclick = () => applyFavorite(index);
        item.appendChild(main);

        const actionBtn = document.createElement('button');
        if (favSortMode) {
            actionBtn.className = 'fav-action-btn fav-drag-btn';
            actionBtn.innerHTML = '&#9776;';
            actionBtn.title = '拖动排序';
            attachDragHandlers(actionBtn, item);
        } else {
            actionBtn.className = 'fav-action-btn fav-del-btn';
            actionBtn.innerHTML = '&#10005;';
            actionBtn.title = '删除';
            actionBtn.onclick = (e) => { e.stopPropagation(); deleteFavorite(index); };
        }
        item.appendChild(actionBtn);

        list.appendChild(item);
    });

    updateFavFade();
}

// 用 Pointer Events 实现拖动排序，统一支持鼠标与触屏（HTML5 拖放在移动端不触发）
function attachDragHandlers(handle, item) {
    handle.style.touchAction = 'none'; // 阻止触屏在手柄上的滚动/缩放手势
    handle.addEventListener('pointerdown', (e) => {
        if (favDragEl) return;
        e.preventDefault();
        startFavDrag(item, handle, e);
    });
}

function startFavDrag(item, handle, e) {
    favDragEl = item;
    favDragHandle = handle;
    favDragPointerId = e.pointerId;
    favDragLastY = e.clientY;

    const rect = item.getBoundingClientRect();
    favDragOffsetX = e.clientX - rect.left;
    favDragOffsetY = e.clientY - rect.top;

    // 跟随手指/光标的浮动副本
    favDragGhost = item.cloneNode(true);
    favDragGhost.classList.add('fav-drag-ghost');
    favDragGhost.style.width = rect.width + 'px';
    favDragGhost.style.height = rect.height + 'px';
    favDragGhost.style.left = rect.left + 'px';
    favDragGhost.style.top = rect.top + 'px';
    document.body.appendChild(favDragGhost);

    item.classList.add('fav-placeholder');

    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    window.addEventListener('pointermove', onFavDragMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onFavDragEnd, true);
    window.addEventListener('pointercancel', onFavDragEnd, true);
    window.addEventListener('blur', cancelFavDrag);
    document.addEventListener('visibilitychange', onFavVisibilityChange);
}

function onFavDragMove(e) {
    if (!favDragEl || e.pointerId !== favDragPointerId) return;
    e.preventDefault();
    favDragLastY = e.clientY;

    if (favDragGhost) {
        favDragGhost.style.left = (e.clientX - favDragOffsetX) + 'px';
        favDragGhost.style.top = (e.clientY - favDragOffsetY) + 'px';
    }

    reorderToPointer(e.clientY);
    handleFavAutoScroll(e.clientY);
}

function reorderToPointer(clientY) {
    const list = document.getElementById('favList');
    const after = getDragAfterElement(list, clientY);
    if (after == null) {
        if (list.lastElementChild !== favDragEl) {
            flipReorder(list, () => list.appendChild(favDragEl));
        }
    } else if (after !== favDragEl) {
        flipReorder(list, () => list.insertBefore(favDragEl, after));
    }
}

// 指针接近列表上/下边缘时自动滚动，方便在长列表中移动
function handleFavAutoScroll(clientY) {
    const list = document.getElementById('favList');
    const rect = list.getBoundingClientRect();
    const zone = 36;
    let speed = 0;
    if (clientY < rect.top + zone) {
        speed = -Math.ceil((rect.top + zone - clientY) / zone * 12);
    } else if (clientY > rect.bottom - zone) {
        speed = Math.ceil((clientY - (rect.bottom - zone)) / zone * 12);
    }
    if (speed === 0) {
        stopFavAutoScroll();
        return;
    }
    if (favAutoScrollRAF) return;
    const step = () => {
        if (!favDragEl) { stopFavAutoScroll(); return; }
        list.scrollTop += speed;
        reorderToPointer(favDragLastY);
        updateFavFade();
        favAutoScrollRAF = requestAnimationFrame(step);
    };
    favAutoScrollRAF = requestAnimationFrame(step);
}

function stopFavAutoScroll() {
    if (favAutoScrollRAF) {
        cancelAnimationFrame(favAutoScrollRAF);
        favAutoScrollRAF = null;
    }
}

function onFavDragEnd(e) {
    if (e.pointerId !== favDragPointerId) return;
    e.preventDefault();
    finishFavDrag(true);
}

function cancelFavDrag() {
    finishFavDrag(false);
}

function onFavVisibilityChange() {
    if (document.hidden) cancelFavDrag();
}

function finishFavDrag(commit) {
    if (!favDragEl && !favDragGhost && favDragPointerId === null) return;
    const handle = favDragHandle;
    const pointerId = favDragPointerId;

    window.removeEventListener('pointermove', onFavDragMove, true);
    window.removeEventListener('pointerup', onFavDragEnd, true);
    window.removeEventListener('pointercancel', onFavDragEnd, true);
    window.removeEventListener('blur', cancelFavDrag);
    document.removeEventListener('visibilitychange', onFavVisibilityChange);
    if (handle && pointerId !== null) {
        try { handle.releasePointerCapture(pointerId); } catch (err) {}
    }
    stopFavAutoScroll();
    if (favDragGhost) { favDragGhost.remove(); favDragGhost = null; }
    if (favDragEl) favDragEl.classList.remove('fav-placeholder');
    favDragEl = null;
    favDragPointerId = null;
    favDragHandle = null;
    if (commit) commitOrderFromDom();
}

// 用布局坐标（offsetTop/offsetHeight）做命中检测，避免被 FLIP 动画的
// transform 干扰——getBoundingClientRect 会返回动画途中的位置，导致来回抖动卡死。
function getDragAfterElement(list, clientY) {
    const listRect = list.getBoundingClientRect();
    const contentY = clientY - listRect.top + list.scrollTop;
    const items = [...list.querySelectorAll('.fav-item:not(.fav-placeholder)')];
    let closest = { offset: -Infinity, element: null };
    for (const child of items) {
        const mid = child.offsetTop + child.offsetHeight / 2;
        const offset = contentY - mid;
        if (offset < 0 && offset > closest.offset) {
            closest = { offset, element: child };
        }
    }
    return closest.element;
}

// FLIP 动画：记录变更前位置，DOM 重排后用逆向位移过渡到新位置
function flipReorder(list, mutate) {
    const items = [...list.querySelectorAll('.fav-item')];
    const firstRects = new Map();
    items.forEach(el => firstRects.set(el, el.getBoundingClientRect()));

    mutate();

    list.querySelectorAll('.fav-item').forEach(el => {
        if (el === favDragEl) return; // 被拖项由浮动副本表示，不参与滑动
        const first = firstRects.get(el);
        if (!first) return;
        const last = el.getBoundingClientRect();
        const dy = first.top - last.top;
        if (Math.abs(dy) < 1) return;
        el.style.transition = 'none';
        el.style.transform = 'translateY(' + dy + 'px)';
        el.getBoundingClientRect(); // 强制回流，使初始位移生效
        el.style.transition = 'transform 0.18s ease';
        el.style.transform = '';
    });
}

// 拖动结束后，按 DOM 中可见项的新顺序回写 favorites 数组。
// 过滤状态下，仅重排当前可见项所占据的位置，隐藏项保持原位。
function commitOrderFromDom() {
    const list = document.getElementById('favList');
    const domIndexes = [...list.querySelectorAll('.fav-item')]
        .map(el => parseInt(el.dataset.index, 10))
        .filter(n => !isNaN(n));
    if (domIndexes.length === 0) return;

    const slots = [...domIndexes].sort((a, b) => a - b);
    const reordered = domIndexes.map(i => favorites[i]);
    const next = favorites.slice();
    slots.forEach((slot, i) => { next[slot] = reordered[i]; });

    const changed = next.some((f, i) => f !== favorites[i]);
    favorites = next;
    if (changed) saveFavorites();
    renderFavorites();
}

function applyFavorite(index) {
    const fav = favorites[index];
    if (!fav) return;
    document.getElementById('promptInput').value = fav.prompt;
    closeFavorites();
}

function deleteFavorite(index) {
    const fav = favorites[index];
    if (!fav) return;
    pendingDeleteIndex = index;
    document.getElementById('favDeleteMsg').innerHTML =
        '确定删除收藏「<strong>' + escapeHtml(fav.title) + '</strong>」吗？此操作无法撤销。';
    document.getElementById('favDeleteModal').classList.add('active');
}

function closeDeleteModal() {
    pendingDeleteIndex = null;
    document.getElementById('favDeleteModal').classList.remove('active');
}

function confirmDeleteFavorite() {
    if (pendingDeleteIndex === null || !favorites[pendingDeleteIndex]) {
        closeDeleteModal();
        return;
    }
    favorites.splice(pendingDeleteIndex, 1);
    saveFavorites();
    pendingDeleteIndex = null;
    document.getElementById('favDeleteModal').classList.remove('active');
    renderFavorites();
}

function createFavorite() {
    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
        favAlert('无法收藏', '当前提示词为空，无法收藏。');
        return;
    }
    const defaultTitle = makePreview(prompt).replace('…', '');
    const input = document.getElementById('favTitleInput');
    input.value = defaultTitle;
    document.getElementById('favTitleModal').classList.add('active');
    setTimeout(() => { input.focus(); input.select(); }, 0);
}

function closeTitleModal() {
    document.getElementById('favTitleModal').classList.remove('active');
}

function confirmCreateFavorite() {
    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) { closeTitleModal(); return; }
    const input = document.getElementById('favTitleInput');
    const defaultTitle = makePreview(prompt).replace('…', '');
    const finalTitle = input.value.trim() || defaultTitle;
    favorites.unshift({ id: Date.now(), title: finalTitle, prompt: prompt });
    saveFavorites();
    closeTitleModal();
    renderFavorites();
}

function exportFavorites() {
    if (favorites.length === 0) {
        favAlert('无法导出', '收藏夹为空，没有可导出的内容。');
        return;
    }
    const data = JSON.stringify(favorites, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gpt-image-favorites-' + Date.now() + '.json';
    link.click();
    URL.revokeObjectURL(url);
}

function importFavorites() {
    document.getElementById('favFileInput').click();
}

function handleFavImport(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        let imported;
        try {
            imported = JSON.parse(e.target.result);
        } catch (err) {
            favAlert('导入失败', '文件解析失败，请确认是有效的 JSON 文件。');
            return;
        }
        if (!Array.isArray(imported)) {
            favAlert('导入失败', '文件格式不正确：应为收藏数组。');
            return;
        }
        const valid = imported.filter(isValidFav).map(f => ({
            id: typeof f.id === 'number' ? f.id : Date.now() + Math.floor(Math.random() * 1000),
            title: f.title,
            prompt: f.prompt
        }));
        if (valid.length === 0) {
            favAlert('导入失败', '文件中没有有效的收藏。');
            return;
        }
        if (favorites.length === 0) {
            favorites = valid;
            saveFavorites();
            renderFavorites();
        } else {
            pendingImport = valid;
            document.getElementById('favImportMsg').innerHTML =
                '已读取 <strong>' + valid.length + '</strong> 条收藏。<br>选择「追加」加入现有收藏，或「覆盖」替换当前收藏夹。';
            document.getElementById('favImportModal').classList.add('active');
        }
    };
    reader.readAsText(file);
}

function closeImportModal() {
    pendingImport = null;
    document.getElementById('favImportModal').classList.remove('active');
}

function resolveImport(append) {
    if (!pendingImport) { closeImportModal(); return; }
    favorites = append ? favorites.concat(pendingImport) : pendingImport;
    saveFavorites();
    pendingImport = null;
    document.getElementById('favImportModal').classList.remove('active');
    renderFavorites();
}

function updateFavFade() {
    const wrap = document.getElementById('favListWrap');
    const list = document.getElementById('favList');
    const scrollable = list.scrollHeight - list.clientHeight;
    wrap.classList.toggle('fade-top', list.scrollTop > 4);
    wrap.classList.toggle('fade-bottom', scrollable > 4 && list.scrollTop < scrollable - 4);
}

document.getElementById('favList').addEventListener('scroll', updateFavFade);

document.getElementById('favTitleInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmCreateFavorite(); }
});

applyTheme();
loadSettings();
loadFavorites();
setupImageViewerEvents();
updateResolutions();
updateCompressionControl();
