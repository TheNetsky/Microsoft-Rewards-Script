import { exec } from 'child_process';
import { loadConfig } from './Load';

export async function Ntfy(message: string, type: 'log' | 'warn' | 'error' = 'log'): Promise<void> {
    const config = loadConfig();
    if (!config.ntfy.enabled || !config.ntfy.url || !config.ntfy.topic) {
        return;
    }

    const ntfyUrl = `${config.ntfy.url}/${config.ntfy.topic}`;
    const priority = type === 'error' ? 'max' : type === 'warn' ? 'high' : 'default';
    const tags = type === 'error' ? 'rotating_light' : type === 'warn' ? 'warning' : 'information_source';

    let curlCommand = `curl -X POST "${ntfyUrl}" -d "${message}" -H "Title: Microsoft Rewards Script" -H "Priority: ${priority}" -H "Tags: ${tags}"`;

    if (config.ntfy.authToken) {
        curlCommand += ` -H "Authorization: Bearer ${config.ntfy.authToken}"`;
    }

    exec(curlCommand, (error) => {
        if (error) {
            console.error(`❌ Failed to send Ntfy notification: ${error.message}`);
        }
    });
}