/**
 * templates.js — Generates the final Markdown (.md) content
 * that matches the exact patterns used in the Mafia wiki.
 *
 * Every wiki page follows this structure:
 *   1. YAML frontmatter
 *   2. # Title + ---
 *   3. (Optional) <style> block + flex container with intro + infobox
 *   4. Or just intro text if infobox is disabled
 *   5. Sections: ## **Name** + --- + content
 */

const MWTemplates = (() => {
    // Base URL for assets on the live wiki
    const WIKI_BASE = 'https://mafiawiki.astrofare.xyz';

    /**
     * Convert simple markdown-like text to inline HTML.
     * Handles **bold** → <b>bold</b> and paragraph breaks.
     */
    function introTextToHtml(text) {
        if (!text || !text.trim()) return '';

        // Split into paragraphs on double newlines
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
        let html = '';

        for (const para of paragraphs) {
            // Convert **text** to <b>text</b>
            let processed = para.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
            // Convert *text* to <i>text</i>
            processed = processed.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');
            // Wrap in <p>
            html += `        <p>${processed}</p>\n`;
        }

        return html;
    }

    /**
     * Generate the YAML frontmatter block.
     */
    function generateFrontmatter(data) {
        const title = data.title || 'Untitled';

        // Auto-generate description if not provided
        const description = data.description || `This article is about ${title}.`;

        // Image paths
        const socialImage = data.socialImageName
            ? `/assets/${data.socialImageName}`
            : '/assets/placeholder.png';

        const background = data.bgImageName
            ? `/assets/${data.bgImageName}`
            : '/assets/background.jpg';

        return [
            '---',
            `title: ${title}`,
            `description: ${description}`,
            `social_image: ${socialImage}`,
            `background: ${background}`,
            '---',
        ].join('\n');
    }

    /**
     * Generate the mobile-responsive <style> block.
     * This is identical across all wiki pages that have an infobox.
     */
    function generateMobileStyle() {
        return `<style>
@media (max-width: 768px) { /* For mobile users */
    .flex-container {
        flex-direction: column;
        align-items: center;
    }
    .infobox {
        align-self: center;
        order: -1;
        margin-left: 0;
        margin-bottom: 20px;
        width: 100%;
        max-width: 300px;
    }
}
</style>`;
    }

    /**
     * Generate the infobox HTML table.
     * Only uses custom attributes.
     */
    function generateInfobox(data) {
        const infoboxTitle = data.infoboxTitle || data.title || 'Untitled';

        // Image source
        const imgName = data.infoboxImageName || 'placeholder.png';
        const imgSrc = `${WIKI_BASE}/assets/${imgName}`;
        const imgAlt = `${infoboxTitle} Image`;

        // Build attribute rows from custom attrs only
        let attrRows = '';
        if (data.customAttrs) {
            for (const attr of data.customAttrs) {
                if (attr.key && attr.value) {
                    attrRows += `            <tr>\n                <th>${attr.key}</th>\n                <td>${attr.value}</td>\n            </tr>\n`;
                }
            }
        }

        return `    <div class="infobox" style="flex: 0 0 200px; margin-left: 20px;">
        <table>
            <tr>
                <td colspan="2" style="text-align: center; font-weight: bold;">${infoboxTitle}</td>
            </tr>
            <tr>
                <td colspan="2"><img src="${imgSrc}" alt="${imgAlt}" class="infobox-image" style="width: 100%;"></td>
            </tr>
${attrRows}        </table>
    </div>`;
    }

    /**
     * Generate the flex container with intro text + infobox.
     */
    function generateFlexContainer(data) {
        const introHtml = introTextToHtml(data.introText);

        return `<div class="flex-container" style="display: flex; align-items: flex-start;">
    <div style="flex: 1;">
${introHtml}    </div>
${generateInfobox(data)}
</div>`;
    }

    /**
     * Generate a content section (## **Title** + --- + content).
     */
    function generateSection(title, content) {
        if (!content || !content.trim()) return '';

        return `## **${title}**
---
${content.trim()}

`;
    }

    /**
     * Generate the complete page Markdown.
     */
    function generatePage(data) {
        const title = data.title || 'Untitled';

        const parts = [];

        // 1. Frontmatter
        parts.push(generateFrontmatter(data));
        parts.push('');

        // 2. Page title
        parts.push(`# ${title}`);
        parts.push('---');
        parts.push('');

        // 3. Intro + optional infobox
        if (data.infoboxEnabled) {
            // With infobox: mobile style + flex container
            parts.push(generateMobileStyle());
            parts.push('');
            parts.push(generateFlexContainer(data));
        } else {
            // Without infobox: just intro paragraphs
            const introHtml = introTextToHtml(data.introText);
            if (introHtml) {
                parts.push(introHtml.trim());
            }
        }
        parts.push('');

        // 4. Custom sections only
        if (data.customSections) {
            for (const section of data.customSections) {
                if (section.title && section.content) {
                    const custom = generateSection(section.title, section.content);
                    if (custom) parts.push(custom);
                }
            }
        }

        return parts.join('\n');
    }

    /**
     * Generate the manifest.json for .mwp packages.
     */
    function generateManifest(data) {
        const title = data.title || 'Untitled';
        const slug = data.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const category = data.category || 'roles';
        const suggestedPath = data.filePath || `${category}/${slug}`;

        return {
            version: '1.0',
            title: title,
            category: category,
            suggestedPath: suggestedPath,
            fileName: `${slug}.md`,
            infoboxEnabled: !!data.infoboxEnabled,
            createdAt: new Date().toISOString(),
            assets: data.assetFiles ? data.assetFiles.map(f => f.name) : [],
        };
    }

    // Public API
    return {
        generatePage,
        generateManifest,
        generateFrontmatter,
        generateInfobox,
        generateFlexContainer,
        generateSection,
        generateMobileStyle,
        introTextToHtml,
        WIKI_BASE,
    };
})();
