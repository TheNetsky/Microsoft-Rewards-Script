export interface GoogleSearch {
    topic: string;
    related: string[];
}

export interface CNSearch {
    title: string;
}

export type BingSearch = { GoogleSearch: GoogleSearch } | { CNSearch: CNSearch };
