// ── MAP ─────────────────────────────────────────────
// 0=floor, 1=wall — dynamisch generiert
let COLS, ROWS, MAP;
let _floorNoise = null;

function generateMap(mapType) {
  _floorNoise = null;
  COLS = Math.floor(W / TILE);
  ROWS = Math.floor(H / TILE);
  if (COLS < 10) COLS = 10;
  if (ROWS < 8) ROWS = 8;

  MAP = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push((r === 0 || r === ROWS-1 || c === 0 || c === COLS-1) ? 1 : 0);
    }
    MAP.push(row);
  }

  const type = mapType || selectedMap || 'warehouse';
  if (type === 'warehouse') generateWarehouse();
  else if (type === 'bunker') generateBunker();
  else if (type === 'city') generateCity();
}

function generateWarehouse() {
  const cx1 = Math.floor(COLS * 0.22), cy1 = Math.floor(ROWS * 0.2);
  placeWall(cx1, cy1); placeWall(cx1+1, cy1); placeWall(cx1, cy1+1);
  placeWall(COLS-1-cx1, cy1); placeWall(COLS-2-cx1, cy1); placeWall(COLS-1-cx1, cy1+1);
  placeWall(cx1, ROWS-1-cy1); placeWall(cx1+1, ROWS-1-cy1); placeWall(cx1, ROWS-2-cy1);
  placeWall(COLS-1-cx1, ROWS-1-cy1); placeWall(COLS-2-cx1, ROWS-1-cy1); placeWall(COLS-1-cx1, ROWS-2-cy1);
  const px = Math.floor(COLS * 0.4), py = Math.floor(ROWS * 0.33);
  placeWall(px, py); placeWall(px, py+1);
  placeWall(COLS-1-px, py); placeWall(COLS-1-px, py+1);
  placeWall(px, ROWS-1-py); placeWall(px, ROWS-2-py);
  placeWall(COLS-1-px, ROWS-1-py); placeWall(COLS-1-px, ROWS-2-py);
}

function generateBunker() {
  // Open floor with bunker-themed obstacles — NO closed rooms
  const midC = Math.floor(COLS / 2), midR = Math.floor(ROWS / 2);

  // Control console clusters (2x1 blocks scattered)
  const obstacles = [
    // Center pillars (offset from spawn)
    [midC - 3, midR], [midC + 3, midR], [midC, midR - 3], [midC, midR + 3],
    // Corner barricades (L-shapes)
    [3, 3], [4, 3], [3, 4],
    [COLS-4, 3], [COLS-5, 3], [COLS-4, 4],
    [3, ROWS-4], [4, ROWS-4], [3, ROWS-5],
    [COLS-4, ROWS-4], [COLS-5, ROWS-4], [COLS-4, ROWS-5],
    // Mid pillars
    [Math.floor(COLS*0.3), Math.floor(ROWS*0.3)], [Math.floor(COLS*0.3)+1, Math.floor(ROWS*0.3)],
    [Math.floor(COLS*0.7), Math.floor(ROWS*0.3)], [Math.floor(COLS*0.7), Math.floor(ROWS*0.3)+1],
    [Math.floor(COLS*0.3), Math.floor(ROWS*0.7)], [Math.floor(COLS*0.3), Math.floor(ROWS*0.7)-1],
    [Math.floor(COLS*0.7), Math.floor(ROWS*0.7)], [Math.floor(COLS*0.7)-1, Math.floor(ROWS*0.7)],
    // Side barricades
    [Math.floor(COLS*0.5), Math.floor(ROWS*0.2)], [Math.floor(COLS*0.5)+1, Math.floor(ROWS*0.2)],
    [Math.floor(COLS*0.5), Math.floor(ROWS*0.8)], [Math.floor(COLS*0.5)-1, Math.floor(ROWS*0.8)],
    [Math.floor(COLS*0.15), midR], [Math.floor(COLS*0.15), midR+1],
    [Math.floor(COLS*0.85), midR], [Math.floor(COLS*0.85), midR-1],
  ];
  for (const [c, r] of obstacles) placeWall(c, r);
}

// City: truly infinite procedural map — no MAP array needed
// Uses varying block sizes and wide streets for open feel

function getCityTile(wc, wr) {
  // Clear spawn area
  if (Math.abs(wc) <= 4 && Math.abs(wr) <= 4) return 0;

  // Use larger grid cells with varying building sizes inside
  // Grid cell: 12x10 tiles (plenty of street space)
  const cellW = 12, cellH = 10;
  const cellX = Math.floor((wc >= 0 ? wc : wc - cellW + 1) / cellW);
  const cellY = Math.floor((wr >= 0 ? wr : wr - cellH + 1) / cellH);
  const lx = ((wc % cellW) + cellW) % cellW;
  const ly = ((wr % cellH) + cellH) % cellH;

  // Block seed determines building shape per cell
  const bs = (((cellX * 137 + cellY * 311) % 1000) + 1000) % 1000;
  const bs2 = (((cellX * 53 + cellY * 97) % 1000) + 1000) % 1000;

  // ~25% of cells are completely empty (parks, plazas, intersections)
  if (bs < 250) return 0;

  // Building dimensions vary per cell (3-6 wide, 2-5 tall)
  const bw = 3 + (bs % 4);   // 3-6
  const bh = 2 + (bs2 % 4);  // 2-5
  // Building offset within cell (always leaves street margins)
  const ox = 1 + (bs2 % 2);  // 1-2 tiles from left edge
  const oy = 1 + (bs % 2);   // 1-2 tiles from top edge

  // Check if this tile is inside the building
  if (lx >= ox && lx < ox + bw && ly >= oy && ly < oy + bh) return 1;

  // Some cells have a second smaller building
  if (bs > 700) {
    const bw2 = 2 + (bs % 2);
    const bh2 = 2;
    const ox2 = ox + bw + 1;
    const oy2 = oy + (bs2 % 2);
    if (ox2 + bw2 <= cellW - 1 && lx >= ox2 && lx < ox2 + bw2 && ly >= oy2 && ly < oy2 + bh2) return 1;
  }

  return 0;
}

function generateCity() {
  camActive = true;
  // Set large COLS/ROWS for minimap and compatibility, but map is infinite
  COLS = 200; ROWS = 200;
  // Create a dummy MAP that won't be used for city (isWall uses getCityTile)
  MAP = [];
  for (let r = 0; r < 1; r++) { MAP[r] = [0]; }
}

function placeWall(c, r) {
  if (r > 0 && r < ROWS-1 && c > 0 && c < COLS-1) MAP[r][c] = 1;
}

generateMap();

function isWall(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (camActive) return getCityTile(tx, ty) >= 1; // infinite city
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  return MAP[ty][tx] >= 1;
}

// Tile-coordinate wall check (used by flowfield BFS)
function isTileWall(col, row) {
  if (camActive) return getCityTile(col, row) >= 1;
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return true;
  return MAP[row][col] >= 1;
}

function wallCollide(x, y, r) {
  const offsets = [[-r,-r],[r,-r],[-r,r],[r,r],[0,-r],[0,r],[-r,0],[r,0]];
  return offsets.some(([dx,dy]) => isWall(x+dx, y+dy));
}

// Ray-march through tiles — returns true if no wall between two points
function hasLineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < TILE) return true;
  const step = TILE * 0.4;
  const steps = Math.ceil(dist / step);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWall(x1 + dx * t, y1 + dy * t)) return false;
  }
  return true;
}

// ── SPAWNING ────────────────────────────────────────
let SPAWN_EDGES = [];
function rebuildSpawnEdges() {
  SPAWN_EDGES = [];
  if (camActive) return; // City: infinite map, zombies spawn around player
  for (let col = 1; col < COLS-1; col++) {
    if (MAP[1] && MAP[1][col] === 0) SPAWN_EDGES.push({ x: col*TILE+TILE/2, y: TILE+TILE/2 });
    if (MAP[ROWS-2] && MAP[ROWS-2][col] === 0) SPAWN_EDGES.push({ x: col*TILE+TILE/2, y: (ROWS-2)*TILE+TILE/2 });
  }
  for (let row = 1; row < ROWS-1; row++) {
    if (MAP[row] && MAP[row][1] === 0) SPAWN_EDGES.push({ x: TILE+TILE/2, y: row*TILE+TILE/2 });
    if (MAP[row] && MAP[row][COLS-2] === 0) SPAWN_EDGES.push({ x: (COLS-2)*TILE+TILE/2, y: row*TILE+TILE/2 });
  }
}
rebuildSpawnEdges();

// ── FLOWFIELD PATHFINDING ──────────────────────────────
let flowfield = null; // 2D array of {dx, dy} directions — local or full
let mapCacheCanvas = null; // pre-rendered map for perf
let ffOffsetCol = 0, ffOffsetRow = 0; // world tile coords of flowfield[0][0]
let ffWidth = 0, ffHeight = 0;        // flowfield grid dimensions
let ffCenterCol = -999, ffCenterRow = -999; // player tile when last computed

function computeFlowfield() {
  const pTileX = Math.floor(player.x / TILE);
  const pTileY = Math.floor(player.y / TILE);

  let startCol, startRow, w, h;

  if (camActive) {
    // Local flowfield — must cover zombie spawn distance (W*0.6+200 px)
    const radius = Math.ceil((Math.max(W, H) * 0.6 + 250) / TILE) + 5;
    startCol = pTileX - radius;
    startRow = pTileY - radius;
    w = radius * 2 + 1;
    h = radius * 2 + 1;
  } else {
    startCol = 0;
    startRow = 0;
    w = COLS;
    h = ROWS;
  }

  ffOffsetCol = startCol;
  ffOffsetRow = startRow;
  ffWidth = w;
  ffHeight = h;
  ffCenterCol = pTileX;
  ffCenterRow = pTileY;

  // Init grid
  flowfield = [];
  for (let r = 0; r < h; r++) {
    flowfield[r] = [];
    for (let c = 0; c < w; c++) {
      flowfield[r][c] = { dx: 0, dy: 0, dist: Infinity };
    }
  }

  const localPX = pTileX - startCol;
  const localPY = pTileY - startRow;
  if (localPX >= 0 && localPX < w && localPY >= 0 && localPY < h) {
    flowfield[localPY][localPX].dist = 0;
  }

  // BFS with cardinal + diagonal neighbors
  const queue = [{ x: localPX, y: localPY }];
  const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  let qHead = 0;
  while (qHead < queue.length) {
    const cur = queue[qHead++];
    const curDist = flowfield[cur.y][cur.x].dist;

    for (const [nx, ny] of neighbors) {
      const lx = cur.x + nx;
      const ly = cur.y + ny;
      if (lx < 0 || lx >= w || ly < 0 || ly >= h) continue;

      // World coords for wall check
      const wx = lx + startCol;
      const wy = ly + startRow;
      if (isTileWall(wx, wy)) continue;

      // Diagonal: both adjacent cardinal tiles must be free (no corner cutting)
      if (nx !== 0 && ny !== 0) {
        if (isTileWall(cur.x + nx + startCol, cur.y + startRow) ||
            isTileWall(cur.x + startCol, cur.y + ny + startRow)) continue;
      }

      const cost = (nx !== 0 && ny !== 0) ? 1.41 : 1;
      const newDist = curDist + cost;
      if (newDist < flowfield[ly][lx].dist) {
        flowfield[ly][lx].dist = newDist;
        flowfield[ly][lx].dx = -nx;
        flowfield[ly][lx].dy = -ny;
        queue.push({ x: lx, y: ly });
      }
    }
  }
}

let lastFlowfieldUpdate = 0;

// ── SMOOTHED FLOWFIELD DIRECTION ─────────────────────
// Interpolates between neighboring tile distances for sub-tile precision
function getSmoothedFlowDir(px, py) {
  if (!flowfield) return null;
  // Fractional tile position
  const fx = px / TILE - 0.5;
  const fy = py / TILE - 0.5;
  const worldIX = Math.floor(fx);
  const worldIY = Math.floor(fy);
  const wx = fx - worldIX; // weight x (0..1)
  const wy = fy - worldIY; // weight y (0..1)

  // Convert to local flowfield coords
  const ix = worldIX - ffOffsetCol;
  const iy = worldIY - ffOffsetRow;

  // Sample distances at 4 corners of the cell
  function getDist(c, r) {
    if (c < 0 || c >= ffWidth || r < 0 || r >= ffHeight) return Infinity;
    const wc = c + ffOffsetCol, wr = r + ffOffsetRow;
    if (isTileWall(wc, wr)) return Infinity;
    return flowfield[r][c].dist;
  }

  const d00 = getDist(ix, iy);
  const d10 = getDist(ix + 1, iy);
  const d01 = getDist(ix, iy + 1);
  const d11 = getDist(ix + 1, iy + 1);

  // If ANY corner is a wall/unreachable, use raw BFS direction (no interpolation)
  // Interpolation near walls creates bad gradients that push away from wall
  // instead of along the path around it
  if (d00 === Infinity || d10 === Infinity || d01 === Infinity || d11 === Infinity) {
    const tx = Math.floor(px / TILE) - ffOffsetCol;
    const ty = Math.floor(py / TILE) - ffOffsetRow;
    if (tx >= 0 && tx < ffWidth && ty >= 0 && ty < ffHeight && flowfield[ty][tx].dist < Infinity) {
      const ff = flowfield[ty][tx];
      return { dx: ff.dx, dy: ff.dy };
    }
    return null;
  }

  // All corners valid — bilinear interpolation for smooth movement in open areas
  const ddx = -((d10 - d00) * (1 - wy) + (d11 - d01) * wy);
  const ddy = -((d01 - d00) * (1 - wx) + (d11 - d10) * wx);

  const len = Math.sqrt(ddx * ddx + ddy * ddy);
  if (len < 0.001) return null;
  return { dx: ddx / len, dy: ddy / len };
}

// Find nearest walkable tile center for stuck recovery
function nearestFreeTileCenter(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  let bestDist = Infinity, bestX = px, bestY = py;
  const searchR = 4;
  for (let r = ty - searchR; r <= ty + searchR; r++) {
    for (let c = tx - searchR; c <= tx + searchR; c++) {
      if (!camActive && (r < 0 || r >= ROWS || c < 0 || c >= COLS)) continue;
      if (isTileWall(c, r)) continue;
      const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
      const ddx = px - cx, ddy = py - cy;
      const d = ddx * ddx + ddy * ddy;
      if (d < bestDist) { bestDist = d; bestX = cx; bestY = cy; }
    }
  }
  return { x: bestX, y: bestY };
}
