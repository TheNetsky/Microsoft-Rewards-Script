import axios from 'axios';
import { loadConfig } from './Load';

export async function Ntfy(content: string) {
    const config = loadConfig();
    const ntfy = config.ntfy;

    if (!ntfy.enabled || ntfy.url.length < 10 || !ntfy.topic) return;

    const request = {
        method: 'POST',
        url: `${ntfy.url}/${ntfy.topic}`, // Sends to the correct topic
        headers: {
            'Content-Type': 'text/plain',
            'Authorization': `Bearer ${ntfy.authToken}` // If authToken is required
        },
        data: content
    };

    await axios(request).catch((err) => console.error("NTFY Error:", err));
}
