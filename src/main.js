import './style.css';
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, metalness, roughness, diffuseColor, velocity, vec2, vec4, add, packNormalToRGB, unpackRGBToNormal, sample } from 'three/tsl';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';

import { TubePainter } from 'three/addons/misc/TubePainter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const params = new URLSearchParams(location.search);
const baselineMode = params.get('baseline') === '1';
const forceError = params.get('forceError') === '1';
const locale = (() => {
  const override = localStorage.getItem('game_locale');
  if (override === 'zh' || override === 'en') return override;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
})();
const copy = {
  zh: { ready: '拖动画出一道光', drawing: '光迹正在生长', cured: '光迹已经固化', hint: '双指移动 · 环绕作品', loading: '正在建立光场', errorTitle: '需要 WebGPU', errorBody: '请使用支持 WebGPU 的浏览器重试' },
  en: { ready: 'DRAG TO DRAW LIGHT', drawing: 'STROKE GROWING', cured: 'STROKE CURED', hint: 'TWO FINGERS · ORBIT THE WORK', loading: 'BUILDING LIGHT FIELD', errorTitle: 'WEBGPU REQUIRED', errorBody: 'RETRY IN A WEBGPU-CAPABLE BROWSER' }
};

let camera, scene, renderer, postProcessing, controls, painter;
let isDrawing = false, drawMode = true;
let lastPosition = new THREE.Vector3();
let lastTime = 0;
let currentSize = 1;
let drawingPointerId = null;
let userRoughness = 0;
let cureStartedAt = 0;
let cureActive = false;
let interacted = false;
let demoFrame = 0;
let demoRaf = 0;
let demoTimers = [];
let audioContext = null;
let drawOscillator = null;
let drawGain = null;
let lastAudioUpdate = 0;
const activePointers = new Map();

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.25);
const intersectionPoint = new THREE.Vector3();
const easedPosition = new THREE.Vector3();
const currentColor = new THREE.Color();

function getPointerCoords(clientX, clientY) {
  pointer.x = clientX / window.innerWidth * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
}

applyCopy();

function applyCopy() {
  if (baselineMode) return;
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(node => {
    node.textContent = copy[locale][node.dataset.i18n];
  });
}

function setReadout(key) {
  const label = document.querySelector('[data-i18n="ready"]');
  if (label) label.textContent = copy[locale][key];
}

function ensureAudio() {
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext = new AudioCtor();
  return audioContext;
}

function playTone(frequency, duration, volume, delay = 0) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, context.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(context.currentTime + delay);
  oscillator.stop(context.currentTime + delay + duration + 0.02);
}

function startDrawSound() {
  const context = ensureAudio();
  if (!context || drawOscillator) return;
  context.resume();
  drawOscillator = context.createOscillator();
  drawGain = context.createGain();
  drawOscillator.type = 'triangle';
  drawOscillator.frequency.value = 110;
  drawGain.gain.value = 0.0001;
  drawGain.gain.exponentialRampToValueAtTime(0.018, context.currentTime + 0.05);
  drawOscillator.connect(drawGain).connect(context.destination);
  drawOscillator.start();
}

function updateDrawSound(size) {
  if (!audioContext || !drawOscillator || performance.now() - lastAudioUpdate < 45) return;
  lastAudioUpdate = performance.now();
  drawOscillator.frequency.setTargetAtTime(110 + Math.min(1, (size - 1) / 14) * 220, audioContext.currentTime, 0.04);
}

function stopDrawSound(withCure) {
  if (audioContext && drawOscillator && drawGain) {
    drawGain.gain.cancelScheduledValues(audioContext.currentTime);
    drawGain.gain.setValueAtTime(Math.max(0.0001, drawGain.gain.value), audioContext.currentTime);
    drawGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.08);
    drawOscillator.stop(audioContext.currentTime + 0.09);
  }
  drawOscillator = null;
  drawGain = null;
  if (withCure) {
    playTone(220, 0.18, 0.018);
    playTone(440, 0.18, 0.012, 0.025);
  }
}

async function init() {
  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  renderer = new THREE.WebGPURenderer({
    requiredLimits: {
      maxColorAttachmentBytesPerSample: 40
    }
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.domElement.style.cursor = 'crosshair';
  document.body.appendChild(renderer.domElement);

  await renderer.init();

  const environment = new RoomEnvironment();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(environment).texture;
  pmremGenerator.dispose();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = !baselineMode;
  if (!baselineMode) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.touches.ONE = THREE.TOUCH.NONE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.mouseButtons.LEFT = -1;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
  }
  controls.update();

  postProcessing = new THREE.RenderPipeline(renderer);

  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({
    output: output,
    diffuseColor: diffuseColor,
    normal: packNormalToRGB(normalView),
    metalrough: vec2(metalness, roughness),
    velocity: velocity
  }));

  const scenePassColor = scenePass.getTextureNode('output');
  const scenePassDiffuse = scenePass.getTextureNode('diffuseColor');
  const scenePassDepth = scenePass.getTextureNode('depth');
  const scenePassNormal = scenePass.getTextureNode('normal');
  const scenePassMetalRough = scenePass.getTextureNode('metalrough');
  const scenePassVelocity = scenePass.getTextureNode('velocity');

  const diffuseTexture = scenePass.getTexture('diffuseColor');
  diffuseTexture.type = THREE.UnsignedByteType;

  const normalTexture = scenePass.getTexture('normal');
  normalTexture.type = THREE.UnsignedByteType;

  const metalRoughTexture = scenePass.getTexture('metalrough');
  metalRoughTexture.type = THREE.UnsignedByteType;

  const sceneNormal = sample(uv => unpackRGBToNormal(scenePassNormal.sample(uv)));

  const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);
  giPass.sliceCount.value = 2;
  giPass.stepCount.value = 8;
  giPass.aoIntensity.value = 1;

  const ssrPass = ssr(scenePassColor, scenePassDepth, sceneNormal, {
    metalnessNode: scenePassMetalRough.r,
    roughnessNode: scenePassMetalRough.g,
    camera
  });

  const ao = giPass.getAONode();
  const gi = giPass.getGINode();
  const sceneWithGI = vec4(
    add(scenePassColor.rgb.mul(ao.r), scenePassDiffuse.rgb.mul(gi.rgb)),
    scenePassColor.a
  );
  const composite = sceneWithGI.add(ssrPass.rgb);
  postProcessing.outputNode = traa(composite, scenePassDepth, scenePassVelocity, camera);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 })
  );
  scene.add(wall);

  painter = new TubePainter();
  painter.mesh.material.roughness = 0;
  painter.mesh.material.metalness = 0.25;
  scene.add(painter.mesh);

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  document.getElementById('modeToggle').addEventListener('click', () => {
    drawMode = !drawMode;
    controls.enabled = !drawMode;
    document.getElementById('mode').textContent = drawMode ? 'Draw' : 'Orbit';
  });

  document.getElementById('roughnessSlider').addEventListener('input', event => {
    userRoughness = parseFloat(event.target.value);
    painter.mesh.material.roughness = userRoughness;
    document.getElementById('roughness').textContent = event.target.value;
  });

  document.getElementById('metalnessSlider').addEventListener('input', event => {
    painter.mesh.material.metalness = parseFloat(event.target.value);
    document.getElementById('metalness').textContent = event.target.value;
  });

  document.getElementById('downloadGLB').addEventListener('click', () => {
    const geometry = painter.mesh.geometry;
    const drawCount = geometry.drawRange.count;
    if (drawCount === 0) return alert('Draw something first?');

    const exportGeometry = new THREE.BufferGeometry();
    exportGeometry.setAttribute('position', new THREE.BufferAttribute(geometry.attributes.position.array.slice(0, drawCount * 3), 3));
    exportGeometry.setAttribute('normal', new THREE.BufferAttribute(geometry.attributes.normal.array.slice(0, drawCount * 3), 3));
    exportGeometry.setAttribute('color', new THREE.BufferAttribute(geometry.attributes.color.array.slice(0, drawCount * 3), 3));

    const exportMesh = new THREE.Mesh(exportGeometry, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: painter.mesh.material.roughness,
      metalness: painter.mesh.material.metalness
    }));

    const exporter = new GLTFExporter();
    exporter.parse(exportMesh, result => {
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'tube.glb';
      link.click();
    }, error => {
      console.error('An error happened during export', error);
    }, { binary: true });
  });

  if (!baselineMode) {
    document.querySelector('.ls-clear')?.addEventListener('pointerdown', event => {
      event.stopPropagation();
      cancelGhostDemo();
      clearDrawing();
    });
    const loading = document.querySelector('.ls-loading');
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => {
        loading.remove();
        if (!interacted) runGhostDemo();
      }, 450);
    }
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(event) {
  if (event.target.closest('#ui') || event.target.closest('.ls-clear')) return;
  if (baselineMode) {
    if (drawMode) beginStroke(event.clientX, event.clientY, event.timeStamp);
    return;
  }

  interacted = true;
  cancelGhostDemo();
  ensureAudio()?.resume();
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 1) {
    drawingPointerId = event.pointerId;
    beginStroke(event.clientX, event.clientY, event.timeStamp);
    startDrawSound();
    setReadout('drawing');
  } else {
    finishStroke();
    drawingPointerId = null;
    stopDrawSound(true);
    beginCure();
    document.querySelector('.ls-hint')?.classList.add('is-gone');
  }
}

function onPointerMove(event) {
  if (baselineMode) {
    if (drawMode && isDrawing) continueStroke(event.clientX, event.clientY, event.timeStamp);
    return;
  }

  const point = activePointers.get(event.pointerId);
  if (point) {
    point.x = event.clientX;
    point.y = event.clientY;
  }
  if (activePointers.size === 1 && drawingPointerId === event.pointerId && isDrawing) {
    continueStroke(event.clientX, event.clientY, event.timeStamp);
    updateDrawSound(currentSize);
  }
}

function onPointerUp(event) {
  if (baselineMode) {
    finishStroke();
    return;
  }

  const wasDrawing = drawingPointerId === event.pointerId;
  activePointers.delete(event.pointerId);
  if (wasDrawing) {
    finishStroke();
    drawingPointerId = null;
    stopDrawSound(true);
    beginCure();
  }
}

function beginStroke(clientX, clientY, timeStamp) {
  getPointerCoords(clientX, clientY);
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(wallPlane, intersectionPoint);

  currentSize = 1;
  painter.moveTo(intersectionPoint);
  lastPosition.copy(intersectionPoint);
  lastTime = timeStamp;
  isDrawing = true;
}

function continueStroke(clientX, clientY, timeStamp) {
  if (!isDrawing) return;

  getPointerCoords(clientX, clientY);
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(wallPlane, intersectionPoint);

  const distance = intersectionPoint.distanceTo(lastPosition);
  const timeDelta = timeStamp - lastTime;
  const speed = timeDelta > 0 ? distance / timeDelta : 0;
  const targetSize = Math.min(15, Math.max(1, speed * 1000));

  currentSize += (targetSize - currentSize) * 0.3;
  easedPosition.lerpVectors(lastPosition, intersectionPoint, 0.7);

  currentColor.setHSL(timeStamp * 0.001 % 1, 1, 0.5);
  painter.setColor(currentColor);
  painter.setSize(currentSize);
  painter.lineTo(easedPosition);

  lastPosition.copy(easedPosition);
  lastTime = timeStamp;
  painter.update();
}

function finishStroke() {
  isDrawing = false;
}

function beginCure() {
  if (baselineMode || painter.mesh.geometry.drawRange.count === 0) return;
  cureActive = true;
  cureStartedAt = performance.now();
  setReadout('cured');
}

function clearDrawing() {
  scene.remove(painter.mesh);
  painter.mesh.geometry.dispose();
  painter.mesh.material.dispose();
  painter = new TubePainter();
  painter.mesh.material.roughness = userRoughness;
  painter.mesh.material.metalness = 0.25;
  scene.add(painter.mesh);
  cureActive = false;
  camera.position.set(0, 0, 5);
  controls.target.set(0, 0, 0);
  controls.update();
  setReadout('ready');
  playTone(140, 0.12, 0.02);
}

function cancelGhostDemo() {
  cancelAnimationFrame(demoRaf);
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  document.querySelector('.ls-ghost')?.classList.remove('is-visible', 'is-orbit');
}

function setGhostPosition(selector, x, y) {
  const finger = document.querySelector(selector);
  if (!finger) return;
  finger.style.left = `${x}px`;
  finger.style.top = `${y}px`;
}

function runGhostDemo() {
  if (baselineMode || interacted || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ghost = document.querySelector('.ls-ghost');
  ghost?.classList.add('is-visible');
  const start = performance.now();
  demoFrame = 0;

  const drawDemo = now => {
    if (interacted) return cancelGhostDemo();
    const progress = Math.min(1, (now - start) / 900);
    const totalSamples = 72;
    const targetSample = Math.floor(progress * (totalSamples - 1));
    while (demoFrame <= targetSample) {
      const sampleProgress = demoFrame / (totalSamples - 1);
      const sampleX = innerWidth * (0.19 + sampleProgress * 0.62);
      const sampleY = innerHeight * (0.49 + Math.sin(sampleProgress * Math.PI * 2) * 0.15);
      const sampleTime = start + sampleProgress * 900;
      if (demoFrame === 0) beginStroke(sampleX, sampleY, sampleTime);
      else continueStroke(sampleX, sampleY, sampleTime);
      demoFrame += 1;
    }
    const x = innerWidth * (0.19 + progress * 0.62);
    const y = innerHeight * (0.49 + Math.sin(progress * Math.PI * 2) * 0.15);
    setGhostPosition('.ls-ghost__finger--one', x, y);
    if (progress < 1) {
      demoRaf = requestAnimationFrame(drawDemo);
      return;
    }
    finishStroke();
    beginCure();
    demoTimers.push(setTimeout(runOrbitDemo, 650));
  };

  demoRaf = requestAnimationFrame(drawDemo);
}

function runOrbitDemo() {
  if (interacted) return cancelGhostDemo();
  const ghost = document.querySelector('.ls-ghost');
  ghost?.classList.add('is-orbit');
  const one = '.ls-ghost__finger--one';
  const two = '.ls-ghost__finger--two';
  const start = performance.now();
  const orbit = now => {
    if (interacted) return cancelGhostDemo();
    const progress = Math.min(1, (now - start) / 1200);
    const eased = 1 - Math.pow(1 - progress, 3);
    setGhostPosition(one, innerWidth * (0.42 - eased * 0.08), innerHeight * 0.58);
    setGhostPosition(two, innerWidth * (0.58 + eased * 0.08), innerHeight * 0.58);
    const angle = eased * 0.32;
    camera.position.set(Math.sin(angle) * 5, 0, Math.cos(angle) * 5);
    controls.update();
    if (progress < 1) demoRaf = requestAnimationFrame(orbit);
    else demoTimers.push(setTimeout(() => ghost?.classList.remove('is-visible', 'is-orbit'), 900));
  };
  demoRaf = requestAnimationFrame(orbit);
}

function animate() {
  if (cureActive) {
    const elapsed = performance.now() - cureStartedAt;
    if (elapsed < 240) {
      const progress = elapsed / 240;
      painter.mesh.material.roughness = THREE.MathUtils.lerp(0.32, 0.02, 1 - Math.pow(1 - progress, 3));
    } else if (elapsed < 1140) {
      painter.mesh.material.roughness = THREE.MathUtils.lerp(0.02, userRoughness, (elapsed - 240) / 900);
    } else {
      cureActive = false;
      painter.mesh.material.roughness = userRoughness;
      demoTimers.push(setTimeout(() => setReadout('ready'), 700));
    }
  }
  controls.update();
  postProcessing.render();

  window.__LIGHTSTROKE__ = {
    baselineMode,
    drawMode,
    isDrawing,
    pointerCount: activePointers.size,
    drawCount: painter?.mesh?.geometry?.drawRange?.count || 0,
    roughness: Number((painter?.mesh?.material?.roughness || 0).toFixed(3)),
    metalness: painter?.mesh?.material?.metalness || 0,
    cureActive,
    cameraPosition: camera?.position?.toArray().map(value => Number(value.toFixed(3))) || null,
    renderer: renderer?.domElement?.dataset?.engine || 'three.js webgpu'
  };
}

async function bootstrap() {
  if (forceError && !baselineMode) throw new Error('Forced WebGPU error for QA');
  await init();
}

bootstrap().catch(error => {
  console.error(error);
  window.__LIGHTSTROKE_ERROR__ = error.stack || String(error);
  document.querySelector('.ls-loading')?.remove();
  const screen = document.querySelector('.ls-error');
  if (screen && !baselineMode) screen.hidden = false;
});
