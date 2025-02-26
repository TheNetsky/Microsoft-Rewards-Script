import { log } from './Logger';

export class LogTimeoutMonitor {
    private lastActivityTime: number;
    private timeoutMs: number;
    private timeoutHandle: NodeJS.Timeout | null;
    
    constructor(timeoutMinutes: number = 30) {
        this.lastActivityTime = Date.now();
        this.timeoutMs = timeoutMinutes * 60 * 1000;
        this.timeoutHandle = null;
    }

    public start() {
        this.timeoutHandle = setInterval(() => {
            const timeSinceLastActivity = Date.now() - this.lastActivityTime;
            if (timeSinceLastActivity >= this.timeoutMs) {
                log('main', 'TIMEOUT', `No activity detected for ${this.timeoutMs/60000} minutes. Terminating process...`, 'warn');
                this.cleanup();
                process.exit(1);
            }
        }, 60000); // Check every minute
    }

    public updateActivity() {
        this.lastActivityTime = Date.now();
    }

    public cleanup() {
        if (this.timeoutHandle) {
            clearInterval(this.timeoutHandle);
        }
    }
}
