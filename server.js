const express = require('express');
const cors = require('cors');
const ogs = require('open-graph-scraper');
const sizeOf = require('image-size');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper function to find the Greatest Common Divisor for aspect ratio
function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

app.post('/api/inspect', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        // Fetch OpenGraph metadata with custom browser headers to bypass blocks
        const userAgentString = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
        const { result } = await ogs({ 
            url: url, 
            timeout: 5000,
            fetchOptions: {
                headers: {
                    'user-agent': userAgentString
                }
            }
        });
        
        const imageUrl = result.ogImage && result.ogImage.url ? result.ogImage.url : null;

        if (!imageUrl) {
            return res.status(404).json({ error: 'The goblin scouts could not extract preview media from this link.' });
        }

        // Fetch the image buffer to calculate dimensions
        const imageRes = await fetch(imageUrl);
        const arrayBuffer = await imageRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const dimensions = sizeOf(buffer);
        const width = dimensions.width;
        const height = dimensions.height;

        // Calculate aspect ratio
        const divisor = gcd(width, height);
        const ratioText = `${width / divisor}:${height / divisor}`;
        const decimalRatio = width / height;

        // Platform compatibility check rules
        let recommendation = "Standard Web Media";
        if (decimalRatio === 1) recommendation = "Square Post (Instagram / Facebook)";
        else if (decimalRatio < 0.7) recommendation = "Vertical Story / Reel / TikTok (9:16)";
        else if (decimalRatio > 1.7) recommendation = "Widescreen / YouTube Thumbnail (16:9)";

        res.json({
            success: true,
            imageUrl,
            width,
            height,
            aspectRatio: ratioText,
            recommendation
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'The pixel goblins failed to parse this link.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Goblin_specs server crawling on port ${PORT}`));
