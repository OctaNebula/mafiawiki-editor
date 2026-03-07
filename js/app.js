/**
 * app.js — Main application logic for the Mafia Wiki Editor.
 * Wires up all UI interactions, EasyMDE instances, image uploads,
 * and coordinates templates/preview/export modules.
 */

(function () {
    'use strict';

    // ============================================================
    // State
    // ============================================================
    const state = {
        infoboxEnabled: false,
        images: {
            social: null,  // { name, file, url }
            bg: null,
            infobox: null,
            inline: [],    // [{ name, file, url, section }]
        },
        customSections: [], // [{ id, title, editor }]
        nextSectionId: 1,
        customAttrs: [],    // [{ id, key, value }]
        nextAttrId: 1,
    };

    // EasyMDE instances
    const editors = {};

    // ============================================================
    // Initialization
    // ============================================================
    function init() {
        MWPreview.init();
        setupCollapsibleSections();
        setupInfoboxToggle();
        setupImageUploads();
        setupCustomAttrs();
        setupCustomSections();
        setupExportImport();
        setupPreviewToggle();
        setupAdmonitionModal();
        setupAutoPreview();

        // Initial preview
        triggerPreview();
    }

    // ============================================================
    // Collapsible Sections
    // ============================================================
    function setupCollapsibleSections() {
        document.querySelectorAll('.section-header.collapsible').forEach(header => {
            header.addEventListener('click', () => {
                const targetId = header.dataset.target;
                const content = document.getElementById(targetId);
                if (!content) return;

                const isCollapsed = header.classList.toggle('collapsed');
                content.classList.toggle('collapsed', isCollapsed);
            });
        });
    }

    // ============================================================
    // Infobox Toggle
    // ============================================================
    function setupInfoboxToggle() {
        const toggle = document.getElementById('infobox-toggle');
        const content = document.getElementById('infobox-content');
        if (!toggle || !content) return;

        // Prevent toggle click from bubbling to the section header
        const label = document.getElementById('infobox-toggle-label');
        if (label) {
            label.addEventListener('click', (e) => e.stopPropagation());
        }

        toggle.addEventListener('change', () => {
            state.infoboxEnabled = toggle.checked;
            content.hidden = !toggle.checked;
            triggerPreview();
        });
    }

    // ============================================================
    // EasyMDE Editors
    // ============================================================
    // Which editor to insert the admonition into
    let _pendingAdmonitionEditor = null;

    function openAdmonitionModal(editorRef) {
        _pendingAdmonitionEditor = editorRef;
        const modal = document.getElementById('admonition-modal');
        if (modal) {
            modal.hidden = false;
            // Reset form
            document.getElementById('admonition-type').value = 'note';
            document.getElementById('admonition-title').value = '';
            document.getElementById('admonition-collapsible').checked = false;
            document.getElementById('admonition-open').checked = false;
            document.getElementById('admonition-open-group').hidden = true;
        }
    }

    function setupAdmonitionModal() {
        const modal = document.getElementById('admonition-modal');
        const closeBtn = document.getElementById('admonition-modal-close');
        const cancelBtn = document.getElementById('admonition-cancel');
        const insertBtn = document.getElementById('admonition-insert');
        const collapsibleCb = document.getElementById('admonition-collapsible');

        function closeModal() {
            if (modal) modal.hidden = true;
            _pendingAdmonitionEditor = null;
        }

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (modal) modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        if (collapsibleCb) {
            collapsibleCb.addEventListener('change', () => {
                const openGroup = document.getElementById('admonition-open-group');
                if (openGroup) openGroup.hidden = !collapsibleCb.checked;
            });
        }

        if (insertBtn) {
            insertBtn.addEventListener('click', () => {
                const type = document.getElementById('admonition-type').value;
                const title = document.getElementById('admonition-title').value.trim();
                const collapsible = document.getElementById('admonition-collapsible').checked;
                const openByDefault = document.getElementById('admonition-open').checked;

                let prefix;
                if (collapsible && openByDefault) prefix = '???+';
                else if (collapsible) prefix = '???';
                else prefix = '!!!';

                const titlePart = title ? ` "${title}"` : '';
                const snippet = `${prefix} ${type}${titlePart}\n    Your content here\n\n`;

                const editor = _pendingAdmonitionEditor;
                if (editor) {
                    const cm = editor.codemirror;
                    const cursor = cm.getCursor();
                    cm.replaceRange(snippet, cursor);
                    cm.focus();
                }

                closeModal();
                triggerPreview();
            });
        }
    }

    function createEasyMDE(element, placeholder) {
        let editorInstance;
        editorInstance = new EasyMDE({
            element,
            spellChecker: false,
            status: false,
            placeholder: placeholder || 'Write content here...',
            toolbar: [
                'bold', 'italic', 'heading', '|',
                'unordered-list', 'ordered-list', '|',
                'link', 'image', '|',
                {
                    name: 'admonition',
                    action: () => openAdmonitionModal(editorInstance),
                    className: 'fa fa-exclamation-triangle',
                    title: 'Insert Admonition',
                },
                '|',
                'preview', 'guide',
            ],
            previewRender: (text) => {
                if (typeof marked !== 'undefined') {
                    return typeof marked.parse === 'function'
                        ? marked.parse(text)
                        : marked(text);
                }
                return text;
            },
        });
        return editorInstance;
    }

    // ============================================================
    // Image Uploads
    // ============================================================
    function setupImageUploads() {
        // Click-to-upload for all image upload areas
        document.querySelectorAll('.image-upload-area').forEach(area => {
            area.addEventListener('click', () => {
                const targetId = area.dataset.target;
                const input = document.getElementById(targetId);
                if (input) input.click();
            });

            // Drag and drop
            area.addEventListener('dragover', (e) => {
                e.preventDefault();
                area.classList.add('dragover');
            });
            area.addEventListener('dragleave', () => {
                area.classList.remove('dragover');
            });
            area.addEventListener('drop', (e) => {
                e.preventDefault();
                area.classList.remove('dragover');
                const targetId = area.dataset.target;
                if (e.dataTransfer.files.length > 0) {
                    handleImageFile(targetId, e.dataTransfer.files[0]);
                }
            });
        });

        // File input change handlers
        const imageInputs = [
            { inputId: 'social-image-input', stateKey: 'social' },
            { inputId: 'bg-image-input', stateKey: 'bg' },
            { inputId: 'infobox-image-input', stateKey: 'infobox' },
        ];

        for (const { inputId, stateKey } of imageInputs) {
            const input = document.getElementById(inputId);
            if (!input) continue;
            input.addEventListener('change', () => {
                if (input.files.length > 0) {
                    handleImageFile(inputId, input.files[0]);
                }
            });
        }

        // Remove image buttons
        document.querySelectorAll('.btn-remove-image').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const clearKey = btn.dataset.clear;
                clearImage(clearKey);
            });
        });
    }

    function handleImageFile(inputId, file) {
        if (!file || !file.type.startsWith('image/')) {
            showToast('Please select an image file', 'error');
            return;
        }

        const url = URL.createObjectURL(file);
        const imgData = { name: file.name, file, url };

        // Map input ID to state key and preview element
        const mapping = {
            'social-image-input': { stateKey: 'social', previewId: 'social-image-preview', areaParent: 'social-image-upload' },
            'bg-image-input': { stateKey: 'bg', previewId: 'bg-image-preview', areaParent: 'bg-image-upload' },
            'infobox-image-input': { stateKey: 'infobox', previewId: 'infobox-image-preview', areaParent: 'infobox-image-upload' },
        };

        const map = mapping[inputId];
        if (!map) return;

        // Revoke old URL if any
        if (state.images[map.stateKey]?.url) {
            URL.revokeObjectURL(state.images[map.stateKey].url);
        }

        state.images[map.stateKey] = imgData;

        // Update preview
        const preview = document.getElementById(map.previewId);
        if (preview) {
            preview.querySelector('img').src = url;
            preview.hidden = false;
        }

        // Hide upload area
        const parent = document.getElementById(map.areaParent);
        if (parent) {
            const area = parent.querySelector('.image-upload-area');
            if (area) area.style.display = 'none';
        }

        triggerPreview();
    }

    function clearImage(clearKey) {
        const mapping = {
            'social-image': { stateKey: 'social', previewId: 'social-image-preview', areaParent: 'social-image-upload' },
            'bg-image': { stateKey: 'bg', previewId: 'bg-image-preview', areaParent: 'bg-image-upload' },
            'infobox-image': { stateKey: 'infobox', previewId: 'infobox-image-preview', areaParent: 'infobox-image-upload' },
        };

        const map = mapping[clearKey];
        if (!map) return;

        if (state.images[map.stateKey]?.url) {
            URL.revokeObjectURL(state.images[map.stateKey].url);
        }
        state.images[map.stateKey] = null;

        const preview = document.getElementById(map.previewId);
        if (preview) {
            preview.hidden = true;
            preview.querySelector('img').src = '';
        }

        const parent = document.getElementById(map.areaParent);
        if (parent) {
            const area = parent.querySelector('.image-upload-area');
            if (area) area.style.display = '';
        }

        triggerPreview();
    }

    // ============================================================
    // Custom Attributes (Infobox)
    // ============================================================
    function setupCustomAttrs() {
        document.getElementById('btn-add-attr')?.addEventListener('click', () => {
            addCustomAttr();
        });
    }

    function addCustomAttr(key = '', value = '') {
        const id = state.nextAttrId++;
        state.customAttrs.push({ id, key, value });
        renderCustomAttrs();
    }

    function removeCustomAttr(id) {
        state.customAttrs = state.customAttrs.filter(a => a.id !== id);
        renderCustomAttrs();
        triggerPreview();
    }

    function renderCustomAttrs() {
        const list = document.getElementById('custom-attrs-list');
        if (!list) return;

        list.innerHTML = '';
        for (const attr of state.customAttrs) {
            const row = document.createElement('div');
            row.className = 'custom-attr-row';
            row.innerHTML = `
                <input type="text" placeholder="Attribute name" value="${escapeHtml(attr.key)}" data-id="${attr.id}" data-field="key">
                <input type="text" placeholder="Value" value="${escapeHtml(attr.value)}" data-id="${attr.id}" data-field="value">
                <button class="btn-remove-attr" data-id="${attr.id}">&times;</button>
            `;
            list.appendChild(row);
        }

        // Bind events
        list.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', (e) => {
                const id = parseInt(e.target.dataset.id);
                const field = e.target.dataset.field;
                const attr = state.customAttrs.find(a => a.id === id);
                if (attr) {
                    attr[field] = e.target.value;
                    triggerPreview();
                }
            });
        });

        list.querySelectorAll('.btn-remove-attr').forEach(btn => {
            btn.addEventListener('click', () => {
                removeCustomAttr(parseInt(btn.dataset.id));
            });
        });
    }

    // ============================================================
    // Custom Sections
    // ============================================================
    function setupCustomSections() {
        document.getElementById('btn-add-section')?.addEventListener('click', () => {
            addCustomSection();
        });
    }

    function addCustomSection(title = '', content = '') {
        const id = state.nextSectionId++;
        const container = document.getElementById('custom-sections-container');
        if (!container) return;

        const section = document.createElement('section');
        section.className = 'editor-section custom-section';
        section.dataset.sectionId = id;
        section.innerHTML = `
            <div class="section-header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <input type="text" class="custom-section-title-input" placeholder="Section Title" value="${escapeHtml(title)}">
                <button class="btn-remove-section" data-section-id="${id}">&times;</button>
            </div>
            <div class="section-content">
                <div class="md-editor-wrap">
                    <textarea id="custom-section-${id}"></textarea>
                </div>
            </div>
        `;
        container.appendChild(section);

        // Initialize EasyMDE for this section
        const textarea = document.getElementById(`custom-section-${id}`);
        const editor = createEasyMDE(textarea, 'Write section content...');

        if (content) {
            editor.value(content);
        }

        editor.codemirror.on('change', () => triggerPreview());

        state.customSections.push({ id, editor });

        // Title change triggers preview
        section.querySelector('.custom-section-title-input').addEventListener('input', () => {
            triggerPreview();
        });

        // Remove button
        section.querySelector('.btn-remove-section').addEventListener('click', () => {
            removeCustomSection(id);
        });

        triggerPreview();
    }

    function removeCustomSection(id) {
        const section = document.querySelector(`[data-section-id="${id}"]`);
        if (section) section.remove();

        const csEntry = state.customSections.find(s => s.id === id);
        if (csEntry?.editor) {
            csEntry.editor.toTextArea();
        }
        state.customSections = state.customSections.filter(s => s.id !== id);
        triggerPreview();
    }

    // ============================================================
    // Export / Import
    // ============================================================
    function setupExportImport() {
        // Export
        document.getElementById('btn-export')?.addEventListener('click', async () => {
            try {
                const data = gatherEditorData();
                const title = data.title;
                if (!title) {
                    showToast('Please enter a page title before exporting', 'error');
                    return;
                }

                const imageFiles = gatherImageFiles();
                const filename = await MWExport.exportMwp(data, imageFiles);
                showToast(`Exported "${filename}" successfully!`, 'success');
            } catch (err) {
                console.error('Export error:', err);
                showToast(`Export failed: ${err.message}`, 'error');
            }
        });

        // Import
        document.getElementById('btn-import')?.addEventListener('click', () => {
            document.getElementById('import-input')?.click();
        });

        document.getElementById('import-input')?.addEventListener('change', async (e) => {
            if (e.target.files.length === 0) return;
            try {
                const result = await MWExport.importMwp(e.target.files[0]);
                loadEditorState(result);
                showToast('File imported successfully!', 'success');
            } catch (err) {
                console.error('Import error:', err);
                showToast(`Import failed: ${err.message}`, 'error');
            }
            e.target.value = '';
        });
    }

    // ============================================================
    // Preview Toggle (mobile)
    // ============================================================
    function setupPreviewToggle() {
        document.getElementById('btn-preview-toggle')?.addEventListener('click', () => {
            const panel = document.getElementById('preview-panel');
            if (!panel) return;

            // On desktop: toggle hidden
            if (window.innerWidth > 900) {
                panel.classList.toggle('hidden');
            } else {
                // On mobile: overlay
                panel.classList.toggle('mobile-show');
            }
        });
    }

    // ============================================================
    // Auto Preview
    // ============================================================
    function setupAutoPreview() {
        // Listen to all text inputs for preview updates
        const textInputs = [
            'page-title', 'page-description', 'page-category',
            'infobox-title',
        ];

        for (const id of textInputs) {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => triggerPreview());
                el.addEventListener('change', () => triggerPreview());
            }
        }

        // Intro editor
        const introEditor = document.getElementById('intro-editor');
        if (introEditor) {
            introEditor.addEventListener('input', () => triggerPreview());
        }
    }

    // ============================================================
    // Data Gathering
    // ============================================================
    function gatherEditorData() {
        const data = {
            infoboxEnabled: state.infoboxEnabled,
            title: document.getElementById('page-title')?.value?.trim() || '',
            description: document.getElementById('page-description')?.value?.trim() || '',
            category: document.getElementById('page-category')?.value || 'roles',
            introText: document.getElementById('intro-editor')?.value?.trim() || '',
            infoboxTitle: document.getElementById('infobox-title')?.value?.trim() || '',

            // Custom attrs (infobox attributes)
            customAttrs: state.customAttrs.map(a => ({ key: a.key, value: a.value })),

            // Sections
            customSections: state.customSections.map(s => ({
                title: document.querySelector(`[data-section-id="${s.id}"] .custom-section-title-input`)?.value || '',
                content: s.editor?.value() || '',
            })),

            // Image names
            socialImageName: state.images.social?.name || '',
            bgImageName: state.images.bg?.name || '',
            infoboxImageName: state.images.infobox?.name || '',
        };

        // Generate slug from title
        const slug = data.title
            ? data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
            : 'page';
        data.slug = slug;
        data.filePath = `${data.category}/${slug}`;

        return data;
    }

    function gatherImageFiles() {
        const files = [];
        if (state.images.social?.file) {
            files.push({ name: state.images.social.name, file: state.images.social.file });
        }
        if (state.images.bg?.file) {
            files.push({ name: state.images.bg.name, file: state.images.bg.file });
        }
        if (state.images.infobox?.file) {
            files.push({ name: state.images.infobox.name, file: state.images.infobox.file });
        }
        for (const img of state.images.inline) {
            if (img.file) {
                files.push({ name: img.name, file: img.file });
            }
        }
        return files;
    }

    // ============================================================
    // Load Editor State (from import)
    // ============================================================
    function loadEditorState(data) {
        // Text fields
        setInputValue('page-title', data.title);
        setInputValue('page-description', data.description);
        setInputValue('page-category', data.category || 'roles');
        setInputValue('infobox-title', data.infoboxTitle);
        setInputValue('intro-editor', data.introText);

        // Infobox toggle
        const hasInfobox = data.infoboxEnabled !== undefined ? data.infoboxEnabled : (data.customAttrs && data.customAttrs.length > 0);
        const toggle = document.getElementById('infobox-toggle');
        const content = document.getElementById('infobox-content');
        if (toggle) {
            toggle.checked = hasInfobox;
            state.infoboxEnabled = hasInfobox;
        }
        if (content) content.hidden = !hasInfobox;

        // Custom attributes
        state.customAttrs = [];
        state.nextAttrId = 1;
        if (data.customAttrs) {
            for (const attr of data.customAttrs) {
                addCustomAttr(attr.key, attr.value);
            }
        }

        // Sections — remove existing, add imported
        for (const s of [...state.customSections]) {
            removeCustomSection(s.id);
        }
        if (data.customSections) {
            for (const s of data.customSections) {
                addCustomSection(s.title, s.content);
            }
        }

        // Images from .mwp
        if (data.imageFiles) {
            for (const img of data.imageFiles) {
                if (data.socialImageName && img.name === data.socialImageName) {
                    state.images.social = img;
                    showImagePreview('social-image-preview', 'social-image-upload', img.url);
                } else if (data.bgImageName && img.name === data.bgImageName) {
                    state.images.bg = img;
                    showImagePreview('bg-image-preview', 'bg-image-upload', img.url);
                } else if (data.infoboxImageName && img.name === data.infoboxImageName) {
                    state.images.infobox = img;
                    showImagePreview('infobox-image-preview', 'infobox-image-upload', img.url);
                } else {
                    state.images.inline.push(img);
                }
            }
        }

        triggerPreview();
    }

    function showImagePreview(previewId, parentId, url) {
        const preview = document.getElementById(previewId);
        if (preview) {
            preview.querySelector('img').src = url;
            preview.hidden = false;
        }
        const parent = document.getElementById(parentId);
        if (parent) {
            const area = parent.querySelector('.image-upload-area');
            if (area) area.style.display = 'none';
        }
    }

    function setInputValue(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.value = value || '';
        }
    }

    // ============================================================
    // Preview Trigger
    // ============================================================
    function triggerPreview() {
        const data = gatherEditorData();
        const markdown = MWTemplates.generatePage(data);

        // Build local image map so preview shows uploaded images
        // instead of unresolvable wiki URLs
        const imageMap = {};
        for (const key of ['social', 'bg', 'infobox']) {
            if (state.images[key]) {
                imageMap[state.images[key].name] = state.images[key].url;
            }
        }
        for (const img of state.images.inline) {
            if (img.name && img.url) {
                imageMap[img.name] = img.url;
            }
        }

        MWPreview.update(markdown, false, imageMap);
    }

    // ============================================================
    // Toast Notifications
    // ============================================================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============================================================
    // Helpers
    // ============================================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============================================================
    // Boot
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
