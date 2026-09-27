const express = require('express');
const cors = require('cors');
const ogs = require('open-graph-scraper');
const sizeOf = require('image-size');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

app.post('/api/inspect', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        url = url.trim();

        // 1. FLEXIBLE GITHUB REPOSITORY DETECTION
        const githubMatch = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(\/.*)?$/i);
        const isRepoMainPage = githubMatch && (!githubMatch[3] || githubMatch[3] === '/');

        if (isRepoMainPage) {
            const owner = githubMatch[1];
            const repo = githubMatch[2];
            const apiHeaders = { 
                'User-Agent': 'Goblin-Specs-App',
                'Accept': 'application/vnd.github+json'
            };

            const [repoRes, langRes, pkgRes] = await Promise.all([
                fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: apiHeaders }),
                fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers: apiHeaders }),
                fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`, { headers: apiHeaders }).catch(() => null)
            ]);

            if (!repoRes.ok) {
                return res.status(404).json({ error: 'The goblin scouts could not find this GitHub repository.' });
            }

            const repoData = await repoRes.json();
            const languages = langRes.ok ? await langRes.json() : {};
            let packageInfo = null;
            
            if (pkgRes && pkgRes.ok) {
                try {
                    const pkgJson = await pkgRes.json();
                    packageInfo = {
                        name: pkgJson.name || repo,
                        version: pkgJson.version || '1.0.0',
                        nodeVersion: pkgJson.engines?.node || 'Not specified',
                        dependencies: pkgJson.dependencies ? Object.keys(pkgJson.dependencies) : []
                    };
                } catch (e) {
                    packageInfo = { note: 'package.json found but unparseable.' };
                }
            }

            return res.json({
                success: true,
                type: 'github_repo',
                repoName: repoData.full_name,
                description: repoData.description,
                stars: repoData.stargazers_count,
                forks: repoData.forks_count,
                languages,
                packageInfo,
                imageUrl: repoData.owner.avatar_url
            });
        }

        // 2. GITHUB BLOB / FILE CONVERSION
        if (url.includes('github.com') && url.includes('/blob/')) {
            url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        }

        const isDirectImage = /\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$|\/raw\//i.test(url) || url.includes('raw.githubusercontent.com');
        let imageUrl = null;

        if (isDirectImage) {
            imageUrl = url;
        } else {
            // 3. SOCIAL MEDIA & GENERAL WEB SCRAPER WITH FALLBACK
            const userAgentString = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
            try {
                const { result } = await ogs({ 
                    url: url, 
                    timeout: 6000,
                    fetchOptions: { 
                        headers: { 
                            'user-agent': userAgentString,
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        } 
                    }
                });
                imageUrl = result.ogImage && result.ogImage.url ? result.ogImage.url : null;
            } catch (scrapeErr) {
                console.warn("Scraper warning:", scrapeErr.message);
            }
        }

        if (!imageUrl) {
            return res.status(422).json({ 
                error: 'The goblin scouts could not extract preview media from this link due to platform security blocks.' 
            });
        }

        // Fetch image binary to compute media dimensions & aspect ratios
        const imageRes = await fetch(imageUrl, {
            headers: { 'User-Agent': 'Goblin-Specs-App' }
        });
        
        if (!imageRes.ok) throw new Error(`Failed to fetch image binary (HTTP ${imageRes.status})`);
        
        const arrayBuffer = await imageRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const dimensions = sizeOf(buffer);
        const width = dimensions.width;
        const height = dimensions.height;

        const divisor = gcd(width, height);
        const ratioText = `${width / divisor}:${height / divisor}`;
        const decimalRatio = width / height;

        let recommendation = "Standard Web Media";
        if (decimalRatio === 1) recommendation = "Square Post (Instagram / Facebook)";
        else if (decimalRatio < 0.7) recommendation = "Vertical Story / Reel / TikTok (9:16)";
        else if (decimalRatio > 1.7) recommendation = "Widescreen / YouTube Thumbnail (16:9)";

        res.json({
            success: true,
            type: 'media_specs',
            imageUrl,
            width,
            height,
            aspectRatio: ratioText,
            recommendation
        });

    } catch (error) {
        console.error("Inspection error:", error);
        res.status(500).json({ error: 'The pixel goblins failed to parse this link.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Goblin_specs server crawling on port ${PORT}`));
