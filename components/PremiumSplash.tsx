import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface PremiumSplashProps {
  durationMs: number;
}

// Memory Cleanup Helper
const disposeSceneObject = (object: THREE.Object3D) => {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();

    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;

    const materials = Array.isArray(material) ? material : [material];
    for (const mat of materials) {
      const anyMaterial = mat as any;
      if (anyMaterial.map) anyMaterial.map.dispose();
      mat.dispose();
    }
  });
};

const ICON_LABELS = ['UI', '3D', 'AI', 'DEV', 'UX', 'GFX', 'WEB'];
const BRAND_BLUE = '#2874f0';
const BRAND_YELLOW = '#ffe500';

// Clean, bright texture for the premium frosted glass cards
const createModernIconTexture = (label: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  // White translucent background
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(20, 20, 472, 472, 80);
  ctx.fill();

  // White glowing border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Draw Text (Brand Blue)
  ctx.fillStyle = BRAND_BLUE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 150px "Inter", "Manrope", sans-serif';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 20;
  ctx.fillText(label, 256, 256 + 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
};

// Soft glowing orbs
const createParticleTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 229, 0, 0.5)'); // Yellow glow
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  return new THREE.CanvasTexture(canvas);
};

export const PremiumSplash: React.FC<PremiumSplashProps> = ({ durationMs }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [progress, setProgress] = useState(0);

  // ---------------------------------------------
  // 3D SCENE SETUP
  // ---------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    // Set Background to Brand Blue
    scene.background = new THREE.Color(BRAND_BLUE);
    scene.fog = new THREE.FogExp2(BRAND_BLUE, 0.035);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 10);

    const renderer = new THREE.WebGLRenderer({ 
        canvas, 
        antialias: true, 
        alpha: true,
        powerPreference: "high-performance" 
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // --- LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(5, 8, 5);
    scene.add(keyLight);

    // Warm Yellow accent light
    const yellowLight = new THREE.PointLight(new THREE.Color(BRAND_YELLOW), 4, 15);
    yellowLight.position.set(-5, -5, 2);
    scene.add(yellowLight);

    const rimLight = new THREE.PointLight(0xffffff, 3, 20);
    scene.add(rimLight);

    // --- OBJECTS ---
    const elementGroup = new THREE.Group();
    scene.add(elementGroup);

    // Premium Frosted White Glass
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.15,
      transmission: 0.95,
      thickness: 1.5,
      ior: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const floatingElements: { mesh: THREE.Mesh, baseX: number, baseY: number, baseZ: number, speed: number, offset: number }[] = [];

    // Add Frosted Geometric Shapes
    const geometries = [
      new THREE.IcosahedronGeometry(0.8, 0),
      new THREE.TorusGeometry(0.9, 0.2, 32, 100),
      new THREE.OctahedronGeometry(0.7, 0),
      new THREE.TorusKnotGeometry(0.7, 0.15, 100, 16)
    ];

    for (let i = 0; i < 12; i++) {
      // Occasional solid white wireframes for contrast
      const wireMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
      });
      
      const mesh = new THREE.Mesh(geometries[i % geometries.length], i % 3 === 0 ? wireMat : glassMaterial);
      
      const baseX = (Math.random() - 0.5) * 22;
      const baseY = (Math.random() - 0.5) * 14;
      const baseZ = (Math.random() - 0.5) * 10 - 2;

      mesh.position.set(baseX, baseY, baseZ);
      
      // Random initial rotation
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      elementGroup.add(mesh);
      floatingElements.push({
        mesh,
        baseX, baseY, baseZ,
        speed: 0.3 + Math.random() * 0.5,
        offset: Math.random() * Math.PI * 2
      });
    }

    // Add UI Cards
    ICON_LABELS.forEach((label, i) => {
      const tex = createModernIconTexture(label);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.1,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      const card = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), mat);
      
      const baseX = (Math.random() - 0.5) * 16;
      const baseY = (Math.random() - 0.5) * 10;
      const baseZ = (Math.random() - 0.5) * 8 - 1;

      card.position.set(baseX, baseY, baseZ);
      elementGroup.add(card);
      floatingElements.push({
        mesh: card,
        baseX, baseY, baseZ,
        speed: 0.4 + Math.random() * 0.4,
        offset: Math.random() * Math.PI * 2
      });
    });

    // --- PARTICLES ---
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i++) {
      particlePos[i] = (Math.random() - 0.5) * 30;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    
    const particleTex = createParticleTexture();
    const particleMat = new THREE.PointsMaterial({
      size: 0.8,
      map: particleTex,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // --- INTERACTION ---
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const handlePointerMove = (event: MouseEvent) => {
      pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.targetY = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let animationFrame = 0;

    const renderFrame = () => {
      const elapsed = clock.getElapsedTime();

      // Smooth pointer lerping
      pointer.x += (pointer.targetX - pointer.x) * 0.05;
      pointer.y += (pointer.targetY - pointer.y) * 0.05;

      rimLight.position.set(pointer.x * 10, pointer.y * 10, 4);

      // Camera Parallax
      camera.position.x = pointer.x * 1.5;
      camera.position.y = pointer.y * 1.5;
      camera.lookAt(0, 0, 0);

      // Rotate Main Group
      elementGroup.rotation.y = Math.sin(elapsed * 0.1) * 0.2;
      elementGroup.rotation.x = Math.cos(elapsed * 0.1) * 0.1;

      // Animate Elements
      floatingElements.forEach((f) => {
        const wave = elapsed * f.speed + f.offset;
        f.mesh.position.x = f.baseX + Math.sin(wave) * 0.5;
        f.mesh.position.y = f.baseY + Math.cos(wave * 0.8) * 0.5;
        f.mesh.position.z = f.baseZ + Math.sin(wave * 0.5) * 0.5;
        
        f.mesh.rotation.x += 0.005;
        f.mesh.rotation.y += 0.01;
      });

      // Particles flow upwards
      particles.rotation.y = elapsed * 0.02;
      const positions = particles.geometry.attributes.position.array as Float32Array;
      for (let i = 1; i < particleCount * 3; i += 3) {
        positions[i] += 0.015;
        if (positions[i] > 15) positions[i] = -15; 
      }
      particles.geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      disposeSceneObject(elementGroup);
      particleGeo.dispose();
      particleMat.dispose();
      particleTex.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, []);

  // ---------------------------------------------
  // PROGRESS BAR LOGIC
  // ---------------------------------------------
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const availableDuration = Math.max(260, durationMs - 100);
    const progressDuration = Math.min(availableDuration, Math.max(260, Math.round(durationMs * 0.9)));

    const tick = (now: number) => {
      const elapsed = now - start;
      const ratio = Math.min(1, Math.max(0, elapsed / progressDuration));
      const eased = 1 - Math.pow(1 - ratio, 3); // Smooth ease out
      setProgress(Math.round(eased * 100));
      
      if (ratio < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        setProgress(100);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [durationMs]);

  const loadingPhase =
    progress < 30 ? 'Authenticating Access...' :
    progress < 60 ? 'Unpacking Premium Assets...' :
    progress < 90 ? 'Rendering Environment...' :
    'Welcome to DIGi QuRY';

  const splashStyle = {
    ['--premium-splash-duration' as any]: `${durationMs}ms`,
  } as React.CSSProperties;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#2874f0] overflow-hidden select-none" style={splashStyle}>
      
      {/* Dynamic Radial Gradient over the Blue to give it depth */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.15)_0%,transparent_60%)] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(255,229,0,0.1)_0%,transparent_50%)] pointer-events-none"></div>

      {/* 3D Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {/* UI Overlay - Modern & Centered */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 pointer-events-none z-10">
        
        <div className="flex flex-col items-center w-full max-w-sm mt-12">
            
            {/* Logo Wrapper */}
            <div className="relative mb-12 flex items-start gap-1">
              <h1 className="text-6xl md:text-7xl font-black text-white tracking-tighter italic drop-shadow-2xl">
                DIGi QuRY
              </h1>
            </div>
            
            {/* Loading HUD */}
            <div className="w-full bg-white/10 border border-white/20 backdrop-blur-md p-6 rounded-3xl shadow-2xl">
                <div className="flex justify-between items-end mb-3">
                    <span className="text-[10px] md:text-xs font-bold text-white/90 uppercase tracking-widest flex items-center gap-2">
                        <i className="fas fa-circle-notch fa-spin text-[#ffe500]"></i> {loadingPhase}
                    </span>
                    <span className="text-3xl font-light text-white tracking-tight">
                        {progress}<span className="text-[#ffe500] text-lg font-bold">%</span>
                    </span>
                </div>

                {/* Sleek Progress Bar */}
                <div className="h-1.5 w-full bg-black/20 rounded-full overflow-hidden relative border border-white/10">
                    <div 
                        className="h-full bg-white rounded-full transition-all duration-100 ease-out relative"
                        style={{ width: `${progress}%`, boxShadow: '0 0 10px rgba(255,255,255,0.8)' }}
                    >
                        {/* Yellow Glint */}
                        <div className="absolute right-0 top-0 w-4 h-full bg-[#ffe500] blur-[2px]"></div>
                    </div>
                </div>
            </div>
            
        </div>
      </div>
      
      <style>{`
        .premium-splash-shell {
          animation: fadeOutSplash 0.6s cubic-bezier(0.8, 0, 0.2, 1) forwards;
          animation-delay: calc(var(--premium-splash-duration) - 600ms);
        }
        @keyframes fadeOutSplash {
          0% { opacity: 1; transform: scale(1); filter: blur(0px); }
          100% { opacity: 0; transform: scale(1.05); filter: blur(10px); pointer-events: none; }
        }
      `}</style>
    </div>
  );
};
