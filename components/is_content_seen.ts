import { near_duplicates } from "../lib/nearDuplicates";

export function is_content_seen(content: string, frontier: Map<string, string>, SIMILARITY_THRESHOLD: number): boolean {
    for (const index_content of frontier.values()) {
        const jaccard = near_duplicates(content, index_content)
        if (jaccard >= SIMILARITY_THRESHOLD) return true
    }

    return false;
}
