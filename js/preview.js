/**
 * preview.js — Handles live preview rendering.
 * Renders both visual (HTML) and source (raw Markdown) previews.
 */

const MWPreview = (() => {
    let currentTab = 'visual'; // 'visual' or 'source'
    let debounceTimer = null;

    // Admonition type metadata (icons & default titles)
    const ADMONITION_TYPES = {
        note:     { icon: '&#9998;',  label: 'Note',     cssClass: 'admonition-note' },
        abstract: { icon: '&#128203;', label: 'Abstract', cssClass: 'admonition-abstract' },
        info:     { icon: '&#8505;',  label: 'Info',     cssClass: 'admonition-info' },
        tip:      { icon: '&#128161;', label: 'Tip',      cssClass: 'admonition-tip' },
        success:  { icon: '&#10004;', label: 'Success',  cssClass: 'admonition-success' },
        question: { icon: '&#10067;', label: 'Question', cssClass: 'admonition-question' },
        warning:  { icon: '&#9888;',  label: 'Warning',  cssClass: 'admonition-warning' },
        failure:  { icon: '&#10008;', label: 'Failure',  cssClass: 'admonition-failure' },
        danger:   { icon: '&#9889;',  label: 'Danger',   cssClass: 'admonition-danger' },
        bug:      { icon: '&#128027;', label: 'Bug',      cssClass: 'admonition-bug' },
        example:  { icon: '&#128214;', label: 'Example',  cssClass: 'admonition-example' },
        quote:    { icon: '&#10078;', label: 'Quote',    cssClass: 'admonition-quote' },
    };

    /**
     * Convert MkDocs-style admonition blocks to HTML before passing to marked.
     * Supports:
     *   !!! type "Title"        — static admonition
     *   ??? type "Title"        — collapsible (closed)
     *   ???+ type "Title"       — collapsible (open)
     *   Indented content (4 spaces) forms the body.
     */
    function processAdmonitions(md) {
        // Regex: captures the prefix (!!!, ???, ???+), type, optional quoted title, and indented body
        return md.replace(
            /^(\!{3}|\?{3}\+?) +(\w+)(?: +"([^"]*)")? *\n((?:(?:    |\t).+\n?)*)/gm,
            (_match, prefix, type, title, body) => {
                const meta = ADMONITION_TYPES[type] || ADMONITION_TYPES.note;
                const displayTitle = title || meta.label;
                const isCollapsible = prefix.startsWith('???');
                const isOpen = prefix === '???+';

                // Un-indent body (remove leading 4 spaces or tab)
                const bodyContent = body.replace(/^(    |\t)/gm, '').trim();

                // Render body markdown
                let bodyHtml;
                if (typeof marked !== 'undefined') {
                    bodyHtml = typeof marked.parse === 'function'
                        ? marked.parse(bodyContent)
                        : marked(bodyContent);
                } else {
                    bodyHtml = bodyContent.replace(/\n/g, '<br>');
                }

                if (isCollapsible) {
                    return `<details class="admonition ${meta.cssClass}"${isOpen ? ' open' : ''}>` +
                        `<summary class="admonition-title"><span class="admonition-icon">${meta.icon}</span> ${displayTitle}</summary>` +
                        `<div class="admonition-body">${bodyHtml}</div></details>\n`;
                }

                return `<div class="admonition ${meta.cssClass}">` +
                    `<div class="admonition-title"><span class="admonition-icon">${meta.icon}</span> ${displayTitle}</div>` +
                    `<div class="admonition-body">${bodyHtml}</div></div>\n`;
            }
        );
    }

    /**
     * Render the visual preview (approximates wiki look).
     */
    function renderVisual(markdownSource) {
        const container = document.getElementById('preview-wiki-content');
        if (!container) return;

        if (!markdownSource || !markdownSource.trim()) {
            container.innerHTML = '<p class="preview-placeholder">Start editing to see a live preview...</p>';
            return;
        }

        // Strip the YAML frontmatter for visual preview
        let content = markdownSource;
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        if (fmMatch) {
            content = content.slice(fmMatch[0].length);
        }

        // Process admonition blocks before markdown rendering
        content = processAdmonitions(content);

        // Try rendering with marked.js
        try {
            // Configure marked
            if (typeof marked !== 'undefined') {
                marked.setOptions({
                    breaks: false,
                    gfm: true,
                });
            }

            // The content contains raw HTML (flex container, infobox, style block).
            // marked.js will pass HTML through, which is exactly what we want.
            let html;
            if (typeof marked !== 'undefined') {
                // marked v5+ uses marked.parse()
                html = typeof marked.parse === 'function'
                    ? marked.parse(content)
                    : marked(content);
            } else {
                // Fallback: just show raw content with basic formatting
                html = content
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\n/g, '<br>');
            }

            // Sanitize with DOMPurify if available, allowing safe HTML
            if (typeof DOMPurify !== 'undefined') {
                html = DOMPurify.sanitize(html, {
                    ADD_TAGS: ['style', 'details', 'summary'],
                    ADD_ATTR: ['class', 'style', 'colspan', 'alt', 'src', 'open'],
                    ALLOW_DATA_ATTR: false,
                });
            }

            container.innerHTML = html;
        } catch (e) {
            console.error('Preview render error:', e);
            container.innerHTML = '<p class="preview-placeholder">Error rendering preview</p>';
        }
    }

    /**
     * Render the source preview (raw Markdown).
     */
    function renderSource(markdownSource) {
        const codeEl = document.getElementById('preview-source-code');
        if (!codeEl) return;

        if (!markdownSource || !markdownSource.trim()) {
            codeEl.textContent = '// Generated Markdown will appear here...';
            return;
        }

        codeEl.textContent = markdownSource;
    }

    /**
     * Update the preview (debounced).
     */
    function update(markdownSource, immediate = false) {
        if (immediate) {
            renderVisual(markdownSource);
            renderSource(markdownSource);
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            renderVisual(markdownSource);
            renderSource(markdownSource);
        }, 300);
    }

    /**
     * Switch between visual and source tabs.
     */
    function switchTab(tab) {
        currentTab = tab;
        const visualEl = document.getElementById('preview-visual');
        const sourceEl = document.getElementById('preview-source');

        if (tab === 'visual') {
            visualEl.hidden = false;
            sourceEl.hidden = true;
        } else {
            visualEl.hidden = true;
            sourceEl.hidden = false;
        }

        // Update tab button states
        document.querySelectorAll('.preview-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
    }

    /**
     * Initialize preview tab switching.
     */
    function init() {
        document.querySelectorAll('.preview-tab').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
    }

    return {
        init,
        update,
        switchTab,
    };
})();
