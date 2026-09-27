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
        // 1. PLATFORM DETECTION
        const isGitHubRepo = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(\/)?$/i.test(url);
        const isInstagram = /instagram\.com/i.test(url);
        const isFacebook = /facebook\.com/i.test(url);
        const isTwitter = /(twitter\.com|x\.com)/i.test(url);
        const isReddit = /reddit\.com/i.test(url);

        // 2. GITHUB REPOSITORY ANALYZER
        if (isGitHubRepo) {
            const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            const owner = match[1];
            const repo = match[2].replace('.git', '');
            const apiHeaders = { 'User-Agent': 'Goblin-Specs-App' };

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

        // 3. MEDIA & SOCIAL PLATFORM INSPECTION
        if (url.includes('github.com') && url.includes('/blob/')) {
            url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        }

        const isDirectImage = /\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i.test(url) || url.includes('raw.githubusercontent.com');
        let imageUrl = null;

        if (isDirectImage) {
            imageUrl = url;
        } else {
            // Attempt scraping for web pages and social previews with custom browser headers
            const userAgentString = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
            try {
                const { result } = await ogs({ 
                    url: url, 
                    timeout: 6000,
                    fetchOptions: { 
                        headers: { 
                            'user-agent': userAgentString,
                            'Accept-Language': 'en-US,en;q=0.9'
                        } 
                    }
                });
                imageUrl = result.ogImage && result.ogImage.url ? result.ogImage.url : null;
            } catch (scrapeErr) {
                console.warn("Scraper warning:", scrapeErr.message);
            }
        }

        // Graceful handling for heavily restricted social platforms
        if (!imageUrl) {
            let platformName = "Web Page";
            if (isInstagram) platformName = "Instagram";
            else if (isFacebook) platformName = "Facebook";
            else if (isTwitter) platformName = "X (Twitter)";
            else if (isReddit) platformName = "Reddit";

            return res.status(422).json({ 
                error: `The ${platformName} security wall blocked the goblin scouts from extracting preview media directly. Try a direct image URL or public repository link!` 
            });
        }

        // Fetch image binary to compute media dimensions & aspect ratios
        const imageRes = await fetch(imageUrl);
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
