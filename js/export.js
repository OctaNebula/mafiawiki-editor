/**
 * export.js — Handles .mwp file export and import.
 * .mwp is a renamed .zip containing:
 *   - manifest.json (metadata)
 *   - page.md (the generated Markdown)
 *   - assets/ (uploaded images)
 */

const MWExport = (() => {

    /**
     * Export the current editor state as a .mwp file.
     * @param {Object} data - Editor state data
     * @param {Array} imageFiles - Array of {name, file} objects for uploaded images
     */
    async function exportMwp(data, imageFiles) {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip library not loaded');
        }

        const zip = new JSZip();

        // 1. Generate the Markdown content
        const markdownContent = MWTemplates.generatePage(data);

        // 2. Generate the manifest
        const manifest = MWTemplates.generateManifest({
            ...data,
            assetFiles: imageFiles,
        });

        // 3. Add manifest.json
        zip.file('manifest.json', JSON.stringify(manifest, null, 2));

        // 4. Add page.md
        zip.file('page.md', markdownContent);

        // 5. Add assets
        if (imageFiles && imageFiles.length > 0) {
            const assetsFolder = zip.folder('assets');
            for (const img of imageFiles) {
                if (img.file) {
                    const arrayBuf = await img.file.arrayBuffer();
                    assetsFolder.file(img.name, arrayBuf);
                }
            }
        }

        // 6. Generate the zip and trigger download
        const blob = await zip.generateAsync({ type: 'blob' });

        // Use the slug/title for the filename
        const slug = data.slug || (data.title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const filename = `${slug}.mwp`;

        if (typeof saveAs !== 'undefined') {
            saveAs(blob, filename);
        } else {
            // Fallback download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        return filename;
    }

    /**
     * Import a .mwp file and return the parsed data.
     * @param {File} file - The .mwp file to import
     * @returns {Object} Parsed editor state
     */
    async function importMwp(file) {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip library not loaded');
        }

        const zip = await JSZip.loadAsync(file);

        // Read manifest
        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) {
            throw new Error('Invalid .mwp file: missing manifest.json');
        }
        const manifest = JSON.parse(await manifestFile.async('string'));

        // Read page.md
        const pageFile = zip.file('page.md');
        if (!pageFile) {
            throw new Error('Invalid .mwp file: missing page.md');
        }
        const pageContent = await pageFile.async('string');

        // Read assets
        const imageFiles = [];
        const assetsFolder = zip.folder('assets');
        if (assetsFolder) {
            const assetEntries = [];
            assetsFolder.forEach((relativePath, entry) => {
                if (!entry.dir) {
                    assetEntries.push({ name: relativePath, entry });
                }
            });

            for (const { name, entry } of assetEntries) {
                const blob = await entry.async('blob');
                const file = new File([blob], name, { type: guessMimeType(name) });
                imageFiles.push({ name, file, url: URL.createObjectURL(blob) });
            }
        }

        // Parse the Markdown to extract editor state
        const editorData = parsePageMarkdown(pageContent, manifest);

        return {
            ...editorData,
            imageFiles,
            manifest,
        };
    }

    /**
     * Parse a wiki page's Markdown back into editor state.
     * This handles the reverse of what templates.js generates.
     */
    function parsePageMarkdown(content, manifest) {
        const data = {
            pageType: manifest?.type || 'custom',
            title: '',
            description: '',
            filePath: manifest?.suggestedPath || '',
            introText: '',
            ingameContent: '',
            tipsContent: '',
            triviaContent: '',
            customSections: [],
            infoboxTitle: '',
            roleTeam: 'Good',
            roleGoal: '',
            roleMaxPlayers: '',
            mapStatus: 'Active',
            mapLockers: '0',
            mapClosets: '0',
            mapRooms: '0',
            customAttrs: [],
        };

        // Extract frontmatter
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
            const fm = fmMatch[1];
            const titleMatch = fm.match(/^title:\s*(.+)$/m);
            const descMatch = fm.match(/^description:\s*(.+)$/m);
            const socialMatch = fm.match(/^social_image:\s*(.+)$/m);
            const bgMatch = fm.match(/^background:\s*(.+)$/m);

            if (titleMatch) {
                let t = titleMatch[1].trim();
                // Strip "The " prefix for role pages
                if (data.pageType === 'role' && t.startsWith('The ')) {
                    t = t.slice(4);
                }
                data.title = t;
            }
            if (descMatch) data.description = descMatch[1].trim();
            if (socialMatch) {
                const sImg = socialMatch[1].trim();
                data.socialImageName = sImg.replace(/^\/assets\//, '');
            }
            if (bgMatch) {
                const bImg = bgMatch[1].trim();
                data.bgImageName = bImg.replace(/^\/assets\//, '');
            }

            // Remove frontmatter from content for further parsing
            content = content.slice(fmMatch[0].length).trim();
        }

        // Extract the H1 title (# Title)
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match && !data.title) {
            let t = h1Match[1].replace(/\*\*/g, '').trim();
            if (data.pageType === 'role' && t.startsWith('The ')) {
                t = t.slice(4);
            }
            data.title = t;
        }

        // Extract infobox content from the HTML table
        const infoboxTitleMatch = content.match(/<td colspan="2" style="text-align: center; font-weight: bold;">(.+?)<\/td>/);
        if (infoboxTitleMatch) {
            data.infoboxTitle = infoboxTitleMatch[1];
        }

        // Extract infobox attributes
        const attrRegex = /<th>(.+?)<\/th>\s*<td>(.+?)<\/td>/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(content)) !== null) {
            const key = attrMatch[1];
            const val = attrMatch[2];

            if (data.pageType === 'role') {
                if (key === 'Team') data.roleTeam = val;
                else if (key === 'Goal') data.roleGoal = val;
                else if (key === 'Max Players') data.roleMaxPlayers = val;
            } else if (data.pageType === 'map') {
                if (key === 'Status') data.mapStatus = val;
                else if (key === 'Lockers') data.mapLockers = val;
                else if (key === 'Closets') data.mapClosets = val;
                else if (key === 'Rooms') data.mapRooms = val;
            } else {
                data.customAttrs.push({ key, value: val });
            }
        }

        // Extract intro text from the flex container's first div
        const introMatch = content.match(/<div style="flex: 1;">\s*([\s\S]*?)\s*<\/div>\s*<div class="infobox"/);
        if (introMatch) {
            let introHtml = introMatch[1].trim();
            // Convert back from HTML to markdown-like text
            introHtml = introHtml.replace(/<p>/g, '');
            introHtml = introHtml.replace(/<\/p>/g, '\n\n');
            introHtml = introHtml.replace(/<b>/g, '**');
            introHtml = introHtml.replace(/<\/b>/g, '**');
            introHtml = introHtml.replace(/<i>/g, '*');
            introHtml = introHtml.replace(/<\/i>/g, '*');
            data.introText = introHtml.trim();
        }

        // Extract sections (## **Title** + --- + content)
        const sectionRegex = /## \*\*(.+?)\*\*\s*\n---\n([\s\S]*?)(?=\n## \*\*|$)/g;
        let sectionMatch;
        while ((sectionMatch = sectionRegex.exec(content)) !== null) {
            const sectionTitle = sectionMatch[1];
            const sectionContent = sectionMatch[2].trim();

            if (sectionTitle === 'In-Game') {
                data.ingameContent = sectionContent;
            } else if (sectionTitle === 'Tips and Tricks') {
                data.tipsContent = sectionContent;
            } else if (sectionTitle === 'Trivia') {
                data.triviaContent = sectionContent;
            } else {
                data.customSections.push({ title: sectionTitle, content: sectionContent });
            }
        }

        return data;
    }

    /**
     * Guess MIME type from file extension.
     */
    function guessMimeType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const types = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
        };
        return types[ext] || 'application/octet-stream';
    }

    return {
        exportMwp,
        importMwp,
        parsePageMarkdown,
    };
})();
