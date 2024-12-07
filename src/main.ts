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

// Origin (currently Null Island)
const ORIGIN_COORDS = leaflet.latLng(36.98949379578401, -122.06277128548504);
const GRID_OFFSET = -.00005;

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Board object
const board: Board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE, GRID_OFFSET);
const DEFAULT_CELL: Cell = board.getCellForPoint(ORIGIN_COORDS);

interface Coin {
  origin: Cell;
  serial: string;
}

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class Cache implements Momento<string> {
  location: Cell;
  inventory: Coin[];
  constructor(location: Cell = DEFAULT_CELL, inventory: Coin[] = []) {
    this.location = location;
    this.inventory = inventory;
  }
  toMomento() {
    return JSON.stringify([this.location, this.inventory]);
  }

  fromMomento(momento: string) {
    const newarray = JSON.parse(momento);
    try {
      this.location = board.getCanonicalCell(newarray[0]);
    } catch (error) {
      console.error("An error occurred:", error);
    }
    try {
      this.inventory = newarray[1];
    } catch (error) {
      console.error("An error occurred:", error);
    }
  }

  drawCache() {
    // Add a rectangle to the map to represent the cache
    const bounds = board.getCellBounds(this.location);
    const rect = leaflet.rectangle(bounds);
    rect.addTo(map);
    rects.push(rect);

    // Handle interactions with the cache
    rect.bindPopup(() => {
      // The popup offers a description and button, using the cell's custom coordinates rather than absolute lat/long
      const popup_div = document.createElement("div");
      popup_div.innerHTML = `
                      <div>There is a cache here at "${this.location.x},${this.location.y}". You find <span id="quantity">${this.inventory.length}</span> coin(s) inside.</div>
                      <button id="pick-up">pick up</button>
                      <button id="drop-off">drop off</button>`;

      // Clicking the pick up button transfers the most recently added coin from the cache to the player
      // TODO: Make a separate pick up event that will allow player to be more specific about which coin they pick up
      popup_div
        .querySelector<HTMLButtonElement>("#pick-up")!
        .addEventListener("click", () => {
          if (this.inventory.length > 0) {
            const selected_coin = this.inventory.pop();
            popup_div.querySelector<HTMLSpanElement>("#quantity")!.innerHTML =
              `${this.inventory.length}`;
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
          if (player.collection.length > 0) {
            const selected_coin = player.collection.pop();
            playerUI.innerHTML =
              `Coins Collected: ${player.collection.length}<br>` +
              inventoryToString(player.collection);
            if (selected_coin != null) {
              this.inventory.push(selected_coin);
              popup_div.querySelector<HTMLSpanElement>("#quantity")!.innerHTML =
                `${this.inventory.length}`;
            }
          }
        });

      return popup_div;
    });
  }
}

interface Player {
  location: leaflet.LatLng;
  collection: Coin[];
}

// Player object
const player: Player = { location: ORIGIN_COORDS, collection: [] };

const unloaded_caches: string[] = [];
let loaded_caches: Cache[] = [];
let rects: leaflet.Rectangle[] = [];

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

// TODO: Coin Prioritization

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
  const loading_cache: Cache = new Cache(cell, []);
  // Fill cache
  for (
    let i = Math.round(luck([cell.x, cell.y].toString()) * 100);
    i > 0;
    i--
  ) {
    mintCoin(loading_cache);
  }

  loading_cache.drawCache();

  loaded_caches.push(loading_cache);
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
  playerMarker.setLatLng(player.location);

  loaded_caches.forEach((cache) => {
    unloaded_caches.push(cache.toMomento());
  });
  loaded_caches = [];
  rects.forEach((rect) => {
    rect.remove();
  });
  rects = [];

  const nearby_cells = board.getCellsNearPoint(player.location);

  nearby_cells.forEach((cell: Cell) => {
    if (
      luck([cell.x * TILE_DEGREES, cell.y * TILE_DEGREES].toString()) <
        CACHE_SPAWN_PROBABILITY
    ) {
      let cache_exists = false;
      unloaded_caches.forEach((cache_str) => {
        const parsed_cache = new Cache();
        parsed_cache.fromMomento(cache_str);
        if (parsed_cache.location == cell) {
          cache_exists = true;
          parsed_cache.drawCache();
          loaded_caches.push(parsed_cache);
          unloaded_caches.splice(unloaded_caches.indexOf(cache_str), 1);
        }
        console.log(parsed_cache.location);
        console.log("Cache loaded? " + checkLoadStatus(parsed_cache));
      });
      if (!cache_exists) {
        console.log("cache spawning...");
        spawnCache(cell);
      }
    }
  });
  console.log(unloaded_caches.length);
}

function checkLoadStatus(cache: Cache) {
  loaded_caches.forEach((current) => {
    if (cache == current) {
      return true;
    }
  });
  return false;
}

const controlPanel = document.querySelector<HTMLDivElement>("#controlPanel")!;
controlPanel.querySelector<HTMLButtonElement>("#north")!.addEventListener(
  "click",
  () => {
    player.location.lat += TILE_DEGREES;
    updatePosition();
  },
);
controlPanel.querySelector<HTMLButtonElement>("#south")!.addEventListener(
  "click",
  () => {
    player.location.lat -= TILE_DEGREES;
    updatePosition();
  },
);
controlPanel.querySelector<HTMLButtonElement>("#east")!.addEventListener(
  "click",
  () => {
    player.location.lng += TILE_DEGREES;
    updatePosition();
  },
);
controlPanel.querySelector<HTMLButtonElement>("#west")!.addEventListener(
  "click",
  () => {
    player.location.lng -= TILE_DEGREES;
    updatePosition();
  },
);

updatePosition();
console.log("Testing momento:");
const cache_test = new Cache({ x: 3, y: 3 }, []);
const cache_test_2 = new Cache();
const cache_1_string = cache_test.toMomento();
cache_test_2.fromMomento(cache_1_string);
console.log(
  "is cache cell test 1 and 2 equal? " +
    (cache_test.location == cache_test_2.location),
);
console.log("cell 1: " + cache_test.location.y);
console.log("cell 2: " + cache_test_2.location.y);
