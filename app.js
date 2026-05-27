// Constants for physics calculations
const h = 6.62607015e-34; // Planck's constant (J*s)
const kB = 1.380649e-23;  // Boltzmann's constant (J/K)
const amu = 1.660539e-27; // Atomic mass unit (kg)
const kB_eV = 8.617333262e-5; // Boltzmann's constant in eV/K

// Presentation Deck Logic
let currentSlideIndex = 0;
const slides = document.querySelectorAll('.slide');
const slideIndicator = document.getElementById('slide-indicator');

function updateNavigation() {
    slides.forEach((slide, idx) => {
        if (idx === currentSlideIndex) {
            slide.classList.add('active');
        } else {
            slide.classList.remove('active');
        }
    });
    
    // Update slide indicator: format like "01 / 09"
    const slideNumStr = String(currentSlideIndex + 1).padStart(2, '0');
    const totalSlidesStr = String(slides.length).padStart(2, '0');
    slideIndicator.textContent = `${slideNumStr} / ${totalSlidesStr}`;

    // Handle slide-specific initializations or triggers
    onSlideActivate(currentSlideIndex);
}

function nextSlide() {
    if (currentSlideIndex < slides.length - 1) {
        currentSlideIndex++;
        updateNavigation();
    }
}

function prevSlide() {
    if (currentSlideIndex > 0) {
        currentSlideIndex--;
        updateNavigation();
    }
}

function goToSlide(index) {
    if (index >= 0 && index < slides.length) {
        currentSlideIndex = index;
        updateNavigation();
    }
}

// Keyboard navigation
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
        nextSlide();
    } else if (e.key === 'ArrowLeft') {
        prevSlide();
    }
});

// Render LaTeX equations using KaTeX helper
function renderLatex(elementId, latexStr, isDisplay = true) {
    const el = document.getElementById(elementId);
    if (el) {
        katex.render(latexStr, el, {
            displayMode: isDisplay,
            throwOnError: false
        });
    }
}

// ----------------------------------------------------
// Slide 2: Interactive Molecule Viewer (Advanced Simulation & HUD)
// ----------------------------------------------------
const molCanvas = document.getElementById('molecule-canvas');
const molCtx = molCanvas.getContext('2d');
let mouseX = 0;
let mouseY = 0;
let mouseInCanvas = false;

// Mode state: 'monolayer', 'micelle', 'anatomy'
let moleculeMode = 'monolayer';

// Water surface wave nodes for capillar waves in monolayer mode
const waveNodes = [];
const numWaveNodes = 32;

// Micellization particles
const micelleParticles = [];
const numMicelleParticles = 48;

// Rotation angles for 3D micelle rendering
let micelleRotX = 0;
let micelleRotY = 0;
let micelleRotZ = 0;

// Animation frame request ID for cleanup
let moleculeAnimId = null;

function initMoleculeViewer() {
    const rect = molCanvas.getBoundingClientRect();
    molCanvas.width = rect.width;
    molCanvas.height = rect.height;

    // Setup wave nodes
    waveNodes.length = 0;
    const step = molCanvas.width / (numWaveNodes - 1);
    for (let i = 0; i < numWaveNodes; i++) {
        waveNodes.push({
            x: i * step,
            y: 0,
            vy: 0
        });
    }

    // Setup micelle particles
    micelleParticles.length = 0;
    for (let i = 0; i < numMicelleParticles; i++) {
        // Generate uniform spherical-like positions in 3D using golden spiral on sphere
        const phi = Math.acos(1 - 2 * (i + 0.5) / numMicelleParticles);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
        const radius = 62 + (Math.random() - 0.5) * 3; // Core micelle radius
        
        micelleParticles.push({
            // 3D coordinate in micelle state
            x3d: radius * Math.sin(phi) * Math.cos(theta),
            y3d: radius * Math.sin(phi) * Math.sin(theta),
            z3d: radius * Math.cos(phi),
            
            // 2D coordinate in monomer state (free bouncing)
            x: Math.random() * molCanvas.width,
            y: molCanvas.height * 0.45 + Math.random() * (molCanvas.height * 0.5),
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            
            // Random phase for thermal movement
            phase: Math.random() * Math.PI * 2,
            speed: 0.02 + Math.random() * 0.03
        });
    }

    // Setup mouse listeners
    molCanvas.addEventListener('mousemove', (e) => {
        const cRect = molCanvas.getBoundingClientRect();
        mouseX = e.clientX - cRect.left;
        mouseY = e.clientY - cRect.top;
        mouseInCanvas = true;
    });

    molCanvas.addEventListener('mouseleave', () => {
        mouseInCanvas = false;
    });

    // Slider listener setup (if not already handled)
    const slider = document.getElementById('slider-molecule-param');
    if (slider) {
        // Remove old listeners by replacing the element or just re-assigning handler
        slider.oninput = (e) => {
            const valEl = document.getElementById('val-molecule-param');
            if (valEl) {
                valEl.textContent = e.target.value + (moleculeMode === 'monolayer' ? '%' : ' mM');
            }
            updateMoleculeHUD();
        };
    }

    updateMoleculeHUD();
    
    // Start the animation loop
    if (moleculeAnimId) cancelAnimationFrame(moleculeAnimId);
    drawMoleculeViewer();
}

window.setMoleculeMode = function(mode) {
    moleculeMode = mode;
    
    // Update button active state
    document.querySelectorAll('.viewer-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.getElementById(`btn-mode-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    const controlPanel = document.getElementById('molecule-control-panel');
    const slider = document.getElementById('slider-molecule-param');
    const label = document.getElementById('label-molecule-param');
    const hud = document.getElementById('molecule-hud');
    const tooltip = document.getElementById('molecule-tooltip');
    const hint = document.getElementById('molecule-hint');

    if (mode === 'monolayer') {
        if (controlPanel) controlPanel.style.display = 'block';
        if (hud) hud.style.display = 'flex';
        if (tooltip) tooltip.style.display = 'none';
        if (slider) {
            slider.min = 0;
            slider.max = 100;
            slider.value = 0;
            if (label) label.innerHTML = `Compresión de Monocapa: <span id="val-molecule-param" class="tech-mono">0%</span>`;
        }
        if (hint) hint.textContent = "[ MUEVE EL CURSOR PARA CREAR ONDAS Y PERTURBAR LA INTERFAZ ]";
    } else if (mode === 'micelle') {
        if (controlPanel) controlPanel.style.display = 'block';
        if (hud) hud.style.display = 'flex';
        if (tooltip) tooltip.style.display = 'none';
        if (slider) {
            slider.min = 0;
            slider.max = 100;
            slider.value = 20; // Start below CMC
            if (label) label.innerHTML = `Concentración de Surfactante: <span id="val-molecule-param" class="tech-mono">20 mM</span>`;
        }
        if (hint) hint.textContent = "[ AUMENTA LA CONCENTRACIÓN DE SURFACTANTE SOBRE EL CMC (40 mM) PARA FORMAR LA MICELA ]";
    } else if (mode === 'anatomy') {
        if (controlPanel) controlPanel.style.display = 'none';
        if (hud) hud.style.display = 'none';
        if (tooltip) tooltip.style.display = 'block';
        if (hint) hint.textContent = "[ PASA EL CURSOR SOBRE LA MOLÉCULA PARA ANALIZAR SUS ZONAS HIDROFÍLICA Y HIDROFÓBICA ]";
    }
    
    updateMoleculeHUD();
};

function updateMoleculeHUD() {
    const slider = document.getElementById('slider-molecule-param');
    if (!slider) return;
    const value = parseFloat(slider.value);

    const hudGamma = document.getElementById('hud-gamma');
    const hudPi = document.getElementById('hud-pi');
    const hudTheta = document.getElementById('hud-theta');

    if (moleculeMode === 'monolayer') {
        // Compression mode: value represents packing density theta from 0% to 100%
        const theta = value / 100;
        // Surface pressure Pi (Langmuir Isotherm model approximation)
        const pi = theta >= 0.99 ? 45.5 : -15 * Math.log(1 - 0.95 * theta);
        const gamma = Math.max(25, 72.8 - pi);

        if (hudGamma) hudGamma.innerHTML = `${gamma.toFixed(1)} mN/m`;
        if (hudPi) hudPi.innerHTML = `${pi.toFixed(1)} mN/m`;
        if (hudTheta) hudTheta.innerHTML = `${theta.toFixed(2)}`;
    } else if (moleculeMode === 'micelle') {
        // Bulk concentration: value from 0 to 100 mM
        const conc = value;
        const CMC = 40; // Critical micelle concentration
        let theta = 0;
        
        if (conc > CMC) {
            // Above CMC, monomers stay constant at CMC, fraction of micellization increases
            theta = (conc - CMC) / conc;
        }

        // Fictional but physical-like tension: decreases up to CMC, then stays flat
        const gamma = Math.max(38, 72.8 - (Math.min(conc, CMC) / CMC) * 34.8);
        const pi = (conc / 100) * 30; // Equivalent osmotic pressure indicator

        if (hudGamma) hudGamma.innerHTML = `${gamma.toFixed(1)} mN/m`;
        if (hudPi) hudPi.innerHTML = `${pi.toFixed(1)} atm`;
        if (hudTheta) hudTheta.innerHTML = `${theta.toFixed(2)}`;
    }
}

function drawMoleculeViewer() {
    if (currentSlideIndex !== 2) {
        if (moleculeAnimId) cancelAnimationFrame(moleculeAnimId);
        moleculeAnimId = null;
        return;
    }

    // Dynamic resize correction
    if (molCanvas.width !== molCanvas.clientWidth || molCanvas.height !== molCanvas.clientHeight) {
        molCanvas.width = molCanvas.clientWidth;
        molCanvas.height = molCanvas.clientHeight;
        
        const step = molCanvas.width / (numWaveNodes - 1);
        waveNodes.length = 0;
        for (let i = 0; i < numWaveNodes; i++) {
            waveNodes.push({ x: i * step, y: 0, vy: 0 });
        }
        
        micelleParticles.forEach(p => {
            p.x = Math.random() * molCanvas.width;
            p.y = molCanvas.height * 0.45 + Math.random() * (molCanvas.height * 0.5);
        });
    }

    if (molCanvas.width === 0 || molCanvas.height === 0) {
        moleculeAnimId = requestAnimationFrame(drawMoleculeViewer);
        return;
    }

    const W = molCanvas.width;
    const H = molCanvas.height;
    const now = Date.now();
    
    molCtx.clearRect(0, 0, W, H);
    
    // ─── Blueprint Grid (subtle, atmospheric) ───
    const gridSpacing = 28;
    for (let x = gridSpacing; x < W; x += gridSpacing) {
        molCtx.beginPath();
        molCtx.moveTo(x, 0);
        molCtx.lineTo(x, H);
        const fade = 0.015 + Math.sin(now * 0.0003 + x * 0.01) * 0.008;
        molCtx.strokeStyle = `rgba(0, 140, 255, ${fade})`;
        molCtx.lineWidth = 0.5;
        molCtx.stroke();
    }
    for (let y = gridSpacing; y < H; y += gridSpacing) {
        molCtx.beginPath();
        molCtx.moveTo(0, y);
        molCtx.lineTo(W, y);
        const fade = 0.015 + Math.cos(now * 0.0004 + y * 0.01) * 0.008;
        molCtx.strokeStyle = `rgba(0, 140, 255, ${fade})`;
        molCtx.lineWidth = 0.5;
        molCtx.stroke();
    }

    if (moleculeMode === 'monolayer') {
        const midY = H * 0.42;
        
        // ═══ WAVE PHYSICS (enhanced) ═══
        const waveTension = 0.025;
        const waveRestoration = 0.012;
        const waveDamping = 0.04;

        for (let i = 1; i < numWaveNodes - 1; i++) {
            const node = waveNodes[i];
            const left = waveNodes[i - 1];
            const right = waveNodes[i + 1];
            
            const accel = (left.y + right.y - 2 * node.y) * waveTension 
                        - node.y * waveRestoration 
                        - node.vy * waveDamping;
            node.vy += accel;
            // Add subtle ambient wave motion
            node.vy += Math.sin(now * 0.002 + i * 0.8) * 0.012;
            node.y += node.vy;

            // Mouse ripples (stronger, wider area)
            if (mouseInCanvas) {
                const dx = mouseX - node.x;
                const dy = mouseY - (midY + node.y);
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 80) {
                    const force = (1 - dist / 80) * 2.5;
                    node.vy += (mouseY - (midY + node.y)) * force * 0.06;
                }
            }
        }
        
        waveNodes[0].y = waveNodes[1].y * 0.85;
        waveNodes[numWaveNodes - 1].y = waveNodes[numWaveNodes - 2].y * 0.85;

        // ═══ AIR PHASE (atmospheric gradient) ═══
        const airGrad = molCtx.createLinearGradient(0, 0, 0, midY);
        airGrad.addColorStop(0, 'rgba(8, 12, 22, 0.95)');
        airGrad.addColorStop(0.7, 'rgba(6, 10, 18, 0.6)');
        airGrad.addColorStop(1, 'rgba(10, 15, 30, 0.0)');
        molCtx.fillStyle = airGrad;
        molCtx.fillRect(0, 0, W, midY + 10);

        // ═══ WATER BODY (rich, deep ocean gradient) ═══
        molCtx.beginPath();
        molCtx.moveTo(0, H);
        molCtx.lineTo(0, midY + waveNodes[0].y);
        for (let i = 1; i < numWaveNodes; i++) {
            const curr = waveNodes[i];
            const prev = waveNodes[i - 1];
            const cpx = (prev.x + curr.x) / 2;
            const cpy = midY + (prev.y + curr.y) / 2;
            molCtx.quadraticCurveTo(prev.x, midY + prev.y, cpx, cpy);
        }
        molCtx.lineTo(waveNodes[numWaveNodes-1].x, midY + waveNodes[numWaveNodes-1].y);
        molCtx.lineTo(W, H);
        molCtx.closePath();

        const waterGrad = molCtx.createLinearGradient(0, midY, 0, H);
        waterGrad.addColorStop(0, 'rgba(0, 80, 180, 0.25)');
        waterGrad.addColorStop(0.15, 'rgba(0, 60, 160, 0.30)');
        waterGrad.addColorStop(0.4, 'rgba(0, 40, 120, 0.35)');
        waterGrad.addColorStop(0.7, 'rgba(0, 20, 80, 0.45)');
        waterGrad.addColorStop(1, 'rgba(0, 10, 50, 0.55)');
        molCtx.fillStyle = waterGrad;
        molCtx.fill();

        // ═══ UNDERWATER CAUSTICS (light shafts) ═══
        for (let i = 0; i < 6; i++) {
            const cx = (W * 0.12) + (i * W * 0.15) + Math.sin(now * 0.0006 + i * 2.1) * 20;
            const shaftW = 12 + Math.sin(now * 0.0008 + i) * 5;
            const shaftAlpha = 0.02 + Math.sin(now * 0.001 + i * 1.7) * 0.012;
            
            const shaftGrad = molCtx.createLinearGradient(cx, midY + 5, cx + shaftW, H);
            shaftGrad.addColorStop(0, `rgba(80, 180, 255, ${shaftAlpha * 2})`);
            shaftGrad.addColorStop(0.5, `rgba(40, 120, 220, ${shaftAlpha})`);
            shaftGrad.addColorStop(1, 'rgba(0, 40, 120, 0)');
            
            molCtx.fillStyle = shaftGrad;
            molCtx.beginPath();
            molCtx.moveTo(cx, midY + 5);
            molCtx.lineTo(cx + shaftW + 15, H);
            molCtx.lineTo(cx - 8, H);
            molCtx.closePath();
            molCtx.fill();
        }

        // ═══ WATER MOLECULES (many, varied, alive) ═══
        const numWaterMols = 45;
        for (let i = 0; i < numWaterMols; i++) {
            const t = now * 0.0005;
            const baseX = (i * 37.7 + t * 18 + Math.sin(i * 3.7) * 40) % W;
            const depth = ((i * 23.3) % (H - midY - 30));
            const nodeIdx = Math.min(numWaveNodes - 1, Math.floor((baseX / W) * (numWaveNodes - 1)));
            const baseWaveY = waveNodes[nodeIdx] ? waveNodes[nodeIdx].y : 0;
            const baseY = midY + baseWaveY + 18 + depth;
            
            const wobbleX = Math.sin(t * 4.5 + i * 1.3) * 3;
            const wobbleY = Math.cos(t * 3.2 + i * 0.9) * 2;
            const wx = baseX + wobbleX;
            const wy = baseY + wobbleY;
            
            if (wy < midY + baseWaveY + 5) continue;
            
            // Depth-based brightness (deeper = dimmer)
            const depthRatio = depth / (H - midY - 30);
            const alpha = 0.15 + (1 - depthRatio) * 0.25;
            const size = 1.0 + (1 - depthRatio) * 1.5;
            
            // Draw O-H-H water molecule pattern
            const molAngle = t * 2.0 + i * 0.7;
            const ox = wx;
            const oy = wy;
            
            // Oxygen (blue sphere)
            molCtx.beginPath();
            molCtx.arc(ox, oy, size, 0, Math.PI * 2);
            molCtx.fillStyle = `rgba(60, 160, 255, ${alpha})`;
            molCtx.fill();
            
            // Two hydrogen arms (subtle)
            if (size > 1.5) {
                const h1x = ox + Math.cos(molAngle) * size * 2.2;
                const h1y = oy + Math.sin(molAngle) * size * 2.2;
                const h2x = ox + Math.cos(molAngle + 1.9) * size * 2.2;
                const h2y = oy + Math.sin(molAngle + 1.9) * size * 2.2;
                
                molCtx.strokeStyle = `rgba(100, 180, 255, ${alpha * 0.3})`;
                molCtx.lineWidth = 0.6;
                molCtx.beginPath();
                molCtx.moveTo(ox, oy); molCtx.lineTo(h1x, h1y);
                molCtx.moveTo(ox, oy); molCtx.lineTo(h2x, h2y);
                molCtx.stroke();
                
                molCtx.beginPath();
                molCtx.arc(h1x, h1y, size * 0.55, 0, Math.PI * 2);
                molCtx.arc(h2x, h2y, size * 0.55, 0, Math.PI * 2);
                molCtx.fillStyle = `rgba(180, 220, 255, ${alpha * 0.6})`;
                molCtx.fill();
            }
        }

        // ═══ RISING BUBBLES ═══
        for (let i = 0; i < 8; i++) {
            const bx = (i * 67 + 30) % W;
            const cycleT = (now * 0.0003 + i * 0.35) % 1.0;
            const by = H - cycleT * (H - midY - 10);
            const bRadius = 1.5 + Math.sin(i * 2.3) * 0.8;
            const bAlpha = (1 - cycleT) * 0.18;
            
            if (by > midY + 15 && bAlpha > 0.01) {
                molCtx.beginPath();
                molCtx.arc(bx + Math.sin(now * 0.003 + i) * 4, by, bRadius, 0, Math.PI * 2);
                molCtx.strokeStyle = `rgba(120, 200, 255, ${bAlpha})`;
                molCtx.lineWidth = 0.8;
                molCtx.stroke();
                
                // Highlight
                molCtx.beginPath();
                molCtx.arc(bx + Math.sin(now * 0.003 + i) * 4 - bRadius * 0.3, by - bRadius * 0.3, bRadius * 0.3, 0, Math.PI * 2);
                molCtx.fillStyle = `rgba(200, 230, 255, ${bAlpha * 0.5})`;
                molCtx.fill();
            }
        }

        // ═══ WAVE INTERFACE (glowing, multi-layer) ═══
        // Outer glow
        molCtx.beginPath();
        molCtx.moveTo(0, midY + waveNodes[0].y);
        for (let i = 1; i < numWaveNodes; i++) {
            const curr = waveNodes[i];
            const prev = waveNodes[i - 1];
            const cpx = (prev.x + curr.x) / 2;
            const cpy = midY + (prev.y + curr.y) / 2;
            molCtx.quadraticCurveTo(prev.x, midY + prev.y, cpx, cpy);
        }
        molCtx.strokeStyle = 'rgba(255, 100, 30, 0.12)';
        molCtx.lineWidth = 6;
        molCtx.stroke();

        // Mid glow
        molCtx.beginPath();
        molCtx.moveTo(0, midY + waveNodes[0].y);
        for (let i = 1; i < numWaveNodes; i++) {
            const curr = waveNodes[i];
            const prev = waveNodes[i - 1];
            const cpx = (prev.x + curr.x) / 2;
            const cpy = midY + (prev.y + curr.y) / 2;
            molCtx.quadraticCurveTo(prev.x, midY + prev.y, cpx, cpy);
        }
        molCtx.strokeStyle = 'rgba(255, 85, 0, 0.3)';
        molCtx.lineWidth = 3;
        molCtx.stroke();

        // Core bright line
        molCtx.beginPath();
        molCtx.moveTo(0, midY + waveNodes[0].y);
        for (let i = 1; i < numWaveNodes; i++) {
            const curr = waveNodes[i];
            const prev = waveNodes[i - 1];
            const cpx = (prev.x + curr.x) / 2;
            const cpy = midY + (prev.y + curr.y) / 2;
            molCtx.quadraticCurveTo(prev.x, midY + prev.y, cpx, cpy);
        }
        molCtx.strokeStyle = '#ff6622';
        molCtx.lineWidth = 1.6;
        molCtx.stroke();

        // Shimmer dots along the interface
        for (let i = 0; i < numWaveNodes; i += 2) {
            const shimmer = Math.sin(now * 0.004 + i * 0.7) * 0.5 + 0.5;
            if (shimmer > 0.6) {
                molCtx.beginPath();
                molCtx.arc(waveNodes[i].x, midY + waveNodes[i].y, 1.5 * shimmer, 0, Math.PI * 2);
                molCtx.fillStyle = `rgba(255, 180, 80, ${shimmer * 0.5})`;
                molCtx.fill();
            }
        }

        // ═══ PHASE LABELS (enhanced) ═══
        molCtx.fillStyle = 'rgba(100, 140, 180, 0.45)';
        molCtx.font = '9px "JetBrains Mono", monospace';
        molCtx.textAlign = 'left';
        molCtx.fillText('FASE_01: AIRE_SECO (APOLAR)', 15, 20);
        
        molCtx.fillStyle = 'rgba(60, 140, 220, 0.45)';
        molCtx.fillText('FASE_02: AGUA_LÍQUIDA (POLAR)', 15, H - 14);

        // ═══ SURFACTANT MOLECULES (vibrant, glowing) ═══
        const slider = document.getElementById('slider-molecule-param');
        const compressionVal = slider ? parseFloat(slider.value) : 0;
        
        const minMolecules = 5;
        const maxMolecules = 26;
        const numMolecules = Math.round(minMolecules + (compressionVal / 100) * (maxMolecules - minMolecules));

        for (let i = 0; i < numMolecules; i++) {
            const pct = (i + 0.5) / numMolecules;
            const x = pct * W;
            
            const nodeIdx = Math.floor(pct * (numWaveNodes - 1));
            const nodeA = waveNodes[nodeIdx];
            const nodeB = waveNodes[Math.min(numWaveNodes - 1, nodeIdx + 1)];
            const nodePct = (pct * (numWaveNodes - 1)) - nodeIdx;
            const waveY = nodeA.y + (nodeB.y - nodeA.y) * nodePct;

            const headX = x;
            const headY = midY + waveY + 4;

            const slope = (nodeB.y - nodeA.y) / ((nodeB.x - nodeA.x) || 1);
            const normalAngle = Math.atan2(1, -slope) - Math.PI / 2;
            
            const thermalWiggle = Math.sin(now * 0.003 + i * 1.2) * (1.0 - compressionVal / 100) * 0.45;
            const angle = -Math.PI / 2 + normalAngle + thermalWiggle;

            const tailLen = 30;
            const tailX = headX + Math.cos(angle) * tailLen;
            const tailY = headY + Math.sin(angle) * tailLen;

            // Tail (Alkyl Chain with zig-zag)
            molCtx.beginPath();
            molCtx.moveTo(headX, headY);
            
            const segments = 6;
            for (let j = 1; j <= segments; j++) {
                const t = j / segments;
                const bx = headX + (tailX - headX) * t;
                const by = headY + (tailY - headY) * t;
                
                const px = -Math.sin(angle);
                const py = Math.cos(angle);
                const wiggleScale = (1.0 - compressionVal / 100) * 2.2 + 1.0;
                const zigOffset = (j % 2 === 0 ? 1 : -1) * wiggleScale * (1 - t * 0.2);
                molCtx.lineTo(bx + px * zigOffset, by + py * zigOffset);
            }
            molCtx.strokeStyle = 'rgba(160, 170, 190, 0.75)';
            molCtx.lineWidth = 1.8;
            molCtx.stroke();

            // Head outer glow
            molCtx.beginPath();
            molCtx.arc(headX, headY, 10, 0, Math.PI * 2);
            molCtx.fillStyle = 'rgba(255, 85, 0, 0.08)';
            molCtx.fill();

            // Head (Hydrophilic Polar Group) — brighter, bigger
            molCtx.beginPath();
            molCtx.arc(headX, headY, 6.5, 0, Math.PI * 2);
            
            const hGrad = molCtx.createRadialGradient(headX - 1.5, headY - 1.5, 0.5, headX, headY, 6.5);
            hGrad.addColorStop(0, '#ffcc88');
            hGrad.addColorStop(0.5, '#ff7722');
            hGrad.addColorStop(1, '#cc3300');
            
            molCtx.fillStyle = hGrad;
            molCtx.shadowColor = '#ff5500';
            molCtx.shadowBlur = 8;
            molCtx.fill();
            molCtx.shadowBlur = 0;
            
            // Hydration shell ring
            molCtx.beginPath();
            molCtx.arc(headX, headY, 10.5, 0, Math.PI * 2);
            const shellAlpha = 0.08 + Math.sin(now * 0.004 + i * 0.9) * 0.04;
            molCtx.strokeStyle = `rgba(80, 180, 255, ${shellAlpha})`;
            molCtx.lineWidth = 0.8;
            molCtx.stroke();
        }

        // ═══ MOUSE CURSOR RIPPLE (visual feedback) ═══
        if (mouseInCanvas && mouseY > midY - 30 && mouseY < midY + 50) {
            const rippleR = 20 + Math.sin(now * 0.008) * 6;
            molCtx.beginPath();
            molCtx.arc(mouseX, mouseY, rippleR, 0, Math.PI * 2);
            molCtx.strokeStyle = 'rgba(255, 120, 50, 0.15)';
            molCtx.lineWidth = 1;
            molCtx.setLineDash([3, 4]);
            molCtx.stroke();
            molCtx.setLineDash([]);
        }

    } else if (moleculeMode === 'micelle') {
        const centerX = W / 2;
        const centerY = H / 2 + 10;
        
        const slider = document.getElementById('slider-molecule-param');
        const conc = slider ? parseFloat(slider.value) : 20;
        const CMC = 40;

        micelleRotY += 0.0035;
        micelleRotX += 0.0015;
        
        if (mouseInCanvas) {
            micelleRotY += (mouseX - centerX) * 0.00004;
            micelleRotX += (mouseY - centerY) * 0.00004;
        }

        let numInMicelle = 0;
        if (conc > CMC) {
            const pct = (conc - CMC) / (100 - CMC);
            numInMicelle = Math.min(numMicelleParticles, Math.round(pct * numMicelleParticles));
        }

        // Ambient water background for micelle mode
        const waterBgGrad = molCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, W * 0.5);
        waterBgGrad.addColorStop(0, 'rgba(0, 40, 100, 0.08)');
        waterBgGrad.addColorStop(1, 'rgba(0, 15, 40, 0.15)');
        molCtx.fillStyle = waterBgGrad;
        molCtx.fillRect(0, 0, W, H);

        // Free monomers
        for (let i = numInMicelle; i < numMicelleParticles; i++) {
            const p = micelleParticles[i];
            
            p.x += p.vx + Math.sin(now * p.speed + p.phase) * 0.25;
            p.y += p.vy + Math.cos(now * p.speed + p.phase) * 0.25;
            
            if (p.x < 12 || p.x > W - 12) p.vx *= -1;
            if (p.y < 12 || p.y > H - 12) p.vy *= -1;
            
            p.x = Math.max(12, Math.min(W - 12, p.x));
            p.y = Math.max(12, Math.min(H - 12, p.y));

            const angle = now * 0.0008 * (p.vx > 0 ? 1 : -1) + p.phase;
            const headX = p.x;
            const headY = p.y;
            const tailX = headX + Math.cos(angle) * 16;
            const tailY = headY + Math.sin(angle) * 16;

            molCtx.beginPath();
            molCtx.moveTo(headX, headY);
            molCtx.lineTo(tailX, tailY);
            molCtx.strokeStyle = 'rgba(160, 170, 185, 0.45)';
            molCtx.lineWidth = 1.2;
            molCtx.stroke();

            molCtx.beginPath();
            molCtx.arc(headX, headY, 3.8, 0, Math.PI * 2);
            const mGrad = molCtx.createRadialGradient(headX - 0.8, headY - 0.8, 0.3, headX, headY, 3.8);
            mGrad.addColorStop(0, '#ffaa55');
            mGrad.addColorStop(1, '#cc4400');
            molCtx.fillStyle = mGrad;
            molCtx.fill();
        }

        // Assembled micelle with glow
        const assembledArray = [];
        for (let i = 0; i < numInMicelle; i++) {
            const p = micelleParticles[i];
            let x1 = p.x3d * Math.cos(micelleRotY) - p.z3d * Math.sin(micelleRotY);
            let z1 = p.x3d * Math.sin(micelleRotY) + p.z3d * Math.cos(micelleRotY);
            let y2 = p.y3d * Math.cos(micelleRotX) - z1 * Math.sin(micelleRotX);
            let z2 = p.y3d * Math.sin(micelleRotX) + z1 * Math.cos(micelleRotX);

            assembledArray.push({ x: centerX + x1, y: centerY + y2, z: z2 });
        }

        // Micelle core glow
        if (numInMicelle > 5) {
            const glowGrad = molCtx.createRadialGradient(centerX, centerY, 5, centerX, centerY, 55);
            glowGrad.addColorStop(0, 'rgba(255, 85, 0, 0.06)');
            glowGrad.addColorStop(0.5, 'rgba(255, 60, 0, 0.03)');
            glowGrad.addColorStop(1, 'rgba(255, 40, 0, 0)');
            molCtx.fillStyle = glowGrad;
            molCtx.beginPath();
            molCtx.arc(centerX, centerY, 55, 0, Math.PI * 2);
            molCtx.fill();
        }

        assembledArray.sort((a, b) => a.z - b.z);

        assembledArray.forEach(p => {
            const angle = Math.atan2(centerY - p.y, centerX - p.x);
            const depthFactor = (p.z + 75) / 150;
            const sizeScale = 0.5 + depthFactor * 0.7;
            
            const headX = p.x;
            const headY = p.y;
            
            const tailLen = 22 * sizeScale;
            const tailX = headX + Math.cos(angle) * tailLen;
            const tailY = headY + Math.sin(angle) * tailLen;

            molCtx.beginPath();
            molCtx.moveTo(headX, headY);
            molCtx.lineTo(tailX, tailY);
            molCtx.strokeStyle = `rgba(160, 170, 190, ${0.15 + depthFactor * 0.55})`;
            molCtx.lineWidth = 1.0 * sizeScale;
            molCtx.stroke();

            const rHead = 5.5 * sizeScale;
            molCtx.beginPath();
            molCtx.arc(headX, headY, rHead, 0, Math.PI * 2);
            
            const hGrad = molCtx.createRadialGradient(headX - 1.0 * sizeScale, headY - 1.0 * sizeScale, 0.4, headX, headY, rHead);
            if (p.z > 0) {
                hGrad.addColorStop(0, '#ffcc88');
                hGrad.addColorStop(0.7, '#ff6622');
                hGrad.addColorStop(1, '#b33c00');
            } else {
                hGrad.addColorStop(0, '#cc5500');
                hGrad.addColorStop(1, '#662200');
            }
            
            molCtx.fillStyle = hGrad;
            if (p.z > 20) {
                molCtx.shadowColor = 'rgba(255, 85, 0, 0.3)';
                molCtx.shadowBlur = 6;
            }
            molCtx.fill();
            molCtx.shadowBlur = 0;
        });

        if (numInMicelle > 5) {
            molCtx.fillStyle = 'rgba(120, 140, 170, 0.3)';
            molCtx.font = '9px "JetBrains Mono", monospace';
            molCtx.textAlign = 'center';
            molCtx.fillText('NÚCLEO_HIDRÓFOBO', centerX, centerY - 3);
            molCtx.fillText(`N_agg = ${numInMicelle}`, centerX, centerY + 9);
        }

    } else if (moleculeMode === 'anatomy') {
        const centerX = W / 2;
        const centerY = H / 2 + 10;

        const driftX = Math.sin(now * 0.0015) * 5;
        const driftY = Math.cos(now * 0.001) * 3.5;

        const hX = centerX - 80 + driftX;
        const hY = centerY + 18 + driftY;
        const tX = centerX + 80 + driftX;
        const tY = centerY - 52 + driftY;

        const carbons = [];
        const numCarbons = 12;
        const dx = tX - hX;
        const dy = tY - hY;
        const axisLen = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / axisLen;
        const perpY = dx / axisLen;

        for (let i = 0; i < numCarbons; i++) {
            const t = i / (numCarbons - 1);
            const bx = hX + (tX - hX) * t;
            const by = hY + (tY - hY) * t;
            const zigOffset = (i % 2 === 0 ? 1 : -1) * 9.5;
            carbons.push({ x: bx + perpX * zigOffset, y: by + perpY * zigOffset });
        }

        const distToHead = Math.sqrt((mouseX - hX) ** 2 + (mouseY - hY) ** 2);
        let distToTail = 999;
        carbons.forEach(c => {
            const d = Math.sqrt((mouseX - c.x) ** 2 + (mouseY - c.y) ** 2);
            if (d < distToTail) distToTail = d;
        });

        const isHoverHead = distToHead < 48;
        const isHoverTail = !isHoverHead && distToTail < 25;

        // Ambient glow around the whole molecule
        const ambGrad = molCtx.createRadialGradient(centerX, centerY, 20, centerX, centerY, 160);
        ambGrad.addColorStop(0, 'rgba(0, 80, 160, 0.04)');
        ambGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        molCtx.fillStyle = ambGrad;
        molCtx.fillRect(0, 0, W, H);

        // Hydration shell (pulsating)
        const pulse = Math.sin(now * 0.005) * 3;
        molCtx.setLineDash([3, 5]);
        molCtx.lineWidth = 1;
        
        if (isHoverHead) {
            molCtx.strokeStyle = 'rgba(0, 160, 255, 0.45)';
            molCtx.fillStyle = 'rgba(0, 160, 255, 0.04)';
            molCtx.beginPath();
            molCtx.arc(hX, hY, 48 + pulse, 0, Math.PI * 2);
            molCtx.fill();
            molCtx.stroke();
        } else {
            molCtx.strokeStyle = 'rgba(0, 160, 255, 0.18)';
        }

        for (let r = 34; r <= 64; r += 15) {
            molCtx.beginPath();
            molCtx.arc(hX, hY, r + pulse, 0, Math.PI * 2);
            molCtx.stroke();
        }
        molCtx.setLineDash([]);

        molCtx.fillStyle = 'rgba(60, 160, 255, 0.4)';
        molCtx.font = '8px "JetBrains Mono", monospace';
        molCtx.textAlign = 'center';
        molCtx.fillText('HYDRATION_SHELL', hX, hY - 74);

        // Tail bonds
        molCtx.beginPath();
        molCtx.moveTo(hX, hY);
        carbons.forEach(c => molCtx.lineTo(c.x, c.y));
        
        molCtx.strokeStyle = isHoverTail ? '#e8eaef' : 'rgba(120, 130, 150, 0.65)';
        molCtx.lineWidth = 3.5;
        molCtx.shadowColor = isHoverTail ? 'rgba(255,255,255,0.35)' : 'transparent';
        molCtx.shadowBlur = isHoverTail ? 10 : 0;
        molCtx.stroke();
        molCtx.shadowBlur = 0;

        // Carbon + Hydrogen atoms
        carbons.forEach((c, idx) => {
            if (idx > 0 && idx < numCarbons - 1) {
                const hDist = 13;
                const h1 = { x: c.x + perpX * hDist, y: c.y + perpY * hDist };
                const h2 = { x: c.x - perpX * hDist, y: c.y - perpY * hDist };
                
                molCtx.strokeStyle = 'rgba(160, 170, 185, 0.3)';
                molCtx.lineWidth = 1.2;
                molCtx.beginPath();
                molCtx.moveTo(c.x, c.y); molCtx.lineTo(h1.x, h1.y);
                molCtx.moveTo(c.x, c.y); molCtx.lineTo(h2.x, h2.y);
                molCtx.stroke();
                
                [h1, h2].forEach(h => {
                    molCtx.beginPath();
                    molCtx.arc(h.x, h.y, 3.5, 0, Math.PI * 2);
                    const hGrad = molCtx.createRadialGradient(h.x - 0.8, h.y - 0.8, 0.5, h.x, h.y, 3.5);
                    hGrad.addColorStop(0, '#ffffff');
                    hGrad.addColorStop(1, '#b0bbc8');
                    molCtx.fillStyle = hGrad;
                    molCtx.fill();
                });
            }

            molCtx.beginPath();
            molCtx.arc(c.x, c.y, 6.5, 0, Math.PI * 2);
            
            const cGrad = molCtx.createRadialGradient(c.x - 1.2, c.y - 1.2, 0.8, c.x, c.y, 6.5);
            if (isHoverTail) {
                cGrad.addColorStop(0, '#bcc2d0');
                cGrad.addColorStop(1, '#454a55');
            } else {
                cGrad.addColorStop(0, '#6e7580');
                cGrad.addColorStop(1, '#282c35');
            }
            molCtx.fillStyle = cGrad;
            molCtx.fill();

            molCtx.fillStyle = '#0e1014';
            molCtx.font = 'bold 7px "JetBrains Mono", monospace';
            molCtx.textAlign = 'center';
            molCtx.textBaseline = 'middle';
            molCtx.fillText('C', c.x, c.y + 0.3);
        });

        // Head (large, vivid)
        molCtx.beginPath();
        molCtx.arc(hX, hY, 22.0, 0, Math.PI * 2);
        
        molCtx.shadowColor = isHoverHead ? '#ffaa66' : '#ff5500';
        molCtx.shadowBlur = isHoverHead ? 30 : 16;
        
        const hGrad = molCtx.createRadialGradient(hX - 5, hY - 5, 2, hX, hY, 22.0);
        if (isHoverHead) {
            hGrad.addColorStop(0, '#ffe0c0');
            hGrad.addColorStop(0.4, '#ff8844');
            hGrad.addColorStop(1, '#cc2200');
        } else {
            hGrad.addColorStop(0, '#ffcc88');
            hGrad.addColorStop(0.6, '#ff6622');
            hGrad.addColorStop(1, '#992200');
        }
        molCtx.fillStyle = hGrad;
        molCtx.fill();
        molCtx.shadowBlur = 0;
        
        molCtx.fillStyle = '#ffffff';
        molCtx.font = 'bold 13px "JetBrains Mono", monospace';
        molCtx.textAlign = 'center';
        molCtx.textBaseline = 'middle';
        molCtx.fillText('−', hX - 8, hY - 5);
        molCtx.fillText('−', hX + 8, hY + 6);

        // Tail-end CH₃ label
        const lastC = carbons[numCarbons - 1];
        molCtx.fillStyle = 'rgba(160, 170, 185, 0.5)';
        molCtx.font = '8px "JetBrains Mono", monospace';
        molCtx.fillText('CH₃', lastC.x + 15, lastC.y - 5);

        const tooltip = document.getElementById('molecule-tooltip');
        if (tooltip) {
            const tTitle = tooltip.querySelector('.tooltip-title');
            const tBody = tooltip.querySelector('.tooltip-body');
            
            if (isHoverHead) {
                tTitle.textContent = "CABEZA POLAR (HIDROFÍLICA) [SO₄⁻ / COO⁻]";
                tBody.innerHTML = "Grupo iónico cargado eléctricamente. Forma fuertes interacciones dipolo-dipolo y puentes de hidrógeno con las moléculas de agua, creando una capa de hidratación energéticamente favorable que promueve su solubilidad.";
                tooltip.style.borderColor = '#ff5500';
                tooltip.style.left = 'auto';
                tooltip.style.right = '12px';
            } else if (isHoverTail) {
                tTitle.textContent = "COLA APOLAR (HIDROFÓBICA) [-CH₂-(CH₂)₁₀-CH₃]";
                tBody.innerHTML = "Cadena alifática neutra. Al carecer de carga o dipolos, es incapaz de enlazarse con el agua. El efecto hidrofóbico (reorganización entrópica del agua) la repele hacia la interfaz aire-agua o el núcleo micelar.";
                tooltip.style.borderColor = '#ff5500';
                tooltip.style.left = '12px';
                tooltip.style.right = 'auto';
            } else {
                tTitle.textContent = "ESTRUCTURA ANFIFÍLICA DETALLADA";
                tBody.innerHTML = "Pasa el cursor sobre la cabeza polar (esfera naranja brillante) o la cola apolar (cadena de carbonos y oxígenos enlazados) para analizar su termodinámica de adsorción en detalle.";
                tooltip.style.borderColor = '#1e222b';
                tooltip.style.left = 'auto';
                tooltip.style.right = '12px';
            }
        }
    }

    moleculeAnimId = requestAnimationFrame(drawMoleculeViewer);
}

// ----------------------------------------------------
// Slide 3: Literal (a) — Derivation Stepper
// ----------------------------------------------------
let currentDerivationStepIdx = 0;
const derivationSteps = [
    {
        title: "PASO 01: El Hamiltoniano del Sistema",
        latex: "\\mathcal{H}(\\{\\mathbf{p}_i, \\mathbf{q}_i\\}) = \\sum_{i=1}^{N}\\left(\\sum_{j=1}^{d}\\frac{p_{ij}^2}{2m} - \\varepsilon_d\\right)",
        narrative: `
            <p>El planteamiento inicial consiste en definir el Hamiltoniano total para un sistema de $N$ partículas libres. Dado que no existen interacciones intermoleculares en el modelo de gas ideal, la energía total del sistema se expresa como la suma directa de los hamiltonianos individuales de cada partícula:</p>
            <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; margin-top: 6px;">
                <li>Cada partícula posee energía cinética traslacional $\\sum_{j=1}^d p_{ij}^2 / 2m$ correspondiente a su movimiento en $d$ dimensiones.</li>
                <li>Al ingresar al medio de adsorción (superficie o gel), cada partícula experimenta un potencial atractivo constante $-\\varepsilon_d$.</li>
                <li>El Hamiltoniano total es la suma de las contribuciones de energía cinética y potencial de cada constituyente.</li>
            </ul>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: hamiltoniano de una sola partícula</div>
                <p style="font-size: 0.85rem; margin-bottom: 8px;">Para una partícula libre con energía cinética en $d$ dimensiones y sometida al potencial constante $-\\varepsilon_d$:</p>
                $$h_1(\\mathbf{p}, \\mathbf{q}) = \\frac{\\mathbf{p}^2}{2m} + U(\\mathbf{q}) = \\sum_{j=1}^{d}\\frac{p_{j}^2}{2m} - \\varepsilon_d$$
            </div>
        `
    },
    {
        title: "PASO 02: La Integral de Partición Canónica",
        latex: "Z(T, N, V_d) = \\frac{1}{h^{dN} N!} \\int \\prod_{i=1}^{N} d^d q_i \\, d^d p_i \\; e^{-\\beta \\mathcal{H}}",
        narrative: `
            <p>Se define la función de partición canónica $Z$ para el sistema, integrando el factor de Boltzmann sobre el espacio de fases de las $N$ partículas.</p>
            <p>Debido a la ausencia de interacciones, la integral multidimensional sobre el espacio de fases se factoriza en un producto de integrales independientes de una sola partícula:</p>
            <p>Esta propiedad simplifica el cálculo, reduciendo la integral de dimensión $dN$ a la potencia $N$-ésima de la función de partición de una sola partícula $z_1$:</p>
            <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; margin-top: 6px;">
                <li>Se incorpora el factor $1/N!$ para corregir la indistinguibilidad de las partículas de gas y evitar la paradoja de Gibbs en la entropía.</li>
                <li>El factor de escala cuántica $h^{dN}$ se divide en contribuciones $h^d$ correspondientes al volumen elemental en el espacio de fases de cada partícula.</li>
                <li>La variable $\\beta$ representa la temperatura inversa del baño térmico: $\\beta = 1/k_B T$.</li>
            </ul>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: de la integral gigante a términos de una partícula</div>
                <p style="font-size: 0.82rem; margin-bottom: 6px;">Sustituyendo el Hamiltoniano, la exponencial de la suma se convierte en el producto de exponenciales:</p>
                $$e^{-\\beta \\sum_{i=1}^N h_1(\\mathbf{p}_i, \\mathbf{q}_i)} = e^{-\\beta h_1(\\mathbf{p}_1, \\mathbf{q}_1)} \\cdots e^{-\\beta h_1(\\mathbf{p}_N, \\mathbf{q}_N)}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 6px;">Esto permite separar la integral gigante en un producto de $N$ integrales independientes:</p>
                $$Z = \\frac{1}{N!} \\left[ \\frac{1}{h^d} \\int d^d q_1 d^d p_1 e^{-\\beta h_1(\\mathbf{p}_1, \\mathbf{q}_1)} \\right] \\times \\dots \\times \\left[ \\frac{1}{h^d} \\int d^d q_N d^d p_N e^{-\\beta h_1(\\mathbf{p}_N, \\mathbf{q}_N)} \\right]$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 6px;">Como las partículas son idénticas, cada corchete es exactamente la misma integral de una partícula $z_1$:</p>
                $$Z = \\frac{(z_1)^N}{N!} \\quad \\text{donde} \\quad z_1 = \\frac{1}{h^d} \\int d^d q \\int d^d p \\, e^{-\\beta h_1(\\mathbf{p}, \\mathbf{q})}$$
            </div>
        `
    },
    {
        title: "PASO 03: Función de Partición Monoparticular",
        latex: "Z = \\frac{z_1^N}{N!}, \\qquad z_1 = e^{\\beta\\varepsilon_d} \\cdot \\frac{V_d}{\\lambda_T^d}",
        narrative: `
            <p>Para evaluar la función de partición de una sola partícula $z_1$, se desacoplan por completo las integrales espacial y de momentos debido a la uniformidad del potencial atractivo:</p>
            <p>Al integrar sobre las coordenadas de posición se obtiene el volumen accesible $V_d$, mientras que las integrales gaussianas de momentos se expresan en función de la longitud de onda térmica de De Broglie $\\lambda_T$:</p>
            <p>El término resultante $\\lambda_T = h / \\sqrt{2\\pi m k_B T}$ agrupa las propiedades cuánticas del gas a una temperatura dada.</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: resolviendo z₁ paso a paso</div>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">1. Integral espacial de coordenadas: al no haber obstáculos en el volumen $V_d$, la posición da simplemente el volumen accesible:</p>
                $$\\int d^d q = V_d$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">2. Integral de momentos en $d$ dimensiones: es el producto de $d$ integrales gaussianas unidimensionales idénticas:</p>
                $$\\int d^d p \\, e^{-\\beta \\frac{p^2}{2m}} = \\prod_{j=1}^d \\int_{-\\infty}^{\\infty} e^{-\\frac{\\beta}{2m} p_j^2} dp_j$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Usando el resultado de la integral gaussiana $\\int_{-\\infty}^{\\infty} e^{-a x^2} dx = \\sqrt{\\frac{\\pi}{a}}$ con $a = \\frac{\\beta}{2m}$:</p>
                $$\\int_{-\\infty}^{\\infty} e^{-\\frac{\\beta}{2m} p_j^2} dp_j = \\sqrt{\\frac{\\pi}{\\frac{\\beta}{2m}}} = \\sqrt{\\frac{2\\pi m}{\\beta}} = \\sqrt{2\\pi m k_B T}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Por lo tanto, al multiplicar las $d$ dimensiones, se obtiene:</p>
                $$\\int d^d p \\, e^{-\\beta \\frac{p^2}{2m}} = \\left( 2\\pi m k_B T \\right)^{d/2}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">3. Uniendo todo en $z_1$, incluyendo el factor $e^{\\beta \\varepsilon_d}$ y el normalizador $1/h^d$:</p>
                $$z_1 = \\frac{e^{\\beta\\varepsilon_d}}{h^d} V_d (2\\pi m k_B T)^{d/2} = e^{\\beta\\varepsilon_d} \\frac{V_d}{\\left(\\frac{h}{\\sqrt{2\\pi m k_B T}}\\right)^d} = e^{\\beta\\varepsilon_d} \\frac{V_d}{\\lambda_T^d}$$
            </div>
        `
    },
    {
        title: "PASO 04: Energía Libre de Helmholtz",
        latex: "F = -k_BT \\ln Z \\approx -N\\varepsilon_d + Nk_BT \\ln\\!\\left(\\frac{N\\lambda_T^d}{V_d}\\right) - Nk_BT",
        narrative: `
            <p>A partir de la función de partición canónica, se calcula la energía libre de Helmholtz mediante la relación termodinámica $F = -k_B T \\ln Z$.</p>
            <p>Sustituyendo la expresión obtenida para $Z$ y empleando la aproximación de Stirling, $\\ln N! \\approx N \\ln N - N$, se simplifica la función de estado.</p>
            <p>Esta aproximación es válida en el límite termodinámico de gran número de partículas ($N \\gg 1$), arrojando la forma definitiva para la energía libre.</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: álgebra paso a paso de Helmholtz</div>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">1. Reemplazo de Z y expansión logarítmica:</p>
                $$F = -k_B T \\ln\\left( \\frac{z_1^N}{N!} \\right) = -k_B T \\left[ N \\ln z_1 - \\ln N! \\right]$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">2. Aplicando Stirling $\\ln N! \\approx N \\ln N - N$:</p>
                $$F \\approx -k_B T \\left[ N \\ln z_1 - (N \\ln N - N) \\right] = -k_B T N \\ln z_1 + k_B T N \\ln N - k_B T N$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">3. Sustituyendo $z_1 = e^{\\beta\\varepsilon_d} \\frac{V_d}{\\lambda_T^d}$ e integrando la exponencial en el logaritmo:</p>
                $$\\ln z_1 = \\ln\\left( e^{\\beta\\varepsilon_d} \\frac{V_d}{\\lambda_T^d} \\right) = \\beta\\varepsilon_d + \\ln\\left( \\frac{V_d}{\\lambda_T^d} \\right)$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">4. Insertándolo en la expresión de F, usando que $\\beta = \\frac{1}{k_B T}$:</p>
                $$F \\approx -k_B T N \\left[ \\frac{\\varepsilon_d}{k_B T} + \\ln\\left( \\frac{V_d}{\\lambda_T^d} \\right) \\right] + k_B T N \\ln N - k_B T N$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">5. Distribuyendo y agrupando con las propiedades de los logaritmos:</p>
                $$F \\approx -N\\varepsilon_d - N k_B T \\left[ \\ln\\left(\\frac{V_d}{\\lambda_T^d}\\right) - \\ln N + 1 \\right]$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Como $\\ln\\left(\\frac{V_d}{\\lambda_T^d}\\right) - \\ln N = \\ln\\left(\\frac{V_d}{N \\lambda_T^d}\\right) = -\\ln\\left(\\frac{N \\lambda_T^d}{V_d}\\right)$, queda:</p>
                $$F \\approx -N\\varepsilon_d + Nk_BT \\ln\\!\\left(\\frac{N\\lambda_T^d}{V_d}\\right) - Nk_BT$$
            </div>
        `
    },
    {
        title: "PASO 05: Potencial Químico en d Dimensiones",
        latex: "\\mu_d = \\left.\\frac{\\partial F}{\\partial N}\\right|_{T, V_d} = -\\varepsilon_d + k_BT \\ln\\!\\left(n_d \\lambda_T^d\\right)",
        narrative: `
            <p>El potencial químico $\\mu_d$ se define formalmente como la variación de la energía libre con respecto al número de partículas a temperatura y volumen constantes: $\\mu_d = \\left.\\frac{\\partial F}{\\partial N}\\right|_{T, V_d}$.</p>
            <p>Al derivar término a término la expresión de Helmholtz, se produce la cancelación exacta de las constantes aditivas procedentes de la regla del producto y la aproximación de Stirling.</p>
            <p>Finalmente, introduciendo la densidad numérica local en $d$ dimensiones, $n_d = N / V_d$, se obtiene el potencial químico exacto del sistema.</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: derivada término a término</div>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">1. Planteo de la derivada parcial:</p>
                $$\\mu_d = \\frac{\\partial}{\\partial N} \\left[ -N\\varepsilon_d + Nk_BT \\ln\\left( \\frac{N\\lambda_T^d}{V_d} \\right) - Nk_BT \\right]$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">2. Expandiendo la derivada por linealidad:</p>
                $$\\mu_d = \\frac{\\partial}{\\partial N}(-N\\varepsilon_d) + \\frac{\\partial}{\\partial N}\\left[ Nk_BT \\ln\\left( \\frac{N\\lambda_T^d}{V_d} \\right) \\right] - \\frac{\\partial}{\\partial N}(Nk_BT)$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">3. Las derivadas fáciles y la regla del producto en el centro:</p>
                $$\\frac{\\partial}{\\partial N}(-N\\varepsilon_d) = -\\varepsilon_d \\qquad \\text{y} \\qquad \\frac{\\partial}{\\partial N}(Nk_BT) = k_BT$$
                $$\\frac{\\partial}{\\partial N} \\left[ N k_BT \\ln\\left(\\frac{N\\lambda_T^d}{V_d}\\right) \\right] = k_BT \\ln\\left(\\frac{N\\lambda_T^d}{V_d}\\right) + N k_BT \\frac{\\partial}{\\partial N}\\left[ \\ln N + \\ln\\left(\\frac{\\lambda_T^d}{V_d}\\right) \\right]$$
                $$\\text{Como la derivada del logaritmo es } 1/N: \\qquad N k_BT \\left(\\frac{1}{N}\\right) = k_BT$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">4. Reensamblando la derivada total y cancelando los términos:</p>
                $$\\mu_d = -\\varepsilon_d + k_BT \\ln\\left(\\frac{N\\lambda_T^d}{V_d}\\right) + k_BT - k_BT$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Tachando $+k_BT$ con $-k_BT$ y definiendo la densidad $n_d = N / V_d$:</p>
                $$\\mu_d = -\\varepsilon_d + k_BT \\ln\\left(n_d \\lambda_T^d\\right)$$
            </div>
        `
    }
];

function parseMathInText(text) {
    if (!text) return "";
    // Replace double dollars $$...$$ with display-mode KaTeX
    let parsedExplanation = text.replace(/\$\$(.+?)\$\$/gs, (match, formula) => {
        const div = document.createElement('div');
        div.className = 'math-block-inside';
        div.style.margin = '8px 0';
        div.style.padding = '8px';
        katex.render(formula.trim(), div, { displayMode: true, throwOnError: false });
        return div.outerHTML;
    });
    
    // Replace single dollars $...$ with inline-mode KaTeX
    parsedExplanation = parsedExplanation.replace(/\$([^\$]+)\$/g, (match, formula) => {
        const span = document.createElement('span');
        katex.render(formula.trim(), span, { displayMode: false, throwOnError: false });
        return span.outerHTML;
    });
    
    return parsedExplanation;
}

let currentScratchpadHTML = '';

window.toggleBorrador = function(slideKey) {
    const modal = document.getElementById('borrador-modal');
    const modalBody = document.getElementById('borrador-modal-body');
    const btnId = 'panic-btn-' + slideKey;
    const btn = document.getElementById(btnId);
    
    if (modal && modalBody) {
        modalBody.innerHTML = currentScratchpadHTML;
        modal.classList.add('active');
        
        // Render math in the modal
        if (typeof renderMathInElement === 'function') {
            renderMathInElement(modalBody, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false}
                ],
                throwOnError: false
            });
        }
    }
    
    if (btn) {
        btn.classList.add('panic-active');
    }
};

window.closeBorradorModal = function() {
    const modal = document.getElementById('borrador-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    
    // Remove active class from all skull buttons
    ['panic-btn-a', 'panic-btn-b', 'panic-btn-c'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.remove('panic-active');
        }
    });
};

function updateDerivationStep() {
    const step = derivationSteps[currentDerivationStepIdx];
    
    // Reset panic button and close modal
    if (typeof closeBorradorModal === 'function') {
        closeBorradorModal();
    }
    
    // Set titles
    document.getElementById('step-title').textContent = step.title;
    
    // Parse math in narrative and scratchpad strings
    const parsedNarrative = parseMathInText(step.narrative);
    const parsedScratchpad = parseMathInText(step.scratchpad);
    
    // Save to current modal content variable
    currentScratchpadHTML = parsedScratchpad;
    
    // Set left column narrative text
    const narrativeEl = document.getElementById('step-narrative');
    if (narrativeEl) {
        narrativeEl.innerHTML = parsedNarrative;
    }
    
    // Set right column explanation text
    const contentEl = document.getElementById('step-content');
    if (contentEl) {
        contentEl.innerHTML = `
            <div class="latex-math" id="step-math-render" style="margin-bottom: 12px; padding: 10px;"></div>
        `;
    }
    
    // Render latex in the step and in the main slide title
    renderLatex('step-math-render', step.latex);
    renderLatex('equation-main', "\\mu_d = -\\varepsilon_d + k_BT \\ln\\!\\left(n_d \\lambda_T^d\\right)");
    
    // Enable/disable buttons
    document.getElementById('prev-step-btn').disabled = currentDerivationStepIdx === 0;
    document.getElementById('next-step-btn').disabled = currentDerivationStepIdx === derivationSteps.length - 1;
    
    document.getElementById('step-indicator').textContent = `PASO ${currentDerivationStepIdx + 1} / ${derivationSteps.length}`;
}

function nextDerivationStep() {
    if (currentDerivationStepIdx < derivationSteps.length - 1) {
        currentDerivationStepIdx++;
        updateDerivationStep();
    }
}

function prevDerivationStep() {
    if (currentDerivationStepIdx > 0) {
        currentDerivationStepIdx--;
        updateDerivationStep();
    }
}

// ----------------------------------------------------
// Slide 6: Literal (b) — Derivation Stepper
// ----------------------------------------------------
let currentDerivationStepIdxB = 0;
const derivationStepsB = [
    {
        title: "PASO 01: Condición de Equilibrio de Fases",
        latex: "\\mu_{\\text{sol}} = \\mu_{\\text{sup}}",
        narrative: `
            <p>El estudio de la adsorción de surfactantes en la interfaz requiere modelar la coexistencia entre el seno de la solución (fase 3D) y la capa superficial (fase 2D). En equilibrio termodinámico, existe libre intercambio de moléculas.</p>
            <p>La condición fundamental de equilibrio de fases establece la igualdad de potenciales químicos entre la fase volumétrica y la fase adsorbida en la superficie, anulando cualquier flujo neto de materia:</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: potencial químico en equilibrio</div>
                $$\\mu_{\\text{sol}}(3\\text{D}) = \\mu_{\\text{sup}}(2\\text{D})$$
                $$\\mu_3 = \\mu_2$$
            </div>
        `
    },
    {
        title: "PASO 02: Igualación de Potenciales Químicos",
        latex: "k_BT\\ln(n\\,\\lambda_T^3) = -\\varepsilon_0 + k_BT\\ln(n_2\\,\\lambda_T^2)",
        narrative: `
            <p>Se aplica la expresión general para $\\mu_d$ deducida en el literal (a), adaptando las condiciones específicas de contorno para cada una de las fases:</p>
            <ul>
                <li>Para el seno de la solución (3D): la dimensionalidad es $d=3$, la densidad es $n_3 = n$, y el potencial de referencia es nulo ($\\varepsilon_3 = 0$).</li>
                <li>Para la superficie (2D): la dimensionalidad es $d=2$, la densidad es $n_2$, y existe un potencial atractivo de adsorción de valor $\\varepsilon_2 = \\varepsilon_0$.</li>
            </ul>
            <p>Igualando ambos términos se obtiene la ecuación rectora del equilibrio:</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: planteando la igualdad</div>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">Fórmula del literal (a): $\\mu_d = -\\varepsilon_d + k_BT\\ln(n_d\\lambda_T^d)$</p>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">En volumen (3D): $\\mu_3 = k_BT\\ln(n\\lambda_T^3)$</p>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">En superficie (2D): $\\mu_2 = -\\varepsilon_0 + k_BT\\ln(n_2\\lambda_T^2)$</p>
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Igualando $\\mu_3 = \\mu_2$:</p>
                $$k_BT\\ln(n\\,\\lambda_T^3) = -\\varepsilon_0 + k_BT\\ln(n_2\\,\\lambda_T^2)$$
            </div>
        `
    },
    {
        title: "PASO 03: Resolución de la Densidad Superficial",
        latex: "n_2 = n\\,\\lambda_T\\, e^{\\varepsilon_0/k_BT}",
        narrative: `
            <p>Para despejar la densidad superficial $n_2$, se dividen ambos lados de la ecuación por la energía térmica $k_B T$ y se agrupan los términos logarítmicos.</p>
            <p>Posteriormente, aplicando la función exponencial para remover el operador logarítmico, se simplifica el cociente de densidades y longitudes de onda térmicas:</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: despejando paso a paso</div>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">1. Divido todo por $k_BT$:</p>
                $$\\ln(n\\lambda_T^3) = -\\frac{\\varepsilon_0}{k_BT} + \\ln(n_2\\lambda_T^2)$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">2. Agrupo logaritmos restando:</p>
                $$\\ln(n\\lambda_T^3) - \\ln(n_2\\lambda_T^2) = -\\frac{\\varepsilon_0}{k_BT}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">3. Propiedad de cociente de logaritmos $\\ln(A/B)$:</p>
                $$\\ln\\left( \\frac{n\\lambda_T^3}{n_2\\lambda_T^2} \\right) = -\\frac{\\varepsilon_0}{k_BT}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">4. Aplico exponencial e^x en ambos lados:</p>
                $$\\frac{n\\lambda_T^3}{n_2\\lambda_T^2} = e^{-\\frac{\\varepsilon_0}{k_BT}} \\implies \\frac{n\\lambda_T}{n_2} = e^{-\\frac{\\varepsilon_0}{k_BT}}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">5. Despejando $n_2$ (paso el término exponencial al otro lado):</p>
                $$n_2 = n\\lambda_T e^{\\frac{\\varepsilon_0}{k_BT}}$$
            </div>
        `
    },
    {
        title: "PASO 04: Análisis Termodinámico y Competencia Fases",
        latex: "n_2 = n\\,\\lambda_T\\, e^{\\varepsilon_0/k_BT}",
        narrative: `
            <p>La relación final describe la coexistencia a través de la competencia de dos mecanismos termodinámicos fundamentales:</p>
            <ul>
                <li><strong>Afinidad energética:</strong> El factor de Boltzmann $e^{\\varepsilon_0/k_BT}$ promueve el confinamiento y ordenamiento de las moléculas en el plano interfacial.</li>
                <li><strong>Dispersion entrópica:</strong> El decrecimiento de la longitud térmica $\\lambda_T \\propto T^{-1/2}$ a altas temperaturas reduce la afinidad relativa de adsorción, favoreciendo la dispersión en volumen (3D) por agitación térmica.</li>
            </ul>
            <p>Esta isoterma representa un modelo elemental para la adsorción física en interfaces ideales.</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: límites físicos</div>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">Escribiendo la relación de adsorción relativa:</p>
                $$\\frac{n_2}{n} = \\lambda_T e^{\\frac{\\varepsilon_0}{k_BT}} = \\frac{h}{\\sqrt{2\\pi m k_B T}} e^{\\frac{\\varepsilon_0}{k_BT}}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Comportamiento límites:</p>
                <ul>
                    <li>Si $T \\to 0$: el término exponencial domina y $n_2/n \\to \\infty$ (adsorción total).</li>
                    <li>Si $T \\to \\infty$: la agitación térmica y la entropía traslacional disuelven la monocapa superficial ($n_2/n \\to 0$).</li>
                </ul>
            </div>
        `
    }
];

function updateDerivationStepB() {
    const step = derivationStepsB[currentDerivationStepIdxB];
    
    // Reset panic button and close modal
    if (typeof closeBorradorModal === 'function') {
        closeBorradorModal();
    }
    
    // Set titles
    document.getElementById('step-title-b').textContent = step.title;
    
    // Parse math in narrative and scratchpad strings
    const parsedNarrative = parseMathInText(step.narrative);
    const parsedScratchpad = parseMathInText(step.scratchpad);
    
    // Save to current modal content variable
    currentScratchpadHTML = parsedScratchpad;
    
    // Set left column narrative text
    const narrativeEl = document.getElementById('step-narrative-b');
    if (narrativeEl) {
        narrativeEl.innerHTML = parsedNarrative;
    }
    
    // Set right column explanation text
    const contentEl = document.getElementById('step-content-b');
    if (contentEl) {
        contentEl.innerHTML = `
            <div class="latex-math" id="step-math-render-b" style="margin-bottom: 12px; padding: 10px;"></div>
        `;
    }
    
    // Render latex in the step and in the main slide title
    renderLatex('step-math-render-b', step.latex);
    renderLatex('equation-main-b', "n_2 = n\\,\\lambda_T\\, e^{\\varepsilon_0/k_BT}");
    
    // Enable/disable buttons
    document.getElementById('prev-step-btn-b').disabled = currentDerivationStepIdxB === 0;
    document.getElementById('next-step-btn-b').disabled = currentDerivationStepIdxB === derivationStepsB.length - 1;
    
    document.getElementById('step-indicator-b').textContent = `PASO ${currentDerivationStepIdxB + 1} / ${derivationStepsB.length}`;
}

function nextDerivationStepB() {
    if (currentDerivationStepIdxB < derivationStepsB.length - 1) {
        currentDerivationStepIdxB++;
        updateDerivationStepB();
    }
}

function prevDerivationStepB() {
    if (currentDerivationStepIdxB > 0) {
        currentDerivationStepIdxB--;
        updateDerivationStepB();
    }
}

// ----------------------------------------------------
// Slide 8: Literal (c) — Derivation Stepper
// ----------------------------------------------------
let currentDerivationStepIdxC = 0;
const derivationStepsC = [
    {
        title: "PASO 01: Densidad de Adsorción en Medios de Distinta Dimensión",
        latex: "n_d = n\\,\\lambda_T^{3-d}\\cdot e^{\\varepsilon_d/k_BT}",
        narrative: `
            <p>El literal (c) propone verificar si es posible caracterizar experimentalmente la dimensión fractal $d_f$ de un gel poroso.</p>
            <p>En primer lugar, se establece la expresión para la densidad de partículas adsorbidas en sustratos de dimensiones arbitrarias, contrastando dos sistemas físicos:</p>
            <ul>
                <li>El gel poroso, caracterizado por una geometría de dimensión fractal $d_f$ y energía de adsorción efectiva $\\varepsilon_f$.</li>
                <li>Cadenas poliméricas lineales no interconectadas, correspondientes a una geometría unidimensional ($d=1$) y energía $\\varepsilon_1$.</li>
            </ul>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: planteando las densidades</div>
                <p style="font-size: 0.82rem; margin-bottom: 4px;">Densidad en el gel poroso fractal ($d = d_f$):</p>
                $$n_{d_f} = n \\lambda_T^{3-d_f} e^{\\frac{\\varepsilon_f}{k_BT}}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Densidad en el polímero lineal ($d = 1$):</p>
                $$n_1 = n \\lambda_T^{3-1} e^{\\frac{\\varepsilon_1}{k_BT}} = n \\lambda_T^2 e^{\\frac{\\varepsilon_1}{k_BT}}$$
            </div>
        `
    },
    {
        title: "PASO 02: Cociente de Adsorción Relativa",
        latex: "\\frac{n_{d_f}}{n_1} = \\lambda_T^{1-d_f}\\cdot e^{(\\varepsilon_f-\\varepsilon_1)/k_BT}",
        narrative: `
            <p>Para independizar la medida de variables volumétricas complejas, se define el cociente de adsorción relativa entre la densidad en el gel $n_{d_f}$ y en el polímero lineal $n_1$.</p>
            <p>Al dividir ambas expresiones, la densidad del gas libre en el seno de la solución $n$ se cancela por completo de la ecuación, eliminando la necesidad de su medición directa en laboratorio. Agrupando las potencias de la longitud térmica se obtiene:</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: cociente y simplificación</div>
                $$\\frac{n_{d_f}}{n_1} = \\frac{n \\lambda_T^{3-d_f} e^{\\frac{\\varepsilon_f}{k_BT}}}{n \\lambda_T^2 e^{\\frac{\\varepsilon_1}{k_BT}}}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">1. Las concentraciones $n$ se van. Simplifico la base $\\lambda_T$ restando exponentes:</p>
                $$\\lambda_T^{(3-d_f) - 2} = \\lambda_T^{1-d_f}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">2. Queda la relación libre de concentraciones de volumen:</p>
                $$\\frac{n_{d_f}}{n_1} = \\lambda_T^{1-d_f} e^{\\frac{\\varepsilon_f - \\varepsilon_1}{k_BT}}$$
            </div>
        `
    },
    {
        title: "PASO 03: Linealización del Modelo Termodinámico",
        latex: "\\ln\\!\\left(\\frac{n_{d_f}}{n_1}\\right) = \\frac{d_f - 1}{2}\\ln T + \\frac{\\varepsilon_f - \\varepsilon_1}{k_BT} + C",
        narrative: `
            <p>Para convertir la relación termodinámica en un modelo analítico ajustable linealmente por mínimos cuadrados, se toma logaritmo natural a ambos lados de la ecuación.</p>
            <p>Introduciendo la dependencia explícita de la longitud térmica con la temperatura, $\\lambda_T \\propto T^{-1/2}$, se desglosan las contribuciones logarítmicas de la temperatura y de las energías de activación:</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: aplicando logaritmos y sustituyendo λ_T</div>
                $$\\ln\\left(\\frac{n_{d_f}}{n_1}\\right) = \\ln\\left( \\lambda_T^{1-d_f} e^{\\frac{\\varepsilon_f - \\varepsilon_1}{k_BT}} \\right)$$
                $$\\ln\\left(\\frac{n_{d_f}}{n_1}\\right) = (1 - d_f)\\ln \\lambda_T + \\frac{\\varepsilon_f - \\varepsilon_1}{k_BT}$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Sustituyendo $\\ln \\lambda_T = \\ln A - \\frac{1}{2}\\ln T$:</p>
                $$\\ln\\left(\\frac{n_{d_f}}{n_1}\\right) = (1 - d_f)\\left[ \\ln A - \\frac{1}{2}\\ln T \\right] + \\frac{\\varepsilon_f - \\varepsilon_1}{k_BT}$$
                $$\\ln\\left(\\frac{n_{d_f}}{n_1}\\right) = \\frac{d_f - 1}{2}\\ln T + \\frac{\\varepsilon_f - \\varepsilon_1}{k_BT} + (1-d_f)\\ln A$$
            </div>
        `
    },
    {
        title: "PASO 04: Caracterización Experimental de la Dimensión Fractal",
        latex: "\\ln\\!\\left(\\frac{n_{d_f}}{n_1}\\right) = \\frac{d_f - 1}{2}\\ln T + C",
        narrative: `
            <p>La relación logarítmica adopta una estructura de ecuación lineal del tipo $y = m \\cdot x + C$, donde la variable independiente es $\\ln T$.</p>
            <p>Graficando la respuesta experimental de $\\ln(n_{d_f}/n_1)$ frente a $\\ln T$ (a temperaturas donde las contribuciones de energía del sustrato se estabilicen o puedan sustraerse), la pendiente $m$ del ajuste lineal determina directamente la geometría del medio:</p>
            <p>$m = (d_f - 1)/2 \\implies d_f = 1 + 2m$.</p>
            <p>Este resultado confirma la viabilidad del método de caracterización térmica no invasiva para deducir dimensiones fractales de geles a partir de medidas de adsorción relativa.</p>
        `,
        scratchpad: `
            <div class="scratchpad-box" style="margin: 0;">
                <div class="scratchpad-title">El borrador: la recta y variables de ajuste</div>
                $$y = m \\cdot x + C \\qquad \\text{donde} \\qquad y = \\ln\\left(\\frac{n_{d_f}}{n_1}\\right), \\; x = \\ln T$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">La pendiente de la recta medida es:</p>
                $$m = \\frac{d_f - 1}{2} \\implies d_f = 1 + 2m$$
                <p style="font-size: 0.82rem; margin-top: 6px; margin-bottom: 4px;">Ejemplo:</p>
                <ul>
                    <li>Si se mide una pendiente $m = 0.29$:</li>
                    $$d_f = 1 + 2(0.29) = 1.58 \\quad \\text{(Muestra Sierpinski)}$$
                    <li>Si se mide una pendiente $m = 1.00$:</li>
                    $$d_f = 1 + 2(1.00) = 3.00 \\quad \\text{(Gel ordinario 3D)}$$
                </ul>
            </div>
        `
    }
];

function updateDerivationStepC() {
    const step = derivationStepsC[currentDerivationStepIdxC];
    
    // Reset panic button and close modal
    if (typeof closeBorradorModal === 'function') {
        closeBorradorModal();
    }
    
    // Set titles
    document.getElementById('step-title-c').textContent = step.title;
    
    // Parse math in narrative and scratchpad strings
    const parsedNarrative = parseMathInText(step.narrative);
    const parsedScratchpad = parseMathInText(step.scratchpad);
    
    // Save to current modal content variable
    currentScratchpadHTML = parsedScratchpad;
    
    // Set left column narrative text
    const narrativeEl = document.getElementById('step-narrative-c');
    if (narrativeEl) {
        narrativeEl.innerHTML = parsedNarrative;
    }
    
    // Set right column explanation text
    const contentEl = document.getElementById('step-content-c');
    if (contentEl) {
        contentEl.innerHTML = `
            <div class="latex-math" id="step-math-render-c" style="margin-bottom: 12px; padding: 10px;"></div>
        `;
    }
    
    // Render latex in the step and in the main slide title
    renderLatex('step-math-render-c', step.latex);
    renderLatex('equation-main-c', "\\ln\\!\\left(\\frac{n_{d_f}}{n_1}\\right) = \\frac{d_f - 1}{2}\\ln T + \\frac{\\varepsilon_f - \\varepsilon_1}{k_BT} + C");
    
    // Enable/disable buttons
    document.getElementById('prev-step-btn-c').disabled = currentDerivationStepIdxC === 0;
    document.getElementById('next-step-btn-c').disabled = currentDerivationStepIdxC === derivationStepsC.length - 1;
    
    document.getElementById('step-indicator-c').textContent = `PASO ${currentDerivationStepIdxC + 1} / ${derivationStepsC.length}`;
}

function nextDerivationStepC() {
    if (currentDerivationStepIdxC < derivationStepsC.length - 1) {
        currentDerivationStepIdxC++;
        updateDerivationStepC();
    }
}

function prevDerivationStepC() {
    if (currentDerivationStepIdxC > 0) {
        currentDerivationStepIdxC--;
        updateDerivationStepC();
    }
}

// ----------------------------------------------------
// Slide 4: Phase Space Simulator (Orange layout)
// ----------------------------------------------------
// Slide 4: Phase Space Simulator (Orange layout)
// ----------------------------------------------------
const waveCanvas = document.getElementById('wave-canvas');
const waveCtx = waveCanvas.getContext('2d');

let waveAnimId = null;

function runWaveAnimationLoop() {
    if (currentSlideIndex === 4) {
        updatePhaseSpaceSim();
        waveAnimId = requestAnimationFrame(runWaveAnimationLoop);
    } else {
        waveAnimId = null;
    }
}

function updatePhaseSpaceSim() {
    const d = parseInt(document.getElementById('slider-dim').value);
    const T = parseFloat(document.getElementById('slider-temp-phase').value);
    const m = parseFloat(document.getElementById('slider-mass').value);
    const nd = parseFloat(document.getElementById('slider-dens').value);

    // Update labels
    document.getElementById('val-dim').textContent = d;
    document.getElementById('val-temp-phase').textContent = T;
    document.getElementById('val-mass').textContent = m;
    document.getElementById('val-dens').textContent = nd.toFixed(2);

    // Calculate lambda_T (in nanometers)
    const m_kg = m * amu;
    const lambda_m = h / Math.sqrt(2 * Math.PI * m_kg * kB * T);
    const lambda_nm = lambda_m * 1e9;

    // Calculate parameter: n_d * lambda_T^d
    const parameter = nd * Math.pow(lambda_nm, d);

    document.getElementById('res-lambda-t').innerHTML = `${lambda_nm.toFixed(4)} nm`;
    document.getElementById('res-parameter').innerHTML = `${parameter.toExponential(4)}`;

    // Update status
    const statusBox = document.getElementById('quantum-regime-status');
    if (parameter >= 0.5) {
        statusBox.textContent = "CUÁNTICO (DEGENERADO)";
        statusBox.className = "status-quantum";
    } else {
        statusBox.textContent = "CLÁSICO (DILUIDO)";
        statusBox.className = "status-classic";
    }

    // Dynamic resize check
    if (waveCanvas.width !== waveCanvas.clientWidth || waveCanvas.height !== waveCanvas.clientHeight) {
        waveCanvas.width = waveCanvas.clientWidth;
        waveCanvas.height = waveCanvas.clientHeight;
    }

    if (waveCanvas.width > 0 && waveCanvas.height > 0) {
        drawWaveOverlap(lambda_nm, nd, d);
    }
}

function drawWaveOverlap(lambda, nd, d) {
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    
    // Draw grid lines inside canvas (instrument style)
    waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    waveCtx.lineWidth = 1;
    for (let x = 15; x < waveCanvas.width; x += 15) {
        waveCtx.beginPath();
        waveCtx.moveTo(x, 0);
        waveCtx.lineTo(x, waveCanvas.height);
        waveCtx.stroke();
    }
    for (let y = 15; y < waveCanvas.height; y += 15) {
        waveCtx.beginPath();
        waveCtx.moveTo(0, y);
        waveCtx.lineTo(waveCanvas.width, y);
        waveCtx.stroke();
    }

    const scaleFactor = 60; 
    let particleCount = Math.round(nd * scaleFactor);
    if (particleCount < 3) particleCount = 3;
    if (particleCount > 40) particleCount = 40;

    const particles = [];
    let seed = 42;
    function random() {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    for (let i = 0; i < particleCount; i++) {
        // Add gentle thermal vibration overlay
        const timeFactor = Date.now() * 0.0028;
        const vibX = Math.sin(timeFactor + i * 1.3) * 2.2;
        const vibY = Math.cos(timeFactor + i * 1.7) * 2.2;

        let px = (random() * waveCanvas.width) + vibX;
        let py = (random() * waveCanvas.height) + vibY;

        // Prevent particle centers or outer glow from obscuring text displays in top-left and top-right
        if (py < 30) {
            if (px < 210 || px > waveCanvas.width - 210) {
                py = 30 + random() * (waveCanvas.height - 30);
            }
        }

        particles.push({ x: px, y: py });
    }

    // Visual scale for lambda_T
    const pxScale = 120;
    const visualLambda = lambda * pxScale;

    // Draw wave packets (Orange Gaussian glow + pulsing De Broglie wave ripples)
    particles.forEach((p, idx) => {
        // Base Gaussian gradient
        const grad = waveCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, visualLambda * 1.4);
        grad.addColorStop(0, 'rgba(255, 85, 0, 0.45)');
        grad.addColorStop(0.3, 'rgba(255, 85, 0, 0.15)');
        grad.addColorStop(1, 'rgba(255, 85, 0, 0)');

        waveCtx.beginPath();
        waveCtx.arc(p.x, p.y, visualLambda * 1.4, 0, Math.PI * 2);
        waveCtx.fillStyle = grad;
        waveCtx.fill();

        // Wave oscillations (pulsing phase ring)
        const pulseT = (Date.now() * 0.0016 + idx * 0.23) % 1.0;
        const pulseR = visualLambda * (0.3 + 1.1 * pulseT);
        const pulseAlpha = 0.25 * (1.0 - pulseT);
        
        waveCtx.strokeStyle = `rgba(255, 120, 0, ${pulseAlpha})`;
        waveCtx.lineWidth = 0.8;
        waveCtx.beginPath();
        waveCtx.arc(p.x, p.y, pulseR, 0, Math.PI * 2);
        waveCtx.stroke();
        
        // Dashed boundary ring showing the physical threshold λ_T
        waveCtx.strokeStyle = 'rgba(255, 85, 0, 0.18)';
        waveCtx.lineWidth = 0.7;
        waveCtx.setLineDash([2, 3]);
        waveCtx.beginPath();
        waveCtx.arc(p.x, p.y, visualLambda, 0, Math.PI * 2);
        waveCtx.stroke();
        waveCtx.setLineDash([]);
    });

    // Draw quantum links between overlapping wave packets (visual coherence / degeneracy indicator)
    waveCtx.lineWidth = 1.0;
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxOverlap = visualLambda * 2.0;
            if (dist < maxOverlap) {
                const overlapRatio = 1.0 - (dist / maxOverlap);
                // Draw a glowing cyan connection link
                waveCtx.strokeStyle = `rgba(0, 240, 200, ${overlapRatio * 0.35})`;
                waveCtx.beginPath();
                waveCtx.moveTo(particles[i].x, particles[i].y);
                waveCtx.lineTo(particles[j].x, particles[j].y);
                waveCtx.stroke();
                
                // Small intersection dot in the middle of the link
                const midX = (particles[i].x + particles[j].x) / 2;
                const midY = (particles[i].y + particles[j].y) / 2;
                waveCtx.fillStyle = `rgba(0, 255, 200, ${overlapRatio * 0.55})`;
                waveCtx.beginPath();
                waveCtx.arc(midX, midY, 1.2, 0, Math.PI * 2);
                waveCtx.fill();
            }
        }
    }

    // Draw particle centers (White glowing technical squares)
    particles.forEach(p => {
        waveCtx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        waveCtx.shadowBlur = 4;
        waveCtx.fillStyle = '#ffffff';
        waveCtx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        waveCtx.shadowBlur = 0;
    });

    // Draw text overlays (faint diagnostic screen style)
    waveCtx.fillStyle = 'rgba(255,255,255,0.25)';
    waveCtx.font = '9px "JetBrains Mono", monospace';
    waveCtx.textAlign = 'left';
    waveCtx.fillText(`WAVEPACKET_MONITOR // λ_T = ${visualLambda.toFixed(1)}px`, 12, 18);

    // Calculate dynamic degeneracy parameter nd * lambda^d
    const parameter = nd * Math.pow(lambda, d);
    let regimeText = "RÉGIMEN: CLÁSICO (DILUIDO)";
    let regimeColor = "rgba(142, 147, 157, 0.4)";
    if (parameter >= 1.0) {
        regimeText = "RÉGIMEN: DEGENERACIÓN CUÁNTICA";
        regimeColor = "rgba(0, 255, 200, 0.7)";
    } else if (parameter >= 0.1) {
        regimeText = "RÉGIMEN: SOLAPE PARCIAL DE ONDAS";
        regimeColor = "rgba(255, 120, 0, 0.7)";
    }
    
    waveCtx.fillStyle = regimeColor;
    waveCtx.font = 'bold 9px "JetBrains Mono", monospace';
    waveCtx.textAlign = 'right';
    waveCtx.fillText(regimeText, waveCanvas.width - 12, 18);
}

// ----------------------------------------------------
// Slide 6: Live Adsorp Simulator (Orange Workstation style)
// ----------------------------------------------------
const adsorpCanvas = document.getElementById('adsorption-canvas');
const adsorpCtx = adsorpCanvas.getContext('2d');
let adsorpParticles = [];
const targetParticleCount = 80;

function initAdsorpSimulator() {
    const rect = adsorpCanvas.getBoundingClientRect();
    adsorpCanvas.width = rect.width;
    adsorpCanvas.height = rect.height;

    adsorpParticles = [];
    for (let i = 0; i < targetParticleCount; i++) {
        adsorpParticles.push({
            x: Math.random() * adsorpCanvas.width,
            y: adsorpCanvas.height * 0.4 + Math.random() * (adsorpCanvas.height * 0.55),
            vx: (Math.random() - 0.5) * 1.4,
            vy: (Math.random() - 0.5) * 1.4,
            radius: 2.5,
            state: 'bulk', 
            color: '#8e939d' // slate grey
        });
    }
}

function updateAdsorpSimulation() {
    const T = parseFloat(document.getElementById('slider-temp-ad').value);
    const E0 = parseFloat(document.getElementById('slider-energy-ad').value);
    const n = parseFloat(document.getElementById('slider-conc-ad').value);

    // Update labels
    document.getElementById('val-temp-ad').textContent = T;
    document.getElementById('val-energy-ad').textContent = E0.toFixed(2);
    document.getElementById('val-conc-ad').textContent = n.toFixed(3);

    // Calculate lambda_T in nm
    const m_mol = 30;
    const m_kg = m_mol * amu;
    const lambda_nm = (h / Math.sqrt(2 * Math.PI * m_kg * kB * T)) * 1e9;

    const interfaceY = 30;

    // Desorption rate (Arrhenius)
    const baseDesorpProb = 0.15;
    const P_desorb = baseDesorpProb / Math.exp(E0 / (kB_eV * T));
    const P_adsorb = 0.85;

    adsorpParticles.forEach(p => {
        if (p.state === 'bulk') {
            p.x += p.vx + (Math.random() - 0.5) * 0.4;
            p.y += p.vy + (Math.random() - 0.5) * 0.4;

            if (p.x < 4 || p.x > adsorpCanvas.width - 4) p.vx *= -1;
            if (p.y > adsorpCanvas.height - 8) p.vy *= -1;

            if (p.y <= interfaceY + 2) {
                if (Math.random() < P_adsorb) {
                    p.state = 'surface';
                    p.y = interfaceY - 2;
                    p.color = '#ff5500'; // Safety orange for adsorbed
                } else {
                    p.vy *= -1;
                    p.y = interfaceY + 4;
                }
            }

            p.x = Math.max(4, Math.min(adsorpCanvas.width - 4, p.x));
            p.y = Math.max(interfaceY + 2, Math.min(adsorpCanvas.height - 8, p.y));

        } else if (p.state === 'surface') {
            p.x += (Math.random() - 0.5) * 0.6;
            if (p.x < 4 || p.x > adsorpCanvas.width - 4) p.x = Math.max(4, Math.min(adsorpCanvas.width - 4, p.x));

            if (Math.random() < P_desorb) {
                p.state = 'bulk';
                p.y = interfaceY + 4;
                p.vy = 0.4 + Math.random(); 
                p.vx = (Math.random() - 0.5) * 1.4;
                p.color = '#8e939d'; // slate grey
            }
        }
    });

    adsorpCtx.clearRect(0, 0, adsorpCanvas.width, adsorpCanvas.height);

    // Draw Solution (bulk) background - subtle slate
    adsorpCtx.fillStyle = 'rgba(255, 255, 255, 0.008)';
    adsorpCtx.fillRect(0, interfaceY, adsorpCanvas.width, adsorpCanvas.height - interfaceY);

    // Draw interface grid lines
    adsorpCtx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    adsorpCtx.lineWidth = 1;
    for (let x = 20; x < adsorpCanvas.width; x += 20) {
        adsorpCtx.beginPath();
        adsorpCtx.moveTo(x, interfaceY);
        adsorpCtx.lineTo(x, adsorpCanvas.height);
        adsorpCtx.stroke();
    }

    // Draw surface interface line (Orange line)
    adsorpCtx.beginPath();
    adsorpCtx.moveTo(0, interfaceY);
    adsorpCtx.lineTo(adsorpCanvas.width, interfaceY);
    adsorpCtx.strokeStyle = '#ff5500';
    adsorpCtx.lineWidth = 2;
    adsorpCtx.stroke();

    // Draw particles
    adsorpParticles.forEach(p => {
        adsorpCtx.beginPath();
        adsorpCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        adsorpCtx.fillStyle = p.color;
        adsorpCtx.fill();
    });

    // Compute empirical stats
    const surfaceCount = adsorpParticles.filter(p => p.state === 'surface').length;
    const n2_measured = surfaceCount * 0.008;
    const ratio_measured = n2_measured / n;

    document.getElementById('val-stat-n2').innerHTML = `${n2_measured.toFixed(4)} nm<sup>-2</sup>`;
    document.getElementById('val-stat-ratio').innerHTML = `${ratio_measured.toFixed(3)} nm`;

    // Re-draw analytical SVG curve
    drawAdsorptionCurve(n, E0, T, m_mol);
}

function drawAdsorptionCurve(n, E0, currentT, m_mol) {
    const svg = document.getElementById('adsorption-svg-chart');
    const width = 360;
    const height = 130;
    const paddingLeft = 45;
    const paddingBottom = 25;
    const paddingTop = 10;
    const paddingRight = 10;

    const plotW = width - paddingLeft - paddingRight;
    const plotH = height - paddingTop - paddingBottom;

    const points = [];
    const minT = 100;
    const maxT = 600;
    const m_kg = m_mol * amu;

    function calcN2(temp) {
        const lambda = (h / Math.sqrt(2 * Math.PI * m_kg * kB * temp)) * 1e9;
        return n * lambda * Math.exp(E0 / (kB_eV * temp));
    }

    let maxVal = calcN2(minT);
    if (isNaN(maxVal) || !isFinite(maxVal)) maxVal = 2.0;
    maxVal = Math.max(0.1, maxVal);

    for (let temp = minT; temp <= maxT; temp += 10) {
        points.push({ t: temp, v: calcN2(temp) });
    }

    let svgContent = '';

    // Draw grid lines inside chart
    const yGridTicks = [maxVal / 2, maxVal];
    yGridTicks.forEach(val => {
        const y = height - paddingBottom - (val / maxVal) * plotH;
        svgContent += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />`;
    });
    
    // Draw axes
    svgContent += `<line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}" stroke="#1e222b" stroke-width="1" />`;
    svgContent += `<line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="#1e222b" stroke-width="1" />`;

    // Build path
    let dPath = '';
    points.forEach((p, idx) => {
        const x = paddingLeft + ((p.t - minT) / (maxT - minT)) * plotW;
        const y = height - paddingBottom - (p.v / maxVal) * plotH;
        if (idx === 0) dPath += `M ${x} ${y}`;
        else dPath += ` L ${x} ${y}`;
    });

    svgContent += `<path d="${dPath}" fill="none" stroke="#ff5500" stroke-width="1.5" />`;

    // Current temp marker (Leica style: Orange square)
    const curX = paddingLeft + ((currentT - minT) / (maxT - minT)) * plotW;
    const curN2 = calcN2(currentT);
    const curY = height - paddingBottom - (curN2 / maxVal) * plotH;

    if (!isNaN(curY) && isFinite(curY)) {
        svgContent += `<rect x="${curX - 3.5}" y="${curY - 3.5}" width="7" height="7" fill="#ffffff" stroke="#ff5500" stroke-width="1.5" />`;
    }

    // Y Axis labels
    svgContent += `<text x="${paddingLeft - 8}" y="${paddingTop + 5}" fill="#4e535e" font-size="7" font-family="'JetBrains Mono', monospace" text-anchor="end">${maxVal.toFixed(2)}</text>`;
    svgContent += `<text x="${paddingLeft - 8}" y="${height - paddingBottom}" fill="#4e535e" font-size="7" font-family="'JetBrains Mono', monospace" text-anchor="end">0.0</text>`;
    
    // X Axis labels
    svgContent += `<text x="${paddingLeft}" y="${height - paddingBottom + 12}" fill="#4e535e" font-size="7" font-family="'JetBrains Mono', monospace" text-anchor="middle">100K</text>`;
    svgContent += `<text x="${paddingLeft + plotW}" y="${height - paddingBottom + 12}" fill="#4e535e" font-size="7" font-family="'JetBrains Mono', monospace" text-anchor="middle">600K</text>`;
    
    svg.innerHTML = svgContent;
}

function runAdsorpAnimationLoop() {
    if (currentSlideIndex === 6) {
        // Dynamic resize check
        if (adsorpCanvas.width !== adsorpCanvas.clientWidth || adsorpCanvas.height !== adsorpCanvas.clientHeight) {
            adsorpCanvas.width = adsorpCanvas.clientWidth;
            adsorpCanvas.height = adsorpCanvas.clientHeight;
            // Re-distribute particles to be inside new bounds
            adsorpParticles.forEach(p => {
                p.x = Math.random() * adsorpCanvas.width;
                p.y = adsorpCanvas.height * 0.4 + Math.random() * (adsorpCanvas.height * 0.55);
            });
        }

        if (adsorpCanvas.width > 0 && adsorpCanvas.height > 0) {
            updateAdsorpSimulation();
        }
    }
    requestAnimationFrame(runAdsorpAnimationLoop);
}

// ----------------------------------------------------
// Slide 7: Fractal Canvas Tree Drawing (Orange precision)
// ----------------------------------------------------
const fractalCanvas = document.getElementById('fractal-canvas-tree');
const fractalCtx = fractalCanvas.getContext('2d');

function initFractalDrawing() {
    const rect = fractalCanvas.getBoundingClientRect();
    fractalCanvas.width = rect.width;
    fractalCanvas.height = rect.height;
}

function drawFractalTree(x, y, len, angle, branchWidth, depth) {
    fractalCtx.beginPath();
    fractalCtx.moveTo(x, y);
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    fractalCtx.lineTo(x2, y2);
    
    // Solid orange shades based on depth
    const alpha = 1.0 - (depth * 0.12);
    fractalCtx.strokeStyle = `rgba(255, 85, 0, ${alpha})`;
    fractalCtx.lineWidth = branchWidth;
    fractalCtx.stroke();

    if (depth < 6) {
        const time = Date.now() * 0.0015;
        const branchSway = Math.sin(time + depth * 0.7) * 0.035;
        
        drawFractalTree(x2, y2, len * 0.73, angle - 0.45 + branchSway, branchWidth * 0.7, depth + 1);
        drawFractalTree(x2, y2, len * 0.73, angle + 0.45 + branchSway, branchWidth * 0.7, depth + 1);
    }
}

function animateFractalTree() {
    if (currentSlideIndex !== 7) return;
    
    // Dynamic resize check
    if (fractalCanvas.width !== fractalCanvas.clientWidth || fractalCanvas.height !== fractalCanvas.clientHeight) {
        fractalCanvas.width = fractalCanvas.clientWidth;
        fractalCanvas.height = fractalCanvas.clientHeight;
    }
    
    if (fractalCanvas.width > 0 && fractalCanvas.height > 0) {
        fractalCtx.clearRect(0, 0, fractalCanvas.width, fractalCanvas.height);
        
        const startX = fractalCanvas.width / 2;
        const startY = fractalCanvas.height - 10;
        
        // Gentle sway based on time
        const time = Date.now() * 0.0015;
        const baseSway = Math.sin(time) * 0.05;
        
        // Draw tree
        drawFractalTree(startX, startY, 30, -Math.PI / 2 + baseSway, 3.5, 0);
    }
    
    requestAnimationFrame(animateFractalTree);
}

// ----------------------------------------------------
// Slide 8: Virtual Lab for measuring d_f (Square plots)
// ----------------------------------------------------
let gelDatabase = {
    'gel-a': { name: 'Gel Alfa', df: 1.58, color: '#ff5500' }, // Safety Orange
    'gel-b': { name: 'Gel Beta', df: 1.32, color: '#ffaa00' }, // Safety Yellow
    'gel-c': { name: 'Gel Gamma', df: 1.81, color: '#ff2200' } // Red Orange
};

let experimentalData = [];
let isLinearized = false;
let dataFit = null;

const xMinNorm = 150, xMaxNorm = 450;
const xMinLin = Math.log(150), xMaxLin = Math.log(450);
let yMinLin = -2, yMaxLin = 2;

function runExperiment() {
    const gelKey = document.getElementById('select-gel').value;
    const gel = gelDatabase[gelKey];
    
    experimentalData = [];
    isLinearized = false;
    dataFit = null;

    const temps = [160, 195, 230, 265, 300, 335, 370, 405, 440];
    const exponent = (gel.df - 1) / 2;
    const scale = 2.0 / Math.pow(300, exponent);

    temps.forEach(T => {
        const exactRatio = scale * Math.pow(T, exponent);
        const noise = (Math.random() - 0.5) * 0.08 * exactRatio;
        const measuredRatio = exactRatio + noise;

        experimentalData.push({
            T: T,
            ratio: measuredRatio,
            currX: 0,
            currY: 0
        });
    });

    document.getElementById('btn-linearize').disabled = false;
    document.getElementById('btn-linearize').textContent = "[ LINEALIZAR LOG ]";
    document.getElementById('btn-fit').disabled = true;
    
    document.getElementById('fit-slope').textContent = "--";
    document.getElementById('fit-df').textContent = "--";
    document.getElementById('fit-formula').textContent = "--";

    animatePointsTo('normal');
    document.getElementById('lab-chart-hint').textContent = "[ PUNTOS ADQUIRIDOS CON ÉXITO. SELECCIONE LINEALIZACIÓN ]";
}

function toggleLinearization() {
    isLinearized = !isLinearized;
    const btn = document.getElementById('btn-linearize');
    
    if (isLinearized) {
        btn.textContent = "[ ESCALA LINEAL ]";
        document.getElementById('btn-fit').disabled = false;
        animatePointsTo('linearized');
        document.getElementById('lab-chart-hint').textContent = "[ ESCALA LOGARÍTMICA ACTIVA. PROCEDA A EFECTUAR EL AJUSTE ]";
    } else {
        btn.textContent = "[ LINEALIZAR LOG ]";
        document.getElementById('btn-fit').disabled = true;
        animatePointsTo('normal');
        document.getElementById('lab-chart-hint').textContent = "[ RETORNADO A ESCALA LINEAL ]";
    }
    dataFit = null;
    drawLabChart();
}

function animatePointsTo(mode) {
    const width = 500;
    const height = 350;
    const padLeft = 60;
    const padBottom = 60;
    const padRight = 30;
    const padTop = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const maxRatio = Math.max(...experimentalData.map(d => d.ratio));
    const yMaxNormal = Math.ceil(maxRatio * 1.15 * 10) / 10;

    const logRatios = experimentalData.map(d => Math.log(d.ratio));
    const minLogR = Math.min(...logRatios);
    const maxLogR = Math.log(yMaxNormal);
    
    yMinLin = Math.floor(minLogR - 0.2);
    yMaxLin = Math.ceil(maxLogR + 0.2);

    experimentalData.forEach(d => {
        let destX, destY;
        if (mode === 'normal') {
            destX = padLeft + ((d.T - xMinNorm) / (xMaxNorm - xMinNorm)) * plotW;
            destY = height - padBottom - (d.ratio / yMaxNormal) * plotH;
        } else {
            const lnT = Math.log(d.T);
            const lnR = Math.log(d.ratio);
            destX = padLeft + ((lnT - xMinLin) / (xMaxLin - xMinLin)) * plotW;
            destY = height - padBottom - ((lnR - yMinLin) / (yMaxLin - yMinLin)) * plotH;
        }

        d.targetX = destX;
        d.targetY = destY;
        if (d.currX === 0 && d.currY === 0) {
            d.currX = destX;
            d.currY = destY;
        }
    });

    let ticks = 0;
    function animTick() {
        let finished = true;
        experimentalData.forEach(d => {
            const dx = d.targetX - d.currX;
            const dy = d.targetY - d.currY;
            if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
                d.currX += dx * 0.18;
                d.currY += dy * 0.18;
                finished = false;
            } else {
                d.currX = d.targetX;
                d.currY = d.targetY;
            }
        });
        
        drawLabChart();
        
        if (!finished && ticks < 40) {
            ticks++;
            requestAnimationFrame(animTick);
        }
    }
    animTick();
}

function drawLabChart() {
    const svg = document.getElementById('lab-svg-chart');
    const pointsGroup = document.getElementById('lab-data-points');
    const axesGroup = document.getElementById('lab-axes');
    const gridGroup = document.getElementById('lab-grid-lines');
    const fitLine = document.getElementById('lab-fit-line');
    
    const width = 500;
    const height = 350;
    const padLeft = 60;
    const padBottom = 60;
    const padRight = 30;
    const padTop = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const gelKey = document.getElementById('select-gel').value;
    const gel = gelDatabase[gelKey];

    let gridContent = '';
    let axesContent = '';

    // Draw solid axes line (Slate)
    axesContent += `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="#1e222b" stroke-width="1.5" />`;
    axesContent += `<line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#1e222b" stroke-width="1.5" />`;

    const maxRatio = Math.max(...experimentalData.map(d => d.ratio));
    const yMaxNormal = Math.ceil(maxRatio * 1.15 * 10) / 10;

    if (!isLinearized) {
        document.getElementById('lab-x-label').textContent = "TEMPERATURA T (K)";
        document.getElementById('lab-y-label').textContent = "ADSORCIÓN RELATIVA (n_df / n_1)";

        // X labels
        const xTicks = [150, 200, 250, 300, 350, 400, 450];
        xTicks.forEach(tx => {
            const x = padLeft + ((tx - xMinNorm) / (xMaxNorm - xMinNorm)) * plotW;
            gridContent += `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${height - padBottom}" stroke="rgba(255,255,255,0.015)" stroke-width="1" />`;
            axesContent += `<text x="${x}" y="${height - padBottom + 18}" fill="#8e939d" font-size="8" font-family="'JetBrains Mono', monospace" text-anchor="middle">${tx} K</text>`;
        });

        // Y labels
        const yTicks = [0, yMaxNormal / 4, yMaxNormal / 2, (yMaxNormal * 3) / 4, yMaxNormal];
        yTicks.forEach(ty => {
            const y = height - padBottom - (ty / yMaxNormal) * plotH;
            gridContent += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="rgba(255,255,255,0.015)" stroke-width="1" />`;
            axesContent += `<text x="${padLeft - 10}" y="${y + 3}" fill="#8e939d" font-size="8" font-family="'JetBrains Mono', monospace" text-anchor="end">${ty.toFixed(2)}</text>`;
        });
    } else {
        document.getElementById('lab-x-label').innerHTML = "ln( TEMPERATURA T / K )";
        document.getElementById('lab-y-label').innerHTML = "ln( ADSORCIÓN RELATIVA n<sub>df</sub> / n<sub>1</sub> )";

        const xTicks = [150, 200, 250, 300, 350, 400, 450];
        xTicks.forEach(tx => {
            const val = Math.log(tx);
            const x = padLeft + ((val - xMinLin) / (xMaxLin - xMinLin)) * plotW;
            gridContent += `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${height - padBottom}" stroke="rgba(255,255,255,0.015)" stroke-width="1" />`;
            axesContent += `<text x="${x}" y="${height - padBottom + 18}" fill="#8e939d" font-size="8" font-family="'JetBrains Mono', monospace" text-anchor="middle">${val.toFixed(2)}</text>`;
        });

        const yTicksVal = [];
        for (let i = yMinLin; i <= yMaxLin; i += 0.5) yTicksVal.push(i);
        yTicksVal.forEach(ty => {
            const y = height - padBottom - ((ty - yMinLin) / (yMaxLin - yMinLin)) * plotH;
            gridContent += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="rgba(255,255,255,0.015)" stroke-width="1" />`;
            axesContent += `<text x="${padLeft - 10}" y="${y + 3}" fill="#8e939d" font-size="8" font-family="'JetBrains Mono', monospace" text-anchor="end">${ty.toFixed(1)}</text>`;
        });
    }

    gridGroup.innerHTML = gridContent;
    axesGroup.innerHTML = axesContent;

    // 2. Draw Data points (Leica square dots)
    let pointsContent = '';
    experimentalData.forEach(d => {
        pointsContent += `
            <rect class="dot" x="${d.currX - 3.5}" y="${d.currY - 3.5}" width="7" height="7" fill="${gel.color}" stroke="#ffffff" stroke-width="1" />
        `;
    });
    pointsGroup.innerHTML = pointsContent;

    // 3. Draw Fit Line
    if (dataFit) {
        if (!isLinearized) {
            let dPath = '';
            for (let tx = xMinNorm; tx <= xMaxNorm; tx += 5) {
                const pxX = padLeft + ((tx - xMinNorm) / (xMaxNorm - xMinNorm)) * plotW;
                const ratioFit = Math.exp(dataFit.intercept + dataFit.slope * Math.log(tx));
                const pxY = height - padBottom - (ratioFit / yMaxNormal) * plotH;
                if (tx === xMinNorm) dPath += `M ${pxX} ${pxY}`;
                else dPath += ` L ${pxX} ${pxY}`;
            }
            fitLine.setAttribute('d', dPath);
        } else {
            const x1_px = padLeft;
            const y1_val = dataFit.intercept + dataFit.slope * xMinLin;
            const y1_px = height - padBottom - ((y1_val - yMinLin) / (yMaxLin - yMinLin)) * plotH;

            const x2_px = width - padRight;
            const y2_val = dataFit.intercept + dataFit.slope * xMaxLin;
            const y2_px = height - padBottom - ((y2_val - yMinLin) / (yMaxLin - yMinLin)) * plotH;

            fitLine.setAttribute('d', `M ${x1_px} ${y1_px} L ${x2_px} ${y2_px}`);
        }
        fitLine.style.display = 'block';
    } else {
        fitLine.style.display = 'none';
    }
}

function fitExperimentalData() {
    const n_points = experimentalData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    experimentalData.forEach(d => {
        const x = Math.log(d.T);
        const y = Math.log(d.ratio);
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    });

    const meanX = sumX / n_points;
    const meanY = sumY / n_points;

    const slope = (sumXY - n_points * meanX * meanY) / (sumXX - n_points * meanX * meanX);
    const intercept = meanY - slope * meanX;

    dataFit = { slope, intercept };

    // slope = (d_f - 1)/2 => d_f = 1 + 2 * slope
    const df_calculated = 1 + 2 * slope;

    // Display results
    document.getElementById('fit-slope').textContent = slope.toFixed(4);
    document.getElementById('fit-df').textContent = df_calculated.toFixed(2);
    document.getElementById('fit-formula').textContent = `ln(R) = ${slope.toFixed(3)}·ln(T) + (${intercept.toFixed(2)})`;

    drawLabChart();
    document.getElementById('lab-chart-hint').textContent = `[ REGRESIÓN DE AJUSTE CONCLUIDA: d_f = ${df_calculated.toFixed(2)} ]`;
}

// ----------------------------------------------------
// Presentation Initialization & Slide Change Handler
// ----------------------------------------------------
function onSlideActivate(idx) {
    if (typeof closeBorradorModal === 'function') {
        closeBorradorModal();
    }
    if (idx === 2) {
        initMoleculeViewer();
    } else if (idx === 3) {
        updateDerivationStep();
    } else if (idx === 4) {
        if (waveCanvas.width !== waveCanvas.clientWidth || waveCanvas.height !== waveCanvas.clientHeight) {
            waveCanvas.width = waveCanvas.clientWidth;
            waveCanvas.height = waveCanvas.clientHeight;
        }
        
        document.getElementById('slider-dim').oninput = updatePhaseSpaceSim;
        document.getElementById('slider-temp-phase').oninput = updatePhaseSpaceSim;
        document.getElementById('slider-mass').oninput = updatePhaseSpaceSim;
        document.getElementById('slider-dens').oninput = updatePhaseSpaceSim;
        
        updatePhaseSpaceSim();
        if (!waveAnimId) runWaveAnimationLoop();
        renderLatex('eq-lambda-t', "\\lambda_T = \\frac{h}{\\sqrt{2\\pi m k_B T}}");
    } else if (idx === 5) {
        updateDerivationStepB();
    } else if (idx === 6) {
        initAdsorpSimulator();
        
        document.getElementById('slider-temp-ad').oninput = updateAdsorpSimulation;
        document.getElementById('slider-energy-ad').oninput = updateAdsorpSimulation;
        document.getElementById('slider-conc-ad').oninput = updateAdsorpSimulation;
        
        updateAdsorpSimulation();
    } else if (idx === 7) {
        updateDerivationStepC();
        initFractalDrawing();
        animateFractalTree();
    } else if (idx === 8) {
        experimentalData = [];
        isLinearized = false;
        dataFit = null;
        
        document.getElementById('btn-linearize').disabled = true;
        document.getElementById('btn-linearize').textContent = "[ LINEALIZAR LOG ]";
        document.getElementById('btn-fit').disabled = true;
        
        document.getElementById('fit-slope').textContent = "--";
        document.getElementById('fit-df').textContent = "--";
        document.getElementById('fit-formula').textContent = "--";

        const svg = document.getElementById('lab-svg-chart');
        document.getElementById('lab-data-points').innerHTML = '';
        document.getElementById('lab-fit-line').style.display = 'none';
        document.getElementById('lab-chart-hint').textContent = "[ ADQUIERE DATOS DE LA MUESTRA PARA PROCEDER A SU LINEALIZACIÓN Y AJUSTE ]";
        
        const padLeft = 60, padBottom = 60, padRight = 30, padTop = 30;
        const width = 500, height = 350;
        const plotW = width - padLeft - padRight;
        const plotH = height - padTop - padBottom;
        
        let axesContent = `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="#1e222b" stroke-width="1.5" />`;
        axesContent += `<line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#1e222b" stroke-width="1.5" />`;
        
        const xTicks = [150, 200, 250, 300, 350, 400, 450];
        xTicks.forEach(tx => {
            const x = padLeft + ((tx - xMinNorm) / (xMaxNorm - xMinNorm)) * plotW;
            axesContent += `<text x="${x}" y="${height - padBottom + 18}" fill="#8e939d" font-size="8" font-family="'JetBrains Mono', monospace" text-anchor="middle">${tx} K</text>`;
        });
        
        const yTicks = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
        yTicks.forEach(ty => {
            const y = height - padBottom - (ty / 5.0) * plotH;
            axesContent += `<text x="${padLeft - 10}" y="${y + 3}" fill="#8e939d" font-size="8" font-family="'JetBrains Mono', monospace" text-anchor="end">${ty.toFixed(1)}</text>`;
        });
        
        document.getElementById('lab-axes').innerHTML = axesContent;
        document.getElementById('lab-grid-lines').innerHTML = '';
    }
}

// Global initialization
window.onload = () => {
    window.addEventListener('resize', () => {
        if (currentSlideIndex === 2) initMoleculeViewer();
        if (currentSlideIndex === 4) {
            waveCanvas.width = waveCanvas.getBoundingClientRect().width;
            waveCanvas.height = waveCanvas.getBoundingClientRect().height;
            updatePhaseSpaceSim();
        }
        if (currentSlideIndex === 6) {
            adsorpCanvas.width = adsorpCanvas.getBoundingClientRect().width;
            adsorpCanvas.height = adsorpCanvas.getBoundingClientRect().height;
        }
        if (currentSlideIndex === 7) initFractalDrawing();
    });

    // Render LaTeX equations in HTML text elements on load
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.body, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false
        });
    }

    // Hook up sample change in virtual lab
    const selectGel = document.getElementById('select-gel');
    if (selectGel) {
        selectGel.onchange = () => {
            onSlideActivate(8); // Reset lab data and chart
        };
    }

    updateNavigation();
    
    // Start adsorption simulation loop (which ticks when slide 6 is active)
    runAdsorpAnimationLoop();
};
