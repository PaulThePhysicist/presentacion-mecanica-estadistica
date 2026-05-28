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

// Sunlight Mode / High Contrast Toggle Logic
window.isSunlightMode = function() {
    return document.body.classList.contains('sunlight-mode');
};

window.toggleSunlightMode = function() {
    document.body.classList.toggle('sunlight-mode');
    
    // Update toggle button text and visual class
    const btn = document.getElementById('btn-sunlight-mode');
    if (btn) {
        if (document.body.classList.contains('sunlight-mode')) {
            btn.innerHTML = '[ MODO SOL: ON ☀️ ]';
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
        } else {
            btn.innerHTML = '[ MODO SOL: OFF 🌑 ]';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        }
    }
    
    // Redraw current active slide to immediately reflect changes in canvas/simulation
    onSlideActivate(currentSlideIndex);
};

// Keyboard navigation
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }
    if (e.key === 'ArrowRight' || e.key === ' ') {
        nextSlide();
    } else if (e.key === 'ArrowLeft') {
        prevSlide();
    } else if (e.key.toLowerCase() === 's') {
        toggleSunlightMode();
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
                tooltip.style.display = 'block';
                tTitle.textContent = "CABEZA POLAR (HIDROFÍLICA) [SO₄⁻ / COO⁻]";
                tBody.innerHTML = "Grupo iónico cargado eléctricamente. Forma fuertes interacciones dipolo-dipolo y puentes de hidrógeno con las moléculas de agua, creando una capa de hidratación energéticamente favorable que promueve su solubilidad.";
                tooltip.style.borderColor = '#ff5500';
                tooltip.style.left = 'auto';
                tooltip.style.right = '12px';
            } else if (isHoverTail) {
                tooltip.style.display = 'block';
                tTitle.textContent = "COLA APOLAR (HIDROFÓBICA) [-CH₂-(CH₂)₁₀-CH₃]";
                tBody.innerHTML = "Cadena alifática neutra. Al carecer de carga o dipolos, es incapaz de enlazarse con el agua. El efecto hidrofóbico (reorganización entrópica del agua) la repele hacia la interfaz aire-agua o el núcleo micelar.";
                tooltip.style.borderColor = '#ff5500';
                tooltip.style.left = '12px';
                tooltip.style.right = 'auto';
            } else {
                tooltip.style.display = 'none';
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
            <p>Definimos el Hamiltoniano para un gas ideal de $N$ partículas no interactuantes. La energía total es la suma de las contribuciones individuales en $d$ dimensiones:</p>
            <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; margin-top: 4px;">
                <li>Energía cinética traslacional: $\\sum_{j=1}^d p_{ij}^2 / 2m$.</li>
                <li>Potencial de adsorción atractivo y constante: $-\\varepsilon_d$.</li>
                <li>Hamiltoniano total como suma directa de ambos términos.</li>
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
            <p>La función de partición canónica $Z$ se integra sobre el espacio de fases. Al no haber interacciones, la integral de dimensión $dN$ se factoriza como el producto de particiones monoparticulares $z_1$:</p>
            <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; margin-top: 4px;">
                <li>Factor $1/N!$: corrige la indistinguibilidad para evitar la paradoja de Gibbs.</li>
                <li>Escala cuántica $h^{dN}$: dividida en $h^d$ por cada partícula.</li>
                <li>Temperatura inversa: $\\beta = 1/k_B T$.</li>
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
            <p>Desacoplamos las integrales espacial y de momentos gracias a la uniformidad del potencial atractivo:</p>
            <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; margin-top: 4px;">
                <li>Posición: da el volumen accesible $V_d$.</li>
                <li>Momentos: integrales gaussianas en función de la longitud térmica $\\lambda_T$.</li>
                <li>$\\lambda_T = h / \\sqrt{2\\pi m k_B T}$ agrupa los efectos térmico-cuánticos.</li>
            </ul>
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
            <p>Calculamos la energía de Helmholtz via $F = -k_B T \\ln Z$. Usando la aproximación de Stirling $\\ln N! \\approx N \\ln N - N$ en el límite termodinámico ($N \\gg 1$), simplificamos la expresión para obtener la forma final de $F$.</p>
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
            <p>El potencial químico $\\mu_d$ es la variación de la energía libre con respecto al número de partículas: $\\mu_d = \\left.\\frac{\\partial F}{\\partial N}\\right|_{T, V_d}$.</p>
            <p>Derivando la expresión de Helmholtz término a término e introduciendo la densidad numérica $n_d = N / V_d$, obtenemos el potencial químico del sistema.</p>
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
    
    // Remove active class from all brain buttons
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
            <p>En equilibrio termodinámico, el libre intercambio de moléculas entre el seno de la solución (3D) y la superficie (2D) anula cualquier flujo neto de materia.</p>
            <p>Esto exige la igualdad de potenciales químicos entre ambas fases:</p>
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
            <p>Aplicamos $\\mu_d = -\\varepsilon_d + k_BT\\ln(n_d\\lambda_T^d)$ del literal (a) a cada fase:</p>
            <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; margin-top: 4px;">
                <li>Solución (3D): $d=3$, densidad $n$, sin potencial atractivo ($\\varepsilon_3 = 0$).</li>
                <li>Superficie (2D): $d=2$, densidad $n_2$, potencial atractivo $-\\varepsilon_0$.</li>
            </ul>
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
            <p>Para despejar la densidad superficial $n_2$, dividimos por $k_B T$ y agrupamos los logaritmos. Aplicando la exponencial, obtenemos el cociente de equilibrio:</p>
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
            <p>La relación final refleja la competencia de dos efectos termodinámicos:</p>
            <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; margin-top: 4px;">
                <li><strong>Afinidad energética:</strong> El factor de Boltzmann $e^{\\varepsilon_0/k_BT}$ promueve el confinamiento en la interfaz.</li>
                <li><strong>Dispersión entrópica:</strong> A alta $T$, la longitud térmica $\\lambda_T \\propto T^{-1/2}$ decrece, favoreciendo la agitación y dispersión en el volumen 3D.</li>
            </ul>
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
            <p>Establecemos las expresiones para la densidad adsorbida en sustratos de dimensiones distintas en equilibrio con la misma solución 3D:</p>
            <ul style="padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; margin-top: 4px;">
                <li>Gel poroso: dimensión fractal $d_f$, energía de adsorción $\\varepsilon_f$.</li>
                <li>Polímeros lineales: geometría unidimensional ($d=1$), energía $\\varepsilon_1$.</li>
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
            <p>Para independizar la medida de la concentración volumétrica $n$ (difícil de medir), calculamos la relación de adsorción relativa $n_{d_f}/n_1$.</p>
            <p>Al dividir ambas expresiones, la densidad $n$ se cancela y agrupamos las potencias de la longitud de onda térmica $\\lambda_T$:</p>
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
            <p>Tomando logaritmo natural e introduciendo la dependencia térmica $\\lambda_T \\propto T^{-1/2}$, linealizamos la relación para obtener una ecuación de ajuste:</p>
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
            <p>La relación tiene la forma lineal $y = m \\cdot x + C$ con $x = \\ln T$. Graficando $\\ln(n_{d_f}/n_1)$ frente a $\\ln T$, la pendiente $m$ determina la dimensión fractal:</p>
            $$m = \\frac{d_f - 1}{2} \\implies d_f = 1 + 2m$$
            <p>Esto permite usar la temperatura como sonda geométrica directa para caracterizar el gel de forma no invasiva.</p>
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
const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

let waveAnimId = null;

function runWaveAnimationLoop() {
    if (waveCanvas && currentSlideIndex === 4) {
        updatePhaseSpaceSim();
        waveAnimId = requestAnimationFrame(runWaveAnimationLoop);
    } else {
        waveAnimId = null;
    }
}

function updatePhaseSpaceSim() {
    if (!waveCanvas) return;
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
// ----------------------------------------------------
// Slide 6: Live Adsorp Simulator (Orange Workstation style)
// ----------------------------------------------------
const adsorpCanvas = document.getElementById('adsorption-canvas');
const adsorpCtx = adsorpCanvas ? adsorpCanvas.getContext('2d') : null;
let adsorpParticles = [];
const targetParticleCount = 80;

// Premium FX globals for Slide 6
let adsorpThermalPulse = { x: 0, y: 0, radius: 0, maxRadius: 110, active: false };
let adsorpEffects = [];

function handleAdsorpCanvasClick(e) {
    if (!adsorpCanvas) return;
    const rect = adsorpCanvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * adsorpCanvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * adsorpCanvas.height;
    
    // Trigger thermal pulse
    adsorpThermalPulse = {
        x: x,
        y: y,
        radius: 0,
        maxRadius: 110,
        active: true
    };
}

function initAdsorpSimulator() {
    if (!adsorpCanvas) return;
    const rect = adsorpCanvas.getBoundingClientRect();
    adsorpCanvas.width = rect.width;
    adsorpCanvas.height = rect.height;

    // Reset Premium FX globals
    adsorpThermalPulse = { x: 0, y: 0, radius: 0, maxRadius: 110, active: false };
    adsorpEffects = [];

    adsorpParticles = [];
    for (let i = 0; i < targetParticleCount; i++) {
        adsorpParticles.push({
            x: Math.random() * adsorpCanvas.width,
            y: adsorpCanvas.height * 0.4 + Math.random() * (adsorpCanvas.height * 0.55),
            vx: (Math.random() - 0.5) * 1.4,
            vy: (Math.random() - 0.5) * 1.4,
            radius: 2.5,
            state: 'bulk', 
            color: '#8e939d',
            trail: []
        });
    }

    // Safely attach canvas click listener once
    if (!adsorpCanvas.dataset.hasListener) {
        adsorpCanvas.addEventListener('mousedown', handleAdsorpCanvasClick);
        adsorpCanvas.dataset.hasListener = "true";
    }
}

function updateAdsorpSimulation() {
    if (!adsorpCanvas || !adsorpCtx) return;

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

    // Update and expand click thermal pulse
    if (adsorpThermalPulse.active) {
        adsorpThermalPulse.radius += 5;
        if (adsorpThermalPulse.radius > adsorpThermalPulse.maxRadius) {
            adsorpThermalPulse.active = false;
        }
    }

    // Update effect ripples
    adsorpEffects.forEach(fx => {
        fx.radius += 1.5;
        fx.alpha -= 0.04;
    });
    adsorpEffects = adsorpEffects.filter(fx => fx.alpha > 0);

    adsorpParticles.forEach(p => {
        if (!p.trail) p.trail = [];

        if (p.state === 'bulk') {
            p.x += p.vx + (Math.random() - 0.5) * 0.4;
            p.y += p.vy + (Math.random() - 0.5) * 0.4;

            // Push away from click thermal pulse
            if (adsorpThermalPulse.active) {
                const dx = p.x - adsorpThermalPulse.x;
                const dy = p.y - adsorpThermalPulse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < adsorpThermalPulse.radius && dist > adsorpThermalPulse.radius - 16) {
                    const angle = Math.atan2(dy, dx);
                    p.vx += Math.cos(angle) * 1.5;
                    p.vy += Math.sin(angle) * 1.5;
                }
            }

            if (p.x < 4 || p.x > adsorpCanvas.width - 4) p.vx *= -1;
            if (p.y > adsorpCanvas.height - 8) p.vy *= -1;

            if (p.y <= interfaceY + 2) {
                if (Math.random() < P_adsorb) {
                    p.state = 'surface';
                    p.y = interfaceY - 2;
                    p.color = '#ff5500'; // Safety orange for adsorbed
                    p.trail = []; // reset trail

                    // Trigger capture effect ripple!
                    adsorpEffects.push({
                        x: p.x,
                        y: interfaceY,
                        radius: 2,
                        maxRadius: 18,
                        alpha: 1.0,
                        type: 'capture'
                    });
                } else {
                    p.vy *= -1;
                    p.y = interfaceY + 4;
                }
            }

            p.x = Math.max(4, Math.min(adsorpCanvas.width - 4, p.x));
            p.y = Math.max(interfaceY + 2, Math.min(adsorpCanvas.height - 8, p.y));

            // Update trails
            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > 6) {
                p.trail.shift();
            }

        } else if (p.state === 'surface') {
            p.x += (Math.random() - 0.5) * 0.6;
            if (p.x < 4 || p.x > adsorpCanvas.width - 4) p.x = Math.max(4, Math.min(adsorpCanvas.width - 4, p.x));

            // Jitter for adsorbed particles
            if (p.trail && p.trail.length > 0) {
                p.trail.shift();
            }

            // Check for thermal desorption (Arrhenius or user click thermal pulse)
            let desorbTriggered = Math.random() < P_desorb;

            if (adsorpThermalPulse.active) {
                const dx = p.x - adsorpThermalPulse.x;
                const dy = interfaceY - adsorpThermalPulse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < adsorpThermalPulse.radius && dist > adsorpThermalPulse.radius - 16) {
                    desorbTriggered = true;
                }
            }

            if (desorbTriggered) {
                p.state = 'bulk';
                p.y = interfaceY + 4;
                
                // Outward kick
                let angle = 0.4 + Math.random() * (Math.PI - 0.8); // general downward angle
                let kickSpeed = 1.0 + Math.random();
                
                if (adsorpThermalPulse.active) {
                    const dx = p.x - adsorpThermalPulse.x;
                    const dy = interfaceY - adsorpThermalPulse.y;
                    angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.3;
                    kickSpeed = 2.0 + Math.random() * 1.5;
                }
                
                p.vy = Math.sin(angle) * kickSpeed; 
                p.vx = Math.cos(angle) * kickSpeed;
                p.color = '#8e939d'; // slate grey
                p.trail = [];
            }
        }
    });

    adsorpCtx.clearRect(0, 0, adsorpCanvas.width, adsorpCanvas.height);
    const isSun = window.isSunlightMode();

    // Draw Solution (bulk) background - subtle slate
    adsorpCtx.fillStyle = isSun ? 'rgba(0, 0, 0, 0.005)' : 'rgba(255, 255, 255, 0.005)';
    adsorpCtx.fillRect(0, interfaceY, adsorpCanvas.width, adsorpCanvas.height - interfaceY);

    // Draw interface grid lines
    adsorpCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.015)';
    adsorpCtx.lineWidth = 1;
    for (let x = 20; x < adsorpCanvas.width; x += 20) {
        adsorpCtx.beginPath();
        adsorpCtx.moveTo(x, interfaceY);
        adsorpCtx.lineTo(x, adsorpCanvas.height);
        adsorpCtx.stroke();
    }

    // Draw target crosshairs in the corners (Premium HUD)
    const margin = 10;
    const len = 6;
    adsorpCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.15)';
    adsorpCtx.lineWidth = 1;
    const corners = [
        { x: margin, y: margin, dx: 1, dy: 1 },
        { x: adsorpCanvas.width - margin, y: margin, dx: -1, dy: 1 },
        { x: margin, y: adsorpCanvas.height - margin, dx: 1, dy: -1 },
        { x: adsorpCanvas.width - margin, y: adsorpCanvas.height - margin, dx: -1, dy: -1 }
    ];
    corners.forEach(c => {
        adsorpCtx.beginPath();
        adsorpCtx.moveTo(c.x, c.y + c.dy * len);
        adsorpCtx.lineTo(c.x, c.y);
        adsorpCtx.lineTo(c.x + c.dx * len, c.y);
        adsorpCtx.stroke();
    });

    // Draw interactive thermal shockwave
    if (adsorpThermalPulse.active) {
        adsorpCtx.beginPath();
        adsorpCtx.arc(adsorpThermalPulse.x, adsorpThermalPulse.y, adsorpThermalPulse.radius, 0, Math.PI * 2);
        const alpha = 1.0 - (adsorpThermalPulse.radius / adsorpThermalPulse.maxRadius);
        adsorpCtx.strokeStyle = isSun ? `rgba(204, 51, 0, ${alpha * 0.8})` : `rgba(255, 85, 0, ${alpha * 0.8})`;
        adsorpCtx.lineWidth = 3.5;
        
        if (!isSun) {
            adsorpCtx.shadowColor = '#ff5500';
            adsorpCtx.shadowBlur = 12;
        }
        adsorpCtx.stroke();
        adsorpCtx.shadowBlur = 0;
    }

    // Draw effect ripples (capture)
    adsorpCtx.lineWidth = 1.0;
    adsorpEffects.forEach(fx => {
        adsorpCtx.beginPath();
        adsorpCtx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
        adsorpCtx.strokeStyle = isSun ? `rgba(0, 102, 204, ${fx.alpha})` : `rgba(0, 255, 255, ${fx.alpha})`;
        adsorpCtx.stroke();
    });

    // Draw micro adsorption site notches along the surface interface line
    adsorpCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    adsorpCtx.lineWidth = 1;
    for (let sx = 10; sx < adsorpCanvas.width; sx += 15) {
        adsorpCtx.beginPath();
        adsorpCtx.moveTo(sx, interfaceY - 4);
        adsorpCtx.lineTo(sx, interfaceY + 2);
        adsorpCtx.stroke();
    }

    // Draw surface interface line (double-layered glowing Orange line)
    adsorpCtx.beginPath();
    adsorpCtx.moveTo(0, interfaceY);
    adsorpCtx.lineTo(adsorpCanvas.width, interfaceY);
    adsorpCtx.strokeStyle = isSun ? 'rgba(204, 51, 0, 0.15)' : 'rgba(255, 85, 0, 0.25)';
    adsorpCtx.lineWidth = 5;
    adsorpCtx.stroke();

    adsorpCtx.beginPath();
    adsorpCtx.moveTo(0, interfaceY);
    adsorpCtx.lineTo(adsorpCanvas.width, interfaceY);
    adsorpCtx.strokeStyle = isSun ? '#cc3300' : '#ff5500';
    adsorpCtx.lineWidth = 1.8;
    adsorpCtx.stroke();

    // Draw particles
    adsorpParticles.forEach(p => {
        if (p.state === 'bulk') {
            // Draw trail
            if (p.trail && p.trail.length > 1) {
                adsorpCtx.beginPath();
                adsorpCtx.moveTo(p.trail[0].x, p.trail[0].y);
                for (let j = 1; j < p.trail.length; j++) {
                    adsorpCtx.lineTo(p.trail[j].x, p.trail[j].y);
                }
                adsorpCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';
                adsorpCtx.lineWidth = 1.5;
                adsorpCtx.lineCap = 'round';
                adsorpCtx.lineJoin = 'round';
                adsorpCtx.stroke();
            }

            // Draw core
            adsorpCtx.beginPath();
            adsorpCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            adsorpCtx.fillStyle = isSun ? '#475569' : '#8e939d';
            adsorpCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';
            adsorpCtx.lineWidth = 1.0;
            adsorpCtx.fill();
            adsorpCtx.stroke();
        } else {
            // Adsorbed: trapped crosshair + glow core
            const jitterRange = 0.05 * Math.sqrt(T);
            const jitterX = (Math.random() - 0.5) * jitterRange;
            const finalX = p.x + jitterX;
            const finalY = interfaceY - 2;

            adsorpCtx.beginPath();
            adsorpCtx.arc(finalX, finalY, 5.5, 0, Math.PI * 2);
            adsorpCtx.strokeStyle = isSun ? 'rgba(204, 51, 0, 0.25)' : 'rgba(255, 85, 0, 0.35)';
            adsorpCtx.lineWidth = 0.8;
            adsorpCtx.stroke();

            adsorpCtx.beginPath();
            adsorpCtx.arc(finalX, finalY, p.radius + 0.5, 0, Math.PI * 2);
            adsorpCtx.fillStyle = isSun ? '#cc3300' : '#ff5500';
            adsorpCtx.strokeStyle = '#ffffff';
            adsorpCtx.lineWidth = 1;
            
            if (!isSun) {
                adsorpCtx.shadowColor = '#ff5500';
                adsorpCtx.shadowBlur = 6;
            }
            adsorpCtx.fill();
            adsorpCtx.stroke();
            adsorpCtx.shadowBlur = 0; // reset
        }
    });

    // Compute empirical stats
    const surfaceCount = adsorpParticles.filter(p => p.state === 'surface').length;
    const n2_measured = surfaceCount * 0.008;
    const ratio_measured = n2_measured / n;

    document.getElementById('val-stat-n2').innerHTML = `${n2_measured.toFixed(4)} nm<sup>-2</sup>`;
    document.getElementById('val-stat-ratio').innerHTML = `${ratio_measured.toFixed(3)} nm`;

    // Dynamic HUD overlays inside the canvas
    const telemetryY = adsorpCanvas.height - 12;
    adsorpCtx.fillStyle = isSun ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.3)';
    adsorpCtx.font = '8px "JetBrains Mono", monospace';
    adsorpCtx.textAlign = 'left';
    adsorpCtx.fillText(`BINDING_AFFINITY (\u03b5_0): ${(E0 * 1000).toFixed(0)} meV`, 15, telemetryY);

    const activeGamma = Math.max(10.0, 72.8 - (n2_measured * 150)); // Simulated tension gamma = gamma0 - Pi
    adsorpCtx.textAlign = 'right';
    adsorpCtx.fillText(`SURF_TENSION (\u03b3): ${activeGamma.toFixed(1)} mN/m`, adsorpCanvas.width - 15, telemetryY);

    // Re-draw analytical SVG curve
    drawAdsorptionCurve(n, E0, T, m_mol);
}

function drawAdsorptionCurve(n, E0, currentT, m_mol) {
    const svg = document.getElementById('adsorption-svg-chart');
    if (!svg) return;
    const width = 400;
    const height = 200;
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
    const isSun = window.isSunlightMode();

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

    // Draw grid lines inside chart (Premium dashed lines)
    const gridTicksY = [maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];
    gridTicksY.forEach(val => {
        const y = height - paddingBottom - (val / maxVal) * plotH;
        svgContent += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="${isSun ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)'}" stroke-dasharray="2 3" stroke-width="1" />`;
    });

    const gridTicksX = [200, 300, 400, 500];
    gridTicksX.forEach(temp => {
        const x = paddingLeft + ((temp - minT) / (maxT - minT)) * plotW;
        svgContent += `<line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${height - paddingBottom}" stroke="${isSun ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)'}" stroke-dasharray="2 3" stroke-width="1" />`;
    });
    
    // Draw axes
    const axisColor = isSun ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)';
    svgContent += `<line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}" stroke="${axisColor}" stroke-width="1" />`;
    svgContent += `<line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="${axisColor}" stroke-width="1" />`;

    // Build path for curve & gradient fill
    let dPath = '';
    let fillPath = `M ${paddingLeft} ${height - paddingBottom}`;
    points.forEach((p, idx) => {
        const x = paddingLeft + ((p.t - minT) / (maxT - minT)) * plotW;
        const y = height - paddingBottom - (p.v / maxVal) * plotH;
        if (idx === 0) dPath += `M ${x} ${y}`;
        else dPath += ` L ${x} ${y}`;
        fillPath += ` L ${x} ${y}`;
    });
    fillPath += ` L ${paddingLeft + plotW} ${height - paddingBottom} Z`;

    // Define gradients
    svgContent += `
    <defs>
        <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ff5500" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="#ff5500" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="curveGradientSun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#cc3300" stop-opacity="0.15"/>
            <stop offset="100%" stop-color="#cc3300" stop-opacity="0.0"/>
        </linearGradient>
    </defs>
    `;

    const gradientId = isSun ? 'curveGradientSun' : 'curveGradient';
    svgContent += `<path d="${fillPath}" fill="url(#${gradientId})" />`;
    svgContent += `<path d="${dPath}" fill="none" stroke="${isSun ? '#cc3300' : '#ff5500'}" stroke-width="1.8" />`;

    // Current temp marker (Leica style: white dot with orange glow ring)
    const curX = paddingLeft + ((currentT - minT) / (maxT - minT)) * plotW;
    const curN2 = calcN2(currentT);
    const curY = height - paddingBottom - (curN2 / maxVal) * plotH;

    if (!isNaN(curY) && isFinite(curY)) {
        svgContent += `<circle cx="${curX}" cy="${curY}" r="7" fill="none" stroke="${isSun ? '#cc3300' : '#ff5500'}" stroke-width="1.2" opacity="0.6" />`;
        svgContent += `<circle cx="${curX}" cy="${curY}" r="3.2" fill="#ffffff" stroke="${isSun ? '#cc3300' : '#ff5500'}" stroke-width="2" />`;
    }

    // Y Axis labels
    svgContent += `<text x="${paddingLeft - 8}" y="${paddingTop + 5}" fill="#4e535e" font-size="7.5" font-family="'JetBrains Mono', monospace" text-anchor="end">${maxVal.toFixed(2)}</text>`;
    svgContent += `<text x="${paddingLeft - 8}" y="${height - paddingBottom}" fill="#4e535e" font-size="7.5" font-family="'JetBrains Mono', monospace" text-anchor="end">0.0</text>`;
    
    // X Axis labels
    svgContent += `<text x="${paddingLeft}" y="${height - paddingBottom + 12}" fill="#4e535e" font-size="7.5" font-family="'JetBrains Mono', monospace" text-anchor="middle">100K</text>`;
    svgContent += `<text x="${paddingLeft + plotW}" y="${height - paddingBottom + 12}" fill="#4e535e" font-size="7.5" font-family="'JetBrains Mono', monospace" text-anchor="middle">600K</text>`;
    
    svg.innerHTML = svgContent;
}

function runAdsorpAnimationLoop() {
    if (currentSlideIndex === 5) {
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
const fractalCtx = fractalCanvas ? fractalCanvas.getContext('2d') : null;

function initFractalDrawing() {
    if (!fractalCanvas) return;
    const rect = fractalCanvas.getBoundingClientRect();
    fractalCanvas.width = rect.width;
    fractalCanvas.height = rect.height;
}

function drawFractalTree(x, y, len, angle, branchWidth, depth) {
    if (!fractalCtx) return;
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
    if (currentSlideIndex !== 6) return;
    if (!fractalCanvas || !fractalCtx) return;
    
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
// Slide 8: Interactive Fractal Adsorption Simulator
// ----------------------------------------------------
let fractalSimCanvas = null;
let fractalSimCtx = null;
let fractalSimSegments = [];
let fractalSimParticles = [];
let fractalSimAnimId = null;
const FRACTAL_SIM_PARTICLE_COUNT = 50;

// Premium FX global variables
let fractalAdsorptionHistory = [];
let fractalThermalPulse = { x: 0, y: 0, radius: 0, maxRadius: 110, active: false };

function handleFractalCanvasClick(e) {
    if (!fractalSimCanvas) return;
    const rect = fractalSimCanvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * fractalSimCanvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * fractalSimCanvas.height;
    
    // Trigger thermal pulse
    fractalThermalPulse = {
        x: x,
        y: y,
        radius: 0,
        maxRadius: 110,
        active: true
    };
}

function initFractalSim() {
    fractalSimCanvas = document.getElementById('fractal-sim-canvas');
    if (!fractalSimCanvas) return;
    fractalSimCtx = fractalSimCanvas.getContext('2d');
    
    resizeFractalSimCanvas();
    
    // Reset Premium FX globals
    fractalAdsorptionHistory = [];
    fractalThermalPulse = { x: 0, y: 0, radius: 0, maxRadius: 110, active: false };
    
    // Create particles
    fractalSimParticles = [];
    for (let i = 0; i < FRACTAL_SIM_PARTICLE_COUNT; i++) {
        fractalSimParticles.push({
            x: Math.random() * fractalSimCanvas.width,
            y: Math.random() * (fractalSimCanvas.height - 40) + 20,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            isAdsorbed: false,
            adsorbedSeg: null,
            snapX: 0,
            snapY: 0,
            trail: []
        });
    }
    
    // Safely attach canvas listener once
    if (!fractalSimCanvas.dataset.hasListener) {
        fractalSimCanvas.addEventListener('mousedown', handleFractalCanvasClick);
        fractalSimCanvas.dataset.hasListener = "true";
    }
    
    updateFractalSimParams();
}

function resizeFractalSimCanvas() {
    if (!fractalSimCanvas) return;
    const rect = fractalSimCanvas.getBoundingClientRect();
    fractalSimCanvas.width = rect.width;
    fractalSimCanvas.height = rect.height;
}

function updateFractalSimParams() {
    if (!fractalSimCanvas) return;
    
    const depth = parseInt(document.getElementById('slider-fractal-depth').value);
    const r = parseFloat(document.getElementById('slider-fractal-ratio').value);
    const N = parseInt(document.getElementById('slider-fractal-branches').value);
    const T = parseFloat(document.getElementById('slider-fractal-temp').value);
    
    // Update labels
    document.getElementById('val-fractal-depth').textContent = depth;
    document.getElementById('val-fractal-ratio').textContent = r.toFixed(2);
    document.getElementById('val-fractal-branches').textContent = N;
    document.getElementById('val-fractal-temp').textContent = T;
    
    // Calculate fractal dimension df = ln(N) / ln(1/r)
    const df = Math.log(N) / Math.log(1 / r);
    document.getElementById('val-fractal-df').textContent = df.toFixed(2);
    
    // Generate segments
    fractalSimSegments = [];
    const startX = fractalSimCanvas.width / 2;
    const startY = fractalSimCanvas.height - 20;
    
    // We want the tree to fit within the canvas height
    const totalTarget = fractalSimCanvas.height * 0.65;
    const initialLen = totalTarget * (1 - r);
    
    generateSimFractalSegments(startX, startY, initialLen, -Math.PI / 2, 4.0, 1, N, r, depth);
    
    // Calculate total length (surface area)
    let totalLength = 0;
    fractalSimSegments.forEach(seg => {
        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
        totalLength += Math.sqrt(dx * dx + dy * dy);
    });
    
    // Scale length to physical units (nm), let's say 1 pixel = 0.05 nm
    const physicalArea = totalLength * 0.05;
    document.getElementById('val-fractal-area').textContent = `${physicalArea.toFixed(1)} nm`;
    
    // Re-check existing adsorbed particles to see if their segments still exist.
    fractalSimParticles.forEach(p => {
        if (p.isAdsorbed) {
            p.isAdsorbed = false;
            p.adsorbedSeg = null;
        }
    });
}

function generateSimFractalSegments(x, y, len, angle, branchWidth, depth, N, r, maxDepth) {
    if (depth > maxDepth) return;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    
    fractalSimSegments.push({
        id: fractalSimSegments.length,
        x1: x,
        y1: y,
        x2: x2,
        y2: y2,
        width: branchWidth,
        depth: depth
    });
    
    if (N === 2) {
        generateSimFractalSegments(x2, y2, len * r, angle - 0.42, branchWidth * 0.75, depth + 1, N, r, maxDepth);
        generateSimFractalSegments(x2, y2, len * r, angle + 0.42, branchWidth * 0.75, depth + 1, N, r, maxDepth);
    } else {
        generateSimFractalSegments(x2, y2, len * r, angle - 0.48, branchWidth * 0.75, depth + 1, N, r, maxDepth);
        generateSimFractalSegments(x2, y2, len * r, angle, branchWidth * 0.75, depth + 1, N, r, maxDepth);
        generateSimFractalSegments(x2, y2, len * r, angle + 0.48, branchWidth * 0.75, depth + 1, N, r, maxDepth);
    }
}

function runFractalSimLoop() {
    if (currentSlideIndex === 7) {
        updateFractalSimulation();
    }
    requestAnimationFrame(runFractalSimLoop);
}

function updateFractalSimulation() {
    if (!fractalSimCanvas || !fractalSimCtx) return;
    
    const isSun = window.isSunlightMode();
    const T = parseFloat(document.getElementById('slider-fractal-temp').value);
    
    // Clear canvas
    fractalSimCtx.clearRect(0, 0, fractalSimCanvas.width, fractalSimCanvas.height);
    
    // Draw background tech grid
    fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.015)';
    fractalSimCtx.lineWidth = 1;
    for (let x = 20; x < fractalSimCanvas.width; x += 20) {
        fractalSimCtx.beginPath();
        fractalSimCtx.moveTo(x, 0);
        fractalSimCtx.lineTo(x, fractalSimCanvas.height);
        fractalSimCtx.stroke();
    }
    for (let y = 20; y < fractalSimCanvas.height; y += 20) {
        fractalSimCtx.beginPath();
        fractalSimCtx.moveTo(0, y);
        fractalSimCtx.lineTo(fractalSimCanvas.width, y);
        fractalSimCtx.stroke();
    }
    
    // Draw target crosshairs in the corners (Premium HUD)
    const margin = 10;
    const len = 6;
    fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.15)';
    fractalSimCtx.lineWidth = 1;
    const corners = [
        { x: margin, y: margin, dx: 1, dy: 1 },
        { x: fractalSimCanvas.width - margin, y: margin, dx: -1, dy: 1 },
        { x: margin, y: fractalSimCanvas.height - margin, dx: 1, dy: -1 },
        { x: fractalSimCanvas.width - margin, y: fractalSimCanvas.height - margin, dx: -1, dy: -1 }
    ];
    corners.forEach(c => {
        fractalSimCtx.beginPath();
        fractalSimCtx.moveTo(c.x, c.y + c.dy * len);
        fractalSimCtx.lineTo(c.x, c.y);
        fractalSimCtx.lineTo(c.x + c.dx * len, c.y);
        fractalSimCtx.stroke();
    });
    
    // Process and draw the interactive thermal shockwave
    if (fractalThermalPulse.active) {
        fractalThermalPulse.radius += 5; // Expand wavefront
        if (fractalThermalPulse.radius > fractalThermalPulse.maxRadius) {
            fractalThermalPulse.active = false;
        } else {
            fractalSimCtx.beginPath();
            fractalSimCtx.arc(fractalThermalPulse.x, fractalThermalPulse.y, fractalThermalPulse.radius, 0, Math.PI * 2);
            const alpha = 1.0 - (fractalThermalPulse.radius / fractalThermalPulse.maxRadius);
            fractalSimCtx.strokeStyle = isSun ? `rgba(204, 51, 0, ${alpha * 0.8})` : `rgba(255, 85, 0, ${alpha * 0.8})`;
            fractalSimCtx.lineWidth = 3.5;
            
            if (!isSun) {
                fractalSimCtx.shadowColor = '#ff5500';
                fractalSimCtx.shadowBlur = 12;
            }
            fractalSimCtx.stroke();
            fractalSimCtx.shadowBlur = 0; // Reset
        }
    }
    
    // Count adsorbed particles on each segment
    const segmentAdsorptionCount = {};
    fractalSimSegments.forEach(seg => {
        segmentAdsorptionCount[seg.id] = 0;
    });
    
    fractalSimParticles.forEach(p => {
        if (p.isAdsorbed && p.adsorbedSeg) {
            segmentAdsorptionCount[p.adsorbedSeg.id] = (segmentAdsorptionCount[p.adsorbedSeg.id] || 0) + 1;
        }
    });
    
    // Render fractal segments (double-layered for premium glow)
    fractalSimSegments.forEach(seg => {
        const count = segmentAdsorptionCount[seg.id] || 0;
        
        fractalSimCtx.beginPath();
        fractalSimCtx.moveTo(seg.x1, seg.y1);
        fractalSimCtx.lineTo(seg.x2, seg.y2);
        
        if (count > 0) {
            // Glow layer
            fractalSimCtx.strokeStyle = isSun ? `rgba(204, 51, 0, 0.2)` : `rgba(255, 85, 0, 0.25)`;
            fractalSimCtx.lineWidth = seg.width + 4;
            fractalSimCtx.stroke();
            
            // Core layer
            fractalSimCtx.beginPath();
            fractalSimCtx.moveTo(seg.x1, seg.y1);
            fractalSimCtx.lineTo(seg.x2, seg.y2);
            fractalSimCtx.strokeStyle = isSun ? '#cc3300' : '#ff7733';
            fractalSimCtx.lineWidth = seg.width;
            fractalSimCtx.stroke();
        } else {
            // Empty segment
            fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.15)' : 'rgba(78, 83, 94, 0.25)';
            fractalSimCtx.lineWidth = seg.width;
            fractalSimCtx.stroke();
        }
    });
    
    // Render junction nodes at branchings
    fractalSimSegments.forEach(seg => {
        const count = segmentAdsorptionCount[seg.id] || 0;
        
        fractalSimCtx.beginPath();
        fractalSimCtx.arc(seg.x2, seg.y2, Math.max(1.8, seg.width * 0.9), 0, Math.PI * 2);
        
        if (count > 0) {
            fractalSimCtx.fillStyle = isSun ? '#ffffff' : '#ff9955';
            fractalSimCtx.strokeStyle = isSun ? '#cc3300' : '#ff5500';
            fractalSimCtx.lineWidth = 1.5;
            fractalSimCtx.fill();
            fractalSimCtx.stroke();
        } else {
            fractalSimCtx.fillStyle = isSun ? '#f5f6f8' : '#1e222b';
            fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.25)' : 'rgba(78, 83, 94, 0.5)';
            fractalSimCtx.lineWidth = 1;
            fractalSimCtx.fill();
            fractalSimCtx.stroke();
        }
    });
    
    // Draw base root node
    if (fractalSimSegments.length > 0) {
        const root = fractalSimSegments[0];
        fractalSimCtx.beginPath();
        fractalSimCtx.arc(root.x1, root.y1, 4, 0, Math.PI * 2);
        fractalSimCtx.fillStyle = isSun ? '#f5f6f8' : '#1e222b';
        fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.3)' : 'rgba(78, 83, 94, 0.6)';
        fractalSimCtx.lineWidth = 1.5;
        fractalSimCtx.fill();
        fractalSimCtx.stroke();
    }
    
    // Physics values
    const velocityScale = 0.08 * Math.sqrt(T);
    const pDesorb = 0.0003 * T * Math.exp(-120 / T);
    
    let adsorbedCount = 0;
    
    // Update and draw particles
    fractalSimParticles.forEach(p => {
        if (p.isAdsorbed) {
            adsorbedCount++;
            
            // Check for thermal desorption (either random or triggered by click wave)
            let desorbTriggered = Math.random() < pDesorb;
            
            if (fractalThermalPulse.active) {
                const dx = p.snapX - fractalThermalPulse.x;
                const dy = p.snapY - fractalThermalPulse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                // Within expanding wave front
                if (dist < fractalThermalPulse.radius && dist > fractalThermalPulse.radius - 16) {
                    desorbTriggered = true;
                }
            }
            
            if (desorbTriggered) {
                p.isAdsorbed = false;
                p.adsorbedSeg = null;
                // Outward kick from segment or wave
                let angle = Math.random() * Math.PI * 2;
                let kickSpeed = 1.5;
                
                if (fractalThermalPulse.active) {
                    const dx = p.snapX - fractalThermalPulse.x;
                    const dy = p.snapY - fractalThermalPulse.y;
                    angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
                    kickSpeed = 2.5 + Math.random() * 1.5;
                }
                
                p.vx = Math.cos(angle) * kickSpeed;
                p.vy = Math.sin(angle) * kickSpeed;
                p.x = p.snapX + Math.cos(angle) * 5;
                p.y = p.snapY + Math.sin(angle) * 5;
                p.trail = []; // reset trail for clean flight
            } else {
                // Particle remains adsorbed (vibrates gently)
                const jitterRange = 0.08 * Math.sqrt(T);
                const jitterX = (Math.random() - 0.5) * jitterRange;
                const jitterY = (Math.random() - 0.5) * jitterRange;
                const finalX = p.snapX + jitterX;
                const finalY = p.snapY + jitterY;
                
                if (p.trail && p.trail.length > 0) {
                    p.trail.shift(); // fade trail while bound
                }
                
                // Trapped confinement crosshair
                fractalSimCtx.beginPath();
                fractalSimCtx.arc(finalX, finalY, 5.5, 0, Math.PI * 2);
                fractalSimCtx.strokeStyle = isSun ? 'rgba(204, 51, 0, 0.25)' : 'rgba(255, 85, 0, 0.35)';
                fractalSimCtx.lineWidth = 0.8;
                fractalSimCtx.stroke();
                
                // Draw particle (glowing orange core)
                fractalSimCtx.beginPath();
                fractalSimCtx.arc(finalX, finalY, 3.2, 0, Math.PI * 2);
                fractalSimCtx.fillStyle = isSun ? '#cc3300' : '#ff5500';
                fractalSimCtx.strokeStyle = '#ffffff';
                fractalSimCtx.lineWidth = 1;
                
                if (!isSun) {
                    fractalSimCtx.shadowColor = '#ff5500';
                    fractalSimCtx.shadowBlur = 6;
                }
                fractalSimCtx.fill();
                fractalSimCtx.stroke();
                fractalSimCtx.shadowBlur = 0; // reset
            }
        } else {
            // Free particle: Brownian motion
            p.vx += (Math.random() - 0.5) * 0.4;
            p.vy += (Math.random() - 0.5) * 0.4;
            
            // Accel away from thermal shockwave
            if (fractalThermalPulse.active) {
                const dx = p.x - fractalThermalPulse.x;
                const dy = p.y - fractalThermalPulse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < fractalThermalPulse.radius && dist > fractalThermalPulse.radius - 16) {
                    const angle = Math.atan2(dy, dx);
                    p.vx += Math.cos(angle) * 2.0;
                    p.vy += Math.sin(angle) * 2.0;
                }
            }
            
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (speed > 0) {
                p.vx = (p.vx / speed) * velocityScale;
                p.vy = (p.vy / speed) * velocityScale;
            }
            
            p.x += p.vx;
            p.y += p.vy;
            
            // Boundary collisions
            if (p.x < 5) { p.x = 5; p.vx *= -1; }
            if (p.x > fractalSimCanvas.width - 5) { p.x = fractalSimCanvas.width - 5; p.vx *= -1; }
            if (p.y < 5) { p.y = 5; p.vy *= -1; }
            if (p.y > fractalSimCanvas.height - 5) { p.y = fractalSimCanvas.height - 5; p.vy *= -1; }
            
            // Update trail
            if (!p.trail) p.trail = [];
            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > 7) {
                p.trail.shift();
            }
            
            // Check collision with all fractal segments
            let bestSeg = null;
            let bestDist = Infinity;
            let bestPx = 0, bestPy = 0;
            
            fractalSimSegments.forEach(seg => {
                const res = distToSegmentSim(p.x, p.y, seg.x1, seg.y1, seg.x2, seg.y2);
                if (res.dist < bestDist) {
                    bestDist = res.dist;
                    bestSeg = seg;
                    bestPx = res.px;
                    bestPy = res.py;
                }
            });
            
            // Snap if touches
            if (bestDist < 4.5 && bestSeg !== null) {
                p.isAdsorbed = true;
                p.adsorbedSeg = bestSeg;
                p.snapX = bestPx;
                p.snapY = bestPy;
                p.trail = []; // Clear trail
            } else {
                // Draw particle trail (cian glow)
                if (p.trail.length > 1) {
                    fractalSimCtx.beginPath();
                    fractalSimCtx.moveTo(p.trail[0].x, p.trail[0].y);
                    for (let j = 1; j < p.trail.length; j++) {
                        fractalSimCtx.lineTo(p.trail[j].x, p.trail[j].y);
                    }
                    fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 120, 200, 0.15)' : 'rgba(0, 190, 255, 0.25)';
                    fractalSimCtx.lineWidth = 1.8;
                    fractalSimCtx.lineCap = 'round';
                    fractalSimCtx.lineJoin = 'round';
                    fractalSimCtx.stroke();
                }
                
                // Draw particle core
                fractalSimCtx.beginPath();
                fractalSimCtx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
                fractalSimCtx.fillStyle = isSun ? '#0066cc' : 'rgba(0, 170, 255, 0.9)';
                fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 102, 204, 0.3)' : 'rgba(0, 255, 255, 0.4)';
                fractalSimCtx.lineWidth = 1.5;
                fractalSimCtx.fill();
                fractalSimCtx.stroke();
            }
        }
    });
    
    // Update stats
    document.getElementById('val-fractal-adsorbed').textContent = `${adsorbedCount} / ${FRACTAL_SIM_PARTICLE_COUNT}`;
    
    // Update dynamic equilibrium status badge
    const ratio = adsorbedCount / FRACTAL_SIM_PARTICLE_COUNT;
    const statusBox = document.querySelector('#slide-8 .statistics-box .panel-header');
    if (statusBox) {
        if (ratio >= 0.75) {
            statusBox.innerHTML = `METRIC PANEL: <span class="orange-text">[ SATURACIÓN ]</span>`;
        } else if (ratio <= 0.15) {
            statusBox.innerHTML = `METRIC PANEL: <span style="color: #ef4444;">[ DESORCIÓN TÉRMICA ]</span>`;
        } else {
            statusBox.innerHTML = `METRIC PANEL: <span style="color: #10b981;">[ EQUILIBRIO DINÁMICO ]</span>`;
        }
    }
    
    // Mini-oscilloscope in top right
    const graphW = 120;
    const graphH = 50;
    const graphX = fractalSimCanvas.width - graphW - 15;
    const graphY = 15;
    
    fractalAdsorptionHistory.push(ratio);
    if (fractalAdsorptionHistory.length > graphW) {
        fractalAdsorptionHistory.shift();
    }
    
    // Draw oscilloscope card
    fractalSimCtx.fillStyle = isSun ? 'rgba(255, 255, 255, 0.85)' : 'rgba(7, 8, 10, 0.8)';
    fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
    fractalSimCtx.lineWidth = 1;
    fractalSimCtx.fillRect(graphX, graphY, graphW, graphH);
    fractalSimCtx.strokeRect(graphX, graphY, graphW, graphH);
    
    // Draw grid lines inside mini-oscilloscope
    fractalSimCtx.strokeStyle = isSun ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)';
    fractalSimCtx.lineWidth = 0.5;
    fractalSimCtx.beginPath();
    fractalSimCtx.moveTo(graphX, graphY + graphH / 2);
    fractalSimCtx.lineTo(graphX + graphW, graphY + graphH / 2);
    fractalSimCtx.stroke();
    for (let gx = 20; gx < graphW; gx += 20) {
        fractalSimCtx.beginPath();
        fractalSimCtx.moveTo(graphX + gx, graphY);
        fractalSimCtx.lineTo(graphX + gx, graphY + graphH);
        fractalSimCtx.stroke();
    }
    
    // Plot history line
    if (fractalAdsorptionHistory.length > 1) {
        fractalSimCtx.beginPath();
        const startX = graphX + (graphW - fractalAdsorptionHistory.length);
        fractalSimCtx.moveTo(startX, graphY + graphH - fractalAdsorptionHistory[0] * graphH);
        for (let i = 1; i < fractalAdsorptionHistory.length; i++) {
            fractalSimCtx.lineTo(startX + i, graphY + graphH - fractalAdsorptionHistory[i] * graphH);
        }
        fractalSimCtx.strokeStyle = isSun ? '#cc3300' : '#ff5500';
        fractalSimCtx.lineWidth = 1.5;
        fractalSimCtx.stroke();
    }
    
    // Draw HUD text inside mini chart
    fractalSimCtx.fillStyle = isSun ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.35)';
    fractalSimCtx.font = '7.5px "JetBrains Mono", monospace';
    fractalSimCtx.textAlign = 'left';
    fractalSimCtx.fillText('ADSORPTION RATE', graphX + 5, graphY + 10);
    fractalSimCtx.textAlign = 'right';
    fractalSimCtx.fillText(`${Math.round(ratio * 100)}%`, graphX + graphW - 5, graphY + 10);
    
    // Technical coordinates HUD in the corners
    const telemetryY = fractalSimCanvas.height - 12;
    fractalSimCtx.fillStyle = isSun ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.3)';
    fractalSimCtx.font = '8px "JetBrains Mono", monospace';
    fractalSimCtx.textAlign = 'left';
    fractalSimCtx.fillText(`THERMAL_ENERGY (k_B T): ${(T * 0.0862).toFixed(2)} meV`, 15, telemetryY);
    
    const meanSpeed = 12.5 * Math.sqrt(T);
    fractalSimCtx.textAlign = 'right';
    fractalSimCtx.fillText(`MEAN_SPEED: ${meanSpeed.toFixed(0)} m/s`, fractalSimCanvas.width - 15, telemetryY);
}

// Distance helper
function distToSegmentSim(x, y, x1, y1, x2, y2) {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    
    const dx = x - xx;
    const dy = y - yy;
    return { dist: Math.sqrt(dx * dx + dy * dy), px: xx, py: yy };
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
        updateDerivationStepB();
    } else if (idx === 5) {
        initAdsorpSimulator();
        
        document.getElementById('slider-temp-ad').oninput = updateAdsorpSimulation;
        document.getElementById('slider-energy-ad').oninput = updateAdsorpSimulation;
        document.getElementById('slider-conc-ad').oninput = updateAdsorpSimulation;
        
        updateAdsorpSimulation();
    } else if (idx === 6) {
        updateDerivationStepC();
        initFractalDrawing();
        animateFractalTree();
    } else if (idx === 7) {
        initFractalSim();
        
        document.getElementById('slider-fractal-depth').oninput = updateFractalSimParams;
        document.getElementById('slider-fractal-ratio').oninput = updateFractalSimParams;
        document.getElementById('slider-fractal-branches').oninput = updateFractalSimParams;
        document.getElementById('slider-fractal-temp').oninput = updateFractalSimParams;
        
        updateFractalSimParams();
    }
}

// Global initialization
window.onload = () => {
    window.addEventListener('resize', () => {
        if (currentSlideIndex === 2) initMoleculeViewer();
        if (currentSlideIndex === 5) {
            adsorpCanvas.width = adsorpCanvas.getBoundingClientRect().width;
            adsorpCanvas.height = adsorpCanvas.getBoundingClientRect().height;
        }
        if (currentSlideIndex === 6) initFractalDrawing();
        if (currentSlideIndex === 7) {
            resizeFractalSimCanvas();
            updateFractalSimParams();
        }
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

    updateNavigation();
    
    // Start adsorption simulation loop (which ticks when slide 6 is active)
    runAdsorpAnimationLoop();
    
    // Start fractal simulation loop (which ticks when slide 8 is active)
    runFractalSimLoop();
};
