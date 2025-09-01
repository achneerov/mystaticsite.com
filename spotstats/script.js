let allData = [];
let filteredData = [];
let charts = {};
let topLists = {
    artists: { data: [], displayed: 20, filtered: [] },
    tracks: { data: [], displayed: 20, filtered: [] },
    albums: { data: [], displayed: 20, filtered: [] },
};

// Unified toggle state for both Top Lists and Charts
let statsMode = "time";
let timeFormat = "minutes"; // "minutes" or "hours"
let decimalPrecision = 1; // number of decimal places

// Time format utility functions
function formatTime(milliseconds, format = timeFormat) {
    if (format === "hours") {
        const hours = milliseconds / (1000 * 60 * 60);
        const multiplier = Math.pow(10, decimalPrecision);
        const roundedHours =
            Math.round(hours * multiplier) / multiplier;
        return `${roundedHours.toLocaleString()}h`;
    } else {
        const minutes = milliseconds / (1000 * 60);
        const multiplier = Math.pow(10, decimalPrecision);
        const roundedMinutes =
            Math.round(minutes * multiplier) / multiplier;
        return `${roundedMinutes.toLocaleString()} min`;
    }
}

function formatTimeValue(milliseconds, format = timeFormat) {
    if (format === "hours") {
        const hours = milliseconds / (1000 * 60 * 60);
        const multiplier = Math.pow(10, decimalPrecision);
        return Math.round(hours * multiplier) / multiplier;
    } else {
        const minutes = milliseconds / (1000 * 60);
        const multiplier = Math.pow(10, decimalPrecision);
        return Math.round(minutes * multiplier) / multiplier;
    }
}

function changeDecimalPrecision(change) {
    const newPrecision = decimalPrecision + change;
    if (newPrecision >= 0 && newPrecision <= 3) {
        decimalPrecision = newPrecision;
        document.getElementById(
            "decimalPrecisionValue",
        ).textContent = decimalPrecision;
        if (filteredData.length > 0) {
            updateStats();
        }
    }
}

function updateTimeFormat(format) {
    timeFormat = format;
    if (filteredData.length > 0) {
        updateStats();
    }
}

// Unified toggle UI logic for dropdown
function toggleModeDropdown(selectElem) {
    statsMode = selectElem.value;
    updateTopLists();
    updateCharts();
}

// No-op: updateToggleButtons is now obsolete, but kept for compatibility if called elsewhere
function updateToggleButtons() {}

// View management
function showUploadView() {
    document.getElementById("uploadView").style.display = "block";
    document.getElementById("processingView").style.display =
        "none";
    document.getElementById("statsView").classList.add("hidden");
    document.getElementById("errorView").style.display = "none";

    // Clear previous data
    allData = [];
    filteredData = [];

    // Destroy existing charts
    Object.values(charts).forEach((chart) => chart.destroy());
    charts = {};
}

function showProcessingView() {
    document.getElementById("uploadView").style.display = "none";
    document.getElementById("processingView").style.display =
        "block";
    document.getElementById("statsView").classList.add("hidden");
    document.getElementById("errorView").style.display = "none";

    // Reset processing steps
    ["step1", "step2", "step3", "step4"].forEach((stepId) => {
        const step = document.getElementById(stepId);
        step.classList.remove("active", "completed");
    });
}

function showStatsView() {
    document.getElementById("uploadView").style.display = "none";
    document.getElementById("processingView").style.display =
        "none";
    document.getElementById("statsView").classList.remove("hidden");
    document.getElementById("errorView").style.display = "none";
}

function showErrorView(message) {
    document.getElementById("uploadView").style.display = "none";
    document.getElementById("processingView").style.display =
        "none";
    document.getElementById("statsView").classList.add("hidden");
    document.getElementById("errorView").style.display = "block";
    document.getElementById("errorMessage").textContent = message;
}

function toggleFileInfo() {
    const fileInfo = document.getElementById("fileInfo");
    if (fileInfo.style.display === "none") {
        fileInfo.style.display = "block";
    } else {
        fileInfo.style.display = "none";
    }
}

function setProcessingStep(stepNumber) {
    // Mark previous steps as completed
    for (let i = 1; i < stepNumber; i++) {
        const step = document.getElementById(`step${i}`);
        step.classList.remove("active");
        step.classList.add("completed");
    }

    // Mark current step as active
    const currentStep = document.getElementById(
        `step${stepNumber}`,
    );
    currentStep.classList.add("active");
}

async function processZipFile(file) {
    try {
        showProcessingView();
        setProcessingStep(1);

        const zip = new JSZip();
        const contents = await zip.loadAsync(file);

        setProcessingStep(2);

        // Find streaming history files
        const streamingFiles = [];
        contents.forEach((relativePath, file) => {
            // Skip macOS metadata files and directories
            if (
                relativePath.includes("__MACOSX") ||
                relativePath.startsWith("._") ||
                relativePath.includes("/._") ||
                file.dir
            ) {
                return;
            }

            if (
                relativePath.includes("Streaming_History_Audio") &&
                relativePath.endsWith(".json")
            ) {
                console.log(`Found valid file: ${relativePath}`);
                streamingFiles.push({
                    path: relativePath,
                    file: file,
                });
            }
        });

        if (streamingFiles.length === 0) {
            throw new Error(
                "No Spotify streaming history files found in the ZIP. Make sure you uploaded the Extended Streaming History data.",
            );
        }

        setProcessingStep(3);

        // Check if we're on mobile for optimizations but no limits
        const isMobile =
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent,
            );

        // Process each file with chunking to avoid memory issues
        allData = [];
        let totalProcessed = 0;
        let fileIndex = 0;
        console.log(
            `Processing ${streamingFiles.length} valid streaming history files...`,
            isMobile
                ? "(Mobile mode: using optimized processing)"
                : "",
        );

        for (const { path, file } of streamingFiles) {
            try {
                fileIndex++;
                // Update progress
                const progressText = `Processing file ${fileIndex}/${streamingFiles.length}: ${path.split("/").pop()}`;
                document.querySelector(
                    ".processing p",
                ).textContent = progressText;

                const content = await file.async("text");

                // Additional check for valid JSON content
                if (
                    !content.trim().startsWith("[") &&
                    !content.trim().startsWith("{")
                ) {
                    console.warn(
                        `Skipping ${path}: Not valid JSON content`,
                    );
                    continue;
                }

                const data = JSON.parse(content);
                if (Array.isArray(data)) {
                    console.log(
                        `Loaded ${data.length} records from ${path}`,
                    );

                    // Process data in smaller chunks for mobile
                    const chunkSize = isMobile ? 500 : 1000;
                    for (
                        let i = 0;
                        i < data.length;
                        i += chunkSize
                    ) {
                        const chunk = data.slice(
                            i,
                            Math.min(i + chunkSize, data.length),
                        );
                        const validChunk = chunk.filter(
                            (item) =>
                                item.master_metadata_track_name &&
                                item.master_metadata_album_artist_name &&
                                item.ms_played > 0 &&
                                item.ts,
                        );

                        allData = allData.concat(validChunk);
                        totalProcessed += validChunk.length;

                        // Allow browser to breathe between chunks and update progress
                        if (i % (isMobile ? 5000 : 10000) === 0) {
                            document.querySelector(
                                ".processing p",
                            ).textContent =
                                `${progressText} - ${totalProcessed.toLocaleString()} records processed`;

                            await new Promise((resolve) =>
                                setTimeout(
                                    resolve,
                                    isMobile ? 5 : 1,
                                ),
                            );
                        }
                    }
                } else {
                    console.warn(
                        `Skipping ${path}: Data is not an array`,
                    );
                }
            } catch (e) {
                console.warn(
                    `Error processing ${path}:`,
                    e.message,
                );
            }
        }

        if (allData.length === 0) {
            throw new Error(
                "No valid listening records found in the uploaded files.",
            );
        }

        setProcessingStep(4);

        console.log(
            `Successfully processed ${allData.length} valid listening records from ${streamingFiles.length} files`,
        );

        if (allData.length > 0) {
            // Calculate date range safely without spread operator
            let minDate = new Date(allData[0].ts);
            let maxDate = new Date(allData[0].ts);
            const dateCheckInterval = Math.max(
                1,
                Math.floor(allData.length / 1000),
            ); // Sample dates to avoid checking every record
            for (
                let i = 0;
                i < allData.length;
                i += dateCheckInterval
            ) {
                const itemDate = new Date(allData[i].ts);
                if (itemDate < minDate) minDate = itemDate;
                if (itemDate > maxDate) maxDate = itemDate;
            }
            console.log(
                `Data spans from ${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`,
            );
        }

        // Short delay to show final step
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Mark final step as completed
        document.getElementById("step4").classList.remove("active");
        document.getElementById("step4").classList.add("completed");

        // Clean up temporary variables to free memory
        streamingFiles.length = 0;

        // Force garbage collection hint (browsers may ignore)
        if (window.gc) {
            window.gc();
        }

        // Reset progress text
        document.querySelector(".processing p").textContent =
            "Finalizing analysis...";

        // Initialize stats view
        applyFilter("all");
        showStatsView();
    } catch (error) {
        console.error("Error processing ZIP file:", error);
        showErrorView(error.message);
    }
}

// Memory cleanup helper
function cleanupMemory() {
    // Clear any large temporary arrays
    if (window.tempData) {
        window.tempData = null;
    }
    // Suggest garbage collection on mobile
    if (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent,
        )
    ) {
        setTimeout(() => {
            if (window.gc) window.gc();
        }, 100);
    }
}

// Stats functions
function applyFilter(period) {
    const now = new Date();
    let startDate = new Date(0);

    switch (period) {
        case "last7":
            startDate = new Date(
                now.getTime() - 7 * 24 * 60 * 60 * 1000,
            );
            break;
        case "last30":
            startDate = new Date(
                now.getTime() - 30 * 24 * 60 * 60 * 1000,
            );
            break;
        case "2024":
            startDate = new Date("2024-01-01");
            break;
        case "2023":
            startDate = new Date("2023-01-01");
            break;
        case "2022":
            startDate = new Date("2022-01-01");
            break;
        default:
            startDate = new Date(0);
    }

    filteredData = allData.filter((item) => {
        const itemDate = new Date(item.ts);
        return (
            itemDate >= startDate &&
            (period === "all" ||
                (period === "2024" &&
                    itemDate.getFullYear() === 2024) ||
                (period === "2023" &&
                    itemDate.getFullYear() === 2023) ||
                (period === "2022" &&
                    itemDate.getFullYear() === 2022) ||
                period.startsWith("last"))
        );
    });

    // Clean up memory after filtering
    cleanupMemory();

    updateStats();
}

function updateStats() {
    updateBasicStats();
    updateInsights();
    updateTopLists();
    updateCharts();
}

function updateBasicStats() {
    // Basic stats
    const totalMs = filteredData.reduce(
        (sum, item) => sum + item.ms_played,
        0,
    );
    const totalTracks = filteredData.length;

    document.getElementById("totalTime").textContent =
        formatTime(totalMs);
    document.getElementById("totalTracks").textContent =
        `${totalTracks.toLocaleString()} tracks played`;

    // Average daily listening
    const dateRange = getDateRange(filteredData);
    const days = Math.max(1, dateRange.days);
    const avgDailyMs = totalMs / days;
    const avgDailyTracks = Math.round(totalTracks / days);

    document.getElementById("avgDaily").textContent =
        formatTime(avgDailyMs);
    document.getElementById("avgTracks").textContent =
        `${avgDailyTracks} tracks per day`;

    // Unique counts
    const uniqueArtists = new Set(
        filteredData.map(
            (item) => item.master_metadata_album_artist_name,
        ),
    ).size;
    const uniqueTracks = new Set(
        filteredData.map(
            (item) =>
                `${item.master_metadata_track_name}-${item.master_metadata_album_artist_name}`,
        ),
    ).size;

    document.getElementById("uniqueArtists").textContent =
        uniqueArtists.toLocaleString();
    document.getElementById("uniqueTracks").textContent =
        `${uniqueTracks.toLocaleString()} unique tracks`;

    // Completion rate
    const completedTracks = filteredData.filter(
        (item) => item.ms_played > 30000,
    ).length;
    const completionRate =
        totalTracks > 0
            ? Math.round((completedTracks / totalTracks) * 100)
            : 0;
    document.getElementById("skipRate").textContent =
        `${completionRate}%`;
    document.getElementById("completionBar").style.width =
        `${completionRate}%`;
}

function updateInsights() {
    // Country analysis
    const countries = {};
    filteredData.forEach((item) => {
        if (item.conn_country) {
            countries[item.conn_country] =
                (countries[item.conn_country] || 0) + 1;
        }
    });

    const countryKeys = Object.keys(countries);
    if (countryKeys.length > 0) {
        const topCountry = countryKeys.reduce((a, b) =>
            countries[a] > countries[b] ? a : b,
        );
        document.getElementById("topCountry").textContent =
            topCountry;
        document.getElementById("countryDetail").textContent =
            `${countries[topCountry]?.toLocaleString() || 0} listens`;
    } else {
        document.getElementById("topCountry").textContent = "N/A";
        document.getElementById("countryDetail").textContent =
            "0 listens";
    }

    // Platform analysis
    const platforms = {};
    filteredData.forEach((item) => {
        if (item.platform) {
            platforms[item.platform] =
                (platforms[item.platform] || 0) + item.ms_played;
        }
    });

    const platformKeys = Object.keys(platforms);
    if (platformKeys.length > 0) {
        const topPlatform = platformKeys.reduce((a, b) =>
            platforms[a] > platforms[b] ? a : b,
        );
        document.getElementById("topPlatform").textContent =
            topPlatform;
        document.getElementById("platformDetail").textContent =
            formatTime(platforms[topPlatform]);
    } else {
        document.getElementById("topPlatform").textContent =
            "unknown";
        document.getElementById("platformDetail").textContent =
            formatTime(0);
    }

    // Shuffle analysis
    const shuffleTracks = filteredData.filter(
        (item) => item.shuffle,
    ).length;
    const shuffleRate =
        filteredData.length > 0
            ? Math.round(
                  (shuffleTracks / filteredData.length) * 100,
              )
            : 0;
    document.getElementById("shuffleRate").textContent =
        `${shuffleRate}%`;

    // Offline analysis
    const offlineTracks = filteredData.filter(
        (item) => item.offline,
    ).length;
    const offlineRate =
        filteredData.length > 0
            ? Math.round(
                  (offlineTracks / filteredData.length) * 100,
              )
            : 0;
    document.getElementById("offlineRate").textContent =
        `${offlineRate}%`;

    // Skip analysis
    const skippedTracks = filteredData.filter(
        (item) => item.skipped,
    ).length;
    const actualSkipRate =
        filteredData.length > 0
            ? Math.round(
                  (skippedTracks / filteredData.length) * 100,
              )
            : 0;
    document.getElementById("actualSkipRate").textContent =
        `${actualSkipRate}%`;

    // Discovery score
    const trackCounts = {};
    filteredData.forEach((item) => {
        const trackKey = `${item.master_metadata_track_name}-${item.master_metadata_album_artist_name}`;
        trackCounts[trackKey] = (trackCounts[trackKey] || 0) + 1;
    });
    const newTracks = Object.values(trackCounts).filter(
        (count) => count === 1,
    ).length;
    document.getElementById("discoveryScore").textContent =
        newTracks;

    // Time-based insights
    updateTimeInsights();
}

function updateTimeInsights() {
    // Longest session analysis
    const sessions = calculateSessions();
    let longestSession = 0;
    for (const session of sessions) {
        if (session.duration > longestSession) {
            longestSession = session.duration;
        }
    }
    document.getElementById("longestSession").textContent =
        formatTime(longestSession);

    // Most active day
    const dailyStats = calculateDailyStats();
    const days = Object.keys(dailyStats);
    if (days.length > 0) {
        const mostActiveDay = days.reduce((a, b) =>
            dailyStats[a].tracks > dailyStats[b].tracks ? a : b,
        );
        const dayData = dailyStats[mostActiveDay];
        document.getElementById("mostActiveDay").textContent =
            new Date(mostActiveDay).toLocaleDateString();
        document.getElementById("activeDetails").textContent =
            `${dayData.tracks} tracks, ${formatTime(dayData.time)}`;
    } else {
        document.getElementById("mostActiveDay").textContent =
            "N/A";
        document.getElementById("activeDetails").textContent =
            "No data available";
    }

    // Night owl / Early bird scores
    const hourlyData = calculateHourlyDistribution();
    const nightOwlHours = hourlyData
        .slice(22)
        .concat(hourlyData.slice(0, 6));
    const earlyBirdHours = hourlyData.slice(5, 8);
    const totalListens = hourlyData.reduce(
        (sum, hour) => sum + hour,
        0,
    );

    const nightOwlScore =
        totalListens > 0
            ? Math.round(
                  (nightOwlHours.reduce(
                      (sum, hour) => sum + hour,
                      0,
                  ) /
                      totalListens) *
                      100,
              )
            : 0;
    const earlyBirdScore =
        totalListens > 0
            ? Math.round(
                  (earlyBirdHours.reduce(
                      (sum, hour) => sum + hour,
                      0,
                  ) /
                      totalListens) *
                      100,
              )
            : 0;

    document.getElementById("nightOwlScore").textContent =
        `${nightOwlScore}%`;
    document.getElementById("earlyBirdScore").textContent =
        `${earlyBirdScore}%`;

    // Variety score
    const varietyScore = calculateVarietyScore();
    document.getElementById("varietyScore").textContent =
        varietyScore || 0;
}

function calculateSessions() {
    const sessions = [];
    let currentSession = null;

    filteredData.forEach((item) => {
        const itemTime = new Date(item.ts).getTime();

        if (
            !currentSession ||
            itemTime - currentSession.lastActivity > 30 * 60 * 1000
        ) {
            // 30 min gap
            currentSession = {
                start: itemTime,
                lastActivity: itemTime,
                duration: item.ms_played,
                tracks: 1,
            };
            sessions.push(currentSession);
        } else {
            currentSession.lastActivity = itemTime;
            currentSession.duration += item.ms_played;
            currentSession.tracks++;
        }
    });

    return sessions;
}

function calculateDailyStats() {
    const dailyData = {};

    filteredData.forEach((item) => {
        const date = new Date(item.ts).toISOString().slice(0, 10); // "YYYY-MM-DD"
        if (!dailyData[date]) {
            dailyData[date] = { tracks: 0, time: 0 };
        }
        dailyData[date].tracks++;
        dailyData[date].time += item.ms_played;
    });

    return dailyData;
}

function calculateHourlyDistribution() {
    const hourlyData = new Array(24).fill(0);

    filteredData.forEach((item) => {
        const hour = new Date(item.ts).getHours();
        hourlyData[hour]++;
    });

    return hourlyData;
}

function calculateVarietyScore() {
    if (filteredData.length === 0) return 0;

    const weeklyData = {};

    filteredData.forEach((item) => {
        if (item.ts && item.master_metadata_album_artist_name) {
            const date = new Date(item.ts);
            const weekKey = `${date.getFullYear()}-W${getWeekNumber(date)}`;

            if (!weeklyData[weekKey]) {
                weeklyData[weekKey] = new Set();
            }
            weeklyData[weekKey].add(
                item.master_metadata_album_artist_name,
            );
        }
    });

    const weeksWithData = Object.keys(weeklyData);
    if (weeksWithData.length === 0) return 0;

    const avgArtistsPerWeek =
        weeksWithData.reduce(
            (sum, week) => sum + weeklyData[week].size,
            0,
        ) / weeksWithData.length;

    return Math.round(avgArtistsPerWeek);
}

function getWeekNumber(date) {
    const d = new Date(
        Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
        ),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function updateTopLists() {
    // Top Artists
    const artistStats = {};
    filteredData.forEach((item) => {
        const artist = item.master_metadata_album_artist_name;
        if (!artistStats[artist]) {
            artistStats[artist] = { time: 0, plays: 0 };
        }
        artistStats[artist].time += item.ms_played;
        artistStats[artist].plays++;
    });

    let sortKey = statsMode === "time" ? "time" : "plays";
    let valueText =
        statsMode === "time"
            ? (v) => formatTime(v.time)
            : (v) => `${v.plays} plays`;

    topLists.artists.data = Object.entries(artistStats)
        .map(([artist, stats]) => ({
            name: artist,
            time: stats.time,
            plays: stats.plays,
            timeText: formatTime(stats.time),
            playsText: `${stats.plays} plays`,
        }))
        .sort((a, b) => b[sortKey] - a[sortKey]);

    // Top Tracks
    const trackStats = {};
    filteredData.forEach((item) => {
        const track = `${item.master_metadata_track_name}`;
        const artist = item.master_metadata_album_artist_name;
        const key = `${track}|||${artist}`;

        if (!trackStats[key]) {
            trackStats[key] = { plays: 0, time: 0, track, artist };
        }
        trackStats[key].plays++;
        trackStats[key].time += item.ms_played;
    });

    topLists.tracks.data = Object.values(trackStats)
        .map((stats) => ({
            name: `${stats.track} - ${stats.artist}`,
            plays: stats.plays,
            time: stats.time,
            timeText: formatTime(stats.time),
            playsText: `${stats.plays} plays`,
        }))
        .sort((a, b) => b[sortKey] - a[sortKey]);

    // Top Albums
    const albumStats = {};
    filteredData.forEach((item) => {
        if (item.master_metadata_album_album_name) {
            const album = `${item.master_metadata_album_album_name}`;
            const artist = item.master_metadata_album_artist_name;
            const key = `${album}|||${artist}`;

            if (!albumStats[key]) {
                albumStats[key] = {
                    time: 0,
                    plays: 0,
                    album,
                    artist,
                };
            }
            albumStats[key].time += item.ms_played;
            albumStats[key].plays++;
        }
    });

    topLists.albums.data = Object.values(albumStats)
        .map((stats) => ({
            name: `${stats.album} - ${stats.artist}`,
            time: stats.time,
            plays: stats.plays,
            timeText: formatTime(stats.time),
            playsText: `${stats.plays} plays`,
        }))
        .sort((a, b) => b[sortKey] - a[sortKey]);

    // Reset filters and display
    ["artists", "tracks", "albums"].forEach((type) => {
        topLists[type].filtered = topLists[type].data.slice();
        topLists[type].displayed = 20;
    });

    renderTopLists();
    updateToggleButtons();
}

function renderTopLists() {
    ["artists", "tracks", "albums"].forEach((type) => {
        const container = document.getElementById(
            `top${type.charAt(0).toUpperCase() + type.slice(1)}`,
        );
        const items = topLists[type].filtered.slice(
            0,
            topLists[type].displayed,
        );

        container.innerHTML = items
            .map((item, index) => {
                let statText =
                    statsMode === "time"
                        ? item.timeText
                        : item.playsText;
                let statOther =
                    statsMode === "time"
                        ? item.playsText
                        : item.timeText;
                return `
            <li>
                <div class="rank">${index + 1}</div>
                <div class="list-item-content">
                    <div class="list-item-name">${item.name}</div>
                    <div class="list-item-stats">${statText} • ${statOther}</div>
                </div>
            </li>
        `;
            })
            .join("");

        // Update show more button
        const showMoreBtn = document.getElementById(
            `showMore${type.charAt(0).toUpperCase() + type.slice(1)}`,
        );
        const hasMore =
            topLists[type].filtered.length >
            topLists[type].displayed;
        showMoreBtn.textContent = hasMore
            ? `Show More (${topLists[type].filtered.length - topLists[type].displayed} remaining)`
            : "All items shown";
        showMoreBtn.style.display = hasMore ? "block" : "none";
    });
}

function filterList(type, query) {
    const lowerQuery = query.toLowerCase();
    topLists[type].filtered = topLists[type].data.filter((item) =>
        item.name.toLowerCase().includes(lowerQuery),
    );
    topLists[type].displayed = 20;
    renderTopLists();
}

function showMoreItems(type) {
    topLists[type].displayed += 20;
    renderTopLists();
}

function updateCharts() {
    updateTimeChart();
    updatePlatformChart();
    updateCountryChart();
    updateHourlyChart();
    updateWeeklyChart();
}

function updateTimeChart() {
    const ctx = document.getElementById("timeChart");
    if (!ctx) return;

    const dailyData = calculateDailyStats();
    const sortedDays = Object.keys(dailyData).sort();

    // Determine selected period
    const periodSelect = document.getElementById("periodSelect");
    const period = periodSelect ? periodSelect.value : "all";

    let groupedData = {};
    let labelFormat = "month"; // default
    let yLabel =
        statsMode === "time"
            ? timeFormat === "hours"
                ? "Hours Listened"
                : "Minutes Listened"
            : "Listens";

    if (period === "last7" || period === "last30") {
        // Group by day (YYYY-MM-DD)
        labelFormat = "day";
        sortedDays.forEach((day) => {
            groupedData[day] =
                statsMode === "time"
                    ? formatTimeValue(dailyData[day].time)
                    : dailyData[day].tracks;
        });
    } else {
        // Group by month (YYYY-MM)
        sortedDays.forEach((day) => {
            const key = day.slice(0, 7); // "YYYY-MM"
            if (!groupedData[key]) groupedData[key] = 0;
            groupedData[key] +=
                statsMode === "time"
                    ? formatTimeValue(dailyData[day].time)
                    : dailyData[day].tracks;
        });
    }

    // Always sort the keys for chronological order
    const sortedKeys = Object.keys(groupedData).sort();

    if (charts.timeChart) charts.timeChart.destroy();

    charts.timeChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: sortedKeys,
            datasets: [
                {
                    label: yLabel,
                    data: sortedKeys.map((k) => groupedData[k]),
                    borderColor: "#1db954",
                    backgroundColor: "rgba(29, 185, 84, 0.1)",
                    tension: 0.4,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    right: 10,
                    bottom: 10,
                    left: 10,
                },
            },
            plugins: {
                legend: {
                    labels: { color: "white" },
                    display: true,
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: "white",
                        maxTicksLimit:
                            labelFormat === "day" ? 14 : 8,
                        callback: function (value, index, values) {
                            // Format label as "MMM D" for day, "YYYY-MM" for month
                            const label =
                                this.getLabelForValue(value);
                            if (labelFormat === "day") {
                                const d = new Date(label);
                                if (!isNaN(d)) {
                                    return `${d.getMonth() + 1}/${d.getDate()}`;
                                }
                                return label;
                            }
                            return label;
                        },
                    },
                    grid: { color: "rgba(255,255,255,0.1)" },
                },
                y: {
                    ticks: {
                        color: "white",
                        beginAtZero: true,
                    },
                    grid: { color: "rgba(255,255,255,0.1)" },
                },
            },
        },
    });
}

function updatePlatformChart() {
    const ctx = document.getElementById("platformChart");
    const listContainer = document.getElementById("platformList");
    if (!ctx || !listContainer) return;

    const platforms = {};
    filteredData.forEach((item) => {
        if (item.platform && item.ms_played) {
            if (statsMode === "time") {
                platforms[item.platform] =
                    (platforms[item.platform] || 0) +
                    formatTimeValue(item.ms_played);
            } else {
                platforms[item.platform] =
                    (platforms[item.platform] || 0) + 1;
            }
        }
    });

    // Sort platforms by value (largest to smallest)
    const sortedPlatforms = Object.entries(platforms).sort(
        ([, a], [, b]) => b - a,
    );

    let chartLabels = [];
    let chartData = [];

    if (sortedPlatforms.length > 5) {
        const top4 = sortedPlatforms.slice(0, 4);
        const others = sortedPlatforms.slice(4);
        const othersSum = others.reduce((sum, [, value]) => sum + value, 0);

        chartLabels = top4.map(([label]) => label);
        chartLabels.push("Others");

        chartData = top4.map(([, data]) => data);
        chartData.push(othersSum);
    } else {
        chartLabels = sortedPlatforms.map(([label]) => label);
        chartData = sortedPlatforms.map(([, data]) => data);
    }


    // Create/update the doughnut chart
    if (charts.platformChart) charts.platformChart.destroy();

    charts.platformChart = new Chart(ctx, {
        type: "pie",
        data: {
            labels: chartLabels,
            datasets: [
                {
                    data: chartData,
                    backgroundColor: [
                        "#1db954",
                        "#ff6b6b",
                        "#4ecdc4",
                        "#45b7d1",
                        "#f9ca24",
                        "#f0932b",
                        "#eb4d4b",
                        "#6c5ce7",
                    ],
                    borderWidth: 0,
                    borderColor: "#000",
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: 20,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || "";
                            const value = context.parsed;
                            const total =
                                context.dataset.data.reduce(
                                    (a, b) => a + b,
                                    0,
                                );
                            const percentage = (
                                (value / total) *
                                100
                            ).toFixed(1);
                            return statsMode === "time"
                                ? `${label}: ${formatTime(value * (timeFormat === "hours" ? 1000 * 60 * 60 : 1000 * 60))} (${percentage}%)`
                                : `${label}: ${value} listens (${percentage}%)`;
                        },
                    },
                },
            },
        },
    });

    // Update the list
    listContainer.innerHTML = "";

    const totalVal = Object.values(platforms).reduce(
        (sum, val) => sum + val,
        0,
    );

    sortedPlatforms.forEach(([platform, val]) => {
        const item = document.createElement("div");
        item.className = "platform-item";

        const name = document.createElement("span");
        name.className = "platform-name";
        name.textContent = platform;

        const percentage =
            totalVal > 0 ? ((val / totalVal) * 100).toFixed(1) : 0;
        const valSpan = document.createElement("span");
        valSpan.className = "platform-hours";
        valSpan.textContent =
            statsMode === "time"
                ? `${formatTime(val * (timeFormat === "hours" ? 1000 * 60 * 60 : 1000 * 60))} (${percentage}%)`
                : `${val} listens (${percentage}%)`;

        item.appendChild(name);
        item.appendChild(valSpan);
        listContainer.appendChild(item);
    });
}

function updateCountryChart() {
    const ctx = document.getElementById("countryChart");
    if (!ctx) return;

    const countries = {};
    filteredData.forEach((item) => {
        if (item.conn_country) {
            if (statsMode === "time") {
                countries[item.conn_country] =
                    (countries[item.conn_country] || 0) +
                    formatTimeValue(item.ms_played);
            } else {
                countries[item.conn_country] =
                    (countries[item.conn_country] || 0) + 1;
            }
        }
    });

    // Get top 5 countries
    const topCountries = Object.entries(countries)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    if (charts.countryChart) charts.countryChart.destroy();

    charts.countryChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: topCountries.map(([country]) => country),
            datasets: [
                {
                    label:
                        statsMode === "time"
                            ? timeFormat === "hours"
                                ? "Hours Listened"
                                : "Minutes Listened"
                            : "Listens",
                    data: topCountries.map(([, count]) => count),
                    backgroundColor: "#1db954",
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    right: 10,
                    bottom: 10,
                    left: 10,
                },
            },
            plugins: {
                legend: {
                    labels: { color: "white" },
                    display: false,
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: "white",
                        maxRotation: 45,
                    },
                    grid: { color: "rgba(255,255,255,0.1)" },
                },
                y: {
                    ticks: {
                        color: "white",
                        beginAtZero: true,
                    },
                    grid: { color: "rgba(255,255,255,0.1)" },
                },
            },
        },
    });
}

function updateHourlyChart() {
    const ctx = document.getElementById("hourlyChart");
    if (!ctx) return;

    let hourlyData, yLabel;
    if (statsMode === "time") {
        hourlyData = new Array(24).fill(0);
        filteredData.forEach((item) => {
            const hour = new Date(item.ts).getHours();
            hourlyData[hour] += formatTimeValue(item.ms_played);
        });
        yLabel =
            timeFormat === "hours"
                ? "Hours Listened"
                : "Minutes Listened";
    } else {
        hourlyData = calculateHourlyDistribution();
        yLabel = "Listens";
    }

    if (charts.hourlyChart) charts.hourlyChart.destroy();

    charts.hourlyChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [
                {
                    label: yLabel,
                    data: hourlyData,
                    backgroundColor: "#1db954",
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    right: 10,
                    bottom: 10,
                    left: 10,
                },
            },
            plugins: {
                legend: {
                    labels: { color: "white" },
                    display: false,
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: "white",
                        maxTicksLimit: 12,
                    },
                    grid: { color: "rgba(255,255,255,0.1)" },
                },
                y: {
                    ticks: {
                        color: "white",
                        beginAtZero: true,
                    },
                    grid: { color: "rgba(255,255,255,0.1)" },
                },
            },
        },
    });
}

function updateWeeklyChart() {
    const ctx = document.getElementById("weeklyChart");
    if (!ctx) return;

    let weeklyData = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    if (statsMode === "time") {
        filteredData.forEach((item) => {
            if (item.ts && item.ms_played) {
                const day = new Date(item.ts).getDay();
                weeklyData[day] += formatTimeValue(item.ms_played);
            }
        });
    } else {
        filteredData.forEach((item) => {
            if (item.ts) {
                const day = new Date(item.ts).getDay();
                weeklyData[day]++;
            }
        });
    }

    const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];

    if (charts.weeklyChart) charts.weeklyChart.destroy();

    charts.weeklyChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: dayNames,
            datasets: [
                {
                    label:
                        statsMode === "time"
                            ? timeFormat === "hours"
                                ? "Hours Listened"
                                : "Minutes Listened"
                            : "Listens",
                    data: weeklyData,
                    backgroundColor: "#1db954",
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: "white" },
                    display: false,
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: "white",
                    },
                    grid: { color: "rgba(255,255,255,0.1)" },
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "white",
                    },
                    grid: { color: "rgba(255,255,255,0.1)" },
                },
            },
        },
    });
}

function getDateRange(data) {
    if (data.length === 0)
        return { days: 1, start: new Date(), end: new Date() };

    let minDate = new Date(data[0].ts);
    let maxDate = new Date(data[0].ts);
    for (const item of data) {
        const itemDate = new Date(item.ts);
        if (itemDate < minDate) minDate = itemDate;
        if (itemDate > maxDate) maxDate = itemDate;
    }
    const start = minDate;
    const end = maxDate;
    const days = Math.max(
        1,
        Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
    );

    return { days, start, end };
}

// Event listeners
document
    .getElementById("fileInput")
    .addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (file && file.name.toLowerCase().endsWith(".zip")) {
            processZipFile(file);
        } else {
            showErrorView(
                "Please select a valid ZIP file containing your Spotify data.",
            );
        }
    });

document
    .getElementById("periodSelect")
    .addEventListener("change", (e) => {
        applyFilter(e.target.value);
    });

// Drag and drop functionality
const dropZone = document.getElementById("dropZone");

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");

    const files = e.dataTransfer.files;
    if (
        files.length > 0 &&
        files[0].name.toLowerCase().endsWith(".zip")
    ) {
        processZipFile(files[0]);
    } else {
        showErrorView(
            "Please drop a valid ZIP file containing your Spotify data.",
        );
    }
});

// Initialize with upload view
showUploadView();

// Set initial toggle button states after DOM loads
window.addEventListener("DOMContentLoaded", () => {
    updateToggleButtons("weeklyChartMode", weeklyChartMode);
    updateToggleButtons();

    // Show mobile warning if on mobile device
    const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent,
        );
    if (isMobile) {
        document.getElementById("mobileWarning").style.display =
            "block";
    }
});

// Print as PDF button logic
function updatePrintButtonVisibility() {
    const btnContainer = document.getElementById(
        "printButtonContainer",
    );
    if (btnContainer) {
        btnContainer.style.display =
            filteredData.length > 0 ? "block" : "none";
    }
}

// Attach print event
document.addEventListener("DOMContentLoaded", function () {
    const printBtn = document.getElementById("printPdfBtn");
    if (printBtn) {
        printBtn.addEventListener("click", function () {
            window.print();
        });
    }
});

// Patch updateStats and showStatsView to update print button visibility
const _updateStats =
    typeof updateStats === "function" ? updateStats : null;
window.updateStats = function () {
    if (_updateStats) _updateStats();
    updatePrintButtonVisibility();
};
const _showStatsView =
    typeof showStatsView === "function" ? showStatsView : null;
window.showStatsView = function () {
    if (_showStatsView) _showStatsView();
    updatePrintButtonVisibility();
};