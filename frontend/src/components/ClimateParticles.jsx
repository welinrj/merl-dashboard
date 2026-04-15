// Three.js animated climate monitoring network — login background
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ClimateParticles() {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth, H = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
    camera.position.set(0, 0, 50);

    // ── Particles ──────────────────────────────────────────────
    const N = 90;
    const positions = [], velocities = [], sizes = [];
    const colorsArr = [];

    const gold  = new THREE.Color('#d4a843');
    const white = new THREE.Color('#ffffff');
    const green = new THREE.Color('#4aab82');

    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 80;
      const y = (Math.random() - 0.5) * 60;
      const z = (Math.random() - 0.5) * 20;
      positions.push(x, y, z);
      velocities.push(
        (Math.random() - 0.5) * 0.015,
        (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.005
      );
      sizes.push(Math.random() * 1.8 + 0.6);
      // mix of colors
      const c = Math.random() < 0.3 ? gold : Math.random() < 0.5 ? green : white;
      colorsArr.push(c.r, c.g, c.b);
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.Float32BufferAttribute(positions, 3);
    const colAttr = new THREE.Float32BufferAttribute(colorsArr, 3);
    const sizAttr = new THREE.Float32BufferAttribute(sizes, 1);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colAttr);
    geo.setAttribute('size', sizAttr);

    // Circular texture for particles
    const canvas2d = document.createElement('canvas');
    canvas2d.width = canvas2d.height = 64;
    const ctx = canvas2d.getContext('2d');
    const grad = ctx.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,64,64);
    const tex = new THREE.CanvasTexture(canvas2d);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uTime: { value: 0 } },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uTime;
        void main() {
          vColor = color;
          vec3 pos = position;
          float pulse = sin(uTime * 1.2 + pos.x * 0.3 + pos.y * 0.2) * 0.15 + 1.0;
          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * pulse * (300.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec3 vColor;
        void main() {
          float a = texture2D(uTex, gl_PointCoord).r;
          if (a < 0.05) discard;
          gl_FragColor = vec4(vColor, a * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // ── Lines between nearby nodes ──────────────────────────────
    const lineGeo = new THREE.BufferGeometry();
    const linePositions = new Float32Array(N * N * 6);
    const lineColors    = new Float32Array(N * N * 6);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color',    new THREE.BufferAttribute(lineColors, 3));
    const lineMat = new THREE.LineSegmentsMaterial({ vertexColors: true, transparent: true, opacity: 0.18, depthWrite: false });
    const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lineSegments);

    // ── Animate ─────────────────────────────────────────────────
    let frame;
    const DIST = 22;
    let t = 0;

    const animate = () => {
      frame = requestAnimationFrame(animate);
      t += 0.004;
      mat.uniforms.uTime.value = t;

      const pos = posAttr.array;
      const vel = velocities;
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        pos[ix]   += vel[ix];
        pos[ix+1] += vel[ix+1];
        pos[ix+2] += vel[ix+2];
        if (Math.abs(pos[ix])   > 42) vel[ix]   *= -1;
        if (Math.abs(pos[ix+1]) > 32) vel[ix+1] *= -1;
        if (Math.abs(pos[ix+2]) > 12) vel[ix+2] *= -1;
      }
      posAttr.needsUpdate = true;

      // Update connection lines
      let lIdx = 0;
      const lp = linePositions, lc = lineColors;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const ix = i*3, jx = j*3;
          const dx = pos[ix]-pos[jx], dy = pos[ix+1]-pos[jx+1], dz = pos[ix+2]-pos[jx+2];
          const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
          if (d < DIST && lIdx < linePositions.length - 5) {
            const alpha = (1 - d/DIST) * 0.6;
            lp[lIdx]=pos[ix]; lp[lIdx+1]=pos[ix+1]; lp[lIdx+2]=pos[ix+2];
            lp[lIdx+3]=pos[jx]; lp[lIdx+4]=pos[jx+1]; lp[lIdx+5]=pos[jx+2];
            for (let k = 0; k < 6; k++) lc[lIdx+k] = k < 3 ? alpha : alpha;
            lIdx += 6;
          }
        }
      }
      for (let k = lIdx; k < linePositions.length; k++) { lp[k]=0; lc[k]=0; }
      lineGeo.attributes.position.needsUpdate = true;
      lineGeo.attributes.color.needsUpdate = true;

      // Gentle scene rotation
      scene.rotation.y = Math.sin(t * 0.12) * 0.06;
      scene.rotation.x = Math.sin(t * 0.09) * 0.03;

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={mountRef} style={{ position:'absolute', inset:0, pointerEvents:'none' }} />
  );
}
