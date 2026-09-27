async function inspectLink() {
    const urlInput = document.getElementById('urlInput');
    const btn = document.getElementById('inspectBtn');
    const url = urlInput.value.trim();

    if (!url) {
        alert('Please feed a valid link to the goblins first!');
        return;
    }

    btn.innerText = 'Foraging...';
    btn.disabled = true;

    try {
        const response = await fetch('http://localhost:3000/api/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();

        if (response.ok && data.success) {
            document.getElementById('previewImg').src = data.imageUrl;
            document.getElementById('ratioOutput').innerText = `Aspect Ratio: ${data.aspectRatio}`;
            document.getElementById('dimOutput').innerText = `${data.width} x ${data.height}`;
            document.getElementById('recOutput').innerText = data.recommendation;
            document.getElementById('resultCard').style.display = 'block';
        } else {
            alert(data.error || 'The goblins failed to analyze this link.');
        }
    } catch (err) {
        console.error(err);
        alert('Server connection failed.');
    } finally {
        btn.innerText = 'Inspect';
        btn.disabled = false;
    }
}
