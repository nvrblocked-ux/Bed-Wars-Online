import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onChildAdded, onChildChanged, onChildRemoved, onDisconnect } 
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- FIREBASE CONFIG (Use your actual config here) ---
const firebaseConfig = {
    apiKey: "AIzaSyC3Gc_DfcZDCBLxKoDgdlruBPdPNLBOVAo",
    authDomain: "bedwars-2f641.firebaseapp.com",
    projectId: "bedwars-2f641",
    storageBucket: "bedwars-2f641.firebasestorage.app",
    messagingSenderId: "158660772996",
    appId: "1:158660772996:web:d7eacea89d9e2e4115aed1",
    databaseURL: "https://bedwars-2f641-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const myId = Math.floor(Math.random() * 900000).toString();

// --- GAME STATE ---
let scene, camera, renderer, controls;
let myTeam, teamCount;
let otherPlayers = {};
const collisionObjects = [];

// Physics Vars
let velocity = new THREE.Vector3();
let canJump = false;
const gravity = 30.0;
const jumpForce = 12.0;

const move = { f: false, b: false, l: false, r: false };

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new PointerLockControls(camera, document.body);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // UI Navigation
    document.getElementById('playBtn').onclick = () => {
        document.getElementById('panelPlay').classList.add('hidden');
        document.getElementById('panelMode').classList.remove('hidden');
    };

    document.getElementById('mode2').onclick = () => setupTeams(2);
    document.getElementById('mode4').onclick = () => setupTeams(4);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    setupInputs();
    animate();
}

function setupTeams(count) {
    teamCount = count;
    document.getElementById('panelMode').classList.add('hidden');
    document.getElementById('panelTeams').classList.remove('hidden');
    if(count === 4) {
        document.getElementById('btnGreen').classList.remove('hidden');
        document.getElementById('btnYellow').classList.remove('hidden');
    }

    document.querySelectorAll('.team-btn').forEach(btn => {
        btn.onclick = (e) => {
            myTeam = e.target.innerText;
            startMatchmaking();
        };
    });
}

function startMatchmaking() {
    document.getElementById('panelTeams').classList.add('hidden');
    document.getElementById('panelMatchmaking').classList.remove('hidden');
    
    // Sync to Firebase
    const playerRef = ref(db, `players/${myId}`);
    set(playerRef, { id: myId, team: myTeam, x: 0, y: 10, z: 0, ry: 0 });
    onDisconnect(playerRef).remove();

    buildWorld();
    
    setTimeout(() => {
        document.getElementById('mainMenu').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('crosshair').classList.remove('hidden');
        document.getElementById('myIdDisplay').innerText = myId;
        document.getElementById('myTeamDisplay').innerText = myTeam;
        controls.lock();
    }, 2000);
}

function buildWorld() {
    // Ground/Void
    const voidGeo = new THREE.BoxGeometry(1000, 1, 1000);
    const voidMat = new THREE.MeshBasicMaterial({ visible: false });
    const voidFloor = new THREE.Mesh(voidGeo, voidMat);
    voidFloor.position.y = -50;
    scene.add(voidFloor);

    // Create Islands based on team count
    const angles = teamCount === 2 ? [0, Math.PI] : [0, Math.PI/2, Math.PI, Math.PI*1.5];
    const colors = [0xcc2222, 0x2222cc, 0x22cc22, 0xcccc22];
    const dist = 40;

    angles.forEach((angle, i) => {
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        createIsland(x, z, colors[i]);
    });

    // Center Island
    createIsland(0, 0, 0xffffff, true);
}

function createIsland(x, z, color, isMid = false) {
    const geo = new THREE.BoxGeometry(15, 1, 15);
    const mat = new THREE.MeshLambertMaterial({ color: color });
    const island = new THREE.Mesh(geo, mat);
    island.position.set(x, 0, z);
    scene.add(island);
    collisionObjects.push(island);

    if(!isMid) {
        // Shop Hut
        createHut(x - 4, 1.5, z - 4, 0xffaa00);
        // Upgrade Hut
        createHut(x + 4, 1.5, z - 4, 0x00aaff);
    }
}

function createHut(x, y, z, color) {
    const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ color: color }));
    hut.position.set(x, y, z);
    scene.add(hut);
    collisionObjects.push(hut);
}

function setupInputs() {
    document.onkeydown = (e) => {
        if(e.code === 'KeyW') move.f = true;
        if(e.code === 'KeyS') move.b = true;
        if(e.code === 'KeyA') move.l = true;
        if(e.code === 'KeyD') move.r = true;
        if(e.code === 'Space' && canJump) {
            velocity.y += jumpForce;
            canJump = false;
        }
    };
    document.onkeyup = (e) => {
        if(e.code === 'KeyW') move.f = false;
        if(e.code === 'KeyS') move.b = false;
        if(e.code === 'KeyA') move.l = false;
        if(e.code === 'KeyD') move.r = false;
    };
}

let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked) {
        // Gravity logic
        velocity.y -= gravity * delta;

        // Movement
        const speed = 40.0;
        if (move.f) controls.moveForward(speed * delta);
        if (move.b) controls.moveForward(-speed * delta);
        if (move.l) controls.moveRight(-speed * delta);
        if (move.r) controls.moveRight(speed * delta);

        camera.position.y += (velocity.y * delta);

        // Simple Ground Collision
        if (camera.position.y < 2.5) {
            velocity.y = 0;
            camera.position.y = 2.5;
            canJump = true;
        }

        // Firebase Sync
        set(ref(db, `players/${myId}`), {
            id: myId, team: myTeam,
            x: camera.position.x, y: camera.position.y, z: camera.position.z,
            ry: camera.rotation.y
        });
    }

    renderer.render(scene, camera);
    prevTime = time;
}
