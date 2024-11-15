// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

interface Cell {
  x: number;
  y: number;
  lat: number;
  lng: number;
  discovered: boolean;
}

interface Coin {
  origin: Cell;
  serial: string;
}

interface Cache {
  location: Cell;
  inventory: Coin[];
}

interface Player {
  location: Cell;
  collection: Coin[];
}

// Location of the classroom
const ORIGIN_COORDS = leaflet.latLng(0, 0);

// Defining the origin cell using classroom location
const ORIGIN_CELL: Cell = {
  x: 0,
  y: 0,
  lat: ORIGIN_COORDS.lat,
  lng: ORIGIN_COORDS.lng,
  discovered: true,
};

// Player object
const player: Player = { location: ORIGIN_CELL, collection: [] };

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: ORIGIN_COORDS,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(ORIGIN_COORDS);
playerMarker.bindTooltip("You are here.");
playerMarker.addTo(map);

// Display the player's collection size
const playerUI = document.querySelector<HTMLDivElement>("#playerUI")!; // element `playerUI` is defined in index.html
playerUI.innerHTML = `Coins Collected: ${player.collection.length}`;

// TODO: Display the serials of each coin with a button to prioritize it at the next drop off event.

// Add a new coin to a given cache
function mintCoin(target_cache: Cache) {
  const new_coin: Coin = {
    origin: target_cache.location,
    serial:
      `${target_cache.location.x}:${target_cache.location.y}::${target_cache.inventory.length}`,
  };
  target_cache.inventory.push(new_coin);
}

// Add caches to the map by cell numbers
function spawnCache(cell: Cell) {
  // Convert cell numbers into lat/lng bounds
  const bounds = leaflet.latLngBounds([
    [cell.lat, cell.lng],
    [
      cell.lat + TILE_DEGREES,
      cell.lng + TILE_DEGREES,
    ],
  ]);

  // Fill cache
  const loading_cache: Cache = { location: cell, inventory: [] };
  for (
    let i = Math.round(luck([cell.x, cell.y].toString()) * 100);
    i > 0;
    i--
  ) {
    mintCoin(loading_cache);
  }

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Handle interactions with the cache
  rect.bindPopup(() => {
    // The popup offers a description and button, using the cell's custom coordinates rather than absolute lat/long
    const popup_div = document.createElement("div");
    popup_div.innerHTML = `
                    <div>There is a cache here at "${cell.x},${cell.y}". You find <span id="quantity">${loading_cache.inventory.length}</span> coin(s) inside.</div>
                    <button id="pick-up">pick up</button>
                    <button id="drop-off">drop off</button>`;

    // Clicking the pick up button transfers the most recently added coin from the cache to the player
    // TODO: Make a separate pick up event that will allow player to be more specific about which coin they pick up
    popup_div
      .querySelector<HTMLButtonElement>("#pick-up")!
      .addEventListener("click", () => {
        if (loading_cache.inventory.length > 0) {
          const selected_coin = loading_cache.inventory.pop();
          popup_div.querySelector<HTMLSpanElement>("#quantity")!.innerHTML =
            `${loading_cache.inventory.length}`;
          if (selected_coin != null) {
            player.collection.push(selected_coin);
          }
          playerUI.innerHTML = `Coins Collected: ${player.collection.length}`;
        }
      });
    // Clicking the drop off button transfers the most recently added coin from the player to the cache
    // TODO: Make a separate drop off event that will allow player to be more specific about which coin they drop
    popup_div
      .querySelector<HTMLButtonElement>("#drop-off")!
      .addEventListener("click", () => {
        console.log("button clicked");
        if (player.collection.length > 0) {
          const selected_coin = player.collection.pop();
          playerUI.innerHTML = `Coins Collected: ${player.collection.length}`;
          console.log("token removed");
          if (selected_coin != null) {
            loading_cache.inventory.push(selected_coin);
            popup_div.querySelector<HTMLSpanElement>("#quantity")!.innerHTML =
              `${loading_cache.inventory.length}`;
            console.log("token recieved");
          }
        }
      });

    return popup_div;
  });
}

// Look around the player's range for caches to spawn
// TODO: Extract to function for when player movement needs to update nearby caches.
for (
  let i = player.location.x - NEIGHBORHOOD_SIZE;
  i < player.location.x + NEIGHBORHOOD_SIZE;
  i++
) {
  for (
    let j = player.location.y - NEIGHBORHOOD_SIZE;
    j < player.location.y + NEIGHBORHOOD_SIZE;
    j++
  ) {
    // If the cell is lucky, create a cell object and spawn a cache inside.
    // TODO: spawn cells regardless of whether or not they are lucky
    if (
      luck([i * TILE_DEGREES, j * TILE_DEGREES].toString()) <
        CACHE_SPAWN_PROBABILITY
    ) {
      const current_cell: Cell = {
        x: 0,
        y: 0,
        lat: (i * TILE_DEGREES) + player.location.lat,
        lng: (j * TILE_DEGREES) + player.location.lng,
        discovered: true,
      };
      // convert absolute coordinates to relative cell coordinates
      current_cell.y = Math.round(
        (current_cell.lat - ORIGIN_CELL.lat) / TILE_DEGREES,
      );
      current_cell.x = Math.round(
        (current_cell.lng - ORIGIN_CELL.lng) / TILE_DEGREES,
      );
      spawnCache(current_cell);
    }
  }
}
