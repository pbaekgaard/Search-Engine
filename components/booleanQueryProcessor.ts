const KEYWORDS: string[] = ["OR", "AND", "NOT"]
const freqArray: Map<string, invertedIndexEntry>[] = []
import type { invertedIndexEntry } from "./indexer"
import type { docFreqPair } from "./indexer"

export function booleanQueryProcessor(query: string, invertedIndex: Map<string, invertedIndexEntry>, docIndex: number[]): number[] {
    const result: number[] = []
    const terms = query.split(" ")
    for (let i = 0; i < terms.length; i++) {
        if (terms[i]) {
            if (!KEYWORDS.includes(terms[i])) {
                const emptyDocFreqPair: docFreqPair = { docid: 0, termFreq: 0 }
                const emptyPosting: invertedIndexEntry = { posting: [emptyDocFreqPair], idf: 0 }
                const invertedContent = invertedIndex.get(terms[i]) ? invertedIndex.get(terms[i])! : emptyPosting

                const termMap = new Map<string, invertedIndexEntry>([[terms[i], invertedContent]])
                freqArray.push(termMap)
            }
            else {
                // Insert as keyword
                const keywordPosting: invertedIndexEntry = { posting: [], idf: -1 }
                freqArray.push(new Map<string, invertedIndexEntry>([[terms[i], keywordPosting]]))
            }
        }
    }

    while (containsKeyword(freqArray, KEYWORDS)) {
        for (const [idx, map] of freqArray.entries()) {
            if (map.has('OR')) {
                const left = freqArray[idx - 1].entries().next().value!
                const right = freqArray[idx + 1].entries().next().value!
                console.log(left)
                // if (right[0] == 'NOT') {
                //     let not = right
                //     let notRight = freqArray[idx + 2].entries().next().value!
                //
                //     // NOT(notRight, idx + 1, docIndex)
                // }
                OR(left[1], right[1], idx)
                break;
            }
        }
        for (const [idx, map] of freqArray.entries()) {
            if (map.has('AND')) {
                if (freqArray[idx + 1].has('NOT')) {
                    NOT(freqArray[idx + 2].entries().next().value![1], idx + 1, docIndex)
                    break
                }
                if (freqArray[idx - 2]) {
                    if (freqArray[idx - 2].has('NOT')) {
                        NOT(freqArray[idx - 1].entries().next().value![1], idx - 2, docIndex)
                        break
                    }
                }

                AND(freqArray[idx - 1].entries().next().value![1], freqArray[idx + 1].entries().next().value![1], idx)
                break;
            }

        }
        for (const [idx, map] of freqArray.entries()) {
            if (map.has('NOT')) {
                NOT(freqArray[idx + 1].entries().next().value![1], idx, docIndex)
                break;
            }

        }
    }
    console.log("Resulting page document id's are: ", freqArray[0].entries().next().value![1])
    return result
}

function AND(post1: number[], post2: number[], idx: number): void {
    const result: number[] = []
    const set1 = new Set(post1)
    for (const num of post2) {
        if (set1.has(num)) {
            result.push(num)
        }
    }
    const left = freqArray[idx - 1].entries().next().value!
    const right = freqArray[idx + 1].entries().next().value!
    const leftName = left[0]
    const rightName = right[0]
    const newName = leftName + 'AND' + rightName
    const newMap = new Map<string, number[]>([[newName, result]])
    freqArray[idx] = newMap
    removeAtIndex(freqArray, idx - 1)
    removeAtIndex(freqArray, idx)
}

function OR(post1: invertedIndexEntry, post2: invertedIndexEntry, idx: number): void {
    const result = union(post1, post2)
    const left = freqArray[idx - 1].entries().next().value!
    const right = freqArray[idx + 1].entries().next().value!
    const leftName = left[0]
    const rightName = right[0]
    const newName = leftName + 'OR' + rightName
    const newMap = new Map<string, number[]>([[newName, result]])
    freqArray[idx] = newMap
    removeAtIndex(freqArray, idx - 1)
    removeAtIndex(freqArray, idx)
}

function NOT(post2: number[], idx: number, docIndex: number[]): void {
    const complement = new Set(docIndex)
    console.log(complement)
    for (let num of post2) {
        if (complement.has(num)) {
            complement.delete(num)
        }
    }
    console.log(complement)
    const rightName = freqArray[idx + 1].entries().next().value![0]
    const newName = 'NOT' + rightName
    const result: number[] = Array.from(complement)
    const newMap = new Map<string, number[]>([[newName, result]])
    freqArray[idx] = newMap
    removeAtIndex(freqArray, idx + 1)

}

function removeAtIndex<T>(array: T[], index: number): T[] {
    if (index >= 0 && index < array.length) {
        array.splice(index, 1); // Remove 1 element at the specified index
    }
    return array;
}

function union(array1: number[], array2: number[]): number[] {
    return array1.concat(array2.filter(item => !array1.includes(item)));
}

function getAllIndexes(arr: any[], value: any): number[] {
    return arr.reduce((acc: number[], elem, index) => {
        if (elem === value) acc.push(index);
        return acc;
    }, []);
}

function containsKeyword(arr: Map<string, posting>[], keywords: string[]) {
    for (const map of arr) {
        for (const key of map.keys()) {
            if (keywords.includes(key)) {
                return true
            }
        }
    }
    return false
}
