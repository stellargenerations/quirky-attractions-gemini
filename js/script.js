document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const googleSheetCsvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQcrExOdmNWQbpkckNmBd9--axnuoDa9KxDQB8vayVHJL_P3a36mNQZPfb1wrOL0Xiv0e-PkKg1wA-x/pub?output=csv'; // <-- PASTE YOUR URL HERE
    const initialCoords = [39.8283, -98.5795]; // Center of the US
    const initialZoom = 4;
    const focusedZoom = 13; // Zoom level when clicking a list item

    // --- DOM ELEMENTS ---
    const mapElement = document.getElementById('map');
    const attractionListElement = document.getElementById('attraction-list');
    const categoryFilterElement = document.getElementById('category-filter');
    const stateFilterElement = document.getElementById('state-filter');
    const listLoadingMessage = document.getElementById('list-loading-message');
    const listErrorMessage = document.getElementById('list-error-message');
    const filterErrorMessage = document.getElementById('filter-error');
    const mapLoadingMessage = mapElement.querySelector('.loading-message');
    const resetButton = document.getElementById('reset-filters-btn');

    // --- STATE VARIABLES ---
    let map = null;
    let allAttractions = []; // Holds all parsed data
    let filteredAttractions = []; // Holds currently displayed data
    let markersLayerGroup = null; // Leaflet layer group for markers
    const uniqueCategories = new Set();
    const uniqueStates = new Set();
    let markers = {}; // Store markers by a unique ID (e.g., lat_lng)

    // --- FUNCTION DEFINITIONS ---

    /**
     * Initializes the Leaflet map.
     */
    function initializeMap() {
        try {
            map = L.map(mapElement).setView(initialCoords, initialZoom);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            markersLayerGroup = L.layerGroup().addTo(map);

            // Hide loading message once map tiles load
            map.whenReady(() => {
                if (mapLoadingMessage) mapLoadingMessage.style.display = 'none';
            });
             map.on('load', () => { // Fallback if whenReady doesn't catch it
                if (mapLoadingMessage) mapLoadingMessage.style.display = 'none';
            });

        } catch (error) {
            console.error("Error initializing map:", error);
            mapElement.innerHTML = '<p class="error-message">Failed to load map. Please try refreshing the page.</p>';
        }
    }

    /**
     * Basic CSV parser (handles simple cases, assumes comma delimiter and double quotes)
     * Improved to handle commas within quoted fields.
     */
    function parseCsv(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return []; // No data beyond header

        const header = lines[0].split(',').map(h => h.trim());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = [];
            let currentVal = '';
            let inQuotes = false;
            const line = lines[i].trim();

            for (let j = 0; j < line.length; j++) {
                const char = line[j];

                if (char === '"' && (j === 0 || line[j-1] !== '\\')) { // Handle quote escaping if needed later, simple toggle for now
                     inQuotes = !inQuotes;
                 } else if (char === ',' && !inQuotes) {
                     values.push(currentVal.trim().replace(/^"|"$/g, '')); // Remove surrounding quotes if any
                     currentVal = '';
                 } else {
                     currentVal += char;
                 }
            }
             values.push(currentVal.trim().replace(/^"|"$/g, '')); // Add the last value

            if (values.length === header.length) {
                 const entry = {};
                 header.forEach((key, index) => {
                    // Clean up potential extra quotes from Sheets export if parser missed them
                    entry[key] = values[index].replace(/^"|"$/g, '').trim();
                 });
                 // Data type conversion and validation
                 entry.Latitude = parseFloat(entry.Latitude);
                 entry.Longitude = parseFloat(entry.Longitude);
                 entry.Categories = entry.Categories ? entry.Categories.split(',').map(cat => cat.trim()).filter(cat => cat) : [];

                 // Add to unique sets for filters
                 if(entry.State) uniqueStates.add(entry.State);
                 entry.Categories.forEach(cat => uniqueCategories.add(cat));

                 // Basic validation: Need Name and valid Coordinates
                 if (entry.Name && !isNaN(entry.Latitude) && !isNaN(entry.Longitude)) {
                     data.push(entry);
                 } else {
                     console.warn("Skipping invalid entry:", entry);
                 }
            } else {
                console.warn(`Skipping row ${i+1}: Mismatched number of columns. Expected ${header.length}, got ${values.length}. Line: "${line}"`);
            }
        }
        return data;
    }


    /**
     * Fetches and parses attraction data from the Google Sheet CSV.
     */
    async function fetchData() {
        if (!googleSheetCsvUrl || googleSheetCsvUrl === 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQcrExOdmNWQbpkckNmBd9--axnuoDa9KxDQB8vayVHJL_P3a36mNQZPfb1wrOL0Xiv0e-PkKg1wA-x/pubhtml?gid=0&single=true') {
            displayError("Configuration error: Google Sheet URL is not set in js/script.js.", listErrorMessage);
             if (listLoadingMessage) listLoadingMessage.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(googleSheetCsvUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const csvText = await response.text();
            allAttractions = parseCsv(csvText);
            filteredAttractions = [...allAttractions]; // Initially, show all

            if (allAttractions.length > 0) {
                populateFilters();
                displayAttractions(filteredAttractions);
                if (listLoadingMessage) listLoadingMessage.style.display = 'none';
                listErrorMessage.style.display = 'none'; // Hide error if successful
            } else {
                displayError("No valid attractions found in the data source.", listErrorMessage);
                if (listLoadingMessage) listLoadingMessage.style.display = 'none';
            }

        } catch (error) {
            console.error("Error fetching or parsing data:", error);
            displayError(`Failed to load attraction data: ${error.message}. Check the Google Sheet URL and ensure it's published correctly.`, listErrorMessage);
            if (listLoadingMessage) listLoadingMessage.style.display = 'none';
        }
    }

    /**
     * Populates the category and state filter dropdowns.
     */
    function populateFilters() {
        // Clear existing options except the "All" option
        categoryFilterElement.innerHTML = '<option value="all">All Categories</option>';
        stateFilterElement.innerHTML = '<option value="all">All States</option>';

        // Sort alphabetically and add options
        const sortedCategories = [...uniqueCategories].sort();
        sortedCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilterElement.appendChild(option);
        });

        const sortedStates = [...uniqueStates].sort();
        sortedStates.forEach(state => {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = state;
            stateFilterElement.appendChild(option);
        });
    }

     /**
     * Creates the HTML content for a map popup.
     */
    function createPopupContent(attraction) {
        let content = `<h4>${attraction.Name}</h4>`;
        if (attraction.ImageURL) {
            // Add onerror to handle broken image links gracefully in the popup
            content += `<img src="${attraction.ImageURL}" alt="${attraction.ImageAltText || attraction.Name}" style="max-height: 150px; width: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">`;
             // Placeholder text if image fails
            content += `<p style="display: none; font-style: italic; color: #888;">Image not available</p>`;
        }
        content += `<p>${attraction.Description || 'No description available.'}</p>`;
        if (attraction.Website) {
            content += `<a href="${attraction.Website}" target="_blank" rel="noopener noreferrer" class="popup-website-link">Visit Website</a>`;
        }
        return content;
    }

    /**
     * Creates the HTML for an attraction card in the list view.
     */
    function createAttractionCard(attraction, index) {
        // Generate a unique ID based on coordinates or index if needed
        const cardId = `attraction-${index}`;
        // Create a slug for category CSS classes (lowercase, replace spaces/symbols with hyphens)
        const categoryClass = attraction.Categories[0] ? `category-${attraction.Categories[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : 'category-default';

        // Add onerror for the image in the card
        const imageHtml = attraction.ImageURL
            ? `<img src="${attraction.ImageURL}" alt="${attraction.ImageAltText || attraction.Name}" loading="lazy" onerror="this.style.display='none'; this.closest('.attraction-card').querySelector('.no-image-placeholder').style.display='block';">`
            : '';
        const noImagePlaceholder = `<div class="no-image-placeholder" style="display: ${attraction.ImageURL ? 'none' : 'flex'}; align-items: center; justify-content: center; height: 100px; background: #eee; color: #aaa; font-size: 0.9em;">No image available</div>`;

        const websiteLink = attraction.Website
            ? `<div class="website-link"><a href="${attraction.Website}" target="_blank" rel="noopener noreferrer">Visit Website</a></div>`
            : '';

        return `
            <div class="attraction-card ${categoryClass}" id="${cardId}" data-lat="${attraction.Latitude}" data-lng="${attraction.Longitude}">
                ${imageHtml}
                ${noImagePlaceholder}
                <div class="card-content">
                    <h3>${attraction.Name}</h3>
                    <p class="location">${attraction.LocationCity || 'Unknown City'}, ${attraction.State || 'Unknown State'}</p>
                    <p class="description">${attraction.Description || 'No description available.'}</p>
                    <p class="categories">Categories: ${attraction.Categories.join(', ') || 'None'}</p>
                    ${websiteLink}
                </div>
            </div>
        `;
    }


    /**
     * Displays attractions on the map and in the list based on the provided data array.
     */
    function displayAttractions(attractionsToDisplay) {
        if (!map || !markersLayerGroup) return;

        // Clear previous markers and list items
        markersLayerGroup.clearLayers();
        attractionListElement.innerHTML = '';
        markers = {}; // Clear marker reference object

        if (attractionsToDisplay.length === 0) {
            attractionListElement.innerHTML = '<p>No attractions match the current filters.</p>';
            return;
        }

        attractionsToDisplay.forEach((attraction, index) => {
            const { Latitude, Longitude, Name } = attraction;
            const markerId = `${Latitude}_${Longitude}`; // Unique ID for marker lookup

            // Create Marker
            const marker = L.marker([Latitude, Longitude], {
                title: Name // Tooltip on hover
            });
            marker.bindPopup(createPopupContent(attraction), { // Create popup on demand
                 maxWidth: 300
            });
            marker.addTo(markersLayerGroup);
            markers[markerId] = marker; // Store marker reference

            // Create List Item (Card)
            const cardHtml = createAttractionCard(attraction, index);
            attractionListElement.insertAdjacentHTML('beforeend', cardHtml);
        });
    }

    /**
     * Applies filters based on selected category and state.
     */
    function applyFilters() {
         filterErrorMessage.style.display = 'none'; // Hide previous errors
        const selectedCategory = categoryFilterElement.value;
        const selectedState = stateFilterElement.value;

        try {
             filteredAttractions = allAttractions.filter(attraction => {
                const categoryMatch = selectedCategory === 'all' || (attraction.Categories && attraction.Categories.includes(selectedCategory));
                const stateMatch = selectedState === 'all' || attraction.State === selectedState;
                return categoryMatch && stateMatch;
            });

            displayAttractions(filteredAttractions);

        } catch(error){
            console.error("Error applying filters:", error);
            displayError("An error occurred while filtering. Please try again.", filterErrorMessage);
        }
    }

     /**
     * Resets filters to show all attractions.
     */
    function resetFilters() {
        categoryFilterElement.value = 'all';
        stateFilterElement.value = 'all';
        applyFilters();
    }


    /**
     * Centers the map on the selected attraction and opens its popup.
     */
    function focusMapOnAttraction(lat, lng) {
        if (!map) return;
        const markerId = `${lat}_${lng}`;
        const marker = markers[markerId];

        map.flyTo([lat, lng], focusedZoom, {
             animate: true,
             duration: 1 // Animation duration in seconds
         });

         // Open popup after flying animation (slight delay)
         if (marker) {
             setTimeout(() => {
                 marker.openPopup();
             }, 1100); // Slightly longer than animation duration
         }
    }

    /**
     * Displays an error message in the specified element.
     */
    function displayError(message, element) {
        element.innerHTML = message;
        element.style.display = 'block';
    }


    // --- EVENT LISTENERS ---

    // Filter changes
    categoryFilterElement.addEventListener('change', applyFilters);
    stateFilterElement.addEventListener('change', applyFilters);
    resetButton.addEventListener('click', resetFilters);

    // Click on attraction list item (using event delegation)
    attractionListElement.addEventListener('click', (event) => {
        const card = event.target.closest('.attraction-card');
        if (card) {
            const lat = parseFloat(card.dataset.lat);
            const lng = parseFloat(card.dataset.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                focusMapOnAttraction(lat, lng);
                 // Optional: scroll card into view if needed, especially on mobile
                 card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    });

    // --- INITIALIZATION ---
    initializeMap();
    fetchData(); // Fetch data after map is set up

}); // End DOMContentLoaded
