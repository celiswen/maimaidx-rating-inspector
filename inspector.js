

let difficulties = ["basic", "advanced", "expert", "master", "remaster"]

function multipler(percentage) {
	let table = [
		{percentage: 1.0050, coefficient: 15.0},
		{percentage: 1.0000, coefficient: 14.0},
		{percentage: 0.9999, coefficient: 13.5},
		{percentage: 0.9950, coefficient: 13.0},
		{percentage: 0.9900, coefficient: 12.0},
		{percentage: 0.9800, coefficient: 11.0},
		{percentage: 0.9700, coefficient: 10.0},
		{percentage: 0.9400, coefficient: 9.4},
		{percentage: 0.9000, coefficient: 9.0},
		{percentage: 0.8000, coefficient: 8.0},
		{percentage: 0.7500, coefficient: 7.0},
		{percentage: 0.6000, coefficient: 6.0},
		{percentage: 0.5000, coefficient: 5.0},
	]
	let record = table.find(r => percentage >= r.percentage) || table[table.length - 1]
	return record.coefficient
}

function computeRating(song) {
	let level = song.internal
	if (level === undefined) {
		level = song.level.includes("+") ? (Number(song.level.slice(0, -1)) + 0.5) : Number(song.level)
	}
	
	let percentage = Number(song.score.slice(0, -1)) / 100
	percentage = Math.min(percentage, 1.005)
	return Math.floor(level * percentage * multipler(percentage))
}

function isDxSong(parentNode) {
	let musicKindIcon = parentNode.querySelector(".music_kind_icon")
	if (musicKindIcon) {
		return /music_dx/.test(musicKindIcon.getAttribute("src"))
	} else {
		let musicKindIconDx = parentNode.querySelector(".music_kind_icon_dx")
		return /btn_on/.test(musicKindIconDx.getAttribute("class"))
	}
}

function parseSongInfo(elem) {
	let level = elem.querySelector(".music_lv_block").textContent
	let name = elem.querySelector(".music_name_block").textContent
	let scoreElem = elem.querySelector(".music_score_block")
	let score = scoreElem ? scoreElem.textContent : null
	let dx = isDxSong(elem.parentNode)
	return {name, level, score, dx}
}

function findAllScoreElements(doc) {
	let query = difficulties.map(t => `.music_${t}_score_back`).join(",")
	return Array.prototype.map.call(doc.querySelectorAll(query), parseSongInfo)
}

function fetchScoresForDifficulty(d) {
	let difficultyId = difficulties.indexOf(d)
	let url = `https://maimaidx-eng.com/maimai-mobile/record/musicGenre/search/?genre=99&diff=${difficultyId}`
	return fetch(url)
		.then(response => response.text())
		.then(text => {
			let parser = new DOMParser()
			let doc = parser.parseFromString(text, "text/html")
			return findAllScoreElements(doc).map(r => ({ ...r, difficulty: d }))
		})
}

function fetchScores() {
	return Promise.all(difficulties.map(fetchScoresForDifficulty))
		.then(list => list.flatMap(x => x))
}

function fetchLevelData(rawData) {
	function parseName(name) {
		let difficulty = "master"
		let dx = false
		
		name = name.trim()
		if (name.includes("[dx]")) {
			name = name.replace("[dx]", "").trim()
			dx = true
		}
		if (name.includes("(白)")) {
			name = name.replace("(白)", "").trim()
			difficulty = "remaster"
		}
		if (name.includes("(赤)")) {
			name = name.replace("(赤)", "").trim()
			difficulty = "expert"
		}
		if (name.includes("(黄)")) {
			name = name.replace("(黄)", "").trim()
			difficulty = "advanced"
		}
		if (name.includes("(緑)")) {
			name = name.replace("(緑)", "").trim()
			difficulty = "basic"
		}
		
		return {name, difficulty, dx}
	}
	
	function extractData(rawData) {
		return Object.keys(rawData)
		.filter(k => k.endsWith("_rslt"))
		.flatMap(key => {
			let refKey = key.replace("_rslt", "").replace("m", "minus").replace("p", "plus")
			let level = refKey.replace("plus", "+").replace("minus", "").replace("lv", "")
			
			let refs = rawData[refKey]
			let names = rawData[key]
			if (refs.length !== names.length) throws `${refKey} and ${key} length mismatch`
			
			return refs.map((v, i) => [level, Number(v), names[i]])
		})
		.flatMap(([level, internal, names]) => {
			return names.split("、")
				.map(name => ({ ...parseName(name), level, internal }))
				.filter(entry => entry.name !== "")
		})
	}
	
	function fetchData() {
		return fetch("https://sgimera.github.io/mai_RatingAnalyzer/scripts_maimai/maidx_in_lv_data.js")
		.then(response => response.text())
		.then(text => {
			return text.replace("javascript:", "")
				.split(";")
				.map(line => line.replace(/\n/g, ""))
				.filter(line => line.startsWith("var "))
				.map(line => {
					let [key, value] = line.slice(4).split("=")
					key = key.trim()
					value = JSON.parse(value)
					return {key, value}
				})
				.reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {})
		})
	}
	
	return fetchData()
		.then(extractData)
}

	
function ngram(s1, s2, n) {
	// compute the n-gram similarity for string s1 and s2
	
	function parts(s, n) {
		s = " ".repeat(n - 1) + s + " ".repeat(n - 1)
		let result = {}
		for (let i = 0; i < s.length - n + 1; i++) {
			result[s.slice(i, i + 3)] = true
		}
		return result 
	}
	
	function intersectCount(set1, set2) {
		return Object.keys(set1).filter(k => set2[k]).length
	}
	
	let g1 = parts(s1, n)
	let g2 = parts(s2, n)
	return (2 * intersectCount(g1, g2)) / (Object.keys(g1).length + Object.keys(g2).length)
}

function joinData(scores, levelData) {
	function index(r) {
		return `${r.name}:${r.level}:${r.difficulty}:${r.dx}`
	}
	
	function gindex(r) {
		return `${r.level}:${r.difficulty}:${r.dx}`
	}

	let scoresTable = {}
	let scoresGroupTable = {}
	let noMatchCandidates = []
	let noMatch = []
	let log = ""
	
	// build the index for individual songs
	for (let scoreEntry of scores) {
		scoresTable[index(scoreEntry)] = scoreEntry
	}
	
	// build the index for groups of songs
	for (let scoreEntry of scores) {
		let idx = gindex(scoreEntry)
		if (!scoresGroupTable[idx]) scoresGroupTable[idx] = []
		scoresGroupTable[idx].push(scoreEntry)
	}
	
	for (let levelEntry of levelData) {
		let scoreEntry = scoresTable[index(levelEntry)]
		if (scoreEntry) {
			scoreEntry.internal = levelEntry.internal
		} else {
			noMatchCandidates.push(levelEntry)
		}
	}
	
	// handle the no exact match ones
	log += "Fuzzy Matching Result\n\n"
	for (let levelEntry of noMatchCandidates) {
		// only consider the unmatch score records
		let scoreCandidates = (scoresGroupTable[gindex(levelEntry)] || [])
			.filter(r => r.internal === undefined)
			.map(entry => ({
				entry,
				similarity: ngram(entry.name, levelEntry.name, 2) * 0.3 +
					        ngram(entry.name, levelEntry.name, 3),
			}))
			.filter(r => r.similarity >= 0.1)
		scoreCandidates.sort((r1, r2) => r2.similarity - r1.similarity)
		
		if (scoreCandidates.length > 0) {
			let scoreEntry = scoreCandidates[0].entry
			scoreEntry.internal = levelEntry.internal
			log += `${levelEntry.name} ----> ${scoreEntry.name}\n`
		} else {
			noMatch.push(levelEntry)
		}
	}
	
	console.warn(log)
	console.warn("List of not matching songs\n", noMatch)
}

function render(html) {
	let inspectorElem = document.querySelector(".rating-inspector")
	if (!inspectorElem) {
		let div = document.createElement("div")
		div.setAttribute("class", "rating-inspector")
		let elem = document.querySelector(".wrapper.main_wrapper")
		elem.prepend(div)
		
		inspectorElem = div
	}
	
	inspectorElem.innerHTML = html
}

function main() {
	let scores, levelData
	fetchScores()
		.then(s => {
			scores = s
			return fetchLevelData()
		})
		.then(lvd => {
			levelData = lvd
			joinData(scores, levelData)
			
			let songsDx = scores
				.filter(x => x.dx && x.score !== null)
				.map(s => ({ ...s, rating: computeRating(s) }))
			songsDx.sort((s1, s2) => s2.rating - s1.rating)
				
			let songsStandard = scores
				.filter(x => !x.dx && x.score !== null)
				.map(s => ({ ...s, rating: computeRating(s) }))
			songsStandard.sort((s1, s2) => s2.rating - s1.rating)
			
			let topSongsDx = songsDx.slice(0, 15)
			let topSongsStandard = songsStandard.slice(0, 25)
			
			let totalDxRating = topSongsDx.reduce((acc, x) => acc + x.rating, 0)
			let totalStandardRating = topSongsStandard.reduce((acc, x) => acc + x.rating, 0)
			
			console.log("Total rating", totalDxRating + totalStandardRating)
			console.log("totalDxRating", totalDxRating)
			console.log("totalStandardRating", totalStandardRating)
			
			console.log(topSongsDx)
			console.log(topSongsStandard)
			
			render(`
			<div class="screw_block m_15 f_15">Maimai DX Rating Inspector by <a href="https://github.com/xtpor" target="_blank">@xtpor</a></div>
			<table>
				<tr>
					<th style="text-align: left">Total rating</th>
					<td>${totalDxRating + totalStandardRating}</td>
				</tr>
				<tr>
					<th style="text-align: left">Total rating for dx songs</th>
					<td>${totalDxRating}</td>
				</tr>
				<tr>
					<th style="text-align: left">Total rating for standard songs</th>
					<td>${totalStandardRating}</td>
				</tr>
			</table>
			
			<div class="screw_block m_15 f_15">DX Rating Breakdown (Top 15 songs)</div>
			${
				topSongsDx.map((song, i) => `
				<div class="w_450 m_15 p_r f_0">
					<div class="music_${song.difficulty}_score_back pointer p_3">
						<div>
							<img src="https://maimaidx-eng.com/maimai-mobile/img/diff_${song.difficulty}.png" class="h_20 f_l">
							<div class="clearfix"></div>
							<div class="music_lv_block f_r t_c f_14">${song.level}</div>
							<div class="music_name_block t_l f_13 break">[${i + 1}]. ${song.name}</div>
								<div class="music_score_block w_120 t_r f_l f_12">${song.score}</div>
								<div class="music_score_block w_120 t_r f_l f_12">
									Rating: ${song.rating}
								</div>
								<div class="music_score_block w_120 t_r f_l f_12">
									Internal Lv: ${song.internal}
								</div>
								<div class="clearfix"></div>
						</div>
					</div>
					<img src="https://maimaidx-eng.com/maimai-mobile/img/music_${song.dx ? 'dx' : 'standard'}.png" class="music_kind_icon ">
				</div>
				`).join("")
			}
			<div class="screw_block m_15 f_15">Standard Rating Breakdown (Top 25 songs)</div>
			${
				topSongsStandard.map((song, i) => `
				<div class="w_450 m_15 p_r f_0">
					<div class="music_${song.difficulty}_score_back pointer p_3">
						<div>
							<img src="https://maimaidx-eng.com/maimai-mobile/img/diff_${song.difficulty}.png" class="h_20 f_l">
							<div class="clearfix"></div>
							<div class="music_lv_block f_r t_c f_14">${song.level}</div>
							<div class="music_name_block t_l f_13 break">[${i + 1}]. ${song.name}</div>
								<div class="music_score_block w_120 t_r f_l f_12">${song.score}</div>
								<div class="music_score_block w_120 t_r f_l f_12">
									Rating: ${song.rating}
								</div>
								<div class="music_score_block w_120 t_r f_l f_12">
									Internal Lv: ${song.internal}
								</div>
								<div class="clearfix"></div>
						</div>
					</div>
					<img src="https://maimaidx-eng.com/maimai-mobile/img/music_${song.dx ? 'dx' : 'standard'}.png" class="music_kind_icon ">
				</div>
				`).join("")
			}
			`)
		})
}

if (confirm("Run the rating inspector?")) main()
