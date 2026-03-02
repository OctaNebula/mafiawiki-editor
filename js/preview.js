/**
 * preview.js — Handles live preview rendering.
 * Renders both visual (HTML) and source (raw Markdown) previews.
 */

const MWPreview = (() => {
    let currentTab = 'visual'; // 'visual' or 'source'
    let debounceTimer = null;

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
                    ADD_TAGS: ['style'],
                    ADD_ATTR: ['class', 'style', 'colspan', 'alt', 'src'],
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
