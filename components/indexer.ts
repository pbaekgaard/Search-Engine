import fs from 'fs'
const invertedIndex = new Map<string, invertedIndexEntry>()
export type docFreqPair = {
    docid: number,
    termFreq: number
}
export type invertedIndexEntry = {
    posting: docFreqPair[],
    idf: number
}

export async function indexer(): Promise<[Map<string, invertedIndexEntry>, number[]]> {
    const crawled_urls = await parse_input();
    const docIndex: number[] = [];
    let docid = 0;

    for (const element of crawled_urls.values()) {
        docIndex.push(docid);
        let tokens: string[] = tokenizer(element);

        tokens.forEach((token) => {
            const iie = invertedIndex.get(token);

            if (!iie) {
                // If token doesn't exist in the inverted index, add it with docid and termFreq 1
                const newInvertedIndexEntry: invertedIndexEntry = { posting: [{ docid: docid, termFreq: 1 }], idf: 1 }
                invertedIndex.set(token, newInvertedIndexEntry);
            } else {
                // Check if docid is already in the postings
                const posting = iie.posting.find(post => post.docid === docid);

                if (!posting) {
                    // If docid isn't in the postings, add it with termFreq 1
                    iie.posting.push({ docid: docid, termFreq: 1 });
                } else {
                    // If docid exists, increment its termFreq
                    posting.termFreq += 1;
                }
            }
        });


        docid++;
    }
    invertedIndex.forEach((iie: invertedIndexEntry, term: string) => {
        iie.posting.forEach((document: docFreqPair) => {
            const termFreq = document.termFreq
            const wt = (1 + Math.log10(termFreq)) * iie.idf
            document.termFreq = wt
        })
    })

    // Calculate IDF for each term in the inverted index
    const totalDocs = docIndex.length;
    for (const [term, iie] of invertedIndex.entries()) {
        const docFreq = iie.posting.length; // Number of documents containing the term
        if (docFreq > 0) {
            // Calculate IDF using the formula: idf = log(totalDocs / docFreq)
            iie.idf = Math.log(totalDocs / docFreq);
        } else {
            iie.idf = 0; // Set IDF to 0 if no documents contain the term
        }
    }


    console.log("Finished time to return");
    return [invertedIndex, docIndex];
}

async function parse_input(): Promise<Map<string, string>> {
    const jsonData = await fs.promises.readFile("./output/sites.json", 'utf-8')

    const mapArray: [string, string][] = JSON.parse(jsonData)
    console.log(mapArray.length)
    return new Map(mapArray)
}


function tokenizer(text: string): string[] {
    // Step 1: Normalize text
    let normalizedText = text
        .toLowerCase() // Convert to lowercase
        .replace(/[^\p{L}\p{N}\s]/gu, '') // Remove punctuation, but keep letters (including æøå) and numbers
        .replace(/\d+/g, ''); // Optionally remove numbers

    // Step 2: Tokenize by splitting by spaces
    normalizedText = normalizedText.replace(/\s{2,}/g, ' ').trim()
    const tokens = normalizedText.split(/\s+/).filter(token => token.length > 0);


    // Step 3: Optionally remove stopwords (adjusted for Danish)
    const stopwords = new Set(['og', 'i', 'på', 'er', 'af', 'til', 'med', 'for']); // Example Danish stopwords
    const filteredTokens = tokens.filter(token => !stopwords.has(token));

    return filteredTokens;
}

