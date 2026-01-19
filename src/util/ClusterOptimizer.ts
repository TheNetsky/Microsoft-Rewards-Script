import { cpus, totalmem, freemem } from 'os'

/**
 * Optimal cluster configuration calculator
 * Determines the best number of worker clusters based on system resources and account count
 */
export class ClusterOptimizer {
    private static readonly MIN_MEMORY_PER_CLUSTER_MB = 128 // Minimum memory per cluster in MB (reduced from 256)
    private static readonly CLUSTERS_PER_ACCOUNT = 2 // Target 2 clusters per account
    private static readonly MAX_CPU_UTILIZATION = 1.0 // Use up to 100% of available CPUs

    /**
     * Calculate optimal number of clusters
     * @param accountCount Total number of accounts to process
     * @param providedClusters User-provided cluster count (if any)
     * @returns Optimal number of clusters to use
     */
    public static calculateOptimalClusters(
        accountCount: number,
        providedClusters?: number
    ): number {
        // If user explicitly provided a cluster count, use it
        if (providedClusters !== undefined && providedClusters > 0) {
            return providedClusters
        }

        // Target: 2 clusters per account
        const clustersFromAccounts = accountCount * this.CLUSTERS_PER_ACCOUNT

        // Calculate based on available CPU cores
        const cpuCount = cpus().length
        const optimalClustersFromCPU = Math.max(1, Math.floor(cpuCount * this.MAX_CPU_UTILIZATION))

        // Calculate based on available memory
        const optimalClustersFromMemory = this.calculateClustersFromMemory()

        // Take the minimum of all constraints
        const optimalClusters = Math.min(
            clustersFromAccounts,
            optimalClustersFromCPU,
            optimalClustersFromMemory
        )

        return Math.max(1, optimalClusters)
    }

    /**
     * Calculate maximum number of clusters based on available memory
     * @returns Maximum clusters supported by available memory
     */
    private static calculateClustersFromMemory(): number {
        const usableMemory = this.getUsableMemoryMB()
        const requiredMemory = this.MIN_MEMORY_PER_CLUSTER_MB + 512 // Add 512MB for main process

        return Math.max(1, Math.floor(usableMemory / requiredMemory))
    }

    /**
     * Get usable memory in MB (80% of total to avoid system starvation)
     * @returns Usable memory in megabytes
     */
    private static getUsableMemoryMB(): number {
        const total = totalmem()

        // Use 80% of total memory to avoid system starvation
        const usable = Math.floor(total * 0.8)

        return Math.floor(usable / (1024 * 1024))
    }

    /**
     * Get system resource information for logging
     * @returns System info object
     */
    public static getSystemInfo(): {
        cpuCount: number
        totalMemoryMB: number
        freeMemoryMB: number
        usableMemoryMB: number
    } {
        const totalMemory = totalmem()
        const freeMemoryBytes = freemem()
        const usableMemory = Math.floor(totalMemory * 0.8)

        return {
            cpuCount: cpus().length,
            totalMemoryMB: Math.floor(totalMemory / (1024 * 1024)),
            freeMemoryMB: Math.floor(freeMemoryBytes / (1024 * 1024)),
            usableMemoryMB: Math.floor(usableMemory / (1024 * 1024))
        }
    }
}
