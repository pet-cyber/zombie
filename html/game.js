const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Offscreen canvas for dynamic darkness & flashlight cone
const lightCanvas = document.createElement('canvas');
lightCanvas.width = canvas.width;
lightCanvas.height = canvas.height;
const lightCtx = lightCanvas.getContext('2d');

// --- WORLD & CAMERA ---
const world = { width: 2000, height: 2000 };
const camera = { x: 0, y: 0, width: canvas.width, height: canvas.height };

// --- GAME STATE ---
let gameState = 'MENU'; // 'MENU', 'PLAYING', 'GAMEOVER'
let score = 0;
let highScore = 0;
let wave = 1;
let screenShake = 0;
let muzzleFlash = 0;
let damageFlash = 0;
let flashlightOn = true;
let radarAngle = 0;

// --- WEAPON ARSENAL ---
const weapons = [
    {
        name: 'ASSAULT RIFLE',
        key: '1',
        fireRate: 8,
        damage: 1,
        speed: 15,
        pellets: 1,
        spread: 0.04,
        color: '#ffbb33',
        length: 28
    },
    {
        name: 'COMBAT SHOTGUN',
        key: '2',
        fireRate: 28,
        damage: 1,
        speed: 13,
        pellets: 5,
        spread: 0.35,
        color: '#ff6622',
        length: 24
    },
    {
        name: 'HEAVY SNIPER',
        key: '3',
        fireRate: 42,
        damage: 3,
        speed: 24,
        pellets: 1,
        spread: 0,
        color: '#00f0ff',
        length: 36
    }
];

let currentWeaponIndex = 0;
let fireCooldown = 0;

let player = {
    x: world.width / 2,
    y: world.height / 2,
    radius: 20,
    speed: 4.5,
    maxHealth: 100,
    health: 100,
    angle: 0
};

let bullets = [];
let enemies = [];
let particles = [];
let bloodDecals = [];
let shellCasings = [];
let floatingTexts = [];
let keys = {};
let mousePos = { x: canvas.width / 2, y: canvas.height / 2 };

// --- SCATTERED MAP DEBRIS ---
let mapProps = [];
for (let i = 0; i < 110; i++) {
    mapProps.push({
        x: Math.random() * world.width,
        y: Math.random() * world.height,
        size: 4 + Math.random() * 14,
        type: Math.random() > 0.35 ? 'crater' : 'stain',
        alpha: 0.15 + Math.random() * 0.2
    });
}

// --- MAP OBSTACLES ---
const obstacles = [
    // Abandoned Buildings
    { x: 300, y: 250, width: 320, height: 220, type: 'building' },
    { x: 1350, y: 250, width: 350, height: 240, type: 'building' },
    { x: 280, y: 1400, width: 300, height: 280, type: 'building' },
    { x: 1380, y: 1380, width: 340, height: 260, type: 'building' },

    // Shipping Containers
    { x: 750, y: 400, width: 140, height: 55, type: 'container', color: '#5e2c26' },
    { x: 1100, y: 550, width: 55, height: 140, type: 'container', color: '#384a36' },
    { x: 520, y: 950, width: 55, height: 150, type: 'container', color: '#5e2c26' },
    { x: 1420, y: 900, width: 150, height: 55, type: 'container', color: '#384a36' },
    { x: 820, y: 1520, width: 160, height: 55, type: 'container', color: '#4a4335' },

    // Concrete Road Barricades
    { x: 780, y: 780, width: 90, height: 25, type: 'barricade' },
    { x: 1130, y: 780, width: 90, height: 25, type: 'barricade' },
    { x: 780, y: 1195, width: 90, height: 25, type: 'barricade' },
    { x: 1130, y: 1195, width: 90, height: 25, type: 'barricade' }
];

// --- COLLISION HELPERS ---
function resolveObstacleCollisions(entity) {
    obstacles.forEach(obs => {
        const closestX = Math.max(obs.x, Math.min(entity.x, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(entity.y, obs.y + obs.height));

        const dx = entity.x - closestX;
        const dy = entity.y - closestY;
        const distance = Math.hypot(dx, dy);

        if (distance < entity.radius) {
            const overlap = entity.radius - distance;
            if (distance > 0) {
                entity.x += (dx / distance) * overlap;
                entity.y += (dy / distance) * overlap;
            } else {
                entity.y -= overlap;
            }
        }
    });
}

function bulletHitsObstacle(b) {
    return obstacles.some(obs =>
        b.x + b.radius > obs.x &&
        b.x - b.radius < obs.x + obs.width &&
        b.y + b.radius > obs.y &&
        b.y - b.radius < obs.y + obs.height
    );
}

// --- INPUT LISTENERS ---
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (e.code === 'Space') {
        e.preventDefault();
        if (gameState === 'MENU') {
            startGame();
        }
    }

    if (gameState === 'PLAYING') {
        if (key === '1') currentWeaponIndex = 0;
        if (key === '2') currentWeaponIndex = 1;
        if (key === '3') currentWeaponIndex = 2;
        if (key === 'f') flashlightOn = !flashlightOn;
    }

    if (key === 'r' && gameState === 'GAMEOVER') {
        startGame();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
});

canvas.addEventListener('click', () => {
    if (gameState === 'MENU') {
        startGame();
    }
});

// --- SHOOTING & EFFECTS ---
function shootBullet() {
    const weapon = weapons[currentWeaponIndex];
    const targetWorldX = camera.x + mousePos.x;
    const targetWorldY = camera.y + mousePos.y;
    const baseAngle = Math.atan2(targetWorldY - player.y, targetWorldX - player.x);

    const barrelLength = weapon.length + 4;

    for (let i = 0; i < weapon.pellets; i++) {
        const angleOffset = (Math.random() - 0.5) * weapon.spread;
        const finalAngle = baseAngle + angleOffset;

        bullets.push({
            x: player.x + Math.cos(baseAngle) * barrelLength,
            y: player.y + Math.sin(baseAngle) * barrelLength,
            angle: finalAngle,
            speed: weapon.speed,
            radius: weapon.name === 'HEAVY SNIPER' ? 5 : 4,
            damage: weapon.damage,
            color: weapon.color
        });
    }

    // Eject spinning brass shell casing to the right of the gun
    const ejectAngle = baseAngle + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    shellCasings.push({
        x: player.x + Math.cos(baseAngle) * 14,
        y: player.y + Math.sin(baseAngle) * 14,
        vx: Math.cos(ejectAngle) * (2 + Math.random() * 1.5),
        vy: Math.sin(ejectAngle) * (2 + Math.random() * 1.5),
        angle: Math.random() * Math.PI,
        vAngle: (Math.random() - 0.5) * 0.4,
        life: 90
    });
    if (shellCasings.length > 80) shellCasings.shift();

    muzzleFlash = 3;
    screenShake = weapon.name === 'ASSAULT RIFLE' ? 2.5 : 5.5;
}

function spawnBloodParticles(x, y, count, isKill = false) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * (isKill ? 5.5 : 3);
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 2 + Math.random() * 3.5,
            alpha: 1,
            color: Math.random() > 0.3 ? '#a81c1c' : '#5c0a0a'
        });
    }

    if (isKill) {
        bloodDecals.push({
            x: x,
            y: y,
            radius: 14 + Math.random() * 14,
            alpha: 0.45
        });
        if (bloodDecals.length > 150) bloodDecals.shift();
    }
}

function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y - 15,
        text: text,
        color: color,
        alpha: 1,
        vy: -1.1
    });
}

// --- ZOMBIE SPAWNING ---
function createZombie() {
    let spawnX, spawnY, dist, insideObstacle;
    do {
        spawnX = Math.random() * world.width;
        spawnY = Math.random() * world.height;
        dist = Math.hypot(spawnX - player.x, spawnY - player.y);
        insideObstacle = obstacles.some(obs =>
            spawnX > obs.x - 25 && spawnX < obs.x + obs.width + 25 &&
            spawnY > obs.y - 25 && spawnY < obs.y + obs.height + 25
        );
    } while (dist < 450 || insideObstacle);

    const isRunner = Math.random() < 0.25;

    enemies.push({
        x: spawnX,
        y: spawnY,
        radius: isRunner ? 14 : 18,
        speed: isRunner ? 2.75 : 1.7 + Math.random() * 0.4,
        maxHealth: isRunner ? 2 : 3,
        health: isRunner ? 2 : 3,
        color: isRunner ? '#6b8e23' : '#436341',
        wobble: Math.random() * Math.PI * 2
    });
}

function spawnZombieWave(count) {
    for (let i = 0; i < count; i++) {
        createZombie();
    }
}

// --- START / RESTART ---
function startGame() {
    player.x = world.width / 2;
    player.y = world.height / 2;
    player.health = player.maxHealth;
    bullets = [];
    enemies = [];
    particles = [];
    bloodDecals = [];
    shellCasings = [];
    floatingTexts = [];
    score = 0;
    wave = 1;
    currentWeaponIndex = 0;
    fireCooldown = 0;
    damageFlash = 0;
    gameState = 'PLAYING';
    spawnZombieWave(6);
}

// --- UPDATE LOOP ---
function update() {
    radarAngle = (radarAngle + 0.04) % (Math.PI * 2);

    if (gameState !== 'PLAYING') return;

    // 1. Player Movement
    if (keys['w'] || keys['arrowup']) player.y -= player.speed;
    if (keys['s'] || keys['arrowdown']) player.y += player.speed;
    if (keys['a'] || keys['arrowleft']) player.x -= player.speed;
    if (keys['d'] || keys['arrowright']) player.x += player.speed;

    player.x = Math.max(player.radius + 10, Math.min(world.width - player.radius - 10, player.x));
    player.y = Math.max(player.radius + 10, Math.min(world.height - player.radius - 10, player.y));
    resolveObstacleCollisions(player);

    const targetWorldX = mousePos.x + camera.x;
    const targetWorldY = mousePos.y + camera.y;
    player.angle = Math.atan2(targetWorldY - player.y, targetWorldX - player.x);

    // 2. Smooth Automatic Firing
    const activeWeapon = weapons[currentWeaponIndex];
    if (fireCooldown > 0) fireCooldown--;

    if (keys[' '] && fireCooldown <= 0) {
        shootBullet();
        fireCooldown = activeWeapon.fireRate;
    }

    // 3. Center Camera + Decay Effects
    let shakeX = (Math.random() - 0.5) * screenShake;
    let shakeY = (Math.random() - 0.5) * screenShake;
    if (screenShake > 0) screenShake *= 0.85;
    if (muzzleFlash > 0) muzzleFlash--;
    if (damageFlash > 0) damageFlash *= 0.9;

    camera.x = Math.max(0, Math.min(world.width - camera.width, player.x - camera.width / 2)) + shakeX;
    camera.y = Math.max(0, Math.min(world.height - camera.height, player.y - camera.height / 2)) + shakeY;

    // 4. Update Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;

        if (
            b.x < 0 || b.x > world.width || b.y < 0 || b.y > world.height ||
            bulletHitsObstacle(b)
        ) {
            bullets.splice(i, 1);
        }
    }

    // 5. Update Zombies
    for (let i = enemies.length - 1; i >= 0; i--) {
        let z = enemies[i];
        z.wobble += 0.1;
        const angle = Math.atan2(player.y - z.y, player.x - z.x);
        z.angle = angle;
        z.x += Math.cos(angle) * z.speed;
        z.y += Math.sin(angle) * z.speed;
        resolveObstacleCollisions(z);
    }

    // 6. Bullet vs Zombie Collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
            let z = enemies[j];
            let dist = Math.hypot(b.x - z.x, b.y - z.y);

            if (dist < b.radius + z.radius) {
                z.health -= b.damage;
                bullets.splice(i, 1);
                spawnBloodParticles(z.x, z.y, 6, false);
                spawnFloatingText(z.x, z.y, `-${b.damage}`, '#ff5555');

                if (z.health <= 0) {
                    spawnBloodParticles(z.x, z.y, 18, true);
                    spawnFloatingText(z.x, z.y - 10, '+100', '#e6c229');
                    enemies.splice(j, 1);
                    score += 100;
                    if (score > highScore) highScore = score;
                    screenShake = 4.5;

                    if (score % 1000 === 0) {
                        wave++;
                        spawnZombieWave(2);
                    }
                    createZombie();
                }
                break;
            }
        }
    }

    // 7. Zombie vs Player Collisions (Damage + Physical Separation)
    for (let i = enemies.length - 1; i >= 0; i--) {
        let z = enemies[i];
        let dx = z.x - player.x;
        let dy = z.y - player.y;
        let dist = Math.hypot(dx, dy);
        let minDist = player.radius + z.radius;

        if (dist < minDist) {
            let overlap = minDist - dist;
            if (dist > 0) {
                z.x += (dx / dist) * overlap;
                z.y += (dy / dist) * overlap;
            } else {
                z.x += minDist;
            }
            resolveObstacleCollisions(z);

            player.health -= 0.6;
            screenShake = 3.5;
            damageFlash = 0.45;
            if (Math.random() < 0.2) spawnBloodParticles(player.x, player.y, 2, false);

            if (player.health <= 0) {
                player.health = 0;
                gameState = 'GAMEOVER';
            }
        }
    }

    // 8. Zombie vs Zombie Separation
    for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
            let z1 = enemies[i];
            let z2 = enemies[j];
            let dx = z2.x - z1.x;
            let dy = z2.y - z1.y;
            let dist = Math.hypot(dx, dy);
            let minDist = z1.radius + z2.radius;

            if (dist < minDist && dist > 0) {
                let overlap = (minDist - dist) / 2;
                let pushX = (dx / dist) * overlap;
                let pushY = (dy / dist) * overlap;
                z1.x -= pushX; z1.y -= pushY;
                z2.x += pushX; z2.y += pushY;
            }
        }
    }

    // 9. Update Particles, Shell Casings & Floating Text
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.92; p.vy *= 0.92;
        p.alpha -= 0.03;
        if (p.alpha <= 0) particles.splice(i, 1);
    }

    for (let i = shellCasings.length - 1; i >= 0; i--) {
        let s = shellCasings[i];
        s.x += s.vx; s.y += s.vy;
        s.vx *= 0.85; s.vy *= 0.85;
        s.angle += s.vAngle;
        s.vAngle *= 0.85;
        s.life--;
        if (s.life <= 0) shellCasings.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y += ft.vy;
        ft.alpha -= 0.025;
        if (ft.alpha <= 0) floatingTexts.splice(i, 1);
    }
}

// --- DYNAMIC LIGHTING LAYER ---
function renderLighting() {
    // Fill offscreen canvas with deep night darkness
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(4, 6, 5, 0.82)';
    lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);

    // Cut out lit areas using destination-out
    lightCtx.globalCompositeOperation = 'destination-out';

    const screenPlayerX = player.x - camera.x;
    const screenPlayerY = player.y - camera.y;

    // 1. Soft ambient glow around survivor
    const ambientGrad = lightCtx.createRadialGradient(
        screenPlayerX, screenPlayerY, 15,
        screenPlayerX, screenPlayerY, 130
    );
    ambientGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lightCtx.fillStyle = ambientGrad;
    lightCtx.beginPath();
    lightCtx.arc(screenPlayerX, screenPlayerY, 130, 0, Math.PI * 2);
    lightCtx.fill();

    // 2. Tactical Flashlight Cone
    if (flashlightOn) {
        const coneLength = 460;
        const coneSpread = 0.42; // ~48 degrees total beam angle
        const coneGrad = lightCtx.createRadialGradient(
            screenPlayerX, screenPlayerY, 10,
            screenPlayerX, screenPlayerY, coneLength
        );
        coneGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        coneGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.85)');
        coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        lightCtx.fillStyle = coneGrad;
        lightCtx.beginPath();
        lightCtx.moveTo(screenPlayerX, screenPlayerY);
        lightCtx.arc(
            screenPlayerX, screenPlayerY, coneLength,
            player.angle - coneSpread, player.angle + coneSpread
        );
        lightCtx.closePath();
        lightCtx.fill();
    }

    // 3. Muzzle Flash burst illumination
    if (muzzleFlash > 0) {
        const flashGrad = lightCtx.createRadialGradient(
            screenPlayerX, screenPlayerY, 10,
            screenPlayerX, screenPlayerY, 240
        );
        flashGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
        flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lightCtx.fillStyle = flashGrad;
        lightCtx.beginPath();
        lightCtx.arc(screenPlayerX, screenPlayerY, 240, 0, Math.PI * 2);
        lightCtx.fill();
    }

    // Composite darkness layer onto main canvas
    ctx.drawImage(lightCanvas, 0, 0);
}

// --- DRAW LOOP ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // 1. Asphalt Road Grid & Subtle Highway Markings
    ctx.strokeStyle = '#202421';
    ctx.lineWidth = 1;
    for (let x = 0; x <= world.width; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.height); ctx.stroke();
    }
    for (let y = 0; y <= world.height; y += 80) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.width, y); ctx.stroke();
    }

    // Faded yellow center highway stripes
    ctx.strokeStyle = 'rgba(180, 145, 35, 0.14)';
    ctx.lineWidth = 4;
    ctx.setLineDash([30, 30]);
    ctx.beginPath(); ctx.moveTo(world.width / 2, 0); ctx.lineTo(world.width / 2, world.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, world.height / 2); ctx.lineTo(world.width, world.height / 2); ctx.stroke();
    ctx.setLineDash([]);

    // 2. Map Debris & Weathering
    mapProps.forEach(prop => {
        ctx.fillStyle = prop.type === 'crater' ? `rgba(10, 12, 10, ${prop.alpha})` : `rgba(45, 52, 46, ${prop.alpha})`;
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, prop.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // 3. Permanent Blood Splatter Decals
    bloodDecals.forEach(decal => {
        ctx.fillStyle = `rgba(95, 12, 12, ${decal.alpha})`;
        ctx.beginPath();
        ctx.arc(decal.x, decal.y, decal.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // 4. Brass Shell Casings on Ground
    shellCasings.forEach(s => {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.fillStyle = '#d4af37';
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.restore();
    });

    // 5. Quarantine Hazard Border
    ctx.strokeStyle = '#b82525';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, world.width - 8, world.height - 8);

    // 6. Blood Particles
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 7. Glowing Tracer Bullets
    bullets.forEach(b => {
        ctx.save();
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 4;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - Math.cos(b.angle) * 16, b.y - Math.sin(b.angle) * 16);
        ctx.stroke();
        ctx.restore();
    });

    // 8. Draw Zombies
    enemies.forEach(z => {
        ctx.save();
        ctx.translate(z.x, z.y);
        ctx.rotate(z.angle);

        const armSwing = Math.sin(z.wobble) * 3;
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(0, -z.radius + 3);
        ctx.lineTo(z.radius + 10, -z.radius + 4 + armSwing);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, z.radius - 3);
        ctx.lineTo(z.radius + 10, z.radius - 4 - armSwing);
        ctx.stroke();

        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#141f13';
        ctx.stroke();

        ctx.restore();

        if (z.health < z.maxHealth) {
            let barW = 30;
            let barH = 4;
            ctx.fillStyle = '#220000';
            ctx.fillRect(z.x - barW / 2, z.y - z.radius - 14, barW, barH);
            ctx.fillStyle = '#d92626';
            ctx.fillRect(z.x - barW / 2, z.y - z.radius - 14, barW * (z.health / z.maxHealth), barH);
        }
    });

    // 9. Draw Survivor Player
    const activeWeapon = weapons[currentWeaponIndex];
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // Weapon Barrel
    ctx.fillStyle = '#181a19';
    ctx.fillRect(5, 4, activeWeapon.length, 6);
    ctx.fillStyle = '#3b423e';
    ctx.fillRect(10, 4, 12, 6);

    // Muzzle Flash
    if (muzzleFlash > 0) {
        ctx.fillStyle = '#ffdd55';
        ctx.beginPath();
        ctx.arc(activeWeapon.length + 8, 7, 9 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Survivor Body & Helmet
    ctx.fillStyle = '#3b5941';
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#141f16';
    ctx.stroke();

    ctx.fillStyle = '#587d5f';
    ctx.beginPath();
    ctx.arc(-2, 0, player.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 10. Draw Map Obstacles
    obstacles.forEach(obs => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(obs.x + 8, obs.y + 8, obs.width, obs.height);

        if (obs.type === 'building') {
            ctx.fillStyle = '#242926';
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.strokeStyle = '#121413';
            ctx.lineWidth = 4;
            ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

            // Rooftop HVAC unit & helipad-style markings
            ctx.fillStyle = '#1b1f1c';
            ctx.fillRect(obs.x + 25, obs.y + 25, 45, 45);
            ctx.strokeRect(obs.x + 25, obs.y + 25, 45, 45);
        } else if (obs.type === 'container') {
            ctx.fillStyle = obs.color;
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.strokeStyle = '#161817';
            ctx.lineWidth = 3;
            ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        } else {
            ctx.fillStyle = '#525754';
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.fillStyle = '#c9a227';
            ctx.fillRect(obs.x + 10, obs.y + 8, obs.width - 20, 6);
        }
    });

    // 11. Floating Damage & Score Text
    floatingTexts.forEach(ft => {
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 14px "Share Tech Mono", monospace';
        ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1;

    ctx.restore(); // End Camera Transform

    // --- 12. APPLY NIGHT LIGHTING & FLASHLIGHT CONE ---
    renderLighting();

    // --- 13. GLOWING ZOMBIE EYES IN THE DARK ---
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    enemies.forEach(z => {
        ctx.save();
        ctx.translate(z.x, z.y);
        ctx.rotate(z.angle);
        ctx.fillStyle = '#ff2a2a';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(z.radius - 4, -5, 2, 0, Math.PI * 2);
        ctx.arc(z.radius - 4, 5, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
    ctx.restore();

    // --- 14. CRIMSON DAMAGE PULSE OVERLAY ---
    if (damageFlash > 0.01) {
        const dmgGrad = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.width * 0.25,
            canvas.width / 2, canvas.height / 2, canvas.width * 0.65
        );
        dmgGrad.addColorStop(0, 'rgba(200, 0, 0, 0)');
        dmgGrad.addColorStop(1, `rgba(200, 15, 15, ${damageFlash})`);
        ctx.fillStyle = dmgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // --- 15. FIXED TACTICAL HUD ---
    if (gameState === 'PLAYING') {
        // Top-Left: Wave & Score Panel
        ctx.fillStyle = 'rgba(12, 16, 14, 0.85)';
        ctx.strokeStyle = '#333d36';
        ctx.lineWidth = 2;
        ctx.fillRect(20, 20, 210, 68);
        ctx.strokeRect(20, 20, 210, 68);

        ctx.fillStyle = '#9aa89e';
        ctx.font = 'bold 14px "Share Tech Mono", monospace';
        ctx.fillText(`WAVE  : ${wave}`, 34, 44);
        ctx.fillStyle = '#e6c229';
        ctx.fillText(`SCORE : ${score}`, 34, 68);

        // Top-Right: Health & Flashlight Status
        let hudW = 230;
        let hudH = 26;
        let hudX = canvas.width - hudW - 20;
        let hudY = 20;
        let hpPercent = player.health / player.maxHealth;

        ctx.fillStyle = 'rgba(12, 16, 14, 0.85)';
        ctx.fillRect(hudX - 4, hudY - 4, hudW + 8, hudH + 8);
        ctx.strokeStyle = '#333d36';
        ctx.lineWidth = 2;
        ctx.strokeRect(hudX - 4, hudY - 4, hudW + 8, hudH + 8);

        ctx.fillStyle = '#3d1111';
        ctx.fillRect(hudX, hudY, hudW, hudH);

        ctx.fillStyle = hpPercent > 0.3 ? '#388e3c' : '#d32f2f';
        ctx.fillRect(hudX, hudY, hudW * hpPercent, hudH);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px "Share Tech Mono", monospace';
        ctx.fillText(`VITALS: ${Math.ceil(player.health)}%`, hudX + 12, hudY + 18);

        // Flashlight Indicator badge under health bar
        ctx.fillStyle = flashlightOn ? '#e6c229' : '#6c7a70';
        ctx.font = '12px "Share Tech Mono", monospace';
        ctx.fillText(`FLASHLIGHT [F]: ${flashlightOn ? 'ON' : 'OFF'}`, hudX, hudY + 46);

        // Bottom-Right: Tactical Sonar Mini-Map
        const mapSize = 155;
        const mapX = canvas.width - mapSize - 20;
        const mapY = canvas.height - mapSize - 20;
        const scale = mapSize / world.width;

        ctx.fillStyle = 'rgba(10, 15, 12, 0.88)';
        ctx.fillRect(mapX, mapY, mapSize, mapSize);
        ctx.strokeStyle = '#3b4a3f';
        ctx.lineWidth = 2;
        ctx.strokeRect(mapX, mapY, mapSize, mapSize);

        // Radar Sweep Cone
        ctx.save();
        ctx.beginPath();
        ctx.rect(mapX, mapY, mapSize, mapSize);
        ctx.clip();

        const centerX = mapX + mapSize / 2;
        const centerY = mapY + mapSize / 2;
        ctx.fillStyle = 'rgba(76, 255, 76, 0.08)';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, mapSize, radarAngle, radarAngle + 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Mini-map Obstacles
        ctx.fillStyle = '#434f46';
        obstacles.forEach(obs => {
            ctx.fillRect(
                mapX + obs.x * scale,
                mapY + obs.y * scale,
                obs.width * scale,
                obs.height * scale
            );
        });

        // Mini-map Zombies
        ctx.fillStyle = '#ff3b3b';
        enemies.forEach(z => {
            ctx.beginPath();
            ctx.arc(mapX + z.x * scale, mapY + z.y * scale, 2.2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Mini-map Player
        ctx.fillStyle = '#4cff4c';
        ctx.beginPath();
        ctx.arc(mapX + player.x * scale, mapY + player.y * scale, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Bottom-Left: Weapon Arsenal HUD
        const slotW = 205;
        const slotH = 46;
        const slotGap = 10;
        const startX = 20;
        const startY = canvas.height - slotH - 20;

        weapons.forEach((w, index) => {
            const x = startX + index * (slotW + slotGap);
            const isSelected = index === currentWeaponIndex;

            ctx.fillStyle = isSelected ? 'rgba(34, 43, 36, 0.94)' : 'rgba(12, 16, 14, 0.82)';
            ctx.fillRect(x, startY, slotW, slotH);

            ctx.strokeStyle = isSelected ? '#e6c229' : '#333d36';
            ctx.lineWidth = isSelected ? 2.5 : 1.5;
            ctx.strokeRect(x, startY, slotW, slotH);

            ctx.fillStyle = isSelected ? '#e6c229' : '#262e28';
            ctx.fillRect(x + 8, startY + 10, 26, 26);

            ctx.fillStyle = isSelected ? '#070908' : '#9aa89e';
            ctx.font = 'bold 15px "Share Tech Mono", monospace';
            ctx.fillText(w.key, x + 16, startY + 28);

            ctx.fillStyle = isSelected ? '#ffffff' : '#7c8a80';
            ctx.font = 'bold 13px "Share Tech Mono", monospace';
            ctx.fillText(w.name, x + 44, startY + 28);
        });

        ctx.fillStyle = '#8a998e';
        ctx.font = '12px "Share Tech Mono", monospace';
        ctx.fillText('ARSENAL SELECT: [1] [2] [3]', startX, startY - 8);
    }

    // --- 16. DEPLOYMENT START SCREEN OVERLAY ---
    if (gameState === 'MENU') {
        ctx.fillStyle = 'rgba(6, 9, 7, 0.72)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';

        ctx.fillStyle = '#d93838';
        ctx.font = '72px "Black Ops One", cursive';
        ctx.fillText('DEAD ZONE', canvas.width / 2, canvas.height / 2 - 55);

        ctx.fillStyle = '#9aa89e';
        ctx.font = '16px "Share Tech Mono", monospace';
        ctx.fillText('QUARANTINE BREACH DETECTED // SURVIVE THE HORDE', canvas.width / 2, canvas.height / 2 - 12);

        // Pulsing Start Prompt
        const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.4;
        ctx.fillStyle = `rgba(230, 194, 41, ${pulse})`;
        ctx.font = 'bold 22px "Share Tech Mono", monospace';
        ctx.fillText('>> PRESS [ SPACE ] OR CLICK TO DEPLOY <<', canvas.width / 2, canvas.height / 2 + 45);

        ctx.textAlign = 'left';
    }

    // --- 17. GAME OVER OVERLAY ---
    if (gameState === 'GAMEOVER') {
        ctx.fillStyle = 'rgba(10, 4, 4, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        
        ctx.fillStyle = '#d93838';
        ctx.font = '66px "Black Ops One", cursive';
        ctx.fillText('SIGNAL LOST', canvas.width / 2, canvas.height / 2 - 50);

        ctx.fillStyle = '#e6c229';
        ctx.font = 'bold 20px "Share Tech Mono", monospace';
        ctx.fillText(`SCORE: ${score}  |  BEST: ${highScore}  |  WAVE: ${wave}`, canvas.width / 2, canvas.height / 2 + 5);

        ctx.fillStyle = '#9aa89e';
        ctx.font = '18px "Share Tech Mono", monospace';
        ctx.fillText('PRESS [ R ] TO DEPLOY AGAIN', canvas.width / 2, canvas.height / 2 + 55);

        ctx.textAlign = 'left';
    }
}

// --- MAIN LOOP ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();