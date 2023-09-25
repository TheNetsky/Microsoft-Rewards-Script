// Chrome Product Data
export interface ChromeVersion {
    timestamp: Date;
    channels: Channels;
}

export interface Channels {
    Stable: Beta;
    Beta: Beta;
    Dev: Beta;
    Canary: Beta;
}

export interface Beta {
    channel: string;
    version: string;
    revision: string;
}

// Edge Product Data
export interface EdgeVersion {
    Product: string;
    Releases: Release[];
}

export interface Release {
    ReleaseId: number;
    Platform: Platform;
    Architecture: Architecture;
    CVEs: string[];
    ProductVersion: string;
    Artifacts: Artifact[];
    PublishedTime: Date;
    ExpectedExpiryDate: Date;
}

export enum Architecture {
    Arm64 = 'arm64',
    Universal = 'universal',
    X64 = 'x64',
    X86 = 'x86'
}

export interface Artifact {
    ArtifactName: string;
    Location: string;
    Hash: string;
    HashAlgorithm: HashAlgorithm;
    SizeInBytes: number;
}

export enum HashAlgorithm {
    Sha256 = 'SHA256'
}

export enum Platform {
    Android = 'Android',
    IOS = 'iOS',
    Linux = 'Linux',
    MACOS = 'MacOS',
    Windows = 'Windows'
}