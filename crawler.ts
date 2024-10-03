import * as cheerio from 'cheerio'
import fs from 'fs'
import { parse_robots_file, type IRobotRule } from "./components/robots_parser"
import { fetch_url } from './components/fetch_url'
import { is_content_seen } from './components/is_content_seen'
import { parse } from './components/parse'
import { indexer } from './components/indexer'
import { booleanQueryProcessor } from './components/booleanQueryProcessor'
const seedUrls: string[] = [
    "https://www.dr.dk",
    "https://tv2.dk",
    "https://politiken.dk",
    "https://ekstrabladet.dk",
    "https://www.berlingske.dk",
    "https://www.information.dk",
    "https://videnskab.dk",
    "https://www.au.dk",
    "https://www.cbs.dk",
    "https://www.kum.dk",
    "https://www.dr.dk/p4",
    "https://www.visitdenmark.dk",
    "https://www.ku.dk",
    "https://www.dst.dk",
    "https://www.regeringen.dk",
    "https://www.sundhed.dk",
    "https://www.boligsiden.dk",
    "https://www.jobindex.dk",
    "https://www.dba.dk",
    "https://www.danskindustri.dk"
]

const seedUrlss: string[] = [
    "https://www.dr.dk/",
]

const userAgentName = "PBKCrawler"

const PAGES = 10
const DEFAULT_CRAWL_DELAY = 2000

const processed_urls = new Map<string, string>()
const frontier: string[] = []
const robots_filters = new Map<URL, IRobotRule>()

const visited_hosts_timestamps = new Map<string, number>()

const SIMILARITY_THRESHOLD = 0.95

async function crawler() {
    const start = Date.now()
    frontier.push(...seedUrls)
    for (let i = 0; i < frontier.length; i++) {
        const url = frontier[i]
        if (processed_urls.size === PAGES) break
        console.time('Processed URL: ')

        const parsed_url = parse(url)

        const next_allowed_host_visit = visited_hosts_timestamps.get(parsed_url.host)

        if (next_allowed_host_visit && Date.now() < next_allowed_host_visit) {
            //console.log(`Tried to visit ${parsed_url} but I am not allowed until ${next_allowed_host_visit - Date.now()}`)

            frontier.push(url)
            continue
        }

        if (processed_urls.has(parsed_url.href)) {
            console.log(`${parsed_url} has already been seen. Skipping...`)
            continue
        }

        console.time('fetching page content...')
        const res = await fetch_url(url, userAgentName)
        const cleanedHtml = htmlCleaner(res)
        console.timeEnd('fetching page content...')

        console.time('checking for near duplicates...')
        if (is_content_seen(cleanedHtml, processed_urls, SIMILARITY_THRESHOLD)) {
            console.log(`${parsed_url}'s content has already been seen, near duplicate detected. Skipping...`)
            continue
        }
        console.timeEnd('checking for near duplicates...')

        // console.log(cleanedHtml)
        processed_urls.set(parsed_url.href, cleanedHtml)


        console.time('extracting URLs in page content...')
        const page_urls = extract_page_urls(res, parsed_url.origin)
        console.timeEnd('extracting URLs in page content...')

        console.time('applying URL filter...')
        const filter = await url_filter(parsed_url, page_urls)
        console.timeEnd('applying URL filter...')

        const crawlDelay = filter.robots_file_rules.crawlDelay

        const delay = crawlDelay === 0 ? DEFAULT_CRAWL_DELAY : crawlDelay * 1000
        const current_time = Date.now()
        visited_hosts_timestamps.set(parsed_url.host, current_time + delay)

        frontier.push(...filter.page_urls_to_explore)

        console.timeEnd('Processed URL: ')
        console.log(`${parsed_url}, current frontier size: ${frontier.length}`)
        console.log('\n')

    }
    await fs.promises.writeFile("./output/sites.json", JSON.stringify(Array.from(processed_urls), null, 2), 'utf-8')
    console.time('Generating Inverted Index...')
    const [invertedIndex, docIndex] = await indexer()
    console.timeEnd('Successfully generated Inverted Index')

    let queryString: string = 'radioaktivt OR stof'
    console.log('Searching for: ', queryString)
    booleanQueryProcessor(queryString, invertedIndex, docIndex)

    const end = Date.now()
    const duration_in_seconds = (end - start) / 1000; // Convert to seconds
    const pages_per_second = processed_urls.size / duration_in_seconds

    console.log("Crawler finished!")
    console.log(`Stats:\n
        \tPages collected: ${processed_urls.size}\n
        \tPages per second: ${pages_per_second}\n
        \tTotal time used ${duration_in_seconds} seconds`
    )
}

function htmlCleaner(res: string): string {
    const $ = cheerio.load(res);

    // Remove unwanted tags
    $('script, style, iframe').remove();

    // Extract and clean text
    let cleanedText = $('html *').contents().map(function() {
        return (this.type === 'text') ? $(this).text() : '';
    }).get().join(' ');

    // Replace multiple spaces, newlines, and tabs with a single space
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

    return cleanedText;
}
async function url_filter(url: URL, page_urls: Set<string>): Promise<{ page_urls_to_explore: string[], robots_file_rules: IRobotRule }> {
    const existing_url = robots_filters.get(url)
    if (existing_url !== undefined) return { page_urls_to_explore: [], robots_file_rules: existing_url }

    const res = await fetch(url.origin + "/robots.txt", { headers: { 'User-Agent': userAgentName } })
    const robots_file = await res.text()

    let robots_file_rules = parse_robots_file(robots_file, url.toString())

    // no robots.txt? No rules 😎
    if (!res.ok) robots_file_rules = { allows: [], disallows: [], crawlDelay: 0 }

    robots_filters.set(url, robots_file_rules)

    const page_urls_to_explore: string[] = []
    for (const page_url of page_urls) {
        const violates_robot_rules = robots_file_rules?.disallows.find(rule => rule === page_url) !== undefined
        if (violates_robot_rules) {
            console.log(`Exploring subpage url: ${page_url} violates the robot.txt rules, skipping...`)
            continue
        }
        page_urls_to_explore.push(page_url)
    }

    return { page_urls_to_explore, robots_file_rules }
}

function extract_page_urls(res: string, baseUrl: string): Set<string> {
    const $ = cheerio.load(res)
    const links = new Set<string>()

    $('a').each((index, element) => {
        const href = $(element).attr('href')
        if (href) {
            if (is_valid_url(href)) {
                // Convert relative URL to absolute URL
                const absoluteUrl = new URL(href, baseUrl).toString()
                links.add(absoluteUrl)
            }
        }
    })

    return links
}

// https://stackoverflow.com/a/5717133
function is_valid_url(str: string) {
    var pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
        '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
        '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
        '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
    return !!pattern.test(str)
}

crawler()
