import chalk from "chalk";
import fetch from "node-fetch-extra";
import { JSDOM } from "jsdom";
import { error } from "./index";
import { Chapter, ScraperError, ScraperResponse } from "../types";
import { Scraper, SearchOptions } from "./types";
import { getProviderId, isProviderId } from "../routers/manga-page";
import updateManga from "../util/updateManga";

export class comicextraClass extends Scraper {
	constructor() {
		super();
		this.provider = "ComicExtra";
		this.canSearch = true;
		this.nsfw = true;
	}

	public async search(query: string, options?: Partial<SearchOptions>) {
		// This is a better way of destructuring with default values
		// than doing it at the top. This took... many hours. Thanks Pandawan!
		const { resultCount } = {
			resultCount: 40,
			...options,
		};

		let pageUrl: string;

		if (query === "") {
			// Get popular page
			pageUrl = "https://www.comicextra.com/popular-comic";
		} else {
			pageUrl = `https://www.comicextra.com/comic-search?key=${encodeURIComponent(
				query
			)}`;
		}

		// Fetch DOM for relevant page
		const pageReq = await fetch(pageUrl);
		const pageHtml = await pageReq.text();

		// Get DOM for popular page
		const dom = new JSDOM(pageHtml);
		const document = dom.window.document;

		// Get nodes
		const anchors = [...document.querySelectorAll(".cartoon-box")].map((box) =>
			box.querySelector("a")
		);

		// Get IDs from nodes
		const ids = anchors.map((anchor) => anchor.href.split("/comic/").pop());
		console.log(ids);

		// Get details for each search result
		const searchResultData: ScraperResponse[] = await Promise.all(
			ids.map((id) => updateManga("comicextra", id))
		);

		return searchResultData;
	}

	/**
	 * The scrape function
	 */
	public async scrape(slug: string, chapterId: string) {
		// Set a timeout for how long the request is allowed to take
		const maxTimeout: Promise<ScraperError> = new Promise((resolve) => {
			setTimeout(() => {
				resolve(error(0, "This request took too long"));
			}, 25e3);
		});

		// Attempt scraping series
		const scraping = this.doScrape(slug, chapterId);

		// Get first result of either scraping or timeout
		const raceResult = await Promise.race([maxTimeout, scraping]);

		// Check if it's the timeout instead of the scraped result
		if (
			raceResult.success === false &&
			raceResult.err === "This request took too long"
		) {
			console.error(
				chalk.red("[COMICEXTRA]") +
					` A request for '${slug}' at '${chapterId}' took too long and has timed out`
			);
		}

		// Return result
		return raceResult;
	}

	private async doScrape(
		slug: string,
		chapterId: string
	): Promise<ScraperResponse> {
		try {
			// Get HTML
			const pageReq = await fetch(`https://www.comicextra.com/comic/${slug}`);
			const pageHtml = await pageReq.text();

			// Get variables
			const dom = new JSDOM(pageHtml);
			const document = dom.window.document;

			// Get title
			const title = document.querySelector(".title-1").textContent;

			// Get poster URL
			let posterUrl = document.querySelector(".movie-l-img img").src;
			if (posterUrl.startsWith("/"))
				posterUrl = "https://www.comicextra.com" + posterUrl;

			// Get genres from tags
			const genres = [
				...document.querySelectorAll(".movie-dd")[4].querySelectorAll("a"),
			].map((v) => v.textContent);

			// Get alternate titles
			const alternateTitles = [];

			// Get status
			// const status = document.querySelector(".movie-dd.status").textContent;
			const status = "";

			// Get chapters
			const chapters: Chapter[] = [
				...document.querySelectorAll(".episode-list tr"),
			]
				.reverse() // Their default sorting is large > small — we want the opposite of that
				.map(
					(row, i): Chapter => {
						// Find all values
						const label = row.querySelector("a").textContent;
						const slug = row.querySelector("a").href.split("/").pop();
						const chapter = Number(slug.split("#").pop()) || i;
						const date = new Date(row.querySelectorAll("td")[1].textContent);

						// Return product of chapter
						return {
							label,
							hrefString: slug,
							season: 1,
							chapter,
							date,
							combined: chapter,
						};
					}
				);

			// Find images
			let chapterImages = [];
			if (chapterId != "-1") {
				// Scrape page to find images
				const url = `https://www.comicextra.com/${slug}/${chapterId}/full`;
				const chapterPageReq = await fetch(url);
				const chapterPageHtml = await chapterPageReq.text();

				// JSDOM it
				const dom = new JSDOM(chapterPageHtml);
				const chapterDocument = dom.window.document;

				const images = [...chapterDocument.querySelectorAll(".chapter_img")];
				chapterImages = images.map((v) => v.src);
			}

			// Find description
			const descriptionParagraphs = document
				.querySelector("#film-content")
				.textContent.split(/\n|<br>/g);

			// Return it.
			const providerId = getProviderId(this.provider);
			return {
				constant: {
					title,
					slug,
					posterUrl,
					alternateTitles,
					descriptionParagraphs,
					genres,
					nsfw: false,
				},
				data: {
					chapters,
					chapterImages,
					status,
				},
				success: true,
				provider: isProviderId(providerId) ? providerId : null,
			};
		} catch (e) {
			console.log(e);
			return {
				success: false,
				status: 0,
				err: e,
			};
		}
	}
}

// Generate comicextra object and export it
const comicextra = new comicextraClass();
export default comicextra;