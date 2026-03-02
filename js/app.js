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
        pageType: 'role',
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
        setupPageTypeSelector();
        setupCollapsibleSections();
        setupImageUploads();
        setupCustomAttrs();
        setupCustomSections();
        setupExportImport();
        setupPreviewToggle();
        initEasyMDEEditors();
        setupAutoPreview();

        // Initial preview
        triggerPreview();
    }

    // ============================================================
    // Page Type Selector
    // ============================================================
    function setupPageTypeSelector() {
        const buttons = document.querySelectorAll('.page-type-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.pageType = btn.dataset.type;
                updateTypeFields();
                updateTitleHelp();
                triggerPreview();
            });
        });
    }

    function updateTypeFields() {
        const type = state.pageType;
        document.getElementById('role-fields').hidden = type !== 'role';
        document.getElementById('map-fields').hidden = type !== 'map';
        document.getElementById('custom-fields').hidden = type !== 'custom';
    }

    function updateTitleHelp() {
        const help = document.getElementById('title-help');
        if (state.pageType === 'role') {
            help.textContent = 'Will be displayed as "The [Title]" for role pages';
            help.style.display = '';
        } else if (state.pageType === 'map') {
            help.textContent = 'Maps use the title as-is (no "The" prefix)';
            help.style.display = '';
        } else {
            help.style.display = 'none';
        }
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
    // EasyMDE Editors
    // ============================================================
    function initEasyMDEEditors() {
        const editorConfigs = [
            { id: 'ingame-editor', key: 'ingame' },
            { id: 'tips-editor', key: 'tips' },
            { id: 'trivia-editor', key: 'trivia' },
        ];

        for (const config of editorConfigs) {
            const el = document.getElementById(config.id);
            if (!el) continue;

            editors[config.key] = new EasyMDE({
                element: el,
                spellChecker: false,
                status: false,
                placeholder: getPlaceholder(config.key),
                toolbar: [
                    'bold', 'italic', 'heading', '|',
                    'unordered-list', 'ordered-list', '|',
                    'link', 'image', '|',
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

            // Listen for changes
            editors[config.key].codemirror.on('change', () => {
                triggerPreview();
            });
        }
    }

    function getPlaceholder(key) {
        const placeholders = {
            ingame: 'Describe how this role/map works in-game...\n\nUse **bold** for important terms.',
            tips: 'Share strategy tips and tricks...',
            trivia: 'Add fun facts and trivia...\n\nEach paragraph becomes a separate item.',
        };
        return placeholders[key] || 'Write content here...';
    }

    function createEasyMDE(element, placeholder) {
        return new EasyMDE({
            element,
            spellChecker: false,
            status: false,
            placeholder: placeholder || 'Write content here...',
            toolbar: [
                'bold', 'italic', 'heading', '|',
                'unordered-list', 'ordered-list', '|',
                'link', 'image', '|',
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

        // Insert Image buttons (for inline images in sections)
        document.querySelectorAll('.btn-insert-image').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.dataset.section;
                const input = document.getElementById(`${section}-image-input`);
                if (input) input.click();
            });
        });

        // Inline image input handler
        const inlineInput = document.getElementById('ingame-image-input');
        if (inlineInput) {
            inlineInput.addEventListener('change', () => {
                if (inlineInput.files.length > 0) {
                    insertInlineImage('ingame', inlineInput.files[0]);
                    inlineInput.value = '';
                }
            });
        }
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

    function insertInlineImage(section, file) {
        if (!file || !file.type.startsWith('image/')) return;

        const url = URL.createObjectURL(file);
        state.images.inline.push({ name: file.name, file, url, section });

        // Insert image markdown into the editor
        const editor = editors[section];
        if (editor) {
            const imgMarkdown = `\n<img src="https://mafiawiki.astrofare.xyz/assets/${file.name}" alt="${file.name}" class="infobox-image" style="width: 100%;">\n`;
            const cm = editor.codemirror;
            const cursor = cm.getCursor();
            cm.replaceRange(imgMarkdown, cursor);
        }

        showToast(`Image "${file.name}" inserted. It will be included in the .mwp export.`, 'info');
        triggerPreview();
    }

    // ============================================================
    // Custom Attributes (for Custom page type)
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
            'page-title', 'page-description', 'page-slug',
            'infobox-title', 'role-team', 'role-goal', 'role-maxplayers',
            'map-status', 'map-lockers', 'map-closets', 'map-rooms',
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
            pageType: state.pageType,
            title: document.getElementById('page-title')?.value?.trim() || '',
            description: document.getElementById('page-description')?.value?.trim() || '',
            filePath: document.getElementById('page-slug')?.value?.trim() || '',
            introText: document.getElementById('intro-editor')?.value?.trim() || '',
            infoboxTitle: document.getElementById('infobox-title')?.value?.trim() || '',

            // Role fields
            roleTeam: document.getElementById('role-team')?.value || 'Good',
            roleGoal: document.getElementById('role-goal')?.value?.trim() || '',
            roleMaxPlayers: document.getElementById('role-maxplayers')?.value?.trim() || '',

            // Map fields
            mapStatus: document.getElementById('map-status')?.value || 'Active',
            mapLockers: document.getElementById('map-lockers')?.value || '0',
            mapClosets: document.getElementById('map-closets')?.value || '0',
            mapRooms: document.getElementById('map-rooms')?.value || '0',

            // Custom attrs
            customAttrs: state.customAttrs.map(a => ({ key: a.key, value: a.value })),

            // Editor content
            ingameContent: editors.ingame?.value() || '',
            tipsContent: editors.tips?.value() || '',
            triviaContent: editors.trivia?.value() || '',

            // Custom sections
            customSections: state.customSections.map(s => ({
                title: document.querySelector(`[data-section-id="${s.id}"] .custom-section-title-input`)?.value || '',
                content: s.editor?.value() || '',
            })),

            // Image names
            socialImageName: state.images.social?.name || '',
            bgImageName: state.images.bg?.name || '',
            infoboxImageName: state.images.infobox?.name || '',
        };

        // Generate slug if not provided
        if (!data.filePath && data.title) {
            const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            if (data.pageType === 'role') data.filePath = `roles/${slug}`;
            else if (data.pageType === 'map') data.filePath = `maps/${slug}`;
            else data.filePath = slug;
        }
        data.slug = data.filePath?.split('/').pop() || data.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'page';

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
        // Page type
        state.pageType = data.pageType || 'role';
        document.querySelectorAll('.page-type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === state.pageType);
        });
        updateTypeFields();
        updateTitleHelp();

        // Text fields
        setInputValue('page-title', data.title);
        setInputValue('page-description', data.description);
        setInputValue('page-slug', data.filePath);
        setInputValue('infobox-title', data.infoboxTitle);
        setInputValue('intro-editor', data.introText);

        // Role fields
        setInputValue('role-team', data.roleTeam);
        setInputValue('role-goal', data.roleGoal);
        setInputValue('role-maxplayers', data.roleMaxPlayers);

        // Map fields
        setInputValue('map-status', data.mapStatus);
        setInputValue('map-lockers', data.mapLockers);
        setInputValue('map-closets', data.mapClosets);
        setInputValue('map-rooms', data.mapRooms);

        // Editor content
        if (editors.ingame) editors.ingame.value(data.ingameContent || '');
        if (editors.tips) editors.tips.value(data.tipsContent || '');
        if (editors.trivia) editors.trivia.value(data.triviaContent || '');

        // Custom attributes
        state.customAttrs = [];
        state.nextAttrId = 1;
        if (data.customAttrs) {
            for (const attr of data.customAttrs) {
                addCustomAttr(attr.key, attr.value);
            }
        }

        // Custom sections — remove existing, add imported
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
                // Try to match to the correct slot
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
        MWPreview.update(markdown);
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
