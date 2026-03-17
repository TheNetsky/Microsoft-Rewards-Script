export default class NextParser {
    /**
     * Parse Next.js streaming data from HTML (self.__next_f.push)
     */
    public parse(html: string): any[] {
        const regex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g
        let match
        let stream = ''

        while ((match = regex.exec(html)) !== null) {
            if (match[1]) {
                // Unescape characters that Next.js uses in its stream
                stream += match[1]
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\\\/g, '\\')
            }
        }

        const results: any[] = []
        // Look for common patterns in the combined stream
        try {
            // More generic pattern to find objects that look like activities
            const patterns = [
                /\{"dailySetItems":\[.*?\]\}/g,
                /\{"moreActivities":\[.*?\]\}/g,
                /\{"availablePoints":\d+.*?\}/g,
                /\{"streak":\{.*?\}/g,
                /\{"offerId":".*?","title":".*?","destination":".*?"\}/g
            ]

            for (const pattern of patterns) {
                let m
                while ((m = pattern.exec(stream)) !== null) {
                    try {
                        const parsed = JSON.parse(m[0])
                        results.push(parsed)
                    } catch {
                        /* skip */
                    }
                }
            }

            // Extract ALL objects from the stream aggressively
            // This regex finds JSON objects
            const jsonRegex = /\{(?:[^{}]|\{[^{}]*\})*\}/g
            let matchJson
            while ((matchJson = jsonRegex.exec(stream)) !== null) {
                try {
                    const parsed = JSON.parse(matchJson[0])
                    if (
                        matchJson[0].includes('offerId') ||
                        matchJson[0].includes('title') ||
                        matchJson[0].includes('Points')
                    ) {
                        results.push(parsed)
                    }
                } catch {
                    /* skip */
                }
            }
        } catch (e) {}

        return results
    }

    public find(data: any, key: string): any {
        if (!data) return undefined
        if (Array.isArray(data)) {
            for (const i of data) {
                const r = this.find(i, key)
                if (r !== undefined) return r
            }
        } else if (typeof data === 'object') {
            if (data[key] !== undefined) return data[key]
            for (const k in data) {
                const r = this.find(data[k], key)
                if (r !== undefined) return r
            }
        }
        return undefined
    }
}
