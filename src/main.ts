// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// flyweight board
import { Board } from "./board.ts";

interface Cell {
  x: number;
  y: number;
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
  location: leaflet.LatLng;
  collection: Coin[];
}

// Origin (currently Null Island)
const ORIGIN_COORDS = leaflet.latLng(0, 0);
//const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
const GRID_OFFSET = -.00005;

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Player object
const player: Player = { location: ORIGIN_COORDS, collection: [] };

// Board object
const board: Board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE, GRID_OFFSET);

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
      `${target_cache.location.x}:${target_cache.location.y}#${target_cache.inventory.length}`,
  };
  target_cache.inventory.push(new_coin);
}

// Add caches to the map by cell numbers
function spawnCache(cell: Cell) {
  // Convert cell numbers into lat/lng bounds
  const bounds = board.getCellBounds(cell);

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
          playerUI.innerHTML =
            `Coins Collected: ${player.collection.length}<br>` +
            inventoryToString(player.collection);
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
          playerUI.innerHTML =
            `Coins Collected: ${player.collection.length}<br>` +
            inventoryToString(player.collection);
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

// convert given cell list to string

function inventoryToString(inventory: Coin[]) {
  let invString = `Inventory:<br>`;
  inventory.forEach((coin: Coin) => {
    invString += `[` + coin.serial + `]<br>`;
  });
  return invString;
}

// Look around the player's range for caches to spawn

function updatePosition() {
  const nearby_cells = board.getCellsNearPoint(player.location);
  nearby_cells.forEach((cell: Cell) => {
    if (
      luck([cell.x * TILE_DEGREES, cell.y * TILE_DEGREES].toString()) <
        CACHE_SPAWN_PROBABILITY
    ) {
      console.log("cache spawning...");
      spawnCache(cell);
    }
  });
}

updatePosition();
