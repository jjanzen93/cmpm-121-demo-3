import leaflet from "leaflet";

interface Cell {
  readonly x: number;
  readonly y: number;
}

export class Board {
  readonly tileWidth: number;
  readonly tileVisibilityRadius: number;
  readonly gridOffset: number;

  private readonly knownCells: Map<string, Cell>;

  constructor(
    tileWidth: number,
    tileVisibilityRadius: number,
    gridOffset: number,
  ) {
    this.tileWidth = tileWidth;
    this.tileVisibilityRadius = tileVisibilityRadius;
    this.gridOffset = gridOffset;

    this.knownCells = new Map();
  }

  public getCanonicalCell(cell: Cell): Cell {
    const { x, y } = cell;
    const key = [x, y].toString();
    if (this.knownCells.get(key) == undefined) {
      this.knownCells.set(key, cell);
    }
    return this.knownCells.get(key)!;
  }

  getCellForPoint(point: leaflet.LatLng): Cell {
    return this.getCanonicalCell({
      x: Math.round(point.lng / this.tileWidth),
      y: Math.round(point.lat / this.tileWidth),
    });
  }

  getCellBounds(cell: Cell): leaflet.LatLngBounds {
    return leaflet.latLngBounds([
      [
        cell.y * this.tileWidth + this.gridOffset,
        cell.x * this.tileWidth + this.gridOffset,
      ],
      [
        cell.y * this.tileWidth + this.tileWidth + this.gridOffset,
        cell.x * this.tileWidth + this.tileWidth + this.gridOffset,
      ],
    ]);
  }

  getCellsNearPoint(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const originCell = this.getCellForPoint(point);
    for (
      let i = originCell.x - this.tileVisibilityRadius;
      i <= originCell.x + this.tileVisibilityRadius;
      i++
    ) {
      for (
        let j = originCell.y - this.tileVisibilityRadius;
        j <= originCell.y + this.tileVisibilityRadius;
        j++
      ) {
        const current_cell = { x: i, y: j };
        resultCells.push(this.getCanonicalCell(current_cell));
      }
    }
    return resultCells;
  }
}
