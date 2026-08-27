const SAMPLE_MARKER_ID = 23;
const SAMPLE_MARKER_CODE = 0x1085eee;

export function markerGrid(code = SAMPLE_MARKER_CODE) {
  const bits = code.toString(2).padStart(25, '0');
  const cells = [];
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const border = row === 0 || row === 6 || column === 0 || column === 6;
      const value = border ? 0 : Number(bits[(row - 1) * 5 + column - 1]);
      cells.push(value);
    }
  }
  return cells;
}

export function renderMiniMarker(element) {
  element.replaceChildren(...markerGrid().map((value) => {
    const cell = document.createElement('span');
    cell.className = value ? 'white' : 'black';
    return cell;
  }));
}

export function markerSvg({ size = 420, quietZone = 42 } = {}) {
  const markerSize = size - quietZone * 2;
  const cell = markerSize / 7;
  const cells = markerGrid();
  const squares = cells.map((value, index) => {
    if (value) return '';
    const x = quietZone + (index % 7) * cell;
    const y = quietZone + Math.floor(index / 7) * cell;
    return `<rect x="${x}" y="${y}" width="${cell + 0.2}" height="${cell + 0.2}" fill="#050505"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="ArUco marker ${SAMPLE_MARKER_ID}"><rect width="${size}" height="${size}" fill="#fff"/>${squares}</svg>`;
}

export function openPrintableMarker() {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('The print window was blocked by your browser.');

  popup.document.write(`<!doctype html>
    <html><head><title>Anchor marker #${SAMPLE_MARKER_ID}</title>
    <style>
      *{box-sizing:border-box} body{margin:0;font-family:Arial,sans-serif;color:#101412;background:#e8ebe5}
      .toolbar{position:fixed;inset:0 0 auto;height:58px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;background:#0b1411;color:white}
      button{border:0;padding:10px 18px;background:#c7f04b;color:#07100e;font-weight:700;cursor:pointer}
      .sheet{width:210mm;height:297mm;margin:78px auto 20px;padding:24mm;background:white;display:grid;place-items:center}
      .card{width:170mm;height:96mm;border:1px solid #c9cdc8;padding:12mm;display:grid;grid-template-columns:1fr 62.5mm;align-items:end;gap:8mm}
      .logo{font-weight:800;letter-spacing:.16em;font-size:12pt}.copy{align-self:start}.copy h1{margin:23mm 0 3mm;font-size:22pt;letter-spacing:-.04em}.copy p{margin:0;color:#5c635f;font-size:10pt}
      .marker svg{width:62.5mm;height:62.5mm;display:block}.label{font:7pt monospace;text-align:center;margin-top:2mm;color:#555}
      @page{size:A4;margin:0}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0;box-shadow:none}}
    </style></head><body>
    <div class="toolbar"><span>Print sample · marker #${SAMPLE_MARKER_ID} · 50 mm</span><button onclick="window.print()">Print A4</button></div>
    <main class="sheet"><section class="card"><div class="copy"><div class="logo">ANCHOR / LAB</div><h1>Point. Scan.<br>Bring to life.</h1><p>High-performance marker tracking in your browser.</p></div><div class="marker">${markerSvg()}<div class="label">ARUCO · ID ${SAMPLE_MARKER_ID} · 50 MM</div></div></section></main>
    <script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
  popup.document.close();
}

export { SAMPLE_MARKER_ID };
